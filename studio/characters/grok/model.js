// Grok: our own design, two variants to pick from (no xAI marks).
//   "visor": a glossy black block, white-glowing eye bars behind a dark visor, a cocky tilted antenna.
//   "orb":   a faceted black sphere with a thin white ring orbiting it and two white eyes.
// The personality is the cheeky one of the cast: smirks and winks.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { piv, clamp, liveCanvas, facet, mixParams } from "../../engine/util.js";

export const meta = {
  id: "grok",
  name: "Grok",
  kind: "agent",
  variants: ["visor", "orb"],
  emotions: ["neutral", "happy", "excited", "proud", "deadpan", "confused", "shock", "smug", "wink", "busted",
    "sheepish", "sleepy", "sincere", "frozen"],
};

// Eye shapes on the visor (canvas): kind, tilt of each eye, lift of each eye
const VISOR = {
  neutral: { kind: "bar", tl: 0, tr: 0, ll: 0, lr: 0 },
  happy: { kind: "arc", tl: 0, tr: 0, ll: 0, lr: 0 },
  excited: { kind: "arc", tl: 0, tr: 0, ll: -6, lr: -6 },
  proud: { kind: "arc", tl: 0.1, tr: -0.1, ll: 0, lr: 0 },
  deadpan: { kind: "line", tl: 0, tr: 0, ll: 4, lr: 4 },
  sleepy: { kind: "line", tl: 0, tr: 0, ll: 12, lr: 12 },
  confused: { kind: "bar", tl: 0.25, tr: -0.05, ll: -4, lr: 6 },
  shock: { kind: "ring", tl: 0, tr: 0, ll: -4, lr: -4 },
  smug: { kind: "bar", tl: -0.05, tr: 0.32, ll: 4, lr: -8 },
  wink: { kind: "wink", tl: 0, tr: 0, ll: 0, lr: 0 },
  busted: { kind: "line", tl: -0.2, tr: -0.2, ll: 6, lr: 6, slide: 30 },
  sheepish: { kind: "bar", tl: -0.25, tr: 0.25, ll: 6, lr: 6 },
  sincere: { kind: "bar", tl: 0.12, tr: -0.12, ll: 0, lr: 0 },
  frozen: { kind: "ring", tl: 0, tr: 0, ll: 0, lr: 0 },
};
const WHITE = "#f4f6ff";

function drawVisor(ctx, eyes, talk, blink) {
  ctx.clearRect(0, 0, 360, 140);
  ctx.strokeStyle = ctx.fillStyle = WHITE;
  ctx.shadowColor = WHITE;
  ctx.shadowBlur = 16;
  ctx.lineCap = "round";
  const slide = eyes.slide || 0;
  for (const [i, cx] of [[0, 112], [1, 248]]) {
    const tilt = i === 0 ? eyes.tl : eyes.tr;
    const lift = (i === 0 ? eyes.ll : eyes.lr) - talk * 6;
    ctx.save();
    ctx.translate(cx + slide, 70 + lift);
    ctx.rotate(tilt);
    const kind = eyes.kind === "wink" ? (i === 1 ? "arc" : "bar") : eyes.kind;
    if (blink < 0.5 && kind !== "line") {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.lineTo(34, 0);
      ctx.stroke();
    } else if (kind === "bar") {
      const h = 26 * Math.max(0.2, blink);
      ctx.beginPath();
      ctx.roundRect(-38, -h / 2, 76, h, h / 2);
      ctx.fill();
    } else if (kind === "arc") {
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(0, 14, 30, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (kind === "line") {
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-36, 0);
      ctx.lineTo(36, 0);
      ctx.stroke();
    } else if (kind === "ring") {
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Orb eyes (3D): w, h, tilt, slide; a wink closes the left eye
const ORB = {
  neutral: { w: 1, h: 1, r: 0, x: 0, wl: 1 },
  happy: { w: 1.1, h: 0.55, r: 0, x: 0, wl: 1 },
  excited: { w: 1.1, h: 1.2, r: 0, x: 0, wl: 1 },
  proud: { w: 1.1, h: 0.6, r: 0.1, x: 0, wl: 1 },
  deadpan: { w: 1.4, h: 0.18, r: 0, x: 0, wl: 1 },
  sleepy: { w: 1.4, h: 0.1, r: 0, x: 0, wl: 1 },
  confused: { w: 1, h: 0.8, r: 0.3, x: 0, wl: 1 },
  shock: { w: 1.25, h: 1.25, r: 0, x: 0, wl: 1 },
  smug: { w: 1.3, h: 0.4, r: 0.22, x: 0, wl: 1 },
  wink: { w: 1, h: 1, r: 0, x: 0, wl: 0.12 },
  busted: { w: 1.4, h: 0.25, r: 0, x: 0.14, wl: 1 },
  sheepish: { w: 1, h: 0.8, r: -0.3, x: 0, wl: 1 },
  sincere: { w: 1, h: 0.9, r: 0, x: 0, wl: 1 },
  frozen: { w: 1.05, h: 1.08, r: 0, x: 0, wl: 1 },
};

export function build(opts = {}) {
  const variant = meta.variants.includes(opts.variant) ? opts.variant : "visor";
  const blackM = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.32, metalness: 0.28 });
  const footM = new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.5, metalness: 0.2 });
  const glowM = new THREE.MeshBasicMaterial({ color: 0xf4f6ff, toneMapped: false });
  const root = piv();
  const body = piv();
  root.add(body);
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.38, 0.78, 2, 0.14), footM);
    foot.castShadow = true;
    foot.position.set(s * 0.48, 0.19, 0.04);
    body.add(foot);
  }
  const top = piv(0, 0.38, 0);
  body.add(top);
  const anchor = piv(0, 0.95, 0);
  top.add(anchor);
  let visor = null, ring = null, orbEyes = null;

  if (variant === "visor") {
    const shell = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.7, 1.6, 3, 0.34), blackM);
    shell.position.set(0, 0.85, 0);
    shell.castShadow = true;
    shell.receiveShadow = true;
    top.add(shell);
    const glass = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.66, 0.08, 2, 0.16), new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.12, metalness: 0.4 }));
    glass.position.set(0, 0.98, 0.79);
    top.add(glass);
    visor = liveCanvas(360, 140);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.63), new THREE.MeshBasicMaterial({ map: visor.tex, transparent: true, toneMapped: false }));
    face.position.set(0, 0.98, 0.835);
    top.add(face);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.2, metalness: 0.9 }));
    rod.position.set(-0.52, 1.95, -0.1);
    rod.rotation.z = 0.38;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glowM);
    tip.position.set(-0.64, 2.25, -0.1);
    top.add(rod, tip);
  } else {
    const ball = new THREE.Mesh(facet(new THREE.IcosahedronGeometry(0.98, 2), 0.02, 7), blackM);
    ball.position.set(0, 0.95, 0);
    ball.castShadow = true;
    ball.receiveShadow = true;
    top.add(ball);
    ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.035, 8, 72), glowM);
    ring.position.set(0, 0.95, 0);
    top.add(ring);
    const eyeGeo = new THREE.CapsuleGeometry(0.08, 0.2, 4, 10);
    orbEyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(eyeGeo, glowM);
      e.position.set(s * 0.3, 1.08, 0.9);
      top.add(e);
      return e;
    });
  }

  let last = "";
  function update(t, s = {}) {
    const talk = clamp(s.talk || 0);
    const blink = s.blink ?? 1;
    if (visor) {
      const from = VISOR[s.from] || VISOR[s.emotion] || VISOR.neutral;
      const to = VISOR[s.emotion] || VISOR.neutral;
      const w = s.mix ?? 1;
      const e = { ...mixParams({ tl: from.tl, tr: from.tr, ll: from.ll, lr: from.lr, slide: from.slide || 0 }, { tl: to.tl, tr: to.tr, ll: to.ll, lr: to.lr, slide: to.slide || 0 }, w), kind: w < 0.5 ? from.kind : to.kind };
      const key = JSON.stringify(e) + Math.round(talk * 10) + Math.round(blink * 4);
      if (key !== last) {
        drawVisor(visor.ctx, e, talk, blink);
        visor.tex.needsUpdate = true;
        last = key;
      }
    }
    if (orbEyes) {
      const from = ORB[s.from] || ORB[s.emotion] || ORB.neutral;
      const to = ORB[s.emotion] || ORB.neutral;
      const e = mixParams(from, to, s.mix ?? 1);
      orbEyes.forEach((m, i) => {
        const sd = i === 0 ? -1 : 1;
        const close = i === 0 ? e.wl : 1;
        m.scale.set(e.w, e.h * blink * close * (1 + talk * 0.15), 1);
        m.rotation.z = sd * e.r;
        m.position.x = sd * 0.3 + e.x;
      });
      ring.rotation.set(1.22 + 0.06 * Math.sin(t * 0.7), t * 0.6, 0.38);
    }
    top.rotation.z = 0.04 * talk * Math.sin(t * 8) + 0.015 * Math.sin(t * 1.1);
    body.position.y = (s.hop || 0) * 0.5 + 0.03 * talk;
    root.rotation.y = (root.userData.baseYaw ?? root.rotation.y) + clamp(s.look || 0, -0.4, 0.4) * 0.5;
  }
  update(0, { emotion: "neutral" });

  return {
    meta,
    root,
    variant,
    anchors: { head: anchor, body: anchor },
    // cu: how much further back an agent close-up stands; the orb's ring (2.9 across) is wider than
    // the body, and at the usual distance it sweeps across the face
    frame: { headWidth: 2.3, headTop: 1.3, chin: -1.3, cu: variant === "orb" ? 1.4 : 1 },
    update,
  };
}
