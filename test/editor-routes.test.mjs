// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The editor's own pages, which set their own headers rather than proxy.js's: the frame the
// site's pages show (/editor/frame) and embeds (/embed/<id>). HSTS over https as on the site's
// other pages, and an embed's title taken as written.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/**
 * The two routes and editor-html.js, bundled as Next.js would compile them, with `server-only`
 * (which only refuses to be bundled for a browser) left empty, Next's request helpers stubbed
 * and other packages left to Node.
 */
async function load() {
  const cache = new URL('../node_modules/.cache', import.meta.url).pathname;
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(join(cache, 'editor-routes-'));
  const entry = join(dir, 'entry.mjs'),
    file = join(dir, 'bundle.mjs');
  const root = new URL('..', import.meta.url).pathname;
  await writeFile(
    entry,
    `export { titledEditor } from ${JSON.stringify(root + 'platform/lib/editor-html.js')};
    export { GET as frame } from ${JSON.stringify(root + 'platform/app/editor/frame/route.js')};
    export { GET as embed } from ${JSON.stringify(root + 'platform/app/embed/[id]/route.js')};`,
  );
  await build({
    entryPoints: [entry],
    outfile: file,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    logLevel: 'silent',
    plugins: [
      {
        name: 'server-only',
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'x' }));
          b.onLoad({ filter: /.*/, namespace: 'x' }, () => ({ contents: '' }));
        },
      },
      {
        // Next's request helpers, which these routes reach only for a timeline they look up.
        name: 'next',
        setup(b) {
          b.onResolve({ filter: /^next\// }, (args) => ({ path: args.path, namespace: 'next' }));
          b.onLoad({ filter: /.*/, namespace: 'next' }, () => ({
            contents: `const unused = () => { throw new Error('Not in this test'); };
            export { unused as headers, unused as cookies, unused as notFound, unused as redirect };`,
          }));
        },
      },
    ],
  });
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const routes = await load();

test("an embed's title is its timeline's, as written, with no $ patterns expanded", () => {
  const page =
    '<!doctype html><html><head><title>OpenChronology</title></head><body><p>rest</p></body></html>';
  for (const [title, text] of [
    ["x $' y", 'x $&#39; y'],
    ['a $& b', 'a $&amp; b'],
    ['c $` d', 'c $` d'],
    ['$1 $<name> $$', '$1 $&lt;name&gt; $$'],
  ]) {
    const html = routes.titledEditor(page, title, 'https://timescale.info/ada/voyages');
    // Nothing but the title changes; its text is escaped, its $ kept as written.
    const tag = `<title>${text} · OpenChronology</title><link rel="canonical" href="https://timescale.info/ada/voyages" />`;
    assert.equal(html, page.split('<title>OpenChronology</title>').join(tag), title);
    assert.equal(html.match(/<title>/g).length, 1);
  }
  assert.match(
    routes.titledEditor(page, '<b>"x" & y</b>', '/a"b'),
    /<title>&lt;b&gt;&quot;x&quot; &amp; y&lt;\/b&gt; · OpenChronology<\/title><link rel="canonical" href="\/a&quot;b" \/>/,
  );
});

test("the editor's frame and embeds ask for HSTS over https only, keeping their own policies", async () => {
  const before = process.env.APP_ORIGIN;
  const silence = console.error;
  console.error = () => {};
  try {
    for (const [origin, hsts] of [
      ['https://timescale.info', 'max-age=31536000'],
      ['http://127.0.0.1:5173', null],
    ]) {
      process.env.APP_ORIGIN = origin;
      const frame = await routes.frame(new Request(origin + '/editor/frame'));
      assert.equal(frame.status, 200);
      assert.equal(frame.headers.get('strict-transport-security'), hsts, origin);
      assert.match(frame.headers.get('content-security-policy'), /frame-ancestors 'self'/);
      // Without a database no timeline is public: the embed's answer is a 404, with its headers.
      const embed = await routes.embed(new Request(origin + '/embed/x'), {
        params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }),
      });
      assert.equal(embed.status, 404);
      assert.equal(embed.headers.get('strict-transport-security'), hsts, origin);
      assert.match(embed.headers.get('content-security-policy'), /frame-ancestors \*/);
    }
  } finally {
    console.error = silence;
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
});
