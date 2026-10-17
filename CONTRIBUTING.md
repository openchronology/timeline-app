# Contributing

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology is one codebase for four editions: the website (a Next.js platform over a Node server and PostgreSQL), the desktop app (Tauri, with a native SQLite store), the offline HTML file and the plain browser editor. They share one editor, `src/`. Start with the [README](README.md) to run it, and the [architecture](docs/architecture.md) for how the parts fit. This page says where everything is and the conventions that keep it findable.

## Contents

| File                                         | What it is for                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`.github/`](.github/workflows/README.md)    | GitHub Actions: continuous integration, benchmarks, desktop and server packages, releases and the pages site (in `.github/workflows/`). |
| [`bench/`](bench/README.md)                  | Benchmarks of the stores, the browser and desktop UI, and capacity, with the budgets CI holds them to.                                  |
| [`deploy/`](deploy/README.md)                | Docker images and the server packages for Debian, Ubuntu, RPM systems, FreeBSD, macOS (Homebrew) and Windows.                           |
| [`docs/`](docs/README.md)                    | The documentation: the user guide, FAQ and every topic in detail, also shown at `/help` on every server.                                |
| [`legal/`](legal/README.md)                  | The hosted site's terms, privacy policy, copyright policy and launch checklist.                                                         |
| [`native-store/`](native-store/README.md)    | The native SQLite store (Rust) behind the desktop app and `och-convert`.                                                                |
| [`platform/`](platform/README.md)            | The website: Next.js pages and API routes over the server.                                                                              |
| [`scripts/`](scripts/README.md)              | Build, packaging and release scripts.                                                                                                   |
| [`server/`](server/README.md)                | The Node server: the HTTP API, the PostgreSQL store, accounts, moderation, and log receivers and importers.                             |
| [`src/`](src/README.md)                      | The editor every edition shares, and its core: exact times, the timeline index, durations, tags, plugins.                               |
| [`src-tauri/`](src-tauri/README.md)          | The desktop app's shell (Tauri): native windows, files and server connections.                                                          |
| [`test/`](test/README.md)                    | Unit, database, browser, desktop and live tests.                                                                                        |
| [`vendor/`](vendor/README.md)                | Vendored dependencies: the rational map packages and the SQLite rational extension.                                                     |
| [`.dockerignore`](.dockerignore)             | What Docker builds leave out of their context.                                                                                          |
| [`.env.example`](.env.example)               | The settings a self-hosted server reads, to copy to `.env` (docs/docker.md).                                                            |
| [`.gitignore`](.gitignore)                   | What git leaves untracked: dependencies, builds and scratch files.                                                                      |
| [`.prettierrc.json`](.prettierrc.json)       | How Prettier formats the code and docs.                                                                                                 |
| [`.yarnrc.yml`](.yarnrc.yml)                 | Yarn 4's settings.                                                                                                                      |
| [`compose.yml`](compose.yml)                 | Docker Compose for a self-hosted server (docs/docker.md).                                                                               |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)         | This page: where everything is, and how to change it.                                                                                   |
| [`LICENSE`](LICENSE)                         | The GNU General Public License, version 3.                                                                                              |
| [`NOTICE`](NOTICE)                           | Who holds the copyright, the licence in brief, and where third-party notices are.                                                       |
| [`package.json`](package.json)               | The Node project: dependencies and the `npm run` scripts.                                                                               |
| [`package-lock.json`](package-lock.json)     | npm's locked dependency versions.                                                                                                       |
| [`pnpm-lock.yaml`](pnpm-lock.yaml)           | pnpm's locked dependency versions.                                                                                                      |
| [`pnpm-workspace.yaml`](pnpm-workspace.yaml) | pnpm's settings.                                                                                                                        |
| [`README.md`](README.md)                     | What OpenChronology is, how to run it, and its features.                                                                                |
| [`THIRD_PARTY.md`](THIRD_PARTY.md)           | Third-party components and their licences.                                                                                              |
| [`tsconfig.json`](tsconfig.json)             | TypeScript's settings, for `npm run typecheck`.                                                                                         |
| [`yarn.lock`](yarn.lock)                     | Yarn's locked dependency versions.                                                                                                      |

## Finding your way

- **Every folder has a README.md** with a table of what each file in it is for, and links to the READMEs of its subfolders. Folders vendored from elsewhere keep their own.
- **Every code file begins with a synopsis:** after its copyright line, a comment of a line or a few saying what the file is for. Many name the issue they came from, such as `(#172)`; the issue on GitHub has the discussion behind it.
- **Documentation** lives in [`docs/`](docs/README.md), one page per topic, and every server shows it at `/help` as it runs. A new page needs a place in a section of `HELP_SECTIONS` in [`server/help.mjs`](server/help.mjs).

`test/contents.test.mjs` checks the first two: a folder without a README, a README that leaves out a file or lists one that is gone, a link in one that leads nowhere, or a code file without a synopsis fails `npm test`. `test/help.test.mjs` checks that every doc is in a section of the help and that every link between docs leads somewhere.

## Making a change

- **Comments and docs** follow the code's voice: plain and concise, saying what something is for. Where the editor and the website show the same thing, they use the same words, from [`src/wording.ts`](src/wording.ts).
- **New files** get the copyright line, a synopsis, and a row in their folder's README. A new folder gets a README.
- **Before sending a change**, run:

  ```sh
  npm test            # unit tests, including the checks above
  npm run typecheck
  npx prettier --check <the files you changed>
  ```

  Database, browser and desktop tests need more set up; [`test/README.md`](test/README.md) says how to run each kind, and CI runs them all on every pull request.

- **Licence:** contributions are under the GPL, version 3 only, like the rest; see [licensing](docs/licensing.md).
