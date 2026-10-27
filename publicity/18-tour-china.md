# OpenChronology — Tour: China, from the Neolithic to 1949. Script and Storyboard

**Runtime:** ~3:55 (at 140 wpm) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and history teachers, and anyone who has tried to hold Chinese history in their head as a list of dynasties. Teachers will judge it as classroom material, so it must be accurate, calm and careful about what is traditional and what is dated.
**Purpose:** show seven thousand years on one line the way a class would read it: the whole sweep, where the dates begin, the dynasties as bands (and how short some of them were), one thread of ideas and one of inventions pulled out of the rest, a moment read with its sources and its original Julian date, and the last century of the empire to the founding of the People's Republic.

**How it differs:** it's a tour, not a lesson in controls. The history leads and the app follows; each control is named once, in passing, by what it does for the story. It is the first tour to cross from BCE to CE and to keep a date in a second calendar.

**Production notes:**

- Narration is 550 words, about 140 wpm when read, in the voice of a good history teacher: curious, careful with "about" and "by tradition".
- **The timeline is the sample `publicity/video/samples/china.ochx`**, built from `china.mjs`: 122 moments and 12 chapter headings, 40 durations, 45 relationships, a Wikipedia source on each (with the Chinese Text Project for the classics and UNESCO for the listed sites), the Timeline theme in archive colours. Tags: `dynasty`, `ruler`, `war`, `revolution`, `thought`, `writing`, `invention`, `contact`, `archaeology` (and `chapter` on the headings). Colours: navy for dynasties, gold for rulers, brick for wars, orange for uprisings, purple for ideas and writing, green for inventions, olive for the Neolithic cultures.
- Shots are captured from the real editor in full screen (`shots.json` in the video's folder) and shown in a browser frame; the infographic layer adds titles and arrows around the frame, never over the app's own text, and never at the ruler's labels (BCE ruler marks read one year off, e.g. "2001 BCE", issue #340).
- **Readers:** open moments only (the duration reader shows no Sources or Date precision). The reader writes the date to the view's resolution: open a year-dated moment from a view many centuries wide, so it reads "91 BCE", and a day-dated one from a view a year or two wide, so it reads "0868-05-15 CE" (checked in the editor). `open` goes under the shot's `actions`, not `setup`.
- **Accuracy guardrails:**
  - Only well-established facts (Appendix B). Before 841 BCE the dates are the Xia–Shang–Zhou Chronology Project's conventional figures; say "about" for them. The Xia is the traditional first dynasty and its historicity is debated: say so whenever it's on screen.
  - 841 BCE is the earliest year Chinese history dates year by year (Sima Qian's tables), not the first event: say exactly that.
  - Dates to the day before 1582 are converted from the Julian dates in the sources; the reader shows both. Don't call the converted date "the" date.
  - Modern politics stays factual and brief: the line ends at 1949, with two later milestones (1978 and 1997) shown but not discussed beyond one clause.
  - Say "a timeline we built from …" — it isn't presented as a definitive history.

---

## ACT 1 · SEVEN THOUSAND YEARS (0:00 – 1:00)

### Scene 1 · 0:00 – 0:25 · The whole sweep

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: from 5000 BCE at the left to the twentieth century at the right. Olive bands for the Yangshao, Liangzhu, Longshan and Erlitou cultures; the dashed band of the Xia (traditional); then a row of navy bands, Shang, Western Zhou, Eastern Zhou, Han, Jin, Tang, Song, Ming, Qing, crowding together towards the right. Summaries sit along the axis; the heading "The first dynasties" shows at this distance. To the left of the frame, a vertical strip of three chips: "122 moments", "40 durations", "45 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's numbers; a soft bracket draws under the right-hand half on "the last two and a half thousand".

**OST:** "Seven thousand years, one line."

**VO:**
"Here's a timeline we built of China, from the first farming villages to the founding of the People's Republic in 1949. Dynasties, reigns and wars are bands; people, books, inventions and battles are moments, each with the source it draws on. And almost everything with a name is crowded into the last two and a half thousand years."

### Scene 2 · 0:25 – 1:00 · Where the dates begin

**FRAME:** The capture zooms into 2200–700 BCE. The Longshan and Erlitou bands, the dashed **Xia (traditional)** band above Erlitou, then **Shang** and **Western Zhou** in navy. Moments named in turn: Palaces and bronze at Erlitou, The Shang at Zhengzhou, Pan Geng moves to Yin, Oracle bones, Battle of Muye. A callout beside the dashed band: "Traditional · not yet confirmed by writing". Then, still at this distance, with **View mode** on, "841 BCE: the first dated year" opens in the reader: its date, its note, **Date precision: Year**, its two sources, and "Related to: Records of the Grand Historian".

**MOTION:** A continuous zoom; the dashed band pulses once on "tradition"; the reader opens over the app on "841".

**OST:** "Where the dates begin."

**VO:**
"Zoom into the second millennium BCE. Tradition says the first dynasty was the Xia; no writing of its own has been found, so it's drawn dashed. The Shang are the first we can read, in their oracle bones, questions carved on bone and shell. The early dates are the conventional ones, and approximate. The first year Chinese history can date year by year is 841 BCE."

---

## ACT 2 · A HUNDRED SCHOOLS AND ONE EMPIRE (1:00 – 2:00)

### Scene 3 · 1:00 – 1:22 · The longest and the shortest

**FRAME:** The view from 1100 BCE to 50 CE. The **Western Zhou** and **Eastern Zhou** bands run most of the width, with **Spring and Autumn period** and **Warring States** beneath the Eastern Zhou; then the short **Qin** band, and **Han** beginning at the right with the gold **Han Wudi** band under it. Two bracket callouts above the frame: "Zhou · ~790 years" and "Qin · 15".

**MOTION:** A slow pan left to right; each bracket draws as its number is said.

**OST:** "Eight centuries, then fifteen years."

**VO:**
"The Zhou last about eight centuries, while its states grow into kingdoms and go to war. Then, in 221 BCE, Qin conquers the last of them, and its king becomes Qin Shi Huang, the First Emperor. His dynasty lasts fifteen years. The Han that follows lasts four hundred."

### Scene 4 · 1:22 – 1:44 · One thread: ideas

**FRAME:** Back to the whole sweep. **Separate by tags** with "thought" chosen: a track labelled "Tagged thought" rises above the rest, holding Confucius born, Laozi and the Daodejing, Sunzi's Art of War, the Analects, Mencius, the burning of the books, the Imperial Academy, the examinations, Zhu Xi's Four Books, and at the far right the examinations abolished in 1905.

**MOTION:** The tagged moments lift into their own track; a pointer traces it left to right as the names are read.

**OST:** "Pull out one thread."

**VO:**
"Pull one thread out of the rest. Separate by tags, choose thought, and the ideas get a track of their own: Confucius, Laozi and Sunzi in the same troubled centuries, the books burned under Qin, Confucian learning made the state's under the Han, and examinations for office that last until 1905."

### Scene 5 · 1:44 – 2:00 · Read a moment

**FRAME:** The view from 700 BCE to 500 CE and, in **View mode**, "Records of the Grand Historian" opens in the reader: "91 BCE", the tag "writing", the note on Sima Qian, **Date precision: Approximate**, two sources (its Wikipedia article and the Chinese Text Project's text), and "Related to: 841 BCE: the first dated year".

**MOTION:** The reader opens over the app; a pointer rests on the related entry.

**OST:** "Every moment has its sources."

**VO:**
"Open a moment to read it. Sima Qian's Records of the Grand Historian: what it is, how sure the date is, where it comes from, and what it's linked to. His tables are where 841 comes from."

---

## ACT 3 · DIVISION AND INVENTION (2:00 – 2:58)

### Scene 6 · 2:00 – 2:24 · Apart and together

**FRAME:** The view from 250 BCE to 950 CE. **Han** across the left third, then **Three Kingdoms**, **Jin** and **Northern and Southern dynasties**; the short **Sui** band; then **Tang**, with Wu Zetian takes the throne and An Lushan rebels above it. A callout over the gap between Han and Sui: "~370 years apart".

**MOTION:** A slow pan; the callout draws on "three and a half centuries"; the Sui band pulses once on "again".

**OST:** "Divided, and joined again."

**VO:**
"After the Han, China splits apart for most of four centuries: the Three Kingdoms, the Jin, dynasties north and south. Then it happens again. The Sui reunite it in 589, dig the Grand Canal, and are gone within thirty years. The Tang that follows lasts nearly three centuries, and has the only woman to rule as emperor in her own name, Wu Zetian."

### Scene 7 · 2:24 – 2:58 · One thread: inventions, and two calendars

**FRAME:** The view from 400 BCE to 1200 CE. **Separate by tags** with "invention": Dujiangyan, Cai Lun's paper, Zhang Heng's seismoscope, the Grand Canal, the Diamond Sutra printed, paper money, Bi Sheng's movable type, gunpowder formulas written down, the magnetic needle. Then the view narrows to 867–869 and "The Diamond Sutra printed" opens in the reader: **0868-05-15 CE**, the note, **Date precision: Day, as the sources give it in the Julian calendar**, **Original historical date: 11 May 868**, **Original calendar: Julian**. A callout beside the reader: "Julian 11 May = Gregorian 15 May".

**MOTION:** The tagged moments lift into their track; the zoom; the reader opens; the callout's two dates draw in turn.

**OST:** "Two calendars, one moment."

**VO:**
"Choose invention instead: irrigation, paper, a seismoscope, then the Song's paper money, movable type, gunpowder written down, and the compass needle. And here is the oldest printed book that carries its date, the Diamond Sutra. Its sources give 11 May 868 in the Julian calendar. The line is Gregorian throughout, so it sits on the 15th, and the reader keeps both."

---

## ACT 4 · EMPIRE TO REPUBLIC (2:58 – 3:55)

### Scene 8 · 2:58 – 3:18 · Mongols and Ming

**FRAME:** The view from 1260 to 1460. The **Yuan** band and gold **Kublai Khan**; Battle of Yamen; Ming founded; the gold **Yongle Emperor** band with **Zheng He's voyages** beneath it; Yongle Encyclopedia; Beijing and the Forbidden City; Tumu crisis, and **The Great Wall rebuilt** band beginning at it. Relationship arcs join the Yongle Emperor to the Forbidden City and to Zheng He's first voyage.

**MOTION:** A slow pan; the arcs from the Yongle Emperor brighten as each is named.

**OST:** "Fleets, palaces, walls."

**VO:**
"Kublai Khan's Yuan rules all of China from 1279. The Ming drive the Mongols out, and the Yongle Emperor sends Zheng He's fleets as far as East Africa and moves the capital to Beijing, to the Forbidden City. After a Ming emperor is captured at Tumu, the dynasty builds the Great Wall we know, in brick and stone."

### Scene 9 · 3:18 – 3:42 · The last emperors

**FRAME:** The view from 1830 to 1955. The navy **Qing** band, the brick **First Opium War** and **Second Opium War**, the orange **Taiping Rebellion** between them, the gold **Cixi, regent** band; Treaty of Nanking, Old Summer Palace burned, Treaty of Shimonoseki, Boxer Protocol; Wuchang uprising, Republic of China proclaimed, The last emperor abdicates; the **Republic of China (mainland)** band with **Civil War** and **War with Japan** overlapping above and below it; People's Republic proclaimed at the right. An arc leaves the Treaty of Nanking off the right edge of the frame.

**MOTION:** A slow pan; the overlapping bands are bracketed in turn; the arc from Nanking draws last.

**OST:** "1839 to 1949."

**VO:**
"Then a century of wars: two Opium Wars, the Taiping Rebellion between them, one of the deadliest wars in history, and Cixi holding power for nearly fifty years. In 1912 the last emperor abdicates. The Republic's civil war, paused but never settled, runs on either side of eight years of war with Japan, and on 1 October 1949 Mao Zedong proclaims the People's Republic. The link from the Treaty of Nanking runs on to Hong Kong's return, in 1997."

### Scene 10 · 3:42 – 3:55 · Your class's timeline

**FRAME:** The capture shrinks to the left half, back at the whole sweep. On the right, three short lines with icons: "Read it: no account needed", "Every moment: its sources and its dating", "Make one: as a class, or one each". End card: "timescale.info/athan/china", and the source: "github.com/openchronology/timeline-app".

**MOTION:** The lines tick in; the end card rises and holds.

**OST:** "Seven thousand years, one line."

**VO:**
"Anyone can read a public timeline like this, no account needed. Check every date against its source, or build your own with your class."

**[END · ~3:55]**

---

## Appendix A · Narration only (for the voice session)

> Here's a timeline we built of China, from the first farming villages to the founding of the People's Republic in 1949. Dynasties, reigns and wars are bands; people, books, inventions and battles are moments, each with the source it draws on. And almost everything with a name is crowded into the last two and a half thousand years.
>
> Zoom into the second millennium BCE. Tradition says the first dynasty was the Xia; no writing of its own has been found, so it's drawn dashed. The Shang are the first we can read, in their oracle bones, questions carved on bone and shell. The early dates are the conventional ones, and approximate. The first year Chinese history can date year by year is 841 BCE.
>
> The Zhou last about eight centuries, while its states grow into kingdoms and go to war. Then, in 221 BCE, Qin conquers the last of them, and its king becomes Qin Shi Huang, the First Emperor. His dynasty lasts fifteen years. The Han that follows lasts four hundred.
>
> Pull one thread out of the rest. Separate by tags, choose thought, and the ideas get a track of their own: Confucius, Laozi and Sunzi in the same troubled centuries, the books burned under Qin, Confucian learning made the state's under the Han, and examinations for office that last until 1905.
>
> Open a moment to read it. Sima Qian's Records of the Grand Historian: what it is, how sure the date is, where it comes from, and what it's linked to. His tables are where 841 comes from.
>
> After the Han, China splits apart for most of four centuries: the Three Kingdoms, the Jin, dynasties north and south. Then it happens again. The Sui reunite it in 589, dig the Grand Canal, and are gone within thirty years. The Tang that follows lasts nearly three centuries, and has the only woman to rule as emperor in her own name, Wu Zetian.
>
> Choose invention instead: irrigation, paper, a seismoscope, then the Song's paper money, movable type, gunpowder written down, and the compass needle. And here is the oldest printed book that carries its date, the Diamond Sutra. Its sources give 11 May 868 in the Julian calendar. The line is Gregorian throughout, so it sits on the 15th, and the reader keeps both.
>
> Kublai Khan's Yuan rules all of China from 1279. The Ming drive the Mongols out, and the Yongle Emperor sends Zheng He's fleets as far as East Africa and moves the capital to Beijing, to the Forbidden City. After a Ming emperor is captured at Tumu, the dynasty builds the Great Wall we know, in brick and stone.
>
> Then a century of wars: two Opium Wars, the Taiping Rebellion between them, one of the deadliest wars in history, and Cixi holding power for nearly fifty years. In 1912 the last emperor abdicates. The Republic's civil war, paused but never settled, runs on either side of eight years of war with Japan, and on 1 October 1949 Mao Zedong proclaims the People's Republic. The link from the Treaty of Nanking runs on to Hong Kong's return, in 1997.
>
> Anyone can read a public timeline like this, no account needed. Check every date against its source, or build your own with your class.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                 | Source                                                                                                                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The sample: 122 moments (and 12 headings), 40 durations, 45 relationships                                                                                             | `node publicity/video/samples/build.mjs` (134 moments counting the headings)                                                                                                                                                                                                                                            |
| 1     | From the Neolithic (Yangshao, from about 5000 BCE; Hemudu rice, about 5000–4500 BCE) to 1 October 1949                                                                | [Yangshao culture](https://en.wikipedia.org/wiki/Yangshao_culture), [Hemudu culture](https://en.wikipedia.org/wiki/Hemudu_culture)                                                                                                                                                                                      |
| 2     | The Xia is traditional; no contemporary writing links it to Erlitou; its historicity is debated                                                                       | [Xia dynasty](https://en.wikipedia.org/wiki/Xia_dynasty), [Erlitou culture](https://en.wikipedia.org/wiki/Erlitou_culture)                                                                                                                                                                                              |
| 2     | Conventional dates: Xia c. 2070–1600, Shang c. 1600–1046, Western Zhou 1046–771 BCE; Wu Ding from 1250; Muye 1046 BCE                                                 | [Xia–Shang–Zhou Chronology Project](https://en.wikipedia.org/wiki/Xia%E2%80%93Shang%E2%80%93Zhou_Chronology_Project)                                                                                                                                                                                                    |
| 2     | Oracle bones: the earliest substantial body of Chinese writing, from Wu Ding's reign at Yin                                                                           | [Oracle bone](https://en.wikipedia.org/wiki/Oracle_bone), [Yinxu](https://en.wikipedia.org/wiki/Yinxu)                                                                                                                                                                                                                  |
| 2, 5  | 841 BCE (the Gonghe Regency, 841–828) is the earliest point of Sima Qian's year-by-year chronology                                                                    | [Gonghe Regency](https://en.wikipedia.org/wiki/Gonghe_Regency); the tables in the [Shiji](https://ctext.org/shiji)                                                                                                                                                                                                      |
| 3     | Zhou 1046–256 BCE: about 790 years; Qin 221–206 BCE: 15 years; Han 202 BCE–220 CE: about four centuries (421 years, with Wang Mang's Xin, 9–23 CE, in the middle)     | [Zhou dynasty](https://en.wikipedia.org/wiki/Zhou_dynasty), [Qin dynasty](https://en.wikipedia.org/wiki/Qin_dynasty), [Han dynasty](https://en.wikipedia.org/wiki/Han_dynasty)                                                                                                                                          |
| 3     | Ying Zheng, king of Qin, takes the title Qin Shi Huang (First Emperor) in 221 BCE                                                                                     | [Qin Shi Huang](https://en.wikipedia.org/wiki/Qin_Shi_Huang)                                                                                                                                                                                                                                                            |
| 4     | Confucius 551–479 BCE; Laozi by tradition his older contemporary; Sunzi c. 500 BCE (text later); books burned 213 BCE; Imperial Academy 124 BCE; exams abolished 1905 | `china.mjs` sources: [Confucius](https://en.wikipedia.org/wiki/Confucius), [Laozi](https://en.wikipedia.org/wiki/Laozi), [Imperial examination](https://en.wikipedia.org/wiki/Imperial_examination)                                                                                                                     |
| 5     | Records of the Grand Historian completed about 91 BCE by Sima Qian                                                                                                    | [Shiji](https://en.wikipedia.org/wiki/Shiji)                                                                                                                                                                                                                                                                            |
| 6     | Division from 220 (with the Jin's brief reunion, 280–311) to the Sui conquest of Chen in 589; Sui 581–618; Tang 618–907; Wu Zetian emperor 690–705                    | [Sui dynasty](https://en.wikipedia.org/wiki/Sui_dynasty), [Tang dynasty](https://en.wikipedia.org/wiki/Tang_dynasty), [Wu Zetian](https://en.wikipedia.org/wiki/Wu_Zetian)                                                                                                                                              |
| 6     | The gap between the end of the Han (220) and the Sui reunion (589): 369 years                                                                                         | Our arithmetic from the two dates                                                                                                                                                                                                                                                                                       |
| 7     | Paper 105; seismoscope 132; jiaozi taken over by the state 1023; movable type 1041–48; gunpowder formulas 1044; Shen Kuo's needle 1088                                | `china.mjs` sources: [Cai Lun](https://en.wikipedia.org/wiki/Cai_Lun), [Jiaozi](<https://en.wikipedia.org/wiki/Jiaozi_(currency)>), [Wujing Zongyao](https://en.wikipedia.org/wiki/Wujing_Zongyao), [Dream Pool Essays](https://en.wikipedia.org/wiki/Dream_Pool_Essays)                                                |
| 7     | The Diamond Sutra: the oldest dated printed book, 15th day, 4th month, 9th year of Xiantong = 11 May 868 (Julian)                                                     | [Diamond Sutra](https://en.wikipedia.org/wiki/Diamond_Sutra)                                                                                                                                                                                                                                                            |
| 7     | 11 May 868 Julian is 15 May 868 proleptic Gregorian (the calendars differ by 4 days in the 9th century)                                                               | Our conversion (`julian()` in `china.mjs`, through the Julian day number)                                                                                                                                                                                                                                               |
| 8     | Yamen 1279 ends the Song; Ming 1368; Yongle 1402–1424; Zheng He's seven voyages 1405–1433 reach East Africa; Beijing capital 1420; Tumu 1449                          | [Battle of Yamen](https://en.wikipedia.org/wiki/Battle_of_Yamen), [Yongle Emperor](https://en.wikipedia.org/wiki/Yongle_Emperor), [Zheng He](https://en.wikipedia.org/wiki/Zheng_He), [Tumu Crisis](https://en.wikipedia.org/wiki/Tumu_Crisis)                                                                          |
| 8     | Most of the Great Wall seen today is the Ming's, in brick and stone, built up after 1449                                                                              | [Great Wall of China](https://en.wikipedia.org/wiki/Great_Wall_of_China), [UNESCO 438](https://whc.unesco.org/en/list/438/)                                                                                                                                                                                             |
| 9     | Opium Wars 1839–42 and 1856–60; Taiping Rebellion 1850–64, 20–30 million dead; Cixi regent from 1861 and in power to 1908 (about 47 years)                            | [First Opium War](https://en.wikipedia.org/wiki/First_Opium_War), [Taiping Rebellion](https://en.wikipedia.org/wiki/Taiping_Rebellion), [Cixi](https://en.wikipedia.org/wiki/Empress_Dowager_Cixi)                                                                                                                      |
| 9     | Abdication 12 February 1912; war with Japan 1937–45; civil war 1927–49; People's Republic proclaimed 1 October 1949; Hong Kong handed over 1 July 1997                | [Puyi](https://en.wikipedia.org/wiki/Puyi), [Second Sino-Japanese War](https://en.wikipedia.org/wiki/Second_Sino-Japanese_War), [Proclamation of the PRC](https://en.wikipedia.org/wiki/Proclamation_of_the_People%27s_Republic_of_China), [Handover of Hong Kong](https://en.wikipedia.org/wiki/Handover_of_Hong_Kong) |
| 10    | Public timelines need no account                                                                                                                                      | [FAQ](../docs/faq.md#do-i-need-an-account)                                                                                                                                                                                                                                                                              |

## Appendix C · Questions this audience is likely to ask

1. **Why does the Xia have a dashed band?** It's marked presumptive (the **Presumptive outline** plugin): the traditional histories name it, but no writing of its own has been found, and whether Erlitou is the Xia is debated. Its dates are the Chronology Project's.
2. **Whose dates are these before 841 BCE?** The Xia–Shang–Zhou Chronology Project's conventional figures (2000), which many textbooks use; they've been criticised, and other scholars give the Zhou conquest as 1045 or another year. Each moment's **Date precision** says how far to trust it.
3. **Why 15 May for the Diamond Sutra, when the books say 11 May?** The books give the Julian date. The timeline's display is the Gregorian calendar extended backwards, so every date shares one calendar and the gaps between them are true; **Historical dates** keeps the Julian date beside it. Years given only as years sit on 1 January.
4. **Does it say BC or BCE?** BCE and CE. 1 BCE is followed by 1 CE, as historians count; there's no year zero in the labels.
5. **Can I use this sample?** Yes: import `china.ochx`, then edit it, or publish it from your own account. Add your own moments (a reading, a primary source) and link them to the ones here.
6. **Why does it stop at 1949?** It's a tour of the dynasties and the end of the empire; the two later moments are milestones only. A class can extend it.
