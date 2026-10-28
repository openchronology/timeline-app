// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Checks the Homebrew formula (deploy/homebrew) once installed on a Mac (#116): setup with
// PostgreSQL 17 and the service, the server answering, the administrator's password (#118),
// setup again, and removal. CI installs the formula from a local tap first.
// Usage, on macOS with openchronology-server installed: node test/server-homebrew.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkSyslogService, fetchApi } from './server-syslog.mjs';

const run = promisify(execFile);
const sh = async (script, { allowFailure = false } = {}) => {
  try {
    const { stdout, stderr } = await run('sh', ['-c', script], { maxBuffer: 64 * 1024 * 1024 });
    return stdout + stderr;
  } catch (error) {
    if (allowFailure) return (error.stdout ?? '') + (error.stderr ?? '');
    throw new Error(`${script}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
};
const prefix = (await sh('brew --prefix')).trim();
const pgBin = (await sh('brew --prefix postgresql@17')).trim() + '/bin';
const configFile = `${prefix}/etc/openchronology/openchronology.env`;
const psql = (sql, db = 'openchronology') =>
  sh(`"${pgBin}/psql" -X -Atq -h /tmp -d ${db} -c "${sql}"`).then((s) => s.trim());
const healthy = async () => {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch('http://127.0.0.1:5173/healthz');
      if (response.ok) return response.json();
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    'The server did not answer:\n' +
      (await sh(`tail -50 "${prefix}/var/log/openchronology.log"`, { allowFailure: true })),
  );
};

// Setup: PostgreSQL started, the database with pgmp, the configuration and the service.
const setup = await sh('openchronology-setup 2>&1');
assert.match(setup, /OpenChronology is installed and running/, setup);
assert.match(setup, /OpenChronology schema installed\./);
assert.equal(await psql("SELECT extname FROM pg_extension WHERE extname='pgmp'"), 'pgmp');
assert.equal(await psql("SELECT '1/3'::mpq + '1/6'::mpq"), '1/2');
assert.equal(await psql("SELECT to_regclass('oc_timelines') IS NOT NULL"), 't');
const config = await sh(`stat -f '%Lp' "${configFile}" && cat "${configFile}"`);
assert.match(config, /^600$/m);
assert.match(config, /^AUTH_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
const user = (await sh('id -un')).trim();
assert.match(
  config,
  new RegExp(`^DATABASE_URL=postgresql://${user}@/openchronology\\?host=/tmp$`, 'm'),
);
// brew colors its status even when piped; the words are what matter.
const services = (await sh('brew services list')).replace(/\x1B\[[0-9;]*m/g, '');
assert.match(services, /^openchronology-server\s+started/m, services);
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });
const session = await (await fetch('http://127.0.0.1:5173/api/session')).json();
assert.equal(session.server, true, 'The server reaches its database.');
assert.equal((await fetch('http://127.0.0.1:5173/api/plugins')).status, 200);
assert.match(await (await fetch('http://127.0.0.1:5173/')).text(), /<html/i);
assert.match(await sh('och-import-logs --help'), /^Usage: och-import-logs/);

// The syslog receiver as a launchd agent (openchronology-agent, #125) delivers a message into
// a timeline, keeps running once macOS registers it as a background item, and stops for good
// when stopped.
const agentPlist = `${process.env.HOME}/Library/LaunchAgents/org.openchronology.syslog.plist`;
const agentLog = `${prefix}/var/log/openchronology-syslog.log`;
// The agent's status, failing with launchd's account of it (and its log) unless it is running.
const assertRunning = async (when) => {
  const status = await sh('openchronology-agent status syslog', { allowFailure: true });
  if (/^state = running$/m.test(status)) return;
  assert.fail(
    `${when}: ${status}` +
      (await sh(
        `launchctl print-disabled "gui/$(id -u)" | grep -i openchronology; tail -20 "${agentLog}"; ` +
          `log show --last 2m --style compact --info --debug --predicate 'eventMessage CONTAINS "org.openchronology" OR eventMessage CONTAINS "launchdDidScanPath" OR eventMessage CONTAINS "register-only"' | grep -v ' log\\[' | tail -60`,
        { allowFailure: true },
      )),
  );
};
await checkSyslogService({
  name: 'macOS',
  psql,
  api: fetchApi,
  configure: (key, routes) =>
    sh(
      `sed -i '' 's|^OCH_API_KEY=.*|OCH_API_KEY=${key}|' "${prefix}/etc/openchronology/syslog.env" && printf '%s' '${routes}' > "${prefix}/etc/openchronology/syslog-routes.json"`,
    ),
  start: async () => {
    assert.match(await sh('openchronology-agent start syslog'), /openchronology-syslog started/);
    assert.match(await sh(`plutil -lint "${agentPlist}"`), /OK/);
    assert.match(
      await sh('launchctl print-disabled "gui/$(id -u)"'),
      /"org\.openchronology\.syslog" => enabled/,
    );
    // macOS registers a new agent as a background item seconds after it starts; an agent not
    // enabled explicitly is removed then.
    await sh('sleep 15');
    await assertRunning('15 seconds after starting');
  },
  stop: async () => {
    await assertRunning('Before stopping');
    assert.match(await sh('openchronology-agent stop syslog'), /stopped/);
  },
  logs: () =>
    sh(`tail -40 "${agentLog}"; launchctl print "gui/$(id -u)/org.openchronology.syslog"`, {
      allowFailure: true,
    }),
});
assert.match(await sh(`test -e "${agentPlist}" && echo present || echo gone`), /gone/);
assert.match(
  await sh('openchronology-agent status syslog; echo "exit $?"', { allowFailure: true }),
  /is not started[\s\S]*exit 3/,
);
assert.match(await sh(`tail -5 "${agentLog}"`), /^syslog: stopped/m);
assert.match(
  await sh('openchronology-agent start nothing 2>&1; echo "exit $?"', { allowFailure: true }),
  /Usage: openchronology-agent[\s\S]*exit 2/,
);

// The administrator (#118): its password is read whole from the configuration, # and all,
// and openchronology-reset-admin-password sets it again.
const adminPassword = 'Abc!def#ghi@jkl-mno';
await sh(
  `sed -i '' -e 's/^ADMIN_USERNAME=.*/ADMIN_USERNAME=admin/' -e 's/^ADMIN_INITIAL_PASSWORD=.*/ADMIN_INITIAL_PASSWORD=${adminPassword}/' "${configFile}"`,
);
const migrated = await sh('openchronology-migrate 2>&1');
assert.match(migrated, /OpenChronology schema installed\./);
assert.match(migrated, /OpenChronology restarted\./);
// The mail worker and the syslog receiver are not enabled, so they stay stopped (#371, #374).
assert.doesNotMatch(migrated, /mail worker restarted/);
assert.doesNotMatch(migrated, /syslog receiver restarted/);
const { passwordMatches } = await import(
  `${prefix}/opt/openchronology-server/libexec/server/auth.mjs`
);
const adminMatches = async () =>
  passwordMatches(
    adminPassword,
    await psql("SELECT password_hash FROM oc_users WHERE username='admin'"),
  );
assert.equal(await adminMatches(), true, 'the administrator has the whole password');
await psql("UPDATE oc_users SET password_hash=NULL WHERE username='admin'");
const reset = await sh('openchronology-reset-admin-password 2>&1');
assert.match(reset, /The password of admin \(administrator\) is now ADMIN_INITIAL_PASSWORD/, reset);
assert.equal(await adminMatches(), true);
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });

// Setup again keeps the configuration and database, and says how to migrate.
const key = /^AUTH_ENCRYPTION_KEY=.*$/m.exec(config)[0];
const again = await sh('openchronology-setup 2>&1');
assert.match(again, /set up already/, again);
assert.match(again, /openchronology-migrate/);
assert.match(await sh(`cat "${configFile}"`), new RegExp('^' + key + '$', 'm'));

// Removing it keeps the configuration and the database. Homebrew would remove PostgreSQL 17
// with it too (as an unneeded dependency) unless asked to keep it, as README.Homebrew says.
await sh('brew install postgresql@17 2>&1');
await sh('brew services stop openchronology-server && brew uninstall openchronology-server');
assert.match(await sh(`test -e "${configFile}" && echo present || echo gone`), /present/);
assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='admin'"), '1');
await assert.rejects(fetch('http://127.0.0.1:5173/healthz'));
console.log(
  `PASS Homebrew formula: setup with PostgreSQL 17 and pgmp, the service, the administrator's password, setup again, removal.\n\n${setup.slice(-1200)}`,
);
