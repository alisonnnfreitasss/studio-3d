// Vehicles: the engine build's blue toy hatchback (B-objects.md: one bevelled extrusion of the side
// silhouette, window frames with real holes, lathe wheels, gloss paint, a soft contact shadow; the
// bonnet lifts) and its bike, copied from an earlier reel
// Car: 13 long (front at +x), 5.6 wide, about 6 tall at scale 1; update(t, { x, z, yaw, dist, bonnet,
// bob, pitch }); the driver's hips at car.seat (car space), facing +x. For a scene where the lead is
// 0.42, scale the car's root by about 0.42 too (car.root.scale) and drive it with the same x/z/yaw.
import * as THREE from "three";
import { smoothMat, metal, cyl, bx, grp, mesh, tube, canvasTex, TAU } from "./kit.js";
import { paintMat, plastic, steel, rbox, rpoly, rrect, extrude, lathe, roundedProfile, gradient, windowGlass, toyWheel, blobShadow } from "./shapes.js";

// ---------- the car ----------
// A soft toy hatchback. The body is one bevelled extrusion of its side silhouette (wheel arches cut
// into the outline), the cabin is two window-frame panels with real holes plus a rounded roof, and
// the wheels are lathe-turned. Same footprint, anchors and update() as before: 13 long (front at
// +x), 5.6 wide, driver hips at (-0.55, 3.25, -1.25), engine bay at (4.3, 2.85, 0).
const WR = 1.42, WW = 1.05, AXLE = 4.1, TRACK = 2.55, ARCH = WR + 0.22, SILL = 0.95;

function bodyShape() {
  const s = new THREE.Shape();
  const dy = WR - SILL, dx = Math.sqrt(ARCH * ARCH - dy * dy);
  const a0 = Math.atan2(-dy, -dx), a1 = Math.atan2(-dy, dx);
  s.moveTo(-AXLE + dx, SILL);
  s.lineTo(AXLE - dx, SILL);
  s.absarc(AXLE, WR, ARCH, a0, a1, true); // front arch, over the top
  s.lineTo(6.15, SILL);
  s.quadraticCurveTo(6.55, SILL, 6.55, SILL + 0.4);
  s.lineTo(6.55, 2.0);
  s.bezierCurveTo(6.55, 2.42, 6.32, 2.63, 5.7, 2.65); // the round nose
  s.lineTo(2.3, 2.82); // under the bonnet
  s.lineTo(-5.85, 2.95); // belt line
  s.bezierCurveTo(-6.35, 2.95, -6.55, 2.72, -6.55, 2.3);
  s.lineTo(-6.55, SILL + 0.4);
  s.quadraticCurveTo(-6.55, SILL, -6.15, SILL);
  s.lineTo(-AXLE - dx, SILL);
  s.absarc(-AXLE, WR, ARCH, a0, a1, true); // rear arch
  return s;
}

// a line drawn on the body as a thin dark tube: panel gaps, door lines
function panelLine(pts, z, material, r = 0.022) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, z)), true, "catmullrom", 0.05);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 120, r, 6, true), material);
}

export function buildCar(scene, color = 0x2f7de1) {
  const root = grp();
  scene.add(root);
  const body = grp();
  root.add(body);
  const paint = paintMat(color);
  const bodyM = paintMat(color, { vertexColors: true });
  const trimM = plastic(0x2a2d33, { roughness: 0.6 });
  const chrome = steel(0xd9dee5, { roughness: 0.22 });
  const gapM = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.6 });

  // 1. the body shell: side silhouette extruded across the width with a big soft bevel; a vertex
  // gradient darkens the lower body (cheap baked occlusion)
  const bodyGeo = gradient(extrude(bodyShape(), 5.6, { bevel: 0.34, seg: 6, curve: 32, creaseAngle: 0.9 }), "y", 0.9, 2.6, 0.72, 1.0);
  const shell = mesh(bodyGeo, bodyM);
  body.add(shell); // children[0]: main.js tints this material red for the overheating beat

  // 2. roof (children[1], the shared paint)
  const roof = mesh(rbox(5.75, 0.36, 5.05, 0.17, 4), paint);
  roof.position.set(-1.92, 5.9, 0);
  body.add(roof);

  // 3. cabin sides: window frames with real holes (pillars come out rounded)
  const OUT = [[2.32, 2.78], [0.78, 5.8], [-4.62, 5.8], [-5.62, 2.78]];
  const HOLE_F = [[1.84, 3.05], [0.64, 5.46], [-1.5, 5.46], [-1.5, 3.05]];
  const HOLE_R = [[-1.98, 3.05], [-1.98, 5.46], [-4.36, 5.46], [-5.17, 3.05]];
  const frame = rpoly(OUT, [0.05, 0.38, 0.38, 0.05]);
  frame.holes.push(rpoly(HOLE_F, [0.12, 0.22, 0.22, 0.12], true), rpoly(HOLE_R, [0.12, 0.22, 0.22, 0.12], true));
  const frameGeo = extrude(frame, 0.2, { bevel: 0.07, seg: 3, curve: 16 });
  const sideGlass = windowGlass(0.3);
  for (const s of [-1, 1]) {
    const f = mesh(frameGeo, paint);
    f.position.z = s * 2.38;
    body.add(f);
    for (const h of [HOLE_F, HOLE_R]) {
      const pane = mesh(new THREE.ShapeGeometry(rpoly(h, [0.12, 0.22, 0.22, 0.12]), 8), sideGlass, false);
      pane.position.z = s * 2.36;
      pane.renderOrder = 3;
      body.add(pane);
    }
  }
  // windscreen and rear glass between the frames
  const screenLen = Math.hypot(2.32 - 0.78, 5.8 - 2.78);
  const screen = mesh(new THREE.PlaneGeometry(4.66, screenLen).rotateY(Math.PI / 2).rotateZ(Math.atan2(2.32 - 0.78, 5.8 - 2.78)), windowGlass(1), false);
  screen.position.set((2.32 + 0.78) / 2 - 0.04, (2.78 + 5.8) / 2, 0);
  screen.renderOrder = 3;
  body.add(screen);
  const rearLen = Math.hypot(1.0, 3.02);
  const rearG = mesh(new THREE.PlaneGeometry(4.66, rearLen).rotateY(-Math.PI / 2).rotateZ(-Math.atan2(1.0, 3.02)), windowGlass(1), false);
  rearG.position.set(-5.1, 4.29, 0);
  rearG.renderOrder = 3;
  body.add(rearG);

  // 4. bonnet: a slightly domed bevelled slab hinged at its back edge (x = 2.2)
  const bonnetPivot = grp(2.2, 2.92, 0);
  body.add(bonnetPivot);
  const bs = new THREE.Shape();
  bs.moveTo(0.02, -0.06);
  bs.lineTo(3.55, -0.24);
  bs.quadraticCurveTo(3.72, -0.25, 3.74, -0.12);
  bs.quadraticCurveTo(1.9, 0.02, 0.02, 0.06);
  bs.closePath();
  const bonnet = mesh(extrude(bs, 4.75, { bevel: 0.07, seg: 3 }), paint);
  bonnetPivot.add(bonnet);
  // engine bay: a dark tray under the bonnet
  const bay = mesh(rbox(3.3, 0.08, 4.3, 0.04, 2), plastic(0x4a4e57, { roughness: 0.6 }));
  bay.position.set(4.15, 2.715, 0);
  body.add(bay);

  // 5. face: round headlights in chrome bezels, a grille with rounded bars, bumpers, plates
  const bezelGeo = lathe(roundedProfile([[0.0, -0.02], [0.44, -0.02], [0.44, 0.07, 0.04], [0.36, 0.12, 0.03], [0.0, 0.12]], 3), 40).rotateZ(-Math.PI / 2);
  const lensGeo = lathe(roundedProfile([[0.34, 0], [0.34, 0.03], [0.2, 0.13, 0.08], [0, 0.16]], 4), 40).rotateZ(-Math.PI / 2);
  const lensM = new THREE.MeshStandardMaterial({ color: 0xfff7e0, emissive: 0xfff1c4, emissiveIntensity: 0.55, roughness: 0.15 });
  for (const s of [-1, 1]) {
    const bz = mesh(bezelGeo, chrome);
    bz.position.set(6.5, 1.68, s * 1.86);
    const lens = mesh(lensGeo, lensM, false);
    lens.position.set(6.58, 1.68, s * 1.86);
    body.add(bz, lens);
  }
  const grilleFrame = rrect(2.5, 0.92, 0.26);
  grilleFrame.holes.push(rrect(2.2, 0.64, 0.16, 0, 0, true));
  const gf = mesh(extrude(grilleFrame, 0.16, { bevel: 0.05 }).rotateY(Math.PI / 2), chrome);
  gf.position.set(6.56, 1.62, 0);
  body.add(gf);
  const grille = mesh(rbox(0.1, 0.66, 2.24, 0.05, 2), trimM);
  grille.position.set(6.52, 1.62, 0);
  body.add(grille);
  const slats = [];
  for (let i = 0; i < 3; i++) {
    const sl = mesh(rbox(0.12, 0.09, 2.2, 0.045, 3), chrome, false);
    sl.position.set(6.6, 1.43 + i * 0.19, 0);
    body.add(sl);
    slats.push(sl);
  }
  const bumperM = plastic(0xd2d7de, { roughness: 0.35, metalness: 0.15 });
  for (const x of [6.62, -6.62]) {
    const bump = mesh(rbox(0.7, 0.58, 5.75, 0.26, 4), bumperM);
    bump.position.set(x, 1.0, 0);
    body.add(bump);
  }
  const plateTex = canvasTex(256, 72, (x, w, h) => {
    x.fillStyle = "#f4f1e8"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#1d2a4a"; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = "#1d2a4a"; x.font = "800 46px Montserrat, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("ENGINE", w / 2, h / 2 + 3);
  });
  const plateM = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
  const plateF = mesh(rbox(0.05, 0.36, 1.3, 0.04, 2), plateM, false);
  plateF.position.set(6.99, 1.0, 0);
  body.add(plateF);
  const plateR = plateF.clone();
  plateR.position.set(-6.99, 1.0, 0);
  plateR.rotation.y = Math.PI;
  body.add(plateR);
  // tail lights: rounded red blocks with a white reverse lamp
  const tailM = new THREE.MeshStandardMaterial({ color: 0xe0342c, emissive: 0x8a1410, emissiveIntensity: 0.5, roughness: 0.2 });
  const revM = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, emissive: 0x6a6658, emissiveIntensity: 0.4, roughness: 0.2 });
  for (const s of [-1, 1]) {
    const tl = mesh(rbox(0.16, 0.62, 0.8, 0.07, 3), tailM);
    tl.position.set(-6.56, 2.08, s * 1.98);
    const rv = mesh(rbox(0.14, 0.2, 0.8, 0.06, 2), revM);
    rv.position.set(-6.55, 1.62, s * 1.98);
    body.add(tl, rv);
  }

  // 6. side details: door gap, handle, mirrors
  for (const s of [-1, 1]) {
    const z = s * 2.802;
    body.add(panelLine([[1.95, 2.48], [1.95, 1.38], [-1.95, 1.38], [-1.95, 2.48]], z, gapM));
    const handle = mesh(rbox(0.5, 0.12, 0.09, 0.045, 2), chrome);
    handle.position.set(-1.35, 2.3, s * 2.83);
    body.add(handle);
    const mirror = grp(1.95, 3.3, s * 2.62);
    const stalk = mesh(rbox(0.2, 0.12, 0.3, 0.05, 2), trimM);
    stalk.position.z = s * 0.12;
    const housing = mesh(rbox(0.4, 0.36, 0.6, 0.15, 3), paint);
    housing.position.set(-0.05, 0.12, s * 0.42);
    mirror.add(stalk, housing);
    body.add(mirror);
  }

  // 7. exhaust pipe at the back, low, left
  const exhaust = mesh(lathe(roundedProfile([[0.16, -1.1], [0.2, -1.1], [0.2, 0.95, 0.03], [0.24, 1.0, 0.03], [0.24, 1.1, 0.02], [0.16, 1.1], [0.16, 0.9]], 2), 20).rotateZ(Math.PI / 2), steel(0x9aa0a8));
  exhaust.position.set(-6.4, 0.75, -1.6);
  body.add(exhaust);

  // 8. wheels: lathe tyre with tread grooves, pale rim with windows, body-colour hub cap
  const wheels = [];
  for (const x of [AXLE, -AXLE]) for (const s of [-1, 1]) {
    const wg = grp(x, WR, s * TRACK);
    const w = toyWheel(WR, WW, { capColor: color });
    if (s < 0) w.rotation.y = Math.PI;
    wg.add(w);
    root.add(wg);
    wheels.push(wg);
  }
  // a soft contact patch under the car
  const blob = blobShadow(15.5, 8.2, 0.38);
  blob.position.y = 0.06;
  root.add(blob);

  // 9. interior: rounded seats, a dash, the steering wheel
  const seatM = plastic(0x34373e, { roughness: 0.7 });
  for (const s of [-1, 1]) {
    const seat = mesh(rbox(1.6, 0.5, 1.75, 0.2, 3), seatM);
    seat.position.set(-0.6, 3.1, s * 1.25);
    body.add(seat);
    const back = mesh(rbox(0.45, 2.0, 1.7, 0.2, 3), seatM);
    back.position.set(-1.45, 4.1, s * 1.25);
    back.rotation.z = 0.08;
    body.add(back);
    const rest = mesh(rbox(0.36, 0.5, 1.0, 0.16, 3), seatM);
    rest.position.set(-1.55, 5.3, s * 1.25);
    body.add(rest);
  }
  const steer = grp(1.0, 4.0, -1.25);
  const ring = mesh(new THREE.TorusGeometry(0.62, 0.085, 10, 40), plastic(0x24262b, { roughness: 0.6 }));
  ring.rotation.y = Math.PI / 2;
  const hubS = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 20).rotateZ(Math.PI / 2), plastic(0x24262b));
  steer.add(ring, hubS);
  steer.rotation.z = 0.5;
  body.add(steer);
  const dash = mesh(rbox(0.85, 0.62, 4.9, 0.22, 3), plastic(0x30333a, { roughness: 0.65 }));
  dash.position.set(1.72, 3.32, 0);
  body.add(dash);

  let bonnetK = 0;
  const _cv = new THREE.Vector3();
  return {
    root, body, wheels, bonnetPivot, steer, slats, grille,
    // driver seat anchor (in car space): hips position and the facing (+x)
    seat: new THREE.Vector3(-0.55, 3.25, -1.25),
    update(t, s = {}) {
      root.position.set(s.x ?? 0, s.y ?? 0, s.z ?? 0); // y: the kit's one change (a road on a bank)
      root.rotation.y = s.yaw ?? 0;
      const spin = (s.dist ?? 0) / WR;
      for (const w of wheels) w.rotation.z = -spin;
      // the bonnet lifts at its front edge (the old build swung it down into the body)
      bonnetK = s.bonnet ?? 0;
      bonnetPivot.rotation.z = bonnetK * 1.05;
      body.position.y = s.bob ?? 0;
      body.rotation.z = s.pitch ?? 0;
    },
    // per view (like the garage walls): an open bonnet folds for a camera close in front of the
    // cabin and low (the key shot looks through the windscreen); wide and overhead views keep it open
    viewFrom(camPos) {
      if (!bonnetK) return;
      root.updateMatrixWorld(true);
      const lp = body.worldToLocal(_cv.set(camPos[0], camPos[1], camPos[2]));
      const fold = lp.x > 2.5 && lp.y < 7.5 && Math.hypot(lp.x - 2.2, lp.z) < 12;
      bonnetPivot.rotation.z = fold ? 0 : bonnetK * 1.05;
    },
  };
}

// ---------- the bike ----------
export function buildBike(scene) {
  const root = grp();
  scene.add(root);
  const red = smoothMat(0xd8342b, { roughness: 0.45 });
  const tyre = smoothMat(0x1b1c20, { roughness: 0.9 });
  const steel = metal(0xc0c4ca);
  const R = 1.35;
  const wheels = [];
  for (const x of [2.1, -2.1]) {
    const wg = grp(x, R, 0);
    const t = mesh(new THREE.TorusGeometry(R, 0.12, 8, 28), tyre);
    wg.add(t);
    for (let i = 0; i < 8; i++) {
      const sp = cyl(0.025, 0.025, R * 2, steel, 4, false);
      sp.rotation.z = (i * Math.PI) / 8;
      wg.add(sp);
    }
    root.add(wg);
    wheels.push(wg);
  }
  const tubeR = 0.11;
  const crankP = [0, 1.0, 0];
  const seatP = [-0.9, 3.0, 0];
  const headP = [1.5, 3.1, 0];
  root.add(tube([[-2.1, R, 0], crankP], tubeR, red, 4));
  root.add(tube([crankP, seatP], tubeR, red, 4));
  root.add(tube([seatP, [-2.1, R, 0]], tubeR, red, 4));
  root.add(tube([seatP, headP], tubeR, red, 4));
  root.add(tube([crankP, headP], tubeR, red, 4));
  root.add(tube([headP, [2.1, R, 0]], tubeR, red, 4));
  const seat = bx(1.1, 0.25, 0.5, smoothMat(0x1d1f24));
  seat.position.set(-0.95, 3.25, 0);
  root.add(seat);
  const bar = cyl(0.07, 0.07, 1.8, smoothMat(0x1d1f24), 8);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(1.4, 3.6, 0);
  root.add(bar);
  const stem = cyl(0.08, 0.08, 0.6, steel, 8);
  stem.position.set(1.48, 3.35, 0);
  root.add(stem);
  const crank = grp(...crankP);
  const arm1 = bx(0.12, 0.85, 0.12, steel);
  arm1.position.y = -0.42;
  const arm2 = bx(0.12, 0.85, 0.12, steel);
  arm2.position.y = 0.42;
  const pedalL = bx(0.5, 0.1, 0.35, smoothMat(0x1d1f24));
  pedalL.position.set(0, -0.85, 0.5);
  const pedalR = bx(0.5, 0.1, 0.35, smoothMat(0x1d1f24));
  pedalR.position.set(0, 0.85, -0.5);
  arm1.position.z = 0.35;
  arm2.position.z = -0.35;
  crank.add(arm1, arm2, pedalL, pedalR);
  root.add(crank);
  return {
    root, wheels, crank,
    seatTop: new THREE.Vector3(-0.95, 3.4, 0),
    bars: new THREE.Vector3(1.4, 3.6, 0),
    update(t, s = {}) {
      root.position.set(s.x ?? 0, s.y ?? 0, s.z ?? 0); // y: the kit's one change (a road on a bank)
      root.rotation.y = s.yaw ?? 0;
      const spin = (s.dist ?? 0) / R;
      for (const w of wheels) w.rotation.z = -spin;
      crank.rotation.z = -(s.pedal ?? 0);
    },
  };
}


// a point given in car space (x forward, y up, z to the car's left) in world space, for a car state
// { x, z, yaw } (and the car's scale): where the driver sits, where the bonnet is
export function carToWorld(c, lx, ly, lz, scale = 1) {
  const cy = Math.cos(c.yaw ?? 0), sy = Math.sin(c.yaw ?? 0);
  return [(c.x ?? 0) + (lx * cy + lz * sy) * scale, (c.y ?? 0) + ly * scale, (c.z ?? 0) + (-lx * sy + lz * cy) * scale];
}
// the lead in the driver's seat (the engine build's driver()): spread into his cast state
export function driverOf(c, { carScale = 1, leadScale = 0.68 * carScale } = {}) {
  const p = carToWorld(c, -0.55, 3.25, -1.25, carScale);
  return { pos: [p[0], p[1] + 0.05 * carScale - 1.42 * leadScale + (c.bob || 0), p[2]], yaw: (c.yaw ?? 0) + Math.PI / 2, scale: leadScale, pose: "drive" };
}
