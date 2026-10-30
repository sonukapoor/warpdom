// The CSS object model: style sheets from <style> elements and the
// CSSStyleSheet constructor, their rules (style, @media, @supports, @import,
// @font-face, @keyframes, @layer, @page with margin rules, @namespace),
// insertRule/deleteRule, MediaList, StyleSheetList and document.styleSheets.
//
// Values are kept as written: unlike jsdom 30 they are not normalized
// (jsdom serializes `margin: 0` as `0px`).
import {
  S,
  state,
  domError,
  cssomChanges,
  ruleListsChanged,
  ELEMENT_NODE,
  TEXT_NODE,
  HTML_NS,
  nextInTree,
  rootOf,
  connected,
  PlatformURL as URL,
} from './internal.js';
import {
  declarationBlock,
  serializeDeclarations,
  escapeIdentifier,
  protosMode,
  isLegacyMode,
  supportsRuleMatches,
} from './css.js';
import { liveList, iterate } from './collections.js';
import { fallbackBaseURL } from './base-url.js';
import { urlTokenEnd } from './css-values.js';

// WebIDL: an operation called with fewer arguments than it requires throws.
function required(count, n, iface, method) {
  if (count < n)
    throw new TypeError(
      `Failed to execute '${method}' on '${iface}': ${n} argument${n > 1 ? 's' : ''} required, but only ${count} present.`,
    );
}

// --- parsing ---------------------------------------------------------------------

// Index after a comment, string or unquoted url() starting at i, or i if
// none starts there.
function skipToken(text, i) {
  if (text[i] === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end < 0 ? text.length : end + 2;
  }
  const c = text[i];
  if (c === '(') {
    const end = urlTokenEnd(text, i);
    if (end !== -1) return end;
  }
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
    if (next !== i) {
      i = next;
      continue;
    }
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
    if (next !== i) {
      i = next;
      continue;
    }
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
    i++;
  }
  return text.length;
}

// Text without its comments; comment markers in strings are kept.
function stripComments(text) {
  if (!text.includes('/*')) return text;
  let out = '';
  for (let i = 0; i < text.length;) {
    const next = skipToken(text, i);
    if (next === i) out += text[i++];
    else {
      if (text[i] !== '/') out += text.slice(i, next);
      i = next;
    }
  }
  return out;
}

// Splits a list of rules into records: { selector, body } for style rules,
// { at, prelude, body } for at-rules (body null for statements). With
// `strict`, anything else is reported as { invalid: true } (insertRule's
// garbage after a rule).
export function parseRules(text, strict = false) {
  const records = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s]/.test(text[i])) i++;
    if (text.startsWith('/*', i)) {
      i = skipToken(text, i);
      continue;
    }
    if (text.startsWith('<!--', i)) {
      i += 4;
      continue;
    }
    if (text.startsWith('-->', i)) {
      i += 3;
      continue;
    }
    if (i >= text.length) break;
    if (text[i] === '}' || text[i] === ';') {
      if (strict) records.push({ invalid: true });
      i++;
      continue;
    }
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
      else if (strict) records.push({ invalid: true });
    } else if (body !== null && prelude !== '') {
      records.push({ selector: prelude, body });
    } else if (strict && prelude !== '') {
      records.push({ invalid: true });
    }
  }
  return records;
}

// The one rule in text (insertRule, appendRule), or null when there is
// none, more than one, or something else after it. jsdom 26 ignored what
// follows a rule (a{}; and a{} b{} inserted a), and so does its profile.
function parseOneRule(text, protos) {
  if (isLegacyMode(protosMode(protos))) return parseRules(text)[0] ?? null;
  const records = parseRules(text, true);
  return records.length === 1 && !records[0].invalid ? records[0] : null;
}

// A selector list's syntax, checked loosely as jsdom 30 does: brackets and
// parentheses balanced, no compound starting with a digit, no empty
// selector in the list. Unknown pseudo-classes are accepted (the cascade
// skips selectors it cannot match).
export function validSelector(text) {
  const stack = [];
  let start = true; // at the start of a compound selector
  let empty = true; // the current complex selector has no content yet
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      start = false;
      empty = false;
      continue;
    }
    if (c === '"' || c === "'") {
      if (stack.length === 0) return false;
      const next = skipToken(text, i);
      if (next > text.length || text[next - 1] !== c) return false;
      i = next - 1;
      continue;
    }
    if (c === '(' || c === '[') {
      stack.push(c === '(' ? ')' : ']');
      start = false;
      empty = false;
      continue;
    }
    if (c === ')' || c === ']') {
      if (stack.pop() !== c) return false;
      continue;
    }
    if (stack.length) continue;
    if (c === '{' || c === '}' || c === ';') return false;
    if (c === ',') {
      if (empty) return false;
      empty = true;
      start = true;
      continue;
    }
    if (/\s/.test(c) || c === '>' || c === '+' || c === '~') {
      start = true;
      continue;
    }
    if (start && /[0-9]/.test(c)) return false;
    start = false;
    empty = false;
  }
  return stack.length === 0 && !empty;
}

// @page selectors (CSS Paged Media 3): [ <ident>? <pseudo-page>* ]#,
// pseudo-pages lowercased. Null for an invalid one.
function pageSelector(text) {
  const value = String(text).trim();
  if (value === '') return '';
  const parts = [];
  for (const part of value.split(',')) {
    const m = /^(-?[A-Za-z_][\w-]*)?((?::[A-Za-z]+)*)$/.exec(part.trim());
    if (!m || part.trim() === '') return null;
    const pseudos = m[2].toLowerCase();
    if (
      pseudos &&
      !pseudos
        .split(':')
        .slice(1)
        .every((p) => p === 'left' || p === 'right' || p === 'first' || p === 'blank')
    )
      return null;
    parts.push((m[1] ?? '') + pseudos);
  }
  return parts.join(', ');
}

// CSSOM's serialize a string: in double quotes, with ", \ and control
// characters escaped.
function serializeString(value) {
  let out = '"';
  for (const ch of value) {
    const c = ch.codePointAt(0);
    if (c === 0) out += '�';
    else if ((c >= 1 && c <= 0x1f) || c === 0x7f) out += `\\${c.toString(16)} `;
    else if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else out += ch;
  }
  return `${out}"`;
}

// --- media queries ------------------------------------------------------------------
// Media Queries 4, normalized as jsdom 30 does: lowercased, whitespace
// collapsed, an invalid query is "not all".

const MQ_RESERVED = new Set(['only', 'not', 'and', 'or', 'layer']);

// Top-level tokens of a media query: idents, and parenthesized groups or
// functions (general enclosed, valid whatever their content). Null when
// something else appears.
function mediaTokens(query) {
  const tokens = [];
  let i = 0;
  while (i < query.length) {
    const c = query[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const ident = /^-?[a-z_][\w-]*/.exec(query.slice(i));
    if (c === '(' || (ident && query[i + ident[0].length] === '(')) {
      let depth = 0;
      let j = c === '(' ? i : i + ident[0].length;
      for (; j < query.length; j++) {
        const next = skipToken(query, j);
        if (next !== j) {
          j = next - 1;
          continue;
        }
        if (query[j] === '(') depth++;
        else if (query[j] === ')' && --depth === 0) break;
      }
      if (depth !== 0) return null;
      tokens.push({ group: true });
      i = j + 1;
      continue;
    }
    if (!ident) return null;
    tokens.push({ ident: ident[0] });
    i += ident[0].length;
  }
  return tokens;
}

function validMediaQuery(query) {
  const tokens = mediaTokens(query);
  if (!tokens || tokens.length === 0) return false;
  let i = 0;
  const is = (word) => tokens[i]?.ident === word;
  // <media-condition>: not <in-parens> | <in-parens> [ and | or <in-parens> ]*
  const condition = (allowOr) => {
    if (is('not')) {
      i++;
      if (!tokens[i]?.group) return false;
      i++;
      return true;
    }
    if (!tokens[i]?.group) return false;
    i++;
    let op = null;
    while (i < tokens.length && (is('and') || (allowOr && is('or')))) {
      if (op !== null && tokens[i].ident !== op) return false;
      op = tokens[i].ident;
      i++;
      if (!tokens[i]?.group) return false;
      i++;
    }
    return true;
  };
  if (tokens[0].group || (is('not') && tokens[1]?.group)) return condition(true) && i === tokens.length;
  if (is('not') || is('only')) i++;
  const type = tokens[i]?.ident;
  if (type === undefined || MQ_RESERVED.has(type)) return false;
  i++;
  if (i === tokens.length) return true;
  if (!is('and')) return false;
  i++;
  return condition(false) && i === tokens.length;
}

// Queries compare equal when they differ only in whitespace around
// parentheses and colons (jsdom keeps (min-width:480px) as written).
const mediumKey = (query) => query.replace(/\s*([:()])\s*/g, '$1');

function normalizeMedium(text) {
  const query = String(text).trim().replace(/\s+/g, ' ').toLowerCase();
  return validMediaQuery(query) ? query : 'not all';
}

// The queries of a media query list (commas outside parentheses).
function splitMedia(text) {
  const parts = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const next = skipToken(text, i);
    if (next !== i) {
      i = next - 1;
      continue;
    }
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')' && depth > 0) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// --- rules ----------------------------------------------------------------------

export const RULE_TYPES = {
  STYLE_RULE: 1,
  CHARSET_RULE: 2,
  IMPORT_RULE: 3,
  MEDIA_RULE: 4,
  FONT_FACE_RULE: 5,
  PAGE_RULE: 6,
  MARGIN_RULE: 9,
  NAMESPACE_RULE: 10,
  KEYFRAMES_RULE: 7,
  KEYFRAME_RULE: 8,
  COUNTER_STYLE_RULE: 11,
  SUPPORTS_RULE: 12,
  FONT_FEATURE_VALUES_RULE: 14,
};

const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes', '-o-keyframes']);
const MARGINS = new Set([
  'top-left-corner',
  'top-left',
  'top-center',
  'top-right',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'bottom-right-corner',
  'left-top',
  'left-middle',
  'left-bottom',
  'right-top',
  'right-middle',
  'right-bottom',
]);

const COUNTER_DESCRIPTORS = [
  'system',
  'symbols',
  'additive-symbols',
  'negative',
  'prefix',
  'suffix',
  'range',
  'pad',
  'speak-as',
  'fallback',
];

// The CSSRule prototypes of windows whose profile has the cssom/rrweb-cssom
// shape (jsdom before 27.1.0; CSSOM_SHAPE below), where parentRule,
// parentStyleSheet, cssRules and conditionText are data properties of the
// rule interfaces' prototypes and each rule has its own, as in jsdom.
const LEGACY_RULES = new WeakSet();
const legacyRules = (protos) => LEGACY_RULES.has(protos.CSSRule);
// The CSSRule prototypes of windows whose profile has jsdom's own CSSOM
// (from jsdom 29; cssomShape null).
const OWN_CSSOM = new WeakSet();
// The rule interfaces whose prototypes have a cssRules data property there.
const OWN_RULE_LISTS = new Set(['CSSMediaRule', 'CSSSupportsRule', 'CSSContainerRule', 'CSSLayerBlockRule']);

function makeRule(protos, iface, sheet, parentRule, data) {
  const rule = Object.create(protos[iface]);
  rule[S] = { sheet, parentRule, protos, ...data };
  if (legacyRules(protos)) {
    // Own data properties, as jsdom's rules have (the prototypes' are null).
    rule.parentRule = parentRule;
    rule.parentStyleSheet = sheet;
    if (OWN_RULE_LISTS.has(iface)) rule.cssRules = cssRuleList(rule);
    if (iface === 'CSSSupportsRule') rule.conditionText = data.conditionText;
  }
  return rule;
}

const isA = (rule, iface) => Object.getPrototypeOf(rule) === rule[S].protos[iface];
const isImport = (rule) => isA(rule, 'CSSImportRule');
const isNamespace = (rule) => isA(rule, 'CSSNamespaceRule');

// A list of rules. At the top level of a sheet @import rules must come
// first, then @namespace rules; inside other rules both are dropped (CSS
// Cascade 5, CSS Namespaces 3).
function ruleList(protos, body, sheet, parent) {
  const rules = [];
  let prefixOnly = parent === null; // only @import and @namespace rules so far
  let namespaces = false;
  for (const record of parseRules(body ?? '')) {
    const rule = createRule(protos, record, sheet, parent);
    if (!rule) continue;
    if (isImport(rule)) {
      if (!prefixOnly || namespaces) continue;
    } else if (isNamespace(rule)) {
      if (!prefixOnly) continue;
      namespaces = true;
    } else prefixOnly = false;
    rules.push(rule);
  }
  return rules;
}

// A keyframe selector (CSS Animations 1): from, to or a percentage between
// 0% and 100%, serialized as a percentage. Null for an invalid one.
function keyText(selector) {
  const keys = [];
  for (const k of String(selector).split(',')) {
    const t = k.trim().toLowerCase();
    if (t === 'from') keys.push('0%');
    else if (t === 'to') keys.push('100%');
    else {
      const m = /^\+?(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)%$/.exec(t);
      const n = m ? Number(m[1]) : NaN;
      if (!(n >= 0 && n <= 100)) return null;
      keys.push(`${n}%`);
    }
  }
  return keys.join(', ');
}

// The text inside name( ... ) at the start of text, and what follows.
function functionAt(text, name) {
  const open = new RegExp(`^${name}\\(`, 'i').exec(text);
  if (!open) return null;
  let depth = 0;
  for (let i = open[0].length - 1; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0)
      return { inner: text.slice(open[0].length, i).trim(), after: text.slice(i + 1).trim() };
  }
  return null;
}

// @import's prelude: a URL or string, then layer, supports() and media.
function importParts(prelude) {
  const m = /^(?:url\(\s*(["']?)(.*?)\1\s*\)|(["'])((?:\\.|(?!\3)[^\\])*)\3)\s*(.*)$/s.exec(prelude);
  if (!m) return null;
  let rest = m[5].trim();
  let layerName = null;
  let supportsText = null;
  const layer = functionAt(rest, 'layer');
  if (layer && /^-?[A-Za-z_][\w-]*(\.-?[A-Za-z_][\w-]*)*$/.test(layer.inner)) {
    layerName = layer.inner;
    rest = layer.after;
  } else if (/^layer(\s|$)/i.test(rest)) {
    layerName = '';
    rest = rest.slice(5).trim();
  }
  const supports = functionAt(rest, 'supports');
  if (supports) {
    supportsText = supports.inner;
    rest = supports.after;
  }
  const href = (m[2] ?? m[4]).replace(/\\(.)/g, '$1');
  return { href, layerName, supportsText, media: rest };
}

function importRule(protos, prelude, sheet, parentRule) {
  const parts = importParts(prelude);
  if (!parts) return null;
  return makeRule(protos, 'CSSImportRule', sheet, parentRule, {
    ...parts,
    media: mediaList(protos, parts.media),
    styleSheet: null,
  });
}

// An @import rule given new text (jsdom before 29: its cssText setter
// before 27.1.0, CSSImportRule.prototype.parse() from 27.1.0 to 28). As
// measured (20.0.3 to 28.1.0): '@import' in lowercase only, and text
// without media, or without its closing semicolon, keeps the rule's media.
function setImportText(rule, text) {
  const m = /^\s*@import\s+([\s\S]*?)(;?)\s*$/.exec(text);
  const parts = m && importParts(m[1].trim());
  if (!parts) return;
  // Without the closing semicolon the media are not read (kept).
  if (m[2] === '') parts.media = '';
  const s = rule[S];
  s.href = parts.href;
  s.layerName = parts.layerName;
  s.supportsText = parts.supportsText;
  if (parts.media.trim() !== '') setMediaText(s.media, parts.media);
  // The rule keeps its style sheet and the rules inserted into it (black
  // box 20.0.3 to 28.1.0, #120).
  cssomChanges.rev++;
}

// A style rule's selector and declarations from text, as jsdom before
// 27.1.0 parses it (CSSStyleRule.parse() and the cssText setter; black
// box 20.0.3 to 27.0.0): the selector before the last complete block, the
// declarations of every block (up to its first '}': blocks do not nest);
// without a block, the empty selector. Braces in strings and comments do
// not count, and comments are not part of the selector.
function setStyleRuleText(rule, text) {
  const t = String(text);
  // The index of the first c at or after i outside strings and comments.
  const find = (c, i) => {
    while (i < t.length) {
      const next = skipToken(t, i);
      if (next !== i) i = next;
      else if (t[i] === c) return i;
      else i++;
    }
    return -1;
  };
  let selector = '';
  let declarations = '';
  for (let i = 0; ;) {
    const open = find('{', i);
    if (open < 0) break;
    selector = stripComments(t.slice(i, open)).trim();
    const close = find('}', open + 1);
    if (close < 0) break;
    declarations += `${t.slice(open + 1, close)};`;
    i = close + 1;
  }
  const s = rule[S];
  s.selectorText = selector;
  s.style.cssText = declarations;
  cssomChanges.rev++;
}

// An @page rule's body: descriptors, and margin rules (@top-left { ... }).
function pageRule(protos, selector, body, sheet, parentRule) {
  const rule = makeRule(protos, 'CSSPageRule', sheet, parentRule, { selectorText: selector, rules: [] });
  let declarations = '';
  let i = 0;
  while (i < body.length) {
    const at = body.indexOf('@', i);
    if (at < 0) {
      declarations += body.slice(i);
      break;
    }
    declarations += body.slice(i, at);
    const end = preludeEnd(body, at);
    if (body[end] !== '{') {
      i = end + 1;
      continue;
    }
    const close = blockEnd(body, end);
    const name = body
      .slice(at + 1, end)
      .trim()
      .toLowerCase();
    if (MARGINS.has(name)) {
      const margin = makeRule(protos, 'CSSMarginRule', sheet, rule, { name });
      margin[S].style = declarationBlock(protos.CSSStyleProperties, body.slice(end + 1, close), margin);
      rule[S].rules.push(margin);
    }
    i = close + 1;
  }
  rule[S].style = declarationBlock(protos.CSSPageDescriptors, declarations, rule, 'page');
  return rule;
}

// @container's prelude: [ <container-name> ]? <container-query>.
function containerParts(prelude) {
  const m = /^(-?[A-Za-z_][\w-]*)?\s*(.*)$/s.exec(prelude);
  const named = m[1] && !/^(not|and|or)$/i.test(m[1]) && m[2] !== '';
  return { conditionText: prelude, containerName: named ? m[1] : '', containerQuery: named ? m[2] : prelude };
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
  } else if (at === 'container' && body !== null) {
    rule = makeRule(protos, 'CSSContainerRule', sheet, parentRule, containerParts(prelude));
  } else if (at === 'scope' && body !== null) {
    // [ ( <scope-start> ) ]? [ to ( <scope-end> ) ]?
    const m = /^(?:\(([^()]*)\))?\s*(?:to\s*\(([^()]*)\))?$/is.exec(prelude);
    if (!m) return null;
    rule = makeRule(protos, 'CSSScopeRule', sheet, parentRule, {
      prelude,
      start: m[1]?.trim() ?? null,
      end: m[2]?.trim() ?? null,
    });
  } else if (at === 'counter-style' && body !== null) {
    if (
      !/^-?[A-Za-z_][\w-]*$/.test(prelude) ||
      /^(none|decimal|disc|square|circle|disclosure-open|disclosure-closed)$/i.test(prelude)
    )
      return null;
    const descriptors = new Map();
    for (const part of body.split(';')) {
      const colon = part.indexOf(':');
      if (colon < 0) continue;
      const name = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim();
      if (COUNTER_DESCRIPTORS.includes(name) && value) descriptors.set(name, value);
    }
    return makeRule(protos, 'CSSCounterStyleRule', sheet, parentRule, { name: prelude, descriptors });
  } else if (at === 'layer') {
    if (body === null)
      return makeRule(protos, 'CSSLayerStatementRule', sheet, parentRule, {
        nameList: prelude
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
      });
    rule = makeRule(protos, 'CSSLayerBlockRule', sheet, parentRule, { name: prelude });
  } else if (at === 'import' && body === null) {
    return importRule(protos, prelude, sheet, parentRule);
  } else if (at === 'font-face' && body !== null) {
    rule = makeRule(protos, 'CSSFontFaceRule', sheet, parentRule, {});
    rule[S].style = declarationBlock(protos.CSSStyleProperties, body, rule);
    return rule;
  } else if (at === 'page' && body !== null) {
    const selector = pageSelector(prelude);
    return selector === null ? null : pageRule(protos, selector, body, sheet, parentRule);
  } else if (KEYFRAMES.has(at) && body !== null) {
    rule = makeRule(protos, 'CSSKeyframesRule', sheet, parentRule, { name: prelude, indexed: 0 });
    rule[S].rules = parseRules(body)
      .map((r) => keyframe(protos, r, sheet, rule))
      .filter(Boolean);
    indexKeyframes(rule);
    return rule;
  } else if (at === 'namespace' && body === null) {
    const m = /^(?:([\w-]+)\s+)?(?:url\(\s*(["']?)(.*?)\2\s*\)|(["'])(.*?)\4)$/s.exec(prelude);
    if (!m) return null;
    return makeRule(protos, 'CSSNamespaceRule', sheet, parentRule, { prefix: m[1] ?? '', namespaceURI: m[3] ?? m[5] });
  } else {
    return null; // @charset and unknown at-rules
  }
  rule[S].rules = ruleList(protos, body, sheet, rule);
  return rule;
}

function keyframe(protos, record, sheet, parentRule) {
  if (record.selector === undefined) return null;
  const key = keyText(record.selector);
  if (key === null) return null;
  const rule = makeRule(protos, 'CSSKeyframeRule', sheet, parentRule, { keyText: key });
  rule[S].style = declarationBlock(protos.CSSStyleProperties, record.body, rule);
  return rule;
}

// CSSKeyframesRule's indexed getter: own properties, rebuilt when its
// keyframes change (rare).
function indexKeyframes(rule) {
  const s = rule[S];
  for (let i = 0; i < s.rules.length; i++)
    Object.defineProperty(rule, i, { value: s.rules[i], enumerable: true, configurable: true });
  for (let i = s.rules.length; i < s.indexed; i++) delete rule[i];
  s.indexed = s.rules.length;
}

// A rule taken out of its list no longer belongs to a style sheet; the
// rules inside it keep theirs (black box 27.1.0 to 30.1.3, #120). Before
// jsdom 27.1.0 only its parentRule is reset: its parentStyleSheet stays,
// and so does the sheet an @import rule's style sheet gets when first read
// after (black box 21.1.2 to 27.0.0). `deep` (replaceSync() from jsdom
// 29): the rules inside it no longer belong to the sheet or to their
// parent rules either (black box 29.1.1, 30.1.3).
function detach(rule, deep = false) {
  const s = rule[S];
  s.parentRule = null;
  const legacy = legacyRules(s.protos);
  if (legacy) rule.parentRule = null;
  if (deep) {
    const unsheet = (r) => {
      r[S].sheet = null;
      r[S].parentRule = null;
      if (r[S].rules) for (const child of r[S].rules) unsheet(child);
    };
    unsheet(rule);
    return;
  }
  if (legacy) return;
  if (isImport(rule)) {
    // Its style sheet's parentStyleSheet becomes null; one first read
    // after resolves its href as before (jsdom 29 and 30).
    if (s.styleSheet) s.styleSheet[S].parentSheet = null;
    else if (s.sheet && OWN_CSSOM.has(s.protos.CSSRule)) s.baseURL = sheetBase(s.sheet);
  }
  s.sheet = null;
}

function styleText(style) {
  const text = serializeDeclarations(style);
  return text ? `{ ${text} }` : '{ }';
}

const nested = (rules) => (rules.length ? `{\n${rules.map((r) => `  ${ruleText(r)}`).join('\n')}\n}` : '{\n}');

// A keyframes name: an identifier, or a string where an identifier is not
// allowed (CSS-wide keywords, default, none).
function keyframesName(name) {
  if (name === '' || /^(initial|inherit|unset|revert|revert-layer|default|none)$/i.test(name))
    return serializeString(name);
  return escapeIdentifier(name);
}

function ruleText(rule) {
  const s = rule[S];
  switch (Object.getPrototypeOf(rule)) {
    // Empty only from CSSStyleRule.parse() and the cssText setter before jsdom 27.1.0.
    case s.protos.CSSStyleRule:
      return s.selectorText === '' ? '' : `${s.selectorText} ${styleText(s.style)}`;
    case s.protos.CSSMediaRule:
      return `@media ${s.media[S].list.join(', ')} ${nested(ruleArray(rule))}`;
    // (before jsdom 27.1.0 its own conditionText, which can be assigned)
    case s.protos.CSSSupportsRule:
      return `@supports ${legacyRules(s.protos) ? rule.conditionText : s.conditionText} ${nested(ruleArray(rule))}`;
    case s.protos.CSSContainerRule:
      return `@container ${s.conditionText} ${nested(ruleArray(rule))}`;
    case s.protos.CSSScopeRule:
      return `@scope ${s.prelude ? `${s.prelude} ` : ''}${nested(s.rules)}`;
    case s.protos.CSSCounterStyleRule: {
      const body = [...s.descriptors].map(([name, value]) => `${name}: ${value};`).join(' ');
      return `@counter-style ${s.name} ${body ? `{ ${body} }` : '{ }'}`;
    }
    case s.protos.CSSLayerBlockRule:
      return `@layer ${s.name} ${nested(ruleArray(rule))}`;
    case s.protos.CSSLayerStatementRule:
      return `@layer ${s.nameList.join(', ')};`;
    case s.protos.CSSImportRule: {
      const media = s.media[S].list.join(', ');
      const layer = s.layerName === null ? '' : s.layerName === '' ? ' layer' : ` layer(${s.layerName})`;
      const supports = s.supportsText === null ? '' : ` supports(${s.supportsText})`;
      return `@import url(${serializeString(s.href)})${layer}${supports}${media ? ` ${media}` : ''};`;
    }
    case s.protos.CSSFontFaceRule:
      return `@font-face ${styleText(s.style)}`;
    case s.protos.CSSPageRule: {
      const body = [serializeDeclarations(s.style), ...s.rules.map(ruleText)].filter(Boolean).join(' ');
      return `@page${s.selectorText ? ` ${s.selectorText}` : ''} ${body ? `{ ${body} }` : '{ }'}`;
    }
    case s.protos.CSSMarginRule:
      return `@${s.name} ${styleText(s.style)}`;
    case s.protos.CSSKeyframesRule:
      return `@keyframes ${keyframesName(s.name)} { ${s.rules.map(ruleText).join(' ')} }`;
    case s.protos.CSSKeyframeRule:
      return `${s.keyText} ${styleText(s.style)}`;
    case s.protos.CSSNamespaceRule:
      return `@namespace ${s.prefix ? `${s.prefix} ` : ''}url(${serializeString(s.namespaceURI)});`;
    default:
      return '';
  }
}

// --- rule lists and insertRule -------------------------------------------------------

// The rules a sheet or rule's insertRule(), deleteRule() and text use:
// before jsdom 27.1.0 an @media, @supports, @container or @layer rule's own
// cssRules, which a test can replace with an array or with another rule's
// or sheet's list (black box 21.1.2 to 27.0.0: insertions, deletions, text
// and the cascade then use that list, which jsdom's rules then share).
export function ruleArray(owner) {
  const s = owner[S];
  if (s.ruleList !== undefined && Object.hasOwn(owner, 'cssRules') && legacyRules(s.protos)) {
    const own = owner.cssRules;
    if (own !== s.ruleList) {
      if (Array.isArray(own)) return own;
      const shared = own?.[S]?.owner;
      if (shared) return shared.rules;
    }
  }
  return s.rules;
}

// What the cascade read of a rule's own cssRules before jsdom 27.1.0, which
// a test can replace, or change when it is an array, without insertRule()
// or deleteRule() (#120); null for other rules. Only an array's rules are
// kept: changes to a CSSRuleList go through the CSSOM (cssomChanges).
export function ruleListSnapshot(owner) {
  if (!Object.hasOwn(owner, 'cssRules') || !legacyRules(owner[S].protos)) return null;
  const list = owner.cssRules;
  return { owner, list, rules: Array.isArray(list) ? list.slice() : null };
}

// Whether a snapshot's list was replaced or, for an array, changed at any
// index (a deleted one included: delete leaves the length as it was).
export function ruleListChanged(snapshot) {
  const list = snapshot.owner.cssRules;
  if (list !== snapshot.list) return true;
  const rules = snapshot.rules;
  if (rules === null) return false;
  if (list.length !== rules.length) return true;
  for (let i = 0; i < rules.length; i++) if (list[i] !== rules[i]) return true;
  return false;
}

function cssRuleList(owner) {
  const s = owner[S];
  if (!s.ruleList) {
    s.ruleList = liveList(s.protos.CSSRuleList, () => s.rules);
    s.ruleList[S].protos = s.protos;
    s.ruleList[S].owner = s;
  }
  return s.ruleList;
}

// CSSOM's insert a CSS rule. `nested` for a grouping rule's list, where
// @import and @namespace rules are not allowed.
function insertRule(owner, text, index, sheet, parentRule, nested) {
  const s = owner[S];
  const list = ruleArray(owner);
  const i = index === undefined ? 0 : index >>> 0;
  if (i > list.length)
    throw domError(`The index provided (${i}) is larger than the maximum index (${list.length}).`, 'IndexSizeError');
  const record = parseOneRule(String(text), s.protos);
  const rule = record && createRule(s.protos, record, sheet, parentRule);
  if (!rule) throw domError(`Failed to parse the rule '${text}'.`, 'SyntaxError');
  if (isImport(rule)) rule[S].inserted = true;
  const before = list.slice(0, i);
  const after = list.slice(i);
  if (
    (nested && (isImport(rule) || isNamespace(rule))) ||
    (isImport(rule) && before.some((r) => !isImport(r))) ||
    (isNamespace(rule) && (before.some((r) => !isImport(r) && !isNamespace(r)) || after.some(isImport))) ||
    (!isImport(rule) && !isNamespace(rule) && after.some((r) => isImport(r) || isNamespace(r)))
  ) {
    throw domError('Cannot insert the rule at this position.', 'HierarchyRequestError');
  }
  if (isNamespace(rule) && list.some((r) => !isImport(r) && !isNamespace(r))) {
    throw domError('Cannot insert a @namespace rule into a list with other rules.', 'InvalidStateError');
  }
  list.splice(i, 0, rule);
  cssomChanges.rev++;
  ruleListsChanged(s.protos);
  return i;
}

function deleteRule(owner, index) {
  const list = ruleArray(owner);
  const i = index >>> 0;
  if (i >= list.length)
    throw domError(
      `The index provided (${i}) is larger than the maximum index (${list.length - 1}).`,
      'IndexSizeError',
    );
  const rule = list[i];
  if (isNamespace(rule) && list.some((r) => !isImport(r) && !isNamespace(r))) {
    throw domError('Cannot delete a @namespace rule from a list with other rules.', 'InvalidStateError');
  }
  list.splice(i, 1);
  cssomChanges.rev++;
  ruleListsChanged(owner[S].protos);
  detach(rule);
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
  const value = String(text ?? '');
  if (value.trim() !== '') for (const medium of splitMedia(value)) items.push(normalizeMedium(medium));
}

// --- style sheets -----------------------------------------------------------------------

function newSheet(protos, data) {
  const sheet = Object.create(protos.CSSStyleSheet);
  sheet[S] = {
    protos,
    ownerNode: null,
    ownerRule: null,
    parentSheet: null,
    href: null,
    baseURL: null,
    title: null,
    disabled: false,
    media: null,
    rules: [],
    constructed: false,
    ...data,
  };
  if (legacyRules(protos)) sheet.parentStyleSheet = sheet[S].parentSheet;
  return sheet;
}

export function createSheet(protos, { ownerNode = null, text = '', media = '', title = null } = {}) {
  const sheet = newSheet(protos, { ownerNode, title, media: mediaList(protos, media) });
  sheet[S].rules = ruleList(protos, text, sheet, null);
  return sheet;
}

// The URL a sheet's relative URLs resolve against.
function sheetBase(sheet) {
  for (let s = sheet; s; s = s[S].parentSheet) {
    const ss = s[S];
    if (ss.href) return ss.href;
    if (ss.baseURL) return ss.baseURL;
    if (ss.ownerNode) return String(fallbackBaseURL(ss.ownerNode[S].doc));
  }
  return undefined;
}

// An @import rule's style sheet: created when first read, empty (warpdom
// does not fetch style sheets), sharing the rule's media list, as in jsdom.
// Its href: null before jsdom 29 (black box 20.0.3 to 28.1.0), and from 29
// for a rule from insertRule() (black box 29.1.1, 30.1.3); else the rule's
// URL resolved against its sheet's (a deleted rule's: the one its sheet had).
function importedSheet(rule) {
  const s = rule[S];
  if (!s.styleSheet) {
    let href = null;
    if (OWN_CSSOM.has(s.protos.CSSRule) && !s.inserted)
      try {
        href = new URL(s.href, s.sheet ? sheetBase(s.sheet) : s.baseURL).href;
      } catch {
        href = s.href; // kept as written
      }
    s.styleSheet = newSheet(s.protos, { ownerRule: rule, parentSheet: s.sheet, href, media: s.media });
  }
  return s.styleSheet;
}

function childText(el) {
  let out = '';
  for (let c = el[S].first; c; c = c[S].next) if (c[S].type === TEXT_NODE) out += c[S].data;
  return out;
}

const isConnected = connected;

// A <style> element's sheet: parsed while it is in a document, replaced
// when its children or their text change (HTML: update a style block),
// null when it is not in a document, or before jsdom 30.1.2 in a shadow
// tree (compat.shadowSheets) unless its text changed there (internal.js
// styleTextChanged). A replaced sheet loses its owner node.
export function styleElementSheet(el) {
  const s = el[S];
  if (
    !isConnected(el) ||
    (s.textSheet !== true && rootOf(el)[S].shadow === true && !s.doc[S].window[S].compat.shadowSheets)
  ) {
    if (s.sheet) {
      s.sheet[S].ownerNode = null;
      s.sheet = null;
    }
    return null;
  }
  const text = childText(el);
  if (!s.sheet || s.sheetText !== text || s.sheetRev !== s.rev) {
    if (s.sheet) s.sheet[S].ownerNode = null;
    s.sheet = createSheet(s.doc[S].window[S].protos, {
      ownerNode: el,
      text,
      media: s.attrs.get('media') ?? '',
      title: s.attrs.get('title') || null,
    });
    s.sheetText = text;
    s.sheetRev = s.rev;
  }
  return s.sheet;
}

const isStyleElement = (n) => n[S].type === ELEMENT_NODE && n[S].tag === 'style' && n[S].ns === HTML_NS;

const byStamp = (a, b) => (a[S].sheetStamp ?? 0) - (b[S].sheetStamp ?? 0);

// The <style> elements of the document and its shadow trees in tree order:
// when there are any in shadow trees, as records { el } (for
// shadowIncludingOrder).
function styleElementsOf(doc) {
  const records = [];
  let inShadow = false;
  const walk = (root) => {
    for (let n = root[S].first; n; n = nextInTree(n, root)) {
      const s = n[S];
      if (s.type !== ELEMENT_NODE) continue;
      if (s.tag === 'style' && s.ns === HTML_NS) records.push(n);
      if (s.shadowRoot != null) {
        const before = records.length;
        walk(s.shadowRoot);
        if (records.length !== before) inShadow = true;
      }
    }
  };
  walk(doc);
  return inShadow ? records.map((el) => ({ el })) : records;
}

// From jsdom 30.1.2 (black box, 30.1.2 and 30.1.3) document.styleSheets
// lists the shadow trees' sheets too, each sheet put in the list when it
// is made (creation order: internal.js sheetCreated) after the last one of
// its own tree there then that precedes it in tree order, else first:
// nodes of two trees compare as disconnected (compareDocumentPosition
// gives 37 both ways). So a head's <style id=d1> and then a shadow tree's
// <style id=s1> give s1, d1; a <style id=d2> then inserted before d1
// gives d2, s1, d1, and one after d1 s1, d1, d2; removing d1 then leaves
// s1, d2. internal.js orderSheet keeps that list (sheetOrder); records:
// the style elements there are now (styleElementsOf).
function shadowIncludingOrder(doc, records) {
  const order = doc[S].sheetOrder;
  const els = new Set(records.map((r) => r.el));
  const list = [];
  if (order !== undefined)
    for (const r of order) if (r.el[S].sheetStamp === r.stamp && els.delete(r.el)) list.push(r.el);
  // (none left: each sheet made since the first shadow tree's is in order)
  if (els.size !== 0) for (const el of [...els].sort(byStamp)) list.push(el);
  return list;
}

export function documentStyleSheets(doc) {
  const ds = doc[S];
  if (!ds.styleSheetList) {
    // Before jsdom 30.1.2 (black box, 20.0.0 to 30.0.1) the sheets are in
    // the order they were created (internal.js sheetCreated), not in tree
    // order: a <style> inserted before another, or one whose text changes
    // (to the same text too), comes last.
    //
    // The sheets are cached until the tree or a style element's text changes
    // (the revisions cascade.js keys its sheet list on too): iterating the
    // list reads its items at every step, as jsdom's does, so rebuilding
    // them each time made a pass over n sheets quadratic.
    const byCreation = ds.window[S].compat.sheetsByCreation;
    ds.styleSheetList = liveList(ds.window[S].protos.StyleSheetList, () => {
      const rev = ds.treeRev ?? 0;
      const textRev = ds.styleRev ?? 0;
      if (ds.styleSheetsRev === rev && ds.styleSheetsTextRev === textRev) return ds.styleSheets;
      // (by creation too with shadow trees' sheets)
      const styleRev = byCreation || ds.shadowStyleSheets === true ? textRev : 0;
      if (ds.styleElementsRev !== rev || ds.styleElementsStyleRev !== styleRev) {
        let els = styleElementsOf(doc);
        ds.shadowStyleSheets = els.length !== 0 && els[0].el !== undefined;
        if (byCreation) {
          if (ds.shadowStyleSheets) els = els.map((r) => r.el);
          els.sort(byStamp);
        } else if (ds.shadowStyleSheets) els = shadowIncludingOrder(doc, els);
        ds.styleElements = els;
        ds.styleElementsRev = rev;
        ds.styleElementsStyleRev = styleRev;
      }
      ds.styleSheets = ds.styleElements.map(styleElementSheet).filter(Boolean);
      ds.styleSheetsRev = rev;
      ds.styleSheetsTextRev = textRev;
      return ds.styleSheets;
    });
  }
  return ds.styleSheetList;
}

// A sheet's owner node, after checking that its <style> element still has
// it (removing the element or changing its text drops the sheet).
function ownerNodeOf(sheet) {
  const s = sheet[S];
  if (s.ownerNode && isStyleElement(s.ownerNode)) styleElementSheet(s.ownerNode);
  return s.ownerNode;
}

// HTMLStyleElement's sheet, and disabled, which is its sheet's disabled
// flag (HTML; false and ignored without a sheet), as in jsdom 30.
export const STYLE_ELEMENT_MEMBERS = {
  get sheet() {
    state(this);
    return styleElementSheet(this);
  },
  get disabled() {
    state(this);
    const sheet = styleElementSheet(this);
    return sheet ? sheet[S].disabled : false;
  },
  set disabled(v) {
    state(this);
    const sheet = styleElementSheet(this);
    if (sheet) {
      sheet[S].disabled = !!v;
      cssomChanges.rev++;
    }
  },
};

// --- interfaces --------------------------------------------------------------------------

const rules = (self) => state(self).rules;

const groupingMembers = {
  get cssRules() {
    state(this);
    return cssRuleList(this);
  },
  insertRule(rule, index = 0) {
    const s = state(this);
    required(arguments.length, 1, 'CSSGroupingRule', 'insertRule');
    if (!legacyRules(s.protos)) return insertRule(this, rule, index, s.sheet, this, true);
    // Before jsdom 27.1.0 the new rule, and the rules inside it, belong to
    // a style sheet of their own that holds only it, a new one per call,
    // whether or not this rule is in a sheet (black box 21.1.2 to 27.0.0, #120).
    const sheet = newSheet(s.protos, {});
    const i = insertRule(this, rule, index, sheet, this, true);
    sheet[S].rules = [ruleArray(this)[i]];
    return i;
  },
  deleteRule(index) {
    state(this);
    required(arguments.length, 1, 'CSSGroupingRule', 'deleteRule');
    deleteRule(this, index);
  },
};

// [PutForwards=mediaText] media.
const mediaMember = {
  get media() {
    return state(this).media;
  },
  set media(v) {
    setMediaText(state(this).media, v);
    cssomChanges.rev++;
  },
};

// --- the rule interfaces' shape per jsdom generation (compat.cssomShape) ---------------

// CSSRule's constants beyond the standard's: cssom and rrweb-cssom 0.6
// (jsdom before 24.1.0), rrweb-cssom 0.7 (24.1.0 to 25.x) and 0.8 and
// @acemir/cssom (26.0.0 to 28.x); black box.
const LEGACY_TYPES_20 = { UNKNOWN_RULE: 0, DOCUMENT_RULE: 13, VIEWPORT_RULE: 15, REGION_STYLE_RULE: 16 };
const LEGACY_TYPES_24 = { ...LEGACY_TYPES_20, CONTAINER_RULE: 17, STARTING_STYLE_RULE: 1002 };
const LEGACY_TYPES_26 = { ...LEGACY_TYPES_24, LAYER_BLOCK_RULE: 18 };
const RULE_STATICS = {
  cssom20: { ...RULE_TYPES, ...LEGACY_TYPES_20 },
  cssom24: { ...RULE_TYPES, ...LEGACY_TYPES_24 },
  cssom26: { ...RULE_TYPES, ...LEGACY_TYPES_26 },
  acemir: { ...RULE_TYPES, ...LEGACY_TYPES_26 },
};

// The variant of a rule interface's descriptors (window.js descriptorsOf).
function ruleVariant({ cssomShape }) {
  if (cssomShape === null || cssomShape === 'acemir') return cssomShape;
  return 'cssom';
}

const flagged = (flags) => ({ enumerable: flags.includes('e'), configurable: flags.includes('c') });
const dataMember = (value, flags) => ({ value, writable: flags.includes('w'), ...flagged(flags) });
const accessorMember = (get, set, flags) => ({ get, set, ...flagged(flags) });

function cssTextOf() {
  state(this);
  return ruleText(this);
}
function conditionTextOf() {
  const s = state(this);
  return s.media ? s.media[S].list.join(', ') : s.conditionText;
}
const NO_RULES = Object.freeze([]);
// Anonymous functions, as jsdom's (their name is ''): CSSStyleSheet's
// toString() (each rule's text and a line break) and CSSKeyframesRule's
// @@iterator before jsdom 29.
const [sheetText, keyframesIterator] = [
  function () {
    state(this);
    return rules(this)
      .map((rule) => `${ruleText(rule)}\n`)
      .join('');
  },
  function () {
    return Array.prototype.values.call(this);
  },
];
// CSSImportRule.prototype.parse (jsdom 27.1.0 to 28): reparses the rule
// from @import text; a plain function named value (callable with new).
function importParse(text) {
  if (text == null) throw new TypeError(`Cannot read properties of ${text} (reading 'charAt')`);
  try {
    state(this);
  } catch {
    return;
  }
  if (isA(this, 'CSSImportRule')) setImportText(this, String(text));
}
Object.defineProperty(importParse, 'name', { value: 'value' });

// jsdom before 27.1.0 (cssom, rrweb-cssom; black box 20.0.3 to 27.0.0):
// parentRule, parentStyleSheet and type are writable data properties of
// each rule interface's prototype (null, and the type), cssRules and
// conditionText too where the rules have their own, and cssText an
// accessor there.
const legacyRule = (type) => ({
  parentRule: dataMember(null, 'ecw'),
  parentStyleSheet: dataMember(null, 'ecw'),
  ...(type === undefined ? {} : { type: dataMember(type, 'ecw') }),
});
const CSSOM_SHAPE = {
  CSSGroupingRule: legacyRule(),
  CSSConditionRule: {
    ...legacyRule(),
    cssRules: dataMember(NO_RULES, 'ecw'),
    conditionText: dataMember('', 'ecw'),
    cssText: dataMember('', 'ecw'),
  },
  CSSMediaRule: {
    ...legacyRule(4),
    cssRules: dataMember(NO_RULES, 'ecw'),
    conditionText: accessorMember(
      conditionTextOf,
      function (v) {
        setMediaText(state(this).media, v);
        cssomChanges.rev++;
      },
      'ec',
    ),
    cssText: accessorMember(cssTextOf, undefined, 'ec'),
  },
  CSSSupportsRule: {
    ...legacyRule(12),
    cssRules: dataMember(NO_RULES, 'ecw'),
    cssText: accessorMember(cssTextOf, undefined, ''),
  },
  CSSContainerRule: {
    ...legacyRule(17),
    cssRules: dataMember(NO_RULES, 'ecw'),
    conditionText: accessorMember(
      conditionTextOf,
      function (v) {
        Object.assign(state(this), containerParts(String(v)));
        cssomChanges.rev++;
      },
      'ec',
    ),
    cssText: accessorMember(cssTextOf, undefined, 'ec'),
  },
  CSSLayerBlockRule: {
    ...legacyRule(18),
    cssRules: dataMember(NO_RULES, 'ecw'),
    cssText: accessorMember(cssTextOf, undefined, 'ec'),
  },
  CSSStyleRule: {
    ...legacyRule(1),
    cssText: accessorMember(
      cssTextOf,
      function (v) {
        state(this);
        setStyleRuleText(this, v);
      },
      '',
    ),
  },
  CSSImportRule: {
    ...legacyRule(3),
    cssText: accessorMember(
      cssTextOf,
      function (v) {
        state(this);
        setImportText(this, String(v));
      },
      '',
    ),
  },
  CSSKeyframesRule: { ...legacyRule(7), cssText: accessorMember(cssTextOf, undefined, '') },
  CSSKeyframeRule: { ...legacyRule(8), cssText: accessorMember(cssTextOf, undefined, '') },
  CSSFontFaceRule: { ...legacyRule(5), cssText: accessorMember(cssTextOf, undefined, '') },
  // Rules jsdom before 27.1.0 does not make (it cannot parse them): data
  // properties too, for their own (makeRule).
  CSSPageRule: legacyRule(),
  CSSMarginRule: legacyRule(),
  CSSNamespaceRule: legacyRule(),
  CSSCounterStyleRule: legacyRule(),
  CSSScopeRule: legacyRule(),
  CSSLayerStatementRule: legacyRule(),
  CSSNestedDeclarations: legacyRule(),
  CSSStyleSheet: { parentStyleSheet: dataMember(null, 'ecw'), toString: dataMember(sheetText, 'ecw') },
};

// jsdom 27.1.0 to 28 (@acemir/cssom; black box 27.1.0 to 28.1.0): type a
// read-only data property and cssText a getter on each rule interface,
// CSSRule's constants on its prototype too, and cssRule ('').
const acemirRule = (type, cssTextFlags = '') => ({
  type: dataMember(type, ''),
  cssText: accessorMember(cssTextOf, undefined, cssTextFlags),
});
const ACEMIR_SHAPE = {
  CSSRule: {
    cssRule: dataMember('', 'ec'),
    ...Object.fromEntries(Object.entries(LEGACY_TYPES_26).map(([k, v]) => [k, dataMember(v, 'e')])),
  },
  CSSStyleRule: acemirRule(1),
  CSSImportRule: { ...acemirRule(3), parse: dataMember(importParse, '') },
  CSSMediaRule: { ...acemirRule(4), conditionText: accessorMember(conditionTextOf, undefined, '') },
  CSSFontFaceRule: acemirRule(5),
  CSSPageRule: acemirRule(6),
  CSSKeyframesRule: { ...acemirRule(7), [Symbol.iterator]: dataMember(keyframesIterator, 'ecw') },
  CSSKeyframeRule: acemirRule(8),
  CSSNamespaceRule: acemirRule(10),
  CSSCounterStyleRule: acemirRule(11),
  CSSSupportsRule: acemirRule(12),
  CSSContainerRule: acemirRule(17),
  CSSLayerBlockRule: acemirRule(18),
  CSSLayerStatementRule: acemirRule(0),
  CSSScopeRule: acemirRule(0, 'ec'),
  CSSNestedDeclarations: acemirRule(0),
  CSSStyleSheet: { toString: dataMember(sheetText, 'ecw') },
};

// Members jsdom 29's interfaces have that the earlier shapes lack.
const NEWER_MEMBERS = { CSSSupportsRule: ['matches'], CSSKeyframesRule: [Symbol.iterator] };

// The descriptors of a rule interface (or CSSStyleSheet) for a shape
// variant, once per module load.
function adjustRule(name, descriptors, variant) {
  for (const key of NEWER_MEMBERS[name] ?? []) delete descriptors[key];
  return Object.assign(descriptors, (variant === 'cssom' ? CSSOM_SHAPE : ACEMIR_SHAPE)[name]);
}

export const CSSOM_INTERFACES = [
  {
    name: 'CSSRule',
    statics: (compat) => RULE_STATICS[compat.cssomShape] ?? RULE_TYPES,
    compat(proto, compat) {
      if (ruleVariant(compat) === 'cssom') LEGACY_RULES.add(proto);
      else if (compat.cssomShape === null) OWN_CSSOM.add(proto);
    },
    members: {
      ...Object.fromEntries(Object.entries(RULE_TYPES).map(([k, v]) => [k, { constant: v }])),
      get type() {
        const s = state(this);
        const p = s.protos;
        switch (Object.getPrototypeOf(this)) {
          case p.CSSStyleRule:
            return 1;
          case p.CSSImportRule:
            return 3;
          case p.CSSMediaRule:
            return 4;
          case p.CSSFontFaceRule:
            return 5;
          case p.CSSPageRule:
            return 6;
          case p.CSSKeyframesRule:
            return 7;
          case p.CSSKeyframeRule:
            return 8;
          case p.CSSMarginRule:
            return 9;
          case p.CSSNamespaceRule:
            return 10;
          case p.CSSCounterStyleRule:
            return 11;
          case p.CSSSupportsRule:
            return 12;
          default:
            return 0;
        }
      },
      get cssText() {
        state(this);
        return ruleText(this);
      },
      set cssText(v) {
        state(this);
      },
      get parentRule() {
        return state(this).parentRule;
      },
      get parentStyleSheet() {
        return state(this).sheet;
      },
    },
  },
  { name: 'CSSGroupingRule', parent: 'CSSRule', members: groupingMembers },
  { name: 'CSSConditionRule', parent: 'CSSGroupingRule', members: { conditionText: { get: conditionTextOf } } },
  // matches from jsdom 29 (compat.mediaRuleMatches): jsdom evaluates no
  // media features, so a list matches when it is empty or has an "all" or
  // "screen" query, as the cascade applies @media rules (cascade.js).
  {
    name: 'CSSMediaRule',
    parent: 'CSSConditionRule',
    members: [
      mediaMember,
      {
        get matches() {
          const list = state(this).media[S].list;
          return list.length === 0 || list.includes('all') || list.includes('screen');
        },
      },
    ],
    compat(proto, compat) {
      if (!compat.mediaRuleMatches) delete proto.matches;
    },
  },
  // matches from jsdom 29 (NEWER_MEMBERS): the condition evaluated as jsdom
  // does (css.js supportsRuleMatches; selector() is false).
  {
    name: 'CSSSupportsRule',
    parent: 'CSSConditionRule',
    members: {
      get matches() {
        return supportsRuleMatches(state(this).conditionText);
      },
    },
  },
  {
    name: 'CSSContainerRule',
    parent: 'CSSConditionRule',
    members: {
      get containerName() {
        return state(this).containerName;
      },
      get containerQuery() {
        return state(this).containerQuery;
      },
    },
  },
  {
    name: 'CSSScopeRule',
    parent: 'CSSGroupingRule',
    members: {
      get start() {
        return state(this).start;
      },
      get end() {
        return state(this).end;
      },
    },
  },
  {
    name: 'CSSCounterStyleRule',
    parent: 'CSSRule',
    members: {
      get name() {
        return state(this).name;
      },
      set name(v) {
        state(this).name = String(v);
      },
      ...Object.fromEntries(
        COUNTER_DESCRIPTORS.map((name) => {
          const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          return [
            key,
            {
              get() {
                return state(this).descriptors.get(name) ?? '';
              },
              set(v) {
                const value = String(v).trim();
                if (value) state(this).descriptors.set(name, value);
              },
            },
          ];
        }),
      ),
    },
  },
  {
    name: 'CSSLayerBlockRule',
    parent: 'CSSGroupingRule',
    members: {
      get name() {
        return state(this).name;
      },
    },
  },
  {
    name: 'CSSLayerStatementRule',
    parent: 'CSSRule',
    members: {
      get nameList() {
        return Object.freeze(state(this).nameList.slice());
      },
    },
  },
  // CSS Nesting's declarations after a nested rule, from jsdom 27.2
  // (applyCompat in window.js). warpdom's style sheets have no nested rules
  // yet, so none is ever made: only the interface (style [PutForwards=cssText]).
  {
    name: 'CSSNestedDeclarations',
    parent: 'CSSRule',
    members: {
      get style() {
        return state(this).style;
      },
      set style(v) {
        state(this).style.cssText = v;
      },
    },
  },
  {
    name: 'CSSStyleRule',
    parent: 'CSSGroupingRule',
    // jsdom before 27.1.0: CSSStyleRule extends CSSRule (no cssRules), and
    // has a static parse(text) that makes a rule (black box 20.0.3 to 27.0.0).
    parentFor: (compat) => (ruleVariant(compat) === 'cssom' ? 'CSSRule' : null),
    staticMethods(window) {
      if (ruleVariant(window[S].compat) !== 'cssom') return {};
      const protos = window[S].protos;
      const parse = [
        function (text) {
          const rule = makeRule(protos, 'CSSStyleRule', null, null, { selectorText: '', rules: [] });
          rule[S].style = declarationBlock(protos.CSSStyleProperties, '', rule);
          setStyleRuleText(rule, text);
          return rule;
        },
      ][0];
      return { parse };
    },
    members: {
      get selectorText() {
        return state(this).selectorText;
      },
      set selectorText(v) {
        const s = state(this);
        const t = String(v).trim();
        if (validSelector(t)) {
          s.selectorText = t;
          cssomChanges.rev++;
        }
      },
      get style() {
        return state(this).style;
      },
      set style(v) {
        state(this).style.cssText = v;
      },
    },
  },
  {
    name: 'CSSImportRule',
    parent: 'CSSRule',
    members: [
      {
        get href() {
          return state(this).href;
        },
      },
      mediaMember,
      {
        get styleSheet() {
          state(this);
          return importedSheet(this);
        },
        get layerName() {
          return state(this).layerName;
        },
        get supportsText() {
          return state(this).supportsText;
        },
      },
    ],
  },
  {
    name: 'CSSFontFaceRule',
    parent: 'CSSRule',
    members: {
      get style() {
        return state(this).style;
      },
    },
  },
  {
    name: 'CSSPageRule',
    parent: 'CSSGroupingRule',
    members: {
      get selectorText() {
        return state(this).selectorText;
      },
      set selectorText(v) {
        const s = state(this);
        const selector = pageSelector(v);
        if (selector !== null) s.selectorText = selector;
      },
      get style() {
        return state(this).style;
      },
      set style(v) {
        state(this).style.cssText = v;
      },
    },
  },
  {
    name: 'CSSMarginRule',
    parent: 'CSSRule',
    members: {
      get name() {
        return state(this).name;
      },
      get style() {
        return state(this).style;
      },
      set style(v) {
        state(this).style.cssText = v;
      },
    },
  },
  {
    name: 'CSSKeyframesRule',
    parent: 'CSSRule',
    members: {
      get name() {
        return state(this).name;
      },
      set name(v) {
        state(this).name = String(v);
      },
      get cssRules() {
        state(this);
        return cssRuleList(this);
      },
      get length() {
        return rules(this).length;
      },
      appendRule(text) {
        const s = state(this);
        required(arguments.length, 1, 'CSSKeyframesRule', 'appendRule');
        const record = parseOneRule(String(text), s.protos);
        const rule = record && keyframe(s.protos, record, s.sheet, this);
        if (rule) {
          s.rules.push(rule);
          indexKeyframes(this);
          cssomChanges.rev++;
        }
      },
      deleteRule(select) {
        const s = state(this);
        required(arguments.length, 1, 'CSSKeyframesRule', 'deleteRule');
        const key = keyText(select);
        const i = key === null ? -1 : s.rules.findLastIndex((r) => r[S].keyText === key);
        if (i < 0) return;
        const [rule] = s.rules.splice(i, 1);
        detach(rule);
        indexKeyframes(this);
        cssomChanges.rev++;
      },
      findRule(select) {
        required(arguments.length, 1, 'CSSKeyframesRule', 'findRule');
        const key = keyText(select);
        return key === null ? null : (rules(this).findLast((r) => r[S].keyText === key) ?? null);
      },
      // Iterable over its keyframes (indexed properties) from jsdom 29;
      // 27.1.0 to 28 have another function (ACEMIR_SHAPE), earlier none.
      [Symbol.iterator]: Array.prototype.values,
    },
  },
  {
    name: 'CSSKeyframeRule',
    parent: 'CSSRule',
    members: {
      get keyText() {
        return state(this).keyText;
      },
      set keyText(v) {
        const s = state(this);
        const key = keyText(v);
        if (key === null) throw domError(`The key '${v}' is invalid and cannot be parsed.`, 'SyntaxError');
        s.keyText = key;
      },
      get style() {
        return state(this).style;
      },
      set style(v) {
        state(this).style.cssText = v;
      },
    },
  },
  {
    name: 'CSSNamespaceRule',
    parent: 'CSSRule',
    members: {
      get namespaceURI() {
        return state(this).namespaceURI;
      },
      get prefix() {
        return state(this).prefix;
      },
    },
  },
  {
    name: 'CSSRuleList',
    members: {
      get length() {
        return state(this).items().length;
      },
      item(index) {
        const s = state(this);
        required(arguments.length, 1, 'CSSRuleList', 'item');
        return s.items()[index >>> 0] ?? null;
      },
      // Over the live indexed properties, as jsdom's (collections.js).
      ...iterate,
    },
  },
  {
    name: 'MediaList',
    // Not iterable before jsdom 29 (black box 20.0.3 to 28.1.0: no @@iterator).
    compat(proto, { jsdom }) {
      if (jsdom < 29) delete proto[Symbol.iterator];
    },
    members: {
      get mediaText() {
        return state(this).list.join(', ');
      },
      set mediaText(v) {
        state(this);
        setMediaText(this, v === null ? '' : v);
        cssomChanges.rev++;
      },
      get length() {
        return state(this).list.length;
      },
      item(index) {
        const s = state(this);
        required(arguments.length, 1, 'MediaList', 'item');
        return s.list[index >>> 0] ?? null;
      },
      // CSSOM: one query, appended unless already in the list.
      appendMedium(medium) {
        const list = state(this).list;
        required(arguments.length, 1, 'MediaList', 'appendMedium');
        const text = String(medium);
        const queries = splitMedia(text);
        if (text.trim() === '' || queries.length !== 1) return;
        const m = normalizeMedium(queries[0]);
        if (!list.some((q) => mediumKey(q) === mediumKey(m))) {
          list.push(m);
          cssomChanges.rev++;
        }
      },
      // CSSOM: removes every query equal to the one given.
      deleteMedium(medium) {
        const list = state(this).list;
        required(arguments.length, 1, 'MediaList', 'deleteMedium');
        const m = mediumKey(normalizeMedium(medium));
        let removed = false;
        for (let i = list.length - 1; i >= 0; i--)
          if (mediumKey(list[i]) === m) {
            list.splice(i, 1);
            removed = true;
          }
        if (!removed) throw domError(`Failed to delete '${medium}'.`, 'NotFoundError');
        cssomChanges.rev++;
      },
      toString() {
        return state(this).list.join(', ');
      },
      // Over the live indexed properties, as jsdom 29's (collections.js);
      // earlier jsdom's MediaList is not iterable (compat).
      ...iterate,
    },
  },
  {
    name: 'StyleSheetList',
    members: {
      get length() {
        return state(this).items().length;
      },
      item(index) {
        const s = state(this);
        required(arguments.length, 1, 'StyleSheetList', 'item');
        return s.items()[index >>> 0] ?? null;
      },
      // Over the live indexed properties, as jsdom's (collections.js).
      ...iterate,
    },
  },
  {
    name: 'StyleSheet',
    // jsdom 20 to 26 (black box): style sheets are plain CSSOM objects
    // without ownerNode, href, title or type (tanstack-query's devtools
    // copy a sheet's ownerNode id only when there is one). jsdom 27 to 29
    // give an internal object as ownerNode; warpdom gives the element, as
    // jsdom 30 does (deliberate deviation, PLAN.md).
    compat(proto, { jsdom }) {
      if (jsdom < 27) for (const name of ['ownerNode', 'href', 'title', 'type']) delete proto[name];
    },
    members: [
      {
        get type() {
          state(this);
          return 'text/css';
        },
        get href() {
          return state(this).href;
        },
        get ownerNode() {
          state(this);
          return ownerNodeOf(this);
        },
        get parentStyleSheet() {
          return state(this).parentSheet;
        },
        get title() {
          return state(this).title;
        },
      },
      mediaMember,
      {
        get disabled() {
          return state(this).disabled;
        },
        set disabled(v) {
          state(this).disabled = !!v;
          cssomChanges.rev++;
        },
      },
    ],
  },
  {
    name: 'CSSStyleSheet',
    parent: 'StyleSheet',
    // The media and disabled options apply (jsdom ignores them).
    construct: (w, self, [options] = []) => {
      const protos = w[S].protos;
      const media = options?.media;
      let baseURL = String(fallbackBaseURL(w.document));
      if (options?.baseURL != null) {
        try {
          baseURL = new URL(String(options.baseURL), baseURL).href;
        } catch {
          throw domError(`Invalid base URL '${options.baseURL}'.`, 'NotAllowedError');
        }
      }
      self[S] = newSheet(protos, {
        baseURL,
        constructed: true,
        disabled: !!options?.disabled,
        media: mediaList(protos, media?.[S]?.list ? media.mediaText : (media ?? '')),
      })[S];
      if (legacyRules(protos)) self.parentStyleSheet = null;
      return self;
    },
    members: {
      get ownerRule() {
        return state(this).ownerRule;
      },
      get cssRules() {
        state(this);
        return cssRuleList(this);
      },
      get rules() {
        state(this);
        return cssRuleList(this);
      },
      insertRule(rule, index = 0) {
        state(this);
        required(arguments.length, 1, 'CSSStyleSheet', 'insertRule');
        return insertRule(this, rule, index, this, null, false);
      },
      deleteRule(index) {
        state(this);
        required(arguments.length, 1, 'CSSStyleSheet', 'deleteRule');
        deleteRule(this, index);
      },
      addRule(selector = 'undefined', style = 'undefined', index = undefined) {
        const s = state(this);
        insertRule(this, `${selector} { ${style} }`, index === undefined ? s.rules.length : index, this, null, false);
        return -1;
      },
      removeRule(index = 0) {
        state(this);
        deleteRule(this, index);
      },
      replaceSync(text) {
        const s = state(this);
        required(arguments.length, 1, 'CSSStyleSheet', 'replaceSync');
        if (!s.constructed)
          throw domError("Can't call replaceSync on non-constructed CSSStyleSheets.", 'NotAllowedError');
        const old = s.rules;
        s.rules = ruleList(s.protos, String(text), this, null).filter((r) => !isImport(r));
        // jsdom 27.4.0 and 28.1.0 leave the old rules in the sheet, and in
        // their parent rules (black box, #120); before jsdom 27 there is no
        // replaceSync() (warpdom's keeps them there too).
        if (OWN_CSSOM.has(s.protos.CSSRule)) for (const rule of old) detach(rule, true);
        cssomChanges.rev++;
      },
      replace(text) {
        try {
          const s = state(this);
          required(arguments.length, 1, 'CSSStyleSheet', 'replace');
          if (!s.constructed)
            throw domError("Can't call replace on non-constructed CSSStyleSheets.", 'NotAllowedError');
          this.replaceSync(text);
          return Promise.resolve(this);
        } catch (e) {
          return Promise.reject(e);
        }
      },
    },
  },
];

// The rule interfaces and CSSStyleSheet take their shape from the profile
// (compat.cssomShape): descriptors per variant, built once per module load.
for (const iface of CSSOM_INTERFACES) {
  const { name } = iface;
  if (!(name in CSSOM_SHAPE || name in ACEMIR_SHAPE)) continue;
  iface.variant = ruleVariant;
  iface.adjust = (descriptors, variant) => adjustRule(name, descriptors, variant);
}
