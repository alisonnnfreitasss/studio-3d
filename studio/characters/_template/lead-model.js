// (an avatar drawing hair, warm brown skin, orange
// pixel-camo short-sleeve shirt with a dark red collar, khaki shorts, sandals, a gold hoop.
import * as THREE from "three";
import { M, box, ico, piv, shade, facet, mulberry32, clamp, lerp, smooth, mixParams } from "../../engine/util.js";

export const meta = {
  id: "lead",
  name: "the lead Pixel",
  kind: "human",
  // outfits: the orange pixel-camo shirt, or a plain red, yellow or orange T-shirt; shorts always black
  variants: ["camo", "tee-red", "tee-yellow", "tee-orange", "tee-blue"],
  emotions: ["neutral", "happy", "excited", "proud", "hopeful", "confused", "shock", "worried", "deadpan", "sheepish",
    "smug", "busted", "sincere", "deflated", "relief", "frozen", "armsOut", "reach", "defensive", "typing", "facepalm"],
};

function shirtTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#df6c36";
  x.fillRect(0, 0, 256, 256);
  const r = mulberry32(41);
  const cols = ["#c4432a", "#f2a062", "#f6c088", "#b0381f", "#ec8746"];
  for (let i = 0; i < 46; i++) {
    x.fillStyle = cols[Math.floor(r() * cols.length)];
    const cx = Math.floor(r() * 16) * 16, cy = Math.floor(r() * 16) * 16;
    const w = (2 + Math.floor(r() * 4)) * 16, h = (1 + Math.floor(r() * 3)) * 16;
    x.fillRect(cx, cy, w, h);
    x.fillRect(cx + 16 * Math.floor(r() * 3 - 1), cy + h, Math.max(16, w - 32), 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// Arms: forward, out, twist, elbow, elbow-in-plane. "rest" resolves per seat.
const A = (f, o, w, e, z = 0) => ({ f, o, w, e, z });
const CHEST = A(1.0, -0.32, 0, 1.75);
const SEATS = {
  keys: { y: 0.56, hip: -1.42, knee: 0.62, rest: A(0.3, 0.18, 0, 0.35) },
  chair: { y: 0.95, hip: -1.42, knee: 1.3, rest: A(0.75, 0.12, 0, 0.85) },
  stand: { y: 1.42, hip: 0, knee: 0, rest: A(0.12, 0.12, 0, 0.12) },
};
// hd: head [pitch, yaw, roll]; tr: torso lean; L/R arms (L = his left); br: brows [raise, tilt
// (+ worried, - cross)]; ey: eye size; el: eyelid (1 open); sm: smile when not talking.
const P = (hd, tr, L, R, br, ey = 1, el = 1, sm = 0) => ({ hd, tr, L, R, br, ey, el, sm });
const POSES = {
  neutral: P([0, 0.06, 0], 0.05, "rest", "rest", [0, 0]),
  happy: P([-0.04, 0.08, 0.06], 0.04, "rest", "rest", [0.04, 0.04], 1.05, 0.85, 1),
  excited: P([-0.08, 0.1, -0.04], 0.02, A(0.85, 0.65, 0, 1.25), A(0.85, 0.65, 0, 1.25), [0.08, 0], 1.15, 1, 1),
  proud: P([-0.12, 0.05, 0], -0.04, CHEST, CHEST, [0.03, -0.04], 1, 0.8, 1),
  hopeful: P([0.04, 0.14, 0.08], 0.14, CHEST, CHEST, [0.05, 0.2], 1.08, 1),
  confused: P([0.02, 0.12, 0.16], 0.04, A(1.05, -0.55, 0, 2.25), "rest", [0.06, -0.14], 1, 1),
  shock: P([0.05, 0.18, 0], 0.12, A(0.9, 0.6, 0, 0.3), "rest", [0.1, 0.18], 1.3, 1),
  worried: P([0.12, 0.12, 0.05], 0.08, A(1.6, 0.2, 0, 2.1), "rest", [0.06, 0.32], 0.95, 0.8),
  deadpan: P([0, 0.04, 0], 0.03, "rest", "rest", [-0.03, 0], 1, 0.5),
  sheepish: P([0.16, 0.06, 0.1], 0.1, A(1.7, 0.45, 0, 2.3), "rest", [0.03, 0.26], 1, 0.7, 1),
  smug: P([-0.08, 0.08, -0.08], -0.02, CHEST, CHEST, [0.02, -0.1], 1, 0.55, 1),
  busted: P([0.1, -0.1, -0.06], 0.06, "rest", "rest", [0.06, 0.2], 1.1, 1),
  sincere: P([0.04, 0.04, 0.06], 0.05, CHEST, "rest", [0.04, 0.2], 1.05, 0.85, 1),
  deflated: P([0.22, 0.05, 0.04], 0.14, A(0.2, 0.1, 0, 0.2), A(0.2, 0.1, 0, 0.2), [-0.02, 0.18], 1, 0.5),
  relief: P([-0.18, 0.1, 0], -0.04, CHEST, CHEST, [0.02, 0.1], 1, 0.4, 1),
  frozen: P([-0.02, 0.16, 0], 0, "rest", "rest", [0.07, 0.14], 1.25, 1),
  armsOut: P([-0.08, 0.06, -0.06], -0.02, A(0.45, 1.25, 0, 0.3), A(0.45, 1.25, 0, 0.3), [0.08, 0.2], 1.25, 1),
  reach: P([-0.04, 0.22, 0], 0.16, A(1.4, 0.2, 0, 0.12), "rest", [0.05, 0.25], 1.1, 1),
  defensive: P([-0.06, 0.16, -0.06], -0.04, A(1.0, -0.25, 0, 1.95), A(0.9, 0.5, 0, 0.9), [0.04, -0.12], 1, 1),
  typing: P([0.14, 0, 0], 0.12, A(1.15, 0.08, 0, 1.05), A(1.15, 0.08, 0, 1.05), [0, 0], 1, 0.85),
  facepalm: P([0.2, 0, 0.04], 0.12, A(1.75, 0.05, 0, 2.35), "rest", [0, 0.2], 1, 0.3),
};

const OUTFITS = {
  camo: { camo: true },
  "tee-red": { color: 0xc8322b },
  "tee-yellow": { color: 0xf1c232 },
  "tee-orange": { color: 0xee7a2b },
  "tee-blue": { color: 0x0075ff },
};

export function build(opts = {}) {
  const seat = SEATS[opts.seat] ? opts.seat : "stand";
  const S = SEATS[seat];
  const variant = OUTFITS[opts.variant] ? opts.variant : "camo";
  const outfit = OUTFITS[variant];
  const skin = M(0xb06a43, { emissive: 0x2a1006, emissiveIntensity: 0.5 });
  const skinD = M(0x8f4f30, { emissive: 0x200a04, emissiveIntensity: 0.4 });
  const hair = M(0x1c1310, { roughness: 1 });
  const shirt = outfit.camo ? M(0xffffff, { map: shirtTexture(), roughness: 0.75 }) : M(outfit.color, { roughness: 0.8 });
  const trim = outfit.camo ? M(0x7a2416, { roughness: 0.8 }) : M(new THREE.Color(outfit.color).multiplyScalar(0.72).getHex(), { roughness: 0.8 });
  const shorts = M(0x1d1e24, { roughness: 0.85 }); // always black
  const sole = M(0x5a3a26, { roughness: 0.7 });
  const gold = M(0xf0b040, { roughness: 0.35, metalness: 0.6, emissive: 0x2b1a00, emissiveIntensity: 0.5 });
  const black = new THREE.MeshBasicMaterial({ color: 0x120a0a });
  const mouthM = new THREE.MeshBasicMaterial({ color: 0x3a0f12, side: THREE.DoubleSide });

  const root = piv();
  const body = piv();
  root.add(body);
  const legs = {};
  for (const s of [-1, 1]) {
    const hip = piv(s * 0.27, 1.42, 0);
    body.add(hip);
    const thigh = box(0.46, 0.66, 0.5, shorts, 13 + s);
    thigh.position.set(0, -0.31, 0);
    hip.add(thigh);
    const knee = piv(0, -0.62, 0);
    hip.add(knee);
    const shin = box(0.3, 0.52, 0.32, skin, 15 + s);
    shin.position.set(0, -0.27, 0);
    knee.add(shin);
    const foot = box(0.34, 0.16, 0.6, skin, 17 + s);
    foot.position.set(0, -0.56, 0.12);
    knee.add(foot);
    const sd = box(0.42, 0.1, 0.72, sole, 19 + s, 0.02);
    sd.position.set(0, -0.66, 0.12);
    knee.add(sd);
    legs[s] = { hip, knee };
  }
  const hips = piv(0, 1.42, 0);
  body.add(hips);
  const torso = piv();
  hips.add(torso);
  const shirtBody = box(1.52, 1.36, 0.94, shirt, 21);
  shirtBody.position.set(0, 0.68, 0);
  torso.add(shirtBody);
  if (outfit.camo) {
    const placket = box(0.08, 1.2, 0.04, trim, 6, 0.01);
    placket.position.set(0, 0.62, 0.48);
    torso.add(placket);
    for (const s of [-1, 1]) {
      const collar = box(0.36, 0.2, 0.1, trim, 8 + s, 0.02);
      collar.position.set(s * 0.22, 1.3, 0.44);
      collar.rotation.z = s * -0.5;
      torso.add(collar);
    }
  } else {
    // crew neckline in a darker shade of the T-shirt
    const neckline = shade(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14), trim));
    neckline.rotation.x = Math.PI / 2;
    neckline.scale.set(1.15, 0.9, 1);
    neckline.position.set(0, 1.37, 0.06);
    torso.add(neckline);
  }
  for (const s of [-1, 1]) {
    const shoulder = box(0.5, 0.34, 0.94, shirt, 31 + s);
    shoulder.position.set(s * 0.84, 1.2, 0);
    torso.add(shoulder);
  }
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = piv(s * 0.98, 1.22, 0);
    torso.add(sh);
    const sleeve = box(0.46, 0.44, 0.5, shirt, 41 + s);
    sleeve.position.set(0, -0.2, 0);
    sh.add(sleeve);
    const upper = box(0.3, 0.42, 0.32, skin, 43 + s);
    upper.position.set(0, -0.52, 0);
    sh.add(upper);
    const elbow = piv(0, -0.72, 0);
    sh.add(elbow);
    const fore = box(0.28, 0.6, 0.3, skin, 51 + s);
    fore.position.set(0, -0.3, 0);
    elbow.add(fore);
    const hand = ico(0.24, 0, skin, 61 + s, 0.12);
    hand.position.set(0, -0.68, 0);
    elbow.add(hand);
    arms[s] = { sh, elbow, hand };
  }
  // props a line can hand him: a phone whose screen lights his face from below
  const phone = piv(0, -0.78, 0.12);
  phone.rotation.set(-1.1, 0, 0);
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.06), new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.4, metalness: 0.3 }));
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.74), new THREE.MeshBasicMaterial({ color: 0xe4dcff, side: THREE.DoubleSide }));
  phoneScreen.position.z = 0.034;
  phone.add(phoneBody, phoneScreen);
  // the screen's glow on his face: a narrow light from in front of his chest, aimed up at the face,
  // so the face is lit from below and the shirt stays out of the cone
  const phoneLight = new THREE.SpotLight(0xd9d2ff, 0, 4.5, 0.42, 0.7, 2);
  phoneLight.position.set(0.1, -1.35, 1.9);
  const phoneAim = new THREE.Object3D();
  phoneAim.position.set(0, 0.05, 0.5);
  phoneLight.target = phoneAim;
  phone.visible = false;
  arms[-1].elbow.add(phone);
  const HOLD_PHONE = A(1.2, -0.14, 0.12, 2.1, 0.12);
  const neck = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.26, 6), skin));
  neck.position.set(0, 1.45, 0);
  torso.add(neck);
  const head = piv(0, 1.48, 0);
  torso.add(head);
  const skull = ico(0.98, 1, skin, 21, 0.06);
  skull.add(phoneLight, phoneAim);
  skull.scale.set(1.04, 1.0, 0.82);
  skull.position.set(0, 0.9, 0);
  head.add(skull);
  // set around and behind the head so the face sits in its lower front and the hair frames it down to
  // the cheeks; small faceted curls all over its surface
  const AF = { y: 1.6, z: -0.6, r: 1.45, sx: 1.12, sy: 0.88, sz: 0.92 };
  const hair2 = M(0x2b1e17, { roughness: 1 });
  const hairMain = ico(AF.r, 2, hair, 71, 0.07);
  hairMain.scale.set(AF.sx, AF.sy, AF.sz);
  hairMain.position.set(0, AF.y, AF.z);
  head.add(hairMain);
  const hb = mulberry32(83);
  const k = AF.r / 1.9; // curls scale with the hair: smaller hair, smaller and fewer curls
  const CURLS = Math.round(110 * k * k);
  for (let i = 0; i < CURLS; i++) {
    // an even spread over the sphere (golden-angle spiral), nudged so it never looks gridded
    const u = (i + 0.5) / CURLS, ph = Math.acos(1 - 2 * u), th = i * 2.39996 + hb() * 0.5;
    const dx = Math.sin(ph) * Math.sin(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.cos(th);
    if (dz > 0.3 && dy < 0.18) continue; // the face side below the hairline stays clear
    if (dy < -0.8) continue; // underneath, never seen
    const rr = (0.24 + hb() * 0.16) * k;
    const b = ico(rr, 0, hb() < 0.45 ? hair2 : hair, 90 + i, 0.08);
    b.position.set(AF.sx * AF.r * dx * 0.96, AF.y + AF.sy * AF.r * dy * 0.96, AF.z + AF.sz * AF.r * dz * 0.96);
    head.add(b);
  }
  // face parts sit on the faceted skull: ray-cast each one onto the surface
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const onFace = (obj, fx, fy, lift = 0.012) => {
    const c = new THREE.Vector3(0, 0.9, 0);
    head.localToWorld(c);
    ray.set(new THREE.Vector3(c.x + fx, c.y + fy, c.z + 4), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(skull, false)[0];
    const n = hit.face.normal.clone().transformDirection(skull.matrixWorld);
    const p = hit.point.clone().addScaledVector(n, lift);
    obj.position.copy(p);
    obj.lookAt(p.clone().add(n));
    root.add(obj);
    head.attach(obj);
    return obj;
  };
  const eyes = [-1, 1].map((s) => onFace(new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), black), s * 0.36, 0.04));
  const brows = [-1, 1].map((s) => onFace(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.075, 0.03), black), s * 0.37, 0.33));
  const nose = onFace(shade(new THREE.Mesh(facet(new THREE.ConeGeometry(0.11, 0.24, 4), 0.01, 3), skinD)), 0, -0.13, 0.08);
  nose.rotateX(Math.PI / 2);
  const mouth = onFace(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mouthM), 0, -0.42, 0.02);
  const smile = onFace(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 16, Math.PI), mouthM), 0, -0.38, 0.03);
  smile.rotateZ(Math.PI);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), gold);
  ring.position.set(1.0, 0.56, 0.12);
  ring.rotation.y = Math.PI / 2;
  head.add(ring);
  const browBase = brows.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));

  // seat the body
  body.position.y = S.y - 1.42;
  for (const s of [-1, 1]) {
    legs[s].hip.rotation.x = S.hip;
    legs[s].hip.rotation.z = seat === "keys" ? s * 0.06 : 0;
    legs[s].knee.rotation.x = S.knee;
  }
  const resolve = (pose) => ({ ...pose, L: pose.L === "rest" ? S.rest : pose.L, R: pose.R === "rest" ? S.rest : pose.R });
  const poseOf = (name) => resolve(POSES[name] || POSES.neutral);
  const EYE_TALL = 1.5;

  function update(t, s = {}) {
    const from = poseOf(s.from || s.emotion || "neutral");
    const to = poseOf(s.emotion || "neutral");
    const pose = mixParams(from, to, s.mix ?? 1);
    const talk = s.talk || 0;
    const still = s.emotion === "frozen";
    torso.rotation.x = pose.tr;
    torso.scale.set(1, 1 + (still ? 0 : Math.sin(t * 2.6) * 0.01), 1);
    const look = clamp(s.look || 0, -0.35, 0.35);
    head.rotation.set(
      pose.hd[0] + 0.05 * talk,
      pose.hd[1] + look + (still ? 0 : 0.03 * Math.sin(t * 0.9)),
      pose.hd[2] + (still ? 0 : 0.025 * Math.sin(t * 1.7)) + 0.02 * talk * Math.sin(t * 11),
    );
    for (const sd of [-1, 1]) {
      const a = sd === 1 ? pose.L : pose.R;
      arms[sd].sh.rotation.set(-a.f, sd * a.w, sd * a.o);
      arms[sd].elbow.rotation.set(-a.e, 0, sd * a.z);
    }
    if (s.emotion === "excited") {
      const w = Math.sin(t * 18) * 0.08;
      arms[1].elbow.rotation.x += w;
      arms[-1].elbow.rotation.x -= w;
    }
    if (s.emotion === "armsOut") {
      const w = Math.sin(t * 13) * 0.04;
      arms[1].sh.rotation.z += w;
      arms[-1].sh.rotation.z -= w;
    }
    // a prop overrides his right arm (arms[-1]) and lights his face
    const holding = s.prop === "phone";
    phone.visible = holding;
    phoneLight.intensity = holding ? 26 : 0;
    if (holding) {
      arms[-1].sh.rotation.set(-HOLD_PHONE.f, -HOLD_PHONE.w, -HOLD_PHONE.o);
      arms[-1].elbow.rotation.set(-HOLD_PHONE.e, 0, -HOLD_PHONE.z);
    }
    if (s.emotion === "typing") {
      arms[1].elbow.rotation.x += 0.07 * Math.max(0, Math.sin(t * 21));
      arms[-1].elbow.rotation.x += 0.07 * Math.max(0, Math.sin(t * 21 + 1.7));
    }
    body.position.y = S.y - 1.42 + (s.emotion === "relief" ? -0.05 : 0) + (s.hop || 0) * 0.35;
    brows.forEach((b, i) => {
      const sd = i === 0 ? -1 : 1;
      b.position.copy(browBase[i].p);
      b.quaternion.copy(browBase[i].q);
      b.position.y += pose.br[0];
      b.rotateZ(-sd * pose.br[1]);
    });
    const blink = s.blink ?? 1;
    eyes.forEach((e) => e.scale.set(pose.ey, pose.ey * EYE_TALL * pose.el * blink, 1));
    const o = clamp(talk * 1.15);
    mouth.scale.set(0.3 + 0.12 * o, 0.07 + 0.34 * o, 1);
    const showSmile = pose.sm > 0.5 && o < 0.08;
    smile.visible = showSmile;
    mouth.visible = !showSmile;
  }
  update(0, { emotion: "neutral" });

  return {
    meta,
    root,
    seat,
    variant,
    // camera anchors: the face centre and the hips
    anchors: { head: skull, body: hips },
    // size for framing: the hair is about 3.25 wide; its top sits 2.0 above the face centre
    frame: { headWidth: 3.25, headTop: 2.0, chin: -0.98 },
    update,
  };
}
