#!/usr/bin/python3
"""The HyperFrames project in the reel's build/:
  build/js/kit/        a fresh copy of the kit's js/ on every run (the kit is the single source; git-ignored in the reel),
                       with VERSION: the kit's content hash and git state
  build/js/timeline.js from timeline.json: every English sentence and word, placed
  build/index.html     the 720x1280 canvas, the voice-and-sound mix, and the module that calls
                       createStage(canvas, root, reel) from ./js/kit/stage.js with the reel's ./js/reel.js
  build/hyperframes.json, meta.json, package.json, assets/fonts/ (Montserrat)
Files are written only when their content changes, so the shot map probe stays fresh when nothing moved.

Run from the reel, after sound.py: /usr/bin/python3 ../kit/tools/compose.py   (--no-kit: skip the kit copy, for selftest.py only)
"""
import hashlib
import json
import shutil
import subprocess
import sys

from common import BRAND, HERE, HF, KIT, REEL_ID, TITLE, TOPIC

B = HERE / "build"
KIT_JS = KIT / "js"
FONTS = KIT / "assets/fonts"   # Montserrat, copied from the skyscraper build


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def kit_version():
    files = sorted(p for p in KIT_JS.rglob("*") if p.is_file() and p.name != ".DS_Store")
    h = hashlib.sha256()
    for p in files:
        h.update(str(p.relative_to(KIT_JS)).encode() + b"\0" + p.read_bytes() + b"\0")
    git = lambda *a: subprocess.run(["git", "-C", str(KIT), *a], capture_output=True, text=True).stdout.strip()
    head = git("rev-parse", "--short", "HEAD") or "?"
    dirty = git("status", "--porcelain", "--", str(KIT_JS))
    state = "uncommitted changes in kit/js" if dirty else "kit/js as committed"
    return f"content sha256 {h.hexdigest()[:16]} ({len(files)} files)\ngit {head} ({state})\n"


def copy_kit():
    if not (KIT_JS / "stage.js").exists():
        sys.exit(f"{KIT_JS}/stage.js: missing (the kit's JS is not there yet)")
    dst = B / "js/kit"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(KIT_JS, dst, ignore=shutil.ignore_patterns(".DS_Store"))   # copy2: keeps the kit's file times
    (dst / "VERSION").write_text(kit_version())
    return (dst / "VERSION").read_text().split("\n")[0]


def main():
    if not (B / "js/reel.js").exists():
        sys.exit(f"{B}/js/reel.js: missing (new_reel.py writes a skeleton)")
    tl = json.loads((HERE / "timeline.json").read_text())
    dur = tl["duration"]
    version = "not copied (--no-kit: a test of the Python chain only)" if "--no-kit" in sys.argv else copy_kit()
    write(B / "js/timeline.js", "// written by tools/compose.py from timeline.json: every English sentence and word, placed\nexport default " + json.dumps(tl, ensure_ascii=False) + ";\n")
    fonts = B / "assets/fonts"
    for f in sorted(FONTS.glob("*.woff2")):
        if not (fonts / f.name).exists():
            fonts.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, fonts / f.name)
    if TOPIC.get("format") == "cinematic":   # kit/js/cine.js reads its textures, HDRs and fonts from here; no other reel gets this folder
        shutil.copytree(KIT / "assets/cine", B / "assets/cine", dirs_exist_ok=True, ignore=shutil.ignore_patterns(".DS_Store"))
    if not (B / "vendor/three/build/three.module.js").exists():   # three.js and friends, pinned, so a render needs no network
        shutil.copytree(KIT / "vendor", B / "vendor", dirs_exist_ok=True)
    write(B / "js/brand.js", "// written by tools/compose.py from the reel's brand: the lead character\nexport const LEAD = " + json.dumps({"who": "lead", **BRAND["lead"]}) + ";\n")
    sfx = []
    sp = HERE / "sfx.json"     # optional: effects as separate audio clips instead of baked into mix.wav
    if sp.exists():
        for i, s in enumerate(json.loads(sp.read_text())):
            sfx.append(f'      <audio id="sfx-{i}" src="assets/sfx/{s["file"]}" data-start="{s["t"]:.3f}" data-duration="{s["dur"]:.3f}" data-track-index="{3 + i % 6}" data-volume="{s.get("vol", 1)}"></audio>')
    music = ""
    if (B / "assets/bed.wav").exists():
        music = f'      <audio id="bed" src="assets/bed.wav" data-start="0" data-duration="{dur}" data-track-index="2" data-volume="1"></audio>'
    # the full mix (voice, bed, effects; sound.py) when it exists, else the bare voice
    audio = "mix.wav" if (B / "assets/mix.wav").exists() else "voice.wav"
    html = f"""<!doctype html>
<html lang="en" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=720, height=1280" />
    <title>{TITLE}, built from scratch (EN)</title>
    <script src="vendor/gsap/gsap.min.js"></script>
    <script type="importmap">
      {{
        "imports": {{
          "three": "./vendor/three/build/three.module.js",
          "three/addons/": "./vendor/three/examples/jsm/",
          "three/examples/jsm/": "./vendor/three/examples/jsm/",
          "postprocessing": "./vendor/postprocessing/index.js",
          "n8ao": "./vendor/n8ao/N8AO.js"
        }}
      }}
    </script>
    <style>
      @font-face {{ font-family: "Montserrat"; src: url("assets/fonts/Montserrat-latin.woff2") format("woff2"); font-weight: 100 900; font-display: block; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }}
      @font-face {{ font-family: "Montserrat"; src: url("assets/fonts/Montserrat-latin-ext.woff2") format("woff2"); font-weight: 100 900; font-display: block; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 720px; height: 1280px; overflow: hidden; background: #000; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }}
      #stage {{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="720" data-height="1280">
      <canvas id="stage" class="clip" data-start="0" data-duration="{dur}" data-track-index="0" data-layout-allow-overflow></canvas>
      <audio id="vo" src="assets/{audio}" data-start="0" data-duration="{dur}" data-track-index="1" data-volume="1" data-audio-group="voiceover"></audio>
{music}
{chr(10).join(sfx)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      tl.set({{}}, {{}}, {dur});
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = tl;
    </script>
    <script type="module">
      import {{ createStage }} from "./js/kit/stage.js";
      import * as reelModule from "./js/reel.js";
      const reel = reelModule.default ?? reelModule;
      let stage = null, ready = false, last = window.__hfThreeTime || 0;
      async function build() {{
        await Promise.all([document.fonts.load('800 50px "Montserrat"'), document.fonts.load('900 30px "Montserrat"')]);
        await document.fonts.ready;
        stage = await createStage(document.getElementById("stage"), document.getElementById("root"), reel);
        ready = true;
        stage.renderAt(window.__hfThreeTime ?? last);
      }}
      window.__hf = window.__hf || {{}};
      window.__hf.buildReady = window.__hf.buildReady || {{}};
      window.__hf.buildReady["{REEL_ID}"] = build();
      window.addEventListener("hf-seek", (e) => {{ last = e.detail.time; if (ready) stage.renderAt(last); }});
      window.__renderAt = (t) => stage && stage.renderAt(t);
    </script>
  </body>
</html>
"""
    write(B / "index.html", html)
    write(B / "hyperframes.json", json.dumps({"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json", "paths": {"assets": "assets"}, "authoringSkill": "general-video"}, indent=1))
    write(B / "package.json", json.dumps({"name": REEL_ID, "private": True, "type": "module",
                                          "scripts": {"check": f"npx --yes hyperframes@{HF} check", "render": f"npx --yes hyperframes@{HF} render"}}, indent=1))
    write(B / "meta.json", json.dumps({"id": REEL_ID, "name": REEL_ID}, indent=1))
    print(f"composed: {dur}s, {len(sfx)} sound effects, bed: {bool(music)}, audio {audio}; kit {version}")


main()
