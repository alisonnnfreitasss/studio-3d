// Living room: an evening on the sofa. The lead sits back on a teal sofa, the agents stand on a low
// coffee table in front of him, a floor lamp warms the room, a window at the side shows the city at
// blue hour.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { M, piv, V, lerp, mulberry32 } from "../../../engine/util.js";
import { lambert, plant, picture, books, mug, discTexture, skylineTexture } from "../props.js";
import { placeCast } from "../room.js";

export const meta = { id: "living-room", name: "Living room", seat: "keys" };

const SEAT_Y = 1.32; // the cushion top
const TABLE_Y = 1.18; // the coffee table top
const SLOTS = [
  { p: [0.85, TABLE_Y, 0.75], yaw: -0.18 },
  { p: [2.2, TABLE_Y, 0.55], yaw: -0.4 },
  { p: [-1.0, TABLE_Y, 0.85], yaw: 0.2 },
];

function rbox(w, h, d, color, r = 0.12, o = {}) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), lambert(color, { roughness: 0.9, ...o }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function build(ctx) {
  const { scene, renderer } = ctx;
  renderer.toneMappingExposure = 1.04;
  scene.background = new THREE.Color(0x14100e);

  // light: a warm floor lamp, a cool window at the side, a soft fill from the front
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x2a1d16, 0.5));
  const lamp = new THREE.PointLight(0xffb878, 80, 16, 2);
  lamp.position.set(4.9, 5.1, -3.3);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.002;
  scene.add(lamp);
  const win = new THREE.DirectionalLight(0x9fb6ff, 0.7);
  win.position.set(-10, 7, -2);
  scene.add(win);
  const fill = new THREE.PointLight(0xffd6b0, 30, 14, 2);
  fill.position.set(1.5, 5.2, 6.5);
  scene.add(fill);

  // the room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), lambert(0x4a3324, { roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const rug = rbox(8.2, 0.04, 5.4, 0x34566a, 0.02);
  rug.position.set(0.6, 0.02, 0.4);
  const wallM = lambert(0xcfb58f, { roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), wallM);
  back.position.set(0, 8, -5.4);
  back.receiveShadow = true;
  const side = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), wallM);
  side.rotation.y = Math.PI / 2;
  side.position.set(-8.5, 8, 4);
  scene.add(floor, rug, back, side);
  // a window in the side wall: the city at blue hour beyond it
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.6), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: skylineTexture({ seed: 53, sky: [[0, "#2c3f7a"], [0.6, "#5c6fb0"], [1, "#c99aa6"]], tower: [30, 34, 60], spread: [8, 8, 10], lit: 0.3, blur: 5, low: 150, high: 380 }),
  }));
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-8.46, 4.8, -1.6);
  scene.add(sky);
  const frameM = lambert(0xf1ece2, { roughness: 0.7 });
  for (const [y, h, z, d] of [[2.0, 0.2, -1.6, 5.6], [7.6, 0.2, -1.6, 5.6], [4.8, 5.8, -4.4, 0.2], [4.8, 5.8, 1.2, 0.2], [4.8, 5.8, -1.6, 0.12]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, d), frameM);
    b.position.set(-8.4, y, z);
    scene.add(b);
  }

  // the sofa
  const teal = 0x2f7f7a, tealD = 0x266863;
  const base = rbox(7.4, 0.9, 2.8, tealD, 0.15);
  base.position.set(0, 0.6, -3.55);
  scene.add(base);
  for (const x of [-1.75, 1.75]) {
    const seat = rbox(3.45, 0.42, 2.4, teal, 0.16);
    seat.position.set(x, SEAT_Y - 0.21, -3.4);
    const backC = rbox(3.45, 1.9, 0.6, teal, 0.2);
    backC.position.set(x, SEAT_Y + 0.85, -4.55);
    backC.rotation.x = -0.12;
    scene.add(seat, backC);
  }
  for (const x of [-3.95, 3.95]) {
    const arm = rbox(0.75, 1.75, 2.8, tealD, 0.2);
    arm.position.set(x, 1.0, -3.55);
    scene.add(arm);
  }
  for (const [x, z] of [[-3.4, -2.4], [3.4, -2.4], [-3.4, -4.7], [3.4, -4.7]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.3, 8), lambert(0x2a1c12));
    leg.position.set(x, 0.15, z);
    scene.add(leg);
  }
  const pillow = rbox(1.5, 1.2, 0.45, 0xf2ede4, 0.22);
  pillow.position.set(-2.55, SEAT_Y + 0.55, -4.0);
  pillow.rotation.set(-0.25, 0.35, 0.2);
  const throwM = rbox(1.7, 0.16, 2.3, 0x8a6bc0, 0.08);
  throwM.position.set(3.0, SEAT_Y + 0.02, -3.35);
  throwM.rotation.z = 0.06;
  const throwFall = rbox(1.7, 1.3, 0.14, 0x8a6bc0, 0.06);
  throwFall.position.set(3.0, SEAT_Y - 0.6, -2.2);
  scene.add(pillow, throwM, throwFall);

  // the coffee table, a book and a mug on it
  const wood = lambert(0x3b2618, { roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 2.3), wood);
  top.position.set(0.5, TABLE_Y - 0.08, 0.6);
  top.castShadow = top.receiveShadow = true;
  scene.add(top);
  for (const [x, z] of [[-2.0, -0.35], [3.0, -0.35], [-2.0, 1.55], [3.0, 1.55]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, TABLE_Y - 0.16, 0.16), wood);
    leg.position.set(x, (TABLE_Y - 0.16) / 2, z);
    leg.castShadow = true;
    scene.add(leg);
  }
  const book = books([0x2d6b73], 1.3, 0.95, 0.18, 4);
  book.position.set(-1.9, TABLE_Y, 0.3);
  book.rotation.y = 0.3;
  const cup = mug(0xe9e2d4);
  cup.position.set(2.75, TABLE_Y + 0.31, 1.05);
  scene.add(book, cup);

  // a floor lamp, a plant, a picture
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.2, 8), lambert(0x1c1c20, { roughness: 0.4 }));
  pole.position.set(4.9, 2.6, -3.3);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 20), lambert(0x1c1c20));
  foot.position.set(4.9, 0.06, -3.3);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 1.0, 20, 1, true), lambert(0xf3dfb8, { side: THREE.DoubleSide, emissive: 0x7a5420, emissiveIntensity: 0.9 }));
  shade.position.set(4.9, 5.4, -3.3);
  scene.add(pole, foot, shade);
  const pot = plant(19, 1.7);
  pot.position.set(-6.2, 0, -4.4);
  const art = picture(2.4, 1.6, 27, ["#f2c14e", "#e07a5f", "#3d405b", "#81b29a"]);
  art.position.set(0.4, 5.6, -5.36);
  scene.add(pot, art);

  // a few soft lights in the window
  const disc = discTexture();
  const r = mulberry32(61);
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: [0xffd27a, 0xfff1d0, 0x9fb6ff][i % 3], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.15 + r() * 0.2 }));
    const sz = 0.4 + r() * 0.6;
    s.scale.set(sz, sz, 1);
    s.position.set(-8.6 - r() * 2, 3.0 + r() * 4, -4 + r() * 4.8);
    scene.add(s);
  }

  placeCast(ctx, [0, SEAT_Y - 0.56, -3.15], 0, SLOTS);

  const H = () => ctx.cast[ctx.lead].anchors.head.getWorldPosition(V());
  const cameras = {
    wide: (k) => ({ pos: V(lerp(-5.6, -5.9, k), 5.0, lerp(17.6, 18.6, k)), look: V(0.5, 2.3, -2.0), fov: 30, focus: H(), dof: 0.01 }),
    end: (k) => ({ pos: V(lerp(-5.6, -7.2, k), lerp(5.0, 6.0, k), lerp(17.6, 22.4, k)), look: V(0.3, 2.6, -2.4), fov: 31, focus: H(), dof: 0.008 }),
    high: () => ({ pos: V(0.6, 10.5, 8.5), look: V(0.4, 1.2, -1.4), fov: 34, focus: H(), dof: 0.008 }),
  };
  return { cameras, front: V(0, 0, 1) };
}
