// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signing in with a directory account (LDAP or Active Directory, #286): the server looks the
// person up with its own service account, then binds as them with the password they typed. A
// directory account becomes the provider identity `ldap`, held and linked as social sign-ins are.
import { readFileSync } from 'node:fs';
import { Client } from 'ldapts';
import { HttpError } from './store.mjs';
import { availableUsername } from '../dist/core.mjs';

/** The same answer for an unknown account, a wrong password and one outside the group. */
const REFUSED = 'Username or password is incorrect.';
/** Active Directory's account names; OpenLDAP and others use LDAP_USER_FILTER=(uid={username}). */
export const DEFAULT_FILTER = '(&(objectClass=user)(sAMAccountName={username}))';
/** AD's matching rule that follows nested groups (LDAP_NESTED_GROUPS=1). */
const IN_CHAIN = '1.2.840.113556.1.4.1941';

/**
 * `value` escaped for an LDAP search filter (RFC 4515 §3): `\`, `*`, `(`, `)` and NUL as `\XX`,
 * so a typed username or a configured group DN can only ever be a value, never a filter.
 */
export function escapeFilter(value) {
  return String(value).replace(
    /[\\*()\0]/g,
    (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'),
  );
}

/**
 * The directory settings from `env`, or null when LDAP_URL is unset (directory sign-in off).
 * Throws at start-up on a setting that would fail or be unsafe later: a URL that is not
 * ldap:// or ldaps://, a plain ldap:// connection without LDAP_STARTTLS=1 (passwords would
 * cross the network in clear) unless LDAP_ALLOW_INSECURE=1, no LDAP_BASE_DN, half a service
 * account, a filter without `{username}`, or an unreadable LDAP_TLS_CA.
 */
export function directoryFromEnv(env = process.env) {
  if (!env.LDAP_URL) return null;
  let url;
  try {
    url = new URL(env.LDAP_URL);
  } catch {
    throw new Error('LDAP_URL must be an ldap:// or ldaps:// address.');
  }
  if (!['ldap:', 'ldaps:'].includes(url.protocol) || (url.pathname && url.pathname !== '/'))
    throw new Error('LDAP_URL must be an ldap:// or ldaps:// address, without a path.');
  const startTls = env.LDAP_STARTTLS === '1';
  if (url.protocol === 'ldaps:' && startTls)
    throw new Error('LDAP_STARTTLS is for ldap:// addresses; ldaps:// is already encrypted.');
  if (url.protocol === 'ldap:' && !startTls && env.LDAP_ALLOW_INSECURE !== '1')
    throw new Error(
      'Use ldaps://, or LDAP_STARTTLS=1, so passwords are encrypted on their way to the directory (LDAP_ALLOW_INSECURE=1 allows plain LDAP on a trusted network).',
    );
  if (!env.LDAP_BASE_DN) throw new Error('Set LDAP_BASE_DN, where to look for accounts.');
  if (!!env.LDAP_BIND_DN !== !!env.LDAP_BIND_PASSWORD)
    throw new Error('Configure both LDAP_BIND_DN and LDAP_BIND_PASSWORD, or neither.');
  const filter = env.LDAP_USER_FILTER || DEFAULT_FILTER;
  if (!filter.includes('{username}') || !/^\(.*\)$/.test(filter))
    throw new Error('LDAP_USER_FILTER must be a filter in parentheses containing {username}.');
  let ca;
  if (env.LDAP_TLS_CA)
    try {
      ca = readFileSync(env.LDAP_TLS_CA);
    } catch {
      throw new Error(`LDAP_TLS_CA: cannot read ${env.LDAP_TLS_CA}.`);
    }
  const label = (env.LDAP_LABEL || 'Directory account').trim().slice(0, 40);
  return {
    url: `${url.protocol}//${url.host}`,
    startTls,
    bindDn: env.LDAP_BIND_DN || null,
    bindPassword: env.LDAP_BIND_PASSWORD || null,
    baseDn: env.LDAP_BASE_DN,
    filter,
    group: env.LDAP_REQUIRED_GROUP || null,
    nestedGroups: env.LDAP_NESTED_GROUPS === '1',
    usernameAttribute: env.LDAP_USERNAME_ATTRIBUTE || 'sAMAccountName',
    label,
    tls: { minVersion: 'TLSv1.2', ...(ca ? { ca } : {}) },
  };
}

/**
 * The search filter for `username` under `config`: the configured filter with the escaped
 * name, and, with LDAP_REQUIRED_GROUP, membership of that group (memberOf; through nested
 * groups with LDAP_NESTED_GROUPS=1 on Active Directory).
 */
export function userFilter(config, username) {
  const person = config.filter.replaceAll('{username}', escapeFilter(username));
  if (!config.group) return person;
  const rule = config.nestedGroups ? `memberOf:${IN_CHAIN}:` : 'memberOf';
  return `(&${person}(${rule}=${escapeFilter(config.group)}))`;
}

/**
 * The stable identity of a directory entry: Active Directory's objectGUID (as its usual
 * braces-free text form), else the standard entryUUID (OpenLDAP, 389, FreeIPA), else the
 * lowercased DN, which changes if the account is moved or renamed.
 */
export function subjectOf(entry) {
  const guid = entry.objectGUID;
  if (Buffer.isBuffer(guid) && guid.length === 16) {
    // The first three fields are little-endian, as Windows writes GUIDs.
    const h = guid.toString('hex');
    const swap = (s) => s.match(/../g).reverse().join('');
    return `guid:${swap(h.slice(0, 8))}-${swap(h.slice(8, 12))}-${swap(h.slice(12, 16))}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const uuid = Array.isArray(entry.entryUUID) ? entry.entryUUID[0] : entry.entryUUID;
  if (typeof uuid === 'string' && /^[0-9a-f-]{36}$/i.test(uuid))
    return 'uuid:' + uuid.toLowerCase();
  return 'dn:' + String(entry.dn).toLowerCase();
}

/**
 * A username for a new account from the directory's name for it, when that is a valid,
 * available OpenChronology username (lowercased; dots and spaces become hyphens); else null,
 * and the account gets a generated one.
 */
export function preferredUsername(name) {
  if (typeof name !== 'string') return null;
  const candidate = name
    .trim()
    .toLowerCase()
    .replace(/@.*$/, '')
    .replace(/[.\s]+/g, '-');
  return availableUsername(candidate) ? candidate : null;
}

/**
 * Directory sign-in. `auth` is the Auth instance, `oauth` the OAuth instance whose `identity`
 * finds or creates the account for a provider identity; `config` comes from directoryFromEnv;
 * `connect` makes an ldapts Client (injectable for tests).
 */
export class Directory {
  constructor(auth, oauth, config, connect = (options) => new Client(options)) {
    this.auth = auth;
    this.oauth = oauth;
    this.config = config;
    this.connect = connect;
  }
  /** What the sign-in page names it ("School account"), for GET /api/session. */
  get label() {
    return this.config.label;
  }
  /**
   * A connected client, upgraded to TLS when LDAP_STARTTLS=1. TLS options go to the client only
   * for ldaps://: ldapts takes any as a request to connect with TLS from the start.
   */
  async client() {
    const client = this.connect({
      url: this.config.url,
      timeout: 10000,
      connectTimeout: 10000,
      ...(this.config.url.startsWith('ldaps:') ? { tlsOptions: this.config.tls } : {}),
    });
    if (this.config.startTls) await client.startTLS(this.config.tls);
    return client;
  }
  /**
   * Checks `username` and `password` against the directory: one entry must match the filter
   * (none, or several, is refused), then a bind as that entry's DN with the password must
   * succeed. An empty password is refused before anything is sent, since many directories treat
   * a simple bind without one as an anonymous bind that "succeeds". Result: `{subject,
   * username}`. Throws 401 (the same message whatever was wrong) or 502 when the directory
   * cannot be reached; the password is never logged or kept.
   */
  async authenticate(username, password) {
    if (typeof password !== 'string' || !password.length) throw new HttpError(401, REFUSED);
    let entry;
    const search = await this.client().catch(() => {
      throw new HttpError(502, 'The directory is unavailable. Try again later.');
    });
    try {
      if (this.config.bindDn) await search.bind(this.config.bindDn, this.config.bindPassword);
      const { searchEntries } = await search.search(this.config.baseDn, {
        scope: 'sub',
        filter: userFilter(this.config, username),
        attributes: ['objectGUID', 'entryUUID', this.config.usernameAttribute],
        explicitBufferAttributes: ['objectGUID'],
        sizeLimit: 2,
        timeLimit: 10,
      });
      if (searchEntries.length !== 1) throw new HttpError(401, REFUSED);
      entry = searchEntries[0];
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // More than one match is ambiguous: refused like no match.
      if (error?.name === 'SizeLimitExceededError') throw new HttpError(401, REFUSED);
      console.error('Directory search failed:', error?.message ?? error);
      throw new HttpError(502, 'The directory is unavailable. Try again later.');
    } finally {
      await search.unbind().catch(() => {});
    }
    const check = await this.client().catch(() => {
      throw new HttpError(502, 'The directory is unavailable. Try again later.');
    });
    try {
      await check.bind(entry.dn, password);
    } catch (error) {
      if (error?.name === 'InvalidCredentialsError') throw new HttpError(401, REFUSED);
      console.error('Directory sign-in failed:', error?.name ?? error);
      throw new HttpError(401, REFUSED);
    } finally {
      await check.unbind().catch(() => {});
    }
    const named = entry[this.config.usernameAttribute];
    return { subject: subjectOf(entry), username: Array.isArray(named) ? named[0] : named };
  }
  /**
   * `input.username` as a directory name: 1–256 characters, none of them control characters
   * (they are escaped in the filter anyway). Throws 400.
   */
  static username(input) {
    const name = typeof input?.username === 'string' ? input.username.trim() : '';
    // eslint-disable-next-line no-control-regex
    if (!name || name.length > 256 || /[\u0000-\u001f\u007f]/.test(name))
      throw new HttpError(400, 'Enter your directory username and password.');
    if (typeof input.password !== 'string' || input.password.length > 1024)
      throw new HttpError(400, 'Enter your directory username and password.');
    return name;
  }
  /**
   * Signs in with a directory account: rate-limited per address as password sign-in is (with
   * no hard limit per directory name, which would let anyone lock its owner out; repeated
   * failures for a name ask for human verification instead, in the caller), then the account
   * holding that directory identity (a new one, named
   * after the directory account when that name is free, for a first sign-in) goes through the
   * same next steps as any sign-in (finishPrimary: two-factor authentication, or giving and
   * confirming an email address and year of birth for a new account).
   */
  async signIn(req, input, kind = 'web') {
    await this.auth.rateLimit(req.clientAddress ?? 'unknown');
    const name = Directory.username(input);
    const found = await this.authenticate(name, input.password);
    const user = await this.oauth.identity(
      'ldap',
      found.subject,
      null,
      preferredUsername(found.username ?? name),
    );
    return this.auth.finishPrimary(user, kind, req);
  }
  /**
   * Links a directory account to the signed-in account `session`, which must have signed in
   * within five minutes (as linking a social sign-in must). Refused with 409 when the directory
   * account belongs to another account. Rate-limited per signed-in account and per address,
   * not per directory name, so linking attempts cannot hold up that name's own sign-ins.
   */
  async link(req, input, session) {
    this.auth.require(session, req);
    const started = new Date(session.created_at).getTime();
    if (!Number.isFinite(started) || Date.now() - started > 5 * 60000)
      throw new HttpError(403, 'Sign in again before linking a directory account.');
    const name = Directory.username(input);
    await this.auth.rateLimit(req.clientAddress ?? 'unknown');
    await this.auth.rateLimit('ldap-link:' + session.id);
    const found = await this.authenticate(name, input.password);
    await this.oauth.identity('ldap', found.subject, session.id);
    return { ok: true };
  }
}
