// The shot map's probe: opens the reel's HyperFrames build in headless Chrome (puppeteer-core from the
// hyperframes@0.8.181 npx install), steps through the film every 0.1 s reading window.__frame (scene, shot,
// labels on screen, camera of each view), and saves a still in the middle of every beat.
// No render, no spend: the same code the render runs, seeked frame by frame. Motion blur is off for the probe
// (window.__MOTION_OVERRIDE: about 10x faster, same frame state), and the page is served on a free OS port
// (a fixed port clashed when sibling reels ran the probe at the same time).
//
// Run from the reel: node ../kit/tools/shot_map.mjs     (then /usr/bin/python3 ../kit/tools/shot_map.py builds the page)
// Writes renders/shotmap/probe.json and renders/shotmap/stills/<beat>.jpg
import { createRequire } from "module";
import net from "net";
import { readFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { spawn } from "child_process";
import { homedir } from "os";

const HERE = resolve(process.env.REEL || process.cwd());
if (!existsSync(join(HERE, "topic.json"))) throw new Error(`${HERE}: no topic.json (run from a reel folder)`);
const npx = join(homedir(), ".npm/_npx");
const hfDir = readdirSync(npx).map((d) => join(npx, d, "node_modules")).find((d) => {
  try { return JSON.parse(readFileSync(join(d, "hyperframes/package.json"), "utf8")).version === "0.8.181"; } catch { return false; }
});
if (!hfDir) throw new Error("hyperframes@0.8.181 is not in the npx cache: run any npx --yes hyperframes@0.8.181 command once");
const require = createRequire(join(hfDir, "x.js"));
const puppeteer = require("puppeteer-core");
const shells = join(homedir(), ".cache/puppeteer/chrome-headless-shell");
const shell = readdirSync(shells).sort().pop();
const exe = join(shells, shell, "chrome-headless-shell-mac-arm64", "chrome-headless-shell");

const tl = JSON.parse(readFileSync(join(HERE, "timeline.json"), "utf8"));
const out = join(HERE, "renders/shotmap");
mkdirSync(join(out, "stills"), { recursive: true });
const PORT = await new Promise((res) => { const sv = net.createServer(); sv.listen(0, "127.0.0.1", () => { const p = sv.address().port; sv.close(() => res(p)); }); });
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: join(HERE, "build"), stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  // the probe reads shots, labels and cameras: no motion blur sub-frames (10x faster, same frame state)
  await page.evaluateOnNewDocument(() => { window.__MOTION_OVERRIDE = { blur: false }; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => window.__renderAt && window.__frame !== undefined || (window.__renderAt && (window.__renderAt(0), true)), { timeout: 120000 });
  const step = 0.1, samples = [];
  for (let t = 0; t < tl.duration; t += step) {
    const f = await page.evaluate((t) => { window.__renderAt(t); return window.__frame; }, +t.toFixed(3));
    samples.push(f);
  }
  for (const b of tl.beats) {
    const mid = (b.start + b.end) / 2;
    await page.evaluate((t) => window.__renderAt(t), mid);
    await page.screenshot({ path: join(out, "stills", `${b.id}.jpg`), type: "jpeg", quality: 82 });
  }
  writeFileSync(join(out, "probe.json"), JSON.stringify({ step, duration: tl.duration, samples }));
  console.log(`probed ${samples.length} frames, ${tl.beats.length} stills (${exe.split("/").slice(-3, -2)})`);
} finally {
  await browser.close();
  server.kill();
}
