# GitHub to timelines

<!-- description: Mirror GitHub, GitLab, Forgejo and Gitea issues, pull requests and commits into timelines, ongoing while open, by webhook or import. -->

OpenChronology can aggregate the work your tools already record, from GitHub, from Forgejo and Gitea ([below](#forgejo-and-gitea)), and from GitLab ([below](#gitlab)) (#538). Each issue and pull request becomes a **duration**:

- it starts when the item was opened;
- it is [ongoing](durations.md#ongoing-durations) while the item is open;
- it ends when the item was closed or merged.

What happens to them becomes **moments**: labels, milestones, assignments, reviews, mentions, moves on a project board and more. So do **commits**, branches, forks and releases. Items that name each other are **linked**. Two tools write them, and both use the same IDs:

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

- the platform: `github`, `forgejo` or `gitlab`;
- the repository's and the item's tags;
- the event, such as `labeled` or `merged`;
- what it was about, such as `label:bug`;
- the person, as `github/<login>`.

The person is the one assigned, the reviewer whose review was requested or given, and otherwise whoever did it.

| Kind          | Events, and their tags                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`       | Each issue and pull request's duration, above. Without it, links (which need the durations) are left out too                                                                  |
| `commits`     | Each commit, below                                                                                                                                                            |
| `branches`    | `branch created`, `branch deleted` (live), or `branch` (imported: when a branch began, at its first commit of its own), with the branch's name                                |
| `forks`       | `forked`: each fork, at when it was made, with its owner's `github/<login>`                                                                                                   |
| `assignments` | `assigned`, `unassigned`                                                                                                                                                      |
| `labels`      | `labeled`, `unlabeled`, with `label:<name>`                                                                                                                                   |
| `milestones`  | `milestoned`, `demilestoned`, with `milestone:<title>`. Each milestone is also a duration from creation to closing (ongoing while open), with a `due` moment at its due date  |
| `state`       | `closed`, `reopened`, `merged`: who did it, besides the duration's end                                                                                                        |
| `renames`     | `renamed`, titled with the old title                                                                                                                                          |
| `reviews`     | `review requested`, `review request removed`, `reviewed` (with `review:approved`, `review:changes requested` or `review:commented`), `ready for review`, `converted to draft` |
| `mentions`    | `mentioned`, on the item named, with the naming item's tag, and a link between the two: one moment per pair, however often it is named again                                  |
| `relations`   | `sub-issue added`/`removed`, `parent issue added`/`removed` (with the other item's tag, and a link), `marked as duplicate`, `unmarked as duplicate`                           |
| `status`      | `moved`, with `status:<column>` and `project:<name>`: a move on a project board. The time in each column is also a duration, tagged `in column`                               |
| `releases`    | `released`: each published release, a moment on its repository, with `release:<tag>` (and `prerelease`)                                                                       |
| `other`       | `locked`, `unlocked`, `pinned`, `unpinned`, `transferred`                                                                                                                     |

All kinds are recorded, unless you choose:

- **Only some:** `--only commits` for the importer, or `"only": ["commits"]` in the routing rules.
- **All but some:** `--except forks,branches`, or `"except": ["forks", "branches"]`.

A comment's text is never copied: comments only add the `mentioned` moments of the items they name.

### Commits

Each commit is a moment on its repository, when it was authored, titled with its message's first line. The rest of the message, and its address, are its notes. Its tags are:

- the platform, and the repository's tag (`github/acme/app`): it belongs to the repository, not to an item;
- `commit`;
- the branch it was made on, as it is named, such as `feat/new_feature`;
- its author's account (`github/<login>`), when the platform knows it.

A commit's hash is in its ID and its address, never in a tag: a tag gathers many moments, and a hash names one. Email addresses are not copied.

Separating by a branch's tag shows the work done on it; by `commit`, every commit against the issues and releases around it. A commit that names an item (`Fixes #12`) is linked to it.

A commit is tagged with the branch it was made on:

- **The importer** reads the default branch first, then each other branch only as far as its own commits, so a commit later merged keeps its first branch. A branch whose last commit was already read (merged, say) costs no request.
- **The receiver** tags each push with the branch pushed to. GitHub marks commits already pushed to another branch, and those keep their first tag. Forgejo does not, so on Forgejo a commit merged without a merge commit takes the branch it was merged into.

**Project boards.** A move is recorded live from GitHub's `projects_v2_item` deliveries, which GitHub sends for organization projects only. The receiver needs a `GITHUB_TOKEN` to name the moved item, since deliveries identify it by node ID. The importer records the moves an item's timeline lists. GitHub's timelines have [mostly stopped recording status changes since September 2026](https://github.com/orgs/community/discussions/209484), so history before the receiver started may be missing.

**Time in each column.** Each stay in a board column is its own duration, such as `#412 in Review (Roadmap)`:

- it starts when the item was moved there;
- it ends when the item moved on or closed, and is ongoing until then.

Separating by `status:` tags turns the board's columns into rows, so it shows how long work waits in each. The receiver remembers which column each item is in, so a move can end the stay before it. Set `GITHUB_STATE` to a file to keep that across restarts. The importer works the stays out from an item's moves, so its history has the same gaps as the moves themselves (above).

**Releases and milestones** belong to the repository, not to an item:

- a release is a moment when it was published;
- a milestone is a duration, with its due date as a moment.

Items in a milestone carry its `milestone:<title>` tag, so separating by that tag lines them up against it. Deleting a release, or a milestone, removes it.

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
3. For the receiver, write the routing rules to `github-routes.json`. The first rule matching a repository wins, then `default`; a repository nothing matches is not kept. Names ignore case. A rule names a repository as the importer does (below), and `*` stands for everything under an owner or group, such as `forgejo:codeberg.org/acme/*`.

```json
{
  "routes": [
    { "repository": "acme/app", "timeline": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5" },
    { "repository": "acme/*", "timeline": "0b7e1111-2222-4333-8444-555566667777" }
  ],
  "default": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5",
  "except": ["forks", "branches"]
}
```

## Importing what exists

```sh
export OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... GITHUB_TOKEN=github_pat_...

och-import-github --repo acme/app --timeline 6f1c… --dry-run
och-import-github --repo acme/app --timeline 6f1c… --only commits
och-import-github --repo acme/app --timeline 6f1c… --except forks,branches --since 2026-11-01
FORGEJO_TOKEN=… och-import-github --repo forgejo:codeberg.org/acme/app --timeline 0b7e…
```

`npm run import:github -- …` runs it from a checkout.

It imports one repository into one timeline at a time.

| Option                | Meaning                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--repo <repository>` | The repository: `owner/name` on github.com, or `<platform>:<host>/<path>` elsewhere, such as `forgejo:codeberg.org/acme/app`. |
| `--timeline <uuid>`   | The timeline to write to.                                                                                                     |
| `--only <kinds>`      | Only these kinds, comma-separated: `--only commits`.                                                                          |
| `--except <kinds>`    | Every kind but these: `--except forks,branches`.                                                                              |
| `--since <time>`      | Only what was updated or happened since then. Use it to bring a timeline up to date.                                          |
| `--dry-run`           | Read the repository and report what would be written, without writing.                                                        |

**Access and limits:**

- **Token:** `GITHUB_TOKEN` is a personal access token, or a fine-grained one with read access to **Issues** and **Pull requests**. It is needed for private repositories. It raises GitHub's limit from 60 requests an hour to 5,000.
- **Requests:**
  - **Items:** listing them costs one request per 100. Each item's events cost at least one more, since every item has its own timeline. A repository with 2,000 issues therefore costs about 2,020 requests, under half an hour of GitHub's hourly limit.
  - **Commits:** one request per 100 commits on the default branch, plus one per other branch that has commits of its own.
  - **Keeping it small:** `--since` keeps later runs small, and `--only commits` reads no items at all.
- **Rate limit:** when the limit runs out, the importer waits if it resets within 15 minutes, and otherwise stops with a message.
- **GitHub Enterprise:** set `GITHUB_API_URL`, such as `https://github.example.com/api/v3`.

Exit codes:

- **0:** everything was imported.
- **1:** the repository could not be read, or the timeline written.
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
- **Events:** **Issues**, **Pull requests**, **Pull request reviews**, **Issue comments** (for mentions), **Sub-issues**, **Releases**, **Milestones**, **Pushes** (for commits), **Branch or tag creation** and **deletion**, and **Forks**. On an organization, also **Projects v2 items**, for moves on its boards; these need `GITHUB_TOKEN`.

GitHub's first delivery is a ping, which the receiver answers.

| Variable                     | Default                  | Meaning                                                                                          |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `OCH_API_URL`, `OCH_API_KEY` | (required)               | The server's origin and a read/write API key.                                                    |
| `GITHUB_WEBHOOK_SECRET`      | (one of these)           | The GitHub webhook's secret. Deliveries without a valid `X-Hub-Signature-256` are refused (401). |
| `FORGEJO_WEBHOOK_SECRET`     | (one of these)           | The Forgejo or Gitea webhook's secret, checked against `X-Forgejo-Signature`.                    |
| `GITLAB_WEBHOOK_TOKEN`       | (one of these)           | The GitLab webhook's secret token, compared with `X-Gitlab-Token`.                               |
| `GITHUB_ROUTES`              | `github-routes.json`     | Path of the routing rules; `GITHUB_ROUTES_JSON` may hold them inline instead.                    |
| `GITHUB_HOST`, `GITHUB_PORT` | `127.0.0.1`, `5580`      | Address and port to listen on.                                                                   |
| `GITHUB_FLUSH_MS`            | `1000`                   | How long changes gather before they are saved.                                                   |
| `GITHUB_STATE`               | (none)                   | A file in which to remember each item's open column, across restarts.                            |
| `GITHUB_TOKEN`               | (none)                   | A token that can read the organization's issues, to name the items of project board moves.       |
| `GITHUB_API_URL`             | `https://api.github.com` | GitHub Enterprise's API, for that.                                                               |

**How it saves:**

- **Answering GitHub:** it answers each delivery at once (202), then saves.
- **Batching:** changes to the same item within `GITHUB_FLUSH_MS` save once, in their last state.
- **Links:** they save apart from the items. A link to an issue that is not on the timeline (another repository's, say) is refused by the server and let go.
- **Retries:** when the server is unreachable or busy, it keeps the changes and retries.
- **Stopping:** on SIGTERM or SIGINT it saves what is queued, for up to ten seconds, before exiting.
- **Missed deliveries:** to catch up on any, run the importer with `--since`.

## Forgejo and Gitea

Forgejo and Gitea repositories are named with their host, as `forgejo:<host>/<owner>/<name>`, such as `forgejo:codeberg.org/acme/app`. Their tags name it too:

- the repository: `forgejo:codeberg.org/acme/app`;
- an item: `forgejo:codeberg.org/acme/app#5`;
- a person: `forgejo:codeberg.org/mona`.

github.com keeps its short form, `github/acme/app#412`, and GitHub Enterprise names its host like Forgejo does (`github:ghe.example.com/acme/app`). Everything above applies, with these differences:

- **Importer:** set `FORGEJO_TOKEN` to an access token that can read the repository.
- **Receiver:** in the repository's **Settings → Webhooks → Add webhook → Forgejo** (or Gitea):
  - **Target URL:** the receiver's address.
  - **Content type:** `application/json`.
  - **Secret:** the value of `FORGEJO_WEBHOOK_SECRET`.
  - **Trigger on:** issues, pull requests and their reviews, comments, releases, pushes, branch creation and deletion, and forks.

  One receiver takes GitHub's and Forgejo's deliveries together, each checked against its own secret.

- **Labels:** Forgejo's deliveries say only that an item's labels changed, not which. The item's `label:` tags follow, but a label moment is recorded only by the importer, which reads it from the item's timeline.
- **Not on Forgejo:** project boards, sub-issues and review requests by team.

## GitLab

GitLab projects are named with their host, as `gitlab:<host>/<group>/<subgroups…>/<project>`. On gitlab.com their tags leave the host out, as GitHub's do on github.com:

|             | Project                                | Issue                 | Merge request        | Person                        |
| ----------- | -------------------------------------- | --------------------- | -------------------- | ----------------------------- |
| gitlab.com  | `gitlab/group/app`                     | `gitlab/group/app#12` | `gitlab/group/app!7` | `gitlab/mona`                 |
| Self-hosted | `gitlab:git.example.com/group/sub/app` | `…#12`                | `…!7`                | `gitlab:git.example.com/mona` |

Merge requests are numbered apart from issues, so they are written `!7`, and tagged `merge request`.

- **Importer:** `--repo gitlab:gitlab.com/group/app` (or your host). Set `GITLAB_TOKEN` to a token with `read_api`. Without one, GitLab still lists a public project's issues, merge requests, commits and releases. It keeps back their events, notes and milestones, which the importer then leaves out with a warning.
- **What happened to an item** comes from three sources:
  - its label, milestone and state events;
  - its system notes: assignments, review requests, approvals, drafts, renames, mentions, locks and duplicates;
  - comments, which only add the mentions they make.

  That is up to four listings per item, each read only if a kind you chose needs it.

- **Commits:** GitLab names a commit's author but not their account, so commits carry no person tag.
- **Branches with no new commits** since `--since` are not read: GitLab dates each branch's last commit.
- **Receiver:** in the project's (or group's) **Settings → Webhooks**:
  - **URL:** the receiver's address.
  - **Secret token:** the value of `GITLAB_WEBHOOK_TOKEN`.
  - **Triggers:** issues events, merge request events, comments, push events and releases events.

  The receiver reads each change's before and after from the delivery: the labels added and removed, assignees, reviewers, title and draft state, and closing, reopening, merging and approval.

- **Not on GitLab:** project boards, forks and sub-issues are not read live; forks are imported.

## Running it as a service

Every [server package](install.md#server-packages) installs the receiver as a service of its system, stopped until you configure it. Set `OCH_API_KEY` and `GITHUB_WEBHOOK_SECRET` in its `github.env`, write the routes to `github-routes.json` beside it, then start it:

| Installed with                      | Configuration                                    | Start it, and at every boot or login                                                          | Its log                                              |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Debian, Ubuntu, Rocky, RHEL, Fedora | `/etc/openchronology/github.env`                 | `sudo systemctl enable --now openchronology-github` (systemd)                                 | `journalctl -u openchronology-github`                |
| Arch Linux                          | `/etc/openchronology/github.env`                 | `sudo systemctl enable --now openchronology-github` (systemd)                                 | `journalctl -u openchronology-github`                |
| FreeBSD                             | `/usr/local/etc/openchronology/github.env`       | `sysrc openchronology_github_enable=YES && service openchronology_github start` (rc.d)        | `/var/log/messages`                                  |
| macOS (Homebrew)                    | `$(brew --prefix)/etc/openchronology/github.env` | `openchronology-agent start github` (a launchd agent, as `brew services` runs the server)     | `$(brew --prefix)/var/log/openchronology-github.log` |
| Windows                             | `C:\ProgramData\OpenChronology\github.env`       | `Set-Service OpenChronologyGitHub -StartupType Automatic; Start-Service OpenChronologyGitHub` | `C:\ProgramData\OpenChronology\logs`                 |
| NixOS                               | `services.openchronology.github`                 | `services.openchronology.github.enable = true;` ([NixOS](nix.md#log-importers))               | `journalctl -u openchronology-github`                |
| Docker Compose                      | `GITHUB_RECEIVER_API_KEY`, `GITHUB_ROUTES_FILE`  | `docker compose --profile github up -d github`                                                | `docker compose logs github`                         |

Each listens on `127.0.0.1:5580`, for your HTTPS reverse proxy to forward GitHub's deliveries to. Each runs it as an unprivileged account (`openchronology-logs`, Local Service on Windows, or you on macOS), restarts it if it fails, and stops it cleanly: on `SIGTERM` (Ctrl+C on Windows) the receiver saves what is queued first. Restart the service after editing its configuration. An upgrade stops it, and `openchronology-migrate` starts it again if it is enabled.

- **Its own account:** as the [syslog receiver](syslog.md#its-own-account) does, it runs as `openchronology-logs`, which cannot read the server's configuration and has no role in its database. `github.env` is owned by `root:openchronology-logs`, mode 0640; give the routes file the same owner and mode: `sudo chown root:openchronology-logs github-routes.json && sudo chmod 0640 github-routes.json`.
- **Its state:** `GITHUB_STATE` names a file in a folder only the receiver writes: `/var/lib/openchronology-github` (systemd's `StateDirectory`), `/var/db/openchronology-github` on FreeBSD, `$(brew --prefix)/var/openchronology` on macOS, `C:\ProgramData\OpenChronology\github-state` on Windows, and the `github-state` volume in Compose.
- **The importer:** each package also installs `och-import-github`. Without `OCH_API_KEY` in the environment, it reads `OCH_API_URL`, `OCH_API_KEY`, `GITHUB_TOKEN` and `GITHUB_ROUTES` from the package's `github.env`, so `sudo och-import-github --repo acme/app --since 2026-11-01` catches up with what the receiver missed.

To run it as a service elsewhere, such as from a checkout, start from the package's definition for your system: [the systemd unit](../deploy/debian-server/openchronology-github.service), [the rc.d script](../deploy/freebsd-server/openchronology_github.rc), [the launchd agent](../deploy/homebrew/openchronology-agent) or [the WinSW service](../deploy/windows-server/openchronology-github-service.xml). Point it at `node server/github-receiver.mjs` in your copy, with `OCH_CONFIG` naming a configuration file like [`github.env`](../deploy/debian-server/github.env) (or the variables above set directly).

## Privacy

Events name people, so the timelines mirror personal data from GitHub. Only what the tables above list is copied:

- titles, and the start of each item's text;
- labels, milestones, review states and board columns;
- the logins of the people assigned, of reviewers, and of whoever acted.

The text of comments and reviews, reactions, and anyone's email address are not copied. Only the kinds of event listed in the rules are recorded at all.

A deleted issue is removed by the webhook receiver, and an unassignment is recorded as it happens. Choose who may read the timelines accordingly: a private repository's issues belong on a private timeline.
