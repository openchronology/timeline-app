# Boards and plans to timelines

<!-- description: Mirror Trello, Jira, Planner, OpenProject and Microsoft Project cards, columns and Gantt plans into timelines, by webhook, polling or import. -->

OpenChronology can aggregate the work your boards and plans record, as it does for [GitHub, GitLab and Forgejo](github.md) (#538):

- **Trello** boards;
- **Jira** projects, on Jira Cloud or Data Center;
- **Microsoft Planner** plans;
- **OpenProject** projects, including their Gantt charts;
- **Microsoft Project** plans, and those ProjectLibre and GanttProject save as Microsoft Project XML ([below](#microsoft-project-files)).

Each card, issue, task or work package becomes a **duration**:

- it starts when it was created;
- it is [ongoing](durations.md#ongoing-durations) until it is done;
- it ends when it was completed.

What happens to it becomes **moments**: moves between columns, assignments, completion, labels, new dates and progress. The time it spends in each column is a duration of its own. Its start and due dates become a **planned** duration beside it, so the timeline doubles as a Gantt chart that shows the plan against what happened.

The same two tools as for repositories do the work, with the same routing rules:

- **The receiver** (`openchronology-github`) takes Trello's, Jira's and OpenProject's webhooks, and reads Planner's plans every few minutes, since Planner sends no webhooks.
- **The importer** (`och-import-github --board`) brings in what exists, with its history, and can run again at any time.

Each only reads from your boards. Nothing is written back.

## What a timeline shows

| On the board                                  | On the timeline                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| A card is created                             | A duration from then, ongoing, titled with the card (`PROJ-12 Fix the login loop`)      |
| It is done                                    | The duration ends then                                                                  |
| It is reopened                                | The end is ongoing again                                                                |
| It sits in a column                           | A duration for each stay, `PROJ-12 in Review`, tagged `in column` and `status:Review`   |
| It has a start or due date                    | A duration from its start (or creation) to its due date, `Planned: …`, tagged `planned` |
| It is a milestone (OpenProject)               | A `milestone` moment on its date                                                        |
| It is moved, assigned, labelled, rescheduled… | A moment at that time (below)                                                           |
| It depends on, or belongs to, another card    | A link between the two                                                                  |
| It is deleted (Trello, Jira, Planner)         | Its duration is removed                                                                 |

**When a card is done** depends on the platform:

| Platform    | Done when                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trello      | It is in a done list, archived, or its due date is marked complete. Done lists are those named like `Done`, `Complete`, `Finished` or `Shipped`, or those you name (`done` below) |
| Jira        | Its status is in the **Done** category; it ended at its resolution date                                                                                                           |
| Planner     | It is completed (100%)                                                                                                                                                            |
| OpenProject | Its status is a closed one                                                                                                                                                        |

### Moments

Each moment is titled with what happened and the card, such as `Moved to Review: PROJ-12 Fix the login loop`. Its tags are:

- the platform: `trello`, `jira`, `planner` or `openproject`;
- `project:<board>`, the board's, plan's or project's name;
- the card's own tag (below);
- the event, such as `moved` or `assigned`;
- what it was about: `status:<column>`, `label:<name>` or `progress:<n>%`;
- the person, as `<platform>/<name>`: the one assigned for an assignment, otherwise whoever did it.

| Kind          | Events                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `items`       | Each card's duration and its `created` moment; Trello's `archived`                             |
| `status`      | `moved`, and each stay in a column (`in column`)                                               |
| `assignments` | `assigned`, `unassigned`                                                                       |
| `labels`      | `labeled`, `unlabeled`                                                                         |
| `state`       | `completed`, `reopened`                                                                        |
| `renames`     | `renamed`, titled with the old title                                                           |
| `schedule`    | Each card's planned duration or milestone; `rescheduled` (a new start or due date); `progress` |
| `relations`   | Links between cards that depend on each other, or a card and its parent                        |

They are the same kinds as a repository's, chosen the same way: `--only`, `--except`, or `"only"` and `"except"` in the routing rules.

### Tags

A card's duration is tagged:

- the platform, `project:<board>` and its own tag;
- its kind: `card`, `task`, or Jira's and OpenProject's type, such as `story` or `bug`;
- `state:open` or `state:done`;
- `status:<column>`, the list, bucket or status it is in;
- `assigned`, while anyone is, and each person's `<platform>/<name>`;
- `label:<name>` for each label (Trello's labels without a name by their colour; Planner's categories by the names the plan gives them).

| Platform    | A card's tag                   | A person's tag       |
| ----------- | ------------------------------ | -------------------- |
| Trello      | `trello/<board short link>#12` | `trello/<username>`  |
| Jira        | `jira/proj-12`                 | `jira/<name>`        |
| Planner     | `planner/<task ID>`            | `planner/<name>`     |
| OpenProject | `openproject/#7`               | `openproject/<name>` |

Names are as each platform shows them: Trello's usernames, and the display names of Jira, Planner and OpenProject. Email addresses are never copied.

**Separating by tags** turns the timeline into the charts a project manager reaches for:

- **A Gantt chart:** separate by `planned`. The plan is one track, and what happened is the other, so late work stands out.
- **A board over time:** separate by `status:` tags. Each column becomes a row, showing how long work waits in each.
- **Who is doing what:** separate by people's tags.
- **One card's history:** separate by its tag, to gather its duration, stays, plan and every moment.
- **Several tools at once:** route a Trello board, a Jira project and a GitHub repository to one timeline, and separate by `trello`, `jira` and `github`.

IDs come from the source: `tr:<board ID>:<card ID>` on Trello, `jr:<host>:<project>:<key>` on Jira, `pl:<plan ID>:<task ID>` on Planner and `op:<host>:<project>:<ID>` on OpenProject. So a webhook sent twice, a plan read again, or an import run again updates the same entities rather than adding copies.

## Set up

1. Create the timelines, with the **Gregorian** time display: an open card ends "now", and only calendar timelines have one.
2. Create a **read/write** API key for an account that can write them (**Account → API keys**).
3. Add the boards to the receiver's routing rules, `github-routes.json`, beside any repositories:

```json
{
  "routes": [
    {
      "board": "trello:AbCd1234",
      "timeline": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5",
      "done": ["Shipped"]
    },
    { "board": "jira:acme.atlassian.net/PROJ", "timeline": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5" },
    {
      "board": "planner:xqQg5FS2LkCp935s-FIFm2QAFkHM",
      "timeline": "0b7e1111-2222-4333-8444-555566667777"
    },
    { "board": "openproject:op.example.com/*", "timeline": "0b7e1111-2222-4333-8444-555566667777" },
    { "repository": "acme/app", "timeline": "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5" }
  ]
}
```

A board is named:

| Platform    | Reference                                 | Where to find it                                                       |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Trello      | `trello:<board ID or short link>`         | The board's address: `trello.com/b/AbCd1234/…`                         |
| Jira        | `jira:<host>/<project key>`               | The site and the key its issues start with, such as `PROJ`             |
| Planner     | `planner:<plan ID>`                       | The plan's address in Planner, or Graph's `/groups/<id>/planner/plans` |
| OpenProject | `openproject:<host>/<project identifier>` | The project's address: `…/projects/<identifier>`                       |

`*` in place of the project takes every Jira or OpenProject project on that host. On Trello, `"done"` names the lists whose cards are done.

Then set the platform's settings in the receiver's `github.env` ([running it as a service](github.md#running-it-as-a-service)) and restart it.

## Trello

- **Reading:** an API key and token. Create a Power-Up in Trello's [Power-Up admin](https://trello.com/power-ups/admin) to get its key, then generate a token for your account from the same page, with read access. Set `TRELLO_KEY` and `TRELLO_TOKEN`.
- **History:** the importer reads the board's card actions, a thousand per request: creation, moves between lists, members, labels, dates, completion and archiving. Each card's stays come from its moves.
- **Live:** set `TRELLO_SECRET` to the Power-Up's secret, and `TRELLO_CALLBACK_URL` to the receiver's public address, such as `https://och.example.com/hooks/github`. Then create the webhook once, with that address and the board's ID:

```sh
curl -X POST -H "Authorization: OAuth oauth_consumer_key=\"$TRELLO_KEY\", oauth_token=\"$TRELLO_TOKEN\"" \
  "https://api.trello.com/1/webhooks?callbackURL=$TRELLO_CALLBACK_URL&idModel=<board ID>"
```

Trello checks the address with a `HEAD` request first, which the receiver answers. It signs each delivery with the secret and that exact address, so `TRELLO_CALLBACK_URL` must match it character for character. Deliveries name only what changed, so the receiver reads the card again with the key and token.

## Jira

- **Reading:** on Jira Cloud (`*.atlassian.net`), an [API token](https://id.atlassian.com/manage-profile/security/api-tokens) and its account's email: `JIRA_TOKEN` and `JIRA_EMAIL`. On Data Center or Server, a personal access token, `JIRA_TOKEN` alone.
- **History:** each issue's changelog: status changes (the moves), assignees, resolutions (completion), labels, renames and dates.
- **Start dates:** a Gantt chart needs each issue's start date, which Jira keeps in a field of its own. The importer looks for a field named **Start date**. Set `JIRA_START_FIELD` to another field's name or ID if yours differs. The receiver needs the field's ID, such as `customfield_10015`.
- **Links:** issue links and parents within the project become links. Links to other projects' issues are left out.
- **Live:** in Jira's **Settings → System → WebHooks → Create a WebHook**:
  - **URL:** the receiver's address.
  - **Secret:** the value of `JIRA_WEBHOOK_SECRET`. Jira signs each delivery with it (`X-Hub-Signature`), and unsigned deliveries are refused.
  - **Events:** Issue created, updated and deleted. Narrow it with JQL, such as `project = PROJ`, if you like.

## Microsoft Planner

Planner keeps no history and sends no webhooks, so the receiver reads each routed plan every `PLANNER_POLL_MINUTES` (5 by default) and compares it with what it read before. So:

- **Dated by Planner:** creation, assignments (Planner dates each one) and completion.
- **Dated by the reading that saw them:** moves between buckets, unassignments, new labels, dates and progress.
- **The first reading** writes every task as it is, with one stay in its current bucket since its creation.
- **Deleted tasks** are removed when a reading no longer finds them.

**Access:** register an app in Microsoft Entra (**App registrations → New registration**), then:

1. Give it the **Microsoft Graph** application permissions **Tasks.Read.All**, to read plans, and **User.ReadBasic.All**, to name people (without it, people are tagged by their IDs). Grant admin consent.
2. Create a client secret.
3. Set `PLANNER_TENANT` (the directory ID), `PLANNER_CLIENT_ID` and `PLANNER_CLIENT_SECRET`.

`och-import-github --board planner:<plan ID>` reads a plan once, without the comparing.

## OpenProject

- **Reading:** an API key (**My account → Access tokens → API**), `OPENPROJECT_TOKEN`.
- **History:** each work package's activity: status changes, assignees, subjects, dates and progress. OpenProject writes it in the language of the account whose key it is, and the importer reads it in **English**. With that account in another language, the history's moments are left out, while durations, plans and stays still come from each work package as it is.
- **The Gantt chart:** each work package's start and finish dates are its planned duration, its progress (`% Complete`) is tagged on it as `progress:<n>%`, and milestones are moments on their dates. Relations between work packages (follows, precedes, blocks, relates) and parents become links.
- **Live:** in **Administration → API and webhooks → Webhooks → New webhook**:
  - **Payload URL:** the receiver's address.
  - **Signature secret:** the value of `OPENPROJECT_WEBHOOK_SECRET`. The receiver checks it (`X-OP-Signature`).
  - **Events:** Work packages, created and updated.

  Its deliveries send each work package as it is, so the receiver compares it with what it saw before to tell what changed. The receiver takes the host from the first `openproject:` route, or from `OPENPROJECT_HOST`.

## Microsoft Project files

A Gantt chart drawn in Microsoft Project, ProjectLibre or GanttProject can be imported from its **Microsoft Project XML** file (MSPDI: **Save As → XML** in Microsoft Project; **File → Save As → MS Project XML** in ProjectLibre; **Project → Export → Microsoft Project** in GanttProject):

```sh
och-import-github --plan house.xml --timeline 0b7e… --time-zone Europe/Paris
```

- **The plan:** each task's start and finish are its planned duration, `Planned: Dig`. A milestone is a `milestone` moment.
- **What happened:** a task's actual start and finish are a duration of its own, ongoing while it is under way. A task not begun has only its plan.
- **Completion:** a finished task (100%) gets a `completed` moment, and its progress is tagged on its plan as `progress:<n>%`.
- **People:** each task's resources are its people, `msproject/<name>`.
- **Phases:** the summary tasks above a task are its labels, `label:<phase>`.
- **Links:** its predecessors, and its summary task.

Tasks are tagged `msproject/<WBS>`, such as `msproject/1.2`. The files' times have no zone, so `--time-zone` says which they are in, as a name such as `Europe/Paris` or an offset such as `+02:00`. UTC is the default. A file is a snapshot with no history, so run the import again after saving the plan. Tasks keep their IDs (from the project's GUID and each task's UID), so a new import updates the same entities, while tasks deleted from the plan stay on the timeline until you delete them there.

## Importing what exists

```sh
export OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_...

TRELLO_KEY=… TRELLO_TOKEN=… och-import-github --board trello:AbCd1234 --timeline 6f1c… --done Shipped
JIRA_EMAIL=… JIRA_TOKEN=… och-import-github --board jira:acme.atlassian.net/PROJ --timeline 6f1c… --since 2026-11-01
och-import-github --board openproject:op.example.com/house --timeline 0b7e… --dry-run
```

| Option               | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `--board <board>`    | The board, as in the routing rules.                               |
| `--timeline <uuid>`  | The timeline to write to.                                         |
| `--only`, `--except` | The kinds to import, as for repositories.                         |
| `--since <time>`     | Only cards changed since then.                                    |
| `--done <lists>`     | Trello's done lists, comma-separated.                             |
| `--plan <file.xml>`  | A Microsoft Project XML file, in place of `--board`.              |
| `--time-zone <zone>` | The zone of a plan file's times (UTC by default).                 |
| `--dry-run`          | Read the board and report what would be written, without writing. |

**Requests:** Trello costs four requests plus one per thousand card actions. Jira costs one per hundred issues, plus one per issue whose changelog is longer than Jira returns with the search. OpenProject costs one per two hundred work packages, plus one per work package for its activity. Planner costs one per hundred tasks, plus one per person named.

## Privacy

Boards name people, so the timelines mirror personal data from them. Only what this page lists is copied:

- titles, and the start of each card's description;
- columns, labels, dates and progress;
- the names of the people assigned and of whoever acted.

Comments, attachments, checklists and email addresses are not copied. A deleted card is removed by the receiver, and an unassignment is recorded as it happens. Choose who may read the timelines accordingly.
