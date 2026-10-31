#!/usr/bin/env python3
"""Shot timing for one episode and language, from the script and the real voice lengths.

Rules (see knowledge/modes.md): one shot per line; the cut lands a
little before the voice (mode timing: leadIn, cutBefore); a hold after each line (holdAfter, or
the line's own "pause"); silent beats are their own shots; the episode closes on the mode's end
wide. A line's camera is "auto" unless the script names one; "auto" picks the mode's lead shot
for the lead and a close-up for an agent.

Script line fields (episodes/<slug>/script.json):
  id, who, to?, say{lang}, caption{lang}?, emotion?, emotions{who: emotion}?, camera? (type or
  {type, on?, with?}), hop? (true or a character), lean?, prop? ("phone": the speaker holds it
  through the shot), pause?, lead?, music? ("stop"|"quiet"),
  events[{word{lang} | at, emotions{}, hop?}]
  or a silent beat: id, silent (seconds), camera?, emotions?
Top level, besides the lines: "screen" (keyboard mode: dashboard cards) and "board" (the desk
classroom's whiteboard: title, lines with from / until / strike triggers, as on the screen).

Writes episodes/<slug>/build/<lang>/timeline.json (git-ignored, rebuilt any time).
Run: /usr/bin/python3 tools/timeline.py --episode <slug> --lang pt
"""
import argparse, math, re, unicodedata
import studio as S


def synth_take(text, seed):
    """A stand-in take for rehearsal before any voice exists: length from the text (about 14.5
    characters a second), word timings spread by word length, a syllable-like loudness."""
    words_txt = text.split() or [text]
    dur = max(0.7, len(text) / 14.5 + 0.3)
    speech = dur - 0.25
    total = sum(len(w) for w in words_txt) or 1
    t, words = 0.05, []
    for w in words_txt:
        d = speech * len(w) / total
        words.append({"w": w, "s": round(t, 3), "e": round(t + d * 0.92, 3)})
        t += d
    n = int(dur * 30)
    env = [round(max(0.0, abs(math.sin(i * 0.55 + seed)) * 0.8 + 0.2 * abs(math.sin(i * 1.7 + seed * 2))) * min(1, i / 4, (n - i) / 4), 3) for i in range(n)]
    return {"dur": round(dur, 3), "env": env, "words": words, "estimated": True}


def norm(w):
    w = unicodedata.normalize("NFD", (w or "").lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)


def word_time(words, target):
    t = norm(target)
    for w in words:
        if t and norm(w["w"]).startswith(t):
            return w["s"]
    raise SystemExit(f"word not found in the take: {target!r} (words: {' '.join(w['w'] for w in words)})")


def voiced_end(env, fps=30, floor=0.03, tail=0.08):
    """Where the voice really stops: the last frame of the take's loudness envelope above the floor,
    plus a short tail for the decay. ElevenLabs stretches the last character's alignment to the
    end of the file, so with v4 (0.1 to 0.4 s of quiet after each line) the last word's end would
    count that quiet as speech and add it to every hold."""
    loud = [i for i, v in enumerate(env or []) if v > floor]
    return (loud[-1] + 1) / fps + tail if loud else None


def build(slug, lang, estimate=False):
    ep, sc = S.episode(slug), S.script(slug)
    md = S.mode(ep["mode"])
    timing, auto = md["timing"], md["autoCamera"]
    scenario = ep.get("scenario") or md.get("defaultScenario", "night-city")
    if not (S.ROOT / "modes" / ep["mode"] / "scenarios" / f"{scenario}.js").exists():
        raise SystemExit(f"the {ep['mode']} mode has no scenario called {scenario!r} (see modes/{ep['mode']}/scenarios/)")
    lead = ep.get("lead") or S.studio()["lead"]
    cast = ep["cast"]
    vdir = S.episode_dir(slug) / "voice" / lang
    items = sc["lines"]
    voiced = [l for l in items if not l.get("silent")]
    last_id = voiced[-1]["id"] if voiced else None

    # Automatic shot choice, per mode (mode.json "autoCamera"):
    #   lead / agent / silent / end    the default set-up for each kind of shot
    #   leadLate, leadSwitch           the lead's later lines switch set-up (desk: three-quarter
    #                                  early, square-on from halfway)
    #   wides                          where to replace a line's close shot with the wide when the
    #                                  script names no wide itself (desk: about 30% and 70% in)
    #   last                           the last line's set-up (keyboard: the key-level low shot)
    # A camera named in the script always wins.
    voiced_ids = [l["id"] for l in voiced]
    frac = {lid: (i / max(1, len(voiced_ids) - 1)) for i, lid in enumerate(voiced_ids)}
    named_wide = any((l.get("camera") if isinstance(l.get("camera"), str) else (l.get("camera") or {}).get("type")) == "wide" for l in items)
    auto_wides = set()
    if auto.get("wides") and not named_wide and len(voiced_ids) >= 6:
        free = [l["id"] for l in voiced[1:-1] if l.get("camera", "auto") == "auto"]
        for target in auto["wides"]:
            pick = min((x for x in free if x not in auto_wides), key=lambda x: abs(frac[x] - target), default=None)
            if pick:
                auto_wides.add(pick)

    def camera_for(line, who):
        cam = line.get("camera", "auto")
        if isinstance(cam, str):
            if cam == "auto":
                lid = line.get("id")
                if line.get("silent"):
                    cam = {"type": auto["silent"]}
                elif lid in auto_wides:
                    cam = {"type": "wide"}
                elif auto.get("last") and lid == last_id and len(voiced_ids) > 2:
                    cam = {"type": auto["last"]}
                elif who == lead:
                    late = auto.get("leadLate") and frac.get(lid, 0) >= auto.get("leadSwitch", 0.5)
                    cam = {"type": auto["leadLate"] if late else auto["lead"]}
                else:
                    cam = {"type": auto["agent"], "on": who}
            else:
                cam = {"type": cam}
        cam = dict(cam)
        if "on" not in cam and who and who != lead and cam["type"] in ("cu", "full", "side", "two"):
            cam["on"] = who
        return cam

    lines, shots, captions, emotions, hops, leans, props = [], [], [], [], [], [], []
    t, n = 0.0, 0
    for line in items:
        n += 1
        start = t
        for cid, emo in (line.get("emotions") or {}).items():
            emotions.append({"t": S.frame(start + 0.05), "who": cid, "emotion": emo})
        if line.get("silent"):
            end = t + float(line["silent"])
            for cid, prop in (line.get("props") or {}).items():
                props.append({"who": cid, "start": S.frame(start), "end": S.frame(end), "prop": prop})
            shots.append({"n": n, "start": S.frame(start), "end": S.frame(end), "camera": camera_for(line, None), "line": line["id"]})
            t = end
            continue
        who = line["who"]
        envp = vdir / f"{line['id']}.env.json"
        if envp.exists():
            env = S.load(envp)
        elif estimate:
            env = synth_take(S.text_of(line.get("say") or line.get("text"), lang) or "...", n)
        else:
            raise SystemExit(f"no voice for {line['id']} ({lang}): run the voices step first")
        lead_in = line.get("lead", timing["leadIn"] if not lines else timing["cutBefore"])
        v0 = t + lead_in
        words = env["words"]
        speech_end = max((w["e"] for w in words), default=env["dur"])
        if not env.get("estimated"):
            speech_end = min(speech_end, voiced_end(env["env"]) or speech_end)
        hold = line.get("pause", timing["lastHold"] if line["id"] == last_id else timing["holdAfter"])
        end = v0 + speech_end + hold
        shots.append({"n": n, "start": S.frame(start), "end": S.frame(end), "speaker": who, "camera": camera_for(line, who), "line": line["id"]})
        lines.append({"id": line["id"], "who": who, "to": line.get("to"), "start": S.frame(v0), "dur": env["dur"], "env": env["env"], "words": words, "estimated": env.get("estimated", False)})
        cap = S.text_of(line.get("caption"), lang) or S.text_of(line.get("say") or line.get("text"), lang)
        captions.append({"text": cap, "start": S.frame(start), "end": S.frame(end), "line": line["id"]})
        if line.get("emotion"):
            emotions.append({"t": S.frame(start + 0.05), "who": who, "emotion": line["emotion"]})
        if line.get("hop"):
            hops.append({"t": S.frame(v0), "who": who if line["hop"] is True else line["hop"]})
        if line.get("lean"):
            leans.append({"who": who, "start": S.frame(start), "end": S.frame(end)})
        if line.get("prop"):
            props.append({"who": who, "start": S.frame(start), "end": S.frame(end), "prop": line["prop"]})
        for ev in line.get("events", []):
            word = S.text_of(ev.get("word"), lang)
            wt = v0 + (word_time(words, word) if word else ev.get("at", 0))
            for cid, emo in (ev.get("emotions") or {}).items():
                emotions.append({"t": S.frame(wt), "who": cid, "emotion": emo, "blend": ev.get("blend", 0.25)})
            if ev.get("hop"):
                hops.append({"t": S.frame(wt), "who": ev["hop"]})
        t = end
    # a long line split across two framings of the same set-up: the second a punch-in, cut at the
    # first sentence break (keyboard: long lines split across two angles)
    split = timing.get("splitLong")
    if split:
        out, words_of = [], {l["id"]: l for l in lines}
        for sh in shots:
            l = words_of.get(sh.get("line"))
            text = S.text_of((next((x for x in items if x.get("id") == sh.get("line")), {}) or {}).get("say"), lang) or ""
            cut = None
            if l and l["dur"] >= split.get("minDur", 2.6):
                ends = [i for i, w in enumerate(l["words"][:-1]) if re.search(r"[.!?…]$", w["w"])]
                if ends:
                    k = ends[0] + 1
                    cut = S.frame(l["start"] + l["words"][k]["s"] - timing["cutBefore"])
            if cut and sh["start"] + 0.7 < cut < sh["end"] - 0.7:
                out.append({**sh, "end": cut})
                out.append({**sh, "start": cut, "camera": {**sh["camera"], "punch": split.get("punch", 0.82)}})
            else:
                out.append(sh)
        shots = out
        n = 0
        for sh in shots:
            n += 1
            sh["n"] = n

    last = items[-1] if items else {}
    if not (last.get("silent") and camera_for(last, None)["type"] == auto["end"]):
        n += 1
        shots.append({"n": n, "start": S.frame(t), "end": S.frame(t + timing["endWide"]), "camera": {"type": auto["end"]}})
        t += timing["endWide"]

    def when(ref):
        if not ref:
            return None
        if "t" in ref:
            return S.frame(ref["t"])
        l = next((x for x in lines if x["id"] == ref["line"]), None)
        if l is None:
            raise SystemExit(f"screen trigger points at an unknown line: {ref['line']}")
        w = S.text_of(ref.get("word"), lang)
        return S.frame(l["start"] + (word_time(l["words"], w) if w else 0) + ref.get("offset", 0))

    screen = sc.get("screen") or ep.get("screen")
    if screen:
        # a counter can end on a cue ("count": {"to": 47, "end": {"line": "l12"}}): it reaches its
        # number exactly there in every language, whatever the length of each language's takes
        def cue_count(ln):
            c = ln.get("count")
            return {**c, "endT": when(c["end"])} if c and c.get("end") else c
        screen = {"cards": [{**c, "lines": [{**ln, "fromT": when(ln.get("from")), "untilT": when(ln.get("until")), **({"count": cue_count(ln)} if ln.get("count") else {})}
                                            for ln in c.get("lines", [])]} for c in screen.get("cards", [])]}
    board = sc.get("board")
    if board:
        board = {**board, "lines": [{**ln, "fromT": when(ln.get("from")), "untilT": when(ln.get("until")), "strikeT": when(ln.get("strike"))} for ln in board.get("lines", [])]}
    chars = {cid: S.character(cid) for cid in cast}
    TL = {
        "slug": slug, "lang": lang, "mode": ep["mode"], "scenario": scenario, "lead": lead, "cast": cast, "end": S.frame(t),
        "title": S.text_of(sc.get("title"), lang) or ep.get("title", slug),
        "variants": {**{cid: c["variant"] for cid, c in chars.items() if c.get("variant")}, **(ep.get("variants") or {})},
        "scales": {cid: c.get("scale", {}).get(ep["mode"]) for cid, c in chars.items() if c.get("scale", {}).get(ep["mode"])},
        "lines": lines, "shots": shots, "captions": captions, "emotions": emotions, "hops": hops, "leans": leans, "props": props,
        "screen": screen,
        "board": board,
        # how the episode ends: "hold" on the last wide, or "fade" to black (fadeOut seconds, then
        # fadeHold seconds of black: about a third of keyboard reels end that way)
        "ending": {"type": ep.get("ending") or timing.get("ending", "hold"), "fadeOut": timing.get("fadeOut", 0.7), "fadeHold": timing.get("fadeHold", 0.2)},
        "estimated": any(l.get("estimated") for l in lines),
    }
    return TL


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--lang", required=True)
    a = ap.parse_args()
    TL = build(a.episode, a.lang)
    out = S.episode_dir(a.episode) / "build" / a.lang / "timeline.json"
    S.save(out, TL)
    S.emit("timeline", episode=a.episode, lang=a.lang, seconds=TL["end"], shots=len(TL["shots"]), lines=len(TL["lines"]),
           plan=[{"n": s["n"], "start": s["start"], "end": s["end"], "camera": s["camera"]["type"], "on": s["camera"].get("on"), "speaker": s.get("speaker")} for s in TL["shots"]])


if __name__ == "__main__":
    main()
