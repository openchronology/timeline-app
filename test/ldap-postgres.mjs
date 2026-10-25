// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Directory sign-in (server/ldap.mjs, #286) against a real OpenLDAP server and PostgreSQL: a
// first sign-in makes an account named after the directory account, which confirms an email
// before it has a session; later sign-ins find it by its entryUUID; wrong passwords, filter
// injection and people outside the required group are refused alike; a directory account links
// to an existing account and unlinks again.
//
// The directory is LDAP_TEST_URL (with LDAP_TEST_ADMIN_DN and LDAP_TEST_ADMIN_PASSWORD for an
// account that may add entries under LDAP_TEST_BASE_DN), or else an osixia/openldap container
// this test starts with Docker and removes. Without either, it says so and skips (or fails,
// with LDAP_TEST_REQUIRED=1).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Client } from 'ldapts';
import { createApplication } from '../server/http.mjs';
import { flushMail } from '../server/mail.mjs';
import { passwordHash } from '../server/auth.mjs';
import { directoryFromEnv } from '../server/ldap.mjs';
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
    // CI sets LDAP_TEST_REQUIRED=1, so a runner without Docker fails rather than skipping.
    if (process.env.LDAP_TEST_REQUIRED === '1') throw error;
    console.log('SKIP directory sign-in: set LDAP_TEST_URL or make Docker available.');
    process.exit(0);
  }
}
const stop = () => {
  if (container) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
};

const suffix = Date.now().toString(36),
  people = `ou=people-${suffix},${baseDn}`,
  group = `cn=staff-${suffix},${baseDn}`,
  ana = { uid: 'ana.lopez-' + suffix, password: 'directory passphrase for ana' },
  bob = { uid: 'bob-' + suffix, password: 'directory passphrase for bob' },
  carol = { uid: 'carol-' + suffix, password: 'directory passphrase for carol' };
const dn = (person) => `uid=${person.uid},${people}`;

/**
 * Binds as the directory's administrator, waiting up to a minute for it to start. A container
 * this test started answers binds during its first-start setup, before its memberof overlay
 * is configured, so its log must first show the setup finished and slapd started again.
 */
async function admin() {
  for (let i = 0; container; i++) {
    // The container logs to both streams.
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let app;
try {
  // The people, and a staff group (memberOf, from OpenLDAP's memberof overlay) that ana and
  // carol are in and bob is not.
  const directoryAdmin = await admin();
  await directoryAdmin.add(people, { objectClass: ['organizationalUnit'], ou: 'people-' + suffix });
  for (const person of [ana, bob, carol])
    await directoryAdmin.add(dn(person), {
      objectClass: ['inetOrgPerson'],
      uid: person.uid,
      cn: person.uid,
      sn: 'Test',
      userPassword: person.password,
    });
  await directoryAdmin.add(group, {
    objectClass: ['groupOfUniqueNames'],
    cn: 'staff-' + suffix,
    uniqueMember: [dn(ana), dn(carol)],
  });
  const { searchEntries } = await directoryAdmin.search(dn(ana), {
    scope: 'base',
    attributes: ['entryUUID', 'memberOf'],
  });
  const anaUuid = String(searchEntries[0].entryUUID).toLowerCase();
  assert.match(anaUuid, /^[0-9a-f-]{36}$/);
  assert.equal(String(searchEntries[0].memberOf).toLowerCase(), group.toLowerCase());
  await directoryAdmin.unbind();

  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  // Earlier suites in the same database sign in from this address too: start with its
  // sign-in throttle clear, so the refusals below meet 401s rather than the rate limit.
  await pool.query('DELETE FROM oc_auth_attempts');
  const key = Buffer.alloc(32, 41),
    messages = [],
    mailer = {
      async send(message) {
        messages.push(message);
      },
    };
  app = createApplication({
    pool,
    mailer,
    securityKey: key,
    passwordCheck: async () => {},
    trustProxy: true,
    directory: directoryFromEnv({
      LDAP_URL: url,
      LDAP_ALLOW_INSECURE: '1',
      LDAP_BIND_DN: adminDn,
      LDAP_BIND_PASSWORD: adminPassword,
      LDAP_BASE_DN: baseDn,
      LDAP_USER_FILTER: '(&(objectClass=inetOrgPerson)(uid={username}))',
      LDAP_USERNAME_ATTRIBUTE: 'uid',
      LDAP_REQUIRED_GROUP: group,
      LDAP_LABEL: 'School account',
    }),
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  let n = 0;
  const client = () => {
    const cookies = new Map(),
      ip = '198.51.100.' + ++n;
    let csrf;
    return {
      async request(path, data, status = 200) {
        const response = await fetch(origin + '/api/' + path, {
          method: data === undefined ? 'GET' : 'POST',
          headers: {
            'X-Forwarded-For': ip,
            Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            ...(data ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        for (const h of response.headers.getSetCookie()) {
          const [pair] = h.split(';'),
            [k, v] = pair.split('=');
          if (v) cookies.set(k, v);
          else cookies.delete(k);
        }
        const value = await response.json();
        assert.equal(response.status, status, path + ' ' + JSON.stringify(value));
        if (value.csrf) csrf = value.csrf;
        return value;
      },
    };
  };
  const confirm = async (browser, email) => {
    await flushMail(pool, mailer, key);
    const token = messages
      .findLast((m) => m.to === email && m.text.includes('#verify='))
      .text.match(/#verify=([a-f0-9]{64})/)[1];
    await browser.request('auth/email/verify', { token });
  };

  // The sign-in page learns what to call it.
  const browser = client();
  const session = await browser.request('session');
  assert.deepEqual(session.directory, { label: 'School account' });
  // Wrong password, an empty one, an unknown name and an injected filter: the same 401.
  const refused = 'Username or password is incorrect.';
  for (const input of [
    { username: ana.uid, password: 'wrong' },
    { username: ana.uid, password: '' },
    { username: 'nobody-' + suffix, password: ana.password },
    { username: '*', password: ana.password },
    { username: `${ana.uid})(uid=*`, password: ana.password },
  ])
    assert.equal((await browser.request('auth/ldap', input, 401)).error, refused);
  // Outside the required group: refused, though the password is right.
  assert.equal(
    (await browser.request('auth/ldap', { username: bob.uid, password: bob.password }, 401)).error,
    refused,
  );
  // The first sign-in makes an account named after the directory account, which must confirm
  // an email (and give a year of birth) before it has a session.
  const first = await browser.request('auth/ldap', { username: ana.uid, password: ana.password });
  assert.equal(first.challenge, 'email');
  assert.equal(first.user, undefined);
  const account = (
    await pool.query(
      "SELECT u.id,u.username,u.password_hash FROM oc_identities i JOIN oc_users u ON u.id=i.user_id WHERE i.provider='ldap' AND i.subject=$1",
      ['uuid:' + anaUuid],
    )
  ).rows[0];
  assert.equal(account.username, ana.uid.replace('.', '-'));
  assert.equal(account.password_hash, null);
  const anaEmail = `ana-${suffix}@school.example`;
  await browser.request('auth/email/enroll', { email: anaEmail, birthYear: 1985 });
  await confirm(browser, anaEmail);
  const signedIn = await browser.request('auth/ldap', {
    username: ana.uid.toUpperCase(),
    password: ana.password,
  });
  assert.equal(signedIn.user.id, account.id);
  assert.equal((await browser.request('session')).user.username, account.username);
  assert.deepEqual((await browser.request('auth/account')).identities, ['ldap']);
  // The directory password is never kept.
  const stored = JSON.stringify(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [account.id])).rows,
  );
  assert(!stored.includes(ana.password));

  // An existing password account links carol's directory account, within five minutes of
  // signing in; ana's, which belongs to another account, is refused.
  const ownerName = 'owner_' + suffix,
    ownerPassword = 'an ordinary account passphrase';
  await pool.query(
    'INSERT INTO oc_users(id,username,password_hash,email,email_verified_at,birth_year) VALUES(gen_random_uuid(),$1,$2,$3,now(),1980)',
    [ownerName, await passwordHash(ownerPassword), ownerName + '@example.test'],
  );
  const owner = client();
  await owner.request('session');
  await owner.request('auth/login', { username: ownerName, password: ownerPassword });
  await owner.request('auth/ldap/link', { username: carol.uid, password: 'wrong' }, 401);
  await owner.request('auth/ldap/link', { username: carol.uid, password: carol.password });
  assert.deepEqual((await owner.request('auth/account')).identities, ['ldap']);
  await owner.request('auth/ldap/link', { username: ana.uid, password: ana.password }, 409);
  // Carol's directory sign-in now opens the owner's account, with no email step.
  const carolBrowser = client();
  await carolBrowser.request('session');
  assert.equal(
    (await carolBrowser.request('auth/ldap', { username: carol.uid, password: carol.password }))
      .user.username,
    ownerName,
  );
  // A sign-in older than five minutes may not link.
  await pool.query(
    "UPDATE oc_sessions s SET created_at=now()-interval '6 minutes' FROM oc_users u WHERE u.id=s.user_id AND u.username=$1",
    [account.username],
  );
  await browser.request('auth/ldap/link', { username: carol.uid, password: carol.password }, 403);
  // Unlinking needs the current password, as for a social provider.
  await owner.request('auth/identities/unlink', { provider: 'ldap', password: ownerPassword });
  assert.deepEqual((await owner.request('auth/account')).identities, []);
  console.log(
    'PASS directory sign-in: search and bind, group, escaping, accounts, linking and unlinking.',
  );
} finally {
  await new Promise((resolve) => (app ? app.close(resolve) : resolve()));
  await pool.end();
  stop();
}
