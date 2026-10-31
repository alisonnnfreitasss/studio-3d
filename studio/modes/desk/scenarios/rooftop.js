// Rooftop: a city rooftop at golden hour. The lead sits on a wooden bench, the agents stand on a long
// wooden table, string lights hang between two poles, a low parapet and a water tower behind, the
// skyline against a gold-to-blue sky with the sun low. Built on the desk's layout (lead seated at
// [0, 0, -2.75], a surface 1.7 high), so every desk camera frames it as is.
import * as THREE from "three";
import { M, V, mulberry32 } from "../../../engine/util.js";
import { lambert, plant, mug, skylineTexture } from "../props.js";
import { placeCast, SLOTS, deskWides } from "../room.js";

export const meta = { id: "rooftop", name: "Rooftop", seat: "chair" };

const TOP = 1.7;

export function build(ctx) {
  const { scene, renderer } = ctx;
  renderer.toneMappingExposure = 1.06;
  scene.background = new THREE.Color(0x2a2040);

  // light: the low sun behind gives a warm rim, the sky fills, the bulbs glow
  scene.add(new THREE.HemisphereLight(0xffd6b8, 0x3a2c2a, 0.62));
  const sun = new THREE.DirectionalLight(0xffa860, 2.3);
  sun.position.set(-14, 6, -16);
  sun.target.position.set(0, 1.5, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.bias = -0.001;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffc9a8, 0.65);
  fill.position.set(6, 6, 12);
  scene.add(fill);

  // the sky and the skyline, the sun low over it
  const city = new THREE.Mesh(new THREE.PlaneGeometry(140, 70), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: skylineTexture({ seed: 83, sky: [[0, "#3f5daa"], [0.45, "#9a74b4"], [0.75, "#f08a6a"], [1, "#ffc46b"]], tower: [58, 44, 60], spread: [14, 10, 14], lit: 0.12, blur: 3, low: 110, high: 330, sun: { x: 300, y: 380, r: 150, color: "rgba(255,226,150,0.95)" } }),
  }));
  city.position.set(0, 16, -46);
  scene.add(city);

  // the roof: concrete, a parapet behind, a water tower at the back right
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), lambert(0x7b7166, { roughness: 0.95 }));
  roof.rotation.x = -Math.PI / 2;
  roof.receiveShadow = true;
  scene.add(roof);
  const wall = M(0x8e7a68, { roughness: 0.95 });
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(40, 1.5, 0.6), wall);
  parapet.position.set(0, 0.75, -6.4);
  const capTop = new THREE.Mesh(new THREE.BoxGeometry(40, 0.18, 0.85), M(0xb4a28e, { roughness: 0.8 }));
  capTop.position.set(0, 1.55, -6.4);
  parapet.receiveShadow = capTop.receiveShadow = true;
  scene.add(parapet, capTop);
  const wood = M(0x6b4a32, { roughness: 0.9 });
  const tower = new THREE.Group();
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 6), M(0x2e2a2a));
    leg.position.set(x, 2.1, z);
    tower.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.75, 3.0, 12), wood);
  tank.position.y = 5.7;
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.4, 12), M(0x3a2c24));
  roofCone.position.y = 7.9;
  tower.add(tank, roofCone);
  for (const y of [4.7, 5.7, 6.7]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.76, 0.05, 6, 24), M(0x2e2a2a, { metalness: 0.5 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    tower.add(band);
  }
  tower.position.set(11.5, 0, -12);
  tower.traverse((o) => (o.castShadow = true));
  scene.add(tower);

  // string lights: two strands sagging between poles, one behind the cast and one high over the table
  const poleM = M(0x24222a, { roughness: 0.6 });
  const bulbs = [];
  const bulbM = (on) => new THREE.MeshBasicMaterial({ color: on ? 0xffe0a0 : 0xfff1d0, toneMapped: false });
  const r = mulberry32(29);
  for (const [z, x0, x1, y0, sag] of [[-4.6, -7.5, 9.5, 6.8, 1.3], [-0.6, -7.5, 9.5, 8.6, 1.0]]) {
    for (const x of [x0, x1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, y0, 6), poleM);
      pole.position.set(x, y0 / 2, z);
      scene.add(pole);
    }
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u, y = y0 - sag * 4 * u * (1 - u);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), bulbM(true));
      b.position.set(x, y - 0.14, z);
      b.userData = { ph: r() * 6.28 };
      scene.add(b);
      bulbs.push(b);
    }
  }
  for (const x of [-2.5, 4.5]) {
    const glow = new THREE.PointLight(0xffd28a, 9, 9, 2);
    glow.position.set(x, 6.4, -2.4);
    scene.add(glow);
  }

  // the bench, the long table, a couple of plants, a mug
  const teak = M(0x9a6a43, { roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.16, 1.1), teak);
  seat.position.set(0.6, 0.87, -3.05);
  seat.castShadow = seat.receiveShadow = true;
  scene.add(seat);
  for (const x of [-3.0, 4.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.9), M(0x5a3b25));
    leg.position.set(x, 0.4, -3.05);
    scene.add(leg);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.16, 2.8), teak);
  top.position.set(0.9, TOP - 0.08, -0.25);
  top.castShadow = top.receiveShadow = true;
  scene.add(top);
  for (const [x, z] of [[-3.6, -1.4], [5.4, -1.4], [-3.6, 0.9], [5.4, 0.9]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, TOP - 0.16, 0.18), M(0x5a3b25));
    leg.position.set(x, (TOP - 0.16) / 2, z);
    leg.castShadow = true;
    scene.add(leg);
  }
  const cup = mug(0xf3efe6);
  cup.position.set(-3.6, TOP + 0.31, 0.5);
  scene.add(cup);
  for (const [x, z, seed] of [[-7.2, -4.6, 41], [9.0, -4.8, 43]]) {
    const p = plant(seed, 1.8);
    p.position.set(x, 0, z);
    scene.add(p);
  }

  placeCast(ctx, [0, 0, -2.75], 0, SLOTS);
  const cameras = deskWides(ctx);

  function update(t) {
    for (const b of bulbs) b.scale.setScalar(0.92 + 0.08 * Math.sin(t * 1.3 + b.userData.ph));
  }
  return { cameras, update, front: V(0, 0, 1) };
}
