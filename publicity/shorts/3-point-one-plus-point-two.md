# OpenChronology — Short 3: 0.1 + 0.2 Isn't 0.3. Script and Storyboard

**Runtime:** ~0:33 · **Shape:** the stat · **Look:** Terminal · **Aspect:** 9:16
**For:** developer feeds. Every one of them has met `0.30000000000000004`; what they haven't thought about is what it does to time. The comments will argue, so every number must be exactly right.
**Purpose:** open on the familiar wound, turn it into a problem for time (a double's steps grow with distance from 1970), and answer it in one line: every time is an exact fraction.
**Points to:** Video 4, exact time.

**Production notes:**

- About 85 words, dry and quick, a developer telling a developer.
- Everything is drawn: a terminal prompt, then a number line whose steps widen, then fractions. No app capture.
- The output is typed character by character on screen; the caption carries the spoken version.

---

## ACT 1 · THE WOUND (0:00 – 0:20)

### Scene 1 · 0:00 – 0:06 · Ask it

**FRAME:** A terminal window filling the width of the safe area: `> 0.1 + 0.2` on the prompt, and under it, already printed, `0.30000000000000004` with its trailing `4` in red. Already whole at frame 0.

**MOTION:** The red `4` pulses once on "four".

**OST:** "0.1 + 0.2 = 0.30000000000000004"

**VO:**
"Ask your computer what a tenth plus two tenths is. Zero point three, fifteen zeros, and a four."

### Scene 2 · 0:06 – 0:12 · Why

**FRAME:** The terminal shrinks to the top; under it, a strip of binary digits running off the right edge, cut off by a bracket labelled "53 bits", and an arrow to "rounded".

**MOTION:** The bits stream in; the bracket snaps shut on "fixed"; "rounded" drops in.

**OST:** "Floating point rounds"

**VO:**
"Most software keeps numbers in binary with a fixed number of digits, and a tenth doesn't fit. So it rounds."

### Scene 3 · 0:12 – 0:20 · Now do it with time

**FRAME:** A vertical number line, "now" at the top, the past below. Beside it, the smallest step a double can tell apart at each point: "Today · ¼ µs", "Dinosaurs' extinction · ¼ s", "Earth forms · 16 s", the step drawn as a gap that widens down the line.

**MOTION:** Each row slides in on its word; the gaps widen as they arrive.

**OST:** "Now do it with time"

**VO:**
"Store time that way, and the further from 1970 you go, the blurrier it gets. At the dinosaurs' extinction, a quarter of a second. When the Earth formed, sixteen."

---

## ACT 2 · THE FIX (0:20 – 0:33)

### Scene 4 · 0:20 – 0:29 · A fraction

**FRAME:** Large fractions stacked in the middle: `1/10 + 2/10 = 3/10` with a green check, then `1/3 s` with "stays exactly ⅓", and under them a small chip: "exact in the editor, the server and the files".

**MOTION:** The sum assembles term by term; the check pops; `1/3 s` slides in on "third".

**OST:** "Store a fraction instead"

**VO:**
"OpenChronology stores every time as an exact fraction. A tenth is one over ten. A third of a second stays exactly a third, four billion years back or a billion times zoomed in."

### Scene 5 · 0:29 – 0:33 · Check it

**FRAME:** `shortEnd` with "Every time is a fraction".

**MOTION:** The fractions shrink away; the end card rises and holds.

**OST:** ""

**VO:**
"It's open source, so check the math yourself."

**[END · ~0:33]**

---

## Appendix A · Narration only (for the voice session)

> Ask your computer what a tenth plus two tenths is. Zero point three, fifteen zeros, and a four.
>
> Most software keeps numbers in binary with a fixed number of digits, and a tenth doesn't fit. So it rounds.
>
> Store time that way, and the further from 1970 you go, the blurrier it gets. At the dinosaurs' extinction, a quarter of a second. When the Earth formed, sixteen.
>
> OpenChronology stores every time as an exact fraction. A tenth is one over ten. A third of a second stays exactly a third, four billion years back or a billion times zoomed in.
>
> It's open source, so check the math yourself.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                               | Source                                                                                                            |
| ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1     | `0.1 + 0.2` prints `0.30000000000000004`: "0.3", fifteen zeros, "4"                 | Python and JavaScript, IEEE 754 doubles                                                                           |
| 2     | A double has a 53-bit significand; a tenth has no finite binary expansion           | IEEE 754                                                                                                          |
| 3     | Smallest step between doubles: 2.4 × 10⁻⁷ s today, 0.25 s at 66 Ma, 16 s at 4.54 Ga | Python `math.ulp(t)`; [Video 4](../4-exact-time-rational-numbers.md), Appendix B                                  |
| 4     | Every time is a reduced fraction of arbitrary-size integers, in every store         | [Guide: exact times](../../docs/guide.md#exact-times); [Video 4](../4-exact-time-rational-numbers.md), Appendix B |
| 4     | A third of a second stays a third however far you zoom or how far back it is        | [Video 4](../4-exact-time-rational-numbers.md), Scene 6                                                           |
| 5     | Open source (GPL v3)                                                                | [Licensing](../../docs/licensing.md)                                                                              |

## Appendix C · Posting

- **Title (Shorts):** 0.1 + 0.2 ≠ 0.3, and why that breaks time
- **Caption:** Floating point rounds a tenth, and the further a timestamp is from 1970, the coarser it gets: 16-second steps at the Earth's formation. OpenChronology stores every time as an exact fraction instead. GPL, link in bio. #programming #floatingpoint #javascript #python #softwareengineering
- **Cover:** frame 0 (the terminal and the headline).
- **Pinned comment:** "Source: github.com/openchronology/timeline-app (times are reduced rationals of BigInts in the editor, the server's PostgreSQL and the desktop's SQLite). Step sizes are math.ulp(t) for t in seconds since 1970."
