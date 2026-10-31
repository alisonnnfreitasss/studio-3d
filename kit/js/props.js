// Shared props, pulled out of the eight builds' world files and generalised: the set pieces (ground and
// terrain with a cut-away soil section, a river's water, the sky with sun, moon and clouds, trees and a
// tree that can be felled, a road, houses) and the effects (dust, debris, wind, streaks, rain, lightning,
// drips, flow dots, confetti, hearts, sparks, sunbeams, splashes, fire, 3D arrows). Every one is built
// once with fixed seeds and posed as a pure function of t and its state: no Math.random, no clock.
// Builders take the scene and return { group?, update(t, state) }; a null state hides the prop.
// Sources: sk = skyscraper world.js, en = engine world.js, ap = airplane world.js / fx3d.js, rf = roof
// world.js; new = written for the kit in the same style (river water, lightning, hearts, felled tree).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32, facet, M, ico } from "./util.js";
import { smoothMat, metal, basic, mesh, cyl, bx, sph, grp, glow, canvasTex, Particles, TAU, clamp, lerp, easeOut, easeIn, mat } from "./kit.js";
import { rbox } from "./shapes.js";
import { LOOK } from "./look.js";
import { S } from "./season.js";

const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// a geometry ready to merge: non-indexed, with uv, normals and (optionally) one vertex colour (sk)
export function prep(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (hex != null) {
    const c = new THREE.Color(hex), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  }
  return g;
}
export const vcol = (o = {}) => M(0xffffff, { vertexColors: true, ...o });

// a seeded value noise in 2D (smooth, deterministic), for terrain bumps
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z, seed = 1) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

// ===================================================================================================
// Ground heights: functions (x, z) => y to give buildTerrain (and to stand characters, trees and roads on)
export const heights = {
  flat: (y = 0) => () => y,
  // a river channel along an axis: a flat bed `depth` down, banks rising over `bank` to `rise`
  river: ({ axis = "z", center = 0, width = 24, depth = 5, bank = 7, rise = 0 } = {}) => (x, z) => {
    const u = Math.abs((axis === "z" ? x : z) - center), hw = width / 2;
    return lerp(-depth, rise, smooth(hw * 0.55, hw + bank, u));
  },
  // rolling hills (seeded noise), amp high, `scale` metres per bump; `keep(x, z)` 0..1 where they apply
  hills: ({ seed = 3, amp = 3, scale = 60, keep = null } = {}) => (x, z) => amp * noise2(x / scale, z / scale, seed) * (keep ? keep(x, z) : 1),
  add: (...fs) => (x, z) => fs.reduce((s, f) => s + f(x, z), 0),
};

// the ground a terrain draws for a height function (its low-poly jitter included): stand characters,
// trees and props on it with the same function the terrain used. Pure, so direction code can use it.
export const groundFn = (height, jitter = 0.12) => (x, z) => height(x, z) + (jitter ? jitter * noise2(x * 0.35, z * 0.35, 7) : 0);

// ===================================================================================================
// Terrain (sk buildCity ground + buildSoil, generalised): a low-poly height field, coloured by height
// (grass, a sand band at the water line, mud below it), with an optional cut-away soil section at
// z = section.z: a block of layers (wavy boundaries, the skyscraper's colours and rock texture) under
// the surface, seen from +z. update(t, { cut }) hides the near half (z > section.z) so the camera can
// look at the face; the far half and the section stay.
//   o = { size: [w, d], seg: [nx, nz], center: [x, z], height: (x, z) => y, waterY, jitter (m, 0.12),
//         colors: { grass, sand, mud }, far: true (a big flat plane beyond, for the horizon),
//         section: { z, x: [x0, x1], bottom, depth, layers: [{ name, color, to: (x, top) => y, tex }], draw } }
//         (draw: false splits the near half without building the soil block)
export const SOIL = {
  topsoil: 0x7d5232, clay: 0xbd8a57, sand: 0xd6b07a, rock: 0x8b8d91,
};
export function rockTexture(seed = 5) {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = "#8b8d91";
    x.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let i = 0; i < 80; i++) {
      const cx = r() * w, cy = r() * h, rr = 10 + r() * 36;
      x.fillStyle = r() < 0.5 ? "#77797d" : "#a1a3a7";
      x.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + r() * 0.5;
        x.lineTo(cx + Math.cos(a) * rr * (0.7 + r() * 0.4), cy + Math.sin(a) * rr * (0.7 + r() * 0.4));
      }
      x.fill();
    }
  });
}
// default layers under a surface `top` (y at x): topsoil 2.6 deep, clay to about -12, sand to the rock
// at about rockTop, rock to the bottom (the skyscraper's wavy boundaries)
export function soilLayers({ rockTop = -24, clayTo = -12.5, topsoil = 2.8 } = {}) {
  return [
    { name: "topsoil", color: SOIL.topsoil, to: (x, top) => top - topsoil + 0.45 * Math.sin(x / 6.5) + 0.25 * Math.sin(x / 2.3 + 1) },
    { name: "clay", color: SOIL.clay, to: (x, top) => Math.min(top - topsoil - 1.5, clayTo + 0.9 * Math.sin(x / 10 + 1.3) + 0.3 * Math.sin(x / 3.1)) },
    { name: "sand", color: SOIL.sand, to: (x) => rockTop + 1.0 * Math.sin(x / 8.5 + 2.1) + 0.35 * Math.sin(x / 2.7 + 0.4) },
    { name: "rock", color: SOIL.rock, tex: true },
  ];
}

export function buildTerrain(scene, o = {}) {
  const g = grp();
  scene.add(g);
  const [W, D] = o.size || [1200, 520];
  const [nx, nz] = o.seg || [240, 160];
  const [cx, cz] = o.center || [0, 0];
  const height = o.height || heights.flat(0);
  const jit = o.jitter ?? 0.12;
  const waterY = o.waterY ?? -1e9;
  const col = { grass: S(0x86c45a), grass2: S(0x79b84f), sand: 0xd6b07a, mud: 0x8a6a48, ...(o.colors || {}) };
  const sec = o.section || null;
  const H = groundFn(height, jit);
  const cG = new THREE.Color(col.grass), cG2 = new THREE.Color(col.grass2), cS = new THREE.Color(col.sand), cM = new THREE.Color(col.mud), cc = new THREE.Color();
  // one height-field mesh over [z0, z1] (split at the section so the near half can hide)
  function field(z0, z1, rows) {
    const geo = new THREE.PlaneGeometry(W, z1 - z0, nx, rows);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, 0, (z0 + z1) / 2);
    const p = geo.attributes.position, n = p.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const y = H(x, z);
      p.setY(i, y);
      // grass on top (two greens in seeded patches), sand in a band at the water line, mud under water
      const pg = noise2(x * 0.05, z * 0.05, 11) > 0.15 ? cG2 : cG;
      if (y < waterY - 1.2) cc.copy(cM);
      else if (y < waterY + 1.0) cc.copy(cS).lerp(cM, clamp((waterY - y) / 1.2));
      else cc.copy(cS).lerp(pg, smooth(waterY + 1.0, waterY + 2.2, y));
      if (waterY < -1e8) cc.copy(pg);
      colors[i * 3] = cc.r; colors[i * 3 + 1] = cc.g; colors[i * 3 + 2] = cc.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = mesh(geo, M(0xffffff, { vertexColors: true, roughness: 1 }), false);
    m.receiveShadow = true;
    return m;
  }
  let near = null, farPart;
  const zA = cz - D / 2, zB = cz + D / 2;
  if (sec && sec.z > zA && sec.z < zB) {
    const rowsFar = Math.max(2, Math.round((nz * (sec.z - zA)) / D));
    farPart = field(zA, sec.z, rowsFar);
    near = field(sec.z, zB, Math.max(2, nz - rowsFar));
    g.add(farPart, near);
  } else {
    farPart = field(zA, zB, nz);
    g.add(farPart);
  }
  // the horizon: a big flat plane under and around the field
  if (o.far !== false) {
    // a ring of flat ground round the field (a hole where the field is, so a river channel stays open)
    const R = 4000, sh = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
    const hw = W / 2 - 0.5, hd = D / 2 - 0.5;
    sh.holes.push(new THREE.Path([new THREE.Vector2(-hw, -hd), new THREE.Vector2(-hw, hd), new THREE.Vector2(hw, hd), new THREE.Vector2(hw, -hd)]));
    const fl = mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), M(col.grass, { roughness: 1 }), false);
    fl.position.set(cx, (o.farY ?? Math.min(0, height(cx + W / 2, cz))) - 0.08, cz);
    fl.receiveShadow = true;
    g.add(fl);
  }
  // the soil section: layers from the surface at z = sec.z down to `bottom`, extruded back by `depth`
  // (section.draw === false: split the near half only, for a reel that draws its own moving section)
  let section = null;
  if (sec && sec.draw !== false) {
    section = grp();
    g.add(section);
    const [x0, x1] = sec.x || [cx - W / 2 + 1, cx + W / 2 - 1];
    const bottom = sec.bottom ?? -60, depth = sec.depth ?? 160, N = Math.max(60, Math.round((x1 - x0) / 1.5));
    const layers = sec.layers || soilLayers(sec);
    const top = (x) => height(x, sec.z) - 0.2;
    let prev = (x) => top(x);
    layers.forEach((L, li) => {
      const upper = prev;
      const lower = L.to ? ((f) => (x) => Math.min(upper(x) - 0.05, f(x, top(x))))(L.to) : () => bottom;
      const s = new THREE.Shape();
      for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N; i ? s.lineTo(x, upper(x)) : s.moveTo(x, upper(x)); }
      for (let i = N; i >= 0; i--) { const x = x0 + ((x1 - x0) * i) / N; s.lineTo(x, lower(x)); }
      const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
      geo.translate(0, 0, sec.z - depth);
      let mtl;
      if (L.tex) {
        const tex = rockTexture(5 + li);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1 / 14, 1 / 14);
        mtl = M(0xffffff, { map: tex, roughness: 1 });
      } else mtl = M(L.color, { roughness: 1 });
      const m = mesh(geo, mtl);
      m.castShadow = false;
      m.userData.layer = L.name;
      section.add(m);
      L._lower = lower;
      prev = lower;
    });
    // pebbles on the face, coloured by their layer, and a turf strip along the top edge (sk)
    const peb = [];
    const r = mulberry32(19);
    for (let i = 0; i < 160; i++) {
      const x = x0 + r() * (x1 - x0);
      const y = top(x) - 0.8 - r() * Math.max(2, top(x) - bottom - 4);
      const s = 0.25 + r() * 0.6;
      let c = SOIL.rock;
      let up = top;
      for (const L of layers) { if (y > (L._lower ? L._lower(x) : bottom)) { c = L.tex ? 0x6f7175 : new THREE.Color(L.color).multiplyScalar(0.85).getHex(); break; } up = L._lower; }
      peb.push(prep(facet(new THREE.IcosahedronGeometry(s, 0), 0.08 * s, 900 + i).scale(1.3, 0.8, 0.5).translate(x, y, sec.z + 0.05), c));
    }
    section.add(mesh(mergeGeometries(peb), vcol({ roughness: 1 }), false));
    const ts = new THREE.Shape();
    for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N; i ? ts.lineTo(x, top(x) + 0.28) : ts.moveTo(x, top(x) + 0.28); }
    for (let i = N; i >= 0; i--) { const x = x0 + ((x1 - x0) * i) / N; ts.lineTo(x, top(x) - 0.3); }
    // the strip is grass on the banks and sand under the water line
    const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.3, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, sec.z - 0.15);
    const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), cGr = new THREE.Color(0x6aa846);
    for (let i = 0; i < tp.count; i++) { const c = tp.getY(i) < waterY + 0.6 ? cS : cGr; tc[i * 3] = c.r; tc[i * 3 + 1] = c.g; tc[i * 3 + 2] = c.b; }
    tg.setAttribute("color", new THREE.BufferAttribute(tc, 3));
    section.add(mesh(tg, vcol({ roughness: 1 }), false));
  }
  function update(t, s = {}) {
    if (near) near.visible = !s.cut;
  }
  return { group: g, near, far: farPart, section, height, H, update };
}

// ===================================================================================================
// Water (new, after the airplane's lake: the same turquoise, flat-shaded): a river surface with gentle
// waves that travel downstream, foam dashes flowing with the current, ripple rings round anything
// standing in it, splashes (ap buildSplash), and, with a section, the water's cut face down to the bed.
//   o = { x: [x0, x1], z: [z0, z1], y (level), flow: [dx, dz] (unit direction), speed (m/s), color,
//         seg: [nx, nz], section: { z, bed: (x) => y } }
//   update(t, { waves (amplitude, 0.12), speed, rings: [{ at: [x, z], r, k }], splashes: [{ t0, at, size }],
//                cut (hide the near part), foam (0..1, 1) })
export function buildWater(scene, o = {}) {
  const g = grp();
  scene.add(g);
  const [x0, x1] = o.x || [-12, 12], [z0, z1] = o.z || [-300, 300];
  const Y = o.y ?? -1.5;
  const flow = o.flow || [0, 1];
  const fl = Math.hypot(flow[0], flow[1]) || 1, fx = flow[0] / fl, fz = flow[1] / fl;
  const color = o.color ?? 0x46c6c4;
  const wm = smoothMat(color, { roughness: 0.28, metalness: 0.0, flatShading: true, emissive: new THREE.Color(color).multiplyScalar(0.12) });
  const sec = o.section || null;
  const parts = [];
  function surface(za, zb) {
    const nx = o.seg?.[0] ?? Math.max(4, Math.round((x1 - x0) / 2.2)), nz = Math.max(4, Math.round(((zb - za) / (z1 - z0)) * (o.seg?.[1] ?? 120)));
    const geo = new THREE.PlaneGeometry(x1 - x0, zb - za, nx, nz).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, Y, (za + zb) / 2);
    const m = mesh(geo, wm, false);
    m.receiveShadow = true;
    m.userData.base = Float32Array.from(geo.attributes.position.array);
    g.add(m);
    parts.push(m);
    return m;
  }
  let near = null;
  if (sec && sec.z > z0 && sec.z < z1) { surface(z0, sec.z); near = surface(sec.z, z1); }
  else surface(z0, z1);
  // the cut face: from the bed up to the level, a little darker and see-through
  let face = null;
  if (sec && sec.bed) {
    const N = 80, s = new THREE.Shape();
    const pts = [];
    for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N; pts.push([x, Math.min(Y, sec.bed(x))]); }
    s.moveTo(x0, Y); s.lineTo(x1, Y);
    for (let i = N; i >= 0; i--) s.lineTo(pts[i][0], pts[i][1]);
    face = mesh(new THREE.ShapeGeometry(s, 1).translate(0, 0, sec.z + 0.02), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), roughness: 0.2, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }), false);
    face.renderOrder = 2;
    g.add(face);
  }
  // foam dashes flowing with the current (an instanced pool; each dash wraps along the river)
  const FN = 140;
  const foamM = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.75, depthWrite: false });
  const foam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), foamM, FN);
  foam.frustumCulled = false;
  g.add(foam);
  const fr = mulberry32(o.seed ?? 61);
  const FR = Array.from({ length: FN }, () => [fr(), fr(), fr(), fr()]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fx, fz)), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const hid = new THREE.Matrix4().makeScale(0, 0, 0);
  // ripple rings (a pool) and splashes (a pool of the airplane's splash)
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const rings = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2), ringM.clone()); m.visible = false; g.add(m); return m; });
  const splashes = [0, 1, 2].map((i) => buildSplash(g, 81 + i));
  const L = Math.abs((fz !== 0 ? z1 - z0 : x1 - x0));
  function update(t, s = {}) {
    g.visible = s !== null;
    if (s === null) return;
    const amp = s.waves ?? 0.12, sp = s.speed ?? o.speed ?? 2.2;
    if (near) near.visible = !s.cut;
    // waves: two crossing sines travelling downstream (flat-shaded, so the facets glint)
    for (const m of parts) {
      if (!m.visible) continue;
      const p = m.geometry.attributes.position, b = m.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], z = b[i * 3 + 2];
        const along = x * fx + z * fz, across = -x * fz + z * fx;
        p.setY(i, Y + amp * (Math.sin(along * 0.55 - t * sp * 0.55 * 1.6) * 0.6 + Math.sin(along * 0.23 + across * 0.9 - t * 1.3) * 0.4));
      }
      p.needsUpdate = true; // flat shading takes its normals from the faces: no recompute
    }
    // foam dashes
    const fk = s.foam ?? 1;
    for (let i = 0; i < FN; i++) {
      const r = FR[i];
      if (r[3] > fk) { foam.setMatrixAt(i, hid); continue; }
      const u = ((r[0] + (t * sp * (0.8 + 0.4 * r[2])) / L) % 1 + 1) % 1;
      const across = lerp(x0 + 1.2, x1 - 1.2, r[1]);
      let x, z;
      if (fz !== 0) { z = fz > 0 ? lerp(z0, z1, u) : lerp(z1, z0, u); x = across; }
      else { x = fx > 0 ? lerp(x0, x1, u) : lerp(x1, x0, u); z = lerp(z0 + 1.2, z1 - 1.2, r[1]); }
      if (s.cut && sec && z > sec.z) { foam.setMatrixAt(i, hid); continue; }
      const fade = Math.sin(Math.PI * ((u * 7 + r[2]) % 1));
      pv.set(x, Y + amp + 0.06, z);
      sv.set(0.18 * fade, 1, (1.6 + r[2] * 1.8) * fade);
      m4.compose(pv, q, sv);
      foam.setMatrixAt(i, m4);
    }
    foam.instanceMatrix.needsUpdate = true;
    // ripple rings: two per source, expanding over 1.4 s and fading, staggered
    let k = 0;
    for (const R of s.rings || []) {
      for (let j = 0; j < 2 && k < rings.length; j++, k++) {
        const m = rings[k];
        const ph = (((t / 1.4 + j * 0.5 + (R.ph ?? 0)) % 1) + 1) % 1;
        const rr = (R.r ?? 1) * (1 + ph * 1.6);
        m.visible = (R.k ?? 1) > 0.01;
        m.position.set(R.at[0] + fx * ph * 1.2, Y + amp + 0.05, R.at[1] + fz * ph * 1.2);
        m.scale.set(rr, 1, rr * 0.92);
        m.material.opacity = 0.6 * (1 - ph) * (R.k ?? 1);
      }
    }
    for (; k < rings.length; k++) rings[k].visible = false;
    const sp2 = s.splashes || [];
    splashes.forEach((sp1, i) => { const S = sp2[i]; if (S) sp1.update(t, S.t0, [S.at[0], Y + amp, S.at[S.at.length - 1]], S.size ?? 3); else sp1.group.visible = false; });
  }
  return { group: g, level: Y, update, face };
}

// the splash: a ring of foam, puffs and thrown droplets (ap, unchanged)
export function buildSplash(parent, seed = 81) {
  const g = grp();
  parent.add(g);
  const foamM = smoothMat(0xffffff, { roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0.2, transparent: true, depthWrite: false });
  const ring = mesh(new THREE.TorusGeometry(1, 0.28, 10, 28), foamM, false);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const puffs = [];
  const r = mulberry32(seed - 4);
  for (let i = 0; i < 12; i++) {
    const p = mesh(new THREE.SphereGeometry(0.6, 12, 8), foamM, false);
    const a = (i / 12) * TAU;
    p.userData = { a, rr: 0.8 + r() * 0.4, h: 0.4 + r() * 0.6 };
    g.add(p);
    puffs.push(p);
  }
  const drops = new Particles(g, { count: 26, geo: new THREE.SphereGeometry(0.16, 6, 5), material: smoothMat(0xe8fbff, { emissive: 0x9fe8ff, emissiveIntensity: 0.4 }), seed, life: 0.9 });
  g.visible = false;
  // t0: impact time; at: [x, y, z] on the water; size: radius scale
  function update(t, t0, at, size = 3) {
    const age = t - t0;
    g.visible = age >= 0 && age < 2.4;
    if (!g.visible) return;
    g.position.set(at[0], at[1] + 0.05, at[2]);
    const k = 1 - Math.exp(-age * 4);
    ring.scale.set(size * (0.4 + 0.9 * k), size * (0.4 + 0.9 * k), size * 0.35);
    foamM.opacity = 0.8 * clamp(1.15 - age * 0.55);
    puffs.forEach((p) => {
      const u = p.userData;
      p.position.set(Math.cos(u.a) * size * u.rr * (0.4 + 0.8 * k), u.h * size * 0.45 * Math.max(0, 1 - age * 0.8), Math.sin(u.a) * size * u.rr * (0.4 + 0.8 * k));
      p.scale.setScalar(size * 0.3 * (1 - 0.4 * k));
    });
    drops.update(t, t0, t0 + 0.25, (m, kk, rr) => {
      const a = rr[0] * TAU, v = (3 + rr[1] * 4) * size * 0.4;
      const tt = kk * 0.9;
      m.position.set(Math.cos(a) * v * tt * 0.6, v * tt * 1.4 - 9.8 * tt * tt * size * 0.4, Math.sin(a) * v * tt * 0.6);
      m.scale.setScalar(size * 0.35);
    });
  }
  return { group: g, update };
}

// ===================================================================================================
// Sky (sk buildSky + en sun): clouds round the scene, a sun glow, the moon and its halo. Reads F.env:
// the sun shows by day, the moon at night (sky > 1.2), clouds drift and darken in a storm.
//   o = { n: 42, r: [260, 1060], h: [225, 335], scale: 1, center: [x, z], sunAt, moonAt, seed }
export function cloud(seed, s = 1, m = null) {
  const g = grp();
  const r = mulberry32(seed);
  const mm = m || M(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.28 });
  for (let i = 0; i < 7; i++) {
    const geo = facet(new THREE.IcosahedronGeometry((3 + r() * 2.6) * s, 0), 0.3 * s, seed * 13 + i);
    const b = new THREE.Mesh(geo, mm);
    b.position.set((r() - 0.5) * 13 * s, (r() - 0.3) * 2.4 * s, (r() - 0.5) * 4.5 * s);
    g.add(b);
  }
  return g;
}
export function buildSky(scene, o = {}) {
  const g = grp();
  scene.add(g);
  const r = mulberry32(o.seed ?? 31);
  const cm = M(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.28 });
  const clouds = [];
  const [r0, r1] = o.r || [260, 1060], [h0, h1] = o.h || [225, 335], sc = o.scale ?? 1;
  const [cx, cz] = o.center || [0, 0];
  for (let i = 0; i < (o.n ?? 42); i++) {
    const c = cloud(100 + i, (1 + r() * 0.9) * sc, cm);
    const a = r() * TAU, d = r0 + r() * (r1 - r0);
    c.position.set(cx + Math.sin(a) * d, h0 + r() * (h1 - h0), cz + Math.cos(a) * d - 120 * sc);
    c.userData.home = c.position.clone();
    g.add(c);
    clouds.push(c);
  }
  const sun = glow(0xfff6d8, 120 * sc, true);
  sun.position.set(...(o.sunAt || [cx - 700, 520, cz - 1500]));
  const moon = sph(18 * sc, basic(0xf4f1e6), 20, false);
  moon.position.set(...(o.moonAt || [cx - 600, 520, cz - 1500]));
  const moonHalo = glow(0xdfe6ff, 70 * sc, true);
  moonHalo.position.copy(moon.position);
  for (const o3 of [sun, moon, moonHalo]) o3.material.fog = false;
  g.add(sun, moon, moonHalo);
  const white = new THREE.Color(0xffffff), grey = new THREE.Color(0x7d8492);
  function update(t, F = {}) {
    const E = F.env || {};
    const k = typeof E.sky === "number" ? E.sky : E.sky === "night" ? 2 : E.sky === "dusk" ? 1 : 0;
    const storm = E.storm ?? 0;
    moon.visible = moonHalo.visible = k > 1.2;
    sun.visible = k < 1.2 && storm < 0.5 && o.sun !== false;
    const drift = o.drift ?? 1.2;
    for (const c of clouds) c.position.set(c.userData.home.x + drift * t, c.userData.home.y - storm * 40 * sc, c.userData.home.z);
    cm.color.copy(white).lerp(grey, storm * 0.85);
    cm.emissiveIntensity = 0.28 * (1 - 0.8 * storm);
  }
  return { group: g, clouds, sun, moon, moonHalo, update };
}

// ===================================================================================================
// Trees (sk treeGeos, merged by material; en tree() for a single one) and a tree that can be felled
export function treeGeos(rng, x, z, s, out, y = 0) {
  out.trunks.push(prep(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 2.0 * s, 6).translate(x, y + 1.0 * s, z), 0x7a5233));
  const r = 1.6 * s * (0.8 + rng() * 0.4);
  const crown = facet(new THREE.IcosahedronGeometry(r, 0), 0.12 * r, Math.floor(rng() * 9999));
  out.crowns.push(prep(crown.translate(x, y + 2.9 * s, z), S(rng() < 0.5 ? 0x3f9e44 : 0x52b34a)));
}
// many trees in two draw calls. at: [[x, z, s], ...]; ground: (x, z) => y
export function buildTrees(scene, { at = [], ground = null, seed = 7 } = {}) {
  const out = { trunks: [], crowns: [] };
  const rng = mulberry32(seed);
  for (const [x, z, s = 1] of at) treeGeos(rng, x, z, s, out, ground ? ground(x, z) : 0);
  const g = grp();
  if (out.trunks.length) g.add(mesh(mergeGeometries(out.trunks), vcol()));
  if (out.crowns.length) g.add(mesh(mergeGeometries(out.crowns), vcol({ roughness: 1 })));
  scene.add(g);
  return { group: g };
}
// seeded positions inside an area, skipping where avoid(x, z) is true
export function scatter(seed, n, [x0, x1, z0, z1], avoid = null, [s0, s1] = [0.9, 1.5]) {
  const r = mulberry32(seed), out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const x = lerp(x0, x1, r()), z = lerp(z0, z1, r()), s = lerp(s0, s1, r());
    if (avoid && avoid(x, z)) continue;
    out.push([x, z, s]);
  }
  return out;
}
export function tree(seed = 1, s = 1) {
  const rng = mulberry32(seed);
  const g = grp();
  const trunk = cyl(0.22 * s, 0.3 * s, 2.2 * s, mat(0x7a5233), 6);
  trunk.position.y = 1.1 * s;
  g.add(trunk);
  const crown = ico(1.5 * s * (0.8 + rng() * 0.4), 0, mat(rng() < 0.5 ? 0x3f9e44 : 0x52b34a), Math.floor(rng() * 999), 0.12);
  crown.position.y = 3.0 * s;
  g.add(crown);
  return g;
}
// a tree that can be felled: update(t, { pos, yaw (the direction it falls, 0 = toward +z), chop (0..1, the
// notch), fall (0..1, from fallK), stump }). It pivots on its base, the crown hits the ground at fall = 1.
// For a log beam across a river, the reel builds its own; this is the felling.
export function fellTree(scene, { seed = 3, s = 1.3, h = 6 } = {}) {
  const root = grp();
  scene.add(root);
  const bark = mat(0x7a5233), wood = mat(0xd9b27a);
  const stump = cyl(0.36 * s, 0.42 * s, 0.6 * s, bark, 8);
  stump.position.y = 0.3 * s;
  const ring = mesh(new THREE.CircleGeometry(0.34 * s, 8).rotateX(-Math.PI / 2), wood, false);
  ring.position.y = 0.605 * s;
  const hinge = grp(0, 0.6 * s, 0);
  const trunk = cyl(0.3 * s, 0.36 * s, h * s, bark, 8);
  trunk.position.y = (h * s) / 2;
  const rng = mulberry32(seed);
  const crown = grp(0, h * s, 0);
  for (let i = 0; i < 4; i++) {
    const c = ico((1.3 + rng() * 0.6) * s, 0, mat(i % 2 ? 0x3f9e44 : 0x52b34a), seed * 7 + i, 0.12);
    c.position.set((rng() - 0.5) * 1.6 * s, (rng() * 1.6) * s, (rng() - 0.5) * 1.6 * s);
    crown.add(c);
  }
  const notch = mesh(new THREE.ConeGeometry(0.22 * s, 0.4 * s, 3).rotateZ(Math.PI / 2), wood, false);
  notch.position.set(0, 0.25 * s, 0.3 * s);
  hinge.add(trunk, crown, notch);
  root.add(stump, ring, hinge);
  function update(t, st) {
    root.visible = !!st;
    if (!st) return;
    root.position.set(...(st.pos || [0, 0, 0]));
    root.rotation.y = st.yaw ?? 0;
    notch.visible = (st.chop ?? 0) > 0.02;
    notch.scale.setScalar(Math.max(0.01, st.chop ?? 0));
    hinge.rotation.x = (Math.PI / 2) * (st.fall ?? 0) * 0.97;
    hinge.visible = st.stump !== true;
  }
  return { root, hinge, update };
}
// the fall of a felled tree as 0..1: slow start, gravity, a landing at d with two small bounces
export function fallK(t, t0, d = 0.9) {
  const u = (t - t0) / d;
  if (u <= 0) return 0;
  if (u < 1) return u * u;
  const a = u - 1;
  return 1 - 0.05 * Math.abs(Math.sin(a * 9)) * Math.exp(-a * 5);
}

// ===================================================================================================
// Road (en buildRoad): asphalt, white edge lines, the yellow dashed centre line, kerbs. along "x" (at z)
// or "z" (at x), from..to, width w, at height y.
export function buildRoad(scene, { along = "x", at = 0, from = -700, to = 700, w = 13, y = 0, kerbs = true } = {}) {
  const g = grp();
  scene.add(g);
  const len = to - from, mid = (from + to) / 2;
  const asphalt = smoothMat(0x3b3f47, { roughness: 0.95 });
  const road = mesh(new THREE.PlaneGeometry(len, w).rotateX(-Math.PI / 2), asphalt, false);
  road.receiveShadow = true;
  road.position.set(mid, y + 0.02, 0);
  g.add(road);
  const white = basic(0xf2f2f2);
  for (const s of [-1, 1]) {
    const l = mesh(new THREE.PlaneGeometry(len, 0.22).rotateX(-Math.PI / 2), white, false);
    l.position.set(mid, y + 0.03, s * (w / 2 - 0.9));
    l.receiveShadow = true;
    g.add(l);
  }
  const n = Math.floor(len / 5);
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.3), basic(0xf2c230), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.makeRotationX(-Math.PI / 2);
    m4.setPosition(from + 2.5 + i * 5, y + 0.035, 0);
    dashes.setMatrixAt(i, m4);
  }
  dashes.receiveShadow = true;
  g.add(dashes);
  if (kerbs) for (const s of [-1, 1]) {
    const kerb = bx(len, 0.25, 2.2, mat(0xcfd2d6), false);
    kerb.position.set(mid, y + 0.12, s * (w / 2 + 1.1));
    kerb.receiveShadow = true;
    g.add(kerb);
  }
  if (along === "z") { g.rotation.y = -Math.PI / 2; g.position.set(at, 0, 0); }
  else g.position.set(0, 0, at);
  return { group: g };
}

// a low-poly house (en): body, a pyramid roof, a door, two windows
export function house(seed = 1, color = 0xf3e3c3) {
  const rng = mulberry32(seed);
  const g = grp();
  const w = 6 + rng() * 3, d = 6 + rng() * 2, h = 4 + rng() * 1.5;
  const body = bx(w, h, d, mat(color));
  body.position.y = h / 2;
  g.add(body);
  const roof = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.6, 4), mat(0xb5523b));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 1.3;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  g.add(roof);
  const door = bx(1.2, 2.2, 0.1, mat(0x6b4426));
  door.position.set(0, 1.1, d / 2 + 0.05);
  g.add(door);
  for (const s of [-1, 1]) {
    const win = bx(1.3, 1.1, 0.1, smoothMat(0xbfe3f5));
    win.position.set(s * w * 0.3, h * 0.6, d / 2 + 0.05);
    g.add(win);
  }
  return g;
}

// a 3D arrow (ap makeCurrents): a shaft and a cone along +y, see-through by default; a flow pipe is
// kit.js tube(points, r, material)
export function arrow3d(len = 6, r = 0.5, color = 0xff9a3c, { opacity = 0.7 } = {}) {
  const a = grp();
  const m = new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, roughness: 0.6, emissive: color, emissiveIntensity: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len * 0.72, 16, 1, opacity < 1), m);
  shaft.position.y = len * 0.36;
  const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.1, len * 0.28, 16), m);
  head.position.y = len * 0.86;
  a.add(shaft, head);
  a.userData.material = m;
  return a;
}

// ===================================================================================================
// Effects. Each builder returns { update(t, state) } (null hides it); buildEffects(scene) makes them all
// and update(t, F.fx) poses each from its key in F.fx.

// dust: soft sprites (never lit solids: those read as rocks) (sk). state: [{ t0, at, r, n, dur, size, rise, h, op, te }]
export function buildDust(scene, { count = 80, color = 0xe9e3d8, seed = 3 } = {}) {
  const dust = [];
  const dr = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const s = glow(color, 1, false);
    s.material.color.setHex(color);
    s.visible = false;
    scene.add(s);
    dust.push({ s, r: [dr(), dr(), dr(), dr(), dr()] });
  }
  return {
    update(t, bursts) {
      let k = 0;
      for (const b of bursts || []) {
        const n = b.n ?? 24;
        for (let i = 0; i < n && k < dust.length; i++, k++) {
          const d = dust[k];
          const age = (b.te ?? t) - b.t0 - d.r[4] * 0.25;
          const dur = b.dur ?? 2.2;
          if (age < 0 || age > dur) { d.s.visible = false; continue; }
          const u = age / dur;
          const a = d.r[0] * TAU, rr = (b.r ?? 6) * (0.3 + 0.7 * Math.sqrt(u)) * (0.5 + d.r[1]);
          d.s.visible = true;
          d.s.position.set(b.at[0] + Math.cos(a) * rr, b.at[1] + (b.rise ?? 3) * u * (0.4 + d.r[2]) + d.r[3] * (b.h ?? 2), b.at[2] + Math.sin(a) * rr * 0.6);
          const size = (b.size ?? 5) * (0.6 + 0.9 * u) * (0.7 + d.r[2] * 0.6);
          d.s.scale.set(size, size, 1);
          d.s.material.opacity = (b.op ?? 0.85) * Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.05)) * (1 - u * 0.4);
        }
      }
      for (; k < dust.length; k++) dust[k].s.visible = false;
    },
  };
}
// debris: small lit chunks thrown along a direction, falling under gravity (sk chunks).
// state: { t0, at, dir: [vx, vy, vz], w, h, floor (y), size }
export function buildDebris(scene, { count = 46, color = 0xb04a32, seed = 57, size = [0.34, 0.12, 0.2] } = {}) {
  const chunkM = M(color, { roughness: 0.95 });
  const chunks = [];
  const kr = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const m = mesh(new THREE.BoxGeometry(...size), chunkM);
    m.visible = false;
    scene.add(m);
    chunks.push({ m, r: [kr(), kr(), kr(), kr(), kr()] });
  }
  return {
    update(t, C) {
      chunks.forEach((c) => {
        if (!C || t < C.t0) { c.m.visible = false; return; }
        const a = t - C.t0 - c.r[4] * 0.08;
        if (a < 0 || a > (C.life ?? 1.8)) { c.m.visible = false; return; }
        const [vx, vy, vz] = C.dir;
        const px = C.at[0] + (c.r[0] - 0.5) * (C.w ?? 4) + (vx + (c.r[1] - 0.5) * 3) * a;
        const pz = C.at[2] + (vz * (0.6 + c.r[2] * 0.8)) * a;
        const py = Math.max(C.floor ?? 0.36, C.at[1] + (c.r[3] - 0.5) * (C.h ?? 2.4) + (vy + c.r[2] * 2) * a - 4.9 * a * a);
        c.m.visible = true;
        c.m.position.set(px, py, pz);
        c.m.scale.setScalar(C.size ?? 1);
        c.m.rotation.set(a * 8 * c.r[0], a * 6 * c.r[1], a * 7 * c.r[2]);
      });
    },
  };
}
// wind: thin white bars flowing along +x (or dir), denser and faster with height (sk).
// state: { t0, t1, box: [x0, x1, y0, y1, z0, z1], k, len, thick }
export function buildWind(scene, { count = 130, seed = 9 } = {}) {
  const windM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const wind = new Particles(scene, { count, geo: new THREE.BoxGeometry(1, 0.12, 0.12), material: windM, seed, life: 1.6 });
  return {
    update(t, Wd) {
      if (!Wd) return wind.hide();
      windM.opacity = Wd.op ?? 0.7;   // op: the streaks' opacity (0.7; a wide storm frame reads better near 0.3)
      const [x0, x1, y0, y1, z0, z1] = Wd.box;
      wind.update(t, Wd.t0, Wd.t1, (m, u, r) => {
        const y = y0 + (y1 - y0) * Math.sqrt(r[0]);
        const hk = (y - y0) / Math.max(1, y1 - y0);
        const sp = 0.6 + 0.8 * hk;
        const x = x0 + (x1 - x0) * ((u * sp + r[1]) % 1);
        m.position.set(x, y, z0 + (z1 - z0) * r[2]);
        const len = (Wd.len ?? 8) * (0.5 + hk) * (0.6 + r[3] * 0.6);
        const th = (Wd.thick ?? 0.12) / 0.12;
        m.scale.set(len, th, th);
        m.visible = r[4] < 0.35 + 0.65 * hk * (Wd.k ?? 1);
      });
    },
  };
}
// streaks: thin streaks flying along a direction (ap makeStreaks).
// state: { t0, t1, at, dir, spread: [sx, sy, sz], travel, life, len }
export function buildStreaks(scene, { count = 40, len = 2.4, width = 0.05, color = 0xffffff, seed = 7, opacity = 0.85, order = 0 } = {}) {
  const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false });
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mt, count);
  inst.frustumCulled = false;
  inst.visible = false;
  inst.renderOrder = order;   // order: draw after other see-through things (a section's water face is drawn at 2)
  scene.add(inst);
  const r = mulberry32(seed);
  const R = Array.from({ length: count }, () => [r(), r(), r(), r()]);
  const dir = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  return {
    update(t, st) {
      inst.visible = !!st && t >= st.t0 && t < st.t1 + (st.life ?? 0.6);
      if (!inst.visible) return;
      dir.set(...st.dir).normalize();
      _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      const life = st.life ?? 0.6, travel = st.travel ?? 20, sp = st.spread ?? [2, 2, 2];
      for (let i = 0; i < count; i++) {
        const [a, b, c, d] = R[i];
        const age = ((t - st.t0) / life + d) % 1;
        const born = t - age * life;
        const alive = born >= st.t0 - life * d && born <= st.t1 && t - st.t0 > 0;
        const k = alive ? Math.sin(Math.PI * age) : 0;
        _p.set(st.at[0] + (a - 0.5) * sp[0], st.at[1] + (b - 0.5) * sp[1], st.at[2] + (c - 0.5) * sp[2]).addScaledVector(dir, (age - 0.75) * travel);
        _s.set((st.len ?? len) * (0.6 + 0.8 * d) * k, width * k, width * k);
        _m.compose(_p, _q, _s);
        inst.setMatrixAt(i, _m);
      }
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}
// rain: thin streaks falling through a box round a point (rf, instanced).
// state: { k (share shown), c: [x, y, z] (box centre), w (half size), h, v (fall speed), len, wind: [dx, dz], alpha, thick, cam, near }
export function buildRain(scene, { count = 900, seed = 77 } = {}) {
  const N = count;
  const m = new THREE.MeshBasicMaterial({ color: 0xe8f2ff, transparent: true, opacity: 0.55, depthWrite: false });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 1.0, 0.022), m, N);
  im.frustumCulled = false;
  im.castShadow = false;
  im.receiveShadow = false;
  scene.add(im);
  const r = mulberry32(seed);
  const P = [];
  for (let i = 0; i < N; i++) P.push([r(), r(), r(), 0.8 + r() * 0.5]);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), E = new THREE.Euler();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  im.visible = false;
  return {
    update(t, cfg) {
      const n = cfg ? Math.floor(N * Math.min(1, cfg.k ?? 1)) : 0;
      const cp = cfg?.cam, near2 = (cfg?.near ?? 0) ** 2;
      im.visible = n > 0;
      if (!n) return;
      const [cx, cy, cz] = cfg.c, w = cfg.w ?? 26, h = cfg.h ?? 34, v = cfg.v ?? 30, len = cfg.len ?? 1.1;
      const [wx, wz] = cfg.wind || [0, 0];
      E.set(Math.atan(wz), 0, -Math.atan(wx));
      Q.setFromEuler(E);
      for (let i = 0; i < N; i++) {
        if (i >= n) { im.setMatrixAt(i, hidden); continue; }
        const p = P[i];
        const fall = ((t * v * p[3] + p[1] * h) % h);
        const y = cy + h / 2 - fall;
        V.set(cx + (p[0] - 0.5) * 2 * w + wx * fall, y, cz + (p[2] - 0.5) * 2 * w + wz * fall);
        if (y < (cfg.floor ?? 0.1)) { im.setMatrixAt(i, hidden); continue; }
        if (cp && (V.x - cp[0]) ** 2 + (V.y - cp[1]) ** 2 + (V.z - cp[2]) ** 2 < near2) { im.setMatrixAt(i, hidden); continue; }
        const th = (cfg.thick ?? 0.022) / 0.022;
        S.set(th, len * p[3], th);
        M4.compose(V, Q, S);
        im.setMatrixAt(i, M4);
      }
      im.instanceMatrix.needsUpdate = true;
      m.opacity = cfg.alpha ?? 0.5;
    },
  };
}
// lightning (new): a jagged bolt from the sky to a point, flickering twice, with a glow and a light at
// the strike. state: { times: [t, ...] (strike times), at: [x, y, z], h (height, 60), w (width scale) }.
// The sky flash for the lights is flashAt(t, times): put it in F.env.flash.
export function flashAt(t, times = []) {
  let f = 0;
  for (const s of times) {
    const a = t - s;
    if (a < 0 || a > 0.6) continue;
    f = Math.max(f, Math.exp(-a / 0.07) + (a > 0.09 ? 0.7 * Math.exp(-(a - 0.09) / 0.09) : 0));
  }
  return clamp(f);
}
export function buildLightning(scene, { variants = 3, seed = 41 } = {}) {
  const g = grp();
  scene.add(g);
  const boltM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeef4ff).multiplyScalar(LOOK.post && LOOK.bloom ? 3 : 1), fog: false });
  const bolts = [];
  for (let v = 0; v < variants; v++) {
    const r = mulberry32(seed + v * 17);
    const bg = grp();
    // a unit bolt from y = 1 down to 0: a zigzag with one fork
    let x = 0, y = 1;
    const pts = [[0, 1]];
    while (y > 0) { y = Math.max(0, y - 0.07 - r() * 0.06); x += (r() - 0.5) * 0.16; pts.push([x, y]); }
    const seg = (a, b, w) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, L, w), boltM);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
      m.rotation.z = Math.atan2(-dx, dy);
      bg.add(m);
    };
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], 0.014);
    const fk = Math.floor(pts.length * 0.35);
    let fxp = pts[fk][0], fyp = pts[fk][1];
    for (let i = 0; i < 5; i++) { const nx = fxp + 0.05 + r() * 0.06, ny = fyp - 0.05 - r() * 0.05; seg([fxp, fyp], [nx, ny], 0.009); fxp = nx; fyp = ny; }
    bg.visible = false;
    g.add(bg);
    bolts.push(bg);
  }
  const hot = glow(0xcfe0ff, 6, true);
  hot.visible = false;
  g.add(hot);
  const light = new THREE.PointLight(0xdfe8ff, 0, 160, 1.2);
  g.add(light);
  return {
    update(t, st) {
      bolts.forEach((b) => (b.visible = false));
      hot.visible = false;
      light.intensity = 0;
      if (!st) return;
      st.times.forEach((s, i) => {
        const a = t - s;
        // on 0..0.05, off, on again 0.08..0.16
        if (!((a >= 0 && a < 0.05) || (a >= 0.08 && a < 0.16))) return;
        const b = bolts[i % bolts.length];
        b.visible = true;
        const h = st.h ?? 60;
        b.position.set(...st.at);
        b.scale.set(h * (st.w ?? 1), h, h * (st.w ?? 1));
        hot.visible = true;
        hot.position.set(st.at[0], st.at[1] + 0.5, st.at[2]);
        hot.scale.setScalar(h * 0.25);
        light.position.set(st.at[0], st.at[1] + h * 0.3, st.at[2]);
        light.intensity = 900 * (LOOK.post ? LOOK.lightScale : 1);
      });
    },
  };
}
// drips: drops falling from a point (sk). state: { t0, t1, at, h }
export function buildDrips(scene, { seed = 21, color = 0x5aa2d8 } = {}) {
  const dropM = M(color, { roughness: 0.1, emissive: 0x1d4a6c, emissiveIntensity: 0.4 });
  const drips = new Particles(scene, { count: 16, geo: new THREE.SphereGeometry(0.06, 8, 6), material: dropM, seed, life: 0.5 });
  return {
    update(t, Dp) {
      if (!Dp) return drips.hide();
      drips.update(t, Dp.t0, Dp.t1, (m, u, r) => { m.position.set(Dp.at[0] + (r[0] - 0.5) * 0.25, Dp.at[1] - Dp.h * u * u, Dp.at[2] + (r[1] - 0.5) * 0.25); m.scale.setScalar(Dp.size ?? 1); });
    },
  };
}
// flow dots: glowing dots running along polylines (sk load dots: weight down the beams and columns; also
// water in pipes, air in ducts). state: { t0, t1, paths: [[[x, y, z], ...], ...], speed, size }
export function buildFlowDots(scene, { count = 64, color = 0xffd23a, size = 0.75 } = {}) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const s = glow(color, size);
    s.visible = false;
    scene.add(s);
    dots.push(s);
  }
  const V = (p) => (p.isVector3 ? p : new THREE.Vector3(...p));
  let cache = null, cacheKey = null;
  return {
    update(t, Ld) {
      if (!Ld) { dots.forEach((d) => (d.visible = false)); return; }
      if (cacheKey !== Ld.paths) { cacheKey = Ld.paths; cache = Ld.paths.map((p) => p.map(V)); }
      const paths = cache;
      dots.forEach((d, i) => {
        const path = paths[i % paths.length];
        const lens = [];
        let tot = 0;
        for (let k = 0; k < path.length - 1; k++) { const l = path[k].distanceTo(path[k + 1]); lens.push(l); tot += l; }
        const per = Math.max(1, Math.floor(count / paths.length));
        const slot = Math.floor(i / paths.length);
        const ph = ((t - Ld.t0) * (Ld.speed ?? 5) / tot + slot / per) % 1;
        if (t < Ld.t0 || t > Ld.t1 || slot >= per) { d.visible = false; return; }
        let s = ph * tot, k = 0;
        while (k < lens.length - 1 && s > lens[k]) { s -= lens[k]; k++; }
        d.visible = true;
        d.position.copy(path[k]).lerp(path[k + 1], Math.min(1, s / lens[k]));
        d.scale.setScalar((Ld.size ?? size) * (ph > 0.9 ? (1 - ph) * 10 : ph < 0.05 ? ph * 20 : 1));
      });
    },
  };
}
// confetti (sk). state: { t0, at, spread (1), size (1) }
export function buildConfetti(scene, { count = 140, seed = 44 } = {}) {
  const confM = [0xe53935, 0x2f8fe0, 0xf2b321, 0x2fae63, 0x8a4fd6, 0xffffff].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const conf = [];
  const cr = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), confM[i % confM.length]);
    m.visible = false;
    scene.add(m);
    conf.push({ m, r: [cr(), cr(), cr(), cr(), cr()] });
  }
  return {
    update(t, Cf) {
      conf.forEach((c) => {
        if (!Cf || t < Cf.t0) { c.m.visible = false; return; }
        const a = t - Cf.t0 - c.r[4] * 0.15;
        if (a < 0 || a > 4) { c.m.visible = false; return; }
        const k = Cf.spread ?? 1;
        c.m.visible = true;
        const ang = c.r[0] * TAU, sp = (2 + c.r[1] * 3) * k;
        const up = (5 + c.r[2] * 4) * k;
        const y = Cf.at[1] + up * Math.min(a, 0.7) - 2.4 * k * Math.max(0, a - 0.7) * 0.9 - 4.9 * k * Math.min(a, 0.7) ** 2 * 0.6;
        c.m.position.set(Cf.at[0] + Math.cos(ang) * sp * Math.min(a, 1.2) + 0.2 * k * Math.sin(a * 5 + c.r[3] * 9), y, Cf.at[2] + Math.sin(ang) * sp * Math.min(a, 1.2));
        c.m.scale.setScalar(Cf.size ?? 1);
        c.m.rotation.set(a * 7 * c.r[1], a * 5 * c.r[2], a * 9 * c.r[3]);
      });
    },
  };
}
// hearts (new): extruded hearts that pop in, rise and sway, and fade. state: { t0, at, n (12), spread
// (1.2), rise (2.4), size (0.5), yaw (face the camera: its azimuth in radians), life (2.2) }
export function heartShape(s = 1) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.9 * s);
  h.bezierCurveTo(-0.15 * s, -0.7 * s, -1.0 * s, -0.25 * s, -1.0 * s, 0.25 * s);
  h.bezierCurveTo(-1.0 * s, 0.75 * s, -0.4 * s, 0.95 * s, 0, 0.5 * s);
  h.bezierCurveTo(0.4 * s, 0.95 * s, 1.0 * s, 0.75 * s, 1.0 * s, 0.25 * s);
  h.bezierCurveTo(1.0 * s, -0.25 * s, 0.15 * s, -0.7 * s, 0, -0.9 * s);
  return h;
}
export function buildHearts(scene, { count = 18, seed = 23 } = {}) {
  const geo = new THREE.ExtrudeGeometry(heartShape(0.5), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -0.11);
  const mats = [0xe53935, 0xff5c8a, 0xf2385a].map((c) => smoothMat(c, { roughness: 0.35, emissive: new THREE.Color(c).multiplyScalar(0.35) }));
  const hearts = [];
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const m = mesh(geo, mats[i % mats.length]);
    m.visible = false;
    scene.add(m);
    hearts.push({ m, r: [r(), r(), r(), r(), r()] });
  }
  return {
    update(t, Hs) {
      hearts.forEach((h, i) => {
        if (!Hs || i >= (Hs.n ?? 12)) { h.m.visible = false; return; }
        const life = Hs.life ?? 2.2;
        const a = t - Hs.t0 - i * (Hs.stagger ?? 0.09) - h.r[4] * 0.06;
        if (a < 0 || a > life) { h.m.visible = false; return; }
        h.m.visible = true;
        const sp = Hs.spread ?? 1.2, ang = h.r[0] * TAU;
        const rise = (Hs.rise ?? 2.4) * (0.7 + 0.6 * h.r[1]);
        const u = a / life;
        const yaw = Hs.yaw ?? 0;
        // out from the centre, up, swaying
        const ox = Math.cos(ang) * sp * Math.sqrt(Math.min(1, a / 0.6)) * (0.4 + 0.6 * h.r[2]) + 0.18 * Math.sin(a * 4 + h.r[3] * 6);
        const oz = Math.sin(ang) * sp * 0.5 * Math.sqrt(Math.min(1, a / 0.6));
        h.m.position.set(Hs.at[0] + ox * Math.cos(yaw) + oz * Math.sin(yaw), Hs.at[1] + rise * easeOut(u * 1.1), Hs.at[2] - ox * Math.sin(yaw) + oz * Math.cos(yaw));
        // a springy pop in, a shrink at the end
        const pin = a < 0.35 ? 1 - Math.exp(-a * 14) * Math.cos(a * 22) : 1;
        const s = (Hs.size ?? 0.5) * 2 * pin * (u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1) * (0.75 + 0.5 * h.r[2]);
        h.m.scale.setScalar(Math.max(0.001, s));
        h.m.rotation.set(0, yaw + 0.35 * Math.sin(a * 3 + h.r[3] * 5), 0.25 * Math.sin(a * 2.4 + h.r[1] * 4));
      });
    },
  };
}
// sparks: small hot dots thrown from a point (ap). state: { t0, t1, at, dir: [dx, dy, dz] }
export function buildSparks(scene, { seed = 72, color = 0xffd27a } = {}) {
  const sparks = new Particles(scene, { count: 40, geo: new THREE.SphereGeometry(0.12, 5, 4), material: basic(color), seed, life: 0.4 });
  return {
    update(t, s) {
      if (!s) return sparks.hide();
      sparks.update(t, s.t0, s.t1, (m, k, r) => {
        const d = s.dir || [0, 0, 0], sc = s.size ?? 1;
        m.position.set(s.at[0] + ((r[0] - 0.5) * 6 + d[0] * k * 6) * sc, s.at[1] + (k * 2.5 * r[1] - k * k * 3) * sc, s.at[2] + ((r[2] - 0.5) * 3 + d[2] * k * 6) * sc);
        m.scale.setScalar(sc);
      });
    },
  };
}
// sunbeams through a window: additive shafts and the light patches they land on (sk).
// state: { k, at, step: [dx, 0, dz], ry, tilt }
export function buildSunbeams(scene) {
  const beamTex = canvasTex(64, 256, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
  });
  const beams = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 6), new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffe9b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    scene.add(m);
    beams.push(m);
  }
  const patchM = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const patchGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pp = patchGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setX(i, pp.getX(i) + pp.getZ(i) * 0.9);
  const patches = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(patchGeo, patchM);
    m.visible = false;
    scene.add(m);
    patches.push(m);
  }
  return {
    update(t, Sb) {
      patches.forEach((m, i) => {
        m.visible = !!Sb && Sb.k > 0.01;
        if (!m.visible) return;
        m.position.set(Sb.at[0] + 2.4, Sb.at[1] - 1.55, Sb.at[2] + (i - 2) * 1.4);
        m.scale.set(2.6, 1, 0.62);
      });
      patchM.opacity = Sb ? Sb.k * 0.32 : 0;
      beams.forEach((b, i) => {
        b.visible = !!Sb && Sb.k > 0.01;
        if (!b.visible) return;
        const st = Sb.step || [1.6, 0, 0];
        b.position.set(Sb.at[0] + (i - 2) * st[0], Sb.at[1], Sb.at[2] + (i - 2) * st[2]);
        b.rotation.set(0, Sb.ry ?? 0, Sb.tilt ?? 0.55);
        b.scale.set(0.85, 0.75, 1);
        b.material.opacity = Sb.k * (0.34 + 0.1 * Math.sin(i * 2.1 + t * 0.7));
      });
    },
  };
}
// fire: flames and black smoke rising from a point, with a flickering light (ap makeFire).
// state: { t0, at, size, k }
export function buildFire(scene) {
  const g = grp();
  scene.add(g);
  const flames = [], smoke = [];
  for (let i = 0; i < 16; i++) { const f = glow(i % 3 ? 0xff7a1a : 0xffc04a, 2.4); g.add(f); flames.push(f); }
  for (let i = 0; i < 14; i++) { const s = glow(0x2a2a2e, 4, false); s.material.color.setHex(0x2b2c30); g.add(s); smoke.push(s); }
  const light = new THREE.PointLight(0xff8a30, 0, 40, 1.4);
  g.add(light);
  g.visible = false;
  return {
    group: g,
    update(t, st) {
      g.visible = !!st && t >= st.t0;
      if (!g.visible) return;
      const age = t - st.t0, S = st.size ?? 1, K = (st.k ?? 1) * clamp(age / 0.25);
      g.position.set(...st.at);
      flames.forEach((f, i) => {
        const ph = (t * 1.6 + i * 0.137) % 1;
        const a = i * 2.39;
        f.position.set(Math.cos(a) * S * 2.2 * (0.4 + ph * 0.4), ph * S * 4, Math.sin(a) * S * 1.4);
        f.scale.setScalar(S * (2.6 - ph * 1.6) * K);
        f.material.opacity = (1 - ph) * K;
      });
      smoke.forEach((s, i) => {
        const ph = (t * 0.55 + i * 0.071) % 1;
        const a = i * 1.7;
        s.position.set(Math.cos(a) * S * 1.5 - ph * S * 4, S * 2 + ph * S * 10, Math.sin(a) * S * 1.2);
        s.scale.setScalar(S * (2.5 + ph * 6) * K);
        s.material.opacity = 0.75 * Math.sin(Math.PI * ph) * K;
      });
      light.intensity = 60 * K * (0.85 + 0.15 * Math.sin(t * 27));
    },
  };
}

// all of the above in one: update(t, F.fx) poses each effect from its key. opts picks which to build
// (default all) and passes options: buildEffects(scene, { debris: { color: 0x8b8d91 }, rain: false })
const FX = { dust: buildDust, debris: buildDebris, wind: buildWind, streaks: buildStreaks, rain: buildRain, lightning: buildLightning,
  drips: buildDrips, flowDots: buildFlowDots, confetti: buildConfetti, hearts: buildHearts, sparks: buildSparks, sunbeams: buildSunbeams, fire: buildFire };
export function buildEffects(scene, opts = {}) {
  const fx = {};
  for (const [k, make] of Object.entries(FX)) {
    if (opts[k] === false) continue;
    fx[k] = make(scene, typeof opts[k] === "object" ? opts[k] : undefined);
  }
  // splashes outside a river: a pool of three
  const splash = opts.splash === false ? [] : [0, 1, 2].map((i) => buildSplash(scene, 91 + i));
  return {
    fx,
    update(t, s = {}) {
      for (const [k, e] of Object.entries(fx)) e.update(t, s[k] ?? null);
      splash.forEach((sp, i) => { const S = (s.splash || [])[i]; if (S) sp.update(t, S.t0, S.at, S.size ?? 3); else sp.group.visible = false; });
    },
  };
}
