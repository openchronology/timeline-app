// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's own image (#339): validated as an HTTPS link with alt text, kept by documents,
// the editor's index, merges and the settings saves send back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TimelineIndex, validateDocument, validateTimelineImage } from '../dist/core.mjs';
import { rebaseDocument } from '../server/merge.mjs';
import { settings } from '../server/retention.mjs';
import { timelineSettings } from '../server/incremental.mjs';

const image = { url: 'https://images.example.test/rome.jpg', alt: 'The Forum' };
const doc = (extra = {}) => ({
  format: 'openchronology',
  version: 1,
  title: 'Rome',
  description: '',
  events: [{ id: 'm', time: '1/1', metadata: { title: 'Founded' } }],
  ...extra,
});

test('a timeline image is an HTTPS link with alt text, and its size when known', () => {
  assert.deepEqual(validateTimelineImage(image), image);
  assert.deepEqual(validateTimelineImage({ url: image.url }), { url: image.url, alt: '' });
  assert.deepEqual(
    validateTimelineImage({ ...image, alt: '  trimmed  ', width: 1200, height: 800 }),
    { ...image, alt: 'trimmed', width: 1200, height: 800 },
  );
  // Normalized as imageURL gives it.
  assert.equal(
    validateTimelineImage({ url: 'https://Images.Example.test/a b.png' }).url,
    'https://images.example.test/a%20b.png',
  );
  for (const bad of [
    null,
    'https://images.example.test/a.png',
    [],
    { alt: 'no link' },
    { url: 'http://images.example.test/a.png' },
    { url: 'data:image/png;base64,AAAA' },
    { url: 'javascript:alert(1)' },
    { url: 'https://user:secret@images.example.test/a.png' },
    { url: 'https://images.example.test/' + 'a'.repeat(4100) },
    { ...image, alt: 7 },
    { ...image, alt: 'x'.repeat(1001) },
    { ...image, width: 100 },
    { ...image, width: 0, height: 10 },
    { ...image, width: 1.5, height: 10 },
    { ...image, caption: 'unknown' },
  ])
    assert.throws(() => validateTimelineImage(bad), undefined, JSON.stringify(bad)?.slice(0, 80));
});

test('documents and the editor’s index keep the image; null is none', () => {
  assert.deepEqual(validateDocument(doc({ image })).image, image);
  assert.equal('image' in validateDocument(doc({ image: null })), false);
  assert.equal('image' in validateDocument(doc()), false);
  assert.throws(() => validateDocument(doc({ image: { url: 'http://x.test/a.png' } })), /HTTPS/);
  const index = new TimelineIndex(validateDocument(doc({ image })));
  assert.deepEqual(index.image, image);
  assert.deepEqual(index.document().image, image, 'An export carries it.');
  assert.equal('image' in new TimelineIndex(validateDocument(doc())).document(), false);
});

test('merges take the side that changed the image, and settings saves send it back', () => {
  const base = validateDocument(doc({ image })),
    changed = { ...image, alt: 'Changed' };
  assert.deepEqual(rebaseDocument(base, base, { ...base, image: changed }).image, changed);
  assert.deepEqual(rebaseDocument(base, { ...base, image: changed }, base).image, changed);
  const { image: _removed, ...without } = base;
  assert.equal(rebaseDocument(base, without, base).image, undefined, 'A removal merges too.');
  assert.throws(
    () =>
      rebaseDocument(
        base,
        { ...base, image: changed },
        { ...base, image: { ...image, alt: 'Other' } },
      ),
    /image/,
  );
  const row = { title: 'Rome', description: '', image, tags: null, plugins: null };
  assert.deepEqual(settings(row).image, image, 'Retention’s save keeps it.');
  assert.deepEqual(timelineSettings(row).image, image, 'A sparse save starts from it.');
});
