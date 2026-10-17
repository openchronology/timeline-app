// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Comparing timelines (docs/comparison.md): two to eight on tracks side by side or combined, each
// aligned by a scale and offset, their plugins merged, and each fetched through its own cache.
import { Q, TimelineIndex, Viewport, DEFAULT_PRESENTATION } from './core.js';
import type {
  DurationBand,
  DurationEndpoint,
  Frame,
  FrameGroup,
  PointEvent,
  TimePresentation,
} from './core.js';
import type { InstalledPlugin } from './plugins.js';
import { ViewportCache, regroup } from './remote-cache.js';
/**
 * Where a page of moments ends: the last moment's time (an exact rational as a string) and
 * ID. The next page starts strictly after it in (time, id) order; `null` means "from the
 * start" when passed in and "no more pages" when returned.
 */
export type Cursor = { time: string; id: string } | null;
/** One page of moments in (time, id) order, and the cursor for the page after it. */
export interface EventPage {
  events: PointEvent[];
  next: Cursor;
}
/**
 * One timeline taking part in a comparison. A source is either local (`index` holds its
 * moments in memory: browser drafts, imported JSON, the open working timeline) or remote
 * (`query` asks the server or desktop store for overview windows and event pages); remote
 * sources are read through a per-track ViewportCache.
 */
export interface ComparisonSource {
  /** Unique within a comparison; it prefixes qualified moment and band IDs (`key:id`). */
  key: string;
  /** The saved revision and event generation, used by live refresh to spot changes. */
  revision?: string;
  event_generation?: string;
  /** True for the editor's own timeline, whose unsaved edits must not be replaced. */
  working?: boolean;
  title: string;
  presentation?: TimePresentation;
  plugins?: InstalledPlugin[];
  /** The earliest and latest moment times in source coordinates, for Fit all. */
  first?: string;
  last?: string;
  assets?: Record<string, string>;
  /** Its sensitive-content labels (#115). */
  labels?: string[];
  /** The in-memory index of a local source; when present, `query` is never called. */
  index?: TimelineIndex;
  /**
   * Reads a remote source: `{kind: 'overview', lower, upper, threshold}` answers a Frame,
   * `{kind: 'events', lower, upper, after, limit, id?}` an EventPage, all in source
   * coordinates. Rejects with an AbortError when `signal` fires.
   */
  query?: (query: Record<string, unknown>, signal?: AbortSignal) => Promise<Frame | EventPage>;
}
/** A frame group that remembers which source it came from (absent once groups are combined). */
export interface ComparisonGroup extends FrameGroup {
  sourceKey?: string;
}
/**
 * One source on the shared axis: `shared = original × scale + offset`, in exact rationals.
 * The cache holds windows in the source's own coordinates, so it is cleared whenever the
 * alignment or the source changes.
 */
interface Track {
  source: ComparisonSource;
  scale: Q;
  offset: Q;
  cache: ViewportCache;
}
/**
 * Merges the sources' installed plugins into one list for the view (docs/comparison.md).
 * Plugins are deduplicated by manifest ID in source order, so the first source's definition
 * wins; a plugin enabled in any source is enabled in the view. Sources whose manifest for the
 * same ID differs (version or code) are reported by plugin name in `conflicts`, once each.
 * The returned plugin objects are shallow copies, so enabling one never changes a source.
 */
export function unionPlugins(sources: ComparisonSource[]) {
  const plugins = new Map<string, InstalledPlugin>(),
    conflicts: string[] = [];
  for (const source of sources)
    for (const plugin of source.plugins ?? []) {
      const previous = plugins.get(plugin.manifest.id);
      if (previous && JSON.stringify(previous.manifest) !== JSON.stringify(plugin.manifest))
        conflicts.push(plugin.manifest.name);
      if (!previous) plugins.set(plugin.manifest.id, { ...plugin });
      else if (plugin.enabled) previous.enabled = true;
    }
  return { plugins: [...plugins.values()], conflicts: [...new Set(conflicts)] };
}
/**
 * Whether every source prints and parses time the same way. Each presentation is filled in
 * from DEFAULT_PRESENTATION first, so a source with no presentation matches one that spells
 * out the defaults. When this is false the editor asks for a common presentation before the
 * comparison starts. Assumes at least one source.
 */
export function samePresentation(sources: ComparisonSource[]): boolean {
  const signature = (source: ComparisonSource) =>
    JSON.stringify({ ...DEFAULT_PRESENTATION, ...source.presentation });
  return sources.every((source) => signature(source) === signature(sources[0]));
}
/**
 * A read-only view over two to eight timelines on one horizontal axis (docs/comparison.md).
 * Each track maps its source onto the shared axis with an affine transform; reads go the
 * other way, through the inverse transform, so query bounds and grouping thresholds reach
 * each source in its own coordinates. Results come back with times mapped onto the shared
 * axis and IDs qualified as `sourceKey:id`, so moments from different sources never collide.
 * With `combined` set, the tracks' groups are merged and regrouped as one timeline.
 */
export class ComparisonView {
  readonly tracks: Track[];
  /** The plugin union and its conflicting plugin names (see unionPlugins). */
  plugins: InstalledPlugin[];
  conflicts: string[];
  /** The common time presentation the view prints and parses with. */
  presentation: TimePresentation;
  /** Merge all tracks into one timeline instead of stacking them. */
  combined = false;
  /**
   * Starts every track unaligned (scale 1, offset 0) with an empty cache.
   * Throws unless there are two to eight sources with distinct keys; the per-account limit
   * (four for guests by default) is enforced by the caller.
   */
  constructor(
    sources: ComparisonSource[],
    presentation = sources[0]?.presentation ?? DEFAULT_PRESENTATION,
  ) {
    if (
      sources.length < 2 ||
      sources.length > 8 ||
      new Set(sources.map((s) => s.key)).size !== sources.length
    )
      throw new Error('Select two to eight different timelines.');
    this.tracks = sources.map((source) => ({
      source,
      scale: Q.one,
      offset: Q.zero,
      cache: new ViewportCache(),
    }));
    const union = unionPlugins(sources);
    this.plugins = union.plugins;
    this.conflicts = union.conflicts;
    this.presentation = presentation;
  }
  /**
   * Swaps in a newer copy of a source with the same key (live refresh), keeping its track's
   * alignment. Clears only that track's cache and recomputes the plugin union. Unknown keys
   * are ignored.
   */
  replaceSource(source: ComparisonSource) {
    const track = this.tracks.find((t) => t.source.key === source.key);
    if (!track) return;
    track.source = source;
    track.cache.clear();
    const union = unionPlugins(this.tracks.map((t) => t.source));
    this.plugins = union.plugins;
    this.conflicts = union.conflicts;
  }
  /**
   * Aligns one track: `shared = original × scale + offset`. The scale must be positive so
   * chronology is preserved (and so the inverse transform exists). Clears that track's cache,
   * whose windows were planned for the old alignment. Throws on a non-positive scale or an
   * unknown key.
   */
  transform(key: string, scale: Q, offset: Q) {
    if (scale.compare(Q.zero) <= 0) throw new Error('Scale must be positive.');
    const track = this.tracks.find((t) => t.source.key === key);
    if (!track) throw new Error('Unknown comparison timeline.');
    track.scale = scale;
    track.offset = offset;
    track.cache.clear();
  }
  /**
   * The Fit all viewport: every source's first and last moment, transformed onto the shared
   * axis, framed with Viewport.fit's margin. With no bounds at all (only empty sources),
   * Viewport.fit falls back to its default window.
   */
  fit(): Viewport {
    const bounds = this.tracks.flatMap((t) =>
      [t.source.first, t.source.last]
        .filter(Boolean)
        .map((q) => Q.parse(q!).mul(t.scale).add(t.offset)),
    );
    bounds.sort((a, b) => a.compare(b));
    return Viewport.fit(bounds[0], bounds.at(-1));
  }
  /**
   * The frame for a shared-axis view if every track can answer it without a fetch (local
   * sources always can; remote ones need a fresh covering window in their cache), else null.
   * `width` is the view's width in pixels and `pixels` the grouping distance on screen.
   * Synchronous, so the editor can draw at once and only fall back to `frame` on a miss.
   */
  cached(view: Viewport, width: number, pixels: number): Frame | null {
    const frames: Frame[] = [];
    for (const track of this.tracks) {
      // The inverse transform: original = (shared − offset) / scale, so the left edge maps
      // that way and the span only divides by the scale. Because width in pixels is
      // unchanged, the grouping threshold also shrinks or grows by the same scale.
      const sourceView = new Viewport(
        view.left.sub(track.offset).div(track.scale),
        view.span.div(track.scale),
      );
      const query = track.cache.plan(sourceView, width, pixels);
      const frame = track.source.index
        ? this.localFrame(track, sourceView, width, pixels)
        : track.cache.get(sourceView, query);
      if (!frame) return null;
      frames.push(this.mapFrame(track, frame));
    }
    return this.join(frames, view.threshold(width, pixels));
  }
  /** Last confirmed source windows remain drawable while new resolutions load. */
  visible(view: Viewport, width: number, pixels: number): Frame {
    const frames = this.tracks.map((track) => {
      const sourceView = new Viewport(
        view.left.sub(track.offset).div(track.scale),
        view.span.div(track.scale),
      );
      return this.mapFrame(
        track,
        track.source.index
          ? this.localFrame(track, sourceView, width, pixels)
          : track.cache.visible(sourceView),
      );
    });
    return this.join(frames, Q.zero);
  }
  /**
   * The frame for a shared-axis view, fetching each remote track's missing window and storing
   * it in that track's cache. Tracks are read one at a time, not in parallel. Throws an
   * AbortError if `signal` fires between reads (a stale viewport request is discarded), and
   * passes on a query's rejection, including ViewportCache.store refusing an oversized
   * response.
   */
  async frame(view: Viewport, width: number, pixels: number, signal?: AbortSignal): Promise<Frame> {
    const frames: Frame[] = [];
    // Serial reads keep aggregate transient memory and database load bounded.
    for (const track of this.tracks) {
      if (signal?.aborted) throw new DOMException('Comparison cancelled', 'AbortError');
      const sourceView = new Viewport(
        view.left.sub(track.offset).div(track.scale),
        view.span.div(track.scale),
      );
      let frame: Frame;
      if (track.source.index) frame = this.localFrame(track, sourceView, width, pixels);
      else {
        const query = track.cache.plan(sourceView, width, pixels);
        frame = track.cache.get(sourceView, query)!;
        if (!frame) {
          frame = (await track.source.query!({ kind: 'overview', ...query }, signal)) as Frame;
          if (signal?.aborted) throw new DOMException('Comparison cancelled', 'AbortError');
          track.cache.store(query, frame);
          // The window just stored answers its own query (and becomes the one drawn).
          frame = track.cache.get(sourceView, query) ?? track.cache.visible(sourceView);
        }
      }
      frames.push(this.mapFrame(track, frame));
    }
    return this.join(frames, view.threshold(width, pixels));
  }
  /**
   * A local source's overview straight from its index, in source coordinates. The index's
   * single-moment groups carry only an ID, so each is given its moment's metadata (which
   * renderers and plugins read) from `byId`.
   */
  private localFrame(track: Track, view: Viewport, width: number, pixels: number): Frame {
    const index = track.source.index!;
    const frame = index.frame(view, width, pixels);
    return {
      ...frame,
      groups: frame.groups.map((g) =>
        g.id ? { ...g, metadata: index.byId.get(g.id)?.metadata } : g,
      ),
    };
  }
  /**
   * Re-expresses a source frame on the shared axis: every time goes through
   * `× scale + offset` (exact, so no rounding drift between tracks), every ID is qualified
   * with the source key, and every group and band is tagged with `sourceKey`. Counts and
   * the grouping itself are unchanged; a positive scale keeps their order.
   */
  private mapFrame(track: Track, frame: Frame): Frame {
    // A duration band attached to a group; the frame's own `durations` get the same mapping.
    const band = (b: DurationBand): DurationBand => ({
      ...b,
      id: track.source.key + ':' + b.id,
      start: mapEndpoint(track, b.start),
      end: mapEndpoint(track, b.end),
      sourceKey: track.source.key,
      startTime: Q.parse(b.startTime).mul(track.scale).add(track.offset).toString(),
      endTime: Q.parse(b.endTime).mul(track.scale).add(track.offset).toString(),
      first: Q.parse(b.first).mul(track.scale).add(track.offset).toString(),
      last: Q.parse(b.last).mul(track.scale).add(track.offset).toString(),
    });
    return {
      ...frame,
      durations: frame.durations?.map((b) => ({
        ...b,
        id: track.source.key + ':' + b.id,
        start: mapEndpoint(track, b.start),
        end: mapEndpoint(track, b.end),
        sourceKey: track.source.key,
        startTime: Q.parse(b.startTime).mul(track.scale).add(track.offset).toString(),
        endTime: Q.parse(b.endTime).mul(track.scale).add(track.offset).toString(),
        first: Q.parse(b.first).mul(track.scale).add(track.offset).toString(),
        last: Q.parse(b.last).mul(track.scale).add(track.offset).toString(),
      })),
      groups: frame.groups.map((g) => ({
        ...g,
        first: Q.parse(g.first).mul(track.scale).add(track.offset).toString(),
        last: Q.parse(g.last).mul(track.scale).add(track.offset).toString(),
        // Only single-moment groups have an ID; summaries stay anonymous.
        ...(g.id ? { id: `${track.source.key}:${g.id}` } : {}),
        ...(g.duration ? { duration: band(g.duration) } : {}),
        sourceKey: track.source.key,
      })),
    };
  }
  /**
   * Concatenates the tracks' mapped frames. Stacked mode keeps them as they are (each group
   * still carries its `sourceKey`, so the renderer can put it on its track); combined mode
   * regroups everything at `threshold`, the shared-axis grouping distance, so nearby
   * moments from different sources merge.
   */
  private join(frames: Frame[], threshold: Q): Frame {
    const frame = {
      durations: frames.flatMap((f) => f.durations ?? []),
      durationsTruncated: frames.some((f) => f.durationsTruncated),
      groups: frames.flatMap((f) => f.groups),
      visitedNodes: frames.reduce((n, f) => n + f.visitedNodes, 0),
    };
    return this.combined ? regroup(frame, threshold) : frame;
  }
  /**
   * One page of the moments in a group, for the group inspector (disposable 25-moment pages).
   * A stacked group is read from its own source only; a combined group (no `sourceKey`) from
   * every track. Each track is asked for up to `limit` moments within the group's span,
   * mapped back into source coordinates; the candidates are mapped onto the shared axis,
   * qualified, merged in (time, qualified id) order and cut to `limit`. Moments carry their
   * source title and original time in metadata. `after` is a cursor from a previous page.
   * Remote tracks are queried one at a time; a query's rejection (including an abort) is
   * passed on.
   */
  async events(
    group: ComparisonGroup,
    after: Cursor = null,
    limit = 25,
    signal?: AbortSignal,
  ): Promise<EventPage> {
    const candidates: PointEvent[] = [];
    let more = false;
    for (const track of this.tracks) {
      if (group.sourceKey && group.sourceKey !== track.source.key) continue;
      let lower = Q.parse(group.first).sub(track.offset).div(track.scale).toString();
      const upper = Q.parse(group.last).sub(track.offset).div(track.scale).toString();
      let cursor: Cursor = null;
      // Translate the merged cursor into this track's own cursor. The merged order breaks
      // ties at one shared time by qualified ID (`key:id`), and every qualified ID of this
      // track starts with `prefix`, so at the cursor's time this track's moments are either
      // all before a foreign cursor ID or all after it:
      //  - the cursor is this track's own moment: resume right after its unqualified ID;
      //  - a foreign cursor sorting after `prefix`: all of this track's moments at that time
      //    were already shown, so skip them with an ID above any real one;
      //  - a foreign cursor sorting before `prefix`: none of them were shown, so start at
      //    that time inclusive, with no cursor.
      if (after) {
        const prefix = track.source.key + ':',
          own = after.id.startsWith(prefix);
        cursor = {
          time: Q.parse(after.time).sub(track.offset).div(track.scale).toString(),
          // Other sources at the cursor time are ordered by their qualified ID prefix.
          id: own ? after.id.slice(prefix.length) : 'z'.repeat(128),
        };
        if (!own && prefix > after.id) {
          lower = cursor.time;
          cursor = null;
        }
      }
      // A single-moment group of this track names its moment exactly (on the first page), so
      // it is read by ID instead of by span.
      const targetId =
        group.id &&
        BigInt(group.count) === 1n &&
        !after &&
        group.id.startsWith(track.source.key + ':')
          ? group.id.slice(track.source.key.length + 1)
          : undefined;
      const page =
        targetId && track.source.index
          ? {
              events: track.source.index.byId.has(targetId)
                ? [track.source.index.byId.get(targetId)!]
                : [],
              next: null,
            }
          : track.source.index
            ? localEvents(track.source.index, lower, upper, cursor, limit)
            : ((await track.source.query!(
                {
                  kind: 'events',
                  ...(targetId ? { id: targetId } : {}),
                  lower,
                  upper,
                  after: cursor,
                  limit,
                },
                signal,
              )) as EventPage);
      // Any track with more pages means the merged list may continue past this page.
      more ||= !!page.next;
      for (const event of page.events)
        candidates.push({
          ...event,
          id: `${track.source.key}:${event.id}`,
          time: Q.parse(event.time).mul(track.scale).add(track.offset).toString(),
          metadata: {
            ...event.metadata,
            comparisonSource: track.source.title,
            originalTime: event.time,
          },
        });
    }
    candidates.sort(
      (a, b) =>
        Q.parse(a.time).compare(Q.parse(b.time)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    // Each track gave at most `limit` moments after the cursor, so the first `limit` of the
    // merged candidates are exactly the next page; the rest are fetched again next time.
    const events = candidates.slice(0, limit),
      last = events.at(-1);
    return {
      events,
      next: last && (more || candidates.length > limit) ? { time: last.time, id: last.id } : null,
    };
  }
  /** Releases every track's cached windows when the comparison closes. */
  dispose() {
    for (const track of this.tracks) track.cache.clear();
  }
}
/**
 * A page of up to `limit` moments from an in-memory index with `lower <= time <= upper`,
 * strictly after the cursor `after` in (time, id) order: the local counterpart of the
 * server's `events` query. The index keeps one bucket of moments per distinct time, sorted
 * by ID. Reads `limit + 1` moments to learn whether another page exists without counting.
 */
export function localEvents(
  index: TimelineIndex,
  lower: string,
  upper: string,
  after: Cursor,
  limit: number,
): EventPage {
  const events: PointEvent[] = [];
  // Start the range at the cursor's time when there is one; should that be below `lower`,
  // the `lower` check inside skips the moments before it.
  scan: for (const [, bucket] of index.points.range(Q.parse(after?.time ?? lower), Q.parse(upper), {
    includeUpper: true,
  })) {
    let start = 0,
      end = bucket.length;
    // In the cursor's own bucket, binary-search the first moment whose ID sorts after the
    // cursor's ID (upper bound), so earlier ones are skipped without a linear scan.
    if (after && bucket[0]?.time === after.time)
      while (start < end) {
        const middle = Math.floor((start + end) / 2);
        if (bucket[middle].id <= after.id) start = middle + 1;
        else end = middle;
      }
    for (let i = start; i < bucket.length; i++) {
      if (Q.parse(bucket[i].time).compare(Q.parse(lower)) < 0) continue;
      events.push(bucket[i]);
      if (events.length > limit) break scan;
    }
  }
  const last = events[Math.min(limit, events.length) - 1];
  return {
    events: events.slice(0, limit),
    next: events.length > limit ? { time: last.time, id: last.id } : null,
  };
}
/**
 * Comparison bands are read-only; endpoints are re-expressed on the combined axis. A literal
 * time is transformed like any other time; an endpoint anchored to a moment keeps the anchor
 * and qualifies the moment's ID with the source key, as mapFrame does for the moment itself.
 */
function mapEndpoint(track: Track, endpoint: DurationEndpoint): DurationEndpoint {
  return typeof endpoint === 'string'
    ? Q.parse(endpoint).mul(track.scale).add(track.offset).toString()
    : { moment: track.source.key + ':' + endpoint.moment };
}
