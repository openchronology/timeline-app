// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { Q, DEFAULT_PRESENTATION, parseTimestamp } from '../dist/core.mjs';

/** Shared served/file:// interactions for ruler anchoring, subdivisions and saved policies. */
export async function checkRuler(page, restoreDocument) {
  const input = (id) => page.locator('#' + id);
  const frame = () => page.evaluate(() => new Promise(requestAnimationFrame));
  const imported = async (document) => {
    await input('json-file').setInputFiles({
      name: 'ruler.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      document.title,
    );
    await frame();
  };
  const go = async (left, right) => {
    await input('left-bound').fill(left);
    await input('right-bound').fill(right);
    await input('apply-bounds').click();
    await frame();
  };
  const ticks = () =>
    page.locator('.axis-tick').evaluateAll((nodes) =>
      nodes.map((node) => ({
        time: node.dataset.time,
        x: parseFloat(node.style.left),
        major: !!node.querySelector('.tick-label'),
        guideOpacity: Number(node.querySelector('.tick-guide').style.opacity),
        notchOpacity: Number(node.querySelector('.tick-notch').style.opacity),
        labelOpacity: [...node.querySelectorAll('.tick-label')].reduce(
          (sum, label) => sum + Number(label.style.opacity),
          0,
        ),
      })),
    );
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Decimal ruler UI',
    description: '',
    events: [{ id: 'a', time: '0/1', metadata: { title: 'Origin' } }],
  });
  await go('-0.27', '1.73');
  const before = await ticks(),
    box = await input('timeline-stage').boundingBox();
  assert(before.some((tick) => tick.time === '0/1' && tick.major));
  assert(before.some((tick) => tick.time === '1/10' && !tick.major));
  assert(!before.some((tick) => tick.time === '-27/100'));
  await page.mouse.move(box.x + 300, box.y + 65);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 65, { steps: 5 });
  await page.mouse.up();
  await frame();
  const after = await ticks();
  const overlap = before.filter((tick) => after.some((next) => next.time === tick.time));
  assert(overlap.length > 2);
  for (const tick of overlap)
    assert(Math.abs(after.find((next) => next.time === tick.time).x - tick.x - 100) < 0.01);
  await go('0', '0.2');
  const closer = await ticks();
  assert(closer.some((tick) => tick.time === '1/10' && tick.major));
  assert(closer.some((tick) => tick.time === '1/100' && !tick.major));
  const width = await input('timeline-stage').evaluate((node) => node.clientWidth - 96);
  const breakpoint = Q.from(BigInt(width), 90n);
  await go('0', breakpoint.mul(Q.from(3n, 4n)).toString());
  const middle = (await ticks()).find((tick) => tick.time === '1/1');
  assert(Math.abs(middle.labelOpacity - 0.5) < 1e-9);
  await page.waitForTimeout(120);
  assert.equal(
    (await ticks()).find((tick) => tick.time === '1/1').labelOpacity,
    middle.labelOpacity,
  );
  const epsilon = Q.from(1n, 1000000n);
  await go('0', breakpoint.mul(Q.one.sub(epsilon)).toString());
  const fading = (await ticks()).find((tick) => tick.time === '1/1');
  await go('0', breakpoint.mul(Q.one.add(epsilon)).toString());
  const promoted = (await ticks()).find((tick) => tick.time === '1/1');
  for (const field of ['guideOpacity', 'notchOpacity', 'labelOpacity'])
    assert(Math.abs(fading[field] - promoted[field]) < 0.0001);

  await input('presentation-button').click();
  await input('presentation-ruler').selectOption('steps');
  await input('presentation-steps').fill('["1", "60", "3600", "86400"]');
  await input('presentation-save').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });
  await go('0', '86400');
  assert.equal((await ticks()).length, 25);
  assert((await ticks()).some((tick) => tick.time === '3600/1'));
  await input('presentation-button').click();
  assert.deepEqual(JSON.parse(await input('presentation-steps').inputValue()), [
    '1/1',
    '60/1',
    '3600/1',
    '86400/1',
  ]);
  await page.locator('[data-close="presentation-dialog"]').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });

  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Civil ruler UI',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    events: [],
  });
  await go('2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
  const civil = await ticks();
  const monday = (tick) =>
    Q.parse(tick.time).div(Q.from(86400n)).sub(Q.from(4n)).div(Q.from(7n)).denominator === 1n;
  assert.equal(civil.filter(monday).length, 53);
  assert(civil.length <= 512);
  await go('2024-02-28T00:00:00Z', '2024-03-02T00:00:00Z');
  assert(
    (await ticks()).some((tick) => tick.time === parseTimestamp('2024-02-29T00:00:00Z').toString()),
  );
  await imported(restoreDocument);
}
