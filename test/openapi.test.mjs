// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The HTTP API's description (#178): well formed, complete, and every route the server
// handles described (see openapi-postgres.mjs for the reverse, against a running server).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openApiDocument } from '../server/openapi/index.mjs';

const document = openApiDocument({ origin: 'https://timescale.info' });
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'];
const operations = Object.entries(document.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((method) => ({ path, method, operation: item[method], item })),
);

test('the description is OpenAPI 3.1 with every reference resolving', () => {
  assert.equal(document.openapi, '3.1.0');
  assert(document.info.title && document.info.version && document.info.description);
  assert(operations.length > 50, `only ${operations.length} operations`);
  const unresolved = [];
  const walk = (value, at) => {
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${at}/${i}`));
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const [, kind, name] =
        /^#\/components\/(schemas|securitySchemes)\/(.+)$/.exec(value.$ref) ?? [];
      if (!kind || !document.components[kind]?.[name]) unresolved.push(`${at}: ${value.$ref}`);
    }
    for (const [key, v] of Object.entries(value)) walk(v, `${at}/${key}`);
  };
  walk(document, '#');
  assert.deepEqual(unresolved, []);
  // Schemas nothing uses are left over from something else.
  const text = JSON.stringify(document.paths) + JSON.stringify(document.components.schemas);
  const unused = Object.keys(document.components.schemas).filter(
    (name) => !text.includes(`"#/components/schemas/${name}"`),
  );
  assert.deepEqual(unused, [], 'Schemas nothing refers to');
});

test('every operation says what it is, who may call it and what it answers', () => {
  const ids = new Set(),
    tags = new Set(document.tags.map((t) => t.name)),
    schemes = new Set(Object.keys(document.components.securitySchemes)),
    problems = [];
  for (const { path, method, operation, item } of operations) {
    const at = `${method.toUpperCase()} ${path}`;
    if (!/^\/(api\/|healthz$)/.test(path)) problems.push(`${at}: not an API path`);
    if (!operation.operationId || ids.has(operation.operationId))
      problems.push(`${at}: missing or repeated operationId ${operation.operationId}`);
    ids.add(operation.operationId);
    if (!operation.summary || /\.$/.test(operation.summary))
      problems.push(`${at}: a summary, without a full stop`);
    if (!operation.tags?.length || operation.tags.some((t) => !tags.has(t)))
      problems.push(`${at}: tags ${operation.tags} not among the document's tags`);
    if (!Array.isArray(operation.security) || !operation.security.length)
      problems.push(`${at}: no security`);
    for (const requirement of operation.security ?? [])
      for (const scheme of Object.keys(requirement))
        if (!schemes.has(scheme)) problems.push(`${at}: unknown security scheme ${scheme}`);
    if (!Object.keys(operation.responses ?? {}).some((s) => /^[23]\d\d$/.test(s)))
      problems.push(`${at}: no success response`);
    for (const [status, response] of Object.entries(operation.responses ?? {}))
      if (!response.description) problems.push(`${at}: response ${status} has no description`);
    // Path parameters and the path's template name the same things.
    const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])];
    const declared = parameters
      .filter((p) => p.in === 'path')
      .map((p) => p.name)
      .sort();
    const named = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();
    if (JSON.stringify(declared) !== JSON.stringify(named))
      problems.push(`${at}: path parameters ${declared} for ${named}`);
    for (const p of parameters)
      if (!p.schema || !p.description) problems.push(`${at}: parameter ${p.name} undescribed`);
  }
  assert.deepEqual(problems, []);
  for (const tag of document.tags)
    assert(
      operations.some(({ operation }) => operation.tags.includes(tag.name)),
      `The ${tag.name} tag has no operations`,
    );
});

/** The description's paths as patterns: `/api/timelines/{id}` matches any ID there. */
const patterns = Object.keys(document.paths).map(
  (path) => new RegExp('^' + path.replace(/[.]/g, '\\.').replace(/\{[^}]+\}/g, '[^/]+') + '$'),
);
const described = (path) => patterns.some((pattern) => pattern.test(path));

test('every route the request handler names is described', async () => {
  const source = await readFile(new URL('../server/http.mjs', import.meta.url), 'utf8');
  const missing = [];
  // Exact paths: pathname === '/api/…'.
  for (const [, path] of source.matchAll(/pathname === '(\/api\/[^']+|\/healthz)'/g))
    if (!described(path)) missing.push(path);
  // Patterns: /^\/api\/…$/.exec(pathname), as every path they match: each alternative of a
  // group of words, other groups as any value, and optional parts left out and in.
  const expand = (pattern) => {
    const group = /\((\?:)?([^()]*)\)(\?)?/.exec(pattern);
    if (!group) return [pattern];
    const [whole, , inside, optional] = group;
    const choices = /^[a-z|-]+$/.test(inside) ? inside.split('|') : group[1] ? [inside] : ['x'];
    return [...choices, ...(optional ? [''] : [])].flatMap((choice) =>
      expand(pattern.replace(whole, choice)),
    );
  };
  for (const [, pattern] of source.matchAll(
    /\/\^(\\\/api\\\/[^\s]*?)\$\/[a-z]*\.exec\(\s*pathname/g,
  ))
    for (const path of expand(pattern))
      if (!described(path.replace(/\\\//g, '/').replace(/\\\./g, '.'))) missing.push(pattern);
  // A timeline's actions: /api/timelines/{id}/<action>.
  for (const [, action] of source.matchAll(/action === '([a-z-]+)'/g))
    if (!described(`/api/timelines/x/${action}`)) missing.push('/api/timelines/{id}/' + action);
  // Account security steps, routed by name: /api/auth/<step>.
  const steps = /const securityRoutes = new Set\(\[([^\]]+)\]/.exec(source);
  assert(steps, 'the account security steps');
  for (const [, step] of steps[1].matchAll(/'([a-z/-]+)'/g))
    if (!described('/api/auth/' + step)) missing.push('/api/auth/' + step);
  // Administration, routed by name: /api/admin/<part> and /api/admin/<part>/{id}.
  const admin = /!\[([^\]]+)\]\.includes\(parts\[0\]\)/.exec(source);
  assert(admin, 'the administration routes');
  for (const [, part] of admin[1].matchAll(/'([a-z-]+)'/g))
    if (!described('/api/admin/' + part)) missing.push('/api/admin/' + part);
  assert.deepEqual([...new Set(missing)], []);
});
