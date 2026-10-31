// Classroom: an after-hours lesson. A whiteboard on a stand writes itself as the agent explains
// (lines that appear on a word, write themselves out, get struck through), the agent stands on a
// stack of books with a pointer, the lead sits at a school desk facing the board, a bookshelf and a
// window at blue hour around them.
//
// The board's content comes from the script's "board" (title and lines, timed like the keyboard
// mode's screen cards); with none, the board shows the episode title.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { M, piv, V, lerp, clamp, mulberry32, aim } from "../../../engine/util.js";
import { lambert, plant, books, skylineTexture } from "../props.js";
import { placeCast } from "../room.js";

export const meta = { id: "classroom", name: "Classroom", seat: "chair" };

const BOARD = { x: -1.3, y: 4.7, z: -4.3, w: 6.4, h: 4.0 };
const LEAD_FOV = 48; // with the hair the face sits a little lower, so the hair keeps some headroom
const LEAD_FY = 0.55;
const INK = { blue: "#173f9e", red: "#b3261f", green: "#1f6e38", black: "#1d2026" };
const TEACHER = { p: [-5.1, 1.8, -3.0] }; // the teacher's table top, where the book stack sits

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function build(ctx) {
  const { scene, renderer, cast, lead, agents, TL = {} } = ctx;
  const lang = TL.lang || "en";
  renderer.toneMappingExposure = 1.05;
  scene.background = new THREE.Color(0x0e1220);

  scene.add(new THREE.HemisphereLight(0xd4ddff, 0x3a3028, 0.62));
  const key = new THREE.PointLight(0xffd9b0, 70, 18, 2);
  key.position.set(3.2, 8.4, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.002;
  scene.add(key);
  const boardLight = new THREE.PointLight(0xfff4e6, 12, 10, 2);
  boardLight.position.set(-1.3, 7.8, 0.6);
  scene.add(boardLight);
  const bounce = new THREE.PointLight(0xfff1e2, 46, 14, 2); // the white board throws light back at the lead
  bounce.position.set(1.6, 6.0, -0.8);
  scene.add(bounce);
  const win = new THREE.DirectionalLight(0x8fa8ff, 0.7);
  win.position.set(-2, 8, -14);
  scene.add(win);

  // the room: floor, a back wall with a big window, the city at blue hour beyond it
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), lambert(0x6a5644, { roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallM = lambert(0x3a465c, { roughness: 0.95 });
  const holeW = 15, holeH = 8.5, holeY = 6.0, wallZ = -6.6;
  for (const [x, y, w, h] of [[0, holeY + holeH / 2 + 5, 50, 10], [0, holeY - holeH / 2 - 5, 50, 10], [-holeW / 2 - 12.5, holeY, 25, holeH], [holeW / 2 + 12.5, holeY, 25, holeH]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM);
    p.position.set(x, y, wallZ);
    scene.add(p);
  }
  const frameM = lambert(0x161a24, { roughness: 0.6 });
  for (let i = 0; i <= 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, holeH, 0.3), frameM);
    m.position.set(-holeW / 2 + (i * holeW) / 4, holeY, wallZ + 0.05);
    scene.add(m);
  }
  for (const y of [holeY - holeH / 2, holeY + 1.2, holeY + holeH / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(holeW, 0.2, 0.3), frameM);
    m.position.set(0, y, wallZ + 0.05);
    scene.add(m);
  }
  const city = new THREE.Mesh(new THREE.PlaneGeometry(110, 55), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: skylineTexture({ seed: 67, sky: [[0, "#26386e"], [0.55, "#4d63a8"], [1, "#9c8fb8"]], tower: [26, 32, 58], spread: [8, 8, 12], lit: 0.3, blur: 8, low: 160, high: 420 }),
  }));
  city.position.set(0, 14, -60);
  scene.add(city);

  // the whiteboard on its stand
  const W = 1280, Hc = 800;
  const bc = document.createElement("canvas");
  bc.width = W;
  bc.height = Hc;
  const bx = bc.getContext("2d");
  const boardTex = tex(bc);
  const board = piv(BOARD.x, BOARD.y, BOARD.z);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.85, metalness: 0, color: 0xd9d8d0 }));
  const rim = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 0.22, BOARD.h + 0.22, 0.1), lambert(0xb9bec8, { roughness: 0.35, metalness: 0.5 }));
  rim.position.z = -0.06;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w * 0.7, 0.08, 0.3), lambert(0xa8adb8, { metalness: 0.4 }));
  tray.position.set(0, -BOARD.h / 2 - 0.1, 0.12);
  board.add(rim, face, tray);
  for (const sx of [-1, 1]) {
    const legH = BOARD.y + 1.1;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, legH, 0.12), lambert(0x9aa0aa, { metalness: 0.5 }));
    leg.position.set(sx * (BOARD.w / 2 - 0.3), -BOARD.y + legH / 2, -0.1);
    const footB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1.4), lambert(0x7d838e, { metalness: 0.5 }));
    footB.position.set(sx * (BOARD.w / 2 - 0.3), -BOARD.y + 0.05, 0);
    board.add(leg, footB);
  }
  board.traverse((o) => (o.castShadow = true));
  scene.add(board);

  // what is on the board
  const B = TL.board || {};
  const title = (typeof B.title === "object" ? B.title?.[lang] : B.title) || TL.title || "";
  const lines = B.lines || [];
  const textOf = (v) => (typeof v === "object" && v ? v[lang] ?? "" : v ?? "");
  function drawBoard(t) {
    bx.fillStyle = "#f3f2ec";
    bx.fillRect(0, 0, W, Hc);
    const g = bx.createLinearGradient(0, 0, W, Hc);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.5, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(200,205,215,0.25)");
    bx.fillStyle = g;
    bx.fillRect(0, 0, W, Hc);
    bx.textBaseline = "alphabetic";
    if (title) {
      bx.font = '700 64px "Geist", sans-serif';
      bx.fillStyle = INK.black;
      const tw = bx.measureText(title).width;
      bx.fillText(title, (W - tw) / 2, 120);
      bx.strokeStyle = INK.black;
      bx.lineWidth = 4;
      bx.beginPath();
      bx.moveTo((W - tw) / 2 - 10, 142);
      bx.lineTo((W + tw) / 2 + 10, 146);
      bx.stroke();
    }
    let y = 240;
    for (const l of lines) {
      const size = l.size || 58;
      const ly = l.y ?? y;
      y = ly + size * 1.5;
      if (l.fromT != null && t < l.fromT) continue;
      if (l.untilT != null && t >= l.untilT) continue;
      let s = textOf(l.text);
      if (l.typed) s = s.slice(0, Math.floor(clamp((t - (l.fromT ?? 0)) * l.typed, 0, s.length)));
      bx.font = `${l.weight || 700} ${size}px "Geist", sans-serif`;
      bx.fillStyle = INK[l.color] || l.color || INK.blue;
      const x = l.x ?? 90;
      bx.fillText(s, x, ly);
      if (l.strikeT != null && t >= l.strikeT) {
        const k = clamp((t - l.strikeT) / 0.25);
        const w = bx.measureText(textOf(l.text)).width;
        bx.strokeStyle = INK.red;
        bx.lineWidth = 6;
        bx.beginPath();
        bx.moveTo(x - 6, ly - size * 0.32);
        bx.lineTo(x - 6 + (w + 12) * k, ly - size * 0.3);
        bx.stroke();
      }
    }
    boardTex.needsUpdate = true;
  }

  // the teacher's table with the book stack the agent stands on
  const wood = lambert(0x5a3d28, { roughness: 0.75 });
  const tt = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 1.7), wood);
  tt.position.set(TEACHER.p[0], TEACHER.p[1] - 0.07, TEACHER.p[2]);
  tt.castShadow = tt.receiveShadow = true;
  scene.add(tt);
  for (const [dx, dz] of [[-1.25, -0.7], [1.25, -0.7], [-1.25, 0.7], [1.25, 0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, TEACHER.p[1] - 0.14, 0.12), wood);
    leg.position.set(TEACHER.p[0] + dx, (TEACHER.p[1] - 0.14) / 2, TEACHER.p[2] + dz);
    scene.add(leg);
  }
  const stack = books([0xd8b13a, 0x7a3f8f, 0x3f8a5a], 1.5, 1.1, 0.32, 3);
  stack.position.set(...TEACHER.p);
  scene.add(stack);
  const standY = TEACHER.p[1] + stack.userData.height;

  // the lead's school desk and chair, turned toward the board
  const LEAD = [5.4, 0, 3.9];
  const toBoard = Math.atan2(BOARD.x - LEAD[0], BOARD.z - LEAD[2]);
  const deskG = piv(...LEAD);
  deskG.rotation.y = toBoard;
  const dtop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.5), lambert(0xc49a6c, { roughness: 0.7 }));
  dtop.position.set(0, 1.64, 1.25);
  dtop.castShadow = dtop.receiveShadow = true;
  deskG.add(dtop);
  for (const [dx, dz] of [[-1.15, 0.6], [1.15, 0.6], [-1.15, 1.9], [1.15, 1.9]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.58, 8), lambert(0x30343c, { metalness: 0.4 }));
    leg.position.set(dx, 0.79, dz);
    deskG.add(leg);
  }
  const seat = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.16, 1.6, 2, 0.05), lambert(0x2f6e8f, { roughness: 0.7 }));
  seat.position.set(0, 0.87, -0.1);
  const seatBack = new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.3, 0.14, 2, 0.05), lambert(0x2f6e8f, { roughness: 0.7 }));
  seatBack.position.set(0, 1.75, -0.85);
  seatBack.rotation.x = -0.08;
  deskG.add(seat, seatBack);
  const note = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.2), lambert(0xf4f1e8));
  note.position.set(-0.4, 1.71, 1.2);
  note.rotation.y = 0.2;
  deskG.add(note);
  deskG.traverse((o) => (o.castShadow = true));
  scene.add(deskG);

  // a right wall behind the lead, with the bookshelf and a poster; a plant in the far corner
  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), lambert(0x46526a, { roughness: 0.95 }));
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(9.0, 8, 4);
  scene.add(rightWall);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), lambert(0xf1c232, { roughness: 0.9 }));
  poster.rotation.y = -Math.PI / 2;
  poster.position.set(8.97, 5.0, 7.4);
  const posterBand = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), lambert(0x2f6e8f));
  posterBand.rotation.y = -Math.PI / 2;
  posterBand.position.set(8.96, 4.2, 7.4);
  scene.add(poster, posterBand);
  const shelf = piv(8.4, 0, 3.6);
  shelf.rotation.y = -Math.PI / 2;
  const caseM = lambert(0x4a3020, { roughness: 0.8 });
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 6.4, 1.1), caseM);
  sideL.position.set(-1.6, 3.2, 0);
  const sideR = sideL.clone();
  sideR.position.x = 1.6;
  shelf.add(sideL, sideR);
  const br = mulberry32(71);
  const bookCols = [0xc8322b, 0xf1c232, 0x2f8f4e, 0x2f6e8f, 0x7a3f8f, 0xee7a2b, 0xe9e2d4, 0x3d405b];
  for (let s = 0; s < 5; s++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.12, 1.1), caseM);
    plank.position.set(0, 0.2 + s * 1.5, 0);
    shelf.add(plank);
    if (s === 4) break;
    let x = -1.45;
    while (x < 1.35) {
      const bw = 0.16 + br() * 0.14, bh = 0.85 + br() * 0.4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.8), M(bookCols[Math.floor(br() * bookCols.length)], { roughness: 0.8 }));
      b.position.set(x + bw / 2, 0.26 + s * 1.5 + bh / 2, 0.05);
      if (br() < 0.12) b.rotation.z = 0.25;
      shelf.add(b);
      x += bw + 0.02;
    }
  }
  shelf.traverse((o) => (o.castShadow = o.receiveShadow = true));
  scene.add(shelf);
  const pot = plant(23, 1.8);
  pot.position.set(-7.6, 0, -5.4);
  scene.add(pot);

  // the cast: the first agent teaches from the books, the others stand on the lead's desk
  const deskTop = (dx, dz) => {
    const a = toBoard, c = Math.cos(a), s = Math.sin(a);
    return [LEAD[0] + dx * c + dz * s, 1.7, LEAD[2] - dx * s + dz * c];
  };
  // the first agent teaches from the books; the others stand either side of the stack on the
  // teacher's table, so the lead's shots (taken from the board side) stay clear of them
  const slots = [
    { p: [TEACHER.p[0], standY, TEACHER.p[2]], yaw: 0.35 },
    { p: [TEACHER.p[0] - 1.05, TEACHER.p[1], TEACHER.p[2] + 0.35], yaw: 0.55 },
    { p: [TEACHER.p[0] + 1.05, TEACHER.p[1], TEACHER.p[2] + 0.45], yaw: 0.75 },
  ];
  placeCast(ctx, LEAD, toBoard, slots, 0.66);

  // the pointer, held by the teaching agent
  if (agents[0] && cast[agents[0]]) {
    const holder = cast[agents[0]].anchors.head;
    const ptr = piv(1.15, -0.05, 0.3);
    ptr.rotation.set(0.15, 0, -1.05);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.4, 8), lambert(0xf4ecd8, { roughness: 0.6 }));
    stick.position.y = 1.7;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lambert(0xc8322b));
    tip.position.y = 3.4;
    ptr.add(stick, tip);
    ptr.traverse((o) => (o.castShadow = true));
    holder.add(ptr);
  }

  const H = () => cast[lead].anchors.head.getWorldPosition(V());
  const boardC = V(BOARD.x, BOARD.y, BOARD.z);
  const cameras = {
    // over the lead toward the board: the board in the middle, the lead at the edge, the agent on the books;
    // high enough that the hair sits below the board, not across it
    wide: (k) => ({ pos: V(lerp(12.6, 12.2, k), 11.8, lerp(17.4, 16.6, k)), look: V(-1.2, 4.0, -3.4), fov: 30, focus: boardC, dof: 0.008 }),
    board: (k) => ({ pos: V(BOARD.x, BOARD.y + 0.1, BOARD.z + lerp(19.5, 18.6, k)), look: V(BOARD.x, BOARD.y - 0.15, BOARD.z), fov: 34, focus: boardC, dof: 0.006 }),
    end: (k) => ({ pos: V(lerp(11.8, 13.6, k), lerp(11.0, 12.2, k), lerp(16.2, 20.2, k)), look: V(-1.2, 3.9, -3.2), fov: 31, focus: H(), dof: 0.006 }),
    // the lead from the board side, looking off toward the agent and the board. The board stands
    // right behind these cameras, so they cannot pull back: a wider lens gives the desk mode's
    // framing instead (head about half the frame, eyes 52% down)
    lead: (k) => {
      const h = H(), d = V(BOARD.x - LEAD[0], 0, BOARD.z - LEAD[2]).normalize(), side = V(-d.z, 0, d.x);
      const pos = h.clone().addScaledVector(d, lerp(9.4, 8.8, k)).addScaledVector(side, 1.2).add(V(0, -0.15, 0));
      return { pos, look: aim(pos, h, 0.4, LEAD_FY, LEAD_FOV), fov: LEAD_FOV, focus: h, dof: 0.02 };
    },
    front: (k) => {
      const h = H(), d = V(BOARD.x - LEAD[0], 0, BOARD.z - LEAD[2]).normalize();
      const pos = h.clone().addScaledVector(d, lerp(9.4, 8.7, k)).add(V(0, -0.05, 0));
      return { pos, look: aim(pos, h, 0.48, LEAD_FY, LEAD_FOV), fov: LEAD_FOV, focus: h, dof: 0.02 };
    },
    high: () => ({ pos: V(1.0, 12.5, 9.5), look: V(-0.6, 1.4, -1.6), fov: 36, focus: H(), dof: 0.006 }),
  };
  cameras.two = cameras.wide;
  // the teaching agent from just above the book stack, centred, the pointer rising to the right
  cameras.cu = (k, shot) => {
    const id = shot.on || agents[0], C = cast[id].anchors.head.getWorldPosition(V()), dist = 9.6 * (1 + 0.044 * Math.min(shot.elapsed ?? 0, 6));
    const pos = C.clone().add(V(0.9, 1.0, dist));
    return { pos, look: aim(pos, C, 0.5, 0.54, 22), fov: 22, focus: C, dof: 0.02 };
  };
  return { cameras, front: V(0, 0, 1), update: (t) => drawBoard(t) };
}
