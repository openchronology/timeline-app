# Nix and NixOS

<!-- description: Install OpenChronology with Nix or NixOS: the flake's packages, nix-env without flakes, and the NixOS module that runs a server with PostgreSQL. -->

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The repository is a Nix flake ([#461](https://github.com/openchronology/timeline-app/issues/461)). It builds OpenChronology from source and has a NixOS module that runs a server, with PostgreSQL and the `pgmp` extension, as the Debian package does.

## Packages

| Package                  | What it is                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `openchronology-server`  | The server and the website, with its commands (the default package)                                |
| `openchronology-desktop` | The desktop app, for Linux                                                                         |
| `och-convert`            | The `.och` file converter, which the server uses for desktop files                                 |
| `pgmp`                   | The PostgreSQL extension that stores exact times, built for the PostgreSQL of the package set used |

They build for `x86_64-linux` and `aarch64-linux`. To try the desktop app, or the server's commands:

```sh
nix run github:openchronology/timeline-app#openchronology-desktop
nix profile install github:openchronology/timeline-app#openchronology-server
```

A release's packages are at its tag: `github:openchronology/timeline-app/<tag>`. Without one, they are `main`'s.

Without flakes, `default.nix` gives `nix-env` and `nix-build` the same packages, from a release's archive:

````sh
nix-env -f https://github.com/openchronology/timeline-app/archive/<tag>.tar.gz -iA openchronology-desktop
``` The server's commands are the Debian package's:

- `openchronology-server`, `openchronology-migrate` and `openchronology-reset-admin-password`;
- the workers: `openchronology-mail`, `openchronology-syslog`, `openchronology-github` and `openchronology-journald`;
- `och-import-logs` and `och-import-github`.

They read their settings from the environment, or from a file named by `OCH_CONFIG`.

The packages pin their dependencies by the project's own lockfiles (`package-lock.json`, and `Cargo.lock` for the converter and the desktop app), so they need no hashes of their own. Only pgmp's download has one.

## A server on NixOS

Add the flake to your system's flake, then turn the service on:

```nix
{
  # A release's tag after the repository's name pins that release.
  inputs.openchronology.url = "github:openchronology/timeline-app";

  outputs =
    { nixpkgs, openchronology, ... }:
    {
      nixosConfigurations.timelines = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          openchronology.nixosModules.default
          {
            services.openchronology = {
              enable = true;
              origin = "https://timelines.example.org";
              nginx.enable = true;
              environmentFile = "/run/secrets/openchronology.env";
              settings.PLATFORM_NAME = "Our timelines";
            };
            services.nginx.virtualHosts."timelines.example.org" = {
              enableACME = true;
              forceSSL = true;
            };
            security.acme = {
              acceptTerms = true;
              defaults.email = "admin@example.org";
            };
            networking.firewall.allowedTCPPorts = [
              80
              443
            ];
          }
        ];
      };
    };
}
````

What the module sets up:

- **A system user**, `openchronology`.
- **PostgreSQL**, with `pgmp`, and the `openchronology` database and role. The server reaches it over the Unix socket, by peer authentication.
- **An encryption key**, `AUTH_ENCRYPTION_KEY`, generated on first start in `/var/lib/openchronology/generated.env`. It encrypts authenticator secrets: back it up apart from the database. To give your own, put it in the environment file instead.
- **`openchronology.service`**, which migrates the database each time it starts, then runs the server, with the Debian unit's hardening. Upgrading the flake input and switching migrates and restarts it.
- **With `nginx.enable`, a virtual host** for the origin's host. It sets `TRUST_PROXY`, since nginx replaces `X-Forwarded-For` with the client's address. Its location sets its own proxy headers and turns off `services.nginx.recommendedProxySettings` there, which would send `X-Forwarded-For` a second time and make every client look like nginx. Add `enableACME` and `forceSSL` for HTTPS, as above.

### Options

| Option                                             | Default                | What it does                                                                                             |
| -------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `enable`                                           | `false`                | Runs OpenChronology                                                                                      |
| `origin`                                           | (required)             | The public origin, exactly as people reach it (`APP_ORIGIN`)                                             |
| `host`, `port`                                     | `127.0.0.1`, 5173      | Where the server listens                                                                                 |
| `settings`                                         | `{ }`                  | Any other setting of `openchronology.env`, such as `PLATFORM_NAME` or `TIMELINE_LINK_LIMIT`              |
| `environmentFile`                                  | `null`                 | A file of `KEY=value` secrets, read by every service, overriding `settings`                              |
| `database.createLocally`                           | `true`                 | Runs PostgreSQL here. Otherwise set `DATABASE_URL`, to a database that has `pgmp`                        |
| `mail.enable`                                      | `false`                | The account email worker (Resend)                                                                        |
| `syslog.enable`, `.settings`, `.environmentFile`   | `false`, `{ }`, `null` | The [syslog receiver](syslog.md), and a file of its own secrets (`OCH_API_KEY`)                          |
| `github.enable`, `.settings`, `.environmentFile`   | `false`, `{ }`, `null` | The [GitHub receiver](github.md), and a file of its own secrets (`OCH_API_KEY`, `GITHUB_WEBHOOK_SECRET`) |
| `journald.enable`, `.settings`, `.environmentFile` | `false`, `{ }`, `null` | The [journald follower](journald.md), and a file of its own secrets (`OCH_API_KEY`)                      |
| `nginx.enable`, `.hostName`                        | `false`, origin's      | An nginx virtual host in front of the server                                                             |
| `package`                                          | the flake's server     | The server package to run                                                                                |

**Keep secrets out of `settings`:** it is written to the Nix store, which every user of the machine can read. Secrets include `RESEND_API_KEY`, `ADMIN_INITIAL_PASSWORD`, sign-in providers' client secrets, and the log importers' `OCH_API_KEY`. Put them in `environmentFile` (the log importers' key in their own, below), for example with [sops-nix](https://github.com/Mic92/sops-nix) or [agenix](https://github.com/ryantm/agenix).

### The first administrator

As with the other packages, set `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` (at least 15 characters) in the environment file before the first start. The server creates that account once. See [administration](administration.md). Once you have signed in and changed the password, remove `ADMIN_INITIAL_PASSWORD` from the environment file, so it no longer holds a working password. `openchronology-reset-admin-password` resets its password to one written there again; run it as the `openchronology` user, with the same environment.

### Log importers

The syslog receiver and the journald follower post to the server's API with an API key. Make one as an administrator, put it as `OCH_API_KEY` in an environment file of their own, then:

```nix
services.openchronology.syslog = {
  enable = true;
  environmentFile = "/run/secrets/openchronology-syslog.env";
  settings = {
    SYSLOG_HOST = "0.0.0.0";
    SYSLOG_ROUTES = "/etc/openchronology/syslog-routes.json";
  };
};
```

`SYSLOG_HOST = "0.0.0.0"` receives from other machines. The receiver has no TLS or sender authentication, so anyone who can reach its port can add messages to the routed timelines: open the port (5514, UDP and TCP, by default) only to the machines that send, for example on their interface with `networking.firewall.interfaces.<name>.allowedUDPPorts` and `.allowedTCPPorts`, not in `networking.firewall.allowedUDPPorts` for every network. NixOS's firewall blocks it until you open it.

Both run as their own system user, `openchronology-logs`, not as `openchronology` (#501). They read only their own `settings` and `environmentFile`, not the server's settings, `environmentFile` or generated key, and have no role in the database. Make the files their settings name (`SYSLOG_ROUTES`, `JOURNALD_ROUTES`, `JOURNALD_SSH_KEY`, `JOURNALD_KNOWN_HOSTS`) readable by that user, for example with sops-nix's or agenix's `owner` or `group`. Before #501 they read the server's `environmentFile`: move their `OCH_API_KEY` to `syslog.environmentFile` and `journald.environmentFile`. The module warns while either is unset.

The journald follower runs with the `systemd-journal` group, so it can read the journal, and keeps its cursor in `/var/lib/openchronology-journald`.

The [GitHub receiver](github.md) runs the same way, as `openchronology-logs` with its own `settings` and `environmentFile`. Give it `OCH_API_KEY` and `GITHUB_WEBHOOK_SECRET` (and `GITHUB_TOKEN`, for project boards) in that file:

```nix
services.openchronology.github = {
  enable = true;
  environmentFile = "/run/secrets/openchronology-github.env";
  settings.GITHUB_ROUTES = "/etc/openchronology/github-routes.json";
};
```

It listens on `127.0.0.1:5580`; put it behind the nginx virtual host, or another reverse proxy that provides HTTPS, for GitHub to reach it. It keeps each item's board column in `/var/lib/openchronology-github` (`GITHUB_STATE`).

### Backups and upgrades

The database is PostgreSQL's, in its usual place: back it up with `pg_dump openchronology` as the `postgres` user, or with `services.postgresqlBackup`. Keep `/var/lib/openchronology/generated.env` with it. An upgrade migrates the database as the server starts. Back up before switching to a new release, as there is no going back from a migration.

## Binary cache

Releases push what they build to the project's [Cachix](https://www.cachix.org) cache, `openchronology`, and CI reads from it.

- **Address:** `https://openchronology.cachix.org`.
- **Public key:** `openchronology.cachix.org-1:6w2e4xOQ6CcjLNSILS23JpQ2CPjDtkRP2NX7NsQ8TVc=`.
- **The flake offers it:** its `nixConfig` names the cache. Nix asks whether to trust that the first time you build from the flake, unless your user is trusted or you pass `--accept-flake-config`.
- **On NixOS:** add it for the whole machine:

  ```nix
  nix.settings = {
    substituters = [ "https://openchronology.cachix.org" ];
    trusted-public-keys = [ "openchronology.cachix.org-1:6w2e4xOQ6CcjLNSILS23JpQ2CPjDtkRP2NX7NsQ8TVc=" ];
  };
  ```

- **In the workflows:** the release workflow pushes when the `CACHIX_CACHE` variable and `CACHIX_AUTH_TOKEN` secret are set, and otherwise says it skipped.

Without the cache, or for a commit no release has built, Nix builds from source: a few minutes for the server, longer for the desktop app.

## Checking it

`nix flake check` builds the packages and runs the NixOS test (`nix/test.nix`), which needs KVM to be quick. The test boots a machine with the module and nginx, then checks that:

- the server answers through nginx, which names itself without its version (`serverTokens` is off), and PostgreSQL has `pgmp`;
- the configured administrator can sign in, save a timeline, find it in the search, and download it as an `.och` file;
- the encryption key survives a restart.

CI runs it on changes to the Nix files and on releases.
