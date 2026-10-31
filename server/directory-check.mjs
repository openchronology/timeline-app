// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Ending access when someone leaves the directory (#408). A directory sign-in (ldap.mjs) checks
 * the person against the directory only when they sign in; their sessions and API keys outlast
 * that. So every LDAP_CHECK_MINUTES (an hour by default; 0 turns it off) the server looks up
 * each account with an `ldap` identity with its service account. One whose entry is gone,
 * disabled (Active Directory) or out of LDAP_REQUIRED_GROUP has its sessions ended and its API
 * keys revoked (AccountSecurity.endAccess), once: the identity is marked as left (left_at),
 * which a check that finds the person again, or their next directory sign-in, clears. Each ending is logged and recorded in
 * oc_admin_audit ('directory-left'). The account is not suspended: it can no longer sign in
 * through the directory, and comes back by itself if the person is let in again.
 *
 * A directory that cannot be reached, a bind or search that fails, or a run that would end
 * access for an implausibly large share of accounts at once (a wrong LDAP_BASE_DN or group, say)
 * changes nothing: it is logged, and the next run tries again. An outage never signs anyone out.
 */

/**
 * A run that would end access for more than this share of the accounts not already marked as
 * left, and for more than MASS_FLOOR of them, is taken for a misconfiguration and changes
 * nothing.
 */
export const MASS_SHARE = 0.5;
/** Below this many accounts at once, a run is never taken for a misconfiguration. */
export const MASS_FLOOR = 5;
/** How often each server process looks whether a check is due, at most. */
const TICK = 5 * 60 * 1000;

/**
 * Checks every account with an `ldap` identity against `directory` (a Directory, ldap.mjs) and
 * ends access, through `security` (AccountSecurity), for those the directory no longer lets in.
 * Result: `{checked, ended, returned}` (how many identities were looked up, how many accounts
 * lost access in this run, how many came back), or `{outage}` with the reason when nothing was
 * changed.
 */
export async function checkAccounts(pool, security, directory, log = console) {
  // Each directory identity, and whether it was already found to have left.
  const { rows } = await pool.query(
    `SELECT i.user_id, i.subject, i.left_at IS NOT NULL AS left, u.username
    FROM oc_identities i JOIN oc_users u ON u.id=i.user_id WHERE i.provider='ldap'`,
  );
  if (!rows.length) return { checked: 0, ended: 0, returned: 0 };
  let found;
  try {
    found = await directory.present(rows.map((r) => r.subject));
  } catch (error) {
    const reason = error?.message || error?.name || String(error);
    log.error(
      `Directory check skipped: the directory could not be searched (${reason}). Nobody was signed out; the next run tries again.`,
    );
    return { outage: reason };
  }
  const gone = rows.filter((r) => !found.has(r.subject) || found.get(r.subject));
  const returned = rows.filter((r) => r.left && found.get(r.subject) === false);
  // Newly gone, against those not already marked as left.
  const current = rows.filter((r) => !r.left).length,
    leaving = gone.filter((r) => !r.left).length;
  if (leaving > MASS_FLOOR && leaving > current * MASS_SHARE) {
    const reason = `${leaving} of ${current} directory accounts would lose access at once`;
    log.error(
      `Directory check skipped: ${reason}, which looks like a misconfigured LDAP_BASE_DN or LDAP_REQUIRED_GROUP rather than people leaving. Nobody was signed out; the next run tries again.`,
    );
    return { outage: reason };
  }
  if (returned.length)
    await pool.query(
      "UPDATE oc_identities SET left_at=NULL WHERE provider='ldap' AND subject=ANY($1::text[])",
      [returned.map((r) => r.subject)],
    );
  let ended = 0;
  const missing = directory.config.group
    ? 'not found in the directory, or not in LDAP_REQUIRED_GROUP'
    : 'not found in the directory';
  // Those already marked as left were dealt with by an earlier run. An account that also has
  // a password or another provider may have signed in again since; that is not undone hourly.
  for (const r of gone.filter((r) => !r.left)) {
    const why = found.has(r.subject) ? 'disabled in the directory' : missing;
    const done = await security.transaction(async (c) => {
      // The account lock every security change takes first (account-security.mjs), then the
      // mark: nothing when the identity was meanwhile unlinked, released or marked already.
      await c.query('SELECT 1 FROM oc_users WHERE id=$1 FOR UPDATE', [r.user_id]);
      const marked = await c.query(
        `UPDATE oc_identities SET left_at=now()
        WHERE provider='ldap' AND subject=$1 AND user_id=$2 AND left_at IS NULL`,
        [r.subject, r.user_id],
      );
      if (!marked.rowCount) return false;
      await security.endAccess(c, r.user_id);
      // No administrator acts here: the account itself is the actor, as in
      // reset-admin-password.mjs.
      await c.query(
        "INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1::uuid,'directory-left',$1::uuid::text,$2)",
        [r.user_id, { reason: why, subject: r.subject }],
      );
      return true;
    });
    if (!done) continue;
    log.info(`Directory check: ended the sessions and API keys of ${r.username} (${why}).`);
    ended++;
  }
  return { checked: rows.length, ended, returned: returned.length };
}

/**
 * Runs checkAccounts when one is due (none yet, or the last over `every` ms ago, kept in
 * oc_site_settings.directory_checked_at); one server process at a time, under an advisory lock
 * as retention.mjs takes. Result: what checkAccounts returned, or null when not due or another
 * process is checking.
 */
export async function checkDue(pool, security, directory, every, log = console) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended('oc-directory-check',0)) AS locked",
    );
    if (!rows[0].locked) return null;
    try {
      const due = await client.query(
        `SELECT directory_checked_at IS NULL OR directory_checked_at<now()-$1::interval AS due
        FROM oc_site_settings WHERE singleton`,
        [`${every / 1000} seconds`],
      );
      if (!due.rows[0]?.due) return null;
      // Stamped first, outage or not: the next try is a whole interval later.
      await client.query('UPDATE oc_site_settings SET directory_checked_at=now() WHERE singleton');
      return await checkAccounts(pool, security, directory, log);
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended('oc-directory-check',0))");
    }
  } finally {
    client.release();
  }
}

/**
 * Checks directory accounts every `every` ms (LDAP_CHECK_MINUTES; nothing when 0), from a
 * minute after startup (platform.mjs). Each process looks every five minutes, or every `every`
 * when that is shorter, whether a check is due, so several processes share one schedule. The
 * timers are unref'd so they never keep the process alive.
 * @returns {() => void} stops the checks
 */
export function startDirectoryCheck(pool, security, directory, every, log = console) {
  if (!every) return () => {};
  const run = () =>
    checkDue(pool, security, directory, every, log).catch((error) =>
      log.error('Directory check failed:', error),
    );
  const first = setTimeout(run, 60000),
    timer = setInterval(run, Math.min(every, TICK));
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
