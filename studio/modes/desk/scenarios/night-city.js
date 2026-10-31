// Night city: the desk at night, a desk lamp's warm key, a big window of city lights that the long
// lens turns into soft discs. The first desk look.
import { deskRoom } from "../room.js";

export const meta = { id: "night-city", name: "Night city", seat: "chair" };

export const LOOK = {
  exposure: 1.05,
  background: 0x05060c,
  hemi: [0x55608c, 0x140c10, 0.26],
  window: [0x6f8cff, 0.6],
  lamp: [0xffae63, 95],
  screen: [0x9ec4ff, 7],
  fill: [0xffb27a, 40],
  city: { seed: 17, sky: [[0, "#060a1c"], [1, "#12204a"]], tower: [8, 11, 26], spread: [6, 8, 14], lit: 0.42, blur: 10 },
  cityTint: 0x8f96b4,
  bokeh: { colors: [0xffd27a, 0xffd27a, 0xffa24c, 0xfff1d0, 0xffb860, 0x7fb2ff, 0xff6a55, 0xffd27a], count: 62 },
};

export const build = (ctx) => deskRoom(ctx, LOOK);
