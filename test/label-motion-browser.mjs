import assert from 'node:assert/strict';
import { DEFAULT_PRESENTATION, parseTimestamp } from '../dist/core.mjs';

/** Shared checks for retained labels, bounded crossfades and accessible motion. */
export async function checkLabelMotion(page, restoreDocument) {
  const input = (id) => page.locator('#' + id);
  const frame = () => page.evaluate(() => new Promise(requestAnimationFrame));
  const imported = async (doc) => {
    await input('json-file').setInputFiles({
      name: 'motion.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await frame();
  };
  const go = async (left, right) => {
    await input('exact-left').fill(left);
    await input('exact-right').fill(right);
    await input('apply-exact-bounds').click();
    await frame();
  };
  const capture = async (selector, text, property) =>
    page.evaluate(
      ({ selector, text, property }) => {
        const node = document.querySelector(selector);
        window.__motionNode = node;
        // Resolve the previous layout before the next render.
        getComputedStyle(node).top;
        window.__motionResult = null;
        const observer = new MutationObserver(() => {
          const ready = property
            ? node.style[property] === text
            : node.querySelector('.event-time-current').textContent === text;
          if (!ready) return;
          observer.disconnect();
          const animations = node.getAnimations({ subtree: true });
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = 100;
          }
          window.__motionResult = {
            retained: node === document.querySelector(selector),
            top: parseFloat(getComputedStyle(node).top),
            animations: animations.length,
            currentOpacity: Number(
              getComputedStyle(node.querySelector('.event-time-current')).opacity,
            ),
            outgoingOpacity: node.querySelector('.event-time-outgoing')
              ? Number(getComputedStyle(node.querySelector('.event-time-outgoing')).opacity)
              : null,
          };
        });
        observer.observe(document.getElementById('markers'), {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
      },
      { selector, text, property },
    );
  const result = async () => {
    await page.waitForFunction(() => window.__motionResult !== null);
    return page.evaluate(() => window.__motionResult);
  };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Row motion UI',
    description: '',
    events: [0, 20, 40, 60, 80].map((time, i) => ({
      id: 'row-' + i,
      time: time + '/1',
      metadata: { title: 'Row ' + i },
    })),
  });
  await go('0', '100');
  const row = '.event-label[data-key="event:row-1"]';
  assert.equal(await page.locator(row).evaluate((node) => getComputedStyle(node).top), '85px');
  await capture(row, '128px', 'top');
  await go('5', '105');
  let state = await result();
  assert(state.retained);
  assert(state.animations > 0);
  assert(state.top > 85 && state.top < 128);
  await page.evaluate(() => {
    for (const animation of document.getElementById('markers').getAnimations({ subtree: true }))
      animation.finish();
  });

  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Time crossfade UI',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    events: [
      {
        id: 'early',
        time: parseTimestamp('2026-10-05T00:00:03.5Z').toString(),
        metadata: { title: 'Early' },
      },
      {
        id: 'later',
        time: parseTimestamp('2026-10-05T00:00:13{+2/3}Z').toString(),
        metadata: { title: 'Later' },
      },
    ],
  });
  const short = [
    parseTimestamp('2026-10-04T23:59:59Z').toString(),
    parseTimestamp('2026-10-05T00:00:19Z').toString(),
  ];
  const wide = [
    parseTimestamp('2026-10-04T23:59:13Z').toString(),
    parseTimestamp('2026-10-05T00:00:53Z').toString(),
  ];
  await go(...short);
  const later = '.event-label[data-key="event:later"]';
  assert.equal(await page.locator(later + ' .event-time-current').textContent(), '13.7s');
  await capture(later, '00m 13.7s');
  await go(...wide);
  state = await result();
  assert(state.retained);
  assert.equal(state.animations, 2);
  assert(state.currentOpacity > 0 && state.currentOpacity < 1);
  assert(state.outgoingOpacity > 0 && state.outgoingOpacity < 1);
  assert.equal(
    await page.locator(later + ' .event-time-outgoing').getAttribute('aria-hidden'),
    'true',
  );
  for (let i = 0; i < 6; i++) {
    await go(...(i % 2 ? wide : short));
    assert((await page.locator(later + ' small span').count()) <= 2);
    assert(
      (await page
        .locator(later)
        .evaluate((node) => node.getAnimations({ subtree: true }).length)) <= 2,
    );
  }
  await page.evaluate(() => {
    for (const animation of document.getElementById('markers').getAnimations({ subtree: true }))
      animation.finish();
  });
  await page.waitForFunction(() => document.querySelectorAll('.event-time-outgoing').length === 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await go(...short);
  assert.equal(await page.locator(later + ' .event-time-current').textContent(), '13.7s');
  assert.equal(await page.locator('.event-time-outgoing').count(), 0);
  assert.equal(
    await page.locator(later).evaluate((node) => node.getAnimations({ subtree: true }).length),
    0,
  );
  assert.equal(
    await page.locator(later).evaluate((node) => getComputedStyle(node).transitionDuration),
    '0s',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await imported(restoreDocument);
  assert.equal(await page.locator('.event-time-outgoing').count(), 0);
  await page.evaluate(() => {
    delete window.__motionNode;
    delete window.__motionResult;
  });
}
