# OpenChronology — Audiences and the Video Series

**What this is:** the plan behind the explainer videos in this folder: who they're for, what each audience needs to hear, and how the storyboards change from one audience to the next. Each video's script and storyboard is its own file (`1-…` to `10-…`), in the same format as CMR Scanner's (`FRAME`, `MOTION`, `OST`, `VO` per scene, then the narration alone, the claims and their sources, and the questions the audience will ask).

**The one-line pitch everything hangs on:** _OpenChronology puts anything that happens in time on one exact, zoomable line — from a billion years to a fraction of a second — and lets you keep it yourself or share it._

---

## 1 · Who would watch

The product has one interface but very different reasons to open it. Ten audiences came out of the features, the docs and the editions; they group into five clusters by what they need to be convinced of.

| #   | Audience                                      | What they want from a timeline                                          | What they doubt                                                  | Words they use                                      | Where they'd watch                                       |
| --- | --------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| A   | **Curious newcomers** (anyone)                | To understand something that happened over time, quickly                | "Is this just another chart?" "Will it be hard?"                 | timeline, zoom, events, history                     | Social feeds, the website's home page, a shared link     |
| B   | **Students**                                  | To see how events relate, for a class or out of interest                | "Do I need an account?" "Will it work on my phone?"              | dates, eras, causes, "what happened when"           | A link from a teacher, YouTube, the timeline itself      |
| C   | **Teachers and history educators**            | Material for class; students building and sharing timelines             | Cost, sign-ups for minors, accuracy, moderation                  | lesson, unit, primary source, assignment            | YouTube, professional networks, a colleague's email      |
| D   | **Writers, worldbuilders and game masters**   | To keep a story's chronology straight: plots, characters, invented eras | "My calendar isn't real." Privacy of unpublished work            | canon, arc, continuity, lore, session, "in-world"   | YouTube, Reddit and Discord communities, writing forums  |
| E   | **Science educators and enthusiasts**         | Deep time and tiny time on one scale, without losing precision          | "Charts can't show 4.5 billion years and a day at once."         | Ma, Ga, eon, epoch, orders of magnitude             | YouTube, museum and outreach sites, classrooms           |
| F   | **Technical and mathematical minds**          | To know _how_ it's exact, and whether to trust it                       | Floating point, rounding, "exact" as marketing                   | float, double, rational, precision, epoch           | Hacker News, Mastodon, the repository's README           |
| G   | **Privacy-minded and offline users**          | To keep their data on their own machine, or work without a network      | "Where does my data go?" Lock-in                                 | offline, local, files, export, self-host            | The download page, forums, word of mouth                 |
| H   | **IT, operations and incident investigators** | Logs on a timeline; reconstructing what happened in an incident         | Scale (hundreds of thousands of lines), ingest effort, retention | syslog, journald, incident, postmortem, root cause  | Ops newsletters, conference talks, internal wikis        |
| I   | **Self-hosters and administrators**           | To run it for a school, club, team or company                           | Install effort, maintenance, security, accounts, moderation      | package, Docker, PostgreSQL, OAuth, backup, upgrade | Self-hosting forums, the administration docs             |
| J   | **Communities and collaborators**             | To build one timeline together (a club, a wiki-like project, a class)   | Vandalism, conflicts, who can change what                        | fork, propose, review, contributors                 | Wherever the community gathers; linked from the timeline |

### The five clusters

1. **Readers** (A, B): they will mostly _look at_ timelines other people made. They need to know how to read one in under three minutes, on a phone as well as a laptop, with no account.
2. **Makers** (C, D, E): they will build timelines about their subject. Each needs to see _their own kind of subject_ working: real history, an invented world, deep time. A generic demo won't land; a tour of their kind of timeline will.
3. **Skeptics of precision** (F, E): they need the mechanism (rational numbers, no floating point) shown honestly, with a concrete failure of the usual approach.
4. **Owners of their data** (G, I): they need the editions laid side by side: what runs where, where the data lives, what needs a network, and how to run a server.
5. **Teams** (H, J, C): they need collaboration and scale shown: forks and proposals for communities and classes, log ingestion and 200,000-moment timelines for operations.

### What changes from audience to audience

The same facts are true for everyone; what changes is the order, the example and the proof.

- **Lead with their subject, not the software.** A history teacher sees the United States first and the zoom second; a worldbuilder sees their story's two timelines (written order and in-world order) before any button.
- **Proof is different for each.** Readers need "you can do this in one gesture". Teachers need "free, no account to read, private by default". Engineers need a demonstration that `0.1 + 0.2` is exact here. Administrators need the package list and the three commands. Operators need the size of the timeline and the ingest path.
- **Vocabulary follows them.** Writers hear "continuity" and "in-world calendar"; scientists hear "Ma" and "orders of magnitude"; administrators hear "PostgreSQL" and "OAuth". The app's own names for things (**moment**, **duration**, **relationship**, **Fit all**, **Separate by tags**, **View mode**) stay the same in every video, so a viewer who watches two of them recognizes the controls.
- **Length follows commitment.** The front door is under a minute; readers' and makers' videos about two minutes; technical audiences will sit through three if every sentence carries a fact.
- **The ask follows what they can do next:** open a public timeline, download the desktop app, try the offline file, import their logs, install the package.

---

## 2 · The series

Thirteen videos. Three are for everyone; the rest each answer one audience. All are 16:9. The social feeds get their own cuts rather than crops: ten vertical [shorts](shorts/0-shorts-audiences-and-series.md), each made for one community on TikTok, YouTube Shorts and Reels.

| #   | Title                                               | For                          | Runtime | Goal                                                                           | Ends on                                         |
| --- | --------------------------------------------------- | ---------------------------- | ------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1   | **What is OpenChronology?**                         | Everyone (front door)        | ~0:57   | One idea: any span of time, on one exact line you can zoom                     | "Pick the video for what you do"                |
| 2   | **How to see a timeline**                           | Readers (A, B)               | ~1:58   | Read any timeline: markers, zoom, summaries, durations, the reader             | "Open a public timeline"                        |
| 3   | **Website, desktop or offline?**                    | Owners of data (G), all      | ~2:17   | The editions side by side, and where each keeps your data                      | "Download, or open the website"                 |
| 4   | **Exact time: rational numbers**                    | Skeptics (F, E)              | ~2:52   | Why floating point fails for time, and how fractions don't                     | "Every time is a fraction. Nothing rounds."     |
| 5   | **Tour: the United States, 1775–2008**              | Students, teachers (B, C)    | ~1:52   | A modern-history timeline built and read the way a class would                 | "Make your class's timeline"                    |
| 6   | **Tour: a story's timeline**                        | Writers, GMs (D)             | ~1:53   | An invented world: in-world calendar, character tracks, threads                | "Keep your canon straight"                      |
| 7   | **Tour: keeping a canon (Middle-earth)**            | Canon developers (D)         | ~1:45   | A vast, finished canon kept: its own calendar, sources, threads                | "Keep your canon"                               |
| 8   | **Tour: deep time**                                 | Science (E), all             | ~1:49   | 4.5 billion years and one human lifetime on the same line                      | "From eons to seconds"                          |
| 9   | **Working together**                                | Teachers, communities (C, J) | ~2:07   | Share, embed, collaborate, fork, propose, review                               | "Build it together"                             |
| 10  | **Timelines from logs**                             | Operations (H)               | ~2:18   | Logs in, an incident's timeline out; retention; scale                          | "Point your syslog at it"                       |
| 11  | **Run your own server**                             | Administrators (I)           | ~2:11   | Packages, Docker, accounts, moderation, upgrades                               | "Install the package"                           |
| 12  | **Timelines from AI and automation**                | Automation (F, H), all       | ~3:05   | An assistant and any script, through an API key; how the app is built          | "Built by you, your scripts, or your assistant" |
| 13  | **Investigations: from timeline to causal factors** | Investigators (H)            | ~3:08   | An events and causal factors chart: events, conditions, causal factors, review | "Every investigation is a timeline"             |
| 22  | **Tour: the COVID-19 pandemic, 2019–2023**          | Students, teachers (B, C)    | ~3:50   | A recent worldwide event: counts and estimates, measures, science, variants    | "Make your class's timeline"                    |
| 15  | **Tour: ancient Egypt, Narmer to Cleopatra**        | Students, teachers (B, C)    | ~3:40   | Antiquity on one line: one named chronology, dated estimates, its writings     | "Make your class's timeline"                    |

**Why eleven rather than the four first asked for:** the four (reading, editions, rational numbers, tours) cover readers, owners and the curious. Three more audiences came out of the analysis with needs none of those meet: teachers and communities need collaboration, operators need log ingestion, administrators need the server. And the tour splits into four because makers are only convinced by their own kind of subject. Writers get two: Video 6 shows a world being written; Video 7 shows a vast, finished canon being kept (Tolkien's, from the Years of the Trees to the Fourth Age), for the people who maintain one: authors of long series, lore keepers for games and editors of fan chronologies, who need their own calendar, every date's source and certainty, and which book says what. A one-minute front door (1) lets every other video assume the basics.

**Order of release (suggested):** 1, 2 and 5 together (the widest audience, and a teacher can use all three in a lesson), then 6, 7 and 8, then 3 and 4, then 9, 10 and 11 for the communities that will host and build, then 12 and 13 for automation and investigations.

---

## 3 · One visual system, six looks

Every video shares a frame: a header with the act name and the scene's on-screen text, an act-coloured progress bar, the same type (Saira Condensed and IBM Plex Mono, as in CMR Scanner's videos), and **the timeline motif**: an axis with moments as dots, durations as bands, summaries as numbered dots and relationships as arcs, drawn the way the app draws them. A viewer who has seen one video can read the diagrams in any other.

What changes is the ground and the accent, so each video feels made for its audience:

| Look          | Videos     | Ground and accent                                               | Why                                                            |
| ------------- | ---------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| **Paper**     | 1, 2, 3, 9 | The app's own light paper (`#f5f6f1`) and green (`#285742`)     | Friendly, recognisably the product; most viewers start here    |
| **Archive**   | 5, 15      | Warm cream with navy and brick accents; a serif for dates       | Reads as history class, documents and maps                     |
| **Parchment** | 6          | Deep ink-blue ground with gold and ember accents; a serif title | A storyteller's tone, not a spreadsheet's                      |
| **Lore**      | 7          | Deep forest green with gold; a serif title                      | A keeper of lore, between the storyteller's and the scholar's  |
| **Strata**    | 8          | Night-sky ground with rock-strata bands for eons                | Deep time feels deep; the bands are the geological column      |
| **Terminal**  | 4, 10–13   | Dark ink ground, mono type, green and amber highlights          | Engineers and administrators trust what looks like their tools |

**The tours (5, 6, 7, 8) and the logs video (10) show the real app.** Their timelines are sample files (`publicity/video/samples/`) opened in the actual editor and captured zooming and panning, framed in a browser window. Everything else is drawn as an infographic, like CMR Scanner's videos, so it stays clear at any size and doesn't date when the interface changes.

---

## 4 · Guardrails for every script

- **Say what is true today.** The website edition is the software; **timescale.info** is the address its official deployment uses. Before release, confirm timescale.info is live and open to sign-ups, and adjust Videos 1 and 3 if it isn't (**[CONFIRM]** is marked where it matters).
- **Use the app's names for things:** moment, duration, relationship, summary, **Fit all**, **Separate by tags**, **View mode**, **Time display**, **Exact rational**, `.ochx`, `.och`.
- **No invented numbers.** Limits come from the docs (200,000 moments; about 10,000 comfortable in a browser tab, 1,000 on a phone; eight servers in the desktop app). Facts in the tours come from standard references, listed in each script's Appendix B.
- **No superlatives.** "Revolutionary", "seamless" and "powerful" are out; show the thing instead.
- **Privacy, stated plainly:** server timelines start private, but are not encrypted from the site's administrators. Accounts are for people 13 and older.
- **Free software:** GPL version 3; no payments or paid features. A server has a storage limit per account, set by its operator.
- **The fantasy tour uses an original world** (no one else's characters or calendar), and the history tours present well-established dates only.
- **The canon tour (7) is an unofficial fan chronology** of Tolkien's legendarium: years from the published chronologies, notes as short summaries in our own words, no quotations, maps, artwork, film imagery or logos, and a line on its end card saying it isn't affiliated with or endorsed by the Tolkien Estate.
- **Every video ends with the source:** github.com/openchronology/timeline-app on its end card.

## 5 · Production

- **Narration:** each script's Appendix A is the voice session. Until it's recorded, a scratch voice (Kokoro, offline) reads it, so the timing, captions and cues can be checked; a real recording replaces it with the same alignment step. Read at a steady pace, around 145 words a minute.
- **Pipeline:** see [`video/README.md`](video/README.md). Each scene is a pure function of time, cued to the word in the narration that introduces it, rendered to frames in Playwright and encoded with captions.
