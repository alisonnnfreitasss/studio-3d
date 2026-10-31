# Cinematic mode

A dark, photographic look for a 3D explainer reel, on the same stage, timeline, tools and text layer as every other reel in this kit. It adds one module, `js/cine.js`, and one folder of open-licence assets, `assets/cine/`. The rules below come from building a 3-minute realistic film in this engine, act by act, and measuring every pass.

## When to use it

| | Explainer (the default) | Cinematic |
|---|---|---|
| Reads as | A bright toy world you built yourself | Footage of the real thing, at night |
| Lead | A character on screen | No character, or a real person layered in |
| Good for | How a machine works, step by step, with a joke | Scale and awe: networks, planets, what is hidden under or inside things |
| Light | Even daylight, soft shadows | One or two directed lights, most of the frame near black |
| Text | Big one-word captions, pills, tags, badges | A small lower caption, a large title, a number readout |
| Cost | About 1.7 s of render per second of video | Expect more: textures, several sub-frames on fast rides. Measure yours |
| Fails when | The topic needs weight | The topic needs a part labelled and explained: dark scenes hide parts |

Pick by what the viewer should feel. If a viewer should point at a part and name it, use Explainer. If a viewer should think "I did not know that is down there", use Cinematic.

## The rules, with what was measured

### 1. Realism lives in surfaces and light, not in geometry

- With framing matched to the pixel, procedural textures still read as graphics. The gap closed when photographed maps went on: colour, normal and roughness together.
- Density beats modelling: a desert ground improved going from 26,000 coarse stones to 64,000 at half the size over a photographed soil. Stones were simple lumps.
- A light that grazes the surface makes a normal map read. Use a low angle (10 to 16 degrees) and put it behind the subject when you can. `cineView` does this with the stage's own sun.
- Keep one real moving light. Its pool on the ground is most of why a glow reads as light, not as a sticker.
- Reflections need a real room. An HDR of a photographed space on metal and glass does more than any extra polygon.
- A tiled photograph repeats visibly across a ground. Break it up (`texturedGround` does) before adding anything else.
- Close the far end: fog that fades to the same colour as the sky's horizon. A mismatch draws a hard line where the ground stops.
- Colours measured on a finished dark film sit lower and greyer than you expect. Sea on a night planet: about RGB 16, 26, 55. Do not let the moonlit side go brighter than a faint tint, or it reads as daytime.

### 2. The camera rides with the subject

- Variety goes into the look and the metaphor, never into a calmer camera. A defect check will pass a calm clip: it is not a motion check.
- A held wide shot of a moving light read as static next to a camera travelling beside it. Use `rideCam`.
- Set targets before building: fast moves per 10 s, share of frames held, longest gap with no camera event. A reel that worked measured 4.8 to 9 fast moves per 10 s with about 26% of frames held.
- Feel lives in short fast cores between slow stretches: a zoom of x0.63 in 4 frames, with slow segments either side. Write keys for that (`keysAt`) instead of one long ease.
- Hide cuts inside devices: a match cut on a light, a cut inside a blur. Frame checks found zero hard cuts in stretches built this way.

### 3. Measure motion with the right tool

- Dark scenes hide camera travel. Feature matching called one travelling shot "nearly still"; dense optical flow showed a camera moving 10 times faster than the reel's. Check every slow stretch with dense flow.
- Motion blur hides speed too. In a smeared stretch both flow and tracked features read near zero exactly where the move is fastest. Measure there from streak length, or from objects passing.
- Sharp procedural textures read as camera motion where soft ones read as held. Compare the motion class per frame, not counts of moves: one 300-frame test agreed on 195 frames.

### 4. Fit cameras to measured frames

When a shot has to land somewhere exact (a storyboard frame, a plate, a client's layout), do not eyeball it. Read the positions off the target frame, then solve the camera by least squares.

- A globe pull-out fitted to its limb circle landed within 1 px.
- Plane fits ran under 1 px rms; frame-to-frame point chains 0.1 to 0.5 px; fits to thin lines on a globe 1 to 6 px far and 2 to 9 px close.
- A fit can reveal what the eye missed: one hold thought to sit on a straight line was a separate settle, and needed its own solve.
- Do not fit what you cannot see: a near-textureless wall gave no flow. Use something that crosses it.

### 5. The side-by-side is the fix list

Render target left, current right, frame numbers on both. "It does not feel right" then becomes named frames.

- Every pass fixes the list, then the list is written again. Ten seconds took 5 to 17 passes; a 30 s act took 4 to 12.
- Keep what still differs in the notes, with frames. "Still differs" is a real section, not an admission.
- Target and result can disagree about one object: one film needed two different models of the same crystal, a fat one and a thin one, either side of a dissolve. Measure before assuming one model covers both.

### 6. Cut voice takes in real pauses

Word alignment from a voice API runs late on word starts: usually 50 to 100 ms, 170 ms on some words, about 200 ms on the first word of a take. Cutting at aligned times clips words: across 8 reels, 325 of about 600 cuts fell inside a sound.

- Measure loudness every 5 ms, take the longest quiet run within 150 ms of each boundary, cut there with 20 ms of air before and 40 ms after, and 10 ms fades. That left 2 cuts inside a sound, both where the take never paused.
- Leave the word timeline alone, so captions and cues do not move. `tools/voice.py` does all this.
- Do not check cuts against aligned edges: it flags the very cuts that fix the problem.
- A speech tool can invent sentences in digital silence at the end of a track. Check the waveform first.

### 7. Mirroring with readable text

- The goal is a mirrored picture with every word still reading normally. A plain video flip reverses the text.
- This kit flips the 3D canvas with CSS and the text layer keeps its letters. That has rendered correctly here. Another film on the same renderer found CSS on the canvas ignored at capture, and needed a last post-processing pass that sets `uv.x = 1.0 - uv.x`. Check one rendered frame before trusting either.
- Words painted into a 3D texture read backwards in the mirror. The kit flips marked canvases back at build, which includes `cinePhone`'s screen as long as `draw` paints text on its first call. That flips the whole screen, so the screen's layout does not mirror. If a finger or a part must land on the mirrored side, flip each text block in place instead.
- Test: the mirror should equal the normal render flipped, except inside text blocks. Diff it, and read every text on sheets. In one film OCR read the same words in the mirror and none in the flipped control.
- Tell the viewer's side of it: continents show mirrored geography, side-by-side numbers swap reading order, and frame-fixed items may land on a subject.

### 8. A presenter inside the graphics (optional)

Real footage beats any modelled person. `cine.js` has no helper for this and `compose.py` does not add the clips today: it is per-reel work.

- Layers, back to front: room footage, 3D canvas (hidden when the room shows), graphics under the person, the person cut out, graphics over the person, captions.
- Cut the person out locally with `npx hyperframes remove-background` (about 10 fps; VP9 alpha WebM). Blend the matte's edge toward the darkened room, or the old wall stays as a halo.
- Over a darker room, a matte can leave a band about 20 px wide of old wall between curls of hair. Key it by absolute colour excess, not a ratio; dark hair makes a ratio into noise. Keep the untouched matte.
- If the narration is a cloned voice, keep the person's own take on on-camera lines so the lips match. End a slice at the next word's real onset on the waveform, since a transcript can be 60 ms late: a 30 ms onset left in a slice became a made-up word after speech-to-speech.

### 9. Time maps for long films

- Key every scene to film time, never to seconds of one voice take, and map voice time onto it. One act went from 618 frames to 559 when the voice changed, with no scene edits.
- Make the map elastic: fast moves keep near their speed and holds stretch.
- Pin cuts into presenter footage as fixed anchors in the map, so lips stay on the audio.
- `keysAt` is enough for a short reel. A long film needs a map file that every act imports.

### 10. Parallel builders by act

- Start and end each act on a hard cut, so nothing crosses a seam. Then one builder per act can run at the same time; a final tool joins them, merges sound cues and adds captions.
- Six acts ran this way. Give each builder the act's frame range, the look, the shared modules and the targets in rule 2.
- A shared piece should be copied into an act only when it must change, and noted as such.
- Render one at a time: two renders at once stall each other. The kit's render tool holds a lock.
- Budget for it: one mirroring pass alone took 240k to 860k tokens per builder.

### 11. What failed

| Tried | Why it failed | Instead |
|---|---|---|
| Drawn, animated cells for a molten surface | High contrast read as graphics and as camera motion | Soft, still cells; most of the frame not moving |
| An unwelded sphere for a rounded object | Every face shaded flat | Weld vertices, or smooth lumps |
| Noise lookups for rock shape | Folds along the seams read as cut shards | Smooth lumps from sines of the direction |
| Capsules for a hand | Stacked capsules read fake at once | A skinned hand model with contact shadows, or real footage |
| A real point light for screen glow | A white dot mirrored in the glass | A soft quad behind the phone |
| A strong moonlit day map on a night planet | Read as daytime with lights stuck on | Dim it to a faint tint |
| Tight lay on a wire rope | Read as a ribbed hose | A long lay, about 6 to 10 degrees off the axis |
| Large halo sprite | Tone mapping lifted its faint edge into a visible disc | A much steeper falloff |
| One even ease on a move | Lost the snap the shot needed | Keys with a fast core |
| Captions that rise in over many frames | Slower than the cut they sit on | Captions in 1 to 2 frames, no rise |

## How a builder uses `js/cine.js`

Set `"format": "cinematic"` in the reel's `topic.json`, or pass `--format cinematic` to `tools/new_topic.py`. `compose.py` then copies `assets/cine/` into the build. Run the normal tools: `make_beats.py`, `voice.py`, `sound.py`, `compose.py`, `check.py --stills`.

| Export | What |
|---|---|
| `cineLook(over)` | At module level. Sets the page's `LOOK`: AgX tone mapping, bloom, depth of field, vignette, no automatic rim |
| `preload({ sets, earth, hdr, fonts })` | With a top-level `await`. Loads assets and makes the renderer wait for them. Sets: `sand rock soil metal concrete iron wood`. HDRs: `studio dusk workshop` |
| `cineStage({ skies, fog, near, far, aoRadius })` | The `STAGE` export. `skies` are presets for `env.sky` 0, 1, 2: `night abyss dusk void space`, or your own (`CINE_SKIES`) |
| `CINE_OVERLAYS` | The `OVERLAY_TYPES` export |
| `useHdr(ctx, name, { rotation })` | A photographed room as the scene's reflections |
| `cineView({ az, el, fill, env })` | The world's `view` hook: low key light, no fill. A frame's `F.key = { az, el, k, env }` overrides it per shot |
| `pbr(set, { repeat, normalScale, ...fields })` | A material from a set |
| `texturedGround`, `rollingHeight`, `noise2`, `scatterStones` | A ground with tiling broken up, its height, and stones sat on it |
| `skyDome`, `farLights` | A dark sky with a horizon haze; soft distant lights for depth |
| `cineCable` | A textured tube, or wires wound round a core with `strands` and `lay` |
| `pathGlow`, `lightPulse` | A bright stretch travelling along a path; a moving light with a core, halo, lens streak and real point light |
| `floatingDust` | Particles wrapping round a centre; pure in `t` |
| `nightGlobe`, `globeCam` | The Earth at night with `latLon`, `arc` and `worldAt`; a camera over a point of it |
| `cinePhone` | Metal frame, reflecting glass, a screen painted from a canvas by your `draw`, lens bump |
| `keysAt`, `rideCam`, `useCam`, `showOnly` | Monotone keyed timing; a camera that rides a curve; a camera on the frame with a shot id; one place visible |
| `cine.title`, `cine.counter`, `cine.label`, `cine.grain`, `cineCaptions`, `countUp` | The text: title, number readout, world-anchored label, film grain, lower captions in chunks, a running number |

Every builder is seeded and every update is a function of its arguments, as the kit requires. Frames can be drawn in any order. Several places can share a scene: build each in a `Group` far from the others, set `F.place` in `direct` and call `showOnly` in `update`. A world unit is free: the phone defaults to 1.6 tall, and the globe to radius 100.

A minimal reel, `build/js/reel.js`:

```js
import TL from "./timeline.js";
import { frame } from "./kit/words.js";
import { cineLook, preload, cineStage, CINE_SKIES, CINE_OVERLAYS, cine, cineCaptions, useHdr, cineView, keysAt, rideCam, useCam,
  texturedGround, rollingHeight, scatterStones, cineCable, lightPulse, floatingDust, skyDome } from "./kit/cine.js";

cineLook();
await preload({ sets: ["soil", "rock", "iron"], hdr: "studio" });

// no character; fog fades to the same colour as the sky's horizon
export const STAGE = cineStage({ fog: [5, 34], skies: [{ ...CINE_SKIES.night, bg: 0x0a1226, hemi: 0.8 }, "void", "space"] });
export const OVERLAY_TYPES = CINE_OVERLAYS;
export const CAST = [];

const captionAt = cineCaptions(TL, { keys: [] });
const along = keysAt([[0, 0.1], [TL.duration * 0.4, 0.14], [TL.duration, 0.24]]);   // slow, a faster core, slow
let ride = null;

export function direct(t) {
  const F = frame(t);
  useCam(F, ride(along(t)), "a");
  F.key = { az: 155, el: 10, k: 2.7, env: 0.08 };
  F.overlays.push(cine.grain(0.06));
  const cap = captionAt(t);
  if (cap) F.overlays.push(cap);
  return F;
}

export function buildWorld(scene, ctx) {
  useHdr(ctx, "studio");
  const height = rollingHeight({ seed: 4, amp: 0.2, scale: 5, oct: 5 });
  texturedGround(scene, { set: "soil", size: [46, 110], seg: [260, 500], center: [0, 0, -20], tile: 2.3, height, color: 0x6f7690, normalScale: 2 });
  scatterStones(scene, { n: 5000, area: [[-9, 9], [-74, 34]], size: [0.012, 0.26], at: height, keepOut: (x) => Math.abs(x) < 0.3, color: 0x8d8f9e, tile: 1 });
  skyDome(scene, { horizon: 0x0a1226 });
  const path = [];
  for (let z = 30; z >= -72; z -= 1.5) path.push([0, height(0, z) + 0.08, z]);
  const rope = cineCable(scene, { path, r: 0.07, strands: 14, lay: 1.9, color: 0x9ea6b8, metalness: 0.9, roughness: 0.75, tile: 0.6 });
  const light = lightPulse(scene, { path: rope.curve, size: 0.13, boost: 7, light: 0.8, reach: 4.5, lift: 0.1, streak: 0.55 });
  const dust = floatingDust(scene, { n: 1400, box: [9, 3.2, 12], size: 0.016, opacity: 0.75 });
  ride = rideCam(rope.curve, { back: 2.5, up: 0.85, side: 0.7, ahead: 0.6, lift: 0.28, fov: 34 });
  return {
    view: cineView(),
    update(t, F) { light.update(along(t) + 0.012); dust.update(t, F.views[0].cam.p); },
  };
}
```

## The checklist for each scene

Before any render, from `check.py --stills` at full size:

1. Is every large surface a photographed set, with colour, normal and roughness?
2. Is a tile repeat visible anywhere across the frame?
3. Is most of the frame dark, with one clear place to look?
4. Does the key light graze the surface and come from behind or the side?
5. Does the moving light really light something near it?
6. Does the ground fade into the sky with no hard line?
7. Is there something near, something at the subject and something far (dust, stones, distant lights)?
8. Does the camera travel on every shot? Are its targets written down and measured with dense flow?
9. Do the moves have keys with fast cores, and are cuts hidden in a device or declared with a shot id?
10. Do metal and glass reflect a room? Is any white dot a mirrored point light?
11. Do the captions stay clear of the subject and of the phone app's lower safe zone?
12. Does every number shown come from a source, or is it marked illustrative?
13. Do the same frames come out identical when drawn in a different order?
14. If a mirrored version ships: does every word read, and is what lands on the mirrored side still right?
15. Does `assets/cine/LICENSES.md` cover any asset you added?

## Traps found on the first real run

- Keep the base of every `pow()` in a shader at zero or above. One NaN pixel becomes a black frame after bloom. `check.py` catches it as a one-frame flash.
- An eased swell that jumps in a single frame reads as a hard cut. Spread it over the move.
- A full-white transition hides white captions for as long as it lasts. Keep it short or move the caption off it.
