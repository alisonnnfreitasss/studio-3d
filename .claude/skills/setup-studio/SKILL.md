---
name: setup-studio
description: First-run setup of Studio 3D: checks the computer, asks how the person wants their character and voice, and builds the character. Use on the first run, when studio/characters/lead/character.json does not exist, or when the person wants to change their character.
---

# Set up the studio

Work step by step, in the person's language, and show results as you go.

## 1. Check the computer
Check: macOS (the free voice uses `say`; on another system say so, and offer ElevenLabs or another voice), Python 3 with numpy, ffmpeg, Node.js 22 or newer, whisper-cpp (`brew install whisper-cpp`) and its model at `models/ggml-base.en.bin` (or set `WHISPER_MODEL`). Run `npm install` in `studio/`. Say what is missing and offer to install it; install only after a yes.

## 2. Ask
Ask these together, with examples, and offer to pick for them:
1. **Your character:** style and look (a person like you, an animal, a robot, a mascot), hair, skin, clothes, main colour. A photo or drawing helps.
2. **Name and personality**, one sentence.
3. **Language:** Portuguese, English or another.
4. **Voice:** the free macOS voice, or ElevenLabs with their own key in `.env` (paid per character; say so). Sitcoms need ElevenLabs: the free voice only serves explainers and cinematic videos. Without a key, set up those two and leave the sitcom page for later.
5. **Your page name**, if any.

## 3. Build the character
The look lives in code, in two places. Keep the structure and the function names, and change the shapes and colours:
- `kit/js/pixel.js`: the lead in explainers and cinematic videos. Its hair, outfits and colours are at the top and in `build`. The current look is only an example: replace it.
- `studio/characters/lead/`: the lead in sitcoms. Copy `studio/characters/_template/` there, fill `character.json`, and base `model.js` on `_template/lead-model.js`. Then add `"lead"` to `characters` in `studio/studio.json` and set `"lead": "lead"`, and do the same on the sitcom page.

Set the voice in `kit/brands/default/brand.json` (see `kit/brands/` and `kit/tools/voice.py`) and in `voices` in `character.json`. Rename the pages in `studio/studio.json` if they gave a name.

## 4. Show and confirm
Render a still of the character on `/ui/portrait.html?char=lead`, using `studio/server/serve.py`, and show it. Change it until they like it. Then make one 5 second test video on the Express speed and show that. Check it by pulling frames and looking at them.

## 5. Finish
Second versions (mirrored, other colours, other song) need a song: ask them to add an mp3 they have the rights to as `kit/assets/music/playful.mp3`. The repo ships none. Then offer to open the studio.

## Voices of the agents
If they use sitcoms, also pick a voice for Claude, Codex and Grok, in `voices` of each `studio/characters/<agent>/character.json`, the same shape as the lead's.
