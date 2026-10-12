// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLimits,
  compareLimit,
  storageBytes,
  defaultQuota,
  LimitError,
} from '../server/limits.mjs';
import { quotaValue } from '../server/administration.mjs';

test('comparison limits come from the environment, per kind of account', () => {
  const defaults = compareLimits({});
  assert.deepEqual(defaults, { guest: 4, user: 8, admin: 8 });
  assert.equal(compareLimit(defaults, null), 4);
  assert.equal(compareLimit(defaults, { id: 'u' }), 8);
  const set = compareLimits({
    COMPARE_TIMELINES_GUEST: '2',
    COMPARE_TIMELINES_USER: ' 3 ',
    COMPARE_TIMELINES_ADMIN: '',
  });
  assert.deepEqual(set, { guest: 2, user: 3, admin: 8 });
  assert.equal(compareLimit(set, { isAdmin: true }), 8);
  assert.equal(compareLimit(set, { is_admin: true }), 8);
  assert.equal(compareLimit(set, { isAdmin: false }), 3);
  for (const value of ['1', '9', '4.5', 'eight', '-2'])
    assert.throws(
      () => compareLimits({ COMPARE_TIMELINES_USER: value }),
      (error) =>
        error instanceof LimitError && /COMPARE_TIMELINES_USER.*2 to 8/.test(error.message),
    );
});

test('storage sizes take bytes or decimal and binary units', () => {
  const cases = {
    0: 0n,
    104857600: 104857600n,
    '500MiB': 524288000n,
    '2 GB': 2000000000n,
    '1.5GiB': 1610612736n,
    '1.5 gib': 1610612736n,
    '10TB': 10000000000000n,
    '100kb': 100000n,
    '7 B': 7n,
    '0.5KiB': 512n,
    '1.0005KB': 1000n,
  };
  for (const [text, bytes] of Object.entries(cases)) assert.equal(storageBytes(text), bytes, text);
  for (const text of ['', 'lots', '-1', '1e9', '2 PB', '11TB', '1,000', '5 MiBs'])
    assert.throws(() => storageBytes(text), LimitError, text);
});

test('the environment sets the default quota only when given', () => {
  assert.equal(defaultQuota({}), null);
  assert.equal(defaultQuota({ DEFAULT_USER_STORAGE_BYTES: '  ' }), null);
  assert.equal(defaultQuota({ DEFAULT_USER_STORAGE_BYTES: '2GiB' }), 2147483648n);
  assert.throws(() => defaultQuota({ DEFAULT_USER_STORAGE_BYTES: 'plenty' }), LimitError);
  // Administration forms take the same sizes.
  assert.equal(quotaValue('2GiB'), '2147483648');
  assert.equal(quotaValue(1048576), '1048576');
  assert.equal(quotaValue(null, true), null);
  assert.throws(() => quotaValue('20TB'), /from 0 to 10 TB/);
  assert.throws(() => quotaValue({}), /from 0 to 10 TB/);
});
