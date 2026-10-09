# Relationships

A relationship links two different entities: two moments, two durations, or a moment and a duration. Links are undirected, an entity can link to any number of others, and an entity cannot link to itself. A relationship carries no label; it records only that the two entities are related.

## Viewing and editing

Moment details and the duration dialog have a **Related to** section. It lists directly related entities 25 at a time, each with its time or extent; choose one to open it. When more entities are connected through other relationships, the section says how many, e.g. "14 more through other relationships".

To link an entity, open **Add a relationship** and search titles and notes. Choose a result to link it. **×** removes a link. Undo and Redo cover adding and removing links. Deleting a moment or duration removes its links; undoing the deletion restores them.

**Separate related** moves the entity and its directly related entities into a track above everything else, like [separating by tags](tags.md). **Separate all connected** also follows relationships transitively: everything reachable through any chain of links moves up. Separated tracks are read-only and draw no arcs; **Rejoin** returns to the whole timeline.

## Arcs

Each relationship is drawn as an arc above the axis between its two entities: at a moment's time, or at a duration's start. An arc whose other end is outside the view runs off the edge of the timeline. Arcs shorter than the grouping distance are not drawn, because both ends are inside one summary at that zoom; zooming in reveals them. A window shows at most 256 arcs, with a notice when more cross it. Hover over an arc to see what it connects.

Arcs never require the whole timeline. Each relationship is indexed as a fixed interval between its endpoints' times, in the same augmented interval tree used for [duration bands](durations.md#storage-and-queries). A viewport query visits only subtrees that touch the window and skips subtrees made entirely of arcs shorter than the threshold.

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

Desktop and browser saves rebuild link and arc indexes; PostgreSQL sparse saves add and remove only the changed links and re-place arcs of moved entities. Arcs come with overview queries (`edges`, `edgesTruncated`). `{"kind": "related", "entity": {"moment": "launch"}, "after": null, "limit": 25}` returns direct relations with titles and times, paged by kind and ID; its first page also returns `direct` and `reachable` counts. Separation views accept `filter: {"related": {...}, "depth": "direct" | "all", "mode": "any" | "none"}`. Sparse saves send `relationshipChanges` (`{a, b, related}`), which add or remove links idempotently.
