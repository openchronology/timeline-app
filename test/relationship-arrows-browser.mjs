// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Relationship arrows (#326): arrowheads on arcs where they end at an event with Arrow here on.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { RELATIONSHIP_ARROWS } from '../dist/core.mjs';
/**
 * Relationship arrows (#326): with the plugin enabled, an arc draws an arrowhead at each end
 * whose moment or duration has Arrow here on, colored like the arc and highlighted with it,
 * and none at an end beyond the view; disabled, arcs draw as before and the toggles are kept.
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
  const doc = (enabled) => ({
    format: 'openchronology',
    version: 1,
    title: `Arrows ${enabled ? 'on' : 'off'}`,
    description: '',
    plugins: [{ manifest: RELATIONSHIP_ARROWS, enabled }],
    events: [
      { id: 'a', time: '10/1', metadata: { title: 'Alpha' } },
      { id: 'b', time: '50/1', metadata: { title: 'Bravo', arrowHere: true } },
      { id: 'c', time: '90/1', metadata: { title: 'Charlie', arrowHere: 'yes' } },
    ],
    durations: [
      { id: 'd', start: '130/1', end: '150/1', metadata: { title: 'Delta', arrowHere: true } },
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

    // Enabled: a head where each arc meets Bravo or Delta. Charlie's odd value reads as off.
    await load(doc(true));
    await bounds('0', '160');
    await page.waitForFunction(() => document.querySelectorAll('.edge-arrows').length === 3);
    assert.deepEqual(await arcs(), {
      'd:d~m:a': { heads: 1, title: 'Alpha → Delta' },
      'm:a~m:b': { heads: 1, title: 'Alpha → Bravo' },
      'm:b~m:c': { heads: 1, title: 'Charlie → Bravo' },
    });
    // Colored like its arc, and highlighted with it on hover.
    const look = () =>
      page.evaluate(() => {
        const arc = document.querySelector('.edge-arc[data-edge-id="m:a~m:b"]');
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
      const arc = document.querySelector('.edge-arc[data-edge-id="m:a~m:b"]');
      const point = arc.getPointAtLength(arc.getTotalLength() / 2);
      const screen = point.matrixTransform(arc.getScreenCTM());
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.move(peak.x, peak.y);
    await page.waitForFunction(() =>
      document.querySelector('.edge-arc[data-edge-id="m:a~m:b"]').matches(':hover'),
    );
    const hovered = await look();
    assert.notEqual(hovered.stroke, rest.stroke);
    assert.equal(hovered.fill, hovered.stroke);
    assert.equal(hovered.opacity, '1');
    await page.mouse.move(5, 5);

    // Arrow here on Charlie: the arc between two arrows' ends has a head at each.
    await page.getByRole('button', { name: 'Charlie', exact: true }).click({ force: true });
    await page.waitForFunction(() => document.getElementById('event-title').value === 'Charlie');
    const toggle = page.locator('#plugin-event-fields input[data-plugin-key="arrowHere"]');
    assert.equal(await toggle.isChecked(), false);
    await toggle.check();
    await closeMomentDetails(page);
    await page.waitForFunction(
      () =>
        document
          .querySelector('.edge-arc[data-edge-id="m:b~m:c"]')
          .nextElementSibling.getAttribute('d')
          .split('M').length === 3,
    );
    assert.deepEqual((await arcs())['m:b~m:c'], { heads: 2, title: 'Bravo ↔ Charlie' });
    // Saved as true; off removes the key.
    const charlie = (saved) => saved.events.find((e) => e.id === 'c').metadata;
    assert.equal(charlie(await exported()).arrowHere, true);
    await page.getByRole('button', { name: 'Charlie', exact: true }).click({ force: true });
    await page.waitForFunction(() => document.getElementById('event-title').value === 'Charlie');
    await toggle.uncheck();
    await closeMomentDetails(page);
    assert.equal('arrowHere' in charlie(await exported()), false);
    await page.waitForFunction(() => document.querySelectorAll('.edge-arrows').length === 3);

    // An end beyond the view draws no head: Delta is off to the right here.
    await bounds('0', '100');
    await page.waitForFunction(() => {
      const arc = document.querySelector('.edge-arc[data-edge-id="d:d~m:a"]');
      return arc && !arc.nextElementSibling?.classList.contains('edge-arrows');
    });
    assert.equal((await arcs())['m:a~m:b'].heads, 1);

    // Disabling the plugin keeps the toggles but draws no heads.
    await load(doc(false));
    await bounds('0', '160');
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 3);
    assert.equal(await page.locator('.edge-arrows').count(), 0);
    const saved = await exported();
    assert.equal(saved.events.find((e) => e.id === 'b').metadata.arrowHere, true);
    assert.equal(saved.durations[0].metadata.arrowHere, true);
    console.log(
      'PASS relationship arrows: arrowheads only with the plugin enabled, at the ends with Arrow here on, colored and highlighted with their arc, none beyond the view, toggled in details.',
    );
  } finally {
    await page.mouse.move(5, 5);
    await load(restore);
  }
}
