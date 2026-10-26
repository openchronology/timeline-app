# OpenChronology — Investigations: from Timeline to Causal Factors: Script and Storyboard

**Runtime:** ~3:13 (the scratch narration's cut) · **Format:** animated infographic, **Terminal** look, with captures of the real app for the case · **Aspect:** 16:9
**Audience:** safety and incident investigators (industrial, aviation, healthcare, transport), SRE and security postmortem leads, compliance and legal teams, investigative journalists, and educators who teach root cause analysis. They know the method and will notice if the chart bends it.
**Purpose:** show an established method, causal factor analysis with an **Events and Causal Factors (ECF) chart**, built in OpenChronology on one made-up case: the sequence at exact times, conditions as durations beneath it, relationships linking them, the causal factors marked, the written procedure compared with what happened, and the analysis reviewed and kept.

**How it differs:** Video 10 turned logs into a timeline and found one cause. Here the method is the subject, and the app is shown as the place an investigator does it, not as the one doing it.

**Production notes:**

- Narration is 392 words, around 140 wpm when read. Calm and precise; an investigator talking to investigators. Someone was hurt in the case, so no jokes and no drama.
- **The case is the sample `publicity/video/samples/investigation.ochx`** (`investigation.mjs`): a made-up warehouse, night shift of 15–16 October 2026. A forklift (FL-3) reversing out of aisle 14 strikes a picker crossing the aisle end at 02:34:09.36; the picker's leg is injured. No real people, companies or incidents. The written procedure is a second sample, `investigation-procedure.ochx` (`investigation-procedure.mjs`), laid on the same night for **Compare**. A small note on screen in Scene 2 says the case is made up.
- **The chart uses the Causal factor analysis suite** (version 2: Moment stacks, Moment shapes 3, Moment colors, Presumptive outline and Relationship arrows), with Rich text notes and Dating context:
  - Primary events: Moment shape `process` (a flowchart rectangle), tagged `primary event`. Secondary events: `process`, small, Information blue, tagged `secondary event`.
  - The incident: `diamond`, large, the **Bad** color, tagged `incident`.
  - Lasting conditions: **durations**, tagged `condition`. Point-in-time conditions: Moment shape `ellipse` (Moment shapes 3), as ECF draws conditions.
  - Conditions and evidence on the collision: a **Moment stack** of six entries.
  - Causal factors: the **Bad** color and the tag `causal factor`; the root cause also `root cause`.
  - Presumptive (unconfirmed) items (the horn, the picker's own account, fatigue): **Presumptive outline**'s `presumptive: true`, a dashed outline, plus the tag `presumptive`.
  - Links: **relationships**, drawn as arcs, with **Relationship arrows** (`arrows` on each cause, `"to"` its effect) pointing cause → effect; **Separate all connected** from the collision.
- **The ECF conventions, as the app draws them** (Scene 6):
  - Conditions as ovals: Moment shapes 3's `ellipse` (#324).
  - Presumptive items dashed: Presumptive outline (#325), on moments, stack entries and duration bands; the reader flags them "Presumptive (unconfirmed)".
  - Arrows from cause to effect: Relationship arrows (#326). The arrows are a drawing convention kept on the entities; relationships themselves stay undirected and **unlabeled**, so there is no "caused", "contributed to" or "failed to prevent" on a link, and **Separate related** and **Separate all connected** don't follow the arrows (`docs/relationships.md`). Scene 6 says so.
- **Accuracy guardrails:**
  - ECF and barrier analysis are established methods the app supports. The app doesn't perform root cause analysis; the investigator does. Say so.
  - Privacy: server timelines start private; access is granted per person (private viewer, contributor, writer); a self-hosted server keeps the data in-house (Video 11). Server timelines aren't encrypted from the server's administrators. Don't imply the hosted service is certified for regulated data (health records, for example).
  - Pull requests, merges and saved history are server features (Video 9); Scene 8 is drawn, not captured.
  - The method's sources are in Appendix D, for viewers who want to learn it properly.

---

## ACT 1 · THE SEQUENCE (0:00 – 0:49)

### Scene 1 · 0:00 – 0:20 · What happened, and why?

**FRAME:** A schematic ECF chart, drawn in the motif: a row of rectangles (primary events) joined left to right along a line, ending in a red diamond (the incident). Below them, rounded ovals (conditions) with lines up to the events they affect. Two ovals and one event are outlined red and tagged "causal factor". Labels at the left: "EVENTS", "CONDITIONS".

**MOTION:** The rectangles draw in left to right, then the diamond pops; the conditions rise beneath on "conditions"; the causal factors redden on "causal"; the events take their times on an axis on "marked".

**OST:** "What happened, in what order, and why?"

**VO:**
"Something went wrong, and someone was hurt. What happened, in what order, and why? Investigators answer with an events and causal factors chart: the events in sequence, the conditions beneath them, and the causal factors marked."

### Scene 2 · 0:20 – 0:49 · Gather the sequence

**FRAME:** The browser frame with the case: the night of 15–16 October from 02:05 to 02:45, primary events as `process` rectangles along the axis and the collision as a large red diamond. Source chips beside the events ("statements", "badge records", "telematics", "camera 7"). The capture zooms into the last eighty seconds, 02:33:05–02:34:25: "Picker crosses (camera 7)" at 33m 20s, "Horn sounded? (driver)" in grey, "FL-3 reverses out" at 33m 58s, the collision at 34m 09.4s. Then the collision's **Moment details** open: **Exact time** `2026-10-16T02:34:09.36Z`, and **Exact rational coordinate** opened beneath it. A small note: "A made-up case".

**MOTION:** Chips tick in as each source is named; the zoom eases in; the details slide in on "camera"; a highlight rings the exact time and then the rational coordinate; two callouts link "Picker crosses (statement) · about 02:30" and "Picker crosses (camera 7) · 02:33:20" on "disagree".

**OST:** "Each event at its exact time"

**VO:**
"A made-up case: on a warehouse night shift, a forklift reversing out of an aisle strikes a picker crossing its end. Each primary event is a moment at its exact time, from statements, badge records, telematics and cameras. The collision is camera seven's frame, nine and nine twenty-fifths seconds past two thirty-four, stored exactly. Where accounts disagree, both stay, with notes."

---

## ACT 2 · THE CHART (0:49 – 1:50)

### Scene 3 · 0:49 – 1:09 · Conditions beneath the events

**FRAME:** The night view again: beneath the axis, the durations "10-hour night shifts" (yellow), "Aisle 14 end light out" and "No spotter on shift" (red), and "Driver fatigue (unconfirmed)" (dashed), all running under the collision. The capture zooms out to 12–16 October: the light out since Tuesday night, the longer shifts since Monday, and two `ellipse` conditions, "Light fault: no work order" and "Spotter sick, not replaced". Then back in on the collision, whose **moment stack** branches below it: three conditions, then the evidence (camera 7, telematics, statements).

**MOTION:** A cursor line drops through every band at 02:34:09 on "all"; the zoom out on "Tuesday"; back in on "stack", and the stack's entries are bracketed as "conditions" and "evidence".

**OST:** "Conditions held over time"

**VO:**
"Conditions held over time: ten-hour night shifts since Monday, the aisle-end light out since Tuesday, no spotter. Each is a duration beneath the events, all still there at the collision. And the collision's moment stack keeps its conditions and evidence together."

### Scene 4 · 1:09 – 1:27 · Link them, and pull out the chain

**FRAME:** The night view with its arcs, each with an arrowhead at its effect: from the run to the reverse, the reverse to the collision, the crossing to the collision, the light and the spotter to the collision. In **View mode** the collision opens in the reader: its stack as cards, **Related to** listing four entities and "7 more through other relationships", and the buttons **Separate related** and **Separate all connected**. Then **Separate all connected**: the header "Separated by all connected relationships · Collision at aisle 14" and a track "Related to Collision at aisle 14" above "Everything else", over 12–16 October, then zoomed into the night.

**MOTION:** The arcs are traced in amber one by one on "arcs"; the reader slides in on "open"; the button lights on "separate"; the chain's track lifts; the routine records stay below.

**OST:** "Link cause to effect. Pull out the chain."

**VO:**
"Relationships link each condition and event to what it led to, drawn as arcs, with arrows from cause to effect. Open the collision, choose Separate all connected, and the chain behind it lifts onto its own track, away from the routine records."

### Scene 5 · 1:27 – 1:50 · Mark the causal factors

**FRAME:** The week view, the causal factors in the **Bad** red: the light out, the missing spotter, and the root cause, "No risk review of longer shifts". In the reader, the root cause: tags `condition`, `causal factor`, `root cause`, and its notes, **Root cause.** with the reasoning and "Evidence: the change request…". Then the last eighty seconds with the presumptive items called out, each drawn with a dashed outline: "Horn sounded? (driver)" and "Driver fatigue (unconfirmed)".

**MOTION:** The red items pulse once on "Bad"; the reader slides in on "root"; the notes' "Evidence" line is underlined on "evidence"; the presumptive callouts pop on "presumptive", and "dashed outline" on "dashed".

**OST:** "The analysis is yours"

**VO:**
"Then the analysis, which is the investigator's, not the software's. Give each causal factor the Bad color and a causal factor tag, and the root cause one more. Write the reasoning and its evidence in the notes. What isn't confirmed, like the driver's fatigue or the horn, is marked presumptive, and drawn dashed."

---

## ACT 3 · CHECKED AND KEPT (1:50 – 3:13)

### Scene 6 · 1:50 – 2:17 · Drawn as the method draws it

**FRAME:** A table of three rows, "ECF convention" beside "In OpenChronology": an oval beside an ellipse (`shape: ellipse`, Moment shapes 3); a dashed outline beside a dashed band (`presumptive: true`, Presumptive outline); an arrow from cause to effect beside an arc with an arrowhead (`arrows`, Relationship arrows). Beneath, a note box: "Arrows are a drawing convention kept on the events · no labels such as \"caused\" · Separate all connected doesn't follow them".

**MOTION:** The rows slide in as each is named; the note box rises on "convention", its lines ticking in on "label" and "separate".

**OST:** "Drawn as the method draws it"

**VO:**
"The chart is drawn the way the method draws it. Conditions are ellipses. Presumptive items have a dashed outline. And relationship arrows point each link from cause to effect. The arrows are a drawing convention kept on the events: a link has no label, like caused or contributed to, and Separate all connected doesn't follow them."

### Scene 7 · 2:17 – 2:36 · As planned, as happened

**FRAME:** **Compare** with the procedure: the case's track above, "As planned: night-shift procedure" below, on one axis from 19:30 to 03:30, with the comparison's alignment panel (scale 1, offset 0 for both). A veil dims the alignment panel. Callouts pair the divergences: "shift 22:00 → started 20:00", "lighting walk 21:40 → none", "spotter on duty → none", "rest break 02:00–02:30 → kept working".

**MOTION:** The comparison opens on "compare"; the veil fades in on "procedure"; the pairs link up one by one as they're said.

**OST:** "As planned, as happened"

**VO:**
"Compare puts the written procedure on the same axis as the night itself. As planned: an eight-hour shift, a lighting walk, a spotter on duty, a break at two. As it happened: a longer shift, no walk, no spotter, no break."

### Scene 8 · 2:36 – 3:02 · Reviewed, and kept private

**FRAME:** Three panels. (1) A pull request card, "Correct the camera's clock offset" by a colleague, with a change summary ("1 moment changed") and **Merge**; beneath it, **History**: a column of saved checkpoints. (2) Two file chips, `.ochx` and `.och`, "for the report". (3) A padlock, "Private", with three people chips "private viewer", "contributor", "writer", and a server box "self-hosted: in-house".

**MOTION:** The pull request slides in, Merge lights and a new checkpoint drops on top of the history; the file chips tick in on "export"; the padlock closes on "private" and the people chips appear on "person".

**OST:** "Reviewed, revised, kept private"

**VO:**
"Then the review. A colleague proposes corrections as a pull request, the lead merges it, and saved history keeps every revision. Export .ochx for the report, or keep a desktop .och file. Timelines start private, access is given person by person, and a self-hosted server keeps it in-house."

### Scene 9 · 3:02 – 3:13 · Build it once

**FRAME:** The end card: "Every investigation is a timeline", the ◷ wordmark, "docs: plugins · relationships · comparison", and the source, "github.com/openchronology/timeline-app".

**MOTION:** The end card rises and holds.

**OST:** "Build it once, and let everyone check it."

**VO:**
"Every investigation is a timeline. Build it once, carefully, and let everyone check it."

**[END · ~3:13]**

---

## Appendix A · Narration only (for the voice session)

> Something went wrong, and someone was hurt. What happened, in what order, and why? Investigators answer with an events and causal factors chart: the events in sequence, the conditions beneath them, and the causal factors marked.
>
> A made-up case: on a warehouse night shift, a forklift reversing out of an aisle strikes a picker crossing its end. Each primary event is a moment at its exact time, from statements, badge records, telematics and cameras. The collision is camera seven's frame, nine and nine twenty-fifths seconds past two thirty-four, stored exactly. Where accounts disagree, both stay, with notes.
>
> Conditions held over time: ten-hour night shifts since Monday, the aisle-end light out since Tuesday, no spotter. Each is a duration beneath the events, all still there at the collision. And the collision's moment stack keeps its conditions and evidence together.
>
> Relationships link each condition and event to what it led to, drawn as arcs, with arrows from cause to effect. Open the collision, choose Separate all connected, and the chain behind it lifts onto its own track, away from the routine records.
>
> Then the analysis, which is the investigator's, not the software's. Give each causal factor the Bad color and a causal factor tag, and the root cause one more. Write the reasoning and its evidence in the notes. What isn't confirmed, like the driver's fatigue or the horn, is marked presumptive, and drawn dashed.
>
> The chart is drawn the way the method draws it. Conditions are ellipses. Presumptive items have a dashed outline. And relationship arrows point each link from cause to effect. The arrows are a drawing convention kept on the events: a link has no label, like caused or contributed to, and Separate all connected doesn't follow them.
>
> Compare puts the written procedure on the same axis as the night itself. As planned: an eight-hour shift, a lighting walk, a spotter on duty, a break at two. As it happened: a longer shift, no walk, no spotter, no break.
>
> Then the review. A colleague proposes corrections as a pull request, the lead merges it, and saved history keeps every revision. Export .ochx for the report, or keep a desktop .och file. Timelines start private, access is given person by person, and a self-hosted server keeps it in-house.
>
> Every investigation is a timeline. Build it once, carefully, and let everyone check it.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                                                           | Source                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The ECF chart: events in sequence, conditions beneath, causal factors marked                                                                                                                                    | Appendix D (DOE workbook; MORT user's manual)                                                                                     |
| 2–5   | The case: FL-3, aisle 14, the night of 15–16 October 2026, the collision at 02:34:09.36; conditions, evidence, root cause                                                                                       | `investigation.mjs` (made up)                                                                                                     |
| 2     | Moment shapes `process`, `diamond`, `ellipse`; sizes small, medium, large                                                                                                                                       | [Plugins: Moment shapes](../docs/plugins.md), `src/plugins.ts` (`MOMENT_SHAPE_NAMES`)                                             |
| 2     | 02:34:09 and 9/25 s is stored as an exact rational; **Exact time** and **Exact rational coordinate** in Moment details                                                                                          | [Time presentation](../docs/time-presentation.md); Video 4                                                                        |
| 2     | Conflicting accounts as separate moments with notes; Dating context's **Date precision** field                                                                                                                  | `investigation.mjs`; [Plugins](../docs/plugins.md) (`DATING_CONTEXT`)                                                             |
| 3     | Conditions as durations beneath the axis                                                                                                                                                                        | [Durations](../docs/durations.md)                                                                                                 |
| 3     | **Moment stacks**: ordered entries inside a moment, sharing its time, with the timeline's other plugin fields (shape, color)                                                                                    | [Plugins: Moment stacks](../docs/plugins.md#moment-stacks)                                                                        |
| 4     | Relationships drawn as arcs; **Related to**, "more through other relationships"; **Separate related**, **Separate all connected**; separated tracks                                                             | [Relationships](../docs/relationships.md)                                                                                         |
| 5     | **Moment colors** swatches (Bad `#bc6663`, Disabled `#9aa49f`, Information `#7aadc4`); colors on moments, durations and stack entries; tags; rich notes                                                         | [Plugins: Moment colors](../docs/plugins.md), [Tags](../docs/tags.md)                                                             |
| 5     | The **Causal factor analysis** suite: Moment stacks, Moment shapes, Moment colors                                                                                                                               | [Plugins: suites](../docs/plugins.md#plugin-suites), `src/suites.ts`                                                              |
| 6     | Moment shapes 3's `ellipse`; Presumptive outline's dashed outline; Relationship arrows' arrowheads, a drawing convention on the entities; relationships unlabeled; Separate all connected doesn't follow arrows | [Plugins: Moment shapes, Presumptive outline, Relationship arrows](../docs/plugins.md); [Relationships](../docs/relationships.md) |
| 7     | **Compare**: the open timeline and an `.ochx` file on one axis, read-only, stacked with source labels                                                                                                           | [Comparing timelines](../docs/comparison.md); `investigation-procedure.mjs` (made up)                                             |
| 8     | Pull requests, merge by writers and owners, saved history, `.ochx` export                                                                                                                                       | [Collaboration](../docs/collaboration.md)                                                                                         |
| 8     | Private by default; private viewer, contributor and writer access per person; self-hosting                                                                                                                      | [Collaboration](../docs/collaboration.md), [Sharing](../docs/sharing.md), [Administration](../docs/administration.md)             |

## Appendix C · Questions this audience is likely to ask

1. **Does it find the root cause?** No. It holds the chart; the investigator decides what is a causal factor and why, and writes the reasoning down.
2. **Can the arrows show "caused" versus "contributed to"?** No. Relationship arrows draw which way a link reads, but links carry no label; say what kind of link it is in the notes or with tags. The arrows are kept on the events, so Separate all connected ignores them.
3. **Is it certified for health records or other regulated data?** No certification is claimed. Server timelines start private but aren't encrypted from the server's administrators; for sensitive cases, run your own server (Video 11) or keep the timeline in a desktop `.och` file.
4. **Can I bring in logs or records?** Yes: imported logs (Video 10) can be their own timeline, compared with the investigation on one axis.
5. **Where do I start?** Add the **Causal factor analysis** suite in **Plugins** (Moment stacks, Moment shapes, Moment colors) to any timeline.
6. **Barrier analysis?** Tag the barriers that failed (`barrier` in the sample, on the light and the spotter) and link them to the events they should have stopped.

## Appendix D · Learning the method

The chart in this video follows these, in simplified form; read them to learn the method properly:

- U.S. Department of Energy, _DOE Handbook: Accident and Operational Safety Analysis_, DOE-HDBK-1208-2012 (Volume I: accident analysis techniques, including events and causal factors charting and barrier analysis).
- U.S. Department of Energy, _Conducting Accident Investigations_, DOE Workbook, Revision 2 (1999).
- N. W. Knox and R. W. Eicher, _MORT User's Manual_ (SSDC-4, Rev. 1, ERDA 76-45/4), from the System Safety Development Center, after W. G. Johnson's Management Oversight and Risk Tree; and its successor, the Noordwijk Risk Initiative Foundation's _NRI MORT User's Manual_ (NRI-1, 2002; 2nd edition, 2009).
