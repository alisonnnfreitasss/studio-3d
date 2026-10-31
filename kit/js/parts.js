// Parts: how machine parts and props enter and get named. Generalised from the engine build (the motion
// research, D-motion.md techniques 1 and 4): a part arrives by flying in along an arc and settling
// (their grammar) or by a spring pop with squash and stretch (parts that cannot travel). Both are pure
// functions of t; the only cached state is each part's home pose, captured before its first offset.
//
// In a reel's direction:   v = enter(F, t, t0, FLY.beam)   (or enter(F, t, t0) for a spring pop)
// In its world update:     const sh = shower(); sh.begin(); sh.show(beamMesh, v); ... sh.end();
import * as THREE from "three";
import { Pop, Fly, popSS, flyIn, pop as popV1, lerp } from "./kit.js";
import { MOTION } from "./motion-config.js";

// enter: the entrance value for a part that appears at t0. spec = { from: [dx,dy,dz], via?, rot?, d?, z? }
// (offsets from the part's home, in the part's parent space) flies it in; no spec pops it. It also raises
// F.flySpeed (world units per frame of the fastest flying part) so the motion blur follows the part.
// Returns 0 before t0, then a Fly / Pop (both read as numbers: +v is the scale), then 1.
export function enter(F, t, t0, spec = null) {
  if (MOTION.entrance === "pop") return popV1(t, t0);
  if (!spec || MOTION.entrance !== "fly") return popSS(t, t0);
  const f = flyIn(t, t0, spec);
  if (f && f.dp && F) {
    const g = flyIn(t + 1 / 30, t0, spec);
    if (g && g.dp) F.flySpeed = Math.max(F.flySpeed || 0, Math.hypot(g.dp[0] - f.dp[0], g.dp[1] - f.dp[1], g.dp[2] - f.dp[2]));
  }
  return f;
}

// shower(): per world, one per update pass. show(o, v, uniform) sets visibility and scale from v (a
// number, a Pop or a Fly); Pops squash along the part's own y unless uniform (parts that spin about
// their own axis); Flys are applied last, over whatever pose the part was given this frame, by end().
export function shower() {
  const home = new Map();
  let flying = [];
  return {
    // put every part that flew last frame back to its home pose (no frame-to-frame state)
    begin() {
      for (const [o, h] of home) { o.position.copy(h.p); o.rotation.copy(h.r); }
      flying = [];
    },
    show(o, v, uniform = false) {
      const k = +v;
      o.visible = k > 0.001;
      if (!o.visible) return;
      if (v instanceof Pop && !uniform) o.scale.set(k * v.sx, k * v.sy, k * v.sz);
      else o.scale.setScalar(k);
      if (v instanceof Fly) flying.push([o, v]);
    },
    end() {
      for (const [o, f] of flying) {
        if (!home.has(o)) home.set(o, { p: o.position.clone(), r: o.rotation.clone() });
        o.position.x += f.dp[0]; o.position.y += f.dp[1]; o.position.z += f.dp[2];
        o.rotation.x += f.dr[0]; o.rotation.y += f.dr[1]; o.rotation.z += f.dr[2];
      }
    },
  };
}

// highlight(material, k): the naming highlight. kit.js tint() lerps the colour toward a highlight colour,
// which bleaches a coloured part (B-objects.md point 6: the gold crank went pale yellow). This one keeps
// the hue: it lifts the material's own colour in emissive and brightens it a little, so a blue part pulses
// brighter blue. k 0..1 (feed it words.pulse()). Opt-in; tint() stays for reels that want theirs.
const _c = new THREE.Color();
export function highlight(material, k, { gain = 0.85, lift = 0.25 } = {}) {
  if (!material.userData.hl) material.userData.hl = { color: material.color.clone(), emissive: material.emissive ? material.emissive.clone() : null, ei: material.emissiveIntensity ?? 1 };
  const b = material.userData.hl;
  material.color.copy(b.color).lerp(_c.copy(b.color).offsetHSL(0, 0, 0.12), lift * k);
  if (material.emissive) {
    material.emissive.copy(b.emissive || _c.setRGB(0, 0, 0)).lerp(_c.copy(b.color), gain * k);
    material.emissiveIntensity = lerp(b.ei, 1, k);
  }
}

// a part's world position as a plain array (for overlay anchors and camera targets)
const _v = new THREE.Vector3();
export const worldOf = (obj, local = [0, 0, 0]) => { obj.updateWorldMatrix(true, false); const p = obj.localToWorld(_v.set(...local)); return [p.x, p.y, p.z]; };
