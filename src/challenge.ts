// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Answers the server's human-verification challenges (428 responses). Proof of work is solved
 * here; Cloudflare Turnstile is shown in a small dialog. The answer goes in `X-Challenge`.
 */
export type Challenge =
  | {
      provider: 'pow';
      purpose: string;
      algorithm: 'SHA-256';
      salt: string;
      challenge: string;
      maxnumber: number;
      signature: string;
    }
  | { provider: 'turnstile'; purpose: string; siteKey: string };

interface Turnstile {
  render(
    host: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
    },
  ): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export function isChallenge(value: unknown): value is Challenge {
  const c = value as Challenge | null;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.purpose === 'string' &&
    ((c.provider === 'pow' &&
      c.algorithm === 'SHA-256' &&
      typeof c.salt === 'string' &&
      /^[a-f0-9]{64}$/.test(c.challenge) &&
      Number.isInteger(c.maxnumber) &&
      c.maxnumber > 0 &&
      c.maxnumber <= 10000000 &&
      typeof c.signature === 'string') ||
      (c.provider === 'turnstile' && typeof c.siteKey === 'string'))
  );
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** Finds the number whose SHA-256 with the salt matches, a batch of digests at a time. */
export async function solveWork(
  challenge: Extract<Challenge, { provider: 'pow' }>,
  progress: (fraction: number) => void = () => {},
  signal?: AbortSignal,
): Promise<number> {
  const encoder = new TextEncoder();
  const batch = 512;
  for (let start = 0; start <= challenge.maxnumber; start += batch) {
    signal?.throwIfAborted();
    const numbers = Array.from(
      { length: Math.min(batch, challenge.maxnumber - start + 1) },
      (_, i) => start + i,
    );
    const digests = await Promise.all(
      numbers.map((n) => crypto.subtle.digest('SHA-256', encoder.encode(challenge.salt + n))),
    );
    const found = digests.findIndex((digest) => hex(digest) === challenge.challenge);
    if (found >= 0) return numbers[found];
    // Let the page paint and respond (the dialog, Cancel) every few thousand hashes.
    if ((start / batch) % 8 === 7) {
      progress(Math.min(1, (start + batch) / challenge.maxnumber));
      await new Promise((resume) => setTimeout(resume, 0));
    }
  }
  throw new Error('This check could not be solved. Please try again.');
}

let turnstileScript: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  turnstileScript ??= new Promise<Turnstile>((done, fail) => {
    if (window.turnstile) return done(window.turnstile);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    // Pages with a nonce-based policy trust scripts that carry the page's nonce.
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.onload = () =>
      window.turnstile ? done(window.turnstile) : fail(new Error('Verification did not load.'));
    script.onerror = () => {
      turnstileScript = null;
      fail(new Error('Verification could not load. Check your connection and try again.'));
    };
    document.head.append(script);
  });
  return turnstileScript;
}

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Shows the check in a modal dialog and resolves with the `X-Challenge` header value.
 * Rejects if the reader cancels.
 */
export function answerChallenge(challenge: Challenge, message: string): Promise<string> {
  const dialog = document.createElement('dialog');
  dialog.className = 'challenge-dialog';
  dialog.setAttribute('aria-labelledby', 'challenge-heading');
  const heading = document.createElement('h2');
  heading.id = 'challenge-heading';
  heading.textContent = 'Quick check';
  const text = document.createElement('p');
  text.textContent = message;
  const status = document.createElement('p');
  status.className = 'challenge-status';
  status.setAttribute('role', 'status');
  const widget = document.createElement('div');
  widget.className = 'challenge-widget';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const actions = document.createElement('div');
  actions.className = 'challenge-actions';
  actions.append(cancel);
  dialog.append(heading, text, widget, status, actions);
  document.body.append(dialog);
  const abort = new AbortController();
  let widgetId: string | undefined;
  return new Promise<string>((done, fail) => {
    const finish = (error?: Error, answer?: string) => {
      abort.abort();
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
      dialog.close();
      dialog.remove();
      if (error) fail(error);
      else done(answer!);
    };
    const cancelled = () => finish(new Error('Verification was cancelled.'));
    cancel.onclick = cancelled;
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      cancelled();
    });
    dialog.showModal();
    if (challenge.provider === 'pow') {
      status.textContent = 'Checking this browser…';
      const progress = document.createElement('progress');
      progress.max = 1;
      progress.value = 0;
      widget.append(progress);
      solveWork(challenge, (fraction) => (progress.value = fraction), abort.signal).then(
        (number) =>
          finish(
            undefined,
            encode({
              provider: 'pow',
              salt: challenge.salt,
              challenge: challenge.challenge,
              signature: challenge.signature,
              number,
            }),
          ),
        (error) => {
          if (!abort.signal.aborted) finish(error);
        },
      );
    } else {
      status.textContent = 'Loading…';
      loadTurnstile().then(
        (turnstile) => {
          if (abort.signal.aborted) return;
          status.textContent = '';
          widgetId = turnstile.render(widget, {
            sitekey: challenge.siteKey,
            action: challenge.purpose,
            callback: (token) => finish(undefined, encode({ provider: 'turnstile', token })),
            'error-callback': () => (status.textContent = 'Verification failed. Try again.'),
            'expired-callback': () => (status.textContent = 'The check expired. Try again.'),
          });
        },
        (error) => finish(error),
      );
    }
  });
}

/**
 * Sends a request, answering challenges the server asks for (at most twice, in case an
 * answer expires before it arrives).
 */
export async function withChallenges<T>(
  send: (
    answer?: string,
  ) => Promise<{ status: number; body: { error?: string; challenge?: unknown } }>,
  done: (reply: { status: number; body: unknown }) => T,
): Promise<T> {
  let answer: string | undefined;
  for (let attempt = 0; ; attempt++) {
    const reply = await send(answer);
    if (reply.status !== 428 || attempt === 2 || !isChallenge(reply.body.challenge))
      return done(reply);
    answer = await answerChallenge(
      reply.body.challenge,
      reply.body.error ?? 'Confirm you are a person to continue.',
    );
  }
}
