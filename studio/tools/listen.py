#!/usr/bin/python3
"""The link between the studio's browser page and a Claude chat, as in the Influencer Studio: the page leaves a
request in inbox/, a listening chat wakes, does the work, and answers on the page.

    /usr/bin/python3 tools/listen.py --wait          blocks until a request arrives, prints it and exits (run it in the background: its exit wakes the chat)
    /usr/bin/python3 tools/listen.py working <id> "what is happening"
    /usr/bin/python3 tools/listen.py done <id> "what changed"
    /usr/bin/python3 tools/listen.py failed <id> "why"
    /usr/bin/python3 tools/listen.py stop            this chat stops listening

Only one chat listens at a time: --wait exits 3 when another live one holds it.
"""
import json
import os
import signal
import sys
import time
from pathlib import Path

INBOX = Path(__file__).resolve().parent.parent / "inbox"
HOLD = INBOX / ".listener.json"
GRACE = 90     # a chat is still listening for this long after --wait exits, while it handles the request


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def holder():
    try:
        return json.loads(HOLD.read_text())
    except (OSError, ValueError):
        return None


def status():
    """Is a chat listening? Used by the server. busy: a chat took a request and has not armed --wait again yet."""
    h = holder()
    if not h:
        return {"listening": False}
    if alive(h["pid"]):
        return {"listening": True, "busy": False}
    working = any(r.get("state") == "working" for r in requests())
    if working or time.time() - h.get("seen", 0) < GRACE:
        return {"listening": True, "busy": True}
    return {"listening": False}


def requests():
    rows = []
    for p in sorted(INBOX.glob("r-*.json")):
        try:
            rows.append(json.loads(p.read_text()))
        except ValueError:
            pass
    return rows


def write(r):
    p = INBOX / f"{r['id']}.json"
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(r, indent=1, ensure_ascii=False))
    tmp.replace(p)


def add(text, where):
    INBOX.mkdir(exist_ok=True)
    r = {"id": f"r-{int(time.time() * 1000)}", "text": text, "where": where, "state": "new", "at": time.time(), "answer": ""}
    write(r)
    return r


def wait():
    INBOX.mkdir(exist_ok=True)
    h = holder()
    if h and h["pid"] != os.getpid() and alive(h["pid"]):
        print(f"another chat is listening (pid {h['pid']})")
        sys.exit(3)
    def leave(*_):
        HOLD.unlink(missing_ok=True)
        sys.exit(0)
    signal.signal(signal.SIGTERM, leave)
    while True:
        HOLD.write_text(json.dumps({"pid": os.getpid(), "seen": time.time()}))
        new = [r for r in requests() if r["state"] == "new"]
        if new:
            r = new[0]
            r["state"] = "working"
            write(r)
            print(json.dumps(r, indent=1, ensure_ascii=False))
            HOLD.write_text(json.dumps({"pid": os.getpid(), "seen": time.time()}))
            return
        time.sleep(1.5)


def update(rid, state, text):
    p = INBOX / f"{rid}.json"
    if not p.exists():
        sys.exit(f"no request {rid}")
    r = json.loads(p.read_text())
    r.update(state=state, answer=text, updated=time.time())
    write(r)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["--wait"]:
        wait()
    elif a == ["stop"]:
        h = holder()
        if h and alive(h["pid"]):
            os.kill(h["pid"], signal.SIGTERM)
        HOLD.unlink(missing_ok=True)
    elif len(a) == 3 and a[0] in ("working", "done", "failed"):
        update(a[1], a[0], a[2])
    else:
        sys.exit(__doc__)
