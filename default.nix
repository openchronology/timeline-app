# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The flake (flake.nix) for Nix without flakes, such as nix-env and nix-build (#461;
# docs/nix.md): this system's packages, with the NixOS module and overlay beside them.
#   nix-env -f https://github.com/openchronology/timeline-app/archive/<tag>.tar.gz -iA openchronology-desktop
let
  flake =
    (import (fetchTarball {
      url = "https://github.com/edolstra/flake-compat/archive/5edf11c44bc78a0d334f6334cdaf7d60d732daab.tar.gz";
      sha256 = "0yqfa6rx8md81bcn4szfp0hjq2f3h9i8zjzhqqyfqdkrj5559nmw";
    }) { src = ./.; }).defaultNix;
in
# Without `default`, the flake's other name for the server, so each package is listed once.
removeAttrs flake.packages.${builtins.currentSystem} [ "default" ]
// {
  inherit (flake) nixosModules overlays;
}
