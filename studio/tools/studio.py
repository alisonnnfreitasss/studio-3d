"""Shared helpers for the Studio 3D pipeline: paths, config, episodes, status, events.

Every tool prints its progress as JSON lines (one event per line) so the web tool can show it
live; a person running a tool by hand sees the same lines.
"""
import hashlib, json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAI = ROOT.parent
FPS = 30


def load(p):
    return json.loads(Path(p).read_text())


def save(p, data):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    tmp.replace(p)


def studio():
    return load(ROOT / "studio.json")


def character(cid):
    return load(ROOT / "characters" / cid / "character.json")


def characters():
    return {c: character(c) for c in studio()["characters"]}


def mode(mid):
    return load(ROOT / "modes" / mid / "mode.json")


def episode_dir(slug):
    return ROOT / "episodes" / slug


def episode(slug):
    return load(episode_dir(slug) / "episode.json")


def script(slug):
    return load(episode_dir(slug) / "script.json")


def episodes():
    out = []
    for d in sorted((ROOT / "episodes").iterdir()):
        if (d / "episode.json").exists():
            out.append(d.name)
    return out


def text_of(field, lang):
    if field is None:
        return None
    if isinstance(field, str):
        return field
    return field.get(lang)


def voice_for(ep, cid, lang):
    """Episode override first, then the character's voice for that language."""
    v = (ep.get("voices") or {}).get(cid, {}).get(lang)
    if v:
        return v
    return character(cid).get("voices", {}).get(lang) or {}


def sha(obj):
    return hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def frame(t):
    return round(round(t * FPS) / FPS, 4)


# ---------------------------------------------------------------- status per episode

def status(slug):
    p = episode_dir(slug) / "status.json"
    return load(p) if p.exists() else {}


def set_status(slug, lang, step, state, **info):
    p = episode_dir(slug) / "status.json"
    s = load(p) if p.exists() else {}
    s.setdefault(lang, {})[step] = {"state": state, "at": time.strftime("%Y-%m-%d %H:%M:%S"), **info}
    save(p, s)


# ---------------------------------------------------------------- events

def emit(event_type, /, **data):
    """One progress event as a JSON line on stdout (the server reads these)."""
    ev = {"type": event_type, "time": round(time.time(), 3), **data}
    sys.stdout.write(json.dumps(ev, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    return ev


def log(msg, **data):
    emit("log", msg=msg, **data)


def run(cmd, cwd=None, step=None, env=None, quiet_patterns=()):
    """Run a command, forwarding its output as log events. Returns (code, last lines)."""
    e = dict(os.environ)
    if env:
        e.update(env)
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=e, bufsize=1)
    tail = []
    for line in proc.stdout:
        line = line.rstrip()
        if not line or any(q in line for q in quiet_patterns):
            continue
        tail = (tail + [line])[-40:]
        log(line, step=step)
    proc.wait()
    return proc.returncode, tail


def env_key(name):
    cfg = studio()["tts"]
    envf = (ROOT / cfg["envFile"]).resolve()
    for l in envf.read_text().splitlines():
        if l.strip().startswith(name):
            return l.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{name} not found in {envf}")
