# OpenChronology — Tour: Keeping a Canon (Middle-earth). Script and Storyboard

**Runtime:** ~1:45 (the scratch narration's cut) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Lore** look (deep forest green, gold) · **Aspect:** 16:9
**Audience:** people developing or maintaining a canon: authors of long series and shared worlds, lore keepers for games, editors of fan wikis and chronologies. They already know a famous canon; what they want is a way to keep their own consistent across books, Ages and calendars, with every date's source and certainty on record.
**Purpose:** take the best-known invented chronology there is, Tolkien's, from the Years of the Trees to the Fourth Age, and show the tools a canon needs: a calendar of your own in code, ages as headings and bands, a thread followed through thousands of years, the source and certainty of every date, a second calendar kept beside the first, and which book says what.

**How it differs:** it sits between the original story (Video 6) and deep time (Video 8). Video 6 shows a world being written; this one shows a vast, finished canon being kept. It speaks to continuity and provenance, not to plot.

**Production notes:**

- Narration is 246 words, about 140 wpm when read. A lore keeper's voice: precise, fond, never reverent.
- **The timeline is the sample `publicity/video/samples/middle-earth.ochx`** (`middle-earth.mjs`): 39 moments and 9 durations, tagged by the book that tells them (`the silmarillion`, `the hobbit`, `the lord of the rings`) and by people, with a `the one ring` thread linked from its forging to its destruction. A custom time display prints each Age's reckoning ("F.A. 510", "S.A. 3441", "T.A. 3019", "Fo.A. 120"); First Age events carry a **Dating context** note; the War of the Ring's events keep their Shire Reckoning dates with **Historical dates**.
- **Accuracy and rights guardrails:**
  - Years are the published chronologies' (Appendix B of _The Lord of the Rings_ for the Second and Third Ages; for the First Age, Tolkien's later annals, as _The Silmarillion_ gives few years). Say "about" where Appendix B does ("c. 1600").
  - It's an **unofficial fan chronology**: notes are short summaries in our own words; no quotations, maps, artwork or film imagery; no logos. The end card says "Not affiliated with or endorsed by the Tolkien Estate".
  - The First Age's length (taken as 590 years) and the Years of the Trees are placeholders, and the timeline says so; don't present them as settled.

---

## ACT 1 · A CANON IN AGES (0:00 – 0:46)

### Scene 1 · 0:00 – 0:22 · Thousands of years, many books

**FRAME:** The browser frame with the whole sample after **Fit all**: the Years of the Trees, then the First, Second, Third and Fourth Ages as bands, summaries crowding in each Age, arcs above. To the left, three book chips light in turn: "The Silmarillion", "The Hobbit", "The Lord of the Rings".

**MOTION:** The frame rises; the Age bands light left to right; the book chips tick in.

**OST:** "Seven thousand years. Many books."

**VO:**
"A canon outgrows any one book. Tolkien's runs from the Years of the Trees to the Fourth Age, across The Silmarillion, The Hobbit and The Lord of the Rings. Here it is on one timeline: each Age a band, each event tagged with the book that tells it."

### Scene 2 · 0:22 – 0:46 · Its own calendar

**FRAME:** The capture zooms into the Second Age; the ruler reads "S.A. 410 … S.A. 3410". Beside the frame, a code panel shows the custom display's first lines (`function print(time: Rational, api: TimeAPI): string {` … `"S.A. "` … `"T.A. "`), and an arrow from it to the ruler.

**MOTION:** The zoom settles; the code panel slides in; the arrow draws to a ruler label.

**OST:** "Your reckoning, in code."

**VO:**
"Its years aren't ours, so the timeline counts its own. A few lines of display code print each Age's reckoning, the Second Age, then the Third, and read them back when you type a date. Your world's calendar can be written the same way."

---

## ACT 2 · KEEPING IT STRAIGHT (0:46 – 1:40)

### Scene 3 · 0:46 – 1:10 · One thread through two Ages

**FRAME:** **Separate by tags** with "the one ring": a track rises above the rest holding the forging, Isildur taking it, its loss, Déagol, Bilbo, the farewell party, Frodo leaving Bag End and its destruction. Beside the frame, the thread is listed step by step, each step joined to the next.

**MOTION:** The tagged moments lift into the track; the list's links light left to right along the thread.

**OST:** "One thread, two Ages."

**VO:**
"Follow one thread through all of it. Separate by tags, choose the One Ring, and its whole history rises into a track of its own: forged in the Second Age, lost for two and a half thousand years, found, and carried to its end. Each step is linked to the next."

### Scene 4 · 1:10 – 1:40 · Every date's source, and its certainty

**FRAME:** With **View mode** on, "The fall of Gondolin" opens in the reader: its tags (`the silmarillion`, `elves`), and the **Date precision** line from **Dating context**: "Year from the later annals; The Silmarillion itself gives few years." Then "The One Ring forged" opens: "About this year ("c. 1600")."

**MOTION:** The reader slides in; the dating line highlights; the reader cross-fades to the second moment.

**OST:** "Record where each date comes from."

**VO:**
"A canon is only as good as its sources. Each event here records which book tells it and how sure its date is. The fall of Gondolin's year comes from later annals, not The Silmarillion itself. The One Ring's forging is about sixteen hundred. Disagreements stay visible instead of being smoothed over."

---

## ACT 3 · DOWN TO THE DAY (1:40 – 2:00)

### Scene 5 · 1:40 – 1:58 · Two calendars at once

**FRAME:** The capture zooms from the Third Age into the War of the Ring: Frodo leaves Bag End, the Council of Elrond, the Fellowship sets out, Gandalf falls, the Pelennor, the Ring destroyed, Aragorn crowned, the Quest's band beneath. "The Ring is destroyed" opens in the reader: "T.A. 3019" and, with **Historical dates**, "S.R. 1419, 25 Rethe · Shire Reckoning".

**MOTION:** A continuous zoom; the reader opens; the Shire date highlights.

**OST:** "Keep every calendar a source uses."

**VO:**
"Zoom from millennia down to single days. The war that ends the Third Age fills just over a year, and each day keeps the calendar the hobbits used, the Shire Reckoning, beside the Age's own."

### Scene 6 · 1:58 – 2:10 · Keep your canon

**FRAME:** The whole timeline again, small. End card: "Keep your canon", the ◷ wordmark, "github.com/openchronology/timeline-app", and in small type: "An unofficial fan chronology. Not affiliated with or endorsed by the Tolkien Estate."

**MOTION:** The frame shrinks; the end card rises and holds.

**OST:** "Keep your canon."

**VO:**
"Whatever world you're keeping, keep its canon in one place, with every date's source beside it."

**[END · ~1:45]**

---

## Appendix A · Narration only (for the voice session)

> A canon outgrows any one book. Tolkien's runs from the Years of the Trees to the Fourth Age, across The Silmarillion, The Hobbit and The Lord of the Rings. Here it is on one timeline: each Age a band, each event tagged with the book that tells it.
>
> Its years aren't ours, so the timeline counts its own. A few lines of display code print each Age's reckoning, the Second Age, then the Third, and read them back when you type a date. Your world's calendar can be written the same way.
>
> Follow one thread through all of it. Separate by tags, choose the One Ring, and its whole history rises into a track of its own: forged in the Second Age, lost for two and a half thousand years, found, and carried to its end. Each step is linked to the next.
>
> A canon is only as good as its sources. Each event here records which book tells it and how sure its date is. The fall of Gondolin's year comes from later annals, not The Silmarillion itself. The One Ring's forging is about sixteen hundred. Disagreements stay visible instead of being smoothed over.
>
> Zoom from millennia down to single days. The war that ends the Third Age fills just over a year, and each day keeps the calendar the hobbits used, the Shire Reckoning, beside the Age's own.
>
> Whatever world you're keeping, keep its canon in one place, with every date's source beside it.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                           | Source                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | The Ages and the books                                                                                          | _The Silmarillion_; _The Hobbit_; _The Lord of the Rings_, Appendix B ("The Tale of Years")                                |
| 2     | A custom display prints and parses each Age's reckoning                                                         | [Time presentation: custom code](../docs/time-presentation.md#custom-javascript-and-typescript-subset); `middle-earth.mjs` |
| 3     | The Ring: forged c. S.A. 1600; taken S.A. 3441; lost T.A. 2; found c. 2463 and 2941; party 3001; destroyed 3019 | Appendix B                                                                                                                 |
| 3     | "Lost for two and a half thousand years": T.A. 2 to c. 2463                                                     | Appendix B                                                                                                                 |
| 4     | First Age years from the later annals; _The Silmarillion_ gives few                                             | The published text's chronology; the annals in _The History of Middle-earth_                                               |
| 4     | **Dating context** records a date's precision and convention                                                    | [Plugins: dating and historical annotations](../docs/plugins.md#dating-and-historical-annotations)                         |
| 5     | The War of the Ring's dates (T.A. 3018–3019); S.R. = T.A. − 1600; 25 Rethe = 25 March                           | Appendix B; Appendix D (the Shire Calendar)                                                                                |
| 5     | **Historical dates** keeps a source's date and calendar beside the display                                      | [Plugins: dating and historical annotations](../docs/plugins.md#dating-and-historical-annotations)                         |

## Appendix C · Questions this audience is likely to ask

1. **Can I keep several calendars, not just annotate them?** One display at a time, but **Time display** can be changed at any moment without moving anything, and **Compare** puts two timelines on one axis.
2. **Can my calendar have months and weekdays?** The custom display language has exact arithmetic, comparisons and string helpers; a full calendar is possible but takes more code than an Age prefix.
3. **What if two sources disagree on a year?** Put it where you decide, and record the other in its **Dating context** or notes, or keep both as linked moments.
4. **Can a fan project publish a chronology like this?** That's a question for the rights holders and fair use where you are; keep summaries in your own words and say it's unofficial.
