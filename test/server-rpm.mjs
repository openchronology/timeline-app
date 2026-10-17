// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Installs a server .rpm (scripts/server-package.mjs) in a fresh container of its distribution
// and checks the first install (PostgreSQL initialized for it), the running server, an upgrade
// and removal (#116).
// Usage: node test/server-rpm.mjs server-artifacts/openchronology-server-<target>-amd64.rpm
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { serverPackage, serverTargets } from '../scripts/server-targets.mjs';
import { checkSystemdServices } from './server-syslog.mjs';

const run = promisify(execFile);
const rpm = resolve(process.argv[2] ?? '');
const target = Object.keys(serverTargets).find((t) => basename(rpm) === serverPackage(t));
const base = target && serverTargets[target].format === 'rpm' && serverTargets[target].base;
if (!base) throw new Error('Pass a server .rpm built by scripts/server-package.mjs.');
const name = 'och-server-rpm-' + process.pid;
const sh = async (script, { allowFailure = false } = {}) => {
  try {
    const { stdout, stderr } = await run('docker', ['exec', name, 'bash', '-c', script], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout + stderr;
  } catch (error) {
    if (allowFailure) return (error.stdout ?? '') + (error.stderr ?? '');
    throw new Error(`${script}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
};
const psql = (sql, db = 'openchronology') =>
  sh(`runuser -u postgres -- psql -X -Atq -d ${db} -c "${sql}"`).then((s) => s.trim());
const file = '/tmp/' + basename(rpm);

await run('docker', ['run', '-d', '--rm', '--name', name, base, 'sleep', 'infinity']);
try {
  await run('docker', ['cp', rpm, `${name}:${file}`]);
  // A server without systemd, like a container: the package initializes and starts
  // PostgreSQL itself.
  // dnf 5 (Fedora) prints the package scripts' output; dnf 4 (Rocky, RHEL) logs it.
  const install = await sh(
    `dnf install -y -q ${file} 2>&1; cat /var/log/dnf.rpm.log 2>/dev/null || true`,
  );
  assert.match(install, /OpenChronology is installed and ready/, install.slice(-3000));
  assert.match(install, /OpenChronology schema installed\./);

  // The database, its pgmp extension and the configuration.
  assert.equal(
    await psql("SELECT rolname FROM pg_roles WHERE rolname='openchronology'", 'postgres'),
    'openchronology',
  );
  assert.equal(await psql("SELECT extname FROM pg_extension WHERE extname='pgmp'"), 'pgmp');
  assert.equal(await psql("SELECT '1/3'::mpq + '1/6'::mpq"), '1/2');
  assert.equal(await psql("SELECT to_regclass('oc_timelines') IS NOT NULL"), 't');
  const config = await sh(
    'stat -c "%a %U %G" /etc/openchronology/openchronology.env && cat /etc/openchronology/openchronology.env',
  );
  assert.match(config, /^640 root openchronology/);
  assert.match(config, /^AUTH_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
  assert.match(
    config,
    /^DATABASE_URL=postgresql:\/\/\/openchronology\?host=\/var\/run\/postgresql$/m,
  );
  // Local connections authenticate as the operating system user.
  assert.match(await sh('cat /var/lib/pgsql/data/pg_hba.conf'), /^local\s+all\s+all\s+peer/m);

  // The server runs as its service would (no systemd here), and answers.
  await sh(
    'runuser -u openchronology -- /usr/lib/openchronology/node/bin/node /usr/lib/openchronology/openchronology-server.mjs > /tmp/server.log 2>&1 & echo $! > /tmp/server.pid',
  );
  let health = '';
  for (let i = 0; i < 60 && !health.includes('200'); i++) {
    health = await sh('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/healthz', {
      allowFailure: true,
    });
    if (!health.includes('200')) await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(health.trim(), '200', await sh('cat /tmp/server.log', { allowFailure: true }));
  const session = JSON.parse(await sh('curl -s http://127.0.0.1:5173/api/session'));
  assert.equal(session.server, true, 'The server reaches its database.');
  assert.equal(
    (await sh('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/api/plugins')).trim(),
    '200',
  );
  assert.match(await sh('curl -s http://127.0.0.1:5173/'), /<html/i);
  // The SQLite converter finds its libraries on this distribution.
  assert.doesNotMatch(await sh('ldd /usr/lib/openchronology/bin/och-convert'), /not found/);
  assert.match(await sh('och-import-logs --help'), /^Usage: och-import-logs/);
  // The journald follower is installed, and loads with the bundled Node.js (#151).
  assert.match(
    await sh(
      'test -f /usr/lib/systemd/system/openchronology-journald.service && test -f /usr/share/openchronology/journald.env.example && echo installed',
    ),
    /installed/,
  );
  assert.match(
    await sh('cd /usr/lib/openchronology && node/bin/node server/journald-receiver.mjs 2>&1; true'),
    /Set JOURNALD_TIMELINE/,
  );
  // The services are valid systemd units, and the syslog receiver delivers a message into a
  // timeline as its unit runs it (#125).
  await checkSystemdServices({
    sh,
    psql,
    name: target,
    installSystemd: 'dnf install -y -q systemd',
  });
  await sh('kill "$(cat /tmp/server.pid)" || true');

  // The administrator (#118): its password is read whole from the configuration, # and
  // all, and openchronology-reset-admin-password sets it again.
  const adminPassword = 'Abc!def#ghi@jkl-mno';
  await sh(
    `sed -i -e 's/^ADMIN_USERNAME=.*/ADMIN_USERNAME=admin/' -e 's/^ADMIN_INITIAL_PASSWORD=.*/ADMIN_INITIAL_PASSWORD=${adminPassword}/' /etc/openchronology/openchronology.env`,
  );
  await sh('openchronology-migrate --no-restart');
  const adminMatches = async () =>
    (
      await sh(
        `cd / && /usr/lib/openchronology/node/bin/node --input-type=module -e "import { passwordMatches } from '/usr/lib/openchronology/server/auth.mjs'; console.log(await passwordMatches(process.argv[1], process.argv[2]))" '${adminPassword}' "$(runuser -u postgres -- psql -X -Atq -d openchronology -c "SELECT password_hash FROM oc_users WHERE username='admin'")"`,
      )
    ).trim();
  assert.equal(await adminMatches(), 'true', 'the administrator has the whole password');
  await psql("UPDATE oc_users SET password_hash=NULL WHERE username='admin'");
  assert.equal(await adminMatches(), 'false');
  const reset = await sh('openchronology-reset-admin-password 2>&1');
  assert.match(
    reset,
    /The password of admin \(administrator\) is now ADMIN_INITIAL_PASSWORD/,
    reset,
  );
  assert.equal(await adminMatches(), 'true');

  // Reinstalling takes the upgrade path: configuration and database are kept, and the
  // administrator is told what to review and to run openchronology-migrate.
  await psql(
    "INSERT INTO oc_users(id,username,email_verified_at) VALUES(gen_random_uuid(),'kept',now())",
  );
  const key = /^AUTH_ENCRYPTION_KEY=.*$/m.exec(config)[0];
  const upgrade = await sh(`rpm -Uvh --replacepkgs ${file} 2>&1`);
  assert.match(upgrade, /is installed over an earlier version/, upgrade);
  assert.match(upgrade, /sudo openchronology-migrate/);
  assert.match(upgrade, /diff -u \/etc\/openchronology\/openchronology\.env/);
  assert.match(
    await sh('cat /etc/openchronology/openchronology.env'),
    new RegExp('^' + key + '$', 'm'),
  );
  assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='kept'"), '1');
  assert.match(await sh('openchronology-migrate 2>&1'), /OpenChronology schema installed\./);
  // Setup is safe to run again by hand.
  assert.match(await sh('openchronology-setup 2>&1'), /OpenChronology is installed and ready/);

  // Removing it keeps the configuration and the database, and says how to delete them.
  const remove = await sh('rpm -e openchronology-server 2>&1');
  assert.match(remove, /the PostgreSQL database and the openchronology system user remain/i);
  assert.match(await sh('test -e /etc/openchronology && echo present || echo gone'), /present/);
  assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='kept'"), '1');
  console.log(
    `PASS server package on ${base}: install, PostgreSQL initialized, database with pgmp, server, upgrade, removal.`,
  );
} finally {
  await run('docker', ['rm', '-f', name]).catch(() => {});
}
