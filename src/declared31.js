// Declared values as jsdom 31 writes them (black box, 31.0.1; #269 part
// B): each component in its canonical form, as the property's grammar
// reads it (css-values.js traceValue):
// - numbers to 6 significant digits (.5 is 0.5, 1.50 1.5, 1e1 10,
//   1234567 1234570), units in lowercase, a 0 read as a length 0px and as
//   an angle 0deg;
// - keywords and function names in lowercase, other identifiers with
//   their escapes read (F\4FO is FOO);
// - strings in double quotes, url() with a quoted URL;
// - a comma followed by one space, a / between spaces, components one
//   space apart (translate(1px,2px) is translate(1px, 2px));
// - a family name as identifiers when each word is one and it is no
//   generic or CSS-wide keyword ("Helvetica Neue" is Helvetica Neue, A   B
//   is A B, Foo\,Bar is "Foo,Bar");
// - colors as declared colors are (rgb(), named colors in lowercase);
// - math functions simplified (calc31.js).
// A value whose grammar is not read here stays as it is.
import {
  traceValue,
  readEscapes,
  keywordsOf,
  tokenizeValue,
  hasVarFunction,
  isLengthUnit,
  hasSubstitution,
} from './css-values.js';
import { resolveColor } from './colors.js';
import { TYPE_SYNTAX } from './css-grammar.js';
import { simplifyMath, mathType } from './calc31.js';
import { colorFunction, rereadColors } from './color31.js';

// Function names as the specifications write them (translateX), by
// their lowercase form; built on first use.
let FUNCTION_NAMES = null;
function functionName(lower) {
  if (FUNCTION_NAMES === null) {
    FUNCTION_NAMES = new Map();
    for (const key of Object.keys(TYPE_SYNTAX))
      if (key.endsWith('()')) FUNCTION_NAMES.set(key.slice(0, -2).toLowerCase(), key.slice(0, -2));
  }
  return FUNCTION_NAMES.get(lower) ?? lower;
}

// The value in canonical form; the value itself when its grammar is not
// read here, null when jsdom 31 rejects it where the grammar does not (a
// family name of several words that starts with a generic family, a math
// function of another type: width: calc(0)).
let keywords = null;
let rejected = false;
// reread: the value is one this wrote itself (css.js writes a value
// again after jsdom 30's rules), so a remainder it generated stays.
export function canonical31(name, value, reread = false) {
  // (fails open, as validation does: a value this does not handle stays
  // as it is rather than breaking the write)
  rereadColors(reread);
  try {
    return canonical(name, value);
  } catch {
    return value;
  } finally {
    rereadColors(false);
  }
}

function canonical(name, value) {
  if (name === 'clip') return clip(value);
  const tokens = traceValue(name, value);
  if (tokens === false) return null;
  if (tokens === null) return value;
  keywords = keywordsOf(name);
  rejected = false;
  const rule = LAYER_RULES[name];
  let out;
  if (rule !== undefined) out = layers(tokens, value, rule);
  else if (VALUE_RULES[name] !== undefined) out = VALUE_RULES[name](tokens, value);
  else out = list(tokens, value);
  return rejected ? null : out;
}

// A comma list whose layers have a rule of their own.
function layers(tokens, text, rule) {
  const out = [];
  let from = 0;
  for (let i = 0; i <= tokens.length; i++) {
    if (i < tokens.length && tokens[i].t !== 'comma') continue;
    out.push(rule(tokens.slice(from, i), text));
    from = i + 1;
  }
  return out.join(', ');
}

// A shadow: its color first (none for currentcolor), the lengths without
// a trailing 0 spread and then 0 blur, inset last (box-shadow: inset 0 0
// 2px 0 #000 is rgb(0, 0, 0) 0px 0px 2px inset).
// A box-shadow layer with none (the offset, CSS Backgrounds 4) keeps its
// color, currentcolor too, and the blur and spread after it: none red is
// red none (the box-shadow composer writes it from the longhands).
function shadow(tokens, text) {
  let color = '';
  let inset = false;
  let none = false;
  const lengths = [];
  for (const tok of tokens) {
    if (tok.as === 'color') color = tok;
    else if (tok.t === 'ident' && tok.v === 'inset') inset = true;
    else if (tok.t === 'ident' && tok.v === 'none') none = true;
    else lengths.push(tok);
  }
  if (none && tokens.length === 1) return 'none';
  if (!none && lengths.length === 4 && lengths[3].v === 0) lengths.pop();
  if (!none && lengths.length === 3 && lengths[2].v === 0) lengths.pop();
  const parts = [];
  if (color !== '' && (none || !(color.t === 'ident' && color.v === 'currentcolor')))
    parts.push(component(color, text));
  if (none) parts.push('none');
  for (const tok of lengths) parts.push(component(tok, text));
  if (inset) parts.push('inset');
  return parts.join(' ');
}

// A drop-shadow() as written but with its color first (currentcolor and
// a 0px blur kept; black box, 31.0.1).
function dropShadow(tokens, text) {
  const color = tokens.filter((tok) => tok.as === 'color');
  const rest = tokens.filter((tok) => tok.as !== 'color');
  return [...color, ...rest].map((tok) => component(tok, text)).join(' ');
}

const EASINGS = /^(?:ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end)$/;
const isEasing = (tok) =>
  (tok.t === 'ident' && EASINGS.test(tok.v)) ||
  (tok.t === 'function' && (tok.name === 'cubic-bezier' || tok.name === 'steps' || tok.name === 'linear'));
const BEHAVIORS = /^(?:normal|allow-discrete)$/;
const isTime = (tok) =>
  (tok.t === 'dimension' && (tok.unit === 's' || tok.unit === 'ms')) || (tok.t === 'function' && tok.as === 'time');

// A transition: property, duration, easing, delay and behavior, each left
// out at its initial value (all, 0s, ease, 0s, normal) unless the delay
// needs the duration before it; all when every one is.
function transition(tokens, text) {
  let property = null;
  let duration = null;
  let delay = null;
  let easing = null;
  let behavior = null;
  for (const tok of tokens) {
    if (isTime(tok)) {
      if (duration === null) duration = tok;
      else delay = tok;
    } else if (isEasing(tok) && easing === null) easing = tok;
    else if (behavior === null && keyword(tok, BEHAVIORS)) behavior = tok;
    else property = tok;
  }
  const parts = [];
  // (a property named as an easing or a behavior goes last, after that
  // part kept: 1s ease ease, 1s normal normal)
  const named = property !== null && (isEasing(property) || keyword(property, BEHAVIORS));
  if (property !== null && property.v !== 'all' && !named) parts.push(component(property, text));
  const hasDelay = delay !== null && delay.v !== 0;
  if ((duration !== null && duration.v !== 0) || hasDelay)
    parts.push(duration === null ? '0s' : component(duration, text));
  // (kept when the property would read as one: ease ease)
  if (easing !== null && (!(easing.t === 'ident' && easing.v === 'ease') || (property !== null && isEasing(property))))
    parts.push(component(easing, text));
  if (hasDelay) parts.push(component(delay, text));
  if (behavior !== null && (behavior.v !== 'normal' || (named && keyword(property, BEHAVIORS)))) parts.push(behavior.v);
  if (named) parts.push(component(property, text));
  return parts.length === 0 ? 'all' : parts.join(' ');
}

// An animation: duration, easing, delay, iteration count, direction, fill
// mode, play state and name, each left out at its initial value (auto,
// ease, 0s, 1, normal, none, running, none), none when
// every one is. Each keyword fills its part once, a second one is the
// name, and the part is then kept even at its initial value, so that the
// name reads back as one (1s ease ease, 1s 1 infinite, 1s normal normal).
const DIRECTIONS = /^(?:normal|reverse|alternate|alternate-reverse)$/;
const FILLS = /^(?:none|forwards|backwards|both)$/;
const PLAY_STATES = /^(?:running|paused)$/;
const isNumeric = (tok) =>
  tok.t === 'number' || (tok.t === 'function' && (tok.as === 'number' || tok.as === 'integer'));
const isCount = (tok) => isNumeric(tok) || (tok.t === 'ident' && tok.v === 'infinite');
const keyword = (tok, pattern) => tok.t === 'ident' && pattern.test(tok.v);
function animation(tokens, text) {
  let duration = null;
  let delay = null;
  let easing = null;
  let count = null;
  let direction = null;
  let fill = null;
  let state = null;
  let name = null;
  for (const tok of tokens) {
    // (auto is a duration, the initial one)
    if (isTime(tok) || (duration === null && tok.t === 'ident' && tok.v === 'auto')) {
      if (duration === null) duration = tok;
      else delay = tok;
    } else if (easing === null && isEasing(tok)) easing = tok;
    else if (count === null && isCount(tok)) count = tok;
    else if (direction === null && keyword(tok, DIRECTIONS)) direction = tok;
    else if (fill === null && keyword(tok, FILLS)) fill = tok;
    else if (state === null && keyword(tok, PLAY_STATES)) state = tok;
    // (auto once the duration and the name are there: the timeline, at its
    // initial value; spin 1s auto is 1s spin)
    else if (name !== null && tok.t === 'ident' && tok.v === 'auto') continue;
    else name = tok;
  }
  // (none as the name is its initial value: written as none is)
  const named = name !== null && !(name.t === 'ident' && name.v === 'none');
  const clashes = (test) => named && test(name);
  const parts = [];
  const hasDelay = delay !== null && delay.v !== 0;
  const autoDuration = duration !== null && duration.t === 'ident';
  // (auto kept when the name is auto: auto auto)
  if ((duration !== null && (!autoDuration || clashes((tok) => tok.t === 'ident' && tok.v === 'auto'))) || hasDelay)
    parts.push(duration === null || autoDuration ? (duration?.v ?? '0s') : component(duration, text));
  if (easing !== null && (!(easing.t === 'ident' && easing.v === 'ease') || clashes(isEasing)))
    parts.push(component(easing, text));
  if (hasDelay) parts.push(component(delay, text));
  if (count !== null && (!(count.t === 'number' && count.v === 1) || clashes(isCount)))
    parts.push(component(count, text));
  if (direction !== null && (direction.v !== 'normal' || clashes((tok) => keyword(tok, DIRECTIONS))))
    parts.push(direction.v);
  if (fill !== null && (fill.v !== 'none' || clashes((tok) => keyword(tok, FILLS)))) parts.push(fill.v);
  if (state !== null && (state.v !== 'running' || clashes((tok) => keyword(tok, PLAY_STATES)))) parts.push(state.v);
  if (named) parts.push(component(name, text));
  return parts.length === 0 ? 'none' : parts.join(' ');
}

// A background size: one length or percentage is it and auto, auto auto
// is auto.
function backgroundSize(tokens, text) {
  if (tokens.length === 1 && tokens[0].t !== 'ident') return `${component(tokens[0], text)} auto`;
  if (tokens.length === 2 && tokens[0].v === 'auto' && tokens[1].v === 'auto') return 'auto';
  return list(tokens, text);
}

// clip: auto, or rect() of four lengths or auto, comma-separated or not
// (its grammar's <top> and the others are defined in prose).
function clip(value) {
  const tokens = tokenizeValue(value);
  // (a value that does not read is invalid, but for var(), kept as written)
  // (a value with var() or env() is kept as written, whatever its tokens)
  if (hasVarFunction(value) || (tokens !== null && hasSubstitution(tokens))) return value;
  if (tokens === null) return null;
  if (tokens.length !== 1) return null;
  const [tok] = tokens;
  if (tok.t === 'ident' && (tok.v === 'auto' || CSS_WIDE.test(tok.v))) return tok.v;
  if (tok.t !== 'function' || tok.name !== 'rect') return null;
  const commas = tok.args.some((arg) => arg.t === 'comma');
  const edges = commas ? tok.args.filter((arg, i) => i % 2 === 0) : tok.args;
  if (edges.length !== 4 || (commas && tok.args.length !== 7)) return null;
  if (commas && tok.args.some((arg, i) => i % 2 === 1 && arg.t !== 'comma')) return null;
  keywords = AUTO;
  rejected = false;
  const out = [];
  for (const edge of edges) {
    if (edge.t === 'ident' && edge.v === 'auto') out.push('auto');
    // (lengths only: no percentage, no other type, in a math function too)
    else if (
      (edge.t === 'dimension' && isLengthUnit(edge.unit)) ||
      (edge.t === 'number' && edge.v === 0) ||
      (edge.t === 'function' && mathType(edge) === 'length')
    ) {
      edge.as = 'length';
      out.push(component(edge, value));
    } else return null;
  }
  return rejected ? null : `rect(${out.join(commas ? ', ' : ' ')})`;
}
const AUTO = new Set(['auto']);
const CSS_WIDE = /^(?:initial|inherit|unset|revert|revert-layer)$/;

// translate: a 0 z left out, then a 0 y (1px 0 0 is 1px).
function translate(tokens, text) {
  const parts = tokens.slice();
  if (parts.length === 3 && parts[2].v === 0) parts.pop();
  if (parts.length === 2 && parts[1].v === 0) parts.pop();
  return list(parts, text);
}

// scale: percentages as numbers, a z of 1 left out, then a y equal to x
// (2 2 1 is 2, 50% 50% 0.5).
function scale(tokens, text) {
  if (tokens.length === 1 && tokens[0].t === 'ident') return tokens[0].v;
  // (a math function: each written, nothing left out)
  if (tokens.some((tok) => tok.t === 'function')) return list(tokens, text);
  const values = tokens.map((tok) => (tok.t === 'percentage' ? tok.v / 100 : tok.v));
  if (values.length === 3 && values[2] === 1) values.pop();
  if (values.length === 2 && values[1] === values[0]) values.pop();
  return values.map(number).join(' ');
}

// Two position keywords, the horizontal one first (top left is left top,
// center right right center).
const VERTICAL = /^(?:top|bottom)$/;
const HORIZONTAL = /^(?:left|right)$/;
function keywordPair(tokens) {
  const [a, b] = tokens;
  if (tokens.length < 2 || a.t !== 'ident' || b.t !== 'ident') return tokens;
  if (VERTICAL.test(a.v) || HORIZONTAL.test(b.v)) return [b, a, ...tokens.slice(2)];
  return tokens;
}
const transformOrigin = (tokens, text) => list(keywordPair(tokens), text);
// A <position> of one value: it and center (top is center top).
function position(tokens, text) {
  // (four values: each side with its offset, the horizontal pair first:
  // top 10px left 20px is left 20px top 10px)
  if (tokens.length === 4 && tokens[0].t === 'ident' && VERTICAL.test(tokens[0].v) && tokens[2].t === 'ident')
    return list([tokens[2], tokens[3], tokens[0], tokens[1]], text);
  if (tokens.length !== 1) return list(keywordPair(tokens), text);
  const one = component(tokens[0], text);
  return tokens[0].t === 'ident' && VERTICAL.test(tokens[0].v) ? `center ${one}` : `${one} center`;
}

// (offset-position and offset-anchor: normal and auto as they are)
const keywordOrPosition = (tokens, text) =>
  tokens.length === 1 && tokens[0].t === 'ident' && (tokens[0].v === 'normal' || tokens[0].v === 'auto')
    ? tokens[0].v
    : position(tokens, text);

// counter-reset, -set and -increment: each name with its integer (0, or 1
// for counter-increment; reversed(a) without one).
function counters(fallback) {
  return (tokens, text) => {
    if (tokens.length === 1 && tokens[0].t === 'ident' && tokens[0].v === 'none') return 'none';
    const parts = [];
    for (let i = 0; i < tokens.length; i++) {
      parts.push(component(tokens[i], text));
      if (tokens[i + 1] !== undefined && isNumeric(tokens[i + 1])) parts.push(component(tokens[++i], text));
      else if (tokens[i].t !== 'function') parts.push(fallback);
    }
    return parts.join(' ');
  };
}

// Grid lines: each with its integer before its name (a 3 is 3 a); a line
// left out where it is what leaving it out gives (the start's name, else
// auto): a / a is a, 1 / auto 1, a / b / a / b a / b.
function gridLines(tokens, text) {
  const lines = [[]];
  for (const tok of tokens) {
    if (tok.t === 'delim' && tok.v === '/') lines.push([]);
    else lines[lines.length - 1].push(tok);
  }
  const written = lines.map((line) => {
    const [a, b] = line;
    if (line.length === 2 && a.t === 'ident' && a.v !== 'span' && b.t === 'number') line = [b, a];
    return list(line, text);
  });
  const lone = (line) => line.length === 1 && line[0].t === 'ident' && line[0].v !== 'auto';
  const omitted = (from) => (lone(lines[from]) ? written[from] : 'auto');
  if (lines.length === 2) {
    if (written[1] === omitted(0)) written.pop();
  } else if (lines.length >= 3) {
    // grid-area: row-start / column-start / row-end / column-end.
    while (written.length < 4) written.push(omitted(written.length - 2));
    if (written[3] === omitted(1)) {
      written.pop();
      if (written[2] === omitted(0)) {
        written.pop();
        if (written[1] === omitted(0)) written.pop();
      }
    }
  }
  return written.join(' / ');
}

// aspect-ratio: auto first, the ratio with its / 1 (2 auto is auto 2 / 1).
function aspectRatio(tokens, text) {
  const auto = tokens.some((tok) => tok.t === 'ident' && tok.v === 'auto');
  const numbers = tokens.filter((tok) => tok.t !== 'ident' && tok.t !== 'delim');
  if (numbers.length === 0) return 'auto';
  const ratio = `${component(numbers[0], text)} / ${numbers.length > 1 ? component(numbers[1], text) : '1'}`;
  return auto ? `auto ${ratio}` : ratio;
}

// color-scheme: its names in order, only last (only dark is dark only).
function colorScheme(tokens, text) {
  const only = tokens.some((tok) => tok.t === 'ident' && tok.v === 'only');
  const names = tokens.filter((tok) => !(tok.t === 'ident' && tok.v === 'only'));
  return only ? `${list(names, text)} only` : list(names, text);
}

// image-orientation: an angle alone is written with a space after it
// (1turn is "1turn "; black box, 31.0.1), with flip as it is.
function imageOrientation(tokens, text) {
  const out = list(tokens, text);
  return tokens.length === 1 && tokens[0].t === 'dimension' ? `${out} ` : out;
}
const VALUE_RULES = {
  __proto__: null,
  'image-orientation': imageOrientation,
  'color-scheme': colorScheme,
  'aspect-ratio': aspectRatio,
  translate,
  scale,
  'transform-origin': transformOrigin,
  'object-position': position,
  // (as a position: 1em is 1em center, black box 31.0.1)
  'perspective-origin': position,
  'offset-position': keywordOrPosition,
  'offset-anchor': keywordOrPosition,
  'counter-reset': counters('0'),
  'counter-set': counters('0'),
  'counter-increment': counters('1'),
  'grid-area': gridLines,
  'grid-row': gridLines,
  'grid-column': gridLines,
  'font-feature-settings': featureSettings,
  '@font-face font-feature-settings': featureSettings,
};

const LAYER_RULES = {
  __proto__: null,
  'box-shadow': shadow,
  'text-shadow': shadow,
  transition,
  animation,
  'background-size': backgroundSize,
  'mask-position': position,
};

// (urls: a string that starts an entry is a url(), as in image-set())
// font-feature-settings: a feature's value 1 or on is left out, off is 0
// ("liga" 1 is "liga", "liga" off "liga" 0); a tag is four characters
// from U+20 to U+7E (CSS Fonts 4's <opentype-tag>, in prose; black box,
// 31.0.1).
const TAG = /^[\x20-\x7e]{4}$/;
function featureSettings(tokens, text) {
  const kept = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === 'string' && !TAG.test(stringValue(tok, text.slice(tok.s, tok.e)))) rejected = true;
    const after = tokens[i - 1]?.t === 'string';
    if (after && ((tok.t === 'number' && tok.v === 1) || (tok.t === 'ident' && tok.v === 'on'))) continue;
    kept.push(after && tok.t === 'ident' && tok.v === 'off' ? { ...tok, t: 'number', v: 0, as: 'integer' } : tok);
  }
  return list(kept, text);
}

function list(tokens, text, urls = false) {
  let out = '';
  let entry = true;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === 'comma') {
      out += ', ';
      entry = true;
      continue;
    }
    if (out !== '' && !out.endsWith(', ')) out += ' ';
    if (tok.family !== undefined && tok.family > i) {
      out += family(tokens, i, tok.family, text);
      i = tok.family - 1;
    } else if (urls && entry && tok.t === 'string') out += `url(${component(tok, text)})`;
    else out += component(tok, text);
    entry = false;
  }
  return out;
}

function component(tok, text) {
  const raw = text.slice(tok.s, tok.e);
  switch (tok.t) {
    case 'number':
      if (tok.v === 0 && tok.as === 'length') return '0px';
      if (tok.v === 0 && tok.as === 'angle') return '0deg';
      return number(tok.v);
    case 'percentage':
      return `${number(tok.v)}%`;
    case 'dimension':
      return number(tok.v) + tok.unit;
    case 'ident':
      if (tok.as === 'kw' || tok.as === 'color' || keywords.has(tok.v)) return tok.v;
      return identifier(readEscapes(raw));
    case 'string':
      return string(stringValue(tok, raw));
    case 'url':
      return `url(${string(tok.url)})`;
    case 'hash':
      return tok.as === 'color' ? (resolveColor(raw, 'jsdom31') ?? raw) : raw;
    case 'delim':
      return tok.v === '/' ? '/' : raw;
    case 'block':
      return tok.open + list(tok.items, text) + CLOSE[tok.open];
    case 'function':
      return fn(tok, raw, text);
    default:
      return raw;
  }
}

const CLOSE = { '(': ')', '[': ']', '{': '}' };
// The type a math function is read as (its label), for its result.
const EXPECTED = {
  __proto__: null,
  number: 'number',
  integer: 'number',
  length: 'length',
  percentage: 'length',
  angle: 'angle',
  time: 'time',
  frequency: 'frequency',
  resolution: 'resolution',
  flex: 'flex',
};
const MATH = /^(?:calc|min|max|clamp|round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|abs|sign)$/;
const LEGACY_COLOR = /^(?:rgba?|hsla?|hwb)$/;
function fn(tok, raw, text) {
  if (MATH.test(tok.name)) {
    const simple = simplifyMath(tok, EXPECTED[tok.as] ?? null);
    if (simple === null) rejected = true;
    return simple ?? `${tok.name}(${list(tok.args, text)})`;
  }
  if (tok.as === 'color') {
    const out = colorFunction(tok, raw, false, (t) => component(t, text));
    if (out === null) rejected = true;
    if (out !== undefined && out !== null) return out;
    if (LEGACY_COLOR.test(tok.name)) return resolveColor(raw, 'jsdom31') ?? raw;
    return raw;
  }
  if (tok.as === 'any' || tok.as === undefined) return raw;
  // (src("a") is url("a"))
  if (tok.as === 'url' && tok.name === 'src') return `url(${component(tok.args[0], text)})`;
  if (tok.name === 'drop-shadow') return `drop-shadow(${dropShadow(tok.args, text)})`;
  // (an image-set()'s string is a url(): image-set(url("a.png") 1x); by
  // token, so a comma in a url's string is no entry; #349 review)
  if (tok.name === 'image-set') return `image-set(${list(tok.args, text, true)})`;
  if (GRADIENTS.test(tok.name)) return `${tok.name}(${gradient(tok, text)})`;
  return `${functionName(tok.name)}(${list(tok.args, text)})`;
}

// Gradients (CSS Images 4) as jsdom 31 writes them: the first argument
// without its initial values (to bottom, ellipse, farthest-corner, a
// center position, from 0deg, in srgb, shorter hue) and in canonical
// order (direction or shape and size, position, color space; a corner
// and a position with the horizontal side first, a position of one value
// with center: at top is at center top; circle left out before one
// length), and a color stop of two positions as two stops (red 10% 20% is
// red 10%, red 20%).
const GRADIENTS = /^(?:repeating-)?(?:linear|radial|conic)-gradient$/;
const EXTENTS = /^(?:closest-side|closest-corner|farthest-side|farthest-corner)$/;
const HUES = /^(?:shorter|longer|increasing|decreasing)$/;
function gradient(tok, text) {
  const groups = [[]];
  for (const arg of tok.args) {
    if (arg.t === 'comma') groups.push([]);
    else groups[groups.length - 1].push(arg);
  }
  const out = [];
  let from = 0;
  if (groups[0].length > 0 && groups[0][0].as !== 'color') {
    const kind = tok.name.replace(/^repeating-/, '').slice(0, -9);
    const first = prelude(kind, groups[0], text);
    if (first !== '') out.push(first);
    from = 1;
  }
  for (const group of groups.slice(from)) {
    // (a stop of two positions: two stops)
    if (group.length === 3 && group[0].as === 'color') {
      const color = component(group[0], text);
      out.push(`${color} ${component(group[1], text)}`, `${color} ${component(group[2], text)}`);
    } else out.push(list(group, text));
  }
  return out.join(', ');
}

function prelude(kind, tokens, text) {
  let direction = null; // to's sides, an angle
  let shape = null;
  let size = [];
  let at = null;
  let space = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const word = tok.t === 'ident' ? tok.v : null;
    if (word === 'to') {
      direction = [];
      while (tokens[i + 1]?.t === 'ident' && /^(?:left|right|top|bottom)$/.test(tokens[i + 1].v))
        direction.push(tokens[++i]);
    } else if (word === 'from') direction = [tokens[++i]];
    else if (word === 'at') {
      at = [];
      while (i + 1 < tokens.length && !(tokens[i + 1].t === 'ident' && tokens[i + 1].v === 'in')) at.push(tokens[++i]);
    } else if (word === 'in') {
      // the color space and, for a polar one, its hue method (longer hue)
      if (tokens[i + 1]?.t === 'ident') space.push(tokens[++i]);
      if (tokens[i + 1]?.t === 'ident' && HUES.test(tokens[i + 1].v) && tokens[i + 2]?.v === 'hue')
        space.push(tokens[++i], tokens[++i]);
    } else if (word === 'circle' || word === 'ellipse') shape = word;
    else if (word !== null && EXTENTS.test(word)) size = [tok];
    else if (kind === 'linear') direction = [tok];
    else size.push(tok);
  }
  const parts = [];
  if (kind === 'linear' && direction !== null) {
    if (direction[0]?.t === 'ident') {
      const sides = keywordPair(direction);
      const written = sides.map((side) => side.v).join(' ');
      if (written !== 'bottom') parts.push(`to ${written}`);
    } else parts.push(component(direction[0], text));
  }
  if (kind === 'conic' && direction !== null) {
    const angle = direction[0];
    const zero = angle.v === 0 && (angle.t === 'number' || angle.unit === 'deg');
    if (!zero) parts.push(`from ${component(angle, text)}`);
  }
  if (kind === 'radial') {
    const keyword = size.length === 1 && size[0].t === 'ident';
    // (circle is the shape of one length; ellipse of two, and the initial
    // one; farthest-corner the initial size)
    if (shape === 'circle' && (size.length === 0 || keyword)) parts.push('circle');
    if (size.length > 0 && !(keyword && size[0].v === 'farthest-corner')) parts.push(list(size, text));
  }
  if (at !== null) {
    const where = position(at, text);
    if (where !== 'center center' && where !== '50% 50%') parts.push(`at ${where}`);
  }
  if (space.length > 0) {
    // (in srgb and a shorter hue are the initial ones)
    const kept = space.filter(
      (t, i) => !(i > 0 && t.t === 'ident' && (t.v === 'shorter' || (t.v === 'hue' && space[i - 1].v === 'shorter'))),
    );
    const written = list(kept, text);
    if (written !== 'srgb') parts.push(`in ${written}`);
  }
  return parts.join(' ');
}

// To 6 significant digits, as JavaScript writes numbers.
function number(v) {
  if (v === 0) return '0';
  return String(Number(v.toPrecision(6)));
}

// A string token's value: its text inside the quotes (the end may close
// it), escapes read.
const stringValue = (tok, raw) => readEscapes(raw.slice(1, tok.closed ? -1 : undefined));

// CSSOM: serialize a string.
function string(s) {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0) out += '�';
    else if ((c >= 1 && c <= 0x1f) || c === 0x7f) out += `\\${c.toString(16)} `;
    else if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else out += ch;
  }
  return `${out}"`;
}

// CSSOM: serialize an identifier.
function identifier(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const c = s.charCodeAt(i);
    if (c === 0) out += '�';
    else if (
      (c >= 1 && c <= 0x1f) ||
      c === 0x7f ||
      (i === 0 && c >= 0x30 && c <= 0x39) ||
      (i === 1 && c >= 0x30 && c <= 0x39 && s[0] === '-')
    )
      out += `\\${c.toString(16)} `;
    else if (i === 0 && ch === '-' && s.length === 1) out += '\\-';
    else if (c >= 0x80 || ch === '-' || ch === '_' || /[0-9A-Za-z]/.test(ch)) out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

// A family name (tokens from..to: a string, or identifiers): as
// identifiers when each word is one that needs no escape and the name is
// no generic family or CSS-wide keyword, else as a string.
const GENERIC =
  /^(?:serif|sans-serif|cursive|fantasy|monospace|system-ui|math|ui-serif|ui-sans-serif|ui-monospace|ui-rounded)$/i;
const RESERVED = /^(?:initial|inherit|unset|revert|revert-layer|default)$/i;
const PLAIN_IDENT = /^(?:--|-?[A-Za-z_\u0080-\u{10FFFF}])[\w\u0080-\u{10FFFF}-]*$/u;
function family(tokens, from, to, text) {
  let name;
  if (tokens[from].t === 'string') {
    const raw = text.slice(tokens[from].s, tokens[from].e);
    name = stringValue(tokens[from], raw);
  } else {
    const words = [];
    for (let i = from; i < to; i++) words.push(readEscapes(text.slice(tokens[i].s, tokens[i].e)));
    name = words.join(' ');
    if (words.length > 1 && GENERIC.test(words[0])) rejected = true;
  }
  const words = name.split(' ');
  const plain =
    words.every((word) => PLAIN_IDENT.test(word)) &&
    !GENERIC.test(words[0]) &&
    !(words.length === 1 && RESERVED.test(words[0]));
  return plain ? name : string(name);
}
