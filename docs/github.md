# GitHub to timelines

<!-- description: Mirror GitHub issues and pull requests into timelines as durations, ongoing while open, with assignments and links, by webhook or import. -->

OpenChronology can aggregate the work your tools already record. For GitHub (#538), each issue and pull request becomes a **duration**:

- it starts when the item was opened;
- it is [ongoing](durations.md#ongoing-durations) while the item is open;
- it ends when the item was closed or merged.

Assignments become **moments**, and a pull request that says "closes #12" is **linked** to issue 12. Two tools write them, and both use the same IDs:

- **The webhook receiver** (`server/github-receiver.mjs`) keeps timelines in step as things happen.
- **The importer** (`och-import-github`, `server/import-github.mjs`) brings in what already exists, and can run again at any time to bring timelines up to date.

Each tool only reads from GitHub. Nothing is written back.

## What a timeline shows

| On GitHub                          | On the timeline                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| An issue or pull request is opened | A duration from its creation, ongoing, titled `#412 Fix the login loop`         |
| It is closed or merged             | The duration ends then                                                          |
| It is reopened                     | The end is ongoing again                                                        |
| It is edited, labelled, milestoned | The duration's title, notes and tags follow                                     |
| Someone is assigned or unassigned  | A moment at that time, tagged `assigned` or `unassigned` and `assignee:<login>` |
| A pull request says "closes #12"   | A link between the pull request and issue 12, when both are on the timeline     |
| An issue is deleted                | Its duration is removed (webhook only)                                          |

A duration's notes are the first 4,000 characters of the item's text, followed by its address, and its `url` field links to it.

Its tags are:

- `github`;
- `repository:<owner/name>`;
- `issue` or `pull request`;
- `state:open`, `state:closed` or `state:merged`;
- `assignee:<login>` for each assignee;
- `label:<name>` for each label;
- `milestone:<title>`.

Tags are lower case, at most 64 characters and at most 40 per item.

**Separating by tags** draws a chart of the work. Separate by `assignee:` tags for one row per person, or by `label:` tags for one row per kind of work.

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
  "default": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5"
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

| Option              | Meaning                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--repo owner/name` | A repository to import; repeat for several.                                                                               |
| `--timeline <uuid>` | The timeline to write to, for every repository.                                                                           |
| `--config <file>`   | Routing rules instead (default `GITHUB_ROUTES`, else `github-routes.json`).                                               |
| `--since <time>`    | Only items updated since then (GitHub's `since`), and assignments made since then. Use it to bring a timeline up to date. |
| `--no-events`       | Leave assignments out: one listing less per repository.                                                                   |
| `--dry-run`         | Read GitHub and report what would be written, without writing.                                                            |

**Access and limits:**

- **Token:** `GITHUB_TOKEN` is a personal access token, or a fine-grained one with read access to **Issues** and **Pull requests**. It is needed for private repositories. It raises GitHub's limit from 60 requests an hour to 5,000.
- **Requests:** each page holds 100 items, so a repository with 2,000 issues costs about 20 requests, plus its events.
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
- **Events:** **Issues** and **Pull requests**.

GitHub's first delivery is a ping, which the receiver answers.

| Variable                     | Default              | Meaning                                                                                   |
| ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `OCH_API_URL`, `OCH_API_KEY` | (required)           | The server's origin and a read/write API key.                                             |
| `GITHUB_WEBHOOK_SECRET`      | (required)           | The webhook's secret. Deliveries without a valid `X-Hub-Signature-256` are refused (401). |
| `GITHUB_ROUTES`              | `github-routes.json` | Path of the routing rules; `GITHUB_ROUTES_JSON` may hold them inline instead.             |
| `GITHUB_HOST`, `GITHUB_PORT` | `127.0.0.1`, `5580`  | Address and port to listen on.                                                            |
| `GITHUB_FLUSH_MS`            | `1000`               | How long changes gather before they are saved.                                            |

**How it saves:**

- **Answering GitHub:** it answers each delivery at once (202), then saves.
- **Batching:** changes to the same item within `GITHUB_FLUSH_MS` save once, in their last state.
- **Links:** they save apart from the items. A link to an issue that is not on the timeline (another repository's, say) is refused by the server and let go.
- **Retries:** when the server is unreachable or busy, it keeps the changes and retries.
- **Stopping:** on SIGTERM or SIGINT it saves what is queued, for up to ten seconds, before exiting.
- **Missed deliveries:** to catch up on any, run the importer with `--since`.

## Privacy

Assignments and assignees name people, so the timelines mirror personal data from GitHub. Only what the table above lists is copied: titles, the start of each item's text, labels, milestones and the logins of assignees. Comments, reactions and anyone's email address are not copied.

A deleted issue is removed by the webhook receiver, and an unassignment is recorded as it happens. Choose who may read the timelines accordingly: a private repository's issues belong on a private timeline.
