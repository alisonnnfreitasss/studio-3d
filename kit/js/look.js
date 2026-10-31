// The look: every rendering upgrade in one place, each one switchable, so a variant is one edit.
// tools in research/ rewrite this file per variant to make the before/after stills.
export const LOOK = {
  ss: 2,                 // supersampling: the drawing buffer is ss x 720 by ss x 1280, Chrome scales it down
  env: true,             // image-based light through PMREM as scene.environment (reflections + soft ambient)
  envKind: "soft",       // "soft" (softenv.js, panels at most 4) or "room" (three RoomEnvironment, emitters up to 100)
  envIntensity: 0.65,
  hemiScale: 0.55,       // the hemisphere light shrinks when the environment is on (it already fills)
  sunScale: 1.0,
  exposure: 1.0,
  lightScale: 0.48,      // every world light and the environment (post only): scene-linear white under 1
  glowBoost: 2.5,        // glow sprites x this (post + bloom only), so fire and flashes bloom
  post: true,            // pmndrs postprocessing composer (needed for everything below down to vignette)
  hdrClamp: 8,           // scale any pixel brighter than this down before AO, DOF and bloom (0 = off)
  ao: true,              // N8AO
  aoRadius: 1.3,         // world units (the bore is 0.9)
  aoIntensity: 3.2,
  aoFalloff: 1.0,
  aoQuality: "Medium",   // Ultra looked the same (mean diff 0.3 levels) and cost 12 ms more per frame
  aoColor: 0x1a120c,     // warm dark, not pure black
  dof: "gather",         // depth of field focused on each view's look point: "gather" (default), true (pmndrs), false
  dofBand: 0.12,         // gather: sharp zone as |1 - focus/z|
  dofGain: 2.4,          // gather: blur growth outside the band
  dofStep: 0.9,          // gather: spiral step in px (smaller = more samples)
  dofRange: 0.3,         // pmndrs: the sharp band, as a fraction of the camera distance
  bokeh: 7,              // gather: max blur radius in px at 720 wide; pmndrs: bokehScale (x ss)
  dofRes: 1.0,           // DOF buffer scale; 0.5 leaves purple halos at silhouettes
  bloom: true,
  bloomThreshold: 1.0,
  bloomSmoothing: 0.25,
  bloomIntensity: 0.75,
  bloomRadius: 0.7,
  tone: "NEUTRAL",       // ToneMappingMode: NEUTRAL, AGX or ACES_FILMIC
  saturation: 0.06,      // HueSaturationEffect, -1..1 (applied after tone mapping)
  contrast: 0.04,        // BrightnessContrastEffect, -1..1
  vignette: true,
  vignetteOffset: 0.32,
  vignetteDarkness: 0.42,
  rim: true,             // a cool light behind the subject, placed from each view's camera
  rimIntensity: 1.1,
  glass: true,           // MeshPhysicalMaterial transmission for the cylinders and ports
  paint: true,           // clearcoat car paint
  glassEnv: 1.6,         // env reflection strength on glass (own envMap, not scene.environmentIntensity)
  paintEnv: 0.7,
  thinGlassEnv: 0.06,    // car windows and other thin transparent sheets
  thinGlassRough: 0.35,  // their roughness floor: a 0.1-rough window mirrors the point light as a disc under bloom/DOF
  shadowMap: 4096,
  shadowType: "pcfsoft", // "pcfsoft" or "vsm"
  vsmRadius: 10,
  vsmSamples: 16,
};

// a benchmark or test page may set window.__LOOK_OVERRIDE before the modules load
Object.assign(LOOK, globalThis.__LOOK_OVERRIDE || {});
