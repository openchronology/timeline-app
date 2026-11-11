# deploy/desktop-build

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The Linux desktop build image (#605): Ubuntu 24.04 with what the desktop app's Linux builds and tests need.

- **Contents:** WebKitGTK, GTK and the other Tauri libraries, GMP and SQLite, Rust 1.99.0, the pinned `tauri-driver`, WebKitWebDriver, Xvfb, and Node.js.
- **Publishing:** [`scripts/build-images.mjs`](../../scripts/build-images.mjs) builds it and the [build images workflow](../../.github/workflows/build-images.yml) publishes it to `ghcr.io/openchronology/desktop-build`, tagged with a hash of the Dockerfile.
- **In CI:** the .deb and AppImage builds ([`desktop.yml`](../../.github/workflows/desktop.yml)) and the desktop UI test (`ci.yml`'s `desktop-ui`) run in the image whose tag matches the Dockerfile. When none is published, they install their packages on the runner as before.

## Building and testing locally

The image lets a machine without these libraries build and test `src-tauri`:

```sh
node scripts/build-images.mjs desktop-build   # or pull the published image
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp/home -v "$PWD":/w -w /w <image> \
  sh -c 'mkdir -p $HOME && cargo test --manifest-path src-tauri/Cargo.toml --locked'
```

`node scripts/desktop/build.mjs linux-deb` (or `linux-appimage`, with `APPIMAGE_EXTRACT_AND_RUN=1`) builds a package in it. `npx tauri build --debug --no-bundle` builds the app the desktop UI tests drive, which they do under `xvfb-run -a`.

## Contents

| File                       | What it is for                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| [`Dockerfile`](Dockerfile) | The image: the desktop build's and UI test's packages, Node.js, Rust and the pinned tauri-driver. |
