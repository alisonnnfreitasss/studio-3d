#!/usr/bin/python3
"""Render the reel the way the traps taught, then check it.

    /usr/bin/python3 ../kit/tools/render.py [--sheets] [--no-check]

1. compose.py (writes only what changed, and copies the kit's JS fresh), so a render never runs a stale build.
2. In build/: lockf -k /tmp/studio-3d-render.lock caffeinate -i npx --yes hyperframes@0.8.181 render . --quality delivery
   --workers 4 --player-ready-timeout 240000 --browser-timeout 240 --output ../renders/<slug>-en-vN.mp4
   N is one more than the highest render in renders/. The lock serialises renders across the reels (one GPU); caffeinate
   keeps the Mac awake through a wait on the lock (it slept through one); the long player-ready timeout survives a sibling
   render or a probe on the GPU (the 45 s default missed). The log goes to renders/render-vN.log.
3. check.py on the new render (--sheets passed through). Exit code: the render's, else the check's.
Local and free: about 4 to 5 minutes for a 2.5 minute reel, plus any wait on the lock.
"""
import re
import subprocess
import sys

from common import HERE, HF, PY, REEL_ID, TOOLS

sys.stdout.reconfigure(line_buffering=True)   # our lines in order with the tools' output


def main():
    r = subprocess.run([PY, str(TOOLS / "compose.py")], cwd=HERE)
    if r.returncode:
        return r.returncode
    renders = HERE / "renders"
    renders.mkdir(exist_ok=True)
    pat = re.compile(rf"^{re.escape(REEL_ID)}-v(\d+)\.mp4$")
    n = max([int(m.group(1)) for p in renders.iterdir() for m in [pat.match(p.name)] if m] + [0]) + 1
    out = f"renders/{REEL_ID}-v{n}.mp4"
    log = renders / f"render-v{n}.log"
    cmd = ["lockf", "-k", "/tmp/studio-3d-render.lock", "caffeinate", "-i", "npx", "--yes", f"hyperframes@{HF}", "render", ".",
           "--quality", "delivery", "--workers", "4", "--player-ready-timeout", "240000", "--browser-timeout", "240", "--output", f"../{out}"]
    print(f"rendering {out} (waits on /tmp/studio-3d-render.lock if another reel is rendering); log {log.relative_to(HERE)}")
    with open(log, "w") as f:
        p = subprocess.Popen(cmd, cwd=HERE / "build", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in p.stdout:
            f.write(line)
            if any(k in line.lower() for k in ("error", "render complete", "rendered in", "timeout", "failed")):
                print("  " + line.rstrip()[:200])
        p.wait()
    if p.returncode or not (HERE / out).exists():
        print(f"render failed (exit {p.returncode}): see {log.relative_to(HERE)}")
        return p.returncode or 1
    if "--no-check" in sys.argv:
        print(out)
        return 0
    return subprocess.run([PY, str(TOOLS / "check.py"), out] + (["--sheets"] if "--sheets" in sys.argv else []), cwd=HERE).returncode


if __name__ == "__main__":
    sys.exit(main())
