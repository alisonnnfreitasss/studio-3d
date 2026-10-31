# The worlds: what the kit gives a planner

Format rules: `FORMAT.md`. The contract: `README.md`. A reel may also port a world from an earlier reel of yours into its `build/js/`; the kit's own assets are listed here.

## What Express can do from kit/js alone

Express means a reel with no ported world, written as one `reel.js` of about 220 lines like `demo/build/js/reel.js`.

**It has:**
- Outdoor ground: `buildTerrain` with `heights.flat`, `heights.river`, `heights.hills`, a cut-away soil section (`soilLayers`), `buildWater`, `buildSky` (day, dusk, night, storm, hot), `buildTrees`, `fellTree`, `buildRoad`, `house`, `arrow3d`.
- Vehicles: `buildCar`, `buildBike`.
- Effects, all in `buildEffects`: `buildDust`, `buildDebris`, `buildWind`, `buildStreaks`, `buildRain`, `buildLightning`, `buildDrips`, `buildFlowDots`, `buildConfetti`, `buildHearts`, `buildSparks`, `buildSunbeams`, `buildFire`, `buildSplash`.
- Cast: the lead and the girl, 65 poses, 21 faces, `walkPath`, carried props.
- Text: all 42 overlay types, including the gadgets (`gauge`, `dial`, `card`, `counter`, `thermo`, `bill`, `energy`, `phase`, `clock`, `cal`), so a number or a state can be shown with no 3D.
- Grammar: rewinds with `env.grey`, icons, splits, fly-ins (`parts.enter`), highlights (`parts.highlight`), mirror and autumn for the second version.
- Simple parts: `rbox`, `lathe`, `extrude`, `gearShape`, `hull2`, `edgeGlass`, `toyWheel`, `tube` make a clean part in a few lines.

**It lacks:** any interior (no room, furniture or kitchen builder, only an `interior` light mode), any finished machine other than the car, airflow lines, molecules.

**Good fits:** rivers and dams, levees, wells, irrigation, farming, erosion, lightning, weather, wind, a road's layers, traffic lights, tyres and brakes, simple levers and pulleys, fences, a campfire, a well-pump. A small machine of about 5 parts can be modelled in `reel.js` from the helpers.

**Poor fits:** anything indoors, anything whose hero is a complex mechanism (a jet, a fridge), anything at molecule scale. Those need a Standard reel with a new world.
