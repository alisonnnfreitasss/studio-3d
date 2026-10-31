// Desk mode: the camera grammar and the look of a quiet desk sitcom. Long lenses, shallow focus,
// one slow dolly per shot (in on the human, out on the AI), box captions, room tone. Our own sets
// and cast.
//
// The place comes from a scenario (modes/desk/scenarios/<id>.js): it builds the set, lights it,
// places the cast, and returns its own wide shots plus the side of the set the audience sees
// ("front"). The cameras here follow the characters wherever a scenario puts them.
import * as THREE from "three";
import { V, lerp, aim } from "../../engine/util.js";

export const meta = { id: "desk", name: "Desk", seat: "chair", captions: "box", audio: "room" };

const POST = { bokeh: { aperture: 0.004, maxblur: 0.02 }, bloom: [0.32, 0.5, 0.88] };
// Measured across the format (287 shots): a dolly moves at a constant slow speed, about 3.5 to 4.5%
// of the distance a second (in on the lead, out on the agents), so short shots barely move. Framing
// targets are fractions of the frame from the top left.
const PUSH = 0.038, PULL = 0.044;
const ran = (shot) => Math.min(shot.elapsed ?? 0, 6);

export function build(ctx) {
  const { cast, lead, agents, scenario } = ctx;
  const place = scenario.build(ctx);
  const up = V(0, 1, 0);
  const front = (place.front || V(0, 0, 1)).clone().normalize();
  const right = V(front.z, 0, -front.x);
  // an offset in set space (x right as the audience sees it, y up, z toward the audience)
  const at = (p, x, y, z, f = front, r = right) => p.clone().addScaledVector(r, x).addScaledVector(up, y).addScaledVector(f, z);
  const head = (id) => cast[id].anchors.head.getWorldPosition(V());
  const sc = (id) => (cast[id].root.userData.scale ?? 0.68) / 0.68;
  // the lead's own frame: where the lead faces
  const leadFrame = () => {
    const yaw = cast[lead].root.userData.baseYaw ?? 0;
    const f = V(Math.sin(yaw), 0, Math.cos(yaw));
    return [f, V(f.z, 0, -f.x)];
  };
  const dirIn = (deg, f, r) => {
    const a = THREE.MathUtils.degToRad(deg);
    return [Math.sin(a), Math.cos(a), f, r];
  };

  // each camera returns { pos, look, fov, focus (a point to keep sharp), dof (max blur) }
  const cameras = {
    // the lead three-quarter at eye level: face 40% across, eyes 52% down, head about 44% of the
    // frame; pushes in slowly
    lead: (k, shot) => {
      const H = head(lead), [f, r] = leadFrame(), [sx, cz] = dirIn(-12), dist = 23.2 * (1 - PUSH * ran(shot));
      const pos = at(H, sx * dist, -0.1, cz * dist, f, r);
      return { pos, look: aim(pos, H, 0.4, 0.52, 21), fov: 21, focus: H, dof: 0.02 };
    },
    // the lead square-on, eyes in the lens: face 48% across, eyes 52% down
    front: (k, shot) => {
      const H = head(lead), [f, r] = leadFrame(), dist = 22.2 * (1 - PUSH * ran(shot));
      const pos = at(H, 0, -0.05, dist, f, r);
      return { pos, look: aim(pos, H, 0.48, 0.52, 21), fov: 21, focus: H, dof: 0.02 };
    },
    // an agent close at its own eye height, square-on, the lead soft in an upper corner: the agent
    // fills about 50 to 87% of the height, eyes 64% down; pulls out slowly
    cu: (k, shot) => {
      const id = shot.on || agents[0], C = head(id), s = sc(id), dist = 12.7 * s * (1 + PULL * ran(shot));
      const pos = at(C, 0.17 * dist, 0.054 * dist, 0.984 * dist);
      return { pos, look: aim(pos, C, 0.49, 0.64, 21), fov: 21, focus: C, dof: 0.03 };
    },
    // two characters in one frame
    two: (k, shot) => {
      const a = shot.on || agents[0], b = shot.with || agents[1] || lead;
      const A = head(a), B = head(b), mid = A.clone().add(B).multiplyScalar(0.5);
      const span = Math.max(1.5, Math.abs(A.clone().sub(B).dot(right)));
      const dist = lerp(15.0, 15.9, k) * (span / 1.8);
      return { pos: at(mid, -0.3, 0.6, dist), look: at(mid, 0.1, 0.35, 0), fov: 22, focus: head(shot.speaker || a), dof: 0.018 };
    },
    ...place.cameras,
  };
  cameras.full = cameras.full || cameras.cu;
  cameras.side = cameras.side || cameras.cu;

  return {
    cameras,
    fallback: "lead",
    post: { ...POST, ...(place.post || {}) },
    update: (t, cam) => place.update?.(t, cam),
  };
}
