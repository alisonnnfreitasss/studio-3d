#!/usr/bin/env python3
"""Studio 3D: the local web tool.

Serves the interface (ui/), the studio's files, a JSON API and live job events. Jobs run the
pipeline (tools/pipeline.py) one at a time in the background; every event it prints is kept in
memory, written to jobs/<id>/events.jsonl and streamed to the browser (server-sent events).
Only listens on 127.0.0.1. Standard library only.

Run: /usr/bin/python3 server/serve.py        then open http://127.0.0.1:8810
"""
import hashlib, json, mimetypes, re, subprocess, sys, threading, time, traceback, unicodedata, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import studio as S  # noqa: E402
KIT = ROOT.parent / "kit"             # the 3D explainer format: its tools, its JS and its runner
sys.path.insert(0, str(KIT / "runner"))
import explainer as X  # noqa: E402
import listen as L  # noqa: E402

STATIC = ("ui", "engine", "characters", "modes", "assets", "episodes", "knowledge", "auditions", "explainers")
JOBS = {}
ORDER = []
LOCK = threading.Condition()
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/markdown", ".md")


# ---------------------------------------------------------------- explainers (the 3D explainer format, on the kit)

def explainer_dir(slug):
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug or ""):
        raise ValueError(f"bad slug {slug!r}")
    return ROOT / "explainers" / slug


def explainer_alive(run):
    pid = run.get("pid")
    if not pid or run.get("state") != "running":
        return False
    try:
        subprocess.run(["kill", "-0", str(pid)], check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError:
        return False


def explainer_payload(slug):
    d = explainer_dir(slug)
    if not (d / "topic.json").exists():
        raise ValueError(f"no explainer {slug}")
    run = read(d / "run.json", {})
    if run.get("state") == "running" and not explainer_alive(run):
        run["state"] = "stopped"
    rel = lambda p: f"explainers/{slug}/" + str(p.relative_to(d))
    renders = d / "renders"
    versions = []
    for t in (ROOT / "explainers").glob("*/topic.json"):
        o = read(t, {})
        if t.parent != d and (o.get("of") == slug or (read(d / "topic.json", {}).get("of") and (o.get("slug") == read(d / "topic.json", {}).get("of") or o.get("of") == read(d / "topic.json", {}).get("of")))):
            versions.append({"slug": o.get("slug"), "language": o.get("language", "en")})
    return {"slug": slug, "versions": versions, "source_script": read(d / "source_script.json"), "topic": read(d / "topic.json", {}), "run": run, "script": read(d / "script.json"),
            "videos": [rel(p) for p in sorted(renders.glob("*.mp4"), key=lambda p: p.stat().st_mtime)] if renders.exists() else [],
            "stills": rel(renders / "stills/_sheet.jpg") if (renders / "stills/_sheet.jpg").exists() else None,
            "shotmap": rel(renders / "shotmap/page/index.html") if (renders / "shotmap/page/index.html").exists() else None,
            "docs": {n: (d / n).read_text() for n in ("PLAN.md", "WORLD.md", "REVIEW.md") if (d / n).exists()}}


def poster(rel):
    """A cached still of a video in another folder ("library/...") or this studio ("explainers/...")."""
    base = ROOT.parent if rel.startswith("library/") else ROOT
    src = (base / (rel[len("library/"):] if rel.startswith("library/") else rel)).resolve()
    if ROOT.parent not in src.parents or src.suffix != ".mp4" or not src.exists():
        return None
    out = ROOT / "jobs/posters" / (hashlib.sha1(f"{src}{src.stat().st_mtime}".encode()).hexdigest() + ".jpg")
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        length = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)], capture_output=True, text=True).stdout or 8)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{min(3, length / 3):.2f}", "-i", str(src), "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", str(out)], check=False)
    return out if out.exists() else None


def page_library():
    """the explainer page: the reels made before the studio, from the posting records of the kit's project."""
    base = ROOT.parent / "my-reels"
    out = []
    for kind, name in (("original", "trial-reels.json"), ("second", "trial-reels-variants.json")):
        d = read(base / name, {})
        rows = d if isinstance(d, list) else next((v for v in d.values() if isinstance(v, list)), [])
        for r in rows:
            f = (base / r["file"]).resolve()
            if not f.exists():
                continue
            out.append({"slug": r["slug"], "n": r.get("n"), "kind": kind, "video": "library/" + str(f.relative_to(ROOT.parent)), "url": r.get("url") or r.get("permalink") or r.get("of") if kind == "original" else None,
                        "caption": (r.get("caption") or "").split("\n")[0], "posted": bool(r.get("id") or r.get("postId") or r.get("post_id"))})
    # the cinematic films
    cine = ROOT.parent / "my-reels/cinematic"
    for slug, title, name, kind in (("the-photo-your-mom-just-sent", "The photo your mom just sent", "cable-full-phone.mp4", "original"), ("the-photo-your-mom-just-sent", "The photo your mom just sent", "cable-full-mirror-phone.mp4", "second"), ("how-does-sand-think", "How does sand think?", "sand-10s.mp4", "original")):
        f = cine / name
        if f.exists():
            out.append({"slug": slug, "title": title, "format": "cinematic", "kind": kind, "video": "library/" + str(f.relative_to(ROOT.parent)), "url": None, "caption": title, "posted": False})
    return out


def page_assets(page_id):
    """What a page builds from. The sitcom page: its cast and sets. The explainer page: the kit's cast, worlds, labels, sound."""
    st = S.studio()
    page = next((p for p in st.get("pages", []) if p["id"] == page_id), None)
    if not page:
        raise ValueError(f"no page {page_id}")
    if page["format"] == "explainer":
        worlds = [{"name": n, "ready": "on the kit" in w} for n, w in re.findall(r"^## \d+\. ([^:\n]+): (.+)$", (KIT / "WORLDS.md").read_text(), flags=re.M)]
        brand = read(KIT / "brands" / page.get("kitBrand", "default") / "brand.json", {})
        music = sorted(p.name for p in (KIT / "assets/music").glob("*.mp3")) if (KIT / "assets/music").exists() else []
        return {"page": page, "voice": brand.get("voice", {}).get("name") or brand.get("voice", {}).get("provider"), "lead": brand.get("lead"), "worlds": worlds, "music": music,
                "docs": {n: f"/kit-doc/{n}" for n in ("FORMAT.md", "WORLDS.md")}, "labels": 42, "poses": 65, "effects": 114}
    if page["format"] == "cinematic":
        cine = KIT / "assets/cine"
        count = lambda d: len([p for p in (cine / d).iterdir() if not p.name.startswith(".")]) if (cine / d).exists() else 0
        brand = read(KIT / "brands" / page.get("kitBrand", "default") / "brand.json", {})
        return {"page": page, "voice": brand.get("voice", {}).get("name"), "textures": count("tex"), "skies": count("hdr"), "earth": count("earth"),
                "builds": ["Textured ground", "Cable or pipe", "Moving light", "Night globe with cities", "Realistic phone", "Dust and depth", "Big titles and counters"]}
    return {"page": page}


def explainers_list():
    root = ROOT / "explainers"
    rows = [explainer_payload(p.name) for p in sorted(root.iterdir(), key=lambda p: -p.stat().st_mtime) if (p / "topic.json").exists()] if root.exists() else []
    brands = [{"id": p.parent.name, "name": read(p, {}).get("name", p.parent.name)} for p in sorted((KIT / "brands").glob("*/brand.json"))]
    return {"explainers": rows, "brands": brands, "speeds": {k: {"label": v["label"], "about": v["about"]} for k, v in X.SPEEDS.items()}}


def explainer_start(slug):
    subprocess.Popen([sys.executable, str(KIT / "runner/explainer.py"), "run", str(explainer_dir(slug))], start_new_session=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def explainer_create(body):
    topic = (body.get("topic") or "").strip()
    source = body.get("source") or "topic"
    if source == "video" and not (body.get("video") or "").strip():
        raise ValueError("a video link, file or reference id is needed")
    if source == "script" and not (body.get("script") or "").strip():
        raise ValueError("paste the script")
    topic = topic or ("Reel from a video" if source == "video" else re.split(r"(?<=[.?!])\s", body.get("script", "").strip())[0][:80])
    if not topic:
        raise ValueError("a topic is needed")
    base = unicodedata.normalize("NFKD", body.get("slug") or topic).encode("ascii", "ignore").decode().lower()
    slug = "-".join(re.findall(r"[a-z0-9]+", base)[:6]) or "reel"
    n, final = 2, slug
    while explainer_dir(final).exists():
        final, n = f"{slug}-{n}", n + 1
    extra = []
    if source == "video":
        extra = ["--video", body["video"].strip()]
    elif source == "script":
        sf = ROOT / "explainers" / f".{final}.script.txt"
        sf.parent.mkdir(exist_ok=True)
        sf.write_text(body["script"])
        extra = ["--script-file", str(sf)]
    r = subprocess.run([sys.executable, str(KIT / "tools/new_topic.py"), final, topic, "--brand", body.get("brand") or "default",
                        "--speed", body.get("speed") or "standard", "--seconds", str(int(body.get("seconds") or 60)), "--language", body.get("language") or "en", "--format", body.get("format") or "explainer", "--root", str(ROOT / "explainers")] + extra,
                       capture_output=True, text=True)
    if extra and source == "script":
        sf.unlink(missing_ok=True)
    if r.returncode:
        raise ValueError(r.stdout + r.stderr)
    explainer_start(final)
    return explainer_payload(final)


def explainer_action(slug, action, body):
    d = explainer_dir(slug)
    if action == "translate":
        out = X.translate(str(d), body.get("language") or "pt", body.get("brand") or "default")
        explainer_start(out.name)
        return explainer_payload(out.name)
    if action == "script":
        sc = read(d / "script.json", {})
        sc["lines"] = [{"scene": x.get("scene") or "main", "text": x["text"].strip()} for x in body["lines"] if x.get("text", "").strip()]
        (d / "script.json").write_text(json.dumps(sc, indent=1, ensure_ascii=False))
        return explainer_payload(slug)
    if action == "approve":
        subprocess.run([sys.executable, str(KIT / "runner/explainer.py"), "approve", str(d), body["gate"]], check=True, capture_output=True)
    elif action == "cancel":
        subprocess.run([sys.executable, str(KIT / "runner/explainer.py"), "cancel", str(d)], capture_output=True)
        return explainer_payload(slug)
    elif action == "rerender":
        subprocess.Popen([sys.executable, str(KIT / "runner/explainer.py"), "rerender", str(d)], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return explainer_payload(slug)
    elif action == "variant":
        subprocess.Popen([sys.executable, str(KIT / "runner/explainer.py"), "variant", str(d)], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return explainer_payload(slug)
    elif action != "resume":
        raise ValueError(f"no action {action}")
    run = read(d / "run.json", {})
    if not explainer_alive(run):
        explainer_start(slug)
    return explainer_payload(slug)


# ---------------------------------------------------------------- studio state

def read(p, default=None):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return default


def spend_of(slug):
    total, by_lang = 0, {}
    for led in (S.episode_dir(slug) / "voice").glob("*/ledger.jsonl"):
        n = sum(json.loads(l).get("characters", 0) for l in led.read_text().splitlines() if l.strip())
        by_lang[led.parent.name] = n
        total += n
    return {"total": total, "byLang": by_lang}


def episode_payload(slug):
    d = S.episode_dir(slug)
    ep = read(d / "episode.json", {})
    out = {"slug": slug, "episode": ep, "script": read(d / "script.json", {}), "status": read(d / "status.json", {}), "spend": spend_of(slug), "langs": {}}
    for lang in ep.get("languages", []):
        tl = read(d / "build" / lang / "timeline.json")
        render = d / "renders" / f"{slug}-{lang}.mp4"
        out["langs"][lang] = {
            "frames": read(d / "frames" / lang / "index.json", []),
            "sheet": f"episodes/{slug}/frames/{lang}/shots-sheet.jpg" if (d / "frames" / lang / "shots-sheet.jpg").exists() else None,
            "renderSheet": f"episodes/{slug}/frames/{lang}/render-sheet.jpg" if (d / "frames" / lang / "render-sheet.jpg").exists() else None,
            "render": f"episodes/{slug}/renders/{slug}-{lang}.mp4" if render.exists() else None,
            "thumb": f"episodes/{slug}/frames/{lang}/thumb.jpg" if (d / "frames" / lang / "thumb.jpg").exists() else None,
            "estimate": estimate(slug, lang) if (ep.get("languages") and read(d / "script.json", {}).get("lines")) else None,
            "renderedAt": time.strftime("%Y-%m-%d %H:%M", time.localtime(render.stat().st_mtime)) if render.exists() else None,
            "timeline": {"end": tl["end"], "shots": [{"n": s["n"], "start": s["start"], "end": s["end"], "camera": s["camera"], "speaker": s.get("speaker"), "line": s.get("line")} for s in tl["shots"]]} if tl else None,
        }
    return out


def studio_payload():
    st = S.studio()
    return {
        "studio": st,
        "characters": {c: read(ROOT / "characters" / c / "character.json") for c in st["characters"]},
        "pages": st.get("pages", []),
        "influencers": [st.get("lead")],
        "agents": st.get("agents", []),
        "modes": {m: read(ROOT / "modes" / m / "mode.json") for m in st["modes"]},
        "setups": {m: read(ROOT / "modes" / m / "setups.json", {}) for m in st["modes"]},
        "episodes": [episode_payload(s) for s in S.episodes()],
        "knowledge": [p.name for p in sorted((ROOT / "knowledge").glob("*.md"))],
        "busy": any(JOBS[j]["state"] in ("queued", "running") for j in ORDER),
    }


def estimate(slug, lang):
    import tts
    try:
        rows = tts.plan(slug, lang)
    except SystemExit as e:
        return {"ok": False, "error": str(e)}
    todo = [r for r in rows if not r["cached"]]
    return {"ok": True, "lines": len(rows), "toGenerate": len(todo), "characters": sum(len(r["text"]) for r in todo),
            "totalCharacters": sum(len(r["text"]) for r in rows),
            "missing": [{"id": r["id"], "who": r["who"], "voice": r["voice"]["name"], "chars": len(r["text"])} for r in todo]}


# ---------------------------------------------------------------- jobs

def new_job(body):
    jid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    episodes = body.get("episodes") or []
    if not episodes:
        raise ValueError("no episodes")
    job = {"id": jid, "episodes": episodes, "langs": body.get("langs") or [], "steps": body.get("steps") or "all",
           "approveSpend": bool(body.get("approveSpend")), "state": "queued", "created": time.time(), "started": None, "ended": None,
           "events": [], "proc": None, "label": body.get("label") or ""}
    with LOCK:
        JOBS[jid] = job
        ORDER.append(jid)
        LOCK.notify_all()
    return job


def add_event(job, ev):
    with LOCK:
        ev["seq"] = len(job["events"])
        job["events"].append(ev)
        LOCK.notify_all()
    d = ROOT / "jobs" / job["id"]
    d.mkdir(parents=True, exist_ok=True)
    with open(d / "events.jsonl", "a") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")


def worker():
    while True:
        with LOCK:
            nxt = next((JOBS[j] for j in ORDER if JOBS[j]["state"] == "queued"), None)
            if nxt is None:
                LOCK.wait(timeout=2)
                continue
            nxt["state"] = "running"
            nxt["started"] = time.time()
        job = nxt
        cmd = [sys.executable, str(ROOT / "tools" / "pipeline.py"), "--episodes", ",".join(job["episodes"]), "--steps",
               job["steps"] if isinstance(job["steps"], str) else ",".join(job["steps"])]
        if job["langs"]:
            cmd += ["--langs", ",".join(job["langs"])]
        if job["approveSpend"]:
            cmd += ["--approve-spend"]
        add_event(job, {"type": "job-queued-start", "time": time.time(), "cmd": " ".join(cmd[1:])})
        try:
            proc = subprocess.Popen(cmd, cwd=ROOT / "tools", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            job["proc"] = proc
            for raw in proc.stdout:
                raw = raw.rstrip()
                if not raw or "NotOpenSSLWarning" in raw or "warnings.warn" in raw:
                    continue
                try:
                    ev = json.loads(raw)
                except ValueError:
                    ev = {"type": "log", "msg": raw, "time": time.time()}
                add_event(job, ev)
            proc.wait()
            ok = proc.returncode == 0
            job["state"] = "cancelled" if job.get("cancelled") else ("done" if ok else "failed")
        except Exception as e:
            add_event(job, {"type": "log", "msg": f"server error: {e}", "time": time.time()})
            job["state"] = "failed"
        job["ended"] = time.time()
        add_event(job, {"type": "job-end", "time": time.time(), "state": job["state"]})


def job_public(job, with_events=False):
    out = {k: v for k, v in job.items() if k not in ("proc", "events")}
    out["eventCount"] = len(job["events"])
    if with_events:
        out["events"] = job["events"]
    return out


# ---------------------------------------------------------------- scripts and episodes (the editor)

def slugify(title):
    t = unicodedata.normalize("NFD", title.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60] or "episode"
    base, n = t, 2
    while (ROOT / "episodes" / t).exists():
        t = f"{base}-{n}"
        n += 1
    return t


def validate(script, ep):
    errors, warnings = [], []
    lines = script.get("lines")
    if not isinstance(lines, list):
        return ["lines must be a list"], []
    md = S.mode(ep["mode"])
    shot_types = set(md.get("shotTypes", {}).keys()) | {"auto"}
    seen = set()
    for i, l in enumerate(lines, 1):
        lid = l.get("id")
        if not lid:
            errors.append(f"line {i}: no id")
        elif lid in seen:
            errors.append(f"line {i}: the id {lid} is used twice")
        seen.add(lid)
        cam = l.get("camera", "auto")
        ctype = cam.get("type") if isinstance(cam, dict) else cam
        if ctype not in shot_types:
            warnings.append(f"{lid}: camera '{ctype}' is not a {md['name']} shot type")
        if l.get("silent") is not None:
            if not isinstance(l["silent"], (int, float)) or l["silent"] <= 0:
                errors.append(f"{lid}: a silent beat needs seconds above 0")
            continue
        if l.get("who") not in ep["cast"]:
            errors.append(f"{lid}: '{l.get('who')}' is not in the cast")
        for lang in ep.get("languages", []):
            if not S.text_of(l.get("say"), lang):
                warnings.append(f"{lid}: no {lang.upper()} text yet")
    return errors, warnings


def create_episode(body):
    st = S.studio()
    title = (body.get("title") or "").strip()
    if not title:
        raise ValueError("a title is needed")
    lead = body.get("lead") or st.get("lead")
    mode = body.get("mode") or "desk"
    if mode not in st["modes"]:
        raise ValueError(f"unknown mode {mode}")
    md = S.mode(mode)
    scenario = body.get("scenario") if body.get("scenario") in md.get("scenarios", {}) else md.get("defaultScenario", "night-city")
    agents = [a for a in body.get("agents", []) if a in st.get("agents", [])]
    langs = [l for l in body.get("languages", []) if l in [x["id"] for x in st["languages"]]] or ["pt", "en"]
    slug = slugify(title)
    d = ROOT / "episodes" / slug
    S.save(d / "episode.json", {"slug": slug, "title": title, "type": "sitcom", "mode": mode, "scenario": scenario, "lead": lead, "cast": [lead] + agents,
                                "languages": langs, "state": "idea", "notes": body.get("notes", "")})
    S.save(d / "script.json", {"title": {l: title for l in langs}, "outline": body.get("outline", ""), "lines": []})
    return {"slug": slug}


def save_meta(slug, body):
    d = ROOT / "episodes" / slug
    ep = read(d / "episode.json")
    if not ep:
        raise ValueError("no such episode")
    st = S.studio()
    for k in ("title", "notes", "state"):
        if k in body:
            ep[k] = body[k]
    if "ending" in body:
        if body["ending"] not in ("hold", "fade", None):
            raise ValueError("ending is hold or fade")
        if body["ending"]:
            ep["ending"] = body["ending"]
        else:
            ep.pop("ending", None)
    if "mode" in body:
        if body["mode"] not in st["modes"]:
            raise ValueError("unknown mode")
        ep["mode"] = body["mode"]
    scenarios = S.mode(ep["mode"]).get("scenarios", {})
    if "scenario" in body:
        if body["scenario"] not in scenarios:
            raise ValueError(f"the {ep['mode']} mode has no scenario {body['scenario']}")
        ep["scenario"] = body["scenario"]
    elif ep.get("scenario") not in scenarios:
        ep["scenario"] = S.mode(ep["mode"]).get("defaultScenario", "night-city")
    if "agents" in body:
        ep["cast"] = [ep["lead"]] + [a for a in body["agents"] if a in st.get("agents", [])]
    if "languages" in body:
        ep["languages"] = [l for l in body["languages"] if l in [x["id"] for x in st["languages"]]]
    if "variants" in body:
        ep["variants"] = {k: v for k, v in body["variants"].items() if v}
    if ep.get("state") not in ("idea", "draft", "approved"):
        ep["state"] = "draft"
    S.save(d / "episode.json", ep)
    return {"ok": True, "episode": ep}


def save_script(slug, body):
    d = ROOT / "episodes" / slug
    ep = read(d / "episode.json")
    if not ep:
        raise ValueError("no such episode")
    old = read(d / "script.json", {})
    script = {"title": body.get("title", old.get("title", {}))}
    outline = body.get("outline", old.get("outline"))
    if outline:
        script["outline"] = outline
    script["lines"] = body.get("lines", [])
    for extra in ("screen", "board"):
        if old.get(extra) and extra not in body:
            script[extra] = old[extra]
        elif body.get(extra):
            script[extra] = body[extra]
    errors, warnings = validate(script, ep)
    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings}
    S.save(d / "script.json", script)
    if ep.get("state") == "idea" and script["lines"]:
        ep["state"] = "draft"
        S.save(d / "episode.json", ep)
    return {"ok": True, "errors": [], "warnings": warnings, "estimates": {l: estimate(slug, l) for l in ep.get("languages", [])}}


def rehearsal(slug, lang):
    import timeline
    return timeline.build(slug, lang, estimate=True)


def set_voice(cid, body):
    """A voice picked on the Cast page: a library voice is first added to the ElevenLabs account
    (free), then the character keeps its exact id. The settings stay the character's own."""
    p = ROOT / "characters" / cid / "character.json"
    c = read(p)
    lang, vid, name = body.get("lang"), body.get("id"), body.get("name")
    if not c or not lang or not vid or not name:
        raise ValueError("character, language, voice id and name are needed")
    for other in S.studio()["characters"]:
        if other != cid and (read(ROOT / "characters" / other / "character.json") or {}).get("voices", {}).get(lang, {}).get("id") == vid:
            raise ValueError(f"{other} already speaks {lang.upper()} with that voice")
    if body.get("owner"):
        import urllib.request, urllib.error
        key = S.env_key(S.studio()["tts"]["keyName"])
        mine = json.load(urllib.request.urlopen(urllib.request.Request("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": key})))["voices"]
        if not any(v["voice_id"] == vid for v in mine):
            req = urllib.request.Request(f"https://api.elevenlabs.io/v1/voices/add/{body['owner']}/{vid}", method="POST",
                                         data=json.dumps({"new_name": name}).encode(), headers={"xi-api-key": key, "Content-Type": "application/json"})
            try:
                vid = json.load(urllib.request.urlopen(req)).get("voice_id") or vid
            except urllib.error.HTTPError as e:
                raise ValueError(f"ElevenLabs would not add the voice to your account ({e.code}): add it from the Voice Library, then pick it again")
    old = c.get("voices", {}).get(lang, {})
    c.setdefault("voices", {})[lang] = {"name": name, "id": vid, "settings": old.get("settings", {})}
    c["notes"] = [n for n in c.get("notes", []) if not n.startswith("Portuguese voice: to pick")]
    S.save(p, c)
    return {"ok": True, "voice": c["voices"][lang]}


def set_voice_model(cid, body):
    """The ElevenLabs model one voice speaks with (picked after a voice test); the studio default otherwise."""
    p = ROOT / "characters" / cid / "character.json"
    c = read(p)
    lang, model = body.get("lang"), body.get("model")
    if not c or lang not in c.get("voices", {}) or model not in ("eleven_multilingual_v2", "eleven_v4"):
        raise ValueError("character, language and model (eleven_multilingual_v2 or eleven_v4) are needed")
    c["voices"][lang]["model"] = model
    S.save(p, c)
    return {"ok": True, "voice": c["voices"][lang]}


def set_variant(cid, variant):
    p = ROOT / "characters" / cid / "character.json"
    c = read(p)
    if not c or variant not in c.get("variants", []):
        raise ValueError("unknown character or outfit")
    c["variant"] = variant
    S.save(p, c)
    return {"ok": True}


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        if not path.exists() or not path.is_file():
            return self.send_json({"error": "not found"}, 404)
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        size = path.stat().st_size
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else 0
            end = int(b) if b else size - 1
            end = min(end, size - 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            length = end - start + 1
        else:
            start, length = 0, size
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1 << 16, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                remaining -= len(chunk)

    def do_GET(self):
        url = urlparse(self.path)
        p = unquote(url.path)
        try:
            if p in ("/", "/index.html"):
                return self.send_file(ROOT / "ui" / "index.html")
            if p == "/api/studio":
                return self.send_json(studio_payload())
            if p == "/api/estimate":
                q = parse_qs(url.query)
                return self.send_json(estimate(q["episode"][0], q["lang"][0]))
            if p == "/api/jobs":
                return self.send_json([job_public(JOBS[j]) for j in reversed(ORDER)])
            if p == "/api/explainers":
                return self.send_json(explainers_list())
            if p.startswith("/poster/"):                      # one still per video: a page of full videos would use up the browser's connections
                f = poster(p[len("/poster/"):])
                if f:
                    return self.send_file(f)
                return self.send_json({"error": "no poster"}, 404)
            if p == "/api/requests":
                return self.send_json({"status": L.status(), "requests": L.requests()[-20:][::-1]})
            if p == "/api/library":
                return self.send_json(page_library())
            m = re.match(r"^/api/pages/([a-z0-9-]+)/assets$", p)
            if m:
                return self.send_json(page_assets(m.group(1)))
            if p.startswith("/library/"):                    # the reels made before the studio
                target = (ROOT.parent / p[len("/library/"):]).resolve()
                if ROOT.parent in target.parents and target.suffix == ".mp4":
                    return self.send_file(target)
            if p.startswith("/kit-doc/") and p.split("/")[-1] in ("FORMAT.md", "WORLDS.md"):
                return self.send_file(KIT / p.split("/")[-1])
            m = re.match(r"^/api/explainers/([a-z0-9-]+)$", p)
            if m:
                return self.send_json(explainer_payload(m.group(1)))
            m = re.match(r"^/api/episodes/([a-z0-9-]+)/rehearsal$", p)
            if m:
                try:
                    return self.send_json(rehearsal(m.group(1), parse_qs(url.query)["lang"][0]))
                except SystemExit as e:
                    return self.send_json({"error": str(e)}, 400)
            if p.startswith("/api/jobs/") and p.endswith("/events"):
                return self.stream(p.split("/")[3], int(parse_qs(url.query).get("from", ["0"])[0]))
            if p.startswith("/api/jobs/"):
                j = JOBS.get(p.split("/")[3])
                return self.send_json(job_public(j, True) if j else {"error": "no such job"}, 200 if j else 404)
            if p.startswith("/vendor/"):                     # three.js for the rehearsal player: local, no CDN
                target = (KIT / p.lstrip("/")).resolve()
                if KIT in target.parents:
                    return self.send_file(target)
            rel = p.lstrip("/")
            if rel.split("/")[0] in STATIC:
                target = (ROOT / rel).resolve()
                if ROOT in target.parents:
                    return self.send_file(target)
            return self.send_json({"error": "not found"}, 404)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as e:
            traceback.print_exc()
            return self.send_json({"error": str(e)}, 500)

    def do_POST(self):
        p = urlparse(self.path).path
        # a request from this page only: a POST here can start work, so another website must not be able to send one
        origin = self.headers.get("Origin")
        host = self.headers.get("Host") or ""
        if host.split(":")[0] not in ("127.0.0.1", "localhost") or (origin and urlparse(origin).netloc != host):
            return self.send_json({"error": "this request did not come from the studio"}, 403)
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}") if n else {}
        try:
            if p == "/api/jobs":
                return self.send_json(job_public(new_job(body)))
            if p == "/api/episodes":
                return self.send_json(create_episode(body))
            if p == "/api/requests":
                if not (body.get("text") or "").strip():
                    raise ValueError("write what you want changed")
                return self.send_json(L.add(body["text"].strip(), body.get("where") or {}))
            if p == "/api/explainers":
                return self.send_json(explainer_create(body))
            m = re.match(r"^/api/explainers/([a-z0-9-]+)/(approve|script|resume|cancel|variant|rerender|translate)$", p)
            if m:
                return self.send_json(explainer_action(m.group(1), m.group(2), body))
            m = re.match(r"^/api/episodes/([a-z0-9-]+)/(meta|script)$", p)
            if m:
                return self.send_json(save_meta(m.group(1), body) if m.group(2) == "meta" else save_script(m.group(1), body))
            m = re.match(r"^/api/characters/([a-z0-9-]+)/variant$", p)
            if m:
                return self.send_json(set_variant(m.group(1), body.get("variant")))
            m = re.match(r"^/api/characters/([a-z0-9-]+)/voice-model$", p)
            if m:
                return self.send_json(set_voice_model(m.group(1), body))
            m = re.match(r"^/api/characters/([a-z0-9-]+)/voice$", p)
            if m:
                return self.send_json(set_voice(m.group(1), body))
            if p.startswith("/api/jobs/") and p.endswith("/cancel"):
                j = JOBS.get(p.split("/")[3])
                if j and j.get("proc") and j["state"] == "running":
                    j["cancelled"] = True
                    j["proc"].terminate()
                elif j and j["state"] == "queued":
                    j["state"] = "cancelled"
                return self.send_json({"ok": True})
            return self.send_json({"error": "not found"}, 404)
        except Exception as e:
            return self.send_json({"error": str(e)}, 400)

    def stream(self, jid, start):
        job = JOBS.get(jid)
        if not job:
            return self.send_json({"error": "no such job"}, 404)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        i = start
        last_beat = time.time()
        try:
            while True:
                with LOCK:
                    while i >= len(job["events"]) and job["state"] in ("queued", "running") and time.time() - last_beat < 15:
                        LOCK.wait(timeout=1)
                    batch = job["events"][i:]
                    finished = job["state"] not in ("queued", "running")
                for ev in batch:
                    self.wfile.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode())
                i += len(batch)
                if not batch:
                    self.wfile.write(b": beat\n\n")
                    last_beat = time.time()
                self.wfile.flush()
                if finished and i >= len(job["events"]):
                    self.wfile.write(b"event: end\ndata: {}\n\n")
                    self.wfile.flush()
                    return
        except (BrokenPipeError, ConnectionResetError):
            return


def main():
    cfg = S.studio()["server"]
    threading.Thread(target=worker, daemon=True).start()
    srv = ThreadingHTTPServer((cfg["host"], cfg["port"]), Handler)
    srv.daemon_threads = True
    print(f"Studio 3D on http://{cfg['host']}:{cfg['port']}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
