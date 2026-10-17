// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Writes dist/index.html, the editor's page (src/index.html) with its legal footer, and
// dist/legal.html.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { buildLegal, withLegal } from './legal.mjs';

export async function buildHtml() {
  await buildLegal();
  const html = await withLegal(await readFile('src/index.html', 'utf8'));
  // A running dev server must not serve a partially written template.
  await writeFile('dist/index.html.next', html);
  await rename('dist/index.html.next', 'dist/index.html');
}
