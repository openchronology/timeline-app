// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  DEFAULT_PRESENTATION,
  createPresenter,
  compileCustom,
  parseTimestamp,
  TimelineIndex,
  validateDocument,
} from '../dist/core.mjs';
const settings = { ...DEFAULT_PRESENTATION, mode: 'gregorian' };
const left = parseTimestamp('2026-10-05T00:00:00Z');
const context = (span = 86400n, purpose = 'event', widthPixels = 1000) => ({
  left,
  span: Q.from(span),
  widthPixels,
  purpose,
});
const time = parseTimestamp('2026-10-05T13:45:30{+1/3}Z');

test('Gregorian chart labels omit common dates and invisible detail while exact fields round-trip', () => {
  const format = createPresenter(settings);
  assert.equal(format.print(time, context(86400n, 'axis')), '13h');
  assert.equal(format.print(time, context()), '13:45');
  for (const purpose of ['input', 'tooltip']) {
    const ctx = context(86400n, purpose);
    assert.equal(format.print(time, ctx), '2026-10-05T13:45:30{+1/3}Z CE');
    assert(format.parse(format.print(time, ctx), ctx).equals(time));
  }
  assert.equal(format.describe(context()), '2026-10-05 CE → 2026-10-06 CE · UTC');
  assert(format.parse('13:45', context()).equals(parseTimestamp('2026-10-05T13:45:00Z')));
});

test('actual viewport density and label spacing determine Gregorian precision', () => {
  const format = createPresenter(settings);
  assert.equal(format.print(time, context(86400n, 'event', 1000)), '13:45');
  assert.equal(format.print(time, context(86400n, 'event', 100)), '13h');
  assert.equal(format.print(time, { ...context(), spacingPixels: 500 }), '13h');
  const hour = { ...context(3600n), left: parseTimestamp('2026-10-05T13:00:00Z') };
  assert.equal(format.print(time, { ...hour, purpose: 'axis' }), '45m');
  assert.equal(format.print(time, hour), '45m 30s');
  assert.match(format.describe(hour), /base 13:00/);
  assert(format.parse('45m 30s', hour).equals(time.floor()));
  const minute = { ...hour, span: Q.from(60n), left: parseTimestamp('2026-10-05T13:45:00Z') };
  assert.equal(format.print(time, { ...minute, purpose: 'axis' }), '30s');
  assert.equal(format.print(time, minute), '30.3s');
  assert.match(format.describe(minute), /base 13:45/);
  assert(format.parse('30.3s', minute).equals(parseTimestamp('2026-10-05T13:45:30.3Z')));
});

test('calendar boundaries remain identifiable, with configured offsets and exact MJD transforms', () => {
  const format = createPresenter(settings);
  assert.equal(format.print(left.add(Q.from(86400n)), context(86400n, 'axis')), '00h');
  assert(format.parse('10-06 00h', context()).equals(left.add(Q.from(86400n))));
  const yearEnd = { ...context(), left: parseTimestamp('2026-12-31T00:00:00Z') };
  assert.equal(format.print(yearEnd.left.add(Q.from(86400n)), yearEnd), '00:00');
  assert.match(format.describe(yearEnd), /2026-12-31 CE → 2027-01-01 CE/);
  assert(format.parse('2027-01-01 00:00', yearEnd).equals(yearEnd.left.add(Q.from(86400n))));
  const zone = createPresenter({ ...settings, offsetMinutes: -600 });
  const hawaii = { ...context(), left: parseTimestamp('2026-10-05T00:00:00-10:00') };
  assert.equal(zone.print(parseTimestamp('2026-10-05T13:45:00-10:00'), hawaii), '13:45');
  assert.match(zone.describe(hawaii), /UTC-10:00/);
  assert(zone.parse('13:45', hawaii).equals(parseTimestamp('2026-10-05T13:45:00-10:00')));
  const mjd = createPresenter({ ...settings, origin: '40587/1', scale: '1/86400' });
  const mjdLeft = Q.from(40587n),
    mjdContext = { ...context(), left: mjdLeft, span: Q.one };
  assert.equal(mjd.print(mjdLeft.add(Q.from(13n, 24n)), mjdContext), '13:00');
  assert(mjd.parse('13:00', mjdContext).equals(mjdLeft.add(Q.from(13n, 24n))));
  assert.throws(() => zone.parse('24h', hawaii), /Invalid/);
  assert.throws(() => zone.parse('60s', hawaii), /below 60/);
});

test('crossing minute, hour and midnight boundaries keeps a uniform compact label format', () => {
  const format = createPresenter(settings);
  for (const stamp of [
    '2026-10-05T13:45:59Z',
    '2026-10-05T13:59:59Z',
    '1969-12-31T23:59:59Z',
    '2026-12-31T23:59:59Z',
  ]) {
    const ctx = { ...context(20n), left: parseTimestamp(stamp) };
    assert.equal(format.print(ctx.left, { ...ctx, purpose: 'axis' }), '59s');
    assert.equal(format.print(ctx.left.add(Q.from(4n)), { ...ctx, purpose: 'axis' }), '03s');
    const point = ctx.left.add(Q.from(23n, 5n));
    assert.equal(format.print(point, ctx), '03.6s');
    assert(format.parse('03.6s', ctx).equals(point));
    assert(format.parse('59s', ctx).equals(ctx.left));
    const labels = Array.from({ length: 11 }, (_, i) =>
      format.print(ctx.left.add(Q.from(BigInt(i * 2))), { ...ctx, purpose: 'axis' }),
    );
    assert(labels.every((label) => /^\d{2}s$/.test(label)));
    assert.match(format.describe(ctx), /base .* → /);
  }
  const midnight = { ...context(100n), left: parseTimestamp('1969-12-31T23:59:13Z') };
  const after = Q.from(3n);
  assert.equal(format.print(after, midnight), '00m 03.0s');
  assert.equal(format.print(midnight.left, { ...midnight, purpose: 'axis' }), '59m 13s');
  assert.equal(format.print(after, { ...midnight, purpose: 'axis' }), '00m 03s');
  assert(format.parse('00m 03s', midnight).equals(after));
  assert.equal(
    format.describe(midnight),
    '1969-12-31 CE → 1970-01-01 CE · base 23:00 → 00:00 · UTC',
  );
  const acrossDay = { ...context(7200n), left: parseTimestamp('2026-10-05T23:00:00Z') };
  assert.equal(format.print(acrossDay.left.add(Q.from(5400n)), acrossDay), '00:30:00');
  assert(format.parse('00:30:00', acrossDay).equals(acrossDay.left.add(Q.from(5400n))));
});

test('deep rational zooms use short relative offsets without fixed-precision loss', () => {
  const format = createPresenter(settings),
    tiny = Q.from(1n, 10n ** 1100n);
  const ctx = { ...context(), left: left.add(Q.from(1n, 3n)), span: tiny.mul(Q.from(100n)) };
  const point = ctx.left.add(tiny.mul(Q.from(23n))),
    label = format.print(point, ctx);
  assert.equal(label, 'Δ 2.3e-1099 s');
  assert(label.length < 30);
  assert(format.parse(label, ctx).equals(point));
  assert.match(format.describe(ctx), /^Δ from .*\{\+1\/3\}Z/);
  assert(format.parse(format.print(point, { ...ctx, purpose: 'input' }), ctx).equals(point));
  const transition = { ...ctx, span: Q.from(1n, 100000n), purpose: 'axis' };
  assert.match(format.print(ctx.left, { ...transition, purpose: 'event' }), /^Δ /);
  assert.match(format.describe(transition), /^Δ from /);
});

test('coarse Gregorian views abbreviate to days, months or years and can opt out', () => {
  const format = createPresenter(settings);
  assert.equal(format.print(time, context(86400n * 30n, 'axis')), '10-05');
  assert.equal(format.print(time, context(86400n * 366n, 'axis')), '2026-10 CE');
  assert.equal(format.print(time, context(31557600n * 100n, 'axis')), '2026 CE');
  assert(format.parse('2026-10', context()).equals(parseTimestamp('2026-10-01T00:00:00Z')));
  assert(format.parse('2026', context()).equals(parseTimestamp('2026-01-01T00:00:00Z')));
  const full = createPresenter({ ...settings, adaptiveLabels: false });
  assert.equal(full.print(time, context()), '2026-10-05T13:45:30{+1/3}Z CE');
  assert.equal(full.describe(context()), '');
});

test('custom printers and parsers share restricted, exact viewport helpers, optionally', () => {
  const source = `function print(time, api) {
    const wide = api.hasView() ? api.viewWidth() > 500 : false;
    return wide ? api.exact(api.viewSpan()) + " / " + api.exact(api.unitsPerPixel()) : api.exact(time);
  }
  function parse(text, api) { return api.add(api.viewLeft(), api.parseNumber(text)); }`;
  const custom = compileCustom(source),
    ctx = { ...context(20n), left: Q.from(10n) };
  assert.equal(custom.print(Q.one, ctx), '20/1 / 1/50');
  assert.equal(custom.print(Q.one, { ...ctx, widthPixels: 100 }), '1/1');
  assert.equal(custom.print(Q.one), '1/1');
  assert(custom.parse('0.25', ctx).equals(Q.from(41n, 4n)));
  assert.throws(() => custom.parse('1'), /no viewport/);
  const all = compileCustom(`function print(time, api) {
    return api.purpose() + " " + api.exact(api.viewRight()) + " " + api.exact(api.labelResolution());
  } function parse(text, api) { return api.viewSpan(); }`);
  assert.equal(all.print(Q.one, ctx), 'event 30/1 3/25');
  assert(all.parse('ignored', ctx).equals(Q.from(20n)));
  for (const name of ['window', 'context', 'constructor', '__proto__'])
    assert.throws(() =>
      compileCustom(
        `function print(time, api) { return api.${name}(); } function parse(text, api) { return api.rational(text); }`,
      ),
    );
  assert.throws(() =>
    compileCustom(
      `function print(time, api) { return api.viewLeft().numerator; } function parse(text, api) { return api.rational(text); }`,
    ),
  );
});

test('context validation applies to all formats without saving viewport data in timelines', () => {
  for (const mode of ['rational', 'float', 'si', 'scientific', 'gregorian', 'custom']) {
    const options = {
      ...DEFAULT_PRESENTATION,
      mode,
      ...(mode === 'custom'
        ? {
            source:
              'function print(time, api) { return api.exact(time); } function parse(text, api) { return api.rational(text); }',
          }
        : {}),
    };
    const format = createPresenter(options);
    for (const bad of [
      { widthPixels: 0 },
      { widthPixels: Infinity },
      { span: Q.zero },
      { purpose: 'secret' },
      { spacingPixels: -1 },
    ])
      assert.throws(() => format.print(Q.one, { ...context(), ...bad }));
    const document = validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Context',
      description: '',
      presentation: options,
      events: [{ id: 'a', time: '1/3', metadata: {} }],
    });
    const index = new TimelineIndex(document),
      original = index.document();
    format.print(Q.from(1n, 3n), context());
    assert.deepEqual(index.document(), original);
    assert(!JSON.stringify(original).includes('widthPixels'));
  }
});

test('Gregorian era labels have no year zero and preserve exact BCE fractions and offsets', () => {
  for (const offsetMinutes of [0, 345, -600]) {
    const format = createPresenter({ ...settings, offsetMinutes });
    for (const year of ['0001', '0000', '-0001', '-12000000']) {
      const t = parseTimestamp(`${year}-02-03T12:34:56{+1/7}Z`);
      assert(format.parse(format.print(t)).equals(t));
      assert.match(format.print(t), year === '0001' ? / CE$/ : / BCE$/);
    }
  }
  const format = createPresenter(settings);
  assert(format.parse('1 BCE').equals(parseTimestamp('0000-01-01T00:00:00Z')));
  assert(format.parse('2 BCE').equals(parseTimestamp('-0001-01-01T00:00:00Z')));
  assert(format.parse('1 CE').equals(parseTimestamp('0001-01-01T00:00:00Z')));
  assert.throws(() => format.parse('0 BCE'), /no year zero/);
  const ctx = { ...context(86400n * 100n), left: parseTimestamp('-0001-01-01T00:00:00Z') };
  const t = parseTimestamp('0000-01-02T00:00:00Z');
  assert(format.parse(format.print(t, ctx), ctx).equals(t));
});

test('deep Gregorian labels use fixed-reference geological ages but exact inputs retain BCE dates', () => {
  const format = createPresenter(settings);
  const t = parseTimestamp('-65998000-01-01T00:00:00Z');
  const ctx = { ...context(), left: t, span: Q.from(31557600n * 10000000n), purpose: 'axis' };
  assert.equal(format.print(t, ctx), '66 mya');
  assert(format.parse('66 mya').equals(t));
  assert.match(format.describe(ctx), /ages relative to 2000 CE/);
  assert.match(format.print(t, { ...ctx, purpose: 'input' }), /65998001.*BCE$/);
  const future = parseTimestamp('10002000-01-01T00:00:00Z');
  assert.equal(format.print(future, ctx), '10 Myr after 2000 CE');
  assert(format.parse('10 Myr after 2000 CE').equals(future));
});

test('tiny Gregorian offsets use SI seconds consistently for axes, events and parsers', () => {
  const format = createPresenter(settings);
  for (const [denominator, unit] of [
    [1000n, 'ms'],
    [1000000n, 'µs'],
    [1000000000n, 'ns'],
    [1000000000000n, 'ps'],
    [10n ** 30n, 'qs'],
  ]) {
    const ctx = {
      left: Q.from(14n),
      span: Q.from(1n, denominator).mul(Q.from(100n)),
      widthPixels: 1000,
      purpose: 'event',
    };
    const point = ctx.left.add(Q.from(3n, denominator));
    const label = format.print(point, ctx);
    assert(label.includes(unit), label);
    assert(format.parse(label, ctx).equals(point));
    assert.match(format.describe({ ...ctx, purpose: 'axis' }), /^Δ from /);
  }
});
test('numeric presenters use a common exact origin when absolute significant digits hide the view', () => {
  for (const mode of ['float', 'scientific', 'si']) {
    const format = createPresenter({ ...DEFAULT_PRESENTATION, mode, unit: 's' });
    const ctx = {
      left: Q.parseDecimal('14.0928211925852388460329559104031158959'),
      span: Q.from(1n, 10n ** 50n),
      widthPixels: 1000,
      purpose: 'axis',
    };
    const a = format.print(ctx.left, ctx),
      b = format.print(ctx.left.add(ctx.span.div(Q.from(2n))), ctx);
    assert.notEqual(a, b);
    assert.match(a, /^Δ /);
    assert(format.parse(b, ctx).equals(ctx.left.add(ctx.span.div(Q.from(2n)))));
    assert.match(format.describe(ctx), /^Δ from /);
    assert.doesNotMatch(format.print(ctx.left, { ...ctx, purpose: 'input' }), /^Δ /);
  }
});
test('geological ages continue beyond millions with parseable billions and trillions', () => {
  const format = createPresenter(settings);
  for (const [age, suffix] of [
    [4500000000n, 'bya'],
    [1000000000000n, 'tya'],
    [10n ** 30n, 'qya'],
  ]) {
    const y = 2000n - age;
    const point = parseTimestamp(`${y}-01-01T00:00:00Z`);
    const ctx = { left: point, span: Q.from(age * 31557600n), widthPixels: 1000, purpose: 'event' };
    const label = format.print(point, ctx);
    assert(label.includes(suffix), label);
    assert(format.parse(label).equals(point));
  }
});
