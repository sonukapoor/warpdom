// Computed style (CSS Cascade 5, CSSOM getComputedStyle): the cascade over
// the style sheets of an element's root and its style attribute,
// shorthands expanded into longhands, inheritance, initial values and
// computed colors. Values are otherwise kept as specified: without layout
// there are no used values (width: 50% stays 50%).
//
// Each root (a document or a shadow root) keeps an index of its style
// rules' declarations by longhand, sorted by importance, specificity and
// order; it is rebuilt only when the root's style sheets or their rules
// change. Reading a property tests only the rules that declare it.
//
// As in jsdom, and so as tests expect: rules inside @media, @supports and
// @layer blocks are not applied, constructed (adopted) style sheets are
// not applied, and the hidden attribute hides an element whatever its
// display rules say (but not over its style attribute).
import { S, ELEMENT_NODE, HTML_NS, rootOf, nextInTree, cssomChanges } from './internal.js';
import { LONGHANDS, SHORTHANDS, ALIASES } from './css-data.js';
import { resolveColor } from './colors.js';
import { segments, expand, serializeBox, BOX, PAIRS, CSS_WIDE } from './shorthands.js';
import { compileRuleSelector } from './selectors.js';
import { directionality } from './directionality.js';
import { documentStyleSheets, styleElementSheet } from './cssom.js';
import { parseDeclarations, computed, validationModeOf, isLegacyMode } from './css.js';

// --- the rule index ------------------------------------------------------------------

function addDeclarations(index, decls, entries, counter) {
  for (const [property, { value, important }] of decls) {
    for (const [name, v] of expand(property, value)) {
      let lists = index.get(name);
      if (!lists) index.set(name, lists = { normal: [], important: [] });
      const order = counter.n++;
      for (const { match, specificity } of entries) (important ? lists.important : lists.normal).push({ match, specificity, order, value: v });
    }
  }
}

const bySpecificityThenOrder = (a, b) => b.specificity - a.specificity || b.order - a.order;

// Whether the style rules of a top-level @media rule apply, as in jsdom
// (which evaluates no media features): jsdom 27 and later apply a list
// with an empty, "all" or "screen" query; jsdom 26 one with "screen".
// Rules inside other grouping rules never apply, as in jsdom.
function mediaApplies(rule, mode) {
  const list = rule[S].media[S].list;
  if (isLegacyMode(mode)) return list.includes('screen');
  return list.length === 0 || list.includes('all') || list.includes('screen');
}

function buildIndex(sheets, mode) {
  const index = new Map();
  const counter = { n: 0 };
  const addRule = (rule) => {
    let entries;
    try { entries = compileRuleSelector(rule[S].selectorText); } catch { return; }
    addDeclarations(index, rule[S].style[S].decls, entries, counter);
  };
  for (const sheet of sheets) {
    const ss = sheet[S];
    if (ss.disabled) continue;
    for (const rule of ss.rules) {
      const proto = Object.getPrototypeOf(rule);
      if (proto === ss.protos.CSSStyleRule) addRule(rule);
      else if (proto === ss.protos.CSSMediaRule && mediaApplies(rule, mode)) {
        for (const inner of rule[S].rules) if (Object.getPrototypeOf(inner) === ss.protos.CSSStyleRule) addRule(inner);
      }
    }
  }
  for (const lists of index.values()) {
    lists.normal.sort(bySpecificityThenOrder);
    lists.important.sort(bySpecificityThenOrder);
  }
  return index;
}

const isStyleElement = (n) => n[S].type === ELEMENT_NODE && n[S].tag === 'style' && n[S].ns === HTML_NS;

function shadowSheets(root) {
  const sheets = [];
  for (let n = root[S].first; n; n = nextInTree(n, root)) {
    if (isStyleElement(n)) { const sheet = styleElementSheet(n); if (sheet) sheets.push(sheet); }
  }
  return sheets;
}

const sameSheets = (a, b) => a.length === b.length && a.every((sheet, i) => sheet === b[i]);

const EMPTY = new Map();

// The rule index for an element's root: its shadow root's style sheets,
// else its document's (disconnected elements too, as in jsdom).
function ruleIndex(element) {
  const es = element[S];
  const ds = es.doc[S];
  const root = rootOf(element);
  const holder = root[S].shadow === true ? root[S] : ds;
  const cached = holder.cascade;
  const treeRev = ds.treeRev ?? 0;
  const styleRev = ds.styleRev ?? 0;
  if (cached && cached.treeRev === treeRev && cached.styleRev === styleRev && cached.cssomRev === cssomChanges.rev) return cached.index;
  const sheets = holder === ds ? documentStyleSheets(es.doc)[S].items() : shadowSheets(root);
  const index = cached && cached.cssomRev === cssomChanges.rev && sameSheets(cached.sheets, sheets)
    ? cached.index
    : sheets.length ? buildIndex(sheets, validationModeOf(ds.window)) : EMPTY;
  holder.cascade = { treeRev, styleRev, cssomRev: cssomChanges.rev, sheets: sheets.slice(), index };
  return index;
}

// --- the cascade ---------------------------------------------------------------------

// The style attribute's declarations, expanded, cached per attribute value.
function inlineDeclarations(element) {
  const es = element[S];
  const text = es.attrs.get('style');
  if (text === undefined) return null;
  if (es.inlineCascade?.text === text) return es.inlineCascade.map;
  const map = new Map();
  for (const [property, { value, important }] of parseDeclarations(text, validationModeOf(es.doc[S].window))) {
    for (const [name, v] of expand(property, value)) {
      if (!important && map.get(name)?.important) continue;
      map.set(name, { value: v, important });
    }
  }
  es.inlineCascade = { text, map };
  return map;
}

const NO_SCOPE = {};
function firstMatch(list, element) {
  for (const entry of list) if (entry.match(element, NO_SCOPE)) return entry.value;
  return undefined;
}

// The cascaded value: important inline, important rules, inline, rules.
// Cached per element until its root's rules, the document's tree or
// attributes, or its style attribute change.
function cascaded(element, name) {
  const es = element[S];
  const index = ruleIndex(element);
  const rev = es.doc[S].treeRev ?? 0;
  const inlineMap = inlineDeclarations(element);
  let cache = es.cascaded;
  if (!cache || cache.index !== index || cache.rev !== rev || cache.inline !== inlineMap) {
    cache = es.cascaded = { index, rev, inline: inlineMap, values: new Map() };
  } else if (cache.values.has(name)) return cache.values.get(name);
  const value = cascade(element, index, inlineMap, name);
  cache.values.set(name, value);
  return value;
}

function cascade(element, index, inlineMap, name) {
  const inline = inlineMap?.get(name);
  if (inline?.important) return inline.value;
  const lists = index.get(name);
  if (lists?.important.length) {
    const v = firstMatch(lists.important, element);
    if (v !== undefined) return v;
  }
  if (inline) return inline.value;
  return lists?.normal.length ? firstMatch(lists.normal, element) : undefined;
}

// --- computed values ------------------------------------------------------------------

// The parent in the flat tree, for inheritance: a shadow root's children
// inherit from its host.
function inheritParent(element) {
  const p = element[S].parent;
  if (!p) return null;
  if (p[S].type === ELEMENT_NODE) return p;
  return p[S].shadow === true ? p[S].host : null;
}

// The HTML standard's rendering section (user agent style sheet), display only.
const DISPLAY = {
  none: ['head', 'script', 'style', 'template', 'title', 'meta', 'link', 'base', 'noscript', 'area', 'datalist', 'param', 'rp'],
  block: ['html', 'body', 'div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'address',
    'blockquote', 'figure', 'figcaption', 'form', 'fieldset', 'legend', 'details', 'summary', 'dialog', 'hr', 'pre',
    'ul', 'ol', 'menu', 'dl', 'dd', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'search', 'center', 'listing',
    'plaintext', 'xmp', 'optgroup'],
  'list-item': ['li'],
  table: ['table'], 'table-row': ['tr'], 'table-cell': ['td', 'th'], 'table-caption': ['caption'],
  'table-row-group': ['tbody'], 'table-header-group': ['thead'], 'table-footer-group': ['tfoot'],
  'table-column': ['col'], 'table-column-group': ['colgroup'],
  'inline-block': ['button', 'input', 'select', 'textarea', 'meter', 'progress', 'img', 'video', 'audio', 'iframe', 'canvas', 'embed', 'object'],
  ruby: ['ruby'], 'ruby-text': ['rt'],
};
const DEFAULT_DISPLAY = new Map();
for (const [display, tags] of Object.entries(DISPLAY)) for (const tag of tags) DEFAULT_DISPLAY.set(tag, display);

const FONT_SIZES = { medium: '16px' };
const FONT_WEIGHTS = { normal: '400', bold: '700' };
const BORDER_WIDTHS = { thin: '1px', medium: '3px', thick: '5px' };
const BORDER_WIDTH = /^border-(top|right|bottom|left)-width$/;

// Computes a specified value: colors resolved, currentcolor to the color
// property, a 0 length to 0px, keyword font sizes, weights and border
// widths to numbers and lengths.
function computeValue(element, name, value, data) {
  if (data[2]) {
    const parts = segments(value);
    for (let i = 0; i < parts.length; i += 2) {
      const token = parts[i];
      if (!token) continue;
      if (token.toLowerCase() === 'currentcolor') {
        parts[i] = name === 'color' ? inheritedValue(element, 'color', data) : computedValue(element, 'color');
      } else {
        parts[i] = resolveColor(token) ?? token;
      }
    }
    value = parts.join('');
  }
  if (data[3] && value === '0') return '0px';
  if (name === 'font-size') return FONT_SIZES[value.toLowerCase()] ?? value;
  if (name === 'font-weight') return FONT_WEIGHTS[value.toLowerCase()] ?? value;
  if (BORDER_WIDTH.test(name)) {
    const style = computedValue(element, name.replace('-width', '-style')).toLowerCase();
    if (style === 'none' || style === 'hidden') return '0px';
    return BORDER_WIDTHS[value.toLowerCase()] ?? value;
  }
  return value;
}

// Initial values are computed too, except that an initial 0 stays 0, as
// in jsdom (margin-top: 0, but margin: 0 auto gives margin-top: 0px).
function initialValue(element, name, data) {
  if (name === 'display') return DEFAULT_DISPLAY.get(element[S].tag) ?? 'inline';
  if (data[0] === null) return '';
  return data[0] === '0' ? '0' : computeValue(element, name, data[0], data);
}

function inheritedValue(element, name, data) {
  const parent = inheritParent(element);
  return parent ? computedValue(parent, name) : initialValue(element, name, data);
}

// var() references replaced by the custom properties' computed values;
// undefined when one is missing and has no fallback.
function substitute(element, value, depth = 0) {
  if (depth > 16) return undefined;
  let out = '';
  let i = 0;
  for (;;) {
    const at = value.indexOf('var(', i);
    if (at < 0) return out + value.slice(i);
    out += value.slice(i, at);
    let depthParen = 0, end = at + 3;
    for (; end < value.length; end++) {
      if (value[end] === '(') depthParen++;
      else if (value[end] === ')' && --depthParen === 0) break;
    }
    const inner = value.slice(at + 4, end);
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    let replacement = computedValue(element, name);
    if (replacement === '') {
      if (comma < 0) return undefined;
      replacement = substitute(element, inner.slice(comma + 1).trim(), depth + 1);
      if (replacement === undefined) return undefined;
    }
    out += replacement;
    i = end + 1;
  }
}

const CUSTOM = [null, 1, 0, 0];


// A shorthand or unknown property: box and pair shorthands from their
// longhands, others as declared.
function shorthandValue(element, name) {
  if (LEGACY_BORDER.has(name) && isLegacyMode(validationModeOf(element[S].doc[S].window))) return legacyBorderValue(element, name);
  const longhands = SHORTHANDS[name];
  if (longhands && BOX.has(name) && longhands.length === 4) return serializeBox(longhands.map((l) => computedValue(element, l)));
  if (longhands && PAIRS.has(name) && longhands.length === 2) {
    const [a, b] = longhands.map((l) => computedValue(element, l));
    return a === b ? a : `${a} ${b}`;
  }
  // The border shorthands, from their computed longhands (width, style,
  // color); border itself only when all four sides agree.
  if (name === 'border' || BORDER_SIDE.test(name)) {
    const sides = name === 'border' ? ['top', 'right', 'bottom', 'left'] : [name.slice(7)];
    const values = sides.map((side) => ['width', 'style', 'color'].map((p) => computedValue(element, `border-${side}-${p}`)).join(' '));
    return values.every((v) => v === values[0]) ? values[0] : '';
  }
  // Other shorthands as declared, as jsdom gives them (so jest-dom's
  // toHaveStyle({ background: 'red' }) compares like with like).
  let value = cascaded(element, name);
  if (value === undefined || CSS_WIDE.has(value.toLowerCase())) return '';
  if (value.includes('var(')) value = substitute(element, value) ?? '';
  return value;
}

const BORDER_SIDE = /^border-(top|right|bottom|left)$/;

// jsdom 26 and earlier: the border shorthands compute to their declared
// values, colors as written (border: 1px solid pink stays so, while
// border-top-color is rgb(255, 192, 203)). border declares the sides and
// border-width, -style and -color too; a longhand declared later does not
// change them, and border-top-width alone leaves border-top empty.
const LEGACY_BORDER = new Set(['border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-width', 'border-style', 'border-color']);
const BORDER_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']);
const LEGACY_WIDTH = /^(thin|medium|thick|[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?[a-z%]*)$/i;
const ZERO_LENGTH = /^[+-]?(0+\.?0*|\.0+)$/;

function legacyBorderValue(element, name) {
  const part = name === 'border-width' ? 0 : name === 'border-style' ? 1 : name === 'border-color' ? 2 : -1;
  let value = name === 'border' ? undefined : cascaded(element, name);
  const own = value !== undefined;
  if (!own) value = cascaded(element, 'border');
  if (value === undefined || CSS_WIDE.has(value.toLowerCase())) return '';
  if (value.includes('var(')) return name === 'border' ? value : '';
  if (own && part >= 0) return value;
  const parts = ['', '', ''];
  const tokens = segments(value);
  for (let i = 0; i < tokens.length; i += 2) {
    const token = tokens[i];
    if (token === '') continue;
    if (BORDER_STYLES.has(token.toLowerCase())) parts[1] = token;
    else if (LEGACY_WIDTH.test(token)) parts[0] = ZERO_LENGTH.test(token) ? '0px' : token;
    else parts[2] = token;
  }
  return part >= 0 ? parts[part] : parts.filter((p) => p !== '').join(' ');
}

// jsdom before 29 (the jsdom bundled with jest-environment-jsdom up to
// Jest 30): an undeclared property computes to '', except display (the
// user agent's, '' for inline elements), visibility, pointer-events and
// color (inherited), background-color and the border colors.
const LEGACY_INLINE = new Set(['img']);
const LEGACY_INHERITED = { visibility: 'visible', 'pointer-events': 'auto' };
const BORDER_COLOR = /^border-(top|right|bottom|left)-color$/;

function legacyDefault(element, name) {
  if (name === 'display') {
    const tag = element[S].tag;
    return LEGACY_INLINE.has(tag) ? '' : DEFAULT_DISPLAY.get(tag) ?? '';
  }
  if (name === 'color' || name in LEGACY_INHERITED) {
    const parent = inheritParent(element);
    if (parent) return computedValue(parent, name);
    if (name !== 'color') return LEGACY_INHERITED[name];
    return element[S].doc[S].window[S].compat.rootColor;
  }
  if (name === 'background-color') return 'rgba(0, 0, 0, 0)';
  if (BORDER_COLOR.test(name)) return computedValue(element, 'color');
  return '';
}

// The HTML standard's rendering section sets `direction` from the
// directionality on elements with a dir attribute, bdi and
// input[type=tel] ([dir]:dir(ltr), bdi:dir(ltr), input[type=tel i]:dir(ltr),
// and the rtl rules); other elements inherit it.
function uaDirection(element) {
  const s = element[S];
  if (s.ns !== HTML_NS) return false;
  return s.attrs.has('dir') || s.tag === 'bdi' || (s.tag === 'input' && s.attrs.get('type')?.toLowerCase() === 'tel');
}

// getComputedStyle(element).getPropertyValue(property).
export function computedValue(element, property) {
  const custom = property.startsWith('--');
  const lower = custom ? property : property.toLowerCase();
  const name = ALIASES[lower] ?? lower;
  const data = custom ? CUSTOM : LONGHANDS[name];
  if (!data) return shorthandValue(element, name);
  // As in jsdom: the hidden attribute wins over display rules, not over
  // the style attribute.
  if (name === 'display' && element[S].ns === HTML_NS && element[S].attrs.has('hidden') && !inlineDeclarations(element)?.has('display')) return 'none';
  let value = cascaded(element, name);
  if (value === undefined && !custom && element[S].doc[S].window[S].compat?.legacyComputedStyle) return legacyDefault(element, name);
  if (value === undefined && name === 'direction' && uaDirection(element)) return directionality(element);
  if (value !== undefined && !custom && value.includes('var(')) value = substitute(element, value);
  const keyword = value === undefined ? (data[1] ? 'inherit' : 'initial') : value.toLowerCase();
  switch (keyword) {
    case 'inherit': return inheritedValue(element, name, data);
    case 'unset': case 'revert': case 'revert-layer': return data[1] ? inheritedValue(element, name, data) : initialValue(element, name, data);
    case 'initial': return custom ? '' : initialValue(element, name, data);
    default: return custom ? value : computeValue(element, name, value, data);
  }
}

export const isDisplayNone = (element) => computedValue(element, 'display') === 'none';

computed.value = computedValue;
