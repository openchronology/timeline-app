// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The first `limit` UTF-16 units of `text`, never ending in half of a surrogate pair: an emoji
 * cut in two is not valid Unicode, and PostgreSQL refuses to store it as JSON.
 */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const code = text.charCodeAt(limit - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit);
}
