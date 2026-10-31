// Make video: one episode from script to finished video, tab by tab, as in Influencer Studio's
// Make video: Script, Mode & look, Rehearsal, Voices & cost, Shots, Final. Every run goes
// through runItems, which asks before any voice spend and opens the live view.
import { el, hint, api, ctx, episodesOf, pill, charName, langLabel, dialog, voicedLines, textOf, route, runItems, stepChips, whatNext, fold } from "../app.js";
import { renderOutfit } from "../sheets.js";
import { renderScene } from "../scenes.js";
import { mountPlayer } from "../rehearsal.js";

const TABS = [["script", "Script"], ["look", "Mode & look"], ["rehearsal", "Rehearsal"], ["voices", "Voices & cost"], ["shots", "Shots"], ["final", "Final"]];
const stamp = () => `?v=${Date.now()}`;

export async function render(main, { args }) {
  const [slug, tab0] = args;
  if (!slug) return pick(main);
  const e = ctx.data.episodes.find((x) => x.slug === slug);
  if (!e) {
    main.append(el("p", {}, "No such episode. ", el("a", { href: "#/make" }, "Back to Make video")));
    return;
  }
  const ep = e.episode;
  const done = {
    script: ep.state === "approved",
    voices: ep.languages.every((g) => e.langs[g]?.estimate?.ok && e.langs[g].estimate.toGenerate === 0),
    shots: ep.languages.every((g) => e.langs[g]?.frames?.length),
    final: ep.languages.every((g) => e.langs[g]?.render),
  };
  const tab = TABS.some(([k]) => k === tab0) ? tab0 : !done.script ? "script" : !done.voices ? "voices" : "final";
  main.append(
    el("p", { class: "note" }, el("a", { href: "#/make" }, "← Make video")),
    el("div", { class: "row" }, el("h1", { class: "grow", style: "margin:0" }, ep.title), pill(ep.state), pill("", `${ctx.data.modes[ep.mode].name} · ${ctx.data.modes[ep.mode].scenarios?.[ep.scenario || ctx.data.modes[ep.mode].defaultScenario]?.name || ""}`),
      el("span", { class: "note" }, `${ep.languages.map((g) => g.toUpperCase()).join(" + ")} · ${ep.cast.map(charName).join(", ")}`)),
    el("div", { class: "tabs" }, ...TABS.map(([k, label]) => el("a", { class: `tab${k === tab ? " on" : ""}${done[k] ? " done" : ""}`, href: `#/make/${slug}/${k}` }, label))),
  );
  const body = el("div");
  main.append(body);
  return (await PAGES[tab](body, e)) || null;
}

function pick(main) {
  const eps = episodesOf(ctx.influencer);
  main.append(
    el("div", { class: "row" }, el("h1", { class: "grow" }, "Make video"), el("a", { class: "btn", href: "#/scripts/new" }, "+ New script")),
    hint("Pick an episode. Each one goes Script, Mode & look, Rehearsal (a free preview with estimated timing), Voices & cost (the only step that spends, and it asks first), Shots (stills of every shot) and Final (the render)."),
  );
  if (!eps.length) main.append(el("div", { class: "empty" }, "No episodes yet for this influencer. Start with a new script."));
  const card = (e) => {
    const g = e.episode.languages.find((x) => whatNext(e, x).needs) || e.episode.languages[0];
    const next = whatNext(e, g);
    const L = Object.values(e.langs).find((x) => x.thumb) || {};
    return el("a", { class: "card vcard", href: `#/make/${e.slug}` },
      L.thumb ? el("img", { src: "/" + L.thumb }) : el("div", { class: "thumb", style: "width:76px;height:135px;border-radius:9px;background:hsl(var(--muted))" }),
      el("div", { class: "grow" }, el("b", {}, e.episode.title),
        el("div", { class: "row", style: "gap:6px;margin:4px 0" }, pill(e.episode.state), el("span", { class: "note" }, `${e.episode.mode} mode`)),
        el("div", { class: "note" }, `${voicedLines(e).length} lines · ${e.episode.languages.join(" + ").toUpperCase()}`),
        el("div", { class: "note", style: "margin-top:6px;color:hsl(var(--foreground));font-weight:600" }, next.needs ? `Next: ${next.label}` : "Finished")));
  };
  const open = eps.filter((e) => e.episode.languages.some((g) => whatNext(e, g).needs));
  const done = eps.filter((e) => !open.includes(e));
  if (eps.length && !open.length) main.append(el("div", { class: "empty" }, "Nothing in progress. Start with a new script."));
  if (open.length) main.append(el("div", { class: "cards-v" }, open.map(card)));
  if (done.length) main.append(el("div", { style: "margin-top:18px" }, fold("Finished episodes", done.length, false, el("div", { class: "cards-v" }, done.map(card)))));
}

const blocked = (e) => (e.episode.state === "approved" ? null : el("div", { class: "card row", style: "border-color:hsl(var(--warning));margin-bottom:12px" },
  el("span", { class: "grow" }, "The script is not approved yet. Voices, stills and renders wait for that approval."),
  el("a", { class: "btn small", href: `#/scripts/${e.slug}` }, "Open the script")));

const PAGES = {
  // ---------------------------------------------------------------- Script
  async script(body, e) {
    const ep = e.episode, langs = ep.languages;
    const lines = e.script.lines || [];
    body.append(hint("The script as it will be made. Edit it in Scripts; approve it here or there. Approval is the go-ahead for voices, and the voice cost is still asked before anything is spent."));
    if (e.script.outline) body.append(el("div", { class: "card", style: "margin-bottom:12px" }, el("label", { class: "f", style: "margin-top:0" }, "Outline"), el("p", {}, e.script.outline)));
    const row = el("div", { class: "row", style: "margin-bottom:10px" }, el("a", { class: "btn", href: `#/scripts/${e.slug}` }, lines.length ? "Edit script" : "Write the script"));
    if (lines.length && ep.state !== "approved") {
      row.append(el("button", { class: "ghost", onclick: async () => {
        const voiced = lines.filter((l) => l.silent == null);
        const gaps = langs.filter((g) => voiced.some((l) => !textOf(l.say, g).trim()));
        if (gaps.length) {
          await dialog(`<h3>Not ready to approve</h3><p>Some lines have no ${gaps.map((g) => g.toUpperCase()).join(" or ")} text yet.</p>`, [["Close", "x", "ghost"]]);
          return;
        }
        if ((await dialog("<h3>Approve this script?</h3><p>Voices can be made after this. The cost is shown and asked first.</p>", [["Cancel", "x", "ghost"], ["Approve", "go"]])) !== "go") return;
        await api.saveMeta(e.slug, { state: "approved" });
        route();
      } }, "Approve script"));
    }
    body.append(row);
    if (!lines.length) {
      body.append(el("div", { class: "empty" }, "No lines yet."));
      return;
    }
    const t = el("table", {}, el("tr", {}, el("th", {}, "#"), el("th", {}, "Who"), el("th", {}, "Feeling"), el("th", {}, "Camera"), ...langs.map((g) => el("th", {}, langLabel(g)))));
    lines.forEach((l, i) => {
      const cam = l.camera && typeof l.camera === "object" ? `${l.camera.type}${l.camera.on ? " · " + l.camera.on : ""}${l.camera.with ? " + " + l.camera.with : ""}` : l.camera || "auto";
      if (l.silent != null) {
        t.append(el("tr", {}, el("td", { class: "mono" }, i + 1), el("td", { class: "note" }, `silent ${l.silent} s`),
          el("td", { class: "note" }, Object.entries(l.emotions || {}).map(([k, v]) => `${charName(k)}: ${v}`).join(", ")), el("td", { class: "mono" }, cam), ...langs.map(() => el("td", {}, ""))));
        return;
      }
      t.append(el("tr", {}, el("td", { class: "mono" }, i + 1), el("td", {}, charName(l.who), l.to ? el("span", { class: "note" }, ` → ${charName(l.to)}`) : null),
        el("td", {}, l.emotion || el("span", { class: "note" }, "as before")), el("td", { class: "mono" }, cam),
        ...langs.map((g) => el("td", {}, textOf(l.say, g) || el("span", { style: "color:hsl(var(--destructive))" }, "missing"),
          l.caption?.[g] ? el("div", { class: "note" }, `caption: ${l.caption[g]}`) : null))));
    });
    body.append(el("div", { class: "card", style: "padding:6px 12px" }, t));
  },

  // ---------------------------------------------------------------- Mode & look
  async look(body, e) {
    const ep = e.episode, slug = e.slug;
    const save = async (patch) => {
      const res = await api.saveMeta(slug, patch);
      if (res.error) await dialog(`<h3>Not saved</h3><p>${res.error}</p>`, [["Close", "x", "ghost"]]);
      route();
    };
    body.append(hint("The mode is the set, the lens, the camera grammar, the captions and the sound. Outfits here apply to this episode only; the default outfit of a character is set on Cast."));
    body.append(el("h2", { style: "margin-top:0" }, "Mode"));
    const modes = el("div", { class: "cards-v" });
    for (const m of ctx.data.studio.modes) {
      const info = ctx.data.modes[m];
      modes.append(el("div", { class: "card", style: `cursor:pointer;${m === ep.mode ? "border:2px solid hsl(var(--primary))" : ""}`, onclick: () => m !== ep.mode && save({ mode: m }) },
        el("div", { class: "row" }, el("b", { class: "grow" }, `${info.name} mode`), m === ep.mode ? pill("done", "in use") : null),
        el("p", { class: "note" }, info.summary), el("p", { class: "note" }, `Best for: ${info.spec?.["Best for"] || ""}`)));
    }
    body.append(modes, el("p", { class: "note" }, "Switching mode keeps the script. Shots named for the other mode are flagged when the script is saved."));

    const md = ctx.data.modes[ep.mode];
    const current = ep.scenario || md.defaultScenario;
    body.append(el("h2", {}, "Scenario"), hint("Where the scene happens: the set, its light and what is around the cast. Drawn here with this episode's cast and outfits."));
    const scs = el("div", { class: "cards-v", style: "grid-template-columns:repeat(auto-fill,minmax(250px,1fr))" });
    for (const [id, sc] of Object.entries(md.scenarios || {})) {
      const img = el("img", { alt: sc.name });
      renderScene({ mode: ep.mode, scenario: id, lead: ep.lead, cast: ep.cast, camera: "wide", variants: ep.variants || {} }).then((u) => (img.src = u));
      scs.append(el("div", { class: "card vcard", style: `cursor:pointer;${id === current ? "border:2px solid hsl(var(--primary))" : ""}`, onclick: () => id !== current && save({ scenario: id }) },
        img, el("div", { class: "grow" }, el("div", { class: "row", style: "gap:6px" }, el("b", { class: "grow" }, sc.name), id === current ? pill("done", "in use") : null),
          el("p", { class: "note", style: "margin:4px 0" }, sc.summary))));
    }
    body.append(scs);

    const endNow = ep.ending || md.timing?.ending || "hold";
    body.append(el("h2", {}, "Ending"), hint("How the last shot ends. Hold: the closing wide stays on screen to the last frame. Fade: it fades to black over 0.7 s and holds black for 0.2 s, for a harder ending."),
      el("div", { class: "pills" }, ...[["hold", "Hold on the last wide"], ["fade", "Fade to black"]].map(([v, label]) =>
        el("button", { class: `pillbtn${v === endNow ? " on" : ""}`, onclick: () => v !== endNow && save({ ending: v }) }, label))));

    body.append(el("h2", {}, "Cast"));
    const speaking = new Set((e.script.lines || []).map((l) => l.who));
    const cast = el("div", { class: "row" }, el("label", { class: "row", style: "gap:6px" }, el("input", { type: "checkbox", checked: true, disabled: true }), `${charName(ep.lead)} (lead)`));
    for (const a of ctx.data.agents) {
      const cb = el("input", { type: "checkbox", checked: ep.cast.includes(a), disabled: speaking.has(a) });
      cb.onchange = () => save({ agents: ctx.data.agents.filter((x) => (x === a ? cb.checked : ep.cast.includes(x))) });
      cast.append(el("label", { class: "row", style: "gap:6px", title: speaking.has(a) ? "has lines in the script" : "" }, cb, charName(a), speaking.has(a) ? el("span", { class: "note" }, "(has lines)") : null));
    }
    body.append(cast);

    body.append(el("h2", {}, "Languages"));
    const langs = el("div", { class: "row" });
    for (const l of ctx.data.studio.languages) {
      const cb = el("input", { type: "checkbox", checked: ep.languages.includes(l.id) });
      cb.onchange = () => {
        const next = ctx.data.studio.languages.map((x) => x.id).filter((x) => (x === l.id ? cb.checked : ep.languages.includes(x)));
        if (!next.length) {
          cb.checked = true;
          return;
        }
        save({ languages: next });
      };
      langs.append(el("label", { class: "row", style: "gap:6px" }, cb, l.label));
    }
    body.append(langs);

    for (const cid of ep.cast) {
      const c = ctx.data.characters[cid];
      if (!c?.variants?.length) continue;
      const chosen = ep.variants?.[cid] || "";
      body.append(el("h2", {}, `${c.name}: look in this episode`));
      const grid = el("div", { class: "outfits" });
      const card = (v, label, img) => {
        const pic = el("img", { alt: label });
        const box = el("div", { class: `outfit${v === chosen ? " on" : ""}`, onclick: () => v !== chosen && save({ variants: { ...(ep.variants || {}), [cid]: v || null } }) }, pic, el("div", { class: "note" }, label));
        renderOutfit(cid, img).then((u) => (pic.src = u));
        return box;
      };
      grid.append(card("", `Default (${c.outfits?.[c.variant] || c.variant})`, c.variant));
      for (const v of c.variants) grid.append(card(v, c.outfits?.[v] || v, v));
      body.append(grid);
    }
  },

  // ---------------------------------------------------------------- Rehearsal
  async rehearsal(body, e) {
    const ep = e.episode;
    if (!voicedLines(e).length) {
      body.append(el("div", { class: "empty" }, "Write a few lines first, then rehearse them here."));
      return;
    }
    let lang = ep.languages[0];
    let player = null;
    const pills = el("div", { class: "pills" });
    const note = el("p", { class: "note" });
    const host = el("div");
    body.append(hint("A free preview, drawn live by the same engine as the final render. Lines with no voice yet run on estimated timing (about 14.5 characters a second) and play silent; lines with a voice take play it. Click a shot in the list to jump there."), pills, note, host);
    async function load() {
      pills.innerHTML = "";
      for (const g of ep.languages) pills.append(el("button", { class: `pillbtn${g === lang ? " on" : ""}`, onclick: () => ((lang = g), load()) }, langLabel(g)));
      player?.dispose();
      player = null;
      host.innerHTML = "";
      note.textContent = "Building the timeline…";
      const TL = await api.rehearsal(e.slug, lang);
      if (TL.error) {
        note.textContent = "";
        host.append(el("div", { class: "card", style: "border-color:hsl(var(--destructive))" }, el("b", {}, "The timeline could not be built"), el("p", { class: "note" }, TL.error)));
        return;
      }
      const est = TL.lines.filter((l) => l.estimated).length;
      note.textContent = `${TL.end.toFixed(1)} s · ${TL.shots.length} shots · ${est ? `${est} of ${TL.lines.length} lines on estimated timing` : "every line uses its voice take"}`;
      player = await mountPlayer(host, { TL, slug: e.slug, captions: ctx.data.modes[ep.mode].captions });
    }
    await load();
    return () => player?.dispose();
  },

  // ---------------------------------------------------------------- Voices & cost
  async voices(body, e) {
    const ep = e.episode;
    const b = blocked(e);
    if (b) body.append(b);
    body.append(hint("Voices are made with ElevenLabs, one take per line and language, and cached: a run only pays for lines that are new or changed. The characters below are what a run would spend. You approve the amount before it runs."));
    const cast = el("table", {}, el("tr", {}, el("th", {}, "Character"), ...ep.languages.map((g) => el("th", {}, `Voice · ${langLabel(g)}`))));
    for (const cid of ep.cast) {
      const c = ctx.data.characters[cid];
      cast.append(el("tr", {}, el("td", {}, c?.name || cid), ...ep.languages.map((g) => {
        const v = c?.voices?.[g];
        return el("td", {}, v?.name || el("span", { class: "st needs-approval" }, `to pick: ${(v?.candidates || []).join(" or ") || "none"}`));
      })));
    }
    body.append(el("div", { class: "card", style: "padding:6px 12px;margin-bottom:12px" }, cast));
    const all = ep.languages.map((g) => ({ g, est: e.langs[g]?.estimate }));
    const todo = all.filter((x) => x.est?.ok && x.est.toGenerate > 0);
    if (todo.length > 1) {
      body.append(el("div", { class: "row", style: "margin-bottom:12px" },
        el("button", { disabled: !!b, onclick: () => runItems(todo.map((x) => ({ episode: e.slug, lang: x.g })), "voices", `${ep.title}: voices`) },
          `Make all voices (${todo.reduce((n, x) => n + x.est.characters, 0)} characters)`)));
    }
    const grid = el("div", { class: "cards-v" });
    for (const { g, est } of all) {
      const card = el("div", { class: "card" }, el("div", { class: "row" }, el("b", { class: "grow" }, langLabel(g)), stepChips(e.status[g])));
      if (!est) card.append(el("p", { class: "note" }, "No lines yet."));
      else if (!est.ok) card.append(el("p", { style: "color:hsl(var(--destructive))" }, est.error));
      else {
        card.append(el("p", {}, el("b", {}, `${est.characters} characters`), ` to make: ${est.toGenerate} of ${est.lines} lines. `,
          el("span", { class: "note" }, `Whole script ${est.totalCharacters} characters · spent so far ${e.spend.byLang?.[g] || 0}`)));
        if (est.missing.length) {
          card.append(el("table", {}, el("tr", {}, el("th", {}, "Line"), el("th", {}, "Who"), el("th", {}, "Voice"), el("th", {}, "Chars")),
            ...est.missing.map((m) => el("tr", {}, el("td", { class: "mono" }, m.id), el("td", {}, charName(m.who)), el("td", {}, m.voice), el("td", { class: "mono" }, m.chars)))));
          card.append(el("button", { disabled: !!b, onclick: () => runItems([{ episode: e.slug, lang: g }], "voices", `${ep.title} ${g}: voices`) }, `Make ${g.toUpperCase()} voices`));
        } else card.append(el("p", { class: "note" }, "Every line has its voice. Nothing to spend."));
      }
      grid.append(card);
    }
    body.append(grid);
  },

  // ---------------------------------------------------------------- Shots
  async shots(body, e) {
    const ep = e.episode;
    const b = blocked(e);
    if (b) body.append(b);
    body.append(hint("One still from the middle of every shot, captured by HyperFrames from the real build: the fastest way to check framing, cuts and captions before a full render. Making stills also makes any missing voices, so the cost is asked first if there is any."));
    for (const g of ep.languages) {
      const L = e.langs[g] || {};
      const card = el("div", { class: "card", style: "margin-bottom:14px" },
        el("div", { class: "row" }, el("h3", { class: "grow", style: "margin:0" }, langLabel(g)), stepChips(e.status[g]),
          el("button", { class: "small", disabled: !!b, onclick: () => runItems([{ episode: e.slug, lang: g }], "preview", `${ep.title} ${g}: stills`) }, "Make stills")));
      if (L.frames?.length) {
        card.append(el("div", { class: "frames", style: "margin-top:12px" }, ...L.frames.map((f) => el("figure", {}, el("img", { src: "/" + f.file + stamp(), loading: "lazy" }),
          el("figcaption", {}, `${f.n} · ${f.camera}${f.on ? " " + f.on : ""}`)))));
      } else card.append(el("div", { class: "empty", style: "margin-top:12px" }, "No stills yet."));
      if (L.timeline) {
        card.append(el("details", { style: "margin-top:10px" }, el("summary", { class: "note", style: "cursor:pointer" }, `Shot plan · ${L.timeline.end.toFixed(2)} s · ${L.timeline.shots.length} shots`),
          el("table", {}, el("tr", {}, el("th", {}, "Shot"), el("th", {}, "Time"), el("th", {}, "Camera"), el("th", {}, "Speaker")),
            ...L.timeline.shots.map((s) => el("tr", {}, el("td", { class: "mono" }, s.n), el("td", { class: "mono" }, `${s.start.toFixed(2)} to ${s.end.toFixed(2)}`),
              el("td", { class: "mono" }, `${s.camera.type}${s.camera.on ? " · " + s.camera.on : ""}`), el("td", {}, s.speaker ? charName(s.speaker) : el("span", { class: "note" }, "silent")))))));
      }
      body.append(card);
    }
  },

  // ---------------------------------------------------------------- Final
  async final(body, e) {
    const ep = e.episode;
    const b = blocked(e);
    if (b) body.append(b);
    body.append(hint("The render is 1080 × 1920 at 30 fps from the same build the stills come from, then checked: size, frame rate, length and loudness, plus a sheet of frames read back from the MP4. Voices and render runs every step and asks about the voice cost first."));
    const items = ep.languages.map((g) => ({ episode: e.slug, lang: g }));
    body.append(el("div", { class: "row", style: "margin-bottom:12px" },
      el("button", { disabled: !!b, onclick: () => runItems(items, "all", `${ep.title}: voices and render`) }, `Voices and render · ${ep.languages.map((g) => g.toUpperCase()).join(" + ")}`)));
    const grid = el("div", { class: "cards-v", style: "grid-template-columns:repeat(auto-fill,minmax(320px,1fr))" });
    for (const g of ep.languages) {
      const L = e.langs[g] || {};
      const st = e.status[g] || {};
      const v = st.verify?.result;
      const failed = Object.entries(st).find(([, x]) => x?.state === "failed");
      const card = el("div", { class: "card" }, el("div", { class: "row" }, el("b", { class: "grow" }, langLabel(g)),
        el("button", { class: "small ghost", disabled: !!b, onclick: () => runItems([{ episode: e.slug, lang: g }], "render", `${ep.title} ${g}: render`) }, "Render")),
        el("div", { style: "margin:8px 0" }, stepChips(st)));
      if (failed) card.append(el("p", { style: "color:hsl(var(--destructive))" }, `${failed[0]} failed: ${failed[1].error || "see the run log"}`));
      if (L.render) {
        card.append(el("video", { src: "/" + L.render + stamp(), controls: true, playsinline: true, preload: "metadata" }),
          el("p", { class: "note mono" }, v ? `${v.width}×${v.height} · ${v.fps} fps · ${v.seconds} s · ${v.lufs} LUFS · peak ${v.peak} dBFS` : "", el("br"), L.renderedAt || ""),
          el("p", { class: "note mono" }, `episodes/${e.slug}/renders/${e.slug}-${g}.mp4`));
        if (L.renderSheet) card.append(el("details", {}, el("summary", { class: "note", style: "cursor:pointer" }, "Frames read back from the MP4"), el("img", { src: "/" + L.renderSheet + stamp(), style: "width:100%;border-radius:8px;margin-top:6px" })));
      } else card.append(el("div", { class: "empty" }, "Not rendered yet."));
      grid.append(card);
    }
    body.append(grid);
  },
};
