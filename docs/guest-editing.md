# Guest and standalone editing

<!-- description: Editing without an account: the guest editor and the offline HTML file keep timelines in memory, and how to keep your work before closing. -->

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

## The hosted copy

The offline editor is also at <https://openchronology.github.io/>, with each edition at
`/<edition>/` such as `/cfam/`. It is published from each stable release's tag, never from
unreleased changes, so it is the same version as that release's download
([#510](https://github.com/openchronology/timeline-app/issues/510)).

**The downloaded file is the recommended way to use it.** The hosted copy is served from
`openchronology.github.io`, the address GitHub Pages also gives every other project site of
the organization (`openchronology.github.io/<project>/`). Browsers treat all of them as one
site, so a page on any of them can read and change what the editor keeps in the browser's
storage (its theme and view settings), and script an editor window or frame it opened,
including reading a timeline imported there. GitHub Pages also lets any site frame the hosted
copy. The editor keeps your timelines only in memory and sends them nowhere, which limits what
such a page could do, but a file you downloaded and opened from your own computer has none of
these neighbours. [Releases](https://github.com/openchronology/timeline-app/releases/latest)
attach it as `openchronology-offline.html` (and `openchronology-offline-<edition>.html`), with
their checksums in `SHA256SUMS.txt`, and the download page of any OpenChronology server links
to them.
