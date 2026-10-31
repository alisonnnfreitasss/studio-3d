#!/usr/bin/python3
"""How fast the picture moves, so a reel never moves too fast to follow on one watch.

    /usr/bin/python3 ../kit/tools/speed.py renders/<slug>-en-vN.mp4 [--json]

The measure (limits set by speed_calibrate.py on approved reels): each frame is shrunk to 108x192 grey, and a frame's speed is the mean absolute grey-level change
from the frame before, on a 0 to 255 scale. Hard cuts are found by the same numbers; a cut is allowed here (frame_qa.py
judges cuts against the shots the code declares), so the half second round each one is left out of the speed limits.

It fails on:
  fast      a quarter second over MAX_QUARTER: a whip, zoom or pan too fast to follow (the ceiling of approved reels)
  sustained any 4 seconds averaging over SUSTAIN: restless for too long, even with no single fast moment
  jump      a second under FREEZE followed by one over JUMP: a near-freeze, then a jump
It warns on a quarter second over WARN_QUARTER (faster than 99% of the fastest approved reel).
"""
import json
import subprocess
import sys

import numpy as np

W, H = 108, 192
FPS = 30
CUT, CUT_RATIO = 30.0, 2.5     # one frame changes this much, and this many times both its neighbours
GUARD = 0.5                    # seconds round a cut left out of the limits
# Set from speed_calibrate.py on the approved reels', quarter-second peaks 26.7 to 37.0, 99th percentiles 16.6 to 28.9,
# 4 s averages 8.0 to 12.5 (the same footage played 4x faster reaches 14.5 to 15.6).
MAX_QUARTER, WARN_QUARTER, SUSTAIN, FREEZE, JUMP = 38.0, 30.0, 13.5, 0.3, 22.0


def read(video):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={FPS},scale={W}:{H}:flags=area,format=gray",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W)


def measure(video):
    """The raw numbers: per-frame speed, cuts (s), per-quarter and per-second speeds, each with its in-guard flag."""
    frames = read(video)
    if len(frames) < 2:
        raise ValueError(f"{video}: too few frames to measure")
    f = frames.astype(np.int16)
    diff = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    cuts = []
    for k in range(len(diff)):
        a = diff[k - 1] if k else 0.0
        b = diff[k + 1] if k + 1 < len(diff) else 0.0
        if diff[k] > CUT and diff[k] > CUT_RATIO * max(a, b, 1.0):
            cuts.append((k + 1) / FPS)
    near = lambda a, b: any(a < c + GUARD and b > c - GUARD for c in cuts)
    q = max(1, round(FPS / 4))
    quarters = [(i / FPS, float(diff[i:i + q].mean())) for i in range(0, len(diff), q)]
    seconds = [(i / FPS, float(diff[i:i + FPS].mean())) for i in range(0, len(diff), FPS)]
    return {"frames": len(f), "diff": diff, "cuts": cuts, "quarters": quarters, "seconds": seconds, "near": near}


def findings(m):
    """Stretches over the limits, each {a, b, level, kind, reason}."""
    out = []
    near = m["near"]
    for t, v in m["quarters"]:
        if near(t, t + 0.25):
            continue
        if v > MAX_QUARTER:
            out.append({"a": t, "b": t + 0.25, "level": "fail", "kind": "fast", "reason": f"moves too fast to follow: speed {v:.1f}, limit {MAX_QUARTER:g}"})
        elif v > WARN_QUARTER:
            out.append({"a": t, "b": t + 0.25, "level": "warn", "kind": "fast", "reason": f"near the speed limit: {v:.1f}, approved reels rarely pass {WARN_QUARTER:g}"})
    s = m["seconds"]
    for (t, v), (t2, v2) in zip(s, s[1:]):
        if v < FREEZE and v2 > JUMP and not near(t, t2 + 1):
            out.append({"a": t, "b": t2 + 1, "level": "fail", "kind": "jump", "reason": f"near-freeze ({v:.1f}) then a jump ({v2:.1f})"})
    d = m["diff"].copy()
    for c in m["cuts"]:
        k = int(c * FPS) - 1
        d[max(0, k - 1):k + 2] = 0
    n = 4 * FPS
    if len(d) >= n:
        r = np.convolve(d, np.ones(n) / n, "valid")
        if r.max() > SUSTAIN:
            i = int(r.argmax())
            out.append({"a": i / FPS, "b": (i + n) / FPS, "level": "fail", "kind": "sustained", "reason": f"restless for 4 s: average speed {r.max():.1f}, limit {SUSTAIN:g}"})
    return sorted(out, key=lambda x: x["a"])


def scan(video):
    m = measure(video)
    free = [v for t, v in m["quarters"] if not m["near"](t, t + 0.25)]
    return {"frames": m["frames"], "cuts": [round(c, 2) for c in m["cuts"]], "peak": round(max(free or [0]), 2),
            "median": round(float(np.median(free or [0])), 2), "findings": findings(m)}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    r = scan(args[0])
    if "--json" in sys.argv:
        print(json.dumps(r, indent=1))
    else:
        print(f"{args[0]}: {r['frames']} frames, {len(r['cuts'])} cuts, speed median {r['median']}, peak {r['peak']} (limit {MAX_QUARTER:g})")
        for x in r["findings"]:
            print(f"  {x['level'].upper():4} {x['a']:7.2f}-{x['b']:7.2f} s  {x['reason']}")
        if not any(x["level"] == "fail" for x in r["findings"]):
            print("  PASS: never too fast to follow")
    sys.exit(1 if any(x["level"] == "fail" for x in r["findings"]) else 0)
