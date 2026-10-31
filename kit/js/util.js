// Shared helpers for characters, modes and the runtime. Everything is deterministic: no
// Math.random, no clock. A frame is a pure function of the time t.
import * as THREE from "three";

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, x) => a + (b - a) * x;
export const smooth = (e0, e1, x) => {
  const u = clamp((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};
export const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// The look point that puts `target` at (fx, fy) of a 9:16 frame (fractions from the top left), so a
// camera set-up can be written the way a reference frame is measured: "face 40% across, 52% down".
export function aim(pos, target, fx, fy, fov, aspect = 9 / 16) {
  const f = target.clone().sub(pos), D = f.length();
  f.normalize();
  const r = new THREE.Vector3().crossVectors(f, V(0, 1, 0)).normalize(), u = new THREE.Vector3().crossVectors(r, f);
  const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2)), th = tv * aspect;
  return target.clone().addScaledVector(r, (0.5 - fx) * 2 * th * D).addScaledVector(u, (fy - 0.5) * 2 * tv * D);
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Seeded vertex jitter: shared corners move together, so faces stay closed.
export function facet(geo, amount, seed) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = mulberry32(hash32(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`) ^ seed);
    p.setXYZ(i, v.x + (r() - 0.5) * 2 * amount, v.y + (r() - 0.5) * 2 * amount, v.z + (r() - 0.5) * 2 * amount);
  }
  g.computeVertexNormals();
  return g;
}

export const M = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, flatShading: true, ...o });
export const shade = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
export const box = (w, h, d, mat, seed, j = 0.05) =>
  shade(new THREE.Mesh(facet(new THREE.BoxGeometry(w, h, d, 2, 2, 2), j * Math.min(w, h, d), seed), mat));
export const ico = (r, detail, mat, seed, j = 0.06) =>
  shade(new THREE.Mesh(facet(new THREE.IcosahedronGeometry(r, detail), j * r, seed), mat));
export const piv = (x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
};

// A fixed, seeded blink schedule per character (their reels blink on the same seconds every
// episode; ours do too). Returns the list of blink start times.
export function blinkSchedule(seed, end = 900, gapMin = 2.4, gapSpread = 2.0) {
  const r = mulberry32(seed);
  const out = [];
  let t = 0.9 + r() * 1.2;
  while (t < end) {
    out.push(t);
    t += gapMin + r() * gapSpread;
  }
  return out;
}
// 1 = open, small = closed; a 5-frame blink: half, closed, half.
export function blinkAt(times, t) {
  for (const b of times) {
    if (t < b) return 1;
    const u = t - b;
    if (u < 0.033) return 0.4;
    if (u < 0.1) return 0.1;
    if (u < 0.133) return 0.4;
  }
  return 1;
}

// Voice loudness per frame (30 fps) at a time relative to the clip start.
export function envAt(arr, tr) {
  if (!arr || tr < 0) return 0;
  const f = tr * 30, i = Math.floor(f);
  if (i >= arr.length - 1) return 0;
  return lerp(arr[i], arr[i + 1], f - i);
}

// Blend two flat parameter objects (numbers, arrays of numbers, nested objects of numbers).
export function mixParams(a, b, w) {
  if (typeof a === "number") return lerp(a, b ?? a, w);
  if (Array.isArray(a)) return a.map((x, i) => mixParams(x, b?.[i], w));
  if (a && typeof a === "object") {
    const o = {};
    for (const k of Object.keys(a)) o[k] = mixParams(a[k], b?.[k], w);
    return o;
  }
  return w < 0.5 ? a : b;
}

// A canvas texture that a module can redraw every frame.
export function liveCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext("2d"), tex };
}
