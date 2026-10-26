# Timeline plugins

Open **Plugins** beside **Time display**. The dialog lists this timeline's installed plugins, in application order. **Add plugin** opens the server catalogue with search and twelve results per page. Add, enable, disable, remove, and reorder take effect immediately in the browser's rational map. Save the timeline to persist these settings to the server or a file.

Plugins belong to a timeline, not a user account or the application as a whole. Viewers use the timeline's saved plugins but cannot change them. Installed entries contain a version-pinned manifest snapshot and an enabled flag. Order and settings survive `.ochx`, `.och`, PostgreSQL snapshots and browser drafts. A server catalogue update does not silently change an existing timeline's plugin. Upgrade explicitly: **Update to v…** in the plugin library replaces an older installed version in place. **Edit / export definition** opens the saved manifest and script; edits apply only to this timeline until published.

The standalone HTML runs saved official and custom plugins entirely locally. Create/import/edit/export definitions works there too; online catalogue discovery and publishing are hidden. It never fetches scripts or external images. Tauri uses the configured OpenChronology server (by default `https://timescale.info`) for the same catalogue; it retains installed definitions in local `.och` files. Disconnecting from the server does not discard installed plugins. External images use network access only in the connected app; embedded copies work offline.

## Moment icons

Install **Moment icons**. Its metadata field is `iconUrl`:

```json
{ "title": "Launch", "iconUrl": "https://images.example/launch.png" }
```

Single moments display circular image markers. Hover or keyboard focus enlarges a loaded icon; grouping continues to display the summary count. Selected moment details show a larger preview, a link to the original source and a URL input beneath it. Valid URL edits apply to metadata automatically. Clearing the input removes the key. Failed images leave the usual dot and show an error in the details panel.

Use public HTTPS image URLs without embedded credentials. Image requests have no referrer and use anonymous cross-origin mode. The host must permit cross-origin image access, typically with `Access-Control-Allow-Origin: *`. Cross-origin authentication cookies are not sent. Image links use `noopener noreferrer` and open a new browser tab; Tauri opens the system browser through an HTTPS-only native command. HTTP, `javascript:`, `data:`, `file:`, relative URLs and credential-bearing URLs are not loaded. URL previews debounce typing; marker images retain their DOM nodes across pan/zoom to avoid restarting image loads. Removing or disabling the plugin leaves metadata intact.

## Headings

Install **Headings** to let a moment act as a heading or marker, such as "Part One" or "Chapter 2", rather than as part of the subject matter. Its moment fields are `headingLevel` and `headingFont`:

```json
{ "title": "Part One", "headingLevel": "h1", "headingFont": "Georgia, serif" }
```

- **Appearance:** a moment with a heading level from `h1` to `h6` shows only its title, centered on the axis where its dot would be, sized by its level. There is no dot, label or stem. The title is what you click, focus and hover.
- **Font:** the default is Times New Roman (serif). The details panel offers named fonts (Georgia, Garamond, Palatino, Helvetica, the system font, Courier and cursive) and **Custom…**, which accepts any fonts installed on the viewer's device, as a comma-separated family list such as `Baskerville, serif`. Only font names are accepted, so no web font is downloaded.
- **Not a heading:** choosing **Not a heading**, or leaving the level empty, keeps the moment an ordinary one.
- **Summaries:** headings still group into summaries with other moments and count as moments there; only a heading shown on its own looks different.
- **Disabling:** disabling or removing the plugin shows headings as ordinary moments again; their metadata is kept.

The plugin's marker is `{ "kind": "heading", "metadataKey": "headingLevel" }`, and its font comes from the manifest's `font` field. Both the `heading` and `font` field kinds are available to other plugins.

## Relationship arrows

Install **Relationship arrows** to show which way a chain of [relationships](relationships.md) reads, such as from causes to their effect. Arrows are a drawing convention stored on the events: relationships themselves stay undirected and unlabeled.

Each moment or duration keeps a list of arrows under the metadata key `arrows`. An entry names the other end of one of its relationships, in the same form the `relationships` array uses, and an arrow, from this event's point of view:

```json
{
  "title": "Pump failure",
  "arrows": [
    { "target": { "moment": "flood" }, "arrow": "to" },
    { "target": { "duration": "outage" }, "arrow": "both" }
  ]
}
```

| `arrow` | Arrowheads                                   |
| ------- | -------------------------------------------- |
| `to`    | At the other end: this event → the other.    |
| `from`  | At this event's end: the other → this event. |
| `both`  | At both ends.                                |
| `none`  | None from this entry (the same as no entry). |

- **Union:** an arc shows the arrowheads either of its ends asks for. If Pump failure says "to" Flood and Flood says "to" Pump failure, the arc has both. If one says "both" and the other says "none", it also has both.
- **Editing:** the **Relationship arrows** section of moment details and the duration dialog lists the entries: the other end's name, a choice of arrow, and **×** to remove it. **Add an arrow…** lists the event's relationships that have no entry yet; choosing one adds it with an arrow toward that end. When the other end's own arrows add arrowheads to the same arc, the entry says so.
- **Gone relationships:** an entry whose relationship was removed, or whose target doesn't exist, draws nothing. It is outlined in red with "No relationship with this entity", and stays as stored until removed with **×**. Unreadable entries (anything but a target and one of the four arrows) are drawn as nothing, shown as unreadable, and also kept. A value that isn't a list is shown but not edited here; edit it under **Additional metadata**.
- **Look:** an arrowhead sits on its arc just short of the end, so the marker there doesn't cover it, and points into the end along the arc: at a moment's time, or at a duration's start, where the arc ends. It takes the arc's color, highlights with it when the arc is hovered, and grows and shrinks with the content as the timeline is scaled (**A−** and **A+**).
- **Edges of the view:** an end beyond the view shows no arrowhead.
- **Hover text:** with an arrowhead at exactly one end, the arc's hover text reads toward it, such as "Pump failure → Flood"; otherwise it reads "A ↔ B" as before.
- **Not analyzed:** the app doesn't follow arrows. **Separate related** and **Separate all connected** treat relationships as undirected, there are no labels (such as "causes" or "barrier failed"), and separated tracks draw no arcs.
- **Stack entries** aren't relationship endpoints, so they have no arrows.
- **Disabling:** disabling or removing the plugin draws arcs as before and keeps every entry.
- **Cost:** for each arc in the window (at most 256), only its two ends' metadata is read, from what the view already has, never the whole timeline. In the browser that is the timeline in memory. On a server or desktop timeline it is the overview: moments shown on their own, whose plugin fields are sent with them when they fit in 2,048 characters, and duration bands, which carry lists of at most 1,024 characters. So an end hidden in a summary, or beyond the view, adds nothing until it shows.

The manifest's field is `{ "kind": "relationship-arrows", "metadataKey": "arrows", "label": "Relationship arrows" }`. The `relationship-arrows` field kind is available to other plugins; a plugin that has one and no `targets` applies to moments and durations.

## Duration backgrounds

Install **Duration backgrounds** to show an image behind the timeline wherever a [duration](durations.md) lies. Its duration field is `backgroundUrl`, a public HTTPS image URL, as for moment icons:

```json
{ "title": "The Bronze Age", "backgroundUrl": "https://images.example/bronze.jpg" }
```

- **Size:** the image is scaled, keeping its aspect ratio, until it covers the whole timeline, and it is centered vertically. It follows the timeline's size as the window is resized or a phone is turned.
- **Placement:** the background covers the part of the duration in view. Horizontally, the image is centered between the duration's start and end.
  - If an end lies beyond the view, the view's edge stands in for it.
  - If both ends lie beyond the view, the image fills the timeline.
- **Collapsed durations:** a duration too short to draw as a band is summarized, and it shows no background.
- **Narrow durations:** like the ruler's finest marks, a background fades out as its duration narrows on screen: it shows in full while the duration is at least 192 pixels wide, fades as it narrows, and is gone below 96 pixels, while its band still shows.
- **Stacking:** smaller durations show above larger ones, and all of them lie behind the timeline's axis, links and moments. An edge inside the view fades to transparency over 48 pixels, however wide the duration, so backgrounds blend into each other; an edge where the duration continues past the view does not fade.
- **Readability:** while any background shows, moment labels sit on frosted white, and the axis, links and markers carry a white halo, so they stand out from any image.
- **Address length:** duration bands carry string metadata of at most 256 characters, so a longer image address shows nothing, and the duration dialog says so.
- **Offline:** exports embed copies of background images, as for icons, so the offline edition can show them.

## Timeline background

Install **Timeline background** to show one image behind the whole timeline, beneath any duration backgrounds. It belongs to the timeline rather than to any event, so its address is set in the **Plugins** dialog, under the plugin, not in an event's details: enter a public HTTPS image URL, or clear the field to remove the image. Like any plugin change, save the timeline to keep it.

The image covers the timeline, keeping its aspect ratio, and stays put as you pan and zoom. Exports embed a copy, as for other images.

### Timeline settings

A plugin may declare up to twelve `settings`: values for the whole timeline, set in the plugin list. They are kept on the installed plugin, not in its manifest or in any event's metadata:

```json
{
  "manifest": {
    "id": "timeline-background",
    "settings": [{ "kind": "image-url", "key": "imageUrl", "label": "Background image URL" }],
    "backdrop": { "kind": "image", "setting": "imageUrl" },
    "…": "…"
  },
  "enabled": true,
  "settings": { "imageUrl": "https://images.example/sky.jpg" }
}
```

- **Kinds:** a setting is an HTTPS image address (`image-url`), a color (`color`, `#rrggbb`), a font family list (`font`, names of installed fonts separated by commas, as for heading fonts) or a text size (`text-size`, a whole percentage of the usual size from 50 to 200, saved as a string such as `"125"`).
- **Values:** a value that isn't one of its kind is refused: an address that isn't HTTPS, a color by name, or a font list with anything but font names (such as a URL). Empty values, and values for settings the manifest no longer declares, are dropped.
- **Backdrop:** `backdrop` shows an image setting's value behind the whole timeline. When several enabled plugins set one, the last one wins.
- **Theme:** `theme` maps parts of the timeline's look to settings; see [Timeline theme](#timeline-theme).

## Timeline theme

Install **Timeline theme** to choose the timeline's colors, fonts and text sizes. Like the timeline background, it belongs to the whole timeline, so it's set in the **Plugins** dialog under the plugin:

| Setting          | What it changes                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Label color      | Event labels and headings; their dates take a lighter shade.                                                                   |
| Label font       | Event labels.                                                                                                                  |
| Label size       | Event labels and their dates, from 75% to 200% of the usual size.                                                              |
| Measure color    | The axis, tick marks, tick labels, guide lines, stems and relationship arcs.                                                   |
| Measure font     | Tick labels.                                                                                                                   |
| Measure size     | Tick labels, from 75% to 200% of the usual size.                                                                               |
| Halo color       | The glow and frosted backing that keep text and lines readable over images and background colors.                              |
| Marker color     | Moment and summary markers (summaries take a darker shade). A color chosen on a moment still wins.                             |
| Duration color   | Duration bands (with dark or light text to suit) and collapsed durations on the axis. A color chosen on a duration still wins. |
| Background color | The timeline's background, beneath any images. The halo shows over it, as over an image.                                       |

Colors are picked with the browser's color picker; **Use default** clears one. Fonts are typed or picked from the suggestions, and only fonts installed on the viewer's device are used: no web font is downloaded. Sizes are picked from a list; **Default (100%)** clears one. Anything left blank keeps the usual look.

Larger labels keep their room: rows of labels move apart and away from the axis, their stems lengthen to reach them, moments group into summaries sooner so labels sharing a row don't run into each other, and rows that reach past the timeline can be panned into view. Larger tick labels space the ticks further apart. Timelines that installed the first version of the theme (without sizes) keep working. **Update to v2** beside it in the **Plugin library** adds the sizes in place, keeping its colors and fonts; the library offers this for any plugin it has a newer version of.

A plugin's `theme` names the setting for each part it sets: `text`, `textFont`, `textSize`, `measure`, `measureFont`, `measureSize`, `halo`, `marker`, `duration` and `background`. Font parts read `font` settings, size parts read `text-size` settings, and the rest read `color` settings. When several enabled plugins set the same part, the last one wins.

## UI capability API v1

Plugins combine **JSON host component declarations** and an optional restricted script. Their source is interpreted locally, without arbitrary JavaScript execution, HTML, CSS, imports, event handlers or application API endpoints. They cannot obtain account credentials, access the DOM, call the server, or execute arbitrary code. The host is responsible for rendering, validating URLs, field input and lifecycle cleanup. API v1 supports:

- Inspector fields: `text`, `multiline`, `image-url`, `stack`, `shape`, `size`, `color`, `links`, `heading`, `font`, `toggle` and `relationship-arrows`, each bound to one top-level moment metadata key. A `relationship-arrows` field draws arrowheads on relationship arcs ([Relationship arrows](#relationship-arrows)).
- Marker effects: an `image`, `color`, `shape`, `heading` or `outline` bound to metadata, plus hover cards and restricted scripted effects.
- Ordering: later enabled definitions replace earlier inspector fields with the same key; later marker hooks with a valid, populated image URL take precedence. Empty or invalid URLs fall back to the preceding valid marker effect, or the normal dot.
- Targets: an optional `targets` array of `"moments"` and/or `"durations"`. Without it, color and outline markers, hover cards and relationship arrows apply to moments and [durations](durations.md); every other plugin applies to moments only. Durations use text, notes, color, link, image URL, toggle and relationship-arrows fields, color and outline markers, hover cards and backgrounds (`background.kind: "image"`, which applies to durations only); stacks, shapes, sizes, icons and summary expansion are moment-only.

- Derived metadata: `derive` rules that work out values from the metadata an entity already has, for the other plugins to read ([derived metadata](#derived-metadata)).
- Added shapes: an optional `shapes` array of the shapes added after the first twelve that the plugin draws, currently only `"ellipse"`. A shape field, shape marker or `api.shape(...)` of a plugin that doesn't list one treats it as unknown, as before it existed; the field's selector offers the plugin's shapes.

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

`id` is a lowercase ASCII slug; `version` is a positive integer. Optional `source` contains a restricted `render` function. Older declarative snapshots remain supported. The existing built-ins publish scripted version 2 and retain declarative version 1 detail URLs; the new shape plugin starts at version 1. API version 1 permits eight fields per manifest and 32 installed plugins per timeline, with at most 128 KiB of UTF-8 serialized configuration. Unknown properties and unsupported components are rejected. Metadata keys are bounded ASCII identifiers; `title`, `description`, prototype-related keys and nested paths are unavailable to plugin fields. Field text is rendered as text, never HTML. Host components do not modify moment times or timeline bounds.

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

Read-only server overview queries return the requested plugin metadata for individual markers in the same bounded query. They do not download the full timeline or issue a separate request for each icon. Group summaries do not include arbitrary moment metadata.

## Derived metadata

A plugin can work out metadata from what an event (a moment or a duration) already has, for the other plugins to read, like middleware between the saved metadata and the plugins that draw it ([#122](https://github.com/openchronology/timeline-app/issues/122)). A rule sets one key from the first of its sources that has a value:

```json
{
  "derive": [
    {
      "metadataKey": "color",
      "from": [{ "tag": "severity" }, { "path": "journald.severity" }],
      "map": { "err": "#bc6663", "warning": "#d6ad4c" }
    }
  ]
}
```

- **Sources:** `{ "tag": "severity" }` reads the value of a tag such as `severity:err` (here `err`). `{ "path": "journald.severity" }` reads a text, number or true/false at one to four keys joined by dots. Sources are tried in order.
- **Map:** with a `map`, a source's value becomes the mapped text; a value the map doesn't name passes to the next source. Without one, the value is used as it is.
- **What the others see:** the key is set before any plugin draws, so the color, shape, icon and heading markers, hover cards and scripts all read it as if it were saved, whatever their order. A script reads a key its own plugin derives with `api.get`. Rules apply in plugin order, and a later rule can read what an earlier one set.
- **Never over a saved value:** a rule sets its key only where the entity has none, saved or derived earlier. A color chosen for a moment wins over one derived for it.
- **Never saved:** derived values exist only as the timeline is drawn, in the browser and the desktop app. They are not written into moments, files, revisions or the server, and the details panel and **Additional metadata** show only what is saved. Disabling the plugin removes them.
- **Viewers:** a server's overview sends what the rules read and nothing more of it (the tags with that prefix, the values at those paths), so read-only viewers see the same. Duration bands carry their tags but not nested metadata, so durations derive from tags.
- **Limits:** up to eight rules per plugin, 16 sources per rule and 64 mapped values of up to 256 characters each. A rule can't set `title`, `description` or `tags`. Paths don't cross arrays and have no wildcards.

## Log severity colors

Install **Log severity colors** (`log-severity-colors`) to color [imported logs](log-import.md), [syslog](syslog.md) and [journald](journald.md) entries by severity:

| Severity                 | Color                         |
| ------------------------ | ----------------------------- |
| `emerg`, `alert`, `crit` | Dark red (`#8f3f3c`)          |
| `err`                    | Bad, red (`#bc6663`)          |
| `warning`                | Warning, yellow (`#d6ad4c`)   |
| `notice`                 | Information, blue (`#7aadc4`) |
| `info`                   | The default                   |
| `debug`                  | Disabled, gray (`#9aa49f`)    |

It reads the `severity:<level>` tag every log format adds, and otherwise the severity each format keeps in its own metadata (`syslog.severity`, `journald.severity`, `nginx-combined.severity` and so on), so access logs, which tag no severity, are colored too. It derives the `color` that **Moment colors** reads, and draws that color itself, so it works with or without Moment colors. A color chosen for an entry still wins, and nothing is saved. Durations made from log entries are colored as well.

To color by other values, copy it with **Edit / export definition** and change its sources or map: for example `{ "tag": "status" }` with a map from `5xx` and `4xx` to colors for an access log's status classes.

## Library API and publishing

The main server supplies a public searchable library. Built-ins remain available without a database; community publications are stored in PostgreSQL. The official (built-in) plugins also ship with every build: the offline HTML file and a desktop app with no server search them locally, with no request, using the same rules (`searchPluginLibrary`), and a server that cannot be reached or fails (or a static site with none) falls back to them. Community plugins need the server's library:

- `GET /api/plugins?search=icons&page=1&limit=12`
- `POST /api/plugins/search` with `{"search":"icons","page":1,"limit":12}`. Desktop clients use this route to keep their native path allowlist free of arbitrary query strings.
- `GET /api/plugins/moment-icons/1` retrieves a pinned manifest.

Search returns `{apiVersion, plugins, page, limit, total, pages}`. Search is case-insensitive across names, descriptions and IDs. Pages start at one; limits are 1–50. Search is capped at 200 characters, POST bodies at 4 KiB. Search lists the newest published version of each ID; older version URLs remain available. Manifests are validated when the server starts and again on client installation. The client verifies imported timeline snapshots too. See [where plugins run](#where-plugins-run) for when scripts are compiled.

**Moment icons**, **Moment stacks**, **Moment colors**, **Moment shapes**, and **Focus on hover** ship in the built-in library. Operators can publish additional reviewed manifests by setting `PLUGIN_LIBRARY` to a JSON file containing an array of definitions. These are combined with the built-in definitions; duplicate ID/version pairs fail startup. Deploy the file alongside the server or mount it read-only into its container. Restarting publishes the new catalogue; existing timelines remain pinned to their saved snapshots. Signed-in users can also publish restricted scripted definitions through the editor or `POST /api/plugins/publish`.

For example, duplicate the sample, [`deploy/plugins.example.json`](../deploy/plugins.example.json), with a new ID and a `text` or `multiline` field to publish an additional metadata editor. Increment its version for a subsequent release, and keep old definitions in the library if you want their detail URLs to remain available.

Run `npm run migrate`, `pnpm run migrate` or `yarn run migrate` when upgrading the PostgreSQL server. The idempotent migration adds the `oc_plugins` community library table, the `plugins` settings column and the metadata-aware overview function; the original overview result shape remains available for existing callers. `.och` files gain an optional settings table without changing the file extension or rational index format, and older files remain readable.

A purely static web deployment has no catalogue API: run the Node server to offer plugin discovery. Saved plugin snapshots still render in the web app without a catalogue connection. Browser CI covers discovery, pagination, activation, URL editing, disabling, removal, reimport and standalone HTML isolation. Native, PostgreSQL, API and JSON tests cover persistence, sequence, validation and bounds.

## Where plugins run

Plugins run only in the browser (and the desktop app). The server never runs plugin code ([#157](https://github.com/openchronology/timeline-app/issues/157)):

- **The server compiles scripts it is given, and nothing more.** That refuses a plugin whose script doesn't compile: one being published, or new to a timeline that's created or saved, or to a pull request. It compiles them in worker threads that hold only the compiler (`server/plugin-sandbox.mjs`). The workers have no environment and are limited to 64 MiB of memory and 2 s per script. A worker past a limit is stopped and replaced, and the request's thread is unaffected. Each distinct script is compiled once per process. The built-in plugins' scripts, and those a timeline already has, aren't compiled again, so most saves compile nothing.
- **Each plugin validates its own metadata.** The server stores a moment's metadata as given, within its generic limits (JSON, sizes, IDs, times, and the core's own title, notes and tags). Neither the server nor the browser's core checks plugins' fields on their behalf. Each field kind reads whatever it finds: a value of the wrong shape is ignored or shown as unreadable, and never stops a timeline from loading. Where a plugin offers an editor, the editor checks what it writes.
- **Changing a timeline's plugins is a settings change.** It saves in place, like any other setting, with no moment revalidated and no index rebuilt.
- **Overviews include the fields the plugins declare.** The server projects a moment's metadata to those fields, selecting fields only and running no plugin code.

## Moment stacks

Install **Moment stacks** from the catalogue to enable cards inside a parent moment. Each entry has a stable ID and metadata (title, notes, additional JSON, and the timeline's other active plugin fields). Entries inherit the parent's exact time; they have no independent time or main-axis marker and do not increase point counts or grouping totals. Change the parent time to move the whole stack.

Use **Add entry to stack** at the bottom, drag a card's handle onto another card to reorder (including touch), or use its up/down buttons. **Delete** requires confirmation. Valid changes apply to the local timeline after a short debounce; Undo restores the prior moment state. Save to server or export acts on the whole timeline. Read-only viewers can inspect cards but cannot modify them.

The default metadata shape is `stack: [{id: "entry-id", metadata: {title: "Title", description: "Notes", iconUrl: "https://…"}}]`. Order is the array order. There is no fixed stack row count; existing document and upload size limits still apply. Stack entries have no time fields or stacks of their own; stack editors are excluded from child cards. The stack reads whatever metadata holds: entries that aren't an ID and metadata, repeat an ID, have a non-text title or notes, or hold a stack of their own are unreadable, as is a value that isn't a list. Readable entries are shown. A stack with unreadable entries is shown read-only, with a note, so editing never drops them; it can still be edited as JSON under **Additional metadata**. The stack editor refuses what it can't read. `.ochx`, `.och`, and PostgreSQL preserve all entry metadata and order. Disabling or removing a plugin preserves stored stack data; the standalone HTML runs the saved stack UI locally too.

Stack entries also appear as branches at their parent's horizontal time. Above-axis captions branch upward; below-axis captions branch downward. Each entry receives a dot and, if named, its title, with other active marker plugins applied (including icons). Selecting a branch dot opens the parent editor and scrolls to that entry. Grouped parent moments hide their branches until zoom separates the parents.

Drag the timeline in either dimension. Alt-scroll or Up/Down on the focused timeline pans vertically; normal wheel/pinch still zooms time, and Shift-scroll pans horizontally. **Center axis** resets only vertical position; **Fit all** recenters it while fitting time. Vertical position is a camera setting, not stored moment data. Only branch rows near the viewport receive DOM nodes. Vertical-only navigation reuses the existing frame and does not requery PostgreSQL. Server overview metadata includes the enabled stack fields so shared, read-only timelines show the same branches.

## Colors and continuous moment editing

**Moment colors** adds Default, Good (green), Warning (yellow), Bad (red), Information (light blue), Disabled (gray), Important (purple), and In progress (orange) swatches, plus the browser's native color picker. The default swatches use a muted palette. Colors are six-digit hex strings in `metadata.color`; Default removes the override. Color hooks and image hooks compose: colors fill dots behind their icons; white borders remain intact, including stack entries. Later enabled color plugins with a valid color override earlier colors; disabling a plugin retains its metadata. Semantic names are presentation choices and do not change permissions or behavior. Manifests can use a `color` field and a `{kind: "color", metadataKey: "color"}` marker effect. Arbitrary CSS is rejected.

With an active stack plugin, a parent or stack-entry context menu offers **Add entry to stack**, appending to the parent stack and focusing its new card. Stack-entry context-menu deletion targets the child and still requires confirmation.

Moment editing applies valid changes to the browser rational map after 250 ms, including title, notes, exact time, additional JSON, plugin fields, and stack additions/deletions/order. Those changes show at once; **Save** keeps them, and **Cancel** or closing the details puts the moment back. Incomplete parser/JSON/URL input keeps the last valid version and shows a validation message. Switching moments, leaving a field, exporting, or saving the timeline flushes pending valid edits. A new moment joins the timeline when it is saved. Undo coalesces edits during one inspector session. Moment edits are never written to the server automatically: **Save to server** remains a snapshot action for the complete timeline, and leaving or reloading the page with edits it has not saved asks first. (Time display settings are the exception: they are [saved when chosen](time-presentation.md).) `.och` saving and `.ochx` export likewise include the current complete timeline.

Moment titles are optional. Empty, missing, or whitespace-only titles leave the dot visible but suppress its timeline caption and time label. Named main-axis moments show their title and time; stack captions show only their title because time is inherited from their parent. Group summary counts remain visible. Titles and exact time can always be inspected by selecting a dot. **Clear selection** appears with an active time selection, flushes pending valid edits, and clears the cursor and inspector selection without deleting a moment. The yellow cursor paints above caption backgrounds so nearby labels cannot mask it.

## Content scaling and Focus on hover

The **A−** and **A＋** buttons beside the zoom buttons change presentation size, from 20% to 300%: dots, icons, captions, ruler labels, and vertical stack spacing scale together, around the middle of the stage. Ctrl-scroll does the same, anchored at the pointer. Exact time values and horizontal viewport bounds do not change, and resizing reuses the current data frame. **Center axis** recenters the ruler at the current size; **Fit all** restores normal size and fits time. Touch gestures never resize: two fingers hold the timeline. The times under them stay under them horizontally, so spreading or pinching them apart sideways zooms time, and the contents follow their midpoint up and down. Fingers less than 40 pixels apart horizontally when the second lands can't hold a span of time, so they pan instead. Directions are in the current screen layout, so rotating the device needs no special handling; a rotation during a gesture restarts it from the new layout. Camera size is not stored in moment metadata or exported files.

Install **Focus on hover** to expand a single moment or stack entry into an animated preview card on mouse hover or keyboard focus. The card shows its title, up to four lines of notes (a bounded plain-text excerpt), and the icon image above the title when Moment icons is active. Colors accent the card border while dots retain white borders. Click the card to open the normal inspector; Escape closes the preview. Reduced-motion preferences disable the morph transition. Group summary dots retain their count view. The declarative capability is `hover: {kind: "card"}`; it grants no HTML, JavaScript, network or DOM authority to a manifest. Shared overview projection includes a bounded notes excerpt so viewing does not issue per-moment requests. Offline HTML runs these saved capabilities without contacting the catalogue.

## Moment shapes

Install **Moment shapes** to add a shape selector to each moment and stack entry. The `shape` metadata field accepts `circle`, `diamond`, `square`, `triangle`, `pentagon`, `hexagon`, `octagon`, `star`, `terminator`, `process`, `document`, `parallelogram`, and, from version 3, `ellipse`. SVG outlines retain a white border with the color and icon plugins. Group summaries remain circles, since they represent multiple moments with potentially different shapes.

Moment shapes version 3 adds **ellipse**: a horizontal oval, wider than tall, for the conditions of an Events and Causal Factors chart. It is as wide as the moment's size and about three-fifths as tall, and an icon inside it is cropped to the oval, as in the other shapes. Version 3's manifest lists it as `"shapes": ["ellipse"]`. Versions 1 and 2 remain supported and unchanged: a timeline pinned to one of them treats a stored `ellipse` as an unknown shape, drawing a circle and leaving the stored value as it is, until Moment shapes is reinstalled from the catalogue.

## Presumptive outline

Install **Presumptive outline** (`presumptive-outline`, version 1) to mark moments, stack entries and durations as presumptive: not yet confirmed by evidence. Events and causal factors charts draw presumptive events and conditions with dashed outlines, and so does the timeline ([#325](https://github.com/openchronology/timeline-app/issues/325)). Its field is a checkbox, **Presumptive (unconfirmed)**, stored as `presumptive`:

```json
{ "title": "Valve left open", "presumptive": true }
```

- **Checkbox:** checking it stores `true`; unchecking it removes the key. A stored `true`, or the text `"true"`, reads as checked; any other value reads as unchecked and is kept until the box is changed.
- **Moments and stack entries:** the marker's outline is dashed, whatever its shape, color or icon: dark dashes over its white border, so they show on light and dark backgrounds and against any marker color. Every shape of [Moment shapes](#moment-shapes) is dashed along its own outline.
- **Durations:** the band has a dashed border, as does a collapsed duration on the axis.
- **Summaries:** group summaries, and a band standing for several durations, stay as they are, since their members may differ. Headings stay as they are too.
- **Reading:** the details panel shows the checkbox (read-only for viewers), the reader shows a **Presumptive (unconfirmed)** flag on the moment, duration or stack entry, and the hover card of **Focus on hover** has a dashed border.
- **Disabling:** disabling or removing the plugin draws everything solid again; the metadata is kept.

The plugin's marker is `{ "kind": "outline", "metadataKey": "presumptive" }`: dashed while that key's toggle is on. Both the `toggle` field kind and the `outline` marker are available to other plugins, and a script can return `api.outline("dashed")` (or `"solid"`). Without `targets`, an outline marker applies to moments and durations, like a color marker. Overviews carry a toggle that is on (`true`) along with text fields, so shared and read-only timelines, the desktop app and duration bands show the same outlines.

## Authoring scripts

Open **Plugins → Create / import plugin**. The editor starts with a working status example. This works in the single-file offline build too. The JSON editor defines the identity and host input components; the source editor defines rendering behavior. **Install on timeline** applies it immediately, replacing the same ID in place. Definitions can also be imported/exported as `.plugin.json` files. Saved `.ochx` and `.och` timelines include the complete source and fields, so loading them never requires fetching code from the catalogue.

This is the same bounded interpreter used for custom time formatters, with a separate plugin API. It accepts a JavaScript/TypeScript-like subset, rather than full JavaScript. Host components support `text`, `multiline`, `color`, `shape`, `size`, `image-url`, `links`, `toggle`, and `stack` fields. They automatically participate in the moment editor and stack editor; recursive stacks are excluded. Scripts return rendering effects; they cannot construct arbitrary HTML, add arbitrary DOM components, execute code, or mutate metadata/time. Expanding those host components requires an application release.

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
| `outline(style)`                                                       | Outline the marker or band `dashed` or `solid`. Unrecognized/empty input contributes no effect.            |
| `icon(key)`                                                            | Use the URL from a declared `image-url` field.                                                             |
| `card()`                                                               | Enable the title/notes/image hover card.                                                                   |
| `none()`                                                               | Contribute no marker effects.                                                                              |
| `merge(a, b)`                                                          | Combine effect strings; the second overrides matching properties.                                          |
| `trim`, `upper`, `lower`, `startsWith`, `endsWith`, `slice`, `replace` | Bounded string operations, as in the formatter language.                                                   |

Scripts support `const` locals, ternary conditionals, string concatenation and comparisons. No loops, imports, globals, property access, arbitrary function calls, `eval`, `Function`, filesystem, session, DOM, or network access exist. Source is capped at 16,384 characters, AST nodes at 1,024, evaluation at 4,096 steps/128 API calls, individual text at 2,048 characters, and cumulative text allocation at 32,768 characters. Compiler caching is bounded. A runtime error discards that script's effects and preserves host rendering; other plugins continue. Later enabled plugins overwrite earlier matching effects. Missing effects leave earlier ones intact.

Image effects must match a URL explicitly entered in a declared image field, even if a script returns a literal effect string. A script cannot build an image URL from private notes to transmit them. Host images use anonymous HTTPS requests with no referrer. Enabling an image field still permits fetching the configured URL; review a plugin's fields and source before using it.

## Plugin suites

A suite is a named package of plugins that are added to a timeline together. In **Plugins**, choose **Add suite** to browse suites, or **Create suite** to package this timeline's plugins.

Two official suites are included in every build, so they are available offline and on a desktop without a server:

- **Causal factor analysis**: Moment stacks, Moment shapes, Moment colors, Presumptive outline and Relationship arrows, to stack contributing factors on a moment, tell kinds of factor apart, draw conditions as ellipses and unconfirmed items dashed, and show cause and effect with arrows. Version 2 added the last two plugins and Moment shapes 3. Version 1 (Moment stacks, Moment shapes 2 and Moment colors) is still served and recognized as official. Adding version 2 to a timeline that already has version 1's plugins adds the two new ones and keeps its installed Moment shapes, as adding a suite never changes an installed plugin; reinstall Moment shapes from the catalogue to draw ellipses.
- **History education**: Moment icons, Duration backgrounds, Expand on hover, Rich text notes and Headings.

**Adding a suite** appends the plugins of the suite that the timeline does not have yet, enabled, in the suite's order. A plugin the timeline already has stays as it is, with its version and whether it is enabled, so adding a suite never changes an installed plugin. A timeline still holds at most 32 plugins. Save the timeline to keep the result, as with any plugin change.

**Creating a suite** takes a name, a description, a version and a choice of the timeline's plugins. A suite carries each plugin's full definition, custom plugins included, so it installs the same anywhere. You can then:

- **Export suite file** downloads a `.suite.json` file. **Import suite file…** in Add suite adds one to any timeline, also offline.
- **Publish to library** (signed in) makes the suite public in the server's library, with the same rules as publishing a plugin:
  - Its ID is namespaced as `u-<account>-<slug>`, and versions are immutable; keep publishing with the returned ID and a higher version.
  - Each account may publish 200 suite versions, and published suites count toward its storage.
  - Publishing asks for a quick human check, except for administrators.

A suite definition:

```json
{
  "apiVersion": 1,
  "id": "history-education",
  "version": 1,
  "name": "History education",
  "description": "…",
  "plugins": [{ "apiVersion": 1, "id": "moment-icons", "version": 2, "…": "…" }]
}
```

It holds one to 32 distinct plugins, and at most 128 KiB serialized. The server's API mirrors plugins:

- `GET /api/plugins/suites?search=&page=&limit=` and `POST /api/plugins/suites/search` search the newest version of each suite by name, description, ID and plugin names.
- `GET /api/plugins/suites/<id>/<version>` reads one version.
- `POST /api/plugins/suites/publish` publishes.

The website's **Plugin library** page lists matching suites above the plugins. Run the server migration before publishing suites.

## Community publication

**Publish to library** requires an authenticated account and publicly publishes the definition, not the timeline or its metadata. The server checks session/CSRF or the desktop bearer, rate limits publication, compiles the script in its sandbox without running it (see [where plugins run](#where-plugins-run)), and stores immutable versions in `oc_plugins`. A published definition requires a script. The JSON request limit is 32 KiB, and each account may publish at most 200 versions; the quota is enforced under a transaction lock.

`POST /api/plugins/publish` accepts a full manifest including `source`. It returns HTTP 201 with the published manifest, whose ID is `u-<account UUID without hyphens>-<slug>`. The initial slug is limited to 29 characters. Keep the returned ID when releasing later versions; increment `version`. Reusing a version returns 409. Another account cannot overwrite this namespace; built-in/operator IDs are also protected. Search lists the newest version, while old detail URLs remain available. Installed snapshots never update automatically.

Community plugins are discoverable immediately, with no moderation queue in this version. Publishing asks for a quick human check, except for administrators (see [human verification](authentication.md#human-verification)). Capabilities remain restricted even after publication; the library does not distribute arbitrary executable JavaScript. Run the server migration before using the community catalogue. Tauri uses the same authoring, publication and discovery APIs through its configured server.

## Official definitions and offline portability

Moment icons, stacks, colors, shapes and focus-on-hover are official plugins. The UI distinguishes exact bundled official definitions from custom definitions. Editing an official definition produces a custom variant; changing only its ID to impersonate an official plugin does not make it official. Community publications use user-specific namespaces.

The complete manifest, script, version, order and enabled state live inside the timeline's exports/database snapshots. Offline users can install custom code through the same source/manifest editor or import a `.plugin.json` file. They can enable, disable and reorder saved plugins without a server. The interpreter and host components are baked into the HTML.

The `assets` document field maps original HTTPS image URLs to embedded raster data. Connected JSON export and SQLite save/export attempt to capture icon copies using anonymous CORS-readable images. Server saves and pull requests keep links only, never copies ([images and copyright](images.md)). Images are rasterized to at most 1024 pixels per side, with 2 MiB per image and 8 MiB total, at most 200 stored copies. Automatic capture attempts at most 64 missing images with a bounded timeout. Hosts denying anonymous CORS access or unreachable/oversized images cannot be copied; their original URL remains editable and the offline inspector explains that no embedded copy exists. Animated images are represented by a static raster copy offline. Embedded source copies are pruned on export to referenced image URLs.

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

Only one fan is retained. Members are fetched on demand with a five-moment page
limit, without putting them into the normal viewport cache. Leaving the fan,
disabling the plugin, changing the viewport, or refreshing its source revision
aborts the request and releases the transient nodes and data. Stale or paginated
responses do not produce partial fans. Comparison sources and native SQLite use
their existing bounded moment queries. Custom scripts can return `api.expand()`;
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
