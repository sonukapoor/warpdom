// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import { S, state, hiddenSlot, domError, ELEMENT_NODE, cssomChanges, attributesChanged, hooks } from './internal.js';
import { STYLE_ACCESSORS } from './css-properties.js';
import { SURFACES } from './style-surface.js';
import { LONGHANDS, SHORTHANDS, COLOR_SHORTHANDS, ALIASES } from './css-data.js';
import { isValidValue } from './css-values.js';
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

// backgroundColor -> background-color, webkitAnimation/WebkitAnimation ->
// -webkit-animation, cssFloat -> float; dashed names map to themselves.
function cssName(accessor) {
  if (accessor === 'cssFloat') return 'float';
  if (accessor.includes('-')) return accessor;
  const dashed = accessor.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return /^(webkit|-webkit)-/.test(dashed) ? `-${dashed.replace(/^-/, '')}` : dashed;
}

// Split on `sep` outside parentheses and quotes (url(data:...;base64,...)).
function splitOutside(text, sep) {
  const parts = [];
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
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
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
// border-image shorthand.
const COMMA_FUNCTIONS = /^(min|max|clamp|(-webkit-)?(repeating-)?(linear|radial|conic)-gradient)$/i;
function functionArguments(value) {
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
    if (COMMA_FUNCTIONS.test(name)) {
      const args = splitOutside(functionArguments(inner), ',').map((a) => a.trim());
      inner = (/gradient$/i.test(name) ? args.map(serializeColors) : args).join(', ');
    }
    out += `(${inner}${close < value.length ? ')' : ''}`;
    i = close;
  }
  return out;
}

// url() serialized with a quoted string, as jsdom does for these
// properties (jsdom 26: the background ones); in 'jsdom25' mode (cssstyle
// before 4.3.1) the background ones without quotes: url(a.png).
const QUOTED_URLS = {
  spec: new Set(['background', 'background-image', 'content', 'list-style-image', 'mask-image', 'filter']),
  jsdom26: new Set(['background', 'background-image']),
};
QUOTED_URLS.jsdom27 = QUOTED_URLS.spec;
const UNQUOTED_URLS = { jsdom25: QUOTED_URLS.jsdom26, jsdom22: QUOTED_URLS.jsdom26, jsdom20: QUOTED_URLS.jsdom26 };
const URL_FUNCTION = /\burl\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^"'()\s]*))\s*\)/gi;
function quoteUrls(value) {
  return value.replace(URL_FUNCTION, (m, dq, sq, raw) => {
    if (dq !== undefined) return `url("${dq}")`;
    const text = sq ?? raw;
    return `url("${text.replace(/(^|[^\\])"/g, '$1\\"')}")`;
  });
}
const unquoteUrls = (value) => value.replace(URL_FUNCTION, (m, dq, sq, raw) => `url(${dq ?? sq ?? raw})`);

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
// 27 to 29) is 'spec' with jsdom 26's border and clip (borderValue,
// clipValue). The properties each profile knows are its style surface
// (styleSurface), not its mode.
export const isLegacyMode = (mode) =>
  mode === 'jsdom26' || mode === 'jsdom25' || mode === 'jsdom22' || mode === 'jsdom20';
const isSpecMode = (mode) => mode === 'spec' || mode === 'jsdom27';
const modes = new WeakMap(); // CSSStyleProperties prototype -> mode
const surfaces = new WeakMap(); // CSSStyleProperties prototype -> styleSurface (profiles before jsdom 30.1)
// surfaceKey: the profile's style surface (src/style-surface.js), or null
// for jsdom 30.1 and later. The prototype was built with the surface's
// accessors (styleDescriptors): jsdom 26 with cssstyle 4.6 has no
// style.webkitUserSelect, and assigning it creates an own data property
// (react-spectrum's usePress tests save and restore it that way); cssstyle
// 2 to 4.3 write it as webkit-user-select.
// fontVariant: cssstyle's font shorthand before 4.4 ('cssstyle4.1' or
// 'cssstyle4.2', see legacyFont in shorthands.js), or null. colors: how
// its cssstyle writes color keywords ('css2', 'written' or null, see
// colorKeywords).
export function setValidationMode(proto, mode, surfaceKey = null, fontVariant = null, colors = null) {
  modes.set(proto, mode);
  if (surfaceKey !== null)
    surfaces.set(
      proto,
      fontVariant === null && colors === null
        ? styleSurface(surfaceKey)
        : variantSurface(surfaceKey, fontVariant, colors),
    );
}

// A style surface with cssstyle's font shorthand before 4.4, or its color
// keywords before 4.6: the same names, its own declared value caches.
const variantSurfaces = new Map();
function variantSurface(key, variant, colors) {
  const id = `${key} ${variant} ${colors}`;
  let surface = variantSurfaces.get(id);
  if (surface === undefined) {
    surface = { ...styleSurface(key), caches: Object.create(null), colors };
    if (variant !== null) surface.legacyFont = variant;
    variantSurfaces.set(id, surface);
  }
  return surface;
}
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
    if (mode === 'page') out = pageDescriptorValue(name, value);
    else if (surface !== null && surface.extras.has(name))
      out = name === 'azimuth' ? azimuthValue(value, surface) : value;
    else if (!isKnownProperty(name)) out = INVALID;
    else if (isLegacyFont(surface, name))
      out = /^inherit$/i.test(value) ? INVALID : (legacyFont(value, surface.legacyFont) ?? INVALID);
    else {
      out = versionedValue(name, value, mode, surface);
      if (out === undefined) {
        const checked = isSpecMode(mode) || JSDOM26_VALIDATED.has(name);
        out = !checked || isValidValue(name, value) ? serializeDeclared(name, value, mode) : INVALID;
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
function versionedValue(name, value, mode, surface) {
  if (isLegacyMode(mode)) {
    const lower = value.toLowerCase();
    const kind = CSS_WIDE_KEYWORD.test(value)
      ? lower
      : lower === 'auto'
        ? 'auto'
        : lower.includes('var(')
          ? 'var'
          : null;
    if (kind !== null && droppedBy(mode, kind, name)) return INVALID;
    // cssstyle before 4.4 keeps currentColor, border-spacing: 0 and a
    // border width of 0 as written; before 4.3.1 border-color lowercased.
    if (colorKeywords === 'css2') {
      if (lower === 'currentcolor' && isColorProperty(name)) return value;
      if ((name === 'border-spacing' || BORDER_WIDTHS.has(name)) && ZERO.test(value)) return value;
      if (name === 'border-color' && mode !== 'jsdom26')
        return isValidValue(name, value) && !rejectsColor(name, value, null) ? lower : INVALID;
    }
  }
  if ((mode === 'jsdom26' || mode === 'jsdom27') && name === 'border-style' && value.toLowerCase() === 'none')
    return INVALID;
  // jsdom 30 writes a single-number aspect-ratio as a ratio.
  if (mode === 'spec' && name === 'aspect-ratio' && /^\+?(\d+\.?\d*|\.\d+)$/.test(value)) return `${Number(value)} / 1`;
  if (
    (mode === 'jsdom20' || mode === 'jsdom22') &&
    (name.startsWith('margin') || name.startsWith('padding')) &&
    /calc\(/i.test(value)
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
// versions serialize them (black box; cssstyle in jsdom 20 to 26):
// - jsdom 30 ('spec'): the shortest form, width style color, without
//   initial values (medium, none, currentcolor); all initial is medium.
// - jsdom 26 to 29: width style color, a 0 width as 0px; on border a none
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
  const keyword = CSS_WIDE_KEYWORD.test(value);
  if (keyword) return mode === 'spec' ? value.toLowerCase() : INVALID;
  const legacy = isLegacyMode(mode) && mode !== 'jsdom26';
  if (/var\(|env\(|attr\(/i.test(value)) return legacy ? INVALID : value;
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
      if (side && mode !== 'spec' && (lower === 'none' || (lower === 'hidden' && !legacy))) {
        width = color = null;
        style = '';
      } else style = token;
    } else if (BORDER_WIDTH.test(token)) width = token;
    else color = token;
  }
  if (style === '') style = null;
  if (mode === 'spec') {
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
const legacyLength = (token, surface, old) => {
  if (!old) return BG_LENGTH_4.test(token.toLowerCase());
  return surface?.legacyFont === 'cssstyle4.1' ? BG_LENGTH_3.test(token) : BG_LENGTH_4.test(token);
};
function backgroundValue(value, mode, surface) {
  if (/var\(|env\(|attr\(/i.test(value) || CSS_WIDE_KEYWORD.test(value)) return undefined;
  const legacy = isLegacyMode(mode);
  // jsdom 27 and later: math functions (calc(10px + 5%) is calc(5% + 10px)
  // in jsdom 30, rejected before) are left to the general rules.
  if (!legacy && /(calc|min|max|clamp)\(/i.test(value.replace(URL_FUNCTION, 'url()'))) return undefined;
  // The grammar first, as for other properties in these modes.
  if (!legacy && !isValidValue('background', value)) return INVALID;
  const old = legacy && colorKeywords === 'css2'; // cssstyle before 4.4
  if (splitOutside(value, ',').length > 1) return legacy ? INVALID : undefined;
  const tokens = [];
  for (const token of segments(value).filter((t, i) => i % 2 === 0 && t !== '')) {
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
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    const gradient = BG_GRADIENT.test(token);
    if (lower === 'none' || token.startsWith('url(') || (!legacy && /^url\(/i.test(token)) || gradient) {
      // Gradients from cssstyle 4 (jsdom 23.1 and later; measured: 4.3.0).
      if (gradient && (mode === 'jsdom20' || mode === 'jsdom22')) return INVALID;
      if (lower === 'none' && token !== 'none' && !legacy) return undefined;
      // cssstyle rejects a url() with a parenthesis inside (url("a(b).png")).
      if (legacy && /^url\(.*[()].*\)$/.test(token)) return INVALID;
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
  const image = found.image === null ? null : serializeDeclared('background-image', found.image, mode);
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
  return parts.length ? parts.join(' ') : undefined;
}

// clip: auto, or rect() with comma-separated lengths (0 is 0px). jsdom 30
// keeps only the first of space-separated lengths (rect(0 0 0 0) is
// rect(0px)); jsdom 20 to 29 drop them, and auto inside rect().
function clipValue(value, mode) {
  const m = /^rect\(\s*(.*?)\s*\)$/i.exec(value);
  if (!m) return undefined;
  const commas = m[1].includes(',');
  const args = (commas ? m[1].split(',') : m[1].split(/\s+/)).map((a) => a.trim());
  if (args.some((a) => !/^(auto|0|[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?[a-z]+)$/i.test(a))) return undefined;
  if (args.length !== 4) return INVALID;
  if (mode !== 'spec' && (!commas || args.some((a) => a.toLowerCase() === 'auto'))) return INVALID;
  const zero = (a) => (ZERO.test(a) ? '0px' : a);
  return commas ? `rect(${args.map(zero).join(', ')})` : `rect(${zero(args[0])})`;
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
  if (keywords.length < 2) return value;
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
  if (/var\(|env\(|attr\(/i.test(value)) return value;
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
  // gradient written over several lines).
  if (mode === 'jsdom26' && (name === 'background' || name === 'background-image') && /\s\s|[\t\n\r\f]/.test(value))
    value = collapseSpaces(value);
  if (value.includes('(')) {
    if (isSpecMode(mode) && name !== 'border-image' && /(min|max|clamp|gradient)\(/i.test(value))
      value = functionArguments(value);
    // jsdom 27 and later keep url() as written in a value with var().
    if (QUOTED_URLS[mode]?.has(name) && !(isSpecMode(mode) && /var\(/i.test(value))) value = quoteUrls(value);
    else if (UNQUOTED_URLS[mode]?.has(name)) value = unquoteUrls(value);
    return name === 'background' || name === 'background-image' ? familyCommas(value) : value;
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

function parseInto(decls, text, mode, surface = null) {
  decls.clear();
  // A normal declaration does not override an important one for the same
  // property, or a longhand of an important shorthand (CSS Cascade), as in
  // jsdom 27 and later; jsdom 26 let the last one win.
  let covered = null;
  // jsdom 20 to 26 (cssstyle 2.3.0 to 4.6.0, black box; #129) read a name
  // up to the next colon and a value from the first character after the
  // colon and its spaces, semicolons included: an empty declaration runs
  // on into the next one, which is lost with it (;color: red and x;color:
  // red declare nothing, color:;;margin: 0 neither, --x:;color: red is --x
  // with the value ;color: red).
  const runsOn = isLegacyMode(mode);
  let carried = null;
  for (let part of splitOutside(String(text ?? ''), ';')) {
    if (carried !== null) {
      part = `${carried};${part}`;
      carried = null;
    }
    const colon = part.indexOf(':');
    if (colon < 0) {
      if (runsOn) carried = part;
      continue;
    }
    const name = propertyName(part.slice(0, colon).trim());
    let value = part.slice(colon + 1).trim();
    if (runsOn && (value === '' || (value[0] === ';' && /^[\s;]*$/.test(value)))) {
      carried = part;
      continue;
    }
    let important = false;
    const bang = value.match(/\s*!\s*important\s*$/i);
    if (bang) {
      important = true;
      value = value.slice(0, bang.index).trim();
    }
    if (!name || !value || dropped(surface, name)) continue;
    if (isLegacyFont(surface, name) && /^inherit$/i.test(value)) {
      removeLegacyFont(decls, surface);
      continue;
    }
    const declared = declaredValue(name, value, mode, surface);
    if (declared === INVALID) continue;
    if (!isLegacyMode(mode)) {
      if (!important && (covered?.has(name) || decls.get(name)?.important)) continue;
      if (important && SHORTHANDS[name]) for (const longhand of SHORTHANDS[name]) (covered ??= new Set()).add(longhand);
    }
    if (MERGEABLE.has(name)) decls.mergeable = true;
    if (isLegacyFont(surface, name)) removeLegacyFont(decls, surface, false);
    decls.set(name, { value: declared, important });
  }
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
export function parseDeclarations(text, mode, surface = null) {
  const decls = new Map();
  parseInto(decls, text, mode, surface);
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
  if (decls.mergeable === true && decls.size >= 2)
    for (const [shorthand, longhands] of MERGED[mode]) {
      const first = decls.get(longhands[0]);
      if (first === undefined || !longhands.every((l) => decls.get(l)?.important === first.important)) continue;
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
  if (merged === null) {
    for (const [name, { value, important }] of decls)
      out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
    return out;
  }
  for (const [name, decl] of decls) {
    let { value, important } = decl;
    let written = name;
    const m = merged.get(name);
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
function sync(style) {
  const s = styleState(style);
  const element = s.element;
  if (element) {
    const es = element[S];
    const observing = es.doc[S].observerCount > 0;
    const old = observing || hooks.ce !== null ? es.attrs.get('style') : undefined;
    const value = serialize(s.decls, s.mode);
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
    // Text up to the matching closing parenthesis.
    let depth = 1;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
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
// sets position on the result of getComputedStyle). jsdom before 28 let
// any write change that one object; since 28, setting a property changes
// that object and the element's computed value until its document
// changes, and the methods throw as the standard says.
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
    // As on el.style (black box, jsdom 20 to 27.4): an empty value removes
    // the property, an invalid one is ignored, others are serialized.
    const text = raw === '' ? '' : declaredValue(name, raw, s.mode, s.surface);
    if (text !== INVALID) (s.overrides ??= new Map()).set(name, text);
    return;
  }
  // Removing a declaration from a computed style throws, as in jsdom 28+.
  if (raw === '') readOnly();
  const text = declaredValue(name, raw, s.mode, s.surface);
  if (text === INVALID) return;
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

function setDeclaration(style, name, value, priority = '') {
  const s = styleState(style);
  if (s.computed) {
    if (!mutableComputed(s)) readOnly();
    writeComputed(s, name, value);
    return;
  }
  // [LegacyNullToEmptyString]: null removes the declaration; undefined is
  // the string "undefined", an invalid value (as in jsdom).
  let raw = value === null ? '' : String(value).trim();
  if (isLegacyFont(s.surface, name) && /^inherit$/i.test(raw)) raw = '';
  // The style attribute is updated only when a declaration changed (CSSOM).
  if (raw === '') {
    if (isLegacyFont(s.surface, name) ? removeLegacyFont(s.decls, s.surface) : s.decls.delete(name)) {
      reindex(style);
      sync(style);
    }
    return;
  }
  // Unknown properties and invalid values are ignored (CSSOM).
  const text = declaredValue(name, raw, s.mode, s.surface);
  if (text === INVALID) return;
  const important = String(priority).toLowerCase() === 'important';
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
  const old = s.decls.get(name);
  if (old && old.value === text && old.important === important) return;
  if (old === undefined && MERGEABLE.has(name)) s.decls.mergeable = true;
  s.decls.set(name, { value: text, important });
  if (old === undefined) defineIndex(style, s.indexed++, name);
  sync(style);
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
    if (surface === null) descriptors[accessor] = styleAccessor(name);
    else if (!missing(surface, accessor, name))
      descriptors[accessor] = styleAccessor(surface.writes.get(accessor) ?? name);
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
  const value = valueOf(style, name);
  // cssstyle 4.4 and later (jsdom 26): the margin and padding accessors
  // read the shortest form, getPropertyValue() and cssText as written.
  return (name === 'margin' || name === 'padding') && isLegacyMode(s.mode) && s.surface?.colors !== 'css2'
    ? shortestBox(value)
    : value;
}
function styleAccessor(name) {
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
      else setDeclaration(this, name, value);
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
const priorityOf = (style, name) => (styleState(style).decls.get(propertyName(name))?.important ? 'important' : '');
function setPropertyOf(style, name, value, priority) {
  const key = propertyName(name);
  if (dropped(styleState(style).surface, key)) return;
  setDeclaration(style, key, value, priority == null ? '' : priority);
}
function removePropertyOf(style, name) {
  const key = propertyName(name);
  const s = styleState(style);
  const previous = s.computed
    ? mutableComputed(s)
      ? valueOf(style, key)
      : readOnly()
    : (s.decls.get(key)?.value ?? '');
  setDeclaration(style, key, '');
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
        parseInto(s.decls, text, s.mode, s.surface);
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
// mode: 'page' for an @page rule's descriptors.
export function declarationBlock(proto, text, parentRule, mode = modeOf(proto)) {
  const style = Object.create(proto);
  initStyleState(style, {
    element: null,
    decls: new Map(),
    parentRule,
    mode,
    indexed: 0,
    surface: mode === 'page' ? null : surfaceOf(proto),
  });
  parseInto(styleState(style).decls, text, styleState(style).mode, styleState(style).surface);
  reindex(style);
  return style;
}

export const serializeDeclarations = (style) => serialize(styleState(style).decls, styleState(style).mode);

// The element's style object, created on first use from its style attribute.
export function styleOf(element, proto) {
  const es = state(element);
  if (!es.style) {
    const style = Object.create(proto);
    initStyleState(style, { element, decls: new Map(), mode: modeOf(proto), indexed: 0, surface: surfaceOf(proto) });
    parseInto(styleState(style).decls, es.attrs.get('style'), styleState(style).mode, styleState(style).surface);
    reindex(style);
    es.style = style;
  }
  return es.style;
}

// Called when the style attribute is set or removed directly.
export function styleAttributeChanged(element) {
  const es = element[S];
  if (es.style) {
    const s = styleState(es.style);
    parseInto(s.decls, es.attrs.get('style'), s.mode, s.surface);
    reindex(es.style);
  }
}
