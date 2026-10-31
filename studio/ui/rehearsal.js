// The rehearsal player: an episode's timeline played live in the browser by the same engine the
// renders use (engine/runtime.js), with the captions on top and the real voice takes where they
// exist. Lines with no voice yet run on estimated timing (tools/timeline.py, estimate=True).
import { createStage } from "/engine/runtime.js";
import { el } from "./app.js";

const W = 540, H = 960;

export async function mountPlayer(host, { TL, slug, captions = "box", shotList = true }) {
  const [mode, scenario, ...mods] = await Promise.all([import(`/modes/${TL.mode}/set.js`), import(`/modes/${TL.mode}/scenarios/${TL.scenario || "night-city"}.js`), ...TL.cast.map((c) => import(`/characters/${c}/model.js`))]);
  const characters = Object.fromEntries(TL.cast.map((c, i) => [c, mods[i]]));
  const canvas = el("canvas", { width: W, height: H });
  const cap = el("div", { class: `cap ${captions === "box" ? "box" : "plain"}` });
  const overlay = el("div", { class: "overlay" }, cap);
  const tag = el("div", { class: "tag" }, "");
  const fade = el("div", { style: "position:absolute;inset:0;background:#000;opacity:0;pointer-events:none" });
  const box = el("div", { class: "stage" }, canvas, overlay, fade, tag);
  const E = TL.ending || {};
  const fadeAt = (t) => (E.type === "fade" ? Math.min(1, Math.max(0, (t - (TL.end - E.fadeOut - E.fadeHold)) / E.fadeOut)) : 0);
  const play = el("button", { class: "small" }, "▶ Play");
  const scrub = el("input", { type: "range", min: 0, max: TL.end, step: 0.01, value: 0, class: "grow" });
  const clock = el("span", { class: "mono note" }, "");
  const controls = el("div", { class: "row", style: "margin-top:10px" }, play, scrub, clock);
  const left = el("div", { style: "min-width:0" }, box, controls);
  const table = el("table", { class: "shotlist" });
  const wrap = el("div", { class: "player" }, left);
  if (shotList) wrap.append(el("div", { class: "shotlist" }, table));
  host.append(wrap);

  const stage = createStage({ canvas, width: W, height: H, TL, mode, scenario, characters });
  const lineById = Object.fromEntries(TL.lines.map((l) => [l.id, l]));
  const capAt = (t) => TL.captions.find((c) => t >= c.start && t < c.end)?.text || "";
  const rows = TL.shots.map((s) => {
    const l = s.line && lineById[s.line];
    const c = TL.captions.find((x) => x.line === s.line);
    const tr = el("tr", { style: "cursor:pointer", onclick: () => seek(s.start + 0.01) },
      el("td", { class: "mono" }, s.n),
      el("td", { class: "mono" }, `${s.start.toFixed(1)}`),
      el("td", { class: "mono" }, `${s.camera.type}${s.camera.on ? " · " + s.camera.on : ""}`),
      el("td", {}, c ? c.text : el("span", { class: "note" }, s.line ? "silent beat" : "end wide"), l?.estimated ? el("span", { class: "note" }, " (estimated)") : null));
    table.append(tr);
    return tr;
  });

  // real voice takes, played in step with the picture
  const takes = TL.lines.filter((l) => !l.estimated).map((l) => ({ ...l, audio: new Audio(`/episodes/${slug}/voice/${TL.lang}/${l.id}.wav`) }));
  takes.forEach((k) => (k.audio.preload = "auto"));
  const hush = () => takes.forEach((k) => !k.audio.paused && k.audio.pause());

  let t = 0, playing = false, last = performance.now(), raf = 0, drawn = -1, curShot = -1;
  const fit = () => (overlay.style.transform = `scale(${box.clientWidth / 1080})`);
  const ro = new ResizeObserver(fit);
  ro.observe(box);
  function seek(x) {
    t = Math.max(0, Math.min(TL.end - 0.01, x));
    hush();
    scrub.value = t;
  }
  function frame(now) {
    if (playing) {
      t += (now - last) / 1000;
      if (t >= TL.end) {
        t = 0;
        hush();
      }
      scrub.value = t;
      for (const k of takes) {
        const local = t - k.start;
        if (local >= 0 && local < k.dur) {
          if (k.audio.paused) {
            k.audio.currentTime = local;
            k.audio.play().catch(() => {});
          } else if (Math.abs(k.audio.currentTime - local) > 0.25) k.audio.currentTime = local;
        } else if (!k.audio.paused) k.audio.pause();
      }
    }
    last = now;
    if (t !== drawn) {
      stage.renderAt(t);
      drawn = t;
      const c = capAt(t);
      cap.textContent = c;
      cap.style.display = c ? "" : "none";
      clock.textContent = `${t.toFixed(2)} / ${TL.end.toFixed(1)} s`;
      fade.style.opacity = fadeAt(t);
      const s = stage.shotAt(t);
      const i = TL.shots.indexOf(s);
      if (i !== curShot) {
        rows[curShot]?.classList.remove("on");
        rows[i]?.classList.add("on");
        curShot = i;
        tag.textContent = s ? `shot ${s.n} · ${s.camera.type}` : "";
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? "❚❚ Pause" : "▶ Play";
    if (!playing) hush();
  };
  scrub.oninput = () => {
    seek(parseFloat(scrub.value));
    if (playing) play.click();
  };
  seek(TL.shots[0] ? Math.min(TL.end - 0.01, (TL.shots[0].start + TL.shots[0].end) / 2) : 0);
  return {
    seek,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      hush();
      stage.dispose();
      stage.renderer.forceContextLoss();
    },
  };
}
