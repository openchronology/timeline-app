// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Account security primitives: encrypting secrets at rest (seal and unseal with
// AUTH_ENCRYPTION_KEY), authenticator codes (TOTP), recovery codes, email and new-password
// checks, and the Have I Been Pwned breach lookup.
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { HttpError } from './store.mjs';
/**
 * The hex SHA-256 of `value`. One-use secrets (email links, sign-in challenges, browser proofs,
 * recovery codes) are stored only as this digest, so a leaked database row cannot be replayed:
 * the secrets are 128 or 256 random bits, which makes a fast unsalted hash sufficient (unlike
 * passwords, which use scrypt in auth.mjs).
 */
export const digest = (value) => createHash('sha256').update(value).digest('hex');
/**
 * Parses AUTH_ENCRYPTION_KEY (`value`) into the 32-byte AES-256 key, or null when unset (email
 * and two-factor authentication are then unavailable; see AccountSecurity.available). Throws at
 * start-up on a malformed key rather than encrypting with a weak one.
 */
export function encryptionKey(value) {
  if (!value) return null;
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error('AUTH_ENCRYPTION_KEY must contain 32 random bytes as 64 hex characters.');
  return Buffer.from(value, 'hex');
}
/**
 * Encrypts the string `value` with AES-256-GCM under `key` for storage in the database (an
 * authenticator secret, a queued email). `context` is bound as additional authenticated data,
 * for example `mfa:<user id>` or `mail:<outbox id>`, so a ciphertext copied into another row or
 * account fails to decrypt instead of being accepted there. A fresh random 96-bit IV is used for
 * every call, as GCM requires. Result: `iv.tag.ciphertext`, each part base64url. Throws 503 when
 * no key is configured.
 */
export function seal(value, key, context) {
  if (!key) throw new HttpError(503, 'Account security is not configured.');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((b) => b.toString('base64url')).join('.');
}
/**
 * Decrypts a `seal` result with the same `key` and `context`. `final()` checks the GCM tag and
 * throws if the ciphertext, IV or context was altered (or the key changed), so tampered data is
 * never returned. Throws 503 when no key is configured.
 */
export function unseal(value, key, context) {
  if (!key) throw new HttpError(503, 'Account security is not configured.');
  const [iv, tag, bytes] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8');
}
/** The RFC 4648 base32 alphabet that authenticator apps expect secrets in. */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/**
 * Encodes `bytes` as unpadded base32: bits are accumulated eight at a time and emitted five at a
 * time; leftover bits are zero-padded into a last character.
 */
export function base32(bytes) {
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
/** Decodes an unpadded base32 secret back to bytes; throws on a character outside the alphabet. */
function decode32(secret) {
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const char of secret) {
    const n = alphabet.indexOf(char);
    if (n < 0) throw new Error('Invalid authenticator secret.');
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}
/** A new authenticator secret: 160 random bits (the RFC 4226 recommended length) in base32. */
export const newSecret = () => base32(randomBytes(20));
/**
 * The TOTP code (RFC 6238) for base32 `secret` at time step `step`: an HMAC of the big-endian
 * 64-bit step, truncated dynamically as RFC 4226 describes (the low nibble of the last byte
 * picks four bytes, the top bit is cleared) and reduced to `digits` decimal digits.
 */
export function totp(secret, step, digits = 6, algorithm = 'sha1') {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac(algorithm, decode32(secret)).update(counter).digest(),
    offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
/**
 * The 30-second time step a six-digit `code` matches for `secret`, or null. The current step and
 * one step either side are tried, tolerating a small clock difference. Steps at or before `last`
 * (the user's most recently accepted step, oc_users.mfa_last_step) are refused, so a code cannot
 * be used twice, nor an older code after a newer one. The comparison is constant-time so response
 * timing does not reveal how many leading digits were right.
 */
export function matchingStep(secret, code, last = -1, time = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const now = Math.floor(time / 30000);
  for (const step of [now, now - 1, now + 1])
    if (step > last && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code)))
      return step;
  return null;
}
/**
 * Normalizes an email address: trimmed and lower-cased (accounts compare emails by lower(email),
 * and the unique index oc_users_email is on lower(email)). Accepts a conservative form: a dotted
 * domain with a 2–63 letter top-level label, no consecutive dots, at most 254 characters. Throws
 * 400 otherwise.
 */
export function emailAddress(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Enter a valid email address.');
  const value = raw.trim().toLowerCase();
  if (
    value.length > 254 ||
    !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
      value,
    ) ||
    value.includes('..')
  )
    throw new HttpError(400, 'Enter a valid email address.');
  return value;
}
/**
 * Checks a new password (registration, change, reset) and returns it. Following NIST SP 800-63B
 * and OWASP: a length of 15–1024 (the minimum counted in code points, so non-Latin passphrases
 * are measured fairly), the confirmation must match, and no composition rules. A short list of
 * predictable phrases, and the username or site name repeated to the minimum length, are
 * refused. The breach check (checkPasswordBreach) is separate because it makes a network call.
 * Existing shorter passwords still sign in; this applies only to new ones. Throws 400.
 */
export function newPassword(password, confirmation, username = '') {
  if (typeof password !== 'string' || [...password].length < 15 || password.length > 1024)
    throw new HttpError(400, 'Use a password or passphrase of 15–1024 characters.');
  if (password !== confirmation) throw new HttpError(400, 'Passwords must match.');
  const blocked = new Set([
    'passwordpassword',
    'password123456789',
    '123456789012345',
    'qwertyuiopasdfgh',
    'letmeinletmeinletmein',
    'correct horse battery staple',
  ]);
  if (
    blocked.has(password.toLowerCase()) ||
    [username, 'openchronology', 'timescale.info']
      .filter(Boolean)
      .some((s) => password.toLowerCase() === s.repeat(Math.ceil(15 / s.length)))
  )
    throw new HttpError(400, 'Choose a less predictable password.');
  return password;
}
/**
 * Ten new recovery codes, each 128 random bits shown as four dash-separated groups of eight hex
 * digits. They are shown once and stored only as recoveryHash digests (oc_recovery_codes).
 */
export const recoveryCodes = () =>
  Array.from({ length: 10 }, () => randomBytes(16).toString('hex').match(/.{8}/g).join('-'));
/**
 * The stored digest of a recovery code as typed (case-insensitive), or null when `code` is not
 * shaped like one, so an authenticator code or garbage never reaches the database lookup.
 */
export function recoveryHash(code) {
  if (typeof code !== 'string' || !/^(?:[a-f0-9]{8}-){3}[a-f0-9]{8}$/i.test(code)) return null;
  return digest(code.toLowerCase());
}

// SHA-1 is used only for HIBP's k-anonymous lookup; stored passwords use scrypt.
/**
 * Refuses (400) a new password that appears in Have I Been Pwned's breach corpus. Only the first
 * five hex characters of its SHA-1 leave the server (k-anonymity); the range API answers with
 * every suffix sharing that prefix, and `Add-Padding` asks it to pad the answer with zero-count
 * entries so its size does not hint at the prefix. The answer is read with a 1 MiB cap and a
 * five-second timeout, and must look like HIBP's format. Fails closed: when the check cannot
 * complete it throws 503, so an unchecked password is never accepted. Only new passwords are
 * checked; sign-in never calls this.
 */
export async function checkPasswordBreach(password, fetcher = fetch) {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  let response;
  try {
    response = await fetcher('https://api.pwnedpasswords.com/range/' + hash.slice(0, 5), {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { 'Add-Padding': 'true', 'User-Agent': 'OpenChronology' },
    });
    if (!response.ok || !response.body) throw new Error();
    // Read the body in chunks so an oversized or endless response is cut off at 1 MiB.
    const reader = response.body.getReader(),
      parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new Error();
      }
      parts.push(Buffer.from(value));
    }
    const text = Buffer.concat(parts).toString('utf8');
    // At least one `SUFFIX:COUNT` line, or the answer is not HIBP's and the check fails.
    if (!/^[A-F0-9]{35}:\d+(?:\r?\n|$)/m.test(text)) throw new Error();
    // A matching suffix with a count of zero is padding, not a breach.
    if (
      text
        .split(/\r?\n/)
        .some((line) => line.split(':')[0] === hash.slice(5) && Number(line.split(':')[1]) > 0)
    )
      throw new HttpError(
        400,
        'This password has appeared in a breach. Choose another passphrase.',
      );
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, 'Password safety checking is unavailable. Try again shortly.');
  }
}
