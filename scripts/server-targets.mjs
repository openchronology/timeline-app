// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** Server .deb targets: each distribution's base image, PostgreSQL major version and suffix. */
export const serverTargets = {
  debian13: { base: 'debian:trixie', pg: 17, suffix: 'deb13' },
  'ubuntu24.04': { base: 'ubuntu:24.04', pg: 16, suffix: 'ubuntu24.04' },
};
/** A target's package file, as built and as attached to releases (its version is inside). */
export const serverPackage = (target) => `openchronology-server-${target}-amd64.deb`;
/**
 * The Debian upstream version of a release tag: without its "v", and with a pre-release
 * ("-rc.1") marked "~rc.1" so that it sorts before the release.
 */
export const upstreamVersion = (tag) => tag.replace(/^v/, '').replace(/^([0-9.]+)-/, '$1~');
