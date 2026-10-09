// Attribute views: Attr nodes and NamedNodeMap (element.attributes),
// DOMTokenList (classList) and DOMStringMap (dataset). All are views over
// the element's attribute map: cached per element, recomputed only when its
// attributes change (attrsRev), and writing through the single attribute
// write path.
import {
  S, state, initNode, domError, HTML_NS, idChanged, attributesChanged, hooks, observed,
} from './internal.js';
import { liveList } from './collections.js';
import { styleAttributeChanged } from './css.js';

const ATTRIBUTE_NODE = 2;

// The one path for attribute writes (undefined removes): keeps the id index,
// live collections, the style object, Attr nodes and attribute views in step,
// and reports to MutationObservers.
export function writeAttribute(element, key, value) {
  const es = state(element);
  const attrs = es.attrs;
  const old = attrs.get(key);
  if (key === 'id') idChanged(element, old, value);
  if (value === undefined) {
    if (old === undefined) return;
    attrs.delete(key);
    attributeRemoved(element, key, old);
  } else attrs.set(key, value);
  es.attrsRev = (es.attrsRev ?? 0) + 1;
  attributesChanged(element);
  if (key === 'style') styleAttributeChanged(element);
  if (observed(element)) hooks.attribute(element, key, old);
}

// Attribute names are lowercased on HTML elements only (SVG keeps viewBox).
export const attrName = (element, name) => (element[S].ns === HTML_NS ? String(name).toLowerCase() : String(name));

// --- Attr ----------------------------------------------------------------------

// The Attr node for an element's attribute, created once and reused.
export function attrNode(element, name) {
  const es = element[S];
  const cache = es.attrNodes ?? (es.attrNodes = new Map());
  let attr = cache.get(name);
  if (!attr) {
    attr = initNode(Object.create(es.doc[S].window[S].protos.Attr), ATTRIBUTE_NODE, es.doc, { name, element, detachedValue: '' });
    cache.set(name, attr);
  }
  return attr;
}

// Called by the attribute write path when an attribute is removed: its Attr
// node, if any, becomes detached and keeps its last value.
export function attributeRemoved(element, name, oldValue) {
  const attr = element[S].attrNodes?.get(name);
  if (!attr) return;
  element[S].attrNodes.delete(name);
  attr[S].element = null;
  attr[S].detachedValue = oldValue ?? '';
}

export function createAttribute(document, name) {
  const n = String(name);
  if (!/^[^\s"'>/=\u0000]+$/.test(n)) throw domError(`'${name}' is not a valid attribute name.`, 'InvalidCharacterError');
  return initNode(Object.create(document[S].window[S].protos.Attr), ATTRIBUTE_NODE, document,
    { name: n.toLowerCase(), element: null, detachedValue: '' });
}

export function setAttributeNode(element, attr) {
  const as = state(attr);
  if (as.element && as.element !== element) throw domError('The attribute is in use by another element.', 'InUseAttributeError');
  if (as.element === element) return attr;
  const es = element[S];
  const previous = es.attrs.has(as.name) ? attrNode(element, as.name) : null;
  const value = as.detachedValue;
  if (previous) writeAttribute(element, as.name, undefined);
  (es.attrNodes ?? (es.attrNodes = new Map())).set(as.name, attr);
  as.element = element;
  writeAttribute(element, as.name, value);
  return previous;
}

export function removeAttributeNode(element, attr) {
  const as = state(attr);
  if (as.element !== element) throw domError('The attribute is not an attribute of this element.', 'NotFoundError');
  writeAttribute(element, as.name, undefined);
  return attr;
}

// --- element.attributes ----------------------------------------------------------

function attributeArray(element) {
  const es = element[S];
  if (es.attrArray && es.attrArrayRev === es.attrsRev) return es.attrArray;
  const arr = [];
  for (const name of es.attrs.keys()) arr.push(attrNode(element, name));
  es.attrArray = arr;
  es.attrArrayRev = es.attrsRev;
  return arr;
}

export function namedNodeMap(element) {
  const es = state(element);
  if (!es.namedNodeMap) {
    es.namedNodeMap = liveList(es.doc[S].window[S].protos.NamedNodeMap, () => attributeArray(element));
    es.namedNodeMap[S].element = element;
  }
  return es.namedNodeMap;
}

// --- classList ---------------------------------------------------------------------

function tokens(list) {
  const s = state(list);
  const value = s.element[S].attrs.get(s.attribute) ?? '';
  if (s.parsedValue !== value) {
    s.tokens = [...new Set(value.split(/[\t\n\f\r ]+/).filter(Boolean))];
    s.parsedValue = value;
  }
  return s.tokens;
}

function validToken(token) {
  const t = String(token);
  if (t === '') throw domError('The token provided must not be empty.', 'SyntaxError');
  if (/[\t\n\f\r ]/.test(t)) throw domError(`The token provided ('${t}') contains HTML space characters, which are not valid in tokens.`, 'InvalidCharacterError');
  return t;
}

function writeTokens(list, values) {
  const s = state(list);
  s.write(s.element, s.attribute, values.join(' '));
}

export function tokenList(element, attribute, write) {
  const es = state(element);
  const key = `tokens:${attribute}`;
  if (!es[key]) {
    const items = () => tokens(es[key]);
    es[key] = liveList(es.doc[S].window[S].protos.DOMTokenList, items);
    Object.assign(es[key][S], { element, attribute, write, parsedValue: null, tokens: [] });
  }
  return es[key];
}

// --- dataset -----------------------------------------------------------------------

const toAttribute = (prop) => `data-${prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
const toProperty = (attr) => attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function domStringMap(element, write) {
  const es = state(element);
  if (es.dataset) return es.dataset;
  const target = Object.create(es.doc[S].window[S].protos.DOMStringMap);
  target[S] = { element };
  const isData = (key) => typeof key === 'string' && !/-[a-z]/.test(key);
  es.dataset = new Proxy(target, {
    get(t, key, receiver) {
      if (isData(key)) { const v = es.attrs.get(toAttribute(key)); if (v !== undefined) return v; }
      return Reflect.get(t, key, receiver);
    },
    set(t, key, value) {
      if (!isData(key)) return Reflect.set(t, key, value);
      write(element, toAttribute(key), String(value));
      return true;
    },
    has(t, key) { return (isData(key) && es.attrs.has(toAttribute(key))) || Reflect.has(t, key); },
    deleteProperty(t, key) {
      if (isData(key) && es.attrs.has(toAttribute(key))) write(element, toAttribute(key), undefined);
      return true;
    },
    ownKeys() { return [...es.attrs.keys()].filter((a) => a.startsWith('data-')).map(toProperty); },
    getOwnPropertyDescriptor(t, key) {
      if (!isData(key)) return undefined;
      const v = es.attrs.get(toAttribute(key));
      return v === undefined ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
    },
  });
  return es.dataset;
}

// --- interfaces --------------------------------------------------------------------

const tokenItems = (list) => tokens(list);

export const ATTRIBUTE_INTERFACES = [
  {
    name: 'Attr',
    parent: 'Node',
    members: {
      get name() { return state(this).name; },
      get localName() { return state(this).name; },
      get nodeName() { return state(this).name; },
      get namespaceURI() { state(this); return null; },
      get prefix() { state(this); return null; },
      get specified() { state(this); return true; },
      get ownerElement() { return state(this).element; },
      get value() { const s = state(this); return s.element ? s.element[S].attrs.get(s.name) ?? '' : s.detachedValue; },
      set value(v) {
        const s = state(this);
        if (s.element) writeAttribute(s.element, s.name, String(v));
        else s.detachedValue = String(v);
      },
      get nodeValue() { return this.value; },
      set nodeValue(v) { this.value = v; },
      get textContent() { return this.value; },
      set textContent(v) { this.value = v; },
    },
  },
  {
    name: 'NamedNodeMap',
    members: {
      get length() { return attributeArray(state(this).element).length; },
      item(index) { return attributeArray(state(this).element)[index] ?? null; },
      getNamedItem(name) {
        const el = state(this).element;
        const key = el[S].ns === HTML_NS ? String(name).toLowerCase() : String(name);
        return el[S].attrs.has(key) ? attrNode(el, key) : null;
      },
      getNamedItemNS(ns, localName) { return this.getNamedItem(localName); },
      setNamedItem(attr) { return setAttributeNode(state(this).element, attr); },
      setNamedItemNS(attr) { return setAttributeNode(state(this).element, attr); },
      removeNamedItem(name) {
        const attr = this.getNamedItem(name);
        if (!attr) throw domError(`No item with name '${name}' was found.`, 'NotFoundError');
        return removeAttributeNode(state(this).element, attr);
      },
      [Symbol.iterator]() { return attributeArray(state(this).element)[Symbol.iterator](); },
    },
  },
  {
    name: 'DOMTokenList',
    members: {
      get length() { return tokenItems(this).length; },
      get value() { const s = state(this); return s.element[S].attrs.get(s.attribute) ?? ''; },
      set value(v) { const s = state(this); s.write(s.element, s.attribute, String(v)); },
      item(index) { return tokenItems(this)[index] ?? null; },
      contains(token) { return tokenItems(this).includes(String(token)); },
      add(...items) {
        const add = items.map(validToken);
        const current = tokenItems(this);
        writeTokens(this, [...current, ...add.filter((t, i) => !current.includes(t) && add.indexOf(t) === i)]);
      },
      remove(...items) {
        const remove = items.map(validToken);
        writeTokens(this, tokenItems(this).filter((t) => !remove.includes(t)));
      },
      toggle(token, force) {
        const t = validToken(token);
        const has = tokenItems(this).includes(t);
        if (has && force !== true) { this.remove(t); return false; }
        if (!has && force !== false) { this.add(t); return true; }
        return has;
      },
      replace(token, newToken) {
        const t = validToken(token);
        const n = validToken(newToken);
        const current = tokenItems(this);
        if (!current.includes(t)) return false;
        const out = [];
        for (const x of current) {
          const v = x === t ? n : x;
          if (!out.includes(v)) out.push(v);
        }
        writeTokens(this, out);
        return true;
      },
      supports() { throw new TypeError("Failed to execute 'supports' on 'DOMTokenList': DOMTokenList has no supported tokens."); },
      toString() { return this.value; },
      forEach(callback, thisArg) { tokenItems(this).forEach((t, i) => callback.call(thisArg, t, i, this)); },
      entries() { return tokenItems(this).entries(); },
      keys() { return tokenItems(this).keys(); },
      values() { return tokenItems(this).values(); },
      [Symbol.iterator]() { return tokenItems(this)[Symbol.iterator](); },
    },
  },
  { name: 'DOMStringMap', members: {} },
];
