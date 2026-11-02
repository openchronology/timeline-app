// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The timeline's description renders its Markdown under the title (#398).
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/**
 * A description written in Markdown shows formatted, with safe links only and no HTML; an
 * editor clicks it to edit its source, which renders again when it loses focus; an empty one
 * shows its field to type in.
 */
export async function checkDescriptionMarkdown(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'description.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  const source =
    '**Explore the story.** Hover over *clusters*; see [the guide](https://example.com/guide).\n\n' +
    '- one <img src=x onerror="window.pwned=1">\n- [bad](javascript:alert(1))';
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Described',
    description: source,
    events: [{ id: 'a', time: '0/1', metadata: { title: 'A' } }],
  });
  const view = page.locator('#timeline-description-view');
  const area = page.locator('#timeline-description');
  await view.waitFor();
  assert.equal(await area.isHidden(), true);
  const shown = await view.evaluate((v) => ({
    strong: v.querySelector('strong')?.textContent,
    em: v.querySelector('em')?.textContent,
    links: [...v.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.rel]),
    items: [...v.querySelectorAll('li')].map((li) => li.textContent),
    images: v.querySelectorAll('img').length,
    text: v.textContent,
    color: getComputedStyle(v).color,
  }));
  assert.equal(shown.strong, 'Explore the story.');
  assert.equal(shown.em, 'clusters');
  assert.deepEqual(shown.links, [
    ['the guide', 'https://example.com/guide', 'noopener noreferrer'],
  ]);
  assert.deepEqual(shown.items, [
    'one <img src=x onerror="window.pwned=1">',
    '[bad](javascript:alert(1))',
  ]);
  assert.equal(shown.images, 0);
  assert(!shown.text.includes('**'), shown.text);
  assert.equal(await page.evaluate(() => window.pwned), undefined);

  // Tables render as tables, inside a wrapper that scrolls when the table is wide.
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Tabled',
    description: '| Feature | Meaning |\n| --- | :-: |\n| Ellipses | *Conditions* |\n\n---',
    events: [{ id: 'a', time: '0/1', metadata: { title: 'A' } }],
  });
  await view.locator('table').waitFor();
  assert.deepEqual(
    await view.evaluate((v) => ({
      cells: [...v.querySelectorAll('th, td')].map((c) => [c.tagName, c.textContent]),
      centered: getComputedStyle(v.querySelectorAll('td')[1]).textAlign,
      wrapped: v.querySelector('table').parentElement.className,
      rules: v.querySelectorAll('hr').length,
    })),
    {
      cells: [
        ['TH', 'Feature'],
        ['TH', 'Meaning'],
        ['TD', 'Ellipses'],
        ['TD', 'Conditions'],
      ],
      centered: 'center',
      wrapped: 'markdown-table',
      rules: 1,
    },
  );
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Described',
    description: source,
    events: [{ id: 'a', time: '0/1', metadata: { title: 'A' } }],
  });
  await view.waitFor();

  // Clicking it (not its link) edits the Markdown source; leaving renders it again.
  await view.click({ position: { x: 4, y: 4 } });
  await area.waitFor();
  assert.equal(await view.isHidden(), true);
  assert.equal(await area.inputValue(), source);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'timeline-description');
  await area.fill('A *new* description');
  await page.locator('#timeline-title').focus();
  await view.waitFor();
  assert.equal(await view.locator('em').textContent(), 'new');
  assert.equal(await area.isHidden(), true);

  // Emptied, its field stays out to type in.
  await view.click({ position: { x: 4, y: 4 } });
  await area.fill('');
  await page.locator('#timeline-title').focus();
  assert.equal(await area.isVisible(), true);
  assert.equal(await view.isHidden(), true);

  // A long description shows its first lines, with Read more for the rest and Show less to fold
  // it again (#424); the next timeline opens folded. A short one has neither.
  const more = page.locator('#timeline-description-more');
  const long = {
    format: 'openchronology',
    version: 1,
    title: 'Long described',
    description: Array.from(
      { length: 12 },
      (_, i) => `Paragraph ${i + 1} of a long description.`,
    ).join('\n\n'),
    events: [{ id: 'a', time: '0/1', metadata: { title: 'A' } }],
  };
  await load(long);
  await more.waitFor();
  assert.equal((await more.textContent()).trim(), 'Read more…');
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  const height = () => view.evaluate((v) => v.getBoundingClientRect().height);
  const folded = await height();
  assert(folded < 160, `folded description is ${folded}px tall`);
  await more.click();
  assert.equal((await more.textContent()).trim(), 'Show less');
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  assert((await height()) > folded * 2, 'Read more shows the whole description');
  await more.click();
  assert.equal(await height(), folded);
  await more.click();
  await load({ ...long, title: 'Long again' });
  assert.equal((await more.textContent()).trim(), 'Read more…');
  assert.equal(await height(), folded);
  await load({ ...long, title: 'Short', description: 'One line.' });
  assert.equal(await more.isHidden(), true);
  await load(restore);
  console.log(
    'PASS description markdown: rendered under the title with safe links, tables and no HTML, edited as source on click, long ones folded with Read more.',
  );
}
