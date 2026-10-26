# OpenChronology — Short 9: I Asked an AI to Build a Timeline. Script and Storyboard

**Runtime:** ~0:40 · **Shape:** the zoom · **Look:** Terminal · **Aspect:** 9:16
**For:** developers and AI-curious people on tech feeds (#ai, #programming, #starwars). The hook is a familiar experiment (ask an assistant for something big) with an unusual payoff: a real, zoomable timeline of a whole fictional galaxy, made through an API key. The twist at the end is that the app itself is mostly built the same way, and a person reviews it.
**Purpose:** one prompt, one API key, the request that created it, then the real Star Wars timeline on a phone: 98 moments, and a zoom from 36,453 BBY to the films. End on how the app is built and where the API docs are.
**Points to:** Video 12, timelines from AI and automation.

**Production notes:**

- About 100 words, told in the first person by the person who asked: matter-of-fact, a little pleased with the result, careful not to give the AI the credit for the asking, the key or the checking.
- **The timeline is the sample `publicity/video/samples/star-wars.ochx`** (the live timeline at timescale.info/athan/star-wars), captured at phone size and shown in `phoneShot`. A small note in Scene 3 says it's an unofficial fan chronology with approximate dates.
- The key is only ever shown as `och_key_…`.
- The closing card's words are fixed: "Built mostly by AI agents (Claude and OpenAI), reviewed by a human. Open source." and the API docs' address.

---

## ACT 1 · THE PROMPT (0:00 – 0:05)

### Scene 1 · 0:00 – 0:05 · One prompt

**FRAME:** A chat panel, large: the prompt "Create a timeline for the Star Wars extended history, with comics, Legends, games, TV and books." Already whole at frame 0, with a blinking cursor after it.

**MOTION:** A send arrow pulses once on "asked".

**OST:** "I asked an AI to build a timeline"

**VO:**
"I asked an AI assistant to build a Star Wars timeline, from the comics to the games."

---

## ACT 2 · THE TIMELINE (0:05 – 0:32)

### Scene 2 · 0:05 – 0:13 · One key, one request

**FRAME:** A key chip, `och_key_…`, with `timelines:read` and `timelines:write` under it. Below it a terminal: `GET …/document?download=1` → `200` (learning the format), then `POST /api/timelines` → `201 Created`.

**MOTION:** The key slides in on "key"; the two requests type on, one after the other; `201` pops.

**OST:** "One prompt. One API key."

**VO:**
"I gave it an API key for my timelines. It learned the file format, wrote the document, and posted it."

### Scene 3 · 0:13 – 0:21 · 98 moments

**FRAME:** The phone, the whole timeline: "The Je'daii gather on Tython" far to the left, the summaries crowding toward 0 BBY. A chip: "98 moments · 13 eras". A small note at the foot of the phone: "An unofficial fan chronology · dates approximate".

**MOTION:** The phone rises in; the chip counts up to 98 on "ninety-eight".

**OST:** "98 moments of Star Wars"

**VO:**
"I checked the result: ninety-eight moments of canon and Legends, every era on one line."

### Scene 4 · 0:21 – 0:32 · From Tython to the films

**FRAME:** The phone zooms from the whole chronology to the films (40 BBY to 45 ABY): the summaries open into moments, eras and arcs. A chip at the start, "36,453 BBY", and at the end, "0 BBY · the Battle of Yavin".

**MOTION:** One continuous zoom to the right; the first chip fades as the second rises on "films".

**OST:** "36,453 BBY to the films"

**VO:**
"Zoom from thirty-six thousand years before the Battle of Yavin, all the way to the films."

---

## ACT 3 · THE END (0:32 – 0:40)

### Scene 5 · 0:32 – 0:40 · Built the same way

**FRAME:** A card: "Built mostly by AI agents (Claude and OpenAI), reviewed by a human. Open source." and "API docs: timescale.info/docs/api". Then `shortEnd` with "Timelines through the API".

**MOTION:** The phone eases away; the card rises; the end card follows and holds.

**OST:** ""

**VO:**
"And the app itself? Built mostly by AI agents, Claude and OpenAI's, and reviewed by a human. It's free and open source."

**[END · ~0:40]**

---

## Appendix A · Narration only (for the voice session)

> I asked an AI assistant to build a Star Wars timeline, from the comics to the games.
>
> I gave it an API key for my timelines. It learned the file format, wrote the document, and posted it.
>
> I checked the result: ninety-eight moments of canon and Legends, every era on one line.
>
> Zoom from thirty-six thousand years before the Battle of Yavin, all the way to the films.
>
> And the app itself? Built mostly by AI agents, Claude and OpenAI's, and reviewed by a human. It's free and open source.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                     | Source                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | The timeline began as this one request to an assistant                                                                    | The maintainer's account ([#307](https://github.com/openchronology/timeline-app/issues/307))                             |
| 2     | Keys are sent as `Authorization: Bearer och_key_…` with `timelines:read` and `timelines:write`                            | [HTTP API: calling it](../../docs/api.md#calling-it)                                                                     |
| 2     | It read a document with `GET /api/timelines/{id}/document?download=1` and created the timeline with `POST /api/timelines` | `server/openapi/timelines.mjs`; [Video 12](../12-ai-and-automation.md), Appendix B                                       |
| 2     | Later requests (a `PUT` of the document) added more moments; the short folds them into "posted it"                        | [Video 12](../12-ai-and-automation.md), Scene 4                                                                          |
| 3     | 98 moments, 13 eras (durations), canon and Legends                                                                        | `publicity/video/samples/star-wars.ochx`                                                                                 |
| 3     | An unofficial fan chronology; many dates approximate                                                                      | The timeline's description and its moments' **Date precision** in `star-wars.ochx`                                       |
| 4     | Earliest moment 36,453 BBY ("The Je'daii gather on Tython"); 0 BBY is the Battle of Yavin                                 | `star-wars.ochx`                                                                                                         |
| 5     | Built mostly by AI agents (Claude and OpenAI's models), reviewed and merged by one maintainer; GPL-3.0                    | The maintainer ([#307](https://github.com/openchronology/timeline-app/issues/307)); [Licensing](../../docs/licensing.md) |
| 5     | The API reference is at `/docs/api`                                                                                       | [HTTP API](../../docs/api.md)                                                                                            |

## Appendix C · Posting

- **Title (Shorts):** I asked an AI to build a Star Wars timeline
- **Caption:** One prompt and one API key: an assistant read the file format, wrote the document and posted it through OpenChronology's API. 98 moments, from 36,453 BBY to the films, on one zoomable line. I checked it; some dates are approximate. The app itself is built mostly by AI agents (Claude and OpenAI) and reviewed by a human. Free and open source, link in bio. An unofficial fan chronology, not affiliated with Lucasfilm. #ai #programming #starwars #opensource
- **Cover:** frame 0 (the prompt and the headline).
- **Pinned comment:** "API docs: timescale.info/docs/api · source: github.com/openchronology/timeline-app. Keys are passwords: give them only to tools you trust, and revoke them when done."
