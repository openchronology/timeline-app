# OpenChronology — Short 13: The First Archaeologist Was Out by 1,500 Years. Script and Storyboard

**Runtime:** ~0:43 · **Shape:** the zoom · **Look:** Archive · **Aspect:** 9:16
**For:** history and "did you know" feeds: curious newcomers and students. They stop for a number that's wrong in an interesting way, and they like the ancient world best when it feels like people.
**Purpose:** one fact the timeline makes visible: Babylon's last king, Nabonidus, dug up an inscription of the Akkadian king Naram-Sin and said it was 3,200 years old; on one line, the gap is about 1,700. Then the app as the place where every date keeps its source.
**Points to:** Video 16, the Mesopotamia tour.

**Production notes:**

- About 115 words, read briskly (about 170 wpm). The voice is amused, not mocking: his estimate was a good one for its time.
- **The timeline is the sample `publicity/video/samples/mesopotamia.ochx`**, captured at phone size (480 × 640, scale 2.25) and shown in `phoneShot`. The shots: the Neo-Babylonian years (560–530 BCE) with Nabonidus's reign, Nabonidus at Tayma and "Nabonidus digs up Naram-Sin's foundation"; that moment in the reader (**View mode** on; on a phone the reader fills the screen); **Separate related** from it, then a zoom out to 2320–480 BCE so the upper track holds Naram-Sin's reign at the left and Nabonidus's at the right. Put the `open` under the shot's `actions`, not its `setup`; **Separate related** is a button in the reader (click it with an `eval` action).
- The bracket and the "his date" pin in Scene 4 are the infographic layer beside the phone, not the app: the app shows the two real reigns; the claimed date is drawn by us.
- **Accuracy guardrails:**
  - Naram-Sin's dates are the middle chronology (about 2254–2218 BCE): say "about". Nabonidus's find is dated to the last years of his reign (after 543, before 539 BCE); the sample places it at 542.
  - "About 1,700 years" is 542 − 2254 to 542 − 2218: 1,676 to 1,712. "Out by about 1,500" is Wikipedia's figure (3,200 − 1,700). His 3,200 years from about 542 BCE lands near 3742 BCE, earlier than the oldest writing known (about 3300 BCE).
  - "Called the first archaeologist" is a popular label, not a claim that he dug as archaeologists do; say "called".

---

## ACT 1 · THE CLAIM (0:00 – 0:13)

### Scene 1 · 0:00 – 0:05 · 3,200 years

**FRAME:** The phone, large in the frame, showing the timeline at 560–530 BCE: the Neo-Babylonian Empire band, Nabonidus's reign, Nabonidus at Tayma, and the moment "Nabonidus digs up Naram-Sin's foundation" in the writing colour. Already whole at frame 0. Under the headline, in the look's serif: "c. 540 BCE".

**MOTION:** None to start: the frame is the cover. A soft pulse on the moment as the sentence ends.

**OST:** "A king said this ruin was 3,200 years old"

**VO:**
"Around 540 BCE, a Babylonian king dug up a ruin, and said it was thirty-two hundred years old."

### Scene 2 · 0:05 – 0:13 · Nabonidus at Sippar

**FRAME:** The moment opens in the reader, filling the phone's screen: "Nabonidus digs up Naram-Sin's foundation", its notes (rebuilding the temple of Shamash at Sippar, an inscription of Naram-Sin that, he wrote, no king had seen for 3,200 years), the **Date precision** line, and **Related to**: Nabonidus (556 → 539 BCE), Naram-Sin (2254 → 2218 BCE).

**MOTION:** The reader slides up; the related Naram-Sin row highlights on his name.

**OST:** "A king said this ruin was 3,200 years old"

**VO:**
"He was Nabonidus, Babylon's last king. Rebuilding a temple at Sippar, he dug down to an inscription of Naram-Sin, a king of Akkad."

---

## ACT 2 · THE LINE (0:13 – 0:38)

### Scene 3 · 0:13 – 0:25 · Put them on one line

**FRAME:** **Separate related** from the reader: the phone returns to the timeline, now in two tracks; the upper one holds the moment and its two related reigns. The view zooms out from 560–530 BCE to 2320–480 BCE: Naram-Sin's reign appears at the left of the upper track, Nabonidus's at the right, the whole of Mesopotamian history in between below. Beside the phone, a bracket spans the gap: "≈ 1,700 years".

**MOTION:** The tracks part; one continuous zoom out (about 5 seconds); the bracket draws between the two ends as the number is said.

**OST:** "It was about 1,700"

**VO:**
"Put them on one line. Separate related, and the two kings rise into a track of their own. Naram-Sin ruled about 2250 BCE. The gap isn't thirty-two hundred years. It's about seventeen hundred."

### Scene 4 · 0:25 – 0:38 · Before writing

**FRAME:** The view widens again, to 3900–400 BCE; the lower track's Uruk-period moments come in at the left, "Writing: proto-cuneiform" (3300 BCE) among them. Beside the phone, the infographic layer adds a pin left of everything written: "his date: c. 3740 BCE", and a second bracket, "out by ~1,500 years".

**MOTION:** The zoom eases out; the pin drops in on "before"; the second bracket draws from the pin to Naram-Sin.

**OST:** "Out by ~1,500 years"

**VO:**
"His number would put it before 3700 BCE, earlier than any writing we know of. He was out by fifteen centuries, and he's still called the first archaeologist."

---

## ACT 3 · THE POINT (0:38 – 0:43)

### Scene 5 · 0:38 – 0:43 · Every date, with its source

**FRAME:** The phone shrinks and lifts; `shortEnd` with "Every date, with where it comes from", "timescale.info/athan/mesopotamia" and "github.com/openchronology/timeline-app".

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"Every date on one line, with where it comes from. That's OpenChronology, and it's free."

**[END · ~0:43]**

---

## Appendix A · Narration only (for the voice session)

> Around 540 BCE, a Babylonian king dug up a ruin, and said it was thirty-two hundred years old.
>
> He was Nabonidus, Babylon's last king. Rebuilding a temple at Sippar, he dug down to an inscription of Naram-Sin, a king of Akkad.
>
> Put them on one line. Separate related, and the two kings rise into a track of their own. Naram-Sin ruled about 2250 BCE. The gap isn't thirty-two hundred years. It's about seventeen hundred.
>
> His number would put it before 3700 BCE, earlier than any writing we know of. He was out by fifteen centuries, and he's still called the first archaeologist.
>
> Every date on one line, with where it comes from. That's OpenChronology, and it's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                          | Arithmetic                             | Source                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Nabonidus put Naram-Sin's foundation 3,200 years before him; written between 543 and 539 BCE   | —                                      | [Nabonidus](https://en.wikipedia.org/wiki/Nabonidus), [Nabonidus Cylinder from Sippar](https://www.livius.org/sources/content/nabonidus-cylinder-from-sippar/) |
| 2     | Nabonidus, last king of Babylon (556–539 BCE), rebuilt the Ebabbar, Shamash's temple at Sippar | —                                      | [Nabonidus](https://en.wikipedia.org/wiki/Nabonidus), [Nabonidus Cylinder from Sippar](https://www.livius.org/sources/content/nabonidus-cylinder-from-sippar/) |
| 2     | Naram-Sin, king of Akkad, about 2254–2218 BCE (middle chronology)                              | —                                      | [Naram-Sin of Akkad](https://en.wikipedia.org/wiki/Naram-Sin_of_Akkad)                                                                                         |
| 3     | The gap is about 1,700 years                                                                   | 2254 − 542 = 1,712; 2218 − 542 = 1,676 | The two above                                                                                                                                                  |
| 3     | Separate related moves an entity and what is linked to it into a track above                   | —                                      | [Relationships](../../docs/relationships.md#viewing-and-editing)                                                                                               |
| 4     | His figure lands before 3700 BCE, earlier than the oldest known writing (about 3300 BCE)       | 542 + 3,200 = 3,742 BCE                | [Cuneiform](https://en.wikipedia.org/wiki/Cuneiform)                                                                                                           |
| 4     | Out by about 1,500 years ("fifteen centuries"); called the "first archaeologist"               | 3,200 − 1,700 = 1,500                  | [Nabonidus](https://en.wikipedia.org/wiki/Nabonidus)                                                                                                           |
| 5     | Every moment keeps its sources; the app is free                                                | —                                      | [Guide: reading a timeline](../../docs/guide.md#reading-a-timeline); [Licensing](../../docs/licensing.md)                                                      |

## Appendix C · Posting

- **Title (Shorts):** A Babylonian king dated a ruin 3,200 years old. It was 1,700.
- **Caption:** Nabonidus, Babylon's last king, dug up an inscription of Naram-Sin of Akkad and put it 3,200 years before his own time. On one timeline the gap is about 1,700 years. Dates before 1500 BCE are the middle chronology. Free and open source: link in bio. #history #ancienthistory #mesopotamia #babylon #archaeology
- **Cover:** frame 0 (the Neo-Babylonian years on the phone and the headline).
- **Pinned comment:** "The whole timeline, villages to Cyrus, with every date's source: timescale.info/athan/mesopotamia. Made with OpenChronology, free and open source: github.com/openchronology/timeline-app"
