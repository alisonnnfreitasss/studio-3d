// The modelling kit for higher-quality procedural objects (research prototype). Everything is
// built once at load and is deterministic: no Math.random, no clock.
//
// Techniques: rounded boxes, bevelled extrusions of 2D silhouettes (with real holes), lathe
// profiles with crisp creases, two-circle hulls (teardrops for crank webs and rods), gear rings,
// vertex-colour gradients for soft occlusion, an edge-lit glass material, a blob contact shadow
// and a procedural environment map for metal, glass and gloss paint.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);

// ---------- environment (reflections for metal, glass and gloss paint) ----------
export const ENV = { tex: null };
export function setEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  ENV.tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
}
export function withEnv(m, k = 1) {
  if (ENV.tex) {
    m.envMap = ENV.tex;
    m.envMapIntensity = k;
  }
  return m;
}

// ---------- geometry ----------
// a box with rounded edges and smooth normals; the radius is clamped to fit
export function rbox(w, h, d, r = 0.1, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
}

// smooth inside a crease angle, sharp across it (radians)
export function crease(geo, angle = 0.6) {
  return toCreasedNormals(geo, angle);
}

// a rounded rectangle as a Shape (or a Path when used as a hole)
export function rrect(w, h, r, cx = 0, cy = 0, asPath = false) {
  const s = asPath ? new THREE.Path() : new THREE.Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

// a polygon with rounded corners (radius per corner or one for all)
export function rpoly(pts, radii = 0.1, asPath = false) {
  const s = asPath ? new THREE.Path() : new THREE.Shape();
  const n = pts.length;
  const rad = (i) => (Array.isArray(radii) ? radii[i] : radii);
  const P = pts.map(([x, y]) => V2(x, y));
  for (let i = 0; i < n; i++) {
    const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const r = Math.min(rad(i), da.length() / 2, db.length() / 2);
    const p0 = p.clone().add(da.normalize().multiplyScalar(r));
    const p1 = p.clone().add(db.normalize().multiplyScalar(r));
    if (i === 0) s.moveTo(p0.x, p0.y);
    else s.lineTo(p0.x, p0.y);
    s.quadraticCurveTo(p.x, p.y, p1.x, p1.y);
  }
  s.closePath();
  return s;
}

export function circlePath(r, cx = 0, cy = 0, asPath = true) {
  const s = asPath ? new THREE.Path() : new THREE.Shape();
  s.absarc(cx, cy, r, 0, TAU, false);
  return s;
}

// The convex hull of two circles: a teardrop (crank webs, connecting rods, spanners).
export function hull2(x1, y1, r1, x2, y2, r2, n = 40) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx), al = Math.acos(THREE.MathUtils.clamp((r1 - r2) / d, -1, 1));
  const s = new THREE.Shape();
  // the far side of circle 1, then the far side of circle 2 (counter-clockwise)
  for (let i = 0; i <= n; i++) {
    const a = phi + al + (i / n) * (TAU - 2 * al);
    const x = x1 + Math.cos(a) * r1, y = y1 + Math.sin(a) * r1;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const m = Math.max(6, Math.round(n * al / Math.PI));
  for (let i = 0; i <= m; i++) {
    const a = phi - al + (i / m) * (2 * al);
    s.lineTo(x2 + Math.cos(a) * r2, y2 + Math.sin(a) * r2);
  }
  s.closePath();
  return s;
}

// a toothed ring as a Shape (teeth trapezoids), with an optional centre hole
export function gearShape(teeth, rRoot, rTip, holeR = 0) {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU, da = TAU / teeth;
    const pts = [[0.0, rRoot], [0.22, rRoot], [0.36, rTip], [0.64, rTip], [0.78, rRoot]];
    pts.forEach(([f, r], k) => {
      const a = a0 + f * da;
      if (i === 0 && k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    });
  }
  s.closePath();
  if (holeR > 0) s.holes.push(circlePath(holeR));
  return s;
}

// Extrude a silhouette by `depth` (total thickness, bevel included), centred on z = 0, with a
// rounded bevel that does not grow the silhouette (bevelOffset = -bevel) and creased normals so the
// bevels shade smooth while flat faces stay flat.
export function extrude(shape, depth, { bevel = 0.05, seg = 3, curve = 24, creaseAngle = 0.7 } = {}) {
  bevel = Math.min(bevel, depth / 2 - 1e-3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelOffset: -bevel, bevelSegments: seg, curveSegments: curve,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return crease(g, creaseAngle);
}

// A lathe from (r, y) pairs. Order the points so the solid is on the right of the direction of
// travel (outer walls go up, inner walls go down) and the faces point outwards.
export function lathe(pairs, seg = 48, creaseAngle = 0.55, phiStart = 0) {
  const g = new THREE.LatheGeometry(pairs.map(([r, y]) => V2(Math.max(0, r), y)), seg, phiStart);
  return crease(g, creaseAngle);
}
// a rounded-corner profile for lathe(): corners [r, y, radius] become short arcs
export function roundedProfile(corners, steps = 4) {
  const out = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const [x, y, rr = 0] = corners[i];
    if (!rr || i === 0 || i === n - 1) {
      out.push([x, y]);
      continue;
    }
    const a = V2(...corners[i - 1].slice(0, 2)), p = V2(x, y), b = V2(...corners[i + 1].slice(0, 2));
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const r = Math.min(rr, da.length() / 2, db.length() / 2);
    const p0 = p.clone().add(da.normalize().multiplyScalar(r)), p1 = p.clone().add(db.normalize().multiplyScalar(r));
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      // quadratic Bezier p0 -> p -> p1
      const q = p0.clone().multiplyScalar((1 - u) * (1 - u)).add(p.clone().multiplyScalar(2 * u * (1 - u))).add(p1.clone().multiplyScalar(u * u));
      out.push([q.x, q.y]);
    }
  }
  return out;
}

// Vertex-colour gradient along an axis: brightness c0 at `a`, c1 at `b` (soft occlusion low on a
// body, a lighter top). Use with a material that has vertexColors: true.
export function gradient(geo, axis = "y", a = 0, b = 1, c0 = 0.7, c1 = 1) {
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3);
  const k = { x: 0, y: 1, z: 2 }[axis];
  for (let i = 0; i < n; i++) {
    const v = p.array[i * 3 + k];
    const u = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
    const s = THREE.MathUtils.lerp(c0, c1, u * u * (3 - 2 * u));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

// ---------- materials ----------
// Glass that reads in a cartoon: nearly clear face-on, bright at grazing angles (Fresnel), with two
// view-locked highlight streaks on curved surfaces. `opacity` still scales the whole thing.
export function edgeGlass(color = 0xe8f4ff, opacity = 0.2, { edge = 0.7, pow = 2.2, rim = 0.5, streak = 1, band = 0, side = THREE.DoubleSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0, transparent: true, opacity, depthWrite: false, side });
  withEnv(m, 1.0);
  const f = (x) => x.toFixed(3);
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", `
      {
        vec3 gV = normalize(vViewPosition);
        float gNV = clamp(abs(dot(normal, gV)), 0.0, 1.0);
        float gF = pow(1.0 - gNV, ${f(pow)});
        // a crisp rim band on the outer ~15% of a curved surface (the cartoon glass edge)
        float gE = ${f(band)} * smoothstep(0.42, 0.56, 1.0 - gNV);
        float gx = -normal.x;
        float gS = ${f(streak)} * (smoothstep(0.42, 0.48, gx) * (1.0 - smoothstep(0.58, 0.66, gx))
                 + 0.55 * smoothstep(0.74, 0.77, gx) * (1.0 - smoothstep(0.81, 0.85, gx)));
        outgoingLight = mix(outgoingLight, vec3(1.0), clamp(gF * ${f(rim)} + gE * 0.75 + gS * 0.9, 0.0, 1.0));
        float gA = diffuseColor.a;
        diffuseColor.a = clamp(mix(gA * 0.55, max(gA, ${f(edge)}), gF) + gE * 0.45 + gS * 0.6, 0.0, 1.0);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `edgeGlass:${f(edge)}:${f(pow)}:${f(rim)}:${f(streak)}:${f(band)}`;
  return m;
}

// flat window glass: a pale tint with two diagonal reflection bands baked in a canvas
let _streak = null;
export function streakTex() {
  if (_streak) return _streak;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(190,225,250,0.38)";
  x.fillRect(0, 0, 256, 256);
  x.save();
  x.translate(128, 128);
  x.rotate(-0.62);
  const band = (off, w, a) => {
    const g = x.createLinearGradient(off - w, 0, off + w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(off - w, -260, 2 * w, 520);
  };
  band(-34, 26, 0.75);
  band(18, 9, 0.6);
  x.restore();
  _streak = new THREE.CanvasTexture(c);
  _streak.colorSpace = THREE.SRGBColorSpace;
  _streak.wrapS = _streak.wrapT = THREE.RepeatWrapping;
  return _streak;
}
export function windowGlass(repeat = 1) {
  const t = streakTex().clone();
  t.needsUpdate = true;
  t.repeat.set(repeat, repeat);
  return withEnv(new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.05, metalness: 0.1, transparent: true, depthWrite: false, side: THREE.DoubleSide }), 0.8);
}

// gloss toy paint (clearcoat) and soft plastics
export function paintMat(color, o = {}) {
  return withEnv(new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.14, ...o }), 0.22);
}
export function plastic(color, o = {}) {
  return withEnv(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o }), 0.14);
}
export function steel(color = 0xc4c9d0, o = {}) {
  return withEnv(new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.85, ...o }), 1.0);
}

// a soft dark contact patch under an object (a radial gradient on a plane)
let _blob = null;
export function blobShadow(w, d, opacity = 0.42) {
  if (!_blob) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    _blob = new THREE.CanvasTexture(c);
  }
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: _blob, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.alphaMap = _blob;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

// ---------- a chunky toy wheel (axle along z, outer face towards +z) ----------
export function toyWheel(R = 1.4, W = 1.05, { tyreColor = 0x2b2e34, rimColor = 0xe8ecf1, capColor = 0x2f7de1, spokes = 5 } = {}) {
  const g = new THREE.Group();
  const ri = R * 0.6;
  const c = W * 0.34;
  // tyre: a rounded section with two tread grooves on the crown
  const gy = W * 0.17, gw = 0.045, gd = 0.06;
  const tyreProfile = roundedProfile([
    [ri, -W / 2 + 0.06],
    [ri + 0.02, -W / 2, 0.04],
    [R, -W / 2, c],
    [R, -gy - gw], [R - gd, -gy - gw], [R - gd, -gy + gw], [R, -gy + gw],
    [R, gy - gw], [R - gd, gy - gw], [R - gd, gy + gw], [R, gy + gw],
    [R, W / 2, c],
    [ri + 0.02, W / 2, 0.04],
    [ri, W / 2 - 0.06],
    [ri, -W / 2 + 0.06],
  ], 5);
  const tyre = new THREE.Mesh(lathe(tyreProfile, 56, 0.5).rotateX(Math.PI / 2), withEnv(new THREE.MeshStandardMaterial({ color: tyreColor, roughness: 0.82 }), 0.25));
  g.add(tyre);
  // rim: a dark dish inside, a pale face with round windows, a hub cap and lug nuts
  const dish = new THREE.Mesh(lathe(roundedProfile([[ri + 0.01, -W / 2 + 0.1], [ri + 0.01, W / 2 - 0.12], [ri * 0.55, W / 2 - 0.26, 0.05], [0, W / 2 - 0.26]], 3), 40).rotateX(Math.PI / 2),
    plastic(0x4a4f58, { roughness: 0.45 }));
  g.add(dish);
  const face = new THREE.Shape();
  face.absarc(0, 0, ri * 0.98, 0, TAU, false);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + Math.PI / 2;
    face.holes.push(circlePath(ri * 0.2, Math.cos(a) * ri * 0.58, Math.sin(a) * ri * 0.58));
  }
  const faceM = steel(rimColor, { roughness: 0.3, metalness: 0.45 });
  const faceMesh = new THREE.Mesh(extrude(face, 0.1, { bevel: 0.035, curve: 40 }), faceM);
  faceMesh.position.z = W / 2 - 0.1;
  g.add(faceMesh);
  const cap = new THREE.Mesh(lathe(roundedProfile([[ri * 0.34, 0], [ri * 0.34, 0.06, 0.04], [ri * 0.22, 0.13, 0.05], [0, 0.15]], 4), 32).rotateX(Math.PI / 2),
    paintMat(capColor));
  cap.position.z = W / 2 - 0.06;
  g.add(cap);
  const nutGeo = lathe([[0.0, 0], [0.055, 0], [0.055, 0.05], [0.035, 0.07], [0, 0.07]], 6).rotateX(Math.PI / 2);
  const nutM = steel(0xb9bec6);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + Math.PI / 2 + Math.PI / spokes;
    const nut = new THREE.Mesh(nutGeo, nutM);
    nut.position.set(Math.cos(a) * ri * 0.44, Math.sin(a) * ri * 0.44, W / 2 - 0.06);
    g.add(nut);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// hex bolt head for flanges (axis y)
let _bolt = null;
export function boltGeo() {
  if (!_bolt) _bolt = lathe([[0, 0], [0.07, 0], [0.07, 0.05], [0.05, 0.075], [0, 0.075]], 6);
  return _bolt;
}
