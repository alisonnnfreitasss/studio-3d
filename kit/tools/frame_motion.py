#!/usr/bin/env python3
"""Every frame, measured: read a reel frame by frame (in order, no seeking) and register each
frame to the one before it (ORB features, partial-affine RANSAC, the caption band masked) for
zoom (scale), pan (dx, dy as a share of the frame) and roll; join each frame's scene score
(cuts/<id>.scores.json). Then group frames into what the camera does: hard cuts (score > 0.28),
fast moves (zoom or pan faster than a threshold for 3+ frames), holds.

Writes motion/<id>.frames.json (one row per frame) and motion/<id>.summary.json, prints the summary.
Run: /usr/bin/python3 tools/frame_motion.py <id>
"""
import json, math, sys
import cv2
import numpy as np

cv2.setNumThreads(2)
rid = sys.argv[1]
import os
os.makedirs("motion", exist_ok=True)
W = 360
cap = cv2.VideoCapture(f"source-videos/{rid}.mp4")
fps = cap.get(cv2.CAP_PROP_FPS) or 30
scores = json.load(open(f"cuts/{rid}.scores.json"))["scores"]
orb = cv2.ORB_create(nfeatures=1200)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
rows, prev = [], None
i = 0
while True:
    ok, f = cap.read()
    if not ok:
        break
    h = int(f.shape[0] * W / f.shape[1])
    g = cv2.cvtColor(cv2.resize(f, (W, h)), cv2.COLOR_BGR2GRAY)
    m = np.full(g.shape, 255, np.uint8)
    m[int(h * 0.64):int(h * 0.72), :] = 0
    k, d = orb.detectAndCompute(g, m)
    r = {"f": i, "t": round(i / fps, 3), "s": round(scores[i][1], 3) if i < len(scores) else 0.0, "std": round(float(g.std()), 1)}
    if prev is not None and d is not None and prev[1] is not None and len(d) > 8 and len(prev[1]) > 8:
        ms = bf.match(prev[1], d)
        if len(ms) >= 12:
            a = np.float32([prev[0][x.queryIdx].pt for x in ms])
            b = np.float32([k[x.trainIdx].pt for x in ms])
            M, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)
            if M is not None and inl is not None and inl.sum() >= 12:
                r.update(z=round(math.hypot(M[0, 0], M[1, 0]), 5), dx=round(M[0, 2] / W, 5), dy=round(M[1, 2] / h, 5),
                         rot=round(math.degrees(math.atan2(M[1, 0], M[0, 0])), 3), n=int(inl.sum()))
    rows.append(r)
    prev = (k, d)
    i += 1

# classify each frame: cut / fast / slow / hold / unknown
FAST_Z = 0.006     # zoom change per frame (0.6% a frame = 18%/s)
FAST_P = 0.006     # pan per frame as a share of the frame
SLOW_Z, SLOW_P = 0.0012, 0.0012
for r in rows:
    if r["s"] > 0.28:
        r["k"] = "cut"
    elif "z" not in r:
        r["k"] = "?"
    else:
        z, p = abs(r["z"] - 1), math.hypot(r["dx"], r["dy"])
        r["k"] = "fast" if (z > FAST_Z or p > FAST_P) else "slow" if (z > SLOW_Z or p > SLOW_P) else "hold"
# runs
runs = []
for r in rows:
    if runs and runs[-1]["k"] == r["k"]:
        runs[-1]["n"] += 1
        runs[-1]["zoom"] *= r.get("z", 1)
    else:
        runs.append({"k": r["k"], "f0": r["f"], "n": 1, "zoom": r.get("z", 1)})
# fast moves = fast runs of 3+ frames (merging gaps of 1-2 frames)
moves = []
for ru in runs:
    if ru["k"] == "fast" and ru["n"] >= 2:
        if moves and ru["f0"] - (moves[-1]["f0"] + moves[-1]["n"]) <= 2:
            moves[-1]["n"] = ru["f0"] + ru["n"] - moves[-1]["f0"]
            moves[-1]["zoom"] *= ru["zoom"]
        else:
            moves.append(dict(ru))
moves = [m for m in moves if m["n"] >= 3]
cuts = [r["t"] for r in rows if r["k"] == "cut"]
dur = len(rows) / fps
blank = [r["t"] for r in rows if r["std"] < 8]
counts = {k: sum(1 for r in rows if r["k"] == k) for k in ("hold", "slow", "fast", "cut", "?")}
move_frames = [m["n"] for m in moves]
summary = {
    "id": rid, "frames": len(rows), "fps": fps, "duration": round(dur, 2),
    "cuts": len(cuts), "cuts_per_min": round(len(cuts) / dur * 60, 1),
    "fast_moves": len(moves), "fast_moves_per_min": round(len(moves) / dur * 60, 1),
    "fast_move_frames_median": int(np.median(move_frames)) if move_frames else 0,
    "fast_move_frames_p90": int(np.percentile(move_frames, 90)) if move_frames else 0,
    "share_of_frames": {k: round(v / len(rows), 3) for k, v in counts.items()},
    "mean_gap_between_events_s": round(dur / max(1, len(cuts) + len(moves)), 2),
    "push_moves": sum(1 for m in moves if m["zoom"] > 1.03), "pull_moves": sum(1 for m in moves if m["zoom"] < 0.97),
    "blank_frames": len(blank),
}
json.dump(rows, open(f"motion/{rid}.frames.json", "w"))
json.dump({**summary, "moves": [{"t": round(m["f0"] / fps, 2), "frames": m["n"], "zoom": round(m["zoom"], 3)} for m in moves], "cuts_at": cuts},
          open(f"motion/{rid}.summary.json", "w"), indent=1)
print(json.dumps(summary))
