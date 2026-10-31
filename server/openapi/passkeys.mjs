// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Passkeys (#372): enrolling, renaming and removing them, confirming a change or a sign-in's
 * two-factor step with one, and signing in with one. See server/passkeys.mjs and
 * server/webauthn.mjs; docs/authentication.md, "Passkeys", describes the flows. Their tags are
 * accounts.mjs's.
 */
import { ref, json, body, pathParam, errors, SIGNED_IN } from './common.mjs';

/** Before signing in, the sign-in token; signed in, the session's own (as accounts.mjs). */
const SIGN_IN = [{ csrf: [] }, ...SIGNED_IN];
/** A browser session only: passkeys are made and used in a browser, on the site. */
const BROWSER = [{ session: [], csrf: [] }];
const CONFIRM =
  'Confirmed as every security change: the current `password` when the account has one (else 401), or a sign-in within the last five minutes, and, with two-factor authentication on, a fresh `code` or a `passkey` answering `POST /api/auth/passkeys/confirm/options` (else 401).';
const binary = (description) => ({
  type: 'string',
  pattern: '^[A-Za-z0-9_-]*$',
  description: description + ' (base64url).',
});
const passkeyId = pathParam('id', 'The passkey’s ID, as the account lists it.', ref('Uuid'));
const requestOptions = (description) =>
  json(
    {
      type: 'object',
      required: ['publicKey'],
      properties: { publicKey: ref('PasskeyRequestOptions') },
    },
    description,
  );

export const tags = [];

export const paths = {
  '/api/auth/passkeys/register/options': {
    post: {
      operationId: 'startPasskeyEnrollment',
      tags: ['Account security'],
      summary: 'Start adding a passkey',
      description:
        'Options for `navigator.credentials.create()`, with a challenge for this session that works once within five minutes. The passkey must verify the person (`userVerification: required`); attestation is not asked for. Needs a confirmed email address; at most twenty passkeys. ' +
        CONFIRM,
      security: BROWSER,
      requestBody: body(ref('SecurityConfirmation')),
      responses: {
        200: json(
          {
            type: 'object',
            required: ['publicKey'],
            properties: { publicKey: ref('PasskeyCreationOptions') },
          },
          'The creation options, binary fields base64url.',
        ),
        ...errors(400, 401, 403, 409, 413, 429, 503),
      },
    },
  },
  '/api/auth/passkeys/register': {
    post: {
      operationId: 'addPasskey',
      tags: ['Account security'],
      summary: 'Add a passkey',
      description:
        'The browser’s new credential, answering this session’s challenge from `POST /api/auth/passkeys/register/options` (else 400), checked for this site’s address and RP ID and for user verification (else 401). The account’s first second factor turns two-factor authentication on and gives ten recovery codes, shown only once. Signs out the account’s other sessions and notifies it by email.',
      security: BROWSER,
      requestBody: body({
        type: 'object',
        required: ['name', 'credential'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 64, description: 'Its name.' },
          credential: ref('PasskeyCredential'),
        },
      }),
      responses: {
        200: json(
          {
            type: 'object',
            required: ['message'],
            properties: {
              message: { type: 'string' },
              recoveryCodes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Only when this turned two-factor authentication on.',
              },
            },
          },
          'Added.',
        ),
        ...errors(400, 401, 403, 409, 413, 429, 503),
      },
    },
  },
  '/api/auth/passkeys/{id}': {
    patch: {
      operationId: 'renamePasskey',
      tags: ['Account security'],
      summary: 'Rename a passkey',
      description: 'Not a security change: the session suffices.',
      security: BROWSER,
      parameters: [passkeyId],
      requestBody: body({
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 64 } },
      }),
      responses: {
        200: json(ref('AccountMessage'), 'Renamed.'),
        ...errors(400, 401, 403, 404, 413, 429),
      },
    },
    delete: {
      operationId: 'removePasskey',
      tags: ['Account security'],
      summary: 'Remove a passkey',
      description:
        'Without passkeys or an authenticator app left, two-factor authentication goes off and the recovery codes with it. Signs out the account’s other sessions and notifies it by email. ' +
        CONFIRM,
      security: BROWSER,
      parameters: [passkeyId],
      requestBody: body(ref('SecurityConfirmation')),
      responses: {
        200: json(ref('AccountMessage'), 'Removed.'),
        ...errors(400, 401, 403, 404, 413, 429, 503),
      },
    },
  },
  '/api/auth/passkeys/confirm/options': {
    post: {
      operationId: 'confirmWithPasskey',
      tags: ['Account security'],
      summary: 'Ask to confirm a change with a passkey',
      description:
        'Options for `navigator.credentials.get()` listing the account’s passkeys, with a challenge for this session that works once within five minutes. The answer goes in the change’s `passkey` field (any request that asks for a two-factor `code`). `publicKey` is null when the account has no passkey.',
      security: BROWSER,
      requestBody: body({ type: 'object' }, { required: false }),
      responses: {
        200: json(
          {
            type: 'object',
            required: ['publicKey'],
            properties: {
              publicKey: { oneOf: [ref('PasskeyRequestOptions'), { type: 'null' }] },
            },
          },
          'The request options, or null.',
        ),
        ...errors(401, 403, 413, 429),
      },
    },
  },
  '/api/auth/passkeys/factor/options': {
    post: {
      operationId: 'passkeyTwoFactorOptions',
      tags: ['Sign-in'],
      summary: 'Ask to answer the two-factor step with a passkey',
      description:
        'For a sign-in at its `mfa` step in this browser (the `oc_challenge` cookie): options listing the account’s passkeys, with a challenge for this browser that works once within five minutes. The answer goes to `POST /api/auth/mfa/complete` as `passkey`. 401 when there is no such step or the account has no passkey.',
      security: SIGN_IN,
      requestBody: body({ type: 'object' }, { required: false }),
      responses: {
        200: requestOptions('The request options.'),
        ...errors(401, 403, 413, 429),
      },
    },
  },
  '/api/auth/passkeys/sign-in/options': {
    post: {
      operationId: 'passkeySignInOptions',
      tags: ['Sign-in'],
      summary: 'Ask to sign in with a passkey',
      description:
        'Options for `navigator.credentials.get()` listing no passkeys, so the browser offers those it holds for this site (discoverable credentials), with a challenge for this browser that works once within five minutes. 404 when the server turns signing in with a passkey off (`passkeySignIn` in `GET /api/session`; PASSKEY_SIGN_IN). Shares the password sign-in’s ten attempts a minute per client address. Signed in already, the challenge is bound to the session instead, which the sign-in replaces, as a password sign-in does.',
      security: SIGN_IN,
      requestBody: body({ type: 'object' }, { required: false }),
      responses: {
        200: requestOptions('The request options.'),
        ...errors(403, 404, 413, 429, 503),
      },
    },
  },
  '/api/auth/passkeys/sign-in': {
    post: {
      operationId: 'signInWithPasskey',
      tags: ['Sign-in'],
      summary: 'Sign in with a passkey',
      description:
        'The browser’s answer to this browser’s challenge from `POST /api/auth/passkeys/sign-in/options`. A passkey that verified the person is two factors in itself, so no further step follows. Signs in a browser (the session cookie), replacing the caller’s previous session. The same 401 for every refusal, except a passkey whose signature counter went backwards, which says it may have been copied.',
      security: SIGN_IN,
      requestBody: body({
        type: 'object',
        required: ['credential'],
        properties: { credential: ref('PasskeyAssertion') },
      }),
      responses: {
        200: json(ref('SignedIn'), 'Signed in.'),
        ...errors(401, 403, 404, 413, 429, 503),
      },
    },
  },
};

export const schemas = {
  PasskeyCreationOptions: {
    type: 'object',
    description:
      'For `navigator.credentials.create({ publicKey })` once `challenge`, `user.id` and each `excludeCredentials[].id` are decoded from base64url.',
    properties: {
      challenge: binary('The challenge'),
      rp: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The host of the site’s address.' },
          name: { type: 'string' },
        },
      },
      user: {
        type: 'object',
        properties: {
          id: binary('The account’s user handle: its ID’s 16 bytes'),
          name: { type: 'string' },
          displayName: { type: 'string' },
        },
      },
      pubKeyCredParams: { type: 'array', items: { type: 'object' } },
      timeout: { type: 'integer' },
      attestation: { type: 'string', const: 'none' },
      authenticatorSelection: { type: 'object' },
      excludeCredentials: { type: 'array', items: ref('PasskeyDescriptor') },
    },
  },
  PasskeyRequestOptions: {
    type: 'object',
    description:
      'For `navigator.credentials.get({ publicKey })` once `challenge` and each `allowCredentials[].id` are decoded from base64url.',
    properties: {
      challenge: binary('The challenge'),
      rpId: { type: 'string' },
      timeout: { type: 'integer' },
      userVerification: { type: 'string', const: 'required' },
      allowCredentials: { type: 'array', items: ref('PasskeyDescriptor') },
    },
  },
  PasskeyDescriptor: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'public-key' },
      id: binary('The credential ID'),
      transports: { type: 'array', items: { type: 'string' } },
    },
  },
  PasskeyCredential: {
    type: 'object',
    required: ['id', 'type', 'response'],
    description: 'A new credential from `navigator.credentials.create()`, binary fields base64url.',
    properties: {
      id: { type: 'string' },
      rawId: binary('The credential ID'),
      type: { type: 'string', const: 'public-key' },
      response: {
        type: 'object',
        required: ['clientDataJSON', 'attestationObject'],
        properties: {
          clientDataJSON: binary('The client data'),
          attestationObject: binary('The attestation object'),
          transports: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  PasskeyAssertion: {
    type: 'object',
    required: ['id', 'type', 'response'],
    description:
      'A passkey’s answer from `navigator.credentials.get()`, binary fields base64url. Forms may send it as JSON text.',
    properties: {
      id: { type: 'string' },
      rawId: binary('The credential ID'),
      type: { type: 'string', const: 'public-key' },
      response: {
        type: 'object',
        required: ['clientDataJSON', 'authenticatorData', 'signature'],
        properties: {
          clientDataJSON: binary('The client data'),
          authenticatorData: binary('The authenticator data'),
          signature: binary('The signature'),
          userHandle: binary('The account’s user handle, from a discoverable passkey'),
        },
      },
    },
  },
  Passkey: {
    type: 'object',
    description: 'One of the account’s passkeys.',
    properties: {
      id: ref('Uuid'),
      name: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
      last_used_at: { type: ['string', 'null'], format: 'date-time' },
      transports: { type: 'array', items: { type: 'string' } },
    },
  },
};
