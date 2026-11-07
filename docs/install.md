# Installing a server

<!-- description: Install your own OpenChronology server: a package for Debian, Ubuntu, Fedora, RHEL, Arch, FreeBSD, macOS or Windows, Docker Compose, Nix, or from source. -->

An OpenChronology server is the website at [timescale.info](https://timescale.info): accounts, sharing, search and collaboration over PostgreSQL with the `pgmp` extension. Choose one way to install it:

- **[A package](#server-packages)** for your system, with everything but PostgreSQL inside.
- **[Docker Compose](#docker-compose)**, on any system with Docker.
- **[Nix and NixOS](#nix-and-nixos)**, with a NixOS module.
- **[From source](#from-source)**, onto a PostgreSQL you already run.

Whichever you choose, put an HTTPS reverse proxy in front and read [behind a proxy](#behind-a-proxy). Then see [administration](administration.md) for the first administrator, quotas and settings, and [authentication](authentication.md) for sign-in providers and email.

## Server packages

The whole server also installs as one package. It contains the platform, its Node.js runtime, the SQLite converter and the `pgmp` extension, and uses the distribution's PostgreSQL:

| Distribution            | Package                                                      | PostgreSQL  |
| ----------------------- | ------------------------------------------------------------ | ----------- |
| Debian 13               | `openchronology-server-debian13-amd64.deb`                   | 17          |
| Ubuntu 24.04            | `openchronology-server-ubuntu24.04-amd64.deb`                | 16          |
| Rocky Linux and RHEL 10 | `openchronology-server-rocky10-amd64.rpm`                    | 16          |
| Fedora 44               | `openchronology-server-fedora44-amd64.rpm`                   | 18          |
| Arch Linux (AUR)        | `openchronology-server`                                      | Arch's      |
| FreeBSD 14 and 15       | `openchronology-server-freebsd15-amd64.pkg` (or `freebsd14`) | 17          |
| macOS (Homebrew)        | `brew install openchronology/tap/openchronology-server`      | 17          |
| Windows                 | `openchronology-server-windows-amd64-setup.exe`              | 17, bundled |

```sh
sudo apt install ./openchronology-server-debian13-amd64.deb      # Debian and Ubuntu
sudo dnf install ./openchronology-server-fedora44-amd64.rpm      # Rocky, RHEL and Fedora
pkg install -y ./openchronology-server-freebsd15-amd64.pkg && openchronology-setup   # FreeBSD, as root
yay -S openchronology-server && sudo openchronology-setup   # Arch Linux, with any AUR helper
brew install openchronology/tap/openchronology-server && openchronology-setup     # macOS
```

(`dpkg -i` doesn't install dependencies; after it, run `sudo apt -f install`.) The first installation:

- creates the PostgreSQL role and database with `pgmp`;
- writes `/etc/openchronology/openchronology.env` with a new `AUTH_ENCRYPTION_KEY`;
- migrates and starts the `openchronology` service on `127.0.0.1:5173`.

RPM distributions and FreeBSD don't initialize PostgreSQL themselves, so those packages do it when it hasn't been done (`openchronology-setup`, which can also be run again by hand). Like FreeBSD's ports, the FreeBSD package starts nothing itself: run `openchronology-setup` after installing it. On macOS, Homebrew builds the converter and `pgmp` for the Mac from the release's `openchronology-server-platform.tar.gz`; there, `openchronology-setup` runs as you (Homebrew's PostgreSQL does too), and the server is the `openchronology-server` service of `brew services`. Stable releases publish the formula to [openchronology/homebrew-tap](https://github.com/openchronology/homebrew-tap). On Arch Linux, the AUR's `openchronology-server` builds the converter and `pgmp` from the same archive for Arch's PostgreSQL, runs on Arch's Node.js, and, as Arch packages do, leaves PostgreSQL and the database to `sudo openchronology-setup`; the AUR's `openchronology-desktop-bin` installs the desktop app from the release's `.deb`. Stable releases publish both ([deploy/arch](../deploy/arch/README.md)). On Windows, the installer is self-contained: it brings its own PostgreSQL 17 (EDB's binaries, with `pgmp` built for it), Node.js and WinSW, runs PostgreSQL and the server as Windows services, keeps the configuration and database in `C:\ProgramData\OpenChronology`, and migrates the database on upgrades ([README.Windows.txt](../deploy/windows-server/README.Windows.txt)). The FreeBSD package uses FreeBSD's own Node.js (`node24`) and runs as rc.d services (`openchronology`, `openchronology_mail`, `openchronology_syslog`), with its configuration in `/usr/local/etc/openchronology`. Edit the configuration and restart, and put an HTTPS reverse proxy in front; on SELinux systems, let the proxy connect with `setsebool -P httpd_can_network_connect 1`.

Upgrades keep the configuration and database, stop the server, and list the settings that are new in this version's template. Review them, back up, then run `sudo openchronology-migrate`, which migrates and starts the server again. `/usr/share/doc/openchronology-server/README.Debian` (or `README.RPM`, `README.Arch`, `README.FreeBSD`, `README.Homebrew`, `README.Windows.txt`) covers configuration, email, the syslog receiver, upgrades and removal.

Releases attach every package, and every push to `main` builds them as artifacts of the CI run. Build them yourself with Docker (`node scripts/server-package.mjs [debian13|ubuntu24.04|rocky10|fedora44]`, into `server-artifacts/`). They download the Node.js they bundle from nodejs.org unless `OCH_NODE_TARBALL` names one already downloaded (`node scripts/node-tarball.mjs <folder>` downloads and checks it); either way it must match the Dockerfile's checksum. For FreeBSD, `node scripts/server-package.mjs freebsd15` builds the platform, and `sh deploy/freebsd-server/build.sh` on FreeBSD (as root) makes the package. CI does both in a FreeBSD virtual machine, then installs the package on a fresh one (`test/server-freebsd.mjs`). Check one with `node test/server-deb.mjs` or `node test/server-rpm.mjs` and the package's path. Those tests install, run, upgrade and remove it in a fresh container.

## Docker Compose

```sh
cp .env.example .env
# Set strong, different POSTGRES_PASSWORD and APP_DATABASE_PASSWORD in .env.
docker compose up --build --wait
docker compose logs -f app
```

Open http://localhost:5173 after startup. See [the Docker deployment guide](docker.md) for upgrades, backups, and production configuration. Compose passes PostgreSQL connection variables directly, so special characters in passwords do not need URL encoding.

The database has a persistent volume and no published database port. A migration service creates the extension and schema before the application starts. The app binds to `127.0.0.1:5173` on the host. For public hosting, put an HTTPS reverse proxy in front of that port and set `APP_ORIGIN` to the exact external origin, `https://timescale.info`. Secure session cookies are selected from that origin. `APP_ORIGIN` has no trailing slash or path.

## Nix and NixOS

The repository is a Nix flake (see [Nix and NixOS](nix.md)): it builds the server, the desktop app, `och-convert` and `pgmp` from source, and its NixOS module runs a server with PostgreSQL:

```nix
services.openchronology = {
  enable = true;
  origin = "https://timelines.example.org";
  nginx.enable = true;
  environmentFile = "/run/secrets/openchronology.env";
};
```

`nix run github:openchronology/timeline-app#openchronology-desktop` runs the desktop app. `nix flake check` builds everything and runs the module's NixOS test.

## From source

Compose also builds and installs the isolated SQLite file converter. For an existing PostgreSQL installation with pgmp available:

```sh
npm ci
npm run build
export DATABASE_URL='postgresql://user:password@localhost/openchronology'
export APP_ORIGIN='http://localhost:5173'
npm run migrate
# Optional web .och exchange (install Rust, CMake, SQLite/GMP development packages):
cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert
npm start
```

The migration account needs permission to install pgmp and create objects. A production runtime account needs CRUD access to the `oc_*` tables and sequence-free IDs; it does not need to install extensions. The supplied Compose configuration uses one database account for a straightforward initial deployment.

## Behind a proxy

**Set `TRUST_PROXY=1` behind that proxy, or anonymous visitors share one rate limit.** Without it, the server counts each request under the address it connected from, and behind a proxy that is the proxy's (under Compose, Docker's gateway), so every request appears to come from the same address. Limits that are meant per address (about ten attempts a minute) then apply to everyone at once: password sign-in and registration, social and desktop sign-in starts, email verification and password-reset links, two-factor completion, guests loading or copying a public timeline into their browser, and [reports](moderation.md) from signed-out readers. SQLite downloads are also limited per address, so signed-in users share that limit too. A single busy or abusive client can make these fail for everyone with "Too many sign-in attempts. Please wait a minute." Other signed-in actions are limited per account and are unaffected. Enable it only when the proxy overwrites `X-Forwarded-For` with the one client address and the app port is not reachable directly; otherwise anyone could choose their own address. The server logs a warning when a proxy on the same machine sends `X-Forwarded-For` while `TRUST_PROXY` is not 1. See [Docker deployment](docker.md) and [authentication](authentication.md).

## What a server holds

The server uses PostgreSQL with the real pgmp extension. Accounts own private timelines by default. Owners control visibility, access and deletion. They can add viewers, contributors and writers. Public access grants viewing to everyone; signed-in users can propose changes, while only owners/writers update upstream. Profiles are at `/<username>` and timelines at `/<username>/<slug>`, or `/<username>/<uuid>` until their owner chooses a slug; `/timelines/<uuid>` and old `#timeline/<uuid>` bookmarks lead there ([addresses](sharing.md#addresses)).

Saving uses an atomic snapshot replacement with revision checks. Edits made while others saved merge onto the latest revision; conflicting edits return HTTP 409, naming them, instead of silently overwriting another editor ([saving while others save](collaboration.md#saving-while-others-save)). This version permits 200,000 moments per document by default and 16 MiB per HTTP request. A self-hosted server changes that limit with `TIMELINE_ENTRY_LIMIT` ([Timeline size](administration.md#timeline-size)). Viewer queries only fetch the visible summaries and bounded pages of moments. An editor currently downloads the full document and rebuilds its browser map. Sparse saves update the database index in place, at a cost that grows with the logarithm of the timeline's size ([incremental saves](architecture.md#incremental-saves)). Streaming very large imports is future work.

Public historical examples can be installed with `docker compose run --rm seed` after the stack starts, or `npm run seed` / `pnpm seed` / `yarn seed` with a migrated PostgreSQL database. See [seeding](seeding.md) for the six featured timelines, source/date conventions, and secure management access. Set `FEATURED_TIMELINES` to public timeline UUIDs for the dashboard's featured list.
