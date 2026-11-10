// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * A JSON client for the board sources' APIs (Trello, Jira, Microsoft Graph, OpenProject):
 * sends its credentials only to its own origin, waits out rate limits that clear within 15
 * minutes (429 with Retry-After), and counts its requests.
 */
import { USER_AGENT } from './github-source.mjs';

const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));
const MAX_WAIT = 15 * 60 * 1000;

export class BoardReader {
  /**
   * @param {object} options `api` (an https origin and path), `headers` (the credentials and
   *   anything else every request carries), `fetcher` and `log`
   */
  constructor({ api, headers = {}, fetcher = fetch, log = console, sleeper = sleep }) {
    if (!/^https:\/\//.test(api ?? '') && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api ?? ''))
      throw new Error(`The API must be an https origin: ${api}`);
    this.api = api.replace(/\/+$/, '');
    this.origin = new URL(this.api).origin;
    this.headers = headers;
    this.fetcher = fetcher;
    this.log = log;
    this.sleep = sleeper;
    this.requests = 0;
  }
  /** The URL of `path` (relative to the API, or absolute on its origin), with `query`. */
  url(path, query = {}) {
    // A path from the site's root that names the API's own (OpenProject's links do) is kept.
    const base = new URL(this.api).pathname;
    const url = new URL(
      /^https?:/.test(path)
        ? path
        : path.startsWith(base + '/')
          ? this.origin + path
          : this.api + path,
    );
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    return url;
  }
  /** GETs (or `method`s) JSON; a status other than 2xx throws with `status`. */
  async json(path, { query, method = 'GET', body, headers = {} } = {}) {
    const url = this.url(path, query);
    const own = url.origin === this.origin;
    for (;;) {
      this.requests++;
      const response = await this.fetcher(url, {
        method,
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...(own ? this.headers : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
      });
      if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after')) * 1000 || 60000;
        if (wait > MAX_WAIT)
          throw Object.assign(new Error(`rate limited for ${Math.ceil(wait / 60000)} minutes`), {
            status: 429,
          });
        this.log.error?.(`Rate limited; waiting ${Math.ceil(wait / 1000)} s.`);
        await this.sleep(wait);
        continue;
      }
      const text = await response.text();
      if (!response.ok)
        throw Object.assign(
          new Error(`${method} ${url.pathname}: ${response.status} ${text.slice(0, 200)}`),
          { status: response.status },
        );
      return text ? JSON.parse(text) : null;
    }
  }
}
