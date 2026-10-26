# OpenChronology — Short 10: Why Did It Happen? Script and Storyboard

**Runtime:** ~0:43 · **Shape:** the stat · **Look:** Terminal · **Aspect:** 9:16
**For:** safety professionals, investigators, incident and postmortem leads, and people who teach root cause analysis, on work and safety feeds. Every one of them has been asked "why did it happen?" and knows the honest answer is a chart, not a sentence; the hook is that question, and the payoff is the chart building itself.
**Purpose:** an events and causal factors chart assembling in three beats (events on a line, conditions beneath them, links that light up the causal factors), then the same chart in the real app on a phone. End on the method's three words.
**Points to:** Video 13, investigations: from timeline to causal factors.

**Production notes:**

- About 116 words, an investigator explaining the method to a colleague: plain and steady. Someone was hurt in the case, so no jokes.
- **The case is the sample `publicity/video/samples/investigation.ochx`**, made up: a forklift reversing out of aisle 14 on a night shift strikes a picker crossing the aisle end. Scenes 2–4 draw it in the motif, with the shapes the app uses (`process` rectangles for events, a red `diamond` for the collision, durations for conditions); Scene 5 is the real app at phone size, in `phoneShot`: the last three minutes with their arcs, bands and the collision's stack. A small note on screen in Scene 2 says the case is made up.
- The app holds the chart; the investigator decides what the causal factors are. The narration says "you mark", never that the app finds them.
- Relationships are undirected arcs in the app; the drawn arcs in Scene 4 have no arrowheads either.

---

## ACT 1 · THE QUESTION (0:00 – 0:07)

### Scene 1 · 0:00 – 0:07 · Why?

**FRAME:** A dark axis across the middle, one red diamond on it, "02:34:09" above it and "collision · aisle 14" below. Already whole at frame 0.

**MOTION:** The diamond pulses once.

**OST:** "Why did it happen?"

**VO:**
"A forklift strikes a worker on the night shift. Everyone asks the same question: why did it happen?"

---

## ACT 2 · THE CHART (0:07 – 0:32)

### Scene 2 · 0:07 – 0:14 · Events

**FRAME:** The axis, the diamond at the right. Three `process` rectangles drop onto it one by one from the left, each with its time and title: "02:31:48 · FL-3 enters aisle 14", "02:33:20 · picker crosses", "02:33:58 · FL-3 reverses". A small note: "A made-up case".

**MOTION:** Each rectangle drops as its event is said, with a small bounce; the line between them draws left to right.

**OST:** "Events."

**VO:**
"Start with the events, in order, to the second: the forklift into the aisle, the picker crossing its end, the reverse out."

### Scene 3 · 0:14 – 0:23 · Conditions

**FRAME:** Three bands slide in beneath the axis from the left, each running under the diamond: "10-hour night shift" (yellow), "aisle-end light out since Tuesday" (red), "no spotter on shift" (red).

**MOTION:** The bands slide in one by one as they're named; a cursor line drops from the diamond through all three on "all".

**OST:** "Events. Conditions."

**VO:**
"Then the conditions that held at the time: a ten-hour night, the light at the aisle end out since Tuesday, no spotter. All of them still there at the collision."

### Scene 4 · 0:23 – 0:32 · Causes

**FRAME:** Arcs draw from each band and event to the diamond. Two bands and their arcs turn bright red, with chips "causal factor"; the rest dim. A "root cause" chip appears on a small stadium at the left edge, "no risk review of the longer shifts".

**MOTION:** The arcs draw on "link"; the chain lights up on "mark"; the chips pop; the root cause chip last, on "root".

**OST:** "Events. Conditions. Causes."

**VO:**
"Link each one to what it led to, and you mark the causal factors, and the root cause behind them: nobody reviewed the risks of the longer shifts."

---

## ACT 3 · THE APP (0:32 – 0:43)

### Scene 5 · 0:32 – 0:37 · On a phone

**FRAME:** The phone, the real app on the case: the last three minutes, arcs linking the events to the collision, the conditions as bands beneath, and the collision's moment stack below it. A chip: "the real app".

**MOTION:** The phone rises in; the chip ticks in on "chain".

**OST:** "Events. Conditions. Causes."

**VO:**
"OpenChronology keeps the whole chain on one exact timeline, for everyone checking it."

### Scene 6 · 0:37 – 0:43 · The method

**FRAME:** `shortEnd` with "Events and causal factors".

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"Events, conditions, causes. It's free."

**[END · ~0:43]**

---

## Appendix A · Narration only (for the voice session)

> A forklift strikes a worker on the night shift. Everyone asks the same question: why did it happen?
>
> Start with the events, in order, to the second: the forklift into the aisle, the picker crossing its end, the reverse out.
>
> Then the conditions that held at the time: a ten-hour night, the light at the aisle end out since Tuesday, no spotter. All of them still there at the collision.
>
> Link each one to what it led to, and you mark the causal factors, and the root cause behind them: nobody reviewed the risks of the longer shifts.
>
> OpenChronology keeps the whole chain on one exact timeline, for everyone checking it.
>
> Events, conditions, causes. It's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                  | Source                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1–4   | The case: FL-3, aisle 14, the collision at 02:34:09; the events' times; the conditions; the root cause | `investigation.mjs` (made up); [Video 13](../13-investigations-causal-factors.md) |
| 2     | Events as Moment shapes `process`, the collision a `diamond` in the Bad color                          | [Plugins: Moment shapes](../../docs/plugins.md)                                   |
| 3     | Conditions as durations beneath the axis                                                               | [Durations](../../docs/durations.md)                                              |
| 4     | Links as relationships, drawn as arcs (undirected, unlabeled); causal factors marked by color and tag  | [Relationships](../../docs/relationships.md); [Tags](../../docs/tags.md)          |
| 5     | The real app on a phone: relationships as arcs, durations beneath, the collision's moment stack        | [Relationships](../../docs/relationships.md); [Plugins](../../docs/plugins.md)    |
| 6     | Events and causal factors charting is an established method                                            | [Video 13](../13-investigations-causal-factors.md), Appendix D                    |

## Appendix C · Posting

- **Title (Shorts):** Why did it happen? Events, conditions, causes.
- **Caption:** An events and causal factors chart, built in three steps: the events in order, the conditions that held, and the links that show the causal factors. (The case is made up; the method is standard; the tool is free and open source, link in bio.) #safety #incidentinvestigation #rootcauseanalysis #ehs #postmortem
- **Cover:** frame 0 (the red diamond at 02:34:09 and the headline).
- **Pinned comment:** "Learn the method from the U.S. DOE's accident investigation guidance; build the chart in OpenChronology: github.com/openchronology/timeline-app"
