// The CSS object model: style sheets from <style> elements and the
// CSSStyleSheet constructor, their rules (style, @media, @supports, @import,
// @font-face, @keyframes, @layer, @page, @namespace), insertRule/deleteRule,
// MediaList, StyleSheetList and document.styleSheets.
//
// Values are kept as written: unlike jsdom 30 they are not normalized
// (jsdom serializes `margin: 0` as `0px`).
import { S, state, domError, cssomChanges, ELEMENT_NODE, DOCUMENT_NODE, TEXT_NODE, HTML_NS, rootOf, nextInTree, connected } from './internal.js';
import { declarationBlock, serializeDeclarations } from './css.js';
import { liveList } from './collections.js';

// --- parsing ---------------------------------------------------------------------

// Index after a comment or string starting at i, or i if neither starts there.
function skipToken(text, i) {
  if (text[i] === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end < 0 ? text.length : end + 2;
  }
  const c = text[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return i;
}

// The index of the first `{` or `;` at depth 0 from i (or the end).
function preludeEnd(text, i) {
  let depth = 0;
  while (i < text.length) {
    const next = skipToken(text, i);
    if (next !== i) { i = next; continue; }
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (depth === 0 && (c === '{' || c === ';')) return i;
    i++;
  }
  return text.length;
}

// The index of the `}` closing the block opened at `open` (or the end).
function blockEnd(text, open) {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const next = skipToken(text, i);
    if (next !== i) { i = next; continue; }
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
    i++;
  }
  return text.length;
}

const stripComments = (text) => text.replace(/\/\*[\s\S]*?(\*\/|$)/g, '');

// Splits a list of rules into records: { selector, body } for style rules,
// { at, prelude, body } for at-rules (body null for statements).
export function parseRules(text) {
  const records = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s]/.test(text[i])) i++;
    if (text.startsWith('/*', i)) { i = skipToken(text, i); continue; }
    if (text.startsWith('<!--', i)) { i += 4; continue; }
    if (text.startsWith('-->', i)) { i += 3; continue; }
    if (i >= text.length) break;
    if (text[i] === '}' || text[i] === ';') { i++; continue; }
    const end = preludeEnd(text, i);
    const prelude = stripComments(text.slice(i, end)).trim();
    let body = null;
    if (text[end] === '{') {
      const close = blockEnd(text, end);
      body = text.slice(end + 1, close);
      i = close + 1;
    } else {
      i = end + 1;
    }
    if (prelude[0] === '@') {
      const m = /^@([\w-]+)\s*/.exec(prelude);
      if (m) records.push({ at: m[1].toLowerCase(), prelude: prelude.slice(m[0].length).trim(), body });
    } else if (body !== null && prelude !== '') {
      records.push({ selector: prelude, body });
    }
  }
  return records;
}

// --- rules ----------------------------------------------------------------------

export const RULE_TYPES = {
  STYLE_RULE: 1, CHARSET_RULE: 2, IMPORT_RULE: 3, MEDIA_RULE: 4, FONT_FACE_RULE: 5, PAGE_RULE: 6,
  MARGIN_RULE: 9, NAMESPACE_RULE: 10, KEYFRAMES_RULE: 7, KEYFRAME_RULE: 8, COUNTER_STYLE_RULE: 11,
  SUPPORTS_RULE: 12, FONT_FEATURE_VALUES_RULE: 14,
};

const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes', '-o-keyframes']);

function makeRule(protos, iface, sheet, parentRule, data) {
  const rule = Object.create(protos[iface]);
  rule[S] = { sheet, parentRule, protos, ...data };
  return rule;
}

const childRules = (protos, body, sheet, parent) => parseRules(body ?? '').map((r) => createRule(protos, r, sheet, parent)).filter(Boolean);

function keyText(selector) {
  return selector.split(',').map((k) => {
    const t = k.trim().toLowerCase();
    return t === 'from' ? '0%' : t === 'to' ? '100%' : t;
  }).join(', ');
}

// A rule object for a parsed record, or null for rules that are dropped.
function createRule(protos, record, sheet, parentRule) {
  if (record.selector !== undefined) {
    // A grouping rule (CSS nesting), with no nested rules parsed yet, as in jsdom.
    const rule = makeRule(protos, 'CSSStyleRule', sheet, parentRule, { selectorText: record.selector, rules: [] });
    rule[S].style = declarationBlock(protos.CSSStyleProperties, record.body, rule);
    return rule;
  }
  const { at, prelude, body } = record;
  let rule;
  if (at === 'media' && body !== null) {
    rule = makeRule(protos, 'CSSMediaRule', sheet, parentRule, {});
    rule[S].media = mediaList(protos, prelude);
  } else if (at === 'supports' && body !== null) {
    rule = makeRule(protos, 'CSSSupportsRule', sheet, parentRule, { conditionText: prelude });
  } else if (at === 'layer') {
    if (body === null) return makeRule(protos, 'CSSLayerStatementRule', sheet, parentRule, { nameList: prelude.split(',').map((n) => n.trim()).filter(Boolean) });
    rule = makeRule(protos, 'CSSLayerBlockRule', sheet, parentRule, { name: prelude });
  } else if (at === 'import' && body === null) {
    const m = /^(?:url\(\s*(["']?)(.*?)\1\s*\)|(["'])(.*?)\3)\s*(.*)$/s.exec(prelude);
    if (!m) return null;
    return makeRule(protos, 'CSSImportRule', sheet, parentRule, { href: m[2] ?? m[4], media: mediaList(protos, m[5].trim()) });
  } else if (at === 'font-face' && body !== null) {
    rule = makeRule(protos, 'CSSFontFaceRule', sheet, parentRule, {});
    rule[S].style = declarationBlock(protos.CSSStyleProperties, body, rule);
    return rule;
  } else if (at === 'page' && body !== null) {
    rule = makeRule(protos, 'CSSPageRule', sheet, parentRule, { selectorText: prelude });
    rule[S].style = declarationBlock(protos.CSSStyleProperties, body, rule);
    return rule;
  } else if (KEYFRAMES.has(at) && body !== null) {
    rule = makeRule(protos, 'CSSKeyframesRule', sheet, parentRule, { name: prelude });
    rule[S].rules = parseRules(body).filter((r) => r.selector !== undefined).map((r) => keyframe(protos, r, sheet, rule));
    return rule;
  } else if (at === 'namespace' && body === null) {
    const m = /^(?:([\w-]+)\s+)?(?:url\(\s*(["']?)(.*?)\2\s*\)|(["'])(.*?)\4)$/s.exec(prelude);
    if (!m) return null;
    return makeRule(protos, 'CSSNamespaceRule', sheet, parentRule, { prefix: m[1] ?? '', namespaceURI: m[3] ?? m[5] });
  } else {
    return null; // @charset and unknown at-rules
  }
  rule[S].rules = childRules(protos, body, sheet, rule);
  return rule;
}

function keyframe(protos, record, sheet, parentRule) {
  const rule = makeRule(protos, 'CSSKeyframeRule', sheet, parentRule, { keyText: keyText(record.selector) });
  rule[S].style = declarationBlock(protos.CSSStyleProperties, record.body, rule);
  return rule;
}

function styleText(style) {
  const text = serializeDeclarations(style);
  return text ? `{ ${text} }` : '{ }';
}

const nested = (rules) => (rules.length ? `{\n${rules.map((r) => `  ${ruleText(r)}`).join('\n')}\n}` : '{\n}');

function ruleText(rule) {
  const s = rule[S];
  switch (Object.getPrototypeOf(rule)) {
    case s.protos.CSSStyleRule: return `${s.selectorText} ${styleText(s.style)}`;
    case s.protos.CSSMediaRule: return `@media ${s.media[S].items().join(', ')} ${nested(s.rules)}`;
    case s.protos.CSSSupportsRule: return `@supports ${s.conditionText} ${nested(s.rules)}`;
    case s.protos.CSSLayerBlockRule: return `@layer ${s.name} ${nested(s.rules)}`;
    case s.protos.CSSLayerStatementRule: return `@layer ${s.nameList.join(', ')};`;
    case s.protos.CSSImportRule: {
      const media = s.media[S].items().join(', ');
      return `@import url("${s.href}")${media ? ` ${media}` : ''};`;
    }
    case s.protos.CSSFontFaceRule: return `@font-face ${styleText(s.style)}`;
    case s.protos.CSSPageRule: return `@page${s.selectorText ? ` ${s.selectorText}` : ''} ${styleText(s.style)}`;
    case s.protos.CSSKeyframesRule: return `@keyframes ${s.name} { ${s.rules.map(ruleText).join(' ')} }`;
    case s.protos.CSSKeyframeRule: return `${s.keyText} ${styleText(s.style)}`;
    case s.protos.CSSNamespaceRule: return `@namespace ${s.prefix ? `${s.prefix} ` : ''}url(${s.namespaceURI});`;
    default: return '';
  }
}

// --- rule lists and insertRule -------------------------------------------------------

function ruleList(owner) {
  const s = owner[S];
  if (!s.ruleList) {
    s.ruleList = liveList(s.protos.CSSRuleList, () => s.rules);
    s.ruleList[S].protos = s.protos;
  }
  return s.ruleList;
}

const isImport = (rule) => Object.getPrototypeOf(rule) === rule[S].protos.CSSImportRule;
const isNamespace = (rule) => Object.getPrototypeOf(rule) === rule[S].protos.CSSNamespaceRule;

function insertRule(owner, text, index, sheet, parentRule) {
  const s = owner[S];
  const i = index === undefined ? 0 : index >>> 0;
  if (i > s.rules.length) throw domError(`The index provided (${i}) is larger than the maximum index (${s.rules.length}).`, 'IndexSizeError');
  const records = parseRules(String(text));
  if (records.length !== 1) throw domError(`Failed to parse the rule '${text}'.`, 'SyntaxError');
  const rule = createRule(s.protos, records[0], sheet, parentRule);
  if (!rule) throw domError(`Failed to parse the rule '${text}'.`, 'SyntaxError');
  const before = s.rules.slice(0, i);
  const after = s.rules.slice(i);
  if ((isImport(rule) && before.some((r) => !isImport(r)))
    || (!isImport(rule) && !isNamespace(rule) && after.some((r) => isImport(r) || isNamespace(r)))) {
    throw domError('Cannot insert a rule before @import or @namespace rules.', 'HierarchyRequestError');
  }
  s.rules.splice(i, 0, rule);
  cssomChanges.rev++;
  return i;
}

function deleteRule(owner, index) {
  const s = owner[S];
  const i = index >>> 0;
  if (i >= s.rules.length) throw domError(`The index provided (${i}) is larger than the maximum index (${s.rules.length - 1}).`, 'IndexSizeError');
  const [rule] = s.rules.splice(i, 1);
  cssomChanges.rev++;
  rule[S].sheet = null;
  rule[S].parentRule = null;
}

// --- media lists ----------------------------------------------------------------------

function mediaList(protos, text) {
  const items = [];
  const list = liveList(protos.MediaList, () => items);
  list[S].list = items;
  setMediaText(list, text);
  return list;
}

function setMediaText(list, text) {
  const items = list[S].list;
  items.length = 0;
  for (const m of String(text ?? '').split(',')) {
    const medium = m.trim().replace(/\s+/g, ' ');
    if (medium) items.push(medium);
  }
}

// --- style sheets -----------------------------------------------------------------------

export function createSheet(protos, { ownerNode = null, text = '', media = '', title = null } = {}) {
  const sheet = Object.create(protos.CSSStyleSheet);
  sheet[S] = { protos, ownerNode, title, disabled: false, media: mediaList(protos, media), rules: [] };
  sheet[S].rules = childRules(protos, text, sheet, null);
  return sheet;
}

function childText(el) {
  let out = '';
  for (let c = el[S].first; c; c = c[S].next) if (c[S].type === TEXT_NODE) out += c[S].data;
  return out;
}

const isConnected = connected;

// A <style> element's sheet: parsed while it is in a document, replaced
// when its text changes, null when it is not in a document.
export function styleElementSheet(el) {
  const s = el[S];
  if (!isConnected(el)) { s.sheet = null; return null; }
  const text = childText(el);
  if (!s.sheet || s.sheetText !== text) {
    s.sheet = createSheet(s.doc[S].window[S].protos, { ownerNode: el, text, media: s.attrs.get('media') ?? '', title: s.attrs.get('title') ?? null });
    s.sheetText = text;
  }
  return s.sheet;
}

const isStyleElement = (n) => n[S].type === ELEMENT_NODE && n[S].tag === 'style' && n[S].ns === HTML_NS;

export function documentStyleSheets(doc) {
  const ds = doc[S];
  if (!ds.styleSheetList) {
    ds.styleSheetList = liveList(ds.window[S].protos.StyleSheetList, () => {
      const rev = ds.treeRev ?? 0;
      if (ds.styleElementsRev !== rev) {
        const els = [];
        for (let n = ds.first; n; n = nextInTree(n, doc)) if (isStyleElement(n)) els.push(n);
        ds.styleElements = els;
        ds.styleElementsRev = rev;
      }
      return ds.styleElements.map(styleElementSheet).filter(Boolean);
    });
  }
  return ds.styleSheetList;
}

// --- interfaces --------------------------------------------------------------------------

const rules = (self) => state(self).rules;

const groupingMembers = {
  get cssRules() { state(this); return ruleList(this); },
  insertRule(rule, index) { const s = state(this); return insertRule(this, rule, index, s.sheet, this); },
  deleteRule(index) { state(this); deleteRule(this, index); },
};

export const CSSOM_INTERFACES = [
  {
    name: 'CSSRule',
    statics: RULE_TYPES,
    members: {
      ...Object.fromEntries(Object.entries(RULE_TYPES).map(([k, v]) => [k, { constant: v }])),
      get type() {
        const s = state(this);
        const p = s.protos;
        switch (Object.getPrototypeOf(this)) {
          case p.CSSStyleRule: return 1;
          case p.CSSImportRule: return 3;
          case p.CSSMediaRule: return 4;
          case p.CSSFontFaceRule: return 5;
          case p.CSSPageRule: return 6;
          case p.CSSKeyframesRule: return 7;
          case p.CSSKeyframeRule: return 8;
          case p.CSSNamespaceRule: return 10;
          case p.CSSSupportsRule: return 12;
          default: return 0;
        }
      },
      get cssText() { state(this); return ruleText(this); },
      set cssText(v) { state(this); },
      get parentRule() { return state(this).parentRule; },
      get parentStyleSheet() { return state(this).sheet; },
    },
  },
  { name: 'CSSGroupingRule', parent: 'CSSRule', members: groupingMembers },
  { name: 'CSSConditionRule', parent: 'CSSGroupingRule', members: { get conditionText() { const s = state(this); return s.media ? s.media[S].items().join(', ') : s.conditionText; } } },
  { name: 'CSSMediaRule', parent: 'CSSConditionRule', members: { get media() { return state(this).media; } } },
  { name: 'CSSSupportsRule', parent: 'CSSConditionRule', members: {} },
  { name: 'CSSLayerBlockRule', parent: 'CSSGroupingRule', members: { get name() { return state(this).name; } } },
  { name: 'CSSLayerStatementRule', parent: 'CSSRule', members: { get nameList() { return Object.freeze(state(this).nameList.slice()); } } },
  {
    name: 'CSSStyleRule',
    parent: 'CSSGroupingRule',
    members: {
      get selectorText() { return state(this).selectorText; },
      set selectorText(v) { const t = String(v).trim(); if (t) { state(this).selectorText = t; cssomChanges.rev++; } },
      get style() { return state(this).style; },
      set style(v) { state(this).style.cssText = v; },
    },
  },
  {
    name: 'CSSImportRule',
    parent: 'CSSRule',
    members: {
      get href() { return state(this).href; },
      get media() { return state(this).media; },
      get styleSheet() { state(this); return null; },
      get layerName() { state(this); return null; },
      get supportsText() { state(this); return null; },
    },
  },
  { name: 'CSSFontFaceRule', parent: 'CSSRule', members: { get style() { return state(this).style; } } },
  {
    name: 'CSSPageRule',
    parent: 'CSSRule',
    members: {
      get selectorText() { return state(this).selectorText; },
      set selectorText(v) { state(this).selectorText = String(v).trim(); },
      get style() { return state(this).style; },
    },
  },
  {
    name: 'CSSKeyframesRule',
    parent: 'CSSRule',
    members: {
      get name() { return state(this).name; },
      set name(v) { state(this).name = String(v); },
      get cssRules() { state(this); return ruleList(this); },
      get length() { return rules(this).length; },
      appendRule(text) {
        const s = state(this);
        const [record] = parseRules(`${text}`);
        if (record?.selector !== undefined) s.rules.push(keyframe(s.protos, record, s.sheet, this));
      },
      deleteRule(select) {
        const s = state(this);
        const key = keyText(String(select));
        const i = s.rules.findLastIndex((r) => r[S].keyText === key);
        if (i >= 0) s.rules.splice(i, 1);
      },
      findRule(select) {
        const key = keyText(String(select));
        return rules(this).findLast((r) => r[S].keyText === key) ?? null;
      },
    },
  },
  {
    name: 'CSSKeyframeRule',
    parent: 'CSSRule',
    members: {
      get keyText() { return state(this).keyText; },
      set keyText(v) { state(this).keyText = keyText(String(v)); },
      get style() { return state(this).style; },
    },
  },
  {
    name: 'CSSNamespaceRule',
    parent: 'CSSRule',
    members: { get namespaceURI() { return state(this).namespaceURI; }, get prefix() { return state(this).prefix; } },
  },
  {
    name: 'CSSRuleList',
    members: {
      get length() { return state(this).items().length; },
      item(index) { return state(this).items()[index] ?? null; },
      [Symbol.iterator]() { return state(this).items()[Symbol.iterator](); },
    },
  },
  {
    name: 'MediaList',
    members: {
      get mediaText() { return state(this).list.join(', '); },
      set mediaText(v) { setMediaText(this, v); },
      get length() { return state(this).list.length; },
      item(index) { return state(this).list[index] ?? null; },
      appendMedium(medium) {
        const list = state(this).list;
        const m = String(medium).trim();
        if (m && !list.includes(m)) list.push(m);
      },
      deleteMedium(medium) {
        const list = state(this).list;
        const i = list.indexOf(String(medium).trim());
        if (i < 0) throw domError(`Failed to delete '${medium}'.`, 'NotFoundError');
        list.splice(i, 1);
      },
      toString() { return this.mediaText; },
      [Symbol.iterator]() { return state(this).list[Symbol.iterator](); },
    },
  },
  {
    name: 'StyleSheetList',
    members: {
      get length() { return state(this).items().length; },
      item(index) { return state(this).items()[index] ?? null; },
      [Symbol.iterator]() { return state(this).items()[Symbol.iterator](); },
    },
  },
  {
    name: 'StyleSheet',
    members: {
      get type() { state(this); return 'text/css'; },
      get href() { state(this); return null; },
      get ownerNode() { return state(this).ownerNode; },
      get parentStyleSheet() { state(this); return null; },
      get title() { return state(this).title; },
      get media() { return state(this).media; },
      get disabled() { return state(this).disabled; },
      set disabled(v) { state(this).disabled = !!v; cssomChanges.rev++; },
    },
  },
  {
    name: 'CSSStyleSheet',
    parent: 'StyleSheet',
    // jsdom ignores the media and disabled options; so do we.
    construct: (w, self) => {
      const protos = w[S].protos;
      self[S] = { protos, ownerNode: null, title: null, disabled: false, media: mediaList(protos, ''), rules: [], constructed: true };
      return self;
    },
    members: {
      get ownerRule() { state(this); return null; },
      get cssRules() { state(this); return ruleList(this); },
      get rules() { state(this); return ruleList(this); },
      insertRule(rule, index) { state(this); return insertRule(this, rule, index, this, null); },
      deleteRule(index) { state(this); deleteRule(this, index); },
      addRule(selector = 'undefined', style = 'undefined', index) {
        const s = state(this);
        insertRule(this, `${selector} { ${style} }`, index === undefined ? s.rules.length : index, this, null);
        return -1;
      },
      removeRule(index = 0) { state(this); deleteRule(this, index); },
      replaceSync(text) {
        const s = state(this);
        if (!s.constructed) throw domError("Can't call replaceSync on non-constructed CSSStyleSheets.", 'NotAllowedError');
        s.rules = childRules(s.protos, String(text), this, null).filter((r) => !isImport(r));
      },
      replace(text) {
        try { this.replaceSync(text); return Promise.resolve(this); } catch (e) { return Promise.reject(e); }
      },
    },
  },
];
