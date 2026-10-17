// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The visitor's session on a server-rendered page, and how many timelines they may compare.
import 'server-only';
import { headers } from 'next/headers';
import { platformServices } from '../../server/platform.mjs';
import { compareLimit, compareLimits } from '../../server/limits.mjs';
/**
 * Who is reading the page being rendered, from the request's cookie (or desktop bearer token).
 *
 * Reads the request headers (so the page renders per request) and asks the platform's auth
 * service for the session they carry; the session is null for a guest, and always null when
 * the platform runs without accounts (no `services.auth`).
 *
 * @returns {Promise<{services: object, session: object|null, user: {id: string,
 *   username: string, isAdmin: boolean, avatarUrl: string}|null}>} the platform's services,
 *   the raw session row (with its CSRF token, MFA state and so on) and the few fields of the
 *   user that pages and client components need.
 */
export async function currentSession() {
  const services = await platformServices();
  const values = Object.fromEntries(await headers());
  // Automation credentials authenticate only through the scoped timeline API. `auth.session`
  // would accept an API key (`Bearer och_key_…`) too, so it is refused here: a key must not
  // open the site's pages, its account settings or its administration as its owner would.
  const session =
    services.auth && !(values.authorization ?? '').startsWith('Bearer och_key_')
      ? await services.auth.session({ headers: values })
      : null;
  return {
    services,
    session,
    user: session
      ? {
          id: session.id,
          username: session.username,
          isAdmin: !!session.is_admin,
          avatarUrl: session.avatar_url ?? '',
        }
      : null,
  };
}
/**
 * How many timelines the visitor may compare at once (COMPARE_TIMELINES_* settings): the
 * guest, user or admin limit, by who `current` (a `currentSession()` result) is. Falls back to
 * reading the settings from the environment when the services carry no limits of their own.
 */
export function accountCompareLimit(current) {
  return compareLimit(current.services.compareLimits ?? compareLimits(), current.user);
}
