// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A made-up incident for the logs video (Video 10): three hours of syslog from four hosts, shaped
// exactly as the syslog receiver and log importer make moments (tags, the syslog metadata,
// microsecond times), around an outage: a backup job fills the database's disk, PostgreSQL
// stops writing, and the web servers return 502s until the disk is cleared. The hosts, names
// and messages are invented; a seeded generator makes the same file every time.
import { m, d, rel, plugins } from './lib.mjs';

const START = Date.UTC(2026, 2, 14, 1, 30) / 1000;
/** Seconds after 01:30 UTC on 14 March 2026, to the microsecond, as an exact time. */
const t = (s) => {
  const us = BigInt(Math.round((START + s) * 1e6));
  const g = gcd(us, 1000000n);
  return `${us / g}/${1000000n / g}`;
};
function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}
const clock = (h, mi, s = 0) => (h - 1) * 3600 + (mi - 30) * 60 + s;
/** A small seeded generator (mulberry32), so the sample is the same on every build. */
function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function incident(core) {
  const rnd = random(20260314);
  let n = 0;
  const log = (s, host, app, severity, message, facility = 'daemon') =>
    m(`log-${++n}`, t(s), message, {
      tags: [
        'syslog',
        `severity:${severity}`,
        `facility:${facility}`,
        `host:${host}`,
        `app:${app}`,
      ],
    });
  const events = [];
  const outage = [clock(2, 52, 10), clock(3, 21, 40)];
  // Steady background: web access summaries, cron, sshd, the database's checkpoints.
  for (let s = 0; s < 3 * 3600; s += 2 + rnd() * 6) {
    const host = rnd() < 0.5 ? 'web-1' : 'web-2';
    const down = s >= outage[0] && s < outage[1];
    if (down && rnd() < 0.85)
      events.push(
        log(
          s,
          host,
          'nginx',
          'err',
          'upstream prematurely closed connection while reading response header (502)',
        ),
      );
    else
      events.push(
        log(s, host, 'nginx', 'info', `GET /api/orders 200 ${Math.round(20 + rnd() * 80)}ms`),
      );
    if (rnd() < 0.04) events.push(log(s + 0.3, 'db-1', 'postgres', 'info', 'checkpoint complete'));
    if (rnd() < 0.015)
      events.push(
        log(
          s + 0.7,
          rnd() < 0.5 ? 'web-1' : 'db-1',
          'sshd',
          'notice',
          'Accepted publickey for deploy',
          'auth',
        ),
      );
  }
  // The cause: the backup job writes to the database's own disk.
  events.push(
    log(
      clock(2, 5),
      'backup-1',
      'cron',
      'info',
      '(root) CMD (/usr/local/bin/nightly-dump --target db-1:/var/lib/backup)',
      'cron',
    ),
  );
  for (let p = 85, s = clock(2, 10); p <= 99; p += 2, s += 300)
    events.push(
      log(s, 'db-1', 'diskmon', p >= 95 ? 'crit' : 'warning', `/var/lib disk usage at ${p}%`),
    );
  events.push(
    log(
      clock(2, 52, 10),
      'db-1',
      'postgres',
      'crit',
      'could not write to file "pg_wal/xlogtemp": No space left on device',
    ),
  );
  events.push(log(clock(2, 52, 11), 'db-1', 'postgres', 'err', 'PANIC: could not write to WAL'));
  // What people did: the page, the fix, recovery.
  const people = [
    m('paged', t(clock(2, 58, 30)), 'On-call paged', {
      tags: ['response'],
      color: '#7aadc4',
      notes: 'The 502 alert fires after five minutes over threshold.',
    }),
    m('found', t(clock(3, 9)), 'Full disk found on db-1', {
      tags: ['response'],
      color: '#7aadc4',
      notes: 'The backup target was the database volume itself.',
    }),
    m('cleared', t(clock(3, 17, 20)), 'Backup stopped, disk cleared', {
      tags: ['response'],
      color: '#7aadc4',
    }),
    m('recovered', t(clock(3, 21, 40)), 'Service recovered', {
      tags: ['response'],
      color: '#5fcf8a',
      notes: 'PostgreSQL restarts and the first 200s return.',
    }),
    m('cause', t(clock(2, 5)), 'Root cause: backup on the database volume', {
      tags: ['analysis'],
      color: '#e0a12a',
      notes:
        'The nightly dump was pointed at **db-1:/var/lib/backup**, the same volume as the database.',
    }),
  ];
  events.push(...people);
  const durations = [
    d('filling', t(clock(2, 5)), t(clock(2, 52, 10)), 'Disk filling', {
      tags: ['analysis'],
      color: '#d6ad4c',
    }),
    d('outage', t(outage[0]), t(outage[1]), 'Outage: 502s', {
      tags: ['analysis'],
      color: '#bc6663',
    }),
  ];
  const panic = events.find((e) => e.metadata.title.startsWith('could not write to file'));
  const relationships = [
    rel('cause', 'd:filling'),
    rel('d:filling', panic.id),
    rel(panic.id, 'd:outage'),
    rel('paged', 'd:outage'),
    rel('found', 'cleared'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'Incident 2026-03-14: orders API outage',
    description:
      'Three hours of syslog from web-1, web-2, db-1 and backup-1, with the investigation on top: the cause, the outage and what the on-call engineer did. A made-up incident for the logs video.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['incident', 'syslog', 'postmortem'],
    plugins: plugins(core.LOG_SEVERITY_COLORS, core.MOMENT_COLORS, core.RICH_TEXT_NOTES),
    events,
    durations,
    relationships,
  };
}
