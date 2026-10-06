import { createPluginLibrary } from './plugins.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';
import { Auth } from './auth.mjs';
import { OAuth, providersFromEnv } from './oauth.mjs';
import { DeviceAuth } from './device-auth.mjs';
import { TimelineFiles } from './files.mjs';
import { HttpError, PostgresStore } from './store.mjs';
import { Q, parseTime, validateDocument } from '../dist/core.mjs';
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
function document(value) {
  try {
    return validateDocument(value);
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
export function createApplication({
  pool = null,
  origin = 'http://localhost:5173',
  staticDir = resolve('dist'),
  providers = providersFromEnv(),
  converter = new TimelineFiles(),
  fetcher = fetch,
  trustProxy = false,
  plugins,
} = {}) {
  const library = createPluginLibrary(plugins);
  const store = pool ? new PostgresStore(pool) : null,
    auth = pool ? new Auth(pool, origin) : null,
    oauth = auth ? new OAuth(auth, providers, fetcher) : null,
    devices = auth ? new DeviceAuth(auth) : null;
  return createServer(
    { requestTimeout: 30000, headersTimeout: 15000, maxHeaderSize: 16384 },
    async (req, res) => {
      // Enable only behind a proxy that overwrites X-Forwarded-For and blocks direct access.
      if (trustProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && isIP(forwarded.trim()))
          req.clientAddress = forwarded.trim();
      }
      req.clientAddress ??= req.socket.remoteAddress ?? 'unknown';
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (origin.startsWith('https:'))
        res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      try {
        const pathname = new URL(req.url, origin).pathname,
          method = req.method;
        if (pathname === '/healthz' && method === 'GET') {
          try {
            if (pool) await pool.query('SELECT 1 FROM oc_timelines LIMIT 0');
            return response(res, 200, { status: 'ok', storage: pool ? 'postgresql' : 'browser' });
          } catch {
            return response(res, 503, { status: 'unavailable' });
          }
        }
        if (
          !['GET', 'HEAD'].includes(method) &&
          req.headers.origin &&
          req.headers.origin !== origin
        )
          throw new HttpError(403, 'Cross-origin request rejected.');
        if (pathname === '/api/plugins' && method === 'GET') {
          const query = new URL(req.url, origin).searchParams;
          return response(
            res,
            200,
            library.search({
              search: query.get('search') ?? '',
              page: Number(query.get('page') ?? 1),
              limit: Number(query.get('limit') ?? 12),
            }),
          );
        }
        if (pathname === '/api/plugins/search' && method === 'POST') {
          return response(res, 200, library.search(await body(req, 4096)));
        }
        const pluginPath = /^\/api\/plugins\/([a-z][a-z0-9-]{0,63})\/([1-9][0-9]{0,9})$/.exec(
          pathname,
        );
        if (pluginPath && method === 'GET')
          return response(res, 200, library.get(pluginPath[1], pluginPath[2]));
        if (pathname === '/api/session' && method === 'GET') {
          const session = auth ? await auth.session(req) : null;
          const nonce = !session && auth ? auth.nonce(req, 'login') : null;
          return response(
            res,
            200,
            {
              server: !!pool,
              user: session ? { id: session.id, username: session.username } : null,
              csrf: session?.csrf ?? nonce,
              providers: oauth?.names() ?? [],
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
              await body(req),
              pathname.endsWith('/register'),
              req.clientAddress,
              req.headers['x-oc-client'] === 'desktop' ? 'desktop' : 'web',
            );
            if (previous)
              await pool.query('DELETE FROM oc_sessions WHERE token_hash=$1', [
                previous.token_hash,
              ]);
            return response(
              res,
              200,
              {
                user: result.user,
                csrf: result.csrf,
                ...(result.token ? { token: result.token } : {}),
              },
              result.cookie
                ? { 'Set-Cookie': [result.cookie, auth.nonceCookie('login', '', true)] }
                : {},
            );
          }
          const session = await auth.session(req),
            userId = session?.id;
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
                (result.cancelled
                  ? result.returnTo.includes('#')
                    ? ''
                    : '?auth_cancelled=1'
                  : ''),
              result.cookie ? [result.cookie, auth.nonceCookie('login', '', true)] : undefined,
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
            return response(res, 200, {
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
          if (pathname === '/api/timelines' && method === 'GET') {
            if (!session) throw new HttpError(401, 'Sign in to see your timelines.');
            const { rows } = await pool.query(
              `SELECT t.id,t.title,t.visibility,t.revision,t.event_count,u.username AS owner,
            CASE WHEN t.owner_id=$1 THEN 'owner' ELSE m.role END AS role FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
            LEFT JOIN oc_members m ON m.timeline_id=t.id AND m.user_id=$1 WHERE t.owner_id=$1 OR m.user_id=$1 ORDER BY t.updated_at DESC`,
              [userId],
            );
            return response(res, 200, { timelines: rows });
          }
          if (pathname === '/api/timelines' && method === 'POST') {
            auth.require(session, req);
            return response(res, 201, await store.create(userId, document(await body(req))));
          }
          const match =
            /^\/api\/timelines\/([^/]+)(?:\/(document|query|members|settings|file))?$/.exec(
              pathname,
            );
          if (!match || !uuid.test(match[1])) throw new HttpError(404, 'Unknown endpoint.');
          const [, id, action] = match;
          if (!action && method === 'GET')
            return response(res, 200, await store.metadata(id, userId));
          if (action === 'document' && method === 'GET')
            return response(res, 200, await store.snapshot(id, userId));
          if (action === 'file' && method === 'GET') {
            await auth.rateLimit('file-download:' + req.clientAddress);
            const snapshot = await store.snapshot(id, userId);
            return fileResponse(res, await converter.convert('write', snapshot.document));
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
                await store.query(id, userId, { kind: 'overview', lower, upper, threshold }),
              );
            }
            if (input.kind !== 'events') throw new HttpError(400, 'Unknown query kind.');
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
                lower: bound(input.lower),
                upper: bound(input.upper),
                limit,
                after: input.after ? { time: bound(input.after.time), id: input.after.id } : null,
              }),
            );
          }
          const t = await store.access(id, userId);
          if (!t.canShare) throw new HttpError(403, 'Only the owner can manage sharing.');
          if (action === 'settings' && method === 'PATCH') {
            auth.require(session, req);
            const input = await body(req);
            if (!['private', 'public'].includes(input.visibility))
              throw new HttpError(400, 'Choose private or public.');
            await pool.query(
              'UPDATE oc_timelines SET visibility=$2,revision=revision+1,updated_at=now() WHERE id=$1',
              [id, input.visibility],
            );
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
              if (!['viewer', 'editor'].includes(input.role))
                throw new HttpError(400, 'Choose viewer or editor.');
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
        if (!/^(index\.html|app\.(js|css)(\.map)?|core\.mjs(\.map)?|THIRD_PARTY\.txt)$/.test(file))
          throw new HttpError(404, 'Not found.');
        const bytes = await readFile(join(staticDir, file));
        res.writeHead(200, {
          'Content-Type': file.endsWith('.html')
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
          (error.code === 'ENOENT'
            ? 404
            : error instanceof SyntaxError ||
                error instanceof RangeError ||
                error instanceof TypeError
              ? 400
              : 500);
        if (status === 500) console.error(error);
        response(res, status, { error: status === 500 ? 'Server request failed.' : error.message });
      }
    },
  );
}
