# deploy/windows-server

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The OpenChronology server installer for Windows (#116), `openchronology-server-windows-amd64-setup.exe`. [`build.ps1`](build.ps1) makes it on Windows from the [platform archive](../platform/README.md), bundling its own PostgreSQL 17 with pgmp, och-convert, Node.js and WinSW (for the server, syslog and email services), in an NSIS installer; CI installs, runs, upgrades and removes it (`test/server-windows.mjs`). The installation goes in Program Files, its configuration and database in `%ProgramData%\OpenChronology`. `README.Windows.txt` is the administrator's guide the installer shows and installs.

## Contents

| File                                                                                 | What it is for                                                                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`build.ps1`](build.ps1)                                                             | Builds the installer: downloads and checks the pinned dependencies, builds pgmp and och-convert with MSVC, stages and packs everything. |
| [`installer.nsi`](installer.nsi)                                                     | The NSIS installer script: installs into Program Files and runs `setup.ps1`, and `remove.ps1` on uninstall.                             |
| [`och-import-logs.cmd`](och-import-logs.cmd)                                         | The `och-import-logs` command: imports log files into timelines with the syslog configuration's API key.                                |
| [`openchronology-migrate.cmd`](openchronology-migrate.cmd)                           | Brings the database up to the installed version's schema and restarts the service.                                                      |
| [`openchronology-reset-admin-password.cmd`](openchronology-reset-admin-password.cmd) | Resets the administrator's password to `ADMIN_INITIAL_PASSWORD` from the configuration (#118).                                          |
| [`openchronology-mail-service.xml`](openchronology-mail-service.xml)                 | WinSW's definition of the OpenChronologyMail service (#125): account email delivery, started by hand once configured.                   |
| [`openchronology-service.xml`](openchronology-service.xml)                           | WinSW's definition of the OpenChronology Windows service, run as LocalService after the bundled PostgreSQL.                             |
| [`openchronology-syslog-service.xml`](openchronology-syslog-service.xml)             | WinSW's definition of the OpenChronologySyslog service (#125): the syslog receiver, started by hand once configured.                    |
| [`pgmp.sha256`](pgmp.sha256)                                                         | The SHA-256 checksum `build.ps1` checks the pinned pgmp source download against.                                                        |
| [`README.Windows.txt`](README.Windows.txt)                                           | The administrator's guide the installer shows and installs: installing, configuring, upgrading and removing.                            |
| [`remove.ps1`](remove.ps1)                                                           | Removes the server's Windows services before uninstalling, keeping the configuration and database.                                      |
| [`setup.ps1`](setup.ps1)                                                             | Sets up an installation: the configuration, the bundled PostgreSQL service, the database with pgmp, the migration and the service.      |
