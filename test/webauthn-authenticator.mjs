// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A software authenticator for tests of passkeys (#372): it makes credentials and assertions
// as a browser and authenticator would send them, in the JSON the app sends (base64url), with
// switches for what a test wants wrong (origin, RP ID, flags, counter, challenge).
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

/** CBOR (RFC 8949) for what COSE keys and attestation objects hold. */
export function encodeCbor(value) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) {
      const b = Buffer.alloc(3);
      b[0] = (major << 5) | 25;
      b.writeUInt16BE(n, 1);
      return b;
    }
    const b = Buffer.alloc(5);
    b[0] = (major << 5) | 26;
    b.writeUInt32BE(n, 1);
    return b;
  };
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value);
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(encodeCbor)]);
  if (value instanceof Map)
    return Buffer.concat([
      head(5, value.size),
      ...[...value].flatMap(([k, v]) => [encodeCbor(k), encodeCbor(v)]),
    ]);
  throw new Error('Unsupported CBOR value');
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64url');

/**
 * A passkey held by the test: `algorithm` -7 (ES256), -8 (EdDSA) or -257 (RS256). `counter`
 * is the signature counter it reports next (0 keeps none, as synced passkeys do).
 */
export function softAuthenticator({ algorithm = -7, counter = 0, userHandle = null } = {}) {
  const pair =
    algorithm === -8
      ? generateKeyPairSync('ed25519')
      : algorithm === -257
        ? generateKeyPairSync('rsa', { modulusLength: 2048 })
        : generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const cose =
    algorithm === -8
      ? new Map([
          [1, 1],
          [3, -8],
          [-1, 6],
          [-2, Buffer.from(jwk.x, 'base64url')],
        ])
      : algorithm === -257
        ? new Map([
            [1, 3],
            [3, -257],
            [-1, Buffer.from(jwk.n, 'base64url')],
            [-2, Buffer.from(jwk.e, 'base64url')],
          ])
        : new Map([
            [1, 2],
            [3, -7],
            [-1, 1],
            [-2, Buffer.from(jwk.x, 'base64url')],
            [-3, Buffer.from(jwk.y, 'base64url')],
          ]);
  const id = randomBytes(32),
    aaguid = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const state = { counter, userHandle };
  /** Authenticator data for `rpId` with `flags`, and the attested credential when `attest`. */
  const authData = (rpId, flags, attest) => {
    const head = Buffer.alloc(37);
    createHash('sha256').update(rpId).digest().copy(head, 0);
    head[32] = flags | (attest ? 0x40 : 0);
    head.writeUInt32BE(state.counter, 33);
    if (!attest) return head;
    const length = Buffer.alloc(2);
    length.writeUInt16BE(id.length);
    return Buffer.concat([head, aaguid, length, id, encodeCbor(cose)]);
  };
  const client = (type, challenge, origin, extra = {}) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }));
  return {
    id: b64(id),
    state,
    /**
     * `navigator.credentials.create()`'s answer to `options` (challenge, rp.id), as JSON.
     * `flags` defaults to user present and verified (0x05).
     */
    create(options, { origin, rpId = options.rp.id, flags = 0x05, type, client: extra } = {}) {
      const data = authData(rpId, flags, true);
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        response: {
          clientDataJSON: b64(client(type ?? 'webauthn.create', options.challenge, origin, extra)),
          attestationObject: b64(
            encodeCbor(
              new Map([
                ['fmt', 'none'],
                ['attStmt', new Map()],
                ['authData', data],
              ]),
            ),
          ),
          transports: ['internal', 'hybrid'],
        },
      };
    },
    /** `navigator.credentials.get()`'s answer to `options` (challenge, rpId), as JSON. */
    get(options, { origin, rpId = options.rpId, flags = 0x05, type, client: extra, tamper } = {}) {
      if (state.counter) state.counter++;
      const data = authData(rpId, flags, false),
        clientData = client(type ?? 'webauthn.get', options.challenge, origin, extra),
        signed = Buffer.concat([data, createHash('sha256').update(clientData).digest()]);
      let signature = sign(algorithm === -8 ? null : 'sha256', signed, pair.privateKey);
      if (tamper) signature = Buffer.from(signature.map((b, i) => (i === 8 ? b ^ 1 : b)));
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        response: {
          clientDataJSON: b64(clientData),
          authenticatorData: b64(data),
          signature: b64(signature),
          ...(state.userHandle ? { userHandle: state.userHandle } : {}),
        },
      };
    },
  };
}
