#!/usr/bin/env node
// A free camera check before any voice is spent: one still from every shot of each episode's
// rehearsal (estimated timing), saved per episode for a contact sheet. Found the keyboard
// occlusion and classroom framing bugs on the batch of ten and the campfire flame on batch 3.
// Needs the local server (server/serve.py) on 127.0.0.1:8810.
//   node tools/rehearsal_sheets.mjs <outdir> <lang> <slug>...
// Writes <outdir>/<slug>/<nn>-<camera>.png (the tool's stage at 360 x 640); tile them with ffmpeg:
//   ffmpeg -pattern_type glob -i '<outdir>/<slug>/*.png' -vf "scale=160:-2,tile=12x2" sheet.jpg
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const [out, lang, ...slugs] = process.argv.slice(2);
if (!out || !lang || !slugs.length) {
  console.error("usage: node tools/rehearsal_sheets.mjs <outdir> <lang> <slug>...");
  process.exit(2);
}
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1300 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
for (const slug of slugs) {
  const TL = await (await fetch(`http://127.0.0.1:8810/api/episodes/${slug}/rehearsal?lang=${lang}`)).json();
  await page.goto(`http://127.0.0.1:8810/#/make/${slug}/rehearsal`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".stage canvas", { timeout: 60000 });
  if (lang !== "en") {
    await page.evaluate((l) => [...document.querySelectorAll(".pills .pillbtn")].find((b) => b.textContent.toLowerCase().includes(l === "pt" ? "portugu" : "english"))?.click(), lang);
    await wait(2500);
    await page.waitForSelector(".stage canvas", { timeout: 60000 });
  }
  await wait(1500);
  fs.mkdirSync(`${out}/${slug}`, { recursive: true });
  for (const s of TL.shots) {
    const t = s.start + (s.end - s.start) * 0.6;
    await page.evaluate((x) => {
      const r = document.querySelector(".player input[type=range]");
      r.value = x;
      r.dispatchEvent(new Event("input"));
    }, t);
    await wait(350);
    const el = await page.$(".stage");
    await el.screenshot({ path: `${out}/${slug}/${String(s.n).padStart(2, "0")}-${s.camera.type}.png` });
  }
  console.log(slug, TL.shots.length, "shots");
}
console.log("errors:", errors.length ? errors.slice(0, 5).join(" | ") : "none");
await browser.close();
