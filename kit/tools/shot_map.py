#!/usr/bin/python3
"""The shot map: every beat of the film with a still, what the camera does, what appears on screen, the line in both
languages and a note box. Built from the probe (shot_map.mjs), so it reflects the code as it is, before any render.

Writes, in the reel's renders/shotmap/:
  shots.json         one row per beat (times, scene, camera moves, on-screen items, lines)
  SHOTS.md           the same as a table
  page/index.html    the page published as an artifact (notes per beat in db collection "feedback")
  page/shots/*.jpg, page/ref/*.jpg   our still and the reference still per beat (reference: private)
Scene titles come from the reel's lines.py (SCENES).

Run from the reel: node ../kit/tools/shot_map.mjs && /usr/bin/python3 ../kit/tools/shot_map.py
"""
import json, math, re, subprocess

from common import HERE, REF_VIDEO, SLUG, TITLE, TOOLS, ref_duration, scene_titles

OUT = HERE / "renders/shotmap"
TITLES = scene_titles("en")
# what each overlay type of the text layer is called on the page (the approved reels' types; an unknown type shows as itself)
KIND = {"pill": "label", "tag": "name tag", "badge": "badge", "hdr": "big header", "chips": "step chips", "dial": "dial", "gauge": "gauge",
        "card": "card", "onom": "sound word", "qq": "??? over the lead", "cta": "comment ask", "wm": "watermark", "arrow": "arrow",
        "num": "number", "neq": "≠ sign", "label": "small label", "dim": "dimension line", "rewind": "rewind", "arc": "loop arrow",
        "speedo": "speed gauge", "tint": "frost", "thermo": "thermometer", "melt": "melting-metals card", "bubble": "speech bubble",
        "energy": "energy bar", "snow": "snowflake", "clock": "clock", "phase": "liquid-to-gas card", "pgauge": "pressure gauge",
        "wtherm": "wall thermometer", "bill": "power bill", "boom": "BOOM burst", "cal": "calendar page", "rew": "rewind icon",
        "squig": "wavy arrow"}


def cam_stats(v):
    p, l = v["p"], v["l"]
    dx, dy, dz = p[0] - l[0], p[1] - l[1], p[2] - l[2]
    d = math.sqrt(dx * dx + dy * dy + dz * dz)
    return {"d": d, "az": math.degrees(math.atan2(dx, dz)), "el": math.degrees(math.asin(dy / d)) if d else 0, "l": l, "fov": v["fov"]}


def describe_camera(samples, step):
    """Segments of hold and move from the first view's camera, as plain words."""
    if not samples:
        return [], False
    split = any(len(s["views"]) > 1 for s in samples)
    st = [cam_stats(s["views"][0]) for s in samples]
    segs = []
    for i in range(len(st)):
        kind = "hold"
        if i > 0:
            a, b = st[i - 1], st[i]
            if samples[i].get("shot") != samples[i - 1].get("shot"):
                kind = "cut"
            else:
                rate_d = abs(b["d"] / a["d"] - 1) / step
                rate_l = math.dist(a["l"], b["l"]) / a["d"] / step
                rate_a = abs((b["az"] - a["az"] + 180) % 360 - 180) / step
                if rate_d > 0.12 or rate_l > 0.12 or rate_a > 14:
                    kind = "move"
        if kind == "cut":
            segs.append({"k": "cut", "i0": i, "i1": i})
            segs.append({"k": "hold", "i0": i, "i1": i})
        elif segs and segs[-1]["k"] == kind:
            segs[-1]["i1"] = i
        else:
            segs.append({"k": kind, "i0": i, "i1": i})
    # merge blips shorter than 0.25 s into the previous segment
    clean = []
    for s in segs:
        n = (s["i1"] - s["i0"] + 1) * step
        if clean and s["k"] != "cut" and n < 0.25 and clean[-1]["k"] != "cut":
            clean[-1]["i1"] = s["i1"]
        elif clean and clean[-1]["k"] == s["k"] and s["k"] != "cut":
            clean[-1]["i1"] = s["i1"]
        else:
            clean.append(dict(s))
    words = []
    for s in clean:
        if s["k"] == "cut":
            words.append("cut")
            continue
        a, b = st[s["i0"]], st[s["i1"]]
        n = (s["i1"] - s["i0"] + 1) * step
        z = a["d"] / b["d"] if b["d"] else 1
        orbit = (b["az"] - a["az"] + 180) % 360 - 180
        tilt = b["el"] - a["el"]
        travel = math.dist(a["l"], b["l"]) / max(a["d"], 1)
        parts = []
        if z > 1.5:
            parts.append(f"push in {z:.1f}×")
        elif z > 1.04:
            parts.append(f"push in {round((z - 1) * 100)}%")
        elif z < 1 / 1.5:
            parts.append(f"pull out {1 / z:.1f}×")
        elif z < 0.96:
            parts.append(f"pull out {round((1 - z) * 100)}%")
        if abs(orbit) >= 5:
            parts.append(f"orbit {abs(round(orbit))}° {'right' if orbit > 0 else 'left'}")
        if abs(tilt) >= 4:
            parts.append(f"tilt {'up' if tilt < 0 else 'down'} {abs(round(tilt))}°")
        tracking = s["k"] == "move" and not parts and travel > 0.12 and n > 1.5
        if travel > 0.12 and not tracking:
            parts.append("reframe")
        if tracking:
            words.append(f"track with the action ({n:.1f} s)")
        elif s["k"] == "move":
            words.append(f"{' + '.join(parts) or 'reframe'} ({n:.1f} s)")
        else:
            drift = f", drift {parts[0]}" if parts else ""
            words.append(f"hold {n:.1f} s{drift}")
    # drop a leading "hold 0.1 s" after a cut
    words = [w for w in words if not w.startswith("hold 0.1 s")]
    return words, split


def main():
    probe = json.loads((OUT / "probe.json").read_text())
    step, samples = probe["step"], probe["samples"]
    beats = json.loads((HERE / "beats.json").read_text())
    tl = {b["id"]: b for b in json.loads((HERE / "timeline.json").read_text())["beats"]}
    rows = []
    for k, b in enumerate(beats):
        t0 = tl[b["id"]]["start"] if k else 0.0
        t1 = tl[beats[k + 1]["id"]]["start"] if k + 1 < len(beats) else probe["duration"]
        ss = [s for s in samples if t0 <= s["t"] < t1]
        cam, split = describe_camera(ss, step)
        seen, items = set(), []
        for s in ss:
            for o in s["overlays"]:
                if o["type"] == "line" or o["id"] in seen:
                    continue
                if o["t0"] < t0 - 0.12:          # on screen since an earlier beat: listed there
                    seen.add(o["id"])
                    continue
                seen.add(o["id"])
                txt = o["text"].strip().strip("“”\"")
                kind = KIND.get(o["type"], o["type"])
                if o["type"] == "badge":
                    kind = "green check" if o["id"].startswith("ok") else "red X"
                if o["type"] == "arrow":
                    kind = "spin arrow" if "spin" in o["id"] else "up/down arrow" if o["id"] in ("a-up", "a-down") else "force arrow"
                items.append({"at": round(max(o["t0"], t0), 2), "kind": kind, "text": txt})
        items.sort(key=lambda x: x["at"])
        merged = []
        for x in items:                     # two of the same thing at once read as one item: "2 × up/down arrow"
            if any(m["kind"] == x["kind"] and m["text"] == x["text"] and abs(m["at"] - x["at"]) >= 0.3 for m in merged) and x["text"]:
                continue                    # the same tag again after a cut inside the beat
            if merged and merged[-1]["kind"] == x["kind"] and merged[-1]["text"] == x["text"] and abs(merged[-1]["at"] - x["at"]) < 0.3:
                merged[-1]["n"] = merged[-1].get("n", 1) + 1
            else:
                merged.append(dict(x))
        for x in merged:
            if x.get("n"):
                x["kind"] = f"{x.pop('n')} × {x['kind']}"
        items = merged
        rows.append({"id": b["id"], "scene": b["scene"], "title": TITLES.get(b["scene"], b["scene"]), "start": round(t0, 2), "end": round(t1, 2),
                     "ptStart": b["ptStart"], "en": b["en"], "pt": b["pt"], "camera": cam, "split": split, "items": items})
    (OUT / "shots.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    md = [f"# Shot map: {TITLE.lower()} (EN)", "", "| Beat | Time | Scene | Line | Camera | On screen |", "|---|---|---|---|---|---|"]
    for r in rows:
        on = "; ".join(f"{i['kind']}{(' ' + i['text']) if i['text'] else ''}" for i in r["items"]) or "none"
        md.append(f"| {r['id']} | {r['start']:.1f}–{r['end']:.1f} | {r['title']} | {r['en']} | {'split screen; ' if r['split'] else ''}{' → '.join(r['camera'])} | {on} |")
    (OUT / "SHOTS.md").write_text("\n".join(md) + "\n")
    # images for the page
    page = OUT / "page"
    (page / "shots").mkdir(parents=True, exist_ok=True)
    (page / "ref").mkdir(parents=True, exist_ok=True)
    ref_end = ref_duration()
    for i, r in enumerate(rows):
        src = OUT / "stills" / f"{r['id']}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "scale=360:640", "-q:v", "4", str(page / "shots" / f"{r['id']}.jpg")], check=True)
        if REF_VIDEO:
            pt_end = rows[i + 1]["ptStart"] if i + 1 < len(rows) else ref_end
            mid = (r["ptStart"] + min(pt_end, r["ptStart"] + (r["end"] - r["start"]))) / 2
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{mid:.2f}", "-i", str(REF_VIDEO), "-frames:v", "1", "-vf", "scale=360:640", "-q:v", "4", str(page / "ref" / f"{r['id']}.jpg")], check=True)
    tpl = (TOOLS / "shot_map.template.html").read_text()
    tpl = tpl.replace("@@TITLE@@", TITLE).replace("@@NAME@@", TITLE.lower()).replace("@@SLUG@@", SLUG)
    data = json.dumps({"rows": rows, "duration": probe["duration"]}, ensure_ascii=False).replace("</", "<\\/")
    html = tpl.replace("@@DATA@@", data)
    if not REF_VIDEO:                       # from a topic or script: no reference frame to show
        for old, new in ((" the matching frame of their Portuguese reel,", ""), (" (EN) · private", ""), (" · private", "")):
            html = html.replace(old, new)
        html = html.replace('<label class="toggle"><input type="checkbox" id="showref" checked> Show their frame</label>', '<input type="checkbox" id="showref" checked hidden>')
        html = html.replace(', ["pt", `ref/${r.id}.jpg`, "Theirs (PT)"]', "").replace('"Ours (EN)"', '"Still"')
        html = re.sub(r" Their frames are here for study only[^<]*", "", html)
    (page / "index.html").write_text(html)
    print(f"{len(rows)} beats; {sum(1 for r in rows if r['split'])} with a split screen; {sum(len(r['items']) for r in rows)} on-screen items")


main()
