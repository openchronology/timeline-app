// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The core timeline endpoints (#178): creating, reading, querying, saving, settings, sharing
 * with members and deleting timelines; SQLite file exchange; live revision updates; oEmbed.
 * Collaboration and versioning (stars, pull requests, forks, browser forks, sync, history,
 * search) are described in collaboration.mjs.
 */
import {
  ref,
  json,
  body,
  pathParam,
  queryParam,
  timelineId,
  errors,
  PUBLIC,
  TIMELINE_READ,
  TIMELINE_WRITE,
  SIGNED_IN,
} from './common.mjs';

/** Timeline reads that need an account: a session, or an API key with `timelines:read`. */
const SIGNED_IN_TIMELINE_READ = [{ session: [] }, { desktop: [] }, { apiKey: ['timelines:read'] }];

const error = (description) => json(ref('Error'), description);
const NOT_JSON = { 415: error('The body is not JSON (`Content-Type: application/json`).') };

/** An ID of a moment or duration. */
const ENTITY_ID = { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$', example: 'm1' };
const nullable = (schema) => ({ oneOf: [schema, { type: 'null' }] });
/** A count PostgreSQL gives as a decimal string (a bigint). */
const COUNT = { type: 'string', pattern: '^\\d+$', description: 'A count, as a decimal string.' };
const INPUT_TIME = {
  type: 'string',
  description:
    'An exact time in coordinates: a rational (`-3/2`), a finite decimal (`1.25`), or an ISO 8601 timestamp (one with a `T`), which is read as Unix seconds. Stored and returned as a canonical rational.',
  example: '1704067200',
};
const REVISION_BODY = {
  ...ref('Revision'),
  description: 'The revision the request was made on: the timeline’s current `revision`.',
};

export const tags = [
  {
    name: 'Timelines',
    description:
      'Server timelines: listing, creating, reading their metadata, saving whole documents, settings, members and deleting. API keys reach these with the `timelines:read` or `timelines:write` scope, and are rate-limited per key (120 requests a minute by default).',
  },
  {
    name: 'Timeline data',
    description:
      'Reading a timeline’s moments, durations and relationships a window at a time, downloading it whole, and changing parts of it: sparse saves, deleting a range, shifting and scaling times.',
  },
  {
    name: 'Files',
    description:
      'Converting between `.ochx` documents (JSON) and the desktop app’s SQLite `.och` files, which are at most 32 MiB. Only signed-in browser and desktop sessions may convert; API keys may not.',
  },
  {
    name: 'Live updates',
    description: 'Learning when timelines are saved, as a server-sent event stream.',
  },
  {
    name: 'Embeds',
    description: 'oEmbed for public timelines, so a pasted timeline link can show the timeline.',
  },
];

// ---------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------

export const schemas = {
  EntityMetadata: {
    type: 'object',
    description:
      'What a moment or duration says. The core reads `title`, `description`, `tags` and `content_labels`; plugins keep their own fields here, stored as given.',
    properties: {
      title: { type: 'string' },
      description: { type: 'string', description: 'Notes, in Markdown.' },
      tags: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 64 },
        maxItems: 40,
        description:
          'Tags, lowercased and trimmed when valid (1–64 characters, no commas or control characters, at most 40). Anything else is kept as ordinary metadata.',
      },
      content_labels: {
        type: 'array',
        items: { enum: ['nudity', 'violence', 'disturbing'] },
        description: 'Sensitive-content labels: readers are warned and its images blurred.',
      },
    },
  },
  Moment: {
    type: 'object',
    description: 'A point event (a moment).',
    required: ['id', 'time', 'metadata'],
    properties: {
      id: { ...ENTITY_ID, description: 'Unique among the timeline’s moments.' },
      time: { ...INPUT_TIME, example: '1704067200/1' },
      metadata: ref('EntityMetadata'),
    },
  },
  DurationEndpoint: {
    description: 'An exact time, or `{"moment": "<id>"}` to follow that moment’s time.',
    oneOf: [
      INPUT_TIME,
      {
        type: 'object',
        required: ['moment'],
        additionalProperties: false,
        properties: { moment: ENTITY_ID },
      },
    ],
  },
  Duration: {
    type: 'object',
    description:
      'A span of time. Either end may be a fixed time or follow a moment; anchors must name moments of the timeline.',
    required: ['id', 'start', 'end'],
    properties: {
      id: { ...ENTITY_ID, description: 'Unique among the timeline’s durations.' },
      start: ref('DurationEndpoint'),
      end: ref('DurationEndpoint'),
      metadata: {
        ...ref('EntityMetadata'),
        description: 'As a moment’s; `{}` when left out. It may not contain `durations`.',
      },
    },
  },
  DurationBand: {
    description: 'A duration placed on the timeline: its definition with both ends resolved.',
    allOf: [
      ref('Duration'),
      {
        type: 'object',
        properties: {
          startTime: ref('Rational'),
          endTime: ref('Rational'),
          first: { ...ref('Rational'), description: 'The earlier of its ends.' },
          last: { ...ref('Rational'), description: 'The later of its ends.' },
        },
      },
    ],
  },
  EntityRef: {
    description: 'A moment or a duration. Their IDs are separate, so a reference names the kind.',
    oneOf: [
      {
        type: 'object',
        required: ['moment'],
        additionalProperties: false,
        properties: { moment: ENTITY_ID },
      },
      {
        type: 'object',
        required: ['duration'],
        additionalProperties: false,
        properties: { duration: ENTITY_ID },
      },
    ],
  },
  Relationship: {
    type: 'object',
    description:
      'An undirected link between two different entities. Stored once, in canonical order; both must exist.',
    required: ['a', 'b'],
    additionalProperties: false,
    properties: { a: ref('EntityRef'), b: ref('EntityRef') },
  },
  EdgeBand: {
    type: 'object',
    description: 'A relationship placed on the timeline, as an arc between its ends’ times.',
    properties: {
      id: { type: 'string' },
      a: ref('EntityRef'),
      b: ref('EntityRef'),
      first: ref('Rational'),
      last: ref('Rational'),
      aTime: ref('Rational'),
      bTime: ref('Rational'),
    },
  },
  TimePresentation: {
    type: 'object',
    description: 'How the timeline’s coordinates read: as numbers, units or calendar dates.',
    required: ['version', 'mode', 'significantDigits', 'unit', 'scale', 'origin', 'offsetMinutes'],
    properties: {
      version: { const: 1 },
      mode: { enum: ['rational', 'float', 'scientific', 'si', 'gregorian', 'custom'] },
      significantDigits: { type: 'integer', minimum: 1, maximum: 30 },
      unit: { type: 'string', maxLength: 80 },
      scale: {
        type: 'string',
        maxLength: 8192,
        description: 'Stored coordinates per displayed unit: a positive exact number.',
      },
      origin: {
        type: 'string',
        maxLength: 8192,
        description: 'The stored coordinate of displayed zero.',
      },
      offsetMinutes: { type: 'integer', minimum: -1439, maximum: 1439 },
      adaptiveLabels: { type: 'boolean' },
      ruler: { type: 'object', description: 'Ruler tick policy.' },
      source: {
        type: 'string',
        description:
          'For `custom`: its source code. The server checks its syntax and never runs it.',
      },
    },
  },
  SavedComparison: {
    type: 'object',
    description:
      'A saved comparison: a read-only live view of two to eight timelines. It stores no moments or durations of its own.',
    required: ['sources', 'combined'],
    additionalProperties: false,
    properties: {
      sources: { type: 'array', items: ref('Uuid'), minItems: 2, maxItems: 8, uniqueItems: true },
      combined: { type: 'boolean', description: 'One combined track, or a track per source.' },
    },
  },
  ViewFilter: {
    description:
      'A separation: the entities with any of the tags (`any`) or none of them (`none`); or an entity and its relations, directly or through any number of links, or everything else.',
    oneOf: [
      {
        type: 'object',
        title: 'Tags',
        required: ['tags', 'mode'],
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 64 },
            minItems: 1,
            maxItems: 40,
          },
          mode: { enum: ['any', 'none'] },
        },
      },
      {
        type: 'object',
        title: 'Relationships',
        required: ['related', 'depth', 'mode'],
        properties: {
          related: ref('EntityRef'),
          depth: { enum: ['direct', 'all'] },
          mode: { enum: ['any', 'none'] },
        },
      },
    ],
  },
  TimelineDocument: {
    type: 'object',
    description:
      'An OpenChronology document, as in an `.ochx` file. Each kind of entry (moments, durations, relationships) is limited to the server’s entry limit, 200,000 by default. Unknown fields are dropped. The server stores no copies of images: it drops `assets` when it saves, and keeps them only in exports.',
    required: ['format', 'version', 'title', 'description', 'events'],
    properties: {
      format: { const: 'openchronology' },
      version: { const: 1 },
      title: { type: 'string', maxLength: 300 },
      description: { type: 'string', maxLength: 20000 },
      events: { type: 'array', items: ref('Moment'), description: 'Its moments; IDs unique.' },
      durations: { type: 'array', items: ref('Duration') },
      relationships: { type: 'array', items: ref('Relationship') },
      presentation: ref('TimePresentation'),
      plugins: {
        type: 'array',
        maxItems: 32,
        description:
          'Installed plugins (at most 128 KiB in all), each with its manifest. Their scripts must compile.',
        items: {
          type: 'object',
          required: ['manifest', 'enabled'],
          additionalProperties: false,
          properties: {
            manifest: { type: 'object', description: 'The plugin’s manifest (apiVersion 1).' },
            enabled: { type: 'boolean' },
          },
        },
      },
      tags: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 64 },
        maxItems: 40,
        description: 'The timeline’s tags: lowercased, without commas or control characters.',
      },
      assets: {
        type: 'object',
        maxProperties: 200,
        additionalProperties: {
          type: 'string',
          pattern: '^data:image/(png|jpeg|webp|gif);base64,',
        },
        description:
          'Copies of its images, by their HTTPS address: base64 data URIs of at most 2 MiB each and 8 MiB in all.',
      },
      comparison: ref('SavedComparison'),
    },
  },
  TimelineSettings: {
    type: 'object',
    description:
      'A timeline’s settings, as a document without its entries: what a sparse save keeps or changes.',
    required: ['format', 'version', 'title', 'description'],
    properties: {
      format: { const: 'openchronology' },
      version: { const: 1 },
      title: { type: 'string', maxLength: 300 },
      description: { type: 'string', maxLength: 20000 },
      presentation: ref('TimePresentation'),
      plugins: { type: 'array', maxItems: 32, items: { type: 'object' } },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 40 },
      assets: { type: 'object' },
    },
  },
  TimelineMetadata: {
    type: 'object',
    description:
      'A timeline as the caller may see it, with what they may do. It also carries internal fields of the server’s index (such as `root`, `index_version`, `duration_root`, `edge_root`), which clients should ignore.',
    properties: {
      id: ref('Uuid'),
      owner_id: ref('Uuid'),
      owner: { type: 'string', description: 'Its owner’s username.' },
      slug: {
        type: ['string', 'null'],
        description: 'Its address is `/<owner>/<slug>`; without one, `/<owner>/<id>`.',
      },
      title: { type: 'string' },
      description: { type: 'string' },
      visibility: { enum: ['private', 'public'] },
      revision: ref('Revision'),
      event_count: { ...COUNT, description: 'How many moments it has.' },
      event_generation: COUNT,
      star_count: COUNT,
      starred: { type: 'boolean', description: 'Whether the caller starred it.' },
      role: {
        enum: ['admin', 'owner', 'writer', 'editor', 'contributor', 'viewer', null],
        description: 'The caller’s role; null for a public timeline they have none in.',
      },
      presentation: nullable(ref('TimePresentation')),
      plugins: { type: ['array', 'null'], items: { type: 'object' } },
      tags: { type: ['array', 'null'], items: { type: 'string' } },
      assets: { type: ['object', 'null'] },
      comparison: nullable(ref('SavedComparison')),
      featured: { type: 'boolean' },
      upstream_id: {
        type: ['string', 'null'],
        format: 'uuid',
        description: 'The timeline this was forked from.',
      },
      fork_base_revision_id: { type: ['string', 'null'], format: 'uuid' },
      head_revision_id: { type: ['string', 'null'], format: 'uuid' },
      allow_private_forks: { type: 'boolean' },
      publication_restricted: {
        type: 'boolean',
        description: 'A copy of a private timeline, which must stay private.',
      },
      storage_bytes: COUNT,
      created_at: { type: ['string', 'null'], format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      retention_seconds: {
        type: ['string', 'null'],
        description: 'How long it keeps moments, in seconds as an exact rational; null for always.',
      },
      retention_applied_at: { type: ['string', 'null'], format: 'date-time' },
      retention_removed: { type: ['string', 'null'] },
      keep_history: { type: 'boolean', description: 'Whether it keeps saved history.' },
      history_since: { type: ['string', 'null'] },
      content_labels: { type: 'array', items: { type: 'string' } },
      moderator_labels: { type: 'array', items: { type: 'string' } },
      labels: {
        type: 'array',
        items: { enum: ['nudity', 'violence', 'disturbing'] },
        description: 'Its sensitive-content labels: its owner’s and moderators’.',
      },
      moderation: {
        type: ['object', 'null'],
        description: 'When moderators restricted it (seen only by its owner and administrators).',
        properties: {
          case: ref('Uuid'),
          reason: { type: 'string' },
          decided_at: { type: 'string', format: 'date-time' },
          appealed_at: { type: ['string', 'null'], format: 'date-time' },
          appeal_outcome: { type: ['string', 'null'] },
        },
      },
      preparing: {
        type: 'boolean',
        description:
          'A copy whose index is still being prepared: until it is ready, only its metadata, settings, sharing and deletion are available (others answer 409).',
      },
      canWrite: { type: 'boolean', description: 'May save it.' },
      canEdit: { type: 'boolean', description: 'May edit a copy of it (to save or propose).' },
      canPropose: { type: 'boolean', description: 'May open pull requests on it.' },
      canShare: { type: 'boolean', description: 'May manage its settings, members and deletion.' },
      canFork: { type: 'boolean' },
      first: {
        ...nullable(ref('Rational')),
        description: 'With `GET /api/timelines/{id}`: its earliest moment’s time.',
      },
      last: {
        ...nullable(ref('Rational')),
        description: 'With `GET /api/timelines/{id}`: its latest moment’s time.',
      },
    },
  },
  TimelineListItem: {
    type: 'object',
    description: 'A timeline the caller owns or is a member of.',
    properties: {
      id: ref('Uuid'),
      slug: { type: ['string', 'null'] },
      title: { type: 'string' },
      visibility: { enum: ['private', 'public'] },
      revision: ref('Revision'),
      event_count: COUNT,
      owner: { type: 'string', description: 'Its owner’s username.' },
      role: { enum: ['owner', 'writer', 'editor', 'contributor', 'viewer'] },
    },
  },
  TimelineWithDocument: {
    type: 'object',
    description: 'A timeline’s metadata and its whole document.',
    properties: { timeline: ref('TimelineMetadata'), document: ref('TimelineDocument') },
  },
  TimelineSettingsResult: {
    description: 'The timeline after a settings change.',
    allOf: [
      ref('TimelineMetadata'),
      {
        type: 'object',
        properties: {
          retention: {
            type: ['string', 'null'],
            description: 'Its retention period as its display writes it (such as `1 year`).',
          },
          history_bytes: {
            type: 'integer',
            description: 'The storage turning saved history off would free.',
          },
        },
      },
    ],
  },
  TimelineMember: {
    type: 'object',
    properties: {
      username: { type: 'string' },
      role: {
        enum: ['viewer', 'contributor', 'writer', 'editor'],
        description: '`editor` is an older name for `writer`.',
      },
    },
  },
  TimelineQuery: {
    description:
      'A bounded read of a timeline, by `kind`. With `revision`, a timeline saved since answers 409. A `filter` (for `events`, `durations` and `overview`) reads a separation of the timeline, built on first use.',
    oneOf: [
      {
        type: 'object',
        title: 'Moments in a range',
        required: ['kind'],
        properties: {
          kind: { const: 'events' },
          revision: ref('Revision'),
          lower: { ...ref('Rational'), description: 'The range’s lower end (inclusive).' },
          upper: { ...ref('Rational'), description: 'The range’s upper end (inclusive).' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
          after: {
            type: 'object',
            required: ['time', 'id'],
            description: 'The cursor: the previous page’s `next`.',
            properties: { time: ref('Rational'), id: ENTITY_ID },
          },
          id: {
            ...ENTITY_ID,
            description: 'Look up one moment, by its ID and its exact time given as `lower`.',
          },
          filter: ref('ViewFilter'),
        },
      },
      {
        type: 'object',
        title: 'Overview',
        description:
          'A summary of a range for drawing it: moments closer than `threshold` grouped, durations at least that long as bands (shorter ones summarized), and relationship arcs. The threshold is raised to at least a 1,024th of the range.',
        required: ['kind', 'lower', 'upper', 'threshold'],
        properties: {
          kind: { const: 'overview' },
          revision: ref('Revision'),
          lower: ref('Rational'),
          upper: ref('Rational'),
          threshold: { ...ref('Rational'), description: 'The grouping distance; nonnegative.' },
          filter: ref('ViewFilter'),
          plugins: {
            type: 'array',
            maxItems: 256,
            items: { type: 'object' },
            description:
              'Installed plugins to read moments’ metadata for, instead of the timeline’s own (for comparisons; at most 1 MiB).',
          },
        },
      },
      {
        type: 'object',
        title: 'Durations in a range',
        description: 'Durations wholly inside the range, in start order.',
        required: ['kind', 'lower', 'upper'],
        properties: {
          kind: { const: 'durations' },
          revision: ref('Revision'),
          lower: ref('Rational'),
          upper: ref('Rational'),
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          after: {
            type: 'object',
            required: ['first', 'id'],
            description: 'The cursor: the previous page’s `next`.',
            properties: { first: ref('Rational'), id: ENTITY_ID },
          },
          filter: ref('ViewFilter'),
        },
      },
      {
        type: 'object',
        title: 'Related entities',
        description: 'The moments and durations linked directly to an entity.',
        required: ['kind', 'entity'],
        properties: {
          kind: { const: 'related' },
          revision: ref('Revision'),
          entity: ref('EntityRef'),
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          after: {
            type: 'object',
            required: ['kind', 'id'],
            properties: { kind: { enum: ['moment', 'duration'] }, id: ENTITY_ID },
          },
        },
      },
      {
        type: 'object',
        title: 'Search',
        description:
          'Moments and durations matching words, 25 a page. Terms are lowercased words of letters and digits (at most eight); punctuation is never syntax.',
        required: ['kind', 'text'],
        properties: {
          kind: { const: 'search' },
          revision: ref('Revision'),
          text: { type: 'string', maxLength: 200 },
          page: { type: 'integer', minimum: 1, maximum: 4000, default: 1 },
          only: { const: 'moment', description: 'Leave out durations.' },
        },
      },
      {
        type: 'object',
        title: 'Tags',
        description: 'The tags its moments and durations use, most used first (at most 200).',
        required: ['kind'],
        properties: { kind: { const: 'tags' }, revision: ref('Revision') },
      },
      {
        type: 'object',
        title: 'One moment',
        required: ['kind', 'id'],
        properties: { kind: { const: 'moment' }, revision: ref('Revision'), id: ENTITY_ID },
      },
      {
        type: 'object',
        title: 'One duration',
        required: ['kind', 'id'],
        properties: { kind: { const: 'duration' }, revision: ref('Revision'), id: ENTITY_ID },
      },
    ],
  },
  TimelineQueryResult: {
    description: 'What the query `kind` reads. Each carries the timeline’s `revision`.',
    oneOf: [
      {
        type: 'object',
        title: 'Moments in a range',
        properties: {
          events: { type: 'array', items: ref('Moment') },
          next: {
            type: ['object', 'null'],
            description: 'The cursor for the next page (`after`); null on the last.',
            properties: { time: ref('Rational'), id: { type: 'string' } },
          },
          revision: ref('Revision'),
        },
      },
      {
        type: 'object',
        title: 'Overview',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              description:
                'Moments (and short durations) within the threshold of each other. A group of one moment carries its `id`, `title` and, when plugins are enabled, the `metadata` they show.',
              properties: {
                first: ref('Rational'),
                last: ref('Rational'),
                count: COUNT,
                distinct: { type: 'integer', description: 'How many distinct times.' },
                id: { type: 'string' },
                title: { type: 'string', maxLength: 512 },
                metadata: { type: 'object' },
                durationCount: COUNT,
                duration: ref('DurationBand'),
              },
            },
          },
          durations: { type: 'array', items: ref('DurationBand'), maxItems: 256 },
          durationsTruncated: { type: 'boolean' },
          edges: { type: 'array', items: ref('EdgeBand'), maxItems: 256 },
          edgesTruncated: { type: 'boolean' },
          threshold: { ...ref('Rational'), description: 'The threshold used.' },
          visitedNodes: { description: 'How many index nodes were read.' },
          revision: ref('Revision'),
        },
      },
      {
        type: 'object',
        title: 'Durations in a range',
        properties: {
          durations: { type: 'array', items: ref('DurationBand') },
          next: {
            type: ['object', 'null'],
            properties: { first: ref('Rational'), id: { type: 'string' } },
          },
          revision: ref('Revision'),
        },
      },
      {
        type: 'object',
        title: 'Related entities',
        properties: {
          related: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { enum: ['moment', 'duration'] },
                id: { type: 'string' },
                first: ref('Rational'),
                last: ref('Rational'),
                title: { type: 'string' },
              },
            },
          },
          next: {
            type: ['object', 'null'],
            properties: { kind: { enum: ['moment', 'duration'] }, id: { type: 'string' } },
          },
          reachable: {
            type: 'integer',
            description: 'On the first page: how many entities it reaches through any links.',
          },
          direct: { type: 'integer', description: 'On the first page: how many links it has.' },
          revision: ref('Revision'),
        },
      },
      {
        type: 'object',
        title: 'Search',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { enum: ['moment', 'duration'] },
                id: { type: 'string' },
                first: ref('Rational'),
                last: ref('Rational'),
                title: { type: 'string' },
                snippet: { type: 'string' },
              },
            },
          },
          total: COUNT,
          page: { type: 'integer' },
          revision: ref('Revision'),
        },
      },
      {
        type: 'object',
        title: 'Tags',
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'object',
              properties: { tag: { type: 'string' }, count: { type: 'integer' } },
            },
          },
          revision: ref('Revision'),
        },
      },
      {
        type: 'object',
        title: 'One moment',
        properties: { event: nullable(ref('Moment')), revision: ref('Revision') },
      },
      {
        type: 'object',
        title: 'One duration',
        properties: {
          duration: nullable(ref('Duration')),
          band: nullable(ref('DurationBand')),
          revision: ref('Revision'),
        },
      },
    ],
  },
  TimelineChanges: {
    type: 'object',
    description:
      'A sparse save: the settings, and only the moments, durations and relationships that changed. At most 5,000 changed moments and durations together, and 5,000 relationships.',
    required: ['revision', 'settings', 'changes'],
    properties: {
      revision: REVISION_BODY,
      settings: ref('TimelineSettings'),
      changes: {
        type: 'array',
        description: 'Changed moments: each the moment wanted, or null to delete it. IDs unique.',
        items: {
          type: 'object',
          required: ['id', 'event'],
          properties: { id: ENTITY_ID, event: nullable(ref('Moment')) },
        },
      },
      durationChanges: {
        type: 'array',
        description: 'Changed durations: each the duration wanted, or null to delete it.',
        items: {
          type: 'object',
          required: ['id', 'duration'],
          properties: { id: ENTITY_ID, duration: nullable(ref('Duration')) },
        },
      },
      relationshipChanges: {
        type: 'array',
        maxItems: 5000,
        description: 'Links to add (`related: true`) or remove (`related: false`).',
        items: {
          type: 'object',
          required: ['a', 'b', 'related'],
          properties: { a: ref('EntityRef'), b: ref('EntityRef'), related: { type: 'boolean' } },
        },
      },
      base: ref('SaveBase'),
    },
  },
  SaveBase: {
    type: 'object',
    description:
      'What the edits were made on, so that a save on an older revision merges with what was saved since (field by field). With it, the save is checked against it even on the latest revision; a change or setting left out of it applies as sent. Conflicts answer 409 with `conflicts`, `{kind: "moment" | "duration" | "setting", id, title}`, and save nothing.',
    properties: {
      settings: {
        type: 'object',
        description: 'The settings as loaded: any of these.',
        additionalProperties: false,
        properties: {
          title: {},
          description: {},
          tags: {},
          presentation: {},
          plugins: {},
          assets: {},
        },
      },
      moments: {
        type: 'array',
        maxItems: 5000,
        items: {
          type: 'object',
          required: ['id', 'event'],
          properties: {
            id: ENTITY_ID,
            event: { type: ['object', 'null'], description: 'As loaded; null for one added.' },
          },
        },
      },
      durations: {
        type: 'array',
        maxItems: 5000,
        items: {
          type: 'object',
          required: ['id', 'duration'],
          properties: {
            id: ENTITY_ID,
            duration: { type: ['object', 'null'], description: 'As loaded; null for one added.' },
          },
        },
      },
    },
  },
  TimeMapping: {
    type: 'object',
    description:
      'Each time becomes `(time − around) × scale + around + offset`, exactly. Numbers are exact rationals or finite decimals as text (at most 4,000 characters).',
    required: ['scale', 'offset'],
    properties: {
      scale: { type: 'string', description: 'Positive.', example: '2' },
      offset: { type: 'string', example: '86400' },
      around: { type: 'string', default: '0', description: 'The point to scale around.' },
    },
  },
  OEmbed: {
    type: 'object',
    description: 'An oEmbed 1.0 `rich` response.',
    properties: {
      version: { const: '1.0' },
      type: { const: 'rich' },
      provider_name: { type: 'string' },
      provider_url: { type: 'string', format: 'uri' },
      title: { type: 'string' },
      author_name: { type: 'string', description: 'The owner’s username.' },
      author_url: { type: 'string', format: 'uri' },
      html: { type: 'string', description: 'An `<iframe>` of the timeline’s embed page.' },
      width: { type: 'integer', minimum: 200, maximum: 800 },
      height: { type: 'integer', minimum: 160, maximum: 480 },
      thumbnail_url: {
        type: 'string',
        format: 'uri',
        description: 'Left out for a timeline with sensitive-content labels.',
      },
      thumbnail_width: { const: 1200 },
      thumbnail_height: { const: 630 },
      cache_age: { const: 3600 },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

const SQLITE = 'application/vnd.openchronology.sqlite';
const sqliteFile = (description) => ({
  description,
  headers: {
    'Content-Disposition': {
      description: '`attachment; filename="timeline.och"`',
      schema: { type: 'string' },
    },
  },
  content: { [SQLITE]: { schema: { type: 'string', contentMediaType: SQLITE } } },
});

const metadataOk = (description) => json(ref('TimelineMetadata'), description);

export const paths = {
  '/api/timelines': {
    get: {
      operationId: 'listTimelines',
      tags: ['Timelines'],
      summary: 'List your timelines',
      description:
        'The timelines the caller owns or is a member of, most recently updated first (at most 100). Timelines moderators restricted are listed only for their owner.',
      security: SIGNED_IN_TIMELINE_READ,
      responses: {
        200: json(
          {
            type: 'object',
            properties: { timelines: { type: 'array', items: ref('TimelineListItem') } },
          },
          'Your timelines.',
        ),
        ...errors(401, 403, 429),
      },
    },
    post: {
      operationId: 'createTimeline',
      tags: ['Timelines'],
      summary: 'Create a timeline',
      description:
        'Creates a private timeline from a document (at most 16 MiB of JSON), owned by the caller. Accounts that may not supply data (read-only accounts) are refused with 403.',
      security: TIMELINE_WRITE,
      requestBody: body(ref('TimelineDocument')),
      responses: {
        201: metadataOk('The new timeline.'),
        ...errors(400, 401, 403, 413, 429, 503),
        ...NOT_JSON,
      },
    },
  },
  '/api/timelines/usage': {
    get: {
      operationId: 'getStorageUsage',
      tags: ['Timelines'],
      summary: 'Get your storage use',
      description:
        'The storage the account (or the API key’s owner) uses and may use, so that importers can check that an import fits before writing.',
      security: SIGNED_IN_TIMELINE_READ,
      responses: {
        200: json(
          {
            type: 'object',
            properties: {
              usedBytes: { type: 'integer' },
              quotaBytes: {
                type: ['integer', 'null'],
                description: 'Null when no quota applies.',
              },
            },
          },
          'Storage used and allowed.',
        ),
        ...errors(401, 403, 429),
      },
    },
  },
  '/api/timelines/{id}': {
    parameters: [timelineId],
    get: {
      operationId: 'getTimeline',
      tags: ['Timelines'],
      summary: 'Get a timeline’s metadata',
      description:
        'Its metadata, the caller’s permissions, and the times of its first and last moments. Available while a copy is being prepared.',
      security: TIMELINE_READ,
      responses: {
        200: metadataOk('The timeline.'),
        ...errors(403, 404, 429),
      },
    },
    put: {
      operationId: 'saveTimeline',
      tags: ['Timelines'],
      summary: 'Save a whole document',
      description:
        'Replaces the timeline’s content with a document (at most 16 MiB of JSON), for writers. A `revision` other than the current one is refused with 409: fetch the timeline again and reconcile. For large timelines, save only what changed (`PUT /api/timelines/{id}/changes`).',
      security: TIMELINE_WRITE,
      requestBody: body({
        type: 'object',
        required: ['revision', 'document'],
        properties: { revision: REVISION_BODY, document: ref('TimelineDocument') },
      }),
      responses: {
        200: metadataOk('The timeline as saved.'),
        ...errors(400, 401, 403, 404, 409, 413, 429, 503),
        ...NOT_JSON,
      },
    },
    delete: {
      operationId: 'deleteTimeline',
      tags: ['Timelines'],
      summary: 'Delete a timeline',
      description:
        'Deletes the timeline and its saved history, for its owner (or an administrator).',
      security: TIMELINE_WRITE,
      responses: {
        200: json(ref('Ok'), 'Deleted.'),
        ...errors(403, 404, 429),
      },
    },
  },
  '/api/timelines/{id}/revision': {
    parameters: [timelineId],
    get: {
      operationId: 'getTimelineRevision',
      tags: ['Timelines'],
      summary: 'Get a timeline’s current revision',
      description: 'A cheap check of whether a timeline was saved since it was read.',
      security: TIMELINE_READ,
      responses: {
        200: json(
          {
            type: 'object',
            properties: { id: ref('Uuid'), revision: ref('Revision') },
          },
          'Its revision.',
        ),
        ...errors(403, 404, 429),
      },
    },
  },
  '/api/timelines/{id}/settings': {
    parameters: [timelineId],
    patch: {
      operationId: 'updateTimelineSettings',
      tags: ['Timelines'],
      summary: 'Change a timeline’s settings',
      description:
        'For its owner (or an administrator): any of its visibility, private forking policy, retention period, whether it keeps saved history, sensitive-content labels and address. Turning saved history off deletes past revisions at once, apart from those forks and pull requests still use. A timeline goes public only if moderators have not restricted it, it is not a copy of a private timeline, and (for a comparison) all its sources are public. Changing anything but the address saves a new revision.',
      security: TIMELINE_WRITE,
      requestBody: body({
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          visibility: { enum: ['private', 'public'] },
          allowPrivateForks: {
            type: 'boolean',
            description: 'Whether those with access may fork it while it is private.',
          },
          retention: {
            type: ['string', 'null'],
            maxLength: 200,
            description:
              'How long to keep moments, as the timeline’s display writes durations (such as `1 year`): at least an hour, at most 1,000 years. It needs a calendar (Gregorian) display. Null or empty keeps everything. What falls outside it is deleted for good.',
          },
          keepHistory: { type: 'boolean' },
          labels: {
            type: 'array',
            uniqueItems: true,
            items: { enum: ['nudity', 'violence', 'disturbing'] },
            description: 'What the owner marks it as containing. Moderators’ labels stay.',
          },
          slug: {
            type: ['string', 'null'],
            description:
              'Its address, `/<owner>/<slug>`: 1–64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit (trimmed and lowercased first). Null or empty removes it. Its former slug keeps leading to it until another of the owner’s timelines takes it.',
          },
        },
      }),
      responses: {
        200: json(ref('TimelineSettingsResult'), 'The timeline with its new settings.'),
        ...errors(400, 401, 403, 404, 409, 429),
        ...NOT_JSON,
      },
    },
  },
  '/api/timelines/{id}/members': {
    parameters: [timelineId],
    get: {
      operationId: 'listTimelineMembers',
      tags: ['Timelines'],
      summary: 'List a timeline’s members',
      description: 'For its owner (or an administrator).',
      security: TIMELINE_READ,
      responses: {
        200: json(
          {
            type: 'object',
            properties: { members: { type: 'array', items: ref('TimelineMember') } },
          },
          'Its members, by username.',
        ),
        ...errors(403, 404, 429),
      },
    },
    post: {
      operationId: 'setTimelineMember',
      tags: ['Timelines'],
      summary: 'Add a member or change their role',
      description:
        'For its owner (or an administrator). Viewers read a private timeline, contributors may also propose changes, writers may also save.',
      security: TIMELINE_WRITE,
      requestBody: body({
        type: 'object',
        required: ['username', 'role'],
        properties: {
          username: { type: 'string', description: 'Case is ignored.' },
          role: {
            enum: ['viewer', 'contributor', 'writer', 'editor'],
            description: '`editor` is taken as `writer`.',
          },
        },
      }),
      responses: {
        200: json(ref('Ok'), 'Done.'),
        ...errors(400, 401, 403, 404, 429),
        ...NOT_JSON,
      },
    },
    delete: {
      operationId: 'removeTimelineMember',
      tags: ['Timelines'],
      summary: 'Remove a member',
      description: 'For its owner (or an administrator). The body names the member.',
      security: TIMELINE_WRITE,
      requestBody: body({
        type: 'object',
        required: ['username'],
        properties: { username: { type: 'string' } },
      }),
      responses: {
        200: json(ref('Ok'), 'Done.'),
        ...errors(403, 404, 429),
        ...NOT_JSON,
      },
    },
  },
  '/api/timelines/{id}/document': {
    parameters: [timelineId],
    get: {
      operationId: 'getTimelineDocument',
      tags: ['Timeline data'],
      summary: 'Download a timeline whole',
      description:
        'Its metadata and whole document, streamed as it is read (moments by ID, durations by start). With `download=1`, the document alone, as an `.ochx` file named after its title. Guests get public timelines only, through the browser fork limits (5,000 entries, 4 MiB) and its rate limit; larger timelines are read a window at a time with `POST /api/timelines/{id}/query`.',
      security: TIMELINE_READ,
      parameters: [
        queryParam('download', 'With `1`: the document alone, as an attachment.', {
          enum: ['1'],
        }),
      ],
      responses: {
        200: {
          description: 'The timeline and its document; with `download=1`, the document alone.',
          headers: {
            'Content-Disposition': {
              description: 'With `download=1`: `attachment; filename="<title>.ochx"`.',
              schema: { type: 'string' },
            },
          },
          content: {
            'application/json': {
              schema: { oneOf: [ref('TimelineWithDocument'), ref('TimelineDocument')] },
            },
          },
        },
        ...errors(403, 404, 409, 413, 429),
      },
    },
  },
  '/api/timelines/{id}/export/{name}.ochx': {
    parameters: [
      timelineId,
      pathParam('name', 'The file name to save it as.', {
        type: 'string',
        pattern: '^[a-z0-9-]{1,70}$',
      }),
    ],
    get: {
      operationId: 'exportTimeline',
      tags: ['Timeline data'],
      summary: 'Download a timeline as an .ochx file',
      description:
        'The document alone, streamed, as an attachment named by the end of the address (so browsers that name downloads after their address name it too). For signed-in callers.',
      security: SIGNED_IN_TIMELINE_READ,
      responses: {
        200: {
          description: 'The document.',
          headers: {
            'Content-Disposition': {
              description: '`attachment; filename="<name>.ochx"`',
              schema: { type: 'string' },
            },
          },
          content: { 'application/json': { schema: ref('TimelineDocument') } },
        },
        ...errors(401, 403, 404, 409, 429),
      },
    },
  },
  '/api/timelines/{id}/file': {
    parameters: [timelineId],
    get: {
      operationId: 'getTimelineFile',
      tags: ['Timeline data'],
      summary: 'Download a timeline as a SQLite file',
      description:
        'The timeline as a desktop `.och` file (at most 32 MiB), for signed-in callers; ten a minute per client address. Comparisons cannot be downloaded: download their sources.',
      security: SIGNED_IN_TIMELINE_READ,
      responses: {
        200: sqliteFile('The SQLite file.'),
        ...errors(401, 403, 404, 409, 413, 429, 503),
        422: error('Converting it took too long.'),
      },
    },
  },
  '/api/timelines/{id}/query': {
    parameters: [timelineId],
    post: {
      operationId: 'queryTimeline',
      tags: ['Timeline data'],
      summary: 'Read part of a timeline',
      description:
        'Reads a bounded part of a timeline, by `kind`: moments in a range a page at a time, an overview of a range for drawing it, durations in a range, one moment or duration, the entities related to one, a search of its moments and durations, or the tags it uses. A read, so API keys need only `timelines:read` and sessions no CSRF token. Comparisons are read through their sources (409).',
      security: TIMELINE_READ,
      requestBody: body(ref('TimelineQuery')),
      responses: {
        200: json(ref('TimelineQueryResult'), 'What the query reads.'),
        ...errors(400, 403, 404, 409, 429, 503),
        ...NOT_JSON,
      },
    },
  },
  '/api/timelines/{id}/recent': {
    parameters: [timelineId],
    get: {
      operationId: 'getRecentTimes',
      tags: ['Timeline data'],
      summary: 'Get a timeline’s latest times',
      description:
        'The last (or first) eight distinct times its moments have, latest (or earliest) first: for following a timeline that grows at one end.',
      security: TIMELINE_READ,
      parameters: [
        queryParam('direction', 'Which end to read.', { enum: ['last', 'first'], default: 'last' }),
      ],
      responses: {
        200: json(
          {
            type: 'object',
            properties: {
              revision: ref('Revision'),
              event_generation: COUNT,
              times: { type: 'array', items: ref('Rational'), maxItems: 8 },
            },
          },
          'Its times.',
        ),
        ...errors(400, 403, 404, 409, 429),
      },
    },
  },
  '/api/timelines/{id}/changes': {
    parameters: [timelineId],
    put: {
      operationId: 'saveTimelineChanges',
      tags: ['Timeline data'],
      summary: 'Save what changed',
      description:
        'A sparse save, for writers: the settings and only the changed moments, durations and relationships (at most 5,000 moments and durations, and 5,000 relationships, per request; at most 16 MiB). Small changes apply in place. Without `base`, a stale `revision` is refused with 409; with it, the save merges onto what was saved since, and conflicts answer 409 with `conflicts`. A save the server stops as too slow answers 503: send fewer changes at a time.',
      security: TIMELINE_WRITE,
      requestBody: body(ref('TimelineChanges')),
      responses: {
        200: metadataOk('The timeline as saved.'),
        ...errors(400, 401, 403, 404, 409, 413, 429, 503),
        ...NOT_JSON,
      },
    },
  },
  '/api/timelines/{id}/delete-range': {
    parameters: [timelineId],
    post: {
      operationId: 'deleteTimelineRange',
      tags: ['Timeline data'],
      summary: 'Delete everything in a range',
      description:
        'Deletes every moment from `lower` to `upper` (both included) and the durations wholly inside, as one save, for writers. Durations that followed a deleted moment keep its time; links of deleted entities go. At most 200,000 moments at a time: `more: true` means send it again for the rest.',
      security: TIMELINE_WRITE,
      requestBody: body({
        type: 'object',
        required: ['revision', 'lower', 'upper'],
        properties: {
          revision: REVISION_BODY,
          lower: { ...ref('Rational'), description: 'Exact stored coordinate; at most `upper`.' },
          upper: ref('Rational'),
        },
      }),
      responses: {
        200: json(
          {
            type: 'object',
            properties: {
              removed: {
                type: 'object',
                properties: {
                  moments: { type: 'integer' },
                  durations: { type: 'integer' },
                },
              },
              more: { type: 'boolean', description: 'Whether the range holds more to delete.' },
              timeline: ref('TimelineMetadata'),
            },
          },
          'What was deleted, and the timeline afterwards.',
        ),
        ...errors(400, 401, 403, 404, 409, 413, 429, 503),
        ...NOT_JSON,
      },
    },
  },
  '/api/timelines/{id}/map-times': {
    parameters: [timelineId],
    post: {
      operationId: 'mapTimelineTimes',
      tags: ['Timeline data'],
      summary: 'Shift and scale times',
      description:
        'Shifts and scales the times of every moment and duration, or of those a filter selects, for good, as one save, for writers. A duration’s fixed ends are mapped; ends that follow a moment move with it. A stale `revision` and comparisons are refused with 409. Other saves wait until it finishes; it carries on if the client goes away. With `Accept: application/x-ndjson`, the reply streams JSON lines as it works: `{"progress": …}` (`{"reading": true}`, `{"done", "total"}`, or `{"rebuilding": stage, "done", "total"}`), then `{"result": …}`, or `{"error": {"status", "message"}}` for a failure once streaming. Without it, the reply is the result alone.',
      security: TIMELINE_WRITE,
      requestBody: body({
        type: 'object',
        required: ['revision', 'mapping'],
        properties: {
          revision: REVISION_BODY,
          mapping: ref('TimeMapping'),
          filter: { ...ref('ViewFilter'), description: 'Without it, everything moves.' },
        },
      }),
      responses: {
        200: {
          description: 'How many moments and durations moved, and the timeline as saved.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  moved: {
                    type: 'object',
                    properties: {
                      moments: { type: 'integer' },
                      durations: { type: 'integer' },
                    },
                  },
                  timeline: ref('TimelineMetadata'),
                },
              },
            },
            'application/x-ndjson': {
              schema: {
                type: 'string',
                description: 'JSON lines: progress, then the result or an error.',
              },
              example:
                '{"progress":{"reading":true}}\n{"progress":{"done":5000,"total":20001}}\n{"result":{"moved":{"moments":20000,"durations":1},"timeline":{}}}\n',
            },
          },
        },
        ...errors(400, 401, 403, 404, 409, 413, 429, 503),
        ...NOT_JSON,
      },
    },
  },
  '/api/files/import': {
    post: {
      operationId: 'importSqliteFile',
      tags: ['Files'],
      summary: 'Read a SQLite timeline file',
      description:
        'Converts a desktop `.och` SQLite file (at most 32 MiB) to a document, without saving anything. Ten conversions a minute per account; two at once per server.',
      security: SIGNED_IN,
      requestBody: {
        required: true,
        content: {
          [SQLITE]: { schema: { type: 'string', contentMediaType: SQLITE } },
          'application/octet-stream': { schema: { type: 'string', contentMediaType: SQLITE } },
        },
      },
      responses: {
        200: json(
          { type: 'object', properties: { document: ref('TimelineDocument') } },
          'The file’s document.',
        ),
        ...errors(400, 401, 403, 413, 429, 503),
        415: error('The body is not a SQLite timeline file.'),
        422: error('Converting it took too long.'),
      },
    },
  },
  '/api/files/export': {
    post: {
      operationId: 'exportSqliteFile',
      tags: ['Files'],
      summary: 'Write a SQLite timeline file',
      description:
        'Converts a document (at most 16 MiB of JSON) to a desktop `.och` SQLite file (at most 32 MiB), keeping the images it embeds. Ten conversions a minute per account; two at once per server.',
      security: SIGNED_IN,
      requestBody: body(ref('TimelineDocument')),
      responses: {
        200: sqliteFile('The SQLite file.'),
        ...errors(400, 401, 403, 413, 429, 503),
        ...NOT_JSON,
        422: error('Converting it took too long.'),
      },
    },
  },
  '/api/live': {
    get: {
      operationId: 'followTimelines',
      tags: ['Live updates'],
      summary: 'Follow timelines’ revisions',
      description:
        'A server-sent event stream of the revisions of one to eight timelines the caller may read. Each starts with a `revision` event per timeline, then one each time it is saved: `event: revision` with `{"id", "revision"}`. If the caller’s access to one changes, or their session does, an `event: access` with `{"error"}` (and the timeline’s `id`) ends the stream: connect again. A comment line every 25 seconds keeps it open. API keys and other origins are refused.',
      security: PUBLIC,
      parameters: [
        queryParam(
          'timelines',
          'One to eight timeline IDs, separated by commas.',
          { type: 'string', example: '6f1c4e2a-9b3d-4c5e-8f70-112233445566' },
          true,
        ),
      ],
      responses: {
        200: {
          description: 'The event stream.',
          content: {
            'text/event-stream': {
              schema: { type: 'string' },
              example:
                'event: revision\ndata: {"id":"6f1c4e2a-9b3d-4c5e-8f70-112233445566","revision":"12"}\n\n: heartbeat\n\n',
            },
          },
        },
        ...errors(400, 403, 404, 503),
      },
    },
  },
  '/api/oembed': {
    get: {
      operationId: 'getOEmbed',
      tags: ['Embeds'],
      summary: 'Get the oEmbed of a timeline link',
      description:
        'For a link to a public timeline on this site (its page, or one of its moments’ or durations’), the HTML to embed it. Cached for an hour; open to other origins.',
      security: PUBLIC,
      parameters: [
        queryParam(
          'url',
          'The link: `/timelines/<id>` or `/<owner>/<slug or id>`, optionally followed by `/moments/<id>` or `/durations/<id>`, or a link fragment.',
          { type: 'string', format: 'uri' },
          true,
        ),
        queryParam('format', 'Only `json` is available.', { const: 'json', default: 'json' }),
        queryParam('maxwidth', 'The widest it may be; at most 800 is given.', {
          type: 'integer',
          minimum: 1,
        }),
        queryParam('maxheight', 'The tallest it may be; at most 480 is given.', {
          type: 'integer',
          minimum: 1,
        }),
      ],
      responses: {
        200: json(ref('OEmbed'), 'The embed.'),
        ...errors(400, 404),
        501: error('Not the json format, or less room than 200 × 160.'),
      },
    },
  },
};
