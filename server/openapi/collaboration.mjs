// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The HTTP API's description (#178) of finding and starring timelines, forks, copies and
 * syncs, saved history, and pull requests with their comments (collaboration.mjs,
 * versioning.mjs, stars.mjs, browser-forks.mjs; docs/collaboration.md, docs/browsing.md).
 */
import {
  ref,
  json,
  body,
  pathParam,
  queryParam,
  timelineId,
  errors,
  cachedDownload,
  CACHED_DOWNLOAD,
  TIMELINE_READ,
  TIMELINE_WRITE,
} from './common.mjs';

const SEARCH = 'Search';
const FORKS = 'Forks and history';
const PULLS = 'Pull requests';

export const tags = [
  {
    name: SEARCH,
    description:
      'Finding public, shared and starred timelines, and starring them. Browsing ranks by account standing (docs/browsing.md).',
  },
  {
    name: FORKS,
    description:
      'Forks, duplicates and syncs, and a timeline’s saved history: the checkpoints each save records, with their parents.',
  },
  {
    name: PULLS,
    description:
      'Pull requests (proposals): changes offered to a timeline from a fork or as a whole document, reviewed against saved revisions, merged or rejected by its writers, and discussed in comments.',
  },
];

const proposalId = pathParam('proposal', 'The pull request’s ID.', ref('Uuid'));
/** A response of one whole timeline document, as `{document}`. */
const documentResult = (description) =>
  json(
    {
      type: 'object',
      required: ['document'],
      properties: { document: ref('TimelineDocument') },
    },
    description,
  );

export const paths = {
  '/api/timelines/search': {
    post: {
      operationId: 'searchTimelines',
      tags: [SEARCH],
      summary: 'Search and browse timelines',
      description:
        'Lists timelines a page at a time. With no `search` text, `owner` or `starredBy`, the `public` scope browses: public timelines of established accounts, and featured ones; readers who are not signed in, or whose accounts may be under 18, browse no labelled timelines. Text search uses PostgreSQL full-text search (`websearch_to_tsquery`, so quoted phrases and `-exclusions` work) over titles, tags, descriptions and moment text, and finds every account’s public timelines, established accounts’ first. A POST, so it counts as a read for API keys.',
      security: TIMELINE_READ,
      requestBody: body(ref('TimelineSearchRequest'), { required: false }),
      responses: {
        200: json(ref('TimelineSearchPage')),
        ...errors(400, 401, 403, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/star': {
    post: {
      operationId: 'starTimeline',
      tags: [SEARCH],
      summary: 'Star or unstar a timeline',
      description:
        'Stars (or unstars) a timeline the account can read. Starring twice, or unstarring an unstarred timeline, changes nothing. The timeline’s popularity and its owner’s standing are updated at once.',
      security: TIMELINE_WRITE,
      parameters: [timelineId],
      requestBody: body({
        type: 'object',
        required: ['starred'],
        additionalProperties: false,
        properties: { starred: { type: 'boolean', description: 'True to star, false to unstar.' } },
      }),
      responses: {
        200: json({
          type: 'object',
          required: ['starred', 'star_count'],
          properties: {
            starred: { type: 'boolean' },
            star_count: {
              type: 'string',
              pattern: '^\\d+$',
              description: 'How many accounts have starred it now, as a decimal string.',
            },
          },
        }),
        ...errors(400, 401, 403, 404, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/fork': {
    post: {
      operationId: 'forkTimeline',
      tags: [FORKS],
      summary: 'Fork a timeline',
      description:
        'Copies the timeline’s saved head into a new timeline owned by the caller, linked to it as upstream so it can sync and propose pull requests. The fork starts private, and stays private when upstream is private. Its saved history and index read through to upstream’s instead of being copied, so it opens at once; a large copy may answer with `preparing` true while the rest of its index is copied. Anyone signed in may fork someone else’s public timeline; a private one needs the owner’s *Allow invited readers to fork* setting (or an administrator). An owner duplicates their own timeline instead (403 here). An account has one fork of a timeline: forking it again answers that fork (200, with `existing` true) and copies nothing.',
      security: TIMELINE_WRITE,
      parameters: [timelineId],
      requestBody: body(ref('CopyRequest')),
      responses: {
        201: json(ref('TimelineMetadata'), 'The new fork’s metadata (without time bounds).'),
        200: json(ref('TimelineMetadata'), 'The caller’s existing fork, opened again.'),
        ...errors(400, 401, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/duplicate': {
    post: {
      operationId: 'duplicateTimeline',
      tags: [FORKS],
      summary: 'Duplicate a timeline',
      description:
        'Like a fork, but for the timeline’s owner (403 for anyone else, who forks it): the copy has no upstream link or merge ancestry, an independent timeline. It shares saved history with its source the same way.',
      security: TIMELINE_WRITE,
      parameters: [timelineId],
      requestBody: body(ref('CopyRequest')),
      responses: {
        201: json(ref('TimelineMetadata'), 'The new copy’s metadata (without time bounds).'),
        ...errors(400, 401, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/sync': {
    post: {
      operationId: 'syncFork',
      tags: [FORKS],
      summary: 'Sync a fork with its upstream',
      description:
        'Merges what upstream saved since its latest common ancestor with the fork into the fork, entity by entity, and records a `sync` checkpoint with both parents. Does nothing when upstream is already an ancestor. Refused with 409 when the fork has no upstream, the revision is stale, the two have several equally good common ancestors, fields conflict (listed in `conflicts`), or upstream no longer keeps the revision they last shared. A public fork cannot sync a private upstream.',
      security: TIMELINE_WRITE,
      parameters: [timelineId],
      requestBody: body({
        type: 'object',
        required: ['revision'],
        properties: {
          revision: { ...ref('Revision'), description: 'The fork’s current revision.' },
        },
      }),
      responses: {
        200: json(ref('TimelineMetadata'), 'The fork’s metadata after syncing.'),
        ...errors(400, 401, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/browser-fork': {
    post: {
      operationId: 'copyTimelineForBrowser',
      tags: [FORKS],
      summary: 'Copy a public timeline to edit in the browser',
      description:
        'Returns a public timeline’s saved head whole, for an editor to keep as an in-memory draft rather than on the server. Only timelines of at most 5,000 entries (stack entries included) and 4 MiB qualify; larger ones are refused with 413, and nothing is truncated. Comparisons are refused with 409. At most four copies are made at once (429 when busy), and copies are rate limited by address. Anyone may copy one, guests included: it reads, and keeps nothing on the server.',
      security: [{}, ...TIMELINE_WRITE],
      parameters: [timelineId],
      requestBody: body({
        type: 'object',
        additionalProperties: false,
        properties: {
          revision: {
            type: 'string',
            pattern: '^\\d{1,20}$',
            description: 'If given, the revision expected: 409 when the timeline has moved on.',
          },
        },
      }),
      responses: {
        200: json(ref('BrowserFork')),
        ...errors(400, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/history': {
    get: {
      operationId: 'listHistory',
      tags: [FORKS],
      summary: 'List saved revisions',
      description:
        'A page of the timeline’s saved checkpoints, newest first, twenty per page. A past revision whose content is not kept (the timeline stopped keeping saved history) is listed with `available` false.',
      security: TIMELINE_READ,
      parameters: [
        timelineId,
        queryParam('page', 'The page, from 1.', {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 1,
        }),
      ],
      responses: {
        200: json(ref('HistoryPage')),
        ...errors(400, 403, 404, 409, 429),
      },
    },
  },
  '/api/timelines/{id}/history/{saved}': {
    get: {
      operationId: 'getSavedRevision',
      tags: [FORKS],
      summary: 'Read a saved revision',
      description:
        'The timeline as it was saved at that checkpoint, streamed as `{"document": …}`. With `download=1` it is the bare document, sent as an attachment named `timeline-<saved>.ochx`. Only this timeline’s checkpoints are found; one whose content is not kept answers 409.' +
        CACHED_DOWNLOAD.replace(' A server', ' With `download=1`, a server'),
      security: TIMELINE_READ,
      parameters: [
        timelineId,
        pathParam('saved', 'The saved revision’s ID (from the history list).', ref('Uuid')),
        queryParam('download', '`1` to download the document as an `.ochx` file.', {
          type: 'string',
          enum: ['1'],
        }),
      ],
      responses: {
        200: {
          description:
            'The saved document; with `download=1`, the bare document as an `.ochx` attachment (`Content-Disposition` set).',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['document'],
                    properties: { document: ref('TimelineDocument') },
                  },
                  ref('TimelineDocument'),
                ],
              },
            },
          },
        },
        ...cachedDownload({ redirect: true }),
        ...errors(400, 403, 404, 409, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals': {
    get: {
      operationId: 'listProposals',
      tags: [PULLS],
      summary: 'List pull requests',
      description:
        'The timeline’s pull requests, newest first, twelve per page. `POST …/proposals/search` takes the same request as a body, with a chosen page size.',
      security: TIMELINE_READ,
      parameters: [
        timelineId,
        queryParam('page', 'The page, from 1.', {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 1,
        }),
      ],
      responses: {
        200: json(ref('ProposalPage')),
        ...errors(400, 403, 404, 409, 429),
      },
    },
    post: {
      operationId: 'createProposal',
      tags: [PULLS],
      summary: 'Open a pull request',
      description:
        'Offers changes to the timeline, either from a saved revision of one of its forks (`sourceTimelineId` and `sourceRevisionId`; needs write access to the fork) or as a whole proposed document made on its current revision (`baseRevision` and `document`). The proposal is pinned to those revisions: later saves to the fork do not change it. Needs contributor access, or any signed-in account on a public timeline. Both the timeline and the fork must keep saved history. An author may have at most 100 open pull requests per timeline. New accounts may first be asked for human verification (428). Answers with the pull request, as `GET` does.',
      security: TIMELINE_WRITE,
      parameters: [timelineId],
      requestBody: body(ref('ProposalInput')),
      responses: {
        201: json(ref('Proposal'), 'The pull request opened.'),
        ...errors(400, 401, 403, 404, 409, 413, 428, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/search': {
    post: {
      operationId: 'searchProposals',
      tags: [PULLS],
      summary: 'List pull requests, a page at a time',
      description:
        'The timeline’s pull requests, newest first. A POST so the desktop app can send it without a query string; it counts as a read for API keys.',
      security: TIMELINE_READ,
      parameters: [timelineId],
      requestBody: body(
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
          },
        },
        { required: false },
      ),
      responses: {
        200: json(ref('ProposalPage')),
        ...errors(400, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/{proposal}': {
    get: {
      operationId: 'getProposal',
      tags: [PULLS],
      summary: 'Get a pull request',
      description:
        'The pull request with its pinned revisions, a summary of what it changes (computed from saved history), and what the caller may do with it.',
      security: TIMELINE_READ,
      parameters: [timelineId, proposalId],
      responses: {
        200: json(ref('Proposal')),
        ...errors(403, 404, 409, 429),
      },
    },
    put: {
      operationId: 'updateProposal',
      tags: [PULLS],
      summary: 'Update a pull request',
      description:
        'Replaces an open pull request’s title, description and proposed changes: a new saved revision of the same fork, or a new proposed document on the same base. Only its author, while still allowed to contribute, may. `revision` is the pull request’s revision as last read; a stale one answers 409. To move a document proposal onto a newer upstream revision, rebase it instead.',
      security: TIMELINE_WRITE,
      parameters: [timelineId, proposalId],
      requestBody: body(ref('ProposalUpdate')),
      responses: {
        200: json(ref('Proposal'), 'The pull request updated.'),
        ...errors(400, 401, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/{proposal}/document': {
    get: {
      operationId: 'getProposalDocument',
      tags: [PULLS],
      summary: 'Get the proposed timeline',
      description:
        'The pull request’s proposed timeline, whole, to view, edit or export. 409 when its revision is no longer kept.',
      security: TIMELINE_READ,
      parameters: [timelineId, proposalId],
      responses: {
        200: documentResult('The proposed timeline.'),
        ...errors(403, 404, 409, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/{proposal}/resolve': {
    post: {
      operationId: 'resolveProposal',
      tags: [PULLS],
      summary: 'Merge, reject, close or rebase a pull request',
      description:
        '`merge` applies the pull request’s changes to the timeline, entity by entity, as a new revision; `reject` declines it; both need write access. `close` withdraws it, by its author or a writer. `rebase` (author only) remakes it on the timeline’s current revision, keeping it open; a document pull request must be rebased before it can merge once upstream has changed. Fields changed on both sides refuse a merge or rebase with 409 and `conflicts` (field names such as `moment example.metadata.title`); nothing is saved. A resolved pull request cannot be reopened.',
      security: TIMELINE_WRITE,
      parameters: [timelineId, proposalId],
      requestBody: body({
        type: 'object',
        required: ['action', 'revision'],
        properties: {
          action: { type: 'string', enum: ['merge', 'reject', 'close', 'rebase'] },
          revision: {
            ...ref('Revision'),
            description: 'The pull request’s revision as last read (not the timeline’s).',
          },
        },
      }),
      responses: {
        200: json(ref('Proposal'), 'The pull request after the action.'),
        ...errors(400, 401, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/{proposal}/comments': {
    get: {
      operationId: 'listProposalComments',
      tags: [PULLS],
      summary: 'List comments on a pull request',
      description:
        'Comments oldest first, fifty at a time. Pass the previous page’s `next` as `after` for the next page.',
      security: TIMELINE_READ,
      parameters: [
        timelineId,
        proposalId,
        queryParam('after', 'Return comments after this comment ID (`0` for the first page).', {
          type: 'string',
          pattern: '^[0-9]{1,18}$',
          default: '0',
        }),
      ],
      responses: {
        200: json(ref('ProposalCommentPage')),
        ...errors(400, 403, 404, 409, 429),
      },
    },
    post: {
      operationId: 'createProposalComment',
      tags: [PULLS],
      summary: 'Comment on a pull request',
      description:
        'Adds a plain-text comment. Anyone signed in who can read the timeline may comment, on open and resolved pull requests alike. New accounts may first be asked for human verification (428).',
      security: TIMELINE_WRITE,
      parameters: [timelineId, proposalId],
      requestBody: body({
        type: 'object',
        required: ['body'],
        properties: {
          body: {
            type: 'string',
            minLength: 1,
            maxLength: 20000,
            description: 'The comment: 1–20,000 characters, not only spaces. Kept trimmed.',
          },
        },
      }),
      responses: {
        201: json(
          {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', pattern: '^\\d+$', description: 'The new comment’s ID.' },
            },
          },
          'The comment was added.',
        ),
        ...errors(400, 401, 403, 404, 413, 428, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/{proposal}/comments/search': {
    post: {
      operationId: 'searchProposalComments',
      tags: [PULLS],
      summary: 'List comments on a pull request, as a POST',
      description:
        'The same as `GET …/comments`, with `after` in the body, for the desktop app. Counts as a read for API keys.',
      security: TIMELINE_READ,
      parameters: [timelineId, proposalId],
      requestBody: body(
        {
          type: 'object',
          properties: {
            after: {
              type: 'string',
              pattern: '^[0-9]{1,18}$',
              default: '0',
              description: 'Return comments after this comment ID.',
            },
          },
        },
        { required: false },
      ),
      responses: {
        200: json(ref('ProposalCommentPage')),
        ...errors(400, 403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/proposals/{proposal}/comments/{comment}': {
    delete: {
      operationId: 'deleteProposalComment',
      tags: [PULLS],
      summary: 'Delete your comment',
      description: 'Deletes one of the caller’s own comments, at any time.',
      security: TIMELINE_WRITE,
      parameters: [
        timelineId,
        proposalId,
        pathParam('comment', 'The comment’s ID.', { type: 'string', pattern: '^[0-9]{1,18}$' }),
      ],
      responses: {
        200: json(ref('Ok'), 'Deleted.'),
        ...errors(401, 403, 404, 409, 429),
      },
    },
  },
};

const timestamp = { type: 'string', format: 'date-time' };
const revisionNumber = {
  type: 'integer',
  minimum: 1,
  description: 'A timeline revision, as a number (lists send it as a JSON number).',
};
const counts = (kinds) => ({
  type: 'object',
  properties: Object.fromEntries(kinds.map((k) => [k, { type: 'integer', minimum: 0 }])),
});

export const schemas = {
  TimelineSearchRequest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      search: {
        type: 'string',
        maxLength: 300,
        default: '',
        description:
          'Words to find, in web-search syntax (quoted phrases, `-exclusions`). Empty to browse.',
      },
      tag: {
        type: 'string',
        maxLength: 64,
        default: '',
        description: 'Only timelines with this tag (matched exactly, lowercased).',
      },
      owner: {
        type: 'string',
        maxLength: 64,
        default: '',
        description: 'Only timelines owned by this username.',
      },
      starredBy: {
        type: 'string',
        maxLength: 64,
        default: '',
        description:
          'Only timelines this username starred (their public favorites; none for an account that may be under 18). Only with the `public` scope.',
      },
      scope: {
        type: 'string',
        enum: ['public', 'mine', 'visible', 'starred'],
        default: 'public',
        description:
          '`public`: public timelines. `mine`: the caller’s own. `visible`: public ones and those shared with the caller. `starred`: those the caller starred. All but `public` need sign-in.',
      },
      visibility: {
        type: 'string',
        enum: ['', 'public', 'private'],
        default: '',
        description:
          'Only public or only private timelines; empty for both. Useful with the `mine`, `visible` and `starred` scopes (the `public` scope finds no private ones).',
      },
      sort: {
        type: 'string',
        enum: [
          'featured',
          'stars',
          'popularity',
          'trending',
          'alphabetical',
          'age',
          'updated',
          'relevance',
        ],
        description:
          'The order: `relevance` by default when there is `search` text, otherwise `featured` (featured first, then recently updated). `popularity` and `trending` (last 30 days) weigh stars and forks by the standing of who gave them; `age` is newest first and `updated` most recently changed first. Ties go to the most recently updated.',
      },
      page: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
    },
  },
  TimelineSearchResult: {
    type: 'object',
    description: 'A timeline found by a search: what a result card shows.',
    properties: {
      id: ref('Uuid'),
      slug: {
        type: ['string', 'null'],
        description: 'Its address under its owner (`/<owner>/<slug>`), if it has one.',
      },
      title: { type: 'string' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      visibility: { type: 'string', enum: ['public', 'private'] },
      owner: { type: 'string', description: 'The owner’s username.' },
      revision: revisionNumber,
      event_count: { type: 'integer', minimum: 0, description: 'How many moments it has.' },
      comparison: {
        type: ['object', 'null'],
        description: 'Set when it is a comparison of other timelines (a read-only live view).',
      },
      star_count: { type: 'string', pattern: '^\\d+$', description: 'Stars, as a decimal string.' },
      starred: { type: 'boolean', description: 'Whether the caller starred it.' },
      popularity: {
        type: 'string',
        description: 'Its popularity score (docs/browsing.md), as a decimal string.',
      },
      featured: { type: 'boolean' },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Its sensitive-content labels, its owner’s and moderators’.',
      },
      rank: { type: 'number', description: 'Its text-search rank; 0 without search text.' },
      created_at: timestamp,
      updated_at: timestamp,
    },
  },
  TimelineSearchPage: {
    type: 'object',
    required: ['timelines', 'total', 'page', 'limit', 'pages'],
    properties: {
      timelines: { type: 'array', items: ref('TimelineSearchResult') },
      total: { type: 'integer', minimum: 0, description: 'How many timelines match in all.' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1 },
      pages: { type: 'integer', minimum: 0 },
    },
  },
  CopyRequest: {
    type: 'object',
    required: ['revision'],
    additionalProperties: false,
    properties: {
      revision: {
        ...ref('Revision'),
        description: 'The timeline’s current revision; 409 when it has changed since.',
      },
    },
  },
  BrowserFork: {
    type: 'object',
    required: ['document', 'source', 'limits'],
    properties: {
      document: ref('TimelineDocument'),
      source: {
        type: 'object',
        description: 'What was copied.',
        properties: {
          id: ref('Uuid'),
          revision: ref('Revision'),
          savedRevision: { ...ref('Uuid'), description: 'The saved revision copied.' },
        },
      },
      limits: {
        type: 'object',
        description: 'The limits a browser copy is held to.',
        properties: {
          events: { type: 'integer', const: 5000 },
          bytes: { type: 'integer', const: 4194304 },
        },
      },
    },
  },
  HistoryRevision: {
    type: 'object',
    description: 'A saved checkpoint of a timeline.',
    properties: {
      id: { ...ref('Uuid'), description: 'The saved revision’s ID.' },
      number: {
        type: 'string',
        pattern: '^\\d+$',
        description: 'Its number in this timeline’s history; numbers can have gaps.',
      },
      kind: {
        type: 'string',
        enum: ['baseline', 'save', 'fork', 'duplicate', 'sync', 'merge', 'proposal', 'rebase'],
        description: 'What recorded it.',
      },
      author: { type: ['string', 'null'], description: 'Who saved it, by username.' },
      created_at: timestamp,
      parents: {
        type: 'array',
        maxItems: 2,
        items: ref('Uuid'),
        description: 'Its parent revisions: none, one, or two for a sync or merge.',
      },
      available: {
        type: 'boolean',
        description: 'Whether its content can be read: false for a past one not kept.',
      },
    },
  },
  HistoryPage: {
    type: 'object',
    required: ['revisions', 'page', 'more', 'keepHistory'],
    properties: {
      revisions: { type: 'array', maxItems: 20, items: ref('HistoryRevision') },
      page: { type: 'integer', minimum: 1 },
      more: { type: 'boolean', description: 'Whether there is a next page.' },
      keepHistory: { type: 'boolean', description: 'Whether the timeline keeps saved history.' },
    },
  },
  ProposalSummary: {
    type: 'object',
    description: 'A pull request as lists show it.',
    properties: {
      id: ref('Uuid'),
      title: { type: 'string' },
      status: { type: 'string', enum: ['open', 'merged', 'rejected', 'closed'] },
      author: { type: 'string', description: 'The author’s username.' },
      base_revision: { ...revisionNumber, description: 'The timeline revision it was made on.' },
      revision: { ...revisionNumber, description: 'The pull request’s own revision.' },
      created_at: timestamp,
      updated_at: timestamp,
    },
  },
  ProposalPage: {
    type: 'object',
    required: ['proposals', 'total', 'page', 'pages'],
    properties: {
      proposals: { type: 'array', items: ref('ProposalSummary') },
      total: { type: 'integer', minimum: 0 },
      page: { type: 'integer', minimum: 1 },
      pages: { type: 'integer', minimum: 0 },
    },
  },
  ProposalChanges: {
    type: 'object',
    description:
      'What a pull request changes from its base, computed from saved history. When either revision is no longer kept, nothing is counted and `unavailable` says why.',
    properties: {
      settings: {
        type: 'array',
        items: { type: 'string' },
        description: 'The timeline settings it changes (such as `title`, `tags`).',
      },
      moments: counts(['added', 'removed', 'changed']),
      durations: counts(['added', 'removed', 'changed']),
      relationships: counts(['added', 'removed']),
      examples: {
        type: 'array',
        description: 'The first thirty moments of each kind of change.',
        items: {
          type: 'object',
          properties: {
            change: { type: 'string', enum: ['added', 'removed', 'changed'] },
            before: { oneOf: [ref('Moment'), { type: 'null' }] },
            after: { oneOf: [ref('Moment'), { type: 'null' }] },
          },
        },
      },
      unavailable: { type: 'string', description: 'Why nothing could be counted.' },
    },
  },
  Proposal: {
    type: 'object',
    description: 'A pull request, with what it changes and what the caller may do with it.',
    properties: {
      id: ref('Uuid'),
      timeline_id: ref('Uuid'),
      author_id: ref('Uuid'),
      author: { type: 'string', description: 'The author’s username.' },
      title: { type: 'string' },
      body: { type: 'string', description: 'Its description, as plain text.' },
      status: { type: 'string', enum: ['open', 'merged', 'rejected', 'closed'] },
      revision: {
        ...ref('Revision'),
        description: 'The pull request’s own revision: send it with updates and resolutions.',
      },
      base_revision: { ...ref('Revision'), description: 'The timeline revision it is based on.' },
      base_revision_id: { ...ref('Uuid'), description: 'The saved revision it is based on.' },
      source_revision_id: {
        ...ref('Uuid'),
        description: 'The saved revision it proposes.',
      },
      source_timeline_id: {
        oneOf: [ref('Uuid'), { type: 'null' }],
        description: 'The fork it came from, if any.',
      },
      from_fork: { type: 'boolean' },
      resolved_by: { oneOf: [ref('Uuid'), { type: 'null' }] },
      merged_revision: {
        oneOf: [ref('Revision'), { type: 'null' }],
        description: 'The timeline revision its merge made.',
      },
      merged_revision_id: { oneOf: [ref('Uuid'), { type: 'null' }] },
      created_at: timestamp,
      updated_at: timestamp,
      changes: ref('ProposalChanges'),
      canMerge: { type: 'boolean' },
      canUpdate: { type: 'boolean' },
      canClose: { type: 'boolean' },
      upstreamRevision: {
        ...ref('Revision'),
        description:
          'The timeline’s current revision: a rebase is needed when it differs from `base_revision`.',
      },
      source: {
        type: ['object', 'null'],
        description: 'The source fork, when it came from one the caller can read.',
        properties: {
          id: ref('Uuid'),
          title: { type: 'string' },
          head_revision_id: ref('Uuid'),
          canWrite: { type: 'boolean' },
        },
      },
    },
  },
  ProposalInput: {
    description:
      'A pull request from a saved revision of a fork of this timeline, or as a whole proposed document.',
    oneOf: [
      {
        title: 'From a fork',
        type: 'object',
        required: ['title', 'body', 'sourceTimelineId', 'sourceRevisionId'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 300 },
          body: { type: 'string', maxLength: 20000, description: 'Its description; may be empty.' },
          sourceTimelineId: {
            ...ref('Uuid'),
            description: 'A fork of this timeline the caller can write to.',
          },
          sourceRevisionId: {
            ...ref('Uuid'),
            description: 'The fork’s saved revision to propose (from its history).',
          },
          revision: {
            ...ref('Revision'),
            description: 'With updates: the pull request’s revision.',
          },
        },
      },
      {
        title: 'A whole document',
        type: 'object',
        required: ['title', 'body', 'baseRevision', 'document'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 300 },
          body: { type: 'string', maxLength: 20000, description: 'Its description; may be empty.' },
          baseRevision: {
            ...ref('Revision'),
            description: 'The timeline revision the document was made on: its current one.',
          },
          document: ref('TimelineDocument'),
          revision: {
            ...ref('Revision'),
            description: 'With updates: the pull request’s revision.',
          },
        },
      },
    ],
  },
  ProposalUpdate: {
    description:
      'What opening a pull request takes, plus `revision`, the pull request’s revision as last read. A fork pull request names the same fork; a document one keeps its `baseRevision`.',
    allOf: [ref('ProposalInput'), { type: 'object', required: ['revision'] }],
  },
  ProposalComment: {
    type: 'object',
    properties: {
      id: { type: 'string', pattern: '^\\d+$' },
      author: { type: 'string', description: 'The author’s username.' },
      body: {
        type: 'string',
        description: 'The comment, as plain text; empty when moderators removed it.',
      },
      removed: { type: 'boolean', description: 'Whether moderators removed it.' },
      mine: { type: 'boolean', description: 'Whether the caller wrote it (and so may delete it).' },
      created_at: timestamp,
    },
  },
  ProposalCommentPage: {
    type: 'object',
    required: ['comments', 'next'],
    properties: {
      comments: { type: 'array', maxItems: 50, items: ref('ProposalComment') },
      next: {
        type: ['string', 'null'],
        description: 'Send as `after` for the next page; null on the last.',
      },
    },
  },
};
