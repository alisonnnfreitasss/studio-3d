#!/usr/bin/python3
"""Find near-empty frames in a render: the picture one flat colour apart from the caption band.

    /usr/bin/python3 ../kit/tools/empty_frames.py <video.mp4> [...]

frame_qa.py calls a frame blank only when all of it is flat, so a frame that is empty except for its one-word caption passes
it. This reads 6 frames a second at 36 by 64, leaves out the caption band
(60 to 78% of the height) and flags a frame with almost no edges left (mean pixel-to-pixel change under 3: the empty
airplane frame measured 1.8, real frames 6.5 and up; a soft sky gradient is not an edge). Prints the stretches, or "none".
check.py runs this with the other checks.
"""
import subprocess
import sys

import numpy as np

W, H, FPS, LIMIT = 36, 64, 6, 3.0


def scan(path):
    """Stretches of near-empty frames as [(start s, end s)]."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    keep = np.r_[0:int(H * 0.60), int(H * 0.78):H]

    def edges(f):
        k = f[keep]
        return np.abs(np.diff(k, axis=1)).mean() + np.abs(np.diff(k, axis=0)).mean()
    flat = [i for i, f in enumerate(frames) if edges(f) < LIMIT]
    runs = []
    for i in flat:
        if runs and i == runs[-1][1]:
            runs[-1][1] = i + 1
        else:
            runs.append([i, i + 1])
    return [(a / FPS, b / FPS) for a, b in runs]


if __name__ == "__main__":
    for p in sys.argv[1:]:
        runs = scan(p)
        print(f"{p.split('/')[-1]}: " + (", ".join(f"{a:.1f}-{b:.1f} s" for a, b in runs) if runs else "none"))
