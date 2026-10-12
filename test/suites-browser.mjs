// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import {
  MOMENT_ICONS,
  HISTORY_EDUCATION,
  CAUSAL_FACTOR_ANALYSIS,
  validatePluginSuite,
} from '../dist/core.mjs';
/**
 * Plugin suites (#78): the official suites without a server, a server's suites, adding one
 * (keeping plugins already installed), and creating, exporting and importing a suite.
 */
export async function checkSuites(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'suites.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  const timeline = (title, plugins) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    ...(plugins ? { plugins } : {}),
    events: [{ id: 'm', time: '1/1', metadata: { title: 'A moment' } }],
  });
  const installed = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#installed-plugins .installed-plugin strong')].map((n) =>
        n.textContent.replace(/^\d+\. /, '').replace(/ · .*/, ''),
      ),
    );
  await load(timeline('Suites', [{ manifest: MOMENT_ICONS, enabled: false }]));
  await page.locator('#plugins-button').click();
  // Without a server, the official suites included with the app.
  await page.locator('#suites-add').click();
  await page.waitForFunction(() =>
    document
      .getElementById('suite-library-status')
      .textContent.startsWith('2 official suites included with this app'),
  );
  assert.equal(await page.locator('.library-suite').count(), 2);
  await page.locator('[data-close="suite-library-dialog"]').click();

  // A server's library: its suites, community ones included.
  const community = validatePluginSuite({
    ...CAUSAL_FACTOR_ANALYSIS,
    id: 'u-0123456789abcdef0123456789abcdef-lab',
    name: 'Lab notebook',
    description: 'A community suite',
  });
  const library = '**/api/plugins/suites/search';
  await page.route(library, (route) =>
    route.fulfill({
      json: {
        apiVersion: 1,
        suites: [HISTORY_EDUCATION, community],
        total: 2,
        page: 1,
        limit: 12,
        pages: 1,
      },
    }),
  );
  await page.locator('#suites-add').click();
  const history = page.locator('.library-suite[data-suite-id="history-education"]');
  await history.waitFor();
  assert.match(await history.textContent(), /History education · v1 · Official/);
  assert.match(await history.textContent(), /Moment icons \(installed\)/);
  assert.match(
    await page.locator('.library-suite', { hasText: 'Lab notebook' }).textContent(),
    /Community/,
  );
  // Adding it keeps the installed (disabled) icons plugin and adds the rest.
  await history.getByRole('button', { name: 'Add suite to timeline' }).click();
  await page.locator('#suite-library-dialog').waitFor({ state: 'hidden' });
  assert.match(
    await page.locator('#toast').textContent(),
    /History education: added Duration backgrounds, Expand on hover, Rich text notes, Headings\. Kept Moment icons as installed\./,
  );
  assert.deepEqual(await installed(), [
    'Moment icons',
    'Duration backgrounds',
    'Expand on hover',
    'Rich text notes',
    'Headings',
  ]);
  assert.equal(
    await page.getByRole('checkbox', { name: 'Enable Moment icons' }).isChecked(),
    false,
  );
  // Added again: nothing to add.
  await page.locator('#suites-add').click();
  await history.getByRole('button', { name: 'Installed' }).waitFor();
  assert(await history.getByRole('button', { name: 'Installed' }).isDisabled());
  await page.locator('[data-close="suite-library-dialog"]').click();
  await page.unroute(library);

  // A suite made from this timeline's plugins, exported as a file.
  await page.locator('#suites-create').click();
  await page.locator('#suite-name').fill('My history class');
  await page.locator('#suite-description').fill('What my class uses');
  await page.getByRole('checkbox', { name: /^Headings/ }).uncheck();
  // Signed out, a suite is exported, not published.
  assert(await page.locator('#suite-publish').isDisabled());
  const downloaded = page.waitForEvent('download');
  await page.locator('#suite-export').click();
  const file = await downloaded;
  assert.equal(file.suggestedFilename(), 'my-history-class.suite.json');
  const suite = validatePluginSuite(JSON.parse(await readFile(await file.path(), 'utf8')));
  assert.equal(suite.id, 'my-history-class');
  assert.equal(suite.description, 'What my class uses');
  assert.deepEqual(
    suite.plugins.map((p) => p.id),
    ['moment-icons', 'duration-backgrounds', 'expand-on-hover', 'rich-text-notes'],
  );
  await page.locator('[data-close="suite-author-dialog"]').click();
  await page.locator('[data-close="plugins-dialog"]').click();

  // Imported into another timeline, it adds its plugins there.
  await load(timeline('Imported suite'));
  await page.locator('#plugins-button').click();
  await page.locator('#suites-add').click();
  await page.locator('#suite-file').setInputFiles({
    name: 'my-history-class.suite.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(suite)),
  });
  await page.locator('#suite-library-dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await installed(), [
    'Moment icons',
    'Duration backgrounds',
    'Expand on hover',
    'Rich text notes',
  ]);
  // A file that is not a suite says why.
  await page.locator('#suites-add').click();
  await page.locator('#suite-file').setInputFiles({
    name: 'broken.suite.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...suite, plugins: [] })),
  });
  await page.waitForFunction(() =>
    /one to 32 plugins/.test(document.getElementById('suite-library-error').textContent),
  );
  await page.locator('[data-close="suite-library-dialog"]').click();
  await page.locator('[data-close="plugins-dialog"]').click();
  await load(restore);
  console.log(
    'PASS plugin suites: official suites offline, a server’s suites, adding one keeps installed plugins, and suites created, exported and imported.',
  );
}
