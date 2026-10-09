// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import { S, state, domError, ELEMENT_NODE } from './internal.js';
import { STYLE_ACCESSORS } from './css-properties.js';

// backgroundColor -> background-color, webkitAnimation/WebkitAnimation ->
// -webkit-animation, cssFloat -> float; dashed names map to themselves.
function cssName(accessor) {
  if (accessor === 'cssFloat') return 'float';
  if (accessor.includes('-')) return accessor;
  const dashed = accessor.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return /^(webkit|-webkit)-/.test(dashed) ? `-${dashed.replace(/^-/, '')}` : dashed;
}

// Split on `sep` outside parentheses and quotes (url(data:...;base64,...)).
function splitOutside(text, sep) {
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseInto(decls, text) {
  decls.clear();
  for (const part of splitOutside(String(text ?? ''), ';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    let important = false;
    const bang = value.match(/\s*!\s*important\s*$/i);
    if (bang) { important = true; value = value.slice(0, bang.index).trim(); }
    if (name && value) decls.set(name, { value, important });
  }
}

function serialize(decls) {
  let out = '';
  for (const [name, { value, important }] of decls) out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
  return out;
}

// Write the declarations back to the element's style attribute.
function sync(style) {
  const s = state(style);
  if (s.element) s.element[S].attrs.set('style', serialize(s.decls));
}

// --- computed style ---------------------------------------------------------
// Computed only for the properties that are read: inline value, else the
// nearest ancestor's for inherited properties, else the default. Rules from
// style sheets are not applied yet.

const INHERITED = new Set(['visibility', 'color', 'cursor', 'pointer-events', 'direction', 'font', 'font-family',
  'font-size', 'font-style', 'font-weight', 'font-variant', 'letter-spacing', 'line-height', 'list-style',
  'list-style-type', 'quotes', 'text-align', 'text-indent', 'text-transform', 'white-space', 'word-spacing',
  'writing-mode', 'caret-color', 'user-select', 'border-collapse', 'empty-cells', 'caption-side']);

const INITIAL = { visibility: 'visible', 'pointer-events': 'auto', cursor: 'auto', direction: 'ltr', color: 'rgb(0, 0, 0)' };

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

function inlineValue(element, name) {
  const es = element[S];
  if (es.style) return es.style[S].decls.get(name)?.value;
  const attr = es.attrs.get('style');
  if (!attr || !attr.includes(name)) return undefined;
  const decls = new Map();
  parseInto(decls, attr);
  return decls.get(name)?.value;
}

function computedValue(element, name) {
  const inline = inlineValue(element, name);
  if (inline !== undefined && inline !== 'inherit') return inline;
  if (INHERITED.has(name) || inline === 'inherit') {
    const parent = element[S].parent;
    if (parent && parent[S].type === ELEMENT_NODE) return computedValue(parent, name);
    return INITIAL[name] ?? '';
  }
  if (name === 'display') {
    const es = element[S];
    if (es.attrs.has('hidden')) return 'none';
    return DEFAULT_DISPLAY.get(es.tag) ?? 'inline';
  }
  return INITIAL[name] ?? '';
}

// --- the CSS namespace ---------------------------------------------------------

// CSS.escape(): serialize an identifier (CSSOM).
export function escapeIdentifier(value) {
  const input = String(value);
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    const ch = input[i];
    if (c === 0) out += '\ufffd';
    else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f
      || (i === 0 && c >= 0x30 && c <= 0x39)
      || (i === 1 && c >= 0x30 && c <= 0x39 && input.charCodeAt(0) === 0x2d)) out += `\\${c.toString(16)} `;
    else if (i === 0 && ch === '-' && input.length === 1) out += `\\${ch}`;
    else if (c >= 0x80 || ch === '-' || ch === '_' || /[0-9A-Za-z]/.test(ch)) out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

let knownProperties = null;
const isKnownProperty = (name) => {
  knownProperties ??= new Set(STYLE_ACCESSORS.map(cssName));
  return name.startsWith('--') || knownProperties.has(name.toLowerCase());
};

// CSS.supports(property, value): a supported property with a value. Values
// are not validated (no CSS value parser yet).
const supportsDeclaration = (property, value) => isKnownProperty(String(property).trim()) && String(value).trim() !== '';

// A <supports-condition> (CSS Conditional Rules): not / and / or, (decl),
// nested conditions and selector(); unknown syntax is false.
function supportsCondition(text, matchesSelector) {
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? '')) i++; };
  const group = () => {
    // Text up to the matching closing parenthesis.
    let depth = 1;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    return depth === 0 ? text.slice(start, i - 1) : null;
  };
  const inParens = () => {
    ws();
    if (text.startsWith('not ', i) || text.startsWith('not(', i)) { i += 3; return !inParens(); }
    if (/^selector\(/i.test(text.slice(i))) {
      i += 9;
      const inner = group();
      return inner !== null && matchesSelector(inner);
    }
    if (text[i] !== '(') return null;
    i++;
    const inner = group();
    if (inner === null) return null;
    const colon = inner.indexOf(':');
    if (/^\s*(not\b|\()/i.test(inner) || colon < 0) return condition(inner);
    return supportsDeclaration(inner.slice(0, colon), inner.slice(colon + 1));
  };
  const condition = (sub) => {
    if (sub !== undefined) return supportsCondition(sub, matchesSelector);
    let result = inParens();
    if (result === null) return null;
    for (;;) {
      ws();
      const op = /^(and|or)\b/i.exec(text.slice(i))?.[1]?.toLowerCase();
      if (!op) break;
      i += op.length;
      const next = inParens();
      if (next === null) return null;
      result = op === 'and' ? result && next : result || next;
    }
    return result;
  };
  const result = condition();
  ws();
  return result === true && i >= text.length;
}

export function cssNamespace(matchesSelector) {
  const namespace = {
    escape(ident) {
      if (arguments.length === 0) throw new TypeError("Failed to execute 'escape' on 'CSS': 1 argument required, but only 0 present.");
      return escapeIdentifier(ident);
    },
    supports(...args) {
      if (args.length === 0) throw new TypeError("Failed to execute 'supports' on 'CSS': 1 argument required, but only 0 present.");
      if (args.length >= 2) return supportsDeclaration(args[0], args[1]);
      const text = String(args[0]);
      // A bare declaration is treated as if wrapped in parentheses.
      return supportsCondition(text, matchesSelector) || supportsCondition(`(${text})`, matchesSelector);
    },
  };
  Object.defineProperty(namespace, Symbol.toStringTag, { value: 'CSS', configurable: true });
  return namespace;
}

export const isDisplayNone = (element) => computedValue(element, 'display') === 'none';

export function computedStyle(element, proto) {
  const style = Object.create(proto);
  style[S] = { element, computed: true, decls: new Map() };
  return style;
}

function readOnly() {
  throw domError("Failed to execute on 'CSSStyleDeclaration': These styles are computed, and therefore read-only.", 'NoModificationAllowedError');
}

const valueOf = (style, name) => {
  const s = state(style);
  return s.computed ? computedValue(s.element, name) : s.decls.get(name)?.value ?? '';
};

function setDeclaration(style, name, value, priority = '') {
  const s = state(style);
  if (s.computed) readOnly();
  const text = value == null ? '' : String(value).trim();
  // The style attribute is updated only when a declaration changed (CSSOM).
  if (text === '') {
    if (s.decls.delete(name)) sync(style);
    return;
  }
  const important = String(priority).toLowerCase() === 'important';
  const old = s.decls.get(name);
  if (old && old.value === text && old.important === important) return;
  s.decls.set(name, { value: text, important });
  sync(style);
}

export const CSS_INTERFACES = [
  {
    name: 'CSSStyleDeclaration',
    members: {
      get cssText() { return serialize(state(this).decls); },
      set cssText(text) { if (state(this).computed) readOnly(); parseInto(state(this).decls, text); sync(this); },
      get length() { return state(this).decls.size; },
      get parentRule() { return state(this).parentRule ?? null; },
      item(index) { return [...state(this).decls.keys()][index] ?? ''; },
      getPropertyValue(name) { return valueOf(this, String(name).toLowerCase()); },
      getPropertyPriority(name) { return state(this).decls.get(String(name).toLowerCase())?.important ? 'important' : ''; },
      setProperty(name, value, priority) { setDeclaration(this, String(name).toLowerCase(), value, priority); },
      removeProperty(name) {
        const key = String(name).toLowerCase();
        const previous = state(this).decls.get(key)?.value ?? '';
        setDeclaration(this, key, '');
        return previous;
      },
    },
  },
  {
    name: 'CSSStyleProperties',
    parent: 'CSSStyleDeclaration',
    members: Object.fromEntries(STYLE_ACCESSORS.map((accessor) => {
      const name = cssName(accessor);
      return [accessor, {
        get() { return valueOf(this, name); },
        set(value) { setDeclaration(this, name, value); },
      }];
    })),
  },
];

// A declaration block owned by a CSS rule (CSSStyleRule.style, ...).
export function declarationBlock(proto, text, parentRule) {
  const style = Object.create(proto);
  style[S] = { element: null, decls: new Map(), parentRule };
  parseInto(style[S].decls, text);
  return style;
}

export const serializeDeclarations = (style) => serialize(style[S].decls);

// The element's style object, created on first use from its style attribute.
export function styleOf(element, proto) {
  const es = state(element);
  if (!es.style) {
    const style = Object.create(proto);
    style[S] = { element, decls: new Map() };
    parseInto(style[S].decls, es.attrs.get('style'));
    es.style = style;
  }
  return es.style;
}

// Called when the style attribute is set or removed directly.
export function styleAttributeChanged(element) {
  const es = element[S];
  if (es.style) parseInto(es.style[S].decls, es.attrs.get('style'));
}
