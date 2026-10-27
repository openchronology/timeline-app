# OpenChronology — Tour: Ancient Egypt, from Narmer to Cleopatra. Script and Storyboard

**Runtime:** ~3:40 (at 140 wpm, with pauses) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and teachers of ancient history, and anyone who has tried to hold three thousand years of pharaohs in their head. Teachers will judge it as classroom material, so it must be accurate and calm, and honest about how uncertain ancient dates are.
**Purpose:** show an ancient-history timeline the way a class would use it: the whole sweep, periods, dynasties and reigns as bands, the pyramid age up close, a moment read with its sources and its dating, the empire of the New Kingdom, one thread (the writings we know Egypt from) pulled out of the rest, a date kept in its own calendar, the end of the Ptolemies to the day, and the one fact the whole line makes visible: Cleopatra lived closer to the Moon landing than to the building of the Great Pyramid.

**How it differs:** Video 5 tours modern history, where every date is known to the day. This one tours antiquity, where most dates are estimates, so it shows how a timeline says what it knows: one named chronology for everything, a **Date precision** line on every moment, and **Historical dates** for the few days a source gives in its own calendar. The subject still leads, and each control is named once, by what it does for the history.

**Production notes:**

- Narration is 475 words, about 140 wpm when read, in the voice of a good history teacher: curious, unhurried, never breathless. It runs a little long for a tour, as agreed; Scenes 6 and 9 are the ones to trim if it must be shorter.
- **The timeline is the sample `publicity/video/samples/egypt.ochx`**, built from `egypt.mjs`: 92 moments (10 of them chapter headings), 81 durations (10 periods, 4 Predynastic cultures, 31 dynasties or dynasty groups, 33 reigns, the Amarna letters, Abu Simbel's building and the Alexandrian war), 57 relationships, Wikipedia sources on every moment, the Timeline theme in archive colours. Bands are coloured by kind: navy for periods, grey for dynasties and cultures, ochre for reigns, brick for Cleopatra and her war, green for the Amarna letters and Abu Simbel. Tags: `chapter`, `period`, `dynasty`, `ruler`, `monument`, `war`, `writing`, `diplomacy`, `science`.
- **Shots** are captured from the real editor in full screen with `common/capture.mjs` (`shots.json` in the video's folder, when it is made) and shown in a browser frame; the infographic layer adds titles, chips and arrows around the frame, never over the app's own text. The views below are given in years BCE; in `shots.json` they are stored seconds (Gregorian display, seconds from 1970; 1 January of a year _N_ BCE is astronomical year 1 − _N_).
- **Scene 11's last frame** is the Egypt sample alone, viewed from 2700 BCE to 2010 CE: the line runs on, empty, past Cleopatra to the ruler's "2000 CE". Apollo 11 isn't in this sample; the "1969" pin is drawn by the infographic layer beside the ruler, labelled as ours. (A richer version would **Compare** the sample with `usa.ochx`, whose Apollo 11 moments then sit on the same axis; that works in the editor, but `capture.mjs` has no action yet to add a second `.ochx` to a comparison, so it is not assumed here.)
- **The ruler's round marks** fall on astronomical round years, so in BCE they read "2001 BCE", "1001 BCE", "1 BCE" (1 BCE is astronomical year 0); moments and summaries show the conventional years ("2566 BCE"). That's correct, but don't put a callout on a ruler label.
- **Accuracy guardrails:**
  - Periods, dynasties and reigns follow **one chronology**: Ian Shaw (ed.), _The Oxford History of Ancient Egypt_ (2000). Every date before 664 BCE is approximate; say "about" for them, and never present a third-millennium year as exact. Where other works differ (Narmer, often c. 3100; the Great Pyramid, often c. 2560), the moment's **Date precision** says so.
  - The few dates known to the day (Alexander's death, the Rosetta decree, Caesar's death, Actium, Alexandria's fall, Cleopatra's death) are Roman or Julian dates. The timeline places them correctly on its proleptic Gregorian line, so its labels read a few days earlier than the dates historians give ("196-03 BCE" for the Rosetta decree's 27 March is fine; "30-08-10 BCE" for Cleopatra's death is the same day as 12 August, Julian); the Julian date is kept under **Historical dates**. Narration gives the historians' dates.
  - Cleopatra's death: 10 or 12 August 30 BCE (scholars disagree); the sample uses 12 August and says so. Narration says "in August".
  - Say "a timeline we built from …" — it isn't presented as a definitive history. Notes are our own summaries.
  - Account and classroom claims as in Video 5: free; no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · THREE THOUSAND YEARS OF PHARAOHS (0:00 – 0:50)

### Scene 1 · 0:00 – 0:25 · The whole sweep

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: from about 4400 BCE to 30 BCE, the heading "Predynastic Egypt" at the left, then a row of summaries along the axis, the period bands (Predynastic Period, Early Dynastic Period, Old Kingdom … Ptolemaic Period) in navy with the dynasties in grey beneath, and arcs above. To its left, a vertical strip of three chips: "92 moments", "81 durations", "57 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's "moments", "bands" and "linked".

**OST:** "Narmer to Cleopatra, on one line."

**VO:**
"Here's a timeline we built of ancient Egypt: from its first farming cultures, through the unification under Narmer around three thousand BCE, to the death of Cleopatra in 30 BCE. Periods, dynasties and the reigns of major pharaohs are bands; monuments, battles and writings are moments, each linked to the article it draws on."

### Scene 2 · 0:25 – 0:50 · One chronology, and where Egypt split

**FRAME:** The capture zooms to 1820–1500 BCE: the Middle Kingdom band ends and the Second Intermediate Period begins; beneath it, grey bands for the 12th Dynasty, "13th Dynasty + 1 more" (the 13th and 14th, with near-identical spans), "15th Dynasty + 1 more" (the 15th and 16th) and the 17th Dynasty, all at once; Amenemhat III's ochre band, and Sobekneferu's four-year reign drawn as a small capsule (too short for a band at this zoom); the moments "The Hyksos rule from Avaris", "Edwin Smith Papyrus", "Seqenenra Taa killed", "Kamose attacks the Hyksos", "Ahmose takes Avaris". A legend at the frame's edge: navy "periods", grey "dynasties", ochre "reigns", and under it a small book card: "Dates: Shaw (ed.), _The Oxford History of Ancient Egypt_, 2000".

**MOTION:** A continuous zoom; the legend and book card slide in as the bands settle; a bracket draws over the overlapping dynasty bands.

**OST:** "One chronology, named."

**VO:**
"Ancient dates are estimates, and scholars' chronologies differ, so this timeline follows one standard chronology, the Oxford History of Ancient Egypt, and says so. Where Egypt split, the bands show it. Around 1650 BCE, the Hyksos kings rule the north from Avaris while Theban kings hold the south, until Ahmose drives the Hyksos out."

---

## ACT 2 · THE PYRAMID AGE (0:50 – 1:40)

### Scene 3 · 0:50 – 1:15 · Pyramids in a century

**FRAME:** The capture zooms to 2720–2300 BCE: the heading "Old Kingdom", the 3rd, 4th, 5th and 6th Dynasty bands, the ochre reigns of Djoser, Sneferu, Khufu, Khafra, Menkaura and Unas; the moments "Step Pyramid of Djoser" (2667 BCE), "Sneferu's pyramids at Dahshur" (2600 BCE), a summary of two (the Diary of Merer and the Great Pyramid), "Great Sphinx of Giza" (2550 BCE), "Palermo Stone", "Pyramid Texts"; arcs join the Step Pyramid to Dahshur and Dahshur to the Great Pyramid, and each king to his monument.

**MOTION:** A continuous zoom from Scene 2's view back and into the Old Kingdom; the arcs from the Step Pyramid to Dahshur to Giza highlight in turn on the narration.

**OST:** "The pyramid age."

**VO:**
"Zoom into the Old Kingdom. Djoser's Step Pyramid, the first great building in stone. Sneferu's pyramids at Dahshur, where the true pyramid shape was worked out. Then Khufu's Great Pyramid at Giza, and the Sphinx, usually credited to Khafra: all in a little over a century, each linked to the king who built it."

### Scene 4 · 1:15 – 1:40 · A moment, and how sure it is

**FRAME:** The capture zooms into Khufu's reign, 2592–2558 BCE, where the summary splits into "Diary of Merer" (2567 BCE) and "Great Pyramid of Giza" (2566 BCE). With **View mode** on, the Diary of Merer opens in the reader: "2567-01 BCE", the tags `writing` and `monument`, the notes, the **Date precision** line ("Dated to about Khufu's 27th year: later than his reign ends in Shaw's chronology (2589–2566 BCE), a sign of how uncertain reign lengths are. Placed near the end of the reign."), its source, and "Related to: Great Pyramid of Giza".

**MOTION:** The zoom settles; the reader opens over the app; the Date precision line highlights.

**OST:** "Every date says how sure it is."

**VO:**
"Open a moment to read it. The Diary of Merer: the logbook of a crew shipping limestone to Giza, the oldest inscribed papyrus known. And its date says how sure it is: from about Khufu's twenty-seventh year, later than his reign ends in this chronology. Every early date here is an estimate, and says so."

---

## ACT 3 · EMPIRE (1:40 – 2:20)

### Scene 5 · 1:40 – 2:02 · A king and a queen who was king

**FRAME:** The capture pans and zooms to 1495–1415 BCE: the New Kingdom and 18th Dynasty bands, and two ochre reign bands, one beneath the other: "Thutmose III" (1479–1425) and "Hatshepsut" (1473–1458) inside it. The moments "Expedition to Punt" (1471 BCE), "Battle of Megiddo" (1457 BCE), "Hatshepsut's images erased" (1435 BCE), with arcs from Hatshepsut's band to Punt and to the erasure, and from Thutmose III's to Megiddo.

**MOTION:** A pan and zoom (about 4 s); the Hatshepsut band highlights, then the Thutmose III band.

**OST:** "Two reigns at once."

**VO:**
"A thousand years later, in the New Kingdom, two reigns overlap. Hatshepsut rules as king beside her young stepson, Thutmose the Third, and sends ships to Punt. After her, he wins at Megiddo and builds an empire; late in his reign, her images are cut from her monuments."

### Scene 6 · 2:02 – 2:20 · Kadesh, and the treaty after it

**FRAME:** The capture pans to 1300–1190 BCE: the 19th Dynasty, the reigns of Seti I, Ramesses II and Merenptah, the green band "Abu Simbel built"; the moments "Abydos King List", "Battle of Kadesh" (1274 BCE), "Egyptian–Hittite peace treaty" (1259 BCE), "Merneptah Stele". The Battle of Kadesh opens in the reader: its note, **Date precision** ("About 1274 BCE … 1274 BCE is the usual date."), its source, and "Related to: Ramesses II · 1279-01 BCE → 1213-01 BCE", "Egyptian–Hittite peace treaty · 1259-01 BCE". Choosing the treaty swaps the reader to it.

**MOTION:** A pan; the reader opens; a pointer chooses the treaty in **Related to**; the reader's content cross-fades.

**OST:** "Follow the links."

**VO:**
"Ramesses the Second reigns sixty-six years. Open the Battle of Kadesh, against the Hittites: it's linked to his reign, and to the peace treaty fifteen years later, whose text survives from both sides. Follow the link and keep reading."

---

## ACT 4 · HOW WE KNOW (2:20 – 3:00)

### Scene 7 · 2:20 – 2:45 · One thread: the writings

**FRAME:** Back to the whole sweep. **Separate by tags** with "writing" chosen: a track labelled "Tagged writing" rises above "Everything else", holding Tomb U-j, the Narmer Palette, the Diary of Merer, the Palermo Stone, the Coffin Texts, the Amarna letters band, Sheshonq I's campaign, Herodotus, and summaries that hold the Pyramid Texts, Sinuhe, the Rhind papyrus, the treaty, Manetho and the Rosetta Stone. Beside the frame, a short list ticks in as the narration names them.

**MOTION:** The tagged moments lift into their own track; the list ticks in.

**OST:** "How do we know?"

**VO:**
"How do we know any of this? Separate by tags, choose writing, and the record rises into a track of its own: the first labels at Abydos, the Narmer Palette, the Palermo Stone's annals, the Pyramid Texts, the Story of Sinuhe, letters and treaties, and Manetho, the priest whose thirty dynasties Egyptologists still count by."

### Scene 8 · 2:45 – 3:00 · A date in its own calendar

**FRAME:** Rejoined, and zoomed to 240–150 BCE. The Rosetta Stone opens in the reader: "196-03 BCE", the tag `writing`, the notes (the Memphis decree in hieroglyphs, demotic and Greek; found at Rosetta in 1799; Champollion, 1822), **Date precision** ("The decree is dated to a day: 27 March 196 BCE (Julian)."), **Original historical date** "27 March 196 BCE", **Original calendar** "Julian (Roman)", and "Related to: Ptolemy V Epiphanes", "Canopus Decree".

**MOTION:** The reader opens; the two Historical dates lines highlight.

**OST:** "Kept as the source gives it."

**VO:**
"The Rosetta Stone's decree is dated to the day: the twenty-seventh of March, 196 BCE. Historical dates keep it as the sources give it, in the Julian calendar, beside the timeline's own."

---

## ACT 5 · THE LAST PHARAOH (3:00 – 3:40)

### Scene 9 · 3:00 – 3:15 · The end, to the day

**FRAME:** The capture zooms to 72–27 BCE (Cleopatra VII's brick band, 51 BCE to her death, under the Ptolemaic Period and Ptolemaic Dynasty; Cleopatra VII born, Cleopatra becomes queen, Pompey killed in Egypt, Caesarion born, Caesar assassinated, Cleopatra meets Antony at Tarsus, Donations of Alexandria, Battle of Actium), then on into 31–30 BCE: "Battle of Actium", "Octavian takes Alexandria", "Death of Cleopatra", "Egypt a Roman province", where the three bands end together.

**MOTION:** One zoom in two stages, easing to a stop where the bands end.

**OST:** "The last pharaoh."

**VO:**
"Cleopatra the Seventh comes to the throne in 51 BCE. Caesar, Antony, Actium. In August of 30 BCE, Alexandria falls, and within two weeks she is dead. Egypt becomes a Roman province."

### Scene 10 · 3:15 – 3:27 · Closer to the Moon

**FRAME:** The capture zooms out from her death to 2700 BCE–2010 CE: Egypt's three thousand years fill the left half; past 30 BCE the line runs on, empty, to the ruler's "1000 CE" and "2000 CE". The infographic layer adds two brackets under the frame, "Great Pyramid → Cleopatra: about 2,540 years" and "Cleopatra → Apollo 11: 1,998 years", and a small pin at 1969 on the ruler, labelled "Apollo 11, 1969 (not on this timeline)".

**MOTION:** A continuous zoom out (about 4 s); the brackets draw left to right; the pin drops last.

**OST:** "Closer to the Moon than to the pyramid."

**VO:**
"Now keep going, on the same scale. Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid."

### Scene 11 · 3:27 – 3:40 · Your class's timeline

**FRAME:** The capture shrinks to the left half. On the right, three short lines with icons: "Read it: no account needed", "Build one: a period, a dynasty, a unit", "Share it: a link, or embedded in your class page". End card: "timescale.info/athan/ancient-egypt", and the source: "github.com/openchronology/timeline-app".

**MOTION:** The lines tick in; the end card rises and holds.

**OST:** "Make your class's timeline."

**VO:**
"Anyone can read it, no account needed. Build one with your class, and share it with a link."

**[END · ~3:40]**

---

## Appendix A · Narration only (for the voice session)

> Here's a timeline we built of ancient Egypt: from its first farming cultures, through the unification under Narmer around three thousand BCE, to the death of Cleopatra in 30 BCE. Periods, dynasties and the reigns of major pharaohs are bands; monuments, battles and writings are moments, each linked to the article it draws on.
>
> Ancient dates are estimates, and scholars' chronologies differ, so this timeline follows one standard chronology, the Oxford History of Ancient Egypt, and says so. Where Egypt split, the bands show it. Around 1650 BCE, the Hyksos kings rule the north from Avaris while Theban kings hold the south, until Ahmose drives the Hyksos out.
>
> Zoom into the Old Kingdom. Djoser's Step Pyramid, the first great building in stone. Sneferu's pyramids at Dahshur, where the true pyramid shape was worked out. Then Khufu's Great Pyramid at Giza, and the Sphinx, usually credited to Khafra: all in a little over a century, each linked to the king who built it.
>
> Open a moment to read it. The Diary of Merer: the logbook of a crew shipping limestone to Giza, the oldest inscribed papyrus known. And its date says how sure it is: from about Khufu's twenty-seventh year, later than his reign ends in this chronology. Every early date here is an estimate, and says so.
>
> A thousand years later, in the New Kingdom, two reigns overlap. Hatshepsut rules as king beside her young stepson, Thutmose the Third, and sends ships to Punt. After her, he wins at Megiddo and builds an empire; late in his reign, her images are cut from her monuments.
>
> Ramesses the Second reigns sixty-six years. Open the Battle of Kadesh, against the Hittites: it's linked to his reign, and to the peace treaty fifteen years later, whose text survives from both sides. Follow the link and keep reading.
>
> How do we know any of this? Separate by tags, choose writing, and the record rises into a track of its own: the first labels at Abydos, the Narmer Palette, the Palermo Stone's annals, the Pyramid Texts, the Story of Sinuhe, letters and treaties, and Manetho, the priest whose thirty dynasties Egyptologists still count by.
>
> The Rosetta Stone's decree is dated to the day: the twenty-seventh of March, 196 BCE. Historical dates keep it as the sources give it, in the Julian calendar, beside the timeline's own.
>
> Cleopatra the Seventh comes to the throne in 51 BCE. Caesar, Antony, Actium. In August of 30 BCE, Alexandria falls, and within two weeks she is dead. Egypt becomes a Roman province.
>
> Now keep going, on the same scale. Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.
>
> Anyone can read it, no account needed. Build one with your class, and share it with a link.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                      | Source                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | The sample: 92 moments, 81 durations, 57 relationships                                                                                                     | `node publicity/video/samples/build.mjs`                                                                                                                                                                     |
| 1     | Unification under Narmer about 3000 BCE (Shaw; often c. 3100); Cleopatra dies 30 BCE                                                                       | [Narmer](https://en.wikipedia.org/wiki/Narmer); [Death of Cleopatra](https://en.wikipedia.org/wiki/Death_of_Cleopatra); Shaw (2000)                                                                          |
| 2     | Dynastic dates from one chronology: Shaw (ed.), _The Oxford History of Ancient Egypt_ (2000); periods as in its table                                      | [Oxford History of Ancient Egypt](https://academic.oup.com/book/47196); [EES chronology, adapted from Shaw](https://www.ees.ac.uk/asset/102AE8E9-31EA-432D-A8D7434E3C65917D)                                 |
| 2     | Second Intermediate Period c. 1650–1550 BCE: Hyksos (15th Dynasty) at Avaris, Theban 16th–17th Dynasties; Ahmose expels the Hyksos                         | [Hyksos](https://en.wikipedia.org/wiki/Hyksos); [Ahmose I](https://en.wikipedia.org/wiki/Ahmose_I)                                                                                                           |
| 3     | Step Pyramid (Djoser, Imhotep) the first monumental stone building; Bent and Red Pyramids; Great Pyramid; Sphinx usually attributed to Khafra              | [Pyramid of Djoser](https://en.wikipedia.org/wiki/Pyramid_of_Djoser); [Red Pyramid](https://en.wikipedia.org/wiki/Red_Pyramid); [Great Sphinx](https://en.wikipedia.org/wiki/Great_Sphinx_of_Giza)           |
| 3     | "A little over a century": Djoser's accession 2667 BCE to Khafra's reign (2558–2532 BCE), Shaw's dates                                                     | `egypt.mjs`                                                                                                                                                                                                  |
| 4     | The Diary of Merer: Wadi al-Jarf papyri, the oldest inscribed papyri known; limestone shipped from Tura to Giza; Khufu's 27th year (or so)                 | [Diary of Merer](https://en.wikipedia.org/wiki/Diary_of_Merer)                                                                                                                                               |
| 4     | **Date precision** comes from the **Dating context** plugin                                                                                                | [Plugins: dating and historical annotations](../docs/plugins.md#dating-and-historical-annotations)                                                                                                           |
| 5     | Hatshepsut 1473–1458, Thutmose III 1479–1425 BCE (Shaw); Punt expedition; Megiddo in Thutmose III's 23rd year; her images erased late in his reign         | [Hatshepsut](https://en.wikipedia.org/wiki/Hatshepsut); [Battle of Megiddo](<https://en.wikipedia.org/wiki/Battle_of_Megiddo_(15th_century_BC)>); [Land of Punt](https://en.wikipedia.org/wiki/Land_of_Punt) |
| 6     | Ramesses II reigned 66 years (1279–1213 BCE); Kadesh 1274 BCE; the treaty 1259 BCE, in Egyptian and Hittite (Akkadian) versions                            | [Ramesses II](https://en.wikipedia.org/wiki/Ramesses_II); [Battle of Kadesh](https://en.wikipedia.org/wiki/Battle_of_Kadesh); [Treaty](https://en.wikipedia.org/wiki/Egyptian–Hittite_peace_treaty)          |
| 6     | The reader lists **Related to** and opens the chosen entity next                                                                                           | [Guide: reading a timeline](../docs/guide.md#reading-a-timeline)                                                                                                                                             |
| 7     | **Separate by tags** moves tagged events to a track above                                                                                                  | [Tags: separating](../docs/tags.md#separating-by-tags)                                                                                                                                                       |
| 7     | Tomb U-j labels; Narmer Palette; Palermo Stone; Pyramid Texts; Sinuhe; Amarna letters; treaty; Manetho's thirty dynasties still in use                     | Each moment's source in `egypt.mjs`; [Manetho](https://en.wikipedia.org/wiki/Manetho)                                                                                                                        |
| 8     | The Memphis decree on the Rosetta Stone, 27 March 196 BCE; found 1799; deciphered by Champollion 1822                                                      | [Rosetta Stone](https://en.wikipedia.org/wiki/Rosetta_Stone)                                                                                                                                                 |
| 8     | **Historical dates** keeps a source's date and calendar beside the display                                                                                 | [Plugins: dating and historical annotations](../docs/plugins.md#dating-and-historical-annotations)                                                                                                           |
| 9     | Cleopatra queen 51 BCE; Actium 2 September 31 BCE; Alexandria taken 1 August 30 BCE; her death 10 or 12 August 30 BCE; Egypt a province in 30 BCE          | [Cleopatra](https://en.wikipedia.org/wiki/Cleopatra); [Actium](https://en.wikipedia.org/wiki/Battle_of_Actium); [Death of Cleopatra](https://en.wikipedia.org/wiki/Death_of_Cleopatra)                       |
| 10    | Great Pyramid finished c. 2566 BCE (Shaw; often c. 2560) to Cleopatra's death, 30 BCE: about 2,530–2,540 years. 30 BCE to 1969 CE: 1,998 years (no year 0) | `egypt.mjs`; [Apollo 11](https://en.wikipedia.org/wiki/Apollo_11); the arithmetic is ours                                                                                                                    |
| 11    | Public timelines need no account; links and embeds; accounts are for people 13 and older                                                                   | [FAQ](../docs/faq.md#do-i-need-an-account), [sharing](../docs/sharing.md#embedding), [moderation: ages](../docs/moderation.md#ages)                                                                          |

## Appendix C · Questions this audience is likely to ask

1. **Why these dates and not the ones in my textbook?** Egyptian chronology before 664 BCE is reconstructed from king lists, reign lengths, a few astronomical records and radiocarbon dates, and scholars' versions differ by years to decades (more in the third millennium). This timeline uses one, Shaw's _Oxford History of Ancient Egypt_ (2000), throughout, and each moment's **Date precision** says when another date is common. Change any date to the chronology you teach; the sources travel with it.
2. **Why does Cleopatra's death read "30-08-10 BCE" on the line?** The timeline's display is the Gregorian calendar extended back; historians give ancient days in the Julian calendar, which ran a couple of days ahead of it then. The point on the line is the same day; the Julian date (12 August) is kept under **Historical dates**, and **Date precision** notes that some scholars prefer 10 August.
3. **Can my students use it without accounts?** Yes, to read public timelines and to make one in the browser and export it. Students 13 and older can sign up to save to the server.
4. **Can I use this sample?** Yes: import `egypt.ochx`, then edit it, or publish it from your own account.
5. **Can I set it beside another timeline, like our modern-history one?** Yes: **Compare** puts two or more timelines on one shared axis, read-only.
6. **Can I add pictures of the monuments?** Yes, with the **Moment icons** and **Duration backgrounds** plugins (the **History education** suite installs them together); link only images you may share.
