// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsId, analyticsPolicy, platformName, siteName } from '../server/site.mjs';

test('a platform names itself, or shows OpenChronology', () => {
  assert.equal(platformName({}), null);
  assert.equal(platformName({ PLATFORM_NAME: '  ' }), null);
  assert.equal(platformName({ PLATFORM_NAME: ' timescale.info ' }), 'timescale.info');
  assert.equal(siteName({}), 'OpenChronology');
  assert.equal(siteName({ PLATFORM_NAME: 'timescale.info' }), 'timescale.info');
  for (const name of ['x'.repeat(61), '<b>bold</b>', 'two\nlines'])
    assert.throws(() => platformName({ PLATFORM_NAME: name }), /PLATFORM_NAME/);
  assert.equal(siteName({ PLATFORM_NAME: 'x'.repeat(61) }), 'OpenChronology');
});

test('Google Analytics is off unless a measurement ID is set', () => {
  assert.equal(analyticsId({}), null);
  assert.deepEqual(analyticsPolicy({}), { script: '', connect: '' });
  assert.equal(analyticsId({ GOOGLE_ANALYTICS_ID: ' G-ABC123DEF4 ' }), 'G-ABC123DEF4');
  const policy = analyticsPolicy({ GOOGLE_ANALYTICS_ID: 'G-ABC123DEF4' });
  assert.equal(policy.script, ' https://www.googletagmanager.com');
  assert.match(policy.connect, /google-analytics\.com/);
  for (const id of ['UA-12345-1', 'G-abc', 'G-ABC"; script-src *', 'https://evil.example'])
    assert.throws(() => analyticsId({ GOOGLE_ANALYTICS_ID: id }), /measurement ID/);
  // A refused ID adds nothing to pages' policy (the server would not start with it).
  assert.deepEqual(analyticsPolicy({ GOOGLE_ANALYTICS_ID: 'G-ABC"; *' }), {
    script: '',
    connect: '',
  });
});
