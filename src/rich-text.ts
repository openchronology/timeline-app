// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** A deliberately small Markdown vocabulary. No HTML, images, embeds or executable URLs. */
/**
 * The only links notes may carry: absolute `https:` URLs of at most 4096 characters with no
 * user name or password (which could disguise the real host). Returns the URL normalised by
 * the URL parser, or null for anything else, including relative, `javascript:`, `data:` and
 * plain `http:` URLs. Used both when rendering Markdown and when serialising the editor.
 */
export function safeNoteLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.href.length <= 4096 && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/**
 * Parsed Markdown, as plain data shared by every renderer (the editor's DOM, the website's
 * React pages and the plain-text excerpts in page metadata), so all of them read the same
 * small vocabulary. Text is only ever text: there is no node for HTML, and links carry an
 * address already checked by safeNoteLink.
 */
export type MarkdownInline =
  | string
  | { tag: 'code'; text: string }
  | { tag: 'strong' | 'em' | 'del'; children: MarkdownInline[] }
  | { tag: 'a'; href: string; text: string };
export type MarkdownBlock =
  | { tag: 'p'; lines: MarkdownInline[][] }
  | { tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote'; children: MarkdownInline[] }
  | { tag: 'ul' | 'ol'; items: MarkdownInline[][] }
  | { tag: 'pre'; text: string }
  | { tag: 'hr' }
  | {
      tag: 'table';
      /** Each column's alignment, from the delimiter row (`:--`, `:-:`, `--:`), or null. */
      align: MarkdownAlign[];
      /** The header row's cells, then the body's rows, each with one cell per column. */
      head: MarkdownInline[][];
      rows: MarkdownInline[][][];
    };
export type MarkdownAlign = 'left' | 'center' | 'right' | null;
/** At most this many columns in a table; cells past it are dropped. */
const TABLE_COLUMNS = 64;
/**
 * Parses one line of inline Markdown: backslash escapes, `code`, **strong** (or __strong__),
 * *emphasis* (or _emphasis_), ~~strikethrough~~, [text](https link), <https link> and bare
 * https links. Everything else, including any HTML tags, stays text. Underscores mark
 * emphasis only at word edges, so snake_case names stay as they are. Strong, emphasis and
 * strikethrough recurse into their contents; past twelve levels the rest is plain text,
 * bounding the recursion on hostile input.
 */
export function parseInline(text: string, depth = 0): MarkdownInline[] {
  if (depth > 12) return text ? [text] : [];
  // Alternatives, tried left to right at each position: an escaped punctuation character
  // (group 1), inline code (2), strong (3, lazy so `**a** and **b**` is two), emphasis (4),
  // a link's text and URL (5, 6), strong and emphasis with underscores at word edges (7, 8),
  // strikethrough (9), an autolink in angle brackets (10) and a bare https URL (11), which
  // leaves out punctuation that usually ends a sentence. Every repetition is bounded, which
  // limits the work each match attempt can do on long or hostile notes.
  const pattern =
    /\\([\\`*_[\]#>+.!|~-])|`([^`\n]{1,2048})`|\*\*([^\n]{1,2048}?)\*\*|\*([^*\n]{1,2048})\*|\[([^\]\n]{1,512})\]\(([^\s)]{1,4096})\)|(?<![\p{L}\p{N}_])__([^\n]{1,2048}?)__(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])_([^_\n]{1,2048})_(?![\p{L}\p{N}_])|~~([^\n]{1,2048}?)~~|<(https:\/\/[^\s<>]{1,4096})>|(https:\/\/[^\s<>]{0,4095}[^\s<>.,;:!?'")\]])/gu;
  const out: MarkdownInline[] = [];
  /** Appends text, merged into the text before it. */
  const add = (s: string) => {
    if (!s) return;
    if (typeof out[out.length - 1] === 'string') out[out.length - 1] += s;
    else out.push(s);
  };
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    add(text.slice(start, match.index));
    if (match[1]) add(match[1]);
    else if (match[2]) out.push({ tag: 'code', text: match[2] });
    else if (match[3] || match[4] || match[7] || match[8] || match[9])
      out.push({
        tag: match[3] || match[7] ? 'strong' : match[9] ? 'del' : 'em',
        children: parseInline(match[3] || match[4] || match[7] || match[8] || match[9], depth + 1),
      });
    else if (match[10] || match[11]) {
      const href = safeNoteLink(match[10] || match[11]);
      if (href) out.push({ tag: 'a', href, text: match[10] || match[11] });
      else add(match[0]);
    } else {
      const href = safeNoteLink(match[6]);
      if (href) out.push({ tag: 'a', href, text: match[5] });
      else add(match[0]); // Unsafe URL: shown literally.
    }
    start = match.index! + match[0].length;
  }
  add(text.slice(start));
  return out;
}
/**
 * The cells of one table row: split at pipes that aren't escaped (`\|`) or inside `code`, with
 * one leading and one trailing pipe dropped, each cell trimmed.
 */
function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '',
    code = false;
  const text = line.trim().replace(/^\|/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '|') {
      cell += '\\|';
      i++;
    } else if (c === '`') {
      code = !code;
      cell += c;
    } else if (c === '|' && !code) {
      cells.push(cell);
      cell = '';
    } else cell += c;
  }
  // A trailing pipe ends the last cell rather than starting an empty one.
  if (cell.trim() || !/\|\s*$/.test(text)) cells.push(cell);
  return cells.map((c) => c.trim());
}
/** A table's delimiter row (`| --- | :-: |`) as its columns' alignments, or null if it isn't one. */
function tableAlignment(line: string): MarkdownAlign[] | null {
  if (!line.includes('-') || !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)) return null;
  return tableCells(line).map((c) =>
    c.startsWith(':') && c.endsWith(':')
      ? 'center'
      : c.endsWith(':')
        ? 'right'
        : c.startsWith(':')
          ? 'left'
          : null,
  );
}
/**
 * Parses `markdown` line by line: ``` fences (contents kept verbatim as text), `#` to `######`
 * headings, `>` quotes, `-`/`*`/`+` bullets and `1.` numbered items, rules (`---`, `***`,
 * `___`), tables (a header row, a delimiter row with the same number of cells, then rows until
 * a blank line or a line without a pipe), and paragraphs, where consecutive lines are kept as
 * lines of one paragraph and a blank line ends the block. Only the first 100,000 characters
 * are read.
 */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.slice(0, 100000).replace(/\r\n?/g, '\n').split('\n');
  // The open list, paragraph or code block that the next line may continue.
  let list: Extract<MarkdownBlock, { items: unknown }> | null = null,
    paragraph: Extract<MarkdownBlock, { lines: unknown }> | null = null,
    code: Extract<MarkdownBlock, { tag: 'pre' }> | null = null;
  let table: Extract<MarkdownBlock, { tag: 'table' }> | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // A row of the open table: its cells, one per column, padded or cut to the header's.
    if (table && !code && line.includes('|') && line.trim()) {
      const cells = tableCells(line).slice(0, table.align.length);
      while (cells.length < table.align.length) cells.push('');
      table.rows.push(cells.map((c) => parseInline(c)));
      continue;
    }
    table = null;
    if (line.startsWith('```')) {
      if (code) code = null;
      else blocks.push((code = { tag: 'pre', text: '' }));
      list = paragraph = null;
      continue;
    }
    if (code) {
      code.text += line + '\n';
      continue;
    }
    if (!line.trim()) {
      list = paragraph = null;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line),
      item = /^(?:([-*+])|\d+\.)\s+(.*)$/.exec(line),
      quote = /^>\s?(.*)$/.exec(line),
      align = line.includes('|') ? tableAlignment(lines[index + 1] ?? '') : null;
    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ tag: 'hr' });
      list = paragraph = null;
    } else if (align && tableCells(line).length === align.length) {
      const columns = align.slice(0, TABLE_COLUMNS);
      blocks.push(
        (table = {
          tag: 'table',
          align: columns,
          head: tableCells(line)
            .slice(0, columns.length)
            .map((c) => parseInline(c)),
          rows: [],
        }),
      );
      index++;
      list = paragraph = null;
    } else if (item) {
      const tag = item[1] ? 'ul' : 'ol';
      // A change between bullets and numbers starts a new list; item numbers themselves are
      // not kept, an ordered list always counts from one.
      if (!list || list.tag !== tag) blocks.push((list = { tag, items: [] }));
      list.items.push(parseInline(item[2]));
      paragraph = null;
    } else if (heading || quote) {
      blocks.push({
        tag: heading
          ? (`h${heading[1].length}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')
          : 'blockquote',
        children: parseInline(heading ? heading[2] : quote![1]),
      });
      list = paragraph = null;
    } else {
      if (!paragraph) blocks.push((paragraph = { tag: 'p', lines: [] }));
      paragraph.lines.push(parseInline(line));
      list = null;
    }
  }
  return blocks;
}
/** The text of inline Markdown, without its markup: a link is its text. */
function inlineText(nodes: MarkdownInline[]): string {
  return nodes
    .map((n) => (typeof n === 'string' ? n : 'children' in n ? inlineText(n.children) : n.text))
    .join('');
}
/**
 * Markdown as plain text, for places that only take text (page metadata, previews, search
 * results): the text of each block without its markup, blocks separated by blank lines and
 * the lines within one by line breaks.
 */
export function markdownText(markdown: string): string {
  return parseMarkdown(markdown)
    .filter((b) => b.tag !== 'hr')
    .map((b) =>
      'lines' in b
        ? b.lines.map(inlineText).join('\n')
        : 'items' in b
          ? b.items.map(inlineText).join('\n')
          : 'children' in b
            ? inlineText(b.children)
            : b.tag === 'table'
              ? [b.head, ...b.rows].map((row) => row.map(inlineText).join(' · ')).join('\n')
              : 'text' in b
                ? b.text.replace(/\n$/, '')
                : '',
    )
    .join('\n\n');
}
/** Appends inline Markdown to `parent` as DOM nodes, never as HTML. */
function appendInline(parent: HTMLElement, nodes: MarkdownInline[]) {
  for (const n of nodes) {
    if (typeof n === 'string') parent.append(document.createTextNode(n));
    else if (n.tag === 'a') {
      const link = document.createElement('a');
      link.textContent = n.text;
      link.href = n.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      parent.append(link);
    } else {
      const node = document.createElement(n.tag);
      if (n.tag === 'code') node.textContent = n.text;
      else appendInline(node, n.children);
      parent.append(node);
    }
  }
}
/**
 * A table block as a table element, in a scrolling wrapper so a wide table doesn't widen the
 * page; each cell carries its column's alignment.
 */
function tableElement(block: Extract<MarkdownBlock, { tag: 'table' }>): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-table';
  const table = document.createElement('table');
  const row = (cells: MarkdownInline[][], tag: 'th' | 'td') => {
    const tr = document.createElement('tr');
    cells.forEach((cell, i) => {
      const td = document.createElement(tag);
      if (block.align[i]) td.style.textAlign = block.align[i]!;
      appendInline(td, cell);
      tr.append(td);
    });
    return tr;
  };
  const head = document.createElement('thead');
  head.append(row(block.head, 'th'));
  table.append(head);
  if (block.rows.length) {
    const body = document.createElement('tbody');
    for (const cells of block.rows) body.append(row(cells, 'td'));
    table.append(body);
  }
  wrapper.append(table);
  return wrapper;
}
/**
 * Replaces `container`'s contents with the rendering of `markdown` (see parseMarkdown), in
 * which consecutive lines of a paragraph are joined with line breaks. Builds DOM nodes
 * directly (no innerHTML), so no markup in the notes can run or load anything.
 */
export function renderMarkdown(container: HTMLElement, markdown: string) {
  container.replaceChildren();
  container.classList.add('markdown-view');
  for (const block of parseMarkdown(markdown)) {
    if (block.tag === 'table') {
      container.append(tableElement(block));
      continue;
    }
    const node = document.createElement(block.tag);
    if (block.tag === 'hr') {
      container.append(node);
      continue;
    }
    if (block.tag === 'pre') {
      const code = document.createElement('code');
      code.textContent = block.text;
      node.append(code);
    } else if ('lines' in block)
      block.lines.forEach((line, i) => {
        if (i) node.append(document.createElement('br'));
        appendInline(node, line);
      });
    else if ('items' in block)
      for (const item of block.items) {
        const li = document.createElement('li');
        appendInline(li, item);
        node.append(li);
      }
    else appendInline(node, block.children);
    container.append(node);
  }
}
/** Backslash-escapes every character the Markdown vocabulary treats specially (inline undoes it). */
const escapeText = (s: string) => s.replace(/([\\`*_[\]#>+.!|~-])/g, '\\$1');
/**
 * Serialises the visual editor's DOM back to the Markdown vocabulary that renderMarkdown
 * reads. Text is escaped, so typed asterisks and the like survive a round trip; formatting
 * the browser's editing commands produce (b/strong, i/em, headings, lists, links, p/div) is
 * mapped back; embedded and scripted elements are dropped, and unknown elements keep only
 * their text. Links that fail safeNoteLink are reduced to their text. Nesting deeper than
 * 32 elements is cut off. Runs of blank lines are collapsed and the result trimmed.
 */
export function editorMarkdown(container: HTMLElement): string {
  const walk = (node: Node, depth = 0): string => {
    if (depth > 32) return '';
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '');
    if (!(node instanceof HTMLElement)) return '';
    if (
      ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'VIDEO', 'AUDIO'].includes(node.tagName)
    )
      return '';
    const children = () =>
      Array.from(node.childNodes)
        .map((n) => walk(n, depth + 1))
        .join('');
    switch (node.tagName) {
      case 'BR':
        return '\n';
      case 'STRONG':
      case 'B':
        return `**${children()}**`;
      case 'EM':
      case 'I':
        return `*${children()}*`;
      case 'DEL':
      case 'S':
      case 'STRIKE':
        return `~~${children()}~~`;
      case 'HR':
        return '\n\n---\n\n';
      case 'TABLE': {
        // Each row on one line, its cells' line breaks as spaces; the first row is the header,
        // and the delimiter row keeps the header cells' alignment.
        const rows = Array.from(node.querySelectorAll('tr'))
          .filter((tr) => tr.closest('table') === node)
          .map((tr) => Array.from(tr.children).filter((c) => ['TH', 'TD'].includes(c.tagName)));
        if (!rows.length || !rows[0].length) return '';
        const columns = rows[0].length;
        const line = (cells: string[]) => '| ' + cells.join(' | ') + ' |';
        const text = (cell: Element | undefined) =>
          cell
            ? Array.from(cell.childNodes)
                .map((n) => walk(n, depth + 2))
                .join('')
                .replace(/\s*\n\s*/g, ' ')
                .trim()
            : '';
        const align = rows[0].map((cell) => {
          const a = (cell as HTMLElement).style.textAlign;
          return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---';
        });
        return (
          '\n\n' +
          [
            line(rows[0].map(text)),
            line(align),
            ...rows
              .slice(1)
              .map((r) => line(Array.from({ length: columns }, (_, i) => text(r[i])))),
          ].join('\n') +
          '\n\n'
        );
      }
      // Inline code can't contain backticks (there is no escape inside code spans), nor a
      // fenced block a closing fence, so those are removed.
      case 'CODE':
        return `\`${(node.textContent ?? '').replace(/`/g, '')}\``;
      case 'PRE':
        return '\n\n```\n' + (node.textContent ?? '').replace(/```/g, '') + '\n```\n\n';
      case 'A': {
        const href = safeNoteLink(node.getAttribute('href') ?? '');
        // Parentheses are percent-encoded so they cannot end the link's URL early.
        return href
          ? `[${children()}](${href.replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))})`
          : children();
      }
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6':
        return '\n\n' + '#'.repeat(Number(node.tagName[1])) + ' ' + children() + '\n\n';
      case 'BLOCKQUOTE':
        return (
          '\n\n' +
          children()
            .split('\n')
            .map((l) => '> ' + l)
            .join('\n') +
          '\n\n'
        );
      case 'LI': {
        const ordered = node.parentElement?.tagName === 'OL';
        const index = Array.from(node.parentElement?.children ?? []).indexOf(node) + 1;
        return `${ordered ? index + '.' : '-'} ${children().trim()}\n`;
      }
      case 'UL':
      case 'OL':
        return '\n\n' + children() + '\n';
      case 'P':
      case 'DIV':
        return '\n\n' + children() + '\n\n';
      default:
        return children();
    }
  };
  return Array.from(container.childNodes)
    .map((n) => walk(n))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/**
 * The textarea remains the source of truth; switching modes never rewrites untouched Markdown.
 *
 * Hides `input` behind a visual editor (a contenteditable div with a formatting toolbar) and
 * an **Edit Markdown** toggle back to the textarea. Each visual edit rewrites the textarea's
 * value with editorMarkdown and dispatches a bubbling `input` event, so the form sees an
 * ordinary edit. When `editable` is false both views are read-only, but the toggle still
 * works for reading the source. Notes over 100,000 characters open in the textarea only.
 * Returns a function that removes the editor and shows the textarea again.
 */
export function attachRichText(input: HTMLTextAreaElement, editable: boolean) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rich-text-editor';
  const toolbar = document.createElement('div');
  toolbar.className = 'rich-text-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.ariaLabel = 'Notes formatting';
  const editor = document.createElement('div');
  editor.className = 'rich-text-content markdown-view';
  editor.contentEditable = String(editable);
  // A contenteditable div has no implicit role; these make it read as a multi-line text field.
  editor.setAttribute('role', 'textbox');
  editor.ariaLabel = 'Rich text notes';
  editor.setAttribute('aria-multiline', 'true');
  renderMarkdown(editor, input.value);
  input.disabled = !editable;
  input.before(wrapper);
  wrapper.append(toolbar, editor);
  input.hidden = true;
  /** True while the Markdown source (the textarea) is shown instead of the visual editor. */
  let source = false;
  // renderMarkdown shows only the first 100,000 characters, and a visual edit would write
  // that truncated rendering back over the notes; larger notes are edited as source only.
  const oversized = input.value.length > 100000;
  if (oversized) {
    const notice = document.createElement('p');
    notice.className = 'field-hint';
    notice.textContent =
      'These notes are too large for the visual editor. Edit the complete Markdown source below.';
    wrapper.append(notice);
    editor.hidden = true;
    input.hidden = false;
    toolbar.hidden = true;
    editor.contentEditable = 'false';
  }
  /** Writes the visual editor's content back to the textarea and announces the change. */
  const sync = () => {
    input.value = editorMarkdown(editor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  /** Adds a toolbar button; `always` keeps it enabled in read-only mode (the mode toggle). */
  const button = (label: string, action: () => void, always = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', label);
    b.disabled = !editable && !always;
    // Keep focus, and with it the text selection, in the editor while clicking the toolbar.
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = action;
    toolbar.append(b);
    return b;
  };
  /**
   * Applies a browser editing command to the selection and syncs. execCommand is deprecated
   * but still supported by browsers; whatever HTML it produces is normalised by
   * editorMarkdown on sync.
   */
  const command = (name: string, value?: string) => {
    if (!editable) return;
    editor.focus();
    document.execCommand(name, false, value);
    sync();
  };
  for (const [label, name, value] of [
    ['Bold', 'bold'],
    ['Italic', 'italic'],
    ['Heading', 'formatBlock', 'h2'],
    ['Paragraph', 'formatBlock', 'p'],
    ['Bullets', 'insertUnorderedList'],
    ['Numbered', 'insertOrderedList'],
  ])
    button(label, () => command(name, value));
  button('Link', () => {
    const url = window.prompt('HTTPS link URL');
    if (url && safeNoteLink(url)) command('createLink', safeNoteLink(url)!);
  });
  const toggle = button(
    'Edit Markdown',
    () => {
      source = !source;
      input.hidden = !source;
      editor.hidden = source;
      for (const b of toolbar.querySelectorAll('button'))
        if (b !== toggle) b.disabled = source || !editable;
      toggle.textContent = source ? 'Visual editor' : 'Edit Markdown';
      toggle.setAttribute('aria-label', toggle.textContent);
      // Returning to the visual view re-renders from the textarea, which may have been edited.
      if (!source) renderMarkdown(editor, input.value);
    },
    true,
  );
  editor.oninput = sync;
  // Paste only plain text, so no foreign HTML, styles or images enter the notes.
  editor.onpaste = (e) => {
    e.preventDefault();
    command('insertText', e.clipboardData?.getData('text/plain') ?? '');
  };
  editor.addEventListener('beforeinput', (e) => {
    if (
      ['insertFromDrop', 'insertFromPaste', 'insertFromPasteAsQuotation'].includes(
        (e as InputEvent).inputType,
      )
    )
      e.preventDefault();
  });
  editor.ondrop = (e) => e.preventDefault(); // Never import rich clipboard HTML or dropped external resources.
  // In an editable view a click on a link places the caret instead of following it.
  editor.onclick = (e) => {
    if (editable && (e.target as Element).closest('a')) e.preventDefault();
  };
  return () => {
    wrapper.remove();
    input.hidden = false;
  };
}
