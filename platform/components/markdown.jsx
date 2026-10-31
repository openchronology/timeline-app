// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * A timeline's description (#398) as the editor shows it: the notes' small Markdown vocabulary
 * (src/rich-text.ts), parsed once there and rendered here as React elements. React escapes
 * every string, there is no raw HTML, and links carry only safeNoteLink's https addresses.
 */
import { parseMarkdown } from '../../src/rich-text.ts';

/** Inline Markdown as elements; `links` false renders a link as its text (inside a link). */
function Inline({ nodes, links = true }) {
  return nodes.map((n, i) => {
    if (typeof n === 'string') return n;
    if (n.tag === 'code') return <code key={i}>{n.text}</code>;
    if (n.tag === 'a')
      return links ? (
        <a key={i} href={n.href} rel="ugc nofollow noopener noreferrer" target="_blank">
          {n.text}
        </a>
      ) : (
        n.text
      );
    const Tag = n.tag;
    return (
      <Tag key={i}>
        <Inline nodes={n.children} links={links} />
      </Tag>
    );
  });
}

/** Markdown as blocks: paragraphs, headings, quotes, lists and code. */
export default function Markdown({ text, className = '' }) {
  return (
    <div className={('markdown-view ' + className).trim()}>
      {parseMarkdown(String(text ?? '')).map((block, i) => {
        if (block.tag === 'pre')
          return (
            <pre key={i}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.tag === 'p')
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  <Inline nodes={line} />
                </span>
              ))}
            </p>
          );
        if (block.tag === 'ul' || block.tag === 'ol') {
          const List = block.tag;
          return (
            <List key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline nodes={item} />
                </li>
              ))}
            </List>
          );
        }
        const Tag = block.tag;
        return (
          <Tag key={i}>
            <Inline nodes={block.children} />
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * The start of Markdown on one line, for a card: its blocks' inline formatting (strong,
 * emphasis, code) kept, links shown as their text (so a card's only links are its own),
 * blocks joined by spaces and the whole cut to `length` characters of text, ending with … when
 * cut.
 */
export function MarkdownExcerpt({ text, length = 240 }) {
  const inlines = [];
  for (const block of parseMarkdown(String(text ?? ''))) {
    const parts =
      block.tag === 'pre'
        ? [[block.text]]
        : block.tag === 'p'
          ? block.lines
          : block.tag === 'ul' || block.tag === 'ol'
            ? block.items
            : [block.children];
    for (const part of parts) inlines.push(' ', ...part);
  }
  // Whitespace is collapsed within each text, and the text measured, before cutting.
  const flat = (nodes) =>
    nodes.map((n) =>
      typeof n === 'string'
        ? n.replace(/\s+/g, ' ')
        : n.tag === 'a' || n.tag === 'code'
          ? { ...n, text: n.text.replace(/\s+/g, ' ') }
          : { ...n, children: flat(n.children) },
    );
  const measure = (nodes) =>
    nodes.reduce(
      (sum, n) =>
        sum +
        (typeof n === 'string' ? n.length : 'text' in n ? n.text.length : measure(n.children)),
      0,
    );
  // The first block's leading join is dropped.
  const all = flat(inlines.slice(1));
  if (typeof all[0] === 'string') all[0] = all[0].trimStart();
  const over = measure(all) > length;
  let left = over ? length - 1 : Infinity;
  /** The nodes, cut once `left` characters of text have been used. */
  const cut = (nodes) => {
    const out = [];
    for (const n of nodes) {
      if (left <= 0) break;
      if (typeof n === 'string' || 'text' in n) {
        const s = (typeof n === 'string' ? n : n.text).slice(0, left);
        left -= s.length;
        out.push(typeof n === 'string' ? s : { ...n, text: s });
      } else out.push({ ...n, children: cut(n.children) });
    }
    return out;
  };
  const nodes = cut(all);
  if (over) nodes.push('…');
  return <Inline nodes={nodes} links={false} />;
}
