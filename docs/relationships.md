# Relationships

<!-- description: Relationships link two events on a timeline, drawn as arcs, and links join events across timelines: how to add, browse and remove them. -->

A relationship links two different entities: two moments, two durations, or a moment and a duration. Links are undirected, an entity can link to any number of others, and an entity cannot link to itself. A relationship carries no label; it records only that the two entities are related.

## Viewing and editing

Moment details and the duration dialog have a **Related to** section. It lists directly related entities 25 at a time, each with its time or extent; choose one to open it. When more entities are connected through other relationships, the section says how many, e.g. "14 more through other relationships".

To link an entity, choose **Add a relationship…**. A picker opens with two tabs:

- **Search:** words from this timeline's events' titles and notes, matched as Explore's search matches them ([browsing](browsing.md#searching-events)), with the words highlighted. **Filters**, folded away, choose moments, durations or both.
- **Address:** paste a link to one of this timeline's moments or durations: its page's address, or a link fragment such as `#moment/<id>`.

Choose a result to link it. **×** removes a link. Undo and Redo cover adding and removing links. Deleting an event removes its links; undoing the deletion restores them.

**Separate related** moves the entity and its directly related entities into a track above everything else, like [separating by tags](tags.md). **Separate all connected** also follows relationships transitively: everything reachable through any chain of links moves up. The bar above the tracks says which entity was separated and how, such as "Separated: related to Alpha". Separated tracks are read-only and still draw arcs (see [Arcs between tracks](#arcs-between-tracks)); **Rejoin** returns to the whole timeline.

A separation by relationships is one of the [separations](tags.md#separating-by-tags) shown, beside any by tags: separating another entity's relationships, or by tags, adds to it rather than replacing it. It is made and changed only in the entity's details, where its buttons switch between related and all connected, and **Stop separating** removes it. The **Separate by tags** dialog lists it as "Related to Alpha" (or "Connected to Alpha"), with **Remove** and its disjoins and unions, but its entity and depth cannot be changed there. Its disjoins and unions work as for tags; there, its first and last moments are the earliest and latest moments of the entity's set.

Either separation can be made the timeline's [default view](tags.md#a-default-view), so it opens separated that way. If the entity is deleted later, the timeline opens whole.

## Arcs

Each relationship is drawn as an arc above the axis between its two entities: at a moment's time, or at a duration's start. An arc whose other end is outside the view runs off the edge of the timeline. Only the part over the timeline is drawn, as the same curve, so an arc whose ends are far off screen stays at the same height as the view pans. Arcs shorter than the grouping distance are not drawn, because both ends are inside one summary at that zoom; zooming in reveals them. A window shows at most 256 arcs, with a notice when more cross it. Hover over an arc to see what it connects.

The [Relationship arrows](plugins.md#relationship-arrows) plugin draws arrowheads on arcs. Each entity keeps, in its own metadata, an arrow for any of its relationships (toward the other end, toward itself, or both), and an arc shows what either end asks for. This is a drawing convention stored on the entities, not part of the relationship: relationships stay undirected and unlabeled, and Separate related and Separate all connected don't follow the arrows.

Arcs never require the whole timeline. Each relationship is indexed as a fixed interval between its endpoints' times, in the same augmented interval tree used for [duration bands](durations.md#storage-and-queries). A viewport query visits only subtrees that touch the window and skips subtrees made entirely of arcs shorter than the threshold.

### Arcs between tracks

While a timeline is separated, by tags or by relationships, its relationships are still drawn. A link between two events on the same track arcs above that track's axis, as on the whole timeline. A link between an event above and one below crosses the gap between the tracks: an S-shaped curve that leaves one event's marker straight down (or up), runs across, and arrives straight into the other's. Across a long time span it crosses the view almost level, halfway between the tracks, and runs off the edge toward its ends. Arrowheads, hover text, the 256-arc limit with its notice, and hiding arcs shorter than the grouping distance work as on the whole timeline.

The arcs are the whole timeline's, not each track's: the upper track's overview answers carry every arc touching the window, each end marked with whether it is on that track (`aIn`, `bIn`; an end that isn't is on the lower track, which is everything else). The lower track asks for none (`arcs: false`). How each timeline knows which track an end is on, for at most 512 ends a window and never by reading the whole timeline:

| Timeline            | Arcs                                                     | Which track an end is on                                                                                                                  |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Server (PostgreSQL) | The timeline's `oc_edge_nodes` (forks read through)      | Primary-key lookups in the upper view's `oc_view_moments`, and in its `oc_view_duration_nodes` by duration ID (an index on `band->>'id'`) |
| Desktop `.och` file | The open file's own `edge_intervals`                     | One query of primary-key lookups in the upper view's derived copy (`events`, `durations`)                                                 |
| In-memory           | An arc tree of the whole document, built when separating | The separation's membership test (the chosen tags, or the related set found by breadth-first search)                                      |

Views already hold exactly the entities on their side, so looking an end up in the upper view answers the question for both tracks, whatever the separation.

## Links to other timelines

A moment or duration on a server timeline can also link to a moment or duration on another
timeline, or to another timeline as a whole. Related to lists these under **On other timelines**,
each with the other timeline's name. Choosing a link opens the other entity's page, with its timeline open at
it, or the other timeline's page.

To add one, choose **Link to another timeline…**. The same picker opens:

- **Search** finds timelines and their events at once, as Explore's search does, with the words highlighted. It finds only what you can link to:
  - timelines you can save: your own, and those shared with you as a writer;
  - timelines below the [link limit](administration.md#links-between-timelines);
  - never this timeline or its events, which are related with **Add a relationship…** instead.
- **Filters**, folded away, choose timelines, moments or durations, a tag, and **Timelines I can edit** or only **My timelines**.
- **Address:** paste the address of a timeline's page, or of a moment's or duration's page. A link fragment, an embed's address and the editor's own address work too. The server looks it up and says why it can't be linked, if it can't: it's this timeline, you can't save it, or it's at the limit.

Choosing a timeline links to it as a whole; choosing an event links to that event. The linked
timeline's editor lists what links to it as a whole under **Linked from other timelines**, below
its tags, 25 at a time. It is folded until opened, and shown only when something links there.
Each entry opens the linking moment's or duration's page, and **×** removes the link from that
end too. A fork shows only the events it changed in search; link to its other events by their address. **×** removes a link. Linking and removing a link need permission to save both
timelines, since the link belongs to both. Undo and Redo do not cover them: a link is kept by
the server, apart from either timeline, and takes effect at once. Unsaved entities can't be
linked yet; save first.

Who sees a link: anyone who may read both timelines. A link to a private timeline you can't read
is not shown, and nothing says it exists.

The pages search engines read show links too ([sharing](sharing.md#search-engines)): a
moment's or duration's page lists its links to other timelines, each leading to the other
entity's page or the other timeline's, and a timeline's page lists what links to it as a whole,
under **Linked from**. A link shows on the pages of both its ends, so they lead to each other.
With [IndexNow](administration.md#indexnow) on, adding or removing a link tells search engines
about both pages.

When the two timelines are [compared](comparison.md), each link between their entities is drawn
as an arc. On stacked tracks it crosses between the tracks as an S-shaped curve, like [arcs between
tracks](#arcs-between-tracks). With **Combine into one timeline** it is an ordinary arc over the
one axis. Arcs follow each track's alignment, and hovering one names both ends. As on a single
timeline, arcs shorter than the grouping distance are hidden until you zoom in. A window shows at
most 256 arcs, with a notice when more cross it. Links to a whole timeline have no time, so they
are listed but not drawn. Comparisons also draw each timeline's own relationships on its track.

Links are not part of either timeline's content. They are not in saved history, forks, pull
requests or exports (`.ochx`, `.och`), and the desktop app and offline file show only those of a
server timeline. A link goes away when either end does:

- **An entity is deleted:** a save deleting a moment or duration, whether in the editor, a
  merge, a restore or an import, deletes its links. A fork reading through to its source keeps
  links to entities it still has.
- **A timeline is deleted:** deleting a timeline deletes its links.

The server stores each link once, in `oc_timeline_links`, indexed from both ends and by pair of
timelines. Each read looks both entities up in their timelines' indexes, so a link never outlives
its entities. A timeline holds at most 10,000 links by default
([administration](administration.md#links-between-timelines)). The API is
`GET`, `POST` and `DELETE /api/timelines/{id}/links` and `POST /api/timelines/links/query` (the
arcs between a comparison's timelines in a window). Live updates announce when a timeline's links
change, and comparisons redraw them.

## Exchange format

Relationships are a top-level `relationships` array in version-1 documents:

```json
{
  "relationships": [
    { "a": { "duration": "campaign" }, "b": { "moment": "launch" } },
    { "a": { "moment": "launch" }, "b": { "moment": "review" } }
  ]
}
```

Moment and duration IDs are separate namespaces, so each endpoint names its kind. Each link is stored once in canonical order (by `d:<id>` or `m:<id>`), duplicates are removed, and both endpoints must exist. `.ochx`, `.och`, server saves, forks, merges and saved history preserve relationships; merges treat them as a set and keep a link only while both of its entities exist.

## Storage and queries

| Timeline            | Links                                         | Arcs                              | Transitive reach     |
| ------------------- | --------------------------------------------- | --------------------------------- | -------------------- |
| Server (PostgreSQL) | `oc_relationships`, indexed from both ends    | `oc_edge_nodes`                   | Recursive CTE        |
| Desktop `.och` file | `relationships` table, indexed from both ends | `edge_intervals` and `edge_nodes` | Recursive CTE        |
| In-memory           | Adjacency map                                 | In-memory interval tree           | Breadth-first search |

Desktop and browser saves rebuild link and arc indexes; PostgreSQL sparse saves add and remove only the changed links and re-place arcs of moved entities. Arcs come with overview queries (`edges`, `edgesTruncated`), including a separation's, whose arcs are the whole timeline's with each end marked by side (`aIn`, `bIn`) unless the query sets `arcs: false`. `{"kind": "related", "entity": {"moment": "launch"}, "after": null, "limit": 25}` returns direct relations with titles and times, paged by kind and ID; its first page also returns `direct` and `reachable` counts. Separation views accept `filter: {"related": {...}, "depth": "direct" | "all", "mode": "any" | "none"}`. Sparse saves send `relationshipChanges` (`{a, b, related}`), which add or remove links idempotently.
