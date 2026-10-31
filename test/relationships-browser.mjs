// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Relationships in the editor: linked, drawn as arcs, and separating.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/** Relationships are linked from an entity's details, drawn as arcs and used to separate. */
export async function checkRelationships(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'links.ochx',
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
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Relationship regression',
    description: '',
    events: [
      { id: 'a', time: '10/1', metadata: { title: 'Alpha' } },
      { id: 'b', time: '50/1', metadata: { title: 'Bravo' } },
      { id: 'c', time: '90/1', metadata: { title: 'Charlie' } },
      { id: 'd', time: '130/1', metadata: { title: 'Delta' } },
    ],
    relationships: [{ a: { moment: 'b' }, b: { moment: 'c' } }],
  };
  const related = page.locator('#event-related');
  try {
    await imported(doc);
    await page.locator('#fit-button').click();
    // One arc for the existing link.
    await page.locator('.edge-arc').first().waitFor();
    assert.equal(await page.locator('.edge-arc').count(), 1);
    // Beneath it, its halo stroke (#232), along the same path and shown only over backgrounds.
    assert.deepEqual(
      await page.evaluate(() => {
        const arc = document.querySelector('.edge-arc'),
          halo = document.querySelector('.edge-arc-halo');
        return [
          document.querySelectorAll('.edge-arc-halo').length,
          halo.nextElementSibling === arc,
          halo.getAttribute('d') === arc.getAttribute('d'),
          getComputedStyle(halo).display,
        ];
      }),
      [1, true, true, 'none'],
    );
    // Link Alpha to Bravo by searching from Alpha's details.
    await page.getByRole('button', { name: 'Alpha', exact: true }).click({ force: true });
    await related.getByText('No relationships yet.').waitFor();
    await related.locator('summary').click();
    await related.getByRole('searchbox').fill('bravo');
    await related.locator('.related-results button', { hasText: 'Bravo' }).click();
    await related.locator('.related-entity', { hasText: 'Bravo' }).waitFor();
    // Charlie is connected through Bravo.
    await related.getByText('1 more through other relationships.').waitFor();
    assert.deepEqual((await exported()).relationships, [
      { a: { moment: 'a' }, b: { moment: 'b' } },
      { a: { moment: 'b' }, b: { moment: 'c' } },
    ]);
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 2);
    // Following a related entry opens it; its list shows the link back.
    await related.locator('.related-entity', { hasText: 'Bravo' }).click();
    await page.waitForFunction(() => document.getElementById('event-title').value === 'Bravo');
    await related.locator('.related-entity', { hasText: 'Alpha' }).waitFor();
    // Unlink, then undo restores the link.
    await related.getByRole('button', { name: 'Remove relationship with Alpha' }).click();
    await closeMomentDetails(page);
    assert.equal((await exported()).relationships.length, 1);
    await page.locator('#undo-button').click();
    assert.equal((await exported()).relationships.length, 2);
    // Separate everything connected to Alpha into the upper track.
    await page.getByRole('button', { name: 'Alpha', exact: true }).click({ force: true });
    await related.getByRole('button', { name: 'Separate all connected' }).click();
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    // The bar describes the separation made, not tags (#342).
    const bar = async () =>
      [
        await page.locator('#separation-heading').textContent(),
        await page.locator('#separation-tags').textContent(),
        (await page.locator('#separation-note').textContent()).trim(),
      ].join(' | ');
    assert.equal(
      await bar(),
      'Separated: connected to | Alpha | Read-only. Shown above: Alpha and everything connected to it through relationships; everything else stays below.',
    );
    // Separation re-keys markers into tracks, which ease into place; wait for the settled
    // layout with the connected moments above Delta.
    await page.waitForFunction(() => {
      const y = (name) => {
        const all = document.querySelectorAll(`.event-marker[aria-label="${name}"]`);
        return all.length === 1 ? all[0].getBoundingClientRect().y : NaN;
      };
      const delta = y('Delta');
      return ['Alpha', 'Bravo', 'Charlie'].every((name) => y(name) < delta);
    });
    // Separated tracks still draw arcs (#415): both links are within the upper track, over its
    // axis.
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 2);
    assert.equal(await page.locator('.edge-arc-between').count(), 0);
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 2);
    // Separate related says so; separating by tags afterwards returns to the tag wording.
    await page.getByRole('button', { name: 'Alpha', exact: true }).click({ force: true });
    await related.getByRole('button', { name: 'Separate related' }).click();
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(
      await bar(),
      'Separated: related to | Alpha | Read-only. Shown above: Alpha and the events related to it; everything else stays below.',
    );
    // Alpha and Bravo are above, Charlie below: Bravo's link to Charlie crosses between the
    // tracks, from Bravo's marker down to Charlie's, and says what it connects.
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.edge-arc').length === 2 &&
        document.querySelectorAll('.edge-arc-between').length === 1,
    );
    const crossing = await page.evaluate(() => {
      const arc = document.querySelector('.edge-arc-between'),
        svg = document.getElementById('edge-arcs'),
        box = svg.getBoundingClientRect(),
        scale = box.width / parseFloat(svg.style.width);
      const length = arc.getTotalLength(),
        start = arc.getPointAtLength(0),
        end = arc.getPointAtLength(length);
      const marker = (name) => {
        const r = document
          .querySelector(`.event-marker[aria-label="${name}"]`)
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      };
      const at = (p) => ({ x: box.x + p.x * scale, y: box.y + p.y * scale });
      return {
        title: arc.querySelector('title').textContent,
        ends: [at(start), at(end)],
        bravo: marker('Bravo'),
        charlie: marker('Charlie'),
      };
    });
    assert.equal(crossing.title, 'Bravo ↔ Charlie');
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 12;
    assert(
      near(crossing.ends[0], crossing.bravo) && near(crossing.ends[1], crossing.charlie),
      JSON.stringify(crossing),
    );
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    await page.locator('#separate-button').click();
    await page.locator('#separate-extra').fill('anything');
    await page.locator('#separate-submit').click();
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(
      await bar(),
      'Separated by tags | anything | Read-only. Events with any of these tags are shown above; everything else stays below.',
    );
    // Nothing carries the tag, so both arcs are within the lower track.
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.edge-arc').length === 2 &&
        !document.querySelector('.edge-arc-between'),
    );
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 2);

    // An arc whose endpoints are far off screen keeps its place as the view pans: only the part
    // over the stage is drawn, so no coordinate is millions of pixels away (which browsers draw
    // as coarse chords whose height jumps between frames).
    await imported({
      format: 'openchronology',
      version: 1,
      title: 'Relationships far off screen',
      description: '',
      events: [
        { id: 'past', time: '-10000000/1', metadata: { title: 'Past' } },
        { id: 'here', time: '1000/1', metadata: { title: 'Here' } },
        { id: 'future', time: '10000000/1', metadata: { title: 'Future' } },
      ],
      relationships: [{ a: { moment: 'past' }, b: { moment: 'future' } }],
    });
    await page.locator('#left-bound').fill('990');
    await page.locator('#right-bound').fill('1010');
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(() => document.querySelector('.edge-arc')?.getAttribute('d'));
    const stage = await page.locator('#timeline-stage').boundingBox();
    /** The arc's numbers, and its height where it crosses the middle of the stage. */
    const sample = () =>
      page.evaluate(() => {
        const svg = document.getElementById('edge-arcs'),
          arc = svg.querySelector('.edge-arc');
        const n = arc
          .getAttribute('d')
          .match(/-?[\d.e+]+/g)
          .map(Number);
        const [x0, y0, cx, cy, x1, y1] = n;
        // In the arcs' own coordinates: the layer is the stage's width at the current size.
        const middle = parseFloat(svg.style.width) / 2;
        const t = (middle - x0) / (x1 - x0);
        return {
          numbers: n,
          control: cx === (x0 + x1) / 2,
          y: (1 - t) ** 2 * y0 + 2 * t * (1 - t) * cy + t ** 2 * y1,
        };
      });
    const heights = [];
    for (let step = 0; step < 8; step++) {
      await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 40);
      await page.mouse.down();
      await page.mouse.move(stage.x + stage.width / 2 + 25, stage.y + stage.height - 40, {
        steps: 3,
      });
      await page.mouse.up();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const { numbers, control, y } = await sample();
      assert(
        numbers.every((v) => Math.abs(v) < 5000),
        `arc coordinates stay near the stage: ${numbers}`,
      );
      assert(control, 'the drawn part is the same parabola');
      heights.push(y);
    }
    // Midway between endpoints twenty million apart, the arc is at its peak, 150 px over the
    // axis, in every frame.
    for (const y of heights) assert(Math.abs(y - (192 - 150)) < 0.5, `arc height ${heights}`);
    console.log(
      'PASS relationships: linking by search, transitive count, arcs, navigation, unlink and undo, separation by connections with arcs within and between tracks, arcs far off screen.',
    );
  } finally {
    if (await page.locator('#separation-settings').isVisible())
      await page.locator('#separation-rejoin').click();
    await imported(restore);
  }
}
