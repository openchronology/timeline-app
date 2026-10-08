// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import {
  Q,
  TimelineIndex,
  Viewport,
  anchorOf,
  durationOverview,
  fixMissingAnchors,
  resolveDuration,
  collapses,
  coalesceGroups,
  durationGroups,
} from './core.js';
import type {
  Duration,
  DurationBand,
  Frame,
  FrameGroup,
  PointEvent,
  TimelineDocument,
} from './core.js';
export interface MomentChange {
  before?: PointEvent;
  after?: PointEvent;
}
export interface DurationChange {
  before?: Duration;
  after?: Duration;
}
export interface SavingChanges {
  moments: Map<string, MomentChange>;
  durations: Map<string, DurationChange>;
}

export interface WindowQuery {
  lower: string;
  upper: string;
  threshold: string;
}
const EMPTY = (): Frame => ({ groups: [], visitedNodes: 0 });
/** A single overscanned window, rather than a growing history of visited windows. */
export class ViewportCache {
  private entry?: { lower: Q; upper: Q; threshold: Q; frame: Frame; fetched: number };
  readonly maxGroups = 2048;
  readonly maxBytes = 8 * 1024 * 1024;
  constructor(private clock: () => number = Date.now) {}
  clear() {
    this.entry = undefined;
  }
  plan(view: Viewport, width: number, pixels: number): WindowQuery {
    const margin = view.span.div(Q.from(4n));
    let threshold = view.threshold(width, Math.max(1, pixels));
    const minimum = view.span.mul(Q.from(3n, 2n)).div(Q.from(1024n));
    if (threshold.compare(minimum) < 0) threshold = minimum;
    // Dyadic levels make neighboring zoom positions share an exact, bounded resolution.
    let exponent =
      threshold.numerator.toString(2).length - threshold.denominator.toString(2).length;
    let level =
      exponent >= 0 ? Q.from(1n << BigInt(exponent)) : Q.from(1n, 1n << BigInt(-exponent));
    if (level.compare(threshold) > 0) {
      exponent--;
      level = exponent >= 0 ? Q.from(1n << BigInt(exponent)) : Q.from(1n, 1n << BigInt(-exponent));
    }
    if (level.compare(minimum) < 0) level = minimum;
    return {
      lower: view.left.sub(margin).toString(),
      upper: view.right.add(margin).toString(),
      threshold: level.toString(),
    };
  }
  get(view: Viewport, query: WindowQuery): Frame | null {
    const e = this.entry;
    // A cache miss schedules a fetch; it does not invalidate the last confirmed window.
    if (
      !e ||
      e.threshold.compare(Q.parse(query.threshold)) !== 0 ||
      e.lower.compare(view.left) > 0 ||
      e.upper.compare(view.right) < 0 ||
      this.clock() - e.fetched > 30000
    ) {
      return null;
    }
    return this.visible(view);
  }
  store(query: WindowQuery, frame: Frame) {
    if (frame.groups.length > this.maxGroups || JSON.stringify(frame).length * 2 > this.maxBytes)
      throw new Error('Viewport response exceeds the browser cache budget.');
    // Preserve unchanged singleton objects by their stable moment IDs. Summaries are
    // authoritative for this response and never added to old summary counts.
    const previous = new Map(this.entry?.frame.groups.filter((g) => g.id).map((g) => [g.id, g]));
    const groups = frame.groups.map((group) => {
      const old = group.id ? previous.get(group.id) : undefined;
      return old && JSON.stringify(old) === JSON.stringify(group) ? old : group;
    });
    this.entry = {
      lower: Q.parse(query.lower),
      upper: Q.parse(query.upper),
      threshold: Q.parse(query.threshold),
      frame: { ...frame, groups },
      fetched: this.clock(),
    };
  }
  visible(view: Viewport): Frame {
    const frame = this.entry?.frame;
    return frame
      ? {
          ...frame,
          durations: frame.durations?.filter(
            (b) =>
              Q.parse(b.last).compare(view.left) >= 0 && Q.parse(b.first).compare(view.right) <= 0,
          ),
          groups: frame.groups.filter(
            (g) =>
              Q.parse(g.last).compare(view.left) >= 0 && Q.parse(g.first).compare(view.right) <= 0,
          ),
        }
      : EMPTY();
  }
}

/** Inspector reads are disposable; unsaved edits and their originals are explicitly pinned. */
export class RemoteWorkspace extends TimelineIndex {
  readonly changes = new Map<string, MomentChange>();
  readonly durationChanges = new Map<string, DurationChange>();
  private originals = new Map<string, PointEvent>();
  private durationOriginals = new Map<string, Duration>();
  private replacing = false;
  private savingIds = new Set<string>();
  private savingDurations = new Set<string>();
  constructor(document: TimelineDocument) {
    super({ ...document, events: [], durations: [] });
  }
  /** The saved head is on the server or disk; only loaded and edited durations live here. */
  protected override durationList(): Duration[] {
    return [];
  }
  get dirtyCount() {
    return this.changes.size + this.durationChanges.size;
  }
  loadDuration(duration: Duration) {
    if (this.durationChanges.has(duration.id)) return;
    this.durationOriginals.set(duration.id, duration);
    super.putDuration(duration);
  }
  override putDuration(duration: Duration) {
    const before =
      this.durationChanges.get(duration.id)?.before ?? this.durationOriginals.get(duration.id);
    super.putDuration(duration);
    const after = this.durations.get(duration.id);
    if (JSON.stringify(before) === JSON.stringify(after)) this.durationChanges.delete(duration.id);
    else this.durationChanges.set(duration.id, { before, after });
  }
  override deleteDuration(id: string): boolean {
    const before = this.durationChanges.get(id)?.before ?? this.durationOriginals.get(id);
    const deleted = super.deleteDuration(id);
    if (before) this.durationChanges.set(id, { before });
    else this.durationChanges.delete(id);
    return deleted;
  }
  load(event: PointEvent) {
    if (this.changes.has(event.id)) return;
    this.originals.set(event.id, event);
    this.replacing = true;
    try {
      super.put(event);
    } finally {
      this.replacing = false;
    }
  }
  override put(event: PointEvent) {
    const before = this.changes.get(event.id)?.before ?? this.originals.get(event.id);
    this.replacing = true;
    try {
      super.put(event);
    } finally {
      this.replacing = false;
    }
    if (JSON.stringify(before) === JSON.stringify(this.byId.get(event.id)))
      this.changes.delete(event.id);
    else this.changes.set(event.id, { before, after: this.byId.get(event.id) });
  }
  override delete(id: string): boolean {
    const before = this.changes.get(id)?.before ?? this.originals.get(id);
    const deleted = super.delete(id);
    if (!this.replacing) {
      if (before) this.changes.set(id, { before });
      else this.changes.delete(id);
    }
    return deleted;
  }
  evict(selectedId?: string, openDurationId?: string) {
    // Moments anchoring edited durations stay loaded so their bands can be placed locally.
    const endpoints = new Set(
      [...this.durationChanges.values()].flatMap((c) =>
        c.after ? [anchorOf(c.after.start), anchorOf(c.after.end)].filter((a) => a !== null) : [],
      ),
    );
    for (const [id] of this.byId)
      if (
        id !== selectedId &&
        !endpoints.has(id) &&
        !this.changes.has(id) &&
        !this.savingIds.has(id)
      ) {
        super.remove(id);
        this.originals.delete(id);
      }
    for (const [id] of this.durations)
      if (id !== openDurationId && !this.durationChanges.has(id) && !this.savingDurations.has(id)) {
        super.deleteDuration(id);
        this.durationOriginals.delete(id);
      }
    for (const [id] of this.originals)
      if (
        id !== selectedId &&
        !endpoints.has(id) &&
        !this.changes.has(id) &&
        !this.savingIds.has(id)
      )
        this.originals.delete(id);
  }
  beginSave(): SavingChanges {
    this.savingIds = new Set(this.changes.keys());
    this.savingDurations = new Set(this.durationChanges.keys());
    return { moments: new Map(this.changes), durations: new Map(this.durationChanges) };
  }
  endSave(selectedId?: string) {
    this.savingIds.clear();
    this.savingDurations.clear();
    this.evict(selectedId);
  }
  patch() {
    return {
      settings: { ...super.document(), events: undefined, durations: undefined },
      changes: [...this.changes].map(([id, change]) => ({ id, event: change.after ?? null })),
      durationChanges: [...this.durationChanges].map(([id, change]) => ({
        id,
        duration: change.after ?? null,
      })),
    };
  }
  /** Applies unsaved edits to a complete saved document. */
  apply(document: TimelineDocument): TimelineDocument {
    return applyChanges(document, super.document(), this.changes, this.durationChanges);
  }
  accepted(sent: SavingChanges, selectedId?: string) {
    for (const [id, saved] of sent.durations) {
      const desired = this.durations.get(id);
      if (saved.after) this.durationOriginals.set(id, saved.after);
      else this.durationOriginals.delete(id);
      if (JSON.stringify(desired) === JSON.stringify(saved.after)) this.durationChanges.delete(id);
      else if (desired || saved.after)
        this.durationChanges.set(id, { before: saved.after, after: desired });
      else this.durationChanges.delete(id);
    }
    for (const [id, saved] of sent.moments) {
      const desired = this.byId.get(id);
      if (saved.after) this.originals.set(id, saved.after);
      else this.originals.delete(id);
      if (JSON.stringify(desired) === JSON.stringify(saved.after)) this.changes.delete(id);
      else if (desired || saved.after)
        this.changes.set(id, { before: saved.after, after: desired });
      else this.changes.delete(id);
    }
    this.endSave(selectedId);
  }
  /**
   * Server bands reflect the saved head. Unsaved moment moves carry anchored endpoints with
   * them, and edited durations replace their saved bands.
   */
  overlayDurations(bands: readonly DurationBand[]): DurationBand[] {
    const saved = new Map(bands.map((b) => [b.id, b]));
    const savedTime = (band: DurationBand | undefined, moment: string) =>
      band && anchorOf(band.start) === moment
        ? band.startTime
        : band && anchorOf(band.end) === moment
          ? band.endTime
          : undefined;
    const result: DurationBand[] = [];
    for (const band of bands) {
      if (this.durationChanges.has(band.id)) continue;
      const moved = resolveDuration(
        band,
        (moment) => this.changes.get(moment)?.after?.time ?? savedTime(band, moment),
      );
      result.push(moved ? { ...moved, sourceKey: band.sourceKey } : band);
    }
    for (const [id, { after }] of this.durationChanges)
      if (after) {
        const band = resolveDuration(
          after,
          (moment) => this.momentTime(moment) ?? savedTime(saved.get(id), moment),
        );
        if (band) result.push(band);
      }
    return result;
  }
  overlay(frame: Frame, view: Viewport, threshold: Q): Frame {
    const groups: FrameGroup[] = [];
    // Singleton duration summaries are re-placed like bands, so local edits move them.
    const singles: DurationBand[] = [];
    const changedStarts = [...this.durationChanges.values()]
      .map(({ before }) => (before ? resolveDuration(before, (m) => this.momentTime(m)) : null))
      .filter((b): b is DurationBand => !!b && collapses(b, threshold))
      .map((b) => Q.parse(b.first));
    for (const group of frame.groups) {
      if (group.duration && group.count === '0') {
        singles.push(group.duration);
        continue;
      }
      let count = BigInt(group.count);
      let durations = BigInt(group.durationCount ?? '0');
      const inside = (time: Q) =>
        time.compare(Q.parse(group.first)) >= 0 && time.compare(Q.parse(group.last)) <= 0;
      for (const { before } of this.changes.values())
        if (before && inside(Q.parse(before.time))) count--;
      // Edited collapsed durations leave the saved cluster that contained their start.
      if (durations > 0n) for (const start of changedStarts) if (inside(start)) durations--;
      if (count > 0n || durations > 0n)
        groups.push(
          count === BigInt(group.count) && durations === BigInt(group.durationCount ?? '0')
            ? group
            : {
                first: group.first,
                last: group.last,
                count: count.toString(),
                distinct: count > 0n ? group.distinct : 0,
                ...(durations > 0n ? { durationCount: durations.toString() } : {}),
              },
        );
    }
    for (const { after } of this.changes.values())
      if (
        after &&
        Q.parse(after.time).compare(view.left) >= 0 &&
        Q.parse(after.time).compare(view.right) <= 0
      )
        groups.push({
          first: after.time,
          last: after.time,
          count: '1',
          distinct: 1,
          id: after.id,
          title: after.metadata.title,
          metadata: after.metadata,
        });
    const visible = this.overlayDurations([...(frame.durations ?? []), ...singles])
      .filter(
        (b) => Q.parse(b.last).compare(view.left) >= 0 && Q.parse(b.first).compare(view.right) <= 0,
      )
      .map((b) => ({ ...b, metadata: durationOverview(b.metadata) }));
    const bands = visible.filter((b) => !collapses(b, threshold));
    groups.push(
      ...durationGroups(
        visible
          .filter((b) => collapses(b, threshold))
          .map((band) => ({ first: band.first, last: band.last, count: 1, band })),
      ),
    );
    return regroup(
      {
        ...frame,
        groups,
        durations: bands.slice(0, 256),
        durationsTruncated: frame.durationsTruncated || bands.length > 256,
      },
      threshold,
    );
  }
}
export interface PendingPatch {
  changes: { id: string; event: PointEvent | null }[];
  durationChanges?: { id: string; duration: Duration | null }[];
}
/**
 * Applies moment and duration changes to a complete saved document. Anchors to deleted
 * moments become fixed at those moments' saved times.
 */
export function applyChanges(
  saved: TimelineDocument,
  settings: TimelineDocument,
  moments: ReadonlyMap<string, MomentChange>,
  durationEdits: ReadonlyMap<string, DurationChange>,
): TimelineDocument {
  const events = new Map(saved.events.map((e) => [e.id, e]));
  const lastTimes = new Map(saved.events.map((e) => [e.id, e.time]));
  for (const [id, change] of moments) {
    if (change.before) lastTimes.set(id, change.before.time);
    if (change.after) events.set(id, change.after);
    else events.delete(id);
  }
  const durations = new Map((saved.durations ?? []).map((d) => [d.id, d]));
  for (const [id, change] of durationEdits) {
    if (change.after) durations.set(id, change.after);
    else durations.delete(id);
  }
  const fixed = fixMissingAnchors(
    [...durations.values()],
    (id) => events.has(id),
    (id) => lastTimes.get(id),
  );
  return {
    ...settings,
    events: [...events.values()],
    ...(fixed.length ? { durations: fixed } : {}),
  };
}
/** Coarsen server summaries without reconstructing any concealed moments. */
export function regroup(frame: Frame, threshold: Q): Frame {
  return { ...frame, groups: coalesceGroups(frame.groups, threshold) };
}
