// The text layer: everything on top of the 3D, as DOM, posed per frame from the frame state. One layer
// merged from the earlier builds' overlay.js (the union of every type any reel used), at phone size:
// measured against the reference at 720 wide (De4oWvEh06y at 45, 53.5, 40 and 145.5 s), their pills
// carry about 31 px text in a 200 x 50 px pill, their name tags about 48 px, their badges about 85 px,
// their end call to action 34 px over 66 px; the kit's were 17, 30, 46 and 24 over 50, so pills, tags,
// badges and gadgets are about twice the old size. One-word captions measured the same as theirs (50 px)
// and stay. Every label is kept inside the frame (14 px margin) and starts with a capital letter (his
// rule): the layer capitalises the first letter of every text it draws. No watermark or brand text:
// the old "wm" type is gone and ignored.
// Items carry an id; an element is made the first time an id shows up and reused after.
import * as THREE from "three";
import { clamp, easeOut, easeIn, pop, popSS } from "./kit.js";

const W = 720, H = 1280, MARGIN = 14;
export const DOT = { red: "#e53935", blue: "#2f8fe0", yellow: "#f2b321", green: "#2fae63", grey: "#7d828a", purple: "#8a4fd6", orange: "#f26a1b", pink: "#e8648e" };

// gadgets drawn at their old pixel sizes are scaled up as a whole (crisp: Chrome rasterises text at the
// final transform); pills, tags, badges, arrows, captions and the call to action are restyled instead
const BASE = { dial: 1.15, gauge: 1.15, card: 1.25, chips: 1, speedo: 1.35, counter: 1.35, thermo: 1.4, energy: 1.3, snow: 1.35, clock: 1.35,
  phase: 1.3, pgauge: 1.35, wtherm: 1.35, bill: 1.3, cal: 1.35, tempGraph: 1.25, timer: 1, readout: 1, thermoPanel: 1, num: 1, bubble: 1 };

const css = `
.ov { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform, opacity; z-index: 2; }
.ov.tint { z-index: 1; }
.ov.cap, .ov.cta { z-index: 4; }
.cap { font-family: Montserrat, sans-serif; font-weight: 800; font-size: 50px; letter-spacing: -0.005em; color: #fff;
  -webkit-text-stroke: 9px #15161a; paint-order: stroke fill; text-shadow: 0 4px 10px rgba(0,0,0,0.35); white-space: nowrap; }
.cap.hi { color: #ffd21f; }
.pill { display: flex; align-items: center; gap: 9px; background: #fff; border-radius: 999px; padding: 8px 19px 8px 14px;
  font: 800 32px/1 Montserrat, sans-serif; letter-spacing: 0.01em; color: #15161a; white-space: nowrap;
  border: 4px solid var(--c); box-shadow: 0 4px 10px rgba(0,0,0,0.25); }
.pill i { width: 15px; height: 15px; border-radius: 50%; background: var(--c); display: block; flex: none; }
.tag { font-family: Montserrat, sans-serif; font-weight: 900; font-size: 52px; letter-spacing: 0.01em; color: #ffd21f;
  -webkit-text-stroke: 9px #3a2208; paint-order: stroke fill; text-shadow: 0 4px 0 #3a2208, 0 8px 14px rgba(0,0,0,0.3); white-space: nowrap; }
.badge { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  border: 6px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
.badge.x { background: #e53935; } .badge.ok { background: #2fae63; }
.badge svg { width: 42px; height: 42px; }
.hdr { font-family: Montserrat, sans-serif; font-weight: 900; font-size: 74px; letter-spacing: -0.01em; color: var(--c);
  -webkit-text-stroke: 12px #fff; paint-order: stroke fill; text-shadow: 0 6px 0 rgba(0,0,0,0.18), 0 10px 18px rgba(0,0,0,0.25); white-space: nowrap; }
.chips { display: flex; gap: 10px; }
.chip { font-family: Montserrat, sans-serif; font-weight: 800; font-size: 24px; padding: 9px 16px; border-radius: 999px;
  background: #f4efe6; color: #2a2a2e; box-shadow: 0 2px 6px rgba(0,0,0,0.18); white-space: nowrap; }
.chip.on { color: #fff; background: var(--c); }
.dial { width: 250px; height: 250px; border-radius: 50%; background: #fff; box-shadow: 0 6px 18px rgba(0,0,0,0.3); position: relative; }
.dial svg { position: absolute; inset: 10px; width: 230px; height: 230px; }
.gauge { width: 290px; height: 170px; position: relative; }
.card { background: #fff; border-radius: 22px; padding: 18px 24px; display: flex; gap: 22px; box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
.card .ring { width: 56px; height: 56px; position: relative; flex: none; }
.card .ring svg { width: 56px; height: 56px; }
.card .ring b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 800 17px Montserrat, sans-serif; color: #2a2a2e; }
.card .lab { font: 800 20px/1.15 Montserrat, sans-serif; color: #2a2a2e; }
.card .lab span { display: block; font-weight: 800; color: #9a9da4; }
.card .on span { color: #f26a1b; }
.card .item { display: flex; align-items: center; gap: 10px; }
.cardtitle { font: 800 19px Montserrat, sans-serif; color: #fff; -webkit-text-stroke: 4px #15161a; paint-order: stroke fill; white-space: nowrap; }
.onom { font-family: Montserrat, sans-serif; font-weight: 900; font-size: 58px; color: #fff; -webkit-text-stroke: 10px #15161a; paint-order: stroke fill; white-space: nowrap; }
.qq { font-family: Montserrat, sans-serif; font-weight: 900; font-size: 64px; color: #fff; -webkit-text-stroke: 10px #15161a; paint-order: stroke fill; white-space: nowrap; }
.cta { text-align: center; font-family: Montserrat, sans-serif; font-weight: 900; color: #fff; -webkit-text-stroke: 8px #15161a; paint-order: stroke fill; white-space: nowrap; }
.cta .s, .cta .b { display: table; margin: 0 auto; }
.cta .s { font-size: 34px; } .cta .s:empty { display: none; } .cta .b { font-size: 66px; color: #ffd21f; line-height: 1.05; -webkit-text-stroke-width: 10px; }
.split-line { position: absolute; left: 0; width: 720px; height: 5px; background: #fff; }
.split-line.v { width: 5px; height: 1280px; top: 0; }
.arrow svg { overflow: visible; }
.num { width: 60px; height: 60px; border-radius: 50%; background: #fff; color: #2a2a2e; display: flex; align-items: center; justify-content: center;
  font: 900 30px Montserrat, sans-serif; box-shadow: 0 3px 8px rgba(0,0,0,0.28); }
.num.on { background: #f26a1b; color: #fff; }
.label { font: 800 28px Montserrat, sans-serif; color: #fff; -webkit-text-stroke: 6px #15161a; paint-order: stroke fill; white-space: nowrap; }
.full { width: 720px; height: 1280px; }
.full svg { position: absolute; left: 0; top: 0; overflow: visible; }
.rw { width: 720px; height: 1280px; }
.rw .lines { position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(255,255,255,0.0) 0px, rgba(255,255,255,0.0) 34px, rgba(255,255,255,0.55) 35px, rgba(255,255,255,0.0) 38px); }
.rw svg.tri { position: absolute; left: 290px; top: 300px; width: 140px; height: 90px; overflow: visible; }
.rw i { position: absolute; height: 4px; background: rgba(255,255,255,0.85); border-radius: 2px; display: block; }
.icon { width: 80px; height: 80px; }
.icon svg { width: 80px; height: 80px; overflow: visible; }
.rwchip { width: 100px; height: 70px; border-radius: 16px; background: rgba(28,30,36,0.82); display: flex; align-items: center; justify-content: center; }
.neq { font-family: Montserrat, sans-serif; font-weight: 900; font-size: 96px; color: #e53935; -webkit-text-stroke: 10px #fff; paint-order: stroke fill; }
.speedo { width: 200px; height: 138px; background: #fff; border-radius: 22px; box-shadow: 0 6px 16px rgba(0,0,0,0.28); position: relative; }
.speedo svg { position: absolute; left: 10px; top: 8px; width: 180px; height: 110px; }
.speedo b { position: absolute; left: 0; right: 0; bottom: 9px; text-align: center; font: 900 15px Montserrat, sans-serif; color: #2a2a2e; letter-spacing: 0.04em; }
.tintbox { width: 720px; height: 1280px; }
.timer { display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 999px; padding: 9px 20px 9px 13px;
  font: 900 32px Montserrat, sans-serif; color: #15161a; box-shadow: 0 3px 10px rgba(0,0,0,0.25); white-space: nowrap; }
.timer svg { width: 34px; height: 34px; }
.readout { background: #15181e; border-radius: 12px; padding: 8px 18px 6px; font: 900 34px Montserrat, sans-serif; color: #5fd8ff;
  border-bottom: 8px solid #e53935; box-shadow: 0 4px 10px rgba(0,0,0,0.35); white-space: nowrap; }
.counter { background: #fff; border-radius: 16px; padding: 6px 18px 7px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.25); min-width: 150px; }
.counter b { display: block; font: 900 40px/1 Montserrat, sans-serif; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; }
.counter span { display: block; font: 800 12px Montserrat, sans-serif; color: #7a7f88; letter-spacing: 0.06em; margin-top: 3px; }
.thermo { width: 74px; height: 176px; background: #fff; border-radius: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); position: relative; }
.thermo svg { position: absolute; left: 0; top: 0; }
.tpanel { width: 132px; height: 430px; border-radius: 22px; background: rgba(18,20,30,0.82); box-shadow: 0 6px 18px rgba(0,0,0,0.35); position: relative; }
.tpanel .read { position: absolute; left: 0; right: 0; top: 14px; text-align: center; font: 900 25px Montserrat, sans-serif; color: #fff; white-space: nowrap; }
.tpanel .tube { position: absolute; left: 70px; top: 66px; width: 22px; height: 300px; border-radius: 11px; background: rgba(255,255,255,0.16); border: 3px solid rgba(255,255,255,0.75); overflow: hidden; }
.tpanel .fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(#ff5a4a, #d81f1f); }
.tpanel .bulbt { position: absolute; left: 60px; top: 352px; width: 42px; height: 42px; border-radius: 50%; background: #e02424; border: 3px solid rgba(255,255,255,0.8); box-shadow: 0 0 14px rgba(255,60,40,0.6); }
.tpanel .tick { position: absolute; left: 10px; width: 52px; text-align: right; font: 800 14px Montserrat, sans-serif; color: rgba(255,255,255,0.85); }
.tpanel .tick::after { content: ""; position: absolute; right: -8px; top: 8px; width: 6px; height: 2px; background: rgba(255,255,255,0.8); }
.shard { position: absolute; left: 0; top: 0; }
.melt { width: 720px; height: 1280px; position: relative; overflow: hidden; background: radial-gradient(ellipse at 50% 40%, #6a0d0d 0%, #2a0606 55%, #120303 100%); }
.melt .read { position: absolute; left: 0; right: 0; top: 70px; text-align: center; font: 900 66px Montserrat, sans-serif; color: #ffcf3a; -webkit-text-stroke: 8px #3a0a04; paint-order: stroke fill; white-space: nowrap; }
.melt .grid { position: absolute; left: 34px; top: 190px; width: 652px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.melt .tile { height: 196px; border-radius: 18px; background: rgba(20,8,8,0.78); border: 3px solid rgba(255,255,255,0.22); position: relative; }
.melt .tile b { position: absolute; left: 0; right: 0; top: 12px; text-align: center; font: 900 22px Montserrat, sans-serif; color: #fff; letter-spacing: 0.02em; }
.melt .tile i { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; font: 800 20px Montserrat, sans-serif; color: rgba(255,255,255,0.8); font-style: normal; }
.melt .tile svg { position: absolute; left: 50%; top: 44px; width: 120px; height: 110px; margin-left: -60px; overflow: visible; }
.melt .fire { position: absolute; left: 0; bottom: 0; width: 720px; height: 330px; }
.bubble { position: relative; padding: 16px 26px; border-radius: 28px; font: 900 32px/1.15 Montserrat, sans-serif; text-align: center; white-space: nowrap; box-shadow: 0 5px 12px rgba(0,0,0,0.3); }
.bubble.speech { background: #fff; color: #17181c; border: 4px solid #17181c; }
.bubble.yay { background: #ffd21f; color: #d8261c; border: 5px solid #8a2a10; font-size: 38px; border-radius: 44px; }
.bubble.aww { background: #e7e9ee; color: #4a4f5a; border: 4px solid #4a4f5a; font-size: 34px; border-radius: 44px; }
.bubble .tail { position: absolute; left: 50%; bottom: -22px; width: 0; height: 0; margin-left: -16px; border-left: 16px solid transparent; border-right: 16px solid transparent; border-top: 24px solid var(--tc); }
.energy { width: 430px; background: #fff; border-radius: 20px; padding: 14px 18px 16px; box-shadow: 0 6px 16px rgba(0,0,0,0.3); }
.energy .t { font: 900 17px Montserrat, sans-serif; color: #2a2a2e; text-align: center; letter-spacing: 0.03em; margin-bottom: 9px; }
.energy .bar { height: 42px; border-radius: 12px; background: #e9e9ec; position: relative; overflow: hidden; }
.energy .h { position: absolute; left: 0; top: 0; bottom: 0; background: #e33a3a; display: flex; align-items: center; justify-content: center; font: 900 19px Montserrat, sans-serif; color: #fff; white-space: nowrap; overflow: hidden; }
.energy .l { position: absolute; top: 0; bottom: 0; background: #ffd21f; }
.energy .lt { text-align: right; font: 900 15px Montserrat, sans-serif; color: #c99a00; margin-top: 6px; height: 18px; }
.snow { width: 66px; height: 66px; border-radius: 50%; background: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; }
.clock { width: 64px; height: 64px; border-radius: 50%; background: #fff; border: 4px solid #2a2d33; box-shadow: 0 3px 8px rgba(0,0,0,0.25); }
.phase { background: #fff; border-radius: 18px; border: 3px solid #2f8fe0; padding: 10px 16px; box-shadow: 0 5px 14px rgba(0,0,0,0.25); }
.pgauge { width: 128px; background: #fff; border-radius: 18px; border: 3px solid #2a2d33; box-shadow: 0 5px 14px rgba(0,0,0,0.25); padding: 8px 8px 6px; text-align: center; }
.pgauge b { display: block; font: 900 20px Montserrat, sans-serif; margin-top: -2px; }
.wtherm { width: 74px; height: 190px; background: #fff; border-radius: 16px; box-shadow: 0 5px 14px rgba(0,0,0,0.25); position: relative; }
.bill { width: 250px; background: #fffdf6; border-radius: 6px; box-shadow: 0 8px 20px rgba(0,0,0,0.3); overflow: hidden; }
.bill .hd { background: #ffd21f; font: 900 22px Montserrat, sans-serif; color: #2a2208; padding: 10px 16px; letter-spacing: 0.02em; }
.bill .ln { height: 9px; background: #d9d9de; border-radius: 5px; margin: 12px 18px 0; }
.bill .amt { font: 900 50px Montserrat, sans-serif; color: #e53935; padding: 10px 18px 14px; text-align: right; }
.boom { width: 330px; height: 300px; }
.cal { width: 92px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 12px rgba(0,0,0,0.3); text-align: center; }
.cal .m { background: #e53935; color: #fff; font: 900 20px Montserrat, sans-serif; padding: 5px 0; }
.cal .ic { width: 34px; height: 34px; margin: 12px auto 14px; background: #8fd0ff; border-radius: 7px; box-shadow: inset -6px -6px 0 rgba(47,143,224,0.45); transform: rotate(10deg); }
.tgraph { width: 400px; background: #fff; border-radius: 18px; border: 3px solid #2f8fe0; box-shadow: 0 5px 14px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 12px; padding: 10px 14px; }
.tgraph .tv { font: 900 34px Montserrat, sans-serif; color: #2a2d33; white-space: nowrap; }
.tgraph .chip2 { display: inline-block; font: 900 14px Montserrat, sans-serif; color: #fff; padding: 4px 10px; border-radius: 999px; margin-top: 4px; }
`;

const X_SVG = `<svg viewBox="0 0 24 24"><path d="M5 5 L19 19 M19 5 L5 19" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg>`;
const OK_SVG = `<svg viewBox="0 0 24 24"><path d="M4 12.5 L10 18 L20 6" stroke="#fff" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SNOW_SVG = `<svg viewBox="-20 -20 40 40" width="46" height="46"><g stroke="#2f8fe0" stroke-width="3.4" stroke-linecap="round" fill="none">${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><line x1="0" y1="-15" x2="0" y2="15"/><path d="M-4 -11 L0 -7 L4 -11 M-4 11 L0 7 L4 11"/></g>`).join("")}</g></svg>`;
// the transport icons (theirs: pause while a fix is built, play on the naming line, fast-forward while time
// passes): white glyphs with a dark outline, drawn in an 80 x 80 box
const ICONS = {
  pause: `<rect x="14" y="10" width="18" height="60" rx="5"/><rect x="48" y="10" width="18" height="60" rx="5"/>`,
  play: `<path d="M20 9 L70 40 L20 71 Z"/>`,
  ffwd: `<path d="M6 14 L40 40 L6 66 Z"/><path d="M40 14 L74 40 L40 66 Z"/>`,
  rew: `<path d="M74 14 L40 40 L74 66 Z"/><path d="M40 14 L6 40 L40 66 Z"/>`,
};
const REW_SVG = `<svg viewBox="0 0 40 24" width="60" height="36"><path d="M19 2 L3 12 L19 22 Z M37 2 L21 12 L37 22 Z" fill="#fff"/></svg>`;
function burst(n, r0, r1, rot = 0) {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + rot, r = i % 2 ? r0 : r1;
    d += (i ? "L" : "M") + (165 + r * Math.cos(a)).toFixed(1) + " " + (150 + r * Math.sin(a)).toFixed(1) + " ";
  }
  return d + "Z";
}

// every on-screen label starts with a capital letter. Plain text: the first letter after any
// leading punctuation (a quote, a dash). HTML: the first letter outside the tags.
export function cap1(s) {
  if (s == null) return "";
  return String(s).replace(/^((?:<[^>]*>|[^\p{L}\p{N}<])*)(\p{Ll})/u, (m, a, b) => a + b.toLocaleUpperCase());
}

// ---------------------------------------------------------------------------------------------------
// Item constructors (a direction builds its overlays with these; every item is { type, id, t0, t1, ... }).
// at: a THREE.Vector3 or Object3D (a world anchor, projected through view `view`, default 0), [x, y, z]
// (a world point) or [x, y] (frame pixels from the top left). dx, dy nudge in pixels.
export const ov = {
  pill: (id, text, color, t0, t1, at, o = {}) => ({ type: "pill", id, text, color, t0, t1, at, ...o }),
  tag: (id, text, t0, t1, at, o = {}) => ({ type: "tag", id, text, t0, t1, at, ...o }),
  badge: (id, kind, t0, t1, at, o = {}) => ({ type: "badge", id, kind, t0, t1, at, ...o }),
  arrow: (id, t0, t1, at, o = {}) => ({ type: "arrow", id, t0, t1, at, ...o }),
  dim: (id, t0, t1, a, b, o = {}) => ({ type: "dim", id, t0, t1, a, b, ...o }),
  onom: (id, text, t0, t1, at, o = {}) => ({ type: "onom", id, text, t0, t1, at, ...o }),
  bubble: (id, text, t0, t1, at, o = {}) => ({ type: "bubble", id, text, t0, t1, at, ...o }),
  num: (id, n, t0, t1, at, o = {}) => ({ type: "num", id, n, t0, t1, at, ...o }),
  label: (id, text, t0, t1, at, o = {}) => ({ type: "label", id, text, t0, t1, at, ...o }),
  cta: (id, small, big, t0, at, o = {}) => ({ type: "cta", id, small, big, t0, t1: o.t1 ?? 1e9, at, ...o }),
  rewind: (id, t0, t1, o = {}) => ({ type: "rewind", id, t0, t1, ...o }),
  icon: (id, kind, t0, t1, o = {}) => ({ type: "icon", id, kind, t0, t1, ...o }),
  line: (id, t0, t1, y, o = {}) => ({ type: "line", id, t0, t1, y, ...o }),
  item: (type, id, t0, t1, o = {}) => ({ type, id, t0, t1, ...o }),
};

// createOverlay(root, { types }): types adds or replaces renderers: { name: (it, api) => void }, where api
// = { el, place, anchorXY, project, cap1, t, s, o, views, W, H }; a renderer makes its element with
// api.el(id, make) and poses it with api.place(e, x, y, scale, rot, opacity, ax, ay, keepIn).
export function createOverlay(root, opts = {}) {
  // a mirrored render (window.__MIRROR, set before the stage loads): the stage flips the 3D canvas, and this
  // layer mirrors where world-anchored labels sit (and the fixed direction of world-anchored arrows), while
  // the text itself and the frame-pixel items (icons, captions, comment ask) stay as they are
  const MIR = !!(typeof window !== "undefined" && window.__MIRROR);
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
  root.appendChild(layer);
  const els = new Map();
  const tmp = new THREE.Vector3();
  const custom = opts.types || {};
  let warnedWm = false;

  let curAvoid = "1";
  function el(id, make) {
    let e = els.get(id);
    if (!e) {
      e = make();
      e.classList.add("ov");
      e.dataset.ovid = id;
      layer.appendChild(e);
      els.set(id, e);
    }
    e.dataset.capAvoid = curAvoid;
    return e;
  }

  // world point -> pixel in the frame, for a view {camera, rect:[x,y,w,h] in fractions}
  function project(p, view) {
    tmp.copy(p).project(view.camera);
    const [rx, ry, rw, rh] = view.rect;
    const x = (rx + (tmp.x * 0.5 + 0.5) * rw) * W;
    return { x: MIR ? W - x : x, y: (ry + (0.5 - tmp.y * 0.5) * rh) * H, behind: tmp.z > 1 };
  }

  // scale: a number, or { sx, sy } (the spring pop's squash and stretch). The element scales about its
  // anchor point (ax, ay), and with keepIn it is pushed inside the frame by its scaled size.
  // the active one-word caption's box (drawn first each frame): labels kept in the frame also keep off it
  let capBox = null;
  function place(e, x, y, scale = 1, rot = 0, opacity = 1, ax = 0.5, ay = 0.5, keepIn = false) {
    e.style.display = "";
    const w = e.offsetWidth, h = e.offsetHeight;
    const sx = typeof scale === "number" ? scale : scale.sx, sy = typeof scale === "number" ? scale : scale.sy;
    if (keepIn) {
      // keepIn: true (the element's own size) or a number (its final scale): the clamp uses the final
      // size, never the popping one, so a label does not slide while it pops in
      const k = keepIn === true ? 1 : keepIn;
      x = Math.min(Math.max(x, MARGIN + w * k * ax), W - MARGIN - w * k * (1 - ax));
      y = Math.min(Math.max(y, MARGIN + h * k * ay), H - MARGIN - h * k * (1 - ay));
      // a label that would sit on the caption moves up to just above it
      if (capBox && e.dataset.cap !== "1" && e.dataset.capAvoid !== "0") {
        const x0 = x - w * k * ax, x1 = x0 + w * k, y0 = y - h * k * ay, y1 = y0 + h * k;
        if (x1 > capBox.x0 && x0 < capBox.x1 && y1 > capBox.y0 && y0 < capBox.y1) y = capBox.y0 - 8 - h * k * (1 - ay);
      }
    }
    e.style.transformOrigin = `${(ax * 100).toFixed(1)}% ${(ay * 100).toFixed(1)}%`;
    e.style.transform = `translate(${(x - w * ax).toFixed(1)}px, ${(y - h * ay).toFixed(1)}px) rotate(${rot}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    e.style.opacity = clamp(opacity).toFixed(3);
  }

  function anchorXY(item, views) {
    const at = item.at;
    if (Array.isArray(at) && at.length === 2) return { x: at[0] + (item.dx || 0), y: at[1] + (item.dy || 0), behind: false };
    const v = views[item.view ?? 0] || views[0];
    const p = Array.isArray(at) ? tmp.set(at[0], at[1], at[2]).clone() : at.isVector3 ? at : at.getWorldPosition(new THREE.Vector3());
    const q = project(p, v);
    return { x: q.x + (MIR ? -1 : 1) * (item.dx || 0), y: q.y + (item.dy || 0), behind: q.behind, world: true };
  }

  // shrink a one-line element's font so it fits the frame width
  function fit(e, base, maxW = W - 2 * MARGIN - 10) {
    e.style.fontSize = base + "px";
    const w = e.offsetWidth;
    if (w > maxW) e.style.fontSize = Math.floor((base * maxW) / w) + "px";
  }

  function update(t, frame, views) {
    const seen = new Set();
    capBox = null;
    // the caption first, so the labels after it can keep off it
    const items = [...(frame.overlays || [])].sort((a, b) => (a.type === "cap" ? 0 : 1) - (b.type === "cap" ? 0 : 1));
    for (const it of items) {
      if (t < it.t0 || t >= it.t1) continue;
      if (it.type === "wm") { if (!warnedWm) { warnedWm = true; console.warn("overlay: watermarks are not part of the kit; ignored"); } continue; }
      seen.add(it.id);
      // theirs: labels pop in over 3 frames and shrink out over 4 (FRAMES.md, 61 and 42 cases); popStyle
      // "spring" uses the motion research's squash-and-stretch pop instead (D-motion.md, technique 4)
      const out = it.t1 - t < 0.13 ? easeOut((it.t1 - t) / 0.13) : 1;
      let s;
      if (it.noPop) s = 1;
      else if (it.popStyle === "spring") {
        const p = popSS(t, it.t0);
        s = typeof p === "number" ? p * out : { sx: p.s * p.sx * out, sy: p.s * p.sy * out };
      } else s = pop(t, it.t0, it.popD ?? 0.1) * out;
      const sn = typeof s === "number" ? s : s.sy;
      const sc = (k) => (typeof s === "number" ? s * k : { sx: s.sx * k, sy: s.sy * k });
      const o = it.t1 - t < 0.13 ? clamp((it.t1 - t) / 0.13) : 1;
      const keep = it.keepIn !== false;
      let e;
      curAvoid = it.capAvoid === false ? "0" : "1";
      const anchored = () => {
        const a = anchorXY(it, views);
        if (a.behind) return null;
        return a;
      };
      if (custom[it.type]) {
        custom[it.type](it, { el, place, anchorXY, project, cap1, t, s, o, views, W, H, fit });
        continue;
      }
      switch (it.type) {
        case "cap": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov cap" + (it.hi ? " hi" : "");
          const txt = cap1(it.text);
          if (e.textContent !== txt) e.textContent = txt;
          fit(e, it.size ?? 50);
          const k = 1 + 0.08 * (1 - easeOut((t - it.t0) / 0.12));
          e.dataset.cap = "1";
          place(e, W / 2, it.y ?? 870, k);
          const cw = e.offsetWidth, ch = e.offsetHeight, cy = it.y ?? 870;
          capBox = { x0: W / 2 - cw / 2 - 10, x1: W / 2 + cw / 2 + 10, y0: cy - ch / 2 - 4, y1: cy + ch / 2 + 4 };
          break;
        }
        case "pill": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "pill";
            d.innerHTML = `<i></i><span></span>`;
            return d;
          });
          e.style.setProperty("--c", DOT[it.color] || it.color || DOT.grey);
          e.lastChild.textContent = cap1(it.text);
          if (it.size) e.style.fontSize = it.size + "px";
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(it.scale ?? 1), it.rot ?? 0, o, 0.5, 0.5, keep && (it.scale ?? 1));
          break;
        }
        case "tag": {
          // the name tag: tilted yellow with a dark outline; size is the font size in px (default 52),
          // shrunk to fit the frame width
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov tag";
          e.textContent = cap1(it.text);
          const size = it.size ?? 52;
          fit(e, size);
          e.style.webkitTextStrokeWidth = (Math.max(5, parseFloat(e.style.fontSize) * 0.17)).toFixed(1) + "px";
          e.style.color = it.color || "";
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, s, it.rot ?? -4, o, 0.5, 0.5, keep);
          break;
        }
        case "badge": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov badge " + (it.kind === "ok" ? "ok" : "x");
          e.innerHTML = it.kind === "ok" ? OK_SVG : X_SVG;
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(it.scale ?? 1), 0, o, 0.5, 0.5, keep && (it.scale ?? 1));
          break;
        }
        case "hdr": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov hdr";
          e.style.setProperty("--c", it.color);
          e.textContent = cap1(it.text);
          fit(e, it.size ?? 74);
          place(e, it.at[0], it.at[1], s, it.rot ?? 0, o, 0.5, 0.5, keep);
          break;
        }
        case "chips": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "chips";
            d.innerHTML = it.items.map((c) => `<div class="chip" style="--c:${c.color}">${cap1(c.text)}</div>`).join("");
            return d;
          });
          [...e.children].forEach((c, i) => c.classList.toggle("on", i === it.active));
          place(e, it.at[0], it.at[1], BASE.chips, 0, o * clamp((t - it.t0) / 0.2), 0.5, 0.5, keep);
          break;
        }
        case "dial": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "dial";
            const q = it.items;
            const arc = (i) => {
              const a0 = -Math.PI / 2 + (i * Math.PI) / 2, a1 = a0 + Math.PI / 2;
              const r = 115, c = 115;
              return `M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`;
            };
            const lab = (i) => {
              const a = -Math.PI / 2 + (i + 0.5) * (Math.PI / 2), r = 64;
              return `<text x="${115 + r * Math.cos(a)}" y="${115 + r * Math.sin(a) - 4}" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="22" fill="#fff">${i + 1}</text>
                <text x="${115 + r * Math.cos(a)}" y="${115 + r * Math.sin(a) + 18}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="16" fill="#fff">${cap1(q[i].text)}</text>`;
            };
            d.innerHTML = `<svg viewBox="0 0 230 230">${q.map((c, i) => `<path class="q" data-i="${i}" d="${arc(i)}" fill="${c.color}"/>`).join("")}
              <line x1="0" y1="115" x2="230" y2="115" stroke="#fff" stroke-width="4"/><line x1="115" y1="0" x2="115" y2="230" stroke="#fff" stroke-width="4"/>
              ${q.map((c, i) => lab(i)).join("")}
              <line class="needle" x1="115" y1="115" x2="115" y2="22" stroke="#222" stroke-width="7" stroke-linecap="round"/>
              <circle cx="115" cy="115" r="11" fill="#222"/></svg>`;
            return d;
          });
          e.querySelectorAll("path.q").forEach((p, i) => p.setAttribute("opacity", i === it.active ? 1 : 0.42));
          e.querySelector(".needle").setAttribute("transform", `rotate(${it.angle} 115 115)`);
          place(e, it.at[0], it.at[1], sc(BASE.dial), 0, o, 0.5, 0.5, keep && BASE.dial);
          break;
        }
        case "gauge": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "gauge";
            const R = 120, cx = 145, cy = 150;
            const seg = (a0, a1, col) => {
              const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
              return `<path d="M${p0[0]},${p0[1]} A${R},${R} 0 0 1 ${p1[0]},${p1[1]}" stroke="${col}" stroke-width="22" fill="none"/>`;
            };
            d.innerHTML = `<svg viewBox="0 0 290 170" width="290" height="170">
              <path d="M10,150 A135,135 0 0 1 280,150 Z" fill="#fff"/>
              ${seg(Math.PI, Math.PI * 1.42, "#2f8fe0")}${seg(Math.PI * 1.42, Math.PI * 1.66, "#2fae63")}${seg(Math.PI * 1.66, Math.PI * 2, "#e53935")}
              <text x="34" y="164" font-family="Montserrat" font-weight="900" font-size="22" fill="#222">${it.lo ?? "C"}</text>
              <text x="240" y="164" font-family="Montserrat" font-weight="900" font-size="22" fill="#222">${it.hi ?? "H"}</text>
              <line class="needle" x1="145" y1="150" x2="145" y2="52" stroke="#222" stroke-width="7" stroke-linecap="round"/>
              <circle cx="145" cy="150" r="13" fill="#222"/></svg>`;
            return d;
          });
          e.querySelector(".needle").setAttribute("transform", `rotate(${it.angle} 145 150)`);
          place(e, it.at[0], it.at[1], sc(BASE.gauge), 0, o, 0.5, 0.5, keep && BASE.gauge);
          break;
        }
        case "card": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.innerHTML = `<div class="cardtitle">${cap1(it.title)}</div><div class="card" style="margin-top:6px">${it.items.map((c, i) => `
              <div class="item" data-i="${i}"><div class="ring"><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="23" stroke="#e7e7ea" stroke-width="6" fill="none"/>
              <circle class="arc" cx="28" cy="28" r="23" stroke="${c.color}" stroke-width="6" fill="none" stroke-dasharray="144.5" stroke-dashoffset="144.5" transform="rotate(-90 28 28)" stroke-linecap="round"/></svg><b>${c.n}</b></div>
              <div class="lab">${cap1(c.a)}<span>${cap1(c.b)}</span></div></div>`).join("")}</div>`;
            return d;
          });
          e.querySelectorAll(".item").forEach((itm, i) => {
            const on = i === it.active;
            itm.querySelector(".lab").classList.toggle("on", on && i === 1);
            itm.querySelector(".arc").setAttribute("stroke-dashoffset", on ? (144.5 * (1 - it.progress)).toFixed(1) : "144.5");
          });
          place(e, it.at[0], it.at[1], BASE.card, 0, o * clamp((t - it.t0) / 0.2), 0.5, 0, keep && BASE.card);
          break;
        }
        case "onom": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov onom";
          e.textContent = cap1(it.text);
          fit(e, it.size ?? 58);
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          const shake = Math.sin(t * 60) * 2.5;
          place(e, a.x + shake, a.y, s, it.rot ?? -3, o, 0.5, 0.5, keep);
          break;
        }
        case "qq": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov qq";
          e.innerHTML = `<span>?</span> <span>?</span> <span>?</span>`;
          [...e.children].forEach((c, i) => {
            const k = pop(t, it.t0 + i * 0.12, 0.25);
            c.style.display = "inline-block";
            c.style.transform = `translateY(${(Math.sin(t * 5 + i * 1.7) * 6).toFixed(1)}px) scale(${k.toFixed(3)}) rotate(${(i - 1) * 12}deg)`;
          });
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, 1, 0, o, 0.5, 0.5, keep);
          break;
        }
        case "cta": {
          // the comment ask: a small line over a big yellow keyword (theirs, stacked two at the end)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "cta";
            d.innerHTML = `<div class="s"></div><div class="b"></div>`;
            return d;
          });
          e.children[0].textContent = cap1(it.small || "");
          e.children[1].textContent = cap1(it.big);
          fit(e.children[0], it.size ?? 34);
          fit(e.children[1], it.bigSize ?? 66);
          place(e, it.at[0], it.at[1], s, 0, o, 0.5, 0, keep);
          break;
        }
        case "num": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov num" + (it.on ? " on" : "");
          e.textContent = String(it.n);
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(it.on ? 1.12 : 1), 0, o, 0.5, 0.5, keep);
          break;
        }
        case "label": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov label";
          e.textContent = cap1(it.text);
          if (it.size) e.style.fontSize = it.size + "px";
          const a = anchorXY(it, views);
          place(e, a.x, a.y, 1, 0, o, it.ax ?? 0, it.ay ?? 0, keep);
          break;
        }
        case "neq": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov neq";
          e.textContent = "≠";
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, s, 0, o, 0.5, 0.5, keep);
          break;
        }
        case "dim": {
          // a dimension line between two anchors with end ticks and a label (theirs: "QUASE 2 m")
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "full"; return d; });
          const A = anchorXY({ at: it.a, view: it.view }, views), Bp = anchorXY({ at: it.b, view: it.view }, views);
          const grow = easeOut(clamp((t - it.t0) / 0.3));
          const bx = A.x + (Bp.x - A.x) * grow, by = A.y + (Bp.y - A.y) * grow;
          const ang = Math.atan2(Bp.y - A.y, Bp.x - A.x), nx = -Math.sin(ang) * 18, ny = Math.cos(ang) * 18;
          const col = it.color || "#ffd21f";
          const lx = (A.x + Bp.x) / 2 + (it.ldx ?? 0), ly = (A.y + Bp.y) / 2 + (it.ldy ?? 40);
          const tick = (x, y) => `<line x1="${(x - nx).toFixed(1)}" y1="${(y - ny).toFixed(1)}" x2="${(x + nx).toFixed(1)}" y2="${(y + ny).toFixed(1)}"/>`;
          e.innerHTML = `<svg width="720" height="1280"><g stroke="#2a1a06" stroke-width="13" stroke-linecap="round">
            <line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>${tick(A.x, A.y)}${grow > 0.98 ? tick(Bp.x, Bp.y) : ""}</g>
            <g stroke="${col}" stroke-width="7" stroke-linecap="round"><line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>${tick(A.x, A.y)}${grow > 0.98 ? tick(Bp.x, Bp.y) : ""}</g>
            ${it.text ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="${it.size ?? 40}" fill="${col}" stroke="#2a1a06" stroke-width="9" paint-order="stroke" opacity="${clamp((t - it.t0 - 0.2) / 0.1)}">${cap1(it.text)}</text>` : ""}</svg>`;
          e.style.display = "";
          e.style.transform = "translate(0px, 0px)";
          e.style.opacity = o.toFixed(3);
          break;
        }
        case "rw": case "rew": case "rewind": {
          // the rewind: style "scan" (white double triangle and scan lines over the frame, skyscraper),
          // "streaks" (lines racing across, airplane "rw") or "chip" (a small dark chip, fridge "rew")
          const style = it.style || (it.type === "rw" ? "streaks" : it.type === "rew" ? "chip" : "scan");
          if (style === "chip") {
            e = el(it.id, () => { const d = document.createElement("div"); d.className = "rwchip"; d.innerHTML = REW_SVG; return d; });
            place(e, it.at?.[0] ?? 360, it.at?.[1] ?? 300, s, 0, o);
            break;
          }
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "rw";
            let h = "";
            if (style === "streaks") for (let i = 0; i < 16; i++) h += "<i></i>";
            else h = `<div class="lines"></div>`;
            d.innerHTML = h + `<svg class="tri" viewBox="0 0 140 90"><g fill="#fff" stroke="#15161a" stroke-width="7" stroke-linejoin="round" paint-order="stroke">
              <path d="M70 8 L10 45 L70 82 Z"/><path d="M132 8 L72 45 L132 82 Z"/></g></svg>`;
            return d;
          });
          if (style === "streaks") {
            [...e.querySelectorAll("i")].forEach((ln, i) => {
              const y = 60 + ((i * 337) % 1160), len = 160 + ((i * 97) % 300);
              const x = 720 - (((t - it.t0) * (2400 + i * 90) + i * 211) % (720 + len));
              ln.style.top = y + "px";
              ln.style.width = len + "px";
              ln.style.transform = `translateX(${x.toFixed(1)}px)`;
            });
          } else {
            const jit = ((Math.floor(t * 30) * 37) % 11) - 5;
            e.children[0].style.transform = `translateY(${jit}px)`;
          }
          const tri = e.querySelector("svg.tri");
          tri.style.top = (it.y ?? 300) + "px";
          e.style.display = "";
          e.style.transform = "translate(0px, 0px)";
          e.style.opacity = (o * (0.85 + 0.15 * Math.sin(t * 40))).toFixed(3);
          break;
        }
        case "icon": {
          // a transport icon: kind "pause", "play", "ffwd" or "rew"; at [x, y] frame pixels (default top right),
          // size in px (80); blink: true pulses it (a held pause)
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov icon";
          const kind = ICONS[it.kind] ? it.kind : "pause";
          if (e.dataset.kind !== kind) {
            e.innerHTML = `<svg viewBox="0 0 80 80"><g fill="#fff" stroke="#15161a" stroke-width="7" stroke-linejoin="round" paint-order="stroke">${ICONS[kind]}</g></svg>`;
            e.dataset.kind = kind;
          }
          const size = it.size ?? 80;
          e.style.width = e.style.height = size + "px";
          e.firstChild.style.width = e.firstChild.style.height = size + "px";
          const bl = it.blink ? 0.75 + 0.25 * Math.cos((t - it.t0) * Math.PI * 2 / 1.1) : 1;
          const at = it.at || [W - MARGIN - 18 - size / 2, 74 + size / 2];
          place(e, at[0] + (it.dx || 0), at[1] + (it.dy || 0), s, 0, o * bl, 0.5, 0.5, keep);
          break;
        }
        case "line": {
          // the white line between split views (y in px from the top; vertical: x)
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov split-line" + (it.x != null ? " v" : "");
          e.style.display = "";
          e.style.transform = it.x != null ? `translate(${it.x - 2.5}px, 0px)` : `translate(0px, ${it.y - 2.5}px)`;
          e.style.opacity = 1;
          break;
        }
        case "arrow": {
          // a straight arrow (force; red by default) or a curved arrow (rotation, yellow), in SVG with a dark
          // outline; dir in degrees (90 = down), or `to` (a world point) to aim it
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "arrow";
            return d;
          });
          const len = it.len ?? 140;
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          if (it.kind === "curve") {
            const r = it.r ?? 80;
            const col = it.color || "#ffd21f";
            const prog = clamp((t - it.t0) / 0.5);
            const dash = (r * 4.3).toFixed(0), off = ((1 - prog) * r * 4.3).toFixed(0);
            const path = `M ${r * Math.cos(-2.4)} ${r * Math.sin(-2.4)} A ${r} ${r} 0 1 1 ${r * Math.cos(1.1)} ${r * Math.sin(1.1)}`;
            const hx = r * Math.cos(1.1), hy = r * Math.sin(1.1);
            e.innerHTML = `<svg width="${2 * r + 40}" height="${2 * r + 40}" viewBox="${-r - 20} ${-r - 20} ${2 * r + 40} ${2 * r + 40}">
              <path d="${path}" stroke="#2a1606" stroke-width="16" fill="none" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${off}"/>
              <path d="${path}" stroke="${col}" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${off}"/>
              <path d="M ${hx - 18} ${hy - 3} L ${hx + 5} ${hy + 21} L ${hx + 18} ${hy - 13} Z" fill="${col}" stroke="#2a1606" stroke-width="3" stroke-linejoin="round" opacity="${clamp((t - it.t0 - 0.4) / 0.1)}"/></svg>`;
          } else {
            const grow = clamp((t - it.t0) / 0.3);
            const col = it.color || "#e53935";
            const L = len * easeOut(grow);
            let dir = it.dir ?? 90; // degrees, 90 = down
            if (MIR && a.world) dir = 180 - dir;
            if (it.to) {
              const v = views[it.view ?? 0] || views[0];
              const pb = project(Array.isArray(it.to) ? new THREE.Vector3(...it.to) : it.to, v);
              dir = (Math.atan2(pb.y - a.y, pb.x - a.x) * 180) / Math.PI;
            }
            const sw = it.w ?? 11;
            e.innerHTML = `<svg width="60" height="${len + 40}" viewBox="-30 -8 60 ${len + 40}" style="transform: rotate(${dir - 90}deg); transform-origin: 30px 8px;">
              <line x1="0" y1="0" x2="0" y2="${Math.max(0, L - 20)}" stroke="#2a1606" stroke-width="${sw + 6}" stroke-linecap="round"/>
              <line x1="0" y1="0" x2="0" y2="${Math.max(0, L - 20)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>
              <path d="M -19 ${L - 26} L 0 ${L} L 19 ${L - 26} Z" fill="${col}" stroke="#2a1606" stroke-width="3" stroke-linejoin="round" opacity="${grow > 0.2 ? 1 : 0}"/></svg>`;
          }
          place(e, a.x, a.y, 1, 0, o, 0.5, it.kind === "curve" ? 0.5 : 8 / (len + 40));
          break;
        }
        case "arc": {
          // a dashed yellow arc from one point to another (the loop back to the start), drawn on (air conditioner)
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "full"; return d; });
          const a = anchorXY({ ...it, at: it.from, dx: it.fdx, dy: it.fdy }, views), b = anchorXY({ ...it, at: it.to, dx: it.tdx, dy: it.tdy }, views);
          const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - (it.lift ?? 160);
          const grow = clamp((t - it.t0) / (it.grow ?? 0.7));
          const ang = Math.atan2(b.y - my, b.x - mx);
          const hx = b.x, hy = b.y, k = 24;
          const head = `M ${hx} ${hy} L ${hx - k * Math.cos(ang - 0.45)} ${hy - k * Math.sin(ang - 0.45)} L ${hx - k * Math.cos(ang + 0.45)} ${hy - k * Math.sin(ang + 0.45)} Z`;
          e.innerHTML = `<svg width="720" height="1280" viewBox="0 0 720 1280">
            <path d="M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" stroke="#3a2208" stroke-width="15" fill="none" stroke-linecap="round" stroke-dasharray="20 15" stroke-dashoffset="${(-t * 40).toFixed(1)}" opacity="${grow > 0 ? 0.55 : 0}"/>
            <path d="M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" stroke="#ffd21f" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="20 15" stroke-dashoffset="${(-t * 40).toFixed(1)}"/>
            <path d="${head}" fill="#ffd21f" stroke="#3a2208" stroke-width="3" opacity="${grow > 0.9 ? 1 : 0}"/></svg>`;
          e.firstChild.style.clipPath = `circle(${(grow * 900).toFixed(0)}px at ${a.x}px ${a.y}px)`;
          e.style.display = "";
          e.style.transform = "none";
          e.style.opacity = o.toFixed(3);
          break;
        }
        case "speedo": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "speedo";
            const R = 72, cx = 90, cy = 92;
            const seg = (a0, a1, col) => {
              const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
              return `<path d="M${p0[0]},${p0[1]} A${R},${R} 0 0 1 ${p1[0]},${p1[1]}" stroke="${col}" stroke-width="16" fill="none"/>`;
            };
            d.innerHTML = `<svg viewBox="0 0 180 110">${seg(Math.PI, Math.PI * 1.36, "#2fae63")}${seg(Math.PI * 1.36, Math.PI * 1.66, "#f2b321")}${seg(Math.PI * 1.66, Math.PI * 2, "#e53935")}
              <line class="needle" x1="90" y1="92" x2="90" y2="30" stroke="#222" stroke-width="6" stroke-linecap="round"/><circle cx="90" cy="92" r="9" fill="#222"/></svg><b></b>`;
            return d;
          });
          e.querySelector("b").textContent = cap1(it.label || "Speed");
          e.querySelector(".needle").setAttribute("transform", `rotate(${it.angle} 90 92)`);
          place(e, it.at[0], it.at[1], sc(BASE.speedo), 0, o, 0.5, 0.5, keep && BASE.speedo);
          break;
        }
        case "tint": {
          // a colour wash over the whole frame under the labels: css (any background) or color; k sets the
          // strength, else it fades in over 0.25 s and out over 0.3 s
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov tint tintbox";
          e.style.background = it.css || it.color;
          e.style.display = "";
          e.style.transform = "none";
          const k = it.k ?? clamp((t - it.t0) / 0.25) * (it.t1 - t < 0.3 ? clamp((it.t1 - t) / 0.3) : 1);
          e.style.opacity = clamp(k).toFixed(3);
          break;
        }
        case "timer": {
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "timer";
            d.innerHTML = `<svg viewBox="0 0 26 26"><circle cx="13" cy="14.5" r="9.5" fill="none" stroke="#15161a" stroke-width="3"/><path d="M10 2.5 H16" stroke="#15161a" stroke-width="3" stroke-linecap="round"/><path class="hand" d="M13 14.5 L13 8.5" stroke="#e53935" stroke-width="3" stroke-linecap="round"/></svg><span></span>`;
            return d;
          });
          e.lastChild.textContent = cap1(it.text);
          e.querySelector(".hand").setAttribute("transform", `rotate(${((t * 360) % 360).toFixed(1)} 13 14.5)`);
          place(e, it.at[0], it.at[1], s, 0, o, 0.5, 0.5, keep);
          break;
        }
        case "readout": {
          e = el(it.id, () => document.createElement("div"));
          e.className = "ov readout";
          e.textContent = cap1(it.text);
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, s, 0, o, 0.5, 1, keep);
          break;
        }
        case "counter": {
          // a white box with a big number and a small caption (altimeter, speed; airplane)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "counter";
            d.innerHTML = `<b></b><span></span>`;
            return d;
          });
          e.children[0].textContent = it.value;
          e.children[0].style.color = it.color || "#2f6fe0";
          e.children[1].textContent = cap1(it.sub || "");
          place(e, it.at[0], it.at[1], it.noPop ? BASE.counter : sc(BASE.counter), 0, o, 0.5, 0, keep && BASE.counter);
          break;
        }
        case "thermo": {
          // a small white thermometer: level 0..1, color, text (airplane)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "thermo";
            d.innerHTML = `<svg width="74" height="176" viewBox="0 0 74 176">
              <rect x="27" y="14" width="20" height="104" rx="10" fill="#eef1f4" stroke="#c9ced5" stroke-width="3"/>
              <rect class="fill" x="31" y="30" width="12" height="90" rx="6"/>
              <circle class="bulb" cx="37" cy="124" r="14"/>
              <text class="lab" x="37" y="164" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="15" fill="#2a2a2e"></text></svg>`;
            return d;
          });
          const lv = clamp(it.level ?? 0.5);
          const top = 118 - lv * 96;
          const f = e.querySelector(".fill");
          f.setAttribute("y", top.toFixed(1));
          f.setAttribute("height", (124 - top).toFixed(1));
          f.setAttribute("fill", it.color || "#e53935");
          e.querySelector(".bulb").setAttribute("fill", it.color || "#e53935");
          e.querySelector(".lab").textContent = cap1(it.text);
          place(e, it.at[0], it.at[1], it.noPop ? BASE.thermo : sc(BASE.thermo), 0, o, 0.5, 0.5, keep && BASE.thermo);
          break;
        }
        case "thermoPanel": {
          // the light bulb's tall temperature panel: temp (°C, scale 0 to 2000), shatter (a time: it breaks)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.innerHTML = `<div class="tpanel"><div class="read"></div><div class="tube"><div class="fill"></div></div><div class="bulbt"></div>
              ${[2000, 1500, 1000, 500, 0].map((v, i) => `<div class="tick" style="top:${60 + i * 75}px">${v.toLocaleString("en-US")}</div>`).join("")}</div>
              ${Array.from({ length: 18 }, (_, i) => `<div class="shard" data-i="${i}"></div>`).join("")}`;
            return d;
          });
          const panel = e.querySelector(".tpanel");
          const broke = it.shatter != null && t >= it.shatter;
          panel.style.visibility = broke ? "hidden" : "visible";
          const T = Math.round(it.temp);
          e.querySelector(".read").textContent = `${T.toLocaleString("en-US")} °C`;
          e.querySelector(".read").style.color = T > 1500 ? "#ff5a4a" : "#fff";
          e.querySelector(".fill").style.height = `${(100 * Math.min(1, it.temp / 2000)).toFixed(1)}%`;
          const shake = !broke && it.shatter != null && t > it.shatter - 0.35 ? Math.sin(t * 90) * 3 : 0;
          panel.style.transform = `translateX(${shake.toFixed(1)}px)`;
          e.querySelectorAll(".shard").forEach((sh, i) => {
            if (!broke) { sh.style.display = "none"; return; }
            const u = t - it.shatter;
            const ang = (i / 18) * Math.PI * 2 + i * 0.7, v = 260 + (i * 53) % 220;
            const x = 66 + Math.cos(ang) * v * u, y = 200 + Math.sin(ang) * v * u * 0.8 + 700 * u * u;
            const red = i % 3 === 0;
            sh.style.display = "";
            sh.style.width = red ? "12px" : "16px";
            sh.style.height = red ? "12px" : "10px";
            sh.style.borderRadius = red ? "50%" : "2px";
            sh.style.background = red ? "#e8261c" : "rgba(235,245,255,0.9)";
            sh.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(u * (300 + i * 40)).toFixed(0)}deg)`;
            sh.style.opacity = Math.max(0, 1 - u / 0.9).toFixed(2);
          });
          const a = anchorXY(it, views);
          place(e, a.x, a.y, broke ? 1 : s, 0, 1, 0.5, 0.5);
          break;
        }
        case "melt": {
          // the light bulb's full-frame furnace: metals melting as temp passes each one's melting point
          e = el(it.id, () => {
            const d = document.createElement("div");
            const cube = (c) => `<svg viewBox="-60 -10 120 110"><ellipse class="pud" cx="0" cy="78" rx="52" ry="14" fill="#ff6a2a"/>
              <g class="cube"><path d="M0,0 L40,18 L0,36 L-40,18 Z" fill="${c[0]}"/><path d="M-40,18 L0,36 L0,80 L-40,62 Z" fill="${c[1]}"/><path d="M40,18 L0,36 L0,80 L40,62 Z" fill="${c[2]}"/></g></svg>`;
            d.innerHTML = `<div class="melt"><div class="read"></div><div class="grid">${it.metals.map((m) => `<div class="tile"><b>${cap1(m.name)}</b>${cube(m.c)}<i>${m.mp.toLocaleString("en-US")} °C</i></div>`).join("")}</div>
              <svg class="fire" viewBox="0 0 720 330" preserveAspectRatio="none"><path class="f0" fill="#c8160c"/><path class="f1" fill="#ff6a12"/><path class="f2" fill="#ffd23a"/><path class="f3" fill="#fff4c0"/></svg></div>`;
            return d;
          });
          const T = it.temp;
          e.querySelector(".read").textContent = `${Math.round(T).toLocaleString("en-US")} °C`;
          e.querySelectorAll(".tile").forEach((tile, i) => {
            const m = it.metals[i];
            const k = Math.max(0, Math.min(1, (T - m.mp) / 160));
            const cube = tile.querySelector(".cube"), pud = tile.querySelector(".pud");
            cube.setAttribute("transform", `translate(0 ${(80 * k).toFixed(1)}) scale(${(1 + 0.25 * k).toFixed(3)} ${(1 - k).toFixed(3)})`);
            cube.setAttribute("opacity", (1 - k * 0.6).toFixed(2));
            pud.setAttribute("transform", `translate(0 0) scale(${(0.15 + 0.85 * k).toFixed(3)} ${(0.15 + 0.85 * k).toFixed(3)})`);
            pud.setAttribute("opacity", k > 0 ? 1 : 0);
            pud.style.transformOrigin = "0px 78px";
            tile.style.borderColor = k > 0 ? "rgba(255,120,40,0.95)" : "rgba(255,255,255,0.22)";
          });
          const flame = (cls, base, amp, n, ph) => {
            let d = `M0,330 L0,${base}`;
            for (let i = 0; i <= n; i++) {
              const x = (i / n) * 720;
              const h = amp * (0.55 + 0.45 * Math.sin(t * 7 + i * 1.9 + ph) * Math.sin(t * 3.1 + i * 0.7));
              d += ` L${(x - 360 / n).toFixed(1)},${base} L${x.toFixed(1)},${(base - h).toFixed(1)}`;
            }
            d += " L720,330 Z";
            e.querySelector("." + cls).setAttribute("d", d);
          };
          const rise = Math.min(1, (T - 20) / 1500);
          flame("f0", 330 - 140 * rise, 130 * rise + 20, 14, 0);
          flame("f1", 330 - 100 * rise, 110 * rise + 14, 17, 1.3);
          flame("f2", 330 - 60 * rise, 80 * rise + 10, 21, 2.6);
          flame("f3", 330 - 20 * rise, 40 * rise + 6, 26, 3.9);
          place(e, 360, 640, 1, 0, Math.min(1, it.t1 - t < 0.2 ? (it.t1 - t) / 0.2 : 1));
          break;
        }
        case "bubble": {
          // a speech bubble over a character: kind "speech" (white), "yay" (yellow), "aww" (grey); text may hold <br>
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.innerHTML = `<div class="bubble"><span></span><div class="tail"></div></div>`;
            return d;
          });
          const b = e.firstChild;
          b.className = "bubble " + (it.kind || "speech");
          b.style.setProperty("--tc", it.kind === "yay" ? "#8a2a10" : it.kind === "aww" ? "#4a4f5a" : "#17181c");
          b.firstChild.innerHTML = cap1(it.text);
          b.style.fontSize = it.size ? it.size + "px" : "";
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          const wob = it.kind === "yay" ? Math.sin(t * 9) * 3 : 0;
          place(e, a.x, a.y - 26, sc(1 + 0.015 * Math.sin(t * 6)), wob, o, 0.5, 1, keep);
          break;
        }
        case "energy": {
          // the light bulb's energy bar: heat share (red) and light share (yellow)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.innerHTML = `<div class="energy"><div class="t"></div><div class="bar"><div class="h"></div><div class="l"></div></div><div class="lt"></div></div>`;
            return d;
          });
          e.querySelector(".t").textContent = cap1(it.title);
          const h = e.querySelector(".h"), l = e.querySelector(".l");
          h.style.width = `${(100 * it.heat).toFixed(2)}%`;
          h.textContent = cap1(it.heatLabel || "");
          l.style.left = `${(100 * it.heat).toFixed(2)}%`;
          l.style.width = `${(100 * it.light).toFixed(2)}%`;
          e.querySelector(".lt").textContent = cap1(it.lightLabel || "");
          place(e, it.at[0], it.at[1], sc(BASE.energy), 0, o, 0.5, 0, keep && BASE.energy);
          break;
        }
        case "slope": {
          // the roof's rise-over-run triangle on three world points P (start), Q (corner), R (top)
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "full"; return d; });
          const v = views[it.view ?? 0] || views[0];
          const V3 = (p) => (Array.isArray(p) ? new THREE.Vector3(...p) : p);
          const Pp = project(V3(it.P), v), Q = project(V3(it.Q), v), R = project(V3(it.R), v);
          const kRun = clamp((t - it.t0) / 0.3), kRise = clamp((t - it.t0 - 0.35) / 0.3), kTri = clamp((t - it.t0 - 0.7) / 0.25);
          const qx = Pp.x + (Q.x - Pp.x) * kRun, qy = Pp.y + (Q.y - Pp.y) * kRun;
          const rx = Q.x + (R.x - Q.x) * kRise, ry = Q.y + (R.y - Q.y) * kRise;
          const lbl = (x, y, txt, col, anchor = "middle") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-family="Montserrat" font-weight="900" font-size="34" fill="${col}" stroke="#2a1606" stroke-width="8" paint-order="stroke">${cap1(txt)}</text>`;
          e.innerHTML = `<svg width="720" height="1280" viewBox="0 0 720 1280">
            <polygon points="${Pp.x},${Pp.y} ${Q.x},${Q.y} ${R.x},${R.y}" fill="#ffd21f" opacity="${(0.45 * kTri).toFixed(2)}"/>
            <line x1="${Pp.x}" y1="${Pp.y}" x2="${qx}" y2="${qy}" stroke="#2a1606" stroke-width="13" stroke-linecap="round"/>
            <line x1="${Pp.x}" y1="${Pp.y}" x2="${qx}" y2="${qy}" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
            ${kRise > 0 ? `<line x1="${Q.x}" y1="${Q.y}" x2="${rx}" y2="${ry}" stroke="#2a1606" stroke-width="13" stroke-linecap="round"/><line x1="${Q.x}" y1="${Q.y}" x2="${rx}" y2="${ry}" stroke="#e53935" stroke-width="7" stroke-linecap="round"/>` : ""}
            ${kRun >= 1 ? lbl((Pp.x + Q.x) / 2, Math.max(Pp.y, Q.y) + 44, it.run, "#ffffff") : ""}
            ${kRise >= 1 ? lbl(Math.min(Q.x, R.x) - 16, (Q.y + R.y) / 2 + 11, it.rise, "#ff6b5e", "end") : ""}
          </svg>`;
          e.style.display = "";
          e.style.transform = "translate(0px, 0px)";
          e.style.opacity = o.toFixed(3);
          break;
        }
        case "snow": {
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "snow"; d.innerHTML = SNOW_SVG; return d; });
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          e.firstChild.style.transform = `rotate(${(t * 40) % 360}deg)`;
          place(e, a.x, a.y, sc(BASE.snow * (it.scale ?? 1)), 0, o, 0.5, 0.5, keep && BASE.snow * (it.scale ?? 1));
          break;
        }
        case "clock": {
          // a clock face whose minute hand turns to `angle` degrees (fridge)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "clock";
            d.innerHTML = `<svg viewBox="-28 -28 56 56" width="56" height="56"><line class="hh" x1="0" y1="0" x2="0" y2="-11" stroke="#2a2d33" stroke-width="4" stroke-linecap="round"/><line class="mh" x1="0" y1="0" x2="0" y2="-18" stroke="#e53935" stroke-width="3" stroke-linecap="round"/><circle r="3" fill="#2a2d33"/></svg>`;
            return d;
          });
          e.querySelector(".mh").setAttribute("transform", `rotate(${it.angle})`);
          e.querySelector(".hh").setAttribute("transform", `rotate(${it.angle / 12})`);
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(BASE.clock * (it.scale ?? 1)), 0, o, 0.5, 0.5, keep && BASE.clock * (it.scale ?? 1));
          break;
        }
        case "phase": {
          // liquid to gas, k 0..1 (fridge)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "phase";
            d.innerHTML = `<svg width="300" height="78" viewBox="0 0 300 78">
              <g class="drop" transform="translate(36 30)"><path d="M0 -20 C 8 -8, 14 -2, 14 6 A 14 14 0 0 1 -14 6 C -14 -2, -8 -8, 0 -20 Z" fill="#2f8fe0"/></g>
              <text x="36" y="72" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="14" fill="#2a2d33">${cap1(it.a ?? "LIQUID")}</text>
              <line x1="80" y1="34" x2="208" y2="34" stroke="#2a2d33" stroke-width="5"/><path d="M206 24 L222 34 L206 44 Z" fill="#2a2d33"/>
              <g transform="translate(148 14)"><rect x="-4" y="-10" width="8" height="18" rx="4" fill="#2f8fe0"/><circle cy="10" r="6" fill="#2f8fe0"/></g>
              <text x="150" y="62" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="18" fill="#2f8fe0">${it.mid ?? "−26 °C"}</text>
              <g class="cloud" transform="translate(262 30)"><path d="M-22 10 a10 10 0 0 1 2 -19 a13 13 0 0 1 24 -4 a10 10 0 0 1 16 10 a9 9 0 0 1 -2 13 Z" fill="#bfe0ff" stroke="#2f8fe0" stroke-width="2.5"/></g>
              <text x="262" y="72" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="14" fill="#2a2d33">${cap1(it.b ?? "GAS")}</text></svg>`;
            return d;
          });
          const k = it.k ?? 0;
          e.querySelector(".drop").setAttribute("transform", `translate(36 30) scale(${(1 - 0.55 * k).toFixed(3)})`);
          e.querySelector(".cloud").setAttribute("transform", `translate(262 30) scale(${(0.45 + 0.65 * k).toFixed(3)})`);
          place(e, it.at[0], it.at[1], sc(BASE.phase), 0, o, 0.5, 0.5, keep && BASE.phase);
          break;
        }
        case "pgauge": {
          // a small pressure gauge with a reading (fridge)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "pgauge";
            const arc = (a0, a1, c) => `<path d="M${(50 + 40 * Math.cos(a0)).toFixed(1)} ${(52 + 40 * Math.sin(a0)).toFixed(1)} A40 40 0 0 1 ${(50 + 40 * Math.cos(a1)).toFixed(1)} ${(52 + 40 * Math.sin(a1)).toFixed(1)}" stroke="${c}" stroke-width="11" fill="none"/>`;
            d.innerHTML = `<svg viewBox="0 0 100 60" width="108" height="65">${arc(Math.PI, Math.PI * 1.36, "#2f8fe0")}${arc(Math.PI * 1.36, Math.PI * 1.64, "#f2c230")}${arc(Math.PI * 1.64, Math.PI * 2, "#e53935")}
              <line class="needle" x1="50" y1="52" x2="50" y2="18" stroke="#2a2d33" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="52" r="6" fill="#2a2d33"/></svg><b></b>`;
            return d;
          });
          e.querySelector(".needle").setAttribute("transform", `rotate(${it.angle} 50 52)`);
          const b = e.querySelector("b");
          b.textContent = cap1(it.text);
          b.style.color = it.angle > 0 ? "#e53935" : "#2f8fe0";
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(BASE.pgauge * (it.scale ?? 1)), 0, o, 0.5, 0.5, keep && BASE.pgauge * (it.scale ?? 1));
          break;
        }
        case "wtherm": {
          // a white wall thermometer, k 0..1 (fridge)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "wtherm";
            d.innerHTML = `<svg viewBox="0 0 74 190" width="74" height="190"><rect x="28" y="16" width="18" height="120" rx="9" fill="#eceef2" stroke="#2a2d33" stroke-width="3"/>
              <rect class="fill" x="32" y="40" width="10" height="96" rx="5" fill="#e53935"/><circle cx="37" cy="142" r="15" fill="#e53935" stroke="#2a2d33" stroke-width="3"/>
              <text class="tx" x="37" y="180" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="15" fill="#2a2d33"></text></svg>`;
            return d;
          });
          const f = clamp(it.k ?? 0.5);
          e.querySelector(".fill").setAttribute("y", (136 - 110 * f).toFixed(1));
          e.querySelector(".fill").setAttribute("height", (110 * f).toFixed(1));
          e.querySelector(".tx").textContent = cap1(it.text);
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(BASE.wtherm), 0, o, 0.5, 0.5, keep && BASE.wtherm);
          break;
        }
        case "bill": {
          // a power bill with an amount; jumpT: a time it jumps (fridge)
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "bill";
            d.innerHTML = `<div class="hd"></div><div class="ln" style="width:70%"></div><div class="ln" style="width:52%"></div><div class="ln" style="width:62%"></div><div class="amt"></div>`;
            return d;
          });
          e.querySelector(".hd").textContent = cap1(it.title || "POWER BILL");
          e.querySelector(".amt").textContent = it.amount;
          const jump = it.jumpT != null && t > it.jumpT ? 1 + 0.12 * Math.max(0, 1 - (t - it.jumpT) / 0.2) : 1;
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(BASE.bill * jump), it.rot ?? -4, o, 0.5, 0.5, keep && BASE.bill);
          break;
        }
        case "boom": {
          // a starburst with BOOM! and flying confetti (fridge)
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "boom"; return d; });
          const u = t - it.t0;
          let conf = "";
          for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI * 2 + 0.4, r = 60 + u * 420 * (0.7 + (i % 3) * 0.2);
            conf += `<rect x="${(165 + r * Math.cos(ang)).toFixed(1)}" y="${(150 + r * Math.sin(ang) + u * u * 300).toFixed(1)}" width="14" height="18" fill="${i % 2 ? "#fffdf6" : "#ffd21f"}" transform="rotate(${(i * 40 + u * 500).toFixed(0)} ${(165 + r * Math.cos(ang)).toFixed(1)} ${(150 + r * Math.sin(ang)).toFixed(1)})"/>`;
          }
          e.innerHTML = `<svg viewBox="0 0 330 300" width="330" height="300" style="overflow:visible">${conf}<path d="${burst(12, 82, 150, 0.1)}" fill="#f26a1b"/><path d="${burst(12, 60, 108, 0.35)}" fill="#ffd21f"/>
            <text x="165" y="168" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="58" fill="#fff" stroke="#2a1508" stroke-width="10" paint-order="stroke fill">${cap1(it.text || "BOOM!")}</text></svg>`;
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, sc(1 + 0.06 * Math.sin(u * 30) * Math.exp(-u * 4)), -6, o, 0.5, 0.5, keep);
          break;
        }
        case "cal": {
          // a calendar flipping through months every `step` s (fridge)
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "cal"; d.innerHTML = `<div class="m"></div><div class="ic"></div>`; return d; });
          const n = it.months.length;
          const i = Math.min(n - 1, Math.max(0, Math.floor((t - it.t0) / it.step)));
          e.querySelector(".m").textContent = cap1(it.months[i]);
          const flip = (t - it.t0) - i * it.step;
          const sy = i > 0 && flip < 0.12 ? 0.3 + 0.7 * (flip / 0.12) : 1;
          const a = anchored();
          if (!a) { e.style.display = "none"; break; }
          place(e, a.x, a.y, { sx: sn * BASE.cal, sy: sn * BASE.cal * sy }, 4, o, 0.5, 0, keep && BASE.cal);
          break;
        }
        case "squig": {
          // a wavy arrow from `at` to `to` (screen or world points), drawn on over 0.35 s, its wave crawling (fridge)
          e = el(it.id, () => { const d = document.createElement("div"); d.className = "full"; return d; });
          const a = anchorXY(it, views), b = anchorXY({ ...it, at: it.to, dx: it.tdx, dy: it.tdy }, views);
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
          const amp = it.amp ?? 11, waves = Math.max(1.5, L / (it.wl ?? 50)), ph = t * (it.speed ?? 9);
          const draw = clamp((t - it.t0) / 0.35);
          let d = "";
          const N = 40;
          for (let k = 0; k <= N; k++) {
            const u = (k / N) * draw;
            const w = Math.sin(u * waves * Math.PI * 2 - ph) * amp * Math.min(1, (1 - u) * 6) * Math.min(1, u * 8);
            d += (k ? "L" : "M") + (a.x + dx * u + nx * w).toFixed(1) + " " + (a.y + dy * u + ny * w).toFixed(1) + " ";
          }
          const ex = a.x + dx * draw, ey = a.y + dy * draw, ang = Math.atan2(dy, dx);
          const hd = `M${(ex + Math.cos(ang) * 5).toFixed(1)} ${(ey + Math.sin(ang) * 5).toFixed(1)} L${(ex + Math.cos(ang + 2.5) * 20).toFixed(1)} ${(ey + Math.sin(ang + 2.5) * 20).toFixed(1)} L${(ex + Math.cos(ang - 2.5) * 20).toFixed(1)} ${(ey + Math.sin(ang - 2.5) * 20).toFixed(1)} Z`;
          const c = it.color || "#f26a1b";
          const sw = it.w ?? 9;
          e.innerHTML = `<svg width="720" height="1280" viewBox="0 0 720 1280"><path d="${d}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${sw + 5}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${c}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${hd}" fill="${c}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/></svg>`;
          e.style.display = "";
          e.style.transform = "none";
          e.style.opacity = o.toFixed(3);
          break;
        }
        case "tempGraph": {
          // the fridge's thermostat card: temp text, ON/OFF chip, a history line between lo and hi
          e = el(it.id, () => {
            const d = document.createElement("div");
            d.className = "tgraph";
            d.innerHTML = `<div><div class="tv"></div><span class="chip2"></span></div><svg width="200" height="72" viewBox="0 0 200 72" style="margin-left:auto">
              <line x1="0" y1="12" x2="200" y2="12" stroke="#e53935" stroke-width="2" stroke-dasharray="6 5"/><text x="198" y="9" text-anchor="end" font-family="Montserrat" font-weight="900" font-size="10" fill="#e53935">ON</text>
              <line x1="0" y1="60" x2="200" y2="60" stroke="#2f8fe0" stroke-width="2" stroke-dasharray="6 5"/><text x="198" y="71" text-anchor="end" font-family="Montserrat" font-weight="900" font-size="10" fill="#2f8fe0">OFF</text>
              <polyline class="pl" fill="none" stroke="#2a2d33" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
            return d;
          });
          e.querySelector(".tv").textContent = it.temp;
          const chip = e.querySelector(".chip2");
          chip.textContent = it.on ? "ON" : "OFF";
          chip.style.background = it.on ? "#2fae63" : "#e53935";
          const hs = it.hist || [];
          const lo = it.lo ?? 2, hi = it.hi ?? 6;
          e.querySelector(".pl").setAttribute("points", hs.map((v, i) => `${((i / Math.max(1, hs.length - 1)) * 196 + 2).toFixed(1)},${(60 - ((v - lo) / (hi - lo)) * 48).toFixed(1)}`).join(" "));
          place(e, it.at[0], it.at[1], sc(BASE.tempGraph), 0, o, 0.5, 0.5, keep && BASE.tempGraph);
          break;
        }
        default:
          if (!update._warned?.[it.type]) { (update._warned ||= {})[it.type] = 1; console.warn(`overlay: no type "${it.type}"`); }
      }
    }
    for (const [id, e] of els) if (!seen.has(id)) e.style.display = "none";
  }

  return { update, project };
}
