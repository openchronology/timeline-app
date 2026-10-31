// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's description is Markdown (#398): parsed with the notes' vocabulary
// (src/rich-text.ts), rendered on the website's pages and cards, and plain text wherever only
// text goes (page metadata, link previews, structured data).
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { markdownText, parseMarkdown } from '../dist/core.mjs';

process.env.APP_ORIGIN = 'https://chronology.example';

/** The sharing helpers and the description's components, bundled as Next.js would. */
async function load() {
  const cache = new URL('../node_modules/.cache', import.meta.url).pathname;
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(join(cache, 'description-markdown-'));
  const entry = join(dir, 'entry.mjs'),
    file = join(dir, 'bundle.mjs');
  const root = new URL('..', import.meta.url).pathname;
  await writeFile(
    entry,
    `export * from ${JSON.stringify(root + 'platform/lib/sharing.js')};
    export { default as Markdown, MarkdownExcerpt } from ${JSON.stringify(root + 'platform/components/markdown.jsx')};
    export { default as TimelineSummary } from ${JSON.stringify(root + 'platform/components/timeline-summary.jsx')};`,
  );
  await build({
    entryPoints: [entry],
    outfile: file,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'server-only',
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'x' }));
          b.onLoad({ filter: /.*/, namespace: 'x' }, () => ({ contents: '' }));
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
const site = await load();
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

const halloween =
  'A history of Halloween. **Explore the story.** Hover over *clusters*; see ' +
  '[the guide](https://example.com/guide).\n\n**What the dates mean.** Year-only dates.';

test('Markdown parses to blocks and inline nodes with only https links', () => {
  assert.deepEqual(parseMarkdown('# Title\nOne **bold**\ntwo\n\n- a\n- [x](javascript:1)'), [
    { tag: 'h1', children: ['Title'] },
    { tag: 'p', lines: [['One ', { tag: 'strong', children: ['bold'] }], ['two']] },
    { tag: 'ul', items: [['a'], ['[x](javascript:1)']] },
  ]);
  assert.deepEqual(parseMarkdown('```\n<b>x</b>\n```'), [{ tag: 'pre', text: '<b>x</b>\n' }]);
});

test('Markdown as plain text drops the markup and keeps the words', () => {
  assert.equal(
    markdownText(halloween),
    'A history of Halloween. Explore the story. Hover over clusters; see the guide.\n\n' +
      'What the dates mean. Year-only dates.',
  );
  assert.equal(markdownText('\\*literal\\* and `code`'), '*literal* and code');
  assert.equal(markdownText('Plain words, no markup.'), 'Plain words, no markup.');
});

test('Page metadata and previews take the description as plain text', () => {
  const timeline = { title: 'Halloween', description: halloween, event_count: 2 };
  const description = site.timelineDescription(timeline);
  assert(!description.includes('**'), description);
  assert(!description.includes('](https'), description);
  assert.match(description, /^A history of Halloween\. Explore the story\. Hover over clusters/);
  assert.equal(site.descriptionExcerpt(timeline, 30), 'A history of Halloween. Explo…');
  // None falls back to its facts.
  assert.equal(site.timelineDescription({ event_count: 1 }), '1 moment');
});

test('The page’s text renders the description’s Markdown, escaping any HTML', () => {
  const out = html(site.Markdown, {
    text: halloween + '\n\n<script>alert(1)</script> [x](javascript:alert(1))',
  });
  assert.match(out, /^<div class="markdown-view">/);
  assert.match(out, /<strong>Explore the story\.<\/strong>/);
  assert.match(out, /<em>clusters<\/em>/);
  assert.match(
    out,
    /<a href="https:\/\/example\.com\/guide" rel="ugc nofollow noopener noreferrer" target="_blank">the guide<\/a>/,
  );
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt; \[x\]\(javascript:alert\(1\)\)/);
  assert(!out.includes('<script'), out);
  assert(!out.includes('href="javascript'), out);
  const summary = html(site.TimelineSummary, {
    timeline: { title: 'Halloween', description: halloween, event_count: 0 },
  });
  assert.match(summary, /<strong>What the dates mean\.<\/strong>/);
  assert(!summary.includes('**'), summary);
});

test('Cards show the start of the description on one line, formatted, without links', () => {
  const card = html(site.MarkdownExcerpt, { text: halloween });
  assert.equal(
    card,
    'A history of Halloween. <strong>Explore the story.</strong> Hover over <em>clusters</em>; ' +
      'see the guide. <strong>What the dates mean.</strong> Year-only dates.',
  );
  const cut = html(site.MarkdownExcerpt, { text: halloween, length: 40 });
  assert.equal(cut, 'A history of Halloween. <strong>Explore the sto</strong>…');
  assert.equal(html(site.MarkdownExcerpt, { text: '<b>hi</b>' }), '&lt;b&gt;hi&lt;/b&gt;');
  assert.equal(html(site.MarkdownExcerpt, { text: '' }), '');
});
