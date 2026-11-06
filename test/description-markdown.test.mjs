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
import { markdownHtml, markdownText, parseMarkdown } from '../dist/core.mjs';

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

const table =
  'Legend:\n\n| Feature | Meaning \\| here |\n| :--- | ---: |\n| **Ellipses** | Conditions |\n' +
  '| `a|b` | extra | dropped |\n| short |\n\nAfter.';

test('Tables: a header, alignment from the delimiter row, rows padded or cut to its columns', () => {
  const [, block, after] = parseMarkdown(table);
  assert.deepEqual(block, {
    tag: 'table',
    align: ['left', 'right'],
    head: [['Feature'], ['Meaning | here']],
    rows: [
      [[{ tag: 'strong', children: ['Ellipses'] }], ['Conditions']],
      [[{ tag: 'code', text: 'a|b' }], ['extra']],
      [['short'], []],
    ],
  });
  assert.deepEqual(after, { tag: 'p', lines: [['After.']] });
  // Without a matching delimiter row, pipes are just text.
  assert.deepEqual(parseMarkdown('a | b\nc | d'), [{ tag: 'p', lines: [['a | b'], ['c | d']] }]);
  assert.deepEqual(parseMarkdown('| a | b |\n| --- |'), [
    { tag: 'p', lines: [['| a | b |'], ['| --- |']] },
  ]);
  assert.equal(
    markdownText(table),
    'Legend:\n\nFeature · Meaning | here\nEllipses · Conditions\na|b · extra\nshort · \n\nAfter.',
  );
});

test('Text built to slow the parser down is read in linear time, as tables still are', () => {
  // A delimiter row of spaces round one dash once took cubic time (4 KB: 10 s, 20 KB: minutes),
  // and a run of `<` quadratic time in excerpts; both are rendered on the server for anyone.
  const row = ' '.repeat(10000) + '-' + ' '.repeat(9990) + 'x';
  let started = Date.now();
  assert.match(markdownText('a|b\n' + row), /^a\|b\n *- *x$/);
  markdownHtml('a|b\n' + row);
  assert(Date.now() - started < 1000, `a long delimiter row took ${Date.now() - started} ms`);
  started = Date.now();
  assert.equal(site.excerpt('<'.repeat(40000), 20), '<'.repeat(19) + '…');
  assert(Date.now() - started < 1000, `a run of < took ${Date.now() - started} ms`);
  // Tags are still dropped, and delimiter rows still read with or without their outer pipes.
  assert.equal(site.excerpt('<b>Rough</b> seas'), 'Rough seas');
  for (const delimiter of ['| :--- | ---: |', ':--- | ---:', '|:---|---:|'])
    assert.deepEqual(parseMarkdown(`| a | b |\n${delimiter}\n| c | d |`)[0].align, [
      'left',
      'right',
    ]);
  assert.equal(parseMarkdown('| a | b |\n| --- | x |')[0].tag, 'p');
});

test('Rules, deeper headings, + bullets, strikethrough, underscores and https autolinks', () => {
  assert.deepEqual(parseMarkdown('---\n#### Four\n###### Six\n+ one\n* * *'), [
    { tag: 'hr' },
    { tag: 'h4', children: ['Four'] },
    { tag: 'h6', children: ['Six'] },
    { tag: 'ul', items: [['one']] },
    { tag: 'hr' },
  ]);
  assert.deepEqual(parseMarkdown('~~gone~~ _soft_ __loud__ snake_case_name'), [
    {
      tag: 'p',
      lines: [
        [
          { tag: 'del', children: ['gone'] },
          ' ',
          { tag: 'em', children: ['soft'] },
          ' ',
          { tag: 'strong', children: ['loud'] },
          ' snake_case_name',
        ],
      ],
    },
  ]);
  assert.deepEqual(
    parseMarkdown('See https://example.com/a_b. Or <https://example.org>, not http://x.example'),
    [
      {
        tag: 'p',
        lines: [
          [
            'See ',
            { tag: 'a', href: 'https://example.com/a_b', text: 'https://example.com/a_b' },
            '. Or ',
            { tag: 'a', href: 'https://example.org/', text: 'https://example.org' },
            ', not http://x.example',
          ],
        ],
      },
    ],
  );
  assert.equal(markdownText('One\n\n---\n\nTwo'), 'One\n\nTwo');
});

test('The page’s text renders tables and rules; cards read a table’s cells', () => {
  const out = html(site.Markdown, { text: table + '\n\n---' });
  assert.match(
    out,
    /<div class="markdown-table"><table><thead><tr><th style="text-align:left">Feature<\/th><th style="text-align:right">Meaning \| here<\/th><\/tr><\/thead><tbody><tr><td style="text-align:left"><strong>Ellipses<\/strong><\/td>/,
  );
  assert.match(out, /<hr\/><\/div>$/);
  assert.equal(html(site.MarkdownExcerpt, { text: '| A | B |\n| - | - |\n| 1 | 2 |' }), 'A B 1 2');
});

test('The editor’s heading served with its page renders the description as the editor does (#428)', () => {
  // Element for element renderMarkdown's DOM, as HTML text, with every string escaped.
  assert.equal(
    markdownHtml(
      '**Bold** & *em* `<x>`\nnext line\n\n- one\n- [two](https://example.com/?a=1&b="2")',
    ),
    '<p><strong>Bold</strong> &amp; <em>em</em> <code>&lt;x&gt;</code><br>next line</p>' +
      '<ul><li>one</li><li><a href="https://example.com/?a=1&amp;b=%222%22" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">two</a></li></ul>',
  );
  assert.equal(
    markdownHtml(table),
    '<p>Legend:</p><div class="markdown-table"><table><thead><tr>' +
      '<th style="text-align: left;">Feature</th><th style="text-align: right;">Meaning | here</th>' +
      '</tr></thead><tbody><tr><td style="text-align: left;"><strong>Ellipses</strong></td>' +
      '<td style="text-align: right;">Conditions</td></tr><tr><td style="text-align: left;">' +
      '<code>a|b</code></td><td style="text-align: right;">extra</td></tr><tr>' +
      '<td style="text-align: left;">short</td><td style="text-align: right;"></td></tr>' +
      '</tbody></table></div><p>After.</p>',
  );
  assert.equal(
    markdownHtml('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  );
  assert.equal(
    markdownHtml('# Title\n\n---\n\n```\na < b\n```'),
    '<h1>Title</h1><hr><pre><code>a &lt; b\n</code></pre>',
  );
  assert.equal(markdownHtml(''), '');
});
