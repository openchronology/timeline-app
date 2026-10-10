# Timeline plugins

Open **Plugins** beside **Time display**. The dialog lists this timeline's installed plugins, in application order. **Add plugin** opens the server catalogue with search and twelve results per page. Add, enable, disable, remove, and reorder take effect immediately in the browser's rational map. Save the timeline to persist these settings to the server or a file.

Plugins belong to a timeline, not a user account or the application as a whole. Viewers use the timeline's saved plugins but cannot change them. Installed entries contain a version-pinned manifest snapshot and an enabled flag. Order and settings survive `.ochx`, `.och`, PostgreSQL snapshots and browser drafts. A server catalogue update does not silently change an existing timeline's plugin. Upgrade by installing a newer definition explicitly. **Edit / export definition** opens the saved manifest and script; edits apply only to this timeline until published.

The standalone HTML runs saved official and custom plugins entirely locally. Create/import/edit/export definitions works there too; online catalogue discovery and publishing are hidden. It never fetches scripts or external images. Tauri uses the configured OpenChronology server (by default `https://timescale.info`) for the same catalogue; it retains installed definitions in local `.och` files. Disconnecting from the server does not discard installed plugins. External images use network access only in the connected app; embedded copies work offline.

## Moment icons

Install **Moment icons**. Its metadata field is `iconUrl`:

```json
{ "title": "Launch", "iconUrl": "https://images.example/launch.png" }
```

Single moments display circular image markers. Hover or keyboard focus enlarges a loaded icon; grouping continues to display the summary count. Selected moment details show a larger preview, a link to the original source and a URL input beneath it. Valid URL edits apply to metadata automatically. Clearing the input removes the key. Failed images leave the usual dot and show an error in the details panel.

Use public HTTPS image URLs without embedded credentials. Image requests have no referrer and use anonymous cross-origin mode. The host must permit cross-origin image access, typically with `Access-Control-Allow-Origin: *`. Cross-origin authentication cookies are not sent. Image links use `noopener noreferrer` and open a new browser tab; Tauri opens the system browser through an HTTPS-only native command. HTTP, `javascript:`, `data:`, `file:`, relative URLs and credential-bearing URLs are not loaded. URL previews debounce typing; marker images retain their DOM nodes across pan/zoom to avoid restarting image loads. Removing or disabling the plugin leaves metadata intact.

## UI capability API v1

Plugins combine **JSON host component declarations** and an optional restricted script. Their source is interpreted locally, without arbitrary JavaScript execution, HTML, CSS, imports, event handlers or application API endpoints. They cannot obtain account credentials, access the DOM, call the server, or execute arbitrary code. The host is responsible for rendering, validating URLs, field input and lifecycle cleanup. API v1 supports:

- Inspector fields: `text`, `multiline`, `image-url`, `stack`, `shape`, `size`, `color`, and `links`, each bound to one top-level moment metadata key.
- Marker effects: an `image`, `color`, or `shape` bound to metadata, plus hover cards and restricted scripted effects.
- Ordering: later enabled definitions replace earlier inspector fields with the same key; later marker hooks with a valid, populated image URL take precedence. Empty or invalid URLs fall back to the preceding valid marker effect, or the normal dot.
- Targets: an optional `targets` array of `"moments"` and/or `"durations"`. Without it, color markers and hover cards apply to moments and [durations](durations.md); every other plugin applies to moments only. Durations use only text, notes, color and link fields, color markers and hover cards; stacks, shapes, sizes, icons and summary expansion are moment-only.

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

`id` is a lowercase ASCII slug; `version` is a positive integer. Optional `source` contains a restricted `render` function. Older declarative snapshots remain supported. The existing built-ins publish scripted version 2 and retain declarative version 1 detail URLs; the new shape plugin starts at version 1. API version 1 permits eight fields per manifest and 32 installed plugins per timeline, with at most 128 KiB of UTF-8 serialized configuration. Unknown properties and unsupported components are rejected. Metadata keys are bounded ASCII identifiers; `title`, `description`, prototype-related keys and nested paths are unavailable to plugin fields. Field text is rendered as text, never HTML. Host components do not modify event times or timeline bounds.

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

The main server supplies a public searchable library. Built-ins remain available without a database; community publications are stored in PostgreSQL:

- `GET /api/plugins?search=icons&page=1&limit=12`
- `POST /api/plugins/search` with `{"search":"icons","page":1,"limit":12}`. Desktop clients use this route to keep their native path allowlist free of arbitrary query strings.
- `GET /api/plugins/moment-icons/1` retrieves a pinned manifest.

Search returns `{apiVersion, plugins, page, limit, total, pages}`. Search is case-insensitive across names, descriptions and IDs. Pages start at one; limits are 1–50. Search is capped at 200 characters, POST bodies at 4 KiB. Search lists the newest published version of each ID; older version URLs remain available. Manifests are validated when the server starts and again on client installation. The client verifies imported timeline snapshots too.

**Moment icons**, **Moment stacks**, **Moment colors**, **Moment shapes**, and **Focus on hover** ship in the built-in library. Operators can publish additional reviewed manifests by setting `PLUGIN_LIBRARY` to a JSON file containing an array of definitions. These are combined with the built-in definitions; duplicate ID/version pairs fail startup. Deploy the file alongside the server or mount it read-only into its container. Restarting publishes the new catalogue; existing timelines remain pinned to their saved snapshots. Signed-in users can also publish restricted scripted definitions through the editor or `POST /api/plugins/publish`.

For example, duplicate the sample with a new ID and a `text` or `multiline` field to publish an additional metadata editor. Increment its version for a subsequent release, and keep old definitions in the library if you want their detail URLs to remain available.

Run `npm run migrate`, `pnpm run migrate` or `yarn run migrate` when upgrading the PostgreSQL server. The idempotent migration adds the `oc_plugins` community library table, the `plugins` settings column and the metadata-aware overview function; the original overview result shape remains available for existing callers. `.och` files gain an optional settings table without changing the file extension or rational index format, and older files remain readable.

A purely static web deployment has no catalogue API: run the Node server to offer plugin discovery. Saved plugin snapshots still render in the web app without a catalogue connection. Browser CI covers discovery, pagination, activation, URL editing, disabling, removal, reimport and standalone HTML isolation. Native, PostgreSQL, API and JSON tests cover persistence, sequence, validation and bounds.

## Moment stacks

Install **Moment stacks** from the catalogue to enable cards inside a parent moment. Each entry has a stable ID and metadata (title, notes, additional JSON, and the timeline's other active plugin fields). Entries inherit the parent's exact time; they have no independent time or main-axis marker and do not increase point counts or grouping totals. Change the parent time to move the whole stack.

Use **Add entry to stack** at the bottom, drag a card's handle onto another card to reorder (including touch), or use its up/down buttons. **Delete** requires confirmation. Valid changes apply to the local timeline after a short debounce; Undo restores the prior moment state. Save to server or export acts on the whole timeline. Read-only viewers can inspect cards but cannot modify them.

The default metadata shape is `stack: [{id: "entry-id", metadata: {title: "Title", description: "Notes", iconUrl: "https://…"}}]`. Order is the array order. There is no fixed stack row count; existing document and upload size limits still apply. Nested stacks and child time fields are rejected; stack editors are excluded from child cards. `.ochx`, `.och`, and PostgreSQL preserve all entry metadata and order. Disabling or removing a plugin preserves stored stack data; the standalone HTML runs the saved stack UI locally too.

Stack entries also appear as branches at their parent's horizontal time. Above-axis captions branch upward; below-axis captions branch downward. Each entry receives a dot and, if named, its title, with other active marker plugins applied (including icons). Selecting a branch dot opens the parent editor and scrolls to that entry. Grouped parent moments hide their branches until zoom separates the parents.

Drag the timeline in either dimension. Alt-scroll or Up/Down on the focused timeline pans vertically; normal wheel/pinch still zooms time, and Shift-scroll pans horizontally. **Center axis** resets only vertical position; **Fit all** recenters it while fitting time. Vertical position is a camera setting, not stored event data. Only branch rows near the viewport receive DOM nodes. Vertical-only navigation reuses the existing frame and does not requery PostgreSQL. Server overview metadata includes the enabled stack fields so shared, read-only timelines show the same branches.

## Colors and continuous moment editing

**Moment colors** adds Default, Good (green), Warning (yellow), Bad (red), Information (light blue), Disabled (gray), Important (purple), and In progress (orange) swatches, plus the browser's native color picker. The default swatches use a muted palette. Colors are six-digit hex strings in `metadata.color`; Default removes the override. Color hooks and image hooks compose: colors fill dots behind their icons; white borders remain intact, including stack entries. Later enabled color plugins with a valid color override earlier colors; disabling a plugin retains its metadata. Semantic names are presentation choices and do not change permissions or behavior. Manifests can use a `color` field and a `{kind: "color", metadataKey: "color"}` marker effect. Arbitrary CSS is rejected.

With an active stack plugin, a parent or stack-entry context menu offers **Add entry to stack**, appending to the parent stack and focusing its new card. Stack-entry context-menu deletion targets the child and still requires confirmation.

Moment editing applies valid changes to the browser rational map after 250 ms, including title, notes, exact time, additional JSON, plugin fields, and stack additions/deletions/order. There is no Save event button. Incomplete parser/JSON/URL input keeps the last valid event and shows a validation message. Switching moments, leaving a field, exporting, or saving the timeline flushes pending valid edits. Opening a new event does not insert it until an edit is made. Undo coalesces edits during one inspector session. There are no automatic server writes: **Save to server** remains a snapshot action for the complete timeline. `.och` saving and `.ochx` export likewise include the current complete timeline.

Moment titles are optional. Empty, missing, or whitespace-only titles leave the dot visible but suppress its timeline caption and time label. Named main-axis moments show their title and time; stack captions show only their title because time is inherited from their parent. Group summary counts remain visible. Titles and exact time can always be inspected by selecting a dot. **Clear selection** appears with an active time selection, flushes pending valid edits, and clears the cursor and inspector selection without deleting a moment. The yellow cursor paints above caption backgrounds so nearby labels cannot mask it.

## Content scaling and Focus on hover

Ctrl-scroll changes presentation size, from 20% to 300%: dots, icons, captions, ruler labels, and vertical stack spacing scale together. The pointer's vertical position anchors the change; exact time values and horizontal viewport bounds do not change. Vertical-only resizing reuses the current data frame. **Center axis** recenters the ruler at the current size; **Fit all** restores normal size and fits time. Each two-finger gesture does one thing, chosen when the second finger lands: fingers side by side, or up to 60° from horizontal, zoom time by their full separation, so vertical drift never resizes the contents; fingers stacked vertically resize the contents and leave the time span unchanged. Both pan with the fingers' midpoint. Directions are in the current screen layout, so rotating the device needs no special handling; a rotation during a gesture restarts it from the new layout. Separations below 20 pixels at gesture start are ignored. Camera size is not stored in moment metadata or exported files.

Install **Focus on hover** to expand a single moment or stack entry into an animated preview card on mouse hover or keyboard focus. The card shows its title, up to four lines of notes (a bounded plain-text excerpt), and the icon image above the title when Moment icons is active. Colors accent the card border while dots retain white borders. Click the card to open the normal inspector; Escape closes the preview. Reduced-motion preferences disable the morph transition. Group summary dots retain their count view. The declarative capability is `hover: {kind: "card"}`; it grants no HTML, JavaScript, network or DOM authority to a manifest. Shared overview projection includes a bounded notes excerpt so viewing does not issue per-moment requests. Offline HTML runs these saved capabilities without contacting the catalogue.

## Moment shapes

Install **Moment shapes** to add a shape selector to each moment and stack entry. The `shape` metadata field accepts `circle`, `diamond`, `square`, `triangle`, `pentagon`, `hexagon`, `octagon`, `star`, `terminator`, `process`, `document`, and `parallelogram`. SVG outlines retain a white border with the color and icon plugins. Group summaries remain circles, since they represent multiple moments with potentially different shapes.

## Authoring scripts

Open **Plugins → Create / import plugin**. The editor starts with a working status example. This works in the single-file offline build too. The JSON editor defines the identity and host input components; the source editor defines rendering behavior. **Install on timeline** applies it immediately, replacing the same ID in place. Definitions can also be imported/exported as `.plugin.json` files. Saved `.ochx` and `.och` timelines include the complete source and fields, so loading them never requires fetching code from the catalogue.

This is the same bounded interpreter used for custom time formatters, with a separate plugin API. It accepts a JavaScript/TypeScript-like subset, rather than full JavaScript. Host components support `text`, `multiline`, `color`, `shape`, `size`, `image-url`, `links`, and `stack` fields. They automatically participate in the moment editor and stack editor; recursive stacks are excluded. Scripts return rendering effects; they cannot construct arbitrary HTML, add arbitrary DOM components, execute code, or mutate metadata/time. Expanding those host components requires an application release.

Example manifest:

```json
{
  "apiVersion": 1,
  "id": "status-symbols",
  "version": 1,
  "name": "Status symbols",
  "description": "A status field controls shape and color.",
  "fields": [{ "kind": "text", "metadataKey": "status", "label": "Status" }]
}
```

Source (included as `source` in exported/published definitions):

```ts
function render(moment: string, api: PluginAPI): string {
  const status = api.lower(api.get('status'));
  return status === 'blocked'
    ? api.merge(api.shape('diamond'), api.color('#bc6663'))
    : api.merge(api.shape('circle'), api.color('#5f8b67'));
}
```

`moment` is reserved and currently an empty string. Use the explicit API:

| Method                                                                 | Effect                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `get(key)`                                                             | Read a declared field, title, or description as bounded text. Missing/structured values become empty text. |
| `shape(name)`                                                          | Choose a supported shape. Unrecognized/empty input contributes no effect.                                  |
| `color(hex)`                                                           | Choose a six-digit hex color. Unrecognized/empty input contributes no effect.                              |
| `icon(key)`                                                            | Use the URL from a declared `image-url` field.                                                             |
| `card()`                                                               | Enable the title/notes/image hover card.                                                                   |
| `none()`                                                               | Contribute no marker effects.                                                                              |
| `merge(a, b)`                                                          | Combine effect strings; the second overrides matching properties.                                          |
| `trim`, `upper`, `lower`, `startsWith`, `endsWith`, `slice`, `replace` | Bounded string operations, as in the formatter language.                                                   |

Scripts support `const` locals, ternary conditionals, string concatenation and comparisons. No loops, imports, globals, property access, arbitrary function calls, `eval`, `Function`, filesystem, session, DOM, or network access exist. Source is capped at 16,384 characters, AST nodes at 1,024, evaluation at 4,096 steps/128 API calls, individual text at 2,048 characters, and cumulative text allocation at 32,768 characters. Compiler caching is bounded. A runtime error discards that script's effects and preserves host rendering; other plugins continue. Later enabled plugins overwrite earlier matching effects. Missing effects leave earlier ones intact.

Image effects must match a URL explicitly entered in a declared image field, even if a script returns a literal effect string. A script cannot build an image URL from private notes to transmit them. Host images use anonymous HTTPS requests with no referrer. Enabling an image field still permits fetching the configured URL; review a plugin's fields and source before using it.

## Community publication

**Publish to library** requires an authenticated account and publicly publishes the definition, not the timeline or its metadata. The server checks session/CSRF or the desktop bearer, rate limits publication, validates syntax without executing source, and stores immutable versions in `oc_plugins`. A published definition requires a script. The JSON request limit is 32 KiB, and each account may publish at most 200 versions; the quota is enforced under a transaction lock.

`POST /api/plugins/publish` accepts a full manifest including `source`. It returns HTTP 201 with the published manifest, whose ID is `u-<account UUID without hyphens>-<slug>`. The initial slug is limited to 29 characters. Keep the returned ID when releasing later versions; increment `version`. Reusing a version returns 409. Another account cannot overwrite this namespace; built-in/operator IDs are also protected. Search lists the newest version, while old detail URLs remain available. Installed snapshots never update automatically.

Community plugins are discoverable immediately, with no moderation queue in this version. Publishing asks for a quick human check, except for administrators (see [human verification](authentication.md#human-verification)). Capabilities remain restricted even after publication; the library does not distribute arbitrary executable JavaScript. Run the server migration before using the community catalogue. Tauri uses the same authoring, publication and discovery APIs through its configured server.

## Official definitions and offline portability

Moment icons, stacks, colors, shapes and focus-on-hover are official plugins. The UI distinguishes exact bundled official definitions from custom definitions. Editing an official definition produces a custom variant; changing only its ID to impersonate an official plugin does not make it official. Community publications use user-specific namespaces.

The complete manifest, script, version, order and enabled state live inside the timeline's exports/database snapshots. Offline users can install custom code through the same source/manifest editor or import a `.plugin.json` file. They can enable, disable and reorder saved plugins without a server. The interpreter and host components are baked into the HTML.

The `assets` document field maps original HTTPS image URLs to embedded raster data. Connected JSON export, SQLite save/export, server save and pull-request submission attempt to capture icon copies using anonymous CORS-readable images. Images are rasterized to at most 1024 pixels per side, with 2 MiB per image and 8 MiB total, at most 200 stored copies. Automatic capture attempts at most 64 missing images with a bounded timeout. Hosts denying anonymous CORS access or unreachable/oversized images cannot be copied; their original URL remains editable and the offline inspector explains that no embedded copy exists. Animated images are represented by a static raster copy offline. Embedded source copies are pruned on export to referenced image URLs.

The offline build resolves icons only through those embedded assets and runs the same color, shape, stack, hover and custom-script behavior. Its content policy still denies all connections and external image resources. It does not open external image links. Browser CI imports and runs custom scripts and official plugins from an `.ochx` snapshot while monitoring for network attempts.

Moment shapes version 2 adds **Moment size**: small (16 px), medium (22 px, the default), or large (32 px). The selected size is stored as `shapeSize` in moment or stack-entry metadata and travels with all timeline file formats and server saves. Camera UI scaling applies on top of these sizes. Summary groups retain their count-based sizes. Older pinned version 1 definitions remain supported; reinstall Moment shapes from the catalogue to use version 2.

Custom plugins can declare a `size` field and return `api.size(api.get("fieldKey"))`, or use `api.size("small")`, `api.size("medium")`, and `api.size("large")`. Combine it with other effects using `api.merge`. Sizes are bounded host settings; arbitrary CSS and dimensions are unavailable. A later plugin may override an earlier size effect.

## Sources

The official **Sources** plugin (`moment-sources`, version 1) reads the existing
`sources` metadata array as a list of HTTPS URL strings. The inspector displays
clickable references and, for editors, a text area with one URL per line. Valid
edits use the existing debounced moment editing flow. Invalid links do not replace
saved references. Links open in a separate tab with no opener or referrer; the
plugin never fetches source pages automatically or renders their HTML.

This component is also available to custom plugins as a `links` field. It supports
at most 100 links, each at most 4,096 characters, with no embedded credentials.
Stack entries receive the same editor. Manifests and source arrays persist through
`.ochx`, `.och`, PostgreSQL and standalone HTML use. New seed timelines include the
plugin; existing seed timelines receive it with the one-time seed enrichment on
reseeding. Other timelines can install **Sources** through **Plugins → Add plugin**,
preserving all existing metadata.

## Dating and historical annotations

Three additional official plugins use the existing seed metadata keys and the same
safe host fields as custom plugins:

| Plugin           | Metadata                                | Purpose                                                                                                                           |
| ---------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dating context   | `datePrecision`, `coordinateConvention` | Explain whether a coordinate represents a day marker or an approximate estimate and how its units/epoch are interpreted.          |
| Historical dates | `historicalDate`, `calendar`            | Keep the original source date/calendar alongside the timeline's chosen display, including Julian dates shown on a Gregorian axis. |
| Geological ages  | `approximateAgeYears`                   | Preserve the approximate age in years before reference year 2000 CE.                                                              |

These annotations are editable text and do not change or recompute moment time.
They make no automatic calendar-conversion or scientific-precision claims. Each
plugin includes its restricted script and fields in saved timelines, works offline,
and applies to stack entries. Combine them with Sources for provenance and Dating
context for the convention behind a geological age. Editing coordinate annotations
does not change any underlying coordinate; edit the moment time separately.

## Rich text notes and hover previews

Install **Rich text notes** (`rich-text-notes`, version 1) to replace moment and
stack-entry Notes with a visual editor. Its toolbar supports bold, italic,
headings, paragraphs, bulleted/numbered lists and HTTPS links. **Edit Markdown**
switches to the source textarea. Notes remain plain Markdown in `description`;
they use the usual debounced continuous editing and timeline-level save/export.
Enabling/disabling the plugin does not rewrite notes. The manifest, including
`"notes": { "kind": "markdown" }`, is saved in `.ochx`, `.och` and PostgreSQL,
and runs in the standalone HTML. Custom definitions may declare this same host
capability, without access to HTML, editor internals or executable handlers.

The viewer supports headings (levels 1–3), bold/italic emphasis, inline and fenced
code, flat lists, blockquotes and explicit HTTPS links. This is a restricted
Markdown vocabulary, rather than a complete CommonMark editor. Raw HTML is text;
images and embeds are not loaded. Rich clipboard content is pasted as plain
text, and dropped HTML/files are rejected. Links reject credentials and executable
schemes; clicking an outbound link opens a separate tab without an opener/referrer.
Use the source mode for unsupported Markdown constructs; merely viewing or
switching modes leaves the original source unchanged, while visual edits normalize
the supported formatting into Markdown.

**Focus on hover** now wraps the full moment title and lists valid `sources` links
below the notes. These references work with the existing Sources metadata, even
when its inspector plugin is not enabled. Notes render as Markdown when Rich text
notes is enabled and stay literal text otherwise. Notes are a short summary; long
cards scroll so titles and source links remain available. No source pages are
fetched while browsing. Server/native viewport metadata limits still apply;
oversized metadata remains available through moment selection.

### Expand on hover

The official **Expand on hover** plugin fans out summaries of two to five moments
into animated radial markers. Each member retains its color, shape and icon, and
uses the normal hover card and moment inspector. The summary's ordinary click
behavior remains available. Larger summaries stay collapsed. Keyboard users can
focus a summary and press Down to enter the fan; Escape closes it. Reduced motion
removes the movement animation.

Only one fan is retained. Members are fetched on demand with a five-event page
limit, without putting them into the normal viewport cache. Leaving the fan,
disabling the plugin, changing the viewport, or refreshing its source revision
aborts the request and releases the transient nodes and data. Stale or paginated
responses do not produce partial fans. Comparison sources and native SQLite use
their existing bounded event queries. Custom scripts can return `api.expand()`;
the optional manifest component is `"summary": {"kind": "radial"}`. The host
always enforces the five-member limit and owns the DOM and animation.

## Creating and browsing definitions

Use **Plugins → Add plugin → Custom…** to paste a metadata/identity JSON definition and
its restricted JavaScript/TypeScript render source, or import a definition file. Choose
**Install on timeline** to activate it. The complete definition is retained in .ochx,
.och and saved server revisions. This path also works in the standalone offline build;
network catalogue searches and publishing require a connected application.

The catalogue defaults to **By popularity**, counting distinct public timelines with
that plugin enabled, regardless of the installed version. Private timelines do not
contribute to this public ranking. Alphabetical ordering uses the plugin name; **Newest
first** uses the first publication date, so releasing an update does not reset a plugin’s
age. Bundled definitions have no publication date and are treated as older than community
publications. Names and IDs break ties consistently. Without server storage all usage and
publication dates are unknown, so the catalogue falls back to alphabetical ordering.
