// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import { S, state, domError, ELEMENT_NODE, cssomChanges, attributesChanged } from './internal.js';
import { STYLE_ACCESSORS } from './css-properties.js';
import { LONGHANDS, SHORTHANDS, COLOR_SHORTHANDS } from './css-data.js';
import { expand, segments } from './shorthands.js';
import { resolveColor } from './colors.js';

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

// Declared values as jsdom (27 and later) serializes them: a unitless zero
// length alone is 0px (width: 0). In a list of values, zeros become 0px only
// in margin, padding, border-width and border-spacing, and the first three
// take their shortest form (padding: 0 0 is 0px, margin: 1px 1px is 1px);
// other properties keep a list as written (inset: 0 auto, view-timeline-
// inset: 0 100dvh). Numbers stay (opacity: 0, line-height: 0).
const ZERO = /^[+-]?(0+\.?0*|\.0+)$/;
const BOX_SHORTHANDS = new Set(['margin', 'padding', 'border-width']);
const ZERO_LISTS = new Set(['margin', 'padding', 'border-width', 'border-spacing']);
const zeroIsLength = new Map();
function isLengthProperty(name) {
  let result = zeroIsLength.get(name);
  if (result === undefined) {
    const data = LONGHANDS[name];
    result = data ? data[3] === 1 : !!SHORTHANDS[name]?.every((l) => LONGHANDS[l]?.[3] === 1);
    zeroIsLength.set(name, result);
  }
  return result;
}

// Colors in declared values serialize as CSSOM (and jsdom) gives them:
// hex, rgb() and hsl() as rgb()/rgba(), keywords lowercased. Not inside
// shadows, which jsdom keeps as written.
const holdsColors = new Map();
function isColorProperty(name) {
  let result = holdsColors.get(name);
  if (result === undefined) {
    result = name !== 'box-shadow' && name !== 'text-shadow' && (LONGHANDS[name]?.[2] === 1 || COLOR_SHORTHANDS.includes(name));
    holdsColors.set(name, result);
  }
  return result;
}

// Serialized color values by raw value: the same few strings are written
// over and over (style.color = '#f00' on every render).
const colorCache = new Map();
function declaredColors(value) {
  let out = colorCache.get(value);
  if (out === undefined) {
    out = serializeColors(value);
    if (colorCache.size >= 2000) colorCache.clear();
    colorCache.set(value, out);
  }
  return out;
}

function serializeColors(value) {
  const parts = segments(value);
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i];
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower[0] === '#' || /^(rgba?|hsla?)\(/.test(lower)) parts[i] = resolveColor(token) ?? token;
    else if (resolveColor(lower) !== null || lower === 'currentcolor') parts[i] = lower;
  }
  return parts.join('');
}

// Numbers and dimensions at the top level serialize canonically (CSSOM):
// .5 -> 0.5, 10.0px -> 10px, +1 -> 1. Not inside functions.
const NUMBER_TOKEN = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i;
function canonicalNumbers(value) {
  if (!/\d/.test(value)) return value;
  const parts = segments(value);
  for (let i = 0; i < parts.length; i += 2) {
    const m = NUMBER_TOKEN.exec(parts[i]);
    if (m) parts[i] = `${Number(m[1])}${m[2]}`;
  }
  return parts.join('');
}

// Declared values by property and raw value: style writes repeat the same
// few values, so their serialization is computed once.
const declaredCache = new Map(); // property -> (raw value -> serialized)
function declaredValue(name, value) {
  let byValue = declaredCache.get(name);
  if (byValue === undefined) declaredCache.set(name, byValue = new Map());
  let out = byValue.get(value);
  if (out === undefined) {
    out = serializeDeclared(name, value);
    if (byValue.size >= 500) byValue.clear();
    byValue.set(value, out);
  }
  return out;
}

function serializeDeclared(name, value) {
  value = canonicalNumbers(value);
  if (isColorProperty(name)) value = declaredColors(value);
  if (value.includes('(')) return value;
  const box = BOX_SHORTHANDS.has(name);
  if (!box && !value.includes('0')) return value;
  const tokens = value.split(/\s+/);
  if (tokens.length === 1) return ZERO.test(value) && isLengthProperty(name) ? '0px' : value;
  if (!ZERO_LISTS.has(name)) return value;
  for (let i = 0; i < tokens.length; i++) if (ZERO.test(tokens[i])) tokens[i] = '0px';
  if (box && tokens.length <= 4) {
    const [top, right = top, bottom = top, left = right] = tokens;
    if (left !== right) return `${top} ${right} ${bottom} ${left}`;
    if (bottom !== top) return `${top} ${right} ${bottom}`;
    return right !== top ? `${top} ${right}` : top;
  }
  return tokens.join(' ');
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
    if (name && value) decls.set(name, { value: declaredValue(name, value), important });
  }
}

// A declaration list's declarations (a style attribute's value).
export function parseDeclarations(text) {
  const decls = new Map();
  parseInto(decls, text);
  return decls;
}

function serialize(decls) {
  let out = '';
  for (const [name, { value, important }] of decls) out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
  return out;
}

// Computed values come from cascade.js, which registers itself here (it
// imports the selector engine, which imports back into this module).
export const computed = { value: null };

// Write the declarations back to the element's style attribute; a style
// rule's declarations changed the cascade.
function sync(style) {
  const s = state(style);
  if (s.element) {
    s.element[S].attrs.set('style', serialize(s.decls));
    attributesChanged(s.element);
  } else cssomChanges.rev++;
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

export function computedStyle(element, proto) {
  const style = Object.create(proto);
  style[S] = { element, computed: true, decls: new Map() };
  return style;
}

function readOnly() {
  throw domError("Failed to execute on 'CSSStyleDeclaration': These styles are computed, and therefore read-only.", 'NoModificationAllowedError');
}

// Writes to computed styles, which tests use to fake a layout (react-aria
// sets position on the result of getComputedStyle). jsdom before 28 let
// any write change that one object; since 28, setting a property changes
// that object and the element's computed value until its document
// changes, and the methods throw as the standard says.
const mutableComputed = (s) => s.element[S].doc[S].window[S].compat.mutableComputedStyle;

function computedOverride(s, name) {
  if (s.overrides?.has(name)) return s.overrides.get(name);
  if (s.replaced) return '';
  const es = s.element[S];
  const element = es.computedOverrides;
  if (!element || element.rev !== (es.doc[S].treeRev ?? 0)) return undefined;
  return element.values.get(name);
}

function writeComputed(s, name, value) {
  if (mutableComputed(s)) {
    s.overrides ??= new Map();
    s.overrides.set(name, value == null ? '' : String(value).trim());
    return;
  }
  const text = value == null ? '' : declaredValue(name, String(value).trim());
  if (text === '') return;
  (s.overrides ??= new Map()).set(name, text);
  const es = s.element[S];
  const rev = es.doc[S].treeRev ?? 0;
  if (es.computedOverrides?.rev !== rev) es.computedOverrides = { rev, values: new Map() };
  es.computedOverrides.values.set(name, text);
}

const valueOf = (style, name) => {
  const s = state(style);
  if (s.computed) return computedOverride(s, name) ?? computed.value(s.element, name);
  const decl = s.decls.get(name);
  if (decl) return decl.value;
  return LONGHANDS[name] ? fromShorthand(s.decls, name) : '';
};

// A longhand set by a declared shorthand (margin-top from margin: 0 auto);
// the last such shorthand wins.
function fromShorthand(decls, longhand) {
  let found = '';
  for (const [name, { value }] of decls) {
    if (!SHORTHANDS[name]) continue;
    for (const [part, v] of expand(name, value)) if (part === longhand) found = v;
  }
  return found;
}

function setDeclaration(style, name, value, priority = '') {
  const s = state(style);
  if (s.computed) {
    if (!mutableComputed(s)) readOnly();
    writeComputed(s, name, value);
    return;
  }
  const text = value == null ? '' : declaredValue(name, String(value).trim());
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
      set cssText(text) {
        const s = state(this);
        if (s.computed) {
          if (!mutableComputed(s)) readOnly();
          const decls = new Map();
          parseInto(decls, text);
          s.overrides = new Map([...decls].map(([name, { value }]) => [name, value]));
          s.replaced = true;
          return;
        }
        parseInto(s.decls, text);
        sync(this);
      },
      get length() { return state(this).decls.size; },
      get parentRule() { return state(this).parentRule ?? null; },
      item(index) { return [...state(this).decls.keys()][index] ?? ''; },
      getPropertyValue(name) { return valueOf(this, String(name).toLowerCase()); },
      getPropertyPriority(name) { return state(this).decls.get(String(name).toLowerCase())?.important ? 'important' : ''; },
      setProperty(name, value, priority) { setDeclaration(this, String(name).toLowerCase(), value, priority); },
      removeProperty(name) {
        const key = String(name).toLowerCase();
        const s = state(this);
        const previous = s.computed ? (mutableComputed(s) ? valueOf(this, key) : readOnly()) : s.decls.get(key)?.value ?? '';
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
        set(value) {
          const s = state(this);
          if (s.computed) writeComputed(s, name, value);
          else setDeclaration(this, name, value);
        },
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
