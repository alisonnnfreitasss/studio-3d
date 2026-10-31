#!/usr/bin/python3
"""Start a topic-first 3D explainer: no reference, the script comes from the topic and the plan from kit/FORMAT.md and kit/WORLDS.md.

    /usr/bin/python3 new_topic.py <slug> "<topic>" [--brand default] [--speed express|standard|studio] [--seconds 60] [--language en|pt] [--format explainer|cinematic] [--root <folder>]
                     [--video <file, link or reference id>] [--script-file <file holding your own script>]

Creates <root>/<slug>/ (default root: studio/explainers) with topic.json, lines.py, cues.py and a starter
build/js/reel.js on the kit. Refuses to write over a folder. The kit tools then run from that folder, as for any reel.
"""
import json
import re
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = KIT.parent.parent / "studio-3d/explainers"

GITIGNORE = """# made by the tools: renders and checks, the kit's copies, audio
renders/
build/.hyperframes/
build/node_modules/
build/js/kit/
build/js/brand.js
build/vendor/
build/assets/
voice/*.wav
voice/*.aiff
"""
LINES = '''# The script of {slug}: one spoken sentence per line, ("scene id", "the sentence"). A scene is a run of beats.
EN = []
DROP = {{}}
# Scene titles for the shot map: {{"hook": "Hook: ..."}}
SCENES = {{}}
'''
CUES = '''# The sound of {slug}: synthesised effects keyed to words of the take (kit/tools/sfx.py lists them), on a soft bed ducked under the voice.
from sfx import *

TARGET = -14.5
'''
REEL = '''// {slug}: the reel's own content for the kit's stage (kit/README.md, "The contract").
import TL from "./timeline.js";
import {{ LEAD }} from "./brand.js";
import {{ words, frame, useCamera }} from "./kit/words.js";
import {{ shotList, hold }} from "./kit/camera.js";
import {{ buildTerrain, buildSky, heights }} from "./kit/props.js";

const {{ captions }} = words(TL);
export const CAST = [LEAD];
const FILM = shotList([hold(0, {{ tg: [0, 1, 0], az: 20, el: 8, d: 9, screen: [0.5, 0.42] }})]);
const captionAt = captions({{}});

export function direct(t) {{
  const F = frame(t);
  F.cast.lead = {{ pos: [0, 0, 0], yaw: 0, pose: "wave", emotion: "happy" }};
  useCamera(F, FILM, t);
  const cap = captionAt(t);
  if (cap) F.overlays.push(cap);
  return F;
}}

export function buildWorld(scene) {{
  const ground = buildTerrain(scene, {{ size: [300, 300], seg: [60, 60], height: heights.flat(0) }});
  const sky = buildSky(scene);
  return {{ update(t, F) {{ ground.update(t, {{}}); sky.update(t, F); }} }};
}}
'''


def opt(a, name, default):
    return a[a.index(name) + 1] if name in a else default


def main():
    a = sys.argv[1:]
    pos = [x for i, x in enumerate(a) if not x.startswith("--") and (i == 0 or not a[i - 1].startswith("--"))]
    if len(pos) != 2:
        sys.exit(__doc__)
    slug, topic = pos
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        sys.exit(f"slug {slug!r}: lower case words joined by hyphens")
    brand, speed = opt(a, "--brand", "default"), opt(a, "--speed", "standard")
    if not (KIT / "brands" / brand / "brand.json").exists():
        sys.exit(f"no brand {brand!r} in {KIT / 'brands'}")
    if speed not in ("express", "standard", "studio"):
        sys.exit(f"speed {speed!r}: express, standard or studio")
    out = Path(opt(a, "--root", str(DEFAULT_ROOT))).resolve() / slug
    if out.exists():
        sys.exit(f"{out} exists: refusing to write over it")
    for d in ("voice", "renders", "build/js"):
        (out / d).mkdir(parents=True)
    meta = {"slug": slug, "topic": topic, "ref": None, "brand": brand, "speed": speed, "seconds": int(opt(a, "--seconds", "60")), "language": opt(a, "--language", "en"), "format": opt(a, "--format", "explainer")}
    if "--video" in a:                      # from a video: the runner's reference step fetches and measures it, and sets ref
        meta.update(source="video", source_video=opt(a, "--video", ""))
    elif "--script-file" in a:              # from the person's own script: no writing step
        meta.update(source="script", script=Path(opt(a, "--script-file", "")).read_text().strip())
    else:
        meta["source"] = "topic"
    (out / "topic.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    (out / "lines.py").write_text(LINES.format(slug=slug))
    (out / "cues.py").write_text(CUES.format(slug=slug))
    (out / "build/js/reel.js").write_text(REEL.format(slug=slug))
    (out / ".gitignore").write_text(GITIGNORE)
    print(out)


main()
