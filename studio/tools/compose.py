#!/usr/bin/env python3
"""Write the HyperFrames project for one episode and language: episodes/<slug>/build/<lang>/.

It copies the engine, the episode's mode (with its scenarios) and only the cast's character modules, the fonts, the
mastered voice takes and the bed, then fills engine/template.html with the timeline, one caption
clip per line and one audio clip per take. Everything in build/ is generated (git-ignored).

Run: /usr/bin/python3 tools/compose.py --episode <slug> --lang pt
"""
import argparse, html, json, shutil
import studio as S


def copy(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--lang", required=True)
    a = ap.parse_args()
    root = S.ROOT
    ep = S.episode(a.episode)
    bdir = S.episode_dir(a.episode) / "build" / a.lang
    TL = S.load(bdir / "timeline.json")
    md = S.mode(ep["mode"])
    st = S.studio()
    lang_cfg = next((l for l in st["languages"] if l["id"] == a.lang), {"htmlLang": a.lang})

    for d in ("engine", "modes", "characters"):
        shutil.rmtree(bdir / d, ignore_errors=True)
    for f in ("util.js", "runtime.js"):
        copy(root / "engine" / f, bdir / "engine" / f)
    shutil.copytree(root / "modes" / ep["mode"], bdir / "modes" / ep["mode"], ignore=shutil.ignore_patterns("*.json", "*.md"))
    for cid in TL["cast"]:
        copy(root / "characters" / cid / "model.js", bdir / "characters" / cid / "model.js")
    for f in (root / "assets" / "fonts").iterdir():
        copy(f, bdir / "assets" / "fonts" / f.name)
    vdir = S.episode_dir(a.episode) / "voice" / a.lang
    shutil.rmtree(bdir / "assets" / "voice", ignore_errors=True)
    for l in TL["lines"]:
        copy(vdir / f"{l['id']}.wav", bdir / "assets" / "voice" / f"{l['id']}.wav")

    style = md["captions"]
    clips = []
    for k, c in enumerate(TL["captions"], 1):
        clips.append(f'      <p id="cap{k:02d}" class="clip caption caption--{style}" data-start="{c["start"]}" '
                     f'data-duration="{round(c["end"] - c["start"], 4)}" data-track-index="1">{html.escape(c["text"])}</p>')
    for l in TL["lines"]:
        clips.append(f'      <audio id="vo-{l["id"]}" src="assets/voice/{l["id"]}.wav" data-start="{l["start"]}" '
                     f'data-duration="{l["dur"]}" data-track-index="2" data-volume="1" data-audio-group="voiceover"></audio>')
    end = TL.get("ending") or {}
    if end.get("type") == "fade":
        dur = round(end["fadeOut"] + end["fadeHold"], 3)
        clips.append(f'      <div id="fade" class="clip fade" data-start="{round(TL["end"] - dur, 3)}" data-duration="{dur}" data-track-index="4" '
                     f'data-fade="{end["fadeOut"]}"></div>')
    bed = bdir / "assets" / "audio" / "bed.wav"
    if bed.exists():
        if md["audio"] == "music":
            clips.append(f'      <audio id="music-bed" src="assets/audio/bed.wav" data-start="0" data-duration="{TL["end"]}" '
                         f'data-track-index="3" data-volume="0.32" data-audio-group="music"></audio>')
        else:
            clips.append(f'      <audio id="room-tone" src="assets/audio/bed.wav" data-start="0" data-duration="{TL["end"]}" '
                         f'data-track-index="3" data-volume="1" data-audio-group="ambience"></audio>')
    names = {cid: f"c{i}" for i, cid in enumerate(TL["cast"])}
    imports = "\n".join(f'      import * as {names[cid]} from "./characters/{cid}/model.js";' for cid in TL["cast"])
    cmap = ", ".join(f'"{cid}": {names[cid]}' for cid in TL["cast"])
    page = (root / "engine" / "template.html").read_text()
    page = (page.replace("@@HTMLLANG@@", lang_cfg.get("htmlLang", a.lang))
                .replace("@@TITLE@@", html.escape(TL.get("title") or a.episode))
                .replace("@@END@@", str(TL["end"]))
                .replace("@@MODE@@", ep["mode"])
                .replace("@@SCENARIO@@", TL["scenario"])
                .replace("@@CHAR_IMPORTS@@", imports)
                .replace("@@CHAR_MAP@@", cmap)
                .replace("<!--@@CLIPS@@-->", "\n".join(clips))
                .replace("@@TL@@", json.dumps(TL, ensure_ascii=False)))
    (bdir / "index.html").write_text(page)
    pin = st["render"]["hyperframes"]
    S.save(bdir / "meta.json", {"id": f"{a.episode}-{a.lang}", "name": f"{a.episode}-{a.lang}"})
    S.save(bdir / "hyperframes.json", {"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json", "paths": {"assets": "assets"}, "authoringSkill": "general-video"})
    S.save(bdir / "package.json", {"name": f"{a.episode}-{a.lang}", "private": True, "type": "module",
                                   "scripts": {"check": f"npx --yes hyperframes@{pin} check", "render": f"npx --yes hyperframes@{pin} render"}})
    S.emit("compose", episode=a.episode, lang=a.lang, dir=str(bdir.relative_to(root)), captions=len(TL["captions"]), takes=len(TL["lines"]), mode=ep["mode"], scenario=TL["scenario"])


if __name__ == "__main__":
    main()
