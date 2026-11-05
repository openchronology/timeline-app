// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Text with the words a search matched marked (#459).
import { matchRanges } from '../../src/highlight.ts';

/**
 * `text`, with each word beginning with one of `terms` (searchTerms of the search) in a
 * mark element; the text alone when there are none.
 * @param {{text: string, terms?: string[]}} props
 */
export default function Highlight({ text, terms }) {
  const ranges = terms?.length ? matchRanges(text, terms) : [];
  if (!ranges.length) return text;
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
