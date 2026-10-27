// Shorthand properties: a declaration's value split into the longhands it
// sets (margin: 0 auto -> margin-top: 0, margin-right: auto, ...), for the
// cascade and for reading longhands from a style declaration.
import { LONGHANDS, SHORTHANDS, ALIASES } from './css-data.js';
import { resolveColor, NAMED_COLORS } from './colors.js';

// --- values ------------------------------------------------------------------

// Splits a value at top-level whitespace and commas, keeping functions and
// strings whole: [token, separator, token, ...] that joins back to the value.
// separator: a pattern matching the characters that split, or null for
// space, tab, line feed and comma.
export function segments(value, separator = null) {
  const out = [];
  let depth = 0,
    quote = null,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (
      depth === 0 &&
      (separator === null ? c === ' ' || c === ',' || c === '\t' || c === '\n' : separator.test(c))
    ) {
      out.push(value.slice(start, i));
      let j = i;
      while (j + 1 < value.length && /[\s,]/.test(value[j + 1])) j++;
      out.push(value.slice(i, j + 1));
      start = j + 1;
      i = j;
    }
  }
  out.push(value.slice(start));
  return out;
}

// Splits at commas outside parentheses and quotes (background layers).
function topLevelCommaSplit(value) {
  const parts = [];
  let depth = 0,
    quote = null,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

const words = (value) => segments(value).filter((_, i) => i % 2 === 0 && _ !== '');

export const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

// --- shorthands ----------------------------------------------------------------
// Expanded for the shorthands tests commonly meet; others are kept whole
// and readable under their own name.

export const BOX = new Set([
  'margin',
  'padding',
  'inset',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'scroll-margin',
  'scroll-padding',
]);
export const PAIRS = new Set(['gap', 'overflow', 'place-content', 'place-items', 'place-self', 'overscroll-behavior']);
const LINES = new Set([
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'outline',
  'column-rule',
]);
const LINE_STYLES = new Set([
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'auto',
]);
const isLength = (t) =>
  /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z]+|%)?$/i.test(t) || /^(calc|min|max|clamp)\(/i.test(t);
const FLEX_DIRECTIONS = new Set(['row', 'row-reverse', 'column', 'column-reverse']);
const FLEX_WRAPS = new Set(['nowrap', 'wrap', 'wrap-reverse']);

const initialOf = (longhand) => LONGHANDS[longhand]?.[0] ?? 'initial';

// font: [ style || variant || weight || stretch ]? size [ / line-height ]?
// family. The parts jsdom sets: style, weight, size, line-height, family.
const FONT_STYLES = new Set(['normal', 'italic', 'oblique']);
const FONT_WEIGHTS = new Set(['bold', 'bolder', 'lighter']);
const FONT_VARIANTS = new Set(['small-caps']);
const FONT_STRETCHES = new Set([
  'ultra-condensed',
  'extra-condensed',
  'condensed',
  'semi-condensed',
  'semi-expanded',
  'expanded',
  'extra-expanded',
  'ultra-expanded',
]);
const FONT_SIZES = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'xxx-large',
  'larger',
  'smaller',
]);
export function parseFont(value) {
  const parts = segments(value.replace(/\s*\/\s*/, ' / '));
  let style = 'normal',
    weight = 'normal',
    size = null,
    lineHeight = 'normal';
  let i = 0;
  for (; i < parts.length; i += 2) {
    const token = parts[i];
    const lower = token.toLowerCase();
    if (lower === 'normal') continue;
    if (FONT_STYLES.has(lower)) style = token;
    else if (FONT_WEIGHTS.has(lower) || /^\d+(\.\d+)?$/.test(token)) weight = token;
    else if (FONT_VARIANTS.has(lower) || FONT_STRETCHES.has(lower)) continue;
    else if (FONT_SIZES.has(lower) || isLength(token)) {
      size = token;
      i += 2;
      break;
    } else return null;
  }
  if (size === null) return null;
  if (parts[i] === '/') {
    lineHeight = parts[i + 2];
    if (!lineHeight) return null;
    i += 4;
  }
  const family = parts.slice(i).join('').trim();
  if (!family) return null;
  return { style, weight, size, lineHeight, family };
}

// The font shorthand as jsdom serializes it: normal parts left out, a
// spaced slash before the line height.
export function serializeFont(value) {
  const f = parseFont(value);
  if (!f) return value;
  return [
    f.style !== 'normal' ? f.style : '',
    f.weight !== 'normal' ? f.weight : '',
    f.size,
    f.lineHeight !== 'normal' ? `/ ${f.lineHeight}` : '',
    f.family,
  ]
    .filter(Boolean)
    .join(' ');
}

// The font shorthand of cssstyle before 4.4 (jsdom 20 to 26; black box,
// cssstyle 2.3.0 to 4.3.1). The value is split at whitespace outside
// quotes and parentheses; each word is given to every longhand that
// accepts it alone (a later word replaces an earlier one), and a word no
// longhand accepts drops the declaration. The shorthand reads as the
// longhands it set, in the order font-family, font-size, font-style,
// font-variant, font-weight, line-height: 20px Arial is "Arial 20px 20px"
// (20px is a size and a line height), and a family list keeps its last
// word (Segoe UI Emoji gives "Emoji"). Variant 'cssstyle4.2' (4.2.0 to
// 4.3.1) reads numbers with exponents, more length units and turn, and
// does not take var() as a family.
const LEGACY_FONT_ORDER = ['font-family', 'font-size', 'font-style', 'font-variant', 'font-weight', 'line-height'];
export const LEGACY_FONT_LONGHANDS = new Set(LEGACY_FONT_ORDER);
const LEGACY_FONT_SIZES = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'larger',
  'smaller',
]);
const NAMED = new Set([...NAMED_COLORS, 'transparent', 'currentcolor']);
// The CSS 2 system colors, the ones cssstyle before 4.4 knows.
const LEGACY_SYSTEM_COLORS = new Set([
  'activeborder',
  'activecaption',
  'appworkspace',
  'background',
  'buttonface',
  'buttonhighlight',
  'buttonshadow',
  'buttontext',
  'captiontext',
  'graytext',
  'highlight',
  'highlighttext',
  'inactiveborder',
  'inactivecaption',
  'inactivecaptiontext',
  'infobackground',
  'infotext',
  'menu',
  'menutext',
  'scrollbar',
  'threeddarkshadow',
  'threedface',
  'threedhighlight',
  'threedlightshadow',
  'threedshadow',
  'window',
  'windowframe',
  'windowtext',
]);
const LEGACY_HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LEGACY_NUMBERS = {
  'cssstyle4.1': {
    integer: /^[-+]?\d+$/,
    number: /^[-+]?\d*\.\d+$/,
    body: '[-+]?(\\d+|\\d*\\.\\d+)',
    units: 'px|em|rem|ch|vh|vw|ex|pt|pc|in|cm|mm',
    angles: 'deg|grad|rad',
  },
  'cssstyle4.2': {
    integer: /^[-+]?(0|[1-9]\d*)$/,
    number: /^[-+]?((0|[1-9]\d*)(\.\d*)?|\.\d+)(e-?\d+)?$/,
    body: '[-+]?((0|[1-9]\\d*)(\\.\\d*)?|\\.\\d+)(e-?\\d+)?',
    units: 'px|em|rem|ch|ex|pt|pc|in|cm|mm|q|[sld]?(vw|vh|vi|vb|vmin|vmax)|lh|rlh|cap|rcap|ic|ric|rex|rch',
    angles: 'deg|grad|rad|turn',
  },
};
const legacyTypes = new Map();
function legacyFontTypes(variant) {
  let types = legacyTypes.get(variant);
  if (!types) {
    const n = LEGACY_NUMBERS[variant];
    types = {
      ...n,
      variant,
      length: new RegExp(`^${n.body}(${n.units})$`),
      percent: new RegExp(`^${n.body}%$`),
      angle: new RegExp(`^${n.body}(${n.angles})$`),
    };
    legacyTypes.set(variant, types);
  }
  return types;
}
const isLegacyNumber = (t, types) => types.number.test(t) && !types.integer.test(t);
const isLegacyColor = (t) =>
  LEGACY_HEX.test(t) || NAMED.has(t.toLowerCase()) || LEGACY_SYSTEM_COLORS.has(t.toLowerCase());
// A family name: not a number, length, percentage, angle, color, url() or
// calc() (in 4.2 and later not var() either); in a comma list one such
// name is enough.
function legacyFamilyName(t, types) {
  if (
    t === '' ||
    types.integer.test(t) ||
    isLegacyNumber(t, types) ||
    types.length.test(t) ||
    types.percent.test(t) ||
    types.angle.test(t)
  )
    return false;
  if (t.startsWith('url(') || t.startsWith('calc(') || (types.variant !== 'cssstyle4.1' && t.startsWith('var(')))
    return false;
  return !isLegacyColor(t);
}
function legacyFontAccepts(longhand, t, types) {
  const lower = t.toLowerCase();
  switch (longhand) {
    case 'font-family':
      return t.split(',').some((name) => legacyFamilyName(name, types));
    case 'font-size':
      return LEGACY_FONT_SIZES.has(lower) || types.length.test(t) || types.percent.test(t);
    case 'font-style':
      return lower === 'normal' || lower === 'italic' || lower === 'oblique';
    case 'font-variant':
      return lower === 'normal' || lower === 'small-caps';
    case 'font-weight':
      return lower === 'normal' || lower === 'bold' || lower === 'bolder' || lower === 'lighter' || /^[1-9]00$/.test(t);
    default:
      return lower === 'normal' || isLegacyNumber(t, types) || types.length.test(t) || types.percent.test(t);
  }
}
function legacyFontWords(value) {
  const out = [];
  let depth = 0,
    quote = null,
    start = 0;
  for (let i = 0; i <= value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (i === value.length || (depth === 0 && /\s/.test(c))) {
      if (i > start) out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  return out;
}
// The longhands each legacy font value set: its words alone do not tell
// (in "Arial 12px bold 12px" bold could be the family).
const legacyFontParts = new Map();
// The declared value, or null when the declaration is dropped.
export function legacyFont(value, variant) {
  const types = legacyFontTypes(variant);
  const set = new Map();
  for (const word of legacyFontWords(value)) {
    let taken = false;
    for (const longhand of LEGACY_FONT_ORDER) {
      if (!legacyFontAccepts(longhand, word, types)) continue;
      set.set(
        longhand,
        longhand === 'font-size' && LEGACY_FONT_SIZES.has(word.toLowerCase()) ? word.toLowerCase() : word,
      );
      taken = true;
    }
    if (!taken) return null;
  }
  const parts = LEGACY_FONT_ORDER.filter((l) => set.has(l)).map((l) => [l, set.get(l)]);
  if (!parts.length) return null;
  const text = parts.map(([, v]) => v).join(' ');
  const key = `${variant} ${text}`;
  if (legacyFontParts.size >= 1000) legacyFontParts.clear();
  if (!legacyFontParts.has(key)) legacyFontParts.set(key, parts);
  return text;
}
const legacyFontLonghands = (text, variant) =>
  legacyFontParts.get(`${variant} ${text}`) ??
  (legacyFont(text, variant) === null ? [] : legacyFontParts.get(`${variant} ${text}`));

// A <bg-position> (CSS Backgrounds 3) as its horizontal and vertical
// parts, as jsdom 27 and later split it: one value is centered on the
// other axis (top is center top), keywords name their axis, an offset
// stays with its keyword (right 5% bottom is right 5% and bottom). Null
// when the tokens are not a position.
const HORIZONTAL = new Set(['left', 'right']);
const VERTICAL = new Set(['top', 'bottom']);
const POSITION_KEYWORDS = new Set(['left', 'right', 'top', 'bottom', 'center']);
export function splitPosition(tokens) {
  const lower = tokens.map((token) => token.toLowerCase());
  const keyword = (i) => POSITION_KEYWORDS.has(lower[i]);
  if (!lower.every((token, i) => keyword(i) || isLength(tokens[i]))) return null;
  if (tokens.length === 1) return VERTICAL.has(lower[0]) ? ['center', tokens[0]] : [tokens[0], 'center'];
  if (tokens.length === 2) {
    // [ left | center | right | <length> ] [ top | center | bottom | <length> ],
    // or the keywords the other way round.
    if (!VERTICAL.has(lower[0]) && !HORIZONTAL.has(lower[1])) return [tokens[0], tokens[1]];
    if (keyword(0) && keyword(1) && !HORIZONTAL.has(lower[0]) && !VERTICAL.has(lower[1])) return [tokens[1], tokens[0]];
    return null;
  }
  // Three or four values: keywords, each optionally followed by an offset.
  const groups = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!keyword(i)) return null;
    if (i + 1 < tokens.length && !keyword(i + 1)) {
      if (lower[i] === 'center') return null;
      groups.push([lower[i], `${tokens[i]} ${tokens[i + 1]}`]);
      i++;
    } else groups.push([lower[i], tokens[i]]);
  }
  if (groups.length !== 2) return null;
  const [a, b] = groups;
  if (HORIZONTAL.has(a[0]) || VERTICAL.has(b[0]))
    return HORIZONTAL.has(b[0]) || VERTICAL.has(a[0]) ? null : [a[1], b[1]];
  if (VERTICAL.has(a[0]) || HORIZONTAL.has(b[0])) return [b[1], a[1]];
  return null;
}

// background-position's layers as [x, y] pairs, or null.
export function positionLayers(value) {
  const layers = [];
  for (const layer of topLevelCommaSplit(value)) {
    const position = splitPosition(words(layer));
    if (!position) return null;
    layers.push(position);
  }
  return layers;
}

// The background shorthand's layers (CSS Backgrounds 3), each longhand as
// a list, as jsdom 27 and later expand it. Null when it does not parse.
const REPEATS = new Set(['repeat-x', 'repeat-y', 'repeat', 'space', 'round', 'no-repeat']);
const ATTACHMENTS = new Set(['scroll', 'fixed', 'local']);
const BOXES = new Set(['border-box', 'padding-box', 'content-box']);
const isImage = (token) =>
  /^(none|(url|image|image-set|cross-fade|element|paint|(-webkit-)?(repeating-)?(linear|radial|conic)-gradient)\()/i.test(
    token,
  ) || token.toLowerCase() === 'none';
function backgroundLayers(value) {
  const layers = topLevelCommaSplit(value);
  const out = { image: [], x: [], y: [], size: [], repeat: [], attachment: [], origin: [], clip: [], color: null };
  for (let n = 0; n < layers.length; n++) {
    const tokens = [];
    for (const word of words(layers[n])) {
      if (word.includes('/') && !word.includes('(')) {
        word.split('/').forEach((part, i) => {
          if (i) tokens.push('/');
          if (part) tokens.push(part);
        });
      } else tokens.push(word);
    }
    let image = null,
      position = null,
      size = null,
      repeat = null,
      attachment = null,
      origin = null,
      clip = null;
    for (let i = 0; i < tokens.length;) {
      const token = tokens[i];
      const lower = token.toLowerCase();
      if (image === null && isImage(token)) {
        image = token;
        i++;
        continue;
      }
      if (repeat === null && REPEATS.has(lower)) {
        repeat = token;
        if (
          lower !== 'repeat-x' &&
          lower !== 'repeat-y' &&
          REPEATS.has(tokens[i + 1]?.toLowerCase()) &&
          !/^repeat-[xy]$/i.test(tokens[i + 1])
        ) {
          repeat += ` ${tokens[i + 1]}`;
          i++;
        }
        i++;
        continue;
      }
      if (attachment === null && ATTACHMENTS.has(lower)) {
        attachment = token;
        i++;
        continue;
      }
      if (BOXES.has(lower) && clip === null) {
        if (origin === null) origin = token;
        else clip = token;
        i++;
        continue;
      }
      if (position === null && (POSITION_KEYWORDS.has(lower) || isLength(token))) {
        let j = i;
        while (
          j < tokens.length &&
          j - i < 4 &&
          (POSITION_KEYWORDS.has(tokens[j].toLowerCase()) || isLength(tokens[j]))
        )
          j++;
        position = splitPosition(tokens.slice(i, j));
        if (!position) return null;
        i = j;
        if (tokens[i] === '/') {
          let k = i + 1;
          while (k < tokens.length && k - i <= 2 && (isLength(tokens[k]) || /^(auto|cover|contain)$/i.test(tokens[k])))
            k++;
          if (k === i + 1) return null;
          size = tokens.slice(i + 1, k).join(' ');
          i = k;
        }
        continue;
      }
      if (
        n === layers.length - 1 &&
        out.color === null &&
        (lower === 'currentcolor' || lower === 'transparent' || resolveColor(token) !== null)
      ) {
        out.color = token;
        i++;
        continue;
      }
      return null;
    }
    out.image.push(image ?? 'none');
    out.x.push(position ? position[0] : '0%');
    out.y.push(position ? position[1] : '0%');
    out.size.push(size ?? 'auto');
    out.repeat.push(repeat ?? 'repeat');
    out.attachment.push(attachment ?? 'scroll');
    out.origin.push(origin ?? 'padding-box');
    out.clip.push(clip ?? origin ?? 'border-box');
  }
  return out;
}

// The parts of a one-layer background value as written, by longhand
// (background-image, -position, -repeat, -attachment, -color; null for
// those not given), or null when it has several layers or does not
// parse. For jsdom 26's computed background (cascade.js).
export function backgroundComponents(value) {
  if (topLevelCommaSplit(value).length !== 1) return null;
  const out = {
    'background-image': null,
    'background-position': null,
    'background-repeat': null,
    'background-attachment': null,
    'background-color': null,
  };
  const tokens = words(value);
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    let key = null,
      end = i + 1;
    if (isImage(token)) key = 'background-image';
    else if (REPEATS.has(lower)) {
      key = 'background-repeat';
      if (
        lower !== 'repeat-x' &&
        lower !== 'repeat-y' &&
        REPEATS.has(tokens[end]?.toLowerCase()) &&
        !/^repeat-[xy]$/i.test(tokens[end])
      )
        end++;
    } else if (ATTACHMENTS.has(lower)) key = 'background-attachment';
    else if (POSITION_KEYWORDS.has(lower) || isLength(token)) {
      key = 'background-position';
      while (
        end < tokens.length &&
        end - i < 4 &&
        (POSITION_KEYWORDS.has(tokens[end].toLowerCase()) || isLength(tokens[end]))
      )
        end++;
    } else if (lower === 'currentcolor' || resolveColor(token) !== null) key = 'background-color';
    if (key === null || out[key] !== null) return null;
    out[key] = tokens.slice(i, end).join(' ');
    i = end;
  }
  return out;
}

// The longhands a shorthand declaration sets, as [name, value] pairs, or
// null when it is not expanded.
function expandShorthand(name, value) {
  const longhands = SHORTHANDS[name];
  const t = words(value);
  if (CSS_WIDE.has(value.toLowerCase())) return longhands.map((l) => [l, value.toLowerCase()]);
  if (value.includes('var(')) return null;
  if (BOX.has(name)) {
    if (longhands.length !== 4 || t.length < 1 || t.length > 4 || value.includes('/')) return null;
    const [top, right = top, bottom = top, left = right] = t;
    return [
      [longhands[0], top],
      [longhands[1], right],
      [longhands[2], bottom],
      [longhands[3], left],
    ];
  }
  if (PAIRS.has(name)) {
    if (longhands.length !== 2 || t.length < 1 || t.length > 2) return null;
    return [
      [longhands[0], t[0]],
      [longhands[1], t[1] ?? t[0]],
    ];
  }
  if (LINES.has(name)) {
    let width, style, color;
    for (const token of t) {
      const lower = token.toLowerCase();
      if (style === undefined && LINE_STYLES.has(lower)) style = token;
      else if (width === undefined && (isLength(token) || lower === 'thin' || lower === 'medium' || lower === 'thick'))
        width = token;
      else if (color === undefined) color = token;
      else return null;
    }
    return longhands.map((l) => {
      const part = l.endsWith('-width')
        ? width
        : l.endsWith('-style')
          ? style
          : l.endsWith('-color')
            ? color
            : undefined;
      return [l, part ?? initialOf(l)];
    });
  }
  if (name === 'flex') {
    const lower = value.toLowerCase();
    if (lower === 'none')
      return [
        ['flex-grow', '0'],
        ['flex-shrink', '0'],
        ['flex-basis', 'auto'],
      ];
    if (lower === 'auto')
      return [
        ['flex-grow', '1'],
        ['flex-shrink', '1'],
        ['flex-basis', 'auto'],
      ];
    const numbers = [];
    let basis;
    for (const token of t) {
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token) && numbers.length < 2 && basis === undefined) numbers.push(token);
      else if (basis === undefined) basis = token;
      else return null;
    }
    return [
      ['flex-grow', numbers[0] ?? '1'],
      ['flex-shrink', numbers[1] ?? '1'],
      ['flex-basis', basis ?? (numbers.length ? '0%' : 'auto')],
    ];
  }
  if (name === 'flex-flow') {
    let direction, wrap;
    for (const token of t) {
      const lower = token.toLowerCase();
      if (direction === undefined && FLEX_DIRECTIONS.has(lower)) direction = token;
      else if (wrap === undefined && FLEX_WRAPS.has(lower)) wrap = token;
      else return null;
    }
    return [
      ['flex-direction', direction ?? 'row'],
      ['flex-wrap', wrap ?? 'nowrap'],
    ];
  }
  if (name === 'font') {
    const f = parseFont(value);
    if (!f) return null;
    return [
      ['font-style', f.style],
      ['font-weight', f.weight],
      ['font-size', f.size],
      ['line-height', f.lineHeight],
      ['font-family', f.family],
    ];
  }
  if (name === 'background-position') {
    const layers = positionLayers(value);
    if (!layers) return null;
    return [
      ['background-position-x', layers.map((l) => l[0]).join(', ')],
      ['background-position-y', layers.map((l) => l[1]).join(', ')],
    ];
  }
  if (name === 'background') {
    const layers = backgroundLayers(value);
    if (!layers) {
      // The color, from the final layer; the other longhands reset.
      const parts = topLevelCommaSplit(value);
      const color = words(parts[parts.length - 1]).find(
        (w) => w.toLowerCase() === 'currentcolor' || resolveColor(w) !== null,
      );
      return longhands.map((l) => [l, l === 'background-color' ? (color ?? initialOf(l)) : initialOf(l)]);
    }
    const list = {
      'background-image': layers.image,
      'background-position-x': layers.x,
      'background-position-y': layers.y,
      'background-size': layers.size,
      'background-repeat': layers.repeat,
      'background-attachment': layers.attachment,
      'background-origin': layers.origin,
      'background-clip': layers.clip,
    };
    return longhands.map((l) => [l, l === 'background-color' ? (layers.color ?? initialOf(l)) : list[l].join(', ')]);
  }
  return null;
}

// A declaration as the [name, value] pairs it contributes: itself (a
// shorthand stays readable whole) and the longhands of an expanded shorthand.
// fontVariant: the declarations hold cssstyle's font before 4.4 (legacyFont).
const expansions = new Map();
export function expand(property, value, fontVariant = undefined) {
  const name = ALIASES[property] ?? property;
  if (!SHORTHANDS[name]) return [[name, value]];
  if (fontVariant !== undefined && name === 'font') return [[name, value], ...legacyFontLonghands(value, fontVariant)];
  const key = `${name}:${value}`;
  let out = expansions.get(key);
  if (!out) {
    out = [[name, value], ...(expandShorthand(name, value) ?? [])];
    if (expansions.size > 5000) expansions.clear();
    expansions.set(key, out);
  }
  return out;
}

export const serializeBox = ([top, right, bottom, left]) =>
  left !== right
    ? `${top} ${right} ${bottom} ${left}`
    : bottom !== top
      ? `${top} ${right} ${bottom}`
      : right !== top
        ? `${top} ${right}`
        : top;
