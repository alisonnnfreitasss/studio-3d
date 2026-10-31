// Campfire: a camp in the mountains at dusk. The lead sits on a log, the agents stand on a plank camp
// table, a fire burns at the front left and lights everyone warm, a tent and a lantern behind, layered
// low-poly mountains under a violet-to-orange sky with the first stars. The fire sits low in front of the
// table, so it shows in the wides and uplights the cast. Built on the desk's layout (lead
// seated at [0, 0, -2.75], a surface 1.7 high), so every desk camera frames it as is.
import * as THREE from "three";
import { M, V, mulberry32 } from "../../../engine/util.js";
import { lambert, discTexture } from "../props.js";
import { placeCast, SLOTS, deskWides } from "../room.js";

export const meta = { id: "campfire", name: "Campfire", seat: "chair" };

const TOP = 1.7;
const FIRE = [-0.6, 0, 4.6]; // low, in the foreground: it shows in the wides and lights the cast from below

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 512);
  for (const [s, col] of [[0, "#140e33"], [0.38, "#3b2366"], [0.62, "#8e3f78"], [0.8, "#d8646a"], [1, "#f4a35e"]]) g.addColorStop(s, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  const r = mulberry32(9);
  for (let i = 0; i < 140; i++) {
    const y = r() * 260;
    x.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.7) * (1 - y / 300)})`;
    const s = r() < 0.08 ? 2 : 1;
    x.fillRect(r() * 512, y, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function build(ctx) {
  const { scene, renderer } = ctx;
  renderer.toneMappingExposure = 1.08;
  scene.background = new THREE.Color(0x120d24);
  scene.fog = new THREE.Fog(0x3a2560, 30, 95);

  // light: the fire is the key (it flickers), dusk glow from behind, a cool moon fill
  scene.add(new THREE.HemisphereLight(0x6a5bd0, 0x1d1712, 0.45));
  const fireLight = new THREE.PointLight(0xff8a3a, 120, 24, 2);
  fireLight.position.set(FIRE[0], 1.3, FIRE[2]);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  fireLight.shadow.bias = -0.003;
  scene.add(fireLight);
  const dusk = new THREE.DirectionalLight(0xff9a7a, 0.9);
  dusk.position.set(4, 6, -12);
  const moon = new THREE.DirectionalLight(0x9fb2ff, 0.35);
  moon.position.set(8, 10, 10);
  const fill = new THREE.PointLight(0xffc9a0, 18, 16, 2);
  fill.position.set(2.5, 5, 9);
  scene.add(dusk, moon, fill);

  // the sky and the mountains, three layers, nearer is darker
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(220, 110), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false, fog: false }));
  sky.position.set(0, 30, -90);
  scene.add(sky);
  const r = mulberry32(17);
  for (const [z, color, n, hMin, hMax] of [[-75, 0x4c3a7c, 9, 16, 30], [-55, 0x33285e, 8, 12, 22], [-38, 0x221b40, 7, 8, 15]]) {
    const m = M(color, { roughness: 1 });
    for (let i = 0; i < n; i++) {
      const h = hMin + r() * (hMax - hMin), w = h * (0.9 + r() * 0.6);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5 + Math.floor(r() * 3)), m);
      peak.position.set(-60 + (i + r() * 0.6) * (120 / n), h / 2 - 1, z - r() * 6);
      peak.rotation.y = r() * 3;
      scene.add(peak);
      if (z < -70 && r() < 0.6) {
        const snow = new THREE.Mesh(new THREE.ConeGeometry(w * 0.22, h * 0.22, 5), M(0xd9d2ee, { roughness: 1 }));
        snow.position.set(peak.position.x, peak.position.y + h * 0.39, peak.position.z);
        snow.rotation.y = peak.rotation.y;
        scene.add(snow);
      }
    }
  }

  // the ground, some rocks
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), lambert(0x2a2f22, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const rockM = M(0x4a4553, { roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + r() * 0.8, 0), rockM);
    const side = r() < 0.5 ? -1 : 1;
    rock.position.set(side * (7 + r() * 9), 0.15, -9 + r() * 14);
    rock.rotation.set(r() * 3, r() * 3, r() * 3);
    rock.castShadow = true;
    scene.add(rock);
  }

  // the tent at the back left, a lantern on a pole
  // a three-sided prism lying along z, ridge up, its door end turned toward the audience
  const tent = new THREE.Group();
  const prism = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4.6, 3, 1, false, Math.PI), M(0xd9752b, { roughness: 0.9 }));
  prism.rotation.x = Math.PI / 2;
  prism.position.y = 1.2;
  prism.castShadow = true;
  const door = new THREE.Mesh(new THREE.CircleGeometry(1.25, 3), new THREE.MeshBasicMaterial({ color: 0x24140c }));
  door.rotation.z = Math.PI / 2;
  door.position.set(0, 0.66, 2.32);
  tent.add(prism, door);
  tent.position.set(6.2, 0, -8.6);
  tent.rotation.y = -0.35;
  scene.add(tent);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 6), lambert(0x2a2018));
  pole.position.set(-3.9, 2.3, -5.2);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), new THREE.MeshBasicMaterial({ color: 0xffd88a, toneMapped: false }));
  lantern.position.set(-3.9, 4.35, -5.2);
  const lanternLight = new THREE.PointLight(0xffd28a, 10, 9, 2);
  lanternLight.position.copy(lantern.position);
  scene.add(pole, lantern, lanternLight);

  // the lead's log and the plank camp table
  const bark = M(0x5a3a24, { roughness: 1 });
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 7.4, 9), bark);
  log.rotation.z = Math.PI / 2;
  log.position.set(0.5, 0.48, -3.05);
  log.castShadow = log.receiveShadow = true;
  scene.add(log);
  for (const x of [-3.2, 4.2]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.47, 9), lambert(0xc49a6c));
    end.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    end.position.set(x, 0.48, -3.05);
    scene.add(end);
  }
  const plankCols = [0x8a5a34, 0x7d5230, 0x93633b, 0x845632, 0x8f5e36];
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.13, 0.54), M(plankCols[i], { roughness: 0.9 }));
    plank.position.set(0.9, TOP - 0.065, -1.4 + i * 0.6);
    plank.castShadow = plank.receiveShadow = true;
    scene.add(plank);
  }
  const legM = M(0x5e3d23, { roughness: 1 });
  for (const x of [-3.4, 5.2]) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), legM);
      leg.position.set(x, 0.82, -0.2);
      leg.rotation.x = s * 0.55;
      leg.castShadow = true;
      scene.add(leg);
    }
  }

  // the fire: a ring of stones, crossed logs, three flames and rising embers. The stones, logs and
  // flames are one group: the wides' foreground. In a long-lens shot they would only show as a hard
  // orange shape on the bottom edge, so they hide there; the firelight and the embers stay.
  const fire = new THREE.Group();
  scene.add(fire);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), rockM);
    st.position.set(FIRE[0] + Math.cos(a) * 0.82, 0.18, FIRE[2] + Math.sin(a) * 0.82);
    st.rotation.set(a, a * 2, 0);
    fire.add(st);
  }
  for (let i = 0; i < 4; i++) {
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.7, 6), bark);
    lg.position.set(FIRE[0], 0.28, FIRE[2]);
    lg.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI, 0);
    fire.add(lg);
  }
  const flames = [[0.46, 0.95, 0xff6a14, 0.85], [0.33, 0.72, 0xffa52a, 0.9], [0.2, 0.5, 0xfff0a0, 0.95]].map(([rad, h, color, op], i) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, toneMapped: false, depthWrite: false }));
    f.position.set(FIRE[0], 0.35 + h / 2, FIRE[2]);
    f.userData = { h, ph: i * 1.7 };
    fire.add(f);
    return f;
  });
  const disc = discTexture();
  const embers = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: i % 3 ? 0xffa040 : 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    const sz = 0.06 + r() * 0.08;
    s.scale.set(sz, sz, 1);
    s.userData = { ph: r(), sp: 0.25 + r() * 0.3, dx: (r() - 0.5) * 1.2, dz: (r() - 0.5) * 1.2, sway: r() * 6.28 };
    scene.add(s);
    embers.push(s);
  }

  placeCast(ctx, [0, 0, -2.75], 0, SLOTS);
  const cameras = deskWides(ctx);

  // the flicker is a sum of sines: the same at every render
  const flick = (t, p = 0) => 0.5 * Math.sin(t * 11 + p) + 0.3 * Math.sin(t * 17.3 + p * 2) + 0.2 * Math.sin(t * 5.1 + p * 3);
  function update(t, cam) {
    fire.visible = !(cam && cam.fov < 30);
    fireLight.intensity = 120 * (1 + 0.14 * flick(t));
    for (const f of flames) {
      const u = f.userData, k = 1 + 0.12 * flick(t, u.ph);
      f.scale.set(1 + 0.05 * flick(t, u.ph + 1), k, 1 + 0.05 * flick(t, u.ph + 2));
      f.position.y = 0.35 + (u.h * k) / 2;
      f.rotation.y = t * 0.6 + u.ph;
    }
    for (const s of embers) {
      const u = s.userData, life = (t * u.sp + u.ph) % 1;
      s.position.set(FIRE[0] + u.dx * life + 0.25 * Math.sin(t * 2 + u.sway), 0.7 + life * 4.5, FIRE[2] + u.dz * life);
      s.material.opacity = Math.sin(life * Math.PI) * 0.9;
    }
  }
  return { cameras, update, front: V(0, 0, 1) };
}
