# OpenChronology — Shorts: Audiences and the Series

**What this is:** the plan behind the vertical shorts for TikTok, YouTube Shorts and Instagram Reels: what those feeds demand, who on them would care, and how each short is built to be watched there. Each short's script and storyboard is its own file (`1-…` to `10-…`), in the same format as the explainer videos' (`FRAME`, `MOTION`, `OST`, `VO` per scene, then the narration alone, the claims and their sources), with one more appendix: how to post it.

**How they relate to the explainers:** the explainers (`publicity/1-…` to `13-…`) teach; a short earns attention. Each short takes one surprising fact or one satisfying motion from an explainer and ends where that explainer begins, so a viewer who wants more has somewhere to go.

---

## 1 · What a feed demands

| Constraint                      | What it means for a short                                                                                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9:16, 1080 × 1920**           | Composed for a phone held upright, not cropped from 16:9. The real app is shown as it looks on a phone.                                                                                                                                                                      |
| **20–45 seconds**               | Every short is under 60 s, so it counts as a Short on YouTube and plays in full everywhere. Most viewers decide in the first two seconds and few stay past forty.                                                                                                            |
| **The hook is the first frame** | Frame 0 is whole (no fade from black): it's the cover the feed shows, and the headline says the surprising thing before a word is spoken. The narration's first sentence repeats it.                                                                                         |
| **Read with the sound off**     | Many watch muted. The narration is burned in as captions, a few words at a time with the word being said lit; the headline carries the point on its own.                                                                                                                     |
| **The feed's own controls**     | The tabs above, the caption and music below and the buttons at the right cover parts of the frame. All text sits in the area all three platforms leave clear (x 60–900 px, y 216–1440 px; `SAFE` in `core.js`).                                                              |
| **Fast, but one idea**          | Cuts every three to eight seconds, narration at about 170 words a minute, and a single idea per short. No act headers or progress bar: the platform draws its own.                                                                                                           |
| **Ends short, loops**           | A two-second end card (wordmark, one line, `github.com/openchronology/timeline-app`), then the feed loops it. Links in a short's caption aren't clickable on TikTok, so the address is on screen and in the pinned comment, and the profile's link points to the repository. |
| **No borrowed sound**           | The shorts carry only their narration. Music, if any, is added at posting from the platform's own licensed library, never mixed into our files.                                                                                                                              |

---

## 2 · Who's on the feed

Of the explainers' ten audiences, five gather on short-form feeds in communities with their own hooks. The other five (administrators, privacy-minded users, most of the operations crowd) are better reached by the explainers, the README and forums; two shorts still reach their curious edges.

| Feed community                                              | Explainers' audiences                | What stops their scroll                                               | What they share                                               | Their short                 |
| ----------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------- |
| **History and "did you know"** (#history, #historytok)      | Curious newcomers, students (A, B)   | Scale: a big span collapsing to one exact moment                      | "I didn't know it was that close"                             | 1 · 1776 to the Moon        |
| **Science and space** (#science, #sciencetok)               | Science enthusiasts, students (E, B) | A number they can feel: deep time as one day                          | The one stat ("we're the last six seconds")                   | 2 · The last six seconds    |
| **Developers** (#programming, #techtok)                     | Technical minds (F), operators (H)   | A familiar wound: `0.1 + 0.2`, an outage at 2 a.m.                    | The "this is why" moment; tagging a colleague                 | 3 · `0.1 + 0.2`; 8 · 2 a.m. |
| **Fandoms and lore** (#lotr, #tolkien, #booktok)            | Canon developers (D)                 | A fact about the canon they love, with a number                       | Corrections and debate in the comments (welcome: engagement)  | 4 · The Ring in the river   |
| **Writers and worldbuilders** (#writingtok, #worldbuilding) | Writers, game masters (D)            | Their own problem named: keeping many characters' threads straight    | Saving it for later; "I need this for my book"                | 5 · One character's thread  |
| **Teachers** (#teachersoftiktok, #edutok)                   | Teachers, communities (C, J)         | A classroom problem solved in one step, free, no sign-up to read      | Sending it to colleagues                                      | 6 · A class timeline        |
| **Privacy and offline** (#privacy, #opensource)             | Privacy-minded users (G)             | A surprising artifact: a whole app in one file that never goes online | "Open source" and "no account" are their own share triggers   | 7 · One HTML file           |
| **AI and automation** (#ai, #programming)                   | Technical minds (F), all             | A familiar experiment with a real result: one prompt, a whole galaxy  | The candid twist: the app is built the same way, and reviewed | 9 · I asked an AI           |
| **Safety and investigations** (#safety, #rootcause)         | Investigators (H)                    | The question they're always asked: why did it happen?                 | The method, drawn cleanly; sending it to their team           | 10 · Why did it happen?     |

### What changes from the explainers

- **The fact comes first, the product last.** An explainer can say "OpenChronology" in its first sentence; a short that does is scrolled past. Each short opens on the subject (the Moon, the Ring, a 2 a.m. outage), shows the app doing it, and names the app only in the last five seconds.
- **One number they'll repeat.** "Six seconds", "2,460 years", "0.30000000000000004". The headline and the first sentence say it; it's what gets shared.
- **The app as it looks on a phone.** The tours captured the editor at desktop size; the shorts capture it at phone size, because that's where these viewers are, and it answers "does it work on my phone?" without saying so.
- **Their words.** Developers hear "floating point" and "syslog"; writers hear "thread" and "point of view"; fans hear "the Second Age". The app's names for controls (**Separate by tags**, **Fit all**) stay as they are.
- **The ask is small.** Not "download and install": follow, save, or look it up. The end card's address and the pinned comment do the rest.

---

## 3 · The series

Ten shorts. Three storyboard shapes, so the feed doesn't see the same video twice:

- **The zoom** (1, 4, 5, 8, 9, 12, 16): the real app on a phone, one continuous gesture from far out to one exact thing, with captions over it.
- **The stat** (2, 3, 10): one surprising number, built up in animation, then the app as the proof.
- **The how-to** (6, 7): a problem their community has, and the two or three steps that solve it, as interface cards.

| #   | Title                                   | Shape  | For                    | Look      | Runtime | The hook (frame 0 and the first sentence)         | Points to explainer  |
| --- | --------------------------------------- | ------ | ---------------------- | --------- | ------- | ------------------------------------------------- | -------------------- |
| 1   | **1776 to one second on the Moon**      | Zoom   | History, everyone      | Archive   | ~0:27   | "230 years of history → one second on the Moon"   | 5 · The US tour      |
| 2   | **You're the last six seconds**         | Stat   | Science, space         | Strata    | ~0:36   | "If Earth's history were one day…"                | 8 · Deep time        |
| 3   | **0.1 + 0.2 isn't 0.3**                 | Stat   | Developers             | Terminal  | ~0:33   | "0.1 + 0.2 = 0.30000000000000004"                 | 4 · Exact time       |
| 4   | **The Ring sat in a river 2,460 years** | Zoom   | Fandom, canon keepers  | Lore      | ~0:36   | "The One Ring spent ~2,460 years in a river"      | 7 · Middle-earth     |
| 5   | **Check one character's thread**        | Zoom   | Writers, worldbuilders | Parchment | ~0:32   | "Does each character's story hold up on its own?" | 6 · A story          |
| 6   | **A class timeline nobody can wreck**   | How-to | Teachers               | Paper     | ~0:33   | "30 students. 1 timeline. Nobody can wreck it."   | 9 · Working together |
| 7   | **A whole app in one HTML file**        | How-to | Privacy, open source   | Paper     | ~0:27   | "This entire app is one HTML file"                | 3 · Editions         |
| 8   | **2 a.m. Everything's down.**           | Zoom   | Developers, operations | Terminal  | ~0:35   | "2 a.m. Everything's down. What broke first?"     | 10 · Logs            |
| 9   | **I asked an AI to build a timeline**   | Zoom   | AI, developers         | Terminal  | ~0:41   | "I asked an AI to build a timeline"               | 12 · AI, automation  |
| 10  | **Why did it happen?**                  | Stat   | Investigators, safety  | Terminal  | ~0:43   | "Why did it happen?"                              | 13 · Investigations  |
| 16  | **Rome fell twice, 977 years apart**    | Zoom   | History, everyone      | Archive   | ~0:44   | "Rome fell in 476. Then it fell again in 1453."   | 19 · Ancient Rome    |
| 12  | **Closer to the Moon than the pyramid** | Zoom   | History, everyone      | Archive   | ~0:42   | "Cleopatra lived closer to the Moon landing…"     | 15 · Ancient Egypt   |

**Order of release (suggested):** 1 and 2 first (the widest feeds, and both end on the same line from eons to seconds), then 4 and 3 (the strongest single facts), then 5, 8, 6 and 7, then 9 and 10. Two or three a week; post each on all three platforms the same day.

---

## 4 · One frame for every short

- **Stage:** 180 × 320 units (6 px each). The safe area is `SAFE` in `common/core.js`: x 10–150, y 36–240; pictures may run past it, words never do.
- **Headline:** the scene's OST, large, at the top of the safe area; it holds across cuts when the next scene repeats it, so a short reads as one or two headlines, not seven.
- **Captions:** the narration in the script's spelling, two or three words at a time, outlined in the look's ground colour, the word being said lit in its highlight colour, just above the bottom of the safe area.
- **The app:** captured at 480 × 640 CSS pixels (scale 2.25, so 1080 × 1440) and shown in a phone's screen (`phoneShot`), about 130 units wide.
- **The end:** `shortEnd`: the wordmark, one line, "Free and open source", and the repository's address, for the last two seconds.
- **Looks:** the explainers' six, matched to the community (archive for history, strata for space, terminal for developers, lore for Tolkien, parchment for writers, paper for teachers and the curious).

## 5 · Guardrails

- **Every number is sourced** in the short's Appendix B, with the arithmetic shown where it's ours ("the last six seconds").
- **Rounded honestly:** a short can say "about", "nearly" and "around", never a precision the source doesn't have.
- **Middle-earth** follows the explainer's rules: an unofficial fan chronology, summaries in our own words, no quotations, maps, artwork, film imagery or logos, and "Not affiliated with or endorsed by the Tolkien Estate" on the end card and in the post's caption.
- **Made-up samples are labelled:** the story (5) and the incident (8) say on screen that they're made up.
- **No claims beyond the explainers'.** The shorts introduce no feature or number the explainers and docs don't already back.
