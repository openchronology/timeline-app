# OpenChronology — Tour: The COVID-19 Pandemic, 2019–2023. Script and Storyboard

**Runtime:** ~3:50 (at 140 wpm, with pauses) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Archive** look · **Aspect:** 16:9
**Audience:** students and teachers of recent history, health and science, and anyone who lived through the pandemic and has lost track of its order. Teachers will judge it as classroom material on a subject many people feel strongly about, so it must be accurate, calm and neutral: dates and sources, not verdicts.
**Purpose:** show a recent, worldwide event the way a class would read it: the whole three and a half years, the first thirty days up close, the lockdowns of spring 2020 as overlapping bands, the counts and what they leave out, the vaccine thread from genome to first dose, a moment read with its sources and its dating, the variants of concern as WHO named them, and the end of the emergency, to the day.

**How it differs:** the other history tours span centuries; this one spans 41 months, so most of its dates are known to the day and a few to the minute, and it shows how a timeline handles a subject still being counted and studied: counts labelled as counts, an estimate labelled as an estimate, waves as approximate bands, and an open question (the virus's origin) stated as open. The subject leads; each control is named once, by what it does for the history.

**Production notes:**

- Narration is 534 words, about 140 wpm when read, in the voice of a good teacher of recent history: clear, unhurried and even-toned. Many viewers lost people in the pandemic; no music stings, no dramatic pauses on the death counts. Scenes 4 and 8 are the ones to trim if it must be shorter.
- **The timeline is the sample `publicity/video/samples/covid-19.ochx`**, built from `covid-19.mjs`: 100 moments (7 of them chapter headings), 27 durations (2 emergencies, 12 lockdowns and quarantines, 7 waves, the Tokyo Games, the WHO missions and "From genome to first authorised dose"), 41 relationships, sources on every moment, the Timeline theme in archive colours. Bands are coloured by kind: ochre for the two emergencies, navy for lockdowns, brick for waves, grey for events and missions, green for the genome-to-dose span. Moments: green for science and vaccines, brick for variants, grey for counts, ochre for WHO's declarations. Tags: `chapter`, `who`, `spread`, `measures`, `science`, `vaccine`, `variant`, `milestone`. It will be published at `timescale.info/athan/covid-19`.
- **Shots** are captured from the real editor in full screen with `common/capture.mjs` (`shots.json` in the video's folder, when it is made) and shown in a browser frame; the infographic layer adds titles, chips and arrows around the frame, never over the app's own text. Views below are UTC dates; in `shots.json` they are seconds since 1970 (Gregorian display). The whole span is 2019-11-10 to 2023-06-20.
- **Capture notes:** every `open` goes under a shot's `actions`, not `setup`. Readers are opened from a view whose left edge is in an earlier year than the moment, so the reader shows the year (the reader drops a moment's year when the view starts in the same year), and readers are opened in an unseparated view (in a separated view, View mode opens the editor instead). Scene 6's reader (Margaret Keenan, three days from the FDA's authorization) is captured at 1920 × 1080 CSS pixels, scale 1, with **Group within** set to 12 px by an `eval` in `setup`, so the moment stands alone at a year's width; Scene 7's Omicron reader the same way. The duration reader shows the span, tags, notes and related entities, but no Sources or Date precision: only moments show those, so the scripts open moments where sources are the point.
- **What the bands do at a distance:** after **Fit all**, the two emergencies (WHO's, 30 January 2020 to 5 May 2023, and the US one, 31 January 2020 to 11 May 2023) are near-identical spans and share one band, "US public health emergency + 1 more"; zooming in draws them apart. In spring 2020 Spain's and France's lockdowns share one band ("Spain's lockdown + 1 more"), and so do Peru's and England's. That's the app's grouping of [near-identical spans](../docs/durations.md#dense-windows), and the callout in Scene 3 says so.
- **Same-day moments** are drawn a few hours apart so they can separate (genome and first reported death; Alpha, Beta and the Moderna authorization; WHO's statement and the US end date on 30 January 2023); each says so in its **Date precision**. At a month's width some still sit in one summary ("2 moments"); that's expected, and the narration doesn't point at them.
- **Accuracy guardrails:**
  - Dates come from WHO statements and reports, regulators, the CDC and peer-reviewed papers, with Wikipedia as the general reference (Appendix B). Dates are UTC days unless a time is given.
  - Counts are **confirmed** cases and deaths as reported (the Johns Hopkins CSSE count on the day it passed each mark); say "confirmed" or "reported". WHO's **14.9 million excess deaths** for 2020–2021 is an **estimate**, with a range of 13.3 to 16.6 million; say "estimate" every time.
  - **The origin of the virus:** say only that it has not been established, remains under investigation and is debated, citing WHO's reports (the 2021 joint study, SAGO's 2022 and 2025 reports). Never present a hypothesis as the answer, and don't list them.
  - **Measures** are described with their dates and extent, never their merits. No "worked", "failed", "harsh", "too late" or "too soon". The same for vaccines: what was authorised, when, by whom; the one safety finding in the sample (EMA, 7 April 2021) is a regulator's finding, stated as such, and the script doesn't single it out.
  - Waves are **approximate**: dated from Our World in Data's global curves; say "roughly".
  - Name people only as the sources do: Li Wenliang, Zhang Yongzhen, Edward Holmes, Margaret Keenan, Sandra Lindsay, Tedros Adhanom Ghebreyesus, Zhong Nanshan.
  - Say "a timeline we built from …" — it isn't presented as a definitive history.
  - Account and classroom claims as in Video 5: free; no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · EMERGENCE (0:00 – 1:00)

### Scene 1 · 0:00 – 0:25 · The whole pandemic

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**, 2019-11-10 to 2023-06-20: a row of summaries along the axis ("15 moments" at January 2020), the long ochre band "US public health emergency + 1 more" from January 2020 to May 2023, the green "From genome to first authorised dose", navy lockdown bands bunched in spring 2020, brick waves ("Northern winter wave", "India's second wave", "Delta wave", "Omicron wave", "BA.5 wave", "China's winter wave") and arcs above. To its left, a vertical strip of three chips: "100 moments", "27 durations", "41 links".

**MOTION:** The frame rises into place; the chips tick in on the narration's "moments", "bands" and "linked".

**OST:** "Wuhan, 2019, to the end of the emergency, 2023."

**VO:**
"Here's a timeline we built of the COVID-19 pandemic, from the first reported cluster in Wuhan at the end of 2019 to the end of the global health emergency in May 2023. Emergencies, lockdowns and waves are bands; declarations, discoveries and counts are moments, each linked to the sources it draws on: WHO, health agencies, regulators and scientific papers."

### Scene 2 · 0:25 – 1:00 · Thirty days in January

**FRAME:** The capture zooms to 4 January – 3 February 2020: "WHO's first outbreak news" (01-05), "A new coronavirus identified" (01-09, green), a summary of two at 01-11 (the genome and the first reported death), "First case outside China" (01-13), "Human-to-human spread confirmed" (01-20), "First US case" (01-21), "Emergency Committee first meets" (01-22), "Wuhan locked down" (01-23, 02h) with the navy "Wuhan lockdown" band starting beneath it, "A public health emergency of international concern" (01-30, ochre) and the green "From genome to first authorised dose" band running out of frame to the right. Small callouts at the edge: "31 Dec: a cluster reported" (just off the left) and "origin: still under investigation", in the look's small serif.

**MOTION:** A continuous zoom; the callouts draw in on the narration's "December" and "origin".

**OST:** "Thirty days in January."

**VO:**
"On the last day of 2019, Wuhan's health commission reports a cluster of pneumonia of unknown cause. Zoom into the next month and it moves fast: a new coronavirus identified on January ninth; its genome published two days later; a first case outside China; human-to-human spread confirmed; Wuhan locked down on the twenty-third; and on the thirtieth, WHO's highest alarm, a public health emergency of international concern. Where the virus came from has not been established. It remains under investigation and debated, and the timeline cites WHO's reports on it, and leaves it there."

---

## ACT 2 · A PANDEMIC (1:00 – 1:55)

### Scene 3 · 1:00 – 1:25 · One thread: measures

**FRAME:** The view 20 December 2019 – 31 December 2020. **Separate by tags** with "measures" chosen: a track rises above the rest holding "Huanan market closed", "Wuhan locked down", "Tokyo Olympics postponed" and "WHO advice on masks", and beneath them the navy bands stacked row on row: "Wuhan lockdown", "Diamond Princess quarantine", "Italy's national lockdown", "Spain's lockdown + 1 more", "Peru's lockdown + 1 more", "India's nationwide lockdown", "New Zealand's lockdown", "South Africa's national lockdown", then "Melbourne's second lockdown" and "England's second lockdown" later in the year, under the ochre "US public health emergency". The lower track shows "A pandemic" as a heading. A small callout by the grouped bands: "+ 1 more: two lockdowns with nearly the same dates".

**MOTION:** The tagged events lift into their own track; the bands of March 2020 draw in row by row.

**OST:** "Spring 2020, on one line."

**VO:**
"On March eleventh, WHO says the outbreak can be called a pandemic. Separate by tags, choose measures, and the spring of 2020 stacks up: Italy's national lockdown from March ninth, then Spain, France, England, India, New Zealand, South Africa, within three weeks of each other. Even the Tokyo Olympics moved, postponed on March twenty-fourth."

### Scene 4 · 1:25 – 1:55 · What the counts say, and don't

**FRAME:** Two shots. First, the whole span with **Separate by tags** "milestone": the upper track holds the grey counts, "1 million confirmed cases" (2020-04-02) through "6 million confirmed deaths" (2022-03-07), "The most cases reported in a week" and "Johns Hopkins stops counting" (2023-03-10). Then, unseparated, the view 1 December 2021 – 31 August 2022 with **View mode** on and "WHO estimates 14.9 million excess deaths" open in the reader: 2022-05-05, tags who and milestone, the note with "estimates" and "14.9 million" in bold and "range 13.3 to 16.6 million", Sources (WHO's news release and the _Nature_ paper), Related to: "5 million confirmed deaths".

**MOTION:** The counts lift into their own track; a cut to the reader opening over the app.

**OST:** "A count, and an estimate."

**VO:**
"Pull out the counts and they climb: one million confirmed deaths by the end of September 2020, six million by March 2022. But a confirmed death is one that was tested and reported. Open WHO's estimate of excess deaths in 2020 and 2021, and it's about 14.9 million, nearly three times the count for those years. The timeline labels it what it is: an estimate."

---

## ACT 3 · FROM GENOME TO DOSE (1:55 – 2:50)

### Scene 5 · 1:55 – 2:25 · One thread: vaccines

**FRAME:** The view 20 December 2019 – 15 March 2021, **Separate by tags** with "vaccine": the upper track holds the green "From genome to first authorised dose" band from 11 January to 8 December 2020, "First vaccine trial dose" (2020-03-16), a summary of two in April (the Oxford trial and the ACT Accelerator), "Phase 3 vaccine trials begin" (2020-07-27), "Russia registers Sputnik V" (2020-08-11), and the summaries of November and December 2020. A callout beside the band: "65 days to the first trial dose".

**MOTION:** The tagged events lift; the band highlights; the callout draws in on "sixty-five".

**OST:** "From genome to dose."

**VO:**
"Now follow the science. Separate by tags, choose vaccine, and the band runs from the genome's publication in January 2020. Sixty-five days later, on March sixteenth, a volunteer in Seattle gets the first dose in a vaccine trial. Large trials begin in July; in November, the first results."

### Scene 6 · 2:25 – 2:50 · Read a moment: the first dose

**FRAME:** The view 20 December 2019 – 10 January 2021, unseparated, **View mode** on, Group within at 12 px. "First authorised dose: Margaret Keenan" open in the reader: 2020-12-08, tag vaccine, the note (Margaret Keenan, 90, University Hospital, Coventry, 6:31 a.m.), Date precision "8 December 2020, 06:31 GMT (UTC), as the NHS reported it", Sources, Related to: "From genome to first authorised dose", "First vaccine authorised: UK", "7 more through other relationships".

**MOTION:** The reader opens over the app; the Date precision line highlights.

**OST:** "Every moment has its sources."

**VO:**
"Open a moment to read it. On December second, the UK's regulator authorises the Pfizer–BioNTech vaccine: the first authorisation anywhere of a COVID-19 vaccine after a full phase 3 trial. Six days later, at 6:31 in the morning, Margaret Keenan, ninety, gets the first dose given outside a trial. The reader shows how precisely that's known, and where it comes from. The United States authorises the same vaccine three days later."

---

## ACT 4 · VARIANTS AND THE END (2:50 – 3:50)

### Scene 7 · 2:50 – 3:20 · One thread: variants

**FRAME:** The whole span, **Separate by tags** with "variant": the upper track holds a summary of three in December 2020 (the UK's report, Alpha and Beta), "P.1 a variant of concern (Gamma)" (2021-01-11), "B.1.617.2 a variant of interest (Delta)" (2021-04-04), a summary of two in May 2021 (Delta a variant of concern, Greek letters), a summary of two in November 2021 (South Africa's report, Omicron) and "No variant of concern circulating" (2023-03-15). In the lower track, the brick waves: "Delta wave", "Omicron wave", "BA.5 wave". Then a cut to the reader for "Omicron a variant of concern" (2021-11-26), opened from the view 1 October 2021 – 31 January 2022 at Group within 12 px, with Related to: "South Africa reports B.1.1.529", "Omicron wave".

**MOTION:** The variants lift into their own track; the waves below highlight in turn on "Delta" and "Omicron"; a cut to the reader.

**OST:** "Named by WHO."

**VO:**
"The virus changed. Separate the variants: WHO designates Alpha and Beta variants of concern in December 2020, Gamma in January, Delta in May 2021, and that month gives them Greek letters instead of the names of places. On November twenty-sixth, two days after South Africa reports it, Omicron. The waves they drove sit below as bands, dated roughly, because waves have no agreed start or end."

### Scene 8 · 3:20 – 3:38 · The end of the emergency

**FRAME:** The view 15 November 2022 – 10 June 2023: the heading "The end of the emergency", "China eases its measures" (2022-12-07), "China reopens its borders" (2023-01-08), "WHO: still an emergency" and "US sets an end date" (2023-01-30), "Johns Hopkins stops counting", "No variant of concern circulating", "WHO: no longer a global emergency" (2023-05-05, ochre) and "US public health emergency ends" (2023-05-11), the ochre emergency bands ending above them. Then, from the view 20 December 2022 – 1 June 2023 with **View mode** on, "WHO: no longer a global emergency" open in the reader, Related to: "A public health emergency of international concern · 2020-01-30 → 2023-05-05".

**MOTION:** A zoom to the last months; the two emergency bands end, one after the other; a cut to the reader, the related band's span highlighting.

**OST:** "1,191 days."

**VO:**
"And then the end. On May fifth, 2023, WHO declares that COVID-19 is no longer a global health emergency, 1,191 days after declaring it one, with nearly seven million deaths reported and, WHO says, many more uncounted. Six days later, the United States ends its own."

### Scene 9 · 3:38 – 3:50 · Your class's timeline

**FRAME:** The capture shrinks to the left half. On the right, three short lines with icons: "Read it: no account needed", "Build one: a year, a country, a topic", "Share it: a link, or embedded in your class page". End card: "timescale.info/athan/covid-19", and the source: "github.com/openchronology/timeline-app".

**MOTION:** The lines tick in; the end card rises and holds.

**OST:** "Make your class's timeline."

**VO:**
"Anyone can read a public timeline like this, no account needed. Build one with your class, for a year, a country or a single thread, and share it with a link."

**[END · ~3:50]**

---

## Appendix A · Narration only (for the voice session)

> Here's a timeline we built of the COVID-19 pandemic, from the first reported cluster in Wuhan at the end of 2019 to the end of the global health emergency in May 2023. Emergencies, lockdowns and waves are bands; declarations, discoveries and counts are moments, each linked to the sources it draws on: WHO, health agencies, regulators and scientific papers.
>
> On the last day of 2019, Wuhan's health commission reports a cluster of pneumonia of unknown cause. Zoom into the next month and it moves fast: a new coronavirus identified on January ninth; its genome published two days later; a first case outside China; human-to-human spread confirmed; Wuhan locked down on the twenty-third; and on the thirtieth, WHO's highest alarm, a public health emergency of international concern. Where the virus came from has not been established. It remains under investigation and debated, and the timeline cites WHO's reports on it, and leaves it there.
>
> On March eleventh, WHO says the outbreak can be called a pandemic. Separate by tags, choose measures, and the spring of 2020 stacks up: Italy's national lockdown from March ninth, then Spain, France, England, India, New Zealand, South Africa, within three weeks of each other. Even the Tokyo Olympics moved, postponed on March twenty-fourth.
>
> Pull out the counts and they climb: one million confirmed deaths by the end of September 2020, six million by March 2022. But a confirmed death is one that was tested and reported. Open WHO's estimate of excess deaths in 2020 and 2021, and it's about 14.9 million, nearly three times the count for those years. The timeline labels it what it is: an estimate.
>
> Now follow the science. Separate by tags, choose vaccine, and the band runs from the genome's publication in January 2020. Sixty-five days later, on March sixteenth, a volunteer in Seattle gets the first dose in a vaccine trial. Large trials begin in July; in November, the first results.
>
> Open a moment to read it. On December second, the UK's regulator authorises the Pfizer–BioNTech vaccine: the first authorisation anywhere of a COVID-19 vaccine after a full phase 3 trial. Six days later, at 6:31 in the morning, Margaret Keenan, ninety, gets the first dose given outside a trial. The reader shows how precisely that's known, and where it comes from. The United States authorises the same vaccine three days later.
>
> The virus changed. Separate the variants: WHO designates Alpha and Beta variants of concern in December 2020, Gamma in January, Delta in May 2021, and that month gives them Greek letters instead of the names of places. On November twenty-sixth, two days after South Africa reports it, Omicron. The waves they drove sit below as bands, dated roughly, because waves have no agreed start or end.
>
> And then the end. On May fifth, 2023, WHO declares that COVID-19 is no longer a global health emergency, 1,191 days after declaring it one, with nearly seven million deaths reported and, WHO says, many more uncounted. Six days later, the United States ends its own.
>
> Anyone can read a public timeline like this, no account needed. Build one with your class, for a year, a country or a single thread, and share it with a link.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                              | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The sample: 100 moments, 27 durations, 41 relationships                                                                                                                            | `node publicity/video/samples/build.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2     | 31 Dec 2019: Wuhan Municipal Health Commission reports a cluster of pneumonia; WHO's China office picks it up                                                                      | [WHO timeline](https://www.who.int/news/item/27-04-2020-who-timeline---covid-19)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2     | Novel coronavirus identified 9 Jan 2020; genome posted on Virological.org 11 Jan 2020, 01:05 UTC                                                                                   | [SARS-CoV-2](https://en.wikipedia.org/wiki/SARS-CoV-2); [Virological.org post](https://virological.org/t/novel-2019-coronavirus-genome/319) (its `created_at`); [Wu et al., Nature 2020](https://doi.org/10.1038/s41586-020-2008-3)                                                                                                                                                                                                                                                                     |
| 2     | Thailand's case 13 Jan; human-to-human spread confirmed 20 Jan; Wuhan lockdown 23 Jan, 10:00 local; PHEIC declared 30 Jan 2020                                                     | [WHO timeline](https://www.who.int/news/item/27-04-2020-who-timeline---covid-19); [Zhong Nanshan](https://en.wikipedia.org/wiki/Zhong_Nanshan); [COVID-19 lockdown in China](https://en.wikipedia.org/wiki/COVID-19_lockdown_in_China); [WHO statement, 30 Jan 2020](<https://www.who.int/news/item/30-01-2020-statement-on-the-second-meeting-of-the-international-health-regulations-(2005)-emergency-committee-regarding-the-outbreak-of-novel-coronavirus-(2019-ncov)>)                             |
| 2     | The origin has not been established; it remains under investigation and is debated                                                                                                 | [WHO-convened origins study, 2021](https://www.who.int/publications/i/item/who-convened-global-study-of-origins-of-sars-cov-2-china-part); [SAGO](https://en.wikipedia.org/wiki/Scientific_Advisory_Group_for_the_Origins_of_Novel_Pathogens) (2022 preliminary report); [SAGO assessment, 2025](https://www.who.int/publications/m/item/independent-assessment-of-the-origins-of-sars-cov-2-from-the-scientific-advisory-group-for-the-origins-of-novel-pathogens)                                     |
| 3     | WHO characterizes COVID-19 as a pandemic, 11 Mar 2020                                                                                                                              | [WHO Director-General's remarks, 11 Mar 2020](https://www.who.int/news-room/speeches/item/who-director-general-s-opening-remarks-at-the-media-briefing-on-covid-19---11-march-2020)                                                                                                                                                                                                                                                                                                                     |
| 3     | Lockdowns: Italy 9 Mar–18 May; Spain 14 Mar; France 17 Mar–11 May; England and New Zealand 23 Mar; India 25 Mar–31 May; South Africa 26 Mar 2020                                   | [COVID-19 lockdowns](https://en.wikipedia.org/wiki/COVID-19_lockdowns) (its table); [COVID-19 lockdowns in Italy](https://en.wikipedia.org/wiki/COVID-19_lockdowns_in_Italy); [COVID-19 lockdown in India](https://en.wikipedia.org/wiki/COVID-19_lockdown_in_India)                                                                                                                                                                                                                                    |
| 3     | Tokyo 2020 postponed 24 Mar 2020; held 23 Jul–8 Aug 2021                                                                                                                           | [2020 Summer Olympics](https://en.wikipedia.org/wiki/2020_Summer_Olympics)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4     | Confirmed deaths passed 1 million on 28 Sep 2020 and 6 million on 7 Mar 2022 (JHU CSSE count, as reported)                                                                         | [Johns Hopkins CSSE](https://coronavirus.jhu.edu/); [Our World in Data](https://ourworldindata.org/covid-deaths); [COVID-19 pandemic deaths](https://en.wikipedia.org/wiki/COVID-19_pandemic_deaths)                                                                                                                                                                                                                                                                                                    |
| 4     | WHO estimate: 14.9 million excess deaths (13.3–16.6 million) in 2020–2021, nearly three times the 5.4 million reported                                                             | [WHO, 5 May 2022](https://www.who.int/news/item/05-05-2022-14.9-million-excess-deaths-were-associated-with-the-covid-19-pandemic-in-2020-and-2021); [Msemburi et al., Nature 2023](https://doi.org/10.1038/s41586-022-05522-2)                                                                                                                                                                                                                                                                          |
| 5     | First trial dose 16 Mar 2020 in Seattle (mRNA-1273): 65 calendar days after 11 Jan; phase 3 trials began 27 Jul; Pfizer–BioNTech's interim results 9 Nov 2020                      | [NIH, 16 Mar 2020](https://www.nih.gov/news-events/news-releases/nih-clinical-trial-investigational-vaccine-covid-19-begins); [Moderna COVID-19 vaccine](https://en.wikipedia.org/wiki/Moderna_COVID-19_vaccine); [Polack et al., NEJM 2020](https://doi.org/10.1056/NEJMoa2034577)                                                                                                                                                                                                                     |
| 6     | MHRA authorisation 2 Dec 2020; Margaret Keenan's dose 8 Dec 2020, 06:31 GMT, at 90; FDA EUA 11 Dec 2020                                                                            | [MHRA, 2 Dec 2020](https://www.gov.uk/government/news/uk-medicines-regulator-gives-approval-for-first-uk-covid-19-vaccine); [COVID-19 vaccination in the UK](https://en.wikipedia.org/wiki/COVID-19_vaccination_in_the_United_Kingdom); [FDA EUA letter](https://www.fda.gov/media/144412/download)                                                                                                                                                                                                     |
| 7     | WHO designations: Alpha and Beta 18 Dec 2020; Gamma 11 Jan 2021; Delta VOI 4 Apr, VOC 11 May 2021; Greek labels 31 May 2021; Omicron 26 Nov 2021 (reported by South Africa 24 Nov) | [WHO variant tracking](https://www.who.int/activities/tracking-SARS-CoV-2-variants); [WHO weekly update 42](https://www.who.int/docs/default-source/coronaviruse/situation-reports/20210601_weekly_epi_update_42.pdf); [WHO labels](https://www.who.int/news/item/31-05-2021-who-announces-simple-easy-to-say-labels-for-sars-cov-2-variants-of-interest-and-concern); [WHO on Omicron](<https://www.who.int/news/item/26-11-2021-classification-of-omicron-(b.1.1.529)-sars-cov-2-variant-of-concern>) |
| 7     | Waves are approximate                                                                                                                                                              | [Our World in Data: cases](https://ourworldindata.org/covid-cases)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 8     | PHEIC ended 5 May 2023, 1,191 days after 30 Jan 2020; nearly 7 million deaths reported to WHO, the true toll higher; US public health emergency ended 11 May 2023                  | [WHO statement, 5 May 2023](<https://www.who.int/news/item/05-05-2023-statement-on-the-fifteenth-meeting-of-the-international-health-regulations-(2005)-emergency-committee-regarding-the-coronavirus-disease-(covid-19)-pandemic>); [HHS fact sheet](https://www.hhs.gov/about/news/2023/05/09/fact-sheet-end-of-the-covid-19-public-health-emergency.html); the day count is ours, from the two dates                                                                                                 |
| 9     | Public timelines need no account; links and embeds; accounts are for people 13 and older                                                                                           | [FAQ](../docs/faq.md#do-i-need-an-account), [sharing](../docs/sharing.md#embedding), [moderation: ages](../docs/moderation.md#ages)                                                                                                                                                                                                                                                                                                                                                                     |

## Appendix C · Questions this audience is likely to ask

1. **Where did the virus come from?** That hasn't been established. WHO's reports (the 2021 joint study with China, and its Scientific Advisory Group for the Origins of Novel Pathogens in 2022 and 2025) say the question remains open and needs more information; it is still debated. The timeline records those reports and their dates, not a conclusion.
2. **Why two different death numbers?** Confirmed deaths are the ones tested, attributed to COVID-19 and reported; they depend on each country's testing and reporting. Excess mortality compares all deaths with the number expected without the pandemic; WHO's figure for 2020–2021 is a modelled estimate with a range. The timeline gives both and labels each.
3. **Why do some lockdowns show "+ 1 more"?** At that zoom, two lockdowns with nearly the same start and end share one band; choose it to list both, or zoom in and they draw apart.
4. **Why are the dates in UTC?** One clock for a worldwide event. A few moments carry a time (the genome's posting, Margaret Keenan's dose); everything else is the day, and the reader's **Date precision** says when a local date differs.
5. **Is it complete?** No: it's a sample of the main declarations, measures, science and counts, worldwide. Import `covid-19.ochx` and add your country's own dates, or **Compare** it with a timeline of your own.
6. **Can my students use it without accounts?** Yes, to read public timelines and to make one in the browser and export it. Students 13 and older can sign up to save to the server.
