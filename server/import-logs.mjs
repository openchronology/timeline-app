#!/usr/bin/env node
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Imports log files into timelines through the API (docs/log-import.md): one moment per log
 * entry, routed like the syslog receiver, saved in batches with backpressure so that nothing
 * is dropped, and with IDs from each entry's text so that importing again overwrites.
 *
 *   OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... \
 *     och-import-logs --format nginx-combined --timeline <uuid> /var/log/nginx/access.log*
 */
import { createReadStream, realpathSync } from 'node:fs';
import { open, readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfiguration } from './env-file.mjs';
import { pathToFileURL } from 'node:url';
import { BUILTIN_FORMATS, compileFormat, parseZone, isoTime } from './log-formats.mjs';
import { compileMapping, checkMoment, EntryIds } from './log-mapping.mjs';
import { compileRoutes, parseFilter } from './log-routes.mjs';
import { TimelineWriter, BATCH_LIMIT, BATCH_BYTES, temporary } from './timeline-writer.mjs';
import { MAX_MESSAGE_BYTES } from './syslog.mjs';

/** Exit codes: success, some entries not saved, a usage or configuration error, over quota. */
export const EXIT = { ok: 0, partial: 1, usage: 2, quota: 3 };
/**
 * Bytes charged for a moment's version in saved history (PostgreSQL's jsonb as text) per
 * byte of its JSON.
 */
const VERSION_RATIO = 1.1;
const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

export const HELP = `Usage: och-import-logs [options] <file | file.gz | -> ...

Imports log files into OpenChronology timelines, one moment per log entry. Files are read
in the order given; "-" reads standard input. Importing the same logs again overwrites the
moments it added before instead of adding them twice.

Options:
  --format <name>       ${Object.keys(BUILTIN_FORMATS).join(', ')},
                        or a format defined in the configuration file
  --config <file>       JSON configuration: custom formats, routes, filters (see docs)
  --timeline <uuid>     Send entries no route matches to this timeline
  --timezone <zone>     Zone of times without one: UTC, +02:00 or Europe/Berlin
                        (default: this computer's zone)
  --year <year>         Year of the first classic syslog time (default: at or before
                        each file's modification time)
  --only <filter>       Import only matching entries, e.g. status>=400, host=web-*,
                        severity>=warning; repeat to require several
  --since <time>        Import entries at or after an ISO 8601 time
  --until <time>        Import entries at or before an ISO 8601 time
  --dry-run             Read and report, without writing: counts per timeline, the first
                        moments as JSON and the storage estimate
  --sample <n>          Moments shown by --dry-run (default 3)
  --quiet               No progress display (the final summary is still printed)
  --help                This text

Environment:
  OCH_API_URL           The server, such as https://timescale.info
  OCH_API_KEY           A read/write API key (och_key_...)

Exit codes: 0 imported; 1 some entries were refused or could not be saved;
2 usage or configuration error; 3 the import does not fit the account's storage quota.
`;

const CONFIG_KEYS = [
  'format',
  'formats',
  'timezone',
  'year',
  'routes',
  'default',
  'only',
  'since',
  'until',
  'multiline',
];
/** Command-line arguments and the configuration file, checked; throws usage errors. */
export async function options(argv, env = process.env) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: 'string' },
      config: { type: 'string' },
      timeline: { type: 'string' },
      timezone: { type: 'string' },
      year: { type: 'string' },
      only: { type: 'string', multiple: true },
      since: { type: 'string' },
      until: { type: 'string' },
      'dry-run': { type: 'boolean' },
      sample: { type: 'string' },
      quiet: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return { help: true };
  let config = {};
  if (values.config) {
    try {
      config = JSON.parse(await readFile(values.config, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot read the configuration ${values.config}: ${error.message}`);
    }
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new Error('The configuration must be a JSON object.');
    const unknown = Object.keys(config).filter((k) => !CONFIG_KEYS.includes(k));
    if (unknown.length) throw new Error(`Unknown configuration settings: ${unknown.join(', ')}`);
  }
  if (!positionals.length)
    throw new Error('Name the log files to import ("-" for standard input).');
  const formats = config.formats ?? {};
  if (typeof formats !== 'object' || Array.isArray(formats))
    throw new Error('"formats" maps format names to definitions.');
  const formatName = values.format ?? config.format;
  if (!formatName) throw new Error('Choose a --format.');
  if (!BUILTIN_FORMATS[formatName] && !formats[formatName])
    throw new Error(
      `Unknown format ${formatName} (built in: ${Object.keys(BUILTIN_FORMATS).join(', ')}).`,
    );
  const timezone = values.timezone ?? config.timezone ?? 'local';
  const zone = parseZone(timezone);
  const year = values.year ?? config.year;
  if (year !== undefined && !/^\d{4}$/.test(String(year)))
    throw new Error('--year is a four-digit year.');
  const timeLimit = (text, name) => {
    if (text === undefined) return null;
    try {
      return isoTime(text, zone).ms;
    } catch {
      throw new Error(`--${name} must be an ISO 8601 time.`);
    }
  };
  const routing = {
    routes: config.routes ?? [],
    ...((values.timeline ?? config.default) ? { default: values.timeline ?? config.default } : {}),
  };
  const dryRun = !!values['dry-run'];
  let routes = null;
  if (routing.routes.length || routing.default) routes = compileRoutes(routing);
  else if (!dryRun) throw new Error('Give a --timeline, or routes in the configuration.');
  const filters = [...(config.only ?? []), ...(values.only ?? [])].map(parseFilter);
  const multiline = config.multiline ?? formats[formatName]?.multiline ?? null;
  if (multiline !== null) {
    if (
      typeof multiline !== 'object' ||
      (multiline.start === undefined) === (multiline.continuation === undefined)
    )
      throw new Error('multiline is { "start": regex } or { "continuation": regex }.');
    for (const key of ['start', 'continuation'])
      if (multiline[key] !== undefined)
        try {
          multiline[key] = new RegExp(multiline[key]);
        } catch (error) {
          throw new Error(`multiline ${key}: ${error.message}`);
        }
  }
  const sample = values.sample === undefined ? 3 : Number(values.sample);
  if (!Number.isInteger(sample) || sample < 0 || sample > 1000)
    throw new Error('--sample is 0–1000.');
  const definition = formats[formatName] ?? {};
  // Compile once now so that configuration errors stop the import before any reading.
  compileMapping(compileFormat(formatName, definition, { zone }), definition);
  let writer = null;
  if (!dryRun || (env.OCH_API_URL && env.OCH_API_KEY))
    writer = new TimelineWriter({ api: env.OCH_API_URL, key: env.OCH_API_KEY });
  return {
    inputs: positionals,
    formatName,
    definition,
    zone,
    year: year === undefined ? null : Number(year),
    since: timeLimit(values.since ?? config.since, 'since'),
    until: timeLimit(values.until ?? config.until, 'until'),
    routes,
    filters,
    multiline,
    dryRun,
    sample,
    quiet: !!values.quiet,
    writer,
  };
}

/** Counts bytes passing through, for progress. */
const counter = (count) =>
  new Transform({
    transform(chunk, _encoding, done) {
      count(chunk.length);
      done(null, chunk);
    },
  });
/**
 * Entries of one input: lines (from a gzip file when it starts with the gzip magic), joined
 * by the multi-line rule. Calls `onBytes` with the bytes read from the file.
 */
async function* entries(path, multiline, onBytes) {
  let stream = createReadStream(path).pipe(counter(onBytes));
  const head = await open(path, 'r').then(async (file) => {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(2), 0, 2, 0);
    await file.close();
    return buffer.subarray(0, bytesRead);
  });
  if (head[0] === 0x1f && head[1] === 0x8b) stream = stream.pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let current = null;
  for await (const raw of lines) {
    const line = raw.replace(/^﻿/, '');
    const joins =
      current !== null &&
      (multiline?.continuation
        ? multiline.continuation.test(line)
        : multiline?.start
          ? !multiline.start.test(line)
          : false);
    if (joins) {
      if (current.length < MAX_MESSAGE_BYTES) current += '\n' + line;
      continue;
    }
    if (current !== null) yield current;
    current = line.trim() ? line : null;
  }
  if (current !== null) yield current;
}

/**
 * The most entries (moments and durations) one save may carry for the server to apply it in
 * place: max(64, the timeline's moments ÷ 2) (see incremental in incremental.mjs). Larger
 * saves rebuild a small timeline's whole index, so a log saved in large batches would
 * rebuild the growing timeline per save; batches grow with the timeline instead.
 */
export const batchLimit = (count) => Math.min(BATCH_LIMIT - 1, Math.max(64, Math.floor(count / 2)));
/**
 * Storage an import adds, as the server charges it: the document's growth, and per save the
 * versions it keeps in history (the batch, as stored), plus one copy of the timeline when
 * its first save starts keeping history as rows; only the growth for a timeline that keeps
 * no saved history. `timelines` maps each timeline to its starting size ({ count, bytes,
 * history, keepHistory }, history false until it keeps rows, keepHistory false when it keeps
 * none) and its batches ({ entries, moments, bytes }).
 */
export function storageEstimate(timelines) {
  let total = 0;
  for (const { start, batches } of timelines.values()) {
    const versions = start.keepHistory === false ? 0 : VERSION_RATIO;
    if (versions && start.history === false && batches.length) total += start.bytes * versions;
    for (const batch of batches) total += batch.bytes * (1 + versions);
  }
  return Math.round(total);
}

const short = (id) => id.slice(0, 8);
const bytesText = (n) =>
  n >= 1 << 30
    ? (n / (1 << 30)).toFixed(1) + ' GiB'
    : n >= 1 << 20
      ? (n / (1 << 20)).toFixed(1) + ' MiB'
      : n >= 1024
        ? (n / 1024).toFixed(1) + ' KiB'
        : n + ' B';
const duration = (seconds) => {
  if (!Number.isFinite(seconds)) return '?';
  const s = Math.round(seconds);
  return s >= 3600
    ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`
    : s >= 60
      ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
      : `${s}s`;
};

/**
 * Progress on stderr: redrawn in place a few times a second on a terminal, otherwise a line
 * every ten seconds; off when quiet. The final summary is always printed.
 */
export class Progress {
  constructor({
    stream = process.stderr,
    quiet = false,
    total = 0,
    now = () => performance.now(),
  }) {
    this.stream = stream;
    this.quiet = quiet;
    this.tty = !!stream.isTTY;
    this.total = total;
    this.now = now;
    this.started = now();
    this.last = -Infinity;
    this.frame = 0;
    this.stats = {
      bytes: 0,
      entries: 0,
      skipped: 0,
      filtered: 0,
      unrouted: 0,
      refused: 0,
      saved: new Map(),
    };
  }
  line() {
    const s = this.stats,
      elapsed = (this.now() - this.started) / 1000;
    const read = this.total
      ? `${bytesText(s.bytes)}/${bytesText(this.total)} ${((s.bytes / this.total) * 100).toFixed(0)}%`
      : `${'|/-\\'[this.frame++ % 4]} ${bytesText(s.bytes)}`;
    const saved = [...s.saved].map(([id, n]) => `${short(id)} ${n}`).join(', ') || '0';
    const rate = elapsed > 0 ? Math.round(s.entries / elapsed) : 0;
    const eta =
      this.total && s.bytes ? duration((elapsed * (this.total - s.bytes)) / s.bytes) : '?';
    const others = ['skipped', 'filtered', 'unrouted', 'refused']
      .filter((k) => s[k])
      .map((k) => `${k} ${s[k]}`)
      .join(' · ');
    return `${read} · ${s.entries} entries · saved ${saved} · ${rate}/s · ${duration(elapsed)}${this.total ? ' · ETA ' + eta : ''}${others ? ' · ' + others : ''}`;
  }
  tick() {
    if (this.quiet) return;
    const now = this.now();
    if (now - this.last < (this.tty ? 250 : 10000)) return;
    this.last = now;
    this.stream.write(this.tty ? '\r\x1b[K' + this.line() : this.line() + '\n');
  }
  finish(summary) {
    if (this.tty && !this.quiet && this.last > -Infinity) this.stream.write('\r\x1b[K');
    this.stream.write(summary + '\n');
  }
}

/** Keeps the first problems to report; the counts cover the rest. */
const note = (settings, problem) => {
  if (settings.problems && settings.problems.length < 20) settings.problems.push(problem);
};
/**
 * Reads every input once and calls `each(timeline, item)` for each moment to keep (item:
 * { moment, duration, bytes }), with `progress` counting along. Used for the dry run and
 * quota estimate as well as the import itself.
 */
async function readAll(settings, progress, each) {
  const { inputs, formatName, definition, zone, year, since, until, routes, filters, multiline } =
    settings;
  const ids = new EntryIds('log');
  for (const path of inputs) {
    const { mtimeMs } = await stat(path);
    const format = compileFormat(formatName, definition, { zone, year, reference: mtimeMs });
    const mapping = compileMapping(format, definition);
    for await (const text of entries(path, multiline, (n) => (progress.stats.bytes += n))) {
      progress.stats.entries++;
      progress.tick();
      let entry;
      try {
        entry = format.read(text);
      } catch (error) {
        progress.stats.skipped++;
        note(settings, `${path}: ${error.message} ${JSON.stringify(text.slice(0, 120))}`);
        continue;
      }
      if ((since !== null && entry.ms < since) || (until !== null && entry.ms > until)) {
        progress.stats.filtered++;
        continue;
      }
      const subject = {
        ...entry.fields,
        severity: entry.severity ?? entry.fields.severity ?? null,
        format: formatName,
      };
      if (!filters.every((matches) => matches(subject))) {
        progress.stats.filtered++;
        continue;
      }
      const targets = routes ? routes.route(subject) : ['(no timeline)'];
      if (!targets.length) {
        progress.stats.unrouted++;
        continue;
      }
      const built = mapping.build(entry, text, ids.next(format.identity(entry, text), entry.time));
      try {
        checkMoment(built);
      } catch (error) {
        progress.stats.refused++;
        note(settings, `${path}: refused (${error.message})`);
        continue;
      }
      const bytes =
        Buffer.byteLength(JSON.stringify(built.moment)) +
        (built.duration ? Buffer.byteLength(JSON.stringify(built.duration)) : 0);
      for (const timeline of targets) await each(timeline, { ...built, bytes });
    }
  }
}

/** Runs the importer; returns its exit code. */
export async function main(
  argv = process.argv.slice(2),
  {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    stdin = process.stdin,
  } = {},
) {
  let settings;
  try {
    settings = await options(argv, env);
  } catch (error) {
    stderr.write(`och-import-logs: ${error.message}\nTry --help.\n`);
    return EXIT.usage;
  }
  if (settings.help) {
    stdout.write(HELP);
    return EXIT.ok;
  }
  // Standard input is kept in a temporary file, so that it can be read twice (estimate,
  // then import) and its size shown.
  let spool = null;
  try {
    if (settings.inputs.includes('-')) {
      spool = await mkdtemp(join(tmpdir(), 'och-import-'));
      const path = join(spool, 'stdin');
      await pipeline(stdin, createWriteStream(path));
      settings.inputs = settings.inputs.map((p) => (p === '-' ? path : p));
    }
    for (const path of settings.inputs)
      try {
        await stat(path);
      } catch {
        stderr.write(`och-import-logs: cannot read ${path}.\n`);
        return EXIT.usage;
      }
    const total = (await Promise.all(settings.inputs.map((p) => stat(p)))).reduce(
      (n, s) => n + s.size,
      0,
    );
    settings.problems = [];
    const plan = async () => {
      // A pass without writing: counts per timeline, samples and the storage estimate.
      const progress = new Progress({ stream: stderr, quiet: settings.quiet, total });
      const counts = new Map(),
        timelines = new Map(),
        samples = [];
      await readAll(settings, progress, async (timeline, item) => {
        counts.set(timeline, (counts.get(timeline) ?? 0) + 1);
        if (samples.length < settings.sample)
          samples.push({
            timeline,
            moment: item.moment,
            ...(item.duration ? { duration: item.duration } : {}),
          });
        let plan = timelines.get(timeline);
        if (!plan) {
          // Existing timelines start from their size; unknown ones (no server) from empty.
          const start = settings.writer
            ? await settings.writer.size(timeline).catch(() => null)
            : null;
          plan = {
            start: start ?? { count: 0, bytes: 0 },
            count: start?.count ?? 0,
            batches: [],
            open: null,
          };
          timelines.set(timeline, plan);
        }
        // The same batches as the import (see importAll).
        const size = item.duration ? 2 : 1,
          close = () => {
            plan.batches.push(plan.open);
            plan.count += plan.open.moments;
            plan.open = null;
          };
        if (plan.open && plan.open.entries + size > batchLimit(plan.count)) close();
        const batch = (plan.open ??= { entries: 0, moments: 0, bytes: 0 });
        batch.entries += size;
        batch.moments++;
        batch.bytes += item.bytes;
        if (batch.entries >= batchLimit(plan.count) || batch.bytes >= BATCH_BYTES) close();
      });
      for (const plan of timelines.values()) if (plan.open) plan.batches.push(plan.open);
      return { progress, counts, samples, estimate: storageEstimate(timelines) };
    };
    const usage = settings.writer ? await settings.writer.usage().catch(() => null) : null;
    if (settings.dryRun) {
      const { progress, counts, samples, estimate } = await plan();
      stdout.write(
        JSON.stringify(
          {
            timelines: Object.fromEntries(counts),
            entries: progress.stats.entries,
            skipped: progress.stats.skipped,
            filtered: progress.stats.filtered,
            unrouted: progress.stats.unrouted,
            refused: progress.stats.refused,
            estimatedBytes: estimate,
            ...(usage
              ? {
                  usedBytes: usage.usedBytes,
                  quotaBytes: usage.quotaBytes,
                  fits: usage.quotaBytes === null || usage.usedBytes + estimate <= usage.quotaBytes,
                }
              : {}),
            problems: settings.problems.slice(0, 10),
            samples,
          },
          null,
          2,
        ) + '\n',
      );
      progress.finish(
        `Dry run: ${progress.stats.entries} entries read, nothing written; about ${bytesText(estimate)} of storage.`,
      );
      return EXIT.ok;
    }
    if (usage?.quotaBytes !== null && usage?.quotaBytes !== undefined) {
      const { estimate } = await plan();
      settings.problems = [];
      if (usage.usedBytes + estimate > usage.quotaBytes) {
        stderr.write(
          `och-import-logs: the import needs about ${bytesText(estimate)} but the account has ${bytesText(Math.max(0, usage.quotaBytes - usage.usedBytes))} of its ${bytesText(usage.quotaBytes)} left. Nothing was written.\n`,
        );
        return EXIT.quota;
      }
    }
    return await importAll(settings, { stderr, total });
  } finally {
    if (spool) await rm(spool, { recursive: true, force: true });
  }
}

/** Reads and saves: each timeline's batch is sent when full, and reading waits for it. */
async function importAll(settings, { stderr, total }) {
  const { writer } = settings;
  const progress = new Progress({ stream: stderr, quiet: settings.quiet, total });
  const pending = new Map();
  let failed = 0;
  const clear = () => (progress.tty ? '\r\x1b[K' : '');
  const send = async (timeline) => {
    const batch = pending.get(timeline);
    pending.delete(timeline);
    if (!batch?.moments.length) return;
    for (let attempt = 1; ; attempt++) {
      try {
        await writer.send(timeline, { moments: batch.moments, durations: batch.durations });
        progress.stats.saved.set(
          timeline,
          (progress.stats.saved.get(timeline) ?? 0) + batch.moments.length,
        );
        progress.tick();
        return;
      } catch (error) {
        if (temporary(error.status) && attempt < 12) {
          // The server is busy, rate-limiting or unreachable: wait and send the batch again.
          const wait =
            error.status === 429 && Number(error.retryAfter) > 0
              ? Number(error.retryAfter) * 1000
              : Math.min(60000, 1000 * 2 ** attempt);
          if (!settings.quiet)
            stderr.write(
              `${clear()}och-import-logs: timeline ${timeline} unavailable (${error.status ?? error.message}); retrying in ${duration(wait / 1000)}.\n`,
            );
          await sleep(wait);
          continue;
        }
        failed += batch.moments.length;
        stderr.write(
          `${clear()}och-import-logs: timeline ${timeline} refused ${batch.moments.length} moments (${error.status ?? 'unreachable'}: ${error.value?.error ?? error.message}).\n`,
        );
        return;
      }
    }
  };
  // The timeline's moments as the server last reported them (a re-import overwrites without
  // growing it), which bound the next save (see batchLimit).
  const count = async (timeline) => (await writer.size(timeline).catch(() => null))?.count ?? 0;
  await readAll(settings, progress, async (timeline, item) => {
    // A batch is sent before an entry (a moment and its duration count two) would overflow it.
    const entries = (b) => b.moments.length + b.durations.length;
    const size = item.duration ? 2 : 1;
    if (
      pending.has(timeline) &&
      entries(pending.get(timeline)) + size > batchLimit(await count(timeline))
    )
      await send(timeline);
    const batch = pending.get(timeline) ?? { moments: [], durations: [], bytes: 0 };
    pending.set(timeline, batch);
    batch.moments.push(item.moment);
    if (item.duration) batch.durations.push(item.duration);
    batch.bytes += item.bytes;
    if (entries(batch) >= batchLimit(await count(timeline)) || batch.bytes >= BATCH_BYTES)
      await send(timeline);
  });
  for (const timeline of [...pending.keys()]) await send(timeline);
  const s = progress.stats;
  const saved = [...s.saved].map(([id, n]) => `${n} to ${id}`).join(', ') || 'nothing';
  progress.finish(
    `Imported ${s.entries} entries: saved ${saved}` +
      ['skipped', 'filtered', 'unrouted', 'refused']
        .filter((k) => s[k])
        .map((k) => `; ${k} ${s[k]}`)
        .join('') +
      (failed ? `; ${failed} not saved` : '') +
      '.' +
      (settings.problems.length
        ? `\nFirst problems:\n  ${settings.problems.slice(0, 5).join('\n  ')}`
        : ''),
  );
  return failed || s.refused ? EXIT.partial : EXIT.ok;
}

// Run as a command, also through a symbolic link (npm's bin, /usr/bin).
const invoked = (() => {
  try {
    return pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return null;
  }
})();
if (import.meta.url === invoked) {
  // och-import-logs passes syslog.env as OCH_CONFIG when the environment has no API key.
  loadConfiguration();
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`och-import-logs: ${error.message}\n`);
      process.exit(EXIT.usage);
    },
  );
}
