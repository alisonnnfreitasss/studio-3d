// Explainers: a topic in, a checked 3D reel out. The list, the new-reel form, and one reel's live board.
import { el, ctx, hint, api, pill, dialog, fold, previewVideo } from "../app.js";
import { stepView, loadData } from "../steps.js";

const get = async (u) => (await fetch(u)).json();
const secs = (s) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const titleOf = (e) => (e.topic.source === "translation" && e.script?.title) || e.topic.topic;
const toks = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)}M` : n > 1e3 ? `${Math.round(n / 1e3)}k` : `${n || 0}`);
const stateOf = (run) => run?.state || "new";
const STATE_TEXT = { waiting: "needs you", running: "working", done: "finished", failed: "failed", stopped: "stopped", new: "starting" };

function listView(main, data) {
  const isTest = (e) => e.topic.test || (!e.topic.showcase && (e.run?.check?.numbers?.length ?? e.topic.seconds) <= 10);
  const cine = ctx.page.format === "cinematic";
  const here = data.explainers.filter((e) => (e.topic.format || "explainer") === ctx.page.format);
  const all = here.filter((e) => !isTest(e));
  const tests = here.filter(isTest);
  const tile = (n, label) => el("div", { class: "tile" }, el("b", {}, n), el("span", {}, label));
  main.append(el("div", { class: "hero" }, el("h1", {}, cine ? "Cinematic" : "Explainers"), el("p", { class: "note" }, cine ? "Realistic 3D, voice only. Say what the video is about and watch it build." : "Start from a video, a topic or your own script, then watch it build."),
    el("div", { class: "tiles" }, tile(all.length, "reels"), tile(all.filter((e) => stateOf(e.run) === "done").length, "complete"),
      tile(all.filter((e) => stateOf(e.run) === "waiting").length, "waiting on you"), tile(all.filter((e) => stateOf(e.run) === "running").length, "building now"))),
    hint("Agents run on your Claude plan through Claude Code. Anything that costs credits waits for your approval."));
  const brand = el("select", {}, data.brands.map((b) => el("option", { value: b.id }, b.name)));
  const speedNote = el("span", { class: "note", style: "font-weight:400" });
  const SPEED_ABOUT = { express: "The quickest. Uses what we already have. Simpler result.", standard: "The usual way. You approve each big step.", studio: "The best one. Takes longest, builds new objects and gets reviewed." };
  const showSpeed = () => { speedNote.textContent = SPEED_ABOUT[speed.value]; };
  const speed = el("select", { onchange: showSpeed }, Object.entries(data.speeds).map(([k, v]) => el("option", { value: k, ...(k === "standard" ? { selected: true } : {}) }, v.label)));
  const topic = el("input", { placeholder: "Why do planes need flaps?" });
  const language = el("select", {}, el("option", { value: "en" }, "English"), el("option", { value: "pt" }, "Português"));
  const video = el("input", { placeholder: "A link, a file path on this Mac, or a reference id" });
  const script = el("textarea", { rows: 6, placeholder: "Paste your script. Each sentence becomes one beat.", style: "width:100%;font:inherit;padding:8px 10px;border:1px solid hsl(var(--input));border-radius:var(--radius-sm);background:hsl(var(--card));color:inherit" });
  const source = el("select", { onchange: () => showSource() },
    el("option", { value: "topic" }, "From a topic: Claude writes the script"),
    el("option", { value: "script" }, "From my script: use my words"),
    el("option", { value: "video" }, "From a video: follow its structure, in our own words"));
  const topicL = el("label", {}, "Topic", topic), videoL = el("label", {}, "Reference video", video), scriptL = el("label", {}, "Your script", script);
  const showSource = () => {
    topicL.style.display = source.value === "topic" ? "" : "none";
    videoL.style.display = source.value === "video" ? "" : "none";
    scriptL.style.display = source.value === "script" ? "" : "none";
    secondsL.style.display = source.value === "topic" ? "" : "none";
  };
  const seconds = el("input", { type: "number", min: 5, max: 180, value: 60 });
  const secondsL = el("label", {}, "Length in seconds (5 to 10 for a test)", seconds);
  const go = el("button", { class: "btn", onclick: async () => {
    const need = { topic, script, video }[source.value];
    if (!need.value.trim()) return need.focus();
    go.disabled = true;
    const r = await api.post("/api/explainers", { source: source.value, topic: topic.value, video: video.value, script: script.value, language: language.value, format: cine ? "cinematic" : "explainer", brand: brand.value, speed: speed.value, seconds: +seconds.value });
    if (r.error) {
      go.disabled = false;
      return dialog(`<h3>Could not start</h3><p>${r.error}</p>`, [["Close", "x", "ghost"]]);
    }
    location.hash = `#/explainers/${r.slug}`;
  } }, "Start");
  showSpeed();
  const form = el("div", { class: "card xform" },
    el("label", {}, "Start from", source), topicL, videoL, scriptL, el("label", {}, "Language", language), el("label", {}, "Speed", speed, speedNote),
    el("details", { class: "mini" }, el("summary", {}, "More options"), el("div", { class: "xform", style: "margin-top:10px" }, el("label", {}, "Brand: character and voice", brand), secondsL)), el("div", {}, go));
  showSource();
  const row = (e) => {
    const s = stateOf(e.run);
    const last = e.videos[e.videos.length - 1];
    const original = [...e.videos].reverse().find((v) => !v.includes("-mirror-")) || last;
    return el("div", { class: "video-row" },
      original ? el("button", { class: "thumbbtn", title: "Play", onclick: () => previewVideo(original, titleOf(e), `${e.topic.speed}`, `#/explainers/${e.slug}`) }, el("img", { class: "thumb", src: `/poster/${original}`, alt: "" })) : el("div", { class: "thumb" }),
      el("a", { class: "grow", href: `#/explainers/${e.slug}`, style: "text-decoration:none" }, el("div", { class: "t" }, titleOf(e)), el("div", { class: "note" }, `${e.topic.format === "cinematic" ? "Cinematic · " : ""}${(e.topic.language || "en").toUpperCase()} · ${e.topic.speed}${e.run?.check ? ` · ${Math.round(e.run.check.numbers.length)} s` : ""}`)),
      el("a", { class: "go", href: `#/explainers/${e.slug}` }, pill(s === "waiting" ? "needs-approval" : s === "done" ? "done" : s === "failed" ? "failed" : "running", STATE_TEXT[s] || s)));
  };
  const box = (rows) => el("div", { class: "card", style: "padding:0 16px" }, rows.map(row));
  main.append(el("div", { class: "xhow" }, [["1", "Say what the video is about"], ["2", "Read the script and say yes"], ["3", "Watch it get built, step by step"], ["4", "Get your video"]].map(([n, x]) => el("div", { class: "xhowstep" }, el("b", {}, n), el("span", {}, x)))));
  main.append(el("div", { class: "xhome" }, form, el("div", { style: "min-width:0" },
    el("h2", { style: "margin-top:0" }, "Reels"),
    all.length ? box(all) : el("div", { class: "empty" }, "No reels yet. Start one here, or see the finished ones in the Library."),
    tests.length ? el("div", { style: "margin-top:12px" }, fold("Tests", tests.length, false, box(tests))) : null)));
}

function gatePanel(e, refresh) {
  const gate = e.run.gate;
  const approve = (label) => el("button", { class: "btn", onclick: async () => { await api.post(`/api/explainers/${e.slug}/approve`, { gate }); refresh(); } }, label);
  if (gate === "script") {
    const areas = e.script.lines.map((l) => ({ scene: l.scene, area: el("textarea", { rows: 2, value: l.text }) }));
    const hooks = (e.script.hooks || []).map((h) => el("button", { class: "btn ghost", style: "white-space:normal;text-align:left", title: h.why, onclick: () => { areas[0].area.value = h.text; } }, h.text));
    return el("div", { class: "card" }, el("h2", {}, "Approve the script"),
      hooks.length ? el("p", { class: "note" }, "Opening line options, click to use one:") : null, el("div", { class: "row" }, hooks),
      el("div", { class: "xlines", style: "margin:12px 0" }, areas.map((a) => a.area)),
      el("button", { class: "btn", onclick: async () => {
        await api.post(`/api/explainers/${e.slug}/script`, { lines: areas.map((a) => ({ scene: a.scene, text: a.area.value })) });
        await api.post(`/api/explainers/${e.slug}/approve`, { gate });
        refresh();
      } }, "Approve script"));
  }
  if (gate === "reference") return el("div", { class: "card" }, el("h2", {}, "Approve the transcript cost"),
    el("p", {}, `Transcribing the ${e.run.ref_cost?.minutes} min video with ElevenLabs Scribe costs about US$${e.run.ref_cost?.usd}.`), approve("Approve and spend"));
  if (gate === "voice") return el("div", { class: "card" }, el("h2", {}, "Approve the voice cost"),
    el("p", {}, `This take spends ${e.run.voice_cost?.characters} ${e.run.voice_cost?.provider} characters.`), approve("Approve and spend"));
  if (gate === "shotmap") return el("div", { class: "card" }, el("h2", {}, "Approve the shot map"),
    e.shotmap ? el("p", {}, el("a", { href: "/" + e.shotmap, target: "_blank" }, "Open the shot map")) : null, approve("Approve and render"));
  return null;
}

async function boardView(main, slug) {
  let sel = null;
  let data = null;
  let lastKey = "";
  const head = el("div", {}), gate = el("div", { style: "margin:12px 0" }), board = el("div", { class: "xboard" }), detail = el("div", {}), result = el("div", {}), videos = el("div", { class: "xvideos" });
  main.append(el("p", {}, el("a", { href: "#/explainers" }, "All explainers")), head, gate, board, el("div", { class: "xresult" }, videos, el("div", { class: "xside" }, detail)));
  const draw = async () => {
    const e = await get(`/api/explainers/${slug}`);
    if (e.error) { head.replaceChildren(el("p", {}, e.error)); return; }
    const run = e.run, steps = run.steps || [];
    const s = stateOf(run);
    const other = (e.topic.language || "en") === "en" ? "pt" : "en";
    head.replaceChildren(...[el("h1", {}, titleOf(e)), el("p", { class: "note" }, `${e.topic.speed}${run.check ? ` · ${Math.round(run.check.numbers.length)} s` : ""} · `, pill(s === "waiting" ? "needs-approval" : s === "done" ? "done" : s === "failed" ? "failed" : "running", STATE_TEXT[s] || s)),
      ["failed", "stopped"].includes(s) ? el("button", { class: "btn ghost", onclick: () => api.post(`/api/explainers/${slug}/resume`).then(draw) }, "Resume") : null,
      s === "running" ? el("button", { class: "btn ghost", onclick: () => api.post(`/api/explainers/${slug}/cancel`).then(draw) }, "Stop") : null,
      ...(e.versions || []).map((v) => el("a", { class: "btn ghost", href: `#/explainers/${v.slug}`, style: "margin-right:8px" }, v.language === "pt" ? "Open the Portuguese version" : "Open the English version")),
      s === "done" && !(e.versions || []).some((v) => v.language === other) ? el("button", { style: "margin-right:8px", onclick: async (ev) => {
        ev.target.disabled = true;
        const r = await api.post(`/api/explainers/${slug}/translate`, { language: other });
        if (r.slug) location.hash = `#/explainers/${r.slug}`;
      } }, other === "pt" ? "Make the Portuguese version" : "Make the English version") : null,
      s === "done" && !steps.some((x) => x.id === "variant") ? el("button", { class: "btn ghost", onclick: () => api.post(`/api/explainers/${slug}/variant`).then(draw) }, "Make the second version") : null].filter(Boolean));
    const gkey = `${s}:${run.gate}`;
    if (gkey !== lastKey) {
      gate.replaceChildren(...(s === "waiting" && gatePanel(e, draw) ? [gatePanel(e, draw)] : []));
      lastKey = gkey;
    }
    board.replaceChildren(...steps.flatMap((st, i) => {
      if (st.state === "skipped") return [];
      const t = st.started ? (st.ended || Date.now() / 1000) - st.started : null;
      const n = el("button", { class: `xnode ${st.state}${sel === i ? " sel" : ""}`, onclick: () => { sel = i; draw(); } },
        el("div", { class: "xt" }, st.title), el("div", { class: "xm" }, st.state === "waiting" ? "waiting for you" : st.state === "skipped" ? "not needed" : st.state + (t != null ? ` · ${secs(t)}` : "") + ""));
      return i ? [el("div", { class: `xlink ${steps[i - 1].state === "done" ? "done" : ""}` }), n] : [n];
    }));
    const cur = sel != null ? steps[sel] : steps.find((x) => x.state === "running" || x.state === "failed" || x.state === "waiting") || steps.find((x) => x.state !== "skipped");
    const key = cur ? `${cur.id}:${steps.indexOf(cur)}:${cur.state}` : "";
    if (cur && (key !== detail.dataset.k || cur.state === "running")) {
      detail.dataset.k = key;
      data = data && cur.state !== "running" ? data : await loadData(e);
      const logTop = detail.querySelector(".xlog")?.scrollTop;
      const wasOpen = detail.querySelector("details.sec:last-of-type")?.open;
      detail.replaceChildren(stepView(cur, e, data));
      if (cur.state === "running") {
        const d = detail.querySelector("details.sec");
        if (d && wasOpen !== false) d.open = true;
        if (logTop) detail.querySelector(".xlog").scrollTop = logTop;
      }
    }
    const c = run.check;
    const last = e.videos[e.videos.length - 1];
    const vidKey = result.dataset.v;
    if (last !== vidKey || e.stills !== result.dataset.s) {
      result.dataset.v = last || ""; result.dataset.s = e.stills || "";
      const mine = [...e.videos].reverse();
      videos.replaceChildren(...[mine.find((v) => !v.includes("-mirror-")), mine.find((v) => v.includes("-mirror-"))].filter(Boolean).map((v) => el("video", { class: "xvideo", src: "/" + v, controls: true, preload: "metadata" })));
    }
  };
  await draw();
  const timer = setInterval(draw, 2000);
  return () => clearInterval(timer);
}

export async function render(main, { args }) {
  if (args[0]) return boardView(main, args[0]);
  listView(main, await get("/api/explainers"));
  return null;
}
