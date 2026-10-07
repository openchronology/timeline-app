# Docker deployment

Run commands from `timeline-app` (or the root of its GitHub repository). Install Docker Engine with the Compose plugin. The suite builds PostgreSQL 16 with native GMP-backed pgmp, a Next.js App Router server on Node 24, and the native SQLite `.och` converter. Rust and Node build tools remain in separate build stages; the web container runs as the unprivileged `node` user.

```sh
cp .env.example .env
# Edit .env: choose a strong POSTGRES_PASSWORD.
docker compose up --build --wait
docker compose ps
```

Open <http://localhost:5173>. The first build downloads base images and locked dependencies and compiles both extensions. PostgreSQL becomes healthy first, the one-shot `migrate` service installs pgmp and the schema, and then the web server starts. `/healthz` checks database connectivity and the timeline schema. The migration container exiting successfully is expected. The web and database services restart automatically; Compose must complete migrations before starting a new web container.

There is one database password setting. Compose passes it using `PGPASSWORD`, so punctuation does not require URI encoding. Quote values containing `#` or `$` appropriately in `.env` (single quotes prevent interpolation). Keep `.env` private; it is excluded from the Docker build context. Changing this value after initialization does not change the password of an existing PostgreSQL account: rotate the database password and configuration together.

The database has no host port. The web port binds only to host loopback. PostgreSQL data lives in the named `timelines` volume, independent of container rebuilds.

```sh
docker compose logs -f app
docker compose logs migrate
docker compose down
docker compose up --wait
```

`down` preserves saved timelines. `down --volumes` deletes the database permanently; use it only for disposable environments.

## Rebuilding during development

`docker compose up --build --wait -d` is the correct command for seeing source changes in the container deployment. It builds the editor and Next.js platform together and recreates changed services. Refresh the browser afterward. For faster local frontend development, use `npm run dev` (or the equivalent pnpm/Yarn command) against PostgreSQL; it watches the editor and runs Next.js development routing. `npm start` needs a fresh `npm run build` after source changes.

## Public hosting

Set `APP_ORIGIN=https://timescale.info` and put an HTTPS reverse proxy on the same host in front of `127.0.0.1:5173`. The origin must exactly match the browser URL, without a trailing slash or path. Register OAuth providers and set their server-side variables following [authentication.md](authentication.md). Desktop clients can connect to that same public origin.

Set `TRUST_PROXY=1` only when the proxy overwrites `X-Forwarded-For` with a single client IP and the application port cannot be accessed directly. Next route handlers do not expose the socket peer address: without this trusted proxy, anonymous authentication attempts share a conservative rate-limit bucket. A proxy running in another container needs a Compose override connecting it to the app's network and forwarding to `app:5173`; its own loopback will not reach the host-bound port.

To supply an additional plugin catalogue, bind-mount its JSON file into `app` read-only and set `PLUGIN_LIBRARY` to its container path. See [plugins.md](plugins.md). Setting a host path without mounting it is insufficient.

## Upgrades and backups

Back up before upgrading. A plain SQL backup includes the extension declaration, account data, and timelines; restore it into a database with pgmp installed and the application stopped.

```sh
docker compose exec -T database pg_dump -U openchronology -d openchronology > openchronology-backup.sql
```

For an application upgrade, build first, stop the web server, explicitly rerun migrations even if its previous one-shot container has already completed, and recreate the web server:

```sh
docker compose build
docker compose stop app
docker compose run --rm migrate
docker compose up --wait --force-recreate app
```

If migration fails, leave the web server stopped and inspect its output before continuing. PostgreSQL major upgrades require a separate data migration; do not simply change the image major version against an existing volume. This setup uses one database account for both migrations and runtime; deployments needing separate database privileges can supply their own service configuration.

GitHub CI builds the images, boots an isolated stack, verifies exact pgmp arithmetic and bound queries, checks the HTTP session and static frontend, and round-trips SQLite files using the converter inside the actual web image.

Set `FEATURED_TIMELINES` in `.env` to comma-separated public timeline UUIDs for dashboard curation. The migration service installs full-text search and collaboration tables before starting the app.

## Transactional mail and account security

Configure `RESEND_API_KEY`, `AUTH_EMAIL_FROM` and a persistent 64-hex-character
`AUTH_ENCRYPTION_KEY` in `.env`, verify the sending domain in Resend, then run
`docker compose --profile mail up --build --wait -d`. This adds the retrying mail
worker to the database, migrations, and web server. Existing installations must
apply migrations before sign-in; existing users must confirm an email address.
Back up the encryption key separately and retain it across rebuilds. See
[authentication.md](authentication.md) for enrollment, recovery, and DNS setup.
