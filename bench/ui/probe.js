// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Injected into the editor by the UI benchmarks (bench/ui.mjs). Works the same in Chromium
// and WebKit: no browser-specific APIs, and no eval (the editor's policy forbids it).
(() => {
  if (window.__ui) return;
  const INPUTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel'];
  let armed = null,
    watching = null,
    frames = null,
    download = null;
  // The first trusted input after arm() starts the measurement, as Event Timing would.
  for (const type of INPUTS)
    addEventListener(
      type,
      (event) => {
        if (armed && armed.input === null && event.isTrusted) armed.input = event.timeStamp;
      },
      { capture: true, passive: true },
    );
  // After the frame paints: a message posted from requestAnimationFrame runs after rendering.
  const channel = new MessageChannel();
  let afterPaint = null;
  channel.port1.onmessage = () => {
    const run = afterPaint;
    afterPaint = null;
    run?.();
  };
  const nextPaint = (run) => {
    requestAnimationFrame(() => {
      afterPaint = run;
      channel.port2.postMessage(0);
    });
  };
  // Downloads (export) are anchors clicked with a download attribute.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) download = performance.now();
    return click.call(this);
  };
  window.__ui = {
    /** Starts timing at the next trusted input; `check` is the result to wait for. */
    watch(check, timeout = 60000) {
      armed = { input: null };
      download = null;
      const started = performance.now();
      const state = (watching = { result: null });
      const poll = () => {
        if (watching !== state) return;
        let done = false;
        try {
          done = !!check();
        } catch {}
        const now = performance.now();
        if (done && armed.input !== null) {
          state.result = { ms: now - armed.input, input: armed.input };
          return;
        }
        if (now - started > timeout) {
          state.result = { timeout: true, input: armed.input };
          return;
        }
        nextPaint(poll);
      };
      nextPaint(poll);
    },
    /** The watched result: null while waiting, then { ms } or { timeout }. */
    result() {
      return watching?.result ?? null;
    },
    /** Starts timing now (for results not caused by input here, such as live updates). */
    since(check, timeout = 60000) {
      this.watch(check, timeout);
      armed.input = performance.now();
    },
    downloaded() {
      return download;
    },
    /** Records frame intervals until stopFrames(). */
    startFrames() {
      const state = (frames = { gaps: [], last: null });
      const tick = (now) => {
        if (frames !== state) return;
        if (state.last !== null) state.gaps.push(now - state.last);
        state.last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stopFrames() {
      const gaps = frames?.gaps ?? [];
      frames = null;
      return gaps;
    },
  };
})();
