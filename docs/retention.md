# Data retention and quick deletion

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Timelines that keep growing, such as the ones the [syslog receiver](syslog.md) and the
[log importer](log-import.md) fill, can keep only their recent past, and anything in a
stretch of time can be deleted at once.

## Keeping only the last year (or month, or week)

On a server timeline's **Sharing & settings** page, its owner can set **Keep only the last**
to a period such as `1 year`, `90 days` or `2 weeks`, in the timeline's
[difference units](time-presentation.md#time-differences). About once an hour, the server
then:

- deletes moments older than the period, and durations that ended before it. Durations that
  followed a deleted moment keep its time as a fixed endpoint, and relationships of deleted
  moments and durations go. This is saved like any other change, so viewers see it live and
  the timeline's history records it;
- deletes saved revisions from before the period, which frees the storage they used. It keeps
  what is still needed: the current revision and the history newer revisions are stored
  against, and anything forks or pull requests refer to. A timeline whose saves are small
  patches stores a full copy every 1,000 saves (or once its patches outweigh it), and history
  before such a copy is what goes.

Retention needs a calendar (Gregorian) time display, so that the server knows what time it
is in the timeline; the period runs from the present. It keeps at least an hour and at most
1,000 years. **Keep everything** removes the setting. Deleted data cannot be restored, so
export or fork a timeline first to keep a copy.

The page shows when retention last ran and how much it deleted. The API sets it like the
other settings:

```sh
curl -X PATCH "$OCH_API_URL/api/timelines/$ID/settings" \
  -H "Authorization: Bearer $OCH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"retention": "1 year"}'            # or null to keep everything
```

The response includes `retention` (as the timeline's display writes it), `retention_seconds`,
`retention_applied_at` and `retention_removed`. Only the owner sets it; API keys need the
`timelines:write` scope.

## Deleting everything in a view

Right-click (or hold) the timeline and choose **Delete everything in this view…**: it deletes
every moment in the visible range and the durations wholly inside it, after asking.

- In a timeline kept in the browser (guest editing, imports, the offline file), one **Undo**
  brings everything back, until the change is saved.
- In a server timeline, writers delete on the server at once, as one saved revision; save
  other changes first. The timeline's history keeps the version before the deletion (until
  retention prunes it). The desktop app's own files are not covered.

The API deletes a range, both ends included, for anyone who can write the timeline:

```sh
curl -X POST "$OCH_API_URL/api/timelines/$ID/delete-range" \
  -H "Authorization: Bearer $OCH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"revision": "42", "lower": "1704067200/1", "upper": "1735689599/1"}'
```

`lower` and `upper` are exact stored coordinates (for a calendar timeline at its default
scale, Unix seconds). `revision` is the timeline's current revision; an older one is
refused with 409, as other saves are. The answer says how many moments and durations went
(`removed`), and `more: true` when a range held over 200,000 moments: send it again for the
rest.
