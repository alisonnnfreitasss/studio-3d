// Codex: our own design, a charcoal terminal block on four short legs, with a glowing face
// drawn like a prompt: an eye glyph and a blinking cursor. Not the other account's cloud.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { piv, clamp, liveCanvas } from "../../engine/util.js";

export const meta = {
  id: "codex",
  name: "Codex",
  kind: "agent",
  emotions: ["neutral", "happy", "excited", "proud", "deadpan", "confused", "shock", "busted", "sheepish", "smug",
    "sleepy", "sincere", "frozen"],
};

// eye glyph per emotion; the cursor "_" stays and pulses while talking
const GLYPH = {
  neutral: ">", happy: "^", excited: "^", proud: "^", deadpan: "-", sleepy: "-", confused: "?", shock: "o",
  busted: "<", sheepish: "<", smug: ">", sincere: ">", frozen: "o",
};
const CYAN = "#5ee6ff";

function drawFace(ctx, glyph, t, talk, emotion) {
  ctx.clearRect(0, 0, 320, 216);
  ctx.strokeStyle = ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (glyph === ">") { ctx.moveTo(70, 62); ctx.lineTo(118, 96); ctx.lineTo(70, 130); }
  else if (glyph === "<") { ctx.moveTo(118, 62); ctx.lineTo(70, 96); ctx.lineTo(118, 130); }
  else if (glyph === "^") { ctx.moveTo(62, 116); ctx.lineTo(94, 76); ctx.lineTo(126, 116); }
  else if (glyph === "-") { ctx.moveTo(62, 100); ctx.lineTo(126, 100); }
  else if (glyph === "o") { ctx.arc(94, 96, 30, 0, Math.PI * 2); }
  else if (glyph === "?") {
    ctx.arc(94, 78, 22, Math.PI * 1.1, Math.PI * 2.25);
    ctx.lineTo(94, 112);
    ctx.moveTo(94, 136);
    ctx.lineTo(94, 137);
  }
  ctx.stroke();
  const on = talk > 0.05 || emotion === "frozen" || Math.floor(t * 2.2) % 2 === 0;
  if (emotion === "smug") {
    ctx.beginPath();
    ctx.moveTo(176, 118);
    ctx.quadraticCurveTo(216, 140, 258, 112);
    ctx.stroke();
  } else if (on) {
    ctx.fillRect(176, 122 - 26 * talk, 82, 16 + 26 * talk);
  }
}

export function build(opts = {}) {
  const shellM = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.45, metalness: 0.2 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x080b11, roughness: 0.25, metalness: 0.1 });
  const root = piv();
  const body = piv();
  root.add(body);
  for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.4, 0.3, 2, 0.08), shellM);
    leg.position.set(x, 0.2, z);
    leg.castShadow = true;
    body.add(leg);
  }
  const boxP = piv(0, 0.38, 0);
  body.add(boxP);
  const shell = new THREE.Mesh(new RoundedBoxGeometry(1.95, 1.5, 1.6, 3, 0.24), shellM);
  shell.position.set(0, 0.75, 0);
  shell.castShadow = true;
  shell.receiveShadow = true;
  boxP.add(shell);
  const panel = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.08, 0.08, 2, 0.12), darkM);
  panel.position.set(0, 0.78, 0.79);
  boxP.add(panel);
  const face = liveCanvas(320, 216);
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0125), new THREE.MeshBasicMaterial({ map: face.tex, transparent: true, toneMapped: false }));
  faceMesh.position.set(0, 0.78, 0.84);
  boxP.add(faceMesh);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), shellM);
  antenna.position.set(0.55, 1.75, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5ee6ff, toneMapped: false }));
  tip.position.set(0.55, 2.02, 0);
  boxP.add(antenna, tip);
  const anchor = piv(0, 0.78, 0);
  boxP.add(anchor);

  let last = "";
  function update(t, s = {}) {
    const talk = clamp((s.talk || 0) * 1.2);
    const emotion = (s.mix ?? 1) < 0.5 ? s.from || s.emotion : s.emotion;
    const glyph = GLYPH[emotion] || ">";
    const key = `${glyph}|${emotion}|${Math.round(talk * 20)}|${Math.floor(t * 2.2) % 2}`;
    if (key !== last) {
      drawFace(face.ctx, glyph, t, talk, emotion);
      face.tex.needsUpdate = true;
      last = key;
    }
    boxP.rotation.z = 0.03 * talk * Math.sin(t * 9);
    body.position.y = 0.04 * talk + (s.hop || 0) * 0.45;
    root.rotation.y = (root.userData.baseYaw ?? root.rotation.y) + clamp(s.look || 0, -0.4, 0.4) * 0.5;
  }
  update(0, { emotion: "neutral" });

  return {
    meta,
    root,
    anchors: { head: anchor, body: anchor },
    frame: { headWidth: 2.2, headTop: 1.25, chin: -1.2 },
    update,
  };
}
