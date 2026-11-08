# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The OpenChronology server (#461): the editor and the Next.js platform built from source, laid
# out as the Debian package installs them (deploy/debian-server/Dockerfile) under
# lib/openchronology, with och-convert beside them, the source archive the site's footer
# links to, and commands in bin. The NixOS module (module.nix) runs them as services.
{
  lib,
  stdenv,
  autoPatchelfHook,
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  makeWrapper,
  och-convert,
  src,
  npmDeps,
  rev ? "",
}:

buildNpmPackage {
  pname = "openchronology-server";
  version = (lib.importJSON ../package.json).version;
  inherit src;
  nodejs = nodejs_24;

  # Each package as package-lock.json pins it (flake.nix), so there is no hash to keep.
  inherit npmDeps;
  npmConfigHook = importNpmLock.npmConfigHook;
  # No install scripts: they would download browsers (Playwright) and binaries that the
  # lockfile's optional packages already provide.
  npmFlags = [ "--ignore-scripts" ];

  nativeBuildInputs = [ makeWrapper ] ++ lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  # The prebuilt native modules npm installs (sharp and its libvips, which Next.js uses for
  # images) link the C++ runtime, which NixOS keeps off the default library path.
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  env = {
    NEXT_TELEMETRY_DISABLED = "1";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    # The build's identity (scripts/build-info.mjs): the flake's commit, as there is no Git.
    OCH_BUILD_COMMIT = rev;
  };

  buildPhase = ''
    runHook preBuild
    npm run build
    # The corresponding source, with the converter's crates, which the footer offers.
    # (copied out of the store first, as the archive's temporary copy must be removable).
    cp -rL --no-preserve=mode ${och-convert.cargoDeps} rust-dependencies
    node scripts/source.mjs --rust-vendor rust-dependencies
    cp dist/openchronology-web-source.tar.gz platform/public/
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    app=$out/lib/openchronology
    mkdir -p $app/platform/.next $app/bin $out/bin
    cp -r platform/.next/standalone/. $app/
    cp -r platform/.next/static $app/platform/.next/static
    rm -rf $app/platform/public
    cp -r platform/public $app/platform/public
    cp -r dist server legal package.json $app/
    cp deploy/debian-server/openchronology-server.mjs $app/
    ln -s ${lib.getExe och-convert} $app/bin/och-convert

    # The commands. The server reads OCH_CONFIG (an environment file) if given; the module
    # passes its settings in the environment instead.
    makeWrapper ${lib.getExe nodejs_24} $out/bin/openchronology-server \
      --add-flags $app/openchronology-server.mjs --chdir $app \
      --set-default OCH_CONFIG /dev/null
    for command in migrate:migrate reset-admin-password:reset-admin-password \
        mail:mail-worker syslog:syslog-receiver github:github-receiver journald:journald-receiver; do
      makeWrapper ${lib.getExe nodejs_24} $out/bin/openchronology-''${command%%:*} \
        --add-flags $app/server/''${command#*:}.mjs --chdir $app --set NODE_ENV production
    done
    makeWrapper ${lib.getExe nodejs_24} $out/bin/och-import-logs \
      --add-flags $app/server/import-logs.mjs
    makeWrapper ${lib.getExe nodejs_24} $out/bin/och-import-github \
      --add-flags $app/server/import-github.mjs
    runHook postInstall
  '';

  passthru = { inherit och-convert; };

  meta = {
    description = "OpenChronology, the exact timeline platform: its web server";
    homepage = "https://github.com/openchronology/timeline-app";
    license = lib.licenses.gpl3Only;
    mainProgram = "openchronology-server";
    platforms = lib.platforms.linux;
  };
}
