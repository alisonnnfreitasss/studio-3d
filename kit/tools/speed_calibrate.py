#!/usr/bin/python3
"""Measures speed.py's numbers on finished reels, to set its limits from what was approved.

    /usr/bin/python3 speed_calibrate.py <video.mp4> [<video.mp4> ...]
"""
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

import speed


def one(path):
    m = speed.measure(path)
    q = np.array([v for t, v in m["quarters"] if not m["near"](t, t + 0.25)])
    s = m["seconds"]
    pairs = [(v, v2) for (t, v), (t2, v2) in zip(s, s[1:]) if not m["near"](t, t2 + 1)]
    jump = max((v2 / max(v, 0.1) for v, v2 in pairs), default=0)
    freeze = [(round(v, 2), round(v2, 1)) for v, v2 in pairs if v < 2 and v2 > 12]
    top = [round(t, 1) for t, v in sorted(m["quarters"], key=lambda x: -x[1]) if not m["near"](t, t + 0.25)][:3]
    return (Path(path).stem, len(m["cuts"]), *[round(float(np.percentile(q, p)), 2) for p in (50, 90, 99, 100)],
            round(jump, 1), freeze, top)


if __name__ == "__main__":
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(one, sys.argv[1:]))
    print(f"{'reel':38} cuts   p50   p90   p99   max  jump  fastest at, then freeze pairs")
    for r in rows:
        print(f"{r[0]:38} {r[1]:4} {r[2]:5} {r[3]:5} {r[4]:5} {r[5]:5} {r[6]:5}  {r[8]}  {r[7]}")
