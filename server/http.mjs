// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { setTimelineStar } from './stars.mjs';
import { Administration, usage, requireDataProvider, avatarValue } from './administration.mjs';
import { authorizeKey, keyRequestRead } from './api-keys.mjs';
import { BrowserForks } from './browser-forks.mjs';
import { queryPlugins } from './query-plugins.mjs';
import { Collaboration, searchTimelines } from './collaboration.mjs';
import { Versioning } from './versioning.mjs';
import { createPluginLibrary } from './plugins.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';
import { Auth } from './auth.mjs';
import { OAuth, providersFromEnv } from './oauth.mjs';
import { mailFromEnv, encryptionKey } from './mail.mjs';
import { DeviceAuth } from './device-auth.mjs';
import { TimelineFiles } from './files.mjs';
import { HttpError, PostgresStore } from './store.mjs';
import { Q, parseTime, validateDocument, validateDuration } from '../dist/core.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
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
async function fileBody(req) {
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
    if (size > 32 * 1024 * 1024) throw new HttpError(413, 'SQLite upload exceeds 32 MiB.');
    parts.push(part);
  }
  return Buffer.concat(parts);
}
function redirect(res, location, cookie) {
  res.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  });
  res.end();
}
function fileResponse(res, bytes) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openchronology.sqlite',
    'Content-Disposition': 'attachment; filename="timeline.och"',
    'Cache-Control': 'no-store',
    'Content-Length': bytes.length,
  });
  res.end(bytes);
}
function document(value, partial = false) {
  try {
    return validateDocument(value, partial);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
function bound(value) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Time bounds must be rational strings.');
  try {
    return parseTime(value).toString();
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
function response(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(value));
}
export function createRequestHandler({
  pool = null,
  origin = 'http://localhost:5173',
  staticDir = resolve('dist'),
  providers = providersFromEnv(),
  converter = new TimelineFiles(),
  fetcher = fetch,
  mailer = mailFromEnv(),
  securityKey = encryptionKey(process.env.AUTH_ENCRYPTION_KEY),
  passwordCheck,
  trustProxy = false,
  plugins,
  featured = [],
} = {}) {
  const library = createPluginLibrary(plugins, pool);
  const store = pool ? new PostgresStore(pool) : null,
    auth = pool
      ? new Auth(pool, origin, {
          mailer,
          key: securityKey,
          ...(passwordCheck ? { passwordCheck } : {}),
        })
      : null,
    oauth = auth ? new OAuth(auth, providers, fetcher) : null,
    devices = auth ? new DeviceAuth(auth) : null;
  const administration = store ? new Administration(store, auth) : null;
  const collaboration = store ? new Collaboration(store) : null;
  const browserForks = store ? new BrowserForks(store, auth) : null;
  return async (req, res) => {
    // Enable only behind a proxy that overwrites X-Forwarded-For and blocks direct access.
    if (trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && isIP(forwarded.trim()))
        req.clientAddress = forwarded.trim();
    }
    req.clientAddress ??= req.socket.remoteAddress ?? 'unknown';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (origin.startsWith('https:')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const pathname = new URL(req.url, origin).pathname,
        method = req.method;
      if (
        (req.headers.authorization ?? '').startsWith('Bearer och_key_') &&
        !pathname.startsWith('/api/timelines')
      )
        throw new HttpError(403, 'API keys are limited to timeline endpoints.');
      if (pathname === '/healthz' && method === 'GET') {
        try {
          if (pool)
            await pool.query(
              'SELECT t.tags,t.assets,t.search_document,t.head_revision_id,p.source_revision_id FROM oc_timelines t LEFT JOIN oc_proposals p ON false LEFT JOIN oc_plugins l ON false LEFT JOIN oc_revisions r ON false LEFT JOIN oc_snapshots s ON false LIMIT 0',
            );
          return response(res, 200, { status: 'ok', storage: pool ? 'postgresql' : 'browser' });
        } catch {
          return response(res, 503, { status: 'unavailable' });
        }
      }
      if (!['GET', 'HEAD'].includes(method) && req.headers.origin && req.headers.origin !== origin)
        throw new HttpError(403, 'Cross-origin request rejected.');
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
      if (pathname === '/api/session' && method === 'GET') {
        const session = auth ? await auth.session(req) : null;
        const nonce = !session && auth ? auth.nonce(req, 'login') : null;
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
                }
              : null,
            csrf: session?.csrf ?? nonce,
            providers: oauth?.names() ?? [],
            ...(auth
              ? {
                  security: {
                    email: auth.security.available,
                    mfa: auth.security.available,
                    registration: auth.security.available,
                  },
                  challenge: (await auth.security.pending(req))?.purpose ?? null,
                }
              : {}),
            fileExchange: !!pool && converter.enabled,
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
        if (['/api/auth/login', '/api/auth/register'].includes(pathname) && method === 'POST') {
          const previous = await auth.session(req);
          if (previous) auth.require(previous, req);
          else auth.requireLogin(req);
          const result = await auth.signIn(
            await body(req, 8192),
            pathname.endsWith('/register'),
            req.clientAddress,
            req.headers['x-oc-client'] === 'desktop' ? 'desktop' : 'web',
            req,
          );
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
        const session = await auth.session(req),
          userId = session?.id;
        if ((req.headers.authorization ?? '').startsWith('Bearer och_key_') && !session)
          throw new HttpError(401, 'API key is expired, revoked, or invalid.');
        authorizeKey(session, pathname, method);
        if (session?.kind === 'api')
          await auth.rateLimit(
            'api-key:' + session.api_key_id,
            Math.max(1, Math.min(1000, Number(process.env.API_KEY_REQUESTS_PER_MINUTE) || 120)),
          );
        if (
          pathname.startsWith('/api/timelines') &&
          !keyRequestRead(pathname, method) &&
          method !== 'DELETE'
        )
          await requireDataProvider(pool, userId);
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
        if (pathname === '/api/auth/profile' && method === 'PATCH') {
          auth.require(session, req);
          const value = await body(req, 400000);
          if (!value || Object.keys(value).some((k) => k !== 'avatarUrl'))
            throw new HttpError(400, 'Invalid profile.');
          await pool.query('UPDATE oc_users SET avatar_url=$2 WHERE id=$1', [
            userId,
            avatarValue(value.avatarUrl),
          ]);
          return response(res, 200, { ok: true });
        }
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
        if (pathname === '/api/auth/identities/unlink' && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('unlink:' + userId);
          const value = await body(req, 8192);
          if (!['google', 'github', 'facebook'].includes(value.provider))
            throw new HttpError(400, 'Unknown provider.');
          await auth.security.transaction(async (c) => {
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
          let result;
          if (securityAction === 'mfa/complete')
            result = await security.complete(req, input.code, req.clientAddress);
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
        if (pathname === '/api/plugins/publish' && method === 'POST') {
          auth.require(session, req);
          await requireDataProvider(pool, userId);
          await auth.rateLimit('plugin-publish:' + userId);
          const manifest = await library.publish(userId, await body(req, 32768));
          return response(res, 201, manifest);
        }
        const providerRoute = /^\/api\/auth\/(google|github|facebook)\/(start|callback)$/.exec(
          pathname,
        );
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
              'SELECT email,email_verified_at,mfa_enabled,password_hash IS NOT NULL AS has_password,(SELECT count(*)::integer FROM oc_recovery_codes WHERE user_id=oc_users.id) AS recovery_remaining FROM oc_users WHERE id=$1',
              [userId],
            )
          ).rows[0];
          return response(res, 200, {
            security: profile,
            profile: { avatarUrl: session.avatar_url ?? '' },
            usage: await usage(pool, userId),
            keys: await auth.keys.list(userId),
            identities: identities.map((row) => row.provider),
            sessions: sessions.map((row) => ({ ...row, current: row.id === session.token_hash })),
          });
        }
        if (pathname === '/api/auth/revoke-others' && method === 'POST') {
          auth.require(session, req);
          await pool.query('DELETE FROM oc_sessions WHERE user_id=$1 AND token_hash!=$2', [
            userId,
            session.token_hash,
          ]);
          return response(res, 200, { ok: true });
        }
        if (pathname === '/api/files/import' && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('files:' + userId);
          return response(res, 200, {
            document: await converter.convert('read', await fileBody(req)),
          });
        }
        if (pathname === '/api/files/export' && method === 'POST') {
          auth.require(session, req);
          await auth.rateLimit('files:' + userId);
          return fileResponse(res, await converter.convert('write', document(await body(req))));
        }
        if (pathname === '/api/auth/logout' && method === 'POST') {
          auth.require(session, req);
          await pool.query('DELETE FROM oc_sessions WHERE token_hash=$1', [session.token_hash]);
          return response(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie('', true) });
        }
        if (pathname === '/api/timelines/search' && method === 'POST')
          return response(
            res,
            200,
            await searchTimelines(pool, userId, await body(req, 4096), featured),
          );
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
        const pull =
          /^\/api\/timelines\/([a-f0-9-]{36})\/proposals(?:\/([a-f0-9-]{36})(?:\/(comments|resolve))?)?$/.exec(
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
            if (!sub) return response(res, 200, await collaboration.get(tid, pid, userId));
          }
          auth.require(session, req);
          await auth.rateLimit('proposals:' + userId);
          const input = await body(req);
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
        if (pathname === '/api/timelines' && method === 'GET') {
          if (!session) throw new HttpError(401, 'Sign in to see your timelines.');
          const { rows } = await pool.query(
            `SELECT t.id,t.title,t.visibility,t.revision,t.event_count,u.username AS owner,
            CASE WHEN t.owner_id=$1 THEN 'owner' ELSE m.role END AS role FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
            LEFT JOIN oc_members m ON m.timeline_id=t.id AND m.user_id=$1 WHERE t.owner_id=$1 OR m.user_id=$1 ORDER BY t.updated_at DESC LIMIT 100`,
            [userId],
          );
          return response(res, 200, { timelines: rows });
        }
        if (pathname === '/api/timelines' && method === 'POST') {
          auth.require(session, req);
          return response(res, 201, await store.create(userId, document(await body(req))));
        }
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
          return response(
            res,
            200,
            history[2]
              ? await versions.historical(history[1], history[2], userId)
              : await versions.history(
                  history[1],
                  userId,
                  Number(new URL(req.url, origin).searchParams.get('page') ?? 1),
                ),
          );
        }
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
        const forkAction = /^\/api\/timelines\/([a-f0-9-]{36})\/(fork|duplicate|sync)$/.exec(
          pathname,
        );
        if (forkAction && uuid.test(forkAction[1])) {
          auth.require(session, req);
          if (method !== 'POST') throw new HttpError(405, 'Method not allowed.');
          await auth.rateLimit('forks:' + userId);
          const versions = new Versioning(store),
            input = await body(req, 4096);
          return response(
            res,
            forkAction[2] === 'sync' ? 200 : 201,
            forkAction[2] === 'sync'
              ? await versions.sync(forkAction[1], userId, input)
              : await versions.copy(forkAction[1], userId, input, forkAction[2] === 'duplicate'),
          );
        }
        const match =
          /^\/api\/timelines\/([^/]+)(?:\/(document|query|members|settings|file|changes|revision|recent))?$/.exec(
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
          if (!userId) {
            const copy = await browserForks.copy(id, undefined, req.clientAddress);
            return response(res, 200, {
              document: copy.document,
              timeline: await store.metadata(id, null),
            });
          }
          return response(res, 200, await store.snapshot(id, userId));
        }
        if (action === 'file' && method === 'GET') {
          if ((await store.access(id, userId)).comparison)
            throw new HttpError(409, 'Export individual comparison sources instead.');
          if (!session)
            throw new HttpError(
              401,
              'Sign in to download SQLite timelines. Guests can export .ochx browser forks.',
            );
          await auth.rateLimit('file-download:' + req.clientAddress);
          const snapshot = await store.snapshot(id, userId);
          return fileResponse(res, await converter.convert('write', snapshot.document));
        }
        if (action === 'changes' && method === 'PUT') {
          auth.require(session, req);
          const input = await body(req);
          const durationInput = input.durationChanges ?? [];
          if (
            typeof input.revision !== 'string' ||
            !/^\d+$/.test(input.revision) ||
            !Array.isArray(input.changes) ||
            !Array.isArray(durationInput) ||
            input.changes.length + durationInput.length > 5000
          )
            throw new HttpError(
              400,
              'Expected a revision and at most 5000 changed moments and durations.',
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
          return response(
            res,
            200,
            await store.save(id, userId, input.revision, null, {
              settings,
              changes,
              durationChanges,
            }),
          );
        }
        if (!action && method === 'PUT') {
          auth.require(session, req);
          const input = await body(req);
          if (typeof input.revision !== 'string' || !/^\d+$/.test(input.revision))
            throw new HttpError(400, 'Expected a revision string.');
          return response(
            res,
            200,
            await store.save(id, userId, input.revision, document(input.document)),
          );
        }
        if (action === 'query' && method === 'POST') {
          const input = await body(req);
          if (
            input.revision !== undefined &&
            (typeof input.revision !== 'string' || !/^\d+$/.test(input.revision))
          )
            throw new HttpError(400, 'Expected a revision string.');
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
              page > 4000
            )
              throw new HttpError(400, 'Search needs text of at most 200 characters and a page.');
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'search',
                text: input.text,
                page,
                ...(input.revision ? { revision: input.revision } : {}),
              }),
            );
          }
          if (input.kind === 'duration') {
            if (typeof input.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.id))
              throw new HttpError(400, 'A duration lookup needs its ID.');
            return response(
              res,
              200,
              await store.query(id, userId, {
                kind: 'duration',
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
              ...(input.id !== undefined ? { id: input.id } : {}),
              ...(input.revision ? { revision: input.revision } : {}),
              lower: bound(input.lower),
              upper: bound(input.upper),
              limit,
              after: input.after ? { time: bound(input.after.time), id: input.after.id } : null,
            }),
          );
        }
        const t = await store.access(id, userId);
        if (!t.canShare) throw new HttpError(403, 'Only the owner can manage sharing.');
        if (!action && method === 'DELETE') {
          auth.require(session, req);
          await store.transaction(async (c) => {
            await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
            const current = await store.access(id, userId, c);
            if (!current.canShare)
              throw new HttpError(403, 'Only the owner can delete a timeline.');
            await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
            await store.removeHistory(c, id);
          });
          return response(res, 200, { ok: true });
        }
        if (action === 'settings' && method === 'PATCH') {
          auth.require(session, req);
          const input = await body(req);
          if (
            !input ||
            Object.keys(input).some((k) => !['visibility', 'allowPrivateForks'].includes(k)) ||
            !Object.keys(input).length ||
            (input.visibility !== undefined && !['private', 'public'].includes(input.visibility)) ||
            (input.allowPrivateForks !== undefined && typeof input.allowPrivateForks !== 'boolean')
          )
            throw new HttpError(400, 'Choose visibility and/or a private forking policy.');
          await store.transaction(async (c) => {
            await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
            const current = await store.access(id, userId, c);
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
            await c.query(
              'UPDATE oc_timelines SET visibility=$2,allow_private_forks=$3,revision=revision+1,updated_at=now() WHERE id=$1',
              [
                id,
                input.visibility ?? current.visibility,
                input.allowPrivateForks ?? current.allow_private_forks,
              ],
            );
          });
          return response(res, 200, await store.metadata(id, userId));
        }
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
      const status =
        error.status ??
        (error.code === 'P0001' && error.message.startsWith('Account storage limit')
          ? 413
          : undefined) ??
        (error.code === 'ENOENT'
          ? 404
          : error instanceof SyntaxError ||
              error instanceof RangeError ||
              error instanceof TypeError
            ? 400
            : 500);
      if (status === 500) console.error(error);
      response(res, status, {
        error: status === 500 ? 'Server request failed.' : error.message,
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
