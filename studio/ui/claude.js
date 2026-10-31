// Ask Claude: a request from the page wakes the Claude chat that opened the studio, which does the work and answers here.
import { el, api, pill, ctx } from "./app.js";

const STATE = { new: ["running", "Waiting"], working: ["running", "Working"], done: ["done", "Done"], failed: ["failed", "Failed"] };

export function setupClaude() {
  const btn = document.getElementById("claudebtn");
  const status = el("p", { class: "note", style: "margin:0" });
  const text = el("textarea", { placeholder: "What should change?" });
  const feed = el("div", { class: "cfeed" });
  const send = el("button", { onclick: async () => {
    if (!text.value.trim()) return text.focus();
    send.disabled = true;
    await api.post("/api/requests", { text: text.value, where: { page: ctx.page?.handle, route: location.hash } });
    text.value = "";
    send.disabled = false;
    refresh();
  } }, "Send");
  const panel = el("div", { class: "cpanel", hidden: true }, el("h3", { style: "margin:0" }, "Ask Claude"), status, text, el("div", {}, send), feed);
  document.body.append(panel);
  btn.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) text.focus();
  };
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") panel.hidden = true; });
  document.addEventListener("click", (ev) => { if (!panel.hidden && !panel.contains(ev.target) && !btn.contains(ev.target)) panel.hidden = true; });
  window.addEventListener("hashchange", () => { panel.hidden = true; });
  let lastFeed = "";
  async function refresh() {
    let d;
    try {
      d = await (await fetch("/api/requests")).json();
    } catch (e) {
      return;
    }
    const s = d.status;
    btn.className = `claudebtn ${s.listening ? (s.busy ? "busy" : "on") : ""}`;
    status.textContent = !s.listening ? "No chat is listening. In any Claude chat, ask it to open the studio. Requests wait here until one does." : s.busy ? "A chat is working on a request." : "A chat is listening.";
    const key = JSON.stringify(d.requests.map((r) => [r.id, r.state, r.answer]));
    if (key === lastFeed) return;
    lastFeed = key;
    feed.replaceChildren(...d.requests.slice(0, 10).map((r) => {
      const [cls, label] = STATE[r.state] || STATE.new;
      return el("div", { class: "creq" }, el("div", { class: "row", style: "justify-content:space-between;flex-wrap:nowrap;align-items:flex-start" }, el("span", { class: "keep" }, r.text), pill(cls, label)), r.answer ? el("div", { class: "a keep" }, r.answer) : null);
    }));
  }
  refresh();
  setInterval(refresh, 2500);
}
