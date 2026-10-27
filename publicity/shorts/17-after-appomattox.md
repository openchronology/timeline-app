# OpenChronology — Short 17: The War Didn't End at Appomattox. Script and Storyboard

**Runtime:** ~0:50 · **Shape:** the zoom · **Look:** Archive · **Aspect:** 9:16
**For:** history and "did you know" feeds: curious newcomers and students who learned that the Civil War ended at Appomattox. They stop for a date they thought they knew, corrected by a number.
**Purpose:** one fact the timeline makes visible: separate the surrenders and they trail on for seven months after Lee's, past Juneteenth, to a ship in Liverpool. The app, on a phone, shows the gap as a band.
**Points to:** Video 20, the Civil War tour.

**Production notes:**

- About 120 words, read briskly. The voice is surprised, not a lecturer's.
- **The timeline is the sample `publicity/video/samples/civil-war.ochx`**, captured narrow so the app is readable on a phone: 360 × 640 CSS pixels at scale 3, with **Group within** lowered to 12 px by an `eval` in each shot's `setup` (`density` set to 12 and an `input` event dispatched), then cropped close to the timeline (the toolbar and the separation bar cropped away except where a scene names them) and shown in `phoneShot`.
- Separated shots add `{ do: "separate", tags: ["surrender"] }` to `setup`. The reader in Scene 4 is opened unseparated, with **View mode** and `open` both under `actions`, from a view that starts in 1864 (1864-12-20 → 1865-12-20), so the reader shows the moment's full date.
- **Accuracy guardrails:** "seven months" is 211 days (April 9 to November 6, 1865); "the last surrender" is the CSS Shenandoah's, the last Confederate force to surrender; Stand Watie's was the last by a general on land. Say "a timeline we built", never "the history".

---

## ACT 1 · THE SURRENDERS (0:00 – 0:40)

### Scene 1 · 0:00 – 0:06 · The date you know

**FRAME:** The phone, large in the frame, showing late March – early May 1865 on the timeline: Richmond falls, Lee surrenders at Appomattox (04-09), The stacking of arms, Johnston surrenders at Bennett Place, the bands beneath. Already whole at frame 0. A callout beside the phone in the look's serif: "April 9, 1865".

**MOTION:** None to start: the frame is the cover. The callout pulses once as "Appomattox" is said.

**OST:** "The Civil War didn't end at Appomattox"

**VO:**
"Lee surrendered at Appomattox in April 1865. The Civil War's last surrender came seven months later."

### Scene 2 · 0:06 – 0:16 · They keep coming

**FRAME:** The phone widens to March – December 1865 with **Separate by tags** "surrender": the upper track holds Lee's surrender, Johnston surrenders at Bennett Place (04-26), Taylor surrenders at Citronelle (05-04), Kirby Smith surrenders at Galveston (06-02), and the band After Appomattox: the last surrenders running far to the right. The "Separated by tags · surrender" bar shows above the crop for the first second.

**MOTION:** The surrender moments lift into their track; each lights as it's named.

**OST:** "They kept coming"

**VO:**
"Separate the surrenders on a timeline and they keep coming. Johnston, in North Carolina, in April. Taylor in May. Kirby Smith, in Texas, in June."

### Scene 3 · 0:16 – 0:26 · Juneteenth

**FRAME:** The zoom narrows to late May – early July 1865, still separated: Kirby Smith surrenders at Galveston (06-02), Juneteenth (06-19), Stand Watie surrenders (06-23). Callouts: "June 19" and "June 23".

**MOTION:** A smooth zoom; each callout draws in as its date is said.

**OST:** "June 19: freedom reaches Texas"

**VO:**
"June nineteenth: at Galveston, an order tells Texas that all slaves are free. That's Juneteenth. Four days later, Stand Watie, a Cherokee general, gives up his command."

### Scene 4 · 0:26 – 0:40 · A ship in Liverpool

**FRAME:** The zoom pans right across an empty summer and autumn to November 1865: CSS Shenandoah surrenders at Liverpool (11-06), alone. Then, unseparated, the moment opens in the reader, which fills the phone: its date, 1865-11-06, the tags surrender and navy, the notes on Captain James Waddell, its Sources, and "Related to": Lee surrenders at Appomattox.

**MOTION:** A long pan with nothing in it, then the reader slides up.

**OST:** "Nov 6, 1865: the last surrender"

**VO:**
"Then nothing, until November sixth, in Liverpool, England. The raider Shenandoah had been hunting whalers in the Pacific. Its captain learned the war was over in August, and sailed for England to surrender."

---

## ACT 2 · THE POINT (0:40 – 0:50)

### Scene 5 · 0:40 – 0:46 · 211 days

**FRAME:** Back to the separated view of March – December 1865: the band After Appomattox: the last surrenders from Lee's surrender to the Shenandoah's, with a callout across it: "211 days".

**MOTION:** The band is outlined from left to right; the callout counts up to 211.

**OST:** "211 days after Appomattox"

**VO:**
"Two hundred and eleven days after Appomattox. Every date with its source, on one line."

### Scene 6 · 0:46 – 0:50 · The end

**FRAME:** The phone shrinks and lifts; `shortEnd` with "timescale.info/athan/us-civil-war" as its line, over "Free and open source" and the repository's address.

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"That's OpenChronology, and it's free."

**[END · ~0:50]**

---

## Appendix A · Narration only (for the voice session)

> Lee surrendered at Appomattox in April 1865. The Civil War's last surrender came seven months later.
>
> Separate the surrenders on a timeline and they keep coming. Johnston, in North Carolina, in April. Taylor in May. Kirby Smith, in Texas, in June.
>
> June nineteenth: at Galveston, an order tells Texas that all slaves are free. That's Juneteenth. Four days later, Stand Watie, a Cherokee general, gives up his command.
>
> Then nothing, until November sixth, in Liverpool, England. The raider Shenandoah had been hunting whalers in the Pacific. Its captain learned the war was over in August, and sailed for England to surrender.
>
> Two hundred and eleven days after Appomattox. Every date with its source, on one line.
>
> That's OpenChronology, and it's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                               | Source                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Lee surrendered at Appomattox on 1865-04-09                                                                         | [Appomattox Court House](https://en.wikipedia.org/wiki/Battle_of_Appomattox_Court_House); [NPS](https://www.nps.gov/apco/index.htm)                                                                                   |
| 1, 5  | The last surrender, CSS Shenandoah, 1865-11-06: 211 days later ("seven months")                                     | [Conclusion of the war](https://en.wikipedia.org/wiki/Conclusion_of_the_American_Civil_War); the two dates                                                                                                            |
| 2     | Johnston at Bennett Place, North Carolina, 04-26; Taylor at Citronelle, 05-04; Kirby Smith, 06-02                   | [Bennett Place](https://en.wikipedia.org/wiki/Bennett_Place); [Richard Taylor](<https://en.wikipedia.org/wiki/Richard_Taylor_(Confederate_general)>); [Kirby Smith](https://en.wikipedia.org/wiki/Edmund_Kirby_Smith) |
| 3     | General Order No. 3 at Galveston, 06-19: "all slaves are free"; Stand Watie, Cherokee, 06-23                        | [National Archives: Juneteenth](https://www.archives.gov/news/articles/juneteenth-original-document); [Stand Watie](https://en.wikipedia.org/wiki/Stand_Watie)                                                        |
| 4     | Shenandoah raided whalers in the Pacific; Waddell learned of the war's end in August 1865; surrendered at Liverpool | [CSS Shenandoah](https://en.wikipedia.org/wiki/CSS_Shenandoah)                                                                                                                                                        |
| 5     | Times are exact; the app is free                                                                                    | [Guide: exact times](../../docs/guide.md#exact-times); [Licensing](../../docs/licensing.md)                                                                                                                           |

## Appendix C · Posting

- **Title (Shorts):** The Civil War didn't end at Appomattox
- **Caption:** Lee surrendered in April 1865. The last Confederate surrender came 211 days later, in Liverpool. Every surrender on one timeline, with its source. Free and open source: link in bio. #history #civilwar #juneteenth #ushistory #timeline
- **Cover:** frame 0 (April 1865 and the headline).
- **Pinned comment:** "The timeline is timescale.info/athan/us-civil-war, and the app is OpenChronology, free and open source: github.com/openchronology/timeline-app. The full tour of this timeline is on our channel."
