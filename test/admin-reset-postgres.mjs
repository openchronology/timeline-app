// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Resetting the administrator's password from the configuration (#118), as the packages'
// openchronology-reset-admin-password runs it: a password containing # is set whole, the
// account's sessions end, and it is recorded.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { passwordHash, passwordMatches } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const run = promisify(execFile);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const dir = await mkdtemp(join(tmpdir(), 'och-reset-'));
const id = randomUUID(),
  username = 'reset_' + id.slice(0, 8);
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,is_admin,terms_version) VALUES($1,$2,now(),$3,true,oc_policy_version())',
    [id, username, await passwordHash('the-forgotten-password-123')],
  );
  for (const token of ['one', 'two'])
    await pool.query(
      "INSERT INTO oc_sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 day')",
      [token + id, id],
    );
  // The configuration as an administrator writes it: unquoted, with # and other characters.
  const password = 'Abc!def#ghi@jkl-mno#pqr';
  const config = join(dir, 'openchronology.env');
  const write = (settings) =>
    writeFile(config, `# OpenChronology\nDATABASE_URL=${process.env.DATABASE_URL}\n${settings}\n`);
  // Run without the test's environment, as the package command does: only OCH_CONFIG.
  const reset = () =>
    run(process.execPath, ['server/reset-admin-password.mjs'], {
      env: { PATH: process.env.PATH, OCH_CONFIG: config },
    }).then(
      ({ stdout }) => ({ code: 0, output: stdout }),
      (error) => ({ code: error.code, output: error.stdout + error.stderr }),
    );
  await write(`ADMIN_USERNAME=${username}\nADMIN_INITIAL_PASSWORD=${password}`);
  const done = await reset();
  assert.equal(done.code, 0, done.output);
  assert.match(
    done.output,
    new RegExp(`The password of ${username} \\(administrator\\) is now ADMIN_INITIAL_PASSWORD`),
  );
  assert.match(done.output, /\(23 characters\)/);
  assert.match(done.output, /2 sessions were signed out\. API keys are unchanged\./);
  const { password_hash } = (
    await pool.query('SELECT password_hash FROM oc_users WHERE id=$1', [id])
  ).rows[0];
  assert(await passwordMatches(password, password_hash), 'the whole password, # and after');
  assert(!(await passwordMatches('Abc!def', password_hash)));
  assert.equal(
    (await pool.query('SELECT count(*) FROM oc_sessions WHERE user_id=$1', [id])).rows[0].count,
    '0',
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM oc_admin_audit WHERE target_id=$1 AND action='password-reset'",
        [id],
      )
    ).rows[0].count,
    '1',
  );
  // Refused: an unknown account, or a password too short to be one.
  await write(`ADMIN_USERNAME=nobody_${id.slice(0, 8)}\nADMIN_INITIAL_PASSWORD=${password}`);
  const unknown = await reset();
  assert.equal(unknown.code, 1);
  assert.match(unknown.output, /There is no account named nobody_/);
  await write(`ADMIN_USERNAME=${username}\nADMIN_INITIAL_PASSWORD=short#one`);
  const short = await reset();
  assert.equal(short.code, 1);
  assert.match(short.output, /at least 15 characters/);
  console.log(
    'PASS administrator password reset: the configuration read whole (# included), sessions signed out, recorded; unknown accounts and short passwords refused.',
  );
} finally {
  await pool.query('DELETE FROM oc_admin_audit WHERE target_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
  await rm(dir, { recursive: true, force: true });
}
