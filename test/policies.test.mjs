// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Agreeing to the terms of service and privacy policy (server/policies.mjs, #277): one version
// everywhere, and what an account that has not agreed may still do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { POLICY_VERSION, agreed, requireAgreed, requireAgreement } from '../server/policies.mjs';

test('the policy version is the effective date the policies and the schema state', async () => {
  const date = new Date(POLICY_VERSION + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  for (const file of ['legal/TERMS.md', 'legal/PRIVACY.md'])
    assert.match(await readFile(file, 'utf8'), new RegExp(`^Effective ${date}\\.`, 'm'), file);
  const schema = await readFile('server/schema.sql', 'utf8');
  assert.match(
    schema,
    new RegExp(`FUNCTION oc_policy_version\\(\\)[^\\n]*SELECT '${POLICY_VERSION}'`),
  );
});

test('agreeing needs the version in force', () => {
  assert.doesNotThrow(() => requireAgreement(POLICY_VERSION));
  for (const value of [undefined, '', 'on', true, '2026-01-01'])
    assert.throws(() => requireAgreement(value), { status: 400 });
  assert.equal(agreed({ terms_version: POLICY_VERSION }), true);
  assert.equal(agreed({ terms_version: null }), false);
  assert.equal(agreed({ terms_version: '2020-01-01' }), false);
});

test('an account that has not agreed may read and manage itself, but not change anything else', () => {
  const web = { kind: 'web', terms_version: null },
    desktop = { kind: 'desktop', terms_version: '2020-01-01' };
  const allowed = [
    ['/api/timelines/00000000-0000-0000-0000-000000000001', 'GET'],
    ['/api/timelines/00000000-0000-0000-0000-000000000001/query', 'POST'],
    ['/api/timelines/search', 'POST'],
    ['/api/timelines/00000000-0000-0000-0000-000000000001', 'DELETE'],
    ['/api/auth/logout', 'POST'],
    ['/api/auth/terms', 'POST'],
    ['/api/auth/account', 'DELETE'],
    ['/api/auth/password/change', 'POST'],
    ['/api/auth/profile', 'PATCH'],
    ['/api/files/export', 'POST'],
    ['/api/reports', 'POST'],
    ['/api/moderation/00000000-0000-0000-0000-000000000001/appeal', 'POST'],
  ];
  const refused = [
    ['/api/timelines', 'POST'],
    ['/api/timelines/00000000-0000-0000-0000-000000000001', 'PUT'],
    ['/api/timelines/00000000-0000-0000-0000-000000000001/fork', 'POST'],
    ['/api/timelines/00000000-0000-0000-0000-000000000001/settings', 'PATCH'],
    ['/api/files/import', 'POST'],
    ['/api/plugins/publish', 'POST'],
    ['/api/auth/api-keys', 'POST'],
    ['/api/admin/users', 'PATCH'],
  ];
  for (const session of [web, desktop]) {
    for (const [path, method] of allowed)
      assert.doesNotThrow(() => requireAgreed(session, path, method), `${method} ${path}`);
    for (const [path, method] of refused)
      assert.throws(
        () => requireAgreed(session, path, method),
        (error) => error.status === 403 && error.terms === POLICY_VERSION,
        `${method} ${path}`,
      );
  }
  // Agreed, signed out, or an API key: nothing is refused here.
  for (const session of [
    { kind: 'web', terms_version: POLICY_VERSION },
    null,
    { kind: 'api', terms_version: null },
  ])
    assert.doesNotThrow(() => requireAgreed(session, '/api/timelines', 'POST'));
});
