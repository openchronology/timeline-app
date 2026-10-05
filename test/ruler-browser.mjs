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
    page
      .locator('.axis-tick')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          time: node.dataset.time,
          x: parseFloat(node.style.left),
          major: !!node.querySelector('.tick-label'),
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

  await input('presentation-button').click();
  await input('presentation-ruler').selectOption('steps');
  await input('presentation-steps').fill('["1", "60", "3600", "86400"]');
  await input('presentation-save').click();
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
