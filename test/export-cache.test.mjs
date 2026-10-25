// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The export cache's parts that need no database (#204): its settings, the S3 signature,
// byte ranges, and the disk and S3 backends' addressing. Its database behaviour is in
// export-cache-postgres.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  byteRange,
  DEFAULT_CACHE_BYTES,
  DiskBackend,
  ExportCacheError,
  exportCacheFromEnv,
  exportCacheSettings,
  S3Backend,
  signatureV4,
} from '../server/export-cache.mjs';

test('the export cache is off unless a directory or a backend is configured', () => {
  assert.equal(exportCacheSettings({}), null);
  assert.equal(exportCacheSettings({ EXPORT_CACHE: 'off', EXPORT_CACHE_DIR: '/x' }), null);
  assert.equal(exportCacheFromEnv({ pool: null, env: { EXPORT_CACHE_DIR: '/x' } }), null);
  // A directory alone turns it on, as does systemd's CacheDirectory.
  assert.deepEqual(exportCacheSettings({ EXPORT_CACHE_DIR: '/srv/cache' }), {
    mode: 'disk',
    dir: '/srv/cache',
    maxBytes: DEFAULT_CACHE_BYTES,
    publicUrl: null,
  });
  assert.equal(
    exportCacheSettings({ CACHE_DIRECTORY: '/var/cache/openchronology' }).dir,
    '/var/cache/openchronology/exports',
  );
  const settings = exportCacheSettings({
    EXPORT_CACHE: 'disk',
    EXPORT_CACHE_DIR: '/srv/cache',
    EXPORT_CACHE_MAX_BYTES: '10GB',
    EXPORT_CACHE_PUBLIC_URL: 'https://files.example.test/och/',
  });
  assert.equal(settings.maxBytes, 10_000_000_000);
  assert.equal(settings.publicUrl, 'https://files.example.test/och');
});

test('export cache settings it cannot use are refused with the setting named', () => {
  const refused = (env, pattern) =>
    assert.throws(
      () => exportCacheSettings(env),
      (e) => e instanceof ExportCacheError && pattern.test(e.message),
    );
  refused({ EXPORT_CACHE: 'ftp' }, /off, disk or s3/);
  refused({ EXPORT_CACHE: 'disk' }, /EXPORT_CACHE_DIR/);
  refused({ EXPORT_CACHE_DIR: '/x', EXPORT_CACHE_MAX_BYTES: 'lots' }, /EXPORT_CACHE_MAX_BYTES/);
  refused({ EXPORT_CACHE_DIR: '/x', EXPORT_CACHE_MAX_BYTES: '1000' }, /at least 1MiB/);
  refused({ EXPORT_CACHE_DIR: '/x', EXPORT_CACHE_PUBLIC_URL: 'ftp://x' }, /PUBLIC_URL/);
  refused({ EXPORT_CACHE: 's3' }, /EXPORT_CACHE_S3_ENDPOINT/);
  refused(
    {
      EXPORT_CACHE: 's3',
      EXPORT_CACHE_S3_ENDPOINT: 'https://s3.example.test',
      EXPORT_CACHE_S3_BUCKET: 'b',
      EXPORT_CACHE_S3_ACCESS_KEY_ID: 'k',
    },
    /SECRET_ACCESS_KEY/,
  );
  const s3 = exportCacheSettings({
    EXPORT_CACHE: 's3',
    EXPORT_CACHE_S3_ENDPOINT: 'https://s3.example.test/',
    EXPORT_CACHE_S3_BUCKET: 'b',
    EXPORT_CACHE_S3_PREFIX: '/exports/',
    EXPORT_CACHE_S3_ACCESS_KEY_ID: 'k',
    EXPORT_CACHE_S3_SECRET_ACCESS_KEY: 's',
  });
  assert.equal(s3.s3.endpoint, 'https://s3.example.test');
  assert.equal(s3.s3.prefix, 'exports/');
  assert.equal(s3.s3.region, 'us-east-1');
  assert.equal(s3.s3.pathStyle, true);
});

test('Signature Version 4 matches the AWS test suite (get-vanilla)', () => {
  // https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html
  const date = '20150830T123600Z';
  assert.equal(
    signatureV4({
      method: 'GET',
      path: '/',
      headers: { Host: 'example.amazonaws.com', 'X-Amz-Date': date },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1',
      service: 'service',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      date,
    }),
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  );
});

test('byte ranges: one range, suffixes and open ends; others whole; past the end refused', () => {
  assert.deepEqual(byteRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(byteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=-1000', 100), { start: 0, end: 99 });
  assert.deepEqual(byteRange('bytes=50-1000', 100), { start: 50, end: 99 });
  assert.equal(byteRange(undefined, 100), null);
  assert.equal(byteRange('bytes=0-1,5-6', 100), null);
  assert.equal(byteRange('items=0-1', 100), null);
  assert.equal(byteRange('bytes=100-', 100), false);
  assert.equal(byteRange('bytes=9-3', 100), false);
  assert.equal(byteRange('bytes=-0', 100), false);
});

test('the disk backend stores a staged file in a folder per entry and removes it whole', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'och-disk-backend-'));
  try {
    const disk = new DiskBackend(dir);
    await disk.prepare();
    const staged = join(dir, 'staged');
    await writeFile(staged, 'hello, cache');
    const object = 'a'.repeat(32) + '/timeline.ochx';
    await disk.put(object, staged);
    assert.equal(
      await readFile(join(dir, 'a'.repeat(32), 'timeline.ochx'), 'utf8'),
      'hello, cache',
    );
    let text = '';
    for await (const part of await disk.read(object, 7, 11)) text += part;
    assert.equal(text, 'cache');
    assert.deepEqual(
      (await disk.folders()).map((f) => f.name),
      ['a'.repeat(32)],
    );
    await disk.remove(object);
    assert.deepEqual(await readdir(dir), []);
    assert.equal(await disk.read(object, 0, 1), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the S3 backend addresses objects under its prefix, in the path or as a host name', () => {
  const options = {
    endpoint: 'https://s3.example.test',
    region: 'auto',
    bucket: 'cache',
    prefix: 'och/',
    accessKeyId: 'k',
    secretAccessKey: 's',
  };
  const object = 'f'.repeat(32) + '/my timeline.ochx';
  assert.deepEqual(new S3Backend(options).target(object), {
    host: 's3.example.test',
    path: `/cache/och/${'f'.repeat(32)}/my%20timeline.ochx`,
  });
  assert.deepEqual(new S3Backend({ ...options, pathStyle: false }).target(object), {
    host: 'cache.s3.example.test',
    path: `/och/${'f'.repeat(32)}/my%20timeline.ochx`,
  });
  assert.equal(new S3Backend(options).key(object), 'och/' + object);
});
