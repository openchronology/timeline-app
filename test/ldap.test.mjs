// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Directory sign-in (server/ldap.mjs, #286): filter escaping, settings that fail closed, the
// stable subject of an entry, usernames for new accounts, and the checks around the bind.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTER,
  Directory,
  directoryFromEnv,
  disabled,
  escapeFilter,
  preferredUsername,
  subjectFilter,
  subjectOf,
  userFilter,
} from '../server/ldap.mjs';

const rejects = (status) => (error) => error.status === status;
const base = {
  LDAP_URL: 'ldaps://dc.school.example',
  LDAP_BASE_DN: 'DC=school,DC=example',
};

test('filter values are escaped as RFC 4515 requires', () => {
  assert.equal(escapeFilter('jo*hn'), 'jo\\2ahn');
  assert.equal(escapeFilter('a)(uid=*'), 'a\\29\\28uid=\\2a');
  assert.equal(escapeFilter('back\\slash'), 'back\\5cslash');
  assert.equal(escapeFilter('nul\0'), 'nul\\00');
  assert.equal(escapeFilter('Zoë O’Brien'), 'Zoë O’Brien');
  const config = directoryFromEnv(base);
  assert.equal(
    userFilter(config, '*)(objectClass=*'),
    '(&(objectClass=user)(sAMAccountName=\\2a\\29\\28objectClass=\\2a))',
  );
  assert.equal(
    userFilter(
      directoryFromEnv({ ...base, LDAP_REQUIRED_GROUP: 'CN=Staff (all),DC=school,DC=example' }),
      'ana',
    ),
    '(&(&(objectClass=user)(sAMAccountName=ana))(memberOf=CN=Staff \\28all\\29,DC=school,DC=example))',
  );
  assert.equal(
    userFilter(
      directoryFromEnv({
        ...base,
        LDAP_REQUIRED_GROUP: 'CN=Staff,DC=school,DC=example',
        LDAP_NESTED_GROUPS: '1',
        LDAP_USER_FILTER: '(uid={username})',
      }),
      'ana',
    ),
    '(&(uid=ana)(memberOf:1.2.840.113556.1.4.1941:=CN=Staff,DC=school,DC=example))',
  );
});

test('directory settings are off without LDAP_URL and refuse what would fail or leak', () => {
  assert.equal(directoryFromEnv({}), null);
  const config = directoryFromEnv(base);
  assert.equal(config.url, 'ldaps://dc.school.example');
  assert.equal(config.filter, DEFAULT_FILTER);
  assert.equal(config.label, 'Directory account');
  assert.equal(config.tls.minVersion, 'TLSv1.2');
  assert.equal(directoryFromEnv({ ...base, LDAP_LABEL: 'School account' }).label, 'School account');
  assert.equal(
    directoryFromEnv({ ...base, LDAP_URL: 'ldap://dc:389', LDAP_STARTTLS: '1' }).startTls,
    true,
  );
  for (const [env, message] of [
    [{ ...base, LDAP_URL: 'https://dc' }, /ldap:\/\/ or ldaps:\/\//],
    [{ ...base, LDAP_URL: 'ldaps://dc/ou=people' }, /without a path/],
    [{ ...base, LDAP_URL: 'ldap://dc' }, /STARTTLS/],
    [{ ...base, LDAP_STARTTLS: '1' }, /already encrypted/],
    [{ LDAP_URL: base.LDAP_URL }, /LDAP_BASE_DN/],
    [{ ...base, LDAP_BIND_DN: 'CN=svc' }, /both LDAP_BIND_DN/],
    [{ ...base, LDAP_USER_FILTER: '(uid=x)' }, /\{username\}/],
    [{ ...base, LDAP_USER_FILTER: 'uid={username}' }, /parentheses/],
    [{ ...base, LDAP_TLS_CA: '/nonexistent/ca.pem' }, /cannot read/],
  ])
    assert.throws(() => directoryFromEnv(env), message);
  // Plain LDAP only when the operator says the network is trusted.
  assert.equal(
    directoryFromEnv({ ...base, LDAP_URL: 'ldap://dc', LDAP_ALLOW_INSECURE: '1' }).startTls,
    false,
  );
});

test('an entry is known by objectGUID, then entryUUID, then its DN', () => {
  // AD writes the first three GUID fields little-endian.
  const guid = Buffer.from('78563412bc9af0de0123456789abcdef', 'hex');
  assert.equal(
    subjectOf({ dn: 'CN=Ana', objectGUID: guid }),
    'guid:12345678-9abc-def0-0123-456789abcdef',
  );
  assert.equal(
    subjectOf({ dn: 'uid=ana', entryUUID: '6F1C2A8E-0000-4000-8000-000000000001' }),
    'uuid:6f1c2a8e-0000-4000-8000-000000000001',
  );
  assert.equal(subjectOf({ dn: 'uid=Ana,ou=People' }), 'dn:uid=ana,ou=people');
});

test('a new account takes the directory name when it is a valid, available username', () => {
  assert.equal(preferredUsername('Ana.Lopez'), 'ana-lopez');
  assert.equal(preferredUsername('jsmith@school.example'), 'jsmith');
  assert.equal(preferredUsername('ab'), null);
  assert.equal(preferredUsername('admin'), null);
  assert.equal(preferredUsername('Zoë'), null);
  assert.equal(preferredUsername(undefined), null);
});

/**
 * A stand-in for ldapts' Client: `entries` answers the search, `passwords` maps a DN to the
 * password its bind accepts. Records what was bound and searched.
 */
function fakeDirectory({ entries = [], passwords = {}, down = false, searchError = null } = {}) {
  const calls = [];
  const connect = (options) => {
    calls.push(['connect', options.url]);
    return {
      async startTLS() {
        calls.push(['startTLS']);
      },
      async bind(dn, password) {
        calls.push(['bind', dn]);
        if (down) throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'Error' });
        if (passwords[dn] !== password)
          throw Object.assign(new Error('Invalid credentials'), {
            name: 'InvalidCredentialsError',
          });
      },
      async search(baseDn, options) {
        calls.push(['search', baseDn, options.filter]);
        if (searchError) throw searchError;
        return { searchEntries: entries, searchReferences: [] };
      },
      async unbind() {
        calls.push(['unbind']);
      },
    };
  };
  return { connect, calls };
}

test('authentication searches as the service account, then binds as the person', async () => {
  const config = directoryFromEnv({
    ...base,
    LDAP_BIND_DN: 'CN=svc,DC=school,DC=example',
    LDAP_BIND_PASSWORD: 'service secret',
  });
  const entry = {
    dn: 'CN=Ana Lopez,OU=Staff,DC=school,DC=example',
    entryUUID: '6f1c2a8e-0000-4000-8000-000000000001',
    sAMAccountName: 'ana.lopez',
  };
  const fake = fakeDirectory({
    entries: [entry],
    passwords: { 'CN=svc,DC=school,DC=example': 'service secret', [entry.dn]: 'right' },
  });
  const directory = new Directory(null, null, config, fake.connect);
  assert.deepEqual(await directory.authenticate('ana.lopez', 'right'), {
    subject: 'uuid:6f1c2a8e-0000-4000-8000-000000000001',
    username: 'ana.lopez',
  });
  assert.deepEqual(
    fake.calls.filter(([c]) => c === 'bind'),
    [
      ['bind', 'CN=svc,DC=school,DC=example'],
      ['bind', entry.dn],
    ],
  );
  assert.equal(fake.calls.filter(([c]) => c === 'unbind').length, 2);
  // A wrong password, an empty one (never sent: it would be an anonymous bind), no match and
  // several matches all get the same 401.
  await assert.rejects(directory.authenticate('ana.lopez', 'wrong'), rejects(401));
  const before = fake.calls.length;
  await assert.rejects(directory.authenticate('ana.lopez', ''), rejects(401));
  assert.equal(fake.calls.length, before);
  const service = { 'CN=svc,DC=school,DC=example': 'service secret' };
  const answering = (options) =>
    new Directory(null, null, config, fakeDirectory({ passwords: service, ...options }).connect);
  await assert.rejects(answering({}).authenticate('nobody', 'x'), rejects(401));
  await assert.rejects(
    answering({ entries: [entry, { ...entry, dn: 'CN=Other' }] }).authenticate('ana', 'x'),
    rejects(401),
  );
  await assert.rejects(
    answering({
      searchError: Object.assign(new Error('limit'), { name: 'SizeLimitExceededError' }),
    }).authenticate('ana', 'x'),
    rejects(401),
  );
  // A service account the directory refuses is the server's misconfiguration: 502.
  await assert.rejects(
    new Directory(null, null, config, fakeDirectory({ entries: [entry] }).connect).authenticate(
      'ana',
      'x',
    ),
    rejects(502),
  );
  // A directory that cannot be reached is a 502, not a wrong password.
  await assert.rejects(
    new Directory(null, null, config, fakeDirectory({ down: true }).connect).authenticate(
      'ana',
      'x',
    ),
    rejects(502),
  );
});

test('the periodic check finds entries by subject and tells an outage from people leaving', async () => {
  // An objectGUID filter has the bytes subjectOf read, in the order the directory keeps them.
  const guid = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const subject = subjectOf({ objectGUID: guid });
  assert.equal(
    subjectFilter(subject),
    '(objectGUID=' + guid.toString('hex').replace(/../g, '\\$&') + ')',
  );
  assert.equal(
    subjectFilter('uuid:6f1c2a8e-0000-4000-8000-000000000001'),
    '(entryUUID=6f1c2a8e-0000-4000-8000-000000000001)',
  );
  assert.equal(subjectFilter('dn:uid=ana,ou=people'), null);
  assert.equal(disabled({ userAccountControl: '514' }), true);
  assert.equal(disabled({ userAccountControl: ['512'] }), false);
  assert.equal(disabled({}), false);
  const config = directoryFromEnv({
    ...base,
    LDAP_REQUIRED_GROUP: 'CN=Staff,DC=school,DC=example',
    LDAP_BIND_DN: 'CN=svc',
    LDAP_BIND_PASSWORD: 'service secret',
  });
  assert.equal(config.checkEvery, 3600000);
  assert.equal(directoryFromEnv({ ...base, LDAP_CHECK_MINUTES: '0' }).checkEvery, 0);
  assert.throws(
    () => directoryFromEnv({ ...base, LDAP_CHECK_MINUTES: '-5' }),
    /LDAP_CHECK_MINUTES/,
  );
  assert.throws(
    () => directoryFromEnv({ ...base, LDAP_CHECK_MINUTES: 'hourly' }),
    /LDAP_CHECK_MINUTES/,
  );
  const entry = { dn: 'CN=Ana', entryUUID: '6f1c2a8e-0000-4000-8000-000000000001' };
  const fake = fakeDirectory({ entries: [entry], passwords: { 'CN=svc': 'service secret' } });
  const found = await new Directory(null, null, config, fake.connect).present([
    'uuid:6f1c2a8e-0000-4000-8000-000000000001',
    'uuid:6f1c2a8e-0000-4000-8000-000000000002',
  ]);
  assert.deepEqual([...found], [['uuid:6f1c2a8e-0000-4000-8000-000000000001', false]]);
  // One search for both, within the required group.
  assert.deepEqual(
    fake.calls.filter(([c]) => c === 'search'),
    [
      [
        'search',
        base.LDAP_BASE_DN,
        '(&(|(entryUUID=6f1c2a8e-0000-4000-8000-000000000001)(entryUUID=6f1c2a8e-0000-4000-8000-000000000002))(memberOf=CN=Staff,DC=school,DC=example))',
      ],
    ],
  );
  // A directory that cannot be reached, or refuses the service account, throws rather than
  // finding nobody.
  for (const options of [{ down: true }, {}])
    await assert.rejects(
      new Directory(null, null, config, fakeDirectory(options).connect).present(['uuid:x']),
    );
});

test('directory usernames are bounded and may not hold control characters', () => {
  assert.equal(Directory.username({ username: ' Ana.Lopez ', password: 'x' }), 'Ana.Lopez');
  for (const input of [
    { username: '', password: 'x' },
    { username: 'a\nb', password: 'x' },
    { username: 'a'.repeat(257), password: 'x' },
    { username: 'ana', password: 'x'.repeat(1025) },
    { username: 'ana' },
  ])
    assert.throws(() => Directory.username(input), rejects(400));
});
