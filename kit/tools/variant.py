#!/usr/bin/python3
"""The second version every reel ships with ("original video with original colors; mirrored video
with different colors and song"). The original is render.py's; this makes the other one from the same build:

    /usr/bin/python3 ../kit/tools/variant.py [--season autumn] [--bed playful] [--no-mirror] [--no-check] [--dry]

1. compose.py (a fresh copy of the kit's JS, the timeline).
2. The mix on the other song: sound.py --bed <track> --out renders/mix-<bed>.wav (the voice and every cue unchanged).
   The track is the reel's music/<bed>.mp3, else the kit's assets/music/<bed>.mp3 (playful lives there: the pick for
   the mirrored versions, for now). A track shorter than the reel loops with a crossfade.
3. A copy of build/ in _variant/build (git-ignored) with window.__MIRROR (the 3D flipped, the text kept readable) and
   window.__SEASON set before the stage loads, and the new mix as its assets/mix.wav.
4. The render, behind the shared lock like render.py, to renders/<slug>-en-vN-mirror-<season>-<bed>.mp4, where N is
   the latest original render's number.
5. check.py on it (the original's declared shots hold: mirroring and recolouring move no cut).
Local and free, about 5 minutes; a new song costs a music.py track (state the cost first).
"""
import re
import shutil
import subprocess
import sys

from common import HERE, HF, KIT, PY, REEL_ID, TOOLS

sys.stdout.reconfigure(line_buffering=True)


def opt(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    season, bed = opt("--season", "autumn"), opt("--bed", "playful")
    mirror = "--no-mirror" not in sys.argv
    track = next((p for p in (HERE / "music" / f"{bed}.mp3", KIT / "assets/music" / f"{bed}.mp3") if p.exists()), None)
    if not track:
        sys.exit(f"no track {bed!r} in music/ or the kit's assets/music/ (make one with music.py)")
    if subprocess.run([PY, str(TOOLS / "compose.py")], cwd=HERE).returncode:
        return 1
    mix = HERE / "renders" / f"mix-{bed}.wav"
    mix.parent.mkdir(exist_ok=True)
    if subprocess.run([PY, str(TOOLS / "sound.py"), "--bed", str(track.relative_to(HERE) if track.is_relative_to(HERE) else track),
                       "--out", str(mix.relative_to(HERE))], cwd=HERE).returncode:
        return 1
    # the variant's build: a copy, the switches set before the stage loads, the new mix
    vb = HERE / "_variant" / "build"
    if vb.parent.exists():
        shutil.rmtree(vb.parent)
    shutil.copytree(HERE / "build", vb, ignore=shutil.ignore_patterns(".hyperframes", "node_modules"))
    shutil.copy(HERE / "topic.json", vb.parent / "topic.json")
    shutil.copy(mix, vb / "assets" / "mix.wav")
    flags = (f'window.__SEASON = "{season}";' if season != "summer" else "") + (" window.__MIRROR = true;" if mirror else "")
    page = vb / "index.html"
    s = page.read_text()
    if s.count('<script type="module">') != 1:
        sys.exit("index.html: expected one module script")
    page.write_text(s.replace('<script type="module">', f"<script>{flags.strip()}</script>\n    <script type=\"module\">", 1))
    # name: the latest original render's number, then what changed
    pat = re.compile(rf"^{re.escape(REEL_ID)}-v(\d+)\.mp4$")
    n = max([int(m.group(1)) for p in (HERE / "renders").iterdir() for m in [pat.match(p.name)] if m] + [0])
    tag = "-".join((["mirror"] if mirror else []) + ([season] if season != "summer" else []) + [bed])
    out = f"renders/{REEL_ID}-v{n}-{tag}.mp4"
    log = HERE / "renders" / f"render-v{n}-{tag}.log"
    cmd = ["lockf", "-k", "/tmp/studio-3d-render.lock", "caffeinate", "-i", "npx", "--yes", f"hyperframes@{HF}", "render", ".",
           "--quality", "delivery", "--workers", "4", "--player-ready-timeout", "240000", "--browser-timeout", "240", "--output", f"../../{out}"]
    if "--dry" in sys.argv:
        print(f"dry run: _variant/build ready ({flags.strip()}; song {track.name}); would render {out}")
        return 0
    print(f"rendering {out} ({flags.strip()}; song {track.name}); log {log.relative_to(HERE)}")
    with open(log, "w") as f:
        r = subprocess.run(cmd, cwd=vb, stdout=f, stderr=subprocess.STDOUT)
    if r.returncode or not (HERE / out).exists():
        print(f"render failed (exit {r.returncode}): see {log.relative_to(HERE)}")
        return r.returncode or 1
    if "--no-check" in sys.argv:
        print(out)
        return 0
    return subprocess.run([PY, str(TOOLS / "check.py"), out], cwd=HERE).returncode


if __name__ == "__main__":
    sys.exit(main())
