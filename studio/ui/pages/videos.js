// Videos: every episode and language as a video, in three pills as in Influencer Studio (Needs
// you, Working, Finished), with a batch bar to run many at once; the live view of a run; the
// watch page of a finished video.
import { el, hint, api, ctx, episodesOf, pill, charName, langLabel, runItems, stepChips, whatNext, PRESETS, STEPS, ago, fold, previewVideo, filterPills } from "../app.js";

const stamp = () => `?v=${Date.now()}`;

export async function render(main, { args }) {
  if (args[0] === "job" && args[1]) return job(main, args[1]);
  if (args[0] === "watch" && args[1]) return watch(main, args[1], args[2]);
  return list(main, ["needs", "working", "finished"].includes(args[0]) ? args[0] : "needs");
}

async function list(main, tab) {
  const eps = episodesOf(ctx.influencer);
  const items = eps.flatMap((e) => e.episode.languages.map((lang) => ({ e, lang, next: whatNext(e, lang) })));
  const needs = items.filter((i) => i.next.needs);
  const finished = items.filter((i) => !i.next.needs);
  const jobs = await api.jobs();
  const active = jobs.filter((j) => j.state === "running" || j.state === "queued");
  main.append(el("h1", {}, "Videos"),
    hint("Every episode in every language is one video. Tick several and run them as a batch: each one runs its steps in order and a failure stops only that one. Voice spend is always asked first."),
    el("div", { class: "pills" },
      ...[["needs", "Needs you", needs.length], ["working", "Working", active.length], ["finished", "Finished", finished.length]].map(([k, label, n]) =>
        el("a", { class: `pillbtn${k === tab ? " on" : ""}`, href: `#/videos/${k}` }, `${label} (${n})`))));

  if (tab === "working") {
    if (!jobs.length) main.append(el("div", { class: "empty" }, "No runs since the server started. Runs started anywhere in the studio show here live."));
    const box = el("div", { class: "card", style: "padding:0 16px" });
    for (const j of jobs) {
      box.append(el("a", { class: "video-row", href: `#/videos/job/${j.id}` },
        el("div", { class: "grow" }, el("div", { class: "t" }, j.label || j.episodes.join(", ")),
          el("div", { class: "note mono" }, `${j.id} · ${typeof j.steps === "string" ? j.steps : j.steps.join(",")} · ${j.started ? ago(j.started) : "queued"}`)),
        pill(j.state === "cancelled" ? "" : j.state, j.state), el("span", { class: "go" }, "Open →")));
    }
    if (jobs.length) main.append(box);
    return;
  }

  const langs = ctx.data.studio.languages;
  const lang = filterPills("video-lang", [["both", "Both"], ...langs.map((l) => [l.id, l.label])], () => draw());
  const modes = [...new Set(eps.map((e) => e.episode.mode))];
  const mode = filterPills("video-mode", [["all", "All modes"], ...modes.map((m) => [m, ctx.data.modes[m]?.name || m])], () => draw());
  const body = el("div");
  main.append(el("div", { class: "filters" }, lang.box, modes.length > 1 ? mode.box : null), body);
  const fits = (i) => (lang.value() === "both" || i.lang === lang.value()) && (mode.value() === "all" || i.e.episode.mode === mode.value());
  const draw = () => {
    const shown = (tab === "needs" ? needs : finished).filter(fits);
    if (!shown.length) return body.replaceChildren(el("div", { class: "empty" }, tab === "needs" ? "Nothing needs you here." : "No finished videos here."));
    if (tab === "needs") return body.replaceChildren(...batchRows(shown));
    body.replaceChildren(finishedGrid(shown), fold("Render several again", shown.length, false, ...batchRows(shown)));
  };
  draw();
}

// Finished: one card per episode, with one thumbnail for each language shown. A click on a thumbnail plays it.
function finishedGrid(shown) {
  const byEp = new Map();
  for (const i of shown) byEp.set(i.e.slug, [...(byEp.get(i.e.slug) || []), i]);
  return el("div", { class: "vgrid" }, [...byEp.values()].map((rows) => el("div", { class: "vtile" },
    el("div", { class: "vthumbs" }, rows.map((i) => {
      const L = i.e.langs[i.lang] || {};
      const sub = `${langLabel(i.lang)} · ${i.e.episode.mode} mode`;
      return el("button", { class: "vthumb", title: `Play ${langLabel(i.lang)}`, onclick: () => previewVideo(L.render + stamp(), i.e.episode.title, sub, `#/videos/watch/${i.e.slug}/${i.lang}`) },
        L.thumb ? el("img", { src: "/" + L.thumb, alt: "" }) : null, el("span", { class: "vlang" }, i.lang.toUpperCase()), el("span", { class: "vplay" }, "▶"));
    })),
    el("div", { class: "t" }, rows[0].e.episode.title),
    el("div", { class: "note" }, `${rows[0].e.episode.mode} mode`))));
}

function batchRows(shown) {
  const picked = new Set();
  const count = el("span", { class: "note" }, "Tick videos to run them together");
  const btns = Object.entries(PRESETS).map(([k, p]) => el("button", { class: "small ghost", disabled: true, onclick: () => {
    const chosen = shown.filter((i) => picked.has(`${i.e.slug}|${i.lang}`));
    runItems(chosen.map((i) => ({ episode: i.e.slug, lang: i.lang })), k, `batch of ${chosen.length}: ${p.label}`);
  } }, p.label));
  const sync = () => {
    count.textContent = picked.size ? `${picked.size} selected` : "Tick videos to run them together";
    btns.forEach((b) => (b.disabled = !picked.size));
  };
  const box = el("div", { class: "card", style: "padding:0 16px" });
  for (const i of shown) {
    const L = i.e.langs[i.lang] || {};
    const ready = i.e.episode.state === "approved" && i.next.key !== "script";
    const cb = el("input", { type: "checkbox", disabled: !ready, title: ready ? "Add to the batch" : "Approve the script first" });
    cb.onchange = () => {
      const k = `${i.e.slug}|${i.lang}`;
      cb.checked ? picked.add(k) : picked.delete(k);
      sync();
    };
    const thumb = L.thumb ? el("img", { class: "thumb", src: "/" + L.thumb }) : el("div", { class: "thumb" });
    box.append(el("div", { class: "video-row" }, cb,
      L.render ? el("button", { class: "thumbbtn", title: "Play", onclick: () => previewVideo(L.render + stamp(), i.e.episode.title, langLabel(i.lang), `#/videos/watch/${i.e.slug}/${i.lang}`) }, thumb) : thumb,
      el("div", { class: "grow" }, el("div", { class: "t" }, i.e.episode.title, el("span", { class: "note" }, `  ${i.lang.toUpperCase()}`)),
        el("details", { class: "mini" }, el("summary", {}, "Steps"), el("div", { style: "margin-top:5px" }, stepChips(i.e.status[i.lang])))),
      el("a", { class: "go", href: i.next.href, style: i.next.bad ? "color:hsl(var(--destructive))" : "" }, `${i.next.needs ? i.next.label : "Details"} →`)));
  }
  return [el("div", { class: "card row", style: "margin-bottom:12px;padding:10px 14px" }, count, el("span", { class: "grow" }), ...btns), box];
}

// ---------------------------------------------------------------- one run, live
async function job(main, id) {
  const j = await api.job(id);
  if (j.error) {
    main.append(el("p", {}, "This run is not in memory any more (the server keeps runs until it restarts; its log is in jobs/<id>/events.jsonl). ", el("a", { href: "#/videos/working" }, "All runs")));
    return;
  }
  const state = pill(j.state, j.state);
  const cancel = el("button", { class: "ghost small", onclick: () => api.cancel(id) }, "Cancel run");
  main.append(el("p", { class: "note" }, el("a", { href: "#/videos/working" }, "← Working")),
    el("div", { class: "row" }, el("h1", { class: "grow", style: "margin:0" }, j.label || "Run"), state, cancel),
    el("p", { class: "note mono" }, j.id));
  const now = el("p", { style: "font-weight:600" }, "Waiting for the first step…");
  const board = el("table");
  main.append(el("div", { class: "card" }, now, board));
  const log = el("div", { class: "log" });
  const stills = el("div", { class: "frames" });
  const videos = el("div", { class: "cards-v" });
  main.append(el("h2", {}, "Stills as they are captured"), stills, el("h2", {}, "Videos"), videos, el("h2", {}, "Log"), log);
  const cells = {};
  const build = (items, steps) => {
    board.innerHTML = "";
    board.append(el("tr", {}, el("th", {}, "Video"), ...steps.map((s) => el("th", {}, s === "frames" ? "stills" : s))));
    for (const it of items) {
      const tr = el("tr", {}, el("td", {}, `${it.episode} `, el("span", { class: "note" }, it.lang.toUpperCase())));
      for (const s of steps) {
        const c = el("span", { class: "stepchip" }, "·");
        cells[`${it.episode}|${it.lang}|${s}`] = c;
        tr.append(el("td", {}, c));
      }
      board.append(tr);
    }
  };
  const cell = (ev, cls, text) => {
    const c = cells[`${ev.episode}|${ev.lang}|${ev.step}`];
    if (c) {
      c.className = `stepchip ${cls}`;
      c.textContent = text;
    }
  };
  const line = (text, cls = "") => {
    const end = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.append(el("div", { class: cls }, text));
    if (end) log.scrollTop = log.scrollHeight;
  };
  function handle(ev) {
    const where = ev.episode ? `${ev.episode}/${ev.lang} ` : "";
    switch (ev.type) {
      case "job-start":
        build(ev.items, ev.steps);
        line(`run: ${ev.items.length} video(s) × ${ev.steps.join(" → ")}`, "step");
        break;
      case "step-start":
        cell(ev, "running", "…");
        now.textContent = `Now: ${ev.episode} (${ev.lang.toUpperCase()}) · ${ev.step === "frames" ? "stills" : ev.step}`;
        line(`▶ ${where}${ev.step}`, "step");
        break;
      case "step-done": {
        cell(ev, "done", `${ev.took}s`);
        const bits = Object.entries(ev.info || {}).filter(([, v]) => typeof v !== "object").map(([k, v]) => `${k} ${v}`).join(" · ");
        line(`✓ ${where}${ev.step} (${ev.took}s) ${bits}`, "ok");
        break;
      }
      case "step-failed":
        cell(ev, ev.state === "needs-approval" ? "needs-approval" : "failed", ev.state === "needs-approval" ? "approve" : "✗");
        line(`✗ ${where}${ev.step}: ${ev.error}`, "bad");
        break;
      case "artifact":
        if (ev.kind === "frame") stills.append(el("figure", {}, el("img", { src: "/" + ev.file + stamp() }), el("figcaption", {}, `${ev.lang} · shot ${ev.n}`)));
        if (ev.kind === "video") videos.append(el("div", { class: "card" }, el("div", { class: "note" }, `${ev.episode} ${ev.lang.toUpperCase()}`), el("video", { src: "/" + ev.file + stamp(), controls: true, playsinline: true })));
        break;
      case "take":
        line(`  voice take ${ev.line} (${ev.who}, ${ev.characters} characters)`);
        break;
      case "estimate":
        line(`  voices: ${ev.toGenerate} new of ${ev.lines}, ${ev.characters} characters`);
        break;
      case "log":
        if (ev.msg && ev.msg.trim()) line(`  ${ev.msg}`);
        break;
      case "job-done":
        now.textContent = ev.ok ? "Finished: every video passed." : "Finished with failures: see the red cells and the log.";
        break;
      case "job-end":
        state.className = `st ${ev.state === "done" ? "done" : ev.state === "cancelled" ? "" : "failed"}`;
        state.textContent = ev.state;
        cancel.disabled = true;
        break;
    }
  }
  for (const ev of j.events) handle(ev);
  let es = null;
  if (j.state === "running" || j.state === "queued") {
    es = new EventSource(`/api/jobs/${id}/events?from=${j.events.length}`);
    es.onmessage = (m) => handle(JSON.parse(m.data));
    es.addEventListener("end", () => es.close());
  } else cancel.disabled = true;
  return () => es && es.close();
}

// ---------------------------------------------------------------- watch one video
function watch(main, slug, lang) {
  const e = ctx.data.episodes.find((x) => x.slug === slug);
  const L = e?.langs?.[lang];
  if (!L?.render) {
    main.append(el("p", {}, "This video is not rendered yet. ", el("a", { href: `#/make/${slug}/final` }, "Open it in Make video")));
    return;
  }
  const v = e.status[lang]?.verify?.result;
  main.append(el("p", { class: "note" }, el("a", { href: "#/videos/finished" }, "← Finished")),
    el("div", { class: "row" }, el("h1", { class: "grow", style: "margin:0" }, e.episode.title), pill("", langLabel(lang)), pill("", `${e.episode.mode} mode`)),
    el("div", { class: "row top", style: "margin-top:14px;gap:22px" },
      el("video", { src: "/" + L.render + stamp(), controls: true, playsinline: true, autoplay: true }),
      el("div", { class: "grow" },
        el("label", { class: "f", style: "margin-top:0" }, "Checked"),
        el("p", { class: "mono note" }, v ? `${v.width}×${v.height} · ${v.fps} fps · ${v.seconds} s · ${v.lufs} LUFS · peak ${v.peak} dBFS` : "not verified yet"),
        el("label", { class: "f" }, "Rendered"), el("p", { class: "note" }, L.renderedAt || ""),
        el("label", { class: "f" }, "File"), el("p", { class: "mono note" }, `studio/episodes/${slug}/renders/${slug}-${lang}.mp4`),
        el("label", { class: "f" }, "Cast"), el("p", { class: "note" }, e.episode.cast.map(charName).join(", ")),
        el("div", { class: "row", style: "margin-top:12px" }, el("a", { class: "btn ghost small", href: `#/make/${slug}/final` }, "Open in Make video"), el("a", { class: "btn ghost small", href: "/" + L.render, download: `${slug}-${lang}.mp4` }, "Download")),
        L.renderSheet ? el("img", { src: "/" + L.renderSheet + stamp(), style: "width:100%;max-width:560px;border-radius:8px;margin-top:14px" }) : null)));
}
