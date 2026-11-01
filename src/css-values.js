// CSS value validation: does a value match a property's grammar (CSS
// Values 4, 2: the value definition syntax)? setProperty and style
// declarations drop values that do not, as CSSOM says and jsdom does.
//
// Grammars come from the specifications (css-grammar.js, generated). A
// property's grammar is compiled on first use; values are tokenized (CSS
// Syntax 3) and matched with backtracking over token positions. Callers
// cache results per property and value, so each distinct value is matched
// once.
//
// Validation fails open: a property whose grammar uses a type defined only
// in prose (or a construct not handled here) accepts every value, so a
// valid value is never dropped for want of a rule. Also as in jsdom: the
// CSS-wide keywords and values with var() are always valid, and math
// functions (calc(), min(), ...) are accepted wherever a number, length,
// percentage, angle, time or resolution is, without checking their insides.
import { PROPERTY_SYNTAX, TYPE_SYNTAX } from './css-grammar.js';
import { resolveColor } from './colors.js';
import { ALIASES } from './css-data.js';

// --- tokens --------------------------------------------------------------------------------
// A component value list: whitespace is dropped (the grammar is matched on
// component values), functions and blocks hold their own lists.
//   { t: 'ident', v }      { t: 'number', v, int }   { t: 'percentage', v }
//   { t: 'dimension', v, unit }   { t: 'string' }   { t: 'hash', v }
//   { t: 'delim', v }      { t: 'comma' }   { t: 'url' }
//   { t: 'function', name, args: [...] }   { t: 'block', open, items: [...] }

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
const IDENT_START = /[a-zA-Z_\u0080-￿]|-[a-zA-Z_\u0080-￿-]|\\/;
const IDENT_CHARS = /^(?:[a-zA-Z0-9_\u0080-￿-]|\\.)+/;

function tokenize(text) {
  let i = 0;
  const n = text.length;
  let varFunction = null; // hasVarFunction(text), read at the first bad url()
  function list(close) {
    const out = [];
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
        i++;
        continue;
      }
      if (close && c === close) {
        i++;
        return out;
      }
      if (c === ')' || c === ']' || c === '}') return null; // unbalanced
      if (c === '"' || c === "'") {
        const end = text.indexOf(c, i + 1);
        if (end === -1) return null;
        out.push({ t: 'string' });
        i = end + 1;
        continue;
      }
      if (c === ',') {
        out.push({ t: 'comma' });
        i++;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        i++;
        const items = list(c === '(' ? ')' : c === '[' ? ']' : '}');
        if (!items) return null;
        out.push({ t: 'block', open: c, items });
        continue;
      }
      if (c === '#') {
        const m = IDENT_CHARS.exec(text.slice(i + 1));
        if (m) {
          out.push({ t: 'hash', v: m[0] });
          i += 1 + m[0].length;
          continue;
        }
        out.push({ t: 'delim', v: c });
        i++;
        continue;
      }
      const rest = text.slice(i);
      const num = NUMBER.exec(rest);
      if (num && !(c === '-' && /^-[a-zA-Z_-]/.test(rest)) && !(c === '+' && /^\+[a-zA-Z]/.test(rest))) {
        i += num[0].length;
        const v = Number(num[0]);
        const int = /^[+-]?\d+$/.test(num[0]);
        if (text[i] === '%') {
          out.push({ t: 'percentage', v });
          i++;
          continue;
        }
        const unit = IDENT_CHARS.exec(text.slice(i));
        if (unit && IDENT_START.test(text.slice(i, i + 2))) {
          out.push({ t: 'dimension', v, unit: unit[0].toLowerCase() });
          i += unit[0].length;
          continue;
        }
        out.push({ t: 'number', v, int });
        continue;
      }
      const m = IDENT_START.test(rest.slice(0, 2)) ? IDENT_CHARS.exec(rest) : null;
      if (m) {
        const name = m[0];
        i += name.length;
        if (text[i] === '(') {
          i++;
          const lower = name.toLowerCase();
          if (lower === 'url') {
            // Both url( unquoted ) and url("...") are read by readUrl and give
            // one url token here (CSS Syntax makes the quoted form a function).
            const url = readUrl(text, i, newlineSpaces);
            // A bad url() in a value with var() is kept to its ")", as the
            // value is (jsdom): url(var(--image).png), var(--a, url(a b.png)).
            if (url === null) varFunction ??= hasVarFunction(text);
            const close = url === null && varFunction ? findClose(text, i) : -1;
            if (url === null && close === -1) return null;
            out.push({ t: 'url' });
            i = url === null ? close + 1 : url.end;
            continue;
          }
          const args = list(')');
          if (!args) return null;
          out.push({ t: 'function', name: lower, args });
          continue;
        }
        out.push({ t: 'ident', v: name.toLowerCase() });
        continue;
      }
      out.push({ t: 'delim', v: c });
      i++;
    }
    return close ? null : out;
  }
  return list(null);
}

// The ")" closing a url() from its insides, past nested parentheses, and
// past strings in a quoted one (an unquoted one has no strings: url(a"b
// c.png)); an escaped character is skipped, in a string or not (var(--a)
// url(a\(b c.png); black box: jsdom 23 to 30 keep both, #222).
function findClose(text, from) {
  const n = text.length;
  let i = from;
  while (i < n && isSpace(text.charCodeAt(i))) i++;
  const strings = text.charCodeAt(i) === 0x22 || text.charCodeAt(i) === 0x27;
  let depth = 0;
  let quote = 0;
  for (; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c) {
      i++; // \ and the character it escapes
    } else if (quote !== 0) {
      if (c === quote) quote = 0;
    } else if (strings && (c === 0x22 || c === 0x27)) quote = c;
    else if (c === 0x28) depth++;
    else if (c === 0x29) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

// A url() as CSS Syntax 3 reads it (4.3.6 consume a url token, 4.3.5 a
// string), as jsdom 27 and later do (black box, #144): from, just after
// "url(", to { end: after its ")", url: the URL read }, or null. The
// text's end closes an unclosed string or url() (url("a.png is
// url("a.png")); whitespace inside an unquoted url, a quote, a "(", a
// control character (a NUL too) or an escaped line break there make it a
// bad url (null), and so does anything after the string but whitespace.
// Escapes are read (url(a\62 .png) is ab.png, \0 U+FFFD). A line break in
// a string is a bad string (null), unless newlines: one space for each run
// (jsdom's background-image, set through the style object).
export function readUrl(text, from, newlines = false) {
  const n = text.length;
  let i = from;
  while (i < n && isSpace(text.charCodeAt(i))) i++;
  let url = '';
  const q = text[i];
  if (q === '"' || q === "'") {
    i++;
    while (i < n) {
      const c = text[i];
      if (c === q) {
        i++;
        break;
      }
      if (c === '\n' || c === '\r' || c === '\f') {
        if (!newlines) return null;
        while (i < n && (text[i] === '\n' || text[i] === '\r' || text[i] === '\f')) i++;
        url += ' ';
        continue;
      }
      if (c === '\\') {
        const next = text[i + 1];
        if (next === undefined) i++;
        else if (next === '\n' || next === '\f') i += 2;
        else if (next === '\r') i += text[i + 2] === '\n' ? 3 : 2;
        else i = readEscape(text, i, (cp) => (url += cp));
        continue;
      }
      url += c;
      i++;
    }
    while (i < n && isSpace(text.charCodeAt(i))) i++;
    if (i < n && text[i] !== ')') return null;
    return { end: Math.min(i + 1, n), url };
  }
  while (i < n) {
    const c = text[i];
    const code = text.charCodeAt(i);
    if (c === ')') return { end: i + 1, url };
    if (isSpace(code)) {
      while (i < n && isSpace(text.charCodeAt(i))) i++;
      if (i < n && text[i] !== ')') return null;
      return { end: Math.min(i + 1, n), url };
    }
    if (c === '"' || c === "'" || c === '(' || code <= 8 || code === 11 || (code >= 14 && code <= 31) || code === 127)
      return null;
    if (c === '\\') {
      const next = text[i + 1];
      if (next === undefined || next === '\n' || next === '\r' || next === '\f') return null;
      i = readEscape(text, i, (cp) => (url += cp));
      continue;
    }
    url += c;
    i++;
  }
  return { end: n, url };
}
const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
const HEX = /^[0-9a-fA-F]{1,6}/;
// An escape at text[i] (a backslash): the code point it stands for, to put;
// returns the index after it (and the one whitespace after a hex escape).
function readEscape(text, i, put) {
  const hex = HEX.exec(text.slice(i + 1, i + 7));
  if (hex === null) {
    const cp = text.codePointAt(i + 1);
    put(String.fromCodePoint(cp));
    return i + 1 + (cp > 0xffff ? 2 : 1);
  }
  const cp = parseInt(hex[0], 16);
  put(cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? '\uFFFD' : String.fromCodePoint(cp));
  let j = i + 1 + hex[0].length;
  if (text[j] === '\r' && text[j + 1] === '\n') j += 2;
  else if (j < text.length && isSpace(text.charCodeAt(j))) j++;
  return j;
}
// The index after the unquoted url() whose "(" is at text[open] (url in
// any case before it, then no quote): a url token, or a bad one's
// remnants, runs to its ")" past escapes (url(a"b.png) and url(a\\(b.png)
// are one token, their quote and parenthesis no string or block), or to
// the end; -1 when no such url() opens there. Character codes only: the
// declaration splitters call it at every "(".
export function urlTokenEnd(text, open) {
  if (
    open < 3 ||
    (text.charCodeAt(open - 1) | 32) !== 108 ||
    (text.charCodeAt(open - 2) | 32) !== 114 ||
    (text.charCodeAt(open - 3) | 32) !== 117 ||
    (open > 3 && isNameCode(text.charCodeAt(open - 4)))
  )
    return -1;
  const n = text.length;
  let j = open + 1;
  while (j < n && isSpace(text.charCodeAt(j))) j++;
  const q = text.charCodeAt(j);
  if (q === 34 || q === 39) return -1;
  for (; j < n; j++) {
    const c = text.charCodeAt(j);
    if (c === 92) j++;
    else if (c === 41) return j + 1;
  }
  return n;
}
// A var( function token, in any case, outside quoted strings: not after a
// name character (notvar(, -var(, url(n-var(--a).png)) or in a string
// (url("var(x).png")), as CSS Syntax 3 reads it; one in an unquoted url()
// counts (url(var(--a).png), url(a\ var(--a).png); black box: jsdom 23 to
// 30, #222). One pass, without allocating.
export function hasVarFunction(value) {
  if (!/var\(/i.test(value)) return false;
  const n = value.length;
  let quote = 0;
  let name = false; // the previous character continues a name
  for (let i = 0; i < n; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x5c) {
      // \ and the character it escapes
      i++;
      name = quote === 0 && i < n && isNameCode(value.charCodeAt(i));
    } else if (quote !== 0) {
      if (c === quote) quote = 0;
    } else if (c === 0x22 || c === 0x27) {
      quote = c;
      name = false;
    } else if (
      !name &&
      (c | 0x20) === 0x76 &&
      (value.charCodeAt(i + 1) | 0x20) === 0x61 &&
      (value.charCodeAt(i + 2) | 0x20) === 0x72 &&
      value.charCodeAt(i + 3) === 0x28
    )
      return true;
    else name = isNameCode(c);
  }
  return false;
}
// A character of a name (or a backslash): url( after it is no url().
export const isNameCode = (c) =>
  (c >= 48 && c <= 57) || ((c | 32) >= 97 && (c | 32) <= 122) || c === 95 || c === 45 || c === 92 || c > 127;
// Line breaks in a url() string read as spaces (isValidValue sets it per property).
let newlineSpaces = false;

// Each url() in a value as jsdom 27 and later serialize it (black box,
// #144): url("...") with the URL readUrl reads, closed at the text's end;
// escapes 'spec' (jsdom 29 and later: ", \ and control characters escaped,
// as CSSOM serializes a string) or 'quotes' (jsdom 27 and 28: " only).
// newlines as readUrl's. A url() it cannot read stays as written.
export function serializeUrls(value, escapes, newlines = false) {
  let out = '';
  let last = 0;
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote !== null) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '\\') i++;
    else if (
      (c === 'u' || c === 'U') &&
      value[i + 3] === '(' &&
      (value.charCodeAt(i + 1) | 32) === 114 &&
      (value.charCodeAt(i + 2) | 32) === 108 &&
      (i === 0 || !isNameCode(value.charCodeAt(i - 1)))
    ) {
      const url = readUrl(value, i + 4, newlines);
      if (url === null) continue;
      out += `${value.slice(last, i)}url("${escapeUrl(url.url, escapes)}")`;
      last = url.end;
      i = url.end - 1;
    }
  }
  return last === 0 ? value : out + value.slice(last);
}
function escapeUrl(url, escapes) {
  if (escapes !== 'spec') return url.replace(/"/g, '\\"');
  return url.replace(/["\\\0-\x1f\x7f]/g, (c) => {
    if (c === '\0') return '\uFFFD';
    return c === '"' || c === '\\' ? `\\${c}` : `\\${c.charCodeAt(0).toString(16)} `;
  });
}

// --- grammar -------------------------------------------------------------------------------
// Nodes: { k: 'seq', items } (juxtaposition), { k: 'all', items } (&&),
// { k: 'any', items } (||), { k: 'one', items } (|), { k: 'kw', v },
// { k: 'lit', v } (',' '/' ...), { k: 'type', name, range },
// { k: 'prop', name }, { k: 'fn', name, body }, { k: 'block', open, body },
// each optionally with { min, max, hash, required } multipliers.

class Unsupported extends Error {}

function parseGrammar(syntax) {
  let i = 0;
  const s = syntax;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  function parseAlternatives(stop) {
    const items = [parseAny(stop)];
    ws();
    while (s[i] === '|' && s[i + 1] !== '|') {
      i++;
      items.push(parseAny(stop));
      ws();
    }
    return items.length === 1 ? items[0] : { k: 'one', items };
  }
  function parseAny(stop) {
    const items = [parseAll(stop)];
    ws();
    while (s[i] === '|' && s[i + 1] === '|') {
      i += 2;
      items.push(parseAll(stop));
      ws();
    }
    return items.length === 1 ? items[0] : { k: 'any', items };
  }
  function parseAll(stop) {
    const items = [parseSeq(stop)];
    ws();
    while (s[i] === '&' && s[i + 1] === '&') {
      i += 2;
      items.push(parseSeq(stop));
      ws();
    }
    return items.length === 1 ? items[0] : { k: 'all', items };
  }
  function parseSeq(stop) {
    const items = [];
    for (;;) {
      ws();
      if (i >= s.length || s[i] === '|' || (s[i] === '&' && s[i + 1] === '&') || s[i] === stop) break;
      items.push(parseMultiplied(stop));
    }
    if (items.length === 0) throw new Unsupported('empty');
    return items.length === 1 ? items[0] : { k: 'seq', items };
  }
  function parseMultiplied(stop) {
    let node = parseTerm(stop);
    for (;;) {
      const c = s[i];
      if (c === '?') {
        node = { k: 'rep', node, min: 0, max: 1 };
        i++;
      } else if (c === '*') {
        node = { k: 'rep', node, min: 0, max: Infinity };
        i++;
      } else if (c === '+') {
        node = { k: 'rep', node, min: 1, max: Infinity };
        i++;
      } else if (c === '#') {
        i++;
        let min = 1,
          max = Infinity;
        const m = /^\{(\d+)(,(\d*))?\}/.exec(s.slice(i));
        if (m) {
          min = +m[1];
          max = m[2] ? (m[3] ? +m[3] : Infinity) : min;
          i += m[0].length;
        }
        node = { k: 'rep', node, min, max, comma: true };
      } else if (c === '{') {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(s.slice(i));
        if (!m) throw new Unsupported('braces');
        const min = +m[1];
        const max = m[2] ? (m[3] ? +m[3] : Infinity) : min;
        node = { k: 'rep', node, min, max };
        i += m[0].length;
      } else if (c === '!') {
        node = { k: 'required', node };
        i++;
      } else break;
    }
    return node;
  }
  function parseTerm(stop) {
    ws();
    const c = s[i];
    if (c === '[') {
      i++;
      const body = parseAlternatives(']');
      ws();
      if (s[i] !== ']') throw new Unsupported('bracket');
      i++;
      return body;
    }
    if (c === '<') {
      const end = s.indexOf('>', i);
      if (end === -1) throw new Unsupported('type');
      const inner = s.slice(i + 1, end).trim();
      i = end + 1;
      if (inner.startsWith("'")) return { k: 'prop', name: inner.slice(1, -1) };
      const m = /^([\w-]+(?:\(\))?)\s*(?:\[\s*([^,\]]*)\s*,\s*([^\]]*)\s*\])?$/.exec(inner);
      if (!m) throw new Unsupported(inner);
      const range = m[2] !== undefined ? [rangeBound(m[2], -Infinity), rangeBound(m[3], Infinity)] : null;
      return { k: 'type', name: m[1], range };
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      const v = s.slice(i + 1, end);
      i = end + 1;
      return { k: 'lit', v };
    }
    if (c === ',' || c === '/' || c === ':' || c === ';' || c === '=') {
      i++;
      return { k: 'lit', v: c };
    }
    if (c === '(') {
      i++;
      const body = parseOptionalBody(')');
      return { k: 'block', open: '(', body };
    }
    const m = /^[a-zA-Z_-][\w-]*(\()?/.exec(s.slice(i));
    if (!m) throw new Unsupported(`at ${s.slice(i, i + 10)}`);
    i += m[0].length;
    if (m[1]) {
      const name = m[0].slice(0, -1).toLowerCase();
      const body = parseOptionalBody(')');
      return { k: 'fn', name, body };
    }
    return { k: 'kw', v: m[0].toLowerCase() };
  }
  function parseOptionalBody(close) {
    ws();
    if (s[i] === close) {
      i++;
      return null;
    }
    const body = parseAlternatives(close);
    ws();
    if (s[i] !== close) throw new Unsupported('close');
    i++;
    return body;
  }
  function rangeBound(text, fallback) {
    const t = text.trim();
    if (t === '∞' || t === '+∞') return Infinity;
    if (t === '-∞' || t === '−∞') return -Infinity;
    const v = parseFloat(t);
    return Number.isNaN(v) ? fallback : v;
  }

  const node = parseAlternatives(null);
  ws();
  if (i < s.length) throw new Unsupported('trailing');
  return node;
}

// --- primitive types -----------------------------------------------------------------------

const LENGTH_UNITS = new Set([
  'px',
  'cm',
  'mm',
  'q',
  'in',
  'pt',
  'pc',
  'em',
  'rem',
  'ex',
  'rex',
  'cap',
  'rcap',
  'ch',
  'rch',
  'ic',
  'ric',
  'lh',
  'rlh',
  'vw',
  'vh',
  'vi',
  'vb',
  'vmin',
  'vmax',
  'svw',
  'svh',
  'svi',
  'svb',
  'svmin',
  'svmax',
  'lvw',
  'lvh',
  'lvi',
  'lvb',
  'lvmin',
  'lvmax',
  'dvw',
  'dvh',
  'dvi',
  'dvb',
  'dvmin',
  'dvmax',
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
]);
const ANGLE_UNITS = new Set(['deg', 'grad', 'rad', 'turn']);
const TIME_UNITS = new Set(['s', 'ms']);
const FREQUENCY_UNITS = new Set(['hz', 'khz']);
const RESOLUTION_UNITS = new Set(['dpi', 'dpcm', 'dppx', 'x']);
const CSS_WIDE = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);
const MATH = new Set([
  'calc',
  'min',
  'max',
  'clamp',
  'round',
  'mod',
  'rem',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'pow',
  'sqrt',
  'hypot',
  'log',
  'exp',
  'abs',
  'sign',
  'calc-size',
  'progress',
  'random',
  'sibling-count',
  'sibling-index',
]);

const inRange = (v, range) => !range || (v >= range[0] && v <= range[1]);
const isMath = (tok) => tok.t === 'function' && MATH.has(tok.name);

// Numeric types: a token of the type, a unitless zero where lengths allow
// it, or a math function.
function numeric(units, allowZero) {
  return (tok, range) => {
    if (isMath(tok)) return true;
    if (tok.t === 'dimension') return units.has(tok.unit) && inRange(tok.v, range);
    return allowZero && tok.t === 'number' && tok.v === 0;
  };
}

const PRIMITIVES = {
  number: (tok, range) => isMath(tok) || (tok.t === 'number' && inRange(tok.v, range)),
  integer: (tok, range) => isMath(tok) || (tok.t === 'number' && tok.int && inRange(tok.v, range)),
  percentage: (tok, range) => isMath(tok) || (tok.t === 'percentage' && inRange(tok.v, range)),
  length: numeric(LENGTH_UNITS, true),
  angle: numeric(ANGLE_UNITS, true),
  time: numeric(TIME_UNITS, false),
  frequency: numeric(FREQUENCY_UNITS, false),
  resolution: numeric(RESOLUTION_UNITS, false),
  flex: (tok, range) => isMath(tok) || (tok.t === 'dimension' && tok.unit === 'fr' && inRange(tok.v, range)),
  dimension: (tok) => tok.t === 'dimension' || isMath(tok),
  string: (tok) => tok.t === 'string',
  ident: (tok) => tok.t === 'ident',
  'custom-ident': (tok) => tok.t === 'ident' && !CSS_WIDE.has(tok.v) && tok.v !== 'default',
  'dashed-ident': (tok) => tok.t === 'ident' && tok.v.startsWith('--'),
  'hex-color': (tok) => tok.t === 'hash' && /^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(tok.v),
  'url-token': (tok) => tok.t === 'url',
  zero: (tok) => tok.t === 'number' && tok.v === 0,
  'hash-token': (tok) => tok.t === 'hash',
  'ident-token': (tok) => tok.t === 'ident',
};

// Prose-defined types that match one component value of any kind.
const ANY_ONE = new Set(['custom-property-name']);

// --- matching ------------------------------------------------------------------------------
// match(node, tokens, pos) returns the positions where node can end when it
// starts at pos (sorted, unique). Comma lists accept the grammar's commas.

const compiled = new Map(); // name -> node | null (unsupported)

function typeNode(name) {
  if (compiled.has(name)) return compiled.get(name);
  compiled.set(name, null); // recursion guard
  let node = null;
  const syntax = TYPE_SYNTAX[name];
  if (syntax) {
    try {
      node = parseGrammar(syntax);
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
    }
  }
  compiled.set(name, node);
  return node;
}

const propertyNodes = new Map();
function propertyNode(name) {
  if (ALIASES[name]) name = ALIASES[name]; // -webkit-transform: transform's grammar
  if (propertyNodes.has(name)) return propertyNodes.get(name);
  propertyNodes.set(name, null);
  let node = null;
  const syntax = PROPERTY_SYNTAX[name];
  if (syntax) {
    try {
      node = parseGrammar(syntax);
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
    }
  }
  propertyNodes.set(name, node);
  return node;
}

// Thrown while matching when the grammar reaches something unknown; the
// value is then accepted.
class Unknown extends Error {}
const UNKNOWN = new Unknown();

function union(a, b) {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

function match(node, tokens, pos) {
  switch (node.k) {
    case 'kw': {
      const tok = tokens[pos];
      return tok && tok.t === 'ident' && tok.v === node.v ? [pos + 1] : [];
    }
    case 'lit': {
      const tok = tokens[pos];
      if (!tok) return [];
      if (node.v === ',') return tok.t === 'comma' ? [pos + 1] : [];
      return tok.t === 'delim' && tok.v === node.v ? [pos + 1] : [];
    }
    case 'type':
      return matchType(node, tokens, pos);
    case 'prop': {
      const p = propertyNode(node.name);
      if (!p) throw UNKNOWN;
      return match(p, tokens, pos);
    }
    case 'fn': {
      const tok = tokens[pos];
      if (!tok || tok.t !== 'function' || tok.name !== node.name) return [];
      return matchesWhole(node.body, tok.args) ? [pos + 1] : [];
    }
    case 'block': {
      const tok = tokens[pos];
      if (!tok || tok.t !== 'block' || tok.open !== node.open) return [];
      return matchesWhole(node.body, tok.items) ? [pos + 1] : [];
    }
    case 'seq': {
      let ends = [pos];
      for (const item of node.items) {
        let next = [];
        for (const p of ends) {
          next = union(next, match(item, tokens, p));
          // Comma elision (CSS Values 4, 2.6): a comma next to the start or
          // end of the value, or to another comma, is omitted along with the
          // optional part beside it.
          if (item.k === 'lit' && item.v === ',' && (p === 0 || p === tokens.length || tokens[p - 1]?.t === 'comma'))
            next = union(next, [p]);
        }
        if (next.length === 0) return [];
        ends = next;
      }
      return ends;
    }
    case 'one': {
      let ends = [];
      for (const item of node.items) ends = union(ends, match(item, tokens, pos));
      return ends;
    }
    case 'any':
      return matchUnordered(node.items, tokens, pos, false);
    case 'all':
      return matchUnordered(node.items, tokens, pos, true);
    case 'rep':
      return matchRepeat(node, tokens, pos);
    case 'required': {
      // At least one value inside the group must be present.
      return match(node.node, tokens, pos).filter((end) => end > pos);
    }
    default:
      throw UNKNOWN;
  }
}

function matchType(node, tokens, pos) {
  const tok = tokens[pos];
  if (!tok) return [];
  const { name, range } = node;
  const primitive = PRIMITIVES[name];
  if (primitive) return primitive(tok, range) ? [pos + 1] : [];
  if (ANY_ONE.has(name)) return [pos + 1];
  if (name === 'color' || name === 'color-base' || name === 'named-color' || name === 'system-color') {
    // Colors: parsed by the color module (the same as computed values).
    return colorToken(tok, name) ? [pos + 1] : [];
  }
  if (name === 'url')
    return tok.t === 'url' || (tok.t === 'function' && (tok.name === 'url' || tok.name === 'src')) ? [pos + 1] : [];
  if (name === 'declaration-value' || name === 'any-value') return anyRest(tokens, pos);
  const fn = name.endsWith('()') ? name.slice(0, -2).toLowerCase() : null;
  if (fn && tok.t === 'function' && tok.name !== fn) return [];
  const sub = typeNode(name);
  if (!sub) throw UNKNOWN;
  // Ranges on non-primitive types (<length-percentage [0,∞]>): checked on
  // the numeric tokens they consume.
  const ends = match(sub, tokens, pos);
  if (!range) return ends;
  return ends.filter((end) =>
    tokens.slice(pos, end).every((t) => !('v' in t) || typeof t.v !== 'number' || inRange(t.v, range)),
  );
}

// <declaration-value>, <any-value>: one or more of anything.
function anyRest(tokens, pos) {
  const ends = [];
  for (let end = pos + 1; end <= tokens.length; end++) ends.push(end);
  return ends;
}

const COLOR_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
  'contrast-color',
  'device-cmyk',
]);
const colorCache = new Map();
function colorToken(tok, name) {
  if (tok.t === 'ident') {
    if (tok.v === 'currentcolor' || tok.v === 'transparent')
      return name === 'color' || name === 'color-base' || tok.v === 'transparent';
    return parseColorCached(tok.v);
  }
  if (tok.t === 'hash') return PRIMITIVES['hex-color'](tok);
  // Color functions; their arguments are not checked.
  if (tok.t === 'function') return COLOR_FUNCTIONS.has(tok.name);
  return false;
}
function parseColorCached(ident) {
  let ok = colorCache.get(ident);
  if (ok === undefined) {
    ok = resolveColor(ident) !== null;
    colorCache.set(ident, ok);
  }
  return ok;
}

// || and &&: each item at most once, in any order. || needs at least one;
// && needs all, where an item that can match nothing counts as present.
function matchUnordered(items, tokens, pos, all) {
  const results = new Set();
  const complete = (p, used) => {
    for (let i = 0; i < items.length; i++) {
      if (!(used & (1 << i)) && !match(items[i], tokens, p).includes(p)) return false;
    }
    return true;
  };
  const visit = (p, used, count) => {
    if (all ? complete(p, used) : count > 0) results.add(p);
    for (let i = 0; i < items.length; i++) {
      if (used & (1 << i)) continue;
      for (const end of match(items[i], tokens, p)) {
        if (end === p) continue;
        visit(end, used | (1 << i), count + 1);
      }
    }
  };
  visit(pos, 0, 0);
  return [...results].sort((a, b) => a - b);
}

function matchRepeat(node, tokens, pos) {
  const { min, max, comma } = node;
  let frontier = [pos];
  let ends = min === 0 ? [pos] : [];
  for (let count = 1; count <= max && frontier.length; count++) {
    let next = [];
    for (const p of frontier) {
      let start = p;
      if (comma && count > 1) {
        if (tokens[p]?.t !== 'comma') continue;
        start = p + 1;
      }
      for (const end of match(node.node, tokens, start)) if (end > start || count <= min) next.push(end);
    }
    next = [...new Set(next)];
    if (count >= min) ends = union(ends, next);
    // A repetition that consumed nothing cannot grow further.
    frontier = next.filter((e) => !frontier.includes(e));
    if (count > tokens.length + 1) break;
  }
  return ends;
}

function matchesWhole(node, tokens) {
  if (!node) return tokens.length === 0;
  return match(node, tokens, 0).includes(tokens.length);
}

// --- entry point -----------------------------------------------------------------------------

function hasVar(tokens) {
  for (const tok of tokens) {
    if (tok.t === 'function') {
      if (
        tok.name === 'var' ||
        tok.name === 'env' ||
        tok.name === 'attr' ||
        tok.name === 'inherit' ||
        tok.name === 'if'
      )
        return true;
      if (hasVar(tok.args)) return true;
    } else if (tok.t === 'block' && hasVar(tok.items)) return true;
  }
  return false;
}

// Value shapes: values that differ only in their numbers usually have the
// same validity (translate(12px, 3px) and translate(13px, 4px)). A shape
// keeps what validation can depend on: each number's class (zero, positive
// or negative, integer or not) and its unit. Numbers inside identifiers and
// hash tokens (#123456, translate3d) are kept as written. Properties whose
// grammar has a numeric bound other than 0 and infinity (font-weight's
// [1,1000]) are not shaped: 400 and 1001 have the same shape. A value
// with a character U+0000 to U+0004, a placeholder's, has no shape (null):
// url(/\x01.png) is invalid, url(/1.png) valid (#144).
const isDigit = (c) => c >= 48 && c <= 57;
// Characters after which a digit continues a word or hash token.
const isWordChar = (c) =>
  (c >= 48 && c <= 57) ||
  (c >= 65 && c <= 90) ||
  (c >= 97 && c <= 122) ||
  c === 95 ||
  c === 45 ||
  c === 35 ||
  c === 46 ||
  c === 92 ||
  c > 127;
function shapeOf(value) {
  let out = '';
  let last = 0;
  const n = value.length;
  for (let i = 0; i < n; i++) {
    let c = value.charCodeAt(i);
    if (c <= 4) return null;
    let j = i;
    let negative = false;
    if (c === 43 || c === 45) {
      // + -
      const next = value.charCodeAt(i + 1);
      if (!(isDigit(next) || (next === 46 && isDigit(value.charCodeAt(i + 2))))) continue;
      negative = c === 45;
      j++;
      c = value.charCodeAt(j);
    } else if (!(isDigit(c) || (c === 46 && isDigit(value.charCodeAt(i + 1))))) continue;
    if (i > 0 && isWordChar(value.charCodeAt(i - 1))) continue;
    // The number: digits, a fraction, an exponent.
    let zero = true;
    let integer = true;
    while (j < n && isDigit(value.charCodeAt(j))) {
      if (value.charCodeAt(j) !== 48) zero = false;
      j++;
    }
    if (value.charCodeAt(j) === 46 && isDigit(value.charCodeAt(j + 1))) {
      integer = false;
      j++;
      while (j < n && isDigit(value.charCodeAt(j))) {
        if (value.charCodeAt(j) !== 48) zero = false;
        j++;
      }
    }
    const e = value.charCodeAt(j);
    if (
      (e === 101 || e === 69) &&
      (isDigit(value.charCodeAt(j + 1)) ||
        ((value.charCodeAt(j + 1) === 43 || value.charCodeAt(j + 1) === 45) && isDigit(value.charCodeAt(j + 2))))
    ) {
      integer = false;
      j += 2;
      while (j < n && isDigit(value.charCodeAt(j))) j++;
    }
    out +=
      value.slice(last, i) +
      (zero ? '\u0000' : negative ? (integer ? '\u0003' : '\u0004') : integer ? '\u0001' : '\u0002');
    last = j;
    i = j - 1;
  }
  return last === 0 ? value : out + value.slice(last);
}

// Does a grammar reach a range bound other than 0 and ±∞?
function hasFiniteBound(node, seen = new Set()) {
  if (!node) return false;
  switch (node.k) {
    case 'type': {
      if (node.range && node.range.some((b) => b !== 0 && Number.isFinite(b))) return true;
      if (seen.has(node.name)) return false;
      seen.add(node.name);
      return hasFiniteBound(typeNode(node.name), seen);
    }
    case 'prop': {
      if (seen.has("'" + node.name)) return false;
      seen.add("'" + node.name);
      return hasFiniteBound(propertyNode(node.name), seen);
    }
    case 'fn':
    case 'block':
      return hasFiniteBound(node.body, seen);
    case 'rep':
    case 'required':
      return hasFiniteBound(node.node, seen);
    case 'seq':
    case 'one':
    case 'any':
    case 'all':
      return node.items.some((item) => hasFiniteBound(item, seen));
    default:
      return false;
  }
}

// Per property: its grammar and its shape cache (null: not shaped), in one
// lookup.
const entries = new Map();
function entryOf(name) {
  let entry = entries.get(name);
  if (entry === undefined) {
    const node = propertyNode(name);
    entry = { node, shapes: node && !hasFiniteBound(node) ? new Map() : null };
    entries.set(name, entry);
  }
  return entry;
}

// Is value valid for property name? True when the property is unknown to
// the grammars or uses rules this module does not implement.
export function isValidValue(name, value) {
  if (name.startsWith('--')) return true;
  newlineSpaces = name === 'background-image';
  const { node, shapes } = entryOf(name);
  if (!node) return true;
  if (shapes === null) return checkValue(node, value);
  const shape = shapeOf(value);
  if (shape === null) return checkValue(node, value);
  let valid = shapes.get(shape);
  if (valid === undefined) {
    valid = checkValue(node, value);
    if (shapes.size >= 1000) shapes.clear();
    shapes.set(shape, valid);
  }
  return valid;
}

// Validation fails open: an error here (a value the tokenizer or matcher
// does not handle) accepts the value rather than breaking the page.
function checkValue(node, value) {
  try {
    return checkTokens(node, value);
  } catch {
    return true;
  }
}

function checkTokens(node, value) {
  const tokens = tokenize(value);
  if (!tokens) return false;
  if (tokens.length === 0) return false;
  if (tokens.length === 1 && tokens[0].t === 'ident' && CSS_WIDE.has(tokens[0].v)) return true;
  if (hasVar(tokens)) return true;
  try {
    return matchesWhole(node, tokens);
  } catch (error) {
    if (error === UNKNOWN) return true;
    throw error;
  }
}

// Is the property one the grammars define (so setting it can be validated)?
export const hasGrammar = (name) => Object.hasOwn(PROPERTY_SYNTAX, name);

// For tests and diagnostics: why a value is accepted ('grammar', 'unparsed'
// when the property's grammar could not be read, 'unknown' when matching
// reached a type defined in prose).
export function validationReason(name, value) {
  const node = propertyNode(name);
  if (!node) return 'unparsed';
  const tokens = tokenize(value);
  if (!tokens || tokens.length === 0) return 'invalid';
  try {
    return matchesWhole(node, tokens) ? 'grammar' : 'invalid';
  } catch (error) {
    if (error === UNKNOWN) return 'unknown';
    throw error;
  }
}
