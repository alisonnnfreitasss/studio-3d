#!/usr/bin/env python3
"""Checks a batch of episodes before any voice is spent: the script validator, the estimated
length and shot count from the rehearsal timeline, and the ElevenLabs characters per language
(delivery tags included), with the batch total at the end.
Run: /usr/bin/python3 tools/batch_check.py <slug>...
"""
import importlib.util, sys
from pathlib import Path
import studio as S, timeline, tts

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("serve", ROOT / "server" / "serve.py")
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)

total = {}
for slug in sys.argv[1:]:
    ep, sc = S.episode(slug), S.script(slug)
    errs, warns = serve.validate(sc, ep)
    row = [slug]
    for lang in ep.get("languages", ["en", "pt"]):
        TL = timeline.build(slug, lang, estimate=True)
        rows = tts.plan(slug, lang)
        chars = sum(len(r["text"]) for r in rows)
        words = sum(len(S.text_of(l.get("say"), lang).split()) for l in sc["lines"] if not l.get("silent"))
        total[lang] = total.get(lang, 0) + chars
        row.append(f"{lang}: est {TL['end']:.1f}s, {len(TL['shots'])} shots, {words} words, {chars} chars")
    print(" | ".join(row), "| errors:", errs or "none", "| warnings:", warns or "none")
print("total characters", total, "all", sum(total.values()))
