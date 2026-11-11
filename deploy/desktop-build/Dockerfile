# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The Linux desktop build image (#605): Ubuntu 24.04 with everything the desktop app's Linux
# jobs install, so they install nothing from Ubuntu's mirrors. The .deb and AppImage builds
# (desktop.yml) and the desktop UI test (ci.yml's desktop-ui) run in it when it is published.
# Locally it builds and tests src-tauri on machines without WebKitGTK:
#   docker run --rm -v "$PWD":/w -w /w ghcr.io/openchronology/desktop-build:<tag> \
#     cargo test --manifest-path src-tauri/Cargo.toml --locked
# scripts/build-images.mjs builds and publishes it (build-images.yml), tagged with a hash of
# this file.
FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852
# apt retries a failed download and gives up on a stalled mirror after 30 s (#367).
RUN printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries
# curl (the Rust installer, Node.js) retries too, giving up on an attempt that stalls below
# 1 kB/s for 30 s or takes over 3 minutes (#367).
RUN printf 'retry = 3\nretry-all-errors\nconnect-timeout = 30\nspeed-limit = 1024\nspeed-time = 30\nmax-time = 180\n' > /root/.curlrc
# Another Ubuntu archive mirror, such as Azure's for GitHub's runners.
ARG UBUNTU_MIRROR=
RUN if [ -n "$UBUNTU_MIRROR" ] && [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
      sed -i "s|http://archive.ubuntu.com/ubuntu/\?|$UBUNTU_MIRROR/|g" /etc/apt/sources.list.d/ubuntu.sources; \
    fi
ENV DEBIAN_FRONTEND=noninteractive
# The desktop build's and desktop UI test's packages (desktop.yml, ci.yml), and what GitHub's
# runner image otherwise provides them: git for the build identity, file and xz for the
# AppImage, and xauth for xvfb-run.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake pkg-config curl ca-certificates git xz-utils file xauth \
        libgmp-dev libsqlite3-dev libssl-dev libwebkit2gtk-4.1-dev libgtk-3-dev \
        libayatana-appindicator3-dev librsvg2-dev webkit2gtk-driver xvfb \
    && rm -rf /var/lib/apt/lists/*
# Node.js, pinned and checked, as the server packages bundle it (scripts/node-tarball.mjs).
# CI's setup-node puts its own first; this one serves local runs.
ARG NODE_VERSION=24.21.0
ARG NODE_SHA256=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE \
    && rm /tmp/node.tar.xz
# A fixed Rust release, as every build of the project uses (#514), for any user, and the
# pinned tauri-driver the desktop UI test drives the app with.
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain 1.99.0 --component rustfmt \
    && cargo install tauri-driver --version 2.1.0 --locked \
    && rm -rf "$CARGO_HOME/registry" "$CARGO_HOME/git" \
    && chmod -R a+rwX "$RUSTUP_HOME" "$CARGO_HOME"
