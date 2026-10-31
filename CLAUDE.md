# Studio 3D: instructions for Claude

This repo is a skeleton: the engine, the tools and the rules for making 3D videos in code. It has no character, no voice and no videos. You, Claude, do the rest with the person who cloned it.

## First run
If `studio/characters/lead/character.json` does not exist, run the `setup-studio` skill before anything else, whatever the person asked. Then do what they asked.

## After that
- "Open the studio" or "abre o estúdio": the `open-studio` skill.
- Front doors: `kit/README.md` (the 3D format and its tools), `kit/CINEMATIC.md`, `studio/knowledge/` (sitcoms).
- Talk to the person in their language, in plain words. They may not be a developer.

## Rules
- A video is not done until you have looked at it: pull frames and check them by eye. A render that finishes can still be black.
- Make videos through the studio's runner (`kit/runner/explainer.py` or the page), not by hand: it runs the checks.
- Test videos are 5 to 10 seconds. Long renders only when asked.
- Render one video at a time, never several together: each opens its own browsers and can run the computer out of memory.
- Before anything that spends money (a paid voice, for example), say the cost and wait for a yes.
- Never commit `.env`.
