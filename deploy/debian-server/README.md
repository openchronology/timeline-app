# deploy/debian-server

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The `openchronology-server` .deb for Debian and Ubuntu (#116). The [Dockerfile](Dockerfile) builds it for one distribution; run it through [`scripts/server-package.mjs`](../../scripts/server-package.mjs) (`debian13` or `ubuntu24.04`), and check a package with `node test/server-deb.mjs`. These files are also the other packages' reference: the [RPM package](../rpm-server/README.md) installs the same services, configuration templates and commands, the [FreeBSD package](../freebsd-server/README.md) adapts the configuration templates, and the platform archive starts the server with `openchronology-server.mjs`. `@PG_MAJOR@` and similar placeholders are filled in when the package is built. `README.Debian` is the administrator's guide the package installs; keep it in step with any change here.

## Contents

| File                                                                         | What it is for                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`control.in`](control.in)                                                   | The package's Debian control file template: its name, dependencies and description.                                         |
| [`Dockerfile`](Dockerfile)                                                   | Builds the .deb for one distribution: och-convert and pgmp against its own libraries, the platform, and the package layout. |
| [`journald.env`](journald.env)                                               | The journald follower's configuration template, installed as `/etc/openchronology/journald.env`.                            |
| [`och-import-logs`](och-import-logs)                                         | The `och-import-logs` command: imports log files into timelines with the syslog configuration's API key.                    |
| [`openchronology-journald.service`](openchronology-journald.service)         | The systemd service that follows the journal into timelines.                                                                |
| [`openchronology-mail.service`](openchronology-mail.service)                 | The systemd service that delivers account email through Resend.                                                             |
| [`openchronology-migrate`](openchronology-migrate)                           | Brings the database up to the installed version's schema and restarts the server; run after each upgrade.                   |
| [`openchronology-reset-admin-password`](openchronology-reset-admin-password) | Resets the administrator's password to `ADMIN_INITIAL_PASSWORD` from the configuration (#118).                              |
| [`openchronology-server.mjs`](openchronology-server.mjs)                     | Starts the platform from an installed package, reading the configuration file as systemd does when started another way.     |
| [`openchronology-syslog.service`](openchronology-syslog.service)             | The systemd service that receives syslog messages into timelines.                                                           |
| [`openchronology.env`](openchronology.env)                                   | The server's configuration template, installed as `/etc/openchronology/openchronology.env`.                                 |
| [`openchronology.service`](openchronology.service)                           | The systemd service that runs the platform on 127.0.0.1:5173.                                                               |
| [`postinst`](postinst)                                                       | First installation: creates the user, configuration, database with pgmp and starts the server; on upgrades, advises.        |
| [`postrm`](postrm)                                                           | On purge, removes the configuration and says how to drop the database and user, which it keeps.                             |
| [`prerm`](prerm)                                                             | Stops (and on removal disables) the services before the package is removed or upgraded.                                     |
| [`README.Debian`](README.Debian)                                             | The administrator's guide the package installs: installing, configuring, upgrading, removing and its file layout.           |
| [`syslog.env`](syslog.env)                                                   | The syslog receiver's configuration template, installed as `/etc/openchronology/syslog.env`.                                |
