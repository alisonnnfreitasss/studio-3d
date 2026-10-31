#!/usr/bin/env node
// Renders episode covers (the reel thumbnails) from ui/cover.html, one per language, at 1080 x 1920:
// episodes/<slug>/renders/<slug>-<lang>-cover.jpg (git-ignored, like the renders; the cover spec in
// episode.json is the source). Needs the local server (server/serve.py) on 127.0.0.1:8810.
//   node tools/covers.mjs <slug>... [--langs en,pt] [--out <dir>] [--query "&fy=0.3"]
// --out writes <dir>/<slug>-<lang>.jpg instead (for review sheets); --query adds URL parameters
// (camera, emotions, bare=1) to every cover in the run.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const langs = opt("--langs", "en,pt").split(",");
const out = opt("--out", null);
const extra = opt("--query", "");
const slugs = args;
if (!slugs.length) {
  console.error("usage: node tools/covers.mjs <slug>... [--langs en,pt] [--out dir] [--query '&fy=0.3']");
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
let failed = 0;
for (const slug of slugs) {
  for (const lang of langs) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await page.goto(`http://127.0.0.1:8810/ui/cover.html?slug=${slug}&lang=${lang}${extra}`, { waitUntil: "networkidle0", timeout: 90000 });
    const ok = await page.waitForFunction("window.__ready === true", { timeout: 90000 }).then(() => true, () => false);
    const file = out ? path.join(out, `${slug}-${lang}.jpg`) : path.join(ROOT, "episodes", slug, "renders", `${slug}-${lang}-cover.jpg`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (ok) {
      await (await page.$("#frame")).screenshot({ path: file, type: "jpeg", quality: 94 });
      const info = await page.evaluate(() => window.__info);
      console.log(`${slug} ${lang}: ${path.relative(ROOT, file)} face ${info.face.join(",")}% title ${info.size}px, pill top ${info.pillTop}%, title bottom ${info.titleBottom}%${errs.length ? "  ERRORS " + errs.join(" | ") : ""}`);
    } else {
      failed++;
      console.log(`${slug} ${lang}: NOT READY ${errs.join(" | ")}`);
    }
    await page.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
