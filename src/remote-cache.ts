// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Q, TimelineIndex, Viewport } from './core.js';
import type { Frame, FrameGroup, PointEvent, TimelineDocument } from './core.js';

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
  readonly changes = new Map<string, { before?: PointEvent; after?: PointEvent }>();
  private originals = new Map<string, PointEvent>();
  private replacing = false;
  private savingIds = new Set<string>();
  constructor(document: TimelineDocument) {
    super({ ...document, events: [] });
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
  evict(selectedId?: string) {
    for (const [id] of this.byId)
      if (id !== selectedId && !this.changes.has(id) && !this.savingIds.has(id)) {
        super.delete(id);
        this.originals.delete(id);
      }
    for (const [id] of this.originals)
      if (id !== selectedId && !this.changes.has(id) && !this.savingIds.has(id))
        this.originals.delete(id);
  }
  beginSave() {
    this.savingIds = new Set(this.changes.keys());
    return new Map(this.changes);
  }
  endSave(selectedId?: string) {
    this.savingIds.clear();
    this.evict(selectedId);
  }
  patch() {
    return {
      settings: { ...super.document(), events: undefined },
      changes: [...this.changes].map(([id, change]) => ({ id, event: change.after ?? null })),
    };
  }
  apply(document: TimelineDocument): TimelineDocument {
    const events = new Map(document.events.map((e) => [e.id, e]));
    for (const [id, change] of this.changes) {
      if (change.after) events.set(id, change.after);
      else events.delete(id);
    }
    return { ...super.document(), events: [...events.values()] };
  }
  accepted(
    sent: ReadonlyMap<string, { before?: PointEvent; after?: PointEvent }>,
    selectedId?: string,
  ) {
    for (const [id, saved] of sent) {
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
  overlay(frame: Frame, view: Viewport, threshold: Q): Frame {
    const groups: FrameGroup[] = [];
    for (const group of frame.groups) {
      let count = BigInt(group.count);
      for (const { before } of this.changes.values())
        if (
          before &&
          Q.parse(before.time).compare(Q.parse(group.first)) >= 0 &&
          Q.parse(before.time).compare(Q.parse(group.last)) <= 0
        )
          count--;
      if (count > 0n)
        groups.push(
          count === BigInt(group.count)
            ? group
            : {
                first: group.first,
                last: group.last,
                count: count.toString(),
                distinct: group.distinct,
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
    return regroup({ ...frame, groups }, threshold);
  }
}
/** Coarsen server summaries without reconstructing any concealed moments. */
export function regroup(frame: Frame, threshold: Q): Frame {
  const groups: FrameGroup[] = [];
  for (const group of [...frame.groups].sort((a, b) =>
    Q.parse(a.first).compare(Q.parse(b.first)),
  )) {
    const prev = groups.at(-1);
    if (
      prev &&
      (group.first === prev.first ||
        Q.parse(group.last).sub(Q.parse(prev.first)).compare(threshold) < 0)
    ) {
      groups[groups.length - 1] = {
        first: prev.first,
        last: Q.parse(group.last).compare(Q.parse(prev.last)) > 0 ? group.last : prev.last,
        count: (BigInt(prev.count) + BigInt(group.count)).toString(),
        distinct: prev.distinct + group.distinct - (prev.last === group.first ? 1 : 0),
      };
    } else groups.push(group);
  }
  return { ...frame, groups };
}
