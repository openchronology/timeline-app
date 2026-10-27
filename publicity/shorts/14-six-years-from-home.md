# OpenChronology — Short 14: Six Years Without Going Home. Script and Storyboard

**Runtime:** ~0:40 · **Shape:** the zoom · **Look:** Archive · **Aspect:** 9:16
**For:** history and "did you know" feeds: curious newcomers and students. They know Washington as a face on a dollar; what stops them is a human fact about him with a number in it.
**Purpose:** one gap the timeline makes visible: from May 1775 to September 1781 George Washington never went home to Mount Vernon. Pull out his home's thread on a phone, and the six years sit there as a band, between the day he left and the day he rode back in, on the way to Yorktown.
**Points to:** Video 17, the George Washington tour.

**Production notes:**

- About 105 words, read briskly. The voice is surprised on the viewer's behalf, not a lecturer's.
- **The timeline is the sample `publicity/video/samples/washington.ochx`**, captured at phone size (480 × 640, scale 2.25) and shown in `phoneShot`, with **Separate by tags** on `land` (the tag for his homes, lands and Mount Vernon): its upper track holds "Leaves Mount Vernon for Congress" (4 May 1775), "Home for the first time since 1775" (9 September 1781), and the bands "Mount Vernon" and "Six years away from Mount Vernon".
- Put each `open` under the shot's `actions`, not `setup`. Open the reader from a view at least a year wide, so it prints the full date.
- **Accuracy guardrails:** "six years" is six years and four months (4 May 1775 to 9 September 1781); say "more than six years", never a figure of days. He stayed three nights (he and Rochambeau left on 12 September). He did go home again after Yorktown; the short doesn't say otherwise.

---

## ACT 1 · THE GAP (0:00 – 0:30)

### Scene 1 · 0:00 – 0:04 · The hook

**FRAME:** The phone, large in the frame, showing the whole sample after **Fit all**: 1732 at the left, 1802 at the right, the long green "Mount Vernon" band under the axis. Already whole at frame 0.

**MOTION:** None to start: the frame is the cover. The zoom begins as the sentence ends.

**OST:** "Washington didn't go home for 6 years"

**VO:**
"George Washington didn't go home for more than six years."

### Scene 2 · 0:04 – 0:13 · He leaves

**FRAME:** The zoom runs from the whole life to 1774–1782: the chapter heading "Revolution", the navy band "Commander-in-chief of the Continental Army" and the brick "Revolutionary War" below the axis. A small readout beside the phone: "May 1775".

**MOTION:** A continuous zoom (log speed), easing to a stop on 1774–1782.

**OST:** "Washington didn't go home for 6 years"

**VO:**
"In May 1775 he rode out of Mount Vernon for Congress in Philadelphia. Six weeks later he was commanding an army."

### Scene 3 · 0:13 – 0:30 · The band

**FRAME:** **Separate by tags**, "land" chosen: a track labelled "Tagged land" rises above the rest. In it, Leaves Mount Vernon for Congress at the left, Home for the first time since 1775 at the right, and between them, under the axis, the band "Six years away from Mount Vernon" beneath the "Mount Vernon" band. A bracket beside the phone, over the band: "6 years, 4 months".

**MOTION:** The tagged events lift into their own track; the bracket draws in along the band, left to right.

**OST:** "6 years, 4 months"

**VO:**
"Pull his home out of the rest of his life, and there's the gap. Boston, New York, the Delaware, Valley Forge. Six years and four months, and not one night at home."

---

## ACT 2 · HOME (0:30 – 0:40)

### Scene 4 · 0:30 – 0:36 · On the way to Yorktown

**FRAME:** With **View mode** on, Home for the first time since 1775 opens in the reader, filling the phone's screen: the tags war and land, the note, Sources (the National Park Service and Wikipedia), and "Related to: Leaves Mount Vernon for Congress · 1775-05-04 CE".

**MOTION:** The reader slides up over the timeline; the line "his first visit home since May 1775" is underlined.

**OST:** "September 1781"

**VO:**
"He finally rode in on the march to Yorktown, stayed three nights, and left to win the war."

### Scene 5 · 0:36 – 0:40 · One line

**FRAME:** The phone shrinks and lifts; `shortEnd` with "His whole life, one line · timescale.info/athan/george-washington".

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"His whole life, every date with its source. That's OpenChronology, and it's free."

**[END · ~0:40]**

---

## Appendix A · Narration only (for the voice session)

> George Washington didn't go home for more than six years.
>
> In May 1775 he rode out of Mount Vernon for Congress in Philadelphia. Six weeks later he was commanding an army.
>
> Pull his home out of the rest of his life, and there's the gap. Boston, New York, the Delaware, Valley Forge. Six years and four months, and not one night at home.
>
> He finally rode in on the march to Yorktown, stayed three nights, and left to win the war.
>
> His whole life, every date with its source. That's OpenChronology, and it's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                           | Source                                                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 3  | Away from Mount Vernon 4 May 1775 – 9 September 1781: six years and four months                                 | [George Washington](https://en.wikipedia.org/wiki/George_Washington) (left 4 May 1775); [NPS: Washington and the Trail](https://www.nps.gov/waro/learn/historyculture/george-washington-and-the-trail.htm) |
| 2     | Chosen commander-in-chief 15 June 1775, six weeks after leaving                                                 | [George Washington](https://en.wikipedia.org/wiki/George_Washington); [Continental Army](https://en.wikipedia.org/wiki/Continental_Army)                                                                   |
| 3     | Boston (1775–76), New York (1776), the Delaware (December 1776), Valley Forge (1777–78) all fall inside the gap | `washington.mjs`, each moment's and band's sources                                                                                                                                                         |
| 4     | Reached Mount Vernon 9 September 1781 on the way to Yorktown; left 12 September (three nights)                  | [NPS: Washington and the Trail](https://www.nps.gov/waro/learn/historyculture/george-washington-and-the-trail.htm); [Siege of Yorktown](https://en.wikipedia.org/wiki/Siege_of_Yorktown)                   |
| 3     | Separate by tags moves the chosen tag's events into a track of their own                                        | [Tags](../../docs/tags.md#separating-by-tags)                                                                                                                                                              |
| 5     | Every moment has its sources; the app is free                                                                   | [Plugins: Sources](../../docs/plugins.md); [Licensing](../../docs/licensing.md)                                                                                                                            |

## Appendix C · Posting

- **Title (Shorts):** Washington didn't go home for six years
- **Caption:** From May 1775 to September 1781, George Washington never went home to Mount Vernon. Here's the gap, on a timeline of his whole life. Free and open source: link in bio. #history #georgewashington #ushistory #americanrevolution #timeline
- **Cover:** frame 0 (the whole timeline and the headline).
- **Pinned comment:** "The app is OpenChronology, free and open source: github.com/openchronology/timeline-app. This timeline is at timescale.info/athan/george-washington, and the full tour of it is on our channel."
