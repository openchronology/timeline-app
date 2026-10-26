// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Relationship arrows (#326): arrowheads on arcs, as either end's arrows say.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { RELATIONSHIP_ARROWS } from '../dist/core.mjs';
/**
 * Relationship arrows (#326): with the plugin enabled, an arc draws the arrowheads its two
 * ends' arrows say (their union), colored and highlighted with the arc, and none at an end
 * beyond the view; disabled, arcs draw as before and the entries are kept. Moment details
 * list the entries, add one for a related entity, and outline one whose relationship is gone.
 */
export async function checkRelationshipArrows(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'arrows.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const exported = async () => {
    const pending = page.waitForEvent('download');
    await page.locator('#export-button').evaluate((b) => b.click());
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const bounds = async (left, right) => {
    await page.locator('#left-bound').fill(left);
    await page.locator('#right-bound').fill(right);
    await page.locator('#apply-bounds').click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const open = async (name) => {
    await page.getByRole('button', { name, exact: true }).click({ force: true });
    await page.waitForFunction((n) => document.getElementById('event-title').value === n, name);
  };
  /** Each arc's arrowheads (how many triangles) and hover text, by relationship. */
  const arcs = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('#edge-arcs .edge-arc')].map((arc) => {
          const next = arc.nextElementSibling;
          const arrows = next?.classList.contains('edge-arrows') ? next : null;
          return [
            arc.dataset.edgeId,
            {
              heads: (arrows?.getAttribute('d') ?? '').split('M').length - 1,
              title: arc.querySelector('title').textContent,
            },
          ];
        }),
      ),
    );
  const heads = (id, count) =>
    page.waitForFunction(
      ([id, count]) => {
        const arc = document.querySelector(`.edge-arc[data-edge-id="${id}"]`);
        const next = arc?.nextElementSibling;
        const d = next?.classList.contains('edge-arrows') ? next.getAttribute('d') : '';
        return arc && d.split('M').length - 1 === count;
      },
      [id, count],
    );
  const to = (kind, id, arrow) => ({ target: { [kind]: id }, arrow });
  const doc = (enabled) => ({
    format: 'openchronology',
    version: 1,
    title: `Arrows ${enabled ? 'on' : 'off'}`,
    description: '',
    plugins: [{ manifest: RELATIONSHIP_ARROWS, enabled }],
    events: [
      {
        id: 'a',
        time: '10/1',
        metadata: {
          title: 'Alpha',
          // To Bravo; both ways with Charlie, which it isn't related to; and an unreadable one.
          arrows: [to('moment', 'b', 'to'), to('moment', 'c', 'both'), { target: 7, arrow: 'x' }],
        },
      },
      { id: 'b', time: '50/1', metadata: { title: 'Bravo', arrows: [to('moment', 'a', 'to')] } },
      {
        id: 'c',
        time: '90/1',
        metadata: { title: 'Charlie', arrows: [to('moment', 'b', 'from')] },
      },
    ],
    durations: [
      {
        id: 'd',
        start: '130/1',
        end: '150/1',
        metadata: { title: 'Delta', arrows: [to('moment', 'a', 'to')] },
      },
    ],
    relationships: [
      { a: { moment: 'a' }, b: { moment: 'b' } },
      { a: { moment: 'b' }, b: { moment: 'c' } },
      { a: { duration: 'd' }, b: { moment: 'a' } },
    ],
  });
  try {
    // Disabled: arcs as before, with no arrowheads and undirected names.
    await load(doc(false));
    await bounds('0', '160');
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 3);
    assert.deepEqual(await arcs(), {
      'd:d~m:a': { heads: 0, title: 'Delta ↔ Alpha' },
      'm:a~m:b': { heads: 0, title: 'Alpha ↔ Bravo' },
      'm:b~m:c': { heads: 0, title: 'Bravo ↔ Charlie' },
    });
    assert.equal(await page.locator('.edge-arrows').count(), 0);

    // Enabled: Alpha says "to" Bravo and Bravo "to" Alpha, so their arc has both ends (the
    // union); Charlie's "from" Bravo is a head at Charlie; Delta's "to" Alpha one at Alpha.
    await load(doc(true));
    await bounds('0', '160');
    await page.waitForFunction(() => document.querySelectorAll('.edge-arrows').length === 3);
    assert.deepEqual(await arcs(), {
      'd:d~m:a': { heads: 1, title: 'Delta → Alpha' },
      'm:a~m:b': { heads: 2, title: 'Alpha ↔ Bravo' },
      'm:b~m:c': { heads: 1, title: 'Bravo → Charlie' },
    });
    // Colored like its arc, and highlighted with it on hover.
    const look = () =>
      page.evaluate(() => {
        const arc = document.querySelector('.edge-arc[data-edge-id="m:b~m:c"]');
        const arrows = arc.nextElementSibling;
        return {
          stroke: getComputedStyle(arc).stroke,
          fill: getComputedStyle(arrows).fill,
          arcOpacity: getComputedStyle(arc).opacity,
          opacity: getComputedStyle(arrows).opacity,
        };
      });
    const rest = await look();
    assert.equal(rest.fill, rest.stroke);
    assert.equal(rest.opacity, rest.arcOpacity);
    const peak = await page.evaluate(() => {
      const arc = document.querySelector('.edge-arc[data-edge-id="m:b~m:c"]');
      const point = arc.getPointAtLength(arc.getTotalLength() / 2);
      const screen = point.matrixTransform(arc.getScreenCTM());
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.move(peak.x, peak.y);
    await page.waitForFunction(() =>
      document.querySelector('.edge-arc[data-edge-id="m:b~m:c"]').matches(':hover'),
    );
    const hovered = await look();
    assert.notEqual(hovered.stroke, rest.stroke);
    assert.equal(hovered.fill, hovered.stroke);
    assert.equal(hovered.opacity, '1');
    await page.mouse.move(5, 5);

    // Moment details list the entries. Charlie's arrow, changed to none: no head on that arc.
    const fields = page.locator('#plugin-event-fields');
    await open('Charlie');
    const row = (target) => fields.locator(`.relationship-arrow[data-target="${target}"]`);
    assert.equal(await row('m:b').locator('select').inputValue(), 'from');
    await row('m:b').locator('select').selectOption('none');
    await closeMomentDetails(page);
    await heads('m:b~m:c', 0);

    // Bravo adds an arrow for Charlie, one of its relationships: "to" it, by default.
    await open('Bravo');
    const add = fields.getByLabel('Add an arrow to a relationship');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#plugin-event-fields select[data-plugin-key] option')]
        .map((o) => o.value)
        .includes('m:c'),
    );
    assert.deepEqual(
      await add.locator('option').evaluateAll((options) => options.map((o) => o.value)),
      ['', 'm:c'],
      'only relationships without an arrow are offered',
    );
    await add.selectOption('m:c');
    await row('m:c').waitFor();
    assert.equal(await row('m:c').locator('select').inputValue(), 'to');
    await closeMomentDetails(page);
    await heads('m:b~m:c', 1);
    const bravo = (await exported()).events.find((e) => e.id === 'b').metadata.arrows;
    assert.deepEqual(bravo, [to('moment', 'a', 'to'), to('moment', 'c', 'to')]);

    // Alpha's arrow for Charlie has no relationship: outlined, said so, and not drawn; its
    // unreadable entry says that. Both are kept until removed.
    await open('Alpha');
    await fields.locator('.relationship-arrow.dangling[data-target="m:c"]').waitFor();
    assert.match(await row('m:c').textContent(), /No relationship with this entity/);
    assert.notEqual(
      await row('m:c').evaluate((li) => getComputedStyle(li).borderColor),
      await row('m:b').evaluate((li) => getComputedStyle(li).borderColor),
    );
    assert.equal(await row('m:b').locator('.relationship-arrow-theirs').count(), 1);
    assert.match(
      await fields.locator('.relationship-arrow.unreadable').textContent(),
      /Unreadable/,
    );
    await row('m:c').getByRole('button', { name: 'Remove the arrow with Charlie' }).click();
    await closeMomentDetails(page);
    assert.deepEqual((await exported()).events.find((e) => e.id === 'a').metadata.arrows, [
      to('moment', 'b', 'to'),
      { target: 7, arrow: 'x' },
    ]);

    // An end beyond the view draws no head: Alpha is off to the left here.
    await bounds('40', '160');
    await heads('d:d~m:a', 0);
    await heads('m:a~m:b', 1);

    // Disabling the plugin keeps the entries but draws no heads.
    await load(doc(false));
    await bounds('0', '160');
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 3);
    assert.equal(await page.locator('.edge-arrows').count(), 0);
    const saved = await exported();
    assert.deepEqual(saved.events[0].metadata.arrows, doc(false).events[0].metadata.arrows);
    assert.deepEqual(saved.durations[0].metadata.arrows, [to('moment', 'a', 'to')]);
    console.log(
      'PASS relationship arrows: heads only with the plugin enabled, the union of both ends, colored and highlighted with their arc, none beyond the view, entries edited and added in details, a gone relationship outlined.',
    );
  } finally {
    await page.mouse.move(5, 5);
    await load(restore);
  }
}
