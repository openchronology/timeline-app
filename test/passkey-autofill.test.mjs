// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Unit tests of passkeys in the sign-in form's autofill (#403; platform/lib/passkey-autofill.js),
// on a manual clock: the challenge replaced before it expires, nothing asked while the page is
// hidden, a new one after a refused sign-in or on coming back, waits after failures, and the
// pending request aborted before another one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFRESH_MARGIN,
  passkeyAutofill,
  refreshAt,
  retryDelay,
} from '../platform/lib/passkey-autofill.js';

const TIMEOUT = 300000;
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

/**
 * A sign-in page on a manual clock: the server's options and the browser's pending requests
 * are recorded, and each request can be answered (`pick`) or refused (`refuse`).
 */
function harness({ optionsFail = () => false } = {}) {
  let clock = 0,
    nextId = 1;
  const pending = new Map();
  const timers = {
    setTimeout(fn, delay) {
      const id = nextId++;
      pending.set(id, { at: clock + delay, fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  const page = new EventTarget();
  page.visibilityState = 'visible';
  const view = new EventTarget();
  const h = {
    challenges: [],
    requests: [],
    signIns: [],
    refuseSignIn: false,
    page,
    view,
    get now() {
      return clock;
    },
    /** Moves the clock on by `ms`, running the timers that come due. */
    async advance(ms) {
      const end = clock + ms;
      for (;;) {
        const due = [...pending].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, t] = due[0];
        pending.delete(id);
        clock = t.at;
        t.fn();
        await settle();
      }
      clock = end;
      await settle();
    },
    async visibility(state) {
      page.visibilityState = state;
      page.dispatchEvent(new Event('visibilitychange'));
      await settle();
    },
    /** The latest browser request, if it is still pending. */
    get live() {
      const last = h.requests.at(-1);
      return last && !last.signal.aborted ? last : null;
    },
  };
  h.control = passkeyAutofill({
    now: () => clock,
    timers,
    page,
    view,
    options: async (signal) => {
      if (optionsFail(h.challenges.length)) throw new Error('Too many attempts.');
      const challenge = 'c' + h.challenges.length;
      h.challenges.push({ challenge, at: clock, signal });
      return { challenge, timeout: TIMEOUT };
    },
    get: (publicKey, signal) =>
      new Promise((resolve, reject) => {
        const request = { publicKey, signal, pick: resolve, refuse: reject };
        signal.addEventListener('abort', () => reject(abortError()));
        h.requests.push(request);
      }),
    signIn: async (credential) => {
      h.signIns.push(credential);
      if (h.refuseSignIn) throw new Error('That passkey was not recognized.');
    },
  });
  return h;
}

test('the next challenge is asked for before this one expires, at most once a minute', () => {
  assert.equal(refreshAt(1000, TIMEOUT), 1000 + TIMEOUT - REFRESH_MARGIN);
  assert.equal(refreshAt(0, 5000), 60000);
  assert.equal(refreshAt(0, undefined), 60000);
  assert.deepEqual([1, 2, 3, 7, 20].map(retryDelay), [5000, 10000, 20000, 300000, 300000]);
});

test('a pending request is kept on a fresh challenge while the page is in view', async () => {
  const h = harness();
  await h.advance(0);
  assert.equal(h.challenges.length, 1);
  assert.equal(h.live.publicKey.challenge, 'c0');
  // Just before the challenge's lifetime runs out, the request moves to a new one.
  await h.advance(TIMEOUT - REFRESH_MARGIN - 1);
  assert.equal(h.challenges.length, 1);
  await h.advance(1);
  assert.equal(h.challenges.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.live.publicKey.challenge, 'c1');
  // An hour open asks the server once every four and a half minutes, no more.
  await h.advance(3600000);
  assert.equal(h.challenges.length, 2 + Math.floor(3600000 / (TIMEOUT - REFRESH_MARGIN)));
  h.control.stop();
});

test('a hidden page asks for nothing, and a new challenge on coming back once it is stale', async () => {
  const h = harness();
  await h.advance(0);
  await h.visibility('hidden');
  await h.advance(3 * TIMEOUT);
  assert.equal(h.challenges.length, 1);
  await h.visibility('visible');
  assert.equal(h.challenges.length, 2);
  assert.equal(h.live.publicKey.challenge, 'c1');
  // Hidden and shown again within the challenge's lifetime: it is kept, and its refresh too.
  await h.visibility('hidden');
  await h.advance(1000);
  await h.visibility('visible');
  assert.equal(h.challenges.length, 2);
  await h.advance(TIMEOUT - REFRESH_MARGIN - 1000);
  assert.equal(h.challenges.length, 3);
  // Restored from the back-forward cache, it starts again.
  h.view.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  await h.advance(0);
  assert.equal(h.challenges.length, 4);
  h.control.stop();
});

test('a passkey picked from autofill signs in; a refused one gets a new challenge', async () => {
  const h = harness();
  await h.advance(0);
  h.refuseSignIn = true;
  h.live.pick({ id: 'first' });
  await h.advance(0);
  assert.deepEqual(h.signIns, [{ id: 'first' }]);
  // The used challenge is replaced at once for the next pick ...
  assert.equal(h.challenges.length, 2);
  h.live.pick({ id: 'second' });
  await h.advance(0);
  // ... and after another refusal, after a wait, so nothing can loop on the rate limit.
  assert.equal(h.challenges.length, 2);
  await h.advance(5000);
  assert.equal(h.challenges.length, 3);
  h.refuseSignIn = false;
  h.live.pick({ id: 'third' });
  await h.advance(0);
  assert.equal(h.signIns.length, 3);
  // Signed in: nothing more is asked for.
  await h.advance(3 * TIMEOUT);
  assert.equal(h.challenges.length, 3);
  assert.equal(h.requests.length, 3);
  h.control.stop();
});

test('failures to get a challenge, or the browser refusing, wait longer each time', async () => {
  // The first two asks fail (a rate limit, say).
  let failed = 0;
  const h = harness({ optionsFail: () => failed++ < 2 });
  await h.advance(0);
  assert.equal(h.requests.length, 0);
  await h.advance(5000);
  assert.equal(h.requests.length, 0);
  await h.advance(9999);
  assert.equal(h.requests.length, 0);
  await h.advance(1);
  assert.equal(h.live.publicKey.challenge, 'c0');
  // A browser's own refusal (its timeout, say) is not answered at once.
  h.live.refuse(new Error('The passkey request was cancelled or timed out.'));
  await h.advance(0);
  assert.equal(h.challenges.length, 1);
  await h.advance(20000);
  assert.equal(h.challenges.length, 2);
  h.control.stop();
});

test('pausing aborts the pending request quietly; resuming starts on a new challenge', async () => {
  const h = harness();
  await h.advance(0);
  const first = h.live;
  // The passkey button, or a password sign-in, pauses it.
  h.control.pause();
  await h.advance(0);
  assert.equal(first.signal.aborted, true);
  assert.equal(h.live, null);
  await h.advance(3 * TIMEOUT);
  await h.visibility('hidden');
  await h.visibility('visible');
  assert.equal(h.challenges.length, 1);
  // That attempt failed: the form offers passkeys again.
  h.control.resume();
  await h.advance(0);
  assert.equal(h.challenges.length, 2);
  assert.equal(h.live.publicKey.challenge, 'c1');
  // Leaving the form ends it for good.
  h.control.stop();
  await h.advance(0);
  assert.equal(h.live, null);
  h.control.resume();
  await h.visibility('visible');
  await h.advance(3 * TIMEOUT);
  assert.equal(h.challenges.length, 2);
});

test('a request aborted while its challenge is being fetched is dropped', async () => {
  let release;
  const signals = [];
  const control = passkeyAutofill({
    page: null,
    view: null,
    options: (signal) => {
      signals.push(signal);
      return new Promise((r) => (release = r));
    },
    get: () => assert.fail('no request after an abort'),
    signIn: () => assert.fail('no sign-in after an abort'),
  });
  control.stop();
  release({ challenge: 'late', timeout: TIMEOUT });
  await settle();
  assert.equal(signals[0].aborted, true);
});
