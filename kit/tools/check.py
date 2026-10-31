#!/usr/bin/python3
"""Every check on a render in one command, numbers first, then the stretches to look at (eyes go only there).

    /usr/bin/python3 ../kit/tools/check.py renders/<slug>-en-vN.mp4 [--sheets] [--probe <probe.json>]
    /usr/bin/python3 ../kit/tools/check.py --stills 10,20.5,33       stills of a pass, no render
    /usr/bin/python3 ../kit/tools/check.py --beats b05,b07           the same for whole beats (start, middle, end)

On a render (run from the reel):
  video      720x1280, 30 fps, with sound
  length     against the composition (timeline.json: a render that stops short fails) and against the reference
  loudness   integrated LUFS (target -14.5 +- 0.5), loudness range and true peak, by ffmpeg's ebur128
  frames     frame_qa.py: blank frames, one-frame flashes, frozen stretches, hard cuts against the shots the code declares
  empty      empty_frames.py: a frame empty but for its caption
  speed      speed.py: the picture moving too fast to follow, or a near-freeze then a jump (limits set on approved reels)
  probe      the shot map probe (shot_map.mjs) is run again first when the build changed since its probe.json
Writes renders/<name>.check.json (and renders/<name>.qa.json, as frame_qa.py does). Exit code 1 when anything fails;
warnings (a declared shot with no visible cut, true peak over -1 dBTP, a wide loudness range, a length far from the
reference's) are listed but do not fail. --sheets writes a 6 fps contact sheet for each flagged stretch only, in
renders/<name>-check/. --probe uses a given probe.json as it is (no staleness check, no rerun).

Stills (between passes, no render): compose.py, then stills.mjs at the times given, tiled by sheet.py into
renders/stills/_sheet.jpg (the folder is cleared first). --beats takes each beat's start + 0.25 s, middle and end - 0.25 s.
"""
import json
import subprocess
import sys
from pathlib import Path

from common import HERE, PY, TOOLS, duration, ref_duration
import empty_frames
import frame_qa
import speed
from sfx import loudness
from sheet import sheet

TARGET, TOL = -14.5, 0.5
sys.stdout.reconfigure(line_buffering=True)   # our lines in order with the probe's and stills' output
B = HERE / "build"


def arg(name, default=None):
    if name in sys.argv:
        return sys.argv[sys.argv.index(name) + 1]
    return default


def build_mtime():
    srcs = [HERE / "timeline.json", B / "index.html"] + [p for p in (B / "js").rglob("*.js")]
    return max((p.stat().st_mtime for p in srcs if p.exists()), default=0)


def probe_for(video):
    given = arg("--probe")
    if given:
        return Path(given).resolve(), "given"
    probe = HERE / "renders/shotmap/probe.json"
    newest = build_mtime()
    if probe.exists() and probe.stat().st_mtime >= newest:
        return probe, "fresh"
    why = "missing" if not probe.exists() else "stale: the build changed since it ran"
    print(f"shot map probe {why}; running it (node ../kit/tools/shot_map.mjs, about a minute)")
    r = subprocess.run(["node", str(TOOLS / "shot_map.mjs")], cwd=HERE)
    if r.returncode or not probe.exists() or probe.stat().st_mtime < newest:
        sys.exit("the shot map probe failed: fix the build (stills.mjs shows the page errors), then run check.py again")
    return probe, "run again (" + why + ")"


def video_info(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate", "-of", "json", str(video)],
                       capture_output=True, text=True)
    streams = json.loads(r.stdout or "{}").get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), {})
    num, den = (v.get("r_frame_rate") or "0/1").split("/")
    return {"width": v.get("width"), "height": v.get("height"), "fps": round(float(num) / float(den or 1), 3),
            "audio": any(s.get("codec_type") == "audio" for s in streams)}


def runs(idxs, fps):
    out = []
    for i in idxs:
        if out and i == out[-1][1]:
            out[-1][1] = i + 1
        else:
            out.append([i, i + 1])
    return [(a / fps, b / fps) for a, b in out]


def merge(flags, gap=0.3):
    """Flagged moments into stretches: overlapping or close ones become one, with every reason kept."""
    out = []
    for f in sorted(flags, key=lambda f: f["a"]):
        if out and f["a"] <= out[-1]["b"] + gap:
            o = out[-1]
            o["b"] = max(o["b"], f["b"])
            o["reasons"].append(f["reason"])
            if f["level"] == "fail":
                o["level"] = "fail"
        else:
            out.append({"a": f["a"], "b": f["b"], "level": f["level"], "reasons": [f["reason"]]})
    return out


def contact_sheets(video, stretches, name, length):
    root = HERE / "renders" / f"{name}-check"
    paths = []
    for k, s in enumerate(stretches, 1):
        a, b = max(0.0, s["a"] - 0.5), min(length, s["b"] + 0.5)
        d = root / f"s{k:02d}_{a:.1f}-{b:.1f}"
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.jpg"):
            old.unlink()
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-i", str(video), "-t", f"{b - a:.3f}", "-vf", "fps=6,scale=240:-2",
                        "-q:v", "4", str(d / "f%04d.jpg")], check=True)
        for i, f in enumerate(sorted(d.glob("f*.jpg"))):
            f.rename(d / f"t{a + i / 6:06.2f}.jpg")
        sheet(str(d), 6, 240)
        paths.append(d / "_sheet.jpg")
    return paths


def check_render(rel):
    video = (HERE / rel).resolve()
    if not video.exists():
        sys.exit(f"{video}: no such render")
    name = video.stem
    flags = []
    flag = lambda a, b, level, reason: flags.append({"a": round(a, 2), "b": round(b, 2), "level": level, "reason": reason})
    film = []                                       # film-wide findings: no stretch to look at, no sheet
    whole = lambda level, reason: film.append({"level": level, "reason": reason})
    notes = []
    probe, probe_state = probe_for(video)
    if probe_state != "given" and build_mtime() > video.stat().st_mtime:
        notes.append("the build changed after this render: the cut check reads today's code, not the render's")

    info = video_info(video)
    length = duration(video)
    comp = json.loads((HERE / "timeline.json").read_text())["duration"]
    ref = ref_duration()
    if (info["width"], info["height"]) != (720, 1280) or abs(info["fps"] - 30) > 0.01 or not info["audio"]:
        whole("fail", f"video is {info['width']}x{info['height']} at {info['fps']} fps, sound {info['audio']}: want 720x1280 at 30 fps with sound")
    if abs(length - comp) > 0.1:
        whole("fail", f"render {length:.2f} s against the composition's {comp:.2f} s")
    if ref and (length < ref - 0.5 or length > ref + max(2.5, 0.02 * ref)):
        whole("warn", f"render {length:.2f} s against the reference's {ref:.2f} s")

    lv = loudness(video)
    I, LRA, TP = lv.get("I"), lv.get("LRA"), lv.get("TP")
    if I is None or abs(I - TARGET) > TOL:
        whole("fail", f"loudness {I} LUFS, outside {TARGET} +- {TOL}")
    if TP is not None and TP > -1.0:
        whole("warn", f"true peak {TP} dBTP, over -1")
    if LRA is not None and LRA > 8:
        whole("warn", f"loudness range {LRA} LU (the reels sit near 2.5)")

    print(f"reading every frame of {rel} ...")
    qa = frame_qa.analyse(video, probe)
    qa["video"] = rel
    (video.parent / (name + ".qa.json")).write_text(json.dumps(qa, indent=1))
    fps = qa["fps"]
    for a, b in runs(qa["blank"], fps):
        flag(a, b, "fail", "blank frames")
    for t in qa["flashes"]:
        flag(t - 0.1, t + 0.1, "fail", f"one-frame flash at {t:.2f} s")
    for a, b in qa["frozen_runs"]:
        flag(a, b, "fail", f"frozen {b - a:.1f} s")
    for t in qa["cuts_without_shot_change"]:
        flag(t - 0.2, t + 0.2, "fail", f"hard cut at {t:.2f} s where the code declares no shot change")
    for t in qa["shot_changes_without_cut"]:
        flag(t - 0.2, t + 0.2, "warn", f"shot change at {t:.2f} s with no visible cut")
    empty = empty_frames.scan(video)
    for a, b in empty:
        flag(a, b, "fail", "empty but for the caption")
    sp = speed.scan(video)
    for x in sp["findings"]:
        flag(x["a"], x["b"], x["level"], x["reason"])

    stretches = merge(flags)
    fails = sum(1 for f in flags + film if f["level"] == "fail")
    warns = len(flags) + len(film) - fails
    kitv = (B / "js/kit/VERSION").read_text().split("\n")[0] if (B / "js/kit/VERSION").exists() else "no kit copy in build/js/kit"
    verdict = "clean" if not (flags or film) else ("FAIL" if fails else "pass with warnings")

    print(f"\ncheck: {rel}")
    print(f"  video      {length:.2f} s, {qa['frames']} frames, {info['width']}x{info['height']} at {info['fps']:g} fps, sound {'yes' if info['audio'] else 'NO'}")
    print(f"  length     composition {comp:.2f} s ({length - comp:+.2f}), reference " + (f"{ref:.2f} s ({length - ref:+.2f})" if ref else "none (topic-first)"))
    print(f"  loudness   {I} LUFS (target {TARGET} +- {TOL}), range {LRA} LU, true peak {TP} dBTP")
    print(f"  frames     blank {len(qa['blank'])}, one-frame flashes {len(qa['flashes'])}, frozen stretches {len(qa['frozen_runs'])}")
    print(f"  cuts       {len(qa['cuts'])} hard cuts, {len(qa['shot_changes'])} shot changes in the code: "
          f"{len(qa['cuts_without_shot_change'])} cuts off a declared shot, {len(qa['shot_changes_without_cut'])} declared shots with no cut")
    print(f"  empty      {len(empty)} stretches empty but for the caption")
    print(f"  speed      median {sp['median']}, peak {sp['peak']} (fails over {speed.MAX_QUARTER:g}), {len(sp['findings'])} findings")
    print(f"  probe      {probe_state}: {probe}")
    print(f"  kit        {kitv}")
    for n in notes:
        print(f"  note       {n}")
    print(f"verdict: {verdict} ({fails} failures, {warns} warnings)")
    for f in film:
        print(f"  film       {f['level']:4}  {f['reason']}")
    if stretches:
        print("look at:")
        for s in stretches:
            print(f"  {s['a']:7.2f}-{s['b']:7.2f} s  {s['level']:4}  " + "; ".join(s["reasons"]))
    sheets = []
    if "--sheets" in sys.argv and stretches:
        sheets = contact_sheets(video, stretches, name, length)
        print("sheets (6 fps, flagged stretches only):")
        for p in sheets:
            print(f"  {p.relative_to(HERE)}")
    out = {"video": rel, "verdict": verdict, "failures": fails, "warnings": warns,
           "numbers": {"length": round(length, 3), "composition": comp, "reference": round(ref, 3) if ref else None, "frames": qa["frames"],
                       "width": info["width"], "height": info["height"], "fps": info["fps"], "audio": info["audio"],
                       "lufs": I, "lra": LRA, "true_peak": TP, "blank": len(qa["blank"]), "flashes": len(qa["flashes"]),
                       "frozen": len(qa["frozen_runs"]), "cuts": len(qa["cuts"]), "shot_changes": len(qa["shot_changes"]),
                       "cuts_without_shot_change": qa["cuts_without_shot_change"], "shot_changes_without_cut": qa["shot_changes_without_cut"],
                       "empty": [[round(a, 2), round(b, 2)] for a, b in empty]},
           "film_wide": film, "flagged": stretches, "probe": {"state": probe_state, "path": str(probe)}, "kit": kitv, "notes": notes,
           "sheets": [str(p.relative_to(HERE)) for p in sheets]}
    (video.parent / (name + ".check.json")).write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return 1 if fails else 0


def stills(times):
    r = subprocess.run([PY, str(TOOLS / "compose.py")], cwd=HERE)
    if r.returncode:
        return r.returncode
    d = HERE / "renders/stills"
    d.mkdir(parents=True, exist_ok=True)
    for old in list(d.glob("t*.jpg")) + list(d.glob("_sheet.jpg")):
        old.unlink()
    r = subprocess.run(["node", str(TOOLS / "stills.mjs"), "stills", ",".join(f"{t:.2f}" for t in times)], cwd=HERE)
    n = sheet(str(d), 6, 240)
    print(f"{n} stills: renders/stills/_sheet.jpg")
    return r.returncode


def main():
    if "--stills" in sys.argv:
        return stills([float(t) for t in arg("--stills").split(",")])
    if "--beats" in sys.argv:
        tl = {b["id"]: b for b in json.loads((HERE / "timeline.json").read_text())["beats"]}
        times = []
        for bid in arg("--beats").split(","):
            b = tl[bid.strip()]
            mid = (b["start"] + b["end"]) / 2
            times += [b["start"] + 0.25, mid, b["end"] - 0.25] if b["end"] - b["start"] > 0.8 else [mid]
        return stills(times)
    pos = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and sys.argv[i - 1] != "--probe"]
    if not pos:
        sys.exit(__doc__)
    return check_render(pos[0])


if __name__ == "__main__":
    sys.exit(main())
