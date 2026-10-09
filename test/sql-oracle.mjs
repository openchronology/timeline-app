// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Run against an installed pgmp in a disposable database. --pg-data supports restricted local environments.
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  validateDocument,
  DEFAULT_PRESENTATION,
  CUSTOM_EXAMPLE,
  MOMENT_ICONS,
  MOMENT_STACKS,
} from '../dist/core.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { createPluginLibrary } from '../server/plugins.mjs';
import { PLUGIN_EXAMPLE, validatePluginManifest } from '../dist/core.mjs';
import { indexedNodes } from '../server/tree.mjs';
const value = (s) => (s === null ? 'NULL' : "'" + String(s).replaceAll("'", "''") + "'");
const directory = await mkdtemp(join(tmpdir(), 'openchronology-sql-')),
  answers = join(directory, 'answers.json');
const events = [];
for (let i = 0; i < 90; i++)
  events.push({
    id: `event-${i.toString().padStart(3, '0')}`,
    time: Q.from(BigInt(((i * 37) % 127) - 60), 17n).toString(),
    metadata: { title: `Event ${i}` },
  });
events.push(
  { id: 'same-a', time: '1/2', metadata: {} },
  { id: 'same-b', time: '2/4', metadata: {} },
);
const offset = 10n ** 1200n,
  scale = 10n ** 1100n;
for (let i = 0; i < 12; i++)
  events.push({
    id: `huge-${i.toString().padStart(2, '0')}`,
    time: Q.from(offset * scale + BigInt(i), scale).toString(),
    metadata: { title: `Huge ${i}` },
  });
events[0].metadata.iconUrl = 'https://images.example/icon.png';
events[0].metadata.stack = [
  {
    id: 'first',
    metadata: {
      title: 'First child',
      description: 'Notes',
      iconUrl: 'https://images.example/child.png',
    },
  },
  { id: 'second', metadata: { title: 'Second child', extra: { enabled: true } } },
];
const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'SQL oracle',
    plugins: [
      { manifest: MOMENT_ICONS, enabled: true },
      { manifest: MOMENT_STACKS, enabled: true },
    ],
    description: '',
    presentation: {
      ...DEFAULT_PRESENTATION,
      mode: 'custom',
      source: CUSTOM_EXAMPLE,
      ruler: { kind: 'steps', steps: ['1', '60', '3600', '86400'] },
    },
    events,
  }),
  index = new TimelineIndex(document),
  tree = indexedNodes(document);
const owner = randomUUID(),
  id = randomUUID(),
  sql = [
    'BEGIN;',
    await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'),
    // Upgrade a version-1 installation without the settings column inside this rolled-back test transaction.
    'ALTER TABLE oc_timelines DROP COLUMN presentation;',
    'ALTER TABLE oc_timelines DROP COLUMN plugins;',
    await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'),
    `INSERT INTO oc_users(id,username,password_hash) VALUES(${value(owner)},'sql-oracle','unused');`,
    `INSERT INTO oc_timelines(id,owner_id,title,root,event_count,presentation,plugins) VALUES(${value(id)},${value(owner)},'Oracle',${tree.root},${tree.count},${value(JSON.stringify(document.presentation))}::jsonb,${value(JSON.stringify(document.plugins))}::jsonb);`,
  ];
// Tree nodes name their moments, which live in their own rows.
const nodeRow = (timeline, n) =>
  `(${[timeline, n.id, n.time, n.first, n.last, n.left, n.right, n.firstId, n.bucketCount, n.count, n.distinct, null].map(value).join(',')},ARRAY[${n.ids.map(value).join(',')}]::text[],${n.height})`;
const momentRows = (timeline, list) =>
  list
    .map((e) => `(${[timeline, e.id, e.time, JSON.stringify(e)].map(value).join(',')})`)
    .join(',');
for (const n of tree.nodes) sql.push(`INSERT INTO oc_nodes VALUES ${nodeRow(id, n)};`);
sql.push(`INSERT INTO oc_moments VALUES ${momentRows(id, document.events)};`);
sql.push('CREATE TEMP TABLE oracle_results(id integer,answer jsonb);');
const trials = [];
for (let i = 0; i < 80; i++)
  trials.push({
    lower: Q.from(BigInt((i % 17) - 8), 3n),
    upper: Q.from(BigInt(((i * 7) % 23) - 8), 3n),
    threshold: Q.from(BigInt(i % 7), 17n),
  });
for (const threshold of [Q.zero, Q.from(1n, scale), Q.from(4n, scale), Q.one])
  trials.push({ lower: Q.from(offset), upper: Q.from(offset * scale + 12n, scale), threshold });
trials.push({ lower: Q.parse('1/2'), upper: Q.parse('1/2'), threshold: Q.zero });
const expected = [];
for (const [i, q] of trials.entries()) {
  expected.push(
    index.points
      .overview(q.lower, q.upper, q.threshold, 'span', { includeUpper: true })
      .groups.map((g) => ({
        first: g.firstTime.toString(),
        last: g.lastTime.toString(),
        count: g.entryCount.toString(),
        distinct: g.distinctCount,
      })),
  );
  sql.push(
    `INSERT INTO oracle_results SELECT ${i},coalesce(jsonb_agg(jsonb_build_object('first',first_time,'last',last_time,'count',event_count,'distinct',distinct_count)),'[]'::jsonb) FROM oc_overview(${value(id)},${value(q.lower.toString())}::mpq,${value(q.upper.toString())}::mpq,${value(q.threshold.toString())}::mpq);`,
  );
}
// A densely populated tree must collapse through its cache, without fetching every event.
const denseId = randomUUID(),
  denseDoc = {
    format: 'openchronology',
    version: 1,
    title: 'Dense',
    description: '',
    events: Array.from({ length: 5000 }, (_, i) => ({
      id: `dense-${i.toString().padStart(5, '0')}`,
      time: Q.from(BigInt(i), 1000000000n).toString(),
      metadata: {},
    })),
  },
  dense = indexedNodes(denseDoc);
sql.push(
  `INSERT INTO oc_timelines(id,owner_id,title,root,event_count) VALUES(${value(denseId)},${value(owner)},'Dense',${dense.root},${dense.count});`,
);
for (let start = 0; start < dense.nodes.length; start += 250)
  sql.push(
    'INSERT INTO oc_nodes VALUES ' +
      dense.nodes
        .slice(start, start + 250)
        .map((n) => nodeRow(denseId, n))
        .join(',') +
      ';',
  );
sql.push(`INSERT INTO oc_moments VALUES ${momentRows(denseId, denseDoc.events)};`);
const community = validatePluginManifest({
  ...PLUGIN_EXAMPLE,
  id: 'u-' + owner.replaceAll('-', '') + '-status-symbols',
});
sql.push(
  `INSERT INTO oc_plugins(id,version,owner_id,manifest) VALUES(${value(community.id)},1,${value(owner)},${value(JSON.stringify(community))}::jsonb);`,
);
let catalogueSQL;
await createPluginLibrary(undefined, {
  query: async (query, args) => {
    catalogueSQL = query.replace(/\$(\d+)/g, (_, i) => value(args[Number(i) - 1]));
    return { rows: [{ total: 0, plugins: [] }] };
  },
}).search({ search: 'status-symbols', page: 1, limit: 12 });
let searchSQL;
const searchPool = {
  query: async (query, args) => {
    searchSQL = query.replace(/\$(\d+)/g, (_, i) => {
      const parameter = args[Number(i) - 1];
      return Array.isArray(parameter)
        ? value('{' + parameter.join(',') + '}')
        : typeof parameter === 'boolean'
          ? parameter
            ? 'TRUE'
            : 'FALSE'
          : value(parameter);
    });
    return { rows: [{ total: 0, timelines: [] }] };
  },
};
sql.push(
  `UPDATE oc_timelines SET visibility='public',tags=ARRAY['astronomy'],description='A star map of early navigation',event_text='Telescope calibration',featured=true WHERE id=${value(id)};`,
);
await searchTimelines(searchPool, null, { search: '"star map"', tag: 'astronomy' });
sql.push(
  `COPY (SELECT encode(convert_to(row_to_json(result)::text,'UTF8'),'hex') FROM (${searchSQL}) result) TO ${value(join(directory, 'search.hex'))};`,
);
await searchTimelines(searchPool, null, { scope: 'public' });
sql.push(
  `COPY (SELECT encode(convert_to(row_to_json(result)::text,'UTF8'),'hex') FROM (${searchSQL}) result) TO ${value(join(directory, 'browse.hex'))};`,
);
const proposalId = randomUUID();
sql.push(
  `INSERT INTO oc_proposals(id,timeline_id,author_id,title,base_revision,base_document,document) VALUES(${value(proposalId)},${value(id)},${value(owner)},'Review',1,${value(JSON.stringify(document))}::jsonb,${value(JSON.stringify(document))}::jsonb);`,
);
sql.push(
  `INSERT INTO oc_proposal_comments(proposal_id,author_id,body) VALUES(${value(proposalId)},${value(owner)},'Plain comment');`,
);
sql.push(
  `COPY (SELECT encode(convert_to(row_to_json(result)::text,'UTF8'),'hex') FROM (${catalogueSQL}) result) TO ${value(join(directory, 'catalogue.hex'))};`,
);
sql.push(
  `COPY (SELECT jsonb_build_object('pluginFrame',(SELECT to_jsonb(g) FROM oc_overview_v2(${value(id)},${value(events[0].time)}::mpq,${value(events[0].time)}::mpq,'0'::mpq) g LIMIT 1),'coincidentFrame',(SELECT to_jsonb(g) FROM oc_overview_v2(${value(id)},'1/2'::mpq,'1/2'::mpq,'0'::mpq) g LIMIT 1),'groups',(SELECT jsonb_agg(answer ORDER BY id) FROM oracle_results),'dense',(SELECT jsonb_agg(to_jsonb(g)) FROM oc_overview(${value(denseId)},'0'::mpq,'1'::mpq,'1'::mpq) g),'page',(SELECT jsonb_agg(e) FROM oc_events(${value(id)},'1/2'::mpq,'1/2'::mpq,NULL,NULL,1) e),'after',(SELECT jsonb_agg(e) FROM oc_events(${value(id)},'1/2'::mpq,'1/2'::mpq,'1/2'::mpq,'same-a',1) e))) TO ${value(answers)};`,
  // Hex avoids COPY's text escaping of quotes/backslashes in custom formatter source.
  `COPY (SELECT encode(convert_to(presentation::text,'UTF8'),'hex') FROM oc_timelines WHERE id=${value(id)}) TO ${value(join(directory, 'settings.hex'))};`,
  `COPY (SELECT encode(convert_to(plugins::text,'UTF8'),'hex') FROM oc_timelines WHERE id=${value(id)}) TO ${value(join(directory, 'plugins.hex'))};`,
  'ROLLBACK;',
);
const dataIndex = process.argv.indexOf('--pg-data'),
  data = dataIndex < 0 ? null : resolve(process.argv[dataIndex + 1]);
const command = data
  ? ['postgres', ['--single', '-j', '-D', data, 'postgres']]
  : ['psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', process.env.DATABASE_URL ?? '']];
const script = join(directory, 'test.sql');
await writeFile(script, sql.join('\n').replaceAll('\n\n', '\n') + '\n\n');
const fd = openSync(script, 'r');
const result = spawnSync(command[0], command[1], {
  stdio: [fd, 'pipe', 'pipe'],
  encoding: 'utf8',
  maxBuffer: 5 * 1024 * 1024,
  timeout: 120000,
});
closeSync(fd);
if (result.status !== 0 || result.error || /\b(?:ERROR|FATAL):/.test(result.stderr ?? ''))
  throw new Error(
    (result.error?.message ?? 'PostgreSQL failed') +
      '\n' +
      result.stderr +
      '\n' +
      result.stdout.slice(-2000),
  );
const actual = JSON.parse(await readFile(answers, 'utf8'));
const settings = JSON.parse(
  Buffer.from((await readFile(join(directory, 'settings.hex'), 'utf8')).trim(), 'hex').toString(
    'utf8',
  ),
);
assert.deepEqual(settings, document.presentation);
assert.deepEqual(
  JSON.parse(
    Buffer.from((await readFile(join(directory, 'plugins.hex'), 'utf8')).trim(), 'hex').toString(
      'utf8',
    ),
  ),
  document.plugins,
);
const readHex = async (name) =>
  JSON.parse(
    Buffer.from((await readFile(join(directory, name), 'utf8')).trim(), 'hex').toString('utf8'),
  );
const searched = await readHex('search.hex');
assert.equal(Number(searched.total), 1);
assert.equal(searched.timelines[0].id, id);
const browsed = await readHex('browse.hex');
assert.equal(Number(browsed.total), 1);
assert.equal(browsed.timelines[0].id, id);
assert(browsed.timelines[0].featured);
const catalogue = JSON.parse(
  Buffer.from((await readFile(join(directory, 'catalogue.hex'), 'utf8')).trim(), 'hex').toString(
    'utf8',
  ),
);
assert.equal(Number(catalogue.total), 1);
assert.deepEqual(catalogue.plugins, [community]);
assert.equal(actual.pluginFrame.metadata.iconUrl, events[0].metadata.iconUrl);
assert.deepEqual(actual.pluginFrame.metadata.stack, events[0].metadata.stack);
assert.equal(actual.pluginFrame.event_id, events[0].id);
assert.equal(actual.coincidentFrame.metadata, null);
assert.deepEqual(actual.groups, expected);
assert.equal(actual.dense.length, 1);
assert.equal(actual.dense[0].event_count, '5000');
assert.equal(actual.dense[0].visited_nodes, 1);
assert.equal(actual.page[0].id, 'same-a');
assert.equal(actual.after[0].id, 'same-b');
console.log(
  `PASS PostgreSQL: ${trials.length} exact overview cases, bounded duplicate pagination, and a 5,000-event overview using one node visit.`,
);
