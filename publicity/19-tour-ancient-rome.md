# OpenChronology — Tour: Ancient Rome, from the Founding to the Fall. Script and Storyboard

**Runtime:** ~4:03 (at 140 wpm, with pauses) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and teachers of Roman history, and anyone who has tried to keep twelve centuries of kings, consuls and emperors in order. Teachers will judge it as classroom material, so it must be accurate and calm, and honest about what is legend and how Roman dates are known.
**Purpose:** show an ancient-history timeline the way a class would use it: the whole sweep, the kings as legend, the Republic and its wars as bands, Hannibal's war followed link by link, a date in Rome's own drifting calendar and the eclipse that pins one down, the Ides of March in the Julian calendar, the emperors' dynasties and reigns, one thread (Roman law) pulled out of the rest, the end in the West, and the one fact the whole line makes visible: the Eastern Empire went on for nearly a thousand years after 476.

**How it differs:** Video 5 tours modern history, where every date is a Gregorian day. Rome's dates come in three kinds: legendary years for the kings, days in the pre-Julian Roman calendar (which had drifted from the seasons), and Julian days from 45 BCE. This tour shows how a timeline says which is which: the `legend` tag, a **Date precision** line on every moment, and **Historical dates** for the date as the source gives it. The subject still leads, and each control is named once, by what it does for the history.

**Production notes:**

- Narration is 546 words, about 140 wpm when read, in the voice of a good history teacher: curious, unhurried, never breathless. It runs a little long for a tour, as agreed; Scenes 6 and 10 are the ones to trim if it must be shorter.
- **The timeline is the sample `publicity/video/samples/rome.ochx`**, built from `rome.mjs`: 133 moments (9 of them chapter headings), 49 durations (6 eras, the 7 legendary kings, 4 dynasties and the Year of the Four Emperors, 13 reigns, 14 wars, and 4 political bands: the Conflict of the Orders, the Second Triumvirate, the Crisis of the Third Century and the Tetrarchy), 62 relationships, a Wikipedia source on every moment and duration (with Livy, the Twelve Tables, Suetonius, the Res Gestae and Lactantius's text of the Edict of Milan where they are the natural reference), the Timeline theme in archive colours. Bands are coloured by kind: navy for eras, light grey for the kings, grey for dynasties, ochre for reigns, brick for wars, green for political struggles, purple for the Eastern Empire and Justinian. Tags: `chapter`, `legend`, `ruler`, `politics`, `law`, `war`, `building`, `writing`, `religion`.
- **Shots** are captured from the real editor in full screen with `common/capture.mjs` (`shots.json` in the video's folder, when it is made) and shown in a browser frame; the infographic layer adds titles, chips and arrows around the frame, never over the app's own text. The views below are given in years BCE/CE; in `shots.json` they are stored seconds (Gregorian display, seconds from 1970; 1 January of a year _N_ BCE is astronomical year 1 − _N_).
- **Capture rules.** Every `open` goes under the shot's `actions`, never `setup`. The reader leaves out a moment's year when the view's left edge is in the same year, so every reader below is opened from a view that starts in an earlier year (the Ides from a view starting June 46 BCE; the founding from 756 BCE). Readers are opened unseparated: in a separated view, **View mode** opens the editor. The duration reader shows no Sources or Date precision, so only moments are opened.
- **The ruler's round marks** fall on astronomical round years, so in BCE they read "501 BCE", "201 BCE", "1 BCE" (1 BCE is astronomical year 0; issue #340); moments and summaries show the conventional years ("509 BCE"). That's correct, but don't put a callout on a ruler label.
- **Accuracy guardrails:**
  - **The kings are legend.** Their reigns, and every year before about 300 BCE, are the traditional Varronian dates, reconstructed by Roman antiquarians centuries later; the founding's 753 BCE is Varro's reckoning (others gave 748 or 728). Say "by tradition" or "in legend", never present them as record.
  - **Days before 45 BCE are Roman-calendar dates**, not Julian ones: that calendar had drifted from the seasons (about two and a half months in 168 BCE). Their Julian equivalent is mostly unknown, so the sample places them as if they were Julian and says so; for Cannae, one review (Derow) gives 1 July 216 BCE (Julian), others differ. Narration gives the Roman date and says it's Rome's own calendar.
  - **From 45 BCE days are Julian.** The display is proleptic Gregorian, so labels read one or two days earlier than the historians' dates before 200 CE ("0044-03-13 BCE" for the Ides of March) and one to nine days later after 300 CE ("1453-06 CE" for 29 May 1453). Narration gives the historians' (Julian) dates; the reader shows them under **Historical dates**. Between 45 and 8 BCE leap years were misapplied, so those days may be off by up to three days; the moments say so.
  - **Pydna:** the eclipse was astronomically on the night of 21–22 June 168 BCE (Julian); Livy dates it to the night of 3–4 September in the Roman calendar. "Two and a half months" is our rounding of that gap.
  - **476 and 1453:** 476 is the _traditional_ end of the Western Empire; say "traditional" or "the last western emperor is deposed". From 476 to 1453 is 977 years; narration says "nearly a thousand years".
  - Say "a timeline we built from …" — it isn't presented as a definitive history. Notes are our own summaries.
  - Account and classroom claims as in Video 5: free; no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · TWELVE CENTURIES (0:00 – 0:43)

### Scene 1 · 0:00 – 0:24 · The whole sweep

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: from the Roman Kingdom's navy band at the left, through the Roman Republic, the Principate and the late empire, to the long purple band of the Eastern Roman (Byzantine) Empire running on to "Fall of Constantinople · 1453 CE" at the right, with "Crusaders sack Constantinople · 1204 CE" below it; summaries crowd the axis from 753 BCE to 476 CE, and arcs rise above. To its left, a vertical strip of three chips: "133 moments", "49 durations", "62 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's "moments", "bands" and "linked".

**OST:** "From the founding to the fall."

**VO:**
"Here's a timeline we built of ancient Rome: from its legendary founding in 753 BCE, through the kings, the Republic and the Empire, to the last emperor in the West, in 476. Eras, dynasties, reigns and wars are bands; laws, battles, buildings and books are moments, each linked to the article it draws on."

### Scene 2 · 0:24 – 0:43 · Seven kings, and a legend

**FRAME:** The capture zooms to 770–495 BCE: the navy "Roman Kingdom" band, and beneath it the seven light-grey kings, Romulus, Numa Pompilius, Tullus Hostilius, Ancus Marcius, Tarquinius Priscus, Servius Tullius, Tarquinius Superbus; the moments "Cloaca Maxima" (600 BCE), "Lapis Niger inscription" (560 BCE), a summary at 509 BCE and "Battle of Lake Regillus". Then, zoomed to 756–748 BCE with **View mode** on, the Founding of Rome opens in the reader: "0753-04-13 BCE", the tags `legend` and `ruler`, the notes, **Date precision** ("Legendary. 753 BCE is the Varronian date (other ancient writers gave 748 or 728 BCE); 21 April is the traditional day, placed as if it were a Julian date."), **Original historical date** "21 April 753 BCE (the Parilia)", **Original calendar** "Roman (pre-Julian Republican)", and "Related to: Romulus".

**MOTION:** A continuous zoom; the kings' bands highlight left to right; then a zoom into the founding and the reader opens; the Date precision line highlights.

**OST:** "Legend, and labelled so."

**VO:**
"Start with the kings: seven of them, in Roman tradition, over nearly two and a half centuries. Open the founding, and the timeline says what it is: legend. 753 is one Roman scholar's reckoning, Varro's, and the twenty-first of April was kept as Rome's birthday."

---

## ACT 2 · THE REPUBLIC (0:43 – 2:11)

### Scene 3 · 0:43 – 1:09 · Consuls, plebeians and the first road

**FRAME:** The capture pans to 520–255 BCE: the Roman Republic's navy band, the green "Conflict of the Orders" band beneath it from 494 to 287 BCE, and the brick "Samnite Wars"; the moments "The Twelve Tables" (450 BCE), "Lex Canuleia", "Veii captured", "Gauls sack Rome" (390 BCE), "Servian Wall", "Licinian–Sextian laws", "Caudine Forks", a summary of two at 312 BCE (Via Appia begun, Aqua Appia), "Battle of Sentinum", "Lex Hortensia" (287 BCE), and the heading "Rome against Carthage" at the right edge.

**MOTION:** A pan and zoom (about 4 s); the green band highlights from end to end as the narration names its two ends; the 312 BCE summary pulses on "both in 312".

**OST:** "Two consuls a year."

**VO:**
"In 509 BCE the last king is driven out, and two consuls, elected every year, take his place. For two centuries the plebeians struggle with the patricians for power: the Twelve Tables write the law down, and in 287 the struggle ends. Rome's first great road, the Via Appia, and its first aqueduct are both begun in 312."

### Scene 4 · 1:09 – 1:23 · Hannibal, link by link

**FRAME:** The capture pans to 222–199 BCE: the Second Punic War's brick band under the Republic's, the Macedonian Wars beside it; the moments "Via Flaminia", "Hannibal takes Saguntum" (219-07 BCE), "Hannibal crosses the Alps" (218-10 BCE), "Battle of Lake Trasimene" (217-06 BCE), "Battle of Cannae" (216-07 BCE), "Syracuse falls; Archimedes k…", "Battle of the Metaurus", "Battle of Zama" (202-10 BCE), with arcs joining Saguntum to the Alps, the Alps to Trasimene, Trasimene to Cannae, and Cannae to Zama.

**MOTION:** A pan; the arcs highlight in turn, Saguntum to Zama, on the narration.

**OST:** "Hannibal's war."

**VO:**
"Then Carthage. Hannibal takes Saguntum, crosses the Alps, and destroys Roman armies at Lake Trasimene and at Cannae, each battle linked to the next, until Scipio beats him at Zama."

### Scene 5 · 1:23 – 1:42 · A date in Rome's own calendar

**FRAME:** The same view; with **View mode** on, the Battle of Cannae opens in the reader: "216-07 BCE", the tag `war`, the notes, **Date precision** ("2 August 216 BCE in the pre-Julian Roman calendar, which had drifted from the seasons; its Julian equivalent is uncertain, so it is placed as if it were a Julian date. One review of the evidence (Derow) puts it on 1 July 216 BCE (Julian); others differ."), **Original historical date** "2 August 216 BCE", **Original calendar** "Roman (pre-Julian Republican)", and "Related to: Battle of Lake Trasimene · 217-06 BCE", "Battle of Zama · 202-10 BCE".

**MOTION:** The reader opens; the Date precision and the two Historical dates lines highlight in turn.

**OST:** "Rome's own calendar."

**VO:**
"Open Cannae, and look at the date. The second of August is a day in Rome's own calendar, which had drifted away from the seasons. Historical dates keep it as the source gives it, and Date precision says the real day is uncertain."

### Scene 6 · 1:42 – 2:01 · The eclipse at Pydna

**FRAME:** Zoomed to 172–164 BCE, the Battle of Pydna opens in the reader: "0168-06-19 BCE", the tag `war`, the notes (Aemilius Paullus defeats Perseus; a lunar eclipse the night before), **Date precision** ("Fixed by a lunar eclipse on the night before the battle, astronomically 21 June 168 BCE (Julian). Livy dates the eclipse to the night of 3–4 September in the Roman calendar of the day, which was then about two and a half months ahead of the seasons. …"), **Original historical date** "22 June 168 BCE (Julian); the eclipse before it fell on 4 September in the Roman calendar", **Original calendar** "Julian", and "Related to: Macedonian Wars". Beside the frame, the infographic layer draws a small calendar strip: "Livy: 4 September" and "the sky: 21 June", joined by a bracket, "~2½ months".

**MOTION:** The reader opens; the Date precision line highlights; the calendar strip draws in, the bracket last.

**OST:** "The sky fixes the day."

**VO:**
"Sometimes the sky settles it. The night before the Battle of Pydna, in 168 BCE, the Moon was eclipsed. Livy puts the eclipse in early September. Astronomers put it on the twenty-first of June. Rome's calendar had run two and a half months ahead."

### Scene 7 · 2:01 – 2:11 · The Republic tears itself apart

**FRAME:** The capture zooms out and pans to 140–25 BCE: the Roman Republic's band with the Social War, Spartacus's revolt, the Gallic Wars, Caesar's civil war and the green Second Triumvirate beneath it; the moments "Gaius Gracchus killed", "Marius consul", "Battle of Vercellae", "Citizenship for the Italians", "Sulla marches on Rome", "Sulla dictator", "Spartacus defeated", "Pompey clears the seas of pir…", "The First Triumvirate", "Theatre of Pompey", and summaries from 63 to 30 BCE.

**MOTION:** A fast pan (about 2 s) that settles as the narration reaches the Rubicon.

**OST:** "Gracchi to Caesar."

**VO:**
"From 133 BCE the Republic tears itself apart: the Gracchi, Marius and Sulla, Spartacus, Pompey, Cicero. In 49, Caesar crosses the Rubicon."

---

## ACT 3 · EMPIRE (2:11 – 3:16)

### Scene 8 · 2:11 – 2:33 · The Ides of March

**FRAME:** The capture zooms to June 46 BCE – January 42 BCE: Caesar's civil war ending and the Second Triumvirate beginning under the Republic's band; the moments "The Julian calendar" and the Battle of Munda at the left, Cicero killed at the right. With **View mode** on, "Caesar assassinated" opens in the reader: "0044-03-13 BCE", the tag `politics`, the notes, **Date precision** ("Ides of March (15 March) 44 BCE, Julian calendar. The timeline's Gregorian line shows it 2 days earlier. …"), **Original historical date** "Ides of March (15 March) 44 BCE", **Original calendar** "Julian", its sources (Wikipedia and Suetonius), and "Related to: Cicero killed · 0043-12-05 BCE", "Battle of Philippi · 0042-10-21 BCE", "Theatre of Pompey".

**MOTION:** A zoom; "The Julian calendar" pulses on "first of January"; the reader opens; the Historical dates lines highlight; a pointer rests on Related to.

**OST:** "The Ides of March, 44 BCE."

**VO:**
"Caesar reforms the calendar, and from the first of January, 45 BCE, Roman days are Julian days. So the most famous of them is fixed: the Ides of March, 44 BCE. Caesar is killed in the Senate, and the reader links on to Cicero's death and Philippi."

### Scene 9 · 2:33 – 2:56 · Augustus to Marcus Aurelius

**FRAME:** The capture zooms out to 30 BCE – 200 CE: the Principate's navy band; beneath it the grey Julio-Claudian, Flavian and Nerva–Antonine dynasties, the ochre reigns of Augustus, Tiberius, Caligula, Claudius, Nero, Trajan, Hadrian and Marcus Aurelius, the brick First Jewish–Roman War, Dacian Wars and Marcomannic Wars; the moments "Virgil dies; the Aeneid", "Ara Pacis consecrated", "Augustus dies", "Jesus crucified", "Great Fire of Rome", a summary at 80 CE (Vesuvius buries Pompeii and the Colosseum opens), "Domitian assassinated", "The empire's greatest extent", "The Pantheon rebuilt", "Antonine Plague", "Meditations of Marcus Aurelius", "Commodus killed".

**MOTION:** A zoom out with a slow pan; the dynasty bands highlight in turn; the summary at 80 CE pulses on "a year after".

**OST:** "The emperors."

**VO:**
"Thirteen years later, Actium. Octavian becomes Augustus, and the emperors begin: the Julio-Claudians; the Flavians, who open the Colosseum a year after Vesuvius buries Pompeii; and the Antonines: Trajan, with the empire at its greatest extent, Hadrian and his wall, Marcus Aurelius. And Virgil, Livy and Tacitus write the Rome we read."

### Scene 10 · 2:56 – 3:16 · One thread: Roman law

**FRAME:** Zoomed out to 800 BCE – 600 CE. **Separate by tags** with "law" chosen: a track labelled "Tagged law" rises above "Everything else", holding the green Conflict of the Orders band, a summary of two at 448 BCE (the Twelve Tables and the Lex Canuleia), "Licinian–Sextian laws", "Lex Hortensia", "Citizenship for the Italians" (90 BCE), a summary of two (the Lex Gabinia and the Julian calendar), "Citizenship for all free men" (212 CE), "Decius orders sacrifices", a summary of three around 307 CE (prices, persecution, the Edict of Milan), "Edict of Thessalonica", "Justinian's Code" (529 CE) and Justinian's purple band. The infographic layer draws a thin bracket between the two citizenship moments: "301 years".

**MOTION:** The tagged moments lift into their own track; the bracket draws on "every free man".

**OST:** "One thread: the law."

**VO:**
"Separate by tags, choose law, and one thread runs through all of it: the Twelve Tables; citizenship for the Italians in 90 BCE, and for every free man in 212; the Edict of Milan; and Justinian's Code, through which Roman law reached modern Europe."

---

## ACT 4 · THE FALL, AND WHAT DIDN'T FALL (3:16 – 4:03)

### Scene 11 · 3:16 – 3:31 · Crisis and Constantine

**FRAME:** Rejoined, and zoomed to 230–480 CE: the Principate ending and the late empire (Dominate) beginning, the green Crisis of the Third Century and Tetrarchy bands, the ochre reigns of Diocletian, Constantine and Theodosius I, the purple Eastern Roman Empire and navy Western Roman Empire starting together at 395; the moments "Decius orders sacrifices", "Valerian captured by Persia", "The Tetrarchy", "Constantine acclaimed at York", a summary of three at 314 CE (Milvian Bridge, Edict of Milan, Arch of Constantine), "Council of Nicaea", "Constantinople dedicated", "Constantine dies", "Julian dies in Persia".

**MOTION:** A pan; the Tetrarchy band highlights, then Constantine's, then the two bands that start at 395.

**OST:** "Constantine."

**VO:**
"The third century nearly breaks the empire. Diocletian shares it among four emperors. Constantine wins at the Milvian Bridge, grants Christians freedom of worship, and founds Constantinople. In 395 the empire divides for good."

### Scene 12 · 3:31 – 3:44 · The end in the West

**FRAME:** The capture zooms to 390–480 CE: the Western Roman Empire's navy band ending at 476 above the Eastern Empire's purple band, which runs on past the frame's right edge; the moments "The Rhine crossed", "Visigoths sack Rome" (410-08 CE), "Augustine begins The City of…", "Vandals take Carthage", "Vandals sack Rome" (455-06 CE), and "1 moment · 1 duration" at 476 (Romulus Augustulus deposed, and his short reign).

**MOTION:** A zoom that eases to a stop at 476, where the western band ends.

**OST:** "476."

**VO:**
"In the West the end comes fast. The Visigoths sack Rome in 410, the Vandals in 455, and in 476 the last western emperor, a boy called Romulus Augustulus, is deposed."

### Scene 13 · 3:44 – 3:55 · Nearly a thousand years more

**FRAME:** The capture zooms out to 360–1480 CE: the western band a short stub at the left, the purple Eastern Roman (Byzantine) Empire band running almost the width of the frame to "Fall of Constantinople · 1453 CE", with "Crusaders sack Constantinople · 1204 CE" below. The infographic layer adds a bracket under the purple band from 476 to 1453: "977 more years". Then, zoomed to 1440–1460 CE, the Fall of Constantinople opens in the reader: "1453-06 CE", **Original historical date** "29 May 1453 CE", **Original calendar** "Julian", and "Related to: Constantinople dedicated · 330-05 CE", "Crusaders sack Constantinople · 1204-04 CE".

**MOTION:** A continuous zoom out (about 3 s); the bracket draws left to right; a cut to the reader.

**OST:** "Rome lasted until 1453."

**VO:**
"But keep going. The Eastern Empire, ruled from Constantinople, called itself Roman for nearly a thousand years more: until the twenty-ninth of May, 1453."

### Scene 14 · 3:55 – 4:03 · Your class's timeline

**FRAME:** The capture shrinks to the left half. On the right, three short lines with icons: "Read it: no account needed", "Build one: an era, a dynasty, a unit", "Share it: a link, or embedded in your class page". End card: "timescale.info/athan/rome", and the source: "github.com/openchronology/timeline-app".

**MOTION:** The lines tick in; the end card rises and holds.

**OST:** "Make your class's timeline."

**VO:**
"Anyone can read it, no account needed. Build one with your class, and share it with a link."

**[END · ~4:03]**

---

## Appendix A · Narration only (for the voice session)

> Here's a timeline we built of ancient Rome: from its legendary founding in 753 BCE, through the kings, the Republic and the Empire, to the last emperor in the West, in 476. Eras, dynasties, reigns and wars are bands; laws, battles, buildings and books are moments, each linked to the article it draws on.
>
> Start with the kings: seven of them, in Roman tradition, over nearly two and a half centuries. Open the founding, and the timeline says what it is: legend. 753 is one Roman scholar's reckoning, Varro's, and the twenty-first of April was kept as Rome's birthday.
>
> In 509 BCE the last king is driven out, and two consuls, elected every year, take his place. For two centuries the plebeians struggle with the patricians for power: the Twelve Tables write the law down, and in 287 the struggle ends. Rome's first great road, the Via Appia, and its first aqueduct are both begun in 312.
>
> Then Carthage. Hannibal takes Saguntum, crosses the Alps, and destroys Roman armies at Lake Trasimene and at Cannae, each battle linked to the next, until Scipio beats him at Zama.
>
> Open Cannae, and look at the date. The second of August is a day in Rome's own calendar, which had drifted away from the seasons. Historical dates keep it as the source gives it, and Date precision says the real day is uncertain.
>
> Sometimes the sky settles it. The night before the Battle of Pydna, in 168 BCE, the Moon was eclipsed. Livy puts the eclipse in early September. Astronomers put it on the twenty-first of June. Rome's calendar had run two and a half months ahead.
>
> From 133 BCE the Republic tears itself apart: the Gracchi, Marius and Sulla, Spartacus, Pompey, Cicero. In 49, Caesar crosses the Rubicon.
>
> Caesar reforms the calendar, and from the first of January, 45 BCE, Roman days are Julian days. So the most famous of them is fixed: the Ides of March, 44 BCE. Caesar is killed in the Senate, and the reader links on to Cicero's death and Philippi.
>
> Thirteen years later, Actium. Octavian becomes Augustus, and the emperors begin: the Julio-Claudians; the Flavians, who open the Colosseum a year after Vesuvius buries Pompeii; and the Antonines: Trajan, with the empire at its greatest extent, Hadrian and his wall, Marcus Aurelius. And Virgil, Livy and Tacitus write the Rome we read.
>
> Separate by tags, choose law, and one thread runs through all of it: the Twelve Tables; citizenship for the Italians in 90 BCE, and for every free man in 212; the Edict of Milan; and Justinian's Code, through which Roman law reached modern Europe.
>
> The third century nearly breaks the empire. Diocletian shares it among four emperors. Constantine wins at the Milvian Bridge, grants Christians freedom of worship, and founds Constantinople. In 395 the empire divides for good.
>
> In the West the end comes fast. The Visigoths sack Rome in 410, the Vandals in 455, and in 476 the last western emperor, a boy called Romulus Augustulus, is deposed.
>
> But keep going. The Eastern Empire, ruled from Constantinople, called itself Roman for nearly a thousand years more: until the twenty-ninth of May, 1453.
>
> Anyone can read it, no account needed. Build one with your class, and share it with a link.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                          | Source                                                                                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | The sample: 133 moments, 49 durations, 62 relationships                                                                                                        | `node publicity/video/samples/build.mjs`                                                                                                                                                                                                         |
| 1     | Founding 753 BCE (legendary, Varronian); Romulus Augustulus deposed 476 CE                                                                                     | [Founding of Rome](https://en.wikipedia.org/wiki/Founding_of_Rome); [Romulus Augustulus](https://en.wikipedia.org/wiki/Romulus_Augustulus)                                                                                                       |
| 2     | Seven kings by tradition, 753–509 BCE (244 years); 753 is Varro's date (others 748, 728); 21 April, the Parilia, kept as Rome's birthday                       | [Roman Kingdom](https://en.wikipedia.org/wiki/Roman_Kingdom); [Founding of Rome](https://en.wikipedia.org/wiki/Founding_of_Rome)                                                                                                                 |
| 2     | **Date precision** comes from the **Dating context** plugin; **Historical dates** keeps the source's date and calendar                                         | [Plugins: dating and historical annotations](../docs/plugins.md#dating-and-historical-annotations)                                                                                                                                               |
| 3     | Kings expelled and two annual consuls, 509 BCE (traditional); Conflict of the Orders 494–287 BCE; Twelve Tables 451–450 BCE; Lex Hortensia 287 BCE             | [Roman consul](https://en.wikipedia.org/wiki/Roman_consul); [Conflict of the Orders](https://en.wikipedia.org/wiki/Conflict_of_the_Orders); [Twelve Tables](https://en.wikipedia.org/wiki/Twelve_Tables)                                         |
| 3     | Via Appia and Aqua Appia, Rome's first aqueduct, both begun by Appius Claudius Caecus in 312 BCE                                                               | [Appian Way](https://en.wikipedia.org/wiki/Appian_Way); [Aqua Appia](https://en.wikipedia.org/wiki/Aqua_Appia)                                                                                                                                   |
| 4     | Saguntum 219, the Alps 218, Trasimene 217, Cannae 216, Zama 202 BCE (Scipio)                                                                                   | [Second Punic War](https://en.wikipedia.org/wiki/Second_Punic_War); [Battle of Zama](https://en.wikipedia.org/wiki/Battle_of_Zama)                                                                                                               |
| 5     | Cannae on 2 August 216 BCE in the Roman calendar (Macrobius after Quadrigarius); Julian equivalent uncertain (Derow: 1 July)                                   | [Battle of Cannae](https://en.wikipedia.org/wiki/Battle_of_Cannae)                                                                                                                                                                               |
| 6     | Lunar eclipse the night before Pydna, astronomically 21 June 168 BCE (Julian); Livy's date 3–4 September (Roman); "two and a half months" is our rounding      | [Battle of Pydna](https://en.wikipedia.org/wiki/Battle_of_Pydna); [Gaius Sulpicius Gallus](https://en.wikipedia.org/wiki/Gaius_Sulpicius_Gallus); [Battle of Cannae: Date](https://en.wikipedia.org/wiki/Battle_of_Cannae)                       |
| 7     | Tiberius Gracchus killed 133 BCE; Marius, Sulla, Spartacus, Pompey, Cicero; the Rubicon, January 49 BCE                                                        | [Tiberius Gracchus](https://en.wikipedia.org/wiki/Tiberius_Gracchus); [Crossing the Rubicon](https://en.wikipedia.org/wiki/Crossing_the_Rubicon)                                                                                                 |
| 8     | Julian calendar from 1 January 45 BCE (46 BCE had 445 days); Caesar killed on 15 March 44 BCE at a Senate meeting in the Curia of Pompey                       | [Julian calendar](https://en.wikipedia.org/wiki/Julian_calendar); [Assassination of Julius Caesar](https://en.wikipedia.org/wiki/Assassination_of_Julius_Caesar)                                                                                 |
| 8     | Leap years misapplied until 8 BCE, so days 45–8 BCE may differ from the proleptic Julian; the reader lists **Related to** and opens the chosen entity next     | [Julian calendar](https://en.wikipedia.org/wiki/Julian_calendar); [Guide: reading a timeline](../docs/guide.md#reading-a-timeline)                                                                                                               |
| 9     | Actium 31 BCE; Augustus 27 BCE; Vesuvius 79 CE; the Colosseum opened by Titus in 80 CE; greatest extent under Trajan (117); Hadrian's Wall (122)               | [Battle of Actium](https://en.wikipedia.org/wiki/Battle_of_Actium); [Colosseum](https://en.wikipedia.org/wiki/Colosseum); [Trajan](https://en.wikipedia.org/wiki/Trajan); [Hadrian's Wall](https://en.wikipedia.org/wiki/Hadrian%27s_Wall)       |
| 9     | Virgil's Aeneid (d. 19 BCE), Livy's history (begun c. 27–25 BCE), Tacitus's Annals (c. 116 CE)                                                                 | [Virgil](https://en.wikipedia.org/wiki/Virgil); [Livy](https://en.wikipedia.org/wiki/Livy); [Annals](<https://en.wikipedia.org/wiki/Annals_(Tacitus)>)                                                                                           |
| 10    | **Separate by tags** moves tagged events to a track above                                                                                                      | [Tags: separating](../docs/tags.md#separating-by-tags)                                                                                                                                                                                           |
| 10    | Citizenship for Italians (Lex Julia) 90 BCE; for all free men (Constitutio Antoniniana) 212 CE: 301 years (no year 0); Justinian's Code, 529                   | [Social War](<https://en.wikipedia.org/wiki/Social_War_(91–87_BC)>); [Constitutio Antoniniana](https://en.wikipedia.org/wiki/Constitutio_Antoniniana); [Corpus Juris Civilis](https://en.wikipedia.org/wiki/Corpus_Juris_Civilis)                |
| 11    | Tetrarchy 293; Milvian Bridge 28 October 312; Edict of Milan 313 (freedom of worship); Constantinople dedicated 11 May 330; division at Theodosius's death 395 | [Tetrarchy](https://en.wikipedia.org/wiki/Tetrarchy); [Edict of Milan](https://en.wikipedia.org/wiki/Edict_of_Milan); [Constantinople](https://en.wikipedia.org/wiki/Constantinople); [Theodosius I](https://en.wikipedia.org/wiki/Theodosius_I) |
| 12    | Visigoths sack Rome 24 August 410; Vandals June 455; Romulus Augustulus deposed by Odoacer 4 September 476                                                     | [Sack of Rome (410)](<https://en.wikipedia.org/wiki/Sack_of_Rome_(410)>); [Sack of Rome (455)](<https://en.wikipedia.org/wiki/Sack_of_Rome_(455)>); [Romulus Augustulus](https://en.wikipedia.org/wiki/Romulus_Augustulus)                       |
| 13    | Constantinople falls 29 May 1453 (Julian); 1453 − 476 = 977 years, "nearly a thousand"                                                                         | [Fall of Constantinople](https://en.wikipedia.org/wiki/Fall_of_Constantinople); [Byzantine Empire](https://en.wikipedia.org/wiki/Byzantine_Empire); our arithmetic                                                                               |
| 14    | Public timelines need no account; links and embeds; accounts are for people 13 and older                                                                       | [FAQ](../docs/faq.md#do-i-need-an-account), [sharing](../docs/sharing.md#embedding), [moderation: ages](../docs/moderation.md#ages)                                                                                                              |

## Appendix C · Questions this audience is likely to ask

1. **Why does the Ides of March read "0044-03-13 BCE" on the line?** The timeline's display is the Gregorian calendar extended back; historians give Roman days in the Julian calendar, which ran two days behind it then. The point on the line is the same day; the Julian date (15 March) is kept under **Historical dates**, and **Date precision** says how far apart the two are.
2. **Then why isn't Cannae converted the same way?** Before 45 BCE Rome used its old calendar, which the priests kept in step with the seasons by adding months, irregularly. For most dates we can't say which Julian day they were, so the sample places them as if they were Julian and says so; only a few, like Pydna's eclipse, can be pinned down.
3. **Is 753 BCE real?** It's the traditional date, Varro's; the kings' reigns are legend. The `legend` tag marks what we know only from tradition, so **Separate by tags** can pull it out. Archaeology shows villages on the Palatine by the 8th century BCE; the sample has that too.
4. **Why does it end in 1453 if Rome fell in 476?** 476 is the traditional end of the empire in the West. The eastern half, which called itself Roman, lasted until the Ottomans took Constantinople in 1453; the sample carries it as an epilogue.
5. **Can my students use it without accounts?** Yes, to read public timelines and to make one in the browser and export it. Students 13 and older can sign up to save to the server.
6. **Can I use this sample?** Yes: import `rome.ochx`, then edit it, or publish it from your own account. Change any date to the one your textbook uses; the sources travel with it.
7. **Can I set it beside another timeline, like ancient Greece?** Yes: **Compare** puts two or more timelines on one shared axis, read-only.
