#!/usr/bin/python3
"""Every frame of a render, checked: reads the MP4 in order (no seeking) and flags
  - blank frames (almost no contrast),
  - one-frame flashes (a frame far from both neighbours while the neighbours match each other),
  - frozen stretches (identical frames for over 1 s while the film should move),
  - hard cuts (big change between two frames), compared with the shot changes the code declares
    (renders/shotmap/probe.json from shot_map.mjs): a cut where no shot changes is a glitch,
    a shot change with no cut is a missing cut.
Writes renders/<name>.qa.json and prints a summary. check.py runs this with the other checks.

Run from the reel: /usr/bin/python3 ../kit/tools/frame_qa.py renders/<slug>-en-vN.mp4 [--probe <probe.json>]
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def analyse(video, probe_path):
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    grays, stds = [], []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(f, (90, 160)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        grays.append(g)
        stds.append(float(g.std()))
    n = len(grays)
    diff = [0.0] + [float(np.abs(grays[i] - grays[i - 1]).mean()) for i in range(1, n)]
    blank = [i for i, s in enumerate(stds) if s < 6]
    flashes = []
    for i in range(1, n - 1):
        a, b = diff[i], diff[i + 1]
        around = float(np.abs(grays[i + 1] - grays[i - 1]).mean())
        if a > 18 and b > 18 and around < 0.35 * min(a, b):
            flashes.append(round(i / fps, 3))
    frozen, frozen_runs, run = [], [], 0
    for i in range(1, n):
        if diff[i] < 0.05:
            run += 1
            if run == int(fps * 1.0):
                frozen.append(round((i - run) / fps, 2))
                frozen_runs.append([round((i - run) / fps, 2), round(i / fps, 2)])
            elif run > int(fps * 1.0):
                frozen_runs[-1][1] = round(i / fps, 2)
        else:
            run = 0
    # a cut is one isolated spike; a fast camera move is a run of big changes, frame after frame
    cuts = [round(i / fps, 3) for i in range(1, n) if diff[i] > 22 and diff[i] > 2.5 * max(diff[i - 1], diff[i + 1] if i + 1 < n else 0)]
    probe = json.loads(Path(probe_path).read_text())
    ss = probe["samples"]
    changes = [round(ss[i]["t"], 2) for i in range(1, len(ss)) if ss[i].get("shot") != ss[i - 1].get("shot")]
    unexplained = [c for c in cuts if not any(abs(c - s) <= 0.15 for s in changes)]
    missing = [s for s in changes if not any(abs(c - s) <= 0.15 for c in cuts)]
    return {"video": str(video), "frames": n, "fps": fps, "blank": blank, "flashes": flashes, "frozen_from": frozen,
            "frozen_runs": frozen_runs, "cuts": cuts, "shot_changes": changes, "cuts_without_shot_change": unexplained,
            "shot_changes_without_cut": missing}


def summary(out):
    return (f"{out['frames']} frames read; blank {len(out['blank'])}; one-frame flashes {len(out['flashes'])} {out['flashes'][:8]}; "
            f"frozen stretches {len(out['frozen_from'])} {out['frozen_from'][:8]}\n"
            f"hard cuts {len(out['cuts'])}; shot changes in code {len(out['shot_changes'])}; cuts with no shot change "
            f"{out['cuts_without_shot_change']}; shot changes with no cut {out['shot_changes_without_cut']}")


if __name__ == "__main__":
    from common import HERE
    args = sys.argv[1:]
    probe = HERE / "renders/shotmap/probe.json"
    if "--probe" in args:
        i = args.index("--probe")
        probe = Path(args[i + 1]).resolve()
        del args[i:i + 2]
    src = (HERE / args[0]).resolve()
    out = analyse(src, probe)
    out["video"] = args[0]
    (src.parent / (src.stem + ".qa.json")).write_text(json.dumps(out, indent=1))
    print(summary(out))
