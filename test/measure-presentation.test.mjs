// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The official measure formats (#573, #585): each serves one type, prints and parses exactly,
// refuses what would be rounded, and keeps its scale, prefix, unit and each purpose's form.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  MEASURE_FORMATS,
  measureModes,
  createMeasurePresenter,
  validateMeasurePresentation,
  validateMeasures,
  printedMeasures,
  measurePresenter,
} from '../dist/core.mjs';

const q = (text) => Q.parse(text.includes('/') ? text : text + '/1');
const USD = { mode: 'fixed', scale: '1/100', decimals: 2, prefix: '$' };

test('the library: fractions in four notations, whole numbers as fixed decimals', () => {
  assert.deepEqual(measureModes('mpq'), ['decimal', 'scientific', 'engineering', 'fraction']);
  assert.deepEqual(measureModes('mpz'), ['fixed']);
  assert(MEASURE_FORMATS.every((f) => f.label && f.example));
});

test('presentations are validated for their type and kept canonical', () => {
  assert.deepEqual(
    validateMeasurePresentation({ mode: 'fixed', scale: '0.01', prefix: '$', decimals: 2 }, 'mpz'),
    { mode: 'fixed', scale: '1/100', decimals: 2, prefix: '$' },
  );
  assert.deepEqual(validateMeasurePresentation({ mode: 'fixed' }, 'mpz'), {
    mode: 'fixed',
    decimals: 0,
  });
  assert.deepEqual(validateMeasurePresentation({ mode: 'decimal', unit: 'h' }, 'mpq'), {
    mode: 'decimal',
    significantDigits: 6,
    unit: 'h',
  });
  // What a format doesn't read is dropped.
  assert.deepEqual(
    validateMeasurePresentation({ mode: 'fraction', decimals: 4, grouping: false }, 'mpq'),
    { mode: 'fraction' },
  );
  // Each type has its own formats; there are no others (and no plugin formats).
  for (const [bad, type] of [
    [{ mode: 'fixed' }, 'mpq'],
    [{ mode: 'decimal' }, 'mpz'],
    [{ mode: 'fraction' }, 'mpz'],
    [{ mode: 'si' }, 'mpq'],
    [{ mode: 'exact' }, 'mpq'],
    [{ mode: 'custom' }, 'mpq'],
    [{ mode: 'fixed', scale: '0' }, 'mpz'],
    [{ mode: 'fixed', decimals: 31 }, 'mpz'],
    [{ mode: 'engineering', significantDigits: 0 }, 'mpq'],
    [{ mode: 'fixed', prefix: '$1' }, 'mpz'],
    [{ mode: 'decimal', unit: '-h' }, 'mpq'],
    [{ mode: 'fixed', color: 'red' }, 'mpz'],
  ])
    assert.throws(() => validateMeasurePresentation(bad, type), undefined, JSON.stringify(bad));
  // Declarations check a format against their type; a bare default format is dropped.
  assert.deepEqual(validateMeasures({ cost: { type: 'mpz', presentation: USD } }).cost, {
    type: 'mpz',
    presentation: USD,
  });
  assert.deepEqual(validateMeasures({ n: { type: 'mpq', presentation: { mode: 'fraction' } } }).n, {
    type: 'mpq',
  });
  assert.deepEqual(validateMeasures({ n: { type: 'mpz', presentation: { mode: 'fixed' } } }).n, {
    type: 'mpz',
  });
  assert.throws(
    () => validateMeasures({ cost: { type: 'mpz', presentation: { mode: 'decimal' } } }),
    /Measure cost: A whole-number \(mpz\) measure’s format is fixed/,
  );
});

test('fixed decimals: currency as cents, exact both ways, refusing what would round', () => {
  const cost = createMeasurePresenter('mpz', validateMeasurePresentation(USD, 'mpz'), 'Cost');
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
  assert.equal(cost.parse('').toString(), '0/1');
  assert.throws(
    () => cost.parse('$12.345'),
    /at most 2 decimal places: “\$12.345” would be rounded/,
  );
  assert.throws(() => cost.parse('1/3'), /steps of \$0.01/);
  assert.throws(() => cost.parse('twelve'), /isn't a number/);
  assert.throws(() => cost.parse('1,23'), /isn't a number/);
  // A whole number with no scale: grouped integers by default, or not.
  const count = createMeasurePresenter('mpz', undefined, 'Count');
  assert.equal(count.print(q('1234567')), '1,234,567');
  assert.equal(count.parse('1,234,567').toString(), '1234567/1');
  assert.throws(() => count.parse('1.5'), /at most 0 decimal places/);
  const plain = createMeasurePresenter('mpz', { mode: 'fixed', decimals: 0, grouping: false });
  assert.equal(plain.print(q('1234567')), '1234567');
});

test('fractions: floating point, scientific, engineering and improper fractions', () => {
  const fraction = createMeasurePresenter('mpq', undefined, 'Hours');
  assert.equal(fraction.print(q('7/2')), '7/2');
  assert.equal(fraction.print(q('7')), '7');
  assert.equal(fraction.print(q('7/2'), 'input'), '7/2');
  assert.equal(fraction.parse('3.5').toString(), '7/2');
  assert.equal(fraction.parse('14/4').toString(), '7/2');

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
  assert.equal(hours.print(q('36000000')), '10,000 h');
  assert.equal(hours.print(q('36000000'), 'axis'), '10K h');
  assert.equal(hours.parse('1.5 h').toString(), '5400/1');
  assert.equal(hours.parse('1e1').toString(), '36000/1');

  const sci = createMeasurePresenter('mpq', { mode: 'scientific', significantDigits: 3 });
  assert.equal(sci.print(q('123456')), '1.23e+5');
  assert.equal(sci.parse('1.5e3').toString(), '1500/1');

  const eng = createMeasurePresenter('mpq', {
    mode: 'engineering',
    significantDigits: 3,
    unit: 'Wh',
  });
  assert.equal(eng.print(q('1500')), '1.5e3 Wh');
  assert.equal(eng.print(q('123456')), '123e3 Wh');
  assert.equal(eng.print(q('1234567')), '1.23e6 Wh');
  assert.equal(eng.print(q('1/1000')), '1e-3 Wh');
  assert.equal(eng.print(q('999999')), '1e6 Wh');
  assert.equal(eng.print(q('-1/50')), '−20e-3 Wh');
  assert.equal(eng.print(q('0')), '0e0 Wh');
  assert.equal(eng.print(q('1234567'), 'tooltip'), '1.23e6 Wh (exactly 1234567 Wh)');
  assert.equal(eng.parse('1.5e3 Wh').toString(), '1500/1');
  assert.equal(eng.parse('20e-3').toString(), '1/50');
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
  assert.equal(measurePresenter(measures, 'tips').print(q('-3000')), '−3,000');
});
