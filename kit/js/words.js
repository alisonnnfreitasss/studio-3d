// Words: the beat and word lookups every direction.js re-implemented (S, E, W), the one-word captions
// (the naming sentence in yellow), the frame-state skeleton, and the easing helpers a direction needs,
// re-exported so a reel's direction imports from two or three kit modules. Pure: no DOM, no three.
import { clamp, lerp, easeIO, easeOut, easeIn, ramp, win, pop, popOut, popSS, flyIn, TAU, springStep } from "./kit.js";

export { clamp, lerp, easeIO, easeOut, easeIn, ramp, win, pop, popOut, popSS, flyIn, TAU, springStep };

// lower case, no accents, no punctuation: "Aço," and "aco" are the same word, in any language
export const norm = (w) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9'-]/g, "");

// words(TL): TL is the default export of the reel's timeline.js ({ duration, beats: [{ id, start, end,
// words: [{ w, s, e }] }] }). Returns the lookups:
//   S(id), E(id): a beat's start and end
//   W(id, word, nth = 0, edge = "s"): the start ("s") or end ("e") of the nth word in beat id that starts
//     with `word` (case and punctuation ignored); throws when missing, so a script change fails loud.
//     A prefix match, as all eight builds: "you" also matches "your". "=you" matches the whole word only.
//     find(word, nth, edge) searches the whole take the same way.
//   captions({ y, hi, naming }): captionAt(t), the one-word caption item for the overlay
export function words(TL) {
  const beat = Object.fromEntries(TL.beats.map((b) => [b.id, b]));
  const S = (id) => { if (!beat[id]) throw new Error(`no beat "${id}"`); return beat[id].start; };
  const E = (id) => { if (!beat[id]) throw new Error(`no beat "${id}"`); return beat[id].end; };
  const match = (w, word) => (word[0] === "=" ? norm(w.w) === norm(word.slice(1)) : norm(w.w).startsWith(norm(word).toLowerCase()));
  function W(id, word, nth = 0, edge = "s") {
    if (!beat[id]) throw new Error(`no beat "${id}"`);
    let k = 0;
    for (const w of beat[id].words) if (match(w, word)) { if (k++ === nth) return w[edge]; }
    throw new Error(`no word "${word}" (#${nth}) in ${id}`);
  }
  const ALLW = [];
  for (const b of TL.beats) b.words.forEach((w, i) => ALLW.push({ ...w, beat: b.id, next: b.words[i + 1]?.s }));
  ALLW.forEach((w, i) => { if (w.next == null) w.next = ALLW[i + 1]?.s ?? w.e + 0.6; });
  function find(word, nth = 0, edge = "s") {
    let k = 0;
    for (const w of ALLW) if (match(w, word)) { if (k++ === nth) return w[edge]; }
    throw new Error(`no word "${word}" (#${nth}) in the take`);
  }
  // one-word captions, as all eight reels: each word from its start until the next word (at most 0.6 s
  // past its end), first letter capital, the rest lower case; `naming` beats (the sentence that names
  // the part) and `hi` words per beat in yellow. y: the caption's centre line in px (870 = 68%).
  function captions({ y = 870, hi = {}, naming = [] } = {}) {
    const NAMING = new Set(naming);
    return function captionAt(t) {
      for (const w of ALLW) {
        const t1 = Math.min(w.next, w.e + 0.6);
        if (t >= w.s && t < t1) {
          let txt = w.w.replace(/[.,!?:;]+$/g, "").replace(/^[^\p{L}\p{N}]+/u, "");
          txt = txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
          const isHi = NAMING.has(w.beat) || (hi[w.beat] || []).some((h) => norm(w.w).startsWith(norm(h)));
          return { type: "cap", id: "cap", text: txt, hi: isHi, t0: w.s, t1, y };
        }
      }
      return null;
    };
  }
  return { TL, beat, S, E, W, find, ALLW, captions, duration: TL.duration };
}

// The frame state F that direct(t) returns (the stage reads it; see kit/README.md):
//   t, shot, scene, views: [{ cam: { p, l, fov, roll?, focus? }, rect?, interior?, sky?, env? }],
//   env: { sky (0 day, 1 dusk, 2 night, or a name), storm, hot, flash, interior, sunAz },
//   cast: { <who>: state | null }, fx: { <effect>: state }, overlays: [items], flySpeed
export function frame(t, o = {}) {
  return { t, shot: "a", scene: "", views: [], env: { sky: 0 }, cast: {}, fx: {}, overlays: [], flySpeed: 0, ...o };
}

// put a shot list's camera into F (views, shot, and the white line between split views)
export function useCamera(F, film, t) {
  const c = film.at(t);
  F.views = c.views;
  F.shot = c.shot;
  if (c.split) {
    const r = c.views[1].rect || [0, 0.5, 1, 0.5];
    F.overlays.push({ type: "line", id: `split-${c.shot}`, t0: -1, t1: 1e9, y: r[1] * 1280 });
  }
  return F;
}

// the naming highlight pulse (theirs pulse a named part about every 12 frames): starts on its dark phase
// and fades in over 0.2 s, so a large part never flips colour in one frame (the skyscraper's H())
export const pulse = (t, a, b) => (0.62 - 0.38 * Math.cos((TAU * (t - a)) / 0.4)) * win(t, a, b, 0.2);

// a seeded value per id (direction code that wants variety without Math.random)
export function seeded(id, k = 0) {
  let h = 2166136261 ^ k;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
