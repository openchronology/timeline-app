// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** One PostgreSQL LISTEN connection per application process; notifications contain only IDs. */
export class TimelineNotifications {
  constructor(pool) {
    this.pool = pool;
    this.listeners = new Set();
    this.connecting = null;
    this.client = null;
  }
  async subscribe(listener) {
    this.listeners.add(listener);
    try {
      await this.ensure();
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }
    return () => this.listeners.delete(listener);
  }
  close() {
    const client = this.client;
    this.client = null;
    this.listeners.clear();
    if (client) client.release(true);
  }
  async ensure() {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = await this.pool.connect();
      const failed = () => {
        if (this.client !== client) return;
        this.client = null;
        client.release(true);
        for (const listener of this.listeners) listener(null);
      };
      client.on('error', failed);
      client.on('notification', (event) => {
        if (event.channel === 'oc_timeline_changes' && /^[a-f0-9-]{36}$/i.test(event.payload ?? ''))
          for (const listener of this.listeners) listener(event.payload);
      });
      try {
        await client.query('LISTEN oc_timeline_changes');
        this.client = client;
      } catch (error) {
        client.release(true);
        throw error;
      }
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
}
export async function liveResponse(request, services) {
  if ((request.headers.get('authorization') ?? '').startsWith('Bearer och_key_'))
    return Response.json({ error: 'API keys are limited to timeline endpoints.' }, { status: 403 });
  if (!services.pool)
    return Response.json({ error: 'Server storage is unavailable.' }, { status: 503 });
  const origin = request.headers.get('origin');
  if (origin && origin !== services.origin)
    return Response.json({ error: 'Cross-origin live requests are not allowed.' }, { status: 403 });
  const ids = [...new Set((new URL(request.url).searchParams.get('timelines') ?? '').split(','))];
  if (
    ids.length < 1 ||
    ids.length > 8 ||
    ids.some((id) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
  )
    return Response.json({ error: 'Expected one to eight timeline IDs.' }, { status: 400 });
  const headers = Object.fromEntries(request.headers),
    session = await services.auth.session({ headers });
  const userId = session?.id ?? null;
  try {
    for (const id of ids)
      await (services.store.liveState ?? services.store.access).call(services.store, id, userId);
  } catch (error) {
    return Response.json({ error: 'Timeline unavailable.' }, { status: error.status ?? 503 });
  }
  services.notifications ??= new TimelineNotifications(services.pool);
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false,
        unsubscribe = () => {},
        timer,
        checking = false;
      const pending = new Set(ids),
        known = new Map();
      const send = (type, value) => {
        if (!closed)
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubscribe();
        request.signal.removeEventListener('abort', stop);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener('abort', stop, { once: true });
      async function check() {
        if (closed || checking) return;
        checking = true;
        try {
          const current = await services.auth.session({ headers });
          if ((current?.id ?? null) !== userId) {
            send('access', { error: 'Session changed. Reconnect to view current access.' });
            stop();
            return;
          }
          while (pending.size && !closed) {
            const id = pending.values().next().value;
            pending.delete(id);
            try {
              const timeline = await (services.store.liveState ?? services.store.access).call(
                services.store,
                id,
                userId,
              );
              if (known.get(id) !== timeline.revision) {
                known.set(id, timeline.revision);
                send('revision', { id, revision: timeline.revision });
              }
            } catch (error) {
              if (error.status === 403 || error.status === 404) {
                send('access', { id, error: 'Timeline access changed.' });
                stop();
                return;
              }
              throw error;
            }
          }
        } catch {
          stop();
        } finally {
          checking = false;
        }
      }
      try {
        unsubscribe = await services.notifications.subscribe((id) => {
          if (id === null) {
            stop();
            return;
          }
          if (ids.includes(id)) {
            pending.add(id);
            void check();
          }
        });
        if (closed) {
          unsubscribe();
          return;
        }
        // Initial revisions close the race between the first page load and LISTEN registration.
        await check();
        if (closed) return;
        timer = setInterval(() => {
          for (const id of ids) pending.add(id);
          void check();
          if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 25000);
        if (request.signal.aborted) stop();
      } catch {
        stop();
      }
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Vary: 'Cookie, Authorization',
    },
  });
}
