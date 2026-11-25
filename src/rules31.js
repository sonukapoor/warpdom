// jsdom 31's newer at-rules (black box, 31.0.1; #269 part F1): what
// @font-feature-values, @font-palette-values and @view-transition read
// from their preludes and blocks, and how they write them. cssom.js makes
// the rules (createRule) and their interfaces; @starting-style and
// @position-try need nothing here (a rule list, a declaration block).
// - Font family names (CSS Fonts 4): a list of families, each a string or
//   a run of identifiers. A generic family's name first (serif,
//   system-ui, ...) or a CSS-wide keyword or default alone is no family
//   name. A name is written as identifiers where each word is one and it
//   is no such keyword, otherwise as a string ("1a", "a  b", "serif").
// - @font-feature-values: font-display (auto, block, swap, fallback,
//   optional), then the feature blocks in alphabetical order, each a map
//   of names to integers: @styleset one or more of 0 to 20,
//   @character-variant two (the first up to 99), the others one. The
//   block is a list of rules and declarations: comments hold no blocks,
//   and a block counts only with no prelude. In one block the last value
//   of a name wins, in its place; a later block of the type sets a name
//   already there where it is. Names are written with their escapes.
// - @font-palette-values: a dashed name, and font-family (required),
//   base-palette (light, dark or an integer, at most 2147483647) and
//   override-colors (integer and color pairs; no currentcolor, system
//   color or light-dark()), written in alphabetical order.
// - @view-transition: navigation (auto or none) and types (none, or
//   identifiers other than the CSS-wide keywords, default and none),
//   written with their escapes (\31 a).
// A descriptor that is !important or does not parse is dropped; the last
// valid one wins.
import { parseDeclarationList31, serializeName31 } from './parse31.js';
import { decodeEscapes } from './conditions31.js';
import { DARK_SYSTEM_COLORS_31 } from './colors.js';

// --- tokens ---------------------------------------------------------------------------

// Values are short: a regex tokenizer, comments read as whitespace
// (CSS whitespace only: U+00A0 is a name character; #344 review).
// Kinds: ws, ident, string, number (int: no fraction or exponent),
// comma, hash, func (a function with its arguments, as written), other.
const ESCAPE = String.raw`\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[ \t\n\r\f])?|[^\n\r\f0-9a-fA-F])`;
const NAME_START = String.raw`[A-Za-z_\u0080-￿]`;
const NAME_CHAR = String.raw`[\w\u0080-￿-]`;
const IDENT = String.raw`(?:--|-?(?:${NAME_START}|${ESCAPE}))(?:${NAME_CHAR}|${ESCAPE})*`;
const TOKEN = new RegExp(
  String.raw`([ \t\n\r\f]+|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*')|(${IDENT})(\()?|([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(${IDENT}|%)?|(,)|(#(?:${NAME_CHAR}|${ESCAPE})+)|([\s\S])`,
  'y',
);
function tokens(text) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (m[1] !== undefined) {
      if (out.length === 0 || out[out.length - 1].t !== 'ws') out.push({ t: 'ws' });
    } else if (m[2] !== undefined) out.push({ t: 'string', v: unquote(m[2]) });
    else if (m[3] !== undefined && m[4] !== undefined) {
      // (the arguments up to the matching parenthesis)
      let depth = 1;
      let i = TOKEN.lastIndex;
      for (; i < text.length && depth > 0; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') depth--;
      }
      if (depth > 0) return null;
      out.push({ t: 'func', v: text.slice(start, i) });
      TOKEN.lastIndex = i;
    } else if (m[3] !== undefined) out.push({ t: 'ident', v: decodeEscapes(m[3]) });
    else if (m[5] !== undefined) {
      if (m[6] !== undefined) out.push({ t: 'other' });
      else out.push({ t: 'number', v: m[5], int: !/[.eE]/.test(m[5]) });
    } else if (m[7] !== undefined) out.push({ t: 'comma' });
    else if (m[8] !== undefined) out.push({ t: 'hash', v: m[8] });
    else out.push({ t: 'other', v: m[9] });
  }
  // (no whitespace at the ends)
  if (out.length && out[0].t === 'ws') out.shift();
  if (out.length && out[out.length - 1].t === 'ws') out.pop();
  return out;
}
const unquote = (s) => decodeEscapes(s.slice(1, -1).replace(/\\\r\n|\\[\n\r\f]/g, ''));
// A token list split at its commas (null when an item is empty).
function commaItems(list) {
  const items = [[]];
  for (const tok of list) {
    if (tok.t === 'comma') items.push([]);
    else if (tok.t !== 'ws' || items[items.length - 1].length !== 0) items[items.length - 1].push(tok);
  }
  for (const item of items) {
    if (item.length && item[item.length - 1].t === 'ws') item.pop();
    if (item.length === 0) return null;
  }
  return items;
}
// A non-negative integer token's value, or -1.
const nonNegative = (tok) => (tok.t === 'number' && tok.int && Number(tok.v) >= 0 ? Number(tok.v) + 0 : -1);

// --- font family names --------------------------------------------------------------

const GENERIC = new Set([
  'serif',
  'sans-serif',
  'cursive',
  'fantasy',
  'monospace',
  'system-ui',
  'math',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);
const WIDE = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default']);
const PLAIN_WORD = /^(?:--|-?[A-Za-z_\u0080-\u{10FFFF}])[\w\u0080-\u{10FFFF}-]*$/u;

// The family names in text, or null.
export function familyNames(text) {
  const list = tokens(String(text));
  if (list === null) return null;
  const items = commaItems(list);
  if (items === null) return null;
  const names = [];
  for (const item of items) {
    if (item.length === 1 && item[0].t === 'string') {
      names.push(item[0].v);
      continue;
    }
    const words = [];
    for (let k = 0; k < item.length; k++) {
      const tok = item[k];
      if (k % 2 === 1 ? tok.t !== 'ws' : tok.t !== 'ident') return null;
      if (k % 2 === 0) words.push(tok.v);
    }
    const first = words[0].toLowerCase();
    if (GENERIC.has(first) || (words.length === 1 && WIDE.has(first))) return null;
    names.push(words.join(' '));
  }
  return names;
}
// Family names written: as identifiers where that reads back as the name.
export function serializeFamilies(names) {
  return names.map(serializeFamily).join(', ');
}
function serializeFamily(name) {
  const words = name.split(' ');
  const first = words[0].toLowerCase();
  const plain =
    words.every((word) => PLAIN_WORD.test(word)) && !GENERIC.has(first) && !(words.length === 1 && WIDE.has(first));
  return plain ? name : quote(name);
}
// CSSOM's serialize a string.
function quote(value) {
  let out = '"';
  for (const ch of value) {
    const c = ch.codePointAt(0);
    if (c === 0) out += '�';
    else if ((c >= 1 && c <= 0x1f) || c === 0x7f) out += `\\${c.toString(16)} `;
    else if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else out += ch;
  }
  return `${out}"`;
}

// --- @font-feature-values ----------------------------------------------------------

const FEATURE_BLOCKS = [
  'annotation',
  'character-variant',
  'historical-forms',
  'ornaments',
  'styleset',
  'stylistic',
  'swash',
];
const FONT_DISPLAY = new Set(['auto', 'block', 'swap', 'fallback', 'optional']);

// A feature value's integers, or null.
function featureValues(block, text) {
  const list = tokens(text);
  if (list === null) return null;
  const values = [];
  for (let k = 0; k < list.length; k++) {
    if (k % 2 === 1) {
      if (list[k].t !== 'ws') return null;
      continue;
    }
    const n = nonNegative(list[k]);
    if (n < 0) return null;
    values.push(n);
  }
  if (block === 'styleset') return values.length >= 1 && values.every((n) => n <= 20) ? values : null;
  if (block === 'character-variant') return values.length === 2 && values[0] <= 99 ? values : null;
  return values.length === 1 ? values : null;
}

// The rule's data from its prelude and block, or null when it is dropped:
// { families, display, blocks: Map(type -> Map(name -> integers)) }.
// (the block read with the declaration tokenizer, so comments and strings
// hold no blocks, and a block counts only with no prelude: #344 review)
export function fontFeatureValues(prelude, body) {
  const families = familyNames(prelude);
  if (families === null) return null;
  const data = { families, display: null, blocks: new Map() };
  const atRules = [];
  for (const decl of parseDeclarationList31(body, atRules)) {
    if (decl.important || decl.name.toLowerCase() !== 'font-display') continue;
    const list = tokens(decl.value);
    if (list?.length === 1 && list[0].t === 'ident' && FONT_DISPLAY.has(list[0].v.toLowerCase()))
      data.display = list[0].v.toLowerCase();
  }
  for (const { name, empty, block } of atRules) {
    const type = name.toLowerCase();
    if (!empty || !FEATURE_BLOCKS.includes(type)) continue;
    // (in one block the last value of a name wins, in its place; a later
    // block of the type sets a name already there where it is)
    const own = new Map();
    for (const decl of parseDeclarationList31(block)) {
      if (decl.important) continue;
      const values = featureValues(type, decl.value);
      if (values === null) continue;
      own.delete(decl.name);
      own.set(decl.name, values);
    }
    if (own.size === 0) continue;
    const map = data.blocks.get(type);
    if (map === undefined) data.blocks.set(type, own);
    else for (const [name, values] of own) map.set(name, values);
  }
  return data;
}
export function fontFeatureValuesText(data) {
  const parts = [];
  if (data.display !== null) parts.push(`font-display: ${data.display};`);
  for (const type of FEATURE_BLOCKS) {
    const map = data.blocks.get(type);
    if (map === undefined || map.size === 0) continue;
    const entries = [...map].map(([name, values]) => `${serializeName31(name)}: ${values.join(' ')};`);
    parts.push(`@${type} { ${entries.join(' ')} }`);
  }
  const body = parts.length ? `{ ${parts.join(' ')} }` : '{ }';
  return `@font-feature-values ${serializeFamilies(data.families)} ${body}`;
}

// --- @font-palette-values -----------------------------------------------------------

// A prelude of nothing but whitespace and comments (CSS whitespace:
// U+00A0 is not).
export const emptyPrelude = (prelude) => tokens(prelude)?.length === 0;

// A prelude that is one dashed identifier: its name as written back
// (escapes read, then written where needed: --\70 is --p), or null.
export function dashedName(prelude) {
  const list = tokens(prelude);
  if (list?.length !== 1 || list[0].t !== 'ident' || !list[0].v.startsWith('--')) return null;
  return serializeName31(list[0].v);
}

// The rule's data, or null when it is dropped (no valid font-family).
// color: a color as a jsdom 31 declaration writes it, or null.
export function fontPaletteValues(prelude, body, color) {
  const name = dashedName(prelude);
  if (name === null) return null;
  const data = { name, families: null, basePalette: '', overrideColors: '' };
  for (const decl of parseDeclarationList31(body)) {
    if (decl.important) continue;
    const key = decl.name.toLowerCase();
    if (key === 'font-family') {
      const names = familyNames(decl.value);
      if (names !== null) data.families = names;
    } else if (key === 'base-palette') {
      const list = tokens(decl.value);
      if (list?.length !== 1) continue;
      const tok = list[0];
      const lower = tok.t === 'ident' ? tok.v.toLowerCase() : '';
      if (lower === 'light' || lower === 'dark') data.basePalette = lower;
      else if (nonNegative(tok) >= 0) data.basePalette = String(Math.min(nonNegative(tok), 2147483647));
    } else if (key === 'override-colors') {
      const text = overrideColors(decl.value, color);
      if (text !== null) data.overrideColors = text;
    }
  }
  return data.families === null ? null : data;
}
function overrideColors(value, color) {
  const list = tokens(value);
  if (list === null) return null;
  const items = commaItems(list);
  if (items === null) return null;
  const out = [];
  for (const item of items) {
    if (item.length !== 3 || item[1].t !== 'ws') return null;
    const index = nonNegative(item[0]);
    const tok = item[2];
    if (index < 0 || (tok.t !== 'ident' && tok.t !== 'hash' && tok.t !== 'func')) return null;
    const lower = tok.t === 'ident' ? tok.v.toLowerCase() : '';
    if (lower === 'currentcolor' || WIDE.has(lower) || lower in DARK_SYSTEM_COLORS_31) return null;
    if (tok.t === 'func' && /^light-dark\(/i.test(tok.v)) return null;
    // (a descriptor substitutes nothing: var() and attr() anywhere in the
    // color drop it, escapes read (v\61 r), which a declaration's check
    // would accept; #344 review)
    if (tok.t === 'func' && /(?:^|[^\w-])(?:var|attr)\(/i.test(decodeEscapes(tok.v))) return null;
    const written = color(tok.v);
    if (written === null) return null;
    out.push(`${Math.min(index, 2147483647)} ${written}`);
  }
  return out.join(', ');
}
export function fontPaletteValuesText(data) {
  const parts = [];
  if (data.basePalette) parts.push(`base-palette: ${data.basePalette};`);
  parts.push(`font-family: ${serializeFamilies(data.families)};`);
  if (data.overrideColors) parts.push(`override-colors: ${data.overrideColors};`);
  return `@font-palette-values ${data.name} { ${parts.join(' ')} }`;
}

// --- @view-transition --------------------------------------------------------------

// The rule's data, or null when it is dropped (a prelude).
export function viewTransition(prelude, body) {
  if (!emptyPrelude(prelude)) return null;
  const data = { navigation: '', types: null };
  for (const decl of parseDeclarationList31(body)) {
    if (decl.important) continue;
    const key = decl.name.toLowerCase();
    const list = tokens(decl.value);
    if (list === null || list.length === 0) continue;
    if (key === 'navigation') {
      const lower = list.length === 1 && list[0].t === 'ident' ? list[0].v.toLowerCase() : '';
      if (lower === 'auto' || lower === 'none') data.navigation = lower;
    } else if (key === 'types') {
      if (list.length === 1 && list[0].t === 'ident' && list[0].v.toLowerCase() === 'none') {
        data.types = 'none';
        continue;
      }
      const names = [];
      let ok = true;
      for (let k = 0; k < list.length && ok; k++) {
        const tok = list[k];
        if (k % 2 === 1) ok = tok.t === 'ws';
        else {
          ok = tok.t === 'ident' && !WIDE.has(tok.v.toLowerCase()) && tok.v.toLowerCase() !== 'none';
          names.push(tok.v);
        }
      }
      if (ok) data.types = names;
    }
  }
  return data;
}
export function viewTransitionText(data) {
  const parts = [];
  if (data.navigation) parts.push(`navigation: ${data.navigation};`);
  if (data.types !== null)
    parts.push(`types: ${data.types === 'none' ? 'none' : data.types.map(serializeName31).join(' ')};`);
  return `@view-transition ${parts.length ? `{ ${parts.join(' ')} }` : '{ }'}`;
}
