# Entity tags and separation

Events (moments and durations) can carry tags: short labels you choose, such as `war` or `trade`. Enter them as a comma-separated list in the **Tags** field of a moment's details or the duration dialog. Tags are stored as `metadata.tags` and normalized like timeline tags: trimmed, lowercased, deduplicated, at most 40 per entity, 1–64 characters each, without commas or control characters. Search indexes them with the rest of the timeline, and they travel through `.ochx`, `.och`, server saves, forks and merges like other metadata. `tags` is reserved, so plugin fields cannot use it. Older documents that used a `tags` key for something other than a list of tag strings open unchanged, and that value is ignored for tagging.

## Separating by tags

**Separate by tags** in the timeline toolbar lists the timeline's tags with how many events use each. Choose one or more (or type others) and select **Separate**. Events carrying any of the chosen tags move into a track above; everything else stays in the track below. The view keeps its position, and both tracks pan and zoom together, using the same layout as comparisons. A duration that follows a moment on the other side keeps that moment's time. Relationships are still drawn: links within a track arc over it, and links between the tracks cross the gap from one event to the other ([relationships](relationships.md#arcs-between-tracks)). Both tracks are read-only; **Rejoin** returns to the whole timeline. Separation never changes or saves the timeline. To move what is in the upper track for good, **Shift or scale these…** in its bar returns to the whole timeline and [shifts or scales](time-mapping.md) those events.

Each track has its own summaries, so nearby moments and collapsed durations group within their own side. Server and desktop timelines show the saved version while separated; unsaved edits are kept and reappear when you rejoin. Complete in-memory timelines, such as browser drafts and offline HTML, include unsaved edits.

## A default view

Someone who can edit a timeline can make a separation its default view: separate it, by tags or by **Separate related** or **Separate all connected**, and select **Make this the default view** in the bar above the tracks. Everyone then opens it that way: readers, embeds, shared links, imported files, desktop files and browser drafts. The bar says "This is the timeline's default view", and **Rejoin** still returns to the whole timeline. **Clear default view**, in the bar or in the **Separate by tags** dialog (which also says what the timeline opens separated by), makes it open whole again.

The default view is one of the timeline's settings, like its title and tags, so it is an unsaved change until the timeline is saved (for a server or desktop timeline: rejoin, then save; a browser draft keeps it at once). Saves, exports (`.ochx`, `.och`), forks, copies, merges, pull requests and saved history keep it. In a document it is `view`:

```json
{ "view": { "separation": { "tags": ["war", "trade"] } } }
```

```json
{ "view": { "separation": { "related": { "moment": "launch" }, "depth": "all" } } }
```

`depth` is `direct` (Separate related) or `all` (Separate all connected). Tags are normalized like entity tags: one to forty, 1–64 characters each, trimmed and lowercased, without commas. The entity is named like a relationship's end and must be a valid ID, but it need not exist: a deleted entity is kept in the setting, and the timeline then opens whole, quietly. Anything else is refused when the document is saved or imported. Only the separation is saved. The bar's label comes from the entity's title when the timeline opens.

How it fits with the rest:

- **Reloads:** a server timeline's tab remembers its view. A reload shows it as it was, separated or rejoined; a new tab or a shared link opens the default view.
- **Links to an event or a search** ([`/moments/<id>`, `#moment/<id>`, `#duration/<id>`, `#search/<words>`](sharing.md)) open the whole timeline with that event's details or the search, as before: they name something to show in the editable timeline, and separated tracks are read-only. A link to a range (`#view/<left>..<right>`) opens the default view over that range.
- **Comparisons** of timelines ignore their default views: each track is a whole timeline.
- **Editing:** a separation is read-only, so someone who opens their timeline to edit it rejoins first. Unsaved edits are kept while separated, as before. **Make this the default view** is shown only to those who could edit the timeline, and not in View mode.

## Views

A separation reads two filtered views of one saved state: entities with any of the tags, and entities with none of them. Each view is a full index of its filtered document, so summaries, duration bands, collapsed-duration clusters, pages of moments and of durations run at normal index speed and match the same rules as the whole timeline.

| Timeline            | Where views are built                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server (PostgreSQL) | `oc_views`, with `oc_view_nodes` and `oc_view_duration_nodes` mirroring the main index tables. The first query for a filter builds the view from the saved document; later queries reuse it. Views belong to one saved revision: a save deletes them, and each timeline keeps its eight most recent. `oc_view_overview`, `oc_view_events` and `oc_view_duration_overview` are generated by the migration from the main traversal functions' own definitions, so both share one implementation. |
| Desktop `.och` file | A derived, disk-backed copy of the open file's baseline, built on first use. The two most recent views are kept until the file is closed or saved.                                                                                                                                                                                                                                                                                                                                             |
| In-memory           | Two filtered indexes built in the browser when separating.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

The timeline query endpoint accepts `filter: {"tags": [...], "mode": "any" | "none"}` on `overview`, `events` and `durations` queries (a filtered overview's arcs are the whole timeline's, each end marked by side, or none with `arcs: false`), and `{"kind": "tags"}` returns up to 200 tags with counts, most used first.
