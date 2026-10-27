# OpenChronology — Short 18: The Dow Took 25 Years to Get Back. Script and Storyboard

**Runtime:** ~0:44 · **Shape:** the stat · **Look:** Archive · **Aspect:** 9:16
**For:** history, economics and "did you know" feeds: curious newcomers and students. They know the Crash of 1929 as one day; what stops them is how long the market took to come back, and the honest twist that the famous number isn't the whole story.
**Purpose:** one duration made visible: the Dow's 1929 peak and its return in 1954 as one band on a phone, the fall that took under three years and the climb that took twenty-two, then the moment that says what the number leaves out. It ends on the timeline's address.
**Points to:** Video 21, the Great Depression tour.

**Production notes:**

- About 115 words (the numbers spelled out), read briskly at about 170 wpm. The voice is a history teacher who likes the number and likes its footnote even more.
- **The timeline is the sample `publicity/video/samples/great-depression.ochx`**, captured narrow for a phone (360 × 640 CSS pixels at scale 3, so 1080 × 1920) and cropped close to the timeline in `phoneShot`, so the bands' titles stay readable; every shot lowers **Group within** to 12 px with an `eval` in its `setup`. Scenes 2–3 use **Separate by tags** on `market`: the market's moments and bands lift into the upper track, on the same time axis as everything else.
- The reader in Scene 4 is opened (an `open` under the shot's `actions`) from the unseparated view 1953-01-01 → 1956-01-01, so it shows the moment's full date; on a phone it fills the screen.
- The counters and brackets beside the phone are drawn by the infographic layer; the bands themselves are the app's.
- **Accuracy guardrails:** the Dow's closing high (381.17, September 3, 1929), low (41.22, July 8, 1932) and first close above the high (November 23, 1954) as the standard references give them; spans are differences between calendar dates (Appendix B shows the arithmetic). The narration says the 25 years is "the price alone" and gives the dividend-and-deflation figure as "about 1936", the source's own rounding.

---

## ACT 1 · THE NUMBER (0:00 – 0:20)

### Scene 1 · 0:00 – 0:07 · Twenty-five years

**FRAME:** The phone, large in the frame, on the whole line after **Fit all** (1913 → 1961): the summaries crowded in the 1930s and, beneath the axis, the long band The Dow below its 1929 peak reaching out to 1954, where a lone summary sits. Above the phone, the headline already there at frame 0; under it, in the look's serif, "Sept 3, 1929 → Nov 23, 1954".

**MOTION:** None to start: the frame is the cover. The Dow band brightens as "twenty-five years" is said.

**OST:** "The Dow took 25 years to get back."

**VO:**
"In September 1929 the Dow closed at three hundred and eighty-one. It didn't close that high again for twenty-five years."

### Scene 2 · 0:07 – 0:20 · Down

**FRAME:** **Separate by tags** on `market`, on the view 1929-06-01 → 1932-10-01: the upper track holds the summary of September 1929 (the peak and the Babson break), the summary of crash week, The Dow recovers to 294 (1930-04) and The Dow hits bottom: 41.22 (1932-07-08), with the band The Dow, peak to bottom under them; everything else stays below. Beside the phone, a counter falls from "381.17" to "41.22", then a chip: "−89%", and a bracket: "2 years 10 months".

**MOTION:** The market's moments lift into their track; the counter runs down as the band is followed left to right; the chip and bracket tick in last.

**OST:** "Down 89% in under 3 years"

**VO:**
"Put the market on a track of its own. Black Thursday, Black Monday, Black Tuesday, and that was only the start: it kept falling for nearly three years, to forty-one. Eighty-nine percent gone."

---

## ACT 2 · THE WAY BACK (0:20 – 0:38)

### Scene 3 · 0:20 – 0:28 · Twenty-two years up

**FRAME:** Still separated, the phone zooms out to 1926-01-01 → 1958-01-01: in the upper track, the short band The Dow, peak to bottom at the left and the long band The Dow below its 1929 peak running on to The Dow regains its 1929 peak (1954-11). Beside the phone, two bars to the same scale: "Down · 2 yrs 10 mos" and "Back · 22 yrs 4 mos".

**MOTION:** A continuous zoom out; the two bars grow side by side, the second eight times the first.

**OST:** "Then 22 years back up"

**VO:**
"Then the climb back: twenty-two years, through the New Deal, a world war, and into the fifties. November 1954."

### Scene 4 · 0:28 – 0:38 · The footnote

**FRAME:** Rejoined, on the view 1953-01-01 → 1956-01-01 with **View mode** on: The Dow regains its 1929 peak opens in the reader, filling the phone: "1954-11-23 CE", the tag market, the note ("…That counts prices alone: with dividends reinvested and the fall in prices allowed for, an investor at the peak had broken even by about 1936."), its two sources, and "Related to: The Dow below its 1929 peak". A highlight sweeps the sentence about 1936.

**MOTION:** The reader rises over the line; the highlight follows the narration.

**OST:** "Counting dividends: about 1936"

**VO:**
"That's the price alone. Count the dividends, and the fall in prices, and someone who bought at the top was even by about 1936. The timeline's note says so."

---

## ACT 3 · ONE LINE (0:38 – 0:44)

### Scene 5 · 0:38 – 0:44 · The whole Depression

**FRAME:** The reader closes and the phone eases back to the whole line after **Fit all**, then shrinks and lifts; `shortEnd` with "timescale.info/athan/great-depression" as its line, above "Free and open source" and `github.com/openchronology/timeline-app`.

**MOTION:** The zoom out; the end card rises and holds.

**OST:** ""

**VO:**
"The whole Depression is on this timeline, every date with its source. Free, on OpenChronology."

**[END · ~0:44]**

---

## Appendix A · Narration only (for the voice session)

> In September 1929 the Dow closed at three hundred and eighty-one. It didn't close that high again for twenty-five years.
>
> Put the market on a track of its own. Black Thursday, Black Monday, Black Tuesday, and that was only the start: it kept falling for nearly three years, to forty-one. Eighty-nine percent gone.
>
> Then the climb back: twenty-two years, through the New Deal, a world war, and into the fifties. November 1954.
>
> That's the price alone. Count the dividends, and the fall in prices, and someone who bought at the top was even by about 1936. The timeline's note says so.
>
> The whole Depression is on this timeline, every date with its source. Free, on OpenChronology.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                    | Arithmetic                                                                                                | Source                                                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The Dow's closing high, 381.17, on September 3, 1929; first close above it on November 23, 1954 (382.74) | Sep 3, 1929 → Nov 23, 1954 = 9,212 days: 25 years, 2 months, 20 days                                      | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929); `great-depression.mjs`                                                |
| 2     | Black Thursday (Oct 24), Black Monday (Oct 28), Black Tuesday (Oct 29, 1929)                             | —                                                                                                         | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929)                                                                        |
| 2     | The low, 41.22, on July 8, 1932; "nearly three years", "eighty-nine percent"                             | Sep 3, 1929 → Jul 8, 1932 = 1,039 days: 2 years, 10 months, 5 days; (381.17 − 41.22) ÷ 381.17 = 0.892     | As above                                                                                                                                                    |
| 3     | "Twenty-two years" back up, to November 1954                                                             | Jul 8, 1932 → Nov 23, 1954 = 8,173 days: 22 years, 4 months, 15 days; 8,173 ÷ 1,039 = 7.9 ("eight times") | As above                                                                                                                                                    |
| 4     | With dividends and deflation, a buyer at the 1929 peak had broken even by late 1936                      | —                                                                                                         | [Mark Hulbert, "25 Years to Bounce Back? Try 4½"](https://www.historynewsnetwork.org/article/79770) (New York Times, reprinted by the History News Network) |
| 2     | **Separate by tags** puts the tagged events in a track above, on the same time axis                      | —                                                                                                         | [Guide: tags and tracks](../../docs/guide.md#tags-and-tracks)                                                                                               |
| 4     | On phones the reader fills the screen                                                                    | —                                                                                                         | [Guide: reading a timeline](../../docs/guide.md#reading-a-timeline)                                                                                         |
| 5     | Every moment carries its sources; the app is free                                                        | —                                                                                                         | `great-depression.mjs`; [Licensing](../../docs/licensing.md)                                                                                                |

## Appendix C · Posting

- **Title (Shorts):** The Dow took 25 years to get back to 1929. Sort of.
- **Caption:** Peak: September 3, 1929. Bottom: July 8, 1932, down 89%. Back above the peak: November 23, 1954. But that's the price alone: count dividends and falling prices and a buyer at the top was even by about 1936. The whole Great Depression on one timeline, every date sourced. Free and open source: link in bio. #history #greatdepression #stockmarket #economics #timeline
- **Cover:** frame 0 (the long Dow band and the headline).
- **Pinned comment:** "Closing prices of the Dow Jones Industrial Average; the 'about 1936' is with dividends reinvested and deflation counted (Mark Hulbert, NYT). The timeline: timescale.info/athan/great-depression. Made with OpenChronology, free and open source: github.com/openchronology/timeline-app. The full tour is on our channel."
