# deploy/arch

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The AUR packages for Arch Linux (#331). [`scripts/aur-packages.mjs`](../../scripts/aur-packages.mjs) renders each PKGBUILD for a release's assets, with the files it names beside it, and stable releases push them to aur.archlinux.org (the `aur` job of the [release workflow](../../.github/workflows/release.yml), once the `AUR_SSH_KEY` secret holds an AUR account's private key).

- `openchronology-server` builds och-convert and pgmp from the release's [platform archive](../platform/README.md), for Arch's PostgreSQL, and lays the server out as the [Debian package](../debian-server/README.md) does, with its services, configuration templates and commands, running on Arch's Node.js (`/usr/lib/openchronology/node/bin/node` links to `/usr/bin/node`). As Arch packages do, installing it sets up nothing: `sudo openchronology-setup` (adapted from the RPM package's) initializes PostgreSQL if it is not yet, and creates the configuration and the database. Upgrades stop the services and say what to review, as the other packages do. [`test/server-arch.mjs`](../../test/server-arch.mjs) builds it with makepkg and installs, sets up, runs, upgrades and removes it in a fresh Arch container.
- `openchronology-desktop-bin` unpacks the release's desktop `.deb`. [`test/desktop-arch.mjs`](../../test/desktop-arch.mjs) builds and installs it, and checks every library it links is found.

## Contents

| File                                                                               | What it is for                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`openchronology-server.PKGBUILD.in`](openchronology-server.PKGBUILD.in)           | The server's PKGBUILD, with the version, the archive's address and the checksums to fill in.                   |
| [`openchronology-server.install`](openchronology-server.install)                   | pacman's scripts: what to run after installing, stopping the services for an upgrade, and what removal leaves. |
| [`openchronology-server.sysusers`](openchronology-server.sysusers)                 | The `openchronology` system user, and `openchronology-logs` for the log importers (#501).                      |
| [`openchronology-server.tmpfiles`](openchronology-server.tmpfiles)                 | Its home and configuration directories.                                                                        |
| [`openchronology-setup`](openchronology-setup)                                     | Sets up PostgreSQL, the configuration and the database after installing, and advises on upgrades.              |
| [`README.Arch`](README.Arch)                                                       | The administrator's README the server package installs.                                                        |
| [`openchronology-desktop-bin.PKGBUILD.in`](openchronology-desktop-bin.PKGBUILD.in) | The desktop app's PKGBUILD, from the release's `.deb`.                                                         |
