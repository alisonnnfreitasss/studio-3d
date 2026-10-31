// Character pictures, all drawn from the same model.js files the videos render: the turnaround
// (front, three-quarter, side, back), one cell per expression, outfit cards and the sidebar
// portrait. One shared WebGL renderer draws them and the pixels are copied out, so a page full
// of sheets never runs out of WebGL contexts.
import * as THREE from "three";

const DPR = Math.min(2, window.devicePixelRatio || 1);
const BG = new THREE.Color(0x151826);
const mods = {};
const cache = new Map();
let R = null;

export async function loadModel(id) {
  if (!mods[id]) mods[id] = await import(`/characters/${id}/model.js`);
  return mods[id];
}

function renderer(w, h) {
  if (!R) {
    R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = 1.05;
    R.setScissorTest(true);
  }
  R.setPixelRatio(DPR);
  R.setSize(w, h, false);
  return R;
}

function studioScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2433, 1.15));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.3);
  key.position.set(-4, 7, 8);
  const rim = new THREE.DirectionalLight(0x9db0ff, 1.3);
  rim.position.set(5, 6, -6);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(6, 2, 7);
  scene.add(key, rim, fill);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x23273a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
  return scene;
}

function release(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

function frameCamera(cam, center, size, angleDeg, aspect, pad = 1.18, lift = 0) {
  const a = THREE.MathUtils.degToRad(angleDeg);
  cam.aspect = aspect;
  cam.fov = 24;
  const h = Math.max(size.y, size.x / aspect, size.z / aspect) * pad;
  const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) + size.z / 2;
  cam.position.set(center.x + Math.sin(a) * dist, center.y + lift, center.z + Math.cos(a) * dist);
  cam.lookAt(center.x, center.y, center.z);
  cam.updateProjectionMatrix();
}

const bodyBox = (ch) => {
  const box = new THREE.Box3().setFromObject(ch.root);
  return { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
};
// humans framed on the face, agents on the whole body
function faceBox(mod, ch) {
  if (mod.meta.kind !== "human") return bodyBox(ch);
  const center = ch.anchors.head.getWorldPosition(new THREE.Vector3());
  center.y += 0.45;
  return { center, size: new THREE.Vector3(3.2, 3.6, 2.4) };
}

function pose(ch, emotion = "neutral") {
  ch.update(1.2, { emotion, from: emotion, mix: 1, blink: 1, talk: 0 });
}

function cell(r, scene, cam, x, y, w, h) {
  r.setViewport(x, y, w, h);
  r.setScissor(x, y, w, h);
  r.setClearColor(BG);
  r.render(scene, cam);
}

function copyTo(canvas) {
  canvas.width = R.domElement.width;
  canvas.height = R.domElement.height;
  canvas.getContext("2d").drawImage(R.domElement, 0, 0);
}

// One picture as a data URL: "face" for the sidebar portrait, "body" for outfit cards. Cached.
async function picture(id, variant, framing, w, h) {
  const key = `${framing}|${id}|${variant || ""}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const mod = await loadModel(id);
  const r = renderer(w, h);
  const scene = studioScene();
  const ch = mod.build({ seat: "stand", variant });
  scene.add(ch.root);
  pose(ch, "happy");
  scene.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
  if (framing === "face") {
    const { center, size } = faceBox(mod, ch);
    frameCamera(cam, center, size, mod.meta.kind === "human" ? 12 : 10, w / h, 1.06);
  } else {
    const { center, size } = bodyBox(ch);
    frameCamera(cam, center, size, 24, w / h, 1.14, size.y * 0.04);
  }
  cell(r, scene, cam, 0, 0, w, h);
  const url = r.domElement.toDataURL("image/png");
  release(scene);
  cache.set(key, url);
  return url;
}
export const renderPortrait = (id, variant) => picture(id, variant, "face", 68, 80);
export const renderOutfit = (id, variant, { w = 200, h = 300 } = {}) => picture(id, variant, "body", w, h);

// Four views side by side, drawn into a 2D canvas. Returns the labels for the cells.
export async function drawViews(canvas, id, { variant, w = 1200, h = 520 } = {}) {
  const mod = await loadModel(id);
  const r = renderer(w, h);
  const scene = studioScene();
  const ch = mod.build({ seat: "stand", variant });
  scene.add(ch.root);
  pose(ch);
  scene.updateMatrixWorld(true);
  const { center, size } = bodyBox(ch);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
  const views = [["front", 0], ["three-quarter", 35], ["side", 90], ["back", 180]];
  const cw = w / views.length;
  views.forEach(([, deg], i) => {
    frameCamera(cam, center, size, deg, cw / h, 1.16, size.y * 0.04);
    cell(r, scene, cam, i * cw, 0, cw, h);
  });
  copyTo(canvas);
  release(scene);
  return views.map((v) => v[0]);
}

// One cell per expression in a grid, drawn into a 2D canvas.
export async function drawExpressions(canvas, id, { variant, emotions, cols = 6, size = 200 } = {}) {
  const mod = await loadModel(id);
  const list = emotions || mod.meta.emotions;
  const rows = Math.ceil(list.length / cols);
  const ch_h = size * 1.15;
  const w = cols * size, h = rows * ch_h;
  const r = renderer(w, h);
  const scene = studioScene();
  const ch = mod.build({ seat: "stand", variant });
  scene.add(ch.root);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
  list.forEach((emo, i) => {
    pose(ch, emo);
    scene.updateMatrixWorld(true);
    const { center, size: box } = faceBox(mod, ch);
    frameCamera(cam, center, box, mod.meta.kind === "human" ? 12 : 0, size / ch_h, 1.12);
    cell(r, scene, cam, (i % cols) * size, h - (Math.floor(i / cols) + 1) * ch_h, size, ch_h);
  });
  copyTo(canvas);
  release(scene);
  return { list, cols };
}
