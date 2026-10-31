// The studio's view language. English is written in the pages; Portuguese comes from i18n-pt.js through
// this one layer, which translates what is on screen. Scripts, titles, logs and file names stay as written.
import { EXACT, PATTERNS } from "./i18n-pt.js";

const SKIP = ".xlog, .log, .mono, .md, code, pre, textarea, script, style, .t, .keep";
const ATTRS = ["placeholder", "title", "aria-label"];
let on = false;

export function say(raw) {
  if (!on) return raw;
  const text = raw.trim();
  if (!text) return raw;
  let out = EXACT[text];
  if (out == null) {
    for (const [re, to] of PATTERNS) {
      if (re.test(text)) {
        out = text.replace(re, to);
        break;
      }
    }
  }
  return out == null ? raw : raw.replace(text, out);
}

function walk(root) {
  if (root.nodeType === 3) {
    if (!root.parentElement?.closest(SKIP)) {
      const next = say(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
    }
    return;
  }
  if (root.nodeType !== 1) return;
  for (const a of ATTRS) if (root.hasAttribute(a)) root.setAttribute(a, say(root.getAttribute(a)));
  if (root.matches(SKIP)) return;
  for (const n of root.childNodes) walk(n);
}

// The English of a section title, whatever language it is on screen in.
export const inPt = (en) => EXACT[en];

export function setupLanguage() {
  let lang = "en";
  try {
    lang = localStorage.getItem("s3d-ui-lang") === "pt" ? "pt" : "en";
  } catch (e) {}
  const sel = document.getElementById("uilang");
  sel.value = lang;
  sel.onchange = () => {
    try {
      localStorage.setItem("s3d-ui-lang", sel.value);
    } catch (e) {}
    location.reload();
  };
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  on = lang === "pt";
  if (!on) return;
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
}
