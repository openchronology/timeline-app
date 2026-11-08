# GitHub to timelines

<!-- description: Mirror GitHub issues and pull requests into timelines as durations, ongoing while open, with their events as moments, by webhook or import. -->

OpenChronology can aggregate the work your tools already record. For GitHub (#538), each issue and pull request becomes a **duration**:

- it starts when the item was opened;
- it is [ongoing](durations.md#ongoing-durations) while the item is open;
- it ends when the item was closed or merged.

What happens to them becomes **moments**: labels, milestones, assignments, reviews, mentions, moves on a project board and more. Items that name each other are **linked**. Two tools write them, and both use the same IDs:

- **The webhook receiver** (`server/github-receiver.mjs`) keeps timelines in step as things happen.
- **The importer** (`och-import-github`, `server/import-github.mjs`) brings in what already exists, and can run again at any time to bring timelines up to date.

Each tool only reads from GitHub. Nothing is written back.

## What a timeline shows

| On GitHub                          | On the timeline                                                             |
| ---------------------------------- | --------------------------------------------------------------------------- |
| An issue or pull request is opened | A duration from its creation, ongoing, titled `#412 Fix the login loop`     |
| It is closed or merged             | The duration ends then                                                      |
| It is reopened                     | The end is ongoing again                                                    |
| It is edited, labelled, milestoned | The duration's title, notes and tags follow                                 |
| Something happens to it            | A moment at that time (below)                                               |
| A pull request says "closes #12"   | A link between the pull request and issue 12, when both are on the timeline |
| An issue is deleted                | Its duration is removed (webhook only)                                      |

### Events as moments

Each moment is titled with what happened and the item, such as `Labelled bug: #412 Fix the login loop`. Its tags are:

- `github`;
- the repository's and the item's tags;
- the event, such as `labeled` or `merged`;
- what it was about, such as `label:bug`;
- the person, as `github/<login>`.

The person is the one assigned, the reviewer whose review was requested or given, and otherwise whoever did it.

| Kind          | Events, and their tags                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assignments` | `assigned`, `unassigned`                                                                                                                                                      |
| `labels`      | `labeled`, `unlabeled`, with `label:<name>`                                                                                                                                   |
| `milestones`  | `milestoned`, `demilestoned`, with `milestone:<title>`                                                                                                                        |
| `state`       | `closed`, `reopened`, `merged`: who did it, besides the duration's end                                                                                                        |
| `renames`     | `renamed`, titled with the old title                                                                                                                                          |
| `reviews`     | `review requested`, `review request removed`, `reviewed` (with `review:approved`, `review:changes requested` or `review:commented`), `ready for review`, `converted to draft` |
| `mentions`    | `mentioned`, on the item named, with the naming item's tag, and a link between the two: one moment per pair, however often it is named again                                  |
| `relations`   | `sub-issue added`/`removed`, `parent issue added`/`removed` (with the other item's tag, and a link), `marked as duplicate`, `unmarked as duplicate`                           |
| `status`      | `moved`, with `status:<column>` and `project:<name>`: a move on a project board                                                                                               |
| `other`       | `locked`, `unlocked`, `pinned`, `unpinned`, `transferred`                                                                                                                     |

All kinds are recorded unless the routing rules list some (`"events": ["labels", "reviews"]`), or the importer is given `--events`. A comment's text is never copied: comments only add the `mentioned` moments of the items they name.

**Project boards.** A move is recorded live from GitHub's `projects_v2_item` deliveries, which GitHub sends for organization projects only. The receiver needs a `GITHUB_TOKEN` to name the moved item, since deliveries identify it by node ID. The importer records the moves an item's timeline lists. GitHub's timelines have [mostly stopped recording status changes since September 2026](https://github.com/orgs/community/discussions/209484), so history before the receiver started may be missing.

Every moment's ID is made from its item, what happened, to what and when. So the importer and the receiver write the same event as one moment.

A duration's notes are the first 4,000 characters of the item's text, followed by its address, and its `url` field links to it.

Its tags are written as GitHub writes references:

- `github`;
- `github/<owner>/<name>`, the repository;
- `github/<owner>/<name>#<number>`, the item itself, such as `github/acme/app#412`;
- `issue` or `pull request`;
- `state:open`, `state:closed` or `state:merged`;
- `assigned`, while it has assignees, and `github/<login>` for each of them;
- `label:<name>` for each label;
- `milestone:<title>`.

An assignment moment carries the item's tag, `assigned` or `unassigned`, and the person's `github/<login>`.

Tags are lower case, at most 64 characters and at most 40 per entity. A repository whose name is too long for that is tagged by a hash of its name instead, such as `github/3f9a0c…#412`. The hash is the same on every import and delivery.

**Separating by tags** draws a chart of the work:

- **By person:** separate by `github/<login>` tags for one row per person. Separate by `assigned` to compare assigned work with work nobody has taken.
- **By kind of work:** separate by `label:` tags.
- **One item's history:** separate by an item's tag, such as `github/acme/app#412`, to gather its duration and every assignment made on it.

IDs come from the source: `gh:<owner>:<repo>:<number>` for an item, and `gh:<owner>:<repo>:<number>:assigned:<event>` for an assignment. So a delivery GitHub sends twice, or an import run again, updates the same entities rather than adding copies.

## Set up

1. Create the timelines. Choose the **Gregorian** time display (**Time display**): an open item ends "now", and only calendar timelines have one. Both tools check this before writing.
2. In **Account → API keys**, create a **read/write** key for an account that can write those timelines.
3. Write the routing rules to `github-routes.json`. The first rule matching a repository wins, then `default`; a repository nothing matches is not kept. Names ignore case.

```json
{
  "routes": [
    { "repository": "acme/app", "timeline": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5" },
    { "repository": "acme/*", "timeline": "0b7e1111-2222-4333-8444-555566667777" }
  ],
  "default": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5",
  "events": ["assignments", "labels", "milestones", "state", "reviews", "mentions", "status"]
}
```

## Importing what exists

```sh
export OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... GITHUB_TOKEN=github_pat_...

och-import-github --repo acme/app --timeline 6f1c… --dry-run
och-import-github --repo acme/app --repo acme/site --config github-routes.json
och-import-github --repo acme/app --timeline 6f1c… --since 2026-11-01
```

`npm run import:github -- …` runs it from a checkout.

| Option              | Meaning                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--repo owner/name` | A repository to import; repeat for several.                                                                     |
| `--timeline <uuid>` | The timeline to write to, for every repository.                                                                 |
| `--config <file>`   | Routing rules instead (default `GITHUB_ROUTES`, else `github-routes.json`).                                     |
| `--since <time>`    | Only items updated since then (GitHub's `since`), and events since then. Use it to bring a timeline up to date. |
| `--events <kinds>`  | Only these kinds of event, comma-separated (default: the routes' `events`, else all).                           |
| `--no-events`       | No events: only the items, without reading each one's timeline.                                                 |
| `--dry-run`         | Read GitHub and report what would be written, without writing.                                                  |

**Access and limits:**

- **Token:** `GITHUB_TOKEN` is a personal access token, or a fine-grained one with read access to **Issues** and **Pull requests**. It is needed for private repositories. It raises GitHub's limit from 60 requests an hour to 5,000.
- **Requests:** listing the items costs one request per 100 of them. Each item's events cost at least one more, since every item has its own timeline. A repository with 2,000 issues therefore costs about 2,020 requests, under half an hour of GitHub's hourly limit. `--since` keeps later runs small, and `--no-events` skips the timelines.
- **Rate limit:** when the limit runs out, the importer waits if it resets within 15 minutes, and otherwise stops with a message.
- **GitHub Enterprise:** set `GITHUB_API_URL`, such as `https://github.example.com/api/v3`.

Exit codes:

- **0:** everything was imported.
- **1:** a repository could not be read or written.
- **2:** a usage error.

## Following changes live

Run the receiver where GitHub can reach it, behind a reverse proxy that provides HTTPS:

```sh
OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... GITHUB_WEBHOOK_SECRET=... \
  GITHUB_ROUTES=./github-routes.json npm run github
```

Then, in the repository's or organization's **Settings → Webhooks → Add webhook**:

- **Payload URL:** the receiver's address.
- **Content type:** `application/json`.
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET`.
- **Events:** **Issues**, **Pull requests**, **Pull request reviews**, **Issue comments** (for mentions) and **Sub-issues**. On an organization, also **Projects v2 items**, for moves on its boards; these need `GITHUB_TOKEN`.

GitHub's first delivery is a ping, which the receiver answers.

| Variable                     | Default                  | Meaning                                                                                    |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `OCH_API_URL`, `OCH_API_KEY` | (required)               | The server's origin and a read/write API key.                                              |
| `GITHUB_WEBHOOK_SECRET`      | (required)               | The webhook's secret. Deliveries without a valid `X-Hub-Signature-256` are refused (401).  |
| `GITHUB_ROUTES`              | `github-routes.json`     | Path of the routing rules; `GITHUB_ROUTES_JSON` may hold them inline instead.              |
| `GITHUB_HOST`, `GITHUB_PORT` | `127.0.0.1`, `5580`      | Address and port to listen on.                                                             |
| `GITHUB_FLUSH_MS`            | `1000`                   | How long changes gather before they are saved.                                             |
| `GITHUB_TOKEN`               | (none)                   | A token that can read the organization's issues, to name the items of project board moves. |
| `GITHUB_API_URL`             | `https://api.github.com` | GitHub Enterprise's API, for that.                                                         |

**How it saves:**

- **Answering GitHub:** it answers each delivery at once (202), then saves.
- **Batching:** changes to the same item within `GITHUB_FLUSH_MS` save once, in their last state.
- **Links:** they save apart from the items. A link to an issue that is not on the timeline (another repository's, say) is refused by the server and let go.
- **Retries:** when the server is unreachable or busy, it keeps the changes and retries.
- **Stopping:** on SIGTERM or SIGINT it saves what is queued, for up to ten seconds, before exiting.
- **Missed deliveries:** to catch up on any, run the importer with `--since`.

## Privacy

Events name people, so the timelines mirror personal data from GitHub. Only what the tables above list is copied:

- titles, and the start of each item's text;
- labels, milestones, review states and board columns;
- the logins of the people assigned, of reviewers, and of whoever acted.

The text of comments and reviews, reactions, and anyone's email address are not copied. Only the kinds of event listed in the rules are recorded at all.

A deleted issue is removed by the webhook receiver, and an unassignment is recorded as it happens. Choose who may read the timelines accordingly: a private repository's issues belong on a private timeline.
