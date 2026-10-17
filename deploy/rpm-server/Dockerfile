# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Builds openchronology-server-<version>.x86_64.rpm for one distribution (#116). Use
# scripts/server-package.mjs, which passes these arguments and collects the package:
#   BASE         rockylinux/rockylinux:10 or fedora:44
#   RPM_VERSION, RPM_RELEASE (1.el10, 1.fc44), OCH_BUILD_COMMIT, OCH_BUILD_VERSION
# The services, configuration and commands are the Debian package's (deploy/debian-server).
ARG BASE=fedora:44

# och-convert and pgmp, built on the target distribution against its own libraries and the
# PostgreSQL it ships.
FROM ${BASE} AS native
# PostgreSQL's development files are in CodeReady Builder (CRB) on Rocky and RHEL. PGXS
# builds with the distribution's compiler settings, from redhat-rpm-config.
RUN set -eu; \
    if grep -q '^ID=.*rocky\|^ID_LIKE=.*rhel' /etc/os-release; then \
      dnf -y install dnf-plugins-core && dnf config-manager --set-enabled crb; \
    fi; \
    dnf -y install gcc gcc-c++ make cmake pkgconf-pkg-config python3 curl-minimal ca-certificates \
        gmp-devel sqlite-devel postgresql-server-devel redhat-rpm-config \
    && dnf clean all
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
    && make PG_CONFIG=/usr/bin/pg_config with_llvm=no -j2 \
    && make PG_CONFIG=/usr/bin/pg_config with_llvm=no DESTDIR=/stage install \
    && pg_config --version | sed -E 's/^PostgreSQL ([0-9]+).*/\1/' > /stage/pg-major

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
ARG RPM_VERSION
ARG RPM_RELEASE=1
# Node.js runtime, pinned and checked (https://nodejs.org/dist/v24.21.0/SHASUMS256.txt).
ARG NODE_VERSION=24.21.0
ARG NODE_SHA256=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
RUN dnf -y install rpm-build curl-minimal xz && dnf clean all
WORKDIR /root
ENV ROOT=/root/package APP=/root/package/usr/lib/openchronology
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o node.tar.xz \
    && echo "${NODE_SHA256}  node.tar.xz" | sha256sum -c - \
    && mkdir -p "$APP/node" \
    && tar -xJf node.tar.xz -C "$APP/node" --strip-components=1 \
       "node-v${NODE_VERSION}-linux-x64/bin/node" "node-v${NODE_VERSION}-linux-x64/LICENSE" \
    && rm node.tar.xz
# The application, laid out as in the Debian package.
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
COPY --from=native /stage/pg-major /root/pg-major
COPY --from=native /build/pgmp/COPYING ${ROOT}/usr/share/doc/openchronology-server/pgmp/COPYING
# The docs first, so the project's README, not docs/README.md, is the one installed.
COPY docs ${ROOT}/usr/share/doc/openchronology-server/
COPY LICENSE NOTICE THIRD_PARTY.md README.md ${ROOT}/usr/share/doc/openchronology-server/
COPY deploy/debian-server/ /root/shared/
COPY deploy/rpm-server/ /root/rpm/
RUN set -eu; \
    PG_MAJOR=$(cat /root/pg-major); \
    doc="$ROOT/usr/share/doc/openchronology-server"; \
    install -D -m 0644 "$APP/node/LICENSE" "$doc/node/LICENSE"; rm "$APP/node/LICENSE"; \
    sed "s/@PG_MAJOR@/$PG_MAJOR/g" /root/rpm/README.RPM > "$doc/README.RPM"; \
    install -D -m 0644 /root/shared/openchronology.env "$ROOT/usr/share/openchronology/openchronology.env.example"; \
    install -D -m 0644 /root/shared/syslog.env "$ROOT/usr/share/openchronology/syslog.env.example"; \
    install -D -m 0644 /root/shared/journald.env "$ROOT/usr/share/openchronology/journald.env.example"; \
    for unit in openchronology openchronology-mail openchronology-syslog openchronology-journald; do \
      sed 's|README.Debian|README.RPM|' "/root/shared/$unit.service" > "/root/$unit.service"; \
      install -D -m 0644 "/root/$unit.service" "$ROOT/usr/lib/systemd/system/$unit.service"; \
    done; \
    install -D -m 0755 /root/shared/openchronology-migrate "$ROOT/usr/sbin/openchronology-migrate"; \
    install -D -m 0755 /root/shared/openchronology-reset-admin-password "$ROOT/usr/sbin/openchronology-reset-admin-password"; \
    install -D -m 0755 /root/rpm/openchronology-setup "$ROOT/usr/sbin/openchronology-setup"; \
    install -D -m 0755 /root/shared/och-import-logs "$ROOT/usr/bin/och-import-logs"; \
    find "$ROOT" -type d -exec chmod 0755 {} +; \
    sed -e "s/@VERSION@/$RPM_VERSION/" -e "s/@RELEASE@/$RPM_RELEASE/" \
        -e "s/@PG_MAJOR@/$PG_MAJOR/g" -e "s/@NODE_VERSION@/$NODE_VERSION/" \
        /root/rpm/openchronology-server.spec.in > /root/openchronology-server.spec; \
    rpmbuild -bb --define "_topdir /root/rpmbuild" --define "staged $ROOT" \
      /root/openchronology-server.spec; \
    mkdir /out; cp /root/rpmbuild/RPMS/x86_64/*.rpm /out/

FROM scratch AS export
COPY --from=package /out/ /
