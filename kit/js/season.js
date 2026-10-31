// Seasons: window.__SEASON (set before the stage loads, like window.__MIRROR) recolours a reel when it is built, so the
// same film can be rendered again in another season. Off ("summer") by default, and
// then nothing here changes a colour.
//   S(hex): the kit's summer greens mapped to the season's colours; any other colour passes through unchanged. props.js
//           uses it where colours are baked into vertices (terrain, merged tree crowns); the stage runs every material
//           of the built world through it too, so a reel's own greens (hills, leaves) follow without edits.
//   CAMO:   the lead's camo shirt palette for the season (null: the summer oranges).
//   SKY:    overrides for the stage's sky presets (a warmer sun in autumn).
export const SEASON = (typeof window !== "undefined" && window.__SEASON) || "summer";

const MAPS = {
  autumn: {
    0x86c45a: 0xae9d58, 0x79b84f: 0x9c8a48, // terrain grass, its two patches: straw and olive gold
    0x6fae4f: 0xb08840, 0x5f9e45: 0x9c7436, // distant hills: ochre
    0x3f9e44: 0xd9662a, 0x52b34a: 0xc23d24, // leaves: orange, red
    0x58b84c: 0xe6b03a, 0x7cc95a: 0xd98c36, // leaves: yellow, amber
  },
};
const MAP = MAPS[SEASON] || null;

export function S(hex) {
  return MAP && MAP[hex] !== undefined ? MAP[hex] : hex;
}

// every material colour in a built world, through S (each material once)
export function recolour(root) {
  if (!MAP) return 0;
  const seen = new Set();
  let n = 0;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (!m || seen.has(m) || !m.color) continue;
      seen.add(m);
      const h = m.color.getHex(), to = S(h);
      if (to !== h) { m.color.setHex(to); n++; }
    }
  });
  return n;
}

export const CAMO = {
  autumn: { base: "#7d2a2e", patches: ["#a8452f", "#d39a3c", "#5a1d22", "#c2683a", "#8f3a30"] }, // burgundy, rust, mustard
}[SEASON] || null;

export const SKY = {
  autumn: { day: { sunCol: 0xffd6a0, hemiGround: 0x9a7a54 } },
}[SEASON] || null;

// The mirror's one 3D concern:
// words painted into a canvas texture (a label, a display's digits, a road sign) read backwards once the canvas is
// flipped. With window.__MIRROR set, every canvas that has text drawn on it is marked here (this module loads with the
// stage, before any world is built), and unflipText() turns such textures back in their own UVs: the object stays
// mirrored, its words read as before.
const MIR = typeof window !== "undefined" && !!window.__MIRROR;
if (MIR && typeof CanvasRenderingContext2D !== "undefined") {
  for (const k of ["fillText", "strokeText"]) {
    const f = CanvasRenderingContext2D.prototype[k];
    CanvasRenderingContext2D.prototype[k] = function (...a) { this.canvas.__text = true; return f.apply(this, a); };
  }
}
export function unflipText(root) {
  if (!MIR) return 0;
  let n = 0;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const tex of [m && m.map, m && m.emissiveMap]) {
        if (!tex || tex.__unflipped || !tex.image || !tex.image.__text) continue;
        tex.__unflipped = true;
        tex.center.set(0.5, 0.5);
        tex.repeat.x *= -1;
        tex.needsUpdate = true;
        n++;
      }
    }
  });
  return n;
}
