# OpenChronology — Tour: The Great Depression, 1929–1941. Script and Storyboard

**Runtime:** ~3:50 (at 140 wpm, with pauses) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and history and economics teachers, and anyone who knows the Depression as the Crash, breadlines and the New Deal. Teachers will judge it as classroom material, so it must be accurate and calm, and careful with numbers.
**Purpose:** show an economic history as a timeline: the whole slump as bands (the business cycle, the market's fall, the panics, the programs), one day of the Crash down to the hour, two threads pulled out of the rest (banking, and the world beyond America), a law read with its sources and links, the New Deal and the relapse of 1937, the farm and the Dust Bowl, and the war that ended it. Then point viewers at the timeline and at building their own.

**How it differs:** Video 5 sweeps a country across two centuries; this one follows one crisis across twelve years, and its proof is in statistics as well as dates. The history leads and the app follows: every control is named once, in passing, by what it shows about the Depression.

**Production notes:**

- Narration is 509 words, about 3:38 at 140 wpm, in the voice of a good history teacher: curious, unhurried, never dramatic about the numbers.
- **The timeline is the sample `publicity/video/samples/great-depression.ochx`**, built from `great-depression.mjs`: 121 moments (eight of them chapter headings), 35 durations, 40 relationships, sources on each (Wikipedia, and where it's the natural reference the NBER's business-cycle dates, the Bureau of Labor Statistics' 1929–39 estimates, the Federal Reserve's history essays, the National Archives, the American Presidency Project and the Library of Congress), the Timeline theme in archive colours, a colour per thread. Shots are captured from the real editor in full screen (`shots.json` in the video's folder) and shown in a browser frame; the infographic layer adds titles and arrows around the frame, never over the app's own text.
- The timeline's display is **Gregorian** at a fixed **UTC−05:00** (shown in the bounds caption), New York's standard time, which Wall Street kept in October 1929, so Black Thursday's hours read as the Exchange's; date-only moments sit at midnight of their day.
- **Capture notes:** every `open` goes under a shot's `actions`, not `setup`. Readers are opened from a view whose left edge is in an earlier year than the moment (the reader drops the year otherwise), and never in a separated view (View mode there opens the editor). Zoomed shots lower **Group within** to 12 px with an `eval` in `setup`. Moments signed the same day (May 12 and June 16, 1933) are an hour apart in the data, so they stay a two-moment summary at the Hundred Days' zoom; the FRAMEs say so.
- Tags used on screen: `banking`, `world`, `farm`; the others are `market`, `policy`, `politics`, `labor`, `culture`, `economy`, and `chapter` on the headings.
- **Accuracy guardrails:**
  - Only well-established dates and figures (Appendix B). The business cycle is the NBER's, to the month. Unemployment rates are the Bureau of Labor Statistics' later annual estimates (Lebergott's, the basis of Historical Statistics' series); the narration says "one worker in four", never a figure measured at the time, and Appendix C gives the lower alternative estimates.
  - The Great Depression band is a convention (NBER peak to Pearl Harbor); its note says others date it from the Crash, or end it in 1939.
  - "It didn't regain its 1929 peak until 1954" is the price index alone; the moment's note, and Appendix C, say that with dividends and deflation counted an investor at the peak was even by about 1936.
  - Say "a timeline we built from …" — it isn't presented as a definitive history.
  - Account and classroom claims as in Video 5: free, no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · ONE LINE (0:00 – 0:41)

### Scene 1 · 0:00 – 0:23 · The whole slump

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: 1913 at the left, 1961 at the right, the summaries crowded between 1929 and 1942, the lone "2 moments" of 1954 far to the right, and beneath the axis the long bands: The bull market, The Dow below its 1929 peak (reaching to 1954), Prohibition, The Great Depression, the presidencies, the Works Progress Administration. To its left, a vertical strip of three chips: "121 moments", "35 durations", "40 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's numbers.

**OST:** "Twelve years, on one line."

**VO:**
"This is a timeline we built of the Great Depression, from its sources: the boom of the twenties, the Crash, the slump in America and around the world, and the war that ended it. A hundred and twenty-one moments, thirty-five durations, forty links, and each one names where it comes from."

### Scene 2 · 0:23 – 0:41 · The cycle as bands

**FRAME:** The capture zooms to 1919-06 → 1943-01: the band The Great Depression (1929-08 to 1941-12), and under it the NBER's three: Contraction, Aug 1929 – Mar 1933; Recovery, Mar 1933 – May 1937; Recession, May 1937 – June 1938. A callout beside the contraction band: "43 months".

**MOTION:** A smooth zoom; each of the three bands brightens as it's named.

**OST:** "The business cycle, as bands."

**VO:**
"The bands are durations. The Great Depression itself, dated here from the business-cycle peak of August 1929 to Pearl Harbor. Under it, the business cycle as economists date it: forty-three months of contraction, four years of recovery, then a second recession in 1937."

---

## ACT 2 · THE CRASH (0:41 – 1:27)

### Scene 3 · 0:41 – 1:15 · Down to the hour

**FRAME:** The capture zooms into 1929-08-15 → 1929-11-25 under the chapter heading "The Crash": The Dow peaks at 381.17 (09-03), The Babson break, The Hatry crash in London, "A permanently high plateau" (10-15), the summaries of crash week, The Crash bottoms at 198.60 (11-13). It zooms on into 1929-10-23 → 10-30: Black Thursday, Black Monday, Black Tuesday, with arcs between them; then into one day, 1929-10-24 08:00 → 16:00: Black Thursday at 10:00, The bankers' meeting at 12:00, Whitney bids 205 for Steel at 13:30, arcs from each to the next. The bounds caption reads "UTC−05:00"; a callout: "New York time".

**MOTION:** One continuous zoom in three stages, slowing as the hours appear on the ruler; the arcs draw in as each step is named.

**OST:** "One day, down to the hour."

**VO:**
"Zoom into the autumn of 1929. The Dow peaks on September the third. In mid-October a Yale economist sees a permanently high plateau. Then the week of the Crash, and inside it one day, Black Thursday, down to the hour: the opening bell, the bankers meeting at noon, and at half past one their man on the floor, bidding for U.S. Steel. It held for a day. On Monday and Tuesday the Dow lost almost a quarter."

### Scene 4 · 1:15 – 1:27 · Peak to bottom

**FRAME:** The capture widens to 1929-08 → 1933-03 under "The slide, 1930–1932": the band The Dow, peak to bottom runs from the September 1929 peak to The Dow hits bottom: 41.22 (1932-07-08); The Dow recovers to 294 (1930-04-17) sits along the way. A callout under the band's end: "−89%".

**MOTION:** A widening zoom; the band is outlined from end to end as "two years and ten months" is said.

**OST:** "Down 89%."

**VO:**
"And the Crash was only the start. That band, the Dow from peak to bottom, runs two years and ten months, to July 1932: down eighty-nine percent."

---

## ACT 3 · BANKS AND THE WORLD (1:27 – 2:08)

### Scene 5 · 1:27 – 1:47 · One thread: banking

**FRAME:** The view 1929-06 → 1934-06 with **Separate by tags** on "banking": the upper track holds The bankers' meeting, the bands First banking panic (Nov 1930 – Jan 1931), Second banking panic (Apr–Aug 1931) and Bank runs after sterling (Sept–Oct 1931), Creditanstalt fails and Danatbank fails, The RFC, then the Banking panic of 1933 band, the summaries of March 1933, Glass–Steagall and the FDIC, and Deposit insurance begins (1934). Everything else stays in the track below.

**MOTION:** The banking moments and bands lift into their track; the four panic bands brighten in turn.

**OST:** "Four waves of panic."

**VO:**
"Pull out one thread: banking. Separate by tags, and the panics line up as bands: Nashville and the Bank of United States in 1930, Chicago in 1931, the runs after Britain left gold, and the winter of 1933, when state after state closed its banks."

### Scene 6 · 1:47 – 2:08 · The world

**FRAME:** Rejoined, then **Separate by tags** on "world" over 1929 → 1942: the upper track holds The Hatry crash in London, the Brüning chancellorship and The Hoover Moratorium bands, Creditanstalt and Danatbank (a summary), Britain leaves gold, Japan leaves gold with the Takahashi at the Finance Ministry band beginning under it, Six million out of work in Germany, The Nazis become the largest party, Hitler becomes chancellor, the London Economic Conference, and on to War in Europe and Lend-Lease.

**MOTION:** The world's moments lift into their track; a callout follows them left to right: "Vienna → Berlin → London → Tokyo".

**OST:** "A world slump."

**VO:**
"Choose world instead, and the slump is global. Austria's largest bank fails in May 1931, then Germany's banks close. Britain leaves gold that September, Japan in December, and Japan recovers among the first. In Germany six million are out of work, and in January 1933 Hitler becomes chancellor."

---

## ACT 4 · THE NEW DEAL (2:08 – 3:00)

### Scene 7 · 2:08 – 2:31 · Read a law, follow its links

**FRAME:** Rejoined, on the view 1932-12-20 → 1933-04-10, with **View mode** on: Emergency Banking Act (1933-03-09) opens in the reader over the app: its date, the tags banking and policy, the notes, a Sources list (Wikipedia and the Federal Reserve's history of the Bank Holiday of 1933), and "Related to": The national bank holiday, The first fireside chat. Choosing the fireside chat swaps the reader to it: "it is safer to keep your money in a reopened bank than under the mattress", and its own links, Banks begin to reopen and the Emergency Banking Act.

**MOTION:** The reader opens; a pointer chooses the related entry; the reader's content changes in place.

**OST:** "Every moment has its sources."

**VO:**
"Open a moment to read it. The Emergency Banking Act, passed in a single day, five days after Roosevelt took office: what it did, where that comes from, and what it's linked to. Follow a link to the first fireside chat, three days later. When the banks reopened, the deposits came back."

### Scene 8 · 2:31 – 2:42 · The Hundred Days

**FRAME:** The reader closes on the view 1933-02-25 → 1933-07-15 under the chapter heading "The New Deal": The Hundred Days band from March 9 to June 16, and above it The Civilian Conservation Corps (03-31), a two-moment summary on May 12 (the AAA and FERA, signed the same day), The Tennessee Valley Authority (05-18), Securities Act of 1933, a two-moment summary on June 16 (the NIRA and Glass–Steagall), and the London Economic Conference band starting in June.

**MOTION:** The Hundred Days band is outlined; each summary and moment lights as it's named.

**OST:** "A hundred days."

**VO:**
"The Hundred Days are a band of their own: the Civilian Conservation Corps, farm relief, the Tennessee Valley Authority, the NRA, and deposit insurance."

### Scene 9 · 2:42 – 3:00 · The Second New Deal, and the relapse

**FRAME:** A pan right to 1934-12-15 → 1938-12-31, under "The Second New Deal" and "Court fight and recession": the Works Progress Administration band starting in May 1935, The Schechter decision (05-27), The Wagner Act (07-05), the Social Security Act in a summary in August, The court-packing plan and The court plan fails (1937), the band Recession, May 1937 – June 1938, and Unemployment: 14.3% (1937) and 19.0% (1938) beside it.

**MOTION:** An even pan; the recession band brightens, and the two unemployment moments pulse as their numbers are said.

**OST:** "1937: the relapse."

**VO:**
"Then the Second New Deal: the WPA, the Wagner Act, Social Security. The Court strikes down the NRA, and Roosevelt's plan to enlarge it fails. In 1937 the recovery breaks: unemployment, fourteen percent that year, is nineteen the next."

---

## ACT 5 · THE LAND AND THE END (3:00 – 3:50)

### Scene 10 · 3:00 – 3:24 · One thread: the farm

**FRAME:** The view 1919-06 → 1943-01 with **Separate by tags** on "farm": the upper track holds Farm prices collapse (1920), Coolidge vetoes farm relief (1927), the Agricultural Marketing Act (1929), the long Dust Bowl band (1930–1939) with The first AAA under it, Dust reaches the East Coast (1934), the summary of spring 1935 (Black Sunday, the Soil Conservation Service, rural electrification), Migrant Mother (1936), The second AAA and The Grapes of Wrath (1939). A callout under the Dust Bowl band: "1930–1939".

**MOTION:** The farm's moments and bands lift into their track; a bracket draws from 1920 to the Crash on "nine years before".

**OST:** "The farm's depression came first."

**VO:**
"One more thread: the farm. Prices fell in 1920, nine years before the Crash. Then drought, from 1930 to 1939: the Dust Bowl, named after Black Sunday in April 1935. A year later Dorothea Lange photographs a migrant mother, and four years to the day after Black Sunday, Steinbeck publishes The Grapes of Wrath."

### Scene 11 · 3:24 – 3:42 · The war, and the long way back

**FRAME:** Rejoined, the capture shows 1938-12 → 1942-12 under "Toward war": War in Europe (1939-09-01) and the band War in Europe, before the US enters, 50,000 planes a year, Lend-Lease (1941-03-11), Unemployment: 9.9%, Pearl Harbor (1941-12-07) where The Great Depression band ends, Unemployment: 4.7% (1942). Then it widens to the whole line after **Fit all**, with The Dow below its 1929 peak band reaching to the moment The Dow regains its 1929 peak (1954-11-23).

**MOTION:** The Great Depression band's end is marked at Pearl Harbor; then the zoom out, and the long Dow band brightens to its end.

**OST:** "Back by 1954."

**VO:**
"What ended it was war: orders from Europe, Lend-Lease, then Pearl Harbor. One worker in four was jobless in 1933; by 1942, fewer than one in twenty. And the Dow? It didn't regain its 1929 peak until 1954."

### Scene 12 · 3:42 – 3:50 · Read it, or make your own

**FRAME:** The capture shrinks to the left half, on the whole line. On the right, the end card: "timescale.info/athan/great-depression", "Free to read, no account needed", and the source: "github.com/openchronology/timeline-app".

**MOTION:** The lines tick in; the end card rises and holds.

**OST:** "Twelve years, on one line."

**VO:**
"Open it, follow the links, or build one of your own."

**[END · ~3:50]**

---

## Appendix A · Narration only (for the voice session)

> This is a timeline we built of the Great Depression, from its sources: the boom of the twenties, the Crash, the slump in America and around the world, and the war that ended it. A hundred and twenty-one moments, thirty-five durations, forty links, and each one names where it comes from.
>
> The bands are durations. The Great Depression itself, dated here from the business-cycle peak of August 1929 to Pearl Harbor. Under it, the business cycle as economists date it: forty-three months of contraction, four years of recovery, then a second recession in 1937.
>
> Zoom into the autumn of 1929. The Dow peaks on September the third. In mid-October a Yale economist sees a permanently high plateau. Then the week of the Crash, and inside it one day, Black Thursday, down to the hour: the opening bell, the bankers meeting at noon, and at half past one their man on the floor, bidding for U.S. Steel. It held for a day. On Monday and Tuesday the Dow lost almost a quarter.
>
> And the Crash was only the start. That band, the Dow from peak to bottom, runs two years and ten months, to July 1932: down eighty-nine percent.
>
> Pull out one thread: banking. Separate by tags, and the panics line up as bands: Nashville and the Bank of United States in 1930, Chicago in 1931, the runs after Britain left gold, and the winter of 1933, when state after state closed its banks.
>
> Choose world instead, and the slump is global. Austria's largest bank fails in May 1931, then Germany's banks close. Britain leaves gold that September, Japan in December, and Japan recovers among the first. In Germany six million are out of work, and in January 1933 Hitler becomes chancellor.
>
> Open a moment to read it. The Emergency Banking Act, passed in a single day, five days after Roosevelt took office: what it did, where that comes from, and what it's linked to. Follow a link to the first fireside chat, three days later. When the banks reopened, the deposits came back.
>
> The Hundred Days are a band of their own: the Civilian Conservation Corps, farm relief, the Tennessee Valley Authority, the NRA, and deposit insurance.
>
> Then the Second New Deal: the WPA, the Wagner Act, Social Security. The Court strikes down the NRA, and Roosevelt's plan to enlarge it fails. In 1937 the recovery breaks: unemployment, fourteen percent that year, is nineteen the next.
>
> One more thread: the farm. Prices fell in 1920, nine years before the Crash. Then drought, from 1930 to 1939: the Dust Bowl, named after Black Sunday in April 1935. A year later Dorothea Lange photographs a migrant mother, and four years to the day after Black Sunday, Steinbeck publishes The Grapes of Wrath.
>
> What ended it was war: orders from Europe, Lend-Lease, then Pearl Harbor. One worker in four was jobless in 1933; by 1942, fewer than one in twenty. And the Dow? It didn't regain its 1929 peak until 1954.
>
> Open it, follow the links, or build one of your own.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                                                                                                      | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The sample: 121 moments (8 chapter headings), 35 durations, 40 relationships                                                                                                                                                                               | `node publicity/video/samples/build.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2     | The Great Depression band: NBER peak (August 1929) to Pearl Harbor (1941-12-07), a convention; commonly dated 1929–1939 or 1929–1941                                                                                                                       | [Great Depression](https://en.wikipedia.org/wiki/Great_Depression); [Federal Reserve History: The Great Depression](https://www.federalreservehistory.org/essays/great-depression)                                                                                                                                                                                                                                                                               |
| 2     | NBER: peak August 1929, trough March 1933 (43 months); expansion to May 1937 (50 months, "four years"); recession May 1937 – June 1938 (13 months)                                                                                                         | [NBER business-cycle dates](https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions)                                                                                                                                                                                                                                                                                                                                                    |
| 3     | Dow peak 381.17 on 1929-09-03; Fisher's "permanently high plateau", mid-October 1929                                                                                                                                                                       | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929); [Irving Fisher](https://en.wikipedia.org/wiki/Irving_Fisher)                                                                                                                                                                                                                                                                                                               |
| 3     | Black Thursday 1929-10-24: 12.9 million shares; the bankers met at the House of Morgan around midday; Richard Whitney bid for U.S. Steel at about 1:30 p.m.; the Dow closed down 2.09%                                                                     | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929); [Richard Whitney](<https://en.wikipedia.org/wiki/Richard_Whitney_(financier)>)                                                                                                                                                                                                                                                                                             |
| 3     | Black Monday −12.82%, Black Tuesday −11.73%: −23.05% over the two days ("almost a quarter")                                                                                                                                                                | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929)                                                                                                                                                                                                                                                                                                                                                                             |
| 3     | Times read as New York's: the display is a fixed UTC−05:00; New York's daylight time ended in late September 1929, before the Crash                                                                                                                        | [Time presentation](../docs/time-presentation.md); `great-depression.mjs`                                                                                                                                                                                                                                                                                                                                                                                        |
| 4     | Bottom 41.22 on 1932-07-08, −89.2% from the peak; 1929-09-03 → 1932-07-08 is 1,039 days, two years, ten months and five days                                                                                                                               | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929)                                                                                                                                                                                                                                                                                                                                                                             |
| 5     | Panics: Caldwell and Company (Bank of Tennessee closed 1930-11-07) and the Bank of United States (1930-12-11); Chicago, spring and summer 1931; after Britain left gold (1931-09-21); Michigan's holiday (1933-02-14) to the national one (1933-03-06)     | [Federal Reserve History: Banking panics of 1930–31](https://www.federalreservehistory.org/essays/banking-panics-1930-31); [Bank Holiday of 1933](https://www.federalreservehistory.org/essays/bank-holiday-of-1933); [Great Depression in the United States](https://en.wikipedia.org/wiki/Great_Depression_in_the_United_States)                                                                                                                               |
| 6     | Creditanstalt, Austria's largest bank, 1931-05-11; Danatbank 1931-07-13 and Germany's bank closures; Britain off gold 1931-09-21; Japan 1931-12-13, with Takahashi's recovery                                                                              | [Creditanstalt](https://www.federalreservehistory.org/essays/creditanstalt-failure); [European banking crisis of 1931](https://en.wikipedia.org/wiki/European_banking_crisis_of_1931); [Takahashi Korekiyo](https://en.wikipedia.org/wiki/Takahashi_Korekiyo)                                                                                                                                                                                                    |
| 6     | About six million registered unemployed in Germany (early 1932, and again early 1933); Hitler appointed 1933-01-30                                                                                                                                         | [Great Depression in Germany](https://en.wikipedia.org/wiki/Great_Depression_in_Germany); [Hitler's rise to power](https://en.wikipedia.org/wiki/Adolf_Hitler%27s_rise_to_power)                                                                                                                                                                                                                                                                                 |
| 7     | Emergency Banking Act passed and signed 1933-03-09, five days after the 1933-03-04 inauguration; fireside chat 1933-03-12, three days later; banks in the Federal Reserve cities reopened on 1933-03-13, and by March 15 deposits far exceeded withdrawals | [Emergency Banking Act](https://en.wikipedia.org/wiki/Emergency_Banking_Act); [Bank Holiday of 1933](https://www.federalreservehistory.org/essays/bank-holiday-of-1933)                                                                                                                                                                                                                                                                                          |
| 8     | Hundred Days 1933-03-09 → 06-16; CCC 03-31; AAA 05-12; TVA 05-18; NIRA and the Banking Act of 1933 (the FDIC) 06-16                                                                                                                                        | [First 100 days](https://en.wikipedia.org/wiki/First_100_days_of_Franklin_D._Roosevelt%27s_presidency); [TVA Act](https://www.archives.gov/milestone-documents/tennessee-valley-authority-act); [FDIC history](https://www.fdic.gov/about/history)                                                                                                                                                                                                               |
| 9     | WPA 1935-05-06; Schechter 1935-05-27; Wagner Act 1935-07-05; Social Security Act 1935-08-14; court plan 1937-02-05, recommitted 1937-07-22                                                                                                                 | [WPA](https://en.wikipedia.org/wiki/Works_Progress_Administration); [Schechter](https://en.wikipedia.org/wiki/Schechter_Poultry_Corp._v._United_States); [National Archives: NLRA](https://www.archives.gov/milestone-documents/national-labor-relations-act), [Social Security Act](https://www.archives.gov/milestone-documents/social-security-act); [Judicial Procedures Reform Bill](https://en.wikipedia.org/wiki/Judicial_Procedures_Reform_Bill_of_1937) |
| 9     | Unemployment 14.3% (1937), 19.0% (1938): 7.70 and 10.39 million of a civilian labour force of 54.00 and 54.61 million                                                                                                                                      | [BLS, Monthly Labor Review 1948, table 1](https://www.bls.gov/opub/mlr/1948/article/pdf/labor-force-employment-and-unemployment-1929-39-estimating-methods.pdf)                                                                                                                                                                                                                                                                                                  |
| 10    | Farm prices collapsed in the depression of 1920–21; drought from summer 1930 to fall 1939; Black Sunday 1935-04-14 and the name "Dust Bowl"                                                                                                                | [Depression of 1920–21](https://en.wikipedia.org/wiki/Depression_of_1920–1921); [Dust Bowl](https://en.wikipedia.org/wiki/Dust_Bowl); [Black Sunday](<https://en.wikipedia.org/wiki/Black_Sunday_(storm)>)                                                                                                                                                                                                                                                       |
| 10    | Migrant Mother, March 1936 ("a year later"); The Grapes of Wrath published 1939-04-14, four years to the day after Black Sunday                                                                                                                            | [Migrant Mother](https://en.wikipedia.org/wiki/Migrant_Mother); [Library of Congress](https://www.loc.gov/pictures/item/2017762891/); [The Grapes of Wrath](https://en.wikipedia.org/wiki/The_Grapes_of_Wrath)                                                                                                                                                                                                                                                   |
| 11    | Lend-Lease 1941-03-11; Pearl Harbor 1941-12-07; unemployment 24.9% (1933, "one in four") and 4.7% (1942, "fewer than one in twenty"): 12.83 of 51.59 million, and 2.66 of 56.41 million                                                                    | [Lend-Lease](https://en.wikipedia.org/wiki/Lend-Lease); [BLS, table 1](https://www.bls.gov/opub/mlr/1948/article/pdf/labor-force-employment-and-unemployment-1929-39-estimating-methods.pdf)                                                                                                                                                                                                                                                                     |
| 11    | The Dow first closed above 381.17 again on 1954-11-23 (382.74), 25 years after the peak; with dividends and deflation, even by about late 1936                                                                                                             | [Wall Street crash of 1929](https://en.wikipedia.org/wiki/Wall_Street_crash_of_1929); [Mark Hulbert, "25 Years to Bounce Back? Try 4½"](https://www.historynewsnetwork.org/article/79770)                                                                                                                                                                                                                                                                        |
| 12    | Public timelines need no account                                                                                                                                                                                                                           | [FAQ](../docs/faq.md#do-i-need-an-account)                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Appendix C · Questions this audience is likely to ask

1. **When did the Depression start and end?** There's no single answer. The NBER dates the downturn from August 1929, two months before the Crash, to March 1933, with a second recession in 1937–38; many histories date the Depression from the Crash, and end it in 1939 with the war in Europe or in 1941 with Pearl Harbor. The band uses one convention and its note says so.
2. **Were a quarter of Americans really unemployed?** About a quarter of the labour force (not of the population) in 1933, by the Bureau of Labor Statistics' estimates, made later from censuses and payrolls: no one measured unemployment directly at the time. Economists who count people on work relief (the WPA, the CCC) as employed put the later 1930s several points lower; each moment's note says this.
3. **Did it really take 25 years to get back?** For the Dow's price, yes: November 1954. But prices in general fell sharply in the early 1930s, and stocks paid dividends; counting both, an investor who bought at the 1929 peak had broken even by about 1936. The moment's note says so, with its source.
4. **Why does it say UTC−05:00?** So the Crash's market hours read as New York's: the Exchange opened at 10 a.m. Eastern standard time. Date-only moments sit at midnight of their day; events abroad are on their local day.
5. **Why are some moments shown as "2 moments" however far I zoom?** Laws signed the same day (the AAA and FERA, the NIRA and Glass–Steagall) are placed an hour apart, so they separate only when zoomed to the hour; each one's dating note says so.
6. **Can I use this in class?** Yes: import `great-depression.ochx`, or open the public timeline, then edit a copy or publish it from your own account. Students can separate by any tag (labor, policy, culture) for a thread of their own.
