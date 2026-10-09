// Shorthand properties: a declaration's value split into the longhands it
// sets (margin: 0 auto -> margin-top: 0, margin-right: auto, ...), for the
// cascade and for reading longhands from a style declaration.
import { LONGHANDS, SHORTHANDS, ALIASES } from './css-data.js';
import { resolveColor } from './colors.js';

// --- values ------------------------------------------------------------------

// Splits a value at top-level whitespace and commas, keeping functions and
// strings whole: [token, separator, token, ...] that joins back to the value.
export function segments(value) {
  const out = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === ' ' || c === ',' || c === '\t' || c === '\n')) {
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
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start));
  return parts;
}

const words = (value) => segments(value).filter((_, i) => i % 2 === 0 && _ !== '');

export const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

// --- shorthands ----------------------------------------------------------------
// Expanded for the shorthands tests commonly meet; others are kept whole
// and readable under their own name.

export const BOX = new Set(['margin', 'padding', 'inset', 'border-width', 'border-style', 'border-color', 'border-radius',
  'scroll-margin', 'scroll-padding']);
export const PAIRS = new Set(['gap', 'overflow', 'place-content', 'place-items', 'place-self', 'overscroll-behavior']);
const LINES = new Set(['border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline', 'column-rule']);
const LINE_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'auto']);
const isLength = (t) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z]+|%)?$/i.test(t) || /^(calc|min|max|clamp)\(/i.test(t);
const FLEX_DIRECTIONS = new Set(['row', 'row-reverse', 'column', 'column-reverse']);
const FLEX_WRAPS = new Set(['nowrap', 'wrap', 'wrap-reverse']);

const initialOf = (longhand) => LONGHANDS[longhand]?.[0] ?? 'initial';

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
    return [[longhands[0], top], [longhands[1], right], [longhands[2], bottom], [longhands[3], left]];
  }
  if (PAIRS.has(name)) {
    if (longhands.length !== 2 || t.length < 1 || t.length > 2) return null;
    return [[longhands[0], t[0]], [longhands[1], t[1] ?? t[0]]];
  }
  if (LINES.has(name)) {
    let width, style, color;
    for (const token of t) {
      const lower = token.toLowerCase();
      if (style === undefined && LINE_STYLES.has(lower)) style = token;
      else if (width === undefined && (isLength(token) || lower === 'thin' || lower === 'medium' || lower === 'thick')) width = token;
      else if (color === undefined) color = token;
      else return null;
    }
    return longhands.map((l) => {
      const part = l.endsWith('-width') ? width : l.endsWith('-style') ? style : l.endsWith('-color') ? color : undefined;
      return [l, part ?? initialOf(l)];
    });
  }
  if (name === 'flex') {
    const lower = value.toLowerCase();
    if (lower === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
    if (lower === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
    const numbers = [];
    let basis;
    for (const token of t) {
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token) && numbers.length < 2 && basis === undefined) numbers.push(token);
      else if (basis === undefined) basis = token;
      else return null;
    }
    return [['flex-grow', numbers[0] ?? '1'], ['flex-shrink', numbers[1] ?? '1'], ['flex-basis', basis ?? (numbers.length ? '0%' : 'auto')]];
  }
  if (name === 'flex-flow') {
    let direction, wrap;
    for (const token of t) {
      const lower = token.toLowerCase();
      if (direction === undefined && FLEX_DIRECTIONS.has(lower)) direction = token;
      else if (wrap === undefined && FLEX_WRAPS.has(lower)) wrap = token;
      else return null;
    }
    return [['flex-direction', direction ?? 'row'], ['flex-wrap', wrap ?? 'nowrap']];
  }
  if (name === 'background') {
    // The color, from the final layer; the other longhands reset.
    const layers = topLevelCommaSplit(value);
    const color = words(layers[layers.length - 1]).find((w) => w.toLowerCase() === 'currentcolor' || resolveColor(w) !== null);
    return longhands.map((l) => [l, l === 'background-color' ? color ?? initialOf(l) : initialOf(l)]);
  }
  return null;
}

// A declaration as the [name, value] pairs it contributes: itself (a
// shorthand stays readable whole) and the longhands of an expanded shorthand.
const expansions = new Map();
export function expand(property, value) {
  const name = ALIASES[property] ?? property;
  if (!SHORTHANDS[name]) return [[name, value]];
  const key = `${name}:${value}`;
  let out = expansions.get(key);
  if (!out) {
    out = [[name, value], ...(expandShorthand(name, value) ?? [])];
    if (expansions.size > 5000) expansions.clear();
    expansions.set(key, out);
  }
  return out;
}

export const serializeBox = ([top, right, bottom, left]) => (left !== right ? `${top} ${right} ${bottom} ${left}`
  : bottom !== top ? `${top} ${right} ${bottom}` : right !== top ? `${top} ${right}` : top);
