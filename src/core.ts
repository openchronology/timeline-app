import {
  validateDurations,
  validateDuration,
  convertLegacyDurations,
  fixMissingAnchors,
  durationTree,
  durationWindow,
  durationSummaries,
} from './durations.js';
import type { Duration, DurationBand, IntervalNode } from './durations.js';
import { durationGroups, coalesceGroups } from './summaries.js';
export { durationGroups, coalesceGroups, entityCount } from './summaries.js';
export {
  anchorOf,
  durationOverview,
  validateDurations,
  validateDuration,
  convertLegacyDurations,
  fixMissingAnchors,
  resolveDuration,
  durationTree,
  durationWindow,
  durationSummaries,
  collapses,
  MAX_DURATIONS,
} from './durations.js';
export type { Duration, DurationBand, DurationEndpoint, DurationSummary } from './durations.js';
export {
  searchTerms,
  searchText,
  searchIndex,
  searchRows,
  snippet,
  SEARCH_PAGE_SIZE,
  SEARCH_MAX_TERMS,
} from './search.js';
export type { SearchResult, SearchPage } from './search.js';
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q, RationalMap } from 'rational-ordered-map';
import { validateInstalledPlugins, validateStackMetadata, imageURL } from './plugins.js';
import type { InstalledPlugin } from './plugins.js';
export * from './plugins.js';
export { stackWindow, scaleTimeline } from './stack-layout.js';
import { parseTimestamp } from './calendar.js';
import { validatePresentation } from './presentation.js';
import type { TimePresentation } from './presentation.js';
export {
  createPresenter,
  validatePresentation,
  DEFAULT_PRESENTATION,
  UNIT_PRESETS,
  CUSTOM_EXAMPLE,
  compileCustom,
  parseNumber,
  printNumber,
} from './presentation.js';
export type { TimePresentation } from './presentation.js';
export type { PresentationContext, TimePresenter } from './presentation.js';
export { planRuler, validateRulerPolicy } from './ruler.js';
export type { RulerPolicy, RulerTick, RulerPlan } from './ruler.js';
export { parseTimestamp, printTimestamp } from './calendar.js';
export { Q, RationalMap };
export type Metadata = { [key: string]: unknown; title?: string; description?: string };
export interface PointEvent {
  id: string;
  time: string;
  metadata: Metadata;
}
export interface SavedComparison {
  sources: string[];
  combined: boolean;
}
export function validateComparison(value: unknown): SavedComparison {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid saved comparison.');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !['sources', 'combined'].includes(k)) ||
    !Array.isArray(v.sources) ||
    v.sources.length < 2 ||
    v.sources.length > 8 ||
    v.sources.some(
      (id) => typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
    ) ||
    typeof v.combined !== 'boolean'
  )
    throw new Error(
      'A saved comparison requires two to eight distinct timeline IDs and a view mode.',
    );
  const sources = (v.sources as string[]).map((id) => id.toLowerCase());
  if (new Set(sources).size !== sources.length)
    throw new Error('Comparison sources must be distinct.');
  return { sources, combined: v.combined };
}
export interface TimelineDocument {
  format: 'openchronology';
  version: 1;
  comparison?: SavedComparison;
  title: string;
  description: string;
  presentation?: TimePresentation;
  plugins?: InstalledPlugin[];
  tags?: string[];
  assets?: Record<string, string>;
  events: PointEvent[];
  durations?: Duration[];
}
export interface FrameGroup {
  first: string;
  last: string;
  count: string;
  distinct: number;
  title?: string;
  id?: string;
  metadata?: Metadata;
  /** Collapsed durations summarized in this group (durations shorter than the threshold). */
  durationCount?: string;
  /** The duration, when the group is exactly one collapsed duration and no moments. */
  duration?: DurationBand;
}
export interface Frame {
  durations?: DurationBand[];
  durationsTruncated?: boolean;
  groups: FrameGroup[];
  visitedNodes: number;
  revision?: string;
  threshold?: string;
}
export function parseTime(text: string): Q {
  if (text.includes('T')) return parseTimestamp(text);
  return text.includes('/') ? Q.parse(text) : Q.parseDecimal(text);
}
export function validateTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error('Use at most 40 tags.');
  const tags = value.map((tag) => {
    if (typeof tag !== 'string') throw new Error('Tags must be text.');
    const normalized = tag.normalize('NFC').trim().toLowerCase();
    if (!normalized || normalized.length > 64 || /[\x00-\x1f\x7f,]/.test(normalized))
      throw new Error('Tags must be 1–64 characters without commas or control characters.');
    return normalized;
  });
  return [...new Set(tags)];
}
export function validateAssets(value: unknown): Record<string, string> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 200
  )
    throw new Error('Invalid embedded images.');
  const assets: Record<string, string> = {};
  let bytes = 0;
  for (const [url, data] of Object.entries(value)) {
    if (
      imageURL(url) !== url ||
      url.length > 4096 ||
      typeof data !== 'string' ||
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)
    )
      throw new Error('Embedded images require HTTPS keys and base64 raster data.');
    bytes += data.length;
    if (data.length > 2097152 || bytes > 8388608)
      throw new Error('Embedded images are limited to 2 MiB each and 8 MiB total.');
    assets[url] = data;
  }
  return assets;
}
export function validateDocument(value: unknown, partial = false): TimelineDocument {
  if (!value || typeof value !== 'object') throw new Error('Expected an OpenChronology document.');
  const doc = value as Record<string, unknown>;
  if (doc.format !== 'openchronology' || doc.version !== 1)
    throw new Error('Unsupported timeline format or version.');
  if (
    typeof doc.title !== 'string' ||
    doc.title.length > 300 ||
    typeof doc.description !== 'string' ||
    doc.description.length > 20000
  )
    throw new Error('The timeline needs a title and description.');
  if (!Array.isArray(doc.events) || doc.events.length > 200000)
    throw new Error('Expected at most 200,000 point events.');
  const comparison = doc.comparison === undefined ? undefined : validateComparison(doc.comparison);
  if (comparison && (doc.events.length || (Array.isArray(doc.durations) && doc.durations.length)))
    throw new Error('Saved comparisons reference sources instead of storing events.');
  const ids = new Set<string>();
  const plugins = doc.plugins === undefined ? undefined : validateInstalledPlugins(doc.plugins);
  const events = doc.events.map((raw: unknown): PointEvent => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid event.');
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(e.id) || ids.has(e.id))
      throw new Error('Event IDs must be unique ASCII identifiers.');
    ids.add(e.id);
    if (typeof e.time !== 'string')
      throw new Error('Time must be a string containing an exact rational or finite decimal.');
    if (!e.metadata || typeof e.metadata !== 'object' || Array.isArray(e.metadata))
      throw new Error('Event metadata must be a JSON object.');
    const metadata = JSON.parse(JSON.stringify(e.metadata)) as Metadata;
    validateStackMetadata(metadata, plugins);
    for (const field of ['title', 'description']) {
      if (metadata[field] !== undefined && typeof metadata[field] !== 'string')
        throw new Error(`Event ${field} must be text.`);
    }
    return { id: e.id, time: parseTime(e.time).toString(), metadata };
  });
  const legacy = convertLegacyDurations(events);
  const durations = validateDurations(
    [...(doc.durations === undefined ? [] : asArray(doc.durations)), ...legacy.durations],
    partial ? null : ids,
    parseTime,
  ).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    format: 'openchronology',
    version: 1,
    title: doc.title,
    description: doc.description,
    ...(comparison ? { comparison } : {}),
    ...(doc.presentation === undefined
      ? {}
      : { presentation: validatePresentation(doc.presentation) }),
    ...(plugins === undefined ? {} : { plugins }),
    ...(doc.tags === undefined ? {} : { tags: validateTags(doc.tags) }),
    ...(doc.assets === undefined ? {} : { assets: validateAssets(doc.assets) }),
    events: legacy.events,
    ...(durations.length ? { durations } : {}),
  };
}
function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Durations must be an array.');
  return value;
}
export class TimelineIndex {
  readonly points = new RationalMap<readonly PointEvent[]>((bucket) => BigInt(bucket.length));
  private intervals: IntervalNode | null = null;
  private intervalDirty = true;
  readonly byId = new Map<string, PointEvent>();
  readonly durations = new Map<string, Duration>();
  /** Last times of deleted moments; anchored durations stay put until saved or re-anchored. */
  protected retired = new Map<string, string>();
  title: string;
  description: string;
  presentation?: TimePresentation;
  plugins?: InstalledPlugin[];
  tags?: string[];
  assets?: Record<string, string>;
  constructor(document: TimelineDocument) {
    this.tags = document.tags === undefined ? undefined : validateTags(document.tags);
    this.assets = document.assets === undefined ? undefined : validateAssets(document.assets);
    this.title = document.title;
    this.description = document.description;
    this.presentation = document.presentation
      ? validatePresentation(document.presentation)
      : undefined;
    this.plugins =
      document.plugins === undefined ? undefined : validateInstalledPlugins(document.plugins);
    // Bulk-load coincident events once; copying/sorting a growing bucket per event is quadratic.
    const buckets = new Map<string, PointEvent[]>();
    for (const event of document.events) {
      if (this.byId.has(event.id)) throw new Error('Event IDs must be unique.');
      const time = parseTime(event.time).toString();
      const normalized = Object.freeze({
        ...event,
        time,
        metadata: Object.freeze({ ...event.metadata }),
      });
      this.byId.set(event.id, normalized);
      const bucket = buckets.get(time);
      if (bucket) bucket.push(normalized);
      else buckets.set(time, [normalized]);
    }
    for (const [time, bucket] of buckets) {
      bucket.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      this.points.set(Q.parse(time), Object.freeze(bucket));
    }
    for (const duration of validateDurations(document.durations, null, parseTime)) {
      if (this.durations.has(duration.id)) throw new Error('Duration IDs must be unique.');
      this.durations.set(duration.id, Object.freeze(duration));
    }
  }
  /** Time of a moment, or of a deleted moment that unsaved anchors still follow. */
  momentTime(id: string): string | undefined {
    return this.byId.get(id)?.time ?? this.retired.get(id);
  }
  putDuration(duration: Duration): void {
    const normalized = validateDuration(duration, parseTime);
    this.durations.set(normalized.id, Object.freeze(normalized));
    this.intervalDirty = true;
  }
  deleteDuration(id: string): boolean {
    this.intervalDirty = true;
    return this.durations.delete(id);
  }
  /** Durations whose start or end follows this moment. */
  anchoredTo(moment: string): Duration[] {
    return [...this.durations.values()].filter(
      (d) =>
        (typeof d.start !== 'string' && d.start.moment === moment) ||
        (typeof d.end !== 'string' && d.end.moment === moment),
    );
  }
  protected durationList(): Duration[] {
    return fixMissingAnchors(
      [...this.durations.values()],
      (id) => this.byId.has(id),
      (id) => this.retired.get(id),
    ).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  put(event: PointEvent): void {
    this.intervalDirty = true;
    this.retired.delete(event.id);
    const time = parseTime(event.time),
      normalized = Object.freeze({
        ...event,
        time: time.toString(),
        metadata: Object.freeze({ ...event.metadata }),
      });
    this.remove(event.id);
    const bucket = [...(this.points.get(time) ?? []), normalized].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    this.points.set(time, Object.freeze(bucket));
    this.byId.set(event.id, normalized);
  }
  delete(id: string): boolean {
    const event = this.byId.get(id);
    if (event) this.retired.set(id, event.time);
    return this.remove(id);
  }
  /** Removes a moment from the index without treating it as deleted (replacement or eviction). */
  protected remove(id: string): boolean {
    this.intervalDirty = true;
    const event = this.byId.get(id);
    if (!event) return false;
    const key = Q.parse(event.time),
      bucket = this.points.get(key)!.filter((e) => e.id !== id);
    if (bucket.length) this.points.set(key, Object.freeze(bucket));
    else this.points.delete(key);
    this.byId.delete(id);
    return true;
  }
  document(): TimelineDocument {
    const durations = this.durationList();
    return {
      format: 'openchronology',
      version: 1,
      title: this.title,
      description: this.description,
      ...(this.presentation ? { presentation: this.presentation } : {}),
      ...(this.plugins === undefined ? {} : { plugins: this.plugins }),
      ...(this.tags === undefined ? {} : { tags: this.tags }),
      ...(this.assets === undefined ? {} : { assets: this.assets }),
      events: [...this.points].flatMap(([, bucket]) => [...bucket]),
      ...(durations.length ? { durations } : {}),
    };
  }
  frame(viewport: Viewport, width: number, pixels = 24): Frame {
    if (this.intervalDirty) {
      this.intervals = durationTree(this.durations.values(), (id) => this.momentTime(id));
      this.intervalDirty = false;
    }
    const threshold = viewport.threshold(width, pixels);
    const result = this.points.overview(viewport.left, viewport.right, threshold, 'span', {
      includeUpper: true,
    });
    const collapsed = threshold.compare(Q.zero) > 0 ? threshold : null;
    const moments = result.groups.map((group) => {
      const first = group.firstTime.toString(),
        only = group.entryCount === 1n ? this.points.get(group.firstTime)![0] : undefined;
      return {
        first,
        last: group.lastTime.toString(),
        count: group.entryCount.toString(),
        distinct: group.distinctCount,
        ...(only ? { id: only.id, title: only.metadata.title ?? '' } : {}),
      };
    });
    return {
      ...durationWindow(this.intervals, viewport.left, viewport.right, 256, collapsed),
      visitedNodes: result.stats.visitedNodes,
      groups: collapsed
        ? coalesceGroups(
            [
              ...moments,
              ...durationGroups(
                durationSummaries(this.intervals, viewport.left, viewport.right, collapsed),
              ),
            ],
            collapsed,
          )
        : moments,
    };
  }
  eventsBetween(first: string, last: string, limit = 100): PointEvent[] {
    const result: PointEvent[] = [];
    for (const [, bucket] of this.points.range(Q.parse(first), Q.parse(last), {
      includeUpper: true,
    })) {
      for (const event of bucket) {
        result.push(event);
        if (result.length >= limit) return result;
      }
    }
    return result;
  }
}
/** Pixel arithmetic is rationalized at the input boundary. Absolute times never become Numbers. */
export function screenQ(value: number): Q {
  if (!Number.isFinite(value)) throw new Error('Invalid screen coordinate.');
  return Q.from(BigInt(Math.round(value * 1024)), 1024n);
}
/** Opposite wheel deltas use reciprocal factors, avoiding systematic round-trip drift. */
export function wheelZoomFactor(delta: number): Q {
  if (!Number.isFinite(delta)) throw new Error('Invalid wheel delta.');
  const amount = Math.max(-0.7, Math.min(0.7, delta * 0.002)),
    scale = BigInt(Math.round(Math.exp(Math.abs(amount)) * 1000000));
  return amount < 0 ? Q.from(1000000n, scale) : Q.from(scale, 1000000n);
}

function floorBinaryExponent(value: Q): number {
  const n = value.numerator,
    d = value.denominator;
  let exponent = n.toString(2).length - d.toString(2).length;
  if (exponent >= 0 ? n < d << BigInt(exponent) : n << BigInt(-exponent) < d) exponent--;
  return exponent;
}

function roundToBinaryGrid(value: Q, exponent: number): Q {
  const n = exponent < 0 ? value.numerator << BigInt(-exponent) : value.numerator,
    d = exponent > 0 ? value.denominator << BigInt(exponent) : value.denominator,
    magnitude = n < 0n ? -n : n,
    rounded = ((magnitude + d / 2n) / d) * (n < 0n ? -1n : 1n);
  return exponent >= 0
    ? Q.from(rounded << BigInt(exponent))
    : Q.from(rounded, 1n << BigInt(-exponent));
}

export class Viewport {
  constructor(
    public left: Q = Q.from(-2n),
    public span: Q = Q.from(28n),
  ) {
    if (span.compare(Q.zero) <= 0) throw new Error('The visible window must have positive width.');
  }
  get right(): Q {
    return this.left.add(this.span);
  }
  clone(): Viewport {
    return new Viewport(this.left, this.span);
  }
  /**
   * Keep camera precision proportional to the visible scale, rather than gesture history.
   * One grid step is at most 1/2^20 CSS pixel. Both edges move by at most one step.
   * Only camera coordinates are rounded; event times and explicit query bounds stay exact.
   */
  rasterize(width: number): Viewport {
    if (!Number.isFinite(width)) throw new Error('Invalid screen width.');
    const samples = BigInt(Math.max(1, Math.ceil(width))) << 20n,
      precision = this.span.div(Q.from(samples)),
      exponent = floorBinaryExponent(precision);
    return new Viewport(
      roundToBinaryGrid(this.left, exponent),
      roundToBinaryGrid(this.span, exponent),
    );
  }
  at(pixel: number, width: number): Q {
    return this.left.add(this.span.mul(screenQ(pixel).div(screenQ(width))));
  }
  x(time: Q, width: number): number {
    return time.sub(this.left).div(this.span).toApproximateNumber() * width;
  }
  threshold(width: number, pixels: number): Q {
    return this.span.mul(screenQ(pixels).div(screenQ(Math.max(1, width))));
  }
  pan(pixelDelta: number, width: number): Viewport {
    return new Viewport(
      this.left.sub(this.span.mul(screenQ(pixelDelta).div(screenQ(width)))),
      this.span,
    );
  }
  zoom(pixel: number, width: number, factor: Q): Viewport {
    if (factor.compare(Q.zero) <= 0) throw new Error('Zoom factor must be positive.');
    const anchor = this.at(pixel, width),
      span = this.span.mul(factor);
    return new Viewport(anchor.sub(span.mul(screenQ(pixel).div(screenQ(width)))), span);
  }
  pinch(startMid: number, currentMid: number, width: number, factor: Q): Viewport {
    const span = this.span.mul(factor),
      anchor = this.at(startMid, width);
    return new Viewport(anchor.sub(span.mul(screenQ(currentMid).div(screenQ(width)))), span);
  }
  static fit(first?: Q, last?: Q): Viewport {
    if (!first || !last) return new Viewport();
    const extent = last.sub(first),
      span = extent.equals(Q.zero) ? Q.from(4n) : extent.mul(Q.from(7n, 5n));
    return new Viewport(first.sub(span.sub(extent).div(Q.from(2n))), span);
  }
}
export function label(time: Q): string {
  const text = time.denominator === 1n ? time.numerator.toString() : time.toString();
  return text.length <= 26 ? text : `${text.slice(0, 12)}…${text.slice(-9)}`;
}
export function demo(dense = false): TimelineDocument {
  const names = [
    'An idea arrives',
    'First sketch',
    'A conversation',
    'A new direction',
    'The working prototype',
    'Notes in the margin',
    'A useful discovery',
    'The first release',
    'A quiet refinement',
    'What comes next',
  ];
  const times = ['0', '1/3', '3', '7/2', '8', '10', '41/3', '17', '21', '24'];
  const events: PointEvent[] = names.map((title, i) => ({
    id: `sample-${i}`,
    time: times[i],
    metadata: {
      title,
      description:
        i === 1
          ? 'One third is exact, however far you zoom.'
          : 'A point in time. Add a note or move its exact coordinate.',
    },
  }));
  if (dense)
    for (let i = 0; i < 20000; i++)
      events.push({
        id: `dense-${i.toString().padStart(5, '0')}`,
        time: Q.from(10000000000n + BigInt(i), 1000000000n).toString(),
        metadata: { title: `Small moment ${i + 1}` },
      });
  return validateDocument({
    format: 'openchronology',
    version: 1,
    title: dense ? 'Twenty thousand tiny moments' : 'A notebook of moments',
    description: 'Every point has a place. Explore the spaces between them.',
    events,
  });
}
