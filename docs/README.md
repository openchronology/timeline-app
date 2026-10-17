# docs

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The documentation: how to use OpenChronology, run a server and work on the code. The site's help area (`/help`) presents these same files as the site runs ([`server/help.mjs`](../server/help.mjs)), grouped into sections there, so a change here changes the help with the code it ships with; this README is for reading the repository and is not a help page. Start with [Using OpenChronology](guide.md) or the [frequently asked questions](faq.md); the project's [README](../README.md) covers installing and building. Link between docs with relative links such as `[durations](durations.md)`, which the help area turns into its own addresses.

## Contents

| File                                           | What it is for                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`administration.md`](administration.md)       | Running an installation: the administrator account, data quotas, timeline size, the site's name and analytics, account settings, API keys. |
| [`api.md`](api.md)                             | The HTTP API the web app, desktop app and command-line tools use, described in OpenAPI 3.1 (#178).                                         |
| [`architecture.md`](architecture.md)           | The timeline and query contract: the data model, the `.ochx` and `.och` file formats, HTTP operations, saved history and storage.          |
| [`authentication.md`](authentication.md)       | Accounts and sessions: signing in from the browser and desktop, several servers on the desktop, passwords, two-factor and verification.    |
| [`benchmarks.md`](benchmarks.md)               | How to run the benchmarks, what each one measures, and what they found.                                                                    |
| [`browsing.md`](browsing.md)                   | How the dashboard lists and ranks public timelines, and the account standing that keeps spam out of it (#103).                             |
| [`capacity.md`](capacity.md)                   | How large a timeline can be, and which platform stays comfortable at which size.                                                           |
| [`collaboration.md`](collaboration.md)         | The dashboard and working together: custody and permissions, forks, saving while others save, and pull requests.                           |
| [`comparison.md`](comparison.md)               | Comparing timelines side by side, live refresh, and saved public comparisons.                                                              |
| [`docker.md`](docker.md)                       | Deploying with Docker Compose: building and running, public hosting, upgrades and backups, and mail.                                       |
| [`durations.md`](durations.md)                 | Durations: entities with a start and an end, each a fixed time or anchored to a moment.                                                    |
| [`faq.md`](faq.md)                             | Short answers to common questions, from the basics to running your own server.                                                             |
| [`guest-editing.md`](guest-editing.md)         | Editing without an account, in the guest editor and the standalone HTML file, where timelines live only in memory.                         |
| [`guide.md`](guide.md)                         | Using OpenChronology: a walk through the app, task by task, linking to the detailed pages.                                                 |
| [`images.md`](images.md)                       | How timelines show images by linking to them rather than storing copies, and why (#109).                                                   |
| [`journald.md`](journald.md)                   | Following the systemd journal into timelines with the journald follower (#151).                                                            |
| [`licensing.md`](licensing.md)                 | Copyright, the GPLv3 and distributions: source for releases, contributions and license changes.                                            |
| [`log-import.md`](log-import.md)               | Importing historic log files into timelines with `och-import-logs`.                                                                        |
| [`moderation.md`](moderation.md)               | Reporting content and how the site's administrators review reports (#115).                                                                 |
| [`plugins.md`](plugins.md)                     | Timeline plugins: installing them, what they can change, writing and publishing your own, and where they run.                              |
| [`relationships.md`](relationships.md)         | Relationships: undirected links between moments and durations, and how to view and edit them.                                              |
| [`retention.md`](retention.md)                 | Keeping only a timeline's recent past, not keeping saved history, and deleting everything in a view.                                       |
| [`search.md`](search.md)                       | Searching a timeline's moments and durations, and how matching differs by where the timeline lives.                                        |
| [`seeding.md`](seeding.md)                     | Seeding the public example timelines and official plugins on a new installation.                                                           |
| [`sharing.md`](sharing.md)                     | Sharing timelines: addresses, links, link previews, search engines and embedding in other websites.                                        |
| [`syslog.md`](syslog.md)                       | Receiving syslog messages into timelines with the syslog receiver and routing rules.                                                       |
| [`tags.md`](tags.md)                           | Tags on moments and durations, and separating a timeline into tracks by them.                                                              |
| [`time-mapping.md`](time-mapping.md)           | Shifting and scaling the times of many moments and durations at once (#96).                                                                |
| [`time-presentation.md`](time-presentation.md) | How a timeline displays and parses times: built-in formats and units, ruler graduations, and custom scripts.                               |
