// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures (#572): declarations and values validated and normalized in documents, sparse saves
// and drafts, and the rewrites a change of declarations makes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TimelineIndex,
  validateDocument,
  validateDuration,
  validateMeasures,
  validateMeasureValues,
  measureChart,
  measureColor,
  MEASURE_COLORS,
  validateMeasureRenames,
  measuresCompatible,
  measureValue,
  remeasuredEntities,
  parseMeasureValue,
  setTimeDigitLimit,
  timeDigitLimit,
  draftSettings,
  draftDocument,
  parseTime,
} from '../dist/core.mjs';
import { rebaseDocument } from '../server/merge.mjs';

const MEASURES = { cost: { type: 'mpz', label: 'Cost' }, hours: { type: 'mpq' } };
const doc = (measures, events, durations) => ({
  format: 'openchronology',
  version: 1,
  title: 'Invoices',
  description: '',
  ...(measures === undefined ? {} : { measures }),
  events,
  ...(durations ? { durations } : {}),
});
const moment = (id, measures) => ({
  id,
  time: '1/1',
  metadata: { title: id, ...(measures === undefined ? {} : { measures }) },
});

test('declarations: names, types and labels, bounded', () => {
  assert.deepEqual(
    validateMeasures({ hours: { type: 'mpq' }, cost: { type: 'mpz', label: ' Cost ' } }),
    {
      cost: { type: 'mpz', label: 'Cost' },
      hours: { type: 'mpq' },
    },
  );
  for (const bad of [
    [],
    { Cost: { type: 'mpz' } },
    { '1st': { type: 'mpz' } },
    { cost: { type: 'f64' } },
    { cost: { type: 'mpz', unit: '$' } },
    { cost: { type: 'mpz', label: '' } },
    { cost: 'mpz' },
    Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['m' + i, { type: 'mpz' }])),
  ])
    assert.throws(() => validateMeasures(bad), undefined, JSON.stringify(bad).slice(0, 80));
});

test('each measure is charted, in its own color, unless it says otherwise (#612)', () => {
  const measures = validateMeasures({
    debt: { type: 'mpz', balance: { at: 'start', value: '0' } },
    spend: { type: 'mpz', color: '#C0612B' },
    ratio: { type: 'mpq', chart: 'off' },
    held: { type: 'mpz', balance: { at: 'start', value: '0' }, chart: 'rate' },
    // A chart it would have anyway isn't kept.
    plain: { type: 'mpz', chart: 'rate' },
  });
  assert.equal(measures.plain.chart, undefined);
  assert.equal(measures.spend.color, '#c0612b');
  assert.deepEqual(
    Object.keys(measures).map((name) => [name, measureChart(measures, name)]),
    [
      ['debt', 'balance'],
      ['held', 'rate'],
      ['plain', 'rate'],
      ['ratio', 'off'],
      ['spend', 'rate'],
    ],
  );
  // Its own color, else its place's.
  assert.equal(measureColor(measures, 'spend'), '#c0612b');
  assert.equal(measureColor(measures, 'debt'), MEASURE_COLORS[0]);
  assert.equal(measureColor(measures, 'held'), MEASURE_COLORS[1]);
  for (const bad of [
    { cost: { type: 'mpz', chart: 'balance' } },
    { cost: { type: 'mpz', chart: 'pie' } },
    { cost: { type: 'mpz', color: 'red' } },
    { cost: { type: 'mpz', color: '#12345' } },
  ])
    assert.throws(() => validateMeasures(bad), undefined, JSON.stringify(bad));
});

test('values are exact text, canonical, never zero, and whole for mpz', () => {
  assert.deepEqual(validateMeasureValues({ hours: '6/4', cost: '+1250', zero: '0' }, null), {
    cost: '1250',
    hours: '3/2',
  });
  assert.deepEqual(validateMeasureValues({ hours: '12.50' }, MEASURES), { hours: '25/2' });
  assert.deepEqual(validateMeasureValues({ cost: '-0012' }, MEASURES), { cost: '-12' });
  assert.equal(validateMeasureValues({ cost: '0', hours: '0/7' }, MEASURES), undefined);
  assert.throws(() => validateMeasureValues({ cost: 1250 }, MEASURES), /text/);
  assert.throws(() => validateMeasureValues({ cost: '1e3' }, MEASURES), /integers, fractions/);
  assert.throws(() => validateMeasureValues({ cost: ' 3' }, MEASURES), /integers, fractions/);
  assert.throws(() => validateMeasureValues({ cost: '3/0' }, MEASURES), /Zero denominator/);
  assert.throws(() => validateMeasureValues({ cost: '3/2' }, MEASURES), /whole number/);
  assert.throws(() => validateMeasureValues({ cost: '1.5' }, MEASURES), /whole number/);
  // An mpz value may be written as a fraction or decimal that is whole.
  assert.deepEqual(validateMeasureValues({ cost: '6/3' }, MEASURES), { cost: '2' });
  assert.throws(() => validateMeasureValues({ price: '1' }, MEASURES), /declares no measure/);
  assert.throws(() => validateMeasureValues({ constructor: '1' }, MEASURES), /declares no measure/);
  assert.throws(() => validateMeasureValues(['1'], MEASURES), /object/);
  assert.equal(measureValue({ measures: { hours: '3/2' } }, 'hours').toString(), '3/2');
  assert.equal(measureValue({ measures: { cost: '-12' } }, 'cost').toString(), '-12/1');
  assert.equal(measureValue({}, 'cost').toString(), '0/1');
});

test("values are bounded like times: by length and the server's digit limit", () => {
  const before = timeDigitLimit();
  try {
    setTimeDigitLimit({ numerator: 5, denominator: 3 });
    assert.equal(parseMeasureValue('99999').toString(), '99999/1');
    assert.throws(() => parseMeasureValue('100000'), /at most 5 digits/);
    assert.throws(() => parseMeasureValue('1/1000'), /over at most 3 digits/);
    // Reduced first: 2000/4000 is 1/2.
    assert.equal(parseMeasureValue('2000/4000').toString(), '1/2');
  } finally {
    setTimeDigitLimit(before);
  }
  assert.throws(() => parseMeasureValue('1'.repeat(2201)), /2200 characters/);
});

test('documents check values against their declarations, moments and durations alike', () => {
  const valid = validateDocument(
    doc(
      MEASURES,
      [moment('a', { cost: '1250', hours: '0' }), moment('b', { cost: '0' }), moment('c')],
      [{ id: 'd', start: '1/1', end: '2/1', metadata: { measures: { hours: '1.25' } } }],
    ),
  );
  assert.deepEqual(valid.measures, MEASURES);
  assert.deepEqual(valid.events[0].metadata.measures, { cost: '1250' });
  // Zeros are left out, and the key with them.
  assert.equal('measures' in valid.events[1].metadata, false);
  assert.deepEqual(valid.durations[0].metadata.measures, { hours: '5/4' });
  assert.throws(
    () => validateDocument(doc(undefined, [moment('a', { cost: '1' })])),
    /Moment a: The timeline declares no measure named cost/,
  );
  assert.throws(
    () => validateDocument(doc(MEASURES, [moment('a', { cost: '1/2' })])),
    /Moment a: cost is a whole number/,
  );
  assert.throws(
    () =>
      validateDocument(
        doc(
          MEASURES,
          [],
          [{ id: 'd', start: '1/1', end: '2/1', metadata: { measures: { x: '1' } } }],
        ),
      ),
    /Duration d: The timeline declares no measure named x/,
  );
  // No declarations: no `measures` key; an empty object is the same.
  assert.equal('measures' in validateDocument(doc({}, [])), false);
  // A fragment (a sparse save's moment) carries its timeline's settings and is checked by them.
  assert.throws(
    () => validateDocument(doc(undefined, [moment('a', { cost: '1' })]), true),
    /declares no measure/,
  );
  assert.deepEqual(
    validateDocument(doc(MEASURES, [moment('a', { cost: '7' })]), true).events[0].metadata.measures,
    { cost: '7' },
  );
  // A sparse save's duration, checked by the settings it is sent with.
  assert.throws(
    () =>
      validateDuration(
        { id: 'd', start: '1/1', end: '2/1', metadata: { measures: { cost: '1/3' } } },
        parseTime,
        MEASURES,
      ),
    /Duration d: cost is a whole number/,
  );
});

test('the index, its document and drafts keep the declarations', () => {
  const index = new TimelineIndex(validateDocument(doc(MEASURES, [moment('a', { cost: '5' })])));
  assert.deepEqual(index.measures, MEASURES);
  assert.deepEqual(index.document().measures, MEASURES);
  assert.deepEqual(draftSettings(index).measures, MEASURES);
  const restored = draftDocument({
    settings: draftSettings(index),
    moments: [...index.byId.values()],
    durations: [],
    links: [],
    retired: [],
  });
  assert.deepEqual(restored.measures, MEASURES);
  assert.deepEqual(restored.events[0].metadata.measures, { cost: '5' });
});

test('a settings save may add, relabel and widen, but not rename, remove or narrow', () => {
  assert.equal(measuresCompatible(undefined, MEASURES), true);
  assert.equal(measuresCompatible(MEASURES, { ...MEASURES, cost: { type: 'mpq' } }), true);
  assert.equal(measuresCompatible(MEASURES, { ...MEASURES, extra: { type: 'mpz' } }), true);
  assert.equal(measuresCompatible(MEASURES, { cost: MEASURES.cost }), false);
  assert.equal(measuresCompatible(MEASURES, { ...MEASURES, hours: { type: 'mpz' } }), false);
  assert.equal(measuresCompatible(MEASURES, undefined), false);
});

test('changing declarations rewrites the values that change with them', () => {
  const document = validateDocument(
    doc(
      MEASURES,
      [moment('a', { cost: '5', hours: '2' }), moment('b', { hours: '1/2' }), moment('c')],
      [{ id: 'd', start: '1/1', end: '2/1', metadata: { title: 'D', measures: { cost: '3' } } }],
    ),
  );
  // Renaming cost to price moves its values; hours stays.
  const after = { price: { type: 'mpz' }, hours: { type: 'mpq' } };
  const renames = validateMeasureRenames({ cost: 'price' }, MEASURES, after);
  const renamed = remeasuredEntities(document, after, renames);
  assert.deepEqual(
    renamed.events.map((e) => [e.id, e.metadata.measures]),
    [['a', { price: '5', hours: '2' }]],
  );
  assert.deepEqual(renamed.durations[0].metadata, { title: 'D', measures: { price: '3' } });
  // The result is a valid document under the new declarations.
  validateDocument({
    ...document,
    measures: after,
    events: document.events.map((e) => renamed.events.find((r) => r.id === e.id) ?? e),
    durations: renamed.durations,
  });
  // Removing cost drops its values, and the key when none remain.
  const removed = remeasuredEntities(document, { hours: { type: 'mpq' } });
  assert.deepEqual(
    removed.events.map((e) => [e.id, e.metadata.measures]),
    [['a', { hours: '2' }]],
  );
  assert.deepEqual(removed.durations[0].metadata, { title: 'D' });
  // Narrowing hours is refused while b has a fraction, naming it; allowed once it doesn't.
  assert.throws(
    () => remeasuredEntities(document, { ...MEASURES, hours: { type: 'mpz' } }),
    /hours can't become whole numbers while moment b has 1\/2\./,
  );
  const whole = { ...document, events: document.events.filter((e) => e.id !== 'b') };
  assert.deepEqual(remeasuredEntities(whole, { ...MEASURES, hours: { type: 'mpz' } }), {
    events: [],
    durations: [],
  });
  // Swapping two names is one rename each way.
  const swapped = remeasuredEntities(
    document,
    { cost: { type: 'mpq' }, hours: { type: 'mpq' } },
    validateMeasureRenames({ cost: 'hours', hours: 'cost' }, MEASURES, {
      cost: { type: 'mpq' },
      hours: { type: 'mpq' },
    }),
  );
  assert.deepEqual(swapped.events[0].metadata.measures, { hours: '5', cost: '2' });
  for (const bad of [{ nope: 'price' }, { cost: 'missing' }, { cost: 'hours', hours: 'hours' }])
    assert.throws(() =>
      validateMeasureRenames(bad, MEASURES, { price: { type: 'mpz' }, hours: { type: 'mpq' } }),
    );
});

test('merges carry measures like the other settings', () => {
  const base = doc(undefined, [moment('a')]);
  const proposal = doc(MEASURES, [moment('a', { cost: '9' })]);
  const merged = rebaseDocument(base, proposal, base);
  assert.deepEqual(merged.measures, MEASURES);
  assert.deepEqual(merged.events[0].metadata.measures, { cost: '9' });
});
