// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Whether the request being handled was made with an API key. An administrator's key has only
// its scopes, never the administrator's own access to every timeline: the access queries ask
// adminId for the account an administrator check may match, which is none for a key.
import { AsyncLocalStorage } from 'node:async_hooks';
const keyRequests = new AsyncLocalStorage();
/** Runs `work` as a request made with an API key (http.mjs, after resolving the session). */
export const asKeyRequest = (work) => keyRequests.run(true, work);
/** `userId` (null when signed out) for administrator checks, or null in a key's request. */
export const adminId = (userId) => (keyRequests.getStore() ? null : (userId ?? null));
