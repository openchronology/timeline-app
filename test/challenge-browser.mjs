// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Challenges } from '../server/challenge.mjs';
const origin = 'http://localhost:5173';
const spentAnswers = () => {
  const spent = new Set();
  return {
    async query(sql, [id] = []) {
      if (sql.startsWith('DELETE') || spent.has(id)) return { rowCount: 0 };
      spent.add(id);
      return { rowCount: 1 };
    },
  };
};
/**
 * The editor answers the server's human-verification challenges: proof of work is solved in
 * a dialog and the request retried with the answer, Turnstile is shown in the same dialog,
 * and cancelling leaves the request refused.
 */
export async function checkChallenges(browser) {
  for (const provider of ['pow', 'turnstile']) {
    const challenges =
      provider === 'pow'
        ? new Challenges({ pool: spentAnswers(), difficulty: 5000 })
        : new Challenges({
            provider: 'turnstile',
            turnstile: { siteKey: 'test-site', secretKey: 'test-secret' },
            origin,
            fetcher: async (_url, { body }) => ({
              ok: true,
              json: async () => ({
                success: body.get('response') === 'stub-token',
                action: 'sign-in',
                hostname: 'localhost',
              }),
            }),
          });
    const context = await browser.newContext(),
      errors = [],
      logins = [];
    if (provider === 'turnstile')
      // Cloudflare's script is not loaded in tests; this stands in for its widget.
      await context.addInitScript(() => {
        window.turnstile = {
          render(host, options) {
            host.textContent = 'Turnstile widget';
            setTimeout(() => options.callback('stub-token'), 50);
            return 'widget';
          },
          remove() {},
        };
      });
    let user = null;
    await context.route(origin + '/**', async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) {
        const name = path === '/' ? 'index.html' : path.slice(1);
        return route.fulfill({
          body: await readFile(resolve('dist', name)),
          contentType: name.endsWith('.html')
            ? 'text/html'
            : name.endsWith('.css')
              ? 'text/css'
              : 'text/javascript',
        });
      }
      if (path === '/api/session')
        return route.fulfill({
          json: { server: true, user, csrf: 'test-csrf', providers: [], fileExchange: false },
        });
      if (path === '/api/timelines/search')
        return route.fulfill({ json: { timelines: [], total: 0, page: 1, pages: 0 } });
      if (path === '/api/timelines') return route.fulfill({ json: { timelines: [] } });
      if (path !== '/api/auth/login') throw new Error('Unexpected API: ' + path);
      logins.push(request.headers()['x-challenge'] ?? null);
      try {
        await challenges.require(
          { headers: request.headers(), clientAddress: '203.0.113.5' },
          'sign-in',
          null,
        );
      } catch (error) {
        return route.fulfill({
          status: error.status,
          json: { error: error.message, challenge: error.challenge },
        });
      }
      user = { id: 'u', username: 'checked' };
      return route.fulfill({ json: { user, csrf: 'test-csrf' } });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      const signIn = async () => {
        await page.locator('#account-button').click();
        await page.locator('#account-name').fill('checked');
        await page.locator('#account-password').fill('testing account password');
        await page.locator('button[value="login"]').click();
      };
      const dialog = page.locator('dialog.challenge-dialog');
      if (provider === 'pow') {
        // Cancelling refuses the request; nothing is retried. A hard check stays open long
        // enough to cancel.
        challenges.difficulty = 10000000;
        await signIn();
        await dialog.waitFor();
        assert.match(await dialog.textContent(), /Quick check/);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.deepEqual(logins, [null]);
        challenges.difficulty = 5000;
        assert.notEqual(await page.locator('#account-button').textContent(), '@checked');
        await page.keyboard.press('Escape');
      }
      await signIn();
      await page.waitForFunction(
        () => document.getElementById('account-button').textContent === '@checked',
      );
      assert.equal(await dialog.count(), 0, 'The check closes once answered.');
      // Refused once, then accepted with the answer.
      assert.equal(logins.at(-2), null);
      assert(logins.at(-1));
      assert.equal(
        JSON.parse(Buffer.from(logins.at(-1), 'base64url').toString()).provider,
        provider,
      );
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log('PASS challenges: proof of work and Turnstile answered in a dialog; cancel refuses.');
}
