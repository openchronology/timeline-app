// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Showing and entering times: exact numeric, unit, SI and Gregorian printers and parsers, custom
// code in a restricted sandbox with budgets, and document settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  validateDocument,
  validatePresentation,
  createPresenter,
  printTimeSpan,
  DEFAULT_PRESENTATION,
  CUSTOM_EXAMPLE,
  compileCustom,
  parseNumber,
  printNumber,
  createDifference,
} from '../dist/core.mjs';
import { PostgresStore } from '../server/store.mjs';

const options = (overrides = {}) => validatePresentation({ ...DEFAULT_PRESENTATION, ...overrides });
const document = {
  format: 'openchronology',
  version: 1,
  title: 'Display settings',
  description: '',
  events: [{ id: 'third', time: '1/3', metadata: { title: 'One third' } }],
};

test('numeric printers round decimal text without storing floating point values', () => {
  const float = createPresenter(options({ mode: 'float' }));
  assert.equal(float.print(Q.from(1n, 3n)), '0.333333');
  assert.equal(float.parse('0.333333').toString(), '333333/1000000');
  assert(!float.parse(float.print(Q.from(1n, 3n))).equals(Q.from(1n, 3n)));
  for (const [time, expected] of [
    ['9999999/1000', '10000'],
    ['-9999999/1000', '-10000'],
    ['-1/8', '-0.125'],
    ['1/2000000', '5e-7'],
    ['1/2', '0.5'],
    ['12345/10000', '1.2345'],
  ])
    assert.equal(float.print(Q.parse(time)), expected);
  assert.equal(printNumber(Q.from(999995n, 100000n), 5, true), '1e+1');
  assert.equal(printNumber(Q.from(0n), 6, true), '0e+0');
  assert.equal(printNumber(Q.from(10n ** 1200n), 10), '1e+1200');
  assert.equal(printNumber(Q.from(-1n, 10n ** 1100n), 10), '-1e-1100');
  assert.equal(parseNumber('-1.2345e+1000').toString(), Q.from(-12345n * 10n ** 996n).toString());
  assert.throws(() => parseNumber('1e999999999'), /exponent/);
  assert.throws(() => parseNumber('NaN'), /Expected/);
});

test('unit scales and origins are exact, including scientific and rational entry', () => {
  for (const mode of ['rational', 'float', 'scientific']) {
    const format = createPresenter(options({ mode, scale: '60', origin: '100', unit: 'minutes' }));
    assert.equal(format.parse('1.5 minutes').toString(), '190/1');
    assert.equal(format.parse('1/3 minutes').toString(), '120/1');
    assert.equal(format.parse('1e-3 minutes').toString(), '5003/50');
    const time = Q.from(130n);
    assert(format.parse(format.print(time)).equals(time));
    assert.throws(() => format.parse('1.5 years'), /unit/);
  }
  const years = createPresenter(
    options({ mode: 'float', scale: '31557600000000', unit: 'million years' }),
  );
  assert.equal(years.print(Q.from(63115200000000n)), '2 million years');
  assert.equal(years.parse('2 million years').toString(), '63115200000000/1');
});

test('SI prefixes parse and print exact magnitudes, and rounded prefix boundaries promote', () => {
  const si = createPresenter(options({ mode: 'si', unit: 's' }));
  for (const [time, text] of [
    [Q.from(1n, 1000000n), '1 µs'],
    [Q.from(1500n), '1.5 ks'],
    [Q.from(10n ** 30n), '1 Qs'],
    [Q.from(1n, 10n ** 30n), '1 qs'],
    [Q.from(10n ** 31n), '10 Qs'],
    [Q.from(10n ** 33n), '1e+33 s'],
    [Q.from(-2n, 1000n), '-2 ms'],
    [Q.zero, '0 s'],
  ]) {
    assert.equal(si.print(time), text);
    assert(si.parse(text).equals(time));
  }
  assert.equal(si.parse('1 us').toString(), '1/1000000');
  assert.equal(si.parse('1 μs').toString(), '1/1000000');
  assert.equal(si.parse('2 cs').toString(), '1/50');
  assert.equal(si.parse('2 das').toString(), '20/1');
  assert.equal(si.print(Q.from(9999999n, 10000n)), '1 ks');
});

test('Gregorian printers preserve exact fractions, zones, epochs and legacy MJD coordinates', () => {
  for (const offsetMinutes of [0, -600, 345, 1439, -1439]) {
    const calendar = createPresenter(options({ mode: 'gregorian', offsetMinutes }));
    for (const time of [Q.from(1n, 3n), Q.from(-1n, 7n), Q.from(1709164800n), Q.from(10n ** 100n)])
      assert(calendar.parse(calendar.print(time)).equals(time));
  }
  const mjd = createPresenter(options({ mode: 'gregorian', origin: '40587', scale: '1/86400' }));
  assert.equal(mjd.print(Q.from(0n)), '1858-11-17T00:00:00Z CE');
  assert.equal(mjd.print(Q.from(40587n)), '1970-01-01T00:00:00Z CE');
  assert(mjd.parse('1970-01-01T00:00:00.5Z').equals(Q.from(40587n).add(Q.from(1n, 172800n))));
  assert.throws(() => mjd.parse('1900-02-29T00:00:00Z'), /Invalid/);
});

test('document settings persist while existing exact events and old JSON remain unchanged', () => {
  const old = validateDocument(document);
  assert(!Object.hasOwn(old, 'presentation'));
  assert.deepEqual(new TimelineIndex(old).document(), old);
  const dormant = options({ mode: 'float', source: CUSTOM_EXAMPLE });
  assert.equal(options({ ...dormant, mode: 'gregorian' }).source, CUSTOM_EXAMPLE);
  for (const mode of ['rational', 'float', 'scientific', 'si', 'gregorian', 'custom']) {
    const doc = validateDocument({
      ...document,
      presentation: options({ mode, source: CUSTOM_EXAMPLE }),
    });
    const index = new TimelineIndex(doc),
      formatter = createPresenter(index.presentation);
    formatter.print(Q.parse(index.byId.get('third').time));
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(index.document()))), doc);
    assert.equal(index.document().events[0].time, '1/3');
  }
  for (const bad of [
    { scale: '0' },
    { scale: '-1' },
    { significantDigits: 31 },
    { offsetMinutes: 1440 },
    { unit: '\n' },
    { version: 2 },
    { mode: 'unknown' },
  ])
    assert.throws(() => options(bad));
});

test('custom JavaScript and TypeScript interpret exact arithmetic and explicit rounded parsing', () => {
  for (const source of [
    CUSTOM_EXAMPLE,
    CUSTOM_EXAMPLE.replace(/: (Rational|TimeAPI|string)/g, ''),
  ]) {
    const custom = compileCustom(source);
    assert.equal(custom.print(Q.from(90n)), '1.500000 minutes');
    assert(custom.parse('1.500000 minutes').equals(Q.from(90n)));
    assert(!custom.parse(custom.print(Q.from(1n, 3n))).equals(Q.from(1n, 3n)));
  }
  const source = `function print(time, api) {
    const negative = api.compare(time, api.rational("0")) < 0;
    return negative ? "negative:" + api.exact(time) : "positive:" + api.exact(time);
  }
  function parse(text, api) { return api.parseNumber(text); }`;
  const custom = compileCustom(source);
  assert.equal(custom.print(Q.from(-2n)), 'negative:-2/1');
  assert.equal(custom.print(Q.from(2n)), 'positive:2/1');
  // After a value, + is concatenation however it is spaced; a sign still starts a number
  // where no value comes before it (#193).
  const parseRational = 'function parse(text, api) { return api.rational(text); }';
  const print = (body) =>
    compileCustom(`function print(time, api) { ${body} }\n${parseRational}`).print(Q.from(2n));
  assert.equal(print('return "a" +"b";'), 'ab');
  assert.equal(
    print('return api.compare(time, api.rational("0")) >-1 ? "after" : "before";'),
    'after',
  );
  assert.equal(
    print('return -1 < api.compare(time, api.rational("0")) ? "after" : "before";'),
    'after',
  );
  // `x +1` is x + 1: concatenation, which takes text only.
  assert.throws(() => print('return api.exact(time) +1;'), /Expected text/);
  assert.throws(() => print('return "x" -1;'), /no subtraction operator.*api\.sub/);
});

test('custom code rejects ambient authority, prototype access, imports, loops and calls', () => {
  const parse = 'function parse(text, api) { return api.rational(text); }';
  for (const code of [
    'return fetch("https://example.invalid");',
    'return globalThis;',
    'return window;',
    'return document.cookie;',
    'return api.constructor("return window")();',
    'return api.__proto__;',
    'return api["exact"](time);',
    'return time.constructor;',
    'return time.toString();',
    'return api.exact.call(null, time);',
    'return eval("1");',
    'return Function("return 1")();',
    'return print(time, api);',
    'while (true) {}',
    'for (;;) {}',
    'return import("x");',
    'return new Worker("x");',
    'return this;',
    'api = time; return "x";',
    'return () => "x";',
  ])
    assert.throws(
      () => compileCustom(`function print(time, api) { ${code} } ${parse}`),
      undefined,
      code,
    );
  assert.throws(() => compileCustom('import x from "x";' + CUSTOM_EXAMPLE));
});

test('custom string helpers provide reversible calendar printers', () => {
  const source = `function print(time, api) {
    const date = api.replace(api.timestamp(time), "T", " ");
    const valid = api.endsWith(date, "Z");
    return valid ? api.trim(date) : "invalid";
  }
  function parse(text, api) { return api.parseTimestamp(api.replace(text, " ", "T")); }`;
  const custom = compileCustom(source),
    time = Q.from(1n, 3n);
  assert.equal(custom.print(time), '1970-01-01 00:00:00{+1/3}Z');
  assert(custom.parse(custom.print(time)).equals(time));
  const text = compileCustom(`function print(time, api) {
    const year = api.slice(api.timestamp(time), 0, 4);
    const tag = api.lower(api.upper("years"));
    return api.startsWith(year, "19") ? year + " " + tag : "other";
  } function parse(text, api) { return api.rational(text); }`);
  assert.equal(text.print(Q.zero), '1970 years');
  const badReplacement = compileCustom(
    'function print(time, api) { return api.replace("x", "absent", time); } function parse(text, api) { return api.rational(text); }',
  );
  assert.throws(() => badReplacement.print(Q.one), /Expected text/);
});

test('custom resource limits bound parsing, allocations and native rational arithmetic', () => {
  const parse = 'function parse(text, api) { return api.rational(text); }';
  assert.throws(() => compileCustom(' '.repeat(16385) + CUSTOM_EXAMPLE), /16,384/);
  assert.throws(
    () =>
      compileCustom(
        `function print(time, api) { return ${'('.repeat(100)}"x"${')'.repeat(100)}; } ${parse}`,
      ),
    /complex/,
  );
  let source = 'function print(time, api) { const a = "x";';
  for (let i = 0; i < 12; i++)
    source += `const a${i} = ${i ? 'a' + (i - 1) : 'a'} + ${i ? 'a' + (i - 1) : 'a'};`;
  const doubling = compileCustom(source + `return a11; } ${parse}`);
  assert.throws(() => doubling.print(Q.one), /2048/);
  const huge = compileCustom(
    `function print(time, api) { const q = api.rational("${'9'.repeat(2000)}"); return api.exact(q); } ${parse}`,
  );
  assert.throws(() => huge.print(Q.one), /4096-bit/);
  const exponent = compileCustom(
    'function print(time, api) { return api.exact(time); } function parse(text, api) { return api.parseNumber(text); }',
  );
  assert.throws(() => exponent.parse('1e999999999'), /exponent/);
  assert.throws(() => exponent.print(Q.from(1n << 5000n)), /4096-bit/);
  assert.throws(() => exponent.parse('9'.repeat(3000)), /2048/);
  assert.throws(
    () => compileCustom('function print(time, api) { return time; } ' + parse).print(Q.one),
    /text/,
  );
  assert.throws(
    () =>
      compileCustom(
        'function print(time, api) { return "x"; } function parse(text, api) { return text; }',
      ).parse('1'),
    /rational/,
  );
});

test('custom budgets cap repeated API work and deeply chained expressions', () => {
  const parse = 'function parse(text, api) { return api.rational(text); }';
  const manyCalls = Array.from({ length: 128 }, (_, i) => `const q${i} = api.exact(time);`).join(
    '\n',
  );
  const calls = compileCustom(
    `function print(time, api) { ${manyCalls} return api.exact(time); } ${parse}`,
  );
  assert.throws(() => calls.print(Q.one), /API call budget/);
  const manyAdds = Array.from(
    { length: 20 },
    (_, i) => `const q${i} = api.add(time, api.rational("0"));`,
  ).join('\n');
  const work = compileCustom(`function print(time, api) { ${manyAdds} return "ok"; } ${parse}`);
  assert.throws(() => work.print(Q.from(1n << 4000n)), /arithmetic budget/);
  const deep = compileCustom(
    `function print(time, api) { return ${Array(80).fill('"x"').join(' + ')}; } ${parse}`,
  );
  assert.throws(() => deep.print(Q.one), /execution budget/);
});

test('Postgres snapshot replacements bind presentation as JSON data and preserve it on read', async () => {
  const presentation = options({ mode: 'custom', source: CUSTOM_EXAMPLE });
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return {
        rows: /^SELECT event FROM .*oc_moments/.test(sql)
          ? [{ event: document.events[0] }]
          : sql.includes('AS added')
            ? [{ added: true }]
            : sql.includes('index_clock')
              ? [{ clock: '1', pinned: '' }]
              : [],
      };
    },
    release() {},
  };
  const store = new PostgresStore({ connect: async () => client });
  await store.replace(client, 'timeline-id', { ...document, presentation });
  const write = queries.find((q) => q.sql.startsWith('UPDATE oc_timelines SET title='));
  assert.match(write.sql, /presentation=\$6::jsonb/);
  assert.deepEqual(JSON.parse(write.values[5]), presentation);
  store.access = async () => ({ title: document.title, description: '', presentation });
  const snapshot = await store.snapshot('timeline-id', 'user-id');
  assert.deepEqual(snapshot.document.presentation, presentation);
  assert.deepEqual(validateDocument(snapshot.document).events, document.events);
  queries.length = 0;
  await store.replace(client, 'timeline-id', document);
  assert.equal(
    queries.find((q) => q.sql.startsWith('UPDATE oc_timelines SET title=')).values[5],
    null,
  );
});

test('time differences use the units of their time display', () => {
  const gregorian = createDifference(options({ mode: 'gregorian' }));
  const roundTrip = (difference, text, stored, printed) => {
    const value = difference.parse(text);
    assert.equal(value.toString(), stored, text);
    assert.equal(difference.print(value), printed, text);
  };
  // Years and months are the Gregorian calendar's means (365.2425 days and a twelfth of it).
  roundTrip(gregorian, '2 years 3 days', '63373104/1', '2 years 3 days');
  roundTrip(gregorian, '1 year', '31556952/1', '1 year');
  roundTrip(gregorian, '12 months', '31556952/1', '1 year');
  roundTrip(gregorian, '-1 h 30 min', '-5400/1', '-1 h 30 min');
  roundTrip(gregorian, '1.5 weeks', '907200/1', '10 days 12 h');
  roundTrip(gregorian, '2 Days, 4 hours', '187200/1', '2 days 4 h');
  roundTrip(gregorian, '90', '90/1', '1 min 30 s');
  roundTrip(gregorian, '250 ms', '1/4', '250 ms');
  roundTrip(gregorian, '3 ps', '3/1000000000000', '3 ps');
  roundTrip(gregorian, '1/3 s', '1/3', '1000/3 ms');
  roundTrip(gregorian, '+1e3 as', '1/1000000000000000', '1 fs');
  assert.equal(gregorian.print(Q.zero), '0 s');
  for (const [text, message] of [
    ['3 parsecs', /Unknown unit “parsecs”; use years, months, weeks, days, h, min, s/],
    ['1 day 3', /Give a unit for every amount/],
    ['', /Enter a time difference/],
    ['2 days later', /Unexpected “later”|Unknown unit “later”/],
  ])
    assert.throws(() => gregorian.parse(text), message);
  // Units are in stored coordinates: a display of milliseconds scales them.
  const millis = createDifference(options({ mode: 'gregorian', scale: '1/1000' }));
  assert.equal(millis.parse('1 s').toString(), '1/1000');
  assert.equal(millis.print(Q.parse('1/1000')), '1 s');

  // Rational coordinates take plain rational offsets; a unit label is optional.
  const rational = createDifference(DEFAULT_PRESENTATION);
  assert.deepEqual(rational.units, []);
  roundTrip(rational, '-3/2', '-3/2', '-1.5');
  roundTrip(rational, '1/3', '1/3', '1/3');
  assert.throws(() => rational.parse('2 days'), /no units/);
  const labelled = createDifference(
    options({ mode: 'float', unit: 'million years', scale: '31557600000000' }),
  );
  roundTrip(labelled, '2.5 million years', '78894000000000/1', '2.5 million years');
  assert.equal(labelled.parse('3').toString(), '94672800000000/1');
  // A display unit that is a fixed time unit brings the others.
  const minutes = createDifference(options({ mode: 'float', unit: 'minutes', scale: '60' }));
  roundTrip(minutes, '1 h 30 min 30 s', '5430/1', '1 h 30 min 30 s');
  assert.equal(minutes.parse('2').toString(), '120/1');
  assert.throws(() => minutes.parse('1 year'), /Unknown unit “year”/);

  // SI displays take prefixed units, case-sensitively.
  const si = createDifference(options({ mode: 'si', unit: 's' }));
  roundTrip(si, '5 ms', '1/200', '5 ms');
  roundTrip(si, '3 ks', '3000/1', '50 min');
  assert.equal(si.parse('4 Ms').toString(), '4000000/1');
  assert.equal(si.parse('2 h').toString(), '7200/1');
  assert.equal(si.parse('7 us').toString(), '7/1000000');
  const metres = createDifference(options({ mode: 'si', unit: 'm' }));
  roundTrip(metres, '3 km 20 m', '3020/1', '3.02 km');
  assert.equal(metres.parse('2 mm').toString(), '1/500');
  assert.equal(metres.parse('2 Mm').toString(), '2000000/1');
});

test('custom time displays may define their own differences', () => {
  const custom = (source) => createDifference(options({ mode: 'custom', source }));
  // Without difference functions, offsets are plain stored coordinates.
  const plain = custom(CUSTOM_EXAMPLE);
  assert.equal(plain.parse('120').toString(), '120/1');
  assert.equal(plain.print(Q.parse('1/3')), '1/3');
  const days = custom(
    CUSTOM_EXAMPLE +
      `
function printDifference(difference: Rational, api: TimeAPI): string {
  return api.exact(api.div(difference, api.rational("86400"))) + " sols";
}
function parseDifference(text: string, api: TimeAPI): Rational {
  return api.mul(api.parseNumber(api.stripSuffix(text, " sols")), api.rational("86400"));
}`,
  );
  assert.equal(days.parse('3 sols').toString(), '259200/1');
  assert.equal(days.print(Q.parse('129600')), '3/2 sols');
  assert.equal(days.plain, null);
  assert.throws(() => days.parse('3 days'), /Expected suffix/);
  // Each function is defined at most once, with its own types.
  assert.throws(
    () =>
      compileCustom(
        CUSTOM_EXAMPLE + 'function printDifference(d: string, api: TimeAPI): string { return d; }',
      ),
    /Unsupported type annotation/,
  );
  assert.throws(
    () =>
      compileCustom(
        CUSTOM_EXAMPLE + 'function offset(d: Rational, api: TimeAPI): string { return "x"; }',
      ),
    /optionally printDifference and parseDifference/,
  );
});

test('a timeline’s span reads in its own time display, as precise as its length (#338)', () => {
  const gregorian = { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    at = (text) => createPresenter(gregorian).parse(text),
    span = (settings, a, b) => printTimeSpan(settings, a, b);
  // Gregorian: years for a life, months, days, then clock times with the zone.
  assert.equal(
    span(gregorian, at('1809-02-12T00:00:00Z'), at('1865-04-15T07:22:00Z')),
    '1809 CE – 1865 CE',
  );
  assert.equal(
    span(gregorian, at('1944-03-06T00:00:00Z'), at('1945-08-25T00:00:00Z')),
    'Mar 1944 CE – Aug 1945 CE',
  );
  assert.equal(
    span(gregorian, at('1944-06-06T00:00:00Z'), at('1944-06-25T00:00:00Z')),
    '6 Jun 1944 CE – 25 Jun 1944 CE',
  );
  assert.equal(
    span(gregorian, at('2026-10-26T13:05:00Z'), at('2026-10-26T16:12:30Z')),
    '26 Oct 2026 CE 13:05 – 16:12 UTC',
  );
  assert.equal(
    span(
      { ...gregorian, offsetMinutes: 60 },
      at('2026-10-26T13:05:00Z'),
      at('2026-10-26T13:07:30Z'),
    ),
    '26 Oct 2026 CE 14:05:00 – 14:07:30 UTC+01:00',
  );
  assert.equal(span(gregorian, at('3000 BCE'), at('30 BCE')), '3000 BCE – 30 BCE');
  // Deep time: ages.
  assert.equal(span(gregorian, at('66 mya'), at('2000 CE')), '66 mya – 2000 CE');
  assert.equal(span(gregorian, at('4.5 bya'), at('66 mya')), '4.5 bya – 66 mya');
  // Numbers: the unit once, with digits enough for the span; coordinates as decimals.
  const years = { ...DEFAULT_PRESENTATION, mode: 'float', unit: 'years', scale: '31557600' };
  assert.equal(span(years, Q.parse('0'), Q.parse('3155760000')), '0 – 100 years');
  assert.equal(span(years, Q.parse('31557600000'), Q.parse('31873176000')), '1000 – 1010 years');
  assert.equal(span(undefined, Q.parse('0'), Q.parse('24')), '0 – 24');
  assert.equal(span(undefined, Q.parse('1/3'), Q.parse('1/3')), '0.333');
  assert.equal(
    span({ ...DEFAULT_PRESENTATION, mode: 'si', unit: 'm' }, Q.parse('1/1000'), Q.parse('1/4')),
    '1 mm – 250 mm',
  );
  // A custom script prints each end as it does for inputs.
  assert.equal(
    span(
      { ...DEFAULT_PRESENTATION, mode: 'custom', source: CUSTOM_EXAMPLE },
      Q.parse('60'),
      Q.parse('600'),
    ),
    '1.000000 minutes – 10.000000 minutes',
  );
});
