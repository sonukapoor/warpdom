// Attribute views: Attr nodes and NamedNodeMap (element.attributes),
// DOMTokenList (classList) and DOMStringMap (dataset). All are views over
// the element's attribute map: cached per element, recomputed only when its
// attributes change (attrsRev), and writing through the single attribute
// write path.
import {
  S, state, initNode, domError, HTML_NS, idChanged, attributesChanged, hooks, observed,
  asciiLowercase, validElementLocalName, validAttributeLocalName, validNamespacePrefix,
} from './internal.js';
import { liveList } from './collections.js';
import { styleAttributeChanged } from './css.js';

const ATTRIBUTE_NODE = 2;

// Attribute change steps by attribute name (form controls register theirs:
// checked, selected, ...), run after the attribute map is updated.
export const attributeSteps = new Map();

// The one path for attribute writes (undefined removes): keeps the id index,
// live collections, the style object, Attr nodes and attribute views in step,
// and reports to MutationObservers.
// checkName (setAttribute): a new attribute's name must be a valid attribute
// local name; names already present are valid.
export function writeAttribute(element, key, value, checkName) {
  if (hooks.ce === null) writeAttributeValue(element, key, value, checkName);
  else hooks.ce.scope(writeAttributeValue, element, key, value, checkName);
}

function writeAttributeValue(element, key, value, checkName) {
  const es = state(element);
  const attrs = es.attrs;
  const old = attrs.get(key);
  if (old === undefined && checkName === true) checkAttributeName(key);
  if (key === 'id') idChanged(element, old, value);
  if (value === undefined) {
    if (old === undefined) return;
    attrs.delete(key);
    attributeRemoved(element, key, old);
  } else attrs.set(key, value);
  es.attrsRev = (es.attrsRev ?? 0) + 1;
  attributesChanged(element);
  if (key === 'style') styleAttributeChanged(element);
  const step = attributeSteps.get(key);
  if (step !== undefined) step(element, old, value);
  if (observed(element)) hooks.attribute(element, key, old);
  if (hooks.ce !== null) hooks.ce.attributeChanged(element, key, old, value);
  // A removed attribute's namespace is kept until the steps above ran.
  if (value === undefined) es.attrNS?.delete(key);
  if ((key === 'slot' || key === 'name') && hooks.slots !== null && es.doc[S].slotCount) hooks.slots.attributeChanged(element, key);
}

// --- namespaced attributes (DOM 4.9) ---------------------------------------------
// Attributes are keyed by qualified name; those set with a namespace keep
// it, their prefix and local name in es.attrNS. (So two attributes with the
// same qualified name in different namespaces cannot coexist.)

export const XML_NS = 'http://www.w3.org/XML/1998/namespace';
export const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

const nsOrNull = (ns) => (ns == null || ns === '' ? null : String(ns));

// "Validate and extract" a namespace and qualified name, for an element or
// an attribute (element: true): the prefix is what comes before the first
// colon, the local name what follows it.
export function validateAndExtract(namespace, qualifiedName, element = false) {
  const ns = nsOrNull(namespace);
  const qn = String(qualifiedName);
  let prefix = null;
  let local = qn;
  const colon = qn.indexOf(':');
  const invalid = () => domError(`'${qn}' is not a valid qualified name.`, 'InvalidCharacterError');
  if (colon >= 0) {
    prefix = qn.slice(0, colon);
    local = qn.slice(colon + 1);
    if (!validNamespacePrefix(prefix)) throw invalid();
  }
  if (element ? !validElementLocalName(local) : !validAttributeLocalName(local)) throw invalid();
  const fail = () => { throw domError(`The namespace '${ns}' is not valid for the qualified name '${qn}'.`, 'NamespaceError'); };
  if (prefix !== null && ns === null) fail();
  if (prefix === 'xml' && ns !== XML_NS) fail();
  if ((qn === 'xmlns' || prefix === 'xmlns') && ns !== XMLNS_NS) fail();
  if (ns === XMLNS_NS && qn !== 'xmlns' && prefix !== 'xmlns') fail();
  return { ns, prefix, local, qn };
}

// The qualified name of the element's attribute with this namespace and
// local name, or null.
export function findAttributeNS(element, namespace, localName) {
  const es = element[S];
  const ns = nsOrNull(namespace);
  const local = String(localName);
  if (es.attrNS) {
    for (const [name, info] of es.attrNS) if (info.ns === ns && info.local === local) return name;
  }
  return ns === null && es.attrs.has(local) && !es.attrNS?.has(local) ? local : null;
}

export function setAttributeNS(element, namespace, qualifiedName, value) {
  const { ns, prefix, local, qn } = validateAndExtract(namespace, qualifiedName);
  const existing = findAttributeNS(element, ns, local);
  if (existing !== null) { writeAttribute(element, existing, String(value)); return; }
  const es = element[S];
  if (ns !== null) (es.attrNS ?? (es.attrNS = new Map())).set(qn, { ns, prefix, local });
  writeAttribute(element, qn, String(value));
}

// An attribute's namespace, prefix and local name.
export function attributeNamespace(element, name) {
  return element?.[S].attrNS?.get(name) ?? null;
}

// Attribute names are lowercased on HTML elements only (SVG keeps viewBox).
export const attrName = (element, name) => (element[S].ns === HTML_NS ? asciiLowercase(String(name)) : String(name));

// setAttribute and toggleAttribute: the name must be a valid attribute local
// name.
// Names checked once are remembered (a set lookup per call after that).
export const validAttributeNames = new Set();
export function checkAttributeName(name) {
  if (!validAttributeNames.has(name)) {
    if (!validAttributeLocalName(name)) throwInvalidAttributeName(name);
    if (validAttributeNames.size < 10000) validAttributeNames.add(name);
  }
  return name;
}
function throwInvalidAttributeName(name) {
  throw domError(`'${name}' is not a valid attribute name.`, 'InvalidCharacterError');
}

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
  // A detached Attr keeps its namespace, prefix and local name.
  attr[S].info = element[S].attrNS?.get(name) ?? null;
}

// An Attr's namespace, prefix and local name, or null (no namespace).
export const attrInfo = (s) => (s.element ? attributeNamespace(s.element, s.name) : s.info ?? null);

// document.createAttributeNS.
export function createAttributeNS(document, namespace, qualifiedName) {
  const { ns, prefix, local, qn } = validateAndExtract(namespace, qualifiedName);
  return initNode(Object.create(document[S].window[S].protos.Attr), ATTRIBUTE_NODE, document,
    { name: qn, element: null, detachedValue: '', info: ns === null ? null : { ns, prefix, local } });
}

export function createAttribute(document, name) {
  const n = checkAttributeName(String(name));
  return initNode(Object.create(document[S].window[S].protos.Attr), ATTRIBUTE_NODE, document,
    { name: document[S].xml ? n : asciiLowercase(n), element: null, detachedValue: '' });
}

export function setAttributeNode(element, attr) {
  const as = state(attr);
  if (as.element && as.element !== element) throw domError('The attribute is in use by another element.', 'InUseAttributeError');
  if (as.element === element) return attr;
  const es = element[S];
  // The attribute with the same namespace and local name is replaced.
  const info = as.info ?? null;
  const oldName = findAttributeNS(element, info?.ns ?? null, info?.local ?? as.name);
  const previous = oldName !== null ? attrNode(element, oldName) : null;
  const value = as.detachedValue;
  if (previous) writeAttribute(element, oldName, undefined);
  if (info !== null) (es.attrNS ?? (es.attrNS = new Map())).set(as.name, info);
  (es.attrNodes ?? (es.attrNodes = new Map())).set(as.name, attr);
  as.element = element;
  as.doc = es.doc;
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
    // Named properties ([LegacyUnenumerableNamedProperties]): attributes by
    // qualified name. Lookups go as getNamedItem does (lowercased on HTML
    // elements): the standard leaves names with uppercase letters out there,
    // but tests rely on attributes.tabIndex, which jsdom finds. The listed
    // names (Object.getOwnPropertyNames) follow the standard.
    const named = {
      get(map, name) {
        const key = attrName(element, name);
        return es.attrs.has(key) ? attrNode(element, key) : null;
      },
      names() {
        const all = [...es.attrs.keys()];
        return es.ns === HTML_NS && !es.doc[S].xml ? all.filter((n) => !/[A-Z]/.test(n)) : all;
      },
      unenumerable: true,
    };
    es.namedNodeMap = liveList(es.doc[S].window[S].protos.NamedNodeMap, () => attributeArray(element), named);
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

// The update steps: no attribute is created for an empty token set.
function writeTokens(list, values) {
  const s = state(list);
  if (values.length === 0 && !s.element[S].attrs.has(s.attribute)) return;
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
      get localName() { const s = state(this); return attrInfo(s)?.local ?? s.name; },
      get nodeName() { return state(this).name; },
      get namespaceURI() { return attrInfo(state(this))?.ns ?? null; },
      get prefix() { return attrInfo(state(this))?.prefix ?? null; },
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
      item(index) { return attributeArray(state(this).element)[index >>> 0] ?? null; },
      getNamedItem(name) {
        const el = state(this).element;
        const key = el[S].ns === HTML_NS ? String(name).toLowerCase() : String(name);
        return el[S].attrs.has(key) ? attrNode(el, key) : null;
      },
      getNamedItemNS(ns, localName) {
        const el = state(this).element;
        const name = findAttributeNS(el, ns, localName);
        return name === null ? null : attrNode(el, name);
      },
      setNamedItem(attr) { return setAttributeNode(state(this).element, attr); },
      setNamedItemNS(attr) { return setAttributeNode(state(this).element, attr); },
      removeNamedItem(name) {
        const attr = this.getNamedItem(name);
        if (!attr) throw domError(`No item with name '${name}' was found.`, 'NotFoundError');
        return removeAttributeNode(state(this).element, attr);
      },
      removeNamedItemNS(ns, localName) {
        const attr = this.getNamedItemNS(ns, localName);
        if (!attr) throw domError(`No item with namespace '${ns}' and name '${localName}' was found.`, 'NotFoundError');
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
        // Both are checked for emptiness before either for whitespace.
        if (String(token) === '' || String(newToken) === '') throw domError('The token provided must not be empty.', 'SyntaxError');
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
      // A value iterator over indexed properties (WebIDL): Array.prototype's
      // own functions, which read length and the indexed properties.
      forEach: Array.prototype.forEach,
      entries: Array.prototype.entries,
      keys: Array.prototype.keys,
      values: Array.prototype.values,
      [Symbol.iterator]: Array.prototype.values,
    },
  },
  { name: 'DOMStringMap', members: {} },
];
