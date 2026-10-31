// The stage: one mode (camera grammar, look), one of its scenarios (the place, its light and
// props, where the cast stands), a cast of characters, a timeline. renderAt(t) draws the frame at
// time t and nothing else: no clock, so HyperFrames can seek any frame and the hub can scrub or
// play the same scene.
//
// Timeline (written by tools/timeline.py):
//   lead, cast[], variants{}, scales{}, end, lang, screen{}
//   lines[]    { id, who, to?, start, dur, env[], words[] }      a voiced line and its loudness per frame
//   shots[]    { n, start, end, speaker?, camera: { type, on?, with? } }
//   emotions[] { t, who, emotion, blend? }                        emotion keyframes per character
//   hops[]     { t, who, dur?, height? }
//   leans[]    { who, start, end }
//   props[]    { who, start, end, prop }                         a prop in hand for a while ("phone")
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { clamp, smooth, blinkSchedule, blinkAt, envAt, hash32, V } from "./util.js";

export function createStage({ canvas, width = 1080, height = 1920, TL, mode, scenario, characters }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 400);

  const lead = TL.lead;
  const castIds = TL.cast.filter((id) => characters[id]);
  const agents = castIds.filter((id) => id !== lead);
  const cast = {};
  for (const id of castIds) {
    cast[id] = characters[id].build({ seat: id === lead ? scenario?.meta?.seat || mode.meta.seat : undefined, variant: TL.variants?.[id] });
    scene.add(cast[id].root);
  }
  const set = mode.build({ scene, renderer, camera, cast, lead, agents, TL, scenario, scales: TL.scales || {} });

  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  let bokeh = null;
  if (set.post.bokeh) {
    bokeh = new BokehPass(scene, camera, { focus: 10, aperture: set.post.bokeh.aperture, maxblur: set.post.bokeh.maxblur });
    composer.addPass(bokeh);
  }
  const [bs, br, bt] = set.post.bloom || [0.5, 0.5, 0.85];
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), bs, br, bt));
  composer.addPass(new OutputPass());

  const lines = TL.lines || [];
  const shots = TL.shots || [];
  const hops = TL.hops || [];
  const leans = TL.leans || [];
  const props = TL.props || [];
  const propOf = (id, t) => props.find((p) => p.who === id && t >= p.start && t < p.end)?.prop || null;
  const blinks = Object.fromEntries(castIds.map((id) => [id, blinkSchedule((hash32(id) % 997) + 3)]));
  const keys = Object.fromEntries(castIds.map((id) => [id, (TL.emotions || []).filter((e) => e.who === id).sort((a, b) => a.t - b.t)]));

  const speakingAt = (t) => lines.find((l) => t >= l.start && t < l.start + l.dur) || null;
  const lastLineBefore = (t) => {
    let s = null;
    for (const l of lines) if (l.start <= t) s = l;
    return s;
  };
  function talkOf(id, t) {
    for (const l of lines) if (l.who === id && t >= l.start && t < l.start + l.dur) return envAt(l.env, t - l.start);
    return 0;
  }
  function emotionOf(id, t) {
    let cur = null, prev = null;
    for (const e of keys[id]) {
      if (e.t > t) break;
      prev = cur;
      cur = e;
    }
    if (!cur) return { emotion: "neutral", from: "neutral", mix: 1 };
    return { emotion: cur.emotion, from: prev ? prev.emotion : "neutral", mix: smooth(cur.t, cur.t + (cur.blend ?? 0.3), t) };
  }
  function hopOf(id, t) {
    let h = 0;
    for (const e of hops) {
      if (e.who !== id) continue;
      const u = (t - e.t) / (e.dur ?? 0.45);
      if (u > 0 && u < 1) h = Math.max(h, Math.sin(u * Math.PI) * (e.height ?? 1));
    }
    return h;
  }
  function leanOf(id, t) {
    let v = 0;
    for (const e of leans) if (e.who === id && t >= e.start && t < e.end + 0.3) v = Math.max(v, smooth(e.start, e.start + 0.4, t) * (1 - smooth(e.end, e.end + 0.3, t)));
    return v;
  }
  const pa = V(), pb = V();
  function lookOf(id, t) {
    // attend to the speaker; while speaking, attend to the addressee
    const cur = speakingAt(t) || lastLineBefore(t);
    if (!cur) return 0;
    const target = cur.who === id ? cur.to || (id === lead ? agents[0] : lead) : cur.who;
    if (!target || !cast[target] || target === id) return 0;
    cast[id].root.getWorldPosition(pa);
    cast[target].anchors.head.getWorldPosition(pb);
    let d = Math.atan2(pb.x - pa.x, pb.z - pa.z) - (cast[id].root.userData.baseYaw ?? 0);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return clamp(d, -0.7, 0.7) * (id === lead ? 0.45 : 0.6);
  }
  function shotAt(t) {
    let s = shots[0] || null;
    for (const x of shots) if (x.start <= t) s = x;
    return s;
  }
  function applyCamera(t) {
    const s = shotAt(t);
    const type = s?.camera?.type || set.fallback;
    const fn = set.cameras[type] || set.cameras[set.fallback];
    const k = s ? clamp((t - s.start) / Math.max(0.001, s.end - s.start)) : 0;
    const c = fn(k, { ...(s?.camera || {}), speaker: s?.speaker, elapsed: s ? t - s.start : 0, duration: s ? s.end - s.start : 0 });
    if (s?.camera?.punch) c.pos = c.look.clone().add(c.pos.clone().sub(c.look).multiplyScalar(s.camera.punch));
    camera.fov = c.fov;
    camera.position.copy(c.pos);
    camera.lookAt(c.look);
    camera.updateProjectionMatrix();
    if (bokeh && c.focus) {
      bokeh.uniforms.focus.value = camera.position.distanceTo(c.focus);
      bokeh.uniforms.maxblur.value = c.dof ?? set.post.bokeh.maxblur;
    }
    return c;
  }
  function renderAt(time) {
    const t = clamp(time, 0, (TL.end || 1e9) - 1e-4);
    scene.updateMatrixWorld(true);
    for (const id of castIds) {
      cast[id].update(t, { ...emotionOf(id, t), talk: talkOf(id, t), blink: blinkAt(blinks[id], t), hop: hopOf(id, t), lean: leanOf(id, t), look: lookOf(id, t), prop: propOf(id, t) });
    }
    scene.updateMatrixWorld(true);
    const c = applyCamera(t);
    set.update?.(t, c);
    composer.render();
  }
  function dispose() {
    composer.dispose?.();
    target.dispose();
    renderer.dispose();
  }
  return { renderAt, dispose, renderer, scene, camera, cast, set, shotAt };
}
