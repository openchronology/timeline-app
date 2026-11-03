// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A source that is a file on a computer (#433), as the desktop app's inspector and reader list
// it: the file's name as a link (opened by app.ts in the file's own app, never in the page) and a
// Show in folder button. Other builds don't list file links (localSource).
import { localFileName } from './local-files.js';

/** The list item's contents for file link `url`. */
export function localFileItem(url: string): (Node | string)[] {
  const name = localFileName(url),
    path = decodeURI(new URL(url).pathname);
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
