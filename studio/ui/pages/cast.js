// Cast: the reference sheet of every character, drawn live from the same three.js model files
// the videos render. Characters with outfits or looks (the lead Pixel's shirts, Grok's two
// designs) show each one; "Set as default" is the look every episode uses unless it picks
// another on Make video → Mode & look.
import { el, hint, api, ctx, pill, charName, route, dialog } from "../app.js";
import { drawViews, drawExpressions, loadModel, renderOutfit } from "../sheets.js";

export async function render(main, { args }) {
  const ids = [ctx.influencer, ...ctx.data.agents];
  if (!args[0]) return grid(main, ids);
  return sheet(main, args[0], args[1]);
}

async function voicePicker(main) {
  let opts = null;
  try {
    opts = await (await fetch("/characters/_voice-options.json", { cache: "no-store" })).json();
  } catch (e) {
    return;
  }
  if (!opts?.slots?.length) return;
  const used = {}; // lang -> {voice id -> character}
  for (const [cid, c] of Object.entries(ctx.data.characters)) {
    for (const [lang, v] of Object.entries(c?.voices || {})) if (v?.id) (used[lang] ||= {})[v.id] = cid;
  }
  // once every slot has its voice the picker folds away; it stays there to change a pick
  const done = opts.slots.every((sl) => ctx.data.characters[sl.character]?.voices?.[sl.lang]?.id);
  const wrap = el("details", { class: "sec", open: !done }, el("summary", {}, done ? "Voices picked" : "Voices to pick", el("span", { class: "cnt" }, `${opts.slots.length} slots`)));
  const body = el("div", { class: "secbody" }, hint("Play each sample (ElevenLabs' own clip, free) and press Pick. A voice from the library is added to your ElevenLabs account first; nothing is spent until a line is voiced. Two characters never share a voice in the same language."));
  wrap.append(body);
  main.append(wrap);
  main = body;
  for (const slot of opts.slots) {
    const c = ctx.data.characters[slot.character];
    const now = c?.voices?.[slot.lang];
    const box = el("div", { class: "card", style: "margin-bottom:12px" },
      el("div", { class: "row" }, el("b", { class: "grow" }, `${c?.name || slot.character} · ${slot.lang === "pt" ? "Português" : "English"}`),
        now?.id || now?.name ? pill("done", `picked: ${now.name}`) : pill("needs-approval", "to pick")),
      el("p", { class: "note", style: "margin:4px 0 10px" }, slot.brief));
    const list = el("div", { class: "cards-v", style: "grid-template-columns:repeat(auto-fill,minmax(250px,1fr))" });
    for (const o of slot.options) {
      const taken = used[slot.lang]?.[o.id] && used[slot.lang][o.id] !== slot.character ? used[slot.lang][o.id] : null;
      const mine = now?.id === o.id;
      const pick = el("button", { class: mine ? "small" : "small ghost", disabled: !!taken || mine, onclick: async () => {
        pick.textContent = "Picking…";
        const r = await api.setVoice(slot.character, { lang: slot.lang, id: o.id, name: o.name, owner: o.owner });
        if (r.error) {
          pick.textContent = "Pick";
          await dialog(`<h3>Not picked</h3><p>${r.error}</p>`, [["Close", "x", "ghost"]]);
          return;
        }
        route();
      } }, mine ? "Picked" : taken ? `${ctx.data.characters[taken]?.name || taken} has it` : "Pick");
      list.append(el("div", { class: "card", style: `padding:10px;${mine ? "border:2px solid hsl(var(--primary))" : ""}` },
        el("b", {}, o.name), el("div", { class: "note" }, `${o.source}${o.v4 ? " · tuned for v4" : ""}`),
        el("p", { class: "note", style: "margin:6px 0" }, o.about),
        o.preview ? el("audio", { controls: true, preload: "none", src: o.preview, style: "width:100%;height:34px" }) : el("p", { class: "note" }, "no sample"),
        el("div", { class: "row", style: "margin-top:8px" }, pick)));
    }
    box.append(list);
    main.append(box);
  }
}

// The latest voice test: every voice reading the same passage on two models, side by side, with the
// choice of model per voice (an episode's new takes then use it)
async function voiceTest(main) {
  let run, res;
  try {
    run = (await (await fetch("/auditions/latest.json", { cache: "no-store" })).json()).run;
    res = await (await fetch(`/auditions/${run}/results.json`, { cache: "no-store" })).json();
  } catch (e) {
    return;
  }
  const keys = Object.keys(res.models);
  const rows = {};
  for (const r of res.results) (rows[`${r.who}|${r.lang}`] ||= { who: r.who, lang: r.lang, voice: r.voice, takes: {} }).takes[r.key] = r;
  const def = ctx.data.studio.tts?.model;
  main.append(el("h2", { style: "margin-top:4px" }, `Voice test · ${keys.join(" against ")}`),
    hint("The same passage on each model. v4 lines carry delivery tags in brackets, which it acts rather than reads. Pick the model per voice: a voice can stay on v2 while others move to v4. New takes use the pick; takes already made stay as they are."));
  const t = el("table", {}, el("tr", {}, el("th", {}, "Voice"), ...keys.map((k) => el("th", {}, `${k} · ${res.models[k]}`)), el("th", {}, "Use")));
  for (const row of Object.values(rows)) {
    const c = ctx.data.characters[row.who];
    const now = c?.voices?.[row.lang]?.model || def;
    const cells = keys.map((k) => {
      const r = row.takes[k];
      if (!r) return el("td", {}, "");
      return el("td", { style: "min-width:260px" },
        r.error ? el("span", { style: "color:hsl(var(--destructive))" }, r.error) : el("audio", { controls: true, preload: "none", src: `/auditions/${run}/${r.file}`, style: "width:100%;height:34px" }),
        el("div", { class: "note", style: "margin-top:4px" }, `${r.seconds ?? "?"} s · ${r.text}`));
    });
    const choose = el("div", { class: "row", style: "gap:6px" }, ...keys.map((k) => {
      const model = res.models[k];
      return el("button", { class: `small${now === model ? "" : " ghost"}`, disabled: now === model, onclick: async () => {
        const r = await api.setVoiceModel(row.who, { lang: row.lang, model });
        if (r.error) await dialog(`<h3>Not changed</h3><p>${r.error}</p>`, [["Close", "x", "ghost"]]);
        else route();
      } }, now === model ? `On ${k}` : `Use ${k}`);
    }));
    t.append(el("tr", {}, el("td", {}, el("b", {}, `${c?.name || row.who} · ${row.lang.toUpperCase()}`), el("div", { class: "note" }, row.voice)), ...cells, el("td", {}, choose)));
  }
  main.append(el("div", { class: "card", style: "padding:6px 12px;overflow-x:auto;margin-bottom:16px" }, t));
}

async function grid(main, ids) {
  main.append(el("h1", {}, "Cast"),
    hint("Every character is our own design, built from three.js shapes in characters/<id>/model.js, with its name, voices, palette and notes in character.json. A new influencer or agent is a new folder there, listed in studio.json."));
  const g = el("div", { class: "cards-v", style: "grid-template-columns:repeat(auto-fill,minmax(230px,1fr))" });
  for (const id of ids) {
    const c = ctx.data.characters[id];
    if (!c) continue;
    const img = el("img", { alt: c.name, style: "width:76px;height:114px" });
    renderOutfit(id, c.variant, { w: 152, h: 228 }).then((u) => (img.src = u));
    g.append(el("a", { class: "card vcard", href: `#/cast/${id}` }, img,
      el("div", { class: "grow" }, el("b", {}, c.name), el("div", { class: "note" }, `${c.role}${c.handle ? " · @" + c.handle : ""}`),
        c.variants?.length ? el("div", { class: "note" }, `${c.variants.length} ${c.kind === "human" ? "outfits" : "looks"}`) : null,
        c.decision ? el("div", { style: "margin-top:6px" }, pill("needs-approval", "to decide")) : null)));
  }
  main.append(g);
  await voiceTest(main);
  await voicePicker(main);
}

async function sheet(main, id, look) {
  const c = ctx.data.characters[id];
  if (!c) {
    main.append(el("p", {}, "No such character. ", el("a", { href: "#/cast" }, "Cast")));
    return;
  }
  const mod = await loadModel(id);
  const variants = mod.meta.variants || [];
  const current = variants.includes(look) ? look : c.variant || variants[0];
  const word = c.kind === "human" ? "outfit" : "look";
  main.append(el("p", { class: "note" }, el("a", { href: "#/cast" }, "← Cast")),
    el("div", { class: "row" }, el("h1", { class: "grow", style: "margin:0" }, c.name), pill("", c.role), c.kind !== c.role ? pill("", c.kind) : null, c.decision ? pill("needs-approval", c.decision) : null),
    el("p", {}, c.personality));

  if (variants.length) {
    main.append(el("h2", {}, c.kind === "human" ? "Outfits" : "Looks"),
      hint(`Click a ${word} to see its sheet. "Set as default" makes it the ${word} of every episode that does not pick its own.`));
    const row = el("div", { class: "outfits" });
    for (const v of variants) {
      const img = el("img", { alt: v });
      renderOutfit(id, v).then((u) => (img.src = u));
      row.append(el("a", { class: `outfit${v === current ? " on" : ""}`, href: `#/cast/${id}/${v}`, style: "text-decoration:none;color:inherit" }, img,
        el("div", { class: "note" }, c.outfits?.[v] || v), v === c.variant ? el("div", { class: "note", style: "font-weight:600" }, "default") : null));
    }
    main.append(row);
    if (current !== c.variant) {
      main.append(el("div", { class: "row", style: "margin-top:10px" }, el("button", { onclick: async () => {
        const res = await api.setVariant(id, current);
        if (!res.error) route();
      } }, `Set ${c.outfits?.[current] || current} as default`)));
    }
  }

  const card = el("div", { class: "card", style: "margin-top:16px" });
  main.append(card);
  card.append(el("h3", { style: "margin-top:0" }, `Turnaround${variants.length ? ` · ${c.outfits?.[current] || current}` : ""}`));
  const views = el("canvas", { class: "sheet" });
  const vl = el("div", { class: "labels", style: "grid-template-columns:repeat(4,1fr)" });
  card.append(views, vl);
  (await drawViews(views, id, { variant: current })).forEach((n) => vl.append(el("div", {}, n)));

  card.append(el("h3", {}, "Expressions"));
  const ex = el("canvas", { class: "sheet" });
  const labels = el("div", { style: "position:absolute;inset:0;display:grid;pointer-events:none" });
  card.append(el("div", { style: "position:relative" }, ex, labels));
  const { list, cols } = await drawExpressions(ex, id, { variant: current });
  labels.style.gridTemplateColumns = `repeat(${cols},1fr)`;
  labels.style.gridTemplateRows = `repeat(${Math.ceil(list.length / cols)},1fr)`;
  list.forEach((n) => labels.append(el("div", { class: "mono", style: "align-self:end;text-align:center;font-size:11px;color:#c9cde4;padding-bottom:4px" }, n)));

  const info = el("div", { class: "card", style: "margin-top:16px" });
  main.append(info);
  info.append(el("h3", { style: "margin-top:0" }, "Look"), el("p", {}, c.look));
  const sw = el("div", { class: "swatches" });
  for (const [k, v] of Object.entries(c.palette || {})) {
    for (const hex of String(v).split(" ").filter((x) => x.startsWith("#"))) sw.append(el("span", { class: "swatch" }, el("i", { style: `background:${hex}` }), `${k} ${hex}`));
  }
  info.append(sw);
  const vt = el("table", {}, el("tr", {}, el("th", {}, "Language"), el("th", {}, "Voice (ElevenLabs)"), el("th", {}, "Settings")));
  for (const [lang, vo] of Object.entries(c.voices || {})) {
    vt.append(el("tr", {}, el("td", { class: "mono" }, lang),
      el("td", {}, vo.name || pill("needs-approval", `to pick: ${(vo.candidates || []).join(" or ")}`)),
      el("td", { class: "mono note" }, Object.entries(vo.settings || {}).map(([k, x]) => `${k} ${x}`).join(" · "))));
  }
  info.append(el("h3", {}, "Voices"), vt);
  if (c.notes?.length) info.append(el("h3", {}, "Notes"), el("ul", {}, ...c.notes.map((n) => el("li", {}, n))));
  info.append(el("p", { class: "note mono" }, `characters/${id}/model.js · ${mod.meta.emotions.length} expressions: ${mod.meta.emotions.join(", ")}`));
}
