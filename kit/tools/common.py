"""What every kit tool shares: where the reel is, where the kit is, where the reference lives.

The kit tools run from the reel's folder (the one holding topic.json), e.g.
    cd <reel folder> && /usr/bin/python3 ../kit/tools/voice.py
(or with REEL=<folder> set). The reel keeps its own content: topic.json, lines.py, cues.py, build/js/reel.js and the
scene files beside it, voice/ and renders/. Everything else comes from the kit.
"""
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
KIT = TOOLS.parent                                                  # this repo
PROJECTS = KIT.parent
RESEARCH = PROJECTS / "research/reference"           # the reference page's videos and transcripts
PY = "/usr/bin/python3"                                             # the interpreter with numpy and cv2
HF = "0.8.181"                                                      # the HyperFrames version every reel renders with


def reel_dir():
    d = Path(os.environ.get("REEL") or os.getcwd()).resolve()
    if not (d / "topic.json").exists():
        sys.exit(f"{d}: no topic.json. Run the kit tools from a reel folder: cd <reel folder>")
    return d


HERE = reel_dir()
TOPIC = json.loads((HERE / "topic.json").read_text())
SLUG = TOPIC["slug"]
REEL_ID = f"{SLUG}-en"                                             # build-ready key, package and meta name, render prefix
TITLE = TOPIC.get("title") or SLUG.replace("-", " ").capitalize()  # "light-bulb" -> "Light bulb"
if (HERE / "reference").exists():                                  # a reel made from a video keeps it in its own folder
    RESEARCH = HERE / "reference"
REF = TOPIC.get("ref")                                             # a topic-first reel has none
REF_VIDEO = RESEARCH / f"source-videos/{REF}.mp4" if REF else None
REF_TRANSCRIPT = RESEARCH / f"transcripts/{REF}.scribe.json" if REF else None
BRAND = json.loads((KIT / "brands" / TOPIC.get("brand", "default") / "brand.json").read_text())   # voice and lead character


def duration(path):
    """A media file's length in seconds (ffprobe)."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def ref_duration():
    """The reference reel's length: its video, else the audio length its Scribe transcript records. None without a reference."""
    if not REF:
        return None
    if REF_VIDEO.exists():
        return duration(REF_VIDEO)
    return float(json.loads(REF_TRANSCRIPT.read_text())["audio_duration_secs"])


def load_module(path, name):
    """Import one of the reel's own Python files (lines.py, cues.py) by path."""
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def lines():
    """The reel's script, lines.py: EN = [(scene, line), ...] one per Portuguese sentence, DROP = {beat id: words}, and
    SCENES = {scene: ("English title", "Portuguese title")} for the shot map and the side by side."""
    p = HERE / "lines.py"
    if not p.exists():
        sys.exit(f"{p}: missing (new_reel.py writes it)")
    m = load_module(p, "lines")
    return {"EN": list(m.EN), "DROP": dict(getattr(m, "DROP", {})), "SCENES": dict(getattr(m, "SCENES", {}))}


def scene_titles(lang="en"):
    k = 0 if lang == "en" else 1
    return {s: (v[k] if isinstance(v, (list, tuple)) else v) for s, v in lines()["SCENES"].items()}
