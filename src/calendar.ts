// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
const floorDiv = (n: bigint, d: bigint): bigint => n / d - (n < 0n && n % d !== 0n ? 1n : 0n);
export function dayNumber(year: bigint, month: bigint, day: bigint): bigint {
  const y = year - (month <= 2n ? 1n : 0n),
    era = floorDiv(y, 400n),
    yoe = y - era * 400n,
    mp = month + (month > 2n ? -3n : 9n);
  return (
    era * 146097n + yoe * 365n + yoe / 4n - yoe / 100n + (153n * mp + 2n) / 5n + day - 1n - 719468n
  );
}
export function dateParts(days: bigint): [bigint, bigint, bigint] {
  const z = days + 719468n,
    era = floorDiv(z, 146097n),
    doe = z - era * 146097n;
  const yoe = (doe - doe / 1460n + doe / 36524n - doe / 146096n) / 365n,
    y = yoe + era * 400n;
  const doy = doe - (365n * yoe + yoe / 4n - yoe / 100n),
    mp = (5n * doy + 2n) / 153n;
  const day = doy - (153n * mp + 2n) / 5n + 1n,
    month = mp + (mp < 10n ? 3n : -9n);
  return [y + (month <= 2n ? 1n : 0n), month, day];
}
/** Cosmetic preset: proleptic Gregorian dates, seconds from the Unix epoch, fixed zone offsets. */
export function parseTimestamp(text: string): Q {
  const m =
    /^([+-]?\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+|\{\+[0-9]+\/[1-9][0-9]*\})?(Z|[+-]\d{2}:\d{2})$/.exec(
      text,
    );
  if (!m) throw new Error('Expected a timestamp with Z or an explicit ±HH:MM offset.');
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(BigInt);
  if (
    month < 1n ||
    month > 12n ||
    day < 1n ||
    day > 31n ||
    hour > 23n ||
    minute > 59n ||
    second > 59n
  )
    throw new Error('Invalid calendar date or clock time.');
  const days = dayNumber(year, month, day),
    back = dateParts(days);
  if (back[0] !== year || back[1] !== month || back[2] !== day)
    throw new Error('Invalid day for this month.');
  let offset = 0n;
  if (m[8] !== 'Z') {
    const [h, min] = m[8].slice(1).split(':').map(BigInt);
    if (h > 23n || min > 59n) throw new Error('Invalid timezone offset.');
    offset = (h * 3600n + min * 60n) * (m[8][0] === '-' ? -1n : 1n);
  }
  let fraction = Q.zero;
  if (m[7]?.startsWith('.')) fraction = Q.parseDecimal('0' + m[7]);
  else if (m[7]) fraction = Q.parse(m[7].slice(2, -1));
  if (fraction.compare(Q.one) >= 0) throw new Error('Fractional seconds must be below one.');
  return Q.from(days * 86400n + hour * 3600n + minute * 60n + second - offset).add(fraction);
}
export function printTimestamp(time: Q, offsetMinutes = 0): string {
  if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 1439)
    throw new Error('Invalid timezone offset.');
  const shifted = time.add(Q.from(BigInt(offsetMinutes) * 60n)),
    seconds = shifted.floor().numerator;
  const days = floorDiv(seconds, 86400n),
    clock = seconds - days * 86400n,
    [year, month, day] = dateParts(days);
  const pad = (n: bigint) => n.toString().padStart(2, '0');
  const y =
    year >= 0n ? year.toString().padStart(4, '0') : '-' + (-year).toString().padStart(4, '0');
  const fraction = shifted.sub(Q.from(seconds));
  let suffix = '';
  if (!fraction.equals(Q.zero)) {
    let denominator = fraction.denominator,
      twos = 0,
      fives = 0;
    while (denominator % 2n === 0n) {
      denominator /= 2n;
      twos++;
    }
    while (denominator % 5n === 0n) {
      denominator /= 5n;
      fives++;
    }
    const digits = Math.max(twos, fives);
    if (denominator === 1n && digits <= 1000) {
      suffix =
        '.' +
        ((fraction.numerator * 10n ** BigInt(digits)) / fraction.denominator)
          .toString()
          .padStart(digits, '0')
          .replace(/0+$/, '');
    } else suffix = '{+' + fraction.toString() + '}';
  }
  const zone =
    offsetMinutes === 0
      ? 'Z'
      : (offsetMinutes < 0 ? '-' : '+') +
        pad(BigInt(Math.floor(Math.abs(offsetMinutes) / 60))) +
        ':' +
        pad(BigInt(Math.abs(offsetMinutes) % 60));
  return `${y}-${pad(month)}-${pad(day)}T${pad(clock / 3600n)}:${pad((clock % 3600n) / 60n)}:${pad(clock % 60n)}${suffix}${zone}`;
}
