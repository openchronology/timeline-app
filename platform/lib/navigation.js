// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Where signing in may return to: only the site's own pages, so a link cannot send people
// elsewhere.
import { timelineAddress } from '../../src/addresses.ts';
export function safeReturnTo(value) {
  if (value === '/' || value === '/editor' || value === '/account' || value === '/plugins')
    return value;
  if (
    typeof value === 'string' &&
    // A timeline's page, at either of its addresses (#148).
    (timelineAddress(value)?.rest === '' || /^\/connect\/desktop\/[A-Z2-9]{10}$/.test(value))
  )
    return value;
  return '/';
}
