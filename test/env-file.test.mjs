// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile, loadEnvFile, loadConfiguration } from '../server/env-file.mjs';

test('configuration files read as systemd reads them: a # inside a value is part of it', () => {
  const settings = parseEnvFile(
    [
      '# A comment',
      '; another',
      '   # an indented comment',
      'ADMIN_INITIAL_PASSWORD=abc!def#ghi@jkl',
      'SPACED = value with spaces  ',
      'HASH_AFTER_SPACE=abc #def',
      'EMPTY=',
      'DOUBLE="quoted # value with \\"escapes\\" and \\\\"',
      "SINGLE='kept \\n as written'",
      'export EXPORTED=yes',
      'CONTINUED=first \\',
      'second',
      'URL=postgresql:///openchronology?host=/var/run/postgresql&port=5433',
      'not a setting',
      '1BAD=no',
      'EQUALS=a=b=c',
    ].join('\r\n'),
  );
  assert.deepEqual(settings, {
    ADMIN_INITIAL_PASSWORD: 'abc!def#ghi@jkl',
    SPACED: 'value with spaces',
    HASH_AFTER_SPACE: 'abc #def',
    EMPTY: '',
    DOUBLE: 'quoted # value with "escapes" and \\',
    SINGLE: 'kept \\n as written',
    EXPORTED: 'yes',
    CONTINUED: 'first second',
    URL: 'postgresql:///openchronology?host=/var/run/postgresql&port=5433',
    EQUALS: 'a=b=c',
  });
});

test('loading a configuration keeps what the environment already sets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'och-env-'));
  try {
    const file = join(dir, 'openchronology.env');
    await writeFile(file, 'A=from file\nB=from file#too\n');
    const env = { A: 'already set' };
    assert.equal(loadEnvFile(file, env), true);
    assert.deepEqual(env, { A: 'already set', B: 'from file#too' });
    assert.equal(loadEnvFile(join(dir, 'missing.env'), {}), false);
    const named = { OCH_CONFIG: file };
    loadConfiguration(named);
    assert.equal(named.B, 'from file#too');
    assert.throws(
      () => loadConfiguration({ OCH_CONFIG: join(dir, 'missing.env') }),
      /does not exist/,
    );
    // Without OCH_CONFIG, nothing is read.
    const none = {};
    loadConfiguration(none);
    assert.deepEqual(none, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
