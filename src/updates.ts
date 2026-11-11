// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Newer releases (#601): whether the latest release is newer than the one running, for the
// desktop app's update banner and the platform's banner for administrators.

/** A release tag's numbers and pre-release, or null when it isn't a version tag. */
function version(tag: string) {
  const m =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      tag.trim(),
    );
  return m ? { parts: [m[1], m[2], m[3]].map(BigInt), pre: m[4] ?? null } : null;
}
/**
 * Whether `latest` is a newer release than `current`, both version tags such as "v0.25.0"
 * (semantic versions). A build that isn't a release (no tag, or a commit), a pre-release
 * offered as latest, or anything unreadable is never told to update.
 */
export function newerRelease(
  current: string | null | undefined,
  latest: string | null | undefined,
): boolean {
  const a = current ? version(current) : null,
    b = latest ? version(latest) : null;
  if (!a || !b || b.pre) return false;
  for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return b.parts[i] > a.parts[i];
  // The same numbers: the release is newer than its own pre-releases.
  return a.pre !== null;
}
