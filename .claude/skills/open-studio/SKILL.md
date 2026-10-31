---
name: open-studio
description: Open Studio 3D in the browser and link this chat to its page, so requests sent from the page wake this chat and it answers on the page. Use when the person says "open the studio" or "abre o estúdio".
---

# Open the studio and listen

If `studio/characters/lead/character.json` does not exist, run `setup-studio` first. Work from `studio/`.

1. **Start the hub if it is off.** `curl -s -m2 -o /dev/null -w "%{http_code}" http://127.0.0.1:8810/api/requests`; if not 200, run `python3 server/serve.py` in the background. Never kill anything else on a port.
2. **Open the page:** `open "http://127.0.0.1:8810/#/explainers"`.
3. **Listen:** run `python3 tools/listen.py --wait` as a background task. Its exit wakes this chat with one request as JSON. Exit code 3 means another chat is listening: say so.
4. **For each request:** `where` says which page they were on; `text` is what they want. Run `python3 tools/listen.py working <id> "<short update>"` as you go. A reel lives in `explainers/<slug>/`: edit its code, then `python3 ../kit/runner/explainer.py rerender explainers/<slug>` for a new render and every check. Finish with `python3 tools/listen.py done <id> "<what changed>"` or `failed <id> "<why>"`, in plain words. Then listen again.
5. **Stopping:** `python3 tools/listen.py stop`.

Anything that spends money needs a clear yes first. Never press approve buttons for them. Test videos stay 5 to 10 seconds. If a request is unclear, answer on the page: `done <id> "Question: ..."`.
