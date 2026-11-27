// The descriptors of @font-face, @page and its margin boxes as jsdom 31
// reads them (black box, 31.0.1; #269 part G2), for css.js's descriptor
// surfaces (CSSFontFaceDescriptors, CSSPageDescriptors,
// CSSMarginDescriptors).
// - @font-face: the descriptors of CSS Fonts 4 (@webref/css, the
//   generated DESCRIPTOR_SYNTAX), font-stretch as font-width; each value
//   by its descriptor's grammar (css-values.js, '@font-face src'), in
//   canonical form (declared31.js); no CSS-wide keyword, no var().
// - @page: the properties CSS Paged Media 3 lists for the page context
//   (Appendix A, "CSS 2.1 properties that apply within the page
//   context"), as a style rule's declarations; and its descriptors (size,
//   marks, bleed, page-orientation, page-margin-safety) by their grammars.
// - The margin boxes (@top-left, ...): the page context's properties and
//   those of the margin contexts (content, overflow, unicode-bidi,
//   vertical-align, z-index), and page-margin-safety.
// jsdom 31 drops border-style in both (black box: border-width and
// border-top-style are kept, border-style: solid is dropped).
import { DESCRIPTOR_SYNTAX } from './css-grammar.js';
import { isValidValue, hasVarFunction, tokenizeValue } from './css-values.js';
import { canonical31 } from './declared31.js';

const PAGE_CONTEXT = [
  'direction',
  ...['color', 'image', 'repeat', 'attachment', 'position'].map((p) => `background-${p}`),
  'background',
  ...['width', 'color'].flatMap((p) => [
    ...['top', 'right', 'bottom', 'left'].map((s) => `border-${s}-${p}`),
    `border-${p}`,
  ]),
  ...['top', 'right', 'bottom', 'left'].map((s) => `border-${s}-style`),
  ...['top', 'right', 'bottom', 'left'].map((s) => `border-${s}`),
  'border',
  'counter-reset',
  'counter-increment',
  'color',
  ...['family', 'size', 'style', 'variant', 'weight'].map((p) => `font-${p}`),
  'font',
  'height',
  'min-height',
  'max-height',
  'line-height',
  ...['top', 'right', 'bottom', 'left'].map((s) => `margin-${s}`),
  'margin',
  ...['width', 'style', 'color'].map((p) => `outline-${p}`),
  'outline',
  ...['top', 'right', 'bottom', 'left'].map((s) => `padding-${s}`),
  'padding',
  'quotes',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'text-transform',
  'white-space',
  'word-spacing',
  'visibility',
  'width',
  'min-width',
  'max-width',
];
const PAGE_ONLY = Object.keys(DESCRIPTOR_SYNTAX['@page']);
const MARGIN_CONTEXT = ['content', 'overflow', 'unicode-bidi', 'vertical-align', 'z-index'];

// Each interface's descriptors, in that order (their accessors, css.js).
export const PAGE_NAMES31 = [...PAGE_CONTEXT, ...PAGE_ONLY];
export const MARGIN_NAMES31 = [...PAGE_CONTEXT, ...MARGIN_CONTEXT, 'page-margin-safety'];
export const FONT_FACE_NAMES = [...Object.keys(DESCRIPTOR_SYNTAX['@font-face']), 'font-stretch'];

// The @page descriptors a block reads by their own grammar (not as
// properties: size is also the width and height shorthand).
export const PAGE_DESCRIPTORS31 = new Set(PAGE_ONLY);
export const FONT_FACE_DESCRIPTORS = new Set(FONT_FACE_NAMES);

const CSS_WIDE = /^(?:initial|inherit|unset|revert|revert-layer)$/i;

// A @font-face descriptor's value in canonical form, or null when jsdom
// 31 drops it. (name: in lowercase; font-stretch is read as font-width.)
export function fontFaceValue31(name, value) {
  const text = value.trim();
  if (text === '' || CSS_WIDE.test(text) || hasVarFunction(text) || /var\(/i.test(text)) return null;
  if (name === 'unicode-range') return unicodeRange31(text);
  const key = `@font-face ${name === 'font-stretch' ? 'font-width' : name}`;
  if (name !== 'src') return described(key, text);
  // (each source on its own: the ones that do not parse are dropped)
  const sources = [];
  for (const part of topLevelParts(text)) {
    const source = part === '' ? null : described(key, part);
    if (source !== null) sources.push(source);
  }
  return sources.length === 0 ? null : sources.join(', ');
}

// An @page descriptor's value (size, marks, ...) in canonical form, or
// null: CSS-wide keywords and var() are kept as written, as a property's.
export function pageValue31(name, value) {
  const text = value.trim();
  if (text === '') return null;
  if (CSS_WIDE.test(text)) return text.toLowerCase();
  if (hasVarFunction(text)) return text;
  const out = described(`@page ${name}`, text);
  // (marks: crop before cross, as the grammar lists them)
  return out !== null && name === 'marks' && out === 'cross crop' ? 'crop cross' : out;
}

function described(key, text) {
  if (!isValidValue(key, text)) return null;
  const out = canonical31(key, text);
  return out !== null && PAIRS.has(key) ? onePair(out) : out;
}

// The descriptors of one value or two (a range: font-weight: 100 400): two
// that are the same are one (normal normal is normal, oblique 10deg 10deg
// oblique 10deg; black box, 31.0.1).
const PAIRS = new Set(
  [
    'ascent-override',
    'descent-override',
    'line-gap-override',
    'subscript-position-override',
    'subscript-size-override',
    'superscript-position-override',
    'superscript-size-override',
    'font-weight',
    'font-width',
    'font-size',
    'font-style',
  ].map((name) => `@font-face ${name}`),
);
function onePair(text) {
  const tokens = tokenizeValue(text);
  if (tokens === null || tokens.length < 2) return text;
  const [a, b] = tokens.slice(-2);
  return text.slice(a.s, a.e) === text.slice(b.s, b.e) ? text.slice(0, a.e) : text;
}

// The comma-separated parts of a value outside its blocks and functions,
// each trimmed.
function topLevelParts(text) {
  const tokens = tokenizeValue(text);
  if (tokens === null) return [text];
  const parts = [];
  let from = 0;
  for (const tok of tokens)
    if (tok.t === 'comma') {
      parts.push(text.slice(from, tok.s).trim());
      from = tok.e;
    }
  parts.push(text.slice(from).trim());
  return parts;
}

// unicode-range: a comma-separated list of U+ ranges (CSS Syntax 3's
// <urange>), each written U+START-END in uppercase hexadecimal without
// leading zeros, ? as 0 at the start and F at the end, a single code
// point as START-START. Black box, 31.0.1: the start is at most 10FFFF
// and the end at least the start, the end never checked against 10FFFF;
// when both are written in decimal digits only (U+41-42, CSS Syntax's
// <number-token> <number-token>), the end is compared as a decimal number
// (U+10-11 is dropped, U+9-10 kept); an end of 0 is not written (U+0-0 is
// U+0).
const URANGE = /^u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/i;
function unicodeRange31(text) {
  const out = [];
  for (const part of text.split(',')) {
    const m = URANGE.exec(part.trim());
    if (m === null) return null;
    const [, first, last] = m;
    const wildcards = first.includes('?');
    if (wildcards && (last !== undefined || !/^[0-9a-f]*\?*$/i.test(first))) return null;
    const start = parseInt(first.replaceAll('?', '0'), 16);
    let end = start;
    if (wildcards) end = parseInt(first.replaceAll('?', 'f'), 16);
    else if (last !== undefined) end = parseInt(last, 16);
    if (start > 0x10ffff) return null;
    const decimal = last !== undefined && /^\d+$/.test(first) && /^\d+$/.test(last);
    if (start > (decimal ? parseInt(last, 10) : end)) return null;
    const hex = (n) => n.toString(16).toUpperCase();
    out.push(end === 0 ? `U+${hex(start)}` : `U+${hex(start)}-${hex(end)}`);
  }
  return out.join(', ');
}
