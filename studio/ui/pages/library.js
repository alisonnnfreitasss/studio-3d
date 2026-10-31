// Library: the page's reels made before the studio, one card per reel, a thumbnail per version. A click plays it.
import { el, ctx, previewVideo, filterPills } from "../app.js";

const NAME = (s) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export async function render(main) {
  const rows = await (await fetch("/api/library")).json();
  const body = el("div");
  const f = filterPills("library-version", [["both", "Both versions"], ["original", "Originals"], ["second", "Second versions"]], () => draw());
  main.append(el("h1", {}, "Library"), el("div", { class: "filters" }, f.box), body);
  const draw = () => {
    const by = new Map();
    for (const r of rows.filter((x) => (f.value() === "both" || x.kind === f.value()) && (x.format || "explainer") === ctx.page.format)) by.set(r.slug, [...(by.get(r.slug) || []), r]);
    body.replaceChildren(el("div", { class: "vgrid" }, [...by.entries()].map(([slug, list]) => el("div", { class: "vtile" },
      el("div", { class: "vthumbs" }, list.map((r) => el("button", { class: "vthumb", title: "Play", onclick: () => previewVideo(r.video, r.title || NAME(slug), r.caption, null) },
        el("img", { src: `/poster/${r.video}`, alt: "", loading: "lazy" }),
        el("span", { class: "vlang" }, r.kind === "original" ? "Original" : "Mirrored"), el("span", { class: "vplay" }, "▶")))),
      el("div", { class: "t" }, list[0].title || NAME(slug)),
      el("div", { class: "note" }, list[0].format === "cinematic" ? "" : `${list.filter((r) => r.posted).length} of ${list.length} posted`)))));
  };
  draw();
}
