// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Installs the Windows server (deploy/windows-server) unattended and checks it (#116): the
// services, PostgreSQL with pgmp, the configuration, the server answering, the
// administrator's password (#118), an upgrade (the installer again) and removal. Run on
// Windows as an administrator:
//   node test/server-windows.mjs server-artifacts\openchronology-server-windows-amd64-setup.exe
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { checkSyslogService, fetchApi } from './server-syslog.mjs';

const run = promisify(execFile);
const installer = resolve(process.argv[2] ?? '');
const dir = 'C:\\Program Files\\OpenChronology Server';
const data = 'C:\\ProgramData\\OpenChronology';
const configFile = `${data}\\openchronology.env`;
const ps = async (script, { allowFailure = false } = {}) => {
  try {
    const { stdout, stderr } = await run(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout + stderr;
  } catch (error) {
    if (allowFailure) return (error.stdout ?? '') + (error.stderr ?? '');
    throw new Error(`${script}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
};
// The installer, unattended: its exit code is setup's outcome.
const install = async () => {
  const code = (
    await ps(`(Start-Process -Wait -PassThru -FilePath '${installer}' -ArgumentList '/S').ExitCode`)
  ).trim();
  const log = await ps(`Get-Content -Raw '${data}\\setup.log'`, { allowFailure: true });
  assert.equal(code, '0', `The installer exited with ${code}:\n${log.slice(-12000)}`);
  return log;
};
const status = async (name) =>
  (await ps(`(Get-Service ${name} -ErrorAction SilentlyContinue).Status`)).trim();
const psql = async (sql, db = 'openchronology') => {
  const superuser = (await readFile(`${data}\\postgres-superuser.txt`, 'utf8')).trim();
  const { stdout } = await run(
    `${dir}\\pgsql\\bin\\psql.exe`,
    ['-X', '-Atq', '-h', '127.0.0.1', '-p', '5442', '-U', 'postgres', '-d', db, '-c', sql],
    { env: { ...process.env, PGPASSWORD: superuser } },
  );
  return stdout.trim();
};
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
      (await ps(`Get-Content -Tail 50 '${data}\\logs\\*.log'`, { allowFailure: true })),
  );
};

// Installed: PostgreSQL and the server as services, the database with pgmp, the configuration.
const setup = await install();
assert.match(setup, /OpenChronology is installed and running/, setup.slice(-4000));
assert.match(setup, /OpenChronology schema installed\./);
assert.equal(await status('OpenChronologyPostgreSQL'), 'Running');
assert.equal(await status('OpenChronology'), 'Running');
assert.match(await ps('(Get-Service OpenChronology).StartType'), /Automatic/);
assert.equal(await psql("SELECT extname FROM pg_extension WHERE extname='pgmp'"), 'pgmp');
assert.equal(await psql("SELECT '1/3'::mpq + '1/6'::mpq"), '1/2');
assert.equal(await psql("SELECT to_regclass('oc_timelines') IS NOT NULL"), 't');
const config = await readFile(configFile, 'utf8');
assert.match(config, /^AUTH_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
assert.match(
  config,
  /^DATABASE_URL=postgresql:\/\/openchronology:[a-f0-9]{48}@127\.0\.0\.1:5442\/openchronology$/m,
);
// Only administrators, the system and the server's Local Service account read it.
const access = await ps(`icacls '${configFile}'`);
assert.match(access, /BUILTIN\\Administrators:\(F\)/);
assert.match(access, /NT AUTHORITY\\LOCAL SERVICE:\(R\)/);
assert.doesNotMatch(access, /BUILTIN\\Users|Everyone|Authenticated Users/);
// The server's process runs as Local Service.
assert.match(
  await ps('(Get-CimInstance Win32_Service -Filter "Name=\'OpenChronology\'").StartName'),
  /LocalService/i,
);
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });
const session = await (await fetch('http://127.0.0.1:5173/api/session')).json();
assert.equal(session.server, true, 'The server reaches its database.');
assert.equal((await fetch('http://127.0.0.1:5173/api/plugins')).status, 200);
assert.match(await (await fetch('http://127.0.0.1:5173/')).text(), /<html/i);
assert.match(await ps(`& '${dir}\\och-import-logs.cmd' --help`), /Usage: och-import-logs/);

// The syslog receiver and email delivery are services too (#125), installed to start by hand.
for (const name of ['OpenChronologySyslog', 'OpenChronologyMail']) {
  assert.equal(await status(name), 'Stopped');
  assert.match(await ps(`(Get-Service ${name}).StartType`), /Manual/);
}
// Configured and started as README.Windows.txt says, the receiver delivers a message into a
// timeline as Local Service, which setup let read its configuration and routes.
const syslogConfig = `${data}\\syslog.env`;
await checkSyslogService({
  name: 'Windows',
  psql,
  api: fetchApi,
  configure: async (key, routes) => {
    const text = await readFile(syslogConfig, 'utf8');
    await writeFile(syslogConfig, text.replace(/^OCH_API_KEY=.*$/m, `OCH_API_KEY=${key}`));
    await writeFile(`${data}\\syslog-routes.json`, routes);
  },
  start: async () => {
    await ps(
      'Set-Service OpenChronologySyslog -StartupType Automatic; Start-Service OpenChronologySyslog',
    );
    assert.equal(await status('OpenChronologySyslog'), 'Running');
    assert.match(
      await ps('(Get-CimInstance Win32_Service -Filter "Name=\'OpenChronologySyslog\'").StartName'),
      /LocalService/i,
    );
  },
  stop: async () => {
    await ps('Stop-Service OpenChronologySyslog');
    assert.equal(await status('OpenChronologySyslog'), 'Stopped');
  },
  logs: () =>
    ps(`Get-Content -Tail 40 '${data}\\logs\\openchronology-syslog-service*.log'`, {
      allowFailure: true,
    }),
});

// The administrator (#118): its password is read whole from the configuration, # and all,
// and openchronology-reset-admin-password sets it again.
const adminPassword = 'Abc!def#ghi@jkl-mno';
await writeFile(
  configFile,
  config
    .replace(/^ADMIN_USERNAME=.*$/m, 'ADMIN_USERNAME=admin')
    .replace(/^ADMIN_INITIAL_PASSWORD=.*$/m, `ADMIN_INITIAL_PASSWORD=${adminPassword}`),
);
const migrated = await ps(`& '${dir}\\openchronology-migrate.cmd'`);
assert.match(migrated, /OpenChronology schema installed\./);
assert.match(migrated, /OpenChronology restarted\./);
// The mail worker is not enabled, so it stays stopped (#371).
assert.doesNotMatch(migrated, /mail worker restarted/);
const { passwordMatches } = await import(pathToFileURL(`${dir}\\app\\server\\auth.mjs`).href);
const adminMatches = async () =>
  passwordMatches(
    adminPassword,
    await psql("SELECT password_hash FROM oc_users WHERE username='admin'"),
  );
assert.equal(await adminMatches(), true, 'the administrator has the whole password');
await psql("UPDATE oc_users SET password_hash=NULL WHERE username='admin'");
const reset = await ps(`& '${dir}\\openchronology-reset-admin-password.cmd'`);
assert.match(reset, /The password of admin \(administrator\) is now ADMIN_INITIAL_PASSWORD/, reset);
assert.equal(await adminMatches(), true);
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });

// An upgrade (the installer again) keeps the configuration and database and runs again.
const key = /^AUTH_ENCRYPTION_KEY=.*$/m.exec(config)[0];
const upgrade = await install();
assert.match(upgrade, /OpenChronology is upgraded/, upgrade.slice(-3000));
assert.match(await readFile(configFile, 'utf8'), new RegExp('^' + key + '$', 'm'));
assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='admin'"), '1');
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });
// The receiver, set to start with Windows, runs again after the upgrade; email delivery, still
// started by hand, does not.
assert.equal(await status('OpenChronologySyslog'), 'Running');
assert.equal(await status('OpenChronologyMail'), 'Stopped');

// Removing it removes the services and the program, and keeps the configuration and data.
await ps(`Start-Process -Wait -FilePath '${dir}\\uninstall.exe' -ArgumentList '/S', '_?=${dir}'`);
assert.equal(await status('OpenChronology'), '');
assert.equal(await status('OpenChronologyPostgreSQL'), '');
assert.equal(await status('OpenChronologySyslog'), '');
assert.equal(await status('OpenChronologyMail'), '');
assert.match(await ps(`Test-Path '${configFile}'`), /True/);
assert.match(await ps(`Test-Path '${data}\\pgdata\\PG_VERSION'`), /True/);
assert.match(await ps(`Test-Path '${dir}\\app'`), /False/);
await assert.rejects(fetch('http://127.0.0.1:5173/healthz'));
console.log(
  `PASS Windows server: install with PostgreSQL 17 and pgmp as services, configuration access, the server, the administrator's password, upgrade, removal.\n\n${setup.slice(-1500)}`,
);
