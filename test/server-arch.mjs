// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the AUR server package (scripts/aur-packages.mjs) with makepkg in a fresh Arch Linux
// container, installs it, and checks openchronology-setup (PostgreSQL initialized for it), the
// running server on Arch's Node.js and PostgreSQL, an upgrade and removal (#331).
// Usage: node test/server-arch.mjs <folder with the rendered openchronology-server PKGBUILD>
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { checkSystemdServices } from './server-syslog.mjs';
import { checkServicesUpgrade } from './server-upgrade-services.mjs';

const run = promisify(execFile);
const folder = resolve(process.argv[2] ?? '');
if (!existsSync(join(folder, 'PKGBUILD')))
  throw new Error('Pass the folder scripts/aur-packages.mjs rendered openchronology-server in.');
const name = 'och-server-arch-' + process.pid;
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

await run('docker', ['run', '-d', '--rm', '--name', name, 'archlinux:latest', 'sleep', 'infinity']);
try {
  // pacman gives up on a stalled mirror (#367); its download sandbox needs kernel features a
  // container may lack.
  await sh(
    "sed -i -e 's/^#\\?ParallelDownloads.*/ParallelDownloads = 4/' -e '/^\\[options\\]/a DisableSandbox' /etc/pacman.conf",
  );
  // makepkg's own needs, then the package's dependencies, so it builds without root.
  await sh(
    'pacman -Syu --noconfirm --needed base-devel git curl cargo cmake pkgconf python nodejs postgresql gmp sqlite >/dev/null',
  );
  await sh('useradd -m builder');
  await run('docker', ['cp', folder, `${name}:/home/builder/openchronology-server`]);
  await sh('chown -R builder:builder /home/builder/openchronology-server');
  const build = (script) =>
    sh(`cd /home/builder/openchronology-server && runuser -u builder -- ${script}`);
  // The PKGBUILD is what the AUR reads: its .SRCINFO, and a build that checks every source.
  assert.match(await build('makepkg --printsrcinfo'), /pkgbase = openchronology-server/);
  await build('makepkg --noconfirm 2>&1');
  const pkg = (await build('ls openchronology-server-*.pkg.tar.zst')).trim();

  // Installing creates the system user and says what to run, and sets nothing else up.
  const install = await sh(`pacman -U --noconfirm /home/builder/openchronology-server/${pkg} 2>&1`);
  assert.match(install, /sudo openchronology-setup/, install.slice(-3000));
  assert.match(await sh('getent passwd openchronology'), /^openchronology:/);
  assert.match(
    await sh('test -e /etc/openchronology/openchronology.env && echo set || echo not'),
    /not/,
  );

  // A server without systemd, like a container: setup initializes and starts PostgreSQL itself.
  const setup = await sh('openchronology-setup 2>&1');
  assert.match(setup, /OpenChronology is installed and ready/, setup.slice(-3000));
  assert.match(setup, /OpenChronology schema installed\./);

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
  assert.match(await sh('cat /var/lib/postgres/data/pg_hba.conf'), /^local\s+all\s+all\s+peer/m);

  // The server runs as its service would (no systemd here) on this system's Node.js.
  assert.equal(
    (await sh('readlink /usr/lib/openchronology/node/bin/node')).trim(),
    '/usr/bin/node',
  );
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
  assert.match(await sh('curl -s http://127.0.0.1:5173/'), /<html/i);
  assert.doesNotMatch(await sh('ldd /usr/lib/openchronology/bin/och-convert'), /not found/);
  assert.match(await sh('och-import-logs --help'), /^Usage: och-import-logs/);
  assert.match(
    await sh('cd /usr/lib/openchronology && node/bin/node server/journald-receiver.mjs 2>&1; true'),
    /Set JOURNALD_TIMELINE/,
  );
  // The services are valid systemd units, and the syslog receiver delivers a message into a
  // timeline as its unit runs it (#125).
  await checkSystemdServices({ sh, psql, name: 'arch', installSystemd: 'true' });
  await sh('kill "$(cat /tmp/server.pid)" || true');

  // The administrator (#118), from the configuration, and set again on request.
  await sh(
    "sed -i -e 's/^ADMIN_USERNAME=.*/ADMIN_USERNAME=admin/' -e 's/^ADMIN_INITIAL_PASSWORD=.*/ADMIN_INITIAL_PASSWORD=Abc!def#ghi@jkl-mno/' /etc/openchronology/openchronology.env",
  );
  await sh('openchronology-migrate --no-restart');
  assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='admin'"), '1');
  assert.match(
    await sh('openchronology-reset-admin-password 2>&1'),
    /The password of admin \(administrator\) is now ADMIN_INITIAL_PASSWORD/,
  );

  // Reinstalling takes the upgrade path: configuration and database are kept, and the
  // administrator is told what to review and to run openchronology-migrate.
  await psql(
    "INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES(gen_random_uuid(),'kept',now(),oc_policy_version())",
  );
  const key = /^AUTH_ENCRYPTION_KEY=.*$/m.exec(config)[0];
  const { upgrade, migrate } = await checkServicesUpgrade({
    sh,
    upgrade: () => sh(`pacman -U --noconfirm /home/builder/openchronology-server/${pkg} 2>&1`),
  });
  assert.match(upgrade, /is installed over an earlier version/, upgrade);
  assert.match(upgrade, /sudo openchronology-migrate/);
  assert.match(
    await sh('cat /etc/openchronology/openchronology.env'),
    new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'),
  );
  assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='kept'"), '1');
  assert.match(migrate, /OpenChronology schema installed\./);
  assert.match(await sh('openchronology-setup 2>&1'), /OpenChronology is installed and ready/);

  // Removing it keeps the configuration and the database, and says how to delete them.
  const remove = await sh('pacman -R --noconfirm openchronology-server 2>&1');
  assert.match(remove, /the PostgreSQL database and the openchronology and openchronology-logs\s+system users remain/i);
  assert.match(await sh('test -e /etc/openchronology && echo present || echo gone'), /present/);
  assert.equal(await psql("SELECT count(*) FROM oc_users WHERE username='kept'"), '1');
  console.log(
    'PASS server package on Arch Linux: built with makepkg, installed, set up with PostgreSQL initialized, database with pgmp, server on Arch’s Node.js, upgrade, removal.',
  );
} finally {
  await run('docker', ['rm', '-f', name]).catch(() => {});
}
