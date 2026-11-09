// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The HTTP API's description (#178) of saved views (#550; saved-views.mjs, docs/views.md):
 * named separations of a timeline, shared, forked, duplicated and reassigned.
 */
import {
  ref,
  json,
  body,
  pathParam,
  timelineId,
  errors,
  PUBLIC,
  TIMELINE_READ,
  SIGNED_IN_READ,
  SIGNED_IN,
} from './common.mjs';

const VIEWS = 'Views';

export const tags = [
  {
    name: VIEWS,
    description:
      'Saved views: named configurations of separations of a timeline, private or public, shared with members, forked, duplicated and reassigned to other timelines as templates (docs/views.md).',
  },
];

const viewId = pathParam('id', "The view's ID.", ref('Uuid'));
const member = {
  type: 'object',
  required: ['username', 'role'],
  additionalProperties: false,
  properties: {
    username: { type: 'string' },
    role: { enum: ['viewer', 'editor'] },
  },
};
const members = json({
  type: 'object',
  required: ['members'],
  properties: { members: { type: 'array', items: member } },
});
const copy = (fork) => ({
  post: {
    operationId: fork ? 'forkView' : 'duplicateView',
    tags: [VIEWS],
    summary: fork ? 'Fork a view' : 'Duplicate a view',
    description: fork
      ? 'Makes a private copy of a view someone else owns, which remembers the view it came from (`upstream`) while that exists. Of the same timeline, or of `timeline` (which the account must be able to read).'
      : 'Makes a private copy of a view the account can read, its own included, with no link back. Of the same timeline, or of `timeline`.',
    security: SIGNED_IN,
    parameters: [viewId],
    requestBody: body(
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          timeline: { ...ref('Uuid'), description: 'The timeline the copy is of.' },
        },
      },
      { required: false },
    ),
    responses: {
      201: json(ref('SavedView'), 'The copy.'),
      ...errors(400, 401, 403, 404, 409, 429),
    },
  },
});

export const paths = {
  '/api/timelines/{id}/views': {
    get: {
      operationId: 'listTimelineViews',
      tags: [VIEWS],
      summary: 'List a timeline’s views',
      description:
        'The views of a timeline the reader may see: their own, those shared with them, and public ones. The timeline’s default view comes first (`isDefault`), then the rest by title.',
      security: TIMELINE_READ,
      parameters: [timelineId],
      responses: {
        200: json({
          type: 'object',
          required: ['views'],
          properties: {
            views: {
              type: 'array',
              maxItems: 500,
              items: {
                allOf: [
                  ref('SavedView'),
                  { type: 'object', properties: { isDefault: { type: 'boolean' } } },
                ],
              },
            },
          },
        }),
        ...errors(404),
      },
    },
  },
  '/api/views': {
    get: {
      operationId: 'listMyViews',
      tags: [VIEWS],
      summary: 'List your views',
      description:
        'The account’s own views and those shared with it, of any timeline: templates to copy to another. The 200 most recently changed.',
      security: SIGNED_IN_READ,
      responses: {
        200: json({
          type: 'object',
          required: ['views'],
          properties: { views: { type: 'array', items: ref('SavedView') } },
        }),
        ...errors(401),
      },
    },
    post: {
      operationId: 'createView',
      tags: [VIEWS],
      summary: 'Save a view',
      description:
        'Saves a separation as a view of a timeline the account can read (or of none). Private unless `visibility` says public. An account keeps at most 500 views.',
      security: SIGNED_IN,
      requestBody: body({
        type: 'object',
        required: ['title', 'separation'],
        additionalProperties: false,
        properties: {
          timeline: { ...ref('Uuid'), description: 'The timeline it is a view of.' },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 2000 },
          visibility: { enum: ['private', 'public'] },
          separation: ref('ViewSeparation'),
        },
      }),
      responses: { 201: json(ref('SavedView'), 'The view.'), ...errors(400, 401, 404, 409, 429) },
    },
  },
  '/api/views/{id}': {
    get: {
      operationId: 'getView',
      tags: [VIEWS],
      summary: 'Read a view',
      description:
        'A view, for its owner and members, or anyone who may read its timeline when it is public.',
      security: PUBLIC,
      parameters: [viewId],
      responses: { 200: json(ref('SavedView')), ...errors(404) },
    },
    put: {
      operationId: 'updateView',
      tags: [VIEWS],
      summary: 'Change a view',
      description:
        'Changes a view’s title, description or separation, or reassigns it to another timeline the account can read (its owner and editors). Only its owner changes its visibility. Timelines whose default view names it open as it now is.',
      security: SIGNED_IN,
      parameters: [viewId],
      requestBody: body({
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 2000 },
          visibility: { enum: ['private', 'public'] },
          separation: ref('ViewSeparation'),
          timeline: {
            oneOf: [ref('Uuid'), { type: 'null' }],
            description: 'Reassigns it: the timeline it is a view of.',
          },
        },
      }),
      responses: { 200: json(ref('SavedView')), ...errors(400, 401, 403, 404, 429) },
    },
    delete: {
      operationId: 'deleteView',
      tags: [VIEWS],
      summary: 'Delete a view',
      description:
        'Deletes a view (its owner). Timelines whose default view named it open with their own copy of its separation.',
      security: SIGNED_IN,
      parameters: [viewId],
      responses: {
        200: json({ type: 'object', required: ['ok'], properties: { ok: { const: true } } }),
        ...errors(401, 403, 404, 429),
      },
    },
  },
  '/api/views/{id}/fork': copy(true),
  '/api/views/{id}/duplicate': copy(false),
  '/api/views/{id}/members': {
    get: {
      operationId: 'listViewMembers',
      tags: [VIEWS],
      summary: 'List those a view is shared with',
      description: 'The accounts a view is shared with, for anyone who may read it.',
      security: PUBLIC,
      parameters: [viewId],
      responses: { 200: members, ...errors(404) },
    },
    post: {
      operationId: 'shareView',
      tags: [VIEWS],
      summary: 'Share a view',
      description:
        'Shares a view with an account as a viewer (reads it) or an editor (also changes and reassigns it), or changes its role. Its owner only.',
      security: SIGNED_IN,
      parameters: [viewId],
      requestBody: body(member),
      responses: { 200: members, ...errors(400, 401, 403, 404, 429) },
    },
    delete: {
      operationId: 'unshareView',
      tags: [VIEWS],
      summary: 'Stop sharing a view',
      description: 'Stops sharing a view with an account. Its owner only.',
      security: SIGNED_IN,
      parameters: [viewId],
      requestBody: body({
        type: 'object',
        required: ['username'],
        properties: { username: { type: 'string' } },
      }),
      responses: { 200: members, ...errors(401, 403, 404, 429) },
    },
  },
};

export const schemas = {
  SavedView: {
    type: 'object',
    description: 'A saved view, with what the reader may do with it.',
    required: ['id', 'title', 'description', 'visibility', 'separation', 'owner', 'role'],
    properties: {
      id: ref('Uuid'),
      title: { type: 'string' },
      description: { type: 'string' },
      visibility: { enum: ['private', 'public'] },
      separation: ref('ViewSeparation'),
      timeline: {
        oneOf: [
          {
            type: 'object',
            required: ['id', 'title'],
            properties: { id: ref('Uuid'), title: { type: 'string' } },
          },
          { type: 'null' },
        ],
        description: 'The timeline it is a view of; null once that is deleted.',
      },
      owner: { type: 'string', description: 'Its owner’s username.' },
      upstream: {
        oneOf: [
          {
            type: 'object',
            required: ['id', 'title'],
            properties: { id: ref('Uuid'), title: { type: 'string' } },
          },
          { type: 'null' },
        ],
        description: 'The view it was forked from, while that exists.',
      },
      role: { enum: ['owner', 'admin', 'editor', 'viewer', 'public'] },
      canEdit: { type: 'boolean' },
      canShare: { type: 'boolean' },
      canFork: { type: 'boolean' },
      canDuplicate: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
};
