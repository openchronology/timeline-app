// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** A deliberately small Markdown vocabulary. No HTML, images, embeds or executable URLs. */
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
function inline(parent: HTMLElement, text: string, depth = 0) {
  if (depth > 12) {
    parent.append(document.createTextNode(text));
    return;
  }
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
      } else parent.append(document.createTextNode(match[0]));
    }
    start = match.index! + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(start)));
}
export function renderMarkdown(container: HTMLElement, markdown: string) {
  container.replaceChildren();
  container.classList.add('markdown-view');
  const lines = markdown.slice(0, 100000).replace(/\r\n?/g, '\n').split('\n');
  let list: HTMLElement | null = null,
    paragraph: HTMLElement | null = null,
    code: HTMLElement | null = null;
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
const escapeText = (s: string) => s.replace(/([\\`*_[\]#>+.!-])/g, '\\$1');
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
      case 'CODE':
        return `\`${(node.textContent ?? '').replace(/`/g, '')}\``;
      case 'PRE':
        return '\n\n```\n' + (node.textContent ?? '').replace(/```/g, '') + '\n```\n\n';
      case 'A': {
        const href = safeNoteLink(node.getAttribute('href') ?? '');
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
/** The textarea remains the source of truth; switching modes never rewrites untouched Markdown. */
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
  editor.setAttribute('role', 'textbox');
  editor.ariaLabel = 'Rich text notes';
  editor.setAttribute('aria-multiline', 'true');
  renderMarkdown(editor, input.value);
  input.disabled = !editable;
  input.before(wrapper);
  wrapper.append(toolbar, editor);
  input.hidden = true;
  let source = false;
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
  const sync = () => {
    input.value = editorMarkdown(editor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const button = (label: string, action: () => void, always = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.disabled = !editable && !always;
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = action;
    toolbar.append(b);
    return b;
  };
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
      if (!source) renderMarkdown(editor, input.value);
    },
    true,
  );
  editor.oninput = sync;
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
  editor.onclick = (e) => {
    if (editable && (e.target as Element).closest('a')) e.preventDefault();
  };
  return () => {
    wrapper.remove();
    input.hidden = false;
  };
}
