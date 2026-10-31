#!/usr/bin/python3
"""A music bed from ElevenLabs Music, for a reel that wants a real track instead of sfx.py's synthesised pluck bed.

The reel's cues.py holds the beds it may use: MUSIC = {"<name>": {"prompt": "...", "seconds": 106, "model": "music_v2_5"}}.
This writes music/<name>.mp3 (instrumental, force_instrumental) and logs every track bought in music/ledger.jsonl;
sound.py then mixes it under the voice with --bed music/<name>.mp3.

Spend: only with --spend, only when music/<name>.mp3 is missing or its prompt changed (a second run spends nothing).
State the cost and wait for the person's go before --spend.

Run from the reel: /usr/bin/python3 ../kit/tools/music.py <name> [--spend]
"""
import json
import sys
import urllib.request

from common import HERE, KIT, TOOLS, load_module

PAI = next(p for p in KIT.parents if (p / "CLAUDE.md").exists() and (p / ".env").exists())
URL = "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192"


def key():
    for l in (PAI / ".env").read_text().splitlines():
        if l.startswith("ELEVENLABS_API_KEY"):
            return l.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no ELEVENLABS_API_KEY")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    name = args[0]
    sys.path.insert(0, str(TOOLS))   # cues.py builds its cues on import: it needs sfx and the word timeline
    import sfx
    sfx.load(HERE / "timeline.json")
    beds = getattr(load_module(HERE / "cues.py", "cues"), "MUSIC", {})
    if name not in beds:
        sys.exit(f"cues.py has no MUSIC[{name!r}] (has: {', '.join(beds) or 'none'})")
    spec = {"model": "music_v2_5", **beds[name]}
    out = HERE / "music" / f"{name}.mp3"
    meta = out.with_suffix(".json")
    if out.exists() and meta.exists() and json.loads(meta.read_text()).get("prompt") == spec["prompt"]:
        print(f"{out.relative_to(HERE)}: cached, nothing spent")
        return
    if "--spend" not in sys.argv:
        sys.exit(f"no cached track for MUSIC[{name!r}]: {spec['seconds']} s on {spec['model']} would be spent; "
                 "state the cost, wait for the person's go, then run with --spend")
    body = {"prompt": spec["prompt"], "music_length_ms": int(spec["seconds"] * 1000), "model_id": spec["model"],
            "force_instrumental": True}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs Music {e.code}: {e.read().decode()[:600]}")
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(data)
    meta.write_text(json.dumps(spec, indent=1) + "\n")
    with open(out.parent / "ledger.jsonl", "a") as f:
        f.write(json.dumps({"name": name, "model": spec["model"], "seconds": spec["seconds"], "bytes": len(data)}) + "\n")
    print(f"{out.relative_to(HERE)}: {len(data) / 1e6:.1f} MB, {spec['seconds']} s on {spec['model']}")


if __name__ == "__main__":
    main()
