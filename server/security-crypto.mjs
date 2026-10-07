// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { HttpError } from './store.mjs';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function encryptionKey(value) {
  if (!value) return null;
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error('AUTH_ENCRYPTION_KEY must contain 32 random bytes as 64 hex characters.');
  return Buffer.from(value, 'hex');
}
export function seal(value, key, context) {
  if (!key) throw new HttpError(503, 'Account security is not configured.');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((b) => b.toString('base64url')).join('.');
}
export function unseal(value, key, context) {
  if (!key) throw new HttpError(503, 'Account security is not configured.');
  const [iv, tag, bytes] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
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
export const newSecret = () => base32(randomBytes(20));
export function totp(secret, step, digits = 6, algorithm = 'sha1') {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac(algorithm, decode32(secret)).update(counter).digest(),
    offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function matchingStep(secret, code, last = -1, time = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const now = Math.floor(time / 30000);
  for (const step of [now, now - 1, now + 1])
    if (step > last && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code)))
      return step;
  return null;
}
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
export const recoveryCodes = () =>
  Array.from({ length: 10 }, () => randomBytes(16).toString('hex').match(/.{8}/g).join('-'));
export function recoveryHash(code) {
  if (typeof code !== 'string' || !/^(?:[a-f0-9]{8}-){3}[a-f0-9]{8}$/i.test(code)) return null;
  return digest(code.toLowerCase());
}

// SHA-1 is used only for HIBP's k-anonymous lookup; stored passwords use scrypt.
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
    if (!/^[A-F0-9]{35}:\d+(?:\r?\n|$)/m.test(text)) throw new Error();
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
