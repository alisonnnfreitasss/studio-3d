// Knowledge: this repo's saved context (knowledge/*.md), read as it is, with a small Markdown
// renderer.
import { el, hint, ctx } from "../app.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

export function markdown(src) {
  const out = [];
  const lines = src.split("\n");
  let i = 0;
  const isList = (l) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
      i++;
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\|\s*:?-/.test(r));
      out.push("<table>" + body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`).join("") + "</table>");
      continue;
    }
    if (isList(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && (isList(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (isList(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||```)/.test(lines[i]) && !isList(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

export async function render(main, { args }) {
  const files = ctx.data.knowledge;
  const pick = files.includes(args[0]) ? args[0] : files.includes("README.md") ? "README.md" : files[0];
  main.append(el("h1", {}, "Knowledge"),
    hint("Everything we have learned from our own builds, kept in knowledge/ as Markdown. Edit the files; this page reads them as they are."));
  const list = el("div", { class: "list card", style: "padding:8px" }, ...files.map((f) => el("a", { href: `#/knowledge/${f}`, class: f === pick ? "on" : "" }, f.replace(/\.md$/, ""))));
  const view = el("div", { class: "card md" });
  main.append(el("div", { class: "kn" }, el("div", {}, list), view));
  if (pick) view.innerHTML = markdown(await (await fetch(`/knowledge/${pick}`)).text());
}
