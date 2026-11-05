# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# och-convert, the server's .och file converter (#461): native-store's binary, with the
# vendored SQLite rational extension (vendor/sqlite-rational) built by its build script.
{
  lib,
  rustPlatform,
  cmake,
  pkg-config,
  sqlite,
  gmp,
  src,
}:

rustPlatform.buildRustPackage {
  pname = "och-convert";
  version = "0.1.0";
  inherit src;

  cargoRoot = "native-store";
  buildAndTestSubdir = "native-store";
  # Every crate is from crates.io, so the lockfile pins them without a hash to keep.
  cargoLock.lockFile = ../native-store/Cargo.lock;
  cargoBuildFlags = [
    "--bin"
    "och-convert"
  ];
  # build.rs runs CMake itself; the hook would configure the repository instead.
  dontUseCmakeConfigure = true;
  nativeBuildInputs = [
    cmake
    pkg-config
  ];
  buildInputs = [
    sqlite
    gmp
  ];
  # Its tests read fixtures and benches the server's tests cover; the build is checked by the
  # NixOS test, which converts a file.
  doCheck = false;

  meta = {
    description = "Converts OpenChronology timelines to and from .och files";
    homepage = "https://github.com/openchronology/timeline-app";
    license = lib.licenses.gpl3Only;
    mainProgram = "och-convert";
  };
}
