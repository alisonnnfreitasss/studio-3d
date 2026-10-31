"""The kit's sound library: synthesised effects (no samples, nothing licensed), the soft plucked bed, the ducking and the
mixer to about -14.5 LUFS. It is the union of the approved reels' sound.py files (engine, air conditioner, microwave, roof,
light bulb, fridge, airplane, skyscraper), each effect as it was. Where two reels made different sounds under one name, the
first keeps the name and the others carry a suffix (VARIANTS below).

A reel writes only its cues.py, effects keyed to words of the take, and runs ../kit/tools/sound.py:

    from sfx import *
    add(W("b01", "roof"), whoosh(0.9), 0.3)        # at a word's start: W(beat, word start, nth=0, edge="s" or "e")
    add(S("b02") - 0.12, whoosh(0.55), 0.17)        # at a beat's start (E: its end); END is the film's length
    add(W("b15", "soft") - 0.1, bandnoise(int(1.4 * SR), 40, 300) * env_ad(T(1.4), 0.1, 0.6), 0.55)   # one-off, inline

add(time, signal, gain). Every random effect draws from one rng seeded 5, in cue order, so a mix is the same on every run.

Effects (s: seconds):
  accents     pop chime ding buzz beep bell bling ping boink boing plink plink_drop plink_drip click click_noise click_low
              click_sharp tick tick_low tick_noise tick_random ticks(d, rate) blips(d) kaching arpeggio sparkle(d)
              sparkle_chord sparkle_arp twinkle(d) shimmer(d, up) shimmer_glow(d, base) fanfare fanfare_short fanfare_bright
              riser(d, f0, f1) rise(d) rise_tone(d, f0, f1) warble(d) quack
  impacts     boom thump thud kick snare cymbal(d) clunk clunk_heavy clank(f) clang knock(f) crash(d) crunch(d) crack
              crack_glass shatter shatter_tinkle step footstep pumpstroke ratchet(d)
  motion      whoosh(d) swish(d) slide_down(d) whistle_down(d) rewind(d) rewind_down(d) rewind_buzz(d) rewind_tape(d)
              air(d, lo, hi) pssht sniff paper(d)
  machines    engine(d, rise) crank(d) whir(d) fan_whir(d) hum(d, f) motor_hum(d, amp) magnetron_hum(d, on) fan_hum(d, f)
              compressor_hum(d, f0) whine(d, f0, f1) roar(d, lo, hi, rise) rumble(d) squeal(d) wub(d) rattle(d)
              creak(d, f0) creak_wood(d) creak_saw(d) scrape(d) zap(d) arc_zap(d)
  weather     wind(d) windnoise(d, k) rain(d, heavy) rainnoise(d) thunder(d) splash(size) bubbles(d) gurgle(d) pour(d)
              gas(d) hiss(d) sizzle(d) fire(d) crackle(d) crackle_static(d) chatter(d) clatter(d) clink(f) clink_glass
              clink_bright clink_metal
  building    T(s) env_ad(t, attack, decay) bandnoise(n, lo, hi) pluck(f, dur)

VARIANTS (the name each reel used): motor_hum, twinkle, rewind_down, plink_drop, click_noise, fanfare_short: the air
conditioner's hum, sparkle, rewind, plink, click, fanfare. magnetron_hum, tick_noise, clunk_heavy, arc_zap, sparkle_chord:
the microwave's. creak_wood, plink_drip, fan_hum, sparkle_arp: the roof's. tick_random, crack_glass, shimmer_glow,
clink_glass, click_low, fanfare_bright: the light bulb's (its hum is hum with a 0.3 s fade-out, not kept). compressor_hum,
click_sharp, fan_whir, clink_bright, rewind_buzz: the fridge's. rewind_tape, clink_metal, tick_low, crackle_static,
shatter_tinkle, creak_saw: the airplane's.
"""
import re
import unicodedata

import json
import subprocess
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(5)
CUES = []                       # (time, signal, gain), in the order cues.py adds them
TL, beats, END = None, {}, 0.0  # set by load(): the reel's timeline.json


def load(timeline_path):
    global TL, beats, END
    TL = json.loads(timeline_path.read_text())
    beats = {b["id"]: b for b in TL["beats"]}
    END = TL["duration"]


def add(t, sig, g):
    CUES.append((t, sig, g))


def norm(w):
    """Lower case, no accents, no punctuation: "Aço," and "aco" are the same word, in any language."""
    w = "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9'-]", "", w.lower())


def W(bid, word, nth=0, edge="s"):
    """The time of a word of the take: in beat `bid`, the nth word starting with `word` (lower case, no punctuation);
    edge "s" for its start, "e" for its end."""
    k = 0
    for w in beats[bid]["words"]:
        if norm(w["w"]).startswith(norm(word)):
            if k == nth:
                return w[edge]
            k += 1
    raise SystemExit(f"no {word} in {bid}")


S = lambda b: beats[b]["start"]
E = lambda b: beats[b]["end"]
T = lambda n: np.arange(int(n * SR)) / SR


# ---------- every reel: the engine build's set ----------
def env_ad(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def bandnoise(n, lo, hi):
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)

def pop():
    t = T(0.14)
    f = 520 + 520 * (1 - np.exp(-t * 40))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(t, 0.003, 0.045)

def chime():
    t = T(0.9)
    return sum(a * np.sin(2 * np.pi * f * t) for f, a in [(1318.5, 0.6), (1975.5, 0.35), (2637, 0.15)]) * env_ad(t, 0.004, 0.28)

def boom():
    t = T(0.9)
    low = np.sin(2 * np.pi * (48 + 60 * np.exp(-t * 18)) * t) * env_ad(t, 0.004, 0.22)
    hit = bandnoise(len(t), 80, 2500) * env_ad(t, 0.002, 0.07)
    return 0.9 * low + 0.5 * hit

def whoosh(d=0.45):
    t = T(d)
    n = len(t)
    shape = np.sin(np.pi * t / d) ** 2
    x = bandnoise(n, 300, 3000) * shape
    return x * 0.8

def buzz():
    t = T(0.26)
    sq = np.sign(np.sin(2 * np.pi * 150 * t)) * 0.5 + np.sign(np.sin(2 * np.pi * 151.5 * t)) * 0.5
    return sq * np.minimum(1, t / 0.01) * np.minimum(1, (0.26 - t) / 0.04) * 0.45

def ding():
    t = T(0.6)
    return (np.sin(2 * np.pi * 1760 * t) + 0.5 * np.sin(2 * np.pi * 2637 * t)) * env_ad(t, 0.003, 0.18) * 0.6

def fire(d=2.2):
    t = T(d)
    n = len(t)
    body = bandnoise(n, 100, 1500) * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.6) * 0.45
    crack = np.zeros(n)
    for _ in range(40):
        i = rng.integers(0, n - 800)
        crack[i:i + 800] += bandnoise(800, 1500, 7000) * np.exp(-np.arange(800) / SR * 120) * rng.uniform(0.2, 0.7)
    burst = bandnoise(n, 200, 4000) * env_ad(t, 0.005, 0.25)
    return body + crack * 0.5 + burst * 0.7

def pour(d=1.2):
    t = T(d)
    glug = np.zeros(len(t))
    k = 0.0
    while k < d - 0.12:
        i = int(k * SR)
        tt = T(0.09)
        g = np.sin(2 * np.pi * (220 + 180 * rng.random()) * tt) * env_ad(tt, 0.004, 0.03)
        glug[i:i + len(g)] += g
        k += 0.07 + 0.05 * rng.random()
    return glug * 0.5 + bandnoise(len(t), 1500, 6000) * 0.06

def crank(d):
    t = T(d)
    rate = 7.5
    pulse = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * rate * t))) * np.exp(-((t * rate) % 1) * 3)
    tone = np.sin(2 * np.pi * 95 * t) + 0.5 * np.sign(np.sin(2 * np.pi * 190 * t))
    return (tone * 0.35 + bandnoise(len(t), 200, 2000) * 0.4) * pulse * np.minimum(1, (d - t) / 0.1)

def engine(d, rise=0.6):
    t = T(d)
    f = 55 + 35 * np.minimum(1, t / rise) + 6 * np.sin(2 * np.pi * 1.3 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    x = 0.5 * saw + 0.4 * np.sin(ph * 0.5) + 0.2 * bandnoise(len(t), 60, 600)
    return x * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.4) * 0.5

def hiss(d):
    t = T(d)
    return bandnoise(len(t), 3000, 9000) * np.minimum(1, t / 0.2) * np.minimum(1, (d - t) / 0.4) * 0.35

def scrape(d):
    t = T(d)
    x = bandnoise(len(t), 1800, 6000) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t))
    return x * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.2) * 0.35

def thump():
    t = T(0.3)
    return np.sin(2 * np.pi * (70 + 40 * np.exp(-t * 30)) * t) * env_ad(t, 0.003, 0.08)

# ---------- from the skyscraper ----------
def crash(d=1.6):
    t = T(d)
    rum = bandnoise(len(t), 40, 400) * env_ad(t, 0.01, 0.6)
    hits = np.zeros(len(t))
    for _ in range(26):
        i = rng.integers(0, int(len(t) * 0.7))
        n = 2400
        hits[i:i + n] += bandnoise(n, 300, 5000)[: len(hits) - i] * np.exp(-np.arange(n) / SR * 40)[: len(hits) - i] * rng.uniform(0.3, 0.9)
    return rum * 0.9 + hits * 0.5 + np.pad(boom(), (0, max(0, len(t) - len(boom()))))[: len(t)] * 0.7

def rewind(d=0.7):
    t = T(d)
    f = 300 + 2200 * (t / d) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    hiss = bandnoise(len(t), 1500, 8000) * 0.35 * (0.6 + 0.4 * np.sin(2 * np.pi * 30 * t))
    return (tone + hiss) * np.sin(np.pi * t / d) ** 0.7

def creak(d=1.4, f0=110):
    t = T(d)
    f = f0 + 25 * np.sin(2 * np.pi * 0.7 * t) + 8 * np.sin(2 * np.pi * 7 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sign(np.sin(ph)) * 0.3 + np.sin(ph * 2) * 0.3) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t))
    return x * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.3) * 0.5

def crunch(d=0.7):
    t = T(d)
    x = np.zeros(len(t))
    for _ in range(18):
        i = rng.integers(0, int(len(t) * 0.6))
        n = 1800
        seg = bandnoise(n, 400, 6000) * np.exp(-np.arange(n) / SR * 60) * rng.uniform(0.3, 1)
        x[i:i + n] += seg[: len(x) - i]
    return x * 0.6 + np.pad(thump(), (0, max(0, len(t) - len(thump()))))[: len(t)] * 0.8

def crack():
    t = T(0.35)
    return bandnoise(len(t), 1200, 9000) * env_ad(t, 0.001, 0.03) + bandnoise(len(t), 200, 1500) * env_ad(t, 0.002, 0.09) * 0.5

def clank(f=520):
    t = T(0.6)
    return sum(a * np.sin(2 * np.pi * f * k * t) for k, a in [(1, 0.6), (2.76, 0.35), (5.4, 0.2)]) * env_ad(t, 0.001, 0.12) + bandnoise(len(t), 2000, 8000) * env_ad(t, 0.001, 0.01) * 0.4

def shimmer(d=1.6, up=True):
    t = T(d)
    out = np.zeros(len(t))
    notes = [1046.5, 1318.5, 1568, 2093, 2637, 3136]
    for k, f in enumerate(notes if up else notes[::-1]):
        i = int(k * d / len(notes) * SR)
        tt = T(d - k * d / len(notes))
        sig = np.sin(2 * np.pi * f * tt) * env_ad(tt, 0.004, 0.35) * 0.4
        out[i:i + len(sig)] += sig[: len(out) - i]
    return out

def windnoise(d, k=1.0):
    t = T(d)
    x = bandnoise(len(t), 150, 1400) * (0.55 + 0.45 * np.sin(2 * np.pi * 0.35 * t) * np.sin(2 * np.pi * 0.11 * t + 1))
    return x * np.minimum(1, t / 0.8) * np.minimum(1, (d - t) / 0.8) * 0.45 * k

def rainnoise(d):
    t = T(d)
    x = bandnoise(len(t), 2500, 9000) * 0.35
    for _ in range(int(d * 40)):
        i = rng.integers(0, len(t) - 600)
        x[i:i + 600] += bandnoise(600, 3000, 9000) * np.exp(-np.arange(600) / SR * 300) * rng.uniform(0.1, 0.4)
    return x * np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6) * 0.5

def clatter(d=1.4):
    t = T(d)
    x = np.zeros(len(t))
    for _ in range(int(d * 45)):
        i = rng.integers(0, len(t) - 2000)
        tt = T(2000 / SR)
        f = rng.uniform(900, 2400)
        x[i:i + 2000] += np.sin(2 * np.pi * f * tt) * env_ad(tt, 0.001, 0.012) * rng.uniform(0.2, 0.6)
    return x * np.minimum(1, (d - t) / 0.4)

def plink():
    t = T(0.25)
    f = 1500 - 700 * (t / 0.25)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(t, 0.002, 0.05) * 0.5

def boing(d=0.6):
    t = T(d)
    f = 180 + 120 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(t, 0.005, 0.25) * 0.6

def hum(d, f=60):
    t = T(d)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.25 * np.sin(2 * np.pi * 3 * f * t)
    return x * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.4) * 0.25

def kick():
    t = T(0.3)
    return np.sin(2 * np.pi * (55 + 90 * np.exp(-t * 35)) * t) * env_ad(t, 0.002, 0.11)

def snare():
    t = T(0.25)
    return (bandnoise(len(t), 1500, 7000) * 0.7 + np.sin(2 * np.pi * 190 * t) * 0.4) * env_ad(t, 0.001, 0.07)

def cymbal(d=1.2):
    t = T(d)
    return bandnoise(len(t), 5000, 12000) * env_ad(t, 0.002, 0.45) * 0.6

def warble(d=0.9):
    t = T(d)
    f = 240 + 70 * np.sin(2 * np.pi * 6 * t) - 80 * t
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) * 0.4

def fanfare():
    out = np.zeros(int(1.4 * SR))
    for k, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        tt = T(1.4 - k * 0.11)
        sig = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(4 * np.pi * f * tt)) * env_ad(tt, 0.005, 0.4) * 0.35
        i = int(k * 0.11 * SR)
        out[i:i + len(sig)] += sig[: len(out) - i]
    return out

# ---------- from the air conditioner ----------
def clunk():
    # a heavy part landing on concrete or a table
    t = T(0.35)
    return 0.8 * np.sin(2 * np.pi * (95 + 60 * np.exp(-t * 25)) * t) * env_ad(t, 0.002, 0.07) + 0.4 * bandnoise(len(t), 200, 3000) * env_ad(t, 0.001, 0.03)

def ticks(d, rate):
    # a clock running fast: a tick at `rate` per second, accelerating then settling
    t = T(d)
    out = np.zeros(len(t))
    k, tt = 0, 0.0
    while tt < d - 0.03:
        i = int(tt * SR)
        n = int(0.025 * SR)
        out[i:i + n] += bandnoise(n, 2500, 7000) * np.exp(-np.arange(n) / SR * 260) * (0.7 if k % 2 else 1)
        r = rate * (0.5 + np.sin(np.pi * tt / d))
        tt += 1 / r
        k += 1
    return out * 0.6

def rewind_down(d=0.5):
    t = T(d)
    f = 1800 * np.exp(-t * 3) + 300
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + bandnoise(len(t), 800, 5000) * 0.3
    return x * np.sin(np.pi * t / d) ** 2

def twinkle(d=1.0):
    t = T(d)
    out = np.zeros(len(t))
    for k in range(9):
        i = int(rng.uniform(0, d - 0.25) * SR)
        tt = T(0.25)
        f = rng.uniform(2200, 4200)
        out[i:i + len(tt)] += np.sin(2 * np.pi * f * tt) * env_ad(tt, 0.002, 0.06) * rng.uniform(0.3, 0.7)
    return out

def bubbles(d):
    t = T(d)
    out = np.zeros(len(t))
    k = 0.0
    while k < d - 0.1:
        i = int(k * SR)
        tt = T(0.07)
        f0 = rng.uniform(500, 1100)
        out[i:i + len(tt)] += np.sin(2 * np.pi * (f0 + 1800 * tt) * tt) * env_ad(tt, 0.003, 0.02) * rng.uniform(0.2, 0.6)
        k += rng.uniform(0.04, 0.12)
    return out * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.4)

def motor_hum(d, amp):
    """the compressor: a low motor drone; amp(t) is its run level over the clip (0..1)"""
    t = T(d)
    a = amp(t)
    ph = 2 * np.pi * np.cumsum(50 + 22 * a) / SR
    x = 0.55 * np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.15 * np.sign(np.sin(3 * ph)) + 0.12 * bandnoise(len(t), 80, 400)
    return x * a * np.minimum(1, t / 0.08) * np.minimum(1, (d - t) / 0.2)

def pssht():
    t = T(0.32)
    return bandnoise(len(t), 1500, 7000) * env_ad(t, 0.01, 0.09) * 0.6 + np.sin(2 * np.pi * 140 * t) * env_ad(t, 0.004, 0.05) * 0.3

def air(d, lo=200, hi=2500):
    t = T(d)
    return bandnoise(len(t), lo, hi) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.7 * t)) * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.4) * 0.4

def plink_drop():
    t = T(0.2)
    f = 900 + 700 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(t, 0.002, 0.04)

def beep():
    t = T(0.12)
    return np.sin(2 * np.pi * 2400 * t) * np.minimum(1, t / 0.005) * np.minimum(1, (0.12 - t) / 0.02) * 0.5

def click_noise():
    t = T(0.05)
    return bandnoise(len(t), 1000, 6000) * np.exp(-t * 160) * 0.8

def chatter(d):
    t = T(d)
    out = np.zeros(len(t))
    k = 0.0
    while k < d - 0.05:
        i = int(k * SR)
        n = int(0.03 * SR)
        out[i:i + n] += bandnoise(n, 1500, 5000) * np.exp(-np.arange(n) / SR * 150)
        k += 0.055
    return out * 0.5 * np.minimum(1, (d - t) / 0.3)

def fanfare_short():
    out = np.zeros(int(1.2 * SR))
    for j, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        tt = T(0.7)
        sig = sum((1 / k) * np.sin(2 * np.pi * f * k * tt) for k in (1, 2, 3)) * env_ad(tt, 0.004, 0.22)
        i = int(j * 0.09 * SR)
        out[i:i + len(sig)] += sig * 0.4
    return out

def slide_down(d=1.0):
    t = T(d)
    f = 900 * np.exp(-t * 1.3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.02) * np.minimum(1, (d - t) / 0.2) * 0.35

# ---------- from the microwave ----------
def magnetron_hum(d, on=None):
    """The magnetron running: a 120 Hz transformer buzz, its harmonics and a soft fan; `on` gates it."""
    t = T(d)
    x = 0.55 * np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t) + 0.12 * np.sign(np.sin(2 * np.pi * 120 * t)) * 0.5
    x += 0.35 * bandnoise(len(t), 200, 1800)
    g = np.ones(len(t)) if on is None else on(t)
    k = int(0.03 * SR)
    g = np.convolve(g, np.ones(k) / k, mode="same")  # 30 ms ramps at each switch
    return x * g * np.minimum(1, t / 0.08) * np.minimum(1, (d - t) / 0.12)

def wub(d=0.7):
    t = T(d)
    f = 70 + 50 * np.sin(2 * np.pi * 9 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2 * 0.8

def rattle(d):
    t = T(d)
    x = np.zeros(len(t))
    k = 0.0
    while k < d - 0.03:
        i = int(k * SR)
        g = bandnoise(600, 2500, 7000) * np.exp(-np.arange(600) / SR * 300) * rng.uniform(0.3, 1)
        x[i:i + 600] += g[: max(0, len(x) - i)]
        k += 0.022 + 0.02 * rng.random()
    return x * np.minimum(1, t / 0.2) * np.minimum(1, (d - t) / 0.2) * 0.5

def sizzle(d):
    t = T(d)
    body = bandnoise(len(t), 2500, 9000) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 3.1 * t))) * 0.4
    crack = np.zeros(len(t))
    for _ in range(int(d * 30)):
        i = rng.integers(0, max(1, len(t) - 500))
        crack[i:i + 500] += bandnoise(500, 3000, 9000) * np.exp(-np.arange(500) / SR * 200) * rng.uniform(0.2, 0.8)
    return (body + crack * 0.6) * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.4)

def tick_noise():
    t = T(0.04)
    return bandnoise(len(t), 2000, 6000) * np.exp(-t * 160) * 0.8

def click():
    t = T(0.06)
    return (np.sin(2 * np.pi * 2400 * t) * 0.5 + bandnoise(len(t), 1500, 6000) * 0.6) * np.exp(-t * 90)

def clunk_heavy():
    t = T(0.35)
    low = np.sin(2 * np.pi * (90 + 60 * np.exp(-t * 25)) * t) * env_ad(t, 0.002, 0.09)
    return 0.9 * low + 0.35 * bandnoise(len(t), 300, 3000) * env_ad(t, 0.001, 0.03)

def arc_zap(d):
    t = T(d)
    x = np.zeros(len(t))
    k = 0.0
    while k < d - 0.05:
        i = int(k * SR)
        n = int(SR * (0.02 + 0.05 * rng.random()))
        g = bandnoise(n, 1500, 11000) * rng.uniform(0.5, 1.0)
        x[i:i + n] += g[: max(0, len(x) - i)]
        k += 0.04 + 0.08 * rng.random()
    return x * 0.7

def bell(f0=1568.0, d=1.6):
    t = T(d)
    parts = [(1.0, 1.0, 0.9), (2.0, 0.45, 0.5), (2.76, 0.3, 0.35), (5.4, 0.12, 0.2)]
    return sum(a * np.sin(2 * np.pi * f0 * m * t) * np.exp(-t / dd) for m, a, dd in parts) * np.minimum(1, t / 0.002) * 0.7

def whir(d):
    t = T(d)
    return (np.sin(2 * np.pi * 85 * t) * 0.4 + bandnoise(len(t), 150, 900) * 0.5) * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.3)

def sparkle_chord():
    t = T(0.7)
    return sum(np.sin(2 * np.pi * f * t) * env_ad(t - k * 0.05, 0.002, 0.12) * (t > k * 0.05) for k, f in enumerate([2093, 2637, 3136, 4186])) * 0.4

def gas(d):
    t = T(d)
    return bandnoise(len(t), 400, 5000) * 0.25 * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.5)

# ---------- from the roof ----------
def rain(d, heavy=0.0):
    t = T(d)
    n = len(t)
    hiss_ = bandnoise(n, 900, 9000) * 0.28
    body = bandnoise(n, 200, 1400) * 0.12 * (1 + heavy)
    plinks = np.zeros(n)
    k = int(d * (90 + 160 * heavy))
    for _ in range(k):
        i = rng.integers(0, max(1, n - 900))
        f = rng.uniform(2200, 5200)
        tt = np.arange(900) / SR
        plinks[i:i + 900] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 260) * rng.uniform(0.05, 0.22)
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.8)
    return (hiss_ + body + plinks) * env

def thunder(d=3.2):
    t = T(d)
    low = bandnoise(len(t), 25, 220) * (np.exp(-t * 1.1) * (0.6 + 0.4 * np.sin(2 * np.pi * 3.1 * t) ** 2))
    crack_ = bandnoise(len(t), 400, 5000) * env_ad(t, 0.004, 0.09) * 0.5
    return (low * 1.1 + crack_) * np.minimum(1, (d - t) / 0.5)

def wind(d):
    t = T(d)
    x = bandnoise(len(t), 250, 1600) * (0.55 + 0.45 * np.sin(2 * np.pi * 0.7 * t + 1.3) ** 2)
    return x * np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 0.6) * 0.6

def clink(f=None):
    t = T(0.18)
    f = f or rng.uniform(1700, 2600)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t)) * env_ad(t, 0.001, 0.03) + bandnoise(len(t), 2000, 7000) * env_ad(t, 0.001, 0.008) * 0.6

def knock(f=180):
    t = T(0.22)
    return np.sin(2 * np.pi * (f + 60 * np.exp(-t * 40)) * t) * env_ad(t, 0.001, 0.045) + bandnoise(len(t), 300, 3000) * env_ad(t, 0.001, 0.012) * 0.7

def creak_wood(d=1.6):
    t = T(d)
    f = 95 + 40 * np.sin(2 * np.pi * 0.6 * t) + 15 * np.sin(2 * np.pi * 3.3 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    grit = (np.sin(2 * np.pi * 37 * t) > 0.6).astype(float)
    return saw * (0.4 + 0.6 * grit) * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.3) * 0.35

def crackle(d=0.45):
    t = T(d)
    x = np.zeros(len(t))
    for _ in range(26):
        i = rng.integers(0, len(t) - 600)
        x[i:i + 600] += bandnoise(600, 1200, 8000) * np.exp(-np.arange(600) / SR * 160) * rng.uniform(0.3, 1)
    return x + bandnoise(len(t), 80, 600) * env_ad(t, 0.002, 0.06) * 0.8

def plink_drip():
    t = T(0.25)
    f = 1150 + 600 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(t, 0.001, 0.05)

def gurgle(d):
    t = T(d)
    g = np.zeros(len(t))
    k = 0.0
    while k < d - 0.12:
        i = int(k * SR)
        tt = T(0.08)
        g[i:i + len(tt)] += np.sin(2 * np.pi * (180 + 220 * rng.random()) * tt * (1 + tt * 6)) * env_ad(tt, 0.004, 0.025)
        k += 0.05 + 0.06 * rng.random()
    return g * 0.5 * np.minimum(1, (d - t) / 0.3)

def swish(d=1.4):
    t = T(d)
    return bandnoise(len(t), 500, 5000) * np.sin(np.pi * t / d) ** 1.5 * 0.5

def clang():
    t = T(0.9)
    return sum(a * np.sin(2 * np.pi * f * t) for f, a in [(523, 0.5), (1310, 0.35), (2240, 0.25), (3460, 0.12)]) * env_ad(t, 0.002, 0.22)

def fan_hum(d, f=110):
    t = T(d)
    return (np.sin(2 * np.pi * f * t) * 0.5 + bandnoise(len(t), 300, 2500) * 0.25 * (0.8 + 0.2 * np.sin(2 * np.pi * 14 * t))) * np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4) * 0.35

def sparkle_arp():
    t = T(1.2)
    out = np.zeros(len(t))
    for j, f in enumerate([1046.5, 1318.5, 1568, 2093]):
        i = int(j * 0.07 * SR)
        tt = T(1.2 - j * 0.07)
        out[i:i + len(tt)] += np.sin(2 * np.pi * f * tt) * env_ad(tt, 0.003, 0.35) * 0.5
    return out

# ---------- from the light bulb ----------
def zap(d=0.5):
    # an electric crackle: a buzzy saw with random gaps and a hiss of sparks
    t = T(d)
    saw = 2 * ((t * 120) % 1) - 1
    gate = (rng.random(len(t)) > 0.35).astype(float)
    gate = np.convolve(gate, np.ones(240) / 240, mode="same")
    return (0.5 * saw * gate + 0.5 * bandnoise(len(t), 2500, 9000) * gate) * np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.08)

def sparkle(d=2.0, density=60):
    t = T(d)
    x = np.zeros(len(t))
    for _ in range(int(density * d)):
        i = rng.integers(0, max(1, len(t) - 2000))
        f = rng.uniform(2500, 6000)
        tt = T(0.04)
        x[i:i + len(tt)] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 90) * rng.uniform(0.2, 0.6)
    return x * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.3)

def pumpstroke():
    t = T(0.3)
    return bandnoise(len(t), 600, 5000) * np.sin(np.pi * t / 0.3) ** 2 * 0.7

def shatter():
    t = T(1.0)
    x = bandnoise(len(t), 2000, 10000) * env_ad(t, 0.001, 0.12)
    for _ in range(26):
        i = rng.integers(0, len(t) - 3000)
        tt = T(0.06)
        x[i:i + len(tt)] += np.sin(2 * np.pi * rng.uniform(3000, 7500) * tt) * np.exp(-tt * 60) * rng.uniform(0.2, 0.7)
    return x * 0.8

def riser(d, f0=300, f1=1400):
    t = T(d)
    f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / d) ** 1.5 * np.minimum(1, (d - t) / 0.03) * 0.5

def tick_random():
    t = T(0.05)
    return np.sin(2 * np.pi * rng.uniform(2200, 4200) * t) * np.exp(-t * 120)

def ping(f=1800):
    t = T(0.8)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t)) * env_ad(t, 0.002, 0.2)

def boink():
    t = T(0.22)
    f = 520 * np.exp(-t * 8) + 200
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(t, 0.004, 0.08)

def crack_glass():
    t = T(0.5)
    x = bandnoise(len(t), 1200, 9000) * env_ad(t, 0.001, 0.04)
    x += 0.6 * np.sin(2 * np.pi * 2900 * t) * env_ad(t, 0.001, 0.15)
    return x

def bling():
    t = T(0.9)
    return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * (5 + k * 2)) for k, (f, a) in enumerate([(1046.5, 0.5), (1568, 0.4), (2093, 0.3), (3136, 0.15)])) * np.minimum(1, t / 0.003)

def shimmer_glow(d=1.6, base=880):
    t = T(d)
    x = sum(np.sin(2 * np.pi * base * m * t + m) * (0.5 + 0.5 * np.sin(2 * np.pi * (3 + m) * t)) for m in (1, 1.5, 2, 3)) / 4
    return x * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.5) * 0.6

def clink_glass():
    t = T(0.5)
    return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * 14) for f in (2300, 3700, 5200)) / 3 * np.minimum(1, t / 0.001)

def click_low():
    t = T(0.06)
    return (bandnoise(len(t), 1500, 8000) * np.exp(-t * 160) + np.sin(2 * np.pi * 1200 * t) * np.exp(-t * 90)) * 0.8

def ratchet(d):
    t = T(d)
    x = np.zeros(len(t))
    k = 0.0
    while k < d - 0.05:
        i = int(k * SR)
        c = click_low()
        x[i:i + len(c)] += c[: len(x) - i] * 0.6
        k += 0.09
    return x

def fanfare_bright():
    out = np.zeros(int(1.6 * SR))
    for k, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        i = int(k * 0.11 * SR)
        tt = T(1.2)
        n = sum((1 / h) * np.sin(2 * np.pi * f * h * tt) for h in (1, 2, 3)) * env_ad(tt, 0.004, 0.35)
        out[i:i + len(n)] += n[: len(out) - i] * 0.5
    return out

# ---------- from the fridge ----------
def sniff():
    t = T(0.35)
    return bandnoise(len(t), 1800, 6500) * np.minimum(1, t / 0.12) * np.exp(-np.maximum(0, t - 0.12) * 18) * 0.6

def blips(d, rate=9.0):
    t = T(d)
    out = np.zeros(len(t))
    k = 0.0
    while k < d - 0.1:
        tt = T(0.07)
        f = 700 + 900 * rng.random()
        g = np.sin(2 * np.pi * (f + 900 * tt / 0.07) * tt) * env_ad(tt, 0.002, 0.02)
        i = int(k * SR)
        out[i:i + len(g)] += g * (0.4 + 0.6 * rng.random())
        k += rng.exponential(1 / rate)
    return out * np.minimum(1, t / 0.2) * np.minimum(1, (d - t) / 0.3)

def compressor_hum(d, f0=58):
    t = T(d)
    x = 0.6 * np.sin(2 * np.pi * f0 * t) + 0.3 * np.sin(2 * np.pi * 2 * f0 * t) + 0.12 * np.sign(np.sin(2 * np.pi * 3 * f0 * t))
    x += bandnoise(len(t), 80, 400) * 0.15
    return x * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.15)

def click_sharp():
    t = T(0.06)
    return (bandnoise(len(t), 1500, 8000) * 0.6 + np.sin(2 * np.pi * 2400 * t) * 0.4) * env_ad(t, 0.0008, 0.012)

def thud():
    t = T(0.35)
    return np.sin(2 * np.pi * (90 + 50 * np.exp(-t * 25)) * t) * env_ad(t, 0.002, 0.07) + bandnoise(len(t), 100, 1200) * env_ad(t, 0.001, 0.03) * 0.4

def paper(d=0.3):
    t = T(d)
    return bandnoise(len(t), 2000, 9000) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 23 * t))) * np.minimum(1, t / 0.02) * np.minimum(1, (d - t) / 0.08) * 0.5

def tick():
    t = T(0.03)
    return np.sin(2 * np.pi * 3200 * t) * env_ad(t, 0.0005, 0.006)

def step():
    t = T(0.12)
    return (np.sin(2 * np.pi * (140 + 60 * np.exp(-t * 40)) * t) * 0.6 + bandnoise(len(t), 300, 3000) * 0.4) * env_ad(t, 0.002, 0.03)

def fan_whir(d):
    t = T(d)
    x = bandnoise(len(t), 250, 1400) * (0.75 + 0.25 * np.sin(2 * np.pi * 31 * t)) + 0.2 * np.sin(2 * np.pi * 124 * t)
    return x * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.3) * 0.4

def clink_bright():
    t = T(0.25)
    return sum(a * np.sin(2 * np.pi * f * t) for f, a in [(2900, 0.5), (4300, 0.3), (6100, 0.2)]) * env_ad(t, 0.001, 0.05)

def rise(d=1.2):
    t = T(d)
    f = 500 + 1500 * (t / d) ** 1.5
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2 * 0.4 + bandnoise(len(t), 3000, 9000) * np.sin(np.pi * t / d) ** 2 * 0.08

def rewind_buzz(d=0.55):
    t = T(d)
    f = 2400 - 1800 * (t / d)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 + bandnoise(len(t), 600, 5000) * 0.5
    return x * np.sin(np.pi * t / d) ** 1.5 * 0.6

def kaching():
    t = T(0.8)
    bell = sum(a * np.sin(2 * np.pi * f * t) for f, a in [(1568, 0.5), (2093, 0.4), (3136, 0.2)]) * env_ad(t, 0.002, 0.25)
    return bell * (t > 0.06) + np.pad(click_sharp(), (0, len(t) - len(click_sharp()))) * 1.2

def arpeggio():
    out = np.zeros(int(1.2 * SR))
    for i, f in enumerate([1046.5, 1318.5, 1568, 2093]):
        tt = T(0.6)
        g = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)) * env_ad(tt, 0.003, 0.2)
        j = int(i * 0.09 * SR)
        out[j:j + len(g)] += g
    return out * 0.5

# ---------- from the airplane ----------
def splash(size=1.0):
    t = T(1.4)
    n = len(t)
    body = bandnoise(n, 300, 6000) * env_ad(t, 0.01, 0.35 * size)
    low = np.sin(2 * np.pi * (60 + 50 * np.exp(-t * 12)) * t) * env_ad(t, 0.004, 0.18)
    drops = np.zeros(n)
    for _ in range(int(18 * size)):
        i = rng.integers(int(0.1 * SR), n - 2000)
        tt = T(0.04)
        drops[i:i + len(tt)] += np.sin(2 * np.pi * rng.uniform(900, 2400) * tt) * env_ad(tt, 0.001, 0.012) * rng.uniform(0.2, 0.6)
    return 0.8 * body + 0.6 * low + 0.5 * drops

def quack():
    t = T(0.2)
    f = 520 - 260 * t / 0.2
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    X = np.fft.rfft(saw * np.minimum(1, t / 0.01) * np.minimum(1, (0.2 - t) / 0.05))
    fr = np.fft.rfftfreq(len(t), 1 / SR)
    X *= np.exp(-((fr - 1300) / 700) ** 2) + 0.4 * np.exp(-((fr - 2600) / 500) ** 2)
    y = np.fft.irfft(X, len(t))
    return y / (np.abs(y).max() + 1e-9) * 0.8

def whine(d, f0, f1):
    t = T(d)
    f = f0 + (f1 - f0) * np.minimum(1, t / max(0.3, d * 0.7))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * 0.5 + 0.25 * np.sin(2 * ph) + 0.15 * bandnoise(len(t), 2000, 7000)
    return x * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.3)

def roar(d, lo=60, hi=1800, rise=0.3):
    t = T(d)
    x = bandnoise(len(t), lo, hi) * 0.7 + 0.3 * bandnoise(len(t), 30, 160)
    return x * np.minimum(1, t / rise) * np.minimum(1, (d - t) / 0.4)

def rewind_tape(d):
    t = T(d)
    f = 300 + 2600 * (t / d) ** 1.5
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    flutter = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 22 * t))
    return (saw * 0.35 + bandnoise(len(t), 1500, 8000) * 0.25) * flutter * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.05)

def clink_metal():
    t = T(0.35)
    return sum(a * np.sin(2 * np.pi * f * t) for f, a in [(2200, 0.5), (3400, 0.3), (5100, 0.15)]) * env_ad(t, 0.001, 0.07)

def squeal(d):
    t = T(d)
    f = 1500 + 120 * np.sin(2 * np.pi * 7 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * 0.5 + bandnoise(len(t), 1200, 4000) * 0.3) * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.2)

def tick_low():
    t = T(0.03)
    return np.sin(2 * np.pi * 2800 * t) * env_ad(t, 0.0005, 0.006)

def crackle_static(d):
    t = T(d)
    x = np.zeros(len(t))
    k = 0.0
    while k < d - 0.03:
        i = int(k * SR)
        tt = T(0.02)
        x[i:i + len(tt)] += bandnoise(len(tt), 1500, 9000) * env_ad(tt, 0.0005, 0.004) * rng.uniform(0.3, 1.0)
        k += rng.uniform(0.008, 0.05)
    return x

def shatter_tinkle():
    t = T(0.9)
    x = bandnoise(len(t), 2000, 11000) * env_ad(t, 0.002, 0.18)
    tinkle = np.zeros(len(t))
    for _ in range(26):
        i = rng.integers(0, len(t) - 3000)
        tt = T(0.06)
        tinkle[i:i + len(tt)] += np.sin(2 * np.pi * rng.uniform(3000, 7000) * tt) * env_ad(tt, 0.001, 0.02) * rng.uniform(0.2, 0.7)
    return 0.6 * x + 0.5 * tinkle

def rumble(d):
    t = T(d)
    x = bandnoise(len(t), 25, 220) * (0.6 + 0.4 * np.sin(2 * np.pi * 3.1 * t) * np.sin(2 * np.pi * 1.3 * t))
    return x * np.minimum(1, t / 0.2) * np.minimum(1, (d - t) / 0.4)

def footstep():
    t = T(0.09)
    return bandnoise(len(t), 150, 1800) * env_ad(t, 0.002, 0.02) * 0.8

def whistle_down(d):
    t = T(d)
    f = 1700 - 1100 * t / d
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.minimum(1, t / 0.1) * np.minimum(1, (d - t) / 0.1) * 0.5

def creak_saw(d):
    t = T(d)
    f = 110 + 40 * np.sin(2 * np.pi * 2.1 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    return saw * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 2.1 * t))) * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.2) * 0.35

def rise_tone(d, f0=300, f1=700):
    t = T(d)
    f = f0 + (f1 - f0) * t / d
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.minimum(1, t / 0.1) * np.minimum(1, (d - t) / 0.2) * 0.4

# ---------- the bed: soft plucks over C, Am, F, G at 100 BPM ----------
N = {n: 440 * 2 ** ((i - 9) / 12 + o - 4) for o in range(2, 7) for i, n0 in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) for n in [f"{n0}{o}"]}


def pluck(f, dur=0.8):
    t = T(dur)
    return sum((1 / k ** 1.5) * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3.5 + 2.8 * k)) for k in range(1, 6)) * np.minimum(1, t / 0.004)


def bed():
    beat = 60 / 100
    chords = [("C3", ["C4", "E4", "G4", "C5"]), ("A2", ["A3", "C4", "E4", "A4"]), ("F2", ["F3", "A3", "C4", "F4"]), ("G2", ["G3", "B3", "D4", "G4"])]
    pat = [0, 1, 2, 3, 2, 1, 2, 3]
    buf = np.zeros(int((END + 2) * SR))
    t, k = 0.0, 0
    while t < END:
        b, arp = chords[k % 4]
        for i in range(8):
            te = t + i * beat / 2
            sig = pluck(N[arp[pat[i]]]) * 0.12
            j = int(te * SR)
            buf[j:j + len(sig)] += sig[: max(0, len(buf) - j)]
        bs = np.sin(2 * np.pi * N[b] * T(1.2)) * np.exp(-T(1.2) * 2.5) * 0.12
        j = int(t * SR)
        buf[j:j + len(bs)] += bs[: max(0, len(buf) - j)]
        t += 4 * beat
        k += 1
    buf = buf[: int(END * SR)]
    n = len(buf)
    i = np.arange(n)
    buf *= np.minimum(1, i / (0.5 * SR)) * np.minimum(1, (n - i) / (1.0 * SR))
    return buf


def read_wav(p):
    with wave.open(str(p)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(axis=1)
    return x


def loudness(path):
    """Integrated loudness (LUFS), loudness range (LU) and true peak (dBTP) of a file, from ffmpeg's ebur128 summary."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    tail = r[r.rfind("Summary:"):] if "Summary:" in r else r
    out = {}
    for line in tail.splitlines():
        p = line.split()
        if len(p) >= 2 and p[0] in ("I:", "LRA:", "Peak:"):
            try:
                out[{"I:": "I", "LRA:": "LRA", "Peak:": "TP"}[p[0]]] = float(p[1])
            except ValueError:
                pass
    return out


def aac_peak(wav):
    """True peak (dBTP) once encoded the way HyperFrames encodes a render's sound (AAC 192k)."""
    tmp = wav.with_name(wav.stem + ".aactest.m4a")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "aac", "-b:a", "192k", str(tmp)], check=True)
    tp = loudness(tmp).get("TP", 0.0)
    tmp.unlink()
    return tp


def aac_safe(wav):
    """HyperFrames lowers a render's whole sound when its AAC encode peaks over -1 dBTP (a playful mix peaked
    at -4.2 dBFS as WAV but -0.2 dBTP as AAC, and the skyscraper's variant came out 1.3 dB quiet). A real song's top
    octave makes the encoder overshoot; a lowpass above 16 kHz (inaudible on a phone) settles it. Returns the lowpass used."""
    if aac_peak(wav) <= -1.5:
        return None
    for f in (18000, 19000, 17000, 16500):
        cand = wav.with_name(wav.stem + f".lp{f}.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af", f"lowpass=f={f}", "-c:a", "pcm_s16le", str(cand)], check=True)
        if aac_peak(cand) <= -1.5:
            cand.replace(wav)
            return f
        cand.unlink()
    raise SystemExit(f"{wav.name}: its AAC true peak stays over -1.5 dBTP; HyperFrames would lower the whole sound")


def mix(voice_wav, out_wav, target=-14.5, bed_gain=0.55, duck_depth=0.45, bed_file=None):
    """Voice + every cue + the bed ducked under the voice (sidechain from the voice's envelope), then a compressor, a
    limiter and loudnorm to `target` LUFS. Single-pass loudnorm can land a few tenths off: one measured gain step brings
    it back when it misses by more than 0.2 LU (within that it is left as it is, like the approved reels' mixes)."""
    voice = read_wav(voice_wav)
    n = int(END * SR)
    voice = np.pad(voice, (0, max(0, n - len(voice))))[:n]
    fx = np.zeros(n)
    for t, sig, g in CUES:
        i = int(t * SR)
        if i < 0 or i >= n:
            continue
        j = min(n, i + len(sig))
        fx[i:j] += sig[: j - i] * g
    b = bed()
    if bed_file:
        # a real track (music.py) in place of the synthesised bed, level-matched to the synthesised bed's RMS so
        # bed_gain means the same thing for both; faded in 0.5 s and out over the last 1.5 s
        rms = np.sqrt(np.mean(b ** 2))
        dec = subprocess.run(["ffmpeg", "-v", "error", "-i", str(bed_file), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                             capture_output=True, check=True).stdout
        b = np.frombuffer(dec, dtype=np.int16).astype(np.float64) / 32768
        b = b * (rms / (np.sqrt(np.mean(b ** 2)) + 1e-9))
        if len(b) < n:
            # a track shorter than the reel loops: its last 2 s (the ending) crossfade into its start, again and again
            xf = int(2.0 * SR)
            ramp = np.linspace(0, 1, xf)
            one, out = b.copy(), b.copy()
            while len(out) < n:
                out[-xf:] = out[-xf:] * (1 - ramp) + one[:xf] * ramp
                out = np.concatenate([out, one[xf:]])
            b = out
        b = np.pad(b, (0, max(0, n - len(b))))[:n]
        i = np.arange(n)
        b *= np.minimum(1, i / (0.5 * SR)) * np.minimum(1, (n - i) / (1.5 * SR))
    b = np.pad(b, (0, max(0, n - len(b))))[:n]
    env = np.convolve(np.abs(voice), np.ones(2400) / 2400, mode="same")
    duck = 1 - duck_depth * np.clip(env / (env.max() * 0.25 + 1e-9), 0, 1)
    m = voice * 1.0 + fx + b * duck * bed_gain
    raw = out_wav.with_name("mix.raw.wav")
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(m / max(1, np.abs(m).max() / 0.95), -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", f"acompressor=threshold=-20dB:ratio=4:attack=4:release=90:makeup=4,alimiter=limit=0.89:attack=2:release=40,loudnorm=I={target:g}:TP=-1.2:LRA=5", "-ar", str(SR), "-ac", "2", str(out_wav)], check=True)
    raw.unlink()
    lv = loudness(out_wav)
    i0 = lv.get("I")
    if i0 is not None and abs(i0 - target) > 0.2:
        tmp = out_wav.with_name("mix.tmp.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out_wav), "-af", f"volume={target - i0:.2f}dB", "-ar", str(SR), str(tmp)], check=True)
        tmp.replace(out_wav)
        lv = loudness(out_wav)
        lv["before_step"] = i0
    lp = aac_safe(out_wav)
    if lp:
        lv = {**loudness(out_wav), **({"before_step": lv["before_step"]} if "before_step" in lv else {}), "lowpass": lp}
    return lv
