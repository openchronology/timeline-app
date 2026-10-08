# Guest and standalone editing

The standalone HTML build and guest editor keep timeline data **only in memory**.
The banner at the top of the editor explains that refreshing or closing the tab
loses edits, and offers **Export .ochx**. Import/export preserves exact rationals,
metadata, stack entries, custom time displays, plugins and embedded assets.
Guests do not read or write IndexedDB draft or authentication-resume records.
Export before leaving the editor to sign in; unsaved edits trigger a browser exit
warning. Signed-in drafts and desktop SQLite files retain their existing behavior.

Public timelines remain read-only when viewed by guests. **Fork in browser** creates
an editable copy in the tab, leaving the owner's data untouched. The action is
available on dashboard cards, timeline navigation and the timeline toolbar. No
account, persistent server fork, collaborator permission or historical revision is
created. Once copied, the timeline uses its complete local rational map rather
than fetching viewport windows or subscribing to source changes.

A copy must fit both **5,000 entries (moments, stack entries and durations)** and **4 MiB of JSON** (including settings,
plugin code and images). Oversized copies are rejected with an explicit warning;
no content is silently truncated. The original remains viewable through the
normal bounded server cache. Sign in for a persistent database-backed fork of a
larger timeline. Imported .ochx files remain local user-selected files; these copy
limits govern server-to-browser downloads rather than changing file-format limits.

Operators should run the normal schema migration when upgrading. Saved snapshot
sizes are recorded on save; older snapshots receive a one-time size backfill during
migration. Copy admission checks counters first, applies rate/concurrency limits
and query timeouts, and never measures a large document as part of a guest request.
Limits are also enforced while reading response bytes in the browser. Guest full
JSON downloads share the admission gate; SQLite exchange requires sign-in.
