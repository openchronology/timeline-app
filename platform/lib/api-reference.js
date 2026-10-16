// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Reading the API's description (#178; server/openapi) for its reference page: operations by
 * tag, who may call them, schemas as text, and example bodies to start from.
 */
export const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'];

/** The schema `schema` refers to, or itself. */
export function resolve(document, schema) {
  let seen = 0;
  while (schema?.$ref && seen++ < 10)
    schema = document.components.schemas[schema.$ref.split('/').pop()];
  return schema ?? {};
}
/** The name of the schema `schema` refers to, if it is a reference. */
export const refName = (schema) => schema?.$ref?.split('/').pop() ?? null;

/** Each tag's operations, in the description's order: `[{ tag, operations }]`. */
export function operationsByTag(document) {
  const byTag = new Map(document.tags.map((tag) => [tag.name, { tag, operations: [] }]));
  for (const [path, item] of Object.entries(document.paths))
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const name = operation.tags?.[0] ?? 'Other';
      if (!byTag.has(name)) byTag.set(name, { tag: { name }, operations: [] });
      byTag.get(name).operations.push({
        path,
        method,
        operation,
        parameters: [...(item.parameters ?? []), ...(operation.parameters ?? [])],
      });
    }
  return [...byTag.values()].filter((group) => group.operations.length);
}

/** Who may call an operation, from its `security`. */
export function access(security = []) {
  const parts = [];
  const has = (scheme) => security.some((requirement) => scheme in requirement);
  if (security.some((requirement) => !Object.keys(requirement).length)) parts.push('Anyone');
  if (has('session') || has('desktop'))
    parts.push(
      security.some((r) => 'csrf' in r && ('session' in r || 'desktop' in r))
        ? 'Signed in, with the CSRF token'
        : 'Signed in',
    );
  else if (has('csrf')) parts.push('The sign-in page’s CSRF token');
  const scopes = [...new Set(security.flatMap((r) => r.apiKey ?? []))];
  if (has('apiKey')) parts.push(`API keys${scopes.length ? ` (${scopes.join(', ')})` : ''}`);
  return parts.join(' · ') || 'Anyone';
}

/** A schema's type, briefly: `string`, `array of Moment`, `"public" | "private"`. */
export function typeName(schema) {
  if (!schema) return '';
  if (schema.$ref) return refName(schema);
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives) return alternatives.map(typeName).join(' or ');
  const type = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
  if (type === 'array') return `array of ${typeName(schema.items) || 'values'}`;
  return [type ?? (schema.properties ? 'object' : 'any'), schema.format && `(${schema.format})`]
    .filter(Boolean)
    .join(' ');
}

/** What a schema allows besides its type: limits and patterns, as text. */
export function limits(schema) {
  const parts = [];
  if (schema.minLength !== undefined) parts.push(`at least ${schema.minLength} characters`);
  if (schema.maxLength !== undefined) parts.push(`at most ${schema.maxLength} characters`);
  if (schema.minimum !== undefined) parts.push(`≥ ${schema.minimum}`);
  if (schema.maximum !== undefined) parts.push(`≤ ${schema.maximum}`);
  if (schema.minItems !== undefined) parts.push(`at least ${schema.minItems} items`);
  if (schema.maxItems !== undefined) parts.push(`at most ${schema.maxItems} items`);
  if (schema.pattern) parts.push(`matches ${schema.pattern}`);
  if (schema.default !== undefined) parts.push(`default ${JSON.stringify(schema.default)}`);
  return parts.join(', ');
}

/** A value to start a request body from: required fields, with examples or plain values. */
export function example(document, schema, depth = 0) {
  if (schema?.example !== undefined) return schema.example;
  if (schema?.examples?.length) return schema.examples[0];
  const resolved = resolve(document, schema);
  if (resolved.example !== undefined) return resolved.example;
  if ('const' in resolved) return resolved.const;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum) return resolved.enum[0];
  const alternatives = resolved.oneOf ?? resolved.anyOf;
  if (alternatives) return example(document, alternatives[0], depth);
  const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
  if (type === 'object' || resolved.properties) {
    if (depth > 3) return {};
    const required = resolved.required ?? [];
    return Object.fromEntries(
      Object.entries(resolved.properties ?? {})
        .filter(([key]) => required.includes(key))
        .map(([key, value]) => [key, example(document, value, depth + 1)]),
    );
  }
  if (type === 'array') return [];
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  return '';
}

/** An operation's JSON request body schema, if it takes one. */
export function jsonBody(operation) {
  return operation.requestBody?.content?.['application/json']?.schema ?? null;
}
/** Whether an operation answers with an endless stream, which the reference can't show. */
export function streams(operation) {
  return Object.values(operation.responses ?? {}).some(
    (response) => response.content?.['text/event-stream'],
  );
}
