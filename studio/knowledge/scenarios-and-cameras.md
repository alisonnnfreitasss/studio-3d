# Scenarios and cameras

How Studio 3D uses places, cameras and cuts. Measured on reels of the format.

## How it was measured

- **Four readers** labelled every shot with a set-up code, the place and the light. This came to about 2M tokens in total, with no credits spent.
- **Camera motion was measured, not guessed.** Each shot's first and last frames were registered against each other (ORB features, then a partial-affine fit). That gives the push or pull as a scale change, plus the drift. It also captures how each reel ends: `shot_motion.py`.
- **Joined per set-up:** screen time, hold, motion, what comes before and after: `setup_stats.py`. The results are in `modes/<mode>/setups.json`.

## The places

**One set carries the format.** In desk mode one desk, re-lit to fit the script, works for most episodes (11 of 13 reels measured); leaving the desk is the exception. The top of the desk is mid-brown and the front fades to black over the bottom 30%. The key is warm and soft from the camera side, high and slightly frame-left, against a cool window rim and cool monitor spill.

Desk palettes:

| Light | Measured palette |
|---|---|
| Night, navy | sky #000427 to #0A0A4B, 5 to 7 small bokeh dots |
| Night, dense | black sky, about 12 big warm discs |
| Purple dusk | violet #2E1C46, magenta #A14590, peach horizon, rust-red desk front |
| Peach sunset | steel blue #3F536E, lavender #A6ABCB, peach #E48F77 |
| Morning | aqua #40697F to #97D2DA, grey-blue towers, no bokeh |
| Rain | flat grey #37414A to #717986, white rain dashes, red street-light bokeh |

**On the keyboard the variety comes from where the camera looks inside the one set:**
- **The city side.** The camera turned from the dashboard toward the night city, the lead split-lit, amber on one half and violet on the other.
- **The phone.** A glowing phone lights the lead's face from below.
- **Top-down** over the keys, rare.

Keyboard palette: indigo keycaps (#433577) with brown-orange front bevels, a violet palm rest, navy cards (#121325, coral status dots), a hot amber key from the front left (bloom, orange rim), cool violet bounce from the keys, drifting specks.

## What Studio 3D has now

A **scenario** is the place: the set, its light and props, where the cast stands. Each mode keeps its camera grammar, look, captions and sound, and has its own scenarios (`modes/<mode>/scenarios/<id>.js`, listed in `mode.json`). An episode picks one on Make video → Mode & look. The Modes page plays the same scene in any of them and shows a still of each.

| Mode | Scenario |
|---|---|
| Desk | **Night city**: the first desk look |
| Desk | **Dusk**: lavender to pink to peach, first lit windows, lamp on |
| Desk | **Rain**: grey evening, streaks past the window, drops on the glass |
| Desk | **Morning**: pale blue daylight, the sun behind the desk, lamp off |
| Desk | **Living room**: the lead on a teal sofa, the agents on the coffee table, floor lamp, blue-hour window |
| Desk | **Classroom**: a whiteboard that writes itself from the script, the agent on a book stack with a pointer, the lead at a school desk, a bookshelf |
| Desk | **Diner**: a red vinyl booth at night, a cream table with a chrome edge, two pendant lamps, a big window on a night street with neon signs (OPEN, 24 H, COFFEE), black and white floor checks |
| Desk | **Campfire**: a log seat and a plank camp table in the mountains at dusk, a fire low in the foreground, a tent and a lantern behind, stars coming out |
| Desk | **Rooftop**: a teak bench and table on a city roof at golden hour, string lights, a parapet and a water tower, the sun low over the skyline |
| Keyboard | **Night city**: the giant laptop, the dashboard, a starry skyline all around |
| Keyboard | **Window ledge**: a dark sill high over the city, big warm lamps along the top, the dashboard along the foot |

The desk looks share one room, `modes/desk/room.js`, with a look per scenario, and the closing wide reveals notes, books, a ball, a plant and a pendant lamp. The keyboard scenarios share the dashboard and the sky painter in `modes/keyboard/stage.js`.

The diner, campfire and rooftop are their own sets built on the desk's layout: the lead seated at [0, 0, -2.75] and a surface 1.7 high for the agents, so every desk camera frames them as is. Their wides come from `deskWides()` in `modes/desk/room.js`, which sizes the wide to the number of agents. The campfire's fire sits low in front of the table so the wides show it; its stones, logs and flames hide when the lens is narrower than 30°, because in the lead's long-lens shots the flame tip came in as a hard orange triangle on the bottom edge (the firelight and the embers stay).

**The classroom board** is written in the script, like the keyboard screen: `"board": {"title": {...}, "lines": [{"text": {...}, "color": "blue|green|red|black", "from": {...}, "until": {...}, "strike": {...}, "typed": 20}]}`. Cues point at a time, a line or a word, as on the screen.

## The camera set-ups

Each mode's set-ups, their share of screen time, framing and motion are in `modes/<mode>/setups.json`. The Modes page shows each one.

### Desk mode (measured over 287 shots)

- **Agent close-up `cu` (37.5% of the time).** Square-on at the agent's eye height. The agent fills 50 to 87% of the height, eyes 64% down, the lead soft in an upper corner. It pulls out about 4.4% a second.
- **Lead three-quarter `lead` (22.3%).** At eye level with a long lens. Face 40% across, eyes 52% down, head about 44% of the frame. It pushes in about 3.8% a second and opens 10 of 13 reels.
- **Lead square-on `front` (14.2%).** Eyes in the lens, face 48% across. It comes later in a reel than the three-quarter (60% in, against 39%).
- **Wide `wide` (10.7%).** In front of the desk at the lead's chin height, 3 to 5 degrees down, normal lens, eyes 37% down. Usually twice a reel, near 30% and 70%.
- **Closing wide `end` (6.9%).** The wide again, always last, dollying back about 22%.
- **Over the shoulder (classroom, 3.7%).** It is the classroom's `wide`: the board in the middle, the agent on the books.
- **Never in this mode:** inserts, top, high or low angles, pans. Our `high` and `two` stay available but are not chosen automatically.

### Keyboard mode (measured over 2,159 shots)

- **Agent close-up `cu` (31.4%).** Frontal. The block fills the width, top edge 36% down, legs cut.
- **Lead head and torso `lead` (23.1%).** At eye height, close. Face about 30% across and 62% down, head 35 to 55% of the frame, room toward the agent. It opens 65 of the 71 videos and ping-pongs with the agent close-up.
- **Agent full body `full` (10.2%, plus 1.5% further back).** Just above the block, 5 to 10 degrees down.
- **Dashboard `board` (7.2%).** The cards readable, both characters small in the lower corners. Silent beats.
- **Lead seated `lead-seated` (7.0%).** Face 31% across, the city in a top corner.
- **Key level `low` (3.1%).** Big keys at the bottom, the card wall above, the agent cut by the right edge. Usually just before the closing wide: 17 of 22 later reels end close-up, key level, closing wide.
- **Other shots:** agent three-quarter `side`, lead small under the board `lead-wide`, closing wide `end`, wide from above `wide`, top-down `top`, and the lead with the city behind `lead-city` (the reverse angle).
- **Lead lit by a phone.** Any of the lead's shots with `"prop": "phone"` on the line: a glowing phone in his hand lights his face from below.

### How the cameras move

- **Desk:** a constant slow dolly, measured at 3.5 to 4.5% of the distance a second when it moves, so short shots barely move and long ones move more. It is in on the lead and out on the agents. The closing wide pulls back about 22%.
- **Keyboard:** locked off. Its "moves" are on short shots, so they are punch-ins rather than dollies. Long lines are split across two framings of the same set-up, the second one closer (`timing.splitLong`, cut at the first sentence break).

### Transitions and endings

- **Hard cuts only,** in both modes. No whip pans, zooms, dissolves or slides in 2,446 shots. A cut lands 0.12 to 0.4 s before the new speaker's first word (ours: `cutBefore`).
- **Desk endings:** 12 of 13 end on the closing wide, which holds while the room tone plays out. No fade.
- **Keyboard endings:** always the closing wide, about 1.6 s and silent. A third of the reels fade to black: the fade starts 0.9 s before the end and is black for the last 0.2 s. In Studio 3D this is the episode's **Ending** on Mode & look: hold, or fade to black.

### Automatic shot choice

A camera named in a script line always wins. Otherwise (`mode.json` → `autoCamera`):
- **Desk.** The lead's lines are three-quarter for the first half, then square-on. The agents' lines get close-ups. Two lines near 30% and 70% become wides when the script names no wide (six or more lines). Silent beats hold on the lead square-on.
- **Keyboard.** The lead's lines are head and torso, the agents' close-ups. Silent beats go to the dashboard, and the last line goes to the key-level low shot. Long lines split with a punch-in.

### Rules found by checking every shot

- **Keyboard agent shots turn to see past the front agent.** With two or three agents, the back slot stands behind the front one. The close-up, full and side shots turn around the agent, nearest angle first (15° steps, up to 60°), until no character stands in the line of sight (`modes/keyboard/set.js`).
- **The classroom's lead shots use a 48° lens,** eyes 55% down, because the whiteboard stands right behind those cameras. The over-the-shoulder and closing wides sit high so the hair stays below the board.
- **A character can ask for more room in its `frame.cu`** (Grok's orb: 1.4); the keyboard close-up and side shots multiply their distance by it.
- **In the classroom, the third agent stands on the teacher's table,** so no ring crosses the lead's face.
- **The campfire's stones, logs and flames hide when the lens is narrower than 30°.**

## The cover camera

Covers (`ui/cover.html`) use their own camera, set per mode and set in `CAM` and `BY_SCENARIO` there, and any episode can override it in `episode.json` → `cover.camera`:
- **Desk sets:** the lead square-on, eyes to the lens, 24 units away on a 24° lens, the head 33% down; the agents either side on the table below.
- **Classroom:** the set's own over-the-shoulder wide (`type: "wide"`): the board readable, the teacher on his books. Framings that also showed the lead put the camera inside the shelves or lost the board.
- **Keyboard, night city:** the lead large, 15 units away on a 30° lens, the dashboard behind. With all four on the keys, Grok stands between the lead and Claude, so a two-shot is cluttered by his ring.
- **Keyboard, window ledge:** the lead with Claude (`with: "claude"`), the city behind.
- The title block sits between 64% and 83% of the height, inside the 3:4 crop the Instagram grid shows.

## Left as options, not built

1. The desk's sparse "night, navy" look and a separate "peach sunset" look. Dusk covers both for now; each is a short look object.
2. A keyboard corner with a giant rubber duck, and the laptop seen from outside on a big desk.
3. Re-lit keyboard looks (dusk, rain, morning) taken from the desk.
4. Poses the lead does not have yet: lying on the sofa, the dropped head on the keys.
5. A focus pull from the lead to the agent across the coffee table, in about 0.3 s.
