// The camera: the engine build's v2 path (K, orbit, camPath: linear drifts, C1 eased moves, distance in
// log space; the skyscraper's direction.js, unchanged) and a shot list on top of it, so a reel's camera
// is a short list of framings keyed to words: hold with a slow drift, an eased reframe (0.5 to 0.8 s)
// onto a named point, follow a moving subject, a split (two views, cause and effect), a continuous fly
// path. Reframes are the default and cuts are opt-in, as theirs: nearly one flying camera (the airplane
// reel cut 35 times against their 3). Everything is a pure function of t.
import * as THREE from "three";
import { clamp, easeIO, easeMove, h10, h11 } from "./kit.js";
import { aim } from "./util.js";
import { MOTION } from "./motion-config.js";

export const D2R = Math.PI / 180;

// ---------- the v2 path (unchanged) ----------
export const K = (t, tg, az, el, d, fov = 40, ease = "io") => ({ t, tg, az, el, d, fov, ease });
export function orbit(tg, az, el, d, fov = 40) {
  const a = az * D2R, e = el * D2R;
  return { p: [tg[0] + d * Math.cos(e) * Math.sin(a), tg[1] + d * Math.sin(e), tg[2] + d * Math.cos(e) * Math.cos(a)], l: tg.slice(), fov };
}
const chan = (k) => [k.tg[0], k.tg[1], k.tg[2], k.az, k.el, Math.log(k.d), k.fov];
function isMove(a, b, A, B) {
  const T = b.t - a.t;
  if (T > 1.8 || b.ease === "lin") return false;
  const d = Math.exp((A[5] + B[5]) / 2);
  const deg = Math.abs(B[3] - A[3]) * Math.cos(A[4] * D2R) + Math.abs(B[4] - A[4]) + 57.3 * Math.abs(B[5] - A[5])
    + (57.3 * Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2])) / d + Math.abs(B[6] - A[6]);
  return deg / T >= 8;
}
const moveEase = (u) => (MOTION.moveEase === "beta34" ? easeMove(u) : easeIO(u));
export function camPath(keys, t, dm = 1) {
  const n = keys.length;
  const C = keys.map(chan);
  const at = (c) => orbit([c[0], c[1], c[2]], c[3], c[4], Math.exp(c[5]) * dm, c[6]);
  if (n === 1 || t <= keys[0].t) return at(C[0]);
  const mv = [];
  for (let i = 0; i < n - 1; i++) mv.push(isMove(keys[i], keys[i + 1], C[i], C[i + 1]));
  const slope = (i, j) => (C[i + 1][j] - C[i][j]) / Math.max(1e-6, keys[i + 1].t - keys[i].t);
  function tan(k, j) {
    const prev = k > 0 ? (mv[k - 1] ? "move" : "hold") : null, next = k < n - 1 ? (mv[k] ? "move" : "hold") : null;
    if (prev === "hold" && next === "move") return slope(k - 1, j);
    if (prev === "move" && next === "hold") return slope(k, j);
    if (prev === "move" && next === "move") {
      const s0 = slope(k - 1, j), s1 = slope(k, j);
      if (s0 * s1 <= 0) return 0;
      const cr = (C[k + 1][j] - C[k - 1][j]) / (keys[k + 1].t - keys[k - 1].t);
      return Math.sign(cr) * Math.min(Math.abs(cr), 3 * Math.min(Math.abs(s0), Math.abs(s1)));
    }
    return 0;
  }
  let seg = n - 2;
  for (let i = 0; i < n - 1; i++) if (t < keys[i + 1].t) { seg = i; break; }
  const out = new Array(7);
  const a = keys[seg], b = keys[seg + 1], T = Math.max(1e-6, b.t - a.t);
  const u = clamp((t - a.t) / T);
  if (t >= keys[n - 1].t) return at(C[n - 1]);
  for (let j = 0; j < 7; j++) {
    const p0 = C[seg][j], p1 = C[seg + 1][j], D = p1 - p0;
    if (!mv[seg]) out[j] = p0 + D * u;
    else {
      const lim = Math.abs(D) / T;
      const m0 = clamp(tan(seg, j), -lim, lim), m1 = clamp(tan(seg + 1, j), -lim, lim);
      out[j] = p0 + D * moveEase(u) + T * (m0 * h10(u) + m1 * h11(u));
    }
  }
  return at(out);
}

// ---------- the shot list ----------
// A framing: { tg, az, el, d, fov = 40, roll = 0, screen = [0.5, 0.5], drift, lag, focus, ...view extras }
//   tg: [x, y, z] | "name" (a point from opts.points) | (t) => [x, y, z] (a moving subject: follow)
//   az, el: degrees round the target (az 0 looks from +z, 90 from +x); d: distance
//   screen: where the target sits in the frame, as fractions from the top left (0.5, 0.42 puts it above
//     the caption line at 68%); the look point is solved with util.aim
//   drift: per second, { az (deg/s), el (deg/s), d (fraction/s, -0.01 = 1% closer each second), tg ([x,y,z]/s),
//     fov (deg/s) }; 0 locks the camera; default DRIFT (theirs drift about 0.5 px a frame in holds)
//   lag: for a moving tg, the camera looks where the subject was `lag` s ago (a softer follow)
//   focus: the depth-of-field focus point (default the target)
//   view extras pass through to the view: rect, interior, sky, env
// An item: a framing plus { at, move = 0.65, ease = "io", cut, shot, split, fly }
//   at: when the item starts (a word time); the reframe into it runs from at to at + move
//   cut: true jumps (a new shot); shot: a name (a new name is a cut; shot ids drive motion blur and
//     pose blends, which never cross a cut, and the shot map)
//   split: [framingA, framingB] two views (cause and effect), rects default top half / bottom half
//   fly: [[t, [px, py, pz], [lx, ly, lz], fov?], ...] a continuous camera path through keys (absolute times)
export const DRIFT = { az: 0.7, d: -0.012 };
const SPLIT_RECTS = [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]];
const NCH = 10; // tx ty tz az el logd fov roll sx sy

function resolveTg(tg, points, t, lag = 0) {
  if (typeof tg === "function") return tg(t - lag);
  if (typeof tg === "string") {
    const p = points[tg];
    if (!p) throw new Error(`camera: no point "${tg}"`);
    return typeof p === "function" ? p(t - lag) : p;
  }
  return tg;
}

// a fly path: Hermite through the keys with Catmull-Rom tangents in time; at rest at both ends
function flyAt(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0];
  if (t >= keys[n - 1][0]) return keys[n - 1];
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], T = b[0] - a[0], u = (t - a[0]) / T;
  const tanAt = (k, j, c) => {
    if (k === 0 || k === n - 1) return 0;
    return (keys[k + 1][j][c] - keys[k - 1][j][c]) / (keys[k + 1][0] - keys[k - 1][0]);
  };
  const H = (j, c) => {
    const p0 = a[j][c], p1 = b[j][c];
    const m0 = tanAt(i, j, c) * T, m1 = tanAt(i + 1, j, c) * T;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  };
  const fov = a[3] != null && b[3] != null ? a[3] + (b[3] - a[3]) * (u * u * (3 - 2 * u)) : a[3] ?? 40;
  return [t, [H(1, 0), H(1, 1), H(1, 2)], [H(2, 0), H(2, 1), H(2, 2)], fov];
}

// channels of a framing at time t (drift measured from the item's start)
function framingChannels(f, t, t0, points) {
  if (f.fly) {
    const [, p, l, fov] = flyAt(f.fly, t);
    const dx = p[0] - l[0], dy = p[1] - l[1], dz = p[2] - l[2];
    const d = Math.max(1e-4, Math.hypot(dx, dy, dz));
    return [l[0], l[1], l[2], Math.atan2(dx, dz) / D2R, Math.asin(dy / d) / D2R, Math.log(d), fov ?? 40, f.roll ?? 0, 0.5, 0.5];
  }
  const tg = resolveTg(f.tg, points, t, f.lag || 0);
  const dr = f.drift === 0 ? null : f.drift === undefined ? DRIFT : f.drift;
  const k = Math.max(0, t - t0);
  const sc = f.screen || [0.5, 0.5];
  const c = [tg[0], tg[1], tg[2], f.az ?? 0, f.el ?? 10, Math.log(f.d ?? 20), f.fov ?? 40, f.roll ?? 0, sc[0], sc[1]];
  if (dr) {
    if (dr.tg) { c[0] += dr.tg[0] * k; c[1] += dr.tg[1] * k; c[2] += dr.tg[2] * k; }
    c[3] += (dr.az || 0) * k;
    c[4] += (dr.el || 0) * k;
    c[5] += Math.log(1 + (dr.d || 0)) * k;
    c[6] += (dr.fov || 0) * k;
  }
  return c;
}

const _p = new THREE.Vector3(), _t = new THREE.Vector3();
function camFromChannels(c, f) {
  const o = orbit([c[0], c[1], c[2]], c[3], c[4], Math.exp(c[5]), c[6]);
  const cam = { p: o.p, l: o.l, fov: c[6] };
  if (Math.abs(c[8] - 0.5) > 1e-4 || Math.abs(c[9] - 0.5) > 1e-4) {
    const L = aim(_p.set(...o.p), _t.set(c[0], c[1], c[2]), c[8], c[9], c[6]);
    cam.l = [L.x, L.y, L.z];
    cam.focus = [c[0], c[1], c[2]];
  }
  if (c[7]) cam.roll = c[7];
  if (f.focus) cam.focus = f.focus;
  return cam;
}

export function shotList(items, opts = {}) {
  const points = opts.points || {};
  const defMove = opts.move ?? 0.65;
  const list = items.filter(Boolean).map((it) => ({ ...it }));
  // shot ids and cut flags
  let shotN = 0, cur = null;
  list.forEach((it, i) => {
    if (i > 0 && list[i - 1].at > it.at) throw new Error(`camera: items out of order at ${it.at} (after ${list[i - 1].at})`);
    const isCut = i === 0 || it.cut || it.split || list[i - 1].split || (it.shot && it.shot !== cur) || (it.move === 0);
    it._cut = isCut;
    if (isCut) cur = it.shot || (i === 0 ? "a" : `s${++shotN}`);
    it._shot = cur;
    it._move = it.move ?? defMove;
  });
  const extras = (f) => {
    const v = {};
    for (const k of ["rect", "interior", "sky", "env"]) if (f[k] !== undefined) v[k] = f[k];
    return v;
  };
  function channelsAt(i, t) {
    const it = list[i];
    const c = framingChannels(it, t, it.at, points);
    if (it._cut || i === 0) return c;
    const u = (t - it.at) / it._move;
    if (u >= 1) return c;
    const prev = channelsAt(i - 1, t);
    const e = it.ease === "lin" ? clamp(u) : moveEase(clamp(u));
    // blending two framings that keep drifting: the blend leaves with the old drift and lands with the
    // new one (ease' = 0 at both ends), the same C1 joins as camPath's Hermite terms
    return prev.map((v, j) => v + (c[j] - v) * e);
  }
  function indexAt(t) {
    let i = 0;
    while (i < list.length - 1 && t >= list[i + 1].at) i++;
    return i;
  }
  return {
    items: list,
    // cut times (the shot map and the checks compare against these)
    cuts: list.filter((it, i) => i > 0 && it._cut).map((it) => it.at),
    at(t) {
      const i = indexAt(t);
      const it = list[i];
      if (it.split) {
        const rects = it.rects || SPLIT_RECTS;
        const views = it.split.map((f, k) => ({ cam: camFromChannels(framingChannels(f, t, it.at, points), f), rect: rects[k], ...extras(f) }));
        return { shot: it._shot, views, split: true, item: i };
      }
      // view extras follow the item the camera is heading to
      return { shot: it._shot, views: [{ cam: camFromChannels(channelsAt(i, t), it), ...extras(it) }], split: false, item: i };
    },
  };
}

// sugar for the item kinds (each returns an item for shotList). Every item holds its framing with the
// drift until the next one; hold() and reframe() are the same item (reframe reads better mid-shot).
export const hold = (at, f, o = {}) => ({ at, ...f, ...o });
export const reframe = (at, f, o = {}) => ({ at, ...f, ...o });
export const cut = (at, f, o = {}) => ({ at, ...f, ...o, cut: true });
export const follow = (at, subject, f, o = {}) => ({ at, ...f, tg: subject, ...o });
export const split = (at, a, b, o = {}) => ({ at, split: [a, b], ...o });
export const fly = (at, keys, o = {}) => ({ at, fly: keys, ...o });
