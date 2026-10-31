// One step of a reel's board, explained so anyone can follow it: what the step is, then what it made.
// The technical files stay available under "Technical details". Text comes from the reel's plain.json, in both languages.
import { el, fold } from "./app.js";

const pt = () => document.documentElement.lang === "pt-BR";
const t = (en, br) => (pt() ? br : en);
const L = (v) => (v && typeof v === "object" ? (pt() ? v.pt : v.en) : v || "");
const sec = (s) => `${s.toFixed(1).replace(".", pt() ? "," : ".")} s`;

const ABOUT = {
  script: ["The words the narrator says. Everything else follows from them.", "As palavras que o narrador fala. Todo o resto nasce delas."],
  "gate:script": ["You read the script and said yes. Nothing moves without this.", "Você leu o roteiro e disse sim. Nada anda sem isso."],
  voice: ["The script turned into speech, with the exact time of every word. That is how pictures land on the right word.", "O roteiro virou fala, com o momento exato de cada palavra. É assim que as imagens caem na palavra certa."],
  "gate:voice": ["If the voice costs credits, you approve it here first.", "Se a voz gastar créditos, você aprova aqui antes."],
  plan: ["The story of the video, before anything is built.", "A história do vídeo, antes de construir qualquer coisa."],
  world: ["The place and the objects of the video, built in 3D with code.", "O lugar e os objetos do vídeo, construídos em 3D com código."],
  direction: ["Like a film director: where the camera goes and what appears on screen, sentence by sentence.", "Como um diretor de cinema: para onde a câmera vai e o que aparece na tela, frase por frase."],
  build: ["One builder makes the place, the objects and the camera in one go.", "Um construtor faz o lugar, os objetos e a câmera de uma vez só."],
  shotmap: ["A picture of every sentence, to catch problems before making the video.", "Uma imagem de cada frase, para achar problemas antes de fazer o vídeo."],
  "gate:shotmap": ["You looked at the pictures and said yes.", "Você olhou as imagens e disse sim."],
  render: ["The video is made frame by frame, then checked automatically.", "O vídeo é feito quadro a quadro e depois checado automaticamente."],
  review: ["A second Claude, who did not build it, watches and says what is wrong.", "Um segundo Claude, que não construiu nada, assiste e diz o que está errado."],
  translate: ["The same script, written again in the new language. Same story, same order.", "O mesmo roteiro, escrito de novo no novo idioma. Mesma história, mesma ordem."],
  relocalize: ["The world stays the same. The camera and labels get moved onto the new words, and the labels get translated.", "O mundo continua o mesmo. A câmera e as etiquetas passam para as palavras novas, e as etiquetas são traduzidas."],
  fix: ["The notes from the review get fixed.", "As anotações da revisão são corrigidas."],
  variant: ["A second video from the same work: mirrored, other colours, another song.", "Um segundo vídeo do mesmo trabalho: espelhado, outras cores, outra música."],
  reference: ["The reference video is measured: its sentences, cuts and camera.", "O vídeo de referência é medido: frases, cortes e câmera."],
};

const CAMERA = [
  [/^hold ([\d.]+) s, drift orbit.*$/, (m) => t(`Camera holds, slowly turning, ${m[1]} s`, `Câmera parada, girando devagar, ${m[1]} s`)],
  [/^hold ([\d.]+) s.*$/, (m) => t(`Camera holds still, ${m[1]} s`, `Câmera parada, ${m[1]} s`)],
  [/^pull out.*\(([\d.]+) s\)$/, (m) => t(`Camera moves back, ${m[1]} s`, `Câmera se afasta, ${m[1]} s`)],
  [/^push in.*\(([\d.]+) s\)$/, (m) => t(`Camera moves closer, ${m[1]} s`, `Câmera se aproxima, ${m[1]} s`)],
  [/^.*reframe \(([\d.]+) s\)$/, (m) => t(`Camera adjusts, ${m[1]} s`, `Câmera ajusta, ${m[1]} s`)],
  [/^cut.*$/, () => t("Cut to a new place", "Corte para outro lugar")],
];
const camera = (c) => { for (const [re, f] of CAMERA) { const m = c.match(re); if (m) return f(m).replace(/(\d)\.(\d)/, pt() ? "$1,$2" : "$1.$2"); } return c; };
const KINDS = { "red X": ["Red X", "X vermelho"], "green check": ["Green check", "Check verde"], "force arrow": ["Arrow", "Seta"], "loop arrow": ["Curved arrow", "Seta curva"], leader: ["Pointer line", "Linha indicadora"] };
const item = (i) => i.text || (KINDS[i.kind] ? t(...KINDS[i.kind]) : i.kind);
const ROLE = { hook: ["Hook", "Gancho"], fix: ["Fix", "Solução"], name: ["Name", "Nome"], main: ["Script", "Roteiro"], problem: ["Problem", "Problema"], comment: ["Comment ask", "Pedido de comentário"] };
const role = (s) => (ROLE[s] ? t(...ROLE[s]) : s);

const box = (...k) => el("div", { class: "scard" }, ...k);
const heading = (txt) => el("div", { class: "shead" }, txt);
const still = (e, b) => el("img", { class: "sstill", src: `/explainers/${e.slug}/renders/shotmap/page/shots/${b}.jpg`, alt: "", loading: "lazy" });

function script(e, D) {
  const lines = e.script?.lines || [];
  if (!lines.length) return null;
  const beats = D.timeline?.beats || [];
  const kids = [el("div", { class: "sgrid1" }, lines.map((l, i) => box(
    el("span", { class: "schip" }, role(l.scene)), el("div", { class: "sbig" }, l.text),
    D.plain?.script?.[i] && !pt() ? null : D.plain?.script?.[i] ? el("div", { class: "note" }, D.plain.script[i].pt) : null,
    beats[i] ? el("div", { class: "note" }, `${sec(beats[i].start)} → ${sec(beats[i].end)}`) : null)))];
  const alts = (e.script?.hooks || []).slice(1);
  if (alts.length) kids.push(el("div", { style: "margin-top:12px" }, fold(t("Other openings we considered", "Outras aberturas que a gente considerou"), alts.length, false, alts.map((h) => el("p", {}, h.text)))));
  return el("div", {}, ...kids);
}

function translation(e, D) {
  const was = e.source_script?.lines || [];
  const now = e.script?.lines || [];
  if (!now.length) return null;
  return el("div", { class: "sgrid1" }, now.map((l, i) => box(el("span", { class: "schip" }, role(l.scene)), el("div", { class: "sbig" }, l.text), was[i] ? el("div", { class: "note" }, was[i].text) : null)));
}

function relocalize(e, D) {
  const W = D.plain?.world;
  return el("div", {},
    el("div", { class: "sgrid2" },
      box(heading(t("Stays the same", "Continua igual")), el("ul", { class: "schecks" }, el("li", {}, t("The world and its objects", "O mundo e os objetos")), el("li", {}, t("The camera moves", "Os movimentos de câmera")), el("li", {}, t("The story", "A história")))),
      box(heading(t("Changes", "Muda")), el("ul", { class: "schecks" }, el("li", {}, t("The script and the voice", "O roteiro e a voz")), el("li", {}, t("The text on objects and labels", "O texto dos objetos e das etiquetas")), el("li", {}, t("The timing, to fit the new words", "O tempo, para caber nas palavras novas"))))),
    W?.moments && e.run.check ? el("div", { class: "smoments", style: "margin-top:12px" }, W.moments.map((m, i) => el("figure", {}, el("img", { src: `/explainers/${e.slug}/renders/moments/${i}.jpg`, alt: "", loading: "lazy" }), el("figcaption", {}, L(m.name))))) : null);
}

function voice(e, D) {
  const beats = D.timeline?.beats;
  if (!beats) return null;
  const audio = el("audio", { controls: true, src: `/explainers/${e.slug}/build/assets/voice.wav`, style: "width:100%" });
  return el("div", {}, audio, el("div", { class: "sgrid1", style: "margin-top:12px" }, beats.map((b) => el("button", { class: "sline", title: t("Play from here", "Tocar daqui"), onclick: () => { audio.currentTime = b.start; audio.play(); } },
    el("span", { class: "sspeak" }, "▶"), el("span", { class: "grow" }, b.en), el("span", { class: "note" }, sec(b.start))))));
}

function plan(e, D) {
  const P = D.plain?.plan;
  if (!P) return null;
  const shots = D.shots || [];
  return el("div", {},
    box(heading(t("The idea", "A ideia")), el("div", { class: "sbig" }, L(P.idea))),
    heading(t("The story, in parts", "A história, em partes")),
    el("div", { class: "sgrid3" }, P.story.map((s, i) => box(shots[i] ? still(e, shots[i].id) : null, el("b", {}, `${i + 1}. ${L(s.title)}`), el("div", { class: "note" }, L(s.what))))),
    heading(t("Rules so the science stays right", "Regras para a ciência ficar certa")),
    box(el("ul", { class: "schecks" }, P.rules.map((r) => el("li", {}, L(r))))));
}

function world(e, D) {
  const W = D.plain?.world;
  if (!W) return null;
  return el("div", {},
    el("div", { class: "sgrid2" }, box(heading(t("The place", "O lugar")), el("div", {}, L(W.place))), box(heading(t("Who is in it", "Quem aparece")), el("div", {}, L(W.who)))),
    heading(t("The objects", "Os objetos")),
    el("div", { class: "sgrid3" }, W.things.map((x) => box(el("b", {}, L(x.name)), el("div", { class: "note" }, L(x.what))))),
    heading(t("How the world changes", "Como o mundo muda")),
    el("div", { class: "smoments" }, W.moments.map((m, i) => el("figure", {}, el("img", { src: `/explainers/${e.slug}/renders/moments/${i}.jpg`, alt: "", loading: "lazy" }), el("figcaption", {}, L(m.name))))));
}

function direction(e, D) {
  const shots = D.shots;
  if (!shots) return null;
  const total = shots[shots.length - 1].end || 1;
  return el("div", {},
    heading(t("The video, from start to end", "O vídeo, do começo ao fim")),
    el("div", { class: "sbar" }, shots.map((s, i) => el("div", { class: `sseg s${i % 4}`, style: `flex:${s.end - s.start} 0 0`, title: s.en }, role(s.scene)))),
    el("div", { class: "note", style: "display:flex;justify-content:space-between" }, el("span", {}, "0 s"), el("span", {}, sec(total))),
    el("div", { class: "sgrid1", style: "margin-top:12px" }, shots.map((s) => el("div", { class: "sdir scard" }, still(e, s.id), el("div", { class: "grow" },
      el("div", { class: "sbig" }, s.en),
      heading(t("Camera", "Câmera")), el("ul", { class: "sflow" }, s.camera.map((c) => el("li", {}, camera(c)))),
      s.items.length ? heading(t("Appears on screen", "Aparece na tela")) : null,
      s.items.length ? el("div", { class: "schips" }, s.items.filter((i) => i.kind !== "leader").map((i) => el("span", { class: "schip" }, `${sec(i.at)}  ${item(i)}`))) : null)))));
}

function shotmap(e, D) {
  if (!D.shots) return null;
  return el("div", {}, el("div", { class: "smoments big" }, D.shots.map((s) => el("figure", {}, still(e, s.id), el("figcaption", {}, s.en)))),
    e.shotmap ? el("p", {}, el("a", { href: "/" + e.shotmap, target: "_blank" }, t("Open the full map", "Abrir o mapa completo"))) : null);
}

function render(e) {
  const c = e.run.check;
  if (!c) return null;
  const n = c.numbers;
  const ok = (good, en, br) => el("li", { class: good ? "" : "bad" }, t(en, br));
  const flagged = (c.flagged || []).filter((f) => f.level === "fail").map((f) => f.reasons.join("; ")).join(" ");
  return el("div", {},
    el("div", { class: "astgrid" }, [[sec(n.length), t("Length", "Duração")], [n.frames, t("Pictures", "Imagens")], [`${n.width}×${n.height}`, t("Size", "Tamanho")]].map(([v, l]) => el("div", { class: "card" }, el("b", {}, v), el("span", { class: "note" }, l)))),
    heading(t("What was checked automatically", "O que foi checado automaticamente")),
    box(el("ul", { class: "schecks" },
      ok(!n.blank, "No blank pictures", "Nenhuma imagem em branco"),
      ok(!n.flashes, "No flashes", "Nenhum clarão"),
      ok(!n.frozen, "The picture never freezes", "A imagem nunca congela"),
      ok(!(n.cuts_without_shot_change || []).length, "No cut that should not be there", "Nenhum corte fora do lugar"),
      ok(!(n.empty || []).length, "Never an empty screen", "Nunca uma tela vazia"),
      ok(!/fast|restless|rápid/i.test(flagged), "The camera never moves too fast to follow", "A câmera nunca vai rápido demais"),
      ok(Math.abs(n.lufs + 14.5) <= 0.5, "The sound is at the right volume", "O som está no volume certo"))));
}

function review(e, D, done) {
  const R = D.plain?.review;
  if (!R) return null;
  return el("div", { class: "sgrid2" }, R.map((r, i) => box(el("b", {}, `${i + 1}. ${L(r.problem)}`), done ? el("div", { class: "sfixed" }, `✓ ${L(r.fix)}`) : null)));
}

export async function loadData(e) {
  const j = async (f) => { try { const r = await fetch(`/explainers/${e.slug}/${f}`); return r.ok ? await r.json() : null; } catch (x) { return null; } };
  const [plain, shots, timeline] = await Promise.all([j("plain.json"), j("renders/shotmap/shots.json"), j("timeline.json")]);
  return { plain, shots, timeline };
}

export function stepView(st, e, D) {
  const made = { script: () => script(e, D), voice: () => voice(e, D), plan: () => plan(e, D), world: () => world(e, D), direction: () => direction(e, D), build: () => direction(e, D), shotmap: () => shotmap(e, D),
    translate: () => translation(e, D), relocalize: () => relocalize(e, D), render: () => render(e), review: () => review(e, D, false), fix: () => review(e, D, true) }[st.id];
  const body = made ? made() : null;
  const raw = { plan: "PLAN.md", world: "WORLD.md", review: "REVIEW.md", fix: "REVIEW.md" }[st.id];
  const code = el("div", {});
  if (st.id === "direction") fetch(`/explainers/${e.slug}/build/js/direction.js`).then((r) => (r.ok ? r.text() : "")).then((x) => { if (x) code.append(el("div", { class: "xdoc keep sraw" }, x)); });
  const about = ABOUT[st.id];
  return el("div", {},
    el("h2", { style: "margin-top:0" }, st.title),
    about ? el("p", { class: "sabout keep" }, t(...about)) : null,
    body ? el("div", { class: "keep" }, body) : null,
    el("div", { style: "margin-top:14px" }, fold(t("Technical details", "Detalhes técnicos"), null, st.state === "failed" || (!body && st.state === "running"),
      st.tokens_new ? el("p", { class: "note keep" }, t(`${st.tokens_new.toLocaleString()} new tokens`, `${st.tokens_new.toLocaleString()} tokens novos`)) : null,
      st.report ? el("p", { class: "note keep" }, st.report) : null,
      raw && e.docs[raw] ? el("div", { class: "xdoc keep sraw" }, e.docs[raw]) : null, code,
      el("div", { class: "xlog", style: "margin-top:10px" }, (st.log || ["—"]).join("\n")))));
}
