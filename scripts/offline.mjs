// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the standalone offline editor, dist/openchronology-offline.html: one file with its
// script and styles inlined, no network transport, a hash-pinned content security policy, and
// the legal notices, licenses included. Each edition (src/editions.ts, #197) is built the same
// way beside it, as dist/openchronology-offline-<id>.html.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withLegal, copyrightBanner } from './legal.mjs';

/** The editions' IDs, from src/editions.ts itself, bundled and loaded here. */
async function editions() {
  const bundled = await build({
    entryPoints: ['src/editions.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const { EDITIONS } = await import(
    'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
  );
  return EDITIONS.map((e) => e.id);
}
/** The general offline file, then one per edition. */
export async function buildOffline() {
  await buildEdition(null);
  for (const id of await editions()) await buildEdition(id);
}
async function buildEdition(edition) {
  const result = await build({
    entryPoints: ['src/app.ts'],
    outfile: 'offline/app.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
    sourcemap: false,
    write: false,
    metafile: true,
    define: { __OFFLINE_HTML__: 'true', __EDITION__: JSON.stringify(edition) },
    banner: { js: copyrightBanner },
    plugins: [
      {
        name: 'exclude-network-transport',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/live-updates\.js$/ }, () => ({
            path: resolve('src/offline-live.ts'),
          }));
          builder.onResolve({ filter: /^\.\/transport\.js$/ }, () => ({
            path: resolve('src/offline-transport.ts'),
          }));
        },
      },
    ],
  });
  if (
    'src/transport.ts' in result.metafile.inputs ||
    'src/live-updates.ts' in result.metafile.inputs ||
    !('src/offline-transport.ts' in result.metafile.inputs)
  )
    throw new Error('Offline build must exclude the HTTP transport.');
  for (const output of Object.values(result.metafile.outputs)) {
    if (output.imports.length) throw new Error('Offline build contains an external dependency.');
  }
  const script = result.outputFiles
    .find((file) => file.path.endsWith('.js'))
    .text.replace(/<\/script/gi, '<\\/script');
  const css = result.outputFiles
    .find((file) => file.path.endsWith('.css'))
    .text.replace(/<\/style/gi, '<\\/style');
  const hash = createHash('sha256').update(script).digest('base64');
  const policy = `default-src 'none'; script-src 'sha256-${hash}'; script-src-attr 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
  let html = await withLegal(await readFile('src/index.html', 'utf8'), false);
  html = html
    .replace(
      '<meta charset="utf-8" />',
      () =>
        `<meta charset="utf-8" />\n<meta http-equiv="Content-Security-Policy" content="${policy}">\n<meta name="referrer" content="no-referrer">`,
    )
    .replace(
      /<link\s+rel="stylesheet"[^>]*\/>/,
      () =>
        `<style>${css}\nbody[data-offline] .app-layout{grid-template-columns:minmax(0,1fr)}@media(max-width:960px){body[data-offline] .app-layout{grid-template-columns:minmax(0,1fr)}}body[data-offline] .document-toolbar{justify-content:flex-end}</style>`,
    )
    .replace(/<script\s+type="module"[^>]*><\/script>/, '')
    .replace('</body>', () => `<script>${script}</script>\n</body>`);
  await mkdir('dist', { recursive: true });
  if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html))
    throw new Error('Offline HTML contains an external asset.');
  await writeFile(`dist/openchronology-offline${edition ? '-' + edition : ''}.html`, html);
}
