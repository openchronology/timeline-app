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
      await page.waitForFunction(
        (phone) => {
          const stage = document.getElementById('timeline-stage');
          const axis = document.getElementById('axis');
          return (
            stage.clientWidth > 96 &&
            Number(stage.dataset.uiScale) === (phone ? 0.75 : 1) &&
            Math.abs(
              parseFloat(axis.style.width) * Number(stage.dataset.uiScale) - stage.clientWidth,
            ) < 1
          );
        },
        viewport.width <= 650 || viewport.height <= 500,
      );
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
          scale: Number(stage.dataset.uiScale),
          height: rect.height,
        };
      });
      // Narrow stages keep 20 px beside the ruler instead of 48.
      const inset = geometry.width < 600 ? 20 : 48;
      assert(
        Math.abs(geometry.baselineWidth - (geometry.width - 2 * inset)) < 2,
        'Ruler must fill the resized stage',
      );
      // Phones, either way up, open contents at a smaller scale so more fits legibly; turning
      // the screen moves an unscaled timeline to the new base.
      const phone = viewport.width <= 650 || viewport.height <= 500;
      assert.equal(geometry.scale, phone ? 0.75 : 1);
      if (viewport.width <= 650)
        assert(geometry.width >= viewport.width - 1, 'Upright phones give the timeline full width');
      if (viewport.height <= 500)
        assert(
          geometry.height >= viewport.height - 60,
          'Sideways phones give the timeline the screen height',
        );
      assert(
        geometry.documentWidth <= geometry.viewportWidth + 1,
        'Narrow layouts must not overflow horizontally',
      );
      {
        assert(
          geometry.width >= viewport.width - 100,
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
