// Declared color functions as jsdom 31 writes them (black box, 31.0.1;
// #269 part B2), from CSS Color 4 and 5:
// - rgb(), hsl() and hwb() resolve to rgb() as declared colors do
//   (colors.js), but rgb() with none, also as its alpha, is
//   color(srgb ...) (rgb(none 255 0) is color(srgb none 1 0)); inside
//   color-mix() they keep their modern form (rgba(0,0,255,.5) is
//   rgb(0 0 255 / 0.5));
// - lab(), lch(), oklab() and oklch(): percentages as numbers (lab's L
//   100% is 100, a and b 125, lch's chroma 150; oklab's L 1, the others
//   0.4), L clamped to its range, a hue in degrees within [0, 360), an
//   alpha of 1 left out;
// - color(): the space in lowercase (xyz is xyz-d65), percentages as
//   numbers;
// - color-mix(): the initial in oklab and a shorter hue left out, missing
//   percentages given what the others leave (blue 25%, red is blue 25%,
//   red 75%), two that are 50% each left out;
// - light-dark() and contrast-color(): their colors in canonical form.
// colorFunction(tok, raw, nested, write) returns the text, null when the
// function is one jsdom 31 rejects (device-cmyk()), undefined when it is
// not read here (relative colors: rgb(from red r g b)). write writes a
// token in canonical form (declared31.js).
import { resolveColor } from './colors.js';
import { isMathFunction } from './css-values.js';

// Set while declared31.js writes again a value it wrote itself: a negative
// color-mix() remainder it generated is then kept (fresh input with one is
// invalid, as in jsdom 31).
let rereading = false;
export function rereadColors(on) {
  rereading = on;
}

const number = (v) => (v === 0 ? '0' : String(Number(v.toPrecision(6))));
const LEGACY = /^(?:rgba?|hsla?|hwb)$/;
const LAB = {
  __proto__: null,
  lab: [100, 125, 125],
  lch: [100, 150, 360],
  oklab: [1, 0.4, 0.4],
  oklch: [1, 0.4, 360],
};

// A nested color jsdom 31 rejects (device-cmyk() in light-dark()) makes
// the whole value invalid.
const REJECTED = new Error('rejected');
export function colorFunction(tok, raw, nested, write) {
  try {
    return readColorFunction(tok, raw, nested, write);
  } catch (error) {
    if (error === REJECTED) return null;
    throw error;
  }
}

function readColorFunction(tok, raw, nested, write) {
  const name = tok.name;
  if (name === 'device-cmyk') return null;
  if (tok.args.some((arg) => arg.t === 'ident' && arg.v === 'from')) return undefined;
  if (LEGACY.test(name)) return legacy(tok, raw, nested, write);
  if (LAB[name] !== undefined) return lab(tok, name);
  if (name === 'color') return colorSpace(tok);
  if (name === 'color-mix') return mix(tok, write);
  if (name === 'light-dark' || name === 'contrast-color') return `${name}(${argList(tok.args, write)})`;
  return undefined;
}

// Channels and alpha: the arguments split at commas or at /.
function channels(args) {
  const parts = args.filter((arg) => arg.t !== 'comma');
  const slash = parts.findIndex((arg) => arg.t === 'delim' && arg.v === '/');
  // (the legacy comma form: a fourth value is the alpha)
  if (slash === -1 && parts.length === 4 && args.some((arg) => arg.t === 'comma'))
    return { values: parts.slice(0, 3), alpha: parts[3] };
  if (slash === -1) return { values: parts, alpha: null };
  return { values: parts.slice(0, slash), alpha: parts[slash + 1] ?? null };
}
const isNone = (tok) => tok.t === 'ident' && tok.v === 'none';
// An alpha written: none, or a number (a percentage as one), left out at 1.
function alphaText(tok) {
  if (tok === null) return '';
  if (isNone(tok)) return ' / none';
  const v = tok.t === 'percentage' ? tok.v / 100 : tok.v;
  if (typeof v !== 'number') throw UNREAD;
  return v >= 1 ? '' : ` / ${number(Math.max(0, v))}`;
}
const UNREAD = new Error('unread');

function legacy(tok, raw, nested, write) {
  const { values, alpha } = channels(tok.args);
  const rgb = tok.name.startsWith('rgb');
  if (rgb && (values.some(isNone) || (alpha !== null && isNone(alpha)))) {
    // rgb() with none: color(srgb), channels from 0 to 1
    try {
      const out = values.map((v) => {
        if (isNone(v)) return 'none';
        // (clamped as rgb() clamps: rgb(300 -20 0 / none) is 1 0 0)
        if (v.t === 'percentage') return number(Math.min(Math.max(v.v, 0), 100) / 100);
        if (v.t !== 'number') throw UNREAD;
        return number(Math.min(Math.max(v.v, 0), 255) / 255);
      });
      return `color(srgb ${out.join(' ')}${alphaText(alpha)})`;
    } catch {
      return undefined;
    }
  }
  if (!nested) return resolveColor(raw, 'jsdom31') ?? undefined;
  // In color-mix(): the modern form, rgb() for rgba() and hsl() for hsla().
  const name = tok.name.replace(/a$/, '');
  const written = values.map((v) => write(v)).join(' ');
  let a = '';
  if (alpha !== null) a = isNone(alpha) ? ' / none' : ` / ${write(alpha)}`;
  return `${name}(${written}${a})`;
}

function lab(tok, name) {
  const { values, alpha } = channels(tok.args);
  if (values.length !== 3) return undefined;
  const scale = LAB[name];
  const polar = name.endsWith('ch');
  try {
    const out = values.map((v, i) => {
      if (isNone(v)) return 'none';
      if (i === 2 && polar) return number(hue(v));
      let x;
      if (v.t === 'percentage') x = (v.v / 100) * scale[i];
      else if (v.t === 'number') x = v.v;
      else throw UNREAD;
      // (L within [0, its 100%]; chroma not below 0)
      if (i === 0) x = Math.min(Math.max(x, 0), scale[0]);
      if (i === 1 && polar) x = Math.max(x, 0);
      return number(x);
    });
    return `${name}(${out.join(' ')}${alphaText(alpha)})`;
  } catch {
    return undefined;
  }
}

const TURNS = { __proto__: null, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
// A hue in degrees within [0, 360).
function hue(tok) {
  let deg;
  if (tok.t === 'number') deg = tok.v;
  else if (tok.t === 'dimension' && TURNS[tok.unit] !== undefined) deg = tok.v * TURNS[tok.unit];
  else throw UNREAD;
  const out = deg % 360;
  return out < 0 ? out + 360 : out;
}

const SPACES = { __proto__: null, xyz: 'xyz-d65' };
function colorSpace(tok) {
  const { values, alpha } = channels(tok.args);
  const [space, ...rest] = values;
  if (space?.t !== 'ident') return undefined;
  try {
    const out = rest.map((v) => {
      if (isNone(v)) return 'none';
      if (v.t === 'percentage') return number(v.v / 100);
      if (v.t !== 'number') throw UNREAD;
      return number(v.v);
    });
    return `color(${SPACES[space.v] ?? space.v} ${out.join(' ')}${alphaText(alpha)})`;
  } catch {
    return undefined;
  }
}

// A list of colors (and other components), each in canonical form.
function argList(args, write) {
  const out = [];
  let part = [];
  for (const arg of args) {
    if (arg.t === 'comma') {
      out.push(part.join(' '));
      part = [];
    } else part.push(colorOrOther(arg, write));
  }
  out.push(part.join(' '));
  return out.join(', ');
}
function colorOrOther(tok, write) {
  if (tok.t === 'ident') return tok.v;
  if (tok.t === 'hash') return resolveColor(`#${tok.v}`, 'jsdom31') ?? `#${tok.v}`;
  if (tok.t === 'function') {
    const out = readColorFunction(tok, null, true, write);
    if (out === null) throw REJECTED;
    if (out !== undefined) return out;
  }
  return write(tok);
}

function mix(tok, write) {
  const groups = [[]];
  for (const arg of tok.args) {
    if (arg.t === 'comma') groups.push([]);
    else groups[groups.length - 1].push(arg);
  }
  const out = [];
  let colors = groups;
  if (groups[0][0]?.t === 'ident' && groups[0][0].v === 'in') {
    const method = groups[0].slice(1);
    let space = method[0]?.t === 'ident' ? method[0].v : null;
    if (space === null) return undefined;
    space = SPACES[space] ?? space;
    const words = [space];
    // (a hue method but shorter, the initial one)
    if (method.length === 3 && method[1].t === 'ident' && method[1].v !== 'shorter') words.push(method[1].v, 'hue');
    if (!(space === 'oklab' && words.length === 1)) out.push(`in ${words.join(' ')}`);
    colors = groups.slice(1);
  }
  // Each color and its percentage, if any (either order).
  const items = colors.map((group) => {
    // (a percentage token or a math function giving one: abs(-25%))
    const pct = group.find((t) => t.t === 'percentage' || (t.t === 'function' && isMathFunction(t.name)));
    const color = group.find((t) => t !== pct);
    return { color, pct: pct === undefined || pct.t === 'function' ? null : pct.v };
  });
  if (items.some((item) => item.color === undefined)) return undefined;
  const given = items.filter((item) => item.pct !== null);
  // (a percentage in a math function: written as it is)
  const mathPct = colors.some((group) => group.some((t) => t.t === 'function' && isMathFunction(t.name)));
  if (!mathPct && given.length > 0 && given.length < items.length) {
    const rest = (100 - given.reduce((sum, item) => sum + item.pct, 0)) / (items.length - given.length);
    for (const item of items) if (item.pct === null) item.pct = rest;
  }
  // (a percentage written out of [0, 100] is invalid, also the negative
  // remainder this writes when read again, as in jsdom 31; percentages
  // all equal and adding up to 100 or more are left out: red 80%, blue
  // 80% is red, blue; a filled-in remainder may be negative: red 80%,
  // blue 80%, green is green -60%)
  if (given.some((item) => item.pct > 100 || (item.pct < 0 && !rereading))) throw REJECTED;
  const sum = items.reduce((total, item) => total + (item.pct ?? 0), 0);
  const half = given.length === items.length && sum >= 100 && items.every((item) => item.pct === items[0].pct);
  for (let i = 0; i < colors.length; i++) {
    const item = items[i];
    let text = colorOrOther(item.color, write);
    if (mathPct) text = colors[i].map((t) => (t === item.color ? text : write(t))).join(' ');
    else if (item.pct !== null && !half) text += ` ${number(item.pct)}%`;
    out.push(text);
  }
  return `color-mix(${out.join(', ')})`;
}
