# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The desktop UI benchmarks need WebKitWebDriver, which some systems do not package; this
# Ubuntu 24.04 image (as CI uses) has it. See docs/benchmarks.md#desktop.
#
#   docker build -t och-desktop-ui -f bench/ui/desktop.Dockerfile bench/ui
#   docker run --rm -v "$PWD":/repo -v och-desktop-target:/home/ubuntu/target och-desktop-ui \
#     bash -c 'node scripts/build.mjs && npx tauri build --debug --no-bundle &&
#              UI_PLATFORMS=desktop xvfb-run -a node bench/ui.mjs'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git build-essential cmake pkg-config file xz-utils \
    libgmp-dev libsqlite3-dev libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
    librsvg2-dev webkit2gtk-driver xvfb xauth dbus-x11 fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://nodejs.org/dist/v24.11.0/node-v24.11.0-linux-x64.tar.xz \
  | tar -xJ -C /usr/local --strip-components=1
# Ubuntu's image already has a UID 1000 user, which usually matches the repository's owner.
USER ubuntu
ENV PATH=/home/ubuntu/.cargo/bin:$PATH CARGO_TARGET_DIR=/home/ubuntu/target
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
  && cargo install tauri-driver --locked
WORKDIR /repo
