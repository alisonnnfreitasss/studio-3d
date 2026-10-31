#!/usr/bin/env python3
"""The bed under the voices, per mode (no samples, no paid API).

  room  (desk mode): soft brown noise at about -42 dBFS RMS, in over 0.3 s, out over the last 0.8 s.
  music (keyboard mode): a light kalimba-like arpeggio over C, Am, F, G at 96 BPM with a pad,
        a soft bass and a quiet shaker, about -18 LUFS. A script line with "music": "stop" plays
        in silence, "quiet" leaves only the pad; the bed resolves on a held C chord over the end
        wide. The carve under the voices happens after compose (tools/render.py carve).

Writes episodes/<slug>/build/<lang>/assets/audio/bed.wav (needs timeline.json).
Run: /usr/bin/python3 tools/audio.py --episode <slug> --lang pt
"""
import argparse, subprocess, wave
import numpy as np
import studio as S

SR = 48000


def write_wav(path, x, channels):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def room(end, out):
    n = int(end * SR)
    rng = np.random.default_rng(11)
    x = np.cumsum(rng.standard_normal(n))
    x -= np.convolve(x, np.ones(4801) / 4801, mode="same")
    x /= np.sqrt(np.mean(x ** 2))
    x *= 10 ** (-42 / 20)
    i = np.arange(n)
    x *= np.minimum(1, i / (0.3 * SR)) * np.minimum(1, (n - i) / (0.8 * SR))
    write_wav(out, x, 1)


N = {"G2": 98.0, "A2": 110.0, "B2": 123.47, "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "G3": 196.0, "A3": 220.0,
     "B3": 246.94, "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.0, "A4": 440.0, "C5": 523.25, "F2": 87.31}
CHORDS = [("C3", ["C4", "E4", "G4"], ["C4", "E4", "G4", "C5"]), ("A2", ["A3", "C4", "E4"], ["A3", "C4", "E4", "A4"]),
          ("F2", ["F3", "A3", "C4"], ["F3", "A3", "C4", "F4"]), ("G2", ["G3", "B3", "D4"], ["G3", "B3", "D4", "G4"])]
PATTERN = [0, 1, 2, 3, 2, 1, 2, 1]


def pluck(f, dur=0.9):
    t = np.arange(int(dur * SR)) / SR
    return sum((1 / k ** 1.4) * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3.2 + 2.6 * k)) for k in range(1, 7)) * np.minimum(1, t / 0.004)


def pad(freqs, dur):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6)
    return sum(np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.003 * t) for f in freqs) * env / (1.5 * len(freqs))


def bass(f, dur=0.5):
    t = np.arange(int(dur * SR)) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 5) * np.minimum(1, t / 0.01)


def place(buf, sig, t, gain, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[0] or i < 0:
        return
    j = min(buf.shape[0], i + len(sig))
    s = sig[: j - i] * gain
    buf[i:j, 0] += s * (1 - pan) * 0.7071
    buf[i:j, 1] += s * (1 + pan) * 0.7071


def music(TL, script, out):
    end = TL["end"]
    beat = 60 / 96
    bar = 4 * beat
    marks = {l["id"]: l.get("music") for l in script["lines"] if l.get("music")}
    stops, quiets = [], []
    for s in TL["shots"]:
        m = marks.get(s.get("line"))
        if m == "stop":
            stops.append((s["start"] + 0.12, s["end"]))
        elif m == "quiet":
            quiets.append((s["start"], s["end"]))
    final = TL["shots"][-1]["start"]
    inside = lambda x, spans: any(a <= x < b for a, b in spans)
    rng = np.random.default_rng(7)
    buf = np.zeros((int((end + 1.5) * SR), 2))
    t, k = 0.0, 0
    while t < final:
        b, padn, arp = CHORDS[k % 4]
        if not inside(t, stops):
            place(buf, pad([N[n] for n in padn], min(bar, final - t) + 0.3), t, 0.05)
        for i in range(8):
            te = t + i * beat / 2
            if te >= final or inside(te, stops) or inside(te, quiets):
                continue
            place(buf, pluck(N[arp[PATTERN[i]]] * (2 if i in (3, 4) else 1)), te, 0.11, pan=(-0.25 if i % 2 else 0.25))
            if i % 2:
                n = int(0.08 * SR)
                sh = np.diff(rng.standard_normal(n), prepend=0) * np.exp(-np.arange(n) / SR * 60)
                place(buf, sh, te, 0.012, pan=0.4)
            if i in (0, 4):
                place(buf, bass(N[b]), te, 0.16)
        t += bar
        k += 1
    for i, n in enumerate(["C3", "G3", "C4", "E4", "G4", "C5"]):
        place(buf, pluck(N[n], dur=2.2), final + 0.06 * i, 0.1, pan=-0.3 + 0.12 * i)
    place(buf, pad([N["C4"], N["E4"], N["G4"]], end - final + 0.8), final, 0.05)
    stop_i, fade = int(end * SR), int(0.6 * SR)
    buf[stop_i - fade:stop_i] *= np.linspace(1, 0, fade)[:, None]
    buf = buf[:stop_i]
    buf /= max(1e-9, np.abs(buf).max()) / 0.8
    raw = out.with_suffix(".raw.wav")
    write_wav(raw, buf, 2)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-ar", str(SR), str(out)], check=True)
    raw.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--lang", required=True)
    a = ap.parse_args()
    bdir = S.episode_dir(a.episode) / "build" / a.lang
    TL = S.load(bdir / "timeline.json")
    kind = S.mode(TL["mode"])["audio"]
    out = bdir / "assets" / "audio" / "bed.wav"
    if kind == "music":
        music(TL, S.script(a.episode), out)
    else:
        room(TL["end"], out)
    S.emit("audio", episode=a.episode, lang=a.lang, kind=kind, seconds=TL["end"])


if __name__ == "__main__":
    main()
