# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Builds openchronology-server_<version>_amd64.deb for one distribution. Use
# scripts/server-deb.mjs, which passes these arguments and collects the package:
#   BASE      debian:trixie or ubuntu:24.04   PG_MAJOR  17 or 16 (that distribution's server)
#   DEB_VERSION, OCH_BUILD_COMMIT, OCH_BUILD_VERSION
ARG BASE=debian:trixie

# och-convert and pgmp, built on the target distribution against its own libraries.
FROM ${BASE} AS native
ARG PG_MAJOR=17
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake pkg-config curl ca-certificates python3 \
        libgmp-dev libsqlite3-dev postgresql-server-dev-${PG_MAJOR} \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
ENV PATH=/root/.cargo/bin:$PATH
WORKDIR /build
COPY native-store native-store
COPY vendor/sqlite-rational vendor/sqlite-rational
RUN cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert \
    && cargo vendor --locked --manifest-path native-store/Cargo.toml /build/rust-dependencies
# The same pinned pgmp as deploy/Dockerfile.postgres.
ARG PGMP_COMMIT=1849585416f2bc3d070bf8cef6a659907687ec7f
WORKDIR /build/pgmp
RUN curl -fsSL --retry 3 "https://codeload.github.com/dvarrazzo/pgmp/tar.gz/$PGMP_COMMIT" -o /build/pgmp.tar.gz \
    && tar -xzf /build/pgmp.tar.gz --strip-components=1 \
    && python3 tools/unmix.py < sql/pgmp.pysql > sql/pgmp--1.1.sql \
    && python3 tools/sql2extension.py --extname pgmp sql/pgmp--1.1.sql > sql/pgmp--unpackaged--1.1.sql \
    && make PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config with_llvm=no -j2 \
    && make PG_CONFIG=/usr/lib/postgresql/${PG_MAJOR}/bin/pg_config with_llvm=no DESTDIR=/stage install

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

# The package.
FROM ${BASE} AS package
ARG PG_MAJOR=17
ARG DEB_VERSION
# Node.js runtime, pinned and checked (https://nodejs.org/dist/v24.21.0/SHASUMS256.txt).
ARG NODE_VERSION=24.21.0
ARG NODE_SHA256=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /root
ENV ROOT=/root/package APP=/root/package/usr/lib/openchronology
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o node.tar.xz \
    && echo "${NODE_SHA256}  node.tar.xz" | sha256sum -c - \
    && mkdir -p "$APP/node" \
    && tar -xJf node.tar.xz -C "$APP/node" --strip-components=1 \
       "node-v${NODE_VERSION}-linux-x64/bin/node" "node-v${NODE_VERSION}-linux-x64/LICENSE" \
    && rm node.tar.xz
# The application, laid out as in deploy/Dockerfile.app.
COPY --from=app /app/platform/.next/standalone ${APP}/
COPY --from=app /app/platform/.next/static ${APP}/platform/.next/static
COPY --from=app /app/platform/public ${APP}/platform/public
COPY --from=app /app/dist ${APP}/dist
COPY --from=app /app/package.json ${APP}/
COPY --from=app /app/server ${APP}/server
COPY --from=app /app/legal ${APP}/legal
COPY deploy/debian-server/openchronology-server.mjs ${APP}/openchronology-server.mjs
COPY --from=native /build/native-store/target/release/och-convert ${APP}/bin/och-convert
COPY --from=native /stage/usr/ ${ROOT}/usr/
COPY --from=native /build/pgmp/COPYING ${ROOT}/usr/share/doc/openchronology-server/pgmp/COPYING
COPY LICENSE NOTICE THIRD_PARTY.md README.md ${ROOT}/usr/share/doc/openchronology-server/
COPY docs ${ROOT}/usr/share/doc/openchronology-server/
COPY deploy/debian-server/ /root/debian/
RUN set -eu; \
    doc="$ROOT/usr/share/doc/openchronology-server"; \
    install -D -m 0644 "$APP/node/LICENSE" "$doc/node/LICENSE"; rm "$APP/node/LICENSE"; \
    sed "s/@PG_MAJOR@/$PG_MAJOR/g" /root/debian/README.Debian > "$doc/README.Debian"; \
    install -D -m 0644 /root/debian/openchronology.env "$ROOT/usr/share/openchronology/openchronology.env.example"; \
    install -D -m 0644 /root/debian/syslog.env "$ROOT/usr/share/openchronology/syslog.env.example"; \
    for unit in openchronology openchronology-mail openchronology-syslog; do \
      install -D -m 0644 "/root/debian/$unit.service" "$ROOT/usr/lib/systemd/system/$unit.service"; \
    done; \
    install -D -m 0755 /root/debian/openchronology-migrate "$ROOT/usr/sbin/openchronology-migrate"; \
    install -D -m 0755 /root/debian/openchronology-reset-admin-password "$ROOT/usr/sbin/openchronology-reset-admin-password"; \
    install -D -m 0755 /root/debian/och-import-logs "$ROOT/usr/bin/och-import-logs"; \
    mkdir -p "$ROOT/DEBIAN"; \
    for script in postinst prerm postrm; do \
      sed "s/@PG_MAJOR@/$PG_MAJOR/g" "/root/debian/$script" > "$ROOT/DEBIAN/$script"; \
      chmod 0755 "$ROOT/DEBIAN/$script"; \
    done; \
    find "$ROOT" -path "$ROOT/DEBIAN" -prune -o -type d -exec chmod 0755 {} +; \
    sed -e "s/@VERSION@/$DEB_VERSION/" -e "s/@PG_MAJOR@/$PG_MAJOR/g" \
        -e "s/@NODE_VERSION@/$NODE_VERSION/" \
        -e "s/@INSTALLED_SIZE@/$(du -sk --exclude=DEBIAN "$ROOT" | cut -f1)/" \
        /root/debian/control.in > "$ROOT/DEBIAN/control"; \
    mkdir /out; \
    dpkg-deb --root-owner-group -Zxz --build "$ROOT" "/out/openchronology-server_${DEB_VERSION}_amd64.deb"

FROM scratch AS export
COPY --from=package /out/ /
