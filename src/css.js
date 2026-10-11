// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import { S, state, domError, ELEMENT_NODE, cssomChanges, attributesChanged } from './internal.js';
import { STYLE_ACCESSORS } from './css-properties.js';
import { LONGHANDS, SHORTHANDS, COLOR_SHORTHANDS, ALIASES } from './css-data.js';
import { isValidValue } from './css-values.js';
import { expand, segments, serializeBox, serializeFont } from './shorthands.js';
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

// Validation modes (css-values.js): 'spec' checks every property's grammar,
// as jsdom 27 and later do; 'jsdom26' only the properties jsdom 26 checked,
// without numeric ranges. A window's mode is set on its CSSStyleProperties
// prototype, and each declaration block records it when created. (Of the
// properties jsdom 26 checked, flex-basis, border-spacing, font-weight and
// font-variant accepted values outside their ranges; they are left out, and
// flex is checked although jsdom 26 took a negative basis.)
const JSDOM26_VALIDATED = new Set(['-webkit-text-fill-color', '-webkit-text-stroke-color', 'background', 'background-attachment', 'background-color',
  'background-image', 'background-position', 'background-repeat', 'border', 'border-bottom', 'border-bottom-color', 'border-bottom-style', 'border-bottom-width',
  'border-collapse', 'border-color', 'border-left', 'border-left-color', 'border-left-style', 'border-left-width', 'border-right', 'border-right-color', 'border-right-style',
  'border-right-width', 'border-style', 'border-top', 'border-top-color', 'border-top-style', 'border-top-width', 'border-width', 'bottom',
  'clear', 'clip', 'color', 'flex', 'float', 'flood-color', 'font', 'font-family', 'font-size', 'font-style', 'height',
  'left', 'lighting-color', 'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'opacity', 'outline-color',
  'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'right', 'stop-color', 'top', 'width']);
const modes = new WeakMap(); // CSSStyleProperties prototype -> mode
export function setValidationMode(proto, mode) { modes.set(proto, mode); }
const modeOf = (proto) => modes.get(proto) ?? 'spec';
export const validationModeOf = (window) => modeOf(window[S].protos.CSSStyleProperties);

// A property name CSSOM accepts: a custom property, or one the
// specifications define. Others are dropped (style.setProperty('foo', ...)).
const isKnownProperty = (name) => name.startsWith('--') || LONGHANDS[name] !== undefined || SHORTHANDS[name] !== undefined || ALIASES[name] !== undefined;

// Declared values by mode, property and raw value: style writes repeat the
// same few values, so each is validated and serialized once. INVALID marks
// a value the property's grammar rejects.
const INVALID = null;
const declaredCaches = { spec: new Map(), jsdom26: new Map() }; // mode -> property -> (raw value -> serialized)
function declaredValue(name, value, mode = 'spec') {
  const cache = declaredCaches[mode];
  let byValue = cache.get(name);
  if (byValue === undefined) cache.set(name, byValue = new Map());
  let out = byValue.get(value);
  if (out === undefined) {
    if (!isKnownProperty(name)) out = INVALID;
    else {
      const checked = mode === 'spec' || JSDOM26_VALIDATED.has(name);
      out = !checked || isValidValue(name, value) ? serializeDeclared(name, value, mode) : INVALID;
    }
    if (byValue.size >= 500) byValue.clear();
    byValue.set(value, out);
  }
  return out;
}

// display's multi-keyword values serialize in their short form (CSS
// Display 3, 2): inline flex is inline-flex, inline flow-root is
// inline-block. jsdom 26 kept them as written.
const OUTER = new Set(['block', 'inline', 'run-in']);
const INNER = new Set(['flow', 'flow-root', 'table', 'flex', 'grid', 'ruby']);
const SHORT = { 'block flow': 'block', 'inline flow': 'inline', 'run-in flow': 'run-in', 'block flow-root': 'flow-root', 'inline flow-root': 'inline-block',
  'block flex': 'flex', 'inline flex': 'inline-flex', 'block grid': 'grid', 'inline grid': 'inline-grid', 'block table': 'table',
  'inline table': 'inline-table', 'inline ruby': 'ruby' };
function displayShortForm(value) {
  const keywords = value.toLowerCase().split(/\s+/);
  if (keywords.length < 2) return value;
  let outer = null, inner = null, listItem = false;
  for (const k of keywords) {
    if (OUTER.has(k) && outer === null) outer = k;
    else if (INNER.has(k) && inner === null) inner = k;
    else if (k === 'list-item' && !listItem) listItem = true;
    else return value;
  }
  inner ??= 'flow';
  outer ??= inner === 'ruby' ? 'inline' : 'block';
  if (listItem) return [outer === 'block' ? null : outer, inner === 'flow' ? null : inner, 'list-item'].filter(Boolean).join(' ');
  return SHORT[`${outer} ${inner}`] ?? `${outer} ${inner}`;
}

// flex serializes as its three longhands (flex: 1 is 1 1 0%, auto is
// 1 1 auto): omitted grow and shrink are 1, an omitted basis 0%.
function flexLonghands(value) {
  const lower = value.toLowerCase();
  if (lower === 'none') return '0 0 auto';
  if (lower === 'auto') return '1 1 auto';
  const parts = segments(value).filter((part, i) => i % 2 === 0 && part !== '');
  if (parts.length === 1 && /^(initial|inherit|unset|revert|revert-layer)$/i.test(parts[0])) return value;
  if (/var\(|env\(|attr\(/i.test(value)) return value;
  const numbers = [];
  let basis = null;
  for (const part of parts) {
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(part) && numbers.length < 2 && (basis === null || numbers.length > 0)) numbers.push(String(Number(part)));
    else basis = ZERO.test(part) ? '0px' : part;
  }
  return `${numbers[0] ?? '1'} ${numbers[1] ?? '1'} ${basis ?? '0%'}`;
}

function serializeDeclared(name, value, mode) {
  if (name === 'display' && mode === 'spec') return displayShortForm(value);
  if (name === 'flex') return flexLonghands(canonicalNumbers(value));
  if (name === 'font') return serializeFont(canonicalNumbers(value));
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

function parseInto(decls, text, mode) {
  decls.clear();
  for (const part of splitOutside(String(text ?? ''), ';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    let important = false;
    const bang = value.match(/\s*!\s*important\s*$/i);
    if (bang) { important = true; value = value.slice(0, bang.index).trim(); }
    if (!name || !value) continue;
    const declared = declaredValue(name, value, mode);
    if (declared === INVALID) continue;
    if (MERGEABLE.has(name)) decls.mergeable = true;
    decls.set(name, { value: declared, important });
  }
}

// A declaration list's declarations (a style attribute's value).
export function parseDeclarations(text, mode) {
  const decls = new Map();
  parseInto(decls, text, mode);
  return decls;
}

// A declaration block serialized (CSSOM): longhands of a shorthand that are
// all present with the same importance are written as the shorthand, at the
// first one's place. jsdom merges margin, padding and flex (jsdom 26: margin
// and padding, as written: 1px 2px 1px 2px).
const MERGED = {
  spec: ['margin', 'padding', 'flex'].map((shorthand) => [shorthand, SHORTHANDS[shorthand]]),
  jsdom26: ['margin', 'padding'].map((shorthand) => [shorthand, SHORTHANDS[shorthand]]),
};
// A block that ever held one of their longhands is marked (decls.mergeable),
// so most blocks skip merging.
const MERGEABLE = new Set(MERGED.spec.flatMap(([, longhands]) => longhands));
function serialize(decls, mode = 'spec') {
  let merged = null; // longhand -> shorthand to write in its place ('' to skip)
  if (decls.mergeable === true && decls.size >= 3) for (const [shorthand, longhands] of MERGED[mode]) {
    const first = decls.get(longhands[0]);
    if (first === undefined || !longhands.every((l) => decls.get(l)?.important === first.important)) continue;
    const values = longhands.map((l) => decls.get(l).value);
    const value = mode === 'jsdom26' ? values.join(' ') : COMPOSED[shorthand](values);
    merged ??= new Map();
    let place = null;
    for (const name of decls.keys()) if (longhands.includes(name)) { place = name; break; }
    for (const l of longhands) merged.set(l, l === place ? { name: shorthand, value, important: first.important } : '');
  }
  let out = '';
  if (merged === null) {
    for (const [name, { value, important }] of decls) out += `${out ? ' ' : ''}${name}: ${value}${important ? ' !important' : ''};`;
    return out;
  }
  for (const [name, decl] of decls) {
    let { value, important } = decl;
    let written = name;
    const m = merged.get(name);
    if (m === '') continue;
    if (m) ({ name: written, value, important } = m);
    out += `${out ? ' ' : ''}${written}: ${value}${important ? ' !important' : ''};`;
  }
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
    s.element[S].attrs.set('style', serialize(s.decls, s.mode));
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

// CSS.supports(property, value): a supported property with a valid value
// (the same check as style declarations; jsdom 30 validates too).
const supportsDeclaration = (property, value) => {
  const name = String(property).trim().toLowerCase();
  const text = String(value).trim();
  return text !== '' && declaredValue(name, text, 'spec') !== INVALID;
};

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
  style[S] = { element, computed: true, decls: new Map(), mode: modeOf(proto) };
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
  const raw = value == null ? '' : String(value).trim();
  if (raw === '') return;
  const text = declaredValue(name, raw, s.mode);
  if (text === INVALID) return;
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
  if (LONGHANDS[name]) return fromShorthand(s.decls, name);
  // jsdom 26 read background as the background-color set alone.
  if (name === 'background' && s.mode === 'jsdom26') return s.decls.get('background-color')?.value ?? '';
  return COMPOSED[name] ? composeShorthand(s.decls, name) : '';
};

// Shorthands whose longhands a declaration block reads through them, as in
// jsdom (its CSS layer expands these; overflow: hidden leaves overflow-x
// empty there, and tests rely on that).
const EXPANDED_SHORTHANDS = new Set(['background', 'background-position', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-style', 'border-width', 'flex', 'font', 'margin', 'padding']);

// A longhand set by a declared shorthand (margin-top from margin: 0 auto);
// the last such shorthand wins.
function fromShorthand(decls, longhand) {
  let found = '';
  for (const [name, { value }] of decls) {
    if (!EXPANDED_SHORTHANDS.has(name)) continue;
    for (const [part, v] of expand(name, value)) if (part === longhand) found = v;
  }
  return found;
}

// A shorthand read from its longhands when every one is declared, as jsdom
// composes them (margin from margin-top, -right, -bottom and -left).
const COMPOSED = {
  margin: (v) => serializeBox(v),
  padding: (v) => serializeBox(v),
  flex: ([grow, shrink, basis]) => `${grow} ${shrink} ${basis}`,
  'background-position': ([x, y]) => `${x} ${y}`,
};
function composeShorthand(decls, name) {
  const values = [];
  for (const longhand of SHORTHANDS[name]) {
    const value = decls.get(longhand)?.value ?? fromShorthand(decls, longhand);
    if (!value) return '';
    values.push(value);
  }
  return COMPOSED[name](values);
}

function setDeclaration(style, name, value, priority = '') {
  const s = state(style);
  if (s.computed) {
    if (!mutableComputed(s)) readOnly();
    writeComputed(s, name, value);
    return;
  }
  const raw = value == null ? '' : String(value).trim();
  // The style attribute is updated only when a declaration changed (CSSOM).
  if (raw === '') {
    if (s.decls.delete(name)) sync(style);
    return;
  }
  // Unknown properties and invalid values are ignored (CSSOM).
  const text = declaredValue(name, raw, s.mode);
  if (text === INVALID) return;
  const important = String(priority).toLowerCase() === 'important';
  const old = s.decls.get(name);
  if (old && old.value === text && old.important === important) return;
  if (old === undefined && MERGEABLE.has(name)) s.decls.mergeable = true;
  s.decls.set(name, { value: text, important });
  sync(style);
}

// CSSStyleProperties' accessors, one per name in STYLE_ACCESSORS. The
// descriptor map has no prototype: V8 keeps it as a dictionary instead of
// building a hidden class per key.
function styleDescriptors() {
  const descriptors = Object.create(null);
  for (const accessor of STYLE_ACCESSORS) {
    const name = cssName(accessor);
    descriptors[accessor] = {
      get() { return valueOf(this, name); },
      set(value) {
        const s = state(this);
        if (s.computed) writeComputed(s, name, value);
        else setDeclaration(this, name, value);
      },
      enumerable: true,
      configurable: true,
    };
  }
  return descriptors;
}

export const CSS_INTERFACES = [
  {
    name: 'CSSStyleDeclaration',
    members: {
      get cssText() { const s = state(this); return serialize(s.decls, s.mode); },
      set cssText(text) {
        const s = state(this);
        if (s.computed) {
          if (!mutableComputed(s)) readOnly();
          const decls = new Map();
          parseInto(decls, text, s.mode);
          s.overrides = new Map([...decls].map(([name, { value }]) => [name, value]));
          s.replaced = true;
          return;
        }
        parseInto(s.decls, text, s.mode);
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
    // About 1,600 accessors: their property descriptors are built directly,
    // the first time a window creates the interface.
    descriptors: styleDescriptors,
  },
];

// A declaration block owned by a CSS rule (CSSStyleRule.style, ...).
export function declarationBlock(proto, text, parentRule) {
  const style = Object.create(proto);
  style[S] = { element: null, decls: new Map(), parentRule, mode: modeOf(proto) };
  parseInto(style[S].decls, text, style[S].mode);
  return style;
}

export const serializeDeclarations = (style) => serialize(style[S].decls, style[S].mode);

// The element's style object, created on first use from its style attribute.
export function styleOf(element, proto) {
  const es = state(element);
  if (!es.style) {
    const style = Object.create(proto);
    style[S] = { element, decls: new Map(), mode: modeOf(proto) };
    parseInto(style[S].decls, es.attrs.get('style'), style[S].mode);
    es.style = style;
  }
  return es.style;
}

// Called when the style attribute is set or removed directly.
export function styleAttributeChanged(element) {
  const es = element[S];
  if (es.style) parseInto(es.style[S].decls, es.attrs.get('style'), es.style[S].mode);
}
