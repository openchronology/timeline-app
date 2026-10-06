/** Child coordinates are presentation rows, independent of rational time. */
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
