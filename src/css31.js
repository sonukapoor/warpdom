// Declaration blocks as jsdom 31 has them (black box, 31.0.1; #269): the
// CSSOM model, written from the CSSOM standard. A block holds longhands
// only, in order (decls: name -> { value, important, src }):
// - parsing a block, a declaration given again replaces the earlier one
//   and moves to the end, but a normal one does not replace an !important
//   one (CSSOM "parse a CSS declaration block");
// - setProperty() and the accessors change a declaration in place, or
//   append it (CSSOM "set a CSS declaration");
// - a shorthand is set as its longhands (css31-data.js: jsdom 31's
//   lists), a CSS-wide keyword as that keyword in each, a value with var()
//   as longhands pending substitution: their value is '' and the
//   shorthand reads as written while all of them are still pending;
// - serializing, a run of declarations is written as the first shorthand,
//   in preferred order, whose longhands are all there with one importance
//   and that has a value (CSSOM "serialize a CSS declaration block").
// src: the shorthand write a longhand came from ({ name, value }, shared
// by the longhands it set): a shorthand warpdom does not compose (yet)
// reads as written while all its longhands still come from that write.
import { DATA31 } from './css31-data.js';

// css31-data.js, parsed on first use (objects without a prototype).
let data = null;
function load() {
  data = JSON.parse(DATA31);
  Object.setPrototypeOf(data.shorthands, null);
  Object.setPrototypeOf(data.aliases, null);
  return data;
}
const shorthandsTable = () => (data ?? load()).shorthands;
export const dropped31 = () => (data ?? load()).dropped;
import { LONGHANDS } from './css-data.js';
import { expand, serializeBox, CSS_WIDE, topLevelCommaSplit } from './shorthands.js';
import { hasVarFunction } from './css-values.js';

export const shorthand31 = (name) => shorthandsTable()[name];
export const alias31 = (name) => (data ?? load()).aliases[name] ?? name;

// The shorthands with a longhand, in preferred order: more longhands first,
// then unprefixed before prefixed, then by name (CSSOM).
let containing = null;
function shorthandsOf(longhand) {
  if (containing === null) {
    containing = new Map();
    const names = Object.keys(shorthandsTable()).sort((a, b) => {
      const d = shorthandsTable()[b].length - shorthandsTable()[a].length;
      if (d !== 0) return d;
      const pa = a.startsWith('-'),
        pb = b.startsWith('-');
      if (pa !== pb) return pa ? 1 : -1;
      if (a === b) return 0;
      return a < b ? -1 : 1;
    });
    for (const name of names)
      for (const l of shorthandsTable()[name]) {
        let list = containing.get(l);
        if (list === undefined) containing.set(l, (list = []));
        list.push(name);
      }
  }
  return containing.get(longhand);
}

const initialOf = (longhand) => LONGHANDS[longhand]?.[0] ?? 'initial';
// A longhand's value as jsdom 31 keeps it: a zero length with its unit.
function longhandValue(longhand, value) {
  if (value === '0' && LONGHANDS[longhand]?.[3] === 1) return '0px';
  return value;
}

// background-repeat as background-repeat-x and -y.
const REPEAT = { 'repeat-x': ['repeat', 'no-repeat'], 'repeat-y': ['no-repeat', 'repeat'] };
function repeatXY(value) {
  const parts = value.split(' ');
  if (parts.length === 2) return parts;
  return REPEAT[value] ?? [value, value];
}

const SYSTEM_FONT = /^(?:caption|icon|menu|message-box|small-caption|status-bar)$/i;
// font's small-caps and width keyword, which come before its size.
const FONT_WIDTHS = new Set([
  'ultra-condensed',
  'extra-condensed',
  'condensed',
  'semi-condensed',
  'semi-expanded',
  'expanded',
  'extra-expanded',
  'ultra-expanded',
]);
function fontKeywords(value, found) {
  for (const token of value.split(/\s+/)) {
    const lower = token.toLowerCase();
    if (lower === 'small-caps') found.set('font-variant-caps', lower);
    else if (FONT_WIDTHS.has(lower)) found.set('font-width', lower);
    else if (/^[\d.]|\//.test(token)) break;
  }
}

// One to four values as top, right, bottom and left.
const sides = (p) => [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]];
// border-radius as its corners (h, or h v).
function radii(value) {
  const [h, v = h] = value.split('/').map((part) => sides(part.trim().split(/\s+/)));
  return h.map((x, i) => (x === v[i] ? x : `${x} ${v[i]}`));
}

// The longhands a shorthand's declared value sets, in jsdom 31's order:
// [[longhand, value], ...], with their src.
export function expand31(name, value, raw = value) {
  const longhands = shorthandsTable()[name];
  const src = { name, value };
  const lower = value.toLowerCase();
  if (CSS_WIDE.has(lower)) return longhands.map((l) => [l, lower, src]);
  // (a system font too: its longhands are what the system says)
  if (hasVarFunction(value) || (name === 'font' && SYSTEM_FONT.test(value))) return longhands.map((l) => [l, '', src]);
  if (name === 'border-radius') return radii(value).map((v, i) => [longhands[i], v, src]);
  const pairs = expand(name, value);
  const found = new Map();
  for (let i = 1; i < pairs.length; i++) found.set(pairs[i][0], pairs[i][1]);
  if (name === 'background-repeat') found.set(name, value);
  if (found.has('background-repeat')) {
    const xs = [],
      ys = [];
    for (const layer of layersOf(found.get('background-repeat'))) {
      const [x, y] = repeatXY(layer);
      xs.push(x);
      ys.push(y);
    }
    found.set('background-repeat-x', xs.join(', ')).set('background-repeat-y', ys.join(', '));
  }
  if (name === 'font') fontKeywords(raw, found);
  return longhands.map((l) => [l, found.has(l) ? longhandValue(l, found.get(l)) : initialOf(l), src]);
}

// Sets a declaration: in place (set) or replacing an earlier one at the end
// (parse). A shorthand sets its longhands. Whether a declaration changed.
// raw: the value as given (jsdom 30's declared value leaves out font's
// small-caps and width).
export function set31(decls, name, value, important, parsing, raw = value) {
  decls.cssom31 = true;
  name = alias31(name);
  if (!shorthandsTable()[name]) return put(decls, name, longhandValue(name, value), important, parsing, null);
  let changed = false;
  for (const [l, v, src] of expand31(name, value, raw)) changed = put(decls, l, v, important, parsing, src) || changed;
  return changed;
}
function put(decls, name, value, important, parsing, src) {
  const old = decls.get(name);
  if (parsing && old !== undefined) {
    if (old.important && !important) return false;
    decls.delete(name);
  }
  if (old !== undefined && !parsing) {
    const changed = old.value !== value || old.important !== important;
    old.value = value;
    old.important = important;
    old.src = src;
    return changed;
  }
  decls.set(name, { value, important, src });
  return true;
}

// Removes a property: a shorthand's longhands. Returns the value it had.
export function remove31(decls, name) {
  name = alias31(name);
  const previous = value31(decls, name);
  const longhands = shorthandsTable()[name];
  if (longhands) for (const l of longhands) decls.delete(l);
  else decls.delete(name);
  return previous;
}

export function priority31(decls, name) {
  name = alias31(name);
  const longhands = shorthandsTable()[name];
  if (!longhands) return decls.get(name)?.important ? 'important' : '';
  for (const l of longhands) if (!decls.get(l)?.important) return '';
  return 'important';
}

// getPropertyValue(): a longhand's value; a shorthand's from its longhands.
export function value31(decls, name) {
  name = alias31(name);
  const longhands = shorthandsTable()[name];
  if (!longhands) return decls.get(name)?.value ?? '';
  const entries = [];
  for (const l of longhands) {
    const decl = decls.get(l);
    if (decl === undefined || decl.important !== decls.get(longhands[0]).important) return '';
    entries.push(decl);
  }
  return shorthandValue(name, entries);
}

// A shorthand's value from its longhands' declarations ('' when it cannot
// be written).
function shorthandValue(name, entries) {
  const first = entries[0];
  const keyword = CSS_WIDE.has(first.value) ? first.value : null;
  let pending = first.value === '' ? first.src : null;
  let sameSrc = first.src;
  for (const e of entries) {
    if (keyword !== null ? e.value !== keyword : CSS_WIDE.has(e.value)) return '';
    if (pending !== null && e.src !== pending) pending = null;
    if (e.src !== sameSrc) sameSrc = null;
  }
  if (keyword !== null) return keyword;
  if (pending !== null) return pending.name === name ? pending.value : '';
  for (const e of entries) if (e.value === '') return '';
  const values = entries.map((e) => e.value);
  const composer = COMPOSERS[name] ?? defaultComposer(name);
  if (composer !== null) return composer(values, entries);
  return sameSrc !== null && sameSrc.name === name ? sameSrc.value : '';
}

// Composers: the longhands' values (jsdom 31's order) as the shorthand
// writes them, or ''.
const COMPOSERS = { __proto__: null };
const pair = ([a, b]) => (a === b ? a : `${a} ${b}`);
const omitting = (initials) => (values) => {
  const parts = values.filter((v, i) => v !== initials[i]);
  return parts.length === 0 ? values[0] : parts.join(' ');
};
const SIDE = /-(?:top|right|bottom|left)(?:-|$)|-(?:top|bottom)-(?:left|right)-radius$/;
function defaultComposer(name) {
  const longhands = shorthandsTable()[name];
  return longhands.length === 4 && longhands.every((l) => SIDE.test(l)) ? serializeBox : null;
}
for (const name of ['margin', 'padding', 'inset', 'border-width', 'border-style', 'border-color'])
  COMPOSERS[name] = serializeBox;
for (const name of ['overflow', 'gap', 'place-items', 'place-content', 'place-self', 'overscroll-behavior'])
  COMPOSERS[name] = pair;
COMPOSERS.flex = (v) => v.join(' ');
// (per layer: x and y are lists, layer by layer)
const layersOf = (value) => topLevelCommaSplit(value).map((layer) => layer.trim());
COMPOSERS['background-position'] = ([x, y]) => {
  const xs = layersOf(x),
    ys = layersOf(y);
  return xs.length !== ys.length ? '' : xs.map((v, i) => `${v} ${ys[i]}`).join(', ');
};
COMPOSERS.outline = omitting(['medium', 'none', 'auto']);
const BORDER_INITIALS = ['medium', 'none', 'currentcolor'];
for (const side of ['top', 'right', 'bottom', 'left']) COMPOSERS[`border-${side}`] = omitting(BORDER_INITIALS);
// border: the sides alike, and border-image initial.
const IMAGE_INITIALS = ['none', '100%', '1', '0', 'stretch'];
COMPOSERS.border = (v) => {
  for (let i = 0; i < 12; i += 4) if (v[i] !== v[i + 1] || v[i] !== v[i + 2] || v[i] !== v[i + 3]) return '';
  for (let i = 0; i < 5; i++) if (v[12 + i] !== IMAGE_INITIALS[i]) return '';
  return omitting(BORDER_INITIALS)([v[0], v[4], v[8]]);
};
COMPOSERS['border-image'] = omitting(IMAGE_INITIALS);
// background-repeat-x and -y as one value.
function repeatOf(x, y) {
  if (x === y) return x;
  if (x === 'repeat' && y === 'no-repeat') return 'repeat-x';
  if (x === 'no-repeat' && y === 'repeat') return 'repeat-y';
  return `${x} ${y}`;
}
COMPOSERS['background-repeat'] = ([x, y]) => {
  const xs = layersOf(x),
    ys = layersOf(y);
  return xs.length !== ys.length ? '' : xs.map((v, i) => repeatOf(v, ys[i])).join(', ');
};
// background: layer by layer (jsdom 31's longhands: image, position x and
// y, size, repeat x and y, attachment, origin, clip, color, blend mode),
// each part left out at its initial value, the color in the last layer;
// one of initial values alone is none.
COMPOSERS.background = (v) => {
  if (v[10] !== 'normal') return '';
  const lists = v.slice(0, 9).map(layersOf);
  const count = lists[0].length;
  if (lists.some((list) => list.length !== count)) return '';
  const layers = [];
  for (let i = 0; i < count; i++) {
    const [image, x, y, size, rx, ry, attachment, origin, clip] = lists.map((list) => list[i]);
    const parts = [];
    if (image !== 'none') parts.push(image);
    if (x !== '0%' || y !== '0%' || size !== 'auto') parts.push(size === 'auto' ? `${x} ${y}` : `${x} ${y} / ${size}`);
    const repeat = repeatOf(rx, ry);
    if (repeat !== 'repeat') parts.push(repeat);
    if (attachment !== 'scroll') parts.push(attachment);
    // (a clip is written after its origin: content-box alone is
    // content-box content-box)
    if (clip !== 'border-box') parts.push(`${origin} ${clip}`);
    else if (origin !== 'padding-box') parts.push(origin);
    if (i === count - 1 && v[9] !== 'transparent') parts.push(v[9]);
    layers.push(parts.length === 0 ? 'none' : parts.join(' '));
  }
  return layers.join(', ');
};
// font (its longhands in jsdom 31's order: style, the seven variants,
// weight, width, size, line-height, family, then six it resets): written
// when the variants other than caps (normal or small-caps) and the reset
// ones are initial, and the width is a keyword. A system font reads as
// written while its longhands are the ones it set.
const FONT_RESETS = ['normal', 'auto', 'normal', 'auto', 'none', 'normal'];
COMPOSERS.font = (v, entries) => {
  for (const i of [1, 3, 4, 5, 6, 7]) if (v[i] !== 'normal') return '';
  if (v[2] !== 'normal' && v[2] !== 'small-caps') return '';
  for (let i = 0; i < 6; i++) if (v[13 + i] !== FONT_RESETS[i]) return '';
  if (/[\d(]/.test(v[9])) return '';
  const parts = [v[0], v[2], v[8], v[9]].filter((p) => p !== 'normal');
  parts.push(v[11] === 'normal' ? v[10] : `${v[10]} / ${v[11]}`, v[12]);
  return parts.join(' ');
};
COMPOSERS['font-variant'] = omitting(['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal']);
COMPOSERS['border-radius'] = (v) => {
  const h = [],
    w = [];
  for (const corner of v) {
    const [x, y = x] = corner.split(' ');
    h.push(x);
    w.push(y);
  }
  const a = serializeBox(h),
    b = serializeBox(w);
  return a === b ? a : `${a} / ${b}`;
};

// The block's text (cssText).
export function serialize31(decls) {
  let out = '';
  let done = null;
  const add = (name, value, important) => {
    out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
  };
  for (const [name, decl] of decls) {
    if (done?.has(name)) continue;
    const shorthands = shorthandsOf(name);
    let written = false;
    if (shorthands !== undefined)
      for (const shorthand of shorthands) {
        const entries = [];
        for (const l of shorthandsTable()[shorthand]) {
          const e = decls.get(l);
          if (e === undefined || e.important !== decl.important || done?.has(l)) break;
          entries.push(e);
        }
        if (entries.length !== shorthandsTable()[shorthand].length) continue;
        const value = shorthandValue(shorthand, entries);
        if (value === '') continue;
        add(shorthand, value, decl.important);
        done ??= new Set();
        for (const l of shorthandsTable()[shorthand]) done.add(l);
        written = true;
        break;
      }
    if (!written) add(name, decl.value, decl.important);
  }
  return out;
}
