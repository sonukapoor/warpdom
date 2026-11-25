// Registered custom properties as jsdom 31 has them (black box, 31.0.1;
// #269 part F2; CSS Properties and Values API 1): the syntax a
// registration gives (@property's syntax descriptor, registerProperty's
// syntax), an initial value as jsdom 31 writes it, and a value matched
// against a syntax and computed. rules31.js reads @property rules,
// css.js has CSS.registerProperty, cascade.js the registrations and the
// values.
// - A syntax is * alone, or components joined by |: a data type name in
//   angle brackets (those of TYPES, as written), or an identifier other
//   than the CSS-wide keywords and default; each with + (a space
//   separated list) or # (a comma separated one) after it, but
//   <transform-list>. Written with " | " between components.
// - A value matches the first component it is: one value of the type, or
//   a list of them; computed, lengths are px (relative ones from the
//   element), angles deg, times s, resolutions dppx, numbers to six
//   significant digits, integers rounded from a calculation, colors as
//   the color property computes them (currentcolor the element's color),
//   urls and strings in double quotes, identifiers as written; a list is
//   written with one space, or a comma and a space, between its values.
// - An initial value is computationally independent when it uses no
//   font relative unit (em, rem, ex, lh, ...; viewport units are fine)
//   and no var().
import { isLengthUnit, isMathFunction, isValidValue, readEscapes, tokenizeValue } from './css-values.js';
import { mathType, mathValue, simplifyMath } from './calc31.js';
import { sixDigits } from './lengths.js';
import { cssString } from './css.js';

// Whether anything may be registered, in any window: an @property rule was
// made (cssom.js), or CSS.registerProperty was called (css.js). Until then
// only a shadow tree's <style> whose sheet is not made yet may register
// (cascade.js registration31).
export const registrations31 = { made: false, registered: false };

// --- syntax ---------------------------------------------------------------------------

const TYPES = new Set([
  'angle',
  'color',
  'custom-ident',
  'image',
  'integer',
  'length',
  'length-percentage',
  'number',
  'percentage',
  'resolution',
  'string',
  'time',
  'transform-function',
  'transform-list',
  'url',
]);
// (CSS-wide keywords, and default: no identifier of a syntax or a
// <custom-ident>)
const RESERVED = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default']);
const COMPONENT = /^(?:<([a-z-]+)>|((?:--|-?[A-Za-z_\u0080-￿])[\w\u0080-￿-]*))([+#]?)$/;
const CSS_SPACE = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g;

// The universal syntax.
export const UNIVERSAL = Object.freeze({ text: '*', parts: null });

// A syntax string's syntax: { text (as written back), parts ([{ type,
// ident, mult }]: type a TYPES name or 'ident') }, UNIVERSAL, or null when
// it is no syntax.
export function parseSyntax31(text) {
  const trimmed = text.replace(CSS_SPACE, '');
  if (trimmed === '*') return UNIVERSAL;
  const parts = [];
  for (const piece of trimmed.split('|')) {
    const m = COMPONENT.exec(piece.replace(CSS_SPACE, ''));
    if (m === null) return null;
    const [, type, ident, mult] = m;
    if (type !== undefined) {
      if (!TYPES.has(type) || (type === 'transform-list' && mult !== '')) return null;
      parts.push({ type, ident: null, mult });
    } else {
      if (RESERVED.has(ident.toLowerCase())) return null;
      parts.push({ type: 'ident', ident, mult });
    }
  }
  return {
    text: parts.map((p) => (p.type === 'ident' ? p.ident : `<${p.type}>`) + p.mult).join(' | '),
    parts,
  };
}

// --- initial values ---------------------------------------------------------------------

// A value written token by token, as jsdom 31 writes an initial value:
// whitespace runs one space (none at the ends, after an opening bracket
// or before a closing one), numbers as numbers (1e1 is 10, +.5 0.5, 1E3PX
// 1000px), strings in double quotes; comments dropped (a style sheet's),
// or kept (registerProperty's).
const NAME_RUN = String.raw`(?:[\w\u0080-￿-]|\\[\s\S])`;
const PIECE = new RegExp(
  String.raw`([ \t\n\r\f]+)|(\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?)|([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(${NAME_RUN}*|%)|(${NAME_RUN}+)|([\s\S])`,
  'y',
);
const OPENS = new Set(['(', '[', '{']);
const CLOSES = new Set([')', ']', '}']);
const LETTERS = /^[A-Za-z]+$/;
export function initialText31(text, keepComments) {
  let out = '';
  let space = false;
  PIECE.lastIndex = 0;
  while (PIECE.lastIndex < text.length) {
    const m = PIECE.exec(text);
    if (m[1] !== undefined) {
      space = true;
      continue;
    }
    if (m[2] !== undefined && !keepComments) continue;
    let piece = m[0];
    if (m[3] !== undefined) piece = cssString(stringValue(piece));
    // (a number, with its unit: 1E1PX is 10px; a1 is a name)
    else if (m[4] !== undefined) piece = String(Number(m[4])) + (LETTERS.test(m[5]) ? m[5].toLowerCase() : m[5]);
    if (space && out !== '' && !OPENS.has(out[out.length - 1]) && !CLOSES.has(piece)) out += ' ';
    space = false;
    out += piece;
  }
  return out;
}
// A string token's value: its escapes read, without its quotes.
function stringValue(token) {
  const quote = token[0];
  let body = token.slice(1);
  if (body.endsWith(quote) && !/(?:^|[^\\])(?:\\\\)*\\$/.test(body.slice(0, -1))) body = body.slice(0, -1);
  return readEscapes(body.replace(/\\\n/g, ''));
}

// --- values -----------------------------------------------------------------------------

// ctx: what computing needs of the element (cascade.js), or INDEPENDENT
// for an initial value's check:
//   length(text): px (a number) for a length or a calculation of lengths, or null
//   color(text): the color as computed, or null when it is no color
//   currentColor(): the element's color
//   image(text): the image as computed, or null when it is no image
//   url(url): the URL resolved
//   resolve(text): the text with its relative lengths as px (in calculations)
// The value as computed for the syntax, or null when it matches none of
// its components.
export function matchValue31(syntax, text, ctx) {
  const list = tokenizeValue(text);
  if (list === null || list.length === 0) return null;
  // (numbers alone are numbers first: 0 for <length> | <number> is 0)
  const numbers = list.every((tok) => tok.t === 'number');
  for (let pass = numbers ? 0 : 1; pass < 2; pass++) {
    for (const part of syntax.parts) {
      if (numbers && (pass === 0) !== (part.type === 'number' || part.type === 'integer')) continue;
      const out = matchPart(part, list, text, ctx);
      if (out !== null) return out;
    }
  }
  return null;
}
function matchPart(part, list, text, ctx) {
  if (part.type === 'transform-list') {
    const out = [];
    for (const tok of list) {
      const one = transformFunction(tok, text, ctx);
      if (one === null) return null;
      out.push(one);
    }
    return out.join(' ');
  }
  if (part.mult === '') return list.length === 1 ? component(part, list[0], text, ctx) : null;
  const items = part.mult === '+' ? list : commaItems(list);
  if (items === null) return null;
  const out = [];
  for (const tok of items) {
    const one = component(part, tok, text, ctx);
    if (one === null) return null;
    out.push(one);
  }
  return out.join(part.mult === '+' ? ' ' : ', ');
}
// The comma separated items, each one token (null else).
function commaItems(list) {
  if (list.length % 2 === 0) return null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (i % 2 === 1) {
      if (list[i].t !== 'comma') return null;
    } else if (list[i].t === 'comma') return null;
    else out.push(list[i]);
  }
  return out;
}

const DEGREES = { __proto__: null, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
const SECONDS = { __proto__: null, s: 1, ms: 0.001 };
const DPPX = { __proto__: null, dppx: 1, x: 1, dpi: 1 / 96, dpcm: 2.54 / 96 };
const isMath = (tok) => tok.t === 'function' && isMathFunction(tok.name);

function component(part, tok, text, ctx) {
  const source = text.slice(tok.s, tok.e);
  switch (part.type) {
    case 'length':
      return length(tok, source, ctx);
    case 'number':
      if (tok.t === 'number') return sixDigits(tok.v);
      return isMath(tok) && mathType(tok) === 'number' ? mathNumber(tok) : null;
    case 'integer':
      if (tok.t === 'number') return tok.int ? String(tok.v + 0) : null;
      if (!isMath(tok) || mathType(tok) !== 'number') return null;
      return ctx === INDEPENDENT ? '' : String(Math.round(Number(mathNumber(tok))) + 0);
    case 'percentage':
      if (tok.t === 'percentage') return `${sixDigits(tok.v)}%`;
      return isMath(tok) && mathType(tok) === 'percentage' ? single(tok, '%') : null;
    case 'length-percentage':
      if (tok.t === 'percentage') return `${sixDigits(tok.v)}%`;
      if (isMath(tok) && mathType(tok) === 'percentage') return single(tok, '%');
      return length(tok, source, ctx) ?? mixed(tok, source, ctx);
    case 'angle':
      return dimension(tok, DEGREES, 'angle', 'deg');
    case 'time':
      return dimension(tok, SECONDS, 'time', 's');
    case 'resolution':
      return dimension(tok, DPPX, 'resolution', 'dppx');
    case 'color':
      if (tok.t === 'ident' && (tok.v === 'currentcolor' || RESERVED.has(tok.v)))
        return tok.v === 'currentcolor' ? ctx.currentColor() : null;
      return ctx.color(source);
    case 'url':
      return tok.t === 'url' ? `url(${cssString(ctx.url(tok.url))})` : null;
    case 'string':
      return tok.t === 'string' && tok.closed ? cssString(stringValue(source)) : null;
    case 'custom-ident':
      return tok.t === 'ident' && !RESERVED.has(tok.v) ? readEscapes(source) : null;
    case 'ident':
      return tok.t === 'ident' && readEscapes(source) === part.ident ? part.ident : null;
    case 'image':
      if (tok.t === 'url') return `url(${cssString(ctx.url(tok.url))})`;
      return tok.t === 'function' ? ctx.image(source) : null;
    case 'transform-function':
      return transformFunction(tok, text, ctx);
    default:
      return null;
  }
}

// A length (a 0 too) as px.
function length(tok, source, ctx) {
  if (tok.t === 'number') return tok.v === 0 ? '0px' : null;
  const fits = (tok.t === 'dimension' && isLengthUnit(tok.unit)) || (isMath(tok) && mathType(tok) === 'length');
  if (!fits) return null;
  const px = ctx.length(source);
  return px === null ? null : `${sixDigits(px)}px`;
}
// A calculation of lengths and percentages: its relative lengths as px,
// simplified (calc(10% + 1em) is calc(10% + 20px), calc(10% - 10%) 0%).
function mixed(tok, source, ctx) {
  if (!isMath(tok) || mathType(tok) !== 'length') return null;
  const resolved = ctx.resolve(source);
  if (resolved === null) return null;
  const list = tokenizeValue(resolved);
  if (list?.length !== 1) return null;
  const out = simplifyMath(list[0], 'length');
  return typeof out === 'string' ? unwrapped(out) : null;
}
// (calc(15%) is 15%)
const unwrapped = (text) => (/^calc\([^ ()]+\)$/.test(text) ? text.slice(5, -1) : text);
// A number from a calculation of numbers.
function mathNumber(tok) {
  const value = mathValue(tok);
  return value === null || value.unit !== '' || !Number.isFinite(value.v) ? null : sixDigits(value.v);
}
// A calculation of one unit, in that unit.
function single(tok, unit) {
  const value = mathValue(tok);
  return value === null || value.unit !== unit || !Number.isFinite(value.v) ? null : `${sixDigits(value.v)}${unit}`;
}
// An angle, time or resolution in its canonical unit (a 0 alone is none).
function dimension(tok, units, type, unit) {
  if (tok.t === 'dimension') {
    const factor = units[tok.unit];
    return factor === undefined ? null : `${sixDigits(tok.v * factor)}${unit}`;
  }
  return isMath(tok) && mathType(tok) === type ? single(tok, unit) : null;
}

// A transform function, its lengths as px and angles as deg, its
// arguments written with a comma and a space between them.
function transformFunction(tok, text, ctx) {
  if (tok.t !== 'function') return null;
  const source = text.slice(tok.s, tok.e);
  if (!isValidValue('transform', source)) return null;
  const name = source.slice(0, source.indexOf('('));
  const args = [];
  for (const arg of tok.args) {
    if (arg.t === 'comma') continue;
    const piece = text.slice(arg.s, arg.e);
    let out = piece;
    if (arg.t === 'number') out = sixDigits(arg.v);
    else if (arg.t === 'dimension' && DEGREES[arg.unit] !== undefined) out = dimension(arg, DEGREES, 'angle', 'deg');
    else if (arg.t === 'percentage') out = `${sixDigits(arg.v)}%`;
    else if (isLengthUnit(arg.unit ?? '') || (isMath(arg) && mathType(arg) === 'length')) out = length(arg, piece, ctx);
    if (out === null) return null;
    args.push(out);
  }
  return `${name}(${args.join(', ')})`;
}

// --- computational independence -------------------------------------------------------------

// Units that read the element's font or line height (CSS Values 4, 6.1.1).
const FONT_RELATIVE = new Set(['em', 'rem', 'ex', 'rex', 'cap', 'rcap', 'ch', 'rch', 'ic', 'ric', 'lh', 'rlh']);
const FONT_UNIT = /\d(?:[eE][+-]?\d+)?([A-Za-z]+)/g;
const usesFontUnits = (text) => {
  for (const m of text.matchAll(FONT_UNIT)) if (FONT_RELATIVE.has(m[1].toLowerCase())) return true;
  return false;
};
// (what matching needs to check a value alone)
const INDEPENDENT = {
  length: (text) => (usesFontUnits(text) ? null : 0),
  color: (text) => (isValidValue('color', text) ? '' : null),
  currentColor: () => '',
  image: (text) => (isValidValue('background-image', text) ? '' : null),
  url: (url) => url,
  resolve: (text) => (usesFontUnits(text) ? null : text),
};
// Whether an initial value (written by initialText31) matches the
// syntax and is computationally independent.
export function independent31(syntax, text) {
  if (/var\(/i.test(text)) return false;
  return matchValue31(syntax, text, INDEPENDENT) !== null;
}
// A universal syntax's initial value: any value but a CSS-wide keyword
// or one with var().
export function universalInitial31(text) {
  if (/var\(/i.test(text)) return false;
  const trimmed = text.replace(CSS_SPACE, '').toLowerCase();
  return !RESERVED.has(trimmed) || trimmed === 'default';
}
