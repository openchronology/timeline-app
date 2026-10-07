# Comparing timelines and live viewing

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Select timeline cards in the dashboard and use **Compare timelines**. Selection
persists across search pages in the current browser tab. Alternatively, **Compare**
in an open editor presents a searchable list of timelines visible to you,
including private timelines you own or have collaborator access to. Select two
to eight sources. The currently open working timeline can be included. JSON
`.ochx` files can also be added, including in the standalone offline HTML build.
Desktop can compare its current SQLite timeline with server timelines or JSON files.

The result is a read-only view: source titles, moments, metadata and plugin
configurations cannot be edited, saved, or exported from this view. Exit comparison
to return to the original timeline, including its unsaved edits and viewport.
Alignment and display controls affect the comparison only.

Each track uses `shared time = original time × scale + offset`, with exact
rational arithmetic. Scale must be positive to preserve chronology. The inputs
accept exact rationals or finite decimals; offsets are shared coordinates,
not screen pixels. Fit all includes transformed bounds. One horizontal viewport
controls every track; vertical pan and Ctrl-scroll scaling remain available.

Stacked mode has separate axes and source labels. **Combine into one timeline**
merges the visible summaries and groups nearby moments across sources; disabling
it restores the tracks. Qualified moment IDs avoid collisions between sources.
Moment details identify their source and original coordinate. Group inspection
uses disposable 25-moment pages in either mode.

When source presentations differ, a dialog requires choosing a common printer/
parser before comparison starts. Source presets, including custom code, and
standard presets are available. This converts their presentation, without
changing source coordinates or guessing a correspondence between different unit
or epoch conventions. Use scale/offset to define that correspondence explicitly.
Time display settings may subsequently be adjusted on the comparison itself.

The plugin union preserves source selection order and deduplicates by plugin ID.
A plugin enabled in any source is enabled in the view. If the same ID has different
versions or code, the first source's definition is used and a visible notice lists
the conflict. Distinct plugin IDs remain distinct. No plugin code runs on the
server. Plugins continue to use the restricted interpreter and existing host
components, with editing disabled in this view.

Each indexed source retains only one bounded, overscanned cache. Inverse affine
transforms produce database query bounds and grouping thresholds in source
coordinates. Changing alignment clears that source's cache. Viewport requests
are debounced, serial, and discard stale results. Browser-created and imported
JSON timelines remain in their existing RationalMap; comparison does not clone
all their events or fetch complete server documents.

## Live refresh

Web editors use one server-sent event stream for up to eight source IDs.
Transactional PostgreSQL `LISTEN/NOTIFY` signals committed timeline and membership
changes across application processes. Notifications carry IDs only. The stream
checks current session and timeline access before sending revisions, and rechecks
access on its 25-second heartbeat. The revision check reads only indexed ID and
revision columns, not full-text data, settings or events. A connection's initial
revision closes the race during subscription/reconnection.

Desktop and transports without the event stream poll the small `/revision`
endpoint every five seconds. Hidden documents stop listening/polling; returning
resumes refresh. A changed revision updates headers, invalidates only the affected
viewport cache, and fetches bounded summaries at the current viewport. It does not
jump the viewport back to Fit all. New and removed markers fade over 220 ms;
reduced-motion preferences disable these fades. Retiring DOM nodes have a fixed
budget and are removed after their animations.

Unsaved edits are never replaced by background updates. The editor shows **Reload
latest** when upstream changes arrive while edits are pending. Reload confirms
replacement through the usual unsaved-work check. A working source with unsaved
edits is likewise preserved during comparison while other tracks keep refreshing;
exit, save or export that working timeline before reloading it. Comparison moment
inspectors are cleared when refreshed source contents change, avoiding stale edits.

The standalone HTML build includes no live network module, event stream, or
refresh timers. Existing CSP and no-network tests remain enforced.

After upgrading the server, run migrations to install the notification triggers.
Compose's normal build/start command runs migrations automatically. Reverse
proxies should support streaming responses; `/api/live` sets
`X-Accel-Buffering: no`. If streaming is unavailable, metadata polling takes over.

## Saved public comparisons

A platform timeline may contain `comparison: {sources: [UUID, UUID], combined: false}`
in place of its own moments (`events` is empty). Its immutable checkpoint stores
the definition, while `oc_timelines.comparison` supplies the current live view.
Opening its normal `/timelines/<id>` route loads bounded windows from each source
and subscribes to their revisions. Public comparisons require public ordinary
sources; source ACLs are checked on access. Nested saved comparisons are rejected.
Ad hoc selection expands saved comparisons and deduplicates sources (eight maximum).
The dashboard labels these as comparisons and links to them alongside ordinary
timelines. Source pages remain independently searchable, editable and forkable.

The seeded World War II comparison demonstrates this with the European and
Pacific campaigns. Its source links and definition history appear above the
viewer. View alignment is temporary; this version does not provide a UI to publish
or edit comparison definitions. Exiting a named comparison returns to the dashboard.
Exporting and forking operate on individual source timelines; a reference-only
comparison cannot become an offline copy of its source data.
