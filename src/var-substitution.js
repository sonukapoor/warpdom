// var() substitution at computed-value time (CSS Custom Properties 1, 3),
// as jsdom 31 computes styles (black box, 31.0.1): each var(--name) or
// var(--name, fallback) is replaced by the custom property's computed
// value, else by its fallback (substituted too); with neither the whole
// value is invalid at computed-value time (null). The function name is
// matched in any case (VAR(--a)); text outside var() is kept as written,
// whitespace and comments too. var( inside a string, a comment, an
// unquoted url() or after an escape is text, not a reference.
//
// lookup(context, name): the custom property's computed value ('' when it
// has none), or null when it is invalid (in a cycle).

// Whether a code unit continues an identifier (so that var( after it is
// part of another name: avar(, x\var().
const isNameCode = (c) =>
  (c >= 97 && c <= 122) ||
  (c >= 65 && c <= 90) ||
  (c >= 48 && c <= 57) ||
  c === 45 ||
  c === 95 ||
  c === 92 ||
  c >= 0x80;

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

// Whether value has the function name (lower case) at i, in any case,
// followed by "(", and not as the end of a longer name.
function functionAt(value, i, name) {
  if (i > 0 && isNameCode(value.charCodeAt(i - 1))) return false;
  if (value.charCodeAt(i + name.length) !== 40) return false;
  for (let k = 0; k < name.length; k++) if ((value.charCodeAt(i + k) | 32) !== name.charCodeAt(k)) return false;
  return true;
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
  while (i < value.length && /\s/.test(value[i])) i++;
  const c = value.charCodeAt(i);
  return c === 34 || c === 39;
}

// The index of the next var( reference at or after from, or -1: strings,
// comments, escapes and unquoted url() tokens skipped.
function nextVar(value, from) {
  for (let i = from; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else if (c === 47 && value.charCodeAt(i + 1) === 42) i = commentEnd(value, i) - 1;
    else if (c === 92) i++;
    else if ((c | 32) === 117 && functionAt(value, i, 'url') && !quotedUrl(value, i + 4)) {
      // (an unquoted url() is one token, kept whole; a quoted one is a
      // function, its string skipped like any other)
      const end = value.indexOf(')', i + 4);
      i = end === -1 ? value.length : end;
    } else if ((c | 32) === 118 && functionAt(value, i, 'var')) return i;
  }
  return -1;
}

// Whether value holds a var() reference (not var( as text).
export const hasVarReference = (value) => nextVar(value, 0) !== -1;

export function substituteVars(value, lookup, context) {
  let out = '';
  let at = 0;
  for (let i = nextVar(value, 0); i !== -1; i = nextVar(value, at)) {
    const open = i + 4;
    const end = closing(value, open);
    if (end === -1) return null;
    const inner = value.slice(open, end - 1);
    const comma = topComma(inner);
    const name = trimEnds(comma === -1 ? inner : inner.slice(0, comma));
    // (a name that is no custom property's has no value: the fallback)
    let replacement = name.startsWith('--') ? lookup(context, name) : '';
    if (replacement === null) return null;
    if (replacement === '') {
      if (comma === -1) return null;
      replacement = substituteVars(trimSpace(inner.slice(comma + 1)), lookup, context);
      if (replacement === null) return null;
    }
    out += value.slice(at, i) + replacement;
    at = end;
  }
  return at === 0 ? value : out + value.slice(at);
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
