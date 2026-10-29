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
  rootOf,
  cssomChanges,
  ruleListRev,
  connected,
  trackDetachedStyles,
} from './internal.js';
import { LONGHANDS, SHORTHANDS, ALIASES } from './css-data.js';
import { resolveColor, systemColorKind } from './colors.js';
import { segments, expand, serializeBox, BOX, PAIRS, CSS_WIDE, backgroundComponents } from './shorthands.js';
import { compileRuleSelector } from './selectors.js';
import { directionality } from './directionality.js';
import { absoluteLength, mayResolve, sixDigits, FONT_SIZE_KEYWORDS, relativeWeight } from './lengths.js';
import { uaDeclarations, uaValue, uaRuleOver, uaInOrder } from './ua-sheet.js';
import { documentStyleSheets, ruleArray, ruleListSnapshot, ruleListChanged } from './cssom.js';
import {
  parseDeclarations,
  writtenDeclarations,
  computed,
  validationModeOf,
  styleSurfaceOf,
  isLegacyMode,
  EXPANDED_SHORTHANDS,
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
function cascadeExpand(property, value, legacyFont, compat = null) {
  const name = ALIASES[property] ?? property;
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

function addDeclarations(index, decls, entries, counter, compat) {
  // Before jsdom 28.1.0 !important in a style rule counts for nothing
  // (documentOrder); to 29.1.1 a declaration with var() is parsed without
  // it (compat.varDropsImportant, css.js parseInto).
  const ordered = compat?.documentOrder === true;
  for (const [property, decl] of decls) {
    const value = decl.value;
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
// (which evaluates no media features): jsdom 29 and later apply a list
// with an empty, "all" or "screen" query; before (black box, 20.0.0 to
// 28.1.0) one with "screen". Rules inside other grouping rules never
// apply, as in jsdom.
function mediaApplies(rule, mode, compat) {
  const list = rule[S].media[S].list;
  if (isLegacyMode(mode) || compat.jsdom < 29) return list.includes('screen');
  return list.length === 0 || list.includes('all') || list.includes('screen');
}

// lists: what was read of rule lists a test can change without the CSSOM
// knowing (ruleListSnapshot).
function buildIndex(sheets, mode, compat, lists) {
  const index = new Map();
  index.inOrder = new InOrderIndex();
  const counter = { n: 0 };
  const addRule = (rule) => {
    let entries;
    try {
      entries = compileRuleSelector(rule[S].selectorText);
    } catch {
      return;
    }
    addDeclarations(index, rule[S].style[S].decls, entries, counter, compat);
  };
  for (const sheet of sheets) {
    const ss = sheet[S];
    if (ss.disabled) continue;
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
  // blue); before, every declaration applies in document order.
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
function ruleIndex(element) {
  const es = element[S];
  const ds = es.doc[S];
  const cached = ds.cascade;
  if (cached?.lists.some(ruleListChanged)) cssomChanges.rev++;
  const treeRev = ds.treeRev ?? 0;
  const styleRev = ds.styleRev ?? 0;
  if (cached && cached.treeRev === treeRev && cached.styleRev === styleRev && cached.cssomRev === cssomChanges.rev)
    return cached.index;
  const sheets = documentStyleSheets(es.doc)[S].items();
  const reuse = cached && cached.cssomRev === cssomChanges.rev && sameSheets(cached.sheets, sheets);
  const lists = reuse ? cached.lists : [];
  let index = EMPTY;
  if (reuse) index = cached.index;
  else if (sheets.length) index = buildIndex(sheets, validationModeOf(ds.window), ds.window[S].compat, lists);
  ds.cascade = { treeRev, styleRev, cssomRev: cssomChanges.rev, sheets: sheets.slice(), index, lists };
  return index;
}

// --- the cascade ---------------------------------------------------------------------

// The style attribute's declarations, expanded, cached per attribute value
// (css.js clears the cache when the element's style object changes).
function inlineDeclarations(element) {
  const es = element[S];
  const text = es.attrs.get('style');
  if (text === undefined) return null;
  if (es.inlineCascade?.text === text) return es.inlineCascade.map;
  const map = new Map();
  const mode = validationModeOf(es.doc[S].window);
  const written = writtenDeclarations(element, text);
  const decls = parseDeclarations(text, mode, styleSurfaceOf(es.doc[S].window), written !== null);
  const compat = es.doc[S].window[S].compat;
  for (const [property, { value, important, masked }] of decls) {
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
      map.set(
        name,
        v === PENDING ? { value: v, important, strong, from: shorthand } : { value: v, important, strong, via: from },
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
  const es = element[S];
  const ds = es.doc[S];
  let cache = es.cascaded;
  // A disconnected element's values stay as they were, and from jsdom 21
  // to 30.1.1 any element's (see below).
  if (
    cache !== undefined &&
    cache.detached &&
    cache.detachedRev === ds.detachedRev &&
    cache.cssomRev === keptCssomRev(ds, cache.kept)
  ) {
    if (cache.values.has(name)) return cache.values.get(name);
    let value = cascade(element, cache.index, cache.inline, name);
    if (value === PENDING) value = undefined;
    cache.values.set(name, value);
    return value;
  }
  const index = ruleIndex(element);
  const rev = ds.treeRev ?? 0;
  const inlineMap = inlineDeclarations(element);
  if (!cache || cache.index !== index || cache.rev !== rev || cache.inline !== inlineMap) {
    const kept = keptStyles(ds);
    let detached = kept;
    if (!kept && keepsDetached(ds)) {
      // Connected: the element's root is the document, or a shadow root
      // whose host is connected.
      const root = rootOf(element);
      detached = root[S].type !== DOCUMENT_NODE && !(root[S].shadow === true && connected(root[S].host));
    }
    if (detached) trackDetachedStyles(ds, kept);
    cache = es.cascaded = {
      index,
      rev,
      inline: inlineMap,
      values: new Map(),
      detached,
      kept,
      detachedRev: ds.detachedRev,
      cssomRev: keptCssomRev(ds, kept),
      fontSize: undefined,
      blocks: undefined,
    };
  } else if (cache.values.has(name)) return cache.values.get(name);
  let value = cascade(element, index, inlineMap, name);
  if (value === PENDING) value = undefined;
  cache.values.set(name, value);
  return value;
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

// --- computed values ------------------------------------------------------------------

// The parent element, for inheritance: as in jsdom (black box, 20.0.3 to
// 30.1.3) a shadow root's children inherit nothing from its host (a host
// with color: red or visibility: hidden leaves them black and visible).
function inheritParent(element) {
  const p = element[S].parent;
  return p !== null && p[S].type === ELEMENT_NODE ? p : null;
}

const FONT_SIZES = { medium: '16px' };
const FONT_WEIGHTS = { normal: '400', bold: '700' };
const BORDER_WIDTHS = { thin: '1px', medium: '3px', thick: '5px' };
const BORDER_WIDTH = /^border-(top|right|bottom|left)-width$/;
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
// var() value itself).
function currentColor(element) {
  const color = computedValue(element, 'color');
  return color.includes('var(') && !element[S].doc[S].window[S].compat?.legacyComputedStyle
    ? 'rgba(0, 0, 0, 0)'
    : color;
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
function computeColors(element, name, value, data) {
  const compat = element[S].doc[S].window[S].compat;
  // cssstyle before 4.4 leaves a border's colors undeclared when it gives
  // none (border: 2px inset); the expansion's initial currentcolor (in
  // lowercase) stands for that.
  if (value === 'currentcolor' && compat.colorKeywords === 'css2' && BORDER_COLOR.test(name)) {
    return compat.computedColors === 'declared' ? '' : currentColor(element);
  }
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
      parts[i] = resolveColor(token, compat.legacyColors) ?? token;
    } else if (systemColorKind(lower) === 0 && !lower.startsWith('hsl') && !/^[a-zA-Z]*[A-Z][a-zA-Z]*\(/.test(token)) {
      parts[i] = resolveColor(token, lower[0] === '#' ? 'floor' : compat.legacyColors) ?? token;
    }
  }
  return parts.join('');
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
  constructor(element, forFontSize) {
    this.element = element;
    this.forFontSize = forFontSize;
    this.emPx = -1;
    this.remPx = -1;
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
  // line-height normal: 1.2 times the font size.
  lh() {
    return 1.2 * this.em();
  }
  rlh() {
    return 1.2 * this.rem();
  }
}

// jsdom 30: font-size keywords, larger and smaller, percentages and
// lengths from the parent's font size.
function absoluteFontSize(element, value) {
  const lower = value.toLowerCase();
  const keyword = FONT_SIZE_KEYWORDS[lower];
  if (keyword !== undefined) return `${keyword}px`;
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

function computeValue(element, name, value, data) {
  if (data[2]) value = computeColors(element, name, value, data);
  const compat = element[S].doc[S].window[S].compat;
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
      const px = absoluteLength(value, new LengthContext(element, false));
      if (px !== null) value = `${sixDigits(px)}px`;
    }
  }
  if (!RAW_KEYWORDS.has(name)) return value;
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
  // Display values other than inline come from the user agent sheet.
  if (name === 'display') return 'inline';
  // jsdom 29.0.2 and later (black box, to 30.1.3).
  if (name === 'outline-color') return 'rgba(0, 0, 0, 0)';
  if (name === 'font-family') return 'depends on user agent';
  if (data[0] === null) return '';
  return data[0] === '0' ? '0' : computeValue(element, name, data[0], data);
}

function inheritedValue(element, name, data) {
  const parent = inheritParent(element);
  return parent ? computedValue(parent, name) : initialValue(element, name, data);
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
    if (SHORTHANDS[name] !== undefined && !EXPANDED_SHORTHANDS.has(name)) return own ?? '';
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
  let value = cascaded(element, name);
  if (value === undefined || CSS_WIDE.has(value.toLowerCase())) return '';
  return value;
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
  const parts = borderParts(value);
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
// visibility, pointer-events and color (inherited), background-color and
// the border colors.
const LEGACY_INHERITED = { visibility: 'visible', 'pointer-events': 'auto' };
const BORDER_COLOR = /^border-(top|right|bottom|left)-color$/;

function legacyDefault(element, name) {
  if (name === 'display') return element[S].doc[S].window[S].compat.jsdom >= 27 ? 'inline' : '';
  if (name === 'color' || name in LEGACY_INHERITED) {
    const parent = inheritParent(element);
    if (parent) return computedValue(parent, name);
    if (name !== 'color') return LEGACY_INHERITED[name];
    return element[S].doc[S].window[S].compat.rootColor;
  }
  // jsdom before 22.1.0: '' (compat.computedColors).
  if (name === 'background-color')
    return element[S].doc[S].window[S].compat.computedColors === 'declared' ? '' : 'rgba(0, 0, 0, 0)';
  if (BORDER_COLOR.test(name))
    return element[S].doc[S].window[S].compat.computedColors === 'declared' ? '' : computedValue(element, 'color');
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
const declaredComputed = (element) => element[S].doc[S].window[S].compat.legacyComputedStyle;
const legacyUnset = (element, value) => value === 'unset' && element[S].doc[S].window[S].compat.unsetUndeclared;

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
  const compat = element[S].doc[S].window[S].compat;
  // jsdom 30: em lengths read the font sizes of the element and its
  // ancestors; each element's is kept with its cascaded values (dropped
  // with them on any tree, attribute or style sheet change).
  if (name === 'font-size' && compat.absoluteLengths) {
    const value = cascaded(element, name);
    const cache = element[S].cascaded;
    if (cache.fontSize !== undefined) return cache.fontSize;
    return (cache.fontSize = longhandValue(element, name, data, false, compat, value));
  }
  return longhandValue(element, name, data, custom, compat, cascaded(element, name));
}

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
      return custom ? '' : legacyDefault(element, name);
    }
    if (name === 'display' && compat.jsdom >= 27 && (value === 'initial' || value === 'unset')) return 'inline';
    if (legacyUnset(element, value)) return custom || name === 'display' ? '' : legacyDefault(element, name);
    if (!custom && CSS_WIDE.has(value)) return value;
  }
  if (value === undefined && name === 'direction' && uaDirection(element)) return directionality(element);
  // As in jsdom (20 to 30, black box): a value with var() is not
  // substituted, it computes to itself (and inherits so).
  if (value !== undefined && !custom && value.includes('var(')) return value;
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

// --- computed shorthands as jsdom 29.0.2 and later read them -------------------------

// The value jsdom 29.0.2 and later (black box, to 30.1.3) give a
// shorthand it does not expand (cascadeExpand) for a CSS-wide keyword
// (inherit, initial, unset; revert is declared), from 30.1.3 when it is
// not declared too: these, else 'see individual properties' (before 30.1.3)
// or ''. The border ones (border-top-radius, border-image) from 29.1.1 (see
// blankBorderShorthands).
const SHORTHAND_INITIALS = {
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
  const split = (v) => v.split(/\s*,\s*/);
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
// var(--r)), to its keyword value (SHORTHAND_INITIALS) for inherit,
// initial and unset, and to '' (from 30.1.3 its keyword value) when not
// declared; its longhands are not set. Of those jsdom expands, padding,
// margin and the border ones compose their longhands; flex, background
// and font are as declared (keyword values: flex 0 1 auto, background and
// font 'see individual properties') until 30.1.3, from which flex and
// background compose their longhands.
const LATE_COMPOSED = new Set(['flex', 'background', 'background-position']);
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
  if (own !== undefined && !RESOLVED_KEYWORDS.has(own.toLowerCase())) return own;
  // vertical-align (a shorthand in CSS Inline 3) inherits as a longhand
  // (black box, 29.0.2 to 30.1.3; the user agent sheet's td and tr), its
  // initial value baseline when the parent does not declare it.
  if (name === 'vertical-align' && own !== undefined && own.toLowerCase() === 'inherit') {
    const parent = inheritParent(element);
    if (parent !== null) return observedShorthand(parent, name) || 'baseline';
  }
  if (own === undefined && (expanded || !compat.shorthandInitials)) return '';
  return shorthandInitial(name, compat);
}

// getComputedStyle(element).getPropertyValue(property), as jsdom gives it.
// computedValue is the value warpdom works with (layout reads it).
// jsdom 27 and later: background-position from its x and y (set by
// background too: background: red gives 0% 0%).
function styleValue(element, property) {
  if (LONGHANDS[property] !== undefined) return computedValue(element, property);
  const compat = element[S].doc[S].window[S].compat;
  if (compat.jsdom >= 27 && !property.startsWith('--')) {
    const lower = property.toLowerCase();
    const name = ALIASES[lower] ?? lower;
    if (!compat.legacyComputedStyle) {
      if (SHORTHANDS[name] !== undefined) return observedShorthand(element, name);
    } else if (name === 'background-position') return observedShorthand(element, name);
  }
  return computedValue(element, property);
}

export const isDisplayNone = (element) => computedValue(element, 'display') === 'none';

computed.value = styleValue;
computed.accessor = legacyAccessorValue;
