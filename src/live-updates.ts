// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
export interface LiveTimeline {
  id: string;
  revision: string;
}
interface Host {
  sources(): LiveTimeline[];
  available(): boolean;
  native(): boolean;
  check(id: string): Promise<LiveTimeline>;
  refresh(id: string, revision: string): Promise<void>;
  denied(id?: string): void;
}
/** Push invalidates cache revisions; native/disconnected transports use bounded metadata polling. */
export function liveUpdates(host: Host) {
  let stream: EventSource | undefined,
    key = '',
    busy = false,
    closed = false;
  const pending = new Map<string, string>();
  function disconnect() {
    stream?.close();
    stream = undefined;
    key = '';
  }
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
  function changed(id: string, revision: string) {
    pending.set(id, revision);
    void drain();
  }
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
      stream.addEventListener('revision', (event) => {
        try {
          const message = JSON.parse((event as MessageEvent).data);
          if (typeof message.id === 'string' && /^\d+$/.test(message.revision))
            changed(message.id, message.revision);
        } catch {}
      });
      stream.addEventListener('access', (event) => {
        try {
          host.denied(JSON.parse((event as MessageEvent).data).id);
        } catch {}
        disconnect();
      });
    }
    if (stream && stream.readyState === 1) return;
    if (busy) return;
    busy = true;
    try {
      for (const source of sources) {
        if (document.hidden || closed) break;
        try {
          const latest = await host.check(source.id);
          if (
            typeof latest.revision === 'string' &&
            /^\d+$/.test(latest.revision) &&
            latest.revision !== source.revision
          )
            pending.set(source.id, latest.revision);
        } catch (error) {
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
