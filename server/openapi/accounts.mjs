// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Accounts (#178): the session, signing in and out, registration, account security, API keys,
 * device sign-in, sign-in providers, and the account's data and deletion. See http.mjs,
 * auth.mjs, account-security.mjs, api-keys.mjs, device-auth.mjs, oauth.mjs,
 * account-deletion.mjs and challenge.mjs; docs/authentication.md describes the flows.
 */
import {
  ref,
  json,
  body,
  pathParam,
  queryParam,
  errors,
  PUBLIC,
  SIGNED_IN_READ,
  SIGNED_IN,
  challengeHeader,
} from './common.mjs';

/**
 * Before signing in: the sign-in CSRF token (`X-CSRF-Token` equal to the `oc_login` cookie
 * that `GET /api/session` sets). A signed-in caller sends its session's own CSRF token instead.
 */
const SIGN_IN = [{ csrf: [] }, ...SIGNED_IN];
/** Anyone, with no CSRF token: only a foreign `Origin` header is refused. */
const ANYONE = [{}];

const SIGN_IN_TOKEN =
  'Before signing in, send `X-CSRF-Token` equal to the sign-in token: the `csrf` that `GET /api/session` returns along with its `oc_login` cookie (valid ten minutes). A caller that is already signed in sends its session’s CSRF token instead.';
const FRESH =
  'Like every security change, it needs a sign-in within the last five minutes (else 403), the current `password` when the account has one (else 401), and, with two-factor authentication on, a fresh `code` from the authenticator or a recovery code (else 401).';
const COOKIE_NAMES =
  'Cookie names take the `__Host-` prefix (and `Secure`) when the server is on HTTPS.';

/** A `Set-Cookie` response header. */
const setCookie = (description) => ({
  'Set-Cookie': { description, schema: { type: 'string' } },
});
/** An error response for a status `errors()` does not cover. */
const error = (description) => json(ref('Error'), description);

/** Marks a sign-in as the desktop app's. */
const clientHeader = {
  name: 'X-OC-Client',
  in: 'header',
  required: false,
  description:
    'Send `desktop` from the desktop app: the sign-in then returns a session `token` (a bearer credential) instead of setting the session cookie.',
  schema: { type: 'string', enum: ['desktop'] },
};
const providerParam = pathParam(
  'provider',
  'The sign-in provider. Only providers this server configures work (see `providers` in `GET /api/session`).',
  ref('SignInProvider'),
);

const password = (description) => ({ type: 'string', maxLength: 1024, description });
const newPassword = {
  type: 'string',
  minLength: 15,
  maxLength: 1024,
  description:
    'A password or passphrase of 15–1024 characters. Predictable ones, and ones found in known breaches (checked against Have I Been Pwned by the first five characters of its SHA-1), are refused.',
};
const confirmation = {
  type: 'string',
  description: 'The new password again; it must match.',
};
const currentPassword = password(
  'The current password, when the account has one (accounts made with a sign-in provider may not).',
);
const factorCode = {
  type: 'string',
  description:
    'With two-factor authentication on: a six-digit authenticator code, or a recovery code. Codes already used do not work again.',
  example: '123456',
};
const email = {
  type: 'string',
  format: 'email',
  maxLength: 254,
  description: 'An email address (trimmed and lowercased).',
};
const birthYear = {
  type: 'integer',
  minimum: 1900,
  description:
    'Year of birth. Accounts are for people 13 and older: anyone who may be younger than 13 by the end of this year is refused (403), and the browser is refused again for a day.',
  example: 1990,
};
const verifyCookie = setCookie(
  'Sets `oc_verify`, binding the emailed confirmation to this browser for 24 hours. ' +
    COOKIE_NAMES,
);

export const tags = [
  {
    name: 'Session',
    description:
      'Who is signed in, the CSRF token, and what this server offers; signing out. ' + COOKIE_NAMES,
  },
  {
    name: 'Sign-in',
    description:
      'Signing in with a password, a sign-in provider (Google, GitHub, Facebook) or, for the desktop app, a browser; registering; two-factor and email steps; confirming emails and resetting passwords. Sign-in, social starts and device approvals are limited to ten attempts a minute per client address (429). API keys cannot reach these endpoints (403).',
  },
  {
    name: 'Account security',
    description:
      'Two-factor authentication, recovery codes, password and email changes, and unlinking sign-in providers. ' +
      FRESH,
  },
  {
    name: 'API keys',
    description:
      'Keys for automation, which reach the timeline endpoints only. Managed from a signed-in session; API keys cannot manage keys (403).',
  },
  {
    name: 'Account',
    description: 'The account’s profile, security overview, storage, sessions, and deleting it.',
  },
];

export const paths = {
  '/api/session': {
    get: {
      operationId: 'getSession',
      tags: ['Session'],
      summary: 'Get the session',
      description:
        'Who is signed in (or `user: null`), the CSRF token to send with changes, and what this server offers. When nobody is signed in, `csrf` is the sign-in token, set as the `oc_login` cookie too: signing in, registering and the other steps before a session send it as `X-CSRF-Token`.',
      security: PUBLIC,
      responses: {
        200: {
          ...json(ref('Session'), 'The session.'),
          headers: setCookie(
            'When nobody is signed in: `oc_login`, the sign-in token (HttpOnly, SameSite=Lax, ten minutes). ' +
              COOKIE_NAMES,
          ),
        },
        ...errors(403),
      },
    },
  },
  '/api/auth/login': {
    post: {
      operationId: 'signIn',
      tags: ['Sign-in'],
      summary: 'Sign in with a password',
      description: [
        SIGN_IN_TOKEN,
        'A signed-in browser gets the session cookie; the desktop app (`X-OC-Client: desktop`) gets a session `token` instead. Signing in replaces the caller’s previous session.',
        'When the account needs another step, the answer is a `SignInStep` instead, with the `oc_challenge` cookie (five minutes): `mfa` asks for `POST /api/auth/mfa/complete`, `email` for `POST /api/auth/email/enroll`.',
        'After three failures in fifteen minutes from the client address or for the account, it asks for human verification (428) instead of locking the account. Ten attempts a minute per client address and per account (429).',
      ].join('\n\n'),
      security: SIGN_IN,
      parameters: [clientHeader, challengeHeader],
      requestBody: body(ref('SignInRequest')),
      responses: {
        200: {
          ...json({ oneOf: [ref('SignedIn'), ref('SignInStep')] }, 'Signed in, or the next step.'),
          headers: setCookie(
            'Signed in from a browser: the session cookie `oc_session` (HttpOnly, SameSite=Lax, 14 days), and `oc_login` cleared. A further step: `oc_challenge`. ' +
              COOKIE_NAMES,
          ),
        },
        ...errors(400, 401, 403, 413, 428, 429, 503),
      },
    },
  },
  '/api/auth/register': {
    post: {
      operationId: 'register',
      tags: ['Sign-in'],
      summary: 'Register',
      description: [
        SIGN_IN_TOKEN,
        'Makes a pending registration and emails a confirmation, which `POST /api/auth/email/verify` accepts in this browser within 24 hours; the account exists only then, and no session is made here. The answer is the same whether or not the username or email is taken. Always asks for human verification (428). Unavailable (503) until the server has email and an encryption key configured.',
      ].join('\n\n'),
      security: SIGN_IN,
      parameters: [challengeHeader],
      requestBody: body(ref('RegistrationRequest')),
      responses: {
        200: {
          ...json(ref('Registered'), 'Registration pending its email confirmation.'),
          headers: verifyCookie,
        },
        ...errors(400, 403, 413, 428, 429, 503),
      },
    },
  },
  '/api/auth/mfa/complete': {
    post: {
      operationId: 'completeTwoFactorSignIn',
      tags: ['Sign-in'],
      summary: 'Finish signing in with a two-factor code',
      description: [
        'The `mfa` step of a sign-in: send an authenticator or recovery code. Needs the `oc_challenge` cookie the sign-in set, in the same browser (`oc_login`), within five minutes; five wrong codes close the step, and signing in starts again.',
        SIGN_IN_TOKEN,
        'Signs in as the sign-in began: a browser session cookie, or a desktop `token`.',
      ].join('\n\n'),
      security: SIGN_IN,
      requestBody: body({
        type: 'object',
        required: ['code'],
        properties: { code: factorCode },
      }),
      responses: {
        200: {
          ...json(
            {
              allOf: [
                ref('SignedIn'),
                {
                  type: 'object',
                  properties: {
                    returnTo: {
                      type: 'string',
                      description: 'Where the sign-in was headed, a page of this site.',
                      example: '/',
                    },
                  },
                },
              ],
            },
            'Signed in.',
          ),
          headers: setCookie(
            'From a browser: the session cookie `oc_session`; `oc_challenge` and `oc_login` cleared. ' +
              COOKIE_NAMES,
          ),
        },
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/email/enroll': {
    post: {
      operationId: 'enrollEmail',
      tags: ['Sign-in'],
      summary: 'Give an email address to confirm',
      description: [
        'The `email` step of a sign-in: an account without a confirmed email address (such as one new from a sign-in provider) gives one, and confirms it with the emailed link (`POST /api/auth/email/verify`) before it can sign in. Needs the `oc_challenge` cookie of that step. A new account gives its year of birth here too; one under 13 is closed.',
        SIGN_IN_TOKEN,
        'Always asks for human verification (428), since it sends email to an address the requester types. The answer is the same whether or not another account has the address.',
      ].join('\n\n'),
      security: SIGN_IN,
      parameters: [challengeHeader],
      requestBody: body({
        type: 'object',
        required: ['email'],
        properties: {
          email,
          birthYear: {
            ...birthYear,
            description:
              birthYear.description + ' Required when the account has no year of birth yet.',
          },
          password: currentPassword,
          code: factorCode,
        },
      }),
      responses: {
        200: { ...json(ref('AccountMessage'), 'Confirmation sent.'), headers: verifyCookie },
        ...errors(400, 401, 403, 413, 428, 429, 503),
      },
    },
  },
  '/api/auth/email/verify': {
    post: {
      operationId: 'verifyEmail',
      tags: ['Sign-in'],
      summary: 'Confirm an email address',
      description: [
        'Accepts the token from an emailed confirmation link (`/login#verify=…`): it completes a registration (making the account), confirms an email address given at sign-in, or completes an email change. It works only in the browser that asked for it (its `oc_verify` cookie), within 24 hours.',
        'Confirming signs the account out everywhere; sign in afterwards.',
        SIGN_IN_TOKEN,
      ].join('\n\n'),
      security: SIGN_IN,
      requestBody: body({
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
            description: 'The token from the confirmation link.',
          },
        },
      }),
      responses: {
        200: {
          ...json(ref('AccountMessage'), 'Confirmed.'),
          headers: setCookie('Clears `oc_challenge`.'),
        },
        ...errors(400, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/password/forgot': {
    post: {
      operationId: 'forgotPassword',
      tags: ['Sign-in'],
      summary: 'Ask for a password reset link',
      description: [
        'Emails a reset link (`/login#reset=…`, valid 30 minutes, once) to an account with that confirmed address and a password. The answer is the same for every address.',
        SIGN_IN_TOKEN,
        'Always asks for human verification (428). Limited per client address and per email address (429).',
      ].join('\n\n'),
      security: SIGN_IN,
      parameters: [challengeHeader],
      requestBody: body({ type: 'object', required: ['email'], properties: { email } }),
      responses: {
        200: json(ref('AccountMessage'), 'A link is sent if the account is eligible.'),
        ...errors(400, 403, 413, 428, 429, 503),
      },
    },
  },
  '/api/auth/password/reset': {
    post: {
      operationId: 'resetPassword',
      tags: ['Sign-in'],
      summary: 'Reset a password',
      description: [
        'Sets a new password with the token from a reset link. It signs the account out everywhere, revokes its API keys and pending desktop approvals, and does not turn two-factor authentication off.',
        SIGN_IN_TOKEN,
      ].join('\n\n'),
      security: SIGN_IN,
      requestBody: body({
        type: 'object',
        required: ['token', 'password', 'passwordConfirmation'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
            description: 'The token from the reset link.',
          },
          password: newPassword,
          passwordConfirmation: confirmation,
        },
      }),
      responses: {
        200: json(ref('AccountMessage'), 'Password reset.'),
        ...errors(400, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/{provider}/start': {
    post: {
      operationId: 'startProviderSignIn',
      tags: ['Sign-in'],
      summary: 'Start signing in with a provider',
      description: [
        'Begins signing in with Google, GitHub or Facebook, or with `link: true`, linking one to the signed-in account (which needs a sign-in within the last five minutes). Send the browser to the `url` returned; the provider returns it to `GET /api/auth/{provider}/callback` within ten minutes.',
        SIGN_IN_TOKEN,
      ].join('\n\n'),
      security: SIGN_IN,
      parameters: [providerParam],
      requestBody: body(ref('ProviderStartRequest')),
      responses: {
        200: {
          ...json(
            {
              type: 'object',
              required: ['url'],
              properties: {
                url: {
                  type: 'string',
                  format: 'uri',
                  description: 'The provider’s authorization page, to send the browser to.',
                },
              },
            },
            'Where to send the browser.',
          ),
          headers: setCookie(
            'Sets `oc_oauth`, binding the sign-in to this browser for ten minutes. ' + COOKIE_NAMES,
          ),
        },
        ...errors(400, 401, 403, 404, 413, 429, 503),
      },
    },
  },
  '/api/auth/{provider}/callback': {
    get: {
      operationId: 'finishProviderSignIn',
      tags: ['Sign-in'],
      summary: 'Return from a provider',
      description: [
        'Where the provider sends the browser back: not called directly. It needs the `oc_oauth` cookie of the browser that started, and is used once.',
        'It answers with a redirect (303): to the return location when signed in, linked or cancelled (`?auth_cancelled=1`), or to `/login?step=mfa|email&returnTo=…` when the sign-in needs another step. Signing in replaces the browser’s previous session. A failure answers with a JSON error instead.',
      ].join('\n\n'),
      security: ANYONE,
      parameters: [
        providerParam,
        queryParam(
          'state',
          'The state the sign-in started with.',
          {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
          },
          true,
        ),
        queryParam('code', 'The provider’s authorization code.', {
          type: 'string',
          maxLength: 4096,
        }),
        queryParam('error', 'Set by the provider when the person cancelled or it refused.'),
      ],
      responses: {
        303: {
          description: 'Back to the site.',
          headers: {
            Location: {
              description: 'The return location, a page of this site.',
              schema: { type: 'string' },
            },
            ...setCookie(
              'Signed in: the session cookie `oc_session`, and `oc_login` cleared. A further step: `oc_challenge`. ' +
                COOKIE_NAMES,
            ),
          },
        },
        ...errors(400, 403, 409, 503),
        502: error('The provider could not be reached or did not verify the identity.'),
      },
    },
  },
  '/api/auth/device/start': {
    post: {
      operationId: 'startDeviceSignIn',
      tags: ['Sign-in'],
      summary: 'Start signing in the desktop app through a browser',
      description:
        'The desktop app’s **Sign in using your browser**: it shows `userCode` and opens `verificationUri`, where a signed-in browser approves it (`POST /api/auth/device/approve`), then polls `POST /api/auth/device/poll` with `deviceCode`, which it keeps to itself. The request expires in ten minutes. Send an empty JSON object.',
      security: ANYONE,
      requestBody: body({ type: 'object' }),
      responses: {
        200: json(ref('DeviceSignIn'), 'The pending desktop sign-in.'),
        ...errors(400, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/device/poll': {
    post: {
      operationId: 'pollDeviceSignIn',
      tags: ['Sign-in'],
      summary: 'Check on a desktop sign-in',
      description:
        'Answers `{pending: true}` until a browser approves, then a desktop session `token`, once. Poll at most every three seconds: a faster poll, an expired request or a used one is refused (400).',
      security: ANYONE,
      requestBody: body({
        type: 'object',
        required: ['deviceCode'],
        properties: {
          deviceCode: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
            description: 'The `deviceCode` from `POST /api/auth/device/start`.',
          },
        },
      }),
      responses: {
        200: json(
          {
            oneOf: [
              {
                type: 'object',
                required: ['pending'],
                properties: { pending: { const: true } },
              },
              ref('SignedIn'),
            ],
          },
          'Still waiting, or signed in (with `token`).',
        ),
        ...errors(400, 403, 413, 503),
      },
    },
  },
  '/api/auth/device/approve': {
    post: {
      operationId: 'approveDeviceSignIn',
      tags: ['Sign-in'],
      summary: 'Approve a desktop sign-in',
      description:
        'Approves the desktop app showing `userCode`, signing it in to this account. Needs a sign-in within the last five minutes.',
      security: SIGNED_IN,
      requestBody: body({
        type: 'object',
        required: ['userCode'],
        properties: {
          userCode: {
            type: 'string',
            pattern: '^[A-Z2-9]{10}$',
            description: 'The ten-character code the desktop app shows.',
            example: 'K7MPQ2XRTA',
          },
        },
      }),
      responses: {
        200: json(ref('Ok'), 'Approved.'),
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/mfa/setup': {
    post: {
      operationId: 'setUpTwoFactor',
      tags: ['Account security'],
      summary: 'Start setting up two-factor authentication',
      description:
        'Gives a new authenticator key, to enter in an authenticator app; `POST /api/auth/mfa/enable` turns it on within ten minutes, from this session. Needs a confirmed email address. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body({ type: 'object', properties: { password: currentPassword } }),
      responses: {
        200: json(ref('TwoFactorSetup'), 'The authenticator key.'),
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/mfa/enable': {
    post: {
      operationId: 'enableTwoFactor',
      tags: ['Account security'],
      summary: 'Turn on two-factor authentication',
      description:
        'Confirms the key from `POST /api/auth/mfa/setup` with a code from the authenticator, and gives ten recovery codes, shown only once. Signs out the account’s other sessions. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body({
        type: 'object',
        required: ['code'],
        properties: {
          password: currentPassword,
          code: {
            type: 'string',
            pattern: '^\\d{6}$',
            description: 'A code from the authenticator just set up.',
          },
        },
      }),
      responses: {
        200: json(ref('RecoveryCodes'), 'Turned on.'),
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/mfa/disable': {
    post: {
      operationId: 'disableTwoFactor',
      tags: ['Account security'],
      summary: 'Turn off two-factor authentication',
      description:
        'Turns two-factor authentication off and removes the recovery codes. Signs out the account’s other sessions. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body(ref('SecurityConfirmation')),
      responses: {
        200: json(ref('AccountMessage'), 'Turned off.'),
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/mfa/recovery': {
    post: {
      operationId: 'replaceRecoveryCodes',
      tags: ['Account security'],
      summary: 'Replace the recovery codes',
      description:
        'Gives ten new recovery codes, shown only once; the old ones stop working. Signs out the account’s other sessions. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body(ref('SecurityConfirmation')),
      responses: {
        200: json(ref('RecoveryCodes'), 'The new recovery codes.'),
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/password/change': {
    post: {
      operationId: 'changePassword',
      tags: ['Account security'],
      summary: 'Change the password',
      description:
        'Sets a new password (or a first one, for an account made with a sign-in provider). Signs the account out everywhere, this session included, and revokes its API keys. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body({
        type: 'object',
        required: ['newPassword', 'passwordConfirmation'],
        properties: {
          password: currentPassword,
          newPassword,
          passwordConfirmation: confirmation,
          code: factorCode,
        },
      }),
      responses: {
        200: json(ref('AccountMessage'), 'Changed; sign in again.'),
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/email/change': {
    post: {
      operationId: 'changeEmail',
      tags: ['Account security'],
      summary: 'Change the email address',
      description:
        'Emails a confirmation to the new address, which `POST /api/auth/email/verify` accepts in this browser within 24 hours; the old address is told and stays until then. Confirming signs the account out everywhere. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body({
        type: 'object',
        required: ['email'],
        properties: { email, password: currentPassword, code: factorCode },
      }),
      responses: {
        200: { ...json(ref('AccountMessage'), 'Confirmation sent.'), headers: verifyCookie },
        ...errors(400, 401, 403, 413, 429, 503),
      },
    },
  },
  '/api/auth/identities/unlink': {
    post: {
      operationId: 'unlinkProvider',
      tags: ['Account security'],
      summary: 'Unlink a sign-in provider',
      description:
        'Removes a provider from the ways to sign in to this account. An account keeps at least one: a password or another provider (409). Linking is `POST /api/auth/{provider}/start` with `link: true`. ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body({
        type: 'object',
        required: ['provider'],
        properties: {
          provider: ref('SignInProvider'),
          password: currentPassword,
          code: factorCode,
        },
      }),
      responses: {
        200: json(ref('Ok'), 'Unlinked.'),
        ...errors(400, 401, 403, 409, 413, 429, 503),
      },
    },
  },
  '/api/auth/api-keys': {
    get: {
      operationId: 'listApiKeys',
      tags: ['API keys'],
      summary: 'List API keys',
      description:
        'The account’s API keys, newest first (at most 100), revoked and expired ones included.',
      security: SIGNED_IN_READ,
      responses: {
        200: json(
          {
            type: 'object',
            required: ['keys'],
            properties: { keys: { type: 'array', items: ref('ApiKey') } },
          },
          'The keys.',
        ),
        ...errors(401, 403, 503),
      },
    },
    post: {
      operationId: 'createApiKey',
      tags: ['API keys'],
      summary: 'Make an API key',
      description:
        'Makes a key for the timeline endpoints with the scopes asked for. The key itself is returned only here: copy it now. An account has at most 100 keys, counting revoked ones (409). ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body(ref('NewApiKey')),
      responses: {
        201: json(ref('CreatedApiKey'), 'The new key.'),
        ...errors(400, 401, 403, 409, 413, 429, 503),
      },
    },
  },
  '/api/auth/api-keys/{id}': {
    parameters: [pathParam('id', 'The API key’s ID.', ref('Uuid'))],
    post: {
      operationId: 'revokeApiKey',
      tags: ['API keys'],
      summary: 'Revoke an API key',
      description: 'Stops the key working; it stays listed, as revoked. No body.',
      security: SIGNED_IN,
      responses: {
        200: json(ref('Ok'), 'Revoked.'),
        ...errors(401, 403, 404, 503),
      },
    },
    delete: {
      operationId: 'deleteApiKey',
      tags: ['API keys'],
      summary: 'Delete an API key',
      description: 'Removes the key, which stops working.',
      security: SIGNED_IN,
      responses: {
        200: json(ref('Ok'), 'Deleted.'),
        ...errors(401, 403, 404, 503),
      },
    },
  },
  '/api/auth/profile': {
    patch: {
      operationId: 'updateProfile',
      tags: ['Account'],
      summary: 'Change the profile',
      description:
        'Changes the avatar or whether sensitive content shows without a warning. Accounts of people under 18 always see the warnings (403).',
      security: SIGNED_IN,
      requestBody: body(ref('ProfileChange')),
      responses: {
        200: json(ref('Ok'), 'Changed.'),
        ...errors(400, 401, 403, 413, 503),
      },
    },
  },
  '/api/auth/account': {
    get: {
      operationId: 'getAccount',
      tags: ['Account'],
      summary: 'Get the account',
      description:
        'The account’s security settings, profile, storage, API keys, linked sign-in providers and active sessions.',
      security: SIGNED_IN_READ,
      responses: {
        200: json(ref('Account'), 'The account.'),
        ...errors(401, 403, 503),
      },
    },
    delete: {
      operationId: 'deleteAccount',
      tags: ['Account'],
      summary: 'Delete the account',
      description:
        'Deletes the account and what it owns: its timelines (with their history, pull requests and comments), the pull requests and comments it wrote on others’ timelines, its plugins and suites, stars, memberships, API keys, sign-in methods and sessions. What it already merged into others’ timelines stays theirs. It cannot be undone. The last active administrator cannot delete their account (409). ' +
        FRESH,
      security: SIGNED_IN,
      requestBody: body(ref('AccountDeletion')),
      responses: {
        200: {
          ...json(ref('AccountDeleted'), 'Deleted.'),
          headers: setCookie('Clears the session cookie.'),
        },
        ...errors(400, 401, 403, 409, 413, 429, 503),
      },
    },
  },
  '/api/auth/revoke-others': {
    post: {
      operationId: 'signOutOtherSessions',
      tags: ['Session'],
      summary: 'Sign out every other session',
      description:
        'Signs out the account’s other browser and desktop sessions at once, keeping this one. API keys are not affected. No body.',
      security: SIGNED_IN,
      responses: {
        200: json(ref('Ok'), 'Signed out.'),
        ...errors(401, 403, 503),
      },
    },
  },
  '/api/auth/logout': {
    post: {
      operationId: 'signOut',
      tags: ['Session'],
      summary: 'Sign out',
      description: 'Ends this session. No body.',
      security: SIGNED_IN,
      responses: {
        200: {
          ...json(ref('Ok'), 'Signed out.'),
          headers: setCookie('Clears the session cookie.'),
        },
        ...errors(401, 403, 503),
      },
    },
  },
};

const timestamp = { type: 'string', format: 'date-time' };
const nullableTimestamp = { type: ['string', 'null'], format: 'date-time' };
const bytes = (description) => ({
  type: 'string',
  pattern: '^\\d+$',
  description: description + ' A decimal string.',
});
const username = {
  type: 'string',
  pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$',
  description:
    '3–32 letters, digits, `_` or `-`, starting with a letter or digit; lowercased by the server.',
  example: 'ada',
};

export const schemas = {
  Session: {
    type: 'object',
    required: ['server', 'dashboard', 'user', 'csrf', 'providers', 'fileExchange'],
    properties: {
      server: {
        type: 'boolean',
        description: 'Whether the server has storage. Without it, only browser timelines work.',
      },
      dashboard: { type: 'boolean', const: true },
      user: { oneOf: [ref('SessionUser'), { type: 'null' }] },
      csrf: {
        type: ['string', 'null'],
        pattern: '^[a-f0-9]{64}$',
        description:
          'Signed in: the session’s CSRF token, sent as `X-CSRF-Token` with every change. Signed out: the sign-in token (also the `oc_login` cookie), sent the same way by sign-in requests. Null without server storage.',
      },
      providers: {
        type: 'array',
        items: ref('SignInProvider'),
        description: 'The sign-in providers this server offers.',
      },
      security: {
        type: 'object',
        description:
          'Which account-security features the server offers (it needs email and an encryption key configured). Absent without server storage.',
        properties: {
          email: { type: 'boolean' },
          mfa: { type: 'boolean' },
          registration: { type: 'boolean' },
        },
      },
      challenge: {
        type: ['string', 'null'],
        enum: ['mfa', 'email', null],
        description:
          'A sign-in step this browser has pending (`mfa`: a two-factor code; `email`: an email address to confirm), or null.',
      },
      fileExchange: {
        type: 'boolean',
        description: 'Whether the server converts SQLite (.och) timeline files.',
      },
      compareLimit: {
        type: 'integer',
        description: 'How many timelines this account (or a guest) may compare at once.',
      },
      entryLimit: {
        type: ['integer', 'null'],
        description:
          'How many moments (and durations, relationships) a timeline may hold; null for no limit.',
      },
    },
  },
  SessionUser: {
    type: 'object',
    required: ['id', 'username'],
    properties: {
      id: ref('Uuid'),
      username: { type: 'string', example: 'ada' },
      isAdmin: { type: 'boolean' },
      avatarUrl: { type: 'string', description: 'An HTTPS or data: image URL, or empty.' },
      minor: {
        type: 'boolean',
        description: 'Whether the account may be under 18, by its year of birth.',
      },
      showSensitive: {
        type: 'boolean',
        description: 'Whether sensitive content shows without a warning (never for minors).',
      },
    },
  },
  SignInProvider: { type: 'string', enum: ['google', 'github', 'facebook'] },
  SignInRequest: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username,
      password: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
        description: 'The password.',
      },
    },
  },
  SignedIn: {
    type: 'object',
    required: ['user', 'csrf'],
    properties: {
      user: {
        type: 'object',
        required: ['id', 'username'],
        properties: { id: ref('Uuid'), username: { type: 'string' } },
      },
      csrf: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description: 'The new session’s CSRF token, to send as `X-CSRF-Token` with changes.',
      },
      token: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description:
          'Desktop sign-ins only: the session token, sent as `Authorization: Bearer …`. A browser gets the session cookie instead.',
      },
    },
  },
  SignInStep: {
    type: 'object',
    required: ['challenge', 'message'],
    properties: {
      challenge: {
        type: 'string',
        enum: ['mfa', 'email'],
        description:
          '`mfa`: send a two-factor code to `POST /api/auth/mfa/complete`. `email`: confirm an email address with `POST /api/auth/email/enroll`.',
      },
      message: { type: 'string' },
    },
  },
  RegistrationRequest: {
    type: 'object',
    required: ['username', 'email', 'password', 'passwordConfirmation', 'birthYear'],
    properties: {
      username: {
        ...username,
        description: username.description + ' Names of the site’s own pages are taken.',
      },
      email,
      password: newPassword,
      passwordConfirmation: confirmation,
      birthYear,
    },
  },
  Registered: {
    type: 'object',
    required: ['message', 'verificationRequired'],
    properties: {
      message: { type: 'string' },
      verificationRequired: { const: true },
    },
  },
  AccountMessage: {
    type: 'object',
    required: ['message'],
    properties: { message: { type: 'string', description: 'What happened, for people.' } },
  },
  SecurityConfirmation: {
    type: 'object',
    description: 'What a security change needs besides a recent sign-in.',
    properties: { password: currentPassword, code: factorCode },
  },
  TwoFactorSetup: {
    type: 'object',
    required: ['secret', 'uri'],
    properties: {
      secret: {
        type: 'string',
        pattern: '^[A-Z2-7]+$',
        description: 'The authenticator key, in base32.',
      },
      uri: {
        type: 'string',
        description: 'The same key as an `otpauth://totp/…` link (SHA-1, six digits, 30 seconds).',
      },
    },
  },
  RecoveryCodes: {
    type: 'object',
    required: ['message', 'recoveryCodes'],
    properties: {
      message: { type: 'string' },
      recoveryCodes: {
        type: 'array',
        minItems: 10,
        maxItems: 10,
        items: { type: 'string', pattern: '^[a-f0-9]{8}(-[a-f0-9]{8}){3}$' },
        description: 'Ten one-time recovery codes, shown only once. Store them offline.',
      },
    },
  },
  ProviderStartRequest: {
    type: 'object',
    properties: {
      returnTo: {
        type: 'string',
        default: '/',
        description:
          'Where to return after: `/`, `/editor`, `/account`, `/plugins`, `/timelines/<id>`, or a desktop approval page (`/connect/desktop/<code>`, `/#desktop/<code>`).',
      },
      link: {
        type: 'boolean',
        description:
          'Link the provider to the signed-in account instead of signing in. Needs a session signed in within the last five minutes.',
      },
    },
  },
  DeviceSignIn: {
    type: 'object',
    required: ['deviceCode', 'userCode', 'verificationUri', 'interval', 'expiresIn'],
    properties: {
      deviceCode: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description: 'The desktop app’s secret for polling. Keep it out of the browser.',
      },
      userCode: {
        type: 'string',
        pattern: '^[A-Z2-9]{10}$',
        description: 'The code the desktop app shows, to match in the browser.',
      },
      verificationUri: {
        type: 'string',
        format: 'uri',
        description: 'The page that approves it: `<origin>/connect/desktop/<userCode>`.',
      },
      interval: { type: 'integer', const: 3, description: 'Seconds between polls, at least.' },
      expiresIn: { type: 'integer', const: 600, description: 'Seconds until it expires.' },
    },
  },
  ApiKey: {
    type: 'object',
    required: ['id', 'name', 'prefix', 'scopes', 'created_at', 'expires_at'],
    properties: {
      id: ref('Uuid'),
      name: { type: 'string' },
      prefix: {
        type: 'string',
        description: 'The key’s first 20 characters, to recognize it by.',
        example: 'och_key_6f1c4e2a9b3d',
      },
      scopes: { type: 'array', items: ref('ApiKeyScope') },
      created_at: timestamp,
      expires_at: timestamp,
      last_used_at: nullableTimestamp,
      revoked_at: nullableTimestamp,
    },
  },
  ApiKeyScope: {
    type: 'string',
    enum: ['timelines:read', 'timelines:write'],
    description:
      '`timelines:read` for reads (GET, and POST searches and queries); `timelines:write` for changes.',
  },
  NewApiKey: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 80, description: 'Trimmed; not blank.' },
      scopes: {
        type: 'array',
        items: ref('ApiKeyScope'),
        minItems: 1,
        maxItems: 2,
        default: ['timelines:read'],
      },
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        default: 90,
        description: 'Days until it expires.',
      },
      password: currentPassword,
      code: factorCode,
    },
  },
  CreatedApiKey: {
    type: 'object',
    required: ['id', 'token', 'message'],
    properties: {
      id: ref('Uuid'),
      token: {
        type: 'string',
        pattern: '^och_key_[a-f0-9]{32}_[a-f0-9]{64}$',
        description:
          'The key, sent as `Authorization: Bearer …`. Shown only now; the server keeps only its hash.',
      },
      message: { type: 'string' },
    },
  },
  ProfileChange: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      avatarUrl: {
        type: 'string',
        maxLength: 350000,
        description:
          'An HTTPS image URL (at most 2048 characters), a `data:image/png|jpeg|webp;base64,…` image (at most 256 KiB), or empty to remove it.',
      },
      showSensitive: {
        type: 'boolean',
        description: 'Show sensitive content without a warning. Adults only.',
      },
    },
  },
  Account: {
    type: 'object',
    required: ['security', 'profile', 'usage', 'keys', 'identities', 'sessions'],
    properties: {
      security: {
        type: 'object',
        properties: {
          email: { type: ['string', 'null'] },
          email_verified_at: nullableTimestamp,
          mfa_enabled: { type: 'boolean' },
          has_password: { type: 'boolean' },
          recovery_remaining: {
            type: 'integer',
            description: 'Recovery codes not yet used.',
          },
        },
      },
      profile: {
        type: 'object',
        properties: {
          avatarUrl: { type: 'string' },
          minor: { type: 'boolean' },
          showSensitive: { type: 'boolean' },
        },
      },
      usage: ref('AccountUsage'),
      keys: { type: 'array', items: ref('ApiKey') },
      identities: {
        type: 'array',
        items: ref('SignInProvider'),
        description: 'The sign-in providers linked to the account.',
      },
      sessions: { type: 'array', items: ref('AccountSession') },
    },
  },
  AccountUsage: {
    type: 'object',
    description: 'Storage used and allowed.',
    properties: {
      used_bytes: bytes('Storage used.'),
      quota_bytes: {
        ...bytes('The account’s own storage limit, or null for the site default.'),
        type: ['string', 'null'],
      },
      effective_quota_bytes: bytes('The storage limit that applies.'),
      quota_bypass: { type: 'boolean', description: 'Whether the account has no storage limit.' },
      is_admin: { type: 'boolean' },
      is_disabled: { type: 'boolean' },
    },
  },
  AccountSession: {
    type: 'object',
    required: ['id', 'kind', 'created_at', 'last_seen_at', 'current'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description: 'Identifies the session (a hash of its token, not the token).',
      },
      kind: { type: 'string', enum: ['web', 'desktop'] },
      created_at: timestamp,
      last_seen_at: timestamp,
      current: { type: 'boolean', description: 'Whether it is the session asking.' },
    },
  },
  AccountDeletion: {
    type: 'object',
    required: ['confirm'],
    additionalProperties: false,
    properties: {
      confirm: { type: 'string', description: 'The account’s username, to confirm.' },
      password: currentPassword,
      code: factorCode,
    },
  },
  AccountDeleted: {
    type: 'object',
    required: ['ok', 'timelines'],
    properties: {
      ok: { const: true },
      timelines: { type: 'integer', description: 'How many timelines were deleted with it.' },
    },
  },
  HumanChallenge: {
    description:
      'The human-verification challenge a 428 carries (as `challenge`). Answer it and repeat the request with the answer in `X-Challenge`.',
    oneOf: [
      {
        type: 'object',
        title: 'Proof of work',
        required: [
          'provider',
          'purpose',
          'algorithm',
          'salt',
          'challenge',
          'maxnumber',
          'signature',
        ],
        properties: {
          provider: { const: 'pow' },
          purpose: ref('HumanChallengePurpose'),
          algorithm: { const: 'SHA-256' },
          salt: { type: 'string' },
          challenge: {
            type: 'string',
            description:
              'Find the `number` from 0 to `maxnumber` whose SHA-256 of `salt + number` (hex) is this.',
          },
          maxnumber: { type: 'integer' },
          signature: { type: 'string' },
        },
      },
      {
        type: 'object',
        title: 'Cloudflare Turnstile',
        required: ['provider', 'purpose', 'siteKey'],
        properties: {
          provider: { const: 'turnstile' },
          purpose: ref('HumanChallengePurpose'),
          siteKey: {
            type: 'string',
            description: 'The Turnstile widget’s site key; its action is `purpose`.',
          },
        },
      },
    ],
  },
  HumanChallengePurpose: {
    type: 'string',
    enum: ['register', 'email', 'sign-in', 'contribution', 'plugin', 'report'],
    description: 'The action a challenge is for; its answer works for that action only.',
  },
  HumanChallengeAnswer: {
    description:
      'An answer to a `HumanChallenge`, sent base64url-encoded as JSON in `X-Challenge`.',
    oneOf: [
      {
        type: 'object',
        title: 'Proof of work',
        required: ['provider', 'salt', 'number', 'challenge', 'signature'],
        properties: {
          provider: { const: 'pow' },
          salt: { type: 'string', maxLength: 200, description: 'As given.' },
          number: { type: 'integer', minimum: 0, description: 'The number found.' },
          challenge: { type: 'string', description: 'As given.' },
          signature: { type: 'string', description: 'As given.' },
        },
      },
      {
        type: 'object',
        title: 'Cloudflare Turnstile',
        required: ['provider', 'token'],
        properties: {
          provider: { const: 'turnstile' },
          token: { type: 'string', maxLength: 2048, description: 'The widget’s token.' },
        },
      },
    ],
  },
};
