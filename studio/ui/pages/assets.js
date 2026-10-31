// Assets: what this page's videos are built from. Each page has its own.
import { el, ctx, fold } from "../app.js";

const tile = (n, label, href) => el(href ? "a" : "div", { class: "card", ...(href ? { href } : {}) }, el("b", {}, n), el("span", { class: "note" }, label));

export async function render(main) {
  const p = ctx.page;
  main.append(el("h1", {}, "Assets"), el("p", { class: "note" }, `@${p.handle}: ${p.about}`));
  if (p.format === "sitcom") {
    const modes = p.modes.map((m) => ctx.data.modes[m]).filter(Boolean);
    const sets = modes.reduce((n, m) => n + Object.keys(m.scenarios || {}).length, 0);
    main.append(el("div", { class: "astgrid", style: "margin-top:14px" },
      tile(1 + p.agents.length, "characters", "#/cast"), tile(p.agents.length, "AI agents", "#/cast"), tile(modes.length, "modes", "#/modes"), tile(sets, "sets", "#/modes")));
    return null;
  }
  const a = await (await fetch(`/api/pages/${p.id}/assets`)).json();
  if (p.format === "cinematic") {
    main.append(el("div", { class: "astgrid", style: "margin-top:14px" }, tile(a.textures, "real textures"), tile(a.skies, "lit skies"), tile(a.builds.length, "ready-made pieces")));
    main.append(el("h2", {}, "Ready-made pieces"), el("div", { class: "card", style: "padding:0 16px" }, a.builds.map((b) => el("div", { class: "video-row", style: "padding:10px 0" }, b))));
    main.append(el("h2", {}, "Voice"), el("div", { class: "card" }, a.voice || ""));
    return null;
  }
  const lead = ctx.data.characters[ctx.data.studio.lead];
  main.append(el("div", { class: "astgrid", style: "margin-top:14px" },
    tile(a.worlds.length, "worlds"), tile(a.labels, "label types"), tile(a.poses, "poses"), tile(a.effects, "sound effects")));
  main.append(el("h2", {}, "Cast and voice"), el("div", { class: "card" },
    el("p", {}, el("b", { class: "keep" }, lead?.name || "Lead"), ` · ${a.lead?.variant || ""}`), el("p", { class: "note" }, `Voice: ${a.voice}`)));
  main.append(el("h2", {}, "Worlds"), el("div", { class: "card", style: "padding:0 16px" }, a.worlds.map((w) =>
    el("div", { class: "video-row", style: "padding:10px 0" }, el("div", { class: "grow" }, w.name), el("span", { class: "note" }, w.ready ? "Ready to reuse" : "Needs porting")))));
  main.append(el("div", { style: "margin-top:16px" }, fold("Music", a.music.length, false, el("p", { class: "note" }, a.music.join(", ") || "None yet."))));
  return null;
}
