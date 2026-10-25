// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The syslog receiver as each server package runs it as a service (#125), for the package
// tests (server-deb.mjs, server-rpm.mjs, server-freebsd.mjs, server-homebrew.mjs,
// server-windows.mjs): configured as an administrator would configure it, with an API key and
// a route to a new timeline, started by the system's service manager, sent a message, and
// stopped. Each test supplies how its system does each step.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';

/** Sends one syslog datagram to the receiver on this machine's loopback port 5514. */
export async function sendUdp(text) {
  const socket = createSocket('udp4');
  try {
    await new Promise((done, fail) =>
      socket.send(Buffer.from(text), 5514, '127.0.0.1', (e) => (e ? fail(e) : done())),
    );
  } finally {
    socket.close();
  }
}

/** Fetches from the server on this machine with an API key, for tests on the same host. */
export const fetchApi = async (path, token, body) => {
  const response = await fetch('http://127.0.0.1:5173' + path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, value: await response.json() };
};

/**
 * Checks the receiver's service end to end. Returns the timeline the message reached.
 * @param {object} system
 * @param {(sql: string) => Promise<string>} system.psql runs SQL in the openchronology
 *   database as a superuser, returning its output (no double quotes in the SQL)
 * @param {(path: string, token: string, body?: object) =>
 *   Promise<{status: number, value: any}>} system.api requests the running server
 * @param {(key: string, routes: string) => Promise<void>} system.configure sets OCH_API_KEY in
 *   the package's syslog.env and writes the routes (JSON text) to its syslog-routes.json
 * @param {() => Promise<void>} system.start starts the service
 * @param {() => Promise<void>} system.stop stops it
 * @param {(text: string) => Promise<void>} [system.send] sends one syslog datagram to it
 * @param {() => Promise<string>} [system.logs] the service's log, for failures
 * @param {string} system.name the system, in the message
 */
export async function checkSyslogService({
  psql,
  api,
  configure,
  start,
  stop,
  send = sendUdp,
  logs = async () => '',
  name,
}) {
  // An account and its read/write API key, as Account -> API keys makes them.
  const user = randomUUID();
  const token = `och_key_${randomBytes(16).toString('hex')}_${randomBytes(32).toString('hex')}`;
  await psql(
    `INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES('${user}','syslog_${user.slice(0, 8)}',now(),oc_policy_version())`,
  );
  await psql(
    `INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES('${randomUUID()}','${user}','syslog','${token.slice(0, 20)}','${createHash('sha256').update(token).digest('hex')}',ARRAY['timelines:read','timelines:write'],now()+interval '1 day')`,
  );
  // The timeline to receive the logs, made with the key.
  const created = await api('/api/timelines', token, {
    format: 'openchronology',
    version: 1,
    title: 'Logs',
    description: '',
    events: [],
  });
  assert.equal(created.status, 201, JSON.stringify(created.value));
  const timeline = created.value.id;
  await configure(token, JSON.stringify({ default: timeline }, null, 2) + '\n');
  await start();

  // Sent until it arrives (the first may come before the receiver listens), and found in
  // the timeline with its parsed fields.
  const nonce = randomBytes(4).toString('hex');
  const title = `Hello from ${name} ${nonce}`;
  const count = async () =>
    Number(
      await psql(
        `SELECT count(*) FROM oc_moments WHERE timeline_id='${timeline}' AND event->'metadata'->>'title'='${title}'`,
      ),
    );
  let arrived = 0;
  for (let i = 0; i < 60 && !arrived; i++) {
    if (i % 5 === 0)
      await send(`<13>1 ${new Date().toISOString()} package-test och-test - - - ${title}`);
    await new Promise((r) => setTimeout(r, 1000));
    arrived = await count();
  }
  assert(arrived > 0, `The message did not reach the timeline.\n${await logs()}`);
  const tags = await psql(
    `SELECT event->'metadata'->'tags' FROM oc_moments WHERE timeline_id='${timeline}' AND event->'metadata'->>'title'='${title}' LIMIT 1`,
  );
  for (const tag of ['syslog', 'severity:notice', 'host:package-test', 'app:och-test'])
    assert(tags.includes(`"${tag}"`), `${tag} in ${tags}`);
  await stop();
  return timeline;
}

/**
 * `api` for a package test in a container, through curl in it (`sh` runs a script there): the
 * server listens on the container's loopback.
 */
export const curlApi = (sh) => async (path, token, body) => {
  const data = body ? `--data '${JSON.stringify(body)}'` : '';
  const out = await sh(
    `curl -s -w '\\n%{http_code}' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' ${data} http://127.0.0.1:5173${path}`,
  );
  const lines = out.trimEnd().split('\n');
  const status = Number(lines.pop());
  return { status, value: JSON.parse(lines.join('\n')) };
};

/**
 * A systemd unit's service as a shell command, for containers without systemd: its
 * ExecStart, run as its User in its WorkingDirectory with its Environment, and its
 * EnvironmentFile read as systemd reads it (OCH_CONFIG, env-file.mjs). Output goes to `log`;
 * the service's own process ID (exec'd in place of the shell that wrote it) to `pidFile`.
 */
export function unitCommand(unit, log, pidFile) {
  const setting = (key) => new RegExp(`^${key}=(.*)$`, 'm').exec(unit)?.[1];
  const environment = [...unit.matchAll(/^Environment=(.*)$/gm)].map(([, value]) => value);
  return (
    `cd ${setting('WorkingDirectory')} || exit 1; runuser -u ${setting('User')} -- sh -c ` +
    `'echo $$ > ${pidFile}; exec env ${environment.join(' ')} ` +
    `OCH_CONFIG=${setting('EnvironmentFile')} ${setting('ExecStart')}' > ${log} 2>&1 &`
  );
}

/**
 * The Linux packages' services (server-deb.mjs, server-rpm.mjs), in a container where the
 * package is installed and its server running: every unit is valid as systemd reads it
 * (`systemd-analyze verify`, installed with `installSystemd` where missing), and the syslog
 * receiver works as its unit runs it.
 */
export async function checkSystemdServices({ sh, psql, name, installSystemd }) {
  await sh(`command -v systemd-analyze >/dev/null || { ${installSystemd}; } >/dev/null 2>&1`);
  await sh(
    'cd /usr/lib/systemd/system && systemd-analyze verify openchronology.service openchronology-mail.service openchronology-syslog.service openchronology-journald.service',
  );
  const unit = await sh('cat /usr/lib/systemd/system/openchronology-syslog.service');
  const pid = '/tmp/syslog.pid';
  await checkSyslogService({
    name,
    psql,
    api: curlApi(sh),
    configure: (key, routes) =>
      sh(
        `sed -i 's|^OCH_API_KEY=.*|OCH_API_KEY=${key}|' /etc/openchronology/syslog.env && printf '%s' '${routes}' > /etc/openchronology/syslog-routes.json`,
      ),
    start: () => sh(unitCommand(unit, '/tmp/syslog.log', pid)),
    // As systemd stops it: SIGTERM, then it saves what is queued and exits.
    stop: () =>
      sh(
        `kill -TERM "$(cat ${pid})"; for i in $(seq 30); do kill -0 "$(cat ${pid})" 2>/dev/null || exit 0; sleep 1; done; exit 1`,
      ),
    send: (text) => sh(`printf '%s' '${text}' > /dev/udp/127.0.0.1/5514`),
    logs: () => sh('cat /tmp/syslog.log', { allowFailure: true }),
  });
  assert.match(await sh('cat /tmp/syslog.log'), /^syslog: stopped/m);
}
