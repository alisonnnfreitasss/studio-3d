#!/usr/bin/env python3
"""HyperFrames steps for one episode and language, on episodes/<slug>/build/<lang>/:

  carve   music beds only: /hyperframes-audio carve against the voiceover group (re-run after
          every compose, which rewrites index.html)
  check   npx hyperframes check (lint, runtime, layout, motion, caption contrast)
  frames  one still from the middle of every shot, plus a contact sheet: episodes/<slug>/frames/<lang>/
  render  the MP4: episodes/<slug>/renders/<slug>-<lang>.mp4
  verify  size, frame rate, length, loudness, and a sheet of frames decoded from the MP4

Run: /usr/bin/python3 tools/render.py --episode <slug> --lang pt --step render
"""
import argparse, json, re, shutil, subprocess
from pathlib import Path
import studio as S

CARVE = Path.home() / ".claude/skills/hyperframes-audio/scripts/carve.mjs"
QUIET = ("NotOpenSSLWarning", "warnings.warn", "urllib3")


def hf(*args):
    return ["npx", "--yes", f"hyperframes@{S.studio()['render']['hyperframes']}", *args]


def sheet(images, out, cols=4, w=270, h=480, labels=None):
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
    rows = (len(images) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * (w + 6), rows * (h + 6)), (8, 8, 12))
    for i, p in enumerate(images):
        im = Image.open(p).convert("RGB").resize((w, h))
        if labels:
            ImageDraw.Draw(im).text((8, 6), labels[i], fill=(255, 220, 90), font=font)
        canvas.paste(im, ((i % cols) * (w + 6), (i // cols) * (h + 6)))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=86)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--lang", required=True)
    ap.add_argument("--step", required=True, choices=["carve", "check", "frames", "render", "verify"])
    a = ap.parse_args()
    ep = S.episode(a.episode)
    edir = S.episode_dir(a.episode)
    bdir = edir / "build" / a.lang
    rel = lambda p: str(Path(p).relative_to(S.ROOT))
    if not (bdir / "index.html").exists():
        raise SystemExit("no build yet: run compose first")

    if a.step == "carve":
        if S.mode(ep["mode"])["audio"] != "music":
            S.emit("carve", skipped=True, reason="room tone needs no carve")
            return
        code, tail = S.run(["node", str(CARVE), "--comp", "index.html", "--bed", "music-bed"], cwd=bdir, step="carve")
        if code:
            raise SystemExit("carve failed: " + " | ".join(tail[-3:]))
        S.emit("carve", done=True)

    elif a.step == "check":
        code, tail = S.run(hf("check", "."), cwd=bdir, step="check", quiet_patterns=QUIET)
        text = "\n".join(tail)
        ok = code == 0 and "Check passed" in text
        errors = re.findall(r"(\d+) error\(s\)", text)
        S.emit("check", passed=ok, errors=int(errors[0]) if errors else None)
        if not ok:
            raise SystemExit("check failed")

    elif a.step == "frames":
        TL = S.load(bdir / "timeline.json")
        times = [round((s["start"] + s["end"]) / 2, 2) for s in TL["shots"]]
        out = edir / "frames" / a.lang / "shots"
        shutil.rmtree(out, ignore_errors=True)
        code, tail = S.run(hf("snapshot", ".", "--at", ",".join(map(str, times)), "--no-end", "--describe", "false", "--timeout", "30000", "--output", str(out)), cwd=bdir, step="frames", quiet_patterns=QUIET)
        if code:
            raise SystemExit("snapshot failed")
        files = sorted(out.glob("frame-*.png"), key=lambda p: int(re.search(r"frame-(\d+)", p.name).group(1)))
        index = []
        for s, f, tm in zip(TL["shots"], files, times):
            index.append({"n": s["n"], "t": tm, "camera": s["camera"]["type"], "on": s["camera"].get("on"), "speaker": s.get("speaker"), "file": rel(f)})
            S.emit("artifact", kind="frame", episode=a.episode, lang=a.lang, n=s["n"], file=rel(f))
        S.save(edir / "frames" / a.lang / "index.json", index)
        sheet([S.ROOT / i["file"] for i in index], edir / "frames" / a.lang / "shots-sheet.jpg", cols=5, labels=[f"{i['n']} {i['camera']}" for i in index])
        S.emit("frames", count=len(index), sheet=rel(edir / "frames" / a.lang / "shots-sheet.jpg"))

    elif a.step == "render":
        out = edir / "renders" / f"{a.episode}-{a.lang}.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        code, tail = S.run(hf("render", ".", "--quality", S.studio()["render"]["quality"], "--output", str(out)), cwd=bdir, step="render", quiet_patterns=QUIET)
        if code or not out.exists():
            raise SystemExit("render failed")
        S.emit("artifact", kind="video", episode=a.episode, lang=a.lang, file=rel(out))
        S.emit("render", file=rel(out))

    elif a.step == "verify":
        out = edir / "renders" / f"{a.episode}-{a.lang}.mp4"
        if not out.exists():
            raise SystemExit("no render to verify")
        probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", str(out)], capture_output=True, text=True).stdout)
        v = next(s for s in probe["streams"] if s["codec_type"] == "video")
        has_audio = any(s["codec_type"] == "audio" for s in probe["streams"])
        loud = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(out), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
        lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", loud)[-1]) if has_audio else None
        peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", loud)[-1]) if has_audio else None
        dur = float(probe["format"]["duration"])
        TL = S.load(bdir / "timeline.json")
        picks = [round((s["start"] + s["end"]) / 2, 2) for s in TL["shots"]][:: max(1, len(TL["shots"]) // 8)][:8]
        tmp = S.ROOT / "jobs" / "_verify" / f"{a.episode}-{a.lang}"
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True, exist_ok=True)
        imgs = []
        for t in picks:
            p = tmp / f"{t:.2f}.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(out), "-frames:v", "1", "-vf", "scale=270:480", str(p)], check=True)
            imgs.append(p)
        sh = edir / "frames" / a.lang / "render-sheet.jpg"
        sheet(imgs, sh, cols=4, labels=[f"{t:.1f}s" for t in picks])
        thumb = edir / "frames" / a.lang / "thumb.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(picks[0]), "-i", str(out), "-frames:v", "1", "-vf", "scale=270:480", "-q:v", "3", str(thumb)], check=True)
        result = {"width": v["width"], "height": v["height"], "fps": v["r_frame_rate"], "seconds": round(dur, 2), "lufs": lufs, "peak": peak, "sheet": rel(sh)}
        # far too quiet: HyperFrames lowered the whole track after an AAC peak overshoot; tools/remix_audio.py fixes it
        quiet = lufs is not None and lufs < -18
        ok = v["width"] == 1080 and v["height"] == 1920 and abs(dur - TL["end"]) < 0.2 and has_audio and not quiet
        S.emit("verify", passed=ok, **result)
        if not ok:
            raise SystemExit(f"verify failed: {result}" + (" (too quiet: run tools/remix_audio.py)" if quiet else ""))


if __name__ == "__main__":
    main()
