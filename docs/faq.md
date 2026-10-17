# Frequently asked questions

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Short answers to common questions, from the basics to running your own server. For a walk through the whole app, read [using OpenChronology](guide.md).

## What is OpenChronology?

A timeline editor. You place moments, durations and the links between them on a line of time, then zoom, search, compare and share. Times are exact: a third of a second stays exactly a third, however far you zoom. It runs on the website, as a desktop app, and as a single offline HTML file. See [what a timeline is](guide.md#what-a-timeline-is).

## Is it free?

The software is free software under the GNU GPL version 3: you may use it, study it, share it and change it ([licensing](licensing.md)). The app has no payments or paid features. On a server, each account has a storage limit, set by the site's operator and shown on the **Account** page.

## Do I need an account?

No. Anyone can read public timelines, and anyone can start a timeline in the browser and export it as a file. An account lets you save timelines to the server, keep them private or share them, star timelines, and work with others. Accounts are for people 13 and older.

## Where is my data kept?

It depends on where you work:

- **In the browser without an account:** only in the open tab, until you export it.
- **In the browser, signed in:** as a draft in that browser, until you save it to the server. Each timeline you start there is a draft of its own, listed on the home page under **Drafts in this browser**.
- **On the server:** in the server's database, with its saved history.
- **In the desktop app:** in `.och` files on your computer.

See [where a timeline lives](guide.md#where-a-timeline-lives).

## Can I use it offline?

Yes, two ways. The desktop app works with files on your computer and needs a network only to reach a server. The offline browser file is the whole editor in one HTML file and never uses the network; export your work as `.ochx` before closing it. Both are under **Download** in the header. See [the desktop app and the offline file](guide.md#the-desktop-app-and-the-offline-file).

## What file formats does it use?

- **`.ochx`:** a JSON file every edition reads and writes, with **Import** and **Export**. It includes the timeline's display settings, plugins and copies of its images.
- **`.och`:** the desktop app's file (an SQLite database), with **Open**, **Save** and **Save As…**. Signed in on the website, **Import .och** and **Export .och ↗** convert it.

See [saving to a file](guide.md#to-a-file).

## Why does my timeline show numbers instead of dates?

A new timeline uses the **Exact rational** display. Open **Time display**, choose **Gregorian timestamp** under **Representation**, and select **Save display settings**. Times then read as dates, counting seconds from the start of 1970 in UTC. Nothing moves when you change the display. See [display settings](guide.md#display-settings).

## Does it handle time zones and dates before year 1?

The Gregorian display uses one fixed offset from UTC per timeline (**Timezone offset in minutes**). Named time zones and daylight saving are not supported. It extends the Gregorian calendar backwards, with years marked CE or BCE, and handles very distant years. To record a date as a source gives it, such as a Julian date, use the **Historical dates** plugin ([dating and historical annotations](plugins.md#dating-and-historical-annotations)).

## Why do some moments show as a number?

That is a summary: moments too close together on screen to draw apart, with any durations too short to draw at this zoom. Click it to list them, or double-click it to zoom in. **Group within** under the timeline sets how close moments must be to group. See [what markers show](guide.md#what-markers-show).

## I closed a moment's details and my changes disappeared. Why?

Edits show on the timeline as you type, but only **Save** keeps them. **Cancel**, Escape, the **×** button or clicking outside the panel puts the moment back as it was. See [the details panel](guide.md#the-details-panel).

## How do I add a picture to a moment?

Install a plugin: **Moment icons** for a moment's marker, **Duration backgrounds** behind a duration, or **Moment stacks** for cards inside a moment. Then give the picture's HTTPS address in the moment's details. The server keeps the link, not a copy. See [images](guide.md#images) and [images and copyright](images.md).

## Can I undo a change after saving?

**Undo** (Ctrl+Z) reverses edits until you save to the server or to a desktop file; saving starts a fresh undo history. To return to an earlier saved version, export it from **History** and import it. See [revisions](guide.md#revisions).

## How many moments can a timeline hold?

Up to 200,000 moments, and as many durations and relationships. A server's operator can change that limit for their server. Very large timelines are quicker in the desktop app or saved to the server than kept in the browser. See [timeline size and platforms](capacity.md).

## How do I move many moments at once?

Right-click (or press and hold) the timeline and choose **Shift or scale times…**. It shifts, stretches or compresses every moment and duration, or those with certain tags, or what is related to one. See [shifting and scaling times](time-mapping.md).

## Who can see my timeline?

A timeline you save to the server starts private: only you and the collaborators you add can open it. Its owner can make it public under **Sharing & settings → Visibility**. Anyone can then read it, search finds it, and signed-in readers can fork it or propose changes. See [sharing and links](guide.md#sharing-and-links).

## How do I share a link to one moment?

Open the moment and choose **Share** in its details. The address bar also follows what is open, so you can copy it at any time. Only people who can open the timeline can follow the link. See [links](sharing.md#links).

## Can I put a timeline on my website?

Yes, if it is public. Choose **Share**, then **Embed on a website**, pick a size, and copy the code. The embedded timeline is read-only. See [embedding](sharing.md#embedding).

## Can other people edit my timeline?

Add them under **Sharing & settings → Collaborators**. A **Viewer** reads, a **Contributor** proposes changes as pull requests, and a **Writer** saves changes and merges pull requests. Only the owner changes visibility, collaborators, or deletes the timeline. See [members and roles](guide.md#members-and-roles).

## What is the difference between a fork and a duplicate?

Both are copies you own. A fork (**Fork on server**) remembers the original: you can bring in its later changes with **Sync upstream** and offer yours back with **Propose saved changes**. A **Duplicate** is independent. See [forks, duplicates and saved history](collaboration.md#forks-duplicates-and-saved-history).

## What happens if two people save at the same time?

The later save merges its edits onto the earlier one. Only when both changed the same thing differently does it stop and ask: **Keep my versions** or **Use the saved versions**. See [saving while others save](collaboration.md#saving-while-others-save).

## Why isn't my public timeline listed under Explore timelines?

Browsing lists public timelines of established accounts, to keep spam out. An account becomes established once it has a confirmed email address (or signs in with Google, GitHub or Facebook) and is 30 days old, or 7 days old and starred or forked by an established account. Until then its timelines open by link, show up in search and appear on its profile. See [established accounts](browsing.md#established-accounts).

## Can the site's administrators see my private timelines?

Yes. Private timelines are hidden from other users, but they are not encrypted from the site's operator and administrators. Don't keep secrets in them. The **Terms, privacy & licenses** link at the foot of every page explains how the site handles data.

## How do I report something?

Choose **Report** on the timeline's page, in a moment's or duration's details, under a comment, on a plugin's card, or on a profile. Pick what is wrong and add details if you like. The owner is not told who reported it. See [reporting](moderation.md#reporting).

## How do I turn on two-factor authentication?

On the **Account** page, under **Account security**, choose **Set up two-factor authentication** (available once the site's operator has set up email and encryption). Add the key to an authenticator app, enter its six-digit code, and choose **Confirm and enable MFA**. Store the ten recovery codes it shows; they are shown only once. See [two-factor authentication](authentication.md#two-factor-authentication-and-recovery).

## I forgot my password. What now?

Choose **Forgot password?** on the sign-in page and enter your account's email address. The link it sends works once, within 30 minutes. Resetting your password signs you out everywhere, and two-factor authentication stays on.

## How do I make an API key?

On the **Account** page, under **API keys**, give the key a name and an expiry (1 to 365 days), tick **Allow timeline writes** if it needs to change timelines, confirm your password, and choose **Create API key**. Copy the key at once: it is shown only once. See [API keys](administration.md#api-keys) and [the HTTP API](api.md).

## How do I delete my account?

On the **Account** page, under **Delete your account**, type your username, your password and, if two-factor authentication is on, a code, then choose **Delete my account**. It deletes your timelines, your pull requests and comments, your published plugins, stars and API keys. Others' forks of your timelines stay theirs, and changes already merged into others' timelines stay there. Export what you want to keep first; this cannot be undone.

## Can I run my own server?

Yes. The **Download** page has server packages for Windows, macOS (Homebrew), Debian, Ubuntu, Rocky Linux and RHEL, Fedora and FreeBSD, and a Docker Compose setup for any system. See [Docker deployment](docker.md) and [administration](administration.md).

## Can the desktop app use my own server?

Yes. Open **Server connection** and enter your server's HTTPS address. The desktop app can be connected to up to eight servers at once, each with its own sign-in. See [several servers on the desktop](authentication.md#several-servers-on-the-desktop).

## Can I fill a timeline from log files automatically?

Yes. A command-line importer reads log files, and receivers follow syslog and the systemd journal, adding each entry as a moment. A timeline can keep only its recent past. See [importing log files](log-import.md), [syslog](syslog.md), [the systemd journal](journald.md) and [data retention](retention.md).
