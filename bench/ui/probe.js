// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Injected into the editor by the UI benchmarks (bench/ui.mjs). Works the same in Chromium
// and WebKit: no browser-specific APIs, and no eval (the editor's policy forbids it).
(() => {
  if (window.__ui) return;
  // The events that trigger a result: a click completes on release, a key on its press. A
  // measurement runs from the latest of these before the result appears, as Event Timing
  // measures an interaction from its triggering event, so the time a button is held down (or
  // a driver pauses between press and release) is not counted.
  const INPUTS = ['click', 'pointerup', 'mouseup', 'touchend', 'keydown', 'wheel'];
  let armed = null,
    watching = null,
    frames = null,
    download = null;
  // The last inputs received, for UI_DEBUG's report when an interaction fails.
  const recent = [];
  for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'wheel', 'touchstart'])
    addEventListener(
      type,
      (event) => {
        const modifiers = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].filter((k) => event[k]);
        recent.push(
          `${type}:${event.target?.id || event.target?.className || event.target?.tagName}` +
            (type === 'wheel' ? `:${event.deltaY}/${event.deltaMode}` : '') +
            (modifiers.length ? `:${modifiers.join('+')}` : ''),
        );
        if (recent.length > 12) recent.shift();
      },
      { capture: true, passive: true },
    );
  for (const type of INPUTS)
    addEventListener(
      type,
      (event) => {
        if (armed && !armed.fixed && event.isTrusted) armed.input = event.timeStamp;
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
      armed = { input: null, fixed: false };
      download = null;
      const started = performance.now();
      const state = (watching = { result: null });
      const poll = () => {
        if (watching !== state) return;
        let done = false;
        try {
          done = !!check();
        } catch {}
        // The trigger is the latest input before the result: freeze it once the result shows.
        const now = performance.now();
        if (done && armed.input !== null) {
          state.result = { ms: now - armed.input, input: armed.input };
          // Later inputs (such as a key's release) do not move the start of this one.
          armed.fixed = true;
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
      armed.fixed = true;
    },
    recent: () => recent.slice(),
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
