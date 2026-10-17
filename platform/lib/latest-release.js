// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The latest release on GitHub, for the download page, asked for at most every ten minutes.
import 'server-only';
import { REPOSITORY, releaseFrom } from './releases.js';
/** GitHub is asked at most every ten minutes; a failure is remembered for one. */
const FRESH = 10 * 60 * 1000,
  RETRY = 60 * 1000;
let cached = { at: 0, ttl: 0, release: null };
/**
 * The latest published release from GitHub (RELEASES_API_URL overrides the address, for
 * tests and mirrors), or null when there is none or GitHub cannot be reached: the page then
 * links to the latest release's assets by name.
 */
export async function latestRelease(now = Date.now()) {
  if (now - cached.at < cached.ttl) return cached.release;
  const url =
    process.env.RELEASES_API_URL || `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
  let release = null;
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenChronology' },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (response.ok) release = releaseFrom(await response.json());
  } catch {
    // Unreachable: the latest release's links by name still work.
  }
  cached = { at: now, ttl: release ? FRESH : RETRY, release };
  return release;
}
