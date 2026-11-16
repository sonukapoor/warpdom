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

// The first comma of a var()'s arguments outside nested functions and
// strings, or -1.
function topComma(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) depth--;
    else if (c === 34 || c === 39) i = stringEnd(text, i) - 1;
    else if (c === 92) i++;
    else if (c === 44 && depth === 0) return i;
  }
  return -1;
}

export function substituteVars(value, lookup, context) {
  let out = '';
  let at = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else if (c === 47 && value.charCodeAt(i + 1) === 42) i = commentEnd(value, i) - 1;
    else if (c === 92) i++;
    else if ((c | 32) === 117 && functionAt(value, i, 'url')) {
      // (an unquoted url() is one token, kept whole)
      const end = value.indexOf(')', i + 4);
      i = end === -1 ? value.length : end;
    } else if ((c | 32) === 118 && functionAt(value, i, 'var')) {
      const open = i + 4;
      const end = closing(value, open);
      if (end === -1) return null;
      const inner = value.slice(open, end - 1);
      const comma = topComma(inner);
      const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
      if (!name.startsWith('--')) return null;
      let replacement = lookup(context, name);
      if (replacement === null) return null;
      if (replacement === '') {
        if (comma === -1) return null;
        replacement = substituteVars(inner.slice(comma + 1).trim(), lookup, context);
        if (replacement === null) return null;
      }
      out += value.slice(at, i) + replacement;
      at = end;
      i = end - 1;
    }
  }
  return at === 0 ? value : out + value.slice(at);
}

// A substituted custom property's value without the whitespace and
// comments at its ends (jsdom 31: var(--b) /* c */ is 1px).
export function trimEnds(value) {
  let start = 0,
    end = value.length;
  for (;;) {
    while (start < end && /\s/.test(value[start])) start++;
    if (value.startsWith('/*', start)) {
      const close = value.indexOf('*/', start + 2);
      if (close === -1 || close + 2 > end) break;
      start = close + 2;
    } else break;
  }
  for (;;) {
    while (end > start && /\s/.test(value[end - 1])) end--;
    if (end - start >= 4 && value.startsWith('*/', end - 2)) {
      const open = value.lastIndexOf('/*', end - 3);
      if (open < start) break;
      end = open;
    } else break;
  }
  return value.slice(start, end);
}
