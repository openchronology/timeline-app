// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The UI benchmarks' desktop driver: the Tauri app through tauri-driver (W3C WebDriver, which
// forwards to WebKitWebDriver on Linux). Input is real: W3C pointer, key and wheel actions.
import { setTimeout as delay } from 'node:timers/promises';

/** W3C key values for the names the scenarios press. */
const KEYS = {
  Enter: '',
  Escape: '',
  Tab: '',
  End: '',
  ArrowRight: '',
  ArrowDown: '',
  Space: ' ',
};
const key = (name) => KEYS[name] ?? name;

/** A WebDriver session on the app at `application`, through the driver at `url`. */
export async function webdriverSession(url, application) {
  const call = async (method, path, body) => {
    const response = await fetch(url + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const reply = await response.json();
    if (!response.ok || reply.value?.error)
      throw new Error(`WebDriver ${method} ${path}: ${reply.value?.message ?? response.status}`);
    return reply.value;
  };
  const created = await call('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application } } },
  });
  const session = `/session/${created.sessionId}`;
  const run = (script, args = []) => call('POST', `${session}/execute/sync`, { script, args });
  const actions = (list) => call('POST', `${session}/actions`, { actions: list });
  const pointer = (steps) =>
    actions([
      { type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: steps },
    ]);
  const move = (x, y, duration = 0) => ({
    type: 'pointerMove',
    origin: 'viewport',
    x: Math.round(x),
    y: Math.round(y),
    duration,
  });
  /**
   * Where to click an element, once it is ready, as Playwright checks before clicking: its
   * position is the same over two frames, and (unless forced, for markers that labels may
   * overlap) it is what the pointer would hit there. Gives up waiting after 5 s.
   */
  const centre = async (selector, force = false) => {
    const until = Date.now() + 5000;
    for (;;) {
      const at = await run(
        `const n = document.querySelector(arguments[0]);
         if (!n) throw new Error('No element ' + arguments[0]);
         n.scrollIntoView({ block: 'nearest' });
         const box = () => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
         const first = box();
         return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
           const second = box();
           const hit = document.elementFromPoint(second.x, second.y);
           done({ ...second, ready: first.x === second.x && first.y === second.y && (arguments[1] || !!hit && n.contains(hit)) });
         })));`,
        [selector, force],
      );
      if (at.ready || Date.now() > until) return at;
      await delay(50);
    }
  };
  const driver = {
    engine: 'webkit',
    /** Evaluates an expression in the page; promises are awaited (W3C execute). */
    eval: (expression) => run(`return (${expression});`),
    async click(selector, options = {}) {
      const { x, y } = await centre(selector, !!options.force);
      await pointer([
        move(x, y),
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ]);
    },
    async clickText(container, text) {
      const marked = await run(
        `const b = [...document.querySelectorAll(arguments[0] + ' button')].find((x) => x.textContent === arguments[1]);
         if (!b) return false;
         b.dataset.uiTarget = '';
         return true;`,
        [container, text],
      );
      if (!marked) throw new Error(`No button "${text}" in ${container}`);
      await driver.click('[data-ui-target]');
      await run(`document.querySelector('[data-ui-target]')?.removeAttribute('data-ui-target')`);
    },
    clickAt: (x, y) =>
      pointer([move(x, y), { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]),
    async drag(x1, y1, x2, y2, steps = 20) {
      const moves = Array.from({ length: steps }, (_, i) =>
        move(x1 + ((x2 - x1) * (i + 1)) / steps, y1 + ((y2 - y1) * (i + 1)) / steps, 16),
      );
      await pointer([
        move(x1, y1),
        { type: 'pointerDown', button: 0 },
        ...moves,
        { type: 'pointerUp', button: 0 },
      ]);
    },
    // Released after each wheel action: WebKitWebDriver otherwise drops a repeated wheel
    // action at the same position.
    async wheel(x, y, dy) {
      await actions([
        {
          type: 'wheel',
          id: 'wheel',
          actions: [
            {
              type: 'scroll',
              origin: 'viewport',
              x: Math.round(x),
              y: Math.round(y),
              deltaX: 0,
              deltaY: dy,
            },
          ],
        },
      ]);
      await call('DELETE', `${session}/actions`);
    },
    press: (name) =>
      actions([
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: key(name) },
            { type: 'keyUp', value: key(name) },
          ],
        },
      ]),
    type: (text) =>
      actions([
        {
          type: 'key',
          id: 'keyboard',
          actions: [...text].flatMap((c) => [
            { type: 'keyDown', value: c },
            { type: 'keyUp', value: c },
          ]),
        },
      ]),
    focus: (selector) => run(`document.querySelector(arguments[0]).focus()`, [selector]),
    box: (selector) =>
      run(
        `const r = document.querySelector(arguments[0]).getBoundingClientRect();
         return { x: r.x, y: r.y, width: r.width, height: r.height };`,
        [selector],
      ),
    /** Hands a document to a file input, in chunks small enough for WebDriver. */
    async setFile(selector, name, text) {
      await run(`window.__uiFile = [];`);
      const size = 4 * 1024 * 1024;
      for (let i = 0; i < text.length; i += size)
        await run(`window.__uiFile.push(arguments[0]);`, [text.slice(i, i + size)]);
      await run(
        `const input = document.querySelector(arguments[0]);
         const transfer = new DataTransfer();
         transfer.items.add(new File([window.__uiFile.join('')], arguments[1], { type: 'application/json' }));
         delete window.__uiFile;
         input.files = transfer.files;
         window.__uiFileStart = performance.now();
         input.dispatchEvent(new Event('change', { bubbles: true }));`,
        [selector, name],
      );
    },
    async wait(expression, timeout = 120000) {
      const until = Date.now() + timeout;
      while (!(await driver.eval(expression))) {
        if (Date.now() > until) throw new Error(`Timed out waiting for ${expression}`);
        await delay(16);
      }
    },
    inject: (source) => run(source),
    close: () => call('DELETE', session),
  };
  return driver;
}
