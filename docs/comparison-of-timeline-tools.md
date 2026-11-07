# Comparison of timeline tools

<!-- description: OpenChronology beside TimelineJS, Aeon Timeline, Chronos, Time.Graphics, Preceden, Tiki-Toki and Timeline: dates, sources, size, offline use, price. -->

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

How OpenChronology compares with seven other timeline tools on dates before year 1, date precision, sources, size, offline use, hosting and export, licence and price, and working together. Each tool's facts come from its own website or documentation, linked in its section below. **Last checked: 2026-11-06.** Prices and features change; check the linked page before you decide. "Not stated" means we could not find the fact in the tool's own documentation, not that the tool lacks it. OpenChronology's facts come from this help.

## Summary

| Tool                                  | Before year 1                                             | Precision and uncertain dates                                         | Sources and notes per event                  | Size                                                 | Offline and desktop                                    | Self-hosting and export                                      | Licence and price (as of 2026-11-06)              | Collaboration                                           |
| ------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| [OpenChronology](#openchronology)     | Yes, any integer year (CE/BCE), and deep time             | Exact, to any fraction of a second; precision and estimates by plugin | List of source links, notes                  | 200,000 moments (a self-hosted server can change it) | Desktop app (Windows, macOS, Linux), offline HTML file | Self-hosted server; `.ochx` (JSON) and `.och` (SQLite) files | GPLv3; free                                       | Roles, forks, pull requests, merged saves               |
| [TimelineJS](#timelinejs)             | Yes, negative years; year-only beyond about 250,000 years | Year to millisecond; a display date for unknown dates                 | Text, media with credit and caption          | Recommends no more than 20 slides                    | Not stated                                             | Host its files yourself; data in a Google Sheet or JSON      | MPL 2.0; free                                     | Not stated                                              |
| [Aeon Timeline](#aeon-timeline)       | Yes, BC/AD eras; custom calendars                         | Year to second; uncertain start or end as a range                     | Links, attachments, summaries, custom fields | Not stated                                           | Mac, Windows, iOS apps; offline after sign-in          | No web publishing; CSV/TSV, image, PDF, Markdown, Word       | Proprietary; $65 once, with a year of updates     | Shared files on a shared drive; no simultaneous editing |
| [Chronos Timeline](#chronos-timeline) | Yes, back to 271,821 BCE                                  | Year to second; uncertain dates not stated                            | Description, link to an Obsidian note        | Not stated                                           | Runs inside Obsidian                                   | Plain text in your notes; a web playground                   | MIT; price not stated                             | Not stated                                              |
| [Time.Graphics](#timegraphics)        | Yes (public timelines reach 1,000,000,000 BC)             | Not stated                                                            | Photos, videos, links                        | 18 events free, unlimited with Premium               | Exported ZIP for offline viewing                       | Not stated; downloads in several formats                     | Not stated; free, or Premium from $4.9 for 2 days | Real time                                               |
| [Preceden](#preceden)                 | Yes, back to 240,000 BC                                   | Dates and times; approximate start or end                             | Notes with links                             | 10 events free, 1,500 paid                           | Not stated                                             | Not stated; PDF, PNG, PowerPoint, CSV, Excel                 | Not stated; free, or from $10 a month             | Invited editors (Pro plan)                              |
| [Tiki-Toki](#tiki-toki)               | Yes, "billions of years BC and AD"                        | Not stated                                                            | Introduction, web link, more detail          | Over 1,000 possible, 500 recommended; 200 free       | Mac app (TikiToki Desktop)                             | Licence to host one timeline from $2,000; PDF, CSV, JSON     | Not stated; free, or from $9.50 a month           | Group edit with a secret word                           |
| [Timeline](#timeline)                 | Yes, BC years; earlier than 4714 BC experimental          | Year to second; fuzzy start and end                                   | Description, several hyperlinks              | Not stated                                           | Desktop app (Windows, Fedora, Snap, source)            | Image, SVG, CSV, list                                        | GPLv3; free                                       | Several users of one file, with locking                 |

## Which to choose

- **A quick story timeline to embed in an article, from a spreadsheet:** TimelineJS is built for this and is the simpler choice.
- **Planning a novel or a fictional world:** Aeon Timeline has story views, custom calendars and sync with Scrivener and Ulysses; OpenChronology has none of these.
- **A presentation or report slide:** Preceden exports to PowerPoint, and Time.Graphics to large images and posters; OpenChronology exports only its own files.
- **Editing with others at the same moment:** Time.Graphics describes real-time collaboration; OpenChronology merges each person's saves instead.
- **A timeline of notes you already keep in Obsidian:** Chronos Timeline builds timelines from your notes.
- **A small desktop program with Pharaonic or Coptic calendars, or iCalendar import:** Timeline does these; OpenChronology doesn't.
- **Exact times from deep time to fractions of a second, sources on every event, large timelines, self-hosting or a free licence:** OpenChronology.

## OpenChronology

- **Before year 1:** the **Gregorian timestamp** display extends the Gregorian calendar backwards with years marked CE or BCE, and any whole number of years ([time presentation](time-presentation.md)). Other displays show plain numbers or units, for deep time. The **Geological ages** plugin keeps an approximate age in years before 2000 CE ([plugins](plugins.md#dating-and-historical-annotations)).
- **Precision:** every time is stored exactly, as a whole number or fraction: a third of a second stays a third ([guide](guide.md)). Each time is written at its own precision, so the start of a year reads as the year. The **Dating context** plugin marks a date as approximate and states its precision; **Historical dates** keeps a source's own date, such as a Julian one. Time zones are one fixed offset from UTC per timeline; named zones and daylight saving are not supported ([FAQ](faq.md#does-it-handle-time-zones-and-dates-before-year-1)).
- **Sources and notes:** the **Sources** plugin lists HTTPS links for each moment and duration, and file links in the desktop app ([plugins](plugins.md#sources)). Moments have notes in Markdown, which the **Rich text notes** plugin edits visually ([plugins](plugins.md#rich-text-notes-and-hover-previews)).
- **Size:** up to 200,000 moments, 200,000 durations and 200,000 relationships per timeline. A browser is comfortable to about 10,000 moments on a fast computer; the desktop app and the server stay quick at the limit ([timeline size](capacity.md)).
- **Offline and desktop:** a desktop app for Windows, macOS and Linux, and a single offline HTML file that never uses the network ([FAQ](faq.md#can-i-use-it-offline)).
- **Self-hosting and export:** server packages ([README](../README.md)), [Docker](docker.md) and [Nix](nix.md). Timelines export as `.ochx` (JSON) and `.och` (SQLite) files, and can be embedded in other websites ([sharing](sharing.md)). There is no CSV, image or PDF export.
- **Licence and price:** GNU GPL version 3; the app has no payments ([licensing](licensing.md)). A server sets a storage limit per account.
- **Collaboration:** owners, writers, contributors and readers; forks and pull requests; saves made while others save are merged, and conflicting edits are refused rather than overwritten ([collaboration](collaboration.md)).

## TimelineJS

From Northwestern University Knight Lab: [documentation](https://timeline.knightlab.com/docs/), [JSON format](https://timeline.knightlab.com/docs/json-format.html), [spreadsheet guide](https://timeline.knightlab.com/docs/using-spreadsheets.html) and [FAQ](https://timeline.knightlab.com/docs/faq.html).

- **Before year 1:** BCE years are negative numbers. The "cosmological" scale handles dates before 271,821 BCE, using only the year; the FAQ says dates "literally to the beginning of time".
- **Precision:** year, month, day, hour, minute, second and millisecond. A `display_date` replaces the shown date, "helpful if the actual date is not known".
- **Sources and notes:** each slide has a headline and text, and media with a credit and a caption.
- **Size:** "We recommend not having more than 20 slides for a reader to click through."
- **Offline and desktop:** not stated. There is no desktop app.
- **Self-hosting and export:** you can download its files and serve them from your own web server. Data is a published Google Sheet or a JSON file. A Google Sheet must be public to the web.
- **Licence and price:** Mozilla Public License 2.0; no fees, including commercial use.
- **Collaboration:** not stated.

**Better choice for:** a short narrative timeline, made from a spreadsheet and embedded in a web page.

## Aeon Timeline

From Aeon Timeline: [pricing](https://www.aeontimeline.com/pricing), [FAQ](https://www.aeontimeline.com/faq), [dates](https://www.aeontimeline.com/guides/add-and-customize-dates), [working with dates](https://www.aeontimeline.com/3-4-guides/dates), [calendar settings](https://help.timeline.app/article/209-settings-calendar-date), [links and files](https://www.aeontimeline.com/guides/add-links-files-and-images), [notes](https://www.aeontimeline.com/guides/add-notes-tags-and-extra-details) and [export](https://www.aeontimeline.com/guides/exporting-printing-and-sharing).

- **Before year 1:** dates can be in the BC or AD era, and custom calendars set their own eras, months and leap years. The zoom range reaches "billions of years". How far back dates go is not stated.
- **Precision:** year, month and year, full date, or a time "down to the second". An uncertain start or end can be entered as a range of earliest and latest dates.
- **Sources and notes:** links, file attachments and images per item; summaries for notes; custom text, number and option fields.
- **Size:** not stated.
- **Offline and desktop:** apps for Mac, Windows and iOS. Files are stored on your device; after signing in, it works without the internet.
- **Self-hosting and export:** timelines can't be published on the web. Export to CSV or TSV, PNG, JPEG or PDF, Markdown and Word. Syncs with Scrivener and Ulysses.
- **Licence and price:** proprietary. As of 2026-11-06, $65 once for the current version on up to five devices with a year of updates, then $35 a year for further updates; a 14-day free trial.
- **Collaboration:** keep the file on a shared drive; "if two users edit the file simultaneously, it will cause conflict issues". Others can view a file with the free read-only app.

**Better choice for:** novelists and worldbuilders planning stories, and anyone who wants a polished desktop app with a spreadsheet view and writing-tool sync.

## Chronos Timeline

A plugin for the Obsidian note-taking app, by Claire Froelich: [README](https://github.com/clairefro/obsidian-plugin-chronos) and [plugin listing](https://community.obsidian.md/plugins/chronos).

- **Before year 1:** negative years are BCE. Dates "must be between year 271,821 BCE and 275,761 CE".
- **Precision:** year down to the second. Uncertain dates: not stated.
- **Sources and notes:** each item can have a description and link to an Obsidian note.
- **Size:** not stated.
- **Offline and desktop:** it runs inside Obsidian; offline use is not stated.
- **Self-hosting and export:** timelines are plain text in your notes. A web playground renders them outside Obsidian, and a timeline can be copied as a shareable link.
- **Licence and price:** MIT licence. Price: not stated.
- **Collaboration:** not stated.

**Better choice for:** people who keep their notes in Obsidian and want timelines written in them as plain text.

## Time.Graphics

From Time.Graphics: [home page](https://time.graphics/), [pricing](https://time.graphics/premium) and [FAQ](https://time.graphics/faq).

- **Before year 1:** BC dates are supported; public timelines on the site show periods from [1,000,000,000 BC](https://time.graphics/period/3905208). The limit is not stated.
- **Precision and uncertain dates:** not stated.
- **Sources and notes:** events can have photos, videos and URL links, and maps.
- **Size:** 18 events in the editor on the free plan; unlimited with Premium.
- **Offline and desktop:** "Complete export for offline viewing" as a ZIP archive. A desktop app is not stated.
- **Self-hosting and export:** self-hosting is not stated. Downloads in "a variety of formats", with a watermark on the free plan; Google Calendar and Google Sheets import.
- **Licence and price:** licence not stated. As of 2026-11-06, public timelines are free; Premium is $4.9 for 2 days, $18.9 a month or $97.9 a year, "valid until 2026 November 30". Private timelines need Premium.
- **Collaboration:** "collaborate on timelines in real time"; dashboards for schools and companies.

**Better choice for:** classroom timelines, real-time group editing and large poster images.

## Preceden

From Preceden: [pricing](https://www.preceden.com/pricing), [features](https://www.preceden.com/), [date formats](https://www.preceden.com/support/date-formats), [adding events](https://www.preceden.com/support/add-event-to-timeline), [number of events](https://www.preceden.com/support/max-events) and [collaboration](https://www.preceden.com/support/collaboration).

- **Before year 1:** "Preceden supports dates ranging from 240,000 BC to 240,000 AD."
- **Precision:** dates, with "exact start and end times" when needed. A start or end can be marked approximate; centuries, decades and phrases such as "late 19th century" are understood.
- **Sources and notes:** notes per event, which can contain links.
- **Size:** 10 events per timeline on the free plan; paid plans allow up to 1,500, and the editor slows "somewhere in the 500-600 range".
- **Offline and desktop:** not stated.
- **Self-hosting and export:** self-hosting is not stated. Export to PDF, PNG, PowerPoint, CSV and Excel; share by link or embed.
- **Licence and price:** licence not stated. As of 2026-11-06: free; Basic $10 a month billed annually ($25 monthly); Pro $16 a month billed annually ($40 monthly).
- **Collaboration:** invited collaborators can edit, on the Pro plan.

**Better choice for:** project plans, legal and business timelines that end up in PowerPoint or a PDF, and spreadsheet imports.

## Tiki-Toki

From Webalon Ltd: [home page and plans](https://www.tiki-toki.com/), [FAQ](https://www.tiki-toki.com/faqs/) and [TikiToki Desktop](https://www.tiki-toki.com/desktopapp/).

- **Before year 1:** the FAQ lists "Timeline range expanded massively to cover billions of years BC and AD" among its changes.
- **Precision and uncertain dates:** not stated; "support for zooming into seconds" is on its roadmap.
- **Sources and notes:** each story has an introduction, pictures, video or sound, a web link and more detail.
- **Size:** "potentially possible to have more than 1,000 stories", but no more than 500 recommended; 200 on the free account.
- **Offline and desktop:** TikiToki Desktop for Mac saves `.tki` files on your computer; it can't make web timelines.
- **Self-hosting and export:** a licence to host a timeline on your own servers "start[s] at US$2,000 for a single timeline". Print, PDF, CSV and JSON exports.
- **Licence and price:** licence not stated. As of 2026-11-06: free (one timeline); Bronze $9.50 a month; Silver $25 a month; Teacher $150 a year; TikiToki Desktop $24.99 (listed down from $49.99).
- **Collaboration:** Group Edit on paid accounts: contributors with a secret word add and edit their own stories.

**Better choice for:** visual, media-rich story timelines, including a 3D view.

## Timeline

The open-source desktop app: [documentation](https://thetimelineproj.sourceforge.net/), [about](https://thetimelineproj.sourceforge.net/about.html), [installing](https://thetimelineproj.sourceforge.net/installing.html) and [changelog](https://thetimelineproj.sourceforge.net/changelog.html). Facts below are mostly from the changelog; the latest release listed is 2.10.0, of 9 February 2025.

- **Before year 1:** dates before year 1 are supported since version 1.0.0; "entering dates before 4714 BC" is experimental since 1.7.0. Numeric timelines, and Pharaonic, Coptic and "The Dark Eye" calendars, are available. How far back: not stated.
- **Precision:** times "with seconds precision" since 1.20.0. Each end of an event can be marked fuzzy.
- **Sources and notes:** a description and several hyperlinks per event.
- **Size:** not stated.
- **Offline and desktop:** a desktop app, installed on Windows, Fedora, from Snapcraft or from source.
- **Self-hosting and export:** export to image, SVG, CSV and a list; import from iCalendar (`.ics`) files and other timelines.
- **Licence and price:** GNU GPL version 3; free.
- **Collaboration:** "multiple users" can use the same timeline file, with locking and detection of changes by another user.

**Better choice for:** a lightweight free desktop program, unusual calendars, or importing a calendar's `.ics` events.
