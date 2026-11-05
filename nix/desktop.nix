# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The OpenChronology desktop app for Linux (#461): src-tauri built with the Tauri hook, which
# builds the editor first (tauri.conf.json's beforeBuildCommand) and installs the app, its
# launcher and icon from the .deb bundle it makes.
{
  lib,
  rustPlatform,
  cargo-tauri,
  nodejs_24,
  importNpmLock,
  pkg-config,
  cmake,
  wrapGAppsHook3,
  webkitgtk_4_1,
  gtk3,
  libsoup_3,
  glib-networking,
  openssl,
  sqlite,
  gmp,
  src,
  npmDeps,
}:

rustPlatform.buildRustPackage {
  pname = "openchronology-desktop";
  version = (lib.importJSON ../package.json).version;
  inherit src npmDeps;

  cargoRoot = "src-tauri";
  buildAndTestSubdir = "src-tauri";
  # Every crate is from crates.io, so the lockfile pins them without a hash to keep.
  cargoLock.lockFile = ../src-tauri/Cargo.lock;

  # As the server's: no install scripts, which would download what the lockfile provides.
  npmFlags = [ "--ignore-scripts" ];
  # native-store's build script runs CMake itself.
  dontUseCmakeConfigure = true;

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs_24
    importNpmLock.npmConfigHook
    pkg-config
    cmake
    wrapGAppsHook3
  ];
  buildInputs = [
    webkitgtk_4_1
    gtk3
    libsoup_3
    glib-networking
    openssl
    sqlite
    gmp
  ];

  # The app's tests run in its own CI jobs (cargo test with a display); here it is built.
  doCheck = false;

  meta = {
    description = "OpenChronology, the exact timeline editor, as a desktop app";
    homepage = "https://github.com/openchronology/timeline-app";
    license = lib.licenses.gpl3Only;
    mainProgram = "openchronology-desktop";
    platforms = lib.platforms.linux;
  };
}
