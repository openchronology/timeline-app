// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Agreeing to the service's terms of service and privacy policy (#277): the version in force,
// what counts as agreeing to it, and which requests an account that has not agreed to it may
// still make.
import { HttpError } from './store.mjs';
import { keyRequestRead } from './api-keys.mjs';

/**
 * The version of the terms of service and privacy policy in force: their effective date, as
 * legal/TERMS.md and legal/PRIVACY.md state it ("Effective 25 October 2026"). Change it when
 * either changes materially; every account is then asked to agree again.
 */
export const POLICY_VERSION = '2026-10-25';

/** Why a request needs agreement first; the client shows it with a way to agree. */
export const AGREEMENT_NEEDED =
  'Agree to the updated terms of service and privacy policy to continue: see your account page.';

/**
 * Checks that `value` (a form's `acceptTerms`) agrees to the version in force: the client
 * sends the version it showed, so agreeing to an older page does not count. Throws 400.
 */
export function requireAgreement(value) {
  if (value !== POLICY_VERSION)
    throw new HttpError(
      400,
      value
        ? 'The terms of service or privacy policy changed. Reload the page and agree to them again.'
        : 'Agree to the terms of service and privacy policy to continue.',
    );
}

/** Whether the account in `session` (a session row with `terms_version`) agreed to this version. */
export function agreed(session) {
  return session?.terms_version === POLICY_VERSION;
}

/**
 * Refuses, with 403, a request that would change something for a browser or desktop session
 * whose account has not agreed to the version in force. Still allowed: every read (and the
 * POST reads, query and search), signing out and the rest of the account's own settings and
 * security under /api/auth/ (but not creating an API key), deleting the account or its
 * timelines, exporting a file, reporting, and asking for a moderation review. API keys made
 * before keep working, so integrations do not stop until their owner signs in.
 */
export function requireAgreed(session, pathname, method) {
  if (!session || session.kind === 'api' || agreed(session)) return;
  if (keyRequestRead(pathname, method) || method === 'DELETE') return;
  if (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/api-keys') return;
  if (['/api/reports', '/api/files/export'].includes(pathname)) return;
  if (/^\/api\/moderation\/[a-f0-9-]{36}\/appeal$/.test(pathname)) return;
  const error = new HttpError(403, AGREEMENT_NEEDED);
  error.terms = POLICY_VERSION;
  throw error;
}
