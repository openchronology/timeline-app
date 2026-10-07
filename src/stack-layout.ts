// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** Child coordinates are presentation rows, independent of rational time. */
export function scaleTimeline(current: number, offset: number, requested: number, anchor: number) {
  if (![current, offset, requested, anchor].every(Number.isFinite) || current <= 0)
    throw new Error('UI scaling requires finite coordinates and a positive scale.');
  const scale = Math.max(0.2, Math.min(3, requested));
  return { scale, offset: anchor - ((anchor - offset) * scale) / current };
}
export function stackWindow(
  labelTop: number,
  direction: -1 | 1,
  offset: number,
  height: number,
  length: number,
) {
  const start = direction < 0 ? labelTop - 24 : labelTop + 55;
  const step = direction * 72;
  const lower = -offset - 80;
  const upper = height - offset + 80;
  const a = (lower - start) / step;
  const b = (upper - start) / step;
  return {
    start,
    step,
    first: Math.max(0, Math.ceil(Math.min(a, b))),
    last: Math.min(length - 1, Math.floor(Math.max(a, b))),
  };
}
