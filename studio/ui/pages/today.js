// Today: what needs the influencer's owner now, what is running, what finished.
import { el, hint, api, ctx, episodesOf, whatNext, pill, charName, ago, fold, previewVideo, langLabel } from "../app.js";
import { renderOutfit } from "../sheets.js";

export async function render(main) {
  const inf = ctx.influencer;
  const c = ctx.data.characters[inf];
  const eps = episodesOf(inf);
  const items = eps.flatMap((e) => e.episode.languages.map((lang) => ({ e, lang, next: whatNext(e, lang) })));
  // one row per episode while the script is the blocker, one per language after that
  const seen = new Set();
  const needs = items.filter((i) => {
    if (!i.next.needs) return false;
    if (["script", "approve"].includes(i.next.key)) {
      if (seen.has(i.e.slug)) return false;
      seen.add(i.e.slug);
    }
    return true;
  });
  const finished = items.filter((i) => !i.next.needs).sort((a, b) => (b.e.langs[b.lang].renderedAt || "").localeCompare(a.e.langs[a.lang].renderedAt || ""));
  const decisions = Object.entries(ctx.data.characters).filter(([, x]) => x?.decision);
  const jobs = (await api.jobs()).filter((j) => j.state === "running" || j.state === "queued");

  main.append(
    el("h1", {}, "Today"),
    el("p", { class: "note" }, `${c?.name || inf} · ${eps.length} episodes · ${finished.length} videos finished`),
    hint("Today lists what needs you, what is running and what finished. Every row opens the exact place to act. Nothing spends credits without asking first."),
    el("div", { class: "row", style: "margin:14px 0 4px" },
      el("a", { class: "btn", href: "#/scripts/new" }, "+ New script"),
      el("a", { class: "btn ghost", href: "#/make" }, "Make video"),
      el("a", { class: "btn ghost", href: "#/videos/needs" }, "All videos")),
  );

  main.append(el("h2", {}, "Needs you ", el("span", { class: "note" }, `(${needs.length + decisions.length})`)));
  const nbox = el("div", { class: "card", style: "padding:0 16px" });
  for (const i of needs) {
    const L = i.e.langs[i.lang] || {};
    const scriptStep = ["script", "approve"].includes(i.next.key);
    nbox.append(el("a", { class: "video-row", href: i.next.href },
      L.thumb ? el("img", { class: "thumb", src: "/" + L.thumb }) : el("div", { class: "thumb" }),
      el("div", { class: "grow" },
        el("div", { class: "t" }, i.e.episode.title, scriptStep ? null : el("span", { class: "note" }, `  ${i.lang.toUpperCase()}`)),
        el("div", { class: "row", style: "gap:6px;margin-top:4px" }, pill(i.e.episode.state), el("span", { class: "note" }, `${i.e.episode.mode} mode · ${i.e.episode.languages.join(" + ").toUpperCase()}`))),
      el("span", { class: "go", style: i.next.bad ? "color:hsl(var(--destructive))" : "" }, `${i.next.label} →`)));
  }
  // voices still to pick, per character and language
  const missing = Object.entries(ctx.data.characters).flatMap(([cid, x]) => Object.entries(x?.voices || {}).filter(([, v]) => !v?.name && !v?.id).map(([lang]) => `${x.name} ${lang.toUpperCase()}`));
  if (missing.length) {
    nbox.append(el("a", { class: "video-row", href: "#/cast" }, el("div", { class: "thumb" }),
      el("div", { class: "grow" }, el("div", { class: "t" }, "Voices to pick"), el("div", { class: "note" }, missing.join(" · "))), el("span", { class: "go" }, "Listen and pick →")));
  }
  for (const [id, x] of decisions) {
    const img = el("img", { class: "thumb", alt: charName(id) });
    renderOutfit(id, x.variant, { w: 104, h: 160 }).then((u) => (img.src = u));
    nbox.append(el("a", { class: "video-row", href: `#/cast/${id}` }, img,
      el("div", { class: "grow" }, el("div", { class: "t" }, charName(id)), el("div", { class: "note" }, x.decision)), el("span", { class: "go" }, "Decide →")));
  }
  main.append(needs.length || decisions.length || missing.length ? nbox : el("div", { class: "empty" }, "Nothing needs you. Write a new script to start the next video."));

  if (jobs.length) main.append(el("h2", {}, "Working"));
  for (const j of jobs) {
    main.append(el("a", { class: "card row", href: `#/videos/job/${j.id}`, style: "text-decoration:none;margin-bottom:8px" },
      pill(j.state), el("b", {}, j.label || j.episodes.join(", ")), el("span", { class: "note" }, j.started ? `started ${ago(j.started)}` : "queued"), el("span", { class: "go", style: "margin-left:auto" }, "Watch live →")));
  }

  if (!finished.length) return;
  const grid = el("div", { class: "cards-v" });
  for (const i of finished.slice(0, 6)) {
    const L = i.e.langs[i.lang];
    grid.append(el("div", { class: "card vcard" },
      el("button", { class: "thumbbtn", title: "Play", onclick: () => previewVideo(L.render, i.e.episode.title, langLabel(i.lang), i.next.href) }, L.thumb ? el("img", { src: "/" + L.thumb }) : el("div", { class: "thumb" })),
      el("a", { class: "grow", href: i.next.href, style: "text-decoration:none" }, el("b", {}, i.e.episode.title), el("div", { class: "note" }, `${i.lang.toUpperCase()} · ${i.e.episode.mode} mode`), el("div", { class: "note" }, L.renderedAt || ""))));
  }
  main.append(el("div", { style: "margin-top:18px" }, fold("Latest finished", null, false, grid, el("p", {}, el("a", { href: "#/videos/finished" }, `All ${finished.length} finished videos →`)))));
}
