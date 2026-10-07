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

A **Fork** is an independently owned, initially private timeline with an upstream link and an exact saved starting revision. It retains moment IDs, exact rational times, metadata, formatter/parser code, plugins and embedded assets. Membership is not copied. The initial checkpoint shares an immutable snapshot with upstream; each timeline has its own rational query index. A **Duplicate** is an independent copy without merge ancestry or an upstream link.

Signed-in public readers may fork or duplicate. The owner of a private timeline may copy it; other invited readers need the owner's **Allow invited readers to fork** setting. This grants copying, not contributor or writer access to upstream. Private-origin forks and duplicates stay private, including their descendants. The new owner controls their collaborators. Revoking upstream access stops future reads, synchronization and recommendations, but cannot erase copies already authorized. Deleting upstream disconnects its surviving forks; independently owned data is not deleted.

Browser edits remain continuous. **Save to server** creates a saved checkpoint of the whole timeline. Saved revisions have UUID identities distinct from optimistic-concurrency counters, immutable documents and zero, one or two parents. A fork starts with its upstream checkpoint as a parent; sync and merge record both parents. Sharing-policy updates can advance the concurrency counter without creating document history, so checkpoint numbers can have gaps. The current rational index is updated in the same transaction as its head checkpoint.

**History** lists twenty checkpoints per page. A checkpoint can be inspected and exported as `.ochx`; importing that file creates a working document, not a rewrite of history. File exports remain portable timeline snapshots, not account credentials or full platform revision graphs. History access follows the timeline's current visibility and membership. A public merge exposes the submitted snapshot, never the source fork's other private history. Cross-timeline revision URLs cannot be used to bypass that boundary.

**Sync upstream** merges the saved fork and saved upstream against their latest common ancestor. Independent changes produce a new saved fork checkpoint. If upstream is already an ancestor, syncing is a no-op. Repeated contributions use the updated ancestry rather than the original fork point. A public fork cannot import newly private upstream data. Multiple equally valid merge bases (crisscross merges) require explicit reconciliation in this first version.

## Pull requests

Local moment edits remain continuous. For contributors, **Submit pull request** replaces saving to upstream. Writers and owners may also use **Propose changes**. A proposal stores a complete branch snapshot, its upstream base snapshot/revision, title, description and author. From a persistent fork, **Propose saved changes** pins a specific saved source checkpoint and its common ancestor. Later saves to the fork do not change the reviewed proposal. **Update from saved fork** explicitly replaces its pinned source and advances the proposal revision; stale review actions are rejected. Submitting it does not change upstream. Use **Pull requests** to browse proposals, review the change summary, view the proposed timeline, export it, or discuss it. Comments are plain text, paginated in batches of fifty. Authenticated readers can comment on an accessible proposal, including after it closes.

Only the author, while still permitted to contribute, can update the proposed branch. Fork proposals also require write access to the source fork when selecting a new checkpoint. Legacy document proposals remain supported: **Edit proposal** loads them into the editor and **Update pull request** updates their branch. Owners/writers can merge, reject or close open proposals; authors can close their own as a withdrawal. Closed, rejected and merged proposals remain readable with their comments. This version does not reopen resolved proposals.

Merge locks the upstream timeline and proposal, rechecks write access and proposal revision, validates the saved document, replaces the rational index atomically, advances the upstream revision, and records the resolver/merged revision. Legacy document proposals require an unchanged upstream base. Fork proposals perform a three-way merge with the current upstream, preserving independent upstream edits and rejecting conflicting changes. Neither path blindly overwrites newer data. Source checkpoints remain immutable and retained if their fork is subsequently deleted.

The author can **Rebase onto latest upstream**. A three-way merge combines independent moment IDs, independent fields within a moment's metadata, exact-time edits and unchanged timeline settings. Conflicting fields return HTTP 409 with a `conflicts` list such as `moment example.metadata.title`; delete/update conflicts name the moment. Conflicting arrays (including stack order and plugin sequence) remain conservative conflict units. Both versions are retained and no partial merge is saved. Resolve the named changes in your fork, save it, and explicitly update the proposal. A proposal rebase records a new immutable reviewed snapshot without rewriting its fork's head.

Creation and all mutations require session CSRF or the native bearer; publication/comment operations are rate limited. An author may have at most 100 open proposals per timeline. Owner deletion confirms in a modal and removes the timeline's proposals/comments too. Unreferenced history belonging to that timeline is removed; ancestors required by surviving forks or other submitted reviews are retained. Export before deletion to retain an independent copy. The timeline owner's data is never changed by a catalogue update.

## API

Paths below start with `/api`. POST search routes support the desktop's native path allowlist without query strings.

| Method/path                                               | Body / behavior                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /timelines/search`                                  | `{search?, tag?, page?, limit?, scope?}`; scope is `public` or `mine`                                                        |
| `POST /timelines/:id/fork`                                | `{revision}`; copy saved head with upstream ancestry                                                                         |
| `POST /timelines/:id/duplicate`                           | `{revision}`; independent saved copy                                                                                         |
| `POST /timelines/:id/sync`                                | `{revision}`; merge saved upstream into fork                                                                                 |
| `GET /timelines/:id/history?page=1`                       | Paginated checkpoint summaries                                                                                               |
| `GET /timelines/:id/history/:saved`                       | Saved document; only that timeline's checkpoints                                                                             |
| `POST /timelines/:id/proposals/search`                    | `{page?, limit?}`                                                                                                            |
| `POST /timelines/:id/proposals`                           | `{title, body, sourceTimelineId, sourceRevisionId}` for forks; legacy `{title, body, baseRevision, document}` also supported |
| `GET /timelines/:id/proposals/:proposal`                  | Base/proposed snapshots, pinned IDs, permissions and revisions                                                               |
| `PUT /timelines/:id/proposals/:proposal`                  | Creation fields plus proposal `revision`; explicitly update the pinned source                                                |
| `POST /timelines/:id/proposals/:proposal/resolve`         | `{action, revision}`; action is `merge`, `reject`, `close` or `rebase`                                                       |
| `POST /timelines/:id/proposals/:proposal/comments`        | `{body}`                                                                                                                     |
| `POST /timelines/:id/proposals/:proposal/comments/search` | `{after?}`                                                                                                                   |
| `PATCH /timelines/:id/settings`                           | `{visibility?, allowPrivateForks?}`; owner only                                                                              |
| `DELETE /timelines/:id`                                   | Owner-only deletion; independent forks survive                                                                               |

Run `npm run migrate`, `pnpm run migrate` or `yarn run migrate` before upgrading the server. The idempotent migration adds tags, embedded images, the full-text index, proposals/comments, saved snapshots, revision ancestry and fork policy. Existing timelines receive a baseline checkpoint of their current saved state. Existing proposals receive immutable IDs for their already retained documents. Earlier overwritten versions cannot be reconstructed. Compose's migration service applies it before the app starts. Readiness verifies these tables/columns. Existing SQLite files gain an optional `timeline_extras` table on save; old files remain readable without migration.
