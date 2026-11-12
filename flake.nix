# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# OpenChronology for Nix and NixOS (#461; docs/nix.md): the server, its file converter, the
# desktop app and pgmp as packages built from this source, and services.openchronology, a
# NixOS module that runs the server with PostgreSQL. The derivations are in nix/.
{
  description = "OpenChronology: exact timelines on the web, the desktop and your own server";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  # The project's binary cache (docs/nix.md#binary-cache): Nix offers to use it for this flake.
  nixConfig = {
    extra-substituters = [ "https://openchronology.cachix.org" ];
    extra-trusted-public-keys = [
      "openchronology.cachix.org-1:6w2e4xOQ6CcjLNSILS23JpQ2CPjDtkRP2NX7NsQ8TVc="
    ];
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      # What the packages build from: the tracked source, without the Nix files, so editing
      # them rebuilds nothing.
      src = nixpkgs.lib.fileset.toSource {
        root = ./.;
        fileset = nixpkgs.lib.fileset.difference ./. (
          nixpkgs.lib.fileset.unions [
            ./nix
            ./flake.nix
            ./flake.lock
          ]
        );
      };
      packagesFor =
        pkgs:
        let
          och-convert = pkgs.callPackage ./nix/och-convert.nix { inherit src; };
          # The npm packages, as package-lock.json pins them; the vendored tarball given
          # directly, as importNpmLock would look for it under its lockfile path.
          npmDeps = pkgs.importNpmLock {
            npmRoot = src;
            packageSourceOverrides."node_modules/rational-ordered-map" =
              "${src}/vendor/rational-ordered-map-0.1.0.tgz";
          };
        in
        {
          inherit och-convert;
          openchronology-server = pkgs.callPackage ./nix/server.nix {
            inherit src och-convert npmDeps;
            rev = self.rev or "";
          };
          openchronology-desktop = pkgs.callPackage ./nix/desktop.nix { inherit src npmDeps; };
          pgmp = pkgs.postgresql.pkgs.callPackage ./nix/pgmp.nix { };
        };
    in
    {
      packages = forSystems (
        pkgs:
        let
          packages = packagesFor pkgs;
        in
        packages // { default = packages.openchronology-server; }
      );

      # The packages, for systems that add this overlay.
      overlays.default = final: prev: {
        inherit (packagesFor final) och-convert openchronology-server openchronology-desktop;
      };

      # services.openchronology (nix/module.nix; docs/nix.md).
      nixosModules.default = import ./nix/module.nix self;

      # The NixOS test, which boots a machine with the module (KVM makes it quick).
      checks.x86_64-linux.nixos = import ./nix/test.nix {
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        module = self.nixosModules.default;
      };

      formatter = forSystems (pkgs: pkgs.nixfmt);
    };
}
