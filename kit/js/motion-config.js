// Switches for the motion prototype (research/D-motion.md), so each technique can be snapshotted on and off.
export const MOTION = {
  camera: "v2",        // "v1": cubic in-out between every key (the build); "v2": linear drifts, C1 moves, log distance
  moveEase: "cubic",  // v2 only: "cubic" (fits the reference) or "beta34" (peak at 40%, long landing)
  settle: 0.0,         // v2 only: overshoot share of each move, returned by a critically damped settle (0 = none)
  settleW: 9.0,        // rad/s of that settle
  handheld: 0.0,       // degrees of seeded micro-drift on the look direction and roll (0 = off)
  entrance: "fly",     // "pop": the build's scale pop; "squash": spring pop with squash and stretch; "fly": arc fly-in where the reference flies parts in, squash pop elsewhere
  blur: true,          // sub-frame motion blur on fast camera moves only
  shutter: 0.35,       // share of the frame interval the shutter is open (0.35 = 126 degrees; 0.5 = film's 180 smears the 13.8 s face push)
  maxSpp: 24,          // most sub-frames per frame
  character: true,     // pose-to-pose transitions with anticipation and overlapping action
};

// a probe or test page may set window.__MOTION_OVERRIDE before the modules load (the shot map turns blur off)
Object.assign(MOTION, globalThis.__MOTION_OVERRIDE || {});
