# Dashboard and timeline collaboration

The server root opens the dashboard for guests and signed-in users alike. Guests see the public browser with twelve results per page. Signed-in users also see their own timelines above it. The dashboard remains the landing page when database storage is unconfigured, with an availability message and the option to create a local timeline. A retained local draft does not replace the dashboard on a fresh visit. The sidebar inside the editor also lists timelines shared with the account. Static deployments and a disconnected desktop keep local editing available.

The public browser starts with featured timelines, then recently updated timelines. Set `FEATURED_TIMELINES` to a comma-separated list of public timeline UUIDs, or have the operator set `oc_timelines.featured=true`. Featuring a private timeline never exposes it. Owners cannot self-feature through the timeline API.

Search uses PostgreSQL's English full-text configuration and a GIN index, with weighted titles/tags, descriptions, and moment/stack-entry titles and notes. It supports quoted phrases and exclusions through `websearch_to_tsquery`. A separate tag filter matches normalized tags exactly. Plugin code, image bytes, pull-request discussions and arbitrary metadata fields are excluded. Event text is bounded to 1 MiB per timeline. Search is computed on snapshot writes and merges; a proposed branch is not public search content until merged.

Tags are freely chosen text, normalized to lowercase NFC, with at most forty tags of 1–64 characters. Edit them under the timeline description. Contributors propose tag changes through their branch; writers save them to upstream. Tags travel through `.ochx`, `.och`, PostgreSQL and browser drafts.

## Custody and permissions

| Access                  | Read | Edit a proposed branch | Submit/update own pull request | Update upstream / merge / reject | Manage visibility, membership or delete |
| ----------------------- | ---- | ---------------------- | ------------------------------ | -------------------------------- | --------------------------------------- |
| Owner                   | Yes  | Yes                    | Yes                            | Yes                              | Yes                                     |
| Writer                  | Yes  | Yes                    | Yes                            | Yes                              | No                                      |
| Contributor             | Yes  | Yes                    | Yes                            | No                               | No                                      |
| Private viewer          | Yes  | No                     | No                             | No                               | No                                      |
| Signed-in public reader | Yes  | Yes                    | Yes                            | No                               | No                                      |
| Anonymous public reader | Yes  | No                     | No                             | No                               | No                                      |

A timeline has one owner. Only that owner controls visibility, access grants and deletion. Writers cannot transfer ownership or expose private data. Existing `editor` memberships migrate to `writer`; the API accepts `editor` as a compatibility alias. Private timelines, proposals and comments share the same access boundary. A removed collaborator loses private access to their old proposals too.

Public timelines grant read access to everyone. Signed-in readers can prepare a proposed snapshot without being invited, similar to proposing a change from a fork. Membership does not grant ownership. A viewer of a public timeline has the same proposal rights as other signed-in public readers.

## Forks, duplicates and saved history

A **Fork** is an independently owned, initially private timeline with an upstream link and an exact saved starting revision. It retains moment IDs, exact rational times, metadata, formatter/parser code, plugins and embedded assets. Membership is not copied. Its saved history reads through to upstream's at that revision instead of copying it, so a fork is charged only for what it changes (see [saved history](architecture.md#saved-history)). Its rational query index likewise reads through to upstream's, keeping rows of its own only for what it changes, so a fork of any size opens at once. A **Duplicate** is an independent copy without merge ancestry or an upstream link; it shares saved history the same way.

Signed-in readers of someone else's public timeline may fork it; invited readers of a private one need the owner's **Allow invited readers to fork** setting. **Duplicate** is for a timeline's owner, who copies their own timeline that way rather than forking it. An account has one fork of a timeline: forking it again opens that fork. Copies are limited to ten a minute for each account, and count toward its storage. This grants copying, not contributor or writer access to upstream. Private-origin forks and duplicates stay private, including their descendants. The new owner controls their collaborators. Revoking upstream access stops future reads, synchronization and recommendations, but cannot erase copies already authorized. Deleting upstream disconnects its surviving forks; independently owned data is not deleted.

Browser edits remain continuous. **Save to server** creates a saved checkpoint of the whole timeline. Saved revisions have UUID identities distinct from optimistic-concurrency counters, immutable documents and zero, one or two parents. A save stores only the versions of what it changed, and reading a revision assembles its whole document from the versions valid at that revision. A fork starts with its upstream checkpoint as a parent; sync and merge record both parents. Sharing-policy updates can advance the concurrency counter without creating document history, so checkpoint numbers can have gaps. The current rational index is updated in the same transaction as its head checkpoint.

## Saving while others save

A timeline can change while you edit it: a collaborator saves, or a [syslog receiver](syslog.md) or [log import](log-import.md) adds moments every few seconds. Your edits stay unsaved in the editor, and the view keeps following the latest saved revision underneath them. **Save to server** then merges your edits onto the latest revision (#165; `server/save-merge.mjs`):

| What                                                        | Rule                                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An event (moment or duration)                               | Takes your version if no one else changed it since you opened it. If both of you changed it, the fields merge: a title you changed and notes they changed keep both. |
| A setting (title, description, tags, time display, plugins) | Takes your value if you changed it, and keeps theirs if you didn't. Images merge one by one.                                                                         |
| Links between events                                        | Added or removed as you asked.                                                                                                                                       |

**Conflicts.** A field you both changed differently, or something you edited that someone else deleted, is a conflict. The save then saves nothing and lists the conflicts:

- **Keep my versions:** your versions replace what was saved.
- **Use the saved versions:** your edits to those are dropped, along with your undo history.

Either way, the rest of your edits are then saved.

### In the API

`PUT /api/timelines/<id>/changes` merges when it also carries a `base`: what the edits were made on.

```json
{
  "revision": "41",
  "settings": { "...": "the settings wanted" },
  "changes": [{ "id": "m1", "event": { "...": "the moment wanted" } }],
  "base": {
    "settings": { "title": "as loaded", "description": "as loaded" },
    "moments": [{ "id": "m1", "event": { "...": "m1 as loaded, or null if added" } }],
    "durations": [{ "id": "d1", "duration": { "...": "as loaded, or null" } }]
  }
}
```

- **Checking:** with a `base`, the save is checked against what was loaded even when `revision` is the latest.
- **Overwriting:** a change or setting left out of `base` applies as sent; that is how **Keep my versions** works.
- **Conflicts:** answer HTTP 409 with `conflicts`, a list of `{kind: "moment" | "duration" | "setting", id, title}`, and nothing is saved.
- **Without a `base`:** a save on an older revision is refused with 409, as before.

The syslog receiver and the log importer don't need a `base`: they fetch the latest revision and send again.

**History** lists twenty checkpoints per page. A checkpoint can be inspected and exported as `.ochx`; importing that file creates a working document, not a rewrite of history. File exports remain portable timeline snapshots, not account credentials or full platform revision graphs. History access follows the timeline's current visibility and membership. A public merge exposes the submitted snapshot, never the source fork's other private history. Cross-timeline revision URLs cannot be used to bypass that boundary.

**Sync upstream** merges the saved fork and saved upstream against their latest common ancestor. Independent changes produce a new saved fork checkpoint. If upstream is already an ancestor, syncing is a no-op. Repeated contributions use the updated ancestry rather than the original fork point. A public fork cannot import newly private upstream data. Multiple equally valid merge bases (crisscross merges) require explicit reconciliation in this first version.

### Timelines without saved history

High-volume timelines whose past revisions nobody reviews, such as logs, can stop keeping saved history: choose **Stop keeping saved history…** in **Sharing & settings** (owner only; on by default). In an append-only timeline history is about the size of the timeline itself, so this roughly halves its storage and quota charge.

- **Turning it off** deletes the content of its past revisions at once, freeing the storage the settings page states. Revisions forks, copies and pull requests still read are kept, as deletion keeps them.
- **While it is off**, each save still records a revision with its author, time and parents, but no content, and is charged nothing for history. The latest revision is read from the timeline itself; **History** lists the others as not kept.
- **Copies** (forks and duplicates) of such a timeline keep no saved history either, until their owner turns it on.
- **Sync** works while the revision a fork last shared with its upstream is kept: always while upstream keeps history, and otherwise until upstream saves again. Then the sync page says why it cannot, and forking again starts from upstream's current state.
- **Pull requests** need saved history on both sides: a timeline without it takes none, and a fork without it cannot propose. Pull requests opened before keep what they compare; one rebased onto a revision that is not kept merges as usual but no longer shows its change summary.
- **Turning it on again** records the current state as a new `baseline` revision, with one copy of it charged to the owner; later saves are charged what they change. Revisions saved while it was off stay unavailable.

## Pull requests

Local moment edits remain continuous. For contributors and signed-in readers of a public timeline, who can't save it, **Submit pull request** replaces saving to upstream, and **Propose changes** starts one. Writers and owners save directly, so neither is offered to them. A proposal records its upstream base revision, its proposed (source) revision, title, description and author. It stores no documents: a submitted timeline is kept as a revision of its own, saved as rows that read through to its base, so it is charged only for what it changes (see [saved history](architecture.md#saved-history)). From a persistent fork with saves of its own, **Propose saved changes** pins a specific saved source checkpoint and its common ancestor. Later saves to the fork do not change the reviewed proposal. **Update from saved fork** explicitly replaces its pinned source and advances the proposal revision; stale review actions are rejected. Submitting it does not change upstream. Use **Pull requests** to browse proposals, review the change summary, view the proposed timeline, export it, or discuss it. The server computes the change summary from saved history, at a cost that follows the changes: which settings changed; how many moments, durations and relationships are added, removed and changed; and the first thirty moments of each. The proposed timeline itself is sent only when it is viewed, edited or exported. Comments are plain text, paginated in batches of fifty. Authenticated readers can comment on an accessible proposal, including after it closes.

Only the author, while still permitted to contribute, can update the proposed branch. Fork proposals also require write access to the source fork when selecting a new checkpoint. Legacy document proposals remain supported: **Edit proposal** loads them into the editor and **Update pull request** updates their branch. Owners/writers can merge, reject or close open proposals; authors can close their own as a withdrawal. Closed, rejected and merged proposals remain readable with their comments. This version does not reopen resolved proposals.

Merge locks the upstream timeline and proposal, rechecks write access and proposal revision, merges the proposal's changes, applies them to the rational index atomically, advances the upstream revision, and records the resolver/merged revision. Merges, rebases and syncs work entity by entity: they read only the events and relationships the other side changed since the common base (from saved history), merge each with the timeline's current version, and apply the result like a save. A merge updates the index in place, a slice at a time when large; only one changing more than half of a timeline under 200,000 moments rebuilds it. Revisions saved before history was kept as rows are merged as whole documents, as before. Legacy document proposals require an unchanged upstream base. Fork proposals perform a three-way merge with the current upstream, preserving independent upstream edits and rejecting conflicting changes. Neither path blindly overwrites newer data. Source checkpoints remain immutable and retained if their fork is subsequently deleted.

The author can **Rebase on upstream**. A three-way merge combines independent moment IDs, independent fields within a moment's metadata, exact-time edits and unchanged timeline settings. Conflicting fields return HTTP 409 with a `conflicts` list such as `moment example.metadata.title`; delete/update conflicts name the moment. Conflicting arrays (including stack order and plugin sequence) remain conservative conflict units. Both versions are retained and no partial merge is saved. Resolve the named changes in your fork, save it, and explicitly update the proposal. A proposal rebase records a new immutable reviewed revision (kept as rows of what it changes from upstream's head) without rewriting its fork's head.

Creation and all mutations require session CSRF or the native bearer; publication/comment operations are rate limited. An author may have at most 100 open proposals per timeline. Owner deletion confirms in a modal and removes the timeline's proposals/comments too. Unreferenced history belonging to that timeline is removed; ancestors required by surviving forks or other submitted reviews are retained, as is the history surviving forks and duplicates read through to, until they are deleted too. Export before deletion to retain an independent copy. The timeline owner's data is never changed by a catalogue update.

## API

Paths below start with `/api`. POST search routes support the desktop's native path allowlist without query strings.

| Method/path                                               | Body / behavior                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /timelines/search`                                  | `{search?, tag?, page?, limit?, scope?}`; scope is `public` or `mine`                                                                                                                                                                             |
| `POST /timelines/:id/fork`                                | `{revision}`; copy saved head with upstream ancestry                                                                                                                                                                                              |
| `POST /timelines/:id/duplicate`                           | `{revision}`; independent saved copy                                                                                                                                                                                                              |
| `POST /timelines/:id/sync`                                | `{revision}`; merge saved upstream into fork                                                                                                                                                                                                      |
| `GET /timelines/:id/history?page=1`                       | Paginated checkpoint summaries, each `available` unless not kept; `keepHistory`                                                                                                                                                                   |
| `GET /timelines/:id/history/:saved`                       | Saved document, streamed; `?download=1` for an `.ochx`; only that timeline's checkpoints; 409 when not kept                                                                                                                                       |
| `POST /timelines/:id/proposals/search`                    | `{page?, limit?}`                                                                                                                                                                                                                                 |
| `POST /timelines/:id/proposals`                           | `{title, body, sourceTimelineId, sourceRevisionId}` for forks; legacy `{title, body, baseRevision, document}` also supported                                                                                                                      |
| `GET /timelines/:id/proposals/:proposal`                  | Pinned revision IDs, change summary (`changes`), permissions and revisions                                                                                                                                                                        |
| `GET /timelines/:id/proposals/:proposal/document`         | `{document}`: the proposed timeline, whole                                                                                                                                                                                                        |
| `PUT /timelines/:id/proposals/:proposal`                  | Creation fields plus proposal `revision`; explicitly update the pinned source                                                                                                                                                                     |
| `POST /timelines/:id/proposals/:proposal/resolve`         | `{action, revision}`; action is `merge`, `reject`, `close` or `rebase`                                                                                                                                                                            |
| `POST /timelines/:id/proposals/:proposal/comments`        | `{body}`                                                                                                                                                                                                                                          |
| `POST /timelines/:id/proposals/:proposal/comments/search` | `{after?}`                                                                                                                                                                                                                                        |
| `PATCH /timelines/:id/settings`                           | `{visibility?, allowPrivateForks?, retention?, keepHistory?, labels?, slug?}`; owner only; reports `keep_history` and `history_bytes`; [`slug`](sharing.md#addresses) is its address, or `null` for none, and alone leaves the revision unchanged |
| `DELETE /timelines/:id`                                   | Owner-only deletion; independent forks survive                                                                                                                                                                                                    |

Run `npm run migrate`, `pnpm run migrate` or `yarn run migrate` before upgrading the server. The idempotent migration adds tags, embedded images, the full-text index, proposals/comments, saved snapshots, revision ancestry and fork policy. Existing timelines receive a baseline checkpoint of their current saved state. Existing proposals receive immutable IDs for their already retained documents. Earlier overwritten versions cannot be reconstructed. Compose's migration service applies it before the app starts. Readiness verifies these tables/columns. Existing SQLite files gain an optional `timeline_extras` table on save; old files remain readable without migration.
