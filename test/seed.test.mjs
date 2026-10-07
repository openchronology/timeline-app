// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_TIMELINES,
  LEGACY_SEED_TIMELINES,
  splitWorldWarDocument,
  worldWarComparison,
  enrichSeedDocument,
  expandSeedDocument,
} from '../server/seed-data.mjs';
import { LEGACY_SEED_IDS } from '../server/seed-expansion.mjs';
import { SEED_IMAGES } from '../server/seed-images.mjs';
import {
  pluginMarker,
  pluginFields,
  pluginShape,
  pluginColor,
  pluginFocus,
  Q,
  createPresenter,
  parseTimestamp,
  printTimestamp,
  validateDocument,
} from '../dist/core.mjs';

test('seed catalog contains six valid, sourced timelines with canonical exact coordinates', () => {
  assert.equal(SEED_TIMELINES.length, 6);
  assert.equal(new Set(SEED_TIMELINES.map((t) => t.id)).size, 6);
  for (const { document } of SEED_TIMELINES) {
    assert.deepEqual(validateDocument(document), document);
    assert(document.plugins.some((p) => p.manifest.id === 'expand-on-hover' && p.enabled));
    if (document.events.some((e) => e.metadata.iconUrl))
      assert(document.plugins.some((p) => p.manifest.id === 'moment-icons' && p.enabled));
    assert.ok(document.tags.length >= 3);
    const presenter = createPresenter(document.presentation);
    for (const event of document.events) {
      assert.equal(Q.parse(event.time).toString(), event.time);
      assert.ok(event.metadata.title);
      assert.ok(event.metadata.datePrecision);
      assert.ok(event.metadata.sources.every((url) => new URL(url).protocol === 'https:'));
      assert.ok(presenter.print(Q.parse(event.time)));
    }
  }
});
test('1453 Julian dates use equivalent Gregorian day markers', () => {
  const events = SEED_TIMELINES[1].document.events;
  const first = events.find((e) => e.id === 'siege-begins'),
    last = events.find((e) => e.id === 'city-falls');
  assert.equal(printTimestamp(Q.parse(last.time)), '1453-06-07T00:00:00Z');
  assert.equal(last.metadata.historicalDate, '1453-05-29');
  assert.equal(Q.parse(last.time).sub(Q.parse(first.time)).toString(), '4579200/1');
  for (const event of events) {
    assert.equal(
      Q.parse(event.time)
        .sub(parseTimestamp(event.metadata.historicalDate + 'T00:00:00Z'))
        .toString(),
      '777600/1',
    );
    assert.equal(event.metadata.calendar, 'Julian');
  }
});

test('seed official plugins expose every annotation and apply semantic styling and hover cards', () => {
  for (const { document } of SEED_TIMELINES) {
    const fields = new Set(pluginFields(document.plugins).map((f) => f.metadataKey));
    assert(pluginFocus(document.plugins));
    for (const event of document.events) {
      for (const key of Object.keys(event.metadata))
        if (!['title', 'description'].includes(key))
          assert(fields.has(key), `Missing field for ${key}`);
      assert.equal(pluginShape(document.plugins, event.metadata), event.metadata.shape);
      assert.equal(pluginColor(document.plugins, event.metadata), event.metadata.color);
    }
  }
});
test('existing seed enrichment preserves edits, removals, custom plugins and chosen styles', () => {
  const template = SEED_TIMELINES[0].document;
  const current = structuredClone(template);
  current.title = 'Curated dinosaurs';
  current.description = 'My notes';
  current.tags = ['curated'];
  current.plugins = [{ ...template.plugins.at(-1), enabled: false }];
  current.events.pop(); // removed seed moment must stay removed
  current.events[0].time = '-100/3';
  current.events[0].metadata.title = 'Edited title';
  current.events[0].metadata.color = '#123456';
  delete current.events[0].metadata.shape;
  current.events.push({ id: 'custom', time: '0/1', metadata: { title: 'Custom' } });
  const before = structuredClone(current);
  const result = enrichSeedDocument(current, template);
  assert.deepEqual(current, before);
  assert.equal(result.title, current.title);
  assert.equal(result.description, current.description);
  assert.deepEqual(result.tags, current.tags);
  assert.deepEqual(
    result.events.map((e) => e.id),
    current.events.map((e) => e.id),
  );
  assert.equal(result.events[0].time, '-100/3');
  assert.equal(result.events[0].metadata.title, 'Edited title');
  assert.equal(result.events[0].metadata.color, '#123456');
  assert.equal(result.events[0].metadata.shape, 'diamond');
  assert.deepEqual(result.events.at(-1), current.events.at(-1));
  assert.equal(result.plugins[0].enabled, false);
  assert.deepEqual(enrichSeedDocument(result, template), result);
});

test('expanded examples contain substantial ordered content and credited public icons', () => {
  for (const { document } of SEED_TIMELINES) {
    if (document.comparison) {
      assert.equal(document.events.length, 0);
      continue;
    }
    assert(document.events.length >= 11);
    assert(document.plugins.some((p) => p.manifest.id === 'moment-icons' && p.enabled));
    const icons = document.events.filter((e) => e.metadata.iconUrl);
    assert(icons.length >= (document.title.includes('Campaign') ? 1 : 3));
    for (const point of icons) {
      assert.equal(new URL(point.metadata.iconUrl).hostname, 'thumb.wikimedia.org');
      assert.equal(pluginMarker(document.plugins, point.metadata), point.metadata.iconUrl);
      assert(point.metadata.description.includes('Image:'));
      assert(
        point.metadata.sources.some((s) =>
          s.startsWith('https://commons.wikimedia.org/wiki/File:'),
        ),
      );
    }
    for (let i = 1; i < document.events.length; i++)
      assert(Q.parse(document.events[i - 1].time).compare(Q.parse(document.events[i].time)) <= 0);
  }
  assert.equal(Object.keys(SEED_IMAGES).length, 11);
});
test('content upgrade adds new IDs once and preserves deleted legacy moments, edits and icon settings', () => {
  const template = SEED_TIMELINES[1].document;
  const current = structuredClone(template);
  current.events = current.events.filter(
    (e) => LEGACY_SEED_IDS[1].includes(e.id) && e.id !== 'golden-horn',
  );
  current.plugins = current.plugins.filter((p) => p.manifest.id !== 'moment-icons');
  const first = current.events.find((e) => e.id === 'siege-begins');
  first.time = '1/7';
  first.metadata.title = 'My title';
  first.metadata.description = 'My notes';
  first.metadata.sources = ['https://example.org/custom'];
  delete first.metadata.iconUrl;
  const last = current.events.find((e) => e.id === 'city-falls');
  last.metadata.iconUrl = ''; // deliberate removal
  current.events.push({ id: 'my-event', time: '2/7', metadata: { title: 'My event' } });
  current.title = 'My siege';
  current.tags = ['custom'];
  const before = structuredClone(current);
  const expanded = expandSeedDocument(current, template, 1);
  assert.deepEqual(current, before);
  assert.equal(expanded.title, 'My siege');
  assert.deepEqual(expanded.tags, ['custom']);
  assert(!expanded.events.some((e) => e.id === 'golden-horn'));
  assert(expanded.events.some((e) => e.id === 'fireships'));
  assert.deepEqual(
    expanded.events.find((e) => e.id === 'my-event'),
    current.events.at(-1),
  );
  const edited = expanded.events.find((e) => e.id === 'siege-begins');
  assert.equal(edited.time, '1/7');
  assert.equal(edited.metadata.title, 'My title');
  assert(edited.metadata.description.startsWith('My notes'));
  assert(edited.metadata.sources.includes('https://example.org/custom'));
  assert.equal(expanded.events.find((e) => e.id === 'city-falls').metadata.iconUrl, '');
  assert.deepEqual(expandSeedDocument(expanded, template, 1), expanded);
});

test('WWII comparison references two public campaign documents without copying moments', () => {
  const composite = SEED_TIMELINES[2].document;
  assert.deepEqual(
    composite.comparison.sources,
    SEED_TIMELINES.slice(4).map((t) => t.id),
  );
  assert.equal(composite.comparison.combined, false);
  const events = SEED_TIMELINES.slice(4).flatMap((t) => t.document.events);
  assert.equal(events.length, 40);
  assert.equal(new Set(events.map((e) => e.id)).size, 40);
  assert.deepEqual(
    [...events].sort((a, b) => a.id.localeCompare(b.id)),
    [...LEGACY_SEED_TIMELINES[2].document.events].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert(SEED_TIMELINES[4].document.events.some((e) => e.id === 'd-day'));
  assert(SEED_TIMELINES[5].document.events.some((e) => e.id === 'pearl-harbor'));
  const edited = structuredClone(LEGACY_SEED_TIMELINES[2].document);
  edited.description = 'Curator timeline notes';
  edited.events = edited.events.filter((e) => e.id !== 'd-day');
  edited.events[0].metadata.description = 'Curated notes';
  edited.events.push({
    id: 'custom-pacific',
    time: '1/7',
    metadata: { campaign: 'pacific', title: 'Custom' },
  });
  const split = splitWorldWarDocument(edited);
  assert(!split.flatMap((d) => d.events).some((e) => e.id === 'd-day'));
  assert(split[1].events.some((e) => e.id === 'custom-pacific'));
  assert.deepEqual(
    split.flatMap((d) => d.events).find((e) => e.id === edited.events[0].id),
    edited.events[0],
  );
  assert.equal(worldWarComparison(edited).events.length, 0);
  assert(worldWarComparison(edited).description.startsWith(edited.description));
  assert(split.every((d) => d.description.startsWith(edited.description)));
});
test('saved comparison definitions survive validation and reject duplicates, invalid IDs and materialized events', () => {
  const doc = SEED_TIMELINES[2].document;
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.throws(
    () => validateDocument({ ...doc, events: [LEGACY_SEED_TIMELINES[2].document.events[0]] }),
    /instead of storing events/,
  );
  for (const sources of [
    [],
    [doc.comparison.sources[0], doc.comparison.sources[0]],
    ['bad', 'bad2'],
  ])
    assert.throws(() => validateDocument({ ...doc, comparison: { sources, combined: false } }));
});
