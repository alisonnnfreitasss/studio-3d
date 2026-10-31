#!/usr/bin/env python3
"""Voices for one episode and language with ElevenLabs, one take per line, cached.

A take is reused while its voice, settings, model and text are unchanged (the cache key is in
<line>.json). Generating new takes spends ElevenLabs characters, so it needs --approve-spend;
--estimate only counts what would be spent.

Writes episodes/<slug>/voice/<lang>/:
  <line>.mp3        the raw take (git-ignored)
  <line>.json       text, voice, settings, cache key, ElevenLabs character alignment
  <line>.wav        mastered mono 48 kHz at -17 LUFS (two channels in the mix land near -14)
  <line>.env.json   loudness per frame at 30 fps and word timings (drives mouths and cuts)
  ledger.jsonl      one row per generated take (characters spent)

Run: /usr/bin/python3 tools/tts.py --episode <slug> --lang pt [--estimate | --approve-spend] [--force l03]
     [--trim l03=auto,l07=0.9]

--trim cuts the start of a take, for free: v4 sometimes says a one-word line twice ("Done... Done.")
or says something before the line. "auto" cuts just before the first word of the line (from the
alignment) and refuses where the cut would not land in a pause. The cut is kept in <line>.json
(trimStart), so it holds when the take is mastered again; a new take starts uncut.
"""
import argparse, base64, json, re, subprocess, time
from pathlib import Path
import numpy as np
import studio as S


def lufs(path):
    o = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", o)[-1])


def master(src, out, target=-17.0, trim=0.0):
    tmp = out.with_suffix(".comp.wav")
    cut = ["-ss", f"{trim:.3f}"] if trim > 0 else []
    fade = "afade=t=in:d=0.012," if trim > 0 else ""
    subprocess.run(["ffmpeg", "-v", "error", "-y", *cut, "-i", str(src), "-af", f"{fade}acompressor=threshold=-20dB:ratio=3:attack=4:release=80:makeup=1,highpass=f=70", "-ar", "48000", "-ac", "1", str(tmp)], check=True)
    gain = target - lufs(tmp)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:attack=2:release=40:level=disabled", "-ar", "48000", "-ac", "1", str(out)], check=True)
    tmp.unlink()


def words_from_alignment(al):
    # delivery tags ("[excited] ...") are voiced as direction, not words: skip what is inside brackets
    words, cur, ws, we, depth = [], "", None, None, 0
    for c, s, e in zip(al.get("characters", []), al.get("character_start_times_seconds", []), al.get("character_end_times_seconds", [])):
        if c == "[":
            depth += 1
            continue
        if c == "]":
            depth = max(0, depth - 1)
            continue
        if depth:
            continue
        if c.isspace():
            if cur:
                words.append({"w": cur, "s": round(ws, 3), "e": round(we, 3)})
            cur = ""
            continue
        if not cur:
            ws = s
        cur += c
        we = e
    if cur:
        words.append({"w": cur, "s": round(ws, 3), "e": round(we, 3)})
    return words


def approx_words(text, env, fps=30):
    """Word timings when the model returns no alignment: the words spread by length over the voiced
    part of the take (from its loudness envelope). Good enough for word cues and holds."""
    text = re.sub(r"\[[^\]]*\]\s*", "", text)
    toks = text.split()
    voiced = [i for i, v in enumerate(env) if v > 0.12]
    if not toks or not voiced:
        return []
    a, b = voiced[0] / fps, (voiced[-1] + 1) / fps
    total = sum(len(t) for t in toks)
    t, out = a, []
    for w in toks:
        d = (b - a) * len(w) / total
        out.append({"w": w, "s": round(t, 3), "e": round(t + d * 0.92, 3)})
        t += d
    return out


def envelope(path, fps=30):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.float32)
    hop = 48000 // fps
    rms = [float(np.sqrt(np.mean(a[i:i + hop] ** 2))) if len(a[i:i + hop]) else 0.0 for i in range(0, len(a), hop)]
    peak = max(rms) or 1.0
    return [round(min(1.0, r / (peak * 0.8)), 3) for r in rms]


def post(url, h, body, attempts=3):
    """One ElevenLabs call, retried after a network timeout."""
    import requests
    for n in range(attempts):
        try:
            return requests.post(url, headers={**h, "Content-Type": "application/json"}, json=body, timeout=120)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as ex:
            if n == attempts - 1:
                raise SystemExit(f"ElevenLabs did not answer after {attempts} tries: {ex}")
            S.emit("retry", attempt=n + 1, error=str(ex)[:160])
            time.sleep(4 * (n + 1))


def auto_trim(meta, mp3):
    """Where to cut so the take starts just before its first scripted word, or None when that point
    is not a pause (cutting there would clip a sound)."""
    al = meta.get("alignment") or {}
    depth, first = 0, None
    for c, s in zip(al.get("characters", []), al.get("character_start_times_seconds", [])):
        if c == "[":
            depth += 1
        elif c == "]":
            depth = max(0, depth - 1)
        elif not depth and not c.isspace():
            first = s
            break
    if first is None or first < 0.3:
        return None
    env = envelope(mp3)
    cut = max(0.0, first - 0.06)
    i = int(cut * 30)
    if max(env[max(0, i - 1):i + 2] or [1]) > 0.08:
        return None
    return round(cut, 3)


def plan(slug, lang):
    """Every voiced line with its voice, cache key and whether a take is cached."""
    ep, sc = S.episode(slug), S.script(slug)
    default_model = S.studio()["tts"]["model"]
    vdir = S.episode_dir(slug) / "voice" / lang
    rows = []
    for line in sc["lines"]:
        if line.get("silent") or not line.get("who"):
            continue
        text = S.text_of(line.get("say") or line.get("text"), lang)
        if not text:
            raise SystemExit(f"{slug}: line {line['id']} has no {lang} text")
        spoken = text
        v = S.voice_for(ep, line["who"], lang)
        if not v.get("name") and not v.get("id"):
            raise SystemExit(f"{slug}: no {lang} voice picked for {line['who']} (characters/{line['who']}/character.json)")
        # voices with an id are keyed by it; older name-only voices keep their keys, so their takes stay cached
        model = v.get("model") or default_model
        # v3/v4 act a delivery tag ("[deadpan]"); older models would read it, so they never get one
        delivery = S.text_of(line.get("delivery"), lang)
        if delivery and model.startswith(("eleven_v3", "eleven_v4")):
            text = f"[{delivery}] {text}"
        key = S.sha([v.get("id") or v["name"], v.get("settings", {}), model, text])
        meta = vdir / f"{line['id']}.json"
        cached = meta.exists() and json.loads(meta.read_text()).get("key") == key and (vdir / f"{line['id']}.mp3").exists()
        rows.append({"id": line["id"], "who": line["who"], "text": text, "spoken": spoken, "voice": v, "model": model, "key": key, "cached": cached})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--lang", required=True)
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--approve-spend", action="store_true")
    ap.add_argument("--force", default="")
    ap.add_argument("--trim", default="", help="cut the start of takes: l03=auto,l07=0.9 (free)")
    a = ap.parse_args()
    force = set(filter(None, a.force.split(",")))
    rows = plan(a.episode, a.lang)
    todo = [r for r in rows if not r["cached"] or r["id"] in force]
    chars = sum(len(r["text"]) for r in todo)
    S.emit("estimate", episode=a.episode, lang=a.lang, lines=len(rows), toGenerate=len(todo), characters=chars)
    if a.estimate:
        return
    if todo and not a.approve_spend:
        raise SystemExit(f"{len(todo)} new takes would spend {chars} ElevenLabs characters: run again with --approve-spend")
    vdir = S.episode_dir(a.episode) / "voice" / a.lang
    vdir.mkdir(parents=True, exist_ok=True)
    for item in filter(None, a.trim.split(",")):
        lid, _, how = item.partition("=")
        meta = vdir / f"{lid}.json"
        if not meta.exists():
            raise SystemExit(f"--trim {lid}: no take yet")
        d = json.loads(meta.read_text())
        cut = auto_trim(d, vdir / f"{lid}.mp3") if how in ("", "auto") else float(how)
        if cut is None:
            raise SystemExit(f"--trim {lid}: no pause before the first word to cut at; give the time instead ({lid}=0.9)")
        d["trimStart"] = cut
        S.save(meta, d)
        S.emit("trim", line=lid, start=cut)
    if todo:
        import requests
        h = {"xi-api-key": S.env_key(S.studio()["tts"]["keyName"])}
        voices = requests.get("https://api.elevenlabs.io/v1/voices", headers=h, timeout=30).json()["voices"]
        mine = {v["voice_id"] for v in voices}
        for r in todo:
            vid = r["voice"].get("id")
            if vid and vid not in mine:
                raise SystemExit(f"{r['voice'].get('name')} is not in your ElevenLabs voices yet: add it from the Voice Library (Add to my voices), then run again")
            if not vid:
                match = [v for v in voices if v["name"] == r["voice"]["name"]] or [v for v in voices if v["name"].startswith(r["voice"]["name"])]
                if not match:
                    raise SystemExit(f"voice not found in the ElevenLabs account: {r['voice']['name']}")
                vid = match[0]["voice_id"]
            body = {"text": r["text"], "model_id": r["model"], "voice_settings": r["voice"].get("settings", {})}
            resp = post(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128", h, body)
            if not resp.ok and resp.status_code in (400, 422) and "timestamp" in resp.text.lower():
                # a model without alignment: plain speech, word timings estimated from the audio later
                plain = post(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128", h, body)
                if not plain.ok:
                    raise SystemExit(f"{r['id']}: ElevenLabs {plain.status_code} {plain.text[:300]}")
                d = {"audio_base64": base64.b64encode(plain.content).decode(), "alignment": {}}
            elif not resp.ok:
                raise SystemExit(f"{r['id']}: ElevenLabs {resp.status_code} {resp.text[:300]}")
            else:
                d = resp.json()
            (vdir / f"{r['id']}.mp3").write_bytes(base64.b64decode(d["audio_base64"]))
            S.save(vdir / f"{r['id']}.json", {"id": r["id"], "who": r["who"], "voice": r["voice"].get("name"), "voiceId": vid, "settings": r["voice"].get("settings", {}),
                                              "model": r["model"], "text": r["text"], "key": r["key"], "alignment": d.get("alignment") or {}})
            with open(vdir / "ledger.jsonl", "a") as f:
                f.write(json.dumps({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "line": r["id"], "voice": r["voice"]["name"], "characters": len(r["text"])}, ensure_ascii=False) + "\n")
            S.emit("take", line=r["id"], who=r["who"], characters=len(r["text"]))
    for r in rows:
        mp3, wav, meta = vdir / f"{r['id']}.mp3", vdir / f"{r['id']}.wav", vdir / f"{r['id']}.json"
        trim = float(json.loads(meta.read_text()).get("trimStart") or 0)
        if not wav.exists() or wav.stat().st_mtime < max(mp3.stat().st_mtime, meta.stat().st_mtime):
            master(mp3, wav, trim=trim)
        envf = vdir / f"{r['id']}.env.json"
        if envf.exists() and envf.stat().st_mtime >= wav.stat().st_mtime and json.loads(envf.read_text()).get("key") == r["key"]:
            continue
        d = json.loads(meta.read_text())
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)], capture_output=True, text=True).stdout)
        env = envelope(wav)
        words = words_from_alignment(d.get("alignment", {}))
        if words and trim:
            words = [{**w, "s": round(max(0.0, w["s"] - trim), 3), "e": round(w["e"] - trim, 3)} for w in words if w["e"] - trim > 0]
        words = words or approx_words(r["text"], env)
        S.save(envf, {"id": r["id"], "key": r["key"], "dur": round(dur, 3), "env": env, "words": words, "aligned": bool(d.get("alignment")),
                      **({"trimStart": trim} if trim else {})})
    S.emit("voices", episode=a.episode, lang=a.lang, lines=len(rows), generated=len(todo), characters=chars)


if __name__ == "__main__":
    main()
