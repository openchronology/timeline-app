# Images and copyright

<!-- description: Images on timelines: icons, backgrounds and a timeline's own picture are linked where they are hosted, not copied, and what the service does with them. -->

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Timelines show images by linking to them: a moment's icon, a duration's background, a stack entry's picture or the timeline's own image is an HTTPS address where its owner hosts it ([#109](https://github.com/openchronology/timeline-app/issues/109)). The server stores the link, never a copy of the image, and readers' browsers load the image from its host.

## Image addresses

An image address is at most 4,096 characters. A duration's background is drawn from the band the timeline loads for each duration in view, which keeps web addresses of at most **1,024 characters** ([#365](https://github.com/openchronology/timeline-app/issues/365)); a background with a longer address shows nothing. Wikimedia Commons thumbnail addresses repeat the file's name, so a long name can pass that: link the original file's shorter address instead. Wherever such an address is set, you're told:

- the duration's details in the editor say so;
- importing a file in the editor says how many durations have one;
- the API's answer to creating or saving a timeline (`POST /api/timelines`, `PUT /api/timelines/:id` and `PUT /api/timelines/:id/changes`), and to reading a file (`POST /api/files/import`), succeeds with a `warnings` list naming them: `{"code": "long-background", "message": "…", "count": 1, "durations": ["…"]}` (at most 100 IDs).

Releases before this one kept addresses of at most 256 characters in bands. `openchronology-migrate` rebuilds, once, the timelines with a duration whose address is between 257 and 1,024 characters long, and the forks reading through to them, so their backgrounds show without saving them again.

## A timeline's own image

A timeline can have an image of its own ([#339](https://github.com/openchronology/timeline-app/issues/339)): its owner sets, replaces or removes it under **Sharing & settings** → **Image**, with a link to the image and alt text saying what it shows. It is shown:

- above the timeline's title, in the editor and as readers see it (blurred, like its other images, on a timeline with [sensitive-content labels](moderation.md#sensitive-content-labels));
- at the top of its card wherever timelines are listed (the dashboard, profiles and search results), cropped to 16 : 9 and loaded as it scrolls into view; a card without one, or of a labelled timeline, shows a plain placeholder of the same shape;
- as its [link preview](sharing.md#link-previews) and its oEmbed thumbnail, while it is public and unlabelled.

It is one of the document's settings, like its title and tags (`image` in the `.ochx` file: `{"url": "https://…", "alt": "…", "width": 1200, "height": 800}`, its size optional), so its saved history, exports, forks and pull requests keep it, and a document saved or imported with one sets it. Through the API it is set with `PATCH /api/timelines/:id/settings` and `{"image": {"url", "alt"}}`, or removed with `{"image": null}`; that saves the settings as a revision of its own. Like every image here it is a link, not a copy: the server keeps the address, and **Export** carries a copy for offline use. Its link must be HTTPS without credentials, and the same rules and reports apply as to other images.

## What loading an image tells its host

Since images are links, a reader's browser fetches each one from its host when it shows: a moment's icon as its marker comes into view, a duration's background, the timeline's own image, an avatar on a profile. Like any web page's images, that tells the host:

- **the reader's IP address**, and so roughly where they are and which network they use;
- **when** they looked, and which images, which can tell which timeline or part of it they were reading;
- **their browser** (its User-Agent).

It doesn't tell the host which page the image is on: the site sends `Referrer-Policy: no-referrer`, and every image is loaded with `referrerpolicy="no-referrer"` as well, so no address of the site, timeline or embed is sent. Nor are the reader's cookies for the site sent. Backgrounds are requested anonymously (`crossorigin="anonymous"`), without any cookies; other images aren't CORS requests, since most hosts don't allow them and the images wouldn't show, so the host's own cookies, if the browser keeps any for it, follow the browser's rules for third-party cookies (most browsers block them).

So whoever chooses a timeline's images could count who reads it, as any web page's author could. Readers who mind can block images from other sites in their browser, or read a copy offline: **Export** and the offline HTML embed copies, which are shown instead of fetching the links. The server never fetches or proxies images ([why links](#why-links-not-copies)), so it learns nothing of them either.

### In the desktop app

A timeline opened in the desktop app from a file (an `.och` or `.ochx` someone sent, or a download) may link images on any site, and opening the file would otherwise tell those sites the reader's address and when they opened it. So the app holds those images back: copies the file carries still show, but images from other sites wait, and the timeline's heading says **Images from other sites are hidden**, with **Show images from other sites**. Choosing it shows them, and the app remembers the choice for that file (by its path, in the app's settings folder, with the timelines trusted to open files; see [the file populator](file-populator.md#which-files-a-timeline-may-show)). A timeline the reader trusted that way shows its images at once.

They show without asking for timelines on a server (the editor's own, or a connected server's), for a new timeline, and for one made by the file populator, which are the reader's own or the server's to show. Saving a timeline to a file keeps whether its images showed: a timeline saved from the server or made in the app shows them when opened again.

## Why links, not copies

Whether showing an image linked from elsewhere infringes its copyright depends on where you are. Storing a copy is clearer: it reproduces the image, and the server would then distribute it. As of October 2026, the main cases are:

| Where                 | What the courts say                                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **US, Ninth Circuit** | The "server test" (_Perfect 10 v. Amazon_, 2007; _Hunley v. Instagram_, 2023): a site that shows an image stored on someone else's server does not itself display or distribute a copy. That is how Google Images shows full-size images: by linking, while the small thumbnails it does copy were held fair use. |
| **US, Fifth Circuit** | In 2026 (_Emmerich_) the court rejected the server test: embedding can infringe the display right there. Other courts are divided.                                                                                                                                                                                |
| **EU**                | Linking to, or inline-linking, a work freely available with its owner's consent is not a new communication to the public (_Svensson_, _BestWater_). It is when it gets around technical measures against framing (_VG Bild-Kunst_, 2021), or when the linker knows the work was posted unlawfully (_GS Media_).   |

So links are the safer footing, though not a guarantee. A copy on the server carries the risk everywhere. Earlier releases stored copies (`assets`) when a timeline was saved to the server. The migration to this release removes them, from timelines, their saved history and pull requests.

## What the service does

|                          |                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saving to the server** | Keeps only the links. A save that includes image copies (from an older editor, the API, or an imported file) has them dropped.                                                                                                        |
| **Credit**               | Wherever an image shows (the hover card, an event's details), its host is named, and **open the original** links to it.                                                                                                               |
| **Exports**              | **Export** (`.ochx`), **Export .och**, the offline HTML and desktop files still embed copies of the images, so they work offline. They are your own files: what you may do with the copies is between you and the images' owners.     |
| **Link rot**             | An image whose host removes it, or stops allowing it to be shown elsewhere, stops showing on the timeline. Export a copy if you need one to last.                                                                                     |
| **Your responsibility**  | Link only images you may share: your own, openly licensed ones (Wikimedia Commons, Flickr Creative Commons, museum open-access collections), or ones whose host allows embedding. The [terms](../legal/TERMS.md) say so.              |
| **Complaints**           | A rights holder can **Report** a timeline or moment (category: copyright infringement) or send a notice as [COPYRIGHT.md](../legal/COPYRIGHT.md) describes. The operator can restrict what is reported ([moderation](moderation.md)). |
