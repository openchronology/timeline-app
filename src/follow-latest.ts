// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
interface Host<T> {
  load(signal: AbortSignal): Promise<T | null>;
  apply(value: T): void;
  blocked(): boolean;
  cancel(): void;
  error(error: unknown): void;
}
interface Clock {
  now(): number;
  set(run: () => void, delay: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}
/** Coalesce additions and never move the camera until navigation has been idle. */
export function followLatest<T>(
  host: Host<T>,
  clock: Clock = {
    now: () => performance.now(),
    set: (run, delay) => setTimeout(run, delay),
    clear: clearTimeout,
  },
) {
  let enabled = false,
    pending = false,
    busy = false,
    epoch = 0,
    lastNavigation = -Infinity,
    timer: ReturnType<typeof setTimeout> | undefined,
    controller: AbortController | undefined;
  function invalidate() {
    epoch++;
    controller?.abort();
  }
  const clear = () => {
    if (timer !== undefined) clock.clear(timer);
    timer = undefined;
  };
  function schedule() {
    clear();
    if (!enabled || !pending || busy) return;
    const idle = 15000 - (clock.now() - lastNavigation);
    timer = clock.set(() => void run(), Math.max(0, idle));
  }
  async function run() {
    timer = undefined;
    if (!enabled || !pending || busy) return;
    if (clock.now() - lastNavigation < 15000) {
      schedule();
      return;
    }
    if (host.blocked()) {
      timer = clock.set(() => void run(), 1000);
      return;
    }
    busy = true;
    const request = epoch;
    const loading = new AbortController();
    controller = loading;
    try {
      const value = await host.load(loading.signal);
      if (
        enabled &&
        request === epoch &&
        !host.blocked() &&
        clock.now() - lastNavigation >= 15000
      ) {
        pending = false;
        if (value !== null) host.apply(value);
      }
    } catch (error) {
      if (request === epoch) {
        pending = false;
        host.error(error);
      }
    } finally {
      if (controller === loading) controller = undefined;
      busy = false;
      schedule();
    }
  }
  return {
    setEnabled(value: boolean) {
      invalidate();
      enabled = value;
      pending = false;
      clear();
      host.cancel();
    },
    addition() {
      if (!enabled) return;
      pending = true;
      invalidate();
      schedule();
    },
    navigation() {
      lastNavigation = clock.now();
      invalidate();
      host.cancel();
      schedule();
    },
    wake() {
      schedule();
    },
    reset() {
      invalidate();
      enabled = false;
      pending = false;
      clear();
      host.cancel();
    },
  };
}
