#!/usr/bin/env python3
"""Rebuilds a render's sound from its build and puts it back into the same video, encoded with
Apple's AAC encoder (aac_at). For a render that came out too quiet.

Why: HyperFrames encodes the mix with ffmpeg's built-in AAC encoder at 192k, measures the encoded
true peak, and lowers the whole track until it sits under -1 dBTP. The built-in encoder fills
noisy parts of speech with substituted noise (PNS), which can overshoot by 3 to 5 dB, so a render
can lose several dB for nothing ("Audio lowered by 5.8 dB to stay under -1 dBTP" in the render log;
"the-apology" EN came out at -20.2 LUFS against -15 for the rest). The mix itself is plain: every
clip at its data-start, data-duration and data-volume. This rebuilds it with ffmpeg (checked on
"the-apology" PT: no offset, the same sound up to a gain, residual -28.8 dB), sets the loudness,
encodes with aac_at (no overshoot, both channels identical) and swaps the audio into the render
without touching the picture. The original render is kept next to it as <name>.engine.mp4.

Desk mode only: a composition with effect chains or a carved music bed (keyboard mode) is refused,
because ffmpeg cannot replay those.
Run: /usr/bin/python3 tools/remix_audio.py --episode the-apology --lang en [--lufs -15]
Then: /usr/bin/python3 tools/pipeline.py --episodes the-apology --langs en --steps verify
"""
import argparse, re, shutil, subprocess, tempfile
from pathlib import Path
import studio as S


def loudness(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", out)[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--lang", required=True)
    ap.add_argument("--lufs", type=float, default=-15.0, help="target loudness (the batch renders sit at about -15)")
    a = ap.parse_args()
    edir = S.ROOT / "episodes" / a.episode
    bdir, render = edir / "build" / a.lang, edir / "renders" / f"{a.episode}-{a.lang}.mp4"
    html = (bdir / "index.html").read_text()
    if "data-fx-chain" in html or "data-fx-carve" in html or "data-automation" in html:
        raise SystemExit("this composition has effects or a carved bed: ffmpeg cannot replay it, leave the render as it is")
    clips = re.findall(r'<audio id="([^"]+)" src="([^"]+)" data-start="([\d.]+)" data-duration="([\d.]+)"[^>]*data-volume="([\d.]+)"', html)
    end = float(re.search(r'data-composition-id="main" data-start="0" data-duration="([\d.]+)"', html).group(1))
    with tempfile.TemporaryDirectory() as tmp:
        mix, enc, out = Path(tmp) / "mix.wav", Path(tmp) / "mix.m4a", Path(tmp) / "out.mp4"
        args, filt = [], []
        for i, (_, src, st, du, vol) in enumerate(clips):
            args += ["-i", str(bdir / src)]
            ms = int(round(float(st) * 1000))
            filt.append(f"[{i}:a]atrim=0:{du},aformat=sample_rates=48000:channel_layouts=stereo,adelay={ms}|{ms},volume={vol}[a{i}]")
        graph = ";".join(filt) + ";" + "".join(f"[a{i}]" for i in range(len(clips))) + \
            f"amix=inputs={len(clips)}:normalize=0:duration=longest,apad=whole_dur={end},atrim=0:{end}[out]"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", str(mix)], check=True)
        lufs, peak = loudness(mix)
        gain = min(a.lufs - lufs, -1.5 - peak)  # the target loudness, but never past -1.5 dBTP
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mix), "-af", f"volume={gain:.2f}dB", "-c:a", "aac_at", "-b:a", "192k", str(enc)], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(render), "-i", str(enc), "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
                        "-movflags", "+faststart", "-shortest", str(out)], check=True)
        backup = render.with_name(render.stem + ".engine.mp4")
        if not backup.exists():
            shutil.copy2(render, backup)
        shutil.copy2(out, render)
    new_lufs, new_peak = loudness(render)
    S.emit("remix", episode=a.episode, lang=a.lang, clips=len(clips), gain=round(gain, 2), lufs=new_lufs, peak=new_peak, backup=str(backup.name))


if __name__ == "__main__":
    main()
