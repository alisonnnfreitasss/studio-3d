// All pages: each brand's Instagram account has its own videos and assets. Picking one switches the whole studio.
import { el, ctx, setPage, route } from "../app.js";

const FORMATS = { sitcom: "3D sitcoms", explainer: "3D explainers", cinematic: "Cinematic 3D" };

export async function render(main) {
  const lib = await (await fetch("/api/library")).json();
  const ex = await (await fetch("/api/explainers")).json();
  main.append(el("h1", {}, "All pages"));
  const g = el("div", { class: "cards-v" });
  for (const p of ctx.data.pages) {
    const mine = (f) => (f || "explainer") === p.format;
    const n = p.format === "sitcom" ? ctx.data.episodes.length : new Set(lib.filter((r) => mine(r.format)).map((r) => r.slug)).size + ex.explainers.filter((e) => mine(e.topic.format)).length;
    g.append(el("div", { class: "card" },
      el("h2", { style: "margin:0" }, `@${p.handle}`), el("div", { class: "note" }, `${FORMATS[p.format]} · ${p.language.toUpperCase()}`),
      el("p", {}, p.about), el("p", { class: "note" }, `${n} videos`),
      el("div", { class: "row" },
        el("button", { class: p.id === ctx.page.id ? "ghost" : "", disabled: p.id === ctx.page.id, onclick: () => {
          setPage(p.id);
          location.hash = p.format === "sitcom" ? "#/today" : "#/explainers";
          route();
        } }, p.id === ctx.page.id ? "Open now" : "Switch to this page"),
        p.url ? el("a", { class: "btn ghost", href: p.url, target: "_blank", rel: "noopener" }, "Instagram") : null)));
  }
  main.append(g);
}
