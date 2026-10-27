# OpenChronology — Short 19: From Genome to First Dose in 332 Days. Script and Storyboard

**Runtime:** ~0:42 · **Shape:** the zoom · **Look:** Archive · **Aspect:** 9:16
**For:** history and science "did you know" feeds: students, teachers and anyone who lived through 2020. Everyone remembers that year; few have put its two ends side by side. What stops the scroll is one number they can check: from the virus's genome appearing online to the first authorised vaccine dose, 332 days.
**Purpose:** one continuous zoom on a phone, from a single post on 11 January 2020 out to the whole year and in again to 8 December, along the band that spans it, so the length of that year is seen rather than told. Then the band itself, opened, with its number.
**Points to:** Video 22, the COVID-19 pandemic tour.

**Production notes:**

- About 87 words, read briskly at about 170 wpm: a curious, even voice, never celebratory and never grim. It's a fact about dates, not a verdict on vaccines or on anyone's choices; the script makes no claim about safety, efficacy or policy.
- **The timeline is the sample `publicity/video/samples/covid-19.ochx`**, captured at phone size for readability: **360 × 640 CSS pixels at scale 3** (1080 × 1920), cropped close to the timeline in `phoneShot` so its labels read on a phone. **Group within** is lowered to 12 px by an `eval` in each shot's `setup` (`document.getElementById('density')`, value 12, with `input` and `change` events), so the moments a few days apart stand alone.
- The zoom (Scenes 1–3) is one capture: the view 8–14 January 2020, out to 20 December 2019 – 5 January 2021, and in to 29 November – 13 December 2020. Scene 4 opens "From genome to first authorised dose" in the reader from the view 20 December 2019 – 5 January 2021 (left edge in 2019, so the reader shows the years), unseparated, with **View mode** on and the `open` under the shot's `actions`. The duration reader shows the span, tags, notes and related moments (it has no Sources or Date precision; those are on the moments).
- The genome's moment is at 01:05 UTC on 11 January 2020 (10 January in the Americas); the first reported death the same day is drawn at noon so the two separate, and its Date precision says so.
- **Rounded honestly:** 332 days is from 11 January to 8 December 2020 (332 days and about five hours, by the two times); 65 and 326 are calendar days from 11 January. Say "first authorised dose outside a trial", never "first vaccine".

---

## ACT 1 · THE ZOOM (0:00 – 0:30)

### Scene 1 · 0:00 – 0:06 · One post

**FRAME:** The phone, large in the frame, showing 8–14 January 2020: "A new coronavirus identified" (01-09, green), "The genome is published" (01-11, 01h, green), "First reported death" (01-11, 12h), "First case outside China" (01-13), and the green band "From genome to first authorised dose" starting under the genome and running off the right edge. Already whole at frame 0. A callout in the look's serif beside the genome: "11 Jan 2020 · 01:05 UTC".

**MOTION:** None to start: the frame is the cover. The zoom out begins as the sentence ends.

**OST:** "Genome online → first dose: 332 days"

**VO:**
"January eleventh, 2020. Scientists post the new coronavirus's genome online, for anyone to use."

### Scene 2 · 0:06 – 0:18 · The year

**FRAME:** The same phone, zooming out to the whole of 2020: the green band now stretches across the screen from January to December, the lockdown bands of spring in navy beneath it, "First vaccine trial dose" (03-16) and "Phase 3 vaccine trials begin" (07-27) above. A small counter beside the phone ticks the days along the band: "65 days", then "198 days".

**MOTION:** A continuous zoom out (log speed), then the counter runs along the band as the view begins to narrow toward December.

**OST:** "Genome online → first dose: 332 days"

**VO:**
"Sixty-five days later, the first volunteer in a vaccine trial gets a dose. In July, large trials begin, each planned for about thirty thousand volunteers."

### Scene 3 · 0:18 – 0:30 · December

**FRAME:** The zoom settles on 29 November – 13 December 2020: "First vaccine authorised: UK" (12-02), "First authorised dose: Margaret Keenan" (12-08, 06h), "US emergency use authorization" (12-11), and the green band ending exactly under Margaret Keenan's moment. The counter: "326 days" at the UK's authorisation, "332 days" at the band's end.

**MOTION:** The zoom eases to a stop; each counter value draws in on its date being said.

**OST:** "Genome online → first dose: 332 days"

**VO:**
"December second, the UK authorises the first vaccine. December eighth, at 6:31 in the morning, Margaret Keenan, ninety, gets the first authorised dose outside a trial."

---

## ACT 2 · THE BAND (0:30 – 0:42)

### Scene 4 · 0:30 – 0:38 · Open it

**FRAME:** The reader fills the phone: "From genome to first authorised dose", "2020-01-11 CE → 2020-12-08 CE", tags science and vaccine, the note ("… 332 days …"), Related to: "The genome is published", "First authorised dose: Margaret Keenan".

**MOTION:** The reader slides up over the timeline; "332 days" in the note highlights.

**OST:** "332 days"

**VO:**
"Three hundred and thirty-two days, end to end, on one line."

### Scene 5 · 0:38 – 0:42 · One line

**FRAME:** The phone shrinks and lifts; `shortEnd` with "Any span of time, one line", "timescale.info/athan/covid-19" and the repository's address.

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"That's OpenChronology. It's free."

**[END · ~0:42]**

---

## Appendix A · Narration only (for the voice session)

> January eleventh, 2020. Scientists post the new coronavirus's genome online, for anyone to use.
>
> Sixty-five days later, the first volunteer in a vaccine trial gets a dose. In July, large trials begin, each planned for about thirty thousand volunteers.
>
> December second, the UK authorises the first vaccine. December eighth, at 6:31 in the morning, Margaret Keenan, ninety, gets the first authorised dose outside a trial.
>
> Three hundred and thirty-two days, end to end, on one line.
>
> That's OpenChronology. It's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                  | Source                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The genome was posted on Virological.org at 01:05 UTC on 11 January 2020                               | [Virological.org post](https://virological.org/t/novel-2019-coronavirus-genome/319) (its `created_at`, 2020-01-11T01:05:32Z)                                                                                                                |
| 2     | First trial dose 16 March 2020, Seattle: 65 calendar days after 11 January                             | [NIH, 16 March 2020](https://www.nih.gov/news-events/news-releases/nih-clinical-trial-investigational-vaccine-covid-19-begins); the day count is ours                                                                                       |
| 2     | Phase 3 trials of about 30,000 volunteers each began 27 July 2020; "198 days" is 11 January to 27 July | [Moderna COVID-19 vaccine](https://en.wikipedia.org/wiki/Moderna_COVID-19_vaccine); [Pfizer–BioNTech COVID-19 vaccine](https://en.wikipedia.org/wiki/Pfizer%E2%80%93BioNTech_COVID-19_vaccine)                                              |
| 3     | UK authorisation 2 December 2020 (326 calendar days); Margaret Keenan, 90, dosed 8 December, 06:31 GMT | [MHRA, 2 December 2020](https://www.gov.uk/government/news/uk-medicines-regulator-gives-approval-for-first-uk-covid-19-vaccine); [COVID-19 vaccination in the UK](https://en.wikipedia.org/wiki/COVID-19_vaccination_in_the_United_Kingdom) |
| 4     | 332 days from 11 January to 8 December 2020 (332 days and 5 h 26 min between the two times)            | The two times above                                                                                                                                                                                                                         |
| 5     | The app is free                                                                                        | [Licensing](../../docs/licensing.md)                                                                                                                                                                                                        |

## Appendix C · Posting

- **Title (Shorts):** From genome to first vaccine dose: 332 days
- **Caption:** 11 January 2020: the new coronavirus's genome is posted online. 8 December 2020: the first authorised vaccine dose outside a trial. 332 days, on one timeline, with the sources for every date. Free and open source: link in bio. #history #science #covid19 #timeline #2020
- **Cover:** frame 0 (the genome's moment and the headline).
- **Pinned comment:** "Dates are UTC; each one links to its source in the timeline (WHO, regulators, the NIH and the papers). Made with OpenChronology, free and open source: github.com/openchronology/timeline-app. The full tour of this timeline is on our channel."
- **Comments:** expect strong views on vaccines and on the pandemic's measures. Reply only with dates and sources; don't argue merits.
