// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Timelines whose saved head is on a server or in a desktop file: the cache of viewport windows
// fetched from it, the RemoteWorkspace that keeps only loaded and edited entries in memory,
// and applying those edits to a saved document.
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
  canonicalRelationship,
  relationshipKey,
  refKey,
  edgeBand,
} from './core.js';
import type {
  EdgeBand,
  EntityRef,
  Relationship,
  Duration,
  DurationBand,
  Frame,
  FrameGroup,
  PointEvent,
  TimelineDocument,
} from './core.js';
/**
 * An unsaved edit to a moment: its saved version (`before`, absent for a new moment) and
 * its desired version (`after`, absent for a deletion).
 */
export interface MomentChange {
  before?: PointEvent;
  after?: PointEvent;
}
/** An unsaved edit to a duration, as MomentChange. */
export interface DurationChange {
  before?: Duration;
  after?: Duration;
}
/** A link's desired state; saving adds or removes it idempotently. */
export interface RelationshipChange {
  relationship: Relationship;
  related: boolean;
}
/** A copy of the unsaved edits taken when a save starts (see beginSave and accepted). */
export interface SavingChanges {
  moments: Map<string, MomentChange>;
  durations: Map<string, DurationChange>;
  relationships: Map<string, RelationshipChange>;
}

/**
 * A window to fetch: the time range (exact rational strings, inclusive) and the grouping
 * threshold, the distance below which the server summarises neighbouring moments into
 * one group. Sent as the overview query's bounds.
 */
export interface WindowQuery {
  lower: string;
  upper: string;
  threshold: string;
}
/** A frame with nothing in it, made fresh each call so no caller shares (and mutates) one. */
const EMPTY = (): Frame => ({ groups: [], visitedNodes: 0 });
/** A cached window in storable form (see snapshot and restore). */
export interface StoredWindow {
  lower: string;
  upper: string;
  threshold: string;
  frame: Frame;
}
/** The most recent change of view: what to fetch ahead of the reader. */
export type Motion = 'pan' | 'zoom-in' | 'zoom-out' | null;
/** A cached window: its range and threshold (parsed once), the server's frame for it, and bookkeeping. */
interface Entry {
  lower: Q;
  upper: Q;
  threshold: Q;
  frame: Frame;
  /** When the window was fetched, and when it last answered or was stored. */
  fetched: number;
  used: number;
  /** Its approximate size in memory: the JSON length in UTF-16 code units, two bytes each. */
  bytes: number;
}
/** The power of two at or below a positive rational. */
function dyadic(value: Q): Q {
  // The difference in bit lengths estimates log2 to within one; correct downward if the
  // estimate overshoots.
  let exponent = value.numerator.toString(2).length - value.denominator.toString(2).length;
  const power = (e: number) => (e >= 0 ? Q.from(1n << BigInt(e)) : Q.from(1n, 1n << BigInt(-e)));
  if (power(exponent).compare(value) > 0) exponent--;
  return power(exponent);
}
/** log2 of a positive ratio, to the nearest integer below or at it; enough to rank levels. */
function octaves(a: Q, b: Q): number {
  const ratio = a.div(b);
  return Math.abs(ratio.numerator.toString(2).length - ratio.denominator.toString(2).length);
}
/** Whether a window's range contains [lower, upper]. */
const covers = (e: { lower: Q; upper: Q }, lower: Q, upper: Q) =>
  e.lower.compare(lower) <= 0 && e.upper.compare(upper) >= 0;
/**
 * A running cache of overscanned windows at several resolutions, for timelines whose saved
 * head lives on the server or in a desktop file. Views are answered from any fresh window
 * of their resolution that covers them; `predict` names the windows to fetch ahead of the
 * reader (around the view, and one level coarser and finer), and windows far from the view,
 * in position or resolution, are released first when the budget is reached.
 */
export class ViewportCache {
  private entries: Entry[] = [];
  private focus?: { view: Viewport; threshold: Q };
  /** The window last drawn, which keeps the screen steady while the next one is fetched. */
  private shown?: Entry;
  /** One response's limits; a response beyond them is refused. */
  readonly maxGroups = 2048;
  readonly maxBytes = 8 * 1024 * 1024;
  /** The whole cache's limits. */
  readonly maxEntries = 16;
  readonly totalBytes = 24 * 1024 * 1024;
  /** A window answers views for 30 seconds; it is kept, for display while refetching, for five minutes. */
  readonly freshFor = 30000;
  readonly keepFor = 300000;
  /** `clock` gives the time in milliseconds; tests pass a fake one. */
  constructor(private clock: () => number = Date.now) {}
  /** Forgets every window (the source changed revision or alignment). */
  clear() {
    this.entries = [];
    this.shown = undefined;
  }
  /** The number of cached windows. */
  get size() {
    return this.entries.length;
  }
  /** The cache's approximate memory use, the sum of the windows' estimates. */
  get bytes() {
    return this.entries.reduce((total, e) => total + e.bytes, 0);
  }
  /** The resolution and window to fetch for a view; dyadic levels let nearby zooms share one. */
  plan(view: Viewport, width: number, pixels: number): WindowQuery {
    // A quarter of the view on each side, so small pans stay within the window.
    const margin = view.span.div(Q.from(4n));
    const threshold = this.level(view, width, pixels);
    return {
      lower: view.left.sub(margin).toString(),
      upper: view.right.add(margin).toString(),
      threshold: threshold.toString(),
    };
  }
  /**
   * The grouping threshold to ask for. Starts from the view's own (the time `pixels` wide on
   * screen), raised so a planned window (1.5 view widths) holds at most about 1,024 groups,
   * then rounded down to a power of two: slightly different zooms ask for the same
   * threshold and so can share windows. Never below that minimum.
   */
  private level(view: Viewport, width: number, pixels: number): Q {
    let threshold = view.threshold(width, Math.max(1, pixels));
    const minimum = view.span.mul(Q.from(3n, 2n)).div(Q.from(1024n));
    if (threshold.compare(minimum) < 0) threshold = minimum;
    const level = dyadic(threshold);
    return level.compare(minimum) < 0 ? minimum : level;
  }
  /**
   * The cached frame for a view at the planned threshold, cut to the view, or null on a
   * miss. Only windows of exactly that threshold that cover the whole view and were fetched
   * within `freshFor` count; the newest wins. Records the view as the cache's focus (for
   * eviction) and the window as the one shown.
   */
  get(view: Viewport, query: WindowQuery): Frame | null {
    const threshold = Q.parse(query.threshold),
      now = this.clock();
    this.focus = { view, threshold };
    // A cache miss schedules a fetch; it does not invalidate confirmed windows.
    const entry = this.entries
      .filter(
        (e) =>
          e.threshold.compare(threshold) === 0 &&
          covers(e, view.left, view.right) &&
          now - e.fetched <= this.freshFor,
      )
      .sort((a, b) => b.fetched - a.fetched)[0];
    if (!entry) return null;
    entry.used = now;
    this.shown = entry;
    return this.cut(entry.frame, view);
  }
  /**
   * Caches the server's frame for a planned window, then evicts down to budget. Throws
   * (caching nothing) if one response exceeds `maxGroups` or `maxBytes`.
   */
  store(query: WindowQuery, frame: Frame) {
    const bytes = JSON.stringify(frame).length * 2;
    if (frame.groups.length > this.maxGroups || bytes > this.maxBytes)
      throw new Error('Viewport response exceeds the browser cache budget.');
    // Preserve unchanged singleton objects by their stable moment IDs. Summaries are
    // authoritative for this response and never added to old summary counts.
    const previous = new Map(
      this.entries.flatMap((e) => e.frame.groups.filter((g) => g.id).map((g) => [g.id, g])),
    );
    const groups = frame.groups.map((group) => {
      const old = group.id ? previous.get(group.id) : undefined;
      return old && JSON.stringify(old) === JSON.stringify(group) ? old : group;
    });
    const now = this.clock(),
      entry: Entry = {
        lower: Q.parse(query.lower),
        upper: Q.parse(query.upper),
        threshold: Q.parse(query.threshold),
        frame: { ...frame, groups },
        fetched: now,
        used: now,
        bytes,
      };
    // A window replaces the windows of its resolution that it contains.
    this.entries = this.entries.filter(
      (e) => e.threshold.compare(entry.threshold) !== 0 || !covers(entry, e.lower, e.upper),
    );
    this.entries.push(entry);
    this.evict(entry);
  }
  /** The confirmed data to show for a view while its own window is fetched. */
  visible(view: Viewport): Frame {
    return this.nearest(view)?.frame ?? EMPTY();
  }
  /**
   * The best stand-in for a view while its own window is fetched: the window last drawn,
   * if it overlaps the view, so that visible moments and their grouping stay put; else a
   * window covering the view (or overlapping it most), at the resolution closest to
   * `threshold`, finer before coarser, newest first.
   */
  nearest(view: Viewport, threshold?: Q): { frame: Frame; threshold: Q } | null {
    const overlap = (e: Entry) => {
      const lower = e.lower.compare(view.left) > 0 ? e.lower : view.left,
        upper = e.upper.compare(view.right) < 0 ? e.upper : view.right;
      return upper.compare(lower) > 0 ? upper.sub(lower).div(view.span).toApproximateNumber() : 0;
    };
    // Compared element by element: coverage (else more overlap first), distance in
    // resolution, finer before coarser, newest first.
    const rank = (e: Entry) => [
      covers(e, view.left, view.right) ? 0 : 1 - overlap(e),
      threshold ? octaves(e.threshold, threshold) : 0,
      threshold && e.threshold.compare(threshold) > 0 ? 1 : 0,
      -e.fetched,
    ];
    const shown = this.shown;
    const best =
      shown && this.entries.includes(shown) && overlap(shown) > 0
        ? shown
        : [...this.entries].sort((a, b) => {
            const x = rank(a),
              y = rank(b);
            for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
            return 0;
          })[0];
    if (!best) return null;
    this.shown = best;
    return { frame: this.cut(best.frame, view), threshold: best.threshold };
  }
  /**
   * Windows worth fetching ahead of the reader, most likely first: a wide window at the
   * view's resolution for panning, and windows one level coarser and finer for zooming,
   * ordered by the latest motion. Windows already fresh in the cache are left out; each
   * stays within the server's limit of about 1,024 groups (width / 1,024 ≤ threshold).
   */
  predict(view: Viewport, width: number, pixels: number, motion: Motion = null): WindowQuery[] {
    const level = this.level(view, width, pixels),
      span = view.span,
      now = this.clock();
    const around = (threshold: Q, margin: Q): WindowQuery | null => {
      // Narrow the margin to fit the response limit; a window must still cover the view.
      const widest = threshold.mul(Q.from(1024n)),
        room = widest.sub(span).div(Q.from(2n));
      if (room.compare(Q.zero) < 0) return null;
      const side = margin.compare(room) > 0 ? room : margin;
      return {
        lower: view.left.sub(side).toString(),
        upper: view.right.add(side).toString(),
        threshold: threshold.toString(),
      };
    };
    const pan = around(level, span.mul(Q.from(2n))),
      out = around(level.mul(Q.from(2n)), span.mul(Q.from(2n))),
      zoomIn = around(level.div(Q.from(2n)), span.div(Q.from(2n)));
    const order =
      motion === 'zoom-in'
        ? [zoomIn, pan, out]
        : motion === 'zoom-out'
          ? [out, pan, zoomIn]
          : [pan, out, zoomIn];
    return order.filter(
      (q): q is WindowQuery =>
        !!q &&
        !this.entries.some(
          (e) =>
            e.threshold.compare(Q.parse(q.threshold)) === 0 &&
            covers(e, Q.parse(q.lower), Q.parse(q.upper)) &&
            now - e.fetched <= this.freshFor,
        ),
    );
  }
  /** The cached windows, newest first, for storage outside the page. */
  snapshot(): StoredWindow[] {
    return [...this.entries]
      .sort((a, b) => b.fetched - a.fetched)
      .map((e) => ({
        lower: e.lower.toString(),
        upper: e.upper.toString(),
        threshold: e.threshold.toString(),
        frame: e.frame,
      }));
  }
  /**
   * Adds stored windows of the same timeline revision. They count as fetched now: a
   * revision's windows never change, and the caller has just confirmed the revision.
   * Windows already cached, or beyond one response's limits, are skipped.
   */
  restore(windows: readonly StoredWindow[]) {
    const now = this.clock();
    for (const w of windows) {
      const threshold = Q.parse(w.threshold),
        lower = Q.parse(w.lower),
        upper = Q.parse(w.upper);
      const bytes = JSON.stringify(w.frame).length * 2;
      if (w.frame.groups.length > this.maxGroups || bytes > this.maxBytes) continue;
      if (this.entries.some((e) => e.threshold.compare(threshold) === 0 && covers(e, lower, upper)))
        continue;
      this.entries.push({
        lower,
        upper,
        threshold,
        frame: w.frame,
        fetched: now,
        used: now,
        bytes,
      });
    }
    while (this.entries.length > this.maxEntries || this.bytes > this.totalBytes)
      this.entries.pop();
  }
  /** Releases every window but those covering `view` (all of them without one). */
  release(view?: Viewport) {
    this.entries = view ? this.entries.filter((e) => covers(e, view.left, view.right)) : [];
  }
  /**
   * Drops windows past their keeping time, then the windows farthest from the view while
   * over budget: by resolution (in octaves), position (in widths of the view or window) and
   * time since last use (in minutes). The window serving the view and `kept` stay.
   */
  private evict(kept: Entry) {
    const now = this.clock();
    this.entries = this.entries.filter((e) => e === kept || now - e.used <= this.keepFor);
    const focus = this.focus;
    const distance = (e: Entry) => {
      if (!focus) return (now - e.used) / 60000;
      const { view, threshold } = focus;
      const gap =
        e.upper.compare(view.left) < 0
          ? view.left.sub(e.upper)
          : e.lower.compare(view.right) > 0
            ? e.lower.sub(view.right)
            : Q.zero;
      const scale = e.upper.sub(e.lower).compare(view.span) > 0 ? e.upper.sub(e.lower) : view.span;
      return (
        octaves(e.threshold, threshold) +
        gap.div(scale).toApproximateNumber() +
        (now - e.used) / 60000
      );
    };
    const serving = (e: Entry) =>
      e === kept ||
      (!!focus &&
        e.threshold.compare(focus.threshold) === 0 &&
        covers(e, focus.view.left, focus.view.right));
    while (this.entries.length > this.maxEntries || this.bytes > this.totalBytes) {
      const candidates = this.entries.filter((e) => !serving(e));
      if (!candidates.length) break;
      const farthest = candidates.reduce((a, b) => (distance(b) > distance(a) ? b : a));
      this.entries = this.entries.filter((e) => e !== farthest);
    }
  }
  /** A window's frame limited to the groups and bands that reach into the view (edges inclusive). */
  private cut(frame: Frame, view: Viewport): Frame {
    return {
      ...frame,
      durations: frame.durations?.filter(
        (b) => Q.parse(b.last).compare(view.left) >= 0 && Q.parse(b.first).compare(view.right) <= 0,
      ),
      groups: frame.groups.filter(
        (g) => Q.parse(g.last).compare(view.left) >= 0 && Q.parse(g.first).compare(view.right) <= 0,
      ),
    };
  }
}

/**
 * Inspector reads are disposable; unsaved edits and their originals are explicitly pinned.
 *
 * The in-memory side of a timeline whose saved head is on a server or in a desktop file. It
 * is a TimelineIndex holding only what was loaded (moments and durations being inspected
 * or edited) plus the unsaved changes against the saved versions. The chart is drawn from
 * server frames with these changes laid over them (`overlay`); saving sends the changes
 * (`patch`) and, once accepted, makes the sent versions the new originals.
 */
export class RemoteWorkspace extends TimelineIndex {
  /** Unsaved edits by ID; an edit undone back to the saved version is removed. */
  readonly changes = new Map<string, MomentChange>();
  readonly durationChanges = new Map<string, DurationChange>();
  readonly relationshipChanges = new Map<string, RelationshipChange>();
  /** The saved versions of loaded entities, the `before` of their first edit. */
  private originals = new Map<string, PointEvent>();
  private durationOriginals = new Map<string, Duration>();
  /**
   * Set while a moment is being replaced in place, so a delete reached from inside put is
   * not recorded as a deletion. (TimelineIndex.put currently removes through `remove`, not
   * `delete`, so this only guards against that changing.)
   */
  private replacing = false;
  /** Entities whose changes a save in progress has sent; they stay loaded until it ends. */
  private savingIds = new Set<string>();
  private savingDurations = new Set<string>();
  /** Starts from the document's settings; its moments, durations and links stay on the server. */
  constructor(document: TimelineDocument) {
    super({ ...document, events: [], durations: [], relationships: [] });
  }
  /** The saved head is on the server or disk; only loaded and edited durations live here. */
  protected override durationList(): Duration[] {
    return [];
  }
  /** Likewise links: only unsaved ones are known here, kept in relationshipChanges. */
  protected override relationshipList(): Relationship[] {
    return [];
  }
  /** How many unsaved edits there are, of every kind. */
  get dirtyCount() {
    return this.changes.size + this.durationChanges.size + this.relationshipChanges.size;
  }
  /** Links two entities and records the link as wanted. */
  override relate(a: EntityRef, b: EntityRef): Relationship {
    const relationship = super.relate(a, b);
    this.relationshipChanges.set(relationshipKey(relationship), { relationship, related: true });
    return relationship;
  }
  /**
   * Records the link between two entities as unwanted. Always reports success: the link may
   * exist only on the server, which removes it idempotently when saving.
   */
  override unrelate(a: EntityRef, b: EntityRef): boolean {
    const relationship = canonicalRelationship(a, b);
    super.unrelate(a, b);
    this.relationshipChanges.set(relationshipKey(relationship), { relationship, related: false });
    return true;
  }
  /** Adds a saved duration read from the server, unless an unsaved edit of it is already here. */
  loadDuration(duration: Duration) {
    if (this.durationChanges.has(duration.id)) return;
    this.durationOriginals.set(duration.id, duration);
    super.putDuration(duration);
  }
  /** Edits a duration, recording the change against its saved version (or dropping it if equal). */
  override putDuration(duration: Duration) {
    const before =
      this.durationChanges.get(duration.id)?.before ?? this.durationOriginals.get(duration.id);
    super.putDuration(duration);
    const after = this.durations.get(duration.id);
    if (JSON.stringify(before) === JSON.stringify(after)) this.durationChanges.delete(duration.id);
    else this.durationChanges.set(duration.id, { before, after });
  }
  /** Deletes a duration: a deletion of the saved one, or simply forgetting a new one. */
  override deleteDuration(id: string): boolean {
    const before = this.durationChanges.get(id)?.before ?? this.durationOriginals.get(id);
    const deleted = super.deleteDuration(id);
    if (before) this.durationChanges.set(id, { before });
    else this.durationChanges.delete(id);
    return deleted;
  }
  /** Adds a saved moment read from the server, unless an unsaved edit of it is already here. */
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
  /**
   * Adds or edits a moment, recording the change against its saved version. Comparing the
   * normalised stored moment with that version drops the change when an edit returns to it.
   */
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
  /** Deletes a moment: a deletion of the saved one, or simply forgetting a new one. */
  override delete(id: string): boolean {
    const before = this.changes.get(id)?.before ?? this.originals.get(id);
    const deleted = super.delete(id);
    if (!this.replacing) {
      if (before) this.changes.set(id, { before });
      else this.changes.delete(id);
    }
    return deleted;
  }
  /**
   * Drops loaded moments and durations nothing needs any more. `retained` lists entities the
   * editor may still change (those in its undo and redo history): they keep their saved
   * originals, so undoing an edit and redoing it is still an edit rather than an addition.
   */
  evict(
    selectedId?: string,
    openDurationId?: string,
    retained: { moments?: ReadonlySet<string>; durations?: ReadonlySet<string> } = {},
  ) {
    // Moments anchoring edited durations stay loaded so their bands can be placed locally.
    const endpoints = new Set(
      [...this.durationChanges.values()].flatMap((c) =>
        c.after ? [anchorOf(c.after.start), anchorOf(c.after.end)].filter((a) => a !== null) : [],
      ),
    );
    const keepMoment = (id: string) =>
      id === selectedId ||
      endpoints.has(id) ||
      this.changes.has(id) ||
      this.savingIds.has(id) ||
      !!retained.moments?.has(id);
    for (const [id] of this.byId)
      if (!keepMoment(id)) {
        super.remove(id);
        this.originals.delete(id);
      }
    for (const [id] of this.durations)
      if (
        id !== openDurationId &&
        !this.durationChanges.has(id) &&
        !this.savingDurations.has(id) &&
        !retained.durations?.has(id)
      ) {
        super.deleteDuration(id);
        this.durationOriginals.delete(id);
      }
    for (const [id] of this.originals) if (!keepMoment(id)) this.originals.delete(id);
  }
  /**
   * Drops the unsaved change to moment `id` and what was loaded of it, so its saved version
   * is read again (choosing the saved version over a conflicting edit, #165).
   */
  discardMoment(id: string) {
    this.changes.delete(id);
    this.originals.delete(id);
    super.remove(id);
  }
  /** As discardMoment, for duration `id`. */
  discardDuration(id: string) {
    this.durationChanges.delete(id);
    this.durationOriginals.delete(id);
    super.deleteDuration(id);
  }
  /**
   * Marks the current changes as being saved (their entities stay loaded meanwhile) and
   * returns a copy to send. Edits made during the save keep accumulating in `changes`.
   */
  beginSave(): SavingChanges {
    this.savingIds = new Set(this.changes.keys());
    this.savingDurations = new Set(this.durationChanges.keys());
    return {
      moments: new Map(this.changes),
      durations: new Map(this.durationChanges),
      relationships: new Map(this.relationshipChanges),
    };
  }
  /** Ends a save (accepted or not) and releases what it no longer needs. */
  endSave(selectedId?: string) {
    this.savingIds.clear();
    this.savingDurations.clear();
    this.evict(selectedId);
  }
  /** The unsaved edits in the save request's form: settings, then each change's desired state (null to delete). */
  patch() {
    return {
      settings: { ...super.document(), events: undefined, durations: undefined },
      changes: [...this.changes].map(([id, change]) => ({ id, event: change.after ?? null })),
      durationChanges: [...this.durationChanges].map(([id, change]) => ({
        id,
        duration: change.after ?? null,
      })),
      relationshipChanges: [...this.relationshipChanges.values()].map(
        ({ relationship, related }) => ({ ...relationship, related }),
      ),
    };
  }
  /** Applies unsaved edits to a complete saved document. */
  apply(document: TimelineDocument): TimelineDocument {
    return applyChanges(
      document,
      super.document(),
      this.changes,
      this.durationChanges,
      this.relationshipChanges,
    );
  }
  /**
   * After the server accepted `sent`: the sent versions become the saved originals, and
   * each change is dropped if nothing changed since it was sent, or kept as an edit from
   * the newly saved version to what the person has made of it during the save.
   */
  accepted(sent: SavingChanges, selectedId?: string) {
    // A link edited again while saving keeps its newer state.
    for (const [key, saved] of sent.relationships)
      if (this.relationshipChanges.get(key)?.related === saved.related)
        this.relationshipChanges.delete(key);
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
  /**
   * Lays the unsaved edits over a server frame of the saved head: an edited or deleted
   * moment is taken out of the summary that held its saved time (by count only; summaries
   * never reveal their members) and its new version added as its own group if in view;
   * durations and links are re-placed by overlayDurations and overlayEdges; then groups are
   * merged again at `threshold`. At most 256 bands are drawn; the rest are flagged
   * truncated.
   */
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
        // Unsaved durations can push a window past 256 that the server counted under it.
        ...(!frame.durationsTruncated && bands.length > 256
          ? { durationsTotal: bands.length }
          : {}),
        edges: this.overlayEdges(frame.edges ?? [], view, threshold),
      },
      threshold,
    );
  }
  /**
   * Saved arcs follow unsaved moves of their endpoints; unsaved links appear when both
   * endpoints are loaded, and unlinked or deleted ones disappear.
   */
  overlayEdges(edges: readonly EdgeBand[], view: Viewport, threshold: Q): EdgeBand[] {
    const local = (key: string, saved: string | undefined) => {
      if (key.startsWith('m:')) {
        const change = this.changes.get(key.slice(2));
        if (change && !change.after) return undefined;
        return change?.after?.time ?? this.byId.get(key.slice(2))?.time ?? saved;
      }
      const id = key.slice(2),
        change = this.durationChanges.get(id);
      if (change && !change.after) return undefined;
      const duration = change?.after ?? this.durations.get(id);
      return duration
        ? (resolveDuration(duration, (m) => this.momentTime(m))?.startTime ?? saved)
        : saved;
    };
    const result = new Map<string, EdgeBand>();
    for (const edge of edges) {
      if (this.relationshipChanges.get(edge.id)?.related === false) continue;
      const moved = edgeBand(edge, (key) =>
        local(key, key === refKey(edge.a) ? edge.aTime : edge.bTime),
      );
      if (moved) result.set(edge.id, { ...moved, sourceKey: edge.sourceKey });
    }
    for (const [key, { relationship, related }] of this.relationshipChanges)
      if (related && !result.has(key)) {
        const band = edgeBand(relationship, (k) => local(k, undefined));
        if (band) result.set(key, band);
      }
    return [...result.values()].filter(
      (e) =>
        Q.parse(e.last).compare(view.left) >= 0 &&
        Q.parse(e.first).compare(view.right) <= 0 &&
        !collapses(e, threshold),
    );
  }
}
/** The changes part of a save request (see RemoteWorkspace.patch), as stored or sent. */
export interface PendingPatch {
  changes: { id: string; event: PointEvent | null }[];
  durationChanges?: { id: string; duration: Duration | null }[];
  relationshipChanges?: (Relationship & { related: boolean })[];
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
  relationshipEdits: ReadonlyMap<string, RelationshipChange> = new Map(),
): TimelineDocument {
  const events = new Map(saved.events.map((e) => [e.id, e]));
  // Where each moment was last saved, which anchors of deleted moments are fixed to.
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
  const links = new Map((saved.relationships ?? []).map((r) => [relationshipKey(r), r]));
  for (const [key, { relationship, related }] of relationshipEdits)
    if (related) links.set(key, relationship);
    else links.delete(key);
  // Deleting an entity removes its links.
  const exists = (ref: EntityRef) =>
    'moment' in ref ? events.has(ref.moment) : durations.has(ref.duration);
  const relationships = [...links.values()].filter((r) => exists(r.a) && exists(r.b));
  return {
    ...settings,
    events: [...events.values()],
    ...(fixed.length ? { durations: fixed } : {}),
    ...(relationships.length ? { relationships } : {}),
  };
}
/** Coarsen server summaries without reconstructing any concealed moments. */
export function regroup(frame: Frame, threshold: Q): Frame {
  return { ...frame, groups: coalesceGroups(frame.groups, threshold) };
}
