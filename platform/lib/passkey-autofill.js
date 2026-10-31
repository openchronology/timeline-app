// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Passkeys offered in the username field's autofill on /login (#403; conditional mediation):
// a browser request kept pending while the page is open, with a sign-in challenge fetched
// again before it expires, after a failed attempt and when the page comes back into view.
// What it asks the server and the browser is given to it, so it runs and is tested anywhere.

/** How long before a challenge expires a new one is fetched, in milliseconds. */
export const REFRESH_MARGIN = 30000;
/** The longest wait before trying again after failures, in milliseconds (five minutes). */
export const RETRY_LIMIT = 300000;

/**
 * When to fetch the next challenge, in milliseconds after the clock's `issued`: `REFRESH_MARGIN`
 * before the challenge's `timeout` (its lifetime) runs out, but never sooner than a minute,
 * however short the timeout, so a page left open asks the server at most once a minute.
 */
export function refreshAt(issued, timeout) {
  return issued + Math.max(60000, (Number(timeout) || 0) - REFRESH_MARGIN);
}

/**
 * How long to wait before trying again after `failures` failures in a row (asking for a
 * challenge, or the browser refusing the request): five seconds, doubling each time, at most
 * five minutes.
 */
export function retryDelay(failures) {
  return Math.min(RETRY_LIMIT, 5000 * 2 ** Math.max(0, failures - 1));
}

/** Whether `error` is a request being aborted, which is expected and not reported. */
export const aborted = (error) => error?.name === 'AbortError';

/**
 * Keeps a conditional passkey request pending on the sign-in page and signs in with the
 * passkey picked from autofill. One challenge is held at a time: it is replaced
 * `REFRESH_MARGIN` before it expires while the page is in view, and not while it is hidden (a
 * page left in the background asks for nothing), and at once when the page returns with it
 * stale. A refused sign-in fetches a new challenge at once, the next ones after a growing
 * wait (retryDelay), as do failures to get a challenge or the browser refusing the request.
 * Each challenge is still used once and lasts five minutes on the server.
 *
 * @param {object} options
 * @param {(signal: AbortSignal) => Promise<object>} options.options fetches request options
 *   (`publicKey`, with its `timeout`) for signing in with a passkey alone
 * @param {(publicKey: object, signal: AbortSignal) => Promise<object>} options.get asks the
 *   browser for a passkey with conditional mediation; the answer as JSON
 * @param {(credential: object) => Promise<void>} options.signIn signs in with the answer;
 *   rejects when the server refuses it
 * @param {() => number} [options.now] the clock, in milliseconds
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers]
 * @param {Document|EventTarget|null} [options.page] the document, for its visibility
 * @param {Window|EventTarget|null} [options.view] the window, for pages restored from the
 *   back-forward cache
 * @returns {{pause: () => void, resume: () => void, stop: () => void}} pause aborts the
 *   pending request (before another passkey request or a password sign-in), resume starts
 *   again with a new challenge, and stop ends it for good (when the form goes)
 */
export function passkeyAutofill({
  options,
  get,
  signIn,
  now = () => Date.now(),
  timers = globalThis,
  page = globalThis.document ?? null,
  view = globalThis.window ?? null,
}) {
  // The pending round's controller, the timer for the next round, when the challenge must be
  // replaced, and the failures in a row.
  let controller = null,
    timer = null,
    due = 0,
    failures = 0,
    paused = false,
    stopped = false;
  const hidden = () => page?.visibilityState === 'hidden';
  function clear() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }
  function abort() {
    controller?.abort();
    controller = null;
  }
  function later(delay) {
    clear();
    timer = timers.setTimeout(() => {
      timer = null;
      void round();
    }, delay);
  }
  /** After a failure: tries again after retryDelay, or at once when `soon` (a refused sign-in). */
  function failed(soon = false) {
    failures++;
    if (soon && failures === 1) void round();
    else later(retryDelay(soon ? failures - 1 : failures));
  }
  /** Replaces the pending request with one on a new challenge, then waits for an answer. */
  async function round() {
    clear();
    abort();
    if (paused || stopped || hidden()) return;
    const mine = new AbortController();
    controller = mine;
    const current = () => controller === mine && !mine.signal.aborted;
    let publicKey;
    try {
      publicKey = await options(mine.signal);
    } catch (error) {
      if (current() && !aborted(error)) failed();
      return;
    }
    if (!current()) return;
    due = refreshAt(now(), publicKey.timeout);
    later(due - now());
    let credential;
    try {
      credential = await get(publicKey, mine.signal);
    } catch (error) {
      // Aborted for a new round, another request or the page going; anything else (the
      // browser's own timeout, say) is tried again after a wait.
      if (current() && !aborted(error)) failed();
      return;
    }
    if (!current()) return;
    clear();
    controller = null;
    try {
      await signIn(credential);
      failures = 0;
    } catch {
      // The challenge was used up by the attempt: another one, for the next pick.
      if (!paused && !stopped) failed(true);
    }
  }
  /** Back in view: a new challenge now if this one is stale or none is pending. */
  function shown() {
    if (paused || stopped || hidden()) {
      clear();
      return;
    }
    if (!controller || now() >= due) void round();
    else if (timer === null) later(due - now());
  }
  /** Restored from the back-forward cache: whatever was pending did not survive. */
  function restored(event) {
    if (event?.persisted) {
      abort();
      shown();
    }
  }
  page?.addEventListener?.('visibilitychange', shown);
  view?.addEventListener?.('pageshow', restored);
  void round();
  return {
    pause() {
      paused = true;
      clear();
      abort();
    },
    resume() {
      if (stopped || !paused) return;
      paused = false;
      failures = 0;
      void round();
    },
    stop() {
      stopped = true;
      clear();
      abort();
      page?.removeEventListener?.('visibilitychange', shown);
      view?.removeEventListener?.('pageshow', restored);
    },
  };
}
