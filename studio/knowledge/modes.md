# The two modes: keyboard and desk

Studio 3D has two looks, listed in `studio.json` as `"modes": ["desk", "keyboard"]`.

- **Keyboard**: the cast on a giant laptop keyboard, a wall-size dashboard that carries jokes, locked-off cameras, fast cutting, a music bed.
- **Desk**: a night desk, long lenses and bokeh, one slow dolly per shot, a caption box, no music.

## What both modes share
- The cast (the lead Pixel, Claude, Codex, Grok) and the voices.
- The engine rule: every frame is a function of the time t. No clock reads, no `Math.random`; seeded randomness only. HyperFrames seeks the page and captures each frame.
- Output 1080 x 1920 at 30 fps.
- One ElevenLabs take per line, cached; every timing comes from the real voice files.
- Captions written from the script, one card per speaker turn.
- A hard cut on every change of speaker. No dissolves.
- A cold open on the human saying "Claude," and a silent wide to close. No end card, no CTA in the video.

## Notes on the numbers
- **Format targets** are measured across the format (10 fps reads, ffmpeg, pixel samples). **Default** are the studio's values.
- **Units.** Scenes use free units, not metres. For scale: the lead's skull is about 2 units wide, and Claude's block is 2.1 units wide at full size. Camera distances are from the camera to the subject's head centre or block centre.
- **FOV** is three.js vertical field of view, in degrees.

---

## Keyboard mode

Measured across the format: 65 reels, the top 20 read at 10 fps.

### Set
- **The deck:** a giant laptop base, 48 x 0.8 x 26 units (#14162c).
- **The keys:** five rows of boxes, 1.78 x 0.36 x 1.78, at a 2.05 pitch, every other row offset by 0.6. Three seeded navy shades (#1d2046, #1a1d40, #22264f), roughness 0.6.
- **The palm rest:** a glowing plane at the front, 7 x 3.4 (emissive #8d80ff at 0.16). It shows in the high wide.
- **The screen:** a wall-size display behind the cast, 24.3 x 18.9 units, 9.4 units back, tilted back 0.09 rad, in a dark bezel. It towers over the cast, about four times his seated height. It is a 2D canvas drawn every frame and used as a texture that ignores tone mapping (details below).
- **The night outside:** a cylinder (radius 62) wrapped around the set, painted with a night sky, stars and a city of lit windows, blurred 5 px, so side angles see city too. Fog from 70 to 170 units (#090a1c). Background #06060e.
- **Positions:** the lead Pixel sits on the front row of keys at the left (x -3.3), turned 24 degrees toward Claude. Claude stands at the right (x 3.1), turned 26 degrees toward him. They are about 6.4 units apart.
- **Dust:** 46 small warm sprites (#ffe3b8, additive, opacity 0.18 to 0.58) drifting as a function of t.

### Light
- **Hemisphere:** sky #8a86e8, ground #1a1030, intensity 0.6.
- **Key:** a warm directional light (#ffa25c, 4.8) from front left and above (-9, 11, 10), aimed at the cast. It casts the shadows: map 2048, PCF soft, bias -0.0006, normal bias 0.03.
- **Rim:** a violet directional light (#8a6bff, 1.4) from behind right (7, 8, -12).
- **Screen glow:** a blue point light (#5c7cff, 170, range 40) in front of the screen.
- **Face light:** a warm point light (#ffb27a, 46, range 7) that follows his head every frame: 1.8 units to his right, 3 in front, 0.9 above. It gives the warm glare on the lit side of his face.
- **Renderer:** ACES Filmic tone mapping, exposure 1.0, sRGB output, pixel ratio 1, 4x multisampling on a half-float render target.
- **Bloom:** strong by design. UnrealBloomPass strength 0.72, radius 0.55, threshold 0.74.
- **Materials:** MeshStandardMaterial, roughness 0.78, metalness 0, flat shading. Boxes and icosahedrons get a seeded vertex jitter (5% of the smallest side, 6% of the radius) for the hand-made facets.
- **Grade:** saturated purple and orange; warm on the cast, cool from the screen and the sky.

### Lens and camera
- **Locked off.** The motion comes from the characters (blinks, hops, head drops), the typing screen and the dust. The set-ups drift 3 to 4% over a shot, eased with a smoothstep, which reads as still.
- **About a dozen set-ups per episode.** Each episode adds two or three new angles (a top-down over the keys, a reverse onto the night city, a low key-level shot), so the one set never feels like one set.
- **Mix:** close-ups and head-and-torso singles hold 80 to 87% of the time. Wides are rare: silent breathers, edge-framed two-shots for screen gags, and the ending.
- **No bokeh pass.** Depth of field is faked on the screen: the dashboard canvas is blurred per set-up (the "Blur" column).
- **Framing, checked with frame pairs:** his seated shots are full body; he sits low in the frame with the caption above his face; the screen is bigger next to the cast than you expect.

The 13 set-ups ("off his facing" is measured from the way he faces, on the side away from Claude; the move runs over the shot):

| Set-up | What it frames | Camera | FOV | Move | Blur |
|---|---|---|---|---|---|
| A_open | the lead 3/4 close, the opening angle | 35 deg off his facing, 14.6 from his head, 0.35 below it, aimed 0.45 above | 26 | in to 14.0 | 5 px |
| A_front | the lead frontal close | 12 deg off, 15.6, 0.3 below | 26 | in to 15.0 | 5 |
| A_reach | the lead close, reaching toward Claude | 20 deg off, 16.6, aimed a little to the side | 26 | in to 16.0 | 5 |
| A_profile | the lead in tight profile | 55 deg off, 13.6 | 26 | none | 6 |
| A_seated | the lead full body on the keys, his listening shot | 45 deg off, 19.8 from his pelvis, 3.8 above it, aimed 2.9 above it | 26 | in to 19.2 | 3 |
| A_low | the lead from low, at seat height | 25 deg off, 16.4 from the pelvis, aimed at his head | 30 | in to 15.8 | 5 |
| A_wide | the lead alone, room to throw his arms out | 15 deg off, 28.5, 1.0 above the head, aimed 2.7 above it | 26 | in to 27.6 | 3 |
| C_cu | Claude close | straight on, 7.0 from the block, 0.9 above it | 30 | in to 6.7 | 6 |
| C_full | Claude full body | straight on, 9.2 | 30 | none | 5 |
| C_window | Claude 3/4 with the night city | 20 deg off his facing, 10.8 | 30 | in to 10.4 | 4 |
| W_edges | Two-shot: the cast at the frame edges, the screen gag between them | fixed at (-0.1, 3.4, 15.0), aimed up at the screen | 44 | none | 1 |
| W_high | High angle: both tiny on the keys, the palm rest glowing | (-0.1, 17.6, 22.0), aimed down at the keys | 42 | slight in | 1 |
| W_extra | The closing extra wide: the whole board, both tiny | (0, 7.5, 40), aimed at the screen | 37.5 | none | 0 |

### The screen: the second joke track
- **Cards in a grid**, each with a coloured dot, a title ("Claude · Edição", "YouTube · Studio"), a task pill, a few terminal lines that type in as a function of t, a "working · m:ss" timer, and an input line with a model chip. Timers run about 7 timer-seconds per real second and restart at every cut; nobody notices at phone speed.
- **Background cards keep doing chores** (changelogs, inbox triage, reviews) while the foreground falls apart.
- **Card text is small.** It rewards a pause; the viewer never needs it to get the joke.

### Cutting
- **About 30 shots a minute:** 26 to 33 per 55 s, an average of about 1.9 to 2.0 s. Hard cuts only.
- **One shot per caption.** Every caption change lands on a cut, and the voice follows the cut by 0.1 to 0.3 s. Default: 0.2 s by default, set per shot from 0.14 to 0.3 s for comic timing.
- **Hold after a line:** 0.3 s by default; 0.4 to 0.55 s after a line that needs to land.
- **Extra cuts inside a caption** to swap to the silent listener under an off-screen line (about 1 shot in 6), or to split a long line across two angles. A continuation shot cuts 0.1 s before the word it starts on.
- **The silent beat at the turn:** a silent high wide or a held reaction, about 1.2 to 1.7 s, with no caption. Default: 1.3 s (high wide) and 1.5 s (edge wide on the screen gag).
- **The ending:** a hard cut to the widest shot of the reel, held 1 to 1.6 s in silence, sometimes into black. Default: the extra wide, 1.9 s.

### Captions
- **White bold sans, no box.** Default: Geist 700, 50 px, line height 1.16, letter spacing -0.01 em, colour #f7f4ee.
- **A soft dark shadow** for legibility over the orange block: `0 2px 6px rgba(10, 6, 24, 0.6), 0 0 22px rgba(10, 6, 24, 0.45)`.
- **Position:** upper middle. Default: top 600 px, 120 px margins at each side (840 px wide), centred.
- **One whole speaker turn per caption.** The first caption is on screen from frame 0, before he speaks. Each later one fades in over 0.06 s on its cut.
- **Marks:** a leading "..." on quiet lines and answers after a pause; "?!" for outbursts; names and file names in quotes.
- **Contrast:** white text over the bright orange block fails the HyperFrames contrast gate unless the block stays matte.

### Audio
- **Voices:** one take per line, mastered mono 48 kHz at -17 LUFS, so they land near -14 once a mono file plays on both channels.
- **Music:** a light bed carved (ducked) under the voices. The default is made in Python with no samples and no paid API: a kalimba-like arpeggio over C, Am, F and G at 96 BPM with a soft pad, bass and shaker, normalised to -18 LUFS, placed at volume 0.32, then carved with `/hyperframes-audio` at strength 0.8 against the voiceover group.
- **The bed follows the story:** it stops dead under the reveal line, drops to the pad alone in the silent wide, and resolves on a held chord over the final wide.
- **Small sound effects:** typing and keyboard clicks. 
- **Master:** stereo, -14 LUFS integrated.

### Measured numbers

Measured across the format: 46 to 68 s; median 110 words (89 to 156), about 2 a second; 26 to 33 shots per 55 s, 1.9 to 2.0 s each; about a dozen set-ups; "Claude," at about 0.24 s; the AI's first reply by about 3 s; one or two silent beats at the turn; a silent final wide of 1 to 1.6 s; -14.1 to -14.7 LUFS.


---

## Desk mode

Measured across the format: 13 reels, all read at 10 fps.

### Set
- **One real-size desk at night**, re-lit to match the script: night city, dusk, rain or morning. Behind it, a big window with a city whose lights become soft discs.
- **Default:**
  - a wood desk, 13 x 0.16 x 3.4 (#6b4429), with a darker front panel (#3a2416);
  - a floor (#0c0d12);
  - a back wall (#121726) 9.5 units back, with a 22 x 11 window: seven upright bars and three cross bars (#07080d);
  - a city plate, 150 x 75, 80 units back, pre-blurred 10 px and tinted #8f96b4;
  - 62 bokeh disc sprites for the far lights (see Light).
- **Props (default):** a desk lamp at the left with a cone shade and an emissive bulb, a laptop at his left turned toward him with a glowing screen, a white mug at the right, a chair behind him.
- **More props that suit the set:** a monitor with abstract bars, a dark keyboard, sticky notes, a notepad and pen. The closing reveal adds a hanging lamp, a book stack, a red ball and a plant.
- **No readable text** on any screen. The jokes live in the dialogue.
- **Positions:** the lead Pixel sits behind the desk, centred, facing the lens. Claude stands on the desk to frame right of him, scaled 0.68, about half his head height (target: half to two thirds of the human's head height). Codex stands further right, scaled 0.62, turned about 22 degrees toward the centre.

### Light
- **Key:** a warm practical. The default is a point light inside the lamp (#ffae63, 95, range 16, decay 2) that casts soft shadows (map 1024, bias -0.002). Target: about 3000 K, soft, from the lamp side and in front of the characters. It is fixed to the room, so a face turned square to the lens reads cooler.
- **Window:** cool light from behind (default #6f8cff at 0.6) that rims hair, ears and shoulders. Colours by time of day, at 0.4 to 0.6 of the key: night #5B78C9, dusk #B05FA8, rain #7F8FA6, day #9EC3E6.
- **Fill:** a hemisphere light, #55608c over #140c10, at 0.26.
- **Laptop on his face:** a small cool point light (#9ec4ff, 7, range 6), low.
- **Desk toys:** a warm front light (#ffb27a, 40, range 12) so the agents read against the dark room.
- **Contrast:** low, about 2:1 between the lit and shadow sides of a face.
- **Renderer:** ACES Filmic, exposure 1.05 (starting values: 1.0 at night, 1.1 by day), PCF soft shadows, pixel ratio 1, 4x multisampling.
- **Depth of field:** BokehPass with aperture 0.004. Its focus is set every frame to the camera's distance from the subject. Max blur 0.02 on him, 0.03 on Claude, 0.018 on the Claude and Codex shot.
- **City bokeh:** additive disc sprites (62 of them: warm whites and ambers, one blue, one red; opacity 0.18 to 0.6; sizes 0.9 to 3.5; 24 to 58 units back, beyond the window). Targets: discs about 11% of the frame width behind Claude, about 6% behind the human, soft edges, no rim.
- **Bloom:** faint. UnrealBloomPass 0.32, 0.5, 0.88, with only the emissives above the threshold (bulb, city, laptop glow, Codex's face).
- **Nothing on top:** no grain, no vignette, no chromatic aberration, no lens distortion.
- **Grade:** teal and orange. Deep blacks.

### Lens and camera
- **Long lenses, shallow focus.** FOV 18 to 22 on every single.
- **One slow dolly per shot:** push in on the human, pull out on the AI. Each set-up restarts from its start framing at every cut.
- **Ease:** the moves are near linear, about 3 to 4% of frame size per second. Prefer linear.
- **Three to five set-ups per episode.** No handheld, no shake, no pan, no orbit.
- **The listener reacts soft-focus behind the speaker.** Almost no reaction cutaways.
- **The wide** replaces a close-up on two or three key lines (about one every 15 s resets the geography) and always takes the ending.

| Set-up | What it frames | Target | Default | Move |
|---|---|---|---|---|
| Human MCU, 3/4 | chest up, head 60 to 75% of the frame width, eyes about 52% down, looking off toward the AI | FOV 22, about 1.8 m, at eye level, 25 to 30 deg off his nose toward the AI | FOV 21, 20.4 units in front of his head and 1.05 to the side, aimed just beside and above it | push in 7 to 13% (ours 10%: 20.4 to 18.4) |
| Human frontal MCU | the same size with his eyes in the lens: the AI's point of view, kept for the sincere half | the same camera moved to the AI's side | see the note below | push in |
| AI close-up | the AI full body in the lower half (eyes about 66% down), the human soft behind on one side | FOV 18, about 1.4 m, at the AI's eye height (desk height) | FOV 21, 8.4 units from the block, 1.45 to the side, 0.46 above | pull out 10 to 15% (ours 12%: 8.4 to 9.4) |
| Two AIs | Claude and Codex together | default only | FOV 22, 15.0 from their midpoint, focus on Codex | pull out 6% (15.0 to 15.9) |
| Wide | from in front of the desk at his chin height, tilted down about 5 deg: the human centre, the AI small in the foreground to one side, the window behind, the desk front blurred across the bottom third | FOV 35, about 3.4 m | not built yet | 5 to 9% either way |
| Closing wide | the same wide, pulling back to reveal the room | FOV 35 | not built yet | back 20 to 24% in about 2.5 s, ease out |


### Cutting
- **About 20 shots per 45 s:** 18 to 24 a reel, an average of 2.16 s (1.89 to 2.66 by reel), shortest 0.6 s, longest about 6 s. Hard cuts only.
- **One shot per speaker turn.** A two-sentence turn stays in one shot. Every change of speaker is a cut.
- **The cut lands 0.2 to 0.3 s before the new speaker's first word** (6 to 9 frames; range 0.12 to 0.4 s) and 0.3 to 0.45 s after the previous word ends. Starting values: cut 7 frames (0.23 s) before each line, hold 0.3 to 0.45 s after it.
- **Default:** a 0.2 s lead (0.25 s on the opener), but only a 0.16 s hold after each line, so our lines were 0.36 s apart against the 0.62 s target. For a full episode, hold 0.3 to 0.45 s.
- **Gaps between lines** settle at about 0.6 s (median 0.62; middle half 0.54 to 0.68). About one gap in seven is an authored pause of 0.9 s or more; the longest is about 2 s.
- **Holds of 0.7 to 0.9 s** after the lines that need to land.
- **One or two silent beats of 1.3 to 1.9 s** at the turn: the cut lands right on the end of a line and holds the listener's face.
- **The timeline:** first word at about 0.44 s (0.40 to 0.48), then lines joined by the gaps above, then 1.6 s of tail.
- **The ending:** the last word ends 1.5 to 1.8 s before the end. The closing wide (2.5 to 3.8 s long) pulls back while the room tone fades. No end card, no freeze, no fade to black. About half the reels end on a line that leads back into the opening.

### Captions
- **Font:** Arial Bold (or Liberation Sans Bold), 47 px, white #ffffff, no stroke, no shadow, sentence case, line height 1.42.
- **Box:** black at 50% opacity, corner radius 18 px, padding 15 px above and below and 34 px at the sides. It hugs the text, up to 600 px wide (about 26 characters a line), with a balanced wrap (`text-wrap: balance`). One line makes a box 96 to 100 px tall; two lines, 164 to 177 px.
- **Position:** centred, with the box's middle 285 px from the top (14.9%), so a two-line box grows up and down from the same line. That puts it above his head in his close-ups and over the sky in the wides.
- **Timing:** in over 0.1 s (3 frames), about 0.1 s after the cut and before the voice; out over 0.1 s, about 0.1 s before the next cut. The first line fades in at about 0.3 s, before the first word at 0.44 s. 
- **Content, from the script:** "Claude." with a full stop for the spoken "Claude,"; a leading "..." on a line after a pause of about 0.9 s or more; quote marks for quoted words; numerals for clock times, words for counts.
- **Two rules:** never draw an empty box on a blank cue (skip the cue), and give a punchline its own card so it cannot be read early.
- **The CSS** is in the desk mode's caption code.

### Audio
- **Voices:** dry, close, level-matched, two or three per episode. Mix Codex 5 to 10 dB hotter than Claude's normal lines.
- **No music. No sound effects,** not even on the hops or cuts.
- **Room tone:** a steady noise bed at about -42 dBFS RMS, 25 to 30 dB under the voices, in over 0.3 s, out over the last 0.5 to 1.3 s. Default: brown noise with the drift below about 10 Hz removed, mono 48 kHz, in 0.3 s, out 0.8 s .
- **Master:** mono, about -15 LUFS integrated (measured -14.7 to -16.3, median -15.0), loudness range 5.4 to 9.9 LU, true peak about -1 dBTP before upload.

### Measured numbers

Measured across the format: 41.4 to 57.1 s (median 47.1); 87 to 130 words (median 98), about 2.1 a second; 18 to 24 shots, 2.16 s each; 3 to 5 set-ups; shot mix of human singles 39%, AI singles 40%, wides and two-shots 19%, Codex 2%; first word at 0.40 to 0.48 s (median 0.44); the AI's first reply at 2.0 to 3.9 s (median 3.1); a median gap of 0.62 s between lines; one or two silent beats of 1.3 to 1.9 s; a silent tail of 1.5 to 1.8 s; blinks about every 3.4 s on the human and every 4 s on the AI, on the same seconds every episode; mono, -14.7 to -16.3 LUFS (median -15.0).


---

## Side by side

| | Keyboard | Desk |
|---|---|---|
| Feel | fast, bright, slapstick | quiet, filmic, dry, sometimes tender |
| Who drives the joke | the human's disaster and the AI's literal calm | the AI's habits, and the human's taste and care |
| Set | a giant laptop keyboard, a wall-size dashboard, the night city at the sides | one real-size desk at night, re-lit per script, a window with city lights, the room revealed at the end |
| The screen | carries jokes and callbacks: cards, terminal lines, counters | nothing readable; the jokes are all in the dialogue |
| Render | faceted low poly, saturated purple and orange, strong warm glare, strong bloom | softer facets, teal and orange, matte, faint bloom, soft contact shadows |
| Lens | FOV 26 to 30 on singles, 37.5 to 44 on wides; the background stays readable | FOV 18 to 22 on singles, 35 on the wide; very shallow focus |
| Depth of field | the screen canvas blurred per set-up; no bokeh pass | BokehPass plus disc sprites for the city lights |
| Camera motion | locked off (drifts of 3 to 4% at most) | one slow dolly per shot: in on the human 7 to 13%, out on the AI 10 to 15%; the closing wide pulls back 20 to 24% |
| Set-ups | about a dozen, plus two or three new ones each episode | 3 to 5 |
| Pace | about 30 shots a minute, 1.9 to 2.0 s each | about 20 per 45 s, 2.2 s each |
| Reaction shots | the silent listener under the other's line, about 1 shot in 6 | almost none; the listener reacts soft behind the speaker |
| Silent beat | a silent high wide or a held reaction | 1.3 to 1.9 s on the listener's face |
| Ending | a hard cut to the widest shot, 1 to 1.6 s of silence | the wide pulls back while the room tone fades, 1.5 to 1.8 s after the last word |
| Captions | white bold, no box, a soft shadow, upper middle (top 600 px), the first one from frame 0 | Arial Bold 47 px in a 50% black box (radius 18) centred 285 px from the top, 0.1 s fades |
| Music | a light bed carved under the voices | none |
| Effects | small ones (typing, keys) | none |
| Bed under the voices | the music | room tone at -42 dBFS |
| Master | stereo, -14 LUFS | mono, about -15 LUFS |
| Words per reel | median 110 in 46 to 68 s | median 98 in 41 to 57 s |
| Effort per new episode | about 300k to 500k tokens (screen gags, a dozen set-ups to check) | about 150k to 300k tokens |
