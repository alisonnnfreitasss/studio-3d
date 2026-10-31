# The 3D explainer kit

The standing setup every new English 3D explainer reel starts from. One copy of every tool and every shared JS module; a reel folder keeps only its own content.

Since the kit also makes reels from a topic with no reference (`tools/new_topic.py`, `runner/explainer.py`, the Explainers page of the studio; format rules `FORMAT.md`, assets `WORLDS.md`). Libraries are pinned in `vendor/` and copied into each build. A reel's voice and lead come from `brands/<id>/brand.json`. `check.py` includes the speed check (`tools/speed.py`; limits measured on the approved reels' by `tools/speed_calibrate.py`: fail over 38 in any quarter second or 13.5 over any 4 s).

## JS

`kit/js/` is the shared JS. A reel's `build/js/` holds only its own content (`reel.js`, and the set, the machine and the direction beside it if it splits them); `compose.py` copies `kit/js/*` into `build/js/kit/` on every run, and the reel imports `./kit/<name>.js`. The worked example is `demo/build/js/reel.js` (a 15.6 s reel, 220 lines, everything else from the kit); `new_reel.py` copies it into a new reel as its starting point.

### The files

| File | Lines | What |
|---|---|---|
| `stage.js` | 510 | `createStage(canvas, root, reel)`: the first build's main.js made generic, its code paths kept: renderer, post stack (N8AO, gather DOF, bloom behind an HDR clamp, neutral tone mapping, grade, vignette), image-based light, the sky presets, the light rig with the shadow box following each view, the cast with props on joints and carried objects, pose-to-pose blends, split views via rects, sub-frame motion blur, glass and lacquer reflections, `renderAt(t)` and `window.__frame` (t, scene, shot, spp, px, overlays, views, unchanged) |
| `camera.js` | 219 | `K`, `orbit`, `camPath` (the v2 path, unchanged) and `shotList` with `hold`, `reframe`, `cut`, `follow`, `split`, `fly` |
| `words.js` | 87 | `words(TL)`: `S`, `E`, `W`, `find`, `captions`; `frame`, `useCamera`, `pulse`, `seeded`; the easing helpers re-exported |
| `overlay.js` | 1,045 | The one text layer: 42 types merged from the earlier reels, phone size, `ov` constructors, `cap1` |
| `pixel.js` | 821 | the lead Pixel and the girl on one rig; 65 poses merged from the earlier builds plus the new ones; `walkPath`, `pathLength`, `walkTime` |
| `props.js` | 1,079 | Terrain with a cut-away soil section, river water, sky, trees, a felled tree, road, houses, 3D arrows, and every effect (`buildEffects`) |
| `vehicles.js` | 340 | The blue car and bike, unchanged but for a `y`; `carToWorld`, `driverOf` |
| `parts.js` | 74 | `enter` (fly-in or spring pop), `shower` (applies them), `highlight` (hue-keeping), `worldOf` |
| `kit.js`, `util.js`, `shapes.js`, `fx.js`, `look.js`, `softenv.js`, `motion-config.js` | 238, 126, 334, 108, 54, 37, 16 | As they were, deduplicated (all copies were identical; `motion-config.js` is the skyscraper's, with `window.__MOTION_OVERRIDE`); `fx.js` gained the `Grade` effect (env.grey, env.dim) for the bridge |

### The contract

`build/index.html` (written by compose.py) imports `./js/kit/stage.js` and `./js/reel.js`, calls `createStage(canvas, root, reel)` inside the build-ready promise, renders on `hf-seek`, and sets `window.__renderAt`. `createStage` returns `{ renderAt(t), scene, ctx }`.

`reel.js` exports:

| Export | Required | What |
|---|---|---|
| `CAST` | yes | `[{ who, kind: "lead" or "girl", variant, scale (0.42), blinkSeed, seat, props: [{ name, build: () => Object3D, joint, pos, rot, scale, always }] }]`. Joints: `head`, `torso`, `hips`, `body`, `root`, `handR`, `handL`, `elbowR`, `elbowL`, and `hands` (a carried object, placed every frame between both hands, turning with the body). Prop positions are in the character's own units (he is about 5.8 tall at scale 1). |
| `buildWorld(scene, ctx)` | yes | Builds the set and the machine once (seeded), returns `{ update(t, F, ctx), view?(v, F, i, ctx) }`. `update` poses everything from F; `view` runs before each view draws (per-view hiding, a bonnet folding in front of the lens). |
| `direct(t, ctx)` | yes | Pure: the frame state F at t (below). Called many times per frame (motion blur, pose blends), never stateful. |
| `STAGE` | no | `{ near (0.25), far (4200), fog ([700, 2900], or null), leadScale (0.42), skies (override any preset), shadowMin (10), shadowMax (190), aoRadius }` |
| `castAt(t, ctx)` | no | The cast states alone (`direct(t).cast`); the pose blends query it about 30 times near a change, so a cheap one saves time. |
| `shotAt(t, ctx)` | no | The shot id alone, for the same reason. |
| `OVERLAY_TYPES` | no | Extra text-layer types: `{ name: (item, api) => void }` (api below). |

`ctx`: `{ scene, renderer, THREE, cast: { who: character }, props: { who: { name: Object3D } }, world, lights: { hemi, sun, fill, rim }, LOOK, W, H, opts }`. `ctx.props.lead.log` is a valid overlay anchor.

The frame state F (`words.frame(t)` makes the skeleton):

| Field | What |
|---|---|
| `shot` | The cut id. Motion blur and pose blends never cross a change; the shot map and check.py read it. `useCamera` sets it. |
| `scene` | A label for the shot map. |
| `views` | `[{ cam: { p, l, fov, roll?, focus? }, rect: [x, y, w, h] fractions from the top left, interior?, sky?, env? }]`; one view, or two for a split. `useCamera` sets it. |
| `env` | `{ sky: 0 day, 1 dusk, 2 night (or "day", "dusk", "night"), storm: 0..1, hot: 0..1, flash: 0..1 (lightning, use flashAt), interior: bool, sunAz: degrees, grey: 0..1, dim: 0..2, dof: 1 }`. The last three are the post grade: `grey` mixes the frame to its luma (a rewind in greyscale), `dim` darkens it toward a cool night after tone mapping (1 keeps about 55% of the light; a storm the sky presets leave too bright), `dof` scales the depth-of-field blur (0 all sharp, for a frame with near and far subjects). A view's own `env` overrides them per view. |
| `cast` | `{ who: state or null }` (below). |
| `overlays` | Text-layer items (below). |
| `flySpeed` | World units per frame of the fastest flying part (`enter` raises it) so the blur follows parts. |
| anything else | Whatever the world's `update` reads (`fx`, `car`, `cut`, ...). |

A cast state: `pos, yaw, pitch, roll, scale, lie, visible, pose, arms` (an arm-only pose over the main one: `pose: "walk", arms: "carry"`), `emotion` (21 faces; default from the pose, e.g. worry gives "worried"), `from, mix, look, hop, talk, headYaw, headPitch, aimR, aimL` (aim an arm at a world point: point, press, pump, reach, reachOut), the pose parameters `walkPh, planted, run, carryUp, swing, pedal, turn, stroke, pull, kick, elbowL, elbowR, twist`, `prop: "phone"`, `props: [names]` (joint props shown), `carry: name` (the "hands" prop shown), `sweat: 0..1`, `sick: 0..1` (seasick green) or `flush: { color, k }`.

A minimal reel:

```js
import TL from "./timeline.js";
import { words, frame, useCamera } from "./kit/words.js";
import { shotList, hold, reframe } from "./kit/camera.js";
import { ov } from "./kit/overlay.js";
import { walkPath } from "./kit/pixel.js";
import { buildTerrain, buildSky, heights } from "./kit/props.js";

const { W, captions } = words(TL);
export const CAST = [{ who: "lead", kind: "lead", variant: "camo" }];
const WALK = { pts: [[-4, 0], [0, 2]], t0: W("b01", "take"), t1: W("b01", "stack"), scale: 0.42 };
const FILM = shotList([
  hold(0, { tg: [0, 1, 0], az: 20, el: 8, d: 9, screen: [0.5, 0.42] }),
  reframe(W("b01", "floors"), { tg: (t) => walkPath(t, WALK).pos, az: 40, el: 6, d: 6 }),
]);
const captionAt = captions({ hi: { b01: ["rubble"] } });
export function direct(t) {
  const F = frame(t);
  F.cast.lead = { ...walkPath(t, WALK), emotion: "happy" };
  useCamera(F, FILM, t);
  F.overlays.push(ov.pill("p1", "Roof", "red", W("b01", "roof"), W("b01", "stack"), [0, 3, 0]));
  const cap = captionAt(t);
  if (cap) F.overlays.push(cap);
  return F;
}
export function buildWorld(scene) {
  const ground = buildTerrain(scene, { size: [300, 300], seg: [60, 60], height: heights.flat(0) });
  const sky = buildSky(scene);
  return { update(t, F) { ground.update(t, {}); sky.update(t, F); } };
}
```

### The camera (camera.js)

`shotList(items, { points, move })` turns a list of framings keyed to words into the camera; `F` gets it through `useCamera(F, film, t)` (views, shot, and the white line of a split). Reframes are the default and cuts are opt-in.

| Item | What |
|---|---|
| `hold(at, framing)` | The camera holds a framing from `at`, drifting (default 0.7 deg/s round and 1.2% closer a second; theirs drift about 0.5 px a frame). The first item is always a hold. |
| `reframe(at, framing, { move })` | An eased move from the previous framing to this one, starting at `at` (a word) and lasting `move` (default 0.65 s), then a hold. Both framings keep drifting during the blend, so it leaves and lands at the drift's speed (the same C1 joins as camPath v2); distance blends in log space; the ease is the cubic in-out D-motion.md measured on theirs. |
| `follow(at, subject, framing)` | A reframe whose target is a function of t (a walking character, a car), `lag` s behind if given. |
| `cut(at, framing, { shot })` | A jump: a new shot id. Use only where the place changes. |
| `split(at, framingA, framingB, { rects })` | Two views (cause and effect), top and bottom halves by default; always a cut in and out. Labels use `view: 1` for the bottom one. |
| `fly(at, keys)` | A continuous camera path through keys `[t, [px, py, pz], [lx, ly, lz], fov?]` (Hermite through Catmull-Rom tangents, at rest at both ends); reframes into and out of it like any framing. |

A framing: `{ tg: [x, y, z] or "name" (opts.points) or (t) => [x, y, z], az, el (degrees round the target; az 0 looks from +z), d, fov (40), roll, screen: [fx, fy] (where the target sits in the frame; [0.5, 0.42] keeps it above the caption), drift: { az, el, d, tg, fov } per second or 0, lag, focus }`, plus view extras `rect, interior, sky, env`. `K`, `orbit` and `camPath` are still there for direction code written the old way.

### Words (words.js)

`words(TL)` returns `S(id)`, `E(id)`, `W(id, word, nth = 0, edge = "s")` and `find(word, nth, edge)` across the take. W matches by prefix , so `"you"` also matches "your" : `"=you"` matches the whole word only. `captions({ y: 870, hi: { beat: [words] }, naming: [beats] })` returns `captionAt(t)`, the one-word caption with the naming sentence and the `hi` words in yellow. `frame(t)` is the F skeleton, `pulse(t, a, b)` the naming highlight (a 0.4 s pulse starting dark), `seeded(id, k)` a deterministic number per id.

### The text layer (overlay.js)

Rules, for every type: labels pop in over 3 frames and shrink out over 4 (theirs; `popStyle: "spring"` gives D-motion's squash-and-stretch pop instead, `noPop`, `popD`); every text has its first letter capitalised by the layer (`cap1` in HTML too); anchored labels stay inside the frame with a 14 px margin, clamped by their final size so they do not slide while popping (`keepIn: false` to allow off-frame); labels that would sit on the active caption move up just above it (`capAvoid: false` to stop it); an anchor behind the camera hides its label. No watermark or brand text: the old `wm` type is ignored with a warning.

Common fields: `id, t0, t1, at` (a THREE.Vector3 or Object3D: a world anchor projected through view `view`, default 0; `[x, y, z]`: a world point; `[x, y]`: frame pixels from the top left), `dx, dy` (pixels), `view`. Constructors: `ov.pill, ov.tag, ov.badge, ov.arrow, ov.dim, ov.onom, ov.bubble, ov.num, ov.label, ov.cta, ov.rewind, ov.icon, ov.line`, and `ov.item(type, id, t0, t1, fields)` for the rest.

Phone size: measured on the reference at 720 wide (the reference reel), their pills carry about 31 px text in a 200 x 50 px pill, their name tags about 48 px, their badges about 85 px, their end call to action about 34 over 66 px; the kit's were 17, 30, 46 and 24 over 50. Their one-word captions measured the same as ours (50 px) and stay. Pills, tags, badges, arrows and the call to action are restyled at about twice the old size; the older gadgets scale as a whole (the factor in the table).

| Type | What (source) | Fields | Size at 720 wide (was) |
|---|---|---|---|
| `cap` | One-word caption (all) | text, hi, y (870), size | 50 px, kept |
| `pill` | White pill with a coloured dot and border (all) | text, color (red, blue, yellow, green, grey, purple, orange, pink or hex), scale, size | 32 px text, about 54 px tall (17 px) |
| `tag` | Tilted yellow name tag (all) | text, size (52), color, rot (-4); shrinks to fit the width | 52 px (30) |
| `badge` | Red X or green check (all) | kind "x" or "ok", scale | 80 px (46) |
| `arrow` | Force arrow, or rotation arrow with kind "curve" (all; `to` from the roof) | dir (degrees, 90 down) or to (a world point), len (140), color, w (11), r | 11 px stroke with a dark outline (7, no outline) |
| `dim` | Dimension line with end ticks and a label (skyscraper) | a, b (anchors), text, color, ldx, ldy, size (40) | 7 px line, 40 px label (5, 30) |
| `rewind` (`rw`, `rew`) | Rewind: style "scan" (skyscraper), "streaks" (airplane), "chip" (fridge) | style, y, at (chip) | full frame; chip 100 x 70 (74 x 52) |
| `icon` | Transport icon: kind "pause", "play", "ffwd", "rew" | kind, at [x, y] (default top right), size (80), blink | 80 px |
| `line` | White line between split views (all) | y, or x for a vertical split | 5 px |
| `hdr` | Huge outlined header word (engine) | text, color, at, size (74) | 74 px |
| `chips` | A row of chips, one lit (engine) | items [{ text, color }], active, at | 24 px (15) |
| `dial` | Four-quarter pie with a needle (engine) | items [4 x { text, color }], active, angle, at | x1.15 |
| `gauge` | C to H gauge (engine) | angle, lo, hi, at | x1.15 |
| `card` | Title over ring dials (engine) | title, items [{ n, a, b, color }], active, progress, at | x1.25 |
| `onom` | Shaking sound word (engine) | text, rot, size (58) | 58 px (38) |
| `qq` | Three question marks over a head (engine) | at | 64 px (46) |
| `cta` | The comment ask, a small line over a big yellow keyword (all) | small, big, at [x, y], size (34), bigSize (66) | 34 / 66 px (24 / 50) |
| `num` | Numbered circle (engine) | n, on | 60 px (40) |
| `label` | Plain outlined label at frame pixels (engine) | text, ax, ay, size (28) | 28 px (17) |
| `neq` | Red not-equal sign | at | 96 px |
| `arc` | Dashed yellow loop-back arc, drawn on (air conditioner) | from, to, lift, grow, fdx, fdy, tdx, tdy | 10 px (7) |
| `speedo` | Speedometer card (air conditioner) | angle, label, at | x1.35 |
| `tint` | Colour wash over the frame, under the labels (air conditioner, microwave) | color or css, k (else fades in 0.25 s, out 0.3 s) | full frame |
| `timer` | Stopwatch pill (microwave) | text, at | 32 px (24) |
| `readout` | Dark digital readout (microwave) | text, at | 34 px (26) |
| `counter` | Big number box (airplane) | value, sub, color, at | x1.35 |
| `thermo` | Small thermometer (airplane) | level, color, text, at | x1.4 |
| `thermoPanel` | Tall temperature panel that can shatter (light bulb's "thermo") | temp, shatter, at | 132 x 430 |
| `melt` | Full-frame furnace with metals melting (light bulb) | temp, metals [{ name, mp, c: [3 colours] }] | full frame |
| `bubble` | Speech bubble: "speech", "yay", "aww" (light bulb) | text (may hold `<br>`), kind, size | 32 px (25) |
| `energy` | Heat and light energy bar (light bulb) | title, heat, light, heatLabel, lightLabel, at | x1.3 |
| `slope` | Rise over run on three world points (roof) | P, Q, R, run, rise | 34 px labels (26) |
| `snow` | Snowflake badge (fridge) | scale | x1.35 |
| `clock` | Clock face (fridge) | angle, scale | x1.35 |
| `phase` | Liquid to gas card (fridge) | k, a, b, mid, at | x1.3 |
| `pgauge` | Pressure gauge with a reading (fridge) | angle, text, scale | x1.35 |
| `wtherm` | Wall thermometer (fridge) | k, text | x1.35 |
| `bill` | Power bill (fridge) | amount, title, jumpT, rot | x1.3 |
| `boom` | BOOM! starburst with confetti (fridge) | text | 330 x 300 |
| `cal` | Calendar flipping months (fridge) | months, step | x1.35 |
| `squig` | Wavy arrow (fridge) | to, amp, wl, speed, color, w (9) | 9 px (6) |
| `tempGraph` | Thermostat card with its history line (fridge's "thermo") | temp, on, hist, lo, hi, at | x1.25 |

 A reel's own type: `export const OVERLAY_TYPES = { name: (it, api) => { const e = api.el(it.id, () => document.createElement("div")); ...; api.place(e, x, y, api.s, 0, api.o, 0.5, 0.5, true); } }`; api is `{ el, place, anchorXY, project, cap1, fit, t, s, o, views, W, H }`.

### the lead Pixel and the girl (pixel.js)

`build({ kind: "lead" or "girl", variant, seat })`. The lead is the studio-3d model unchanged (variants camo, tee-red, tee-yellow, tee-orange, tee-blue; 21 emotions), now with `mats` (skin, for flushes) and sweat drops. The girl is new, on the same rig so every pose and emotion works on her: long hair (a crown set back from the face, a fringe, side locks, a long fall), a yellow bow, lashes, pink cheeks, a dress with a white collar and hem whose skirt hangs from the hips (the legs swing inside it), red shoes; variants dress-pink, dress-yellow, dress-teal, dress-purple.

The 65 poses (`POSES`, merged from the earlier builds; the latest on conflict): standing: wave, waveBoth, cheer, lift, point, pointL, pointUp, shrug, handsHips, headHands, hold, holdUp, pour, push, pull, press, pump, reach, reachUp, touch, recoil, burnt, proud, idea, nose, shiver, plug, scrape, window, overhead, umbrella, lookUp, sick; tools: raise, smash, lower, drum; moving: walk, walkPoint, run, bike, flap, fall, hang, lie; seated: sit, sitLap, sitRelax, sitWipe, sitFan, sitShiver, sitRemote, sitCheer, sofa, drive, key, yoke, slump, eat, phew; new: carry, carryHigh, worry, reachOut, hug. Renamed on conflict: a left-arm point is pointL. `addPoses({ name: fn })` adds a reel's own.

The new actions:
- **carry**: `{ pose: "walk", arms: "carry", carry: "log" }` walks holding the cast prop "log" (joint "hands") in both hands; it sits between the hands every frame. `carryHigh` holds a beam at shoulder level.
- **worry**: hands to the head, a fretful rock, the face "worried" unless the state names one.
- **walk along a path**: `walkPath(t, { pts, t0, t1, scale, stride, ease, face, gait })` returns `{ pos, yaw, pose, walkPh, planted, moving }` to spread into the state. Position goes by arc length on a trapezoid speed profile, the yaw follows the path (rounded at corners) and turns to `face` after arriving, and the walk phase is the distance walked over the stride, so the legs slow with the body; `planted` swings the hips on a near-triangle wave so the stance foot moves back at almost the body's speed. Measured on the demo's walk at 2 m/s: the planted foot travels 17.7% of the body's distance (the old clock-driven phase: 31.3% at that speed, worse the further the speed is from its fixed 1.4 m/s). `pathLength(pts)` and `walkTime(pts, speed)` size a walk: earlier builds walked about 1.3 m/s at scale 0.42; up to 2.5 m/s reads as brisk; faster, use `gait: "run"`.

### Props (props.js, vehicles.js)

Built once with fixed seeds, posed as a pure function of t and a state (null hides). Effects are all in `buildEffects(scene, opts)`, whose `update(t, F.fx)` poses each from its key (`opts.name = false` skips one, an object passes options).

| Builder | State (in update) | Source |
|---|---|---|
| `buildTerrain(scene, { size, seg, center, height, waterY, jitter, colors, far, section })` | `{ cut }` hides the near half to show the section; `section.draw: false` splits the near half without building the soil block, for a reel that draws its own moving section | sk ground + soil, generalised |
| `heights.flat / river / hills / add`, `groundFn(height)` | pure height functions; groundFn is the ground the terrain draws, for standing things on it | new |
| `soilLayers({ rockTop, clayTo, topsoil })`, `SOIL`, `rockTexture` | the section's layers (topsoil, clay, sand, rock with the rock texture) | sk |
| `buildWater(scene, { x, z, y, flow, speed, color, section: { z, bed } })` | `{ waves, speed, foam, cut, rings: [{ at: [x, z], r, k, ph }], splashes: [{ t0, at, size }] }` | new, after ap's lake |
| `buildSplash(parent)` | `update(t, t0, at, size)` | ap |
| `buildSky(scene, { n, r, h, scale, center, sunAt, moonAt, drift })`, `cloud(seed, s)` | `update(t, F)`: sun by day, moon at night, clouds drift and darken in a storm | sk + en |
| `buildTrees(scene, { at: [[x, z, s]], ground })`, `scatter(seed, n, box, avoid)`, `tree(seed, s)` | static (two draw calls for any number) | sk, en |
| `fellTree(scene, { seed, s, h })`, `fallK(t, t0, d)` | `{ pos, yaw, chop, fall, stump }` | new |
| `buildRoad(scene, { along, at, from, to, w, y, kerbs })` | static | en |
| `house(seed, color)`, `arrow3d(len, r, color, { opacity })` | static | en, ap |
| `buildDust` | `[{ t0, at, r, n, dur, size, rise, h, op, te }]` | sk |
| `buildDebris(scene, { color, size })` | `{ t0, at, dir, w, h, floor, size, life }` | sk chunks |
| `buildWind` | `{ t0, t1, box: [x0, x1, y0, y1, z0, z1], k, len, thick, op }` (op: opacity, 0.7; at len 9 and full opacity the streaks read as fat white bars across a wide storm frame: the bridge uses len 3, thick 0.04, op 0.3) | sk |
| `buildStreaks` | `{ t0, t1, at, dir, spread, travel, life, len }`; build options `width`, `opacity`, `order` (render order: 3 draws them over a see-through section's water face, which is drawn at 2; added for the bridge) | ap |
| `buildRain` | `{ k, c, w, h, v, len, wind: [dx, dz], alpha, thick, floor, cam, near }` | rf |
| `buildLightning`, `flashAt(t, times)` | `{ times, at, h, w }`; put `flashAt` in `F.env.flash` for the sky and fill | new |
| `buildDrips` | `{ t0, t1, at, h, size }` | sk |
| `buildFlowDots` | `{ t0, t1, paths: [[[x, y, z], ...]], speed, size }` (weight down beams, water in pipes) | sk load dots |
| `buildConfetti` | `{ t0, at, spread, size }` | sk |
| `buildHearts` | `{ t0, at, n, spread, rise, size, yaw (the camera's azimuth), life, stagger }` | new |
| `buildSparks` | `{ t0, t1, at, dir, size }` | ap |
| `buildSunbeams` | `{ k, at, step, ry, tilt }` | sk |
| `buildFire` | `{ t0, at, size, k }` | ap |
| `buildCar(scene, color)` (vehicles.js) | `{ x, y, z, yaw, dist, bonnet, bob, pitch }`; `viewFrom(camP)` folds an open bonnet in front of the lens; scale `car.root` (0.42 next to a 0.42 lead) | en |
| `buildBike(scene)`, `carToWorld(c, lx, ly, lz, scale)`, `driverOf(c, { carScale })` | `{ x, y, z, yaw, dist, pedal }`; driverOf gives the lead's seated state | en |

A flow pipe is `kit.js tube(points, r, material)`.

### Parts (parts.js)

`enter(F, t, t0, spec)` returns a part's entrance: with `spec = { from, via, rot, d }` it flies in along an arc and settles (D-motion technique 1, their grammar) and raises `F.flySpeed`; without a spec it springs in with squash and stretch (technique 4). In the world: `const sh = shower(); sh.begin(); sh.show(mesh, value); ...; sh.end();` (the fly offsets go on last, over the frame's pose; a part's home pose is the only cached state). `highlight(material, k)` is a naming highlight that keeps the part's hue (below). `worldOf(obj, local)` gives a world point for labels and cameras.

### The quality research (A, B, D merged; C not)

- **A, rendering**: all eight ranked upgrades went into the engine build for v3 and are in the kit as they were: exposure and neutral tone mapping, the gather depth of field focused per view, physical glass and image-based light, bloom on HDR glows behind the clamp, 2x supersampling, the rim light per view, N8AO at Medium, the grade and vignette (`look.js` switches, `fx.js`, the post stack in `stage.js`). Nothing in its list was left unmerged. Left out, as A found: VSM shadows, the stock pmndrs DOF, AgX, N8AO Ultra, path tracing (hours a reel, needs seeding).
- **B, objects**: its modelling kit (`shapes.js`: rounded boxes, bevelled extrusions with holes, lathes, creased normals, hulls, gear rings, gradients, edge-lit glass, window glass, gloss paint, contact shadow, toy wheel) and its car are in. Newly merged: point 6, a naming highlight that keeps the material (`parts.highlight`; kit.js `tint()` bleached the gold crank pale), opt-in. Left out: the CC0 assets (B advises against them for hero parts; attribution would need a ledger), loop subdivision and outlines (B rejected both), restyling the trees, houses and clouds (B left them; restyling is art direction).
- **D, motion**: techniques 1 to 5 went into v3 and are in (flyIn and popSS in `kit.js`, the blur and pose blends in `stage.js`, camera v2 in `camera.js`). Newly merged: `parts.enter`/`shower`, the fly-in and spring pop for any reel's parts ; `popStyle: "spring"` for labels, as D suggested (opt-in, since theirs pop in 3 frames); the seek-order determinism test, now for the kit (`demo/tools/determinism.mjs`). Left out, as D found they did not help: the "snappy" ease, camera overshoot and settle, handheld drift, the 180-degree shutter (their switches stay in `motion-config.js`); the engine-only explosion-flash timing.
- **C, art direction, not adopted (the call)**. Adopting it would change: the palette (a desaturated room, parts in function families, isolation greying everything but the named part), the set (a warm dim workshop with a pool of light instead of the hemisphere flood), the caption (Nunito Black 54 px, the keyword on a family-coloured box instead of yellow text), the labels (leader-line chips: dot, 3 px leader, a 46 px chip with a colour swatch, at most two, inside a safe box x 48 to 570, y 180 to 832, instead of floating pills and tilted tags), a four-segment progress bar instead of the stroke header, stickers instead of round X and check badges, 3D arrows instead of 2D. In the kit that is new overlay types and default styles, a LOOK and SKIES preset for the workshop and a scene-greying helper beside `highlight`; the contract would not change. C also lists what copies the reference: the pill, tilted tag, badges, header, dial, gauge, card, "???", the stacked comment ask; the kit keeps them because the eight reels use them.

### Render cost

The demo's final render: 15.6 s in 25.6 s (draft, 4 workers; 1.64 s of render per second of video; the first render took 30.7 s). The skyscraper v3: 147.7 s in 4 min 36 s (1.87 s per second, high quality). A 150 s reel on the kit should land at 4 to 5 minutes, inside the 1.3x budget; what scales the cost is motion-blur sub-frames on fast moves (up to 24 a frame), the water's per-frame wave update (about 3,000 vertices) and the rain instances.

### The demo and the checks (`demo/`)

`demo/build/` is a reel per the contract (index.html, hyperframes.json, meta.json, package.json, fonts, `js/reel.js`, `js/timeline.js`: the skyscraper take's first two beats) on a river with a cut-away section, trees, a road with the blue car, rain and lightning; the lead walks along a path, picks up a log, carries it, drops it and worries in the storm; the girl waves from the far bank; a hold, a follow of the car and of the lead, reframes, a split, a cut to the section, pills, tags, badges, a bubble, a dimension line, captions, hearts and confetti.

```bash
cd <reel folder>
sh tools/sync_kit.sh                        # kit/js -> build/js/kit and smoke/js/kit (compose.py does this for a reel)
node tools/stills.mjs s4 0.5,4.3,8.5        # stills to renders/s4/; /usr/bin/python3 tools/sheet.py renders/s4 8 180 tiles them
node tools/determinism.mjs                  # ten frames (blurred moves, fly-ins, pose blends, the split, hearts) in three seek orders
node tools/smoke.mjs                        # every prop, effect, pose and overlay type built and drawn; expects one warning (the watermark ignored)
cd build && lockf -k /tmp/studio-3d-render.lock caffeinate -i npx --yes hyperframes@0.8.181 render . --quality draft --workers 4 --player-ready-timeout 240000 --browser-timeout 240 --output ../renders/demo.mp4
```

Proved: the contract renders end to end through HyperFrames (`renders/demo.mp4`, 468 frames, no black or frozen frame by ffmpeg's detectors); every frame hashes the same in three seek orders, canvas and text layer; the smoke test draws 65 poses on both characters and all 41 overlay types with no error. After the bridge's kit additions (the `icon` type, `env.grey` and `env.dim`, the wind's `op`, the streaks' `order`): the smoke test draws all 42 types, cycles the grade, and passes with its one expected warning. Stills that show the kit best: `renders/s4/t004.50.jpg` (the carry, pill and badge at phone size), `renders/s4/t006.00.jpg` (storm, lightning, rain, worry, dust), `renders/s4/t009.00.jpg` (the split, both characters, caption-avoid), `renders/s4/t012.00.jpg` (the soil section and river profile), `renders/s4/t015.00.jpg` (hearts and confetti).

### Traps and limits

- `W()` matches prefixes ("you" finds "your"); use `"=you"`.
- A rewind (theirs: a failure plays out, then about 0.7 s of the same shot backwards in greyscale with scan lines, ending on a white flash) is a pure function: for the window, `direct` evaluates the film at a mirrored earlier time `tm = a - (t - a) * back / 0.7`, sets `env.grey = 1`, adds `ov.rewind` and a white `tint` for the flash, and puts `tm` in the frame (the bridge's world reads `F.tw ?? t`) so water, particles and splashes run backwards too. The flash is a hard change for frame_qa: declare a shot change at it (the bridge suffixes its shot ids with the count of flashes so far), and do the same for lightning that brightens the whole frame. Worked example: `bridge/build/js/direction.js`.
- A walk's time span sets its speed: size it with `walkTime` (the demo first walked 16 m in 1.85 s and the legs blurred).
- The section is a z-plane seen from +z; a river for a cross-section runs along z (`heights.river({ axis: "z" })`). The terrain is a rectangle: make it long along the river (fog hides the ends); beyond it a flat ring of ground.
- The carried object turns with the body, not with the torso's lean.
- Hearts face `yaw`: set it to the camera's azimuth in radians.
- Puppeteer reports `console.warn` as "warn": both `kit/tools/stills.mjs` and `demo/tools/stills.mjs` catch "warn" and "warning", so an unknown pose or overlay type prints as `console:` in check.py --stills.
- The girl is the kit's first second character on the rig: new emotions or poses should be checked on both (`smoke.mjs`).

### The second version: mirrored, another season, another song


- `/usr/bin/python3 ../kit/tools/variant.py [--season autumn] [--bed playful] [--no-mirror]`: compose, mix the reel's voice and effects on the other song (`renders/mix-<bed>.wav`), copy `build/` to `_variant/build` (git-ignored) with the switches set, render behind the lock to `renders/<slug>-en-vN-mirror-autumn-playful.mp4`, check it.
- **Mirror** (`window.__MIRROR`, set before the stage loads): `stage.js` flips the canvas with CSS; `overlay.js` (`MIR`) mirrors where world-anchored labels sit (`project()` gives `W - x`, an anchor's `dx` is negated) and the fixed `dir` of world-anchored arrows (`180 - dir`); arrows aimed with `to` follow by themselves; the letters and the frame-pixel items (icons, captions, comment ask, thermometers) stay as they are. A plain ffmpeg `hflip` mirrors the text too.
- **Season** (`window.__SEASON`, `season.js`): `"autumn"` maps the kit's summer greens to straw and olive-gold grass, ochre hills, orange, red, yellow and amber leaves (`S(hex)` where colours are baked into vertices, and `recolour()` over every material once the world is built, so a reel's own greens follow), the lead's camo to burgundy, rust and mustard (`CAMO`), a warmer day sun (`SKY`). Summer changes nothing.
- **Learned on earlier reels:** words painted into 3D textures read backwards in the mirror : the kit now marks every canvas that gets text and flips those textures back in their UVs (`season.js`, `unflipText`). A frame-fixed item can land on the content once the 3D is mirrored (the light bulb's and the cockpit's thermometers sat on the bulb and the lead's head): look at the variant's stills for frame-fixed items and move one when it covers something. Interiors have few greens: their second version also shifts walls, cabinets and floors to a warm palette, keeping the colours that carry meaning (red X, green check, yellow highlight, hot red, cold blue, seasick green). A real song can make the AAC encode peak over -1 dBTP although the WAV sits at -4: HyperFrames then turns the whole track down (the skyscraper's variant came out 1.3 dB quiet); `sfx.mix` now checks the AAC peak and adds a 16 to 19 kHz lowpass when needed. A darker set can push a two-frame glow over the cut detector's threshold: an "extra" cut that sits on the original's own glow is not new.
- **Song** (`music.py`, `sound.py --bed`): a reel's `cues.py` may list `MUSIC = {name: {prompt, seconds, model}}`; `music.py <name> --spend` buys one track from ElevenLabs Music (`music_v2_5`, instrumental; state the cost first, about 900 credits a minute, unconfirmed; the plan allows 2 requests at once). Shared tracks live in `kit/assets/music/` (git-ignored as audio): `playful.mp3`, the pick for the mirrored versions for now. `sfx.mix(bed_file=...)` level-matches a track to the synthesised bed and loops one shorter than the reel with a 2 s crossfade.

## Tools

`kit/tools/`, one copy of each, always run from the reel's folder as `/usr/bin/python3 ../kit/tools/<tool>.py` or `node ../kit/tools/<tool>.mjs`. Use `/usr/bin/python3`: it has numpy and cv2.

### The tools

| Tool | What it does |
|---|---|
| `common.py` | Shared paths: the reel (cwd, or `REEL=`), the kit, the reference video and transcript from topic.json, the repo's `.env`. |
| `make_beats.py` | The reference's sentences (split at `.`, `?`, `!`, exactly as the approved reels' did) against `lines.py`; writes `beats.json`; leaves their page's name out of the Portuguese. |
| `sfx.py` | The sound library: the union of the approved reels' synthesised effects (114, indexed at the top of the file), the bed, the ducking, the mixer (loudnorm, plus one measured gain step when it lands more than 0.2 LU off). |
| `sound.py` | Runs the reel's `cues.py` against `timeline.json` and mixes `build/assets/mix.wav`. |
| `compose.py` | Copies `kit/js` fresh into `build/js/kit/` (+ `VERSION`: content hash and git state), writes `build/js/timeline.js` in the reels' format, `index.html` (imports `./js/kit/stage.js` and `./js/reel.js`, calls `createStage(canvas, root, reel)`), the json files and fonts. Writes a file only when its content changes, so the probe stays fresh. |
| `shot_map.mjs`, `shot_map.py`, `shot_map.template.html` | The probe (every 0.1 s: shot, labels, cameras; blur off; free port) and the shot map page from it. Scene titles from `SCENES`. |
| `stills.mjs`, `sheet.py`, `tile.py` | Stills from the build at given times, tiled; `tile.py` tiles HyperFrames snapshots. |
| `frame_qa.py`, `empty_frames.py` | Every frame (blank, flash, frozen, cuts against the declared shots); frames empty but for the caption. Both run inside check.py. |
| `check.py` | One command after a render, numbers first, then the stretches to look at; writes `renders/<name>.check.json`; exit code 1 on any failure. See below. |
| `render.py` | compose, then `lockf -k /tmp/studio-3d-render.lock caffeinate -i npx --yes hyperframes@0.8.181 render . --quality delivery --workers 4 --player-ready-timeout 240000 --browser-timeout 240` to the next free `vN`, log in `renders/render-vN.log`, then check.py. |

### check.py

Fails on: wrong size, frame rate or no sound; a render not the composition's length (±0.1 s); loudness outside -14.5 ± 0.5 LUFS; blank frames, one-frame flashes, frozen stretches over 1 s; a hard cut where the code declares no shot change; a frame empty but for its caption. Warns (listed, exit 0) on: a declared shot change with no visible cut, true peak over -1 dBTP, loudness range over 8 LU, a length more than 0.5 s short of or 2.5 s past the reference. Size, length and loudness findings are listed as film-wide; the rest as time ranges to look at. The shot map probe is run again first when any build file is newer than `renders/shotmap/probe.json`; `--probe <file>` uses a given one as it is. `--sheets` writes a 6 fps contact sheet only for each flagged stretch (`renders/<name>-check/`), so eyes go only there. `--stills 10,20.5,33` and `--beats b05,b07` run compose and stills.mjs and tile `renders/stills/_sheet.jpg`, no render.

