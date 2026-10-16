// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Follows the systemd journal and appends each entry as a moment to the timelines its routes
 * choose, through the OpenChronology API with an API key (docs/journald.md, #151): live what
 * `och-import-logs --format journald` reads from `journalctl -o json` after the fact, as the
 * same moments with the same IDs, so a live stream and an import of the same entries never
 * duplicate each other.
 *
 * It runs `journalctl --follow --output=json` (on this machine, or over SSH on another),
 * remembers the cursor of the last entry it has sent, and on restart resumes after it, so
 * nothing is missed while it was down and nothing already sent is sent twice.
 *
 *   OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... \
 *   JOURNALD_TIMELINE=<uuid> JOURNALD_UNITS=forgejo.service node server/journald-receiver.mjs
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { compileFormat } from './log-formats.mjs';
import { compileMapping, checkMoment, EntryIds } from './log-mapping.mjs';
import { compileRoutes } from './log-routes.mjs';
import { parseZone } from './log-time.mjs';
import { MomentIngest } from './moment-ingest.mjs';
import { loadConfiguration } from './env-file.mjs';

const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

/**
 * Journal entries (each a line of `journalctl -o json`) into moments, read as the log
 * importer's journald format reads them (log-formats.mjs), queued and sent as
 * moment-ingest.mjs does. `cursorFile` keeps the cursor of the last entry sent.
 */
export class JournaldIngest extends MomentIngest {
  constructor({ cursorFile = null, ...options }) {
    super({ ...options, label: 'journald' });
    this.format = compileFormat('journald', {}, { zone: parseZone('UTC') });
    this.mapping = compileMapping(this.format, {});
    this.ids = new EntryIds('log');
    this.cursorFile = cursorFile;
    // The cursor of the last entry read, and of the last one known sent (or refused).
    this.cursor = null;
    this.saved = null;
    this.saving = Promise.resolve();
  }
  /** The cursor the last run stopped after, or null for a first run. */
  async resume() {
    if (!this.cursorFile) return null;
    try {
      const text = (await readFile(this.cursorFile, 'utf8')).trim();
      this.cursor = this.saved = text || null;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this.saved;
  }
  /** Reads, routes and queues one entry; returns the timelines it went to. */
  accept(line) {
    this.stats.received++;
    let entry, built;
    try {
      entry = this.format.read(line);
      built = this.mapping.build(
        entry,
        line,
        this.ids.next(this.format.identity(entry, line), entry.time),
      );
      checkMoment(built);
    } catch {
      this.stats.invalid++;
      return [];
    }
    if (typeof entry.fields.__CURSOR === 'string') this.cursor = entry.fields.__CURSOR;
    const subject = {
      ...entry.fields,
      severity: entry.severity ?? entry.fields.severity ?? null,
      format: 'journald',
    };
    const targets = this.enqueue(this.routes.route(subject), built.moment);
    if (!targets.length) this.settled();
    return targets;
  }
  /**
   * Once nothing is waiting to be sent, everything read so far is: its cursor is kept, so a
   * restart resumes after it. (Under a steady stream it is kept between batches; entries
   * read again after a crash keep their IDs and only overwrite.)
   */
  settled() {
    if (!this.idle || !this.cursor || this.cursor === this.saved || !this.cursorFile) return;
    const cursor = this.cursor;
    this.saved = cursor;
    this.saving = this.saving
      .then(async () => {
        await mkdir(dirname(this.cursorFile), { recursive: true });
        const temporary = this.cursorFile + '.new';
        await writeFile(temporary, cursor + '\n');
        await rename(temporary, this.cursorFile);
      })
      .catch((error) => this.log.error(`journald: cannot keep the cursor: ${error.message}`));
  }
}

/**
 * The journalctl command following the journal from `cursor` (or, on a first run, from
 * `since`): on this machine, or on `host` over SSH (with `sshKey`, and `knownHosts` for the
 * hosts it has seen: a host's key is accepted the first time and checked after). `units`
 * and `matches` narrow it as `journalctl -u` and `FIELD=value` arguments do.
 */
export function journalCommand({
  command = 'journalctl',
  host = null,
  units = [],
  matches = [],
  since = 'now',
  cursor = null,
  sshKey = null,
  knownHosts = null,
}) {
  const args = [
    '--follow',
    '--output=json',
    '--no-pager',
    '--quiet',
    ...units.flatMap((unit) => ['--unit', unit]),
    ...(cursor ? ['--after-cursor', cursor] : ['--since', since]),
    ...matches,
  ];
  if (!host) return [command, args];
  // SSH runs the command through the remote shell: each argument is quoted for it.
  const quote = (text) => `'${String(text).replaceAll("'", `'\\''`)}'`;
  return [
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      // A service has no home: its key and the hosts it has seen are configured paths.
      ...(sshKey ? ['-i', sshKey] : []),
      ...(knownHosts
        ? ['-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile=${knownHosts}`]
        : []),
      host,
      '--',
      [command, ...args].map(quote).join(' '),
    ],
  ];
}

/**
 * Feeds `ingest` from journalctl until `signal` aborts, restarting it (after the last entry
 * read) whenever it stops: the journal rotated, an SSH connection dropped.
 */
export async function followJournal(ingest, options, signal, log = console) {
  let failures = 0;
  while (!signal.aborted) {
    const [command, args] = journalCommand({ ...options, cursor: ingest.cursor });
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', (chunk) => (errors = (errors + chunk).slice(-2000)));
    const stop = () => child.kill('SIGTERM');
    signal.addEventListener('abort', stop, { once: true });
    const started = Date.now();
    const exited = new Promise((done) => {
      child.once('close', (code) => done(code));
      child.once('error', (error) => {
        errors = error.message;
        done(null);
      });
    });
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity }))
      if (line.trim()) ingest.accept(line);
    const code = await exited;
    signal.removeEventListener('abort', stop);
    if (signal.aborted) break;
    // A run that lasted a while was working: start again soon. Repeated quick failures
    // (journalctl missing, no permission, SSH refused) back off up to a minute.
    failures = Date.now() - started > 60000 ? 1 : failures + 1;
    const delay = Math.min(60000, 1000 * 2 ** Math.min(failures - 1, 6));
    log.warn(
      `journald: ${command} stopped (${code ?? 'failed'}${errors.trim() ? `: ${errors.trim()}` : ''}); restarting in ${delay / 1000}s.`,
    );
    await sleep(delay);
  }
}

const list = (text) =>
  String(text ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);

/** Reads the configuration from `env` and follows the journal until stopped. */
export async function main(env = process.env) {
  let routes;
  if (env.JOURNALD_ROUTES_JSON) routes = JSON.parse(env.JOURNALD_ROUTES_JSON);
  else if (env.JOURNALD_ROUTES) routes = JSON.parse(await readFile(env.JOURNALD_ROUTES, 'utf8'));
  else if (env.JOURNALD_TIMELINE) routes = { default: env.JOURNALD_TIMELINE };
  else throw new Error('Set JOURNALD_TIMELINE, or routes in JOURNALD_ROUTES.');
  const ingest = new JournaldIngest({
    api: env.OCH_API_URL,
    key: env.OCH_API_KEY,
    routes: compileRoutes(routes, { label: 'Journald' }),
    flushMs: Number(env.JOURNALD_FLUSH_MS ?? 1000),
    queueLimit: Number(env.JOURNALD_QUEUE_LIMIT ?? 10000),
    cursorFile: resolve(
      env.JOURNALD_CURSOR_FILE ??
        (env.STATE_DIRECTORY ? `${env.STATE_DIRECTORY.split(':')[0]}/cursor` : 'journald.cursor'),
    ),
  });
  const resumed = await ingest.resume();
  const options = {
    command: env.JOURNALD_COMMAND || 'journalctl',
    host: env.JOURNALD_HOST || null,
    units: list(env.JOURNALD_UNITS),
    matches: list(env.JOURNALD_MATCHES),
    since: env.JOURNALD_SINCE || 'now',
    sshKey: env.JOURNALD_SSH_KEY || null,
    knownHosts: join(dirname(ingest.cursorFile), 'known_hosts'),
  };
  console.log(
    `journald: following ${options.host ? options.host + "'s" : 'this machine’s'} journal${
      options.units.length ? ' (' + options.units.join(', ') + ')' : ''
    } ${resumed ? 'after the last entry sent' : 'from ' + options.since} into ${ingest.queues.size} timeline(s).`,
  );
  const report = setInterval(() => console.log('journald:', JSON.stringify(ingest.stats)), 60000);
  report.unref();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await followJournal(ingest, options, controller.signal);
  clearInterval(report);
  const drained = await ingest.drain();
  ingest.settled();
  await ingest.saving;
  ingest.close();
  console.log('journald: stopped', JSON.stringify(ingest.stats));
  return drained ? 0 : 1;
}

const invoked = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invoked) {
  loadConfiguration();
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error('journald:', error.message);
      process.exit(2);
    },
  );
}
