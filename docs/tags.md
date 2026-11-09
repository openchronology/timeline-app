# Entity tags and separation

<!-- description: Tags on events: short labels such as war or trade, how to add them, filter by them, and separate a timeline into tracks by tag. -->

Events (moments and durations) can carry tags: short labels you choose, such as `war` or `trade`. Enter them as a comma-separated list in the **Tags** field of a moment's details or the duration dialog. Tags are stored as `metadata.tags` and normalized like timeline tags: trimmed, lowercased, deduplicated, at most 40 per entity, without control characters. A comma inside a tag, as a script may send through the API, becomes a semicolon (`a, b` is `a; b`), since tags are entered separated by commas; events tagged that way before are read the same way, so separations select them. An event's tag may be up to 128 characters, long enough for references such as `gitlab:git.example.com/group/subgroup/project!1234`. A timeline's own tags stay within 64. Search indexes them with the rest of the timeline, and they travel through `.ochx`, `.och`, server saves, forks and merges like other metadata. `tags` is reserved, so plugin fields cannot use it. Older documents that used a `tags` key for something other than a list of tag strings open unchanged, and that value is ignored for tagging.

## Separating by tags

**Separate** in the timeline toolbar opens a list of separations. In each, **Add tags** opens a picker:

- it lists the timeline's tags with how many events use each, the most used first;
- its search box narrows the list, or names a tag no event has yet (**Add "…"**);
- several tags can be chosen at once, with the mouse or the arrow keys and Enter.

Each chosen tag shows as a chip, whose **×** removes it. **+ Add a separation** adds another, up to seven, and **Remove** takes one away. Select **Separate**.

Each separation's events (those carrying any of its tags) move into a track of their own, in the order listed. Everything else, which carries none of them, stays in the last track. An event carrying tags of two separations appears in both.

### Disjoining and uniting

A separation can **disjoin** and **unite** at times, rather than being its own timeline from start to end. Under its tags, one list shows its disjoins and unions as cards, each labelled **Disjoin** or **Union**; it scrolls when there are many. **+ Add a disjoin or union** opens a dialog for a new one, and a card's **Edit** opens the same dialog for it. **×** removes one.

In the dialog, choose **Disjoin** or **Union**, the track, and when, on one of three tabs: **Exact time**, **A moment**, or **Earliest moment** (a disjoin) / **Latest moment** (a union).

A disjoin names the track it disjoins **from**: the main timeline, or another separation. A union names the track it unites **into**, in the same way. A separation has at most one of each for each track. Several are useful when separations meet: separation A can disjoin from separation B at one time and from the main timeline at another.

Each is at one of these times:

- **an exact time**: typed as the timeline displays times, or chosen in its date picker;
- **a moment**: chosen in the moment picker, and followed as that moment moves;
- **the earliest moment** (a disjoin) or **the latest moment** (a union) carrying the separation's tags, followed as moments are added, moved or removed.

Until that moment exists, the disjoin or union waits.

Before a disjoin, the separation's events stay in the track it disjoins from. From then on they are in its own track, which begins there, with a curve from the other track's axis to its own. From a union on, they are in the track it unites into, and the separation's track ends there, with a curve back into that track. When several unions have passed, the latest applies.

Disjoining from another separation follows that one first: if it has not disjoined yet either, the events are still on the main timeline. Separations can disjoin from later ones in the list, but not from each other in a circle. A union into a separation that has itself united follows on. A moment counts by its time, and a duration by its start. The bar names each separation's disjoins and unions, such as `war (from main at 1914; into main at 1918)`.

The button stays in the toolbar while separated, with how many separations are shown. It reopens the list to change them, or to **Rejoin all**. The view keeps its position, and both tracks pan and zoom together, using the same layout as comparisons. A duration that follows a moment on the other side keeps that moment's time. Relationships are still drawn: links within a track arc over it, and links between the tracks cross the gap from one event to the other ([relationships](relationships.md#arcs-between-tracks)). The tracks are read-only; **Rejoin** returns to the whole timeline. Separation never changes or saves the timeline. To move the separated events for good, **Shift or scale these…** in the bar returns to the whole timeline and [shifts or scales](time-mapping.md) the events carrying any separated tag.

Each track has its own summaries, so nearby moments and collapsed durations group within their own side. Server and desktop timelines show the saved version while separated; unsaved edits are kept and reappear when you rejoin. Complete in-memory timelines, such as browser drafts and offline HTML, include unsaved edits.

### Tracks as you zoom

Tracks follow what is in view, as moments do:

- **Empty tracks:** a separation's track with nothing in view is not drawn, and the others close up. It returns when you pan or zoom to its events. The main timeline is always drawn.
- **Too close to draw apart:** when a separation disjoins and unites again within less than the distance at which moments group, its stretch of track is too short to show. Everything it held between them is a summary on the track it unites into, such as `3 moments · 1 duration`, which takes in that track's moments within the same distance. The summary lists the separation's own moments. Its curves are not drawn, and if that leaves its track with nothing in view, the track is not drawn either. Zoom in and it opens out into its own track again.

## A default view

Someone who can edit a timeline can make a separation its default view: separate it, by tags or by **Separate related** or **Separate all connected**, and select **Make this the default view** in the bar above the tracks. Everyone then opens it that way: readers, embeds, shared links, imported files, desktop files and browser drafts. The bar says "This is the timeline's default view", and **Rejoin** still returns to the whole timeline. **Clear default view**, in the bar or in the **Separate** dialog (which also says what the timeline opens separated by), makes it open whole again.

To keep several ways of showing a timeline, save them as [views](views.md): a default view can be one of them, and then follows it as it changes.

The default view is one of the timeline's settings, like its title and tags, so it is an unsaved change until the timeline is saved (for a server or desktop timeline: rejoin, then save; a browser draft keeps it at once). Saves, exports (`.ochx`, `.och`), forks, copies, merges, pull requests and saved history keep it. In a document it is `view`:

```json
{ "view": { "separation": { "tags": ["war", "trade"] } } }
```

Separations that disjoin or unite are `separations`, each its tags, `disjoins` and `unions`. A disjoin has `from` and a union `into`: null for the main timeline, or another separation's index. Each has one time: `at` (an exact time), `moment` (a moment's ID), or `first: true` for a disjoin, `last: true` for a union:

```json
{
  "view": {
    "separation": {
      "separations": [
        {
          "tags": ["war"],
          "disjoins": [{ "from": null, "at": "1914/1" }],
          "unions": [{ "into": null, "last": true }]
        }
      ]
    }
  }
}
```

Several separations are `groups`, two to seven of them, each a list of tags:

```json
{ "view": { "separation": { "groups": [["war", "siege"], ["trade"]] } } }
```

```json
{ "view": { "separation": { "related": { "moment": "launch" }, "depth": "all" } } }
```

`depth` is `direct` (Separate related) or `all` (Separate all connected). Tags are normalized like entity tags: one to forty, 1–128 characters each, trimmed and lowercased, a comma inside one a semicolon. The entity is named like a relationship's end and must be a valid ID, but it need not exist: a deleted entity is kept in the setting, and the timeline then opens whole, quietly. Anything else is refused when the document is saved or imported. Only the separation is saved. The bar's label comes from the entity's title when the timeline opens.

How it fits with the rest:

- **Reloads:** a server timeline's tab remembers its view. A reload shows it as it was, separated or rejoined; a new tab or a shared link opens the default view.
- **Links to an event or a search** ([`/moments/<id>`, `#moment/<id>`, `#duration/<id>`, `#search/<words>`](sharing.md)) open the whole timeline with that event's details or the search, as before: they name something to show in the editable timeline, and separated tracks are read-only. A link to a range (`#view/<left>..<right>`) opens the default view over that range.
- **Comparisons** of timelines ignore their default views: each track is a whole timeline.
- **Editing:** a separation is read-only, so someone who opens their timeline to edit it rejoins first. Unsaved edits are kept while separated, as before. **Make this the default view** is shown only to those who could edit the timeline, and not in View mode.

## How separations are read

A separation reads two filtered views of one saved state: entities with any of the tags, and entities with none of them. Each view is a full index of its filtered document, so summaries, duration bands, collapsed-duration clusters, pages of moments and of durations run at normal index speed and match the same rules as the whole timeline.

On a server, only the chosen tags the timeline has count, and a relationship separation only if the timeline has its entity. Tags it lacks build nothing new: when none match, the side without them is the whole timeline, read from its own index, and the side with them is empty. Building a view reads the whole saved timeline, so builds are limited: 20 a minute per address without an account and 60 per account, and two at once per server process with up to 16 waiting; views already built are read without either ([administration](administration.md)).

| Timeline            | Where views are built                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server (PostgreSQL) | `oc_views`, with `oc_view_nodes` and `oc_view_duration_nodes` mirroring the main index tables. The first query for a filter builds the view from the saved document; later queries reuse it. Views belong to one saved revision: a save deletes them, and each timeline keeps its eight most recent. `oc_view_overview`, `oc_view_events` and `oc_view_duration_overview` are generated by the migration from the main traversal functions' own definitions, so both share one implementation. |
| Desktop `.och` file | A derived, disk-backed copy of the open file's baseline, built on first use. The two most recent views are kept until the file is closed or saved.                                                                                                                                                                                                                                                                                                                                             |
| In-memory           | Two filtered indexes built in the browser when separating.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

The timeline query endpoint accepts `filter: {"tags": [...], "mode": "any" | "none"}` on `overview`, `events` and `durations` queries (a filtered overview's arcs are the whole timeline's, each end marked by side, or none with `arcs: false`), and `{"kind": "tags"}` returns up to 200 tags with counts, most used first.
