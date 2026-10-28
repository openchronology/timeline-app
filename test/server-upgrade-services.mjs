// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Linux packages' upgrade and the services beside the server (#371, #374), for
// server-deb.mjs and server-rpm.mjs: the mail worker and the log importers (the syslog receiver
// and the journald follower). Their containers have no systemd, so a stand-in systemctl (and
// /run/systemd/system, which the package scripts look for) keeps the units' enabled state and
// runs each service as its unit would (unitCommand), configured with placeholders: a Resend key
// for the mail worker (the outbox is empty, so it sends nothing), an API key and a timeline for
// the importers. Nothing reaches the receiver, and the container has no systemd-journald, so the
// follower's journalctl finds no entries; both still run, as their units would.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unitCommand } from './server-syslog.mjs';

const state = '/run/och-test-systemd';
const etc = '/etc/openchronology';
/**
 * The services an upgrade stops: each with its name in openchronology-migrate's output and the
 * line it logs once it runs (the mail worker logs nothing until it sends).
 */
const services = {
  'openchronology-mail.service': { name: 'mail worker', ready: null },
  'openchronology-syslog.service': { name: 'syslog receiver', ready: /^syslog: listening/m },
  'openchronology-journald.service': { name: 'journald follower', ready: /^journald: following/m },
};
const pidFile = (unit) => `/tmp/${unit}.pid`;
const logFile = (unit) => `/tmp/${unit}.log`;
// The configuration files the placeholders go in, restored afterwards.
const configs = [
  `${etc}/openchronology.env`,
  `${etc}/syslog.env`,
  `${etc}/syslog-routes.json`,
  `${etc}/journald.env`,
];

/** systemctl's commands the package scripts use, on the units' state in `state`. */
const fakeSystemctl = (commands) => `#!/bin/bash
# A stand-in for systemctl in a test container without systemd (test/server-upgrade-services.mjs).
state=${state}
echo "systemctl $*" >> "$state/calls"
action= now= units=()
for arg; do
  case $arg in
    --now) now=1 ;;
    -*) ;;
    *) if [ -z "$action" ]; then action=$arg; else units+=("\${arg%.service}.service"); fi ;;
  esac
done
# Each service's command, as its unit runs it; other units (the server) are left alone.
unit_command() {
  case $1 in
${Object.entries(commands)
  .map(([unit, command]) => `    ${unit}) echo '${Buffer.from(command).toString('base64')}' ;;`)
  .join('\n')}
    *) return 1 ;;
  esac
}
running() {
  [ -s "/tmp/$1.pid" ] && kill -0 "$(cat "/tmp/$1.pid")" 2>/dev/null
}
stop() {
  running "$1" || return 0
  kill -TERM "$(cat "/tmp/$1.pid")"
  for _ in $(seq 30); do running "$1" || return 0; sleep 1; done
  return 1
}
start() {
  local script
  script=$(unit_command "$1") || return 0
  running "$1" && return 0
  rm -f "/tmp/$1.pid"
  eval "$(echo "$script" | base64 -d)"
  for _ in $(seq 50); do running "$1" && return 0; sleep 0.1; done
  return 1
}
status=0
for unit in "\${units[@]}"; do
  case $action in
    is-enabled) [ -e "$state/$unit.enabled" ] || status=1 ;;
    is-active) running "$unit" || status=3 ;;
    enable) touch "$state/$unit.enabled"; if [ -n "$now" ]; then start "$unit" || status=1; fi ;;
    disable) rm -f "$state/$unit.enabled"; if [ -n "$now" ]; then stop "$unit" || status=1; fi ;;
    start) start "$unit" || status=1 ;;
    stop) stop "$unit" || status=1 ;;
    restart) { stop "$unit" && start "$unit"; } || status=1 ;;
  esac
done
exit $status
`;

/**
 * With the mail worker and the log importers enabled and running, `upgrade()` (reinstalling the
 * package) stops them and openchronology-migrate starts each again; `--no-restart` starts
 * nothing, and disabled ones stay stopped while an enabled one starts. Returns the upgrade's and
 * the migration's output for the caller's checks.
 */
export async function checkServicesUpgrade({ sh, upgrade }) {
  const units = Object.keys(services);
  const active = async (unit) =>
    (await sh(`systemctl is-active ${unit} && echo active || echo inactive`)).trim();
  const commands = {};
  for (const unit of units)
    commands[unit] = unitCommand(
      await sh(`cat /usr/lib/systemd/system/${unit}`),
      logFile(unit),
      pidFile(unit),
    );
  const script = fakeSystemctl(commands);
  const timeline = randomUUID();
  const apiKey = `och_key_${'0'.repeat(32)}_${'0'.repeat(64)}`;
  await sh(
    `set -e; real=$(command -v systemctl || true); echo "$real" > /tmp/systemctl.path; ` +
      `if [ -n "$real" ]; then mv "$real" "$real.real"; fi; ` +
      `mkdir -p ${state} /run/systemd/system; ` +
      `echo ${Buffer.from(script).toString('base64')} | base64 -d > "\${real:-/usr/bin/systemctl}"; ` +
      `chmod 0755 "\${real:-/usr/bin/systemctl}"; ` +
      configs
        .map((file) => `if [ -e ${file} ]; then cp -p ${file} ${file}.och-test; fi; `)
        .join('') +
      `sed -i -e 's/^RESEND_API_KEY=.*/RESEND_API_KEY=re_placeholder/' ` +
      `-e 's/^AUTH_EMAIL_FROM=.*/AUTH_EMAIL_FROM=mail@example.test/' ${etc}/openchronology.env; ` +
      `sed -i 's/^OCH_API_KEY=.*/OCH_API_KEY=${apiKey}/' ${etc}/syslog.env ${etc}/journald.env; ` +
      `printf '{"default":"${timeline}"}' > ${etc}/syslog-routes.json; ` +
      `chown root:openchronology ${etc}/syslog-routes.json; chmod 0640 ${etc}/syslog-routes.json; ` +
      `sed -i 's/^JOURNALD_TIMELINE=.*/JOURNALD_TIMELINE=${timeline}/' ${etc}/journald.env`,
  );
  const logs = () =>
    sh(`cat ${state}/calls ${units.map(logFile).join(' ')}`, { allowFailure: true });
  const states = async () => {
    const result = {};
    for (const unit of units) result[unit] = await active(unit);
    return result;
  };
  const all = (value) => Object.fromEntries(units.map((unit) => [unit, value]));
  try {
    await sh(`systemctl enable --now ${units.join(' ')}`);
    assert.deepEqual(await states(), all('active'), await logs());

    const upgraded = await upgrade();
    assert.deepEqual(await states(), all('inactive'), 'the upgrade stops them');

    await sh(`: > ${state}/calls`);
    const migrated = await sh('openchronology-migrate 2>&1');
    assert.match(migrated, /OpenChronology restarted\./, migrated);
    const calls = await sh(`cat ${state}/calls`);
    assert.match(calls, /^systemctl restart openchronology\.service$/m);
    for (const [unit, { name }] of Object.entries(services)) {
      assert.match(migrated, new RegExp(`^OpenChronology ${name} restarted\\.$`, 'm'), migrated);
      assert.match(calls, new RegExp(`^systemctl restart ${unit.replaceAll('.', '\\.')}$`, 'm'));
    }
    // Still running a moment later: each started with its configuration, not failed on it.
    await new Promise((r) => setTimeout(r, 3000));
    assert.deepEqual(await states(), all('active'), await logs());
    for (const [unit, { ready }] of Object.entries(services))
      if (ready) assert.match(await sh(`cat ${logFile(unit)}`), ready, await logs());

    // --no-restart starts nothing.
    await sh(`systemctl stop ${units.join(' ')}`);
    const migratedOnly = await sh('openchronology-migrate --no-restart 2>&1');
    assert.doesNotMatch(migratedOnly, /restarted/);
    assert.deepEqual(await states(), all('inactive'));

    // Disabled ones (not configured) stay stopped; an enabled one starts.
    await sh('systemctl disable openchronology-mail.service openchronology-journald.service');
    const mixed = await sh('openchronology-migrate 2>&1');
    assert.match(mixed, /OpenChronology restarted\./);
    assert.match(mixed, /^OpenChronology syslog receiver restarted\.$/m, mixed);
    assert.doesNotMatch(mixed, /mail worker restarted|journald follower restarted/);
    assert.deepEqual(await states(), {
      ...all('inactive'),
      'openchronology-syslog.service': 'active',
    });
    return { upgrade: upgraded, migrate: migrated };
  } finally {
    await sh(
      `systemctl stop ${units.join(' ')}; real=$(cat /tmp/systemctl.path); ` +
        `if [ -n "$real" ]; then mv "$real.real" "$real"; else rm -f /usr/bin/systemctl; fi; ` +
        `rm -rf ${state} /run/systemd/system; ` +
        configs
          .map((file) => `if [ -e ${file}.och-test ]; then mv ${file}.och-test ${file}; fi; `)
          .join(''),
      { allowFailure: true },
    );
  }
}
