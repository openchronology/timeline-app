# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The FreeBSD server package's platform-independent part (#116): the editor and the Next.js
# platform, built on Linux. deploy/freebsd-server/build.sh then builds och-convert and pgmp on
# FreeBSD and makes the package. Use scripts/server-package.mjs freebsd14 (or freebsd15).
#   OCH_BUILD_COMMIT, OCH_BUILD_VERSION

# The Rust crates of och-convert, vendored into the platform's source archive.
FROM rust:1-bookworm AS native
WORKDIR /build
COPY native-store native-store
COPY vendor/sqlite-rational vendor/sqlite-rational
RUN cargo vendor --locked --manifest-path native-store/Cargo.toml /build/rust-dependencies

# The editor and the Next.js platform: plain JavaScript, the same for every distribution.
FROM node:24-bookworm-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
ARG OCH_BUILD_COMMIT
ARG OCH_BUILD_VERSION
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/rational-ordered-map-0.1.0.tgz vendor/
RUN npm ci
# As deploy/Dockerfile.app: the platform links its complete source, including the Rust
# crates of the bundled och-convert.
COPY scripts scripts
COPY LICENSE NOTICE THIRD_PARTY.md ./
COPY legal legal
COPY src src
COPY server server
COPY platform platform
COPY native-store native-store
COPY src-tauri src-tauri
COPY vendor vendor
COPY docs docs
COPY deploy deploy
COPY test test
COPY .github .github
COPY README.md compose.yml tsconfig.json pnpm-lock.yaml yarn.lock .yarnrc.yml .dockerignore .gitignore .env.example ./
COPY --from=native /build/rust-dependencies /app/rust-dependencies
RUN --mount=type=bind,target=/build-context \
    export OCH_BUILD_CONTEXT=/build-context OCH_BUILD_COMMIT="$OCH_BUILD_COMMIT" \
      OCH_BUILD_VERSION="$OCH_BUILD_VERSION" \
    && npm run build \
    && node scripts/source.mjs --rust-vendor /app/rust-dependencies \
    && cp dist/openchronology-web-source.tar.gz platform/public/

# The application, laid out as the Linux packages do, without their Linux-only image library
# (the platform does not optimize images) and without a Node.js runtime: FreeBSD's node24
# package provides it.
FROM debian:bookworm-slim AS tree
COPY --from=app /app/platform/.next/standalone /out/lib/openchronology/
COPY --from=app /app/platform/.next/static /out/lib/openchronology/platform/.next/static
COPY --from=app /app/platform/public /out/lib/openchronology/platform/public
COPY --from=app /app/dist /out/lib/openchronology/dist
COPY --from=app /app/package.json /out/lib/openchronology/
COPY --from=app /app/server /out/lib/openchronology/server
COPY --from=app /app/legal /out/lib/openchronology/legal
COPY deploy/debian-server/openchronology-server.mjs /out/lib/openchronology/openchronology-server.mjs
COPY LICENSE NOTICE THIRD_PARTY.md README.md /out/doc/
COPY docs /out/doc/
RUN rm -rf /out/lib/openchronology/node_modules/@img \
    && tar -C /out -czf /openchronology-app.tar.gz lib doc

FROM scratch AS export
COPY --from=tree /openchronology-app.tar.gz /
