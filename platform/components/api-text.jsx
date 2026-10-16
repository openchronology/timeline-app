// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The API description's text (#178): paragraphs, lists, `code`, **bold** and [links](…).
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
function inline(text) {
  return String(text)
    .split(INLINE)
    .map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1)
        return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      // Only the site's own pages and https addresses.
      if (link && /^(\/|#|https:\/\/)/.test(link[2]))
        return (
          <a key={i} href={link[2]}>
            {link[1]}
          </a>
        );
      return part;
    });
}
export default function ApiText({ text }) {
  if (!text) return null;
  return String(text)
    .split(/\n\s*\n/)
    .map((block, i) => {
      const lines = block.split('\n');
      if (lines.every((line) => /^\s*[-*] /.test(line)))
        return (
          <ul key={i}>
            {lines.map((line, j) => (
              <li key={j}>{inline(line.replace(/^\s*[-*] /, ''))}</li>
            ))}
          </ul>
        );
      return <p key={i}>{inline(block)}</p>;
    });
}
