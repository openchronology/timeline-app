// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Sets the administrator's password back to ADMIN_INITIAL_PASSWORD from the configuration
 * (#118): for an administrator who cannot sign in. The administrator is the ADMIN_USERNAME
 * account (or the one the installation created first, when ADMIN_USERNAME names none). Its
 * sessions, pending desktop sign-ins and password-reset links end; its API keys and
 * authenticator stay.
 *
 * The packages run it as openchronology-reset-admin-password, which passes the configuration
 * as OCH_CONFIG; with Docker Compose: docker compose run --rm migrate node
 * server/reset-admin-password.mjs; from the source: npm run reset-admin-password.
 */
import pg from 'pg';
import { loadConfiguration, loadEnvFile } from './env-file.mjs';
import { passwordHash } from './auth.mjs';

// The packages pass their configuration as OCH_CONFIG; from the source, .env is read.
loadConfiguration();
if (!process.env.OCH_CONFIG) loadEnvFile('.env');
const env = process.env;
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (!env.DATABASE_URL && !env.PGDATABASE)
  fail('Set DATABASE_URL (or PostgreSQL PG* variables): the configuration has no database.');
const password = env.ADMIN_INITIAL_PASSWORD ?? '';
if (password.length < 15 || password.length > 1024 || /replace-this|changeme/i.test(password))
  fail(
    'ADMIN_INITIAL_PASSWORD must be set to a password of at least 15 characters (not a placeholder) in the configuration.',
  );
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const wanted = (env.ADMIN_USERNAME ?? '').toLowerCase();
  const user = (
    await client.query(
      `SELECT u.* FROM oc_users u LEFT JOIN oc_site_settings s ON s.singleton
      WHERE u.username=$1 OR ($1='' AND u.id=s.bootstrap_admin_id)
      ORDER BY u.username=$1 DESC LIMIT 1 FOR UPDATE OF u`,
      [wanted],
    )
  ).rows[0];
  if (!user)
    fail(
      wanted
        ? `There is no account named ${wanted} (ADMIN_USERNAME). Check the configuration, or run openchronology-migrate to create the administrator.`
        : 'Set ADMIN_USERNAME in the configuration to the administrator to reset.',
    );
  await client.query('UPDATE oc_users SET password_hash=$2 WHERE id=$1', [
    user.id,
    await passwordHash(password),
  ]);
  const sessions = await client.query('DELETE FROM oc_sessions WHERE user_id=$1', [user.id]);
  await client.query('DELETE FROM oc_device_logins WHERE user_id=$1', [user.id]);
  await client.query('DELETE FROM oc_auth_challenges WHERE user_id=$1', [user.id]);
  await client.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='reset'", [user.id]);
  await client.query(
    "INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1::uuid,'password-reset',$1::uuid::text,$2)",
    [user.id, JSON.stringify({ via: 'reset-admin-password' })],
  );
  await client.query('COMMIT');
  const notes = [
    `The password of ${user.username}${user.is_admin ? ' (administrator)' : ''} is now ADMIN_INITIAL_PASSWORD from the configuration (${password.length} characters).`,
    `${sessions.rowCount} session${sessions.rowCount === 1 ? ' was' : 's were'} signed out. API keys are unchanged.`,
  ];
  if (!user.is_admin)
    notes.push('This account is not an administrator; an administrator can make it one in /admin.');
  if (user.is_disabled) notes.push('This account is disabled; it cannot sign in until enabled.');
  if (user.mfa_enabled)
    notes.push('Two-factor authentication stays on: signing in also asks for its code.');
  console.log(notes.join('\n'));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
