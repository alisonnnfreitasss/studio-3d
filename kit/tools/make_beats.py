#!/usr/bin/python3
"""beats.json: one row per spoken sentence of the reference (topic.json "ref"), its timing from the Scribe transcript,
the Portuguese as heard (their page's name left out), and our English line for the same beat (the reel's lines.py: EN and DROP). Prints the slot check.
A topic-first reel (no "ref") takes one row per line of lines.py, with its slot estimated from the words; voice.py places it by the take.

Run from the reel: /usr/bin/python3 ../kit/tools/make_beats.py
"""
import json
import re
import sys

from common import HERE, REF, REF_TRANSCRIPT, lines

# their sign-off names their page: kept out of everything we write (the shot map page shows the Portuguese)
PAGE = re.compile(r"$^", re.I)

L = lines()
EN, DROP = L["EN"], L["DROP"]
WPS = 2.9                       # the kit's reels speak about this many words a second


def from_lines():
    """Topic-first: the script alone gives the beats."""
    todo = [i + 1 for i, (_, en) in enumerate(EN) if en.strip().upper() == "TODO"]
    if not EN or todo:
        sys.exit(f"lines.py: {len(todo) or 'no'} lines written yet" if not todo else f"lines.py: {len(todo)} lines still TODO (b{todo[0]:02d} first)")
    rows, t = [], 0.0
    for i, (scene, en) in enumerate(EN):
        slot = len(en.split()) / WPS + 0.25
        rows.append({"id": f"b{i + 1:02d}", "scene": scene, "ptStart": round(t, 2), "ptEnd": round(t + slot - 0.25, 2), "slot": round(slot, 2),
                     "pt": "", "en": en[0].upper() + en[1:], "enWords": len(en.split())})
        t += slot
    (HERE / "beats.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(len(rows), "beats,", sum(len(r["en"]) for r in rows), "characters,", sum(r["enWords"] for r in rows), f"words, about {t:.1f} s")
    sys.exit(0)


if not REF:
    from_lines()
if not REF_TRANSCRIPT.exists():
    sys.exit(f"no transcript: {REF_TRANSCRIPT} (Scribe word-level transcript of the reference, about US$0.01: ask first)")

d = json.loads(REF_TRANSCRIPT.read_text())
ws = [w for w in d["words"] if w.get("type") == "word"]
sent, cur = [], []
for w in ws:
    cur.append(w)
    if w["text"].endswith((".", "?", "!")):
        sent.append(cur)
        cur = []
if cur:
    sent.append(cur)
if len(sent) != len(EN):
    sys.exit(f"lines.py has {len(EN)} lines, the reference {len(sent)} sentences: one English line per Portuguese sentence")
todo = [i + 1 for i, (_, en) in enumerate(EN) if en.strip().upper() == "TODO"]
if todo:
    sys.exit(f"lines.py: {len(todo)} lines still TODO (b{todo[0]:02d} first)")
rows = []
for i, (s, (scene, en)) in enumerate(zip(sent, EN)):
    nxt = sent[i + 1][0]["start"] if i + 1 < len(sent) else s[-1]["end"] + 0.4
    pt = PAGE.sub("[nome da conta]", " ".join(w["text"] for w in s))
    bid = f"b{i + 1:02d}"
    kept = " ".join(en.split()[DROP.get(bid, 0):])
    kept = kept[0].upper() + kept[1:]
    row = {"id": bid, "scene": scene, "ptStart": round(s[0]["start"], 2), "ptEnd": round(s[-1]["end"], 2),
           "slot": round(nxt - s[0]["start"], 2), "pt": pt, "en": kept, "enWords": len(kept.split())}
    if bid in DROP:
        row.update(take=en, drop=DROP[bid])
    rows.append(row)
out = HERE / "beats.json"
out.write_text(json.dumps(rows, indent=1, ensure_ascii=False))
chars = sum(len(r["en"]) for r in rows)
print(len(rows), "beats,", chars, "EN characters,", sum(r["enWords"] for r in rows), "EN words")
for r in rows:
    need = r["enWords"] / 2.9
    flag = "  <- tight" if need > r["slot"] + 0.3 else ""
    print(f'{r["id"]} {r["ptStart"]:6.2f} slot {r["slot"]:4.1f}s  ~{need:3.1f}s  {r["en"]}{flag}')
