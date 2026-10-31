// The kit every scene shares: materials, easing, the pop-in, glow sprites, particles and small
// shapes. Deterministic: no Math.random, no clock; every value is a function of t.
import * as THREE from "three";
import { M, shade, mulberry32, clamp, lerp } from "./util.js";
import { LOOK } from "./look.js";
import { withEnv } from "./shapes.js";

export { clamp, lerp };
export const TAU = Math.PI * 2;
export const easeIO = (u) => {
  u = clamp(u);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
export const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);
export const easeIn = (u) => Math.pow(clamp(u), 3);
// 0 before a, 1 after b, eased in between
export const ramp = (t, a, b, ease = easeIO) => ease(clamp((t - a) / Math.max(1e-6, b - a)));
// on between a and b with fades of f seconds at both ends
export const win = (t, a, b, f = 0.2) => Math.min(ramp(t, a, a + f, easeOut), 1 - ramp(t, b - f, b, easeIn));
// the pop: 0 → 1.12 → 1 over d seconds from t0 (scale for parts snapping in)
export function pop(t, t0, d = 0.32) {
  const u = (t - t0) / d;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.6) return easeOut(u / 0.6) * 1.12;
  return lerp(1.12, 1, easeIO((u - 0.6) / 0.4));
}
export const popOut = (t, t0, d = 0.22) => 1 - easeIn((t - t0) / d);

export const mat = (color, o = {}) => M(color, o);
export const smoothMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
export const metal = (color, o = {}) => withEnv(new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.65, ...o }), 0.6);
// Glass. The physical version transmits (refracts and slightly blurs what is behind it) while its
// reflections stay at full strength, which is what makes a tube read as glass; the old version faded
// its reflections with its opacity. depthWrite stays off so the gas and particles inside still draw.
export const glass = (color = 0xdff2ff, opacity = 0.22) =>
  LOOK.glass
    ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0, transmission: 1, thickness: 0.12, ior: 1.45,
        specularIntensity: 1, clearcoat: 0.6, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
export const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

export function mesh(geo, material, shadows = true) {
  const m = new THREE.Mesh(geo, material);
  if (shadows) shade(m);
  return m;
}
export const cyl = (rt, rb, h, material, seg = 24, shadows = true) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, shadows);
export const bx = (w, h, d, material, shadows = true) => mesh(new THREE.BoxGeometry(w, h, d), material, shadows);
export const sph = (r, material, seg = 16, shadows = true) => mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), material, shadows);
export const grp = (x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
};
export function tube(points, r, material, seg = 48, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  return mesh(new THREE.TubeGeometry(curve, seg, r, 8, closed), material);
}
// a coil spring along y, centred on 0
export function spring(r, h, turns, wire, material) {
  const pts = [];
  const n = turns * 16;
  for (let i = 0; i <= n; i++) {
    const a = (i / 16) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * r, -h / 2 + (h * i) / n, Math.sin(a) * r));
  }
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, wire, 6, false), material);
}

// soft radial sprite for glows, fire, sparks, steam
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}
export function glow(color, size, additive = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  // with bloom on, glows carry HDR colour (above 1) so they clear the threshold and bloom while
  // lit surfaces stay under it; the colour is a base the callers never reset
  if (LOOK.post && LOOK.bloom) s.material.color.multiplyScalar(LOOK.glowBoost);
  s.scale.set(size, size, 1);
  return s;
}

// A canvas texture with text or a pattern drawn once.
export function canvasTex(w, h, draw, nearest = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

// Particles: a fixed pool of small meshes whose positions are a pure function of t.
// spawn(i, rng) returns the particle's constants; place(p, age, life, obj) poses it.
export class Particles {
  constructor(parent, { count, geo, material, seed = 1, life = 1, rate = null }) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.items = [];
    const rng = mulberry32(seed);
    this.life = life;
    this.count = count;
    this.rate = rate || count / life;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, material);
      m.visible = false;
      this.group.add(m);
      this.items.push({ m, r: [rng(), rng(), rng(), rng(), rng(), rng()] });
    }
  }
  // emit between t0 and t1; each particle i is born at t0 + i/rate (cycling through the pool)
  update(t, t0, t1, place, fadeOut = 0.3) {
    const period = this.count / this.rate;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      let best = null;
      // the latest birth of this pool slot that is still alive
      const k = Math.floor((t - t0 - i / this.rate) / period);
      for (const kk of [k, k - 1]) {
        if (kk < 0) continue;
        const born = t0 + i / this.rate + kk * period;
        if (born > t1 || born > t) continue;
        const age = t - born;
        if (age < this.life) { best = age; break; }
      }
      if (best === null) {
        it.m.visible = false;
        continue;
      }
      it.m.visible = true;
      place(it.m, best / this.life, it.r, best);
    }
  }
  hide() {
    for (const it of this.items) it.m.visible = false;
  }
}

// set a material's emissive glow (for highlight tints)
export function tint(material, color, amount) {
  if (!material.userData.base) material.userData.base = { color: material.color.clone(), emissive: material.emissive ? material.emissive.clone() : null, ei: material.emissiveIntensity };
  const b = material.userData.base;
  material.color.copy(b.color).lerp(new THREE.Color(color), amount);
  if (material.emissive) {
    material.emissive.copy(b.emissive || new THREE.Color(0)).lerp(new THREE.Color(color), amount * 0.55);
    material.emissiveIntensity = lerp(b.ei ?? 1, 1, amount);
  }
}

// ===================================================================================================
// Motion research (research/D-motion.md). Everything below is a closed-form function of time: no state,
// no previous frame, so frames can be seeked in any order by parallel workers.

// The reframe ease: velocity shaped like u^2 (1-u)^3 (a Beta(3,4) bump), so the move peaks at 40% of its
// length and spends 60% landing; zero velocity and zero acceleration at both ends (no jolt on take-off or
// landing). g(u) = 20u^3 - 45u^4 + 36u^5 - 10u^6, g'(u) = 60u^2(1-u)^3.
export const easeMove = (u) => {
  u = clamp(u);
  return u * u * u * (20 + u * (-45 + u * (36 - 10 * u)));
};
// Hermite tangent basis: zero at both ends, slope 1 at one end and 0 at the other. Adding
// T * (m0 * h10(u) + m1 * h11(u)) to an eased move makes it leave with velocity m0 and land with m1
// (the drift of the holds on either side), so a hold flows into the move and out again: no dead stop.
export const h10 = (u) => u * (u * (u - 2) + 1);
export const h11 = (u) => u * u * (u - 1);

// Underdamped spring step from 0 to 1 at tau = 0 (natural frequency w rad/s, damping ratio z < 1), and its
// velocity. Overshoot is exp(-pi z / sqrt(1 - z^2)): z 0.5 -> 16%, 0.6 -> 9.5%, 0.75 -> 2.8%.
export function springStep(tau, w, z) {
  if (tau <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * tau);
  return 1 - e * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
}
export function springVel(tau, w, z) {
  if (tau <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return ((w * w) / wd) * Math.exp(-z * w * tau) * Math.sin(wd * tau);
}

// A pop with squash and stretch: the scale follows a spring step (overshoot then a damped wobble) and the
// part stretches along its y axis in proportion to how fast it is growing, squashing when it shrinks
// back: k = c * s'(tau) / w, sy = s (1 + k), sx = sz = s / sqrt(1 + k) (volume kept). Returns a Pop that
// still reads as a plain number (valueOf), so existing code that compares or multiplies it keeps working.
export class Pop {
  constructor(s, k) { this.s = s; this.sy = 1 + k; this.sx = this.sz = 1 / Math.sqrt(1 + k); }
  valueOf() { return this.s; }
}
export function popSS(t, t0, { w = 19, z = 0.42, c = 0.55 } = {}) {
  const tau = t - t0;
  if (tau <= 0) return 0;
  if (tau > 1.6) return 1;
  const s = Math.max(0, springStep(tau, w, z));
  const k = clamp((c * springVel(tau, w, z)) / w, -0.35, 0.6);
  return new Pop(s, k);
}

// The reference's entrance: the part flies in along an arc (quadratic Bezier from an off-frame start
// through a control point to its home), turning into its final pose, decelerating hard and settling with
// a small overshoot. The rotation runs on a slightly slower spring than the travel, so it lands a few
// frames later (overlapping action). Returns null before t0 (part hidden) and after it has settled.
// from: start offset [x,y,z] from home; via: the arc's control point offset; rot: start rotation offsets.
export class Fly {
  constructor(dp, dr) { this.dp = dp; this.dr = dr; }
  valueOf() { return 1; }
}
export function flyIn(t, t0, { from, via = null, rot = [0, 0, 0], d = 0.45, z = 0.72 } = {}) {
  const tau = t - t0;
  if (tau < 0) return 0;
  if (tau > d * 3) return 1;
  // a spring whose first peak lands at d: wd = pi / d
  const w = Math.PI / d / Math.sqrt(1 - z * z);
  const s = springStep(tau, w, z), sr = springStep(tau, w * 0.82, z);
  const c = via || from.map((v) => v * 0.5);
  const q = 1 - s;
  // B(s) = q^2 P0 + 2 q s C + s^2 P1 with P1 = home (0); past s = 1 the polynomial runs on along the
  // landing direction, so the overshoot carries straight through home and back
  const dp = from.map((p0, i) => q * q * p0 + 2 * q * s * c[i]);
  const dr = rot.map((r0) => r0 * (1 - sr));
  return new Fly(dp, dr);
}
