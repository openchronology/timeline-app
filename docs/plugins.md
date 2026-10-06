# Timeline plugins

Open **Plugins** beside **Time display**. The dialog lists this timeline's installed plugins, in application order. **Add plugin** opens the server catalogue with search and twelve results per page. Add, enable, disable, remove, and reorder take effect immediately in the browser's rational map. Save the timeline to persist these settings to the server or a file.

Plugins belong to a timeline, not a user account or the application as a whole. Viewers use the timeline's saved plugins but cannot change them. Installed entries contain a version-pinned manifest snapshot and an enabled flag. Order and settings survive `.ochx`, `.och`, PostgreSQL snapshots and browser drafts. A server catalogue update does not silently change an existing timeline's plugin. This first version upgrades through explicit removal and installation of the newer version.

The downloaded standalone HTML preserves plugin configuration and metadata on import/export, but keeps plugins inactive and hides the catalogue action. It does not load plugin definitions or images. No offline plugins are opted in to this build. Tauri uses the configured OpenChronology server (by default `https://timescale.info`) for the same catalogue; it retains installed definitions in local `.och` files. Disconnecting from the server does not discard installed plugins. External images still require network access.

## Moment icons

Install **Moment icons**, version 1. Its metadata field is `iconUrl`:

```json
{ "title": "Launch", "iconUrl": "https://images.example/launch.png" }
```

Single moments display circular image markers. Hover or keyboard focus enlarges a loaded icon; grouping continues to display the summary count. Selected moment details show a larger preview, a link to the original source and a URL input beneath it. Valid URL edits apply to metadata automatically. Clearing the input removes the key. Failed images leave the usual dot and show an error in the details panel.

Use public HTTPS image URLs without embedded credentials. Image requests have no referrer and use anonymous cross-origin mode. The host must permit cross-origin image access, typically with `Access-Control-Allow-Origin: *`. Cross-origin authentication cookies are not sent. Image links use `noopener noreferrer` and open a new browser tab; Tauri opens the system browser through an HTTPS-only native command. HTTP, `javascript:`, `data:`, `file:`, relative URLs and credential-bearing URLs are not loaded. URL previews debounce typing; marker images retain their DOM nodes across pan/zoom to avoid restarting image loads. Removing or disabling the plugin leaves metadata intact.

## UI capability API v1

Plugins are **declarative JSON**, interpreted by host-owned components. They contain no downloaded JavaScript, HTML, CSS, imports, event handlers or application API endpoints. They cannot obtain account credentials, access the DOM, call the server, or execute arbitrary code. The host is responsible for rendering, validating URLs, field input and lifecycle cleanup. API v1 supports:

- Inspector fields: `text`, `multiline`, `image-url`, `stack`, and `color`, each bound to one top-level moment metadata key.
- Marker effects: a circular `image` bound to a metadata key.
- Ordering: later enabled definitions replace earlier inspector fields with the same key; later marker hooks with a valid, populated image URL take precedence. Empty or invalid URLs fall back to the preceding valid marker effect, or the normal dot.

A plugin can define fields without a marker effect, or an effect without a new editor field. Additional component kinds require an implementation and security review in the host; they are not arbitrary downloaded UI programs. New capabilities will use versioned contracts.

Example manifest:

```json
{
  "apiVersion": 1,
  "id": "moment-icons",
  "version": 1,
  "name": "Moment icons",
  "description": "Circular images on individual moments.",
  "fields": [{ "kind": "image-url", "metadataKey": "iconUrl", "label": "Moment icon URL" }],
  "marker": { "kind": "image", "metadataKey": "iconUrl" }
}
```

`id` is a lowercase ASCII slug; `version` is a positive integer. API version 1 permits eight fields per manifest and 32 installed plugins per timeline, with at most 128 KiB of UTF-8 serialized configuration. Unknown properties and unsupported components are rejected. Metadata keys are bounded ASCII identifiers; `title`, `description`, prototype-related keys and nested paths are unavailable to plugin fields. Field text is rendered as text, never HTML. Host components do not modify event times or timeline bounds.

The document's ordered configuration is:

```json
{
  "plugins": [
    {
      "manifest": {
        "apiVersion": 1,
        "id": "...",
        "version": 1,
        "name": "...",
        "description": "...",
        "fields": []
      },
      "enabled": true
    }
  ]
}
```

Read-only server overview queries return the requested plugin metadata for individual markers in the same bounded query. They do not download the full timeline or issue a separate request for each icon. Group summaries do not include arbitrary event metadata.

## Library API and publishing

The main server supplies a public, read-only library, independent of account login and database configuration:

- `GET /api/plugins?search=icons&page=1&limit=12`
- `POST /api/plugins/search` with `{"search":"icons","page":1,"limit":12}`. Desktop clients use this route to keep their native path allowlist free of arbitrary query strings.
- `GET /api/plugins/moment-icons/1` retrieves a pinned manifest.

Search returns `{apiVersion, plugins, page, limit, total, pages}`. Search is case-insensitive across names, descriptions and IDs. Pages start at one; limits are 1–50. Search is capped at 200 characters, POST bodies at 4 KiB. Search lists the newest published version of each ID; older version URLs remain available. Manifests are validated when the server starts and again on client installation. The client verifies imported timeline snapshots too.

**Moment icons**, **Moment stacks**, and **Moment colors** ship in the built-in library. Operators can publish additional reviewed manifests by setting `PLUGIN_LIBRARY` to a JSON file containing an array of definitions. These are combined with the built-in definitions; duplicate ID/version pairs fail startup. Deploy the file alongside the server or mount it read-only into its container. Restarting publishes the new catalogue; existing timelines remain pinned to their saved snapshots. There is no untrusted upload or executable plugin submission endpoint in this version.

For example, duplicate the sample with a new ID and a `text` or `multiline` field to publish an additional metadata editor. Increment its version for a subsequent release, and keep old definitions in the library if you want their detail URLs to remain available.

Run `npm run migrate`, `pnpm run migrate` or `yarn run migrate` when upgrading the PostgreSQL server. The idempotent migration adds the `plugins` settings column and the metadata-aware overview function; the original overview result shape remains available for existing callers. `.och` files gain an optional settings table without changing the file extension or rational index format, and older files remain readable.

A purely static web deployment has no catalogue API: run the Node server to offer plugin discovery. Saved declarative plugin snapshots still render in the web app without a catalogue connection. Browser CI covers discovery, pagination, activation, URL editing, disabling, removal, reimport and standalone HTML isolation. Native, PostgreSQL, API and JSON tests cover persistence, sequence, validation and bounds.

## Moment stacks

Install **Moment stacks** from the catalogue to enable cards inside a parent moment. Each entry has a stable ID and metadata (title, notes, additional JSON, and the timeline's other active plugin fields). Entries inherit the parent's exact time; they have no independent time or main-axis marker and do not increase point counts or grouping totals. Change the parent time to move the whole stack.

Use **Add entry to stack** at the bottom, drag a card's handle onto another card to reorder (including touch), or use its up/down buttons. **Delete** requires confirmation. Valid changes apply to the local timeline after a short debounce; Undo restores the prior moment state. Save to server or export acts on the whole timeline. Read-only viewers can inspect cards but cannot modify them.

The default metadata shape is `stack: [{id: "entry-id", metadata: {title: "Title", description: "Notes", iconUrl: "https://…"}}]`. Order is the array order. There is no fixed stack row count; existing document and upload size limits still apply. Nested stacks and child time fields are rejected; stack editors are excluded from child cards. `.ochx`, `.och`, and PostgreSQL preserve all entry metadata and order. Disabling or removing a plugin preserves stored stack data; the standalone HTML likewise preserves it while leaving plugin UI inactive.

Stack entries also appear as branches at their parent's horizontal time. Above-axis captions branch upward; below-axis captions branch downward. Each entry receives a dot and, if named, its title, with other active marker plugins applied (including icons). Selecting a branch dot opens the parent editor and scrolls to that entry. Grouped parent moments hide their branches until zoom separates the parents.

Drag the timeline in either dimension. Alt-scroll or Up/Down on the focused timeline pans vertically; normal wheel/pinch still zooms time, and Shift-scroll pans horizontally. **Center axis** resets only vertical position; **Fit all** recenters it while fitting time. Vertical position is a camera setting, not stored event data. Only branch rows near the viewport receive DOM nodes. Vertical-only navigation reuses the existing frame and does not requery PostgreSQL. Server overview metadata includes the enabled stack fields so shared, read-only timelines show the same branches.

## Colors and continuous moment editing

**Moment colors** adds Default, Good (green), Warning (yellow), Bad (red), Information (light blue), Disabled (gray), Important (purple), and In progress (orange) swatches, plus the browser's native color picker. Colors are six-digit hex strings in `metadata.color`; Default removes the override. Color hooks and image hooks compose: colors fill plain dots and outline icon dots, including stack entries. Later enabled color plugins with a valid color override earlier colors; disabling a plugin retains its metadata. Semantic names are presentation choices and do not change permissions or behavior. Manifests can use a `color` field and a `{kind: "color", metadataKey: "color"}` marker effect. Arbitrary CSS is rejected.

With an active stack plugin, a parent or stack-entry context menu offers **Add entry to stack**, appending to the parent stack and focusing its new card. Stack-entry context-menu deletion targets the child and still requires confirmation.

Moment editing applies valid changes to the browser rational map after 250 ms, including title, notes, exact time, additional JSON, plugin fields, and stack additions/deletions/order. There is no Save event button. Incomplete parser/JSON/URL input keeps the last valid event and shows a validation message. Switching moments, leaving a field, exporting, or saving the timeline flushes pending valid edits. Opening a new event does not insert it until an edit is made. Undo coalesces edits during one inspector session. There are no automatic server writes: **Save to server** remains a snapshot action for the complete timeline. `.och` saving and `.ochx` export likewise include the current complete timeline.

Moment titles are optional. Empty, missing, or whitespace-only titles leave the dot visible but suppress its timeline caption and time label. Named main-axis moments show their title and time; stack captions show only their title because time is inherited from their parent. Group summary counts remain visible. Titles and exact time can always be inspected by selecting a dot. **Clear selection** appears with an active time selection, flushes pending valid edits, and clears the cursor and inspector selection without deleting a moment. The yellow cursor paints above caption backgrounds so nearby labels cannot mask it.
