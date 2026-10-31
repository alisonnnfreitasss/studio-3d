// Claude: our own design, a rounded orange block with two chunky feet and stub arms. No
// mouth: the eyes do all the acting (tall, flat, square, V, a busted slide to the side).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { M, piv, shade, clamp, mixParams } from "../../engine/util.js";

export const meta = {
  id: "claude",
  name: "Claude",
  kind: "agent",
  emotions: ["neutral", "happy", "excited", "proud", "deadpan", "confused", "shock", "worried", "sheepish", "smug",
    "busted", "sincere", "sleepy", "frozen"],
};

// w, h: eye scale; r: tilt (V shape: tops apart); x: slide toward the side it looks at
const E = (w, h, r = 0, x = 0) => ({ w, h, r, x });
const EYES = {
  neutral: E(1, 1),
  happy: E(1, 0.9),
  excited: E(1.08, 1.1),
  proud: E(1, 0.85),
  deadpan: E(1.95, 0.14),
  confused: E(1.5, 0.47),
  shock: E(1.18, 1.2),
  worried: E(1, 0.95, -0.36),
  sheepish: E(1, 0.95, -0.36),
  smug: E(1.7, 0.3, 0.16),
  busted: E(1.7, 0.2, 0, 0.16),
  sincere: E(1, 0.9),
  sleepy: E(1.9, 0.08),
  frozen: E(1, 1.06),
};
const NO_BLINK = new Set(["deadpan", "busted", "sleepy", "frozen", "smug"]);

export function build(opts = {}) {
  const orange = M(0xe2632f, { roughness: 0.58, emissive: 0x2a0a02, emissiveIntensity: 0.22 });
  const footM = M(0xc9521f, { roughness: 0.72, emissive: 0x3a1004, emissiveIntensity: 0.5 });
  const black = new THREE.MeshBasicMaterial({ color: 0x0c0606 });
  const root = piv();
  const body = piv();
  root.add(body);
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.42, 0.84, 2, 0.14), footM);
    foot.castShadow = true;
    foot.position.set(s * 0.52, 0.21, 0.04);
    body.add(foot);
  }
  const cubeP = piv(0, 0.42, 0);
  body.add(cubeP);
  const cube = shade(new THREE.Mesh(new RoundedBoxGeometry(2.1, 1.85, 1.8, 3, 0.3), orange));
  cube.position.set(0, 0.93, 0);
  cubeP.add(cube);
  for (const s of [-1, 1]) {
    const arm = shade(new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.5, 0.44, 2, 0.12), orange));
    arm.position.set(s * 1.2, 0.86, 0.05);
    cubeP.add(arm);
  }
  const eyeGeo = new RoundedBoxGeometry(0.18, 0.54, 0.04, 2, 0.05);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(eyeGeo, black);
    e.position.set(s * 0.42, 1.06, 0.915);
    cubeP.add(e);
    return e;
  });

  function update(t, s = {}) {
    const from = EYES[s.from] || EYES[s.emotion] || EYES.neutral;
    const to = EYES[s.emotion] || EYES.neutral;
    const e = mixParams(from, to, s.mix ?? 1);
    const talk = s.talk || 0;
    const frozen = s.emotion === "frozen";
    const blink = NO_BLINK.has(s.emotion) ? 1 : s.blink ?? 1;
    const side = (s.look || 0) < 0 ? -1 : 1;
    eyes.forEach((m, i) => {
      const sd = i === 0 ? -1 : 1;
      m.scale.set(e.w, e.h * blink, 1);
      m.rotation.z = sd * e.r;
      m.position.x = sd * 0.42 + side * e.x;
    });
    const lean = clamp(s.lean || 0);
    cubeP.rotation.x = 0.13 * lean + 0.025 * talk;
    cubeP.rotation.z = 0.2 * lean + (frozen ? 0 : 0.05 * talk * Math.sin(t * 7.5) + 0.012 * Math.sin(t * 1.3));
    body.position.y = (s.hop || 0) * 0.5 - (0.04 + 0.08 * lean) * talk + (frozen ? 0 : 0.01 * Math.sin(t * 2.3));
    root.rotation.y = (root.userData.baseYaw ?? root.rotation.y) + clamp(s.look || 0, -0.4, 0.4) * 0.5;
    cube.scale.set(1, 1 - 0.03 * talk, 1);
  }
  update(0, { emotion: "neutral" });

  return {
    meta,
    root,
    anchors: { head: cube, body: cube },
    frame: { headWidth: 2.4, headTop: 0.93, chin: -1.35 },
    update,
  };
}
