// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What the account page tells someone about their second factor, from the account's
// `security` (GET /api/auth/account).

/**
 * Whether two-factor authentication is on with only recovery codes to answer it: no
 * authenticator app and no passkeys. A password reset leaves an account so when passkeys were
 * its only second factor (it removes them and keeps two-factor authentication on), and the
 * codes run out as they are used, so the account page asks for a factor to be added again.
 * @param {object} [security] the account's `security` (`mfa_enabled`, `totp_enabled`,
 *   `passkeys`)
 * @returns {boolean}
 */
export function recoveryCodesOnly(security) {
  return !!security?.mfa_enabled && !security.totp_enabled && !security.passkeys?.length;
}
