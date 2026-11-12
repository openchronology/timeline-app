# deploy/postgres-ci

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The PostgreSQL CI image (#605): PostgreSQL 16 with pgmp, on Playwright's Ubuntu 24.04 image.

- **Contents:** PostgreSQL 16 and its development files, pgmp built from the commit Compose's database image uses, GMP, SQLite, the C and C++ compilers, CMake, Python, Rust 1.99.0, and the Playwright image's Node.js, browsers and their system packages.
- **Publishing:** [`scripts/build-images.mjs`](../../scripts/build-images.mjs) builds it and the [build images workflow](../../.github/workflows/build-images.yml) publishes it to `ghcr.io/openchronology/postgres-ci`, tagged with a hash of the Dockerfile and `och-ci-postgres`.
- **In CI:** `ci.yml`'s PostgreSQL job runs in the image whose tag matches, on the project's own runner (`och-heavy`), or on GitHub's for pull requests from forks. It installs no packages and builds no pgmp, so it needs neither `sudo` nor Ubuntu's mirrors. When a branch changes the image, the job's `postgres-image` step builds and pushes it first. Following the systemd journal needs the runner's own journal, so that test runs in a separate job on GitHub's runner, against the image's database.
- **Base image:** the same Playwright image as the browser jobs, so `npx playwright install` has nothing to download. [`test/build-images.test.mjs`](../../test/build-images.test.mjs) checks the two match.

## A local test database

```sh
node scripts/build-images.mjs postgres-ci   # or pull the published image
docker run -d --name och-test-db -p 127.0.0.1:5433:5433 <image> och-ci-postgres --foreground
DATABASE_URL=postgresql://rational_test@127.0.0.1:5433/rational_app node test/measures-postgres.mjs
```

The database trusts every connection, so publish its port only to the loopback address. `docker stop` shuts PostgreSQL down cleanly. `PGPORT`, `PGUSER`, `PGDATABASE` and `PGDATA` change the port, superuser, database and data folder.

## Contents

| File                                 | What it is for                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [`Dockerfile`](Dockerfile)           | The image: PostgreSQL 16, pgmp, the native build tools and Rust, on Playwright's image.                |
| [`och-ci-postgres`](och-ci-postgres) | Starts a disposable test database with pgmp, in the background (CI) or until stopped (`--foreground`). |
