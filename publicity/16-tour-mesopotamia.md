# OpenChronology — Tour: Ancient Mesopotamia. Script and Storyboard

**Runtime:** ~3:45 (estimated at 140 wpm; set it from the scratch narration's cut) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and history teachers, and anyone curious about the ancient world. Teachers will judge it as classroom material, so it must be accurate and calm, and honest about how uncertain ancient dates are.
**Purpose:** a tour of the ancient Near East's longest story, from the first farming villages to Cyrus's conquest of Babylon in 539 BCE, through the real app: the whole sweep, the first cities and writing up close, Sumer to Ur, one thread (law) pulled out of the rest, a moment read with its sources, how sure the dates are, the Assyrian kings as bands, Babylon's last king, and the fall of Babylon down to the day.

**How it differs:** Video 5 tours two and a half centuries known to the day; this one tours six and a half thousand years, most of them known only to the century. So the timeline's dating notes are part of the story: every moment says how its date is known, and the narration says which chronology it uses.

**Production notes:**

- Narration is 517 words, about 140 wpm when read, in the voice of a good history teacher: curious, not breathless.
- **The timeline is the sample `publicity/video/samples/mesopotamia.ochx`**, built from `mesopotamia.mjs`: 90 moments (11 of them chapter headings), 38 durations (16 periods and empires, 22 reigns and spans) and 40 relationships, a Wikipedia source on each (and translated Babylonian chronicles on the days they date), the Timeline theme in archive colours, moments coloured by tag (`war`, `law`, `writing`, `science`, `city`, `building`). Shots are captured from the real editor in full screen with `capture.mjs` (`shots.json` in the video's folder) and shown in a browser frame; the infographic layer adds titles and arrows around the frame, never over the app's own text.
- **Plugins it shows:** **Dating context** (each moment's **Date precision** line), **Historical dates** (the Julian date beside the proleptic Gregorian one), **Moment sources**, **Moment colors**, **Moment headings**.
- **Bounds for the shots** (type them as `boundText` does, from the stored seconds): whole sweep = **Fit all**; Uruk 4100–2800 BCE; Sumer to Ur 2450–1950 BCE; law thread 2500–1050 BCE; Hammurabi 1850–1700 BCE; Assyria 920–600 BCE; Babylon 610–530 BCE; the fall of Babylon 20 September – 5 November 539 BCE (proleptic Gregorian). Put every `open` under a shot's `actions`, not its `setup`.
- **Accuracy guardrails:**
  - **Chronology:** before about 1500 BCE the sample uses the **middle chronology** (Hammurabi 1792–1750 BCE, the Hittite sack of Babylon 1595 BCE). Say so whenever a second- or third-millennium date is spoken as a year, and say "about" for anything before the first millennium. Prehistoric periods are approximate.
  - **Calendars:** the app's Gregorian display is proleptic, so a Babylonian day historians give in the Julian calendar (12 October 539 BCE) reads six days earlier on the ruler (6 October). The narration names the Julian date, as historians do, and says the ruler is proleptic Gregorian; the reader shows both.
  - **Ruler labels:** at the scale of centuries the ruler's ticks fall on round astronomical years, so they read "1801 BCE", "701 BCE"; moments' own labels read the conventional years ("1754 BCE"). Don't point at ruler labels in callouts; point at moments.
  - Say "a sample timeline we built from …": it's not presented as a definitive history. Only well-established facts (Appendix B); where scholars disagree (Enheduanna's authorship, whether Gilgamesh was historical), say so.
  - Account and classroom claims: free, no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · SIX THOUSAND YEARS (0:00 – 1:12)

### Scene 1 · 0:00 – 0:27 · The whole sweep

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: about 7000 BCE at the left to the epilogue at the right; the long Ubaid, Halaf and Samarra bands under the villages, then the crowd of bands and summaries from Uruk on; arcs above the crowded right half. The chapter heading "Uruk: the first cities and writing" sits in the gap the fourth millennium leaves. To its left, a vertical strip of three chips: "90 moments", "38 durations", "40 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's numbers.

**OST:** "7000 BCE to 539 BCE, on one line."

**VO:**
"Here's a sample timeline we built of ancient Mesopotamia, the land between the Tigris and the Euphrates. It runs from the first farming villages, about seven thousand BCE, to the fall of Babylon to Cyrus in 539, and Alexander's death there two centuries later. Periods, empires and reigns are bands; inventions, writings, laws and battles are moments, each linked to its sources."

### Scene 2 · 0:27 – 0:49 · The first cities, and writing

**FRAME:** The capture zooms from the whole sweep into 4100–2800 BCE: the Uruk period's band fills the width, the Jemdet Nasr and Early Dynastic bands begin at the right. Moments drawn apart: Cylinder seals (3500 BCE), The White Temple at Uruk, Wheeled wagons (3400), Writing: proto-cuneiform (3300), Counting in sixties (3200), The Warka Vase (3100), with the arc from writing to counting. A callout beside the frame: "Dates here: about".

**MOTION:** A continuous zoom; summaries split into titled moments as they spread; the callout fades in last.

**OST:** "The first cities, and writing."

**VO:**
"Zoom into the fourth millennium and the first cities appear. In the Uruk period come cylinder seals, a temple on a high platform, wagons on wheels, and around 3300 BCE, writing: clay tablets that began as bookkeeping. The same accounts already count in sixties, which is why an hour still has sixty minutes."

### Scene 3 · 0:49 – 1:12 · From city-states to empire

**FRAME:** The capture pans and zooms to 2450–1950 BCE: The Stele of the Vultures, Urukagina's reforms, Lugalzagesi unites Sumer, then the Akkadian Empire band with Sargon of Akkad and Naram-Sin as reign bands beneath it; Enheduanna, high priestess at Ur; The Victory Stele of Naram-Sin; Akkad falls; the Gutian period; the Third Dynasty of Ur with Ur-Nammu and Shulgi; The Great Ziggurat of Ur; Ur falls to Elam. A small caption under the frame: "middle chronology".

**MOTION:** A slow pan left to right as the narration names each; the Sargon band highlights on "Sargon".

**OST:** "City-states, then an empire."

**VO:**
"Six centuries on, Sumer is a patchwork of rival city-states, Lagash fighting Umma over fields and water. Then Sargon of Akkad conquers them all: the first empire. His daughter Enheduanna may be the first author we know by name. Akkad falls, and Ur rises in its place, with its great ziggurat."

---

## ACT 2 · LAWS AND DATES (1:12 – 2:18)

### Scene 4 · 1:12 – 1:28 · One thread: law

**FRAME:** The view 2500–1050 BCE. **Separate by tags** with "law" chosen: a track rises above the rest, holding Urukagina's reforms, The Code of Ur-Nammu, the Lipit-Ishtar and Eshnunna codes (a summary of two), The Code of Hammurabi, Hammurabi's stele carried to Susa and The Middle Assyrian Laws, in the law tag's green. "Everything else" stays below.

**MOTION:** The tagged moments lift into their own track; a thin line beside the frame traces left to right along them.

**OST:** "Pull out one thread."

**VO:**
"Pull out one thread. Separate by tags, choose law, and centuries of law-making rise into a track of their own: Urukagina's reforms, Ur-Nammu's code, the oldest that survives, the laws of Lipit-Ishtar and Eshnunna, and then Hammurabi's."

### Scene 5 · 1:28 – 1:48 · Read a moment, follow its links

**FRAME:** **Rejoin**, then the view 1850–1700 BCE. With **View mode** on, The Code of Hammurabi opens in the reader: "1754-01 BCE", the `law` tag, the notes (282 laws, a basalt stele, the sun god Shamash, "an eye for an eye"), the **Date precision** line "About 1755–1750 BCE (middle chronology); placed at 1754.", the Sources list, and **Related to**: Hammurabi (1792 → 1750 BCE), The Laws of Eshnunna, Hammurabi's stele carried to Susa. Choosing the last swaps the reader to it: "1158-01 BCE", Shutruk-Nakhunte, Susa.

**MOTION:** The reader opens over the app; the Date precision line highlights; a pointer chooses the related entry; the reader's content cross-fades.

**OST:** "Every moment has its sources."

**VO:**
"Open the Code of Hammurabi to read it: two hundred and eighty-two laws on a basalt stele, where that comes from, and what it's linked to. Six centuries later an Elamite king carried the stele off to Susa as a trophy. Follow the link, and there it is."

### Scene 6 · 1:48 – 2:18 · How sure are these dates?

**FRAME:** Three readers in turn, each over its own zoomed view. "The Venus tablet of Ammi-Saduqa": its notes (Venus's risings and settings over 21 years; several possible fits, eight years or more apart). "The Hittites sack Babylon": **Date precision** "1595 BCE in the middle chronology (1651 high, 1531 low)". Then "The eclipse of Bur-Sagale": "15 June 763 BCE (Julian), fixed by astronomy", with **Original historical date** "15 June 763 BCE" and **Original calendar** "Julian (proleptic)". Beside the frame, a small three-row strip: "High 1651 · Middle 1595 · Low 1531 BCE".

**MOTION:** Each reader slides in and its dating lines highlight; the strip's middle row lights on "middle chronology".

**OST:** "Every date says how it's known."

**VO:**
"How sure are these dates? Before about 1500 BCE, not very, and every moment says how its date is known. The Hittite sack of Babylon is 1595 in the middle chronology, used here; other reckonings move it by decades, because they hang on a tablet of Venus observations that fits the sky more than one way. Assyria is firmer: an eclipse noted in its list of years has been dated to June 763 BCE."

---

## ACT 3 · EMPIRES, DOWN TO THE DAY (2:18 – 3:46)

### Scene 7 · 2:18 – 2:41 · The Assyrian kings

**FRAME:** The view 920–600 BCE: the Neo-Assyrian Empire band across the width with its kings as reign bands below it (Ashurnasirpal II, Shalmaneser III, Tiglath-Pileser III, Sargon II, Sennacherib, Esarhaddon, Ashurbanipal), and the moments above and below: The banquet at Kalhu, The Battle of Qarqar, The Black Obelisk, The eclipse of Bur-Sagale, Sennacherib destroys Babylon, Assyria takes Memphis, The Library of Ashurbanipal, The fall of Nineveh (612 BCE). Arcs link each king to his works.

**MOTION:** The zoom settles; the reign bands light in order as the narration names them; the library's arc to the fall of Nineveh draws last.

**OST:** "Kings as bands."

**VO:**
"Zoom into the first millennium and Assyria's kings follow one another as bands: Ashurnasirpal and his new capital at Kalhu, Tiglath-Pileser, Sargon the Second, Sennacherib, who besieged Lachish and destroyed Babylon, and Ashurbanipal, whose library kept the best copies of Gilgamesh. In 612, Nineveh falls to the Babylonians and the Medes."

### Scene 8 · 2:41 – 3:04 · Babylon's last king

**FRAME:** The view 610–530 BCE: the Neo-Babylonian Empire band, Nebuchadnezzar II and Nabonidus as reigns, Nabonidus at Tayma beneath; The Battle of Carchemish, Nebuchadnezzar takes Jerusalem (16 March 597 BCE, Julian), Jerusalem destroyed, The Ishtar Gate. Then "Nabonidus digs up Naram-Sin's foundation" opens in the reader, with **Related to**: Nabonidus, and Naram-Sin (2254 → 2218 BCE). A callout beside the reader: "He said 3,200 years. It was about 1,700."

**MOTION:** The zoom settles; the reader opens; the callout's two numbers tick in on the narration.

**OST:** "A king who dug up the past."

**VO:**
"Babylon takes Assyria's place. Nebuchadnezzar takes Jerusalem, on a day a Babylonian chronicle records, and builds the Ishtar Gate. Its last king, Nabonidus, dug for the past: at Sippar he found an inscription of Naram-Sin, and said it was 3,200 years old. On this line you can see it was about 1,700."

### Scene 9 · 3:04 – 3:27 · The fall of Babylon, to the day

**FRAME:** The capture zooms from the empire down to 20 September – 5 November 539 BCE: the ruler counts days; The Battle of Opis, Sippar surrenders, Babylon falls to Cyrus and Cyrus enters Babylon, joined by arcs. "Babylon falls to Cyrus" opens in the reader: "10-06", **Date precision** "16 Tashritu: 12 October 539 BCE (Julian), from the Nabonidus Chronicle", **Original historical date** "12 October 539 BCE", **Original calendar** "Julian (proleptic)", and the Nabonidus Chronicle among its sources. A callout points from "10-06" to "12 October": "proleptic Gregorian · Julian".

**MOTION:** One continuous zoom (about 6 seconds), slowing as it arrives; the reader opens; the callout draws between the two dates.

**OST:** "Down to the day."

**VO:**
"And in 539 the line comes down to days. The Battle of Opis, Sippar's surrender, and then, on the twelfth of October, Babylon itself falls; Cyrus rides in seventeen days later. The ruler counts in the proleptic Gregorian calendar, so it says the sixth; each moment keeps the Julian date historians use beside it."

### Scene 10 · 3:27 – 3:46 · Epilogue, and your own

**FRAME:** The view widens to 560–300 BCE: the Persian (Achaemenid) Babylon band, The Cyrus Cylinder, The Behistun Inscription, The Battle of Gaugamela, Alexander enters Babylon, Alexander dies in Babylon (323 BCE). Then **Fit all**, and the capture shrinks to the left half. On the right, three short lines: "Read it: no account needed", "Build one: as a class, or one each", "Every date with its source". End card: the ◷ wordmark, "timescale.info/athan/mesopotamia", and "github.com/openchronology/timeline-app".

**MOTION:** A short widening move; Fit all; the lines tick in; the end card rises and holds.

**OST:** "Six and a half thousand years, one line."

**VO:**
"Two centuries later, Alexander dies in Nebuchadnezzar's palace. Six and a half thousand years, from villages to empires, on one line you can read, zoom and follow. Open it at timescale.info, and build your own."

**[END · ~3:46]**

---

## Appendix A · Narration only (for the voice session)

> Here's a sample timeline we built of ancient Mesopotamia, the land between the Tigris and the Euphrates. It runs from the first farming villages, about seven thousand BCE, to the fall of Babylon to Cyrus in 539, and Alexander's death there two centuries later. Periods, empires and reigns are bands; inventions, writings, laws and battles are moments, each linked to its sources.
>
> Zoom into the fourth millennium and the first cities appear. In the Uruk period come cylinder seals, a temple on a high platform, wagons on wheels, and around 3300 BCE, writing: clay tablets that began as bookkeeping. The same accounts already count in sixties, which is why an hour still has sixty minutes.
>
> Six centuries on, Sumer is a patchwork of rival city-states, Lagash fighting Umma over fields and water. Then Sargon of Akkad conquers them all: the first empire. His daughter Enheduanna may be the first author we know by name. Akkad falls, and Ur rises in its place, with its great ziggurat.
>
> Pull out one thread. Separate by tags, choose law, and centuries of law-making rise into a track of their own: Urukagina's reforms, Ur-Nammu's code, the oldest that survives, the laws of Lipit-Ishtar and Eshnunna, and then Hammurabi's.
>
> Open the Code of Hammurabi to read it: two hundred and eighty-two laws on a basalt stele, where that comes from, and what it's linked to. Six centuries later an Elamite king carried the stele off to Susa as a trophy. Follow the link, and there it is.
>
> How sure are these dates? Before about 1500 BCE, not very, and every moment says how its date is known. The Hittite sack of Babylon is 1595 in the middle chronology, used here; other reckonings move it by decades, because they hang on a tablet of Venus observations that fits the sky more than one way. Assyria is firmer: an eclipse noted in its list of years has been dated to June 763 BCE.
>
> Zoom into the first millennium and Assyria's kings follow one another as bands: Ashurnasirpal and his new capital at Kalhu, Tiglath-Pileser, Sargon the Second, Sennacherib, who besieged Lachish and destroyed Babylon, and Ashurbanipal, whose library kept the best copies of Gilgamesh. In 612, Nineveh falls to the Babylonians and the Medes.
>
> Babylon takes Assyria's place. Nebuchadnezzar takes Jerusalem, on a day a Babylonian chronicle records, and builds the Ishtar Gate. Its last king, Nabonidus, dug for the past: at Sippar he found an inscription of Naram-Sin, and said it was 3,200 years old. On this line you can see it was about 1,700.
>
> And in 539 the line comes down to days. The Battle of Opis, Sippar's surrender, and then, on the twelfth of October, Babylon itself falls; Cyrus rides in seventeen days later. The ruler counts in the proleptic Gregorian calendar, so it says the sixth; each moment keeps the Julian date historians use beside it.
>
> Two centuries later, Alexander dies in Nebuchadnezzar's palace. Six and a half thousand years, from villages to empires, on one line you can read, zoom and follow. Open it at timescale.info, and build your own.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                   | Source                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | The sample: 90 moments, 38 durations, 40 relationships                                                                                                                  | `node publicity/video/samples/build.mjs`                                                                                                                                                                                                                                 |
| 1     | Jarmo about 7000 BCE; Babylon falls 539 BCE; Alexander dies in Babylon 323 BCE                                                                                          | [Jarmo](https://en.wikipedia.org/wiki/Jarmo), [Fall of Babylon](https://en.wikipedia.org/wiki/Fall_of_Babylon), [Death of Alexander the Great](https://en.wikipedia.org/wiki/Death_of_Alexander_the_Great)                                                               |
| 2     | Uruk period about 4000–3100 BCE; cylinder seals; the White Temple (Anu ziggurat); wheeled wagons in Uruk pictographs about 3500–3350 BCE                                | [Uruk period](https://en.wikipedia.org/wiki/Uruk_period), [Cylinder seal](https://en.wikipedia.org/wiki/Cylinder_seal), [Anu ziggurat](https://en.wikipedia.org/wiki/Anu_ziggurat), [Wheel](https://en.wikipedia.org/wiki/Wheel)                                         |
| 2     | Earliest unequivocal writing, Uruk IV, about 3300 BCE, for accounts; proto-cuneiform's sexagesimal numbers; sixty minutes and 360 degrees from base 60                  | [Cuneiform](https://en.wikipedia.org/wiki/Cuneiform), [Proto-cuneiform](https://en.wikipedia.org/wiki/Proto-cuneiform), [Sexagesimal](https://en.wikipedia.org/wiki/Sexagesimal)                                                                                         |
| 3     | Lagash–Umma border war (Stele of the Vultures, about 2450 BCE); Sargon about 2334–2279 BCE (middle chronology), the first empire                                        | [Stele of the Vultures](https://en.wikipedia.org/wiki/Stele_of_the_Vultures), [Sargon of Akkad](https://en.wikipedia.org/wiki/Sargon_of_Akkad), [Akkadian Empire](https://en.wikipedia.org/wiki/Akkadian_Empire)                                                         |
| 3     | Enheduanna, Sargon's daughter, "the earliest known named author", the attribution debated                                                                               | [Enheduanna](https://en.wikipedia.org/wiki/Enheduanna)                                                                                                                                                                                                                   |
| 3     | Akkad falls about 2154 BCE; Ur III 2112–2004 BCE; the Ziggurat of Ur                                                                                                    | [Third Dynasty of Ur](https://en.wikipedia.org/wiki/Third_Dynasty_of_Ur), [Ziggurat of Ur](https://en.wikipedia.org/wiki/Ziggurat_of_Ur)                                                                                                                                 |
| 4     | Urukagina about 2378–2368 BCE; Ur-Nammu's code about 2100 BCE, the oldest surviving; Lipit-Ishtar and Eshnunna about 1930 BCE; Hammurabi about 1755–1750 BCE            | [Urukagina](https://en.wikipedia.org/wiki/Urukagina), [Code of Ur-Nammu](https://en.wikipedia.org/wiki/Code_of_Ur-Nammu), [Code of Lipit-Ishtar](https://en.wikipedia.org/wiki/Code_of_Lipit-Ishtar), [Laws of Eshnunna](https://en.wikipedia.org/wiki/Laws_of_Eshnunna) |
| 4     | Separate by tags moves tagged events into a track above                                                                                                                 | [Tags: separating by tags](../docs/tags.md#separating-by-tags)                                                                                                                                                                                                           |
| 5     | 282 laws on a basalt stele; carried to Susa by Shutruk-Nakhunte about 1158 BCE, about six centuries after it was carved                                                 | [Code of Hammurabi](https://en.wikipedia.org/wiki/Code_of_Hammurabi), [Shutruk-Nakhunte](https://en.wikipedia.org/wiki/Shutruk-Nakhunte)                                                                                                                                 |
| 5     | The reader shows notes, plugin fields, sources and related entities                                                                                                     | [Guide: reading a timeline](../docs/guide.md#reading-a-timeline)                                                                                                                                                                                                         |
| 6     | Middle chronology: the sack of Babylon 1595 BCE (high about 1651, low about 1531); the chronologies rest on the Venus tablet of Ammi-Saduqa's several astronomical fits | [Chronology of the ancient Near East](https://en.wikipedia.org/wiki/Chronology_of_the_ancient_Near_East), [Venus tablet of Ammisaduqa](https://en.wikipedia.org/wiki/Venus_tablet_of_Ammisaduqa), [Sack of Babylon](https://en.wikipedia.org/wiki/Sack_of_Babylon)       |
| 6     | The eclipse of Bur-Sagale in the eponym list, 15 June 763 BCE (Julian)                                                                                                  | [Assyrian eclipse](https://en.wikipedia.org/wiki/Assyrian_eclipse)                                                                                                                                                                                                       |
| 7     | Reigns: Ashurnasirpal II 883–859, Tiglath-Pileser III 745–727, Sargon II 722–705, Sennacherib 705–681, Ashurbanipal 669–631 BCE; Kalhu; Lachish 701; Babylon 689        | Each reign's Wikipedia source in `mesopotamia.mjs`; [Siege of Lachish](https://en.wikipedia.org/wiki/Siege_of_Lachish)                                                                                                                                                   |
| 7     | Ashurbanipal's library held some of the best copies of Gilgamesh; Nineveh fell in 612 BCE to Babylonians and Medes                                                      | [Epic of Gilgamesh](https://en.wikipedia.org/wiki/Epic_of_Gilgamesh), [Library of Ashurbanipal](https://en.wikipedia.org/wiki/Library_of_Ashurbanipal), [Battle of Nineveh (612 BC)](<https://en.wikipedia.org/wiki/Battle_of_Nineveh_(612_BC)>)                         |
| 8     | Jerusalem taken 2 Adar (16 March) 597 BCE, from the Babylonian chronicle; the Ishtar Gate about 575 BCE                                                                 | [Siege of Jerusalem (597 BC)](<https://en.wikipedia.org/wiki/Siege_of_Jerusalem_(597_BC)>), [ABC 5](https://www.livius.org/sources/content/mesopotamian-chronicles-content/abc-5-jerusalem-chronicle/), [Ishtar Gate](https://en.wikipedia.org/wiki/Ishtar_Gate)         |
| 8     | Nabonidus found Naram-Sin's inscription at Sippar and put it 3,200 years before him; Naram-Sin ruled about 2254–2218 BCE, about 1,700 years before (off by about 1,500) | [Nabonidus](https://en.wikipedia.org/wiki/Nabonidus), [Nabonidus Cylinder from Sippar](https://www.livius.org/sources/content/nabonidus-cylinder-from-sippar/)                                                                                                           |
| 9     | Opis in Tashritu; Sippar 10 October; Babylon 12 October; Cyrus enters 29 October 539 BCE (Julian): 17 days                                                              | [Fall of Babylon](https://en.wikipedia.org/wiki/Fall_of_Babylon), [Nabonidus Chronicle (ABC 7)](https://www.livius.org/sources/content/mesopotamian-chronicles-content/abc-7-nabonidus-chronicle/)                                                                       |
| 9     | Julian 12 October 539 BCE is proleptic Gregorian 6 October (the calendars differ by six days then)                                                                      | `julianDays` and `gregorianDays` in `mesopotamia.mjs`, checked against the Gregorian reform (Julian 4 October 1582 followed by Gregorian 15 October); [Proleptic Gregorian calendar](https://en.wikipedia.org/wiki/Proleptic_Gregorian_calendar)                         |
| 9     | Historical dates keeps an original date and calendar beside the timeline's own                                                                                          | [Plugins](../docs/plugins.md)                                                                                                                                                                                                                                            |
| 10    | Alexander dies in Babylon, in Nebuchadnezzar's palace, 10 or 11 June 323 BCE; 7000 to 323 BCE is about 6,700 years                                                      | [Death of Alexander the Great](https://en.wikipedia.org/wiki/Death_of_Alexander_the_Great)                                                                                                                                                                               |
| 10    | Public timelines need no account; accounts are for people 13 and older                                                                                                  | [FAQ](../docs/faq.md#do-i-need-an-account)                                                                                                                                                                                                                               |

## Appendix C · Questions this audience is likely to ask

1. **Why the middle chronology?** It is the convention most textbooks and museums use, and Wikipedia's articles mostly follow it. Every second- and third-millennium date in the sample says so in its **Date precision** line, so a class using the high or low chronology can shift those events (**Shift or scale these…** after separating them) and keep everything else.
2. **Why does the ruler say "1801 BCE" instead of "1800 BCE"?** The ruler's ticks fall on round astronomical years (year −1800 is 1801 BCE, since there is no year zero). Moments' own labels use the conventional years.
3. **Why does Babylon fall on "10-06" when books say 12 October?** Books give the Julian date; the timeline's Gregorian display runs the modern calendar back in time (proleptic), which is six days off in the sixth century BCE. The same instant is stored, and the reader shows the Julian date beside it.
4. **Can my students use it without accounts?** Yes, to read public timelines and to make one in the browser and export it. Students 13 and older can sign up to save to the server.
5. **Can I use this sample?** Yes: import `mesopotamia.ochx`, then edit it, or publish it from your own account. Its sources are on every moment.
6. **Can I add pictures of the objects?** Yes, with the **Moment icons** and **Duration backgrounds** plugins; link images you may share (museum open-access collections are a good place to look).
