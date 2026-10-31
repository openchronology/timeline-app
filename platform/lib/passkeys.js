// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Passkeys in the browser (#372; server/passkeys.mjs): asking the browser to make or use one
// with the options the server gives, and sending its answer back as JSON. Binary fields
// travel as base64url both ways.
import { api } from './api.js';

/** Whether this browser can make and use passkeys. */
export function passkeysSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

const bytes = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const text = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const descriptors = (list = []) => list.map((d) => ({ ...d, id: bytes(d.id) }));

/** A failure the person caused (cancelling, or no passkey here) in words for them. */
function explain(error) {
  if (error?.name === 'NotAllowedError')
    return new Error('The passkey request was cancelled or timed out.');
  if (error?.name === 'InvalidStateError')
    return new Error('This passkey is already registered to your account.');
  if (error?.name === 'SecurityError')
    return new Error('Passkeys work only on this site’s own address over HTTPS.');
  return error;
}

/**
 * Makes a passkey with the server's creation options (`publicKey`). Result: the credential as
 * JSON, for POST /api/auth/passkeys/register.
 */
export async function createPasskey(publicKey) {
  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        ...publicKey,
        challenge: bytes(publicKey.challenge),
        user: { ...publicKey.user, id: bytes(publicKey.user.id) },
        excludeCredentials: descriptors(publicKey.excludeCredentials),
      },
    });
  } catch (error) {
    throw explain(error);
  }
  return {
    id: credential.id,
    rawId: text(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: text(credential.response.clientDataJSON),
      attestationObject: text(credential.response.attestationObject),
      transports: credential.response.getTransports?.() ?? [],
    },
  };
}

/**
 * Uses a passkey with the server's request options (`publicKey`). Result: the assertion as
 * JSON, for the `passkey` (or `credential`) field the server asks for.
 */
export async function usePasskey(publicKey) {
  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        ...publicKey,
        challenge: bytes(publicKey.challenge),
        allowCredentials: descriptors(publicKey.allowCredentials),
      },
    });
  } catch (error) {
    throw explain(error);
  }
  const r = credential.response;
  return {
    id: credential.id,
    rawId: text(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: text(r.clientDataJSON),
      authenticatorData: text(r.authenticatorData),
      signature: text(r.signature),
      ...(r.userHandle ? { userHandle: text(r.userHandle) } : {}),
    },
  };
}

/**
 * Confirms a security change with one of the signed-in account's passkeys: the answer, as JSON
 * text for the change's `passkey` field, or null when the account has none.
 * @param {string} csrf the session's CSRF token
 */
export async function confirmWithPasskey(csrf) {
  const { publicKey } = await api('auth/passkeys/confirm/options', {
    method: 'POST',
    csrf,
    data: {},
  });
  return publicKey ? JSON.stringify(await usePasskey(publicKey)) : null;
}
