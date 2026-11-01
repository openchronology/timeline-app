// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The toolbars on a phone: one row each, with File and Tools menus holding the rest, which open,
// close and run their actions; full screen gives the stage nearly all of the screen; nothing
// overflows sideways, in light and dark; and wider screens get their controls back in place.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

/** The ids of a row's children, in order, to see that a wide screen gets them back as they were. */
const order = (page) =>
  page.evaluate(() =>
    ['.file-actions', '.view-toolbar .view-controls', '.timeline-footer'].map((row) =>
      [...document.querySelector(row).children].map((c) => c.id || c.className),
    ),
  );

/** The phone's rows: where their shown controls sit, and what spills over. */
const rows = (page) =>
  page.evaluate(() => {
    const shown = (e) => e.getClientRects().length > 0;
    const row = (selector) =>
      [...document.querySelector(selector).children].filter(shown).map((c) => {
        const r = c.getBoundingClientRect();
        return { id: c.id, top: Math.round(r.top), left: r.left, right: r.right, height: r.height };
      });
    // The visible range, as long as a dated timeline's (measured at once, before it redraws).
    const context = document.getElementById('time-context');
    const range = [context.hidden, context.textContent];
    context.hidden = false;
    context.textContent = '1852-11-20 CE 04:31 → 2101-03-08 CE 19:02 · UTC · Gregorian calendar';
    const contextHeight = context.getBoundingClientRect().height;
    [context.hidden, context.textContent] = range;
    const stage = document.getElementById('timeline-stage').getBoundingClientRect();
    return {
      file: row('.file-actions'),
      view: row('.view-toolbar .view-controls'),
      context: contextHeight,
      heading: shown(document.querySelector('.view-heading')),
      footer: shown(document.querySelector('.timeline-footer')),
      stage: { top: stage.top, height: stage.height },
      documentWidth: document.documentElement.scrollWidth,
      width: innerWidth,
      height: innerHeight,
    };
  });

/** The menu `name`'s button and panel; `open` says whether the panel shows. */
function menu(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  const panel = page.getByRole('group', { name, exact: true });
  return {
    button,
    panel,
    async open() {
      return (await button.getAttribute('aria-expanded')) === 'true' && (await panel.isVisible());
    },
  };
}

export async function checkMobileToolbars(page) {
  const phone = await page.context().newPage();
  const errors = [];
  phone.on('pageerror', (error) => errors.push(error.message));
  phone.on('dialog', (dialog) => dialog.accept());
  // The page's own full screen, without the browser's: a headless browser's would take the
  // whole (desktop-sized) screen, and phones' sites in frames may be refused it anyway.
  await phone.addInitScript(() => (Element.prototype.requestFullscreen = undefined));
  try {
    await phone.setViewportSize({ width: 1280, height: 900 });
    await phone.goto(page.url());
    // Drawn: the axis is there (the offline file opens on an empty timeline).
    await phone.locator('.axis-baseline').waitFor();
    const wide = await order(phone);
    const tools = menu(phone, 'Tools'),
      file = menu(phone, 'File');
    // On a wide screen, neither menu shows, and every control is in its row.
    assert.equal(await tools.button.isVisible(), false);
    assert.equal(await file.button.isVisible(), false);
    assert(await phone.getByRole('button', { name: 'Separate by tags' }).isVisible());

    for (const scheme of ['light', 'dark']) {
      await phone.emulateMedia({ colorScheme: scheme });
      for (const [width, height] of [
        [412, 915],
        [390, 844],
        [360, 780],
      ]) {
        await phone.setViewportSize({ width, height });
        await phone.waitForFunction(() => !document.getElementById('view-tools-button').hidden);
        const shown = await rows(phone);
        const where = `${width}×${height} ${scheme}: ${JSON.stringify(shown)}`;
        assert(shown.documentWidth <= shown.width + 1, 'Nothing overflows sideways: ' + where);
        // One row each, every control a comfortable target, within the screen.
        for (const row of [shown.file, shown.view]) {
          assert(row.length >= 1, where);
          assert(
            row.every((c) => Math.abs(c.top - row[0].top) <= 2),
            'One row of controls: ' + where,
          );
          assert(
            row.every((c) => c.height >= 40 && c.right <= width),
            'Touch targets: ' + where,
          );
        }
        // Only these, in this order (Fit all is hidden while there is nothing to fit).
        const row = [
          'zoom-out',
          'zoom-in',
          'fit-button',
          'fullscreen-button',
          'view-tools-button',
          'add-button',
        ];
        assert.deepEqual(
          shown.view.map((c) => c.id),
          row.filter((id) => shown.view.some((c) => c.id === id)),
          where,
        );
        assert(
          shown.view.some((c) => c.id === 'view-tools-button'),
          where,
        );
        assert(
          shown.file.some((c) => c.id === 'file-menu-button'),
          where,
        );
        assert(!shown.heading && !shown.footer, where);
        // The visible range is one compact line.
        assert(shown.context > 0 && shown.context < 28, 'One line of range: ' + where);
        // The stage starts within about a row of the card's top.
        assert(shown.stage.height >= 300, where);
      }
      // The menus' colors are the theme's: dark menus in dark.
      await tools.button.click();
      const colors = await tools.panel.evaluate((panel) => [
        getComputedStyle(panel).backgroundColor,
        getComputedStyle(panel).color,
      ]);
      const light = (color) => {
        const [r, g, b] = color.match(/\d+/g).map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
      };
      assert.equal(light(colors[0]), scheme === 'light', colors.join());
      assert.equal(light(colors[1]), scheme === 'dark', colors.join());
      await mkdir('artifacts', { recursive: true });
      await phone.screenshot({ path: `artifacts/mobile-tools-${scheme}.png` });
      await phone.keyboard.press('Escape');
    }
    await phone.emulateMedia({ colorScheme: 'light' });
    await phone.setViewportSize({ width: 390, height: 844 });

    // Tools opens and closes: its button, Escape (giving the button the focus back), and a tap
    // on the stage, which the menu never covers once it is touched.
    assert.equal(await tools.open(), false);
    await tools.button.click();
    assert(await tools.open());
    assert(await tools.panel.getByRole('button', { name: 'Search' }).isVisible());
    await tools.button.click();
    assert.equal(await tools.open(), false);
    await tools.button.click();
    await phone.keyboard.press('Escape');
    assert.equal(await tools.open(), false);
    assert(await tools.button.evaluate((b) => document.activeElement === b));
    await phone.locator('.timeline-card').evaluate((card) => card.scrollIntoView());
    await tools.button.click();
    const stage = await phone.locator('#timeline-stage').boundingBox();
    await phone.mouse.click(stage.x + stage.width / 2, stage.y + stage.height - 20);
    assert.equal(await tools.open(), false, 'A tap outside closes the menu');
    // Where the tap selected a time, Clear selection waits in Tools, and clears it.
    await phone.waitForTimeout(400);
    if (await phone.evaluate(() => !document.getElementById('clear-selection').hidden)) {
      await tools.button.click();
      await tools.panel.getByRole('button', { name: 'Clear selection', exact: true }).click();
      await phone.waitForFunction(() => document.getElementById('clear-selection').hidden);
      assert.equal(await tools.open(), false);
    }

    // From the keyboard: Enter opens it on its first control, and arrows move between them.
    await tools.button.focus();
    await phone.keyboard.press('Enter');
    assert(await tools.open());
    const focused = () => phone.evaluate(() => document.activeElement?.id);
    assert.equal(await focused(), 'search-button');
    await phone.keyboard.press('ArrowDown');
    assert.equal(await focused(), 'separate-button');
    await phone.keyboard.press('ArrowUp');
    await phone.keyboard.press('ArrowUp');
    assert.notEqual(await focused(), 'search-button', 'Arrows wrap around');
    await phone.keyboard.press('Home');
    assert.equal(await focused(), 'search-button');
    await phone.keyboard.press('Escape');
    assert.equal(await tools.open(), false);

    // Its actions run, and close it: Time display and Separate by tags open their dialogs.
    for (const [name, dialog] of [
      ['Time display', '#presentation-dialog'],
      ['Separate by tags', '#separate-dialog'],
    ]) {
      await tools.button.click();
      await tools.panel.getByRole('button', { name, exact: true }).click();
      await phone.locator(dialog).waitFor({ state: 'visible' });
      assert.equal(await tools.open(), false, name);
      await phone.keyboard.press('Escape');
      await phone.locator(dialog).waitFor({ state: 'hidden' });
      // The focus comes back to Tools, not to a control in the closed menu.
      await phone.waitForFunction(() => document.activeElement?.id === 'view-tools-button');
    }
    // The text size's steps leave it open, for another step.
    const scale = () => phone.locator('#timeline-stage').getAttribute('data-ui-scale');
    const before = await scale();
    await tools.button.click();
    await tools.panel.getByRole('button', { name: 'Larger', exact: true }).click();
    await phone.waitForFunction(
      (s) => document.getElementById('timeline-stage').dataset.uiScale !== s,
      before,
    );
    assert(await tools.open(), 'Text size keeps the menu open');
    await tools.panel.getByRole('button', { name: 'Smaller', exact: true }).click();
    await phone.waitForFunction(
      (s) => document.getElementById('timeline-stage').dataset.uiScale === s,
      before,
    );
    // Follow latest moments (shown for server timelines): its box, words and "?" on one line.
    await phone.evaluate(() => (document.getElementById('follow-latest-control').hidden = false));
    const follow = await phone.evaluate(() =>
      ['#follow-latest', '#follow-latest-control .help-tip'].map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      }),
    );
    assert(Math.abs(follow[0] - follow[1]) <= 3, 'Follow latest on one line: ' + follow);
    await phone.evaluate(() => (document.getElementById('follow-latest-control').hidden = true));
    await phone.keyboard.press('Escape');

    // File holds the file chores still shown, and exports.
    await file.button.click();
    assert(await file.open());
    assert(await file.panel.getByRole('button', { name: 'Import', exact: true }).isVisible());
    assert.equal(await file.panel.locator('#och-import').isVisible(), false, 'Hidden stays hidden');
    const download = phone.waitForEvent('download');
    await file.panel.getByRole('button', { name: 'Export', exact: true }).click();
    assert.match((await download).suggestedFilename(), /\.ochx$/);
    assert.equal(await file.open(), false);
    // Hiding all it holds hides File itself.
    await phone.evaluate(() => {
      for (const id of ['import-button', 'export-button'])
        document.getElementById(id).hidden = true;
    });
    await phone.waitForFunction(() => document.getElementById('file-menu-button').hidden);
    await phone.evaluate(() => {
      for (const id of ['import-button', 'export-button'])
        document.getElementById(id).hidden = false;
    });
    await phone.waitForFunction(() => !document.getElementById('file-menu-button').hidden);

    // Full screen: one slim row, and the stage takes the rest; Tools still opens, on screen.
    for (const scheme of ['light', 'dark']) {
      await phone.emulateMedia({ colorScheme: scheme });
      await phone.getByRole('button', { name: 'Full screen', exact: true }).click();
      await phone.waitForFunction(() =>
        document.documentElement.classList.contains('timeline-fullscreen'),
      );
      await phone.waitForFunction(
        () => document.getElementById('timeline-stage').clientHeight > innerHeight * 0.8,
      );
      const shown = await rows(phone);
      assert(
        shown.stage.height >= shown.height * 0.85,
        'The stage fills full screen: ' + JSON.stringify(shown),
      );
      assert(shown.view.every((c) => Math.abs(c.top - shown.view[0].top) <= 2));
      await tools.button.click();
      const box = await tools.panel.boundingBox();
      assert(box.y + box.height <= shown.height + 1 && box.height > 200, JSON.stringify(box));
      await phone.screenshot({ path: `artifacts/mobile-fullscreen-${scheme}.png` });
      // Escape closes the menu first, and only then leaves full screen (unless the browser's
      // own full screen was granted, which takes Escape itself).
      const browserFullscreen = await phone.evaluate(() => !!document.fullscreenElement);
      await phone.keyboard.press('Escape');
      assert.equal(await tools.open(), false);
      await phone.waitForTimeout(300);
      const still = await phone.evaluate(() =>
        document.documentElement.classList.contains('timeline-fullscreen'),
      );
      assert(still || browserFullscreen, 'Escape closed the menu, not full screen');
      if (still) await phone.getByRole('button', { name: 'Exit full screen', exact: true }).click();
      await phone.waitForFunction(
        () => !document.documentElement.classList.contains('timeline-fullscreen'),
      );
    }
    await phone.emulateMedia({ colorScheme: 'light' });

    // A wider screen gets every control back where it was.
    await phone.setViewportSize({ width: 1280, height: 900 });
    await phone.waitForFunction(() => document.getElementById('view-tools-button').hidden);
    assert.deepEqual(await order(phone), wide);
    assert(await phone.getByRole('button', { name: 'Separate by tags' }).isVisible());
    assert.deepEqual(errors, []);
  } finally {
    await phone.close();
  }
  console.log(
    'PASS mobile toolbars: one row each, File and Tools menus, full screen, light and dark.',
  );
}
