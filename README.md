# OpenChronology

OpenChronology is a free, open-source timeline editor for exact dates at any scale, from deep time to fractions of a second, with sources on every event. Use it at [timescale.info](https://timescale.info), as a desktop app for Windows, macOS and Linux, as a single offline HTML file, or on your own server.

**[Open timescale.info](https://timescale.info)** · **[Download](https://timescale.info/download)** · **[Try it offline](https://openchronology.github.io/)** · **[User guide](docs/guide.md)** · **[FAQ](docs/faq.md)**

## What it does

- **Any scale, exactly.** A time is an arbitrary-precision fraction, never a rounded number. Place the Big Bang, a reign and a millisecond on one timeline, and zoom between them without losing a digit ([time presentation](docs/time-presentation.md)).
- **Sources on every event.** Moments and durations carry notes, links, tags and relationships, and saved history keeps earlier versions ([guide](docs/guide.md)).
- **Work together.** Share publicly or privately, fork, and review changes as pull requests ([collaboration](docs/collaboration.md)). Compare up to eight timelines side by side ([comparison](docs/comparison.md)).
- **Large and live.** Up to 200,000 events per timeline by default, and logs streamed in as they happen from [syslog](docs/syslog.md), [journald](docs/journald.md) or the [HTTP API](docs/api.md).
- **Yours.** GPLv3, with no account needed to edit. Timelines move between editions, and off any server, as `.ochx` (JSON) or `.och` (SQLite) files.

## Get started

| You want to…           | Do this                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read or make timelines | Use [timescale.info](https://timescale.info). Browsing and local editing need no account.                                                              |
| Work offline           | [Download](https://timescale.info/download) the desktop app (Windows, macOS, Linux) or the single offline HTML file.                                   |
| Run your own server    | `sudo apt install ./openchronology-server-debian13-amd64.deb`, or Docker, Nix, Homebrew, Windows and more: see [installing a server](docs/install.md). |
| Build it or change it  | `npm ci && npm run dev`, then see [building and testing](docs/development.md) and [contributing](CONTRIBUTING.md).                                     |
| Automate it            | Use the [HTTP API](docs/api.md) with an API key ([administration](docs/administration.md)).                                                            |

Every server also serves this documentation at `/help`, searchable and matching the version it runs. The [technical disclosures](docs/disclosures/README.md) describe its original mechanisms in enough detail to implement them, as a dated public record.

## License

Copyright (c) 2026 Athan Clark. OpenChronology software, official plugins and first-party documentation are [GPLv3 only](LICENSE); see [NOTICE](NOTICE) for scope, [third-party notices](THIRD_PARTY.md) for dependencies, and [licensing](docs/licensing.md) for release source bundles. User timelines and original user scripts retain their owners' rights. timescale.info's [terms](legal/TERMS.md) and [privacy policy](legal/PRIVACY.md) are in effect from 7 November 2026, and its [copyright policy](legal/COPYRIGHT.md) from 25 October 2026.
