#!/usr/bin/python3
"""Tile renders/<dir>/t*.jpg (stills.mjs) into one labelled sheet, renders/<dir>/_sheet.jpg (cols across).
Run from the reel: /usr/bin/python3 ../kit/tools/sheet.py renders/<dir> [cols] [width]
"""
import glob, re, sys
import cv2, numpy as np


def sheet(d, cols=6, w=240):
    fs = sorted(glob.glob(f"{d}/t*.jpg"))
    tiles = []
    for f in fs:
        im = cv2.imread(f)
        im = cv2.resize(im, (w, int(im.shape[0] * w / im.shape[1])))
        lab = "%.2f" % float(re.search(r"t([\d.]+)\.jpg", f).group(1))   # t0000.33.jpg -> 0.33
        cv2.rectangle(im, (0, 0), (len(lab) * 10 + 8, 20), (0, 0, 0), -1)
        cv2.putText(im, lab, (3, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        tiles.append(im)
    if not tiles:
        return 0
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
    cv2.imwrite(f"{d}/_sheet.jpg", np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
    return len(fs)


if __name__ == "__main__":
    n = sheet(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 6, int(sys.argv[3]) if len(sys.argv) > 3 else 240)
    print(n, "stills")
