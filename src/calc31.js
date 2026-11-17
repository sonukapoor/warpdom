// Math functions as jsdom 31 declares them (black box, 31.0.1; #269 part
// B), simplified as CSS Values 4 says (10.10, simplification; 10.12,
// serialization): a calculation is read into sums of terms, a term being
// a coefficient of one unit; absolute units are converted to their
// canonical one (1in is 96px, 1turn 360deg, 500ms 0.5s); terms of one
// unit are added up; a product or quotient by a number scales the terms;
// min(), max(), clamp(), round(), mod(), rem(), abs(), sign() and the
// number functions are resolved when their arguments have one unit, and
// min() and max() keep one argument per unit otherwise. Written: calc()
// around a sum (min() and max() as themselves when they stay), terms in
// order (numbers, percentages, then units in ASCII order), a negative
// term after the first as a subtraction: calc(1px + 1em + 1px) is
// calc(1em + 2px), calc((100% - 10px) / 2) calc(50% - 5px), max(1px, 2px)
// calc(2px).
//
// simplifyMath(tok, expected): the math function token (css-values.js)
// in that form; null when the calculation is invalid (operands of
// different types, a value where an operator should be, a type other than
// expected: 'number', 'length', 'angle', 'time', 'frequency',
// 'resolution', 'flex' or null for any); undefined when it uses something
// not read here.

const CANONICAL = {
  __proto__: null,
  px: ['px', 1],
  cm: ['px', 96 / 2.54],
  mm: ['px', 96 / 25.4],
  q: ['px', 96 / 101.6],
  in: ['px', 96],
  pt: ['px', 96 / 72],
  pc: ['px', 16],
  deg: ['deg', 1],
  grad: ['deg', 0.9],
  rad: ['deg', 180 / Math.PI],
  turn: ['deg', 360],
  s: ['s', 1],
  ms: ['s', 0.001],
  hz: ['hz', 1],
  khz: ['hz', 1000],
  dppx: ['dppx', 1],
  x: ['dppx', 1],
  dpi: ['dppx', 1 / 96],
  dpcm: ['dppx', 2.54 / 96],
};
const CATEGORY = {
  __proto__: null,
  deg: 'angle',
  s: 'time',
  hz: 'frequency',
  dppx: 'resolution',
  fr: 'flex',
  '': 'number',
  '%': 'percentage',
};
const categoryOf = (unit) => CATEGORY[unit] ?? 'length';

const CONSTANTS = { __proto__: null, e: Math.E, pi: Math.PI, infinity: Infinity, '-infinity': -Infinity, nan: NaN };

class Unread extends Error {}
class Invalid extends Error {}
const UNREAD = new Unread();
const INVALID = new Invalid();

// A sum: Map unit -> coefficient ('' numbers, '%' percentages), and the
// terms that stay functions ({ fn: text }), in order.
const single = (unit, v) => ({ terms: new Map([[unit, v]]), others: [] });

// The type of a math function's result ('number', 'length',
// 'percentage', ...): null when it is invalid, undefined when it is not
// read here or is of functions only (css-values.js reads a math function
// as the grammar's type it is of).
export function mathType(tok) {
  try {
    return typeOf(mathFunction(tok)) ?? undefined;
  } catch (error) {
    if (error === INVALID) return null;
    if (error === UNREAD) return undefined;
    throw error;
  }
}

export function simplifyMath(tok, expected) {
  try {
    const sum = mathFunction(tok);
    const type = typeOf(sum);
    if (type !== null && expected !== null && type !== expected && !(type === 'percentage' && expected === 'length'))
      return null;
    return serialize(sum, true);
  } catch (error) {
    if (error === INVALID) return null;
    if (error === UNREAD) return undefined;
    throw error;
  }
}

// The sum's type: its one category besides percentages, percentage when
// it has only those, null for a sum of functions only (add() has checked
// that there is one).
function typeOf(sum) {
  let type = null;
  for (const unit of sum.terms.keys()) {
    const c = categoryOf(unit);
    if (c !== 'percentage' || type === null) type = c;
  }
  return type;
}

function mathFunction(tok) {
  const args = splitArgs(tok.args);
  switch (tok.name) {
    case 'calc':
      if (args.length !== 1) throw INVALID;
      return sumOf(args[0]);
    case 'min':
    case 'max':
      return minMax(
        tok.name,
        args.map((arg) => sumOf(arg)),
      );
    case 'clamp': {
      if (args.length !== 3) throw INVALID;
      const [lo, v, hi] = args.map((arg) => sumOf(arg));
      const a = resolved(lo);
      const b = resolved(v);
      const c = resolved(hi);
      if (a && b && c && a.unit === b.unit && b.unit === c.unit)
        return single(a.unit, Math.max(a.v, Math.min(b.v, c.v)));
      throw UNREAD;
    }
    case 'abs':
    case 'sign': {
      if (args.length !== 1) throw INVALID;
      const a = resolved(sumOf(args[0]));
      if (!a) throw UNREAD;
      return tok.name === 'abs' ? single(a.unit, Math.abs(a.v)) : single('', Math.sign(a.v));
    }
    case 'round':
    case 'mod':
    case 'rem':
      return stepped(tok.name, args);
    default: {
      const fn = NUMBER_FUNCTIONS[tok.name];
      if (fn === undefined) throw UNREAD;
      const values = args.map((arg) => resolved(sumOf(arg)));
      if (values.some((a) => !a || a.unit !== '')) throw UNREAD;
      return single('', fn(...values.map((a) => a.v)));
    }
  }
}

const NUMBER_FUNCTIONS = {
  __proto__: null,
  pow: Math.pow,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: (v, base) => (base === undefined ? Math.log(v) : Math.log(v) / Math.log(base)),
  hypot: Math.hypot,
};

const STRATEGIES = new Set(['nearest', 'up', 'down', 'to-zero']);
function stepped(name, args) {
  let strategy = 'nearest';
  if (name === 'round' && args[0].length === 1 && args[0][0].t === 'ident' && STRATEGIES.has(args[0][0].v)) {
    strategy = args[0][0].v;
    args = args.slice(1);
  }
  if (args.length !== 2) throw UNREAD;
  const a = resolved(sumOf(args[0]));
  const b = resolved(sumOf(args[1]));
  if (!a || !b || a.unit !== b.unit || b.v === 0) throw UNREAD;
  let v;
  if (name === 'mod') v = a.v - b.v * Math.floor(a.v / b.v);
  else if (name === 'rem') v = a.v - b.v * Math.trunc(a.v / b.v);
  else if (strategy === 'up') v = Math.ceil(a.v / b.v) * b.v;
  else if (strategy === 'down') v = Math.floor(a.v / b.v) * b.v;
  else if (strategy === 'to-zero') v = Math.trunc(a.v / b.v) * b.v;
  else v = Math.floor(a.v / b.v + 0.5) * b.v;
  return single(a.unit, v);
}

// min() and max(): resolved when every argument is of one canonical unit
// (or a number); else one argument per such unit (the least or greatest,
// where that one was: min(1em, 10px, 2em, 5px) is min(1em, 2em, 5px)), the
// others as they are (relative units and percentages are not compared).
const COMPARABLE = new Set(['', 'px', 'deg', 's', 'hz', 'dppx']);
function minMax(name, sums) {
  const pick = name === 'min' ? Math.min : Math.max;
  const args = [];
  const byUnit = new Map();
  for (const sum of sums) {
    const one = resolved(sum);
    if (!one || !COMPARABLE.has(one.unit)) args.push(one ?? sum);
    else if (byUnit.has(one.unit)) {
      const kept = byUnit.get(one.unit);
      if (pick(kept.v, one.v) !== kept.v) {
        args.splice(args.indexOf(kept), 1);
        byUnit.set(one.unit, one);
        args.push(one);
      }
    } else {
      byUnit.set(one.unit, one);
      args.push(one);
    }
  }
  if (args.length === 1 && args[0].terms === undefined) return single(args[0].unit, args[0].v);
  const written = args.map((arg) => serialize(arg.terms === undefined ? single(arg.unit, arg.v) : arg, false));
  return { terms: new Map(), others: [`${name}(${written.join(', ')})`] };
}

// The sum's one term ({ unit, v }) when it is one, else null.
function resolved(sum) {
  if (sum.others.length !== 0 || sum.terms.size !== 1) return null;
  const [[unit, v]] = sum.terms;
  return { unit, v };
}

function splitArgs(tokens) {
  const args = [[]];
  for (const tok of tokens) {
    if (tok.t === 'comma') args.push([]);
    else args[args.length - 1].push(tok);
  }
  if (args.some((arg) => arg.length === 0)) throw INVALID;
  return args;
}

// A sum of products: value ( [+-] value | [*/] value )*.
function sumOf(tokens) {
  let total = null;
  let i = 0;
  let sign = 1;
  while (i < tokens.length) {
    let product = valueOf(tokens[i++]);
    while (i < tokens.length && tokens[i].t === 'delim' && (tokens[i].v === '*' || tokens[i].v === '/')) {
      const op = tokens[i].v;
      if (i + 1 >= tokens.length) throw INVALID;
      const next = valueOf(tokens[i + 1]);
      product = op === '*' ? multiply(product, next) : divide(product, next);
      i += 2;
    }
    if (sign === -1) product = scale(product, -1);
    total = total === null ? product : add(total, product);
    if (i < tokens.length) {
      const tok = tokens[i];
      if (tok.t !== 'delim' || (tok.v !== '+' && tok.v !== '-') || i + 1 >= tokens.length) throw INVALID;
      sign = tok.v === '-' ? -1 : 1;
      i++;
    }
  }
  if (total === null) throw INVALID;
  return total;
}

function valueOf(tok) {
  switch (tok.t) {
    case 'number':
      return single('', tok.v);
    case 'percentage':
      return single('%', tok.v);
    case 'dimension': {
      const canonical = CANONICAL[tok.unit];
      return canonical === undefined ? single(tok.unit, tok.v) : single(canonical[0], tok.v * canonical[1]);
    }
    case 'ident': {
      const v = CONSTANTS[tok.v];
      if (v === undefined) throw INVALID;
      return single('', v);
    }
    case 'block':
      if (tok.open !== '(') throw INVALID;
      return sumOf(tok.items);
    case 'function':
      if (!MATH_NAMES.has(tok.name)) throw UNREAD;
      return mathFunction(tok);
    default:
      throw INVALID;
  }
}
const MATH_NAMES = new Set([
  'calc',
  'min',
  'max',
  'clamp',
  'round',
  'mod',
  'rem',
  'abs',
  'sign',
  'pow',
  'sqrt',
  'exp',
  'log',
  'hypot',
]);

function add(a, b) {
  const terms = new Map(a.terms);
  for (const [unit, v] of b.terms) {
    if (terms.size > 0 && categoryOf(unit) !== 'percentage') {
      for (const u of terms.keys()) {
        const c = categoryOf(u);
        if (c !== 'percentage' && c !== categoryOf(unit)) throw INVALID;
      }
    }
    terms.set(unit, (terms.get(unit) ?? 0) + v);
  }
  return { terms, others: [...a.others, ...b.others] };
}
function scale(sum, k) {
  if (sum.others.length !== 0) throw UNREAD;
  const terms = new Map();
  for (const [unit, v] of sum.terms) terms.set(unit, v * k);
  return { terms, others: [] };
}
const numberOf = (sum) => {
  const one = resolved(sum);
  return one !== null && one.unit === '' ? one.v : null;
};
function multiply(a, b) {
  const k = numberOf(b);
  if (k !== null) return scale(a, k);
  const j = numberOf(a);
  if (j !== null) return scale(b, j);
  throw INVALID;
}
function divide(a, b) {
  const k = numberOf(b);
  if (k === null) throw INVALID;
  return scale(a, 1 / k);
}

// To 6 significant digits; infinity and NaN as CSS constants.
function number(v) {
  if (v === 0) return '0';
  return String(Number(v.toPrecision(6)));
}
function term(unit, v) {
  if (Number.isNaN(v)) return unit === '' ? 'NaN' : `NaN * 1${unit}`;
  if (!Number.isFinite(v)) {
    const name = v > 0 ? 'infinity' : '-infinity';
    return unit === '' ? name : `${name} * 1${unit}`;
  }
  return number(v) + unit;
}
function rank(unit) {
  if (unit === '') return 0;
  return unit === '%' ? 1 : 2;
}
const ORDER = (a, b) => rank(a) - rank(b) || (a < b ? -1 : Number(a > b));

// A sum written: in calc() when top (a lone min() or max() as itself).
function serialize(sum, top) {
  const units = [...sum.terms.keys()].sort(ORDER);
  const parts = units.map((unit) => ({
    text: term(unit, Math.abs(sum.terms.get(unit))),
    negative: sum.terms.get(unit) < 0,
  }));
  for (const other of sum.others) parts.push({ text: other, negative: false });
  if (top && parts.length === 1 && sum.others.length === 1) return sum.others[0];
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const { text, negative } = parts[i];
    if (i === 0) out = negative ? `-${text}` : text;
    else out += negative ? ` - ${text}` : ` + ${text}`;
  }
  return top ? `calc(${out})` : out;
}
