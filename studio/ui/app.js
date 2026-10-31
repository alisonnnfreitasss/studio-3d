// Studio 3D web tool: the Edit Studio shell (top bar, dock, influencer switcher, light or dark, live dot, hints)
// and the shared helpers every page uses.
import { renderPortrait } from "./sheets.js";
import { setupLanguage, say, inPt } from "./i18n.js";
import { setupClaude } from "./claude.js";

export const api = {
  studio: async () => (await fetch("/api/studio")).json(),
  estimate: async (ep, lang) => (await fetch(`/api/estimate?episode=${encodeURIComponent(ep)}&lang=${encodeURIComponent(lang)}`)).json(),
  rehearsal: async (ep, lang) => (await fetch(`/api/episodes/${ep}/rehearsal?lang=${lang}`)).json(),
  jobs: async () => (await fetch("/api/jobs")).json(),
  job: async (id) => (await fetch(`/api/jobs/${id}`)).json(),
  post: async (url, body) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })).json(),
  run: (body) => api.post("/api/jobs", body),
  cancel: (id) => api.post(`/api/jobs/${id}/cancel`),
  createEpisode: (body) => api.post("/api/episodes", body),
  saveMeta: (slug, body) => api.post(`/api/episodes/${slug}/meta`, body),
  saveScript: (slug, body) => api.post(`/api/episodes/${slug}/script`, body),
  setVariant: (cid, variant) => api.post(`/api/characters/${cid}/variant`, { variant }),
  setVoice: (cid, body) => api.post(`/api/characters/${cid}/voice`, body),
  setVoiceModel: (cid, body) => api.post(`/api/characters/${cid}/voice-model`, body),
};

// el("div", {class, onclick, ...}, child, "text", ...)
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v;
    else if (k === "value") n.value = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
export const hint = (text) => el("p", { class: "hint" }, text);
export const ago = (ts) => {
  const s = (Date.now() / 1000 - ts);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

export const STEPS = ["voices", "timeline", "audio", "compose", "carve", "frames", "check", "render", "verify"];
const STEP_LABEL = { frames: "stills" };
export function stepChips(status) {
  return el("div", { class: "steps" }, ...STEPS.map((s) => {
    const st = status?.[s];
    return el("span", { class: `stepchip ${st?.state || ""}`, title: st ? `${st.state} at ${st.at}${st.error ? "\n" + st.error : ""}` : "not run yet" }, STEP_LABEL[s] || s);
  }));
}
export const PRESETS = {
  voices: { label: "Make voices", steps: "voices", voices: true },
  preview: { label: "Preview stills", steps: "preview", voices: true },
  render: { label: "Render", steps: "render", voices: false },
  all: { label: "Voices and render", steps: "all", voices: true },
};

export const pill = (state, text) => el("span", { class: `st ${state || ""}` }, text || state);
export const charName = (id) => ctx.data?.characters?.[id]?.name || id;
export const langLabel = (id) => (ctx.data?.studio?.languages || []).find((l) => l.id === id)?.label || id;
export const voicedLines = (e) => (e.script.lines || []).filter((l) => !l.silent);

// What an episode needs next in one language: the one call the Today and Videos pages show.
export function whatNext(e, lang) {
  const ep = e.episode;
  const slug = e.slug;
  const L = e.langs[lang] || {};
  const st = e.status[lang] || {};
  if (ep.state === "idea" || !voicedLines(e).length) return { key: "script", label: "Write the script", href: `#/scripts/${slug}`, needs: true };
  if (ep.state !== "approved") return { key: "approve", label: "Read and approve the script", href: `#/scripts/${slug}`, needs: true };
  const failed = STEPS.find((s) => st[s]?.state === "failed");
  if (failed) return { key: "failed", label: `${STEP_LABEL[failed] || failed} failed: open it`, href: `#/make/${slug}/final`, needs: true, bad: true };
  if (L.estimate?.ok && L.estimate.toGenerate > 0)
    return { key: "voices", label: `Approve voices: ${L.estimate.characters} characters`, href: `#/make/${slug}/voices`, needs: true };
  if (L.estimate && !L.estimate.ok) return { key: "voices", label: L.estimate.error, href: `#/make/${slug}/voices`, needs: true, bad: true };
  if (!L.render) return { key: "render", label: "Ready to render", href: `#/make/${slug}/final`, needs: true };
  return { key: "done", label: "Finished", href: `#/videos/watch/${slug}/${lang}`, needs: false };
}

// A modal with buttons [label, value, class]; resolves the value of the button pressed ("" on
// Escape). Enter in a text field presses the last button; focus starts on the first one.
export function dialog(content, buttons) {
  return new Promise((resolve) => {
    const d = document.getElementById("dialog");
    const f = document.getElementById("dialog-form");
    f.innerHTML = "";
    const btns = buttons.map(([label, value, cls]) => el("button", { value, class: cls || "" }, label));
    f.append(typeof content === "string" ? el("div", { html: content }) : content, el("div", { class: "row", style: "margin-top:16px;justify-content:flex-end" }, ...btns));
    f.querySelectorAll("input:not([type=checkbox]):not([type=radio])").forEach((i) =>
      i.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          btns[btns.length - 1].click();
        }
      }));
    d.returnValue = "";
    d.onclose = () => resolve(d.returnValue);
    d.showModal();
  });
}
// A section that stays closed until it is wanted.
export const fold = (title, count, open, ...kids) => el("details", { class: "sec", open: open || null },
  el("summary", {}, title, count != null ? el("span", { class: "cnt" }, count) : null), el("div", { class: "secbody" }, ...kids));

// Turn a page's h2 sections into folds, from the h2 to the next h2 or fold.
function foldSections(main, starts) {
  for (const h of [...main.querySelectorAll(":scope > h2")]) {
    if (!starts.some((s) => h.textContent.startsWith(s) || (inPt(s) && h.textContent.startsWith(inPt(s))))) continue;
    const kids = [];
    for (let n = h.nextElementSibling; n && n.tagName !== "H2" && !n.matches("details.sec"); n = n.nextElementSibling) kids.push(n);
    const d = fold(h.textContent, null, false);
    h.replaceWith(d);
    d.querySelector(".secbody").append(...kids);
  }
}
const FOLDED = { modes: ["Scenarios", "Camera set-ups", "What changes", "Reference stills"], cast: ["Voice test", "Teste de voz"] };

// The video in a window over the page: a click on any thumbnail.
export function previewVideo(src, title, sub, detailsHref) {
  const d = el("dialog", { class: "preview" });
  const close = () => d.close();
  d.append(el("div", { class: "row", style: "margin-bottom:10px;flex-wrap:nowrap" },
    el("div", { class: "grow" }, el("b", {}, title), sub ? el("div", { class: "note" }, sub) : null),
    detailsHref ? el("a", { class: "btn ghost small", href: detailsHref, onclick: close }, "Details") : null,
    el("button", { class: "ghost small", onclick: close, "aria-label": "Close" }, "Close")),
    el("video", { src: "/" + src, controls: true, autoplay: true, playsinline: true }));
  d.addEventListener("click", (ev) => { if (ev.target === d) close(); });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
}

// A pill row that remembers its choice. opts: [[value, label], ...]
export function filterPills(key, opts, onchange) {
  let cur = opts[0][0];
  try {
    const saved = localStorage.getItem(`s3d-f-${key}`);
    if (opts.some(([v]) => v === saved)) cur = saved;
  } catch (e) {}
  const box = el("div", { class: "fpills" });
  const draw = () => box.replaceChildren(...opts.map(([v, label]) => el("button", { class: `fpill${v === cur ? " on" : ""}`, onclick: () => {
    cur = v;
    try { localStorage.setItem(`s3d-f-${key}`, v); } catch (e) {}
    draw();
    onchange(v);
  } }, label)));
  draw();
  return { box, value: () => cur };
}

export const textOf = (v, lang) => (v && typeof v === "object" ? v[lang] || "" : v || "");

// Run pipeline steps for [{episode, lang}] with the voice-spend check, then open the live view.
export async function runItems(items, presetKey, label, { stay = false } = {}) {
  const preset = PRESETS[presetKey];
  let approveSpend = false;
  if (preset.voices) {
    const ests = await Promise.all(items.map((it) => api.estimate(it.episode, it.lang).then((e) => ({ ...it, ...e }))));
    const bad = ests.filter((e) => !e.ok);
    if (bad.length) {
      await dialog(`<h3>Voices cannot be planned yet</h3><p class="note">${bad.map((b) => `${b.episode} (${b.lang}): ${b.error}`).join("<br>")}</p>`, [["Close", "x", "ghost"]]);
      return null;
    }
    const chars = ests.reduce((s, e) => s + e.characters, 0);
    if (chars > 0) {
      const rows = ests.filter((e) => e.characters).map((e) => `<li><b>${e.episode}</b> (${e.lang.toUpperCase()}): ${e.toGenerate} new takes, ${e.characters} characters</li>`).join("");
      const ans = await dialog(`<h3>Approve ElevenLabs spend?</h3><p>This makes new voice takes:</p><ul>${rows}</ul><p><b>${chars} characters</b> in total. Takes already made are reused for free.</p>`,
        [["Cancel", "cancel", "ghost"], ["Approve and run", "go"]]);
      if (ans !== "go") return null;
      approveSpend = true;
    }
  }
  const job = await api.run({ episodes: [...new Set(items.map((i) => i.episode))], langs: [...new Set(items.map((i) => i.lang))], steps: preset.steps, approveSpend, label: label || preset.label });
  if (job.error) {
    await dialog(`<h3>Could not start</h3><p>${job.error}</p>`, [["Close", "x", "ghost"]]);
    return null;
  }
  if (!stay) location.hash = `#/videos/job/${job.id}`;
  return job;
}

// ---------------------------------------------------------------- shell
const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  scripts: '<svg viewBox="0 0 24 24"><path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 13h6M9 17h6"/></svg>',
  make: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  videos: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>',
  cast: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6M15 20c0-2.5 1-4 3.5-4s3.5 1.5 3.5 4"/></svg>',
  modes: '<svg viewBox="0 0 24 24"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/></svg>',
  knowledge: '<svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h10"/><circle cx="19" cy="19" r="2"/></svg>',
  assets: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>',
  explainers: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8v5l3 2"/></svg>',
};
// Each page (a brand's Instagram account) has its own dock: what that page's format needs.
const NAVS = { sitcom: [
  ["this-week", [["home", "Today", "today"]]],
  ["make-today", [["scripts", "Scripts", "scripts"], ["make", "Make video", "make"], ["videos", "Videos", "videos"]]],
  ["watch", [["assets", "Assets", "assets"], ["cast", "Cast", "cast"], ["modes", "Modes", "modes"], ["knowledge", "Knowledge", "knowledge"]]],
  ["all", [["people", "All pages", "pages"]]],
], explainer: [
  ["make-today", [["explainers", "Explainers", "explainers"], ["videos", "Library", "library"]]],
  ["watch", [["assets", "Assets", "assets"]]],
  ["all", [["people", "All pages", "pages"]]],
], cinematic: [
  ["make-today", [["explainers", "Create", "explainers"], ["videos", "Library", "library"]]],
  ["watch", [["assets", "Assets", "assets"]]],
  ["all", [["people", "All pages", "pages"]]],
] };
const TITLES = { create: "Create", assets: "Assets", library: "Library", pages: "All pages", explainers: "Explainers", today: "Today", scripts: "Scripts", make: "Make video", videos: "Videos", cast: "Cast", modes: "Modes", knowledge: "Knowledge" };
const PAGES = {
  explainers: () => import("./pages/explainers.js"),
  today: () => import("./pages/today.js"),
  scripts: () => import("./pages/scripts.js"),
  make: () => import("./pages/make.js"),
  videos: () => import("./pages/videos.js"),
  cast: () => import("./pages/cast.js"),
  modes: () => import("./pages/modes.js"),
  knowledge: () => import("./pages/knowledge.js"),
  pages: () => import("./pages/pages.js"),
  assets: () => import("./pages/assets.js"),
  library: () => import("./pages/library.js"),
};

export const ctx = { data: null, influencer: null, page: null };
export function currentPage() {
  const list = ctx.data?.pages || [];
  let id = null;
  try {
    id = localStorage.getItem("s3d-page");
  } catch (e) {}
  return list.find((p) => p.id === id) || list[0];
}
export function setPage(id) {
  try {
    localStorage.setItem("s3d-page", id);
  } catch (e) {}
}
export function episodesOf() {
  return ctx.page?.format === "sitcom" ? ctx.data?.episodes || [] : [];
}

function buildNav(page) {
  const nav = document.getElementById("dock");
  nav.innerHTML = "";
  NAVS[ctx.page.format].forEach(([, items], g) => {
    if (g) nav.append(el("hr"));
    for (const [icon, title, key] of items) {
      const link = el("a", { class: key === page ? "on" : "", href: `#/${key}`, "aria-label": title });
      link.innerHTML = ICONS[icon];
      link.append(el("span", { class: "tip" }, title));
      nav.append(link);
    }
  });
}

async function buildSwitcher() {
  const sel = document.getElementById("influencer");
  sel.innerHTML = "";
  for (const p of ctx.data.pages) sel.append(el("option", { value: p.id, ...(p.id === ctx.page.id ? { selected: true } : {}) }, `@${p.handle}`));
  sel.onchange = () => {
    setPage(sel.value);
    location.hash = ctx.data.pages.find((p) => p.id === sel.value).format === "sitcom" ? "#/today" : "#/explainers";
    route();
  };
  const lead = ctx.page.lead || ctx.data.studio.lead;
  const c = ctx.data.characters[lead];
  document.getElementById("portrait").hidden = ctx.page.format === "cinematic";   // voice only: no character
  try {
    document.getElementById("portrait").src = await renderPortrait(lead, c?.variant);
  } catch (e) {
    console.warn("portrait", e);
  }
}

function setupTheme() {
  const d = document.documentElement;
  const lbl = document.getElementById("themelbl");
  const name = () => { lbl.textContent = d.dataset.theme === "dark" ? "Dark" : "Light"; };
  name();
  document.getElementById("themebtn").onclick = () => {
    d.dataset.theme = d.dataset.theme === "dark" ? "light" : "dark";
    name();
    try {
      localStorage.setItem("s3d-theme", d.dataset.theme);
    } catch (e) {}
  };
  document.getElementById("qall").onclick = (e) => {
    document.body.classList.toggle("hints-on");
    e.currentTarget.classList.toggle("on");
  };
}

async function live() {
  const dot = document.getElementById("livedot");
  try {
    const jobs = await api.jobs();
    const run = jobs.find((j) => j.state === "running" || j.state === "queued");
    dot.className = `live ${run ? "pending" : "on"}`;
    dot.hidden = !run;
    dot.lastChild.textContent = run ? `Working · ${run.label || run.episodes.join(", ")}` : "Live";
    dot.href = run ? `#/videos/job/${run.id}` : "#/videos/working";
  } catch (e) {
    dot.className = "live stale";
    dot.hidden = false;
    dot.lastChild.textContent = "Server offline";
  }
}

let cleanup = null;
export async function route() {
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.warn(e);
    }
    cleanup = null;
  }
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  ctx.data = await api.studio();
  // a link to another page's section opens that page
  const has = (p) => NAVS[p.format].some(([, items]) => items.some((i) => i[2] === parts[0]));
  const owner = ctx.data.pages.find(has);
  if (owner && !has(currentPage())) setPage(owner.id);
  ctx.page = currentPage();
  ctx.influencer = ctx.page.lead || ctx.data.studio.lead;
  const home = ctx.page.format === "sitcom" ? "today" : "explainers";
  const allowed = new Set(NAVS[ctx.page.format].flatMap(([, items]) => items.map((i) => i[2])));
  const page = allowed.has(parts[0]) ? parts[0] : home;
  buildNav(page);
  await buildSwitcher();
  const pageTitle = ctx.page.format === "cinematic" && page === "explainers" ? "Cinematic" : TITLES[page];
  document.getElementById("crumb-page").textContent = pageTitle;
  document.title = `${say(pageTitle)} · Studio 3D`;
  const main = document.getElementById("page");
  main.innerHTML = "";
  const mod = await PAGES[page]();
  cleanup = (await mod.render(main, { ...ctx, args: parts.slice(1), route })) || null;
  if (FOLDED[page] && !parts[1]) foldSections(main, FOLDED[page]);
}

setupTheme();
setupLanguage();
setupClaude();
window.addEventListener("hashchange", route);
route();
live();
setInterval(live, 2500);
