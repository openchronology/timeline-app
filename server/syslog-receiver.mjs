// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Receives syslog over UDP and TCP and appends each message as a moment to the timelines
 * its routes choose, through the OpenChronology API with an API key (docs/syslog.md).
 *
 *   OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... \
 *   SYSLOG_ROUTES=./syslog-routes.json node server/syslog-receiver.mjs
 */
import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  compileRoutes,
  parseSyslog,
  syslogFrames,
  syslogMoment,
  MAX_MESSAGE_BYTES,
} from './syslog.mjs';
import { parseZone } from './log-time.mjs';
import { MomentIngest } from './moment-ingest.mjs';

/** Syslog messages into moments (syslog.mjs), queued and sent as moment-ingest.mjs does. */
export class SyslogIngest extends MomentIngest {
  constructor({ timezone = 'UTC', ...options }) {
    super({ ...options, label: 'syslog' });
    // Classic BSD timestamps carry no zone: read them in this one (UTC unless set).
    this.zone = parseZone(timezone);
    this.instance = randomBytes(4).toString('hex');
    this.sequence = 0;
  }
  /** Parses, routes and queues one message; returns the timelines it went to. */
  accept(text, received = Date.now()) {
    this.stats.received++;
    let entry;
    try {
      entry = parseSyslog(text, received, { zone: this.zone });
    } catch {
      this.stats.invalid++;
      return [];
    }
    // IDs are fixed when received, so a resent batch overwrites rather than duplicates.
    const id = `syslog:${received.toString(36)}.${this.instance}.${(this.sequence++).toString(36)}`;
    return this.enqueue(this.routes.route(entry), syslogMoment(entry, id));
  }
}

/** UDP and TCP listeners feeding an ingest; resolves once both are listening. */
export async function listenSyslog(
  ingest,
  { host = '127.0.0.1', port = 5514, maxConnections = 256 } = {},
) {
  const udp = createSocket({ type: host.includes(':') ? 'udp6' : 'udp4', recvBufferSize: 1 << 20 });
  udp.on('message', (message) => {
    if (message.length <= MAX_MESSAGE_BYTES) ingest.accept(message.toString('utf8'));
    else ingest.stats.invalid++;
  });
  const tcp = createServer({ noDelay: true }, (socket) => {
    socket.setTimeout(300000, () => socket.destroy());
    const frames = syslogFrames((text) => ingest.accept(text));
    socket.on('data', (chunk) => {
      try {
        frames(chunk);
      } catch {
        ingest.stats.invalid++;
        socket.destroy();
      }
    });
    socket.on('error', () => {});
  });
  tcp.maxConnections = maxConnections;
  await Promise.all([
    new Promise((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(port, host, resolve);
    }),
    new Promise((resolve, reject) => {
      tcp.once('error', reject);
      tcp.listen(port, host, resolve);
    }),
  ]);
  return {
    udp: udp.address().port,
    tcp: tcp.address().port,
    async close() {
      udp.close();
      await new Promise((resolve) => tcp.close(resolve));
    },
  };
}

export async function main(env = process.env) {
  const config = env.SYSLOG_ROUTES_JSON
    ? JSON.parse(env.SYSLOG_ROUTES_JSON)
    : JSON.parse(await readFile(env.SYSLOG_ROUTES || 'syslog-routes.json', 'utf8'));
  const ingest = new SyslogIngest({
    api: env.OCH_API_URL,
    key: env.OCH_API_KEY,
    routes: compileRoutes(config),
    flushMs: env.SYSLOG_FLUSH_MS ? Number(env.SYSLOG_FLUSH_MS) : undefined,
    queueLimit: env.SYSLOG_QUEUE_LIMIT ? Number(env.SYSLOG_QUEUE_LIMIT) : undefined,
    timezone: env.SYSLOG_TIMEZONE || 'UTC',
  });
  const listening = await listenSyslog(ingest, {
    host: env.SYSLOG_HOST || '127.0.0.1',
    port: env.SYSLOG_PORT ? Number(env.SYSLOG_PORT) : 5514,
  });
  console.log(
    `syslog: listening on ${env.SYSLOG_HOST || '127.0.0.1'} udp/${listening.udp} tcp/${listening.tcp} for ${ingest.queues.size} timeline(s).`,
  );
  const report = setInterval(() => console.log('syslog:', JSON.stringify(ingest.stats)), 60000);
  report.unref();
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, async () => {
      await listening.close();
      const drained = await ingest.drain();
      console.log(
        'syslog: stopped',
        JSON.stringify(ingest.stats),
        drained ? '' : '(queue not empty)',
      );
      process.exit(drained ? 0 : 1);
    });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => {
    console.error('syslog:', error.message);
    process.exit(1);
  });
