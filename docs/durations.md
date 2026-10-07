# Linked durations

A duration links two distinct moments in one timeline. Open a moment, choose **Link to end moment**, and select the other endpoint from a list fetched 25 entries at a time. Add an optional title and notes. Edits apply continuously, and saving or exporting the timeline retains the links. Clicking a band opens its starting moment and duration controls.

The wire definition lives in the starting moment's metadata:

```json
{
  "durations": [
    {
      "id": "duration-id",
      "endId": "ending-moment-id",
      "metadata": { "title": "A period", "description": "Notes" }
    }
  ]
}
```

IDs are stable and unique within a timeline. A link stores no duplicate coordinates. Moving either endpoint moves the band, and reversing endpoint order still renders the interval between them. Zero-length intervals between distinct coincident moments are allowed. Stack entries cannot be endpoints; their coordinates belong to their root moment.

`.ochx`, `.och`, server saves, forks and immutable snapshots preserve these definitions. Custom metadata is retained. Deleting a moment asks for confirmation and removes its incident durations when saving/exporting; deleting a duration leaves both moments intact. The browser undo action can restore an endpoint and its links before the deletion is saved.

Moment summaries continue to count moments only. Duration bands have a separate interval query, so a period crossing the viewport is visible even when both endpoint moments are outside the moment cache. The browser, PostgreSQL and SQLite use augmented balanced interval trees with exact rational bounds. Database queries prune subtrees outside the viewport and return at most 256 bands, with an explicit notice when more match. Viewport responses include only short title/notes fields; arbitrary duration metadata is fetched with its starting moment. Bands use three compact visual lanes in this first version; intersecting bands can overlap. Zooming narrows the query; durations are not currently aggregated into approximate interval counts.

Sparse browser edits retain the endpoints needed by unsaved links. Full document validation rejects missing endpoints, self-links and duplicate duration IDs. Only explicitly deleted endpoints cascade during sparse saves; malformed new links fail atomically. Comparisons transform each source's bands with that source's exact offset and scale and remain read-only.

The `durations` metadata key is reserved for the application. Plugins can style the moments at the endpoints, but this first version does not apply moment plugins to duration bands.
