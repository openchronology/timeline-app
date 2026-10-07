// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
export function safeReturnTo(value) {
  if (value === '/' || value === '/editor' || value === '/account' || value === '/plugins')
    return value;
  if (
    typeof value === 'string' &&
    (/^\/timelines\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ||
      /^\/connect\/desktop\/[A-Z2-9]{10}$/.test(value))
  )
    return value;
  return '/';
}
