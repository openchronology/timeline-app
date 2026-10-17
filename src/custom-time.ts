// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The bounded interpreter behind custom time printers/parsers and plugin render scripts: a
// tokenizer, a recursive-descent compiler to a small expression tree, and an evaluator with
// operation budgets (docs/time-presentation.md#custom-javascript-and-typescript-subset).
import { Rational as Q } from 'rational-ordered-map';
import { parseTimestamp, printTimestamp } from './calendar.js';
import { fixedDecimal, parseNumber, printNumber } from './numeric.js';
import { validateContext, unitsPerPixel } from './view-context.js';
import type { PresentationContext } from './view-context.js';

// This is a small language interpreter, not a JavaScript execution sandbox.
// No source text is passed to eval, Function, a browser worker, or the server runtime.
/**
 * Every value a script can hold: text, a JavaScript number (only small option literals such
 * as digit counts; exact numbers are rationals), a boolean, or an exact rational.
 */
export type ScriptValue = string | number | boolean | Q;
type Value = ScriptValue;
/** A compiled expression: a literal, a local variable, an `api.*` call, an operator, or `?:`. */
type Expr =
  | { kind: 'literal'; value: Value }
  | { kind: 'name'; name: string }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'choice'; test: Expr; yes: Expr; no: Expr };
/** A compiled function: its first parameter's name, its `const` locals in order, and its return. */
type Body = { parameter: string; locals: { name: string; value: Expr }[]; result: Expr };
/**
 * A token. String and number literals have `text: 'literal'` and `literal: true`, so a
 * string whose contents look like a keyword or operator is never mistaken for one.
 */
type Token = { text: string; value?: string | number; literal?: boolean };
/**
 * The time API: each method's allowed argument counts. Checked when compiling, so a script
 * that calls an unknown method or passes the wrong number of arguments never runs.
 */
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

/**
 * Splits source into tokens, skipping whitespace, line comments and block comments. Strings
 * use single or double quotes with only the escapes \n \r \t \\ \" \'; number literals
 * become JavaScript numbers of magnitude at most a million. Throws on anything else, and
 * past 16,384 characters, 4,096 tokens or a 2,048-character string.
 */
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
      // Three-character operators are tried before their two- and one-character prefixes.
      // A number may carry a sign, so `x +1` reads as `x` followed by the literal `+1`
      // (a syntax error); `x + 1` is concatenation. There is no subtraction operator.
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

/** A custom presentation's functions: print and parse, and how it writes time differences. */
const FUNCTIONS = ['print', 'parse', 'printDifference', 'parseDifference'];
/**
 * Parses source into its function bodies by recursive descent. A program is a sequence of
 * `function name(value[: T], api[: TimeAPI]) [: T] { const x = …; … return …; }` with no
 * other statements. For a time presentation the names are print and parse (required) and
 * printDifference and parseDifference (optional); for a plugin (`plugin`) only render.
 * Type annotations are checked against the function's role but have no other effect.
 * `methods` lists the `api.*` methods allowed and their arities. Variables must be declared
 * before use and can't be reassigned, so evaluation needs no scope analysis. Throws a
 * readable error on any syntax it does not accept and past 1,024 expression nodes or 32
 * nesting levels.
 */
function compile(source: string, plugin = false, methods = arities): Map<string, Body> {
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
  /**
   * Parses one expression by precedence climbing: a primary (literal, `true`/`false`,
   * parenthesised expression, `api.method(…)` call or declared local) followed by binary
   * operators binding at least `minimum`. Each right operand is parsed with a minimum one
   * above its operator, which makes the operators left-associative. `cond ? a : b` is only
   * taken at the outermost level (minimum 0), so it binds loosest, and the `: b` branch,
   * parsed at that level too, makes chains right-associative. `names` are the locals in
   * scope.
   */
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
        if (!Object.hasOwn(methods, method)) throw new Error(`Unavailable API method: ${method}.`);
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
        if (!methods[method].includes(args.length))
          throw new Error(`Wrong argument count for api.${method}.`);
        left = { kind: 'call', name: method, args };
      } else {
        if (!names.has(name)) throw new Error(`Unknown local variable: ${name}.`);
        left = { kind: 'name', name };
      }
    }
    // `+` is text concatenation only; exact arithmetic goes through api.add and the like.
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
    if (!(plugin ? ['render'] : FUNCTIONS).includes(name) || bodies.has(name))
      throw new Error(
        plugin
          ? 'Define render exactly once.'
          : 'Define print and parse exactly once, and optionally printDifference and parseDifference.',
      );
    // Printers take a Rational and return a string; parsers the reverse; render takes a
    // string (always empty) and returns a string.
    const printing = name === 'print' || name === 'printDifference';
    take('(');
    const parameter = identifier();
    if (['api', 'true', 'false'].includes(parameter)) throw new Error('Invalid parameter name.');
    annotation(plugin ? ['string'] : printing ? ['Rational'] : ['string']);
    take(',');
    take('api');
    annotation(plugin ? ['PluginAPI'] : ['TimeAPI']);
    take(')');
    annotation(plugin || printing ? ['string'] : ['Rational']);
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
  if (plugin ? !bodies.has('render') : !bodies.has('print') || !bodies.has('parse'))
    throw new Error(
      plugin ? 'The render function is required.' : 'Both print and parse functions are required.',
    );
  return bodies;
}

/** The number of bits in a bigint's magnitude. */
const bitLength = (n: bigint) => (n < 0n ? -n : n).toString(2).length;
/**
 * Refuses a single value too large to keep computing with: text over 2,048 characters, or a
 * rational whose numerator or denominator exceeds 4,096 bits (repeated multiplication can
 * otherwise grow exact rationals without limit). Returns the value unchanged.
 */
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
// Runtime type checks: the language is dynamically typed, so each API method checks its
// arguments and throws a readable error on the wrong kind.
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
/** A string index for slice: an integer within ±2,048 (negative counts from the end). */
function index(value: Value): number {
  const result = number(value);
  if (!Number.isInteger(result) || Math.abs(result) > 2048)
    throw new Error('String indices must be integers between -2048 and 2048.');
  return result;
}
/**
 * Runs one time-API method on evaluated arguments. `context` describes the viewport for
 * printers and parsers called from the editor (validated by the caller); the view methods
 * throw without it, while `hasView` and `purpose` let a script check first. Pure: no method
 * touches the DOM, the network or anything outside its arguments.
 */
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
      // labelResolution: the time between labels, exactly unitsPerPixel × spacing, with the
      // spacing defaulting to 115 pixels for ruler labels and 6 otherwise.
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
      // A huge exponent would build an enormous exact rational before any budget is checked.
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
      // First occurrence only, and through a function so `$&`-style patterns in the
      // replacement are not interpreted.
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

/**
 * Evaluates a compiled function on one argument. `invoke` runs API calls (the time API by
 * default; plugin scripts supply their own). Every evaluated node counts against the
 * budgets: 4,096 steps, 64 levels of nesting, 128 API calls, 32,768 characters of text
 * produced and 65,536 bits of rational components produced, in total, plus the per-value
 * limits of `bounded`. They bound work, not time, and throw when exceeded. Arguments are
 * evaluated eagerly, but only the chosen branch of `?:` is.
 */
function run(body: Body, argument: Value, context?: PresentationContext, invoke = call): Value {
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
        result = invoke(
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
          // Comparisons only between two values of the same primitive type; rationals are
          // objects, so `===` would compare identity, and must use api.compare.
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

/**
 * Compiles a custom time presentation into its printer and parser. The printer turns a
 * stored rational time into text, the parser text into a rational; both receive the
 * (validated) viewport context when there is one. Throws on a compile error; the returned
 * functions throw when a script fails, exceeds a budget or returns the wrong type, and the
 * callers fall back to showing the exact coordinate or keeping the previous input.
 */
export function compileCustom(source: string): {
  print(time: Q, context?: PresentationContext): string;
  parse(text: string, context?: PresentationContext): Q;
} {
  const program = compile(source);
  return {
    print: (time, context) => string(run(program.get('print')!, time, validateContext(context))),
    parse: (text, context) => rational(run(program.get('parse')!, text, validateContext(context))),
  };
}

/**
 * A custom presentation's optional difference functions, which work in stored coordinates.
 * They run with no view context. Each is present only when the source defines it; without
 * them the caller prints and reads differences as exact stored coordinates.
 */
export function compileCustomDifference(source: string): {
  print?(difference: Q): string;
  parse?(text: string): Q;
} {
  const program = compile(source),
    print = program.get('printDifference'),
    parse = program.get('parseDifference');
  return {
    ...(print ? { print: (difference: Q) => string(run(print, difference)) } : {}),
    ...(parse ? { parse: (text: string) => rational(run(parse, text)) } : {}),
  };
}

/** The starter source offered for a new custom presentation: time in seconds shown as minutes. */
export const CUSTOM_EXAMPLE = `function print(time: Rational, api: TimeAPI): string {
  const minutes = api.div(time, api.rational("60"));
  return api.decimal(minutes, 6) + " minutes";
}
function parse(text: string, api: TimeAPI): Rational {
  const minutes = api.parseNumber(api.stripSuffix(text, " minutes"));
  return api.mul(minutes, api.rational("60"));
}`;

/**
 * Compile only; no user source executes during manifest validation.
 *
 * Compiles a plugin's `render` function with the plugin API (docs/plugins.md). The returned
 * runner evaluates it with an empty string as its parameter: the string helpers run here,
 * every other method (`get`, `shape`, `merge` …) is answered by the caller's `invoke`, which
 * holds the moment and builds the rendering effects. The runner returns render's string
 * result and throws as `run` does.
 */
export function compilePluginScript(source: string) {
  const methods = {
    get: [1],
    shape: [1],
    size: [1],
    color: [1],
    icon: [1],
    card: [0],
    expand: [0],
    merge: [2],
    none: [0],
    trim: [1],
    upper: [1],
    lower: [1],
    startsWith: [2],
    endsWith: [2],
    slice: [2, 3],
    replace: [3],
  };
  const body = compile(source, true, methods).get('render')!;
  return (invoke: (name: string, args: ScriptValue[]) => ScriptValue): string =>
    string(
      run(body, '', undefined, (name, args) => {
        if (['trim', 'upper', 'lower', 'startsWith', 'endsWith', 'slice', 'replace'].includes(name))
          return call(name, args);
        return invoke(name, args);
      }),
    );
}
