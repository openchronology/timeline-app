// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Links to files on a computer (#433): what a source may hold, how they are kept from servers,
// and the photo a moment's thumbnail shows (#440).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localFileURL,
  localFileName,
  isLocalFileLink,
  withoutLocalFiles,
  hasLocalFiles,
  sourceLinks,
  sourceLink,
  pluginMetadata,
  MOMENT_SOURCES,
  FILE_THUMBNAILS,
  localPhoto,
  pluginMarker,
  allowLocalSources,
  localSourcesAllowed,
  validatePluginManifest,
} from '../dist/core.mjs';

test('a source may be a file:/// link to this computer, and only that kind of file link', () => {
  const photo = 'file:///home/someone/Pictures/Trip%202024/IMG_0042.JPG';
  // Not in the offline file or on the platform: only the desktop app allows them, as it alone
  // can open them.
  assert.equal(localSourcesAllowed(), false);
  assert.throws(
    () => sourceLinks([photo]),
    /^Error: Use HTTPS links without embedded credentials\.$/,
  );
  assert.equal(sourceLink(photo), null);
  assert.equal(sourceLink('https://example.org/a'), 'https://example.org/a');
  assert.equal(localPhoto([photo]), null);
  allowLocalSources();
  assert.equal(localFileURL(photo), photo);
  assert.equal(localFileURL('file://localhost/C:/Photos/a.jpg'), 'file:///C:/Photos/a.jpg');
  assert.equal(localFileName(photo), 'IMG_0042.JPG');
  assert.equal(localFileName('file:///home/someone/Trip%202024/'), 'Trip 2024');
  for (const refused of [
    'file://server/share/a.jpg',
    'file://user:secret@localhost/a.jpg',
    'file:///',
    'https://example.org/a.jpg',
    'File: the report',
    'file:' + '/a'.repeat(2100),
  ])
    assert.equal(localFileURL(refused), null, refused);
  assert.deepEqual(sourceLinks(['https://example.org/a', photo]), ['https://example.org/a', photo]);
  assert.throws(() => sourceLinks(['file://server/share/a.jpg']), /file:\/\/\//);
  // The overview's projection keeps them, as it keeps HTTPS ones.
  assert.deepEqual(
    pluginMetadata([{ manifest: MOMENT_SOURCES, enabled: true }], { sources: [photo] }).sources,
    [photo],
  );
});

test('file links are left out of what a server is sent, and found anywhere in it', () => {
  assert(isLocalFileLink(' FILE:///a') && !isLocalFileLink('File: the report'));
  const document = {
    title: 'Trip',
    description: 'File: notes from the trip',
    events: [
      {
        id: 'a',
        time: '1/1',
        metadata: {
          sources: ['https://example.org', 'file:///home/someone/a.jpg'],
          stack: [{ id: 'b', metadata: { sources: ['file:///home/someone/b.jpg'] } }],
          cover: 'file:///home/someone/cover.jpg',
        },
      },
    ],
  };
  assert(hasLocalFiles(document));
  const { value, removed } = withoutLocalFiles(document);
  assert.equal(removed, 3);
  assert(!hasLocalFiles(value));
  assert.deepEqual(value.events[0].metadata, {
    sources: ['https://example.org'],
    stack: [{ id: 'b', metadata: { sources: [] } }],
  });
  assert.equal(value.description, 'File: notes from the trip');
  // Unchanged, the same value comes back; the original is never altered.
  assert.equal(document.events[0].metadata.sources.length, 2);
  const plain = { title: 'x', events: [] };
  assert.equal(withoutLocalFiles(plain).value, plain);
  assert.equal(withoutLocalFiles(plain).removed, 0);
});

test('File thumbnails marks a moment with its first photo on this computer (#440)', () => {
  const photo = 'file:///home/someone/Pictures/IMG_0042.JPG';
  const sources = [
    'https://example.org/a.jpg',
    'file:///home/someone/notes.txt',
    photo,
    'file:///home/someone/Pictures/IMG_0043.heic',
  ];
  assert.equal(localPhoto(sources), photo);
  assert.equal(localPhoto(['file:///home/someone/clip.mp4', 'https://example.org/a.jpg']), null);
  assert.equal(localPhoto('file:///a.jpg'), null, 'a list of sources');
  const plugins = [{ manifest: FILE_THUMBNAILS, enabled: true }];
  assert.equal(pluginMarker(plugins, { sources }), photo);
  assert.equal(pluginMarker(plugins, { sources: ['https://example.org/a.jpg'] }), null);
  assert.equal(pluginMarker([{ manifest: FILE_THUMBNAILS, enabled: false }], { sources }), null);
  // Overviews carry the photo the marker shows, and nothing else of the list.
  assert.deepEqual(pluginMetadata(plugins, { sources }).sources, [photo]);
  assert.deepEqual(validatePluginManifest(FILE_THUMBNAILS), FILE_THUMBNAILS);
});
