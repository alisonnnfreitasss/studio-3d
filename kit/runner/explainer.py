#!/usr/bin/python3
"""The topic-to-reel pipeline: runs each step in order, stops at the gates, and keeps run.json for the live board.

    /usr/bin/python3 explainer.py new <slug> "<topic>" [--brand b] [--speed express|standard|studio] [--seconds n]
    /usr/bin/python3 explainer.py run <reel folder>       run until the next gate or the end (safe to run again: done steps are kept)
    /usr/bin/python3 explainer.py approve <reel folder> <gate>

Agent steps are separate `claude -p` processes on the person's own Claude plan (the API key is removed from their
environment so nothing bills the API). Other steps run the kit's tools. Nothing paid runs before its gate is approved.
"""
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
TOOLS = KIT / "tools"
PROMPTS = Path(__file__).resolve().parent / "prompts"
ROOT = KIT.parent.parent / "studio-3d/explainers"
PY = "/usr/bin/python3"
AGENT_TOOLS = "Bash,Read,Write,Edit,Glob,Grep"
LANGS = {"en": "English", "pt": "Brazilian Portuguese"}
LANG_RULES = {"en": "", "pt": "Portuguese is casual and spoken, as a Brazilian talks to a friend (\"pra\", \"tá\"), never formal."}

SPEEDS = {
    "express": {"label": "Express", "about": "Existing assets, one builder, one fix at most", "fixes": 1, "model": "sonnet", "agent_minutes": 20,
                "steps": ["script", "gate:script", "voice", "gate:voice", "build", "render"]},
    "standard": {"label": "Standard", "about": "Plan, world and direction agents, the shot map to approve, two fixes at most", "fixes": 2, "model": None, "agent_minutes": 45,
                 "steps": ["script", "gate:script", "voice", "gate:voice", "plan", "world", "direction", "shotmap", "gate:shotmap", "render"]},
    "studio": {"label": "Studio", "about": "Standard plus new models, a fresh-eyes review and four fixes at most", "fixes": 4, "model": None, "agent_minutes": 60,
               "steps": ["script", "gate:script", "voice", "gate:voice", "plan", "world", "direction", "shotmap", "gate:shotmap", "render", "review"]},
}
SCRIBE_PER_MIN = 0.4 / 60       # US$, ElevenLabs Scribe, as measured
TITLES = {"translate": "Translate the script", "relocalize": "Move the picture to the new language", "reference": "Measure the reference", "gate:reference": "You: approve the transcript cost", "script": "Script", "gate:script": "You: approve the script", "voice": "Voice", "gate:voice": "You: approve the voice cost", "plan": "Plan",
          "world": "World", "direction": "Direction", "build": "Build", "shotmap": "Shot map", "gate:shotmap": "You: approve the shot map",
          "render": "Render and checks", "review": "Fresh-eyes review", "fix": "Fix"}


def reel_path(arg):
    p = Path(arg)
    return p.resolve() if p.exists() else ROOT / arg


class Run:
    def __init__(self, d):
        self.d = d
        self.topic = json.loads((d / "topic.json").read_text())
        self.path = d / "run.json"
        self.speed = SPEEDS[self.topic.get("speed", "standard")]
        if self.path.exists():
            self.s = json.loads(self.path.read_text())
        else:
            first = ["reference", "gate:reference"] if self.topic.get("source") == "video" else []
            steps = first + self.speed["steps"]
            if self.topic.get("source") == "translation":
                steps = ["translate", "gate:script", "voice", "gate:voice", "relocalize", "render"]
            self.s = {"state": "new", "steps": [{"id": x, "title": TITLES[x], "state": "todo"} for x in steps],
                      "approved": {}, "fixes": 0, "video": None, "tokens": 0, "created": time.time()}

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.s, indent=1, ensure_ascii=False))
        tmp.replace(self.path)

    def step(self, sid):
        return next(x for x in reversed(self.s["steps"]) if x["id"] == sid)

    def begin(self, st):
        st.update(state="running", started=time.time(), log=[])
        self.s["state"] = "running"
        self.s["current"] = st["id"]
        self.save()

    def end(self, st, state="done", **kw):
        st.update(state=state, ended=time.time(), **kw)
        self.save()

    def note(self, st, line):
        st.setdefault("log", []).append(line[:220])
        st["log"] = st["log"][-40:]
        self.save()

    def tool(self, st, cmd, env=None):
        """A kit tool: output goes to the step's log; returns its exit code."""
        self.note(st, "$ " + " ".join(Path(c).name if "/" in c else c for c in cmd))
        p = subprocess.Popen(cmd, cwd=self.d, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, **(env or {})})
        for line in p.stdout:
            if line.strip():
                self.note(st, line.rstrip())
        return p.wait()

    def fill(self, name, **extra):
        words = int(self.topic.get("seconds", 60) * 2.9)
        lang = self.topic.get("language", "en")
        vals = {"KIT": str(KIT), "TOPIC": self.topic.get("topic", ""), "SECONDS": str(self.topic.get("seconds", 60)), "WORDS": str(words),
                "SPEED": self.speed["label"], "NOTES": self.topic.get("topic", ""), "LANGUAGE": LANGS[lang], "LANG_RULES": LANG_RULES[lang],
                "SOURCE_LANG": LANGS[self.topic.get("source_language", "en")], **extra}
        text = (PROMPTS / "common.md").read_text() + "\n" + (PROMPTS / f"{name}.md").read_text()
        if self.topic.get("format") == "cinematic":
            text += f"\nThis reel is in the Cinematic mode: realistic and dark, voice only, no character (CAST = []) unless the topic.json says otherwise. Read {KIT}/CINEMATIC.md first and build on js/cine.js and assets/cine. It overrides anything in FORMAT.md or EXPRESS.md about a lead character, bright colours or labels.\n"
        if self.topic.get("source") == "video" and name != "script_video":
            text += "\nThis reel follows a reference video: reference/packs/ref.md and its contact sheet hold its measured beats, cuts, camera and labels. Follow its structure and camera grammar; the words and the world stay our own.\n"
        for k, v in vals.items():
            text = text.replace("{" + k + "}", v)
        return text

    def agent(self, st, prompt):
        """One clean claude -p process; every action it takes lands on the board. True when it finished."""
        claude = shutil.which("claude") or next((str(p) for p in sorted(Path.home().glob(".vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude"))[-1:]), None) or str(Path.home() / ".local/bin/claude")
        prompt += f"\n\nThis reel's folder is {self.d}. Write every file there by its full path, whatever folder a command has moved you to."
        cmd = [claude, "-p", prompt, "--output-format", "stream-json", "--verbose", "--tools", AGENT_TOOLS, "--allowedTools", AGENT_TOOLS,
               "--permission-mode", "dontAsk", "--add-dir", str(KIT), "--strict-mcp-config", "--disable-slash-commands",
               "--setting-sources", "local", "--no-session-persistence"]
        if self.speed["model"]:
            cmd += ["--model", self.speed["model"]]
        env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "ANTHROPIC"))}
        p = subprocess.Popen(cmd, cwd=self.d, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        st["agent_pid"] = p.pid
        ok = False
        limit = threading.Timer(self.speed["agent_minutes"] * 60, p.kill)   # a runaway agent stops, and the board says so
        limit.start()
        for line in p.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                self.note(st, line.strip())
                continue
            if ev.get("type") == "assistant":
                for c in ev["message"].get("content", []):
                    if c.get("type") == "tool_use":
                        i = c["input"]
                        self.note(st, f'{c["name"]}: {Path(i["file_path"]).name if "file_path" in i else str(i.get("command") or i.get("pattern") or "")[:170]}')
                    elif c.get("type") == "text" and c["text"].strip():
                        self.note(st, c["text"].strip().split("\n")[0])
            elif ev.get("type") == "result":
                u = ev.get("usage") or {}
                st["tokens"] = sum(u.get(k, 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"))
                st["tokens_new"] = st["tokens"] - u.get("cache_read_input_tokens", 0)    # what the step really added: cache reads repeat the context each turn
                self.s["tokens_new"] = self.s.get("tokens_new", 0) + st["tokens_new"]
                st["report"] = (ev.get("result") or "")[:900]
                self.s["tokens"] += st["tokens"]
                ok = not ev.get("is_error")
        p.wait()
        if not limit.is_alive():
            self.note(st, f"stopped: over the {self.speed['agent_minutes']} minute limit for one agent")
        limit.cancel()
        return ok and p.returncode == 0

    # ------------------------------------------------------------- steps
    def do_reference(self, st):
        """Fetch the video into reference/, transcribe it (a paid gate unless a transcript exists), measure it into a pack."""
        ref = self.d / "reference"
        for sub in ("source-videos", "transcripts"):
            (ref / sub).mkdir(parents=True, exist_ok=True)
        video, trans = ref / "source-videos/ref.mp4", ref / "transcripts/ref.scribe.json"
        src = self.topic.get("source_video", "")
        library = KIT.parent / "research/reference"
        if not video.exists():
            if (library / f"source-videos/{src}.mp4").exists():
                shutil.copy2(library / f"source-videos/{src}.mp4", video)
                if (library / f"transcripts/{src}.scribe.json").exists():
                    shutil.copy2(library / f"transcripts/{src}.scribe.json", trans)
            elif Path(src).expanduser().exists():
                shutil.copy2(Path(src).expanduser(), video)
            elif self.tool(st, ["yt-dlp", "-f", "mp4/bv*+ba/b", "--merge-output-format", "mp4", "-o", str(video), src]):
                return False
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)], capture_output=True, text=True).stdout)
        self.topic["seconds"] = round(dur)
        if not trans.exists():
            self.s["ref_cost"] = {"minutes": round(dur / 60, 1), "usd": round(dur / 60 * SCRIBE_PER_MIN, 2)}
            if not self.s["approved"].get("reference"):
                return "gate:reference"
            scribe = KIT.parent.parent / "market-research/_creator-pipeline/scribe_transcribe.py"
            if self.tool(st, [PY, str(scribe), "--input", str(video), "--id", "ref", "--out-dir", str(ref / "transcripts")]):
                return False
        pack = TOOLS / "ref_pack.py"
        self.note(st, "measuring cuts, camera, labels and colours")
        (ref / "cuts").mkdir(exist_ok=True)
        meta = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", "scale=360:-2,select='gte(scene,0)',metadata=print:file=-", "-an", "-f", "null", "-"], capture_output=True, text=True).stdout
        scores, t = [], 0.0
        for line in meta.splitlines():
            if "pts_time:" in line:
                t = float(line.split("pts_time:")[1])
            elif "scene_score=" in line:
                scores.append([round(t, 7), float(line.split("=")[1])])
        (ref / "cuts/ref.scores.json").write_text(json.dumps({"scores": scores}))
        p = subprocess.run([PY, str(pack), "ref"], cwd=ref, capture_output=True, text=True)
        if p.returncode:
            self.note(st, (p.stdout + p.stderr)[-600:])
            return False
        self.topic.update(ref="ref")
        (self.d / "topic.json").write_text(json.dumps(self.topic, ensure_ascii=False, indent=1) + "\n")
        return True

    def do_script(self, st):
        src = self.topic.get("source")
        if src == "script":                 # the person's own words: one line per sentence, nothing written for them
            parts = re.findall(r"[^.?!\n]+[.?!]*", self.topic["script"])
            lines = [{"scene": "main", "text": x.strip()} for x in parts if x.strip()]
            (self.d / "script.json").write_text(json.dumps({"title": self.topic.get("topic", ""), "scenes": {"main": "Main"}, "lines": lines, "hooks": [], "needs": []}, ensure_ascii=False, indent=1))
            self.note(st, f"{len(lines)} sentences from your script")
            return True
        if not self.agent(st, self.fill("script_video" if src == "video" else "script")):
            return False
        return (self.d / "script.json").exists()

    def write_lines(self):
        sc = json.loads((self.d / "script.json").read_text())
        en = [(x["scene"], x["text"]) for x in sc["lines"]]
        (self.d / "lines.py").write_text("# Written from script.json by the pipeline.\nEN = " + json.dumps(en, ensure_ascii=False, indent=1) +
                                         "\nDROP = {}\nSCENES = " + json.dumps(sc.get("scenes", {}), ensure_ascii=False, indent=1) + "\n")

    def do_voice(self, st):
        self.write_lines()
        if self.tool(st, [PY, str(TOOLS / "make_beats.py")]):
            return False
        brand = json.loads((KIT / "brands" / self.topic.get("brand", "default") / "brand.json").read_text())
        beats = json.loads((self.d / "beats.json").read_text())
        spoken = " ".join(b["en"] for b in beats)
        tag = brand["voice"].get("tag", "")
        text = f"{tag} {spoken}" if tag else spoken
        tj = self.d / "voice/take.json"
        cached = tj.exists() and json.loads(tj.read_text()).get("text") == text
        paid = brand["voice"]["provider"] != "local" and not cached
        self.s["voice_cost"] = {"characters": len(text), "provider": brand["voice"]["provider"]} if paid else None
        if paid and not self.s["approved"].get("voice"):
            return "gate:voice"
        return self.tool(st, [PY, str(TOOLS / "voice.py")] + (["--spend"] if paid else [])) == 0

    def do_shotmap(self, st):
        return self.tool(st, [PY, str(TOOLS / "compose.py")]) == 0 and self.tool(st, ["node", str(TOOLS / "shot_map.mjs")]) == 0 and self.tool(st, [PY, str(TOOLS / "shot_map.py")]) == 0

    def latest_video(self):
        vids = sorted((self.d / "renders").glob(f"{self.topic['slug']}-en-v*.mp4"), key=lambda p: p.stat().st_mtime)
        return vids[-1] if vids else None

    def do_render(self, st):
        if self.tool(st, [PY, str(TOOLS / "sound.py")]):
            return False
        code = self.tool(st, [PY, str(TOOLS / "render.py"), "--sheets"])
        v = self.latest_video()
        if not v:
            return False
        self.s["video"] = str(v.relative_to(self.d))
        self.moments(v)
        cj = v.with_suffix(".check.json")
        self.s["check"] = json.loads(cj.read_text()) if cj.exists() else None
        self.save()
        return code == 0 or self.problems() is not None

    def moments(self, v):
        """A picture of each moment the world changes, for the World step."""
        try:
            moments = json.loads((self.d / "plain.json").read_text())["world"]["moments"]
        except (OSError, ValueError, KeyError):
            return
        out = self.d / "renders/moments"
        out.mkdir(parents=True, exist_ok=True)
        for i, m in enumerate(moments):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(m["t"]), "-i", str(v), "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", str(out / f"{i}.jpg")])

    def problems(self):
        c = self.s.get("check")
        if not c or not c.get("failures"):
            return None
        rows = [f"{f['level']}: {f['reason']}" for f in c.get("film_wide", []) if f["level"] == "fail"]
        rows += [f"{s['a']}-{s['b']} s: " + "; ".join(s["reasons"]) for s in c.get("flagged", []) if s["level"] == "fail"]
        return "\n".join(rows)

    def second_version(self):
        """His rule: every reel also ships mirrored, in other colours, on another song."""
        st = {"id": "variant", "title": "Second version", "state": "todo"}
        self.s["steps"].append(st)
        self.s["pid"] = os.getpid()
        self.begin(st)
        code = self.tool(st, [PY, str(TOOLS / "variant.py")])
        self.end(st, "done" if code == 0 else "failed")
        self.s["state"] = "done" if code == 0 else "failed"
        self.s.pop("current", None)
        self.save()
        return code

    def rerender(self):
        """After a change to the reel's code, from a chat or by hand: one more render and every check."""
        st = {"id": "render", "title": "Render again and checks", "state": "todo"}
        self.s["steps"].append(st)
        self.s["pid"] = os.getpid()
        self.begin(st)
        ok = self.do_render(st)
        self.end(st, "done" if ok else "failed")
        self.s["state"] = "failed" if not ok or self.problems() else "done"
        self.s.pop("current", None)
        self.save()
        return 0 if self.s["state"] == "done" else 1

    def run_step(self, st):
        sid = st["id"]
        if sid == "reference":
            return self.do_reference(st)
        if sid == "script":
            return self.do_script(st)
        if sid == "translate":
            return self.agent(st, self.fill("translate")) and (self.d / "script.json").exists()
        if sid == "voice":
            return self.do_voice(st)
        if sid == "shotmap":
            return self.do_shotmap(st)
        if sid == "render":
            return self.do_render(st)
        if sid == "review":
            return self.agent(st, self.fill("review", VIDEO=self.s["video"]))
        return self.agent(st, self.fill(sid))

    def fix_loop(self):
        """Check failures, or the reviewer's notes, go back to an agent, then one more render, up to the tier's count."""
        while self.s["fixes"] < self.speed["fixes"]:
            issues = self.problems()
            rv = self.d / "REVIEW.md"
            if not issues and "review" in self.speed["steps"] and rv.exists() and not rv.read_text().strip().upper().startswith("PASS") and not self.s.get("reviewed_fix"):
                issues = rv.read_text()
                self.s["reviewed_fix"] = True
            if not issues:
                return
            self.s["fixes"] += 1
            fx = {"id": "fix", "title": f"Fix {self.s['fixes']}", "state": "todo"}
            self.s["steps"].append(fx)
            self.begin(fx)
            if not self.agent(fx, self.fill("fix", VIDEO=self.s["video"], PROBLEMS=issues)):
                self.end(fx, "failed")
                return
            self.end(fx)
            rn = {"id": "render", "title": f"Render {self.s['fixes'] + 1} and checks", "state": "todo"}
            self.s["steps"].append(rn)
            self.begin(rn)
            self.end(rn, "done" if self.do_render(rn) else "failed")
            if rn["state"] == "failed":
                return

    def go(self):
        self.s["pid"] = os.getpid()
        for st in self.s["steps"]:
            if st["state"] in ("done", "skipped"):
                continue
            sid = st["id"]
            if sid.startswith("gate:"):
                gate = sid[5:]
                needed = not ((gate == "voice" and not self.s.get("voice_cost")) or (gate == "reference" and not self.s.get("ref_cost")))
                if not needed:
                    self.end(st, "skipped")
                    continue
                if self.s["approved"].get(gate):
                    self.end(st)
                    continue
                st["state"] = "waiting"
                self.s.update(state="waiting", gate=gate, current=sid)
                self.save()
                return 0
            self.begin(st)
            try:
                r = self.run_step(st)
            except Exception as e:           # any step's failure lands on the board, never a silent stop
                self.note(st, f"error: {e}")
                r = False
            if isinstance(r, str):           # a step found it would cost something: its gate comes first, then it runs again
                self.end(st, "todo")
                self.step(r)["state"] = "waiting"
                self.s.update(state="waiting", gate=r[5:], current=r)
                self.save()
                return 0
            if not r:
                self.end(st, "failed")
                self.s["state"] = "failed"
                self.save()
                return 1
            self.end(st)
        self.fix_loop()
        self.s["state"] = "failed" if self.problems() else "done"
        self.s.pop("current", None)
        self.save()
        return 1 if self.problems() else 0


def translate(source, lang, brand="default"):
    """A version of a finished reel in another language: the same world, a new script, voice and labels. Returns the new folder."""
    src = reel_path(source)
    t = json.loads((src / "topic.json").read_text())
    if lang not in LANGS or lang == t.get("language", "en"):
        sys.exit(f"{source} is already in {lang}")
    if not (src / "build/js/reel.js").exists() or not (src / "script.json").exists():
        sys.exit(f"{source} is not finished")
    slug, n = f"{t['slug']}-{lang}", 2
    out = src.parent / slug
    while out.exists():
        slug, n = f"{t['slug']}-{lang}-{n}", n + 1
        out = src.parent / slug
    (out / "build").mkdir(parents=True)
    (out / "voice").mkdir()
    (out / "renders").mkdir()
    shutil.copytree(src / "build/js", out / "build/js", ignore=shutil.ignore_patterns("kit", "brand.js", "timeline.js"))
    for f in ("cues.py", "plain.json", "PLAN.md", "WORLD.md", ".gitignore"):
        if (src / f).exists():
            shutil.copy2(src / f, out / f)
    shutil.copy2(src / "script.json", out / "source_script.json")
    new = {"slug": slug, "topic": t.get("topic", slug), "ref": None, "brand": brand, "speed": "express", "seconds": t.get("seconds", 60), "source": "translation",
           "of": t["slug"], "language": lang, "source_language": t.get("language", "en")}
    if t.get("showcase"):
        new["showcase"] = True
    (out / "topic.json").write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n")
    return out


def main():
    a = sys.argv[1:]
    if a[:1] == ["new"]:
        r = subprocess.run([PY, str(TOOLS / "new_topic.py"), *a[1:]])
        sys.exit(r.returncode)
    if a[:1] == ["run"] and len(a) == 2:
        sys.exit(Run(reel_path(a[1])).go())
    if a[:1] == ["translate"] and len(a) >= 3:
        print(translate(a[1], a[2], *a[3:4]))
        return
    if a[:1] == ["rerender"] and len(a) == 2:
        sys.exit(Run(reel_path(a[1])).rerender())
    if a[:1] == ["variant"] and len(a) == 2:
        sys.exit(Run(reel_path(a[1])).second_version())
    if a[:1] == ["approve"] and len(a) == 3:
        r = Run(reel_path(a[1]))
        r.s["approved"][a[2]] = True
        r.save()
        print("approved", a[2])
        return
    if a[:1] == ["cancel"] and len(a) == 2:
        r = Run(reel_path(a[1]))
        for pid in [r.s.get("pid")] + [s.get("agent_pid") for s in r.s["steps"]]:
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                except OSError:
                    pass
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
