// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFile, writeFile, rename } from 'node:fs/promises';
import { buildLegal, withLegal } from './legal.mjs';

export async function buildHtml() {
  await buildLegal();
  const html = await withLegal(await readFile('src/index.html', 'utf8'));
  // A running dev server must not serve a partially written template.
  await writeFile('dist/index.html.next', html);
  await rename('dist/index.html.next', 'dist/index.html');
}
