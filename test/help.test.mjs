// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The help area (#172): Markdown as the docs write it, every doc in a section, every link
// between them leading somewhere, and search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { HELP_SECTIONS, helpLink, helpPages, renderMarkdown, searchHelp } from '../server/help.mjs';

const render = (source) => renderMarkdown(source).html;

test('Markdown: headings with GitHub’s anchors, emphasis, code and escaping', () => {
  const { html, headings } = renderMarkdown(
    '# Title\n\n## Separating by tags\n\n## What *it* does (v2)\n\n## Separating by tags',
  );
  assert.deepEqual(
    headings.map((h) => h.id),
    ['title', 'separating-by-tags', 'what-it-does-v2', 'separating-by-tags-1'],
  );
  assert.match(html, /<h2 id="what-it-does-v2">What <em>it<\/em> does \(v2\)<\/h2>/);
  assert.equal(
    render('**Bold**, *em*, `a <b> & c`, snake_case_name, 2 * 3 * 4 and \\*not\\*.'),
    '<p><strong>Bold</strong>, <em>em</em>, <code>a &lt;b&gt; &amp; c</code>, snake_case_name, 2 * 3 * 4 and *not*.</p>',
  );
  assert.equal(render('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(
    render('[the `tags` page](tags.md#separating-by-tags) and <https://example.com>'),
    '<p><a href="tags.md#separating-by-tags">the <code>tags</code> page</a> and <a href="https://example.com">https://example.com</a></p>',
  );
});

test('Markdown: nested lists, code in lists, tables and fences', () => {
  assert.equal(
    render('- **One:** first\n  more of it\n  - nested\n- Two\n\n1. a\n2. b'),
    '<ul><li><strong>One:</strong> first\nmore of it\n<ul><li>nested</li></ul></li><li>Two</li></ul>\n<ol><li>a</li><li>b</li></ol>',
  );
  assert.match(
    render('- Run:\n\n  ```sh\n  npm test\n  ```\n\n- Then'),
    /<li><p>Run:<\/p>\n<pre><code class="language-sh">npm test<\/code><\/pre><\/li><li><p>Then<\/p><\/li>/,
  );
  assert.equal(
    render('| A | B |\n| - | -: |\n| `a|b` | c \\| d |'),
    '<div class="help-table"><table><thead><tr><th>A</th><th style="text-align:right">B</th></tr></thead><tbody><tr><td><code>a|b</code></td><td style="text-align:right">c | d</td></tr></tbody></table></div>',
  );
  assert.equal(
    render('```\n# not a heading\n<b>\n```'),
    '<pre><code># not a heading\n&lt;b&gt;</code></pre>',
  );
});

test('links: other docs are help pages, other files are on GitHub', () => {
  assert.equal(helpLink('tags.md#separating-by-tags'), '/help/tags#separating-by-tags');
  assert.equal(helpLink('#addresses'), '#addresses');
  assert.equal(helpLink('../README.md'), '/help/readme');
  assert.equal(
    helpLink('../server/http.mjs'),
    'https://github.com/openchronology/timeline-app/blob/main/server/http.mjs',
  );
  assert.equal(helpLink('https://example.com/a.md'), 'https://example.com/a.md');
});

test('every doc renders, belongs to a section, and links only to what exists', async () => {
  const pages = await helpPages(new URL('..', import.meta.url).pathname);
  assert(pages.has('readme') && pages.size > 20);
  const listed = new Set(HELP_SECTIONS.flatMap((s) => s.pages));
  assert.deepEqual(
    [...pages.keys()].filter((slug) => !listed.has(slug)),
    [],
    'Docs no section of HELP_SECTIONS (server/help.mjs) lists',
  );
  const problems = [];
  for (const page of pages.values()) {
    assert(page.title && page.title !== page.slug, `${page.slug} has a # title`);
    const text = page.html
      .replace(/<pre>[\s\S]*?<\/pre>/g, '')
      .replace(/<code>[\s\S]*?<\/code>/g, '')
      .replace(/<[^>]+>/g, '');
    for (const [what, pattern] of [
      ['**', /\*\*/],
      ['](', /\]\(/],
      ['`', /`/],
      ['a table row', /^\s*\|/m],
      ['a list item', /^\s*[-*] /m],
      ['a heading', /^#+ /m],
    ])
      if (pattern.test(text)) problems.push(`${page.slug}: Markdown left over (${what})`);
    for (const [, href] of page.html.matchAll(/href="([^"]+)"/g)) {
      const address = href.replace(/&amp;/g, '&');
      const help = /^\/help\/([a-z0-9-]+)(?:#(.*))?$/.exec(address);
      const local = address.startsWith('#') ? [null, page.slug, address.slice(1)] : null;
      const [, slug, anchor] = help ?? local ?? [];
      if (slug) {
        const target = pages.get(slug);
        if (!target) problems.push(`${page.slug}: ${address} leads to no page`);
        else if (anchor && !target.headings.some((h) => h.id === decodeURIComponent(anchor)))
          problems.push(`${page.slug}: ${address} leads to no heading`);
      }
      const source =
        /^https:\/\/github\.com\/openchronology\/timeline-app\/blob\/main\/([^#]+)/.exec(address);
      if (source && !existsSync(new URL('../' + source[1], import.meta.url)))
        problems.push(`${page.slug}: ${address} names no file`);
    }
  }
  assert.deepEqual(problems, []);
});

test('search finds the sections that mention every word, headings first', async () => {
  const pages = await helpPages(new URL('..', import.meta.url).pathname);
  const [first] = searchHelp(pages, 'separating tags');
  assert.equal(`${first.slug}#${first.id}`, 'tags#separating-by-tags');
  assert(
    searchHelp(pages, 'retention').every((r) => /retention|retain|keep/i.test(r.title + r.snippet)),
  );
  assert.deepEqual(searchHelp(pages, '   '), []);
  assert.deepEqual(searchHelp(pages, 'zqxjvwk'), []);
});
