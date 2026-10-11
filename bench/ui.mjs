// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// UI benchmarks: real interactions in the editor, timed from the input to the frame that
// shows their result, against the budgets in src/capacity.ts (docs/benchmarks.md#ui).
//
// Two checks, as issue #51 asks:
//   1. Within a platform's comfortable size (COMFORTABLE), every interaction meets its budget.
//   2. Wherever an interaction misses its budget, the "consider another platform" advice is
//      already showing; otherwise the run reports an advice gap.
//
// Usage: node bench/ui.mjs [--gate]
//   UI_PLATFORMS=browser,platform  UI_SIZES=1000,4000  UI_THROTTLES=1,4  UI_SAMPLES=5
//   UI_SCENARIOS=open-moment,search  UI_TOLERANCE=1.5 (CI gate only)
//   UI_KNOWN=navigation,new-duration: known misses (scenarios or groups), reported only
//   The platform runs need DATABASE_URL (or BENCH_DATABASE_URL) and a built Next.js server
//   (npm run build).
//   The desktop runs (UI_PLATFORMS=desktop) need tauri-driver and, on Linux, WebKitWebDriver
//   and a display (xvfb-run), plus the app built with npx tauri build --debug --no-bundle;
//   UI_DESKTOP_APP overrides its path.
// --gate exits non-zero on a budget missed within a comfortable size, or an advice gap.
// UI_DEBUG=1 prints the page's state when an interaction fails.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BUDGETS, COMFORTABLE, Q, Viewport } from '../dist/core.mjs';
import { generateTimeline } from './generate.mjs';
import { webdriverSession } from './ui/webdriver.mjs';

const env = process.env;
const list = (value, fallback) => (value || fallback).split(/[\s,]+/).filter(Boolean);
// The benchmark workflow provides BENCH_DATABASE_URL; CI's PostgreSQL job DATABASE_URL.
const DATABASE = env.DATABASE_URL ?? env.BENCH_DATABASE_URL;
const PLATFORMS = list(env.UI_PLATFORMS, DATABASE ? 'browser,platform' : 'browser');
const SIZES = list(env.UI_SIZES, '1000,4000,10000').map(Number);
const THROTTLES = list(env.UI_THROTTLES, '1,4').map(Number);
const SAMPLES = Number(env.UI_SAMPLES ?? 5);
const ONLY = env.UI_SCENARIOS ? new Set(list(env.UI_SCENARIOS)) : null;
const KNOWN = new Set(env.UI_KNOWN ? list(env.UI_KNOWN) : []);
const GATE = process.argv.includes('--gate');
// CI runners are slower and noisier than the machines the budgets describe.
const TOLERANCE = GATE ? Number(env.UI_TOLERANCE ?? 1.5) : 1;
const RESULTS = resolve(env.BENCH_RESULTS_DIR ?? 'bench/results');
const PROBE = await readFile(new URL('./ui/probe.js', import.meta.url), 'utf8');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Playwright (Chromium). Every input is real: mouse, keyboard and touch through CDP. */
function playwrightDriver(page, cdp) {
  return {
    engine: 'chromium',
    eval: (expression) => page.evaluate(expression),
    click: (selector, options = {}) => page.locator(selector).first().click(options),
    clickText: (container, name) =>
      page.locator(container).getByRole('button', { name, exact: true }).first().click(),
    clickAt: (x, y) => page.mouse.click(x, y),
    async drag(x1, y1, x2, y2, steps = 20) {
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++)
        await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
      await page.mouse.up();
    },
    async wheel(x, y, dy) {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, dy);
    },
    press: (key) => page.keyboard.press(key),
    type: (text) => page.keyboard.type(text),
    focus: (selector) => page.locator(selector).first().focus(),
    box: (selector) => page.locator(selector).first().boundingBox(),
    setFile: (selector, name, text) =>
      page
        .locator(selector)
        .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) }),
    // Polls with evaluate: waitForFunction evaluates strings with eval, which the
    // platform's content security policy (rightly) refuses.
    async wait(expression, timeout = 120000) {
      const until = Date.now() + timeout;
      while (!(await page.evaluate(expression))) {
        if (Date.now() > until) throw new Error(`Timed out waiting for ${expression}`);
        await delay(16);
      }
    },
    /** Two fingers moving apart (or together) along an axis. */
    async pinch(x, y, axis, from, to, steps = 12) {
      const points = (d) =>
        axis === 'x'
          ? [
              { x: x - d, y, id: 1 },
              { x: x + d, y, id: 2 },
            ]
          : [
              { x, y: y - d, id: 1 },
              { x, y: y + d, id: 2 },
            ];
      // Touch only for this gesture: with touch enabled, taps behave differently elsewhere.
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: points(from),
      });
      for (let i = 1; i <= steps; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: points(from + ((to - from) * i) / steps),
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    },
    throttle: (rate) => cdp.send('Emulation.setCPUThrottlingRate', { rate }),
  };
}

/** Times `action` from its first input to the frame where `check` (page JS) holds. */
async function timed(d, check, action, timeout = 60000) {
  await d.eval(`__ui.watch(() => (${check}), ${timeout})`);
  await action();
  for (;;) {
    const result = await d.eval('__ui.result()');
    if (result?.timeout) throw new Error(`Timed out waiting for ${check}`);
    if (result) return result.ms;
    await delay(10);
  }
}
/** Times from now (in the page) to the frame where `check` holds. */
async function since(d, check, start, timeout = 60000) {
  await d.eval(`__ui.since(() => (${check}), ${timeout})`);
  await start();
  for (;;) {
    const result = await d.eval('__ui.result()');
    if (result?.timeout) throw new Error(`Timed out waiting for ${check}`);
    if (result) return result.ms;
    await delay(10);
  }
}
/** The longest frame while `action` runs and the page settles after it. */
async function longestFrame(d, action, settle = 300) {
  await d.eval('__ui.startFrames()');
  await action();
  await delay(settle);
  const gaps = await d.eval('__ui.stopFrames()');
  return gaps.length ? Math.max(...gaps) : 0;
}
const BOUNDS = `document.getElementById('exact-left').value + ' ' + document.getElementById('exact-right').value`;
const changedFrom = (before) => `${BOUNDS} !== ${JSON.stringify(before)}`;
const visible = (selector) =>
  `(() => { const n = document.querySelector(${JSON.stringify(selector)}); return !!n && !n.hidden && n.getClientRects().length > 0; })()`;
const hidden = (selector) => `!${visible(selector)}`;
/** A dialog closing: its exit animation has started (the visible response) or it is shut. */
const closing = (selector) =>
  `(() => { const n = document.querySelector(${JSON.stringify(selector)}); return !n.open || 'dialogClosing' in n.dataset; })()`;
/**
 * `condition` holds and the view has finished loading for it: the loading note can show up to
 * ~100 ms after a change (the editor waits 70 ms before fetching), so wait until it has come
 * and gone, or 150 ms and three frames pass without it (a cached view). Call `resetLoaded`
 * before each measurement.
 */
const loaded = (condition) =>
  `(() => { const s = (window.__loaded ??= { seen: false, frames: 0, start: performance.now() }); if (!(${condition})) return false; const loading = ${visible('#loading-window')}; s.frames++; if (loading) s.seen = true; return !loading && (s.seen || (s.frames > 3 && performance.now() - s.start > 150)); })()`;
const resetLoaded = (d) => d.eval('delete window.__loaded');
const value = (selector) => `document.querySelector(${JSON.stringify(selector)}).value`;
const text = (selector) => `document.querySelector(${JSON.stringify(selector)}).textContent`;
/**
 * Shows the exact view [left, right] and waits until it is drawn and loaded: on the desktop
 * and the platform, the moments in a new view arrive after the view itself.
 */
async function show(d, left, right) {
  await d.eval(`(() => {
    document.getElementById('exact-left').value = ${JSON.stringify(left.toString())};
    document.getElementById('exact-right').value = ${JSON.stringify(right.toString())};
    document.getElementById('apply-exact-bounds').click();
  })()`);
  const there = `${value('#exact-left')} === ${JSON.stringify(left.toString())}`;
  await d.wait(there);
  await resetLoaded(d);
  await d.wait(loaded('true'));
  // An animation still running from an earlier step (Fit all) may move the view on.
  await delay(50);
  if (!(await d.eval(there))) return show(d, left, right);
}
async function closeDialogs(d) {
  for (let i = 0; i < 4; i++) {
    const open = await d.eval(`[...document.querySelectorAll('dialog[open]')].map((x) => x.id)`);
    if (!open.length) return;
    await d.press('Escape');
    await delay(150);
  }
}

/**
 * Targets in a timeline: a moment far from its neighbours (shown alone when zoomed in), one
 * with relationships, and the fitted view.
 */
function targets(document) {
  const sorted = document.events
    .map((e) => ({ id: e.id, title: e.metadata.title, time: Q.parse(e.time) }))
    .sort((a, b) => a.time.compare(b.time));
  const gap = Q.from(400000n);
  const alone =
    sorted.find(
      (e, i) =>
        i > 0 &&
        i < sorted.length - 1 &&
        e.time.sub(sorted[i - 1].time).compare(gap) > 0 &&
        sorted[i + 1].time.sub(e.time).compare(gap) > 0,
    ) ?? sorted[Math.floor(sorted.length / 2)];
  const linked = new Set(
    document.relationships
      .flatMap((r) => [r.a, r.b])
      .map((ref) => ref.moment)
      .filter(Boolean),
  );
  const related = sorted.find((e) => linked.has(e.id)) ?? alone;
  return {
    fitted: Viewport.fit(sorted[0].time, sorted.at(-1).time),
    alone,
    related,
    near: (e) => [e.time.sub(Q.from(100000n)), e.time.add(Q.from(100000n))],
  };
}

/**
 * Interactions by group. `budget` names a BUDGETS entry; `run` returns one sample (ms).
 * `platforms` limits a scenario to some of browser, platform and desktop; `engines` to
 * Chromium where it needs touch through CDP.
 */
const SINGLE = '.event-marker:not(.group):not(.duration-point)';
const SCENARIOS = [
  {
    name: 'drag-pan',
    group: 'navigation',
    budget: 'frame',
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      const stage = await d.box('#timeline-stage');
      const y = stage.y + stage.height * 0.15;
      return longestFrame(d, () =>
        d.drag(stage.x + stage.width * 0.7, y, stage.x + stage.width * 0.3, y),
      );
    },
  },
  {
    name: 'wheel-zoom',
    group: 'navigation',
    budget: 'view',
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      const stage = await d.box('#timeline-stage');
      const before = await d.eval(BOUNDS);
      return timed(d, changedFrom(before), () =>
        d.wheel(stage.x + stage.width / 2, stage.y + stage.height * 0.15, -240),
      );
    },
  },
  {
    name: 'wheel-zoom-frames',
    group: 'navigation',
    budget: 'frame',
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      const stage = await d.box('#timeline-stage');
      return longestFrame(d, async () => {
        for (let i = 0; i < 6; i++)
          await d.wheel(
            stage.x + stage.width / 2,
            stage.y + stage.height * 0.15,
            i < 3 ? -120 : 120,
          );
      });
    },
  },
  {
    name: 'keyboard-pan',
    group: 'navigation',
    budget: 'view',
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      await d.focus('#timeline-stage');
      const before = await d.eval(BOUNDS);
      return timed(d, changedFrom(before), () => d.press('ArrowRight'));
    },
  },
  {
    name: 'keyboard-zoom',
    group: 'navigation',
    budget: 'view',
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      await d.focus('#timeline-stage');
      const before = await d.eval(BOUNDS);
      return timed(d, changedFrom(before), () => d.press('+'));
    },
  },
  {
    name: 'fit-all',
    group: 'navigation',
    budget: 'view',
    async run(d, t) {
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      const before = await d.eval(BOUNDS);
      const ms = await timed(d, changedFrom(before), () => d.click('#fit-button'));
      // Fit all animates; let it land before the next step sets its own view.
      await d.wait(`${value('#exact-left')} === ${JSON.stringify(t.fitted.left.toString())}`);
      return ms;
    },
  },
  {
    name: 'pinch-zoom',
    group: 'navigation',
    budget: 'frame',
    engines: ['chromium'],
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      const stage = await d.box('#timeline-stage');
      return longestFrame(d, () =>
        d.pinch(stage.x + stage.width / 2, stage.y + stage.height / 2, 'x', 60, 180),
      );
    },
  },
  {
    name: 'vertical-pinch',
    group: 'navigation',
    budget: 'frame',
    engines: ['chromium'],
    async run(d, t) {
      await show(d, t.fitted.left, t.fitted.right);
      const stage = await d.box('#timeline-stage');
      const frame = await longestFrame(d, () =>
        d.pinch(stage.x + stage.width / 2, stage.y + stage.height / 2, 'y', 60, 110),
      );
      // Fit all also restores the content scale for the scenarios after this one.
      await d.click('#fit-button');
      return frame;
    },
  },
  {
    name: 'open-moment',
    group: 'editing',
    budget: 'response',
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      const marker = `${SINGLE}[aria-label=${JSON.stringify(t.alone.title)}]`;
      const ms = await timed(
        d,
        `${visible('#inspector')} && ${value('#event-title')} === ${JSON.stringify(t.alone.title)}`,
        () => d.click(marker, { force: true }),
      );
      await closeDialogs(d);
      return ms;
    },
  },
  {
    name: 'typing',
    group: 'editing',
    budget: 'response',
    samples: 1,
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      await d.click(`${SINGLE}[aria-label=${JSON.stringify(t.alone.title)}]`, { force: true });
      await d.wait(visible('#inspector'));
      await d.focus('#event-title');
      await d.press('End');
      const times = [];
      let typed = t.alone.title;
      for (const key of ' typed') {
        typed += key;
        times.push(
          await timed(d, `${value('#event-title')} === ${JSON.stringify(typed)}`, () =>
            d.press(key === ' ' ? 'Space' : key),
          ),
        );
      }
      await d.click('#event-cancel');
      await d.wait(hidden('#inspector'));
      return times;
    },
  },
  {
    name: 'save-moment',
    group: 'editing',
    budget: 'response',
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      await d.click(`${SINGLE}[aria-label=${JSON.stringify(t.alone.title)}]`, { force: true });
      await d.wait(visible('#inspector'));
      const ms = await timed(d, closing('#inspector'), () => d.click('#event-save'));
      await d.wait(hidden('#inspector'));
      return ms;
    },
  },
  {
    name: 'cancel-moment',
    group: 'editing',
    budget: 'response',
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      await d.click(`${SINGLE}[aria-label=${JSON.stringify(t.alone.title)}]`, { force: true });
      await d.wait(visible('#inspector'));
      await d.focus('#event-title');
      await d.type('!');
      const ms = await timed(d, closing('#inspector'), () => d.click('#event-cancel'));
      await d.wait(hidden('#inspector'));
      return ms;
    },
  },
  {
    name: 'undo-redo',
    group: 'editing',
    budget: 'view',
    samples: 1,
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      const marker = (title) =>
        `!!document.querySelector(${JSON.stringify(`${SINGLE}[aria-label=${JSON.stringify(title)}]`)})`;
      await d.click(`${SINGLE}[aria-label=${JSON.stringify(t.alone.title)}]`, { force: true });
      await d.wait(visible('#inspector'));
      await d.focus('#event-title');
      await d.type(' renamed');
      await d.click('#event-save');
      await d.wait(marker(t.alone.title + ' renamed'));
      const undo = await timed(d, marker(t.alone.title), () => d.click('#undo-button'));
      const redo = await timed(d, marker(t.alone.title + ' renamed'), () =>
        d.click('#redo-button'),
      );
      await d.click('#undo-button');
      await d.wait(marker(t.alone.title));
      return [undo, redo];
    },
  },
  {
    name: 'delete-moment',
    group: 'editing',
    budget: 'response',
    samples: 1,
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.alone);
      await show(d, left, right);
      const marker = `${SINGLE}[aria-label=${JSON.stringify(t.alone.title)}]`;
      await d.click(marker, { force: true });
      await d.wait(visible('#inspector'));
      const ask = await timed(d, visible('#delete-dialog'), () => d.click('#event-delete'));
      const gone = await timed(d, `!document.querySelector(${JSON.stringify(marker)})`, () =>
        d.click('#delete-confirm'),
      );
      await d.click('#undo-button');
      await d.wait(`!!document.querySelector(${JSON.stringify(marker)})`);
      return [ask, gone];
    },
  },
  {
    name: 'new-duration',
    group: 'editing',
    budget: 'response',
    async run(d, t) {
      await closeDialogs(d);
      await show(d, t.fitted.left, t.fitted.right);
      const ms = await timed(d, visible('#duration-dialog'), () => d.click('#add-duration-button'));
      await d.click('#duration-cancel');
      await d.wait(hidden('#duration-dialog'));
      return ms;
    },
  },
  {
    name: 'endpoint-picker',
    group: 'editing',
    budget: 'results',
    samples: 1,
    async run(d, t) {
      await closeDialogs(d);
      await show(d, t.fitted.left, t.fitted.right);
      await d.click('#add-duration-button');
      await d.wait(visible('#duration-dialog'));
      // Choosing "Follows a moment" with the keyboard opens the moment picker.
      await d.focus('[data-endpoint="end"] select');
      const list = await timed(
        d,
        `${visible('#moment-picker')} && document.querySelectorAll('#moment-picker-results .search-result').length > 0`,
        () => d.press('ArrowDown'),
      );
      const word = t.alone.title.split(' ')[0];
      const search = await timed(d, `/match/.test(${text('#moment-picker-status')})`, () =>
        d.type(word),
      );
      // Escape in a search field clears it first; use the close button.
      await d.click('[data-close="moment-picker"]');
      await d.wait(hidden('#moment-picker'));
      await d.click('#duration-cancel');
      await d.wait(hidden('#duration-dialog'));
      return [list, search];
    },
  },
  {
    name: 'search',
    group: 'find',
    budget: 'results',
    async run(d, t) {
      await closeDialogs(d);
      await d.focus('#timeline-stage');
      await timed(d, visible('#search-dialog'), () => d.press('/'));
      await d.eval(`document.getElementById('search-text').value = ''`);
      await d.type(t.alone.title.split(' ')[0]);
      const ms = await timed(d, `/match/.test(${text('#search-status')})`, () => d.press('Enter'));
      await closeDialogs(d);
      return ms;
    },
  },
  {
    name: 'open-search',
    group: 'find',
    budget: 'response',
    async run(d) {
      await closeDialogs(d);
      await d.focus('#timeline-stage');
      const ms = await timed(d, visible('#search-dialog'), () => d.press('/'));
      await closeDialogs(d);
      return ms;
    },
  },
  {
    name: 'group-summary',
    group: 'find',
    budget: 'results',
    async run(d, t) {
      await closeDialogs(d);
      await show(d, t.fitted.left, t.fitted.right);
      const ms = await timed(
        d,
        // A group may hold only durations, listed separately.
        `${visible('#group-details')} && document.querySelectorAll('#group-events button, #group-duration-list button').length > 0`,
        () => d.click('#markers .event-marker.group', { force: true }),
      );
      await closeDialogs(d);
      return ms;
    },
  },
  {
    name: 'separate-by-tags',
    group: 'find',
    budget: 'results',
    samples: 1,
    async run(d, t) {
      await closeDialogs(d);
      await show(d, t.fitted.left, t.fitted.right);
      const dialog = await timed(
        d,
        `document.querySelectorAll('#separate-dialog .checkbox-label').length > 0`,
        () => d.click('#separate-button'),
      );
      await d.click('#separate-dialog .checkbox-label input');
      await resetLoaded(d);
      const separate = await timed(d, loaded(visible('#separation-settings')), () =>
        d.click('#separate-submit'),
      );
      await resetLoaded(d);
      const rejoin = await timed(d, loaded(hidden('#separation-settings')), () =>
        d.click('#separation-rejoin'),
      );
      return [dialog, separate, rejoin];
    },
  },
  {
    name: 'separate-connected',
    group: 'find',
    budget: 'results',
    async run(d, t) {
      await closeDialogs(d);
      const [left, right] = t.near(t.related);
      await show(d, left, right);
      await d.click(`.event-marker[aria-label=${JSON.stringify(t.related.title)}]`, {
        force: true,
      });
      await d.wait(
        `[...document.querySelectorAll('#event-related button')].some((b) => b.textContent === 'Separate related')`,
      );
      await resetLoaded(d);
      const ms = await timed(d, loaded(visible('#separation-settings')), () =>
        // "Separate related" (direct links) is always offered; "all connected" only with more.
        d.clickText('#event-related', 'Separate related'),
      );
      await d.click('#separation-rejoin');
      await resetLoaded(d);
      await d.wait(loaded(hidden('#separation-settings')));
      return ms;
    },
  },
  {
    name: 'export',
    group: 'files',
    budget: 'results',
    platforms: ['browser'],
    async run(d) {
      await closeDialogs(d);
      return timed(d, `__ui.downloaded() !== null`, () => d.click('#export-button'));
    },
  },
  {
    name: 'edit-pause',
    group: 'files',
    budget: 'response',
    samples: 3,
    async run(d) {
      await closeDialogs(d);
      // Renaming the timeline redraws and, signed in, saves a draft or marks server changes.
      return longestFrame(
        d,
        async () => {
          await d.click('#timeline-title');
          await d.type('!');
          await d.press('Tab');
        },
        3000,
      );
    },
  },
  {
    name: 'save-to-server',
    group: 'files',
    budget: 'results',
    platforms: ['platform'],
    async run(d) {
      await closeDialogs(d);
      await d.click('#timeline-title');
      await d.type('!');
      await d.press('Tab');
      await d.wait(`/Unsaved server changes/.test(${text('#save-status')})`);
      return timed(d, `/Saved on the server/.test(${text('#save-status')})`, () =>
        d.click('#publish-button'),
      );
    },
  },
  {
    name: 'live-update',
    group: 'find',
    budget: 'results',
    platforms: ['platform'],
    async run(d, t, ctx) {
      await closeDialogs(d);
      const count = `Number(${text('#event-count')}.split(' ')[0].replace(/\\D/g, ''))`;
      const before = await d.eval(count);
      // Another writer adds a moment; the viewer shows it without reloading.
      return since(d, `${count} > ${before}`, () => ctx.addMoment());
    },
  },
];

/**
 * Waits until the editor shows the fitted timeline. If it shows a message instead and still
 * has not opened 30 s later, reports that message (success notes such as "JSON timeline
 * imported." also use the toast, so a toast alone is not an error).
 */
async function opened(d, t, timeout = 15 * 60000) {
  const fitted = `${value('#exact-left')} === ${JSON.stringify(t.fitted.left.toString())}`;
  const until = Date.now() + timeout;
  let toastSince = null;
  while (!(await d.eval(fitted))) {
    const toast = (await d.eval(visible('#toast'))) ? await d.eval(text('#toast')) : null;
    toastSince = toast ? (toastSince ?? Date.now()) : null;
    if (toast && Date.now() - toastSince > 30000)
      throw new Error(`The editor did not open the timeline: ${toast}`);
    if (Date.now() > until) throw new Error(`The editor did not open the timeline in time.`);
    await delay(50);
  }
}
/** Serves the built editor for the in-memory browser runs (as bench/capacity.mjs does). */
async function browserPage(browser, size, document, throttle) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await context.addInitScript({ content: PROBE });
  await context.route('http://localhost:5173/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/session')
      return route.fulfill({
        json: { user: { id: 'bench', username: 'bench' }, csrf: 'bench', server: true },
      });
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { error: 'Server storage is not configured.' } });
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^(index\.html|app\.(js|css))$/.test(name))
      return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      body: await readFile(resolve('dist', name)),
      contentType: name.endsWith('.css')
        ? 'text/css'
        : name.endsWith('.html')
          ? 'text/html'
          : 'text/javascript',
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const cdp = await context.newCDPSession(page);
  const d = playwrightDriver(page, cdp);
  await page.goto('http://localhost:5173/');
  await page.locator('#json-file').waitFor({ state: 'attached' });
  await d.throttle(throttle);
  const t = targets(document);
  const started = Date.now();
  await d.setFile('#json-file', `timeline-${size}.ochx`, JSON.stringify(document));
  await opened(d, t);
  return { context, d, t, open: Date.now() - started };
}

/** The production Next.js server against DATABASE_URL, signed in as the bench user. */
async function startPlatform() {
  const { default: pg } = await import('pg');
  const { Auth } = await import('../server/auth.mjs');
  const { PostgresStore } = await import('../server/store.mjs');
  const pool = new pg.Pool({ connectionString: DATABASE });
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  const port = Number(env.UI_PLATFORM_PORT ?? 5196),
    origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [resolve('platform/.next/standalone/platform/server.cjs')],
    {
      env: {
        ...env,
        NODE_ENV: 'production',
        APP_ORIGIN: origin,
        OCH_APP_ROOT: process.cwd(),
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let logs = '';
  for (const s of [child.stdout, child.stderr])
    s.on('data', (c) => (logs = (logs + c).slice(-8000)));
  for (let i = 0; ; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    if (i > 150) throw new Error('Platform did not start:\n' + logs);
    await delay(200);
  }
  const { rows } = await pool.query(
    `INSERT INTO oc_users(id,username,email_verified_at,quota_bypass) VALUES(gen_random_uuid(),'bench_ui',now(),true)
     ON CONFLICT(username) DO UPDATE SET email_verified_at=now(),quota_bypass=true RETURNING *`,
  );
  const user = rows[0],
    store = new PostgresStore(pool);
  const auth = new Auth(pool, origin);
  const timelines = new Map();
  return {
    origin,
    /** A fresh copy of the benchmark timeline, owned by the bench user. */
    async timeline(size, document) {
      if (!timelines.has(size)) timelines.set(size, (await store.create(user.id, document)).id);
      return timelines.get(size);
    },
    async cookie() {
      const issued = await auth.issue(user, 'web', true);
      const [pair] = issued.cookie.split(';');
      const [name, ...rest] = pair.split('=');
      return { name, value: rest.join('='), url: origin };
    },
    async addMoment(id) {
      const timeline = await store.metadata(id, user.id);
      const settings = { format: 'openchronology', version: 1 };
      for (const key of ['title', 'description', 'presentation', 'plugins', 'tags', 'assets'])
        if (timeline[key] !== null && timeline[key] !== undefined) settings[key] = timeline[key];
      const moment = 'live-' + Date.now();
      await store.save(id, user.id, timeline.revision, null, {
        settings,
        changes: [
          { id: moment, event: { id: moment, time: '1/1', metadata: { title: 'Live addition' } } },
        ],
      });
    },
    async close() {
      for (const id of timelines.values())
        await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      child.kill('SIGKILL');
      await pool.end();
    },
  };
}
async function platformPage(browser, platform, size, document) {
  const id = await platform.timeline(size, document);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await context.addInitScript({ content: PROBE });
  await context.addCookies([await platform.cookie()]);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  const d = playwrightDriver(page, await context.newCDPSession(page));
  const t = targets(document);
  const started = Date.now();
  await page.goto(`${platform.origin}/editor/frame#timeline/${id}`);

  await opened(d, t);
  return {
    context,
    d,
    t,
    open: Date.now() - started,
    ctx: { addMoment: () => platform.addMoment(id) },
  };
}

const rows = [];
const advised = (d) =>
  d.eval(
    `(() => { const n = document.getElementById('capacity-notice'); return !!n && !n.hidden; })()`,
  );
async function suite(label, platform, throttle, size, opened) {
  const { d, t, open, ctx } = opened;
  const comfortable =
    size <=
    (platform === 'browser'
      ? throttle > 1
        ? COMFORTABLE.slowBrowser
        : COMFORTABLE.browser
      : COMFORTABLE[platform]);
  const record = (scenario, group, budget, samples) => {
    const limit = BUDGETS[budget];
    const value = median(samples);
    const pass = value <= limit * TOLERANCE;
    rows.push({
      platform,
      throttle,
      size,
      scenario,
      group,
      budget,
      limit,
      value,
      samples,
      pass,
      comfortable,
    });
    console.log(
      `${label} ${size} ${scenario}: ${Math.round(value)} ms (${budget} ≤ ${limit} ms) ${pass ? 'ok' : 'SLOW'}`,
    );
  };
  record('open', 'files', 'open', [open]);
  for (const scenario of SCENARIOS) {
    if (ONLY && !ONLY.has(scenario.name)) continue;
    if (scenario.platforms && !scenario.platforms.includes(platform)) continue;
    if (scenario.engines && !scenario.engines.includes(d.engine)) continue;
    const samples = [];
    try {
      for (let i = 0; i < (scenario.samples ?? SAMPLES); i++)
        samples.push(...[await scenario.run(d, t, ctx)].flat());
      record(scenario.name, scenario.group, scenario.budget, samples);
    } catch (error) {
      console.log(`${label} ${size} ${scenario.name}: failed (${error.message.split('\n')[0]})`);
      rows.push({
        platform,
        throttle,
        size,
        scenario: scenario.name,
        group: scenario.group,
        budget: scenario.budget,
        limit: BUDGETS[scenario.budget],
        error: error.message.split('\n')[0],
        pass: false,
        comfortable,
      });
      if (env.UI_DEBUG)
        console.log(
          'state',
          await d.eval(`JSON.stringify({
            open: [...document.querySelectorAll('dialog[open]')].map((x) => x.id),
            groupDetails: !document.getElementById('group-details').hidden,
            eventForm: !document.getElementById('event-form').hidden,
            groups: document.querySelectorAll('#markers .event-marker.group').length,
            focus: document.activeElement?.id,
            bounds: ${BOUNDS},
            inputs: window.__ui?.recent(),
            empty: !document.getElementById('empty-window').hidden,
            loading: !document.getElementById('loading-window').hidden,
            durations: document.querySelectorAll('.duration-band').length,
            messages: ['#search-status', '#moment-picker-status', '#toast'].map((id) => document.querySelector(id)?.textContent),
            labels: [...document.querySelectorAll('#markers .event-marker')].slice(0, 8).map((m) => m.getAttribute('aria-label')),
            title: document.getElementById('event-title').value,
            status: document.getElementById('save-status').textContent,
            count: document.getElementById('event-count').textContent,
          })`),
        );
      await closeDialogs(d).catch(() => {});
    }
  }
  // The advice must be showing wherever an interaction missed its budget.
  const shown = await advised(d);
  for (const row of rows.filter(
    (r) => r.platform === platform && r.throttle === throttle && r.size === size,
  ))
    row.advised = shown;
}

/**
 * The desktop app through tauri-driver (which forwards to WebKitWebDriver on Linux). Build
 * the app first: npx tauri build --debug --no-bundle (embeds dist/).
 */
async function startDesktop() {
  const port = Number(env.UI_WEBDRIVER_PORT ?? 4444),
    url = `http://127.0.0.1:${port}`;
  const app = resolve(
    env.UI_DESKTOP_APP ??
      `${env.CARGO_TARGET_DIR ?? 'src-tauri/target'}/debug/openchronology-desktop`,
  );
  const driver = spawn(env.TAURI_DRIVER ?? 'tauri-driver', ['--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  for (const s of [driver.stdout, driver.stderr])
    s.on('data', (c) => (logs = (logs + c).slice(-8000)));
  for (let i = 0; ; i++) {
    if (driver.exitCode !== null) throw new Error('tauri-driver exited:\n' + logs);
    try {
      if ((await fetch(url + '/status', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    if (i > 100) throw new Error('tauri-driver did not start:\n' + logs);
    await delay(100);
  }
  return { url, app, close: () => driver.kill() };
}
/**
 * A fresh app per timeline. Timelines over 2,048 moments move into the native SQLite store
 * after opening, as for desktop users; smaller ones stay in memory.
 */
async function desktopPage(desktop, size, document) {
  const d = await webdriverSession(desktop.url, desktop.app);
  await d.wait(`!!document.getElementById('json-file')`, 60000);
  await d.inject(PROBE);
  const t = targets(document);
  await d.setFile('#json-file', `timeline-${size}.ochx`, JSON.stringify(document));
  await opened(d, t);
  // Timed in the page, from handing over the file: not the WebDriver transfer before it.
  const open = await d.eval('performance.now() - window.__uiFileStart');
  if (document.events.length > 2048)
    await d.wait(`document.documentElement.dataset.storage === 'sqlite'`, 15 * 60000);
  return { d, t, open, close: () => d.close() };
}

await mkdir(RESULTS, { recursive: true });
// Chromium drives the browser and platform runs; the desktop runs need only tauri-driver.
const browser = PLATFORMS.some((p) => p !== 'desktop')
  ? await chromium.launch(env.BROWSER_EXECUTABLE ? { executablePath: env.BROWSER_EXECUTABLE } : {})
  : null;
let platform = null,
  desktop = null;
try {
  for (const size of SIZES) {
    const document = generateTimeline(size);
    if (PLATFORMS.includes('browser'))
      for (const throttle of THROTTLES) {
        const opened = await browserPage(browser, size, document, throttle);
        try {
          await suite(
            `browser${throttle > 1 ? ` ×${throttle}` : ''}`,
            'browser',
            throttle,
            size,
            opened,
          );
        } finally {
          await opened.context.close();
        }
      }
    if (PLATFORMS.includes('platform')) {
      platform ??= await startPlatform();
      const opened = await platformPage(browser, platform, size, document);
      try {
        await suite('platform', 'platform', 1, size, opened);
      } finally {
        await opened.context.close();
      }
    }
    if (PLATFORMS.includes('desktop')) {
      desktop ??= await startDesktop();
      const opened = await desktopPage(desktop, size, document);
      try {
        await suite('desktop', 'desktop', 1, size, opened);
      } finally {
        await opened.close();
      }
    }
  }
} finally {
  await browser?.close();
  await platform?.close();
  desktop?.close();
}
// Known misses (scenario or group names, e.g. "navigation") are reported but do not fail the
// gate: they are tracked elsewhere (#68), and the gate guards everything else against them.
const known = (r) => KNOWN.has(r.scenario) || KNOWN.has(r.group);
const failures = rows.filter((r) => !r.pass && r.comfortable && !known(r));
const gaps = rows.filter((r) => !r.pass && !r.comfortable && !r.advised && !known(r));
const knownMisses = rows.filter((r) => !r.pass && known(r));
await writeFile(
  `${RESULTS}/ui.json`,
  JSON.stringify(
    {
      budgets: BUDGETS,
      comfortable: COMFORTABLE,
      tolerance: TOLERANCE,
      finished: new Date().toISOString(),
      rows,
    },
    null,
    2,
  ),
);
console.log(
  `UI benchmarks: ${rows.length} measurements; ${failures.length} over budget within a comfortable size; ${gaps.length} over budget without advice${knownMisses.length ? `; ${knownMisses.length} known` : ''}.`,
);
for (const r of knownMisses)
  console.log(
    `  known: ${r.platform}${r.throttle > 1 ? ` ×${r.throttle}` : ''} ${r.size} ${r.scenario} ${r.error ?? Math.round(r.value) + ' ms'} (≤ ${r.limit * TOLERANCE} ms)`,
  );
for (const r of [...failures, ...gaps])
  console.log(
    `  ${r.comfortable ? 'over budget' : 'advice gap'}: ${r.platform}${r.throttle > 1 ? ` ×${r.throttle}` : ''} ${r.size} ${r.scenario} ${r.error ?? Math.round(r.value) + ' ms'} (≤ ${r.limit * TOLERANCE} ms)`,
  );
if (GATE && (failures.length || gaps.length)) process.exit(1);
