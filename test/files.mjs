// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { TimelineFiles } from '../server/files.mjs';
import {
  validateDocument,
  DEFAULT_PRESENTATION,
  MOMENT_ICONS,
  RICH_TEXT_NOTES,
  MOMENT_STACKS,
  MOMENT_COLORS,
  FOCUS_ON_HOVER,
  MOMENT_SHAPES,
  PLUGIN_EXAMPLE,
  validatePluginManifest,
} from '../dist/core.mjs';
const converter = new TimelineFiles();
assert(converter.enabled, 'Build och-convert and set OCH_CONVERTER before running this test.');
const document = validateDocument({
  format: 'openchronology',
  version: 1,
  title: 'Exact exchange',
  plugins: [
    { manifest: MOMENT_ICONS, enabled: true },
    { manifest: RICH_TEXT_NOTES, enabled: true },
    { manifest: MOMENT_STACKS, enabled: true },
    { manifest: MOMENT_COLORS, enabled: true },
    { manifest: FOCUS_ON_HOVER, enabled: true },
    { manifest: MOMENT_SHAPES, enabled: true },
    { manifest: validatePluginManifest(PLUGIN_EXAMPLE), enabled: true },
  ],
  description: '',
  tags: ['offline', 'modded'],
  assets: { 'https://images.example/icon.png': 'data:image/png;base64,aGVsbG8=' },
  presentation: {
    ...DEFAULT_PRESENTATION,
    mode: 'custom',
    source:
      'function print(time, api) { return api.exact(time) + " ticks"; } function parse(text, api) { return api.rational(api.stripSuffix(text, " ticks")); }',
    ruler: { kind: 'steps', steps: ['1/1', '60/1', '3600/1'] },
  },
  events: [
    {
      id: 'a',
      time: '-1/3',
      metadata: {
        title: 'Before',
        description: '**Rich notes** with [source](https://example.org/history)',
        sources: ['https://example.org/history'],
        iconUrl: 'https://images.example/icon.png',
        color: '#cb4545',
        nested: { value: true },
        durations: [
          {
            id: 'linked',
            endId: 'c',
            metadata: { title: 'Exchange band', description: 'Retained duration metadata' },
          },
        ],
        stack: [
          {
            id: 'child',
            metadata: {
              title: 'Inherited moment',
              description: '## Stack notes\n\n*Inherited rich notes*',
              iconUrl: 'https://images.example/child.png',
              custom: { flag: true },
            },
          },
        ],
      },
    },
    { id: 'b', time: '1/' + '9'.repeat(1000), metadata: { title: 'Tiny' } },
    { id: 'c', time: '1/3', metadata: { title: 'Exact' } },
    { id: 'd', time: '1/3', metadata: { title: 'Coincident' } },
  ],
});
const bytes = await converter.convert('write', document);
assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0');
assert.deepEqual(await converter.convert('read', bytes), document);
for (const input of [
  Buffer.from('not sqlite'),
  Buffer.from('SQLite format 3\0garbage'),
  Buffer.alloc(32 * 1024 * 1024 + 1),
])
  await assert.rejects(converter.convert('read', input), (error) => error.status === 400);
await assert.rejects(
  converter.convert('write', { ...document, events: [{ id: 'bad', time: '1/0', metadata: {} }] }),
  (error) => error.status === 400,
);
assert.equal(converter.active, 0);
const unavailable = new TimelineFiles('/nonexistent/och-convert');
await assert.rejects(unavailable.convert('read', bytes), (error) => error.status === 503);
console.log(
  'PASS SQLite server conversion: exact round-trips, presentation, coincident events, corrupt/oversized uploads, invalid rationals, cleanup.',
);

// Exercise the HTTP boundary in-process, so this also runs without permission to bind sockets.
const { Readable } = await import('node:stream');
const { createApplication } = await import('../server/http.mjs');
const token = 'a'.repeat(64),
  csrf = 'b'.repeat(64);
const pool = {
  async query(sql) {
    if (sql.startsWith('SELECT s.csrf'))
      return { rows: [{ id: 'user', username: 'user', csrf, token_hash: 'hash', kind: 'web' }] };
    if (sql.startsWith('UPDATE oc_sessions') || sql.startsWith('DELETE FROM oc_auth_attempts'))
      return { rows: [] };
    if (sql.startsWith('INSERT INTO oc_auth_attempts')) return { rows: [{ count: 1 }] };
    throw new Error('Unexpected file route storage operation ' + sql);
  },
};
const app = createApplication({ pool, converter, providers: {} });
async function call(path, input, mime, headers = {}) {
  const req = Readable.from([input]);
  Object.assign(req, {
    url: '/api/' + path,
    method: 'POST',
    headers: { 'content-type': mime, ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  });
  return new Promise((resolve, reject) => {
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      writeHead(status, headers) {
        this.status = status;
        Object.assign(this.headers, headers);
      },
      end(bytes) {
        resolve({
          status: this.status,
          headers: this.headers,
          body: this.headers['Content-Type'].startsWith('application/json')
            ? JSON.parse(bytes)
            : bytes,
        });
      },
    };
    app.listeners('request')[0](req, res).catch(reject);
  });
}
const headers = { cookie: 'oc_session=' + token, 'x-csrf-token': csrf };
assert.equal(
  (await call('files/export', Buffer.from(JSON.stringify(document)), 'application/json')).status,
  401,
);
assert.equal(
  (
    await call('files/export', Buffer.from(JSON.stringify(document)), 'application/json', {
      cookie: headers.cookie,
    })
  ).status,
  403,
);
assert.equal(
  (
    await call('files/export', Buffer.from(JSON.stringify(document)), 'application/json', {
      ...headers,
      origin: 'https://attacker.example',
    })
  ).status,
  403,
);
const download = await call(
  'files/export',
  Buffer.from(JSON.stringify(document)),
  'application/json',
  headers,
);
assert.equal(download.status, 200);
assert.match(download.headers['Content-Disposition'], /filename="timeline\.och"/);
const upload = await call(
  'files/import',
  download.body,
  'application/vnd.openchronology.sqlite',
  headers,
);
assert.equal(upload.status, 200);
assert.deepEqual(upload.body.document, document);
assert.equal((await call('files/import', download.body, 'application/json', headers)).status, 415);
assert.equal(
  (
    await call(
      'files/import',
      Buffer.alloc(32 * 1024 * 1024 + 1),
      'application/octet-stream',
      headers,
    )
  ).status,
  413,
);
assert.equal(converter.active, 0);
console.log(
  'PASS file HTTP: authenticated import/export, CSRF, foreign origins, media types, byte limits and .och attachment.',
);
