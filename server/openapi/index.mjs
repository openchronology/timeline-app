// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The HTTP API's description (#178): OpenAPI 3.1, served at /api/openapi.json and read by
 * the reference at /docs/api. Each area of the API describes itself in its own module.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { schemas as common, securitySchemes } from './common.mjs';
import * as timelines from './timelines.mjs';
import * as collaboration from './collaboration.mjs';
import * as accounts from './accounts.mjs';
import * as community from './community.mjs';

const AREAS = [timelines, collaboration, accounts, community];
/** This build's release version, or its commit (dist/build-info.json). */
function buildVersion() {
  try {
    const build = JSON.parse(
      readFileSync(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/build-info.json')),
    );
    return build.version || build.commit?.slice(0, 12) || 'development';
  } catch {
    return 'development';
  }
}

const DESCRIPTION = `The API the web app, the desktop app and the command-line tools use. Requests and responses are JSON unless an operation says otherwise.

**Signing in.** Browsers use the session cookie that signing in sets, and send the session's CSRF token (the \`csrf\` of \`GET /api/session\`) as \`X-CSRF-Token\` with every change. The desktop app sends its session token as a bearer token, with the same CSRF header. For automation, make an API key in Account → API keys and send it as \`Authorization: Bearer och_key_…\`: keys reach the timeline endpoints only, with the \`timelines:read\` or \`timelines:write\` scope, and need no CSRF token.

**Errors** answer with a status code and \`{"error": "…"}\`, a message for people. A 428 asks for human verification first: answer the challenge it carries and send its token as \`X-Challenge\`.

**Revisions.** A timeline's \`revision\` changes with every save. Saves send the revision they were made on; one made on an older revision merges with what was saved since, or answers 409 with what conflicts.

**Exact times.** Times are exact rational numbers in coordinates, written as text (\`"86400/1"\`, \`"-3/2"\`); how they read as dates is the timeline's \`presentation\`.`;

/** The API's description, for a server at `origin`. */
export function openApiDocument({ origin = '', name = 'OpenChronology' } = {}) {
  const paths = {},
    schemas = { ...common },
    tags = [];
  for (const area of AREAS) {
    tags.push(...area.tags);
    for (const [path, operations] of Object.entries(area.paths)) {
      if (paths[path]) throw new Error(`${path} is described twice.`);
      paths[path] = operations;
    }
    for (const [key, schema] of Object.entries(area.schemas)) {
      if (schemas[key]) throw new Error(`The ${key} schema is defined twice.`);
      schemas[key] = schema;
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: `${name} HTTP API`,
      version: buildVersion(),
      description: DESCRIPTION,
      license: { name: 'GPL-3.0-only', identifier: 'GPL-3.0-only' },
    },
    ...(origin ? { servers: [{ url: origin }] } : {}),
    tags,
    paths,
    components: { securitySchemes, schemas },
  };
}
