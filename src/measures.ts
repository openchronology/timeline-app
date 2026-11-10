// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures (#570, #572): named, exact quantities that moments and durations carry and that
// summaries total. A timeline declares each (`measures` in a document: a name, its type, `mpz`
// for whole numbers or `mpq` for fractions, and a label), and an entity gives its values as
// canonical text under `metadata.measures`. No entry is zero. Changing a declaration that
// would leave values invalid (renaming, removing or narrowing to whole numbers) rewrites them
// (remeasuredEntities), as one save.
import { Rational as Q } from 'rational-ordered-map';
import { timeDigitLimit } from './numeric.js';

/** `mpz`: unbounded integers; `mpq`: unbounded rationals. Both total exactly. */
export type MeasureType = 'mpz' | 'mpq';
export interface MeasureDeclaration {
  type: MeasureType;
  /** What the editor calls it, such as "Cost"; the name otherwise. */
  label?: string;
}
export type Measures = Record<string, MeasureDeclaration>;
/** An entity's values: canonical text by measure name, never zero. */
export type MeasureValues = Record<string, string>;

/** The metadata key of an entity's values. */
export const MEASURES_KEY = 'measures';
/** The most measures a timeline declares. */
export const MEASURE_LIMIT = 32;
export const MEASURE_LABEL_LIMIT = 80;
/** The longest value text, before it is read. */
export const MEASURE_TEXT_LIMIT = 2200;
/** Names: lowercase, starting with a letter, as metadata keys and query names allow. */
export const MEASURE_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const VALUE = /^[+-]?(?:\d+(?:\/\d+)?|\d+\.\d*|\.\d+)$/;

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A timeline's declarations, validated: at most MEASURE_LIMIT, each a type and a label. */
export function validateMeasures(value: unknown): Measures {
  if (!plain(value)) throw new Error('Measures must be an object of declarations by name.');
  const names = Object.keys(value);
  if (names.length > MEASURE_LIMIT)
    throw new Error(`A timeline declares at most ${MEASURE_LIMIT} measures.`);
  const measures: Measures = {};
  for (const name of names.sort()) {
    if (!MEASURE_NAME.test(name))
      throw new Error(
        `Measure names are lowercase letters, digits and underscores, starting with a letter, up to 40: ${JSON.stringify(name.slice(0, 50))}.`,
      );
    const d = value[name];
    if (!plain(d) || Object.keys(d).some((k) => k !== 'type' && k !== 'label'))
      throw new Error(`Measure ${name} must be {"type": "mpz" | "mpq", "label"?}.`);
    if (d.type !== 'mpz' && d.type !== 'mpq')
      throw new Error(`Measure ${name}'s type must be "mpz" (whole numbers) or "mpq" (fractions).`);
    if (
      d.label !== undefined &&
      (typeof d.label !== 'string' || !d.label.trim() || d.label.length > MEASURE_LABEL_LIMIT)
    )
      throw new Error(`Measure ${name}'s label must be text of 1 to ${MEASURE_LABEL_LIMIT}.`);
    measures[name] = {
      type: d.type,
      ...(d.label === undefined ? {} : { label: (d.label as string).trim() }),
    };
  }
  return measures;
}

/** A value's text in canonical form: an integer as `1250`, a fraction in lowest terms `3/2`. */
export function measureText(value: Q): string {
  return value.denominator === 1n ? value.numerator.toString() : value.toString();
}

/**
 * A value as an exact rational: an integer, a fraction `n/d` or a finite decimal, as text (JSON
 * numbers aren't exact). Bounded like times: by text length and the server's digit limit.
 */
export function parseMeasureValue(text: unknown): Q {
  if (typeof text !== 'string')
    throw new Error('Measure values are text, such as "1250", "3/2" or "12.5".');
  if (text.length > MEASURE_TEXT_LIMIT || !VALUE.test(text))
    throw new Error(
      `Measure values are integers, fractions or decimals, such as "1250", "3/2" or "12.5", of at most ${MEASURE_TEXT_LIMIT} characters.`,
    );
  const value = text.includes('/') ? Q.parse(text.replace(/^\+/, '')) : Q.parseDecimal(text);
  const limit = timeDigitLimit(),
    digits = (n: bigint) => (n < 0n ? -n : n).toString().length;
  if (digits(value.numerator) > limit.numerator || digits(value.denominator) > limit.denominator)
    throw new Error(
      `Measure values must be fractions of at most ${limit.numerator} digits over at most ${limit.denominator} digits on this server.`,
    );
  return value;
}

/**
 * An entity's values (metadata.measures) in canonical form, without zeros, checked against
 * `measures` when known: every name declared, and whole for an `mpz` measure. A partial save
 * that carries no settings checks only their form (null). Undefined when none remain.
 */
export function validateMeasureValues(
  value: unknown,
  measures: Measures | null,
): MeasureValues | undefined {
  if (value === undefined) return undefined;
  if (!plain(value)) throw new Error('An entity’s measures must be an object of values by name.');
  const names = Object.keys(value);
  if (names.length > MEASURE_LIMIT)
    throw new Error(`An entity has at most ${MEASURE_LIMIT} measure values.`);
  const values: MeasureValues = {};
  for (const name of names.sort()) {
    if (!MEASURE_NAME.test(name)) throw new Error(`Invalid measure name ${JSON.stringify(name)}.`);
    const declared = measures ? (own(measures, name) ? measures[name] : null) : undefined;
    if (declared === null) throw new Error(`The timeline declares no measure named ${name}.`);
    let parsed: Q;
    try {
      parsed = parseMeasureValue(value[name]);
    } catch (error) {
      throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (declared?.type === 'mpz' && parsed.denominator !== 1n)
      throw new Error(`${name} is a whole number; ${value[name]} isn't one.`);
    if (parsed.numerator !== 0n) values[name] = measureText(parsed);
  }
  return names.length && Object.keys(values).length ? values : undefined;
}

/**
 * Metadata with its measure values normalized (validateMeasureValues), the key left out when
 * none remain. Returns the same object, changed in place.
 */
export function normalizeMeasureMetadata<T extends Record<string, unknown>>(
  metadata: T,
  measures: Measures | null,
): T {
  if (!own(metadata, MEASURES_KEY)) return metadata;
  const values = validateMeasureValues(metadata[MEASURES_KEY], measures);
  if (values) (metadata as Record<string, unknown>)[MEASURES_KEY] = values;
  else delete (metadata as Record<string, unknown>)[MEASURES_KEY];
  return metadata;
}

/** An entity's value of measure `name` as an exact rational: zero when it has none. */
export function measureValue(metadata: Record<string, unknown> | undefined, name: string): Q {
  const values = metadata?.[MEASURES_KEY];
  if (!plain(values) || !own(values, name) || typeof values[name] !== 'string') return Q.from(0n);
  return Q.parse(values[name].includes('/') ? values[name] : values[name] + '/1');
}

/**
 * Whether a settings save may change `before` into `after` as it is: keeping every measure,
 * with its type the same or widened (`mpz` to `mpq`). Anything else, renaming, removing or
 * narrowing, rewrites values (remeasuredEntities).
 */
export function measuresCompatible(before: Measures | undefined, after: Measures | undefined) {
  for (const [name, d] of Object.entries(before ?? {})) {
    const next = after && own(after, name) ? after[name] : null;
    if (!next || (d.type === 'mpq' && next.type === 'mpz')) return false;
  }
  return true;
}

/** Renames of measures, old name to new: each old declared before, each new after, one to one. */
export function validateMeasureRenames(
  value: unknown,
  before: Measures | undefined,
  after: Measures | undefined,
): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!plain(value)) throw new Error('Renames are an object of new names by old name.');
  const renames: Record<string, string> = {};
  const targets = new Set<string>();
  for (const [from, to] of Object.entries(value)) {
    if (!before || !own(before, from)) throw new Error(`No measure named ${from} to rename.`);
    if (typeof to !== 'string' || !after || !own(after, to))
      throw new Error(`Rename ${from} to a measure the new declarations name.`);
    if (targets.has(to)) throw new Error(`Two measures can't both be renamed ${to}.`);
    if (from !== to) renames[from] = to;
    targets.add(to);
  }
  return renames;
}

/**
 * What a change of declarations does to an entity's values: renamed values moved to their new
 * names, values of removed measures dropped, and a fraction under a measure narrowed to whole
 * numbers refused. Null when unchanged.
 */
export function remeasuredValues(
  values: unknown,
  after: Measures,
  renames: Record<string, string>,
): MeasureValues | undefined | null {
  if (!plain(values)) return null;
  const next: MeasureValues = {};
  let changed = false;
  for (const [name, text] of Object.entries(values)) {
    const target = own(renames, name) ? renames[name] : own(after, name) ? name : null;
    if (target !== name) changed = true;
    if (target === null) continue;
    if (after[target].type === 'mpz' && typeof text === 'string' && text.includes('/'))
      throw Object.assign(new Error(`${after[target].label ?? target} has a fraction, ${text}`), {
        fraction: { label: after[target].label ?? target, text },
      });
    next[target] = text as string;
  }
  if (!changed) return null;
  return Object.keys(next).length ? next : undefined;
}

interface Entity {
  id: string;
  metadata: Record<string, unknown>;
}
/**
 * The moments and durations of `document` whose values change when its declarations become
 * `after` with `renames` (old name to new), rewritten; the rest are left out. Throws, naming
 * the entity, when a fraction would be kept under a whole-number measure.
 */
export function remeasuredEntities<E extends Entity, D extends Entity>(
  document: { events: readonly E[]; durations?: readonly D[] },
  after: Measures,
  renames: Record<string, string> = {},
): { events: E[]; durations: D[] } {
  const rewrite = <T extends Entity>(entity: T, kind: string): T | null => {
    let values: MeasureValues | undefined | null;
    try {
      values = remeasuredValues(entity.metadata?.[MEASURES_KEY], after, renames);
    } catch (error) {
      const fraction = (error as { fraction?: { label: string; text: string } }).fraction;
      if (fraction)
        throw new Error(
          `${fraction.label} can't become whole numbers while ${kind} ${entity.id} has ${fraction.text}.`,
        );
      throw error;
    }
    if (values === null) return null;
    const metadata = { ...entity.metadata };
    if (values) metadata[MEASURES_KEY] = values;
    else delete metadata[MEASURES_KEY];
    return { ...entity, metadata };
  };
  const events: E[] = [],
    durations: D[] = [];
  for (const e of document.events) {
    const next = rewrite(e, 'moment');
    if (next) events.push(next);
  }
  for (const d of document.durations ?? []) {
    const next = rewrite(d, 'duration');
    if (next) durations.push(next);
  }
  return { events, durations };
}
