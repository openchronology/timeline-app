// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Routing rules and filters over log entries, shared by the syslog receiver and the log
 * importer. A condition tests one field: glob patterns (`*`, `?`, ignoring case; a list
 * matches any), numeric comparisons (">=500", "<400", "!=200"), a severity threshold, or
 * facility names. Routes pick timelines in order: the first match wins, "continue" checks
 * later routes too, and unmatched entries go to the default timeline.
 */
import { FACILITIES, SEVERITIES } from './syslog.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FIELD = /^[A-Za-z_@][A-Za-z0-9_.@-]{0,63}$/;
const COMPARISON = /^(>=|<=|!=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/;
export const glob = (pattern) =>
  new RegExp(
    '^' +
      pattern
        .split('')
        .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
        .join('') +
      '$',
    'is',
  );
const compare = {
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};
/** A field's value for matching: nested fields by dots ("http.status"). */
const valueOf = (entry, field) => {
  if (field in entry) return entry[field];
  let value = entry;
  for (const part of field.split('.')) value = value?.[part];
  return value;
};
/**
 * One condition: `severity` (a name: that level or more severe), `facility` (names), or any
 * field: a pattern or list of patterns, or a numeric comparison. Returns a predicate.
 */
export function compileCondition(field, value, where = 'Condition') {
  if (field === 'severity') {
    if (!SEVERITIES.includes(value)) throw new Error(`${where}: unknown severity ${value}.`);
    const limit = SEVERITIES.indexOf(value);
    return (entry) => entry.severity != null && SEVERITIES.indexOf(entry.severity) <= limit;
  }
  if (field === 'facility') {
    const names = Array.isArray(value) ? value : [value];
    for (const f of names)
      if (!FACILITIES.includes(f)) throw new Error(`${where}: unknown facility ${f}.`);
    return (entry) => names.includes(entry.facility);
  }
  if (!FIELD.test(field)) throw new Error(`${where}: invalid field name ${field}.`);
  const values = Array.isArray(value) ? value : [value];
  if (
    !values.length ||
    values.some(
      (v) => (typeof v !== 'string' && typeof v !== 'number') || v === '' || String(v).length > 256,
    )
  )
    throw new Error(`${where}: ${field} must be a pattern or a list of patterns.`);
  const tests = values.map((v) => {
    const numeric = COMPARISON.exec(String(v).trim());
    if (numeric) {
      const [, op, n] = numeric;
      return (actual) => {
        const number = typeof actual === 'number' ? actual : Number(actual);
        return actual !== null && actual !== undefined && actual !== '' && Number.isFinite(number)
          ? compare[op](number, Number(n))
          : false;
      };
    }
    const pattern = glob(String(v));
    return (actual) =>
      pattern.test(
        actual === null || actual === undefined
          ? ''
          : typeof actual === 'string'
            ? actual
            : String(actual),
      );
  });
  return (entry) => {
    const actual = valueOf(entry, field);
    return tests.some((t) => t(actual));
  };
}
/**
 * A command-line filter: "field=pattern", "field!=pattern", "field>=number" (also >, <,
 * <=), or "severity>=err" (that severity or more severe).
 */
export function parseFilter(text) {
  const parts = /^([A-Za-z_@][A-Za-z0-9_.@-]{0,63})\s*(>=|<=|!=|=|>|<)\s*(.*)$/s.exec(
    String(text).trim(),
  );
  if (!parts || parts[3] === '')
    throw new Error(`Invalid filter "${text}": use field=pattern or field>=number.`);
  const [, field, op, value] = parts;
  if (field === 'severity') {
    if (op !== '>=' && op !== '=')
      throw new Error('Filter severities with severity>=<level> (that level or more severe).');
    if (op === '=') {
      if (!SEVERITIES.includes(value)) throw new Error(`Unknown severity ${value}.`);
      return (entry) => entry.severity === value;
    }
    return compileCondition('severity', value, `Filter "${text}"`);
  }
  if (op === '=') return compileCondition(field, value, `Filter "${text}"`);
  if (op === '!=' && !COMPARISON.test('!=' + value)) {
    const match = compileCondition(field, value, `Filter "${text}"`);
    return (entry) => !match(entry);
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Filter "${text}": compare with a number.`);
  return compileCondition(field, op + value, `Filter "${text}"`);
}

/**
 * Compiles routing rules: `{ routes: [{ timeline, continue?, ...conditions }], default? }`.
 * `fields` lists the field conditions allowed (any field when null); `label` names the
 * rules in errors. Entries go to the first matching route, to later ones while matched
 * routes set "continue": true, and otherwise to `default` (or nowhere).
 */
export function compileRoutes(config, { fields = null, label = 'Log' } = {}) {
  const noun = label.toLowerCase();
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${label} routes must be a JSON object with "routes" and/or "default".`);
  const unknown = Object.keys(config).filter((k) => !['routes', 'default'].includes(k));
  if (unknown.length) throw new Error(`Unknown ${noun} routing setting: ` + unknown.join(', '));
  if (config.default !== undefined && config.default !== null && !UUID.test(config.default))
    throw new Error(`The default ${noun} timeline must be a timeline UUID.`);
  if (config.routes !== undefined && !Array.isArray(config.routes))
    throw new Error(`${label} routes must be a list.`);
  const routes = (config.routes ?? []).map((route, i) => {
    const where = `${label} route ${i + 1}`;
    if (!route || typeof route !== 'object' || Array.isArray(route))
      throw new Error(`${where} must be an object.`);
    const allowed = fields && ['timeline', 'continue', 'severity', 'facility', ...fields];
    const extra = allowed ? Object.keys(route).filter((k) => !allowed.includes(k)) : [];
    if (extra.length) throw new Error(`${where} has unknown settings: ${extra.join(', ')}`);
    if (!UUID.test(route.timeline ?? '')) throw new Error(`${where} needs a timeline UUID.`);
    if (route.continue !== undefined && typeof route.continue !== 'boolean')
      throw new Error(`${where}: "continue" must be true or false.`);
    const conditions = Object.entries(route)
      .filter(([k]) => k !== 'timeline' && k !== 'continue')
      .map(([field, value]) => compileCondition(field, value, where));
    return {
      timeline: route.timeline.toLowerCase(),
      conditions,
      continue: route.continue === true,
    };
  });
  if (!routes.length && !config.default)
    throw new Error(`${label} routing needs at least one route or a default timeline.`);
  return {
    timelines: [
      ...new Set([...routes.map((r) => r.timeline), config.default?.toLowerCase()]),
    ].filter(Boolean),
    /** Timeline IDs an entry goes to, in route order, without repeats. */
    route(entry) {
      const targets = [];
      for (const route of routes)
        if (route.conditions.every((matches) => matches(entry))) {
          if (!targets.includes(route.timeline)) targets.push(route.timeline);
          if (!route.continue) return targets;
        }
      if (!targets.length && config.default) targets.push(config.default.toLowerCase());
      return targets;
    },
  };
}
