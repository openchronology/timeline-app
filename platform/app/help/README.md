# platform/app/help

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The help at `/help` (#172): the user guide, the FAQ and every page of `docs/`, by section, with search (`?q=`). Pages are read from `docs/` as the site runs by `server/help.mjs`; the help's frame and search results are in [`help-shell.jsx`](../../components/help-shell.jsx) and [`help-results.jsx`](../../components/help-results.jsx).

## Contents

| File                          | What it is for                                         |
| ----------------------------- | ------------------------------------------------------ |
| [`[page]/`]([page]/README.md) | One page of the help at `/help/<page>`.                |
| [`page.jsx`](page.jsx)        | The help's front page, or what it says about a search. |
