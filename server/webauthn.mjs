// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Verifying passkeys (WebAuthn Level 2, https://www.w3.org/TR/webauthn-2/) with node:crypto
// alone (docs/authentication.md, "Passkeys"): the CBOR of an attestation object and of a COSE
// public key, the authenticator data, the client data, and the signature of an assertion.
// Attestation is not requested ('none') and not checked: any authenticator the browser accepts
// may be registered. passkeys.mjs keeps the challenges and the stored credentials.
import { createHash, createPublicKey, verify, timingSafeEqual } from 'node:crypto';
import { HttpError } from './store.mjs';

/** A failed check, as the 401 the routes answer with; `reason` says which check, for tests. */
export class PasskeyError extends HttpError {
  constructor(reason, message = 'The passkey could not be verified.') {
    super(401, message);
    this.reason = reason;
  }
}

/** The COSE algorithms accepted, most preferred first: EdDSA, ES256 and RS256. */
export const ALGORITHMS = [-8, -7, -257];

/** Authenticator data flags (WebAuthn §6.1). */
const UP = 0x01,
  UV = 0x04,
  BE = 0x08,
  BS = 0x10,
  AT = 0x40,
  ED = 0x80;

/** `value` (a base64url string) as bytes; a 401 for anything else or anything too long. */
export function fromBase64url(value, limit = 65536) {
  if (typeof value !== 'string' || value.length > limit || !/^[A-Za-z0-9_-]*$/.test(value))
    throw new PasskeyError('encoding', 'The passkey answer is malformed.');
  return Buffer.from(value, 'base64url');
}

/**
 * Decodes one CBOR item (RFC 8949) from `bytes` at `offset`: unsigned and negative integers,
 * byte and text strings, arrays, maps (as Map, keys kept as they are), and false, true and
 * null. Indefinite lengths, tags, floats and integers beyond 2^53 are refused: authenticators
 * use CTAP2's canonical CBOR, which has none of them in what is read here. Nesting is limited.
 * @returns {[unknown, number]} the item and the offset just after it
 */
export function decodeCbor(bytes, offset = 0, depth = 0) {
  const fail = () => {
    throw new PasskeyError('cbor', 'The passkey answer is malformed.');
  };
  if (depth > 16 || offset >= bytes.length) fail();
  const initial = bytes[offset++],
    major = initial >> 5,
    info = initial & 0x1f;
  let length;
  if (info < 24) length = info;
  else if (info === 24 && offset + 1 <= bytes.length) length = bytes[offset++];
  else if (info === 25 && offset + 2 <= bytes.length) {
    length = bytes.readUInt16BE(offset);
    offset += 2;
  } else if (info === 26 && offset + 4 <= bytes.length) {
    length = bytes.readUInt32BE(offset);
    offset += 4;
  } else if (info === 27 && offset + 8 <= bytes.length) {
    const big = bytes.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) fail();
    length = Number(big);
    offset += 8;
  } else fail();
  switch (major) {
    case 0:
      return [length, offset];
    case 1:
      return [-1 - length, offset];
    case 2:
    case 3: {
      if (offset + length > bytes.length) fail();
      const slice = bytes.subarray(offset, offset + length);
      return [major === 2 ? Buffer.from(slice) : slice.toString('utf8'), offset + length];
    }
    case 4: {
      const items = [];
      for (let i = 0; i < length; i++) {
        let item;
        [item, offset] = decodeCbor(bytes, offset, depth + 1);
        items.push(item);
      }
      return [items, offset];
    }
    case 5: {
      const map = new Map();
      for (let i = 0; i < length; i++) {
        let key, value;
        [key, offset] = decodeCbor(bytes, offset, depth + 1);
        [value, offset] = decodeCbor(bytes, offset, depth + 1);
        if (map.has(key)) fail();
        map.set(key, value);
      }
      return [map, offset];
    }
    case 7:
      if (info === 20) return [false, offset];
      if (info === 21) return [true, offset];
      if (info === 22) return [null, offset];
      return fail();
    default:
      return fail();
  }
}

/** The single CBOR item that is all of `bytes`. */
function cborWhole(bytes) {
  const [value, end] = decodeCbor(bytes);
  if (end !== bytes.length) throw new PasskeyError('cbor', 'The passkey answer is malformed.');
  return value;
}

/**
 * A COSE_Key (RFC 9053) as `{ algorithm, key }`, `key` being a node:crypto public KeyObject:
 * EdDSA over Ed25519 (alg -8), ECDSA P-256 with SHA-256 (ES256, -7) or RSASSA-PKCS1-v1_5 with
 * SHA-256 (RS256, -257, a modulus of at least 2048 bits). Anything else is refused.
 */
export function coseKey(bytes) {
  const map = bytes instanceof Map ? bytes : cborWhole(bytes);
  const unsupported = () => {
    throw new PasskeyError('key', 'This kind of passkey is not supported.');
  };
  if (!(map instanceof Map)) unsupported();
  const kty = map.get(1),
    algorithm = map.get(3);
  const b64 = (label, size) => {
    const value = map.get(label);
    if (!Buffer.isBuffer(value) || (size && value.length !== size)) unsupported();
    return value.toString('base64url');
  };
  let jwk;
  if (kty === 1 && algorithm === -8 && map.get(-1) === 6)
    jwk = { kty: 'OKP', crv: 'Ed25519', x: b64(-2, 32) };
  else if (kty === 2 && algorithm === -7 && map.get(-1) === 1)
    jwk = { kty: 'EC', crv: 'P-256', x: b64(-2, 32), y: b64(-3, 32) };
  else if (kty === 3 && algorithm === -257) {
    jwk = { kty: 'RSA', n: b64(-1), e: b64(-2) };
    if (map.get(-1).length < 256) unsupported();
  } else unsupported();
  try {
    return { algorithm, key: createPublicKey({ key: jwk, format: 'jwk' }) };
  } catch {
    return unsupported();
  }
}

/**
 * Authenticator data (WebAuthn §6.1): the RP ID hash, flags and signature counter and, when
 * present (AT), the attested credential: its AAGUID, ID and COSE public key (as bytes). The
 * bytes must hold exactly what the flags say.
 */
export function authenticatorData(bytes) {
  const malformed = () => {
    throw new PasskeyError('authenticator-data', 'The passkey answer is malformed.');
  };
  if (bytes.length < 37) malformed();
  const flags = bytes[32],
    result = {
      rpIdHash: bytes.subarray(0, 32),
      flags,
      userPresent: !!(flags & UP),
      userVerified: !!(flags & UV),
      backupEligible: !!(flags & BE),
      backedUp: !!(flags & BS),
      signCount: bytes.readUInt32BE(33),
    };
  let offset = 37;
  if (flags & AT) {
    if (bytes.length < offset + 18) malformed();
    const aaguid = bytes.subarray(offset, offset + 16),
      length = bytes.readUInt16BE(offset + 16);
    offset += 18;
    if (length < 1 || length > 1023 || bytes.length < offset + length) malformed();
    const credentialId = Buffer.from(bytes.subarray(offset, offset + length));
    offset += length;
    const [, end] = decodeCbor(bytes, offset);
    result.credential = {
      aaguid: [...aaguid].map((b) => b.toString(16).padStart(2, '0')).join(''),
      id: credentialId,
      publicKey: Buffer.from(bytes.subarray(offset, end)),
    };
    offset = end;
  }
  if (flags & ED) [, offset] = decodeCbor(bytes, offset);
  if (offset !== bytes.length) malformed();
  return result;
}

/**
 * The client data JSON (WebAuthn §5.8.1) of a credential's `response`, checked for its `type`
 * (`webauthn.create` or `webauthn.get`) and parsed. The challenge is checked by the caller,
 * which looks it up, and the origin by verify below.
 * @returns {{ type: string, challenge: string, origin: string, crossOrigin?: boolean, bytes: Buffer }}
 */
export function clientData(encoded, type) {
  const bytes = fromBase64url(encoded, 8192);
  let data;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new PasskeyError('client-data', 'The passkey answer is malformed.');
  }
  if (!data || typeof data !== 'object' || data.type !== type)
    throw new PasskeyError('type', 'The passkey answer is for another step.');
  if (typeof data.challenge !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(data.challenge))
    throw new PasskeyError('challenge', 'The passkey answer is malformed.');
  return { ...data, bytes };
}

/** Constant-time equality of two strings (challenges). */
function same(a, b) {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The checks registration and assertion share (WebAuthn §7.1 steps 7–16 and §7.2 steps
 * 11–17): the client data's challenge is `expected.challenge` and its origin is exactly
 * `expected.origin` (the site's configured address), not from a cross-origin frame; the
 * authenticator data names `expected.rpId` (the address's host) by its SHA-256, and the user
 * was present and verified (a PIN, a fingerprint or a face: user verification is required);
 * a backed-up credential must be backup-eligible.
 */
function checkCommon(client, data, expected) {
  if (!same(client.challenge, expected.challenge))
    throw new PasskeyError('challenge', 'The passkey answer is for another request.');
  if (client.origin !== expected.origin || client.crossOrigin === true)
    throw new PasskeyError('origin', 'The passkey answer came from another site.');
  const rpIdHash = createHash('sha256').update(expected.rpId).digest();
  if (!timingSafeEqual(rpIdHash, data.rpIdHash))
    throw new PasskeyError('rp-id', 'The passkey belongs to another site.');
  if (!data.userPresent) throw new PasskeyError('user-present', 'The passkey was not confirmed.');
  if (!data.userVerified)
    throw new PasskeyError(
      'user-verified',
      'The passkey did not verify you (with a PIN, fingerprint or face). Try again, or use another passkey.',
    );
  if (data.backedUp && !data.backupEligible)
    throw new PasskeyError('backup', 'The passkey answer is malformed.');
}

/**
 * Verifies a new credential (`navigator.credentials.create()`, in JSON: `id`, `rawId`,
 * `type`, `response.clientDataJSON`, `response.attestationObject`, optional
 * `response.transports`) against `expected` (`challenge`, `origin`, `rpId`). The attestation
 * statement is not verified (attestation 'none' is requested). Result: what is stored of it.
 * Throws PasskeyError (401).
 * @returns {{ credentialId: string, publicKey: Buffer, algorithm: number, signCount: number,
 *   aaguid: string, transports: string[], backupEligible: boolean }}
 */
export function verifyRegistration(credential, expected) {
  if (!credential || typeof credential !== 'object' || credential.type !== 'public-key')
    throw new PasskeyError('shape', 'The passkey answer is malformed.');
  const response = credential.response ?? {},
    client = clientData(response.clientDataJSON, 'webauthn.create'),
    attestation = cborWhole(fromBase64url(response.attestationObject));
  if (!(attestation instanceof Map) || !Buffer.isBuffer(attestation.get('authData')))
    throw new PasskeyError('attestation', 'The passkey answer is malformed.');
  const data = authenticatorData(attestation.get('authData'));
  checkCommon(client, data, expected);
  if (!data.credential) throw new PasskeyError('attestation', 'The passkey answer is malformed.');
  const rawId = fromBase64url(credential.rawId ?? credential.id, 2048);
  if (!rawId.equals(data.credential.id))
    throw new PasskeyError('credential-id', 'The passkey answer is malformed.');
  const { algorithm } = coseKey(data.credential.publicKey);
  const transports = Array.isArray(response.transports)
    ? response.transports
        .filter((t) => typeof t === 'string' && /^[a-z-]{1,16}$/.test(t))
        .slice(0, 8)
    : [];
  return {
    credentialId: data.credential.id.toString('base64url'),
    publicKey: data.credential.publicKey,
    algorithm,
    signCount: data.signCount,
    aaguid: data.credential.aaguid,
    transports,
    backupEligible: data.backupEligible,
  };
}

/**
 * Verifies an assertion (`navigator.credentials.get()`, in JSON: `id`, `rawId`, `type`,
 * `response.clientDataJSON`, `response.authenticatorData`, `response.signature`, optional
 * `response.userHandle`) by the stored credential `stored` (`publicKey` COSE bytes,
 * `signCount`) against `expected` (`challenge`, `origin`, `rpId`).
 *
 * The signature counter (WebAuthn §6.1.1): when the authenticator keeps one (either count is
 * non-zero), the new count must be greater than the stored one; otherwise two copies of the
 * credential may exist, and it is refused (`reason` 'clone'). Authenticators that keep none
 * (synced passkeys report 0) are not checked. Result: the new count. Throws PasskeyError.
 * @returns {{ signCount: number, backedUp: boolean }}
 */
export function verifyAssertion(credential, stored, expected) {
  if (!credential || typeof credential !== 'object' || credential.type !== 'public-key')
    throw new PasskeyError('shape', 'The passkey answer is malformed.');
  const response = credential.response ?? {},
    client = clientData(response.clientDataJSON, 'webauthn.get'),
    raw = fromBase64url(response.authenticatorData, 4096),
    data = authenticatorData(raw),
    signature = fromBase64url(response.signature, 2048);
  checkCommon(client, data, expected);
  const { algorithm, key } = coseKey(stored.publicKey);
  const signed = Buffer.concat([raw, createHash('sha256').update(client.bytes).digest()]);
  let valid = false;
  try {
    valid =
      algorithm === -8
        ? verify(null, signed, key, signature)
        : algorithm === -7
          ? verify('sha256', signed, { key, dsaEncoding: 'der' }, signature)
          : verify('sha256', signed, key, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new PasskeyError('signature', 'The passkey could not be verified.');
  const before = Number(stored.signCount ?? 0);
  if ((data.signCount !== 0 || before !== 0) && data.signCount <= before)
    throw new PasskeyError(
      'clone',
      'This passkey’s signature counter went backwards, so it may have been copied. Remove it from your account and add it again, or use another way to sign in.',
    );
  return { signCount: data.signCount, backedUp: data.backedUp };
}

/** A UUID's 16 bytes, base64url: an account's WebAuthn user handle (it holds nothing else). */
export const userHandle = (id) => Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url');
