// Quick stills straight from the reel's build (no render): opens build/ in headless Chrome, renders each time given,
// saves renders/<dir>/t<time>.jpg and prints the shot, the samples per pixel, the labels on screen and any page error.
// For looking at a pass between renders; check.py --stills / --beats runs this and tiles the result.
// Run from the reel: node ../kit/tools/stills.mjs <dir> 1.0,2.5,10
import { createRequire } from "module";
import net from "net";
import { readFileSync, mkdirSync, readdirSync, existsSync } from "fs";
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
const exe = join(shells, readdirSync(shells).sort().pop(), "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
const dir = join(HERE, "renders", process.argv[2] || "stills");
mkdirSync(dir, { recursive: true });
const times = (process.argv[3] || "1").split(",").map(Number);
const PORT = await new Promise((res) => { const sv = net.createServer(); sv.listen(0, "127.0.0.1", () => { const p = sv.address().port; sv.close(() => res(p)); }); });
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: join(HERE, "build"), stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => { if (["error", "warn", "warning"].includes(m.type())) console.error("console:", m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => window.__renderAt && window.__frame !== undefined || (window.__renderAt && (window.__renderAt(0), true)), { timeout: 120000 });
  for (const t of times) {
    const t0 = Date.now();
    const f = await page.evaluate((t) => { window.__renderAt(t); return { shot: window.__frame.shot, spp: window.__frame.spp, ov: window.__frame.overlays.map((o) => o.text).filter(Boolean).join(" | ") }; }, t);
    await page.screenshot({ path: join(dir, `t${t.toFixed(2).padStart(6, "0")}.jpg`), type: "jpeg", quality: 80 });
    console.log(t.toFixed(2), f.shot, `spp ${f.spp}`, `${Date.now() - t0} ms`, f.ov);
  }
} finally {
  await browser.close();
  server.kill();
}
