// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Where signing in may return to: only the site's own pages, so a link cannot send people
// elsewhere.
import { signInReturn } from '../../src/addresses.ts';
/** `value` when signing in may return there (signInReturn, which the server checks too), else `fallback`. */
export function safeReturnTo(value, fallback = '/') {
  return signInReturn(value) ? value : fallback;
}
