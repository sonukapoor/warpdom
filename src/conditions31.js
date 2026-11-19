// Conditions as jsdom 31 has them: media queries, then @supports
// conditions, in one module (each module adds to the load time).
//
// Media queries as jsdom 31 reads, writes and evaluates them (black box,
// 31.0.1; #269 part E4), written from Media Queries 4 and 5: a query is a
// media type with an optional condition, or a condition; a condition is
// not, and or or over parenthesized conditions, media features and
// "general enclosed" text (anything else in parentheses, or a function),
// which evaluates to unknown. Unknown is false at the end, and stays
// unknown under not (not (foo: bar) is false).
//
// jsdom 31 evaluates a 1024 x 768 screen at 1dppx with 8 bits per color,
// a fine pointer that hovers, scripting, no preferences (light, no reduced
// motion, contrast, transparency or data), the browser display mode; the
// device's width and height are 0 (device-aspect-ratio is true alone,
// matches 0 / 0 only). Lengths: 1em, 1rem, 1ch and 1ic are 16px, 1ex 8px,
// 1lh 18.4px, 1cap 14.48px, the viewport and container units from the
// 1024 x 768 window.
//
// Written: a known feature with a valid value as "name: value" (a range
// as "a < name <= b"), lowercase, the value canonical (0 is 0px, .5em
// 0.5em, 1E2px 100px, numbers to 6 significant digits, a ratio as a / b, a
// math function simplified: calc(100px + 1px) is calc(101px)); anything
// else as written, trimmed, with its whitespace collapsed ((hover:BOGUS));
// all and a condition as the condition.
// A query that does not parse is "not all".

import { sixDigits, absoluteLength } from './lengths.js';
import { simplifyMath, mathValue } from './calc31.js';
import { tokenizeValue } from './css-values.js';

const VIEWPORT = { width: 1024, height: 768 };

// Range features: [type, value].
const RANGE = {
  __proto__: null,
  width: ['length', VIEWPORT.width],
  height: ['length', VIEWPORT.height],
  'device-width': ['length', 0],
  'device-height': ['length', 0],
  'aspect-ratio': ['ratio', VIEWPORT.width / VIEWPORT.height],
  'device-aspect-ratio': ['ratio', NaN],
  resolution: ['resolution', 1],
  color: ['integer', 8],
  'color-index': ['integer', 0],
  monochrome: ['integer', 0],
};
// Discrete features: [values, value].
const DISCRETE = {
  __proto__: null,
  orientation: [['portrait', 'landscape'], 'landscape'],
  scan: [['interlace', 'progressive'], 'progressive'],
  grid: [['0', '1'], '0'],
  update: [['none', 'slow', 'fast'], 'fast'],
  'overflow-block': [['none', 'scroll', 'paged'], 'scroll'],
  'overflow-inline': [['none', 'scroll'], 'scroll'],
  'color-gamut': [['srgb', 'p3', 'rec2020'], 'srgb'],
  'dynamic-range': [['standard', 'high'], 'standard'],
  'video-dynamic-range': [['standard', 'high'], 'standard'],
  'display-mode': [['browser', 'standalone', 'fullscreen', 'minimal-ui', 'picture-in-picture'], 'browser'],
  'forced-colors': [['none', 'active'], 'none'],
  'inverted-colors': [['none', 'inverted'], 'none'],
  pointer: [['none', 'coarse', 'fine'], 'fine'],
  'any-pointer': [['none', 'coarse', 'fine'], 'fine'],
  hover: [['none', 'hover'], 'hover'],
  'any-hover': [['none', 'hover'], 'hover'],
  'prefers-color-scheme': [['light', 'dark'], 'light'],
  'prefers-reduced-motion': [['no-preference', 'reduce'], 'no-preference'],
  'prefers-contrast': [['no-preference', 'more', 'less', 'custom'], 'no-preference'],
  'prefers-reduced-transparency': [['no-preference', 'reduce'], 'no-preference'],
  'prefers-reduced-data': [['no-preference', 'reduce'], 'no-preference'],
  scripting: [['none', 'initial-only', 'enabled'], 'enabled'],
  'environment-blending': [['opaque', 'additive'], 'opaque'],
  'nav-controls': [['none', 'back'], 'back'],
};
const MATCHING_TYPES = new Set(['all', 'screen']);
const RESERVED = new Set(['and', 'not', 'only', 'or', 'layer']);
const OFF = new Set(['none', 'no-preference', '0']);

// --- components ------------------------------------------------------------------------

// A query's top-level components: { ident }, { group: inner text } for
// (...), { fn: text } for name(...); null when something else is there.
// (escapes included: \73 creen is screen; a hex escape reads its digits
// one way only, so a long run of them does not backtrack)
const IDENT =
  /^-?(?:[a-zA-Z_]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])(?:[a-zA-Z0-9_-]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])*/;
function components(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
      i++;
      continue;
    }
    if (c === '(') {
      const end = closing(text, i);
      if (end < 0 || strayCloser(text, i + 1, end)) return null;
      out.push({ group: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const ident = IDENT.exec(text.slice(i));
    if (ident === null) return null;
    const after = i + ident[0].length;
    if (text[after] === '(') {
      const end = closing(text, after);
      if (end < 0 || strayCloser(text, after + 1, end)) return null;
      out.push({ fn: text.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    out.push({ ident: decodeEscapes(ident[0]) });
    i = after;
  }
  return out;
}

// The index of the parenthesis closing the one at open, or -1.
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      if (i >= text.length) return -1;
    } else if (c === '\\') i++;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

// CSS whitespace only (U+00A0 is text: (width: 1024px\u00a0) is general
// enclosed).
const cssTrim = (text) => text.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
// Text with its comments as spaces (strings kept): a comment separates
// components (screen /* x */ and (color) is screen and (color)).
function withoutComments(text) {
  if (!text.includes('/*')) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '\\') {
      out += text.slice(i, i + 2);
      i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      out += ' ';
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return out;
}

// Whether text[from...to] has a ] or } that closes nothing (strings
// skipped): the query or condition does not parse (black box, 31.0.1:
// @media (]) is not all, @supports not (]) drops its rule).
function strayCloser(text, from, to) {
  let square = 0,
    curly = 0;
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < to && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '\\') i++;
    else if (c === '[') square++;
    else if (c === '{') curly++;
    else if (c === ']' && --square < 0) return true;
    else if (c === '}' && --curly < 0) return true;
  }
  // (a [ or { left open too: not ([) is false)
  return square !== 0 || curly !== 0;
}

const collapse = (text) => cssTrim(text).replace(/[ \t\n\r\f]+/g, ' ');

// --- the grammar -------------------------------------------------------------------------

// A node: { kind: 'type', not, only, type, condition }, { kind: 'not', of },
// { kind: 'and' | 'or', of: [...] }, { kind: 'parens', of }, { kind:
// 'feature', text, test }, { kind: 'enclosed', text }.
function query(text) {
  const parts = components(text);
  if (parts === null || parts.length === 0) return null;
  const word = (i) => parts[i]?.ident?.toLowerCase();
  if (parts[0].ident === undefined || (word(0) === 'not' && parts[1]?.ident === undefined))
    return condition(parts, 0, true);
  let i = 0;
  let not = false,
    only = false;
  if (word(0) === 'not' || word(0) === 'only') {
    not = word(0) === 'not';
    only = !not;
    i++;
  }
  const type = word(i);
  if (type === undefined || RESERVED.has(type)) return null;
  i++;
  if (i === parts.length) return { kind: 'type', not, only, type, condition: null };
  if (word(i) !== 'and') return null;
  const rest = condition(parts, i + 1, false);
  return rest === null ? null : { kind: 'type', not, only, type, condition: rest };
}

// parts[from...] as a condition (allowOr: or allowed), or null.
function condition(parts, from, allowOr) {
  const word = (i) => parts[i]?.ident?.toLowerCase();
  if (word(from) === 'not') {
    const of = inParens(parts[from + 1]);
    return of !== null && from + 2 === parts.length ? { kind: 'not', of } : null;
  }
  const first = inParens(parts[from]);
  if (first === null) return null;
  if (from + 1 === parts.length) return first;
  const op = word(from + 1);
  if (op !== 'and' && !(allowOr && op === 'or')) return null;
  const of = [first];
  for (let i = from + 1; i < parts.length; i += 2) {
    if (word(i) !== op) return null;
    const next = inParens(parts[i + 1]);
    if (next === null) return null;
    of.push(next);
  }
  return { kind: op, of };
}

function inParens(part) {
  if (part === undefined) return null;
  if (part.fn !== undefined) {
    const open = part.fn.indexOf('(');
    return { kind: 'enclosed', text: `${part.fn.slice(0, open)}(${collapse(part.fn.slice(open + 1, -1))})` };
  }
  if (part.group === undefined) return null;
  const inner = part.group;
  const parts = components(inner);
  if (parts !== null && parts.length > 0) {
    const first = parts[0];
    if (first.group !== undefined || first.fn !== undefined || first.ident?.toLowerCase() === 'not') {
      const nested = condition(parts, 0, true);
      if (nested !== null) return { kind: 'parens', of: nested };
    }
  }
  return feature(inner) ?? { kind: 'enclosed', text: `(${collapse(inner)})` };
}

// --- features ------------------------------------------------------------------------------

const OPS = /(<=|>=|<|>|=)/;
function feature(inner) {
  const text = cssTrim(inner);
  const colon = text.indexOf(':');
  if (colon >= 0 && !/[<>=]/.test(text)) {
    let name = cssTrim(text.slice(0, colon)).toLowerCase();
    if (!IDENT_ONLY.test(name)) return null;
    name = decodeEscapes(name).toLowerCase();
    let prefix = '';
    if ((name.startsWith('min-') || name.startsWith('max-')) && RANGE[name.slice(4)] !== undefined) {
      prefix = name.slice(0, 3);
      name = name.slice(4);
    }
    const v = value(name, cssTrim(text.slice(colon + 1)), prefix === '');
    if (v === null) return null;
    const actual = actualOf(name);
    let test = v.value === null ? UNKNOWN : compare(actual, PREFIX_OPS[prefix], v.value, name);
    if (name === 'prefers-color-scheme') {
      usesScheme = true;
      test = v.value === 'dark' ? DARK : LIGHT;
    }
    return { kind: 'feature', text: `(${prefix ? `${prefix}-` : ''}${name}: ${v.text})`, test };
  }
  if (IDENT_ONLY.test(text)) {
    const name = decodeEscapes(text).toLowerCase();
    if (RANGE[name] === undefined && DISCRETE[name] === undefined) return null;
    return { kind: 'feature', text: `(${name})`, test: booleanOf(name) };
  }
  // A range: value op name, name op value, value op name op value.
  const pieces = text.split(OPS).map(cssTrim);
  if (pieces.length !== 3 && pieces.length !== 5) return null;
  let nameAt = 2;
  if (pieces.length === 3 && IDENT_ONLY.test(pieces[0]) && RANGE[decodeEscapes(pieces[0]).toLowerCase()]) nameAt = 0;
  const name = decodeEscapes(pieces[nameAt]).toLowerCase();
  if (RANGE[name] === undefined) return null;
  if (pieces.length === 5) {
    const a = pieces[1],
      b = pieces[3];
    const less = a[0] === '<' && b[0] === '<',
      greater = a[0] === '>' && b[0] === '>';
    if (!less && !greater) return null;
  }
  const actual = actualOf(name);
  let test = TRUE;
  const out = [];
  for (let i = 0; i < pieces.length; i += 2) {
    if (i === nameAt) {
      out.push(name);
      if (i + 1 < pieces.length) out.push(pieces[i + 1]);
      continue;
    }
    const v = value(name, pieces[i], false);
    if (v === null) return null;
    out.push(v.text);
    if (v.value === null) test = UNKNOWN;
    else if (test !== UNKNOWN) {
      const op = i < nameAt ? pieces[i + 1] : pieces[i - 1];
      const result = i < nameAt ? compare(v.value, op, actual, name) : compare(actual, op, v.value, name);
      if (result === FALSE) test = FALSE;
    }
    if (i + 1 < pieces.length) out.push(pieces[i + 1]);
  }
  return { kind: 'feature', text: `(${out.join(' ')})`, test };
}
const IDENT_ONLY =
  /^-?(?:[a-zA-Z_]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])(?:[a-zA-Z0-9_-]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])*$/;
const PREFIX_OPS = { '': '=', min: '>=', max: '<=' };

const TRUE = 1,
  FALSE = 0,
  UNKNOWN = 2,
  // prefers-color-scheme: the document's (evaluate: dark)
  DARK = 3,
  LIGHT = 4;
// Whether the query being read uses prefers-color-scheme.
let usesScheme = false;

const actualOf = (name) => (RANGE[name] !== undefined ? RANGE[name][1] : DISCRETE[name][1]);

function booleanOf(name) {
  if (name === 'device-aspect-ratio') return TRUE;
  if (RANGE[name] !== undefined) return RANGE[name][1] !== 0 ? TRUE : FALSE;
  return OFF.has(DISCRETE[name][1]) ? FALSE : TRUE;
}

function compare(a, op, b, name) {
  // (the device's ratio, 0 / 0, equals 0 / 0 only)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    if (typeof a === 'string' || typeof b === 'string') return op === '=' && a === b ? TRUE : FALSE;
    return Number.isNaN(a) && Number.isNaN(b) && (op === '=' || op.length === 2) && name === 'device-aspect-ratio'
      ? TRUE
      : FALSE;
  }
  if (typeof a === 'string') return op === '=' && a === b ? TRUE : FALSE;
  switch (op) {
    case '<':
      return a < b ? TRUE : FALSE;
    case '<=':
      return a <= b ? TRUE : FALSE;
    case '>':
      return a > b ? TRUE : FALSE;
    case '>=':
      return a >= b ? TRUE : FALSE;
    default:
      return a === b ? TRUE : FALSE;
  }
}

// A feature's value: { text, value } (value null: it evaluates to unknown),
// or null when it is not one of the feature's (the parentheses are then
// general enclosed). discreteOk: a discrete feature takes it (not with
// min-, max- or in a range).
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i;
const MATH = /^(?:calc|min|max|clamp)\(/i;
const LENGTH_CONTEXT = {
  em: () => 16,
  rem: () => 16,
  lh: () => 18.4,
  rlh: () => 18.4,
  capRatio: 0.905,
  allViewport: true,
};
function value(name, text, discreteOk) {
  if (text === '') return null;
  const discrete = DISCRETE[name];
  if (discrete !== undefined) {
    if (!discreteOk) return null;
    const v = decodeEscapes(text).toLowerCase();
    return discrete[0].includes(v) ? { text: v, value: v } : null;
  }
  const type = RANGE[name]?.[0];
  if (type === undefined) return null;
  if (type === 'ratio') {
    const slash = topLevelSlash(text);
    const a = number(slash < 0 ? text : cssTrim(text.slice(0, slash)));
    const b = slash < 0 ? { text: '1', value: 1 } : number(cssTrim(text.slice(slash + 1)));
    if (a === null || b === null || a.value < 0 || b.value < 0) return null;
    const ratio = a.value === 0 && b.value === 0 ? NaN : a.value / b.value;
    return { text: `${a.text} / ${b.text}`, value: ratio };
  }
  if (type === 'integer') {
    const n = number(text);
    if (n === null) return null;
    return { text: n.text, value: n.integer ? n.value : null };
  }
  if (MATH.test(text)) {
    const tok = oneToken(text);
    if (tok === null) return null;
    const simplified = simplifyMath(tok, type);
    // (no percentages: a media feature has nothing they are of)
    if (typeof simplified !== 'string' || simplified.includes('%')) return null;
    let v = null;
    // (from the calculation as written: its text keeps 6 digits)
    if (type === 'length')
      v = absoluteLength(fontUnits(text), LENGTH_CONTEXT) ?? absoluteLength(fontUnits(simplified), LENGTH_CONTEXT);
    else {
      const m = mathValue(tok);
      v = m !== null && RESOLUTION[m.unit] !== undefined ? m.v * RESOLUTION[m.unit] : null;
    }
    return { text: simplified, value: v };
  }
  const n = NUMBER.exec(text);
  if (n === null) return null;
  // (a unit's escapes decoded: 100\70 x is 100px)
  const unit = decodeEscapes(text.slice(n[0].length)).toLowerCase();
  const num = Number(n[0]);
  if (type === 'length') {
    if (unit === '') return num === 0 ? { text: '0px', value: 0 } : null;
    if (!/^[a-z]+$/.test(unit)) return null;
    const px = absoluteLength(`${num}${fontUnit(unit)}`, LENGTH_CONTEXT);
    return px === null ? null : { text: `${sixDigits(num)}${unit}`, value: px };
  }
  const factor = RESOLUTION[unit];
  return factor === undefined ? null : { text: `${sixDigits(num)}${unit}`, value: num * factor };
}
// A value of one token (a math function alone), or null.
function oneToken(text) {
  const tokens = tokenizeValue(text);
  return tokens?.length === 1 ? tokens[0] : null;
}

function topLevelSlash(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '/' && depth === 0) return i;
  }
  return -1;
}
const RESOLUTION = { __proto__: null, dppx: 1, x: 1, dpi: 1 / 96, dpcm: 2.54 / 96 };

// A number, or a math function of numbers: { text, value, integer }.
function number(text) {
  if (MATH.test(text)) {
    const tok = oneToken(text);
    const simplified = tok === null ? undefined : simplifyMath(tok, 'number');
    if (typeof simplified !== 'string') return null;
    const m = mathValue(tok);
    return m === null || m.unit !== '' ? null : { text: simplified, value: m.v, integer: Number.isInteger(m.v) };
  }
  const n = NUMBER.exec(text);
  if (n === null || n[0].length !== text.length) return null;
  const value = Number(text);
  return { text: sixDigits(value), value, integer: /^[+-]?\d+$/.test(text) };
}

// ch and rch are an em in jsdom 31's media queries (half an em in its
// computed values, lengths.js).
const FONT_UNITS = { __proto__: null, ch: 'ic', rch: 'ric' };
const fontUnit = (unit) => FONT_UNITS[unit] ?? unit;
const fontUnits = (text) => text.replace(/(\d)(r?)ch\b/gi, '$1$2ic');

// --- evaluation and serialization ------------------------------------------------------------

function evaluate(node, dark) {
  switch (node.kind) {
    case 'type': {
      let result = MATCHING_TYPES.has(node.type) ? TRUE : FALSE;
      if (node.condition !== null && result === TRUE) result = evaluate(node.condition, dark);
      if (result === UNKNOWN) return UNKNOWN;
      return node.not ? 1 - result : result;
    }
    case 'not': {
      const r = evaluate(node.of, dark);
      return r === UNKNOWN ? UNKNOWN : 1 - r;
    }
    case 'and': {
      let result = TRUE;
      for (const n of node.of) {
        const r = evaluate(n, dark);
        if (r === FALSE) return FALSE;
        if (r === UNKNOWN) result = UNKNOWN;
      }
      return result;
    }
    case 'or': {
      let result = FALSE;
      for (const n of node.of) {
        const r = evaluate(n, dark);
        if (r === TRUE) return TRUE;
        if (r === UNKNOWN) result = UNKNOWN;
      }
      return result;
    }
    case 'parens':
      return evaluate(node.of, dark);
    case 'feature':
      if (node.test === DARK) return dark() ? TRUE : FALSE;
      if (node.test === LIGHT) return dark() ? FALSE : TRUE;
      return node.test;
    default:
      return UNKNOWN;
  }
}

function serialize(node) {
  switch (node.kind) {
    case 'type': {
      // (all and a condition is the condition)
      if (node.type === 'all' && !node.not && !node.only && node.condition !== null) return serialize(node.condition);
      let head = node.type;
      if (node.not) head = `not ${head}`;
      else if (node.only) head = `only ${head}`;
      return node.condition === null ? head : `${head} and ${serialize(node.condition)}`;
    }
    case 'not':
      return `not ${serialize(node.of)}`;
    case 'and':
    case 'or':
      return node.of.map(serialize).join(` ${node.kind} `);
    case 'parens':
      return `(${serialize(node.of)})`;
    default:
      return node.text;
  }
}

// A query read: { node, scheme } (node null when it does not parse;
// scheme: whether it uses prefers-color-scheme). Text nested too deep to
// read here (thousands of parentheses; jsdom 31 drops a style sheet nested
// over 128 deep, cssom.js) is general enclosed text.
function read(text) {
  usesScheme = false;
  let node;
  try {
    node = query(withoutComments(text));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    node = { kind: 'enclosed', text: collapse(text) };
  }
  return { node, scheme: usesScheme };
}

// One query as jsdom 31 writes it ("not all" when it does not parse).
export function serializeMedium31(text) {
  const { node } = read(String(text));
  return node === null ? 'not all' : serialize(node);
}

// Whether a query matches, read as written (jsdom 31 evaluates the
// values given, not the 6 digits it writes: (width: 1024.0000001px) is
// written (width: 1024px) and does not match). dark(): whether the
// document's color scheme is dark (its first meta color-scheme), asked
// only by prefers-color-scheme. Read queries are kept by text: a page has
// few; the result too where it is the same in every document.
const queries = new Map();
const NO_DARK = () => false;
export function mediumMatches31(text, dark = NO_DARK) {
  let entry = queries.get(text);
  if (entry === undefined) {
    entry = read(text);
    entry.result = entry.node === null || entry.scheme ? null : evaluate(entry.node, NO_DARK) === TRUE;
    if (queries.size > 1000) queries.clear();
    queries.set(text, entry);
  }
  if (entry.result !== null) return entry.result;
  return entry.node !== null && evaluate(entry.node, dark) === TRUE;
}

// --- @supports ---------------------------------------------------------------------------

// @supports conditions as jsdom 31 reads, writes and evaluates them (black
// box, 31.0.1; #269 part E4), written from CSS Conditional Rules 5: not,
// and or or (not mixed) over parenthesized conditions, declarations and
// the selector(), font-tech(), font-format() and at-rule() functions;
// anything else (general enclosed) is false. A rule whose prelude does not
// parse is dropped (parseSupports31 null). Written: keywords in lowercase
// with one space around them, a declaration as written, a function's
// argument trimmed (lowercase in font-tech() and font-format()).
//
// A declaration is supported when its value is valid for the property,
// !important allowed; a custom property's when it has no ; (--x: is
// supported). selector() takes one complex selector the engine knows.

const FONT_TECH = new Set([
  'features-opentype',
  'features-aat',
  'features-graphite',
  'color-colrv0',
  'color-colrv1',
  'color-svg',
  'color-sbix',
  'color-cbdt',
  'variations',
  'palettes',
  'incremental',
]);
const FONT_FORMAT = new Set(['collection', 'embedded-opentype', 'opentype', 'svg', 'truetype', 'woff', 'woff2']);
const AT_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'import',
  'namespace',
  'font-face',
  'keyframes',
  'page',
  'counter-style',
  'font-feature-values',
  'property',
  'starting-style',
  'font-palette-values',
  'view-transition',
  'position-try',
  'function',
  // page margin boxes and @font-feature-values blocks
  'top-left-corner',
  'top-left',
  'top-center',
  'top-right',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'bottom-right-corner',
  'left-top',
  'left-middle',
  'left-bottom',
  'right-top',
  'right-middle',
  'right-bottom',
  'stylistic',
  'historical-forms',
  'styleset',
  'character-variant',
  'swash',
  'ornaments',
  'annotation',
]);

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

// Top-level components: { ident }, { group: inner }, { fn: name, inner }.
function supportsComponents(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (isSpace(text[i])) {
      i++;
      continue;
    }
    if (text[i] === '(') {
      const end = supportsClosing(text, i);
      if (end < 0) return null;
      out.push({ group: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const ident = IDENT.exec(text.slice(i));
    if (ident === null) return null;
    const after = i + ident[0].length;
    if (text[after] === '(') {
      const end = supportsClosing(text, after);
      if (end < 0 || strayCloser(text, after + 1, end)) return null;
      out.push({ fn: decodeEscapes(ident[0]), inner: text.slice(after + 1, end) });
      i = end + 1;
      continue;
    }
    out.push({ ident: decodeEscapes(ident[0]) });
    i = after;
  }
  return out;
}

// The index of the parenthesis closing the one at open (strings, escapes
// and comments skipped), or -1.
function supportsClosing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '\\') i++;
    else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return -1;
      i = end + 1;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

// A condition: { kind: 'not', of } | { kind: 'and' | 'or', of: [...] } |
// { kind: 'parens', of } | { kind: 'decl', text } | { kind: 'fn', name,
// arg } | { kind: 'enclosed', text }; null when it does not parse.
function supportsCondition(parts) {
  if (parts === null || parts.length === 0) return null;
  const word = (i) => parts[i]?.ident?.toLowerCase();
  if (word(0) === 'not') {
    if (parts.length !== 2) return null;
    const of = supportsInParens(parts[1]);
    return of === null ? null : { kind: 'not', of };
  }
  const first = supportsInParens(parts[0]);
  if (first === null) return null;
  if (parts.length === 1) return first;
  const op = word(1);
  if (op !== 'and' && op !== 'or') return null;
  const of = [first];
  for (let i = 1; i < parts.length; i += 2) {
    if (word(i) !== op) return null;
    const next = supportsInParens(parts[i + 1]);
    if (next === null) return null;
    of.push(next);
  }
  return { kind: op, of };
}

function supportsInParens(part) {
  if (part === undefined || part.ident !== undefined) return null;
  if (part.fn !== undefined) return { kind: 'fn', name: part.fn.toLowerCase(), fn: part.fn, arg: part.inner };
  if (strayCloser(part.group, 0, part.group.length)) return null;
  const nested = supportsComponents(part.group);
  // (a condition in parentheses: one that starts with a group, not or a
  // function, (selector(div)) too)
  if (
    nested !== null &&
    nested.length > 0 &&
    (nested[0].group !== undefined || nested[0].fn !== undefined || nested[0].ident?.toLowerCase() === 'not')
  ) {
    const of = supportsCondition(nested);
    if (of !== null) return { kind: 'parens', of };
  }
  return { kind: 'decl', text: part.group };
}

// A prelude's condition, or null when the rule is dropped.
export function parseSupports31(text) {
  return supportsCondition(supportsComponents(withoutComments(String(text))));
}

export function serializeSupports31(node) {
  switch (node.kind) {
    case 'not':
      return `not ${serializeSupports31(node.of)}`;
    case 'and':
    case 'or':
      return node.of.map(serializeSupports31).join(` ${node.kind} `);
    case 'parens':
      return `(${serializeSupports31(node.of)})`;
    case 'decl':
      return `(${node.text})`;
    default: {
      const arg = node.arg.trim();
      if (node.name === 'font-tech' || node.name === 'font-format' || node.name === 'env')
        return `${node.name}(${arg.toLowerCase()})`;
      if (node.name === 'selector' || node.name === 'at-rule') return `${node.name}(${arg})`;
      return `${node.fn}(${node.arg})`;
    }
  }
}

// Whether a condition holds. declaration(name, value): whether a property
// takes the value; selector(text): whether the engine knows the selector.
export function supportsHold31(node, declaration, selector) {
  switch (node.kind) {
    case 'not':
      return !supportsHold31(node.of, declaration, selector);
    case 'and':
      return node.of.every((n) => supportsHold31(n, declaration, selector));
    case 'or':
      return node.of.some((n) => supportsHold31(n, declaration, selector));
    case 'parens':
      return supportsHold31(node.of, declaration, selector);
    case 'decl': {
      const colon = node.text.indexOf(':');
      if (colon < 0) return false;
      const name = node.text.slice(0, colon).trim();
      if (!IDENT_ONLY.test(name) && !name.startsWith('--')) return false;
      // (an escaped name is read decoded: \64 isplay is display)
      return supportedDeclaration31(
        name.startsWith('--') ? name : decodeEscapes(name),
        node.text.slice(colon + 1),
        declaration,
        true,
      );
    }
    default: {
      const arg = node.arg.trim();
      switch (node.name) {
        case 'selector':
          return arg !== '' && !hasTopLevelComma(arg) && knownPseudoElements(arg) && selector(arg);
        case 'env':
          return ENV.has(arg.toLowerCase());
        case 'font-tech':
          return FONT_TECH.has(arg.toLowerCase());
        case 'font-format':
          return FONT_FORMAT.has(arg.toLowerCase());
        case 'at-rule':
          return arg.startsWith('@') && AT_RULES.has(arg.slice(1).toLowerCase());
        default:
          return false;
      }
    }
  }
}

// A declaration (name, value) as a condition holds it: a custom property
// with no ; in its value, another property with a valid value (!important
// allowed where it is a condition's).
export function supportedDeclaration31(name, value, declaration, important) {
  // (-- alone is no property name)
  if (name === '--') return false;
  // (comments are not the value's: --x: /* ; */ is fine)
  value = withoutComments(value);
  // (no ! at its top level but a priority where a condition has the
  // declaration, and no closer of nothing: --x, a !important, --x, a)b
  // and (--x: a!b) are unsupported, (--x: a !important) is)
  if (name.startsWith('--')) {
    const own = important ? value.replace(/!\s*important\s*$/i, '') : value;
    return !topLevelSemicolon(own) && !strayTopLevel(own);
  }
  let text = value.trim();
  if (important) text = text.replace(/!\s*important\s*$/i, '').trim();
  return text !== '' && !topLevelSemicolon(text) && declaration(name, text);
}

// Whether a value has a ; outside strings and blocks ("a;b" is one
// string).
function strayTopLevel(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '\\') i++;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth < 0) return true;
    } else if (c === '!' && depth === 0) return true;
  }
  return false;
}

// CSS.supports(condition): what is left open at the end (a string, a
// block, a function) closed there, as CSS Syntax reads input (black box,
// 31.0.1: (display: grid is supported).
export function closedAtEnd31(text) {
  const open = [];
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) {
        quote = c;
        break;
      }
      i = j;
    } else if (c === '\\') i++;
    else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 1;
    } else if (c === '(') open.push(')');
    else if (c === '[') open.push(']');
    else if (c === '{') open.push('}');
    else if ((c === ')' || c === ']' || c === '}') && open[open.length - 1] === c) open.pop();
  }
  if (open.length === 0 && quote === '') return text;
  return text + quote + open.reverse().join('');
}

function topLevelSemicolon(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '\\') i++;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth <= 0) return true;
  }
  return false;
}

// selector(): the pseudo-elements jsdom 31 knows (black box, 31.0.1;
// ::-webkit-scrollbar, ::cue and made-up names are not).
export const PSEUDO_ELEMENTS = new Set([
  'before',
  'after',
  'first-line',
  'first-letter',
  'marker',
  'placeholder',
  'selection',
  'backdrop',
  'file-selector-button',
  'part(',
  'slotted(',
  'highlight(',
  'grammar-error',
  'spelling-error',
  'target-text',
  'details-content',
  'view-transition',
  'view-transition-group(',
  'view-transition-image-pair(',
  'view-transition-old(',
  'view-transition-new(',
  'column',
  'scroll-marker',
  'scroll-marker-group',
  'scroll-button(',
  'picker(',
  'picker-icon',
  'checkmark',
  'search-text',
]);
const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const PSEUDO_ELEMENT =
  /::((?:-?[a-zA-Z_]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])(?:[a-zA-Z0-9_-]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])*)(\()?/g;
// A name with its escapes decoded (::b\65 fore is ::before).
// An escape's code point: U+FFFD for zero, a surrogate or one past
// U+10FFFF (CSS Syntax, consume an escaped code point).
const escapedCodePoint = (cp) => (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? 0xfffd : cp);
export const decodeEscapes = (name) =>
  name.replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|\\(.)/g, (m, hex, ch) =>
    hex === undefined ? ch : String.fromCodePoint(escapedCodePoint(parseInt(hex, 16))),
  );
function knownPseudoElements(text) {
  // (::x in a string is no pseudo-element)
  for (const m of text.replace(STRING, '""').matchAll(PSEUDO_ELEMENT))
    if (!PSEUDO_ELEMENTS.has(decodeEscapes(m[1]).toLowerCase() + (m[2] ?? ''))) return false;
  return true;
}

// env(): the names jsdom 31 knows, alone (no fallback).
const ENV = new Set([
  'preferred-text-scale',
  ...['top', 'right', 'bottom', 'left'].flatMap((s) => [`safe-area-inset-${s}`, `safe-area-max-inset-${s}`]),
  ...['width', 'height', 'top', 'right', 'bottom', 'left'].map((s) => `viewport-segment-${s}`),
]);

function hasTopLevelComma(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) return true;
  }
  return false;
}
