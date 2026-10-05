import assert from 'node:assert/strict';
import { Q } from '../dist/core.mjs';

export async function checkWheelPrecision(page) {
  const result = await page.evaluate(async () => {
    const stage = document.getElementById('timeline-stage'),
      bounds = () => ({
        left: document.getElementById('left-bound').value,
        right: document.getElementById('right-bound').value,
      });
    stage.focus();
    await new Promise(requestAnimationFrame);
    const before = bounds(),
      box = stage.getBoundingClientRect();
    for (let i = 0; i < 300; i++)
      for (const deltaY of [-120, 120])
        stage.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY,
            clientX: box.left + 273.125,
            clientY: box.top + 75,
            bubbles: true,
            cancelable: true,
          }),
        );
    await new Promise(requestAnimationFrame);
    return { before, after: bounds(), width: stage.clientWidth - 96 };
  });
  const span = Q.parse(result.before.right).sub(Q.parse(result.before.left)),
    limit = span.div(Q.from(BigInt(result.width) * 100n));
  for (const edge of ['left', 'right']) {
    assert(result.after[edge].length < 64, `${edge} bound grew after 600 wheel gestures`);
    assert(Q.parse(result.after[edge]).sub(Q.parse(result.before[edge])).abs().compare(limit) < 0);
  }
}
