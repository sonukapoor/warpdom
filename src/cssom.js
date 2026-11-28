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
  DOCUMENT_NODE,
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
  nestedBlocks,
  isLegacyMode,
  supportsRuleMatches,
  supportsDeclarationOf,
  replayDeclarations,
  parsedPlain,
  positionTryBlock,
  declaredColor31,
} from './css.js';
import { registrations31 } from './property31.js';
import { parseBlockContents31 } from './parse31.js';
import {
  familyNames,
  serializeFamilies,
  fontFeatureValues,
  fontFeatureValuesText,
  fontPaletteValues,
  fontPaletteValuesText,
  dashedName,
  emptyPrelude,
  viewTransition,
  viewTransitionText,
  propertyRule,
  propertyRuleText,
  functionPrelude31,
  functionPreludeText31,
  functionParameters31,
} from './rules31.js';
import { cssomDeclaration, cssomEntries, blockEntries, simpleText, withoutComments } from './cssom-declaration.js';
import { liveList, iterate } from './collections.js';
import { fallbackBaseURL } from './base-url.js';
import { readEscapes, urlTokenEnd } from './css-values.js';
import { compileRuleSelector, matchText31, ruleSelector31, scopeSelector31, supportsSelector31 } from './selectors.js';
import { addAttributeStep } from './attributes.js';
import {
  serializeMedium31,
  mediumMatches31,
  parseSupports31,
  serializeSupports31,
  supportsHold31,
} from './conditions31.js';

// WebIDL: an operation called with fewer arguments than it requires throws.
function required(count, n, iface, method) {
  if (count < n)
    throw new TypeError(
      `Failed to execute '${method}' on '${iface}': ${n} argument${n > 1 ? 's' : ''} required, but only ${count} present.`,
    );
}

// --- parsing ---------------------------------------------------------------------

// Index after a comment, string or escape starting at i, or after an
// unquoted url() whose "(" is at i (the caller has read the url name), or
// i if none starts there. (An escape: a\"b{} is one rule, not a string
// running to the end; #348 review.)
function skipToken(text, i) {
  if (text[i] === '\\') return Math.min(i + 2, text.length);
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
// nested (jsdom 29 and later, nestedBlocks): blocks are matched by kind,
// so a } inside a ( or [ block closes nothing (.x { --v: (a } .y {} is
// one rule), and a closer of another kind is a token ((a ] stays open).
// Char codes, and skipToken only where a comment, string or url() can
// start.
function blockEnd(text, open, nested = false) {
  let depth = 0;
  const outer = nested ? [] : null; // (nested) the closers waited for
  let closer = 0;
  for (let i = open; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 47 || c === 40 || c === 34 || c === 39 || c === 92) {
      const next = skipToken(text, i);
      if (next !== i) {
        i = next - 1;
        continue;
      }
    }
    if (!nested) {
      if (c === 123) depth++;
      else if (c === 125 && --depth === 0) return i;
    } else if (c === 123 || c === 40 || c === 91) {
      outer.push(closer);
      // (the closer of { ( [: } ) ])
      if (c === 40) closer = 41;
      else closer = c + 2;
    } else if (c === closer) {
      closer = outer.pop();
      if (outer.length === 0) return i;
    } else if (c === 92) i++;
  }
  return text.length;
}

// Text without its comments; comment markers in strings are kept.
function stripComments(text) {
  if (!text.includes('/*')) return text;
  // Text up to each comment is copied at once (from: where it starts).
  let out = '';
  let from = 0;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c !== '/' && c !== '(' && c !== '"' && c !== "'") {
      i++;
      continue;
    }
    const next = skipToken(text, i);
    if (next === i) i++;
    else {
      if (c === '/') {
        out += text.slice(from, i);
        from = next;
      }
      i = next;
    }
  }
  return out + text.slice(from);
}

// Splits a list of rules into records: { selector, body } for style rules,
// { at, prelude, body } for at-rules (body null for statements). With
// `strict`, anything else is reported as { invalid: true } (insertRule's
// garbage after a rule).
// css31: jsdom 31's, where only CSS whitespace separates rules (a U+00A0
// starts a selector: " .t", #269 part F3a). cdo: whether <!-- and -->
// between rules are skipped, as in a sheet (jsdom 31's insertRule reads
// them as tokens: a rule's or what follows it; #269 part F3b).
export function parseRules(text, strict = false, nested = false, css31 = false, cdo = true) {
  const records = [];
  const space = css31 ? CSS_SPACE : /[\s]/;
  let i = 0;
  while (i < text.length) {
    while (i < text.length && space.test(text[i])) i++;
    if (text.startsWith('/*', i)) {
      i = skipToken(text, i);
      continue;
    }
    if (cdo && text.startsWith('<!--', i)) {
      i += 4;
      continue;
    }
    if (cdo && text.startsWith('-->', i)) {
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
    const raw = text.slice(i, end);
    const prelude = css31 ? cssTrim(stripComments(raw)) : stripComments(raw).trim();
    let body = null;
    if (text[end] === '{') {
      const close = blockEnd(text, end, nested);
      body = text.slice(end + 1, close);
      i = close + 1;
    } else {
      i = end + 1;
    }
    if (prelude[0] === '@') {
      // (jsdom 31 reads the at-keyword's escapes: @\6d edia is @media;
      // #353 review)
      // (jsdom 31: the at-keyword read from the text as written, where a
      // comment ends it, @med/**/ia is no @media and @media/**/print is
      // @media; #353 review)
      const m = (css31 ? RAW_AT : /^@([\w-]+)/).exec(css31 ? raw : prelude);
      let at = null;
      if (m !== null) at = css31 ? atName(m) : m[1].toLowerCase();
      // (raw: the prelude with its comments, which separate font family
      // names; rules31.js)
      // (CSS whitespace only in the 31 profile: U+00A0 is a token there,
      // @supports (color: red)\u00A0 { } is dropped; #353 review)
      let rest = '';
      if (m !== null) rest = css31 ? cssTrim(stripComments(raw.slice(m[0].length))) : prelude.slice(m[0].length).trim();
      if (m) records.push({ at, prelude: rest, body, raw });
      else if (strict) records.push({ invalid: true });
    } else if (body !== null && prelude !== '') {
      records.push({ selector: prelude, body, raw });
    } else if (strict && (prelude !== '' || (css31 && body !== null))) {
      // (jsdom 31: a block with no prelude is a rule it cannot read, {})
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
  const records = parseRules(text, true, nestedBlocks(protos), RULES31.has(protos.CSSRule));
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
const same = (query) => query;

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
// The CSSRule prototypes of windows whose cssstyle drops a value that is
// an object (before 4.4: compat.cssomObjectValues false).
const OBJECTS_DROPPED = new WeakSet();
const objectValues = (protos) => !OBJECTS_DROPPED.has(protos.CSSRule);
// The CSSRule prototypes of windows whose profile has jsdom's own CSSOM
// (from jsdom 29; cssomShape null).
const OWN_CSSOM = new WeakSet();
// The CSSRule prototypes of windows whose profile has @acemir/cssom's shape
// (jsdom 27.1.0 to 28; ACEMIR_SHAPE below).
const ACEMIR_RULES = new WeakSet();
// The CSSRule prototypes of windows with jsdom 31's newer rules
// (rules31.js): @starting-style, @font-feature-values,
// @font-palette-values, @position-try, @view-transition.
const RULES31 = new WeakSet();
const CSS_SPACE = /[ \t\n\r\f]/;
// (only CSS whitespace: a U+00A0 stays, a type selector)
const cssTrim = (text) => text.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
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
  } else if (iface === 'CSSKeyframesRule' && ACEMIR_RULES.has(protos.CSSRule)) {
    // jsdom 27.1.0 to 28 (black box 27.4.0, 28.1.0): name and cssRules are
    // the rule's own data properties, length its own getter of
    // this.cssRules.length (indexKeyframes: the indices too); the
    // prototype has none of them.
    Object.defineProperties(rule, {
      name: { value: data.name, writable: true, enumerable: true, configurable: true },
      cssRules: { value: cssRuleList(rule), writable: true, enumerable: true, configurable: true },
      length: { get: keyframesLength, configurable: true },
    });
  }
  return rule;
}

const isA = (rule, iface) => Object.getPrototypeOf(rule) === rule[S].protos[iface];
const isImport = (rule) => isA(rule, 'CSSImportRule');
const isNamespace = (rule) => isA(rule, 'CSSNamespaceRule');
const isLayerStatement = (rule) => isA(rule, 'CSSLayerStatementRule');

// A list of rules. At the top level of a sheet @import rules must come
// first, then @namespace rules; inside other rules both are dropped (CSS
// Cascade 5, CSS Namespaces 3).
// jsdom 31 (black box, 31.0.1): a style sheet whose blocks ((, [ and {)
// nest more than 128 deep has no rules ("Could not parse CSS
// stylesheet"); a rule added through the CSSOM has no such limit.
const MAX_DEPTH31 = 128;
function tooDeep(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
    } else if (c === '\\') i++;
    else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 1;
    } else if (c === '(' && urlTokenEnd(text, i) >= 0) {
      // (an unquoted url() is one token: its parentheses do not nest;
      // urlTokenEnd: url not part of a longer name, escapes skipped)
      i = urlTokenEnd(text, i) - 1;
    } else if (c === '(' || c === '[' || c === '{') {
      if (++depth > MAX_DEPTH31) return true;
    } else if ((c === ')' || c === ']' || c === '}') && depth > 0) depth--;
  }
  return false;
}

function ruleList(protos, body, sheet, parent) {
  const rules = [];
  if (parent === null && MEDIA31.has(protos.MediaList) && tooDeep(body ?? '')) return rules;
  let prefixOnly = parent === null; // only @import and @namespace rules so far
  let namespaces = false;
  // (jsdom 31: @layer statements before them too, which after them end
  // the prefix as any other rule does; black box, 31.0.1)
  const spec31 = RULES31.has(protos.CSSRule);
  let layersOnly = spec31 && prefixOnly;
  for (const record of parseRules(body ?? '', false, nestedBlocks(protos), spec31)) {
    const rule = createRule(protos, record, sheet, parent);
    if (!rule) continue;
    if (layersOnly && isLayerStatement(rule)) {
      rules.push(rule);
      continue;
    }
    layersOnly = false;
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
      const m = /^\+?(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)%$/.exec(t);
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
  // cssom makes the rule a new style object too (cssomStyle).
  s.body = declarations;
  s.cssom = undefined;
  cascadeFromCssom(rule);
  cssomChanges.rev++;
}

// A style rule's style in the cssom shape (jsdom before 27.1.0, #244):
// cssom's declaration object, values as written (cssom-declaration.js),
// made from the rule's text when first read. The rule's parsed
// declarations (s.style) stay what the cascade reads: a change of the
// object (its methods, or a write of its properties) parses them again
// from its declarations, as jsdom's cascade gives those to cssstyle.
function cssomStyle(rule) {
  const s = rule[S];
  if (s.cssom === undefined)
    s.cssom = cssomDeclaration(s.body ?? '', rule, (style) => {
      if (s.cssom !== style) return;
      // A write while its declarations are read (a value's toString
      // writing the style) reads them again once that is done, with the
      // values turned into strings so far (cssomEntries), so it ends.
      if (s.syncing) {
        s.syncAgain = true;
        return;
      }
      s.syncing = true;
      const coerced = new Map();
      try {
        for (let pass = 0; pass < 8; pass++) {
          s.syncAgain = false;
          replayDeclarations(s.style, cssomEntries(style, coerced, objectValues(s.protos)));
          if (!s.syncAgain) break;
        }
      } finally {
        s.syncing = false;
      }
      cssomChanges.rev++;
    });
  return s.cssom;
}
// The parsed declarations from the cssom style (from new text).
function cascadeFromCssom(rule) {
  const s = rule[S];
  replayDeclarations(s.style, cssomEntries(cssomStyle(rule), new Map(), objectValues(s.protos)));
}

// An @page rule's body: descriptors, and margin rules (@top-left { ... }).
// The index of the next @ that starts a rule in a block, or -1: not one in
// a string, comment or url (background-image: url(/img/@2x.png); #354
// review).
function atRuleStart(text, from) {
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 64) return i;
    if (c === 47 || c === 40 || c === 34 || c === 39 || c === 92) {
      const next = skipToken(text, i);
      if (next !== i) i = next - 1;
    }
  }
  return -1;
}
function pageRule(protos, selector, body, sheet, parentRule) {
  const rule = makeRule(protos, 'CSSPageRule', sheet, parentRule, { selectorText: selector, rules: [] });
  const spec31 = RULES31.has(protos.CSSRule);
  let declarations = '';
  let i = 0;
  while (i < body.length) {
    const at = atRuleStart(body, i);
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
    const close = blockEnd(body, end, nestedBlocks(protos));
    const name = body
      .slice(at + 1, end)
      .trim()
      .toLowerCase();
    if (MARGINS.has(name)) {
      const margin = makeRule(protos, 'CSSMarginRule', sheet, rule, { name });
      // (jsdom 31: CSSMarginDescriptors, css.js setDescriptorsMode)
      const proto = spec31 ? protos.CSSMarginDescriptors : protos.CSSStyleProperties;
      margin[S].style = declarationBlock(proto, body.slice(end + 1, close), margin);
      rule[S].rules.push(margin);
    }
    i = close + 1;
  }
  // (jsdom 31: a style rule's declarations of the page context's
  // properties and the page descriptors, css.js setDescriptorsMode)
  rule[S].style = spec31
    ? declarationBlock(protos.CSSPageDescriptors, declarations, rule)
    : declarationBlock(protos.CSSPageDescriptors, declarations, rule, 'page', 'sheet', {
        lastWins: legacyRules(protos),
        styleProto: protos.CSSStyleProperties,
      });
  return rule;
}

// @container's prelude: [ <container-name> ]? <container-query>.
function containerParts(prelude) {
  const m = /^(-?[A-Za-z_][\w-]*)?\s*(.*)$/s.exec(prelude);
  const named = m[1] && !/^(not|and|or)$/i.test(m[1]) && m[2] !== '';
  return { conditionText: prelude, containerName: named ? m[1] : '', containerQuery: named ? m[2] : prelude };
}

// jsdom 31's (black box, 31.0.1): a comma-separated list of conditions,
// each [ <container-name> ] [ <query> ], a query written as its media
// queries are (conditions31.js: (width > 1px), (w>1px) kept), a name as
// written (none, and, or drop the rule; not and style() start a query);
// containerName and containerQuery the one condition's, '' for a list;
// conditions, frozen, { name, query } each. Null: not one.
function containerParts31(prelude) {
  const conditions = [];
  for (const part of splitTopLevel(prelude)) {
    const text = cssTrim(part);
    const m = /^(--[\w\u0080-\uffff-]*|-?[A-Za-z_\u0080-\uffff][\w\u0080-\uffff-]*)(?![\w\u0080-\uffff(-])/.exec(text);
    let name = '';
    let rest = text;
    if (m && m[1].toLowerCase() !== 'not') {
      if (/^(none|and|or)$/i.test(m[1])) return null;
      name = m[1];
      rest = cssTrim(text.slice(m[0].length));
    }
    let query = '';
    if (rest !== '') {
      // (what it does not read as written: (x:  "a  b") stays; #348 review)
      query = serializeMedium31(styleQueries31(rest), true);
      if (query === 'not all') return null;
    }
    if (name === '' && query === '') return null;
    conditions.push(Object.freeze({ name, query }));
  }
  const one = conditions.length === 1 ? conditions[0] : null;
  return {
    conditionText: conditions.map((c) => (c.name && c.query ? `${c.name} ${c.query}` : c.name || c.query)).join(', '),
    containerName: one?.name ?? '',
    containerQuery: one?.query ?? '',
    conditions: Object.freeze(conditions),
  };
}
// A container query's style() queries written as declarations,
// style(--x: 1) (Style( lowercased); strings in it as they are (#348
// review: style(--x: "style(--y:1)") keeps the string).
function styleQueries31(text) {
  let out = '';
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'") i = stringEnd(text, i) - 1;
    else if (
      (c === 's' || c === 'S') &&
      text.slice(i, i + 6).toLowerCase() === 'style(' &&
      !/[\w\u0080-\uffff-]/.test(text[i - 1] ?? '')
    ) {
      const close = groupEnd(text, i + 5);
      if (close < 0) break;
      const inner = text.slice(i + 6, close);
      const colon = topLevelColon(inner);
      const name = cssTrim(colon < 0 ? inner : inner.slice(0, colon));
      const declaration = colon < 0 ? name : `${name}: ${cssTrim(inner.slice(colon + 1))}`;
      out += `${text.slice(from, i)}style(${declaration})`;
      from = close + 1;
      i = close;
    }
  }
  return out + text.slice(from);
}
// Where a string that opens at i ends (past its quote; at a newline or the
// end where it is left open).
function stringEnd(text, i) {
  const quote = text[i];
  let k = i + 1;
  while (k < text.length && text[k] !== quote && text[k] !== '\n') k += text[k] === '\\' ? 2 : 1;
  return Math.min(k + 1, text.length);
}
// The ) that closes the ( at open (strings and escapes skipped), or -1.
function groupEnd(text, open) {
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') k++;
    else if (c === '"' || c === "'") k = stringEnd(text, k) - 1;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k;
  }
  return -1;
}
// The first : outside strings and parentheses, or -1.
function topLevelColon(text) {
  let depth = 0;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') k++;
    else if (c === '"' || c === "'") k = stringEnd(text, k) - 1;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ':' && depth === 0) return k;
  }
  return -1;
}
// text split at its commas outside parentheses, strings and comments.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

// A rule object for a parsed record, or null for rules that are dropped.
function createRule(protos, record, sheet, parentRule) {
  if (record.selector !== undefined) {
    // A grouping rule (CSS nesting), with no nested rules parsed yet, as in jsdom.
    // body: the text its cssom style is made from (cssomStyle).
    const legacy = legacyRules(protos);
    // (jsdom 31: a selector its engine refuses drops the rule; the others
    // are serialized, #269 part F3a)
    // (from the text as written: only CSS whitespace trimmed, so a leading
    // U+00A0 stays, a type selector)
    let written = null;
    // (comments too: they separate tokens, selectors.js decomment31)
    if (RULES31.has(protos.CSSRule)) written = record.raw ?? record.selector;
    const selectorText = written === null ? record.selector : ruleSelector31(written);
    if (selectorText === null) return null;
    const rule = makeRule(protos, 'CSSStyleRule', sheet, parentRule, {
      selectorText,
      matchText: written === null ? undefined : matchText31(written, selectorText),
      rules: [],
      style: null,
      body: legacy ? record.body : undefined,
    });
    if (legacy) {
      // The declarations cssom reads from the text, given to the cascade
      // as jsdom's gives them to cssstyle (black box 20.0.3 to 27.0.1):
      // comments dropped wherever they are (url(a/* x */b.png) too), the
      // name's spaces too (w i d t h), each name once with its last value
      // (color: red; color: bogus is no color), priorities other than
      // !important left in the value (red ! important is no color).
      // Most blocks are parsed as text, which gives the same (parsedPlain,
      // css.js parseInto, context 'cssom'): those with none of cssom's
      // special characters once their comments are gone (simpleText).
      const body = record.body;
      const text = withoutComments(body);
      let plain = text !== null && simpleText(text);
      rule[S].style = declarationBlock(protos.CSSStyleProperties, plain ? text : '', rule, undefined, 'cssom');
      if (plain) plain = parsedPlain(rule[S].style);
      if (!plain) replayDeclarations(rule[S].style, blockEntries(body));
    } else rule[S].style = declarationBlock(protos.CSSStyleProperties, record.body, rule);
    return rule;
  }
  const { at, prelude, body } = record;
  let rule;
  if (at === 'media' && body !== null) {
    rule = makeRule(protos, 'CSSMediaRule', sheet, parentRule, {});
    rule[S].media = mediaList(protos, prelude);
  } else if (at === 'supports' && body !== null) {
    // jsdom 31: a condition that does not parse drops the rule, one that
    // does is written as it has it (conditions31.js).
    const node = MEDIA31.has(protos.MediaList) ? parseSupports31(prelude) : null;
    if (node === null && MEDIA31.has(protos.MediaList)) return null;
    rule = makeRule(protos, 'CSSSupportsRule', sheet, parentRule, {
      conditionText: node === null ? prelude : serializeSupports31(node),
    });
    rule[S].supports31 = node;
  } else if (at === 'container' && body !== null) {
    const parts = MEDIA31.has(protos.MediaList) ? containerParts31(prelude) : containerParts(prelude);
    if (parts === null) return null;
    rule = makeRule(protos, 'CSSContainerRule', sheet, parentRule, parts);
  } else if (at === 'scope' && body !== null) {
    // [ ( <scope-start> ) ]? [ to ( <scope-end> ) ]?; jsdom 31 (black box,
    // 31.0.1) takes selectors with parentheses of their own ((:is(.a, .b)),
    // (div:has(> p))), and to( is a function, not to and a (.
    if (MEDIA31.has(protos.MediaList)) {
      // (from the text as written: its comments separate tokens)
      // (an at-rule whose name only starts with scope is not one: @scopeé,
      // @scope\41; #348 review)
      const keyword = RAW_AT.exec(record.raw);
      if (keyword === null || atName(keyword) !== 'scope') return null;
      const parts = scopePrelude31(cssTrim(record.raw.slice(keyword[0].length)));
      if (parts === null) return null;
      rule = makeRule(protos, 'CSSScopeRule', sheet, parentRule, parts);
    } else {
      const m = /^(?:\(([^()]*)\))?\s*(?:to\s*\(([^()]*)\))?$/is.exec(prelude);
      if (!m) return null;
      rule = makeRule(protos, 'CSSScopeRule', sheet, parentRule, {
        prelude,
        start: m[1]?.trim() ?? null,
        end: m[2]?.trim() ?? null,
        match: null,
      });
    }
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
    // (jsdom 31: CSSFontFaceDescriptors, css.js setDescriptorsMode)
    const proto = RULES31.has(protos.CSSRule) ? protos.CSSFontFaceDescriptors : protos.CSSStyleProperties;
    rule[S].style = declarationBlock(proto, body, rule);
    return rule;
  } else if (at === 'page' && body !== null) {
    const selector = pageSelector(prelude);
    return selector === null ? null : pageRule(protos, selector, body, sheet, parentRule);
  } else if (KEYFRAMES.has(at) && body !== null) {
    rule = makeRule(protos, 'CSSKeyframesRule', sheet, parentRule, { name: prelude, indexed: 0 });
    rule[S].rules = parseRules(body, false, nestedBlocks(protos), RULES31.has(protos.CSSRule))
      .map((r) => keyframe(protos, r, sheet, rule))
      .filter(Boolean);
    indexKeyframes(rule);
    return rule;
  } else if (at === 'namespace' && body === null) {
    const m = /^(?:([\w-]+)\s+)?(?:url\(\s*(["']?)(.*?)\2\s*\)|(["'])(.*?)\4)$/s.exec(prelude);
    if (!m) return null;
    return makeRule(protos, 'CSSNamespaceRule', sheet, parentRule, { prefix: m[1] ?? '', namespaceURI: m[3] ?? m[5] });
  } else {
    // (jsdom 31's newer rules: the name and prelude read from the text as
    // written, where a comment separates tokens: @font-feature-values/**/A
    // is the family A, --a/**/b two names; #344 review)
    const m = RULES31.has(protos.CSSRule) && body !== null ? RAW_AT.exec(record.raw) : null;
    const make = m === null ? null : newerRule31(atName(m));
    // (else @charset and unknown at-rules)
    return make === null ? null : make(protos, record.raw.slice(m[0].length), body, sheet, parentRule);
  }
  rule[S].rules = ruleList(protos, body, sheet, rule);
  return rule;
}

// jsdom 31's newer rules (rules31.js), by at-rule name: each makes its
// rule, or null when it is dropped.
const NEWER_RULES31 = {
  'starting-style'(protos, prelude, body, sheet, parentRule) {
    if (!emptyPrelude(prelude)) return null;
    const rule = makeRule(protos, 'CSSStartingStyleRule', sheet, parentRule, {});
    rule[S].rules = ruleList(protos, body, sheet, rule);
    return rule;
  },
  'font-feature-values'(protos, prelude, body, sheet, parentRule) {
    // (a/**/b is the family a b)
    const data = fontFeatureValues(prelude, body);
    return data === null ? null : makeRule(protos, 'CSSFontFeatureValuesRule', sheet, parentRule, { data });
  },
  'font-palette-values'(protos, prelude, body, sheet, parentRule) {
    const data = fontPaletteValues(prelude, body, declaredColor31);
    return data === null ? null : makeRule(protos, 'CSSFontPaletteValuesRule', sheet, parentRule, { data });
  },
  'position-try'(protos, prelude, body, sheet, parentRule) {
    const name = dashedName(prelude);
    if (name === null) return null;
    const rule = makeRule(protos, 'CSSPositionTryRule', sheet, parentRule, { name });
    rule[S].style = positionTryBlock(protos.CSSPositionTryDescriptors, body, rule);
    return rule;
  },
  'view-transition'(protos, prelude, body, sheet, parentRule) {
    const data = viewTransition(prelude, body);
    return data === null ? null : makeRule(protos, 'CSSViewTransitionRule', sheet, parentRule, { data, types: null });
  },
  // (#269 part G1b; the cascade reads none of it)
  function(protos, prelude, body, sheet, parentRule) {
    const data = functionPrelude31(prelude);
    if (data === null) return null;
    const rule = makeRule(protos, 'CSSFunctionRule', sheet, parentRule, { data, functionBody: true });
    rule[S].rules = functionBody31(protos, body, sheet, rule);
    return rule;
  },
  // (#269 part F2; the cascade reads its registration: cascade.js)
  property(protos, prelude, body, sheet, parentRule) {
    const data = propertyRule(prelude, body);
    if (data === null) return null;
    registrations31.made = true;
    return makeRule(protos, 'CSSPropertyRule', sheet, parentRule, { data, names: null });
  },
};

// An @function's block (black box, 31.0.1): its declarations, custom
// properties and result, each run of them before or after a rule a
// CSSFunctionDeclarations (none for a run with no valid one; invalid
// declarations, other rules and statements do not end a run), and @media,
// @supports and @container rules, whose blocks are read so too. Other
// rules are dropped.
const FUNCTION_CONDITIONS = new Set(['media', 'supports', 'container']);
function functionBody31(protos, body, sheet, parent) {
  const rules = [];
  let run = '';
  const flush = () => {
    const rule = run === '' ? null : functionDeclarations(protos, run, sheet, parent);
    run = '';
    if (rule !== null) rules.push(rule);
  };
  for (const item of parseBlockContents31(body ?? '', 'result')) {
    // (a ; between them, none after the last: --x: [a at the end of the
    // sheet is [a], as parsed; #353 review)
    if (item.decl !== null) {
      run += run === '' ? item.text : `;${item.text}`;
      continue;
    }
    const [record] = parseRules(item.rule, false, nestedBlocks(protos), true);
    const rule = record === undefined ? null : functionCondition(protos, record, sheet, parent);
    if (rule === null) continue;
    flush();
    rules.push(rule);
  }
  flush();
  return rules;
}
function functionCondition(protos, record, sheet, parent) {
  if (record.body === null || !FUNCTION_CONDITIONS.has(record.at)) return null;
  const rule = createRule(protos, { ...record, body: '' }, sheet, parent);
  if (rule === null) return null;
  rule[S].functionBody = true;
  rule[S].rules = functionBody31(protos, record.body, sheet, rule);
  return rule;
}
// A CSSFunctionDeclarations of the declarations, or null when none is valid.
function functionDeclarations(protos, text, sheet, parent) {
  const rule = makeRule(protos, 'CSSFunctionDeclarations', sheet, parent, {});
  rule[S].style = declarationBlock(protos.CSSFunctionDescriptors, text, rule);
  return rule[S].style.length === 0 ? null : rule;
}

// (the whole at-keyword: a name character or an escape after it makes
// another name, so @font-feature-valuesé and @font-feature-values\41 are
// unknown rules; #344 review. Its escapes are read: @f\75nction is
// @function, as jsdom 31 reads them; #353 review. A hex escape is all its
// digits, six at most, so the name is read one way only.)
const RAW_AT =
  /^@((?:[\w\u0080-\uffff-]|\\(?:(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{1,5}(?![0-9a-fA-F]))(?:\r\n|[ \t\n\r\f])?|[^\n\r\f0-9a-fA-F]))+)/;
const atName = (m) => readEscapes(m[1]).replace(/[A-Z]+/g, (c) => c.toLowerCase());
const newerRule31 = (at) => (Object.hasOwn(NEWER_RULES31, at) ? NEWER_RULES31[at] : null);

// The own length getter and indexed getters of a CSSKeyframesRule in jsdom
// 27.1.0 to 28 (named get, as jsdom's); one getter per index, shared.
function keyframesLength() {
  return this.cssRules.length;
}
Object.defineProperty(keyframesLength, 'name', { value: 'get' });
const KEYFRAME_GETTERS = [];
function keyframeGetter(i) {
  let get = KEYFRAME_GETTERS[i];
  if (get === undefined) {
    get = function () {
      return this.cssRules[i];
    };
    Object.defineProperty(get, 'name', { value: 'get' });
    KEYFRAME_GETTERS[i] = get;
  }
  return get;
}

function keyframe(protos, record, sheet, parentRule) {
  if (record.selector === undefined) return null;
  const key = keyText(record.selector);
  if (key === null) return null;
  const rule = makeRule(protos, 'CSSKeyframeRule', sheet, parentRule, { keyText: key });
  rule[S].style = declarationBlock(protos.CSSStyleProperties, record.body, rule);
  return rule;
}

// The keyframes a CSSKeyframesRule's appendRule(), deleteRule(), findRule()
// and cssText use: in jsdom 27.1.0 to 28 (black box 27.4.0, 28.1.0) its
// cssRules property, which a test can replace with an array or anything
// else (methods the value lacks then throw TypeErrors, as there); the own
// indices keep following the original list (indexKeyframes). Another
// rule's or a sheet's CSSRuleList is that owner's rules, which the two
// then share (black box 27.4.0, 28.1.0: appendRule() and deleteRule()
// change the other keyframes rule's length, indices and text too).
function keyframeRules(rule) {
  const s = rule[S];
  if (ACEMIR_RULES.has(s.protos.CSSRule)) {
    const own = rule.cssRules;
    if (own !== s.ruleList) return own?.[S]?.owner?.rules ?? own;
  }
  return s.rules;
}

// After appendRule() or deleteRule(): the indices of the rule and of the
// keyframes rule whose list it was assigned, if any.
function keyframesChanged(rule) {
  indexKeyframes(rule);
  const shared = ACEMIR_RULES.has(rule[S].protos.CSSRule) ? rule.cssRules?.[S]?.rule : undefined;
  if (shared !== undefined && shared !== rule && shared[S].indexed !== undefined) indexKeyframes(shared);
  cssomChanges.rev++;
}

// The index of the last keyframe of a list (or array-like) with a key.
function findKeyframe(list, key) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.[S]?.keyText === key) return i;
  return -1;
}

// CSSKeyframesRule's indexed getter: own properties, rebuilt when its
// keyframes change (rare). In jsdom 27.1.0 to 28 (black box 27.4.0,
// 28.1.0) getters of this.cssRules[i], not enumerable.
function indexKeyframes(rule) {
  const s = rule[S];
  const acemir = ACEMIR_RULES.has(s.protos.CSSRule);
  for (let i = 0; i < s.rules.length; i++)
    Object.defineProperty(
      rule,
      i,
      acemir
        ? { get: keyframeGetter(i), enumerable: false, configurable: true }
        : { value: s.rules[i], enumerable: true, configurable: true },
    );
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
      if (s.selectorText === '') return '';
      // cssom's (jsdom before 27.1.0): .a {color: red;}
      if (legacyRules(s.protos)) return `${s.selectorText} {${cssomStyle(rule).cssText}}`;
      return `${s.selectorText} ${styleText(s.style)}`;
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
    case s.protos.CSSKeyframesRule: {
      // (jsdom 27.1.0 to 28: its own name property, which can be assigned)
      const name = ACEMIR_RULES.has(s.protos.CSSRule) ? String(rule.name) : s.name;
      const frames = keyframeRules(rule).map(ruleText);
      // (jsdom 31: each keyframe on a line of its own, not indented; black
      // box, 31.0.1)
      if (RULES31.has(s.protos.CSSRule))
        return `@keyframes ${keyframesName(name)} {\n${frames.map((f) => `${f}\n`).join('')}}`;
      return `@keyframes ${keyframesName(name)} { ${frames.join(' ')} }`;
    }
    case s.protos.CSSKeyframeRule:
      return `${s.keyText} ${styleText(s.style)}`;
    case s.protos.CSSNamespaceRule:
      return `@namespace ${s.prefix ? `${s.prefix} ` : ''}url(${serializeString(s.namespaceURI)});`;
    case s.protos.CSSStartingStyleRule:
      return `@starting-style ${nested(ruleArray(rule))}`;
    case s.protos.CSSFontFeatureValuesRule:
      return fontFeatureValuesText(s.data);
    case s.protos.CSSFontPaletteValuesRule:
      return fontPaletteValuesText(s.data);
    case s.protos.CSSPositionTryRule:
      return `@position-try ${s.name} ${styleText(s.style)}`;
    case s.protos.CSSViewTransitionRule:
      return viewTransitionText(s.data);
    case s.protos.CSSPropertyRule:
      return propertyRuleText(s.data);
    case s.protos.CSSFunctionRule: {
      const rules = ruleArray(rule);
      return `${functionPreludeText31(s.data)} ${rules.length ? `{ ${rules.map(ruleText).join(' ')} }` : '{ }'}`;
    }
    case s.protos.CSSFunctionDeclarations:
      return serializeDeclarations(s.style);
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
    s.ruleList[S].rule = owner;
  }
  return s.ruleList;
}

// CSSOM's insert a CSS rule. `nested` for a grouping rule's list, where
// @import and @namespace rules are not allowed.
function insertRule(owner, text, index, sheet, parentRule, nested) {
  const s = owner[S];
  const list = ruleArray(owner);
  const i = index === undefined ? 0 : index >>> 0;
  if (RULES31.has(s.protos.CSSRule)) return insertRule31(owner, String(text), i, sheet, parentRule, nested);
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

// jsdom 31's (black box, 31.0.1): its messages; the index checked first;
// the rule parsed with <!-- and --> as tokens; @layer statements may come
// before @import and @namespace rules, though after them only where
// nothing else is before (a sheet's leading ones).
function insertRule31(owner, text, i, sheet, parentRule, nested) {
  const s = owner[S];
  const list = ruleArray(owner);
  if (i > list.length)
    throw domError(`Cannot insert a rule at index ${i} in a list of ${list.length} rules.`, 'IndexSizeError');
  if (s.functionBody === true) return insertFunctionRule31(owner, text, i, sheet, parentRule);
  const records = parseRules(text, true, nestedBlocks(s.protos), true, false);
  if (records.length === 0) throw domError('Cannot parse missing rule', 'SyntaxError');
  // (the first rule read before what follows it: {} a{} is invalid)
  const [record] = records;
  const rule = record.invalid ? null : createRule(s.protos, record, sheet, parentRule);
  if (!rule) {
    // (a palette's name taken, its descriptors not)
    const palette = record.at === 'font-palette-values' && record.prelude.startsWith('--');
    throw domError(palette ? 'Invalid @font-palette-values' : 'Cannot parse invalid rule', 'SyntaxError');
  }
  if (records.length > 1) throw domError('Cannot parse more than a single rule', 'SyntaxError');
  if (isImport(rule)) rule[S].inserted = true;
  const before = list.slice(0, i);
  const after = list.slice(i);
  const prefix = (r) => isImport(r) || isNamespace(r);
  if (nested && prefix(rule))
    throw domError('Cannot insert this rule inside the parent grouping rule.', 'HierarchyRequestError');
  let misplaced;
  if (isImport(rule)) misplaced = before.some((r) => !isImport(r) && !isLayerStatement(r));
  else if (isNamespace(rule))
    misplaced = before.some((r) => !prefix(r) && !isLayerStatement(r)) || after.some(isImport);
  else if (isLayerStatement(rule)) misplaced = after.some(prefix) && before.some((r) => !isLayerStatement(r));
  else misplaced = after.some(prefix);
  if (misplaced)
    throw domError(
      `Cannot insert this rule at index ${i} because it would violate the stylesheet's rule order.`,
      'HierarchyRequestError',
    );
  if (isNamespace(rule) && list.some((r) => !prefix(r) && !isLayerStatement(r)))
    throw domError(
      'Cannot insert @namespace when rules other than @import or @namespace already exist.',
      'InvalidStateError',
    );
  list.splice(i, 0, rule);
  cssomChanges.rev++;
  ruleListsChanged(s.protos);
  return i;
}

// Into an @function or a rule in its block (black box, 31.0.1): valid
// declarations, as a CSSFunctionDeclarations, or an @media, @supports or
// @container rule; another rule is a HierarchyRequestError.
function insertFunctionRule31(owner, text, i, sheet, parentRule) {
  const s = owner[S];
  // (read as declarations first: a rule before them is junk up to the
  // semicolon and an at-rule among them is dropped, so "@media print{}
  // --x: 1" inserts --x; with no declaration, as one rule; #353 review)
  let rule = null;
  if (parseBlockContents31(text, 'result').some((item) => item.decl !== null))
    rule = functionDeclarations(s.protos, text, sheet, parentRule);
  if (rule === null) {
    const records = parseRules(text, true, nestedBlocks(s.protos), true, false);
    if (records.length === 0) throw domError('Cannot parse missing rule', 'SyntaxError');
    const [record] = records;
    const made = record.invalid ? null : createRule(s.protos, record, sheet, parentRule);
    if (!made) throw domError('Cannot parse invalid rule', 'SyntaxError');
    const allowed = FUNCTION_CONDITIONS.has(record.at);
    // (after a rule it does not take, another one is invalid: a{} b{})
    if (records.length > 1)
      throw domError(allowed ? 'Cannot parse more than a single rule' : 'Cannot parse invalid rule', 'SyntaxError');
    rule = allowed ? functionCondition(s.protos, record, sheet, parentRule) : null;
    if (rule === null)
      throw domError('Cannot insert this rule inside the parent grouping rule.', 'HierarchyRequestError');
  }
  ruleArray(owner).splice(i, 0, rule);
  cssomChanges.rev++;
  ruleListsChanged(s.protos);
  return i;
}

function deleteRule(owner, index) {
  const list = ruleArray(owner);
  const i = index >>> 0;
  if (RULES31.has(owner[S].protos.CSSRule)) {
    if (i >= list.length)
      throw domError(`Cannot delete a rule at index ${i} from a list of ${list.length} rules.`, 'IndexSizeError');
    if (isNamespace(list[i]) && list.some((r) => !isImport(r) && !isNamespace(r) && !isLayerStatement(r)))
      throw domError(
        'Cannot delete @namespace when rules other than @import or @namespace already exist.',
        'InvalidStateError',
      );
    const rule = list[i];
    list.splice(i, 1);
    cssomChanges.rev++;
    ruleListsChanged(owner[S].protos);
    detach(rule);
    return;
  }
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

// A jsdom 31 @scope prelude as written, read as its CSSScopeRule's data
// (prelude, start, end, each serialized, and the texts to match by), or
// null: ( selector ) with balanced parentheses, then to ( selector ).
function scopePrelude31(text) {
  let i = 0;
  // (comments too: the text as written, with them)
  const comment = () => {
    const close = text.indexOf('*/', i + 2);
    i = close < 0 ? text.length : close + 2;
  };
  const ws = () => {
    for (;;) {
      if (i < text.length && /[ \t\n\r\f]/.test(text[i])) i++;
      else if (text.startsWith('/*', i)) comment();
      else return;
    }
  };
  const group = () => {
    if (text[i] !== '(') return undefined;
    const start = i + 1;
    let depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '\\') i++;
      else if (c === '/' && text[i + 1] === '*') {
        comment();
        i--;
      } else if (c === '"' || c === "'") {
        i++;
        while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      } else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) {
        i++;
        return text.slice(start, i - 1);
      }
    }
    return null;
  };
  ws();
  const start = group();
  if (start === null) return null;
  ws();
  let end;
  if (/^to(?![\w-]|\()/i.test(text.slice(i))) {
    i += 2;
    ws();
    end = group();
    if (end === undefined || end === null) return null;
    ws();
  }
  if (i !== text.length) return null;
  // (selectors the engine knows, serialized: ((.a)) drops the rule, a
  // pseudo-element too; an end may be relative, to (> p); black box,
  // 31.0.1)
  const from = start === undefined ? null : scopeSelector31(start, false);
  const to = end === undefined ? null : scopeSelector31(end, true);
  if (from === false || to === false) return null;
  const prelude = [from === null ? '' : `(${from.text})`, to === null ? '' : `to (${to.text})`].filter(Boolean);
  return {
    prelude: prelude.join(' '),
    start: from?.text ?? null,
    end: to?.text ?? null,
    match: { start: from?.match ?? null, end: to?.match ?? null },
  };
}

// --- media lists ----------------------------------------------------------------------

// jsdom 31 (conditions31.js): its queries written and evaluated as Media
// Queries 4 and 5 have them; sources keeps each one as given, which is
// what is evaluated.
const MEDIA31 = new WeakSet();
function mediaList(protos, text) {
  const items = [];
  const list = liveList(protos.MediaList, () => items);
  list[S].list = items;
  list[S].sources = MEDIA31.has(protos.MediaList) ? [] : null;
  if (list[S].sources !== null && !mediaStep) addMediaStep();
  setMediaText(list, text);
  return list;
}

function setMediaText(list, text) {
  const { list: items, sources } = list[S];
  // (converted first: a value whose toString() throws leaves the list)
  const value = String(text ?? '');
  items.length = 0;
  if (sources !== null) sources.length = 0;
  if (value.trim() === '') return;
  for (const medium of splitMedia(value)) {
    if (sources === null) items.push(normalizeMedium(medium));
    else {
      items.push(serializeMedium31(medium.trim()));
      sources.push(medium.trim());
    }
  }
}

// Whether a supports rule's condition holds (jsdom 31: conditions31.js).
export function supportsMatches(rule) {
  const s = rule[S];
  if (s.supports31 === null || s.supports31 === undefined) return supportsRuleMatches(s.conditionText);
  // (jsdom 31's selector(): selectors.js supportsSelector31)
  return supportsHold31(s.supports31, supportsDeclarationOf(s.protos), supportsSelector31);
}

// Whether a media list matches: as jsdom 31 evaluates queries; before,
// as jsdom 29 and 30 do (no media features: an empty list, all or screen).
// doc: the document whose color scheme prefers-color-scheme reads.
// readsScheme: called when the answer depends on that scheme.
export function mediaMatches(list, doc = null, readsScheme = null) {
  const { list: items, sources } = list[S];
  if (items.length === 0) return true;
  if (sources !== null) {
    let dark;
    const isDark = () => {
      readsScheme?.();
      return (dark ??= darkScheme(doc));
    };
    for (const source of sources) if (mediumMatches31(source, isDark)) return true;
    return false;
  }
  return items.includes('all') || items.includes('screen');
}

// Whether a document's color scheme is dark (black box, 31.0.1): its first
// meta name=color-scheme lists dark and not light (dark, only dark; light
// dark is light).
function darkScheme(doc) {
  if (doc === null) return false;
  for (let n = doc[S].first; n; n = nextInTree(n, doc)) {
    const s = n[S];
    if (s.type !== ELEMENT_NODE || s.tag !== 'meta' || s.ns !== HTML_NS) continue;
    if (s.attrs.get('name')?.toLowerCase() !== 'color-scheme') continue;
    const words = (s.attrs.get('content') ?? '').toLowerCase().split(/[ \t\n\r\f]+/);
    return words.includes('dark') && !words.includes('light');
  }
  return false;
}

// The document a rule's sheet belongs to, or null.
function ruleDocument(rule) {
  for (let sheet = rule[S].sheet; sheet; sheet = sheet[S].parentSheet) {
    const owner = sheet[S].ownerNode;
    if (owner) return owner[S].type === 9 ? owner : owner[S].doc;
  }
  return null;
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
    // (a constructed sheet's: the document of the window that made it,
    // the only one that can adopt it)
    constructorDoc: null,
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
// Also null in a document without a browsing context (createHTMLDocument,
// DOMParser, createDocument, new Document()), as in jsdom (black box,
// 20.0.3 to 30.1.3: no sheet and an empty document.styleSheets), so
// getComputedStyle() applies no sheet rules to that document's elements
// (#203). Moved into a document with a window, it gets a sheet.
export function styleElementSheet(el) {
  const s = el[S];
  if (
    !isConnected(el) ||
    s.doc[S].noView === true ||
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

// jsdom 31 (black box, 31.0.1): a style element's media attribute, when
// set, sets its sheet's media in place, even to the value it had (its
// title stays). Registered with the first jsdom 31 media list (the
// attribute module is in an import cycle with this one).
let mediaStep = false;
function addMediaStep() {
  mediaStep = true;
  addAttributeStep('media', (el, old, value) => {
    const s = el[S];
    const sheet = s.tag === 'style' && s.ns === HTML_NS ? s.sheet : undefined;
    if (!sheet || sheet[S].media[S].sources === null) return;
    setMediaText(sheet[S].media, value ?? '');
    cssomChanges.rev++;
  });
}

const isStyleElement = (n) => n[S].type === ELEMENT_NODE && n[S].tag === 'style' && n[S].ns === HTML_NS;

const byStamp = (a, b) => (a[S].sheetStamp ?? 0) - (b[S].sheetStamp ?? 0);

// The <style> elements of the document and its shadow trees in tree order:
// when there are any in shadow trees, as records { el } (for
// shadowIncludingOrder).
// (scoped: jsdom 31, the tree's own <style> elements only)
function styleElementsOf(doc, scoped = false) {
  const records = [];
  let inShadow = false;
  const walk = (root) => {
    for (let n = root[S].first; n; n = nextInTree(n, root)) {
      const s = n[S];
      if (s.type !== ELEMENT_NODE) continue;
      if (s.tag === 'style' && s.ns === HTML_NS) records.push(n);
      if (s.shadowRoot != null && !scoped) {
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
    const scoped = ds.window[S].compat.treeScopedSheets === true;
    ds.styleSheetList = liveList(ds.window[S].protos.StyleSheetList, () => {
      const rev = ds.treeRev ?? 0;
      const textRev = ds.styleRev ?? 0;
      if (ds.styleSheetsRev === rev && ds.styleSheetsTextRev === textRev) return ds.styleSheets;
      // (by creation too with shadow trees' sheets)
      const styleRev = byCreation || ds.shadowStyleSheets === true ? textRev : 0;
      if (ds.styleElementsRev !== rev || ds.styleElementsStyleRev !== styleRev) {
        let els = styleElementsOf(doc, scoped);
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

// A shadow root's styleSheets (jsdom 31, black box 31.0.1): its own tree's
// <style> sheets in tree order, not its nested shadow trees'; kept until
// the tree or a style element's text changes, as the document's.
export function shadowStyleSheets(root) {
  const rs = root[S];
  if (!rs.styleSheetList) {
    // (the root's document when read: its host may move to another one)
    rs.styleSheetList = liveList(rs.doc[S].window[S].protos.StyleSheetList, () => {
      const ds = rs.doc[S];
      const rev = ds.treeRev ?? 0;
      const textRev = ds.styleRev ?? 0;
      if (rs.styleSheetsDoc === ds && rs.styleSheetsRev === rev && rs.styleSheetsTextRev === textRev)
        return rs.styleSheets;
      rs.styleSheets = styleElementsOf(root, true).map(styleElementSheet).filter(Boolean);
      rs.styleSheetsDoc = ds;
      rs.styleSheetsRev = rev;
      rs.styleSheetsTextRev = textRev;
      return rs.styleSheets;
    });
  }
  return rs.styleSheetList;
}

// adoptedStyleSheets (jsdom 31, black box 31.0.1; CSSOM, WebIDL observable
// arrays): a Document's or ShadowRoot's list of constructed sheets, which
// its tree's rules read after its <style> sheets (cascade.js sheetIndex).
// The list is an array behind a proxy, the same one for the node's life:
// an index up to the length takes a constructed sheet of the node's
// document (made by its window), the length only shrinks, only the last
// index can be deleted. A shadow root's empties when its host moves to
// another document (internal.js adoptTree). The cascade reads the array
// (items) itself.
export function adoptedStyleSheets(node, iface) {
  const s = node[S];
  return (s.adopted ??= newAdopted(node, iface)).array;
}
// The setter: an iterable of sheets (all checked first), then each set in
// turn, so that a sheet that cannot be adopted leaves the ones before it.
export function setAdoptedStyleSheets(node, iface, value) {
  const failed = `Failed to set the 'adoptedStyleSheets' property on '${iface}': `;
  if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
    throw new TypeError(`${failed}The provided value is not an iterable object.`);
  // (one lookup of the iterator, by for...of; named for jsdom's message,
  // "tmp is not iterable")
  const tmp = value;
  const list = [];
  for (const sheet of tmp) {
    if (!isSheet(sheet)) throw new TypeError(`${failed}The provided value's element is not of type 'CSSStyleSheet'.`);
    list.push(sheet);
  }
  const s = node[S];
  const { items } = (s.adopted ??= newAdopted(node, iface));
  items.length = 0;
  cssomChanges.rev++;
  for (let i = 0; i < list.length; i++) setAdopted(node, iface, items, i, list[i]);
}
function newAdopted(node, iface) {
  const items = [];
  const array = new Proxy(items, {
    set(target, key, value, receiver) {
      const i = arrayIndex(key);
      if (i >= 0) return setAdopted(node, iface, items, i, value);
      if (key === 'length') return setAdoptedLength(items, value);
      // (an accessor's this is the public array, so its changes go
      // through these traps)
      return Reflect.set(target, key, value, receiver);
    },
    defineProperty(target, key, descriptor) {
      const i = arrayIndex(key);
      if (i >= 0) {
        if (!('value' in descriptor) || descriptor.configurable === false || descriptor.enumerable === false)
          return false;
        if (descriptor.writable === false) return false;
        return setAdopted(node, iface, items, i, descriptor.value);
      }
      if (key === 'length') {
        if ('get' in descriptor || 'set' in descriptor) return false;
        // (length stays writable, not enumerable, not configurable)
        if (descriptor.configurable === true || descriptor.enumerable === true || descriptor.writable === false)
          return false;
        return 'value' in descriptor ? setAdoptedLength(items, descriptor.value) : true;
      }
      return Reflect.defineProperty(target, key, descriptor);
    },
    deleteProperty(target, key) {
      const i = arrayIndex(key);
      if (i < 0) return Reflect.deleteProperty(target, key);
      if (i !== items.length - 1) return false;
      items.length = i;
      cssomChanges.rev++;
      return true;
    },
    // (the list stays extensible)
    preventExtensions() {
      return false;
    },
  });
  return { items, array };
}
// (a property key's array index, or -1)
function arrayIndex(key) {
  if (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key)) return -1;
  const i = Number(key);
  return i < 4294967295 ? i : -1;
}
function setAdopted(node, iface, items, i, sheet) {
  if (i > items.length) return false;
  if (!isSheet(sheet))
    throw new TypeError(
      `Failed to modify the 'adoptedStyleSheets' observable array on '${iface}': The provided value is not of type 'CSSStyleSheet'.`,
    );
  const doc = node[S].type === DOCUMENT_NODE ? node : node[S].doc;
  if (!sheet[S].constructed || sheet[S].constructorDoc !== doc)
    throw domError('Only constructed stylesheets from the same document can be adopted.', 'NotAllowedError');
  // (an own data property: a setter for the index on Array.prototype
  // must not take the write)
  Object.defineProperty(items, i, { value: sheet, writable: true, enumerable: true, configurable: true });
  cssomChanges.rev++;
  return true;
}
function setAdoptedLength(items, value) {
  // (WebIDL's conversion: a BigInt primitive is refused, an object
  // wrapping one converts)
  if (typeof value === 'bigint') throw new TypeError('Value is a BigInt which cannot be converted to a number.');
  const length = Number(value) >>> 0;
  if (length !== Number(value)) throw new RangeError('Invalid array length');
  if (length > items.length) return false;
  if (length < items.length) {
    items.length = length;
    cssomChanges.rev++;
  }
  return true;
}
// (a style sheet of any window: its state has the constructed flag)
const isSheet = (value) => value !== null && typeof value === 'object' && typeof value[S]?.constructed === 'boolean';

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
// @@iterator before jsdom 29. That one (black box 27.4.0, 28.1.0) takes
// this.cssRules when called and returns a plain object with next(),
// without @@iterator, that reads that list's length and item at each step,
// gives { done: true } at its end and goes on if keyframes are added
// later. Called without a this value it takes the global object's.
const [sheetText, keyframesIterator] = [
  function () {
    state(this);
    return rules(this)
      .map((rule) => `${ruleText(rule)}\n`)
      .join('');
  },
  function () {
    const list = (this ?? globalThis).cssRules;
    let index = 0;
    return {
      next() {
        return index < list.length ? { value: list[index++], done: false } : { done: true };
      },
    };
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
// Members that are each rule's own in the @acemir/cssom shape (makeRule).
const ACEMIR_OWN = { CSSKeyframesRule: ['name', 'cssRules', 'length'] };

// The descriptors of a rule interface (or CSSStyleSheet) for a shape
// variant, once per module load.
function adjustRule(name, descriptors, variant) {
  for (const key of NEWER_MEMBERS[name] ?? []) delete descriptors[key];
  if (variant === 'acemir') for (const key of ACEMIR_OWN[name] ?? []) delete descriptors[key];
  return Object.assign(descriptors, (variant === 'cssom' ? CSSOM_SHAPE : ACEMIR_SHAPE)[name]);
}

export const CSSOM_INTERFACES = [
  {
    name: 'CSSRule',
    statics: (compat) => RULE_STATICS[compat.cssomShape] ?? RULE_TYPES,
    compat(proto, compat) {
      if (compat.cssomObjectValues === false) OBJECTS_DROPPED.add(proto);
      if (ruleVariant(compat) === 'cssom') LEGACY_RULES.add(proto);
      else if (compat.cssomShape === null) OWN_CSSOM.add(proto);
      else ACEMIR_RULES.add(proto);
      if (compat.jsdom >= 31) RULES31.add(proto);
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
          case p.CSSFontFeatureValuesRule:
            return 14;
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
          return mediaMatches(state(this).media, ruleDocument(this));
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
        return supportsMatches(this);
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
      get conditions() {
        return state(this).conditions;
      },
    },
    // (conditions: jsdom 31's)
    compat(proto, compat) {
      if (!(compat.jsdom >= 31)) delete proto.conditions;
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
  // jsdom 31's newer rules (rules31.js; hidden before, window-features.js
  // LATER_GLOBALS).
  { name: 'CSSStartingStyleRule', parent: 'CSSGroupingRule', members: {} },
  {
    name: 'CSSFontFeatureValuesRule',
    parent: 'CSSRule',
    members: {
      get fontFamily() {
        return serializeFamilies(state(this).data.families);
      },
      // (a valid family list only)
      set fontFamily(v) {
        const names = familyNames(String(v));
        if (names !== null) state(this).data.families = names;
      },
    },
  },
  {
    name: 'CSSFontPaletteValuesRule',
    parent: 'CSSRule',
    members: {
      get name() {
        return state(this).data.name;
      },
      get fontFamily() {
        return serializeFamilies(state(this).data.families);
      },
      get basePalette() {
        return state(this).data.basePalette;
      },
      get overrideColors() {
        return state(this).data.overrideColors;
      },
    },
  },
  {
    name: 'CSSPositionTryRule',
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
    name: 'CSSViewTransitionRule',
    parent: 'CSSRule',
    members: {
      get navigation() {
        return state(this).data.navigation;
      },
      // (the same frozen array each time)
      get types() {
        const s = state(this);
        const types = s.data.types;
        return (s.types ??= Object.freeze(types === null || types === 'none' ? [] : types.slice()));
      },
    },
  },
  {
    name: 'CSSPropertyRule',
    parent: 'CSSRule',
    members: {
      get inherits() {
        return state(this).data.inherits;
      },
      get initialValue() {
        return state(this).data.initial;
      },
      // (a rule for a list of names has none)
      get name() {
        const names = state(this).data.names;
        return names.length === 1 ? names[0] : '';
      },
      // (jsdom 31's: the same array each time)
      get names() {
        const s = state(this);
        return (s.names ??= s.data.names.slice());
      },
      get syntax() {
        return state(this).data.syntax.text;
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
        // (jsdom 31: a selector it takes, serialized; comments dropped, a
        // U+00A0 kept: #269 part F3a)
        if (RULES31.has(s.protos.CSSRule)) {
          const written = String(v);
          const text = ruleSelector31(written);
          if (text !== null) {
            s.selectorText = text;
            s.matchText = matchText31(written, text);
            cssomChanges.rev++;
          }
          return;
        }
        const t = String(v).trim();
        if (validSelector(t)) {
          s.selectorText = t;
          cssomChanges.rev++;
        }
      },
      get style() {
        const s = state(this);
        return legacyRules(s.protos) ? cssomStyle(this) : s.style;
      },
      set style(v) {
        const s = state(this);
        (legacyRules(s.protos) ? cssomStyle(this) : s.style).cssText = v;
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
          keyframeRules(this).push(rule);
          keyframesChanged(this);
        }
      },
      deleteRule(select) {
        state(this);
        required(arguments.length, 1, 'CSSKeyframesRule', 'deleteRule');
        const key = keyText(select);
        const list = keyframeRules(this);
        const i = key === null ? -1 : findKeyframe(list, key);
        if (i < 0) return;
        const [rule] = list.splice(i, 1);
        detach(rule);
        keyframesChanged(this);
      },
      findRule(select) {
        required(arguments.length, 1, 'CSSKeyframesRule', 'findRule');
        const key = keyText(select);
        if (key === null) return null;
        state(this);
        const list = keyframeRules(this);
        const i = findKeyframe(list, key);
        return i < 0 ? null : list[i];
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
      if (jsdom >= 31) MEDIA31.add(proto);
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
        const sources = state(this).sources;
        const m = sources === null ? normalizeMedium(queries[0]) : serializeMedium31(queries[0].trim());
        // (jsdom 31 compares the queries as written)
        const key = sources === null ? mediumKey : same;
        if (!list.some((q) => key(q) === key(m))) {
          list.push(m);
          sources?.push(queries[0].trim());
          cssomChanges.rev++;
        }
      },
      // CSSOM: removes every query equal to the one given.
      deleteMedium(medium) {
        const list = state(this).list;
        required(arguments.length, 1, 'MediaList', 'deleteMedium');
        const sources = state(this).sources;
        // (jsdom 31: converted once; an argument of more than one query
        // removes nothing)
        if (sources !== null) medium = String(medium);
        if (sources !== null && splitMedia(medium).length !== 1) return;
        const key = sources === null ? mediumKey : same;
        const m = key(sources === null ? normalizeMedium(medium) : serializeMedium31(medium.trim()));
        let removed = false;
        for (let i = list.length - 1; i >= 0; i--)
          if (key(list[i]) === m) {
            list.splice(i, 1);
            sources?.splice(i, 1);
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
        constructorDoc: w.document,
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
  // CSS Mixins 1's @function rules (#269 part G1b; hidden before jsdom 31,
  // window-features.js LATER_GLOBALS).
  {
    name: 'CSSFunctionRule',
    parent: 'CSSGroupingRule',
    members: {
      getParameters() {
        return functionParameters31(state(this).data);
      },
      get name() {
        return state(this).data.name;
      },
      get returnType() {
        return state(this).data.returns.text;
      },
    },
  },
  {
    name: 'CSSFunctionDeclarations',
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
  // CSS Pseudo-Elements 4 (CSSOM's pseudo-element object), as jsdom 31
  // has it (black box, 31.0.1): an interface of its own (no EventTarget),
  // with no way to get one (no Element.prototype.pseudo); its global from
  // jsdom 31 (window-features.js LATER_GLOBALS).
  {
    name: 'CSSPseudoElement',
    members: {
      // (no nested pseudo-elements)
      pseudo(type) {
        pseudoState(this);
        required(arguments.length, 1, 'CSSPseudoElement', 'pseudo');
        void type;
        return null;
      },
      get type() {
        return pseudoState(this).pseudo;
      },
      get element() {
        return pseudoState(this).element;
      },
      get parent() {
        return pseudoState(this).element;
      },
      get selectorText() {
        return pseudoState(this).pseudo;
      },
    },
  },
];

// A CSSPseudoElement's state; nothing makes one yet, so any receiver is
// an illegal one (#352 review).
function pseudoState(object) {
  const s = state(object);
  if (s.pseudoElement !== true) throw new TypeError('Illegal invocation');
  return s;
}

// The rule interfaces and CSSStyleSheet take their shape from the profile
// (compat.cssomShape): descriptors per variant, built once per module load.
for (const iface of CSSOM_INTERFACES) {
  const { name } = iface;
  if (!(name in CSSOM_SHAPE || name in ACEMIR_SHAPE)) continue;
  iface.variant = ruleVariant;
  iface.adjust = (descriptors, variant) => adjustRule(name, descriptors, variant);
}
