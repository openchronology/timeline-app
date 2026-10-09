# Durations

A duration is a timeline entity in its own right, with an ID, a start, an end, a title, notes and arbitrary metadata. Each endpoint is either:

- **A fixed time**, an exact rational coordinate stored with the duration.
- **A moment anchor**, which follows a moment's time. Moving that moment moves the endpoint.

Endpoints can be mixed: a duration can start at a moment and end at a fixed time. Reversed endpoints still render the interval between them, and zero-length durations are allowed.

## Editing

Use **＋ Duration** in the timeline toolbar to create one over the middle of the current view, or **New duration starting here** in a moment's details to start it at that moment. Click a band, or a duration listed in a moment's details, to open it. The duration dialog edits the title, notes, plugin fields and additional metadata, and applies edits continuously like the moment editor. For each endpoint, choose **Fixed time** or **Follows a moment**. With the Gregorian time display, fixed times open the date and time dialog. **Follow a moment…** lists moments 25 at a time; **Open moment** jumps to the anchored moment. Undo and Redo cover creating, editing and deleting durations.

Deleting a duration leaves every moment intact. Deleting a moment keeps the durations that follow it: until the deletion is saved, they stay anchored, so undoing the deletion restores the anchor. Saving or exporting replaces each anchor to a deleted moment with that moment's last time, so a saved document never refers to a missing moment.

## Exchange format

Durations are a top-level `durations` array in version-1 documents. A time endpoint is a rational string, and an anchor is `{"moment": "<moment id>"}`:

```json
{
  "events": [{ "id": "launch", "time": "1/1", "metadata": { "title": "Launch" } }],
  "durations": [
    {
      "id": "campaign",
      "start": { "moment": "launch" },
      "end": "5/2",
      "metadata": { "title": "Campaign", "description": "Notes", "color": "#6d9a7e" }
    }
  ]
}
```

Duration IDs use the same ASCII alphabet as moment IDs, are unique among durations, and export sorted by ID. Anchors must name existing root moments; stack entries cannot be anchors. The `durations` metadata key stays reserved, and durations cannot contain durations.

### Earlier linked durations

Earlier files stored a duration as a link in its starting moment's metadata (`{"id", "endId", "metadata"}` under `metadata.durations`). Reading a document converts each link into a standalone duration anchored to both of its original moments, so existing timelines behave as before. `.ochx` imports, `.och` files, server timelines and saved history all convert when read; new saves and exports write only the top-level format. `npm run migrate` converts the current version of stored server timelines once, without changing their update time. Immutable saved revisions keep their original JSON and convert when opened or merged.

## Storage and queries

Durations have a separate interval query, so a period crossing the viewport is visible even when both endpoints are outside the moment cache. The browser, PostgreSQL and SQLite build augmented balanced interval trees over exact rational bounds, resolving anchors to their moments' times. Database queries prune subtrees outside the viewport and return at most 256 bands, with an explicit notice when more match. Bands use three compact visual lanes; intersecting bands can overlap.

## Summaries

A duration is drawn as a band only while its extent reaches the grouping distance: the same exact threshold that groups moments, `(right - left) × grouping pixels / width`. A shorter duration **collapses**: it is summarized like a moment and keyed by its start.

1. Collapsed durations intersecting the window are grouped among themselves with the anchored-span rule moments use. A cluster starts at the first collapsed start; later durations join while `start - anchor < threshold`. The cluster's end is the latest end of its members.
2. Moment groups and duration clusters are then coalesced in time order: a block joins the previous group while the merged group still spans less than the threshold (`last - first < threshold`), or when both start at the same coordinate. Moment groups are already maximal, so two moment groups never merge with each other; a cluster of short durations joins the nearby moments it overlaps.

Groups report moments (`count`, `distinct`) and collapsed durations (`durationCount`) separately. A group holding exactly one collapsed duration and no moments carries that duration and is drawn as a small capsule marker; clicking it opens the duration. Other summaries list their moments and the durations that lie wholly inside them, 25 at a time. Zooming in shrinks the threshold until the duration becomes a band again.

Each backend computes both steps with exact rationals and without enumerating dense clusters. The interval tree is ordered by start and caches, per subtree, the largest start, the entry count and the smallest and largest extents. A subtree whose durations all collapse and lie inside the window is consumed whole when its starts fit the open cluster; subtrees with no collapsed duration are skipped. PostgreSQL runs this in `oc_duration_overview`, SQLite in the native query, and the browser in `TimelineIndex.frame`. Randomized oracle tests check that PostgreSQL matches the browser and that SQLite and the browser match a brute-force reference.

Server and desktop timelines query saved summaries; unsaved edits move collapsed durations between summaries locally. `npm run migrate` rebuilds duration indexes saved before these subtree summaries existed.

Viewport bands carry a bounded projection of metadata: the title (512 characters), a notes preview (2,000 characters) and other text fields of at most 256 characters, such as colors. Opening a duration fetches its complete definition by ID (`{"kind": "duration", "id": "…"}` on the timeline query endpoint, or the desktop native query).

PostgreSQL stores each duration's definition on its interval-index row; sparse saves update the rows of changed durations and of durations anchored to moved moments ([incremental saves](architecture.md#incremental-saves)). Desktop `.och` files store durations in a `durations` table; each endpoint has either a canonical rational time or a moment ID, enforced by table constraints. Sparse server and desktop saves send `durationChanges` (`{id, duration}` or `{id, duration: null}`) alongside moment changes; deleting a moment in the same save pins durations that follow it at its last saved time. Merges compare durations by ID and field, like moments.

Comparisons transform each source's bands with that source's exact offset and scale. Comparison durations open read-only.

## Plugins

Plugins declare which entities they apply to with an optional `targets` array of `"moments"` and/or `"durations"`. Without `targets`, colors (`marker.kind: "color"`) and hover cards (`hover.kind: "card"`) apply to both moments and durations; other plugins apply to moments only. Duration bands and the duration dialog only use text, notes, color and link fields, color markers and hover cards. Stacks, shapes, sizes, icons and summary expansion stay moment-only.
