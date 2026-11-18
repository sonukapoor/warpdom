// Declaration lists as jsdom 31 reads them (black box, 31.0.1; #269 part
// C): CSS Syntax 3's tokenizer and "parse a list of declarations", for the
// style attribute, cssText and a rule's block.
// - The text is tokenized as CSS Syntax 3 says: a string ends at a line
//   break as a bad string, so the next quote starts a string that runs to
//   the end (content: "a<LF>b"; color: red declares neither); an unquoted
//   url() with whitespace or a quote inside is a bad url.
// - A declaration is a name, a colon and its component values up to a ;
//   outside blocks (a ; inside (), [] or {} is part of the value). A block
//   left open is closed at the end ([a; left: 1px is [a; left: 1px]).
// - A value with a bad string, a bad url or a ), ] or } that closes
//   nothing is invalid. A ! and important (in any case) at its end make it
//   !important, read again while it ends so (red !important!important).
// - Names are read with their escapes (--\61 b is --ab); a custom
//   property's value is its text without the comments and whitespace at
//   its ends, one space when that leaves nothing (--x:; is --x: ' '); in
//   another property's value a comment between two components is a space.
// - A ! outside blocks or right in a var()'s arguments, not followed by
//   important, makes the value invalid (a !b, var(--c, a !b)); inside a
//   block left open at the end it is no priority ([a; !important]).
// parseDeclarationList31(text) returns [{ name, value, important, custom,
// empty }] (name as read, not lowercased; value as text for the rules
// after it).

// --- Tokens, in arrays reused from call to call (no object per token):
// TYPE[k], START[k] and END[k] (the source span), CLOSED[k] (a string or
// comment that is closed). Text is read from the source only where it is
// needed: a declaration's name, url(, var(, important.
const WS = 1;
const COMMENT = 2;
const IDENT = 3;
const FUNCTION = 4;
const AT = 5;
const HASH = 6;
const STRING = 7;
const BAD_STRING = 8;
const URL = 9;
const BAD_URL = 10;
const NUMBER = 11;
const DELIM = 12;
const COLON = 13;
const SEMI = 14;
const COMMA = 15;
const OPEN = 16;
const CLOSE = 17;

let TYPE = new Uint8Array(64);
let START = new Int32Array(64);
let END = new Int32Array(64);
let CLOSED = new Uint8Array(64);
let count = 0;

function push(type, start, end, closed) {
  if (count === TYPE.length) {
    const size = count * 2;
    const type2 = new Uint8Array(size);
    const start2 = new Int32Array(size);
    const end2 = new Int32Array(size);
    const closed2 = new Uint8Array(size);
    type2.set(TYPE);
    start2.set(START);
    end2.set(END);
    closed2.set(CLOSED);
    TYPE = type2;
    START = start2;
    END = end2;
    CLOSED = closed2;
  }
  TYPE[count] = type;
  START[count] = start;
  END[count] = end;
  CLOSED[count] = closed;
  count++;
}

// (character codes; NaN past the end matches none of these)
const isWs = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
const isDigit = (c) => c >= 48 && c <= 57;
const isNameStart = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c >= 128;
const isName = (c) => isNameStart(c) || isDigit(c) || c === 45;
const isHex = (c) => isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
// (a backslash at the end is one too, for U+FFFD; #327 review)
const validEscape = (text, i) => text.charCodeAt(i) === 92 && text.charCodeAt(i + 1) !== 10;
function startsIdent(text, i) {
  const c = text.charCodeAt(i);
  if (c === 45) {
    const d = text.charCodeAt(i + 1);
    return isNameStart(d) || d === 45 || validEscape(text, i + 1);
  }
  return isNameStart(c) || validEscape(text, i);
}
function startsNumber(text, i) {
  const c = text.charCodeAt(i);
  if (c === 43 || c === 45) {
    const d = text.charCodeAt(i + 1);
    return isDigit(d) || (d === 46 && isDigit(text.charCodeAt(i + 2)));
  }
  if (c === 46) return isDigit(text.charCodeAt(i + 1));
  return isDigit(c);
}

// The index after the escape at text[i] (a backslash).
function escapeEnd(text, i) {
  let j = i + 1;
  if (j >= text.length) return j;
  if (!isHex(text.charCodeAt(j))) return j + (text.codePointAt(j) > 0xffff ? 2 : 1);
  const stop = j + 6;
  while (j < stop && isHex(text.charCodeAt(j))) j++;
  // (one whitespace after it, CRLF too: text not preprocessed, as
  // setProperty() gives it)
  const c = text.charCodeAt(j);
  if (c === 13 && text.charCodeAt(j + 1) === 10) return j + 2;
  return isWs(c) ? j + 1 : j;
}
// The code point the escape at text[i] stands for.
function escapeChar(text, i) {
  let j = i + 1;
  if (!isHex(text.charCodeAt(j))) return j >= text.length ? '�' : String.fromCodePoint(text.codePointAt(j));
  const stop = j + 6;
  while (j < stop && isHex(text.charCodeAt(j))) j++;
  const cp = parseInt(text.slice(i + 1, j), 16);
  return cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? '�' : String.fromCodePoint(cp);
}
// The end of an identifier's characters from i.
function nameEnd(text, i) {
  for (;;) {
    if (isName(text.charCodeAt(i))) i++;
    else if (validEscape(text, i)) i = escapeEnd(text, i);
    else return i;
  }
}
// The index of the first backslash from start to end, or -1 (bounded: a
// search to the end of the text for each name would be quadratic; #327
// review).
// (none searched for when the text tokenized has no backslash at all)
let slashes = false;
function firstSlash(text, start, end) {
  if (!slashes) return -1;
  for (let k = start; k < end; k++) if (text.charCodeAt(k) === 92) return k;
  return -1;
}
// An identifier's text from start to end, its escapes read.
function decode(text, start, end) {
  const slash = firstSlash(text, start, end);
  if (slash === -1) return text.slice(start, end);
  let out = text.slice(start, slash);
  let i = slash;
  while (i < end) {
    if (text.charCodeAt(i) === 92) {
      out += escapeChar(text, i);
      i = escapeEnd(text, i);
    } else out += text[i++];
  }
  return out;
}
// Whether the identifier from start to end is word (lowercase), in any case.
function identIs(text, start, end, word) {
  if (firstSlash(text, start, end) !== -1) return decode(text, start, end).toLowerCase() === word;
  if (end - start !== word.length) return false;
  // (| 32: an ASCII letter in lowercase)
  for (let k = 0; k < word.length; k++) if ((text.charCodeAt(start + k) | 32) !== word.charCodeAt(k)) return false;
  return true;
}
function numberEnd(text, i) {
  let c = text.charCodeAt(i);
  if (c === 43 || c === 45) c = text.charCodeAt(++i);
  while (isDigit(text.charCodeAt(i))) i++;
  if (text.charCodeAt(i) === 46 && isDigit(text.charCodeAt(i + 1))) {
    i += 2;
    while (isDigit(text.charCodeAt(i))) i++;
  }
  c = text.charCodeAt(i);
  if (c === 101 || c === 69) {
    let j = i + 1;
    const sign = text.charCodeAt(j);
    if (sign === 43 || sign === 45) j++;
    if (isDigit(text.charCodeAt(j))) {
      i = j + 1;
      while (isDigit(text.charCodeAt(i))) i++;
    }
  }
  if (startsIdent(text, i)) return nameEnd(text, i);
  return text.charCodeAt(i) === 37 ? i + 1 : i;
}
// An unquoted url( from i (after the parenthesis and whitespace): its end,
// pushed as a url, or a bad url (whitespace inside, a quote, a
// parenthesis, a bad escape).
function url(text, start, i) {
  const n = text.length;
  let bad = false;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 41) break;
    if (isWs(c)) {
      while (i < n && isWs(text.charCodeAt(i))) i++;
      if (i < n && text.charCodeAt(i) !== 41) bad = true;
    } else if (c === 92) {
      if (validEscape(text, i)) i = escapeEnd(text, i);
      else {
        bad = true;
        i++;
      }
    } else {
      // (a quote, a parenthesis or a non-printable character)
      if (c === 34 || c === 39 || c === 40 || c <= 8 || c === 11 || (c >= 14 && c <= 31) || c === 127) bad = true;
      i++;
    }
  }
  const closed = i < n;
  if (closed) i++;
  push(bad ? BAD_URL : URL, start, i, closed ? 1 : 0);
  return i;
}

function tokenize(text) {
  count = 0;
  slashes = text.indexOf('\\') !== -1;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const s = i;
    const c = text.charCodeAt(i);
    if (c === 47 && text.charCodeAt(i + 1) === 42) {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      push(COMMENT, s, i, end === -1 ? 0 : 1);
    } else if (isWs(c)) {
      while (i < n && isWs(text.charCodeAt(i))) i++;
      push(WS, s, i, 0);
    } else if (c === 34 || c === 39) {
      i++;
      let bad = false;
      while (i < n) {
        const d = text.charCodeAt(i);
        if (d === c) break;
        if (d === 10) {
          bad = true;
          break;
        }
        // (an escape; an escaped CRLF is one line break, not preprocessed
        // as an accessor gives it; #327 review)
        if (d !== 92 || i + 1 >= n) i++;
        else i += text.charCodeAt(i + 1) === 13 && text.charCodeAt(i + 2) === 10 ? 3 : 2;
      }
      const closed = !bad && i < n;
      if (closed) i++;
      push(bad ? BAD_STRING : STRING, s, i, closed ? 1 : 0);
    } else if (c === 35 && (isName(text.charCodeAt(i + 1)) || validEscape(text, i + 1))) {
      i = nameEnd(text, i + 1);
      push(HASH, s, i, 0);
    } else if (c === 40 || c === 91 || c === 123) push(OPEN, s, ++i, 0);
    else if (c === 41 || c === 93 || c === 125) push(CLOSE, s, ++i, 0);
    else if (c === 44) push(COMMA, s, ++i, 0);
    else if (c === 58) push(COLON, s, ++i, 0);
    else if (c === 59) push(SEMI, s, ++i, 0);
    else if (startsNumber(text, i)) {
      i = numberEnd(text, i);
      push(NUMBER, s, i, 0);
    } else if (c === 64 && startsIdent(text, i + 1)) {
      i = nameEnd(text, i + 1);
      push(AT, s, i, 0);
    } else if (startsIdent(text, i)) {
      i = nameEnd(text, i);
      if (text.charCodeAt(i) !== 40) push(IDENT, s, i, 0);
      else if (identIs(text, s, i, 'url')) {
        // url(: a quoted one is a function, an unquoted one a url token
        let j = i + 1;
        while (j < n && isWs(text.charCodeAt(j))) j++;
        const q = text.charCodeAt(j);
        if (q === 34 || q === 39) push(FUNCTION, s, ++i, 0);
        else i = url(text, s, j);
      } else push(FUNCTION, s, ++i, 0);
    } else {
      i += c >= 0xd800 && c <= 0xdbff ? 2 : 1;
      push(DELIM, s, i, 0);
    }
  }
}

// --- Blocks: a stack of the closers they need (41, 93 or 125; VAR for a
// var( function, closed by a parenthesis too).
const VAR = 1;
let STACK = new Uint8Array(32);
let depth = 0;
function open(code) {
  if (depth === STACK.length) {
    const stack = new Uint8Array(depth * 2);
    stack.set(STACK);
    STACK = stack;
  }
  STACK[depth++] = code;
}
function opener(text, k) {
  if (TYPE[k] === FUNCTION) return identIs(text, START[k], END[k] - 1, 'var') ? VAR : 41;
  const c = text.charCodeAt(START[k]);
  if (c === 40) return 41;
  return c === 91 ? 93 : 125;
}
// The closers of the blocks still open, innermost first.
function closers() {
  let out = '';
  for (let k = depth - 1; k >= 0; k--) out += STACK[k] === VAR ? ')' : String.fromCharCode(STACK[k]);
  return out;
}

// The tokens from k to the next ; outside blocks (or the end): its index,
// the blocks still open then in STACK.
function untilSemicolon(text, k) {
  depth = 0;
  for (; k < count; k++) {
    const type = TYPE[k];
    if (type === SEMI && depth === 0) break;
    if (type === OPEN || type === FUNCTION) open(opener(text, k));
    else if (type === CLOSE && depth > 0) {
      const top = STACK[depth - 1];
      if ((top === VAR ? 41 : top) === text.charCodeAt(START[k])) depth--;
    }
  }
  return k;
}

// The index of the ; or of the } closing the block that ends the at-rule
// at k (or the end).
function atRuleEnd(text, k) {
  depth = 0;
  for (; k < count; k++) {
    const type = TYPE[k];
    if (type === SEMI && depth === 0) return k;
    if (type === OPEN || type === FUNCTION) open(opener(text, k));
    else if (type === CLOSE && depth > 0) {
      const top = STACK[depth - 1];
      if ((top === VAR ? 41 : top) === text.charCodeAt(START[k])) {
        depth--;
        if (depth === 0 && top === 125) return k;
      }
    }
  }
  return k;
}

const meaningful = (k) => TYPE[k] !== WS && TYPE[k] !== COMMENT;

export function parseDeclarationList31(text) {
  tokenize(text);
  const out = [];
  let k = 0;
  while (k < count) {
    const type = TYPE[k];
    if (type === WS || type === COMMENT || type === SEMI) {
      k++;
      continue;
    }
    // (an at-rule ends at a ; or at the } of its block, whichever comes
    // first: @media x { color: red } left: 1px keeps left; #327 review)
    const end = type === AT ? atRuleEnd(text, k) : untilSemicolon(text, k);
    if (type === IDENT) {
      const decl = declaration(text, k, end, end === count && depth > 0 ? closers() : '');
      if (decl !== null) out.push(decl);
    }
    // (an at-rule, or anything else up to the ;, is skipped)
    k = end + 1;
  }
  return out;
}

function declaration(text, from, to, closing) {
  let k = from + 1;
  while (k < to && !meaningful(k)) k++;
  if (k >= to || TYPE[k] !== COLON) return null;
  // The value's tokens, without whitespace and comments at the ends.
  let first = k + 1;
  while (first < to && !meaningful(first)) first++;
  // (in a block left open at the end, whitespace and comments at the end
  // are the block's: --x: (a /* b is (a /* b*/); #327 review)
  let last = to - 1;
  if (closing === '') while (last >= first && !meaningful(last)) last--;
  // !important at the end, read again while it ends so (not inside a
  // block left open at the end: --v: [a; !important is [a; !important])
  let important = false;
  while (closing === '' && last > first) {
    if (TYPE[last] !== IDENT || !identIs(text, START[last], END[last], 'important')) break;
    let bang = last - 1;
    while (bang >= first && !meaningful(bang)) bang--;
    if (bang < first || TYPE[bang] !== DELIM || text.charCodeAt(START[bang]) !== 33) break;
    important = true;
    last = bang - 1;
    while (last >= first && !meaningful(last)) last--;
  }
  // A bad string or url, a closer of nothing, or a ! outside blocks or
  // right in a var()'s arguments makes it invalid.
  depth = 0;
  let plain = true;
  for (k = first; k <= last; k++) {
    const type = TYPE[k];
    if (type === BAD_STRING || type === BAD_URL) return null;
    if (type === COMMENT) plain = false;
    else if (type === DELIM) {
      if (text.charCodeAt(START[k]) === 33 && (depth === 0 || STACK[depth - 1] === VAR)) return null;
    } else if (type === OPEN || type === FUNCTION) open(opener(text, k));
    else if (type === CLOSE) {
      const top = depth === 0 ? 0 : STACK[depth - 1];
      if ((top === VAR ? 41 : top) !== text.charCodeAt(START[k])) return null;
      depth--;
    }
  }
  const name = decode(text, START[from], END[from]);
  const custom = name.startsWith('--');
  let value = '';
  if (last >= first) {
    if (custom || (plain && firstSlash(text, START[first], END[last]) === -1))
      value = text.slice(START[first], END[last]);
    else
      // (a comment between two components is a space, else nothing:
      // 1px/**/2px is 1px 2px; names with their escapes read)
      for (k = first; k <= last; k++) {
        if (TYPE[k] !== COMMENT) value += tokenText(text, k);
        else if (TYPE[k - 1] !== COMMENT) {
          // (a run of comments is one: 1px/**//**/2px; #327 review)
          let after = k + 1;
          while (after <= last && TYPE[after] === COMMENT) after++;
          if (meaningful(k - 1) && meaningful(after)) value += ' ';
        }
      }
    // (a string and the blocks left open, closed: only when the value
    // runs to the end; "a b is "a b")
    if (to === count && !important) value = closedAtEnd(text, last, value) + closing;
  }
  const empty = custom && value === '';
  return { name, value: empty ? ' ' : value, important, custom, empty };
}

// A token's text in a value, an identifier's, a hash's or a unit's escapes read when
// it still reads the same (r\65 d is red, 1p\78 is 1px; \31 0px, an
// identifier, is kept as written).
const LETTERS = /^[A-Za-z_\u0080-\uffff-][A-Za-z0-9_\u0080-\uffff-]*$/;
function tokenText(text, k) {
  const start = START[k];
  const end = END[k];
  const slash = firstSlash(text, start, end);
  if (slash === -1) return text.slice(start, end);
  const type = TYPE[k];
  if (type === IDENT || type === FUNCTION) {
    const nameEnds = type === FUNCTION ? end - 1 : end;
    const name = decode(text, start, nameEnds);
    // (\- stays: - alone is no identifier; #327 review)
    return LETTERS.test(name) && name !== '-' && !/^-?[0-9]/.test(name)
      ? name + text.slice(nameEnds, end)
      : text.slice(start, end);
  }
  if (type === NUMBER) {
    let unit = start;
    while (unit < end && !startsIdent(text, unit)) unit++;
    const name = unit < end ? decode(text, unit, end) : '';
    // (an e alone before a + stays escaped: 1\65+3px is no 1e+3px; #327
    // review)
    const exponent = (name === 'e' || name === 'E') && text.charCodeAt(end) === 43;
    return /^[A-Za-z]+$/.test(name) && !exponent ? text.slice(start, unit) + name : text.slice(start, end);
  }
  // (a hash: #\66 ff is #fff)
  if (type === HASH) {
    const name = decode(text, start + 1, end);
    if (/^[A-Za-z0-9_-]+$/.test(name)) return `#${name}`;
  }
  return text.slice(start, end);
}

// A value given on its own (setProperty(), an accessor): its component
// values as one declaration's, the text without comments at its ends (a
// comment between two components a space; css.js keeps a custom
// property's as written); null when it is no value (a ; outside blocks, a
// bad string or url, a closer of nothing, an !important at its end:
// setProperty('color', 'red; color: blue')).
export function parseValue31(text, custom = false) {
  const source = `${custom ? '--x' : 'x'}:${text}`;
  tokenize(source);
  const end = untilSemicolon(source, 2);
  if (end < count) return null;
  const decl = declaration(source, 0, count, depth > 0 ? closers() : '');
  if (decl === null || decl.important) return null;
  return decl.empty ? '' : decl.value;
}

// A value whose last token is k, closed there: a string's quote (a
// backslash left at its end dropped first: "a\ is "a"), an unquoted url's
// ), a comment's */ (#327 review).
function closedAtEnd(text, k, value) {
  if (k < 0) return value;
  const type = TYPE[k];
  if (type === COMMENT) return CLOSED[k] === 1 ? value : `${value}*/`;
  let slashes = 0;
  while (value.charCodeAt(value.length - 1 - slashes) === 92) slashes++;
  const escaped = slashes % 2 === 1;
  if (type === STRING) {
    if (CLOSED[k] === 1) return value;
    return (escaped ? value.slice(0, -1) : value) + text[START[k]];
  }
  // (a backslash at the very end is an escape for U+FFFD: a\ is a\uFFFD;
  // #327 review)
  const out = escaped ? `${value.slice(0, -1)}\uFFFD` : value;
  return type === URL && CLOSED[k] === 0 ? `${out})` : out;
}

// A custom property's value given on its own without the whitespace at
// its ends, but at its end only when no block, string or comment is left
// open there (setProperty('--x', '(a ') is (a ); #327 review).
export function trimmed31(text) {
  const start = text.trimStart();
  const end = start.trimEnd();
  if (end.length === start.length) return end;
  tokenize(start);
  untilSemicolon(start, 0);
  const k = count - 1;
  const open = depth > 0 || (CLOSED[k] === 0 && (TYPE[k] === COMMENT || TYPE[k] === STRING));
  return open ? start : end;
}

// A value given on its own, closed at its end as a declaration list closes
// it: a comment, a string, an unquoted url and the blocks left open
// (setProperty('--x', '(a') is (a)). css.js uses it for a custom
// property's value, kept as written.
export function closed31(text) {
  tokenize(text);
  untilSemicolon(text, 0);
  const out = closedAtEnd(text, count - 1, text);
  return depth > 0 ? out + closers() : out;
}

// A property name as CSSOM serializes an identifier (--a:b is --a\:b).
const PLAIN_NAME = /^(?:--|-?[A-Za-z_\u0080-\uffff])[A-Za-z0-9_\u0080-\uffff-]*$/;
export function serializeName31(name) {
  if (PLAIN_NAME.test(name)) return name;
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === 0) out += '\uFFFD';
    else if (
      (c >= 1 && c <= 31) ||
      c === 127 ||
      (i === 0 && isDigit(c)) ||
      (i === 1 && isDigit(c) && name.charCodeAt(0) === 45)
    )
      out += `\\${c.toString(16)} `;
    else if (i === 0 && c === 45 && name.length === 1) out += '\\-';
    else if (c >= 128 || isName(c)) out += name[i];
    else out += `\\${name[i]}`;
  }
  return out;
}
