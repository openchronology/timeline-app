# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The PostgreSQL CI image (#605): PostgreSQL 16 with pgmp, the native build tools and Rust, on
# Playwright's image, which has the browsers and their system packages. ci.yml's PostgreSQL
# job runs in it, so it installs nothing from Ubuntu's mirrors and builds no pgmp. Locally it
# gives a test database with pgmp (README.md). scripts/build-images.mjs builds and publishes
# it (build-images.yml), tagged with a hash of this file and och-ci-postgres.
FROM mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d
# apt retries a failed download and gives up on a stalled mirror after 30 s (#367).
RUN printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries
# curl (the Rust installer, pgmp) retries too, giving up on an attempt that stalls below
# 1 kB/s for 30 s or takes over 3 minutes (#367).
RUN printf 'retry = 3\nretry-all-errors\nconnect-timeout = 30\nspeed-limit = 1024\nspeed-time = 30\nmax-time = 180\n' > /root/.curlrc
# Another Ubuntu archive mirror, such as Azure's for GitHub's runners.
ARG UBUNTU_MIRROR=
RUN if [ -n "$UBUNTU_MIRROR" ] && [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
      sed -i "s|http://archive.ubuntu.com/ubuntu/\?|$UBUNTU_MIRROR/|g" /etc/apt/sources.list.d/ubuntu.sources; \
    fi
ENV DEBIAN_FRONTEND=noninteractive
# PostgreSQL 16 (Ubuntu 24.04's own) without the cluster its package would create, and the
# tools that build pgmp, och-convert and the SQLite rational extension.
RUN mkdir -p /etc/postgresql-common/createcluster.d \
    && echo 'create_main_cluster = false' > /etc/postgresql-common/createcluster.d/no-main.conf \
    && apt-get update && apt-get install -y --no-install-recommends \
        postgresql-16 postgresql-server-dev-16 libgmp-dev libsqlite3-dev \
        build-essential cmake python3 curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
ENV PG_CONFIG=/usr/lib/postgresql/16/bin/pg_config PATH=/usr/lib/postgresql/16/bin:$PATH
# pgmp, the commit compose's database image builds (deploy/Dockerfile.postgres). PGXS
# otherwise tries to invoke the LLVM toolchain packaged with PostgreSQL.
ARG PGMP_COMMIT=1849585416f2bc3d070bf8cef6a659907687ec7f
RUN mkdir /tmp/pgmp && cd /tmp/pgmp \
    && curl -fsSL "https://codeload.github.com/dvarrazzo/pgmp/tar.gz/$PGMP_COMMIT" -o pgmp.tar.gz \
    && tar -xzf pgmp.tar.gz --strip-components=1 \
    && python3 tools/unmix.py < sql/pgmp.pysql > sql/pgmp--1.1.sql \
    && python3 tools/sql2extension.py --extname pgmp sql/pgmp--1.1.sql > sql/pgmp--unpackaged--1.1.sql \
    && make PG_CONFIG="$PG_CONFIG" with_llvm=no -j"$(nproc)" \
    && make PG_CONFIG="$PG_CONFIG" with_llvm=no install \
    && mkdir -p /usr/share/doc/pgmp && cp COPYING pgmp.tar.gz /usr/share/doc/pgmp/ \
    && cd / && rm -rf /tmp/pgmp
# A fixed Rust release, as every build of the project uses (#514), for any user.
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain 1.99.0 \
    && chmod -R a+rwX "$RUSTUP_HOME" "$CARGO_HOME"
# Starts a test database with pgmp (README.md).
COPY och-ci-postgres /usr/local/bin/och-ci-postgres
RUN chmod 0755 /usr/local/bin/och-ci-postgres
