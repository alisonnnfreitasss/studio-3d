// Scripts: the library of this influencer's episodes, and the script editor. A script is a list
// of lines (who says what to whom, the feeling, the shot) in every language of the episode, plus
// silent beats. It saves to episodes/<slug>/script.json and the server checks it on every save.
// Edits not saved yet are kept in this browser, so leaving the page never loses them.
import { el, hint, api, ctx, episodesOf, pill, charName, langLabel, dialog, voicedLines, textOf, route } from "../app.js";
import { loadModel } from "../sheets.js";

const AIMED = ["cu", "full", "side", "two"]; // shot types that point at a character

export async function render(main, { args }) {
  if (args[0] && args[0] !== "new") return editor(main, args[0]);
  library(main);
  if (args[0] === "new") newScript();
}

// ---------------------------------------------------------------- library

function library(main) {
  const eps = episodesOf(ctx.influencer);
  main.append(
    el("div", { class: "row" }, el("h1", { class: "grow" }, "Scripts"), el("button", { onclick: () => newScript() }, "+ New script")),
    hint("Every video starts as a script: the lines in each language, who says them to whom, how they feel and which shot. Ideas become drafts when the first line is written; an approved script is the go-ahead to make voices, and the voice cost is still asked before anything is spent."),
  );
  const filters = [["open", "In progress"], ["approved", "Approved"], ["all", "All"]];
  let f = eps.some((e) => e.episode.state !== "approved") ? "open" : "all";   // what is still in progress first
  const pills = el("div", { class: "pills" });
  const list = el("div", { class: "card", style: "padding:0 16px" });
  main.append(pills, list);
  const draw = () => {
    pills.innerHTML = "";
    for (const [k, label] of filters) {
      const n = eps.filter((e) => k === "all" || (k === "open" ? e.episode.state !== "approved" : e.episode.state === k)).length;
      pills.append(el("button", { class: `pillbtn${k === f ? " on" : ""}`, onclick: () => ((f = k), draw()) }, `${label} (${n})`));
    }
    list.innerHTML = "";
    const shown = eps.filter((e) => f === "all" || (f === "open" ? e.episode.state !== "approved" : e.episode.state === f));
    if (!shown.length) list.append(el("div", { class: "empty", style: "margin:16px 0" }, "No scripts here yet."));
    for (const e of shown) {
      const ep = e.episode;
      const n = voicedLines(e).length;
      const L = Object.values(e.langs).find((x) => x.thumb) || {};
      const secs = Object.values(e.langs).find((x) => x.timeline)?.timeline.end;
      list.append(el("a", { class: "video-row", href: `#/scripts/${e.slug}` },
        L.thumb ? el("img", { class: "thumb", src: "/" + L.thumb }) : el("div", { class: "thumb" }),
        el("div", { class: "grow" },
          el("div", { class: "t" }, ep.title),
          el("div", { class: "row", style: "gap:6px;margin-top:4px" }, pill(ep.state),
            el("span", { class: "note" }, `${ep.mode} mode · ${ep.languages.join(" + ").toUpperCase()} · ${n} lines${secs ? ` · ${secs.toFixed(0)} s` : ""} · ${ep.cast.map(charName).join(", ")}`)),
          !n && e.script.outline ? el("div", { class: "note", style: "margin-top:4px" }, e.script.outline.length > 180 ? e.script.outline.slice(0, 180) + "…" : e.script.outline) : null),
        el("span", { class: "go" }, n ? "Edit →" : "Write →")));
    }
  };
  draw();
}

async function newScript() {
  const st = ctx.data.studio;
  const title = el("input", { placeholder: "Here we go again" });
  const mode = el("select", {}, ...st.modes.map((m) => el("option", { value: m }, `${ctx.data.modes[m].name} mode: ${ctx.data.modes[m].summary}`)));
  const agents = ctx.data.agents.map((a) => el("input", { type: "checkbox", value: a, checked: a === "claude" }));
  const langs = st.languages.map((l) => el("input", { type: "checkbox", value: l.id, checked: true }));
  const outline = el("textarea", { rows: 4, placeholder: "The joke in two or three sentences: the setup, the turn, the button." });
  const box = el("div", {},
    el("h3", { style: "margin-top:0" }, "New script"),
    el("p", { class: "note" }, `Lead: ${charName(ctx.influencer)}. Everything here can be changed later.`),
    el("label", { class: "f" }, "Title"), title,
    el("label", { class: "f" }, "Mode"), mode,
    el("label", { class: "f" }, "Agents in the cast"), el("div", { class: "row" }, ...agents.map((cb) => el("label", { class: "row", style: "gap:6px" }, cb, charName(cb.value)))),
    el("label", { class: "f" }, "Languages"), el("div", { class: "row" }, ...langs.map((cb, i) => el("label", { class: "row", style: "gap:6px" }, cb, st.languages[i].label))),
    el("label", { class: "f" }, "Outline"), outline);
  const ans = await dialog(box, [["Cancel", "cancel", "ghost"], ["Create script", "go"]]);
  if (ans !== "go") {
    if (location.hash.startsWith("#/scripts/new")) location.hash = "#/scripts";
    return;
  }
  const res = await api.createEpisode({ title: title.value, lead: ctx.influencer, mode: mode.value, outline: outline.value,
    agents: agents.filter((c) => c.checked).map((c) => c.value), languages: langs.filter((c) => c.checked).map((c) => c.value) });
  if (res.error) {
    await dialog(`<h3>Could not create it</h3><p>${res.error}</p>`, [["Close", "x", "ghost"]]);
    return newScript();
  }
  location.hash = `#/scripts/${res.slug}`;
}

// ---------------------------------------------------------------- editor

function sel(value, options, onchange, attrs = {}) {
  const v = String(value ?? "");
  if (!options.some(([k]) => String(k) === v)) options = [...options, [v, `${v} (not available here)`]];
  const s = el("select", attrs, ...options.map(([k, label, title]) => el("option", { value: k, title, selected: String(k) === v }, label)));
  s.onchange = () => onchange(s.value);
  return s;
}
const num = (value, placeholder, onchange) => {
  const i = el("input", { type: "number", step: "0.01", min: "0", placeholder, style: "width:76px" });
  i.value = value ?? "";
  i.oninput = () => onchange(i.value === "" ? null : parseFloat(i.value));
  return i;
};
const camType = (l) => (l.camera && typeof l.camera === "object" ? l.camera.type : l.camera) || "auto";
const camPart = (l, k) => (l.camera && typeof l.camera === "object" ? l.camera[k] || "" : "");
function setCam(l, type, on, wth) {
  if (!AIMED.includes(type)) on = wth = "";
  if (type !== "two") wth = "";
  if (!on && !wth) {
    if (type === "auto") delete l.camera;
    else l.camera = type;
  } else l.camera = { type, ...(on ? { on } : {}), ...(wth ? { with: wth } : {}) };
}

// Strip empty bits so script.json stays as clean as a hand-written one.
const prune = (m) => m && typeof m === "object" && Object.keys(m).forEach((k) => (m[k] === "" || m[k] == null) && delete m[k]);
function clean(s) {
  const out = structuredClone(s);
  delete out.screen; // the server keeps the screen cards and the board as they are
  delete out.board;
  for (const l of out.lines) {
    prune(l.say);
    prune(l.caption);
    if (l.emotions && !Object.keys(l.emotions).length) delete l.emotions;
    if (l.caption && !Object.keys(l.caption).length) delete l.caption;
    if (l.events) {
      l.events.forEach((ev) => prune(ev.word));
      l.events = l.events.filter((ev) => (ev.word && Object.keys(ev.word).length) || ev.at != null).filter((ev) => Object.keys(ev.emotions || {}).length || ev.hop);
      l.events.forEach((ev) => ev.emotions && !Object.keys(ev.emotions).length && delete ev.emotions);
      if (!l.events.length) delete l.events;
    }
  }
  return out;
}

async function editor(main, slug) {
  const e = ctx.data.episodes.find((x) => x.slug === slug);
  if (!e) {
    main.append(el("p", {}, "No such script. ", el("a", { href: "#/scripts" }, "Back to Scripts")));
    return;
  }
  const ep = e.episode, langs = ep.languages, cast = ep.cast, lead = ep.lead;
  const md = ctx.data.modes[ep.mode];
  const metas = Object.fromEntries(await Promise.all(cast.map(async (c) => [c, (await loadModel(c)).meta])));
  const base = JSON.stringify(clean(e.script));
  let S = structuredClone(e.script);
  S.title = S.title && typeof S.title === "object" ? S.title : Object.fromEntries(langs.map((l) => [l, S.title || ep.title]));
  S.lines = S.lines || [];
  for (const l of S.lines) if (typeof l.say === "string") l.say = Object.fromEntries(langs.map((g) => [g, l.say]));
  let meta = { title: ep.title, notes: ep.notes || "" };
  let dirty = false, timer = 0;
  const KEY = `s3d-draft-${slug}`;

  const status = el("span", { class: "note" }, "Saved");
  const counts = el("span", { class: "note mono" });
  const msgs = el("div", { class: "msgs" });
  const markDirty = () => {
    dirty = true;
    status.textContent = "Unsaved changes (kept in this browser)";
    countChars();
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), script: S, meta }));
      } catch (err) {}
    }, 300);
  };
  const countChars = () => (counts.textContent = langs.map((g) => `${g.toUpperCase()} ${S.lines.filter((l) => l.silent == null).reduce((n, l) => n + textOf(l.say, g).length, 0)} chars`).join(" · "));

  main.append(
    el("p", { class: "note" }, el("a", { href: "#/scripts" }, "← Scripts")),
    el("div", { class: "row" }, el("h1", { class: "grow", style: "margin:0" }, ep.title), pill(ep.state), pill("", `${md.name} mode`),
      el("a", { class: "btn ghost small", href: `#/make/${slug}/look` }, "Mode & look")),
    hint(`Write each line in every language: ${langs.map(langLabel).join(" and ")}. "auto" camera lets the ${md.name} mode pick the shot (${md.autoCamera.lead} for ${charName(lead)}, ${md.autoCamera.agent} for an agent). Pauses, moves and reactions are under each line's "More". Save often: the server checks the cast, the shots and the languages.`),
  );

  // unsaved edits from an earlier visit
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (err) {}
  if (draft && JSON.stringify(clean(draft.script)) !== base) {
    const banner = el("div", { class: "card row", style: "margin:12px 0;border-color:hsl(var(--warning))" },
      el("span", { class: "grow" }, `Edits you did not save (${new Date(draft.at).toLocaleString()}) are kept in this browser.`),
      el("button", { class: "small", onclick: () => {
        S = draft.script;
        meta = draft.meta || meta;
        banner.remove();
        drawAll();
        markDirty();
      } }, "Bring them back"),
      el("button", { class: "ghost small", onclick: () => {
        try {
          localStorage.removeItem(KEY);
        } catch (err) {}
        banner.remove();
      } }, "Discard"));
    main.append(banner);
  }

  const basics = el("details", { class: "sec", open: !S.lines.length });
  const linesBox = el("div");
  const addRow = el("div", { class: "row", style: "margin:10px 0" });
  main.append(basics, el("h2", {}, "Lines"), linesBox, addRow);
  if (S.screen?.cards?.length) main.append(el("p", { class: "note" }, `This episode also has ${S.screen.cards.length} screen cards (the dashboard behind the cast). They stay as they are in script.json when you save here.`));

  // ---- basics
  function drawBasics() {
    basics.innerHTML = "";
    const name = el("input", { value: meta.title });
    name.oninput = () => ((meta.title = name.value), markDirty());
    const titles = langs.map((g) => {
      const i = el("input", { value: S.title[g] || "" });
      i.oninput = () => ((S.title[g] = i.value), markDirty());
      return el("div", {}, el("label", { class: "f" }, `Title · ${langLabel(g)}`), i);
    });
    const outline = el("textarea", { rows: 3, placeholder: "The joke in two or three sentences." });
    outline.value = S.outline || "";
    outline.oninput = () => ((S.outline = outline.value), markDirty());
    const notes = el("textarea", { rows: 2, placeholder: "Notes for yourself: where the idea came from, what to check." });
    notes.value = meta.notes;
    notes.oninput = () => ((meta.notes = notes.value), markDirty());
    basics.append(el("summary", {}, "Basics", el("span", { class: "cnt" }, "title, outline, notes")),
      el("div", { class: "secbody" },
        el("label", { class: "f" }, "Episode name"), name,
        el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 10px" }, ...titles),
        el("label", { class: "f" }, "Outline"), outline,
        el("label", { class: "f" }, "Notes"), notes));
  }

  // ---- lines
  const nextId = (prefix) => {
    const used = new Set(S.lines.map((l) => l.id));
    let n = S.lines.length + 1;
    for (const l of S.lines) {
      const m = /^[a-z](\d+)$/.exec(l.id || "");
      if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
    }
    while (used.has(`${prefix}${String(n).padStart(2, "0")}`)) n++;
    return `${prefix}${String(n).padStart(2, "0")}`;
  };
  const newLine = (after) => {
    const prev = S.lines[after] && S.lines[after].silent == null ? S.lines[after] : [...S.lines].reverse().find((l) => l.silent == null);
    const who = !prev ? lead : prev.who === lead ? prev.to && prev.to !== lead ? prev.to : cast.find((c) => c !== lead) || lead : lead;
    const to = who === lead ? (prev && prev.who !== lead ? prev.who : cast.find((c) => c !== lead)) : lead;
    return { id: nextId("l"), who, ...(to && to !== who ? { to } : {}), say: {} };
  };
  const insert = (i, line) => {
    S.lines.splice(i, 0, line);
    markDirty();
    drawLines();
  };
  const castOpts = cast.map((c) => [c, charName(c)]);
  const emoOpts = (who, blank = "(as before)") => [["", blank], ...(metas[who]?.emotions || []).map((x) => [x, x])];
  const camOpts = [["auto", "auto", "the mode picks"], ...Object.entries(md.shotTypes).map(([k, d]) => [k, k, d])];

  // How the voice reads the line on Eleven v4 ("deadpan", "sighs, amused"): sent as a tag before
  // the line, never shown or captioned, one for every language. Per-language ones stay as written.
  function delivery(l) {
    const i = el("input", { placeholder: "voice delivery", style: "width:140px",
      title: "how the voice reads this line (Eleven v4), e.g. deadpan, excited, sighs: sent as a tag, never shown" });
    if (l.delivery && typeof l.delivery === "object") {
      i.value = Object.values(l.delivery).join(" / ");
      i.disabled = true;
      i.title = "set per language in script.json";
      return [el("span", { class: "note" }, "voice"), i];
    }
    i.value = l.delivery || "";
    i.oninput = () => {
      const v = i.value.replace(/[[\]]/g, "").trim();
      if (v) l.delivery = v;
      else delete l.delivery;
      markDirty();
    };
    return [el("span", { class: "note" }, "voice"), i];
  }

  function reactions(map, label) {
    const box = el("div", { class: "ev" });
    const draw = () => {
      box.innerHTML = "";
      box.append(el("span", { class: "note" }, label));
      for (const [cid, emo] of Object.entries(map)) {
        box.append(sel(cid, castOpts, (v) => {
          delete map[cid];
          map[v] = emo;
          markDirty();
          draw();
        }), sel(emo, emoOpts(cid, "neutral").slice(1), (v) => ((map[cid] = v), markDirty())),
        el("button", { class: "ghost small", title: "remove", onclick: () => {
          delete map[cid];
          markDirty();
          draw();
        } }, "✕"));
      }
      const free = cast.filter((c) => !(c in map));
      if (free.length) box.append(el("button", { class: "ghost small", onclick: () => {
        map[free[0]] = "neutral";
        markDirty();
        draw();
      } }, "+ add"));
    };
    draw();
    return box;
  }

  function events(l) {
    const box = el("div");
    const draw = () => {
      box.innerHTML = "";
      (l.events || []).forEach((ev, k) => {
        ev.emotions = ev.emotions || {};
        const words = langs.map((g) => {
          const i = el("input", { placeholder: `word (${g.toUpperCase()})`, style: "width:110px" });
          i.value = textOf(ev.word, g);
          i.oninput = () => {
            ev.word = ev.word && typeof ev.word === "object" ? ev.word : {};
            ev.word[g] = i.value;
            markDirty();
          };
          return i;
        });
        const hop = sel(ev.hop || "", [["", "no hop"], ...castOpts.map(([c, n]) => [c, `${n} hops`])], (v) => {
          if (v) ev.hop = v;
          else delete ev.hop;
          markDirty();
        });
        box.append(el("div", { class: "ev", style: "border-top:1px dashed hsl(var(--border));padding-top:6px" },
          el("span", { class: "note" }, "On the word"), ...words, hop,
          el("button", { class: "ghost small", title: "remove", onclick: () => {
            l.events.splice(k, 1);
            markDirty();
            draw();
          } }, "✕"),
          reactions(ev.emotions, "then")));
      });
      box.append(el("div", { class: "ev" }, el("button", { class: "ghost small", onclick: () => {
        (l.events = l.events || []).push({ word: {}, emotions: {} });
        markDirty();
        draw();
      } }, "+ reaction on a word")));
    };
    draw();
    return box;
  }

  function camera(l, speaker) {
    const type = camType(l);
    const parts = [sel(type, camOpts, (v) => {
      setCam(l, v, camPart(l, "on"), camPart(l, "with"));
      markDirty();
      drawLines();
    }, { title: "camera" })];
    if (AIMED.includes(type)) {
      parts.push(sel(camPart(l, "on"), [["", speaker ? "on the speaker" : "on (pick)"], ...castOpts], (v) => {
        setCam(l, type, v, camPart(l, "with"));
        markDirty();
      }, { title: "on" }));
    }
    if (type === "two") {
      parts.push(el("span", { class: "note" }, "with"), sel(camPart(l, "with"), [["", "(pick)"], ...castOpts], (v) => {
        setCam(l, type, camPart(l, "on"), v);
        markDirty();
      }, { title: "with" }));
    }
    return parts;
  }

  function tools(i) {
    const l = S.lines[i];
    return el("div", { class: "tools" },
      el("button", { class: "ghost", title: "move up", disabled: i === 0, onclick: () => {
        [S.lines[i - 1], S.lines[i]] = [S.lines[i], S.lines[i - 1]];
        markDirty();
        drawLines();
      } }, "↑"),
      el("button", { class: "ghost", title: "move down", disabled: i === S.lines.length - 1, onclick: () => {
        [S.lines[i + 1], S.lines[i]] = [S.lines[i], S.lines[i + 1]];
        markDirty();
        drawLines();
      } }, "↓"),
      el("button", { class: "ghost", title: "add a line below", onclick: () => insert(i + 1, newLine(i)) }, "+ line"),
      el("button", { class: "ghost", title: "add a silent beat below", onclick: () => insert(i + 1, { id: nextId("s"), silent: 1.2 }) }, "+ beat"),
      el("button", { class: "ghost", title: "duplicate", onclick: () => insert(i + 1, { ...structuredClone(l), id: nextId(l.silent ? "s" : "l") }) }, "⧉"),
      el("button", { class: "ghost", title: "delete", onclick: async () => {
        const hasText = !l.silent && langs.some((g) => textOf(l.say, g));
        if (hasText && (await dialog(`<h3>Delete ${l.id}?</h3><p class="note">${langs.map((g) => textOf(l.say, g)).filter(Boolean).join("<br>")}</p>`, [["Keep it", "keep", "ghost"], ["Delete", "del"]])) !== "del") return;
        S.lines.splice(i, 1);
        markDirty();
        drawLines();
      } }, "✕"));
  }

  function silentRow(l, i) {
    l.emotions = l.emotions || {};
    return el("div", { class: "lineed silent" },
      el("div", { class: "hd" }, el("span", { class: "num" }, `${i + 1} · ${l.id}`), el("b", {}, "Silent beat"),
        num(l.silent, "1.2", (v) => ((l.silent = v ?? 0), markDirty())), el("span", { class: "note" }, "s"), ...camera(l, null), tools(i)),
      reactions(l.emotions, "Faces during the beat"));
  }

  function lineRow(l, i) {
    l.say = l.say || {};
    l.emotions = l.emotions || {};
    const who = l.who;
    const toOpts = [["", "(no one)"], ...castOpts.filter(([c]) => c !== who)];
    const texts = langs.map((g) => {
      const cnt = el("span", { class: "note" }, `${textOf(l.say, g).length}`);
      const ta = el("textarea", { rows: 2, placeholder: `What ${charName(who)} says (${langLabel(g)})` });
      ta.value = textOf(l.say, g);
      ta.oninput = () => {
        l.say[g] = ta.value;
        cnt.textContent = ta.value.length;
        markDirty();
      };
      const capBox = el("div");
      const drawCap = () => {
        capBox.innerHTML = "";
        if (l.caption && l.caption[g] != null) {
          const ci = el("input", { placeholder: "Caption on screen (blank = the line)" });
          ci.value = l.caption[g];
          ci.oninput = () => ((l.caption[g] = ci.value), markDirty());
          capBox.append(el("label", { style: "display:block;margin-top:6px" }, "Caption on screen"), ci);
        } else {
          capBox.append(el("a", { href: "javascript:void 0", class: "note", onclick: () => {
            l.caption = l.caption || {};
            l.caption[g] = textOf(l.say, g);
            markDirty();
            drawCap();
          } }, "+ different caption"));
        }
      };
      drawCap();
      return el("div", {}, el("label", {}, `${g.toUpperCase()} · `, cnt, " chars"), ta, capBox);
    });
    const extrasSet = ["pause", "lead", "hop", "lean", "music", "prop"].filter((k) => l[k] != null && l[k] !== false).length + Object.keys(l.emotions).length + (l.events?.length || 0);
    const t = md.timing;
    const hop = sel(l.hop === true ? "__speaker" : l.hop || "", [["", "no hop"], ["__speaker", `${charName(who)} hops`], ...castOpts.filter(([c]) => c !== who).map(([c, n]) => [c, `${n} hops`])], (v) => {
      if (!v) delete l.hop;
      else l.hop = v === "__speaker" ? true : v;
      markDirty();
    });
    const lean = el("input", { type: "checkbox", checked: !!l.lean });
    lean.onchange = () => {
      if (lean.checked) l.lean = true;
      else delete l.lean;
      markDirty();
    };
    const music = sel(l.music || "", [["", "music as is"], ["quiet", "music quiet"], ["stop", "music stops"]], (v) => {
      if (v) l.music = v;
      else delete l.music;
      markDirty();
    }, { title: md.audio === "music" ? "the music bed under this line" : "this mode has no music bed" });
    const more = el("details", { style: "margin-top:6px" },
      el("summary", { class: "note", style: "cursor:pointer" }, `More: timing, moves, reactions${extrasSet ? ` (${extrasSet} set)` : ""}`),
      el("div", { class: "ev" },
        el("span", { class: "note" }, "pause after"), num(l.pause, String(t.holdAfter), (v) => (v == null ? delete l.pause : (l.pause = v), markDirty())),
        el("span", { class: "note" }, "cut before"), num(l.lead, String(i === 0 ? t.leadIn : t.cutBefore), (v) => (v == null ? delete l.lead : (l.lead = v), markDirty())),
        hop, el("label", { class: "row note", style: "gap:4px" }, lean, "leans in"), md.audio === "music" ? music : null,
        who === lead ? sel(l.prop || "", [["", "hands free"], ["phone", "holds a phone (lights the face)"]], (v) => {
          if (v) l.prop = v;
          else delete l.prop;
          markDirty();
        }, { title: "a prop in hand for this shot" }) : null),
      reactions(l.emotions, "When the line starts, others feel"),
      events(l));
    return el("div", { class: "lineed" },
      el("div", { class: "hd" },
        el("span", { class: "num" }, `${i + 1} · ${l.id}`),
        sel(who, castOpts, (v) => {
          l.who = v;
          if (l.to === v) l.to = v === lead ? cast.find((c) => c !== lead) : lead;
          if (l.emotion && !(metas[v]?.emotions || []).includes(l.emotion)) delete l.emotion;
          markDirty();
          drawLines();
        }, { title: "who speaks" }),
        el("span", { class: "note" }, "to"),
        sel(l.to || "", toOpts, (v) => {
          if (v) l.to = v;
          else delete l.to;
          markDirty();
        }, { title: "who they talk to" }),
        sel(l.emotion || "", emoOpts(who), (v) => {
          if (v) l.emotion = v;
          else delete l.emotion;
          markDirty();
        }, { title: "feeling" }),
        ...delivery(l),
        ...camera(l, who),
        tools(i)),
      el("div", { class: "texts" }, ...texts),
      more);
  }

  function drawLines() {
    linesBox.innerHTML = "";
    if (!S.lines.length) linesBox.append(el("div", { class: "empty" }, "No lines yet. Add the first one below."));
    S.lines.forEach((l, i) => linesBox.append(l.silent != null ? silentRow(l, i) : lineRow(l, i)));
    addRow.innerHTML = "";
    addRow.append(el("button", { class: "ghost", onclick: () => insert(S.lines.length, newLine(S.lines.length - 1)) }, "+ Line"),
      el("button", { class: "ghost", onclick: () => insert(S.lines.length, { id: nextId("s"), silent: 1.2 }) }, "+ Silent beat"));
    countChars();
  }
  const drawAll = () => {
    drawBasics();
    drawLines();
  };

  // ---- save, approve, rehearse
  function show(res) {
    msgs.innerHTML = "";
    for (const x of res.errors || []) msgs.append(el("div", { class: "err" }, `✗ ${x}`));
    for (const x of res.warnings || []) msgs.append(el("div", { class: "warn" }, `! ${x}`));
    for (const [g, est] of Object.entries(res.estimates || {})) {
      if (est?.ok) msgs.append(el("div", { class: "note" }, `${g.toUpperCase()}: ${est.toGenerate} of ${est.lines} lines need a voice (${est.characters} characters to make).`));
    }
  }
  async function save() {
    const body = clean(S);
    status.textContent = "Saving…";
    const res = await api.saveScript(slug, body);
    show(res);
    if (!res.ok) {
      status.textContent = res.error ? `Not saved: ${res.error}` : "Not saved: fix the red items";
      return false;
    }
    if (meta.title !== ep.title || meta.notes !== (ep.notes || "")) {
      await api.saveMeta(slug, { title: meta.title, notes: meta.notes });
      ep.title = meta.title;
      ep.notes = meta.notes;
    }
    e.script = { ...body, ...(S.screen ? { screen: S.screen } : {}) };
    dirty = false;
    clearTimeout(timer);
    try {
      localStorage.removeItem(KEY);
    } catch (err) {}
    status.textContent = `Saved ${new Date().toLocaleTimeString()}`;
    return true;
  }
  async function approve() {
    if (dirty && !(await save())) return;
    const voiced = S.lines.filter((l) => l.silent == null);
    const gaps = langs.filter((g) => voiced.some((l) => !textOf(l.say, g).trim()));
    if (!voiced.length || gaps.length) {
      show({ errors: [!voiced.length ? "Write at least one line first." : `Every line needs its ${gaps.map((g) => g.toUpperCase()).join(" and ")} text before approval.`] });
      return;
    }
    const ans = await dialog(`<h3>Approve this script?</h3><p>Approving it lets voices be made for it. Nothing is spent yet: the voice cost is shown and asked on <b>Make video → Voices &amp; cost</b>.</p>`, [["Cancel", "x", "ghost"], ["Approve", "go"]]);
    if (ans !== "go") return;
    await api.saveMeta(slug, { state: "approved" });
    route();
  }
  const saveBtn = el("button", { onclick: save }, "Save");
  const bar = el("div", { class: "savebar" }, saveBtn,
    el("button", { class: "ghost", onclick: async () => (!dirty || (await save())) && (location.hash = `#/make/${slug}/rehearsal`) }, "▶ Rehearse"),
    ep.state === "approved"
      ? el("button", { class: "ghost", onclick: async () => (await api.saveMeta(slug, { state: "draft" }), route()) }, "Back to draft")
      : el("button", { class: "ghost", onclick: approve }, "Approve script"),
    status, el("span", { class: "grow" }), counts);
  main.append(bar, msgs);
  drawAll();

  const onKey = (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") {
      ev.preventDefault();
      save();
    }
  };
  const onLeave = (ev) => {
    if (dirty) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", onLeave);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("beforeunload", onLeave);
  };
}
