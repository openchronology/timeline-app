// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';

/**
 * Server package targets (#116): each system's package format and base image. Debian and
 * FreeBSD packages name their PostgreSQL major version; RPM packages take the one the
 * distribution ships (pg_config, when they are built).
 */
export const serverTargets = {
  debian13: { format: 'deb', base: 'debian:trixie', pg: 17, suffix: 'deb13' },
  'ubuntu24.04': { format: 'deb', base: 'ubuntu:24.04', pg: 16, suffix: 'ubuntu24.04' },
  rocky10: { format: 'rpm', base: 'rockylinux/rockylinux:10', dist: 'el10' },
  fedora44: { format: 'rpm', base: 'fedora:44', dist: 'fc44' },
  // Built in a FreeBSD virtual machine (deploy/freebsd-server/build.sh) from the platform built
  // on Linux; packages are tied to a FreeBSD major version.
  freebsd14: { format: 'pkg', release: '14', pg: 17 },
  freebsd15: { format: 'pkg', release: '15', pg: 17 },
  // Homebrew's formula, in the openchronology/homebrew-tap repository (deploy/homebrew): built
  // on the Mac from the platform; releases attach the platform, not a package.
  macos: { format: 'brew', pg: 17 },
  // A self-contained installer with its own PostgreSQL 17, built on Windows from the platform
  // (deploy/windows-server/build.ps1).
  windows: { format: 'exe', pg: 17 },
};
/** The platform-independent part FreeBSD's package and Homebrew's formula build from. */
export const PLATFORM = 'openchronology-server-platform.tar.gz';
/** A target's package file, as built and as attached to releases (its version is inside). */
export const serverPackage = (target) =>
  serverTargets[target]?.format === 'brew'
    ? PLATFORM
    : serverTargets[target]?.format === 'exe'
      ? `openchronology-server-${target}-amd64-setup.exe`
      : `openchronology-server-${target}-amd64.${serverTargets[target]?.format ?? 'deb'}`;
/**
 * The upstream version of a release tag (Debian and RPM alike): without its "v", and with a
 * pre-release ("-rc.1") marked "~rc.1" so that it sorts before the release.
 */
export const upstreamVersion = (tag) => tag.replace(/^v/, '').replace(/^([0-9.]+)-/, '$1~');
/**
 * A FreeBSD package version: pkg compares dotted parts, so a pre-release or development
 * suffix becomes one more part (1.2.0.rc.1, 0.1.0.dev.202610121205.abcdef1).
 */
export const freebsdVersion = (upstream) => upstream.replace(/[~-]/g, '.');
/**
 * The Node.js runtime the .deb and .rpm packages bundle (#369): its version and pinned SHA-256,
 * read from the Debian Dockerfile's NODE_VERSION and NODE_SHA256 arguments (the RPM
 * Dockerfile's match them; test/ci-workflows.test.mjs checks), and its Linux tarball's name.
 */
export const nodeRuntime = (
  dockerfile = readFileSync(new URL('../deploy/debian-server/Dockerfile', import.meta.url), 'utf8'),
) => {
  const arg = (name) => dockerfile.match(new RegExp(`^ARG ${name}=(\\S+)$`, 'm'))?.[1];
  const version = arg('NODE_VERSION');
  const sha256 = arg('NODE_SHA256');
  if (!version || !sha256) throw new Error('The Dockerfile pins no Node.js version and checksum');
  const arch = 'linux-x64';
  return { version, sha256, arch, tarball: `node-v${version}-${arch}.tar.xz` };
};
