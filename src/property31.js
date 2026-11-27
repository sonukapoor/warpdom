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
//   font relative unit (em, rem, ex, lh, ...) or container one (cqw,
//   ...; viewport units are fine), and no var().
import { isLengthUnit, isMathFunction, isValidValue, readEscapes, tokenizeValue } from './css-values.js';
import { mathType, mathValue, simplifyMath } from './calc31.js';
import { sixDigits } from './lengths.js';
import { cssString, escapeIdentifier } from './css.js';
import { hasVarReference } from './var-substitution.js';

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
// it is no syntax. reserved: whether the CSS-wide keywords and default
// are no identifier (an @function's types take them; black box, 31.0.1).
export function parseSyntax31(text, reserved = true) {
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
      if (reserved && RESERVED.has(ident.toLowerCase())) return null;
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
// or kept (registerProperty's); a hash and an unquoted url() as written
// (#000, url(icons/001.png); #345 review).
// (an escape: up to six hex digits and a whitespace after them, or one
// character)
const NAME_RUN = String.raw`(?:[\w\u0080-￿-]|\\(?:[0-9a-fA-F]{1,6}[ \t\n\r\f]?|[\s\S]))`;
const PIECE = new RegExp(
  String.raw`([ \t\n\r\f]+)|(\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\(?:\r\n|[\s\S]|$))*"?|'(?:[^'\\\n]|\\(?:\r\n|[\s\S]|$))*'?)|([uU][rR][lL]\((?![ \t\n\r\f]*["'])[ \t\n\r\f]*(?:[^)\\]|\\[\s\S])*\)?)|([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(${NAME_RUN}*|%)|(#?${NAME_RUN}+)|([\s\S])`,
  'y',
);
const OPENS = new Set(['(', '[', '{']);
const CLOSES = new Set([')', ']', '}']);
const LETTERS = /^[A-Za-z]+$/;
const unitText = (unit) => {
  const read = unit.includes('\\') ? readEscapes(unit) : unit;
  return LETTERS.test(read) ? read.toLowerCase() : unit;
};
const identText = (name) =>
  name[0] === '#' ? `#${escapeIdentifier(readEscapes(name.slice(1)))}` : escapeIdentifier(readEscapes(name));
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
    // (url( a.png ) is url(a.png))
    else if (m[4] !== undefined)
      piece = `${piece.slice(0, 4)}${piece.slice(4).replace(/\)$/, '').replace(CSS_SPACE, '')})`;
    // (a number, with its unit: 1E1PX is 10px; a1 is a name)
    // (its unit's escapes read: 2p\78 is 2px; #345 review)
    else if (m[5] !== undefined) piece = String(Number(m[5])) + unitText(m[6]);
    // (a name's escapes read and written as an identifier's: \61 bc is
    // abc, \31 abc stays; #345 review)
    else if (m[7] !== undefined && piece.includes('\\')) piece = identText(piece);
    if (space && out !== '' && !OPENS.has(out[out.length - 1]) && !CLOSES.has(piece)) out += ' ';
    space = false;
    out += piece;
  }
  return out;
}
// Whether a string token has a newline not escaped (a bad string).
function brokenString(token) {
  for (let i = 1; i < token.length; i++) {
    const c = token[i];
    // (CR LF escaped is one newline escaped)
    if (c === '\\') i += token[i + 1] === '\r' && token[i + 2] === '\n' ? 2 : 1;
    else if (c === '\n' || c === '\r' || c === '\f') return true;
  }
  return false;
}
// A string token's value: its escapes read, without its quotes.
function stringValue(token) {
  const quote = token[0];
  let body = token.slice(1);
  if (body.endsWith(quote) && !/(?:^|[^\\])(?:\\\\)*\\$/.test(body.slice(0, -1))) body = body.slice(0, -1);
  // (a backslash the end leaves is dropped: "abc\; readEscapes drops a
  // newline escaped, CR LF too, after ending the escape before it:
  // "\41\<LF>B" is "AB"; #345 review)
  if (/(?:^|[^\\])(?:\\\\)*\\$/.test(body)) body = body.slice(0, -1);
  return readEscapes(body);
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
  // (the tokens' positions are in the text without its comments)
  if (text.includes('/*')) text = withoutComments(text);
  let list = tokenizeValue(text);
  // (escaped units read, in calculations too: calc(2\65 m + 1px); #345
  // review)
  if (list !== null && text.includes('\\')) {
    const read = unitsRead(text, list);
    if (read !== text) list = tokenizeValue((text = read));
  }
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
// The text with each dimension's escaped unit read (2e\6d is 2em).
function unitsRead(text, list) {
  const edits = [];
  const walk = (tokens) => {
    for (const tok of tokens) {
      if (tok.t === 'dimension' && tok.unit.includes('\\')) edits.push(tok);
      else if (tok.args !== undefined) walk(tok.args);
      else if (tok.items !== undefined) walk(tok.items);
    }
  };
  walk(list);
  let out = text;
  for (let i = edits.length - 1; i >= 0; i--) {
    const tok = edits[i];
    const unit = unitOf(tok);
    // (a unit that reads as no name stays escaped: 2\31 x; so does an e a
    // sign or digit follows, no exponent: calc(1\65+2); #345 review)
    if (!/^[a-z]+$/.test(unit) || (unit === 'e' && /[+\-\d.]/.test(text[tok.e] ?? ''))) continue;
    out = `${out.slice(0, tok.e - tok.unit.length)}${unit}${out.slice(tok.e)}`;
  }
  return out;
}
// The text with each comment outside strings and urls a space (1px /* a */
// is 1px, 3px/**/4px two lengths; #345 review).
function withoutComments(text) {
  let out = '';
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c && text[i] !== '\n'; i++)
        if (text[i] === '\\') i += text[i + 1] === '\r' && text[i + 2] === '\n' ? 2 : 1;
    } else if (c === '\\') i++;
    else if ((c === 'u' || c === 'U') && /^url\([ \t\n\r\f]*[^"' \t\n\r\f]/i.test(text.slice(i, i + 64))) {
      // (an escaped ) is in the url: url(a\)/*b.png); #345 review)
      let close = i + 4;
      while (close < text.length && text[close] !== ')') close += text[close] === '\\' ? 2 : 1;
      if (close >= text.length) break;
      i = close;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      out += `${text.slice(from, i)} `;
      i = end === -1 ? text.length : end + 1;
      from = i + 1;
    }
  }
  return out + text.slice(from);
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
  // (# : one token, then a comma and one token each time)
  const commas = part.mult === '#';
  if (commas && list.length % 2 === 0) return null;
  let out = '';
  for (let i = 0; i < list.length; i++) {
    const tok = list[i];
    if (commas && i % 2 === 1) {
      if (tok.t !== 'comma') return null;
      continue;
    }
    const one = tok.t === 'comma' ? null : component(part, tok, text, ctx);
    if (one === null) return null;
    out += i === 0 ? one : `${commas ? ', ' : ' '}${one}`;
  }
  return out;
}

const DEGREES = { __proto__: null, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
const SECONDS = { __proto__: null, s: 1, ms: 0.001 };
const DPPX = { __proto__: null, dppx: 1, x: 1, dpi: 1 / 96, dpcm: 2.54 / 96 };
const isMath = (tok) => tok.t === 'function' && isMathFunction(tok.name);
// A dimension's unit, its escapes read (2e\6d is 2em; #345 review).
const unitOf = (tok) => (tok.unit.includes('\\') ? readEscapes(tok.unit).toLowerCase() : tok.unit);

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
      return isMath(tok) && mathType(tok) === 'number' ? mathInteger(tok) : null;
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
      // (one the end closes counts, one a newline breaks does not: "abc,
      // "a\nb"; #345 review)
      return tok.t === 'string' && !brokenString(source) ? cssString(stringValue(source)) : null;
    case 'custom-ident': {
      if (tok.t !== 'ident') return null;
      // (a keyword escaped is that keyword: \69 nherit; #345 review)
      const escapes = source.includes('\\');
      if (RESERVED.has(escapes ? readEscapes(source).toLowerCase() : tok.v)) return null;
      return escapes ? identText(source) : source;
    }
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
  if (tok.t === 'dimension') {
    const unit = unitOf(tok);
    if (!isLengthUnit(unit)) return null;
    const px = ctx.length(unit === tok.unit ? source : `${tok.v}${unit}`);
    return px === null ? null : `${sixDigits(px)}px`;
  }
  // (a calculation whose type its relative lengths decide: round(1.5em, 1px))
  if (!isMath(tok)) return null;
  const type = mathType(tok);
  return type === 'length' || type === undefined ? mathLength(tok, source, ctx) : null;
}
// A calculation of lengths, its relative ones as px first, simplified as
// jsdom 31 does (round(1.5px, 1px) is 2px, abs(-3px) 3px; #345 review);
// one with a percentage is none.
const PX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?px$/i;
function mathLength(tok, source, ctx) {
  const resolved = ctx.resolve(source);
  if (resolved === null) return null;
  const list = tokenizeValue(resolved);
  const out = list?.length === 1 ? simplifyMath(list[0], 'length') : null;
  if (typeof out !== 'string') {
    // (what the simplification does not read: the evaluator lengths.js has)
    const px = out === undefined ? ctx.length(source) : null;
    return px === null ? null : `${sixDigits(px)}px`;
  }
  const one = unwrapped(out);
  return PX.test(one) ? `${sixDigits(Number(one.slice(0, -2)))}px` : null;
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
// An integer from a calculation of numbers: rounded, at most 2^53 - 1
// (calc(1.499999) is 1, calc(infinity) 9007200000000000; #345 review).
function mathInteger(tok) {
  const value = mathValue(tok);
  if (value === null || value.unit !== '' || Number.isNaN(value.v)) return null;
  const n = Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.round(value.v)));
  return sixDigits(n + 0);
}
// A calculation of one unit, in that unit.
function single(tok, unit) {
  const value = mathValue(tok);
  return value === null || value.unit !== unit || !Number.isFinite(value.v) ? null : `${sixDigits(value.v)}${unit}`;
}
// An angle, time or resolution in its canonical unit (a 0 alone is none).
function dimension(tok, units, type, unit) {
  if (tok.t === 'dimension') {
    const factor = units[unitOf(tok)];
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
    else if (arg.t === 'dimension' && DEGREES[unitOf(arg)] !== undefined) out = dimension(arg, DEGREES, 'angle', 'deg');
    else if (arg.t === 'percentage') out = `${sixDigits(arg.v)}%`;
    else if ((arg.t === 'dimension' && isLengthUnit(unitOf(arg))) || (isMath(arg) && mathType(arg) === 'length'))
      out = length(arg, piece, ctx);
    if (out === null) return null;
    args.push(out);
  }
  return `${name}(${args.join(', ')})`;
}

// --- computational independence -------------------------------------------------------------

// Units that read the element's font or line height (CSS Values 4, 6.1.1).
const FONT_RELATIVE = new Set(['em', 'rem', 'ex', 'rex', 'cap', 'rcap', 'ch', 'rch', 'ic', 'ric', 'lh', 'rlh']);
// ... and those that read a container's size, which jsdom 31 refuses too
// (1cqw; #345 review).
const DEPENDENT_UNITS = new Set([...FONT_RELATIVE, 'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax']);
const FONT_UNIT = /\d(?:[eE][+-]?\d+)?([A-Za-z]+)/g;
const usesFontUnits = (text) => {
  for (const m of text.matchAll(FONT_UNIT)) if (FONT_RELATIVE.has(m[1].toLowerCase())) return true;
  return false;
};
// Whether tokens have a font or container relative unit, in a function
// too (sign(1em), linear-gradient(red 1em, blue)); strings and urls are
// none (#345 review).
function dependentUnits(list) {
  for (const tok of list) {
    if (tok.t === 'dimension' && DEPENDENT_UNITS.has(unitOf(tok))) return true;
    if (tok.args !== undefined && dependentUnits(tok.args)) return true;
    // (a block's too: sign((1em)); #345 review)
    if (tok.items !== undefined && dependentUnits(tok.items)) return true;
  }
  return false;
}
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
// (var() as a reference, not in a string or escaped: hasVarReference;
// #345 review)
export function independent31(syntax, text) {
  if (hasVarReference(text)) return false;
  const list = tokenizeValue(text.includes('/*') ? withoutComments(text) : text);
  if (list !== null && dependentUnits(list)) return false;
  return matchValue31(syntax, text, INDEPENDENT) !== null;
}
// Whether a value (written by initialText31) matches the syntax, its
// relative lengths too (an @function parameter's default; black box,
// 31.0.1: 1em is a <length>, var() is none).
// (relative lengths read as px: calc(1em + 1px) is a length)
const RELATIVE_LENGTH = /(\d(?:[eE][+-]?\d+)?)([A-Za-z]+)/g;
const ANY_LENGTH = {
  ...INDEPENDENT,
  length: () => 0,
  resolve: (text) =>
    text.replace(RELATIVE_LENGTH, (m, digits, unit) => (DEPENDENT_UNITS.has(unit.toLowerCase()) ? `${digits}px` : m)),
};
export function matchesSyntax31(syntax, text) {
  return !hasVarReference(text) && matchValue31(syntax, ANY_LENGTH.resolve(text), ANY_LENGTH) !== null;
}
// A universal syntax's initial value: any value but a CSS-wide keyword
// or one with var().
export function universalInitial31(text) {
  if (hasVarReference(text)) return false;
  // (a keyword as an identifier: escaped, \69 nherit, or after a comment;
  // #345 review)
  const bare = (text.includes('/*') ? withoutComments(text) : text).replace(CSS_SPACE, '');
  const trimmed = (bare.includes('\\') ? readEscapes(bare) : bare).toLowerCase();
  return !RESERVED.has(trimmed) || trimmed === 'default';
}
