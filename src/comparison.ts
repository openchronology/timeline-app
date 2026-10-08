// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Q, TimelineIndex, Viewport, DEFAULT_PRESENTATION } from './core.js';
import type { Frame, FrameGroup, PointEvent, TimePresentation } from './core.js';
import type { InstalledPlugin } from './plugins.js';
import { ViewportCache, regroup } from './remote-cache.js';
export type Cursor = { time: string; id: string } | null;
export interface EventPage {
  events: PointEvent[];
  next: Cursor;
}
export interface ComparisonSource {
  key: string;
  revision?: string;
  event_generation?: string;
  working?: boolean;
  title: string;
  presentation?: TimePresentation;
  plugins?: InstalledPlugin[];
  first?: string;
  last?: string;
  assets?: Record<string, string>;
  index?: TimelineIndex;
  query?: (query: Record<string, unknown>, signal?: AbortSignal) => Promise<Frame | EventPage>;
}
export interface ComparisonGroup extends FrameGroup {
  sourceKey?: string;
}
interface Track {
  source: ComparisonSource;
  scale: Q;
  offset: Q;
  cache: ViewportCache;
}
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
export function samePresentation(sources: ComparisonSource[]): boolean {
  const signature = (source: ComparisonSource) =>
    JSON.stringify({ ...DEFAULT_PRESENTATION, ...source.presentation });
  return sources.every((source) => signature(source) === signature(sources[0]));
}
export class ComparisonView {
  readonly tracks: Track[];
  plugins: InstalledPlugin[];
  conflicts: string[];
  presentation: TimePresentation;
  combined = false;
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
  replaceSource(source: ComparisonSource) {
    const track = this.tracks.find((t) => t.source.key === source.key);
    if (!track) return;
    track.source = source;
    track.cache.clear();
    const union = unionPlugins(this.tracks.map((t) => t.source));
    this.plugins = union.plugins;
    this.conflicts = union.conflicts;
  }
  transform(key: string, scale: Q, offset: Q) {
    if (scale.compare(Q.zero) <= 0) throw new Error('Scale must be positive.');
    const track = this.tracks.find((t) => t.source.key === key);
    if (!track) throw new Error('Unknown comparison timeline.');
    track.scale = scale;
    track.offset = offset;
    track.cache.clear();
  }
  fit(): Viewport {
    const bounds = this.tracks.flatMap((t) =>
      [t.source.first, t.source.last]
        .filter(Boolean)
        .map((q) => Q.parse(q!).mul(t.scale).add(t.offset)),
    );
    bounds.sort((a, b) => a.compare(b));
    return Viewport.fit(bounds[0], bounds.at(-1));
  }
  cached(view: Viewport, width: number, pixels: number): Frame | null {
    const frames: Frame[] = [];
    for (const track of this.tracks) {
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
          frame = track.cache.visible(sourceView);
        }
      }
      frames.push(this.mapFrame(track, frame));
    }
    return this.join(frames, view.threshold(width, pixels));
  }
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
  private mapFrame(track: Track, frame: Frame): Frame {
    return {
      ...frame,
      durations: frame.durations?.map((b) => ({
        ...b,
        id: track.source.key + ':' + b.id,
        startId: track.source.key + ':' + b.startId,
        endId: track.source.key + ':' + b.endId,
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
        ...(g.id ? { id: `${track.source.key}:${g.id}` } : {}),
        sourceKey: track.source.key,
      })),
    };
  }
  private join(frames: Frame[], threshold: Q): Frame {
    const frame = {
      durations: frames.flatMap((f) => f.durations ?? []),
      durationsTruncated: frames.some((f) => f.durationsTruncated),
      groups: frames.flatMap((f) => f.groups),
      visitedNodes: frames.reduce((n, f) => n + f.visitedNodes, 0),
    };
    return this.combined ? regroup(frame, threshold) : frame;
  }
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
    const events = candidates.slice(0, limit),
      last = events.at(-1);
    return {
      events,
      next: last && (more || candidates.length > limit) ? { time: last.time, id: last.id } : null,
    };
  }
  dispose() {
    for (const track of this.tracks) track.cache.clear();
  }
}
export function localEvents(
  index: TimelineIndex,
  lower: string,
  upper: string,
  after: Cursor,
  limit: number,
): EventPage {
  const events: PointEvent[] = [];
  scan: for (const [, bucket] of index.points.range(Q.parse(after?.time ?? lower), Q.parse(upper), {
    includeUpper: true,
  })) {
    let start = 0,
      end = bucket.length;
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
