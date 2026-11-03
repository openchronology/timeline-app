// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A source that is a file on a computer (#433), as the inspector and the reader list it: in the
// desktop app, the file's name as a link (opened by app.ts in the file's own app, never in the
// page) and a Show in folder button; elsewhere its name as text, since only that computer has it.
import { localFileName } from './local-files.js';

/** The list item's contents for file link `url`. */
export function localFileItem(url: string): (Node | string)[] {
  const name = localFileName(url),
    path = decodeURI(new URL(url).pathname);
  if (!window.__TAURI__) {
    const text = document.createElement('span');
    text.className = 'local-file-link';
    text.textContent = name;
    text.title = path;
    const where = document.createElement('span');
    where.className = 'field-hint';
    where.textContent = ' (a file on the computer that added it)';
    return [text, where];
  }
  const link = document.createElement('a');
  link.className = 'local-file-link';
  link.href = url;
  link.textContent = name;
  link.title = path;
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'local-file-reveal';
  reveal.dataset.localFile = url;
  reveal.textContent = 'Show in folder';
  return [link, ' ', reveal];
}
