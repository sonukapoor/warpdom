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
// - @property (#269 part F2): one dashed name, or a list of them (its
//   name is then ''), and syntax (a string, or the syntax as written;
//   property31.js), inherits (true or false) and initial-value (the last
//   one, kept when it matches the syntax and is computationally
//   independent; property31.js writes it), each with its default when it
//   is missing (*, true and none).
// - @view-transition: navigation (auto or none) and types (none, or
//   identifiers other than the CSS-wide keywords, default and none),
//   written with their escapes (\31 a).
// A descriptor that is !important or does not parse is dropped; the last
// valid one wins.
import { parseDeclarationList31, parseValue31, serializeName31, serializeString31 as quote } from './parse31.js';
import { decodeEscapes } from './conditions31.js';
import { preprocessCss } from './internal.js';
import { DARK_SYSTEM_COLORS_31 } from './colors.js';
import {
  UNIVERSAL,
  independent31,
  initialText31,
  matchesSyntax31,
  parseSyntax31,
  universalInitial31,
} from './property31.js';

// --- tokens ---------------------------------------------------------------------------

// Values are short: a regex tokenizer, comments read as whitespace
// (CSS whitespace only: U+00A0 is a name character; #344 review).
// Kinds: ws, ident, string, number (int: no fraction or exponent),
// comma, hash, func (a function with its arguments, as written), other.
// The text is preprocessed first (CR, CR LF and FF are LF, NUL is
// U+FFFD), and the end closes what is open: a string left open is a
// string, a \ at the end is nothing in a string and U+FFFD in a name
// (#344 review).
// (an escape takes all its hex digits, up to six: one way to read a name,
// so a name with many escapes is not tried every way; #353 review)
const ESCAPE = String.raw`\\(?:(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))(?:\r\n|[ \t\n\r\f])?|[^\n\r\f0-9a-fA-F]|$)`;
const NAME_START = String.raw`[A-Za-z_\u0080-￿]`;
const NAME_CHAR = String.raw`[\w\u0080-￿-]`;
const IDENT = String.raw`(?:--|-?(?:${NAME_START}|${ESCAPE}))(?:${NAME_CHAR}|${ESCAPE})*`;
const TOKEN = new RegExp(
  String.raw`([ \t\n\r\f]+|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\[\s\S]|\\$)*(?:"|$)|'(?:[^'\\\n]|\\[\s\S]|\\$)*(?:'|$))|(${IDENT})(\()?|([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(${IDENT}|%)?|(,)|(#(?:${NAME_CHAR}|${ESCAPE})+)|([\s\S])`,
  'y',
);
function tokens(text) {
  if (/[\r\f\0]/.test(text)) text = text.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '\uFFFD');
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
    } else if (m[3] !== undefined)
      out.push({ t: 'ident', v: decodeEscapes(oddEnd(m[3]) ? `${m[3].slice(0, -1)}\uFFFD` : m[3]) });
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
// A string token's value: without its quotes (the closing one may be
// missing at the end), escaped newlines and a \ at the end.
function unquote(s) {
  let body = s.slice(1);
  if (body.endsWith(s[0]) && !oddEnd(body.slice(0, -1))) body = body.slice(0, -1);
  if (oddEnd(body)) body = body.slice(0, -1);
  return decodeEscapes(body.replace(/\\\n/g, ''));
}
// Whether text ends with a \ that escapes nothing.
function oddEnd(text) {
  let n = 0;
  while (n < text.length && text[text.length - 1 - n] === '\\') n++;
  return n % 2 === 1;
}
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
  const name = decodedName(prelude);
  return name === null ? null : serializeName31(name);
}
// Its name with the escapes read (--f\:x is --f:x), or null.
function decodedName(prelude) {
  const list = tokens(prelude);
  if (list?.length !== 1 || list[0].t !== 'ident' || !list[0].v.startsWith('--')) return null;
  return list[0].v;
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

// --- @property ----------------------------------------------------------------------

// The names in a prelude: dashed identifiers separated by commas, or null.
function propertyNames(prelude) {
  const list = tokens(prelude);
  const items = list === null ? null : commaItems(list);
  if (items === null) return null;
  const names = [];
  for (const item of items) {
    const tok = item[0];
    if (item.length !== 1 || tok.t !== 'ident' || !tok.v.startsWith('--') || tok.v.length < 3) return null;
    names.push(tok.v);
  }
  return names;
}

// The rule's data ({ names, syntax, inherits, initial: the initial
// value's text or null }), or null when it is dropped.
export function propertyRule(prelude, body) {
  const names = propertyNames(prelude);
  if (names === null) return null;
  // (base: the document's base URL when the cascade first reads it, which
  // resolves a typed initial value's urls; cascade.js)
  const data = { names, syntax: UNIVERSAL, inherits: true, initial: null, base: null };
  let initial = null;
  // (a list of declarations and rules: a block before a ; is a rule)
  // (initial-value takes any value, a {} block too: initial-value: {a} b)
  for (const decl of parseDeclarationList31(body, [], 'initial-value')) {
    const key = decl.name.toLowerCase();
    if (key === 'initial-value') {
      initial = decl;
      continue;
    }
    if (decl.important) continue;
    const list = tokens(decl.value);
    if (list === null || list.length === 0) continue;
    if (key === 'syntax') {
      const syntax = parseSyntax31(list.length === 1 && list[0].t === 'string' ? list[0].v : decl.value);
      if (syntax !== null) data.syntax = syntax;
    } else if (key === 'inherits') {
      const lower = list.length === 1 && list[0].t === 'ident' ? list[0].v.toLowerCase() : '';
      if (lower === 'true' || lower === 'false') data.inherits = lower === 'true';
    }
  }
  if (initial !== null && !initial.important) {
    // (a style sheet's comments are gone: 1px/**/2px is 1px2px)
    const text = initialText31(initial.raw, false);
    const valid = data.syntax === UNIVERSAL ? universalInitial31(text) : independent31(data.syntax, text);
    if (valid) data.initial = text;
  }
  return data;
}
export function propertyRuleText(data) {
  const initial = data.initial === null ? '' : ` initial-value: ${data.initial};`;
  return `@property ${data.names.map(serializeName31).join(', ')} { syntax: ${quote(data.syntax.text)}; inherits: ${data.inherits};${initial} }`;
}

// --- @function (#269 part G1b) --------------------------------------------------------

// An @function's prelude (CSS Mixins 1, as jsdom 31 reads it; black box,
// 31.0.1): a dashed name with its ( right after it, the parameters, then
// returns and a type, or nothing. A parameter is a dashed name (not --),
// then a type or nothing (any), then a : and a default value or nothing;
// names are not repeated. A type is one syntax component (a data type in
// any case, written in lowercase, or an identifier, a CSS-wide keyword
// too), with a multiplier or not, or type() of a syntax (* any). A
// default is a value as @property's initial-value is written, comments
// dropped, and with a type one that matches it (relative lengths too,
// var() not); empty, !important or a {} block is none.
// Its data: { name, params: [{ name, syntax, defaultValue (or null) }],
// returns (a syntax) }, or null when it is dropped; names with their
// escapes read (CSSFunctionRule.name, getParameters(); #353 review).
// (a comment's body cannot hold its end, so a run of comments is read
// one way only: linear, #353 review)
const FUNCTION_NAME = new RegExp(String.raw`^(?:[ \t\n\r\f]|\/\*(?:[^*]|\*(?!\/))*\*\/)*(${IDENT})\(`);
const PARAMETER_NAME = new RegExp(String.raw`^${IDENT}`);
const RETURNS = /^returns(?![\w\u0080-￿\\-])/i;
const CSS_SPACE = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g;
const cssTrim = (text) => text.replace(CSS_SPACE, '');
// (comments as spaces, those in strings and unquoted urls kept: url(a/*b)
// is one url, and none after an escape: \/* is no comment; #353 review)
// (blank: a comment as spaces of its length, so the text's offsets hold)
const COMMENT_OR_STRING =
  /("(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?)|(\burl\((?![ \t\n\r\f]*["'])[ \t\n\r\f]*(?:[^)\\]|\\[\s\S])*\)?)|(\\[\s\S])|\/\*[\s\S]*?(?:\*\/|$)/gi;
const withoutComments = (text, blank = false) =>
  text.includes('/*')
    ? text.replace(
        COMMENT_OR_STRING,
        (m, string, url, escape) => string ?? url ?? escape ?? (blank ? ' '.repeat(m.length) : ' '),
      )
    : text;
const LEADING_SPACE = /^[ \t\n\r\f]*/;

const CLOSER = { '(': ')', '[': ']', '{': '}' };
// The index of a comment's last character (its /), or the text's last.
function commentEnd(text, at) {
  const end = text.indexOf('*/', at + 2);
  return end === -1 ? text.length - 1 : end + 1;
}
// When an unquoted url starts at the index (url(a[b.png), CSS Syntax 3's
// <url-token>: its contents are no brackets, comments or separators; #353
// review), the index of its ), or the text's last; else -1.
// (the quote checked before the spaces are read: url( "a)b") is quoted)
// (url's name with escapes too, u\72l( and \75rl(, as jsdom 31's tokenizer
// reads it; three name characters, as url's, so a long name is not read
// at each u in it; #353 review)
const URL_START = /url\((?![ \t\n\r\f]*["'])[ \t\n\r\f]*/iy;
const URL_NAME = new RegExp(String.raw`(?:${NAME_CHAR}|${ESCAPE}){3}\(`, 'y');
const URL_CONTENTS_START = /(?![ \t\n\r\f]*["'])[ \t\n\r\f]*/y;
function unquotedUrlEnd(text, at) {
  const c = text[at];
  if ((c !== 'u' && c !== 'U' && c !== '\\') || /[\w\u0080-\uffff\\-]/.test(text[at - 1] ?? '')) return -1;
  let start;
  URL_START.lastIndex = at;
  if (URL_START.test(text)) start = URL_START.lastIndex;
  else {
    URL_NAME.lastIndex = at;
    const name = URL_NAME.exec(text);
    if (name === null || !name[0].includes('\\') || !/^url\($/i.test(decodeEscapes(name[0]))) return -1;
    URL_CONTENTS_START.lastIndex = at + name[0].length;
    if (!URL_CONTENTS_START.test(text)) return -1;
    start = URL_CONTENTS_START.lastIndex;
  }
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === ')') return i;
  }
  return text.length - 1;
}
// The index of the character that closes the bracket before from, or -1;
// commas: the indices of the commas outside brackets, strings and
// comments, filled (#353 review: --f(/* , */ --a) has one parameter).
function closingAt(text, from, commas = null) {
  const stack = [];
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '/' && text[i + 1] === '*') i = commentEnd(text, i);
    else if (unquotedUrlEnd(text, i) !== -1) i = unquotedUrlEnd(text, i);
    else if (c === '\\') i++;
    else if (c === '(' || c === '[' || c === '{') stack.push(CLOSER[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.length === 0) return c === ')' ? i : -1;
      if (stack.pop() !== c) return -1;
    } else if (c === ',' && commas !== null && stack.length === 0) commas.push(i);
  }
  return -1;
}
// Whether the text has a { or } outside strings and comments, or a ! or ;
// outside brackets too (f(1; 2) is a value; #353 review).
function topLevelStop(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '/' && text[i + 1] === '*') i = commentEnd(text, i);
    else if (unquotedUrlEnd(text, i) !== -1) i = unquotedUrlEnd(text, i);
    else if (c === '\\') i++;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '{' || c === '}' || ((c === ';' || c === '!') && depth === 0)) return true;
  }
  return false;
}

const typeSyntax = (text) =>
  parseSyntax31(
    text.replace(/<[^<>]*>/g, (m) => m.toLowerCase()),
    false,
  );
function cssType(text) {
  const t = cssTrim(text);
  if (/^type\(/i.test(t)) {
    if (closingAt(t, 5) !== t.length - 1) return null;
    const inner = cssTrim(t.slice(5, -1));
    if (inner === '') return null;
    return inner === '*' ? UNIVERSAL : typeSyntax(inner);
  }
  if (t === '*') return null;
  const syntax = typeSyntax(t);
  return syntax !== null && syntax.parts.length === 1 ? syntax : null;
}

// (the name and type without comments, the default as written: its
// comments dropped as an initial value's, a/*b*/c is ac; #353 review)
function functionParameter(piece) {
  const blanked = withoutComments(piece, true);
  const lead = LEADING_SPACE.exec(blanked)[0].length;
  const text = blanked.slice(lead);
  const m = PARAMETER_NAME.exec(text);
  const name = m === null ? null : decodedName(m[0]);
  if (name === null || name === '--') return null;
  const rest = text.slice(m[0].length);
  const colon = rest.indexOf(':');
  const typeText = cssTrim(colon === -1 ? rest : rest.slice(0, colon));
  const syntax = typeText === '' ? UNIVERSAL : cssType(typeText);
  if (syntax === null) return null;
  if (colon === -1) return { name, syntax, defaultValue: null };
  const raw = cssTrim(piece.slice(lead + m[0].length + colon + 1));
  // (and a value: a bad url or string is none, url(a b); #353 review)
  if (raw === '' || topLevelStop(raw) || parseValue31(raw, true) === null) return null;
  const value = initialText31(raw, false);
  if (syntax !== UNIVERSAL && !matchesSyntax31(syntax, value)) return null;
  return { name, syntax, defaultValue: value };
}

// (preprocessed first: NUL is U+FFFD in names and defaults; #353 review)
export function functionPrelude31(written) {
  const prelude = preprocessCss(written);
  const m = FUNCTION_NAME.exec(prelude);
  const name = m === null ? null : decodedName(m[1]);
  if (name === null) return null;
  const commas = [];
  const close = closingAt(prelude, m[0].length, commas);
  if (close === -1) return null;
  const params = [];
  const inner = prelude.slice(m[0].length, close);
  if (cssTrim(withoutComments(inner)) !== '') {
    let from = m[0].length;
    // (names in a set: a long list is read in linear time; #353 review)
    const names = new Set();
    for (const end of [...commas, close]) {
      const param = functionParameter(prelude.slice(from, end));
      if (param === null || names.has(param.name)) return null;
      names.add(param.name);
      params.push(param);
      from = end + 1;
    }
  }
  const rest = cssTrim(withoutComments(prelude.slice(close + 1)));
  let returns = UNIVERSAL;
  if (rest !== '') {
    if (!RETURNS.test(rest)) return null;
    returns = cssType(rest.slice(7));
    if (returns === null) return null;
  }
  return { name, params, returns };
}

// (one component bare, more in type(); * left out)
const typeText = (syntax) => (syntax.parts !== null && syntax.parts.length > 1 ? `type(${syntax.text})` : syntax.text);
export function functionPreludeText31(data) {
  const params = data.params.map(
    (p) =>
      serializeName31(p.name) +
      (p.syntax === UNIVERSAL ? '' : ` ${typeText(p.syntax)}`) +
      (p.defaultValue === null ? '' : `: ${p.defaultValue}`),
  );
  return `@function ${serializeName31(data.name)}(${params.join(', ')})${data.returns === UNIVERSAL ? '' : ` returns ${typeText(data.returns)}`}`;
}
// getParameters(): new objects each time.
export const functionParameters31 = (data) =>
  data.params.map((p) =>
    p.defaultValue === null
      ? { name: p.name, type: p.syntax.text }
      : { name: p.name, type: p.syntax.text, defaultValue: p.defaultValue },
  );
