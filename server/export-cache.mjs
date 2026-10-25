// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Cached downloads (#204): the .ochx and .och files the server makes for a timeline's
// revision are kept, so the next download of that revision reads a file instead of building
// it again. Kept on disk or in an S3-compatible bucket, listed in oc_export_cache, and held
// under EXPORT_CACHE_MAX_BYTES by removing the least recently downloaded first.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, constants, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { LimitError, storageBytes } from './limits.mjs';
import { restrictedTimeline } from './store.mjs';

/** A cache setting the server cannot start with; its message is safe to show the operator. */
export class ExportCacheError extends Error {}

/** Unset, the cache holds at most 2 GiB. */
export const DEFAULT_CACHE_BYTES = 2 * 1024 ** 3;
/** A build claimed this long ago and not finished is taken to have died with its server. */
const STALE_BUILD = "interval '15 minutes'";
/** How often entries of deleted or no-longer-public timelines are swept away. */
const SWEEP_EVERY = 10 * 60 * 1000;

const CONTENT_TYPES = {
  ochx: 'application/json; charset=utf-8',
  och: 'application/vnd.openchronology.sqlite',
};

/**
 * The cache's settings from the environment, or null when it is off:
 * - EXPORT_CACHE: `off`, `disk` or `s3`. Unset, `disk` when a directory is known
 *   (EXPORT_CACHE_DIR, or systemd's CACHE_DIRECTORY, under which it uses `exports/`), else off.
 * - EXPORT_CACHE_DIR: the disk cache's directory; for S3, where files are written before
 *   they are uploaded (the system's temporary directory when unset).
 * - EXPORT_CACHE_MAX_BYTES: a storage size such as `10GB` (at least 1 MiB); 2 GiB unset.
 * - EXPORT_CACHE_PUBLIC_URL: an http(s) address serving the cache's files (a file server in
 *   front of the directory, the bucket's public address, or a CDN in front of either). Public
 *   timelines' downloads then redirect there.
 * - EXPORT_CACHE_S3_ENDPOINT, _REGION (us-east-1), _BUCKET, _PREFIX, _ACCESS_KEY_ID,
 *   _SECRET_ACCESS_KEY, and _PATH_STYLE (`1`, the default, addresses the bucket in the path;
 *   `0` as a host name).
 * @throws {ExportCacheError} for a setting it cannot use
 */
export function exportCacheSettings(env = process.env) {
  const kind = (env.EXPORT_CACHE ?? '').trim().toLowerCase();
  const systemd = env.CACHE_DIRECTORY?.split(':')[0];
  const dir = env.EXPORT_CACHE_DIR?.trim() || (systemd ? join(systemd, 'exports') : '');
  const mode = kind || (dir ? 'disk' : 'off');
  if (!['off', 'disk', 's3'].includes(mode))
    throw new ExportCacheError('EXPORT_CACHE must be off, disk or s3.');
  if (mode === 'off') return null;
  let maxBytes = DEFAULT_CACHE_BYTES;
  const size = env.EXPORT_CACHE_MAX_BYTES?.trim();
  if (size) {
    try {
      maxBytes = Number(storageBytes(size));
    } catch (error) {
      if (error instanceof LimitError)
        throw new ExportCacheError(`EXPORT_CACHE_MAX_BYTES: ${error.message}`);
      throw error;
    }
    if (maxBytes < 1024 * 1024)
      throw new ExportCacheError('EXPORT_CACHE_MAX_BYTES must be at least 1MiB.');
  }
  let publicUrl = env.EXPORT_CACHE_PUBLIC_URL?.trim() || null;
  if (publicUrl) {
    let url;
    try {
      url = new URL(publicUrl);
    } catch {
      url = null;
    }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.search || url.hash)
      throw new ExportCacheError('EXPORT_CACHE_PUBLIC_URL must be an http(s) address.');
    publicUrl = publicUrl.replace(/\/+$/, '');
  }
  if (mode === 'disk') {
    if (!dir) throw new ExportCacheError('EXPORT_CACHE=disk needs EXPORT_CACHE_DIR.');
    return { mode, dir: resolve(dir), maxBytes, publicUrl };
  }
  const s3 = {
    endpoint: env.EXPORT_CACHE_S3_ENDPOINT?.trim().replace(/\/+$/, ''),
    region: env.EXPORT_CACHE_S3_REGION?.trim() || 'us-east-1',
    bucket: env.EXPORT_CACHE_S3_BUCKET?.trim(),
    prefix: env.EXPORT_CACHE_S3_PREFIX?.trim().replace(/^\/+/, '') ?? '',
    accessKeyId: env.EXPORT_CACHE_S3_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.EXPORT_CACHE_S3_SECRET_ACCESS_KEY?.trim(),
    pathStyle: env.EXPORT_CACHE_S3_PATH_STYLE?.trim() !== '0',
  };
  for (const [name, value] of [
    ['ENDPOINT', s3.endpoint],
    ['BUCKET', s3.bucket],
    ['ACCESS_KEY_ID', s3.accessKeyId],
    ['SECRET_ACCESS_KEY', s3.secretAccessKey],
  ])
    if (!value) throw new ExportCacheError(`EXPORT_CACHE=s3 needs EXPORT_CACHE_S3_${name}.`);
  let endpoint;
  try {
    endpoint = new URL(s3.endpoint);
  } catch {
    endpoint = null;
  }
  if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol))
    throw new ExportCacheError('EXPORT_CACHE_S3_ENDPOINT must be an http(s) address.');
  return {
    mode,
    dir: resolve(dir || join(tmpdir(), 'openchronology-exports')),
    maxBytes,
    publicUrl,
    s3,
  };
}

/** The cache the environment configures for `pool`, or null (off, or no database). */
export function exportCacheFromEnv({ pool, env = process.env } = {}) {
  if (!pool) return null;
  const settings = exportCacheSettings(env);
  if (!settings) return null;
  return new ExportCache({
    pool,
    backend: settings.mode === 's3' ? new S3Backend(settings.s3) : new DiskBackend(settings.dir),
    staging: join(settings.dir, '.staging'),
    maxBytes: settings.maxBytes,
    publicUrl: settings.publicUrl,
  });
}

/** Files in a directory: `<object>` is `<random hex>/<file name>`, a folder per entry. */
export class DiskBackend {
  constructor(dir) {
    this.dir = resolve(dir);
  }
  path(object) {
    return join(this.dir, ...object.split('/'));
  }
  /** Makes the directory, and refuses one the server cannot write. */
  async prepare() {
    await mkdir(this.dir, { recursive: true });
    await access(this.dir, constants.W_OK);
  }
  /** Moves the finished file `staged` into place (the staging folder is on the same disk). */
  async put(object, staged) {
    const target = this.path(object);
    await mkdir(dirname(target), { recursive: true });
    await rename(staged, target);
  }
  /** Bytes `start` to `end` (inclusive) of `object`, or null when it is missing. */
  async read(object, start, end) {
    const handle = await open(this.path(object), 'r').catch((error) =>
      error.code === 'ENOENT' ? null : Promise.reject(error),
    );
    return handle && handle.createReadStream({ start, end });
  }
  async remove(object) {
    await rm(dirname(this.path(object)), { recursive: true, force: true });
  }
  /** The entry folders in the directory, with their ages in milliseconds (for orphans). */
  async folders() {
    const now = Date.now(),
      found = [];
    for (const entry of await readdir(this.dir, { withFileTypes: true }).catch(() => []))
      if (entry.isDirectory() && /^[a-f0-9]{32}$/.test(entry.name)) {
        const info = await stat(join(this.dir, entry.name)).catch(() => null);
        if (info) found.push({ name: entry.name, age: now - info.mtimeMs });
      }
    return found;
  }
}

/** RFC 3986 encoding of one path segment, as S3 signs it. */
const segment = (text) =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * An AWS Signature Version 4 `Authorization` header for a request: `method`, the already
 * encoded `path`, its canonical `query` (empty for none), `headers` (lower-case names; `host`
 * and `x-amz-date` among them), the payload's SHA-256 (or UNSIGNED-PAYLOAD), and the
 * credentials, region and service. `date` is the x-amz-date value (YYYYMMDDTHHMMSSZ).
 */
export function signatureV4({
  method,
  path,
  query = '',
  headers,
  payloadHash,
  region,
  service = 's3',
  accessKeyId,
  secretAccessKey,
  date,
}) {
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const lower = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const canonical = [
    method,
    path,
    query,
    names.map((name) => `${name}:${String(lower[name]).trim().replace(/\s+/g, ' ')}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');
  const day = date.slice(0, 8),
    scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256(canonical)].join('\n');
  let key = hmac('AWS4' + secretAccessKey, day);
  for (const part of [region, service, 'aws4_request']) key = hmac(key, part);
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
}

/**
 * Objects in an S3-compatible bucket (AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces…),
 * signed with Signature Version 4. Uploads are a single PUT (up to 5 GiB), unsigned payload
 * over the connection's own integrity.
 */
export class S3Backend {
  constructor({
    endpoint,
    region,
    bucket,
    prefix = '',
    accessKeyId,
    secretAccessKey,
    pathStyle = true,
  }) {
    Object.assign(this, { region, bucket, prefix, accessKeyId, secretAccessKey, pathStyle });
    this.endpoint = new URL(endpoint);
  }
  /** The bucket key of `object` (under the prefix), as a path. */
  key(object) {
    return this.prefix + object;
  }
  /** The request's URL parts for `object`. */
  target(object) {
    const encoded = this.key(object).split('/').map(segment).join('/');
    const base = this.endpoint.pathname.replace(/\/+$/, '');
    return this.pathStyle
      ? { host: this.endpoint.host, path: `${base}/${segment(this.bucket)}/${encoded}` }
      : { host: `${this.bucket}.${this.endpoint.host}`, path: `${base}/${encoded}` };
  }
  async prepare() {}
  /** Sends a signed request; resolves with the response (its body unread). */
  send(method, object, { headers = {}, body = null } = {}) {
    const { host, path } = this.target(object);
    const date = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    const payloadHash = body ? 'UNSIGNED-PAYLOAD' : sha256('');
    const signed = { ...headers, host, 'x-amz-date': date, 'x-amz-content-sha256': payloadHash };
    signed.authorization = signatureV4({
      method,
      path,
      headers: signed,
      payloadHash,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      date,
    });
    const request = this.endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolveResponse, reject) => {
      const req = request(
        {
          method,
          host: this.endpoint.hostname,
          port: this.endpoint.port || undefined,
          path,
          headers: { ...signed, host },
          ...(this.pathStyle ? {} : { servername: host }),
        },
        resolveResponse,
      );
      req.on('error', reject);
      if (body) body.on('error', (error) => req.destroy(error)).pipe(req);
      else req.end();
    });
  }
  /** Reads a response's body as text (for error messages). */
  static async text(response) {
    let text = '';
    for await (const part of response) text += part;
    return text;
  }
  async put(object, staged, { contentType, disposition }) {
    const { size } = await stat(staged);
    const response = await this.send('PUT', object, {
      headers: {
        'content-length': String(size),
        'content-type': contentType,
        'content-disposition': disposition,
        // The object at a name never changes: one entry, one revision.
        'cache-control': 'public, max-age=31536000, immutable',
      },
      body: createReadStream(staged),
    });
    const text = await S3Backend.text(response);
    if (response.statusCode !== 200)
      throw new Error(`S3 upload failed (${response.statusCode}): ${text.slice(0, 300)}`);
    await rm(staged, { force: true });
  }
  async read(object, start, end) {
    const response = await this.send('GET', object, {
      headers: { range: `bytes=${start}-${end}` },
    });
    if (response.statusCode === 404) {
      response.resume();
      return null;
    }
    if (![200, 206].includes(response.statusCode)) {
      const text = await S3Backend.text(response);
      throw new Error(`S3 read failed (${response.statusCode}): ${text.slice(0, 300)}`);
    }
    return response;
  }
  async remove(object) {
    const response = await this.send('DELETE', object);
    const text = await S3Backend.text(response);
    if (![200, 204, 404].includes(response.statusCode))
      throw new Error(`S3 delete failed (${response.statusCode}): ${text.slice(0, 300)}`);
  }
}

/**
 * The byte range a `Range` header asks of a file of `size` bytes: `{ start, end }` (inclusive),
 * null for the whole file (no header, or one this does not serve, such as several ranges), or
 * false when it cannot be satisfied (416).
 */
export function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    // The last n bytes.
    const length = Number(match[2]);
    if (!length) return false;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return false;
  return { start, end };
}

/** The validator of the entry at `key`: its contents never change. */
const entityTag = (key) => `"${sha256(key).slice(0, 32)}"`;

/**
 * The cache: entries in oc_export_cache, files in `backend`. One entry per key (timeline,
 * version, format); `version` is `r<revision>` for the live timeline at that revision, or
 * `s<saved revision id>` for a saved revision.
 */
export class ExportCache {
  constructor({ pool, backend, staging, maxBytes = DEFAULT_CACHE_BYTES, publicUrl = null }) {
    Object.assign(this, { pool, backend, staging, maxBytes, publicUrl });
    // Builds under way in this process: key → promise of whether the entry was stored.
    this.building = new Map();
    // Background work (storing entries, eviction, sweeps), awaited by idle().
    this.pending = new Set();
    this.swept = 0;
    // Swept on a timer too, so a timeline made private with nobody downloading still loses
    // the files given out at the public address. It does not keep the process running.
    this.timer = setInterval(() => this.sweepSometimes(), SWEEP_EVERY);
    this.timer.unref?.();
  }
  /** Stops the sweeps' timer. */
  close() {
    clearInterval(this.timer);
  }
  /** Prepares the directories once; a cache that cannot is turned off, saying why. */
  ready() {
    this.preparing ??= (async () => {
      try {
        await this.backend.prepare();
        await mkdir(this.staging, { recursive: true });
        await access(this.staging, constants.W_OK);
        return true;
      } catch (error) {
        console.error('Cached downloads are off: the cache directory is unusable.', error);
        return false;
      }
    })();
    return this.preparing;
  }
  /** Runs `work` in the background, logging its failure; idle() waits for it. */
  background(work) {
    const task = work()
      .catch((error) => console.error('Cached downloads:', error))
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
    return task;
  }
  /** Resolves once background work started so far (and any it starts) has finished. */
  async idle() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
  /** The address of `object` under EXPORT_CACHE_PUBLIC_URL. */
  publicAddress(object) {
    const key = this.backend instanceof S3Backend ? this.backend.key(object) : object;
    return this.publicUrl + '/' + key.split('/').map(segment).join('/');
  }
  /**
   * Answers a download of timeline `timeline` (as access gives it to the requester) at
   * `version` in `format` (`ochx` or `och`), named `filename` (without its extension):
   * - from the cache when it is there, with Range and If-None-Match, or (`redirect`, for a
   *   public timeline, with EXPORT_CACHE_PUBLIC_URL) by redirecting to its public address;
   * - otherwise from `produce()`, `{ chunks, matches }`: the file a part at a time (text or
   *   bytes), sent as it is made and kept when `matches()` says, once it is complete, that it
   *   is the content of this key (a save landing mid-build makes it a newer revision's).
   * `check()`, when given, is asked before a stored entry is served (a saved revision since
   * forgotten is not). `stream(res, chunks, headers, status)` sends a body a part at a time.
   */
  async respond(
    req,
    res,
    { timeline, version, format, filename, redirect = false, check, produce, stream },
  ) {
    const key = `${timeline.id}:${version}:${format}`;
    const headers = {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${filename}.${format}"`,
      'Cache-Control': 'private, no-cache',
    };
    if (!(await this.ready())) return stream(res, (await produce()).chunks, headers);
    this.sweepSometimes();
    for (let attempt = 0; attempt < 2; attempt++) {
      const entry = (
        await this.pool.query(
          'SELECT object,bytes,published FROM oc_export_cache WHERE key=$1 AND bytes IS NOT NULL',
          [key],
        )
      ).rows[0];
      if (entry) {
        if (check && !(await check())) break;
        const served = await this.serve(req, res, key, entry, {
          headers,
          stream,
          redirect: redirect && this.publicUrl && isPublic(timeline),
        });
        if (served !== false) return served;
        // Its file went missing: forgotten, then made again below.
        await this.pool.query('DELETE FROM oc_export_cache WHERE key=$1 AND object=$2', [
          key,
          entry.object,
        ]);
        continue;
      }
      // Built in this process right now: waits for it, then serves what it stored.
      const underway = this.building.get(key);
      if (!underway) break;
      if (!(await underway)) break;
    }
    return this.build(res, key, timeline, format, filename, headers, produce, stream);
  }
  /** Serves a stored entry; false when its file is missing. */
  async serve(req, res, key, entry, { headers, stream, redirect }) {
    // Downloads mark entries recently used at most once a minute (the eviction order).
    await this.pool.query(
      "UPDATE oc_export_cache SET accessed_at=now() WHERE key=$1 AND accessed_at<now()-interval '1 minute'",
      [key],
    );
    if (redirect) {
      // Remembered, so the sweep removes it if the timeline stops being public.
      if (!entry.published)
        await this.pool.query('UPDATE oc_export_cache SET published=true WHERE key=$1', [key]);
      res.writeHead(302, {
        Location: this.publicAddress(entry.object),
        'Cache-Control': 'no-store',
      });
      res.end();
      return true;
    }
    const size = Number(entry.bytes),
      tag = entityTag(key);
    const validators = { ...headers, ETag: tag, 'Accept-Ranges': 'bytes' };
    if (req.headers['if-none-match']?.split(',').some((t) => t.trim() === tag)) {
      res.writeHead(304, validators);
      res.end();
      return true;
    }
    // A Range is honoured unless If-Range names another version.
    const ifRange = req.headers['if-range'];
    let range = !ifRange || ifRange === tag ? byteRange(req.headers.range, size) : null;
    if (range === false) {
      res.writeHead(416, { ...validators, 'Content-Range': `bytes */${size}` });
      res.end();
      return true;
    }
    range ??= { start: 0, end: size - 1 };
    if (!size) {
      // An empty file has no byte to read.
      res.writeHead(200, { ...validators, 'Content-Length': '0' });
      res.end();
      return true;
    }
    const body = await this.backend.read(entry.object, range.start, range.end);
    if (!body) return false;
    const partial = range.start > 0 || range.end < size - 1;
    return stream(
      res,
      chunksOf(body),
      {
        ...validators,
        'Content-Length': String(range.end - range.start + 1),
        ...(partial ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
      },
      partial ? 206 : 200,
    );
  }
  /**
   * Makes the file with `produce`, sending it as it is made and, when this request claimed
   * the build (one at a time per key, across servers), storing it. A request that finds
   * another server building the key sends its own copy without storing it.
   */
  async build(res, key, timeline, format, filename, headers, produce, stream) {
    return stream(
      res,
      this.tee(key, timeline, format, filename, headers, await produce()),
      headers,
    );
  }
  /**
   * `produced.chunks`, passed on and written to a staged file, which is stored once it is
   * complete. Claims the build when it starts (so a body never read claims nothing).
   */
  async *tee(key, timeline, format, filename, headers, { chunks, matches }) {
    const object = randomBytes(16).toString('hex') + '/' + filename + '.' + format;
    // The claim: a new row without bytes, or one whose build was abandoned.
    const claimed = (
      await this.pool.query(
        `INSERT INTO oc_export_cache(key,timeline_id,object,format) VALUES($1,$2,$3,$4)
        ON CONFLICT (key) DO UPDATE SET object=EXCLUDED.object,created_at=now()
        WHERE oc_export_cache.bytes IS NULL AND oc_export_cache.created_at<now()-${STALE_BUILD}
        RETURNING key`,
        [key, timeline.id, object, format],
      )
    ).rowCount;
    if (!claimed) {
      yield* chunks;
      return;
    }
    let settle;
    this.building.set(key, new Promise((resolveBuild) => (settle = resolveBuild)));
    const staged = join(this.staging, randomBytes(16).toString('hex'));
    const out = createWriteStream(staged, { mode: 0o600 });
    let bytes = 0,
      usable = true,
      complete = false;
    // The staged file is closed (after end(), or an error).
    const finished = once(out, 'close').catch(() => {});
    out.on('error', (error) => {
      // A full disk, say: the download goes on; the entry is not kept.
      if (usable) console.error('Cached downloads: writing an entry failed:', error);
      usable = false;
    });
    try {
      for await (const part of chunks) {
        const buffer = typeof part === 'string' ? Buffer.from(part) : part;
        bytes += buffer.length;
        // Larger than the whole cache: not kept.
        if (bytes > this.maxBytes) usable = false;
        if (usable && !out.write(buffer))
          await Promise.race([once(out, 'drain').catch(() => {}), finished]);
        yield part;
      }
      complete = true;
    } finally {
      const keep = complete && usable && matches();
      out.end();
      // Stored in the background: the download ends without waiting for an upload.
      this.background(async () => {
        await finished;
        let stored = false;
        try {
          if (keep && usable) {
            await this.backend.put(object, staged, {
              contentType: CONTENT_TYPES[format],
              disposition: headers['Content-Disposition'],
            });
            stored =
              (
                await this.pool.query(
                  'UPDATE oc_export_cache SET bytes=$3,accessed_at=now() WHERE key=$1 AND object=$2',
                  [key, object, bytes],
                )
              ).rowCount === 1;
            if (!stored) await this.backend.remove(object);
          }
        } finally {
          await rm(staged, { force: true });
          if (!stored) await this.release(key, object);
          this.building.delete(key);
          settle(stored);
        }
        if (stored) await this.evict();
      });
    }
  }
  /** Gives up the claim on `key` (made with `object`) after a build that kept nothing. */
  async release(key, object) {
    await this.pool.query(
      'DELETE FROM oc_export_cache WHERE key=$1 AND object=$2 AND bytes IS NULL',
      [key, object],
    );
  }
  /** Removes `rows`' files (`object` each), logging failures. */
  async removeFiles(rows) {
    await Promise.all(
      rows.map((row) =>
        this.backend
          .remove(row.object)
          .catch((error) => console.error('Cached downloads: removing a file failed:', error)),
      ),
    );
  }
  /**
   * Keeps the stored entries within the limit: past it, the least recently downloaded go
   * (the newest are kept while their sizes add up to at most maxBytes).
   */
  async evict() {
    const { rows } = await this.pool.query(
      `DELETE FROM oc_export_cache e USING (
        SELECT key FROM (
          SELECT key,sum(bytes) OVER (ORDER BY accessed_at DESC,key DESC) AS kept
          FROM oc_export_cache WHERE bytes IS NOT NULL
        ) x WHERE kept>$1
      ) old WHERE e.key=old.key RETURNING e.object`,
      [this.maxBytes],
    );
    await this.removeFiles(rows);
    return rows.length;
  }
  /**
   * Forgets timeline `timelineId`'s entries (all, or with `published` only those handed out
   * at their public address), removing their files.
   */
  async forget(timelineId, { published = false } = {}) {
    const { rows } = await this.pool.query(
      `DELETE FROM oc_export_cache WHERE timeline_id=$1 ${published ? 'AND published' : ''} RETURNING object`,
      [timelineId],
    );
    await this.removeFiles(rows);
  }
  /**
   * Removes entries of timelines that are gone, entries given out at a public address whose
   * timeline is no longer public (made private, or restricted by moderators), builds long
   * abandoned, and, on disk, folders no entry names (left by a removal that failed).
   */
  async sweep() {
    const { rows } = await this.pool.query(
      `DELETE FROM oc_export_cache e WHERE
      NOT EXISTS(SELECT 1 FROM oc_timelines t WHERE t.id=e.timeline_id)
      OR (e.published AND NOT EXISTS(SELECT 1 FROM oc_timelines t WHERE t.id=e.timeline_id
        AND t.visibility='public' AND NOT ${restrictedTimeline('t')}))
      OR (e.bytes IS NULL AND e.created_at<now()-${STALE_BUILD})
      RETURNING e.object`,
    );
    await this.removeFiles(rows);
    if (this.backend.folders) {
      const known = new Set(
        (
          await this.pool.query('SELECT split_part(object,$1,1) AS folder FROM oc_export_cache', [
            '/',
          ])
        ).rows.map((r) => r.folder),
      );
      // Folders older than a build may take, so one being filled is never one of them.
      for (const folder of await this.backend.folders())
        if (!known.has(folder.name) && folder.age > 60 * 60 * 1000)
          await rm(join(this.backend.dir, folder.name), { recursive: true, force: true });
    }
    return rows.length;
  }
  /**
   * Sweeps in the background at the first download, then at most every SWEEP_EVERY (on the
   * timer, or a download after it).
   */
  sweepSometimes() {
    if (Date.now() - this.swept < SWEEP_EVERY - 1000) return;
    this.swept = Date.now();
    this.background(() => this.sweep());
  }
}

/** Whether anyone may download `timeline` (public, and not restricted by moderators). */
const isPublic = (timeline) => timeline.visibility === 'public' && !timeline.moderation;

/** A readable stream's parts, as an async generator (closing the stream when stopped). */
async function* chunksOf(readable) {
  try {
    for await (const part of readable) yield part;
  } finally {
    readable.destroy();
  }
}
