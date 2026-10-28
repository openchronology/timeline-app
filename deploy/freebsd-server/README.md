# deploy/freebsd-server

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The `openchronology-server` package for FreeBSD 14 and 15 (#116). It is made on FreeBSD, as root, by [`build.sh`](build.sh) from the platform archive that `node scripts/server-package.mjs freebsd14` (or `freebsd15`) builds on Linux; CI does this in a FreeBSD virtual machine and installs the result on a fresh one (`test/server-freebsd.mjs`). The configuration templates come from [`deploy/debian-server`](../debian-server/README.md), with FreeBSD's paths. Because pkg stops whatever its scripts leave running, a first installation is finished by running `openchronology-setup`. `README.FreeBSD` is the administrator's guide the package installs.

## Contents

| File                                                                         | What it is for                                                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`build.sh`](build.sh)                                                       | Makes the .pkg: builds och-convert and pgmp against FreeBSD's libraries and lays the server out under `/usr/local` with rc.d services.              |
| [`openchronology-migrate`](openchronology-migrate)                           | Brings the database up to the installed version's schema and restarts the server, the mail worker and the syslog receiver, each when it is enabled. |
| [`openchronology-reset-admin-password`](openchronology-reset-admin-password) | Resets the administrator's password to `ADMIN_INITIAL_PASSWORD` from the configuration (#118).                                                      |
| [`openchronology-setup`](openchronology-setup)                               | Finishes an installation: the configuration, PostgreSQL, the database with pgmp, the migration and the service; on upgrades, advises.               |
| [`openchronology.rc`](openchronology.rc)                                     | The rc.d service that runs the platform on 127.0.0.1:5173.                                                                                          |
| [`openchronology_mail.rc`](openchronology_mail.rc)                           | The rc.d service that delivers account email through Resend.                                                                                        |
| [`openchronology_syslog.rc`](openchronology_syslog.rc)                       | The rc.d service that receives syslog messages into timelines.                                                                                      |
| [`post-deinstall.sh`](post-deinstall.sh)                                     | After removal, says what was left behind (configuration, database, user) and how to delete it.                                                      |
| [`post-install.sh`](post-install.sh)                                         | After installation, says to run `openchronology-setup`, or advises on an upgrade.                                                                   |
| [`pre-deinstall.sh`](pre-deinstall.sh)                                       | Stops the services before the package is removed or upgraded.                                                                                       |
| [`pre-install.sh`](pre-install.sh)                                           | Creates the openchronology user and group, and stops the services before an upgrade.                                                                |
| [`README.FreeBSD`](README.FreeBSD)                                           | The administrator's guide the package installs: installing, configuring, upgrading and removing.                                                    |
