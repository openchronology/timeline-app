// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Live updates (GET /api/live?timelines=…, routed by platform/app/api/live/route.js): a
 * server-sent event stream telling a browser when timelines it shows have a new revision, so
 * it can fetch the change. Triggers in schema.sql (oc_notify_timeline, oc_notify_membership)
 * NOTIFY the channel oc_timeline_changes with a timeline's id when its row or its members
 * change; notifications are sent at commit, so a listener never hears of a change it cannot
 * yet read. No timeline content is broadcast: each stream re-checks access and reads the
 * revision itself.
 */

/**
 * One PostgreSQL LISTEN connection per application process; notifications contain only IDs.
 * The connection is opened on the first subscription and shared by every stream. If it fails,
 * every listener is called with null (their streams close and browsers reconnect), and the
 * next subscription opens a new one.
 */
export class TimelineNotifications {
  constructor(pool) {
    this.pool = pool;
    this.listeners = new Set();
    this.connecting = null;
    this.client = null;
  }
  /**
   * Adds `listener`, called with a timeline id on each notification (or null when the
   * connection failed), connecting first if needed.
   * @param {(id: string|null) => void} listener
   * @returns {Promise<() => void>} removes the listener
   * @throws when the connection or LISTEN fails (the listener is not kept)
   */
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
  /** Drops every listener and the connection (released destroyed, not back to the pool). */
  close() {
    const client = this.client;
    this.client = null;
    this.listeners.clear();
    if (client) client.release(true);
  }
  /**
   * Connects and LISTENs unless already connected; concurrent callers share one attempt
   * (`connecting`). The client is held out of the pool for as long as it listens, and is
   * destroyed rather than returned on failure, since a client in LISTEN mode should not be
   * handed to other queries.
   */
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
      // Only well-formed ids on our channel reach listeners.
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
/**
 * The live stream for `request` (a Fetch API Request): `timelines`, one to eight timeline ids,
 * each of which the requester must be able to see. Refused for API keys (403), cross-origin
 * requests (403) and servers without PostgreSQL (503).
 *
 * Events: `revision` `{id, revision}` when a timeline's revision differs from the last sent
 * (the first check sends each one's current revision); `access` when the session changed or a
 * timeline became unavailable, after which the stream ends. Every 25 seconds it re-checks
 * every timeline (catching notifications missed, and access lost without one) and sends a
 * comment as a heartbeat so proxies keep the connection open.
 * @param {Request} request
 * @param {{pool, origin: string, auth, store, notifications?: TimelineNotifications}} services
 *   `notifications` is created on first use and kept on `services`
 * @returns {Promise<Response>}
 */
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
      // `pending`: timelines to re-check; `known`: the revision last sent for each.
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
      /**
       * Re-checks the session, then each pending timeline's access and revision, one check at
       * a time: a notification arriving meanwhile adds to `pending`, which the running loop
       * picks up. Any unexpected error ends the stream; the browser reconnects.
       */
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
    // No caching or transformation by proxies, no buffering by nginx (X-Accel-Buffering), and
    // the answer depends on who asks.
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Vary: 'Cookie, Authorization',
    },
  });
}
