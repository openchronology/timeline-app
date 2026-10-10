// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TimelineIndex,
  validateDocument,
  draftWrites,
  allDraftWrites,
  draftSettings,
  draftDocument,
  DRAFT_STORES,
} from '../dist/core.mjs';

let seed = 40;
const random = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor((seed / 2147483648) * n);
};
const pick = (list) => list[random(list.length)];
/** An in-memory stand-in for the editor's IndexedDB stores. */
class Store {
  stores = Object.fromEntries(DRAFT_STORES.map((name) => [name, new Map()]));
  settings = null;
  assets = undefined;
  apply(index, writes, full) {
    if (full) for (const store of Object.values(this.stores)) store.clear();
    for (const { store, key, value } of writes) {
      if (value === undefined) this.stores[store].delete(key);
      // IndexedDB stores structured clones, not the index's frozen objects.
      else this.stores[store].set(key, structuredClone(value));
    }
    this.settings = structuredClone(draftSettings(index));
    this.assets = index.assets === undefined ? undefined : structuredClone(index.assets);
    return writes.length;
  }
  document() {
    const s = this.stores;
    return draftDocument({
      settings: this.settings,
      ...(this.assets === undefined ? {} : { assets: this.assets }),
      moments: [...s['draft-moments'].values()],
      durations: [...s['draft-durations'].values()],
      links: [...s['draft-links'].values()],
      retired: [...s['draft-retired']],
    });
  }
}
const start = () =>
  validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Drafts',
    description: '',
    events: Array.from({ length: 60 }, (_, i) => ({
      id: 'm' + i,
      time: `${random(200)}/${1 + random(3)}`,
      metadata: { title: 'Moment ' + i },
    })),
    durations: Array.from({ length: 12 }, (_, i) => ({
      id: 'd' + i,
      start: i % 3 ? `${i}/1` : { moment: 'm' + i },
      end: i % 4 ? `${i + 30}/1` : { moment: 'm' + (i + 20) },
      metadata: { title: 'Span ' + i },
    })),
    relationships: Array.from({ length: 15 }, (_, i) => ({
      a: { moment: 'm' + i },
      b: i % 2 ? { moment: 'm' + (i + 30) } : { duration: 'd' + (i % 12) },
    })),
  });
/** One random editor operation through the index's own methods. */
function edit(index, step) {
  const moments = [...index.byId.keys()],
    durations = [...index.durations.keys()];
  switch (random(9)) {
    case 0: {
      const e = index.byId.get(pick(moments));
      index.put({ ...e, metadata: { ...e.metadata, title: `Renamed ${step}` } });
      break;
    }
    case 1: {
      const e = index.byId.get(pick(moments));
      index.put({ ...e, time: `${random(300)}/1` });
      break;
    }
    case 2:
      // Deleting keeps anchored durations at the moment's last time and hides its links.
      if (moments.length > 10) index.delete(pick(moments));
      break;
    case 3:
      index.put({ id: `n${step}`, time: `${random(300)}/4`, metadata: { title: 'New' } });
      break;
    case 4: {
      // Undoing a deletion: the moment comes back and its anchors and links follow it again.
      const gone = index.retiredTimes();
      if (gone.length) {
        const [id, time] = pick(gone);
        index.put({ id, time, metadata: { title: 'Restored ' + id } });
      }
      break;
    }
    case 5:
      index.putDuration({
        id: random(2) && durations.length ? pick(durations) : `x${step}`,
        start: random(2) ? { moment: pick(moments) } : `${random(100)}/1`,
        end: `${100 + random(100)}/1`,
        metadata: { title: `Span ${step}` },
      });
      break;
    case 6:
      if (durations.length) index.deleteDuration(pick(durations));
      break;
    case 7: {
      const a = { moment: pick(moments) },
        b =
          random(2) && durations.length ? { duration: pick(durations) } : { moment: pick(moments) };
      if (JSON.stringify(a) !== JSON.stringify(b))
        random(3) ? index.relate(a, b) : index.unrelate(a, b);
      break;
    }
    default:
      index.title = `Drafts ${step}`;
      if (step % 5 === 0)
        index.assets = { [`https://img/${step}.png`]: 'data:image/png;base64,AA' };
  }
}
test('saving only journalled records restores exactly the document the index exports', () => {
  let index = new TimelineIndex(start());
  const store = new Store();
  // The first save of a timeline writes every record.
  index.takeChanges();
  store.apply(index, allDraftWrites(index), true);
  assert.deepEqual(store.document(), index.document());
  let written = 0,
    saves = 0;
  for (let step = 1; step <= 400; step++) {
    for (let i = 0, n = 1 + random(4); i < n; i++) edit(index, step * 10 + i);
    if (random(3)) continue; // several edits can share one save
    written += store.apply(index, draftWrites(index, index.takeChanges()), false);
    saves++;
    assert.deepEqual(store.document(), index.document(), `after step ${step}`);
    if (step % 100 === 0) {
      // Opening another timeline rewrites the draft.
      index = new TimelineIndex(index.document());
      store.apply(index, allDraftWrites(index), true);
      assert.deepEqual(store.document(), index.document());
    }
  }
  // Each save wrote a handful of records, not the timeline.
  assert(written / saves < 12, `${written / saves} records per save`);
});
test('the journal names each changed entity once and empties when taken', () => {
  const index = new TimelineIndex(start());
  index.takeChanges();
  index.put({ id: 'm1', time: '5/1', metadata: {} });
  index.put({ id: 'm1', time: '6/1', metadata: {} });
  index.delete('m2');
  index.relate({ moment: 'm3' }, { moment: 'm4' });
  index.deleteDuration('d1');
  assert.deepEqual(index.takeChanges().sort(), ['d:d1', 'l:m:m3~m:m4', 'm:m1', 'm:m2', 'r:m2']);
  assert.deepEqual(index.takeChanges(), []);
});
