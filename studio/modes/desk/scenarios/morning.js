// Morning: daylight. A pale blue sky, soft blue-grey towers, the sun coming in behind the desk,
// the desk lamp off.
import { deskRoom } from "../room.js";

export const meta = { id: "morning", name: "Morning", seat: "chair" };

export const LOOK = {
  exposure: 1.06,
  background: 0xbcd6e4,
  hemi: [0xd6e8ff, 0x6b5a4a, 1.05],
  window: [0xfff3e0, 1.6, [3, 9, -12]],
  sun: [0xfff1dc, 1.4, [6, 14, -16]],
  lamp: [0xffae63, 0],
  screen: [0x9ec4ff, 4],
  fill: [0xfff0e0, 26],
  faceKey: [0xfff4e6, 34, [1.2, 6.2, 3.2]],
  wall: 0xc9c2b8,
  floor: 0x4e443a,
  frame: 0x3a3d44,
  desk: 0x7a5232,
  city: {
    seed: 47,
    sky: [[0, "#8fc4e2"], [0.65, "#c8e4ef"], [1, "#e8f3f2"]],
    tower: [128, 152, 176], spread: [14, 14, 14], lit: 0,
    blur: 6, low: 140, high: 420,
  },
  cityTint: 0xffffff,
  screenGlow: 0xd8e6ff,
  bokeh: null,
  extras: true,
  pendantLit: false,
};

export const build = (ctx) => deskRoom(ctx, LOOK);
