// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Installs the FreeBSD server package (deploy/freebsd-server/build.sh) on a fresh FreeBSD
// system and checks the first install (PostgreSQL initialized and enabled, the service
// running), an upgrade and removal (#116). Run as root on a FreeBSD virtual machine that has
// only Node.js for this test:
//   node test/server-freebsd.mjs server-artifacts/openchronology-server-freebsd14-amd64.pkg
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const file = resolve(process.argv[2] ?? '');
if (!/openchronology-server-freebsd\d+-amd64\.pkg$/.test(file))
  throw new Error('Pass a FreeBSD server package built by deploy/freebsd-server/build.sh.');
const sh = async (script, { allowFailure = false } = {}) => {
  try {
    const { stdout, stderr } = await run('sh', ['-c', script], { maxBuffer: 64 * 1024 * 1024 });
    return stdout + stderr;
  } catch (error) {
    if (allowFailure) return (error.stdout ?? '') + (error.stderr ?? '');
    throw new Error(`${script}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
};
const psql = (sql, db = 'openchronology') =>
  sh(`printf '%s\\n' "${sql}" | su -l postgres -c 'psql -X -Atq -d ${db}'`).then((s) => s.trim());
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
  throw new Error('The server did not answer:\n' + (await sh('tail -50 /var/log/messages')));
};

// Installed as the README says: pkg resolves its dependencies from FreeBSD's repositories.
const install = await sh(`env ASSUME_ALWAYS_YES=yes pkg install -y ${file} 2>&1`);
assert.match(install, /OpenChronology is installed and running/, install.slice(-4000));
assert.match(install, /OpenChronology schema installed\./);

// PostgreSQL, the database, its pgmp extension and the configuration.
assert.match(await sh('sysrc -n postgresql_enable'), /YES/);
assert.equal(
  await psql("SELECT rolname FROM pg_roles WHERE rolname='openchronology'", 'postgres'),
  'openchronology',
);
assert.equal(await psql("SELECT extname FROM pg_extension WHERE extname='pgmp'"), 'pgmp');
assert.equal(await psql("SELECT '1/3'::mpq + '1/6'::mpq"), '1/2');
assert.equal(await psql("SELECT to_regclass('oc_timelines') IS NOT NULL"), 't');
const configFile = '/usr/local/etc/openchronology/openchronology.env';
const config = await sh(`stat -f '%Lp %Su %Sg' ${configFile} && cat ${configFile}`);
assert.match(config, /^640 root openchronology/);
assert.match(config, /^AUTH_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
assert.match(config, /^DATABASE_URL=postgresql:\/\/\/openchronology\?host=\/tmp$/m);

// The rc.d service runs the server, which answers.
assert.match(await sh('sysrc -n openchronology_enable'), /YES/);
assert.match(await sh('service openchronology status'), /is running/);
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });
const session = await (await fetch('http://127.0.0.1:5173/api/session')).json();
assert.equal(session.server, true, 'The server reaches its database.');
assert.equal((await fetch('http://127.0.0.1:5173/api/plugins')).status, 200);
assert.match(await (await fetch('http://127.0.0.1:5173/')).text(), /<html/i);
// The SQLite converter finds its libraries.
assert.doesNotMatch(await sh('ldd /usr/local/lib/openchronology/bin/och-convert'), /not found/);
assert.match(await sh('och-import-logs --help'), /^Usage: och-import-logs/);

// Reinstalling takes the upgrade path: configuration and database are kept, and the
// administrator is told what to review and to run openchronology-migrate.
await psql(
  "INSERT INTO oc_users(id,username,email_verified_at) VALUES(gen_random_uuid(),'kept',now())",
);
const key = /^AUTH_ENCRYPTION_KEY=.*$/m.exec(config)[0];
const upgrade = await sh(`env ASSUME_ALWAYS_YES=yes pkg install -f -y ${file} 2>&1`);
assert.match(upgrade, /is installed over an earlier version/, upgrade.slice(-4000));
assert.match(upgrade, /openchronology-migrate/);
assert.match(upgrade, /diff -u \/usr\/local\/etc\/openchronology\/openchronology\.env/);
assert.match(await sh(`cat ${configFile}`), new RegExp('^' + key + '$', 'm'));
assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='kept'"), '1');
const migrated = await sh('openchronology-migrate 2>&1');
assert.match(migrated, /OpenChronology schema installed\./);
assert.match(migrated, /OpenChronology restarted\./);
assert.deepEqual(await healthy(), { status: 'ok', storage: 'postgresql' });

// Removing it stops the service and keeps the configuration and the database.
const remove = await sh('env ASSUME_ALWAYS_YES=yes pkg delete -y openchronology-server 2>&1');
assert.match(remove, /the PostgreSQL database and the openchronology system user remain/i);
assert.match(await sh(`test -e ${configFile} && echo present || echo gone`), /present/);
assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='kept'"), '1');
await assert.rejects(fetch('http://127.0.0.1:5173/healthz'));
console.log(
  `PASS FreeBSD server package: install, PostgreSQL initialized, database with pgmp, rc.d service, upgrade, removal.\n\nInstall output:\n${install.slice(-1500)}\n\nUpgrade output:\n${upgrade.slice(-1500)}`,
);
