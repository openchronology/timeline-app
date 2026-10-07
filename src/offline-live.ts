// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** Standalone HTML has no network transport, event streams, or refresh timers. */
export function liveUpdates(_host: unknown) {
  return { async update() {}, pause() {}, close() {} };
}
