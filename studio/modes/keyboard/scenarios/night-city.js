// Night city: the giant laptop on a dark desk at night, a starry sky over a lit skyline all around,
// a warm key on the cast, the dashboard glowing blue. The keyboard mode's first look.
import { keyboardStage } from "../stage.js";

export const meta = { id: "night-city", name: "Night city", seat: "keys" };

export const LOOK = {};

export const build = (ctx) => keyboardStage(ctx, LOOK);
