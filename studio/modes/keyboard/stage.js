// The keyboard stage shared by the keyboard scenarios: a giant laptop keyboard the cast stands on,
// a wall-size dashboard of agent cards behind them (lines that appear on a word, type themselves
// out or count up, from the episode's script), and the world around the laptop. A look sets the
// sky, the light and the palette; the keys, the screen and the cameras stay the same.
import * as THREE from "three";
import { M, piv, V, lerp, clamp, smooth, easeOut, mulberry32, shade } from "../../engine/util.js";

const T = {
  en: { canvas: (n) => `Main canvas · ${n} agents running`, add: "+ New agent", working: "working", ask: "Ask Claude..." },
  pt: { canvas: (n) => `Canvas principal · ${n} agentes rodando`, add: "+ Novo agente", working: "trabalhando", ask: "Pergunte ao Claude..." },
};
const COLORS = { red: "#ff9a9a", green: "#4ade80", amber: "#ffb04a", bright: "#e3e5ff", dim: "#aeb3ea" };
const DEFAULT_CARDS = (lang) => [
  { col: 0, row: 0, title: "Claude · Docs", bubble: lang === "pt" ? "Escrever o changelog" : "Write the changelog", model: "claude-haiku-5-5", base: 309, lines: [{ text: lang === "pt" ? "Lendo 38 PRs" : "Reading 38 PRs", typed: 38 }] },
  { col: 1, row: 0, span: 2, hero: true, title: "Claude · Code", bubble: lang === "pt" ? "Rodar os testes" : "Run the tests", model: "claude-sonnet-5-5", base: 138, lines: [{ text: lang === "pt" ? "Testes: 214 passando" : "Tests: 214 passing", color: "green", size: 40 }] },
  { col: 0, row: 1, title: "Codex · Review", bubble: lang === "pt" ? "Revisar o PR" : "Review the PR", model: "gpt-codex", base: 381, lines: [{ text: "Diff: 9 files" }] },
  { col: 1, row: 1, span: 2, title: "Grok · Research", bubble: lang === "pt" ? "Achar o próximo tema" : "Find the next topic", model: "grok", base: 412, lines: [{ text: lang === "pt" ? "Lendo 40 vídeos" : "Reading 40 videos" }] },
];

export function makeSkyTexture(o = {}) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 1024;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, c.height);
  for (const [stop, col] of o.sky || [[0, "#030612"], [0.5, "#0a1638"], [1, "#16285e"]]) g.addColorStop(stop, col);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  const r = mulberry32(o.seed ?? 7);
  for (let i = 0; i < (o.stars ?? 420); i++) {
    x.fillStyle = `rgba(230,236,255,${0.25 + r() * 0.75})`;
    x.beginPath();
    x.arc(r() * c.width, r() * c.height * 0.45, 0.6 + r() * 2, 0, Math.PI * 2);
    x.fill();
  }
  let bx = -20;
  while (bx < c.width) {
    const bw = 50 + r() * 120, bh = 200 + r() * 420, by = c.height - bh;
    const tw = o.tower || [9, 12, 32];
    x.fillStyle = `rgb(${tw[0] + r() * 8},${tw[1] + r() * 10},${tw[2] + r() * 18})`;
    x.fillRect(bx, by, bw, bh);
    for (let wy = by + 12; wy < c.height - 8; wy += 17) {
      for (let wx = bx + 8; wx < bx + bw - 10; wx += 14) {
        if (r() < (o.lit ?? 0.46)) {
          x.fillStyle = o.litColor ? o.litColor(r) : `rgba(255,${176 + r() * 60},${86 + r() * 60},${0.6 + r() * 0.4})`;
          x.fillRect(wx, wy, 8, 10);
        }
      }
    }
    bx += bw + 4 + r() * 14;
  }
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  const oc = out.getContext("2d");
  oc.filter = `blur(${o.blur ?? 5}px)`;
  oc.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
export function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const A_YAW = 0.42; // the lead's facing on the keys
export const SLOTS = [
  { p: [3.1, 0.36, 1.0], yaw: -0.45 },
  { p: [5.6, 0.36, -0.9], yaw: -0.72 },
  { p: [0.7, 0.36, 2.6], yaw: -0.15 },
];

// The dashboard: a canvas of agent cards whose lines appear, type out or count up on the episode's
// cues (TL.screen), drawn every frame into a texture. Shared by the keyboard scenarios.
export function makeDashboard(TL = {}) {
  const lang = T[TL.lang] ? TL.lang : "en";
  const UI_W = 2048, UI_H = 1593;
  const uiCanvas = document.createElement("canvas");
  uiCanvas.width = UI_W;
  uiCanvas.height = UI_H;
  const ui = uiCanvas.getContext("2d");
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = UI_W;
  screenCanvas.height = UI_H;
  const sctx = screenCanvas.getContext("2d");
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;
  const cards = (TL.screen && TL.screen.cards) || DEFAULT_CARDS(lang);
  const ptNumber = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === "pt" ? "." : ",");
  function roundRect(x, y, w, h, r) {
    ui.beginPath();
    ui.moveTo(x + r, y);
    ui.arcTo(x + w, y, x + w, y + h, r);
    ui.arcTo(x + w, y + h, x, y + h, r);
    ui.arcTo(x, y + h, x, y, r);
    ui.arcTo(x, y, x + w, y, r);
    ui.closePath();
  }
  const timer = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  function lineText(l, t) {
    let s = typeof l.text === "string" ? l.text : l.text?.[lang] ?? "";
    if (l.count) {
      // "ease": "linear" for a steady timer ("thinking... 38 s"); the default eases out like a tally
      // a counter that ends on a cue (count.end, resolved by the timeline into endT) lasts until it
      const from = l.count.from ?? 0, start = l.fromT ?? 0;
      const dur = l.count.endT != null ? Math.max(0.1, l.count.endT - start) : l.count.dur ?? 1.3, k = (t - start) / dur;
      const v = lerp(from, l.count.to, l.count.ease === "linear" ? clamp(k) : easeOut(k));
      s = s.replace("{n}", ptNumber(v));
    }
    if (l.typed) s = s.slice(0, Math.floor(clamp((t - (l.fromT ?? 0)) * l.typed, 0, s.length)));
    return s;
  }
  function drawDashboard(t, blurPx) {
    const bg = ui.createRadialGradient(UI_W / 2, UI_H * 0.45, 80, UI_W / 2, UI_H * 0.45, UI_W * 0.75);
    bg.addColorStop(0, "#121530");
    bg.addColorStop(1, "#0a0b1a");
    ui.fillStyle = bg;
    ui.fillRect(0, 0, UI_W, UI_H);
    const gx = 200, gw = UI_W - 2 * gx, gy = 250, gap = 30;
    const cellW = (gw - gap * 2) / 3, ch = 470;
    ui.textBaseline = "alphabetic";
    ui.font = '600 34px "Geist"';
    ui.fillStyle = "#8f95d8";
    ui.fillText(T[lang].canvas(Math.max(cards.length, 4)), gx, gy - 58);
    ui.fillStyle = "#3d4280";
    roundRect(gx + gw - 236, gy - 100, 236, 58, 29);
    ui.fill();
    ui.fillStyle = "#c5c9ff";
    ui.font = '600 27px "Geist"';
    ui.fillText(T[lang].add, gx + gw - 204, gy - 61);
    for (const c of cards) {
      const span = c.span || 1;
      const cw = cellW * span + gap * (span - 1);
      const x = gx + c.col * (cellW + gap), y = gy + c.row * (ch + gap);
      ui.fillStyle = c.hero ? "#171a3a" : "#14162f";
      roundRect(x, y, cw, ch, 24);
      ui.fill();
      ui.lineWidth = c.hero ? 3 : 2;
      ui.strokeStyle = c.hero ? "rgba(150,160,255,0.45)" : "rgba(140,150,255,0.18)";
      ui.stroke();
      ui.fillStyle = c.dot || "#4ade80";
      ui.beginPath();
      ui.arc(x + 34, y + 46, 9, 0, Math.PI * 2);
      ui.fill();
      ui.font = '600 31px "Geist"';
      ui.fillStyle = "#dfe2ff";
      ui.fillText(typeof c.title === "string" ? c.title : c.title[lang], x + 56, y + 56);
      const bubble = typeof c.bubble === "string" ? c.bubble : c.bubble?.[lang] ?? "";
      ui.font = '500 23px "Geist"';
      const bw = ui.measureText(bubble).width + 40;
      ui.fillStyle = "#262a58";
      roundRect(x + cw - bw - 22, y + 82, bw, 46, 23);
      ui.fill();
      ui.fillStyle = "#b9bdf4";
      ui.fillText(bubble, x + cw - bw - 2, y + 113);
      let ly = y + 196;
      for (const l of c.lines || []) {
        if (l.fromT != null && t < l.fromT) continue;
        if (l.untilT != null && t >= l.untilT) continue;
        const s = lineText(l, t);
        if (!s) continue;
        const px = l.size || 30;
        ui.font = `${l.weight || (px > 30 ? 600 : 500)} ${px}px "Geist Mono"`;
        ui.fillStyle = COLORS[l.color] || l.color || COLORS.dim;
        ui.fillText("› " + s, x + 30, ly);
        ly += px * 1.45;
      }
      ui.font = '500 23px "Geist Mono"';
      ui.fillStyle = "#7c82c4";
      ui.fillText(`${T[lang].working} · ${timer((c.base || 100) + t * 7)}`, x + 30, y + ch - 108);
      ui.fillStyle = "#1c1f40";
      roundRect(x + 22, y + ch - 84, cw - 44, 60, 15);
      ui.fill();
      ui.font = '500 23px "Geist"';
      ui.fillStyle = "#6f75b8";
      ui.fillText(T[lang].ask, x + 44, y + ch - 45);
      ui.font = '500 19px "Geist Mono"';
      const mw = ui.measureText(c.model || "").width + 26;
      ui.fillStyle = "#2b2f63";
      roundRect(x + cw - mw - 82, y + ch - 73, mw, 38, 19);
      ui.fill();
      ui.fillStyle = "#a8adf0";
      ui.fillText(c.model || "", x + cw - mw - 69, y + ch - 47);
      ui.fillStyle = "#ff5c5c";
      ui.beginPath();
      ui.arc(x + cw - 48, y + ch - 54, 12, 0, Math.PI * 2);
      ui.fill();
    }
    sctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";
    sctx.clearRect(0, 0, UI_W, UI_H);
    sctx.drawImage(uiCanvas, 0, 0);
    screenTex.needsUpdate = true;
  }

  return { tex: screenTex, draw: drawDashboard, W: UI_W, H: UI_H };
}

export function keyboardStage(ctx, look) {
  const { scene, renderer, cast, lead, agents, TL = {}, scales = {} } = ctx;
  const lang = T[TL.lang] ? TL.lang : "en";
  renderer.toneMappingExposure = look.exposure ?? 1.0;
  scene.background = new THREE.Color(look.background ?? 0x06060e);
  scene.fog = new THREE.Fog(...(look.fog || [0x090a1c, 70, 170]));

  scene.add(new THREE.HemisphereLight(...(look.hemi || [0x8a86e8, 0x1a1030, 0.6])));
  const key = new THREE.DirectionalLight(...(look.key || [0xffa25c, 4.8]));
  key.position.set(-9, 11, 10);
  key.target.position.set(0, 1.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(...(look.rim || [0x8a6bff, 1.4]));
  rim.position.set(7, 8, -12);
  scene.add(rim);
  const screenGlow = new THREE.PointLight(...(look.screenGlow || [0x5c7cff, 170]), 40, 2);
  screenGlow.position.set(0, 7.5, -6);
  scene.add(screenGlow);
  const faceLight = new THREE.PointLight(...(look.faceLight || [0xffb27a, 46]), 7, 2);
  scene.add(faceLight);

  const { tex: screenTex, draw: drawDashboard } = makeDashboard(TL);

  // the set
  const deck = new THREE.Mesh(new THREE.BoxGeometry(48, 0.8, 26), M(look.deck ?? 0x14162c, { roughness: 0.9 }));
  deck.position.set(0, -0.4, 1.5);
  deck.receiveShadow = true;
  scene.add(deck);
  const keyMats = (look.keys || [0x1d2046, 0x1a1d40, 0x22264f]).map((c) => M(c, { roughness: 0.6 }));
  const keyGeo = new THREE.BoxGeometry(1.78, 0.36, 1.78);
  const kr = mulberry32(31);
  for (let row = 0; row < 5; row++) {
    const z = -7.6 + row * 2.05, off = (row % 2) * 0.6;
    for (let x = -21 + off; x <= 21; x += 2.05) {
      const k = shade(new THREE.Mesh(keyGeo, keyMats[Math.floor(kr() * 3)]));
      k.position.set(x, 0.18, z);
      scene.add(k);
    }
  }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), new THREE.MeshStandardMaterial({ color: 0x15123a, emissive: 0x8d80ff, emissiveIntensity: 0.16, roughness: 0.4 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.005, 7.6);
  scene.add(pad);
  const SCREEN_W = 24.3, SCREEN_H = 18.9;
  const screenGroup = piv(0, 0, -9.4);
  screenGroup.rotation.x = -0.09;
  scene.add(screenGroup);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.9, SCREEN_H + 0.9, 0.5), M(0x0b0c18, { roughness: 0.55 }));
  bezel.position.set(0, SCREEN_H / 2 + 0.45, -0.3);
  screenGroup.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, SCREEN_H / 2 + 0.45, 0);
  screenGroup.add(screen);
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(62, 62, 80, 64, 1, true), new THREE.MeshBasicMaterial({ map: makeSkyTexture(look.sky), side: THREE.BackSide, fog: false, toneMapped: false, color: look.skyTint ?? 0xffffff }));
  sky.position.set(0, 30, -4);
  scene.add(sky);
  const dotTex = makeDotTexture();
  const dust = [];
  const dr = mulberry32(99);
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: look.dust ?? 0xffe3b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.18 + dr() * 0.4 }));
    const size = 0.05 + dr() * 0.13;
    s.scale.set(size, size, size);
    s.userData = { x: -9 + dr() * 18, y: 0.6 + dr() * 9, z: -5 + dr() * 9, ph: dr() * 6.28, sp: 0.15 + dr() * 0.3 };
    scene.add(s);
    dust.push(s);
  }

  // place the cast
  if (lead && cast[lead]) {
    cast[lead].root.position.set(-3.3, 0, 1.15);
    cast[lead].root.rotation.y = A_YAW;
    cast[lead].root.userData.baseYaw = A_YAW;
  }
  agents.forEach((id, i) => {
    const slot = SLOTS[i % SLOTS.length];
    const r = cast[id].root;
    r.scale.setScalar(scales[id] ?? 1);
    r.position.set(...slot.p);
    r.rotation.y = slot.yaw;
    r.userData.baseYaw = slot.yaw;
  });

  const head = (id) => cast[id].anchors.head.getWorldPosition(V());
  const facing = (yaw) => [V(Math.sin(yaw), 0, Math.cos(yaw)), V(-Math.cos(yaw), 0, Math.sin(yaw))];
  function update(t, cam) {
    if (lead && cast[lead]) {
      const H = head(lead), [f, r] = facing(A_YAW);
      faceLight.position.set(H.x + r.x * 1.8 + f.x * 3.0, H.y + 0.9, H.z + r.z * 1.8 + f.z * 3.0);
    }
    for (const s of dust) {
      const u = s.userData;
      s.position.set(u.x + Math.sin(t * u.sp + u.ph) * 0.35, u.y + ((t * u.sp * 0.35 + u.ph) % 1.6) * 0.5, u.z + Math.cos(t * u.sp * 0.8 + u.ph) * 0.3);
    }
    drawDashboard(t, cam?.screenBlur ?? 2);
  }
  return { update };
}
