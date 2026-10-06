import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  Viewport,
  DEFAULT_PRESENTATION,
  createPresenter,
  planRuler,
  validateRulerPolicy,
  parseTimestamp,
  printTimestamp,
  TimelineIndex,
  validateDocument,
} from '../dist/core.mjs';
const q = (value) => (value instanceof Q ? value : Q.from(value));
const context = (left, span, widthPixels = 1200) => ({
  left: q(left),
  span: q(span),
  widthPixels,
  purpose: 'axis',
});
const calendar = { kind: 'gregorian' };
const same = (a, b) => assert(q(a).equals(q(b)), `${q(a).toString()} != ${q(b).toString()}`);
const tickAt = (plan, time) => plan.ticks.find((tick) => tick.time.equals(time));

test('decimal marks are anchored to values and move continuously with panning', () => {
  const ctx = context(Q.from(-27n, 100n), Q.from(2n), 1000);
  const before = planRuler(ctx),
    moved = planRuler({ ...ctx, left: ctx.left.add(Q.from(1n, 5n)) });
  assert(!tickAt(before, ctx.left));
  assert(tickAt(before, Q.zero).label);
  assert(tickAt(before, Q.from(1n, 10n)).level === 'minor');
  const a = new Viewport(ctx.left, ctx.span),
    b = new Viewport(ctx.left.add(Q.from(1n, 5n)), ctx.span);
  for (const tick of moved.ticks) {
    const previous = tickAt(before, tick.time);
    if (previous) assert(Math.abs(b.x(tick.time, 1000) - a.x(tick.time, 1000) + 100) < 1e-9);
  }
  assert(before.ticks.every((tick) => tick.time.mul(Q.from(10n)).denominator === 1n));
});

test('zoom reveals ten decimal subdivisions and promotes existing marks', () => {
  const wide = planRuler(context(0n, 2n, 1000)),
    close = planRuler(context(0n, Q.from(1n, 5n), 1000));
  assert.equal(wide.graduation, '1/1');
  assert.equal(close.graduation, '1/10');
  assert.equal(tickAt(wide, Q.from(1n, 10n)).level, 'minor');
  assert.equal(tickAt(close, Q.from(1n, 10n)).level, 'major');
  assert(!tickAt(wide, Q.from(1n, 100n)));
  assert.equal(tickAt(close, Q.from(1n, 100n)).level, 'minor');
  const between = wide.ticks.filter(
    (tick) => tick.time.compare(Q.zero) >= 0 && tick.time.compare(Q.one) < 0,
  );
  assert.equal(between.length, 10);
});

test('day, hour and minute views reveal real clock graduations', () => {
  const day = parseTimestamp('2026-10-05T00:00:00Z');
  const daily = planRuler(context(day, 86400n), calendar);
  assert.equal(daily.graduation, '3 hours');
  assert.equal(daily.ticks.length, 25);
  for (let hour = 0n; hour <= 24n; hour++) assert(tickAt(daily, day.add(Q.from(hour * 3600n))));
  assert.equal(daily.ticks[0].level, 'boundary');
  const hourly = planRuler(context(day, 3600n), calendar);
  assert.equal(hourly.graduation, '5 minutes');
  assert.equal(hourly.ticks.length, 61);
  const minute = planRuler(context(day, 60n), calendar);
  assert.equal(minute.graduation, '10/1');
  assert.equal(minute.ticks.length, 61);
  const second = planRuler(context(day, Q.one), calendar);
  assert.equal(second.graduation, '1/10');
  same(second.ticks[1].time.sub(day), Q.from(1n, 100n));
});

test('Gregorian months and weeks honor leap days, real month lengths, and Monday anchors', () => {
  const start = parseTimestamp('2024-01-01T00:00:00Z'),
    finish = parseTimestamp('2025-01-01T00:00:00Z');
  const year = planRuler(context(start, finish.sub(start)), calendar);
  assert.equal(year.graduation, 'month');
  const labels = year.ticks.filter((tick) => tick.label);
  assert.equal(labels.length, 13);
  assert.equal(labels[0].level, 'boundary');
  same(labels[2].time.sub(labels[1].time), Q.from(29n * 86400n));
  same(labels[3].time.sub(labels[2].time), Q.from(31n * 86400n));
  const mondays = year.ticks.filter(
    (tick) => tick.time.div(Q.from(86400n)).sub(Q.from(4n)).div(Q.from(7n)).denominator === 1n,
  );
  assert.equal(mondays.length, 53);
  const leap = planRuler(context(parseTimestamp('2024-02-28T00:00:00Z'), 3n * 86400n), calendar);
  assert(tickAt(leap, parseTimestamp('2024-02-29T00:00:00Z')));
  const nonLeap = planRuler(context(parseTimestamp('1900-02-28T00:00:00Z'), 3n * 86400n), calendar);
  assert(nonLeap.ticks.some((tick) => printTimestamp(tick.time).startsWith('1900-03-01')));
});

test('rulers use fixed offsets and map their exact steps through unit scales and MJD origins', () => {
  const midnight = parseTimestamp('2026-10-05T00:00:00-10:00');
  const zone = createPresenter({ ...DEFAULT_PRESENTATION, mode: 'gregorian', offsetMinutes: -600 });
  const plan = zone.rules(context(midnight, 86400n));
  same(plan.ticks[0].time, midnight);
  assert.equal(
    zone.print(plan.ticks[0].time, { ...context(midnight, 86400n), spacingPixels: 150 }),
    '00h',
  );
  const mjd = createPresenter({
    ...DEFAULT_PRESENTATION,
    mode: 'gregorian',
    origin: '40587/1',
    scale: '1/86400',
  });
  const days = mjd.rules(context(40587n, Q.one));
  same(days.ticks[1].time, Q.from(40587n).add(Q.from(1n, 24n)));
  const minutes = createPresenter({
    ...DEFAULT_PRESENTATION,
    mode: 'si',
    origin: '5/1',
    scale: '60/1',
    unit: 'min',
  });
  const scaled = minutes.rules(context(5n, 120n, 1000));
  same(scaled.ticks[1].time, Q.from(11n));
  same(scaled.ticks.find((tick) => tick.label).interval, Q.from(60n));
});

test('coarse year graduations align civil years, including negative and huge years', () => {
  for (const year of [-2000n, 1900n, 10n ** 200n]) {
    const text = (y) =>
      (y < 0n ? '-' + (-y).toString().padStart(4, '0') : y.toString().padStart(4, '0')) +
      '-01-01T00:00:00Z';
    const left = parseTimestamp(text(year)),
      right = parseTimestamp(text(year + 200n));
    const plan = planRuler(context(left, right.sub(left), 1000), calendar);
    assert.equal(plan.graduation, '100 years');
    assert(plan.ticks.length <= 22);
    assert(plan.ticks.every((tick) => /^-?\d+-01-01T00:00:00Z$/.test(printTimestamp(tick.time))));
  }
});

test('extreme rational views and wide displays stay exact with bounded visible work', () => {
  const tiny = Q.from(1n, 10n ** 1100n),
    left = Q.from(10n ** 1200n).add(tiny.mul(Q.from(13n)));
  for (const kind of ['decimal', 'gregorian']) {
    const ctx = context(left, tiny.mul(Q.from(200n)), 1200),
      plan = planRuler(ctx, { kind });
    assert(plan.ticks.length > 10 && plan.ticks.length <= 512);
    assert(
      plan.ticks.every(
        (tick) =>
          tick.time.compare(ctx.left) >= 0 && tick.time.compare(ctx.left.add(ctx.span)) <= 0,
      ),
    );
    for (let i = 1; i < plan.ticks.length; i++)
      assert(plan.ticks[i].time.compare(plan.ticks[i - 1].time) > 0);
    same(ctx.left, left);
  }
  for (const kind of ['decimal', 'gregorian'])
    for (const width of [20, 320, 1200, 1000000])
      for (const span of [Q.from(1n, 3n), Q.from(86400n), Q.from(31557600n), Q.from(10n ** 100n)])
        assert(planRuler(context(-1n, span, width), { kind }).ticks.length <= 512);
});

test('custom breakpoint steps are validated, persisted, transformed and continued by decades', () => {
  const policy = validateRulerPolicy({ kind: 'steps', steps: ['1', '60', '3600', '86400'] });
  assert.deepEqual(policy.steps, ['1/1', '60/1', '3600/1', '86400/1']);
  const day = planRuler(context(0n, 86400n), policy);
  assert.equal(day.ticks.length, 25);
  assert.equal(day.graduation, '86400/1');
  assert.equal(planRuler(context(0n, Q.from(1n, 5n), 1000), policy).graduation, '1/10');
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Ruler',
    description: '',
    events: [],
    presentation: { ...DEFAULT_PRESENTATION, ruler: policy },
  });
  assert.deepEqual(new TimelineIndex(document).document(), document);
  const custom = createPresenter({
    ...DEFAULT_PRESENTATION,
    mode: 'custom',
    scale: '60/1',
    origin: '123/1',
    ruler: policy,
    source:
      'function print(time, api) { return api.exact(time); } function parse(text, api) { return api.rational(text); }',
  });
  same(custom.rules(context(0n, 86400n)).ticks[1].time, Q.from(3600n));
  for (const steps of [
    [],
    ['1'],
    ['0', '1'],
    ['-1', '1'],
    ['1', '1'],
    ['2', '1'],
    ['NaN', '2'],
    Array(33).fill('1'),
    ['1', '1'.repeat(1025)],
  ])
    assert.throws(() => validateRulerPolicy({ kind: 'steps', steps }));
  assert.throws(() => validateRulerPolicy({ kind: 'javascript', source: 'fetch()' }));
});

test('graduations crossfade by zoom depth, remain fixed during panning, and have no navigation history', () => {
  const at = (span) => planRuler(context(0n, span, 1000));
  const early = at(Q.from(20n, 3n)),
    middle = at(Q.from(25n, 3n)),
    late = at(Q.from(10n));
  const alpha = (plan) => tickAt(plan, Q.one).labelOpacity;
  assert(alpha(early) > alpha(middle) && alpha(middle) > alpha(late));
  assert(Math.abs(alpha(middle) - 0.5) < 1e-12);
  const parent = tickAt(planRuler(context(-5n, Q.from(25n, 3n), 1000)), Q.zero);
  assert.equal(parent.labelOpacity, 1); // Coincident labels blend once, without dimming the origin.
  const moved = planRuler(context(Q.from(1n, 3n), Q.from(25n, 3n), 1000));
  assert.equal(tickAt(moved, Q.one).labelOpacity, alpha(middle));
  assert.deepEqual(at(Q.from(25n, 3n)), middle); // Same zoom always gives the same weights.
  for (const tick of middle.ticks)
    for (const field of ['opacity', 'majorOpacity', 'boundaryOpacity', 'labelOpacity'])
      assert(Number.isFinite(tick[field]) && tick[field] >= 0 && tick[field] <= 1);
});

test('major, subdivision and civil breakpoints have continuous spatial alpha on both sides', () => {
  const epsilon = Q.from(1n, 1000000n),
    width = 1200;
  for (const [policy, span] of [
    [{ kind: 'decimal' }, Q.from(BigInt(width), 90n)],
    [{ kind: 'decimal' }, Q.from(BigInt(width), 90n).div(Q.from(10n))],
    [calendar, Q.from(60n * BigInt(width), 70n)],
    [calendar, Q.from(10n * BigInt(width), 9n)],
    [calendar, Q.from(2629800n * BigInt(width), 70n)],
    [calendar, Q.from(86400n, 2n)],
    [{ kind: 'steps', steps: ['1', '60', '3600', '86400'] }, Q.from(BigInt(width), 90n)],
    [{ kind: 'steps', steps: ['1', '60', '3600', '86400'] }, Q.from(60n * BigInt(width), 90n)],
    [{ kind: 'steps', steps: ['1', '60', '3600', '86400'] }, Q.from(86400n * BigInt(width), 90n)],
  ]) {
    const below = planRuler(context(-1n, span.mul(Q.one.sub(epsilon)), width), policy),
      above = planRuler(context(-1n, span.mul(Q.one.add(epsilon)), width), policy);
    const times = new Set([...below.ticks, ...above.ticks].map((t) => t.time.toString()));
    for (const time of times) {
      const a = tickAt(below, Q.parse(time)),
        b = tickAt(above, Q.parse(time));
      for (const field of ['opacity', 'majorOpacity', 'boundaryOpacity', 'labelOpacity'])
        assert(
          Math.abs((a?.[field] ?? 0) - (b?.[field] ?? 0)) < 0.0001,
          `${policy.kind} ${span.toString()} ${time}: ${field} jumped`,
        );
    }
  }
});

test('fade weights stay meaningful for huge coordinates, tiny scales and nearly equal custom steps', () => {
  const scale = Q.from(1n, 10n ** 1100n),
    offset = Q.from(10n ** 1200n);
  const normal = planRuler(context(0n, Q.from(25n, 3n), 1000));
  const huge = planRuler(context(offset, scale.mul(Q.from(25n, 3n)), 1000));
  for (const tick of huge.ticks)
    for (const field of ['opacity', 'majorOpacity', 'boundaryOpacity', 'labelOpacity'])
      assert(Number.isFinite(tick[field]) && tick[field] >= 0 && tick[field] <= 1);
  // Choose the target exactly halfway through two steps closer than floating point can represent.
  const tiny = Q.from(1n, 10n ** 100n),
    step = Q.one.add(tiny),
    target = Q.one.add(tiny.div(Q.from(2n)));
  const plan = planRuler(context(0n, target.mul(Q.from(1000n, 90n)), 1000), {
    kind: 'steps',
    steps: ['1', step.toString()],
  });
  const tick = tickAt(plan, step);
  assert(Math.abs(tick.majorOpacity - 0.5) < 1e-12);
  const presenter = createPresenter({
    ...DEFAULT_PRESENTATION,
    scale: scale.toString(),
    origin: offset.toString(),
  });
  const scaled = presenter.rules(context(offset, Q.from(25n, 3n).mul(scale), 1000));
  for (const original of normal.ticks) {
    const transformed = tickAt(scaled, offset.add(original.time.mul(scale)));
    assert.equal(transformed.labelOpacity, original.labelOpacity);
    original.labels.forEach((label, index) =>
      same(transformed.labels[index].interval, label.interval.mul(scale)),
    );
  }
});
