// var() substitution at computed-value time (CSS Custom Properties 1, 3),
// as jsdom 31 computes styles (black box, 31.0.1): each var(--name) or
// var(--name, fallback) is replaced by the custom property's computed
// value, else by its fallback (substituted too); with neither the whole
// value is invalid at computed-value time (null). The function name is
// matched in any case (VAR(--a)); text outside var() is kept as written,
// whitespace and comments too. Names are read with their escapes decoded
// (\76 ar( is var(, var(--\62) reads --b); var( inside a string, a
// comment, an unquoted url(), a longer name (x\ var(), a hash or an
// at-keyword is text, not a reference.
//
// lookup(context, name): the custom property's computed value ('' when it
// has none), or null when it is invalid (in a cycle).

// Whether a code unit continues an identifier (a backslash starts an
// escape, which does too).
const isNameCode = (c) =>
  (c >= 97 && c <= 122) ||
  (c >= 65 && c <= 90) ||
  (c >= 48 && c <= 57) ||
  c === 45 ||
  c === 95 ||
  c === 92 ||
  c >= 0x80;
const isHex = (c) => (c >= 48 && c <= 57) || ((c | 32) >= 97 && (c | 32) <= 102);

// The index past an escape whose backslash is at i: up to six hex digits
// and one whitespace after them, or the one character escaped.
function escapeEnd(text, i) {
  let j = i + 1;
  if (j >= text.length) return j;
  if (!isHex(text.charCodeAt(j))) return j + 1;
  const max = j + 6;
  while (j < text.length && j < max && isHex(text.charCodeAt(j))) j++;
  if (j < text.length && isSpace(text.charCodeAt(j))) {
    // (\r\n is one whitespace)
    j += text.charCodeAt(j) === 13 && text.charCodeAt(j + 1) === 10 ? 2 : 1;
  }
  return j;
}

// The index past the name (code points and escapes) starting at i.
function wordEnd(text, i) {
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 92) i = escapeEnd(text, i);
    else if (isNameCode(c)) i++;
    else break;
  }
  return i;
}

// A name with its escapes decoded (an invalid code point is U+FFFD).
function decodeName(text) {
  if (!text.includes('\\')) return text;
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text.charCodeAt(i) !== 92) {
      out += text[i++];
      continue;
    }
    const end = escapeEnd(text, i);
    let k = i + 1;
    while (k < end && isHex(text.charCodeAt(k))) k++;
    if (k > i + 1) {
      const n = parseInt(text.slice(i + 1, k), 16);
      out += n === 0 || (n >= 0xd800 && n <= 0xdfff) || n > 0x10ffff ? '\ufffd' : String.fromCodePoint(n);
    } else out += text.slice(i + 1, end);
    i = end;
  }
  return out;
}

// The index past a string starting at i (its quote), escapes skipped.
function stringEnd(value, i) {
  const quote = value.charCodeAt(i);
  for (let j = i + 1; j < value.length; j++) {
    const c = value.charCodeAt(j);
    if (c === 92) j++;
    else if (c === quote) return j + 1;
  }
  return value.length;
}

// The index past a comment starting at i, or past the value if unclosed.
function commentEnd(value, i) {
  const end = value.indexOf('*/', i + 2);
  return end === -1 ? value.length : end + 2;
}

// The index past the parenthesis closing the one at open - 1, or -1:
// nested parentheses counted, strings and comments skipped.
function closing(value, open) {
  let depth = 1;
  for (let i = open; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) {
      if (--depth === 0) return i + 1;
    } else if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else if (c === 47 && value.charCodeAt(i + 1) === 42) i = commentEnd(value, i) - 1;
    else if (c === 92) i++;
  }
  return -1;
}

// The first comma of a var()'s arguments outside nested functions,
// strings and comments, or -1.
function topComma(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) depth--;
    else if (c === 34 || c === 39) i = stringEnd(text, i) - 1;
    else if (c === 47 && text.charCodeAt(i + 1) === 42) i = commentEnd(text, i) - 1;
    else if (c === 92) i++;
    else if (c === 44 && depth === 0) return i;
  }
  return -1;
}

// Whether the url( arguments starting at i begin, past whitespace, with a
// quote: url("a") is a function holding a string, not a url token.
function quotedUrl(value, i) {
  while (i < value.length && isSpace(value.charCodeAt(i))) i++;
  const c = value.charCodeAt(i);
  return c === 34 || c === 39;
}

// The index of the next var( reference at or after from, or -1, with the
// index past its "(" in varOpen: strings, comments, unquoted url()
// tokens, hashes and at-keywords skipped, names read whole.
let varOpen = 0;
function nextVar(value, from) {
  for (let i = from; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else if (c === 47 && value.charCodeAt(i + 1) === 42) i = commentEnd(value, i) - 1;
    else if (c === 35 || c === 64) {
      // (#name, @name: one token, no function)
      if (i + 1 < value.length && isNameCode(value.charCodeAt(i + 1))) i = wordEnd(value, i + 1) - 1;
    } else if (isNameCode(c)) {
      const end = wordEnd(value, i);
      if (value.charCodeAt(end) === 40 && end - i <= 24) {
        const name = decodeName(value.slice(i, end)).toLowerCase();
        if (name === 'var') {
          varOpen = end + 1;
          return i;
        }
        if (name === 'url' && !quotedUrl(value, end + 1)) {
          // (an unquoted url() is one token, kept whole; a quoted one is
          // a function, its string skipped like any other)
          const close = value.indexOf(')', end + 1);
          i = close === -1 ? value.length - 1 : close;
          continue;
        }
      }
      i = end - 1;
    }
  }
  return -1;
}

// Whether a custom property's value holds more than 65536 tokens (jsdom
// 31, black box: such a computed value is invalid, which also bounds a
// substitution chain that doubles at each step). Comments are no tokens;
// each token is at least one character, so a shorter value is never
// counted.
const MAX_TOKENS = 65536;
export function tooManyTokens(value) {
  if (value.length <= MAX_TOKENS) return false;
  let count = 0;
  for (let i = 0; i < value.length;) {
    i = token(value, i, value.length);
    if (tokenKind !== 'comment' && ++count > MAX_TOKENS) return true;
  }
  return false;
}

// Whether value holds a var() reference (not var( as text).
export const hasVarReference = (value) => nextVar(value, 0) !== -1;

export function substituteVars(value, lookup, context) {
  let out = '';
  let at = 0;
  // (the kind of out's last token, to keep pieces from running together)
  let last = null;
  for (let i = nextVar(value, 0); i !== -1; i = nextVar(value, at)) {
    const open = varOpen;
    const end = closing(value, open);
    if (end === -1) return null;
    const inner = value.slice(open, end - 1);
    const comma = topComma(inner);
    const name = decodeName(trimEnds(comma === -1 ? inner : inner.slice(0, comma)));
    // (a name that is no custom property's has no value: the fallback)
    let replacement = name.startsWith('--') ? lookup(context, name) : '';
    if (replacement === null) return null;
    if (replacement === '') {
      if (comma === -1) return null;
      replacement = substituteVars(trimSpace(inner.slice(comma + 1)), lookup, context);
      if (replacement === null) return null;
    }
    if (i > at) {
      out += apart(last, value, at, i);
      last = lastToken(value, at, i);
    }
    if (replacement !== '') {
      out += apart(last, replacement, 0, replacement.length);
      last = lastToken(replacement, 0, replacement.length);
    }
    at = end;
  }
  if (at === 0) return value;
  return at < value.length ? out + apart(last, value, at, value.length) : out;
}

// Token boundaries (CSS Syntax 3, 9, as jsdom 31 serializes: black box,
// 31.0.1). A piece joined after a token of kind left starts with an empty
// comment when its first token would otherwise run into that one: 1 then
// px is 1/**/px, not 1px.
const WORDS = ['ident', 'function', 'url', '-', 'number', 'percentage', 'dimension', 'CDC'];
const MERGES = {
  ident: new Set([...WORDS, '(']),
  '-': new Set(WORDS),
  number: new Set(['ident', 'function', 'url', 'number', 'percentage', 'dimension', '%', 'CDC']),
  dimension: new Set(WORDS),
  hash: new Set(WORDS),
  'at-keyword': new Set(WORDS),
  '#': new Set(WORDS),
  '@': new Set(['ident', 'function', 'url', '-', 'CDC']),
  '.': new Set(['number', 'percentage', 'dimension']),
  '+': new Set(['number', 'percentage', 'dimension']),
  '/': new Set(['*']),
};

function apart(left, text, from, to) {
  const piece = text.slice(from, to);
  if (left === null || MERGES[left] === undefined) return piece;
  token(text, from, to);
  return MERGES[left].has(tokenKind) ? `/**/${piece}` : piece;
}

// The kind of the last token of text[from, to).
function lastToken(text, from, to) {
  let kind = null;
  for (let i = from; i < to;) {
    i = token(text, i, to);
    kind = tokenKind;
  }
  return kind;
}

const isDigit = (c) => c >= 48 && c <= 57;
const startsName = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c >= 0x80 || c === 92;
// Whether an identifier starts at i: a name start, or "-" then a name
// start or "-".
const startsIdent = (text, i, to) => {
  const c = text.charCodeAt(i);
  if (c === 45) return i + 1 < to && (startsName(text.charCodeAt(i + 1)) || text.charCodeAt(i + 1) === 45);
  return i < to && startsName(c);
};
// Whether a number starts at i: a digit, or "." / "+" / "-" before one.
const startsNumber = (text, i, to) => {
  const c = text.charCodeAt(i);
  if (isDigit(c)) return true;
  const d = i + 1 < to ? text.charCodeAt(i + 1) : 0;
  if (c === 46) return isDigit(d);
  if (c === 43 || c === 45) return isDigit(d) || (d === 46 && i + 2 < to && isDigit(text.charCodeAt(i + 2)));
  return false;
};

// token's result: the kind of the token read, and token returns the index
// past it (no object per token).
let tokenKind = null;
const found = (kind, end) => {
  tokenKind = kind;
  return end;
};

// The token at text[i] (before to): its kind, as CSS Syntax 3 names it
// (a delimiter by its character), and the index past it.
function token(text, i, to) {
  const c = text.charCodeAt(i);
  if (isSpace(c)) {
    let j = i + 1;
    while (j < to && isSpace(text.charCodeAt(j))) j++;
    return found('whitespace', j);
  }
  if (c === 47 && text.charCodeAt(i + 1) === 42) return found('comment', Math.min(commentEnd(text, i), to));
  if (c === 34 || c === 39) return found('string', Math.min(stringEnd(text, i), to));
  if (startsNumber(text, i, to)) {
    let j = c === 43 || c === 45 ? i + 1 : i;
    while (j < to && isDigit(text.charCodeAt(j))) j++;
    if (text.charCodeAt(j) === 46 && j + 1 < to && isDigit(text.charCodeAt(j + 1))) {
      j++;
      while (j < to && isDigit(text.charCodeAt(j))) j++;
    }
    const e = text.charCodeAt(j) | 32;
    if (e === 101 && j + 1 < to) {
      const k = text.charCodeAt(j + 1) === 43 || text.charCodeAt(j + 1) === 45 ? j + 2 : j + 1;
      if (k < to && isDigit(text.charCodeAt(k))) {
        j = k;
        while (j < to && isDigit(text.charCodeAt(j))) j++;
      }
    }
    if (j < to && text.charCodeAt(j) === 37) return found('percentage', j + 1);
    if (startsIdent(text, j, to)) return found('dimension', Math.min(wordEnd(text, j), to));
    return found('number', j);
  }
  if (c === 45 && text.startsWith('-->', i) && i + 3 <= to) return found('CDC', i + 3);
  if (startsIdent(text, i, to)) {
    const j = Math.min(wordEnd(text, i), to);
    if (text.charCodeAt(j) !== 40 || j >= to) return found('ident', j);
    if (j - i <= 24 && decodeName(text.slice(i, j)).toLowerCase() === 'url' && !quotedUrl(text, j + 1)) {
      const close = text.indexOf(')', j + 1);
      return found('url', close === -1 || close >= to ? to : close + 1);
    }
    return found('function', j + 1);
  }
  if ((c === 35 || c === 64) && i + 1 < to && isNameCode(text.charCodeAt(i + 1)))
    return found(c === 35 ? 'hash' : 'at-keyword', Math.min(wordEnd(text, i + 1), to));
  return found(text[i], i + 1);
}

// CSS whitespace (U+00A0 is not: it continues a name).
const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

function trimSpace(value) {
  let start = 0,
    end = value.length;
  while (start < end && isSpace(value.charCodeAt(start))) start++;
  while (end > start && isSpace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}

// A substituted custom property's value without the whitespace and
// comments at its ends (jsdom 31: var(--b) /* c */ is 1px). Comments do
// not nest: a forward scan finds where each one starts.
export function trimEnds(value) {
  let start = 0;
  // (end: past the last character that is neither whitespace nor in a
  // comment)
  let end = 0;
  for (let i = 0; i < value.length;) {
    const c = value.charCodeAt(i);
    if (c === 47 && value.charCodeAt(i + 1) === 42) {
      const close = value.indexOf('*/', i + 2);
      if (close === -1) {
        // (unclosed: kept as text)
        if (end === 0) start = i;
        end = value.length;
        break;
      }
      i = close + 2;
      if (end === 0) start = i;
    } else if (isSpace(c)) {
      i++;
      if (end === 0) start = i;
    } else if (c === 34 || c === 39) {
      i = stringEnd(value, i);
      end = i;
    } else {
      // (an escape keeps the next character)
      i += c === 92 && i + 1 < value.length ? 2 : 1;
      end = i;
    }
  }
  return end === 0 ? '' : value.slice(start, end);
}
