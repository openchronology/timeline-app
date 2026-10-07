// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dependencyLicenses } from './licenses.mjs';
import { withLegal, copyrightBanner } from './legal.mjs';

export async function buildOffline() {
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
    define: { __OFFLINE_HTML__: 'true' },
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
  const icon =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#192d25"/><circle cx="16" cy="16" r="10" fill="none" stroke="#c4db98" stroke-width="2"/><path d="M16 8v8l6 4" fill="none" stroke="#c4db98" stroke-width="2"/></svg>',
    ).toString('base64');
  const licenses = [
    `LICENSE\n\n${await readFile('LICENSE', 'utf8')}`,
    ...(await dependencyLicenses()),
  ];
  const escape = (text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  let html = await withLegal(await readFile('src/index.html', 'utf8'), false);
  html = html
    .replace(
      '<meta charset="utf-8" />',
      () =>
        `<meta charset="utf-8" />\n<meta http-equiv="Content-Security-Policy" content="${policy}">\n<meta name="referrer" content="no-referrer">\n<link rel="icon" href="${icon}">`,
    )
    .replace(
      /<link\s+rel="stylesheet"[^>]*\/>/,
      () =>
        `<style>${css}\nbody[data-offline] .app-layout{grid-template-columns:minmax(0,1fr)}@media(max-width:960px){body[data-offline] .app-layout{grid-template-columns:minmax(0,1fr)}}body[data-offline] .document-toolbar{justify-content:flex-end}.offline-notices{font-size:10px;max-width:100%;padding:0 30px 20px}.offline-notices pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}</style>`,
    )
    .replace(/<script\s+type="module"[^>]*><\/script>/, '')
    .replace(
      '</body>',
      () =>
        `<details class="offline-notices"><summary>Licenses</summary><pre>${escape(licenses.join('\n\n'))}</pre></details>\n<script>${script}</script>\n</body>`,
    );
  await mkdir('dist', { recursive: true });
  if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html))
    throw new Error('Offline HTML contains an external asset.');
  await writeFile('dist/openchronology-offline.html', html);
}
