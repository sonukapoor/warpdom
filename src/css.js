// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import { S, state, hiddenSlot, domError, ELEMENT_NODE, cssomChanges, attributesChanged, hooks } from './internal.js';
import { STYLE_ACCESSORS } from './css-properties.js';
import { SURFACES } from './style-surface.js';
import { LONGHANDS, SHORTHANDS, COLOR_SHORTHANDS, ALIASES } from './css-data.js';
import { isValidValue } from './css-values.js';
import { expand, segments, serializeBox, serializeFont, positionLayers, legacyFont, LEGACY_FONT_LONGHANDS } from './shorthands.js';
import { resolveColor } from './colors.js';

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
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
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
    result = name !== 'box-shadow' && name !== 'text-shadow' && (LONGHANDS[name]?.[2] === 1 || COLOR_SHORTHANDS.includes(name));
    holdsColors.set(name, result);
  }
  return result;
}

// Serialized color values by raw value: the same few strings are written
// over and over (style.color = '#f00' on every render).
const colorCache = new Map();
function declaredColors(value) {
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
    if (lower[0] === '#' || /^(rgba?|hsla?)\(/.test(lower)) parts[i] = resolveColor(token) ?? token;
    else if (resolveColor(lower) !== null || lower === 'currentcolor') parts[i] = lower;
  }
  return parts.join('');
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
    if (c !== '(') { out += c; continue; }
    let depth = 0, close = i;
    for (let quote = null; close < value.length; close++) {
      const d = value[close];
      if (quote) { if (d === '\\') close++; else if (d === quote) quote = null; continue; }
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
const familyCommas = (value) => (value.includes(',') ? splitOutside(value, ',').map((f) => f.trim()).join(', ') : value);

// Numbers and dimensions at the top level serialize canonically (CSSOM):
// .5 -> 0.5, 10.0px -> 10px, +1 -> 1. Not inside functions. Integers keep
// all their digits (CSSOM: never in scientific notation).
const INTEGER = /^[+-]?\d+$/;
const integerText = (text) => text.replace(/^\+/, '').replace(/^(-?)0+(?=\d)/, '$1').replace(/^-0$/, '0');
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

// Validation modes (css-values.js): 'spec' checks every property's grammar,
// as jsdom 27 and later do; 'jsdom26' only the properties jsdom 26 checked,
// without numeric ranges. A window's mode is set on its CSSStyleProperties
// prototype, and each declaration block records it when created. (Of the
// properties jsdom 26 checked, flex-basis, border-spacing, font-weight and
// font-variant accepted values outside their ranges; they are left out, and
// flex is checked although jsdom 26 took a negative basis.)
const JSDOM26_VALIDATED = new Set(['-webkit-text-fill-color', '-webkit-text-stroke-color', 'background', 'background-attachment', 'background-color',
  'background-image', 'background-position', 'background-repeat', 'border', 'border-bottom', 'border-bottom-color', 'border-bottom-style', 'border-bottom-width',
  'border-collapse', 'border-color', 'border-left', 'border-left-color', 'border-left-style', 'border-left-width', 'border-right', 'border-right-color', 'border-right-style',
  'border-right-width', 'border-style', 'border-top', 'border-top-color', 'border-top-style', 'border-top-width', 'border-width', 'bottom',
  'clear', 'clip', 'color', 'flex', 'float', 'flood-color', 'font', 'font-family', 'font-size', 'font-style', 'height',
  'left', 'lighting-color', 'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'opacity', 'outline-color',
  'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'right', 'stop-color', 'top', 'width']);
// Properties jsdom 26 (cssstyle 4) parses; it keeps the others' values as
// written (min-height: 0 stays 0, gap: +.5 stays +.5). Measured with
// cssstyle 4.4 to 4.6.
const JSDOM26_PARSED = new Set(['-webkit-text-fill-color', '-webkit-text-stroke-color', 'background-color', 'background-image', 'border-bottom-color',
  'border-bottom-width', 'border-left-color', 'border-left-width', 'border-right-color', 'border-right-width', 'border-spacing', 'border-top-color',
  'border-top-width', 'bottom', 'color', 'flex-basis', 'flex-grow', 'flex-shrink', 'flood-color', 'font-family', 'font-size', 'font-weight', 'height',
  'left', 'lighting-color', 'line-height', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'opacity', 'outline-color', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'right', 'stop-color', 'top', 'width', 'background', 'background-position', 'border', 'border-bottom',
  'border-color', 'border-left', 'border-right', 'border-top', 'border-width', 'flex', 'font', 'font-variant', 'margin', 'padding']);
// 'jsdom25' is 'jsdom26' with unquoted url()s (cssstyle before 4.3.1);
// 'jsdom22' (cssstyle 3: jsdom 21 to 23) is 'jsdom25' without calc() in
// margins and paddings; 'jsdom20' (cssstyle 2) the same. 'jsdom27' (jsdom
// 27 to 29) is 'spec' with jsdom 26's border and clip (borderValue,
// clipValue). The properties each profile knows are its style surface
// (styleSurface), not its mode.
export const isLegacyMode = (mode) => mode === 'jsdom26' || mode === 'jsdom25' || mode === 'jsdom22' || mode === 'jsdom20';
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
// 'cssstyle4.2', see legacyFont in shorthands.js), or null.
export function setValidationMode(proto, mode, surfaceKey = null, fontVariant = null) {
  modes.set(proto, mode);
  if (surfaceKey !== null) surfaces.set(proto, fontVariant === null ? styleSurface(surfaceKey) : legacyFontSurface(surfaceKey, fontVariant));
}

// A style surface with cssstyle's font shorthand before 4.4: the same
// names, its own declared value caches.
const fontSurfaces = new Map();
function legacyFontSurface(key, variant) {
  let surface = fontSurfaces.get(`${key} ${variant}`);
  if (surface === undefined) {
    surface = { ...styleSurface(key), legacyFont: variant, caches: Object.create(null) };
    fontSurfaces.set(`${key} ${variant}`, surface);
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
  const extras = new Set([...writes.values()].filter((name) => !isKnownProperty(name)));
  surface = { drops, writes, extras, caches: Object.create(null) };
  surfaceCache.set(key, surface);
  return surface;
}
const missing = (surface, accessor, name) => surface.drops.has(name) && !surface.writes.has(accessor);
export const missingAccessors = (surface) => STYLE_ACCESSORS.filter((accessor) => missing(surface, accessor, cssName(accessor)));
const modeOf = (proto) => modes.get(proto) ?? 'spec';
export const validationModeOf = (window) => modeOf(window[S].protos.CSSStyleProperties);
export const protosMode = (protos) => modeOf(protos.CSSStyleProperties);
const surfaceOf = (proto) => surfaces.get(proto) ?? null;
// A property the profile does not know: setProperty and parsing drop it.
const dropped = (surface, name) => surface !== null && surface.drops.has(name);
export const styleSurfaceOf = (window) => surfaceOf(window[S].protos.CSSStyleProperties);

// A property name CSSOM accepts: a custom property, or one the
// specifications define. Others are dropped (style.setProperty('foo', ...)).
const isKnownProperty = (name) => name.startsWith('--') || LONGHANDS[name] !== undefined || SHORTHANDS[name] !== undefined || ALIASES[name] !== undefined;

// Declared values by mode, property and raw value: style writes repeat the
// same few values, so each is validated and serialized once. INVALID marks
// a value the property's grammar rejects.
const INVALID = null;
const declaredCaches = { spec: new Map(), jsdom27: new Map(), jsdom26: new Map(), jsdom25: new Map(), jsdom22: new Map(), jsdom20: new Map(), page: new Map() }; // mode -> property -> (raw value -> serialized)
// surface: the profile's (styleSurface), null for jsdom 30.1 and later; the
// names it drops are dropped by setProperty and parsing (dropped), not
// here: an accessor may still write one (cssstyle 2's webkitTextFillColor).
function declaredValue(name, value, mode = 'spec', surface = null) {
  const cache = surface === null ? declaredCaches[mode] : (surface.caches[mode] ??= new Map());
  let byValue = cache.get(name);
  if (byValue === undefined) cache.set(name, byValue = new Map());
  let out = byValue.get(value);
  if (out === undefined) {
    if (mode === 'page') out = pageDescriptorValue(name, value);
    else if (surface !== null && surface.extras.has(name)) out = value;
    else if (!isKnownProperty(name)) out = INVALID;
    else if (isLegacyFont(surface, name)) out = /^inherit$/i.test(value) ? INVALID : legacyFont(value, surface.legacyFont) ?? INVALID;
    else {
      out = versionedValue(name, value, mode);
      if (out === undefined) {
        const checked = isSpecMode(mode) || JSDOM26_VALIDATED.has(name);
        out = !checked || isValidValue(name, value) ? serializeDeclared(name, value, mode) : INVALID;
      }
    }
    if (byValue.size >= 500) byValue.clear();
    byValue.set(value, out);
  }
  return out;
}

// Values whose serialization depends on the jsdom version beyond the
// modes' general rules (black box, jsdom 20 to 30); undefined for the
// others. Runs once per property and raw value (declaredValue caches it).
function versionedValue(name, value, mode) {
  if (isLegacyMode(mode)) {
    const lower = value.toLowerCase();
    const kind = CSS_WIDE_KEYWORD.test(value) ? lower : lower === 'auto' ? 'auto' : lower.includes('var(') ? 'var' : null;
    if (kind !== null && droppedBy(mode, kind, name)) return INVALID;
    if (mode !== 'jsdom26') {
      // cssstyle before 4.3.1 keeps currentColor and border-spacing: 0 as written.
      if (lower === 'currentcolor' && isColorProperty(name)) return value;
      if (name === 'border-spacing' && ZERO.test(value)) return value;
    }
  }
  if ((mode === 'jsdom26' || mode === 'jsdom27') && name === 'border-style' && value.toLowerCase() === 'none') return INVALID;
  // jsdom 30 writes a single-number aspect-ratio as a ratio.
  if (mode === 'spec' && name === 'aspect-ratio' && /^\+?(\d+\.?\d*|\.\d+)$/.test(value)) return `${Number(value)} / 1`;
  if ((mode === 'jsdom20' || mode === 'jsdom22') && (name.startsWith('margin') || name.startsWith('padding')) && /calc\(/i.test(value)) return INVALID;
  if (BORDER_SHORTHAND.has(name)) return borderValue(name, value, mode);
  if (name === 'clip') return clipValue(value, mode);
  // jsdom 30 keeps outline as written (colors, numbers, order), a 0 as 0px.
  if (name === 'outline' && mode === 'spec') return !isValidValue(name, value) ? INVALID : CSS_WIDE_KEYWORD.test(value) ? value.toLowerCase() : ZERO.test(value) ? '0px' : value;
  return undefined;
}

// Values cssstyle drops for some properties it knows (black box): CSS-wide
// keywords, auto and var() (jsdom 26: var() in font-variant only). jsdom
// 20 to 25 drop the same ones.
const DROPPED = {
  legacy: {
    inherit: 'border-bottom-color border-bottom-style border-bottom-width border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom color flex-grow flex-shrink flood-color font-size left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top background border-color border-style border-width flex font',
    initial: 'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width',
    unset: 'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width flex',
    revert: 'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width flex margin padding',
    var: 'background-attachment background-color background-image background-repeat border-bottom-color border-bottom-style border-bottom-width border-collapse border-left-color border-left-style border-left-width border-right-color border-right-style border-right-width border-top-color border-top-style border-top-width bottom clear clip color flex-basis flex-grow flex-shrink flood-color font-size height left lighting-color margin-bottom margin-left margin-right margin-top opacity outline-color padding-bottom padding-left padding-right padding-top right stop-color top width background background-position border-color border-style border-width flex margin padding',
    auto: 'bottom flex-grow flex-shrink left outline-color right top flex',
  },
  jsdom26: {
    inherit: 'flex-grow flex-shrink background flex font', initial: 'flex-grow flex-shrink background font', unset: 'flex-grow flex-shrink background flex font',
    revert: 'flex-grow flex-shrink background flex font', var: 'font-variant', auto: 'border-spacing flex-grow flex-shrink font-weight outline-color font-variant',
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
//   written (on border named colors lowercased), border keeps a none style (alone it still drops it), sides
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
  let width = null, style = null, color = null;
  const side = name !== 'border';
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (token === '') continue;
    if (i > 0 && parts[i - 1].includes(',')) return serializeDeclared(name, value, mode);
    if (BORDER_STYLE.test(token)) {
      const lower = token.toLowerCase();
      if (side && mode !== 'spec' && (lower === 'none' || (lower === 'hidden' && !legacy))) { width = color = null; style = ''; } else style = token;
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
  if (width !== null) width = legacy ? (ZERO.test(width) && !side ? '0px' : width) : ZERO.test(width) ? '0px' : canonicalNumbers(width);
  // Legacy: as written, on border with named colors lowercased.
  if (color !== null) color = !legacy ? declaredColors(color) : !side && /^[a-z]+$/i.test(color) ? color.toLowerCase() : color;
  return [width, style, color].filter((part) => part !== null).join(' ');
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
const PAGE_DESCRIPTORS = ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'size', 'page-orientation', 'marks', 'bleed'];
const PAGE_SIZES = new Set(['a5', 'a4', 'a3', 'b5', 'b4', 'jis-b5', 'jis-b4', 'letter', 'legal', 'ledger']);
const LENGTH = /^(0|\+?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(px|cm|mm|q|in|pt|pc|em|rem|ex|rex|cap|rcap|ch|rch|ic|ric|lh|rlh|vw|vh|vi|vb|vmin|vmax))$/i;
function pageDescriptorValue(name, value) {
  if (name.startsWith('margin')) return isValidValue(name, value) ? serializeDeclared(name, value, 'spec') : INVALID;
  const words = value.toLowerCase().split(/\s+/);
  const one = words.length === 1 ? words[0] : null;
  let valid = false;
  if (name === 'page-orientation') valid = one === 'upright' || one === 'rotate-left' || one === 'rotate-right';
  else if (name === 'bleed') valid = one === 'auto' || (one !== null && LENGTH.test(one));
  else if (name === 'marks') valid = one === 'none' || (words.length <= 2 && new Set(words).size === words.length && words.every((w) => w === 'crop' || w === 'cross'));
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
const SHORT = { 'block flow': 'block', 'inline flow': 'inline', 'run-in flow': 'run-in', 'block flow-root': 'flow-root', 'inline flow-root': 'inline-block',
  'block flex': 'flex', 'inline flex': 'inline-flex', 'block grid': 'grid', 'inline grid': 'inline-grid', 'block table': 'table',
  'inline table': 'inline-table', 'inline ruby': 'ruby' };
function displayShortForm(value) {
  const keywords = value.toLowerCase().split(/\s+/);
  if (keywords.length < 2) return value;
  let outer = null, inner = null, listItem = false;
  for (const k of keywords) {
    if (OUTER.has(k) && outer === null) outer = k;
    else if (INNER.has(k) && inner === null) inner = k;
    else if (k === 'list-item' && !listItem) listItem = true;
    else return value;
  }
  inner ??= 'flow';
  outer ??= inner === 'ruby' ? 'inline' : 'block';
  if (listItem) return [outer === 'block' ? null : outer, inner === 'flow' ? null : inner, 'list-item'].filter(Boolean).join(' ');
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
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(part) && numbers.length < 2 && (basis === null || numbers.length > 0)) numbers.push(String(Number(part)));
    else basis = ZERO.test(part) ? '0px' : part;
  }
  return `${numbers[0] ?? '1'} ${numbers[1] ?? '1'} ${basis ?? '0%'}`;
}

function shortRepeat(value) {
  return value.split(',').map((layer) => {
    const parts = layer.trim().split(/\s+/);
    if (parts.length !== 2) return layer.trim();
    const [x, y] = parts.map((p) => p.toLowerCase());
    if (x === y) return parts[0];
    if (x === 'repeat' && y === 'no-repeat') return 'repeat-x';
    if (x === 'no-repeat' && y === 'repeat') return 'repeat-y';
    return parts.join(' ');
  }).join(', ');
}

const CSS_WIDE_KEYWORD = /^(initial|inherit|unset|revert|revert-layer)$/i;
function serializeDeclared(name, value, mode) {
  // Custom properties keep their value as written (CSS Variables 1), as in jsdom.
  if (name.startsWith('--')) return value;
  // CSS-wide keywords are ASCII case-insensitive and serialize lowercased.
  if (value.length <= 12 && CSS_WIDE_KEYWORD.test(value)) return value.toLowerCase();
  if (isLegacyMode(mode) && !JSDOM26_PARSED.has(name)) return value;
  if (name === 'display' && isSpecMode(mode)) return displayShortForm(value);
  if (name === 'flex') return flexLonghands(canonicalNumbers(value));
  if (name === 'font') return familyCommas(serializeFont(canonicalNumbers(value)));
  if (name === 'font-family') return familyCommas(value);
  value = canonicalNumbers(value);
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
  if (value.includes('(')) {
    if (isSpecMode(mode) && name !== 'border-image' && /(min|max|clamp|gradient)\(/i.test(value)) value = functionArguments(value);
    if (QUOTED_URLS[mode]?.has(name)) value = quoteUrls(value);
    else if (UNQUOTED_URLS[mode]?.has(name)) value = unquoteUrls(value);
    return name === 'background' || name === 'background-image' ? familyCommas(value) : value;
  }
  const box = BOX_SHORTHANDS.has(name);
  if (!box && !value.includes('0')) return value;
  const tokens = value.split(/\s+/);
  if (tokens.length === 1) return ZERO.test(value) && isLengthProperty(name) ? '0px' : value;
  if (!ZERO_LISTS.has(name)) return value;
  for (let i = 0; i < tokens.length; i++) if (ZERO.test(tokens[i])) tokens[i] = '0px';
  if (box && tokens.length <= 4) {
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
  for (const part of splitOutside(String(text ?? ''), ';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = propertyName(part.slice(0, colon).trim());
    let value = part.slice(colon + 1).trim();
    let important = false;
    const bang = value.match(/\s*!\s*important\s*$/i);
    if (bang) { important = true; value = value.slice(0, bang.index).trim(); }
    if (!name || !value || dropped(surface, name)) continue;
    if (isLegacyFont(surface, name) && /^inherit$/i.test(value)) { removeLegacyFont(decls, surface); continue; }
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
  throw new TypeError(`Failed to execute '${method}' on 'CSSStyleDeclaration': ${required} argument${required > 1 ? 's' : ''} required, but only ${present} present.`);
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
  if (decls.mergeable === true && decls.size >= 2) for (const [shorthand, longhands] of MERGED[mode]) {
    const first = decls.get(longhands[0]);
    if (first === undefined || !longhands.every((l) => decls.get(l)?.important === first.important)) continue;
    const values = longhands.map((l) => decls.get(l).value);
    const value = isLegacyMode(mode) ? values.join(' ') : COMPOSED[shorthand](values);
    merged ??= new Map();
    let place = null;
    for (const name of decls.keys()) if (longhands.includes(name)) { place = name; break; }
    for (const l of longhands) merged.set(l, l === place ? { name: shorthand, value, important: first.important } : '');
  }
  let out = '';
  if (merged === null) {
    for (const [name, { value, important }] of decls) out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
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
    else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f
      || (i === 0 && c >= 0x30 && c <= 0x39)
      || (i === 1 && c >= 0x30 && c <= 0x39 && input.charCodeAt(0) === 0x2d)) out += `\\${c.toString(16)} `;
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
function supportsCondition(text, matchesSelector) {
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? '')) i++; };
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
    if (/^not[\s(]/i.test(text.slice(i, i + 4))) { i += 3; return !inParens(); }
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
    return supportsDeclaration(inner.slice(0, colon), inner.slice(colon + 1));
  };
  const condition = (sub) => {
    if (sub !== undefined) return supportsCondition(sub, matchesSelector);
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

export function cssNamespace(matchesSelector) {
  const namespace = {
    escape(ident) {
      if (arguments.length === 0) throw new TypeError("Failed to execute 'escape' on 'CSS': 1 argument required, but only 0 present.");
      return escapeIdentifier(ident);
    },
    supports(...args) {
      if (args.length === 0) throw new TypeError("Failed to execute 'supports' on 'CSS': 1 argument required, but only 0 present.");
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
  initStyleState(style, { element, computed: true, decls: new Map(), mode: modeOf(proto), indexed: 0, surface: surfaceOf(proto) });
  return style;
}

function readOnly() {
  throw domError("Failed to execute on 'CSSStyleDeclaration': These styles are computed, and therefore read-only.", 'NoModificationAllowedError');
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
  if (mutableComputed(s)) {
    if (value === undefined) return; // "undefined", an invalid value
    s.overrides ??= new Map();
    s.overrides.set(name, value === null ? '' : String(value).trim());
    return;
  }
  const raw = value === null ? '' : String(value).trim();
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
  if (LONGHANDS[name] || (s.decls.legacyFont !== undefined && LEGACY_FONT_LONGHANDS.has(name))) return fromShorthand(s.decls, name);
  // jsdom 26 read background as the background-color set alone.
  if (name === 'background' && isLegacyMode(s.mode)) return s.decls.get('background-color')?.value ?? '';
  return COMPOSED[name] ? composeShorthand(s.decls, name) : '';
};

// Shorthands whose longhands a declaration block reads through them, as in
// jsdom (its CSS layer expands these; overflow: hidden leaves overflow-x
// empty there, and tests rely on that).
const EXPANDED_SHORTHANDS = new Set(['background', 'background-position', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-style', 'border-width', 'flex', 'font', 'margin', 'padding']);

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
    if (!x.includes(',') && !y.includes(',')) return `${x} ${y}`;
    const xs = x.split(/\s*,\s*/), ys = y.split(/\s*,\s*/);
    return xs.map((part, i) => `${part} ${ys[i] ?? ys[ys.length - 1]}`).join(', ');
  },
};
function composeShorthand(decls, name) {
  const values = [];
  for (const longhand of SHORTHANDS[name]) {
    const value = decls.get(longhand)?.value ?? fromShorthand(decls, longhand);
    if (!value) return '';
    values.push(value);
  }
  return COMPOSED[name](values);
}

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
    if (isLegacyFont(s.surface, name) ? removeLegacyFont(s.decls, s.surface) : s.decls.delete(name)) { reindex(style); sync(style); }
    return;
  }
  // Unknown properties and invalid values are ignored (CSSOM).
  const text = declaredValue(name, raw, s.mode, s.surface);
  if (text === INVALID) return;
  const important = String(priority).toLowerCase() === 'important';
  if (isLegacyFont(s.surface, name) && removeLegacyFont(s.decls, s.surface)) reindex(style);
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
    else if (!missing(surface, accessor, name)) descriptors[accessor] = styleAccessor(surface.writes.get(accessor) ?? name);
  }
  if (surface !== null) for (const [accessor, name] of surface.writes) descriptors[accessor] ??= styleAccessor(name);
  return descriptors;
}
function styleAccessor(name) {
  return {
    get() { return valueOf(this, name); },
    set(value) {
      const s = styleState(this);
      if (s.computed) writeComputed(s, name, value);
      else setDeclaration(this, name, value);
    },
    enumerable: true,
    configurable: true,
  };
}

// CSSPageDescriptors' accessors: each descriptor by its dashed name, and
// by its camel-cased one where that differs.
function pageDescriptors() {
  const descriptors = Object.create(null);
  for (const name of PAGE_DESCRIPTORS) {
    const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    for (const key of camel === name ? [name] : [name, camel]) {
      const accessor = {
        get() { return valueOf(this, name); },
        set(value) { setDeclaration(this, name, value === null ? '' : value); },
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

export const CSS_INTERFACES = [
  {
    name: 'CSSStyleDeclaration',
    slot: [S, STYLE_SLOT.descriptor],
    members: {
      get cssText() { const s = styleState(this); return serialize(s.decls, s.mode); },
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
      get length() { return styleState(this).decls.size; },
      get parentRule() { return styleState(this).parentRule ?? null; },
      item(index) {
        if (index === undefined && arguments.length === 0) tooFew('item', 1, 0);
        return [...styleState(this).decls.keys()][index >>> 0] ?? '';
      },
      // Iterable as an indexed collection (WebIDL): Array.prototype.values.
      [Symbol.iterator]: Array.prototype.values,
      getPropertyValue(name) {
        if (name === undefined && arguments.length === 0) tooFew('getPropertyValue', 1, 0);
        return valueOf(this, propertyName(name));
      },
      getPropertyPriority(name) {
        if (name === undefined && arguments.length === 0) tooFew('getPropertyPriority', 1, 0);
        return styleState(this).decls.get(propertyName(name))?.important ? 'important' : '';
      },
      setProperty(name, value, priority = '') {
        if (value === undefined && arguments.length < 2) tooFew('setProperty', 2, arguments.length);
        const key = propertyName(name);
        if (dropped(styleState(this).surface, key)) return;
        setDeclaration(this, key, value, priority === null ? '' : priority);
      },
      removeProperty(name) {
        if (name === undefined && arguments.length === 0) tooFew('removeProperty', 1, 0);
        const key = propertyName(name);
        const s = styleState(this);
        const previous = s.computed ? (mutableComputed(s) ? valueOf(this, key) : readOnly()) : s.decls.get(key)?.value ?? '';
        setDeclaration(this, key, '');
        return previous;
      },
    },
  },
  {
    name: 'CSSStyleProperties',
    parent: 'CSSStyleDeclaration',
    // About 1,600 accessors: their property descriptors are built directly,
    // the first time a window creates the interface; per style surface.
    descriptors: styleDescriptors,
    variant: (compat) => compat.styleSurface,
  },
  { name: 'CSSPageDescriptors', parent: 'CSSStyleDeclaration', descriptors: pageDescriptors },
];

// A declaration block owned by a CSS rule (CSSStyleRule.style, ...).
// mode: 'page' for an @page rule's descriptors.
export function declarationBlock(proto, text, parentRule, mode = modeOf(proto)) {
  const style = Object.create(proto);
  initStyleState(style, { element: null, decls: new Map(), parentRule, mode, indexed: 0, surface: mode === 'page' ? null : surfaceOf(proto) });
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
  if (es.style) { const s = styleState(es.style); parseInto(s.decls, es.attrs.get('style'), s.mode, s.surface); reindex(es.style); }
}
