#!/usr/bin/python3
"""The sound: the reel's cues.py (effects keyed to words of the take, from the kit's sfx.py library), a soft bed ducked
under the voice, mixed into build/assets/mix.wav at about -14.5 LUFS (cues.py may set TARGET).

Run from the reel, after voice.py: /usr/bin/python3 ../kit/tools/sound.py
A real track instead of the synthesised bed (music.py): --bed music/<name>.mp3 [--bed-gain 0.55] [--out <wav>]
(--out writes the mix elsewhere, e.g. for a test that must not touch the render's build/assets/mix.wav).
"""
import sys

from common import HERE, TOOLS, load_module

sys.path.insert(0, str(TOOLS))     # so the reel's cues.py can say: from sfx import *
import sfx  # noqa: E402

voice = HERE / "build/assets/voice.wav"
if not voice.exists():
    sys.exit(f"{voice}: missing (run voice.py first)")
sfx.load(HERE / "timeline.json")
cues = load_module(HERE / "cues.py", "cues")
target = float(getattr(cues, "TARGET", -14.5))
def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


bed_file = opt("--bed")
out = HERE / opt("--out", "build/assets/mix.wav")
gain = float(opt("--bed-gain", getattr(cues, "BED_GAIN", 0.55)))
lv = sfx.mix(voice, out, target, bed_gain=gain, bed_file=HERE / bed_file if bed_file else None)
if bed_file:
    print(f"bed: {bed_file} at gain {gain}; mix written to {out.relative_to(HERE)}")
step = f" (before the gain step {lv['before_step']})" if "before_step" in lv else ""
lp = f"; {lv['lowpass']} Hz lowpass so the AAC encode stays under -1 dBTP" if lv.get("lowpass") else ""
print(f"{len(sfx.CUES)} sound cues; mix I: {lv.get('I')} LUFS{step}, LRA {lv.get('LRA')} LU, true peak {lv.get('TP')} dBTP{lp}")
