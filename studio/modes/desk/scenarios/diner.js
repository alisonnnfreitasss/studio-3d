// Diner: a booth at night. The lead sits in a red vinyl booth, the agents stand on a cream table
// with a chrome edge, two pendant lamps warm the table, a big window behind shows a night street
// with neon signs, the floor is black and white checks. Built on the desk's
// layout (lead seated at [0, 0, -2.75], a surface 1.7 high), so every desk camera frames it as is.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { M, V, mulberry32 } from "../../../engine/util.js";
import { lambert, mug, pendant, discTexture, skylineTexture } from "../props.js";
import { placeCast, SLOTS, deskWides } from "../room.js";

export const meta = { id: "diner", name: "Diner", seat: "chair" };

const TOP = 1.7; // the table top, where the agents stand

function rbox(w, h, d, mat, r = 0.1) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// black and white floor checks
function checks() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    x.fillStyle = (i + j) % 2 ? "#141216" : "#6f685e";
    x.fillRect(i * 32, j * 32, 32, 32);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 6);
  return t;
}

// a neon sign: glowing letters on a dark backing, drawn on a canvas
function neon(text, color, w = 512, h = 160) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  x.font = `700 ${Math.round(h * 0.62)}px "Avenir Next", "Helvetica Neue", sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  for (const [blur, alpha] of [[28, 0.9], [12, 1], [0, 1]]) {
    x.shadowColor = color;
    x.shadowBlur = blur;
    x.fillStyle = blur ? color : "#ffffff";
    x.globalAlpha = alpha;
    x.fillText(text, w / 2, h / 2);
  }
  return tex(c);
}

export function build(ctx) {
  const { scene, renderer } = ctx;
  renderer.toneMappingExposure = 1.05;
  scene.background = new THREE.Color(0x07060c);

  // light: warm pendants over the table, pink and teal neon from the street behind, a soft fill
  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x1c1016, 0.4));
  const lamps = [];
  for (const x of [-1.6, 3.2]) {
    const pl = new THREE.PointLight(0xffc48a, 58, 13, 2);
    pl.position.set(x, 7.4, -0.6);
    scene.add(pl);
    lamps.push(pl);
    const hang = pendant(true, 4);
    hang.position.set(x, 8.2, -0.6);
    scene.add(hang);
  }
  lamps[0].castShadow = true;
  lamps[0].shadow.mapSize.set(1024, 1024);
  lamps[0].shadow.bias = -0.002;
  const pink = new THREE.DirectionalLight(0xff5aa8, 1.2);
  pink.position.set(-7, 6, -10);
  const teal = new THREE.DirectionalLight(0x40f0e0, 0.75);
  teal.position.set(9, 5, -8);
  const fill = new THREE.PointLight(0xffe2c8, 26, 16, 2);
  fill.position.set(1.4, 5.0, 8.5);
  scene.add(pink, teal, fill);

  // the room: checked floor, the wall behind the booth with a big window
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: checks(), roughness: 0.8, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallM = lambert(0x1f4a4c, { roughness: 0.9 });
  for (const [x, w] of [[-10.5, 9], [12.5, 11]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 16), wallM);
    p.position.set(x, 8, -5.4);
    scene.add(p);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 0.3), wallM);
  sill.position.set(0.5, 1.1, -5.4);
  const head = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.3), wallM);
  head.position.set(0.5, 11.5, -5.4);
  scene.add(sill, head);
  const chrome = M(0xc9ced6, { roughness: 0.25, metalness: 0.85, flatShading: false });
  const frameM = M(0x0d0f14, { roughness: 0.5 });
  for (const [x, y, w, h] of [[-6.5, 5.85, 0.3, 7.3], [7.5, 5.85, 0.3, 7.3], [0.5, 5.85, 0.22, 7.3], [0.5, 9.5, 14, 0.3], [0.5, 2.2, 14, 0.25]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), frameM);
    b.position.set(x, y, -5.3);
    scene.add(b);
  }

  // beyond the glass: a night street, lit windows, neon signs, soft lights
  const street = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: skylineTexture({ seed: 71, sky: [[0, "#05060f"], [0.6, "#1a1238"], [1, "#3a1f4a"]], tower: [22, 18, 40], spread: [10, 8, 18], lit: 0.32, blur: 6, low: 160, high: 420 }),
  }));
  street.position.set(0, 9, -34);
  scene.add(street);
  const signs = [
    { text: "OPEN", color: "#ff4fa3", p: [-3.6, 7.2, -9], s: [3.2, 1.0] },
    { text: "24 H", color: "#3ef2e0", p: [4.6, 6.4, -12], s: [3.0, 0.95] },
    { text: "COFFEE", color: "#ffb347", p: [1.2, 8.6, -16], s: [4.4, 1.2] },
  ];
  const neonMeshes = signs.map((g) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...g.s), new THREE.MeshBasicMaterial({ map: neon(g.text, g.color), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(...g.p);
    scene.add(m);
    return m;
  });
  const disc = discTexture();
  const r = mulberry32(37);
  const bokeh = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: [0xff4fa3, 0x3ef2e0, 0xffc56a, 0xfff1d0][i % 4], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 + r() * 0.3 }));
    const sz = 0.8 + r() * 1.4;
    s.scale.set(sz, sz, 1);
    s.position.set(-7 + r() * 15, 3.0 + r() * 6, -8 - r() * 10);
    s.userData = { base: s.material.opacity, ph: r() * 6.28, per: 3 + r() * 4 };
    scene.add(s);
    bokeh.push(s);
  }

  // the booth: red vinyl, a seat and a tall tufted back, chrome trim
  const red = lambert(0xb3262b, { roughness: 0.55 });
  const redD = lambert(0x8a1b20, { roughness: 0.6 });
  const seat = rbox(11, 0.5, 1.9, red, 0.2);
  seat.position.set(0.5, 0.72, -3.15);
  const base = rbox(11, 0.5, 1.8, redD, 0.05);
  base.position.set(0.5, 0.25, -3.2);
  scene.add(seat, base);
  for (let i = 0; i < 7; i++) {
    const tuft = rbox(1.5, 2.6, 0.5, red, 0.24);
    tuft.position.set(-4.0 + i * 1.5, 2.25, -4.3);
    tuft.rotation.x = -0.08;
    scene.add(tuft);
  }
  const cap = rbox(11.2, 0.22, 0.7, chrome, 0.08);
  cap.position.set(0.5, 3.62, -4.35);
  scene.add(cap);

  // the table: a cream top with a chrome edge on one pedestal
  const top = rbox(9.8, 0.14, 2.9, lambert(0xe8e1cf, { roughness: 0.45 }), 0.06);
  top.position.set(0.9, TOP - 0.07, -0.25);
  const edge = rbox(9.9, 0.1, 3.0, chrome, 0.05);
  edge.position.set(0.9, TOP - 0.17, -0.25);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, TOP - 0.2, 12), chrome);
  leg.position.set(0.9, (TOP - 0.2) / 2, -0.25);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.12, 24), chrome);
  foot.position.set(0.9, 0.06, -0.25);
  scene.add(top, edge, leg, foot);

  // on the table: a napkin dispenser, ketchup and mustard, a mug, a milkshake
  const napkins = rbox(0.75, 0.62, 0.42, chrome, 0.05);
  napkins.position.set(-3.2, TOP + 0.31, -1.15);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.05), lambert(0xf7f4ee));
  paper.position.set(-3.2, TOP + 0.36, -0.93);
  scene.add(napkins, paper);
  for (const [x, color, capC] of [[5.3, 0xc8231c, 0xf2f2f2], [5.85, 0xf2c11c, 0xd23a2a]]) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.85, 12), lambert(color, { roughness: 0.4 }));
    bottle.position.set(x, TOP + 0.43, -1.15);
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), lambert(capC));
    nozzle.position.set(x, TOP + 1.0, -1.15);
    bottle.castShadow = true;
    scene.add(bottle, nozzle);
  }
  const cup = mug(0xf3efe6);
  cup.position.set(-3.7, TOP + 0.31, 0.55);
  scene.add(cup);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 1.1, 14), new THREE.MeshStandardMaterial({ color: 0xffc2d8, roughness: 0.25, transparent: true, opacity: 0.9 }));
  glass.position.set(5.9, TOP + 0.55, 0.45);
  const cream = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xfff6ea));
  cream.position.set(5.9, TOP + 1.1, 0.45);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), lambert(0xe23b6e));
  straw.position.set(6.0, TOP + 1.45, 0.4);
  straw.rotation.z = -0.25;
  glass.castShadow = true;
  scene.add(glass, cream, straw);

  placeCast(ctx, [0, 0, -2.75], 0, SLOTS);
  const cameras = deskWides(ctx);

  function update(t) {
    for (const s of bokeh) {
      const u = s.userData;
      s.material.opacity = u.base * (0.75 + 0.25 * Math.sin((2 * Math.PI * t) / u.per + u.ph));
    }
    // the OPEN sign hums: a small, steady flicker
    neonMeshes[0].material.opacity = 0.86 + 0.14 * Math.sin(t * 23) * Math.sin(t * 3.1);
  }
  return { cameras, update, front: V(0, 0, 1) };
}
