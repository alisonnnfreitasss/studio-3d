// The stage: the generic part of every build's main.js (the skyscraper's, which is the engine build's
// renderer, post stack and motion blur, unchanged): the renderer, the post stack (N8AO, gather depth of
// field, bloom behind an HDR clamp, neutral tone mapping, grade, vignette), image-based light, the sky
// presets (day, dusk, night, mixed with storm and hot), the light rig with the shadow box following each
// view, the cast (the lead Pixel, the girl, props on their joints, carried objects), pose-to-pose blends,
// split views via rects, sub-frame motion blur on fast moves, glass and lacquer reflections, and
// renderAt(t), which sets window.__frame for the shot-map probe and the stills tool.
//
// A reel gives it its own content through js/reel.js (see kit/README.md, "The contract"):
//   createStage(canvas, root, reel) -> { renderAt(t), scene, ctx }
import * as THREE from "three";
import { build as buildPixel, applyPose, POSE_EMOTION } from "./pixel.js";
import { blinkSchedule, blinkAt } from "./util.js";
import { clamp, lerp, springStep } from "./kit.js";
import { recolour, unflipText, SKY as SEASON_SKY } from "./season.js";
import { createOverlay } from "./overlay.js";
import { setEnv } from "./shapes.js";
import { LOOK } from "./look.js";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, DepthOfFieldEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, HueSaturationEffect, BrightnessContrastEffect } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GatherDOF, HdrClamp, Grade } from "./fx.js";
import { softStudio } from "./softenv.js";
import { MOTION } from "./motion-config.js";

const W = 720, H = 1280;
const FPS = 30;

// the skies: day, dusk and night from the skyscraper (env.sky 0, 1, 2, or the names), storm and hot from
// the roof (env.storm, env.hot 0..1, mixed over the sky). A reel may override any of them (STAGE.skies).
export const SKIES = {
  day: { bg: 0x9fd4ff, hemiSky: 0xffffff, hemiGround: 0x9a8c74, hemi: 1.5, sun: 2.4, sunCol: 0xfff1dc },
  dusk: { bg: 0xb48ab8, hemiSky: 0xffe0d0, hemiGround: 0x8a7470, hemi: 1.6, sun: 2.0, sunCol: 0xffc090 },
  night: { bg: 0x101a3c, hemiSky: 0x8fa4ee, hemiGround: 0x252e48, hemi: 0.7, sun: 0.35, sunCol: 0xb8c8ff },
  storm: { bg: 0x4a5160, hemiSky: 0xb8c0cc, hemiGround: 0x4a5048, hemi: 1.15, sun: 0.75, sunCol: 0xd8e0ea },
  hot: { bg: 0xa8dcff, hemiSky: 0xfff4dc, hemiGround: 0x8a8a5a, hemi: 1.9, sun: 3.4, sunCol: 0xffe2b0 },
};

export function createStage(canvas, root, reel) {
  // a mirrored render: the 3D is flipped here, the text layer keeps its letters (see overlay.js, MIR)
  if (window.__MIRROR) canvas.style.transform = "scaleX(-1)";
  const OPT = { near: 0.25, far: 4200, fog: [700, 2900], leadScale: 0.42, ...(reel.STAGE || {}) };
  const NEAR = OPT.near, FAR = OPT.far;
  const SK = { ...SKIES, ...(OPT.skies || {}) };
  if (SEASON_SKY) for (const k in SEASON_SKY) SK[k] = { ...SK[k], ...SEASON_SKY[k] };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOOK.post, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(LOOK.ss);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = LOOK.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.post ? LOOK.exposure : 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOOK.shadowType === "vsm" ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;

  setEnv(renderer); // reflections for metal, glass and gloss paint (per material)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SK.day.bg);
  if (OPT.fog) scene.fog = new THREE.Fog(SK.day.bg, OPT.fog[0], OPT.fog[1]);
  if (LOOK.env) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(LOOK.envKind === "room" ? new RoomEnvironment() : softStudio(), 0.04).texture;
    pmrem.dispose();
    scene.environmentIntensity = LOOK.envIntensity;
  }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOOK.shadowMap, LOOK.shadowMap);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
  if (LOOK.shadowType === "vsm") { sun.shadow.radius = LOOK.vsmRadius; sun.shadow.blurSamples = LOOK.vsmSamples; sun.shadow.bias = -0.0002; }
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
  scene.add(fill, fill.target);
  const rim = new THREE.DirectionalLight(0xd6e6ff, 0);
  scene.add(rim, rim.target);

  // the post stack (as the engine build): scene -> N8AO -> one merged pass
  let composer = null, postCam = null, dof = null, grade = null;
  if (LOOK.post) {
    postCam = new THREE.PerspectiveCamera(40, W / H, NEAR, FAR);
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, postCam));
    if (LOOK.hdrClamp) composer.addPass(new EffectPass(postCam, new HdrClamp({ maxValue: LOOK.hdrClamp })));
    if (LOOK.ao) {
      const n8 = new N8AOPostPass(scene, postCam, W * LOOK.ss, H * LOOK.ss);
      n8.setQualityMode(LOOK.aoQuality);
      n8.configuration.aoRadius = OPT.aoRadius ?? LOOK.aoRadius;
      n8.configuration.distanceFalloff = LOOK.aoFalloff;
      n8.configuration.intensity = LOOK.aoIntensity;
      n8.configuration.color = new THREE.Color(LOOK.aoColor);
      n8.configuration.gammaCorrection = false;
      n8.configuration.accumulate = false;
      composer.addPass(n8);
    }
    const fx = [];
    if (LOOK.dof === "gather") {
      dof = new GatherDOF({ maxBlur: LOOK.bokeh * LOOK.ss, band: LOOK.dofBand, gain: LOOK.dofGain, radScale: LOOK.dofStep });
      fx.push(dof);
    } else if (LOOK.dof) {
      dof = new DepthOfFieldEffect(postCam, { focusDistance: 10, focusRange: 3, bokehScale: LOOK.bokeh * LOOK.ss, resolutionScale: LOOK.dofRes });
      dof.target = new THREE.Vector3();
      fx.push(dof);
    }
    if (LOOK.bloom) fx.push(new BloomEffect({ luminanceThreshold: LOOK.bloomThreshold, luminanceSmoothing: LOOK.bloomSmoothing,
      intensity: LOOK.bloomIntensity, radius: LOOK.bloomRadius, mipmapBlur: true, levels: 8 }));
    fx.push(new ToneMappingEffect({ mode: ToneMappingMode[LOOK.tone] }));
    grade = new Grade(); // env.grey (a rewind in greyscale) and env.dim (a storm or a night darker than its sky), per view
    fx.push(grade);
    if (LOOK.saturation) fx.push(new HueSaturationEffect({ saturation: LOOK.saturation }));
    if (LOOK.contrast) fx.push(new BrightnessContrastEffect({ contrast: LOOK.contrast }));
    if (LOOK.vignette) fx.push(new VignetteEffect({ offset: LOOK.vignetteOffset, darkness: LOOK.vignetteDarkness }));
    composer.addPass(new EffectPass(postCam, ...fx));
  }

  // ---- the cast (built before the world, so the world may hang things on them) ----
  const ctx = { scene, renderer, THREE, cast: {}, props: {}, LOOK, W, H, opts: OPT, lights: { hemi, sun, fill, rim } };
  const castList = [];
  (reel.CAST || []).forEach((c, i) => {
    const ch = buildPixel({ kind: c.kind, variant: c.variant, seat: c.seat });
    scene.add(ch.root);
    const entry = { who: c.who, ch, scale: c.scale ?? OPT.leadScale, blinks: blinkSchedule(c.blinkSeed ?? 11 + 18 * i), props: {}, hands: [] };
    const skin = ch.mats.skin;
    entry.skinBase = { c: skin.color.clone(), e: skin.emissive.clone() };
    // props on joints: { name, build: () => Object3D, joint, pos, rot, scale, always }
    // joints: head, torso, hips, body, root, handR / handL (at the hand), elbowR / elbowL, hands (carried
    // between both hands: placed every frame at the hands' midpoint, turned with the body)
    const J = { head: ch.rig.head, torso: ch.rig.torso, hips: ch.rig.hips, body: ch.rig.body, root: ch.root,
      handR: ch.rig.arms[-1].elbow, handL: ch.rig.arms[1].elbow, elbowR: ch.rig.arms[-1].elbow, elbowL: ch.rig.arms[1].elbow };
    for (const p of c.props || []) {
      const obj = p.build();
      const joint = p.joint || "root";
      if (joint === "hands") { ch.root.add(obj); entry.hands.push(p.name); }
      else {
        (J[joint] || ch.root).add(obj);
        const def = joint === "handR" || joint === "handL" ? [0, -0.68, 0] : [0, 0, 0];
        obj.position.set(...(p.pos || def));
      }
      if (p.rot) obj.rotation.set(...p.rot);
      if (p.scale) obj.scale.setScalar(p.scale);
      obj.userData.prop = p;
      obj.visible = !!p.always;
      entry.props[p.name] = obj;
    }
    ctx.cast[c.who] = ch;
    ctx.props[c.who] = entry.props; // overlay anchors: ov.pill(..., ctx.props.lead.log)
    castList.push(entry);
  });

  // ---- the world ----
  const world = (reel.buildWorld && reel.buildWorld(scene, ctx)) || {};
  recolour(scene); // the season (season.js): a no-op in summer
  unflipText(scene); // mirrored renders: words painted into 3D textures read the right way (season.js)
  ctx.world = world;
  const cams = [new THREE.PerspectiveCamera(40, W / H, NEAR, FAR), new THREE.PerspectiveCamera(40, W / H, NEAR, FAR), new THREE.PerspectiveCamera(40, W / H, NEAR, FAR)];
  const overlay = createOverlay(root, { types: reel.OVERLAY_TYPES });
  const direct = (t) => reel.direct(t, ctx);
  // the cast states at t (the pose blends query this many times near a change: a reel can export a
  // cheaper castAt(t, ctx) that returns the same cast states as direct(t).cast)
  const castAt = reel.castAt ? (t) => reel.castAt(t, ctx) : (t) => direct(t).cast || {};

  // ---- sky mixing ----
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  function skyOf(E = {}) {
    let k = E.sky ?? 0;
    if (typeof k === "string") k = k === "night" ? 2 : k === "dusk" ? 1 : 0;
    const i = Math.min(1, Math.floor(k)), f = k - i;
    const A = i === 0 ? SK.day : SK.dusk, B = i === 0 ? SK.dusk : SK.night;
    const out = {
      bg: new THREE.Color(A.bg).lerp(c1.setHex(B.bg), f), hemiSky: new THREE.Color(A.hemiSky).lerp(c1.setHex(B.hemiSky), f),
      hemiGround: new THREE.Color(A.hemiGround).lerp(c1.setHex(B.hemiGround), f), hemi: lerp(A.hemi, B.hemi, f), sun: lerp(A.sun, B.sun, f),
      sunCol: new THREE.Color(A.sunCol).lerp(c1.setHex(B.sunCol), f), k,
    };
    for (const key of ["storm", "hot"]) {
      const a = clamp(E[key] ?? 0);
      if (a <= 0) continue;
      const S = SK[key];
      out.bg.lerp(c1.setHex(S.bg), a); out.hemiSky.lerp(c1.setHex(S.hemiSky), a); out.hemiGround.lerp(c1.setHex(S.hemiGround), a);
      out.sunCol.lerp(c1.setHex(S.sunCol), a);
      out.hemi = lerp(out.hemi, S.hemi, a); out.sun = lerp(out.sun, S.sun, a);
    }
    // lightning: the sky and the fill jump toward a cold white
    const fl = clamp(E.flash ?? 0);
    if (fl > 0) { out.bg.lerp(c2.setHex(0xdfe7ff), 0.65 * fl); out.hemi *= 1 + 2.2 * fl; out.hemiSky.lerp(c2.setHex(0xeef3ff), fl); }
    return out;
  }

  // ---- the cast per frame ----
  function placeChar(e, st, t) {
    const ch = e.ch;
    ch.root.visible = !!st && st.visible !== false;
    if (!ch.root.visible) return;
    ch.root.position.set(...(st.pos || [0, 0, 0]));
    if (st.lie) ch.root.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + (st.yaw ?? 0));
    else ch.root.rotation.set(st.pitch ?? 0, st.yaw ?? 0, st.roll ?? 0);
    ch.root.scale.setScalar(st.scale ?? e.scale);
    ch.update(t, { emotion: st.emotion || POSE_EMOTION[st.pose] || "neutral", from: st.from, mix: st.mix ?? 1, blink: blinkAt(e.blinks, t),
      look: st.look || 0, hop: st.hop || 0, talk: st.talk || 0, prop: st.prop, sweat: st.sweat || 0 });
    for (const s of [-1, 1]) {
      ch.rig.legs[s].hip.rotation.x = 0;
      ch.rig.legs[s].knee.rotation.x = 0;
    }
    applyPose(ch, st, t);
    if (st.headYaw) ch.rig.head.rotation.y += st.headYaw;
    if (st.headPitch) ch.rig.head.rotation.x += st.headPitch;
  }
  // after the blend: props, carried objects, skin
  const _ha = new THREE.Vector3(), _hb = new THREE.Vector3();
  function finishChar(e, st) {
    const ch = e.ch;
    for (const [name, obj] of Object.entries(e.props)) {
      const p = obj.userData.prop;
      const on = !!st && st.visible !== false && (p.always || (Array.isArray(st.props) && st.props.includes(name)) || st.carry === name || st[name] === true);
      obj.visible = on;
    }
    if (st && st.carry && e.props[st.carry] && e.hands.includes(st.carry)) {
      // between the two hands, in the character's root space (it turns and scales with him)
      ch.root.updateMatrixWorld(true);
      ch.rig.arms[1].hand.getWorldPosition(_ha);
      ch.rig.arms[-1].hand.getWorldPosition(_hb);
      _ha.add(_hb).multiplyScalar(0.5);
      const obj = e.props[st.carry], p = obj.userData.prop;
      ch.root.worldToLocal(_ha);
      obj.position.copy(_ha);
      if (p.pos) obj.position.add(_hb.set(...p.pos));
    }
    // skin flush: st.flush = { color, k } (or st.sick 0..1, the skyscraper's seasick green)
    const fl = st && (st.flush || (st.sick ? { color: 0x6fbf4a, k: st.sick, e: 0x1d4a10 } : null));
    const skin = ch.mats.skin;
    skin.color.copy(e.skinBase.c);
    skin.emissive.copy(e.skinBase.e);
    if (fl && fl.k > 0) {
      skin.color.lerp(c1.setHex(fl.color), fl.k);
      skin.emissive.lerp(c1.setHex(fl.e ?? new THREE.Color(fl.color).multiplyScalar(0.3).getHex()), fl.k);
    }
  }

  // ---- pose-to-pose transitions (the engine build's motion research, unchanged) ----
  const keyOf = (st) => (st && st.visible !== false ? `${st.pose || "-"}|${st.arms || "-"}|${st.emotion || "neutral"}` : "none");
  const stOf = (tt, who) => castAt(tt)[who];
  function findChange(t, who, lo, hi, kHi) {
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (keyOf(stOf(mid, who)) === kHi) hi = mid; else lo = mid;
    }
    return hi;
  }
  const BACK = 0.5, AHEAD = 0.12, WIND = 0.09, WINDK = 0.08;
  const shotAt = reel.shotAt ? (t) => reel.shotAt(t, ctx) : (t) => direct(t).shot;
  const cutBetween = (who, ta, tb) => {
    const a = stOf(ta, who), b = stOf(tb, who);
    if (shotAt(ta) !== shotAt(tb) || !a || !b) return true;
    const pa = a.pos || [0, 0, 0], pb = b.pos || [0, 0, 0];
    return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) > 0.6 || (a.scale ?? 1) !== (b.scale ?? 1) || !!a.lie !== !!b.lie;
  };
  function transition(t, who, st) {
    if (!MOTION.character || !st || st.visible === false || st.lie) return null;
    const k = keyOf(st);
    let past = null, ahead = null;
    const k2 = keyOf(stOf(t - 0.2, who));
    const k5 = keyOf(stOf(t - BACK, who));
    let tc = null;
    if (k2 !== k) tc = findChange(t, who, t - 0.2, t, k);
    else if (k5 !== k) tc = findChange(t, who, t - BACK, t - 0.2, k2);
    if (tc != null && !cutBetween(who, tc - 0.002, tc + 0.002)) past = { from: stOf(tc - 0.002, who), tau: t - tc };
    const kn = keyOf(stOf(t + AHEAD, who));
    if (kn !== k) {
      const tf = findChange(t, who, t, t + AHEAD, kn);
      if (!cutBetween(who, tf - 0.002, tf + 0.002)) ahead = { to: stOf(tf + 0.002, who), tau: t - tf };
    }
    return past || ahead ? { past, ahead } : null;
  }
  const SPRING_W = 17, SPRING_Z = 0.55;
  function wBlend(tau) {
    if (tau < 0) return -WINDK * Math.sin((clamp((tau + WIND) / WIND) * Math.PI) / 2) ** 2;
    return -WINDK + (1 + WINDK) * springStep(tau, SPRING_W, SPRING_Z);
  }
  const JOINTS = (rig) => [
    [rig.torso.rotation, "x", 0], [rig.body.position, "y", 0],
    ...[-1, 1].flatMap((s) => [[rig.legs[s].hip.rotation, "x", 0], [rig.legs[s].knee.rotation, "x", 0.02]]),
    ...[-1, 1].flatMap((s) => ["x", "y", "z"].flatMap((a) => [[rig.arms[s].sh.rotation, a, 0.025], [rig.arms[s].elbow.rotation, a, 0.07]])),
    ...["x", "y", "z"].map((a) => [rig.head.rotation, a, 0.05]),
  ];
  const readJ = (J) => J.map(([o, a]) => o[a]);
  function placeCharMotion(e, st, t) {
    placeChar(e, st, t);
    const tr = transition(t, e.who, st);
    if (tr) {
      const J = JOINTS(e.ch.rig);
      const cur = readJ(J);
      const as = (o) => ({ ...o, pos: st.pos, yaw: st.yaw, scale: st.scale });
      let from = null, to = null;
      if (tr.past) { placeChar(e, as(tr.past.from), t); from = readJ(J); }
      if (tr.ahead) { placeChar(e, as(tr.ahead.to), t); to = readJ(J); }
      placeChar(e, st, t);
      J.forEach(([o, a, lag], i) => {
        let v = cur[i];
        if (from) v = from[i] + (cur[i] - from[i]) * wBlend(tr.past.tau - lag);
        if (to) v = v + (to[i] - cur[i]) * wBlend(tr.ahead.tau - lag);
        o[a] = v;
      });
    }
    finishChar(e, st);
  }

  // ---- lights for a view: the sky by env; the shadow box follows the view's look point and grows
  // with the camera distance, so shadows stay sharp near and reach far (the skyscraper's) ----
  const tmpV = new THREE.Vector3();
  const SUN_DIR = new THREE.Vector3(-0.42, 0.78, 0.46); // the skyscraper's sun (azimuth -42.4 degrees); env.sunAz turns it
  function applyEnv(E, look, dist, interior) {
    const S = skyOf(E);
    scene.background = S.bg;
    if (scene.fog) scene.fog.color.copy(scene.background);
    hemi.color.copy(S.hemiSky);
    hemi.groundColor.copy(S.hemiGround);
    const ls = LOOK.post ? LOOK.lightScale : 1;
    const hs = (LOOK.env ? LOOK.hemiScale : 1) * ls;
    hemi.intensity = S.hemi * hs * (interior ? 1.25 : 1);
    sun.color.copy(S.sunCol);
    sun.intensity = S.sun * LOOK.sunScale * ls;
    if (LOOK.env) scene.environmentIntensity = LOOK.envIntensity * ls * lerp(1, 0.3, clamp(S.k / 2)) * lerp(1, 0.7, clamp(E.storm ?? 0));
    fill.intensity = (interior ? 0.75 : 0.45) * ls;
    const focus = tmpV.set(...look);
    const ext = clamp(dist * 0.62, OPT.shadowMin ?? 10, OPT.shadowMax ?? 190);
    const cam = sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = ext * 7 + 60;
    cam.updateProjectionMatrix();
    sun.shadow.normalBias = 0.03 + ext * 0.0009;
    const L = ext * 2.6 + 30;
    let d = SUN_DIR;
    if (E.sunAz != null) {
      const a = (E.sunAz * Math.PI) / 180, h = Math.hypot(SUN_DIR.x, SUN_DIR.z);
      d = new THREE.Vector3(Math.sin(a) * h, SUN_DIR.y, Math.cos(a) * h);
    }
    sun.position.set(focus.x + d.x * L, focus.y + d.y * L, focus.z + d.z * L);
    sun.target.position.copy(focus);
    sun.target.updateMatrixWorld();
    fill.position.set(focus.x + 20, focus.y + 10, focus.z + 30);
    fill.target.position.copy(focus);
    fill.target.updateMatrixWorld();
  }

  function poseAt(t) {
    const F = direct(t);
    F.cast = F.cast || {};
    if (world.update) world.update(t, F, ctx);
    for (const e of castList) placeCharMotion(e, F.cast[e.who], t);
    return F;
  }
  function setupViews(F) {
    return F.views.map((v, i) => {
      const cam = cams[i];
      const [rx, ry, rw, rh] = v.rect || [0, 0, 1, 1];
      cam.aspect = (rw * W) / (rh * H);
      cam.fov = v.cam.fov ?? 40;
      cam.position.set(...v.cam.p);
      cam.up.set(0, 1, 0);
      cam.lookAt(...v.cam.l);
      if (v.cam.roll) cam.rotateZ(v.cam.roll);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      return { camera: cam, rect: [rx, ry, rw, rh] };
    });
  }
  function drawViews(F) {
    const views = setupViews(F);
    renderer.setScissorTest(true);
    F.views.forEach((v, i) => {
      const [rx, ry, rw, rh] = v.rect || [0, 0, 1, 1];
      const x = rx * W, y = (1 - ry - rh) * H, w = rw * W, h = rh * H;
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      const dist = Math.hypot(v.cam.l[0] - v.cam.p[0], v.cam.l[1] - v.cam.p[1], v.cam.l[2] - v.cam.p[2]);
      const E = { ...(F.env || {}), ...(v.env || {}), ...(v.sky != null ? { sky: v.sky } : {}) };
      applyEnv(E, v.cam.focus || v.cam.l, dist, v.interior ?? E.interior);
      // per view, the world may hide or fold things (a cut-away's near half, a bonnet in front of the lens)
      if (world.view) world.view(v, F, i, ctx);
      const cam = cams[i];
      if (LOOK.rim) {
        const l = tmpV.set(...v.cam.l);
        const dir = l.clone().sub(cam.position).setY(0).normalize();
        const s = clamp(dist / 20, 1, 12);
        rim.position.set(l.x + dir.x * 30 * s - dir.z * 10 * s, l.y + 24 * s, l.z + dir.z * 30 * s + dir.x * 10 * s);
        rim.target.position.copy(l);
        rim.target.updateMatrixWorld();
        const k = typeof E.sky === "number" ? E.sky : E.sky === "night" ? 2 : E.sky === "dusk" ? 1 : 0;
        rim.intensity = LOOK.rimIntensity * lerp(0.8, 0.45, clamp(k / 2)) * (LOOK.post ? LOOK.lightScale : 1);
      }
      if (composer) {
        postCam.copy(cam);
        postCam.near = NEAR; postCam.far = FAR;
        postCam.updateProjectionMatrix();
        postCam.updateMatrixWorld();
        if (dof instanceof GatherDOF) {
          dof.focusZ = postCam.position.distanceTo(tmpV.set(...(v.cam.focus || v.cam.l)));
          dof.uniforms.get("gain").value = LOOK.dofGain * Math.max(0, E.dof ?? 1);   // env.dof 0 = all sharp
        }
        else if (dof) {
          dof.target.set(...v.cam.l);
          dof.cocMaterial.focusRange = Math.max(1.2, postCam.position.distanceTo(dof.target) * LOOK.dofRange);
        }
        if (grade) grade.set(E.grey ?? 0, E.dim ?? 0);
        composer.render(0);
      } else {
        // no post stack: the grade as a CSS filter on the canvas (one per frame, from the first view)
        if (i === 0) canvas.style.filter = (E.grey ? `grayscale(${clamp(E.grey)}) ` : "") + (E.dim ? `brightness(${Math.max(0.1, 1 - 0.45 * Math.min(2, E.dim)).toFixed(3)})` : "") || "none";
        renderer.render(scene, cam);
      }
    });
    renderer.setScissorTest(false);
    return views;
  }

  // ---- sub-frame motion blur on fast camera moves (the engine build's, unchanged) ----
  const _a = new THREE.PerspectiveCamera(), _b = new THREE.PerspectiveCamera(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function placeCam(c, v) {
    const [, , rw, rh] = v.rect || [0, 0, 1, 1];
    c.aspect = (rw * W) / (rh * H); c.fov = v.cam.fov ?? 40;
    c.near = NEAR; c.far = FAR;
    c.position.set(...v.cam.p); c.up.set(0, 1, 0); c.lookAt(...v.cam.l);
    if (v.cam.roll) c.rotateZ(v.cam.roll);
    c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
  function screenMotion(FA, FB) {
    let best = 0;
    FA.views.forEach((va, i) => {
      const vb = FB.views[i];
      const [, , rw, rh] = va.rect || [0, 0, 1, 1];
      placeCam(_a, va); placeCam(_b, vb);
      const d = Math.hypot(va.cam.l[0] - va.cam.p[0], va.cam.l[1] - va.cam.p[1], va.cam.l[2] - va.cam.p[2]);
      const z = _v.set(0, 0, -d).applyMatrix4(_a.projectionMatrix).z;
      for (const gx of [-0.8, 0, 0.8]) for (const gy of [-0.8, 0, 0.8]) {
        _v.set(gx, gy, z).unproject(_a);
        _w.copy(_v).project(_b);
        best = Math.max(best, Math.hypot((_w.x - gx) * rw * W / 2, (_w.y - gy) * rh * H / 2));
      }
    });
    return best;
  }
  function samplesFor(t) {
    if (!MOTION.blur) return { n: 1, px: 0 };
    const h = 0.5 / FPS;
    const F0 = direct(t - h), F1 = direct(t), F2 = direct(t + h);
    if (F0.shot !== F1.shot || F2.shot !== F1.shot || F0.views.length !== F2.views.length) return { n: 1, px: 0 };
    const m1 = screenMotion(F0, F1), m2 = screenMotion(F1, F2);
    if (Math.max(m1, m2) > 4 * Math.min(m1, m2) + 20) return { n: 1, px: 0 };
    let px = m1 + m2;
    if (F1.flySpeed > 0) {
      const v = F1.views[0].cam, d = Math.hypot(v.l[0] - v.p[0], v.l[1] - v.p[1], v.l[2] - v.p[2]);
      px = Math.max(px, (F1.flySpeed / (d * Math.tan(((v.fov ?? 40) * Math.PI) / 360))) * (H / 2));
    }
    const len = px * MOTION.shutter;
    return { n: len < 4 ? 1 : Math.min(MOTION.maxSpp, Math.max(3, Math.ceil(len / 2.5))), px };
  }
  const fbTex = new THREE.FramebufferTexture(W * (LOOK.ss || 1), H * (LOOK.ss || 1));
  const acc = new THREE.WebGLRenderTarget(W * (LOOK.ss || 1), H * (LOOK.ss || 1), { type: THREE.HalfFloatType, depthBuffer: false });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const VS = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const accMat = new THREE.ShaderMaterial({
    uniforms: { src: { value: fbTex }, w: { value: 1 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D src; uniform float w; varying vec2 vUv;
      vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main() { gl_FragColor = vec4(lin(texture2D(src, vUv).rgb) * w, w); }`,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const outMat = new THREE.ShaderMaterial({
    uniforms: { src: { value: acc.texture } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D src; varying vec2 vUv;
      vec3 srgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() { gl_FragColor = vec4(srgb(texture2D(src, vUv).rgb), 1.0); }`,
  });
  const accScene = new THREE.Scene(), outScene = new THREE.Scene();
  accScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accMat));
  outScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outMat));

  function renderAt(t) {
    const { n, px } = samplesFor(t);
    let F, views;
    if (n <= 1) {
      F = poseAt(t);
      views = drawViews(F);
    } else {
      const ac = renderer.autoClear;
      for (let i = 0; i < n; i++) {
        const ti = t + ((i + 0.5) / n - 0.5) * (MOTION.shutter / FPS);
        drawViews(poseAt(ti));
        renderer.copyFramebufferToTexture(fbTex);
        renderer.setRenderTarget(acc);
        renderer.autoClear = false;
        if (i === 0) { renderer.setClearColor(0x000000, 0); renderer.clear(); }
        accMat.uniforms.w.value = 1 / n;
        renderer.render(accScene, quadCam);
        renderer.autoClear = ac;
        renderer.setRenderTarget(null);
      }
      renderer.setViewport(0, 0, W, H);
      renderer.render(outScene, quadCam);
      F = poseAt(t);
      views = setupViews(F);
    }
    scene.updateMatrixWorld(true);
    overlay.update(t, F, views);
    window.__frame = {
      t, scene: F.scene, shot: F.shot, spp: n, px,
      overlays: (F.overlays || []).filter((o) => o.type !== "cap" && t >= o.t0 && t < o.t1)
        .map((o) => ({ type: o.type, id: o.id, text: o.text || o.big || o.title || "", t0: o.t0 })),
      views: F.views.map((v) => ({ p: v.cam.p, l: v.cam.l, fov: v.cam.fov ?? 40, rect: v.rect || [0, 0, 1, 1], env: v.sky ?? F.env?.sky ?? 0 })),
    };
  }

  // glass and lacquer get their own reflection of the room (as the engine build)
  if (LOOK.env) {
    const seen = new Set();
    scene.traverse((o) => {
      const m = o.material;
      if (!m || seen.has(m) || !m.isMeshStandardMaterial) return;
      seen.add(m);
      if (m.transmission > 0) { m.envMap = scene.environment; m.envMapIntensity = LOOK.glassEnv; }
      else if (m.clearcoat > 0) { m.envMap = scene.environment; m.envMapIntensity = LOOK.paintEnv; }
    });
  }

  return { renderAt, scene, ctx };
}
