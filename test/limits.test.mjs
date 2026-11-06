// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Limits from the environment (server/limits.mjs): comparison sources per kind of account,
// storage sizes, the default quota and the entry limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLimits,
  compareLimit,
  storageBytes,
  defaultQuota,
  entryLimit,
  linkLimit,
  LimitError,
  mebibytes,
  timelineFileBytes,
  timeDigits,
  applyTimeDigits,
} from '../server/limits.mjs';
import { quotaValue } from '../server/administration.mjs';
import {
  parseTime,
  timeDigitLimit,
  UNBOUNDED_TIME_DIGITS,
  setTimeDigitLimit,
} from '../dist/core.mjs';

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

test('the entry limit comes from TIMELINE_ENTRY_LIMIT: a number from 1000, or unlimited', () => {
  assert.equal(entryLimit({}), 200000);
  assert.equal(entryLimit({ TIMELINE_ENTRY_LIMIT: ' ' }), 200000);
  assert.equal(entryLimit({ TIMELINE_ENTRY_LIMIT: '1000000' }), 1000000);
  assert.equal(entryLimit({ TIMELINE_ENTRY_LIMIT: '1_000_000' }), 1000000);
  assert.equal(entryLimit({ TIMELINE_ENTRY_LIMIT: '50,000' }), 50000);
  assert.equal(entryLimit({ TIMELINE_ENTRY_LIMIT: 'Unlimited' }), Infinity);
  for (const value of ['999', '0', '-5', '2.5', '1e6', 'none', '9007199254740993'])
    assert.throws(
      () => entryLimit({ TIMELINE_ENTRY_LIMIT: value }),
      (error) => error instanceof LimitError && /TIMELINE_ENTRY_LIMIT/.test(error.message),
      value,
    );
});
test('the link limit comes from TIMELINE_LINK_LIMIT: a number from 1, or unlimited (#422)', () => {
  assert.equal(linkLimit({}), 10000);
  assert.equal(linkLimit({ TIMELINE_LINK_LIMIT: ' ' }), 10000);
  assert.equal(linkLimit({ TIMELINE_LINK_LIMIT: '50_000' }), 50000);
  assert.equal(linkLimit({ TIMELINE_LINK_LIMIT: '1' }), 1);
  assert.equal(linkLimit({ TIMELINE_LINK_LIMIT: 'unlimited' }), Infinity);
  for (const value of ['0', '-5', '1.5', 'many'])
    assert.throws(
      () => linkLimit({ TIMELINE_LINK_LIMIT: value }),
      (error) => error instanceof LimitError && /TIMELINE_LINK_LIMIT/.test(error.message),
      value,
    );
});
test('the .och file limit comes from TIMELINE_FILE_BYTES: 1 MiB to 1 GiB, 64 MiB unset (#202)', () => {
  assert.equal(timelineFileBytes({}), 64 * 1024 * 1024);
  assert.equal(timelineFileBytes({ TIMELINE_FILE_BYTES: ' ' }), 64 * 1024 * 1024);
  assert.equal(timelineFileBytes({ TIMELINE_FILE_BYTES: '128MiB' }), 128 * 1024 * 1024);
  assert.equal(timelineFileBytes({ TIMELINE_FILE_BYTES: '1048576' }), 1024 * 1024);
  assert.equal(timelineFileBytes({ TIMELINE_FILE_BYTES: '1 GiB' }), 1024 ** 3);
  for (const value of ['1000000', '2GiB', 'big', '-1'])
    assert.throws(
      () => timelineFileBytes({ TIMELINE_FILE_BYTES: value }),
      (error) => error instanceof LimitError,
      value,
    );
  assert.equal(mebibytes(64 * 1024 * 1024), '64 MiB');
  assert.equal(mebibytes(1.5 * 1024 * 1024), '1.5 MiB');
});

test('a time may have 1000/65 digits on a server unless TIME_DIGIT_LIMIT says otherwise', () => {
  assert.deepEqual(timeDigits({}), { numerator: 1000, denominator: 65 });
  assert.deepEqual(timeDigits({ TIME_DIGIT_LIMIT: ' 5000/200 ' }), {
    numerator: 5000,
    denominator: 200,
  });
  assert.deepEqual(timeDigits({ TIME_DIGIT_LIMIT: '10_000/1,000' }), {
    numerator: 10000,
    denominator: 1000,
  });
  // Unbounded rationals on the server too, at the operator's choice.
  assert.deepEqual(timeDigits({ TIME_DIGIT_LIMIT: 'Unlimited' }), {
    numerator: Infinity,
    denominator: Infinity,
  });
  for (const value of ['1000', '10/65', '1000/10', 'many/few', '-5/10', '1000/65/2', '2000000/65'])
    assert.throws(() => timeDigits({ TIME_DIGIT_LIMIT: value }), /TIME_DIGIT_LIMIT must be/, value);
  // Applied to this process's times.
  try {
    applyTimeDigits({ TIME_DIGIT_LIMIT: '30/30' });
    assert.deepEqual(timeDigitLimit(), { numerator: 30, denominator: 30 });
    assert.throws(() => parseTime('1e40'), /at most 30 digits over at most 30 digits/);
    applyTimeDigits({ TIME_DIGIT_LIMIT: 'unlimited' });
    assert.equal(parseTime('1e40').toString().length, 43);
  } finally {
    setTimeDigitLimit(UNBOUNDED_TIME_DIGITS);
  }
});
