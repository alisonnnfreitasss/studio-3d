#!/usr/bin/env python3
"""Run pipeline steps for one or many episodes and languages, as a batch, with live events.

Steps, in order: voices, timeline, audio, compose, carve, frames, check, render, verify.
  --steps all      every step except frames (voices only spends with --approve-spend)
  --steps preview  voices, timeline, audio, compose, carve, frames (stills to review, no render)
  --steps render   timeline, audio, compose, carve, check, render, verify (voices must exist)
  or a comma list, e.g. --steps compose,frames

Each (episode, language) runs its steps in order; a failed step stops that item only, and the
batch carries on. Status lands in episodes/<slug>/status.json; events are JSON lines on stdout.

Run: /usr/bin/python3 tools/pipeline.py --episodes gostou-do-meu-video --langs pt,en --steps all
"""
import argparse, json, subprocess, sys, time
from pathlib import Path
import studio as S

ORDER = ["voices", "timeline", "audio", "compose", "carve", "frames", "check", "render", "verify"]
PRESETS = {
    "all": ["voices", "timeline", "audio", "compose", "carve", "check", "render", "verify"],
    "preview": ["voices", "timeline", "audio", "compose", "carve", "frames"],
    "render": ["timeline", "audio", "compose", "carve", "check", "render", "verify"],
}
PY = sys.executable
TOOLS = Path(__file__).resolve().parent


def command(step, slug, lang, approve):
    base = ["--episode", slug, "--lang", lang]
    if step == "voices":
        return [PY, str(TOOLS / "tts.py"), *base, *(["--approve-spend"] if approve else [])]
    if step in ("timeline", "audio", "compose"):
        return [PY, str(TOOLS / f"{step}.py"), *base]
    return [PY, str(TOOLS / "render.py"), *base, "--step", step]


def run_step(step, slug, lang, approve):
    proc = subprocess.Popen(command(step, slug, lang, approve), cwd=TOOLS, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    last, tail = {}, []
    for raw in proc.stdout:
        raw = raw.rstrip()
        if not raw or "NotOpenSSLWarning" in raw or "warnings.warn" in raw:
            continue
        try:
            ev = json.loads(raw)
        except ValueError:
            ev = {"type": "log", "msg": raw}
        ev.update({"episode": slug, "lang": lang, "step": step})
        print(json.dumps(ev, ensure_ascii=False), flush=True)
        if ev["type"] not in ("log", "artifact"):
            last = ev
        if ev["type"] == "log":
            tail = (tail + [ev.get("msg", "")])[-6:]
    proc.wait()
    return proc.returncode, last, tail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", required=True, help="comma list of slugs, or all")
    ap.add_argument("--langs", default="", help="comma list; default: each episode's languages")
    ap.add_argument("--steps", default="all")
    ap.add_argument("--approve-spend", action="store_true")
    a = ap.parse_args()
    slugs = S.episodes() if a.episodes == "all" else a.episodes.split(",")
    steps = PRESETS.get(a.steps) or [s for s in ORDER if s in a.steps.split(",")]
    items = []
    for slug in slugs:
        ep = S.episode(slug)
        langs = a.langs.split(",") if a.langs else ep.get("languages", [])
        items += [(slug, l) for l in langs if l in ep.get("languages", [])]
    S.emit("job-start", items=[{"episode": s, "lang": l} for s, l in items], steps=steps)
    results = []
    for slug, lang in items:
        S.emit("item-start", episode=slug, lang=lang)
        ok = True
        for step in steps:
            t0 = time.time()
            S.set_status(slug, lang, step, "running")
            S.emit("step-start", episode=slug, lang=lang, step=step)
            code, last, tail = run_step(step, slug, lang, a.approve_spend)
            info = {k: v for k, v in last.items() if k not in ("type", "time", "episode", "lang", "step")}
            secs = round(time.time() - t0, 1)
            if code == 0:
                S.set_status(slug, lang, step, "done", took=secs, result=info)
                S.emit("step-done", episode=slug, lang=lang, step=step, took=secs, info=info)
            else:
                state = "needs-approval" if step == "voices" and any("--approve-spend" in x for x in tail) else "failed"
                S.set_status(slug, lang, step, state, took=secs, error=" | ".join(tail[-3:]))
                S.emit("step-failed", episode=slug, lang=lang, step=step, took=secs, state=state, error=" | ".join(tail[-3:]))
                ok = False
                break
        results.append({"episode": slug, "lang": lang, "ok": ok})
        S.emit("item-done", episode=slug, lang=lang, ok=ok)
    S.emit("job-done", results=results, ok=all(r["ok"] for r in results))
    sys.exit(0 if all(r["ok"] for r in results) else 1)


if __name__ == "__main__":
    main()
