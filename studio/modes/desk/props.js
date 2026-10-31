// Desk mode props and painted backdrops, shared by its scenarios. All our own low-poly designs;
// every random choice is seeded, so a frame is a pure function of time.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { M, piv, mulberry32 } from "../../engine/util.js";

const canvasTex = (c) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// a soft disc for out-of-focus lights
export function discTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.75)");
  g.addColorStop(0.72, "rgba(255,255,255,0.9)");
  g.addColorStop(0.86, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return canvasTex(c);
}

// A skyline painted on a canvas: a sky gradient, tower silhouettes, lit windows, then blurred
// the way a long lens sees it. sky: [[stop, colour]...]; towers: [r, g, b] base and spread;
// lit: the chance a window is lit and its colour.
export function skylineTexture({ seed = 17, sky, tower, spread = [6, 8, 14], lit = 0.42, litColor = (r) => `rgba(255,${180 + r() * 60},${100 + r() * 60},${0.5 + r() * 0.5})`, blur = 10, low = 120, high = 420, sun = null }) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 512);
  for (const [stop, col] of sky) g.addColorStop(stop, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 512);
  if (sun) {
    const s = x.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.r);
    s.addColorStop(0, sun.color);
    s.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = s;
    x.fillRect(0, 0, 1024, 512);
  }
  const r = mulberry32(seed);
  let bx = -10;
  while (bx < 1024) {
    const bw = 30 + r() * 70, bh = low + r() * (high - low);
    x.fillStyle = `rgb(${tower[0] + r() * spread[0]},${tower[1] + r() * spread[1]},${tower[2] + r() * spread[2]})`;
    x.fillRect(bx, 512 - bh, bw, bh);
    for (let wy = 512 - bh + 8; wy < 506; wy += 12) {
      for (let wx = bx + 5; wx < bx + bw - 6; wx += 10) {
        if (r() < lit) {
          x.fillStyle = litColor(r);
          x.fillRect(wx, wy, 5, 7);
        }
      }
    }
    bx += bw + 3 + r() * 10;
  }
  const out = document.createElement("canvas");
  out.width = 1024;
  out.height = 512;
  const o = out.getContext("2d");
  o.filter = `blur(${blur}px)`;
  o.drawImage(c, 0, 0);
  return canvasTex(out);
}

// rain beading on a window: small soft drops, seeded
export function dropsTexture(seed = 5) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const x = c.getContext("2d");
  const r = mulberry32(seed);
  for (let i = 0; i < 260; i++) {
    const px = r() * 1024, py = r() * 512, rad = 1.4 + r() * 4;
    const g = x.createRadialGradient(px - rad * 0.3, py - rad * 0.3, 0, px, py, rad);
    g.addColorStop(0, "rgba(235,242,255,0.45)");
    g.addColorStop(1, "rgba(200,215,235,0.02)");
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(px, py, rad * 0.8, rad, 0, 0, Math.PI * 2);
    x.fill();
    if (r() < 0.12) {
      x.strokeStyle = "rgba(220,230,245,0.18)";
      x.lineWidth = rad * 0.6;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (r() - 0.5) * 6, py + 20 + r() * 60);
      x.stroke();
    }
  }
  return canvasTex(c);
}

export const lambert = (color, o = {}) => M(color, { flatShading: false, ...o });

export function mug(color = 0xdfe4ee) {
  const g = piv();
  const m = lambert(color, { roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.62, 20), m);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 16), m);
  handle.position.set(0.36, 0.02, 0);
  body.castShadow = handle.castShadow = true;
  g.add(body, handle);
  return g;
}

// a pot with a few faceted leaves
export function plant(seed = 3, scale = 1) {
  const g = piv();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.7, 10), M(0xc9693a, { roughness: 0.85 }));
  pot.position.y = 0.35;
  pot.castShadow = true;
  g.add(pot);
  const r = mulberry32(seed);
  const leafM = M(0x3f8a4e, { roughness: 0.8, side: THREE.DoubleSide });
  const leafM2 = M(0x2f6e3e, { roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18 + r() * 0.1, 1.1 + r() * 0.7, 4), i % 2 ? leafM : leafM2);
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    leaf.position.set(Math.sin(a) * 0.18, 1.15 + r() * 0.3, Math.cos(a) * 0.18);
    leaf.rotation.set(Math.cos(a) * (0.35 + r() * 0.35), 0, -Math.sin(a) * (0.35 + r() * 0.35));
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

// a stack of closed books, bottom to top
export function books(colors = [0xd8b13a, 0x7a3f8f, 0x3f8a5a], w = 1.6, d = 1.15, h = 0.3, seed = 9) {
  const g = piv();
  const r = mulberry32(seed);
  let y = 0;
  colors.forEach((col, i) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w - i * 0.06, h, d - i * 0.04, 2, 0.04), M(col, { roughness: 0.8 }));
    b.position.set((r() - 0.5) * 0.12, y + h / 2, (r() - 0.5) * 0.08);
    b.rotation.y = (r() - 0.5) * 0.16;
    b.castShadow = b.receiveShadow = true;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w - i * 0.06 - 0.06, h * 0.7, 0.02), M(0xf3ead8, { roughness: 0.9 }));
    pages.position.set(0, 0, (d - i * 0.04) / 2);
    b.add(pages);
    g.add(b);
    y += h;
  });
  g.userData.height = y;
  return g;
}

export function stickyNotes(seed = 11, colors = [0xffd34d, 0xff9f43, 0x7ee0b5]) {
  const g = piv();
  const r = mulberry32(seed);
  colors.forEach((col, i) => {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.5), M(col, { roughness: 0.9 }));
    n.position.set(i * 0.62 + (r() - 0.5) * 0.1, 0.006 + i * 0.002, (r() - 0.5) * 0.2);
    n.rotation.y = (r() - 0.5) * 0.5;
    n.receiveShadow = true;
    g.add(n);
  });
  return g;
}

export function notepad() {
  const g = piv();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 1.45), M(0xf4f1e8, { roughness: 0.95 }));
  pad.position.y = 0.02;
  pad.receiveShadow = true;
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), M(0x1f8f8a, { roughness: 0.5 }));
  pen.rotation.set(0, 0.4, Math.PI / 2);
  pen.position.set(0.15, 0.08, 0.1);
  g.add(pad, pen);
  return g;
}

export function ball(color = 0xd8443a, rad = 0.42) {
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), M(color, { roughness: 0.7 }));
  b.position.y = rad;
  b.castShadow = true;
  return b;
}

// a pendant lamp hanging from the ceiling, its shade glowing when lit
export function pendant(lit = true, cord = 6) {
  const g = piv();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, cord, 6), M(0x111111));
  c.position.y = cord / 2;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.85, 16, 1, true), lambert(0x2c2f36, { side: THREE.DoubleSide, roughness: 0.5 }));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: lit ? 0xffe2b0 : 0x6b6152, toneMapped: !lit }));
  bulb.position.y = -0.3;
  g.add(c, shade, bulb);
  return g;
}

// a framed picture for a wall: a simple seeded abstract of our own
export function picture(w = 1.6, h = 1.2, seed = 21, palette = ["#f2c14e", "#e07a5f", "#3d405b", "#81b29a"]) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const x = c.getContext("2d");
  const r = mulberry32(seed);
  x.fillStyle = palette[0];
  x.fillRect(0, 0, 320, 240);
  for (let i = 0; i < 5; i++) {
    x.fillStyle = palette[1 + (i % (palette.length - 1))];
    x.beginPath();
    x.arc(r() * 320, r() * 240, 30 + r() * 70, 0, Math.PI * 2);
    x.fill();
  }
  const g = piv();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08), M(0x2a1d14, { roughness: 0.6 }));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.9 }));
  art.position.z = 0.045;
  g.add(frame, art);
  return g;
}

// a simple chair: seat, back and four legs
export function chair(color = 0x22252e) {
  const g = piv();
  const m = lambert(color, { roughness: 0.8 });
  const seat = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.22, 1.8, 2, 0.08), m);
  seat.position.y = 1.0;
  const back = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.8, 0.2, 2, 0.08), m);
  back.position.set(0, 2.0, -0.85);
  g.add(seat, back);
  for (const [lx, lz] of [[-0.85, -0.75], [0.85, -0.75], [-0.85, 0.75], [0.85, 0.75]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), m);
    leg.position.set(lx, 0.5, lz);
    g.add(leg);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}
