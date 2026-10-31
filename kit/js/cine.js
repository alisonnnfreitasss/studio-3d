// Cinematic: a dark, realistic look for a reel on the kit's own stage. See kit/CINEMATIC.md.
//
// Nothing here replaces the stage. cineLook() sets the shared LOOK before createStage reads it, cineStage() is the
// reel's STAGE export, and the builders below add objects to the scene from buildWorld. Assets come from assets/cine/
// (compose.py copies that folder when topic.json has "format": "cinematic").
//
// The reel, in order:
//   cineLook();                                                     // at module level, before the stage is created
//   await preload({ sets: ["soil", "rock"], earth: true, hdr: "studio" });   // top-level await: the build waits for it
//   export const STAGE = cineStage({ fog: [6, 60] });
//   export const OVERLAY_TYPES = CINE_OVERLAYS;
//   export const CAST = [];
//   buildWorld(scene, ctx): useHdr(ctx, "studio"), texturedGround(...), cineCable(...), lightPulse(...), ...
//   direct(t): keysAt() for the timing, rideCam() for the camera, cine.cap / cine.counter / cine.grain for the text
//
// Every builder is seeded and every update is a pure function of what it is given: no Math.random, no clock, no state
// carried between frames, so frames can be drawn in any order and several times each (motion blur draws sub-frames).
import * as THREE from "three";
import { LOOK } from "./look.js";
import { mulberry32 } from "./util.js";
import { rbox, rrect } from "./shapes.js";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const V3 = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(...a));
const BASE = "assets/cine/";

// ---------------------------------------------------------------- the assets

// each set is one photographed surface: colour, normal and roughness maps, named as their source names them
export const SETS = {
  sand: "aerial_beach_01_{}_2k",
  rock: "dark_rock_{}_1k",
  soil: "red_laterite_soil_stones_{}_1k",
  metal: "metal_plate_02_{}_1k",
  concrete: "concrete_wall_008_{}_1k",
  iron: "corrugated_iron_02_{}_1k",
  wood: "smoke_speckled_veneer_{}_1k",
};
export const HDRS = { studio: "studio_small_08", dusk: "kiara_9_dusk", workshop: "machine_shop_02" };

const TEX = {}, HDR = {};
const loader = new THREE.TextureLoader();
const loadTex = (url, srgb) => loader.loadAsync(BASE + url).then((t) => {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
});

// a Radiance .hdr (flat or run-length encoded) into half-float RGBA. three's own loader is not in the kit's vendor copy.
function parseHdr(buf) {
  const b = new Uint8Array(buf);
  let p = 0, line = "";
  const readLine = () => { let s = ""; while (p < b.length && b[p] !== 10) s += String.fromCharCode(b[p++]); p++; return s; };
  while ((line = readLine()) !== "") if (p >= b.length) throw new Error("hdr: no header end");
  const m = /-Y (\d+) \+X (\d+)/.exec(readLine());
  if (!m) throw new Error("hdr: only -Y +X files");
  const h = +m[1], w = +m[2], out = new Uint16Array(w * h * 4), scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (b[p] === 2 && b[p + 1] === 2 && ((b[p + 2] << 8) | b[p + 3]) === w) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          const n = b[p++];
          if (n > 128) { const v = b[p++]; for (let k = 0; k < n - 128; k++) scan[c * w + x++] = v; }
          else for (let k = 0; k < n; k++) scan[c * w + x++] = b[p++];
        }
      }
      for (let x = 0; x < w; x++) {
        const e = scan[3 * w + x], f = e ? Math.pow(2, e - 136) : 0, o = (y * w + x) * 4;
        out[o] = THREE.DataUtils.toHalfFloat(scan[x] * f);
        out[o + 1] = THREE.DataUtils.toHalfFloat(scan[w + x] * f);
        out[o + 2] = THREE.DataUtils.toHalfFloat(scan[2 * w + x] * f);
        out[o + 3] = THREE.DataUtils.toHalfFloat(1);
      }
    } else {
      for (let x = 0; x < w; x++, p += 4) {
        const e = b[p + 3], f = e ? Math.pow(2, e - 136) : 0, o = (y * w + x) * 4;
        out[o] = THREE.DataUtils.toHalfFloat(b[p] * f);
        out[o + 1] = THREE.DataUtils.toHalfFloat(b[p + 1] * f);
        out[o + 2] = THREE.DataUtils.toHalfFloat(b[p + 2] * f);
        out[o + 3] = THREE.DataUtils.toHalfFloat(1);
      }
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}

let waiting = null;
// Load what the reel names, once, before the stage is built. Call it with a top-level await in reel.js. It also tells
// the renderer to wait (window.__hf.buildReady): the page's own promise appears only after this module has finished.
export function preload({ sets = [], earth = false, hdr = [], fonts = true } = {}) {
  const jobs = [];
  for (const s of sets) {
    if (!SETS[s]) throw new Error(`cine: no texture set "${s}" (have ${Object.keys(SETS).join(", ")})`);
    const n = SETS[s];
    jobs.push(Promise.all([loadTex(`tex/${n.replace("{}", "diff")}.jpg`, true), loadTex(`tex/${n.replace("{}", "nor_gl")}.jpg`, false),
      loadTex(`tex/${n.replace("{}", "rough")}.jpg`, false)]).then(([map, normalMap, roughnessMap]) => { TEX[s] = { map, normalMap, roughnessMap }; }));
  }
  if (earth) jobs.push(Promise.all([loadTex("earth/earth_day.jpg", true), loadTex("earth/earth_night.jpg", true)]).then(([d, n]) => { TEX.earthDay = d; TEX.earthNight = n; }));
  for (const name of [].concat(hdr)) {
    if (!HDRS[name]) throw new Error(`cine: no hdr "${name}" (have ${Object.keys(HDRS).join(", ")})`);
    jobs.push(fetch(`${BASE}hdr/${HDRS[name]}.hdr`).then((r) => r.arrayBuffer()).then((b) => { HDR[name] = parseHdr(b); }));
  }
  if (fonts && typeof FontFace !== "undefined") {
    for (const w of [600, 800]) jobs.push(new FontFace("Barlow Condensed", `url(${BASE}fonts/BarlowCondensed-${w}-latin.woff2)`, { weight: String(w) }).load().then((f) => document.fonts.add(f)));
  }
  const loaded = Promise.all(jobs);
  if (typeof window !== "undefined") {
    window.__hf = window.__hf || {};
    window.__hf.buildReady = window.__hf.buildReady || {};
    if (!waiting) {
      waiting = loaded.then(() => new Promise((res) => {
        // then wait for the page's own build, which starts only once this module and reel.js have finished
        const look = () => {
          const other = Object.entries(window.__hf.buildReady || {}).find(([k]) => k !== "cine");
          if (other) Promise.resolve(other[1]).then(res); else setTimeout(look, 20);
        };
        look();
      }));
      window.__hf.buildReady.cine = waiting;
    }
  }
  return loaded;
}

// A material from a loaded set. repeat: tiles across the object's UVs; any MeshStandardMaterial field may be added.
export function pbr(set, { repeat = [1, 1], normalScale = 1, ...fields } = {}) {
  const T = TEX[set];
  if (!T) throw new Error(`cine: set "${set}" was not preloaded`);
  const copy = (t) => { const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; };
  return new THREE.MeshStandardMaterial({ map: copy(T.map), normalMap: copy(T.normalMap), roughnessMap: copy(T.roughnessMap), roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(normalScale, normalScale), ...fields });
}

// ---------------------------------------------------------------- the look, the stage, the light

// Mutates the kit's LOOK, so call it at reel.js module level, before createStage reads it. Only this page is affected.
export function cineLook(over = {}) {
  Object.assign(LOOK, {
    tone: "AGX",            // keeps the colour of bright lights where NEUTRAL clips them flat
    lightScale: 1, hemiScale: 1, sunScale: 1,
    envIntensity: 0.55,
    rim: false,             // the bright look's automatic rim flattens a dark set; add rim light on purpose
    bloomThreshold: 0.85, bloomSmoothing: 0.3, bloomIntensity: 1.05, bloomRadius: 0.75,
    hdrClamp: 12,
    bokeh: 7, dofBand: 0.14, dofGain: 2.2,
    saturation: 0.04, contrast: 0.1,
    vignette: true, vignetteOffset: 0.3, vignetteDarkness: 0.62,
    aoIntensity: 2.4, aoColor: 0x000000,
    paintEnv: 0.34,         // clearcoat reflections (the phone's glass): the stage applies this to every clearcoat material
  }, over);
  return LOOK;
}

// sky presets: the stage mixes these by env.sky. hemi and sun are real intensities (cineLook sets the scales to 1).
export const CINE_SKIES = {
  night: { bg: 0x03050c, hemiSky: 0x2a3a66, hemiGround: 0x05060c, hemi: 0.5, sun: 1.5, sunCol: 0x9db4ff },
  abyss: { bg: 0x010411, hemiSky: 0x16245c, hemiGround: 0x02030a, hemi: 0.45, sun: 1.1, sunCol: 0x6d86ff },
  dusk: { bg: 0x120a12, hemiSky: 0x6a4658, hemiGround: 0x120a08, hemi: 0.45, sun: 2.0, sunCol: 0xffa070 },
  void: { bg: 0x010102, hemiSky: 0x1c2030, hemiGround: 0x030304, hemi: 0.22, sun: 1.2, sunCol: 0xcfd8ff },
  space: { bg: 0x000000, hemiSky: 0x000000, hemiGround: 0x000000, hemi: 0, sun: 0, sunCol: 0xffffff },
};

// The reel's STAGE export. skies: the presets for env.sky 0, 1 and 2, so one reel can hold three kinds of darkness.
export function cineStage({ skies = ["night", "void", "space"], near = 0.05, far = 4200, fog = null, shadowMin = 2, shadowMax = 60, aoRadius = 0.35 } = {}) {
  const s = skies.map((n) => (typeof n === "string" ? CINE_SKIES[n] : n));
  return { near, far, fog, shadowMin, shadowMax, aoRadius, skies: { day: s[0], dusk: s[1], night: s[2] } };
}

// A photographed room's light as the scene's reflections. Call from buildWorld. rotation: radians round y.
export function useHdr(ctx, name = "studio", { rotation = 0 } = {}) {
  if (!HDR[name]) throw new Error(`cine: hdr "${name}" was not preloaded`);
  const pm = new THREE.PMREMGenerator(ctx.renderer);
  ctx.scene.environment = pm.fromEquirectangular(HDR[name]).texture;
  ctx.scene.environmentRotation = new THREE.Euler(0, rotation, 0);
  pm.dispose();
  return ctx.scene.environment;
}

// The world's view(...) hook: runs after the stage's own light rig for each view. It drops the bright look's fill and
// moves the stage's sun to a low angle, because a light that grazes the surface is what makes a normal map read.
// A frame may set F.key = { az, el, k, env } (degrees, degrees, a gain on the sun, the reflections' strength) per shot.
export function cineView({ az = -60, el = 14, fill = 0, env = null } = {}) {
  const dir = new THREE.Vector3();
  return function view(v, F, i, ctx) {
    const K = F.key || {};
    const A = THREE.MathUtils.degToRad(K.az ?? az), E = THREE.MathUtils.degToRad(K.el ?? el);
    const { sun, fill: f } = ctx.lights;
    f.intensity = fill;
    dir.set(Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E));
    const L = sun.position.distanceTo(sun.target.position);
    sun.position.copy(sun.target.position).addScaledVector(dir, L);
    sun.intensity *= K.k ?? 1;
    if ((K.env ?? env) != null) ctx.scene.environmentIntensity = K.env ?? env;
    sun.updateMatrixWorld();
  };
}

// Show one group of a reel's places: showOnly({ road, globe, desk }, F.place)
export function showOnly(groups, name) {
  for (const k in groups) groups[k].visible = k === name;
}

// ---------------------------------------------------------------- timing and the camera

// A value through keys [[t, v], ...]: a monotone cubic, so it never overshoots. Short fast cores between slow stretches
// come from the keys themselves, which is where the feel of a move lives.
export function keysAt(keys) {
  const n = keys.length, T = keys.map((k) => k[0]), Y = keys.map((k) => k[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (Y[i + 1] - Y[i]) / (T[i + 1] - T[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    if (t <= T[0]) return Y[0];
    if (t >= T[n - 1]) return Y[n - 1];
    let i = 0;
    while (t > T[i + 1]) i++;
    const h = T[i + 1] - T[i], u = (t - T[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * Y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * Y[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

// A camera that rides with something moving along a curve: at(u) gives { p, l, fov, focus, roll } a frame can use as a
// view's cam. back: behind the subject; up, side: offsets; ahead: how far past it the camera looks; lag: u behind.
export function rideCam(curve, { back = 2, up = 0.5, side = 0.4, ahead = 3, lift = 0.1, lag = 0, fov = 38, roll = 0 } = {}) {
  const c = curve.curve || curve, P = new THREE.Vector3(), T = new THREE.Vector3(), R = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  return (u) => {
    const q = clamp(u - lag);
    c.getPointAt(q, P);
    c.getTangentAt(q, T);
    R.crossVectors(T, Y).normalize();
    const pp = P.clone().addScaledVector(T, -back).addScaledVector(Y, up).addScaledVector(R, side);
    const ll = P.clone().addScaledVector(T, ahead).addScaledVector(Y, lift);
    return { p: pp.toArray(), l: ll.toArray(), fov, roll, focus: c.getPointAt(clamp(u)).toArray() };
  };
}

// Puts a camera on the frame state with a shot id. A different shot id is a declared cut.
export function useCam(F, cam, shot, extra = {}) {
  F.views = [{ cam, ...extra }];
  F.shot = shot;
  return F;
}

// ---------------------------------------------------------------- the sky behind a dark set

// A dark sky with haze on the horizon, so a ground fades into something and is not cut off against black. glow: a warmer
// patch at the horizon toward glowAz (degrees), the way a distant town lights the air. center: put it on the set.
// Give the stage's sky the same bg as horizon (fog fades to bg, and a mismatch draws a hard line at the end of the ground).
export function skyDome(scene, { top = 0x01030a, horizon = 0x0b1630, glow = 0x000000, glowAz = 0, glowWidth = 40, height = 0.16, center = [0, 0, 0], R = 1500, parent = null } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) }, uGlow: { value: new THREE.Color(glow) }, uAz: { value: THREE.MathUtils.degToRad(glowAz) }, uW: { value: THREE.MathUtils.degToRad(glowWidth) }, uH: { value: height } },
    vertexShader: "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uTop, uHor, uGlow; uniform float uAz, uW, uH; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float e = max(d.y, 0.0), k = exp(-e / uH);
        float a = atan(d.x, d.z) - uAz; a = atan(sin(a), cos(a));
        vec3 c = mix(uTop, uHor, k) + uGlow * exp(-a * a / (uW * uW)) * exp(-e / (uH * 0.6));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), m);
  mesh.position.set(...center);
  mesh.renderOrder = -20;
  (parent || scene).add(mesh);
  return mesh;
}

// Lights far away, out of focus: soft discs that give a dark frame a depth behind the subject. box: [[x0, x1], [y0, y1], [z0, z1]].
export function farLights(scene, { n = 120, seed = 41, box = [[-200, 200], [0, 12], [-420, -160]], size = 2.6, colors = [0xffb765, 0xffd9a0, 0x9fc4ff], boost = 1, parent = null } = {}) {
  const r = mulberry32(seed), g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    p.set([box[0][0] + r() * (box[0][1] - box[0][0]), box[1][0] + r() * r() * (box[1][1] - box[1][0]), box[2][0] + r() * (box[2][1] - box[2][0])], i * 3);
    col.set(colors[Math.floor(r() * colors.length)]).multiplyScalar(boost * (0.25 + r() * r() * 1.1));
    c.set([col.r, col.g, col.b], i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: radialTexture([[0, 1], [0.72, 0.9], [0.86, 0.45], [1, 0]]), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true }));
  pts.renderOrder = -5;
  pts.frustumCulled = false;
  (parent || scene).add(pts);
  return pts;
}

// ---------------------------------------------------------------- ground and rock

// seeded smooth noise, summed over octaves: a pure function of x and z
export function noise2(seed = 1) {
  const r = mulberry32(seed), N = 256, tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  const at = (x, z) => tab[((x & 255) + (z & 255) * N) % tab.length];
  const n1 = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return (at(ix, iz) * (1 - ux) + at(ix + 1, iz) * ux) * (1 - uz) + (at(ix, iz + 1) * (1 - ux) + at(ix + 1, iz + 1) * ux) * uz;
  };
  return (x, z, oct = 4) => {
    let a = 1, f = 1, s = 0, w = 0;
    for (let i = 0; i < oct; i++) { s += a * n1(x * f + i * 17.3, z * f - i * 9.1); w += a; a *= 0.5; f *= 2.03; }
    return s / w - 0.5;
  };
}

// A height function for a ground: amp world units over features about `scale` wide
export function rollingHeight({ seed = 3, amp = 0.5, scale = 12, oct = 4 } = {}) {
  const n = noise2(seed);
  return (x, z) => n(x / scale, z / scale, oct) * amp * 2;
}

// Breaks the repeat of a tiled photograph, the first thing that gives away a CG ground: two more reads of the same map
// at other scales and angles change its brightness slowly across the set.
function breakTiling(m, { depth = 0.55 } = {}) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      {
        vec2 q = vec2(0.8, 0.6) * vMapUv.x + vec2(-0.6, 0.8) * vMapUv.y;
        float a = dot(texture2D(map, q * 0.083 + 0.31).rgb, vec3(0.33));
        float b = dot(texture2D(map, vMapUv.yx * 0.271 + 0.17).rgb, vec3(0.33));
        float l = dot(texture2D(map, vMapUv).rgb, vec3(0.33)) + 1e-3;
        diffuseColor.rgb *= mix(1.0, clamp(0.45 + 1.5 * (0.6 * a + 0.4 * b) / (0.25 + l * 0.5), 0.45, 1.7), ${depth.toFixed(3)});
      }`);
  };
  m.customProgramCacheKey = () => `cine-tile-${depth}`;
  return m;
}

// A ground from a texture set. height: a function (x, z) -> y, flat when absent. size in world units, tile: world units
// a photograph covers. Returns { mesh, group, heightAt }.
export function texturedGround(scene, { set = "soil", size = [80, 80], seg = [220, 220], center = [0, 0, 0], tile = 3, height = null, color = 0xffffff,
  normalScale = 1.4, roughness = 1, metalness = 0, tilingDepth = 0.55, parent = null, envMapIntensity } = {}) {
  const g = new THREE.PlaneGeometry(size[0], size[1], seg[0], seg[1]);
  g.rotateX(-Math.PI / 2);
  if (height) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i) + center[0], pos.getZ(i) + center[2]));
    g.computeVertexNormals();
  }
  const m = breakTiling(pbr(set, { repeat: [size[0] / tile, size[1] / tile], normalScale, roughness, metalness, color, ...(envMapIntensity != null ? { envMapIntensity } : {}) }), { depth: tilingDepth });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...center);
  mesh.receiveShadow = true;
  (parent || scene).add(mesh);
  return { mesh, material: m, heightAt: (x, z) => center[1] + (height ? height(x, z) : 0) };
}

// Scattered stones on a ground: a few lumpy shapes, instanced. at(x, z) -> y sits them down. keepOut: (x, z) -> true to skip.
export function scatterStones(scene, { n = 400, seed = 7, area = [[-30, 30], [-30, 30]], size = [0.03, 0.3], at = () => 0, keepOut = null, set = "rock", color = 0xffffff, parent = null, tile = 2 } = {}) {
  const r = mulberry32(seed), group = new THREE.Group(), kinds = 3, per = Math.ceil(n / kinds);
  const m = pbr(set, { repeat: [tile, tile], color, normalScale: 1.2 });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  for (let k = 0; k < kinds; k++) {
    const g = new THREE.IcosahedronGeometry(1, 5), pos = g.attributes.position, v = new THREE.Vector3();
    // smooth lumps from sines of the direction, so a stone has no crease where a noise lookup would fold
    const ph = Array.from({ length: 12 }, () => r() * 6.283), ax = Array.from({ length: 9 }, () => r() * 2 - 1);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const lump = (a, f, p) => Math.sin(f * (v.x * ax[a] + v.y * ax[a + 1] + v.z * ax[a + 2]) + p);
      const d = 1 + 0.2 * lump(0, 2.1, ph[0]) + 0.12 * lump(3, 4.3, ph[1]) + 0.05 * lump(6, 9.1, ph[2]) + 0.04 * Math.sin(7 * v.x + ph[3]) * Math.sin(8 * v.z + ph[4]);
      pos.setXYZ(i, v.x * d, v.y * d * 0.72, v.z * d);
    }
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, m, per);
    let placed = 0;
    for (let tries = 0; tries < per * 4 && placed < per; tries++) {
      const x = area[0][0] + r() * (area[0][1] - area[0][0]), z = area[1][0] + r() * (area[1][1] - area[1][0]);
      const u = r(), s = size[0] + (size[1] - size[0]) * u * u * u;   // many small, few large
      const a = r(), b = r(), c = r(), d = r();
      if (keepOut && keepOut(x, z)) continue;
      S.set(s * (0.8 + 0.5 * a), s * (0.55 + 0.5 * b), s * (0.8 + 0.5 * c));
      P.set(x, at(x, z) + s * 0.12, z);
      Q.setFromEuler(E.set(0.3 * (a - 0.5), d * 6.283, 0.3 * (b - 0.5)));
      im.setMatrixAt(placed++, M.compose(P, Q, S));
    }
    im.count = placed;
    im.castShadow = im.receiveShadow = true;
    group.add(im);
  }
  (parent || scene).add(group);
  return group;
}

// ---------------------------------------------------------------- cable, glowing path, moving light

const curveOf = (path) => (path.getPointAt ? path : new THREE.CatmullRomCurve3(path.map(V3), false, "centripetal"));

// A cable along a path: a textured tube, or with strands > 0 wires wound round a dark core (wire rope, a power line).
// Returns { group, curve, pointAt(u), tangentAt(u) }.
export function cineCable(scene, { path, r = 0.06, set = "iron", color = 0x8a8f9c, metalness = 0.7, roughness = 0.9, strands = 0, lay = 0, seg = 400, radial = 12, tile = 1, parent = null, normalScale = 0.8 } = {}) {
  const curve = curveOf(path), group = new THREE.Group(), len = curve.getLength();
  if (!strands) {
    const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
    const circ = 2 * Math.PI * r, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / (circ * tile), uv.getY(i));
    const mesh = new THREE.Mesh(g, pbr(set, { color, metalness, roughness, normalScale }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  } else {
    // wires touching round the core: rc + rs = r, 2 pi rc = 2 rs strands
    const rc = r / (1 + Math.PI / strands), rs = r - rc, step = lay || rc * 40, turns = len / step;
    const samples = Math.ceil(turns * 28) + 2, fr = curve.computeFrenetFrames(samples, false);
    const mat = pbr(set, { color, metalness, roughness, normalScale });
    for (let k = 0; k < strands; k++) {
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const u = i / samples, th = (k / strands) * 2 * Math.PI + turns * u * 2 * Math.PI, o = curve.getPointAt(u);
        pts.push(o.addScaledVector(fr.normals[i], Math.cos(th) * rc).addScaledVector(fr.binormals[i], Math.sin(th) * rc));
      }
      const c = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(c, samples * 2, rs * 1.05, 6, false), uv = g.attributes.uv, l = c.getLength(), ci = 2 * Math.PI * rs;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), (uv.getX(i) * l) / (ci * tile));
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(seg, 200), rc, 10, false), new THREE.MeshStandardMaterial({ color: 0x020305, roughness: 0.9 }));
    group.add(core);
  }
  (parent || scene).add(group);
  return { group, curve, pointAt: (u) => curve.getPointAt(clamp(u)), tangentAt: (u) => curve.getTangentAt(clamp(u)) };
}

function radialTexture(stops, w = 128, h = 128) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.translate(w / 2, h / 2); x.scale(w / 2, h / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
  stops.forEach(([o, a]) => g.addColorStop(o, `rgba(255,255,255,${a})`));
  x.fillStyle = g; x.fillRect(-1, -1, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let FLARE = null;
const flares = () => FLARE || (FLARE = {
  core: radialTexture([[0, 1], [0.22, 0.95], [0.45, 0.4], [0.75, 0.08], [1, 0]]),
  halo: radialTexture([[0, 0.5], [0.08, 0.26], [0.2, 0.09], [0.4, 0.022], [0.7, 0.003], [1, 0]]),
  streak: radialTexture([[0, 1], [0.15, 0.55], [0.45, 0.12], [1, 0]], 512, 16),
});
function glowSprite(parent, tex, color, boost) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(boost), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false }));
  s.renderOrder = 9;
  parent.add(s);
  return s;
}

// A glowing line along a path, with a bright stretch that travels: yellow behind a head at update(head), faint ahead.
// tail: the length of the bright stretch, as a fraction of the path. base: how much of the whole path shows when unlit.
export function pathGlow(scene, { path, r = 0.012, color = 0xffc24a, boost = 5, tail = 0.25, base = 0.0, baseColor = 0xffffff, seg = 500, parent = null } = {}) {
  const curve = curveOf(path);
  const g = new THREE.TubeGeometry(curve, seg, r, 6, false);
  const m = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uTail: { value: tail }, uCol: { value: new THREE.Color(color).multiplyScalar(boost) }, uBase: { value: new THREE.Color(baseColor).multiplyScalar(base) }, uK: { value: 1 } },
    vertexShader: "varying float vS; void main() { vS = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uHead, uTail, uK; uniform vec3 uCol, uBase; varying float vS;
      void main() {
        float d = uHead - vS;
        float a = d < 0.0 ? 0.0 : pow(clamp(1.0 - d / uTail, 0.0, 1.0), 2.2);
        gl_FragColor = vec4((uCol * a + uBase) * uK, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 8;
  (parent || scene).add(mesh);
  return { mesh, curve, update(head, k = 1) { m.uniforms.uHead.value = head; m.uniforms.uK.value = k; mesh.visible = k > 0; } };
}

// A moving light: a hot core, a halo, a thin horizontal lens streak and a real point light that lights what is near it.
// That real light on the ground is most of why it reads as light and not as a sticker. update(u, k): u along the path,
// k the brightness (0 hides it). lift: distance above the path. Returns { update, position }.
export function lightPulse(scene, { path, color = 0xffb040, size = 0.35, boost = 6, light = 3, reach = 6, lift = 0, parent = null, streak = 1 } = {}) {
  const curve = curveOf(path), T = flares(), group = new THREE.Group();
  const halo = glowSprite(group, T.halo, color, boost * 0.16), core = glowSprite(group, T.core, new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6), boost), st = streak ? glowSprite(group, T.streak, color, boost * 0.5) : null;
  halo.scale.setScalar(size * 5);
  core.scale.setScalar(size);
  if (st) st.scale.set(size * 9 * streak, size * 0.28, 1);
  const pl = new THREE.PointLight(color, light, reach, 2);
  group.add(pl);
  (parent || scene).add(group);
  const baseC = core.material.color.clone(), baseH = halo.material.color.clone(), baseS = st && st.material.color.clone();
  return {
    group, curve,
    position: group.position,
    update(u, k = 1) {
      group.visible = k > 0;
      if (k <= 0) { pl.intensity = 0; return; }
      curve.getPointAt(clamp(u), group.position);
      group.position.y += lift;
      core.material.color.copy(baseC).multiplyScalar(k);
      halo.material.color.copy(baseH).multiplyScalar(k);
      if (st) st.material.color.copy(baseS).multiplyScalar(k);
      pl.intensity = light * k;
    },
  };
}

// ---------------------------------------------------------------- dust

// Floating particles in a box that wraps round a centre (give it the camera or the subject, and it never runs out). Soft
// round points, larger near the lens. update(t, center, k): pure in t. size in world units.
export function floatingDust(scene, { n = 900, seed = 21, box = [12, 6, 12], size = 0.03, color = 0xbfd0ff, opacity = 0.5, drift = [0.02, 0.01, -0.03], parent = null } = {}) {
  const r = mulberry32(seed), g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    p.set([r() * box[0], r() * box[1], r() * box[2]], i * 3);
    const u = r();
    a.set([0.35 + 1.65 * u * u * u, r() * 6.283], i * 2);
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("info", new THREE.BufferAttribute(a, 2));
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uD: { value: new THREE.Vector3(...drift) }, uSize: { value: size }, uCol: { value: new THREE.Color(color) }, uO: { value: opacity }, uPx: { value: 1280 * LOOK.ss } },
    vertexShader: `attribute vec2 info; uniform float uT, uSize, uPx; uniform vec3 uC, uBox, uD; varying float vA;
      void main() {
        vec3 q = position + uD * uT * info.x + 0.04 * vec3(sin(uT * 0.7 + info.y), sin(uT * 0.5 + info.y * 2.0), cos(uT * 0.6 + info.y));
        q = mod(q - uC + uBox * 0.5, uBox) - uBox * 0.5 + uC;
        vec4 mv = viewMatrix * vec4(q, 1.0);
        float px = uSize * info.x * uPx / max(0.05, -mv.z);
        gl_PointSize = clamp(px, 1.5, 90.0);
        vec3 e = abs(q - uC) / (uBox * 0.5);
        vA = (1.0 - smoothstep(0.75, 1.0, max(e.x, max(e.y, e.z)))) * clamp(px / gl_PointSize, 0.0, 1.0) / (1.0 + gl_PointSize * 0.03);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uO; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float s = smoothstep(1.0, 0.45, d); gl_FragColor = vec4(uCol * s * vA * uO, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  (parent || scene).add(pts);
  return { points: pts, update(t, center = [0, 0, 0], k = 1) { m.uniforms.uT.value = t; m.uniforms.uC.value.set(...center); m.uniforms.uO.value = opacity * k; pts.visible = k > 0; } };
}

// ---------------------------------------------------------------- the night globe

const GLOBE_V = "varying vec2 vUv; varying vec3 vN, vP; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }";
const GLOBE_F = `uniform sampler2D uDay, uNight; uniform vec3 uSun, uAirCol, uCity; uniform float uLights, uMoon, uAir, uDayK, uLo, uHi;
  varying vec2 vUv; varying vec3 vN, vP;
  void main() {
    vec3 N = normalize(vN), V = normalize(cameraPosition - vP);
    float ndl = dot(N, uSun), lit = smoothstep(-0.08, 0.3, ndl);
    vec3 d = texture2D(uDay, vUv).rgb, n = texture2D(uNight, vUv).rgb;
    float land = smoothstep(0.0, 0.05, max(d.r, d.g * 0.95) - d.b * 0.9);
    // the dark side still shows the shapes, in faint cool light
    float moon = 0.35 + 0.65 * smoothstep(-0.8, 0.8, dot(N, normalize(uSun + vec3(0.2, 0.5, 0.4))));
    vec3 col = (d * vec3(0.42, 0.55, 1.0) + vec3(0.002, 0.004, 0.012)) * uMoon * moon;
    col = mix(col, d * uDayK * (0.2 + max(ndl, 0.0)), lit);
    // city lights: the night map, with its blue sea and grey land taken out
    float L = smoothstep(uLo, uHi, n.r - 0.55 * n.b);
    col += (uCity * L + vec3(1.0, 0.93, 0.8) * pow(L, 4.0) * 1.2) * uLights * (1.0 - lit);
    // a thin sun glint on water, and the air seen edge on
    vec3 H = normalize(uSun + V);
    col += vec3(0.5, 0.65, 1.0) * pow(max(dot(N, H), 0.0), 90.0) * (1.0 - land) * 0.45;
    float f = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 3.6);   // dot can pass 1: pow of a negative is NaN, and bloom spreads it into a black frame
    col += uAirCol * f * uAir * (0.22 + 0.9 * smoothstep(-0.5, 0.5, ndl));
    gl_FragColor = vec4(col, 1.0);
  }`;
const AIR_F = `uniform vec3 uAirCol, uSun; uniform float uAir, uEdge; varying vec3 vN, vP;
  void main() {
    vec3 N = normalize(vN), V = normalize(cameraPosition - vP);
    float k = abs(dot(N, V)) / uEdge;
    float a = pow(clamp(k, 0.0, 1.0), 2.4);
    gl_FragColor = vec4(uAirCol * a * uAir * (0.22 + 0.9 * smoothstep(-0.5, 0.5, dot(N, uSun))), 1.0);
  }`;

// The Earth at night from the photographed maps (preload with earth: true). Light from the sun direction shows day
// on that side; put it behind the planet for a crescent of air. Returns { group, R, latLon, arc, update, worldAt }.
export function nightGlobe(scene, { R = 100, center = [0, 0, 0], sun = [0.75, 0.25, -0.62], lights = 2.8, moon = 0.14, air = 1.2, airColor = 0x3f7dff, city = 0xffb765, day = 1, stars = 2600, seed = 5, parent = null, spinAt = null } = {}) {
  if (!TEX.earthDay) throw new Error("cine: nightGlobe needs preload({ earth: true })");
  const group = new THREE.Group(), body = new THREE.Group();
  group.position.set(...center);
  group.add(body);
  const sunV = new THREE.Vector3(...sun).normalize();
  const U = { uDay: { value: TEX.earthDay }, uNight: { value: TEX.earthNight }, uSun: { value: sunV }, uLights: { value: lights }, uMoon: { value: moon }, uAir: { value: air }, uDayK: { value: day },
    uAirCol: { value: new THREE.Color(airColor) }, uCity: { value: new THREE.Color(city) }, uLo: { value: 0.05 }, uHi: { value: 0.6 } };
  body.add(new THREE.Mesh(new THREE.SphereGeometry(R, 192, 128), new THREE.ShaderMaterial({ uniforms: U, vertexShader: GLOBE_V, fragmentShader: GLOBE_F })));
  const airR = 1.035, edge = Math.sqrt(1 - 1 / (airR * airR));
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * airR, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uAirCol: U.uAirCol, uSun: U.uSun, uAir: U.uAir, uEdge: { value: edge } }, vertexShader: GLOBE_V, fragmentShader: AIR_F, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(shell);
  if (stars) {
    const r = mulberry32(seed), pos = new Float32Array(stars * 3), col = new Float32Array(stars * 3), far = R * 25;
    for (let i = 0; i < stars; i++) {
      const z = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - z * z), m = r(), b = 0.04 + 0.35 * m * m * m + 0.6 * Math.pow(m, 12);
      pos.set([s * Math.cos(a) * far, z * far, s * Math.sin(a) * far], i * 3);
      col.set([b * 0.86, b * 0.93, b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    p.frustumCulled = false;
    group.add(p);
  }
  (parent || scene).add(group);
  const D = Math.PI / 180;
  const latLon = (lat, lon, r = R) => {
    const ph = (90 - lat) * D, th = (lon + 180) * D;
    return new THREE.Vector3(-r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
  };
  // a curve over the surface between two [lat, lon] points, in the body's own space, for pathGlow and lightPulse
  const arc = (a, b, { lift = 0.03, n = 64 } = {}) => {
    const A = latLon(a[0], a[1], 1), B = latLon(b[0], b[1], 1), om = Math.acos(clamp(A.dot(B), -1, 1)), pts = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n, q = A.clone().multiplyScalar(Math.sin((1 - s) * om)).addScaledVector(B, Math.sin(s * om)).divideScalar(Math.sin(om) || 1);
      pts.push(q.normalize().multiplyScalar(R * (1.002 + lift * Math.sin(Math.PI * s))));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  return {
    group, body, R, latLon, arc,
    worldAt: (lat, lon, r = R) => body.localToWorld(latLon(lat, lon, r)),
    update(t) { if (spinAt) body.rotation.y = spinAt(t); },
    uniforms: U,
  };
}

// A camera over a point of a globe: dist above the surface, tilted, with the focus on the surface so the planet stays
// sharp. screenUp lifts the look point, which drops the globe in the frame.
export function globeCam(globe, { lat = 20, lon = 0, dist = 180, az = 0, tilt = 0, fov = 34, screenUp = 0, roll = 0 } = {}) {
  const c = globe.group.position, P = globe.latLon(lat, lon, globe.R + dist).applyQuaternion(globe.body.quaternion);
  const S = globe.latLon(lat, lon, globe.R).applyQuaternion(globe.body.quaternion);
  const n = S.clone().normalize(), east = new THREE.Vector3(0, 1, 0).cross(n).normalize(), north = n.clone().cross(east);
  const dir = east.clone().multiplyScalar(Math.sin(az)).addScaledVector(north, Math.cos(az));
  const p = P.clone().addScaledVector(dir, -tilt).add(c), l = S.clone().addScaledVector(north, screenUp).add(c);
  return { p: p.toArray(), l: l.toArray(), fov, roll, focus: S.clone().add(c).toArray() };
}

// ---------------------------------------------------------------- the phone

// A phone: metal frame, glass front that reflects the room over a screen fed from a canvas, a lens bump on the back. h is
// its height in world units. draw(c, w, h, t, state) paints the screen; update(t, state) repaints when state.key changes
// (leave key out to repaint on every frame). Words painted on the screen are handled by the kit's mirror on their own.
export function cinePhone(scene, { h = 1.6, frame = 0x3c4048, draw = null, bright = 0.82, canvas = [640, 1386], parent = null, spill = 0.5, spillColor = 0xa8c0ff } = {}) {
  const w = h * 0.486, d = h * 0.05, r = h * 0.075, group = new THREE.Group();
  const body = new THREE.Mesh(rbox(w, h, d, r * 0.72, 6), new THREE.MeshPhysicalMaterial({ color: frame, metalness: 1, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const shape = (wd, ht, rad, mat, z) => {
    const g = new THREE.ShapeGeometry(rrect(wd, ht, rad), 16), uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / wd + 0.5, pos.getY(i) / ht + 0.5);
    const m = new THREE.Mesh(g, mat);
    m.position.z = z;
    group.add(m);
    return m;
  };
  shape(w * 0.985, h * 0.99, r * 0.92, new THREE.MeshPhysicalMaterial({ color: 0x010102, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }), d / 2 + h * 0.0006);
  const c = document.createElement("canvas");
  c.width = canvas[0]; c.height = canvas[1];
  const x = c.getContext("2d"), tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const screenMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: bright, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
  const scr = shape(w * 0.93, h * 0.965, r * 0.72, screenMat, d / 2 + h * 0.0012);
  shape(h * 0.13, h * 0.038, h * 0.019, new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.25 }), d / 2 + h * 0.0018).position.y = h * 0.44;
  // buttons and the back's lens bump
  const steel = new THREE.MeshStandardMaterial({ color: frame, metalness: 1, roughness: 0.3 });
  for (const [sx, y, len] of [[1, 0.17, 0.1], [-1, 0.2, 0.06], [-1, 0.1, 0.06]]) {
    const b = new THREE.Mesh(rbox(h * 0.006, h * len, d * 0.42, h * 0.002, 2), steel);
    b.position.set((sx * (w + h * 0.003)) / 2, h * y, 0);
    group.add(b);
  }
  const bump = new THREE.Mesh(rbox(w * 0.46, w * 0.46, d * 0.3, w * 0.08, 4), new THREE.MeshPhysicalMaterial({ color: frame, metalness: 0.8, roughness: 0.4, clearcoat: 0.6 }));
  bump.position.set(-w * 0.22, h * 0.34, -d / 2 - d * 0.1);
  group.add(bump);
  const lensG = new THREE.CylinderGeometry(w * 0.075, w * 0.085, d * 0.3, 32), lensM = new THREE.MeshPhysicalMaterial({ color: 0x020203, metalness: 0.2, roughness: 0.04, clearcoat: 1 });
  for (const [lx, ly] of [[-0.32, 0.42], [-0.13, 0.42], [-0.22, 0.26]]) {
    const l = new THREE.Mesh(lensG, lensM);
    l.rotation.x = Math.PI / 2;
    l.position.set(w * lx, h * ly, -d / 2 - d * 0.25);
    group.add(l);
  }
  // the screen's light on what is behind it, a soft quad: a real point light here would mirror in the glass as a white dot
  const glow = spill ? new THREE.Mesh(new THREE.PlaneGeometry(h * 2.6, h * 2.6), new THREE.MeshBasicMaterial({ map: flares().halo, color: new THREE.Color(spillColor).multiplyScalar(spill), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })) : null;
  if (glow) { glow.position.z = -d / 2 - h * 0.0005; glow.renderOrder = 1; group.add(glow); }
  (parent || scene).add(group);
  let last;
  const paint = (t, st) => { x.save(); x.clearRect(0, 0, c.width, c.height); draw && draw(x, c.width, c.height, t, st || {}); x.restore(); tex.needsUpdate = true; };
  paint(0, {});
  return {
    group, screen: scr, canvas: c, width: w, height: h, depth: d,
    update(t, st = {}) {
      const key = st.key ?? t;
      if (key !== last) { last = key; paint(t, st); }
      if (glow) glow.visible = (st.spill ?? 1) > 0;
    },
  };
}

// ---------------------------------------------------------------- text: lower caption, title, readout, label, grain

const CSS = `
.cc { font: 700 39px/1.18 Montserrat, sans-serif; color: #fff; text-align: center; width: 620px; letter-spacing: -0.012em; text-shadow: 0 2px 16px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6); }
.cc b { font-weight: 800; color: var(--k, #ffc65a); }
.ct { font: 800 92px/0.98 "Barlow Condensed", sans-serif; color: #fff; text-align: center; width: 660px; text-transform: uppercase; letter-spacing: 0.002em; text-shadow: 0 0 34px rgba(0,0,0,0.65), 0 2px 10px rgba(0,0,0,0.5); }
.ct small { display: block; margin-top: 12px; font: 600 33px/1.1 "Barlow Condensed", sans-serif; text-transform: none; letter-spacing: 0.01em; color: rgba(255,255,255,0.86); }
.cn { font: 800 118px/0.95 "Barlow Condensed", sans-serif; color: var(--k, #fff); text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; text-shadow: 0 0 30px rgba(0,0,0,0.6), 0 0 22px var(--g, transparent); }
.cn small { display: block; margin-top: 6px; font: 600 33px/1.1 "Barlow Condensed", sans-serif; letter-spacing: 0.02em; color: rgba(255,255,255,0.82); }
.cl { font: 600 31px/1.08 "Barlow Condensed", sans-serif; color: #fff; white-space: nowrap; text-shadow: 0 0 12px rgba(0,0,0,0.9); letter-spacing: 0.012em; }
.cl small { display: block; font: 600 22px/1.15 "Barlow Condensed", sans-serif; color: rgba(255,255,255,0.68); }
.cg { width: 720px; height: 1280px; }
`;
let cssDone = false;
const injectCss = () => { if (!cssDone) { cssDone = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); } };
const div = () => { injectCss(); return document.createElement("div"); };
const setHtml = (e, html) => { if (e.__html !== html) { e.__html = html; e.innerHTML = html; } };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const fadeIO = (t, a, b, f = 0.2) => Math.min(smooth(a, a + f, t), 1 - smooth(b - f, b, t));

// a film-grain tile, seeded, its position changing each frame by a hash of the frame number
let GRAIN = null;
function grainUrl() {
  if (GRAIN) return GRAIN;
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d"), d = x.createImageData(S, S), r = mulberry32(99);
  for (let i = 0; i < S * S; i++) { const v = r() < 0.5 ? 0 : 255, a = Math.floor(Math.pow(r(), 1.8) * 255); d.data.set([v, v, v, a], i * 4); }
  x.putImageData(d, 0, 0);
  return (GRAIN = c.toDataURL("image/png"));
}

// The reel's OVERLAY_TYPES export
export const CINE_OVERLAYS = {
  cineCap(it, api) {
    const e = api.el(it.id, () => { const d = div(); d.className = "cc"; return d; });
    const html = it.words.map((w) => (w.key && api.t >= w.s - 0.04 ? `<b>${esc(w.text)}</b>` : esc(w.text))).join(" ");
    setHtml(e, html);
    if (it.keyColor) e.style.setProperty("--k", it.keyColor);
    api.place(e, api.W / 2, it.y, 1, 0, Math.min(1, (api.t - it.t0) / 0.05 + 0.3));   // in 1 to 2 frames, no rise
  },
  cineTitle(it, api) {
    const e = api.el(it.id, () => { const d = div(); d.className = "ct"; return d; });
    setHtml(e, esc(it.text) + (it.sub ? `<small>${esc(api.cap1(it.sub))}</small>` : ""));
    const k = fadeIO(api.t, it.t0, it.t1, it.fade ?? 0.27);
    api.place(e, api.W / 2, it.y - (api.t - it.t0) * (it.rise ?? 3), 1, 0, k);
  },
  cineCounter(it, api) {
    const e = api.el(it.id, () => { const d = div(); d.className = "cn"; return d; });
    setHtml(e, esc(it.value) + (it.label ? `<small>${esc(api.cap1(it.label))}</small>` : ""));
    if (it.color) { e.style.setProperty("--k", it.color); e.style.setProperty("--g", it.color + "66"); }
    if (it.size) e.style.fontSize = it.size + "px";
    const p = it.at || [api.W / 2, 300];
    api.place(e, p[0], p[1], 1, 0, fadeIO(api.t, it.t0, it.t1, 0.12));
  },
  cineLabel(it, api) {
    const e = api.el(it.id, () => { const d = div(); d.className = "cl"; return d; });
    setHtml(e, esc(api.cap1(it.text)) + (it.sub ? `<small>${esc(api.cap1(it.sub))}</small>` : ""));
    const a = api.anchorXY(it, api.views);
    if (a.behind) { e.style.display = "none"; return; }
    api.place(e, a.x, a.y, 1, 0, fadeIO(api.t, it.t0, it.t1, 0.12), it.ax ?? 0, it.ay ?? 0.5, true);
  },
  cineGrain(it, api) {
    const e = api.el(it.id, () => { const d = div(); d.className = "cg"; d.style.backgroundImage = `url(${grainUrl()})`; d.style.zIndex = 1; return d; });
    const f = Math.round(api.t * 30), a = (Math.imul(f + 1, 2654435761) >>> 0) % 256, b = (Math.imul(f + 7, 40503) >>> 0) % 256;
    e.style.backgroundPosition = `${a}px ${b}px`;
    api.place(e, api.W / 2, api.H / 2, 1, 0, it.k ?? 0.05);
  },
};

// Item constructors for F.overlays
export const cine = {
  title: (id, text, t0, t1, o = {}) => ({ type: "cineTitle", id, text, t0, t1, y: 215, ...o }),
  counter: (id, value, t0, t1, o = {}) => ({ type: "cineCounter", id, value, t0, t1, ...o }),
  label: (id, text, t0, t1, o = {}) => ({ type: "cineLabel", id, text, t0, t1, ...o }),
  grain: (k = 0.05) => ({ type: "cineGrain", id: "cine-grain", t0: -1, t1: 1e9, k }),
};

// A number that runs from a to b over t0..t1, formatted with thousands separators
export function countUp(t, t0, t1, a, b, { ease = true, digits = 0, suffix = "" } = {}) {
  const u = clamp((t - t0) / (t1 - t0)), k = ease ? 1 - Math.pow(1 - u, 2.4) : u, v = a + (b - a) * k;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}

// Lower captions in short chunks from the kit's timeline: captionAt(t) gives one item for F.overlays, or null.
// keys: words to colour when they are said; chunks break at punctuation, between beats and at maxWords.
export function cineCaptions(TL, { maxWords = 4, keys = [], y = 950, keyColor } = {}) {
  const lc = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
  const KEY = new Set(keys.map(lc));
  const chunks = [];
  for (const b of TL.beats) {
    let cur = null;
    b.words.forEach((w, i) => {
      if (!cur || cur.words.length >= maxWords) { cur = { beat: b.id, words: [] }; chunks.push(cur); }
      cur.words.push({ text: w.w.replace(/[.,!?:;]+$/g, ""), s: w.s, e: w.e, key: KEY.has(lc(w.w)) });
      if (/[,.?!:;]$/.test(w.w) && i < b.words.length - 1) cur = null;
    });
  }
  chunks.forEach((c, i) => {
    const n = chunks[i + 1];
    c.t0 = c.words[0].s - 0.06;
    const end = c.words[c.words.length - 1].e;
    c.t1 = n && n.beat === c.beat ? n.words[0].s - 0.06 : end + 0.3;
    if (n) c.t1 = Math.min(c.t1, n.words[0].s - 0.06);
    c.words[0].text = c.words[0].text.charAt(0).toUpperCase() + c.words[0].text.slice(1);
  });
  return (t) => {
    const c = chunks.find((k) => t >= k.t0 && t < k.t1);
    return c ? { type: "cineCap", id: "cine-cap", t0: c.t0, t1: c.t1, words: c.words, y, keyColor } : null;
  };
}
