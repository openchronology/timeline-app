// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures' balances (#595) in the editor's index: summaries' totals partition the window, each
// change counted once at the time it applies (a duration's at its start or end, as its measure
// says), and balances before and after the window, and after each summary, match an anchor
// plus the changes summed by hand, through edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  Viewport,
  validateDocument,
  validateMeasures,
  viewBalances,
} from '../dist/core.mjs';
import { regroup } from '../dist/remote-cache.mjs';

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const q = (t) => Q.parse(t.includes('/') ? t : t + '/1');
const text = (v) => (v.denominator === 1n ? v.numerator.toString() : v.toString());
const MEASURES = {
  cost: { type: 'mpz' },
  fee: { type: 'mpz', durations: 'end', balance: { at: 'end', value: '1000' } },
  bank: { type: 'mpq', balance: { at: 'start', value: '5/2' } },
  level: { type: 'mpz', durations: 'end', balance: { at: '400', value: '-7' } },
};

test('declarations: durations at start or end, and a balance at start, end or a time', () => {
  assert.deepEqual(validateMeasures(MEASURES), {
    bank: { type: 'mpq', balance: { at: 'start', value: '5/2' } },
    cost: { type: 'mpz' },
    fee: { type: 'mpz', durations: 'end', balance: { at: 'end', value: '1000' } },
    level: { type: 'mpz', durations: 'end', balance: { at: '400/1', value: '-7' } },
  });
  // At the start is the default, and isn't kept.
  assert.deepEqual(validateMeasures({ n: { type: 'mpz', durations: 'start' } }).n, { type: 'mpz' });
  for (const bad of [
    { type: 'mpz', durations: 'middle' },
    { type: 'mpz', balance: { at: 'start' } },
    { type: 'mpz', balance: { at: 'start', value: '1/2' } },
    { type: 'mpz', balance: { at: 'later', value: '1' } },
    { type: 'mpz', balance: { at: 'start', value: '1', when: 'x' } },
  ])
    assert.throws(() => validateMeasures({ n: bad }), undefined, JSON.stringify(bad));
});

test('totals partition the window and balances follow the changes, through edits', () => {
  const rand = random(595);
  const values = () => {
    const v = {};
    for (const name of ['cost', 'fee', 'level'])
      if (rand() < 0.6) v[name] = String(Math.floor(rand() * 400) - 150 || 1);
    if (rand() < 0.5) v.bank = `${Math.floor(rand() * 9) + 1}/${Math.floor(rand() * 3) + 2}`;
    return v;
  };
  const events = Array.from({ length: 70 }, (_, i) => ({
    id: 'm' + i,
    time: `${Math.floor(rand() * 800)}/1`,
    metadata: { measures: values() },
  }));
  const durations = Array.from({ length: 60 }, (_, i) => {
    const start = Math.floor(rand() * 800);
    const r = rand();
    return {
      id: 'd' + i,
      start: `${start}/1`,
      // Some end where a moment is (and move with it), some are short, some long.
      end:
        r < 0.2
          ? { moment: 'm' + (i % 70) }
          : `${start + (r < 0.6 ? Math.floor(rand() * 5) : 50 + Math.floor(rand() * 300))}/1`,
      metadata: { measures: values() },
    };
  }).filter(
    (d) =>
      typeof d.end === 'string' ||
      q(events[Number(d.end.moment.slice(1))].time).compare(q(d.start)) >= 0,
  );
  const index = new TimelineIndex(
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Ledger',
      description: '',
      measures: MEASURES,
      events,
      durations,
    }),
  );
  /** Every change as [time, name, value], each where it applies. */
  const changes = () => {
    const out = [];
    for (const e of index.byId.values())
      for (const [n, v] of Object.entries(e.metadata.measures ?? {}))
        out.push([q(e.time), n, q(v)]);
    for (const d of index.durations.values()) {
      const time = (end) => (typeof end === 'string' ? q(end) : q(index.momentTime(end.moment)));
      // A duration runs from its earlier end to its later, whichever was given first.
      const [first, last] = [time(d.start), time(d.end)].sort((a, b) => a.compare(b));
      for (const [n, v] of Object.entries(d.metadata.measures ?? {}))
        out.push([MEASURES[n].durations === 'end' ? last : first, n, q(v)]);
    }
    return out;
  };
  const prefix = (all, name, t, inclusive) =>
    all
      .filter(
        ([time, n]) =>
          n === name &&
          (t === undefined || (inclusive ? time.compare(t) <= 0 : time.compare(t) < 0)),
      )
      .reduce((s, [, , v]) => s.add(v), Q.zero);
  const balance = (all, name, t, inclusive) => {
    const { at, value } = MEASURES[name].balance;
    const anchor =
      at === 'start' ? Q.zero : at === 'end' ? prefix(all, name) : prefix(all, name, q(at), true);
    return text(
      q(value)
        .sub(anchor)
        .add(prefix(all, name, t, inclusive)),
    );
  };
  const check = (label) => {
    const all = changes();
    for (const [left, right] of [
      ['-10', '900'],
      ['100', '300'],
      ['250', '260'],
      ['0', '799'],
    ])
      for (const width of [30, 300, 2000]) {
        const viewport = new Viewport(q(left), q(right).sub(q(left)));
        const frame = index.frame(viewport, width);
        const at = `${label} ${left}..${right} at ${width}`;
        // Every change in the window counted once, across the summaries.
        for (const name of Object.keys(MEASURES)) {
          const inWindow = all
            .filter(
              ([t, n]) =>
                n === name && t.compare(viewport.left) >= 0 && t.compare(viewport.right) <= 0,
            )
            .reduce((s, [, , v]) => s.add(v), Q.zero);
          const summed = frame.groups.reduce((s, g) => s.add(q(g.totals?.[name] ?? '0')), Q.zero);
          if (frame.groups.length)
            assert.equal(text(summed), text(inWindow), `${at}: ${name} totals`);
        }
        for (const name of ['fee', 'bank', 'level']) {
          assert.equal(
            frame.balances[name].before,
            balance(all, name, viewport.left, false),
            `${at}: ${name} before`,
          );
          assert.equal(
            frame.balances[name].after,
            balance(all, name, viewport.right, true),
            `${at}: ${name} after`,
          );
          let running = q(frame.balances[name].before);
          for (const g of frame.groups) {
            running = running.add(q(g.totals?.[name] ?? '0'));
            assert.equal(g.balanceAfter[name], text(running), `${at}: ${name} after a summary`);
          }
          if (frame.groups.length)
            assert.equal(text(running), frame.balances[name].after, `${at}: ${name} ends`);
          // Summaries the editor merges when they draw too close (regroup, coalesceGroups)
          // keep the running balance: the later one's after.
          for (const coarse of [q('5'), q('50'), q('400')]) {
            const merged = regroup(frame, coarse).groups;
            let running = q(frame.balances[name].before);
            for (const g of merged) {
              running = running.add(q(g.totals?.[name] ?? '0'));
              assert.equal(
                g.balanceAfter?.[name],
                text(running),
                `${at} merged within ${text(coarse)}: ${name} after a summary`,
              );
            }
          }
        }
        assert(
          frame.groups.every((g) => !g.balanceAfter || !('cost' in g.balanceAfter)),
          'only anchored measures',
        );
        // A narrower view shown from this window (as a server's or cached window is): from a
        // summary's first time, its balance before is exact; to the window's end, its after.
        for (let k = 1; k < frame.groups.length; k += Math.max(1, frame.groups.length >> 2)) {
          const l = q(frame.groups[k].first);
          if (l.compare(viewport.left) <= 0) continue;
          const shown = viewBalances(frame.groups, frame.balances, l, viewport.right);
          for (const name of ['fee', 'bank', 'level']) {
            assert.equal(
              shown[name].before,
              balance(all, name, l, false),
              `${at} from ${k}: ${name} before`,
            );
            assert.equal(
              shown[name].after,
              frame.balances[name].after,
              `${at} from ${k}: ${name} after`,
            );
          }
        }
      }
  };
  check('built');
  for (let step = 0; step < 40; step++) {
    const ids = [...index.byId.keys()];
    const event = index.byId.get(ids[Math.floor(rand() * ids.length)]);
    // Moved, so durations ending there move with it, or revalued.
    index.put({
      ...event,
      time: `${Math.floor(rand() * 800)}/1`,
      metadata: { measures: values() },
    });
    const dIds = [...index.durations.keys()];
    const d = index.durations.get(dIds[Math.floor(rand() * dIds.length)]);
    if (typeof d.end === 'string') index.putDuration({ ...d, metadata: { measures: values() } });
  }
  check('after edits');
});

test('an ongoing duration counted at its end applies nothing yet', () => {
  const index = new TimelineIndex(
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Ongoing',
      description: '',
      presentation: {
        version: 1,
        mode: 'gregorian',
        significantDigits: 6,
        unit: '',
        scale: '1/1',
        origin: '0/1',
        offsetMinutes: 0,
      },
      measures: {
        fee: { type: 'mpz', durations: 'end', balance: { at: 'start', value: '0' } },
        cost: { type: 'mpz', balance: { at: 'start', value: '0' } },
      },
      events: [],
      durations: [
        {
          id: 'job',
          start: '100/1',
          end: { ongoing: true },
          metadata: { measures: { fee: '9', cost: '4' } },
        },
      ],
    }),
  );
  index.clock = () => 1_000_000;
  const frame = index.frame(new Viewport(q('0'), q('2000')), 300);
  assert.equal(frame.balances.fee.after, '0');
  // Counted at its start, it has applied: in a window with no summary to carry it, its
  // balance shows it.
  assert.equal(frame.balances.cost.after, '4');
});
