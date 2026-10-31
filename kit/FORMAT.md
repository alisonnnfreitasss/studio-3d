# The format: planning a 3D explainer from a topic

For a planner with no reference video. Read this, then `WORLDS.md` (what can be reused), then `README.md` (the JS contract). Measured by script on nine finished reels of the format.

"Measured" below means counted from each reel's `timeline.json`, `renders/shotmap/probe.json` (every 0.1 s), its `.qa.json` (cuts in the final render), its sound cues and its `direct(t)`. "Judged" means read by hand. Ranges are min to max across the nine, then the median. All nine run 104 to 179 s, so **every number for 30 s and 60 s is extrapolated, not observed**.

## The idea in one paragraph

The viewer is the inventor. They try the obvious thing, it fails, and every part of the real machine is their own fix to their own last problem. Each "But..." opens a loop, each "So you..." closes it, each "That's the..." pays it with a real word. One lead, one world, one text kit, and a camera that lands on the part the voice is about to name.

## 1. The story skeleton

Roles in order. "Uses" is how many of the nine have the role. Share is the share of runtime (sentence start to next sentence start), range and median. The loop roles repeat; the rest appear once.

| # | Role | Uses | Count per reel | Share of runtime | How it reads |
|---|---|---|---|---|---|
| 1 | Hook | 9 | 1 to 5 sentences (2) | 2.8 to 14.4% (5.8%) | Puts you in a situation in one breath (section 3) |
| 2 | "You invent it" premise | 9 | implied, never stated | 0 | No line says "let's build one". The first "So you" does the job |
| 3 | Naive first attempt | 9 | 1 | inside the hook | Something a child would try. 8 of 9 in the hook; the engine's comes as its first fix |
| 4 | Failure | 9 | 1 | inside the hook | Plays out on screen, usually in the same sentence as the attempt (7 of 9 by sentence 2) |
| 5 | Why it failed | 6 | 1 | inside the hook | One plain cause (microwave, air conditioner, light bulb, fridge, airplane, skyscraper). Judged |
| 6 | Rewind on screen | 4 | 0 to 5 (bridge 5, airplane 2, skyscraper 2, fridge 1) | under 1 s each | Bridge rewinds after every failure: the newest reel and the only one doing it fully |
| 7 | Problem ("But...") | 9 | 5 to 12 (7) | 14 to 34% (20%) | A new failure caused by the last fix |
| 8 | Fix ("So you...") | 9 | 6 to 12 (8) | 19 to 37% (25.5%) | One thing you do, in plain words, no term yet |
| 9 | Mechanism | 8 | 0 to 12 (8) | 0 to 32% (21%) | How the fix works. Bridge has none and is still clear: it is the option to cut first |
| 10 | Naming the real term | 9 | 5 to 11 (8) | 8 to 13% (9.8%) | Short sentence of its own: "That's the X." |
| 11 | Everyday callback | 7 | 0 to 2 (1) | 0 to 3.7% | "That's why [thing you have noticed]" |
| 12 | Myth or twist | 2 | 0 to 4 | 0 to 7.9% | What everyone believes is wrong (microwave, air conditioner) |
| 13 | Recap | 4 | 0 to 2 | 0 to 6.7% | The whole loop in one line (air conditioner, fridge, airplane, engine) |
| 14 | Reassurance | 1 | 0 to 2 | 0 to 2.6% | "Names don't matter" (engine only, about two-thirds in). Optional |
| 15 | Finishing touches | 8 | 1 | 0 to 5.3% (2.6%) | "Add a, b and [joke]" in one sentence, all but bridge |
| 16 | Use it | 4 | 0 to 1 | 0 to 3.3% | "Now just [press start]" (light bulb, fridge, skyscraper, engine) |
| 17 | Congrats | 9 | 1 to 2 | 1.2 to 2.4% (2.1%) | "Congrats, you just built a [X]." |
| 18 | Comment ask | 9 | 1 to 2 (5 use two keywords, 4 one) | 2.3 to 4.5% (3.4%) | A keyword of your own; 4 of 9 add a follow ask in the same line |

Shares come from a rule-based sentence tagger with hand overrides; they sum to 100% per reel. A sentence doing two jobs counts once.

Timing that held across the nine:

| Measure | Range | Median |
|---|---|---|
| First "So..." line starts | 4.9 to 21.4 s (2.8 to 16.8% of the film) | 10.2 s |
| First naming sentence | 9.1 to 27.8 s | 21.5 s |
| Between naming sentences | 12.6 to 17.9 s (medians per reel) | 14.9 s |
| Fixes per minute | 3.0 to 4.0 | 3.4 |
| Names per minute | 2.5 to 3.7 | 3.4 |
| Problems per minute | 2.4 to 4.3 | 2.9 |
| End block, from "Congrats" to the last frame | 5.4 to 9.0 s | 8.0 s |
| End block, from finishing touches | 7.1 to 16.6 s | 12.2 s |

**The loop is the unit:** problem, fix, optional mechanism, name, about 15 s. Pick the machine's real parts, order them so each solves the failure of the one before, and cut parts until the loops fit the length. Never add a loop whose problem the viewer did not just see.

## 2. The numbers of a script

| Measure | Range | Median |
|---|---|---|
| Sentences per minute | 14.9 to 19.0 | 17.3 |
| Words per second, whole film | 2.57 to 3.01 | 2.83 (170 a minute) |
| Sentence length, words | median per reel 8 to 10; 10th percentile 3 to 4; 90th percentile 15 to 19; longest 16 to 30 | 9.5 |
| Sentence length, seconds | median per reel 2.4 to 3.0; longest 4.8 to 8.4 | 2.84 |
| Longest pause | 1.1 to 2.3 s | 1.36 s |
| Pauses over 0.5 s | 3 to 18 per reel | 13 |
| Silence after the last word | 0.8 to 2.4 s | 0.8 s |
| Sentences with you or your | 18 to 42% | 33% |
| Sentences with a number | 2 to 21% | 8% |
| Characters | about 5.3 a word (bridge: 1,421 counted, 1,462 billed) | |

The voice never stops for long. Mix long and short on purpose: a 15 word fix, then a 4 word name.

## 3. How a line is written

Spoken English, read aloud before it counts. Contractions always. No "this device", no "in order to", no lecture voice. Second person is carried by the imperative as much as by "you": "Sprint, leap off a cliff" is second person with no pronoun. Term only after the plain description has done the work: "So you hang a giant weight up top", then "That's the tuned mass damper."

| Role | Shape | Our examples |
|---|---|---|
| Fix | "So you [verb] [plain thing]." | "So you tilt the slab, and water runs off." |
| Name | "That's the X." "Those are the X." 3 to 6 words, alone | "That's the anchorage." |
| Problem | "But [the last fix now causes this]." | "But now your dinner's invisible." |
| Callback | "That's why [you've seen this]." | "That's why old bulbs burn you." |
| Finishing | "Add a, b, and [joke]." | "Add a filter, a white case, a remote you'll lose." |
| Congrats | "Congrats, you just built a [X]." | |
| Ask | "Comment [WORD] if that was news to you." or "If you knew that, comment A. If not, comment B." | keywords from the story: DING, THUNK, PENTHOUSE / BASEMENT |

**Jokes (judged).** Every reel has at least one light line. They come from the viewer paying for the machine, not from wordplay. Three places: the last item of finishing touches (5 of 9: "a meal nobody asked for", "a neighbour who plays drums at midnight"); the problem that hits the lead himself ("including you", "whoever lives up there gets seasick"); a two-word beat ("Game over.", "A fork? Nope."). A number lands harder than an adjective: a figure a sentence is plain, a figure the viewer can feel is a joke ("two metres thick").

**Hooks.** What the best openings share: a concrete thing from the viewer's own life (your house, your hot room, walls and a roof, your crush), something they do to it, and a clear picture by the first 5 or 6 seconds. A question alone does not carry it.

**Hook checklist:** an everyday object or a person the viewer cares about, an action in the first 6 words, a first sentence of 0.7 to 5.8 s , failure visible by about 7 s (a target, judged), no "did you know", no "here's how X works", no term.

## 4. Density on screen

Per minute unless noted. Median in bold. Airplane is left out of the camera move row: its camera follows a moving plane for 136 s, so the same counter reads it as long tracking moves.

| Item | Range | Median | Notes |
|---|---|---|---|
| Eased camera moves | 10.5 to 27 | **18.7** | Bridge is the top (27), engine and roof the bottom. Duration 0.4 to 0.65 s (median 0.5) |
| Hold between moves | 1.1 to 2.9 s | **1.9 s** | Slow drift, never dead still |
| Push vs pull (counts) | 13 to 26 vs 12 to 29 | **20 vs 16** | Roughly equal: the camera breathes |
| Share of film moving | 14 to 28% | **19%** | Airplane 77% (tracking) |
| Moves starting within 0.4 s of a sentence start | 36 to 77% | **61%** | Reframes begin on the word that needs them |
| First move | 0.1 to 5.2 s | **1.3 s** | 3 to 10 moves in the first 15 s (median 5) |
| Hard cuts (count in the final render) | 0 to 35 | **8** | Microwave 0, fridge 4, roof 7, skyscraper 7, air conditioner 8, bridge 9, light bulb 13, engine 21, airplane 35 |
| Hard cuts | 0 to 11.7 | **3.4** | Only when the place changes or a split starts or ends |
| Splits | 0 to 3 per reel; 0 to 16.8 s | 6 of 9 use one | Cause on top, effect below |
| Name tags | 3.9 to 5.9 | **4.4** | One per name, plus a few for a result or time jump |
| Pills | 0 to 22.4 | **10.1** | Bridge has none. Median 1 to 3 words, up to 6 |
| Red X and green check | 0.4 to 6.0 | **2.3** | |
| Force and curved arrows | 0 to 9.8 | **3.1** | Air conditioner and light bulb use none |
| Gadgets (dial, gauge, counter, bill...) | 1 to 11 types per reel | **3 types** | Only when a number matters. Most live 2 to 7 s |
| Comment ask items | 1 to 2 per film | | Last 2 to 5 s |
| Frames with a label besides the caption | 48 to 79% | **62%** | |
| Lead's pose changes | 0.5 to 25.9 | **5.6** | Microwave acts through faces and flushes (2 poses); bridge walks constantly |
| Lead's distinct poses | 2 to 14 per film | **11** | Faces 4 to 12 |
| Share of film with the lead in the frame state | 39 to 100% | **60%** | He leaves for pure mechanism beats. State present, not proved visible |
| Sound effects | 33 to 122 | **74.5** | Whooshes 14 to 27 a minute in older reels |

Label life on screen, medians per reel: pill 1.2 to 2.1 s, tag 1.4 to 2.3 s, badge 0.9 to 3.1 s, arrow 1.4 to 6.3 s.

Tag timing, measured on the format's reels: a tag pops at the start of its naming sentence (median 0.0 to 0.12 s after the sentence starts), so it arrives before the word. The rest is measured on the reference reels and already the kit's default or standard practice: labels pop in over 3 frames and shrink out over 4; pills land on their keyword; part entrances take a median 8.5 frames (3 to 14), hero parts 13 to 14 with a settle; a named part pulses light and dark about every 12 frames for 40 to 75 frames; the naming sentence's caption is yellow.

## 5. The grammar of a beat

1. **Problem:** the failure plays out. Red X on it. Lead reacts with his whole body (poses `worry`, `shrug`, `headHands`, `sick`, `recoil`, `burnt`).
2. **Rewind (use it):** about 0.7 s of the same shot backwards in greyscale with scan lines, ending on a white flash. Worked example `../bridge/build/js/direction.js`. Traps in `README.md`.
3. **Fix:** pause icon top right while building. The new part flies in on its word (`parts.enter`). Camera lands on it.
4. **Mechanism:** the part runs at once. Particles, flow dots, arrows, a cutaway or a split show the physics. A pill names each effect in 1 to 3 words.
5. **Name:** play icon, part turns yellow and pulses (`parts.highlight`, `words.pulse`), tag pops, caption goes yellow.
6. **Next problem:** the whole machine is still there; the new failure attacks it. Time passing gets the fast-forward icon. Keep one world: the set stays, the machine grows.

Icons and full-frame rewinds were new with the bridge; older reels lack them and the kit supports them.

Scale jumps do the wow: whole tower to one bar of steel in one eased move, house to one tile, food to one molecule. Plan at least one for each reel (judged).

## 6. Rules

Rules:
- Every on-screen text starts with a capital letter: "Beam", "Suspension bridge". Write sentence case. The kit capitalises anyway. Words after a number stay low.
- No brand, watermark or handle in the picture or the voice. The old `wm` overlay type is ignored by the kit; older probes that list it are stale, it was removed from the finals.
- Never say or show the reference page's name. Never copy its lines: write your own.
- Shot map before any render.
- Every reel ships in two versions: the original, and mirrored in other colours on another song (`README.md`).
- Nothing posts without the person's word.
- State the voice characters and wait for the person's go before `voice.py --spend`; never past 3,200 characters a reel.

Standing checks: one-word captions only (`words.captions`); `check.py` after a render; `tools/speed.py` for movement limits, calibrated on these nine; look at the mirrored stills for frame-fixed items that land on content.

## 7. Scaled templates

Numbers below scale the medians; ranges come from the range across the nine. **The 120 s column is backed by reels of that length (microwave 116 s, light bulb 122 s, bridge 104 s). The 30 s and 60 s columns are extrapolated**: nothing that short has been made. Below 60 s drop the optional roles first.

| | 30 s | 60 s | 120 s |
|---|---|---|---|
| Words | about 85 | about 170 | about 340 |
| Sentences | 9 to 10 | 17 | 35 |
| Voice characters | about 450 | about 900 | about 1,800 |
| Loops (problem, fix, name) | 2 | 3 to 4 | 6 to 8 |
| Opening until the first "So" | up to 5 s | 6 to 8 s | 10 s |
| End block | 3 to 4 s, one line | 5 to 6 s | 8 s, plus 3 s of finishing touches |
| Mechanism lines | 0 | 1 to 2 | 4 to 8 |
| Callback, joke | 1 joke, no callback | 1 of each | 1 to 2 of each |
| Recap, reassurance | no | no | optional |
| Eased camera moves | about 10 (5 to 13) | about 20 (11 to 27) | about 40 (21 to 54) |
| Hard cuts | 0 to 1 | 0 to 3 | 0 to 8 |
| Splits | 0 | 0 to 1 | 1 to 2 |
| Name tags | 2 | 3 to 5 | 6 to 9 |
| Pills | 0 to 5 | 0 to 10 | 0 to 20 |
| Red X / check | 1 to 2 | 2 | 3 to 5 |
| Arrows | 1 to 2 | 3 | 6 |
| Gadgets | 0 to 1 | 1 | 2 to 3 |
| Rewinds | 1 | 2 to 3 | 4 to 6 |
| Lead's pose changes | about 3 | about 6 | about 11 (acts up to 50 on a walking reel) |
| Sound effects | about 35 (17 to 60) | about 75 (33 to 120) | about 150 (66 to 240) |

**30 s, by time**

| Time | Role | Words |
|---|---|---|
| 0 to 4 s | Hook, attempt and failure in one or two sentences | 12 |
| 4 to 11 s | So you, fix 1. That's the X | 20 |
| 11 to 23 s | But, problem. So you, fix 2. That's the Y | 35 |
| 23 to 30 s | Congrats, you just built it. Comment WORD | 18 |

**60 s, by time:** 0 to 7 s hook, attempt, failure. 7 to 20 s fix, one mechanism line, name. 20 to 33 s but, fix, name, callback. 33 to 45 s but, fix, name. 45 to 54 s but, fix in one breath, name or joke. 54 to 60 s congrats, comment.

**120 s, by time:** 0 to 10 s hook, attempt, failure, why. 10 to 25 s fix, mechanism, first name. 25 to 100 s, 5 to 7 loops of about 13 s, with one callback, one joke problem on the lead, one scale jump, one split. 100 to 104 s optional recap. 104 to 112 s finishing touches with a joke, optional use it. 112 to 120 s congrats, comment ask with one or two keywords.

The bridge is the closest worked example of a tight reel: 26 sentences in 104 s, no mechanism lines, 27 moves a minute, full rewinds, pause and play icons. Its `PLAN.md` is the model for the beat table.

## 8. The planner's checklist

Topic:
- [ ] Machine has at least (seconds / 15) real named parts, or be shorter.
- [ ] Each part answers a failure a viewer can see, not a spec. Order the parts so each fix causes the next problem.
- [ ] Every fact and number checked (a wrong number would be published).

Hook:
- [ ] First 6 words hold a concrete thing and an action.
- [ ] Attempt is one a child would try; failure visible by 7 s; no term before the first naming.
- [ ] Hook belongs to the viewer's daily life, or has a human stake.

Script:
- [ ] Words about 2.83 x seconds; sentences about 17 a minute; median about 9.5 words; none over about 25.
- [ ] Every name in its own short sentence. Fix lines start "So", problems "But" (vary a few).
- [ ] At least one joke; the comment keyword is yours and comes from the story.
- [ ] Read aloud once. Nothing sounds written.

Picture:
- [ ] One world, one lead. The machine grows in place. World chosen from `WORLDS.md` first.
- [ ] Moves 18 to 27 a minute; hold about 2 s; pushes and pulls about equal; a move opens within 0.4 s of a sentence in most beats.
- [ ] Cuts only for place changes and splits.
- [ ] A tag for every name, popping as the naming sentence starts; part yellow and pulsing.
- [ ] Red X on each failure; rewind after each failure if the build allows; pause on the fix, play on the name.
- [ ] Labels on about 60% of frames, none empty for long; pills 1 to 3 words, capital first letter.
- [ ] Lead acts each problem, leaves the frame for pure mechanism; cheers at Congrats.
- [ ] At least one scale jump.

Sound:
- [ ] About 75 effects a minute: a whoosh on big moves, a pop on entrances, a chime on names, a buzz on failures, a fanfare at Congrats. Loud material effects on each break.

Before spending:
- [ ] No brand, no reference name, no watermark.
- [ ] Characters counted and stated; the person's go on the voice.
- [ ] Shot map read before render; `check.py` and `speed.py` pass after.
- [ ] Mirrored version thought through: frame-fixed items clear of the content.

## 9. What could not be measured

- Lengths under 104 s: none exist.
- Camera moves in the airplane: the moving plane confuses the counter.
- Poses count named poses in `direct(t)`; acting through faces, flushes and hops does not register. Presence of the lead is the state existing, not him being in frame.
- Sound effect kinds for the bridge are not split out (its total is measured; loops hide the kinds).
