// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import {
  S,
  state,
  hiddenSlot,
  domError,
  ELEMENT_NODE,
  HTML_NS,
  SVG_NS,
  cssomChanges,
  attributesChanged,
  hooks,
} from './internal.js';
import { STYLE_ACCESSORS } from './css-properties.js';
import { SURFACES } from './style-surface.js';
import { LONGHANDS, SHORTHANDS, COLOR_SHORTHANDS, ALIASES } from './css-data.js';
import {
  hasVarFunction,
  isLengthUnit,
  isMathFunction,
  isNameCode,
  isValidValue,
  readUrl,
  serializeUrls,
  takesNamesOrStrings,
  urlTokenEnd,
} from './css-values.js';
import {
  expand,
  segments,
  serializeBox,
  serializeFont,
  positionLayers,
  legacyFont,
  LEGACY_FONT_LONGHANDS,
} from './shorthands.js';
import { resolveColor, systemColorKind } from './colors.js';
import {
  BOX_LONGHANDS,
  BOX_SHORTHAND,
  boxAccessorValue,
  boxPriority,
  boxValue,
  boxVariant,
  boxCover,
  coveredBy,
  isBoxName,
  parts,
  replayBox,
  writeBox,
} from './box-declarations.js';

// backgroundColor -> background-color, webkitAnimation/WebkitAnimation ->
// -webkit-animation, cssFloat -> float; dashed names map to themselves.
function cssName(accessor) {
  if (accessor === 'cssFloat') return 'float';
  if (accessor.includes('-')) return accessor;
  const dashed = accessor.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return /^(webkit|-webkit)-/.test(dashed) ? `-${dashed.replace(/^-/, '')}` : dashed;
}

// Split on `sep` outside parentheses and quotes (url(data:...;base64,...)).
// tokens: also outside [] and {} blocks and comments, and not on an
// escaped character (\!), as CSS tokenizes a value.
const CLOSERS = { '(': ')', '[': ']', '{': '}' };
function splitOutside(text, sep, tokens = false) {
  const parts = [];
  const open = [];
  let depth = 0,
    quote = null,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (tokens) {
      if (c === '\\') i++;
      else if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        i = end < 0 ? text.length : end + 1;
      } else if (CLOSERS[c]) open.push(CLOSERS[c]);
      else if (c === open.at(-1)) open.pop();
      else if (c === sep && open.length === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    } else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
// A declaration block's declarations as jsdom 27 and later read them
// (CSS Syntax 3, #144): an unquoted url() is one token to its ")"
// (urlTokenEnd: url(a"b.png) opens no string, url(a(b.png) no block),
// and a line break ends a string (a bad string). Only for a text where
// that differs from splitOutside (cssSplitNeeded): an unquoted url() with
// a quote, parenthesis or backslash inside, or a quoted url() and a line
// break. url( in any case (URL(a"b.png)). Character codes and indexOf:
// style writes are a hot path.
function cssSplitNeeded(text) {
  let quoted = false;
  for (let open = text.indexOf('('); open !== -1; open = text.indexOf('(', open + 1)) {
    if (
      open < 3 ||
      (text.charCodeAt(open - 1) | 32) !== 108 ||
      (text.charCodeAt(open - 2) | 32) !== 114 ||
      (text.charCodeAt(open - 3) | 32) !== 117
    )
      continue;
    const q = text.charCodeAt(open + 1);
    if (q === 34 || q === 39) {
      quoted = true;
      continue;
    }
    for (let j = open + 1; j < text.length; j++) {
      const c = text.charCodeAt(j);
      if (c === 41) break;
      if (c === 34 || c === 39 || c === 40 || c === 92) return true;
    }
  }
  return quoted && (text.indexOf('\n') !== -1 || text.indexOf('\r') !== -1 || text.indexOf('\f') !== -1);
}
function splitDeclarations(text) {
  const parts = [];
  let depth = 0,
    quote = null,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote || c === '\n' || c === '\r' || c === '\f') quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') {
      const end = urlTokenEnd(text, i);
      if (end === -1) depth++;
      else i = end - 1;
    } else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// Declared values as jsdom (27 and later) serializes them: a unitless zero
// length alone is 0px (width: 0). In a list of values, zeros become 0px only
// in margin, padding, border-width, border-spacing and background-position
// (jsdom 26 too), and the first three
// take their shortest form (padding: 0 0 is 0px, margin: 1px 1px is 1px);
// other properties keep a list as written (inset: 0 auto, view-timeline-
// inset: 0 100dvh). Numbers stay (opacity: 0, line-height: 0).
const ZERO = /^[+-]?(0+\.?0*|\.0+)$/;
const BOX_SHORTHANDS = new Set(['margin', 'padding', 'border-width']);
// Functions as one side each (calc(100% - 2px) calc(100% - 2px) is
// calc(100% - 2px)); a value with var() as written.
const shortestBox = (value) => {
  let tokens;
  if (!value.includes('(')) tokens = value.split(' ');
  else {
    if (value.includes('var(')) return value;
    const parts = segments(value);
    if (parts.some((p, i) => i % 2 === 1 && p.trim() !== '')) return value;
    tokens = parts.filter((_, i) => i % 2 === 0);
  }
  return tokens.length > 4
    ? value
    : serializeBox([tokens[0], tokens[1] ?? tokens[0], tokens[2] ?? tokens[0], tokens[3] ?? tokens[1] ?? tokens[0]]);
};
// The length properties cssstyle 5 parses (black box, jsdom 27.0 to 28.0):
// a 0 is 0px there, as written elsewhere (text-indent: 0, min-width: 0).
const ZERO_PARSED_5 = new Set([
  'background-size',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-spacing',
  'top',
  'right',
  'bottom',
  'left',
  'flex-basis',
  'font-size',
  'height',
  'width',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'padding',
  'border-width',
]);
const ZERO_LISTS = new Set(['margin', 'padding', 'border-width', 'border-spacing', 'background-position']);
const zeroIsLength = new Map();
function isLengthProperty(name) {
  let result = zeroIsLength.get(name);
  if (result === undefined) {
    const data = LONGHANDS[name];
    result = data ? data[3] === 1 : !!SHORTHANDS[name]?.every((l) => LONGHANDS[l]?.[3] === 1);
    zeroIsLength.set(name, result);
  }
  return result;
}

// Colors in declared values serialize as CSSOM (and jsdom) gives them:
// hex, rgb() and hsl() as rgb()/rgba(), keywords lowercased. Not inside
// shadows, which jsdom keeps as written.
const holdsColors = new Map();
function isColorProperty(name) {
  let result = holdsColors.get(name);
  if (result === undefined) {
    result =
      name !== 'box-shadow' &&
      name !== 'text-shadow' &&
      (LONGHANDS[name]?.[2] === 1 || COLOR_SHORTHANDS.includes(name));
    holdsColors.set(name, result);
  }
  return result;
}

// Serialized color values by raw value: the same few strings are written
// over and over (style.color = '#f00' on every render).
// legacyColors (set by declaredValue): cssstyle before 4.2, whose rgb()
// and hsl() round channels once and which does not resolve hwb()
// (colors.js; 'cssstyle3' with cssstyle 2 and 3's hsl()). colorKeywords
// (the surface's, set by declaredValue): how
// the profile's cssstyle writes color keywords (black box): 'css2' before
// 4.4, named colors, transparent, currentcolor and system colors as written
// (Red, ButtonFace), CSS 4's system colors (Canvas) unknown; 'written' 4.4
// and 4.5, system colors as written, the others lowercased; null (4.6 and
// later, jsdom 27 and later) all lowercased.
let legacyColors = false;
let colorKeywords = null;
// cssstyle 5 (jsdom 27.0 to 28.0, set by declaredValue): a 0 stays 0 except
// in the properties it parses (ZERO_PARSED_5).
let zeroAsWritten = false;
// How jsdom 27 and later serialize url() (set by declaredValue; black box,
// #144): 'spec' (jsdom 29 and later), 'quotes' (cssstyle 6, jsdom 28: only
// a double quote escaped) or 'written' (cssstyle 5, jsdom 27: as 'quotes'
// in background and background-image, as written elsewhere).
let urlStyle = 'spec';
// A value of one identifier, jsdom 27 and later (black box, 27.0.1 to
// 30.1.3, #187): 27.0.1 to 28.0.0 (cssstyle 5, identsInLowercase) write it
// in ASCII lowercase in every property but font-family (animation-name:
// FOO is foo, FÖO is fÖo, F\4FO is f\4fo); from 28.1.0 only in a
// property whose grammar takes no name or string of its own (display:
// BLOCK is block; animation-name: FOO, text-align: CENTER as written).
// background reads the case itself (NONE sets the initial values:
// backgroundValue); a custom property keeps its value as written.
let identsInLowercase = false;
const ONE_IDENT = /^(?:--|-?(?:[a-zA-Z_\u0080-\uffff]|\\[^]))(?:[\w\u0080-\uffff-]|\\[^])*$/;
const asciiLower = (value) => value.replace(/[A-Z]+/g, (s) => s.toLowerCase());
function identValue(name, value) {
  if (name.startsWith('--') || name === 'font-family' || name === 'background') return value;
  if (!/[A-Z]/.test(value) || !ONE_IDENT.test(value)) return value;
  return identsInLowercase || !takesNamesOrStrings(name) ? asciiLower(value) : value;
}
const colorCaches = new Map();
function declaredColors(value) {
  const key = `${legacyColors} ${colorKeywords}`;
  let colorCache = colorCaches.get(key);
  if (colorCache === undefined) colorCaches.set(key, (colorCache = new Map()));
  let out = colorCache.get(value);
  if (out === undefined) {
    out = serializeColors(value);
    if (colorCache.size >= 2000) colorCache.clear();
    colorCache.set(value, out);
  }
  return out;
}

function serializeColors(value) {
  const parts = segments(value);
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower[0] === '#' || /^(rgba?|hsla?|hwb)\(/.test(lower)) parts[i] = resolveColor(token, legacyColors) ?? token;
    else if (resolveColor(lower) !== null || lower === 'currentcolor') {
      parts[i] =
        colorKeywords === 'css2' || (colorKeywords === 'written' && systemColorKind(lower) !== 0) ? token : lower;
    }
  }
  return parts.join('');
}

// Whether the profile's cssstyle rejects a color value the grammar
// accepts (black box): before 4.4 CSS 4's system colors (Canvas, Field;
// CSS 2's ButtonFace and ThreeDFace it knows), in 4.4 and 4.5 SelectedItem
// and SelectedItemText, before 4.2 color functions
// its older parser does not read (RGB(), rgb(0 0 0), rgb(1.5, 0, 0));
// cssstyle 5 (jsdom 27.0 to 28.0) system colors in the border side
// shorthands, and background or text-decoration of one system color. And
// in every profile rgb() and hsl() mixing numbers and percentages in the
// comma syntax (rgb(50%, 0, 0)).
function rejectsColor(name, value, surface) {
  const shorthandSystem = surface !== null && (surface.key === 'cssstyle5' || surface.key === 'cssstyle5.0');
  const oldParser = legacyColors === true || legacyColors === 'cssstyle3';
  if (colorKeywords === null && !oldParser && !shorthandSystem && !value.includes(',')) return false;
  const parts = segments(value);
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (!token) continue;
    const lower = token.toLowerCase();
    if (
      oldParser &&
      /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/.test(lower) &&
      resolveColor(token, true) === null
    )
      return true;
    // rgb() and hsl() in the comma syntax: numbers or percentages, not both.
    if (/^(rgba?|hsla?)\([^()]*,[^()]*\)$/.test(lower) && resolveColor(token, legacyColors) === null) return true;
    const kind = systemColorKind(lower);
    if (kind === 1 && (colorKeywords === 'css2' || (colorKeywords === 'written' && lower.startsWith('selecteditem'))))
      return true;
    if (
      kind !== 0 &&
      shorthandSystem &&
      ((BORDER_SHORTHAND.has(name) && name !== 'border') ||
        ((name === 'background' || name === 'text-decoration') && parts.length === 1))
    )
      return true;
  }
  return false;
}

// Commas in math functions and gradients serialize as ", " (CSS Values
// 4), as in jsdom 27 and later; colors in gradients as in color
// properties. Only at the top level of a value (and inside such
// functions): other functions keep their arguments as written, as in
// jsdom (translate(1px,2px), translate(min(1px,5%))), and so does the
// border-image shorthand. With gradients false, gradients are kept as
// written (jsdom 27 outside background, and values with var()).
const COMMA_FUNCTIONS = /^(min|max|clamp|(-webkit-)?(repeating-)?(linear|radial|conic)-gradient)$/i;
const GRADIENT_NAME = /gradient$/i;
function functionArguments(value, gradients) {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < value.length && value[j] !== c) j += value[j] === '\\' ? 2 : 1;
      out += value.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c !== '(') {
      out += c;
      continue;
    }
    let depth = 0,
      close = i;
    for (let quote = null; close < value.length; close++) {
      const d = value[close];
      if (quote) {
        if (d === '\\') close++;
        else if (d === quote) quote = null;
        continue;
      }
      if (d === '"' || d === "'") quote = d;
      else if (d === '(') depth++;
      else if (d === ')' && --depth === 0) break;
    }
    const name = /[\w-]*$/.exec(out)[0];
    let inner = value.slice(i + 1, close);
    if (COMMA_FUNCTIONS.test(name) && (gradients || !GRADIENT_NAME.test(name))) {
      const args = splitOutside(functionArguments(inner, gradients), ',').map((a) => a.trim());
      inner = (GRADIENT_NAME.test(name) ? gradientArguments(name, args) : args).join(', ');
    }
    out += `(${inner}${close < value.length ? ')' : ''}`;
    i = close;
  }
  return out;
}

// The value is one function call: a name, then a parenthesis that closes
// at its end (strings in it skipped). Not none, linear-gradient(...).
const FUNCTION_NAME = /^-?[a-z][\w-]*$/i;
function oneFunction(value) {
  const open = value.indexOf('(');
  if (open < 1 || value.charCodeAt(value.length - 1) !== 41 || !FUNCTION_NAME.test(value.slice(0, open))) return false;
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 34 || c === 39) {
      i++;
      while (i < value.length && value.charCodeAt(i) !== c) i += value.charCodeAt(i) === 92 ? 2 : 1;
    } else if (c === 40) depth++;
    else if (c === 41 && --depth === 0) return i === value.length - 1;
  }
  return false;
}

// A gradient's arguments as jsdom 27 and later write them (black box,
// #264): colors as in color properties, the rest in lowercase, and the
// first argument (direction, shape, size, position, color space) without
// its defaults, as whole tokens wherever they are: to bottom (linear;
// to bottom right is right), ellipse and farthest-corner (radial), at
// center (radial and conic; at center top is top). An argument left empty
// goes. Prefixed gradients keep their first argument (-webkit- ones are
// invalid there).
const GRADIENT_PRELUDE =
  /^(?:(?:to|in|at|from|circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner)(?![\w-])|[+-]?[\d.])/i;
function gradientArguments(name, args) {
  for (let k = 0; k < args.length; k++) args[k] = serializeColors(args[k]).toLowerCase();
  const first = args[0];
  if (first === undefined || name.charCodeAt(0) === 45 || !GRADIENT_PRELUDE.test(first)) return args;
  const tokens = first
    .replace(/\/\*[^]*?\*\//g, ' ')
    .trim()
    .split(/\s+/);
  const kind = name.charCodeAt(name.length - 10); // linear-gradient: r, radial: l, conic: c
  const kept = [];
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    const next = tokens[k + 1];
    if (kind === 114 && token === 'to' && next === 'bottom') k++;
    else if (kind !== 114 && token === 'at' && next === 'center') k++;
    else if (kind === 108 && (token === 'ellipse' || token === 'farthest-corner')) continue;
    else kept.push(token);
  }
  if (kept.length) args[0] = kept.join(' ');
  else args.shift();
  return args;
}

// A url() component as cssstyle 2.3 to 4.6 read it in background-image
// (black box, #144): whitespace after url( is skipped; inside, an escape
// (\\X: any character, a space or line feed too) or any character but a
// quote, a parenthesis, space, tab or line feed (a carriage return, form
// feed, control character or no-break space is kept); in quotes the same.
// Other url()s are invalid (url(a b.png), url(a.png ), url("a.png),
// url(a.png)junk, url(a"b.png), URL(a.png)). The background shorthand
// reads its own (BG_URL_OLD and BG_URL_4_4).
const LEGACY_URL_BODY = String.raw`(?:\\[\s\S]|[^"'()\\ \t\n])*`;
const LEGACY_URL = new RegExp(
  String.raw`^url\(\s*(?!\s)(?:"${LEGACY_URL_BODY}"|'${LEGACY_URL_BODY}'|${LEGACY_URL_BODY})\)$`,
);
const LEGACY_URLS = new RegExp(
  String.raw`url\(\s*(?!\s)("${LEGACY_URL_BODY}"|'${LEGACY_URL_BODY}'|${LEGACY_URL_BODY})\)`,
  'g',
);
const LEGACY_URL_NAMES = new Set(['background', 'background-image']);
// A well-formed url() (to look past its insides).
const URL_FUNCTION = /\burl\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^"'()\s]*))\s*\)/gi;
// Every url() component of a background-image value is one LEGACY_URL reads.
const legacyImageUrls = (value) =>
  segments(value, BG_SEPARATOR_LEGACY, true).every((t, i) => i % 2 === 1 || !/url\(/i.test(t) || LEGACY_URL.test(t));
const unescapeLegacy = (text) => text.replace(/\\([\s\S])/g, '$1');
// url() in background and background-image as cssstyle 2.3 to 4.6 write
// it (black box, #144): before 4.3.1 ('jsdom25', 'jsdom22' and 'jsdom20')
// without quotes, background-image's as written (url(a\62.png)), the
// shorthand's with each escape read as the character after the backslash
// (url(a62.png)); from 4.3.1 ('jsdom26') in double quotes, escapes read so
// and a double quote or backslash escaped again (url("a\\b.png"); the
// shorthand with cssstyle 4.3.1 reads the escapes twice: url("ab.png")).
function legacyUrls(name, value, mode) {
  if (!value.includes('url(')) return value;
  const shorthand = name === 'background';
  return value.replace(LEGACY_URLS, (m, body) => {
    if (body[0] === '"' || body[0] === "'") body = body.slice(1, -1);
    if (mode !== 'jsdom26') return `url(${shorthand ? unescapeLegacy(body) : body})`;
    let url = unescapeLegacy(body);
    if (shorthand && colorKeywords === 'css2') url = unescapeLegacy(url);
    return `url("${url.replace(/["\\]/g, '\\$&')}")`;
  });
}

// A list (font families, background layers): ", " between its items
// (jsdom 26 and later).
const familyCommas = (value) =>
  value.includes(',')
    ? splitOutside(value, ',')
        .map((f) => f.trim())
        .join(', ')
    : value;

// Numbers and dimensions at the top level serialize canonically (CSSOM):
// .5 -> 0.5, 10.0px -> 10px, +1 -> 1. Not inside functions. Integers keep
// all their digits (CSSOM: never in scientific notation).
const INTEGER = /^[+-]?\d+$/;
const integerText = (text) =>
  text
    .replace(/^\+/, '')
    .replace(/^(-?)0+(?=\d)/, '$1')
    .replace(/^-0$/, '0');
const NUMBER_TOKEN = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i;
function canonicalNumbers(value) {
  if (!/\d/.test(value)) return value;
  const parts = segments(value);
  for (let i = 0; i < parts.length; i += 2) {
    const m = NUMBER_TOKEN.exec(parts[i]);
    if (m) parts[i] = `${INTEGER.test(m[1]) ? integerText(m[1]) : Number(m[1])}${m[2]}`;
  }
  return parts.join('');
}

// Runs of whitespace outside quotes as one space.
function collapseSpaces(value) {
  let out = '',
    quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote !== null) {
      out += c;
      if (c === '\\' && i + 1 < value.length) out += value[++i];
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === '(' && out.endsWith('url') && (out.length === 3 || !isNameCode(out.charCodeAt(out.length - 4)))) {
      // A url()'s insides as written (url(a\rb.png) keeps its carriage
      // return); not another function's whose name ends in url (myurl()).
      // cssstyle 4.3.1 to 4.6 read url( in lowercase only.
      const url = /^\((?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\\[\s\S]|[^)])*\)?/.exec(value.slice(i))[0];
      out += url;
      i += url.length - 1;
    } else if (/\s/.test(c)) {
      if (!out.endsWith(' ')) out += ' ';
    } else out += c;
  }
  return out;
}

// calc() as jsdom 26 with cssstyle 4.3.1 and later serializes it in
// lengths (black box): a sum of two terms, each a number, percentage or
// dimension, or a product of one and a number (* or /), is simplified:
// terms of the same unit are added, products computed (to 6 significant
// digits), and the terms sorted (numbers, percentages, then the units in
// alphabetical order), a negative term after the first written with -:
// calc(700px + 50%) is calc(50% + 700px), calc(10px - 100%) is
// calc(-100% + 10px), calc(100% / 3) is calc(33.3333%), and whitespace
// is normalized. Other calc() values (three or more terms, parentheses,
// var(), absolute units other than px, which jsdom converts) are kept as
// written.
const CALC_TERM = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?$/i;
const CALC_PRODUCT = /^(.+?)\s*([*/])\s*(.+)$/;
const ABSOLUTE_UNITS = new Set(['in', 'cm', 'mm', 'q', 'pt', 'pc']);
// Left out: border widths (cssstyle 4.3 drops calc() there) and
// line-height (kept as written before 4.4).
const BORDER_WIDTHS = new Set([
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
]);
const sixDigits = (n) => String(Number(n.toPrecision(6)));
function calcTerm(text) {
  const m = CALC_TERM.exec(text);
  if (m === null) {
    const p = CALC_PRODUCT.exec(text);
    if (p === null) return null;
    const a = CALC_TERM.exec(p[1]),
      b = CALC_TERM.exec(p[3]);
    if (a === null || b === null || (a[2] && b[2]) || (p[2] === '/' && b[2])) return null;
    const [term, factor] = a[2] || p[2] === '/' ? [a, b] : [b, a];
    const n = p[2] === '/' ? Number(term[1]) / Number(factor[1]) : Number(term[1]) * Number(factor[1]);
    return Number.isFinite(n) ? { n, unit: (term[2] ?? '').toLowerCase(), text: null } : null;
  }
  const unit = (m[2] ?? '').toLowerCase();
  // Kept as written, apart from the number's form (.5 is 0.5).
  return {
    n: Number(m[1]),
    unit,
    text: `${m[1].startsWith('+') ? '+' : ''}${INTEGER.test(m[1]) ? integerText(m[1]) : Number(m[1])}`,
  };
}
const unitRank = (unit) => (unit === '' ? '0' : unit === '%' ? '1' : `2${unit}`);
function simplifyCalc(value) {
  if (!value.endsWith(')')) return value;
  const inner = value.slice(5, -1).trim().replace(/\s+/g, ' ');
  if (/[()]/.test(inner)) return value;
  const parts = inner.split(' ');
  let terms;
  const plus = parts.indexOf('+'),
    minus = parts.indexOf('-');
  const op = plus >= 0 ? plus : minus;
  if (op < 0) terms = [calcTerm(inner)];
  else {
    if ((plus >= 0 && minus >= 0) || parts.lastIndexOf(parts[op]) !== op) return value;
    const second = calcTerm(parts.slice(op + 1).join(' '));
    if (second !== null && parts[op] === '-') {
      second.n = -second.n;
      second.text =
        second.text === null
          ? null
          : second.text.startsWith('-')
            ? second.text.slice(1)
            : `-${second.text.replace(/^\+/, '')}`;
    }
    terms = [calcTerm(parts.slice(0, op).join(' ')), second];
  }
  if (terms.some((t) => t === null || ABSOLUTE_UNITS.has(t.unit))) return value;
  const number = (t) => `${t.text ?? sixDigits(t.n)}${t.unit}`;
  if (terms.length === 2 && terms[0].unit === terms[1].unit)
    return `calc(${sixDigits(terms[0].n + terms[1].n)}${terms[0].unit})`;
  if (terms.length === 1) return `calc(${number(terms[0])})`;
  // A dimension subtracted stays after the first term (calc(100vh - 64px)).
  if (
    parts[op] === '-' &&
    terms[1].unit !== '' &&
    terms[1].unit !== '%' &&
    unitRank(terms[1].unit) < unitRank(terms[0].unit)
  ) {
    return `calc(${number(terms[0])} - ${number(terms[1]).replace(/^-/, '')})`;
  }
  terms.sort((a, b) => (unitRank(a.unit) < unitRank(b.unit) ? -1 : unitRank(a.unit) > unitRank(b.unit) ? 1 : 0));
  const [first, next] = terms;
  const negative = next.n < 0 || Object.is(next.n, -0);
  const rest = negative ? `- ${number(next).replace(/^-/, '')}` : `+ ${number(next)}`;
  return `calc(${number(first)} ${rest})`;
}

// Validation modes (css-values.js): 'spec' checks every property's grammar,
// as jsdom 27 and later do; 'jsdom26' only the properties jsdom 26 checked,
// without numeric ranges. A window's mode is set on its CSSStyleProperties
// prototype, and each declaration block records it when created. (Of the
// properties jsdom 26 checked, flex-basis, border-spacing, font-weight and
// font-variant accepted values outside their ranges; they are left out, and
// flex is checked although jsdom 26 took a negative basis.)
const JSDOM26_VALIDATED = new Set([
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  'background',
  'background-attachment',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-width',
  'border-collapse',
  'border-color',
  'border-left',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-right',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-style',
  'border-top',
  'border-top-color',
  'border-top-style',
  'border-top-width',
  'border-width',
  'bottom',
  'clear',
  'clip',
  'color',
  'flex',
  'float',
  'flood-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'height',
  'left',
  'lighting-color',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'opacity',
  'outline-color',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'right',
  'stop-color',
  'top',
  'width',
]);
// Properties jsdom 26 (cssstyle 4) parses; it keeps the others' values as
// written (min-height: 0 stays 0, gap: +.5 stays +.5). Measured with
// cssstyle 4.4 to 4.6.
const JSDOM26_PARSED = new Set([
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  'background-color',
  'background-image',
  'border-bottom-color',
  'border-bottom-width',
  'border-left-color',
  'border-left-width',
  'border-right-color',
  'border-right-width',
  'border-spacing',
  'border-top-color',
  'border-top-width',
  'bottom',
  'color',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
  'flood-color',
  'font-family',
  'font-size',
  'font-weight',
  'height',
  'left',
  'lighting-color',
  'line-height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'opacity',
  'outline-color',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'right',
  'stop-color',
  'top',
  'width',
  'background',
  'background-position',
  'border',
  'border-bottom',
  'border-color',
  'border-left',
  'border-right',
  'border-top',
  'border-width',
  'flex',
  'font',
  'font-variant',
  'margin',
  'padding',
]);
// 'jsdom25' is 'jsdom26' with unquoted url()s (cssstyle before 4.3.1);
// 'jsdom22' (cssstyle 3: jsdom 21 to 23) is 'jsdom25' without calc() in
// margins and paddings; 'jsdom20' (cssstyle 2) the same. 'jsdom27' (jsdom
// 27 to 29) is 'spec' but where jsdom 30 changed (a background's math,
// zeros and positions, clip's unitless zeros). The properties each
// profile knows are its style surface (styleSurface), not its mode.
export const isLegacyMode = (mode) =>
  mode === 'jsdom26' || mode === 'jsdom25' || mode === 'jsdom22' || mode === 'jsdom20';
const isSpecMode = (mode) => mode === 'spec' || mode === 'jsdom27';
const modes = new WeakMap(); // CSSStyleProperties prototype -> mode
const surfaces = new WeakMap(); // CSSStyleProperties prototype -> styleSurface (profiles before jsdom 30.1)
// The profile's compat (window-features.js profileCompat): styleSurface,
// its style surface (src/style-surface.js), or null for jsdom 30.1 and
// later. The prototype was built with the surface's accessors
// (styleDescriptors): jsdom 26 with cssstyle 4.6 has no
// style.webkitUserSelect, and assigning it creates an own data property
// (react-spectrum's usePress tests save and restore it that way); cssstyle
// 2 to 4.3 write it as webkit-user-select. legacyFont: cssstyle's font
// shorthand before 4.4 ('cssstyle4.1' or 'cssstyle4.2', see legacyFont in
// shorthands.js), or null. colorKeywords: how its cssstyle writes color
// keywords ('css2', 'written' or null). accessorKeepsImportant: a style
// accessor's write keeps the !important it replaces ('named': but
// cssFloat's, 'all', or null). varDropsImportant,
// mostDropImportant, varInStrings, customDropsImportant and
// borderVarDrops: declarations
// that lose their !important, and border ones with var() that are
// dropped (parseInto, dropsImportant). importantByWrittenName: how a
// declaration after an !important one is looked up (parseInto).
export function setValidationMode(proto, mode, compat = {}) {
  modes.set(proto, mode);
  const key = compat.styleSurface ?? null;
  if (key === null) return;
  const legacyFont = compat.legacyFont ?? null;
  const colors = compat.colorKeywords ?? null;
  const varDropsImportant = compat.varDropsImportant ?? null;
  const mostDropImportant = compat.mostDropImportant ?? null;
  const accessorKeepsImportant = compat.accessorKeepsImportant ?? null;
  const varInStrings = compat.varInStrings === true;
  const customDropsImportant = compat.customDropsImportant === true;
  const borderVarDrops = compat.borderVarDrops === true;
  const importantByWrittenName = compat.importantByWrittenName === true;
  if (
    legacyFont === null &&
    colors === null &&
    varDropsImportant === null &&
    mostDropImportant === null &&
    accessorKeepsImportant === null &&
    !customDropsImportant &&
    !borderVarDrops &&
    !importantByWrittenName
  ) {
    surfaces.set(proto, styleSurface(key));
    return;
  }
  // Built once per variant: window creation only looks it up.
  const id = `${key} ${legacyFont} ${colors} ${varDropsImportant} ${mostDropImportant} ${accessorKeepsImportant} ${varInStrings} ${customDropsImportant} ${borderVarDrops} ${importantByWrittenName}`;
  let surface = variantSurfaces.get(id);
  if (surface === undefined) {
    surface = {
      ...styleSurface(key),
      caches: Object.create(null),
      colors,
      varDropsImportant,
      mostDropImportant,
      accessorKeepsImportant,
      varInStrings,
      customDropsImportant,
      borderVarDrops,
      importantByWrittenName,
    };
    if (legacyFont !== null) surface.legacyFont = legacyFont;
    variantSurfaces.set(id, surface);
  }
  surfaces.set(proto, surface);
}

// A style surface with cssstyle's font shorthand before 4.4, its color
// keywords before 4.6, or declarations that lose their !important: the
// same names, its own declared value caches.
const variantSurfaces = new Map();
const isLegacyFont = (surface, name) => name === 'font' && surface !== null && surface.legacyFont !== undefined;

// Before 4.4 cssstyle's font removes the font longhands before it is set,
// and itself too when set through the style object (it moves to the end,
// as a new declaration); inherit removes them all.
function removeLegacyFont(decls, surface, itself = true) {
  let removed = itself && decls.delete('font');
  for (const longhand of LEGACY_FONT_LONGHANDS) removed = decls.delete(longhand) || removed;
  decls.legacyFont = surface.legacyFont;
  return removed;
}

// A profile's style surface, from its measured data (black box; generated
// by scripts/gen-style-surface.mjs): the CSS names setProperty drops, the
// accessors that write another name than jsdom 30's (or that jsdom 30 does
// not have), and the names written that warpdom's data does not have (kept
// as written). It lacks the accessors of dropped names that write no other
// name (missingAccessors). Built once per profile key.
const surfaceCache = new Map();
const words = (text) => (text ? text.split(' ') : []);
// cssstyle 2 to 4.3: webkitUserSelect and webkit-user-select write webkit-user-select.
const legacyTarget = (accessor) => cssName(accessor).replace(/^-webkit-/, 'webkit-');
export function styleSurface(key) {
  let surface = surfaceCache.get(key);
  if (surface !== undefined) return surface;
  const data = SURFACES[key];
  const from = data.from ? styleSurface(data.from) : null;
  const drops = new Set(from?.drops);
  const writes = new Map(from?.writes);
  for (const name of words(data.drops)) drops.add(name);
  for (const name of words(data.keeps)) drops.delete(name);
  for (const accessor of words(data.writes)) writes.set(accessor, data.targets?.[accessor] ?? legacyTarget(accessor));
  for (const accessor of words(data.unwrites)) writes.delete(accessor);
  // cssstyle 2 to 4.3 also have azimuth, which the generator leaves out
  // (it keeps none of the values it writes; see azimuthValue).
  if (AZIMUTH_KINDS[key] === 'angle') writes.set('azimuth', 'azimuth');
  const extras = new Set([...writes.values()].filter((name) => !isKnownProperty(name)));
  surface = { key, drops, writes, extras, caches: Object.create(null) };
  surfaceCache.set(key, surface);
  return surface;
}
const missing = (surface, accessor, name) => surface.drops.has(name) && !surface.writes.has(accessor);
export const missingAccessors = (surface) =>
  STYLE_ACCESSORS.filter((accessor) => missing(surface, accessor, cssName(accessor)));
const modeOf = (proto) => modes.get(proto) ?? 'spec';
export const validationModeOf = (window) => modeOf(window[S].protos.CSSStyleProperties);
export const protosMode = (protos) => modeOf(protos.CSSStyleProperties);
const surfaceOf = (proto) => surfaces.get(proto) ?? null;
// A property the profile does not know: setProperty and parsing drop it.
const dropped = (surface, name) => surface !== null && surface.drops.has(name);
export const styleSurfaceOf = (window) => surfaceOf(window[S].protos.CSSStyleProperties);

// A property name CSSOM accepts: a custom property, or one the
// specifications define. Others are dropped (style.setProperty('foo', ...)).
const isKnownProperty = (name) =>
  name.startsWith('--') ||
  LONGHANDS[name] !== undefined ||
  SHORTHANDS[name] !== undefined ||
  ALIASES[name] !== undefined;

// Declared values by mode, property and raw value: style writes repeat the
// same few values, so each is validated and serialized once. INVALID marks
// a value the property's grammar rejects.
const INVALID = null;
// A background that sets each longhand to its initial value instead
// (jsdom 27 and later: backgroundValue, setInitials); IMAGE_DROPPED, a
// layer of it (backgroundLayer). Symbols, so that no value (a custom
// property's, kept as written) is taken for one.
const INITIALS = Symbol('initials');
const IMAGE_DROPPED = Symbol('dropped');
const declaredCaches = {
  spec: new Map(),
  jsdom27: new Map(),
  jsdom26: new Map(),
  jsdom25: new Map(),
  jsdom22: new Map(),
  jsdom20: new Map(),
  page: new Map(),
}; // mode -> property -> (raw value -> serialized)
// surface: the profile's (styleSurface), null for jsdom 30.1 and later; the
// names it drops are dropped by setProperty and parsing (dropped), not
// here: an accessor may still write one (cssstyle 2's webkitTextFillColor).
function declaredValue(name, value, mode = 'spec', surface = null) {
  const cache = surface === null ? declaredCaches[mode] : (surface.caches[mode] ??= new Map());
  let byValue = cache.get(name);
  if (byValue === undefined) cache.set(name, (byValue = new Map()));
  let out = byValue.get(value);
  if (out === undefined) {
    legacyColors =
      surface === null || surface.legacyFont !== 'cssstyle4.1'
        ? false
        : mode === 'jsdom20' || mode === 'jsdom22'
          ? 'cssstyle3'
          : true;
    colorKeywords = surface !== null ? (surface.colors ?? null) : null;
    zeroAsWritten = surface !== null && (surface.key === 'cssstyle5' || surface.key === 'cssstyle5.0');
    identsInLowercase = surface !== null && surface.key.startsWith('cssstyle5');
    if (surface === null || !surface.key.startsWith('cssstyle')) urlStyle = 'spec';
    else urlStyle = surface.key.startsWith('cssstyle6') ? 'quotes' : 'written';
    if (mode === 'page') out = pageDescriptorValue(name, value);
    else if (surface !== null && surface.extras.has(name))
      out = name === 'azimuth' ? azimuthValue(value, surface) : value;
    else if (!isKnownProperty(name)) out = INVALID;
    else if (isLegacyFont(surface, name))
      out = /^inherit$/i.test(value) ? INVALID : (legacyFont(value, surface.legacyFont) ?? INVALID);
    else {
      const written = isSpecMode(mode) ? identValue(name, value) : value;
      out = versionedValue(name, written, mode, surface);
      if (out === undefined) {
        const checked = isSpecMode(mode) || JSDOM26_VALIDATED.has(name);
        out = !checked || isValidValue(name, written) ? serializeDeclared(name, written, mode) : INVALID;
        if (out === INVALID && name === 'background-image' && isSpecMode(mode) && value.includes('var('))
          out = imageVarLayers(value, mode, surface);
      }
      if (
        out !== INVALID &&
        isColorProperty(name) &&
        (isSpecMode(mode) || JSDOM26_VALIDATED.has(name)) &&
        rejectsColor(name, value, surface)
      )
        out = INVALID;
    }
    if (byValue.size >= 500) byValue.clear();
    byValue.set(value, out);
  }
  return out;
}

// background-image layers in jsdom 27 and later, set with setProperty or
// in a style sheet: one or more with var() (as hasVarFunction reads it),
// as written, and images (url(a.png),var(--a) is url("a.png"), var(--a),
// none,var(--a) x is none, var(--a) x; red,var(--a) is invalid). A
// declaration block drops them (parseInto; black box, #234).
function imageVarLayers(value, mode, surface) {
  const layers = splitOutside(value, ',', true);
  if (layers.length < 2) return INVALID;
  let withVar = false;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i].trim();
    if (hasVarFunction(layer)) {
      withVar = true;
      layers[i] = layer;
    } else {
      layers[i] = layer === '' ? INVALID : declaredValue('background-image', layer, mode, surface);
      if (layers[i] === INVALID) return INVALID;
    }
  }
  return withVar ? layers.join(', ') : INVALID;
}

// azimuth (CSS 2 aural style sheets), black box: cssstyle 2 to 4.3 write
// it as an angle in degrees ('angle': left 320deg, behind left 220deg,
// -30deg 330deg, 10grad 9deg), keywords in any case, angles with lowercase
// units, other values ignored; from 4.2 every angle written becomes NaNdeg
// (a cssstyle bug: compat.legacyFont 'cssstyle4.2'). 4.4 to 5.2 keep any
// value as written, 5.3 only the CSS-wide keywords ('keywords'); 6.0 and
// jsdom 29 have no azimuth.
const AZIMUTH_KINDS = { cssstyle2: 'angle', cssstyle3: 'angle', 'cssstyle4.1': 'angle', cssstyle5: 'keywords' };
const AZIMUTH_POSITIONS = Object.assign(Object.create(null), {
  'left-side': 270,
  'far-left': 300,
  left: 320,
  'center-left': 340,
  center: 0,
  'center-right': 20,
  right: 40,
  'far-right': 60,
  'right-side': 90,
});
const AZIMUTH_ANGLE = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(deg|grad|rad)$/;
const AZIMUTH_NAN_ANGLE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:deg|grad|rad|turn)$/;
export const hasAngleAzimuth = (surfaceKey) => AZIMUTH_KINDS[surfaceKey] === 'angle';
function azimuthValue(value, surface) {
  const kind = AZIMUTH_KINDS[surface.key];
  if (kind === 'keywords') return CSS_WIDE_KEYWORD.test(value) ? value.toLowerCase() : INVALID;
  if (kind !== 'angle') return value;
  let degrees;
  if (surface.legacyFont === 'cssstyle4.2') {
    if (AZIMUTH_NAN_ANGLE.test(value)) return 'NaNdeg';
  } else {
    const angle = AZIMUTH_ANGLE.exec(value);
    if (angle !== null) {
      const n = Number(angle[1]);
      degrees = angle[2] === 'deg' ? n : angle[2] === 'grad' ? (n * 360) / 400 : (n * 180) / Math.PI;
    }
  }
  if (degrees === undefined) {
    const words = value.toLowerCase().split(/\s+/);
    if (words.length === 1) {
      if (words[0] === 'leftwards' || words[0] === 'rightwards') return words[0];
      degrees = words[0] === 'behind' ? 180 : AZIMUTH_POSITIONS[words[0]];
    } else if (words.length === 2 && (words[0] === 'behind' || words[1] === 'behind')) {
      const other = words[0] === 'behind' ? words[1] : words[0];
      degrees =
        other === 'behind' ? 180 : AZIMUTH_POSITIONS[other] === undefined ? undefined : 180 - AZIMUTH_POSITIONS[other];
    }
    if (degrees === undefined) return INVALID;
  }
  // Into [0, 360]: 720deg is 360deg, -360deg 0deg.
  if (degrees > 360) degrees = degrees % 360 || 360;
  else if (degrees < 0) degrees = (degrees % 360) + (degrees % 360 < 0 ? 360 : 0);
  return `${degrees}deg`;
}

// Values whose serialization depends on the jsdom version beyond the
// modes' general rules (black box, jsdom 20 to 30); undefined for the
// others. Runs once per property and raw value (declaredValue caches it).
const ONE_NUMBER = /^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
function versionedValue(name, value, mode, surface) {
  if (isLegacyMode(mode)) {
    const lower = value.toLowerCase();
    // cssstyle before 4.3.1 reads var( anywhere as var() (it drops
    // calc(1px+var(--a)); black box, jsdom 20 to 22 and 25, #234).
    const withVar = mode === 'jsdom26' ? hasVarFunction(value) : value.includes('var(');
    const kind = CSS_WIDE_KEYWORD.test(value) ? lower : lower === 'auto' ? 'auto' : withVar ? 'var' : null;
    if (kind !== null && droppedBy(mode, kind, name)) return INVALID;
    if (kind === null && legacyMeasureRejects(name, value, surface)) return INVALID;
    // background-image's url()s as cssstyle reads them, the rest by its
    // grammar; with var() the value is kept as written (jsdom 26), but
    // not with var( in a string or another name (url("notvar(x).png"),
    // black box: cssstyle 4.3.1 to 4.6 drop it, #222).
    if (name === 'background-image' && kind !== 'var' && /url\(/i.test(value)) {
      if (!legacyImageUrls(value)) return INVALID;
      return isValidValue(name, value.replace(LEGACY_URLS, 'url(x)')) ? serializeDeclared(name, value, mode) : INVALID;
    }
    // cssstyle before 4.4 keeps currentColor, border-spacing: 0 and a
    // border width of 0 as written; before 4.3.1 border-color lowercased.
    if (colorKeywords === 'css2') {
      if (lower === 'currentcolor' && isColorProperty(name)) return value;
      if ((name === 'border-spacing' || BORDER_WIDTHS.has(name)) && ZERO.test(value)) return value;
      if (name === 'border-color' && mode !== 'jsdom26')
        return isValidValue(name, value) && !rejectsColor(name, value, null) ? lower : INVALID;
    }
  }
  // jsdom 26 (cssstyle 4.3.1 and later) drops border-style: none; jsdom
  // 27 and later keep it (black box, 27.4.0 to 30.1.3, #179).
  if (mode === 'jsdom26' && name === 'border-style' && value.toLowerCase() === 'none') return INVALID;
  // aspect-ratio with one number (black box, 26.1.0 to 30.1.3, #264 item
  // 52): 27.0.1 to 28.0.0 keep it as written (02, 1e1), 28.1.0 rejects
  // it, 29 and later write it as a ratio (02 is 2 / 1).
  if (name === 'aspect-ratio' && !isLegacyMode(mode) && ONE_NUMBER.test(value)) {
    const key = surface?.key;
    if (key === 'cssstyle5') return value;
    return key === 'cssstyle6.1' ? INVALID : `${Number(value)} / 1`;
  }
  // scrollbar-color takes a system color alone in 27.0.1 to 28.0.0, in
  // lowercase (scrollbar-color: Canvas; not red; same source).
  if (name === 'scrollbar-color' && surface?.key === 'cssstyle5' && systemColorKind(value.toLowerCase()) !== 0)
    return value.toLowerCase();
  if (
    (mode === 'jsdom20' || mode === 'jsdom22') &&
    (name.startsWith('margin') || name.startsWith('padding')) &&
    /calc\(/i.test(value)
  )
    return INVALID;
  // jsdom 27 and later: background-image takes no gradient whose name is
  // not in lowercase (background reads it as none: droppedImage).
  if (
    name === 'background-image' &&
    !isLegacyMode(mode) &&
    value.includes('(') &&
    !hasVarFunction(value) &&
    unreadGradientFunction(value)
  )
    return INVALID;
  if (name === 'background') {
    const background = backgroundValue(value, mode, surface);
    if (background !== undefined) return background;
  }
  if (BORDER_SHORTHAND.has(name)) return borderValue(name, value, mode);
  if (name === 'clip') return clipValue(value, mode);
  // jsdom 30 keeps outline as written (colors, numbers, order), a 0 as 0px.
  if (name === 'outline' && mode === 'spec')
    return !isValidValue(name, value)
      ? INVALID
      : CSS_WIDE_KEYWORD.test(value)
        ? value.toLowerCase()
        : ZERO.test(value)
          ? '0px'
          : value;
  return undefined;
}

// Lengths, sizing keywords and gradients cssstyle rejects before 4.4
// (black box: cssstyle 2.3.0 to 4.6.0 measured on their own, #239; jsdom
// 20.0.3, 21.1.2, 22.1.0 and 25.0.1 with the cssstyle each installs). The
// properties it reads with its length parser take, at the top level, before
// 4.2 the units BG_LENGTH_3 reads (10dvh, 10vmin, 1lh, 10PX are invalid),
// in 4.2 and 4.3 those of BG_LENGTH_4 in lowercase; min-content,
// max-content and fit-content only from 4.4, and in flex-basis and flex
// never fit-content. Gradients in background and background-image from
// 4.3 (4.2 also rejects them, not modeled: it is read as 4.3 there);
// before 4.2 a gradient in any case (LINEAR-GRADIENT too).
// Other properties (min-width, line-height, border-spacing, font) keep
// such values as written.
const LEGACY_MEASURED = new Set([
  'width',
  'height',
  'flex-basis',
  'flex',
  'top',
  'right',
  'bottom',
  'left',
  'font-size',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'background-position',
]);
const SIZING_KEYWORDS = new Set(['min-content', 'max-content', 'fit-content']);
const SIZED = new Set(['width', 'height', 'flex-basis', 'flex']);
// A top-level token that is not a number, length or percentage (it does
// not start with a digit, or a . or sign before one), or one cssstyle
// reads: before 4.2 px, cm, mm, in, pt, pc, em, ex, ch, rem, vh and vw
// (BG_LENGTH_3) and %, in 4.2 and 4.3 its lengthRegEx's lowercase units,
// an exponent and no leading zero (in the exponent neither: 1e01px is
// invalid there, 1e1px valid); without a unit, an exponent only in flex
// (its grow and shrink: flex: 1e1 and flex: 1 1e-1 10px are valid there,
// flex: 01, flex: 1e01 and width: 0e1 not). A value of such tokens, read
// in one linear pass (each token's first character picks one branch).
const OTHER_TOKEN = String.raw`(?:[^\s\d.+-]|[+-](?![.\d])|\.(?!\d))\S*`;
const NUMBER_4_1 = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px|cm|mm|in|pt|pc|em|ex|ch|rem|vh|vw|%)?`;
const MANTISSA_4_2 = String.raw`[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)`;
const EXPONENT_4_2 = String.raw`e-?(?:0|[1-9]\d*)`;
const UNIT_4_2 = String.raw`(?:%|[cm]m|[dls]?v(?:[bhiw]|max|min)|in|p[ctx]|q|r?(?:[cl]h|cap|e[mx]|ic))`;
const NUMBER_4_2 = `${MANTISSA_4_2}(?:(?:${EXPONENT_4_2})?${UNIT_4_2})?`;
const FLEX_NUMBER_4_2 = `${MANTISSA_4_2}(?:${EXPONENT_4_2})?${UNIT_4_2}?`;
const tokensOf = (token) => new RegExp(String.raw`^\s*(?:${token})(?:\s+(?:${token}))*\s*$`);
const VALUE_4_1 = tokensOf(`${OTHER_TOKEN}|${NUMBER_4_1}(?!\\S)`);
const VALUE_4_2 = tokensOf(`${OTHER_TOKEN}|${NUMBER_4_2}(?!\\S)`);
const FLEX_VALUE_4_2 = tokensOf(`${OTHER_TOKEN}|${FLEX_NUMBER_4_2}(?!\\S)`);
const TOKEN_4_1 = new RegExp(`^(?:${OTHER_TOKEN}|${NUMBER_4_1})$`);
const TOKEN_4_2 = new RegExp(`^(?:${OTHER_TOKEN}|${NUMBER_4_2})$`);
const FLEX_TOKEN_4_2 = new RegExp(`^(?:${OTHER_TOKEN}|${FLEX_NUMBER_4_2})$`);
const LEGACY_GRADIENT = /(?:^|[\s,])(?:-webkit-)?(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
function legacyMeasureRejects(name, value, surface) {
  const era = surface?.legacyFont; // 'cssstyle4.1' before 4.2, 'cssstyle4.2' before 4.4
  if (name === 'background' || name === 'background-image')
    return era === 'cssstyle4.1'
      ? LEGACY_GRADIENT.test(value)
      : value.includes('(') && unreadGradient(value, name === 'background');
  if (!LEGACY_MEASURED.has(name)) return false;
  const sized = SIZED.has(name) && /content/i.test(value);
  if (era === undefined && !sized) return false;
  const functions = value.includes('(');
  let whole = VALUE_4_2;
  let single = TOKEN_4_2;
  if (era === 'cssstyle4.1') [whole, single] = [VALUE_4_1, TOKEN_4_1];
  else if (name === 'flex') [whole, single] = [FLEX_VALUE_4_2, FLEX_TOKEN_4_2];
  if (!sized && !functions) return !whole.test(value);
  // Top-level tokens (functions are left to the grammar).
  const tokens = functions ? segments(value, /\s/).filter((t, i) => i % 2 === 0) : value.split(/\s+/);
  for (const token of tokens) {
    if (token === '' || token.includes('(')) continue;
    if (sized && token.length === 11) {
      const lower = token.toLowerCase();
      if (SIZING_KEYWORDS.has(lower) && (era !== undefined || (lower === 'fit-content' && name.startsWith('flex'))))
        return true;
    }
    if (era !== undefined && !single.test(token)) return true;
  }
  return false;
}

// A gradient cssstyle 4.2 to 4.6 and jsdom 27 and later do not read in
// background and background-image (black box: cssstyle 4.2.1 to 4.6.0 on
// their own, jsdom 23.2.0 to 30.1.3, #264): one whose name is not in
// lowercase (LINEAR-GRADIENT(), Linear-Gradient()), with prefixed also a
// -webkit- one (cssstyle's background takes neither; background-image
// rejects a -webkit- one by its grammar).
const UPPERCASE = /[A-Z]/;
const GRADIENT_NAMES = /(?<![\w-])(-webkit-)?(?:repeating-)?(?:linear|radial|conic)-gradient\(/gi;
function unreadGradient(value, prefixed) {
  // (a value in lowercase without -webkit-, the usual one, is not scanned)
  if (!UPPERCASE.test(value) && !(prefixed && value.includes('-webkit-'))) return false;
  for (const [name, webkit] of value.matchAll(GRADIENT_NAMES))
    if ((prefixed && webkit !== undefined) || name !== name.toLowerCase()) return true;
  return false;
}
// The same for jsdom 27 and later's background-image, by the functions'
// names only: not in strings and url() tokens (url("LINEAR-GRADIENT(red,
// blue).png") has none; black box, 27.4.0 to 30.1.3). One pass, no copies.
const GRADIENT_AT = /(?:-webkit-)?(?:repeating-)?(?:linear|radial|conic)-gradient\(/iy;
function unreadGradientFunction(value) {
  if (!UPPERCASE.test(value)) return false;
  const n = value.length;
  for (let i = 0; i < n; i++) {
    const c = value.charCodeAt(i);
    if (c === 34 || c === 39) {
      // a string, to its closing quote (past escapes)
      for (i++; i < n; i++) {
        const q = value.charCodeAt(i);
        if (q === 92) i++;
        else if (q === c) break;
      }
    } else if (c === 40) {
      const end = urlTokenEnd(value, i);
      if (end !== -1) i = end - 1;
    } else if (
      (c === 45 || (c | 32) === 108 || (c | 32) === 114 || (c | 32) === 99) &&
      !(i > 0 && isNameCode(value.charCodeAt(i - 1)))
    ) {
      GRADIENT_AT.lastIndex = i;
      if (!GRADIENT_AT.test(value)) continue;
      const end = GRADIENT_AT.lastIndex;
      for (let j = i; j < end; j++) {
        const u = value.charCodeAt(j);
        if (u >= 65 && u <= 90) return true;
      }
      i = end - 1;
    }
  }
  return false;
}

// Values cssstyle drops for some properties it knows (black box): CSS-wide
// keywords, auto and var() (jsdom 26: var() in font-variant only). jsdom
// 20 to 25 drop the same ones.
const DROPPED = {
  legacy: {
    inherit:
      'border-bottom-color border-bottom-style border-bottom-width border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom color flex-grow flex-shrink flood-color font-size left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top background border-color border-style border-width flex font',
    initial:
      'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width',
    unset:
      'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width flex',
    revert:
      'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width flex margin padding',
    var: 'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width flex margin padding',
    auto: 'bottom flex-grow flex-shrink left outline-color right top flex',
  },
  jsdom26: {
    inherit: 'flex-grow flex-shrink background flex font',
    initial: 'flex-grow flex-shrink background font',
    unset: 'flex-grow flex-shrink background flex font',
    revert: 'flex-grow flex-shrink background flex font',
    var: 'font-variant',
    auto: 'border-spacing flex-grow flex-shrink font-weight outline-color font-variant',
  },
};
let droppedSets = null;
function droppedBy(mode, kind, name) {
  if (droppedSets === null) {
    droppedSets = {};
    for (const [key, lists] of Object.entries(DROPPED)) {
      droppedSets[key] = {};
      for (const [k, list] of Object.entries(lists)) droppedSets[key][k] = new Set(list.split(' '));
    }
  }
  return droppedSets[mode === 'jsdom26' ? 'jsdom26' : 'legacy'][kind]?.has(name) === true;
}

// border and its sides (width, style and color in any order), as jsdom's
// versions serialize them (black box, jsdom 20 to 30.1.3):
// - jsdom 27 to 30 ('spec', 'jsdom27'): the shortest form, width style
//   color, without initial values (medium, none, currentcolor); all
//   initial is medium (border: none is border: medium, border-top: 0 none
//   is border-top: 0px; #179). CSS-wide keywords are kept, lowercased (in
//   jsdom 27 and 28 a style attribute or cssText with one is left empty:
//   parseInto, borderVarDrops).
// - jsdom 26: width style color, a 0 width as 0px; on border a none
//   style is left out, alone it drops the declaration; on a side none and
//   hidden clear what came before them (border-top: 0 none drops it,
//   none 0 is 0px). CSS-wide keywords drop the declaration.
// - jsdom 20 to 25 (cssstyle before 4.3.1): as jsdom 26, but components as
//   written (to cssstyle 4.4 colors too; on border lowercased), border keeps a none style (alone it still drops it), sides
//   keep a 0 width as written and only none clears, and var() drops it.
const BORDER_SHORTHAND = new Set(['border', 'border-top', 'border-right', 'border-bottom', 'border-left']);
const BORDER_STYLE = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/i;
const BORDER_WIDTH = /^(thin|medium|thick|calc\(.*\)|[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?[a-z]*)$/i;
function borderValue(name, value, mode) {
  if (!isValidValue(name, value)) return INVALID;
  const spec = isSpecMode(mode);
  if (CSS_WIDE_KEYWORD.test(value)) return spec ? value.toLowerCase() : INVALID;
  const legacy = isLegacyMode(mode) && mode !== 'jsdom26';
  if (VAR_ENV_ATTR.test(value)) return legacy ? INVALID : value;
  const parts = segments(value);
  let width = null,
    style = null,
    color = null;
  const side = name !== 'border';
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (token === '') continue;
    if (i > 0 && parts[i - 1].includes(',')) return serializeDeclared(name, value, mode);
    if (BORDER_STYLE.test(token)) {
      const lower = token.toLowerCase();
      if (side && !spec && (lower === 'none' || (lower === 'hidden' && !legacy))) {
        width = color = null;
        style = '';
      } else style = token;
    } else if (BORDER_WIDTH.test(token)) width = token;
    else color = token;
  }
  if (style === '') style = null;
  if (spec) {
    if (width !== null && width.toLowerCase() === 'medium') width = null;
    if (style !== null && style.toLowerCase() === 'none') style = null;
    if (color !== null && color.toLowerCase() === 'currentcolor') color = null;
    if (width === null && style === null && color === null) return 'medium';
  } else if (!side && style !== null && style.toLowerCase() === 'none') {
    if (width === null && color === null) return INVALID;
    if (!legacy) style = null;
  }
  if (width === null && style === null && color === null) return INVALID;
  if (width !== null)
    width = legacy ? (ZERO.test(width) && !side ? '0px' : width) : ZERO.test(width) ? '0px' : canonicalNumbers(width);
  // cssstyle before 4.4: as written on the sides; on border lowercased
  // before 4.3.1.
  if (color !== null)
    color =
      colorKeywords === 'css2' && side
        ? color
        : colorKeywords === 'css2' && legacy
          ? color.toLowerCase()
          : declaredColors(color);
  return [width, style, color].filter((part) => part !== null).join(' ');
}

// The background shorthand with one layer, as each generation of jsdom
// parses and serializes it (black box, cssstyle 2.3 to 6.2 and jsdom 20 to
// 30.1.3; #130). Components: image (url(), a gradient or none), position,
// size (after a slash), repeat, attachment, origin and clip boxes, color.
// - cssstyle before 4.4 (jsdom 20 to 26 with it): no unitless 0 (rejected),
//   no size, space, round, local or boxes; a component given twice keeps
//   the last (10px 20px is 20px); written color image repeat attachment
//   position, as written.
// - cssstyle 4.4 to 4.6: a 0 is 0px; a component given twice (a two-value
//   position too: 0 0, top left) rejects the value, and so do a size,
//   boxes and several layers; written image position repeat attachment
//   color, keywords lowercased (none only from 4.6).
// - jsdom 27 and later: one position value is centered on the other axis
//   (0 is 0px center) and initial values are left out (none, repeat,
//   scroll, transparent); written image position / size repeat attachment
//   origin clip color. jsdom 27 to 29 lose a position of two or more
//   values (url(a.png) 0 0 is url("a.png"); a size stays, behind 0% 0% in
//   jsdom 29), and before 29 reject two boxes.
// undefined where the generation sets every longhand to its initial value
// instead (cssText then lists them: jsdom 27 and later with 0 0 alone,
// NONE, repeat) or for values left to the general rules (var(), CSS-wide
// keywords, several layers from jsdom 27).
const BG_REPEATS = new Set(['repeat', 'repeat-x', 'repeat-y', 'no-repeat']);
const BG_REPEATS_4_4 = new Set([...BG_REPEATS, 'space', 'round']);
const BG_ATTACHMENTS = new Set(['scroll', 'fixed']);
const BG_ATTACHMENTS_4_4 = new Set([...BG_ATTACHMENTS, 'local']);
const BG_BOXES = new Set(['border-box', 'padding-box', 'content-box']);
const BG_POSITIONS = new Set(['left', 'right', 'top', 'bottom', 'center']);
const BG_SIZES = /^(auto|cover|contain)$/i;
const BG_DIMENSION = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z]+|%)$/i;
const BG_GRADIENT = /^(-webkit-)?(repeating-)?(linear|radial|conic)-gradient\(/i;
const sizeToken = (t) => {
  if (ZERO.test(t)) return '0px';
  return BG_SIZES.test(t) ? t.toLowerCase() : canonicalNumbers(t.toLowerCase());
};
// A length or percentage in a position as cssstyle reads it (black box):
// before 4.2 px, cm, mm, in, pt, pc, em, ex, ch, rem, vh and vw, as
// written (10.0px, 010px; not 1e1px or 10PX); from 4.2 also q, lh, rlh,
// vmin, vmax, vb, vi and the small, large and dynamic viewport units (not
// cqw), with an exponent but no leading zero (010px), in lowercase before
// 4.4 and in any case from 4.4. Other units (5deg, 1s, 10bogus) are
// invalid.
const BG_LENGTH_3 = /^[+-]?(\d+\.?\d*|\.\d+)(px|cm|mm|in|pt|pc|em|ex|ch|rem|vh|vw|%)$/;
const BG_LENGTH_4 =
  /^[+-]?((0|[1-9]\d*)(\.\d*)?|\.\d+)(e[+-]?\d+)?(px|cm|mm|q|in|pt|pc|em|ex|ch|rem|lh|rlh|vmin|vmax|[sld]?v[hwbi]|%)$/;
// The characters between components (black box, #134): cssstyle 2.3 to 4.6
// split at any JavaScript whitespace (a carriage return, form feed, vertical
// tab or no-break space too); jsdom 27 and later at CSS whitespace (space,
// tab, line feed, carriage return, form feed), the grammar rejecting others.
const BG_SEPARATOR_LEGACY = /[\s,]/;
const BG_SEPARATOR = /[ \t\n\r\f,]/;
// A url() component as cssstyle 2.3 to 4.6 accept it (black box, #134): it
// ends at its closing parenthesis (url(a.png)junk and url("a.png) are
// invalid); whitespace after url( is skipped, but space, tab and line feed
// elsewhere (url(a.png ), url("a b.png")), an unclosed or mixed quote
// (url("a'b.png")), a parenthesis, or before cssstyle 4.4 an escaped quote,
// space or parenthesis reject it. From 4.4 an escaped double quote is kept.
// (?!\s): the unquoted body accepts a carriage return, form feed, vertical
// tab or no-break space too; the whitespace after url( is all read first, so
// a malformed value is rejected in linear time (#150 review).
const BG_URL_OLD =
  /^url\(\s*(?!\s)(?:"(?:\\[^"'()\s]|[^"'()\\ \t\n])*"|'(?:\\[^"'()\s]|[^"'()\\ \t\n])*'|(?:\\[^"'()\s]|[^"'()\\ \t\n])*)\)$/;
const BG_URL_4_4 =
  /^url\(\s*(?!\s)(?:"(?:\\[^'()\s]|[^"'()\\ \t\n\r\f])*"|'(?:\\[^"'()\s]|[^"'()\\ \t\n\r\f])*'|(?:\\[^'()\s]|[^"'()\\ \t\n\r\f])*)\)$/;
// cssstyle 4.4 to 4.6 (black box, #163: jsdom 23.2, 24.1 and 26.1 alike) and
// a url() component BG_URL_4_4 rejects only for an escaped ', (, ), space,
// tab, line feed, carriage return or form feed, or a carriage return or form
// feed (#144): the first time the process meets that url(), in the
// background shorthand, it is an image that sets nothing. The shorthand's
// other components apply, the background image the declaration had stays
// and the other longhands are removed (url("a\'b.png") alone declares
// nothing; red url("a\'b.png") is background: red). Later the url() is
// invalid (cssstyle caches it), unless it has a carriage return or form
// feed, escaped or not: those are never cached. In background-image (from
// cssstyle 4.3.1, meetImage) it is the url() with its escapes read the first
// time, later invalid. Not modeled: cssstyle's cache evicting it (about 800
// other url()s later), several layers.
const BG_URL_ESCAPED =
  /^url\(\s*(?!\s)(?:"(?:\\(?:[^\s]|[ \t\n\r\f])|[^"'()\\ \t\n])*"|'(?:\\(?:[^\s]|[ \t\n\r\f])|[^"'()\\ \t\n])*'|(?:\\(?:[^\s]|[ \t\n\r\f])|[^"'()\\ \t\n])*)\)$/;
const BG_PLACEHOLDER = 'url(#)';
const metUrls = new Set(); // url() components cssstyle has met (per process, as its cache)
const escapedUrl = (token) => token.startsWith('url(') && !BG_URL_4_4.test(token) && BG_URL_ESCAPED.test(token);
// Records a url() met; true if it was met before (and is cached).
function meetUrl(token) {
  if (/[\r\f]/.test(token)) return false;
  if (metUrls.has(token)) return true;
  if (metUrls.size >= 500) metUrls.clear();
  metUrls.add(token);
  return false;
}
// background-image set to a url() the shorthand would read as above, with
// cssstyle 4.3.1 to 4.6 (black box, #144): the first time it is the url()
// with its escapes read (url("a b.png")), later invalid (true: cached),
// unless it has a carriage return or form feed.
function meetImage(name, value, mode) {
  return name === 'background-image' && mode === 'jsdom26' && escapedUrl(value) && meetUrl(value);
}
// The background declaration a value declaredValue rejected sets (decls:
// the block's declarations), or INVALID: '' when it declares nothing.
function escapedUrlBackground(decls, value, mode, surface) {
  if (mode !== 'jsdom26' || surface?.key !== 'cssstyle4.4' || !/[\\\r\f]/.test(value)) return INVALID;
  // Escape-aware: url(a\'b.png) no-repeat is a url() and no-repeat.
  if (splitOutside(value, ',', true).length > 1 || VAR_ENV_ATTR.test(value)) return INVALID;
  const urls = segments(value, BG_SEPARATOR_LEGACY, true).filter((t, i) => i % 2 === 0 && escapedUrl(t));
  if (urls.length === 0) return INVALID;
  let cached = false;
  for (const url of urls) cached = meetUrl(url) || cached;
  if (cached || urls.length > 1) return INVALID;
  const out = declaredValue('background', value.replace(urls[0], BG_PLACEHOLDER), mode, surface);
  if (out === INVALID) return INVALID;
  const placeholder = serializeDeclared('background-image', BG_PLACEHOLDER, mode);
  const rest = out.startsWith(placeholder) ? out.slice(placeholder.length).trim() : out;
  let image = decls.get('background-image')?.value;
  if (image === undefined) {
    const first = segments(decls.get('background')?.value ?? '', BG_SEPARATOR_LEGACY)[0];
    if (first.toLowerCase() === 'none' || first.startsWith('url(') || BG_GRADIENT.test(first)) image = first;
  }
  return [image, rest].filter(Boolean).join(' ');
}
const legacyLength = (token, surface, old) => {
  if (!old) return BG_LENGTH_4.test(token.toLowerCase());
  return surface?.legacyFont === 'cssstyle4.1' ? BG_LENGTH_3.test(token) : BG_LENGTH_4.test(token);
};
// Math functions in a background (backgroundValue), not counting those in
// url()s: MATH_OUTSIDE when one is outside the images jsdom 27 and later
// drop (droppedImage), MATH_IN_DROPPED when all are in their arguments
// (LINEAR-GRADIENT(red, blue calc(100% - 1px)) is dropped, its arguments
// checked by the grammar; black box, 27.4.0 to 30.1.3, #264), and
// MATH_IN_DROPPED_URL when the value also has a url(). 0 when none.
const MATH_FUNCTION = /(calc|min|max|clamp)\(/i;
const MATH_OUTSIDE = 1;
const MATH_IN_DROPPED = 2;
const MATH_IN_DROPPED_URL = 3;
function mathFunctions(value) {
  const text = value.replace(URL_FUNCTION, 'url()');
  if (!MATH_FUNCTION.test(text)) return 0;
  if (!UPPERCASE.test(text) && !LEGACY_PREFIX.test(text)) return MATH_OUTSIDE;
  const parts = segments(text, BG_SEPARATOR, true);
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (MATH_FUNCTION.test(token) && !droppedImage(token, token.toLowerCase())) return MATH_OUTSIDE;
  }
  return /url\(/i.test(text) ? MATH_IN_DROPPED_URL : MATH_IN_DROPPED;
}
function backgroundValue(value, mode, surface) {
  // var(), env() or attr() (a scan only when the text has var(), env( or
  // attr( in it), or a CSS-wide keyword.
  if (hasVarFunction(value) || ENV_ATTR.test(value) || CSS_WIDE_KEYWORD.test(value)) return undefined;
  const legacy = isLegacyMode(mode);
  // jsdom 27 and later: math functions (calc(10px + 5%) is calc(5% + 10px)
  // in jsdom 30, rejected before) are left to the general rules, except
  // in the arguments of an image dropped (mathFunctions), which jsdom 27 to
  // 29 reject beside a url() (url(a.png), LINEAR-GRADIENT(red, blue
  // calc(100% - 1px)); black box, 27.4.0 to 29.1.1).
  const math = legacy ? 0 : mathFunctions(value);
  if (math === MATH_OUTSIDE) return undefined;
  if (math === MATH_IN_DROPPED_URL && mode === 'jsdom27') return INVALID;
  // The grammar first, as for other properties in these modes (a legacy
  // gradient read as none: legacyGradientsValid).
  if (!legacy && !isValidValue('background', LEGACY_PREFIX.test(value) ? legacyGradientsValid(value) : value))
    return INVALID;
  const layers = splitOutside(value, ',');
  if (layers.length === 1) {
    const out = backgroundLayer(value, mode, surface, legacy);
    // jsdom 27 and later: nothing left once a dropped image is (INITIALS).
    if (out === IMAGE_DROPPED) return INITIALS;
    return out === '' ? undefined : out;
  }
  if (legacy) return INVALID;
  // jsdom 27 and later: each layer as it would be alone, a layer of
  // initial values empty (url(a.png), none is url("a.png"), ), the color
  // in the last (the grammar allows it only there). Other syntax in a
  // layer leaves the value to the general rules.
  let out = '';
  for (let i = 0; i < layers.length; i++) {
    const layer = backgroundLayer(layers[i], mode, surface, false);
    if (layer === undefined || layer === INVALID) return layer;
    out += `${i ? ', ' : ''}${layer === IMAGE_DROPPED ? '' : layer}`;
  }
  return out;
}
// One layer of the background shorthand (backgroundValue): its
// serialization, undefined for the general rules. In jsdom 27 and later
// '' when it has initial values only (none, repeat), IMAGE_DROPPED when
// it also has a dropped image (droppedImage).
function backgroundLayer(value, mode, surface, legacy) {
  const old = legacy && colorKeywords === 'css2'; // cssstyle before 4.4
  const tokens = [];
  const components = segments(value, legacy ? BG_SEPARATOR_LEGACY : BG_SEPARATOR, true).filter(
    (t, i) => i % 2 === 0 && t !== '',
  );
  for (const token of components) {
    if (token.includes('/') && !token.includes('(')) {
      token.split('/').forEach((part, i) => {
        if (i) tokens.push('/');
        if (part) tokens.push(part);
      });
    } else tokens.push(token);
  }
  const repeats = old ? BG_REPEATS : BG_REPEATS_4_4;
  const attachments = old ? BG_ATTACHMENTS : BG_ATTACHMENTS_4_4;
  const found = { image: null, position: null, size: null, repeat: null, attachment: null, boxes: null, color: null };
  // A component given again: the last wins before cssstyle 4.4, later the
  // value is rejected (jsdom 27 and later read two repeats as one value).
  const put = (key, token) => {
    if (found[key] !== null && !old) return false;
    found[key] = token;
    return true;
  };
  let dropped = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    const gradient = BG_GRADIENT.test(token) || (!legacy && LEGACY_PREFIX.test(token));
    if (lower === 'none' || token.startsWith('url(') || (!legacy && /^url\(/i.test(token)) || gradient) {
      // Gradients from cssstyle 4.3 (legacyMeasureRejects for 4.0 and 4.1).
      if (gradient && (mode === 'jsdom20' || mode === 'jsdom22')) return INVALID;
      if (!legacy && droppedImage(token, lower)) {
        if (!put('image', 'none')) return INVALID;
        dropped = true;
        continue;
      }
      // cssstyle rejects a malformed url() (url("a.png), url(a.png)junk) and
      // one with a parenthesis inside (url("a(b).png")).
      if (legacy && token.startsWith('url(') && !(old ? BG_URL_OLD : BG_URL_4_4).test(token)) return INVALID;
      if (!put('image', token)) return INVALID;
    } else if (repeats.has(lower)) {
      // (repeat-x and repeat-y take no second keyword.)
      if (
        !legacy &&
        found.repeat !== null &&
        !/^repeat-[xy]$/.test(lower) &&
        !/^repeat-[xy]$/i.test(found.repeat) &&
        !/ /.test(found.repeat)
      )
        found.repeat += ` ${token}`;
      else if (!put('repeat', token)) return INVALID;
    } else if (attachments.has(lower)) {
      if (!put('attachment', token)) return INVALID;
    } else if (BG_BOXES.has(lower) && !legacy) {
      if (found.boxes !== null && found.boxes.length === 2) return INVALID;
      (found.boxes ??= []).push(lower);
    } else if (BG_POSITIONS.has(lower) || BG_DIMENSION.test(token) || ZERO.test(token) || /^calc\(/i.test(token)) {
      if (old && !BG_POSITIONS.has(lower) && !BG_DIMENSION.test(token)) return INVALID;
      if (legacy && BG_DIMENSION.test(token) && !legacyLength(token, surface, old)) return INVALID;
      // cssstyle 4.4 to 4.6 read 0, +0, -0 and 0.0 as 0px, not 00.
      if (legacy && !old && ZERO.test(token) && !/^[+-]?(0(\.0*)?|\.0+)$/.test(token)) return INVALID;
      // jsdom 27 to 29: a unitless zero other than 0 sets the initial values.
      if (mode === 'jsdom27' && ZERO.test(token) && token !== '0') return undefined;
      if (old) found.position = token;
      else if (legacy) {
        if (!put('position', token)) return INVALID;
      } else {
        if (found.position !== null) return INVALID;
        let j = i;
        while (j < tokens.length && j - i < 4) {
          const t = tokens[j];
          if (!BG_POSITIONS.has(t.toLowerCase()) && !BG_DIMENSION.test(t) && !ZERO.test(t) && !/^calc\(/i.test(t))
            break;
          j++;
        }
        // Keywords lowercased, numbers canonical (10.0px is 10px, .5em 0.5em).
        found.position = tokens
          .slice(i, j)
          .map((t) => (BG_POSITIONS.has(t.toLowerCase()) ? t.toLowerCase() : canonicalNumbers(t.toLowerCase())));
        i = j - 1;
        if (tokens[j] === '/') {
          let k = j + 1;
          while (
            k < tokens.length &&
            k - j <= 2 &&
            (BG_DIMENSION.test(tokens[k]) || ZERO.test(tokens[k]) || BG_SIZES.test(tokens[k]))
          )
            k++;
          // One or two lengths or autos, or cover or contain alone.
          if (k === j + 1 || (k === j + 3 && tokens.slice(j + 1, k).some((t) => /^(cover|contain)$/i.test(t))))
            return INVALID;
          found.size = tokens
            .slice(j + 1, k)
            .map(sizeToken)
            .join(' ');
          i = k - 1;
        }
      }
    } else if (lower === 'currentcolor' || lower === 'transparent' || resolveColor(token) !== null) {
      if (!put('color', token)) return INVALID;
    } else if (legacy) return INVALID;
    // Other syntax (image-set(), url( unclosed) jsdom 27 and later read
    // their own way: left to the general rules.
    else return undefined;
  }
  let image = null;
  if (found.image !== null)
    image =
      legacy && found.image.startsWith('url(')
        ? legacyUrls('background', found.image, mode)
        : serializeDeclared('background-image', found.image, mode);
  const color = found.color === null ? null : serializeDeclared('background-color', found.color, mode);
  if (old) return [color, image, found.repeat, found.attachment, found.position].filter((p) => p !== null).join(' ');
  if (legacy) {
    const keyword = (t) => (t === null ? null : t.toLowerCase());
    // Numbers canonical (cssstyle 4.4: 10.0px is 10px, 1e1px 10px).
    let position = found.position === null ? null : canonicalNumbers(found.position.toLowerCase());
    if (position !== null && ZERO.test(position)) position = '0px';
    // cssstyle 4.4 and 4.5 keep none as written.
    const written = image !== null && image.toLowerCase() === 'none' && colorKeywords === null ? 'none' : image;
    return [written, position, keyword(found.repeat), keyword(found.attachment), color]
      .filter((p) => p !== null)
      .join(' ');
  }
  const parts = [];
  if (image !== null && image !== 'none') parts.push(image);
  let position = null;
  if (found.position !== null) {
    if (mode === 'jsdom27' && found.position.length > 1) {
      // Lost (jsdom 27 to 29); a size stays, behind the initial position in 29.
      if (found.size !== null) position = surface?.key?.startsWith('jsdom29') ? '0% 0%' : '';
    } else {
      const layers = positionLayers(found.position.join(' '));
      if (!layers) return INVALID;
      position = layers[0].map((t) => (ZERO.test(t) ? '0px' : t.replace(/ ([+-]?0+\.?0*|\.0+)$/, ' 0px'))).join(' ');
    }
  }
  if (position !== null) parts.push(found.size !== null ? `${position} / ${found.size}`.trim() : position);
  const repeat = found.repeat === null ? null : shortRepeat(found.repeat.toLowerCase());
  if (repeat !== null && repeat !== 'repeat') parts.push(repeat);
  if (found.attachment !== null && found.attachment.toLowerCase() !== 'scroll')
    parts.push(found.attachment.toLowerCase());
  if (found.boxes !== null) {
    if (found.boxes.length === 2 && mode === 'jsdom27' && !surface?.key?.startsWith('jsdom29')) return INVALID;
    parts.push(...found.boxes);
  }
  if (color !== null && color !== 'transparent') parts.push(color);
  if (parts.length) return parts.join(' ');
  return dropped ? IMAGE_DROPPED : '';
}

// Images jsdom 27 and later read in background (its grammar takes them,
// case-insensitively) and then leave out, as none (black box, 27.4.0 to
// 30.1.3, #264): a gradient whose name is not in lowercase
// (LINEAR-GRADIENT(), Linear-Gradient()), a legacy one (-webkit-, -moz- and
// -o- linear and radial gradients, -webkit-gradient()) and none not in
// lowercase. background-image rejects them (versionedValue).
const LEGACY_PREFIX = /-(?:webkit|moz|o)-(?:(?:repeating-)?(?:linear|radial)-)?gradient\(/i;
const GRADIENT_FUNCTION = /^(?:-(?:webkit|moz|o)-)?(?:(?:repeating-)?(?:linear|radial|conic)-)?gradient\(/i;
function droppedImage(token, lower) {
  if (lower === 'none') return token !== 'none';
  if (!GRADIENT_FUNCTION.test(token)) return false;
  const name = token.slice(0, token.indexOf('('));
  return name.charCodeAt(0) === 45 || name !== name.toLowerCase();
}
// The value with each legacy gradient as none, for the grammar, which has
// no legacy gradients: a linear one's arguments are checked as
// linear-gradient()'s, a side or corner taken without to (top is to top);
// radial ones and -webkit-gradient() are not checked. 'bogus', which the
// grammar rejects, when one is not valid.
const LEGACY_LINEAR = /^-(?:webkit|moz|o)-(?:repeating-)?linear-gradient\(([^]*)\)$/i;
const LEGACY_SIDE = /^\s*((?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?)\s*,/i;
function legacyGradientsValid(value) {
  const parts = segments(value, BG_SEPARATOR, true);
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (!LEGACY_PREFIX.test(token) || !GRADIENT_FUNCTION.test(token) || token.charCodeAt(0) !== 45) continue;
    const linear = LEGACY_LINEAR.exec(token);
    if (linear && !isValidValue('background-image', `linear-gradient(${linear[1].replace(LEGACY_SIDE, 'to $1,')})`))
      return 'bogus';
    if (!linear && !/^-(?:webkit|moz|o)-(?:repeating-)?radial-gradient\(|^-webkit-gradient\(/i.test(token))
      return 'bogus';
    parts[i] = 'none';
  }
  return parts.join('');
}

// clip as jsdom's versions read it (black box, 20.0.3 to 30.1.3, #264):
// auto in any case (written auto), or rect() of four components, each a
// length or auto:
// - jsdom 20 to 25: separated by commas (one may be empty, kept so); a
//   length is 0 (0px), or a number (no exponent) and one of the units
//   cssstyle 2 to 4.1 know, kept as written but for the unit in lowercase;
//   a percentage or a calc() is kept as written; auto and var() are
//   invalid;
// - jsdom 26: the same with every length unit, numbers in their shortest
//   form (1.50px is 1.5px, 1e1px 10px, .5px 0.5px), a unitless zero 0px (but
//   00); var() is kept as written with commas;
// - jsdom 27 and later: separated by commas or spaces, a component a length
//   (any zero, a calc()) or auto by the grammar, then those written read
//   again: all four with commas, only the first with spaces (rect(1px 2px
//   3px 4px) is rect(1px)): auto, a length with its number in its shortest
//   form and its unit in lowercase, 0 is 0px, another unitless zero (00,
//   0.0, -0) is invalid until jsdom 30 (0px), a calc() is invalid; rect is
//   written as given (RECT(0 0 0 0) is RECT(0px)). var() is kept as
//   written (the grammar's reading).
// cascade.js computes a rect() of one component (jsdom 27 to 30.1.2).
const CLIP_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z]+|%)$/i;
const CLIP_LEGACY_LENGTH = /^[+-]?(\d+\.?\d*|\.\d+)(px|em|ex|ch|rem|vh|vw|cm|mm|in|pt|pc)$/i;
const CLIP_26_ZERO = /^[+-]?(0(\.0*)?|\.0+)$/;
// A unitless zero, with an exponent or not (0e0 is a zero in jsdom 26 and
// later; black box, #274 review).
const CLIP_EXPONENT = /^([+-]?(?:\d+\.?\d*|\.\d+))e[+-]?\d+$/i;
const clipZero = (arg, zero) => zero.test(CLIP_EXPONENT.exec(arg)?.[1] ?? arg);
function clipValue(value, mode) {
  if (/^auto$/i.test(value)) return 'auto';
  if (!/^rect\(/i.test(value)) return undefined;
  const legacy = isLegacyMode(mode);
  const inner = value.slice(5, -1);
  // (commas outside parentheses: rect(0 min(1px, 2px) 0 0) has spaces)
  const parts = inner.includes(',') ? splitOutside(inner, ',') : null;
  const commas = parts !== null && parts.length > 1;
  if (hasVarFunction(value)) {
    if (!legacy) return undefined;
    return mode === 'jsdom26' && commas && oneFunction(value) ? value : INVALID;
  }
  if (!oneFunction(value)) return INVALID;
  const args = commas ? parts.map((a) => a.trim()) : topLevelWords(inner);
  if (args.length !== 4) return INVALID;
  if (legacy && !commas) return INVALID;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const arg = args[i];
    // (jsdom 20 to 26 keep an empty component: rect(1px, 2px, 3px, ).)
    if (arg === '' ? !legacy : commas && topLevelWords(arg).length !== 1) return INVALID;
    if (arg === '') {
      out.push('');
      continue;
    }
    const written = !commas && i > 0 ? clipGrammar(arg, mode) && arg : clipComponent(arg, mode);
    if (written === INVALID || written === false) return INVALID;
    out.push(written);
  }
  if (legacy) return `rect(${out.join(', ')})`;
  const name = value.slice(0, 4);
  return commas ? `${name}(${out.join(', ')})` : `${name}(${out[0]})`;
}
// A component as the grammar reads it (jsdom 27 and later): a length, any
// unitless zero, auto, or a math function in any case (calc, min, abs,
// ...), whose insides it leaves unchecked but for a var( not in lowercase
// (calc(VAR(--a) + 1px), as css-values.js reads math) and, from jsdom 30,
// a percentage (calc(1px + 2%); black box, 27.4.0 to 30.1.3, #274 review).
// The function is the whole component (calc(1px)junk is invalid); strings
// in it are not read (calc("VAR(") and calc("%") are valid), and its
// brackets outside them must pair up (calc([) is invalid), with no curly
// brace (calc({1px}) is invalid; jsdom 27 to 30.1.2 throw for both).
const CLIP_FUNCTION_NAMES = /([\w-]+)\(/g;
const CLIP_STRINGS = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'/g;
function clipGrammar(arg, mode) {
  if (/^auto$/i.test(arg) || clipZero(arg, ZERO)) return true;
  const open = arg.indexOf('(');
  if (open > 0) {
    if (!oneFunction(arg) || !isMathFunction(arg.slice(0, open).toLowerCase())) return false;
    const code = arg.includes('"') || arg.includes("'") ? arg.replace(CLIP_STRINGS, '""') : arg;
    if (!balancedBrackets(code) || (mode === 'spec' && code.includes('%'))) return false;
    for (const [, name] of code.matchAll(CLIP_FUNCTION_NAMES))
      if (name !== 'var' && name.toLowerCase() === 'var') return false;
    return true;
  }
  const m = CLIP_NUMBER.exec(arg);
  return m !== null && isLengthUnit(m[3].toLowerCase());
}
function balancedBrackets(text) {
  const open = [];
  for (const c of text)
    if (c === '(') open.push(')');
    else if (c === '[') open.push(']');
    else if (c === '{' || c === '}' || ((c === ')' || c === ']') && open.pop() !== c)) return false;
  return open.length === 0;
}
// A component as written in the declared value, or INVALID.
function clipComponent(arg, mode) {
  if (mode === 'jsdom20' || mode === 'jsdom22' || mode === 'jsdom25') {
    if (arg === '0') return '0px';
    if (/^calc\(.*\)$/i.test(arg) || /^[+-]?(\d+\.?\d*|\.\d+)%$/.test(arg)) return arg;
    return CLIP_LEGACY_LENGTH.test(arg) ? arg.replace(/[a-z]+$/i, (u) => u.toLowerCase()) : INVALID;
  }
  if (mode === 'jsdom26') {
    if (clipZero(arg, CLIP_26_ZERO)) return '0px';
    if (/^calc\(.*\)$/i.test(arg)) return arg;
    const m = CLIP_NUMBER.exec(arg);
    if (m === null || (m[3] !== '%' && !isLengthUnit(m[3].toLowerCase()))) return INVALID;
    return canonicalNumbers(arg.toLowerCase());
  }
  if (/^auto$/i.test(arg)) return 'auto';
  if (arg === '0') return '0px';
  if (clipZero(arg, ZERO)) return mode === 'spec' ? '0px' : INVALID;
  const m = CLIP_NUMBER.exec(arg);
  if (m === null || !isLengthUnit(m[3].toLowerCase())) return INVALID;
  return canonicalNumbers(arg.toLowerCase());
}
// Whitespace-separated words outside parentheses and strings.
function topLevelWords(text) {
  const words = [];
  let depth = 0,
    start = -1;
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : 32;
    if (c === 34 || c === 39) {
      if (start === -1) start = i;
      i++;
      while (i < text.length && text.charCodeAt(i) !== c) i += text.charCodeAt(i) === 92 ? 2 : 1;
      continue;
    }
    if (c === 40) depth++;
    else if (c === 41) depth--;
    const space = depth === 0 && (c === 32 || c === 9 || c === 10 || c === 13 || c === 12);
    if (space) {
      if (start !== -1) words.push(text.slice(start, i));
      start = -1;
    } else if (start === -1) start = i;
  }
  return words;
}

// @page descriptors (CSS Paged Media 3, CSSOM's CSSPageDescriptors): the
// margins as the margin properties, size, page-orientation, marks, bleed.
const PAGE_DESCRIPTORS = [
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'size',
  'page-orientation',
  'marks',
  'bleed',
];
const PAGE_SIZES = new Set(['a5', 'a4', 'a3', 'b5', 'b4', 'jis-b5', 'jis-b4', 'letter', 'legal', 'ledger']);
const LENGTH =
  /^(0|\+?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(px|cm|mm|q|in|pt|pc|em|rem|ex|rex|cap|rcap|ch|rch|ic|ric|lh|rlh|vw|vh|vi|vb|vmin|vmax))$/i;
function pageDescriptorValue(name, value) {
  if (name.startsWith('margin')) return isValidValue(name, value) ? serializeDeclared(name, value, 'spec') : INVALID;
  const words = value.toLowerCase().split(/\s+/);
  const one = words.length === 1 ? words[0] : null;
  let valid = false;
  if (name === 'page-orientation') valid = one === 'upright' || one === 'rotate-left' || one === 'rotate-right';
  else if (name === 'bleed') valid = one === 'auto' || (one !== null && LENGTH.test(one));
  else if (name === 'marks')
    valid =
      one === 'none' ||
      (words.length <= 2 && new Set(words).size === words.length && words.every((w) => w === 'crop' || w === 'cross'));
  else if (name === 'size') {
    if (one === 'auto') valid = true;
    else if (words.length <= 2 && words.every((w) => LENGTH.test(w))) valid = true;
    else if (words.length <= 2) {
      const sizes = words.filter((w) => PAGE_SIZES.has(w)).length;
      const orientations = words.filter((w) => w === 'portrait' || w === 'landscape').length;
      valid = sizes <= 1 && orientations <= 1 && sizes + orientations === words.length;
    }
  }
  return valid ? words.join(' ') : INVALID;
}

// display's multi-keyword values serialize in their short form (CSS
// Display 3, 2): inline flex is inline-flex, inline flow-root is
// inline-block. jsdom 26 kept them as written.
const OUTER = new Set(['block', 'inline', 'run-in']);
const INNER = new Set(['flow', 'flow-root', 'table', 'flex', 'grid', 'ruby']);
const SHORT = {
  'block flow': 'block',
  'inline flow': 'inline',
  'run-in flow': 'run-in',
  'block flow-root': 'flow-root',
  'inline flow-root': 'inline-block',
  'block flex': 'flex',
  'inline flex': 'inline-flex',
  'block grid': 'grid',
  'inline grid': 'inline-grid',
  'block table': 'table',
  'inline table': 'inline-table',
  'inline ruby': 'ruby',
};
function displayShortForm(value) {
  const keywords = value.toLowerCase().split(/\s+/);
  // A legacy keyword (-webkit-box) in lowercase (jsdom 27 and later, #257);
  // the standard ones keep their case.
  if (keywords.length < 2) return value.charCodeAt(0) === 45 ? keywords[0] : value;
  let outer = null,
    inner = null,
    listItem = false;
  for (const k of keywords) {
    if (OUTER.has(k) && outer === null) outer = k;
    else if (INNER.has(k) && inner === null) inner = k;
    else if (k === 'list-item' && !listItem) listItem = true;
    else return value;
  }
  inner ??= 'flow';
  outer ??= inner === 'ruby' ? 'inline' : 'block';
  if (listItem)
    return [outer === 'block' ? null : outer, inner === 'flow' ? null : inner, 'list-item'].filter(Boolean).join(' ');
  return SHORT[`${outer} ${inner}`] ?? `${outer} ${inner}`;
}

// flex serializes as its three longhands (flex: 1 is 1 1 0%, auto is
// 1 1 auto): omitted grow and shrink are 1, an omitted basis 0%.
function flexLonghands(value) {
  const lower = value.toLowerCase();
  if (lower === 'none') return '0 0 auto';
  if (lower === 'auto') return '1 1 auto';
  const parts = segments(value).filter((part, i) => i % 2 === 0 && part !== '');
  if (parts.length === 1 && /^(initial|inherit|unset|revert|revert-layer)$/i.test(parts[0])) return value;
  if (VAR_ENV_ATTR.test(value)) return value;
  const numbers = [];
  let basis = null;
  for (const part of parts) {
    if (
      /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(part) &&
      numbers.length < 2 &&
      (basis === null || numbers.length > 0)
    )
      numbers.push(String(Number(part)));
    else basis = ZERO.test(part) ? '0px' : part;
  }
  return `${numbers[0] ?? '1'} ${numbers[1] ?? '1'} ${basis ?? '0%'}`;
}

function shortRepeat(value) {
  return value
    .split(',')
    .map((layer) => {
      const parts = layer.trim().split(/\s+/);
      if (parts.length !== 2) return layer.trim();
      const [x, y] = parts.map((p) => p.toLowerCase());
      if (x === y) return parts[0];
      if (x === 'repeat' && y === 'no-repeat') return 'repeat-x';
      if (x === 'no-repeat' && y === 'repeat') return 'repeat-y';
      return parts.join(' ');
    })
    .join(', ');
}

const CSS_WIDE_KEYWORD = /^(initial|inherit|unset|revert|revert-layer)$/i;
// var() in lowercase only: jsdom reads VAR( as another function (black
// box, jsdom 20 to 30, #234); env() and attr() in any case.
const ENV_ATTR = /env\(|attr\(/i;
const VAR_ENV_ATTR = /var\(|[eE][nN][vV]\(|[aA][tT][tT][rR]\(/;
const KEEPS_NUMBERS_AS_WRITTEN = { jsdom25: true, jsdom22: true, jsdom20: true };
const CANONICAL_NUMBERS_PRE_431 = new Set(['opacity', 'flex-grow', 'flex-shrink']);
function serializeDeclared(name, value, mode) {
  // Custom properties keep their value as written (CSS Variables 1), as in jsdom.
  if (name.startsWith('--')) return value;
  // CSS-wide keywords are ASCII case-insensitive and serialize lowercased.
  if (value.length <= 12 && CSS_WIDE_KEYWORD.test(value)) return value.toLowerCase();
  if (isLegacyMode(mode) && !JSDOM26_PARSED.has(name)) return value;
  if (mode === 'jsdom26' && value.startsWith('calc(') && isLengthProperty(name) && !BORDER_WIDTHS.has(name))
    value = simplifyCalc(value);
  if (name === 'display' && isSpecMode(mode)) return displayShortForm(value);
  if (name === 'flex') return flexLonghands(canonicalNumbers(value));
  if (name === 'font') return familyCommas(serializeFont(canonicalNumbers(value)));
  if (name === 'font-family') return familyCommas(value);
  // cssstyle before 4.3.1 (jsdom 20 to 25) keeps lengths, percentages and
  // line-height as written (.83em, 10.0px, 1.50); its number properties
  // (opacity, flex-grow, flex-shrink) it serializes canonically.
  if (!KEEPS_NUMBERS_AS_WRITTEN[mode] || CANONICAL_NUMBERS_PRE_431.has(name)) value = canonicalNumbers(value);
  // background-position as its x and y parts per layer (jsdom 27 and
  // later): center is center center, top is center top.
  if (name === 'background-position' && isSpecMode(mode)) {
    const layers = positionLayers(value);
    if (layers) value = layers.map(([x, y]) => `${x} ${y}`).join(', ');
  }
  // background-repeat in its shortest form (CSS Backgrounds 3), as in jsdom
  // 27 and later: repeat repeat is repeat, repeat no-repeat is repeat-x.
  if (name === 'background-repeat' && isSpecMode(mode)) value = shortRepeat(value);
  if (isColorProperty(name)) value = declaredColors(value);
  // jsdom 26 with cssstyle 4.3.1 and later writes each run of whitespace
  // in background and background-image as one space (black box: a
  // gradient written over several lines), but in a value with var(),
  // which it keeps as written.
  if (
    mode === 'jsdom26' &&
    (name === 'background' || name === 'background-image') &&
    /\s\s|[\t\n\r\f]/.test(value) &&
    !value.includes('var(')
  )
    value = collapseSpaces(value);
  if (value.includes('(')) {
    // Gradients: in background and background-image from jsdom 27, and
    // from 28.1 (urlStyle not 'written') a value that is one gradient
    // (mask-image: url(a.png), linear-gradient(to bottom, red, blue) is
    // kept as written); never in a value with var() (black box, #264).
    if (isSpecMode(mode) && name !== 'border-image' && /(min|max|clamp|gradient)\(/i.test(value))
      value = functionArguments(
        value,
        (name === 'background' || name === 'background-image' || (urlStyle !== 'written' && oneFunction(value))) &&
          !hasVarFunction(value),
      );
    // jsdom 27 and later serialize the url()s in background and
    // background-image, and from 28 a value that is one url() (fill:
    // url(#a)) but in cursor; others keep them as written (fill: url(#a)
    // none, mask-image: url(a.png), url(b.png)), and so does a value with
    // var() (black box, #144).
    if (isSpecMode(mode)) {
      const image = name === 'background' || name === 'background-image';
      if (
        (image ||
          (urlStyle !== 'written' &&
            name !== 'cursor' &&
            /^url\(/i.test(value) &&
            readUrl(value, 4)?.end === value.length)) &&
        /url\(/i.test(value) &&
        !hasVarFunction(value)
      )
        value = serializeUrls(value, urlStyle === 'spec' ? 'spec' : 'quotes', image);
    } else if (LEGACY_URL_NAMES.has(name) && !value.includes('var(')) value = legacyUrls(name, value, mode);
    // A value with var() keeps its commas as written (black box: jsdom 23
    // to 30 write var(--a),url(a.png) and red,  var(--a); #234).
    return (name === 'background' || name === 'background-image') && !hasVarFunction(value)
      ? familyCommas(value)
      : value;
  }
  const box = BOX_SHORTHANDS.has(name);
  if (!box && !value.includes('0')) return value;
  const tokens = value.split(/\s+/);
  if (tokens.length === 1) {
    if (!ZERO.test(value)) return value;
    // jsdom 28.1 and later: vertical-align: 0 is 0px too.
    if (zeroAsWritten) return ZERO_PARSED_5.has(name) ? '0px' : value;
    return isLengthProperty(name) || (name === 'vertical-align' && isSpecMode(mode)) ? '0px' : value;
  }
  if (!ZERO_LISTS.has(name)) return value;
  for (let i = 0; i < tokens.length; i++) if (ZERO.test(tokens[i])) tokens[i] = '0px';
  // As written with every cssstyle (jsdom 20 to 26; black box): margin,
  // padding and border-width (2px 6px 3px 6px); from cssstyle 4.4 the
  // margin and padding accessors read the shortest form (composedValue).
  if (box && tokens.length <= 4 && !isLegacyMode(mode)) {
    const [top, right = top, bottom = top, left = right] = tokens;
    if (left !== right) return `${top} ${right} ${bottom} ${left}`;
    if (bottom !== top) return `${top} ${right} ${bottom}`;
    return right !== top ? `${top} ${right}` : top;
  }
  return tokens.join(' ');
}

// A declaration that loses its !important (compat.varDropsImportant and
// customDropsImportant): in a rule's declarations (inRule: parsed with its
// style sheet, or set through its style), or else in a style attribute,
// an element's cssText or setProperty.
// var() outside strings (font-family: "var(--face)" is not), but in
// jsdom 27 (varInStrings, black box 27.4.0: content: "var(--x)"
// !important loses it; font-family and background ones keep it there,
// which is not modeled).
function dropsImportant(surface, name, value, inRule) {
  if (surface === null) return false;
  if (name.startsWith('--')) return !inRule && surface.customDropsImportant === true;
  const most = surface.mostDropImportant;
  if ((most === 'all' || (most === 'declarations' && !inRule)) && !KEEPS_IMPORTANT.has(name)) return true;
  const drops = surface.varDropsImportant;
  return (
    (drops === 'all' || (drops === 'declarations' && !inRule)) &&
    (surface.varInStrings ? value.includes('var(') : hasVar(value))
  );
}
// The properties that keep their !important in jsdom 27.0.0 to 28.0.0
// (compat.mostDropImportant; black box, every property).
const KEEPS_IMPORTANT = new Set([
  'background',
  'background-attachment',
  'background-clip',
  'background-color',
  'background-image',
  'background-origin',
  'background-position',
  'background-repeat',
  'background-size',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-width',
  'border-collapse',
  'border-color',
  'border-left',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-right',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-spacing',
  'border-style',
  'border-top',
  'border-top-color',
  'border-top-style',
  'border-top-width',
  'border-width',
  'bottom',
  'clear',
  'clip',
  'color',
  'display',
  'flex',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
  'float',
  'flood-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'height',
  'left',
  'lighting-color',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'opacity',
  'outline-color',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'right',
  'stop-color',
  'top',
  'width',
  '-webkit-border-after-color',
  '-webkit-border-before-color',
  '-webkit-border-end-color',
  '-webkit-border-start-color',
  '-webkit-column-rule-color',
  '-webkit-tap-highlight-color',
  '-webkit-text-emphasis-color',
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
]);
// var( outside quoted strings; inside a comment it counts (jsdom 27 and
// later keep color: red /*var(*/ as written), and a quote there opens no
// string (#259).
function hasVar(value) {
  if (!value.includes('var(')) return false;
  if (!value.includes('"') && !value.includes("'")) return true;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\') i++;
    else if (c === '/' && value[i + 1] === '*') {
      const end = commentEnd(value, i);
      const at = value.indexOf('var(', i);
      if (at !== -1 && at < end) return true;
      i = end - 1;
    } else if (c === '"' || c === "'") i = stringEnd(value, i, false) - 1;
    else if (c === 'v' && value.startsWith('var(', i)) return true;
  }
  return false;
}
// Scanners of declaration text, as CSS Syntax tokenizes it (#259): the end
// of the comment that opens at text[i], after its */ (the text's end when
// it is not closed), and of the string that opens there, after its
// closing quote, or ~ the index of a line break that ends it first, a bad
// string (lineBreaks: jsdom 27 and later's reading).
function commentEnd(text, i) {
  const close = text.indexOf('*/', i + 2);
  return close < 0 ? text.length : close + 2;
}
function stringEnd(text, i, lineBreaks) {
  const quote = text[i];
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === quote) return j + 1;
    else if (lineBreaks && (c === '\n' || c === '\r' || c === '\f')) return ~j;
  }
  return text.length;
}
// The comments of a name (jsdom 27 and 28's style sheets remove them),
// not an escaped /* (--a\/*x*/b).
function withoutNameComments(name) {
  let out = '';
  let from = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '\\') i++;
    else if (name[i] === '/' && name[i + 1] === '*') {
      out += name.slice(from, i);
      from = commentEnd(name, i);
      i = from - 1;
    }
  }
  return out + name.slice(from);
}
// Where a value's trailing !important starts, with the whitespace before
// it (as /\s*!\s*important\s*$/i finds it), or -1. Read from the end, in
// linear time: the regular expression took quadratic time on a long run of
// whitespace (5,000 spaces 15 ms, 20,000 spaces 191 ms; #224).
const IMPORTANT = /^important$/i;
const SPACE = /\s/;
const isSpace = (c) => c === 32 || (c >= 9 && c <= 13) || (c > 127 && SPACE.test(String.fromCharCode(c)));
function priorityStart(value) {
  let i = value.length;
  while (i > 0 && isSpace(value.charCodeAt(i - 1))) i--;
  // (most values end in another letter than t)
  if (i < 10 || (value.charCodeAt(i - 1) | 32) !== 116 || !IMPORTANT.test(value.slice(i - 9, i))) return -1;
  i -= 9;
  while (i > 0 && isSpace(value.charCodeAt(i - 1))) i--;
  if (value.charCodeAt(i - 1) !== 33) return -1;
  i--;
  while (i > 0 && isSpace(value.charCodeAt(i - 1))) i--;
  return i;
}
// A priority token left over outside quotes, functions and [] {} blocks,
// not escaped (color: var(--c)
// !important !important, var(--c) !, var(--c) !important !foo): jsdom 27
// and later drop the declaration from a style attribute and from cssText
// (black box, 27.4.0 to 30.1.3); var(--c) !foo alone is not modeled.
function strayPriority(value, important) {
  const parts = splitOutside(value, '!', true);
  if (parts.length === 1) return false;
  if (important) return true;
  for (let i = 1; i < parts.length; i++) if (/^\s*(important\b|$)/i.test(parts[i])) return true;
  return false;
}
const BORDER_AND_SIDES = new Set(['border', 'border-top', 'border-right', 'border-bottom', 'border-left']);

// context: 'sheet' for a rule's declarations parsed with its style sheet,
// 'rule' for its style's cssText, 'written' for a style attribute a style
// write serialized (writtenDeclarations), else null (a style attribute, an
// element's cssText).
// element: an element's style object parses it (escapedUrlBackground meets
// its url()s).
// parseInto: a declaration name with whitespace or a comment inside it
// (--f o o, --a/**/b).
const SPACED_NAME = /[ \t\n\r\f]|\/\*/;
// The name such a declaration declares, or null when it is invalid (black
// box 20.0.3 to 30.1.3, #259): jsdom 20 to 26 (cssom's parser) remove the
// whitespace and the comments (col or is color, --a\ b is --a\b); from
// 27 the declaration is invalid, as CSS Syntax makes it (an escaped space,
// --a\ b, is part of the name), except in a style sheet in jsdom 27 and
// 28 (@acemir/cssom), which removes the comments and keeps the whitespace
// (--f o o; col or is no property). Escapes are read whole: a whitespace
// character after a hexadecimal one ends it (--\61 b is valid, its name
// kept as written), and two backslashes escape each other (--a\\ b is
// not).
const COMMENTS = /\/\*[\s\S]*?(\*\/|$)/g;
const CSS_SPACES = /[ \t\n\r\f]+/g;
function spacedDeclarationName(rawName, runsOn, sheet, surface) {
  if (runsOn) return propertyName(rawName.replace(COMMENTS, '').replace(CSS_SPACES, ''));
  if (sheet && surface?.key?.startsWith('cssstyle')) return propertyName(withoutNameComments(rawName));
  return separatedName(rawName) ? null : propertyName(rawName);
}
// Whitespace or a comment in a name outside its escapes (CSS Syntax 4.3.7;
// a backslash before a line break escapes nothing).
function separatedName(name) {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === 92) {
      const escaped = name.charCodeAt(i + 1);
      if (escaped === 10 || escaped === 13 || escaped === 12) return true;
      if (!isHexDigit(escaped)) {
        i++;
        continue;
      }
      let end = i + 2;
      while (end < i + 7 && isHexDigit(name.charCodeAt(end))) end++;
      const next = name.charCodeAt(end);
      if (next === 13 && name.charCodeAt(end + 1) === 10) end++;
      else if (next !== 32 && next !== 9 && next !== 10 && next !== 13 && next !== 12) end--;
      i = end;
    } else if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) return true;
    else if (c === 47 && name.charCodeAt(i + 1) === 42) return true;
  }
  return false;
}
function isHexDigit(c) {
  return (c >= 48 && c <= 57) || ((c | 32) >= 97 && (c | 32) <= 102);
}

// The declarations of a text with a comment in it (/*, #259): a colon or
// a semicolon in a comment separates nothing. policy, black box 20.0.3 to
// 30.1.3: 'remove' drops every comment outside strings (jsdom 20 to 26's
// style attribute and cssText; jsdom 27 and 28's style sheets, which also
// drop a declaration whose comment is not closed), 'space' makes each one
// a space outside unquoted url()s (jsdom 29 and later's style sheets),
// 'inline' too but keeps a custom property's value as written (jsdom 27
// and later's style attribute and cssText). With either, a value with
// var() is kept as written after its leading comments (var( inside a
// comment counts, inside a string as surface.varInStrings says). A comment
// inside a name leaves a space there, which makes the declaration invalid
// from 27 (spacedDeclarationName); one before or after it does not.
function commentedDeclarations(text, policy, lineBreaks, unclosedDrops, surface, escapes) {
  const parts = [];
  let spaced = '';
  let from = 0;
  let depth = 0;
  let colon = -1;
  let head = 0;
  let custom = false;
  const end = (i) => {
    let part = spaced + text.slice(from, i);
    if (policy !== 'remove' && colon !== -1) {
      const raw = text.slice(colon + 1, i);
      if (custom ? policy === 'inline' : keepsComments(raw, surface)) {
        part = part.slice(0, head) + (custom ? raw : raw.replace(LEADING_COMMENTS, ''));
      }
    }
    parts.push(part);
    spaced = '';
    from = i + 1;
    colon = -1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && escapes) i++;
    else if (c === '/' && text[i + 1] === '*') {
      if (unclosedDrops && text.indexOf('*/', i + 2) < 0) return parts;
      const stop = commentEnd(text, i);
      spaced += text.slice(from, i) + (policy === 'remove' ? '' : ' ');
      from = stop;
      i = stop - 1;
    } else if (c === '"' || c === "'") {
      const end = stringEnd(text, i, lineBreaks);
      i = (end < 0 ? ~end : end) - 1;
    } else if (c === '(') {
      const close = policy === 'remove' ? -1 : urlTokenEnd(text, i);
      if (close === -1) depth++;
      else i = close - 1;
    } else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ':' && colon === -1) {
      colon = i;
      const name = spaced + text.slice(from, i + 1);
      head = name.length;
      custom = name.trimStart().startsWith('--');
    } else if (c === ';' && depth === 0) end(i);
  }
  end(text.length);
  return parts;
}
function keepsComments(value, surface) {
  return surface?.varInStrings ? value.includes('var(') : hasVar(value);
}
const LEADING_COMMENTS = /^(\s|\/\*[\s\S]*?(\*\/|$))*/;
// parseInto's declarations of a text with a comment in it. Style sheets
// before jsdom 27.1 (cssom, replay) and rules before 27 read comments in
// cssom.
function commentedParts(source, runsOn, lineBreaks, context, surface) {
  const sheet = context === 'sheet';
  if (context === 'cssom' || context === 'replay' || (runsOn && (sheet || context === 'rule')))
    return lineBreaks ? splitDeclarations(source) : splitOutside(source, ';');
  if (runsOn) return commentedDeclarations(source, 'remove', lineBreaks, false, surface, false);
  if (sheet && surface?.key?.startsWith('cssstyle'))
    return commentedDeclarations(source, 'remove', lineBreaks, true, surface, true);
  return commentedDeclarations(source, sheet ? 'space' : 'inline', lineBreaks, false, surface, true);
}

function parseInto(decls, text, mode, surface = null, context = null, element = false) {
  // 'replay': declarations given to a rule's (replayDeclarations).
  // 'cssom': a style rule's in a sheet before jsdom 27.1.0, which tells
  // whether it kept every declaration it read (parsedPlain).
  const replay = context === 'replay';
  const counting = context === 'cssom';
  const sheet = replay || counting || context === 'sheet';
  const inRule = sheet || context === 'rule';
  if (!replay) decls.clear();
  // From jsdom 27 (a rule's cssText from 27.1.0) the first !important
  // declaration of a property wins: a later one, !important or not, is
  // dropped (color: red !important; color: blue !important is red; black
  // box 27.0.0 to 30.1.3; firsts), and so is a normal one of a longhand of
  // an !important shorthand (covered). jsdom keys it by the name as first
  // written and, before 28.1.0, looks a later one up as written too
  // (compat.importantByWrittenName): color: red !important; COLOR: blue is
  // blue there, red from 28.1.0; COLOR: red !important; color: blue is
  // blue in both. An !important longhand after an !important shorthand is
  // kept: it is how warpdom writes setProperty('padding', '8px',
  // 'important') then setProperty('padding-bottom', '7px', 'important'),
  // which jsdom keeps (its longhands model, #104). jsdom 26 lets the last
  // one win, and so do a style sheet's rules, but for a normal shorthand
  // after an !important one (margin: 1px !important; margin: 2px is 1px
  // from 27.1.0). Text a style write serialized ('written') holds the
  // style's own declarations: a shorthand in it twice (padding: 8px
  // !important, then its four longhands set to 7px !important, written
  // padding: 8px !important; padding: 7px !important) is the last one, as
  // the style holds it (#266 review). An @page rule's descriptors follow
  // the window's jsdom (#266 review): decls.pageLastWins before 27.1.0,
  // where the last one wins there too, and decls.pageWrittenKeys for the
  // lookup by the name as written.
  const lastWins = isLegacyMode(mode) || decls.pageLastWins === true;
  const firstImportantWins = !lastWins && !sheet && context !== 'written';
  const sheetShorthands = !lastWins && sheet && !replay;
  const writtenKeys = surface?.importantByWrittenName === true || decls.pageWrittenKeys === true;
  let covered = null;
  let firsts = null;
  const borderVarDrops = !sheet && context !== 'written' && surface?.borderVarDrops === true;
  // jsdom 20 to 26 (cssstyle 2.3.0 to 4.6.0, black box; #129) read a name
  // up to the next colon and a value from the first character after the
  // colon and its spaces, semicolons included: an empty declaration runs
  // on into the next one, which is lost with it (;color: red and x;color:
  // red declare nothing, color:;;margin: 0 neither, --x:;color: red is --x
  // with the value ;color: red).
  const runsOn = isLegacyMode(mode);
  if (runsOn && !inRule && context !== 'written' && unclosedLegacy(String(text ?? ''))) return;
  // jsdom 20 to 26 (cssstyle 2.3 to 4.6, black box, #239 and the #261
  // review): a style attribute or an element's cssText is read as cssom
  // reads a block first, a name given again as written (after trimming)
  // replacing the earlier value in its place, and then set declaration by
  // declaration, one cssstyle rejects setting nothing. So a later invalid
  // value takes the earlier one's place (height: 100vh; height: 100dvh
  // declares nothing with cssstyle before 4.2), one in another case does
  // not (color: blue; Color: red; color: foo is color: red), and color:
  // foo; width: 1px; color: blue is in that order. A name left without a
  // value at the end leaves the block empty (color: blue; width: 1px;
  // color:).
  const clears = runsOn && !inRule && context !== 'written';
  let carried = null;
  let initials = null; // the longhands a background of initial values set
  let named = 0;
  let unnamed = false;
  let prioritized = false;
  const names = counting ? [] : null;
  const source = String(text ?? '');
  const lineBreaks = !runsOn && cssSplitNeeded(source);
  let parts;
  if (source.indexOf('/*') !== -1) parts = commentedParts(source, runsOn, lineBreaks, context, surface);
  else parts = lineBreaks ? splitDeclarations(source) : splitOutside(source, ';');
  // (clears: a name given again is found before anything is set, as
  // setting one has effects beyond the block, a url() met: the block is
  // then read as coalescedLegacy gives it)
  const list = clears && coalesces(parts) ? coalescedLegacy(parts) : parts;
  for (let index = 0; index < list.length; index++) {
    let part = list[index];
    const scanned = scanOf === list;
    if (carried !== null) {
      part = `${carried};${part}`;
      carried = null;
    }
    const colon = scanned ? scanColons[index] : part.indexOf(':');
    if (colon < 0) {
      if (counting && part.trim() !== '') unnamed = true;
      if (runsOn) carried = part;
      continue;
    }
    named++;
    const rawName = scanned ? part.slice(scanStarts[index], scanEnds[index]) : part.slice(0, colon).trim();
    let name = propertyName(rawName);
    let value = part.slice(colon + 1).trim();
    if (counting) {
      names.push(rawName);
      // Read otherwise by cssom (cssom-declaration.js parseBlock): no
      // value, one starting with a character that does not start it
      // there (--x: (a;b) is (a, then b);color; --x: / 2px is /2px), or
      // a custom property's name with spaces (--my Var is --myVar).
      if (value === '' || ODD_START.has(value.charCodeAt(0))) unnamed = true;
      else if (rawName.charCodeAt(0) === 45 && /\s/.test(rawName)) unnamed = true;
    }
    // A name with whitespace or a comment inside it (SPACED_NAME,
    // spacedDeclarationName). Sheets read by cssom (counting) are left to
    // it. From jsdom 27 such a name that is not a custom property's is no
    // property outside style sheets (col or), so only custom properties'
    // are looked at there.
    else if ((runsOn || sheet || rawName.charCodeAt(1) === 45) && SPACED_NAME.test(rawName)) {
      name = spacedDeclarationName(rawName, runsOn, sheet, surface);
      if (name === null) continue;
    }
    if (runsOn && (value === '' || (value[0] === ';' && /^[\s;]*$/.test(value)))) {
      carried = part;
      continue;
    }
    let important = false;
    const bang = priorityStart(value);
    if (bang !== -1) {
      important = true;
      value = value.slice(0, bang).trim();
      // (from jsdom 27, an !important one keeps later ones out here, not
      // in cssom's cascade: margin: 1px !important; margin-left: 2px)
      if (counting) prioritized = true;
    }
    if (!name || !value || dropped(surface, name)) continue;
    // A url() with a line break in its string (a bad string) is invalid
    // here, though background-image takes it through the style object
    // (jsdom 27 and later, #144). A custom property keeps it, its value
    // as written (--x: url("a\nb.png"), black box 27.4.0 to 30.1.3; #262
    // review).
    if (lineBreaks && name.charCodeAt(1) !== 45 && /url\(/i.test(value) && hasBadString(value)) continue;
    if (!sheet && !runsOn && value.includes('!') && strayPriority(value, important)) continue;
    if (borderVarDrops && BORDER_AND_SIDES.has(name)) {
      // A CSS-wide keyword on border or a side leaves the block empty.
      if (CSS_WIDE_KEYWORD.test(value)) {
        decls.clear();
        releaseScan(list);
        return;
      }
      if (hasVar(value)) {
        if (name !== 'border') continue;
        decls.clear();
        releaseScan(list);
        return;
      }
    }
    if (isLegacyFont(surface, name) && /^inherit$/i.test(value)) {
      removeLegacyFont(decls, surface);
      continue;
    }
    let declared = declaredValue(name, value, mode, surface);
    // A style attribute a style write serialized ('written'): a background
    // with an empty layer (url("a.png"), , backgroundValue) is read as the
    // declaration it came from, which jsdom 27 and later compute from.
    if (declared === INVALID && context === 'written' && name === 'background' && !runsOn && value.includes(',')) {
      const filled = splitOutside(value, ',')
        .map((layer) => (layer.trim() === '' ? 'none' : layer))
        .join(',');
      if (filled !== value) declared = declaredValue(name, filled, mode, surface);
    }
    // background-image layers with var() (imageVarLayers): not here.
    if (
      !sheet &&
      declared !== INVALID &&
      name === 'background-image' &&
      isSpecMode(mode) &&
      value.includes('var(') &&
      !hasVarFunction(value) &&
      !isValidValue(name, value)
    )
      continue;
    if (element) {
      if (declared === INVALID && name === 'background') {
        declared = escapedUrlBackground(decls, value, mode, surface);
        if (declared !== INVALID) for (const n of RESETS.background) decls.delete(n);
      }
      if (meetImage(name, value, mode)) declared = INVALID;
    }
    if (declared === INVALID || declared === '') continue;
    // One that loses its !important is written without it; in a style
    // sheet it is a normal declaration, elsewhere it is still !important
    // to the block's other declarations (masked: black box, jsdom 27 to
    // 29), not to the cascade (cascade.js).
    const kept = important && !dropsImportant(surface, name, value, inRule);
    if (firstImportantWins) {
      if (firsts?.has(writtenKeys ? rawName : name) || (!important && covered?.has(name))) continue;
      if (important) {
        if (SHORTHANDS[name]) for (const longhand of SHORTHANDS[name]) (covered ??= new Set()).add(longhand);
        (firsts ??= new Set()).add(rawName);
      }
    } else if (sheetShorthands && !important && SHORTHANDS[name] && decls.get(name)?.important) continue;
    // Applied last (cssstyle's setProperty): a shorthand given again
    // resets the longhands declared before it.
    if (replay) decls.delete(name);
    if (initials !== null) {
      if (name === 'background') for (const [n] of BG_INITIALS) decls.delete(n);
      else if (!name.startsWith('background-')) initials.followed = true;
    }
    if (declared === INITIALS) {
      initials = setInitials(decls, kept, sheet && mode === 'spec', !sheet && mode === 'spec');
      continue;
    }
    if (MERGEABLE.has(name)) decls.mergeable = true;
    if (isLegacyFont(surface, name)) removeLegacyFont(decls, surface, false);
    decls.set(
      name,
      kept === important || sheet
        ? { value: declared, important: kept }
        : { value: declared, important: false, masked: true },
    );
  }
  // A background of initial values (setInitials) and a declaration of
  // another property after it, in a style attribute or cssText (black box,
  // 27.4.0 to 30.1.3, #264): jsdom 27 and 28 then declare nothing, 29 and
  // later leave the longhands out. An !important one stays, as does what
  // follows it (the #267 review).
  if (initials?.followed && !initials.important && !sheet) {
    if (mode !== 'spec' && !surface?.key?.startsWith('jsdom29')) decls.clear();
    else for (const [n, decl] of initials.set) if (decls.get(n) === decl) decls.delete(n);
  }

  releaseScan(list);
  if (clears && carried !== null && carried.includes(':')) decls.clear();
  if (counting) decls.plain = !unnamed && (named === decls.size || (!prioritized && plainNames(names)));
}

// Whether a legacy style attribute's or cssText's parts (parseInto's
// clears) are to be read as coalescedLegacy gives them, found before
// anything is set: a name given twice (trimmed, as written), a part
// without a value (carried on into the next) or more than 16 parts
// (coalescedLegacy gives parts with no name twice as they are). Without
// slicing: the colons and the names' bounds are kept for parseInto
// (scanOf: the parts they are for).
let scanOf = null;
// (dropped once parseInto is done, so that a long text is not kept: #261
// review)
const releaseScan = (parts) => {
  if (scanOf === parts) scanOf = null;
};
const scanColons = new Int32Array(16);
const scanStarts = new Int32Array(16);
const scanEnds = new Int32Array(16);
const isSpaceCode = (c) => c === 32 || (c >= 9 && c <= 13) || (c > 127 && /\s/.test(String.fromCharCode(c)));
function coalesces(parts) {
  const count = parts.length;
  scanOf = null;
  if (count > 16) return true;
  for (let i = 0; i < count; i++) {
    const part = parts[i];
    const colon = part.indexOf(':');
    scanColons[i] = colon;
    if (colon < 0) {
      // (a last part with nothing in it: after a closing semicolon)
      if (i !== count - 1 || part.trim() !== '') return true;
      break;
    }
    let v = colon + 1;
    while (v < part.length && (part.charCodeAt(v) === 59 || isSpaceCode(part.charCodeAt(v)))) v++;
    if (v === part.length) return true;
    let start = 0;
    let end = colon;
    while (start < end && isSpaceCode(part.charCodeAt(start))) start++;
    while (end > start && isSpaceCode(part.charCodeAt(end - 1))) end--;
    // (a name with whitespace or a comment inside: coalescedLegacy's
    // legacyNameKey)
    for (let k = start; k < end; k++) {
      const c = part.charCodeAt(k);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) return true;
      if (c === 47 && part.charCodeAt(k + 1) === 42) return true;
    }
    for (let j = 0; j < i; j++) {
      const at = scanStarts[j];
      if (scanEnds[j] - at !== end - start) continue;
      const other = parts[j];
      let k = 0;
      while (k < end - start && other.charCodeAt(at + k) === part.charCodeAt(start + k)) k++;
      if (k === end - start) return true;
    }
    scanStarts[i] = start;
    scanEnds[i] = end;
  }
  scanOf = parts;
  return false;
}

// A legacy style attribute's or cssText's declarations as cssom keeps them
// (parseInto's clears): an empty declaration runs on into the next one
// (as parseInto reads it), and a name given again replaces the earlier
// one's value in its place. Names are compared as cssom reads them, its
// whitespace and comments removed but its case kept (black box 20.0.3 to
// 26.1.0, #262 review): col or: red; color: foo and color: red; col or:
// foo declare nothing, --f o o: red; --foo: blue; --f o o: green is --foo:
// green, and COL OR: red; color: foo is color: red.
const legacyNameKey = (rawName) =>
  SPACED_NAME.test(rawName) ? rawName.replace(COMMENTS, '').replace(CSS_SPACES, '') : rawName;
function coalescedLegacy(parts) {
  const out = [];
  const at = new Map();
  let carried = null;
  for (let part of parts) {
    if (carried !== null) {
      part = `${carried};${part}`;
      carried = null;
    }
    const colon = part.indexOf(':');
    const value = colon < 0 ? '' : part.slice(colon + 1).trim();
    if (value === '' || (value[0] === ';' && /^[\s;]*$/.test(value))) {
      carried = part;
      continue;
    }
    const key = legacyNameKey(part.slice(0, colon).trim());
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, out.length);
      out.push(part);
    } else out[i] = part;
  }
  if (carried !== null) out.push(carried);
  return out;
}

// Whether the names of a rule's declarations, some of them dropped, are
// those cssom reads, each once (context 'cssom'): no spaces (w i d t h is
// width there) or parentheses in them, and no name twice whatever its
// case (BORDER after border is applied after what came between, and
// color: red; color: bogus is bogus there).
function plainNames(names) {
  for (let i = 0; i < names.length; i++) {
    if (!PLAIN_NAME.test(names[i]) && !names[i].startsWith('--')) return false;
    const lower = names[i].toLowerCase();
    for (let j = 0; j < i; j++) if (names[j].toLowerCase() === lower) return false;
  }
  return true;
}

// jsdom 20 to 26 (black box, #144): a style attribute or cssText with an
// unclosed string, parenthesis or comment declares nothing (url("a.png,
// url(a(b.png), calc(1px, /* x). A backslash escapes only in a string:
// url(a\(b.png) leaves a parenthesis open, url(a\"b.png) a string. Quotes
// and parentheses in a comment do not count (/* " */).
function unclosedLegacy(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) return true;
      i++;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && depth > 0) depth--;
  }
  return quote !== null || depth > 0;
}

// Does a string in the value have a line break? Comments are not skipped:
// a value with a comment and a url() is dropped before this anyway, as
// comments in values are not modeled (#162).
function hasBadString(value) {
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\') i++;
    else if (c === '/' && value[i + 1] === '*') i = commentEnd(value, i) - 1;
    else if (c === '"' || c === "'") {
      const end = stringEnd(value, i, true);
      if (end < 0) return true;
      i = end - 1;
    }
  }
  return false;
}

// Indexed properties (CSSOM): style[i] is the i-th declaration's name. They
// are own enumerable data properties, as in jsdom, updated when a name is
// added or removed (not when a value changes). Writable, as in jsdom 26:
// read-only ones (jsdom 30, WebIDL) put the object's elements in dictionary
// mode, which made every style write ~15% slower.
function defineIndex(style, i, name) {
  style[i] = name;
}
function reindex(style) {
  const s = styleState(style);
  let i = 0;
  for (const name of s.decls.keys()) defineIndex(style, i++, name);
  for (let j = i; j < s.indexed; j++) delete style[j];
  s.indexed = i;
}
export function clearDeclarations(style) {
  styleState(style).decls.clear();
  styleState(style).decls.hidden = undefined;
  reindex(style);
}

// A style declaration's state: a private field (hiddenSlot in internal.js),
// read directly here (style writes are hot); CSSStyleDeclaration.prototype
// has the accessor for S for other modules.
const STYLE_SLOT = hiddenSlot();
const styleState = STYLE_SLOT.get;
const initStyleState = STYLE_SLOT.init;

// Property names are ASCII case-insensitive, except custom properties'.
const propertyName = (name) => {
  const text = String(name);
  return text.startsWith('--') ? text : text.toLowerCase();
};

function tooFew(method, required, present) {
  throw new TypeError(
    `Failed to execute '${method}' on 'CSSStyleDeclaration': ${required} argument${required > 1 ? 's' : ''} required, but only ${present} present.`,
  );
}

// A declaration list's declarations (a style attribute's value).
export function parseDeclarations(text, mode, surface = null, written = false) {
  const decls = new Map();
  parseInto(decls, text, mode, surface, written ? 'written' : null);
  return decls;
}

// A declaration block serialized (CSSOM): longhands of a shorthand that are
// all present with the same importance are written as the shorthand, at the
// first one's place. jsdom merges margin, padding and flex (jsdom 26: margin
// and padding, as written: 1px 2px 1px 2px).
const MERGED = {
  spec: ['margin', 'padding', 'flex', 'background-position'].map((shorthand) => [shorthand, SHORTHANDS[shorthand]]),
  page: [['margin', SHORTHANDS.margin]],
  jsdom26: ['margin', 'padding'].map((shorthand) => [shorthand, SHORTHANDS[shorthand]]),
};
MERGED.jsdom25 = MERGED.jsdom22 = MERGED.jsdom20 = MERGED.jsdom26;
MERGED.jsdom27 = MERGED.spec;
// A block that ever held one of their longhands is marked (decls.mergeable),
// so most blocks skip merging.
const MERGEABLE = new Set(MERGED.spec.flatMap(([, longhands]) => longhands));
function serialize(decls, mode = 'spec') {
  let merged = null; // longhand -> shorthand to write in its place ('' to skip)
  // An inline style's margin and padding are kept as jsdom keeps them
  // (box-declarations.js): not merged here; from jsdom 27 a shorthand
  // leaves out the longhands before it.
  const box = decls.box;
  const cover = decls.boxed === true && (box === 'C' || box === 'D') ? boxCover(decls) : null;
  if (decls.mergeable === true && decls.size >= 2)
    for (const [shorthand, longhands] of MERGED[mode]) {
      if (box !== undefined && BOX_LONGHANDS[shorthand] !== undefined) continue;
      const first = decls.get(longhands[0]);
      if (first === undefined || !longhands.every((l) => decls.get(l)?.important === first.important)) continue;
      // (background-position with its longhands: setInitials)
      if (decls.has(shorthand)) continue;
      const values = longhands.map((l) => decls.get(l).value);
      const value = isLegacyMode(mode) ? values.join(' ') : COMPOSED[shorthand](values);
      merged ??= new Map();
      let place = null;
      for (const name of decls.keys())
        if (longhands.includes(name)) {
          place = name;
          break;
        }
      for (const l of longhands)
        merged.set(l, l === place ? { name: shorthand, value, important: first.important } : '');
    }
  let out = '';
  if (merged === null && cover === null) {
    for (const [name, { value, important }] of decls)
      out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
    return out;
  }
  let i = -1;
  for (const [name, decl] of decls) {
    i++;
    if (cover !== null && coveredBy(cover, name, i, decl.important)) continue;
    let { value, important } = decl;
    let written = name;
    const m = merged?.get(name);
    if (m === '') continue;
    if (m) ({ name: written, value, important } = m);
    out += `${out ? ' ' : ''}${written}: ${value}${important ? ' !important' : ''};`;
  }
  return out;
}

// Computed values come from cascade.js, which registers itself here (it
// imports the selector engine, which imports back into this module).
export const computed = { value: null };

// Write the declarations back to the element's style attribute (CSSOM:
// update style attribute, which sets the attribute: MutationObserver
// records and attributeChangedCallback, as in jsdom); a
// style rule's declarations changed the cascade.
function sync(style, text) {
  const s = styleState(style);
  const element = s.element;
  if (element) {
    const es = element[S];
    const observing = es.doc[S].observerCount > 0;
    const old = observing || hooks.ce !== null ? es.attrs.get('style') : undefined;
    const value = text ?? serialize(s.decls, s.mode);
    es.inlineCascade = null;
    es.styleWritten = value;
    es.attrs.set('style', value);
    es.attrsRev = (es.attrsRev ?? 0) + 1;
    attributesChanged(element);
    if (observing) hooks.attribute(element, 'style', old);
    if (hooks.ce !== null) hooks.ce.attributeChanged(element, 'style', old, value);
  } else cssomChanges.rev++;
}

// --- the CSS namespace ---------------------------------------------------------

// CSS.escape(): serialize an identifier (CSSOM).
export function escapeIdentifier(value) {
  const input = String(value);
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    const ch = input[i];
    if (c === 0) out += '\ufffd';
    else if (
      (c >= 0x1 && c <= 0x1f) ||
      c === 0x7f ||
      (i === 0 && c >= 0x30 && c <= 0x39) ||
      (i === 1 && c >= 0x30 && c <= 0x39 && input.charCodeAt(0) === 0x2d)
    )
      out += `\\${c.toString(16)} `;
    else if (i === 0 && ch === '-' && input.length === 1) out += `\\${ch}`;
    else if (c >= 0x80 || ch === '-' || ch === '_' || /[0-9A-Za-z]/.test(ch)) out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

// CSS.supports(property, value): a supported property with a valid value
// (the same check as style declarations; jsdom 30 validates too).
const supportsDeclaration = (property, value) => {
  const name = String(property).toLowerCase();
  const text = String(value).trim();
  return text !== '' && declaredValue(name, text, 'spec') !== INVALID;
};

// A <supports-condition> (CSS Conditional Rules): not / and / or, (decl),
// nested conditions and selector(); unknown syntax is false.
function supportsCondition(text, matchesSelector, declaration = supportsDeclaration) {
  let i = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? '')) i++;
  };
  const group = () => {
    // Text up to the matching closing parenthesis; parentheses in strings,
    // escapes and comments do not count (#120).
    let depth = 1;
    const start = i;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === '"' || c === "'") {
        i++;
        while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      } else if (c === '\\') i++;
      else if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        i = end < 0 ? text.length : end + 1;
      } else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    return depth === 0 ? text.slice(start, i - 1) : null;
  };
  const inParens = () => {
    ws();
    if (/^not[\s(]/i.test(text.slice(i, i + 4))) {
      i += 3;
      return !inParens();
    }
    if (/^selector\(/i.test(text.slice(i))) {
      i += 9;
      const inner = group();
      return inner !== null && matchesSelector(inner);
    }
    if (text[i] !== '(') return null;
    i++;
    const inner = group();
    if (inner === null) return null;
    const colon = inner.indexOf(':');
    if (/^\s*(not\b|\()/i.test(inner) || colon < 0) return condition(inner);
    return declaration(inner.slice(0, colon), inner.slice(colon + 1));
  };
  const condition = (sub) => {
    if (sub !== undefined) return supportsCondition(sub, matchesSelector, declaration);
    let result = inParens();
    if (result === null) return null;
    for (;;) {
      ws();
      const op = /^(and|or)\b/i.exec(text.slice(i))?.[1]?.toLowerCase();
      if (!op) break;
      i += op.length;
      const next = inParens();
      if (next === null) return null;
      result = op === 'and' ? result && next : result || next;
    }
    return result;
  };
  const result = condition();
  ws();
  return result === true && i >= text.length;
}

// CSSSupportsRule's matches (jsdom 29 and later, black box 29.1.1 and
// 30.1.3): the condition as written (no bare declaration), selector()
// false, a custom property false, !important allowed.
const ruleDeclaration = (property, value) => {
  const name = property.trim();
  return !name.startsWith('--') && supportsDeclaration(name, value.replace(/!\s*important\s*$/i, ''));
};
export const supportsRuleMatches = (text) => supportsCondition(String(text), () => false, ruleDeclaration);

export function cssNamespace(matchesSelector) {
  const namespace = {
    escape(ident) {
      if (arguments.length === 0)
        throw new TypeError("Failed to execute 'escape' on 'CSS': 1 argument required, but only 0 present.");
      return escapeIdentifier(ident);
    },
    supports(...args) {
      if (args.length === 0)
        throw new TypeError("Failed to execute 'supports' on 'CSS': 1 argument required, but only 0 present.");
      if (args.length >= 2) return supportsDeclaration(args[0], args[1]);
      const text = String(args[0]);
      // A bare declaration is treated as if wrapped in parentheses.
      return supportsCondition(text, matchesSelector) || supportsCondition(`(${text})`, matchesSelector);
    },
  };
  Object.defineProperty(namespace, Symbol.toStringTag, { value: 'CSS', configurable: true });
  return namespace;
}

export function computedStyle(element, proto) {
  const style = Object.create(proto);
  initStyleState(style, {
    element,
    computed: true,
    decls: new Map(),
    mode: modeOf(proto),
    indexed: 0,
    surface: surfaceOf(proto),
  });
  return style;
}

function readOnly() {
  throw domError(
    "Failed to execute on 'CSSStyleDeclaration': These styles are computed, and therefore read-only.",
    'NoModificationAllowedError',
  );
}

// Writes to computed styles, which tests use to fake a layout (react-aria
// sets position on the result of getComputedStyle). jsdom before 28.1.0
// (black box: 28.0.0 still does) let any write change that one object;
// since 28.1.0, setting a property changes that object and the element's
// computed value until its document changes, and the methods throw as the
// standard says.
const mutableComputed = (s) => s.element[S].doc[S].window[S].compat.mutableComputedStyle;

function computedOverride(s, name) {
  if (s.overrides?.has(name)) return s.overrides.get(name);
  if (s.replaced) return '';
  const es = s.element[S];
  const element = es.computedOverrides;
  if (!element || element.rev !== (es.doc[S].treeRev ?? 0)) return undefined;
  return element.values.get(name);
}

function writeComputed(s, name, value) {
  const raw = value === null ? '' : String(value).trim();
  if (mutableComputed(s)) {
    // As on el.style (black box, jsdom 20 to 28.0.0): an empty value removes
    // the property, an invalid one is ignored, others are serialized.
    const text = raw === '' ? '' : declaredValue(name, raw, s.mode, s.surface);
    if (text !== INVALID && text !== INITIALS) (s.overrides ??= new Map()).set(name, text);
    return;
  }
  // Removing a declaration from a computed style throws, as from jsdom 28.1.0.
  if (raw === '') readOnly();
  const text = declaredValue(name, raw, s.mode, s.surface);
  if (text === INVALID || text === INITIALS) return;
  (s.overrides ??= new Map()).set(name, text);
  const es = s.element[S];
  const rev = es.doc[S].treeRev ?? 0;
  if (es.computedOverrides?.rev !== rev) es.computedOverrides = { rev, values: new Map() };
  es.computedOverrides.values.set(name, text);
}

const valueOf = (style, name) => {
  const s = styleState(style);
  if (s.computed) return computedOverride(s, name) ?? computed.value(s.element, name);
  const decl = s.decls.get(name);
  if (decl) return decl.value;
  if (s.decls.box !== undefined && isBoxName(name)) return boxValue(s.decls, name);
  if (LONGHANDS[name] || (s.decls.legacyFont !== undefined && LEGACY_FONT_LONGHANDS.has(name)))
    return fromShorthand(s.decls, name);
  // jsdom 26 read background as the background-color set alone.
  if (name === 'background' && isLegacyMode(s.mode)) return s.decls.get('background-color')?.value ?? '';
  if (COMPOSED[name]) return composeShorthand(s.decls, name, s.surface?.colors === 'css2');
  return BORDER_READS[name] !== undefined && !isLegacyMode(s.mode) ? composeBorder(s.decls, name) : '';
};

// jsdom 27 and later (black box, 27.0 to 30.1.3) read border-width,
// -style and -color and the border sides from their longhands, set by
// border too (border: 1px solid red gives border-width 1px and border-top
// 1px solid red), a side in its shortest form (border: red gives
// border-top red, border: none medium).
const BORDER_READS = {};
const BOX_SIDES = ['top', 'right', 'bottom', 'left'],
  BORDER_PARTS = ['width', 'style', 'color'];
for (const part of BORDER_PARTS) BORDER_READS[`border-${part}`] = BOX_SIDES.map((side) => `border-${side}-${part}`);
for (const side of BOX_SIDES) BORDER_READS[`border-${side}`] = BORDER_PARTS.map((part) => `border-${side}-${part}`);
const BORDER_INITIAL = ['medium', 'none', 'currentcolor'];
function composeBorder(decls, name) {
  const values = [];
  for (const longhand of BORDER_READS[name]) {
    const value = decls.get(longhand)?.value ?? fromShorthand(decls, longhand);
    if (!value) return '';
    values.push(value);
  }
  if (values.length === 4) return serializeBox(values);
  if (values.every((v) => CSS_WIDE_KEYWORD.test(v))) return values.every((v) => v === values[0]) ? values[0] : '';
  const parts = values.filter((v, i) => v.toLowerCase() !== BORDER_INITIAL[i]);
  return parts.length ? parts.join(' ') : values[0];
}

// Shorthands whose longhands a declaration block reads through them, as in
// jsdom (its CSS layer expands these; overflow: hidden leaves overflow-x
// empty there, and tests rely on that).
export const EXPANDED_SHORTHANDS = new Set([
  'background',
  'background-position',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'flex',
  'font',
  'margin',
  'padding',
]);

// A longhand set by a declared shorthand (margin-top from margin: 0 auto);
// the last such shorthand wins.
function fromShorthand(decls, longhand) {
  let found = '';
  for (const [name, { value }] of decls) {
    if (!EXPANDED_SHORTHANDS.has(name)) continue;
    for (const [part, v] of expand(name, value, decls.legacyFont)) if (part === longhand) found = v;
  }
  return found;
}

// A shorthand read from its longhands when every one is declared, as jsdom
// composes them (margin from margin-top, -right, -bottom and -left).
const COMPOSED = {
  margin: (v) => serializeBox(v),
  padding: (v) => serializeBox(v),
  flex: ([grow, shrink, basis]) => `${grow} ${shrink} ${basis}`,
  'background-position': ([x, y]) => {
    // background: inherit gives background-position inherit (jsdom 28.1 and later).
    if (x === y && CSS_WIDE_KEYWORD.test(x)) return x;
    if (!x.includes(',') && !y.includes(',')) return `${x} ${y}`;
    const xs = x.split(/\s*,\s*/),
      ys = y.split(/\s*,\s*/);
    return xs.map((part, i) => `${part} ${ys[i] ?? ys[ys.length - 1]}`).join(', ');
  },
};
// legacyBox: cssstyle before 4.4, which writes all four values of margin
// and padding (1px 2px 1px 2px).
function composeShorthand(decls, name, legacyBox = false) {
  const values = [];
  for (const longhand of SHORTHANDS[name]) {
    const value = decls.get(longhand)?.value ?? fromShorthand(decls, longhand);
    if (!value) return '';
    values.push(value);
  }
  return legacyBox && (name === 'margin' || name === 'padding') ? values.join(' ') : COMPOSED[name](values);
}

// jsdom 20 to 26 (cssstyle 2 to 4, black box): setting flex, background,
// border or a border side through the style object removes that property
// and the longhands it sets, then adds it at the end, so setting it again
// moves it there, even to the same value (React re-sets a changed style
// property; snapshots show the order). A var() value is set in place,
// except flex's from cssstyle 4.4. A style attribute (cssText) does not
// move them.
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'];
// A background of initial values once the image jsdom 27 and later drop
// is left out (backgroundValue: background: LINEAR-GRADIENT(red, blue),
// NONE, -webkit-linear-gradient(top, red, blue)) sets each longhand to its
// initial value, in place, and is not declared itself (black box, 27.4.0
// to 30.1.3, #264). axes: background-position-x and -y too, as jsdom 30
// lists them from setProperty and in style sheets (not from cssText or a
// style attribute, where jsdom 30 removes those declared before instead:
// dropAxes, the #267 review). The longhands set, by name, and whether they
// are !important.
const BG_INITIALS = [
  ['background-image', 'none'],
  ['background-position', '0% 0%'],
  ['background-position-x', '0%'],
  ['background-position-y', '0%'],
  ['background-size', 'auto'],
  ['background-repeat', 'repeat'],
  ['background-origin', 'padding-box'],
  ['background-clip', 'border-box'],
  ['background-attachment', 'scroll'],
  ['background-color', 'transparent'],
];
// Removes the background longhands (setDeclaration): were there any?
function clearBackground(decls) {
  if (decls.size === 0 || (decls.size === 1 && decls.has('background'))) return false;
  let removed = false;
  for (const [name] of BG_INITIALS) removed = decls.delete(name) || removed;
  return removed;
}
const BG_X = 'background-position-x';
const BG_Y = 'background-position-y';
function setInitials(decls, important, axes, dropAxes = false) {
  const set = new Map();
  decls.delete('background');
  // (the two together give background-position the later one's place:
  // black box, 30.1.2 and 30.1.3)
  if (dropAxes && decls.has(BG_X) && decls.has(BG_Y) && !decls.has('background-position')) {
    const entries = [...decls];
    decls.clear();
    let seen = false;
    for (const [name, decl] of entries) {
      if (name !== BG_X && name !== BG_Y) decls.set(name, decl);
      else if (seen) decls.set('background-position', decl);
      else seen = true;
    }
  } else if (dropAxes) {
    decls.delete(BG_X);
    decls.delete(BG_Y);
  }
  for (const [name, value] of BG_INITIALS) {
    if (!axes && (name === BG_X || name === BG_Y)) continue;
    const decl = { value, important };
    decls.set(name, decl);
    set.set(name, decl);
  }
  return { set, followed: false, important };
}

const RESETS = {
  flex: ['flex', 'flex-grow', 'flex-shrink', 'flex-basis'],
  background: [
    'background',
    'background-color',
    'background-image',
    'background-repeat',
    'background-attachment',
    'background-position',
  ],
  border: [
    'border',
    'border-width',
    'border-style',
    'border-color',
    ...BORDER_SIDES.flatMap((side) => [
      `border-${side}`,
      `border-${side}-width`,
      `border-${side}-style`,
      `border-${side}-color`,
    ]),
  ],
};
for (const side of BORDER_SIDES)
  RESETS[`border-${side}`] = [`border-${side}`, `border-${side}-width`, `border-${side}-style`, `border-${side}-color`];
// (A surface has a legacyFont variant before cssstyle 4.4.)
const resets = (surface, name, text) =>
  !text.includes('var(') || (name === 'flex' && surface?.legacyFont === undefined);

// via: 'accessor' (style.marginTop = v; 'cssFloat' for style.cssFloat),
// 'set' (setProperty) or 'remove'
// (removeProperty), for an inline style's margin and padding.
// A value written through setProperty() or an accessor, serialized, or
// INVALID. jsdom 27 and later read one with a comment as the style
// attribute reads the declaration alone (black box, 27.4.0 to 30.1.3,
// #264), keeping what it declares as it serializes it: red /* c */ is red,
// 1px/**/2px is 1px 2px, NONE /**/ in background the initial values,
// url(a.png) /**/, none is url("a.png"), ; a comment that leaves nothing
// (/**/, blo/**/ck), an !important or a declaration separator in the
// value declares nothing (red/**/; color: blue too). Such a value is
// invalid to the grammar, so only invalid ones are looked at again (a
// custom property's is kept as written: never invalid).
function writtenValue(name, raw, s) {
  const text = declaredValue(name, raw, s.mode, s.surface);
  if (text !== INVALID || isLegacyMode(s.mode) || !raw.includes('/*') || separated(raw)) return text;
  const decls = new Map();
  parseInto(decls, `${name}: ${raw}`, s.mode, s.surface, null, true);
  for (const declared of decls.values()) if (declared.important || declared.masked === true) return INVALID;
  const declared = decls.get(name);
  if (declared !== undefined) return decls.size === 1 ? declared.value : INVALID;
  // (parseInto sets a background of initial values as its longhands.)
  return name === 'background' && decls.size > 0 ? INITIALS : INVALID;
}
// A semicolon outside strings, comments, parentheses and unquoted url()s.
function separated(raw) {
  // A line break ends a string where the parser reads it so (a bad string).
  const lineBreaks = cssSplitNeeded(raw);
  for (let i = 0, depth = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 34 || c === 39) {
      const end = stringEnd(raw, i, lineBreaks);
      i = (end < 0 ? ~end : end) - 1;
    } else if (c === 47 && raw.charCodeAt(i + 1) === 42) {
      const end = raw.indexOf('*/', i + 2);
      if (end === -1) return false;
      i = end + 1;
    } else if (c === 92) i++;
    else if (c === 40) {
      // An unquoted url() is one token (its quote or /* opens nothing).
      const end = urlTokenEnd(raw, i);
      if (end === -1) depth++;
      else i = end - 1;
    } else if (c === 41 && depth > 0) depth--;
    else if (c === 59 && depth === 0) return true;
  }
  return false;
}

function setDeclaration(style, name, value, priority = '', via = 'accessor') {
  const s = styleState(style);
  if (s.computed) {
    if (!mutableComputed(s)) readOnly();
    writeComputed(s, name, value);
    return;
  }
  // [LegacyNullToEmptyString]: null removes the declaration; undefined is
  // the string "undefined", an invalid value (as in jsdom).
  let raw = value === null ? '' : String(value).trim();
  if (s.decls.box !== undefined && isBoxName(name)) {
    setBox(style, s, name, raw, priority, via);
    return;
  }
  if (isLegacyFont(s.surface, name) && /^inherit$/i.test(raw)) raw = '';
  // jsdom 27 and later: a background write, a removal too, replaces the
  // background longhands, those setInitials set among them (black box,
  // 27.4.0 to 30.1.3, #264), except one of initial values, which sets
  // them in place.
  const replaces = name === 'background' && !isLegacyMode(s.mode);
  // The style attribute is updated only when a declaration changed (CSSOM).
  if (raw === '') {
    const cleared = replaces && clearBackground(s.decls);
    if (isLegacyFont(s.surface, name) ? removeLegacyFont(s.decls, s.surface) : s.decls.delete(name) || cleared) {
      reindex(style);
      sync(style);
    }
    return;
  }
  // Unknown properties and invalid values are ignored (CSSOM).
  let text = writtenValue(name, raw, s);
  if (text === INVALID && name === 'background' && !s.parentRule)
    text = escapedUrlBackground(s.decls, raw, s.mode, s.surface);
  if (!s.parentRule && meetImage(name, raw, s.mode)) text = INVALID;
  if (text === INVALID) return;
  if (text === '') {
    let removed = replaces && clearBackground(s.decls);
    for (const n of RESETS.background) removed = s.decls.delete(n) || removed;
    if (removed) {
      reindex(style);
      sync(style);
    }
    return;
  }
  // (A background of initial values has no var(): its !important is kept.)
  // An accessor's write keeps the !important it replaces in jsdom 27 to 29
  // (compat.accessorKeepsImportant; via 'cssFloat': style.cssFloat's).
  const keeps = s.surface?.accessorKeepsImportant ?? null;
  const important =
    (String(priority).toLowerCase() === 'important' ||
      (keeps !== null &&
        (via === 'accessor' || (via === 'cssFloat' && keeps === 'all')) &&
        s.decls.get(name)?.important === true)) &&
    (text === INITIALS || !dropsImportant(s.surface, name, text, s.parentRule != null));
  if (text === INITIALS) {
    setInitials(s.decls, important, s.mode === 'spec');
    reindex(style);
    sync(style);
    return;
  }
  const cleared = replaces && clearBackground(s.decls);
  if (isLegacyFont(s.surface, name) && removeLegacyFont(s.decls, s.surface)) reindex(style);
  if (RESETS[name] !== undefined && isLegacyMode(s.mode) && resets(s.surface, name, text)) {
    let removed = false;
    for (const n of RESETS[name]) removed = s.decls.delete(n) || removed;
    if (removed) {
      s.decls.set(name, { value: text, important });
      reindex(style);
      sync(style);
      return;
    }
  }
  if (cleared) {
    s.decls.set(name, { value: text, important });
    reindex(style);
    sync(style);
    return;
  }
  const old = s.decls.get(name);
  if (old && old.value === text && old.important === important) return;
  if (old === undefined && MERGEABLE.has(name)) s.decls.mergeable = true;
  s.decls.set(name, { value: text, important });
  if (old === undefined) defineIndex(style, s.indexed++, name);
  sync(style);
}

// A write of margin, padding or one of their longhands to an inline style
// (box-declarations.js); the style attribute is updated when the
// declarations' text changed, as jsdom's.
function setBox(style, s, name, raw, priority, via) {
  let text = '';
  if (via !== 'remove' && raw !== '') {
    text = writtenValue(name, raw, s);
    if (text === INVALID || text === '') return;
  }
  const important = String(priority).toLowerCase() === 'important' && !dropsImportant(s.surface, name, text, false);
  const decls = s.decls;
  const rev = decls.rev;
  const order = decls.order;
  const es = s.element[S];
  const held = es.attrs.get('style');
  // jsdom 30 writes the attribute for a setter only when cssText changes
  // (style.marginTop = '1px' after margin:1px keeps the attribute's text);
  // removeProperty, and every write before jsdom 30, writes it when the
  // declarations change.
  const textOnly = decls.box === 'D' && via !== 'remove';
  let before = null;
  if (textOnly) before = es.styleWritten !== undefined && held === es.styleWritten ? held : serialize(decls, s.mode);
  writeBox(decls, decls.box, name, text, important, via);
  if (decls.rev === rev) return;
  if (decls.order !== order) reindex(style);
  const after = serialize(decls, s.mode);
  if (textOnly && after === before && after !== held) return;
  // The attribute is written when its text is not the declarations' (set
  // or parsed as margin-top: inherit; margin-right: 1px; ..., then
  // style.removeProperty('margin-right'): margin: inherit 1px 1px).
  if (after !== held) sync(style, after);
  else {
    // The same text, other declarations (style.removeProperty('margin-right')
    // after margin: inherit 1px 1px): the attribute stays, but the cascade
    // (cascadeText) reads the declarations, as jsdom computes from them,
    // though the text was set or parsed rather than written.
    es.styleWritten = after;
    es.inlineCascade = null;
    attributesChanged(s.element);
  }
}

// CSSStyleProperties' accessors, one per name in STYLE_ACCESSORS. The
// descriptor map has no prototype: V8 keeps it as a dictionary instead of
// building a hidden class per key.
// surfaceKey: the profile's (styleSurface), or null (jsdom 30.1 and later).
function styleDescriptors(surfaceKey = null) {
  const descriptors = Object.create(null);
  const surface = surfaceKey === null ? null : styleSurface(surfaceKey);
  for (const accessor of STYLE_ACCESSORS) {
    const name = cssName(accessor);
    const via = accessor === 'cssFloat' ? 'cssFloat' : 'accessor';
    if (surface === null) descriptors[accessor] = styleAccessor(name, via);
    else if (!missing(surface, accessor, name))
      descriptors[accessor] = styleAccessor(surface.writes.get(accessor) ?? name, via);
  }
  if (surface !== null) for (const [accessor, name] of surface.writes) descriptors[accessor] ??= styleAccessor(name);
  // cssstyle 2 to 4.3: style.azimuth = '' (or null) is ignored, as an
  // invalid value; setProperty('azimuth', '') removes it.
  if (hasAngleAzimuth(surfaceKey)) {
    const { get, set } = descriptors.azimuth;
    descriptors.azimuth = {
      get,
      set(value) {
        if (value !== null && String(value).trim() !== '') set.call(this, value);
      },
      enumerable: true,
      configurable: true,
    };
  }
  return descriptors;
}
// The computed style's background and border side accessors of jsdom 26
// and earlier (cascade.js legacyAccessorValue).
const COMPOSED_ACCESSORS = new Set([
  'background',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'margin',
  'padding',
]);
function composedValue(style, name) {
  const s = styleState(style);
  if (s.computed) {
    const value = computedOverride(s, name) ?? computed.accessor(s.element, name);
    if (value !== null) return value;
  }
  if (s.decls.box !== undefined && (name === 'margin' || name === 'padding'))
    return isLegacyMode(s.mode) && s.surface?.colors !== 'css2'
      ? boxAccessorValue(s.decls, name)
      : boxValue(s.decls, name);
  const value = valueOf(style, name);
  // cssstyle 4.4 and later (jsdom 26): the margin and padding accessors
  // read the shortest form, getPropertyValue() and cssText as written.
  return (name === 'margin' || name === 'padding') && isLegacyMode(s.mode) && s.surface?.colors !== 'css2'
    ? shortestBox(value)
    : value;
}
function styleAccessor(name, via = 'accessor') {
  if (COMPOSED_ACCESSORS.has(name)) {
    return {
      get() {
        return composedValue(this, name);
      },
      set(value) {
        const s = styleState(this);
        if (s.computed) writeComputed(s, name, value);
        else setDeclaration(this, name, value);
      },
      enumerable: true,
      configurable: true,
    };
  }
  return {
    get() {
      return valueOf(this, name);
    },
    set(value) {
      const s = styleState(this);
      if (s.computed) writeComputed(s, name, value);
      else setDeclaration(this, name, value, '', via);
    },
    enumerable: true,
    configurable: true,
  };
}

// CSSStyleProperties' members (jsdom 29 and later): the accessors, and its
// own @@iterator, CSSStyleDeclaration's (black box, jsdom 29.1.1 and 30.1.3).
function propertiesDescriptors(surfaceKey) {
  const descriptors = styleDescriptors(surfaceKey);
  descriptors[Symbol.iterator] = {
    value: Array.prototype.values,
    writable: true,
    enumerable: false,
    configurable: true,
  };
  return descriptors;
}

// CSSPageDescriptors' accessors: each descriptor by its dashed name, and
// by its camel-cased one where that differs.
function pageDescriptors() {
  const descriptors = Object.create(null);
  for (const name of PAGE_DESCRIPTORS) {
    const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    for (const key of camel === name ? [name] : [name, camel]) {
      const accessor = {
        get() {
          return valueOf(this, name);
        },
        set(value) {
          setDeclaration(this, name, value === null ? '' : value);
        },
        enumerable: true,
        configurable: true,
      };
      Object.defineProperty(accessor.get, 'name', { value: `get ${key}` });
      Object.defineProperty(accessor.set, 'name', { value: `set ${key}` });
      descriptors[key] = accessor;
    }
  }
  return descriptors;
}

// CSSStyleDeclaration's operations, shared by the interface's variants.
const itemOf = (style, index) => [...styleState(style).decls.keys()][index >>> 0] ?? '';
function priorityOf(style, name) {
  const decls = styleState(style).decls;
  const key = propertyName(name);
  const important = decls.box !== undefined && isBoxName(key) ? boxPriority(decls, key) : decls.get(key)?.important;
  return important ? 'important' : '';
}
function setPropertyOf(style, name, value, priority) {
  const key = propertyName(name);
  if (dropped(styleState(style).surface, key)) return;
  setDeclaration(style, key, value, priority == null ? '' : priority, 'set');
}
function removePropertyOf(style, name) {
  const key = propertyName(name);
  const s = styleState(style);
  const previous = s.computed
    ? mutableComputed(s)
      ? valueOf(style, key)
      : readOnly()
    : s.decls.box !== undefined && isBoxName(key)
      ? boxValue(s.decls, key)
      : (s.decls.get(key)?.value ?? '');
  setDeclaration(style, key, '', '', 'remove');
  return previous;
}

// jsdom 28 and earlier (cssstyle 2.3 to 6.2), black box: one
// CSSStyleDeclaration prototype has the operations, cssText, length,
// parentRule and the style accessors (vi.spyOn(CSSStyleDeclaration.prototype,
// 'width', 'get') sees el.style.width and computed reads), without
// @@iterator and @@toStringTag ([object Object]). A missing argument is no
// error, except item() and setProperty() from cssstyle 4.4; setProperty
// with no value does nothing. cssstyle 2 to 4.3 ('A', jsdom 20 to 25): all
// enumerable, item/1, setProperty/3, and getPropertyCSSValue,
// getPropertyShorthand and isPropertyImplicit, which return undefined.
// Later: not enumerable (cssFloat too), item/0, setProperty/2 (3 in
// cssstyle 5.3: 'E'). cssstyle's own underscore members are left out.
const LEGACY_GROUPS = {
  cssstyle2: 'A',
  cssstyle3: 'A',
  'cssstyle4.1': 'A',
  'cssstyle4.4': 'D',
  'cssstyle5.0': 'D',
  cssstyle5: 'E',
  'cssstyle6.0': 'F',
  'cssstyle6.1': 'F',
};
const LEGACY_SHARED = {
  getPropertyValue(name) {
    return valueOf(this, propertyName(name));
  },
  getPropertyPriority(name) {
    return priorityOf(this, name);
  },
  removeProperty(name) {
    return removePropertyOf(this, name);
  },
};
const LEGACY_METHODS = {
  A: {
    ...LEGACY_SHARED,
    item(index) {
      return index === undefined && arguments.length === 0 ? undefined : itemOf(this, index);
    },
    setProperty(name, value, priority) {
      if (value !== undefined) setPropertyOf(this, name, value, priority);
    },
    getPropertyCSSValue() {},
    getPropertyShorthand() {},
    isPropertyImplicit() {},
  },
  D: {
    ...LEGACY_SHARED,
    item() {
      if (arguments.length === 0) tooFew('item', 1, 0);
      return itemOf(this, arguments[0]);
    },
    setProperty(name, value, priority = '') {
      if (value === undefined) {
        if (arguments.length === 0) tooFew('setProperty', 2, 0);
        return;
      }
      setPropertyOf(this, name, value, priority);
    },
  },
};
LEGACY_METHODS.F = LEGACY_METHODS.D;
LEGACY_METHODS.E = {
  ...LEGACY_METHODS.D,
  setProperty(name, value, priority) {
    if (value === undefined) {
      if (arguments.length === 0) tooFew('setProperty', 2, 0);
      return;
    }
    setPropertyOf(this, name, value, priority);
  },
};
// The accessors' descriptors (built for the variant) with the members
// added, rather than 1,600 accessors copied into the members'.
function legacyDeclaration(members, surfaceKey) {
  const group = LEGACY_GROUPS[surfaceKey];
  const enumerable = group === 'A';
  const descriptors = styleDescriptors(surfaceKey);
  if (!enumerable && descriptors.cssFloat) descriptors.cssFloat = { ...descriptors.cssFloat, enumerable: false };
  for (const key of ['cssText', 'length', 'parentRule']) descriptors[key] = { ...members[key], enumerable };
  const methods = LEGACY_METHODS[group];
  for (const key of Object.keys(methods))
    descriptors[key] = { value: methods[key], writable: true, enumerable, configurable: true };
  // No @@iterator (nor @@toStringTag: untagged).
  for (const key of Reflect.ownKeys(members))
    if (typeof key !== 'symbol' && !(key in descriptors)) descriptors[key] = members[key];
  return descriptors;
}

export const CSS_INTERFACES = [
  {
    name: 'CSSStyleDeclaration',
    slot: [S, STYLE_SLOT.descriptor],
    members: {
      get cssText() {
        const s = styleState(this);
        return serialize(s.decls, s.mode);
      },
      set cssText(text) {
        const s = styleState(this);
        if (s.computed) {
          if (!mutableComputed(s)) readOnly();
          const decls = new Map();
          parseInto(decls, text, s.mode, s.surface);
          s.overrides = new Map([...decls].map(([name, { value }]) => [name, value]));
          s.replaced = true;
          return;
        }
        parseInto(s.decls, text, s.mode, s.surface, s.parentRule ? 'rule' : null, !s.parentRule);
        if (s.decls.box !== undefined) replayBox(s.decls, s.decls.box);
        reindex(this);
        sync(this);
      },
      get length() {
        return styleState(this).decls.size;
      },
      get parentRule() {
        return styleState(this).parentRule ?? null;
      },
      item(index) {
        if (index === undefined && arguments.length === 0) tooFew('item', 1, 0);
        return itemOf(this, index);
      },
      // Iterable as an indexed collection (WebIDL): Array.prototype.values.
      [Symbol.iterator]: Array.prototype.values,
      getPropertyValue(name) {
        if (name === undefined && arguments.length === 0) tooFew('getPropertyValue', 1, 0);
        return valueOf(this, propertyName(name));
      },
      getPropertyPriority(name) {
        if (name === undefined && arguments.length === 0) tooFew('getPropertyPriority', 1, 0);
        return priorityOf(this, name);
      },
      setProperty(name, value, priority = '') {
        if (value === undefined && arguments.length < 2) tooFew('setProperty', 2, arguments.length);
        setPropertyOf(this, name, value, priority);
      },
      removeProperty(name) {
        if (name === undefined && arguments.length === 0) tooFew('removeProperty', 1, 0);
        return removePropertyOf(this, name);
      },
    },
    // jsdom 28 and earlier: the style accessors are CSSStyleDeclaration's
    // (legacyDeclaration); the variant is the profile's style surface.
    variant: (compat) => (compat.jsdom < 29 ? compat.styleSurface : null),
    adjust: legacyDeclaration,
    untagged: (compat) => compat.jsdom < 29,
  },
  {
    name: 'CSSStyleProperties',
    parent: 'CSSStyleDeclaration',
    // About 1,600 accessors: their property descriptors are built directly,
    // the first time a window creates the interface; per style surface.
    descriptors: propertiesDescriptors,
    variant: (compat) => compat.styleSurface,
    // jsdom 28 and earlier have no CSSStyleProperties: style objects are
    // CSSStyleDeclarations with the accessors (legacyDeclaration).
    alias: (compat) => (compat.jsdom < 29 ? 'CSSStyleDeclaration' : null),
  },
  { name: 'CSSPageDescriptors', parent: 'CSSStyleDeclaration', descriptors: pageDescriptors },
];

// A declaration block owned by a CSS rule (CSSStyleRule.style, ...).
// mode: 'page' for an @page rule's descriptors; page: how they take a
// repeated !important one (parseInto), as the window's style rules do:
// lastWins (its rules before jsdom 27.1.0) and styleProto, the window's
// CSSStyleProperties prototype, whose style surface tells the lookup.
export function declarationBlock(proto, text, parentRule, mode = modeOf(proto), context = 'sheet', page = null) {
  const style = Object.create(proto);
  const decls = new Map();
  if (page !== null) {
    if (page.lastWins) decls.pageLastWins = true;
    else if (surfaceOf(page.styleProto)?.importantByWrittenName === true) decls.pageWrittenKeys = true;
  }
  initStyleState(style, {
    element: null,
    decls,
    parentRule,
    mode,
    indexed: 0,
    surface: mode === 'page' ? null : surfaceOf(proto),
  });
  parseInto(styleState(style).decls, text, styleState(style).mode, styleState(style).surface, context);
  reindex(style);
  return style;
}

// A style rule's declarations from its cssom style object's (cssom.js
// cssomStyle: before jsdom 27.1.0), as jsdom's cascade makes them: each
// [name, value, important] given on its own to cssstyle's setProperty, in
// order, so a later one replaces an earlier one whatever their priority
// and is applied after the others (black box 20.0.3 to 27.0.1: color: red
// !important; COLOR: blue gives blue; border: 1px solid red;
// border-left-width: 2px; BORDER: 3px solid blue a 3px left border), and a
// value that is not one declaration is invalid (color: red; display: none
// sets neither). A custom property's value is kept as written (--x: a;b).
// An empty value is left out: in jsdom it removes the property, also as
// earlier rules declare it (one cssstyle declaration for all of them),
// which warpdom's per-rule cascade does not model. The caller reports the
// change.
const PLAIN_NAME = /^-?[A-Za-z][-A-Za-z0-9]*$/;
// ( ) / : ; ! @ { }: characters cssom's parser handles before a value
// without starting it.
const ODD_START = new Set([40, 41, 47, 58, 59, 33, 64, 123, 125]);
// Whether a rule's declarations parsed in context 'cssom' kept every one
// it read, each part of the text a declaration.
export const parsedPlain = (style) => styleState(style).decls.plain === true;

export function replayDeclarations(style, entries) {
  const s = styleState(style);
  const decls = s.decls;
  decls.clear();
  // Those that are one declaration each, parsed at once: as text, each is
  // one part (replay: applied in order, the last one last). Not one: a
  // ';' outside strings and parentheses, an unclosed string, parenthesis
  // or comment, or a name no property has.
  // An empty value removes what this rule declared of that name (its
  // longhands stay, as in cssstyle: margin-left: 2px; MARGIN: '' keeps
  // 2px); custom properties are kept as written. Both in order, after the
  // text so far.
  let text = '';
  const flush = () => {
    if (text !== '') parseInto(decls, text, s.mode, s.surface, 'replay');
    text = '';
  };
  for (const [name, value, important] of entries) {
    if (name.startsWith('--')) {
      flush();
      decls.delete(name);
      if (value !== '') decls.set(name, { value, important });
      continue;
    }
    if (value === '') {
      flush();
      decls.delete(propertyName(name));
      continue;
    }
    // A name no property has (a(b, ;color: cssstyle drops it) may not
    // join the text.
    if (!PLAIN_NAME.test(name)) continue;
    if (/["'(/]/.test(value) && unclosedLegacy(value)) continue;
    if (value.includes(';') && splitOutside(value, ';').length !== 1) continue;
    text += `${name}: ${value}${important ? ' !important' : ''};`;
  }
  flush();
  reindex(style);
}

export const serializeDeclarations = (style) => serialize(styleState(style).decls, styleState(style).mode);

// The element's style object, created on first use from its style attribute.
export function styleOf(element, proto) {
  const es = state(element);
  if (!es.style) {
    const style = Object.create(proto);
    const decls = new Map();
    // (An inline style's margin and padding, box-declarations.js; its
    // fields set here in one order, so all such maps have one shape.)
    decls.box = boxVariant(modeOf(proto));
    decls.boxed = false;
    decls.hidden = undefined;
    decls.rev = 0;
    decls.order = 0;
    initStyleState(style, { element, decls, mode: modeOf(proto), indexed: 0, surface: surfaceOf(proto) });
    parseInto(decls, es.attrs.get('style'), styleState(style).mode, styleState(style).surface, null, true);
    if (decls.box !== undefined) replayBox(decls, decls.box);
    reindex(style);
    es.style = style;
  }
  return es.style;
}

// Called when the style attribute is set or removed directly. Set to the
// text the style last wrote (sync), the declarations stay as they are
// (black box, jsdom 27.4.0 and 28.1.0: after style.color = 'red' and
// style.setProperty('border', 'var(--b)'), setting the attribute to its
// own value keeps both, though parsed it declares nothing); any other
// text is parsed, and the written text no longer stands for the
// declarations (writtenDeclarations).
// With cssstyle 4.4 to 4.6 (escapedUrlBackground, black box, #163 review)
// the attribute is parsed when set, before the style is first read, so its
// url()s are met then; set to the value it had, it is not parsed again.
// Only HTML and SVG elements have an inline style (interfaces.js
// inlineStyle); the HTML and XML parsers call this for a parsed style
// attribute with a backslash (html.js, xml.js).
export function styleAttributeChanged(element, old) {
  const es = element[S];
  const text = es.attrs.get('style');
  if (es.styleWritten !== undefined && es.styleWritten === text) return;
  const proto = es.doc?.[S]?.window?.[S]?.protos.CSSStyleProperties;
  const metAtWrite = modeOf(proto) === 'jsdom26' && surfaceOf(proto)?.key === 'cssstyle4.4';
  if (metAtWrite && text === old) return;
  es.styleWritten = undefined;
  if (!es.style && metAtWrite && text?.includes('\\') && (es.ns === HTML_NS || es.ns === SVG_NS))
    styleOf(element, proto);
  else if (es.style) {
    const s = styleState(es.style);
    parseInto(s.decls, text, s.mode, s.surface, null, true);
    if (s.decls.box !== undefined) replayBox(s.decls, s.decls.box);
    reindex(es.style);
    es.inlineCascade = null;
  }
}

// The element's declarations as its style object holds them, when the
// style attribute is the text a style write serialized from them (sync),
// else null. cascade.js parses that text again, as jsdom computes from
// it (background: url(a.png) center, written url("a.png") center center,
// loses its position in jsdom 27 to 29), but without dropping border
// declarations with var() (borderVarDrops: style.setProperty('border',
// 'var(--b)') after style.color keeps the color, black box 27.4.0 and
// 28.1.0), and takes from these the declarations that lost their
// !important (masked), which the text does not show.
export function writtenDeclarations(element, text) {
  const es = element[S];
  return es.style && es.styleWritten === text ? styleState(es.style).decls : null;
}

// The text cascade.js parses for an element's written style attribute
// (text, the serialization of decls), as jsdom computes from the
// declarations it holds (#260 review; black box 20.0.3 to 30.1.3):
// - a margin or padding that mixes a CSS-wide keyword with other values
//   (margin: inherit 1px 1px after style.margin = '1px';
//   style.marginTop = 'inherit'), which a declaration list rejects though
//   the style object holds it: from jsdom 27 its longhands as they are
//   (the shorthand left out), with jsdom 26 its four sides at its place.
//   jsdom 20 to 25 reject it there too;
// - join (jsdom 27): the four longhands without their shorthand, one with
//   var() but the last listed (style.marginTop = 'var(--m)' after
//   style.margin = '1px'): the shorthand they make at the first one's
//   place, which jsdom 27 computes empty (28 and later compute each
//   longhand, and 27 does when the last one has the var()).
export function cascadeText(decls, text, join = false) {
  const box = decls.box;
  if (decls.boxed !== true || box === 'A' || box === 'B') return text;
  const joined = join && !decls.has('margin') && decls.has('margin-top') ? varGroup(decls, 'margin') : null;
  const joinedPadding = join && !decls.has('padding') && decls.has('padding-top') ? varGroup(decls, 'padding') : null;
  const mixed = mixedBoxKeyword(decls);
  if (joined === null && joinedPadding === null && mixed === null) return text;
  let out = '';
  const add = (name, value, important) =>
    (out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`);
  const cover = box === 'C' || box === 'D' ? boxCover(decls) : null;
  if (cover !== null && mixed !== null) for (const name of mixed) cover[name] = -1;
  let i = -1;
  for (const [name, { value, important }] of decls) {
    i++;
    if (cover !== null && coveredBy(cover, name, i, important)) continue;
    let group = null;
    if (name.startsWith('margin-')) group = joined;
    else if (name.startsWith('padding-')) group = joinedPadding;
    if (group !== null && BOX_LONGHANDS[group.name].includes(name)) {
      if (name === group.first) add(group.name, group.value, group.important);
    } else if (mixed?.includes(name)) {
      if (box === 'B6') {
        const [a, b = a, c = a, d = b] = parts(value);
        const sides = [a, b, c, d];
        BOX_LONGHANDS[name].forEach((longhand, k) => add(longhand, sides[k], important));
      }
    } else add(name, value, important);
  }
  return out;
}
const MIXED_KEYWORD = /(?:^| )(?:inherit|initial|unset|revert|revert-layer)(?: |$)/i;
const CSS_WIDE = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
// (A keyword among the top-level components: margin: inherit
// calc(100% - 2px) 1px too, #260 review.)
const isMixedKeyword = (value) =>
  value.includes(' ') &&
  MIXED_KEYWORD.test(value) &&
  (!value.includes('(') || parts(value).some((part) => CSS_WIDE.test(part)));
// The box shorthands listed with such a value, or null.
function mixedBoxKeyword(decls) {
  const margin = decls.get('margin');
  const padding = decls.get('padding');
  const m = margin !== undefined && isMixedKeyword(margin.value);
  const p = padding !== undefined && isMixedKeyword(padding.value);
  if (m) return p ? MIXED_BOTH : MIXED_MARGIN;
  return p ? MIXED_PADDING : null;
}
const MIXED_BOTH = ['margin', 'padding'];
const MIXED_MARGIN = ['margin'];
const MIXED_PADDING = ['padding'];
// The four longhands of a shorthand, all listed with one priority and one
// with var(): the shorthand they make, or null.
function varGroup(decls, shorthand) {
  const values = [];
  let first = null;
  let important;
  let withVar = false;
  for (const longhand of BOX_LONGHANDS[shorthand]) {
    const decl = decls.get(longhand);
    if (decl === undefined || (important !== undefined && decl.important !== important)) return null;
    important = decl.important;
    values.push(decl.value);
    if (decl.value.includes('var(')) withVar = true;
  }
  if (!withVar) return null;
  // (jsdom 27 sets them again in order, and the last one set merges them
  // unless it has var() itself.)
  let last = null;
  for (const name of decls.keys())
    if (BOX_LONGHANDS[shorthand].includes(name)) {
      first ??= name;
      last = name;
    }
  if (decls.get(last).value.includes('var(')) return null;
  return { name: shorthand, value: serializeBox(values), important, first };
}

// A style attribute's declarations as parsed for the cascade (cascade.js),
// from jsdom 27: a margin or padding with one of its longhands is replayed
// as the style object holds them (replayBox), so a longhand before the
// shorthand in the prepared list is lost there too (margin: 2px;
// margin-top: 4px computes 2px; black box 27.4.0 to 30.1.3, #260
// review). Before 27 the attribute is read in order, as parsed.
export function parsedBox(decls, mode) {
  if (mode !== 'jsdom27' && mode !== 'spec') return;
  const margin = decls.has('margin');
  const padding = decls.has('padding');
  if (!margin && !padding) return;
  let longhand = false;
  let important = false;
  for (const [name, decl] of decls) {
    const shorthand = BOX_SHORTHAND[name];
    if (shorthand !== undefined && (shorthand === 'margin' ? margin : padding)) longhand = true;
    if (decl.important || decl.masked === true)
      important ||= shorthand !== undefined || BOX_LONGHANDS[name] !== undefined;
  }
  if (!longhand) return;
  // Without !important the shorthand comes last in the prepared list and
  // sets every side: its longhands are left out (as replayBox ends), but
  // for all four listed, which the prepared list joins into the shorthand
  // (margin: 0; margin-top: 1px; ... margin-left: 4px computes 1px 2px
  // 3px 4px, #260 review).
  if (!important && !allSides(decls, margin, 'margin') && !allSides(decls, padding, 'padding')) {
    for (const name of [...decls.keys()]) {
      const shorthand = BOX_SHORTHAND[name];
      if (shorthand !== undefined && (shorthand === 'margin' ? margin : padding)) decls.delete(name);
    }
    return;
  }
  replayBox(decls, boxVariant(mode));
}
const allSides = (decls, listed, shorthand) => listed && BOX_LONGHANDS[shorthand].every((name) => decls.has(name));
