// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Server package targets (#116): each distribution's package format and base image. Debian
 * packages name their PostgreSQL major version; RPM packages take the one the distribution
 * ships (pg_config, when they are built).
 */
export const serverTargets = {
  debian13: { format: 'deb', base: 'debian:trixie', pg: 17, suffix: 'deb13' },
  'ubuntu24.04': { format: 'deb', base: 'ubuntu:24.04', pg: 16, suffix: 'ubuntu24.04' },
  rocky10: { format: 'rpm', base: 'rockylinux/rockylinux:10', dist: 'el10' },
  fedora44: { format: 'rpm', base: 'fedora:44', dist: 'fc44' },
};
/** A target's package file, as built and as attached to releases (its version is inside). */
export const serverPackage = (target) =>
  `openchronology-server-${target}-amd64.${serverTargets[target]?.format ?? 'deb'}`;
/**
 * The upstream version of a release tag (Debian and RPM alike): without its "v", and with a
 * pre-release ("-rc.1") marked "~rc.1" so that it sorts before the release.
 */
export const upstreamVersion = (tag) => tag.replace(/^v/, '').replace(/^([0-9.]+)-/, '$1~');
