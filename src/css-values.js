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
import { mathType } from './calc31.js';
import { ALIASES } from './css-data.js';

// --- tokens --------------------------------------------------------------------------------
// A component value list: whitespace is dropped (the grammar is matched on
// component values), functions and blocks hold their own lists.
//   { t: 'ident', v }      { t: 'number', v, int }   { t: 'percentage', v }
//   { t: 'dimension', v, unit }   { t: 'string' }   { t: 'hash', v }
//   { t: 'delim', v }      { t: 'comma' }   { t: 'url' }
//   { t: 'function', name, args: [...] }   { t: 'block', open, items: [...] }

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i;
// An escape (CSS Syntax 3, 4.3.7): up to six hex digits and the one
// whitespace character after them (\31 FOO is one identifier), or any
// other character.
const IDENT_START = /[a-zA-Z_\u0080-￿]|-[a-zA-Z_\u0080-￿\\-]|\\/;
const IDENT_CHARS = /^(?:[a-zA-Z0-9_\u0080-￿-]|\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[ \t\n\r\f])?|.))+/;

function tokenize(text) {
  let i = 0;
  const n = text.length;
  let math = 0; // math functions open
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
        // An escaped quote doesn't end the string ("a\\"b"; #279 review).
        let end = i + 1;
        let broken = false;
        while (end < n && text[end] !== c) {
          if (text[end] === '\n' || text[end] === '\r' || text[end] === '\f') broken = true;
          if (text[end] !== '\\') end++;
          // (an escaped CR LF is one line continuation)
          else if (text[end + 1] === '\r' && text[end + 2] === '\n') end += 3;
          else end += 2;
        }
        // (tracing: a string the end closes is one; a line break makes it a
        // bad string)
        if (end >= n && !tracing) return null;
        if (broken && tracing) badString = true;
        out.push({ t: 'string', s: i, e: Math.min(end + 1, n), closed: end < n });
        i = end + 1;
        continue;
      }
      if (c === ',') {
        out.push({ t: 'comma', s: i, e: i + 1 });
        i++;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        const s = i++;
        const items = list(c === '(' ? ')' : c === '[' ? ']' : '}');
        if (!items) return null;
        out.push({ t: 'block', open: c, items, s, e: i });
        continue;
      }
      if (c === '#') {
        const m = IDENT_CHARS.exec(text.slice(i + 1));
        if (m) {
          out.push({ t: 'hash', v: m[0], s: i, e: i + 1 + m[0].length });
          i += 1 + m[0].length;
          continue;
        }
        out.push({ t: 'delim', v: c, s: i, e: i + 1 });
        i++;
        continue;
      }
      const s = i;
      const rest = text.slice(i);
      const num = NUMBER.exec(rest);
      if (num && !(c === '-' && /^-[a-zA-Z_-]/.test(rest)) && !(c === '+' && /^\+[a-zA-Z]/.test(rest))) {
        i += num[0].length;
        const v = Number(num[0]);
        const int = /^[+-]?\d+$/.test(num[0]);
        if (text[i] === '%') {
          i++;
          out.push({ t: 'percentage', v, s, e: i });
          continue;
        }
        const unit = IDENT_CHARS.exec(text.slice(i));
        if (unit && IDENT_START.test(text.slice(i, i + 2))) {
          i += unit[0].length;
          out.push({ t: 'dimension', v, unit: unit[0].toLowerCase(), s, e: i });
          continue;
        }
        out.push({ t: 'number', v, int, s, e: i });
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
            if (url === null) return null;
            out.push({ t: 'url', url: url.url, s, e: url.end });
            i = url.end;
            continue;
          }
          // A var( here is one jsdom does not read as var() (checkTokens
          // reads the others first): the value is invalid (red,var(--a),
          // rgb(1,var(--a),3), VAR(--a); black box: jsdom 20 to 30, #234).
          // In a math function, whose insides are not checked otherwise,
          // only VAR(: jsdom 20 to 22, 25 and 27 to 30 drop calc(VAR(--a) +
          // 1px) and calc(1px+var(--a)); 23, 24 and 26 keep both, the first
          // as calc(1px + var(--a)). Not modeled: those differences.
          if (lower === 'var' && (math === 0 || name !== 'var')) return null;
          const inMath = MATH.has(lower);
          if (inMath) math++;
          const args = list(')');
          if (inMath) math--;
          if (!args) return null;
          out.push({ t: 'function', name: lower, args, s, e: i });
          continue;
        }
        out.push({ t: 'ident', v: name.toLowerCase(), s, e: i });
        continue;
      }
      out.push({ t: 'delim', v: c, s, e: i + 1 });
      i++;
    }
    // (tracing: the end closes what is open, CSS Syntax 3)
    return close && !tracing ? null : out;
  }
  return list(null);
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
  if (!urlOpens(text, open)) return -1;
  const n = text.length;
  for (let j = open + 1; j < n; j++) {
    const c = text.charCodeAt(j);
    if (c === 92) j++;
    else if (c === 41) return j + 1;
  }
  return n;
}
// Does an unquoted url() open at text[open], a "("? url in any case, not
// after a name character, before it; no quote after it (past spaces).
// Whether the text before text[at] makes what starts there part of an
// earlier token: a name character, the # of a hash or the @ of an
// at-keyword (#url(, @url( are no url(), #293 review), or the end of an
// escape (a\ url( and \61 url( are one name).
function partOfToken(text, at) {
  const c = text.charCodeAt(at - 1);
  if (isNameCode(c) || c === 35 || c === 64) return true;
  // (an escaped character, not a line break: a backslash before one is no
  // escape, a\<LF>url( is a and a url(; #293 review)
  const lineBreak = c === 10 || c === 13 || c === 12;
  let slashes = 0;
  while (at - 2 - slashes >= 0 && text.charCodeAt(at - 2 - slashes) === 92) slashes++;
  if (slashes % 2 === 1) return !lineBreak;
  if (!isSpace(c)) return false;
  // (a whitespace that ends a hex escape, CR LF as one: \61<CR><LF>url()
  let j = c === 10 && text.charCodeAt(at - 2) === 13 ? at - 3 : at - 2;
  const end = j;
  while (j >= 0 && end - j < 6 && isHexDigit(text.charCodeAt(j))) j--;
  if (j === end || text.charCodeAt(j) !== 92) return false;
  slashes = 0;
  while (j - slashes >= 0 && text.charCodeAt(j - slashes) === 92) slashes++;
  return slashes % 2 === 1;
}
const isHexDigit = (c) => (c >= 48 && c <= 57) || ((c | 32) >= 97 && (c | 32) <= 102);
function urlOpens(text, open) {
  if (
    open < 3 ||
    (text.charCodeAt(open - 1) | 32) !== 108 ||
    (text.charCodeAt(open - 2) | 32) !== 114 ||
    (text.charCodeAt(open - 3) | 32) !== 117 ||
    (open > 3 && partOfToken(text, open - 3))
  )
    return false;
  let j = open + 1;
  while (j < text.length && isSpace(text.charCodeAt(j))) j++;
  const q = text.charCodeAt(j);
  return q !== 34 && q !== 39;
}
// Does the value have var()? jsdom 23 to 30 read var( in lowercase only,
// at the value's start or after whitespace, "(", "/" or "*", wherever it
// is: in a string or a comment too (black box, #234). var(--a) red,
// calc(1px*var(--a)), url(var(--a).png), url(a\ var(--a).png), "a
// var(--a)" and /* var( */ have var(); VAR(--a), notvar(, -var(,
// url("var(x).png"), red,var(--a), url(a.png)var(--a), 1px+var(--a) and
// x\+var(--a) have not (#222, #234). One pass, without allocating.
export function hasVarFunction(value) {
  for (let i = value.indexOf('var('); i !== -1; i = value.indexOf('var(', i + 4))
    if (i === 0 || opensVar(value.charCodeAt(i - 1))) return true;
  return false;
}
// Whitespace (as JavaScript's \s), "(", "/" or "*".
const opensVar = (c) =>
  c === 0x20 ||
  (c >= 0x09 && c <= 0x0d) ||
  c === 0x28 ||
  c === 0x2f ||
  c === 0x2a ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000 ||
  c === 0xfeff;
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
  return memo === null ? matchNode(node, tokens, pos) : ends(node, tokens, pos);
}

function matchNode(node, tokens, pos) {
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
      if (!p) {
        if (lenient) return [];
        throw UNKNOWN;
      }
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
  // A generic family keyword alone (serif) is <generic-family>; the same
  // word as a one-identifier <family-name> would be a second reading of
  // it, so it is not one. A name of several words that starts with one
  // (Serif Extra) is: jsdom 20 to 26 keep it, 27+ reject it in css.js
  // (#279 review).
  if (name === 'font-family-name' && tok.t === 'ident' && GENERIC_KEYWORDS.has(tok.v) && tokens[pos + 1]?.t !== 'ident')
    return [];
  const fn = name.endsWith('()') ? name.slice(0, -2).toLowerCase() : null;
  if (fn && tok.t === 'function' && tok.name !== fn) return [];
  const sub = typeNode(name);
  if (!sub) {
    if (lenient) return [];
    throw UNKNOWN;
  }
  // Ranges on non-primitive types (<length-percentage [0,∞]>): checked on
  // the numeric tokens they consume.
  const ends = match(sub, tokens, pos);
  if (!range) return ends;
  return ends.filter((end) =>
    tokens.slice(pos, end).every((t) => !('v' in t) || typeof t.v !== 'number' || inRange(t.v, range)),
  );
}

// <generic-complete> and <generic-incomplete> (CSS Fonts 4).
const GENERIC_KEYWORDS = new Set([
  'serif',
  'sans-serif',
  'system-ui',
  'cursive',
  'fantasy',
  'math',
  'monospace',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);

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

// (the ends found are collected in a set and sorted once: a union per
// repetition made a long comma list cubic, 27 s for a font with 2,000
// families; #289 review)
// A comma list of what is itself a comma list (font's <'font-family'>#,
// font-family being [ ... ]#) is that list: X# of X = Y# is Y#, both
// without bounds. Read so, a long list has one way to split instead of
// quadratically many (#289 review).
function innerCommaList(node) {
  let inner = node.node;
  if (inner.k === 'prop') inner = propertyNode(inner.name);
  return inner && inner.k === 'rep' && inner.comma && inner.min === 1 && inner.max === Infinity ? inner : null;
}
function matchRepeat(node, tokens, pos) {
  if (node.comma && node.min === 1 && node.max === Infinity) {
    const inner = innerCommaList(node);
    if (inner !== null) return matchRepeat(inner, tokens, pos);
  }
  const { min, max, comma } = node;
  let frontier = [pos];
  const ends = new Set();
  if (min === 0) ends.add(pos);
  for (let count = 1; count <= max && frontier.length; count++) {
    const next = new Set();
    for (const p of frontier) {
      let start = p;
      if (comma && count > 1) {
        if (tokens[p]?.t !== 'comma') continue;
        start = p + 1;
      }
      for (const end of match(node.node, tokens, start)) if (end > start || count <= min) next.add(end);
    }
    if (count >= min) for (const end of next) ends.add(end);
    // A repetition that consumed nothing cannot grow further.
    const previous = frontier;
    frontier = [];
    for (const end of next) if (!previous.includes(end)) frontier.push(end);
    if (count > tokens.length + 1) break;
  }
  if (ends.size === 0) return [];
  const out = [...ends];
  if (out.length > 1) out.sort((x, y) => x - y);
  return out;
}

function matchesWhole(node, tokens) {
  if (!node) return tokens.length === 0;
  return match(node, tokens, 0).includes(tokens.length);
}

// --- entry point -----------------------------------------------------------------------------

// env(), attr(), inherit() or if() (var() is hasVarFunction's).
function hasVar(tokens) {
  for (const tok of tokens) {
    if (tok.t === 'function') {
      if (tok.name === 'env' || tok.name === 'attr' || tok.name === 'inherit' || tok.name === 'if') return true;
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
function hasFiniteBound(node, seen = new Set(), leaves = null) {
  if (!node) return false;
  switch (node.k) {
    case 'type': {
      if (leaves !== null && leaves.has(node.name)) return false;
      if (node.range && node.range.some((b) => b !== 0 && Number.isFinite(b))) return true;
      if (seen.has(node.name)) return false;
      seen.add(node.name);
      return hasFiniteBound(typeNode(node.name), seen, leaves);
    }
    case 'prop': {
      if (seen.has("'" + node.name)) return false;
      seen.add("'" + node.name);
      return hasFiniteBound(propertyNode(node.name), seen, leaves);
    }
    case 'fn':
    case 'block':
      return hasFiniteBound(node.body, seen, leaves);
    case 'rep':
    case 'required':
      return hasFiniteBound(node.node, seen, leaves);
    case 'seq':
    case 'one':
    case 'any':
    case 'all':
      return node.items.some((item) => hasFiniteBound(item, seen, leaves));
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
  // A value with an escape is checked itself: a\31 2e1 is one identifier
  // but has the shape of an identifier and a number (#278 review).
  if (shapes === null || value.includes('\\')) return checkValue(node, value);
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
  // A value with var() (as jsdom reads it: hasVarFunction) is valid
  // whatever its tokens: a bad url(), a stray or unclosed parenthesis,
  // bracket, brace or string (var(--a) ), url(a(b c.png) var(--a),
  // var(--a) url(a.png; black box: jsdom 23 to 30, #234).
  if (hasVarFunction(value)) return true;
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

// Is the unit (in lowercase) a length unit?
export const isLengthUnit = (unit) => LENGTH_UNITS.has(unit);
// Is the name (in lowercase) a math function's (calc, min, ...)?
export const isMathFunction = (name) => MATH.has(name);

// Does the property's grammar take a name or a string of its own
// (<custom-ident>, <dashed-ident>, <string>), through any type it reaches?
// jsdom 28.1 and later keep such a property's one-identifier value as
// written (css.js, black box, #187). A property without a grammar does.
const NAME_TYPES = new Set(['custom-ident', 'dashed-ident', 'string']);
const TYPE_REFERENCE = /<('?)([a-z-]+)'?(?:\s*\[[^\]]*\])?>/g;
const takesNames = new Map();
function reachesNames(syntax, seen) {
  for (const [, quoted, type] of syntax.matchAll(TYPE_REFERENCE)) {
    if (NAME_TYPES.has(type)) return true;
    if (seen.has(type)) continue;
    seen.add(type);
    const inner = quoted ? PROPERTY_SYNTAX[type] : TYPE_SYNTAX[type];
    if (inner !== undefined && reachesNames(inner, seen)) return true;
  }
  return false;
}
export function takesNamesOrStrings(name) {
  let out = takesNames.get(name);
  if (out === undefined) {
    const syntax = PROPERTY_SYNTAX[name] ?? PROPERTY_SYNTAX[ALIASES[name]];
    out = syntax === undefined || reachesNames(syntax, new Set());
    takesNames.set(name, out);
  }
  return out;
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

// --- tracing (jsdom 31's declared values, declared31.js) -----------------------------------
// traceValue(name, value): the value's tokens, each labeled with what the
// property's grammar reads it as (tok.as: 'kw', a primitive type's name,
// 'color', 'url', 'lit', 'fn', 'any'), and a family name's first token
// with the index after its last (tok.family); null when the value does not
// match or the grammar reaches a rule not implemented here, false when it
// is invalid where the grammar alone would not say so: a math function of
// another type (calc(0) where a length is), a line break in a string.
// The labels follow one way the value matches: each part as long as it
// can be, as a parser reads (flex: 0 0 is a grow and a shrink).
export function traceValue(name, value) {
  newlineSpaces = name === 'background-image';
  const node = propertyNode(name);
  if (!node) return null;
  try {
    tracing = true;
    badString = false;
    const tokens = tokenize(value);
    tracing = false;
    if (badString) return false;
    if (!tokens || tokens.length === 0 || hasVar(tokens)) return null;
    // (values that differ only in their numbers trace alike: the labels by
    // the value's shape, as isValidValue caches validity, unless a bound
    // the trace checks can tell them apart: font-weight's [1,1000]; one
    // inside a color, which the trace takes whole, cannot)
    const shape = value.includes('\\') || readsBound(name) ? null : shapeOf(value);
    let byShape = null;
    if (shape !== null) {
      byShape = traceShapes.get(name);
      if (byShape === undefined) traceShapes.set(name, (byShape = new Map()));
      const labels = byShape.get(shape);
      if (labels !== undefined) {
        if (labels === false || labels === null) return labels;
        relabel(tokens, labels, 0);
        return tokens;
      }
    }
    lenient = true;
    mathRefused = false;
    memo = new Map();
    let out;
    if (trace(node, tokens, 0, tokens.length)) out = tokens;
    else out = mathRefused ? false : null;
    if (byShape !== null) {
      if (byShape.size >= 1000) byShape.clear();
      // (not a value that did not match: a numeric bound may be why,
      // font-weight: 1001.1, and another of its shape may match)
      if (out !== null) byShape.set(shape, out === tokens ? labelsOf(tokens, []) : out);
    }
    return out;
  } catch (error) {
    if (error === UNKNOWN) return null;
    throw error;
  } finally {
    lenient = false;
    tracing = false;
    memo = null;
  }
}

// Does tracing the property's values check a numeric bound other than 0
// and infinity (colors are leaves to it)?
const COLOR_LEAVES = new Set(['color', 'color-base', 'named-color', 'system-color']);
const boundsRead = new Map();
function readsBound(name) {
  let out = boundsRead.get(name);
  if (out === undefined) boundsRead.set(name, (out = hasFiniteBound(propertyNode(name), new Set(), COLOR_LEAVES)));
  return out;
}
const traceShapes = new Map(); // name -> shape -> labels | false | null
// A trace's labels, token by token in document order (into a function's
// arguments and a block's items after the token itself).
function labelsOf(tokens, out) {
  for (const tok of tokens) {
    out.push(tok.as, tok.family);
    if (tok.t === 'function') labelsOf(tok.args, out);
    else if (tok.t === 'block') labelsOf(tok.items, out);
  }
  return out;
}
function relabel(tokens, labels, at) {
  for (const tok of tokens) {
    if (labels[at] !== undefined) tok.as = labels[at];
    if (labels[at + 1] !== undefined) tok.family = labels[at + 1];
    at += 2;
    if (tok.t === 'function') at = relabel(tok.args, labels, at);
    else if (tok.t === 'block') at = relabel(tok.items, labels, at);
  }
  return at;
}

// Where a node can end, remembered for the trace (a trace asks again for
// the parts of what it matched): tokens -> node -> ends by position.
let memo = null;
function ends(node, tokens, pos) {
  let byNode = memo.get(tokens);
  if (byNode === undefined) memo.set(tokens, (byNode = new Map()));
  let byPos = byNode.get(node);
  if (byPos === undefined) byNode.set(node, (byPos = []));
  let out = byPos[pos];
  if (out === undefined) byPos[pos] = out = matchNode(node, tokens, pos);
  return out;
}
// Set while tracing: a string the end closes is read (CSS Syntax 3), and
// badString notes a line break in one.
let tracing = false;
let badString = false;
// Whether tracing refused a math function for its type (or as invalid).
let mathRefused = false;
// While tracing, a rule not implemented here matches nothing (the value
// may still match another way), rather than accepting everything.
let lenient = false;

function trace(node, tokens, pos, end) {
  switch (node.k) {
    case 'kw':
    case 'lit':
      if (end !== pos + 1 || !ends(node, tokens, pos).includes(end)) return false;
      tokens[pos].as = node.k;
      return true;
    case 'type':
      return traceType(node, tokens, pos, end);
    case 'prop': {
      const p = propertyNode(node.name);
      if (!p) throw UNKNOWN;
      return trace(p, tokens, pos, end);
    }
    case 'fn':
    case 'block': {
      if (end !== pos + 1 || !ends(node, tokens, pos).includes(end)) return false;
      const tok = tokens[pos];
      tok.as = 'fn';
      const inner = node.k === 'fn' ? tok.args : tok.items;
      return node.body ? trace(node.body, inner, 0, inner.length) : true;
    }
    case 'seq':
      return traceSeq(node.items, 0, tokens, pos, end);
    case 'one': {
      // A 0 that could be a <number> or a <length> is a <number> (CSS
      // Values 4, 6.2): an alternative of numbers first.
      const zero = end === pos + 1 && tokens[pos].t === 'number' && tokens[pos].v === 0;
      const items = zero ? [...node.items].sort((a, b) => isNumberType(b) - isNumberType(a)) : node.items;
      for (const item of items) if (ends(item, tokens, pos).includes(end) && trace(item, tokens, pos, end)) return true;
      return false;
    }
    case 'any':
    case 'all':
      return traceUnordered(node, tokens, pos, end);
    case 'rep':
      return traceRepeat(node, tokens, pos, end);
    case 'required':
      return end > pos && trace(node.node, tokens, pos, end);
    default:
      throw UNKNOWN;
  }
}

function traceType(node, tokens, pos, end) {
  if (!ends(node, tokens, pos).includes(end)) return false;
  const { name } = node;
  const tok = tokens[pos];
  if (PRIMITIVES[name] || ANY_ONE.has(name)) {
    // (a math function: read as the type its result is of)
    if (isMath(tok) && MATH_TYPES[name] !== undefined) {
      const type = mathType(tok);
      if (type !== undefined && type !== MATH_TYPES[name] && !(type === 'percentage' && name === 'length')) {
        mathRefused = true;
        return false;
      }
    }
    tok.as = name;
    return true;
  }
  if (name === 'color' || name === 'color-base' || name === 'named-color' || name === 'system-color') {
    tok.as = 'color';
    return true;
  }
  if (name === 'url') {
    tok.as = 'url';
    return true;
  }
  if (name === 'declaration-value' || name === 'any-value') {
    for (let i = pos; i < end; i++) tokens[i].as = 'any';
    return true;
  }
  const sub = typeNode(name);
  if (!sub) throw UNKNOWN;
  if (!trace(sub, tokens, pos, end)) return false;
  if (name === 'font-family-name' || name === 'family-name') tok.family = end;
  return true;
}

const isNumberType = (node) => Number(node.k === 'type' && (node.name === 'number' || node.name === 'integer'));

const MATH_TYPES = {
  __proto__: null,
  number: 'number',
  integer: 'number',
  length: 'length',
  percentage: 'percentage',
  angle: 'angle',
  time: 'time',
  frequency: 'frequency',
  resolution: 'resolution',
  flex: 'flex',
};

function traceSeq(items, i, tokens, pos, end) {
  if (i === items.length) return pos === end;
  const item = items[i];
  const found = ends(item, tokens, pos);
  const elided =
    item.k === 'lit' && item.v === ',' && (pos === 0 || pos === tokens.length || tokens[pos - 1]?.t === 'comma');
  if (elided && !found.includes(pos)) found.unshift(pos);
  for (let k = found.length - 1; k >= 0; k--) {
    const p = found[k];
    if (p > end) continue;
    if (p === pos && elided && item.k === 'lit') {
      if (traceSeq(items, i + 1, tokens, p, end)) return true;
      continue;
    }
    if (trace(item, tokens, pos, p) && traceSeq(items, i + 1, tokens, p, end)) return true;
  }
  return false;
}

function traceUnordered(node, tokens, pos, end) {
  const { items } = node;
  const all = node.k === 'all';
  const failed = new Set();
  const go = (p, used, count) => {
    if (p === end) {
      if (!all) return count > 0;
      for (let i = 0; i < items.length; i++)
        if (!(used & (1 << i)) && !ends(items[i], tokens, p).includes(p)) return false;
      return true;
    }
    const key = p * 65536 + used;
    if (failed.has(key)) return false;
    for (let i = 0; i < items.length; i++) {
      if (used & (1 << i)) continue;
      // (longest first, as a parser reads)
      const found = ends(items[i], tokens, p);
      for (let k = found.length - 1; k >= 0; k--) {
        const e = found[k];
        if (e === p || e > end) continue;
        if (go(e, used | (1 << i), count + 1) && trace(items[i], tokens, p, e)) return true;
      }
    }
    failed.add(key);
    return false;
  };
  return go(pos, 0, 0);
}

function traceRepeat(node, tokens, pos, end) {
  if (node.comma && node.min === 1 && node.max === Infinity) {
    const inner = innerCommaList(node);
    if (inner !== null) return traceRepeat(inner, tokens, pos, end);
  }
  const { min, max, comma } = node;
  const failed = new Set();
  const go = (count, p) => {
    if (p === end && count >= min) return true;
    if (count >= max) return false;
    const key = Math.min(count, min) * 65536 + p;
    if (max === Infinity && failed.has(key)) return false;
    let start = p;
    if (comma && count > 0) {
      if (tokens[p]?.t !== 'comma') return false;
      tokens[p].as = 'lit';
      start = p + 1;
    }
    const found = ends(node.node, tokens, start);
    for (let k = found.length - 1; k >= 0; k--) {
      const e = found[k];
      if (e > end || (e === start && count >= min)) continue;
      if (go(count + 1, e) && trace(node.node, tokens, start, e)) return true;
    }
    if (max === Infinity) failed.add(key);
    return false;
  };
  return go(0, pos);
}

// A value's component values (tokenize), or null when it does not read.
// (read as tracing reads it: the end closes strings and functions)
export function tokenizeValue(value) {
  tracing = true;
  try {
    return tokenize(value);
  } finally {
    tracing = false;
  }
}

// An identifier's or string's text with its escapes read (CSS Syntax 3).
export function readEscapes(text) {
  if (!text.includes('\\')) return text;
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text[i] !== '\\') out += text[i++];
    else if (i + 1 >= text.length) i++;
    else if (text[i + 1] === '\n' || text[i + 1] === '\f') i += 2;
    else if (text[i + 1] === '\r') i += text[i + 2] === '\n' ? 3 : 2;
    else i = readEscape(text, i, (cp) => (out += cp));
  }
  return out;
}

// The keywords a property's grammar reaches (lowercase), and the
// predefined counter styles where it reaches <counter-style-name> (CSS
// Counter Styles 3, 9): jsdom 31 writes an identifier that is one in
// lowercase, also where the grammar reads it as a name (animation-name:
// NONE is none, list-style-type: Square square).
const COUNTER_STYLES =
  'decimal decimal-leading-zero arabic-indic armenian upper-armenian lower-armenian bengali cambodian khmer ' +
  'cjk-decimal devanagari georgian gujarati gurmukhi hebrew kannada lao malayalam mongolian myanmar oriya ' +
  'persian lower-roman upper-roman tamil telugu thai tibetan lower-alpha lower-latin upper-alpha upper-latin ' +
  'lower-greek hiragana hiragana-iroha katakana katakana-iroha disc circle square disclosure-open ' +
  'disclosure-closed cjk-earthly-branch cjk-heavenly-stem japanese-informal japanese-formal ' +
  'korean-hangul-formal korean-hanja-informal korean-hanja-formal simp-chinese-informal simp-chinese-formal ' +
  'trad-chinese-informal trad-chinese-formal ethiopic-numeric';
const keywordSets = new Map();
export function keywordsOf(name) {
  let set = keywordSets.get(name);
  if (set === undefined) {
    set = new Set();
    collectKeywords(propertyNode(name), set, new Set());
    keywordSets.set(name, set);
  }
  return set;
}
function collectKeywords(node, set, seen) {
  if (!node) return;
  switch (node.k) {
    case 'kw':
      set.add(node.v);
      return;
    case 'type':
      if (seen.has(node.name)) return;
      seen.add(node.name);
      if (node.name === 'counter-style-name') for (const style of COUNTER_STYLES.split(' ')) set.add(style);
      collectKeywords(typeNode(node.name), set, seen);
      return;
    case 'prop':
      if (seen.has("'" + node.name)) return;
      seen.add("'" + node.name);
      collectKeywords(propertyNode(node.name), set, seen);
      return;
    case 'fn':
    case 'block':
      collectKeywords(node.body, set, seen);
      return;
    case 'rep':
    case 'required':
      collectKeywords(node.node, set, seen);
      return;
    case 'seq':
    case 'one':
    case 'any':
    case 'all':
      for (const item of node.items) collectKeywords(item, set, seen);
  }
}
