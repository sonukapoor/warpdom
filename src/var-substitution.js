// var() substitution at computed-value time (CSS Custom Properties 1, 3),
// as jsdom 31 computes styles (black box, 31.0.1): each var(--name) or
// var(--name, fallback) is replaced by the custom property's computed
// value, else by its fallback (substituted too); with neither, or in a
// cycle, the whole value is invalid at computed-value time (null). The
// function name is matched in any case (VAR(--a)); text outside var() is
// kept as written, whitespace too.
//
// lookup(name): the custom property's computed value ('' when it has
// none), or null when it is in a cycle.

// The index just past the parenthesis closing the one at open - 1, or -1:
// nested parentheses counted, strings and comments skipped.
function closing(value, open) {
  let depth = 1;
  for (let i = open; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) {
      if (--depth === 0) return i + 1;
    } else if (c === 34 || c === 39) {
      const end = value.indexOf(value[i], i + 1);
      if (end === -1) return -1;
      i = end;
    } else if (c === 47 && value.charCodeAt(i + 1) === 42) {
      const end = value.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
    }
  }
  return -1;
}

// The first comma of a var()'s arguments outside nested functions.
function topComma(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) depth--;
    else if (c === 44 && depth === 0) return i;
  }
  return -1;
}

const VAR = /var\(/gi;

export function substituteVars(value, lookup) {
  VAR.lastIndex = 0;
  if (!VAR.test(value)) return value;
  let out = '';
  let at = 0;
  VAR.lastIndex = 0;
  for (let m = VAR.exec(value); m !== null; m = VAR.exec(value)) {
    // (a name ending just before it is another function: avar(...))
    const before = m.index === 0 ? '' : value[m.index - 1];
    if (/[\w-]/.test(before)) continue;
    const open = m.index + 4;
    const end = closing(value, open);
    if (end === -1) return null;
    const inner = value.slice(open, end - 1);
    const comma = topComma(inner);
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    if (!name.startsWith('--')) return null;
    let replacement = lookup(name);
    if (replacement === null) return null;
    if (replacement === '') {
      if (comma === -1) return null;
      replacement = substituteVars(inner.slice(comma + 1).trim(), lookup);
      if (replacement === null) return null;
    }
    out += value.slice(at, m.index) + replacement;
    at = end;
    VAR.lastIndex = end;
  }
  return out + value.slice(at);
}
