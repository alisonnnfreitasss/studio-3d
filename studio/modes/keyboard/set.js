// Keyboard mode: the camera grammar and the look of a fast, bright sitcom on a giant laptop
// keyboard: faceted low poly, cameras mostly locked off (the motion comes from the characters), a
// dozen set-ups, plain captions, a music bed. Our own cast and
// sets.
//
// The place comes from a scenario (modes/keyboard/scenarios/<id>.js): the keyboard stage
// (stage.js) in one of its looks. The cameras below follow the cast on the keys.
import * as THREE from "three";
import { V, lerp } from "../../engine/util.js";
import { A_YAW } from "./stage.js";

export const meta = { id: "keyboard", name: "Keyboard", seat: "keys", captions: "plain", audio: "music" };

const POST = { bokeh: null, bloom: [0.72, 0.55, 0.74] };

export function build(ctx) {
  const { cast, lead, agents, scenario } = ctx;
  const place = scenario.build(ctx);

  // cameras: { pos, look, fov, screenBlur }
  const W = (o) => o.getWorldPosition(V());
  const head = (id) => W(cast[id].anchors.head);
  const body = (id) => W(cast[id].anchors.body);
  const facing = (yaw) => [V(Math.sin(yaw), 0, Math.cos(yaw)), V(-Math.cos(yaw), 0, Math.sin(yaw))];
  const dirFrom = (yaw, deg) => {
    const [f, r] = facing(yaw), a = THREE.MathUtils.degToRad(deg);
    return V(f.x * Math.cos(a) + r.x * Math.sin(a), 0, f.z * Math.cos(a) + r.z * Math.sin(a));
  };
  const at = (p, d, dist, dy) => V(p.x + d.x * dist, p.y + dy, p.z + d.z * dist);
  const add = (a, x, y, z) => V(a.x + x, a.y + y, a.z + z);
  const aDir = (deg) => dirFrom(A_YAW, deg);
  const agentOf = (shot) => shot.on && cast[shot.on] && shot.on !== lead ? shot.on : agents[0];
  const cDir = (id, deg) => dirFrom(cast[id].root.userData.baseYaw ?? 0, deg);
  // a look point that puts `target` at (fx, fy) of the 9:16 frame (fractions from the top left),
  // so a set-up can be written as it is measured: "face at 28% across, 62% down"
  const aim = (pos, target, fx, fy, fov) => {
    const f = target.clone().sub(pos), D = f.length();
    f.normalize();
    const r = new THREE.Vector3().crossVectors(f, V(0, 1, 0)).normalize(), u = new THREE.Vector3().crossVectors(r, f);
    const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2)), th = tv * (9 / 16);
    return target.clone().addScaledVector(r, (0.5 - fx) * 2 * th * D).addScaledVector(u, (fy - 0.5) * 2 * tv * D);
  };
  const shot = (pos, target, fx, fy, fov, screenBlur) => ({ pos, look: aim(pos, target, fx, fy, fov), fov, screenBlur });
  // An agent's own shots look along the way he faces. When another character stands in that line of
  // sight (with two or three agents the back slot sits behind the front one), the camera turns around
  // the agent, nearest angle first, until the view is clear. It tests root positions only, so the
  // angle holds still for the whole shot.
  const flat = (v) => new THREE.Vector2(v.x, v.z);
  const blocked = (id, from) => {
    const a = flat(W(cast[id].root)), ab = flat(from).sub(a), L2 = ab.lengthSq();
    return Object.keys(cast).some((o) => {
      if (o === id) return false;
      const p = flat(W(cast[o].root)), u = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / L2, 0, 1);
      return a.clone().addScaledVector(ab, u).distanceTo(p) < 1.25 * (cast[o].root.scale.x || 1) + 0.4;
    });
  };
  const clearDeg = (id, deg, dist) => {
    for (const d of [0, 15, -15, 30, -30, 45, -45, 60, -60]) {
      if (!blocked(id, at(W(cast[id].root), cDir(id, deg + d), dist, 0))) return deg + d;
    }
    return deg;
  };
  const cameras = {
    lead: (k) => shot(at(head(lead), aDir(35), lerp(16.8, 16.1, k), -0.35), head(lead), 0.3, 0.62, 26, 5),
    front: (k) => ({ pos: at(head(lead), aDir(12), lerp(15.6, 15.0, k), -0.3), look: add(head(lead), 0, 0.4, 0), fov: 26, screenBlur: 5 }),
    "lead-seated": (k) => shot(at(body(lead), aDir(45), lerp(19.8, 19.2, k), 3.8), head(lead), 0.31, 0.5, 26, 3),
    "lead-reach": (k) => ({ pos: at(head(lead), aDir(20), lerp(16.6, 16.0, k), -0.4), look: add(head(lead), 0.3, 0.1, 0), fov: 26, screenBlur: 5 }),
    "lead-profile": () => ({ pos: at(head(lead), aDir(55), 13.6, -0.1), look: add(head(lead), 0, 0.25, 0), fov: 26, screenBlur: 6 }),
    "lead-low": (k) => ({ pos: at(body(lead), aDir(25), lerp(16.4, 15.8, k), 0.05), look: add(head(lead), 0, 0.05, 0), fov: 30, screenBlur: 5 }),
    "lead-wide": (k) => shot(at(head(lead), aDir(15), lerp(28.5, 27.6, k), 1.0), head(lead), 0.35, 0.76, 26, 3),
    cu: (k, shot) => {
      const id = agentOf(shot);
      const f = cast[id].frame?.cu ?? 1; // a character can ask for a looser close-up (Grok's ring)
      return { pos: at(head(id), cDir(id, clearDeg(id, 0, 7.0 * f)), lerp(7.0, 6.7, k) * f, 0.9), look: add(head(id), 0, 0.5, 0), fov: 30, screenBlur: 6 };
    },
    full: (k, shot) => {
      const id = agentOf(shot);
      return { pos: at(head(id), cDir(id, clearDeg(id, 0, 9.2)), 9.2, 0.5), look: add(head(id), 0, 0.36, 0), fov: 30, screenBlur: 5 };
    },
    side: (k, shot) => {
      const id = agentOf(shot);
      const f = cast[id].frame?.cu ?? 1;
      return { pos: at(head(id), cDir(id, clearDeg(id, 20, 10.8 * f)), lerp(10.8, 10.4, k) * f, 0.5), look: add(head(id), 0, 0.35, 0), fov: 30, screenBlur: 4 };
    },
    two: (k, shot) => {
      const a = shot.on || agents[0], b = shot.with || agents[1] || lead;
      const A = head(a), B = head(b), mid = A.clone().add(B).multiplyScalar(0.5);
      const span = Math.max(2, A.distanceTo(B));
      return { pos: V(mid.x, mid.y + 1.2, mid.z + lerp(4.4, 4.1, k) * span), look: add(mid, 0, 0.3, 0), fov: 30, screenBlur: 4 };
    },
    wide: (k) => ({ pos: V(-0.1, lerp(13.6, 13.2, k), lerp(20.4, 19.8, k)), look: V(-0.1, 1.3, -0.6), fov: 42, screenBlur: 2 }),
    // the dashboard is the subject: cards readable, the cast small at the bottom corners
    board: (k) => ({ pos: V(-0.2, lerp(3.4, 3.6, k), lerp(33.5, 32.4, k)), look: V(-0.2, 7.6, -9.4), fov: 33, screenBlur: 0 }),
    // the camera at key level: big keys in the foreground, the screen above, often just before the end
    low: (k) => ({ pos: V(lerp(-0.4, -0.2, k), 0.8, lerp(17.6, 17.0, k)), look: V(-0.2, 5.6, -9.4), fov: 46, screenBlur: 2 }),
    // the reverse angle: the lead with the night city behind, the dashboard out of frame
    "lead-city": (k) => ({ pos: at(head(lead), aDir(-40), lerp(10.8, 10.3, k), 0.2), look: add(head(lead), 0, 0.32, 0), fov: 25, screenBlur: 6 }),
    // straight down over the keys
    top: (k) => ({ pos: add(body(lead), 1.4, lerp(17.5, 17.0, k), 4.2), look: add(body(lead), 0.6, 0, -0.6), fov: 40, screenBlur: 2 }),
    high: (k) => ({ pos: V(-0.1, lerp(17.6, 17.1, k), lerp(22.0, 21.3, k)), look: V(-0.1, 1.2, -1.2), fov: 42, screenBlur: 1 }),
    end: (k) => ({ pos: V(0, lerp(7.5, 7.7, k), lerp(40, 41.5, k)), look: V(0, 7.0, -9.4), fov: 37.5, screenBlur: 0 }),
  };

  Object.assign(cameras, place.cameras || {});

  return {
    cameras,
    fallback: "lead",
    post: { ...POST, ...(place.post || {}) },
    update: (t, cam) => place.update?.(t, cam),
  };
}
