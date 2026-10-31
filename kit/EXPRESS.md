# Express: the short guide

One builder makes the whole picture from the kit. Read this, then `demo/build/js/reel.js` (a worked reel) and `timeline.json`. Open `README.md` only to look up something specific (grep it). Open `FORMAT.md` only for the section you need.

## Must hold
- **The lead is in the reel.** `CAST = [LEAD]` from `./brand.js`, visible and acting on the problem and the payoff: `F.cast.lead = { pos, yaw, pose, emotion }`. He stands beside or in front of the machine, in frame, not hidden by it.
- **The science is right on screen.** Forces point the real way (buoyancy up, weight down, lift up). Check each arrow's `dir` (degrees, 90 is down, -90 is up).
- **Every beat shows what its words name,** whole and centred. Labels start with a capital letter, land on the word and do not cover the subject. Say it once: no two labels for one thing.
- No brand, watermark or page name. Only `kit/js` assets and simple shapes from `shapes.js`.

## Quick reference
- Words: `const { W, S, E, captions } = words(TL)`; `W("b02", "hollow")` is that word's start. `"=you"` matches the whole word.
- Frame: `const F = frame(t); useCamera(F, FILM, t);` then fill `F.cast`, `F.overlays`, `F.env`; push `captionAt(t)` last.
- Camera: `shotList([hold(0, framing), reframe(W(...), framing), follow(...), cut(...), split(...)])`. A framing is `{ tg: [x,y,z], az, el, d, fov, screen: [0.5, 0.42] }`. Moves take 0.65 s; hold 2 to 4 s between them.
- Labels: `ov.pill(id, text, color, t0, t1, at)`, `ov.tag`, `ov.badge`, `ov.arrow`, `ov.bubble`, `ov.cta`; `ov.item(type, id, t0, t1, fields)` for the rest.
- World: `buildWorld(scene)` returns `{ update(t, F) }`. Props: `buildTerrain, heights, buildWater, buildSky, buildTrees, buildRoad, house, arrow3d, buildEffects`; vehicles: `buildCar, buildBike`.
- Poses include wave, point, pointUp, shrug, cheer, worry, recoil, proud, idea, lookUp, handsHips, headHands, walk, run, sit.
- Pacing, for a 60 s reel: about 18 camera moves and 5 tags a minute; about 75 sound effects a minute in `cues.py` (`add(time, signal, gain)`; effects are listed at the top of `tools/sfx.py`).

## Prove it
`compose.py`, then `check.py --stills <one time per beat>`, then read `renders/stills/_sheet.jpg`. Ask of each still: is the lead there, is the arrow right, can a stranger tell what is happening? Fix once. Do not render.
