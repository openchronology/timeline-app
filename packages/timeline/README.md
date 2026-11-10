# @openchronology/timeline

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The [OpenChronology](https://timescale.info) timeline editor as one element, `<och-timeline>`, for
any web page, and for the HTML an AI chat writes into a reply or an artifact. Give it a timeline in
the `.ochx` format and it shows it: exact dates at any scale, zooming, search, tags, durations,
links between events and saved views. Readers can edit it there and **Export** the result as an
`.ochx` file, which opens at [timescale.info](https://timescale.info), in the desktop app or in the
[offline editor](https://openchronology.github.io/).

It is the offline editor, the same file as `openchronology-offline.html`, in a sandboxed frame of
its own. It makes no network requests, and the page around it is out of its reach.

## Use

```html
<script src="https://cdn.jsdelivr.net/npm/@openchronology/timeline@0.25.0/dist/timeline.js"></script>

<och-timeline mode="view" height="480">
  <script type="application/json">
    {
      "title": "Moon landings",
      "presentation": "gregorian",
      "events": [
        {
          "id": "luna9",
          "time": "-123379200/1",
          "metadata": { "title": "Luna 9 lands", "tags": ["robotic"] }
        },
        {
          "id": "apollo11",
          "time": "-14182940/1",
          "metadata": { "title": "Apollo 11 lands", "tags": ["crewed"] }
        }
      ],
      "view": { "separation": { "separations": [{ "tags": ["crewed"] }] } }
    }
  </script>
</och-timeline>
```

Pin a version in the address, as above; the element does not change under a page that names one.

| Attribute     | What it does                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode="view"` | Opens in view mode: moments and durations open in the reader. Without it the timeline opens for editing.                                                   |
| `height`      | The element's height, in pixels (`480`) or any CSS length (`70vh`). 600 pixels unless set; CSS can size it too.                                            |
| `theme`       | `light` or `dark`. Without it the element follows the reader's system.                                                                                     |
| `src`         | The address of an `.ochx` file to open, in place of one written inside the element. The page's own content security policy must let it fetch that address. |
| `title`       | The frame's name for screen readers; the timeline's title unless set.                                                                                      |

By script, `element.timeline = doc` shows another timeline (an object or JSON text), and
`element.timeline` is the one given that way. CSS custom properties `--och-border` and
`--och-radius` set its border and corners.

## Writing the timeline

The format is described in [the architecture notes](https://github.com/openchronology/timeline-app/blob/main/docs/architecture.md#json-exchange-version-1-ochx)
and the documents they link to. The element fills in what every timeline has (`"format":
"openchronology"`, `"version": 1`, an empty `description`), so in short:

- **`events`**: moments, each with a unique `id`, a `time` and `metadata` (`title`, `description`
  in Markdown, `tags`, `sources`).
- **Times** are exact rational numbers written as strings, `n/d`. With `"presentation":
"gregorian"` they are seconds since 1970-01-01 UTC, shown as dates and times (the element
  completes the setting with its defaults; a full `presentation` object works too)
  ([time display](https://github.com/openchronology/timeline-app/blob/main/docs/time-presentation.md)).
  Without it they are plain numbers, which suits years (`1969/1`), geological ages or any other
  scale.
- **`durations`**: spans from a `start` to an `end`, each a time or a moment's id
  ([durations](https://github.com/openchronology/timeline-app/blob/main/docs/durations.md)).
- **`relationships`**: links between events, such as causes and evidence
  ([relationships](https://github.com/openchronology/timeline-app/blob/main/docs/relationships.md)).
- **`view`**: what the timeline opens at, such as tracks of events by tag
  ([views](https://github.com/openchronology/timeline-app/blob/main/docs/views.md)).

Text that is not JSON is reported in place of the editor; a timeline the editor cannot read opens
empty, and the editor says what is wrong.

## Where it works

Anywhere that runs a page's scripts and lets them load from jsDelivr or unpkg, and lets a page
have frames written by its own scripts (`srcdoc`), with inline scripts in them: ordinary web pages,
documentation sites, and the artifacts, canvases and HTML previews of AI chats. A page with a
content security policy needs `cdn.jsdelivr.net` (or `unpkg.com`) in `script-src`, and
`'unsafe-inline'` or the editor's script hash too, since the frame inherits the page's policy.

The script is about 730 KB (less compressed), all of it the editor.

## License

GPL-3.0-only, as OpenChronology is. The package carries `LICENSE`, `NOTICE` and the licenses of
the libraries inside the editor (`THIRD_PARTY.txt`). The source is at
[github.com/openchronology/timeline-app](https://github.com/openchronology/timeline-app).

## Contents

| File                           | What it is for                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [`package.json`](package.json) | The npm package; its version is set from the release tag when `scripts/timeline-package.mjs --version` builds it. |
| [`src/`](src/README.md)        | The element's source.                                                                                             |

`dist/timeline.js`, `LICENSE`, `NOTICE` and `THIRD_PARTY.txt` are written by
[`scripts/timeline-package.mjs`](../../scripts/timeline-package.mjs) (`npm run build:timeline`).
