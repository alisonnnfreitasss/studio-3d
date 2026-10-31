// Dusk: the same desk at sundown. A lavender sky that turns pink, then peach at the horizon,
// dark towers with the first lit windows, the desk lamp already on.
import { deskRoom } from "../room.js";

export const meta = { id: "dusk", name: "Dusk", seat: "chair" };

export const LOOK = {
  exposure: 1.08,
  background: 0x1a1420,
  hemi: [0xb3a0d4, 0x2a1820, 0.5],
  window: [0xff9fbf, 1.0],
  lamp: [0xffb06a, 70],
  screen: [0x9ec4ff, 6],
  fill: [0xffc49a, 34],
  wall: 0x2a2232,
  floor: 0x17121a,
  frame: 0x120d14,
  city: {
    seed: 29,
    sky: [[0, "#8d7fc4"], [0.42, "#d99bc0"], [0.72, "#f3b49c"], [1, "#f8d08e"]],
    tower: [46, 36, 62], spread: [10, 8, 12], lit: 0.14,
    litColor: (r) => `rgba(255,${200 + r() * 40},${130 + r() * 50},${0.55 + r() * 0.4})`,
    blur: 7, low: 150, high: 420,
  },
  cityTint: 0xffffff,
  bokeh: { colors: [0xffd9a0, 0xffc27a, 0xfff0d8, 0xff9f7a], count: 26, opacity: [0.12, 0.3], size: [1.2, 2.6], seed: 31 },
  extras: true,
};

export const build = (ctx) => deskRoom(ctx, LOOK);
