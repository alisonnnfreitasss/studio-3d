#!/usr/bin/python3
"""The English voice: one ElevenLabs take of the whole script (Eleven v4, with timestamps), cut
into sentences in the take's real pauses and placed on the reference's beat times (each sentence starts at its Portuguese
start, or right after the previous English sentence if that one ran long; a sentence that would overrun the next
Portuguese start plays up to TEMPO_CAP faster, pitch kept, so the English catches up instead of drifting).

Writes voice/take.mp3 + take.json (cached: a second run spends nothing), build/assets/voice.wav and timeline.json (every
word with its absolute time, every beat). The film runs as long as the reference, or the English plus a short tail.

Cuts: ElevenLabs aligns word starts 50 to 200 ms late, so each
sentence's audio is cut in the longest quiet run near its aligned edges (20 ms of air before, 40 ms after), never at the
aligned times; the word timeline is not moved. The take's first word is aligned up to 200 ms late, so the first sentence's
audio starts at 0 with its whole first word and plays that much after its captions. See memory


Spend: only with --spend, only when the take's text changed, and never past CAP characters for the reel in all
(voice/ledger.jsonl holds every take bought). State the cost and wait for the person's go before --spend.

Run from the reel: /usr/bin/python3 ../kit/tools/voice.py [--spend]
"""
import base64
import json
from pathlib import Path
import os
import subprocess
import sys

from common import BRAND, HERE, KIT, REF, TOPIC, ref_duration

VOICE = BRAND["voice"]
LOCAL = VOICE["provider"] == "local"       # a free voice on this machine, timed by local whisper (no credits, no key)
VOICE_NAME = VOICE.get("name", "local")
MODEL = VOICE.get("model", "local")
SETTINGS = VOICE.get("settings", {})
TAG = VOICE.get("tag", "")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", str(Path(__file__).resolve().parents[2] / "models/ggml-base.en.bin"))
LEAD_IN = 0.3       # topic-first: where the first sentence's words sit, so its audio never has to start before 0
GAP = 0.16          # least air between two sentences when the English runs late
TEMPO_CAP = 1.15    # a sentence that would run into the next Portuguese beat plays up to 15% faster (pitch kept)
PAD = 0.04          # a sentence's first aligned word sits this long after the sentence's start on the timeline
CAP = int(TOPIC.get("voice_cap", 3200))   # ElevenLabs characters a reel may spend in all
TAIL = float(TOPIC.get("tail", 0.6))      # silence after the last sentence when the English outruns the reference


def key():
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"]
    pai = next((p for p in KIT.parents if (p / ".env").exists()), None)
    for l in ((pai / ".env").read_text().splitlines() if pai else []):
        if l.startswith("ELEVENLABS_API_KEY"):
            return l.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no ELEVENLABS_API_KEY")


def norm(w):
    return "".join(c for c in w.lower() if c.isalnum())


def local_take(text, take_json, vdir):
    """A free take: macOS say for the voice, whisper-cli for word times, mapped back onto the script's own words."""
    from difflib import SequenceMatcher
    aiff, wav = vdir / "take.aiff", vdir / "take16.wav"
    pt = TOPIC.get("language") == "pt"
    subprocess.run(["say", "-v", VOICE.get("say_pt", "Eddy (Portuguese (Brazil))") if pt else VOICE.get("say", "Daniel"), "-r", str(VOICE.get("rate", 185)), "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ar", "44100", "-b:a", "128k", str(vdir / "take.mp3")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ac", "1", "-ar", "16000", str(wav)], check=True)
    subprocess.run(["whisper-cli", "-m", os.environ.get("WHISPER_MODEL_ANY", str(next(Path.home().glob(".cache/huggingface/hub/models--ggerganov--whisper.cpp/snapshots/*/ggml-large-v3-turbo-q8_0.bin"), WHISPER_MODEL))) if pt else WHISPER_MODEL, *(["-l", "pt"] if pt else []), "-f", str(wav), "-ml", "1", "-sow", "-oj", "-of", str(vdir / "take.whisper"), "-np"], check=True, capture_output=True)
    heard = [{"w": x["text"].strip(), "s": x["offsets"]["from"] / 1000, "e": x["offsets"]["to"] / 1000}
             for x in json.loads((vdir / "take.whisper.json").read_text())["transcription"] if x["text"].strip()]
    script = text.split()
    times = [None] * len(script)
    sm = SequenceMatcher(a=[norm(w) for w in script], b=[norm(h["w"]) for h in heard], autojunk=False)
    for m in sm.get_matching_blocks():
        for k in range(m.size):
            times[m.a + k] = (heard[m.b + k]["s"], heard[m.b + k]["e"])
    i = 0
    while i < len(times):                # a word whisper heard differently takes its share of the gap round it
        if times[i] is None:
            j = i
            while j < len(times) and times[j] is None:
                j += 1
            a = times[i - 1][1] if i else 0.0
            b = times[j][0] if j < len(times) else (heard[-1]["e"] if heard else a + 0.3 * (j - i))
            b = max(b, a + 0.05 * (j - i))
            for k in range(i, j):
                times[k] = (a + (b - a) * (k - i) / (j - i), a + (b - a) * (k - i + 1) / (j - i))
            i = j
        else:
            i += 1
    miss = len(script) - sum(b.size for b in sm.get_matching_blocks())
    take_json.write_text(json.dumps({"text": text, "model": "local", "words": [{"w": w, "s": t[0], "e": t[1]} for w, t in zip(script, times)]}, ensure_ascii=False))
    print(f"local take: {len(script)} words, {miss} timed by interpolation; no credits spent")


def envelope(wav):
    """The take's loudness every 5 ms, and the level under which it counts as quiet (a pause, not a word)."""
    import wave
    import numpy as np
    with wave.open(str(wav)) as wf:
        sr = wf.getframerate()
        x = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).astype(np.float32)
    hop = sr // 200
    n = len(x) // hop
    env = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1))
    loud = env[env > np.percentile(env, 50)]
    thr = max(float(np.percentile(env, 10)) * 4, 0.05 * float(np.median(loud)))
    return env, 0.005, thr


def quiet_gap(env, step, thr, wa, wb, take_end):
    """The pause between word `wa` and the next word `wb` (aligned dicts with "s" and "e"; None at the take's edges): the
    longest run of quiet frames within 150 ms of the aligned boundary (the aligned times can be that far off), but never
    reaching into the middle of either word, so a short word next to a pause cannot be cut away. As (start, end) in
    seconds; with no quiet run, the softest moment, as (t, t)."""
    import numpy as np
    a = max(wa["e"] - 0.15, wa["s"] + 0.03) if wa else 0.0
    b = min(wb["s"] + 0.15, wb["e"] - 0.03) if wb else take_end
    lo, hi = max(0, int(a / step)), min(len(env), int(b / step) + 1)
    if hi <= lo:
        return a, a
    best, run = None, None
    for i in range(lo, hi):
        if env[i] < thr:
            run = (run[0], i) if run else (i, i)
            if best is None or run[1] - run[0] > best[1] - best[0]:
                best = run
        else:
            run = None
    if best is None or best[1] - best[0] < 2:
        k = lo + int(np.argmin(np.convolve(env[lo:hi], np.ones(4) / 4, mode="same")))
        return k * step, k * step
    return best[0] * step, (best[1] + 1) * step


def words_from_alignment(al, text_offset):
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur = [], None
    for i, c in enumerate(chars):
        if i < text_offset:
            continue
        if c.isspace():
            if cur:
                out.append(cur)
                cur = None
            continue
        if cur is None:
            cur = {"w": c, "s": st[i], "e": en[i]}
        else:
            cur["w"] += c
            cur["e"] = en[i]
    if cur:
        out.append(cur)
    return out


def buy_take(text, take_json, vdir):
    """One ElevenLabs take with timestamps. Only reached with --spend, under the reel's character cap."""
    import requests
    ledger = vdir / "ledger.jsonl"
    spent = sum(json.loads(l)["characters"] for l in ledger.read_text().splitlines() if l.strip()) if ledger.exists() else 0
    if spent + len(text) > CAP:
        sys.exit(f"refused: {len(text)} characters on top of {spent} already spent passes the reel's cap of {CAP}")
    h = {"xi-api-key": key()}
    voices = requests.get("https://api.elevenlabs.io/v1/voices", headers=h, timeout=30).json()["voices"]
    match = [v for v in voices if v["name"] == VOICE_NAME] or [v for v in voices if v["name"].startswith(VOICE_NAME)]
    if not match:
        sys.exit("voice not found: " + VOICE_NAME)
    vid = match[0]["voice_id"]
    body = {"text": text, "model_id": MODEL, "voice_settings": SETTINGS}
    r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128",
                      headers=h, json=body, timeout=600)
    if not r.ok:
        sys.exit(f"ElevenLabs {r.status_code}: {r.text[:400]}")
    d = r.json()
    (vdir / "take.mp3").write_bytes(base64.b64decode(d["audio_base64"]))
    take_json.write_text(json.dumps({"text": text, "voiceId": vid, "model": MODEL, "settings": SETTINGS,
                                     "alignment": d.get("alignment") or d.get("normalized_alignment")}, ensure_ascii=False))
    with open(ledger, "a") as f:
        f.write(json.dumps({"characters": len(text), "voice": VOICE_NAME, "model": MODEL}) + "\n")
    print(f"take generated: {len(text)} characters ({spent + len(text)} of {CAP} for this reel)")


def main():
    beats = json.loads((HERE / "beats.json").read_text())
    vdir = HERE / "voice"
    vdir.mkdir(exist_ok=True)
    spoken = " ".join(b.get("take", b["en"]) for b in beats)
    text = f"{TAG} {spoken}" if TAG else spoken
    take_json = vdir / "take.json"
    cached = take_json.exists() and json.loads(take_json.read_text()).get("text") == text
    if not cached and LOCAL:
        local_take(text, take_json, vdir)
    elif not cached:
        if "--spend" not in sys.argv:
            sys.exit(f"no cached take for this script: {len(text)} ElevenLabs characters would be spent; "
                     f"state the cost, wait for the person's go, then run with --spend")
        buy_take(text, take_json, vdir)
    take = json.loads(take_json.read_text())
    # the tag is never spoken; skip its characters
    words = take["words"] if "words" in take else words_from_alignment(take["alignment"], len(TAG) + 1)
    # assign words to sentences by walking the beats' words in order
    i = 0
    rows = []
    for b in beats:
        n = len(b.get("take", b["en"]).split())
        ws = words[i:i + n][b.get("drop", 0):]     # a beat that drops its first words places only the rest
        i += n
        rows.append((b, ws))
    if i != len(words):
        print(f"warning: {len(words)} aligned words vs {i} script words")
    # cut and place
    wav = vdir / "take.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(vdir / "take.mp3"), "-ac", "1", "-ar", "48000", str(wav)], check=True)
    pieces, placed, prev_end = [], [], 0.0
    env, step, thr = envelope(wav)              # cut in the take's real pauses, not at the aligned times
    take_end = len(env) * step
    inside = lambda t: env[min(len(env) - 1, max(0, int(t / step)))] > thr
    before_after, tight, late = [0, 0], [], 0.0
    for k, (b, ws) in enumerate(rows):
        s0 = max(0.0, ws[0]["s"] - PAD)
        nxt = rows[k + 1][1][0]["s"] if k + 1 < len(rows) else ws[-1]["e"] + 0.5
        s1 = min(ws[-1]["e"] + 0.18, (ws[-1]["e"] + nxt) / 2)
        if REF:
            start = max(b["ptStart"], prev_end + GAP) if k else b["ptStart"]
        else:                                  # topic-first: the take sets the pace, with its own pauses (at least GAP)
            # (the first sentence gets a lead-in: its audio starts before its aligned first word, up to 0.3 s on a clone's take)
            start = prev_end + max(GAP, min(0.45, ws[0]["s"] - rows[k - 1][1][-1]["e"])) if k else LEAD_IN
        nxt_pt = beats[k + 1]["ptStart"] if REF and k + 1 < len(beats) else None
        tempo = 1.0
        if nxt_pt is not None:
            tempo = min(TEMPO_CAP, max(1.0, (s1 - s0) / max(0.3, nxt_pt - GAP - start)))
        prev_end = start + (s1 - s0) / tempo
        placed.append({"id": b["id"], "scene": b["scene"], "start": round(start, 3), "end": round(prev_end, 3),
                       "ptStart": b["ptStart"] if REF else round(start, 2), "drift": round(start - b["ptStart"], 2) if REF else 0, "tempo": round(tempo, 3), "en": b["en"],
                       "words": [{"w": w["w"], "s": round(start + (w["s"] - s0) / tempo, 3), "e": round(start + (w["e"] - s0) / tempo, 3)} for w in ws]})
        j0 = next(j for j, w in enumerate(words) if w is ws[0])
        j1 = j0 + len(ws) - 1
        g0 = quiet_gap(env, step, thr, words[j0 - 1] if j0 else None, ws[0], take_end)
        g1 = quiet_gap(env, step, thr, ws[-1], words[j1 + 1] if j1 + 1 < len(words) else None, take_end)
        c0 = g0[1] - min(0.02, (g0[1] - g0[0]) / 2)   # 20 ms of air before the first word's sound (a short pause: its middle)
        c1 = g1[0] + min(0.04, (g1[1] - g1[0]) / 2)   # 40 ms after the last word's sound (a short pause: its middle)
        for g, t in ((g0, c0), (g1, c1)):              # no real pause here: listed, to check by ear
            if g[1] - g[0] < 0.05:
                tight.append(f"{b['id']} {t:.2f}s ({(g[1] - g[0]) * 1000:.0f} ms quiet)")
        st = start - (s0 - c0) / tempo           # the words stay where they were: only the audio's edges move
        if st < 0:                               # the first sentence cannot start before 0: it plays a little after its words' times
            late, st = -st, 0.0                  # instead of losing the start of its first word (aligned up to 200 ms late)
        before_after[0] += inside(s0) + inside(s1)
        before_after[1] += inside(c0) + inside(c1)
        pieces.append((c0, c1, st, tempo))
    # assemble on a silent bed as long as the reference (or the English and a short tail, if longer)
    total = max(ref_duration() or 0, prev_end + TAIL)
    filt, ins = [], []
    for j, (s0, s1, st, tempo) in enumerate(pieces):
        d = (s1 - s0) / tempo
        speed = f",atempo={tempo:.4f}" if tempo > 1.0005 else ""
        filt.append(f"[0:a]atrim={s0:.3f}:{s1:.3f},asetpts=PTS-STARTPTS{speed},afade=t=in:d=0.01,afade=t=out:st={max(0.0, d - 0.02):.3f}:d=0.02,adelay={int(round(st * 1000))}[a{j}]")
        ins.append(f"[a{j}]")
    filt.append("".join(ins) + f"amix=inputs={len(pieces)}:normalize=0,apad=whole_dur={total:.2f}[out]")
    out = HERE / "build/assets/voice.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-filter_complex", ";".join(filt), "-map", "[out]", "-ar", "48000", str(out)], check=True)
    print(f"cuts inside a sound: {before_after[0]} at the aligned times, {before_after[1]} after moving them into the pauses")
    print("boundaries with no real pause: " + (", ".join(tight) or "none"))
    print(f"first sentence plays {late:.2f}s after its words' times so its first word is whole")
    for (a0, a1, ast, at), (_, _, bst, _) in zip(pieces, pieces[1:]):   # no sentence runs into the next one
        assert ast + (a1 - a0) / at <= bst + 0.005, (ast, bst)
    tl = {"duration": round(total, 2), "beats": placed}
    (HERE / "timeline.json").write_text(json.dumps(tl, indent=1, ensure_ascii=False))
    late = [p for p in placed if p["drift"] > 0.05]
    print(f"placed {len(placed)} sentences, {total:.1f}s; {len(late)} start late, worst {max([p['drift'] for p in placed]):.2f}s; "
          f"{sum(1 for p in placed if p['tempo'] > 1.0005)} sped up (max x{max(p['tempo'] for p in placed):.2f})")
    for p in placed:
        print(f'{p["id"]} {p["start"]:7.2f}-{p["end"]:7.2f} (pt {p["ptStart"]:6.2f}, +{p["drift"]:.2f}) {p["en"]}')


main()
