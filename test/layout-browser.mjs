// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';

export async function checkResponsiveTimeline(page) {
  const original = page.viewportSize();
  const bounds = () =>
    page.evaluate(() => [
      document.getElementById('exact-left').value,
      document.getElementById('exact-right').value,
    ]);
  // This must render without wheel/pointer input, including after a full refresh.
  await page.waitForFunction(
    () =>
      document.getElementById('left-bound').value &&
      document.querySelector('#markers .event-marker'),
  );
  const before = await bounds();
  try {
    for (const viewport of [
      { width: 930, height: 960 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      original,
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const stage = document.getElementById('timeline-stage');
        const axis = document.getElementById('axis');
        return (
          stage.clientWidth > 96 && Math.abs(parseFloat(axis.style.width) - stage.clientWidth) < 1
        );
      });
      const geometry = await page.evaluate(() => {
        const stage = document.getElementById('timeline-stage');
        const rect = stage.getBoundingClientRect();
        const baseline = document.querySelector('.axis-baseline').getBoundingClientRect();
        return {
          width: rect.width,
          left: rect.left,
          right: rect.right,
          baselineWidth: baseline.width,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          inspector: getComputedStyle(document.getElementById('inspector')).display,
        };
      });
      assert(
        Math.abs(geometry.baselineWidth - (geometry.width - 96)) < 2,
        'Ruler must fill the resized stage',
      );
      assert(
        geometry.documentWidth <= geometry.viewportWidth + 1,
        'Narrow layouts must not overflow horizontally',
      );
      if (viewport.width <= 960) {
        assert(
          geometry.width >= viewport.width - 62,
          'Unused inspector space must not squeeze the timeline',
        );
        assert.equal(geometry.inspector, 'none');
      }
      assert.deepEqual(await bounds(), before, 'Resizing preserves the exact time window');
    }
  } finally {
    await page.setViewportSize(original);
  }
}
