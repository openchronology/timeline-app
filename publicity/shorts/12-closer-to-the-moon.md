# OpenChronology — Short 12: Cleopatra Lived Closer to the Moon Landing. Script and Storyboard

**Runtime:** ~0:42 · **Shape:** the zoom · **Look:** Archive · **Aspect:** 9:16
**For:** history and "did you know" feeds: curious newcomers and students. They half-know that the pyramids are old and Cleopatra is ancient; what stops them is finding out how far apart those two are, with a number they can repeat.
**Purpose:** one fact that only a line at true scale makes obvious, shown on a phone: from the Great Pyramid to Cleopatra, then on to 1969, so the app's one idea (any span, one exact line) is felt rather than explained.
**Points to:** Video 15, the ancient Egypt tour.

**Production notes:**

- About 115 words, read briskly (about 170 wpm). The voice is delighted, not a lecturer's.
- **The timeline is the sample `publicity/video/samples/egypt.ochx`**, captured at phone size (480 × 640, scale 2.25) and shown in `phoneShot`. Views are given in years BCE/CE; in `shots.json` they are stored seconds (Gregorian display).
- **Apollo 11 isn't in this sample.** In Scene 4 the line runs on, empty, past 30 BCE to the ruler's "2000 CE"; the "1969" pin and the two brackets are drawn by the infographic layer beside the phone, never over the app's own text.
- **Accuracy guardrails:** the pyramid's date is an estimate: about 2566 BCE in the chronology the timeline uses (Shaw, _Oxford History of Ancient Egypt_), often given as c. 2560 BCE. Say "about" and "over 2,500 years"; the claim holds for any mainstream date for Khufu (Appendix B). Cleopatra died in 30 BCE; there is no year zero, so 30 BCE to 1969 CE is 1,998 years.

---

## ACT 1 · THE FACT (0:00 – 0:30)

### Scene 1 · 0:00 – 0:05 · The hook

**FRAME:** The phone, large in the frame, showing the sample from 2700 BCE to 2010 CE: Egypt's periods and summaries crowd the left half of the line; the right half runs on, empty, to "1000 CE" and "2000 CE" on the ruler. Above it, the headline, already whole at frame 0.

**MOTION:** None to start: the frame is the cover. The zoom begins as the sentence ends.

**OST:** "Cleopatra lived closer to the Moon landing than to the Great Pyramid"

**VO:**
"Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid."

### Scene 2 · 0:05 – 0:13 · The pyramid

**FRAME:** The zoom runs into the Old Kingdom and settles on Khufu's reign (about 2592–2558 BCE): the Old Kingdom and 4th Dynasty bands, Khufu's ochre band, "Diary of Merer" and "Great Pyramid of Giza · 2566 BCE". A callout beside the phone in the look's serif: "about 2566 BCE".

**MOTION:** A continuous zoom (log speed), easing to a stop; the callout draws in on "finished".

**OST:** "The Great Pyramid: about 2566 BCE"

**VO:**
"Here's the Great Pyramid, finished for King Khufu around 2566 BCE. Ancient dates are estimates, but not by that much."

### Scene 3 · 0:13 – 0:22 · Two and a half thousand years of pharaohs

**FRAME:** The zoom pulls back and pans right across the whole of Egypt's history: the Middle Kingdom, the New Kingdom, the Late Period, then in to Cleopatra VII's band and, at its end, "Death of Cleopatra · 30-08-10 BCE". A small span readout beside the phone counts up: "500 years", "1,000 years", "2,000 years", "2,536 years".

**MOTION:** One continuous move: out, across, and in; the readout ticks as the view passes the periods.

**OST:** "2,500+ years later: Cleopatra, 30 BCE"

**VO:**
"Now go forward. The Middle Kingdom, Ramesses, the Persians, Alexander, the Ptolemies. Over two and a half thousand years later, Cleopatra dies, in 30 BCE."

### Scene 4 · 0:22 – 0:30 · And on to the Moon

**FRAME:** The zoom pulls back out to Scene 1's view, 2700 BCE to 2010 CE, and holds. Under the phone, two brackets drawn to the line's scale: "Pyramid → Cleopatra: ~2,540 years" (left, longer) and "Cleopatra → Moon: 1,998 years" (right, shorter); a small pin over the ruler at 1969: "Apollo 11, 1969".

**MOTION:** The zoom eases out; the first bracket draws, then the second, visibly shorter; the pin drops.

**OST:** "~2,540 years vs. 1,998"

**VO:**
"Keep the same scale and go on to 1969. Cleopatra to the Moon: under two thousand years. She was closer to us."

---

## ACT 2 · THE POINT (0:30 – 0:42)

### Scene 5 · 0:30 – 0:38 · One line

**FRAME:** The phone again, the zoom running back into Egypt's three thousand years: bands for periods, dynasties and reigns, summaries splitting into named moments as it goes.

**MOTION:** A slow zoom in.

**OST:** "Every pharaoh, one line"

**VO:**
"Every period, dynasty and pharaoh, on one line you can zoom, from three thousand BCE to the day she died."

### Scene 6 · 0:38 – 0:42 · The end

**FRAME:** The phone shrinks and lifts; `shortEnd` with "Any span of time, one line", "timescale.info/athan/ancient-egypt" and the repository's address.

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"That's OpenChronology, and it's free."

**[END · ~0:42]**

---

## Appendix A · Narration only (for the voice session)

> Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.
>
> Here's the Great Pyramid, finished for King Khufu around 2566 BCE. Ancient dates are estimates, but not by that much.
>
> Now go forward. The Middle Kingdom, Ramesses, the Persians, Alexander, the Ptolemies. Over two and a half thousand years later, Cleopatra dies, in 30 BCE.
>
> Keep the same scale and go on to 1969. Cleopatra to the Moon: under two thousand years. She was closer to us.
>
> Every period, dynasty and pharaoh, on one line you can zoom, from three thousand BCE to the day she died.
>
> That's OpenChronology, and it's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                                                                   | Source                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2     | The Great Pyramid finished by the end of Khufu's reign, 2589–2566 BCE in Shaw's chronology; often given as c. 2560 BCE                                                                                                  | [Great Pyramid of Giza](https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza); Shaw (ed.), _The Oxford History of Ancient Egypt_ (2000); `egypt.mjs` |
| 3     | Cleopatra VII died in August 30 BCE (10 or 12 August)                                                                                                                                                                   | [Death of Cleopatra](https://en.wikipedia.org/wiki/Death_of_Cleopatra)                                                                              |
| 3, 4  | Pyramid to Cleopatra: 2566 − 30 = 2,536 years (2,530 from c. 2560; 2,559 from Khufu's accession, 2589). "Over two and a half thousand", "~2,540"                                                                        | The dates above; our arithmetic                                                                                                                     |
| 4     | Apollo 11 landed on the Moon on 20 July 1969                                                                                                                                                                            | [Apollo 11](https://en.wikipedia.org/wiki/Apollo_11)                                                                                                |
| 4     | Cleopatra to the Moon: 30 BCE to 1969 CE is 30 + 1969 − 1 = 1,998 years (there is no year 0). Under 2,000, so the claim holds for any pyramid date before 2028 BCE; every chronology puts Khufu in the 26th century BCE | Our arithmetic                                                                                                                                      |
| 5     | The sample spans the periods, dynasties and major reigns from about 3000 BCE (Narmer) to 30 BCE, on one zoomable line; times are exact                                                                                  | `egypt.mjs`; [Guide: exact times](../../docs/guide.md#exact-times)                                                                                  |
| 6     | The app is free                                                                                                                                                                                                         | [Licensing](../../docs/licensing.md)                                                                                                                |

## Appendix C · Posting

- **Title (Shorts):** Cleopatra lived closer to the Moon landing than to the Great Pyramid
- **Caption:** The Great Pyramid was already over 2,500 years old when Cleopatra died. The Moon landing came under 2,000 years after her. Ancient Egypt on one line you can zoom. Free and open source: link in bio. #history #ancientegypt #cleopatra #pyramids #historytok
- **Cover:** frame 0 (the whole line to 2010 CE and the headline).
- **Pinned comment:** "Dates: the Great Pyramid about 2566 BCE (often given as c. 2560), Cleopatra's death 30 BCE, Apollo 11 1969 CE, and no year zero. The app is OpenChronology, free and open source: github.com/openchronology/timeline-app. The full tour of this timeline is on our channel."
