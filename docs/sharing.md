# Sharing timelines

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Timelines, and the moments, durations, searches and views in them, have addresses that open
them, previews for social sites and search engines, and embeds for other websites. Everything
here applies to timelines on the server; anyone can follow a link to a public timeline, while
a private one opens only for its members.

## Links

A timeline's page is `/timelines/<id>`. A fragment after it names what to look at:

| Fragment                | Opens                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `#moment/<id>`          | The timeline centred on the moment, with its details open.      |
| `#duration/<id>`        | The timeline around the duration, with its details open.        |
| `#search/<words>`       | Search, with these words and their results.                     |
| `#view/<left>..<right>` | The timeline between two exact coordinates (`#view/-5/2..1.5`). |

IDs and words are percent-encoded (`#moment/leg%3A2` for `leg:2`). The address follows what is
open: opening a moment adds its fragment, and closing it removes it, so the address bar can be
copied at any time. Moments and durations also have pages of their own,
`/timelines/<id>/moments/<id>` and `/timelines/<id>/durations/<id>`, which open the timeline at
them the same way. They are what **Share** offers, because social sites and search engines read
pages but not fragments.

The same fragments work for embeds (`/embed/<id>#moment/…`) and in the editor's own address
(`#timeline/<id>/moment/…`). A link to a moment or duration that no longer exists opens the
timeline and says so.

## Share

**Share** above the timeline, in a moment's or duration's details, under search results and,
for the current view, in the timeline's context menu (**Share this view**) opens the share
dialog:

- **Copy link**, and the device's own share sheet where the browser has one.
- Facebook, X, LinkedIn, Reddit, Bluesky and email: links to each site's own share page; no
  script of theirs runs on the platform.
- **Embed on a website**: the HTML of an embed, in three sizes.

Social sites and embeds are offered for public timelines only. For a private timeline the dialog
gives the link (which only members can follow) and, to its owner, a way to make it public.
Unsaved moments and edits cannot be shared until they are saved.

## Link previews

Timeline, moment and duration pages describe themselves for link previews (Open Graph and
Twitter cards) and search engines: a title, a description (the timeline's description, or how
many moments it has, over what time and by whom; for a moment, its time and notes), the
canonical address, and a 1200 × 630 preview image. The image shows the title and a strip of the
timeline's moments, with the shared moment or duration marked on it. Facebook, X, LinkedIn,
Slack, Discord, iMessage and others show these as a card with a large image.

Previews are made as a guest sees the timeline: a private timeline's preview image is the
site's own card, and its pages ask search engines not to index them, so nothing private
appears in a preview even when a member shares the link.

A timeline with [sensitive-content labels](moderation.md#sensitive-content-labels) previews as
its title and what it is labelled as containing, without its moments or description, and its
oEmbed answer has no thumbnail: it opens behind its warning.

## Search engines

- `/robots.txt` lets crawlers read pages but not the API, accounts, the bare editor or embeds,
  and names the sitemap.
- `/sitemap.xml` lists public timelines, most recently changed first, and their owners'
  profiles: up to 45,000 timelines and 4,000 profiles.
- Each timeline page includes its title, description, owner and first 50 moments as text, for
  screen readers and crawlers; each moment links to its own page.

## Embedding

`/embed/<id>` is a public timeline for other sites to frame: the timeline and its title, with
search, zoom, Fit all and an **Open on OpenChronology** link that follows what is open. It is
read-only, and anonymous: it sends no cookies, so it shows what a guest sees even to a visitor
who is signed in and owns the timeline. A private timeline is not embedded. The **Embed on a
website** code is an iframe:

```html
<iframe
  src="https://timescale.info/embed/<id>#moment/<moment>"
  title="…"
  width="100%"
  height="480"
  style="border:0;max-width:100%"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

Any site may frame embeds unless the operator sets `EMBED_FRAME_ANCESTORS` to a list of
origins (see [deployment](docker.md#public-hosting)). Other pages of the platform cannot be
framed by other sites.

### oEmbed

Timeline, moment and duration pages announce an [oEmbed](https://oembed.com) endpoint, so
services that discover oEmbed from a page (such as Iframely and Embedly, and the sites and
editors that use them) can turn a pasted link into the timeline itself:

```
GET /api/oembed?url=https://timescale.info/timelines/<id>&maxwidth=600&format=json
```

It answers a `rich` embed with the iframe above (opening at the page's moment or duration, or at
the link's fragment), its size (at most 800 × 480, within `maxwidth` and `maxheight`), the
title and owner, and the preview image as its thumbnail. Only `json` is available; addresses of
other sites, and timelines that are not public, are not found.
