// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export const copyrightBanner =
  '/*! OpenChronology — Copyright (c) 2026 Athan Clark. GPL-3.0-only; see LICENSE. No warranty. */';
const escape = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export async function legalMarkup(source = false) {
  const documents = [
    ['NOTICE', 'Copyright and software rights'],
    ['legal/TERMS.md', 'Hosted service terms (draft)'],
    ['legal/PRIVACY.md', 'Privacy notice (draft)'],
    ['legal/COPYRIGHT.md', 'Copyright, abuse, and security reports (draft)'],
    ['legal/LAUNCH.md', 'Operator details pending before launch'],
    ['LICENSE', 'GNU General Public License version 3'],
    ['THIRD_PARTY.md', 'Third-party notices'],
  ];
  const parts = [];
  for (const [file, title] of documents)
    parts.push(
      `<details><summary>${title}</summary><pre>${escape(await readFile(file, 'utf8'))}</pre></details>`,
    );
  return `<footer class="legal-notices"><details><summary>© 2026 Athan Clark · OpenChronology · GPLv3 · No warranty · Terms &amp; privacy</summary>${source ? '<p><a href="openchronology-web-source.tar.gz" download>Download matching web source</a></p>' : ''}${parts.join('\n')}</details></footer>`;
}
export async function withLegal(html, source = true) {
  if (!html.includes('<!-- OPENCHRONOLOGY_LEGAL -->'))
    throw new Error('Missing legal notice location');
  return html.replace('<!-- OPENCHRONOLOGY_LEGAL -->', await legalMarkup(source));
}
export async function buildLegal() {
  await mkdir('dist', { recursive: true });
  const content = await legalMarkup(true);
  await writeFile(
    'dist/legal.html',
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenChronology / timescale.info legal notices</title><link rel="stylesheet" href="app.css"><body><main><h1>OpenChronology / timescale.info</h1><p>Copyright © 2026 Athan Clark, an individual. Software: GPLv3. Hosted policies are drafts pending operator details.</p>${content}</main></body></html>`,
  );
  await writeFile('dist/LICENSE.txt', await readFile('LICENSE'));
  await writeFile('dist/NOTICE.txt', await readFile('NOTICE'));
}
