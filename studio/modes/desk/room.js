// The desk room shared by the desk scenarios: the lead at a desk, the agents standing on it, a big
// window behind. A look re-lights the same room: the sky and city through the window, the lamp,
// the fill, the out-of-focus lights, rain on the glass, extra props. One desk set
// is re-lit to match each script (night, dusk, rain, morning).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { M, piv, V, lerp, mulberry32, aim } from "../../engine/util.js";
import { discTexture, skylineTexture, dropsTexture, mug as mugProp, plant, books, stickyNotes, notepad, ball, pendant } from "./props.js";

// where the agents stand on the desk, in cast order: position and facing
export const SLOTS = [
  { p: [2.15, 1.7, 0.55], yaw: -0.12 },
  { p: [3.95, 1.7, 0.2], yaw: -0.38 },
  { p: [-2.25, 1.7, 0.45], yaw: 0.22 },
];

export function placeCast({ cast, lead, agents, scales = {} }, leadAt = [0, 0, -2.75], leadYaw = 0, slots = SLOTS, defaultScale = 0.66) {
  if (lead && cast[lead]) {
    cast[lead].root.position.set(...leadAt);
    cast[lead].root.rotation.y = leadYaw;
    cast[lead].root.userData.baseYaw = leadYaw;
  }
  agents.forEach((id, i) => {
    const slot = slots[i % slots.length];
    const r = cast[id].root;
    const sc = scales[id] ?? defaultScale;
    r.scale.setScalar(sc);
    r.position.set(...slot.p);
    r.rotation.y = slot.yaw;
    r.userData.baseYaw = slot.yaw;
    r.userData.scale = sc;
  });
}

// The wide, closing and high shots of any place laid out like the desk (the lead seated at
// [0, 0, -2.75], the agents on a surface 1.7 high in front of him): in front of the table at the
// lead's chin height, 3 to 5 degrees down, eyes 37% down; with two or more agents the lead moves left
// so they all fit. The closing wide pulls back about 22%. Shared by the desk room and the places
// built on its layout (diner, campfire, rooftop).
export function deskWides(ctx, o = {}) {
  const H = () => ctx.cast[ctx.lead].anchors.head.getWorldPosition(V());
  const n = ctx.agents.length;
  const WIDE = n > 2 ? { x: 0.9, y: 4.3, z: 22.0, fx: 0.45, fy: 0.37, fov: 40 }
    : n > 1 ? { x: 1.6, y: 4.1, z: 16.2, fx: 0.27, fy: 0.37, fov: 40 }
    : { x: 1.0, y: 4.1, z: 12.4, fx: 0.44, fy: 0.37, fov: 40 };
  Object.assign(WIDE, o);
  const wideAt = (z) => {
    const pos = V(WIDE.x, WIDE.y, z);
    return { pos, look: aim(pos, H(), WIDE.fx, WIDE.fy, WIDE.fov), fov: WIDE.fov, focus: H(), dof: 0.008 };
  };
  return {
    wide: (k, shot) => wideAt(WIDE.z * (1 - 0.03 * Math.min(shot.elapsed ?? 0, 6))),
    end: (k) => wideAt(WIDE.z * (1 + 0.22 * k)),
    high: (k) => ({ pos: V(1.7, lerp(10.5, 10.0, k), lerp(14.5, 13.8, k)), look: V(1.7, 1.9, -0.8), fov: 34, focus: H(), dof: 0.008 }),
  };
}

export function deskRoom(ctx, look) {
  const { scene, renderer } = ctx;
  renderer.toneMappingExposure = look.exposure ?? 1.05;
  scene.background = new THREE.Color(look.background ?? 0x05060c);

  scene.add(new THREE.HemisphereLight(...look.hemi));
  const windowLight = new THREE.DirectionalLight(look.window[0], look.window[1]);
  windowLight.position.set(...(look.window[2] || [2, 7, -12]));
  scene.add(windowLight);
  if (look.sun) {
    const sun = new THREE.DirectionalLight(look.sun[0], look.sun[1]);
    sun.position.set(...look.sun[2]);
    sun.target.position.set(0, 1.5, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.001;
    scene.add(sun, sun.target);
  }
  const lampLight = new THREE.PointLight(look.lamp[0], look.lamp[1], 16, 2);
  lampLight.position.set(-3.7, 3.85, -0.35);
  lampLight.castShadow = look.lamp[1] > 0;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.002;
  scene.add(lampLight);
  const screenLight = new THREE.PointLight(look.screen[0], look.screen[1], 6, 2);
  screenLight.position.set(-2.3, 2.6, -1.5);
  scene.add(screenLight);
  const toyLight = new THREE.PointLight(look.fill[0], look.fill[1], 12, 2);
  toyLight.position.set(2.7, 4.6, 4.8);
  scene.add(toyLight);
  if (look.faceKey) {
    // a soft key in front of the lead, for looks where the window is brighter than the room
    const fk = new THREE.PointLight(look.faceKey[0], look.faceKey[1], 14, 2);
    fk.position.set(...look.faceKey[2]);
    scene.add(fk);
  }

  const wood = M(look.desk ?? 0x6b4429, { roughness: 0.88, flatShading: false });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(13, 0.16, 3.4), wood);
  desk.position.set(0, 1.62, 0);
  desk.receiveShadow = desk.castShadow = true;
  scene.add(desk);
  const deskFront = new THREE.Mesh(new THREE.BoxGeometry(13, 1.56, 0.12), M(look.deskFront ?? 0x3a2416, { roughness: 0.7, flatShading: false }));
  deskFront.position.set(0, 0.78, 1.62);
  deskFront.receiveShadow = true;
  scene.add(deskFront);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), M(look.floor ?? 0x0c0d12, { roughness: 0.9, flatShading: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallM = M(look.wall ?? 0x121726, { roughness: 0.95, flatShading: false });
  const holeW = 22, holeH = 11, holeY = 7.4;
  for (const [x, y, w, h] of [[0, holeY + holeH / 2 + 5, 60, 10], [0, holeY - holeH / 2 - 5, 60, 10], [-holeW / 2 - 10, holeY, 20, holeH], [holeW / 2 + 10, holeY, 20, holeH]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM);
    p.position.set(x, y, -9.5);
    scene.add(p);
  }
  const frameM = M(look.frame ?? 0x07080d, { roughness: 0.6, flatShading: false });
  for (let i = 0; i <= 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, holeH, 0.3), frameM);
    m.position.set(-holeW / 2 + (i * holeW) / 6, holeY, -9.45);
    scene.add(m);
  }
  for (const y of [holeY - holeH / 2, holeY + 0.6, holeY + holeH / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(holeW, 0.22, 0.3), frameM);
    m.position.set(0, y, -9.45);
    scene.add(m);
  }
  const city = new THREE.Mesh(new THREE.PlaneGeometry(150, 75), new THREE.MeshBasicMaterial({ map: skylineTexture(look.city), toneMapped: false, color: look.cityTint ?? 0x8f96b4 }));
  city.position.set(0, 18, -80);
  scene.add(city);

  // out-of-focus lights beyond the window
  const bokeh = [];
  if (look.bokeh) {
    const disc = discTexture();
    const { colors, count, opacity = [0.18, 0.42], size = [0.9, 2.6], seed = 23 } = look.bokeh;
    const br = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: colors[Math.floor(br() * colors.length)], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: opacity[0] + br() * opacity[1] }));
      const z = -24 - br() * 34, sz = size[0] + br() * size[1];
      s.scale.set(sz, sz, 1);
      s.position.set(-22 + br() * 44, 2 + br() * 16, z);
      s.userData = { base: s.material.opacity, ph: br() * 6.28, per: 2 + br() * 3 };
      scene.add(s);
      bokeh.push(s);
    }
  }

  // rain: streaks falling beyond the glass, drops beading on it
  const streaks = [];
  if (look.rain) {
    const rr = mulberry32(look.rain.seed ?? 41);
    const geo = new THREE.PlaneGeometry(0.03, 1.1);
    for (let i = 0; i < (look.rain.count ?? 150); i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: look.rain.color ?? 0xd7e1f0, transparent: true, opacity: 0.1 + rr() * 0.22, depthWrite: false, toneMapped: false }));
      m.userData = { x: -12 + rr() * 24, z: -11 - rr() * 16, ph: rr(), sp: 7 + rr() * 5 };
      m.rotation.z = -0.06;
      scene.add(m);
      streaks.push(m);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(holeW, holeH), new THREE.MeshBasicMaterial({ map: dropsTexture(look.rain.seed ?? 41), transparent: true, opacity: look.rain.drops ?? 0.22, depthWrite: false, toneMapped: false }));
    glass.position.set(0, holeY, -9.42);
    scene.add(glass);
  }

  // props: desk lamp (left), laptop (his left, turned to him), mug (right), chair
  const lampOn = look.lamp[1] > 0;
  const lampM = M(0x1d1f26, { roughness: 0.4, metalness: 0.3, flatShading: false });
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.14, 24), lampM);
  lampBase.position.set(-4.4, 1.77, -0.6);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 10), lampM);
  stem.position.set(-4.2, 2.95, -0.55);
  stem.rotation.z = -0.18;
  const shadeM = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.8, 24, 1, true), M(0xd8c9a6, { side: THREE.DoubleSide, roughness: 0.7, flatShading: false, emissive: lampOn ? 0x6b4a1c : 0x000000, emissiveIntensity: 0.6 }));
  shadeM.position.set(-3.75, 4.15, -0.4);
  shadeM.rotation.z = -0.5;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: lampOn ? 0xffe2b0 : 0x8a8478, toneMapped: !lampOn }));
  bulb.position.set(-3.68, 3.95, -0.38);
  scene.add(lampBase, stem, shadeM, bulb);
  const laptop = piv(-3.5, 1.7, -1.1);
  laptop.rotation.y = 0.55 + Math.PI;
  const metal = M(0x3a3e47, { roughness: 0.35, metalness: 0.4, flatShading: false });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.6), metal);
  base.position.set(0, 0.04, 0);
  const lid = piv(0, 0.08, -0.8);
  lid.rotation.x = -1.35;
  const lidM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.6), metal);
  lidM.position.set(0, 0, 0.8);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: look.screenGlow ?? 0xa9c8ff, toneMapped: false }));
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, 0.035, 0.8);
  lid.add(lidM, glow);
  laptop.add(base, lid);
  laptop.traverse((o) => (o.castShadow = true));
  scene.add(laptop);
  const mugM = M(0xdfe4ee, { roughness: 0.4, flatShading: false });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.62, 20), mugM);
  mug.position.set(5.6, 2.01, -0.7);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 16), mugM);
  handle.position.set(5.96, 2.03, -0.7);
  mug.castShadow = handle.castShadow = true;
  scene.add(mug, handle);
  const chair = new THREE.Mesh(new RoundedBoxGeometry(2.7, 3.0, 0.4, 3, 0.18), M(0x22252e, { roughness: 0.8, flatShading: false }));
  chair.position.set(0, 2.2, -3.55);
  scene.add(chair);

  // the lived-in extras the closing wide reveals: notes, a notepad, books, a ball, a plant, a pendant
  if (look.extras) {
    const notes = stickyNotes(11);
    notes.position.set(-3.75, 1.7, 1.0);
    const pad = notepad();
    pad.position.set(-1.75, 1.7, 0.85);
    pad.rotation.y = 0.18;
    const stack = books([0x2f6e8f, 0xd8b13a, 0x8f3f4f], 1.5, 1.05, 0.26, 13);
    stack.position.set(5.0, 1.7, -0.6);
    stack.rotation.y = -0.25;
    const red = ball(0xd8443a, 0.36);
    red.position.set(-5.6, 1.7, 0.4);
    const pot = plant(7, 1.05);
    pot.position.set(6.1, 1.7, 0.75);
    const hang = pendant(look.pendantLit ?? true, 6);
    hang.position.set(4.8, 9.6, -1.4);
    scene.add(notes, pad, stack, red, pot, hang);
    if (look.pendantLit ?? true) {
      const pl = new THREE.PointLight(0xffc98a, 18, 8, 2);
      pl.position.set(4.8, 9.2, -1.4);
      scene.add(pl);
    }
  }

  placeCast(ctx);
  const cameras = deskWides(ctx);

  function update(t) {
    for (const s of bokeh) {
      const u = s.userData;
      s.material.opacity = u.base * (0.78 + 0.22 * Math.sin((2 * Math.PI * t) / u.per + u.ph));
    }
    for (const m of streaks) {
      const u = m.userData;
      const fall = (t * u.sp + u.ph * 13) % 13;
      m.position.set(u.x + fall * 0.06, 13.5 - fall, u.z);
    }
  }
  return { cameras, update, front: V(0, 0, 1) };
}
