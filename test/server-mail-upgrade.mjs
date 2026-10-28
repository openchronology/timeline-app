// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Linux packages' upgrade and the mail worker (#371), for server-deb.mjs and server-rpm.mjs.
// Their containers have no systemd, so a stand-in systemctl (and /run/systemd/system, which the
// package scripts look for) keeps the units' enabled state and runs the mail worker as its unit
// would (unitCommand), with a placeholder Resend key: the outbox is empty, so it sends nothing.
import assert from 'node:assert/strict';
import { unitCommand } from './server-syslog.mjs';

const state = '/run/och-test-systemd';
const pidFile = '/tmp/openchronology-mail.service.pid';
const mail = 'openchronology-mail.service';

/** systemctl's commands the package scripts use, on the units' state in `state`. */
const fakeSystemctl = (startMail) => `#!/bin/bash
# A stand-in for systemctl in a test container without systemd (test/server-mail-upgrade.mjs).
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
running() {
  [ "$1" = ${mail} ] && [ -s ${pidFile} ] && kill -0 "$(cat ${pidFile})" 2>/dev/null
}
stop() {
  running "$1" || return 0
  kill -TERM "$(cat ${pidFile})"
  for _ in $(seq 30); do running "$1" || return 0; sleep 1; done
  return 1
}
start() {
  if [ "$1" != ${mail} ] || running "$1"; then return 0; fi
  rm -f ${pidFile}
  ${startMail}
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
 * With the mail worker enabled and running, `upgrade()` (reinstalling the package) stops it and
 * openchronology-migrate starts it again; `--no-restart` starts nothing, and a disabled worker
 * stays stopped. Returns the upgrade's and the migration's output for the caller's checks.
 */
export async function checkMailWorkerUpgrade({ sh, upgrade }) {
  const active = async () =>
    (await sh(`systemctl is-active ${mail} && echo active || echo inactive`)).trim();
  const unit = await sh(`cat /usr/lib/systemd/system/${mail}`);
  const script = fakeSystemctl(unitCommand(unit, '/tmp/mail.log', pidFile));
  const config = '/etc/openchronology/openchronology.env';
  await sh(
    `set -e; real=$(command -v systemctl || true); echo "$real" > /tmp/systemctl.path; ` +
      `if [ -n "$real" ]; then mv "$real" "$real.real"; fi; ` +
      `mkdir -p ${state} /run/systemd/system; ` +
      `echo ${Buffer.from(script).toString('base64')} | base64 -d > "\${real:-/usr/bin/systemctl}"; ` +
      `chmod 0755 "\${real:-/usr/bin/systemctl}"; ` +
      `sed -i -e 's/^RESEND_API_KEY=.*/RESEND_API_KEY=re_placeholder/' ` +
      `-e 's/^AUTH_EMAIL_FROM=.*/AUTH_EMAIL_FROM=mail@example.test/' ${config}`,
  );
  const logs = () => sh(`cat ${state}/calls /tmp/mail.log`, { allowFailure: true });
  try {
    await sh(`systemctl enable --now ${mail}`);
    assert.equal(await active(), 'active', await logs());

    const upgraded = await upgrade();
    assert.equal(await active(), 'inactive', 'the upgrade stops the mail worker');

    const migrated = await sh('openchronology-migrate 2>&1');
    assert.match(migrated, /OpenChronology restarted\./, migrated);
    assert.match(migrated, /OpenChronology mail worker restarted\./, migrated);
    assert.match(await sh(`cat ${state}/calls`), /^systemctl restart openchronology\.service$/m);
    // Still running a moment later: it started with its configuration, not failed on it.
    await new Promise((r) => setTimeout(r, 3000));
    assert.equal(await active(), 'active', await logs());

    // --no-restart starts nothing.
    await sh(`systemctl stop ${mail}`);
    const migratedOnly = await sh('openchronology-migrate --no-restart 2>&1');
    assert.doesNotMatch(migratedOnly, /restarted/);
    assert.equal(await active(), 'inactive');

    // A disabled worker (email not configured) stays stopped.
    await sh(`systemctl disable ${mail}`);
    const disabled = await sh('openchronology-migrate 2>&1');
    assert.match(disabled, /OpenChronology restarted\./);
    assert.doesNotMatch(disabled, /mail worker restarted/);
    assert.equal(await active(), 'inactive');
    return { upgrade: upgraded, migrate: migrated };
  } finally {
    await sh(
      `systemctl stop ${mail}; real=$(cat /tmp/systemctl.path); ` +
        `if [ -n "$real" ]; then mv "$real.real" "$real"; else rm -f /usr/bin/systemctl; fi; ` +
        `rm -rf ${state} /run/systemd/system; ` +
        `sed -i -e 's/^RESEND_API_KEY=.*/RESEND_API_KEY=/' -e 's/^AUTH_EMAIL_FROM=.*/AUTH_EMAIL_FROM=/' ${config}`,
      { allowFailure: true },
    );
  }
}
