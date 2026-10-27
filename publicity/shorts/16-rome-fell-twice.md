# OpenChronology — Short 16: Rome Fell Twice, 977 Years Apart. Script and Storyboard

**Runtime:** ~0:44 · **Shape:** the zoom · **Look:** Archive · **Aspect:** 9:16
**For:** history and "did you know" feeds: curious newcomers and students. They know Rome "fell" in 476; what stops them is finding out that half of it went on, as Rome, for nearly a thousand years more, with a number they can repeat.
**Purpose:** one fact that only a line at true scale makes obvious, shown on a phone: the Western Empire's band stops in 476, a stub beside the Eastern Empire's band, which runs on to 1453. The app's one idea (any span, one exact line) is felt rather than explained.
**Points to:** Video 19, the ancient Rome tour.

**Production notes:**

- About 117 words, read briskly (about 170 wpm). The voice is delighted, not a lecturer's.
- **The timeline is the sample `publicity/video/samples/rome.ochx`**, shown in `phoneShot`. Views are given in years CE/BCE; in `shots.json` they are stored seconds (Gregorian display).
- **Capture it narrow so the app is readable:** `"size": [360, 640], "scale": 3` (1080 × 1920), cropped close to the timeline and the reader in `phoneShot`. Each shot lowers **Group within** to 12 px with an `eval` in its `setup` (`const d = document.getElementById('density'); d.value = '12'; d.dispatchEvent(new Event('input', { bubbles: true }))`), so more moments draw apart at phone width. Every `open` goes under the shot's `actions`, never `setup`, and is made unseparated from a view that starts in an earlier year than the moment (so the reader shows its year).
- **The brackets and the "977 years" readout are drawn by the infographic layer** beside the phone, never over the app's own text, and never pointed at a ruler label (BCE ruler marks read "1 BCE"-style, issue #340).
- **Accuracy guardrails:** 476 is the _traditional_ end of the Western Empire (Romulus Augustulus deposed by Odoacer, 4 September 476). Constantinople fell on 29 May 1453 (Julian; the reader shows "1453-06 CE" because the line is Gregorian, and keeps 29 May under **Historical dates**). 1453 − 476 = 977 years; the Western Empire as a separate half lasted 81 years (395–476). The eastern empire's people called themselves Romans throughout; "Byzantine" is a modern name. Say "Rome fell twice" as a hook, and "the half in the West" in the narration, so the claim stays exact.

---

## ACT 1 · THE FACT (0:00 – 0:34)

### Scene 1 · 0:00 – 0:05 · The hook

**FRAME:** The phone, large in the frame, showing the sample from 360 to 1480 CE: at the left the navy Western Roman Empire band, a short stub ending at 476; beneath and beside it the purple "Eastern Roman (Byzantine) Empire" band running nearly the width of the screen to "Fall of Constantinople · 1453 CE", with "Crusaders sack Constantinople · 1204 CE" below it. Above it, the headline, already whole at frame 0.

**MOTION:** None to start: the frame is the cover. The zoom begins as the sentence ends.

**OST:** "Rome fell in 476. Then it fell again in 1453."

**VO:**
"Rome fell in 476. Then it fell again, nine hundred and seventy-seven years later."

### Scene 2 · 0:05 – 0:13 · The split

**FRAME:** The zoom runs in to November 394 – March 395 CE: Theodosius I's ochre band ending, the late empire's navy band running across, the chapter heading "The fall of the West", and "Theodosius dies; the empire … · 0395-01-18 CE", where two bands begin together: "Eastern Roman (Byzantine) Empire" and "Western Roman Empire". A callout beside the phone in the look's serif: "395: two halves".

**MOTION:** A continuous zoom (log speed), easing to a stop on the two new bands; the callout draws in on "split".

**OST:** "395: one empire, two halves"

**VO:**
"In 395 the emperor Theodosius dies, and his sons split the empire: a western half ruled from Italy, an eastern half from Constantinople."

### Scene 3 · 0:13 – 0:22 · The West ends

**FRAME:** The zoom pulls back and runs to 470–480 CE: the Western Roman Empire's band and the late empire's stop at "Romulus Augustulus deposed · 476-09 CE"; the purple band runs on past the screen's edge. With **View mode** on, the moment opens in the reader, filling the phone: "476-09 CE", the tag `ruler`, the notes (Odoacer deposes the boy emperor and sends the regalia to Constantinople), **Date precision**, **Original historical date** "4 September 476 CE", and "Related to: Western Roman Empire · 395-01 CE → 476-09 CE". A small readout beside the phone: "West: 81 years".

**MOTION:** A zoom; the reader slides up; the readout ticks in on "eighty-one".

**OST:** "476: the last emperor in the West"

**VO:**
"The West lasts eighty-one years. In 476 a general named Odoacer deposes its last emperor, a boy called Romulus Augustulus. That's the date in the textbooks."

### Scene 4 · 0:22 – 0:34 · The East goes on

**FRAME:** The reader closes; the zoom pulls back out to 360–1480 CE and pans along the purple band, past "Crusaders sack Constantinople · 1204 CE", then in to 1440–1460 CE, where it ends at "Fall of Constantinople · 1453-06 CE". The moment opens in the reader: the notes (Mehmed II, a 53-day siege, Constantine XI dies in the fighting), **Original historical date** "29 May 1453 CE", **Original calendar** "Julian", "Related to: Constantinople dedicated · 330-05 CE". Beside the phone, a readout counts up as the view travels: "100 years", "500 years", "977 years".

**MOTION:** One continuous move: out, along, and in (log speed); the readout ticks with it; the reader slides up at the end.

**OST:** "The East: 977 more years"

**VO:**
"But the eastern half doesn't fall. It goes on calling itself the Roman Empire for nearly a thousand years, until the Ottomans take Constantinople on the twenty-ninth of May, 1453."

---

## ACT 2 · THE POINT (0:34 – 0:44)

### Scene 5 · 0:34 – 0:40 · One line

**FRAME:** The phone again, zoomed right out to 800 BCE – 1480 CE: Rome's kings, Republic and Principate crowd the left of the line in summaries and bands; the purple band carries it to 1453. Under the phone, two brackets drawn to the line's scale: "753 BCE → 476: 1,228 years" and "476 → 1453: 977 years".

**MOTION:** A slow zoom out; the brackets draw left to right.

**OST:** "2,200 years of Rome, one line"

**VO:**
"From Romulus to the last Constantine: twenty-two centuries of Rome, on one line you can zoom."

### Scene 6 · 0:40 – 0:44 · The end

**FRAME:** The phone shrinks and lifts; `shortEnd` with "Any span of time, one line", "timescale.info/athan/rome" and the repository's address.

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"That's OpenChronology, and it's free."

**[END · ~0:44]**

---

## Appendix A · Narration only (for the voice session)

> Rome fell in 476. Then it fell again, nine hundred and seventy-seven years later.
>
> In 395 the emperor Theodosius dies, and his sons split the empire: a western half ruled from Italy, an eastern half from Constantinople.
>
> The West lasts eighty-one years. In 476 a general named Odoacer deposes its last emperor, a boy called Romulus Augustulus. That's the date in the textbooks.
>
> But the eastern half doesn't fall. It goes on calling itself the Roman Empire for nearly a thousand years, until the Ottomans take Constantinople on the twenty-ninth of May, 1453.
>
> From Romulus to the last Constantine: twenty-two centuries of Rome, on one line you can zoom.
>
> That's OpenChronology, and it's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                            | Source                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 4  | 476 to 1453 is 977 years                                                                                                                         | The dates below; our arithmetic                                                                                                                                            |
| 2     | Theodosius I died 17 January 395; his sons Arcadius (East, Constantinople) and Honorius (West) divided the empire                                | [Theodosius I](https://en.wikipedia.org/wiki/Theodosius_I); [Western Roman Empire](https://en.wikipedia.org/wiki/Western_Roman_Empire)                                     |
| 3     | The Western Empire as a separate half, 395–476: 81 years. Odoacer deposed Romulus Augustulus on 4 September 476, the traditional end of the West | [Romulus Augustulus](https://en.wikipedia.org/wiki/Romulus_Augustulus); [Fall of the Western Roman Empire](https://en.wikipedia.org/wiki/Fall_of_the_Western_Roman_Empire) |
| 4     | The Eastern Empire called itself Roman ("Byzantine" is a modern name); Mehmed II took Constantinople on 29 May 1453 (Julian)                     | [Byzantine Empire](https://en.wikipedia.org/wiki/Byzantine_Empire); [Fall of Constantinople](https://en.wikipedia.org/wiki/Fall_of_Constantinople)                         |
| 4     | The reader keeps the source's date and calendar under **Historical dates**                                                                       | [Plugins: dating and historical annotations](../../docs/plugins.md#dating-and-historical-annotations)                                                                      |
| 5     | Founding by tradition 753 BCE (Romulus) to 476 CE: 753 + 476 − 1 = 1,228 years; to 1453: 2,205 years ("twenty-two centuries"); no year 0         | [Founding of Rome](https://en.wikipedia.org/wiki/Founding_of_Rome); our arithmetic                                                                                         |
| 5     | The last eastern emperor was Constantine XI                                                                                                      | [Fall of Constantinople](https://en.wikipedia.org/wiki/Fall_of_Constantinople)                                                                                             |
| 6     | The app is free                                                                                                                                  | [Licensing](../../docs/licensing.md)                                                                                                                                       |

## Appendix C · Posting

- **Title (Shorts):** Rome fell twice, 977 years apart
- **Caption:** Rome "fell" in 476, but only in the West. The eastern half, ruled from Constantinople, called itself the Roman Empire until 1453. Ancient Rome on one line you can zoom. Free and open source: link in bio. #history #ancientrome #rome #byzantine #historytok
- **Cover:** frame 0 (the two bands, the West's stub and the East's long band, and the headline).
- **Pinned comment:** "Dates: the empire divided at Theodosius's death in 395; the last western emperor deposed 4 September 476 (the traditional end of the West); Constantinople taken 29 May 1453 (Julian calendar). The app is OpenChronology, free and open source: github.com/openchronology/timeline-app. The full tour of this timeline is on our channel."
