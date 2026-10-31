// Scenario pictures: one still of a mode's scenario with a given cast, drawn by the same engine the
// renders use, at a small size. Each picture builds a stage, draws one frame, copies it out and
// frees the WebGL context, so a page can show many of them. Cached per scenario, cast and shot.
import { createStage } from "/engine/runtime.js";
import { ctx } from "./app.js";

const cache = new Map();
const mods = {};
const load = (url) => (mods[url] ||= import(url));
let queue = Promise.resolve();

export const loadScene = (mode, scenario) => Promise.all([load(`/modes/${mode}/set.js`), load(`/modes/${mode}/scenarios/${scenario}.js`)]);

// a timeline for one still: no lines, one shot
export function stillTL({ mode, scenario, lead, cast, camera = "wide", on, prop, variants = {} }) {
  const scales = {}, looks = {};
  for (const c of cast) {
    const s = ctx.data?.characters?.[c]?.scale?.[mode];
    if (s) scales[c] = s;
    const v = ctx.data?.characters?.[c]?.variant;
    if (v) looks[c] = v;
  }
  variants = { ...looks, ...variants };
  return {
    lead, cast, mode, scenario, end: 2, lang: "en", lines: [], emotions: [], hops: [], leans: [], scales, variants, screen: null,
    props: prop ? [{ who: lead, start: 0, end: 2, prop }] : [],
    shots: [{ n: 1, start: 0, end: 2, camera: { type: camera, ...(on ? { on } : {}) } }],
  };
}

export function renderScene(opts, { w = 270, h = 480, t = 0.6 } = {}) {
  const key = JSON.stringify([opts, w, h, t]);
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue.then(async () => {
    const [mode, scenario] = await loadScene(opts.mode, opts.scenario);
    const characters = Object.fromEntries(await Promise.all(opts.cast.map(async (c) => [c, await load(`/characters/${c}/model.js`)])));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const stage = createStage({ canvas, width: w, height: h, TL: stillTL(opts), mode, scenario, characters });
    stage.renderAt(t);
    const url = canvas.toDataURL("image/jpeg", 0.86);
    stage.dispose();
    stage.renderer.forceContextLoss();
    return url;
  }));
  cache.set(key, job);
  return job;
}
