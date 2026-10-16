// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The help area (#172): the files of docs/ (and the README), read as the site runs, so the
 * help is always what the code it ships with says. Markdown is rendered here — the subset the
 * docs use: headings, paragraphs, nested lists, tables, fenced code, emphasis, code and links —
 * with headings' anchors as GitHub makes them, which the docs link to. Search looks through
 * each page's sections.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Markdown inline text as plain text: what search reads and anchors are made from. */
export function plainText(markdown) {
  return String(markdown)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1');
}

/** Heading anchors as GitHub makes them: `## Separating by tags` is `#separating-by-tags`. */
export function anchors() {
  const seen = new Map();
  return (text) => {
    const base = plainText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
      .replace(/ /g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

/** Inline Markdown as HTML: code, links, images, bold, italics and escapes. */
export function inline(text, link = (href) => href, kept = null) {
  const top = !kept;
  kept ??= [];
  const keep = (html) => `\u0000${kept.push(html) - 1}\u0000`;
  let source = String(text)
    // Escaped characters stay as they are.
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, (_, c) => keep(escape(c)))
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) =>
      keep(`<code>${escape(code.trim())}</code>`),
    )
    .replace(/<(https?:\/\/[^\s>]+)>/g, (_, url) =>
      keep(`<a href="${escape(url)}">${escape(url)}</a>`),
    )
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
      keep(`<img src="${escape(link(src))}" alt="${escape(alt)}">`),
    )
    .replace(
      /\[((?:[^[\]]|\[[^\]]*\])+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, label, href, title) =>
        keep(
          `<a href="${escape(link(href))}"${title ? ` title="${escape(title)}"` : ''}>${inline(label, link, kept)}</a>`,
        ),
    );
  source = escape(source)
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  // Kept parts may hold others (a link's code): put them back until none are left.
  while (top && source.includes('\u0000'))
    source = source.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
  return source;
}

const LIST = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const FENCE = /^( *)(`{3,}|~{3,})\s*([\w+-]*)/;
const TABLE_RULE = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;
const indentOf = (line) => /^ */.exec(line)[0].length;

/** A table row's cells, split on pipes outside code and escapes. */
function cells(line) {
  const row = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = [];
  let cell = '',
    code = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '\\' && row[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (c === '`') {
      code = !code;
      cell += c;
    } else if (c === '|' && !code) {
      out.push(cell.trim());
      cell = '';
    } else cell += c;
  }
  out.push(cell.trim());
  return out;
}

/**
 * Markdown as HTML. `link` rewrites addresses; `anchor` names headings. Returns the HTML and
 * the headings in order (`{ depth, text, id }`).
 */
export function renderMarkdown(source, { link = (href) => href, anchor = anchors() } = {}) {
  const headings = [];
  const blocks = (lines) => {
    const out = [];
    let i = 0;
    const paragraph = [];
    const flush = () => {
      if (paragraph.length) out.push(`<p>${inline(paragraph.join('\n').trim(), link)}</p>`);
      paragraph.length = 0;
    };
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        flush();
        i++;
        continue;
      }
      const fence = FENCE.exec(line);
      if (fence) {
        flush();
        const close = new RegExp(`^ *${fence[2][0]}{${fence[2].length},}\\s*$`);
        const code = [];
        for (i++; i < lines.length && !close.test(lines[i]); i++)
          code.push(lines[i].slice(Math.min(fence[1].length, indentOf(lines[i]))));
        i++;
        out.push(
          `<pre><code${fence[3] ? ` class="language-${escape(fence[3])}"` : ''}>${escape(code.join('\n'))}</code></pre>`,
        );
        continue;
      }
      const heading = /^(#{1,6}) +(.*?)(?: +#+)? *$/.exec(line);
      if (heading) {
        flush();
        const depth = heading[1].length,
          text = heading[2],
          id = anchor(text);
        headings.push({ depth, text: plainText(text), id });
        out.push(`<h${depth} id="${escape(id)}">${inline(text, link)}</h${depth}>`);
        i++;
        continue;
      }
      if (/^ *([-*_])( *\1){2,} *$/.test(line) && !paragraph.length) {
        out.push('<hr>');
        i++;
        continue;
      }
      if (line.trim().startsWith('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
        flush();
        const head = cells(line),
          align = cells(lines[i + 1]).map((c) =>
            c.startsWith(':') && c.endsWith(':')
              ? 'center'
              : c.endsWith(':')
                ? 'right'
                : c.startsWith(':')
                  ? 'left'
                  : null,
          );
        const cell = (tag, text, n) =>
          `<${tag}${align[n] ? ` style="text-align:${align[n]}"` : ''}>${inline(text, link)}</${tag}>`;
        const rows = [];
        for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++)
          rows.push(
            `<tr>${cells(lines[i])
              .map((c, n) => cell('td', c, n))
              .join('')}</tr>`,
          );
        out.push(
          `<div class="help-table"><table><thead><tr>${head.map((c, n) => cell('th', c, n)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`,
        );
        continue;
      }
      if (/^ *>/.test(line)) {
        flush();
        const quoted = [];
        for (; i < lines.length && /^ *>/.test(lines[i]); i++)
          quoted.push(lines[i].replace(/^ *> ?/, ''));
        out.push(`<blockquote>${blocks(quoted)}</blockquote>`);
        continue;
      }
      const item = LIST.exec(line);
      if (item && (!paragraph.length || indentOf(line) === 0)) {
        flush();
        const base = indentOf(line),
          ordered = /\d/.test(item[2]),
          items = [];
        let loose = false;
        while (i < lines.length) {
          const start = LIST.exec(lines[i]);
          if (!start || indentOf(lines[i]) !== base || /\d/.test(start[2]) !== ordered) break;
          // The item's content, indented to where its text begins.
          const offset = base + start[2].length + Math.max(1, Math.min(start[3].length, 4));
          const content = [start[4]];
          for (i++; i < lines.length; i++) {
            const next = lines[i];
            if (!next.trim()) {
              // A blank line continues the item only if what follows is indented under it.
              const after = lines.slice(i + 1).find((l) => l.trim());
              if (after === undefined || indentOf(after) < offset) break;
              content.push('');
              continue;
            }
            if (indentOf(next) >= offset) content.push(next.slice(offset));
            else if (indentOf(next) > base && LIST.test(next)) content.push(next.slice(offset));
            else if (!LIST.test(next) && indentOf(next) > base) content.push(next.trim());
            else if (!LIST.test(next) && content.at(-1) !== '' && !/^ *(#|\||```)/.test(next))
              content.push(next.trim()); // a paragraph's lazy continuation
            else break;
          }
          if (content.at(-1) === '') content.pop();
          if (content.includes('')) loose = true;
          items.push(content);
          // Blank lines between items (of this list, not the next) make the list loose.
          const following = LIST.exec(lines[i + 1] ?? '');
          if (
            !lines[i]?.trim() &&
            following &&
            indentOf(lines[i + 1]) === base &&
            /\d/.test(following[2]) === ordered
          ) {
            loose = true;
            i++;
          }
        }
        const tag = ordered ? 'ol' : 'ul',
          first = ordered ? Number(/\d+/.exec(item[2])[0]) : 1;
        out.push(
          `<${tag}${ordered && first !== 1 ? ` start="${first}"` : ''}>${items
            .map((content) => {
              const html = blocks(content);
              return `<li>${loose ? html : html.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`;
            })
            .join('')}</${tag}>`,
        );
        continue;
      }
      paragraph.push(line);
      i++;
    }
    flush();
    return out.join('\n');
  };
  const html = blocks(String(source).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
  return { html, headings };
}

/** The pages of the help area, in its sections; any doc not listed here joins "More". */
export const HELP_SECTIONS = [
  { title: 'Start here', pages: ['guide', 'faq', 'readme'] },
  {
    title: 'Making timelines',
    pages: [
      'time-presentation',
      'durations',
      'tags',
      'relationships',
      'images',
      'search',
      'browsing',
      'comparison',
      'time-mapping',
      'plugins',
      'capacity',
      'guest-editing',
    ],
  },
  {
    title: 'Sharing and working together',
    pages: ['sharing', 'collaboration', 'moderation', 'retention'],
  },
  { title: 'Accounts and the API', pages: ['authentication', 'api'] },
  {
    title: 'Running a server',
    pages: ['administration', 'docker', 'seeding', 'syslog', 'journald', 'log-import', 'licensing'],
  },
  { title: 'How it works', pages: ['architecture', 'benchmarks'] },
];

const SOURCE = 'https://github.com/openchronology/timeline-app/blob/main/';
/** A link in docs/<page>.md, for the help area: other docs are help pages; files are on GitHub. */
export function helpLink(href) {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return href;
  const [path, fragment] = href.split('#');
  const hash = fragment ? '#' + fragment : '';
  if (!path) return hash;
  const doc = /^(?:\.\/|\.\.\/docs\/)?([a-z0-9-]+)\.md$/i.exec(path);
  if (doc) return `/help/${doc[1].toLowerCase()}${hash}`;
  if (/^\.\.\/README\.md$/i.test(path)) return '/help/readme' + hash;
  // Anything else in the repository, from docs/.
  const resolved = new URL(path, 'https://repo.invalid/docs/').pathname.slice(1);
  return SOURCE + resolved + hash;
}
/** A link in README.md, for the help area. */
const readmeLink = (href) =>
  /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)
    ? href
    : /^docs\/?$/.test(href)
      ? '/help'
      : /^docs\//.test(href)
        ? helpLink(href.slice('docs/'.length))
        : helpLink('../' + href);

/** One page: its title, summary, HTML, headings and sections (for search). */
export function helpPage(slug, source) {
  const link = slug === 'readme' ? readmeLink : helpLink;
  // The copyright line is the source's, not the reader's.
  const text = source.replace(/^Copyright \(c\)[^\n]*\n/m, '');
  const { html, headings } = renderMarkdown(text, { link });
  // The README's title is the project's name: in the help, it is the overview.
  const title =
    slug === 'readme' ? 'Project overview' : (headings.find((h) => h.depth === 1)?.text ?? slug);
  const lines = text.split('\n');
  const firstParagraph = [];
  for (const line of lines.slice(lines.findIndex((l) => /^# /.test(l)) + 1)) {
    if (!line.trim()) {
      if (firstParagraph.length) break;
      continue;
    }
    if (/^(#|\||```|[-*] )/.test(line)) break;
    firstParagraph.push(line);
  }
  // Sections: what each heading says, until the next.
  const sections = [];
  const anchor = anchors();
  let current = { id: '', title, text: [] },
    fenced = false;
  for (const line of lines) {
    if (/^ *(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^(#{1,6}) +(.*?)(?: +#+)? *$/.exec(line);
    if (heading) {
      const id = anchor(heading[2]);
      if (heading[1].length > 1) {
        sections.push(current);
        current = { id, title: plainText(heading[2]), text: [] };
      }
    } else current.text.push(line);
  }
  sections.push(current);
  return {
    slug,
    title,
    summary: plainText(firstParagraph.join(' ')),
    html,
    headings,
    sections: sections
      .map((s) => ({
        ...s,
        text: plainText(s.text.join(' '))
          .replace(/^[|:\- ]+$/gm, ' ')
          .replace(/[|#>]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      }))
      .filter((s) => s.text || s.id),
  };
}

let loaded = null;
/**
 * The help area's pages from `root` (the app's directory): docs/*.md, and README.md as
 * `readme`. Read once per process — the docs ship with the build.
 */
export function helpPages(root = process.env.OCH_APP_ROOT ?? process.cwd()) {
  loaded ??= (async () => {
    const files = (await readdir(join(root, 'docs'))).filter((f) => f.endsWith('.md'));
    const pages = new Map();
    for (const file of files.sort())
      pages.set(
        file.slice(0, -3).toLowerCase(),
        helpPage(file.slice(0, -3).toLowerCase(), await readFile(join(root, 'docs', file), 'utf8')),
      );
    try {
      pages.set('readme', helpPage('readme', await readFile(join(root, 'README.md'), 'utf8')));
    } catch {}
    return pages;
  })().catch((error) => {
    loaded = null;
    throw error;
  });
  return loaded;
}

/** The help area's sections with their pages; pages no section lists are under "More". */
export function helpSections(pages) {
  const listed = new Set(HELP_SECTIONS.flatMap((s) => s.pages));
  const sections = HELP_SECTIONS.map((s) => ({
    title: s.title,
    pages: s.pages.filter((slug) => pages.has(slug)).map((slug) => pages.get(slug)),
  }));
  const more = [...pages.values()].filter((page) => !listed.has(page.slug));
  if (more.length) sections.push({ title: 'More', pages: more });
  return sections.filter((s) => s.pages.length);
}

/** The words of a search, lowercased. */
export const searchTerms = (query) =>
  [
    ...new Set(
      String(query)
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? [],
    ),
  ].slice(0, 12);

/**
 * Sections of the help that mention every word of `query` (or, failing that, any), best
 * first: a word in a section's heading counts most, then in its page's title, then each
 * mention in its text.
 */
export function searchHelp(pages, query, limit = 30) {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const count = (text, term) => {
    let n = 0;
    for (let at = text.indexOf(term); at !== -1 && n < 10; at = text.indexOf(term, at + 1)) n++;
    return n;
  };
  const score = (every) => {
    const results = [];
    for (const page of pages.values())
      for (const section of page.sections) {
        const heading = section.title.toLowerCase(),
          text = section.text.toLowerCase(),
          pageTitle = page.title.toLowerCase();
        let total = 0,
          found = 0;
        for (const term of terms) {
          const hits = count(heading, term) * 8 + count(pageTitle, term) * 3 + count(text, term);
          if (hits) found++;
          total += hits;
        }
        if (found && (!every || found === terms.length))
          results.push({ page, section, score: total + found * 20 });
      }
    return results.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
  };
  const results = score(true);
  return (results.length ? results : score(false)).slice(0, limit).map(({ page, section }) => ({
    slug: page.slug,
    pageTitle: page.title,
    id: section.id,
    title: section.title,
    snippet: snippet(section.text, terms),
  }));
}

/** About `length` characters of `text` around its first mention of a term. */
export function snippet(text, terms, length = 220) {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length);
  const start = Math.max(0, Math.min(at - 60, text.length - length));
  const part = text.slice(start, start + length);
  return (start > 0 ? '…' : '') + part.trim() + (start + length < text.length ? '…' : '');
}
