// The kit demo: a 15.6 s reel built only on the kit (js/kit/), keyed to the skyscraper take's first two
// beats. A river with a cut-away soil section, trees, a road with the blue car, rain and lightning for a
// moment; the lead walks along a path, picks up a log, carries it to the bank, drops it when the storm
// hits (worry), the girl waves from the far bank; a hold, a follow (the car, then the lead), reframes, a
// split, a cut to the section, pills, tags, badges, a bubble, a dimension line, captions, hearts and
// confetti at the end. This file is the whole reel: the set, the cast, the camera, the labels.
import * as THREE from "three";
import TL from "./timeline.js";
import { words, frame, useCamera, ramp, win, clamp, lerp } from "./kit/words.js";
import { shotList, hold, reframe, cut, follow, split } from "./kit/camera.js";
import { ov } from "./kit/overlay.js";
import { walkPath } from "./kit/pixel.js";
import { heights, groundFn, buildTerrain, buildWater, buildSky, buildTrees, scatter, buildRoad, buildEffects, flashAt, house } from "./kit/props.js";
import { buildCar } from "./kit/vehicles.js";
import { mat, cyl, grp, mesh } from "./kit/kit.js";

const { S, W, captions } = words(TL);
const PI = Math.PI;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ---------- the set (1 unit = 1 metre; the lead is 0.42, about 2 m with his hair) ----------
const HEIGHT = heights.river({ axis: "z", center: 0, width: 22, depth: 4.5, bank: 8 });
const G = groundFn(HEIGHT, 0.12); // the ground the terrain draws, for standing things on it
const FACE = 40; // the cut-away section's face (z)
const WATER_Y = -2.0;
const ROAD_X = -58;
const CAR_S = 0.42;
const LS = 0.42; // the lead's scale
export const STAGE = { fog: [260, 1300], leadScale: LS };

// ---------- word times ----------
const T = {
  roof: W("b01", "roof"), stack: W("b01", "stack"), ten: W("b01", "ten"), and: W("b01", "and"), dont: W("b01", "don't"),
  sky: W("b01", "skyscraper"), you2: W("b01", "=you", 1), get2: W("b01", "get", 1), rubble: W("b01", "rubble"),
  b02: S("b02"), stands: W("b02", "stands"), walls: W("b02", "walls"), and2: W("b02", "and"), every: W("b02", "every"),
  extra: W("b02", "extra"), floor: W("b02", "floor"), presses: W("b02", "presses"), ones: W("b02", "ones"),
  until: W("b02", "until"), bricks: W("b02", "bricks"), crush: W("b02", "crush"),
};
const CUT = { split: T.b02 - 0.04, section: T.and2 - 0.04 };

// ---------- who is where ----------
// walks at about 2 m/s (a brisk cartoon walk; walkTime() sizes a span for a speed)
const P1 = { pts: [[-35, 4.2], [-33.3, 5.6], [-31.5, 7]], t0: 0.25, t1: 2.85, scale: LS };
const P2 = { pts: [[-31.5, 7], [-30.5, 8.4], [-29.4, 9.4]], t0: 3.45, t1: 5.3, scale: LS, face: 1.25 };
const GIRL = [20, 0, 26];
GIRL[1] = G(GIRL[0], GIRL[2]);
const GIRL_YAW = Math.atan2(-49.4, -16.6); // toward the lead across the river
const onGround = (p) => [p[0], G(p[0], p[2]), p[2]];
const DROP_T = 5.45; // he drops the log when the storm hits
const STRIKE = [-92, 0, -8]; // the lightning, inland behind him
function leadPos(t) {
  if (t < P2.t0) return onGround(walkPath(t, P1).pos);
  return onGround(walkPath(t, P2).pos);
}
const leadHead = (t) => add(leadPos(t), [0, 1.55, 0]);
const girlHead = add(GIRL, [0, 1.45, 0]);
function logOnGround(t) {
  // where the log lies: ahead of the path's end before he picks it up, at his feet after he drops it
  if (t < 3.35) { const w = walkPath(P1.t1, P1); return [w.pos[0] + Math.sin(w.yaw) * 0.62, G(w.pos[0], w.pos[2]) + 0.13, w.pos[2] + Math.cos(w.yaw) * 0.62, w.yaw]; }
  if (t >= DROP_T) { const w = walkPath(DROP_T, P2); return [w.pos[0] + Math.sin(w.yaw) * 0.55, G(w.pos[0], w.pos[2]) + 0.13, w.pos[2] + Math.cos(w.yaw) * 0.55, w.yaw]; }
  return null;
}
function carAt(t) {
  const z = lerp(-22, 50, clamp((t - 0.3) / 4.1));
  return { x: ROAD_X + 1.75, y: 0, z, yaw: -PI / 2, dist: (z + 22) / CAR_S };
}
const carPos = (t) => { const c = carAt(t); return [c.x, 1.05, c.z]; };

// ---------- the cast ----------
function logMesh(len, r) {
  // a log lying along x, bark and two pale cut ends
  const g = grp();
  const bark = cyl(r, r * 1.05, len, mat(0x7a5233), 9);
  bark.rotation.z = PI / 2;
  g.add(bark);
  for (const s of [-1, 1]) {
    const end = mesh(new THREE.CircleGeometry(r * 0.96, 9), mat(0xd9b27a), false);
    end.position.x = s * (len / 2 + 0.01);
    end.rotation.y = s * PI / 2;
    g.add(end);
  }
  return g;
}
export const CAST = [
  { who: "lead", kind: "lead", variant: "camo", scale: LS, blinkSeed: 11, props: [{ name: "log", joint: "hands", build: () => logMesh(3.6, 0.34), pos: [0, -0.05, 0.12] }] },
  { who: "girl", kind: "girl", variant: "dress-pink", scale: 0.4, blinkSeed: 29 },
];
function leadAt(t) {
  const st = { emotion: "happy" };
  if (t < P1.t1) return { ...st, ...walkPath(t, P1), pos: leadPos(t) };
  if (t < 3.35) { const w = walkPath(t, P1); return { ...st, pos: leadPos(t), yaw: w.yaw, pose: "plug", emotion: "excited" }; }
  if (t < DROP_T) {
    const w = walkPath(t, P2);
    return { ...st, ...w, pos: leadPos(t), arms: "carry", carry: "log", emotion: t > T.sky ? "proud" : "excited" };
  }
  const w = walkPath(t, P2);
  const base = { ...st, pos: leadPos(t), yaw: w.yaw };
  if (t < CUT.split) return { ...base, pose: t < DROP_T + 0.25 ? "plug" : "worry" };
  if (t < T.until) return { ...base, pose: "waveBoth", emotion: "excited" };
  return { ...base, pose: "cheer", emotion: "excited" };
}
function girlAt(t) {
  const st = { pos: GIRL, yaw: GIRL_YAW, emotion: "happy" };
  if (t < CUT.split) return { ...st, pose: t > T.you2 ? "worry" : null };
  if (t < T.ones) return { ...st, pose: "wave" };
  if (t < T.bricks) return { ...st, pose: "waveBoth", emotion: "excited" };
  return { ...st, pose: "cheer", emotion: "excited" };
}
export const castAt = (t) => ({ lead: leadAt(t), girl: girlAt(t) });

// ---------- the camera: one shot list ----------
const FILM = shotList([
  // a wide hold over the river, drifting
  hold(0, { shot: "bank", tg: [-21, 0, 6], az: 30, el: 18, d: 74, drift: { az: 1.2, d: -0.01 } }),
  // follow the car down the road
  follow(T.stack - 0.1, carPos, { az: 62, el: 10, d: 17, screen: [0.5, 0.46] }, { move: 0.75 }),
  // follow the lead as he carries the log to the bank
  follow(T.and - 0.05, (t) => add(leadPos(t), [0, 0.95, 0]), { az: 30, el: 8, d: 7.5, screen: [0.5, 0.42] }, { move: 0.7 }),
  // wider and lower as the storm hits
  reframe(T.you2 - 0.1, { tg: add(leadPos(5.3), [0, 1.0, 0]), az: 70, el: 4, d: 12, screen: [0.56, 0.5] }, { move: 0.6 }),
  // cause and effect: him on this bank, her on the other
  split(CUT.split, { tg: leadHead(6), az: 52, el: 4, d: 7.2, screen: [0.5, 0.56] }, { tg: girlHead, az: -52, el: 4, d: 7.2, screen: [0.5, 0.6] }, { shot: "split" }),
  // a cut to the section through the river: layers down to rock
  cut(CUT.section, { shot: "section", tg: [0, -6, FACE], az: 0, el: 6, d: 74, drift: { d: -0.008 } }),
  // reframe up to the girl, then out to both banks
  reframe(T.ones - 0.05, { tg: add(girlHead, [0, -0.3, 0]), az: -95, el: 5, d: 6.5 }, { move: 0.85 }),
  reframe(T.until - 0.05, { tg: add(girlHead, [0, 0.2, 0]), az: -78, el: 9, d: 11.5 }, { move: 0.75 }),
]);

// ---------- the labels ----------
const captionAt = captions({ y: 870, hi: { b01: ["rubble"] } });
function overlaysAt(t, ctx) {
  const o = [];
  o.push(ov.pill("p-river", "river", "blue", T.roof, T.stack - 0.15, [3, WATER_Y + 0.4, -6]));
  o.push(ov.tag("t-car", "Blue car", T.ten, T.and - 0.12, add(carPos(t), [0, 2.0, 0])));
  if (ctx.props.lead) {
    o.push(ov.pill("p-log", "Log", "orange", T.dont, T.you2 - 0.12, ctx.props.lead.log, { dx: 175, dy: 70 }));
    o.push(ov.badge("ok-log", "ok", T.sky, T.you2 - 0.12, ctx.props.lead.log, { dx: -190, dy: 70 }));
  }
  o.push(ov.pill("p-storm", "Storm", "red", T.get2, CUT.split, add(STRIKE, [0, 30, 0])));
  o.push(ov.badge("x-storm", "x", T.rubble + 0.12, CUT.split, add(leadHead(6), [0, 1.0, 0])));
  o.push(ov.pill("p-left", "Left bank", "green", CUT.split + 0.08, CUT.section, add(leadHead(6), [0, 1.15, 0]), { view: 0 }));
  o.push(ov.pill("p-right", "Right bank", "pink", T.stands, CUT.section, add(girlHead, [0, 1.15, 0]), { view: 1 }));
  o.push(ov.dim("d-river", T.every, T.ones - 0.1, [-12.6, WATER_Y + 0.35, FACE + 0.6], [12.6, WATER_Y + 0.35, FACE + 0.6], { text: "22 m", ldy: -52 }));
  o.push(ov.pill("p-clay", "Clay", "orange", T.extra, T.ones - 0.1, [13, -10.5, FACE + 0.6]));
  o.push(ov.pill("p-sand", "Sand", "yellow", T.floor, T.ones - 0.1, [-9, -17.5, FACE + 0.6]));
  o.push(ov.pill("p-rock", "Rock", "grey", T.presses, T.ones - 0.1, [6, -26.5, FACE + 0.6]));
  o.push(ov.bubble("b-hi", "Over here!", T.ones + 0.35, T.until - 0.05, add(girlHead, [0, 1.15, 0]), { kind: "yay" }));
  o.push(ov.tag("t-end", "Other side", T.until + 0.3, 1e9, add(girlHead, [0, 3.4, 0])));
  return o;
}

// ---------- the frame ----------
export function direct(t, ctx) {
  const F = frame(t);
  F.cast = castAt(t);
  useCamera(F, FILM, t);
  const storm = ramp(t, 5.2, 5.7) * (1 - ramp(t, 7.5, 8.6));
  F.env = { sky: 0, storm, flash: flashAt(t, [T.rubble + 0.05]) };
  F.scene = t < T.stack ? "bank" : t < T.and ? "car" : t < 5.2 ? "carry" : t < CUT.split ? "storm" : t < CUT.section ? "split" : t < T.ones ? "section" : "end";
  F.car = carAt(t);
  F.cut = t >= CUT.section && t < T.ones + 0.35;
  F.log = logOnGround(t);
  const lp = leadPos(t), cam = F.views[0].cam;
  F.fx = {
    rain: storm > 0.01 ? { k: storm, c: add(lp, [0, 12, 0]), w: 30, h: 30, v: 30, wind: [0.15, 0], alpha: 0.55, cam: cam.p, near: 3 } : null,
    lightning: t > T.rubble - 0.1 && t < T.rubble + 0.5 ? { times: [T.rubble + 0.05], at: STRIKE, h: 70, w: 1 } : null,
    dust: [{ t0: DROP_T, at: F.log ? F.log.slice(0, 3) : [0, 0, 0], r: 0.9, n: 10, dur: 1.0, size: 0.8, rise: 0.5, h: 0.2 }],
    hearts: t > T.bricks - 0.1 ? { t0: T.bricks, at: add(girlHead, [0, 0.3, 0]), n: 12, spread: 1.6, rise: 1.6, size: 0.22, yaw: (-78 * PI) / 180 } : null,
    confetti: t > T.crush - 0.1 ? { t0: T.crush, at: add(GIRL, [-2, 3.2, 0]), spread: 0.9, size: 1.4 } : null,
  };
  F.overlays.push(...overlaysAt(t, ctx));
  const cap = captionAt(t);
  if (cap) F.overlays.push(cap);
  return F;
}

// ---------- the world ----------
export function buildWorld(scene) {
  const terrain = buildTerrain(scene, { size: [520, 1400], seg: [260, 280], height: HEIGHT, waterY: WATER_Y,
    section: { z: FACE, x: [-90, 90], bottom: -60, rockTop: -22 } });
  const water = buildWater(scene, { x: [-13.5, 13.5], z: [-700, 700], y: WATER_Y, flow: [0, 1], speed: 2.4,
    section: { z: FACE, bed: (x) => HEIGHT(x, FACE) } });
  const sky = buildSky(scene, {});
  buildRoad(scene, { along: "z", at: ROAD_X, w: 7 });
  const keepClear = (x, z) => Math.abs(x) < 22 || Math.abs(x - ROAD_X) < 8 || (x > -48 && x < -14 && z > -14 && z < 30) || (x > 12 && x < 32 && z > 14 && z < 36) || (z > FACE - 4 && Math.abs(x) < 140);
  const at = [...scatter(5, 140, [-240, 240, -420, 120], keepClear), [-46, -16, 1.3], [-24, -6, 1.1], [30, 4, 1.2]];
  buildTrees(scene, { at, ground: G });
  for (const [x, z, c, s] of [[44, -12, 0xf3e3c3, 3], [62, 6, 0xd8e9d2, 4], [-78, -30, 0xf1c9c9, 5], [-80, 2, 0xeef2f4, 6]]) {
    const h = house(s, c);
    h.scale.setScalar(0.5);
    h.position.set(x, G(x, z), z);
    h.rotation.y = x > 0 ? -PI / 2 : PI / 2;
    scene.add(h);
  }
  // two rocks in the river, with ripple rings round them
  const rocks = [[3.5, -14, 1.4], [-4.5, 6, 1.1]];
  for (const [x, z, r] of rocks) {
    const m = mesh(new THREE.IcosahedronGeometry(r, 0), mat(0x8b8d91));
    m.scale.set(1.2, 0.8, 1);
    m.position.set(x, WATER_Y + 0.15, z);
    scene.add(m);
  }
  const car = buildCar(scene, 0x2f7de1);
  car.root.scale.setScalar(CAR_S);
  const log = logMesh(3.6 * LS, 0.34 * LS);
  scene.add(log);
  const fx = buildEffects(scene, { debris: false, fire: false, sunbeams: false, streaks: false, drips: false, sparks: false, flowDots: false, wind: false });
  return {
    update(t, F) {
      terrain.update(t, { cut: F.cut });
      water.update(t, { waves: 0.12, cut: F.cut, rings: rocks.map(([x, z, r], i) => ({ at: [x, z], r: r * 1.15, ph: i * 0.37 })) });
      sky.update(t, F);
      car.update(t, F.car);
      log.visible = !!F.log;
      if (F.log) { log.position.set(F.log[0], F.log[1], F.log[2]); log.rotation.set(0, F.log[3], 0); }
      fx.update(t, F.fx);
    },
  };
}
