// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Live updates of the server timelines on screen: an event stream (or polling, on the desktop
// or without one) says when one has a new revision, and it is refreshed.
/** A server timeline on screen and the revision currently shown (a decimal string). */
export interface LiveTimeline {
  id: string;
  revision: string;
}
/** What live updates need from the editor. */
interface Host {
  /** The server timelines on screen: the open one, or every source of a comparison (up to 8). */
  sources(): LiveTimeline[];
  /** Whether a server is reachable at all (false offline). */
  available(): boolean;
  /** True in the desktop app, which polls instead of streaming. */
  native(): boolean;
  /** Reads a timeline's latest revision (the small `/revision` endpoint). */
  check(id: string): Promise<LiveTimeline>;
  /** Brings a timeline up to `revision` (headers, its viewport cache, the visible frame). */
  refresh(id: string, revision: string): Promise<void>;
  /** Access to a timeline was lost (403/404 or the stream's `access` event). */
  denied(id?: string): void;
}
/**
 * Push invalidates cache revisions; native/disconnected transports use bounded metadata polling.
 *
 * Keeps the editor's server timelines current (docs/comparison.md#live-refresh). In the
 * browser one EventSource on `/api/live` covers every source and announces new revisions;
 * while it is not connected (and always on the desktop) each source's revision is polled
 * every five seconds. Changes are queued and refreshed one at a time. Nothing runs while
 * the document is hidden. Returns `update` (call it when the sources change or the page is
 * shown again), `pause` (drop the stream and queue, e.g. for the back-forward cache) and
 * `close` (stop for good).
 */
export function liveUpdates(host: Host) {
  // `key` is the sorted, comma-joined source IDs the stream was opened for; `busy` is held by
  // one refresh queue run or one polling pass at a time, so the server sees at most one
  // request from here at once.
  let stream: EventSource | undefined,
    key = '',
    busy = false,
    closed = false;
  /** Revisions announced but not yet refreshed, by timeline ID; a newer one replaces an older. */
  const pending = new Map<string, string>();
  /** Closes the stream; the next update opens a new one. */
  function disconnect() {
    stream?.close();
    stream = undefined;
    key = '';
  }
  /**
   * Refreshes queued timelines one by one, in the order announced, skipping any already at
   * that revision or no longer on screen. A failed refresh is dropped: the next announcement
   * or poll brings it back.
   */
  async function drain() {
    if (busy || closed || document.hidden) return;
    busy = true;
    try {
      while (pending.size && !document.hidden && !closed) {
        const [id, revision] = pending.entries().next().value!;
        pending.delete(id);
        const current = host.sources().find((s) => s.id === id);
        if (current && current.revision !== revision)
          try {
            await host.refresh(id, revision);
          } catch {}
      }
    } finally {
      busy = false;
    }
  }
  /** Queues an announced revision and starts refreshing. */
  function changed(id: string, revision: string) {
    pending.set(id, revision);
    void drain();
  }
  /**
   * Reconciles with the current sources: stops when hidden, closed, offline or with nothing
   * to watch; reopens the stream when the set of sources changed; and when the stream is
   * not (yet) open, polls each source's revision in turn. Polling a timeline answered with
   * 403 or 404 reports it denied. Also runs every five seconds and on visibility changes.
   */
  async function update() {
    const sources = host.sources();
    if (closed || document.hidden || !host.available() || !sources.length) {
      disconnect();
      pending.clear();
      return;
    }
    const next = sources
      .map((s) => s.id)
      .sort()
      .join(',');
    if (!host.native() && typeof EventSource !== 'undefined' && key !== next) {
      disconnect();
      key = next;
      stream = new EventSource('/api/live?timelines=' + encodeURIComponent(next));
      // Revisions are integer strings; anything else is ignored rather than trusted.
      stream.addEventListener('revision', (event) => {
        try {
          const message = JSON.parse((event as MessageEvent).data);
          if (typeof message.id === 'string' && /^\d+$/.test(message.revision))
            changed(message.id, message.revision);
        } catch {}
      });
      // The server found the session no longer allowed to read a source: report it and
      // drop the stream (polling then reports any other denials).
      stream.addEventListener('access', (event) => {
        try {
          host.denied(JSON.parse((event as MessageEvent).data).id);
        } catch {}
        disconnect();
      });
    }
    // An open stream (readyState OPEN) makes polling unnecessary; while it is connecting
    // or reconnecting, poll so no change is missed.
    if (stream && stream.readyState === 1) return;
    if (busy) return;
    busy = true;
    try {
      for (const source of sources) {
        if (document.hidden || closed) break;
        // A source that left the screen during the pass (another timeline opened, perhaps on
        // another server) is not checked, and an answer for one that left is ignored (#240).
        const shown = () => host.sources().some((s) => s.id === source.id);
        if (!shown()) continue;
        try {
          const latest = await host.check(source.id);
          if (!shown()) continue;
          if (
            typeof latest.revision === 'string' &&
            /^\d+$/.test(latest.revision) &&
            latest.revision !== source.revision
          )
            pending.set(source.id, latest.revision);
        } catch (error) {
          if (!shown()) continue;
          if (
            (error as { status?: number }).status === 403 ||
            (error as { status?: number }).status === 404
          )
            host.denied(source.id);
        }
      }
    } finally {
      busy = false;
      void drain();
    }
  }
  const timer = setInterval(() => {
    void update();
  }, 5000);
  const visible = () => {
    void update();
  };
  document.addEventListener('visibilitychange', visible);
  return {
    update,
    pause() {
      disconnect();
      pending.clear();
    },
    close() {
      closed = true;
      clearInterval(timer);
      disconnect();
      pending.clear();
      document.removeEventListener('visibilitychange', visible);
    },
  };
}
