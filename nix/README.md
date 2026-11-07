# nix

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The Nix derivations and NixOS module that [`flake.nix`](../flake.nix) puts together (#461; [docs/nix.md](../docs/nix.md)). They build from the repository's source, pinning dependencies by its own lockfiles.

## Contents

| File                                 | What it is for                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`desktop.nix`](desktop.nix)         | The desktop app for Linux, built with nixpkgs' Tauri hook from `src-tauri`.                                    |
| [`module.nix`](module.nix)           | `services.openchronology`: the server, its database with pgmp, its key, workers and an nginx virtual host.     |
| [`och-convert.nix`](och-convert.nix) | The `.och` file converter, from `native-store` with the vendored SQLite rational extension.                    |
| [`pgmp.nix`](pgmp.nix)               | The pgmp PostgreSQL extension, at the commit the Dockerfiles pin, for any PostgreSQL's package set.            |
| [`server.nix`](server.nix)           | The server and website, built from source and laid out as the Debian package installs them, with its commands. |
| [`test-client.mjs`](test-client.mjs) | The NixOS test's client: signs in, saves, searches and downloads a timeline as `.och`.                         |
| [`test.nix`](test.nix)               | The NixOS test of the module, which boots a machine with it, nginx and the syslog receiver on its own user.    |
