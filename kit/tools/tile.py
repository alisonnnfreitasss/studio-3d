#!/usr/bin/python3
"""Tile a snapshot folder's frame-*.png (HyperFrames snapshots) into labelled review sheets (6 across, 3 rows each).
Run from the reel: /usr/bin/python3 ../kit/tools/tile.py renders/<snapdir>
"""
import glob, re, sys
import cv2, numpy as np

d = sys.argv[1]
fs = sorted(glob.glob(f"{d}/frame-*.png"), key=lambda f: int(re.search(r"frame-(\d+)", f).group(1)))
tiles = []
for f in fs:
    im = cv2.resize(cv2.imread(f), (240, 427))
    t = re.search(r"at-([\d.]+)s", f).group(1)
    cv2.rectangle(im, (0, 0), (70, 22), (0, 0, 0), -1)
    cv2.putText(im, t, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
    tiles.append(im)
while len(tiles) % 6:
    tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)]
for k in range(0, len(rows), 3):
    cv2.imwrite(f"{d}/sheet_{k // 3}.jpg", np.vstack(rows[k:k + 3]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(fs), "frames")
