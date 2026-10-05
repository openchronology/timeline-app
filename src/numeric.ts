import { Rational as Q } from 'rational-ordered-map';

/** Parse scientific notation without ever passing the value through binary floating point. */
export function parseNumber(text: string): Q {
  const value = text.trim();
  if (value.includes('/')) return Q.parse(value);
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) throw new Error('Expected a rational, decimal, or scientific number.');
  const exponent = Number(match[2] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000)
    throw new Error('Scientific exponents must be between -10000 and 10000.');
  const base = Q.parseDecimal(match[1]);
  return exponent >= 0
    ? base.mul(Q.from(10n ** BigInt(exponent)))
    : base.div(Q.from(10n ** BigInt(-exponent)));
}

export function decimalExponent(value: Q): number {
  const n = value.numerator < 0n ? -value.numerator : value.numerator;
  if (n === 0n) return 0;
  const d = value.denominator;
  let exponent = n.toString().length - d.toString().length;
  if (exponent >= 0 ? n < d * 10n ** BigInt(exponent) : n * 10n ** BigInt(-exponent) < d)
    exponent--;
  return exponent;
}

function rounded(value: Q, places: number): bigint {
  const n = value.numerator < 0n ? -value.numerator : value.numerator;
  const numerator = places >= 0 ? n * 10n ** BigInt(places) : n;
  const denominator = places >= 0 ? value.denominator : value.denominator * 10n ** BigInt(-places);
  return (2n * numerator + denominator) / (2n * denominator);
}

export function fixedDecimal(value: Q, places = 6): string {
  if (!Number.isInteger(places) || places < 0 || places > 30)
    throw new Error('Decimal places must be between 0 and 30.');
  const digits = rounded(value, places)
    .toString()
    .padStart(places + 1, '0');
  const result = places ? digits.slice(0, -places) + '.' + digits.slice(-places) : digits;
  return (value.numerator < 0n && /[1-9]/.test(result) ? '-' : '') + result;
}

/** Significant decimal digits, rounded half away from zero; enormous values stay printable. */
export function printNumber(value: Q, digits = 6, scientific = false): string {
  if (!Number.isInteger(digits) || digits < 1 || digits > 30)
    throw new Error('Significant digits must be between 1 and 30.');
  if (value.numerator === 0n) return scientific ? '0e+0' : '0';
  let exponent = decimalExponent(value);
  let mantissa = rounded(value, digits - 1 - exponent).toString();
  if (mantissa.length > digits) {
    mantissa = mantissa.slice(0, -1);
    exponent++;
  }
  mantissa = mantissa.padStart(digits, '0');
  const sign = value.numerator < 0n ? '-' : '';
  if (scientific || exponent < -6 || exponent >= 21) {
    const tail = mantissa.slice(1).replace(/0+$/, '');
    return `${sign}${mantissa[0]}${tail ? '.' + tail : ''}e${exponent >= 0 ? '+' : ''}${exponent}`;
  }
  const point = exponent + 1;
  let result =
    point <= 0
      ? '0.' + '0'.repeat(-point) + mantissa
      : point >= mantissa.length
        ? mantissa + '0'.repeat(point - mantissa.length)
        : mantissa.slice(0, point) + '.' + mantissa.slice(point);
  if (result.includes('.')) result = result.replace(/0+$/, '').replace(/\.$/, '');
  return sign + result;
}
