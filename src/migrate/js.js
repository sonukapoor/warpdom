// A small JavaScript / TypeScript / JSON scanner for `warpdom migrate`
// (no dependencies): tokens with their offsets (comments kept apart), and
// the object properties of a text with their key paths, so that a config
// can be edited at one exact string literal and everything else left as
// it is. It is not a parser: it understands enough structure (objects,
// arrays, calls, blocks) to tell `test: { environment: 'jsdom' }` from a
// 'jsdom' anywhere else, and anything it cannot follow is left for the
// report rather than guessed.

// After these tokens a `/` starts a regular expression, not a division.
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '&&', '||', '??', '=>',
  '==', '===', '!=', '!==', '+', '-', '*', '%', '<', '>', '<=', '>=', '~', '^', '...', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '&&=', '||=', '??=', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'yield', 'await', 'instanceof']);
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '??=', '&&=', '||=', '=>', '==', '!=', '<=', '>=',
  '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
// A `(` after these is a condition or grouping, not a call.
const NOT_CALLEE = new Set(['if', 'while', 'for', 'switch', 'catch', 'return', 'typeof', 'await', 'case', 'in', 'of',
  'else', 'do', 'void', 'delete', 'throw', 'yield', 'new', 'instanceof', 'with', 'export', 'default', 'satisfies', 'as']);
// A `{` after these identifiers starts an object literal (after any other
// identifier, a block: class X {, else {, try {).
const OBJECT_AFTER = new Set(['return', 'default', 'yield', 'await', 'typeof', 'case', 'in', 'of', 'throw', 'void', 'satisfies', 'as']);

const isIdentStart = (c) => /[A-Za-z_$#\u0080-￿]/.test(c);
const isIdentPart = (c) => /[\w$\u0080-￿]/.test(c);

function unescape(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '', '\r\n': '' }[e] ?? e;
  });
}

// Skips a string starting at i (a quote); returns the index after it.
function skipString(text, i) {
  const q = text[i];
  let j = i + 1;
  while (j < text.length && text[j] !== q) {
    if (text[j] === '\\') j++;
    else if (text[j] === '\n' && q !== '`') break;
    j++;
  }
  return j + 1;
}

// Skips a template literal starting at i (a backtick); returns
// { end, hasExpr }.
function skipTemplate(text, i) {
  let j = i + 1;
  let hasExpr = false;
  while (j < text.length && text[j] !== '`') {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === '$' && text[j + 1] === '{') {
      hasExpr = true;
      j += 2;
      let depth = 1;
      while (j < text.length && depth > 0) {
        const c = text[j];
        if (c === "'" || c === '"') { j = skipString(text, j); continue; }
        if (c === '`') { j = skipTemplate(text, j).end; continue; }
        if (c === '/' && text[j + 1] === '/') { const e = text.indexOf('\n', j); j = e < 0 ? text.length : e; continue; }
        if (c === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j + 2); j = e < 0 ? text.length : e + 2; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j++;
      }
      continue;
    }
    j++;
  }
  return { end: j + 1, hasExpr };
}

// Tokens: { type: 'ident' | 'string' | 'template' | 'num' | 'punct' |
// 'regex', value, start, end } (string: value unescaped, quote; template:
// value null when it has ${} parts). Comments: { start, end, text }.
export function tokenize(text) {
  const tokens = [];
  const comments = [];
  const n = text.length;
  let i = 0;
  if (text.startsWith('#!')) i = text.indexOf('\n') < 0 ? n : text.indexOf('\n');
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿' || c === '\f' || c === '\v' || c === ' ') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') {
      let end = text.indexOf('\n', i);
      if (end < 0) end = n;
      comments.push({ start: i, end, text: text.slice(i, end) });
      i = end;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let end = text.indexOf('*/', i + 2);
      end = end < 0 ? n : end + 2;
      comments.push({ start: i, end, text: text.slice(i, end) });
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = skipString(text, i);
      tokens.push({ type: 'string', value: unescape(text.slice(i + 1, end - 1)), quote: c, start: i, end });
      i = end;
      continue;
    }
    if (c === '`') {
      const { end, hasExpr } = skipTemplate(text, i);
      tokens.push({ type: 'template', value: hasExpr ? null : unescape(text.slice(i + 1, end - 1)), quote: '`', start: i, end });
      i = end;
      continue;
    }
    if (c === '/') {
      const p = tokens[tokens.length - 1];
      if (!p || ((p.type === 'punct' || p.type === 'ident') && REGEX_AFTER.has(p.value))) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const ch = text[j];
          if (ch === '\\') { j += 2; continue; }
          if (ch === '\n') break;
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/.test(text[j])) j++;
        tokens.push({ type: 'regex', value: text.slice(i, j), start: i, end: j });
        i = j;
        continue;
      }
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(text[j])) j++;
      tokens.push({ type: 'ident', value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && (/[0-9a-zA-Z_.]/.test(text[j]) || ((text[j] === '+' || text[j] === '-') && /[eE]/.test(text[j - 1])))) j++;
      tokens.push({ type: 'num', value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    const p = PUNCT.find((s) => text.startsWith(s, i)) ?? c;
    tokens.push({ type: 'punct', value: p, start: i, end: i + p.length });
    i += p.length;
  }
  return { tokens, comments };
}

const isPunct = (t, v) => t?.type === 'punct' && t.value === v;
const isKeyToken = (t) => t && (t.type === 'ident' || t.type === 'string' || t.type === 'num' || (t.type === 'template' && t.value !== null));

// The structure of a text: its properties and where each string literal
// sits. Options: json (every `{` is an object).
//
// properties: { key, path, keyToken, valueStart, valueEnd (token indexes,
//   end exclusive), shorthand, frame }
// sites (per string token index): { type: 'value', prop } directly the
//   value of a property (inside parentheses too), { type: 'element',
//   path, index } an element of an array literal, { type: 'arg', callee,
//   path } an argument of a call, { type: 'other' }.
// spreads: { frame path, token index of the spread expression }
export function analyze(source, { json = false } = {}) {
  const { tokens, comments } = typeof source === 'string' ? tokenize(source) : source;
  const top = { kind: 'top', path: [] };
  const frames = [top];
  const properties = [];
  const sites = new Map();
  const spreads = [];
  const objects = [];
  const ctxPath = (f) => {
    if (f.kind === 'object') return f.prop && !f.expectKey ? f.prop.path : f.path;
    if (f.kind === 'array') return [...f.path, '[]'];
    if (f.kind === 'block') return [];
    return f.path;
  };
  const closeProp = (f, k) => {
    if (f.prop && f.prop.valueEnd === null) f.prop.valueEnd = k;
  };
  const calleeBefore = (k) => {
    const parts = [];
    let j = k - 1;
    while (j >= 0 && tokens[j].type === 'ident') {
      parts.unshift(tokens[j].value);
      if (isPunct(tokens[j - 1], '.') || isPunct(tokens[j - 1], '?.')) j -= 2;
      else break;
    }
    return parts.join('.');
  };
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const f = frames[frames.length - 1];
    const prev = tokens[k - 1];
    if (f.kind === 'object' && f.expectKey) {
      const next = tokens[k + 1];
      if (isKeyToken(t) && isPunct(next, ':')) {
        const key = t.type === 'ident' || t.type === 'num' ? t.value : t.value;
        f.prop = { key, path: [...f.path, key], keyToken: k, valueStart: k + 2, valueEnd: null, shorthand: false, frame: f };
        properties.push(f.prop);
        f.expectKey = false;
        k++;
        continue;
      }
      if (t.type === 'ident' && (isPunct(next, ',') || isPunct(next, '}'))) {
        f.prop = { key: t.value, path: [...f.path, t.value], keyToken: k, valueStart: k, valueEnd: k + 1, shorthand: true, frame: f };
        properties.push(f.prop);
        f.expectKey = false;
        continue;
      }
      if (isPunct(t, '...')) {
        spreads.push({ path: f.path, token: k + 1, frame: f });
        f.prop = null;
        f.expectKey = false;
        continue;
      }
      if (!isPunct(t, '[') && !isPunct(t, '}')) {
        f.expectKey = false;
        f.prop = null;
      }
    }
    if (t.type === 'punct') {
      const v = t.value;
      if (v === '{') {
        let kind = 'object';
        if (!json) {
          if (!prev || isPunct(prev, ')') || isPunct(prev, '=>') || isPunct(prev, ';') || isPunct(prev, '}')) kind = 'block';
          // class X {, else {, try {: blocks; return {, default {: objects.
          else if (prev.type === 'ident') kind = OBJECT_AFTER.has(prev.value) ? 'object' : 'block';
          else if (prev.type === 'string' || prev.type === 'num' || prev.type === 'template' || prev.type === 'regex') kind = 'block';
        }
        const frame = { kind, path: kind === 'block' ? [] : ctxPath(f), expectKey: kind === 'object', prop: null, open: k, close: null };
        if (kind === 'object') objects.push(frame);
        frames.push(frame);
        continue;
      }
      if (v === '[') {
        let kind = 'array';
        if (f.kind === 'object' && f.expectKey) kind = 'computed';
        else if (prev && ((prev.type === 'ident' && !REGEX_AFTER.has(prev.value) && !OBJECT_AFTER.has(prev.value)) || isPunct(prev, ')') || isPunct(prev, ']') || prev.type === 'string' || prev.type === 'template')) kind = 'index';
        frames.push({ kind, path: ctxPath(f), index: 0, open: k });
        continue;
      }
      if (v === '(') {
        let kind = 'group';
        let callee = null;
        if (prev && ((prev.type === 'ident' && !NOT_CALLEE.has(prev.value)) || isPunct(prev, ')') || isPunct(prev, ']') || prev.type === 'template' || isPunct(prev, '?.') || isPunct(prev, '>'))) {
          kind = 'call';
          callee = calleeBefore(k);
        }
        frames.push({ kind, path: ctxPath(f), callee, open: k });
        continue;
      }
      if (v === '}' || v === ']' || v === ')') {
        if (frames.length === 1) continue;
        const closing = frames.pop();
        closing.close = k;
        if (closing.kind === 'object') closeProp(closing, k);
        if (closing.kind === 'computed') {
          const parent = frames[frames.length - 1];
          if (isPunct(tokens[k + 1], ':') && parent.kind === 'object') {
            parent.prop = { key: '[computed]', path: [...parent.path, '[computed]'], keyToken: k, valueStart: k + 2, valueEnd: null, shorthand: false, frame: parent };
            properties.push(parent.prop);
            parent.expectKey = false;
            k++;
          }
        }
        continue;
      }
      if (v === ',') {
        if (f.kind === 'object') {
          closeProp(f, k);
          f.prop = null;
          f.expectKey = true;
        } else if (f.kind === 'array') f.index++;
        continue;
      }
    }
    if (t.type === 'string' || t.type === 'template') {
      // The nearest frame that is not a grouping parenthesis.
      let i = frames.length - 1;
      while (i > 0 && frames[i].kind === 'group') i--;
      const g = frames[i];
      let site = { type: 'other' };
      if (g.kind === 'object' && g.prop && !g.expectKey && !g.prop.shorthand) site = { type: 'value', prop: g.prop };
      else if (g.kind === 'array') site = { type: 'element', path: g.path, index: g.index };
      else if (g.kind === 'call') site = { type: 'arg', callee: g.callee, path: g.path };
      sites.set(k, site);
    }
  }
  for (const f of frames) if (f.kind === 'object') closeProp(f, tokens.length);
  return { tokens, comments, properties, sites, spreads, objects };
}

// Line numbers (1-based) of offsets.
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const lineText = (line) => text.slice(starts[line - 1], line < starts.length ? starts[line] - 1 : text.length).replace(/\r$/, '');
  return { lineOf, lineText, starts };
}

// The comments before the first token of a file (where Jest and Vitest
// read environment docblocks).
export function leadingComments(text) {
  const { tokens, comments } = tokenize(text);
  const first = tokens.find((t) => !(t.type === 'string' && /^use (strict|client|server)$/.test(t.value)) && !isPunct(t, ';'));
  return comments.filter((c) => !first || c.start < first.start);
}

// Module specifiers a file uses: import ... from 'x', import 'x',
// import('x'), require('x'), require.resolve('x'), export ... from 'x',
// and mocking calls (vi.mock('x'), jest.mock('x'), ...). Returns
// [{ value, token }].
export function moduleSpecifiers(tokens) {
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== 'string' && !(t.type === 'template' && t.value !== null)) continue;
    const p = tokens[k - 1];
    const pp = tokens[k - 2];
    if (p?.type === 'ident' && (p.value === 'from' || p.value === 'import')) out.push({ value: t.value, token: k });
    else if (isPunct(p, '(') && pp?.type === 'ident' && /^(require|import|resolve|mock|doMock|unmock|requireActual|importActual|requireMock|importMock|createRequire)$/.test(pp.value)) out.push({ value: t.value, token: k });
  }
  return out;
}

// Whether the module specifier at token k (from moduleSpecifiers) is used
// for types only, so that it never loads the module: `import type ...`,
// `export type ...`, `import { type A, type B }` (every name a type),
// `typeof import('x')` and `import('x').Name` in a type position. A
// default or namespace import, `import 'x'` and require() load it.
export function typeOnlyReference(tokens, k) {
  const p = tokens[k - 1];
  const ident = (t, v) => t?.type === 'ident' && (v === undefined || t.value === v);
  if (isPunct(p, '(')) {
    if (!ident(tokens[k - 2], 'import')) return false;
    if (ident(tokens[k - 3], 'typeof')) return true;
    // import('x').Name (not .then(...)): a type; a value would be a promise.
    return isPunct(tokens[k + 1], ')') && isPunct(tokens[k + 2], '.') && ident(tokens[k + 3])
      && !['then', 'catch', 'finally'].includes(tokens[k + 3].value) && !isPunct(tokens[k + 4], '(');
  }
  if (!ident(p, 'from')) return false;
  let j = k - 2;
  while (j >= 0 && !(ident(tokens[j], 'import') || ident(tokens[j], 'export')) && !isPunct(tokens[j], ';') && k - j < 400) j--;
  if (j < 0 || !ident(tokens[j])) return false;
  const first = tokens[j + 1];
  // import type X from / import type { X } from / export type { X } from;
  // not `import type from 'x'` (a default import named type).
  if (ident(first, 'type') && !isPunct(tokens[j + 2], ',') && !ident(tokens[j + 2], 'from')) return true;
  if (!isPunct(first, '{')) return false;
  let names = 0;
  let expect = true;
  for (let i = j + 2; i < k - 1; i++) {
    const t = tokens[i];
    if (isPunct(t, '}')) return names > 0 && !isPunct(tokens[i + 1], ',');
    if (isPunct(t, ',')) { expect = true; continue; }
    if (!expect) continue;
    expect = false;
    names++;
    // `{ type X }` and `{ type X as Y }` are types; `{ type }` and
    // `{ type as T }` import a value named type.
    if (!(ident(t, 'type') && ident(tokens[i + 1]) && tokens[i + 1].value !== 'as')) return false;
  }
  return false;
}
