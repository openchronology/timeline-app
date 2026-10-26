# OpenChronology — Timelines from AI and Automation: Script and Storyboard

**Runtime:** ~2:50 (at about 145 words a minute) · **Format:** animated infographic, **Terminal** look, with captures of the real app for the result · **Aspect:** 16:9
**Audience:** developers, data and research folks, educators and hobbyists who use AI assistants or write scripts, and people curious how a project built with AI works. Many have pasted an API key into a tool before; some are wary of doing it.
**Purpose:** follow one real timeline (the Star Wars chronology at timescale.info/athan/star-wars) from a single request to an assistant, through the API key and the requests the assistant sent, to the result in the app; show how to keep such work honest; widen it to every other kind of automation; and say plainly how OpenChronology itself is built.

**How it differs:** the requests are shown as they were sent, in terminal panels, with the key redacted; the result is the real app on the real timeline; and the video is candid about its own maker: most of the code is written by AI agents, and one person reviews it.

**Production notes:**

- Narration is about 410 words. Plain and even: a developer showing a colleague what happened, neither selling AI nor apologising for it.
- **The timeline is the sample `publicity/video/samples/star-wars.ochx`**: the live Star Wars timeline from timescale.info/athan/star-wars, downloaded through the API. 98 moments, 13 durations (eras), 20 relationships, a custom BBY/ABY time display, and its earliest moment "The Je'daii gather on Tython" at 36,453 BBY. It's shown in the real editor, in a browser window whose address bar reads `timescale.info/athan/star-wars`.
- **The requests** in the terminal panels are the endpoints the assistant used (Appendix B), drawn as HTTP requests; IDs and revision numbers are elided (`{id}`, `"…"`), and the key is only ever `och_key_…`.
- **Accuracy guardrails:**
  - Keys are made in **Account → API keys** and sent as `Authorization: Bearer och_key_…`. Scopes: `timelines:read` (always included) and `timelines:write` (**Allow timeline writes**). Keys reach only `/api/timelines…`, need no CSRF token, are rate-limited per key (`API_KEY_REQUESTS_PER_MINUTE`, default 120), expire (1–365 days) and can be revoked at any time.
  - Never show a real key. A key is a password: give it only to tools you trust, scope it as narrowly as the job allows, revoke it when done.
  - There's no AI feature in the app. Assistants use the same public API as any script.
  - Don't overstate what the AI did alone: a person asked, granted the key, and reviewed the result.
  - The Star Wars timeline is an unofficial fan chronology with approximate dates, not affiliated with or endorsed by Lucasfilm; it says so on screen and on the end card.
  - The issue, pull request and CI checks in Scene 8 are real (#303, #304); their titles are quoted as GitHub shows them.

---

## ACT 1 · ONE REQUEST (0:00 – 0:44)

### Scene 1 · 0:00 – 0:17 · The ask

**FRAME:** A terminal-style chat panel titled "assistant". A prompt, typed by the person: "Create a timeline for the Star Wars extended history, with comics, Legends, games, TV and books." Below it, three plan chips the assistant will work through: "read the format", "write a document", "send it to the API".

**MOTION:** The prompt types on; the chips tick in one by one; on "key", a key-shaped slot glows empty beside them.

**OST:** "One request to an assistant"

**VO:**
"This timeline began as one request to an AI assistant: create a timeline of the Star Wars extended history, with comics, Legends, games, TV and books. The assistant works through the HTTP API, and for that, it needs a key."

### Scene 2 · 0:17 – 0:44 · The key

**FRAME:** Left: the **API keys** card from **Account**, with **New API key** open: **Key name** "Star Wars assistant", **Expires after (days)** "30", **Allow timeline writes (reads are always included)** ticked, **Create API key**. Then the one-time notice "Copy this key now · It will not be shown again" with `och_key_…` (the rest blurred), and the key's row: "Star Wars assistant · och_key_… · timelines:read, timelines:write · Expires …", **Active**, **Revoke**. Right: the key's reach: an arrow to `/api/timelines…` with a tick; struck-out arrows to "your account" and "the site's administration"; chips "120 requests a minute (default)", "expires", "Revoke at any time". At the foot: "A key is a password."

**MOTION:** The form fills and **Create API key** is pressed; the notice appears, then folds into the row; the reach diagram draws arrow by arrow; the chips tick in as they're named.

**OST:** "A key that reaches only timelines"

**VO:**
"In Account, API keys, make a key that can read and write timelines, and give it to the assistant. It reaches the timeline endpoints and nothing else, a hundred and twenty requests a minute by default, and it expires. A key is a password: give it only to tools you trust, allow only what the job needs, and revoke it when you're done."

---

## ACT 2 · WHAT IT SENT (0:44 – 1:46)

### Scene 3 · 0:44 – 1:06 · Read the format, write the document

**FRAME:** A terminal titled "requests". First: `GET /api/timelines/{id}/document?download=1` with `Authorization: Bearer och_key_…`, answered `200` and the top of a document (`"format": "openchronology"`, `"presentation"`, `"events"`). Then, beside it, the document the assistant wrote, building up: a `"presentation"` with `"mode": "custom"` and a `print` function ending `" BBY" : " ABY"`; `"durations"` with "The Clone Wars" tagged `era`; `"events"` with "The Battle of Yavin" tagged `canon`, `legends`, `film`. Under it, a small BBY/ABY axis gaining its first moments and era bands. Last: `POST /api/timelines` → `201 Created`, and a chip "private".

**MOTION:** The GET types and its answer scrolls in; the document's three parts fill in as they're named (years, eras, tags); the POST types; `201` and "private" pop.

**OST:** "Read the format. Write the document."

**VO:**
"First, it downloaded an existing timeline to learn the format. Then it wrote its own: years counted before and after the Battle of Yavin, the eras as durations, and every moment tagged by continuity and by medium. One POST created it, private, as every new timeline starts."

### Scene 4 · 1:06 – 1:22 · Add to it, make it public

**FRAME:** The terminal again: `PUT /api/timelines/{id}` with `{ "revision": "…", "document": { … } }` → `200`, and a dim note "an older revision → 409 Conflict". Beside it, the BBY/ABY axis, where the additions pop in, each a moment with its source: "Thrawn (2017)", "Thrawn: Alliances", "Thrawn: Treason", "Tales of the Jedi", "Tales of the Empire", "Tales of the Underworld", "Star Wars: Visions". Then `PATCH /api/timelines/{id}/settings` with `{ "visibility": "public", "slug": "star-wars" }` → `200`, and the address chip `timescale.info/athan/star-wars`.

**MOTION:** The PUT types; the Thrawn books, then the Tales series, then Visions pop onto the axis on their words; the PATCH types; the address chip slides out under it.

**OST:** "Add to it. Make it public."

**VO:**
"Later, it added the Thrawn books, the Tales series and Visions, each a PUT against the current revision, so it couldn't overwrite a newer save. Then one PATCH made it public, at a short address."

### Scene 5 · 1:22 – 1:46 · The result

**FRAME:** A browser window at `timescale.info/athan/star-wars` showing the real editor on the timeline: the whole chronology, from "The Je'daii gather on Tython" at 36,453 BBY on the left to the summaries near 0 BBY, with "The Old Republic" band. A chip: "98 moments · 13 eras · 20 relationships". The capture zooms from the far past to the films (40 BBY to 45 ABY): the summaries open into moments, eras and relationship arcs. A callout at the start, "36,453 BBY", and at the end, "0 BBY · the Battle of Yavin". A note under the window: "An unofficial fan chronology · not affiliated with Lucasfilm".

**MOTION:** The window rises in; the chip counts up; a long continuous zoom to the right; the callouts fade in on "Tython" and "films".

**OST:** "98 moments on one line"

**VO:**
"Here it is: ninety-eight moments, thirteen eras and twenty relationships, from Tython, thirty-six thousand years before Yavin, to the films. It's an unofficial fan chronology, and plenty of its dates are approximate."

---

## ACT 3 · KEEPING IT HONEST (1:46 – 2:12)

### Scene 6 · 1:46 – 2:12 · Review it like any contribution

**FRAME:** The window, with **View mode** on: "Thrawn joins the Empire" open in the reader, its **Date precision** reading "Approximate: the novel spans the years up to 2 BBY." outlined. Then the window eases left and two cards stand beside it: **History** (a list of saved revisions, newest first, one marked "a bad edit" and an arrow back to the one before) and **Pull requests** ("Propose changes", "Fix the date of…", **Merge**). At the foot, three small steps with a person icon: "asked", "gave the key", "checked the result".

**MOTION:** The reader opens; the outline draws on "approximate"; the window slides; the History rows tick in and the arrow points back on "put right"; the pull request card rises on "pull request"; the three steps light in turn.

**OST:** "Approximate where unsure. Reviewed."

**VO:**
"Where it wasn't sure, the assistant marked the date approximate and said why. Every save is kept in History, so a bad edit can be put right, and anyone signed in can propose a fix as a pull request. A person asked, gave the key and checked the result. Review what an AI makes like anyone's contribution."

---

## ACT 4 · AUTOMATION, AND HOW IT'S BUILT (2:12 – 2:50)

### Scene 7 · 2:12 – 2:30 · Any script, the same key

**FRAME:** An API key chip `och_key_…` at the centre, wired to `/api/timelines…`. Around it, the things that use one: "AI assistant", `och-import-logs`, "syslog receiver", "journald follower" (a small "Video 10" tag on the three), then `curl`, "Python", "cron job", "CI pipeline", "notebook". Right: two cards: `/docs/api` ("every operation · Try it") and `/api/openapi.json` ("for code generators and agents").

**MOTION:** The wires draw out from the key to each user as it's named, packets running back along them; the two cards rise on "reference" and "OpenAPI".

**OST:** "Any script, the same key"

**VO:**
"The same kind of key drives the log importer, the syslog and journal receivers, and any script: curl, Python, a cron job, a CI pipeline, a notebook. The API reference and its OpenAPI description cover every endpoint, for code generators and agents."

### Scene 8 · 2:30 – 2:58 · How the app is built

**FRAME:** A pipeline, left to right. An issue card: "#303 · Agreeing to the terms fails: Failed to construct 'FormData'", with its note "No test clicked the button in a browser". Two agent lanes writing code and tests in parallel: "Claude · Claude Code" and "OpenAI's models". A pull request card: "#304 · Agreeing to the terms works again", "+ test/terms-live-postgres.mjs". A CI column of real checks: "Core / npm / Node 22", "Browser / chromium", "Browser / firefox", "Browser / webkit", "PostgreSQL 16 / native pgmp / accounts and sharing", "Server packages / Server / debian13", "… 30 checks", each ticked. Last, a person icon: "one maintainer · reviews and merges every pull request · runs the servers", and "Merged".

**MOTION:** Cards rise left to right with the narration; the agent lanes fill with lines of code; the checks tick down the column on "tests"; the issue card flashes red on "broke", and the PR card's test line lights on "browser test".

**OST:** "Built by agents, reviewed by a person"

**VO:**
"OpenChronology itself is built this way. Most of its code is written by AI coding agents: Anthropic's Claude, through Claude Code, and OpenAI's models. One maintainer decides what gets built, reviews and merges every pull request, and runs the servers. Agents make mistakes, so every pull request runs the tests in CI. When the Agree button on the terms broke, the fix came with a browser test that presses it."

### Scene 9 · 2:58 – 3:06 · Close

**FRAME:** The end card: "Your timelines, built by you, your scripts, or your assistant", the ◷ wordmark, "docs: /docs/api · /api/openapi.json", and the source: "github.com/openchronology/timeline-app". A small line: "Star Wars: an unofficial fan chronology, not affiliated with or endorsed by Lucasfilm."

**MOTION:** The end card fades in and holds.

**OST:** "Built by you, your scripts, or your assistant"

**VO:**
"Your timelines, built by you, your scripts, or your assistant, on a server you can run yourself."

**[END · ~2:50]**

---

## Appendix A · Narration only (for the voice session)

> This timeline began as one request to an AI assistant: create a timeline of the Star Wars extended history, with comics, Legends, games, TV and books. The assistant works through the HTTP API, and for that, it needs a key.
>
> In Account, API keys, make a key that can read and write timelines, and give it to the assistant. It reaches the timeline endpoints and nothing else, a hundred and twenty requests a minute by default, and it expires. A key is a password: give it only to tools you trust, allow only what the job needs, and revoke it when you're done.
>
> First, it downloaded an existing timeline to learn the format. Then it wrote its own: years counted before and after the Battle of Yavin, the eras as durations, and every moment tagged by continuity and by medium. One POST created it, private, as every new timeline starts.
>
> Later, it added the Thrawn books, the Tales series and Visions, each a PUT against the current revision, so it couldn't overwrite a newer save. Then one PATCH made it public, at a short address.
>
> Here it is: ninety-eight moments, thirteen eras and twenty relationships, from Tython, thirty-six thousand years before Yavin, to the films. It's an unofficial fan chronology, and plenty of its dates are approximate.
>
> Where it wasn't sure, the assistant marked the date approximate and said why. Every save is kept in History, so a bad edit can be put right, and anyone signed in can propose a fix as a pull request. A person asked, gave the key and checked the result. Review what an AI makes like anyone's contribution.
>
> The same kind of key drives the log importer, the syslog and journal receivers, and any script: curl, Python, a cron job, a CI pipeline, a notebook. The API reference and its OpenAPI description cover every endpoint, for code generators and agents.
>
> OpenChronology itself is built this way. Most of its code is written by AI coding agents: Anthropic's Claude, through Claude Code, and OpenAI's models. One maintainer decides what gets built, reviews and merges every pull request, and runs the servers. Agents make mistakes, so every pull request runs the tests in CI. When the Agree button on the terms broke, the fix came with a browser test that presses it.
>
> Your timelines, built by you, your scripts, or your assistant, on a server you can run yourself.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                            | Source                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | The Star Wars timeline began as one request to an assistant, in these words                                                                                                      | The maintainer's account ([#307](https://github.com/openchronology/timeline-app/issues/307))                                          |
| 2     | **Account → API keys**: **New API key**, **Key name**, **Expires after (days)** (1–365), **Allow timeline writes (reads are always included)**, **Create API key**, **Revoke**   | `platform/components/account-access.jsx` (`ApiKeysCard`)                                                                              |
| 2     | Keys are sent as `Authorization: Bearer och_key_…`, reach `/api/timelines…` only, with `timelines:read` and `timelines:write`, and need no CSRF token                            | [HTTP API: calling it](../docs/api.md#calling-it); `server/api-keys.mjs`                                                              |
| 2     | They can't manage accounts or the site; the secret is shown once                                                                                                                 | The card's help in `account-access.jsx` ("cannot manage accounts or the site"; "It will not be shown again")                          |
| 2     | Rate-limited per key, 120 requests a minute by default (`API_KEY_REQUESTS_PER_MINUTE`)                                                                                           | [Administration](../docs/administration.md); `server/openapi/timelines.mjs` (Timelines tag)                                           |
| 3     | `GET /api/timelines/{id}/document?download=1` returns the document alone, as an `.ochx`                                                                                          | `server/openapi/timelines.mjs` (`getTimelineDocument`)                                                                                |
| 3     | The document: a custom display printing BBY/ABY, 13 durations tagged `era`, moments tagged by continuity (`canon`, `legends`, `non-canon`) and medium (`film`, `tv`, `novel`, …) | `publicity/video/samples/star-wars.ochx`                                                                                              |
| 3     | `POST /api/timelines` creates a **private** timeline from a document; `201`                                                                                                      | `server/openapi/timelines.mjs` (`createTimeline`)                                                                                     |
| 4     | `PUT /api/timelines/{id}` with `{ revision, document }`; a revision other than the current one is refused with `409`                                                             | `server/openapi/timelines.mjs` (`saveTimeline`)                                                                                       |
| 4     | The additions: Thrawn (2017), Alliances, Treason and the Ascendancy trilogy; Tales of the Jedi, of the Empire and of the Underworld; Visions                                     | The maintainer's account (#307); the moments' sources in `star-wars.ochx`                                                             |
| 4     | `PATCH /api/timelines/{id}/settings` with `visibility` and `slug`; the address is `/<owner>/<slug>`                                                                              | `server/openapi/timelines.mjs` (`updateTimelineSettings`); [Sharing: addresses](../docs/sharing.md#addresses)                         |
| 5     | 98 moments, 13 durations, 20 relationships; earliest "The Je'daii gather on Tython", 36,453 BBY; 0 BBY is the Battle of Yavin                                                    | `star-wars.ochx`                                                                                                                      |
| 5, 9  | An unofficial fan chronology, not affiliated with or endorsed by Lucasfilm                                                                                                       | The timeline's own description in `star-wars.ochx`                                                                                    |
| 6     | 13 moments' **Date precision** begins "Approximate"; "Thrawn joins the Empire": "Approximate: the novel spans the years up to 2 BBY."                                            | `star-wars.ochx` (the **Dating context** plugin's `datePrecision`)                                                                    |
| 6     | **History** keeps saved revisions; signed-in readers of a public timeline can **Propose changes** as a pull request                                                              | [Collaboration](../docs/collaboration.md#forks-duplicates-and-saved-history), [pull requests](../docs/collaboration.md#pull-requests) |
| 7     | The log importer and the syslog and journald receivers write through the public API with an API key                                                                              | [Log import](../docs/log-import.md), [Syslog](../docs/syslog.md), [The systemd journal](../docs/journald.md)                          |
| 7     | `/docs/api` (every operation, **Try it**) and `/api/openapi.json` (for code generators)                                                                                          | [HTTP API](../docs/api.md)                                                                                                            |
| 8     | Most of the code is written by AI coding agents (Claude through Claude Code, and OpenAI's models), directed by one maintainer who reviews and merges every pull request          | The maintainer ([#307](https://github.com/openchronology/timeline-app/issues/307)); the repository's commit trailers                  |
| 8     | #303 "Agreeing to the terms fails: Failed to construct 'FormData'"; no test clicked the button in a browser                                                                      | [#303](https://github.com/openchronology/timeline-app/issues/303)                                                                     |
| 8     | #304 "Agreeing to the terms works again", adding `test/terms-live-postgres.mjs`, a real browser pressing **Agree**                                                               | [#304](https://github.com/openchronology/timeline-app/pull/304)                                                                       |
| 8     | 30 checks per CI run, among them Core (npm, pnpm, yarn on Node 22 and 24), Browser (chromium, firefox, webkit), PostgreSQL 16, and the server and desktop packages               | `gh pr checks 304`; `.github/workflows/ci.yml`                                                                                        |

## Appendix C · Questions this audience is likely to ask

1. **Is there an AI feature in the app?** No. Assistants use the same public HTTP API as any script; nothing in OpenChronology calls a model.
2. **Can a key change my account or password?** No. Keys reach only `/api/timelines…`; account, sign-in and administration endpoints refuse them.
3. **Can I give a key read-only access?** Yes: leave **Allow timeline writes** unticked and the key has `timelines:read` only.
4. **What if the assistant gets something wrong?** It's your timeline: every save is in **History**, and you can edit or put back an earlier revision. On a public timeline, others can propose fixes as pull requests for you to review.
5. **Which assistant was used?** Any assistant or agent that can send HTTP requests will do; the video doesn't depend on one. The app itself is mostly written by Claude (through Claude Code) and OpenAI's models.
6. **Is the Star Wars timeline official?** No. It's an unofficial fan chronology with approximate dates, not affiliated with or endorsed by Lucasfilm.
