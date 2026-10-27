# Images and copyright

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Timelines show images by linking to them: a moment's icon, a duration's background, a stack entry's picture or the timeline's own image is an HTTPS address where its owner hosts it ([#109](https://github.com/openchronology/timeline-app/issues/109)). The server stores the link, never a copy of the image, and readers' browsers load the image from its host.

## A timeline's own image

A timeline can have an image of its own ([#339](https://github.com/openchronology/timeline-app/issues/339)): its owner sets, replaces or removes it under **Sharing & settings** → **Image**, with a link to the image and alt text saying what it shows. It is shown:

- above the timeline's title, in the editor and as readers see it (blurred, like its other images, on a timeline with [sensitive-content labels](moderation.md#sensitive-content-labels));
- at the top of its card wherever timelines are listed (the dashboard, profiles and search results), cropped to 16 : 9 and loaded as it scrolls into view; a card without one, or of a labelled timeline, shows a plain placeholder of the same shape;
- as its [link preview](sharing.md#link-previews) and its oEmbed thumbnail, while it is public and unlabelled.

It is one of the document's settings, like its title and tags (`image` in the `.ochx` file: `{"url": "https://…", "alt": "…", "width": 1200, "height": 800}`, its size optional), so its saved history, exports, forks and pull requests keep it, and a document saved or imported with one sets it. Through the API it is set with `PATCH /api/timelines/:id/settings` and `{"image": {"url", "alt"}}`, or removed with `{"image": null}`; that saves the settings as a revision of its own. Like every image here it is a link, not a copy: the server keeps the address, and **Export** carries a copy for offline use. Its link must be HTTPS without credentials, and the same rules and reports apply as to other images.

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
