# deploy/homebrew

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The OpenChronology server for macOS, as a Homebrew formula (#116). [`scripts/homebrew-formula.mjs`](../../scripts/homebrew-formula.mjs) renders `openchronology-server.rb.in` for a platform archive ([`deploy/platform`](../platform/README.md)), which carries these commands; stable releases push the formula and `tap-README.md` to the openchronology/homebrew-tap repository, and CI installs it from a local tap (`test/server-homebrew.mjs`). The formula fills in the commands' `@HOMEBREW_PREFIX@`, `@NODE@` and similar placeholders. `README.Homebrew` is the administrator's guide the formula installs.

## Contents

| File                                                                         | What it is for                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`cargo-config.toml`](cargo-config.toml)                                     | Cargo's configuration in the platform archive, so och-convert builds offline from its vendored crates.                            |
| [`och-import-logs`](och-import-logs)                                         | The `och-import-logs` command: imports log files into timelines with the syslog configuration's API key.                          |
| [`openchronology-agent`](openchronology-agent)                               | Runs the syslog receiver or email delivery as your launchd agent (#125): start, stop, restart and status.                         |
| [`openchronology-mail`](openchronology-mail)                                 | Delivers account email through Resend until stopped: in a terminal, or as a launchd agent (`openchronology-agent`).               |
| [`openchronology-migrate`](openchronology-migrate)                           | Brings the database up to the installed version's schema and restarts the service, and the mail and syslog agents, when they run. |
| [`openchronology-reset-admin-password`](openchronology-reset-admin-password) | Resets the administrator's password to `ADMIN_INITIAL_PASSWORD` from the configuration (#118).                                    |
| [`openchronology-server.rb.in`](openchronology-server.rb.in)                 | The formula template: builds och-convert and pgmp on the Mac and installs the server, its commands and its service.               |
| [`openchronology-setup`](openchronology-setup)                               | Finishes an installation: the configuration, PostgreSQL, the database with pgmp, the migration and the service.                   |
| [`openchronology-syslog`](openchronology-syslog)                             | Receives syslog messages into timelines until stopped: in a terminal, or as a launchd agent (`openchronology-agent`).             |
| [`README.Homebrew`](README.Homebrew)                                         | The administrator's guide the formula installs: installing, configuring, upgrading and removing.                                  |
| [`tap-README.md`](tap-README.md)                                             | The README of the openchronology/homebrew-tap repository, which releases publish beside the formula.                              |
