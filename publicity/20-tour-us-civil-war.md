# OpenChronology — Tour: The U.S. Civil War, 1861–1865. Script and Storyboard

**Runtime:** ~4:20 (at 140 wpm, with pauses) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and history teachers, and anyone who knows the Civil War as a list of battles. Teachers will judge it as classroom material, so it must be accurate and calm, and plain about the cause.
**Purpose:** show a war as a timeline: the forty years of crisis before it, secession and the reasons the seceding states gave, the war's campaigns and commands as bands, one front pulled out of the rest, the turning points of 1862 and 1863 zoomed into, the Black soldiers who fought it, the surrenders that came after Appomattox, its cost, and the amendments that followed. Then point viewers at the timeline.

**How it differs:** Video 5 sweeps a country across two centuries; this one stays with one war and its causes across fifty-seven years. The history leads and the app follows: every control is named once, in passing, by what it shows about the war.

**Production notes:**

- Narration is 578 words, about 4:07 at 140 wpm, in the voice of a good history teacher: curious, not breathless, unhurried on the cost.
- **The timeline is the sample `publicity/video/samples/civil-war.ochx`**, built from `civil-war.mjs`: 121 moments (eight of them chapter headings), 40 durations, 40 relationships, sources on each (Wikipedia, and where it's the natural reference the National Archives, the Library of Congress, the National Park Service, the Avalon Project's texts of the secession declarations, the American Battlefield Trust, or Hacker's 2011 article), the Timeline theme in archive colours, a colour per thread. Shots are captured from the real editor in full screen (`shots.json` in the video's folder) and shown in a browser frame; the infographic layer adds titles and arrows around the frame, never over the app's own text.
- The timeline's display is **Gregorian** at a fixed **UTC−05:00** (shown in the bounds caption), so eastern times of day read as local; date-only moments sit at midnight of their day.
- Tags used on screen: `slavery`, `command`, `west`, `black soldiers`, `surrender`; the others are `politics`, `east`, `navy`, `reconstruction`, and `chapter` on the headings.
- **Capture notes:** every `open` goes under a shot's `actions`, never its `setup`, with **View mode** turned on in the same `actions`. Readers are opened from an unseparated view whose left edge is in an earlier year than the moment (the reader drops a moment's year when the view starts in the same year): the Cornerstone Speech from a view starting 1860-12-25, the war's band from 1860-12-01. Separated shots use `setup: [{ do: "separate", tags: [...] }]`. Each "Fit all" frame is the view 1819-06-01 → 1878-01-01 (Fit all's own bounds), typed as bounds so every capture matches.
- **The duration reader shows no Sources or dating notes** (only moments do), so the war's cost is read from its notes in Scene 13, and its sources are given in Appendix B.
- **Accuracy guardrails:**
  - Slavery is the central cause, as the seceding states' declarations say and as historians agree; the narration quotes the documents rather than characterizing them.
  - Only well-established dates (Appendix B). Where the record gives a season or a range (Tubman's escape, the Anaconda Plan's letters, New Orleans, Kirby Smith's terms), the moment's dating note says so; the narration never gives a day for those.
  - The death toll is given as two estimates, the traditional count (about 620,000) and Hacker's census-based estimate (about 750,000, within about 650,000–850,000), and called estimates.
  - The Civil War band runs from Fort Sumter to Appomattox, as is conventional; the narration says Lee's surrender wasn't the end.
  - Say "a timeline we built from …" — it isn't presented as a definitive history.
  - Account and classroom claims as in Video 5: free, no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · FORTY YEARS OF CRISIS (0:00 – 0:58)

### Scene 1 · 0:00 – 0:23 · The whole span

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: 1820 at the left, 1877 at the right; the moments of the 1820s–1850s spread out, then a dense run of summaries over 1861–1865, and beneath the axis the bands Bleeding Kansas, Jefferson Davis, Confederate president, the commands, and the long blue Reconstruction band. To its left, a vertical strip of three chips: "121 moments", "40 durations", "40 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's numbers.

**OST:** "Causes, war and aftermath, on one line."

**VO:**
"This is a timeline we built from the sources of the American Civil War: not only the four years of fighting, but the forty years of crisis before them and the twelve of Reconstruction after. A hundred and twenty-one moments, forty durations, forty links, and each names where it comes from."

### Scene 2 · 0:23 – 0:39 · One thread: slavery

**FRAME:** Still the whole span. **Separate by tags** with "slavery" chosen: the upper track holds the Missouri Compromise (1820), Nat Turner's rebellion and The Liberator (1831), Frederick Douglass's Narrative, Harriet Tubman escapes, the Compromise of 1850 and the Fugitive Slave Act, Uncle Tom's Cabin, the Kansas–Nebraska Act over the Bleeding Kansas band, Dred Scott v. Sandford, and on to the summaries of the war years and the Thirteenth Amendment ratified.

**MOTION:** The tagged moments lift into their track; each lights as it's named.

**OST:** "The cause runs through it."

**VO:**
"Separate by tags, choose slavery, and the cause runs through all of it. The Missouri Compromise in 1820. Nat Turner's rebellion. Frederick Douglass's Narrative. The Fugitive Slave Act, Kansas–Nebraska, Dred Scott, and on the far side, emancipation."

### Scene 3 · 0:39 – 0:58 · The 1850s

**FRAME:** Rejoined, the capture zooms into 1849–1861: Harriet Tubman escapes, the Compromise of 1850, Uncle Tom's Cabin (1852-03-20), the Kansas–Nebraska Act (1854-05-30) with the Bleeding Kansas band starting under it and running to 1861, the summary of May 1856 (the sack of Lawrence, Sumner caned, Pottawatomie), Dred Scott v. Sandford (1857-03-06), the Lincoln–Douglas debates band, John Brown's raid on Harpers Ferry. Arcs from the Missouri Compromise, off the left edge, land on Kansas–Nebraska and on Dred Scott.

**MOTION:** A continuous zoom; the summaries split into titled moments as they spread; the two arcs brighten as Dred Scott is named.

**OST:** "The compromises fail."

**VO:**
"Zoom into the 1850s and the crises come faster. Uncle Tom's Cabin. Kansas opened to slavery in 1854, and seven years of fighting there. In 1857 the Supreme Court rules that Black Americans can't be citizens. In 1859, John Brown's raid."

---

## ACT 2 · SECESSION (0:58 – 1:34)

### Scene 4 · 0:58 – 1:16 · Secession winter

**FRAME:** The capture zooms to October 1860 – June 1861 under the chapter heading "Election and secession": Lincoln elected president (1860-11-06), the band The Deep South secedes (1860-12-20 → 1861-02-01) with South Carolina secedes and its Declaration of Causes at its start, the states' moments along it, The Confederate States formed (1861-02-08), the Confederate Constitution, the Cornerstone Speech, Fort Sumter (1861-04-12 04:30) under the heading "1861: The war begins", and the band The upper South secedes. An arc from Lincoln's election to South Carolina.

**MOTION:** A slow pan right; the Deep South band is outlined while it's named, then the upper South's.

**OST:** "Seven states, then four."

**VO:**
"Lincoln is elected in November 1860 without a single Southern electoral vote. Six weeks later South Carolina secedes, and by February seven states have left and six have founded the Confederacy, all before he takes office. After Fort Sumter, four more follow."

### Scene 5 · 1:16 – 1:34 · Read a moment, and its sources

**FRAME:** With **View mode** on, the Cornerstone Speech (1861-03-21) opens in the reader over the app: its date, the tags slavery and politics, the notes with Stephens's words, a Sources list (Wikipedia and the American Battlefield Trust's text of the speech), and "Related to": Confederate Constitution. A callout beside the frame lists the two declarations it doesn't show: "South Carolina, Dec 24, 1860" and "Mississippi, Jan 1861", each "Avalon Project".

**MOTION:** The reader opens; the quotation is underlined as it's read; the callout ticks in.

**OST:** "They said why."

**VO:**
"The seceding states said why. South Carolina cites the North's hostility to slavery. Mississippi says its position is thoroughly identified with it. And that March the Confederacy's vice president calls slavery its cornerstone. Open any moment to read it, with its sources."

---

## ACT 3 · THE WAR (1:34 – 2:50)

### Scene 6 · 1:34 – 1:54 · Bands for commands

**FRAME:** Rejoined, the capture shows February 1861 – June 1869 with **Separate by tags** "command": the upper track holds the bands McClellan commands in the East (1861-07-26 → 1862-11-07), Lee commands the Army of Northern Virginia (1862-06-01 → 1865-04-09), Grant, general-in-chief (1864-03-12 →), Jefferson Davis, Confederate president, and the moment Grant made lieutenant general. Below, The Civil War band runs from Fort Sumter to Appomattox. Callouts: "15 months", "almost 3 years".

**MOTION:** Each command band brightens as it's named; the war band is bracketed with "4 years less 3 days".

**OST:** "Who led, and for how long."

**VO:**
"The war itself is a band, from Fort Sumter to Appomattox: four years less three days. The commands are bands too. McClellan leads in the East for fifteen months. Lee commands for almost three years. Grant takes every Union army in March 1864."

### Scene 7 · 1:54 – 2:12 · One front: the West

**FRAME:** The war years with **Separate by tags** "west": the upper track holds Fort Henry and Fort Donelson (Feb 1862), Shiloh, Perryville, Stones River, the Siege of Vicksburg band ending at Vicksburg surrenders, Port Hudson, Chickamauga, Chattanooga, the Atlanta campaign band to Atlanta falls, Sherman's March to the Sea, Franklin and Nashville. Below, the East: Bull Run, the Peninsula, Antietam, Fredericksburg, Chancellorsville, Gettysburg, the Overland Campaign and Petersburg.

**MOTION:** The western moments lift into their track left to right, as each is named.

**OST:** "Where it was won."

**VO:**
"Separate the West, and you can see where the Union was gaining ground: Fort Donelson and Shiloh in 1862, Vicksburg in 1863, Chattanooga, Atlanta, the march to the sea. In the East, the armies fought back and forth across Virginia."

### Scene 8 · 2:12 – 2:30 · Autumn 1862

**FRAME:** Rejoined, the capture zooms into July 1862 – January 1863: Second Confiscation Act and Militia Act (07-17), Emancipation read to the cabinet (07-22), the Second Bull Run band, Antietam (09-17), Preliminary Emancipation Proclamation (09-22), Island Mound, the Fredericksburg band, and at the right edge the Emancipation Proclamation (1863-01-01). Arcs from Antietam to the preliminary proclamation, and on to the proclamation.

**MOTION:** The arcs draw as each step is named; a callout at Antietam: "≈ 23,000 casualties in a day".

**OST:** "Follow the links."

**VO:**
"Zoom into 1862 and follow the links. Antietam, in September: about twenty-three thousand men killed, wounded or missing, the bloodiest single day in American history. Five days later, the preliminary Emancipation Proclamation, and on New Year's Day, the proclamation itself."

### Scene 9 · 2:30 – 2:50 · July 1863

**FRAME:** The capture zooms to late June – late July 1863: the Siege of Vicksburg band ending at Vicksburg surrenders (07-04), the Gettysburg band (07-01 → 07-03) with Pickett's Charge, Port Hudson surrenders (07-09), the New York City draft riots band (07-13 → 07-16) with Colored Orphan Asylum burned, and The 54th Massachusetts at Fort Wagner (07-18).

**MOTION:** A slow zoom that settles on the three weeks; each moment lights as it's named.

**OST:** "Three weeks in July."

**VO:**
"July 1863 holds the turning point. Three days at Gettysburg. Vicksburg surrenders on the Fourth, Port Hudson five days later, and the Mississippi is the Union's. Then New York's draft riots, where mobs hunt Black New Yorkers, and two days after, the 54th Massachusetts at Fort Wagner."

---

## ACT 4 · FREEDOM AND THE END (2:50 – 3:43)

### Scene 10 · 2:50 – 3:13 · One thread: Black soldiers

**FRAME:** June 1862 – June 1865 with **Separate by tags** "black soldiers": the upper track holds Second Confiscation Act and Militia Act, Island Mound (1862-10-29), "Men of Color, To Arms!", a summary of May–June 1863 (Bureau of Colored Troops, Port Hudson, the Combahee River Raid, Milliken's Bend), Fort Wagner and Douglass meets Lincoln, Fort Pillow, Equal pay for Black soldiers, The Crater, New Market Heights, Nashville. A callout: "≈ 179,000 in the Union army".

**MOTION:** The thread lifts into its track; the summary of 1863 splits as the capture zooms a little into it, showing Combahee River Raid; then back.

**OST:** "Those who fought for it."

**VO:**
"Pull out another thread: Black soldiers. Frederick Douglass calls men to arms. Harriet Tubman guides a Black regiment up the Combahee River and frees more than seven hundred and fifty people. Fort Pillow, the Crater, New Market Heights. About a hundred and seventy-nine thousand Black men serve in the Union army."

### Scene 11 · 3:13 – 3:23 · April 1865

**FRAME:** Rejoined, the capture zooms to late March – April 1865: Five Forks (04-01), Richmond falls (04-03), the Appomattox campaign band ending at Lee surrenders at Appomattox (04-09), The stacking of arms (04-12), Lincoln shot at Ford's Theatre (04-14 22:15) and Lincoln dies (04-15 07:22), Johnston surrenders at Bennett Place (04-26).

**MOTION:** The zoom settles; each moment lights as it's named.

**OST:** "April 1865."

**VO:**
"April 1865. Richmond falls on the third. Lee surrenders at Appomattox on the ninth. Five days later, Lincoln is shot."

### Scene 12 · 3:23 – 3:43 · After Appomattox

**FRAME:** The capture widens to March – December 1865 with **Separate by tags** "surrender": the upper track holds Lee surrenders at Appomattox, Johnston surrenders at Bennett Place (04-26), Taylor surrenders at Citronelle (05-04), Kirby Smith surrenders at Galveston (06-02), Juneteenth (06-19) and Stand Watie surrenders (06-23) together, and far to the right CSS Shenandoah surrenders at Liverpool (11-06), with the band After Appomattox: the last surrenders running beneath them all. A callout: "211 days".

**MOTION:** The surrender moments lift into their track; the band draws left to right; the callout appears at its end.

**OST:** "Appomattox wasn't the end."

**VO:**
"But Appomattox wasn't the end. Johnston surrenders in April, Kirby Smith in June, Stand Watie, a Cherokee general, on the twenty-third. Four days before him, at Galveston, an order tells Texas that all slaves are free: Juneteenth. The last surrender is a ship, the Shenandoah, in November."

---

## ACT 5 · THE COST AND THE AFTERMATH (3:43 – 4:19)

### Scene 13 · 3:43 – 3:59 · The cost

**FRAME:** With **View mode** on, The Civil War band opens in the reader over a view of December 1860 – January 1866: its span, 1861-04-12 → 1865-04-09, the tags east and west, and the notes ending with the cost. A callout beside the frame: "≈ 620,000 (traditional count)", "≈ 750,000 (Hacker, 2011)", and "estimates".

**MOTION:** The reader opens; the two figures are underlined as they're read.

**OST:** "The cost."

**VO:**
"Open the war's own band for its cost: about six hundred and twenty thousand soldiers dead by the traditional count, about seven hundred and fifty thousand by a 2011 census-based estimate. Both are estimates."

### Scene 14 · 3:59 – 4:13 · Reconstruction

**FRAME:** The reader closes; the capture shows June 1865 – December 1877: Thirteenth Amendment ratified (1865-12-06), Civil Rights Act of 1866, Reconstruction Acts, Fourteenth Amendment ratified (1868-07-09), Fifteenth Amendment ratified (1870-02-03), Hiram Revels takes his seat, the Reconstruction band (1865-05-29 → 1877-04-24) ending at Troops leave the Louisiana statehouse, with arcs from the Thirteenth to the Fourteenth to the Fifteenth.

**MOTION:** The arcs draw as each amendment is named; the Reconstruction band is outlined.

**OST:** "Three amendments, twelve years."

**VO:**
"Then three amendments: the Thirteenth, ending slavery, the Fourteenth and the Fifteenth. Reconstruction is a band of twelve years, ending in 1877, when the last federal troops leave the Southern statehouses."

### Scene 15 · 4:13 – 4:19 · Read it

**FRAME:** The capture shrinks to the left half, back to the whole span. On the right, the end card: "timescale.info/athan/us-civil-war", "Free to read, no account needed", and the source: "github.com/openchronology/timeline-app".

**MOTION:** The lines tick in; the end card rises and holds.

**OST:** "Causes, war and aftermath, on one line."

**VO:**
"Open it, follow the links, and see where every date comes from."

**[END · ~4:20]**

---

## Appendix A · Narration only (for the voice session)

> This is a timeline we built from the sources of the American Civil War: not only the four years of fighting, but the forty years of crisis before them and the twelve of Reconstruction after. A hundred and twenty-one moments, forty durations, forty links, and each names where it comes from.
>
> Separate by tags, choose slavery, and the cause runs through all of it. The Missouri Compromise in 1820. Nat Turner's rebellion. Frederick Douglass's Narrative. The Fugitive Slave Act, Kansas–Nebraska, Dred Scott, and on the far side, emancipation.
>
> Zoom into the 1850s and the crises come faster. Uncle Tom's Cabin. Kansas opened to slavery in 1854, and seven years of fighting there. In 1857 the Supreme Court rules that Black Americans can't be citizens. In 1859, John Brown's raid.
>
> Lincoln is elected in November 1860 without a single Southern electoral vote. Six weeks later South Carolina secedes, and by February seven states have left and six have founded the Confederacy, all before he takes office. After Fort Sumter, four more follow.
>
> The seceding states said why. South Carolina cites the North's hostility to slavery. Mississippi says its position is thoroughly identified with it. And that March the Confederacy's vice president calls slavery its cornerstone. Open any moment to read it, with its sources.
>
> The war itself is a band, from Fort Sumter to Appomattox: four years less three days. The commands are bands too. McClellan leads in the East for fifteen months. Lee commands for almost three years. Grant takes every Union army in March 1864.
>
> Separate the West, and you can see where the Union was gaining ground: Fort Donelson and Shiloh in 1862, Vicksburg in 1863, Chattanooga, Atlanta, the march to the sea. In the East, the armies fought back and forth across Virginia.
>
> Zoom into 1862 and follow the links. Antietam, in September: about twenty-three thousand men killed, wounded or missing, the bloodiest single day in American history. Five days later, the preliminary Emancipation Proclamation, and on New Year's Day, the proclamation itself.
>
> July 1863 holds the turning point. Three days at Gettysburg. Vicksburg surrenders on the Fourth, Port Hudson five days later, and the Mississippi is the Union's. Then New York's draft riots, where mobs hunt Black New Yorkers, and two days after, the 54th Massachusetts at Fort Wagner.
>
> Pull out another thread: Black soldiers. Frederick Douglass calls men to arms. Harriet Tubman guides a Black regiment up the Combahee River and frees more than seven hundred and fifty people. Fort Pillow, the Crater, New Market Heights. About a hundred and seventy-nine thousand Black men serve in the Union army.
>
> April 1865. Richmond falls on the third. Lee surrenders at Appomattox on the ninth. Five days later, Lincoln is shot.
>
> But Appomattox wasn't the end. Johnston surrenders in April, Kirby Smith in June, Stand Watie, a Cherokee general, on the twenty-third. Four days before him, at Galveston, an order tells Texas that all slaves are free: Juneteenth. The last surrender is a ship, the Shenandoah, in November.
>
> Open the war's own band for its cost: about six hundred and twenty thousand soldiers dead by the traditional count, about seven hundred and fifty thousand by a 2011 census-based estimate. Both are estimates.
>
> Then three amendments: the Thirteenth, ending slavery, the Fourteenth and the Fifteenth. Reconstruction is a band of twelve years, ending in 1877, when the last federal troops leave the Southern statehouses.
>
> Open it, follow the links, and see where every date comes from.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                                                                                                                                    | Source                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | The sample: 121 moments (8 chapter headings), 40 durations, 40 relationships                                                                                                                                                                                                             | `node publicity/video/samples/build.mjs`                                                                                                                                                                                                                                                                                                                           |
| 1     | Forty years before (Missouri Compromise 1820 to 1860); Reconstruction 1865–1877, about twelve years                                                                                                                                                                                      | [Missouri Compromise](https://en.wikipedia.org/wiki/Missouri_Compromise); [Reconstruction era](https://en.wikipedia.org/wiki/Reconstruction_era)                                                                                                                                                                                                                   |
| 2     | Missouri Compromise 1820-03-06; Nat Turner 1831-08-21; Douglass's Narrative May 1845; Fugitive Slave Act 1850-09-18; Kansas–Nebraska 1854-05-30; Dred Scott 1857-03-06                                                                                                                   | [National Archives: Missouri Compromise](https://www.archives.gov/milestone-documents/missouri-compromise); [Nat Turner's Rebellion](https://en.wikipedia.org/wiki/Nat_Turner's_Rebellion); [Narrative](https://en.wikipedia.org/wiki/Narrative_of_the_Life_of_Frederick_Douglass); [Fugitive Slave Act](https://en.wikipedia.org/wiki/Fugitive_Slave_Act_of_1850) |
| 3     | Uncle Tom's Cabin 1852-03-20; Bleeding Kansas 1854–1861 (statehood 1861-01-29); Dred Scott: Black Americans not citizens, Missouri Compromise unconstitutional; Harpers Ferry 1859-10-16 to 18                                                                                           | [Uncle Tom's Cabin](https://en.wikipedia.org/wiki/Uncle_Tom's_Cabin); [Bleeding Kansas](https://en.wikipedia.org/wiki/Bleeding_Kansas); [National Archives: Dred Scott](https://www.archives.gov/milestone-documents/dred-scott-v-sandford); [Harpers Ferry raid](https://en.wikipedia.org/wiki/John_Brown's_raid_on_Harpers_Ferry)                                |
| 4     | Elected 1860-11-06 with no electoral votes from the slave states; South Carolina secedes 1860-12-20 (six weeks later); seven states by 1861-02-01; Confederacy formed 1861-02-08; Lincoln inaugurated 1861-03-04; four more after Sumter (Virginia, Arkansas, North Carolina, Tennessee) | [1860 election](https://en.wikipedia.org/wiki/1860_United_States_presidential_election); [Secession](https://en.wikipedia.org/wiki/Secession_in_the_United_States); [Confederate States](https://en.wikipedia.org/wiki/Confederate_States_of_America)                                                                                                              |
| 5     | South Carolina: "increasing hostility … to the institution of slavery"; Mississippi: "thoroughly identified with the institution of slavery"; Stephens, 1861-03-21: slavery the "cornerstone"                                                                                            | [Avalon: South Carolina](https://avalon.law.yale.edu/19th_century/csa_scarsec.asp); [Avalon: Mississippi](https://avalon.law.yale.edu/19th_century/csa_missec.asp); [Cornerstone Speech](https://en.wikipedia.org/wiki/Cornerstone_Speech); [American Battlefield Trust](https://www.battlefields.org/learn/primary-sources/cornerstone-speech)                    |
| 2, 5  | Slavery as the central cause is the scholarly consensus                                                                                                                                                                                                                                  | [Origins of the American Civil War](https://en.wikipedia.org/wiki/Origins_of_the_American_Civil_War)                                                                                                                                                                                                                                                               |
| 6     | Sumter 1861-04-12 to Appomattox 1865-04-09: 1,458 days, three days short of four years; McClellan 1861-07-26 to 1862-11-07 (about 15 months); Lee 1862-06-01 to 1865-04-09 (2 years 10 months); Grant general-in-chief 1864-03-12                                                        | [American Civil War](https://en.wikipedia.org/wiki/American_Civil_War); [McClellan](https://en.wikipedia.org/wiki/George_B._McClellan); [Lee](https://en.wikipedia.org/wiki/Robert_E._Lee); [Grant](https://en.wikipedia.org/wiki/Ulysses_S._Grant)                                                                                                                |
| 7     | Fort Donelson 1862-02-16; Shiloh 1862-04-06/07; Vicksburg 1863-07-04; Chattanooga 1863-11-23/25; Atlanta 1864-09-02; March to the Sea 1864-11-15 to 12-21                                                                                                                                | Each battle's Wikipedia article in `civil-war.mjs`                                                                                                                                                                                                                                                                                                                 |
| 8     | Antietam 1862-09-17, about 23,000 casualties, the bloodiest single day; preliminary proclamation 1862-09-22 (five days); proclamation 1863-01-01                                                                                                                                         | [Antietam](https://en.wikipedia.org/wiki/Battle_of_Antietam); [NPS Antietam](https://www.nps.gov/anti/index.htm); [National Archives: Emancipation Proclamation](https://www.archives.gov/exhibits/featured-documents/emancipation-proclamation)                                                                                                                   |
| 9     | Gettysburg July 1–3; Vicksburg 07-04; Port Hudson 07-09; draft riots July 13–16, Black New Yorkers attacked; Fort Wagner 07-18                                                                                                                                                           | [Gettysburg](https://en.wikipedia.org/wiki/Battle_of_Gettysburg); [Port Hudson](https://en.wikipedia.org/wiki/Siege_of_Port_Hudson); [Draft riots](https://en.wikipedia.org/wiki/New_York_City_draft_riots); [Fort Wagner](https://en.wikipedia.org/wiki/Second_Battle_of_Fort_Wagner)                                                                             |
| 10    | "Men of Color, To Arms!" March 1863; Combahee River Raid June 1–2, 1863, more than 750 freed; Fort Pillow 1864-04-12; the Crater 1864-07-30; New Market Heights 1864-09-29; about 179,000 Black soldiers in the Union army                                                               | [Frederick Douglass](https://en.wikipedia.org/wiki/Frederick_Douglass); [Combahee Ferry raid](https://en.wikipedia.org/wiki/Raid_on_Combahee_Ferry); [USCT](https://en.wikipedia.org/wiki/United_States_Colored_Troops); [National Archives: Black soldiers](https://www.archives.gov/education/lessons/blacks-civil-war)                                          |
| 11    | Richmond 1865-04-03; Appomattox 04-09; Lincoln shot 04-14 (five days later)                                                                                                                                                                                                              | [Richmond in the war](https://en.wikipedia.org/wiki/Richmond,_Virginia,_in_the_American_Civil_War); [Appomattox](https://en.wikipedia.org/wiki/Battle_of_Appomattox_Court_House); [Assassination](https://en.wikipedia.org/wiki/Assassination_of_Abraham_Lincoln)                                                                                                  |
| 12    | Johnston 04-26; Kirby Smith 06-02; Stand Watie, Cherokee, 06-23; Juneteenth 06-19 (four days before), General Order No. 3; Shenandoah at Liverpool 11-06, the last surrender (211 days after Appomattox)                                                                                 | [Conclusion of the war](https://en.wikipedia.org/wiki/Conclusion_of_the_American_Civil_War); [Stand Watie](https://en.wikipedia.org/wiki/Stand_Watie); [National Archives: Juneteenth](https://www.archives.gov/news/articles/juneteenth-original-document); [CSS Shenandoah](https://en.wikipedia.org/wiki/CSS_Shenandoah)                                        |
| 13    | About 620,000 dead by the traditional count; about 750,000 (range about 650,000–850,000) by J. David Hacker, "A Census-Based Count of the Civil War Dead", _Civil War History_ 57:4 (2011), 307–348                                                                                      | [Hacker 2011 (Project MUSE)](https://muse.jhu.edu/article/465917); [American Civil War](https://en.wikipedia.org/wiki/American_Civil_War)                                                                                                                                                                                                                          |
| 13    | The duration reader shows notes and tags, not Sources                                                                                                                                                                                                                                    | Known limit of the reader; sources are in `civil-war.mjs`                                                                                                                                                                                                                                                                                                          |
| 14    | Thirteenth ratified 1865-12-06; Fourteenth 1868-07-09; Fifteenth 1870-02-03; Reconstruction to 1877-04-24 (troops leave the Louisiana statehouse), conventionally 1865–1877                                                                                                              | [National Archives: 13th](https://www.archives.gov/milestone-documents/13th-amendment), [14th](https://www.archives.gov/milestone-documents/14th-amendment), [15th](https://www.archives.gov/milestone-documents/15th-amendment); [Compromise of 1877](https://en.wikipedia.org/wiki/Compromise_of_1877)                                                           |
| 15    | Public timelines need no account                                                                                                                                                                                                                                                         | [FAQ](../docs/faq.md#do-i-need-an-account)                                                                                                                                                                                                                                                                                                                         |

## Appendix C · Questions this audience is likely to ask

1. **Why does the timeline say slavery was the cause, rather than states' rights?** Because the seceding states said so in their own declarations, and the Confederate Constitution protected "the right of property in negro slaves"; the timeline links to the texts so viewers can read them. South Carolina's declaration complains that free states would not enforce the Fugitive Slave Act; it objects to their rights, not to federal power.
2. **Why does the war band end at Appomattox if the last surrender was in November?** It's the conventional dating; the band After Appomattox: the last surrenders runs on to the Shenandoah, and the war's legal end (1866-08-20) is its own moment.
3. **Why two death tolls?** The traditional figure (about 620,000) comes from the War Department's records and later compilations; Hacker's 2011 study estimated deaths from the 1860 and 1870 censuses and arrived at about 750,000, within a wide range. Historians still cite both, so the timeline gives both and calls them estimates.
4. **Why does it say UTC−05:00?** Standard time zones came only in 1883; the display uses a fixed offset close to eastern local time so that times of day (4:30 a.m. at Fort Sumter, 10:15 p.m. at Ford's Theatre) read as local. Date-only moments sit at midnight of their day.
5. **Why does the Emancipation Proclamation show at noon?** It was signed on the afternoon of January 1; it's placed at noon so it stands apart from the 1863 chapter heading at midnight, and its dating note says so.
6. **Can I use this in class?** Yes: import `civil-war.ochx`, or open the public timeline, then edit a copy or publish it from your own account. Students can separate by any tag (navy, politics, reconstruction) for a thread of their own.
