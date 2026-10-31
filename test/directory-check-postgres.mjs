// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The periodic directory check (server/directory-check.mjs, #408) against a real OpenLDAP
// server and PostgreSQL: someone deleted from the directory, or taken out of the required
// group, loses their sessions and API keys once, with an audit record; someone still in it
// keeps theirs; a directory that cannot be reached, or refuses the service account, changes
// nothing; a run that would sign out most accounts at once is taken for a misconfiguration;
// someone let back in is acted on again if they leave again; a check runs once per interval.
//
// The directory is LDAP_TEST_URL (with LDAP_TEST_ADMIN_DN and LDAP_TEST_ADMIN_PASSWORD for an
// account that may add entries under LDAP_TEST_BASE_DN), or else an osixia/openldap container
// this test starts with Docker and removes, as ldap-postgres.mjs does. Without either, it says
// so and skips (or fails, with LDAP_TEST_REQUIRED=1).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Attribute, Change, Client } from 'ldapts';
import { Auth } from '../server/auth.mjs';
import { Directory, directoryFromEnv } from '../server/ldap.mjs';
import { checkAccounts, checkDue } from '../server/directory-check.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');

let container = null,
  url = process.env.LDAP_TEST_URL,
  adminDn = process.env.LDAP_TEST_ADMIN_DN ?? 'cn=admin,dc=school,dc=example',
  adminPassword = process.env.LDAP_TEST_ADMIN_PASSWORD ?? 'admin-secret';
const baseDn = process.env.LDAP_TEST_BASE_DN ?? 'dc=school,dc=example';
if (!url) {
  try {
    container = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '-p',
        '127.0.0.1::389',
        '-e',
        'LDAP_ORGANISATION=School',
        '-e',
        'LDAP_DOMAIN=school.example',
        '-e',
        'LDAP_ADMIN_PASSWORD=' + adminPassword,
        '-e',
        'LDAP_TLS=false',
        'osixia/openldap:1.5.0',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const port = execFileSync('docker', ['port', container, '389/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .pop();
    url = 'ldap://127.0.0.1:' + port;
  } catch (error) {
    if (process.env.LDAP_TEST_REQUIRED === '1') throw error;
    console.log('SKIP directory check: set LDAP_TEST_URL or make Docker available.');
    process.exit(0);
  }
}
const stop = () => {
  if (container) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
};

const suffix = Date.now().toString(36),
  people = `ou=people-${suffix},${baseDn}`,
  group = `cn=staff-${suffix},${baseDn}`,
  names = ['ana', 'bob', 'carol', 'dan'].map((n) => `${n}-${suffix}`);
const dn = (uid) => `uid=${uid},${people}`;

/**
 * Binds as the directory's administrator, waiting up to a minute for it to start (a container
 * this test started must first finish its setup, as in ldap-postgres.mjs).
 */
async function admin() {
  for (let i = 0; container; i++) {
    const { stdout, stderr } = spawnSync('docker', ['logs', container], { encoding: 'utf8' }),
      log = stdout + stderr;
    const done = log.indexOf('First start is done');
    if (done >= 0 && log.indexOf('slapd starting', done) >= 0) break;
    if (i > 120) throw new Error('The OpenLDAP container did not finish starting.');
    await delay(500);
  }
  for (let i = 0; ; i++)
    try {
      const client = new Client({ url, timeout: 5000, connectTimeout: 5000 });
      await client.bind(adminDn, adminPassword);
      return client;
    } catch (error) {
      if (i > 60) throw error;
      await delay(1000);
    }
}
/** The log, kept for assertions instead of printed. */
const lines = [];
const log = {
  info: (...a) => lines.push(['info', a.join(' ')]),
  error: (...a) => lines.push(['error', a.join(' ')]),
};
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  // Everyone is a person in the directory; all but dan are in the staff group.
  const directoryAdmin = await admin();
  await directoryAdmin.add(people, { objectClass: ['organizationalUnit'], ou: 'people-' + suffix });
  for (const uid of names)
    await directoryAdmin.add(dn(uid), {
      objectClass: ['inetOrgPerson'],
      uid,
      cn: uid,
      sn: 'Test',
      userPassword: 'directory passphrase',
    });
  await directoryAdmin.add(group, {
    objectClass: ['groupOfUniqueNames'],
    cn: 'staff-' + suffix,
    uniqueMember: names.slice(0, 3).map(dn),
  });
  const subjects = {};
  for (const uid of names) {
    const { searchEntries } = await directoryAdmin.search(dn(uid), {
      scope: 'base',
      attributes: ['entryUUID'],
    });
    subjects[uid] = 'uuid:' + String(searchEntries[0].entryUUID).toLowerCase();
  }

  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  // Only this test's directory accounts, and a clear schedule.
  await pool.query("DELETE FROM oc_identities WHERE provider='ldap'");
  await pool.query('UPDATE oc_site_settings SET directory_checked_at=NULL');
  const settings = {
    LDAP_URL: url,
    LDAP_ALLOW_INSECURE: '1',
    LDAP_BIND_DN: adminDn,
    LDAP_BIND_PASSWORD: adminPassword,
    LDAP_BASE_DN: baseDn,
    LDAP_USER_FILTER: '(&(objectClass=inetOrgPerson)(uid={username}))',
    LDAP_USERNAME_ATTRIBUTE: 'uid',
    LDAP_REQUIRED_GROUP: group,
  };
  const auth = new Auth(pool, 'http://localhost');
  const directory = (env = {}) =>
    new Directory(auth, null, directoryFromEnv({ ...settings, ...env }));

  // Each person has an account made by a directory sign-in, with a session and an API key.
  const accounts = {};
  for (const uid of names) {
    const id = randomUUID();
    accounts[uid] = id;
    await pool.query('INSERT INTO oc_users(id,username,password_hash) VALUES($1,$2,NULL)', [
      id,
      uid,
    ]);
    await pool.query("INSERT INTO oc_identities(provider,subject,user_id) VALUES('ldap',$1,$2)", [
      subjects[uid],
      id,
    ]);
  }
  const grant = async (uid) => {
    const id = accounts[uid];
    await pool.query(
      "INSERT INTO oc_sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 day')",
      [randomBytes(32).toString('hex'), id],
    );
    await pool.query(
      `INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at)
      VALUES($1,$2,'automation','och_key_x',$3,ARRAY['timelines:read'],now()+interval '30 days')`,
      [randomUUID(), id, randomBytes(32).toString('hex')],
    );
  };
  for (const uid of names) await grant(uid);
  /** What could still act for each account: its sessions and active API keys. */
  const access = async (uid) => {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM oc_sessions WHERE user_id=$1) AS sessions,
        (SELECT count(*)::int FROM oc_api_keys WHERE user_id=$1 AND revoked_at IS NULL) AS keys`,
      [accounts[uid]],
    );
    return rows[0];
  };
  const audits = async () =>
    (
      await pool.query(
        "SELECT target_id,changes FROM oc_admin_audit WHERE action='directory-left' AND target_id=ANY($1::text[]) ORDER BY id",
        [Object.values(accounts)],
      )
    ).rows;
  const [ana, bob, carol, dan] = names;
  const kept = { sessions: 1, keys: 1 },
    ended = { sessions: 0, keys: 0 };

  // dan was never in the group: the first run ends his access; everyone else keeps theirs.
  let result = await checkAccounts(pool, auth.security, directory(), log);
  assert.deepEqual(result, { checked: 4, ended: 1, returned: 0 });
  assert.deepEqual(await access(dan), ended);
  for (const uid of [ana, bob, carol]) assert.deepEqual(await access(uid), kept);

  // The directory cannot be reached, or refuses the service account: nothing changes, and the
  // log says so. Bob is gone by then, but an outage is not taken for his departure.
  await directoryAdmin.del(dn(bob));
  for (const env of [
    { LDAP_URL: 'ldap://127.0.0.1:1' },
    { LDAP_BIND_PASSWORD: 'not the service password' },
  ]) {
    lines.length = 0;
    result = await checkAccounts(pool, auth.security, directory(env), log);
    assert.ok(result.outage, JSON.stringify(result));
    assert.match(lines.at(-1)[1], /^Directory check skipped: .*Nobody was signed out/);
    for (const uid of [ana, bob, carol]) assert.deepEqual(await access(uid), kept);
  }

  // Bob deleted from the directory and carol taken out of the group: both lose their sessions
  // and API keys, with an audit record each; ana, still in it, keeps hers.
  const membership = (operation, uids = [carol]) =>
    directoryAdmin.modify(group, [
      new Change({
        operation,
        modification: new Attribute({ type: 'uniqueMember', values: uids.map(dn) }),
      }),
    ]);
  await membership('delete');
  lines.length = 0;
  result = await checkAccounts(pool, auth.security, directory(), log);
  assert.deepEqual(result, { checked: 4, ended: 2, returned: 0 });
  assert.deepEqual(await access(bob), ended);
  assert.deepEqual(await access(carol), ended);
  assert.deepEqual(await access(ana), kept);
  assert.deepEqual(
    (await audits()).map((a) => a.target_id).sort(),
    [accounts[dan], accounts[bob], accounts[carol]].sort(),
  );
  assert.match(
    (await audits()).at(-1).changes.reason,
    /not found in the directory, or not in LDAP_REQUIRED_GROUP/,
  );
  assert.ok(lines.some(([, l]) => l.includes(`ended the sessions and API keys of ${bob}`)));

  // Each departure is acted on once: a later run, after bob signed in another way (a session
  // that is not the directory's to end), changes nothing and records nothing.
  await grant(bob);
  result = await checkAccounts(pool, auth.security, directory(), log);
  assert.deepEqual(result, { checked: 4, ended: 0, returned: 0 });
  assert.deepEqual(await access(bob), kept);
  assert.equal((await audits()).length, 3);

  // Carol is let back into the group: she is no longer marked as left, so leaving again ends
  // her access again.
  await membership('add');
  result = await checkAccounts(pool, auth.security, directory(), log);
  assert.deepEqual(result, { checked: 4, ended: 0, returned: 1 });
  await grant(carol);
  await membership('delete');
  result = await checkAccounts(pool, auth.security, directory(), log);
  assert.deepEqual(result, { checked: 4, ended: 1, returned: 0 });
  assert.deepEqual(await access(carol), ended);

  // A wrong group (or base DN) that would sign out most accounts at once is taken for a
  // misconfiguration: with ten accounts in the group, a group nobody is in changes nothing.
  const many = [];
  for (let i = 0; i < 10; i++) {
    const uid = `member${i}-${suffix}`;
    await directoryAdmin.add(dn(uid), {
      objectClass: ['inetOrgPerson'],
      uid,
      cn: uid,
      sn: 'Test',
    });
    const { searchEntries } = await directoryAdmin.search(dn(uid), {
      scope: 'base',
      attributes: ['entryUUID'],
    });
    subjects[uid] = 'uuid:' + String(searchEntries[0].entryUUID).toLowerCase();
    accounts[uid] = randomUUID();
    await pool.query('INSERT INTO oc_users(id,username,password_hash) VALUES($1,$2,NULL)', [
      accounts[uid],
      uid,
    ]);
    await pool.query("INSERT INTO oc_identities(provider,subject,user_id) VALUES('ldap',$1,$2)", [
      subjects[uid],
      accounts[uid],
    ]);
    await grant(uid);
    many.push(uid);
  }
  await membership('add', many);
  lines.length = 0;
  result = await checkAccounts(
    pool,
    auth.security,
    directory({ LDAP_REQUIRED_GROUP: `cn=nobody-${suffix},${baseDn}` }),
    log,
  );
  assert.match(result.outage, /^11 of 11 directory accounts would lose access at once$/);
  assert.match(lines.at(-1)[1], /misconfigured LDAP_BASE_DN or LDAP_REQUIRED_GROUP/);
  for (const uid of [ana, ...many]) assert.deepEqual(await access(uid), kept);
  // The right group finds them all still in it.
  result = await checkAccounts(pool, auth.security, directory(), log);
  assert.deepEqual(result, { checked: 14, ended: 0, returned: 0 });

  // A check runs once per interval, however many processes ask.
  await pool.query('UPDATE oc_site_settings SET directory_checked_at=NULL');
  const hour = 3600000;
  const runs = await Promise.all(
    [1, 2, 3].map(() => checkDue(pool, auth.security, directory(), hour, log)),
  );
  assert.equal(runs.filter(Boolean).length, 1);
  assert.equal(await checkDue(pool, auth.security, directory(), hour, log), null);
  await pool.query(
    "UPDATE oc_site_settings SET directory_checked_at=now()-interval '2 hours' WHERE singleton",
  );
  assert.deepEqual(await checkDue(pool, auth.security, directory(), hour, log), {
    checked: 14,
    ended: 0,
    returned: 0,
  });

  // A directory sign-in clears the mark too (ldap.mjs signIn), so a person let back in and
  // gone again before the next check is still acted on.
  await membership('add');
  await pool.query('DELETE FROM oc_auth_attempts');
  const signedIn = new Directory(
    auth,
    { identity: async () => ({ id: accounts[carol] }) },
    directoryFromEnv(settings),
  );
  auth.finishPrimary = async () => ({ ok: true });
  await signedIn.signIn(
    { clientAddress: '198.51.100.40' },
    { username: carol, password: 'directory passphrase' },
  );
  assert.equal(
    (
      await pool.query("SELECT left_at FROM oc_identities WHERE provider='ldap' AND subject=$1", [
        subjects[carol],
      ])
    ).rows[0].left_at,
    null,
  );

  await directoryAdmin.unbind();
  console.log('directory check postgres tests passed');
} finally {
  await pool.end();
  stop();
}
