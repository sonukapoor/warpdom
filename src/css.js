// Inline styles: CSSStyleDeclaration (methods, cssText, length) and
// CSSStyleProperties (an accessor per CSS property name), as in jsdom 30.
// Declarations are kept in order in a Map, and every change is written back to
// the element's style attribute; a new style attribute re-parses them.
import { S, state } from './internal.js';
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

function setDeclaration(style, name, value, priority = '') {
  const s = state(style);
  const text = value == null ? '' : String(value).trim();
  if (text === '') s.decls.delete(name);
  else s.decls.set(name, { value: text, important: String(priority).toLowerCase() === 'important' });
  sync(style);
}

export const CSS_INTERFACES = [
  {
    name: 'CSSStyleDeclaration',
    members: {
      get cssText() { return serialize(state(this).decls); },
      set cssText(text) { parseInto(state(this).decls, text); sync(this); },
      get length() { return state(this).decls.size; },
      get parentRule() { state(this); return null; },
      item(index) { return [...state(this).decls.keys()][index] ?? ''; },
      getPropertyValue(name) { return state(this).decls.get(String(name).toLowerCase())?.value ?? ''; },
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
        get() { return state(this).decls.get(name)?.value ?? ''; },
        set(value) { setDeclaration(this, name, value); },
      }];
    })),
  },
];

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
