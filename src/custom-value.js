// A custom property's value read from a style sheet, re-serialized token
// by token as jsdom 29 and later read it (black box, 29.1.1 to 30.1.3;
// #264 item 59). Inline styles, rule.style.cssText and setProperty keep
// the value as written.
//
// Measured (test/css-profiles.test.js "a custom property in a style
// sheet"):
// - whitespace and comments between two tokens are one space, or none
//   where the pair is in DROPS below (a , b is a,b; 1px +2px is
//   1px+2px; a "s" is a"s"), and none at the start or end of the value
//   or inside a block (f( a ) is f(a), [ a ] is [a]); + or - then + or -
//   keeps two spaces;
// - strings are written in double quotes with their escapes decoded
//   ('a' is "a", "\41" is "A"), urls without quotes (url( "a b" ) is
//   url(a\ b));
// - idents, numbers, hashes and delimiters keep their spelling (\61 b,
//   1E3px);
// - a value with a {} block, a bad string or url, or an unclosed block
//   is kept as written.
//
// The token kinds below are the rows and columns of that measurement.

const HEX = /[0-9a-fA-F]/;
// (code unit checks, not regular expressions: a sheet's every custom
// property goes through here)
const isNameStart = (c) => {
  const n = c.charCodeAt(0);
  return (n >= 97 && n <= 122) || (n >= 65 && n <= 90) || n === 95 || n >= 0x80;
};
const isName = (c) => {
  const n = c.charCodeAt(0);
  return isNameStart(c) || (n >= 48 && n <= 57) || n === 45;
};
const isDigit = (c) => c >= '0' && c <= '9';
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

// Left kinds: I ident, N number, D dimension, P percentage, H hash,
// S string, U url, F function or (), B [], C comma, L slash, T star.
// For a right token kind, the left kinds after which the whitespace
// between them is dropped.
const A = 'SUBCLT';
const ALL = 'INDPHSUFBCLT';
const DROPS = {
  __proto__: null,
  ident: A + 'P',
  number: A + 'PF',
  plus: ALL, // a number, dimension or percentage with a + sign
  minus: A + 'N', // a number, dimension or percentage with a - sign
  dimension: A,
  percentage: A,
  hash: A + 'NP',
  string: ALL,
  url: A + 'PF',
  function: A,
  paren: 'NDPHSUFBCLT',
  bracket: ALL,
  comma: ALL,
  slash: ALL,
  star: 'INDPHSUFBCT',
};

// The left kind of a token (its letter), or '' for one after which
// whitespace is always kept.
const LEFT = {
  __proto__: null,
  ident: 'I',
  number: 'N',
  dimension: 'D',
  percentage: 'P',
  hash: 'H',
  string: 'S',
  url: 'U',
  function: 'F',
  paren: 'F',
  bracket: 'B',
  comma: 'C',
  slash: 'L',
  star: 'T',
};

// Delimiters with a kind of their own.
const DELIMS = { __proto__: null, ',': 'comma', '/': 'slash', '*': 'star' };

class Bad extends Error {}

// Reads an escape at text[i] (the backslash): [code point, next index].
function escape(text, i) {
  let j = i + 1;
  let hex = '';
  while (hex.length < 6 && j < text.length && HEX.test(text[j])) hex += text[j++];
  if (hex === '') return [text.codePointAt(j), j + String.fromCodePoint(text.codePointAt(j)).length];
  if (text[j] === '\r' && text[j + 1] === '\n') j += 2;
  else if (j < text.length && isSpace(text[j])) j++;
  const cp = parseInt(hex, 16);
  return [cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? 0xfffd : cp, j];
}

// A backslash followed by a newline (LF, CR or form feed) is no escape
// outside strings.
const validEscape = (text, i) => {
  if (text[i] !== '\\' || i + 1 >= text.length) return false;
  const next = text[i + 1];
  return next !== '\n' && next !== '\r' && next !== '\f';
};

function startsIdent(text, i) {
  const c = text[i];
  if (c === '-') {
    const d = text[i + 1];
    return d === '-' || (d !== undefined && isNameStart(d)) || validEscape(text, i + 1);
  }
  return (c !== undefined && isNameStart(c)) || validEscape(text, i);
}

function startsNumber(text, i) {
  let j = i;
  if (text[j] === '+' || text[j] === '-') j++;
  if (isDigit(text[j] ?? '')) return true;
  return text[j] === '.' && isDigit(text[j + 1] ?? '');
}

// The end of the name at i (escapes included, as written).
function nameEnd(text, i) {
  let j = i;
  while (j < text.length) {
    if (isName(text[j])) j++;
    else if (validEscape(text, j)) j = escape(text, j)[1];
    else break;
  }
  return j;
}

function numberEnd(text, i) {
  let j = i;
  if (text[j] === '+' || text[j] === '-') j++;
  while (isDigit(text[j] ?? '')) j++;
  if (text[j] === '.' && isDigit(text[j + 1] ?? '')) {
    j++;
    while (isDigit(text[j] ?? '')) j++;
  }
  if (text[j] === 'e' || text[j] === 'E') {
    let k = j + 1;
    if (text[k] === '+' || text[k] === '-') k++;
    if (isDigit(text[k] ?? '')) {
      j = k;
      while (isDigit(text[j] ?? '')) j++;
    }
  }
  return j;
}

// A string's value (escapes decoded) from the quote at i: [value, end].
function readString(text, i) {
  const quote = text[i];
  let value = '';
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === quote) return [value, j + 1];
    if (c === '\n' || c === '\r' || c === '\f') throw new Bad();
    if (c === '\\') {
      if (j + 1 >= text.length) {
        j++;
        continue;
      }
      // An escaped newline (LF, CR, CRLF or form feed) continues the string.
      const after = text[j + 1];
      if (after === '\n' || after === '\f') {
        j += 2;
        continue;
      }
      if (after === '\r') {
        j += text[j + 2] === '\n' ? 3 : 2;
        continue;
      }
      const [cp, next] = escape(text, j);
      value += String.fromCodePoint(cp);
      j = next;
      continue;
    }
    value += c === '\0' ? '�' : c;
    j++;
  }
  throw new Bad(); // unclosed
}

// An unquoted url's value from i (after url( and its whitespace): [value,
// end after the closing parenthesis].
function readUrl(text, i) {
  let value = '';
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === ')') return [value, j + 1];
    if (isSpace(c)) {
      while (isSpace(text[j] ?? '')) j++;
      if (text[j] === ')') return [value, j + 1];
      throw new Bad();
    }
    if (c === '"' || c === "'" || c === '(' || c.charCodeAt(0) <= 8 || c === '\v' || c === '\x7f') throw new Bad();
    if (c.charCodeAt(0) >= 0x0e && c.charCodeAt(0) <= 0x1f) throw new Bad();
    if (c === '\\') {
      if (!validEscape(text, j)) throw new Bad();
      const [cp, next] = escape(text, j);
      value += String.fromCodePoint(cp);
      j = next;
      continue;
    }
    value += c;
    j++;
  }
  throw new Bad();
}

// Reads tokens from i up to the closing character (or the end): an array
// of { kind, text, space } where space tells whether whitespace or a
// comment came before it, and the index after the closer. Nesting deeper
// than MAX_DEPTH keeps the value as written instead of exhausting the stack.
const MAX_DEPTH = 1000;

function readList(text, i, closer, depth = 0) {
  if (depth > MAX_DEPTH) throw new Bad();
  const tokens = [];
  let space = false;
  let j = i;
  const push = (kind, out, sign = '') => {
    tokens.push({ kind, text: out, space, sign });
    space = false;
  };
  while (j < text.length) {
    const c = text[j];
    if (isSpace(c)) {
      space = true;
      j++;
      continue;
    }
    if (c === '/' && text[j + 1] === '*') {
      const end = text.indexOf('*/', j + 2);
      j = end === -1 ? text.length : end + 2;
      space = true;
      continue;
    }
    if (c === closer) return [tokens, j + 1];
    if (c === ')' || c === ']' || c === '}' || c === '{' || c === ';') throw new Bad();
    if (c === '"' || c === "'") {
      const [value, end] = readString(text, j);
      push('string', serializeString(value));
      j = end;
      continue;
    }
    if (c === '(' || c === '[') {
      const [inner, end] = readList(text, j + 1, c === '(' ? ')' : ']', depth + 1);
      push(c === '(' ? 'paren' : 'bracket', c + serializeList(inner) + (c === '(' ? ')' : ']'));
      j = end;
      continue;
    }
    if (startsNumber(text, j)) {
      const start = j;
      j = numberEnd(text, j);
      let kind = 'number';
      if (text[j] === '%') {
        kind = 'percentage';
        j++;
      } else if (startsIdent(text, j)) {
        kind = 'dimension';
        j = nameEnd(text, j);
      }
      push(kind, text.slice(start, j), c === '+' || c === '-' ? c : '');
      continue;
    }
    if (startsIdent(text, j)) {
      const start = j;
      j = nameEnd(text, j);
      const name = text.slice(start, j);
      if (text[j] !== '(') {
        push('ident', name);
        continue;
      }
      j++;
      if (/^url$/i.test(name)) {
        let k = j;
        while (isSpace(text[k] ?? '')) k++;
        if (text[k] !== '"' && text[k] !== "'") {
          const [value, end] = readUrl(text, k);
          push('url', `url(${serializeUrl(value)})`);
          j = end;
          continue;
        }
        const [value, afterString] = readString(text, k);
        let m = afterString;
        while (isSpace(text[m] ?? '')) m++;
        if (text[m] === ')') {
          push('url', `url(${serializeUrl(value)})`);
          j = m + 1;
          continue;
        }
      }
      const [inner, end] = readList(text, j, ')', depth + 1);
      push('function', `${name}(${serializeList(inner)})`);
      j = end;
      continue;
    }
    if (c === '#' && j + 1 < text.length && (isName(text[j + 1]) || validEscape(text, j + 1))) {
      const start = j;
      j = nameEnd(text, j + 1);
      push('hash', text.slice(start, j));
      continue;
    }
    // jsdom reports a colon or an at-keyword anywhere in the value as a
    // parse error and keeps the value as written.
    if (c === ':' || (c === '@' && startsIdent(text, j + 1))) throw new Bad();
    if (c === '\\') throw new Bad(); // a backslash that is no escape
    const delim = String.fromCodePoint(text.codePointAt(j));
    push(DELIMS[c] ?? 'delim', delim);
    j += delim.length;
  }
  if (closer !== null) throw new Bad(); // unclosed block
  return [tokens, j];
}

// The right kind a token is looked up by in DROPS.
const SIGNED = { __proto__: null, '+': 'plus', '-': 'minus' };
const rightKind = (token) => SIGNED[token.sign] ?? token.kind;
const plusMinus = (t) => t.kind === 'delim' && (t.text === '+' || t.text === '-');

function serializeList(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (i > 0 && token.space) {
      const before = tokens[i - 1];
      if (plusMinus(before) && plusMinus(token)) out += '  ';
      else {
        const left = LEFT[before.kind];
        const drops = DROPS[rightKind(token)];
        if (!(left && drops?.includes(left))) out += ' ';
      }
    }
    out += token.text;
  }
  return out;
}

const hexEscape = (cp) => `\\${cp.toString(16)}`;

function serializeString(value) {
  let out = '"';
  const chars = Array.from(value);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const cp = c.codePointAt(0);
    if (cp === 0) out += '�';
    else if (cp <= 0x1f || cp === 0x7f) {
      out += hexEscape(cp);
      const next = chars[i + 1];
      if (next !== undefined && (HEX.test(next) || next === ' ')) out += ' ';
    } else if (c === '"' || c === '\\') out += `\\${c}`;
    else out += c;
  }
  return `${out}"`;
}

function serializeUrl(value) {
  let out = '';
  const chars = Array.from(value);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const cp = c.codePointAt(0);
    if (cp === 0) out += '�';
    else if (c === ' ' || c === '"' || c === "'" || c === '(' || c === ')' || c === '\\') out += `\\${c}`;
    else if (cp <= 0x1f || cp === 0x7f) {
      out += hexEscape(cp);
      const next = chars[i + 1];
      if (next !== undefined && HEX.test(next)) out += ' ';
    } else out += c;
  }
  return out;
}

const PLAIN = /^[\w#.-]+(?: [\w.][\w#.-]*)*$/;

// Results by value: a test suite reads the same sheets in every window.
// Cleared when full.
const cache = new Map();
const CACHE_SIZE = 2000;

// The value as jsdom 29 and later read it from a sheet, or the value as
// written when it is kept so.
export function reserializeCustom(value) {
  // Idents, numbers, dimensions and hashes with single spaces between
  // them, none after a space starting with a sign or #: as written
  // (4px, 0 auto, #fff).
  if (PLAIN.test(value)) return value;
  let out = cache.get(value);
  if (out !== undefined) return out;
  try {
    out = serializeList(readList(value, 0, null)[0]);
  } catch (error) {
    // A stack smaller than MAX_DEPTH needs (an edge runtime) also keeps it.
    if (!(error instanceof Bad || error instanceof RangeError)) throw error;
    out = value;
  }
  if (cache.size >= CACHE_SIZE) cache.clear();
  cache.set(value, out);
  return out;
}
