// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What every part of the HTTP API's description (#178; OpenAPI 3.1) shares: how requests
 * are authorized, errors, and helpers for writing operations briefly. Each area of the API
 * (timelines.mjs, collaboration.mjs, accounts.mjs, community.mjs) exports
 * `{ tags, paths, schemas }`, which index.mjs puts together.
 */

/** A reference to a schema in `components.schemas`. */
export const ref = (name) => ({ $ref: '#/components/schemas/' + name });

/** A JSON body or response of `schema`, described by `description`. */
export const json = (schema, description = 'OK.') => ({
  description,
  content: { 'application/json': { schema } },
});

/** A request body: JSON of `schema`, required unless `required` is false. */
export const body = (schema, { required = true, description } = {}) => ({
  required,
  ...(description ? { description } : {}),
  content: { 'application/json': { schema } },
});

/** A path parameter. */
export const pathParam = (name, description, schema = { type: 'string' }) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema,
});
/** A query parameter. */
export const queryParam = (name, description, schema = { type: 'string' }, required = false) => ({
  name,
  in: 'query',
  required,
  description,
  schema,
});
/** The `{id}` of a timeline. */
export const timelineId = pathParam('id', "The timeline's ID.", ref('Uuid'));

/** The answer to the human-verification challenge a 428 carried (server/challenge.mjs). */
export const challengeHeader = {
  name: 'X-Challenge',
  in: 'header',
  required: false,
  description:
    'The answer to the challenge a 428 carried: base64url of the JSON of a `HumanChallengeAnswer`. Each answer works once, for the action it was issued for, within ten minutes.',
  schema: {
    type: 'string',
    maxLength: 4096,
    contentEncoding: 'base64url',
    contentMediaType: 'application/json',
    contentSchema: ref('HumanChallengeAnswer'),
  },
};

/** Error responses: the status codes an operation answers with when it refuses. */
const ERRORS = {
  400: 'The request is malformed or a value is not allowed.',
  401: 'Sign in first.',
  403: 'Not allowed: the CSRF token is missing or stale, the account lacks the role, or an API key lacks the scope.',
  404: 'Not found, or not visible to this account.',
  409: 'It conflicts with the current state, such as a stale revision.',
  413: 'Too large, or over the account’s storage.',
  415: 'The body is not JSON: send `Content-Type: application/json`.',
  428: 'Human verification is needed first: answer the challenge and send its token in `X-Challenge`.',
  429: 'Too many requests. Wait, then try again.',
  502: 'A service the server relies on, such as a sign-in provider, failed.',
  503: 'The server’s storage, or a service it needs, is unavailable.',
};
export const errors = (...codes) =>
  Object.fromEntries(codes.map((code) => [String(code), json(ref('Error'), ERRORS[code])]));

/**
 * Who may call an operation (its `security`):
 * - PUBLIC: anyone; signed-in callers may see more.
 * - TIMELINE_READ / TIMELINE_WRITE: timeline endpoints, which API keys may also call with the
 *   `timelines:read` or `timelines:write` scope. Reads are open to guests where the timeline
 *   is public.
 * - SIGNED_IN: a signed-in browser or desktop session, with its CSRF token for changes.
 */
export const PUBLIC = [{}, { session: [] }, { desktop: [] }];
export const TIMELINE_READ = [{}, { session: [] }, { desktop: [] }, { apiKey: ['timelines:read'] }];
export const TIMELINE_WRITE = [
  { session: [], csrf: [] },
  { desktop: [], csrf: [] },
  { apiKey: ['timelines:write'] },
];
export const SIGNED_IN_READ = [{ session: [] }, { desktop: [] }];
export const SIGNED_IN = [
  { session: [], csrf: [] },
  { desktop: [], csrf: [] },
];

export const securitySchemes = {
  session: {
    type: 'apiKey',
    in: 'cookie',
    name: 'oc_session',
    description:
      'The browser session cookie set by signing in (`__Host-oc_session` on HTTPS). Changes also need the `csrf` header.',
  },
  csrf: {
    type: 'apiKey',
    in: 'header',
    name: 'X-CSRF-Token',
    description:
      'The `csrf` value from `GET /api/session`, sent with every change a session makes. Before signing in, it is the sign-in token that `GET /api/session` gives with its cookie.',
  },
  desktop: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: '64 hexadecimal digits',
    description:
      'A desktop app session: the token signing in from the desktop app (or device sign-in) returns. Changes also need the `csrf` header.',
  },
  apiKey: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'och_key_…',
    description:
      'An API key made in Account → API keys, for automation. It reaches timeline endpoints only (`/api/timelines…`), with the `timelines:read` scope for reads (GET, and POST searches and queries) and `timelines:write` for changes. No CSRF token is needed.',
  },
};

export const schemas = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'What went wrong, for people.' },
      challenge: {
        ...ref('HumanChallenge'),
        description: 'With 428: the human-verification challenge to answer.',
      },
      conflicts: {
        type: 'array',
        items: {},
        description:
          'With 409 from a save, merge or sync: what conflicts with what was saved meanwhile (at most 100). Saves name each conflicting entity; merges and syncs name fields, such as `moment x.metadata.title`.',
      },
      conflictCount: { type: 'integer', description: 'With `conflicts`: how many there are.' },
    },
  },
  Uuid: { type: 'string', format: 'uuid', example: '6f1c4e2a-9b3d-4c5e-8f70-112233445566' },
  Revision: {
    type: 'string',
    pattern: '^\\d+$',
    description:
      "A timeline's revision, as a decimal string. Saves send the revision they were made on.",
    example: '12',
  },
  Rational: {
    type: 'string',
    description: 'An exact time or number: an integer or fraction (`-3/2`), in coordinates.',
    example: '86400/1',
  },
  Ok: { type: 'object', properties: { ok: { const: true } } },
};
