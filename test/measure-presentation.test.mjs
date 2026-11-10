// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// How measures' values are written and read (#573): exactly in every mode, refusing what would
// be rounded, with scales, prefixes, units, grouping and each purpose's form.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  createMeasurePresenter,
  validateMeasurePresentation,
  validateMeasures,
  printedMeasures,
  measurePresenter,
} from '../dist/core.mjs';

const q = (text) => Q.parse(text.includes('/') ? text : text + '/1');
const USD = { mode: 'fixed', scale: '1/100', decimals: 2, prefix: '$' };

test('presentations are validated and kept canonical', () => {
  assert.deepEqual(validateMeasurePresentation({ mode: 'fixed', scale: '0.01', prefix: '$' }), {
    mode: 'fixed',
    scale: '1/100',
    decimals: 2,
    prefix: '$',
  });
  assert.deepEqual(validateMeasurePresentation({ mode: 'decimal', scale: '1', unit: 'h' }), {
    mode: 'decimal',
    significantDigits: 6,
    unit: 'h',
  });
  // What a mode doesn't read is dropped.
  assert.deepEqual(validateMeasurePresentation({ mode: 'exact', decimals: 4, grouping: false }), {
    mode: 'exact',
  });
  for (const bad of [
    { mode: 'float' },
    { mode: 'fixed', scale: '0' },
    { mode: 'fixed', scale: '-1' },
    { mode: 'fixed', decimals: 31 },
    { mode: 'decimal', significantDigits: 0 },
    { mode: 'fixed', prefix: '$1' },
    { mode: 'fixed', unit: '-h' },
    { mode: 'fixed', unit: 'a\nb' },
    { mode: 'fixed', color: 'red' },
    { mode: 'fixed', grouping: 'yes' },
  ])
    assert.throws(() => validateMeasurePresentation(bad), undefined, JSON.stringify(bad));
  // Declarations carry them; a bare exact one is the same as none.
  assert.deepEqual(validateMeasures({ cost: { type: 'mpz', presentation: USD } }).cost, {
    type: 'mpz',
    presentation: USD,
  });
  assert.deepEqual(validateMeasures({ n: { type: 'mpq', presentation: { mode: 'exact' } } }).n, {
    type: 'mpq',
  });
  assert.throws(
    () => validateMeasures({ cost: { type: 'mpz', presentation: { mode: 'x' } } }),
    /Measure cost: /,
  );
});

test('fixed decimals: currency as cents, exact both ways, refusing what would round', () => {
  const cost = createMeasurePresenter('mpz', validateMeasurePresentation(USD), 'Cost');
  assert.equal(cost.print(q('123456')), '$1,234.56');
  assert.equal(cost.print(q('-5')), '−$0.05');
  assert.equal(cost.print(q('0')), '$0.00');
  assert.equal(cost.print(q('123456'), 'input'), '1234.56');
  assert.equal(cost.print(q('100'), 'input'), '1.00');
  assert.equal(cost.print(q('123456789'), 'axis'), '$1.23M');
  assert.equal(cost.print(q('99'), 'axis'), '$0.99');
  for (const text of ['$1,234.56', '1234.56', ' $ 1234.56 ', '1,234.56'])
    assert.equal(cost.parse(text).toString(), '123456/1', text);
  assert.equal(cost.parse('-$12.34').toString(), '-1234/1');
  assert.equal(cost.parse('$-12.34').toString(), '-1234/1');
  assert.equal(cost.parse('−12').toString(), '-1200/1');
  assert.equal(cost.parse('12.3').toString(), '1230/1');
  assert.equal(cost.parse('').toString(), '0/1');
  assert.throws(
    () => cost.parse('$12.345'),
    /at most 2 decimal places: “\$12.345” would be rounded/,
  );
  assert.throws(() => cost.parse('1/3'), /steps of \$0.01/);
  assert.throws(() => cost.parse('twelve'), /isn't a number/);
  assert.throws(() => cost.parse('1,23'), /isn't a number/);
  // Fractions of an mpq measure show rounded, with the exact value in tooltips and inputs.
  const share = createMeasurePresenter('mpq', { mode: 'fixed', decimals: 2 }, 'Share');
  assert.equal(share.print(q('1/3')), '0.33');
  assert.equal(share.print(q('1/3'), 'tooltip'), '0.33 (exactly 1/3)');
  assert.equal(share.print(q('1/4'), 'tooltip'), '0.25');
  assert.equal(share.print(q('1/3'), 'input'), '1/3');
  assert.equal(share.parse('1/3').toString(), '1/3');
  // Without grouping.
  const plain = createMeasurePresenter('mpz', { mode: 'fixed', decimals: 0, grouping: false });
  assert.equal(plain.print(q('1234567')), '1234567');
});

test('exact, decimal, scientific and SI modes', () => {
  const exact = createMeasurePresenter('mpq', undefined, 'Hours');
  assert.equal(exact.print(q('3/2')), '3/2');
  assert.equal(exact.print(q('7')), '7');
  assert.equal(exact.parse('1.5').toString(), '3/2');
  assert.equal(exact.parse('6/4').toString(), '3/2');
  const hours = createMeasurePresenter(
    'mpq',
    { mode: 'decimal', significantDigits: 4, unit: 'h', scale: '1/3600' },
    'Hours',
  );
  // Stored as seconds, shown as hours.
  assert.equal(hours.print(q('5400')), '1.5 h');
  assert.equal(hours.print(q('1200')), '0.3333 h');
  assert.equal(hours.print(q('1200'), 'tooltip'), '0.3333 h (exactly 1/3 h)');
  assert.equal(hours.print(q('1200'), 'input'), '1/3');
  assert.equal(hours.print(q('36000000'), 'value'), '10,000 h');
  assert.equal(hours.print(q('36000000'), 'axis'), '10K h');
  assert.equal(hours.parse('1.5 h').toString(), '5400/1');
  assert.equal(hours.parse('1e1').toString(), '36000/1');
  const sci = createMeasurePresenter('mpq', { mode: 'scientific', significantDigits: 3 });
  assert.equal(sci.print(q('123456')), '1.23e+5');
  assert.equal(sci.parse('1.5e3').toString(), '1500/1');
  const energy = createMeasurePresenter('mpz', { mode: 'si', significantDigits: 3, unit: 'Wh' });
  assert.equal(energy.print(q('1500')), '1.5 kWh');
  assert.equal(energy.print(q('1234567')), '1.23 MWh');
  assert.equal(energy.print(q('1234567'), 'tooltip'), '1.23 MWh (exactly 1234567 Wh)');
  assert.equal(energy.parse('1.5 kWh').toString(), '1500/1');
  assert.equal(energy.parse('2 MWh').toString(), '2000000/1');
  assert.throws(() => energy.parse('1.5 Wh'), /whole number/);
});

test("an entity's printed values follow the declarations' order and leave out zeros", () => {
  const measures = validateMeasures({
    hours: { type: 'mpq', label: 'Hours', presentation: { mode: 'decimal', unit: 'h' } },
    cost: { type: 'mpz', label: 'Cost', presentation: USD },
    tips: { type: 'mpz' },
  });
  assert.deepEqual(printedMeasures(measures, { measures: { cost: '250', hours: '1/3' } }), [
    ['cost', 'Cost', '$2.50'],
    ['hours', 'Hours', '0.333333 h'],
  ]);
  assert.deepEqual(printedMeasures(undefined, { measures: { cost: '1' } }), []);
  assert.equal(measurePresenter(measures, 'tips').print(q('-3')), '−3');
});
