// Computed style (CSS Cascade 5, CSSOM getComputedStyle): the cascade over
// the style sheets of an element's root and its style attribute,
// shorthands expanded into longhands, inheritance, initial values and
// computed colors. Values are otherwise kept as specified: without layout
// there are no used values (width: 50% stays 50%), and, as in jsdom,
// var() is not substituted.
//
// Each root (a document or a shadow root) keeps an index of its style
// rules' declarations by longhand, sorted by importance, specificity and
// order (before jsdom 28.1.0 by order alone: compat.documentOrder); it is
// rebuilt only when the root's style sheets or their rules change.
// Reading a property tests only the rules that declare it.
//
// As in jsdom, and so as tests expect: rules inside @media, @supports and
// @layer blocks are not applied, constructed (adopted) style sheets are
// not applied. The hidden attribute's display: none comes with the user
// agent sheet: before jsdom 28.1.0 under every display rule, from 28.1.0
// as a rule of its own specificity.
import {
  S,
  ELEMENT_NODE,
  DOCUMENT_NODE,
  HTML_NS,
  SVG_NS,
  rootOf,
  cssomChanges,
  ruleListRev,
  connected,
  trackDetachedStyles,
  preprocessCss,
  PlatformURL,
} from './internal.js';
import { LONGHANDS, SHORTHANDS, ALIASES } from './css-data.js';
import {
  DARK_SYSTEM_COLORS,
  DARK_SYSTEM_COLORS_31,
  mixColor,
  resolveColor,
  srgbChannels31,
  systemColorKind,
} from './colors.js';
import {
  segments,
  expand,
  serializeBox,
  BOX,
  PAIRS,
  CSS_WIDE,
  backgroundComponents,
  topLevelCommaSplit,
} from './shorthands.js';
import { compileRuleSelector, documentURL, shadowRule } from './selectors.js';
import { directionality } from './directionality.js';
import {
  absoluteLength,
  absoluteNumber,
  mayResolve,
  sixDigits,
  FONT_SIZE_KEYWORDS,
  relativeWeight,
} from './lengths.js';
import { substituteVars, tooManyTokens, trimEnds } from './var-substitution.js';
import { uaDeclarations, uaDeclarations31, uaValue, uaRule, uaRuleOver, uaInOrder } from './ua-sheet.js';
import { findSlot, assignedNodes } from './slots.js';
import { decodeEscapes, PSEUDO_ELEMENTS } from './conditions31.js';
import { flowOf, isLogical, isLogicalGroup, partnerOf } from './logical.js';
import {
  documentStyleSheets,
  shadowStyleSheets,
  ruleArray,
  ruleListSnapshot,
  ruleListChanged,
  mediaMatches,
  supportsMatches,
} from './cssom.js';
import { UNIVERSAL, matchValue31, registrations31 } from './property31.js';
import { isLengthUnit } from './css-values.js';
import { documentBaseURL } from './base-url.js';
import { serializeString31 } from './parse31.js';
import { canonical31 } from './declared31.js';
import { present31 } from './color31.js';
import { shorthand31, alias31, dropped31, composer31 } from './css31.js';
import {
  parseDeclarations,
  writtenDeclarations,
  cascadeText,
  parsedBox,
  computed,
  validationModeOf,
  styleSurfaceOf,
  isLegacyMode,
  EXPANDED_SHORTHANDS,
  cssString,
} from './css.js';

// --- the rule index ------------------------------------------------------------------

// The [name, value] pairs a declaration contributes to the cascade. jsdom
// (black box: 20 to 26 with cssstyle, 27.0 to 30.1.3) expands only some
// shorthands: gap, overflow, border-radius, inset, outline and the others
// are declared alone, and leave their longhands undeclared (overflow:
// hidden gives overflow-x '' before jsdom 29.0.2, visible from it;
// border-radius: 6px gives border-top-left-radius '' or 0).
// An expanded shorthand declared with var() declares its longhands as
// PENDING (compat.pendingLonghands, black box: jsdom 26 with cssstyle 4.4
// to 4.6, 27.4, 28.1, 29.1.1, 30.1.3): they win the cascade as declared
// values do, and then compute as undeclared, without the user agent
// sheet's (cascade): padding: var(--p) gives a textarea padding-top ''
// before jsdom 29.0.2 and 0 from it, not the user agent sheet's 2px.
// The border shorthands differ: before jsdom 27 one with var() leaves
// the page's border longhands alone, but for a side's own, and hides the
// user agent sheet's border widths and styles, all four sides (HIDE_UA:
// border-width: var(--w) gives a textarea border-top-width and
// border-top-style ''); in a style attribute in jsdom 27 and 28 border
// and its sides with var() are dropped as it is parsed
// (compat.borderVarDrops), border-width, -style and -color declare their
// longhands pending (black box, 27.4.0 and 28.1.0).
const PENDING = '\0pending';
// jsdom 31: a longhand a shorthand with var() set, pending substitution
// (a block's '' value with its src): the shorthand and its value, which
// the longhand computes from (pendingValue).
const PENDING31 = '\0var\0';
const pending31 = (src) => `${PENDING31}${src.name}\0${src.value}`;
const HIDE_UA = '\0hide-ua';
const BORDER_FAMILY = new Set([
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-color',
  'border-style',
]);
const BORDER_SIDE_OR_ALL = /^border(-(top|right|bottom|left))?$/;
const UA_BORDER = [
  'border',
  'border-width',
  'border-style',
  'border-color',
  ...['top', 'right', 'bottom', 'left'].flatMap((side) => [`border-${side}-width`, `border-${side}-style`]),
];
// jsdom 27 to 30.1.2 cascade clip as its declared value reads again: a
// rect() of one component (what rect(0 0 0 0) is written as) is invalid
// there, so the declaration takes no part (a style attribute's leaves a
// rule's to win; black box, 27.4.0 to 30.1.3, #264). 30.1.3 keeps it.
const ONE_COMPONENT_RECT = /^rect\([^,]*\)$/i;

function cascadeExpand(property, value, legacyFont, compat = null) {
  const name = ALIASES[property] ?? property;
  if (name === 'clip' && compat?.clipReparsed === true && ONE_COMPONENT_RECT.test(value) && !value.includes('var('))
    return [];
  const longhands = SHORTHANDS[name];
  if (longhands !== undefined && !EXPANDED_SHORTHANDS.has(name)) return [[name, value]];
  if (compat?.pendingLonghands && longhands !== undefined && value.includes('var(')) {
    if (!BORDER_FAMILY.has(name) || compat.jsdom >= 27) return [[name, value], ...longhands.map((l) => [l, PENDING])];
    // A side (border-top: var(--b)) declares its own longhands pending.
    const side = BORDER_SIDE.test(name);
    const out = [[name, value]];
    for (const l of UA_BORDER) if (!side || !longhands.includes(l)) out.push([l, HIDE_UA]);
    if (side) for (const l of longhands) out.push([l, PENDING]);
    return out;
  }
  return expand(property, value, legacyFont);
}

// layer: the entry's layer (jsdom 31: an id while the index is built,
// then its precedence, layerKeys); scope: its @scope, or null.
function addDeclarations(index, decls, entries, counter, compat, layer = 0, scope = null) {
  // Before jsdom 28.1.0 !important in a style rule counts for nothing
  // (documentOrder); to 29.1.1 a declaration with var() is parsed without
  // it (compat.varDropsImportant, css.js parseInto).
  const ordered = compat?.documentOrder === true;
  // jsdom 30.1.2 reads a rule's value as CSS input here, one an accessor
  // wrote too (CR LF, CR and FF are LF, NUL U+FFFD; css.js preprocessCss);
  // 30.1.3 does not (#282 review).
  const preprocess = compat?.rulesPreprocessed === true;
  for (const [property, decl] of decls) {
    let value = preprocess ? preprocessCss(decl.value) : decl.value;
    if (value === '' && decl.src !== undefined && compat?.computed31) value = pending31(decl.src);
    const important = decl.important && !ordered;
    // A longhand declared as itself (padding-bottom: 7px), not through a
    // shorthand: it meets a pending longhand by order (cascadeByOrder).
    const from = ALIASES[property] ?? property;
    const direct = SHORTHANDS[from] === undefined;
    const pairs = cascadeExpand(property, value, decls.legacyFont, compat);
    index.inOrder.add(pairs, entries, from, important);
    for (const [name, v] of pairs) {
      let lists = index.get(name);
      if (!lists) index.set(name, (lists = { normal: [], important: [], pending: false }));
      if (v === PENDING) lists.pending = true;
      const order = counter.n++;
      for (const { match, specificity } of entries)
        (important ? lists.important : lists.normal).push({
          match,
          specificity,
          order,
          value: v,
          important,
          direct,
          from,
          layer,
          scope,
        });
    }
  }
}

const bySpecificityThenOrder = (a, b) => b.specificity - a.specificity || b.order - a.order;
// Before jsdom 28.1.0 (black box, 20.0.0 to 28.0.0): the page's style rules
// apply in document order, their selectors' specificity and !important
// aside (.a.b > td { color: red } td { color: blue } gives blue; td {
// color: blue !important } .a.b > td { color: red } gives red, and so
// does a style attribute's color over a rule's !important one). The sheets
// in document.styleSheets order, a rule in @media screen at its place.
const byOrder = (a, b) => b.order - a.order;

// Whether the style rules of a top-level @media rule apply, as in jsdom
// before 31 (which evaluates no media features): jsdom 29 and later apply a list
// with an empty, "all" or "screen" query; before (black box, 20.0.0 to
// 28.1.0) one with "screen". Rules inside other grouping rules never
// apply, as in jsdom.
function mediaApplies(rule, mode, compat) {
  const list = rule[S].media[S].list;
  if (isLegacyMode(mode) || compat.jsdom < 29) return list.includes('screen');
  return list.length === 0 || list.includes('all') || list.includes('screen');
}

// --- jsdom 31: @layer and @scope (black box, 31.0.1; CSS Cascade 5 and 6) ---------------

// A layer: its sublayers by name (an anonymous one under a key of its own),
// in the order they first appear; 0 is the unlayered one.
const newLayer = (parent) => ({ parent, children: new Map() });
// The layer a name (a.b too) names under parent, made when first named;
// '' an anonymous one.
function layerNamed(layers, parent, name) {
  if (name === '') {
    layers.push(newLayer(parent));
    layers[parent].children.set(Symbol('anonymous'), layers.length - 1);
    return layers.length - 1;
  }
  let at = parent;
  // (escapes decoded: \61 is a; an escaped dot is part of a name)
  for (const part of layerParts(name)) {
    const key = decodeEscapes(part.trim());
    let id = layers[at].children.get(key);
    if (id === undefined) {
      layers.push(newLayer(at));
      id = layers.length - 1;
      layers[at].children.set(key, id);
    }
    at = id;
  }
  return at;
}
// A layer name's parts: split at its dots, an escaped character (\\ too)
// being part of a part (a\\.b is a\ and b, a\.b one part).
function layerParts(name) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '\\') i++;
    else if (name[i] === '.') {
      parts.push(name.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(name.slice(start));
  return parts;
}
// Each layer's precedence: a layer's sublayers come before its own rules,
// in the order they appeared, the unlayered rules last; !important
// declarations the other way round.
function layerKeys(layers) {
  const rank = new Array(layers.length);
  let n = 0;
  const visit = (id) => {
    for (const child of layers[id].children.values()) visit(child);
    rank[id] = n++;
  };
  visit(0);
  return { normal: rank, important: rank.map((r) => n - 1 - r) };
}
const byLayerThenSpecificity = (a, b) => b.layer - a.layer || b.specificity - a.specificity || b.order - a.order;

// (an implicit scope's owner: the document element, whichever it is now)
const DOCUMENT_ELEMENT = {};
// A @scope rule's scope: { start, end (compiled selector lists, or null),
// owner (with no start: the parent of the sheet's element) }; null when a
// selector does not compile.
// outer: the enclosing @scope's, or null (a nested scope's roots and
// elements are in it too).
// spec31: jsdom 31's selector grammar.
function scopeOf(rule, ss, outer, root, spec31) {
  // (jsdom 31: the texts to match by, cssom.js scopeSelector31)
  const { start, end } = rule[S].match ?? rule[S];
  try {
    const owner = ss.ownerNode?.[S].parent ?? null;
    // (a constructed sheet: the root element when the document adopts it,
    // none in a shadow tree; black box, 31.0.1)
    const constructedOwner = ss.constructed && root === null ? DOCUMENT_ELEMENT : null;
    return {
      // (& in a prelude is :scope: the enclosing scope's root for a start,
      // this scope's for an end)
      start: start === null ? null : compileRuleSelector(scopeTokens(start).text, false, spec31),
      end: end === null ? null : compileRuleSelector(scopeTokens(end).text, false, spec31),
      owner: owner !== null && owner[S].type === ELEMENT_NODE ? owner : constructedOwner,
      outer,
    };
  } catch {
    return null;
  }
}
// Whether a scope's selectors read text (:empty, :dir(auto); what 'text')
// or the URL (:local-link; 'url'): computed values then follow it
// (cascadeCache).
const scopeReads = (scope, what) =>
  scope !== null &&
  (scope.start?.some((e) => e[what]) === true ||
    scope.end?.some((e) => e[what]) === true ||
    scopeReads(scope.outer, what));

// A scoped rule's selectors: :scope implied before each that has neither
// :scope nor & (CSS Cascade 6: .b in @scope (.a) is :where(:scope) .b);
// & is :scope.
function scopedSelector(text) {
  return splitSelectorList(text)
    .map((selector) => {
      const own = selector.trim();
      const { text: replaced, scoped } = scopeTokens(own);
      return scoped ? replaced : `:where(:scope) ${own}`;
    })
    .join(', ');
}
// Whether the name after a : is scope, escapes decoded (:sc\6f pe).
const NAME_AT =
  /^-?(?:[a-zA-Z_]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])(?:[a-zA-Z0-9_-]|\\(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))[ \t\n\r\f]?|\\[^\n0-9a-fA-F])*/;
function isScopeToken(text, at) {
  const m = NAME_AT.exec(text.slice(at, at + 64));
  return m !== null && decodeEscapes(m[0]).toLowerCase() === 'scope';
}
// A selector with its & tokens as :scope, and whether it has & or :scope,
// outside strings and attribute selectors ([data-v="&"] is no &).
function scopeTokens(selector) {
  let out = '',
    scoped = false;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '\\') {
      out += selector.slice(i, i + 2);
      i++;
    } else if (c === '"' || c === "'" || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < selector.length && selector[j] !== close) {
        const q = selector[j];
        if (q === '\\') j++;
        else if (c === '[' && (q === '"' || q === "'")) {
          j++;
          while (j < selector.length && selector[j] !== q) j += selector[j] === '\\' ? 2 : 1;
        }
        j++;
      }
      out += selector.slice(i, j + 1);
      i = j;
    } else if (c === '&') {
      out += ':scope';
      scoped = true;
    } else {
      if (c === ':' && isScopeToken(selector, i + 1)) scoped = true;
      out += c;
    }
  }
  return { text: out, scoped };
}
function splitSelectorList(text) {
  const out = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

// A scoped selector's match: an element the selector matches from one of
// its scope roots (an ancestor or itself matching start), not at or past
// the scope's limit (an element matching end, from that root); the nearest
// root gives the element's proximity (proximity31).
let proximity31 = Infinity;
function scopedMatch(match, scope) {
  return (el) => {
    let hops = 0;
    // (checks of the enclosing scopes kept for this match only: nested
    // scopes would repeat them, exponentially)
    const memo = scope.outer === null ? null : new Map();
    for (let root = el; root !== null; root = scopeParent(root), hops++) {
      if (!scopeHas(scope, root, el, memo)) continue;
      if (match(el, { scope: root })) {
        proximity31 = hops;
        return true;
      }
    }
    return false;
  };
}
// Whether root is a root of scope that has el in it: it matches the start
// (no start: is the owner), el is not at or past the limit from it, and
// both are in the enclosing scope.
function scopeHas(scope, root, el, memo) {
  if (scope.end !== null && limited(scope.end, root, el, { scope: root })) return false;
  if (scope.outer === null) return startMatches(scope, root, NO_SCOPE);
  // (a nested scope's start is matched with :scope the enclosing root)
  for (let outer = root; outer !== null; outer = scopeParent(outer)) {
    if (!outerHas(scope.outer, outer, root, memo) || !startMatches(scope, root, { scope: outer })) continue;
    if (el === root || outerHas(scope.outer, outer, el, memo)) return true;
  }
  return false;
}
const startMatches = (scope, root, ctx) =>
  scope.start === null
    ? root === scope.owner || (scope.owner === DOCUMENT_ELEMENT && root[S].parent?.[S].type === DOCUMENT_NODE)
    : scope.start.some((s) => s.match(root, ctx));
function outerHas(scope, root, el, memo) {
  let byScope = memo.get(scope);
  if (byScope === undefined) memo.set(scope, (byScope = new Map()));
  let byRoot = byScope.get(root);
  if (byRoot === undefined) byScope.set(root, (byRoot = new Map()));
  let known = byRoot.get(el);
  if (known === undefined) byRoot.set(el, (known = scopeHas(scope, root, el, memo)));
  return known;
}
// Whether an element is at or past a scope's limit from a root.
function limited(end, root, el, ctx) {
  for (let e = el; e !== null && e !== root; e = scopeParent(e)) if (end.some((s) => s.match(e, ctx))) return true;
  return false;
}
// A scope's roots and limits are DOM ancestors in the element's own tree,
// not the flat tree's (jsdom 31, black box: a slot is not a slotted
// element's scope root or limit, #340 review).
function scopeParent(element) {
  const p = element[S].parent;
  return p !== null && p[S].type === ELEMENT_NODE ? p : null;
}

// --- jsdom 31: pseudo-elements ------------------------------------------------------

// A pseudo-element's name from getComputedStyle()'s argument (black box,
// 31.0.1): '' for the element's own style ('', no colon, null), null for
// one jsdom 31 does not know (its style is empty: ::foo, ::part(x),
// ::slotted(a), a space after it); :before, :after, :first-line and
// :first-letter as ::.
const LEGACY_PSEUDO = new Set(['before', 'after', 'first-line', 'first-letter']);
const NOT_COMPUTED = new Set(['part(', 'slotted(']);
// ::before::marker and ::after::marker (:before::marker too): the marker
// of a ::before or ::after (black box, 31.0.1; other chains are none)
const CHAINS = new Set(['before::marker', 'after::marker']);
export function pseudoName31(text) {
  if (!text.startsWith(':')) return '';
  // (read as identifiers first, then their escapes decoded: ::b\65 fore
  // is ::before, but an escaped colon or parenthesis is part of the name,
  // ::before\::marker or ::highlight\28 x\29 none)
  const chained = CHAINED.exec(text);
  if (chained !== null) {
    const first = decodeEscapes(chained[1]).toLowerCase();
    const key = `${first}::${decodeEscapes(chained[2]).toLowerCase()}`;
    return CHAINS.has(key) ? key : null;
  }
  const m = PSEUDO_NAME.exec(text);
  // (the legacy single-colon ones take no arguments: :before(x) is none)
  if (m === null || (m[1] === ':' && m[3] !== undefined)) return null;
  // (a function left open at the end is closed there, as CSS closes one at
  // the end of its input: ::highlight(x\29 is ::highlight(x\29))
  let args = m[3];
  if (args !== undefined) {
    args = args.slice(1);
    if (args.endsWith(')') && !escapedAt(args, args.length - 1)) args = args.slice(0, -1);
  }
  const name = decodeEscapes(m[2]).toLowerCase();
  if (m[3] === undefined)
    return (m[1] === ':' ? LEGACY_PSEUDO.has(name) : PSEUDO_ELEMENTS.has(name) && !NOT_COMPUTED.has(name))
      ? name
      : null;
  // (a functional one's argument: one identifier, escapes decoded, its
  // case kept: ::highlight(X) is not ::highlight(x))
  const key = `${name}(`;
  if (!PSEUDO_ELEMENTS.has(key) || NOT_COMPUTED.has(key)) return null;
  const arg = pseudoArgument(args);
  return arg === null ? null : `${key}${arg})`;
}
function pseudoArgument(text) {
  let start = 0;
  let end = text.length;
  while (start < end && isCssSpace(text.charCodeAt(start))) start++;
  while (end > start && literalSpace(text, end - 1)) end--;
  const arg = text.slice(start, end);
  return PSEUDO_ARGUMENT.test(arg) ? decodeEscapes(arg) : null;
}
// A selector's pseudo-element at its end: { base (the originating
// element's selector), name }, or null. Its colon is the last one outside
// strings, brackets, parentheses and escapes (.x\\:before is a class);
// CSS whitespace or a combinator before it makes the base any element
// there (p ::before, p >\t::before).
const escapedAt = (text, i) => {
  let n = 0;
  while (i - n > 0 && text[i - n - 1] === '\\') n++;
  return n % 2 === 1;
};
// Whether the whitespace at i ends a hexadecimal escape (\\78 ), as part
// of its identifier: only one, after one to six digits.
const isHexDigit = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
function endsHexEscape(text, i) {
  // (CR LF is one newline: its LF ends the escape when its CR does)
  if (text[i] === '\n' && i > 0 && text[i - 1] === '\r') i--;
  for (let k = 1; k <= 7 && i - k >= 0; k++) {
    if (text[i - k] === '\\') return k > 1 && !escapedAt(text, i - k);
    if (!isHexDigit(text.charCodeAt(i - k))) return false;
  }
  return false;
}
// CSS whitespace at i that is no part of an identifier.
const literalSpace = (text, i) => isCssSpace(text.charCodeAt(i)) && !escapedAt(text, i) && !endsHexEscape(text, i);
function stringEnd(text, i) {
  const quote = text[i];
  for (i++; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === quote) return i + 1;
  }
  return text.length;
}
function pseudoTail31(selector) {
  let end = selector.length;
  while (end > 0 && literalSpace(selector, end - 1)) end--;
  let colon = -1;
  let previous = -1;
  let depth = 0;
  for (let i = 0; i < end; i++) {
    const c = selector[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'") i = stringEnd(selector, i) - 1;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ':' && depth === 0) {
      previous = colon;
      colon = i;
      if (selector[i + 1] === ':') i++;
    }
  }
  if (colon < 0) return null;
  let name = pseudoName31(selector.slice(colon, end));
  if (name === null || name === '') return null;
  // (a pseudo-element right after another: ::before::marker, or a rule
  // that matches nothing, INVALID_TAIL)
  if (previous >= 0) {
    const before = pseudoName31(selector.slice(previous, colon));
    if (before !== null && before !== '') {
      const chained = pseudoName31(selector.slice(previous, end));
      if (!CHAINS.has(chained)) return INVALID_TAIL;
      name = chained;
      colon = previous;
    }
  }
  let stop = colon;
  while (stop > 0 && literalSpace(selector, stop - 1)) stop--;
  let start = 0;
  while (start < stop && literalSpace(selector, start)) start++;
  const base = selector.slice(start, stop);
  const last = base.charCodeAt(base.length - 1);
  const bare =
    base === '' || stop < colon || ((last === 62 || last === 43 || last === 126) && !escapedAt(base, base.length - 1));
  return { base: bare ? `${base} *`.trim() : base, name };
}
function pseudoTarget() {
  const target = new Map();
  target.inOrder = new InOrderIndex();
  target.textDependent = false;
  target.urlDependent = false;
  target.readsScheme = false;
  target.scoped = false;
  target.layerCount = 1;
  target.pseudo = null;
  target.noPseudo = null;
  target.hostRules = null;
  target.slottedRules = null;
  return target;
}
// jsdom 31 (black box, 31.0.1; CSS Scoping 3): a shadow tree's :host rules
// match its host, its ::slotted() rules an element assigned to one of its
// slots, directly or through slots in other shadow trees (the slot's
// selector matched from the slot in this tree).
const hostMatch = (match, root) => (el, ctx) => el[S].shadowRoot === root && match(el, ctx);
const slottedMatch = (match, slot, root) => (el, ctx) => {
  if (!match(el, ctx)) return false;
  for (let s = findSlot(el); s !== null; s = findSlot(s)) if (rootOf(s) === root) return slot(s, ctx);
  return false;
};
// The shadow trees' rules for an element outside them (hostRules and
// slottedRules: its slots' trees, the outer first, then its own shadow
// tree's), kept with its cascaded values. A pseudo-element's are its
// element's trees' rules for it.
const NO_INNER = [];
// (a shadow root's index for an element, or for its pseudo-element name)
function treeIndex31(root, ds, doc, name) {
  const index = sheetIndex(root[S], ds, root, doc);
  return name === undefined ? index : (index.pseudo?.get(name) ?? null);
}
function innerIndexes31(element) {
  const es = element[S];
  const cache = es.cascaded;
  if (cache !== undefined && cache.inner !== undefined) return cache.inner;
  const ds = es.doc[S];
  let inner = NO_INNER;
  if (ds.shadowHosts === true && ds.window[S].compat.treeScopedSheets === true) {
    const base = es.pseudo === undefined ? element : es.origin;
    const name = es.pseudo;
    for (let slot = findSlot(base); slot !== null; slot = findSlot(slot)) {
      const rules = treeIndex31(rootOf(slot), ds, es.doc, name)?.slottedRules;
      if (rules != null) (inner === NO_INNER ? (inner = []) : inner).push(rules);
    }
    const own = base[S].shadowRoot;
    if (own != null) {
      const rules = treeIndex31(own, ds, es.doc, name)?.hostRules;
      if (rules != null) (inner === NO_INNER ? (inner = []) : inner).push(rules);
    }
  }
  if (cache !== undefined) cache.inner = inner;
  return inner;
}
function pseudoIndex(index, name) {
  index.pseudo ??= new Map();
  let target = index.pseudo.get(name);
  if (target === undefined) index.pseudo.set(name, (target = pseudoTarget()));
  return target;
}
const INVALID_TAIL = { base: '', name: '' };
// (a decoded argument, already checked, as a placeholder when the rule's
// selector is checked: \28 decodes to a parenthesis)
const DECODED_ARGUMENT = /\(.*\)$/s;
const originating = (match) => (node, ctx) => match(node[S].origin, ctx);
// A pseudo-element's own rules in the document's index (one without any
// still one per index, so that its cascaded values go with the index's).
function indexOf31(element, index) {
  const target = index.pseudo?.get(element[S].pseudo);
  if (target !== undefined) return target;
  if (index.noPseudo == null) {
    index.noPseudo = pseudoTarget();
    index.noPseudo.textDependent = index.textDependent === true;
    index.noPseudo.urlDependent = index.urlDependent === true;
    index.noPseudo.readsScheme = index.readsScheme === true;
    index.noPseudo.layerCount = index.layerCount ?? 1;
  }
  return index.noPseudo;
}
// A pseudo-element follows its element into another document (adoptTree
// moves the tree only): its values are cascaded again there.
function followElement31(node) {
  const s = node[S];
  const doc = s.origin[S].doc;
  if (s.doc !== doc) {
    s.doc = doc;
    s.cascaded = undefined;
  }
}

// The node a pseudo-element's computed style reads (getComputedStyle(el,
// '::before')): an element of no namespace, never in the tree, whose
// parent is the originating element (it inherits from it, and its box is
// its child's: a flex container's ::before is blockified); kept per
// element and name. name null: one jsdom 31 does not know, never rendered.
const PSEUDO_NS = 'urn:warpdom:pseudo-element';
const pseudoNodes = new WeakMap();
export function pseudoNode31(element, name, ws) {
  let byName = pseudoNodes.get(element);
  if (byName === undefined) pseudoNodes.set(element, (byName = new Map()));
  const key = name ?? '\0unknown';
  let node = byName.get(key);
  if (node === undefined) {
    // (the window's own factory: no method a test may have replaced)
    node = ws.createElementNS(PSEUDO_NS, 'pseudo', element[S].doc, true);
    // (a chained one's parent is its ::before or ::after, which it
    // inherits from; its origin, the element, is what selectors match)
    // (only the two chains: a functional one's decoded argument may hold
    // :: too, ::highlight(a\:\:b))
    const chain = CHAINS.has(key) ? key.indexOf('::') : -1;
    node[S].parent = chain < 0 ? element : pseudoNode31(element, key.slice(0, chain), ws);
    node[S].origin = element;
    node[S].pseudo = key;
    node[S].kind = chain < 0 ? key : key.slice(chain + 2);
    byName.set(key, node);
  }
  return node;
}
// content's attr() as a string of the attribute's value, the originating
// element's for a pseudo-element (black box, 31.0.1: attr(id) is "p", a
// missing attribute "" or its string fallback; another fallback, or more
// than a name, makes the value normal). The value is written again token
// by token: strings double-quoted, one space between tokens; an attr( in
// a string is text.
const ATTR = /attr\(/i;
// (a backslash before a newline continues the string: nothing)
const stringText = (token) =>
  decodeEscapes(
    token
      .slice(1, token.length > 1 && token.endsWith(token[0]) && !escapedAt(token, token.length - 1) ? -1 : undefined)
      .replace(CONTINUATION, ''),
  );
const CONTINUATION = /\\(?:\r\n|[\n\r\f])/g;
function attrContent31(node, value) {
  if (!ATTR.test(value)) return value;
  const element = node[S].pseudo === undefined ? node : node[S].origin;
  const out = [];
  return contentAt31(element, value, 0, out, 0) === value.length ? out.join(' ') : 'normal';
}
// The tokens of a content value with attr() from i, written into out, in
// one pass over the value (nested fallbacks too); the index where they
// end (at a fallback's closing parenthesis), or -1 when the value is
// normal. fallback: how deep in missing attributes' fallbacks (0: none),
// whose tokens take their place and must be content too (strings, a
// slash, functions, quote keywords; not another identifier or a length:
// black box, 31.0.1). Past MAX_FALLBACKS the value is normal (jsdom 31
// overflows its stack there, from about a thousand).
const MAX_FALLBACKS = 256;
const QUOTE_KEYWORDS = new Set(['open-quote', 'close-quote', 'no-open-quote', 'no-close-quote']);
const ATTR_OPEN = /attr\(/iy;
function contentAt31(element, value, i, out, fallback) {
  if (fallback > MAX_FALLBACKS) return -1;
  while (i < value.length) {
    const c = value[i];
    if (isCssSpace(value.charCodeAt(i))) {
      i++;
      continue;
    }
    if (fallback && c === ')') return i;
    if (c === '"' || c === "'") {
      const end = stringEnd(value, i);
      out.push(cssString(stringText(value.slice(i, end))));
      i = end;
      continue;
    }
    // (the slash before alternative text, a token of its own)
    if (c === '/') {
      out.push('/');
      i++;
      continue;
    }
    ATTR_OPEN.lastIndex = i;
    if (ATTR_OPEN.test(value)) {
      i = attrAt31(element, value, i + 5, out, fallback);
      if (i < 0) return -1;
      continue;
    }
    // (another token: to a space, string or slash, or the parenthesis
    // closing it)
    const j = tokenEnd(value, i);
    if (j === i) return -1;
    const token = value.slice(i, j);
    if (fallback && !token.endsWith(')') && !QUOTE_KEYWORDS.has(token.toLowerCase())) return -1;
    out.push(token);
    i = j;
  }
  return fallback ? -1 : i;
}
function tokenEnd(value, i) {
  let depth = 0;
  for (; i < value.length; i++) {
    const d = value[i];
    if (d === '\\') i++;
    else if (d === '"' || d === "'") {
      if (depth === 0) return i;
      i = stringEnd(value, i) - 1;
    } else if (d === '(') depth++;
    else if (d === ')') {
      if (depth === 0) return i;
      if (--depth === 0) return i + 1;
    } else if (depth === 0 && (d === '/' || isCssSpace(value.charCodeAt(i)))) return i;
  }
  return i;
}
// The index of the parenthesis closing a function whose arguments go on
// from i (strings and nested functions skipped), or the value's length.
function closingParenthesis(value, i) {
  let depth = 0;
  for (; i < value.length; i++) {
    const d = value[i];
    if (d === '\\') i++;
    else if (d === '"' || d === "'") i = stringEnd(value, i) - 1;
    else if (d === '(') depth++;
    else if (d === ')' && depth-- === 0) return i;
  }
  return i;
}
// An attr() whose arguments start at i: its value as a string into out,
// or its fallback's tokens; the index after its closing parenthesis, or
// -1. (A present attribute's fallback is skipped in one scan.)
function attrAt31(element, value, i, out, depth) {
  ATTR_NAME.lastIndex = i;
  const m = ATTR_NAME.exec(value);
  if (m === null) return -1;
  let j = i + m[0].length;
  if (value[j] !== ')' && value[j] !== ',') return -1;
  const es = element[S];
  const name = decodeEscapes(m[2]);
  const text = m[1] !== undefined ? undefined : es.attrs.get(es.ns === HTML_NS ? asciiLower(name) : name);
  if (text !== undefined) {
    out.push(cssString(text));
    if (value[j] === ',') j = closingParenthesis(value, j + 1);
    return value[j] === ')' ? j + 1 : -1;
  }
  if (value[j] === ')') {
    out.push('""');
    return j + 1;
  }
  // (an empty fallback after the comma: normal)
  const before = out.length;
  j = contentAt31(element, value, j + 1, out, depth + 1);
  return j < 0 || value[j] !== ')' || out.length === before ? -1 : j + 1;
}
// attr()'s arguments: a CSS identifier (non-ASCII, escapes, a leading -
// or --), after an optional namespace prefix, then a fallback. Black box,
// 31.0.1: a prefixed name (a|b) reads as missing, *|id makes the value
// normal; only ASCII letters are lowercased on an HTML element.
// (a hex escape read one way only: six digits, or fewer and no digit
// after them, so that no run of digits splits into several escapes)
const ESCAPE = String.raw`\\(?:(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))(?:\r\n|[ \t\n\r\f])?|[^\n\r\f0-9a-fA-F])`;
const IDENT = String.raw`(?:--|-?(?:[A-Za-z_]|[^\x00-\x7f]|${ESCAPE}))(?:[\w-]|[^\x00-\x7f]|${ESCAPE})*`;
// (the name only: the fallback after it is found by hand, so that a long
// one is read in one pass)
const ATTR_NAME = new RegExp(String.raw`[ \t\n\r\f]*(?:(${IDENT})\|)?(${IDENT})[ \t\n\r\f]*`, 'sy');
const PSEUDO_ARGUMENT = new RegExp(String.raw`^${IDENT}$`, 's');
const PSEUDO_NAME = new RegExp(String.raw`^(::?)(${IDENT})(\(.*)?$`, 's');
const CHAINED = new RegExp(String.raw`^::?(${IDENT})::(${IDENT})$`, 's');
const asciiLower = (text) => text.replace(/[A-Z]+/g, (m) => m.toLowerCase());
function pseudoContent31(node, value) {
  if (value !== 'normal') return value;
  const pseudo = node[S].kind;
  if (pseudo === 'before' || pseudo === 'after') return 'none';
  if (pseudo === 'marker' && !computedValue(node[S].parent, 'display').endsWith('list-item')) return 'none';
  return value;
}
// The user agent sheet's rules for pseudo-elements (black box, 31.0.1).
function pseudoUserAgent31(node, name) {
  const pseudo = node[S].kind;
  const parent = node[S].origin[S];
  if (pseudo === 'marker') return MARKER_UA[name];
  if (pseudo === 'backdrop' && name === 'background-color' && parent.tag === 'dialog' && parent.ns === HTML_NS)
    return 'rgba(0, 0, 0, 0.1)';
  if (
    pseudo === 'file-selector-button' &&
    name === 'align-content' &&
    parent.tag === 'input' &&
    parent.ns === HTML_NS &&
    parent.attrs.get('type')?.toLowerCase() === 'file'
  )
    return 'center';
  return undefined;
}
const MARKER_UA = {
  __proto__: null,
  'unicode-bidi': 'isolate',
  'font-variant-numeric': 'tabular-nums',
  'white-space-collapse': 'preserve',
  'text-wrap-mode': 'nowrap',
};

// lists: what was read of rule lists a test can change without the CSSOM
// knowing (ruleListSnapshot).
function buildIndex(sheets, mode, compat, lists, doc = null, root = null) {
  const index = new Map();
  index.inOrder = new InOrderIndex();
  index.textDependent = false;
  index.urlDependent = false;
  index.readsScheme = false;
  index.scoped = false;
  index.layerCount = 1;
  index.pseudo = null;
  index.noPseudo = null;
  index.hostRules = null;
  index.slottedRules = null;
  const counter = { n: 0 };
  // jsdom 31: the layer and @scope the walk is in (layers: CSS Cascade 5;
  // layer 0 is the unlayered one).
  const layers = [newLayer(null)];
  let layer = 0,
    scope = null;
  // A rule's declarations for the selectors that compile; target: the
  // index (or a pseudo-element's, pseudoIndex).
  const addSelectors = (text, rule, target, pseudo) => {
    // (a shadow tree's: rules for its host and its slots' elements apart,
    // shadowRules)
    if (root !== null && scope === null) {
      text = shadowRules(text, rule, target, pseudo);
      if (text === null) return false;
      if (text === '') return true;
    }
    let entries;
    try {
      entries = compileRuleSelector(scope === null ? text : scopedSelector(text), compat?.treeScopedSheets === true);
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entry.text) index.textDependent = true;
      if (entry.url) index.urlDependent = true;
    }
    if (scope !== null) {
      target.scoped = true;
      entries = entries.map((entry) => ({ ...entry, match: scopedMatch(entry.match, scope) }));
    }
    // (a pseudo-element's selector matches its originating element, scope
    // limits too, with a pseudo-element's specificity added)
    if (pseudo) entries = entries.map((e) => ({ ...e, match: originating(e.match), specificity: e.specificity + 1 }));
    addDeclarations(target, rule[S].style[S].decls, entries, counter, compat, layer, scope);
    return true;
  };
  // A shadow tree's selectors whose subject is outside it (its host, or an
  // element in one of its slots: shadowRule) go to the target's hostRules
  // and slottedRules, which only those elements read (innerIndexes31);
  // the rest, as text, stay for the target (null: invalid).
  const shadowRules = (text, rule, target, pseudo) => {
    const rest = [];
    for (const selector of splitSelectorList(text)) {
      let found;
      try {
        found = shadowRule(selector);
      } catch {
        return null;
      }
      if (found === null) {
        rest.push(selector);
        continue;
      }
      // (:local-link in an element of another tree: the document's elements
      // then follow its URL, cascadeCache)
      if (found.url) {
        index.urlDependent = true;
        if (doc !== null) doc[S].urlRules = true;
      }
      const host = found.kind === 'host';
      const sub = host ? (target.hostRules ??= pseudoTarget()) : (target.slottedRules ??= pseudoTarget());
      const match = host ? hostMatch(found.match, root) : slottedMatch(found.match, found.slot, root);
      const entry = pseudo
        ? { match: originating(match), specificity: found.specificity + 1 }
        : { match, specificity: found.specificity };
      addDeclarations(sub, rule[S].style[S].decls, [entry], counter, compat, layer, null);
    }
    return rest.join(',');
  };
  const addRule = (rule) => {
    // (jsdom 31: the text written where its serialization does not read
    // back, cssom.js matchText)
    const text = rule[S].matchText ?? rule[S].selectorText;
    // jsdom 31: selectors ending in a pseudo-element apply to it, through
    // its own index (index.pseudo; black box, 31.0.1)
    if (compat?.computed31 && text.includes(':')) {
      // (the list valid as a whole, each pseudo-element read as its name:
      // :before and the other legacy ones, ::b\65 fore)
      const selectors = splitSelectorList(text);
      const tails = selectors.map(pseudoTail31);
      if (tails.includes(INVALID_TAIL)) return;
      const valid = selectors.map((sel, i) =>
        tails[i] === null ? sel : `${tails[i].base}::${tails[i].name.replace(DECODED_ARGUMENT, '(x)')}`,
      );
      try {
        compileRuleSelector(
          scope === null ? valid.join(',') : scopedSelector(valid.join(',')),
          compat.treeScopedSheets === true,
        );
      } catch {
        return;
      }
      const plain = [];
      for (let i = 0; i < selectors.length; i++) {
        const tail = tails[i];
        if (tail === null) plain.push(selectors[i]);
        else addSelectors(tail.base, rule, pseudoIndex(index, tail.name), true);
      }
      if (plain.length) addSelectors(plain.join(','), rule, index, false);
      return;
    }
    addSelectors(text, rule, index, false);
  };
  // jsdom 31 (black box, 31.0.1): a sheet whose media do not match is not
  // applied (<style media="print">), and grouping rules nest: @media
  // where it matches (conditions31.js), @supports where it holds
  // (conditions31.js), at any depth; @layer blocks and statements order
  // the layers, @scope rules are scoped (layerNamed, scopeOf).
  // (an index whose media read the document's color scheme, its meta
  // color-scheme, is made again when the tree changes: ruleIndex)
  const readsScheme = () => {
    index.readsScheme = true;
  };
  const walk31 = (rules, ss) => {
    for (const rule of rules) {
      const proto = Object.getPrototypeOf(rule);
      if (proto === ss.protos.CSSStyleRule) addRule(rule);
      else if (proto === ss.protos.CSSLayerStatementRule)
        for (const name of rule[S].nameList) layerNamed(layers, layer, name);
      else if (
        (proto === ss.protos.CSSMediaRule && mediaMatches(rule[S].media, doc, readsScheme)) ||
        (proto === ss.protos.CSSSupportsRule && supportsMatches(rule)) ||
        proto === ss.protos.CSSLayerBlockRule ||
        proto === ss.protos.CSSScopeRule
      ) {
        const snapshot = ruleListSnapshot(rule);
        if (snapshot) lists.push(snapshot);
        const outerLayer = layer,
          outerScope = scope;
        if (proto === ss.protos.CSSLayerBlockRule) layer = layerNamed(layers, layer, rule[S].name);
        else if (proto === ss.protos.CSSScopeRule) {
          scope = scopeOf(rule, ss, outerScope, root, compat?.treeScopedSheets === true);
          if (scope === null) {
            scope = outerScope;
            continue;
          }
          if (scopeReads(scope, 'text')) index.textDependent = true;
          if (scopeReads(scope, 'url')) index.urlDependent = true;
        }
        walk31(ruleArray(rule), ss);
        layer = outerLayer;
        scope = outerScope;
      }
    }
  };
  for (const sheet of sheets) {
    const ss = sheet[S];
    if (ss.disabled) continue;
    if (compat?.computed31) {
      if (ss.media === undefined || ss.media === null || mediaMatches(ss.media, doc, readsScheme)) walk31(ss.rules, ss);
      continue;
    }
    for (const rule of ss.rules) {
      const proto = Object.getPrototypeOf(rule);
      if (proto === ss.protos.CSSStyleRule) addRule(rule);
      else if (proto === ss.protos.CSSMediaRule && mediaApplies(rule, mode, compat)) {
        // (ruleArray: before jsdom 27.1.0 the rule's cssRules, which may be replaced)
        const snapshot = ruleListSnapshot(rule);
        if (snapshot) lists.push(snapshot);
        for (const inner of ruleArray(rule))
          if (inner?.[S] && Object.getPrototypeOf(inner) === ss.protos.CSSStyleRule) addRule(inner);
      }
    }
  }
  // From jsdom 28.1.0 (black box, 28.1.0 to 30.1.3) the later of two
  // !important declarations wins, whatever their selectors' specificity
  // (.a.b td { color: red !important } td { color: blue !important } gives
  // blue); before, every declaration applies in document order. jsdom 31
  // gives red.
  if (compat?.computed31) {
    // (layers, then specificity, then order; scope proximity comes after
    // specificity when the cascade reads the lists: cascade31)
    const keys = layerKeys(layers);
    index.layerCount = layers.length;
    const targets = [index, ...(index.pseudo?.values() ?? [])];
    for (const target of targets.slice()) {
      if (target.hostRules !== null) targets.push(target.hostRules);
      if (target.slottedRules !== null) targets.push(target.slottedRules);
    }
    for (const target of targets) {
      target.layerCount = layers.length;
      target.textDependent = index.textDependent;
      target.urlDependent = index.urlDependent;
      target.readsScheme = index.readsScheme;
      for (const lists of target.values()) {
        for (const e of lists.normal) e.layer = keys.normal[e.layer];
        for (const e of lists.important) e.layer = keys.important[e.layer];
        lists.normal.sort(byLayerThenSpecificity);
        lists.important.sort(byLayerThenSpecificity);
      }
    }
    return index;
  }
  for (const lists of index.values()) {
    lists.normal.sort(compat?.documentOrder ? byOrder : bySpecificityThenOrder);
    lists.important.sort(byOrder);
  }
  return index;
}

const sameSheets = (a, b) => a.length === b.length && a.every((sheet, i) => sheet === b[i]);

const EMPTY = new Map();

// The rule index of an element's document: its style sheets
// (document.styleSheets) apply to every element of it, in shadow trees and
// disconnected ones too, as in jsdom (black box, 20.0.3 to 30.1.3: a
// shadow tree's div gets the document's div { color: red }, its own <style>
// applying from 30.1.2 only, as one of the document's: cssom.js
// documentStyleSheets). The element is kept local to each call, as a
// getComputedStyle() run from a test's cssRules getter (ruleListChanged)
// calls this again, and a module-level one would keep its document (and
// window) alive after the window is gone (#165).
// jsdom 31 (black box, 31.0.1): each tree's own sheets, the document's
// for its elements and a shadow root's for its tree's (a pseudo-element:
// its element's).
// (whether the last ruleIndex was in a document whose trees style each
// other, jsdom 31: cascadeCache)
let crossTree31 = false;
function ruleIndex(element) {
  crossTree31 = false;
  if (element[S].pseudo === undefined)
    return element[S].doc[S].shadowHosts === true ? treeIndex(element) : documentIndex(element);
  followElement31(element);
  return indexOf31(element, treeIndex(element[S].origin));
}
// (a document with shadow roots: jsdom 31 reads the element's tree)
function treeIndex(element) {
  const ds = element[S].doc[S];
  if (ds.window[S].compat.treeScopedSheets === true) {
    crossTree31 = true;
    const root = rootOf(element);
    if (root[S].shadow === true) return sheetIndex(root[S], ds, root, element[S].doc);
  }
  return documentIndex(element);
}
function documentIndex(element) {
  const es = element[S];
  const ds = es.doc[S];
  const cached = ds.cascade;
  if (cached?.lists.some(ruleListChanged)) cssomChanges.rev++;
  const treeRev = ds.treeRev ?? 0;
  const styleRev = ds.styleRev ?? 0;
  if (cached && cached.treeRev === treeRev && cached.styleRev === styleRev && cached.cssomRev === cssomChanges.rev)
    return cached.index;
  return sheetIndex(ds, ds, null, es.doc);
}
// (holder: whose cascade cache: the document's state, or a shadow root's
// with its root; its sheet list read only when the cache does not hold)
function sheetIndex(holder, ds, root, doc) {
  const cached = holder.cascade;
  if (cached?.lists.some(ruleListChanged)) cssomChanges.rev++;
  const treeRev = ds.treeRev ?? 0;
  const styleRev = ds.styleRev ?? 0;
  // (a shadow root's: in the document it is in now, its host may move)
  if (
    cached &&
    cached.doc === doc &&
    cached.treeRev === treeRev &&
    cached.styleRev === styleRev &&
    cached.cssomRev === cssomChanges.rev
  )
    return cached.index;
  const own = (root === null ? documentStyleSheets(doc) : shadowStyleSheets(root))[S].items();
  // (jsdom 31: the tree's adopted sheets after its <style> sheets, cssom.js
  // adoptedStyleSheets)
  const adopted = holder.adopted?.items;
  // (copied by index: the public array's own properties, such as
  // Symbol.isConcatSpreadable, must not change the list; the copy is the
  // cache's snapshot too)
  let sheets = own;
  if (adopted !== undefined && adopted.length !== 0) {
    sheets = own.slice();
    for (let i = 0; i < adopted.length; i++) sheets.push(adopted[i]);
  }
  const reuse =
    cached && cached.cssomRev === cssomChanges.rev && !cached.index.readsScheme && sameSheets(cached.sheets, sheets);
  const lists = reuse ? cached.lists : [];
  let index = EMPTY;
  if (reuse) index = cached.index;
  else if (sheets.length)
    index = buildIndex(sheets, validationModeOf(ds.window), ds.window[S].compat, lists, doc, root);
  holder.cascade = {
    doc,
    treeRev,
    styleRev,
    cssomRev: cssomChanges.rev,
    sheets: sheets === own ? own.slice() : sheets,
    index,
    lists,
  };
  return index;
}

// --- the cascade ---------------------------------------------------------------------

// The style attribute's declarations, expanded, cached per attribute value
// (css.js clears the cache when the element's style object changes).
// Only HTML and SVG elements have an inline style (interfaces.js
// inlineStyle): as in jsdom 30.1.2 and later (black box, to 30.1.3), the
// style attribute of another element (in no namespace, MathML's, another
// namespace's) declares nothing. jsdom 20.0.0 to 30.1.1 throw a TypeError
// from inside getComputedStyle() for such an element (#259).
function inlineDeclarations(element) {
  const es = element[S];
  const text = es.attrs.get('style');
  if (text === undefined || (es.ns !== HTML_NS && es.ns !== SVG_NS)) return null;
  if (es.inlineCascade?.text === text) return es.inlineCascade.map;
  const map = new Map();
  const mode = validationModeOf(es.doc[S].window);
  const written = writtenDeclarations(element, text);
  const compat = es.doc[S].window[S].compat;
  // (jsdom 31 computes from the declarations its style object holds, not
  // their serialization read again: color-mix(in srgb, red 80%, blue 80%,
  // green) is declared with green -60%, which a parse would reject)
  const decls =
    written !== null && compat.computed31
      ? written
      : parseDeclarations(
          written === null ? text : cascadeText(written, text, compat.jsdom === 27),
          mode,
          styleSurfaceOf(es.doc[S].window),
          written !== null,
        );
  // A style attribute as parsed (not one a style write serialized), from
  // jsdom 27: margin and padding as its style object holds them.
  if (written === null) parsedBox(decls, mode);
  // A clip a style write serialized as a rect() of one component (rect(0 0
  // 0 0) is rect(0px)), which the text read again rejects: jsdom 30.1.3
  // computes it as declared (see cascadeExpand for 27 to 30.1.2).
  else if (compat.jsdom >= 27 && !compat.clipReparsed && !decls.has('clip') && written.has('clip'))
    decls.set('clip', written.get('clip'));
  let order = 0;
  for (const [property, decl] of decls) {
    const { important, masked } = decl;
    const value = decl.value === '' && decl.src !== undefined && compat.computed31 ? pending31(decl.src) : decl.value;
    // A declaration with var() and !important that lost it (masked,
    // compat.varDropsImportant) is still !important to the attribute's
    // others (strong), not to the cascade.
    const strong = important || masked === true || written?.get(property)?.masked === true;
    const from = ALIASES[property] ?? property;
    const entries = cascadeExpand(property, value, decls.legacyFont, compat);
    const shorthand = entries.length > 1 && entries[entries.length - 1][1] === PENDING ? entries[0][0] : null;
    // From jsdom 29 a border shorthand with var() after one of its
    // longhands in the attribute declares nothing.
    if (
      shorthand !== null &&
      compat.jsdom >= 29 &&
      BORDER_FAMILY.has(shorthand) &&
      SHORTHANDS[shorthand].some((l) => map.has(l) && map.get(l).value !== PENDING)
    )
      continue;
    for (const [name, v] of entries) {
      let prior = map.get(name);
      // A longhand after a shorthand with var() in the attribute (padding:
      // var(--p); padding-top: 4px): from jsdom 27 the longhand is dropped
      // (padding-top '' or 0), but for the border shorthands; otherwise the
      // shorthand's pending longhands are (padding-left from the user agent
      // sheet), and the shorthand too but for a border one before 27.
      if (prior?.value === PENDING && v !== PENDING) {
        if (compat.jsdom >= 27 && !BORDER_FAMILY.has(prior.from)) {
          if (entries.length === 1) continue;
        } else {
          for (const l of SHORTHANDS[prior.from]) if (map.get(l)?.value === PENDING) map.delete(l);
          if (compat.jsdom >= 27 || !BORDER_FAMILY.has(prior.from)) map.delete(prior.from);
          prior = undefined;
        }
      }
      if (!strong && prior?.strong) continue;
      if (v === HIDE_UA && prior !== undefined) continue;
      // via: the declaration's property (cascadeInOrder).
      // (order: the declaration's place in the attribute, for jsdom 31's
      // logical property groups, cascade31)
      map.set(
        name,
        v === PENDING
          ? { value: v, important, strong, from: shorthand, via: undefined, order: order++ }
          : { value: v, important, strong, from: undefined, via: from, order: order++ },
      );
    }
  }
  es.inlineCascade = { text, map };
  return map;
}

// The first matching entry's value, past HIDE_UA ones (noted in uaHidden).
const NO_SCOPE = {};
let uaHidden = false;
function firstMatch(list, element) {
  for (const entry of list) {
    const value = entry.value;
    if (!entry.match(element, NO_SCOPE)) continue;
    if (value !== HIDE_UA) return value;
    uaHidden = true;
  }
  return undefined;
}

// The first matching entry, past HIDE_UA ones.
function firstMatchEntry(list, element) {
  for (const entry of list) if (entry.value !== HIDE_UA && entry.match(element, NO_SCOPE)) return entry;
  return undefined;
}

// A pending longhand and a longhand declared as itself meet by order, not
// by importance or specificity (compat.pendingByOrder, black box: jsdom
// 28.1, 29.0.0 to 30.1.2): the later one wins. Ant Design's bordered
// Descriptions declares padding: var(--p) var(--q) on its cells and
// padding-bottom: var(--b) in a later, less specific rule; jsdom gives
// padding-bottom var(--b) there. (Before 28.1.0 all declarations meet by
// order: compat.documentOrder.)
// - 'all' (28.1 to 30.1.2): the cascade's first of each, each declared
//   property's winner by specificity (.d.d td { padding: var(--a) } td {
//   padding-bottom: 7px } td { padding: var(--b) } gives 7px).
// - 'important' (30.1.3 and later): only two !important ones.
// The entry that wins, or undefined when the cascade decides (no such
// pair, or another declaration wins anyway).
function cascadeByOrder(lists, element, compat) {
  const mode = compat.pendingByOrder;
  // One scan, important then normal: the first matching entry (the
  // cascade's winner), the first pending one and one declared as itself.
  let winner, pending, direct;
  for (let i = 0; i < 2; i++) {
    if (mode === 'important' && i === 1) break;
    const list = i === 0 ? lists.important : lists.normal;
    for (const entry of list) {
      if (entry.value === HIDE_UA) continue;
      const isPending = entry.value === PENDING;
      const wanted =
        winner === undefined || (isPending && pending === undefined) || (entry.direct && direct === undefined);
      if (!wanted || !entry.match(element, NO_SCOPE)) continue;
      // A first match from a shorthand without var() wins as the cascade
      // decides: no need to look further.
      if (winner === undefined && !isPending && !entry.direct) return undefined;
      winner ??= entry;
      if (isPending) pending ??= entry;
      if (entry.direct) direct ??= entry;
    }
  }
  if (pending === undefined || direct === undefined) return undefined;
  if (winner.value !== PENDING && !winner.direct) return undefined;
  return direct.order > pending.order ? direct : pending;
}

// jsdom 28.1.0 to 30.1.2 (compat.pendingByOrder 'all', black box: every
// order, importance and specificity of padding-bottom: 7px, padding: 8px
// and padding: var(--p) on 28.1.0, 29.1.1 and 30.1.2): the page's
// declarations of margin, padding and their longhands apply in document
// order to one declaration block, as setProperty would, each name only
// if it wins over the one that set it last: an !important one over a
// normal one, the later of two !important ones, a normal one with at
// least its specificity, anything over an !important one the block no
// longer holds as such. A shorthand's longhands, then the shorthand
// itself (padding: 8px in a later, less specific rule still sets
// padding-bottom: .d.d td { padding-bottom: 7px } td { padding: 8px }
// gives 8px); with var() only the shorthand, which empties its longhands
// (pending), and a longhand set after it removes it. A normal shorthand
// leaves an !important longhand, and the block keeps the shorthand only
// while its longhands share its importance (before jsdom 30 an !important
// longhand set over an !important shorthand loses its !important:
// compat.longhandLosesImportant). The block's entry for the longhand, or
// for the shorthand itself while the block holds it (shorthandValue), or
// undefined; null when another shorthand declares one of the longhands.
// The block is kept with the element's cascaded values, for its other
// longhands.
const IN_ORDER = new Map(['margin', 'padding'].flatMap((s) => [[s, s], ...SHORTHANDS[s].map((l) => [l, s])]));
const IN_ORDER_NAMES = new Map(['margin', 'padding'].map((s) => [s, [s, ...SHORTHANDS[s]]]));
function cascadeInOrder(index, element, name, shorthand, compat, inlineMap) {
  const cache = element[S].cascaded;
  const blocks = (cache.blocks ??= new Map());
  let block = blocks.get(shorthand);
  if (block === undefined) blocks.set(shorthand, (block = inOrderBlock(index, element, shorthand, compat, inlineMap)));
  return block === null ? null : block.get(name);
}
let inOrderEpoch = 0;
function inOrderBlock(index, element, shorthand, compat, inlineMap) {
  const longhands = SHORTHANDS[shorthand];
  const block = new OrderedBlock(shorthand, compat.longhandLosesImportant === true);
  userAgentInOrder(block, element, shorthand, longhands);
  // The matching declarations in document order, with their selectors' highest specificity.
  const inOrder = index.inOrder;
  const family = inOrder?.families.get(shorthand);
  if (family !== undefined) {
    const { records } = family;
    const epoch = ++inOrderEpoch;
    if (family.foreign)
      for (let i = 0; i < records.length; i++)
        if (records[i].foreign && inOrder.specificity(records[i], element, epoch) >= 0) return null;
    // An !important shorthand without var() sets the whole block, whatever
    // came before it: from the last one that matches.
    let start = 0;
    for (let i = records.length - 1; i > 0; i--)
      if (records[i].resets && inOrder.specificity(records[i], element, epoch) >= 0) {
        start = i;
        break;
      }
    for (let i = start; i < records.length; i++) {
      const s = inOrder.specificity(records[i], element, epoch);
      if (s >= 0) block.apply(records[i], s);
    }
  }
  // The style attribute's, last, over every rule: its shorthand (with
  // var(): pending longhands), then its other longhands. The shorthand
  // keeps its own value (padding: 4px over p { padding: inherit }).
  if (inlineMap) {
    const inline = longhands.map((l) => inlineMap.get(l));
    const pending = inline.find((entry) => entry?.value === PENDING && entry.from === shorthand);
    const whole = inlineMap.get(shorthand);
    if (pending !== undefined)
      block.apply(
        {
          slot: SHORTHAND_SLOT,
          from: shorthand,
          important: pending.important,
          values: PENDING_VALUES,
          own: whole?.value,
        },
        Infinity,
      );
    const plain = pending === undefined && whole?.via === shorthand;
    if (plain)
      block.apply(
        {
          slot: SHORTHAND_SLOT,
          from: shorthand,
          important: whole.important,
          values: inline.map((entry) => entry?.value),
          own: whole.value,
        },
        Infinity,
      );
    longhands.forEach((l, i) => {
      const entry = inline[i];
      if (entry !== undefined && entry.value !== PENDING && !(plain && entry.via === shorthand)) {
        const values = [];
        values[i] = entry.value;
        block.apply({ slot: i, from: l, important: entry.important, values }, Infinity);
      }
    });
  }
  return block.result(longhands);
}

// The user agent sheet's declarations come first in the block (black box,
// jsdom 28.1.0 to 30.1.2, #136), in its order, each with its selectors'
// highest matching specificity: td { padding-top: 3px } * { padding: 0 }
// gives a cell 3px 1px 1px, as td { padding: 1px } sets the shorthand
// before the page's rules.
function userAgentInOrder(block, element, shorthand, longhands) {
  const es = element[S];
  const list = uaInOrder(es.doc[S].window, shorthand, IN_ORDER_NAMES.get(shorthand), cascadeExpand);
  for (let i = 0; i < list.length; i++) {
    const decl = list[i];
    let specificity = decl.simple.includes(es.tag) ? 1 : -1;
    for (const { match, specificity: s } of decl.complex)
      if (s > specificity && match(element, NO_SCOPE)) specificity = s;
    if (specificity < 0) continue;
    const record = (decl.record ??= inOrderRecord(decl, shorthand, longhands));
    if (record !== null) block.apply(record, specificity);
  }
}
// A user agent declaration as a block record (OrderedBlock.apply), null
// for one the block takes no part in (an !important one, which cascade()
// applies first, or one of another shorthand).
function inOrderRecord(decl, shorthand, longhands) {
  const slot = decl.via === shorthand ? SHORTHAND_SLOT : longhands.indexOf(decl.via);
  if (decl.important || slot < 0) return null;
  return {
    slot,
    from: decl.via,
    important: false,
    values: longhands.map((l) => decl.values.get(l)),
    own: decl.values.get(shorthand),
  };
}

// The declarations of margin, padding or their longhands (inOrderBlock),
// kept with the rule index: per shorthand in document order, one record
// per declaration that declares one of its longhands: { slot (of its
// property: OrderedBlock), from, important, entries (its rule's
// selectors), selectors (their id), values (by slot), own (the
// shorthand's value), foreign (another shorthand declares a longhand),
// resets (an !important shorthand without var(): sets the whole block) }.
class InOrderIndex {
  constructor() {
    this.families = new Map(); // shorthand -> { records, foreign }
    this.selectorIds = new Map(); // a rule's selector entries -> their id
    // By selector id: the inOrderBlock call that matched them last, and
    // their highest matching specificity then (-1 when none match).
    this.epochs = [];
    this.specificities = [];
  }
  add(pairs, entries, from, important) {
    let records = null;
    for (const [name, value] of pairs) {
      const shorthand = IN_ORDER.get(name);
      if (shorthand === undefined) continue;
      const longhands = SHORTHANDS[shorthand];
      records ??= new Map();
      let record = records.get(shorthand);
      if (record === undefined) {
        record = {
          slot: from === shorthand ? SHORTHAND_SLOT : longhands.indexOf(from),
          from,
          important,
          entries,
          selectors: this.selectorId(entries),
          values: [undefined, undefined, undefined, undefined],
          own: undefined,
          foreign: false,
          resets: false,
          longhands: 0,
        };
        records.set(shorthand, record);
      }
      if (name === shorthand) record.own = value;
      else {
        record.values[longhands.indexOf(name)] = value;
        record.longhands++;
        if (from !== shorthand && from !== name) record.foreign = true;
      }
    }
    if (records === null) return;
    for (const [shorthand, record] of records) {
      // A declaration of the shorthand alone takes no part.
      if (record.longhands === 0) continue;
      record.resets = record.slot === SHORTHAND_SLOT && important === true && record.values[0] !== PENDING;
      let family = this.families.get(shorthand);
      if (family === undefined) this.families.set(shorthand, (family = { records: [], foreign: false }));
      family.records.push(record);
      if (record.foreign) family.foreign = true;
    }
  }
  selectorId(entries) {
    let id = this.selectorIds.get(entries);
    if (id === undefined) {
      this.selectorIds.set(entries, (id = this.epochs.length));
      this.epochs.push(0);
      this.specificities.push(-1);
    }
    return id;
  }
  // The highest specificity of a record's selectors that match the element,
  // -1 when none do; each selector list matched once per inOrderBlock call.
  specificity(record, element, epoch) {
    const id = record.selectors;
    if (this.epochs[id] === epoch) return this.specificities[id];
    let specificity = -1;
    for (const entry of record.entries)
      if (entry.specificity > specificity && entry.match(element, NO_SCOPE)) specificity = entry.specificity;
    this.epochs[id] = epoch;
    this.specificities[id] = specificity;
    return specificity;
  }
}

// The declaration block inOrderBlock applies declarations to: per longhand (slots 0 to 3, as in
// SHORTHANDS) its value, importance and source declaration's property, the
// shorthand's own entry while the block holds it, and per name (the
// shorthand in SHORTHAND_SLOT) the importance and specificity of the
// declaration that set it last. A declaration (an index.inOrder record or
// one of the style attribute): { slot, from, important, values (by slot),
// own (the shorthand's value) }.
const SHORTHAND_SLOT = 4;
const PENDING_VALUES = [PENDING, PENDING, PENDING, PENDING];
class OrderedBlock {
  constructor(shorthand, loses) {
    this.shorthand = shorthand;
    this.loses = loses;
    this.has = [false, false, false, false];
    this.values = [undefined, undefined, undefined, undefined];
    this.important = [false, false, false, false];
    this.from = [undefined, undefined, undefined, undefined];
    this.own = null; // { pending, important, value }
    this.set = [false, false, false, false, false];
    this.lastImportant = [false, false, false, false, false];
    this.lastSpecificity = [0, 0, 0, 0, 0];
  }
  held(slot) {
    return (slot === SHORTHAND_SLOT ? this.own?.important : this.has[slot] && this.important[slot]) === true;
  }
  wins(slot, decl, specificity) {
    if (!this.set[slot]) return true;
    const important = this.held(slot);
    if (this.lastImportant[slot] && !important) return true;
    if (decl.important !== important) return decl.important;
    return decl.important || specificity >= this.lastSpecificity[slot];
  }
  record(slot, decl, specificity) {
    this.set[slot] = true;
    this.lastImportant[slot] = decl.important;
    this.lastSpecificity[slot] = specificity;
  }
  put(slot, value, important, from) {
    this.has[slot] = true;
    this.values[slot] = value;
    this.important[slot] = important;
    this.from[slot] = from;
  }
  setLonghand(slot, decl) {
    let important = decl.important;
    const own = this.own;
    if (own !== null) {
      if (own.pending) this.own = null;
      else if (this.loses ? own.important || important : own.important !== important) {
        if (this.loses && own.important && important) important = false;
        this.own = null;
      }
    }
    this.put(slot, decl.values[slot], important, decl.from);
  }
  setShorthand(decl) {
    const pending = decl.values[0] === PENDING;
    let whole = true;
    for (let slot = 0; slot < 4; slot++) {
      if (pending) this.put(slot, PENDING, false, this.shorthand);
      else if (this.has[slot] && this.important[slot] && !decl.important) whole = false;
      else this.put(slot, decl.values[slot], decl.important, this.shorthand);
    }
    this.own = whole ? { pending, important: decl.important, value: decl.own } : null;
  }
  apply(decl, specificity) {
    const slot = decl.slot;
    if (slot !== SHORTHAND_SLOT) {
      if (this.wins(slot, decl, specificity)) {
        this.setLonghand(slot, decl);
        this.record(slot, decl, specificity);
      }
      return;
    }
    if (decl.values[0] !== PENDING)
      for (let l = 0; l < 4; l++)
        if (this.wins(l, decl, specificity)) {
          this.setLonghand(l, decl);
          this.record(l, decl, specificity);
        }
    if (this.wins(SHORTHAND_SLOT, decl, specificity)) {
      this.setShorthand(decl);
      this.record(SHORTHAND_SLOT, decl, specificity);
    }
  }
  // longhand -> { value, important, from }, and the shorthand itself while
  // the block holds it (shorthandValue).
  result(longhands) {
    const block = new Map();
    for (let slot = 0; slot < 4; slot++)
      if (this.has[slot])
        block.set(longhands[slot], {
          value: this.values[slot],
          important: this.important[slot],
          from: this.from[slot],
        });
    const own = this.own;
    if (own !== null && own.value !== undefined)
      block.set(this.shorthand, { value: own.value, important: own.important, from: this.shorthand });
    return block;
  }
}

// The cascaded value: important inline, important rules, inline, rules.
// Cached per element until the document's rules, tree or attributes, or
// its style attribute change.
function cascaded(element, name) {
  const cache = cascadeCache(element);
  if (cache.values.has(name)) return cache.values.get(name);
  let value = cascade(element, cache.index, cache.inline, name);
  if (value === PENDING) value = undefined;
  cache.values.set(name, value);
  return value;
}

// An element's cascaded values, as they now are (dropped and started again
// when they are no longer).
function cascadeCache(element) {
  const es = element[S];
  if (es.pseudo !== undefined) followElement31(element);
  const ds = es.doc[S];
  let cache = es.cascaded;
  // A disconnected element's values stay as they were, and from jsdom 21
  // to 30.1.1 any element's (see below).
  if (
    cache !== undefined &&
    cache.detached &&
    // Moved to another document: its counters say nothing about these values.
    cache.doc === ds &&
    cache.detachedRev === ds.detachedRev &&
    cache.cssomRev === keptCssomRev(ds, cache.kept)
  )
    return cache;
  const index = ruleIndex(element);
  const rev = ds.treeRev ?? 0;
  // Text data changes too (internal.js replaceData) when a rule's selector
  // can match by text (:dir(auto), a textarea's :invalid): they leave the
  // tree as it was, not those matches.
  const textRev = index.textDependent === true ? (ds.textRev ?? 0) : 0;
  // In a document with shadow trees, values inherit across trees (a shadow
  // tree's top from its host, a slotted element from its slot), which
  // other trees' rules style: any style text, CSSOM or text change in the
  // document drops them (the element's own index says nothing about the
  // other trees'; #340 review). The counters only grow, so their sum
  // changes when any of them does.
  const outerRev = crossTree31 ? 1 + (ds.styleRev ?? 0) + cssomChanges.rev + (ds.textRev ?? 0) : 0;
  // :local-link follows the document's URL, which pushState and
  // replaceState change with no other change (#346 review); across trees,
  // once a shadow tree's ::slotted() or :host rules use it (urlRules,
  // kept: they style elements outside it, whose own index says nothing of
  // them). (Values a shadow tree inherits from its host are read from the
  // host's.)
  const url = index.urlDependent === true || (crossTree31 && ds.urlRules === true) ? documentURL(ds) : null;
  const inlineMap = inlineDeclarations(element);
  if (
    !cache ||
    // (moved to another document: its counters say nothing about these)
    cache.doc !== ds ||
    cache.index !== index ||
    cache.outerRev !== outerRev ||
    cache.url !== url ||
    cache.rev !== rev ||
    cache.textRev !== textRev ||
    cache.inline !== inlineMap ||
    // (a jsdom 31 flow from a direction its text decides, flow31)
    (cache.flowText && cache.flowTextRev !== (ds.textRev ?? 0))
  ) {
    const kept = keptStyles(ds);
    let detached = kept;
    // Whether colorDeclared may keep its answer with these values: they
    // are dropped on any change of the element's ancestors. Where values
    // are kept (jsdom 21 to 30.1.1), only a change in the document's own
    // tree drops them (see keptStyles), so only there: undefined until
    // colorDeclared finds the element's root (which stays in or out of
    // the document's tree while these values are kept). Elsewhere it is
    // true, except where a disconnected element's values are kept
    // (keepsDetached): there it is whether the element is connected.
    let settled = kept ? undefined : true;
    if (!kept && keepsDetached(ds)) {
      // Connected: the element's root is the document, or a shadow root
      // whose host is connected.
      const root = rootOf(element);
      detached = root[S].type !== DOCUMENT_NODE && !(root[S].shadow === true && connected(root[S].host));
      settled = !detached;
    }
    if (detached) trackDetachedStyles(ds, kept);
    cache = es.cascaded = {
      index,
      rev,
      textRev,
      outerRev,
      url,
      inline: inlineMap,
      values: new Map(),
      inner: undefined,
      detached,
      kept,
      settled,
      doc: ds,
      detachedRev: ds.detachedRev,
      cssomRev: keptCssomRev(ds, kept),
      fontSize: undefined,
      blocks: undefined,
      scheme: undefined,
      colorDeclared: undefined,
      rootDark: undefined,
      lineHeight: undefined,
      customs: undefined,
      // (jsdom 31: properties in a cycle with a registered one, substitutedValue)
      cycles31: undefined,
      // (whether the element is in the rendered tree, jsdom 31: styleValue)
      rendered: ds.window[S].compat.computed31 ? undefined : true,
      names: undefined,
      flow: -1,
      flowText: false,
      flowTextRev: 0,
    };
  }
  return cache;
}

// jsdom 21 and later (black box, 22 to 30 measured) compute a disconnected
// element's style once and keep it until the document's connected tree or
// its style sheets change: changes in its detached tree, its style
// attribute included, do not refresh it (Vue Test Utils mounts into a
// detached element; vueuse's useCssVar test reads a custom property after
// removing it and gets the old value). warpdom keeps the element's
// cascaded values, and its style attribute's declarations, from the first
// computed read until then (detachedRev counts the connected changes, in
// documents where such a read happened).
function keepsDetached(ds) {
  let keeps = ds.keepsDetached;
  if (keeps === undefined) keeps = ds.keepsDetached = ds.window[S].compat.jsdom >= 21;
  return keeps;
}

// From jsdom 21 to 30.1.1 (compat.keptComputedStyle, black box: 21.1.2 to
// 29.1.1) every element's computed style is kept so, from its first read
// until the document's own tree changes (internal.js keptChange: not its
// shadow trees, nor disconnected ones): with div { color: blue }, a div's
// color read, then the rule's color set to green, the div stays blue until
// an attribute is set or a node inserted; an element not read before gets
// green; a shadow tree's element stays blue after its own class changes.
// Edits of a rule's declarations or selector do not refresh it, and
// insertRule() and deleteRule() only from jsdom 29, on the element's
// window's sheets (internal.js ruleListRev).
function keptStyles(ds) {
  let kept = ds.keptStyles;
  if (kept === undefined) kept = ds.keptStyles = ds.window[S].compat.keptComputedStyle === true;
  return kept;
}
// The CSSOM revision a kept cache is valid for.
function keptCssomRev(ds, kept) {
  if (!kept) return cssomChanges.rev;
  if (!ds.window[S].compat.ruleListRefreshes) return 0;
  let lists = ds.ruleLists;
  if (lists === undefined) lists = ds.ruleLists = ruleListRev(ds.window[S].protos);
  return lists.rev;
}

// The declared value that wins (PENDING for a pending longhand: undeclared
// for cascaded).
function cascade(element, index, inlineMap, name) {
  const window = element[S].doc[S].window;
  if (window[S].compat.computed31) return cascade31(element, index, inlineMap, name, window);
  const ua = uaDeclarations(window, name, cascadeExpand);
  uaHidden = false;
  let inline = inlineMap?.get(name);
  if (inline?.value === HIDE_UA) {
    uaHidden = true;
    inline = undefined;
  }
  if (inline?.important) return inline.value;
  // jsdom 28.1.0 and later: the user agent sheet's !important
  // declarations win over the page's others; as they come first, the
  // later of two !important ones is the page's (black box, 28.1.0 to
  // 30.1.3: * { display: block !important } shows an input[type=hidden]).
  const uaImportant = window[S].compat.uaImportant;
  if (uaImportant && ua.important !== null) {
    const v = uaValue(ua.important, element);
    if (v !== undefined) {
      const important = index.get(name)?.important;
      if (!important?.length || firstMatchEntry(important, element) === undefined) return v;
    }
  }
  const shorthand = window[S].compat.pendingByOrder === 'all' ? IN_ORDER.get(name) : undefined;
  const ruled =
    shorthand === undefined ? null : cascadeInOrder(index, element, name, shorthand, window[S].compat, inlineMap);
  if (ruled !== null)
    return ruled === undefined ? cascadeUserAgent(element, name, ua, uaImportant, window) : ruled.value;
  const lists = index.get(name);
  // A pending inline longhand declared !important that lost it
  // (compat.varDropsImportant) meets the cascade's winner by order, as the
  // latest, unless that comes from the same shorthand (black box, jsdom
  // 28.1.0 to 29.1.1): padding: var(--p) !important in the attribute wins
  // over .r { padding-top: 3px !important }, not over .r { padding: 3px
  // !important }; border and its sides are never the same (border:
  // var(--b) !important over .r { border: 3px solid !important }).
  if (
    inline?.value === PENDING &&
    inline.strong &&
    lists?.important.length &&
    window[S].compat.pendingByOrder === 'all'
  ) {
    const winner = firstMatchEntry(lists.important, element);
    if (winner !== undefined && (winner.from !== inline.from || BORDER_SIDE_OR_ALL.test(winner.from))) return PENDING;
  }
  // A normal inline declaration wins over normal rules: no order to check
  // without !important ones.
  if (lists?.pending && window[S].compat.pendingByOrder && (!inline || lists.important.length)) {
    const entry = cascadeByOrder(lists, element, window[S].compat);
    if (entry !== undefined) {
      if (entry.important) return entry.value;
      return inline ? inline.value : pageOrUserAgent(entry, element, name, ua, window[S].compat);
    }
  }
  if (lists?.important.length) {
    const v = firstMatch(lists.important, element);
    if (v !== undefined) return v;
  }
  if (inline) return inline.value;
  if (lists?.normal.length) {
    if (window[S].compat.uaBySpecificity) {
      // (no HIDE_UA entries from jsdom 27)
      let entry;
      for (const e of lists.normal)
        if (e.match(element, NO_SCOPE)) {
          entry = e;
          break;
        }
      if (entry !== undefined) return pageOrUserAgent(entry, element, name, ua, window[S].compat);
    } else {
      const v = firstMatch(lists.normal, element);
      if (v !== undefined) return v;
    }
  }
  return cascadeUserAgent(element, name, ua, uaImportant, window);
}

// The user agent sheet (ua-sheet.js), under the page's. The hidden
// attribute's display: none is the user agent sheet's too: before jsdom
// 28.1.0 a display rule wins over it (div { display: block } shows a div
// with hidden), from 28.1.0 one at least as specific (pageOrUserAgent).
function cascadeUserAgent(element, name, ua, uaImportant, window) {
  if (uaHidden) return undefined;
  if (name === 'display' && hiddenHides(element, window[S].compat)) return 'none';
  return (uaImportant ? undefined : uaValue(ua.important, element)) ?? uaValue(ua.normal, element);
}

// From jsdom 28.1.0 (compat.uaBySpecificity, black box: 28.1.0 to 30.1.3)
// the user agent sheet's rules are cascaded with the page's, before them:
// the page's normal declaration that wins (entry) gives way to a more
// specific user agent rule (* { display: inline } leaves a div block, *
// { font-weight: normal } a b bolder, .x { display: block } an element
// with hidden none). The hidden attribute's display: none is a rule as
// specific as [hidden]:not([hidden=until-found i]):not(embed): div.x.y and
// [hidden][hidden]:not(embed) show such an element, div.x and [hidden] do
// not. To 30.1.2 (compat.pendingByOrder 'all') the page's shorthand wins
// over a user agent longhand, or a shorthand that does not contain it,
// whatever their specificity, as the declarations are set in order into one
// block (inOrderBlock): * { font: 10px serif } gives an h1 10px, * {
// border: 0 } an hr no border (hr { border-style: inset }), * { border-top:
// 0 } not an iframe (iframe { border: 2px inset }).
const HIDDEN_RULE = Object.freeze({ specificity: 2001, order: -1, value: 'none', via: 'display' });
function pageOrUserAgent(entry, element, name, ua, compat) {
  const specificity = entry.specificity;
  let rule = uaRuleOver(ua.normal, element, specificity);
  if (
    name === 'display' &&
    specificity < HIDDEN_RULE.specificity &&
    (rule === undefined || rule.specificity < HIDDEN_RULE.specificity) &&
    hiddenHides(element, compat)
  )
    rule = HIDDEN_RULE;
  if (rule === undefined) return entry.value;
  if (compat.pendingByOrder === 'all' && !entry.direct && !contains(rule.via, entry.from)) return entry.value;
  return rule.value;
}

// Whether a declared property sets every longhand another one sets.
const contains = (property, other) =>
  property === other ||
  (SHORTHANDS[property] !== undefined && SHORTHANDS[other].every((l) => SHORTHANDS[property].includes(l)));

// jsdom 31 (black box, 31.0.1): CSS Cascade 5's origins and importance,
// highest first: the user agent sheet's !important declarations (a style
// attribute's display: block !important leaves an input[type=hidden]
// hidden), the style attribute's !important ones, the page's rules'
// !important ones, the style attribute's, the page's rules', the user
// agent sheet's (* { display: inline } makes a div inline, .x { display:
// block } shows an element with hidden); among rules by specificity, then
// order; in the attribute by order. A property of a logical property
// group shares its cascade with the property it maps to, or that maps to
// it, in the element's writing mode and direction (logical.js): the
// winner of the two sets both. The winner's level, specificity and order
// go to win31.
const win31 = { level: 0, layer: 0, specificity: 0, proximity: Infinity, order: 0 };
// (a first winner kept while the partner's is found: no object per read)
const saved31 = { level: 0, layer: 0, specificity: 0, proximity: Infinity, order: 0 };
function copy31(to, from) {
  to.level = from.level;
  to.layer = from.layer;
  to.specificity = from.specificity;
  to.proximity = from.proximity;
  to.order = from.order;
}
// cut: 0, or the level of a revert-layer being rolled back (2 or 4: a
// rule's, below: the layer it rolls back from; 3 or 5: the style
// attribute's, to every layer of the rules); only those rules are then
// looked at (none: level -1).
function winner31(element, index, inlineMap, name, window, cut = 0, below = Infinity) {
  const lists = index.get(name);
  if (cut !== 0) {
    // (the rule found has its own level, 2 or 4: rolled back from the
    // attribute, a rule's revert-layer then rolls back below its layer)
    const level = cut >= 4 ? 4 : 2;
    const list = level === 4 ? lists?.important : lists?.normal;
    if (list?.length && ruleWinner31(list, element, index.scoped, level, below)) return win31Value;
    return won31(-1, 0, 0, Infinity, 0, undefined);
  }
  const ua = uaDeclarations31(window, name, cascadeExpand, element);
  const rule = ua.important === null ? undefined : uaRule(ua.important, element);
  if (rule !== undefined) return won31(6, 0, rule.specificity, Infinity, rule.order, rule.value);
  // Shadow trees' rules for an element outside them (innerIndexes31): by
  // context, before the style attribute and layers, the innermost tree's
  // !important ones first, the outer tree's normal ones first (black box,
  // 31.0.1: a :host rule's !important declaration wins over the host's
  // style attribute's, the document's normal rule over a :host one). Each
  // context its own level, so that a logical property and its physical
  // one meet by context first too (pair31; #342 review).
  const inner = innerIndexes31(element);
  for (let i = inner.length - 1; i >= 0; i--) {
    const own = inner[i].get(name);
    if (own?.important.length && ruleWinner31(own.important, element, false, 5.5 + i / 1000, Infinity))
      return win31Value;
  }
  const inline = inlineMap?.get(name);
  if (inline?.important) return won31(5, 0, 0, Infinity, inline.order, inline.value);
  if (lists?.important.length && ruleWinner31(lists.important, element, index.scoped, 4, Infinity)) return win31Value;
  if (inline !== undefined && !inline.important) return won31(3, 0, 0, Infinity, inline.order, inline.value);
  if (lists?.normal.length && ruleWinner31(lists.normal, element, index.scoped, 2, Infinity)) return win31Value;
  for (let i = 0; i < inner.length; i++) {
    const own = inner[i].get(name);
    if (own?.normal.length && ruleWinner31(own.normal, element, false, 1.5 - i / 1000, Infinity)) return win31Value;
  }
  return userAgent31(element, name, window, ua);
}
// The rule that wins in a list (sorted by layer, specificity and order)
// among the layers below below, its scope proximity next to specificity
// (scoped: the index has @scope rules). Whether one did; it is then in
// win31 and win31Value.
let win31Value;
function ruleWinner31(list, element, scoped, level, below) {
  let best,
    bestProximity = Infinity;
  for (const e of list) {
    if (e.layer >= below) continue;
    if (best !== undefined && (e.layer !== best.layer || e.specificity !== best.specificity)) break;
    if (e.value === HIDE_UA) continue;
    proximity31 = Infinity;
    if (!e.match(element, NO_SCOPE)) continue;
    const proximity = e.scope === null ? Infinity : proximity31;
    if (best === undefined || proximity < bestProximity) {
      best = e;
      bestProximity = proximity;
    }
    if (!scoped) break;
  }
  if (best === undefined) return false;
  win31Value = won31(level, best.layer, best.specificity, bestProximity, best.order, best.value);
  return true;
}
const REVERT_LAYER = /^\s*revert-layer\s*$/i;
// The user agent sheet's normal declaration (also where the page's
// declaration that won is revert).
function userAgent31(element, name, window, ua = uaDeclarations31(window, name, cascadeExpand, element)) {
  if (element[S].pseudo !== undefined) {
    const value = pseudoUserAgent31(element, name);
    return value === undefined ? won31(0, 0, 0, Infinity, 0, undefined) : won31(1, 0, 0, Infinity, 0, value);
  }
  const rule = ua.normal === null ? undefined : uaRule(ua.normal, element);
  if (rule !== undefined) return won31(1, 0, rule.specificity, Infinity, rule.order, rule.value);
  return won31(0, 0, 0, Infinity, 0, undefined);
}
function won31(level, layer, specificity, proximity, order, value) {
  win31.level = level;
  win31.layer = layer;
  win31.specificity = specificity;
  win31.proximity = proximity;
  win31.order = order;
  return value;
}
// The winner of a name and, in a logical group, its partner (pair31).
function pair31(element, index, inlineMap, name, partner, window, cut, below) {
  const value = winner31(element, index, inlineMap, name, window, cut, below);
  if (partner === null) return value;
  copy31(saved31, win31);
  const other = winner31(element, index, inlineMap, partner, window, cut, below);
  if (!beats31(saved31)) {
    copy31(win31, saved31);
    return value;
  }
  // A longhand pending substitution computes from its shorthand by its own
  // name: the partner's (pending31).
  return other !== undefined && other.startsWith(PENDING31)
    ? `${PENDING31}\0${partner}\0${other.slice(PENDING31.length)}`
    : other;
}
function cascade31(element, index, inlineMap, name, window) {
  // (the flow first: finding it reads computed values, which cascade too
  // and overwrite win31)
  const partner = isLogicalGroup(name) ? partnerOf(name, flow31(element)) : null;
  let value = pair31(element, index, inlineMap, name, partner, window, 0, Infinity);
  // revert-layer in a rule that wins: the pair's winner among the layers
  // below (both names: margin-top: revert-layer rolls margin-block-start
  // back too), then the user agent sheet's (revert).
  // (in the style attribute, the rules': the attribute's later declaration
  // of the pair wins first, margin-block-start: 5px after margin-top:
  // revert-layer stays)
  // An !important one with no !important declaration below rolls back to
  // the normal ones of the layers below (black box, 31.0.1: @layer a {
  // color: red } @layer b { color: revert-layer !important } is red).
  while (win31.level >= 2 && win31.level <= 5 && REVERT_LAYER.test(value)) {
    const cut = win31.level;
    const layer = win31.layer;
    const below = cut === 2 || cut === 4 ? layer : Infinity;
    value = pair31(element, index, inlineMap, name, partner, window, cut, below);
    if (win31.level === -1 && cut >= 4) {
      // (the layer's normal precedence: !important keys run the other way)
      const normalBelow = cut === 4 ? index.layerCount - 1 - layer : Infinity;
      value = pair31(element, index, inlineMap, name, partner, window, cut === 4 ? 2 : 3, normalBelow);
    }
    if (win31.level === -1) {
      won31(cut, 0, 0, Infinity, 0, undefined);
      value = 'revert';
    }
  }
  // revert in the page's declarations: the user agent sheet's value, of
  // the pair too (black box, 31.0.1: p { margin-top: revert } gives 16px, a
  // div's 0px).
  // (a shadow tree's rule for an element outside it, about 1.5 or 5.5:
  // revert-layer there rolls back to the user agent sheet too)
  if (win31.level > 1 && win31.level < 6 && REVERT.test(value)) {
    value = userAgent31(element, name, window);
    if (partner !== null) {
      copy31(saved31, win31);
      const other = userAgent31(element, partner, window);
      if (!beats31(saved31)) return value;
      return other;
    }
  }
  return value;
}
const REVERT = /^\s*revert(?:-layer)?\s*$/i;
// Whether win31 beats another winner (level, layer, specificity, scope
// proximity, order).
const beats31 = (o) =>
  win31.level > o.level ||
  (win31.level === o.level &&
    (win31.layer > o.layer ||
      (win31.layer === o.layer &&
        (win31.specificity > o.specificity ||
          (win31.specificity === o.specificity &&
            (win31.proximity < o.proximity || (win31.proximity === o.proximity && win31.order > o.order)))))));

// An element's flow (logical.js), kept with its cascaded values.
// writing-mode, direction and text-orientation inherit: an element that
// declares none of them (nor has a direction of its own, uaDirection) has
// its parent's. Where no rule declares one, an element whose style
// attribute names none (all sets them too) declares none. A flow found
// from a direction its text decides (dir=auto, bdi), the element's or an
// ancestor's, is kept until text changes (flowText). Ancestors are walked
// in a loop, the flow found then given to each of them.
const FLOW_NAMES = /writing-mode|direction|text-orientation|all|\\/i;
const FLOW_PROPERTIES = ['writing-mode', 'direction', 'text-orientation', 'all'];
function flow31(element) {
  const cache = cascadeCache(element);
  if (cache.flow !== -1) return cache.flow;
  let flow = 0,
    text = false;
  for (let e = element; e !== null; e = inheritParent(e)) {
    const c = e === element ? cache : cascadeCache(e);
    if (c.flow !== -1) {
      flow = c.flow;
      text = c.flowText;
      break;
    }
    if (ownFlow(e, c)) {
      flow = flowOf(
        computedValue(e, 'writing-mode'),
        computedValue(e, 'direction'),
        computedValue(e, 'text-orientation'),
      );
      text = autoDirection(e) || flowTextAbove(e);
      break;
    }
  }
  const rev = element[S].doc[S].textRev ?? 0;
  for (let e = element; e !== null; e = inheritParent(e)) {
    const c = e === element ? cache : e[S].cascaded;
    if (c.flow !== -1) break;
    c.flow = flow;
    c.flowText = text;
    c.flowTextRev = rev;
    if (ownFlow(e, c)) break;
  }
  return flow;
}
function ownFlow(element, cache) {
  if (uaDirection(element)) return true;
  // (its rules', a shadow tree's for it too: :host, ::slotted(), #342 review)
  if (declaresFlow(cache.index) || innerIndexes31(element).some(declaresFlow))
    return FLOW_PROPERTIES.some((n) => cascaded(element, n) !== undefined);
  return cache.inline !== null && FLOW_NAMES.test(element[S].attrs.get('style'));
}
function declaresFlow(index) {
  for (let i = 0; i < FLOW_PROPERTIES.length; i++) if (index.has(FLOW_PROPERTIES[i])) return true;
  return false;
}
// A direction found from the element's text.
function autoDirection(element) {
  if (!uaDirection(element)) return false;
  const dir = element[S].attrs.get('dir')?.toLowerCase();
  return dir !== 'ltr' && dir !== 'rtl';
}
// Whether an inherited part of the flow comes from text: an ancestor's.
function flowTextAbove(element) {
  const parent = inheritParent(element);
  if (parent === null) return false;
  flow31(parent);
  return parent[S].cascaded.flowText;
}

// --- computed values ------------------------------------------------------------------

// The parent element, for inheritance: as in jsdom (black box, 20.0.3 to
// 30.1.3) a shadow root's children inherit nothing from its host (a host
// with color: red or visibility: hidden leaves them black and visible).
// jsdom 31 (black box, 31.0.1) inherits through the flat tree: a shadow
// root's children from its host, a host's child from the slot it is
// assigned to (none when it is not: it is not rendered).
function inheritParent(element) {
  const p = element[S].parent;
  if (p === null) return null;
  const ps = p[S];
  if (ps.type === ELEMENT_NODE) {
    if (ps.shadowRoot == null || ps.doc[S].window[S].compat.treeScopedSheets !== true) return p;
    // (a host's pseudo-element: the host, not a slot)
    return element[S].pseudo !== undefined ? p : findSlot(element);
  }
  return ps.shadow === true && ps.doc[S].window[S].compat.treeScopedSheets === true ? ps.host : null;
}

const FONT_SIZES = { medium: '16px' };
const FONT_WEIGHTS = { normal: '400', bold: '700' };
const BORDER_WIDTHS = { thin: '1px', medium: '3px', thick: '5px' };
const BORDER_WIDTH = /^border-(top|right|bottom|left)-width$/;
const LOGICAL_BORDER_WIDTH = /^border-(block|inline)-(start|end)-width$/;
const NO_BORDER = new Set(['none', 'hidden']);
const RAW_KEYWORDS = new Set([
  'font-weight',
  'font-size',
  'outline-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
]);

// currentcolor: the computed color; transparent when that is a var()
// value jsdom does not substitute (jsdom 29 and later; before, the
// var() value itself). From jsdom 29.0.2 (black box, to 30.1.3) the
// color of an element that inherits it (none declared, inherit or unset)
// is its parent's, where its own color is CanvasText under its own
// color-scheme (inheritedValue): with color-scheme: dark under a light
// body its color is white, its border colors black.
function currentColor(element) {
  let source = element;
  const compat = element[S].doc[S].window[S].compat;
  if (!compat.legacyComputedStyle && !compat.computed31 && declaresScheme(element)) {
    const parent = inheritParent(element);
    if (parent !== null && inheritsColor(cascaded(element, 'color'))) source = parent;
  }
  const color = computedValue(source, 'color');
  return color.includes('var(') && !compat.legacyComputedStyle ? 'rgba(0, 0, 0, 0)' : color;
}

// Computes a specified value: colors resolved, currentcolor to the color
// property, a 0 length to 0px, keyword font sizes, weights and border
// widths to numbers and lengths.
// Colors per jsdom version (compat.computedColors): before 22.1.0 as
// declared (an opaque rgba() from a hex color as rgb()), to 26 system
// colors (and with cssstyle before 4.4 currentcolor) as declared, and of
// a border side shorthand's color as written there (cssstyle before 4.4)
// hsl() and RGB() too, a hex alpha to 3 decimals rounded down.
const OPAQUE_RGBA = /^rgba\((\d+, \d+, \d+), 1\)$/;

// Whether the element's computed color-scheme is 'dark'. The cascade of
// color-scheme (rule index lookups for the element and each ancestor) is
// skipped when no rule of the element's root and no style attribute up
// the inheritance chain declares it (or all); an ancestor in another root,
// or not cascaded yet, takes the full path, as does a disconnected element
// whose computed values are kept (its style attributes, and its
// ancestors', may have changed since; see cascaded).
function darkScheme(element) {
  const cache = element[S].cascaded;
  const index = cache?.index;
  if (index !== undefined && !cache.detached && !index.has('color-scheme') && !index.has('all')) {
    let declared = false;
    for (let n = element; n !== null && !declared; n = inheritParent(n)) {
      const inline = inlineDeclarations(n);
      declared =
        (n !== element && n[S].cascaded?.index !== index) ||
        (inline !== null && (inline.has('color-scheme') || inline.has('all'))) ||
        // (a shadow tree's rules for it: :host, ::slotted(), #342 review)
        innerIndexes31(n).length > 0;
    }
    if (!declared) return false;
  }
  const scheme = computedValue(element, 'color-scheme');
  return element[S].doc[S].window[S].compat.computed31 ? darkScheme31(scheme) : scheme === 'dark';
}

// jsdom 31 (black box, 31.0.1): dark where the color-scheme names dark
// and not light, in any case and order (only dark, dark foo, DARK; not
// light dark or dark light).
// Read word by word in place (no array per read).
const isCssSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
function darkScheme31(scheme) {
  let dark = false;
  for (let i = 0; i < scheme.length;) {
    while (i < scheme.length && isCssSpace(scheme.charCodeAt(i))) i++;
    const start = i;
    while (i < scheme.length && !isCssSpace(scheme.charCodeAt(i))) i++;
    const length = i - start;
    if (length === 5 && scheme.slice(start, i).toLowerCase() === 'light') return false;
    if (length === 4 && scheme.slice(start, i).toLowerCase() === 'dark') dark = true;
  }
  return dark;
}

// Whether the element declares its own color-scheme (not inherit or
// unset), so that its computed color-scheme may differ from its parent's;
// kept with its cascaded values (callers cascade the element first, so
// its cache is current). False at once when neither the rules its values
// were cascaded from nor its style attribute declare color-scheme (or
// all), so that an element of a document without color-scheme pays one
// property read per computed color.
const INHERITING = new Set(['inherit', 'unset']);
function declaresScheme(element) {
  const cache = element[S].cascaded;
  let declares = cache.scheme;
  if (declares !== undefined) return declares;
  const { index, inline } = cache;
  if (
    index !== undefined &&
    !index.has('color-scheme') &&
    !index.has('all') &&
    (inline === null || (!inline.has('color-scheme') && !inline.has('all')))
  ) {
    declares = false;
  } else {
    const value = cascaded(element, 'color-scheme');
    declares = value !== undefined && !INHERITING.has(value.toLowerCase());
  }
  return (cache.scheme = declares);
}

// Whether a cascaded color is inherited: none declared, inherit or unset.
const inheritsColor = (value) => value === undefined || INHERITING.has(value.toLowerCase());

// Whether an element or one up its inheritance chain declares a color it
// inherits (not initial, which stops the search). Kept with each settled
// element's cascaded values (dropped with them on any tree, attribute or
// style sheet change; see cascaded), so that a chain of elements that
// each declare color-scheme walks its ancestors once, not once per level.
// The chain is one tree's elements (inheritParent), so the settlement of
// kept values not known yet is found once per walk, from its top.
function colorDeclared(element) {
  let declared = false;
  let cached = false;
  let top = element;
  const path = [];
  for (let e = element; e !== null; e = inheritParent(e)) {
    top = e;
    const value = cascaded(e, 'color');
    const cache = e[S].cascaded;
    if (cache.settled !== false) {
      if (cache.colorDeclared !== undefined) {
        declared = cache.colorDeclared;
        cached = true;
        break;
      }
      path.push(cache);
    }
    if (!inheritsColor(value)) {
      declared = value.toLowerCase() !== 'initial';
      break;
    }
  }
  let settled;
  for (const cache of path) {
    if (cache.settled === undefined) {
      // An ancestor that kept its answer is in the document's tree.
      settled ??= cached || rootOf(top)[S].type === DOCUMENT_NODE;
      cache.settled = settled;
    }
    if (cache.settled) cache.colorDeclared = declared;
  }
  return declared;
}

function computeColors(element, name, value, data) {
  const compat = element[S].doc[S].window[S].compat;
  // cssstyle before 4.4 leaves a border's colors undeclared when it gives
  // none (border: 2px inset); the expansion's initial currentcolor (in
  // lowercase) stands for that.
  if (value === 'currentcolor' && compat.colorKeywords === 'css2' && BORDER_COLOR.test(name)) {
    return compat.computedColors === 'declared' ? '' : currentColor(element);
  }
  if (compat.legacyComputedStyle) {
    // jsdom 22.1 to 28 (black box, 22.1.0 to 28.1.0) resolve the colors
    // of these properties only; others (fill, stroke, text-shadow,
    // accent-color, scrollbar-color, text-decoration-color, ...) compute
    // as declared.
    if (compat.computedColors !== 'declared' && !LEGACY_RESOLVED_COLORS.has(name)) return value;
  } else return resolvedColorValue(element, name, value, data, compat);
  const parts = segments(value);
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (!token) continue;
    if (compat.computedColors === 'declared') {
      const opaque = OPAQUE_RGBA.exec(token);
      if (opaque !== null) parts[i] = `rgb(${opaque[1]})`;
      continue;
    }
    const lower = token.toLowerCase();
    if (lower === 'currentcolor') {
      // cssstyle before 4.4: kept, as currentColor.
      if (compat.colorKeywords === 'css2') {
        parts[i] = 'currentColor';
        continue;
      }
      parts[i] = name === 'color' ? inheritedValue(element, 'color', data) : currentColor(element);
    } else if (compat.computedColors !== 'keywords') {
      // From jsdom 27 a system color takes its dark value where the
      // computed color-scheme is exactly 'dark' (not 'light dark' or
      // 'only dark'; black box, 27.4.0 to 30.1.3).
      const dark = DARK_SYSTEM_COLORS[lower];
      parts[i] = dark !== undefined && darkScheme(element) ? dark : (resolveColor(token, compat.legacyColors) ?? token);
    } else if (systemColorKind(lower) === 0 && !lower.startsWith('hsl') && !/^[a-zA-Z]*[A-Z][a-zA-Z]*\(/.test(token)) {
      parts[i] = resolveColor(token, lower[0] === '#' ? 'floor' : compat.legacyColors) ?? token;
    }
  }
  return parts.join('');
}

const LEGACY_RESOLVED_COLORS = new Set([
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-block-start-color',
  'border-block-end-color',
  'border-inline-start-color',
  'border-inline-end-color',
  'outline-color',
  'caret-color',
]);
const IDENTIFIER = /^-?[a-z_][a-z0-9_-]*$/;
// A value's first component: up to the first whitespace (space, tab,
// newline, carriage return, form feed) or comma outside parentheses.
function firstComponent(value) {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) depth--;
    else if (depth === 0 && (c === 32 || c === 44 || (c >= 9 && c <= 13 && c !== 11))) return value.slice(0, i);
  }
  return value;
}

// The index of the parenthesis that closes a value's first one, or -1.
function closingParen(value) {
  let depth = 0;
  for (let i = value.indexOf('('); i >= 0 && i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41 && --depth === 0) return i;
  }
  return -1;
}

// jsdom 29.0.2 and later (black box, 29.1.1 to 30.1.3) compute a property
// that holds colors from its first component: a color gives that color
// alone (scrollbar-color: red blue gives rgb(255, 0, 0), text-shadow: red
// 1px 1px too), another keyword transparent (caret-color and accent-color
// auto, stroke and fill none or context-stroke, text-shadow none,
// scrollbar-color auto: rgba(0, 0, 0, 0)), anything else the value as
// declared (text-shadow: 1px 1px currentcolor, fill: url(#x) red).
// color-mix() in srgb is computed (colors.js mixColor), alone or followed
// by other components (text-shadow: color-mix(in srgb, blue, red) 1px 1px
// gives the mix alone, a mix it cannot compute transparent); a var()
// anywhere in the value keeps it as declared.
function resolvedColorValue(element, name, value, data, compat) {
  if (compat.computed31) {
    const components = componentsValue31(element, name, value, data);
    if (components !== null) return components;
    const color = colorValue31(element, name, value, data);
    if (color !== null) return color;
  }
  const token = firstComponent(value);
  const lower = token.toLowerCase();
  let color;
  if (lower === 'currentcolor')
    color = name === 'color' ? inheritedValue(element, 'color', data) : currentColor(element);
  else if (lower.startsWith('color-mix(')) {
    // The function alone: what follows it need not start with a space
    // (color-mix(in srgb, blue, red)1px 1px).
    const end = closingParen(token);
    if (end < 0 || value.includes('var(')) return value;
    // currentcolor resolved once per mix, and only if the mix names it (a
    // chain of currentcolor mixes would otherwise resolve each parent's
    // color twice per level).
    let currentValue;
    const current = () =>
      (currentValue ??= name === 'color' ? inheritedValue(element, 'color', data) : currentColor(element));
    const mixed = mixColor(token.slice(0, end + 1), current, compat.jsdom >= 30);
    return mixed === false ? 'rgba(0, 0, 0, 0)' : (mixed ?? value);
  } else {
    // From jsdom 27 a system color takes its dark value where the
    // computed color-scheme is exactly 'dark' (not 'light dark' or
    // 'only dark'; black box, 27.4.0 to 30.1.3).
    const dark = DARK_SYSTEM_COLORS[lower];
    color = dark !== undefined && darkScheme(element) ? dark : resolveColor(token, compat.legacyColors);
    if (color === null) return IDENTIFIER.test(lower) ? 'rgba(0, 0, 0, 0)' : value;
  }
  return color;
}

// jsdom 31 (black box, 31.0.1): a value of one color, or one keyword, as
// a whole. currentcolor is the color (the parent's for color), but
// accent-color, box-shadow-color, fill and stroke keep it, and a mix of
// it, as declared; a system color takes its dark value where the
// element's color-scheme is dark (darkScheme31; ButtonText white);
// color-mix() mixes as CSS Color 5 (colors.js mix31); caret-color and
// outline-color: auto are the color, other keywords themselves (auto,
// none, context-fill). null for a value of more components (text-shadow,
// scrollbar-color, fill with url(): resolvedColorValue's first
// component).
const KEEPS_CURRENTCOLOR = new Set(['accent-color', 'box-shadow-color', 'fill', 'stroke']);
const CURRENTCOLOR_WORD = /currentcolor/i;
function colorValue31(element, name, value, data) {
  const lower = value.toLowerCase();
  // light-dark(): its light or dark color as computed, by the element's
  // color-scheme; one that keeps currentcolor keeps the function as
  // declared (black box, 31.0.1)
  if (lower.startsWith('light-dark(')) {
    const picked = lightDark31(element, value);
    if (picked === null) return null;
    // (a color it does not compute, lab() or color(), as declared; one
    // that keeps currentcolor, a mix of it too, keeps the function)
    const color = colorValue31(element, name, picked, data);
    if (color === null) return picked;
    return color === 'currentcolor' || (KEEPS_CURRENTCOLOR.has(name) && CURRENTCOLOR_WORD.test(color)) ? value : color;
  }
  // contrast-color(c): white or black, whichever contrasts more with c
  // (WCAG 2 contrast, alpha left out; black 4.62 against 4.54 at #767676,
  // white at #757575: black box, 31.0.1); c computed first, so one that
  // keeps currentcolor keeps the function as declared
  if (lower.startsWith('contrast-color(')) {
    if (closingParen(value) !== value.length - 1) return null;
    let inner = value.slice(value.indexOf('(') + 1, -1).trim();
    // (light-dark() picked first, so that its color keeps its exact
    // channels; colorValue31 rounds rgb(), hsl() and hwb(): only
    // currentcolor, mixes, system and named colors go through it)
    for (let depth = 0; depth < 32 && inner.toLowerCase().startsWith('light-dark('); depth++) {
      inner = lightDark31(element, inner);
      if (inner === null) return null;
    }
    const innerLower = inner.toLowerCase();
    const color =
      innerLower === 'currentcolor' ||
      innerLower.startsWith('color-mix(') ||
      innerLower.startsWith('contrast-color(') ||
      IDENTIFIER.test(innerLower)
        ? (colorValue31(element, name, inner, data) ?? inner)
        : inner;
    if (color === 'currentcolor' || (KEEPS_CURRENTCOLOR.has(name) && CURRENTCOLOR_WORD.test(color))) return value;
    const y = luminance31(color);
    if (y === null) return null;
    return (y + 0.05) / 0.05 > 1.05 / (y + 0.05) ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
  }
  if (lower === 'currentcolor') {
    if (KEEPS_CURRENTCOLOR.has(name)) return lower;
    return name === 'color' ? inheritedValue(element, 'color', data) : currentColor(element);
  }
  if (lower.startsWith('color-mix(')) {
    if (closingParen(value) !== value.length - 1) return null;
    // (light-dark() and contrast-color() in the mix resolved first: the
    // mix of the colors they give; one that keeps currentcolor keeps the
    // mix as declared, black box 31.0.1)
    const colors = NESTED_CONTEXT.test(value) ? resolveNested31(element, name, value, data, 0) : value;
    if (KEEPS_CURRENTCOLOR.has(name) && CURRENTCOLOR_WORD.test(colors)) return present31(value);
    let currentValue;
    const current = () =>
      (currentValue ??= name === 'color' ? inheritedValue(element, 'color', data) : currentColor(element));
    const mixed = mixColor(colors, current, 31, 0, darkScheme(element));
    return mixed === false ? 'rgba(0, 0, 0, 0)' : (mixed ?? value);
  }
  const dark = DARK_SYSTEM_COLORS_31[lower];
  if (dark !== undefined && darkScheme(element)) return dark;
  const color = resolveColor(value, 'jsdom31');
  if (color !== null) return color;
  if (!IDENTIFIER.test(lower)) return null;
  return lower === 'auto' && AUTO_CURRENTCOLOR.has(name) ? currentColor(element) : lower;
}

// A computed color's relative luminance (WCAG 2: CIE Y under D65), or
// null for a color it cannot read: sRGB colors from their exact channels;
// oklab() and oklch() through linear sRGB; lab(), lch(), xyz-d50 and
// prophoto-rgb (D50) through XYZ adapted to D65, as jsdom 31 reads them
// (black box, 31.0.1); other color() spaces through their transfer
// function and the Y row of their RGB to XYZ matrix. Channels may be
// numbers, percentages, none, or calc() of one of them.
const linear = (c) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4);
// (Y of an XYZ D50 color after Bradford adaptation to D65)
const d65Y = (x, y, z) => -0.0283697093338637 * x + 1.0099953980813041 * y + 0.021041441191917323 * z;
const PROPHOTO_Y = [
  d65Y(0.7977604896723027, 0.2880711282292934, 0),
  d65Y(0.13518583717574031, 0.7118432178101014, 0),
  d65Y(0.0313493495815248, 0.00008565396060525902, 0.8251046025104601),
];
const COLOR_SPACES = {
  __proto__: null,
  srgb: [linear, 0.2126, 0.7152, 0.0722],
  'srgb-linear': [(c) => c, 0.2126, 0.7152, 0.0722],
  'display-p3': [linear, 0.2289746, 0.6917385, 0.0792869],
  'a98-rgb': [(c) => Math.sign(c) * Math.abs(c) ** (563 / 256), 0.2973769, 0.6273491, 0.0752741],
  'prophoto-rgb': [(c) => (Math.abs(c) <= 1 / 32 ? c / 16 : Math.sign(c) * Math.abs(c) ** 1.8), ...PROPHOTO_Y],
  rec2020: [
    (c) => (Math.abs(c) < 0.081243 ? c / 4.5 : Math.sign(c) * ((Math.abs(c) + 0.099297) / 1.099297) ** (1 / 0.45)),
    0.2627002,
    0.6779981,
    0.0593017,
  ],
};
// (a math function of numbers, or of percentages only: lengths.js)
const MATH_CALL = /^[a-z-]+\(/i;
function channel(text, range = 1) {
  if (MATH_CALL.test(text)) {
    if (!text.includes('%')) return absoluteNumber(text) ?? NaN;
    const percent = absoluteNumber(text.replace(/%/g, ''));
    return percent === null ? NaN : (percent / 100) * range;
  }
  if (text.toLowerCase() === 'none') return 0;
  if (text.endsWith('%')) return (Number(text.slice(0, -1)) / 100) * range;
  return Number(text.replace(/deg$/i, ''));
}
// A hue in degrees: a number, an angle (deg, turn, rad, grad), none, or a
// math function of them (calc(1turn / 3)); NaN otherwise.
const ANGLE = /([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|turn|rad|grad)\b/gi;
const DEGREES = { __proto__: null, deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 };
const toDegrees = (text) => text.replace(ANGLE, (m, n, unit) => String(Number(n) * DEGREES[unit.toLowerCase()]));
function hue(text) {
  if (text.toLowerCase() === 'none') return 0;
  if (MATH_CALL.test(text)) return absoluteNumber(toDegrees(text)) ?? NaN;
  return Number(toDegrees(text));
}
// The sRGB channels (0 to 1) of rgb(), hsl() and hwb() from their exact
// arguments (math functions in them too), or null.
function srgbFunction(fn, args) {
  if (args.length !== 3) return null;
  if (fn === 'rgb' || fn === 'rgba') return args.map((c) => channel(c, 255) / 255);
  const h = (((hue(args[0]) % 360) + 360) % 360) / 360;
  const x = channel(args[1], 100) / 100;
  const y = channel(args[2], 100) / 100;
  if (fn === 'hwb') {
    if (x + y >= 1) return [x / (x + y), x / (x + y), x / (x + y)];
    return hslChannels(h, 1, 0.5).map((c) => c * (1 - x - y) + x);
  }
  return hslChannels(h, Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
}
function hslChannels(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// lab() to the D65 Y (CIE Lab with a D50 white).
const CHROMA_RANGE = { __proto__: null, lab: 125, lch: 150, oklab: 0.4, oklch: 0.4 };
function labY(l, a, b) {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const fy = (l + 16) / 116;
  const f = (t) => (t ** 3 > epsilon ? t ** 3 : (116 * t - 16) / kappa);
  const x = f(fy + a / 500) * (0.3457 / 0.3585);
  const y = l > kappa * epsilon ? fy ** 3 : l / kappa;
  const z = f(fy - b / 200) * ((1 - 0.3457 - 0.3585) / 0.3585);
  return d65Y(x, y, z);
}
function luminance31(color) {
  const open = color.indexOf('(');
  let y = null;
  if (open > 0 && closingParen(color) === color.length - 1) {
    const fn = color.slice(0, open).trim().toLowerCase();
    const body = color.slice(open + 1, -1);
    // (the legacy syntax: commas outside parentheses, the alpha fourth)
    const commas = splitTopLevel(body, 44);
    const args = commas.length > 1 ? commas.slice(0, 3) : splitTopLevel(splitTopLevel(body, 47)[0], 32);
    if (fn === 'rgb' || fn === 'rgba' || fn === 'hsl' || fn === 'hsla' || fn === 'hwb') {
      const rgb = srgbFunction(fn.replace(/a$/, ''), args);
      if (rgb === null) return null;
      const [r, g, b] = rgb.map((c) => Math.min(1, Math.max(0, c)));
      y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    } else if (fn === 'lab' || fn === 'lch' || fn === 'oklab' || fn === 'oklch') {
      if (args.length !== 3) return null;
      const ok = fn.startsWith('ok');
      const l = channel(args[0], ok ? 1 : 100);
      // (100% of a and b: 0.4 in oklab(), 125 in lab(); of chroma: 0.4, 150)
      let a = channel(args[1], CHROMA_RANGE[fn]);
      let b = channel(args[2], ok ? 0.4 : 125);
      if (fn === 'lch' || fn === 'oklch') {
        const h = (hue(args[2]) * Math.PI) / 180;
        [a, b] = [a * Math.cos(h), a * Math.sin(h)];
      }
      if (!ok) y = labY(Math.min(100, Math.max(0, l)), a, b);
      else {
        const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
        const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
        const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
        const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
        y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      }
    } else if (fn === 'color') {
      if (args.length !== 4) return null;
      const space = args[0].toLowerCase();
      const [r, g, b] = args.slice(1).map((c) => channel(c));
      if (space === 'xyz' || space === 'xyz-d65') y = g;
      else if (space === 'xyz-d50') y = d65Y(r, g, b);
      else if (COLOR_SPACES[space] !== undefined) {
        const [transfer, kr, kg, kb] = COLOR_SPACES[space];
        y = kr * transfer(r) + kg * transfer(g) + kb * transfer(b);
      }
    }
  }
  if (y === null) {
    const channels = srgbChannels31(color);
    if (channels === null) return null;
    const [r, g, b] = channels.map((c) => Math.min(1, Math.max(0, c)));
    y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }
  return Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : null;
}

// A value with every light-dark() and contrast-color() in it replaced by
// the color it gives (a light-dark() by its pick, so that currentcolor
// stays for the mix to resolve), strings skipped.
const NESTED_CONTEXT = /(?:light-dark|contrast-color)\(/i;
const NESTED_AT = /(light-dark|contrast-color)\(/iy;
function resolveNested31(element, name, value, data, depth) {
  let out = '';
  let from = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 92) i++;
    else if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else {
      NESTED_AT.lastIndex = i;
      const m = NESTED_AT.exec(value);
      if (m === null || (i > 0 && /[\w-]/.test(value[i - 1]))) continue;
      const end = closingParenthesis(value, NESTED_AT.lastIndex);
      if (end >= value.length) break;
      const token = value.slice(i, end + 1);
      let color;
      if (m[1].toLowerCase() === 'light-dark') {
        const picked = lightDark31(element, token);
        color = picked === null || depth > 32 ? token : resolveNested31(element, name, picked, data, depth + 1);
      } else color = colorValue31(element, name, token, data) ?? token;
      out += value.slice(from, i) + color;
      from = end + 1;
      i = end;
    }
  }
  return out + value.slice(from);
}

// light-dark(a, b): a, or b where the element's color-scheme is dark; null
// for other arguments.
function lightDark31(element, value) {
  const end = closingParen(value);
  if (end !== value.length - 1) return null;
  const args = splitTopLevel(value.slice(value.indexOf('(') + 1, end), 44);
  if (args.length !== 2) return null;
  return darkScheme(element) ? args[1] : args[0];
}

// A value's parts at a separator (code) outside parentheses and strings,
// trimmed of CSS whitespace.
function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 92) i++;
    else if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else if (c === 40) depth++;
    else if (c === 41) depth--;
    else if (depth === 0 && (separator === 32 ? isCssSpace(c) : c === separator)) {
      if (separator !== 32 || i > start) parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (separator !== 32 || start < value.length) parts.push(value.slice(start).trim());
  return separator === 32 ? parts.filter((part) => part !== '') : parts;
}

const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|device-cmyk|contrast-color)\(/;
// One color among a value's components as jsdom 31 computes it (black
// box, 31.0.1): currentcolor kept, a mix of it or a light-dark() that
// picks it kept as declared, other colors computed; null for a component
// that is no color.
function componentColor31(element, token, data) {
  const lower = token.toLowerCase();
  if (lower === 'currentcolor') return 'currentcolor';
  // (a color function colorValue31 does not compute, lab() or color(),
  // is a color as declared)
  const modern = COLOR_FUNCTION.test(lower);
  if (
    !modern &&
    !lower.startsWith('light-dark(') &&
    !lower.startsWith('color-mix(') &&
    DARK_SYSTEM_COLORS_31[lower] === undefined &&
    resolveColor(token, 'jsdom31') === null
  )
    return null;
  return colorValue31(element, 'fill', token, data) ?? (modern ? token : null);
}

// The colors of a value of more components (jsdom 31, black box 31.0.1);
// null for a value colorValue31 computes as a whole.
// - text-shadow: each shadow its color first (none for currentcolor),
//   then its lengths in px, a 0px blur left out;
// - scrollbar-color: both colors;
// - fill and stroke: the url() and its fallback's color (or keyword).
function componentsValue31(element, name, value, data) {
  if (name === 'text-shadow') return value.toLowerCase() === 'none' ? null : textShadow31(element, value, data);
  if (name === 'scrollbar-color' || ((name === 'fill' || name === 'stroke') && /^url\(/i.test(value))) {
    const parts = splitTopLevel(value, 32);
    if (parts.length < 2) return null;
    return parts.map((part) => componentColor31(element, part, data) ?? part).join(' ');
  }
  return null;
}
function textShadow31(element, value, data) {
  const shadows = [];
  let ctx = null;
  for (const shadow of splitTopLevel(value, 44)) {
    let color = null;
    const lengths = [];
    for (const part of splitTopLevel(shadow, 32)) {
      const c = componentColor31(element, part, data);
      if (c !== null) {
        color = c;
        continue;
      }
      ctx ??= new LengthContext(element, false);
      const px = part === '0' ? 0 : absoluteLength(part, ctx);
      lengths.push(px === null ? part : `${sixDigits(px)}px`);
    }
    if (lengths.length === 3 && lengths[2] === '0px') lengths.pop();
    if (color !== null && color !== 'currentcolor') lengths.unshift(color);
    shadows.push(lengths.join(' '));
  }
  return shadows.join(', ');
}

// jsdom 31 computes the colors in a value's gradients (any property:
// background-image, mask-image, border-image-source, list-style-image;
// black box, 31.0.1): each color stop's color as componentColor31 does.
const GRADIENT = /gradient\(/i;
const GRADIENT_AT = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/iy;
const URL_AT = /url\(/iy;
function gradientColors31(element, value, data) {
  let out = '';
  let from = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    // (strings and url()s skipped: url("gradient(red).png") is a file name)
    if (c === 92) i++;
    else if (c === 34 || c === 39) i = stringEnd(value, i) - 1;
    else {
      URL_AT.lastIndex = i;
      if (URL_AT.test(value)) {
        i = closingParenthesis(value, i + 4);
        continue;
      }
      GRADIENT_AT.lastIndex = i;
      if (!GRADIENT_AT.test(value)) continue;
      const open = GRADIENT_AT.lastIndex - 1;
      const close = closingParenthesis(value, open + 1);
      if (close >= value.length) break;
      const stops = splitTopLevel(value.slice(open + 1, close), 44).map((stop) =>
        splitTopLevel(stop, 32)
          .map((part) => componentColor31(element, part, data) ?? part)
          .join(' '),
      );
      out += `${value.slice(from, open + 1)}${stops.join(', ')})`;
      from = close + 1;
      i = close;
    }
  }
  return out + value.slice(from);
}

// --- absolute lengths (jsdom 30) ----------------------------------------------------

// The px number of a computed font-size (16 when it is not in px, as for
// a var() value jsdom does not substitute).
const fontPx = (value) => (value.endsWith('px') ? Number(value.slice(0, -2)) || 0 : 16);

function documentElementOf(element) {
  for (let n = element[S].doc[S].first; n !== null; n = n[S].next) if (n[S].type === ELEMENT_NODE) return n;
  return null;
}

// The font sizes a length refers to (lengths.js): em from the element's
// font size (or its parent's, for font-size), rem from the root's.
class LengthContext {
  // forParent: lengths of font-size, and from jsdom 31 of line-height,
  // whose em (font-size) and lh (both) are the parent's.
  constructor(element, forFontSize, forLineHeight = false) {
    this.element = element;
    this.forFontSize = forFontSize;
    this.forLineHeight = forLineHeight;
    this.emPx = -1;
    this.remPx = -1;
    // jsdom 31 (black box, 31.0.1): the small, large and dynamic viewport
    // and container units; lh and rlh the line-height in px, normal 1.15
    // times the font size; cap 0.905 em.
    this.jsdom31 = element[S].doc[S].window[S].compat.computed31 === true;
    this.allViewport = this.jsdom31;
    this.capRatio = this.jsdom31 ? 0.905 : 1;
  }
  em() {
    if (this.emPx < 0) {
      const parent = this.forFontSize ? inheritParent(this.element) : this.element;
      this.emPx = parent === null ? 16 : fontPx(computedValue(parent, 'font-size'));
    }
    return this.emPx;
  }
  rem() {
    if (this.remPx < 0) {
      const root = documentElementOf(this.element);
      this.remPx =
        root === null || (root === this.element && this.forFontSize) ? 16 : fontPx(computedValue(root, 'font-size'));
    }
    return this.remPx;
  }
  // line-height normal: 1.2 times the font size (jsdom 30).
  lh() {
    if (!this.jsdom31) return 1.2 * this.em();
    const own = !this.forFontSize && !this.forLineHeight;
    return lineHeightPx(own ? this.element : inheritParent(this.element));
  }
  rlh() {
    if (!this.jsdom31) return 1.2 * this.rem();
    const root = documentElementOf(this.element);
    return lineHeightPx(root === this.element && (this.forFontSize || this.forLineHeight) ? null : root);
  }
}

// jsdom 31: an element's line-height in px (null: none, 16px normal).
function lineHeightPx(element) {
  if (element === null) return 1.15 * 16;
  const value = computedValue(element, 'line-height');
  return value.endsWith('px') ? Number(value.slice(0, -2)) || 0 : 1.15 * fontPx(computedValue(element, 'font-size'));
}

// jsdom 30: font-size keywords, larger and smaller, percentages and
// lengths from the parent's font size.
function absoluteFontSize(element, value) {
  const lower = value.toLowerCase();
  // (jsdom 31: math is the parent's size)
  if (lower === 'math' && element[S].doc[S].window[S].compat.computed31) {
    const parent = inheritParent(element);
    return parent === null ? '16px' : computedValue(parent, 'font-size');
  }
  const keyword = FONT_SIZE_KEYWORDS[lower];
  if (keyword !== undefined) return `${keyword}px`;
  if (value.includes('(') && element[S].doc[S].window[S].compat.computed31) value = fontSizeMath31(element, value);
  if (lower === 'larger' || lower === 'smaller' || value.endsWith('%')) {
    const parent = inheritParent(element);
    const base = parent === null ? 16 : fontPx(computedValue(parent, 'font-size'));
    if (lower === 'larger') return `${sixDigits(base * 1.2)}px`;
    if (lower === 'smaller') return `${sixDigits(base / 1.2)}px`;
    const percent = Number(value.slice(0, -1));
    return Number.isNaN(percent) ? value : `${sixDigits((base * percent) / 100)}px`;
  }
  if (!mayResolve(value)) return value;
  const px = absoluteLength(value, new LengthContext(element, true));
  return px === null ? value : `${sixDigits(px)}px`;
}

// jsdom 31's own computed values for some longhands (black box, 31.0.1):
// - outline and rule widths: thin, medium and thick in px, whatever the
//   style (outline-width 3px for none);
// - font-width: keywords as percentages (condensed 75%);
// - outline-color: auto stays auto with outline-style auto, else the
//   current color;
// - box-shadow-color: each layer's color, but currentcolor and
//   transparent kept as keywords (currentcolor, rgb(255, 0, 0));
// - background-position-x and -y, offset-position, offset-anchor and
//   mask-position (per layer): keywords as percentages (center 50%, left top 0% 0%).
// null for the others.
const outlineAuto31 = (element) =>
  computedValue(element, 'outline-style').toLowerCase() === 'auto' ? 'auto' : currentColor(element);
const LINE_WIDTH31 = new Set(['outline-width', 'column-rule-width', 'row-rule-width']);
// (in whole px, as a device pixel snaps them: 10.9px is 10px, 0.5px 1px;
// black box, 31.0.1; border widths are not)
function lineWidth31(value) {
  const m = /^((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)px$/i.exec(value);
  if (m === null) return null;
  const px = Number(m[1]);
  if (px === 0) return '0px';
  return px < 1 ? '1px' : `${Math.floor(px)}px`;
}
const FONT_WIDTHS31 = {
  __proto__: null,
  'ultra-condensed': '50%',
  'extra-condensed': '62.5%',
  condensed: '75%',
  'semi-condensed': '87.5%',
  normal: '100%',
  'semi-expanded': '112.5%',
  expanded: '125%',
  'extra-expanded': '150%',
  'ultra-expanded': '200%',
};
const Y_KEYWORD = new Set(['top', 'bottom']);
const COMPUTED31 = new Set([
  ...LINE_WIDTH31,
  'font-width',
  'outline-color',
  'box-shadow-color',
  'background-position-x',
  'background-position-y',
  'offset-position',
  'offset-anchor',
  'mask-position',
  'object-position',
  'perspective-origin',
]);
function computed31(element, name, value, data) {
  if (name === 'filter' && value.includes('drop-shadow(')) return dropShadows31(element, value, data);
  if (!COMPUTED31.has(name)) return null;
  const lower = value.toLowerCase();
  if (LINE_WIDTH31.has(name)) return BORDER_WIDTHS[lower] ?? lineWidth31(value);
  if (name === 'font-width') return FONT_WIDTHS31[lower] ?? null;
  if (name === 'outline-color' && lower === 'auto') return outlineAuto31(element);
  if (name === 'box-shadow-color') {
    return topLevelCommaSplit(value)
      .map((layer) => {
        const color = layer.trim();
        const keyword = color.toLowerCase();
        return keyword === 'currentcolor' || keyword === 'transparent'
          ? keyword
          : computeColors(element, name, color, data);
      })
      .join(', ');
  }
  if (name === 'background-position-x' || name === 'background-position-y') {
    const layers = topLevelCommaSplit(value).map((layer) => edge31(element, tokens31(layer.trim())));
    return layers.includes(null) ? null : layers.join(', ');
  }
  if (
    name === 'offset-position' ||
    name === 'offset-anchor' ||
    name === 'object-position' ||
    name === 'perspective-origin'
  )
    return position31(element, tokens31(value.trim()));
  if (name === 'mask-position') {
    const layers = topLevelCommaSplit(value).map((layer) => position31(element, tokens31(layer.trim())));
    return layers.includes(null) ? null : layers.join(', ');
  }
  return null;
}
// filter's drop-shadow()s computed (black box, 31.0.1): the color first,
// resolved (currentcolor where none is given), then the offsets and the
// blur, 0px where none is given.
// (only drop-shadow() functions, outside strings and url(), their
// arguments balanced; the color as filter's, so currentcolor is the
// element's own color; #349 review)
function dropShadows31(element, value, data) {
  let out = '';
  let from = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    const named = /[\w\u0080-\uffff-]/.test(value[i - 1] ?? '');
    if (c === '\\') i++;
    else if (c === '"' || c === "'") {
      i++;
      while (i < value.length && value[i] !== c) i += value[i] === '\\' ? 2 : 1;
    } else if (!named && (c === 'u' || c === 'U') && /^url\(/i.test(value.slice(i, i + 4))) {
      i = parenEnd31(value, i + 3);
      if (i < 0) break;
    } else if (!named && (c === 'd' || c === 'D') && /^drop-shadow\(/i.test(value.slice(i, i + 12))) {
      const close = parenEnd31(value, i + 11);
      if (close < 0) break;
      out += value.slice(from, i) + dropShadow31(element, value.slice(i + 12, close), data);
      from = close + 1;
      i = close;
    }
  }
  return out + value.slice(from);
}
function dropShadow31(element, args, data) {
  const lengths = [];
  const color = [];
  for (const word of tokens31(args.trim())) {
    if (word === '0' || /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?px$/i.test(word))
      lengths.push(word === '0' ? '0px' : word);
    else color.push(word);
  }
  if (lengths.length === 2) lengths.push('0px');
  const resolved = computeColors(element, 'filter', color.length ? color.join(' ') : 'currentcolor', data);
  return `drop-shadow(${resolved} ${lengths.join(' ')})`;
}
// The ) that closes the ( at open, strings and escapes skipped; -1 if none.
function parenEnd31(text, open) {
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') k++;
    else if (c === '"' || c === "'") {
      k++;
      while (k < text.length && text[k] !== c) k += text[k] === '\\' ? 2 : 1;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k;
  }
  return -1;
}
// A position's x or y: a keyword as a percentage, a length in px, an
// offset from the left or top that length, from the right or bottom 100%
// less it (calc(100% - 10px); 90% for 10%; calc(100% + 0px) for 0). null
// when not one of these.
const X_KEYWORD = new Set(['left', 'right']);
const tokens31 = (value) => segments(value).filter((_, i) => i % 2 === 0);
function edge31(element, words) {
  if (words.length > 2) return null;
  const [first, offset] = words;
  const percent = POSITION_PERCENT[first.toLowerCase()];
  if (offset === undefined) return percent ?? length31(element, first);
  const keyword = first.toLowerCase();
  const length = length31(element, offset);
  if (percent === undefined || keyword === 'center' || length === null) return null;
  if (keyword === 'left' || keyword === 'top') return length;
  if (length.endsWith('%')) return `${sixDigits(100 - Number(length.slice(0, -1)))}%`;
  // (a math function of a percentage and a length stays one: calc(100% -
  // (10% + 5px)), calc(100% - min(10%, 5px)))
  if (MATH.test(length))
    return length.slice(0, 5).toLowerCase() === 'calc('
      ? `calc(100% - (${length.slice(5, -1)}))`
      : `calc(100% - ${length})`;
  const px = Number(length.slice(0, -2));
  return px > 0 ? `calc(100% - ${length})` : `calc(100% + ${sixDigits(-px)}px)`;
}
// (a math function that does not resolve to px, with a percentage, as
// declared; not modeled: jsdom 31 resolves the lengths in it, calc(10% +
// 1em) is calc(10% + 20px), as for width)
const MATH = /^(?:calc|min|max|clamp)\(.*\)$/is;
function length31(element, text) {
  if (text.endsWith('%')) return Number.isNaN(Number(text.slice(0, -1))) ? null : text;
  if (text === '0') return '0px';
  const px = absoluteLength(text, new LengthContext(element, false));
  if (px !== null) return `${sixDigits(px)}px`;
  return MATH.test(text) ? text : null;
}
// offset-position: one or two keywords or lengths (a vertical keyword
// first, or a horizontal one second, is read as y), or two edges with
// their offsets; normal and auto as they are.
function position31(element, words) {
  let x, y;
  if (words.length <= 2) {
    [x, y] = [words[0], words[1] ?? 'center'].map((w) => [w]);
  } else if (words.length === 4) [x, y] = [words.slice(0, 2), words.slice(2)];
  else return null;
  if (Y_KEYWORD.has(x[0].toLowerCase()) || X_KEYWORD.has(y[0].toLowerCase())) [x, y] = [y, x];
  const px = edge31(element, x),
    py = edge31(element, y);
  return px === null || py === null ? null : `${px} ${py}`;
}

// jsdom 31's computed dimensions (black box, 31.0.1; #269 part F3c): in
// any property's value but a custom one's, every length in px (1em,
// translateX(2rem), box-shadow: 1em 1em), every angle in deg (1turn is
// 360deg, 1rad 57.2958deg) and time in s (100ms is 0.1s), six digits; a
// math function that resolves to one value is that value (calc(1em +
// 1px) is 11px, calc(180deg) 180deg; calc(10% + 1em) is calc(10% +
// 10px)). Strings and url() as they are. font-size's em is its parent's
// (absoluteFontSize, below).
const ANGLE_DEG31 = { grad: 0.9, rad: 180 / Math.PI, turn: 360 };
const DPPX31 = { x: 1, dpi: 1 / 96, dpcm: 2.54 / 96 };
const DIMENSION31 = /(?<![\w\u0080-\uffff#.\\-])([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]+)/gi;
const HAS_UNIT31 = /\d[a-z]/i;
const MATH31 =
  /(?<![\w\u0080-\uffff\\-])(?:calc|min|max|clamp|round|mod|rem|abs|sign|hypot|sqrt|pow|exp|log|sin|cos|tan|asin|acos|atan|atan2)\(/gi;
function absolutize31(element, name, value) {
  if (name.startsWith('--')) return value;
  const urls = value.includes('url(');
  if (!urls && !HAS_UNIT31.test(value)) return value;
  // (font-size: absoluteFontSize, fontSizeMath31)
  if (name === 'font-size') return value;
  // (no strings nor url(): the value is one piece; kept by value where no
  // length in it needed the element, 100ms or 1turn; looked up before the
  // callback is made, #349 review)
  const plain = !urls && !value.includes('"') && !value.includes("'");
  if (plain) {
    const known = contextFree31.get(value);
    if (known !== undefined) return known;
  }
  let ctx = null;
  const dimension = (match, number, unit, at, text) => {
    // (in an identifier after an escape, as written: \31 1em, a\+1turn;
    // #349 review)
    if (afterEscape31(text, at)) return match;
    const lower = unit.toLowerCase();
    if (lower === 'px' || lower === 'deg' || lower === 's') return match;
    const n = Number(number);
    if (lower === 'ms') return `${sixDigits(n / 1000)}s`;
    // (resolutions in dppx: image-set(... 1x) is 1dppx, 96dpi 1dppx)
    const resolution = DPPX31[lower];
    if (resolution !== undefined) return `${sixDigits(n * resolution)}dppx`;
    const angle = ANGLE_DEG31[lower];
    if (angle !== undefined) return `${sixDigits(n * angle)}deg`;
    ctx ??= new LengthContext(element, name === 'font-size', name === 'line-height');
    const px = absoluteLength(match, ctx);
    return px === null ? match : `${sixDigits(px)}px`;
  };
  if (plain) {
    let out = value.replace(DIMENSION31, dimension);
    if (out.includes('(')) out = resolveMath31(out, element, name, ctx);
    if (ctx === null) {
      if (contextFree31.size >= 1000) contextFree31.clear();
      contextFree31.set(value, out);
    }
    return out;
  }
  // (outside strings and url(): split at them, the odd pieces kept)
  const pieces = value.split(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\burl\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)"']*)\s*\))/i,
  );
  // (a url() resolved against the document's base URL: url("a.png") is
  // url("http://host/dir/a.png"); empty, #fragment and data: ones as
  // they are)
  if (urls)
    for (let i = 1; i < pieces.length; i += 2)
      if (pieces[i][0] === 'u' || pieces[i][0] === 'U') pieces[i] = absoluteURL31(element, pieces[i]);
  for (let i = 0; i < pieces.length; i += 2) {
    if (!HAS_UNIT31.test(pieces[i])) continue;
    pieces[i] = pieces[i].replace(DIMENSION31, dimension);
    if (pieces[i].includes('(')) pieces[i] = resolveMath31(pieces[i], element, name, ctx);
  }
  return pieces.join('');
}
const contextFree31 = new Map();
// A font-size with a math function (jsdom 31): its lengths and
// percentages in px of the parent's size, then the math resolved, so
// round(1em, 1px) and calc(10% + 1em) resolve, calc(50%) too; #349
// review. One loop, no callbacks; lastIndex set again after each length,
// as the parent's font size may be computed here too.
const FONT_TERM31 = /(?<![\w\u0080-\uffff#.\\-])([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]+|%)/gi;
function fontSizeMath31(element, value) {
  if (value.includes('"') || value.includes("'")) return value;
  const ctx = new LengthContext(element, true);
  let out = '';
  let from = 0;
  FONT_TERM31.lastIndex = 0;
  for (let m = FONT_TERM31.exec(value); m !== null; m = FONT_TERM31.exec(value)) {
    const end = m.index + m[0].length;
    if (afterEscape31(value, m.index)) continue;
    const px = m[2] === '%' ? (Number(m[1]) * ctx.em()) / 100 : absoluteLength(m[0], ctx);
    FONT_TERM31.lastIndex = end;
    if (px === null) continue;
    out += `${value.slice(from, m.index)}${sixDigits(px)}px`;
    from = end;
  }
  return resolveMath31(out + value.slice(from), element, 'font-size', ctx);
}
const ONE_ARGUMENT31 = /^(?:calc|min|max|clamp)\($/i;
// Whether text[at] continues an identifier after an escape: the escaped
// character before it (a\+1turn), or the whitespace that ends a hex
// escape (\31 1em). Backslashes counted, so \\1em is a dimension.
function afterEscape31(text, at) {
  if (at < 2) return false;
  if (escapes31(text, at - 2)) return true;
  const c = text.charCodeAt(at - 1);
  if (c !== 32 && c !== 9 && c !== 10) return false;
  let k = at - 2;
  while (k >= 0 && at - 2 - k < 6 && isHex31(text.charCodeAt(k))) k--;
  return k < at - 2 && escapes31(text, k);
}
// Whether text[k] is a backslash that escapes what follows (an odd run).
function escapes31(text, k) {
  let slashes = 0;
  while (k - slashes >= 0 && text.charCodeAt(k - slashes) === 92) slashes++;
  return slashes % 2 === 1;
}
const isHex31 = (c) => (c >= 48 && c <= 57) || ((c | 32) >= 97 && (c | 32) <= 102);
// Whether value has a digit followed by a letter, or a url(): one pass,
// no allocation (getComputedStyle reads keywords most).
function needsAbsolute31(value) {
  for (let i = 0; i < value.length - 1; i++) {
    const c = value.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      const next = value.charCodeAt(i + 1) | 32;
      if (next >= 97 && next <= 122) return true;
    } else if (c === 117 && value.charCodeAt(i + 1) === 114 && value.startsWith('url(', i)) return true;
  }
  return false;
}
// (resolved once per base and url(): reads repeat them)
const resolvedURLs31 = new Map();
function absoluteURL31(element, piece) {
  const base = documentBaseURL(element[S].doc);
  const key = `${typeof base === 'string' ? base : base.href}\n${piece}`;
  let out = resolvedURLs31.get(key);
  if (out === undefined) {
    out = piece;
    let inner = piece.slice(4, -1).trim();
    // (a string's escapes decoded: url("a\1f b.png") is a%1Fb.png; #349 review)
    if (inner[0] === '"' || inner[0] === "'") inner = decodeEscapes(inner.slice(1, -1));
    if (inner !== '' && inner[0] !== '#' && !/^data:/i.test(inner)) {
      try {
        out = `url(${serializeString31(new PlatformURL(inner, base).href)})`;
      } catch {
        out = piece;
      }
    }
    if (resolvedURLs31.size >= 1000) resolvedURLs31.clear();
    resolvedURLs31.set(key, out);
  }
  return out;
}
// The math functions in text, each resolved to px where it can be, or
// to the one value it holds (calc(180deg)); the others as they are.
function resolveMath31(text, element, name, ctx) {
  let out = '';
  let from = 0;
  MATH31.lastIndex = 0;
  for (let m = MATH31.exec(text); m !== null; m = MATH31.exec(text)) {
    let depth = 0;
    let end = -1;
    for (let k = m.index + m[0].length - 1; k < text.length; k++) {
      if (text[k] === '(') depth++;
      else if (text[k] === ')' && --depth === 0) {
        end = k;
        break;
      }
    }
    if (end < 0) break;
    const fn = text.slice(m.index, end + 1);
    const inner = fn.slice(m[0].length, -1).trim();
    let resolved = null;
    // (calc(), min(), max() or clamp() of one value is that value:
    // calc(1dppx) is 1dppx; cos(0deg) is no 0deg; #349 review)
    if (ONE_ARGUMENT31.test(m[0]) && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px|deg|s|dppx)$/i.test(inner))
      resolved = inner;
    else {
      ctx ??= new LengthContext(element, false, name === 'line-height');
      const px = absoluteLength(fn, ctx);
      if (px !== null) resolved = `${sixDigits(px)}px`;
      else resolved = simplified31(fn);
    }
    if (resolved !== null) {
      out += text.slice(from, m.index) + resolved;
      from = end + 1;
    }
    MATH31.lastIndex = end + 1;
  }
  return out + text.slice(from);
}

// A math function of px, deg, s and percentages simplified as a declared
// one is (calc(10% + 10px + 2px) is calc(10% + 12px), round(10px, 3px)
// 9px; #349 review), or null when that leaves it as it is. Read as a
// length, an angle or a time (a property that takes each).
const MATH_HOSTS31 = ['width', 'rotate', 'transition-duration'];
const ONE_VALUE31 = /^calc\(([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px|deg|s|dppx))\)$/;
function simplified31(fn) {
  for (const host of MATH_HOSTS31) {
    const out = canonical31(host, fn, true);
    if (out !== null && out !== fn) return ONE_VALUE31.exec(out)?.[1] ?? out;
  }
  return null;
}

function computeValue(element, name, value, data) {
  const compat = element[S].doc[S].window[S].compat;
  if (compat.computed31) {
    // (only a value with a unit or a url() in it: most are keywords)
    if (needsAbsolute31(value)) value = absolutize31(element, name, value);
    const own = computed31(element, name, value, data);
    if (own !== null) return own;
  }
  // (most values have no function: the regex only where one is)
  if (compat.computed31 && value.indexOf('(') > 0 && GRADIENT.test(value))
    value = gradientColors31(element, value, data);
  if (data[2]) value = computeColors(element, name, value, data);
  // A 0 length: 0px from jsdom 28.1.0, as declared before (text-indent: 0).
  if (data[3] && value === '0' && compat.zeroLengths) return '0px';
  // jsdom 30 computes lengths to px (lengths.js), font sizes too; from
  // 30.1.0 bolder and lighter to weights.
  if (compat.absoluteLengths) {
    if (name === 'font-size') return absoluteFontSize(element, value);
    if (name === 'font-weight' && compat.relativeWeights) {
      const lower = value.toLowerCase();
      if (lower === 'bolder' || lower === 'lighter') {
        const parent = inheritParent(element);
        return String(
          relativeWeight(lower, parent === null ? 400 : Number(computedValue(parent, 'font-weight')) || 400),
        );
      }
    } else if (mayResolve(value)) {
      const px = absoluteLength(value, new LengthContext(element, false, name === 'line-height'));
      if (px !== null) value = `${sixDigits(px)}px`;
    }
  }
  // (jsdom 31: the logical border widths too, black box 31.0.1)
  if (!RAW_KEYWORDS.has(name) && !(compat.computed31 && LOGICAL_BORDER_WIDTH.test(name))) return value;
  // jsdom before 29.0.2 (black box, 20 to 29.0.1) keeps these keywords as
  // declared too (font-weight: bold, border-top-width: thin).
  if (compat.legacyComputedStyle) return value;
  const raw = compat.rawComputedValues;
  if (raw !== null) {
    // jsdom 29.0.2 to 30.0.x (black box) keep these keywords (border-top-width
    // thin, font-weight bold), and border widths whatever the border style,
    // but 30.0 computes medium to 16px (border-top-width and outline-width
    // too).
    return raw === '30.0' && value.toLowerCase() === 'medium' && name !== 'font-weight' ? '16px' : value;
  }
  if (name === 'font-size') return FONT_SIZES[value.toLowerCase()] ?? value;
  if (name === 'font-weight') return FONT_WEIGHTS[value.toLowerCase()] ?? value;
  if (BORDER_WIDTH.test(name) || LOGICAL_BORDER_WIDTH.test(name)) {
    const style = computedValue(element, name.replace('-width', '-style')).toLowerCase();
    if (style === 'none' || style === 'hidden') return '0px';
    return BORDER_WIDTHS[value.toLowerCase()] ?? value;
  }
  return value;
}

const INITIALS31 = { __proto__: null, 'column-width': 'auto', 'max-lines': 'auto', continue: 'normal' };

// Initial values are computed too, except that an initial 0 stays 0, as
// in jsdom (margin-top: 0, but margin: 0 auto gives margin-top: 0px).
function initialValue(element, name, data) {
  // Display values other than inline come from the user agent sheet.
  if (name === 'display') return 'inline';
  // jsdom 29.0.2 to 30.1.3 (black box); jsdom 31 currentcolor, and
  // stop-color black (black box, 31.0.1).
  if (name === 'outline-color' || name === 'stop-color') {
    // (outline-color's initial auto: auto with outline-style auto)
    if (element[S].doc[S].window[S].compat.computed31)
      return name === 'outline-color' ? outlineAuto31(element) : 'rgb(0, 0, 0)';
    if (name === 'outline-color') return 'rgba(0, 0, 0, 0)';
  }
  // (jsdom 31: column-width and max-lines auto, continue normal, black box 31.0.1)
  if (element[S].doc[S].window[S].compat.computed31) {
    const own = INITIALS31[name];
    if (own !== undefined) return own;
  }
  // (jsdom 31: monospace, black box 31.0.1)
  if (name === 'font-family')
    return element[S].doc[S].window[S].compat.computed31 ? 'monospace' : 'depends on user agent';
  if (data[0] === null) return '';
  // (jsdom 31: 0px)
  if (data[0] === '0') return data[3] && element[S].doc[S].window[S].compat.computed31 ? '0px' : '0';
  return computeValue(element, name, data[0], data);
}

function inheritedValue(element, name, data) {
  const parent = inheritParent(element);
  if (parent === null) return initialValue(element, name, data);
  const compat = element[S].doc[S].window[S].compat;
  if (data[2] === 1 && name !== 'color' && !compat.legacyComputedStyle) {
    // (jsdom 31: outline-color auto is inherited as auto, black box 31.0.1)
    if (compat.computed31 && name === 'outline-color' && computedValue(parent, name) === 'auto')
      return outlineAuto31(element);
    const source = colorSource(parent, name, data, compat.computed31);
    if (source !== null) return computedValue(source, name);
    // jsdom 31 keeps currentcolor so where it keeps it declared.
    return compat.computed31 && KEEPS_CURRENTCOLOR.has(name) ? 'currentcolor' : currentColor(element);
  }
  // jsdom 29.0.2 and later (black box, to 30.1.3): an inherited color
  // that no element up the chain declares (or one declares initial) is
  // CanvasText under the element's own color-scheme, not its parent's
  // value (color-scheme: dark under a light body gives white); one
  // declared, CanvasText included, is inherited as computed. Only an
  // element that declares its color-scheme can differ from its parent.
  // Not modeled: jsdom 29.0.2 to 30.1.2 give some of these colors by the
  // order of reads and insertions (a border color read before color makes
  // color the parent's; to 30.0.1 a currentcolor under a light element in
  // a dark one, its ancestors not read first, takes the dark one's).
  // jsdom 31 inherits the parent's color as computed (black box, 31.0.1).
  if (
    name === 'color' &&
    !element[S].doc[S].window[S].compat.legacyComputedStyle &&
    !element[S].doc[S].window[S].compat.computed31 &&
    declaresScheme(element) &&
    !colorDeclared(parent)
  )
    return initialValue(element, name, data);
  return computedValue(parent, name);
}

// jsdom 29.0.2 and later (black box: 29.1.1, 30.1.2, 30.1.3): a computed
// currentcolor is inherited as the keyword, so it resolves to the
// inheriting element's own color (color: red; border: inherit under a
// parent whose border colors are their initial currentcolor gives red, as
// does fill inherited from fill: currentColor). colorSource: the element
// whose computed value element has (through inherit, unset or no
// declaration of an inherited property), or null when that value is
// currentcolor (declared, or the initial value; outline-color's initial
// value is transparent here: initialValue). Not modeled: jsdom 29.1.1
// gives a border or border-color shorthand's currentcolor or CSS-wide
// keyword a fixed color in some cases, which its children inherit.
// jsdom 31 (black box, 31.0.1): caret-color's and outline-color's auto is
// currentcolor (colorValue31), their initial value and declared, inherited
// as the keyword.
const AUTO_CURRENTCOLOR = new Set(['caret-color', 'outline-color']);
const initialCurrentColor = (name, data, jsdom31) =>
  jsdom31
    ? data[0] === 'currentcolor' || AUTO_CURRENTCOLOR.has(name)
    : data[0] === 'currentcolor' && name !== 'outline-color';
function colorSource(element, name, data, jsdom31) {
  for (let e = element; ;) {
    let value = cascaded(e, name);
    // jsdom 31: the keyword var() gives (--a: auto; caret-color: var(--a)).
    if (jsdom31 && value !== undefined && (value.startsWith(PENDING31) || mayHaveVar(value)))
      value = substitutedValue(e, name, value, false) ?? 'unset';
    const keyword = value?.toLowerCase();
    if (keyword === 'currentcolor' || (jsdom31 && keyword === 'auto' && AUTO_CURRENTCOLOR.has(name))) return null;
    if (keyword === 'inherit' || ((keyword === undefined || keyword === 'unset') && data[1])) {
      const parent = inheritParent(e);
      if (parent === null) return initialCurrentColor(name, data, jsdom31) ? null : e;
      e = parent;
    } else if (
      (keyword === undefined || keyword === 'initial' || keyword === 'unset') &&
      initialCurrentColor(name, data, jsdom31)
    )
      return null;
    else return e;
  }
}

const CUSTOM = [null, 1, 0, 0];

// A shorthand or unknown property: box and pair shorthands from their
// longhands, others as declared.
function shorthandValue(element, name) {
  if (declaredComputed(element)) {
    // jsdom 27 to 29.0.1: border and its sides compute to ''.
    if ((name === 'border' || BORDER_SIDE.test(name)) && element[S].doc[S].window[S].compat.jsdom >= 27) return '';
    // jsdom 20 to 26: a shorthand declared with a CSS-wide keyword or var()
    // computes to that value (gap: inherit, padding: var(--x)), and one
    // jsdom does not expand (cascadeExpand) to its declared value alone.
    const own = cascaded(element, name);
    // jsdom 28.1.0 (cascadeInOrder, black box): margin and padding from
    // the block their declarations apply to, '' when its longhands differ
    // in importance (.d.d td { padding: 8px } td { padding-bottom: 7px
    // !important }); its shorthand is cascaded(element, name).
    const block = element[S].cascaded?.blocks?.get(name);
    if (block != null && block.size > 0) {
      const important = block.get(SHORTHANDS[name][0])?.important === true;
      if (SHORTHANDS[name].some((l) => (block.get(l)?.important === true) !== important)) return '';
    }
    // '' when a longhand declared over it wins (padding: var(--p), then
    // padding-top: 5px), which its pending longhands otherwise do.
    if (
      own !== undefined &&
      own.includes('var(') &&
      element[S].doc[S].window[S].compat.pendingLonghands &&
      !BORDER_FAMILY.has(name) &&
      EXPANDED_SHORTHANDS.has(name) &&
      !inlineDeclarations(element)?.has(name) &&
      SHORTHANDS[name].some((l) => cascaded(element, l) !== undefined)
    )
      return '';
    if (own !== undefined && (CSS_WIDE.has(own) || own.includes('var('))) return legacyUnset(element, own) ? '' : own;
    if (SHORTHANDS[name] !== undefined && !EXPANDED_SHORTHANDS.has(name)) return asDeclared(name, own);
    if (LEGACY_BORDER.has(name)) return legacyBorderValue(element, name);
  }
  const longhands = SHORTHANDS[name];
  if (longhands && BOX.has(name) && longhands.length === 4) {
    const values = longhands.map((l) => computedValue(element, l));
    if (declaredComputed(element)) {
      // jsdom before 29.0.2: '' when a side is; before 27 as declared
      // (2px 6px 3px 6px), all four sides when the longhands changed them
      // (the margin and padding accessors from cssstyle 4.4 in the
      // shortest form: legacyAccessorValue).
      if (values.includes('')) return '';
      if (element[S].doc[S].window[S].compat.jsdom < 27) {
        const own = cascaded(element, name);
        if (
          own !== undefined &&
          !CSS_WIDE.has(own) &&
          expand(name, own).every(([n, v], i) => i === 0 || computedValue(element, n) === v)
        )
          return own;
        return values.join(' ');
      }
    }
    return serializeBox(values);
  }
  if (longhands && PAIRS.has(name) && longhands.length === 2) {
    const [a, b] = longhands.map((l) => computedValue(element, l));
    return a === b ? a : `${a} ${b}`;
  }
  // The border shorthands, from their computed longhands (width, style,
  // color); border itself only when all four sides agree.
  if (name === 'border' || BORDER_SIDE.test(name)) {
    const sides = name === 'border' ? ['top', 'right', 'bottom', 'left'] : [name.slice(7)];
    const values = sides.map((side) =>
      ['width', 'style', 'color'].map((p) => computedValue(element, `border-${side}-${p}`)).join(' '),
    );
    return values.every((v) => v === values[0]) ? values[0] : '';
  }
  // Other shorthands as declared, as jsdom gives them (so jest-dom's
  // toHaveStyle({ background: 'red' }) compares like with like).
  const value = cascaded(element, name);
  // cssstyle before 4.4: flex not declared is its longhands declared,
  // joined (flex: auto declares flex-basis: auto alone; css.js
  // legacyFlexValue).
  if (value === undefined && name === 'flex' && element[S].doc[S].window[S].compat.legacyFont != null) {
    let out = '';
    for (const longhand of longhands) {
      const part = cascaded(element, longhand);
      if (part !== undefined && part !== '') out = out === '' ? part : `${out} ${part}`;
    }
    return out;
  }
  if (value === undefined || CSS_WIDE.has(value.toLowerCase())) return '';
  return asDeclared(name, value);
}

const BORDER_SIDE = /^border-(top|right|bottom|left)$/;

// jsdom 26 and earlier: the border shorthands compute to their declared
// values, colors as written (border: 1px solid pink stays so, while
// border-top-color is rgb(255, 192, 203)). border declares the sides and
// border-width, -style and -color too; a longhand declared later does not
// change them, and border-top-width alone leaves border-top empty.
const LEGACY_BORDER = new Set([
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-color',
]);
const BORDER_STYLES = new Set([
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
]);
const LEGACY_WIDTH = /^(thin|medium|thick|[+-]?(\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?[a-z%]*)$/i;
const ZERO_LENGTH = /^[+-]?(0+\.?0*|\.0+)$/;

function legacyBorderValue(element, name) {
  const part = name === 'border-width' ? 0 : name === 'border-style' ? 1 : name === 'border-color' ? 2 : -1;
  let value = name === 'border' ? undefined : cascaded(element, name);
  const own = value !== undefined;
  if (!own) value = cascaded(element, 'border');
  if (value === undefined || CSS_WIDE.has(value.toLowerCase())) return '';
  if (value.includes('var(')) return name === 'border' ? value : '';
  if (own && part >= 0) return value;
  const parts = borderParts(value);
  // jsdom 27 and 28: border-width and border-style from border are its
  // width and style, or their initial values (border: solid gives
  // border-width medium, border: 0 border-style none; black box, 27.4.0
  // and 28.1.0, #179).
  if (part === 0 || part === 1) {
    if (parts[part] === '' && element[S].doc[S].window[S].compat.jsdom >= 27) return part === 0 ? 'medium' : 'none';
    return parts[part];
  }
  return part >= 0 ? parts[part] : parts.filter((p) => p !== '').join(' ');
}

// A declared border value's width, style and color ('' when not given).
function borderParts(value) {
  const parts = ['', '', ''];
  const tokens = segments(value);
  for (let i = 0; i < tokens.length; i += 2) {
    const token = tokens[i];
    if (token === '') continue;
    if (BORDER_STYLES.has(token.toLowerCase())) parts[1] = token;
    else if (LEGACY_WIDTH.test(token)) parts[0] = ZERO_LENGTH.test(token) ? '0px' : token;
    else parts[2] = token;
  }
  return parts;
}

// jsdom 20 to 26 (black box): the computed style's background and border
// side accessors (style.background, not getPropertyValue('background'))
// read the longhands when the shorthand (or border) is not declared:
// background the computed background-color (jsdom 20: the declared one),
// then the declared image, repeat, attachment and position (rgba(0, 0, 0,
// 0) url(a.png)); a border side its declared width and style and the
// computed color (jsdom 20: the declared one). From cssstyle 4.4 they
// always do, the declared shorthand's parts included: background in the
// order image, position, repeat, attachment, then the computed color
// (background: red gives rgb(255, 0, 0), which jest-dom's
// toHaveStyle({ background: 'rgb(255, 0, 0)' }) compares), a border side
// width, style, computed color (1px solid rgb(255, 0, 0); canvastext
// alone when nothing is declared). null: the accessor reads as
// getPropertyValue (a declared CSS-wide keyword or var() too). jsdom 27
// to 30.1.2 compose the background accessor so too (background: red gives
// rgb(255, 0, 0)), from 29.0.2 inherit, initial and unset give the
// computed color alone; not the border side ones.
const BACKGROUND_PARTS = ['background-image', 'background-position', 'background-repeat', 'background-attachment'];
// A declared background's parts as written and its expansion, by value.
const backgroundCache = new Map();
function backgroundParts(value) {
  let parsed = backgroundCache.get(value);
  if (parsed === undefined) {
    const given = backgroundComponents(value);
    // background: none alone declares no image there.
    if (given !== null && value === 'none') given['background-image'] = null;
    parsed = given === null ? null : { given, expanded: new Map(expand('background', value)) };
    if (backgroundCache.size >= 500) backgroundCache.clear();
    backgroundCache.set(value, parsed);
  }
  return parsed;
}
const LEGACY_BACKGROUND_ORDER = [
  'background-image',
  'background-repeat',
  'background-attachment',
  'background-position',
];
export function legacyAccessorValue(element, name) {
  const compat = element[S].doc[S].window[S].compat;
  if (name === 'margin' || name === 'padding') {
    // As getPropertyValue for a declared CSS-wide keyword or var()
    // (padding: var(--p)); '' when a side is (padding-left: 2px alone).
    if (compat.jsdom >= 27 || compat.colorKeywords === 'css2') return null;
    const own = cascaded(element, name);
    if (own !== undefined && (CSS_WIDE.has(own) || own.includes('var('))) return null;
    const values = SHORTHANDS[name].map((l) => computedValue(element, l));
    return values.includes('') ? '' : serializeBox(values);
  }
  if (compat.jsdom > 26 && (name !== 'background' || compat.shorthandInitials)) return null;
  const composed = compat.composedAccessors || compat.jsdom > 26;
  const own = cascaded(element, name);
  if (own !== undefined && !compat.legacyComputedStyle && RESOLVED_KEYWORDS.has(own))
    return computedValue(element, 'background-color');
  if (own !== undefined && (!composed || CSS_WIDE.has(own) || own.includes('var('))) return null;
  if (name !== 'background') {
    // border: var(--b) declares the sides' longhands pending (cascadeExpand):
    // composed from them (the computed color alone).
    let value = own ?? cascaded(element, 'border');
    if (own === undefined && value !== undefined && composed && compat.pendingLonghands && value.includes('var('))
      value = undefined;
    if (value !== undefined && (!composed || CSS_WIDE.has(value) || value.includes('var('))) return null;
    const [width, style] =
      value !== undefined
        ? borderParts(value)
        : [cascaded(element, `${name}-width`), cascaded(element, `${name}-style`)];
    const color = compat.jsdom >= 21 ? computedValue(element, `${name}-color`) : cascaded(element, `${name}-color`);
    return [width, style, color].filter(Boolean).join(' ');
  }
  // A longhand's declared value: from background when that declares it
  // (the longhand's cascaded value is the one background expands to), as
  // written there, else as declared alone.
  let given = null,
    expanded = null;
  if (own !== undefined) {
    const parsed = backgroundParts(own);
    if (parsed === null) return null;
    ({ given, expanded } = parsed);
  }
  const declared = (longhand) => {
    if (longhand === 'background-position') {
      const alone = cascaded(element, longhand);
      return expanded !== null &&
        (alone === undefined || cascaded(element, 'background-position-x') === expanded.get('background-position-x'))
        ? given[longhand]
        : alone;
    }
    const value = cascaded(element, longhand);
    return expanded !== null && value === expanded.get(longhand) ? given[longhand] : value;
  };
  const color = compat.jsdom >= 21 ? computedValue(element, 'background-color') : cascaded(element, 'background-color');
  const parts = composed
    ? [...BACKGROUND_PARTS.map(declared), color]
    : [color, ...LEGACY_BACKGROUND_ORDER.map(declared)];
  return parts.filter((part) => part != null && part !== '').join(' ');
}

// jsdom before 29.0.2 (the jsdom bundled with jest-environment-jsdom up
// to Jest 30): a property neither the page nor the user agent sheet
// declares computes to '', except display (inline from jsdom 27),
// the inherited properties of compat.legacyInherited (visibility; from
// 21.1.0 pointer-events; from 22.1.0 color, and caret-color, which is
// auto at the root under any color-scheme; black box 20.0.3 to 28.1.0),
// background-color and the border colors.
// (Null-prototype tables, as css-data.js: looked up by a page's name.)
const LEGACY_INHERITED = {
  __proto__: null,
  visibility: 'visible',
  'pointer-events': 'auto',
  'caret-color': 'auto',
  color: null,
};
const BORDER_COLOR = /^border-(top|right|bottom|left)-color$/;
// The logical ones too (black box, 22.1.0 to 28.1.0).
const LOGICAL_BORDER_COLOR = /^border-(block|inline)-(start|end)-color$/;

// compat: the window's (the caller has it), so that the walk up an
// inheritance chain reads no more than before.
function legacyDefault(element, name, compat) {
  if (name === 'display') return compat.jsdom >= 27 ? 'inline' : '';
  if (name in LEGACY_INHERITED) {
    const only = compat.legacyInherited;
    if (only !== null && !only.has(name)) return '';
    const parent = inheritParent(element);
    if (parent) return computedValue(parent, name);
    if (name !== 'color') return LEGACY_INHERITED[name];
    // From jsdom 27 CanvasText under the element's color-scheme (white
    // under dark; black box, 27.0.0 to 29.0.1). A root's color-scheme is
    // its own cascaded value's, so it is kept with them (the caller
    // cascaded the element).
    if (compat.jsdom < 27) return compat.rootColor;
    const cache = element[S].cascaded;
    let dark = cache.rootDark;
    if (dark === undefined) dark = cache.rootDark = darkScheme(element);
    return dark ? DARK_SYSTEM_COLORS.canvastext : compat.rootColor;
  }
  // jsdom before 22.1.0: '' (compat.computedColors).
  if (name === 'background-color') return compat.computedColors === 'declared' ? '' : 'rgba(0, 0, 0, 0)';
  if (BORDER_COLOR.test(name) || LOGICAL_BORDER_COLOR.test(name))
    return compat.computedColors === 'declared' ? '' : computedValue(element, 'color');
  return '';
}

// jsdom before 29.0.2 (black box: 20, 21, 22, 25, and 26 with cssstyle
// 4.3.1 and 4.6, 27.0 to 29.0.1 measured) compute the CSS-wide keywords to
// themselves, as declared, by longhands and shorthands alike (padding:
// inherit gives padding and padding-top inherit; color: inherit gives
// inherit), except unset, which from jsdom 21 to 28.0 computes as if
// nothing were declared, but to '' for display (jsdom 20 keeps it too, and
// jsdom 28.1 to 29.0.1). From jsdom 27, display: initial and unset compute
// to inline.
// Except, from jsdom 27 (black box, 27.4.0 and 28.1.0), for the
// properties it computes: color, background-color, the border colors
// (logical ones too), caret-color, display, pointer-events and visibility
// compute inherit, initial and unset as CSS defines them (color: initial
// is CanvasText under the element's color-scheme, border-top-color:
// inherit the parent's computed border-top-color, the parent's color where
// it declares none, display: inherit the parent's display), and
// outline-color computes inherit only (legacyOutlineInherit).
const declaredComputed = (element) => element[S].doc[S].window[S].compat.legacyComputedStyle;
const KEYWORD_RESOLVED = new Set([
  'color',
  'background-color',
  'caret-color',
  'display',
  'pointer-events',
  'visibility',
  ...['top', 'right', 'bottom', 'left', 'block-start', 'block-end', 'inline-start', 'inline-end'].map(
    (side) => `border-${side}-color`,
  ),
]);
const keywordResolved = (compat, name, value) =>
  compat.jsdom >= 27 && KEYWORD_RESOLVED.has(name) && RESOLVED_KEYWORDS.has(value.toLowerCase());
const legacyUnset = (element, value) => value === 'unset' && element[S].doc[S].window[S].compat.unsetUndeclared;

// outline-color, from jsdom 27 (black box, 27.4.0 and 28.1.0): inherit
// computes to the parent's computed value, or stays inherit where that is
// '' (a parent without outline-color) or there is no parent; initial and
// unset stay as declared (unset to '', as undeclared).
function legacyOutlineInherit(element, value) {
  const parent = inheritParent(element);
  return (parent !== null && computedValue(parent, 'outline-color')) || value;
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
  const ds = element[S].doc[S];
  const compat = ds.window[S].compat;
  // jsdom 31: a logical property is its physical one's value (inherit
  // takes the parent's physical one, black box 31.0.1).
  if (compat.computed31 && isLogical(name)) return computedValue(element, partnerOf(name, flow31(element)));
  // jsdom 30: em lengths read the font sizes of the element and its
  // ancestors; each element's is kept with its cascaded values (dropped
  // with them on any tree, attribute or style sheet change).
  if (name === 'font-size' && compat.absoluteLengths) {
    const value = cascaded(element, name);
    const cache = element[S].cascaded;
    if (cache.fontSize !== undefined) return cache.fontSize;
    return (cache.fontSize = longhandValue(element, name, data, false, compat, value));
  }
  const value = cascaded(element, name);
  // jsdom 31: a registered custom property (#269 part F2), kept with the
  // cascaded values.
  if (custom && compat.computed31 && (registrations31.made || registrations31.registered || ds.styles31 === true)) {
    const registered = registered31(element, name, value);
    if (registered !== undefined) return registered;
  }
  // jsdom 31: a custom property with var() is substituted once, kept with
  // the cascaded values (a chain using each one twice is not exponential).
  if (custom && compat.computed31 && value !== undefined && mayHaveVar(value)) {
    const cache = element[S].cascaded;
    const known = cache.customs?.get(name);
    if (known !== undefined) return known;
    const result = longhandValue(element, name, data, custom, compat, value);
    (cache.customs ??= new Map()).set(name, result);
    return result;
  }
  if (name === 'display' && compat.computed31)
    return blockified31(element, longhandValue(element, name, data, custom, compat, value));
  // (a pseudo-element's content: normal is none for ::before and ::after,
  // and for a ::marker but a list item's, black box 31.0.1)
  if (name === 'content' && compat.computed31) {
    const content = attrContent31(element, longhandValue(element, name, data, custom, compat, value));
    return element[S].pseudo === undefined ? content : pseudoContent31(element, content);
  }
  return longhandValue(element, name, data, custom, compat, value);
}

// jsdom 31 (black box, 31.0.1) blockifies display (CSS Display 3, 2.7): of
// the root element, of an absolutely positioned or floated one, and of a
// flex or grid container's children (through display: contents); inline
// and inline-block are block, inline-flex flex, a table part block, ruby
// block ruby.
const BLOCKIFIED = new Map([
  ['inline', 'block'],
  ['inline-block', 'block'],
  ['run-in', 'block'],
  ['inline-table', 'table'],
  ['inline-flex', 'flex'],
  ['inline-grid', 'grid'],
  ['ruby', 'block ruby'],
  ['inline-list-item', 'list-item'],
  ['-webkit-inline-box', 'block'],
  ['flow', 'block'],
  ['math', 'block'],
  ['inline math', 'block'],
]);
const FLEX_OR_GRID = /^(?:inline-)?(?:flex|grid)$/;
function blockified31(element, value) {
  const root = element[S].parent?.[S].type === DOCUMENT_NODE;
  // (the root's contents is block too)
  let block = root && value === 'contents' ? 'block' : BLOCKIFIED.get(value);
  if (block === undefined) {
    if (value.startsWith('table-') || value.startsWith('ruby-')) block = 'block';
    else if (value.startsWith('inline ') && value.endsWith(' list-item')) block = 'list-item';
    else return value;
  }
  if (root || blockifies31(element)) return block;
  // A flex or grid item: its parent box's, past display: contents. (A
  // parent whose cascaded display names none of these, nor inherits or
  // substitutes one, is not a container.)
  for (let parent = boxParent31(element); parent !== null; parent = boxParent31(parent)) {
    const declared = cascaded(parent, 'display');
    if (declared === undefined || !MAY_CONTAIN.test(declared)) return value;
    const display = displayOf31(parent);
    if (display !== 'contents') return FLEX_OR_GRID.test(display) ? block : value;
  }
  return value;
}
const MAY_CONTAIN = /flex|grid|contents|inherit|unset|revert|var\(|\\/i;
// The element whose box holds an element's: the slot it is assigned to, its
// parent, or the host of the shadow root it is a child of (black box, 31.0.1:
// a shadow root's span in a flex host is block, a host's child in a block
// slot inline).
function boxParent31(element) {
  const p = element[S].parent;
  if (element[S].pseudo !== undefined) return p;
  if (p === null) return null;
  if (p[S].type === ELEMENT_NODE) return (p[S].shadowRoot && findSlot(element)) || p;
  return p[S].shadow === true ? p[S].host : null;
}
// Position and float are not inherited: undeclared, they are static and none.
const blockifies31 = (element) => {
  if (cascaded(element, 'position') !== undefined) {
    const position = computedValue(element, 'position');
    if (position === 'absolute' || position === 'fixed') return true;
  }
  return cascaded(element, 'float') !== undefined && computedValue(element, 'float') !== 'none';
};
// An element's display before blockification.
const displayOf31 = (element) =>
  longhandValue(
    element,
    'display',
    LONGHANDS.display,
    false,
    element[S].doc[S].window[S].compat,
    cascaded(element, 'display'),
  );

// The hidden attribute hides an element; from jsdom 27 not an embed
// (embed[hidden] is inline in the user agent sheet).
const hiddenHides = (element, compat) =>
  element[S].ns === HTML_NS && element[S].attrs.has('hidden') && (compat.jsdom < 27 || element[S].tag !== 'embed');

function longhandValue(element, name, data, custom, compat, value) {
  if (compat.legacyComputedStyle) {
    // jsdom before 29.0.2: custom properties are not inherited either;
    // from jsdom 27 the direction of elements with dir, bdi and
    // input[type=tel] is their directionality.
    if (value === undefined) {
      if (name === 'direction' && compat.jsdom >= 27 && uaDirection(element)) return directionality(element);
      return custom ? '' : legacyDefault(element, name, compat);
    }
    if (name === 'display' && compat.jsdom >= 27 && (value === 'initial' || value === 'unset')) return 'inline';
    // From jsdom 27 the properties it computes resolve inherit, initial
    // and unset (keywordResolved), outline-color inherit.
    if (legacyUnset(element, value) && !keywordResolved(compat, name, value))
      return custom || name === 'display' ? '' : legacyDefault(element, name, compat);
    if (!custom && CSS_WIDE.has(value) && !keywordResolved(compat, name, value)) {
      return name === 'outline-color' && compat.jsdom >= 27 && value === 'inherit'
        ? legacyOutlineInherit(element, value)
        : value;
    }
  }
  if (value === undefined && name === 'direction' && uaDirection(element)) return directionality(element);
  if (compat.computed31) {
    if (value !== undefined && (value.startsWith(PENDING31) || mayHaveVar(value))) {
      // A custom property in a cycle, or one whose var() has no value, has
      // none; another property is unset (CSS Custom Properties 1, 3.1).
      value = substitutedValue(element, name, value, custom);
      if (value === null) {
        if (custom) return '';
        value = 'unset';
      }
    }
    // (more than 65536 tokens: invalid, as jsdom 31 computes)
    if (custom && value !== undefined && tooManyTokens(value)) return '';
    if (name === 'line-height') {
      const n = lineHeightNumber(element, value);
      if (n !== null) return `${sixDigits(n * fontPx(computedValue(element, 'font-size')))}px`;
    }
  }
  // As in jsdom (20 to 30, black box): a value with var() is not
  // substituted, it computes to itself (and inherits so).
  else if (value !== undefined && !custom && value.includes('var(')) return value;
  const keyword = value === undefined ? (data[1] ? 'inherit' : 'initial') : value.toLowerCase();
  switch (keyword) {
    case 'inherit':
      return inheritedValue(element, name, data);
    // jsdom 27 and later (black box, 27.0 to 30.1.3): revert and
    // revert-layer compute to themselves, as declared.
    case 'revert':
    case 'revert-layer':
      if (
        BORDER_WIDTH.test(name) &&
        element[S].doc[S].window[S].compat.rawComputedValues === null &&
        NO_BORDER.has(computedValue(element, name.replace('-width', '-style')).toLowerCase())
      )
        return '0px';
      return custom ? value : keyword;
    case 'unset':
      if (data[1]) return inheritedValue(element, name, data);
    // falls through: unset is initial for a property that is not inherited
    case 'initial':
      if (custom) return '';
      // display: initial (or unset) is inline, not the element's default.
      return value !== undefined && name === 'display' ? 'inline' : initialValue(element, name, data);
    default:
      return custom ? value : computeValue(element, name, value, data);
  }
}

// --- registered custom properties (jsdom 31) -----------------------------------------

// jsdom 31 (black box, 31.0.1; #269 part F2): a custom property registered
// by CSS.registerProperty, or else by an @property rule of a style sheet
// that applies: the document's, then its shadow trees' (a shadow root's
// adopted sheets out of the document too; its <style> elements have no
// sheets there). A later rule for a name wins; a rule in a condition that
// does not hold, or in a style rule, registers nothing. A registration is
// { syntax (a property31.js syntax), inherits, initial (its text, or
// null) }. Not modeled: jsdom 31 orders shadow trees by when they last
// got a sheet after having none; warpdom by when they were attached.
// (no rule registers until an @property rule is made, or the document has
// a <style> whose sheet may not be made yet: styles31, internal.js; #345
// review)
function registration31(element, name) {
  const ds = element[S].doc[S];
  const registered = ds.window[S].registered31;
  if (registered === undefined || registered === null) return undefined;
  const own = registered.size === 0 ? undefined : registered.get(name);
  if (own !== undefined || (!registrations31.made && ds.styles31 !== true)) return own;
  return ruleRegistrations31(element[S].doc).get(name);
}
const NO_REGISTRATIONS = new Map();
// The @property rules' registrations by name, kept until the document's
// tree, style text or CSSOM changes.
function ruleRegistrations31(doc) {
  const ds = doc[S];
  const cached = ds.propertyRules31;
  if (
    cached !== undefined &&
    cached.treeRev === (ds.treeRev ?? 0) &&
    cached.styleRev === (ds.styleRev ?? 0) &&
    cached.cssomRev === cssomChanges.rev
  )
    return cached.map;
  const found = { map: NO_REGISTRATIONS, doc };
  propertySheets31(documentStyleSheets(doc)[S].items(), found);
  if (ds.adopted !== undefined) propertySheets31(ds.adopted.items, found);
  const roots = ds.shadowRoots31;
  if (roots !== undefined) {
    // (roots that are gone are dropped from the list)
    let live = 0;
    for (const ref of roots) {
      const root = ref.deref();
      if (root === undefined) continue;
      roots[live++] = ref;
      if (root[S].doc !== doc) continue;
      // (a root resetWindow discarded counts only while connected)
      if (connected(root[S].host)) propertySheets31(shadowStyleSheets(root)[S].items(), found);
      else if (ds.shadowRootsReset31?.has(root)) continue;
      if (root[S].adopted !== undefined) propertySheets31(root[S].adopted.items, found);
    }
    roots.length = live;
  }
  // (the trees' sheets are made now)
  ds.styles31 = false;
  ds.propertyRules31 = {
    treeRev: ds.treeRev ?? 0,
    styleRev: ds.styleRev ?? 0,
    cssomRev: cssomChanges.rev,
    map: found.map,
  };
  return found.map;
}
// The @property rules of sheets that apply, into found.map; a sheet with
// none is known as such until the CSSOM changes.
function propertySheets31(sheets, found) {
  for (const sheet of sheets) {
    const ss = sheet[S];
    if (ss.disabled || ss.properties31 === cssomChanges.rev) continue;
    if (!hasPropertyRule31(ss.rules, ss)) {
      ss.properties31 = cssomChanges.rev;
      continue;
    }
    if (ss.media === undefined || ss.media === null || mediaMatches(ss.media, found.doc, noScheme))
      propertyRules31(ss.rules, ss, found);
  }
}
const noScheme = () => {};
// (the rules buildIndex walks: @media, @supports, @layer and @scope)
function hasPropertyRule31(rules, ss) {
  for (const rule of rules) {
    const proto = Object.getPrototypeOf(rule);
    if (proto === ss.protos.CSSPropertyRule) return true;
    if (
      (proto === ss.protos.CSSMediaRule ||
        proto === ss.protos.CSSSupportsRule ||
        proto === ss.protos.CSSLayerBlockRule ||
        proto === ss.protos.CSSScopeRule) &&
      hasPropertyRule31(ruleArray(rule), ss)
    )
      return true;
  }
  return false;
}
function propertyRules31(rules, ss, found) {
  for (const rule of rules) {
    const proto = Object.getPrototypeOf(rule);
    if (proto === ss.protos.CSSPropertyRule) {
      if (found.map === NO_REGISTRATIONS) found.map = new Map();
      const data = rule[S].data;
      // (its initial value's urls from the base URL then; #345 review)
      data.base ??= documentBaseURL(found.doc);
      for (const name of data.names) found.map.set(name, data);
    } else if (
      (proto === ss.protos.CSSMediaRule && mediaMatches(rule[S].media, found.doc, noScheme)) ||
      (proto === ss.protos.CSSSupportsRule && supportsMatches(rule)) ||
      proto === ss.protos.CSSLayerBlockRule ||
      proto === ss.protos.CSSScopeRule
    )
      propertyRules31(ruleArray(rule), ss, found);
  }
}
// The names registered for an element's document, into names.
function addRegisteredNames31(element, names) {
  const ds = element[S].doc[S];
  const registered = ds.window[S].registered31;
  if (registered === undefined || registered === null) return;
  for (const name of registered.keys()) names.add(name);
  if (!registrations31.made && ds.styles31 !== true) return;
  for (const name of ruleRegistrations31(element[S].doc).keys()) names.add(name);
}

// A registered property's computed value, kept with the cascaded values;
// undefined when it is not registered.
function registered31(element, name, value) {
  const registration = registration31(element, name);
  if (registration === undefined) return undefined;
  const cache = element[S].cascaded;
  const known = cache.customs?.get(name);
  if (known !== undefined) return known;
  const result = registeredValue31(element, name, registration, value);
  (cache.customs ??= new Map()).set(name, result);
  return result;
}
const WIDE_KEYWORD = /^\s*(inherit|initial|unset|revert|revert-layer)\s*$/i;
// A registered property's computed value: its value, var() substituted,
// computed by its syntax; invalid at computed-value time it is unset
// (inherited, or its initial value); with none it inherits or is its
// initial value.
function registeredValue31(element, name, registration, value) {
  let text = value;
  if (text !== undefined && mayHaveVar(text)) text = substitutedValue(element, name, text, true);
  if (text === null || (text !== undefined && tooManyTokens(text))) text = 'unset';
  let keyword;
  if (text === undefined) keyword = registration.inherits ? 'inherit' : 'initial';
  else keyword = WIDE_KEYWORD.exec(text)?.[1];
  if (keyword === undefined) {
    const computed = registration.syntax === UNIVERSAL ? text : typedValue31(element, name, registration, text);
    if (computed !== null) return computed;
  }
  const lower = keyword?.toLowerCase();
  if (lower === 'initial' || (lower !== 'inherit' && !registration.inherits))
    return initialValue31(element, name, registration);
  const parent = inheritParent(element);
  return parent === null ? initialValue31(element, name, registration) : computedValue(parent, name);
}
// A value computed by a syntax, or null. The property is on the stack of
// those being substituted meanwhile: a property it reads (font-size for
// em, color for currentcolor) that reads it back through var() is in a
// cycle with it, and both are then invalid (#345 review).
function typedValue31(element, name, registration, text) {
  substituting.push(element, name);
  let computed;
  try {
    computed = matchRegistered31(element, registration.syntax, text, null);
  } finally {
    substituting.length -= 2;
  }
  const mark = indexOn(cyclic, element, name);
  if (mark === -1) return computed;
  cyclic.splice(mark, 2);
  return null;
}
// (a typed initial value is on the stack too: currentcolor with color:
// var(--a) makes color invalid, and the initial value is then the color
// it has; #345 review)
function initialValue31(element, name, registration) {
  const initial = registration.initial;
  if (initial === null) return '';
  // (an empty value is a space, as a custom property's)
  if (registration.syntax === UNIVERSAL) return initial === '' ? ' ' : initial;
  substituting.push(element, name);
  let computed;
  try {
    computed = matchRegistered31(element, registration.syntax, initial, registration.base);
  } finally {
    substituting.length -= 2;
  }
  const mark = indexOn(cyclic, element, name);
  if (mark !== -1) cyclic.splice(mark, 2);
  return computed ?? '';
}
// (property31.js matchValue31's context: the element being computed, and
// the base URL of an initial value, else null)
let matching31 = null;
let matchingBase31 = null;
function matchRegistered31(element, syntax, text, base) {
  const outer = matching31,
    outerBase = matchingBase31;
  matching31 = element;
  matchingBase31 = base;
  try {
    return matchValue31(syntax, text, MATCH31);
  } finally {
    matching31 = outer;
    matchingBase31 = outerBase;
  }
}
const ABSOLUTE_UNITS = new Set(['px', 'cm', 'mm', 'q', 'in', 'pt', 'pc']);
const RELATIVE_LENGTH = /(?<![\w-])([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)([a-z]+)/gi;
// A value as the property declares it (colors as jsdom 31 writes them),
// or null when it is invalid there.
function declared31(element, property, text) {
  const window = element[S].doc[S].window;
  const value = parseDeclarations(`${property}: ${text}`, validationModeOf(window), styleSurfaceOf(window)).get(
    property,
  )?.value;
  return value === undefined || value === '' ? null : value;
}
const MATCH31 = {
  length: (text) => {
    const px = absoluteLength(text, new LengthContext(matching31, false, false));
    return px === null || !Number.isFinite(px) ? null : px;
  },
  color: (text) => {
    const element = matching31;
    const value = declared31(element, 'color', text);
    // (as a color other than color's: currentcolor in it is the element's
    // color, light-dark(currentcolor, red); #345 review)
    return value === null ? null : computeValue(element, 'background-color', value, LONGHANDS['background-color']);
  },
  currentColor: () => computedValue(matching31, 'color'),
  image: (text) => {
    const element = matching31;
    const value = declared31(element, 'background-image', text);
    return value === null ? null : computeValue(element, 'background-image', value, LONGHANDS['background-image']);
  },
  // (absolute, from the document's base URL; a fragment alone or nothing
  // stays: url("#icon"), #345 review)
  url: (url) => {
    if (url === '' || url[0] === '#') return url;
    try {
      return new URL(url, matchingBase31 ?? documentBaseURL(matching31[S].doc)).href;
    } catch {
      return url;
    }
  },
  // (a calculation's relative lengths as px: calc(10% + 1em) is calc(10% + 20px))
  resolve: (text) => {
    const element = matching31;
    let failed = false;
    const out = text.replace(RELATIVE_LENGTH, (whole, n, unit) => {
      const lower = unit.toLowerCase();
      if (!isLengthUnit(lower) || ABSOLUTE_UNITS.has(lower)) return whole;
      const px = absoluteLength(`${n}${lower}`, new LengthContext(element, false, false));
      if (px === null) failed = true;
      return `${sixDigits(px ?? 0)}px`;
    });
    return failed ? null : out;
  },
};

// --- var() substitution (jsdom 31) ---------------------------------------------------

const HAS_VAR = /var\(/i;
// Whether a value may hold a var() reference: var( as written, or an
// escape (\76 ar( is one); substituteVars tells.
const mayHaveVar = (value) => HAS_VAR.test(value) || value.includes('\\');
// The custom properties being substituted, as element, name pairs: one met
// again is in a cycle, and every property from it on the stack is then
// invalid (marked), whatever its fallbacks.
const substituting = [];
const cyclic = [];
function indexOn(list, element, name) {
  for (let i = 0; i < list.length; i += 2) if (list[i] === element && list[i + 1] === name) return i;
  return -1;
}
// (substituteVars' lookup: context is the element)
function customLookup(element, name) {
  const at = indexOn(substituting, element, name);
  if (at === -1) return computedValue(element, name);
  for (let i = at; i < substituting.length; i += 2)
    if (indexOn(cyclic, substituting[i], substituting[i + 1]) === -1) cyclic.push(substituting[i], substituting[i + 1]);
  return null;
}

// A value with var() as it computes, or null when invalid at computed-value
// time: substituted, then (but for a custom property) parsed as the
// property's declared value; a pending longhand from its shorthand's value.
function substitutedValue(element, name, value, custom) {
  if (custom) {
    substituting.push(element, name);
    let text;
    try {
      text = substituteVars(value, customLookup, element);
    } finally {
      substituting.length -= 2;
    }
    const mark = indexOn(cyclic, element, name);
    if (mark !== -1) {
      cyclic.splice(mark, 2);
      return null;
    }
    if (text === null) return null;
    // (substituted to nothing, it is a space: set, so var() takes no
    // fallback for it)
    const trimmed = trimEnds(text);
    return trimmed === '' ? ' ' : trimmed;
  }
  let property = name,
    longhand = name;
  if (value.startsWith(PENDING31)) {
    let from = PENDING31.length;
    // (a logical group's partner, cascade31: \0 and the longhand first)
    if (value.charCodeAt(from) === 0) {
      const at = value.indexOf('\0', from + 1);
      longhand = value.slice(from + 1, at);
      from = at + 1;
    }
    const at = value.indexOf('\0', from);
    property = value.slice(from, at);
    value = value.slice(at + 1);
  }
  // (on the stack too: a registered property it reads that reads it back,
  // font-size: var(--a) with --a: 2em, is in a cycle with it, and it stays
  // invalid with the element's values; typedValue31, #345 review)
  const cache = element[S].cascaded;
  if (cache?.cycles31?.has(name)) return null;
  substituting.push(element, name);
  let text;
  try {
    text = substituteVars(value, customLookup, element);
  } finally {
    substituting.length -= 2;
  }
  const mark = indexOn(cyclic, element, name);
  if (mark !== -1) {
    cyclic.splice(mark, 2);
    if (cache !== undefined) (cache.cycles31 ??= new Set()).add(name);
    return null;
  }
  // (found in the cycle by a read of it within this one: font-size read
  // first; #345 review)
  if (text === null || cache?.cycles31?.has(name)) return null;
  const window = element[S].doc[S].window;
  const decls = parseDeclarations(`${property}: ${text}`, validationModeOf(window), styleSurfaceOf(window));
  const declared = decls.get(longhand)?.value;
  return declared === undefined || declared === '' ? null : declared;
}

// jsdom 31: line-height as a number (2, calc(2 * 1)) computes to px from
// the element's own font size, inherited as the number: the number, or
// null. An inherited one is kept with the parent's cascaded values.
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function lineHeightNumber(element, value) {
  const lower = value?.toLowerCase();
  if (value !== undefined && lower !== 'inherit' && lower !== 'unset') {
    if (NUMBER.test(value)) return Number(value);
    return /^calc\(/i.test(value) ? absoluteNumber(value) : null;
  }
  const parent = inheritParent(element);
  if (parent === null) return null;
  let own = cascaded(parent, 'line-height');
  const cache = parent[S].cascaded;
  if (cache.lineHeight !== undefined) return cache.lineHeight;
  if (own !== undefined && (own.startsWith(PENDING31) || mayHaveVar(own)))
    own = substitutedValue(parent, 'line-height', own, false) ?? 'unset';
  return (cache.lineHeight = lineHeightNumber(parent, own));
}

// --- computed shorthands as jsdom 29.0.2 and later read them -------------------------

// The value jsdom 29.0.2 and later (black box, to 30.1.3) give a
// shorthand it does not expand (cascadeExpand) for a CSS-wide keyword
// (inherit, initial, unset; revert is declared), from 30.1.3 when it is
// not declared too: these, else 'see individual properties' (before 30.1.3)
// or ''. The border ones (border-top-radius, border-image) from 29.1.1 (see
// blankBorderShorthands).
const SHORTHAND_INITIALS = {
  __proto__: null,
  '-webkit-line-clamp': 'none',
  'box-shadow': 'none',
  caret: 'auto',
  container: 'see individual properties',
  'corner-shape': 'round',
  flex: '0 1 auto',
  'font-synthesis': 'weight style small-caps position',
  'font-variant': 'normal',
  grid: 'none',
  'grid-template': 'none',
  'grid-area': 'auto',
  'grid-column': 'auto',
  'grid-row': 'auto',
  inset: 'auto',
  'inset-block': 'auto',
  'inset-inline': 'auto',
  'line-clamp': 'none',
  overflow: 'visible',
  'overflow-clip-margin': '0px',
  'overflow-clip-margin-block': '0px',
  'overflow-clip-margin-inline': '0px',
  'overscroll-behavior': 'auto auto',
  'place-content': 'normal',
  'place-self': 'auto',
  'scroll-margin': '0',
  'scroll-margin-block': '0',
  'scroll-margin-inline': '0',
  'scroll-padding': 'auto',
  'scroll-padding-block': 'auto',
  'scroll-padding-inline': 'auto',
  'text-align': 'start',
  'text-wrap': 'wrap',
  'vertical-align': 'baseline',
  'white-space': 'normal',
  'border-image': 'none',
  'max-size': 'none',
  'min-size': 'auto',
  size: 'auto',
  // '' from 30.1.3.
  marker: 'not defined for shorthand properties',
  'mask-border': 'See individual properties',
  'text-decoration-skip': 'See individual properties',
  // Before 30.0.1.
  'animation-delay': '0s',
};
for (const side of ['top', 'right', 'bottom', 'left', 'block-start', 'block-end', 'inline-start', 'inline-end'])
  SHORTHAND_INITIALS[`border-${side}-radius`] = '0';
for (const corner of [
  '',
  '-top',
  '-right',
  '-bottom',
  '-left',
  '-top-left',
  '-top-right',
  '-bottom-left',
  '-bottom-right',
  '-block-start',
  '-block-end',
  '-inline-start',
  '-inline-end',
  '-start-start',
  '-start-end',
  '-end-start',
  '-end-end',
])
  SHORTHAND_INITIALS[`corner${corner}`] = '0';
const LATE_BLANK = new Set(['marker', 'mask-border', 'text-decoration-skip']);
const RESOLVED_KEYWORDS = new Set(['inherit', 'initial', 'unset']);

function shorthandInitial(name, compat) {
  const value = SHORTHAND_INITIALS[name];
  if (compat.shorthandInitials) return value === undefined || LATE_BLANK.has(name) ? '' : value;
  if (name === 'animation-delay' && !compat.initialAnimationDelay) return 'see individual properties';
  return value ?? 'see individual properties';
}

// jsdom 30.1.3 computes background-position keywords to percentages
// (center 50%, as in its background shorthand).
const POSITION_PERCENT = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
function positionValue(element, late) {
  const x = computedValue(element, 'background-position-x'),
    y = computedValue(element, 'background-position-y');
  if (x === y && CSS_WIDE.has(x)) return x;
  const xs = x.split(/\s*,\s*/),
    ys = y.split(/\s*,\s*/);
  const part = (v) => (late ? (POSITION_PERCENT[v.toLowerCase()] ?? v) : v);
  return xs.map((px, i) => `${part(px)} ${part(ys[i] ?? ys[ys.length - 1])}`).join(', ');
}

// jsdom 30.1.3 composes flex and background from their computed longhands,
// declared with var() too (rgba(0, 0, 0, 0) none repeat scroll 0% 0% /
// auto padding-box border-box; a color in the last layer only).
const BACKGROUND_LAYER = ['background-image', 'background-repeat', 'background-attachment'];
const BACKGROUND_BOX = ['background-size', 'background-origin', 'background-clip'];
function composedLate(element, name) {
  if (name === 'flex') {
    const parts = ['flex-grow', 'flex-shrink', 'flex-basis'].map((l) => computedValue(element, l));
    return parts.every((p) => p === parts[0]) && CSS_WIDE.has(parts[0]) ? parts[0] : parts.join(' ');
  }
  if (name === 'background-position') return positionValue(element, true);
  // Layers at top-level commas (not those in linear-gradient(red, blue)).
  const split = (v) => topLevelCommaSplit(v).map((layer) => layer.trim());
  const layers = split(computedValue(element, 'background-image'));
  const lists = [...BACKGROUND_LAYER, ...BACKGROUND_BOX].map((l) => split(computedValue(element, l)));
  const positions = split(positionValue(element, true));
  const at = (list, i) => list[i] ?? list[list.length - 1];
  const color = computedValue(element, 'background-color');
  return layers
    .map((image, i) => {
      const head = [image, at(lists[1], i), at(lists[2], i), at(positions, i)];
      if (i === layers.length - 1) head.unshift(color);
      return `${head.join(' ')} / ${[3, 4, 5].map((k) => at(lists[k], i)).join(' ')}`;
    })
    .join(', ');
}

// getComputedStyle(element).getPropertyValue(shorthand) in jsdom 29.0.2
// and later (black box, 29.0.2 to 30.1.3): a shorthand jsdom does not
// expand computes to its declared value (border-radius: var(--r) stays
// var(--r)), to its keyword value (SHORTHAND_INITIALS) for initial and
// unset, to the parent's value for inherit (below), and to '' (from
// 30.1.3 its keyword value) when not declared; its longhands are not set. Of those jsdom expands, padding,
// margin and the border ones compose their longhands; flex, background
// and font are as declared (keyword values: flex 0 1 auto, background and
// font 'see individual properties') until 30.1.3, from which flex and
// background compose their longhands.
const LATE_COMPOSED = new Set(['flex', 'background', 'background-position']);
// A shorthand computed as declared ('' when not), a background with an
// empty layer ('': url("a.png"), , from url(a.png), LINEAR-GRADIENT(red,
// blue) in css.js backgroundValue) too, as jsdom 27 to 30.1.2 read it
// again (black box, #264).
function asDeclared(name, own) {
  if (own === undefined) return '';
  if (name === 'background' && own.includes(',') && topLevelCommaSplit(own).some((layer) => layer.trim() === ''))
    return '';
  return own;
}
function observedShorthand(element, name) {
  const compat = element[S].doc[S].window[S].compat;
  if (compat.shorthandInitials && LATE_COMPOSED.has(name)) return composedLate(element, name);
  if (name === 'background-position') {
    return cascaded(element, 'background-position-x') === undefined &&
      cascaded(element, 'background-position-y') === undefined
      ? ''
      : positionValue(element, false);
  }
  const expanded = EXPANDED_SHORTHANDS.has(name);
  if (expanded && name !== 'flex' && name !== 'background' && name !== 'font') {
    const value = shorthandValue(element, name);
    // border: revert, from 30.1.3 once.
    return compat.shorthandInitials && value === 'revert revert revert' ? 'revert' : value;
  }
  if (!expanded && compat.blankBorderShorthands && name.startsWith('border-')) return '';
  const own = cascaded(element, name);
  if (own !== undefined && !RESOLVED_KEYWORDS.has(own.toLowerCase())) return asDeclared(name, own);
  // inherit gives the parent's value (black box, 29.1.1 to 30.1.3:
  // box-shadow, text-decoration, outline, column-rule, caret; vertical-align,
  // a shorthand in CSS Inline 3, for the user agent sheet's td and tr), its
  // keyword value when the parent does not declare it.
  if (own !== undefined && own.toLowerCase() === 'inherit') {
    const parent = inheritParent(element);
    if (parent !== null) return observedShorthand(parent, name) || shorthandInitial(name, compat);
  }
  if (own === undefined && (expanded || !compat.shorthandInitials)) return '';
  return shorthandInitial(name, compat);
}

// getComputedStyle(element).getPropertyValue(property), as jsdom gives it.
// computedValue is the value warpdom works with (layout reads it).
// jsdom 27 and later: background-position from its x and y (set by
// background too: background: red gives 0% 0%).
function styleValue(element, property) {
  const value = styleValueOf(element, property);
  // jsdom 31 (black box, 31.0.1): an element outside the rendered tree has
  // an empty computed style (checked after the value: reading it made the
  // element's cascaded values current, which keep the answer; true from
  // the start in other profiles).
  const cache = element[S].cascaded;
  if (cache !== undefined && cache.rendered !== true) {
    cache.rendered ??= inRenderedTree(element);
    if (!cache.rendered) return '';
  }
  return value;
}
// (jsdom 31: background-repeat and text-box are shorthands, read as such)
const LONGHAND_SHORTHANDS31 = new Set(['background-repeat', 'text-box']);
function styleValueOf(element, property) {
  const compat = element[S].doc[S].window[S].compat;
  if (LONGHANDS[property] !== undefined && !(compat.computed31 && LONGHAND_SHORTHANDS31.has(property)))
    return computedValue(element, property);
  if (compat.jsdom >= 27 && !property.startsWith('--')) {
    const lower = property.toLowerCase();
    const name = ALIASES[lower] ?? lower;
    // (jsdom 31: from its computed longhands where warpdom composes it)
    const composer = compat.computed31 ? composer31(name) : null;
    if (composer !== null) return composer(shorthand31(name).map((l) => shorthandInput31(element, l)));
    if (!compat.legacyComputedStyle) {
      if (SHORTHANDS[name] !== undefined) return observedShorthand(element, name);
    } else if (name === 'background-position') return observedShorthand(element, name);
  }
  return computedValue(element, property);
}

// jsdom 31 (black box, 31.0.1) composes a computed shorthand from its
// computed longhands, but font from weight 400 as normal and its width
// as a keyword (condensed for 75%), and text-decoration from a
// currentcolor color (as specified: left out) as currentcolor.
const FONT_WIDTH_KEYWORDS31 = Object.fromEntries(Object.entries(FONT_WIDTHS31).map(([k, v]) => [v, k]));
// (inherit left at the root: the initial value)
const CURRENT31 = new Set(['currentcolor', 'initial', 'unset', 'inherit']);
function specified31(element, name) {
  const value = cascaded(element, name);
  if (value === undefined || !(value.startsWith(PENDING31) || mayHaveVar(value))) return value;
  return substitutedValue(element, name, value, false) ?? 'unset';
}
function shorthandInput31(element, longhand) {
  if (longhand === 'text-decoration-color') {
    // (inherit: as the parent specifies it; var() substituted first)
    let e = element;
    let own = specified31(e, longhand);
    while (own?.toLowerCase() === 'inherit' && inheritParent(e) !== null) {
      e = inheritParent(e);
      own = specified31(e, longhand);
    }
    if (own === undefined || CURRENT31.has(own.toLowerCase())) return 'currentcolor';
  }
  const value = computedValue(element, longhand);
  if (longhand === 'font-weight') return value === '400' ? 'normal' : value;
  if (longhand === 'font-width') return FONT_WIDTH_KEYWORDS31[value] ?? value;
  return value;
}

export const isDisplayNone = (element) => computedValue(element, 'display') === 'none';

computed.value = styleValue;
computed.accessor = legacyAccessorValue;
computed.names31 = names31;

// --- jsdom 31: the computed style's items and the rendered tree ----------------------

// Whether an element is in the rendered tree (black box, 31.0.1): connected,
// in a document with a window, and in the flat tree (a shadow host's child
// assigned to a slot, a shadow root's children under their host). Else its
// computed style is empty: '' for every property, no items. Kept with the
// element's cascaded values.
function rendered31(element) {
  const cache = cascadeCache(element);
  cache.rendered ??= inRenderedTree(element);
  return cache.rendered;
}
function inRenderedTree(element) {
  if (element[S].pseudo !== undefined) followElement31(element);
  if (element[S].doc[S].noView === true) return false;
  let n = element;
  // (a pseudo-element: its element's; one jsdom 31 does not know, none)
  if (n[S].pseudo !== undefined) {
    if (n[S].pseudo === '\0unknown') return false;
    n = n[S].origin;
  }
  for (;;) {
    const p = n[S].parent;
    if (p === null) return false;
    const ps = p[S];
    if (ps.type === DOCUMENT_NODE) return true;
    if (ps.type === ELEMENT_NODE) {
      // (a host's child: through the slot it is assigned to, whose own
      // place decides: a slot in a nested host's unassigned children is
      // not rendered either)
      if (ps.shadowRoot) {
        const slot = findSlot(n);
        if (slot === null) return false;
        n = slot;
      } else {
        // (a slot's own children are its fallback, not rendered while
        // nodes are assigned to it: text too)
        if (ps.tag === 'slot' && ps.ns === HTML_NS && assignedNodes(p).length > 0) return false;
        n = p;
      }
    } else if (ps.shadow === true) n = ps.host;
    else return false;
  }
}

// The computed style's items (black box, 31.0.1): every longhand jsdom 31
// computes (its longhands, not its shorthands, aliases or the names it
// drops), unprefixed ones first, each group in code unit order; then the
// custom properties the element has (its own and inherited), in code unit
// order. None outside the rendered tree.
let longhands31 = null;
const NO_NAMES = Object.freeze([]);
// (kept with the element's cascaded values: iteration reads them at each
// step)
function names31(element) {
  if (!rendered31(element)) return NO_NAMES;
  const cache = element[S].cascaded;
  if (cache.names !== undefined) return cache.names;
  return (cache.names = namesNow31(element));
}
function namesNow31(element) {
  longhands31 ??= computedLonghands31();
  const customs = new Set();
  // (registered properties, which may have a value though none is set)
  addRegisteredNames31(element, customs);
  for (let e = element; e !== null; e = inheritParent(e)) {
    for (const name of ruleIndex(e).keys()) if (name.startsWith('--')) customs.add(name);
    // (a shadow tree's rules for it: :host, ::slotted(), #342 review;
    // with the ancestor's values as they now are, which keep them)
    cascadeCache(e);
    for (const inner of innerIndexes31(e))
      for (const name of inner.keys()) if (name.startsWith('--')) customs.add(name);
    const inline = inlineDeclarations(e);
    if (inline !== null) for (const name of inline.keys()) if (name.startsWith('--')) customs.add(name);
  }
  if (customs.size === 0) return longhands31;
  const own = [...customs].filter((name) => computedValue(element, name) !== '').sort(byCodeUnits);
  return own.length === 0 ? longhands31 : longhands31.concat(own);
}
function byCodeUnits(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
function computedLonghands31() {
  const dropped = new Set(dropped31());
  const names = Object.keys(LONGHANDS).filter(
    (name) => shorthand31(name) === undefined && !dropped.has(name) && alias31(name) === name,
  );
  return names.sort((a, b) => {
    const pa = a.startsWith('-'),
      pb = b.startsWith('-');
    if (pa === pb) return byCodeUnits(a, b);
    return pa ? 1 : -1;
  });
}
