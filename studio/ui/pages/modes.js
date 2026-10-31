// Modes side by side: the same demo scene played live in every mode at the same moment, with the
// current influencer as the lead, then the differences from each mode.json, then the private
// our own set-ups.
import { el, hint, ctx, charName } from "../app.js";
import { createStage } from "/engine/runtime.js";
import { loadScene, renderScene } from "../scenes.js";

const W = 540, H = 960;
// synthetic voice loudness (the demo has no audio), the same timing in every mode
function env(dur, seed) {
  const n = Math.round(dur * 30);
  return Array.from({ length: n }, (_, i) => {
    const s = Math.abs(Math.sin(i * 0.55 + seed)) * 0.8 + 0.2 * Math.abs(Math.sin(i * 1.7 + seed * 2));
    return Math.round(Math.max(0, s * Math.min(1, i / 4, (n - i) / 4)) * 1000) / 1000;
  });
}
const END = 11.5;
function demo(lead, mode, scenario) {
  const L = [
    { id: "d1", who: lead, to: "claude", start: 0.45, dur: 1.9, cap: "Claude! A new model just dropped!", emo: "excited", cam: { type: "lead" }, s: 0, e: 2.75 },
    { id: "d2", who: "claude", to: lead, start: 2.95, dur: 2.0, cap: "Let me guess. “The best one ever.”", emo: "deadpan", cam: { type: "cu", on: "claude" }, s: 2.75, e: 5.35 },
    { id: "d3", who: "codex", to: lead, start: 5.55, dur: 1.4, cap: "Third one this month.", emo: "smug", cam: { type: "two", on: "claude", with: "codex" }, s: 5.35, e: 7.35 },
    { id: "d4", who: lead, to: "claude", start: 7.6, dur: 1.5, cap: "...But this one is the best.", emo: "sheepish", cam: { type: "front" }, s: 7.35, e: 9.5 },
  ];
  const shots = L.map((l, i) => ({ n: i + 1, start: l.s, end: l.e, speaker: l.who, camera: l.cam }));
  shots.push({ n: 5, start: 9.5, end: END, camera: { type: "end" } });
  const emotions = L.map((l) => ({ t: l.s + 0.05, who: l.who, emotion: l.emo }));
  emotions.push({ t: 6.1, who: "claude", emotion: "deadpan" }, { t: 8.3, who: "claude", emotion: "busted" }, { t: 8.3, who: "codex", emotion: "deadpan" });
  return {
    TL: { lead, cast: [lead, "claude", "codex"], end: END, lang: "en", mode, scenario, shots, emotions, hops: [{ t: 5.6, who: "codex" }], leans: [{ who: "claude", start: 2.75, end: 5.35 }],
      lines: L.map((l, i) => ({ id: l.id, who: l.who, to: l.to, start: l.start, dur: l.dur, env: env(l.dur, i + 1), words: [] })), scales: {}, variants: {}, screen: null },
    caption: (t) => L.find((l) => t >= l.s && t < l.e)?.cap || "",
  };
}

export async function render(main) {
  const lead = ctx.influencer;
  const modes = ctx.data.studio.modes;
  const chars = Object.fromEntries(await Promise.all([lead, "claude", "codex"].map(async (c) => [c, await import(`/characters/${c}/model.js`)])));
  const scales = (m) => Object.fromEntries(["claude", "codex"].map((c) => [c, ctx.data.characters[c]?.scale?.[m]]).filter(([, v]) => v));
  main.append(el("h1", {}, "Modes"),
    hint(`Each mode is a set, a light, a lens, a camera grammar, a caption style and a sound. The same scene plays in every mode at the same moment with ${charName(lead)} as the lead, so the only difference is the mode. An episode picks its mode on Make video → Mode & look; a new mode is a folder in modes/ with set.js and mode.json.`));
  const play = el("button", { class: "small" }, "❚❚ Pause");
  const scrub = el("input", { type: "range", min: 0, max: END, step: 0.01, value: 0, class: "grow" });
  const clock = el("span", { class: "mono note" }, "0.00 s");
  main.append(el("div", { class: "card row", style: "margin:12px 0 16px" }, play, scrub, clock));
  const row = el("div", { class: "stages" });
  main.append(row);
  const stages = [];
  // one live stage per mode; the pills under it switch its scenario
  async function mount(s, scenarioId) {
    const [mode, scenario] = await loadScene(s.mode, scenarioId);
    const { TL, caption } = demo(lead, s.mode, scenarioId);
    TL.scales = scales(s.mode);
    TL.variants = Object.fromEntries(TL.cast.map((c) => [c, ctx.data.characters[c]?.variant]).filter(([, v]) => v));
    if (s.stage) {
      s.stage.dispose();
      s.stage.renderer.forceContextLoss();
    }
    const canvas = el("canvas", { width: W, height: H });
    s.box.querySelector("canvas")?.replaceWith(canvas);
    s.stage = createStage({ canvas, width: W, height: H, TL, mode, scenario, characters: chars });
    s.caption = caption;
    s.scenario = scenarioId;
    s.tag.textContent = `${ctx.data.modes[s.mode].name} · ${ctx.data.modes[s.mode].scenarios?.[scenarioId]?.name || scenarioId}`;
    s.pills.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.value === scenarioId));
  }
  for (const m of modes) {
    const info = ctx.data.modes[m];
    const cap = el("div", { class: `cap ${info.captions === "box" ? "box" : "plain"}` });
    const overlay = el("div", { class: "overlay" }, cap);
    const tag = el("div", { class: "tag" }, `${info.name} mode`);
    const box = el("div", { class: "stage" }, el("canvas", { width: W, height: H }), overlay, tag);
    const pills = el("div", { class: "pills", style: "justify-content:center;margin:10px 0 0" });
    const s = { mode: m, cap, overlay, box, tag, pills, stage: null, caption: () => "" };
    for (const [id, sc] of Object.entries(info.scenarios || { "night-city": { name: "Night city" } })) {
      pills.append(el("button", { class: "pillbtn", value: id, style: "padding:4px 12px;font-size:12px", onclick: () => mount(s, id) }, sc.name));
    }
    row.append(el("div", {}, box, pills, el("p", { class: "note", style: "text-align:center;margin:8px 0 0" }, info.summary)));
    stages.push(s);
    await mount(s, info.defaultScenario || "night-city");
  }
  const fit = () => stages.forEach((s) => (s.overlay.style.transform = `scale(${s.box.clientWidth / 1080})`));
  const ro = new ResizeObserver(fit);
  stages.forEach((s) => ro.observe(s.box));

  // every scenario of every mode, as a still with this influencer and the agents
  main.append(el("h2", {}, "Scenarios"), hint("A scenario is the place: the set, its light, what is around the cast. Each mode has its own. An episode picks one on Make video → Mode & look. Click one to play the scene above in it."));
  for (const m of modes) {
    const info = ctx.data.modes[m];
    const grid = el("div", { class: "cards-v", style: "grid-template-columns:repeat(auto-fill,minmax(230px,1fr))" });
    for (const [id, sc] of Object.entries(info.scenarios || {})) {
      const img = el("img", { alt: sc.name, style: "width:76px;height:135px" });
      renderScene({ mode: m, scenario: id, lead, cast: [lead, "claude", "codex"], camera: "wide" }).then((u) => (img.src = u));
      grid.append(el("a", { class: "card vcard", href: "javascript:void 0", onclick: () => {
        const s = stages.find((x) => x.mode === m);
        mount(s, id);
        s.box.scrollIntoView({ behavior: "smooth", block: "center" });
      } }, img, el("div", { class: "grow" }, el("b", {}, sc.name), el("div", { class: "note", style: "margin-top:4px" }, sc.summary), "")));
    }
    main.append(el("h3", {}, `${info.name} mode · ${Object.keys(info.scenarios || {}).length} scenarios`), grid);
  }

  // the camera set-ups of each mode
  main.append(el("h2", {}, "Camera set-ups"), hint("Every camera set-up of the mode: how much screen time it gets, how long it holds, where the face sits in the frame, how the camera moves."));
  for (const m of modes) {
    const S = ctx.data.setups?.[m];
    if (!S?.setups?.length) continue;
    const grid = el("div", { class: "cards-v", style: "grid-template-columns:repeat(auto-fill,minmax(330px,1fr))" });
    for (const su of S.setups) {
      const ours = el("img", { alt: "ours", style: "width:96px;height:171px;object-fit:cover;border-radius:8px;background:#151826" });
      renderScene({ mode: m, scenario: su.shot.scenario || ctx.data.modes[m].defaultScenario, lead, cast: [lead, "claude", "codex"], camera: su.shot.type, on: su.shot.on, prop: su.shot.prop }, { t: 0.4 }).then((u) => (ours.src = u));
      grid.append(el("div", { class: "card", style: "display:flex;gap:10px;padding:10px" },
        el("div", { class: "row", style: "gap:4px;align-items:flex-start;flex:0 0 auto" }, ours),
        el("div", { class: "grow" },
          el("b", {}, su.name), el("div", { class: "note mono" }, `${su.shot.type}${su.shot.scenario ? " · " + su.shot.scenario : ""}`),
          el("div", { class: "note", style: "margin-top:4px" }, `${Math.round((su.share || 0) * 1000) / 10}% of screen time · holds ${su.hold ?? "?"} s`),
          el("p", { class: "note", style: "margin:6px 0 0" }, su.framing), el("p", { class: "note", style: "margin:4px 0 0" }, su.motion))));
    }
    main.append(el("h3", {}, `${ctx.data.modes[m].name} mode`), grid);
  }

  const keys = [...new Set(modes.flatMap((m) => Object.keys(ctx.data.modes[m].spec || {})))];
  const table = el("table", {}, el("tr", {}, el("th", {}, ""), ...modes.map((m) => el("th", {}, `${ctx.data.modes[m].name} mode`))));
  for (const k of keys) table.append(el("tr", {}, el("th", {}, k), ...modes.map((m) => el("td", {}, ctx.data.modes[m].spec?.[k] || ""))));
  main.append(el("h2", {}, "What changes between the modes"), el("div", { class: "card", style: "padding:6px 12px" }, table));

  let t = 0, playing = true, last = performance.now(), raf = 0;
  function frame(now) {
    if (playing) {
      t = (t + (now - last) / 1000) % END;
      scrub.value = t;
    }
    last = now;
    for (const s of stages) {
      if (!s.stage) continue;
      s.stage.renderAt(t);
      const c = s.caption(t);
      s.cap.textContent = c;
      s.cap.style.display = c ? "" : "none";
    }
    clock.textContent = `${t.toFixed(2)} s`;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? "❚❚ Pause" : "▶ Play";
  };
  scrub.oninput = () => {
    t = parseFloat(scrub.value);
    playing = false;
    play.textContent = "▶ Play";
  };
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    for (const s of stages) {
      s.stage.dispose();
      s.stage.renderer.forceContextLoss();
    }
  };
}
