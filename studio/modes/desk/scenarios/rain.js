// Rain: a grey evening, rain streaking past the window and beading on the glass, cool towers with a
// few lit windows, the desk lamp the only warm thing in the room.
import { deskRoom } from "../room.js";

export const meta = { id: "rain", name: "Rain", seat: "chair" };

export const LOOK = {
  exposure: 1.06,
  background: 0x0c0f15,
  hemi: [0x7f93b4, 0x151820, 0.42],
  window: [0x9fb4d8, 1.0],
  lamp: [0xffae63, 82],
  screen: [0x9ec4ff, 7],
  fill: [0xffb27a, 30],
  wall: 0x1b222c,
  floor: 0x0e1116,
  frame: 0x0b0e13,
  city: {
    seed: 37,
    sky: [[0, "#4f5f75"], [0.6, "#6d7f97"], [1, "#8a9bb1"]],
    tower: [44, 54, 70], spread: [8, 8, 10], lit: 0.08,
    litColor: (r) => `rgba(${210 + r() * 40},${225 + r() * 25},255,${0.4 + r() * 0.4})`,
    blur: 12, low: 160, high: 470,
  },
  cityTint: 0xd8dde6,
  bokeh: { colors: [0xff5a4a, 0xffb36a, 0xe9eef8, 0xff5a4a], count: 18, opacity: [0.1, 0.25], size: [0.8, 1.8], seed: 43 },
  rain: { seed: 41, count: 120, drops: 0.22 },
  extras: true,
  pendantLit: true,
};

export const build = (ctx) => deskRoom(ctx, LOOK);
