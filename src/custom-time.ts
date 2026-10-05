import { Rational as Q } from 'rational-ordered-map';
import { parseTimestamp, printTimestamp } from './calendar.js';
import { fixedDecimal, parseNumber, printNumber } from './numeric.js';
import { validateContext, unitsPerPixel } from './view-context.js';
import type { PresentationContext } from './view-context.js';

// This is a small language interpreter, not a JavaScript execution sandbox.
// No source text is passed to eval, Function, a browser worker, or the server runtime.
type Value = string | number | boolean | Q;
type Expr =
  | { kind: 'literal'; value: Value }
  | { kind: 'name'; name: string }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'choice'; test: Expr; yes: Expr; no: Expr };
type Body = { parameter: string; locals: { name: string; value: Expr }[]; result: Expr };
type Token = { text: string; value?: string | number; literal?: boolean };
const arities: Readonly<Record<string, readonly number[]>> = Object.freeze({
  rational: [1],
  parseNumber: [1],
  exact: [1],
  add: [2],
  sub: [2],
  mul: [2],
  div: [2],
  neg: [1],
  abs: [1],
  compare: [2],
  decimal: [1, 2],
  scientific: [1, 2],
  timestamp: [1, 2],
  parseTimestamp: [1],
  stripSuffix: [2],
  trim: [1],
  slice: [2, 3],
  replace: [3],
  upper: [1],
  lower: [1],
  startsWith: [2],
  endsWith: [2],
  hasView: [0],
  viewLeft: [0],
  viewRight: [0],
  viewSpan: [0],
  viewWidth: [0],
  unitsPerPixel: [0],
  labelResolution: [0],
  purpose: [0],
});

function tokenize(source: string): Token[] {
  if (source.length > 16384) throw new Error('Custom source is limited to 16,384 characters.');
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    if (/\s/.test(source[at])) {
      at++;
      continue;
    }
    if (source.startsWith('//', at)) {
      const end = source.indexOf('\n', at);
      at = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', at)) {
      const end = source.indexOf('*/', at + 2);
      if (end < 0) throw new Error('Unclosed comment.');
      at = end + 2;
      continue;
    }
    const quote = source[at];
    if (quote === '"' || quote === "'") {
      at++;
      let value = '',
        closed = false;
      while (at < source.length) {
        const char = source[at++];
        if (char === quote) {
          closed = true;
          break;
        }
        if (char === '\n' || char === '\r') throw new Error('Use escaped newlines in strings.');
        if (char === '\\') {
          const escape = source[at++];
          const escapes: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            '\\': '\\',
            '"': '"',
            "'": "'",
          };
          if (!Object.hasOwn(escapes, escape)) throw new Error('Unsupported string escape.');
          value += escapes[escape];
        } else value += char;
      }
      if (!closed || value.length > 2048) throw new Error('Unclosed or oversized string.');
      tokens.push({ text: 'literal', value, literal: true });
    } else {
      const token =
        /^(?:===|!==|<=|>=|[A-Za-z_$][A-Za-z0-9_$]*|[+-]?\d+(?:\.\d+)?|[{}(),;:.?+<>=])/.exec(
          source.slice(at),
        )?.[0];
      if (!token) throw new Error(`Unsupported syntax at character ${at + 1}.`);
      at += token.length;
      if (/^[+-]?\d/.test(token)) {
        const value = Number(token);
        if (!Number.isFinite(value) || Math.abs(value) > 1000000)
          throw new Error('Use api.rational for large numeric literals.');
        tokens.push({ text: 'literal', value, literal: true });
      } else tokens.push({ text: token });
    }
    if (tokens.length > 4096) throw new Error('Custom source has too many tokens.');
  }
  return tokens;
}

function compile(source: string): { print: Body; parse: Body } {
  const tokens = tokenize(source);
  let at = 0,
    nodes = 0;
  const peek = () => tokens[at]?.text;
  const take = (expected: string) => {
    if (peek() !== expected)
      throw new Error(`Expected ${expected}, found ${peek() ?? 'end of source'}.`);
    at++;
  };
  const identifier = () => {
    const name = peek();
    if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || tokens[at].literal)
      throw new Error('Expected an identifier.');
    at++;
    return name;
  };
  const annotation = (allowed: string[]) => {
    if (peek() === ':') {
      take(':');
      if (!allowed.includes(identifier())) throw new Error('Unsupported type annotation.');
    }
  };
  function expression(names: Set<string>, depth = 0, minimum = 0): Expr {
    if (depth > 32 || ++nodes > 1024) throw new Error('Custom expression is too complex.');
    let left: Expr;
    const token = tokens[at];
    if (token?.literal) {
      at++;
      left = { kind: 'literal', value: token.value! };
    } else if (peek() === 'true' || peek() === 'false') {
      left = { kind: 'literal', value: peek() === 'true' };
      at++;
    } else if (peek() === '(') {
      take('(');
      left = expression(names, depth + 1);
      take(')');
    } else {
      const name = identifier();
      if (name === 'api') {
        take('.');
        const method = identifier();
        if (!Object.hasOwn(arities, method)) throw new Error(`Unavailable API method: ${method}.`);
        take('(');
        const args: Expr[] = [];
        if (peek() !== ')') {
          do {
            args.push(expression(names, depth + 1));
            if (peek() !== ',') break;
            take(',');
          } while (true);
        }
        take(')');
        if (!arities[method].includes(args.length))
          throw new Error(`Wrong argument count for api.${method}.`);
        left = { kind: 'call', name: method, args };
      } else {
        if (!names.has(name)) throw new Error(`Unknown local variable: ${name}.`);
        left = { kind: 'name', name };
      }
    }
    const precedence: Record<string, number> = {
      '===': 1,
      '!==': 1,
      '<': 2,
      '>': 2,
      '<=': 2,
      '>=': 2,
      '+': 3,
    };
    while (peek() && Object.hasOwn(precedence, peek()!) && precedence[peek()!] >= minimum) {
      const op = peek()!;
      at++;
      left = { kind: 'binary', op, left, right: expression(names, depth + 1, precedence[op] + 1) };
    }
    if (minimum === 0 && peek() === '?') {
      take('?');
      const yes = expression(names, depth + 1);
      take(':');
      left = { kind: 'choice', test: left, yes, no: expression(names, depth + 1) };
    }
    return left;
  }
  const bodies = new Map<string, Body>();
  while (at < tokens.length) {
    take('function');
    const name = identifier();
    if (!['print', 'parse'].includes(name) || bodies.has(name))
      throw new Error('Define print and parse exactly once.');
    take('(');
    const parameter = identifier();
    if (['api', 'true', 'false'].includes(parameter)) throw new Error('Invalid parameter name.');
    annotation(name === 'print' ? ['Rational'] : ['string']);
    take(',');
    take('api');
    annotation(['TimeAPI']);
    take(')');
    annotation(name === 'print' ? ['string'] : ['Rational']);
    take('{');
    const names = new Set([parameter]);
    const locals: Body['locals'] = [];
    while (peek() === 'const') {
      take('const');
      const local = identifier();
      if (names.has(local) || ['api', 'true', 'false'].includes(local))
        throw new Error('Duplicate or reserved local variable.');
      annotation(['Rational', 'string', 'number', 'boolean']);
      // Assignment is only allowed in a const declaration; not an expression operator.
      take('=');
      const value = expression(names);
      take(';');
      names.add(local);
      locals.push({ name: local, value });
      if (locals.length > 128) throw new Error('Too many local variables.');
    }
    take('return');
    const result = expression(names);
    take(';');
    take('}');
    bodies.set(name, { parameter, locals, result });
  }
  if (!bodies.has('print') || !bodies.has('parse'))
    throw new Error('Both print and parse functions are required.');
  return { print: bodies.get('print')!, parse: bodies.get('parse')! };
}

const bitLength = (n: bigint) => (n < 0n ? -n : n).toString(2).length;
function bounded(value: Value): Value {
  if (typeof value === 'string' && value.length > 2048)
    throw new Error('Custom text exceeds 2048 characters.');
  if (
    value instanceof Q &&
    (bitLength(value.numerator) > 4096 || bitLength(value.denominator) > 4096)
  )
    throw new Error(
      'Custom arithmetic exceeds the 4096-bit component limit. Use a built-in formatter for this time.',
    );
  return value;
}
function string(value: Value): string {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return value;
}
function rational(value: Value): Q {
  if (!(value instanceof Q)) throw new Error('Expected an exact rational.');
  return value;
}
function number(value: Value): number {
  if (typeof value !== 'number') throw new Error('Expected a numeric option.');
  return value;
}
function index(value: Value): number {
  const result = number(value);
  if (!Number.isInteger(result) || Math.abs(result) > 2048)
    throw new Error('String indices must be integers between -2048 and 2048.');
  return result;
}
function call(name: string, args: Value[], context?: PresentationContext): Value {
  const a = args[0],
    b = args[1];
  if (name === 'hasView') return context !== undefined;
  if (name === 'purpose') return context?.purpose ?? 'input';
  if (
    ['viewLeft', 'viewRight', 'viewSpan', 'viewWidth', 'unitsPerPixel', 'labelResolution'].includes(
      name,
    )
  ) {
    if (!context) throw new Error('This formatter call has no viewport context.');
    switch (name) {
      case 'viewLeft':
        return context.left;
      case 'viewRight':
        return context.left.add(context.span);
      case 'viewSpan':
        return context.span;
      case 'viewWidth':
        return context.widthPixels;
      case 'unitsPerPixel':
        return unitsPerPixel(context);
      default:
        return unitsPerPixel(context).mul(
          Q.parseDecimal(
            (context.spacingPixels ?? (context.purpose === 'axis' ? 115 : 6)).toString(),
          ),
        );
    }
  }
  switch (name) {
    case 'rational':
      return Q.parse(string(a));
    case 'parseNumber': {
      const text = string(a);
      const exponent = /[eE]([+-]?\d+)$/.exec(text);
      if (exponent && Math.abs(Number(exponent[1])) > 1000)
        throw new Error('Custom exponent exceeds 1000.');
      return parseNumber(text);
    }
    case 'exact':
      return rational(a).toString();
    case 'add':
      return rational(a).add(rational(b));
    case 'sub':
      return rational(a).sub(rational(b));
    case 'mul':
      return rational(a).mul(rational(b));
    case 'div':
      return rational(a).div(rational(b));
    case 'neg':
      return rational(a).neg();
    case 'abs':
      return rational(a).abs();
    case 'compare':
      return rational(a).compare(rational(b));
    case 'decimal':
      return fixedDecimal(rational(a), b === undefined ? 6 : number(b));
    case 'scientific':
      return printNumber(rational(a), b === undefined ? 6 : number(b), true);
    case 'timestamp':
      return printTimestamp(rational(a), b === undefined ? 0 : number(b));
    case 'parseTimestamp':
      return parseTimestamp(string(a));
    case 'trim':
      return string(a).trim();
    case 'slice':
      return string(a).slice(index(b), args[2] === undefined ? undefined : index(args[2]));
    case 'replace': {
      const text = string(a),
        from = string(b),
        to = string(args[2]);
      return text.replace(from, () => to);
    }
    case 'upper':
      return string(a).toUpperCase();
    case 'lower':
      return string(a).toLowerCase();
    case 'startsWith':
      return string(a).startsWith(string(b));
    case 'endsWith':
      return string(a).endsWith(string(b));
    case 'stripSuffix': {
      const text = string(a).trim(),
        suffix = string(b);
      if (!text.endsWith(suffix)) throw new Error(`Expected suffix ${suffix}.`);
      return suffix ? text.slice(0, -suffix.length).trim() : text;
    }
    default:
      throw new Error('Unavailable API method.');
  }
}

function run(body: Body, argument: Value, context?: PresentationContext): Value {
  const locals = new Map<string, Value>([[body.parameter, bounded(argument)]]);
  let steps = 0,
    textCost = 0,
    rationalCost = 0,
    calls = 0;
  function evaluate(expr: Expr, depth = 0): Value {
    if (++steps > 4096 || depth > 64) throw new Error('Custom execution budget exceeded.');
    let result: Value;
    switch (expr.kind) {
      case 'literal':
        result = expr.value;
        break;
      case 'name':
        result = locals.get(expr.name)!;
        break;
      case 'call':
        if (++calls > 128) throw new Error('Custom API call budget exceeded.');
        result = call(
          expr.name,
          expr.args.map((arg) => evaluate(arg, depth + 1)),
          context,
        );
        break;
      case 'choice': {
        const test = evaluate(expr.test, depth + 1);
        if (typeof test !== 'boolean') throw new Error('Conditions must be boolean.');
        result = evaluate(test ? expr.yes : expr.no, depth + 1);
        break;
      }
      case 'binary': {
        const left = evaluate(expr.left, depth + 1),
          right = evaluate(expr.right, depth + 1);
        if (expr.op === '+') result = string(left) + string(right);
        else {
          if (left instanceof Q || right instanceof Q || typeof left !== typeof right)
            throw new Error('Use api.compare for rational comparisons.');
          switch (expr.op) {
            case '===':
              result = left === right;
              break;
            case '!==':
              result = left !== right;
              break;
            case '<':
              result = left < right;
              break;
            case '>':
              result = left > right;
              break;
            case '<=':
              result = left <= right;
              break;
            default:
              result = left >= right;
          }
        }
        break;
      }
    }
    bounded(result);
    if (result instanceof Q)
      rationalCost += bitLength(result.numerator) + bitLength(result.denominator);
    if (rationalCost > 65536) throw new Error('Custom arithmetic budget exceeded.');
    if (typeof result === 'string') textCost += result.length;
    if (textCost > 32768) throw new Error('Custom text allocation budget exceeded.');
    return result;
  }
  for (const local of body.locals) locals.set(local.name, evaluate(local.value));
  return evaluate(body.result);
}

export function compileCustom(source: string): {
  print(time: Q, context?: PresentationContext): string;
  parse(text: string, context?: PresentationContext): Q;
} {
  const program = compile(source);
  return {
    print: (time, context) => string(run(program.print, time, validateContext(context))),
    parse: (text, context) => rational(run(program.parse, text, validateContext(context))),
  };
}

export const CUSTOM_EXAMPLE = `function print(time: Rational, api: TimeAPI): string {
  const minutes = api.div(time, api.rational("60"));
  return api.decimal(minutes, 6) + " minutes";
}
function parse(text: string, api: TimeAPI): Rational {
  const minutes = api.parseNumber(api.stripSuffix(text, " minutes"));
  return api.mul(minutes, api.rational("60"));
}`;
