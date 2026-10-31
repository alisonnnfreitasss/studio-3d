// The cast: the lead Pixel (the lead, via the
// engine build's lead.js, unchanged in look) and a second character, the girl (long hair, a
// dress, her own colours), on the same rig so every pose and emotion works on both. Plus ONE pose
// library merged from the earlier builds' pose() functions, and the actions they lacked: carry (an
// object in both hands), worry (hands to head, worried face) and walking along a path with the feet
// planted (walkPath). Deterministic: no Math.random, no clock.
import * as THREE from "three";
import { M, box, ico, piv, shade, facet, mulberry32, clamp, lerp, mixParams } from "./util.js";
import { CAMO } from "./season.js";

export const meta = {
  id: "lead",
  name: "the lead Pixel",
  kind: "human",
  // the lead: the orange pixel-camo shirt, or a plain T-shirt; shorts always black.
  // the girl: a dress in one of four colours.
  variants: ["camo", "tee-red", "tee-yellow", "tee-orange", "tee-blue"],
  girlVariants: ["dress-pink", "dress-yellow", "dress-teal", "dress-purple"],
  emotions: ["neutral", "happy", "excited", "proud", "hopeful", "confused", "shock", "worried", "deadpan", "sheepish",
    "smug", "busted", "sincere", "deflated", "relief", "frozen", "armsOut", "reach", "defensive", "typing", "facepalm"],
};

function shirtTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = CAMO ? CAMO.base : "#df6c36";
  x.fillRect(0, 0, 256, 256);
  const r = mulberry32(41);
  const cols = CAMO ? CAMO.patches : ["#c4432a", "#f2a062", "#f6c088", "#b0381f", "#ec8746"];
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
const A_ = (f, o, w, e, z = 0) => ({ f, o, w, e, z });
const CHEST = A_(1.0, -0.32, 0, 1.75);
const SEATS = {
  keys: { y: 0.56, hip: -1.42, knee: 0.62, rest: A_(0.3, 0.18, 0, 0.35) },
  chair: { y: 0.95, hip: -1.42, knee: 1.3, rest: A_(0.75, 0.12, 0, 0.85) },
  stand: { y: 1.42, hip: 0, knee: 0, rest: A_(0.12, 0.12, 0, 0.12) },
};
// hd: head [pitch, yaw, roll]; tr: torso lean; L/R arms (L = his left); br: brows [raise, tilt
// (+ worried, - cross)]; ey: eye size; el: eyelid (1 open); sm: smile when not talking.
const P = (hd, tr, L, R, br, ey = 1, el = 1, sm = 0) => ({ hd, tr, L, R, br, ey, el, sm });
const EMOTIONS = {
  neutral: P([0, 0.06, 0], 0.05, "rest", "rest", [0, 0]),
  happy: P([-0.04, 0.08, 0.06], 0.04, "rest", "rest", [0.04, 0.04], 1.05, 0.85, 1),
  excited: P([-0.08, 0.1, -0.04], 0.02, A_(0.85, 0.65, 0, 1.25), A_(0.85, 0.65, 0, 1.25), [0.08, 0], 1.15, 1, 1),
  proud: P([-0.12, 0.05, 0], -0.04, CHEST, CHEST, [0.03, -0.04], 1, 0.8, 1),
  hopeful: P([0.04, 0.14, 0.08], 0.14, CHEST, CHEST, [0.05, 0.2], 1.08, 1),
  confused: P([0.02, 0.12, 0.16], 0.04, A_(1.05, -0.55, 0, 2.25), "rest", [0.06, -0.14], 1, 1),
  shock: P([0.05, 0.18, 0], 0.12, A_(0.9, 0.6, 0, 0.3), "rest", [0.1, 0.18], 1.3, 1),
  worried: P([0.12, 0.12, 0.05], 0.08, A_(1.6, 0.2, 0, 2.1), "rest", [0.06, 0.32], 0.95, 0.8),
  deadpan: P([0, 0.04, 0], 0.03, "rest", "rest", [-0.03, 0], 1, 0.5),
  sheepish: P([0.16, 0.06, 0.1], 0.1, A_(1.7, 0.45, 0, 2.3), "rest", [0.03, 0.26], 1, 0.7, 1),
  smug: P([-0.08, 0.08, -0.08], -0.02, CHEST, CHEST, [0.02, -0.1], 1, 0.55, 1),
  busted: P([0.1, -0.1, -0.06], 0.06, "rest", "rest", [0.06, 0.2], 1.1, 1),
  sincere: P([0.04, 0.04, 0.06], 0.05, CHEST, "rest", [0.04, 0.2], 1.05, 0.85, 1),
  deflated: P([0.22, 0.05, 0.04], 0.14, A_(0.2, 0.1, 0, 0.2), A_(0.2, 0.1, 0, 0.2), [-0.02, 0.18], 1, 0.5),
  relief: P([-0.18, 0.1, 0], -0.04, CHEST, CHEST, [0.02, 0.1], 1, 0.4, 1),
  frozen: P([-0.02, 0.16, 0], 0, "rest", "rest", [0.07, 0.14], 1.25, 1),
  armsOut: P([-0.08, 0.06, -0.06], -0.02, A_(0.45, 1.25, 0, 0.3), A_(0.45, 1.25, 0, 0.3), [0.08, 0.2], 1.25, 1),
  reach: P([-0.04, 0.22, 0], 0.16, A_(1.4, 0.2, 0, 0.12), "rest", [0.05, 0.25], 1.1, 1),
  defensive: P([-0.06, 0.16, -0.06], -0.04, A_(1.0, -0.25, 0, 1.95), A_(0.9, 0.5, 0, 0.9), [0.04, -0.12], 1, 1),
  typing: P([0.14, 0, 0], 0.12, A_(1.15, 0.08, 0, 1.05), A_(1.15, 0.08, 0, 1.05), [0, 0], 1, 0.85),
  facepalm: P([0.2, 0, 0.04], 0.12, A_(1.75, 0.05, 0, 2.35), "rest", [0, 0.2], 1, 0.3),
};

const OUTFITS = {
  camo: { camo: true },
  "tee-red": { color: 0xc8322b },
  "tee-yellow": { color: 0xf1c232 },
  "tee-orange": { color: 0xee7a2b },
  "tee-blue": { color: 0x0075ff },
  // the girl's dresses (she wears one colour from collar to hem, with a white collar)
  "dress-pink": { color: 0xe8648e, girl: true },
  "dress-yellow": { color: 0xf1c232, girl: true },
  "dress-teal": { color: 0x23ad9f, girl: true },
  "dress-purple": { color: 0x8a5bd6, girl: true },
};

// build({ kind: "lead" | "girl", variant, seat })
export function build(opts = {}) {
  const girl = opts.kind === "girl" || (OUTFITS[opts.variant] && OUTFITS[opts.variant].girl);
  const seat = SEATS[opts.seat] ? opts.seat : "stand";
  const S = SEATS[seat];
  const variant = OUTFITS[opts.variant] ? opts.variant : girl ? "dress-pink" : "camo";
  const outfit = OUTFITS[variant];
  const skin = girl ? M(0xcf8f62, { emissive: 0x2a1408, emissiveIntensity: 0.45 }) : M(0xb06a43, { emissive: 0x2a1006, emissiveIntensity: 0.5 });
  const skinD = girl ? M(0xb0714a, { emissive: 0x200c04, emissiveIntensity: 0.4 }) : M(0x8f4f30, { emissive: 0x200a04, emissiveIntensity: 0.4 });
  const hair = M(girl ? 0x3b2316 : 0x1c1310, { roughness: 1 });
  const shirt = outfit.camo ? M(0xffffff, { map: shirtTexture(), roughness: 0.75 }) : M(outfit.color, { roughness: 0.8 });
  const trim = outfit.camo ? M(0x7a2416, { roughness: 0.8 }) : girl ? M(0xfaf6ee, { roughness: 0.7 }) : M(new THREE.Color(outfit.color).multiplyScalar(0.72).getHex(), { roughness: 0.8 });
  const shorts = girl ? skin : M(0x1d1e24, { roughness: 0.85 }); // the lead's shorts are always black; her thighs show under the skirt
  const sole = girl ? M(0xc8322b, { roughness: 0.55 }) : M(0x5a3a26, { roughness: 0.7 });
  const footM = girl ? sole : skin; // her shoes are red; his feet are bare in sandals
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
    const thigh = box(girl ? 0.36 : 0.46, 0.66, girl ? 0.38 : 0.5, shorts, 13 + s);
    thigh.position.set(0, -0.31, 0);
    hip.add(thigh);
    const knee = piv(0, -0.62, 0);
    hip.add(knee);
    const shin = box(0.3, 0.52, 0.32, skin, 15 + s);
    shin.position.set(0, -0.27, 0);
    knee.add(shin);
    const foot = box(0.34, 0.16, 0.6, footM, 17 + s);
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
  const shirtBody = box(girl ? 1.36 : 1.52, 1.36, girl ? 0.86 : 0.94, shirt, 21);
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
    // crew neckline in a darker shade of the T-shirt (the girl: a white round collar)
    const neckline = shade(new THREE.Mesh(new THREE.TorusGeometry(0.3, girl ? 0.1 : 0.07, 6, 14), trim));
    neckline.rotation.x = Math.PI / 2;
    neckline.scale.set(1.15, 0.9, 1);
    neckline.position.set(0, 1.37, 0.06);
    torso.add(neckline);
  }
  let skirt = null;
  if (girl) {
    // the skirt hangs from the hips (not the legs), wide enough that the legs swing inside it
    const g = facet(new THREE.CylinderGeometry(0.78, 1.16, 0.98, 12, 1, false), 0.025, 101);
    skirt = shade(new THREE.Mesh(g, shirt));
    skirt.scale.set(1, 1, 0.84);
    skirt.position.set(0, -0.36, 0.02);
    hips.add(skirt);
    const hem = shade(new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.06, 5, 24), trim));
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1, 0.84, 1);
    hem.position.set(0, -0.84, 0.02);
    hips.add(hem);
  }
  for (const s of [-1, 1]) {
    const shoulder = box(girl ? 0.42 : 0.5, 0.34, girl ? 0.86 : 0.94, shirt, 31 + s);
    shoulder.position.set(s * (girl ? 0.76 : 0.84), 1.2, 0);
    torso.add(shoulder);
  }
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = piv(s * (girl ? 0.9 : 0.98), 1.22, 0);
    torso.add(sh);
    const sleeve = box(girl ? 0.44 : 0.46, girl ? 0.36 : 0.44, girl ? 0.46 : 0.5, shirt, 41 + s);
    sleeve.position.set(0, -0.2, 0);
    sh.add(sleeve);
    const upper = box(girl ? 0.26 : 0.3, 0.42, girl ? 0.28 : 0.32, skin, 43 + s);
    upper.position.set(0, -0.52, 0);
    sh.add(upper);
    const elbow = piv(0, -0.72, 0);
    sh.add(elbow);
    const fore = box(girl ? 0.25 : 0.28, 0.6, girl ? 0.27 : 0.3, skin, 51 + s);
    fore.position.set(0, -0.3, 0);
    elbow.add(fore);
    const hand = ico(girl ? 0.22 : 0.24, 0, skin, 61 + s, 0.12);
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
  const HOLD_PHONE = A_(1.2, -0.14, 0.12, 2.1, 0.12);
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
  if (!girl) {
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
  } else {
    // long hair: a crown shell set back so the face stays clear, a fringe above the brows, locks down
    // both sides of the face, a long fall down the back, and a yellow bow
    const crown = ico(1.14, 2, hair, 171, 0.05);
    crown.scale.set(1.04, 0.98, 0.98);
    crown.position.set(0, 1.04, -0.42);
    head.add(crown);
    const fringe = ico(0.62, 1, hair, 172, 0.06);
    fringe.scale.set(1.45, 0.42, 0.62);
    fringe.position.set(0, 1.64, 0.36);
    fringe.rotation.x = 0.28;
    head.add(fringe);
    for (const s of [-1, 1]) {
      const lock = box(0.42, 1.95, 0.5, hair, 173 + s, 0.06);
      lock.position.set(s * 1.0, 0.42, -0.12);
      lock.rotation.z = s * -0.06;
      head.add(lock);
      const tip = ico(0.27, 0, hair, 175 + s, 0.08);
      tip.scale.set(1, 0.7, 1);
      tip.position.set(s * 1.03, -0.58, -0.1);
      head.add(tip);
    }
    const fall = box(2.0, 2.5, 0.62, hair, 177, 0.04);
    fall.position.set(0, 0.2, -0.78);
    head.add(fall);
    const bowM = M(0xf5c518, { roughness: 0.45 });
    const bow = piv(0.78, 1.78, 0.18);
    for (const s of [-1, 1]) {
      const wing = ico(0.24, 0, bowM, 178 + s, 0.05);
      wing.scale.set(1.25, 0.8, 0.5);
      wing.position.set(s * 0.24, 0, 0);
      bow.add(wing);
    }
    bow.add(ico(0.1, 0, bowM, 180, 0.05));
    bow.rotation.set(0.2, 0.3, -0.35);
    head.add(bow);
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
  const brows = [-1, 1].map((s) => onFace(new THREE.Mesh(new THREE.BoxGeometry(girl ? 0.28 : 0.32, girl ? 0.06 : 0.075, 0.03), black), s * 0.37, 0.33));
  const nose = onFace(shade(new THREE.Mesh(facet(new THREE.ConeGeometry(girl ? 0.09 : 0.11, girl ? 0.2 : 0.24, 4), 0.01, 3), skinD)), 0, -0.13, 0.08);
  nose.rotateX(Math.PI / 2);
  const mouth = onFace(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mouthM), 0, -0.42, 0.02);
  const smile = onFace(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 16, Math.PI), mouthM), 0, -0.38, 0.03);
  smile.rotateZ(Math.PI);
  if (girl) {
    // lashes at the outer corner of each eye, and rosy cheeks
    const lashM = black;
    for (const s of [-1, 1]) {
      const lash = onFace(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.02), lashM), s * 0.47, 0.15, 0.02);
      lash.rotateZ(s * 0.6);
      const cheek = onFace(new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0xe88a8a, transparent: true, opacity: 0.55 })), s * 0.56, -0.24, 0.015);
      cheek.renderOrder = 1;
    }
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), gold);
    ring.position.set(1.0, 0.56, 0.12);
    ring.rotation.y = Math.PI / 2;
    head.add(ring);
  }
  const browBase = brows.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  // sweat drops near the face (the engine and roof builds)
  const sweatM = new THREE.MeshStandardMaterial({ color: 0x7fc8ff, roughness: 0.1, emissive: 0x2a6a9a, emissiveIntensity: 0.4 });
  const sweat = [0, 1, 2].map(() => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), sweatM);
    d.visible = false;
    head.add(d);
    return d;
  });

  // seat the body
  body.position.y = S.y - 1.42;
  for (const s of [-1, 1]) {
    legs[s].hip.rotation.x = S.hip;
    legs[s].hip.rotation.z = seat === "keys" ? s * 0.06 : 0;
    legs[s].knee.rotation.x = S.knee;
  }
  const resolve = (pose) => ({ ...pose, L: pose.L === "rest" ? S.rest : pose.L, R: pose.R === "rest" ? S.rest : pose.R });
  const poseOf = (name) => resolve(EMOTIONS[name] || EMOTIONS.neutral);
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
    // sweat: three drops running down beside the face (0..1)
    const sw = s.sweat || 0;
    sweat.forEach((d, i) => {
      d.visible = sw > 0;
      if (!d.visible) return;
      const ph = (t * 0.9 + i * 0.33) % 1;
      const side = i === 1 ? -1 : 1;
      d.position.set(side * (0.92 + 0.05 * i), 1.35 - ph * 0.9 - (i === 2 ? 0.3 : 0), 0.5);
      d.scale.setScalar(sw * (1 - ph * 0.4));
    });
  }
  update(0, { emotion: "neutral" });

  return {
    meta,
    root,
    seat,
    variant,
    kind: girl ? "girl" : "lead",
    // camera anchors: the face centre and the hips
    anchors: { head: skull, body: hips },
    rig: { body, hips, torso, head, legs, arms, S, skirt },
    // the skin materials, so a scene can flush the skin (seasick green, cooked red)
    mats: { skin, skinD },
    // size for framing: the hair is about 3.25 wide; its top sits 2.0 above the face centre
    frame: { headWidth: girl ? 2.4 : 3.25, headTop: girl ? 1.25 : 2.0, chin: -0.98 },
    update,
  };
}

// ===================================================================================================
// The pose library. A pose sets joints on top of the character's own update (which sets the emotion's
// arms and head). Every function is (ch, t, st, h) with h = { A, legs, aim }; st is the cast state, so a
// pose can read its own parameters (walkPh, swing, pedal, turn, stroke, pull, kick, run, aimR, aimL).
// Arms: A(side, forward, out, twist, elbow, elbowInPlane); side 1 = the character's left, -1 his right.
// Sources: sk = skyscraper, en = engine (also microwave, roof), ac = air conditioner, ap = airplane,
// fr = fridge, lb = light bulb, rf = roof; new = added for the kit.
const _tg = new THREE.Vector3();
function aimArm(ch, s, target, elbow = 0.25) {
  // light bulb: point an arm at a world point (the shoulder's local frame, solved in closed form)
  const { rig } = ch;
  ch.root.updateMatrixWorld(true);
  const sh = rig.arms[s].sh;
  _tg.set(...target);
  rig.torso.worldToLocal(_tg);
  _tg.sub(sh.position).normalize();
  const th = Math.asin(clamp(_tg.x, -1, 1));
  const f = Math.atan2(_tg.z, -_tg.y);
  sh.rotation.set(-f, 0, th);
  rig.arms[s].elbow.rotation.set(-elbow, 0, 0);
}
const SIT = (h) => { for (const s of [-1, 1]) h.legs(s, -1.42, 1.3); };
// st.planted (set by walkPath): the hip swings on a near-triangle wave (asin of 0.99 sin), so the foot on
// the ground moves back at an almost constant speed matching the body's (a sine swing runs 65% fast at
// mid-step, this one 14%), with the turnarounds still rounded
const ASIN99 = Math.asin(0.99);
const swing = (ph, planted) => (planted ? Math.asin(0.99 * Math.sin(ph)) / ASIN99 : Math.sin(ph));
const WALK = (ch, t, st, h, k = 1) => {
  const ph = (st.walkPh ?? t) * 7.5;
  for (const s of [-1, 1]) h.legs(s, 0.55 * k * swing(ph + (s > 0 ? 0 : Math.PI), st.planted), 0.35 * k * Math.max(0, Math.sin(ph + (s > 0 ? -1.2 : Math.PI - 1.2))));
  ch.rig.body.position.y += 0.04 * k * Math.abs(Math.sin(ph));
  return ph;
};

export const POSES = {
  // ---- standing gestures ----
  wave: (ch, t, st, { A }) => A(1, 2.6, 0.35, 0, 0.6 + 0.35 * Math.sin(t * 9)), // all
  waveBoth: (ch, t, st, { A }) => { // sk
    A(1, 2.7, 0.4, 0, 0.5 + 0.35 * Math.sin(t * 9));
    A(-1, 2.7, 0.4, 0, 0.5 + 0.35 * Math.sin(t * 9 + 1.5));
  },
  cheer: (ch, t, st, { A }) => { // sk
    const b = 0.12 * Math.sin(t * 10);
    A(1, 2.85 + b, 0.38, 0, 0.25);
    A(-1, 2.85 - b, 0.38, 0, 0.25);
  },
  lift: (ch, t, st, { A }) => { // rf: both arms straight up, holding something overhead
    const w = 0.06 * Math.sin(t * 3);
    A(1, 2.85 + w, 0.35, 0, 0.25);
    A(-1, 2.85 - w, 0.35, 0, 0.25);
  },
  point: (ch, t, st, h) => { // sk (right arm); st.aimR aims it at a world point (lb)
    if (st.aimR) aimArm(ch, -1, st.aimR, 0.1);
    else h.A(-1, 1.55, 0.25, 0, 0.08);
  },
  pointL: (ch, t, st, h) => { // fr (left arm); st.aimL aims it
    if (st.aimL) aimArm(ch, 1, st.aimL, 0.1);
    else h.A(1, 1.5, 0.35, 0, 0.12);
  },
  pointUp: (ch, t, st, { A }) => A(-1, 2.5, 0.3, 0, 0.1), // sk
  shrug: (ch, t, st, { A }) => { A(1, 0.4, 0.9, 0, 1.6); A(-1, 0.4, 0.9, 0, 1.6); }, // all
  handsHips: (ch, t, st, { A }) => { A(1, 0.35, 0.75, 0.6, 1.9); A(-1, 0.35, 0.75, 0.6, 1.9); }, // sk
  headHands: (ch, t, st, { A }) => { A(1, 2.55, 0.55, 0, 2.15); A(-1, 2.55, 0.55, 0, 2.15); }, // en
  hold: (ch, t, st, { A }) => { A(1, 1.0, 0.25, 0, 1.2); A(-1, 1.0, 0.25, 0, 1.2); }, // en, sk
  holdUp: (ch, t, st, { A }) => { A(1, 1.55, 0.45, 0, 0.75); A(-1, 1.55, 0.45, 0, 0.75); }, // en
  pour: (ch, t, st, { A }) => { A(1, 1.15, 0.12, 0, 0.75); A(-1, 1.15, 0.12, 0, 0.75); }, // en
  push: (ch, t, st, { A, legs }) => { // en
    A(1, 1.45, 0.05, 0, 0.12);
    A(-1, 1.45, 0.05, 0, 0.12);
    ch.rig.torso.rotation.x = 0.22 + 0.03 * Math.sin(t * 9);
    for (const s of [-1, 1]) legs(s, s > 0 ? -0.35 : 0.3, s > 0 ? 0.4 : 0.1);
  },
  pull: (ch, t, st, { A }) => { A(1, 1.35, 0.1, 0, 0.35); A(-1, 1.2, 0.2, 0, 0.6); ch.rig.torso.rotation.x = -0.1; }, // fr
  press: (ch, t, st, h) => { // sk (a button, the right hand); st.aimR / st.aimL press at a point (lb)
    if (st.aimR || st.aimL) {
      ch.rig.torso.rotation.x = 0.18;
      if (st.aimL) aimArm(ch, 1, st.aimL, 0.35);
      if (st.aimR) aimArm(ch, -1, st.aimR, 0.35);
    } else h.A(-1, 1.45, -0.1, 0, 0.55 + 0.1 * Math.sin(t * 14));
  },
  pump: (ch, t, st) => { // lb: a pump handle, st.stroke 0..1
    const k = st.stroke ?? 0;
    ch.rig.torso.rotation.x = 0.12 + 0.08 * k;
    ch.rig.body.position.y -= 0.08 * k;
    if (st.aimL) aimArm(ch, 1, st.aimL, 0.5);
    if (st.aimR) aimArm(ch, -1, st.aimR, 0.5);
  },
  reach: (ch, t, st) => { // lb: both hands to world points
    if (st.aimL) aimArm(ch, 1, st.aimL, st.elbowL ?? 0.3);
    if (st.aimR) aimArm(ch, -1, st.aimR, st.elbowR ?? 0.3);
    if (st.twist) { ch.rig.arms[1].sh.rotation.y += st.twist; ch.rig.arms[-1].sh.rotation.y -= st.twist; }
  },
  reachUp: (ch, t, st, { A }) => { A(1, 2.75, 0.22, 0, 0.35); A(-1, 2.6, 0.3, 0, 0.5); ch.rig.torso.rotation.x = -0.06; }, // fr
  touch: (ch, t, st, { A }) => A(-1, 1.4, 0.1, 0, 0.15), // fr
  recoil: (ch, t, st, { A }) => { A(-1, 0.95, 0.15, 0, 2.15); A(1, 0.5, 0.5, 0, 0.6); ch.rig.torso.rotation.x = -0.14; ch.rig.head.rotation.x -= 0.1; }, // fr
  burnt: (ch, t, st, { A }) => { // lb: the burnt hand pulled to the chest, shaking
    const sh = Math.sin(t * 34) * 0.12;
    A(1, 1.45 + sh, 0.25, 0, 2.2);
    ch.rig.torso.rotation.x = -0.06;
  },
  proud: (ch, t, st, { A }) => { A(1, 1.0, -0.3, 0, 1.75); A(-1, 1.0, -0.3, 0, 1.75); }, // lb: arms folded
  idea: (ch, t, st, { A }) => A(-1, 2.35, 0.32, 0, 1.55), // fr: a finger up
  nose: (ch, t, st, { A }) => { // fr: pinching his nose, fanning the smell away
    A(1, 1.55, -0.95, 0, 2.3);
    A(-1, 1.25, 0.55, 0, 1.3 + 0.35 * Math.sin(t * 13));
    ch.rig.head.rotation.x -= 0.12;
    ch.rig.torso.rotation.x = -0.08;
  },
  shiver: (ch, t, st, { A }) => { // fr
    A(1, 1.05, -0.55, 0, 2.2);
    A(-1, 1.05, -0.55, 0, 2.2);
    ch.rig.torso.rotation.z = 0.04 * Math.sin(t * 46);
    ch.rig.torso.rotation.x = 0.1;
    ch.rig.head.rotation.x += 0.18;
  },
  plug: (ch, t, st, { A, legs }) => { // fr: crouched, reaching low
    A(-1, 1.1, 0.1, 0, 0.2);
    A(1, 0.5, 0.3, 0, 0.4);
    ch.rig.torso.rotation.x = 0.42;
    for (const s of [-1, 1]) legs(s, -0.5, 0.75);
    ch.rig.body.position.y -= 0.25;
  },
  scrape: (ch, t, st, { A }) => A(-1, 1.5, 0.05, 0, 0.3 + 0.25 * Math.sin(t * 10)), // fr
  window: (ch, t, st, { A }) => { A(1, 1.1, 0.4, 0, 1.2); A(-1, 0.5, 0.1, 0, 1.0); }, // ap
  overhead: (ch, t, st, { A }) => { A(1, 2.95, 0.32, 0, 0.2); A(-1, 2.95, 0.32, 0, 0.2); }, // ap
  umbrella: (ch, t, st, { A }) => A(-1, 1.05, 0.12, 0.2, 1.05), // rf
  lookUp: (ch) => { ch.rig.head.rotation.x -= 0.35; }, // rf
  sick: (ch, t, st, { A }) => { // sk: hand over the mouth, the other on the belly
    A(1, 2.05, -0.25, 0.3, 2.45);
    A(-1, 0.7, 0.15, 0, 1.8);
    ch.rig.torso.rotation.x = 0.08;
    ch.rig.head.rotation.z += 0.12 * Math.sin(t * 2.2);
  },
  // ---- tools ----
  raise: (ch, t, st, { A }) => { A(-1, 2.95, -0.05, 0, 0.35); A(1, 2.75, -0.35, 0, 0.6); ch.rig.torso.rotation.x = -0.12; }, // sk: a hammer overhead
  smash: (ch, t, st, { A, legs }) => { // sk: swing from overhead to low in front, st.swing 0 (up) to 1 (down)
    const u = clamp(st.swing ?? 1);
    const f = lerp(2.95, 0.75, u * u * (3 - 2 * u));
    A(-1, f, -0.05, 0, lerp(0.35, 0.1, u));
    A(1, f - 0.15, -0.38, 0, lerp(0.6, 0.35, u));
    ch.rig.torso.rotation.x = lerp(-0.12, 0.32, u);
    for (const s of [-1, 1]) legs(s, s > 0 ? -0.25 : 0.2, s > 0 ? 0.35 : 0.1);
  },
  lower: (ch, t, st, { A }) => { A(-1, 0.55, 0.05, 0, 0.15); A(1, 0.5, -0.2, 0, 0.5); }, // sk
  drum: (ch, t, st, { A, legs }) => { // sk: seated, drumming
    const a = Math.sin(t * 17), b = Math.sin(t * 17 + Math.PI);
    A(1, 1.25 + 0.3 * a, 0.35, 0, 1.35 + 0.25 * a);
    A(-1, 1.25 + 0.3 * b, 0.35, 0, 1.35 + 0.25 * b);
    for (const s of [-1, 1]) legs(s, -1.42, 1.3);
    ch.rig.head.rotation.x += 0.08 * Math.sin(t * 17);
  },
  // ---- moving ----
  walk: (ch, t, st, h) => { // sk; st.walkPh (from walkPath) keeps the feet planted
    const ph = WALK(ch, t, st, h);
    h.A(1, 0.35 * Math.sin(ph + Math.PI), 0.1, 0, 0.3);
    h.A(-1, 0.35 * Math.sin(ph), 0.1, 0, 0.3);
  },
  walkPoint: (ch, t, st, h) => { // sk
    const ph = (st.walkPh ?? t) * 7.5;
    for (const s of [-1, 1]) h.legs(s, 0.5 * Math.sin(ph + (s > 0 ? 0 : Math.PI)), 0.3 * Math.max(0, Math.sin(ph + (s > 0 ? -1.2 : Math.PI - 1.2))));
    h.A(1, 0.3 * Math.sin(ph + Math.PI), 0.1, 0, 0.3);
    h.A(-1, 1.6, 0.35, 0, 0.08);
  },
  run: (ch, t, st, { A, legs }) => { // ap; st.run is the phase (walkPath with gait "run" sets it); st.carryUp: arms overhead
    const p = st.run ?? t * 11;
    for (const s of [-1, 1]) {
      const ph = p + (s > 0 ? 0 : Math.PI);
      legs(s, -0.75 * Math.sin(ph), 0.55 + 0.55 * Math.max(0, Math.sin(ph + 1.2)));
    }
    if (!st.carryUp) {
      A(1, 0.7 * Math.sin(p + Math.PI), 0.15, 0, 1.3);
      A(-1, 0.7 * Math.sin(p), 0.15, 0, 1.3);
    } else {
      A(1, 2.95, 0.32, 0, 0.2);
      A(-1, 2.95, 0.32, 0, 0.2);
    }
    ch.rig.torso.rotation.x = 0.22;
    ch.rig.body.position.y += 0.12 * Math.abs(Math.sin(p));
  },
  bike: (ch, t, st, { A, legs }) => { // en; st.pedal
    const p = st.pedal ?? 0;
    for (const s of [-1, 1]) {
      const ph = p + (s > 0 ? 0 : Math.PI);
      legs(s, -1.15 + 0.45 * Math.sin(ph), 1.05 + 0.45 * Math.cos(ph));
    }
    A(1, 1.25, 0.12, 0, 0.45);
    A(-1, 1.25, 0.12, 0, 0.45);
    ch.rig.torso.rotation.x = 0.32;
    ch.rig.head.rotation.x -= 0.25;
  },
  flap: (ch, t, st, { A, legs }) => { // ap: arms beating, face down in the air (set st.pitch)
    const b = Math.sin(t * 15);
    A(1, 0.2, 1.1 + 0.65 * b, 0, 0.15);
    A(-1, 0.2, 1.1 + 0.65 * b, 0, 0.15);
    legs(1, 0.25 + 0.25 * Math.sin(t * 13), 0.4);
    legs(-1, 0.25 - 0.25 * Math.sin(t * 13), 0.4);
  },
  fall: (ch, t, st, { A, legs }) => { // ap
    A(1, 2.6 + 0.3 * Math.sin(t * 17), 0.6, 0, 0.3);
    A(-1, 2.6 + 0.3 * Math.sin(t * 17 + 1.3), 0.6, 0, 0.3);
    legs(1, -0.5 + 0.4 * Math.sin(t * 15), 0.6);
    legs(-1, -0.5 - 0.4 * Math.sin(t * 15), 0.6);
  },
  hang: (ch, t, st, { A, legs }) => { // ap: holding a bar overhead, legs trailing; st.kick
    A(1, 2.95, 0.3, 0, 0.12);
    A(-1, 2.95, 0.3, 0, 0.12);
    const sw = st.kick ? Math.sin(t * 9) * 0.3 : 0;
    legs(1, 0.18 + sw, 0.25);
    legs(-1, 0.18 - sw, 0.25);
    ch.rig.head.rotation.x -= 0.1;
  },
  lie: (ch, t, st, { A }) => { A(1, 0.2, 0.25, 0, 0.3); A(-1, 0.2, 0.25, 0, 0.3); }, // sk (st.lie lays the body down)
  // ---- seated ----
  sit: (ch, t, st, h) => SIT(h), // sk, en: legs only
  sitLap: (ch, t, st, h) => { SIT(h); h.A(1, 0.75, 0.12, 0, 0.9); h.A(-1, 0.75, 0.12, 0, 0.9); }, // ap ("sit"): hands on the lap
  sitRelax: (ch, t, st, h) => { SIT(h); h.A(1, 0.42, 0.42, 0, 0.55); h.A(-1, 0.42, 0.42, 0, 0.55); ch.rig.torso.rotation.x = -0.06; }, // ac
  sitWipe: (ch, t, st, h) => { // ac: wiping his brow
    SIT(h);
    h.A(1, 0.42, 0.42, 0, 0.55);
    h.A(-1, 2.45, 0.62 + 0.18 * Math.sin(t * 7), 0, 2.2);
    ch.rig.head.rotation.z += 0.08;
    ch.rig.torso.rotation.x = 0.04;
  },
  sitFan: (ch, t, st, h) => { SIT(h); h.A(1, 0.42, 0.42, 0, 0.55); h.A(-1, 1.6, 0.25, 0.4, 2.0 + 0.35 * Math.sin(t * 15)); }, // ac
  sitShiver: (ch, t, st, h) => { // ac
    SIT(h);
    h.A(1, 1.05, -0.55, 0, 2.15);
    h.A(-1, 1.15, -0.5, 0, 2.1);
    ch.rig.torso.rotation.z = 0.035 * Math.sin(t * 58);
    ch.rig.torso.rotation.x = 0.12;
    ch.rig.head.rotation.x += 0.12;
  },
  sitRemote: (ch, t, st, h) => { SIT(h); h.A(1, 0.42, 0.42, 0, 0.55); h.A(-1, 1.35, 0.12, 0, 0.35); ch.rig.torso.rotation.x = -0.05; }, // ac
  sitCheer: (ch, t, st, h) => { SIT(h); const w = Math.sin(t * 9) * 0.15; h.A(1, 2.85, 0.42 + w, 0, 0.35); h.A(-1, 2.85, 0.42 - w, 0, 0.35); }, // ac
  sofa: (ch, t, st, h) => { SIT(h); h.A(1, 0.55, 0.3, 0, 0.6); h.A(-1, 0.55, 0.3, 0, 0.6); }, // rf
  drive: (ch, t, st, h) => { // en: hands on the wheel
    for (const s of [-1, 1]) h.legs(s, -1.42, 1.25);
    h.A(1, 1.25, 0.3, 0, 0.55, -0.15);
    h.A(-1, 1.25, 0.3, 0, 0.55, -0.15);
    const steerT = Math.sin(t * 1.6) * 0.06;
    ch.rig.arms[1].sh.rotation.x += steerT;
    ch.rig.arms[-1].sh.rotation.x -= steerT;
  },
  key: (ch, t, st, h) => { // en: turning the key, st.turn 0..1
    for (const s of [-1, 1]) h.legs(s, -1.42, 1.25);
    h.A(1, 1.25, 0.3, 0, 0.55, -0.15);
    h.A(-1, 0.85, 0.05, 0.3, 1.2, 0);
    ch.rig.arms[-1].elbow.rotation.z += Math.sin(clamp(st.turn ?? 0) * Math.PI / 2) * -0.6;
  },
  yoke: (ch, t, st, h) => { // ap: st.pull, st.turn
    SIT(h);
    const pull = st.pull || 0, turn = st.turn || 0;
    h.A(1, 1.25 - 0.25 * pull, 0.18, 0, 0.5 + 0.35 * pull, -0.1 + turn * 0.3);
    h.A(-1, 1.25 - 0.25 * pull, 0.18, 0, 0.5 + 0.35 * pull, -0.1 - turn * 0.3);
    ch.rig.torso.rotation.x = -0.12 * pull;
  },
  slump: (ch, t, st, h) => { // ap
    SIT(h);
    h.A(1, 0.15, 0.12, 0, 0.1);
    h.A(-1, 0.15, 0.12, 0, 0.1);
    ch.rig.torso.rotation.x = 0.22;
    ch.rig.head.rotation.x += 0.3;
    ch.rig.head.rotation.z += 0.22;
  },
  eat: (ch, t, st, h) => { SIT(h); h.A(1, 0.75, 0.12, 0, 0.9); h.A(-1, 0.95 + 0.1 * Math.sin(t * 5), 0.05, 0, 1.75 + 0.15 * Math.sin(t * 5)); }, // ap
  phew: (ch, t, st, h) => { SIT(h); h.A(-1, 2.35, 0.25, 0, 2.35); h.A(1, 0.75, 0.12, 0, 0.9); }, // ap
  // ---- new for the kit ----
  // carry: an object held in front with both hands (the object itself is a cast prop with joint
  // "hands": the stage puts it between the two hands every frame). Walks with st.arms = "carry".
  carry: (ch, t, st, { A }) => {
    A(1, 1.02, -0.32, 0, 1.12);
    A(-1, 1.02, -0.32, 0, 1.12);
    ch.rig.torso.rotation.x = -0.05;
  },
  // carryHigh: a long or heavy object on the shoulders level (a beam, a plank)
  carryHigh: (ch, t, st, { A }) => {
    A(1, 2.1, -0.15, 0, 1.75);
    A(-1, 2.1, -0.15, 0, 1.75);
  },
  // worry: hands to the head, a small fretful rock (its face defaults to "worried")
  worry: (ch, t, st, { A }) => {
    const r = Math.sin(t * 5.5);
    A(1, 2.45, 0.62, 0, 2.2 + 0.08 * r);
    A(-1, 2.45, 0.62, 0, 2.2 - 0.08 * r);
    ch.rig.head.rotation.z += 0.07 * r;
    ch.rig.head.rotation.x += 0.08;
    ch.rig.torso.rotation.x = 0.06;
  },
  // reachOut: one arm stretched toward someone (st.aimR to a world point), up on the toes
  reachOut: (ch, t, st, h) => {
    if (st.aimR) aimArm(ch, -1, st.aimR, 0.06);
    else h.A(-1, 1.45, 0.05, 0, 0.06);
    h.A(1, 0.55, 0.35, 0, 0.5);
    ch.rig.torso.rotation.x = 0.1;
  },
  // hug: both arms forward and round (two characters face to face)
  hug: (ch, t, st, { A }) => { A(1, 1.3, -0.55, 0, 1.25); A(-1, 1.3, -0.55, 0, 1.25); },
};
// the face a pose implies when the state names none
export const POSE_EMOTION = { worry: "worried", cheer: "excited", waveBoth: "happy", sick: "worried", shiver: "worried", burnt: "shock" };
// a reel can add its own poses: addPoses({ name: (ch, t, st, h) => { ... } })
export function addPoses(more) { Object.assign(POSES, more); }

// Apply st.pose, then st.arms (an arm-only pose over the main one, e.g. walking while carrying), then
// the aims (st.aimR / st.aimL for poses that do not consume them).
export function applyPose(ch, st, t) {
  const { rig } = ch;
  const A = (s, f, o, w, e, z = 0) => {
    rig.arms[s].sh.rotation.set(-f, s * w, s * o);
    rig.arms[s].elbow.rotation.set(-e, 0, s * z);
  };
  const legs = (s, hip, knee) => {
    rig.legs[s].hip.rotation.x = hip;
    rig.legs[s].knee.rotation.x = knee;
  };
  const h = { A, legs, aim: (s, target, elbow) => aimArm(ch, s, target, elbow) };
  if (st.pose) {
    const fn = POSES[st.pose];
    if (fn) fn(ch, t, st, h);
    else if (!applyPose._warned?.[st.pose]) { (applyPose._warned ||= {})[st.pose] = 1; console.warn(`pixel: no pose "${st.pose}"`); }
  }
  if (st.arms && POSES[st.arms]) {
    // keep the main pose's legs, torso lean and bounce; take only the arms
    const keep = [rig.legs[1].hip.rotation.x, rig.legs[1].knee.rotation.x, rig.legs[-1].hip.rotation.x, rig.legs[-1].knee.rotation.x, rig.torso.rotation.x, rig.body.position.y];
    POSES[st.arms](ch, t, st, h);
    [rig.legs[1].hip.rotation.x, rig.legs[1].knee.rotation.x, rig.legs[-1].hip.rotation.x, rig.legs[-1].knee.rotation.x, rig.torso.rotation.x, rig.body.position.y] = keep;
  }
}

// ===================================================================================================
// walkPath: a character walking along a polyline over [t0, t1], the feet planted. Position goes by arc
// length on a trapezoid speed profile (eases in and out over `ease` s), the yaw follows the path's
// direction (rounded at corners), and the walk phase is the distance walked divided by the stride, so
// the legs slow with the body and never slide. Returns state fields to spread into a cast state:
// { pos, yaw, pose ("walk" or "run" while moving, null when stopped), walkPh / run, moving }.
//   pts: [[x, z], ...] (y from `y`, default 0) or [[x, y, z], ...]
//   scale: the character's scale (the stride scales with it); stride: 1 = feet exactly planted
//   face: the yaw to turn to after arriving (radians; default: keep the last heading)
// One stride of the walk pose: the hips swing 0.55 rad either way on a 1.28-long leg, so the foot
// travels 2 x 1.28 x sin(0.55) = 1.34 per half cycle: 0.427 units per radian of phase at scale 1
// (run: 0.75 rad, 0.555 per radian).
// the length of a path on the ground (for sizing a walk: earlier builds walked at about 1.3 m/s at scale
// 0.42, legs cycling at 1.2 Hz; up to about 2.5 m/s reads as a brisk walk; faster wants gait "run")
export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; L += Math.hypot(b[0] - a[0], b[b.length - 1] - a[a.length - 1]); }
  return L;
}
// the time a walk along pts takes at `speed` m/s (with the ease in and out)
export const walkTime = (pts, speed = 1.6, ease = 0.35) => pathLength(pts) / speed + ease;
export function walkPath(t, { pts, t0, t1, scale = 0.42, stride = 1, ease = 0.35, y = 0, face = null, gait = "walk", turn = 0.3 }) {
  const P3 = pts.map((p) => (p.length === 3 ? p : [p[0], y, p[1]]));
  const L = [0];
  for (let i = 1; i < P3.length; i++) L.push(L[i - 1] + Math.hypot(P3[i][0] - P3[i - 1][0], P3[i][2] - P3[i - 1][2]));
  const tot = L[L.length - 1];
  const T = Math.max(1e-3, t1 - t0), ea = Math.min(ease, T / 2);
  const vmax = tot / (T - ea);
  const tau = clamp(t - t0, 0, T);
  let s;
  if (tau < ea) s = 0.5 * (vmax / ea) * tau * tau;
  else if (tau > T - ea) { const r = T - tau; s = tot - 0.5 * (vmax / ea) * r * r; }
  else s = 0.5 * vmax * ea + vmax * (tau - ea);
  s = clamp(s, 0, tot);
  const at = (d) => {
    d = clamp(d, 0, tot);
    let i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    const u = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    const a = P3[i - 1], b = P3[i];
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  };
  const pos = at(s);
  // heading: the chord across a short window of path, so corners turn over about 2 x dd of travel
  const dd = Math.max(0.15, 0.8 * scale);
  const a = at(s - dd), b = at(s + dd);
  let yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
  if (face != null && t > t1) {
    // after arriving, turn to `face` over `turn` s (the shorter way round)
    let dy = face - yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = clamp((t - t1) / turn);
    yaw += dy * k * k * (3 - 2 * k);
  }
  const moving = t > t0 && t < t1;
  const perRad = (gait === "run" ? 0.555 : 0.427) * scale * stride;
  const phase = s / perRad;
  const out = { pos, yaw, pose: moving ? gait : null, moving, planted: true };
  if (gait === "run") out.run = phase;
  else out.walkPh = phase / 7.5;
  return out;
}
