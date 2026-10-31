// Window ledge: the cast stands on a dark window sill high above the city at night. A big window
// with a cross-shaped frame, stars and lit towers beyond it, a row of big warm out-of-focus lamps
// along the top, and the agent dashboard glowing along the foot of the frame.
import * as THREE from "three";
import { M, V, lerp, mulberry32, aim } from "../../../engine/util.js";
import { makeDashboard, makeSkyTexture, makeDotTexture, A_YAW } from "../stage.js";

export const meta = { id: "window-ledge", name: "Window ledge", seat: "stand" };

const SLOTS = [
  { p: [2.5, 0, 0.7], yaw: -0.45 },
  { p: [4.8, 0, 0.1], yaw: -0.7 },
  { p: [0.4, 0, 1.5], yaw: -0.15 },
];

export function build(ctx) {
  const { scene, renderer, cast, lead, agents, TL = {}, scales = {} } = ctx;
  renderer.toneMappingExposure = 1.0;
  scene.background = new THREE.Color(0x04050f);

  // cool night ambient, a warm key from the front left, a pink rim, the screen's glow from below
  scene.add(new THREE.HemisphereLight(0x4a5aa8, 0x120f1e, 0.6));
  const key = new THREE.DirectionalLight(0xffb48a, 3.4);
  key.position.set(-8, 9, 11);
  key.target.position.set(0, 1.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff86b4, 1.3);
  rim.position.set(9, 7, -8);
  scene.add(rim);
  const glow = new THREE.PointLight(0x6d86ff, 90, 18, 2);
  glow.position.set(0, -1.2, 4.0);
  scene.add(glow);
  const faceLight = new THREE.PointLight(0xffb27a, 40, 7, 2);
  scene.add(faceLight);

  // the sill, the wall under the window, the window frame
  const sill = new THREE.Mesh(new THREE.BoxGeometry(28, 0.7, 3.6), M(0x1c1e2e, { roughness: 0.75 }));
  sill.position.set(0, -0.35, 0.3);
  sill.receiveShadow = sill.castShadow = true;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(28, 0.18, 0.3), M(0x2a2d42, { roughness: 0.6 }));
  lip.position.set(0, -0.09, 2.15);
  scene.add(sill, lip);
  const frameM = M(0x0a0b14, { roughness: 0.55 });
  const bars = [[0, 7.0, 0.45, 15.0], [-9.5, 7.0, 0.5, 15.0], [9.5, 7.0, 0.5, 15.0], [0, 6.4, 19.5, 0.4], [0, 14.3, 19.5, 0.5], [0, 0.05, 19.5, 0.3]];
  for (const [x, y, w, h] of bars) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), frameM);
    b.position.set(x, y, -1.6);
    b.castShadow = true;
    scene.add(b);
  }
  const wall = M(0x101222, { roughness: 0.95 });
  for (const [x, w] of [[-20, 20.5], [20, 20.5]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), wall);
    p.position.set(x, 7, -1.8);
    scene.add(p);
  }

  // beyond the glass: stars over lit towers, far away
  const city = new THREE.Mesh(new THREE.PlaneGeometry(180, 90), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: makeSkyTexture({ seed: 19, sky: [[0, "#02040f"], [0.55, "#0a1438"], [1, "#1b2a66"]], stars: 520, lit: 0.5, blur: 6 }),
  }));
  city.position.set(0, 16, -70);
  scene.add(city);

  // a row of big warm lamps out of focus along the top, and drifting specks
  const dot = makeDotTexture();
  const r = mulberry32(5);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xfff0d2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 + r() * 0.25 }));
    const size = 2.8 + r() * 1.6;
    s.scale.set(size, size, 1);
    s.position.set(-9 + i * 4.5 + (r() - 0.5) * 1.2, 11.6 + r() * 1.6, -9 - r() * 4);
    scene.add(s);
  }
  const dust = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xe8eeff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.15 + r() * 0.35 }));
    const size = 0.05 + r() * 0.12;
    s.scale.set(size, size, size);
    s.userData = { x: -8 + r() * 16, y: 0.4 + r() * 8, z: -1 + r() * 6, ph: r() * 6.28, sp: 0.12 + r() * 0.25 };
    scene.add(s);
    dust.push(s);
  }

  // the dashboard along the foot of the frame: a screen just below the sill, facing the camera
  const dash = makeDashboard(TL);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(20, 20 * (dash.H / dash.W)), new THREE.MeshBasicMaterial({ map: dash.tex, toneMapped: false }));
  screen.position.set(0, -0.75 - (10 * dash.H) / dash.W, 2.7);
  screen.rotation.x = -0.18;
  scene.add(screen);

  // the cast on the sill
  if (lead && cast[lead]) {
    cast[lead].root.position.set(-2.4, 0, 0.5);
    cast[lead].root.rotation.y = A_YAW;
    cast[lead].root.userData.baseYaw = A_YAW;
  }
  agents.forEach((id, i) => {
    const slot = SLOTS[i % SLOTS.length];
    const root = cast[id].root;
    root.scale.setScalar(scales[id] ?? 1);
    root.position.set(...slot.p);
    root.rotation.y = slot.yaw;
    root.userData.baseYaw = slot.yaw;
  });

  const H = () => cast[lead].anchors.head.getWorldPosition(V());
  const mid = () => V(0.1, 2.2, 0.6);
  const wideAt = (z, y, fy) => {
    const pos = V(0.0, y, z);
    return { pos, look: aim(pos, mid(), 0.5, fy, 38), fov: 38, screenBlur: 0 };
  };
  const cameras = {
    wide: (k, shot) => wideAt(24 * (1 - 0.02 * Math.min(shot.elapsed ?? 0, 6)), 5.4, 0.52),
    end: (k) => wideAt(lerp(26, 31, k), 6.0, 0.5),
    board: (k) => {
      const pos = V(0.4, lerp(2.0, 2.2, k), 15.5);
      return { pos, look: aim(pos, V(0.4, -1.4, 2.7), 0.5, 0.72, 40), fov: 40, screenBlur: 0 };
    },
    low: (k) => {
      const pos = V(lerp(-0.6, -0.4, k), 0.45, 14.5);
      return { pos, look: aim(pos, mid(), 0.5, 0.56, 44), fov: 44, screenBlur: 1 };
    },
    high: (k) => {
      const pos = V(0.4, lerp(14, 13.4, k), 15);
      return { pos, look: aim(pos, mid(), 0.5, 0.58, 40), fov: 40, screenBlur: 1 };
    },
    top: (k) => {
      const pos = V(-1.2, lerp(15, 14.4, k), 4.2);
      return { pos, look: aim(pos, H(), 0.42, 0.42, 42), fov: 42, screenBlur: 1 };
    },
    "lead-city": (k, shot) => {
      // here the city is straight behind the cast: the lead's shot from slightly below
      const h = H(), pos = h.clone().add(V(1.6, -0.6, lerp(12.6, 12.1, k)));
      return { pos, look: aim(pos, h, 0.32, 0.6, 25), fov: 25, screenBlur: 4 };
    },
  };

  const facing = (yaw) => [V(Math.sin(yaw), 0, Math.cos(yaw)), V(-Math.cos(yaw), 0, Math.sin(yaw))];
  function update(t, cam) {
    if (lead && cast[lead]) {
      const h = H(), [f, rr] = facing(A_YAW);
      faceLight.position.set(h.x + rr.x * 1.8 + f.x * 3.0, h.y + 0.9, h.z + rr.z * 1.8 + f.z * 3.0);
    }
    for (const s of dust) {
      const u = s.userData;
      s.position.set(u.x + Math.sin(t * u.sp + u.ph) * 0.35, u.y + ((t * u.sp * 0.35 + u.ph) % 1.6) * 0.5, u.z + Math.cos(t * u.sp * 0.8 + u.ph) * 0.3);
    }
    dash.draw(t, cam?.screenBlur ?? 1);
  }
  return { cameras, update };
}
