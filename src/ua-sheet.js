// The user agent style sheet getComputedStyle cascades under the
// document's style sheets, as jsdom does (black box, every release from
// 20.0.3 to 30.1.3 measured: each tag, form control types, nested lists,
// links, dir, details, dialog, popover).
//
// Two generations, written here from the measured values (and, for the
// newer one, the HTML standard's rendering section, whose rules it
// follows):
// - legacy, jsdom before 27: an older browser's sheet. body has an 8px
//   margin, headings and form controls their classic look (button: 2px
//   outset border, padding 2px 6px 3px), sectioned h1 a smaller size, the
//   html element no display. Values go through the profile's CSS parser,
//   so its quirks apply (cssstyle 2 and 3 keep named colors, cssstyle before
//   4.3.1 .83em as written).
// - html, jsdom 27 and later: the rendering section's rules as jsdom
//   applies them: no body margin (margin-block and margin-inline are not
//   applied), unicode-bidi: isolate on block elements, padding-inline-start
//   on lists, :link colors, details and summary, popover, the form
//   controls' initial text properties and appearance; from 28.1.0 its
//   !important declarations win over the page's normal ones (overflow:
//   clip on inputs, display: none on input[type=hidden]), and the others
//   meet the page's by specificity (cascade.js pageOrUserAgent).
//
// Where warpdom's computed values differ from jsdom's whatever the sheet
// says, the sheet still declares what jsdom's does (system colors stay
// keywords in jsdom 23 to 26; text-indent: 0 stays 0 before 29.0.1;
// jsdom 27 and later compute ThreeDFace to rgb(204, 204, 204), written so
// here).
//
// The cascade (cascade.js) reads a property from here only when no style
// rule or style attribute declares it; from 28.1.0 the !important ones
// first, and the others against the page's rules by specificity. Rules of a single type selector sit in a map by tag (one
// lookup); the others (all more specific) by the tag they require, tested
// in specificity order. A sheet is split once per CSS mode and style
// surface; a property's declarations are parsed and indexed when it is
// first read.
import { S } from './internal.js';
import { compileRuleSelector } from './selectors.js';
import { parseDeclarations, validationModeOf, styleSurfaceOf } from './css.js';
import { SHORTHANDS } from './css-data.js';

const LEGACY = `
head, title, link, meta, style, script, datalist, template, param, noframes { display: none }
body, article, section, nav, aside, h1, h2, h3, h4, h5, h6, hgroup, header, footer, address, p, hr, pre, blockquote, ol, ul, menu, dl, dt, dd,
  figure, figcaption, main, div, form, optgroup, option, fieldset, legend, details, summary, dir, frame, frameset, listing, plaintext, xmp,
  center { display: block }
li { display: list-item; text-align: -webkit-match-parent }
q, map, area, output { display: inline }
input, button, select, textarea, progress, meter, marquee { display: inline-block }
table { display: table; border-collapse: separate; border-spacing: 2px; border-color: gray }
caption { display: table-caption; text-align: -webkit-center }
colgroup { display: table-column-group }
col { display: table-column }
thead { display: table-header-group; vertical-align: middle; border-color: inherit }
tbody { display: table-row-group; vertical-align: middle; border-color: inherit }
tfoot { display: table-footer-group; vertical-align: middle; border-color: inherit }
tr { display: table-row; vertical-align: inherit; border-color: inherit }
td, th { display: table-cell; vertical-align: inherit }
th { font-weight: bold }
frameset { border-color: inherit }
body { margin: 8px }
h1 { font-size: 2em; font-weight: bold }
h2 { font-size: 1.5em; font-weight: bold }
h3 { font-size: 1.17em; font-weight: bold }
h4 { font-weight: bold }
h5 { font-size: .83em; font-weight: bold }
h6 { font-size: .67em; font-weight: bold }
:is(article, aside, nav, section) h1 { font-size: 1.5em }
:is(article, aside, nav, section) :is(article, aside, nav, section) h1 { font-size: 1.17em }
address, em, cite, dfn, var, i { font-style: italic }
strong, b { font-weight: bold }
small, sub, sup { font-size: smaller }
big { font-size: larger }
sub { vertical-align: sub }
sup { vertical-align: super }
pre, code, samp, kbd, listing, plaintext, xmp, tt { font-family: monospace }
pre, listing, plaintext, xmp { white-space: pre }
nobr { white-space: nowrap }
u, ins { text-decoration: underline }
s, strike, del { text-decoration: line-through }
center { text-align: -webkit-center }
hr { border-style: inset; border-width: 1px; box-sizing: border-box }
ol { list-style-type: decimal }
ul, menu, dir { list-style-type: disc }
ol ul, ul ul { list-style-type: circle }
ol ol ul, ol ul ul, ul ol ul, ul ul ul { list-style-type: square }
mark { background-color: yellow; color: black }
bdi, output { unicode-bidi: -webkit-isolate }
bdo { unicode-bidi: bidi-override }
iframe { border: 2px inset }
video { object-fit: contain }
area { cursor: pointer }
label { cursor: default }
ruby { text-indent: 0 }
rt { line-height: normal; text-indent: 0 }
ruby > rt { display: block; font-size: 50%; text-align: start }
ruby > rp { display: none }
dialog:not([open]) { display: none }
dialog { position: absolute; left: 0; right: 0; margin: auto; border-style: solid; padding: 1em; background-color: white; color: black }
input, textarea, select, button { font: -webkit-small-control; color: initial; letter-spacing: normal; word-spacing: normal; line-height: normal;
  text-transform: none; text-indent: 0; text-shadow: none; text-rendering: auto; text-align: start }
input { background-color: white; border: 2px inset; padding: 1px; cursor: auto }
input[type="search" i] { box-sizing: border-box }
input[type="hidden" i] { display: none }
input[type="hidden" i], input[type="image" i], input[type="file" i] { padding: initial; background-color: initial }
input[type="file" i] { align-items: baseline; color: inherit; border-color: inherit }
input[type="radio" i], input[type="checkbox" i] { margin: 3px 0.5ex; padding: initial; background-color: initial; box-sizing: border-box }
input[type="range" i] { padding: initial; margin: 2px; color: #909090 }
input[type="color" i] { background-color: ButtonFace; border: 1px #a9a9a9 solid; padding: 1px 2px; width: 44px; height: 23px }
input[type="button" i], input[type="submit" i], input[type="reset" i] { align-items: flex-start; text-align: center; cursor: default;
  color: ButtonText; padding: 2px 6px 3px 6px; border: 2px outset ButtonFace; background-color: ButtonFace; box-sizing: border-box; white-space: pre }
button { align-items: flex-start; text-align: center; cursor: default; color: ButtonText; padding: 2px 6px 3px 6px; border: 2px outset ButtonFace;
  background-color: ButtonFace; box-sizing: border-box }
input[type="button" i]:disabled, input[type="submit" i]:disabled, input[type="reset" i]:disabled, button:disabled { color: GrayText }
textarea { background-color: white; border: 1px solid; flex-direction: column; resize: auto; cursor: auto; padding: 2px; white-space: pre-wrap }
select { align-items: center; border: 1px solid; white-space: pre; background-color: white; color: black; cursor: default; box-sizing: border-box;
  border-radius: 5px }
optgroup { font-weight: bolder }
option { font-weight: normal; white-space: pre; padding: 0 2px 1px 2px; min-height: 1.2em }
progress { box-sizing: border-box; height: 1em; width: 10em; vertical-align: -0.2em }
meter { box-sizing: border-box; height: 1em; width: 5em; vertical-align: -0.2em }
fieldset { border-width: 2px; border-style: groove; border-color: ThreeDFace; min-width: -webkit-min-content }
marquee { display: inline-block }
`;

const HTML = `
area, base, basefont, datalist, head, link, meta, noembed, noframes, param, rp, script, style, template, title { display: none }
html, body { display: block }
address, blockquote, center, dialog, div, figure, figcaption, footer, form, header, hr, legend, listing, main, p, plaintext, pre, search,
  xmp { display: block }
article, aside, h1, h2, h3, h4, h5, h6, hgroup, nav, section { display: block }
dir, dd, dl, dt, menu, ol, ul { display: block }
li { display: list-item; text-align: match-parent }
table { display: table }
caption { display: table-caption }
colgroup { display: table-column-group }
col { display: table-column }
thead { display: table-header-group }
tbody { display: table-row-group }
tfoot { display: table-footer-group }
tr { display: table-row }
td, th { display: table-cell }
input, button, marquee { display: inline-block }
fieldset, details, summary { display: block }
ruby { display: ruby }
rt { display: ruby-text }
slot { display: contents }
dialog:not([open]) { display: none }
embed[hidden] { display: inline; height: 0; width: 0 }
input[type="hidden" i] { display: none !important }
address, blockquote, center, div, figure, figcaption, footer, form, header, hr, legend, listing, main, p, plaintext, pre, search, xmp,
  article, aside, h1, h2, h3, h4, h5, h6, hgroup, nav, section, dir, dd, dl, dt, menu, ol, ul, li, table, caption, colgroup, col, thead,
  tbody, tfoot, tr, td, th, summary { unicode-bidi: isolate }
bdi, output, [dir] { unicode-bidi: isolate }
bdo, bdo[dir] { unicode-bidi: isolate-override }
h1 { font-size: 2em; font-weight: bold }
h2 { font-size: 1.5em; font-weight: bold }
h3 { font-size: 1.17em; font-weight: bold }
h4 { font-size: 1em; font-weight: bold }
h5 { font-size: 0.83em; font-weight: bold }
h6 { font-size: 0.67em; font-weight: bold }
address, cite, dfn, em, i, var { font-style: italic }
b, strong { font-weight: bolder }
code, kbd, listing, plaintext, pre, samp, tt, xmp { font-family: monospace }
listing, plaintext, pre, xmp { white-space: pre }
big { font-size: larger }
small { font-size: smaller }
sub { vertical-align: sub }
sup { vertical-align: super }
sub, sup { line-height: normal; font-size: smaller }
nobr { white-space: nowrap }
:link { color: #0000EE }
:visited { color: #551A8B }
:link, :visited { text-decoration: underline; cursor: pointer }
mark { background: yellow; color: black }
abbr[title], acronym[title] { text-decoration: dotted underline }
ins, u { text-decoration: underline }
del, s, strike { text-decoration: line-through }
hr { color: gray; border-style: inset; border-width: 1px; overflow: hidden }
dir, menu, ol, ul { padding-inline-start: 40px }
menu, ol, ul { counter-reset: list-item }
ol { list-style-type: decimal }
dir, menu, ul { list-style-type: disc }
:is(dir, menu, ol, ul) :is(dir, menu, ul) { list-style-type: circle }
:is(dir, menu, ol, ul) :is(dir, menu, ol, ul) :is(dir, menu, ul) { list-style-type: square }
dd { margin-inline-start: 40px }
table { box-sizing: border-box; border-spacing: 2px; border-collapse: separate; text-indent: initial }
td, th { padding: 1px }
th { font-weight: bold }
caption { text-align: center }
thead, tbody, tfoot, table > tr { vertical-align: middle }
tr, td, th { vertical-align: inherit }
iframe { border: 2px inset }
video { object-fit: contain }
details > summary:first-of-type { display: list-item; counter-increment: list-item 0; list-style: disclosure-closed inside }
details[open] > summary:first-of-type { list-style-type: disclosure-open }
dialog { position: absolute; inset-inline-start: 0; inset-inline-end: 0; width: fit-content; height: fit-content; margin: auto; border: solid;
  padding: 1em; background-color: Canvas; color: CanvasText }
[popover] { position: fixed; inset: 0; width: fit-content; height: fit-content; margin: auto; border: solid; padding: 0.25em; overflow: auto;
  color: CanvasText; background-color: Canvas }
[popover]:not(:popover-open):not(dialog[open]) { display: none }
input, select, button, textarea { letter-spacing: initial; word-spacing: initial; line-height: initial; text-transform: initial;
  text-indent: initial; text-shadow: initial; appearance: auto }
input:not([type="image" i], [type="range" i], [type="checkbox" i], [type="radio" i]) { overflow: clip !important; overflow-clip-margin: 0 !important }
input[type="hidden" i], input[type="file" i], input[type="image" i] { appearance: none }
input, select, textarea { text-align: initial }
input:is([type="reset" i], [type="button" i], [type="submit" i]), button { text-align: center }
input:is([type="radio" i], [type="checkbox" i], [type="reset" i], [type="button" i], [type="submit" i], [type="color" i], [type="search" i]),
  select, button { box-sizing: border-box }
textarea { white-space: pre-wrap }
meter, progress { appearance: auto }
fieldset { border: groove 2px rgb(204, 204, 204); min-inline-size: min-content }
marquee { text-align: initial; overflow: hidden !important }
`;

const SIMPLE = /^[a-z][a-z0-9]*$/;

// An attribute a selector without a subject tag requires ('popover' for
// [popover]:not(:popover-open), 'href' for :link), or null.
function subjectAttribute(selector) {
  const subject = selector.slice(selector.lastIndexOf(' ') + 1);
  if (subject.startsWith(':link') || subject.startsWith(':visited')) return 'href';
  return /^\[([a-z-]+)[\]=]/.exec(subject)?.[1] ?? null;
}

// Splits a sheet into [selectors, declarations] pairs.
function rules(text) {
  const out = [];
  for (const chunk of text.split('}')) {
    const brace = chunk.indexOf('{');
    if (brace < 0) continue;
    out.push([chunk.slice(0, brace).trim(), chunk.slice(brace + 1).trim()]);
  }
  return out;
}

// A selector list's selectors (commas inside :is() and :not() kept).
function selectorList(text) {
  const out = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

const bySpecificityThenOrder = (a, b) => b.specificity - a.specificity || b.order - a.order;

// The tag a selector's rightmost compound requires ('input' for
// input[type="hidden" i], 'rt' for ruby > rt), or null ([dir], :link).
function subjectTag(selector) {
  let depth = 0,
    start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) start = i + 1;
  }
  return /^[a-z][a-z0-9]*/.exec(selector.slice(start))?.[0] ?? null;
}

// A property's declarations at one importance: the rules of single type
// selectors by tag, and the other rules (all more specific than a type
// selector) by the tag they require, or in any when they require none;
// anyAttributes: the attributes one of which the rules in any require
// ([popover], :link), null when one of them requires none. A rule: {
// specificity, order, value, via (the declared property: border for
// border: 2px inset) }, and match for the others.
const newEntry = () => ({ tags: new Map(), byTag: new Map(), any: [], anyAttributes: [] });

// The sheet split into rules and declarations, text only: values are
// parsed (validated by the profile's CSS rules) and selectors compiled
// when a property they may declare is first read, so a test file pays
// for the few properties it reads (display, visibility), not the sheet.
function splitSheet(text) {
  const decls = []; // { property, text, rule, order, parsed }
  for (const [selectorText, body] of rules(text)) {
    const rule = { selectors: selectorList(selectorText), compiled: null };
    for (const part of body.split(';')) {
      const colon = part.indexOf(':');
      if (colon < 0) continue;
      decls.push({ property: part.slice(0, colon).trim(), text: part.trim(), rule, order: decls.length, parsed: null });
    }
  }
  return decls;
}

// A rule's selectors: single type selectors, and the others compiled.
function compiledRule(rule) {
  if (rule.compiled !== null) return rule.compiled;
  const simple = [],
    complex = [];
  for (const selector of rule.selectors) {
    if (SIMPLE.test(selector)) {
      simple.push(selector);
      continue;
    }
    // A selector the engine does not know leaves its rule out.
    let compiled;
    try {
      compiled = compileRuleSelector(selector);
    } catch {
      continue;
    }
    const tag = subjectTag(selector);
    for (const { match, specificity } of compiled)
      complex.push({ match, specificity, tag, attribute: tag === null ? subjectAttribute(selector) : null });
  }
  return (rule.compiled = { simple, complex });
}

// Whether a declared property can set name: itself, or a shorthand of it
// (margin for margin-top, border for border-top and border-top-color).
const mayDeclare = (property, name) =>
  property === name || name.startsWith(`${property}-`) || SHORTHANDS[property]?.includes(name) === true;

// The index of one sheet for one CSS mode and style surface: name ->
// { normal, important } (an entry or null), built per name on first read.
function sheetIndex(text, mode, surface, expand) {
  return { decls: splitSheet(text), mode, surface, expand, names: new Map() };
}

// A declaration's [name, value, important, declared property] entries,
// parsed and expanded when first needed.
function parsedDeclaration(index, decl) {
  if (decl.parsed === null) {
    const parsed = parseDeclarations(decl.text, index.mode, index.surface);
    decl.parsed = [];
    for (const [property, { value, important }] of parsed) {
      for (const [n, v] of index.expand(property, value, parsed.legacyFont))
        decl.parsed.push([n, v, important, property]);
    }
  }
  return decl.parsed;
}

const NONE = Object.freeze({ normal: null, important: null });
function declarationsOf(index, name) {
  let slot = index.names.get(name);
  if (slot !== undefined) return slot;
  for (const decl of index.decls) {
    if (!mayDeclare(decl.property, name)) continue;
    for (const [n, v, important, via] of parsedDeclaration(index, decl)) {
      if (n !== name) continue;
      slot ??= { normal: null, important: null };
      const entry = important ? (slot.important ??= newEntry()) : (slot.normal ??= newEntry());
      const { simple, complex } = compiledRule(decl.rule);
      for (const tag of simple) entry.tags.set(tag, { specificity: 1, order: decl.order, value: v, via });
      for (const { match, specificity, tag, attribute } of complex) {
        let list = entry.any;
        if (tag !== null) {
          list = entry.byTag.get(tag);
          if (!list) entry.byTag.set(tag, (list = []));
        } else if (attribute === null) entry.anyAttributes = null;
        else if (entry.anyAttributes !== null && !entry.anyAttributes.includes(attribute))
          entry.anyAttributes.push(attribute);
        list.push({ match, specificity, order: decl.order, value: v, via });
      }
    }
  }
  if (slot !== undefined) {
    for (const entry of [slot.normal, slot.important]) {
      if (entry === null) continue;
      entry.any.sort(bySpecificityThenOrder);
      for (const list of entry.byTag.values()) list.sort(bySpecificityThenOrder);
    }
  }
  slot ??= NONE;
  index.names.set(name, slot);
  return slot;
}

const NO_SCOPE = {};
function firstRule(list, element) {
  if (list !== undefined) for (const rule of list) if (rule.match(element, NO_SCOPE)) return rule;
  return null;
}

function lookup(entry, element) {
  const tag = element[S].tag;
  const own = firstRule(entry.byTag.get(tag), element);
  const any = entry.any.length ? firstRule(entry.any, element) : null;
  const rule = own === null ? any : any === null || bySpecificityThenOrder(own, any) <= 0 ? own : any;
  return rule ?? entry.tags.get(tag);
}

// The sheets indexed, by generation, mode and surface (null: jsdom 30.1
// and later).
const indexes = new Map();
const surfaceIndexes = new WeakMap();
function indexFor(window, expand) {
  const ws = window[S];
  const mode = validationModeOf(window),
    surface = styleSurfaceOf(window);
  const generation = ws.compat.jsdom >= 27 ? 'html' : 'legacy';
  const key = `${generation} ${mode}`;
  let cache = indexes;
  if (surface !== null) {
    cache = surfaceIndexes.get(surface);
    if (!cache) surfaceIndexes.set(surface, (cache = new Map()));
  }
  let index = cache.get(key);
  if (!index) cache.set(key, (index = sheetIndex(generation === 'html' ? HTML : LEGACY, mode, surface, expand)));
  return (ws.uaIndex = index);
}

// The user agent sheet's declarations of a longhand (or of a shorthand
// jsdom does not expand): { normal, important }, each null when it
// declares none. expand: the cascade's shorthand expansion. Neither sheet
// declares a custom property, so --* names skip the index: the process-wide
// index keeps every name it has seen, and generated custom property names
// would accumulate there over a long test process.
export function uaDeclarations(window, name, expand) {
  if (name.startsWith('--')) return NONE;
  return declarationsOf(window[S].uaIndex ?? indexFor(window, expand), name);
}

// The rule that declares a value for an element when it is more specific
// than specificity, or undefined: the cascade's test against a page rule,
// which skips the rules that cannot be (the lists are by specificity) and,
// without the attributes they require, those without a subject tag.
function hasAny(attrs, names) {
  if (names === null) return true;
  for (let i = 0; i < names.length; i++) if (attrs.has(names[i])) return true;
  return false;
}
export function uaRuleOver(entry, element, specificity) {
  if (entry === null) return undefined;
  const es = element[S];
  const tag = es.tag;
  let rule = null;
  const own = entry.byTag.get(tag);
  if (own !== undefined && own[0].specificity > specificity) rule = firstRule(own, element);
  const any = entry.any;
  if (
    any.length &&
    any[0].specificity > specificity &&
    (rule === null || any[0].specificity > rule.specificity) &&
    hasAny(es.attrs, entry.anyAttributes)
  ) {
    const other = firstRule(any, element);
    if (other !== null && (rule === null || bySpecificityThenOrder(rule, other) > 0)) rule = other;
  }
  if (rule === null && specificity < 1) rule = entry.tags.get(tag) ?? null;
  return rule !== null && rule.specificity > specificity ? rule : undefined;
}

// The declarations that set one of names (a shorthand and its longhands),
// in the sheet's order, for the in-order cascade (cascade.js
// userAgentInOrder): { via (the declared property), important, values
// (name -> value), simple (type selectors), complex ({ match, specificity
// }) }; key names the list, kept with the sheet's index.
export function uaInOrder(window, key, names, expand) {
  const index = window[S].uaIndex ?? indexFor(window, expand);
  const lists = (index.inOrder ??= new Map());
  let list = lists.get(key);
  if (list !== undefined) return list;
  list = [];
  for (const decl of index.decls) {
    if (!names.some((name) => mayDeclare(decl.property, name))) continue;
    let values = null,
      important = false,
      via = null;
    for (const [n, v, imp, property] of parsedDeclaration(index, decl)) {
      if (!names.includes(n)) continue;
      (values ??= new Map()).set(n, v);
      important = imp;
      via = property;
    }
    if (values === null) continue;
    const { simple, complex } = compiledRule(decl.rule);
    list.push({ via, important, values, simple, complex });
  }
  lists.set(key, list);
  return list;
}

// A declaration's value for an element, or undefined.
export const uaValue = (entry, element) => (entry === null ? undefined : lookup(entry, element)?.value);
