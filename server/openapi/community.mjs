// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The HTTP API's description (#178) of the plugin and plugin-suite library, reports and
 * moderation, site administration and the health check: server/plugins.mjs,
 * server/moderation.mjs, server/administration.mjs and their routes in server/http.mjs.
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

export const tags = [
  {
    name: 'Plugins',
    description:
      'The plugin library: official plugins and suites, those the operator adds, and those accounts publish. Anyone can search and read it.',
  },
  {
    name: 'Reports and moderation',
    description:
      'Reporting content to the site’s administrators, and the decisions about what an account owns (see docs/moderation.md).',
  },
  {
    name: 'Administration',
    description:
      'Site administration: accounts, timelines, the default storage quota and the review of reports. For administrators only.',
  },
  { name: 'Server', description: 'The server itself.' },
];

/** The health check needs nothing at all. */
const ANYONE = [{}];
/**
 * Reports: signed in, or signed out with the sign-in token from `GET /api/session` as the
 * CSRF token (and a human-verification answer).
 */
const REPORTER = [{ csrf: [] }, { session: [], csrf: [] }, { desktop: [], csrf: [] }];

/** Bodies that are not JSON are refused before anything else. */
const notJson = {
  415: json(ref('Error'), 'The body is not JSON: send `Content-Type: application/json`.'),
};

/** How administration changes are confirmed (account-security.mjs `fresh`). */
const CONFIRMED =
  'For administrators only, and confirmed: the body carries the current `password` (an account without one, as a social-only sign-in, must instead have signed in within the last five minutes; 403 otherwise) and, with two-factor authentication on, a fresh authenticator or recovery `code` (401 when either is wrong). Each change is recorded in the administration audit. Limited to ten changes a minute per administrator.';

const confirmation = {
  password: {
    type: 'string',
    description: 'The administrator’s current password.',
  },
  code: {
    type: 'string',
    description:
      'A fresh authenticator or recovery code, when the administrator has two-factor authentication on.',
  },
  passkey: {
    $ref: '#/components/schemas/PasskeyAssertion',
    description:
      'Instead of `code`: a passkey’s answer to `POST /api/auth/passkeys/confirm/options`.',
  },
};

const slug = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' };
const versionParam = (what) =>
  pathParam('version', `The ${what}’s version.`, {
    type: 'string',
    pattern: '^[1-9][0-9]{0,15}$',
    description: 'A positive whole number, at most 9007199254740991.',
  });
const searchParams = (sort) => [
  queryParam('search', 'Text that names, descriptions or IDs contain, without regard to case.', {
    type: 'string',
    maxLength: 200,
    default: '',
  }),
  queryParam('page', 'The page, from 1.', {
    type: 'integer',
    minimum: 1,
    maximum: 10000,
    default: 1,
  }),
  queryParam('limit', 'How many on a page.', {
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 12,
  }),
  ...(sort
    ? [
        queryParam(
          'sort',
          'The order: by how many public timelines use the plugin, by name, or newest first. Without server storage, always by name.',
          { type: 'string', enum: ['popularity', 'alphabetical', 'age'], default: 'popularity' },
        ),
      ]
    : []),
];
const adminListParams = [
  queryParam(
    'search',
    'Text to look for, without regard to case (longer text is cut to 200 characters).',
    { type: 'string' },
  ),
  queryParam('page', 'The page of 25, from 1 (out-of-range pages are clamped to 1–10,000).', {
    type: 'integer',
    default: 1,
  }),
];

export const paths = {
  '/healthz': {
    get: {
      operationId: 'getHealth',
      tags: ['Server'],
      summary: 'Check the server’s health',
      description:
        'Whether the server is up and, when it has PostgreSQL, whether its database answers and has the current schema. For load balancers and monitors.',
      security: ANYONE,
      responses: {
        200: json(ref('Health'), 'The server is healthy.'),
        503: json(
          {
            type: 'object',
            required: ['status'],
            properties: { status: { const: 'unavailable' } },
          },
          'The database does not answer, or lacks the current schema.',
        ),
      },
    },
  },

  '/api/openapi.json': {
    get: {
      operationId: 'getApiDescription',
      tags: ['Server'],
      summary: 'Get this API’s description',
      description:
        'This document: the HTTP API in OpenAPI 3.1, for Swagger UI, Postman, code generators and the reference at `/docs/api`. Any site may read it.',
      security: ANYONE,
      responses: {
        200: json(
          { type: 'object', required: ['openapi', 'info', 'paths'] },
          'The OpenAPI description.',
        ),
      },
    },
  },

  '/api/plugins': {
    get: {
      operationId: 'listPlugins',
      tags: ['Plugins'],
      summary: 'Search the plugin library',
      description:
        'The newest version of each plugin whose name, description or ID contains the search. Works without server storage, with the official and operator’s plugins alone. Plugins moderators restricted are left out.',
      security: PUBLIC,
      parameters: searchParams(true),
      responses: {
        200: json(ref('PluginPage'), 'A page of plugins.'),
        ...errors(400),
      },
    },
  },
  '/api/plugins/search': {
    post: {
      operationId: 'searchPlugins',
      tags: ['Plugins'],
      summary: 'Search the plugin library with a JSON body',
      description:
        'As `GET /api/plugins`, with the search in the body (at most 4 KiB). The desktop app uses it.',
      security: PUBLIC,
      requestBody: body(ref('PluginSearch'), { required: false }),
      responses: {
        200: json(ref('PluginPage'), 'A page of plugins.'),
        ...errors(400, 403, 413),
        ...notJson,
      },
    },
  },
  '/api/plugins/{id}/{version}': {
    get: {
      operationId: 'getPlugin',
      tags: ['Plugins'],
      summary: 'Read a version of a plugin',
      description:
        'One version of a plugin, old versions included. A plugin moderators restricted is not found.',
      security: PUBLIC,
      parameters: [pathParam('id', 'The plugin’s ID.', slug), versionParam('plugin')],
      responses: {
        200: json(ref('Plugin'), 'The plugin’s definition.'),
        ...errors(400, 404),
      },
    },
  },
  '/api/plugins/publish': {
    post: {
      operationId: 'publishPlugin',
      tags: ['Plugins'],
      summary: 'Publish a plugin',
      description:
        'Publishes a version of a plugin to the library, where anyone can find it at once. It needs a script, which the server compiles in its sandbox (never running it) and refuses with 400 when it does not compile. The ID is put in the account’s namespace, `u-<account ID without hyphens>-<slug>` with a slug of at most 29 characters; keep the returned ID and increase `version` to publish an update. Versions cannot be replaced. An account may publish at most 200 versions, and ten publications (plugins and suites together) a minute. Accounts other than administrators answer a human-verification challenge first. Read-only accounts cannot publish.',
      security: SIGNED_IN,
      parameters: [challengeHeader],
      requestBody: body(ref('PluginPublication'), {
        description: 'The plugin’s definition, at most 32 KiB.',
      }),
      responses: {
        201: json(ref('Plugin'), 'Published: the definition as stored, with its namespaced ID.'),
        ...errors(400, 401, 403, 409, 413, 428, 429, 503),
        ...notJson,
      },
    },
  },
  '/api/plugins/suites': {
    get: {
      operationId: 'listPluginSuites',
      tags: ['Plugins'],
      summary: 'Search the plugin suites',
      description:
        'The newest version of each suite whose name, description, ID or plugins’ names contain the search, by name. Works without server storage, with the official suites alone. Suites moderators restricted are left out.',
      security: PUBLIC,
      parameters: searchParams(false),
      responses: {
        200: json(ref('PluginSuitePage'), 'A page of suites.'),
        ...errors(400),
      },
    },
  },
  '/api/plugins/suites/search': {
    post: {
      operationId: 'searchPluginSuites',
      tags: ['Plugins'],
      summary: 'Search the plugin suites with a JSON body',
      description: 'As `GET /api/plugins/suites`, with the search in the body (at most 4 KiB).',
      security: PUBLIC,
      requestBody: body(ref('PluginSuiteSearch'), { required: false }),
      responses: {
        200: json(ref('PluginSuitePage'), 'A page of suites.'),
        ...errors(400, 403, 413),
        ...notJson,
      },
    },
  },
  '/api/plugins/suites/{id}/{version}': {
    get: {
      operationId: 'getPluginSuite',
      tags: ['Plugins'],
      summary: 'Read a version of a plugin suite',
      description: 'One version of a suite, with its plugins’ full definitions.',
      security: PUBLIC,
      parameters: [pathParam('id', 'The suite’s ID.', slug), versionParam('suite')],
      responses: {
        200: json(ref('PluginSuite'), 'The suite.'),
        ...errors(400, 404),
      },
    },
  },
  '/api/plugins/suites/publish': {
    post: {
      operationId: 'publishPluginSuite',
      tags: ['Plugins'],
      summary: 'Publish a plugin suite',
      description:
        'Publishes a version of a suite, as plugins are published: namespaced as `u-<account ID without hyphens>-<slug>` (slug of at most 29 characters), immutable versions, at most 200 versions per account, ten publications a minute, and a human-verification challenge for accounts other than administrators. Every scripted plugin in it, other than the official ones, must compile.',
      security: SIGNED_IN,
      parameters: [challengeHeader],
      requestBody: body(ref('PluginSuite'), {
        description: 'The suite, with its plugins’ definitions; the request at most 256 KiB.',
      }),
      responses: {
        201: json(ref('PluginSuite'), 'Published: the suite as stored, with its namespaced ID.'),
        ...errors(400, 401, 403, 409, 413, 428, 429, 503),
        ...notJson,
      },
    },
  },

  '/api/reports': {
    post: {
      operationId: 'createReport',
      tags: ['Reports and moderation'],
      summary: 'Report something to the administrators',
      description:
        'Reports a timeline, an event (moment or duration) in one, a comment on a pull request, a published plugin or suite, or an account, which the reporter must be able to see (404 otherwise). Reports of the same thing gather in one case; reporting the same thing again replaces the account’s earlier report. One’s own things cannot be reported (400). Signed-out readers can report, sending the sign-in token from `GET /api/session` as the CSRF token, and answer a human-verification challenge first. Limited to ten reports a minute per account, or per address when signed out. The owner is never told who reported.',
      security: REPORTER,
      parameters: [challengeHeader],
      requestBody: body(ref('ReportRequest'), { description: 'The report, at most 8 KiB.' }),
      responses: {
        201: json(ref('Ok'), 'Reported.'),
        ...errors(400, 403, 404, 413, 428, 429, 503),
        ...notJson,
      },
    },
  },
  '/api/moderation': {
    get: {
      operationId: 'listMyModerationDecisions',
      tags: ['Reports and moderation'],
      summary: 'List moderation decisions about what you own',
      description:
        'The restrictions and labels in force, and those lifted, on things the account owns: the latest 50, newest first.',
      security: SIGNED_IN_READ,
      responses: {
        200: json(
          {
            type: 'object',
            required: ['decisions'],
            properties: { decisions: { type: 'array', items: ref('ModerationDecision') } },
          },
          'The decisions.',
        ),
        ...errors(401, 503),
      },
    },
  },
  '/api/moderation/{id}/appeal': {
    post: {
      operationId: 'appealModerationDecision',
      tags: ['Reports and moderation'],
      summary: 'Ask for a review of a moderation decision',
      description:
        'The owner’s one request for a review of a restriction or labels in force on what they own. It appears in the administrators’ queue, who then uphold or lift the decision. Limited to ten requests a minute.',
      security: SIGNED_IN,
      parameters: [pathParam('id', 'The case’s ID.', ref('Uuid'))],
      requestBody: body(ref('AppealRequest'), { description: 'The request, at most 8 KiB.' }),
      responses: {
        200: json(ref('Ok'), 'Asked.'),
        ...errors(400, 401, 403, 404, 413, 429, 503),
        409: json(ref('Error'), 'A review was already asked for.'),
        ...notJson,
      },
    },
  },

  '/api/admin/reports': {
    get: {
      operationId: 'listReportCases',
      tags: ['Reports and moderation'],
      summary: 'List reported cases for review',
      description:
        'For administrators only. A page of 25 cases. `open` lists cases awaiting a decision and decisions whose owner asked for a review, those reporting child abuse or other illegal content first, then the oldest; `restricted` lists decisions in force (restrictions and labels); `closed` lists dismissed cases and lifted decisions, newest first.',
      security: SIGNED_IN_READ,
      parameters: [
        queryParam('view', 'Which cases (anything else means `open`).', {
          type: 'string',
          enum: ['open', 'restricted', 'closed'],
          default: 'open',
        }),
        queryParam('page', 'The page of 25, from 1 (out-of-range pages are clamped to 1–10,000).', {
          type: 'integer',
          default: 1,
        }),
      ],
      responses: {
        200: json(ref('ReportCasePage'), 'A page of cases.'),
        403: json(ref('Error'), 'Not signed in as an active administrator.'),
        ...errors(503),
      },
    },
  },
  '/api/admin/reports/{id}': {
    patch: {
      operationId: 'decideReportCase',
      tags: ['Reports and moderation'],
      summary: 'Decide a reported case',
      description:
        'For administrators only. `dismiss` closes an open case; `restrict` makes a timeline private, hides a comment, plugin or suite (and refuses its new versions) or suspends an account; `label` adds content labels to a reported timeline; `uphold` keeps a decision whose owner asked for a review; `lift` undoes a restriction or labels at any time. `restrict` and `label` need a `reason`, given to the owner. The owner and signed-in reporters with a confirmed email are told by email. ' +
        CONFIRMED,
      security: SIGNED_IN,
      parameters: [pathParam('id', 'The case’s ID.', ref('Uuid'))],
      requestBody: body(ref('ModerationDecisionRequest'), {
        description: 'The decision, at most 8 KiB.',
      }),
      responses: {
        200: json(ref('Ok'), 'Decided.'),
        ...errors(400, 401, 403, 404, 413, 429, 503),
        409: json(
          ref('Error'),
          'The case was already decided, no review was asked for, nothing is in force, what was reported no longer exists, or it would suspend the last active administrator.',
        ),
        ...notJson,
      },
    },
  },

  '/api/admin/users': {
    get: {
      operationId: 'listAdminUsers',
      tags: ['Administration'],
      summary: 'List accounts',
      description:
        'For administrators only. A page of 25 accounts whose username or email contains the search, by username, with each one’s storage, trust and standing, and the site’s settings.',
      security: SIGNED_IN_READ,
      parameters: adminListParams,
      responses: {
        200: json(ref('AdminUserPage'), 'A page of accounts.'),
        403: json(ref('Error'), 'Not signed in as an active administrator.'),
        ...errors(503),
      },
    },
  },
  '/api/admin/users/{id}': {
    patch: {
      operationId: 'updateAdminUser',
      tags: ['Administration'],
      summary: 'Change an account',
      description:
        'Makes an account an administrator or not, suspends or restores it, sets its storage quota or exemption from quotas, or marks it trusted or untrusted. Suspending an account, or demoting an administrator, ends its sessions, API keys and device sign-ins. The last active administrator cannot be suspended or demoted (409). ' +
        CONFIRMED,
      security: SIGNED_IN,
      parameters: [pathParam('id', 'The account’s ID.', ref('Uuid'))],
      requestBody: body(ref('AdminUserChange'), { description: 'The changes, at most 8 KiB.' }),
      responses: {
        200: json(ref('Ok'), 'Changed.'),
        ...errors(400, 401, 403, 404, 409, 413, 429, 503),
        ...notJson,
      },
    },
  },
  '/api/admin/timelines': {
    get: {
      operationId: 'listAdminTimelines',
      tags: ['Administration'],
      summary: 'List timelines',
      description:
        'For administrators only. A page of 25 timelines, of every account and visibility, whose title or owner’s username contains the search, by title; and the site’s settings.',
      security: SIGNED_IN_READ,
      parameters: adminListParams,
      responses: {
        200: json(ref('AdminTimelinePage'), 'A page of timelines.'),
        403: json(ref('Error'), 'Not signed in as an active administrator.'),
        ...errors(503),
      },
    },
  },
  '/api/admin/timelines/{id}': {
    patch: {
      operationId: 'updateAdminTimeline',
      tags: ['Administration'],
      summary: 'Change or delete a timeline',
      description:
        'Makes a timeline public or private, features it on the site or not, or deletes it with its history (`"delete": true`, which ignores the other changes). A timeline moderators restricted cannot be made public until the restriction is lifted (409); nor can one holding private upstream data, or a comparison of timelines that are not all public (403). ' +
        CONFIRMED,
      security: SIGNED_IN,
      parameters: [pathParam('id', 'The timeline’s ID.', ref('Uuid'))],
      requestBody: body(ref('AdminTimelineChange'), { description: 'The changes, at most 8 KiB.' }),
      responses: {
        200: json(ref('Ok'), 'Changed.'),
        ...errors(400, 401, 403, 404, 409, 413, 429, 503),
        ...notJson,
      },
    },
  },
  '/api/admin/settings': {
    get: {
      operationId: 'getAdminSettings',
      tags: ['Administration'],
      summary: 'Read the site settings',
      description:
        'For administrators only. The same answer as `GET /api/admin/users` (a page of accounts, with the same parameters), whose `settings` are the site’s settings.',
      security: SIGNED_IN_READ,
      parameters: adminListParams,
      responses: {
        200: json(ref('AdminUserPage'), 'A page of accounts, and the site’s settings.'),
        403: json(ref('Error'), 'Not signed in as an active administrator.'),
        ...errors(503),
      },
    },
    patch: {
      operationId: 'updateAdminSettings',
      tags: ['Administration'],
      summary: 'Change the default storage quota',
      description:
        'Sets the storage quota of accounts without their own. When the environment file sets it (`DEFAULT_USER_STORAGE_BYTES`), it is changed there instead (409). ' +
        CONFIRMED,
      security: SIGNED_IN,
      requestBody: body(ref('AdminSettingsChange'), { description: 'The change, at most 8 KiB.' }),
      responses: {
        200: json(ref('Ok'), 'Changed.'),
        ...errors(400, 401, 403, 409, 413, 429, 503),
        ...notJson,
      },
    },
  },
};

/** A storage size: bytes, or a size such as 500MiB or 2GB, up to 10 TB. */
const quota = {
  type: ['string', 'integer'],
  description:
    'A size from 0 to 10 TB: a byte count (`104857600`) or a size with a unit (`500MiB`, `2GB`, `1.5GiB`). At most 32 characters.',
  examples: ['2GiB', 104857600],
};
const timestamp = { type: 'string', format: 'date-time' };
const count = {
  type: 'string',
  pattern: '^\\d+$',
  description: 'A count, as a decimal string.',
};
const metadataKey = {
  type: 'string',
  pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
  description:
    'A metadata key; not `title`, `description`, `durations`, `tags`, `__proto__`, `prototype` or `constructor`.',
};
const component = (kind, withKey = false) => ({
  type: 'object',
  additionalProperties: false,
  required: withKey ? ['kind', 'metadataKey'] : ['kind'],
  properties: {
    kind: typeof kind === 'string' ? { const: kind } : { type: 'string', enum: kind },
    ...(withKey ? { metadataKey } : {}),
  },
});
const page = (items, extra = {}) => ({
  type: 'object',
  required: ['apiVersion', items[0], 'total', 'page', 'limit', 'pages'],
  properties: {
    apiVersion: { const: 1 },
    [items[0]]: { type: 'array', items: ref(items[1]) },
    total: { type: 'integer', description: 'How many match.' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
    pages: { type: 'integer', description: 'How many pages there are.' },
    ...extra,
  },
});
const searchBody = (sort) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    search: { type: 'string', maxLength: 200, default: '' },
    page: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
    ...(sort
      ? {
          sort: {
            type: 'string',
            enum: ['popularity', 'alphabetical', 'age'],
            default: 'popularity',
            description: 'Without server storage, always by name.',
          },
        }
      : {}),
  },
});
const settings = {
  type: 'object',
  properties: {
    default_quota_bytes: {
      ...count,
      description: 'The storage quota of accounts without their own, in bytes.',
    },
    default_quota_from_env: {
      type: 'boolean',
      description:
        'Whether the environment file sets the default quota (`DEFAULT_USER_STORAGE_BYTES`), so it cannot be changed here.',
    },
  },
};
const adminPage = (item) => ({
  type: 'object',
  required: ['total', 'items', 'page', 'settings'],
  properties: {
    total: count,
    items: { type: 'array', items: ref(item), maxItems: 25 },
    page: { type: 'integer' },
    settings,
  },
});

export const schemas = {
  Health: {
    type: 'object',
    required: ['status', 'storage'],
    properties: {
      status: { const: 'ok' },
      storage: {
        type: 'string',
        enum: ['postgresql', 'browser'],
        description:
          '`postgresql` when the server has a database; `browser` when it has none and timelines are kept in the browser.',
      },
    },
  },

  PluginField: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'metadataKey', 'label'],
    properties: {
      kind: {
        type: 'string',
        enum: [
          'text',
          'multiline',
          'image-url',
          'stack',
          'color',
          'shape',
          'size',
          'links',
          'heading',
          'font',
          'relationship-arrows',
        ],
      },
      metadataKey: metadataKey,
      label: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
  Plugin: {
    type: 'object',
    description:
      'A plugin’s definition (manifest): host components and an optional restricted script. Unknown properties are refused.',
    additionalProperties: false,
    required: ['apiVersion', 'id', 'version', 'name', 'description', 'fields'],
    properties: {
      apiVersion: { const: 1 },
      id: { ...slug, description: 'Published plugins’ IDs are `u-<account>-<slug>`.' },
      version: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', minLength: 1, maxLength: 2000 },
      fields: {
        type: 'array',
        maxItems: 8,
        items: ref('PluginField'),
        description: 'Each with a different metadata key.',
      },
      marker: component(['image', 'color', 'shape', 'heading', 'outline'], true),
      hover: component('card'),
      summary: component('radial'),
      notes: component('markdown'),
      background: {
        ...component('image', true),
        description: 'An image behind the timeline where a duration lies.',
      },
      targets: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: { type: 'string', enum: ['moments', 'durations'] },
        description:
          'What the plugin applies to; omitted, moments (and durations for colors and cards).',
      },
      source: {
        type: 'string',
        minLength: 1,
        maxLength: 16384,
        description: 'The plugin’s script, in the bounded plugin language.',
      },
    },
  },
  PluginPublication: {
    description: 'A plugin to publish: a definition with a script, at most 32 KiB serialized.',
    allOf: [ref('Plugin')],
    required: ['source'],
  },
  PluginSearch: searchBody(true),
  PluginPage: page(['plugins', 'Plugin']),
  PluginSuite: {
    type: 'object',
    description:
      'A named package of plugins installed together, with their full definitions; at most 128 KiB serialized. Unknown properties are refused.',
    additionalProperties: false,
    required: ['apiVersion', 'id', 'version', 'name', 'plugins'],
    properties: {
      apiVersion: { const: 1 },
      id: { ...slug, description: 'Published suites’ IDs are `u-<account>-<slug>`.' },
      version: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: {
        type: 'string',
        description: 'Longer descriptions are cut to 2,000 characters. Always present in answers.',
      },
      plugins: {
        type: 'array',
        minItems: 1,
        maxItems: 32,
        items: ref('Plugin'),
        description: 'Each plugin once (by ID).',
      },
    },
  },
  PluginSuiteSearch: searchBody(false),
  PluginSuitePage: page(['suites', 'PluginSuite']),

  ReportCategory: {
    type: 'string',
    description:
      'What is wrong: child sexual abuse or exploitation; other illegal content; sexually explicit content; graphic violence or gore; promotes suicide or self-harm; harassment, threats or private information; spam or misleading; copyright infringement; something else.',
    enum: [
      'child_abuse',
      'illegal',
      'sexual',
      'violence',
      'self_harm',
      'harassment',
      'spam',
      'copyright',
      'other',
    ],
  },
  ReportTarget: {
    description: 'What is reported.',
    oneOf: [
      {
        type: 'object',
        title: 'A timeline',
        required: ['kind', 'timeline'],
        properties: { kind: { const: 'timeline' }, timeline: ref('Uuid') },
      },
      {
        type: 'object',
        title: 'An event (a moment or a duration)',
        description: 'Reported in its timeline’s case.',
        required: ['kind', 'timeline', 'id'],
        properties: {
          kind: { type: 'string', enum: ['moment', 'duration'] },
          timeline: ref('Uuid'),
          id: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$' },
        },
      },
      {
        type: 'object',
        title: 'A comment on a pull request',
        required: ['kind', 'id'],
        properties: {
          kind: { const: 'comment' },
          id: { type: 'string', pattern: '^[0-9]{1,18}$' },
        },
      },
      {
        type: 'object',
        title: 'A published plugin or suite',
        required: ['kind', 'id'],
        properties: {
          kind: { type: 'string', enum: ['plugin', 'suite'] },
          id: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
      {
        type: 'object',
        title: 'An account',
        required: ['kind', 'id'],
        properties: {
          kind: { const: 'user' },
          id: { type: 'string', minLength: 1, maxLength: 128, description: 'Its username.' },
        },
      },
    ],
  },
  ReportRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['target', 'category'],
    properties: {
      target: ref('ReportTarget'),
      category: ref('ReportCategory'),
      details: { type: 'string', maxLength: 2000, description: 'More about what is wrong.' },
    },
  },
  ContentLabel: {
    type: 'string',
    enum: ['nudity', 'violence', 'disturbing'],
    description: 'Nudity, graphic violence or disturbing content.',
  },
  ModerationTarget: {
    type: ['object', 'null'],
    description:
      'What a case is about, as it is now; null once it is gone. Each kind has some of these.',
    properties: {
      title: {
        type: 'string',
        description:
          'A timeline’s, plugin’s or suite’s name, a pull request’s title, or `@username`.',
      },
      text: { type: 'string', description: 'A comment’s text (its first 500 characters).' },
      timeline: { ...ref('Uuid'), description: 'A comment’s timeline.' },
      proposal: { ...ref('Uuid'), description: 'A comment’s pull request.' },
      username: { type: 'string', description: 'An account’s username.' },
    },
  },
  ModerationDecision: {
    type: 'object',
    description: 'A decision about something the account owns.',
    properties: {
      id: ref('Uuid'),
      target_kind: { type: 'string', enum: ['timeline', 'comment', 'plugin', 'suite', 'user'] },
      target_id: { type: 'string' },
      status: { type: 'string', enum: ['restricted', 'labelled', 'lifted'] },
      labels: {
        type: ['array', 'null'],
        items: ref('ContentLabel'),
        description: 'The labels a `label` decision added.',
      },
      reason: { type: ['string', 'null'], description: 'The statement of reasons.' },
      decided_at: { ...timestamp, type: ['string', 'null'] },
      appeal: { type: ['string', 'null'], description: 'The owner’s request for a review.' },
      appealed_at: { ...timestamp, type: ['string', 'null'] },
      appeal_outcome: { enum: ['upheld', 'lifted', null] },
      appeal_decided_at: { ...timestamp, type: ['string', 'null'] },
      target: ref('ModerationTarget'),
      path: {
        type: ['string', 'null'],
        description: 'Where what it is about is seen on the platform; null once it is gone.',
      },
    },
  },
  AppealRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['appeal'],
    properties: {
      appeal: {
        type: 'string',
        minLength: 1,
        maxLength: 2000,
        description: 'Why the decision should be reviewed.',
      },
    },
  },
  ReportCase: {
    type: 'object',
    description: 'A case: the reports of one thing, and its decision.',
    properties: {
      id: ref('Uuid'),
      target_kind: { type: 'string', enum: ['timeline', 'comment', 'plugin', 'suite', 'user'] },
      target_id: { type: 'string' },
      owner_id: {
        type: ['string', 'null'],
        format: 'uuid',
        description: 'The owner’s account ID; null once the account is gone.',
      },
      owner: { type: ['string', 'null'], description: 'The owner’s username.' },
      status: {
        type: 'string',
        enum: ['open', 'dismissed', 'restricted', 'labelled', 'lifted'],
      },
      created_at: timestamp,
      reason: { type: ['string', 'null'] },
      labels: { type: ['array', 'null'], items: ref('ContentLabel') },
      decided_by: {
        type: ['string', 'null'],
        format: 'uuid',
        description: 'The deciding administrator’s account ID.',
      },
      decided_at: { type: ['string', 'null'] },
      previous_visibility: {
        enum: ['public', 'private', null],
        description: 'A restricted timeline’s visibility before, restored when lifted.',
      },
      appeal: { type: ['string', 'null'] },
      appealed_at: { type: ['string', 'null'] },
      appeal_outcome: { enum: ['upheld', 'lifted', null] },
      appeal_decided_at: { type: ['string', 'null'] },
      target: ref('ModerationTarget'),
      path: { type: ['string', 'null'] },
      report_count: { type: 'integer' },
      urgent: {
        type: 'boolean',
        description: 'Whether a report says child abuse or other illegal content.',
      },
      reports: {
        type: 'array',
        maxItems: 20,
        description: 'The latest twenty reports, newest first.',
        items: {
          type: 'object',
          properties: {
            category: ref('ReportCategory'),
            details: { type: 'string' },
            entity_kind: {
              enum: ['moment', 'duration', null],
              description: 'The event (moment or duration) a timeline’s report names.',
            },
            entity_id: { type: ['string', 'null'] },
            created_at: timestamp,
            reporter: {
              type: ['string', 'null'],
              description: 'The reporter’s username; null when signed out.',
            },
          },
        },
      },
    },
  },
  ReportCasePage: {
    type: 'object',
    required: ['view', 'page', 'total', 'items'],
    properties: {
      view: { type: 'string', enum: ['open', 'restricted', 'closed'] },
      page: { type: 'integer' },
      total: count,
      items: { type: 'array', maxItems: 25, items: ref('ReportCase') },
    },
  },
  ModerationDecisionRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['restrict', 'label', 'dismiss', 'uphold', 'lift'],
        description:
          '`restrict`, `label` and `dismiss` decide an open case; `uphold` answers a request for review; `lift` undoes a decision in force. Only timelines are labelled.',
      },
      reason: {
        type: 'string',
        maxLength: 2000,
        description: 'The statement of reasons for the owner; required to restrict or label.',
      },
      labels: {
        type: 'array',
        minItems: 1,
        items: ref('ContentLabel'),
        description: 'To label: what the timeline contains.',
      },
      ...confirmation,
    },
  },

  AdminUser: {
    type: 'object',
    properties: {
      id: ref('Uuid'),
      username: { type: 'string' },
      email: { type: ['string', 'null'] },
      is_admin: { type: 'boolean' },
      is_disabled: { type: 'boolean', description: 'Whether it is suspended.' },
      quota_bypass: { type: 'boolean', description: 'Whether storage quotas do not apply to it.' },
      quota_bytes: {
        type: ['integer', 'null'],
        description: 'Its own storage quota; null for the site’s default.',
      },
      used_bytes: { type: 'integer' },
      created_at: timestamp,
      trust: { enum: ['trusted', 'untrusted', null] },
      standing: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Its standing, which ranks its timelines and weighs its stars.',
      },
      endorsers: { type: 'integer', description: 'Accounts that endorse it by stars or forks.' },
      confirmed: {
        type: 'boolean',
        description: 'Whether it has a confirmed email or a social sign-in.',
      },
      restricted: {
        type: 'boolean',
        description: 'Whether a moderation restriction is in force on something it owns.',
      },
      directory_only: {
        type: 'boolean',
        description:
          'Whether it signs in only through its directory account (no password, no other provider), which `release_directory` can release.',
      },
    },
  },
  AdminUserPage: adminPage('AdminUser'),
  AdminTimeline: {
    type: 'object',
    properties: {
      id: ref('Uuid'),
      title: { type: 'string' },
      visibility: { type: 'string', enum: ['public', 'private'] },
      featured: { type: 'boolean' },
      event_count: { type: 'integer' },
      owner: { type: 'string', description: 'The owner’s username.' },
    },
  },
  AdminTimelinePage: adminPage('AdminTimeline'),
  AdminUserChange: {
    type: 'object',
    additionalProperties: false,
    properties: {
      is_admin: { type: 'boolean' },
      is_disabled: { type: 'boolean', description: 'Suspends (true) or restores (false) it.' },
      quota_bypass: { type: 'boolean' },
      quota_bytes: {
        ...quota,
        type: ['string', 'integer', 'null'],
        description: quota.description + ' Null for the site’s default.',
      },
      trust: {
        enum: ['trusted', 'untrusted', null],
        description:
          'Trusted accounts have full standing; untrusted none; null decides by its record.',
      },
      release_directory: {
        const: true,
        description:
          'Releases an account that signs in only through its directory (`directory_only`), for when directory sign-in is turned off or the person moves off the directory: its directory account is unlinked, its sessions, sign-in challenges and pending desktop sign-ins end, its API keys are revoked, and a password-reset link goes to its confirmed address (Forgot password sends another). 409 for any other account. A later directory sign-in by the person makes a new account.',
      },
      ...confirmation,
    },
  },
  AdminTimelineChange: {
    type: 'object',
    additionalProperties: false,
    properties: {
      visibility: { type: 'string', enum: ['public', 'private'] },
      featured: { type: 'boolean' },
      delete: { type: 'boolean', description: '`true` deletes the timeline and its history.' },
      ...confirmation,
    },
  },
  AdminSettingsChange: {
    type: 'object',
    additionalProperties: false,
    required: ['default_quota_bytes'],
    properties: {
      default_quota_bytes: quota,
      ...confirmation,
    },
  },
};
