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
 * Appends one line of inline Markdown to `parent` as DOM nodes, never as HTML: backslash
 * escapes, `code`, **strong**, *emphasis* and [text](https link). Everything else, including
 * any HTML tags, becomes text nodes. Strong and emphasis recurse into their contents; past
 * twelve levels the rest is shown as plain text, bounding the recursion on hostile input.
 */
function inline(parent: HTMLElement, text: string, depth = 0) {
  if (depth > 12) {
    parent.append(document.createTextNode(text));
    return;
  }
  // Alternatives, tried left to right at each position: an escaped punctuation character
  // (group 1), inline code (2), strong (3, lazy so `**a** and **b**` is two), emphasis (4),
  // and a link's text and URL (5, 6). Every repetition is bounded, which limits the work
  // each match attempt can do on long or hostile notes.
  const pattern =
    /\\([\\`*_[\]#>+.!-])|`([^`\n]{1,2048})`|\*\*([^\n]{1,2048}?)\*\*|\*([^*\n]{1,2048})\*|\[([^\]\n]{1,512})\]\(([^\s)]{1,4096})\)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(start, match.index)));
    if (match[1]) parent.append(document.createTextNode(match[1]));
    else if (match[2]) {
      const code = document.createElement('code');
      code.textContent = match[2];
      parent.append(code);
    } else if (match[3] || match[4]) {
      const node = document.createElement(match[3] ? 'strong' : 'em');
      inline(node, match[3] || match[4], depth + 1);
      parent.append(node);
    } else {
      const href = safeNoteLink(match[6]);
      if (href) {
        const link = document.createElement('a');
        link.textContent = match[5];
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
        parent.append(link);
      } else parent.append(document.createTextNode(match[0])); // Unsafe URL: shown literally.
    }
    start = match.index! + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(start)));
}
/**
 * Replaces `container`'s contents with the rendering of `markdown`, line by line: ``` fences
 * (contents kept verbatim as text), `#` to `###` headings, `>` quotes, `-`/`*` bullets and
 * `1.` numbered items, and paragraphs, where consecutive lines are joined with line breaks
 * and a blank line ends the block. Only the first 100,000 characters are rendered. Builds
 * DOM nodes directly (no innerHTML), so no markup in the notes can run or load anything.
 */
export function renderMarkdown(container: HTMLElement, markdown: string) {
  container.replaceChildren();
  container.classList.add('markdown-view');
  const lines = markdown.slice(0, 100000).replace(/\r\n?/g, '\n').split('\n');
  let list: HTMLElement | null = null,
    paragraph: HTMLElement | null = null,
    code: HTMLElement | null = null;
  // The open list, paragraph or code block that the next line may continue.
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (code) code = null;
      else {
        const pre = document.createElement('pre');
        code = document.createElement('code');
        pre.append(code);
        container.append(pre);
      }
      list = paragraph = null;
      continue;
    }
    if (code) {
      code.append(document.createTextNode(line + '\n'));
      continue;
    }
    if (!line.trim()) {
      list = paragraph = null;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line),
      item = /^(?:([-*])|\d+\.)\s+(.*)$/.exec(line),
      quote = /^>\s?(.*)$/.exec(line);
    if (item) {
      const tag = item[1] ? 'UL' : 'OL';
      // A change between bullets and numbers starts a new list; item numbers themselves are
      // not kept, an ordered list always counts from one.
      if (!list || list.tagName !== tag) {
        list = document.createElement(tag.toLowerCase());
        container.append(list);
      }
      const li = document.createElement('li');
      inline(li, item[2]);
      list.append(li);
      paragraph = null;
    } else if (heading || quote) {
      const node = document.createElement(heading ? `h${heading[1].length}` : 'blockquote');
      inline(node, heading ? heading[2] : quote![1]);
      container.append(node);
      list = paragraph = null;
    } else {
      if (!paragraph) {
        paragraph = document.createElement('p');
        container.append(paragraph);
      } else paragraph.append(document.createElement('br'));
      inline(paragraph, line);
      list = null;
    }
  }
}
/** Backslash-escapes every character the Markdown vocabulary treats specially (inline undoes it). */
const escapeText = (s: string) => s.replace(/([\\`*_[\]#>+.!-])/g, '\\$1');
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
