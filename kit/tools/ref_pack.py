#!/usr/bin/env python3
"""Reference pack: measure one reel by script (no AI image reading) and write one short file that a
build agent reads instead of looking at frames.

What it measures:
- beats: the spoken sentences from the Scribe words (a sentence ends on a word whose text ends in
  . ? or !, the same split the other tools use), each with its slot to the next sentence and the
  audio events inside it;
- shots: hard cuts (scene score > 0.28); cuts less than 1 s apart are one event (flashes, strobes,
  lightning, rewinds), and each event says whether the picture after it is the same shot or a new one;
  plus split screens (a thin flat seam bar across the frame), greyscale stretches and yellow highlights;
- camera: holds, drifts, fast moves and whips per beat from motion/<id>.frames.json (runs
  frame_motion.py first if the file is missing); zoom and pan are taken at the frame centre;
- on-screen text: tesseract (por if installed, else eng with accents put back from the transcript's
  words) on frames sampled at 5 fps. Pills are found as shapes and read one line each; everything else
  is read through "outlined text" masks (white, yellow or coloured letters ringed by a dark outline,
  dark letters on white, coloured letters ringed by white). Reads are joined across samples into text
  events; numbers that change in place become counters; the one-word caption band is found from the data;
- label sizes (letter height with tilt removed, tilt, box), the 3 dominant colours and the brightness
  of each beat, and a 1 fps contact sheet.

Writes packs/<id>.md (short, for build agents), packs/<id>.json (everything) and
packs/<id>.sheet1.jpg (+ .sheet1_02.jpg when the reel needs a second image).
Run: /usr/bin/python3 tools/ref_pack.py <id> [ocr_fps]
"""
import difflib, json, math, os, re, subprocess, sys, tempfile, time, unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np

# run from the folder holding source-videos/ and transcripts/
os.environ["OMP_THREAD_LIMIT"] = "1"   # one thread per tesseract, many tesseracts at once
cv2.setNumThreads(2)
TESS = "/opt/homebrew/bin/tesseract"
CUT = 0.28            # scene score of a hard cut (as in frame_motion.py)
CLUSTER_GAP = 1.0     # cuts closer than this (s) are one event
FW = 1080             # on-screen sizes are measured at 1080 wide
TILE_W, COLS, ROWS = 160, 12, 5   # contact sheet: 60 one-second tiles per image
T_START = time.time()

rid = sys.argv[1]
OCR_FPS = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
os.makedirs("packs", exist_ok=True)
LANG = "por" if "por" in subprocess.run([TESS, "--list-langs"], capture_output=True, text=True).stdout.split() else "eng"


# ---------- text helpers ----------
def plain(s):
    """Drop accents."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def key(s):
    """Comparison key: lower case, no accents, letters and digits only (OCR reads Ç as ¢)."""
    return re.sub(r"[^a-z0-9]", "", plain(s.replace("¢", "c")).lower())


def hexc(bgr):
    b, g, r = [int(round(x)) for x in bgr]
    return f"#{r:02x}{g:02x}{b:02x}"


def short(s, n=64):
    s = re.sub(r"\s+([.,?!])", r"\1", s)   # Scribe leaves a space before a full stop that follows an audio event
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "..."


def tidy(s):
    """Drop stray marks OCR leaves at the ends of a label (a pill's dot read as "-" or "*", an edge read as "|")."""
    return re.sub(r"^[-*|_~=•·.,;:]+\s*|\s*[-*|_~=•·,;:]+$", "", s.strip())


def numeric(s):
    """A number on a dial or counter (it changes while it stays put): digits and no letters ("38°", "12%")."""
    return any(ch.isdigit() for ch in s) and not any(ch.isalpha() for ch in s)


# ---------- 1. beats ----------
scribe = json.load(open(f"transcripts/{rid}.scribe.json"))
cap = cv2.VideoCapture(f"source-videos/{rid}.mp4")
fps = cap.get(cv2.CAP_PROP_FPS) or 30
NFR = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
W0, H0 = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
FH = int(round(FW * H0 / W0))
DUR = NFR / fps

sents, cur = [], []
for w in scribe["words"]:
    if w["type"] != "word":
        continue
    cur.append(w)
    if w["text"].endswith((".", "?", "!")):
        sents.append(cur)
        cur = []
if cur:
    sents.append(cur)
beats = [{"id": f"b{i + 1:02d}", "start": s[0]["start"], "end": s[-1]["end"], "text": " ".join(w["text"] for w in s),
          "words": [[w["text"], w["start"], w["end"]] for w in s], "audio": []} for i, s in enumerate(sents)]
for i, b in enumerate(beats):
    b["next"] = beats[i + 1]["start"] if i + 1 < len(beats) else round(DUR, 2)
    b["slot"] = round(b["next"] - b["start"], 2)
    b["w0"] = 0.0 if i == 0 else b["start"]          # the window a beat owns: its start to the next start
for e in scribe["words"]:
    if e["type"] == "audio_event":
        b = next((b for b in beats if b["w0"] <= e["start"] < b["next"]), beats[-1])
        b["audio"].append([e["text"], e["start"], e["end"]])


def beat_at(t):
    return next((b for b in beats if b["w0"] <= t < b["next"]), beats[-1])


# vocabulary for putting accents back on OCR words (the eng model drops them)
VOCAB = {}
for w in scribe["words"]:
    core = re.sub(r"^\W+|\W+$", "", w["text"]) if w["type"] == "word" else ""
    if len(key(core)) >= 2:
        VOCAB.setdefault(key(core), core.lower())
VKEYS = list(VOCAB)


def fix_token(tok):
    pre, core, post = re.match(r"^(\W*)(.*?)(\W*)$", tok).groups()
    k = key(core)
    rep = VOCAB.get(k) if len(k) >= 2 else None
    if rep is None and len(k) >= 5:
        # a misread letter or two ("fundagao"), never a word that only adds or drops an ending ("maquina" is not "maquinas")
        near = [n for n in difflib.get_close_matches(k, VKEYS, n=3, cutoff=0.8)
                if abs(len(n) - len(k)) <= 1 and not (n.startswith(k) or k.startswith(n))]
        rep = VOCAB[near[0]] if near else None
    if rep is None:
        return tok, False
    letters = [ch for ch in core if ch.isalpha()]
    if letters and sum(ch.isupper() for ch in letters) >= 0.6 * len(letters):   # OCR mixes case in caps ("ViDEO")
        rep = rep.upper()
    elif core[:1].isupper():
        rep = rep[:1].upper() + rep[1:]
    return pre + rep + post, rep != core


# ---------- 4. on-screen text: masks + tesseract ----------
K3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))   # a 3 px ring round each blob


def outlined(fg, bg, min_ratio):
    """Keep the blobs of fg whose 3 px surrounding ring lies mostly on bg (letters with an outline, or on a pill)."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg.view(np.uint8), connectivity=8)
    if n <= 1:
        return np.zeros(fg.shape, bool)
    labd = cv2.dilate(lab.astype(np.float32), K3).astype(np.int32)
    ring = (labd > 0) & (lab == 0)
    tot = np.bincount(labd[ring], minlength=n)
    hit = np.bincount(labd[ring & bg], minlength=n)
    ok = (hit >= min_ratio * np.maximum(tot, 1)) & (st[:, 4] >= 12) & (st[:, 3] < 0.09 * FH) & (st[:, 2] < 0.5 * FW)
    ok[0] = False
    return ok[lab]


def text_masks(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    white = (v > 200) & (s < 60)
    yellow = (v > 170) & (s > 90) & (h >= 15) & (h <= 35)
    masks = {"light": outlined(white | yellow, v < 90, 0.6),          # white or yellow letters, dark outline
             "vivid": outlined((s > 110) & (v > 120) & ~yellow, v < 90, 0.6),  # red, blue... letters, dark outline
             "dark": outlined(v < 110, white, 0.65),                   # dark letters on a white card (pills: find_pills)
             "colour": outlined((s > 110) & (v > 90) & ~yellow, white, 0.75)}  # coloured letters, white outline
    return masks, white


def find_pills(hsv, white):
    """White pills and tags holding dark letters: white blobs 22 to 90 px tall and wide whose outline, holes
    filled, is a rounded rectangle (85%+ of the box) and whose holes hold dark neutral letters.
    Returns (box, ink) pairs, ink = the letters inside the holes."""
    s, v = hsv[..., 1], hsv[..., 2]
    n, lab, st, _ = cv2.connectedComponentsWithStats(white.view(np.uint8), connectivity=8)
    pills = []
    for j in range(1, n):
        x, y, w, h, a = (int(q) for q in st[j])
        if not (22 <= h <= 90 and 1.8 * h <= w <= 0.9 * FW) or a < 0.5 * w * h:
            continue
        blob = (lab[y:y + h, x:x + w] == j).astype(np.uint8)
        cs, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filled = cv2.drawContours(np.zeros_like(blob), cs, -1, 1, -1).astype(bool)
        if filled.sum() < 0.85 * w * h:
            continue
        ink = filled & ~blob.astype(bool) & (v[y:y + h, x:x + w] < 120) & (s[y:y + h, x:x + w] < 90)
        if ink.sum() >= 0.04 * w * h:
            pills.append(([x, y, x + w, y + h], ink))
    return pills


def tesseract(mask, tag, tmp, psm=11, pad=24, scale=1, min_conf=40):
    """OCR a black-on-white mask (True = ink), cropped to the ink with a white margin; returns words with boxes
    in mask px."""
    ys, xs = np.nonzero(mask)
    if len(ys) < 40:
        return []
    y0, x0 = ys.min() - pad, xs.min() - pad      # the crop's origin, margin included
    img = np.where(mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 0, 255).astype(np.uint8)
    img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)
    if scale != 1:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    p = os.path.join(tmp, tag + ".png")
    cv2.imwrite(p, img)
    out = subprocess.run([TESS, p, "stdout", "-l", LANG, "--psm", str(psm), "-c", "tessedit_do_invert=0", "tsv"],
                         capture_output=True, text=True).stdout
    os.remove(p)
    words = []
    for line in out.splitlines()[1:]:
        c = line.split("\t")
        if len(c) < 12 or c[0] != "5" or not c[11].strip():
            continue
        txt, conf = c[11].strip(), float(c[10])
        aln = sum(ch.isalnum() for ch in txt)
        single = aln == 1 and conf >= 75 and (txt.isalpha() or numeric(txt))   # "o", "e" join a line; "6°" is a value
        if not single and (conf < min_conf or aln < 2 or aln < 0.5 * len(txt)):
            continue
        x, y = int(int(c[6]) / scale) + x0, int(int(c[7]) / scale) + y0
        words.append({"text": txt, "conf": conf, "box": [x, y, x + int(int(c[8]) / scale), y + int(int(c[9]) / scale)]})
    return words


def union_find(items, linked):
    par = list(range(len(items)))

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if linked(items[i], items[j]):
                par[find(i)] = find(j)
    groups = {}
    for i in range(len(items)):
        groups.setdefault(find(i), []).append(items[i])
    return list(groups.values())


def ubox(bs):
    return [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]


def same_line(a, b):
    a, b = a["box"], b["box"]
    ha, hb = a[3] - a[1], b[3] - b[1]
    if max(ha, hb) > 1.8 * min(ha, hb):
        return False
    vov = min(a[3], b[3]) - max(a[1], b[1])
    return vov > 0.5 * min(ha, hb) and max(a[0], b[0]) - min(a[2], b[2]) < 1.2 * max(ha, hb)


def stacked(a, b):
    """Two lines of one label: one right under the other, overlapping sideways (not a tag and its own caption)."""
    ha, hb = a["h"], b["h"]
    if max(ha, hb) > 2.2 * min(ha, hb) or key(a["text"]) == key(b["text"]):
        return False
    gap = max(a["box"][1], b["box"][1]) - min(a["box"][3], b["box"][3])
    hov = min(a["box"][2], b["box"][2]) - max(a["box"][0], b["box"][0])
    return gap < 0.9 * max(ha, hb) and hov > 0


def pill_box(white, box):
    """The white pill or card around dark text: the white blob under the text, if it ends near it."""
    x0, y0, x1, y1 = box
    h = max(8, y1 - y0)
    X0, Y0, X1, Y1 = max(0, x0 - 3 * h), max(0, y0 - 2 * h), min(FW, x1 + 3 * h), min(FH, y1 + 2 * h)
    wm = cv2.morphologyEx(white[Y0:Y1, X0:X1].view(np.uint8), cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_RECT, (h | 1, h | 1)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(wm, 8)
    l = lab[(y0 + y1) // 2 - Y0, (x0 + x1) // 2 - X0]
    if l == 0:
        return None
    bx, by, bw, bh = st[l][:4]
    if bx == 0 or by == 0 or bx + bw >= X1 - X0 or by + bh >= Y1 - Y0:
        return None   # runs out of the search window: a white wall or sky, not a pill
    return [int(bx + X0), int(by + Y0), int(bx + bw + X0), int(by + bh + Y0)]


def line_geom(sm):
    """Letter height and tilt of one text line from its mask pixels. The line's axis comes from PCA; the height
    is the dense band across it (rows holding at least half the median row's pixels), so accents, cedillas and
    descenders drop out: cap height for upper case, about x-height for lower case. Tilt + = rises to the right."""
    ys, xs = np.nonzero(sm)
    if len(xs) < 30:
        return None, 0.0
    pts = np.column_stack([xs, ys]).astype(np.float64)
    pts -= pts.mean(axis=0)
    tilt, across = 0.0, pts[:, 1]
    if sm.shape[1] > 1.8 * sm.shape[0]:                 # long enough for the axis to mean something
        with np.errstate(all="ignore"):                  # macOS Accelerate raises spurious matmul warnings
            _, vec = np.linalg.eigh(pts.T @ pts / len(pts))
            ang = math.degrees(math.atan2(vec[1, 1], vec[0, 1]))
            ang = (ang + 90) % 180 - 90
            if abs(ang) <= 30:
                tilt, across = -ang, pts @ vec[:, 0]
    prof = np.bincount(np.round(across - across.min()).astype(int))
    rows = np.nonzero(prof >= 0.5 * np.median(prof[prof > 0]))[0]
    return float(rows[-1] - rows[0] + 1), tilt


def read_sample(idx, t, f, tmp):
    """OCR one frame: returns its text labels (lines stacked into labels) with box, size and colours."""
    if f.shape[1] != FW:
        f = cv2.resize(f, (FW, FH), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    masks, white = text_masks(hsv)
    out = []
    # pills first: each pill is read on its own as one line, from the dark neutral ink in its holes (the coloured dot left out)
    for k, (pb, sm) in enumerate(find_pills(hsv, white)):
        x0, y0, x1, y1 = pb
        for mm in masks.values():   # not read twice (the white holes inside its letters would pass as outlined text)
            mm[max(0, y0 - 4):y1 + 4, max(0, x0 - 4):x1 + 4] = False
        # inside a pill everything is text, so a low-confidence long word is kept for the accent fixer ("FUNDACGAO")
        words = [w for w in tesseract(sm, f"{idx}_pill{k}", tmp, psm=7, pad=12, scale=2, min_conf=10)
                 if w["conf"] >= 40 or sum(ch.isalpha() for ch in w["text"]) >= 4]
        if not words:
            continue
        for w in words:
            w["box"] = [w["box"][0] + x0, w["box"][1] + y0, w["box"][2] + x0, w["box"][3] + y0]
        for w in words:
            w["text"], w["fixed"] = fix_token(w["text"])
        words.sort(key=lambda w: w["box"][0])
        aln = sum(ch.isalnum() for w in words for ch in w["text"])
        if aln < 2 and not numeric(" ".join(w["text"] for w in words)):
            continue
        dense, _ = line_geom(sm)
        sub = f[y0:y1, x0:x1]
        out.append({"t": round(t, 3), "src": "pill", "text": tidy(" ".join(w["text"] for w in words)), "nwords": len(words), "nlines": 1,
                    "conf": round(float(np.mean([w["conf"] for w in words])), 1), "fixed": sum(w["fixed"] for w in words),
                    "box": pb, "cx": (x0 + x1) / 2 / FW, "cy": (y0 + y1) / 2 / FH,
                    "box_h": float(np.median([w["box"][3] - w["box"][1] for w in words])), "h": dense or float(y1 - y0) / 2,
                    "tilt": 0.0, "text_bgr": np.median(sub[sm], axis=0).tolist(),
                    "bg_bgr": np.median(sub[white[y0:y1, x0:x1]], axis=0).tolist(), "pill": pb})
    for src, m in masks.items():
        words = tesseract(m, f"{idx}_{src}", tmp)
        for w in words:
            w["text"], w["fixed"] = fix_token(w["text"])
        lines = []
        for g in union_find(words, same_line):
            g.sort(key=lambda w: w["box"][0])
            lb = ubox([w["box"] for w in g])
            dense, tilt = line_geom(m[lb[1]:lb[3], lb[0]:lb[2]])
            box_h = float(np.median([w["box"][3] - w["box"][1] for w in g]))
            lines.append({"words": g, "box": lb, "h": box_h, "dense": dense or box_h, "tilt": tilt,
                          "text": " ".join(w["text"] for w in g)})
        for g in union_find(lines, stacked):
            # rows top to bottom; pieces of one row (a word OCR dropped splits a line) left to right
            g.sort(key=lambda l: (l["box"][1] + l["box"][3]) / 2)
            rows_ = [[g[0]]]
            for l in g[1:]:
                p = rows_[-1][-1]
                if abs((l["box"][1] + l["box"][3]) - (p["box"][1] + p["box"][3])) / 2 < 0.6 * max(l["h"], p["h"]):
                    rows_[-1].append(l)
                else:
                    rows_.append([l])
            rows_ = [sorted(r, key=lambda l: l["box"][0]) for r in rows_]
            g = [l for r in rows_ for l in r]
            row_text = tidy(" / ".join(" ".join(l["text"] for l in r) for r in rows_))
            ws = [w for l in g for w in l["words"]]
            x0, y0, x1, y1 = box = ubox([l["box"] for l in g])
            sub, sm = f[y0:y1, x0:x1], m[y0:y1, x0:x1]
            aln = sum(ch.isalnum() for w in ws for ch in w["text"])
            if sm.sum() < 20 or aln < 1 or (aln < 2 and not numeric(" ".join(w["text"] for w in ws))):
                continue
            text_col = np.median(sub[sm], axis=0)
            if src == "dark":
                pb = pill_box(white, box)
                bgm = white[y0:y1, x0:x1] & ~sm
            else:
                pb = None
                bgm = cv2.dilate(sm.view(np.uint8), K3).astype(bool) & ~sm   # the outline round the letters
            bg_col = np.median(sub[bgm], axis=0) if bgm.sum() > 10 else text_col
            out.append({"t": round(t, 3), "src": src, "text": row_text, "nwords": len(ws),
                        "nlines": len(rows_), "conf": round(float(np.mean([w["conf"] for w in ws])), 1),
                        "fixed": sum(w["fixed"] for w in ws), "box": box,
                        "cx": (x0 + x1) / 2 / FW, "cy": (y0 + y1) / 2 / FH, "box_h": float(np.median([l["h"] for l in g])),
                        "h": float(np.median([l["dense"] for l in g])), "tilt": float(np.median([l["tilt"] for l in g])),
                        "text_bgr": text_col.tolist(), "bg_bgr": bg_col.tolist(), "pill": pb})
    return out


# ---------- one pass over the video: OCR samples, per-frame thumbnails, sheet tiles, mid-beat frames ----------
step = max(1, int(round(fps / OCR_FPS)))
mid_idx = {int(round((b["w0"] + b["next"]) / 2 * fps)): b["id"] for b in beats}
thumbs, tiles, mids, futs, edge = [], {}, {}, [], []
tmp = tempfile.mkdtemp(prefix="refpack_")
pool = ThreadPoolExecutor(max_workers=10)
i = 0
while True:
    ok, f = cap.read()
    if not ok:
        break
    thumbs.append(cv2.resize(f, (36, 64), interpolation=cv2.INTER_AREA))
    if i % 3 == 0:   # split-screen probe: a thin, flat, neutral bar (the seam) across the full width, middle 60%
        sm_ = cv2.resize(f, (360, 640), interpolation=cv2.INTER_AREA)
        g = cv2.cvtColor(sm_, cv2.COLOR_BGR2GRAY).astype(np.float32)[128:512]
        sat = cv2.cvtColor(sm_, cv2.COLOR_BGR2HSV)[128:512, :, 1].mean(axis=1)
        flat = (g.std(axis=1) < 6) & (sat < 30)
        rm = g.mean(axis=1)
        bar, r0 = None, None
        for r in range(len(flat) + 1):
            if r < len(flat) and flat[r]:
                r0 = r if r0 is None else r0
            elif r0 is not None:
                # 3 to 30 px at 1920 (a seam, not a sky), standing out from the pictures on both sides
                if 1 <= r - r0 <= 10 and r0 >= 2 and r + 1 < len(flat) and min(abs(rm[r0:r].mean() - rm[r0 - 2]), abs(rm[r0:r].mean() - rm[r + 1])) > 40 \
                        and (bar is None or r - r0 > bar[1]):
                    bar = ((128 + (r0 + r) / 2) / 640, r - r0)
                r0 = None
        edge.append((i / fps, bar[0] if bar else 0.0, 1.0 if bar else 0.0))
    if i % step == 0:
        futs.append(pool.submit(read_sample, i, i / fps, f, tmp))
        while sum(not x.done() for x in futs[-40:]) > 24:   # keep memory bounded
            time.sleep(0.02)
    if i % int(round(fps)) == 0:
        tiles[i] = cv2.resize(f, (TILE_W, int(TILE_W * H0 / W0)), interpolation=cv2.INTER_AREA)
    if i in mid_idx:
        mids[mid_idx[i]] = cv2.resize(f, (90, 160), interpolation=cv2.INTER_AREA)
    i += 1
NFR = len(thumbs)
labels = sorted([l for fu in futs for l in fu.result()], key=lambda l: l["t"])
pool.shutdown()
os.rmdir(tmp)
t_ocr = time.time() - T_START
th_hsv = np.stack([cv2.cvtColor(x, cv2.COLOR_BGR2HSV) for x in thumbs])
LUMA = np.array([float(cv2.cvtColor(x, cv2.COLOR_BGR2GRAY).mean()) for x in thumbs])
SAT = th_hsv[..., 1].reshape(NFR, -1).mean(axis=1)
YEL = ((th_hsv[..., 0] >= 18) & (th_hsv[..., 0] <= 38) & (th_hsv[..., 1] > 100) & (th_hsv[..., 2] > 150)).reshape(NFR, -1).mean(axis=1)

# split screens: the seam bar held at the same height for 0.8 s or more
splits, cur = [], None
for t, y, fr in edge + [(1e9, 0, 0)]:
    if fr >= 0.9 and cur and abs(y - cur["y"]) < 0.015 and t - cur["t1"] <= 0.25:
        cur["t1"] = t
    else:
        if cur and cur["t1"] - cur["t0"] >= 0.8:
            splits.append({"t0": round(cur["t0"], 2), "t1": round(cur["t1"] + 0.1, 2), "y": round(cur["y"], 3)})
        cur = {"t0": t, "t1": t, "y": y} if fr >= 0.9 else None

# yellow highlights (a named part flashing yellow): yellow share of the frame 6+ points over its level 1 s before, 4+ frames
highlights, k0 = [], None
base = np.array([np.median(YEL[max(0, k - 30):max(1, k - 3)]) for k in range(NFR)])
hot = YEL - base >= 0.06
for k in range(NFR + 1):
    if k < NFR and hot[k]:
        k0 = k if k0 is None else k0
    elif k0 is not None:
        if k - k0 >= 4:
            if highlights and k0 / fps - highlights[-1]["t1"] <= 0.2:
                highlights[-1]["t1"] = round(k / fps, 2)
            else:
                highlights.append({"t0": round(k0 / fps, 2), "t1": round(k / fps, 2)})
            highlights[-1]["peak"] = round(max(highlights[-1].get("peak", 0), float((YEL - base)[k0:k].max())), 2)
        k0 = None

# ---------- 4b. caption band from the data, captions vs labels ----------
spoken = [(key(w[0]), w[1], w[2]) for b in beats for w in b["words"]]


def spoken_word(k, t, before=1.0, after=0.6):
    """The Scribe word with this key spoken around time t (caption shows at about the word start)."""
    c = [s for s in spoken if s[0] == k and s[1] - after <= t <= s[2] + before]
    return min(c, key=lambda s: abs(s[1] - t)) if c else None


one = [l for l in labels if l["src"] == "light" and l["nwords"] == 1 and l["nlines"] == 1 and abs(l["cx"] - 0.5) < 0.2]
cand = [l for l in one if spoken_word(key(l["text"]), l["t"])]
if len(cand) >= 10:
    cys = [l["cy"] for l in cand]
    BAND = (float(np.percentile(cys, 3)) - 0.015, float(np.percentile(cys, 97)) + 0.015)
    BAND_BOX = (float(np.percentile([l["box"][1] / FH for l in cand], 5)), float(np.percentile([l["box"][3] / FH for l in cand], 95)))
else:
    BAND, BAND_BOX = (0.62, 0.76), (0.62, 0.76)


def is_caption(l):
    """One centred word in the band. A tilted all-caps word there is a name tag sitting over the caption."""
    tag = l["text"].isupper() and sum(ch.isalpha() for ch in l["text"]) >= 3 and abs(l["tilt"]) >= 1.5
    return l["src"] == "light" and BAND[0] <= l["cy"] <= BAND[1] and abs(l["cx"] - 0.5) < 0.2 and l["nwords"] <= 2 \
        and l["nlines"] == 1 and not tag


def yellowish(bgr):
    h, s, v = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2HSV)[0, 0]
    return 15 <= h <= 35 and s > 90 and v > 150


# captions: samples in a row with the same word are one caption event (other reads may sit in between)
caps = []
for l in (l for l in labels if is_caption(l)):
    k = key(l["text"])
    c = next((c for c in reversed(caps[-4:]) if c["key"] == k and l["t"] - c["last"] <= 1.5 * step / fps), None)
    if c:
        c["last"] = l["t"]
        c["reads"].append(l)
    else:
        caps.append({"key": k, "first": l["t"], "last": l["t"], "reads": [l]})
for c in caps:
    r = max(c["reads"], key=lambda x: x["conf"])
    sw = spoken_word(c["key"], c["first"])
    c.update(text=r["text"], h=float(np.median([x["h"] for x in c["reads"]])), box_h=float(np.median([x["box_h"] for x in c["reads"]])),
             w=float(np.median([x["box"][2] - x["box"][0] for x in c["reads"]])),
             yellow=bool(sum(bool(yellowish(x["text_bgr"])) for x in c["reads"]) > len(c["reads"]) / 2),
             spoken=sw[1] if sw else None, conf=r["conf"])
caps_ok = [c for c in caps if c["spoken"] is not None]

# ---------- 4c. labels: join reads across samples into text events ----------
GAP = 3.2 * step / fps    # a label may drop out of OCR for up to two samples


def wordlike(tok):
    k, p = key(tok), plain(re.sub(r"^\W+|\W+$", "", tok))
    return k in VOCAB or any(ch.isdigit() for ch in k) or (p.isalpha() and p.isupper() and len(p) >= 3) or (p.isalpha() and len(p) >= 4)


def sim(a, b):
    ka, kb = key(a), key(b)
    if min(len(ka), len(kb)) >= 4 and (ka in kb or kb in ka):
        return 0.9
    return difflib.SequenceMatcher(None, ka, kb).ratio()


events = []
for l in (l for l in labels if not is_caption(l)):
    best, bs = None, 0.0
    for ev in events:
        if l["t"] - ev["last"] > GAP or ev["src"] != l["src"]:
            continue
        d = math.hypot(l["cx"] - ev["cx"], l["cy"] - ev["cy"])
        if d > 0.12:
            continue
        if numeric(l["text"]) and ev["numeric"]:
            s = 0.9 if d < 0.06 else 0.0      # counters match by place, not by value
        else:
            s = max(sim(l["text"], v) for v in ev["variants"])
        if s > bs:
            best, bs = ev, s
    if best and bs >= 0.6:
        best["reads"].append(l)
        best["variants"][l["text"]] += 1
        best.update(last=l["t"], cx=l["cx"], cy=l["cy"])
    else:
        events.append({"src": l["src"], "first": l["t"], "last": l["t"], "cx": l["cx"], "cy": l["cy"],
                       "reads": [l], "variants": Counter([l["text"]]), "numeric": numeric(l["text"])})

texts = []
for ev in events:
    rd = ev["reads"]
    conf = float(np.mean([r["conf"] for r in rd]))
    if ev["numeric"]:
        vals = []    # a counter: its values in the order they showed
        for r in rd:
            v = re.sub(r"^\W+", "", r["text"])
            if v and (not vals or vals[-1] != v):
                vals.append(v)
        text = " > ".join(vals[:10]) + (" > ..." if len(vals) > 10 else "")
        if len(rd) < 2 or conf < 60:
            continue
    else:
        # the reading most reads agree with: a partial read ("DA CASA") supports the full one ("FUNDAÇÃO DA CASA")
        vs = ev["variants"]
        cands = [v for v in vs if vs[v] >= max(2, 0.2 * len(rd))] or [max(vs, key=vs.get)]
        text = max(cands, key=lambda v: (sum(n for u, n in vs.items() if key(u) and key(u) in key(v)), len(key(v))))
        toks = text.replace(" / ", " ").split()
        if not ((len(rd) >= 2 and conf >= 55) or (conf >= 85 and len(key(text)) >= 4)):
            continue
        if sum(wordlike(t) for t in toks) < 0.5 * len(toks) or sum(ch.isalpha() for ch in text) < 2:
            continue
    pills = [r["pill"] for r in rd if r["pill"]]
    pill = [int(np.median([p[2] - p[0] for p in pills])), int(np.median([p[3] - p[1] for p in pills]))] if len(pills) >= max(1, len(rd) / 2) else None
    tb = np.median([r["text_bgr"] for r in rd], axis=0)
    bb = np.median([r["bg_bgr"] for r in rd], axis=0)
    texts.append({"text": text, "variants": dict(ev["variants"]), "src": ev["src"], "reads": len(rd), "conf": round(conf),
                  "t_in": round(ev["first"], 2), "t_out": round(ev["last"] + step / fps, 2),
                  "cx": round(float(np.median([r["cx"] for r in rd])), 3), "cy": round(float(np.median([r["cy"] for r in rd])), 3),
                  "w": round(float(np.median([(r["box"][2] - r["box"][0]) / FW for r in rd])), 3),
                  "hgt": round(float(np.median([(r["box"][3] - r["box"][1]) / FH for r in rd])), 3),
                  "text_h_px": int(round(np.median([r["h"] for r in rd]))), "box_h_px": int(round(np.median([r["box_h"] for r in rd]))),
                  "tilt": round(float(np.median([r["tilt"] for r in rd])), 1), "upper": text.upper() == text,
                  "box_w_px": int(round(np.median([r["box"][2] - r["box"][0] for r in rd]))),
                  "pill_px": pill, "text_hex": hexc(tb), "bg_hex": hexc(bb), "yellow": bool(yellowish(tb)),
                  "fixed_words": sum(r["fixed"] for r in rd), "beat": beat_at(ev["first"])["id"], "numeric": ev["numeric"]})

# partial reads: a text whose letters sit inside a longer text read at the same place and time is part of it;
# the same text again right after its last read is the same label sliding fast with the camera
FAMILY = {"dark": "dark", "pill": "dark", "light": "light", "vivid": "vivid", "colour": "colour"}


def part_of(x, y):
    if FAMILY[x["src"]] != FAMILY[y["src"]] or not key(x["text"]) or key(x["text"]) not in key(y["text"]):
        return False
    same_place = (abs(x["cy"] - y["cy"]) < 0.04 and y["cx"] - y["w"] / 2 - 0.02 <= x["cx"] <= y["cx"] + y["w"] / 2 + 0.02
                  and x["t_in"] <= y["t_out"] + 0.4 and y["t_in"] <= x["t_out"] + 0.4)
    sliding = key(x["text"]) == key(y["text"]) and (0 <= x["t_in"] - y["t_out"] <= 0.3 or 0 <= y["t_in"] - x["t_out"] <= 0.3)
    return same_place or sliding


keep = []
for x in sorted(texts, key=lambda x: (-len(key(x["text"])), x["t_in"])):
    host = next((y for y in keep if part_of(x, y)), None)
    if host:
        host.update(t_in=min(host["t_in"], x["t_in"]), t_out=max(host["t_out"], x["t_out"]), reads=host["reads"] + x["reads"])
    else:
        keep.append(x)
texts = keep

# kinds: what the measurements can tell apart
tag_h = [x["text_h_px"] for x in texts if x["src"] == "light" and x["yellow"]]
big = 1.6 * (np.median(tag_h) if tag_h else 60)
for x in texts:
    end = x["t_in"] >= DUR - 2.5 or ("COMENT" in plain(x["text"]).upper()) or (x["t_in"] >= DUR - max(4.0, 0.06 * DUR) and x["cy"] < 0.35)
    if end:
        x["kind"] = "end card"
    elif x["numeric"]:
        x["kind"] = "counter"
    elif x["src"] in ("dark", "pill"):
        x["kind"] = "pill" if x["pill_px"] else "dark text"
    elif x["text_h_px"] >= big:
        x["kind"] = "big title"
    elif x["yellow"]:
        x["kind"] = "name tag"
    elif x["src"] == "colour" or cv2.cvtColor(np.uint8([[[int(c) for c in reversed(bytes.fromhex(x["text_hex"][1:]))]]]), cv2.COLOR_BGR2HSV)[0, 0, 1] > 90:
        x["kind"] = "colour text"
    else:
        x["kind"] = "white text"
texts.sort(key=lambda x: x["t_in"])

# ---------- 2. shots ----------
scores = json.load(open(f"cuts/{rid}.scores.json"))["scores"]
cut_t = [round(t, 3) for t, s in scores if s > CUT]
cut_events = []
for t in cut_t:
    if cut_events and t - cut_events[-1]["t1"] <= CLUSTER_GAP:
        cut_events[-1]["t1"] = t
        cut_events[-1]["cuts"].append(t)
    else:
        cut_events.append({"t0": t, "t1": t, "cuts": [t]})


def thumb_mad(a, b):
    """Mean absolute difference of two 36x64 thumbnails (0-255): under about 24 = the same picture."""
    return float(np.abs(thumbs[a].astype(int) - thumbs[b].astype(int)).mean())


for e in cut_events:
    f0, f1 = int(round(e["t0"] * fps)), int(round(e["t1"] * fps))
    fb, fn = max(0, f0 - 3), min(NFR - 1, f0 + 1)
    # same shot: the picture before the event comes back within 1 s (a flash or strobe that decays, a jolt)
    mad = min(thumb_mad(fb, min(NFR - 1, f1 + d)) for d in (6, 12, 20, 30))
    notes = []
    if LUMA[fn] - LUMA[fb] > 40:
        notes.append("white flash" if SAT[fn] < SAT[fb] - 30 else "brightness jump")
    jumps = int(np.sum(np.abs(np.diff(LUMA[max(0, f0 - 1):min(NFR, f1 + 4)])) > 40))
    if jumps >= 3:
        notes.append(f"strobe ({jumps} jumps)")
    if SAT[f0:min(NFR, f1 + 15)].min() < 25 and SAT[fb] >= 35:
        notes.append("greyscale")
    if LUMA[f0:min(NFR, f1 + 3)].min() < 25:
        notes.append("dark frame")
    if YEL[f0:min(NFR, f1 + 4)].max() - YEL[fb] > 0.15:
        notes.append("yellow highlight")
    e.update(n=len(e["cuts"]), span=round(e["t1"] - e["t0"], 2), same_shot=bool(mad < 24), mad=round(mad, 1),
             notes=notes, beat=beat_at(e["t0"])["id"])
shot_changes = [e for e in cut_events if not e["same_shot"]]
# greyscale stretches (replays, flashbacks): mean saturation under 25 for 6+ frames
grey, run = [], None
for k in range(NFR):
    if SAT[k] < 25:
        run = [k, k] if run is None else [run[0], k]
    else:
        if run and run[1] - run[0] >= 5:
            grey.append([round(run[0] / fps, 2), round((run[1] + 1) / fps, 2)])
        run = None
if run and run[1] - run[0] >= 5:
    grey.append([round(run[0] / fps, 2), round((run[1] + 1) / fps, 2)])

# ---------- 3. camera ----------
mpath = f"motion/{rid}.frames.json"
if not os.path.exists(mpath):
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "frame_motion.py"), rid], check=True)
rows = json.load(open(mpath))
MW, MH = 360, int(H0 * 360 / W0)
for r in rows:
    if "z" in r:   # where the frame centre goes: pan without the zoom's pull towards the top-left origin
        a, b = r["z"] * math.cos(math.radians(r["rot"])), r["z"] * math.sin(math.radians(r["rot"]))
        r["ex"] = (a * MW / 2 - b * MH / 2 + r["dx"] * MW - MW / 2) / MW
        r["ey"] = (b * MW / 2 + a * MH / 2 + r["dy"] * MH - MH / 2) / MH


def accumulate(f0, f1):
    """Zoom factor and view pan (share of frame; +x = view moves right, +y = view moves down) over frames f0..f1-1."""
    z, px, py, rot = 1.0, 0.0, 0.0, 0.0
    for r in rows[f0:f1]:
        if "z" in r:
            z *= r["z"]
            px -= r["ex"]
            py -= r["ey"]
            rot += r["rot"]
    return z, px, py, rot


def pct(v):
    """A share as a whole percent, clipped at 100 (a whip that sweeps past a whole frame only keeps its direction)."""
    return "100+" if abs(v) > 1 else f"{abs(v) * 100:.0f}"


def move_tok(z, px, py, rot, zt=0.03, pt=0.03):
    p = []
    if abs(z - 1) >= zt:
        p.append(("in+200+" if z > 3 else f"in+{(z - 1) * 100:.0f}") if z > 1 else f"out{(z - 1) * 100:.0f}")
    if abs(px) >= pt:
        p.append(f"{'R' if px > 0 else 'L'}{pct(px)}")
    if abs(py) >= pt:
        p.append(f"{'D' if py > 0 else 'U'}{pct(py)}")
    if abs(rot) >= 3:
        p.append(f"roll{rot:+.0f}")
    return " ".join(p)


# fast moves grouped exactly as frame_motion.py does (fast runs, gaps of 1 to 2 frames merged, 3+ frames)
runs = []
for r in rows:
    if runs and runs[-1]["k"] == r["k"]:
        runs[-1]["n"] += 1
    else:
        runs.append({"k": r["k"], "f0": r["f"], "n": 1})
mv = []
for ru in runs:
    if ru["k"] == "fast" and ru["n"] >= 2:
        if mv and ru["f0"] - (mv[-1]["f0"] + mv[-1]["n"]) <= 2:
            mv[-1]["n"] = ru["f0"] + ru["n"] - mv[-1]["f0"]
        else:
            mv.append(dict(ru))
moves = []
for m in (m for m in mv if m["n"] >= 3):
    z, px, py, rot = accumulate(m["f0"], m["f0"] + m["n"])
    fr = [r for r in rows[m["f0"]:m["f0"] + m["n"]] if "z" in r]
    # a whip: in one frame the view slides over 12% of the frame or the scale jumps over 12% (motion blur, few
    # matched features, so its size is rough and only the direction is solid)
    whip = any(max(abs(r["ex"]), abs(r["ey"])) > 0.12 or abs(r["z"] - 1) > 0.12 for r in fr)
    tok = move_tok(z, px, py, rot) or "jolt"
    kind = "whip" if whip else "push" if z >= 1.03 else "pull" if z <= 0.97 else "pan" if max(abs(px), abs(py)) >= 0.03 else "jolt"
    if whip:
        tok = "whip " + tok.replace("jolt", "and back")
    moves.append({"t": round(m["f0"] / fps, 2), "dur": round(m["n"] / fps, 2), "f0": m["f0"], "n": m["n"], "kind": kind,
                  "zoom": round(z, 3), "pan_x": round(px, 3), "pan_y": round(py, 3), "roll": round(rot, 1), "tok": tok})
# rest segments: everything between moves and cuts, called a hold or a drift
in_move = np.zeros(len(rows), bool)
for m in moves:
    in_move[m["f0"]:m["f0"] + m["n"]] = True
segs, s0 = [], None
for k, r in enumerate(rows + [{"k": "cut"}]):
    free = k < len(rows) and not in_move[k] and r["k"] != "cut"
    if free and s0 is None:
        s0 = k
    elif not free and s0 is not None:
        if k - s0 >= int(0.3 * fps):
            z, px, py, rot = accumulate(s0, k)
            tok = move_tok(z, px, py, rot, 0.04, 0.04)
            unk = sum(1 for r2 in rows[s0:k] if r2["k"] == "?")
            segs.append({"t": round(s0 / fps, 2), "dur": round((k - s0) / fps, 2), "f0": s0, "n": k - s0,
                         "kind": "drift" if tok else "hold", "tok": tok, "zoom": round(z, 3), "pan_x": round(px, 3),
                         "pan_y": round(py, 3), "untracked": unk})
        s0 = None
counts = Counter(r["k"] for r in rows)
share = {k: round(counts.get(k, 0) / len(rows), 3) for k in ("hold", "slow", "fast", "cut", "?")}
mdur = [m["dur"] for m in moves]
starts = [m["t"] for m in moves]
holds = [s["dur"] for s in segs if s["kind"] == "hold"]
cam_stats = {
    "share_of_frames": share, "moves": len(moves), "moves_per_10s": round(len(moves) / DUR * 10, 1),
    "move_dur_median": round(float(np.median(mdur)), 2) if mdur else 0, "move_dur_p90": round(float(np.percentile(mdur, 90)), 2) if mdur else 0,
    "by_kind": dict(Counter(m["kind"] for m in moves)),
    "push_median_pct": round(float(np.median([(m["zoom"] - 1) * 100 for m in moves if m["kind"] == "push"])), 0) if any(m["kind"] == "push" for m in moves) else None,
    "pull_median_pct": round(float(np.median([(m["zoom"] - 1) * 100 for m in moves if m["kind"] == "pull"])), 0) if any(m["kind"] == "pull" for m in moves) else None,
    "pan_median_pct": round(float(np.median([max(abs(m["pan_x"]), abs(m["pan_y"])) * 100 for m in moves if m["kind"] == "pan"])), 0) if any(m["kind"] == "pan" for m in moves) else None,
    "gap_between_move_starts_median": round(float(np.median(np.diff(starts))), 2) if len(starts) > 1 else None,
    "hold_median": round(float(np.median(holds)), 2) if holds else None, "hold_longest": max(holds) if holds else None,
    "drifts": sum(1 for s in segs if s["kind"] == "drift"),
}

# ---------- 6. colour per beat ----------
cv2.setRNGSeed(7)
CRIT = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)


def palette(px, k):
    px = px.reshape(-1, 3).astype(np.float32)
    _, lab, cen = cv2.kmeans(px, k, None, CRIT, 3, cv2.KMEANS_PP_CENTERS)
    cnt = np.bincount(lab.ravel(), minlength=k)
    order = np.argsort(-cnt)
    return [[hexc(cen[o]), round(float(cnt[o] / cnt.sum()), 2)] for o in order]


for b in beats:
    f0, f1 = int(b["w0"] * fps), min(NFR, int(b["next"] * fps))
    m = mids.get(b["id"])
    b["palette"] = palette(m, 3) if m is not None else []
    b["luma_mid"] = round(float(cv2.cvtColor(m, cv2.COLOR_BGR2GRAY).mean())) if m is not None else None
    b["luma_mean"] = round(float(LUMA[f0:f1].mean())) if f1 > f0 else None
    b["sat_mean"] = round(float(SAT[f0:f1].mean())) if f1 > f0 else None
reel_palette = palette(np.concatenate([m.reshape(-1, 3) for m in mids.values()]), 6) if mids else []

# ---------- contact sheet ----------
sheets = []
keys_ = sorted(tiles)
for p in range(0, len(keys_), COLS * ROWS):
    grp = []
    for fi in keys_[p:p + COLS * ROWS]:
        tl = tiles[fi].copy()
        lab = f"{fi / fps:.0f}s {beat_at(fi / fps)['id']}"
        cv2.rectangle(tl, (0, 0), (len(lab) * 9 + 6, 18), (0, 0, 0), -1)
        cv2.putText(tl, lab, (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
        grp.append(tl)
    while len(grp) < COLS * ROWS:
        grp.append(np.zeros_like(grp[0]))
    img = np.vstack([np.hstack(grp[r * COLS:(r + 1) * COLS]) for r in range(ROWS)])
    if p + COLS * ROWS >= len(keys_):   # crop the empty rows of the last image
        used = math.ceil((len(keys_) - p) / COLS)
        img = img[:used * grp[0].shape[0]]
    name = f"packs/{rid}.sheet1.jpg" if p == 0 else f"packs/{rid}.sheet1_{p // (COLS * ROWS) + 1:02d}.jpg"
    cv2.imwrite(name, img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    sheets.append(name)

# ---------- per-beat joins ----------
for b in beats:
    inb = lambda t: b["w0"] <= t < b["next"]
    b["moves"] = [m for m in moves if inb(m["t"])]
    b["segs"] = [s for s in segs if inb(s["t"])]
    b["cut_events"] = [e for e in cut_events if inb(e["t0"])]
    b["texts"] = [x for x in texts if inb(x["t_in"]) and x["kind"] != "end card"] + [x for x in texts if inb(x["t_in"]) and x["kind"] == "end card"]
    f0, f1 = int(b["w0"] * fps), min(len(rows), int(b["next"] * fps))
    b["still"] = round(sum(1 for r in rows[f0:f1] if r["k"] == "hold") / max(1, f1 - f0), 2)
    b["yellow_caps"] = [c["text"] for c in caps_ok if c["yellow"] and inb(c["first"])]
    b["splits"] = [s for s in splits if inb(s["t0"])]
    b["highlights"] = [h for h in highlights if inb(h["t0"])]
    b["grey"] = [g for g in grey if inb(g[0])]


def pic_events(b):
    """Cuts, split screens, greyscale stretches and yellow highlights that start in this beat, in time order."""
    ev = [(e["t0"], "cut " + cut_str(e)) for e in b["cut_events"]]
    ev += [(s["t0"], f"split {s['t0']:.1f}-{s['t1']:.1f} at y {s['y']:.2f}") for s in b["splits"]]
    ev += [(g[0], f"grey {g[0]:.1f}-{g[1]:.1f}") for g in b["grey"]]
    ev += [(h["t0"], f"yellow {h['t0']:.1f}-{h['t1']:.1f}") for h in b["highlights"]]
    return "; ".join(x[1] for x in sorted(ev)) or "-"


def cut_str(e):
    if e["n"] == 1:
        s = f"{e['t0']:.1f}"
    else:
        s = f"{e['t0']:.1f}-{e['t1']:.1f} x{e['n']}"
    short_note = {"white flash": "flash", "brightness jump": "brighter", "greyscale": "grey", "dark frame": "dark", "yellow highlight": "yellow"}
    tags = (["same shot"] if e["same_shot"] else []) + [short_note.get(n, n.split()[0]) for n in e["notes"]]
    return s + (f" ({', '.join(tags)})" if tags else "")


def cam_line(b):
    items = sorted([(m["t"], f"{m['t']:.1f} {m['tok']} {m['dur']:.2f}s") for m in b["moves"]] +
                   [(s["t"], f"{s['kind']} {s['tok'] + ' ' if s['tok'] else ''}{s['dur']:.1f}s") for s in b["segs"]] +
                   [(e["t0"], f"CUT {cut_str(e)}") for e in b["cut_events"]])
    return " · ".join(x[1] for x in items)


def cam_short(b):
    ms = b["moves"]
    if not ms:
        return f"still {b['still'] * 100:.0f}%, no fast move"
    return f"{len(ms)}: " + ", ".join(f"{m['tok']}@{m['t']:.1f}" for m in ms) + f"; still {b['still'] * 100:.0f}%"


# ---------- write JSON ----------
runtime = round(time.time() - T_START, 1)
nwords = sum(len(b["words"]) for b in beats)
pack = {
    "id": rid, "made": time.strftime("%Y-%m-%d %H:%M"), "tool": "tools/ref_pack.py", "runtime_s": runtime, "ocr_s": round(t_ocr, 1),
    "video": {"w": W0, "h": H0, "fps": fps, "frames": NFR, "duration": round(DUR, 2)},
    "ocr": {"lang": LANG, "fps": round(fps / step, 2), "samples": len(futs), "reads": len(labels)},
    "beats": [{k: b[k] for k in ("id", "start", "end", "slot", "text", "audio", "words", "palette", "luma_mid", "luma_mean", "sat_mean", "still", "yellow_caps")}
              | {"moves": [m["t"] for m in b["moves"]], "camera": cam_line(b), "picture_events": pic_events(b),
                 "texts": [x["text"] for x in b["texts"]]} for b in beats],
    "cuts": cut_t, "cut_events": cut_events, "greyscale": grey, "splits": splits, "yellow_highlights": highlights,
    "camera": {"stats": cam_stats, "moves": moves, "segments": segs},
    "caption": {"band_centre_y": [round(BAND[0], 3), round(BAND[1], 3)], "band_box_y": [round(BAND_BOX[0], 3), round(BAND_BOX[1], 3)],
                "events": [{k: c[k] for k in ("text", "first", "last", "spoken", "h", "box_h", "w", "yellow", "conf")} for c in caps]},
    "texts": texts, "reel_palette": reel_palette, "sheets": sheets,
}
json.dump(pack, open(f"packs/{rid}.json", "w"), ensure_ascii=False, indent=1)

# ---------- write MD ----------
L = []
P = L.append
P(f"# Reference pack: {rid}")
P("")
P(f"Made by `tools/ref_pack.py` on {pack['made']}, all by script (Scribe words, scene scores, ORB camera motion, tesseract), no image reading. "
  f"Times in seconds from the reel start. On-screen sizes in px at {FW}x{FH}. Full data: `packs/{rid}.json`. "
  f"The look at 1 fps: {', '.join('`' + s + '`' for s in sheets)} (tiles {TILE_W} px, labelled with second and beat).")
P("")
P("Camera tokens: `in+39` push in to 1.39x scale; `out-30` pull out to 0.70x; `R12`/`L12` the view pans right/left by 12% of the frame width; "
  "`U8`/`D8` the view tilts up/down by 8% of the frame height; `roll+5` degrees; `jolt` a fast move with little net change (shake, wipe). "
  "`whip` a very fast move (over 12% of the frame or 12% scale in one frame, blurred): trust its direction, its size is rough and clipped at `100+`. "
  "`@8.3` start time. A fast move = zoom or pan faster than 0.6% of the frame per frame for 3+ frames; hold/drift = the time between moves.")
P("")
P("## At a glance")
P("")
wpm = nwords / DUR * 60
P(f"- {DUR:.1f} s, {W0}x{H0} {fps:.0f} fps. {len(beats)} sentences, {nwords} words, {wpm:.0f} words a minute. Audio events: "
  + (", ".join(f"{a[0]} {a[1]:.1f}" for b in beats for a in b["audio"]) or "none") + ".")
P(f"- Cuts: {len(cut_t)} hard cuts in {len(cut_events)} events ({sum(1 for e in cut_events if e['n'] > 1)} clusters); "
  f"{len(shot_changes)} change the picture, {len(cut_events) - len(shot_changes)} return to the same shot. "
  f"Mean shot {DUR / (len(shot_changes) + 1):.1f} s by picture changes ({DUR / (len(cut_t) + 1):.1f} s by raw cuts). "
  f"{len(splits)} split screens ({sum(s['t1'] - s['t0'] for s in splits):.1f} s), {len(grey)} greyscale stretches, {len(highlights)} yellow highlights.")
cs = cam_stats
P(f"- Camera: still {share['hold'] * 100:.0f}% of frames, slow drift {share['slow'] * 100:.0f}%, fast {share['fast'] * 100:.0f}%, untracked {share['?'] * 100:.1f}%. "
  f"{cs['moves']} fast moves ({cs['moves_per_10s']} per 10 s), median {cs['move_dur_median']} s (p90 {cs['move_dur_p90']} s); "
  f"{cs['by_kind'].get('push', 0)} pushes (median +{cs['push_median_pct'] or 0:.0f}%), {cs['by_kind'].get('pull', 0)} pulls (median {cs['pull_median_pct'] or 0:.0f}%), "
  f"{cs['by_kind'].get('pan', 0)} pans (median {cs['pan_median_pct'] or 0:.0f}%), {cs['by_kind'].get('whip', 0)} whips, {cs['by_kind'].get('jolt', 0)} jolts. "
  f"A move starts every {cs['gap_between_move_starts_median']} s (median); holds median {cs['hold_median']} s, longest {cs['hold_longest']} s; {cs['drifts']} drifts.")
P("- Reel palette (k=6 over the beat mid-frames): " + ", ".join(f"{h} {s * 100:.0f}%" for h, s in reel_palette) + ".")
ycap = [c for c in caps_ok if c["yellow"]]
P(f"- Text: {len(texts)} on-screen text events besides the captions (" + ", ".join(f"{n} {k}" for k, n in Counter(x['kind'] for x in texts).most_common()) + "). "
  f"Caption band: word boxes y {BAND_BOX[0]:.2f}-{BAND_BOX[1]:.2f} of the frame, centred.")
P("")
P("## Per beat")
P("")
P("Picture events: `cut` (with what the frames inside it do, see Shots), `split` a top/bottom split screen with its seam height, "
  "`grey` a greyscale stretch (replay or flashback), `yellow` a yellow highlight (a named part flashing yellow). luma = the beat's mean brightness 0-255.")
P("")
P("| beat | time (slot) | sentence (PT) | camera: fast moves | picture events | text on screen (kind, in) | luma |")
P("|---|---|---|---|---|---|---|")
for b in beats:
    tx = "; ".join(f"{x['text']} ({x['kind']} {x['t_in']:.1f})" for x in b["texts"]) or "-"
    P(f"| {b['id']} | {b['start']:.1f}-{b['end']:.1f} ({b['slot']:.1f}) | {short(b['text'])} | {cam_short(b)} | {pic_events(b)} | {tx} | {b['luma_mean']} |")
P("")
P("## Beat detail: full sentence, audio events, camera")
P("")
P("Speech start-end and slot (to the next sentence). Camera over the beat's window (its start to the next start): fast moves as "
  "`time token duration`, the time between them as `hold` or `drift token`, cuts as `CUT`.")
P("")
for b in beats:
    au = (" Audio: " + ", ".join(f"{a[0]} {a[1]:.2f}-{a[2]:.2f}" for a in b["audio"]) + ".") if b["audio"] else ""
    P(f"- **{b['id']}** {b['start']:.2f}-{b['end']:.2f}, slot {b['slot']:.2f}: {short(b['text'], 10000)}{au} "
      f"Camera {b['w0']:.1f}-{b['next']:.1f}: {cam_line(b) or 'no tracked motion'}.")
P("")
P("## Shots")
P("")
P(f"Hard cut = scene score over {CUT}; cuts under {CLUSTER_GAP:.0f} s apart are one event. \"same shot\" = the picture after the event matches the one before it "
  "(a flash, shake, rewind or insert, not a new shot). Notes: what the frames inside the event do.")
P("")
for e in cut_events:
    what = "one cut" if e["n"] == 1 else f"cluster of {e['n']} cuts over {e['span']:.2f} s ({', '.join(f'{c:.2f}' for c in e['cuts'])})"
    P(f"- {e['t0']:.2f} [{e['beat']}]: {what}; {'same shot after' if e['same_shot'] else 'new picture after'}"
      + (f"; {', '.join(e['notes'])}" if e["notes"] else "") + ".")
P("")
P("Split screens (seam height as a share of the frame): " + (", ".join(f"{s['t0']:.1f}-{s['t1']:.1f} at y {s['y']:.2f}" for s in splits) or "none") + ". "
  "Greyscale stretches: " + (", ".join(f"{g[0]:.1f}-{g[1]:.1f}" for g in grey) or "none") + ". "
  "Yellow highlights: " + (", ".join(f"{h['t0']:.1f}-{h['t1']:.1f}" for h in highlights) or "none") + ".")
P("")
P("## On-screen text (labels)")
P("")
P("By kind: pill = dark text on a white pill (box = the pill); name tag = yellow letters with a dark outline; big title = letters over "
  f"{big:.0f} px; white text = other white outlined text; colour text = red, blue... letters with an outline; counter = a number that changes in place (values in order); end card = CTA and closing text. Centre and box as a share of the frame "
  "(box = the text's own bounding box, tilt included). letter h = height of the letters with the tilt removed and accents and descenders "
  "left out: cap height for upper case, about x-height for lower case. tilt + = rises to the right. text/bg = letter colour and outline or pill colour.")
P("")
P("| in-out | text | kind | centre x,y | box w x h | letter h px | tilt | box w px | text / bg |")
P("|---|---|---|---|---|---|---|---|---|")
for x in texts:
    bw = x["pill_px"][0] if x["pill_px"] else x["box_w_px"]
    P(f"| {x['t_in']:.1f}-{x['t_out']:.1f} | {x['text']} | {x['kind']} | {x['cx']:.2f},{x['cy']:.2f} | {x['w']:.2f} x {x['hgt']:.2f} | "
      f"{x['text_h_px']} | {x['tilt']:+.0f} | {bw} | {x['text_hex']} / {x['bg_hex']} |")
P("")
off = [c["first"] - c["spoken"] for c in caps_ok]
# cap height of the captions: the word box of words with no descender and no accent (a capital starts each word)
cap_clean = [c for c in caps_ok if len(c["text"]) >= 3 and not re.search(r"[gjpqy]|[^\x00-\x7f]", c["text"])]
cap_h = [c["box_h"] for c in cap_clean]
P(f"**Captions** ({len(caps)} caption reads joined, {len(caps_ok)} matched to a Scribe word): one word at a time, box y {BAND_BOX[0]:.2f}-{BAND_BOX[1]:.2f}, "
  f"cap height median {np.median(cap_h) if cap_h else 0:.0f} px ({len(cap_h)} words with no descender or accent), "
  f"x-height median {np.median([c['h'] for c in caps_ok]) if caps_ok else 0:.0f} px, word box height median {np.median([c['box_h'] for c in caps_ok]) if caps_ok else 0:.0f} px, "
  f"word box width median {np.median([c['w'] for c in caps_ok]) if caps_ok else 0:.0f} px; "
  f"{sum(1 for c in caps_ok if c['text'][:1].isupper() and not c['text'].isupper())} Title Case, {sum(1 for c in caps_ok if c['text'].isupper())} UPPER. "
  f"First seen a median {np.median(off) if off else 0:+.2f} s from the word start (5 fps sampling, so +-0.1 s). "
  f"Yellow caption words ({len(ycap)}): " + (", ".join(f"{c['text']} {c['first']:.1f}" for c in ycap) or "none") + ".")
P("")
P("## Label sizes (px at 1080 wide)")
P("")
P("letter h as above. font px = the font size that gives this letter height in a Montserrat-like face (cap height 0.70 em, x-height 0.52 em). "
  "box w = pill width for pills, text width otherwise; box h = pill height for pills, the tilted text box otherwise.")
P("")
P("| kind | n | letter h median (range) | font px | tilt | box w median (range) | box h median | text / bg colours |")
P("|---|---|---|---|---|---|---|---|")
if cap_h:
    P(f"| caption (cap-height) | {len(cap_h)} | {np.median(cap_h):.0f} ({min(cap_h):.0f}-{max(cap_h):.0f}) | {np.median(cap_h) / 0.70:.0f} | 0 | "
      f"{np.median([c['w'] for c in caps_ok]):.0f} ({min(c['w'] for c in caps_ok):.0f}-{max(c['w'] for c in caps_ok):.0f}) | "
      f"{np.median([c['box_h'] for c in caps_ok]):.0f} | white{', yellow on naming words' if ycap else ''} |")
for k in ("pill", "name tag", "big title", "white text", "colour text", "dark text", "counter", "end card"):
    g = [x for x in texts if x["kind"] == k]
    if not g:
        continue
    hs = [x["text_h_px"] for x in g]
    ws = [x["pill_px"][0] if x["pill_px"] else x["box_w_px"] for x in g]
    bh = [x["pill_px"][1] for x in g if x["pill_px"]] or [int(x["hgt"] * FH) for x in g]
    upper = sum(x["upper"] for x in g) >= len(g) / 2
    cols = Counter(f"{x['text_hex']} / {x['bg_hex']}" for x in g).most_common(2)
    P(f"| {k} ({'cap' if upper else 'x'}-height) | {len(g)} | {np.median(hs):.0f} ({min(hs)}-{max(hs)}) | {np.median(hs) / (0.70 if upper else 0.52):.0f} | "
      f"{np.median([x['tilt'] for x in g]):+.0f} | {np.median(ws):.0f} ({min(ws)}-{max(ws)}) | {np.median(bh):.0f} | " + ", ".join(c for c, _ in cols) + " |")
P("")
P("## Colour per beat")
P("")
P("Three dominant colours of the mid-beat frame (k-means, share), its luma (0-255), and the beat's mean luma and saturation.")
P("")
P("| beat | mid t | colours | luma mid | luma beat | sat beat |")
P("|---|---|---|---|---|---|")
for b in beats:
    P(f"| {b['id']} | {(b['w0'] + b['next']) / 2:.1f} | " + ", ".join(f"{h} {s * 100:.0f}%" for h, s in b["palette"]) +
      f" | {b['luma_mid']} | {b['luma_mean']} | {b['sat_mean']} |")
P("")
P(f"OCR: tesseract {LANG} on {len(futs)} frames ({fps / step:.0f} fps), {len(labels)} raw reads; accents restored from the transcript's words where an OCR word matched one. "
  f"Text times are from 5 fps samples (+-0.1 s); counter values can be off by a digit. Not reported: icons and badges (pause, rewind, "
  f"X, check), arrows, text under about 15 px or without an outline or pill. frame_motion counts split-screen wipes, shakes and fast "
  f"object motion as camera moves. Runtime {runtime:.0f} s.")
open(f"packs/{rid}.md", "w").write("\n".join(L) + "\n")
print(f"packs/{rid}.md ({len(L)} lines), packs/{rid}.json, {', '.join(sheets)}; {len(texts)} text events, {len(caps)} captions, "
      f"{len(cut_events)} cut events, {len(moves)} moves; OCR {t_ocr:.0f} s, total {time.time() - T_START:.0f} s")
