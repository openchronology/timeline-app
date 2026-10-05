import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  validateDocument,
  validatePresentation,
  createPresenter,
  DEFAULT_PRESENTATION,
  CUSTOM_EXAMPLE,
  compileCustom,
  parseNumber,
  printNumber,
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
  assert.equal(mjd.print(Q.from(0n)), '1858-11-17T00:00:00Z');
  assert.equal(mjd.print(Q.from(40587n)), '1970-01-01T00:00:00Z');
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
      return { rows: sql.includes('oc_events') ? [{ event: document.events[0] }] : [] };
    },
    release() {},
  };
  const store = new PostgresStore({ connect: async () => client });
  await store.replace(client, 'timeline-id', { ...document, presentation });
  const write = queries.find((q) => q.sql.startsWith('UPDATE oc_timelines SET'));
  assert.match(write.sql, /presentation=\$6::jsonb/);
  assert.deepEqual(JSON.parse(write.values[5]), presentation);
  store.access = async () => ({ title: document.title, description: '', presentation });
  const snapshot = await store.snapshot('timeline-id', 'user-id');
  assert.deepEqual(snapshot.document.presentation, presentation);
  assert.deepEqual(validateDocument(snapshot.document).events, document.events);
  queries.length = 0;
  await store.replace(client, 'timeline-id', document);
  assert.equal(queries.find((q) => q.sql.startsWith('UPDATE oc_timelines SET')).values[5], null);
});
