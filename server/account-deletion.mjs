// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Deleting one's own account (#166): the right to erasure (GDPR Art. 17), the UK Children's
 * Code, and California's "eraser" law for minors expect people to be able to remove their
 * account and what they posted without asking anyone.
 *
 * Deleted with it: the timelines it owns (with their saved history, pull requests and comments,
 * as deleting a timeline always does; others' forks of them survive, as they do then), the
 * pull requests and comments it wrote on others' timelines, its library plugins and suites,
 * stars, memberships, API keys, sign-in methods and sessions. Kept: what it already merged
 * into others' timelines, which is theirs now (their history names an account that no longer
 * exists), and moderation records, which no longer name it.
 */
import { HttpError } from './store.mjs';

/**
 * Deletes the signed-in account (`session`; not an API key) and what it owns, in one
 * transaction. `value` must hold `confirm` (the username, typed) and pass the check every
 * security change makes (`password`, and `code` with two-factor authentication on; see
 * AccountSecurity.fresh). The last active administrator cannot delete themselves, so a site
 * always keeps one. Result: `{ ok, timelines }`, the number of timelines deleted. Throws 400,
 * 401, 403 or 409.
 */
export async function deleteAccount({ store, auth, session, value }) {
  if (!session || session.kind === 'api')
    throw new HttpError(401, 'Sign in to delete your account.');
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).some((key) => !['confirm', 'password', 'code', 'passkey'].includes(key))
  )
    throw new HttpError(400, 'Invalid account deletion.');
  return store.transaction(async (c) => {
    // The transaction-scoped advisory lock every administration change and moderation decision
    // takes (administration.mjs, moderation.mjs). Holding it until commit serializes the
    // last-administrator count below with them, so an administrator deleting their account and
    // another being demoted, suspended or deleted at the same time cannot leave none.
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('oc-admin-policy',0))");
    const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
      .rows[0];
    if (!user) throw new HttpError(401, 'Sign in to delete your account.');
    if (value.confirm !== user.username) throw new HttpError(400, 'Type your username to confirm.');
    // As for any sensitive change: the password (or a recent sign-in without one), and a code if two-factor
    // authentication is on (account-security.mjs).
    await auth.security.fresh(c, user, session, value);
    if (
      user.is_admin &&
      !user.is_disabled &&
      Number(
        (await c.query('SELECT count(*) FROM oc_users WHERE is_admin AND NOT is_disabled')).rows[0]
          .count,
      ) <= 1
    )
      throw new HttpError(409, 'The last active administrator cannot delete their account.');
    // Its timelines, locked against concurrent changes. Each row is deleted (memberships, pull
    // requests and their comments go with it by ON DELETE CASCADE), then removeHistory removes
    // the saved history nothing else still needs (others' forks keep what they refer to).
    // oc_timelines.owner_id has no ON DELETE action, so these must go before the account.
    const owned = (
      await c.query('SELECT id FROM oc_timelines WHERE owner_id=$1 FOR UPDATE', [user.id])
    ).rows.map((row) => row.id);
    for (const id of owned) {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    }
    // What it wrote on others' timelines (its pull requests take their comments with them).
    await c.query('DELETE FROM oc_proposal_comments WHERE author_id=$1', [user.id]);
    await c.query('DELETE FROM oc_proposals WHERE author_id=$1', [user.id]);
    // Like the author columns above, these references have no ON DELETE action and would block
    // deleting the account: it is unnamed as the resolver of others' pull requests and as the
    // installation's bootstrap administrator.
    await c.query('UPDATE oc_proposals SET resolved_by=NULL WHERE resolved_by=$1', [user.id]);
    await c.query(
      'UPDATE oc_site_settings SET bootstrap_admin_id=NULL WHERE bootstrap_admin_id=$1',
      [user.id],
    );
    // The rest goes with the account (ON DELETE CASCADE / SET NULL).
    await c.query('DELETE FROM oc_users WHERE id=$1', [user.id]);
    return { ok: true, timelines: owned.length };
  });
}
