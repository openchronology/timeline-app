// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The HTTP API (createRequestHandler): its routes, reading and checking requests, and handing
// them to the store, accounts, collaboration, moderation and the other services. Next.js serves
// it in production (next-handler.mjs); createApplication is a plain Node server for tests.
//
// The order of checks for every request (createRequestHandler): security headers; API keys
// confined to /api/timelines; health and the API description; a cross-origin refusal for
// anything but GET and HEAD; the public plugin library and the session; then, under /api/,
// the session (cookie, desktop Bearer token or API key), the key's scope and rate limit, and
// the data-provider check for writes to timelines. Each route group below says who may call it
// and what it checks first. Writes by browser sessions carry the session's CSRF token
// (auth.require), and anonymous forms the login nonce (auth.requireLogin).
import {
  compareLimits as compareLimitsFromEnv,
  compareLimit,
  entryLimit as entryLimitFromEnv,
  mebibytes,
} from './limits.mjs';
import { deleteWhere, parseRetention, printRetention } from './retention.mjs';
import { setTimelineStar } from './stars.mjs';
import { Administration, usage, requireDataProvider, avatarValue } from './administration.mjs';
import { Moderation } from './moderation.mjs';
import { deleteAccount } from './account-deletion.mjs';
import { POLICY_VERSION, agreed, requireAgreed, requireAgreement } from './policies.mjs';
import { mapTimes } from './time-map.mjs';
import { saveBase } from './save-merge.mjs';
import { timelineSettings } from './incremental.mjs';
import { authorizeKey, keyRequestRead } from './api-keys.mjs';
import { BrowserForks } from './browser-forks.mjs';
import { queryPlugins } from './query-plugins.mjs';
import { Collaboration, searchTimelines } from './collaboration.mjs';
import { Versioning, revisionId } from './versioning.mjs';
import { createPluginLibrary, createSuiteLibrary } from './plugins.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';
import { minor, Auth } from './auth.mjs';
import { Challenges } from './challenge.mjs';
import { OAuth, providersFromEnv } from './oauth.mjs';
import { Directory, directoryFromEnv } from './ldap.mjs';
import { mailFromEnv, encryptionKey } from './mail.mjs';
import { DeviceAuth } from './device-auth.mjs';
import { TimelineFiles } from './files.mjs';
import { exportCacheFromEnv } from './export-cache.mjs';
import { openApiDocument } from './openapi/index.mjs';
import { siteName } from './site.mjs';
import { HttpError, PostgresStore, restrictedTimeline, withoutImageCopies } from './store.mjs';
import {
  Q,
  parseTime,
  validateDocument,
  validateDuration,
  validateTags,
  validateTimelineImage,
  validateRef,
  canonicalRelationship,
  setEntryLimit,
  contentLabels,
  timeMapping,
  DURATION_COUNT_CAP,
  BACKGROUND_URL_LIMIT,
  longBackgrounds,
  longBackgroundsText,
} from '../dist/core.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/**
 * The request's JSON body, read up to `maximum` bytes (16 MiB by default; routes pass less).
 * 415 unless sent as application/json, 413 past the limit (stopping as soon as it is passed),
 * 400 for invalid JSON.
 */
async function body(req, maximum = 16 * 1024 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Send JSON.');
  let size = 0,
    parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > maximum) throw new HttpError(413, `Request exceeds the ${maximum}-byte limit.`);
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
/**
 * A SQLite timeline file uploaded as the body, up to `limit` bytes (TIMELINE_FILE_BYTES);
 * 415 for another type.
 */
async function fileBody(req, limit = 64 * 1024 * 1024) {
  if (
    !['application/vnd.openchronology.sqlite', 'application/octet-stream'].includes(
      req.headers['content-type'],
    )
  )
    throw new HttpError(415, 'Send a SQLite timeline file.');
  let size = 0,
    parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw new HttpError(413, `SQLite upload exceeds ${mebibytes(limit)}.`);
    parts.push(part);
  }
  return Buffer.concat(parts);
}
/** A 303 redirect (after a social sign-in's callback), optionally setting cookies. */
function redirect(res, location, cookie) {
  res.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  });
  res.end();
}
/** A SQLite timeline file as a download. */
function fileResponse(res, bytes) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openchronology.sqlite',
    'Content-Disposition': 'attachment; filename="timeline.och"',
    'Cache-Control': 'no-store',
    'Content-Length': bytes.length,
  });
  res.end(bytes);
}
/**
 * A timeline document from a request, validated (core's validateDocument; `partial` for a
 * fragment such as one changed moment), without image copies unless `copies`. 400 when
 * invalid.
 */
function document(value, partial = false, copies = false) {
  try {
    // Images are linked, not copied, on the server (#109); only exports keep copies.
    const valid = validateDocument(value, partial);
    return copies ? valid : withoutImageCopies(valid);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
/**
 * What a save or import that succeeded warns of (#365), as `{ warnings }` to add to its
 * answer, or nothing: durations whose background image addresses are longer than
 * BACKGROUND_URL_LIMIT, so their bands show no picture. Names at most 100 of them.
 */
function saveWarnings(plugins, durations) {
  const ids = longBackgrounds(plugins, durations);
  if (!ids.length) return {};
  const message = longBackgroundsText(ids.length, BACKGROUND_URL_LIMIT);
  return {
    warnings: [
      { code: 'long-background', message, count: ids.length, durations: ids.slice(0, 100) },
    ],
  };
}
/**
 * A separation filter from a request: by tags (one to forty, entities with any of them or
 * none), or by relationship to an entity (`related`, `depth` direct or all, `mode` any or
 * none). undefined when none is given; 400 when malformed.
 */
function viewFilter(value) {
  if (value === undefined || value === null) return undefined;
  if (value.related !== undefined) {
    let related;
    try {
      related = validateRef(value.related);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    if (!['direct', 'all'].includes(value.depth) || !['any', 'none'].includes(value.mode))
      throw new HttpError(400, 'A relationship filter needs a depth and a mode.');
    return { related, depth: value.depth, mode: value.mode };
  }
  let tags;
  try {
    tags = validateTags(value.tags);
  } catch {
    tags = [];
  }
  if (!tags.length || (value.mode !== 'any' && value.mode !== 'none'))
    throw new HttpError(400, 'A tag filter needs one to forty tags and a mode.');
  return { tags, mode: value.mode };
}
/** A time bound from a request: an exact rational as a string, normalized; null when absent. */
function bound(value) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Time bounds must be rational strings.');
  try {
    return parseTime(value).toString();
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
/**
 * Answers `status` (200) with `chunks` (an async generator of text, a document-stream.mjs
 * document, or of bytes, a cached file) as the body, written as it is read: the server never
 * holds the whole of it. Errors before the first part answer as usual (thrown); later ones end
 * the response early. A response that can take a stream itself (the Next.js adapter,
 * next-handler.mjs) is handed it.
 */
async function streamResponse(res, chunks, headers = {}, status = 200) {
  const first = await chunks.next();
  const values = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  };
  if (res.streamBody) return res.streamBody(status, values, first, chunks);
  res.writeHead(status, values);
  try {
    for (let part = first; !part.done && !res.destroyed; part = await chunks.next())
      if (!res.write(part.value))
        // Whichever comes first; the other listener is removed, so a long download that
        // waits often does not pile them up.
        await new Promise((resolve) => {
          const go = () => {
            res.off('drain', go);
            res.off('close', go);
            resolve();
          };
          res.once('drain', go);
          res.once('close', go);
        });
    res.end();
  } catch (error) {
    console.error('Streaming a document failed:', error);
    res.destroy(error);
  } finally {
    await chunks.return();
  }
}
/**
 * Runs `work`, which reports progress to the function it is given, as a stream of JSON lines:
 * `{"progress": …}` as it goes, then `{"result": …}` or `{"error": {status, message}}`. The
 * work continues if the client goes away.
 */
async function* progressLines(work) {
  const lines = [];
  let finished = false,
    wake = null;
  const push = (value) => {
    lines.push(JSON.stringify(value) + '\n');
    wake?.();
  };
  push({ progress: { reading: true } });
  work((progress) => push({ progress }))
    .then(
      (result) => push({ result }),
      (error) => {
        if (!(error instanceof HttpError)) console.error('A streamed request failed:', error);
        push({
          error:
            error instanceof HttpError
              ? { status: error.status, message: error.message }
              : { status: 500, message: 'The server could not finish this.' },
        });
      },
    )
    .finally(() => {
      finished = true;
      wake?.();
    });
  for (;;) {
    if (lines.length) yield lines.shift();
    else if (finished) return;
    else await new Promise((resolve) => (wake = resolve));
  }
}
/** A file name for a timeline titled `title` (as the editor names its exports), or `fallback`. */
const fileName = (title, fallback) =>
  (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 70) || fallback;
/** Headers making a document a downloaded .ochx file, when the request asks (?download=1). */
const download = (url, name) =>
  url.searchParams.get('download') === '1'
    ? { 'Content-Disposition': `attachment; filename="${name}.ochx"` }
    : null;
/** A JSON answer, never cached. */
function response(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(value));
}
/** What a request that ran past the statement timeout is told (see the error handler). */
export const TOO_SLOW =
  'The server took too long to answer. Try again, or send less at a time (for example fewer moments per save).';
/**
 * A timeline's metadata with its retention period as its display writes it, and the storage
 * turning its saved history off would free (`history_bytes`).
 */
async function retentionInfo(store, t) {
  return {
    ...t,
    retention: t.retention_seconds ? printRetention(t.retention_seconds, t.presentation) : null,
    history_bytes: t.keep_history ? await store.historyBytes(store.pool, t.id) : 0,
  };
}
/**
 * The request handler: `(req, res)` for Node's http server or the Next.js adapter. Its
 * services are made once here from `options`; without a `pool` it serves only the static app,
 * the plugin library and the session (`server: false`), and every other /api/ route answers
 * 503 so the app keeps working in the browser alone. Errors are answered as JSON with their
 * status (see the catch at the end).
 */
export function createRequestHandler({
  pool = null,
  origin = 'http://localhost:5173',
  staticDir = resolve('dist'),
  providers = providersFromEnv(),
  // Directory (LDAP / Active Directory) sign-in settings (ldap.mjs); null for none.
  directory: directorySettings = directoryFromEnv(),
  // Makes the directory's ldapts clients; injectable for tests.
  directoryClient,
  converter = new TimelineFiles(),
  fetcher = fetch,
  mailer = mailFromEnv(),
  securityKey = encryptionKey(process.env.AUTH_ENCRYPTION_KEY),
  passwordCheck,
  // Passkey settings (passkeys.mjs; `{ signIn }`, else PASSKEY_SIGN_IN).
  passkeys,
  trustProxy = false,
  plugins,
  featured = [],
  // Human-verification settings (see challenge.mjs); none disables challenges.
  challenges: challengeSettings = null,
  // How many timelines each kind of account may compare (limits.mjs).
  compareLimits: limits = compareLimitsFromEnv(),
  // How many entries of each kind a timeline holds (TIMELINE_ENTRY_LIMIT); Infinity for none.
  entryLimit: entries = entryLimitFromEnv(),
  // Downloads kept to serve again (#204; export-cache.mjs), or null for none.
  exportCache = exportCacheFromEnv({ pool }),
} = {}) {
  setEntryLimit(entries);
  const library = createPluginLibrary(plugins, pool);
  const suites = createSuiteLibrary(undefined, pool);
  const store = pool ? new PostgresStore(pool, { compareLimits: limits }) : null,
    auth = pool
      ? new Auth(pool, origin, {
          mailer,
          key: securityKey,
          ...(passwordCheck ? { passwordCheck } : {}),
          ...(passkeys ? { passkeys } : {}),
        })
      : null,
    oauth = auth ? new OAuth(auth, providers, fetcher) : null,
    directory =
      auth && directorySettings
        ? new Directory(auth, oauth, directorySettings, directoryClient)
        : null,
    challenges = new Challenges({
      ...(challengeSettings ?? { provider: 'off' }),
      pool,
      key: securityKey,
      fetcher,
      origin,
    }),
    devices = auth ? new DeviceAuth(auth) : null;
  const administration = store ? new Administration(store, auth) : null;
  const moderation = store ? new Moderation(store, auth, administration) : null;
  const collaboration = store ? new Collaboration(store) : null;
  const browserForks = store ? new BrowserForks(store, auth) : null;
  /**
   * The files downloads are made from, for the export cache (export-cache.mjs respond): the
   * parts of the file and whether, once complete, it is the content of the key asked for. The
   * live timeline's (`r<revision>`) is of the revision read, which a save landing between the
   * check and the read makes newer; a saved revision's never changes.
   */
  const liveFile = (id, userId, revision) => {
    let read;
    return {
      chunks: store.snapshotChunks(id, userId, {
        documentOnly: true,
        accessed: (t) => (read = t.revision),
      }),
      matches: () => String(read) === String(revision),
    };
  };
  const savedFile = (id, savedId, userId) => ({
    chunks: store.revisionChunks(id, savedId, userId, { documentOnly: true }),
    matches: () => true,
  });
  // A SQLite file is made whole in memory (och-convert); rate-limited per address, as
  // without the cache.
  const sqliteFile = (req, id, userId, revision) => {
    let read;
    return {
      chunks: (async function* () {
        await auth.rateLimit('file-download:' + req.clientAddress);
        const snapshot = await store.snapshot(id, userId);
        read = snapshot.timeline.revision;
        yield await converter.convert('write', snapshot.document);
      })(),
      matches: () => String(read) === String(revision),
    };
  };
  // The OpenAPI document, built on first request and kept.
  let apiDescription = null;
  return async (req, res) => {
    // Enable only behind a proxy that overwrites X-Forwarded-For and blocks direct access.
    if (trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && isIP(forwarded.trim()))
        req.clientAddress = forwarded.trim();
    }
    req.clientAddress ??= req.socket.remoteAddress ?? 'unknown';
    // Security headers on every answer: no MIME sniffing, no referrer, HSTS on HTTPS, and a
    // content security policy allowing only this origin's scripts and connections, images from
    // anywhere over HTTPS (timelines link to images where their owners host them, #109), and
    // no framing.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (origin.startsWith('https:')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      let pathname;
      try {
        pathname = new URL(req.url, origin).pathname;
      } catch {
        throw new HttpError(400, 'Invalid request path.');
      }
      const method = req.method;
      // API keys reach only the timeline endpoints, refused before anything else is read.
      if (
        (req.headers.authorization ?? '').startsWith('Bearer och_key_') &&
        !pathname.startsWith('/api/timelines')
      )
        throw new HttpError(403, 'API keys are limited to timeline endpoints.');
      // Health, for anyone (load balancers, Compose): 503 unless the database answers with
      // the current schema. The query reads no rows (LIMIT 0, joins ON false) but fails if
      // any table or column named is missing, so a server whose migration has not run
      // reports unavailable.
      if (pathname === '/healthz' && method === 'GET') {
        try {
          if (pool)
            await pool.query(
              'SELECT t.tags,t.image,t.assets,t.search_document,t.head_revision_id,p.source_revision_id FROM oc_timelines t LEFT JOIN oc_proposals p ON false LEFT JOIN oc_plugins l ON false LEFT JOIN oc_plugin_suites ps ON false LEFT JOIN oc_revisions r ON false LEFT JOIN oc_snapshots s ON false LIMIT 0',
            );
          return response(res, 200, { status: 'ok', storage: pool ? 'postgresql' : 'browser' });
        } catch {
          return response(res, 503, { status: 'unavailable' });
        }
      }
      // This API's description (#178), for anyone: docs/api.md.
      if (pathname === '/api/openapi.json' && ['GET', 'HEAD'].includes(method)) {
        apiDescription ??= JSON.stringify(openApiDocument({ origin, name: siteName() }));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(method === 'HEAD' ? undefined : apiDescription);
      }
      // Everything that may change something refuses another site's pages outright (a
      // browser sends Origin on such requests); the CSRF tokens below are a second line.
      if (!['GET', 'HEAD'].includes(method) && req.headers.origin && req.headers.origin !== origin)
        throw new HttpError(403, 'Cross-origin request rejected.');
      // The plugin library (plugins.mjs): searched and read by anyone, signed in or not, and
      // with or without a database (then only the official plugins). Searches take their
      // options from the query string (GET) or a small JSON body (POST, at most 4 KiB).
      if (pathname === '/api/plugins' && method === 'GET') {
        const query = new URL(req.url, origin).searchParams;
        return response(
          res,
          200,
          await library.search({
            search: query.get('search') ?? '',
            page: Number(query.get('page') ?? 1),
            limit: Number(query.get('limit') ?? 12),
            sort: query.get('sort') ?? 'popularity',
          }),
        );
      }
      // Plugin suites (#78): searched and read by anyone, like plugins.
      if (pathname === '/api/plugins/suites' && method === 'GET') {
        const query = new URL(req.url, origin).searchParams;
        return response(
          res,
          200,
          await suites.search({
            search: query.get('search') ?? '',
            page: Number(query.get('page') ?? 1),
            limit: Number(query.get('limit') ?? 12),
          }),
        );
      }
      if (pathname === '/api/plugins/suites/search' && method === 'POST')
        return response(res, 200, await suites.search(await body(req, 4096)));
      const suitePath = /^\/api\/plugins\/suites\/([a-z][a-z0-9-]{0,63})\/([1-9][0-9]{0,15})$/.exec(
        pathname,
      );
      if (suitePath && method === 'GET') {
        if (!Number.isSafeInteger(Number(suitePath[2])))
          throw new HttpError(400, 'Invalid suite version.');
        return response(res, 200, await suites.get(suitePath[1], suitePath[2]));
      }
      if (pathname === '/api/plugins/search' && method === 'POST') {
        return response(res, 200, await library.search(await body(req, 4096)));
      }
      const pluginPath = /^\/api\/plugins\/([a-z][a-z0-9-]{0,63})\/([1-9][0-9]{0,15})$/.exec(
        pathname,
      );
      if (pluginPath && method === 'GET') {
        if (!Number.isSafeInteger(Number(pluginPath[2])))
          throw new HttpError(400, 'Invalid plugin version.');
        return response(res, 200, await library.get(pluginPath[1], pluginPath[2]));
      }
      // The session, for anyone: who is signed in (if anyone), the CSRF token for their writes,
      // or, signed out, a fresh login nonce (set as a cookie) for the sign-in forms; and what
      // this server offers (storage, providers, email, file exchange, limits).
      if (pathname === '/api/session' && method === 'GET') {
        const session = auth ? await auth.session(req) : null;
        const nonce = !session && auth ? auth.nonce(req, 'login') : null;
        // A sign-in step this browser has pending, if any.
        const pending = auth ? await auth.security.pending(req) : null;
        return response(
          res,
          200,
          {
            server: !!pool,
            dashboard: true,
            user: session
              ? {
                  id: session.id,
                  username: session.username,
                  isAdmin: !!session.is_admin,
                  avatarUrl: session.avatar_url ?? '',
                  // Sensitive content (#115): minors are always warned; adults may choose.
                  minor: minor(session.birth_year),
                  showSensitive: !!session.show_sensitive && !minor(session.birth_year),
                  // It has not agreed to the terms and privacy policy in force (#277): it is
                  // asked to before it can change anything (policies.mjs requireAgreed).
                  termsRequired: session.kind !== 'api' && !agreed(session),
                }
              : null,
            csrf: session?.csrf ?? nonce,
            providers: oauth?.names() ?? [],
            // Buttons named otherwise than their provider (OAUTH_MICROSOFT_LABEL).
            providerLabels: oauth?.labels() ?? {},
            // Directory sign-in, when configured: what the sign-in page calls it.
            directory: directory ? { label: directory.label } : null,
            ...(auth
              ? {
                  security: {
                    email: auth.security.available,
                    mfa: auth.security.available,
                    registration: auth.security.available,
                    // Passkeys (#372): as a second factor, and to sign in alone.
                    passkeys: auth.security.available,
                    passkeySignIn: auth.security.available && auth.security.passkeys.signInEnabled,
                  },
                  challenge: pending?.purpose ?? null,
                  // At a two-factor step: whether the account can answer it with a passkey.
                  ...(pending?.purpose === 'mfa'
                    ? { challengePasskey: await auth.security.passkeys.has(pending.user_id) }
                    : {}),
                  // The version of the terms and privacy policy that agreeing agrees to (#277).
                  terms: POLICY_VERSION,
                }
              : {}),
            fileExchange: !!pool && converter.enabled,
            // The largest .och file it exchanges, in bytes (TIMELINE_FILE_BYTES).
            fileLimit: converter.limit,
            // How many timelines this account may compare at once.
            compareLimit: compareLimit(limits, session),
            // Moments (and durations, relationships) a timeline may hold; null for no limit.
            entryLimit: Number.isFinite(entries) ? entries : null,
          },
          nonce ? { 'Set-Cookie': auth.nonceCookie('login', nonce) } : {},
        );
      }
      if (pathname.startsWith('/api/')) {
        if (!pool)
          throw new HttpError(
            503,
            'Server storage is not configured. Your browser timeline remains available.',
          );
        // Sign-in and registration, for anyone. Checked first: the CSRF token of a session
        // already open (signing in as someone else), else the login nonce; then the
        // human-verification challenge (always to register; to sign in after repeated
        // failures from the address or for the account). Rate limits are in auth.signIn. A
        // session already open is ended once the new one is issued. A directory sign-in
        // (/api/auth/ldap, ldap.mjs) is checked the same way, its failures counted under its
        // own `ldap:` names.
        if (
          ['/api/auth/login', '/api/auth/register', '/api/auth/ldap'].includes(pathname) &&
          method === 'POST'
        ) {
          if (pathname === '/api/auth/ldap' && !directory)
            throw new HttpError(404, 'Directory sign-in is not configured.');
          const previous = await auth.session(req);
          if (previous) auth.require(previous, req);
          else auth.requireLogin(req);
          const register = pathname.endsWith('/register'),
            ldap = pathname.endsWith('/ldap'),
            input = await body(req, 8192),
            username =
              (ldap ? 'ldap:' : '') +
              (typeof input.username === 'string' ? input.username.trim().toLowerCase() : '');
          if (register) await challenges.require(req, 'register', previous);
          else if (await challenges.signInNeeded(req.clientAddress, username))
            await challenges.require(req, 'sign-in', previous);
          const kind = req.headers['x-oc-client'] === 'desktop' ? 'desktop' : 'web';
          let result;
          try {
            result = ldap
              ? await directory.signIn(req, input, kind)
              : await auth.signIn(input, register, req.clientAddress, kind, req);
          } catch (error) {
            if (!register && error.status === 401)
              await challenges.signInFailed(req.clientAddress, username);
            throw error;
          }
          if (previous && result.user)
            await pool.query('DELETE FROM oc_sessions WHERE token_hash=$1', [previous.token_hash]);
          const { cookie, proofCookie, challengeCookie, ...publicResult } = result;
          const cookies = [
            cookie,
            proofCookie,
            challengeCookie,
            ...(cookie ? [auth.nonceCookie('login', '', true)] : []),
          ].filter(Boolean);
          return response(res, 200, publicResult, cookies.length ? { 'Set-Cookie': cookies } : {});
        }
        // Every other /api/ route: the session, if any (null when signed out). An API key that
        // does not resolve is refused here rather than treated as signed out. Keys are held to
        // their scopes (read or write) and to their own rate limit, API_KEY_REQUESTS_PER_MINUTE
        // (default 120, at most 1000).
        const session = await auth.session(req),
          userId = session?.id;
        if ((req.headers.authorization ?? '').startsWith('Bearer och_key_') && !session)
          throw new HttpError(401, 'API key is expired, revoked, or invalid.');
        authorizeKey(session, pathname, method);
        // An account that has not agreed to the terms and privacy policy in force may still
        // read, sign out, manage and delete itself, but not change anything else (#277).
        requireAgreed(session, pathname, method);
        if (session?.kind === 'api')
          await auth.rateLimit(
            'api-key:' + session.api_key_id,
            Math.max(1, Math.min(1000, Number(process.env.API_KEY_REQUESTS_PER_MINUTE) || 120)),
          );
        // Writing to timelines requires an account that may supply data (not suspended, not
        // read-only by a zero quota; administration.mjs requireDataProvider): every
        // /api/timelines request but reads, deletions and copying into a browser. Copying a
        // public timeline into a browser supplies nothing: guests may (#178).
        if (
          pathname.startsWith('/api/timelines') &&
          !keyRequestRead(pathname, method) &&
          method !== 'DELETE' &&
          !pathname.endsWith('/browser-fork')
        )
          await requireDataProvider(pool, userId);
        // Reports and moderation decisions (#115; moderation.mjs).
        // Reporting: anyone, signed in or not. Checked first: the session's CSRF token, or the
        // login nonce when signed out; ten reports a minute per account or address; and the
        // human-verification challenge when signed out.
        if (pathname === '/api/reports' && method === 'POST') {
          if (session) auth.require(session, req);
          else auth.requireLogin(req);
          await auth.rateLimit('report:' + (userId ?? req.clientAddress));
          if (!session) await challenges.require(req, 'report', null);
          return response(res, 201, await moderation.report(userId, await body(req, 8192)));
        }
        // An owner's own decisions, and their one request for review: signed in only (the
        // request also with the CSRF token and a rate limit).
        if (pathname === '/api/moderation' && method === 'GET') {
          if (!session) throw new HttpError(401, 'Sign in to see moderation decisions.');
          return response(res, 200, await moderation.mine(userId));
        }
        const appeal = /^\/api\/moderation\/([a-f0-9-]{36})\/appeal$/.exec(pathname);
        if (appeal && method === 'POST' && uuid.test(appeal[1])) {
          if (!session) throw new HttpError(401, 'Sign in to ask for a review.');
          auth.require(session, req);
          await auth.rateLimit('appeal:' + userId);
          return response(
            res,
            200,
            await moderation.appeal(userId, appeal[1], await body(req, 8192)),
          );
        }
        // The review queue and decisions: administrators only (Moderation checks, and decide
        // also confirms with password and second factor). Decisions carry the CSRF token and
        // share the administrators' rate limit.
        const reports = /^\/api\/admin\/reports(?:\/([a-f0-9-]{36}))?$/.exec(pathname);
        if (reports) {
          if (method === 'GET' && !reports[1])
            return response(
              res,
              200,
              await moderation.queue(
                session,
                Object.fromEntries(new URL(req.url, origin).searchParams),
              ),
            );
          if (method === 'PATCH' && reports[1] && uuid.test(reports[1])) {
            auth.require(session, req);
            await auth.rateLimit('admin:' + userId);
            return response(
              res,
              200,
              await moderation.decide(session, reports[1], await body(req, 8192)),
            );
          }
          throw new HttpError(404, 'Unknown administration action.');
        }
        // Site administration (administration.mjs): administrators only, checked by
        // Administration. Lists of users or timelines (settings come with the users' list);
        // changes to a user, a timeline or the site settings, with the CSRF token, a rate
        // limit, and the password and second factor (Administration.change).
        if (pathname.startsWith('/api/admin/')) {
          const parts = pathname.slice('/api/admin/'.length).split('/');
          if (
            !['users', 'timelines', 'settings'].includes(parts[0]) ||
            parts.length > 2 ||
            (parts[1] && !uuid.test(parts[1]))
          )
            throw new HttpError(404, 'Unknown administration endpoint.');
          if (method === 'GET' && !parts[1])
            return response(
              res,
              200,
              await administration.list(
                session,
                parts[0] === 'settings' ? 'users' : parts[0],
                Object.fromEntries(new URL(req.url, origin).searchParams),
              ),
            );
          if (method === 'PATCH' && (parts[1] || parts[0] === 'settings')) {
            auth.require(session, req);
            await auth.rateLimit('admin:' + userId);
            return response(
              res,
              200,
              await administration.change(
                session,
                parts[0],
                parts[1] ?? null,
                await body(req, 8192),
              ),
            );
          }
          throw new HttpError(404, 'Unknown administration action.');
        }
        // The account's own profile (avatar, sensitive-content preference): signed in, with the
        // CSRF token. The body allows a data-URL avatar of up to 256 KiB.
        if (pathname === '/api/auth/profile' && method === 'PATCH') {
          auth.require(session, req);
          const value = await body(req, 400000);
          if (
            !value ||
            !Object.keys(value).length ||
            Object.keys(value).some((k) => !['avatarUrl', 'showSensitive'].includes(k)) ||
            (value.showSensitive !== undefined && typeof value.showSensitive !== 'boolean')
          )
            throw new HttpError(400, 'Invalid profile.');
          // Seeing sensitive content without warnings is for adults (#115).
          if (value.showSensitive && minor(session.birth_year))
            throw new HttpError(403, 'Accounts of people under 18 always see these warnings.');
          if ('avatarUrl' in value)
            await pool.query('UPDATE oc_users SET avatar_url=$2 WHERE id=$1', [
              userId,
              avatarValue(value.avatarUrl),
            ]);
          if ('showSensitive' in value)
            await pool.query('UPDATE oc_users SET show_sensitive=$2 WHERE id=$1', [
              userId,
              value.showSensitive,
            ]);
          return response(res, 200, { ok: true });
        }
        // API keys (api-keys.mjs): a signed-in browser or desktop session lists, creates (with
        // the CSRF token and a rate limit), revokes (POST) or deletes (DELETE) its own. API
        // keys cannot reach these: they are confined to /api/timelines above.
        if (pathname === '/api/auth/api-keys') {
          if (!session) throw new HttpError(401, 'Sign in to manage API keys.');
          if (method === 'GET') return response(res, 200, { keys: await auth.keys.list(userId) });
          if (method === 'POST') {
            auth.require(session, req);
            await auth.rateLimit('keys:' + userId);
            return response(res, 201, await auth.keys.create(session, await body(req, 8192)));
          }
        }
        const apiKey = /^\/api\/auth\/api-keys\/([a-f0-9-]{36})$/.exec(pathname);
        if (apiKey && uuid.test(apiKey[1]) && ['POST', 'DELETE'].includes(method)) {
          auth.require(session, req);
          return response(res, 200, await auth.keys.revoke(userId, apiKey[1], method === 'DELETE'));
        }
        // Linking a directory account (ldap.mjs): signed in within five minutes, with the CSRF
        // token and the directory account's own username and password.
        if (pathname === '/api/auth/ldap/link' && method === 'POST') {
          if (!directory) throw new HttpError(404, 'Directory sign-in is not configured.');
          return response(res, 200, await directory.link(req, await body(req, 8192), session));
        }
        // Unlinking a social sign-in: signed in, with the CSRF token, a rate limit and a fresh
        // confirmation (security.fresh), refused when it would leave no way to sign in.
        if (pathname === '/api/auth/identities/unlink' && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('unlink:' + userId);
          const value = await body(req, 8192);
          if (!['google', 'github', 'facebook', 'microsoft', 'ldap'].includes(value.provider))
            throw new HttpError(400, 'Unknown provider.');
          await auth.security.transaction(async (c) => {
            // The account locked, so two unlinks at once cannot each see the other identity
            // still there and together remove the last way to sign in.
            const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [userId]))
              .rows[0];
            await auth.security.fresh(c, user, session, value);
            const count = Number(
              (await c.query('SELECT count(*) FROM oc_identities WHERE user_id=$1', [userId]))
                .rows[0].count,
            );
            if (!user.password_hash && count <= 1)
              throw new HttpError(409, 'Keep a password or another linked sign-in method.');
            await c.query('DELETE FROM oc_identities WHERE user_id=$1 AND provider=$2', [
              userId,
              value.provider,
            ]);
          });
          return response(res, 200, { ok: true });
        }
        // Passkeys (passkeys.mjs, #372): adding, renaming and removing them, confirming a change
        // or a sign-in's second step with one, and signing in with one. A sign-in ends a
        // session already open, as a password sign-in does.
        if (pathname.startsWith('/api/auth/passkeys/')) {
          const result = await auth.security.passkeys.route(req, pathname, method, session, () =>
            body(req, 16384),
          );
          if (result === undefined) throw new HttpError(404, 'Unknown endpoint.');
          const { cookie, ...publicResult } = result;
          if (cookie && session)
            await pool.query('DELETE FROM oc_sessions WHERE token_hash=$1', [session.token_hash]);
          return response(
            res,
            200,
            publicResult,
            cookie ? { 'Set-Cookie': [cookie, auth.nonceCookie('login', '', true)] } : {},
          );
        }
        // Account security (AccountSecurity in auth.mjs): the first five work signed out too
        // (finishing a two-factor sign-in, confirming an email, recovering a password); the rest
        // need a session. Checked first: the CSRF token or login nonce, and a rate limit per
        // address; for those that email an address the requester types, the human-verification
        // challenge; for the signed-in ones, also a rate limit per account.
        const securityRoutes = new Set([
          'mfa/complete',
          'email/enroll',
          'email/verify',
          'password/forgot',
          'password/reset',
          'mfa/setup',
          'mfa/enable',
          'mfa/disable',
          'mfa/recovery',
          'password/change',
          'email/change',
        ]);
        const securityAction = pathname.startsWith('/api/auth/')
          ? pathname.slice('/api/auth/'.length)
          : '';
        if (securityRoutes.has(securityAction) && method === 'POST') {
          if (session) auth.require(session, req);
          else auth.requireLogin(req);
          await auth.rateLimit('security:' + req.clientAddress);
          const input = await body(req, 8192),
            security = auth.security;
          // These send email to an address the requester types.
          if (securityAction === 'email/enroll' || securityAction === 'password/forgot')
            await challenges.require(req, 'email', session);
          let result;
          if (securityAction === 'mfa/complete')
            result = await security.complete(req, input.code, req.clientAddress, input.passkey);
          else if (securityAction === 'email/enroll')
            result = await security.enrollEmail(req, input, session);
          else if (securityAction === 'email/verify')
            result = await security.verify(req, input.token);
          else if (securityAction === 'password/forgot')
            result = await security.forgot(input.email, req.clientAddress);
          else if (securityAction === 'password/reset') result = await security.reset(input);
          else {
            auth.require(session, req);
            await auth.rateLimit('security-account:' + session.id);
            if (securityAction === 'mfa/setup') result = await security.setup(session, input);
            else if (securityAction === 'mfa/enable')
              result = await security.enable(session, input);
            else
              result = await security.change(
                session,
                securityAction === 'mfa/disable'
                  ? 'disable'
                  : securityAction === 'mfa/recovery'
                    ? 'recovery'
                    : securityAction.startsWith('email/')
                      ? 'email'
                      : 'password',
                input,
                req,
              );
          }
          const { cookie, proofCookie, challengeCookie, ...publicResult } = result;
          const cookies = [
            cookie,
            proofCookie,
            challengeCookie,
            ...(cookie ? [auth.nonceCookie('login', '', true)] : []),
          ].filter(Boolean);
          return response(res, 200, publicResult, cookies.length ? { 'Set-Cookie': cookies } : {});
        }
        // Publishing plugins and suites (plugins.mjs): a signed-in account that may supply data,
        // with the CSRF token and a rate limit; the human-verification challenge for all but
        // administrators.
        if (pathname === '/api/plugins/suites/publish' && method === 'POST') {
          auth.require(session, req);
          await requireDataProvider(pool, userId);
          await auth.rateLimit('plugin-publish:' + userId);
          if (!session.is_admin) await challenges.require(req, 'plugin', session);
          const suite = await suites.publish(userId, await body(req, 262144));
          return response(res, 201, suite);
        }
        if (pathname === '/api/plugins/publish' && method === 'POST') {
          auth.require(session, req);
          await requireDataProvider(pool, userId);
          await auth.rateLimit('plugin-publish:' + userId);
          if (!session.is_admin) await challenges.require(req, 'plugin', session);
          const manifest = await library.publish(userId, await body(req, 32768));
          return response(res, 201, manifest);
        }
        // Social sign-in (oauth.mjs): starting it (signed out with the login nonce, or signed in
        // recently with the CSRF token to link a provider), and the provider's redirect back,
        // which ends a session already open once a new one is issued.
        const providerRoute =
          /^\/api\/auth\/(google|github|facebook|microsoft)\/(start|callback)$/.exec(pathname);
        if (providerRoute?.[2] === 'start' && method === 'POST') {
          const started = await oauth.start(req, providerRoute[1], await body(req), session);
          return response(res, 200, { url: started.url }, { 'Set-Cookie': started.cookie });
        }
        if (providerRoute?.[2] === 'callback' && method === 'GET') {
          const result = await oauth.callback(
            req,
            providerRoute[1],
            new URL(req.url, origin).searchParams,
          );
          if (result.cookie && session)
            await pool.query('DELETE FROM oc_sessions WHERE token_hash=$1', [session.token_hash]);
          return redirect(
            res,
            result.returnTo +
              (result.cancelled ? (result.returnTo.includes('#') ? '' : '?auth_cancelled=1') : ''),
            result.cookie
              ? [result.cookie, auth.nonceCookie('login', '', true)]
              : result.challengeCookie
                ? [result.challengeCookie]
                : undefined,
          );
        }
        // Desktop sign-in by code (device-auth.mjs): the desktop app starts and polls without a
        // session; a browser session signed in within five minutes approves the code (CSRF
        // token and rate limit checked in DeviceAuth.approve).
        if (pathname === '/api/auth/device/start' && method === 'POST') {
          await body(req);
          return response(res, 200, await devices.start(req.clientAddress));
        }
        if (pathname === '/api/auth/device/poll' && method === 'POST')
          return response(res, 200, await devices.poll((await body(req)).deviceCode));
        if (pathname === '/api/auth/device/approve' && method === 'POST')
          return response(
            res,
            200,
            await devices.approve(session, req, (await body(req)).userCode),
          );
        // Agreeing to the terms and privacy policy in force (#277): a signed-in browser or desktop
        // session, with the CSRF token; `acceptTerms` is the version agreed to.
        if (pathname === '/api/auth/terms' && method === 'POST') {
          if (!session || session.kind === 'api')
            throw new HttpError(401, 'Sign in to agree to the terms.');
          auth.require(session, req);
          requireAgreement((await body(req, 4096)).acceptTerms);
          await pool.query(
            'UPDATE oc_users SET terms_version=$2,terms_accepted_at=now() WHERE id=$1',
            [userId, POLICY_VERSION],
          );
          return response(res, 200, { terms: POLICY_VERSION });
        }
        // Deleting one's own account (#166; account-deletion.mjs).
        if (pathname === '/api/auth/account' && method === 'DELETE') {
          auth.require(session, req);
          await auth.rateLimit('security:' + userId);
          const result = await deleteAccount({
            store,
            auth,
            session,
            value: await body(req, 4096),
          });
          return response(res, 200, result, { 'Set-Cookie': auth.cookie('', true) });
        }
        // The account page: signed in. Its linked providers, its sessions still valid (not
        // past expiry, seen within a day; identified to the page by their token hash, never the
        // token), its security state and remaining recovery codes, storage, and API keys.
        if (pathname === '/api/auth/account' && method === 'GET') {
          if (!session) throw new HttpError(401, 'Sign in to continue.');
          const identities = (
            await pool.query(
              'SELECT provider FROM oc_identities WHERE user_id=$1 ORDER BY provider',
              [userId],
            )
          ).rows;
          const sessions = (
            await pool.query(
              "SELECT token_hash AS id,kind,created_at,last_seen_at FROM oc_sessions WHERE user_id=$1 AND expires_at>now() AND last_seen_at>now()-interval '1 day' ORDER BY created_at DESC",
              [userId],
            )
          ).rows;
          const profile = (
            await pool.query(
              'SELECT email,email_verified_at,mfa_enabled,mfa_secret IS NOT NULL AS totp_enabled,password_hash IS NOT NULL AS has_password,(SELECT count(*)::integer FROM oc_recovery_codes WHERE user_id=oc_users.id) AS recovery_remaining FROM oc_users WHERE id=$1',
              [userId],
            )
          ).rows[0];
          return response(res, 200, {
            security: {
              ...profile,
              passkeys: await auth.security.passkeys.list(userId),
              directory_only: await auth.security.directoryOnly(pool, userId),
            },
            profile: {
              avatarUrl: session.avatar_url ?? '',
              minor: minor(session.birth_year),
              showSensitive: !!session.show_sensitive && !minor(session.birth_year),
            },
            usage: await usage(pool, userId),
            keys: await auth.keys.list(userId),
            identities: identities.map((row) => row.provider),
            sessions: sessions.map((row) => ({ ...row, current: row.id === session.token_hash })),
          });
        }
        // Signing out everywhere else, and signing out: signed in, with the CSRF token.
        if (pathname === '/api/auth/revoke-others' && method === 'POST') {
          auth.require(session, req);
          await pool.query('DELETE FROM oc_sessions WHERE user_id=$1 AND token_hash!=$2', [
            userId,
            session.token_hash,
          ]);
          return response(res, 200, { ok: true });
        }
        // Converting SQLite timeline files (files.mjs): signed in, with the CSRF token and a
        // rate limit. Nothing is stored; the converted document or file is returned.
        if (pathname === '/api/files/import' && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('files:' + userId);
          const converted = await converter.convert('read', await fileBody(req, converter.limit));
          let warnings = {};
          try {
            warnings = saveWarnings(converted.plugins, converted.durations);
          } catch {
            // A document that is not valid has nothing to warn of: its reader refuses it.
          }
          return response(res, 200, { document: converted, ...warnings });
        }
        if (pathname === '/api/files/export' && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('files:' + userId);
          // An export is the requester's own file: it keeps the images it embeds.
          return fileResponse(
            res,
            await converter.convert('write', document(await body(req), false, true)),
          );
        }
        if (pathname === '/api/auth/logout' && method === 'POST') {
          auth.require(session, req);
          await pool.query('DELETE FROM oc_sessions WHERE token_hash=$1', [session.token_hash]);
          return response(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie('', true) });
        }
        // Storage used and allowed for the account (or API key owner), so that importers can
        // check that an import fits before writing; quotaBytes is null when none applies.
        if (pathname === '/api/timelines/usage' && method === 'GET') {
          if (!userId) throw new HttpError(401, 'Sign in to see storage use.');
          // A quota applies only while the site enforces quotas, and never to exempt accounts
          // or administrators.
          const account = await usage(pool, userId);
          const { rows } = await pool.query(
            'SELECT enforce_quotas FROM oc_site_settings WHERE singleton',
          );
          const limited = rows[0]?.enforce_quotas && !account.quota_bypass && !account.is_admin;
          return response(res, 200, {
            usedBytes: Number(account.used_bytes),
            quotaBytes: limited ? Number(account.effective_quota_bytes) : null,
          });
        }
        // Searching and browsing timelines (collaboration.mjs searchTimelines): anyone; the
        // scopes mine and starred need a session.
        if (pathname === '/api/timelines/search' && method === 'POST')
          return response(
            res,
            200,
            await searchTimelines(pool, userId, await body(req, 4096), featured),
          );
        // Starring (stars.mjs): signed in, with the CSRF token and a rate limit.
        const star = /^\/api\/timelines\/([a-f0-9-]{36})\/star$/.exec(pathname);
        if (star && uuid.test(star[1]) && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('stars:' + userId);
          return response(
            res,
            200,
            await setTimelineStar(pool, store, star[1], userId, await body(req, 1024)),
          );
        }
        // Pull requests and their comments (collaboration.mjs). Reading (these POST searches
        // and the GETs below): anyone who may see the timeline, checked by Collaboration.
        const pullList = /^\/api\/timelines\/([a-f0-9-]{36})\/proposals\/search$/.exec(pathname);
        if (pullList && uuid.test(pullList[1]) && method === 'POST')
          return response(
            res,
            200,
            await collaboration.list(pullList[1], userId, await body(req, 4096)),
          );
        const commentPage =
          /^\/api\/timelines\/([a-f0-9-]{36})\/proposals\/([a-f0-9-]{36})\/comments\/search$/.exec(
            pathname,
          );
        if (
          commentPage &&
          uuid.test(commentPage[1]) &&
          uuid.test(commentPage[2]) &&
          method === 'POST'
        )
          return response(
            res,
            200,
            await collaboration.comments(
              commentPage[1],
              commentPage[2],
              userId,
              (await body(req, 4096)).after ?? '0',
            ),
          );
        // Authors delete their own comments (#166).
        const ownComment =
          /^\/api\/timelines\/([a-f0-9-]{36})\/proposals\/([a-f0-9-]{36})\/comments\/([0-9]{1,18})$/.exec(
            pathname,
          );
        if (
          ownComment &&
          method === 'DELETE' &&
          uuid.test(ownComment[1]) &&
          uuid.test(ownComment[2])
        ) {
          auth.require(session, req);
          await auth.rateLimit('proposals:' + userId);
          return response(
            res,
            200,
            await collaboration.deleteComment(ownComment[1], ownComment[2], ownComment[3], userId),
          );
        }
        const pull =
          /^\/api\/timelines\/([a-f0-9-]{36})\/proposals(?:\/([a-f0-9-]{36})(?:\/(comments|resolve|document))?)?$/.exec(
            pathname,
          );
        if (pull && uuid.test(pull[1]) && (!pull[2] || uuid.test(pull[2]))) {
          const [, tid, pid, sub] = pull;
          if (method === 'GET') {
            if (!pid) {
              const q = new URL(req.url, origin).searchParams;
              return response(
                res,
                200,
                await collaboration.list(tid, userId, {
                  page: Number(q.get('page') ?? 1),
                  limit: 12,
                }),
              );
            }
            if (sub === 'comments')
              return response(
                res,
                200,
                await collaboration.comments(
                  tid,
                  pid,
                  userId,
                  new URL(req.url, origin).searchParams.get('after') ?? '0',
                ),
              );
            if (sub === 'document')
              return response(res, 200, await collaboration.document(tid, pid, userId));
            if (!sub) return response(res, 200, await collaboration.get(tid, pid, userId));
          }
          // Writing (opening, updating, resolving, commenting): signed in, with the CSRF token
          // and a rate limit; opening one or commenting asks newer accounts that are not
          // members for the human-verification challenge. Permissions (contributor, writer,
          // author) are checked by Collaboration.
          auth.require(session, req);
          await auth.rateLimit('proposals:' + userId);
          const input = await body(req);
          if (
            method === 'POST' &&
            (!pid || sub === 'comments') &&
            (await challenges.contributionNeeded(userId, tid))
          )
            await challenges.require(req, 'contribution', session);
          if (!pid && method === 'POST')
            return response(res, 201, await collaboration.create(tid, userId, input));
          if (pid && !sub && method === 'PUT')
            return response(res, 200, await collaboration.update(tid, pid, userId, input));
          if (sub === 'resolve' && method === 'POST')
            return response(res, 200, await collaboration.resolve(tid, pid, userId, input));
          if (sub === 'comments' && method === 'POST')
            return response(res, 201, await collaboration.comment(tid, pid, userId, input));
          throw new HttpError(405, 'Method not allowed.');
        }
        // The signed-in account's timelines: those it owns, and those it is a member of unless
        // moderators restricted them (#115); the 100 most recently updated.
        if (pathname === '/api/timelines' && method === 'GET') {
          if (!session) throw new HttpError(401, 'Sign in to see your timelines.');
          const { rows } = await pool.query(
            `SELECT t.id,t.slug,t.title,t.visibility,t.revision,t.event_count,u.username AS owner,
            CASE WHEN t.owner_id=$1 THEN 'owner' ELSE m.role END AS role FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
            LEFT JOIN oc_members m ON m.timeline_id=t.id AND m.user_id=$1
            WHERE t.owner_id=$1 OR (m.user_id=$1 AND NOT ${restrictedTimeline('t')}) ORDER BY t.updated_at DESC LIMIT 100`,
            [userId],
          );
          return response(res, 200, { timelines: rows });
        }
        // Creating a timeline: signed in (or an API key with write scope), with the CSRF token.
        if (pathname === '/api/timelines' && method === 'POST') {
          auth.require(session, req);
          const created = document(await body(req));
          return response(res, 201, {
            ...(await store.create(userId, created)),
            ...saveWarnings(created.plugins, created.durations),
          });
        }
        // Saved history (versioning.mjs): a page of revisions, or one revision streamed (as an
        // .ochx file with ?download=1); for anyone who may see the timeline.
        const history = /^\/api\/timelines\/([a-f0-9-]{36})\/history(?:\/([a-f0-9-]{36}))?$/.exec(
          pathname,
        );
        if (
          history &&
          uuid.test(history[1]) &&
          (!history[2] || uuid.test(history[2])) &&
          method === 'GET'
        ) {
          const versions = new Versioning(store);
          if (history[2]) {
            revisionId(history[2]);
            const file = download(new URL(req.url, origin), 'timeline-' + history[2]);
            if (file && exportCache) {
              const t = await store.access(history[1], userId);
              if (!t.comparison)
                return await exportCache.respond(req, res, {
                  timeline: t,
                  version: 's' + history[2],
                  format: 'ochx',
                  filename: 'timeline-' + history[2],
                  redirect: true,
                  // A revision since forgotten (saved history stopped) is not served.
                  check: () => store.revisionReadable(history[1], history[2]),
                  produce: () => savedFile(history[1], history[2], userId),
                  stream: streamResponse,
                });
            }
            return await streamResponse(
              res,
              store.revisionChunks(history[1], history[2], userId, { documentOnly: !!file }),
              file ?? {},
            );
          }
          return response(
            res,
            200,
            await versions.history(
              history[1],
              userId,
              Number(new URL(req.url, origin).searchParams.get('page') ?? 1),
            ),
          );
        }
        // Copying a public timeline into the browser (browser-forks.mjs): anyone, guests
        // included; BrowserForks applies a rate limit per address and refuses private
        // timelines.
        const browserFork = /^\/api\/timelines\/([a-f0-9-]{36})\/browser-fork$/.exec(pathname);
        if (browserFork && uuid.test(browserFork[1])) {
          if (method !== 'POST') throw new HttpError(405, 'Method not allowed.');
          const input = await body(req, 1024);
          if (
            !input ||
            typeof input !== 'object' ||
            Array.isArray(input) ||
            Object.keys(input).some((key) => key !== 'revision') ||
            (input.revision !== undefined &&
              (typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision)))
          )
            throw new HttpError(400, 'Invalid browser fork request.');
          return response(
            res,
            200,
            await browserForks.copy(browserFork[1], input.revision, req.clientAddress),
          );
        }
        // Forking, duplicating, and syncing a fork with its upstream (versioning.mjs): signed
        // in, with the CSRF token and a rate limit; access to both is checked by Versioning.
        const forkAction = /^\/api\/timelines\/([a-f0-9-]{36})\/(fork|duplicate|sync)$/.exec(
          pathname,
        );
        if (forkAction && uuid.test(forkAction[1])) {
          auth.require(session, req);
          if (method !== 'POST') throw new HttpError(405, 'Method not allowed.');
          await auth.rateLimit('forks:' + userId, 10, 'Too many copies. Please wait a minute.');
          const versions = new Versioning(store),
            input = await body(req, 4096);
          const result =
            forkAction[2] === 'sync'
              ? await versions.sync(forkAction[1], userId, input)
              : await versions.copy(forkAction[1], userId, input, forkAction[2] === 'duplicate');
          // A new copy is created (201); a sync, or a fork the caller already had, is not.
          return response(res, forkAction[2] === 'sync' || result.existing ? 200 : 201, result);
        }
        // A timeline's .ochx file, streamed, named by the end of its address: the editor
        // downloads large timelines from here, and browsers that name a download after its
        // address name it as those that follow Content-Disposition do.
        const exported =
          /^\/api\/timelines\/([a-f0-9-]{36})\/export\/([a-z0-9-]{1,70})\.ochx$/.exec(pathname);
        if (exported && method === 'GET') {
          if (!userId) throw new HttpError(401, 'Sign in to export a timeline from the server.');
          if (exportCache) {
            const t = await store.access(exported[1], userId);
            if (!t.comparison)
              return await exportCache.respond(req, res, {
                timeline: t,
                version: 'r' + t.revision,
                format: 'ochx',
                filename: exported[2],
                redirect: true,
                produce: () => liveFile(t.id, userId, t.revision),
                stream: streamResponse,
              });
          }
          return await streamResponse(
            res,
            store.snapshotChunks(exported[1], userId, { documentOnly: true }),
            { 'Content-Disposition': `attachment; filename="${exported[2]}.ochx"` },
          );
        }
        // One timeline and its actions. Reads (metadata, document, query, revision, recent):
        // anyone who may see it, checked by the store. Writes (save, changes, delete-range,
        // map-times): signed in or a write-scoped key, with the CSRF token; write access
        // checked by the store or here. Sharing, settings, members and deletion: its owner
        // (or an administrator), checked further down.
        const match =
          /^\/api\/timelines\/([^/]+)(?:\/(document|query|members|settings|file|changes|delete-range|map-times|revision|recent))?$/.exec(
            pathname,
          );
        if (!match || !uuid.test(match[1])) throw new HttpError(404, 'Unknown endpoint.');
        const [, id, action] = match;
        if (action === 'recent' && method === 'GET')
          return response(
            res,
            200,
            await store.recent(
              id,
              userId,
              new URL(req.url, origin).searchParams.get('direction') ?? 'last',
            ),
          );
        if (action === 'revision' && method === 'GET')
          return response(res, 200, await store.liveState(id, userId));
        if (!action && method === 'GET')
          return response(res, 200, await store.metadata(id, userId));
        if (action === 'document' && method === 'GET') {
          // A guest's copy goes through BrowserForks, with its rate limit and concurrency cap,
          // rather than the streamed snapshot.
          if (!userId) {
            const copy = await browserForks.copy(id, undefined, req.clientAddress);
            return response(res, 200, {
              document: copy.document,
              timeline: await store.metadata(id, null),
            });
          }
          // Named from its title, as the editor names the files it exports.
          const t = await store.access(id, userId);
          const file = download(new URL(req.url, origin), fileName(t.title, 'timeline-' + id));
          if (file && exportCache && !t.comparison)
            return await exportCache.respond(req, res, {
              timeline: t,
              version: 'r' + t.revision,
              format: 'ochx',
              filename: fileName(t.title, 'timeline-' + id),
              produce: () => liveFile(id, userId, t.revision),
              stream: streamResponse,
            });
          return await streamResponse(
            res,
            store.snapshotChunks(id, userId, { documentOnly: !!file }),
            file ?? {},
          );
        }
        // The timeline as a SQLite file: signed in, rate-limited per address; not for
        // comparisons.
        if (action === 'file' && method === 'GET') {
          const t = await store.access(id, userId);
          if (t.comparison)
            throw new HttpError(409, 'Export individual comparison sources instead.');
          if (!session)
            throw new HttpError(
              401,
              'Sign in to download SQLite timelines. Guests can export .ochx browser forks.',
            );
          // Made once per revision with the cache (the rate limit then applies to making it).
          if (exportCache && converter.enabled)
            return await exportCache.respond(req, res, {
              timeline: t,
              version: 'r' + t.revision,
              format: 'och',
              filename: fileName(t.title, 'timeline'),
              produce: () => sqliteFile(req, id, userId, t.revision),
              stream: streamResponse,
            });
          await auth.rateLimit('file-download:' + req.clientAddress);
          const snapshot = await store.snapshot(id, userId);
          return fileResponse(res, await converter.convert('write', snapshot.document));
        }
        // Deletes every moment in a range, and the durations inside it, as one save (#91).
        if (action === 'delete-range' && method === 'POST') {
          auth.require(session, req);
          const input = await body(req);
          const lower = bound(input.lower),
            upper = bound(input.upper);
          if (
            typeof input.revision !== 'string' ||
            !/^\d+$/.test(input.revision) ||
            lower === null ||
            upper === null ||
            Q.parse(lower).compare(Q.parse(upper)) > 0
          )
            throw new HttpError(400, 'Give a revision and a range from lower to upper.');
          const t = await store.access(id, userId);
          if (!t.canWrite) throw new HttpError(403, 'Only writers can delete moments.');
          const result = await deleteWhere(store, t, userId, input.revision, { lower, upper });
          return response(res, 200, result);
        }
        // Shifts and scales times for good (#96; time-map.mjs), as one save, streaming its
        // progress as JSON lines.
        if (action === 'map-times' && method === 'POST') {
          auth.require(session, req);
          const input = await body(req);
          if (typeof input.revision !== 'string' || !/^\d+$/.test(input.revision))
            throw new HttpError(400, 'Expected a revision string.');
          let mapping;
          try {
            mapping = timeMapping(input.mapping);
          } catch (error) {
            throw new HttpError(400, error.message);
          }
          const filter = viewFilter(input.filter) ?? null;
          const t = await store.access(id, userId);
          if (t.comparison) throw new HttpError(409, 'Shift the timelines this compares instead.');
          if (!t.canWrite) throw new HttpError(403, 'Only writers can change times.');
          if (t.revision !== input.revision)
            throw new HttpError(409, 'Someone changed this timeline. Reload it, then try again.');
          const run = (progress) =>
            mapTimes(store, t, userId, { revision: input.revision, mapping, filter }, progress);
          // Progress as JSON lines for clients that read them; one reply for others (desktop).
          if (!/application\/x-ndjson/.test(req.headers.accept ?? ''))
            return response(res, 200, await run(undefined));
          return await streamResponse(res, progressLines(run), {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
          });
        }
        // An incremental save (store.save): up to 5000 changed moments and durations (null to
        // delete) and 5000 relationships, at `revision`, with the settings sent back. Each
        // moment is validated in the context of those settings; ids must be unique within the
        // save. The store checks write access and the revision.
        if (action === 'changes' && method === 'PUT') {
          auth.require(session, req);
          const input = await body(req);
          const durationInput = input.durationChanges ?? [];
          const relationshipInput = input.relationshipChanges ?? [];
          if (!Array.isArray(relationshipInput) || relationshipInput.length > 5000)
            throw new HttpError(400, 'Expected at most 5000 changed relationships.');
          const relationshipChanges = relationshipInput.map((change) => {
            try {
              if (typeof change?.related !== 'boolean')
                throw new Error('Expected related: true or false.');
              return {
                ...canonicalRelationship(validateRef(change.a), validateRef(change.b)),
                related: change.related,
              };
            } catch (error) {
              throw new HttpError(400, error.message);
            }
          });
          if (
            typeof input.revision !== 'string' ||
            !/^\d+$/.test(input.revision) ||
            !Array.isArray(input.changes) ||
            !Array.isArray(durationInput) ||
            input.changes.length + durationInput.length > 5000
          )
            throw new HttpError(
              400,
              'Expected a revision and at most 5000 changed events (moments and durations).',
            );
          const settings = document({ ...input.settings, events: [] });
          const ids = new Set();
          const changes = input.changes.map((change) => {
            if (
              !change ||
              typeof change.id !== 'string' ||
              !/^[A-Za-z0-9_.:-]{1,128}$/.test(change.id) ||
              ids.has(change.id)
            )
              throw new HttpError(400, 'Changed moment IDs must be valid and unique.');
            ids.add(change.id);
            if (change.event === null) return { id: change.id, event: null };
            const event = document({ ...settings, events: [change.event] }, true).events[0];
            if (!event || event.id !== change.id)
              throw new HttpError(400, 'Changed moment ID mismatch.');
            return { id: change.id, event };
          });
          const durationIds = new Set();
          const durationChanges = durationInput.map((change) => {
            if (
              !change ||
              typeof change.id !== 'string' ||
              !/^[A-Za-z0-9_.:-]{1,128}$/.test(change.id) ||
              durationIds.has(change.id)
            )
              throw new HttpError(400, 'Changed duration IDs must be valid and unique.');
            durationIds.add(change.id);
            if (change.duration === null) return { id: change.id, duration: null };
            let duration;
            try {
              duration = validateDuration(change.duration, parseTime);
            } catch (error) {
              throw new HttpError(400, error.message);
            }
            if (duration.id !== change.id)
              throw new HttpError(400, 'Changed duration ID mismatch.');
            return { id: change.id, duration };
          });
          return response(res, 200, {
            ...(await store.save(id, userId, input.revision, null, {
              settings,
              changes,
              durationChanges,
              relationshipChanges,
              // What the editor saw, to merge onto a newer revision (#165; save-merge.mjs).
              base: saveBase(input.base),
            })),
            ...saveWarnings(
              settings.plugins,
              durationChanges.flatMap((change) => (change.duration ? [change.duration] : [])),
            ),
          });
        }
        // A save of the whole document at `revision`.
        if (!action && method === 'PUT') {
          auth.require(session, req);
          const input = await body(req);
          if (typeof input.revision !== 'string' || !/^\d+$/.test(input.revision))
            throw new HttpError(400, 'Expected a revision string.');
          const saved = document(input.document);
          return response(res, 200, {
            ...(await store.save(id, userId, input.revision, saved)),
            ...saveWarnings(saved.plugins, saved.durations),
          });
        }
        // Queries (store.query), for anyone who may see the timeline: tags, related entities,
        // an overview of a range, text search, duration and moment pages, single lookups.
        // Each kind's input is checked here; `revision` reads an earlier saved state.
        if (action === 'query' && method === 'POST') {
          const input = await body(req);
          if (
            input.revision !== undefined &&
            (typeof input.revision !== 'string' || !/^\d+$/.test(input.revision))
          )
            throw new HttpError(400, 'Expected a revision string.');
          const filter = viewFilter(input.filter);
          if (input.kind === 'tags')
            return response(res, 200, await store.query(id, userId, { kind: 'tags' }));
          if (input.kind === 'related') {
            const limit = input.limit ?? 25;
            let entity;
            try {
              entity = validateRef(input.entity);
            } catch (error) {
              throw new HttpError(400, error.message);
            }
            if (
              !Number.isInteger(limit) ||
              limit < 1 ||
              limit > 100 ||
              (input.after != null &&
                (!['moment', 'duration'].includes(input.after.kind) ||
                  typeof input.after.id !== 'string' ||
                  !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.after.id)))
            )
              throw new HttpError(
                400,
                'A related page needs an entity, a limit and a valid cursor.',
              );
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'related',
                entity:
                  'moment' in entity
                    ? { kind: 'moment', id: entity.moment }
                    : { kind: 'duration', id: entity.duration },
                after: input.after ? { kind: input.after.kind, id: input.after.id } : null,
                limit,
                ...(input.revision ? { revision: input.revision } : {}),
              }),
            );
          }
          if (input.kind === 'overview') {
            const lower = bound(input.lower),
              upper = bound(input.upper),
              threshold = bound(input.threshold);
            if (
              lower === null ||
              upper === null ||
              threshold === null ||
              Q.parse(threshold).compare(Q.zero) < 0
            )
              throw new HttpError(400, 'Overview needs bounds and a nonnegative threshold.');
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'overview',
                lower,
                upper,
                threshold,
                ...(filter ? { filter } : {}),
                ...(input.revision ? { revision: input.revision } : {}),
                ...(input.plugins !== undefined
                  ? {
                      plugins: queryPlugins(input.plugins),
                    }
                  : {}),
              }),
            );
          }
          if (input.kind === 'search') {
            const page = input.page ?? 1;
            if (
              typeof input.text !== 'string' ||
              input.text.length > 200 ||
              !Number.isInteger(page) ||
              page < 1 ||
              page > 4000 ||
              (input.only !== undefined && input.only !== 'moment')
            )
              throw new HttpError(400, 'Search needs text of at most 200 characters and a page.');
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'search',
                text: input.text,
                page,
                ...(input.only ? { only: input.only } : {}),
                ...(input.revision ? { revision: input.revision } : {}),
              }),
            );
          }
          // The durations touching a window, as drawn there (#316): searchable, sorted, paged
          // by offset up to the counting cap.
          if (input.kind === 'durations' && input.overlapping === true) {
            const lower = bound(input.lower),
              upper = bound(input.upper),
              threshold = input.threshold == null ? '0' : bound(input.threshold),
              limit = input.limit ?? 25,
              offset = input.offset ?? 0,
              sort = input.sort ?? 'extent',
              text = input.text ?? '';
            if (
              lower === null ||
              upper === null ||
              threshold === null ||
              !Number.isInteger(limit) ||
              limit < 1 ||
              limit > 100 ||
              !Number.isInteger(offset) ||
              offset < 0 ||
              offset >= DURATION_COUNT_CAP ||
              !['extent', 'start', 'title'].includes(sort) ||
              typeof text !== 'string' ||
              text.length > 200
            )
              throw new HttpError(
                400,
                'A list of durations needs bounds, a limit, an offset, a sort and short text.',
              );
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'durations',
                overlapping: true,
                lower,
                upper,
                threshold,
                limit,
                offset,
                sort,
                text: text.trim(),
                ...(filter ? { filter } : {}),
                ...(input.revision ? { revision: input.revision } : {}),
              }),
            );
          }
          if (input.kind === 'durations') {
            const lower = bound(input.lower),
              upper = bound(input.upper),
              limit = input.limit ?? 25;
            if (
              lower === null ||
              upper === null ||
              !Number.isInteger(limit) ||
              limit < 1 ||
              limit > 100 ||
              (input.after != null &&
                (typeof input.after.id !== 'string' ||
                  !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.after.id) ||
                  bound(input.after.first) === null))
            )
              throw new HttpError(400, 'A duration page needs bounds, a limit and a valid cursor.');
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'durations',
                lower,
                upper,
                limit,
                ...(filter ? { filter } : {}),
                after: input.after ? { first: bound(input.after.first), id: input.after.id } : null,
                ...(input.revision ? { revision: input.revision } : {}),
              }),
            );
          }
          if (input.kind === 'duration' || input.kind === 'moment') {
            if (typeof input.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.id))
              throw new HttpError(400, `A ${input.kind} lookup needs its ID.`);
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: input.kind,
                id: input.id,
                ...(input.revision ? { revision: input.revision } : {}),
              }),
            );
          }
          if (input.kind !== 'events') throw new HttpError(400, 'Unknown query kind.');
          if (
            input.id !== undefined &&
            (typeof input.id !== 'string' ||
              !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.id) ||
              input.lower == null)
          )
            throw new HttpError(400, 'A moment lookup needs an ID and its exact coordinate.');
          const limit = input.limit ?? 100;
          if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new HttpError(400, 'Page size must be 1–100.');
          if (
            input.after &&
            (!/^[A-Za-z0-9_.:-]{1,128}$/.test(input.after.id) ||
              typeof input.after.time !== 'string')
          )
            throw new HttpError(400, 'Invalid page cursor.');
          return response(
            res,
            200,
            await store.query(id, userId, {
              kind: 'events',
              ...(filter ? { filter } : {}),
              ...(input.id !== undefined ? { id: input.id } : {}),
              ...(input.revision ? { revision: input.revision } : {}),
              lower: bound(input.lower),
              upper: bound(input.upper),
              limit,
              after: input.after ? { time: bound(input.after.time), id: input.after.id } : null,
            }),
          );
        }
        // Sharing, settings and deletion stay available while a copy is being prepared.
        const t = await store.access(id, userId, store.pool, { preparing: true });
        if (!t.canShare) throw new HttpError(403, 'Only the owner can manage sharing.');
        if (!action && method === 'DELETE') {
          auth.require(session, req);
          // Rechecked under the timeline's row lock, so ownership cannot change between the
          // check and the deletion; history kept outside the timeline goes with it.
          await store.transaction(async (c) => {
            await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
            const current = await store.access(id, userId, c, { preparing: true });
            if (!current.canShare)
              throw new HttpError(403, 'Only the owner can delete a timeline.');
            await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
            await store.removeHistory(c, id);
          });
          // Its cached downloads go with it (the sweep catches any this misses).
          await exportCache?.forget(id);
          return response(res, 200, { ok: true });
        }
        // Sharing and settings: visibility, private forks, retention, saved history, content
        // labels, address, image. Rechecked under the timeline's row lock; publishing is
        // refused for a comparison with a private source, a copy of a private timeline, and a
        // timeline moderators restricted.
        if (action === 'settings' && method === 'PATCH') {
          auth.require(session, req);
          const input = await body(req);
          if (
            !input ||
            Object.keys(input).some(
              (k) =>
                ![
                  'visibility',
                  'allowPrivateForks',
                  'retention',
                  'keepHistory',
                  'labels',
                  'slug',
                  'image',
                ].includes(k),
            ) ||
            (input.labels !== undefined &&
              (!Array.isArray(input.labels) ||
                contentLabels(input.labels).length !== input.labels.length)) ||
            (input.keepHistory !== undefined && typeof input.keepHistory !== 'boolean') ||
            (input.slug !== undefined && input.slug !== null && typeof input.slug !== 'string') ||
            !Object.keys(input).length ||
            (input.retention !== undefined &&
              input.retention !== null &&
              (typeof input.retention !== 'string' || input.retention.length > 200)) ||
            (input.visibility !== undefined && !['private', 'public'].includes(input.visibility)) ||
            (input.allowPrivateForks !== undefined && typeof input.allowPrivateForks !== 'boolean')
          )
            throw new HttpError(
              400,
              'Choose visibility, a private forking policy, a retention period, whether to keep saved history, content labels, an address and/or an image.',
            );
          // The timeline's image (#339): a link and alt text, or null to remove it.
          let image;
          if (input.image != null)
            try {
              image = validateTimelineImage(input.image);
            } catch (error) {
              throw new HttpError(400, error.message);
            }
          await store.transaction(async (c) => {
            await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
            const current = await store.access(id, userId, c, { preparing: true });
            if (!current.canShare) throw new HttpError(403, 'Only the owner can manage sharing.');
            if (input.visibility === 'public' && current.comparison) {
              const sources = await c.query(
                "SELECT id FROM oc_timelines WHERE id=ANY($1::uuid[]) AND comparison IS NULL AND visibility='public'",
                [current.comparison.sources],
              );
              if (sources.rows.length !== current.comparison.sources.length)
                throw new HttpError(
                  403,
                  'All comparison sources must be public before publishing the view.',
                );
            }
            if (input.visibility === 'public' && current.publication_restricted)
              throw new HttpError(403, 'Copies of private upstream timelines must remain private.');
            if (input.visibility === 'public' && current.moderation)
              throw new HttpError(
                403,
                'Moderators restricted this timeline, so it stays private. You can ask for a review in your account.',
              );
            // Keeping only the last of a calendar timeline: expired on the next run.
            const retention =
              input.retention === undefined
                ? current.retention_seconds
                : input.retention === null || !input.retention.trim()
                  ? null
                  : parseRetention(input.retention, current.presentation);
            // Its address, /<owner>/<slug> (#148); an empty slug removes it.
            if (input.slug !== undefined)
              await store.setSlug(c, current, input.slug?.trim().toLowerCase() || null);
            // Saved history stops (forgetting past revisions others do not read) or starts
            // again from the current state.
            if (input.keepHistory === false) await store.stopHistory(c, id);
            if (input.keepHistory === true) await store.startHistory(c, id, userId);
            // The image is one of the document's settings, so it is saved as a save of the
            // settings alone would save it: a revision of its own, kept in saved history,
            // exports and forks. A comparison is rebuilt from its sources and has none.
            if (input.image !== undefined) {
              if (current.comparison)
                throw new HttpError(409, 'A comparison shows its sources and has no image.');
              if (current.preparing_revision_id)
                throw new HttpError(409, 'This copy is still being prepared. Try again shortly.');
              const { image: _previous, events: _events, ...settings } = timelineSettings(current);
              await store.applyMerge(
                c,
                current,
                userId,
                {
                  settings: image ? { ...settings, image } : settings,
                  changes: [],
                  durationChanges: [],
                  relationshipChanges: [],
                },
                'save',
                [current.head_revision_id],
              );
            }
            // An address or image alone leaves the timeline's revision as it is (the image's
            // save numbered its own).
            if (Object.keys(input).every((k) => k === 'slug' || k === 'image')) return;
            // A changed retention period clears retention_applied_at, so the next run applies
            // it at once; the revision is bumped, as a save does.
            await c.query(
              'UPDATE oc_timelines SET visibility=$2,allow_private_forks=$3,retention_seconds=$4,retention_applied_at=CASE WHEN retention_seconds IS DISTINCT FROM $4 THEN NULL ELSE retention_applied_at END,content_labels=$5,revision=revision+1,updated_at=now() WHERE id=$1',
              [
                id,
                input.visibility ?? current.visibility,
                input.allowPrivateForks ?? current.allow_private_forks,
                retention,
                // What its owner marks it as containing (#115); moderators' labels stay.
                input.labels === undefined ? current.content_labels : contentLabels(input.labels),
              ],
            );
          });
          const updated = await store.metadata(id, userId);
          // Made private: its downloads handed out at the cache's public address go.
          if (updated.visibility !== 'public') await exportCache?.forget(id, { published: true });
          return response(res, 200, await retentionInfo(store, updated));
        }
        // Members: listed, added (or their role changed: ON CONFLICT updates it) and removed by
        // the owner or an administrator (canShare above). 'editor' is accepted as the old name
        // of 'writer'.
        if (action === 'members' && method === 'GET') {
          const { rows } = await pool.query(
            'SELECT u.username,m.role FROM oc_members m JOIN oc_users u ON u.id=m.user_id WHERE timeline_id=$1 ORDER BY u.username',
            [id],
          );
          return response(res, 200, { members: rows });
        }
        if (action === 'members' && ['POST', 'DELETE'].includes(method)) {
          auth.require(session, req);
          const input = await body(req);
          const { rows } = await pool.query('SELECT id FROM oc_users WHERE username=$1', [
            input.username?.toLowerCase(),
          ]);
          const member = rows[0];
          if (!member) throw new HttpError(404, 'That account does not exist.');
          if (member.id === t.owner_id) throw new HttpError(400, 'The owner keeps owner access.');
          if (method === 'DELETE')
            await pool.query('DELETE FROM oc_members WHERE timeline_id=$1 AND user_id=$2', [
              id,
              member.id,
            ]);
          else {
            if (input.role === 'editor') input.role = 'writer';
            if (!['viewer', 'contributor', 'writer'].includes(input.role))
              throw new HttpError(400, 'Choose viewer, contributor, or writer.');
            await pool.query(
              'INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(timeline_id,user_id) DO UPDATE SET role=excluded.role',
              [id, member.id, input.role],
            );
          }
          return response(res, 200, { ok: true });
        }
        throw new HttpError(405, 'Method not allowed.');
      }
      // The static app: only the files named here, so no path from the request reaches the
      // file system beyond this list.
      const file = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (
        !/^(index\.html|legal\.html|openchronology-web-source\.tar\.gz|app\.(js|css)(\.map)?|core\.mjs(\.map)?|(?:THIRD_PARTY|LICENSE|NOTICE)\.txt)$/.test(
          file,
        )
      )
        throw new HttpError(404, 'Not found.');
      const bytes = await readFile(join(staticDir, file));
      res.writeHead(200, {
        'Content-Type': file.endsWith('.tar.gz')
          ? 'application/gzip'
          : file.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : file.endsWith('.css')
              ? 'text/css; charset=utf-8'
              : file.endsWith('.map')
                ? 'application/json'
                : file.endsWith('.txt')
                  ? 'text/plain; charset=utf-8'
                  : 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      // Errors as JSON with a status: an HttpError's own; the storage quota trigger's
      // exception (P0001) as 413; a statement timeout (57014) as 503; a missing static file
      // as 404; JavaScript syntax, range and type errors as 400; anything else as 500, logged,
      // with a generic message. A 428 carries a fresh challenge, a 409 from a save its first
      // 100 conflicts.
      const status =
        error.status ??
        (error.code === 'P0001' && error.message.startsWith('Account storage limit')
          ? 413
          : undefined) ??
        // A statement that ran past the server's statement_timeout: temporary, and smaller
        // saves avoid it (the log writers halve their batches on it).
        (error.code === '57014' ? 503 : undefined) ??
        (error.code === 'ENOENT'
          ? 404
          : error instanceof SyntaxError ||
              error instanceof RangeError ||
              error instanceof TypeError
            ? 400
            : 500);
      // A 400 from a TypeError, RangeError or SyntaxError rather than an HttpError is logged
      // too: it is usually input a handler did not check, but may be a bug (#193).
      if (
        status === 500 ||
        error.code === '57014' ||
        (status === 400 && error.status === undefined && error.code === undefined)
      )
        console.error(error);
      response(res, status, {
        error:
          status === 500
            ? 'Server request failed.'
            : error.code === '57014'
              ? TOO_SLOW
              : error.message,
        ...(status === 428 && error.challenge ? { challenge: error.challenge } : {}),
        // A write refused until the account agrees to this version of the terms (#277).
        ...(status === 403 && error.terms ? { terms: error.terms } : {}),
        ...(status === 409 && Array.isArray(error.conflicts)
          ? { conflicts: error.conflicts.slice(0, 100), conflictCount: error.conflicts.length }
          : {}),
      });
    }
  };
}

// Lightweight Node harness retained for service tests; production is served by Next.js.
export function createApplication(options) {
  return createServer(
    { requestTimeout: 30000, headersTimeout: 15000, maxHeaderSize: 16384 },
    createRequestHandler(options),
  );
}
