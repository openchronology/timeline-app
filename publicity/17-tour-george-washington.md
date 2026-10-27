# OpenChronology — Tour: George Washington, 1732–1799. Script and Storyboard

**Runtime:** ~3:50 (narration ~3:40 at 140 wpm, plus room for the zooms; to be confirmed by the scratch narration's cut) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and history teachers, and anyone who knows the name better than the life. Teachers will judge it as classroom material, so it must be accurate and calm, and it must treat slavery at Mount Vernon plainly, by name, as part of the life rather than a footnote.
**Purpose:** tour one person's whole life on one line: the Virginia boyhood, the young officer, eight and a half years in command, the first presidency, Mount Vernon and the people enslaved there, and his death. Along the way, show what a biography gains on a timeline: lifetime stages, homes and offices as bands, a date kept in two calendars, one thread pulled out of the rest, and a moment read with its sources and links.

**How it differs:** Video 5 tours a country; this tours a life, so the bands are the subject: where he lived, what he commanded, which office he held, and how they overlap. It's also the first tour with a date that needs two calendars: his birth, written in the Old Style.

**Production notes:**

- Narration is 515 words, about 3:40 at 140 wpm, in the voice of a good history teacher: curious, never reverent.
- **The timeline is the sample `publicity/video/samples/washington.ochx`**, built from `washington.mjs`: 115 moments (seven of them chapter headings), 40 durations, 40 relationships, each moment with its sources (Wikipedia, the Papers of George Washington on Founders Online, Mount Vernon's research library, the National Park Service), the Timeline theme in archive colours, and the **Moment colors**, **Sources**, **Dating context** and **Historical dates** plugins. Shots are captured from the real editor in full screen with `capture.mjs` (a `shots.json` in the video's folder) and shown in a browser frame; the infographic layer adds titles and arrows around the frame, never over the app's own text.
- **Time display:** Gregorian, at a fixed UTC−5, an approximation of Virginia's local time (the ruler's caption reads "UTC-05:00"; there were no time zones yet). Days sit at local midnight. Dates before September 1752 are converted from the Old Style; each keeps its date as written at the time in **Original historical date**.
- **Capture notes:** open readers from a view at least a year wide, so the reader prints the full date (in a narrow view it shortens it to month and day). Put each `open` under the shot's `actions`, not `setup`. Moments are colored by their first tag; durations by kind (stages of life brown, homes green, offices navy, wars brick, family ochre).
- **Accuracy guardrails:**
  - Only well-established dates (Appendix B). Where the day isn't known (the move to Ferry Farm, his first commission as lieutenant colonel, his resignations in 1754 and 1758), the moment's **Date precision** says so; the narration never gives those days.
  - Say "a timeline we built" — it isn't presented as a definitive history.
  - Slavery is stated as fact, with names where the sources give them: the ten people he inherited at eleven, William Lee, Ona Judge, Hercules (Hercules Posey), the 317 people listed at Mount Vernon in 1799, and the 153 "dower" people neither George nor Martha could legally free. No softening ("servants") and no praise for the will beyond what it did.
  - Durations open in a reader that shows no Sources or Date precision (only moments do), so no shot opens a band to show its sources.

---

## ACT 1 · A VIRGINIA LIFE (0:00 – 1:14)

### Scene 1 · 0:00 – 0:22 · The whole life

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: 1732 at the left, 1802 at the right, summaries along the axis, arcs above it, and the bands below: "George Washington, 1732–1799" on the first row, then Boyhood, Surveying years, Popes Creek, Little Hunting Creek and Ferry Farm, the long Mount Vernon band, Married to Martha, the French and Indian War. To its left, a vertical strip of three chips: "115 moments", "40 durations", "40 links".

**MOTION:** The frame rises into place; the chips tick in on "moment", "bands" and "sources".

**OST:** "One life, on one line."

**VO:**
"Here's a timeline we built of George Washington's life, from his birth in Virginia in 1732 to his death at Mount Vernon in 1799. His homes, commands, offices and wars are bands; everything else is a moment, with the sources it draws on. Chapter headings mark the stages of his life."

### Scene 2 · 0:22 – 0:52 · Born on the eleventh, or the twenty-second

**FRAME:** The capture zooms to 1731–1733; the chapter heading "Youth in Virginia" and "Born at Popes Creek" stand apart. With **View mode** on, Born at Popes Creek opens in the reader: "1732-02-22 CE", the tag family, the note, then the plugin rows: **Date precision** "Gregorian date; Old Style 11 February 1731/32 (the year began on 25 March)", **Original historical date** "11 February 1731/32", **Original calendar** "Julian (Old Style)"; Sources; and "Related to: Britain switches calendars · 1752-09-14 CE". A callout beside the frame, in the look's serif: "11 Feb 1731/32 (O.S.) = 22 Feb 1732".

**MOTION:** A short zoom; the reader opens; the three plugin rows are underlined in turn; the pointer rests on the related entry at "switched".

**OST:** "Two calendars, one date."

**VO:**
"Open his birth, and the date needs a note. Virginia was British, and Britain still used the old Julian calendar, with the year beginning in March. So the day was written as the eleventh of February, 1731. The timeline puts it on today's calendar, the twenty-second of February 1732, and keeps the original beside it, linked to the day in 1752 when Britain switched and eleven days vanished."

### Scene 3 · 0:52 – 1:14 · Youth

**FRAME:** The reader closes; the view is 1731 to 1755. The bands Popes Creek, Little Hunting Creek and Ferry Farm run end to end beneath "Boyhood" and "Surveying years"; above the axis, Move to Ferry Farm, His father dies (in a summary that opens as the view narrows), Surveying for Lord Fairfax (a short band, 1748), Surveyor of Culpeper County, In Barbados, Lawrence dies, Leases Mount Vernon. Arcs link Lawrence names Mount Vernon to Lawrence dies, and Lawrence dies to the lease.

**MOTION:** A slow pan left to right across the boyhood, the summaries splitting into titled moments as it narrows toward 1748–1754.

**OST:** "Ferry Farm to Mount Vernon."

**VO:**
"Zoom into his youth: the move to Ferry Farm, his father's death when he was eleven, his first surveying trip over the Blue Ridge at sixteen, the voyage to Barbados with his brother Lawrence, where George caught smallpox, and Lawrence's death in 1752, which in the end brought him Mount Vernon."

---

## ACT 2 · THE SOLDIER (1:14 – 2:18)

### Scene 4 · 1:14 – 1:36 · The Virginia Regiment

**FRAME:** The view moves on to 1753–1759, the chapter heading "The Virginia Regiment" at the left. The short brick band "Mission to the French" (October 1753 to January 1754), then Jumonville Glen and Surrender at Fort Necessity (drawn apart as the view narrows to 1754), Aide to General Braddock and Braddock's defeat, the navy band "Commanding the Virginia Regiment" from August 1755, and near its end Friendly fire near Loyalhanna and Fort Duquesne taken. The long "French and Indian War" band runs on past the frame's right edge.

**MOTION:** A pan with a brief zoom into the summer of 1754, then out again.

**OST:** "A young officer."

**VO:**
"At twenty-one he carried Virginia's warning to the French in the Ohio Country. The next spring came Jumonville Glen, a skirmish that helped start a world war, then surrender at Fort Necessity, Braddock's defeat on the Monongahela, and command of the Virginia Regiment until Fort Duquesne fell in 1758."

### Scene 5 · 1:36 – 2:04 · Eight and a half years

**FRAME:** The view widens to 1774–1784: the chapter heading "Revolution", and the navy band "Commander-in-chief of the Continental Army" from June 1775 to December 1783, with the brick bands inside its span: Siege of Boston, Losing New York, The Ten Crucial Days, Philadelphia campaign, Valley Forge, The hard winter at Morristown, Siege of Yorktown. The capture then zooms into 18 December 1776 – 10 January 1777: Crossing the Delaware (25 December), Trenton (26 December) and Princeton (3 January) apart on the line, arcs joining them, above "The Ten Crucial Days" band; then back out to Valley Forge, Monmouth and Surrender at Yorktown.

**MOTION:** A widen, a long zoom into the ten days (about 6 seconds), a hold, and a zoom back out; a counter at the frame's edge: "8½ years → 10 days".

**OST:** "Eight and a half years in command."

**VO:**
"Then the longest band of his career: eight and a half years in command of the Continental Army. Inside it, the siege of Boston, the loss of New York, and the Ten Crucial Days: the crossing of the Delaware on Christmas night, Trenton the next morning, Princeton eight days later. Then Valley Forge, Monmouth, and the surrender at Yorktown."

### Scene 6 · 2:04 – 2:18 · Handing it back

**FRAME:** The view 1782–1784: The Newburgh address (March 1783), the green band "Headquarters at Newburgh", Treaty of Paris, Into New York, Farewell at Fraunces Tavern, and Resigns his commission (23 December 1783), where the commander-in-chief band ends; an arc joins the Newburgh address to the resignation. The chapter heading "A new constitution" stands just past it.

**MOTION:** A slow pan to the band's right end; a small marker pulses where it stops.

**OST:** "The band ends by choice."

**VO:**
"And the band ends by choice. At Newburgh he talked down officers ready to defy Congress, and at Annapolis, two days before Christmas 1783, he handed back his commission and went home."

---

## ACT 3 · THE FIRST PRESIDENT (2:18 – 2:46)

### Scene 7 · 2:18 – 2:46 · Two terms

**FRAME:** The view 1785–1797. The Mount Vernon Conference and President of the Convention (a navy band, May to September 1787), then the chapter heading "The presidency" and two navy bands, "First term as president" and "Second term as president"; above them First inauguration, The first cabinet, The first Bank, Second inauguration, Neutrality Proclamation, He calls out the militia and In the field again (the Whiskey Rebellion), The Jay Treaty signed, The Farewell Address. Below, the homes: Samuel Osgood House and Macomb House in New York, then the President's House, Philadelphia.

**MOTION:** A pan from 1785 to 1797; the two term bands light in turn.

**OST:** "The first president."

**VO:**
"Within four years he was back, presiding over the convention that wrote the Constitution, and in 1789 he became the first president. Two inaugurations, the first cabinet, Hamilton's Bank, neutrality in the war between Britain and France, the Whiskey Rebellion, when he rode out with the militia himself, the Jay Treaty, and a Farewell Address that turned down a third term."

---

## ACT 4 · MOUNT VERNON (2:46 – 3:32)

### Scene 8 · 2:46 – 3:14 · One thread: slavery

**FRAME:** Back to the whole life. **Separate by tags** with "slavery" chosen: a track labelled "Tagged slavery" rises above the rest, holding His father dies, Leases Mount Vernon, Marries Martha Custis, Buys William Lee, Free Black soldiers may re-enlist, Seventeen leave on HMS Savage, Counting Mount Vernon's enslaved community (1786), Rotating the enslaved out of Pennsylvania, The Fugitive Slave Act, Ona Judge escapes, Hercules escapes, The 1799 list, He signs his will and Martha frees them, over the Mount Vernon and President's House bands. "Everything else" stays below.

**MOTION:** The tagged moments lift into their own track; a callout names William Lee, Ona Judge and Hercules as the narration does.

**OST:** "The people Mount Vernon ran on."

**VO:**
"Now pull out one thread. Separate by tags, choose slavery, and the people Mount Vernon ran on rise into a track of their own: the ten people he inherited at eleven, William Lee, who rode beside him through the whole war, Ona Judge, who escaped from the President's House in 1796, and Hercules, the cook, who escaped on Washington's sixty-fifth birthday."

### Scene 9 · 3:14 – 3:32 · The will

**FRAME:** Rejoined, the view 1795–1802. With **View mode** on, He signs his will opens in the reader: its date, the tags slavery, writing and family, the note, two Sources (Mount Vernon's page on the 1799 will and Wikipedia's George Washington and slavery), and "Related to: Martha frees them · 1801-01-01 CE", "Buys William Lee · 1768-01-01 CE". Choosing Martha frees them swaps the reader to it.

**MOTION:** The reader opens; a pointer chooses the related entry; the reader's content cross-fades.

**OST:** "Every moment has its sources."

**VO:**
"His will freed the people he owned, after Martha's death. Martha freed them sooner, on New Year's Day 1801. The hundred and fifty-three held through her first husband's estate were not theirs to free, and stayed enslaved."

---

## ACT 5 · THE END (3:32 – 3:52)

### Scene 10 · 3:32 – 3:52 · December 1799

**FRAME:** The reader closes; the capture zooms to 8 December 1799 – 1 January 1800: A ride in the snow (12 December), Dies at Mount Vernon (14 December, the label "12-14 22h"), Funeral and burial (18 December) and "First in war, first in peace" (26 December), arcs joining the ride, the death and the funeral; the bands for his life, Mount Vernon, his marriage, his retirement and his last command end together at his death, and the Quasi-War band runs on past them. The frame shrinks to the left half; end card: "George Washington, 1732–1799 · timescale.info/athan/george-washington", with the source "github.com/openchronology/timeline-app".

**MOTION:** The zoom settles; the five bands' ends line up; the end card rises and holds.

**OST:** "timescale.info/athan/george-washington"

**VO:**
"He died at Mount Vernon in December 1799, two days after a ride in the snow, and every band of his life ends there. It's a timeline we built from Wikipedia, his papers and Mount Vernon's own research: open it, follow the sources, and keep going."

**[END · ~3:50]**

---

## Appendix A · Narration only (for the voice session)

> Here's a timeline we built of George Washington's life, from his birth in Virginia in 1732 to his death at Mount Vernon in 1799. His homes, commands, offices and wars are bands; everything else is a moment, with the sources it draws on. Chapter headings mark the stages of his life.
>
> Open his birth, and the date needs a note. Virginia was British, and Britain still used the old Julian calendar, with the year beginning in March. So the day was written as the eleventh of February, 1731. The timeline puts it on today's calendar, the twenty-second of February 1732, and keeps the original beside it, linked to the day in 1752 when Britain switched and eleven days vanished.
>
> Zoom into his youth: the move to Ferry Farm, his father's death when he was eleven, his first surveying trip over the Blue Ridge at sixteen, the voyage to Barbados with his brother Lawrence, where George caught smallpox, and Lawrence's death in 1752, which in the end brought him Mount Vernon.
>
> At twenty-one he carried Virginia's warning to the French in the Ohio Country. The next spring came Jumonville Glen, a skirmish that helped start a world war, then surrender at Fort Necessity, Braddock's defeat on the Monongahela, and command of the Virginia Regiment until Fort Duquesne fell in 1758.
>
> Then the longest band of his career: eight and a half years in command of the Continental Army. Inside it, the siege of Boston, the loss of New York, and the Ten Crucial Days: the crossing of the Delaware on Christmas night, Trenton the next morning, Princeton eight days later. Then Valley Forge, Monmouth, and the surrender at Yorktown.
>
> And the band ends by choice. At Newburgh he talked down officers ready to defy Congress, and at Annapolis, two days before Christmas 1783, he handed back his commission and went home.
>
> Within four years he was back, presiding over the convention that wrote the Constitution, and in 1789 he became the first president. Two inaugurations, the first cabinet, Hamilton's Bank, neutrality in the war between Britain and France, the Whiskey Rebellion, when he rode out with the militia himself, the Jay Treaty, and a Farewell Address that turned down a third term.
>
> Now pull out one thread. Separate by tags, choose slavery, and the people Mount Vernon ran on rise into a track of their own: the ten people he inherited at eleven, William Lee, who rode beside him through the whole war, Ona Judge, who escaped from the President's House in 1796, and Hercules, the cook, who escaped on Washington's sixty-fifth birthday.
>
> His will freed the people he owned, after Martha's death. Martha freed them sooner, on New Year's Day 1801. The hundred and fifty-three held through her first husband's estate were not theirs to free, and stayed enslaved.
>
> He died at Mount Vernon in December 1799, two days after a ride in the snow, and every band of his life ends there. It's a timeline we built from Wikipedia, his papers and Mount Vernon's own research: open it, follow the sources, and keep going.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                  | Source                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The sample: 115 moments, 40 durations, 40 relationships                                                                                                                | `node publicity/video/samples/build.mjs`                                                                                                                                                                                                                                                                                                                                                    |
| 1     | Born 1732 in Virginia; died at Mount Vernon 1799                                                                                                                       | [George Washington](https://en.wikipedia.org/wiki/George_Washington)                                                                                                                                                                                                                                                                                                                        |
| 2     | Born 11 February 1731/32 Old Style = 22 February 1732 Gregorian; the Old Style year began on 25 March                                                                  | [George Washington](https://en.wikipedia.org/wiki/George_Washington); [Old Style and New Style dates](https://en.wikipedia.org/wiki/Old_Style_and_New_Style_dates)                                                                                                                                                                                                                          |
| 2     | Britain switched in 1752: 2 September was followed by 14 September (eleven days dropped)                                                                               | [Calendar (New Style) Act 1750](<https://en.wikipedia.org/wiki/Calendar_(New_Style)_Act_1750>)                                                                                                                                                                                                                                                                                              |
| 2     | The reader shows a moment's plugin fields (Date precision, Original historical date, Original calendar) and what it's related to                                       | [Guide: reading a timeline](../docs/guide.md#reading-a-timeline); [plugins](../docs/plugins.md)                                                                                                                                                                                                                                                                                             |
| 3     | Ferry Farm 1738; father died 1743, when George was eleven (12 April O.S.); Fairfax survey March–April 1748, at sixteen; Barbados 1751–52, smallpox; Lawrence died 1752 | [Ferry Farm](https://en.wikipedia.org/wiki/Ferry_Farm); [Augustine Washington](https://en.wikipedia.org/wiki/Augustine_Washington); [Founders Online: Surveying for Lord Fairfax](https://founders.archives.gov/documents/Washington/01-01-02-0001-0002); `washington.mjs`                                                                                                                  |
| 3     | Lawrence's death led to George's lease of Mount Vernon (1754) and his ownership (1761)                                                                                 | [Lease, 17 December 1754 (Founders Online)](https://founders.archives.gov/documents/Washington/02-01-02-0116); [Mount Vernon](https://en.wikipedia.org/wiki/Mount_Vernon)                                                                                                                                                                                                                   |
| 4     | Mission to the French, 31 October 1753 – 16 January 1754, at 21                                                                                                        | [Journey to the French Commandant (Founders Online)](https://founders.archives.gov/documents/Washington/01-01-02-0003-0002)                                                                                                                                                                                                                                                                 |
| 4     | Jumonville Glen 28 May 1754 helped start the French and Indian War (the Seven Years' War's North American theatre); Fort Necessity 3 July 1754                         | [Battle of Jumonville Glen](https://en.wikipedia.org/wiki/Battle_of_Jumonville_Glen); [Battle of Fort Necessity](https://en.wikipedia.org/wiki/Battle_of_Fort_Necessity)                                                                                                                                                                                                                    |
| 4     | Monongahela 9 July 1755; colonel of the Virginia Regiment 14 August 1755; Fort Duquesne taken 25 November 1758                                                         | [Battle of the Monongahela](https://en.wikipedia.org/wiki/Battle_of_the_Monongahela); [Commission (Founders Online)](https://founders.archives.gov/documents/Washington/02-02-02-0001-0002); [Forbes Expedition](https://en.wikipedia.org/wiki/Forbes_Expedition)                                                                                                                           |
| 5     | Commander-in-chief 15 June 1775 – 23 December 1783 (eight and a half years)                                                                                            | [Continental Army](https://en.wikipedia.org/wiki/Continental_Army); [resignation](https://en.wikipedia.org/wiki/George_Washington%27s_resignation_as_commander-in-chief)                                                                                                                                                                                                                    |
| 5     | Crossing on the night of 25–26 December 1776; Trenton 26 December; Princeton 3 January 1777 (eight days after Trenton)                                                 | [Crossing of the Delaware](https://en.wikipedia.org/wiki/George_Washington%27s_crossing_of_the_Delaware_River); [Battle of Trenton](https://en.wikipedia.org/wiki/Battle_of_Trenton); [Battle of Princeton](https://en.wikipedia.org/wiki/Battle_of_Princeton)                                                                                                                              |
| 5     | Valley Forge 1777–78; Monmouth 28 June 1778; Yorktown surrender 19 October 1781                                                                                        | [Valley Forge](https://en.wikipedia.org/wiki/Valley_Forge); [Battle of Monmouth](https://en.wikipedia.org/wiki/Battle_of_Monmouth); [Siege of Yorktown](https://en.wikipedia.org/wiki/Siege_of_Yorktown)                                                                                                                                                                                    |
| 6     | Newburgh address 15 March 1783; resignation at Annapolis 23 December 1783                                                                                              | [Newburgh Conspiracy](https://en.wikipedia.org/wiki/Newburgh_Conspiracy); [resignation](https://en.wikipedia.org/wiki/George_Washington%27s_resignation_as_commander-in-chief)                                                                                                                                                                                                              |
| 7     | President of the Constitutional Convention 1787; convention 25 May – 17 September 1787 (under four years after resigning); inaugurated 30 April 1789 and 4 March 1793  | [Constitutional Convention](<https://en.wikipedia.org/wiki/Constitutional_Convention_(United_States)>); [First inauguration](https://en.wikipedia.org/wiki/First_inauguration_of_George_Washington); [Second inauguration](https://en.wikipedia.org/wiki/Second_inauguration_of_George_Washington)                                                                                          |
| 7     | Bank 1791; Neutrality 1793; with the militia army at Carlisle, October 1794; Jay Treaty 1794–95; Farewell Address 19 September 1796, declining a third term            | [First Bank](https://en.wikipedia.org/wiki/First_Bank_of_the_United_States); [Proclamation of Neutrality](https://en.wikipedia.org/wiki/Proclamation_of_Neutrality); [Whiskey Rebellion](https://en.wikipedia.org/wiki/Whiskey_Rebellion); [Jay Treaty](https://en.wikipedia.org/wiki/Jay_Treaty); [Farewell Address](https://en.wikipedia.org/wiki/George_Washington%27s_Farewell_Address) |
| 8     | He inherited ten enslaved people at his father's death                                                                                                                 | [Augustine Washington](https://en.wikipedia.org/wiki/Augustine_Washington); [George Washington and slavery](https://en.wikipedia.org/wiki/George_Washington_and_slavery)                                                                                                                                                                                                                    |
| 8     | William Lee, bought in 1768, was his valet through the war; Ona Judge escaped 21 May 1796; Hercules escaped 22 February 1797, Washington's 65th birthday               | [William Lee](<https://en.wikipedia.org/wiki/William_Lee_(valet)>); [Ona Judge](https://en.wikipedia.org/wiki/Ona_Judge); [Hercules Posey](https://en.wikipedia.org/wiki/Hercules_Posey)                                                                                                                                                                                                    |
| 9     | The will (9 July 1799) freed his slaves on Martha's death; Martha's deed of December 1800 freed them on 1 January 1801; 153 dower people could not be freed by either  | [Washington's 1799 will (Mount Vernon)](https://www.mountvernon.org/george-washington/slavery/washingtons-1799-will/); [1786 and 1799 censuses (Mount Vernon)](https://mountvernon.org/library/digitalhistory/digital-encyclopedia/article/census-of-the-enslaved-population-at-mount-vernon-1786-and-1799)                                                                                 |
| 10    | Rode in snow and sleet 12 December 1799; died 14 December between 10 and 11 p.m.; buried 18 December                                                                   | [George Washington: Death](https://en.wikipedia.org/wiki/George_Washington#Death)                                                                                                                                                                                                                                                                                                           |
| 10    | Separate by tags, the reader, View mode                                                                                                                                | [Tags](../docs/tags.md#separating-by-tags); [Guide: reading a timeline](../docs/guide.md#reading-a-timeline)                                                                                                                                                                                                                                                                                |

## Appendix C · Questions this audience is likely to ask

1. **Why is his birthday on the 22nd if he was born on the 11th?** Both are right: 11 February in the Julian calendar Virginia used in 1732, 22 February in the Gregorian calendar Britain adopted in 1752, which he used himself afterwards. The timeline is drawn in Gregorian dates, and the **Historical dates** plugin keeps the date as written at the time. Every date before September 1752 in the sample is converted the same way.
2. **What time zone are the dates in?** A fixed UTC−5, an approximation of Virginia time (there were no time zones in the eighteenth century). Most moments are whole days; the only clock time is his death, "between 10 and 11 p.m." in Tobias Lear's account, placed at 10:30 and marked so in **Date precision**.
3. **Why does slavery have its own tag?** Because it runs through the whole life, from what he inherited at eleven to his will, and a class can pull it out with **Separate by tags** to study it on its own, then rejoin it with the rest.
4. **Can I use this sample?** Yes: import `washington.ochx`; then edit it, or publish it from your own account.
5. **Can students add to it?** On a server, readers can propose changes and writers review them (see Video 9); students 13 and older can sign up.
