// Live collections: NodeList (childNodes), HTMLCollection (children,
// getElementsBy*) and the other indexed lists. Each wraps a function that
// returns the current items, so they reflect later changes.
//
// They are WebIDL legacy platform objects: supported property indices (and,
// for HTMLCollection and NamedNodeMap, supported property names) behave as
// own properties that come and go with the items (WebIDL 3.9). A Proxy is the
// only way to give a live object own properties for indices that did not
// exist when it was last read: defining them eagerly would cost every tree
// mutation a pass over every live collection. The traps are kept cheap: one
// character scan for an array index, then an array read.
import { S, HTML_NS } from './internal.js';

// The array index a property key names (WebIDL "is an array index": a
// canonical numeric string below 2^32 - 1), or -1.
function arrayIndex(key) {
  if (typeof key !== 'string') return -1;
  const n = key.length;
  if (n === 0 || n > 10) return -1;
  let c = key.charCodeAt(0) - 48;
  if (c < 0 || c > 9) return -1;
  if (c === 0) return n === 1 ? 0 : -1;
  let v = c;
  for (let i = 1; i < n; i++) {
    c = key.charCodeAt(i) - 48;
    if (c < 0 || c > 9) return -1;
    v = v * 10 + c;
  }
  return v <= 4294967294 ? v : -1;
}

const items = (list) => {
  const s = list != null ? list[S] : undefined;
  if (!s || !s.items) throw new TypeError('Illegal invocation');
  return s.items();
};

// The named property visibility algorithm (WebIDL): a supported name is
// hidden by an own property of that name and by one on the prototype chain.
// Returns the named property's value, or null when there is none to show.
const namedValue = (t, s, key) => (key === '' || key in t ? null : s.named.get(s.proxy, key));

const handler = {
  get(t, key, receiver) {
    if (typeof key === 'string') {
      const i = arrayIndex(key);
      if (i >= 0) {
        const list = t[S].items();
        if (i < list.length) return list[i];
        return Reflect.get(t, key, receiver);
      }
      // Members and expandos first: they hide named properties anyway.
      const v = Reflect.get(t, key, receiver);
      if (v !== undefined) return v;
      const s = t[S];
      if (s.named === null) return v;
      const named = namedValue(t, s, key);
      return named !== null ? named : undefined;
    }
    if (key === S) {
      // Internal state belongs to the collection itself, not to objects that
      // inherit from it (an HTMLCollection used as a prototype).
      const s = t[S];
      return receiver === s.proxy ? s : undefined;
    }
    return Reflect.get(t, key, receiver);
  },
  has(t, key) {
    const i = arrayIndex(key);
    if (i >= 0) {
      if (i < t[S].items().length) return true;
    } else if (typeof key === 'string' && t[S].named !== null && namedValue(t, t[S], key) !== null) return true;
    return Reflect.has(t, key);
  },
  getOwnPropertyDescriptor(t, key) {
    const s = t[S];
    const i = arrayIndex(key);
    if (i >= 0) {
      const list = s.items();
      if (i < list.length) return { value: list[i], writable: s.setIndex !== null, enumerable: true, configurable: true };
      return undefined;
    }
    if (typeof key === 'string') {
      if (s.named !== null) {
        const v = namedValue(t, s, key);
        if (v !== null) return { value: v, writable: false, enumerable: !s.named.unenumerable, configurable: true };
      }
    } else if (key === S) return undefined;
    return Reflect.getOwnPropertyDescriptor(t, key);
  },
  defineProperty(t, key, desc) {
    const s = t[S];
    const i = arrayIndex(key);
    if (i >= 0) {
      // Only an indexed setter (HTMLOptionsCollection) accepts index writes.
      if (s.setIndex === null || !('value' in desc) || 'get' in desc || 'set' in desc) return false;
      s.setIndex(i, desc.value);
      return true;
    }
    // A supported name cannot get an own property in its place.
    if (typeof key === 'string' && s.named !== null && key !== '' && !Object.hasOwn(t, key) && s.named.get(s.proxy, key) !== null) return false;
    return Reflect.defineProperty(t, key, desc);
  },
  set(t, key, value, receiver) {
    const s = t[S];
    const i = arrayIndex(key);
    if (i >= 0) {
      if (s.setIndex !== null) {
        if (receiver === s.proxy) { s.setIndex(i, value); return true; }
      } else if (i < s.items().length) return false; // read-only indexed property
    }
    return Reflect.set(t, key, value, receiver);
  },
  deleteProperty(t, key) {
    const s = t[S];
    const i = arrayIndex(key);
    if (i >= 0) return i >= s.items().length;
    if (typeof key === 'string') {
      if (s.named !== null && namedValue(t, s, key) !== null) return false;
    } else if (key === S) return true;
    return Reflect.deleteProperty(t, key);
  },
  ownKeys(t) {
    const s = t[S];
    const list = s.items();
    const keys = [];
    for (let i = 0; i < list.length; i++) keys.push(String(i));
    if (s.named !== null) {
      for (const name of s.named.names(s.proxy)) if (!(name in t)) keys.push(name);
    }
    for (const key of Reflect.ownKeys(t)) if (key !== S) keys.push(key);
    return keys;
  },
  preventExtensions() { return false; },
};

// Named properties of HTMLCollection (DOM 4.2.10.2): elements by id, and HTML
// elements also by name; [LegacyUnenumerableNamedProperties].
export function htmlCollectionNamedItem(list, name) {
  const key = String(name);
  if (key === '') return null;
  for (const el of items(list)) {
    const es = el[S];
    if (es.attrs.get('id') === key || (es.ns === HTML_NS && es.attrs.get('name') === key)) return el;
  }
  return null;
}

export function htmlCollectionNames(list) {
  const names = [];
  const seen = new Set();
  const add = (name) => {
    if (name !== undefined && name !== '' && !seen.has(name)) { seen.add(name); names.push(name); }
  };
  for (const el of items(list)) {
    const es = el[S];
    add(es.attrs.get('id'));
    if (es.ns === HTML_NS) add(es.attrs.get('name'));
  }
  return names;
}

export const HTML_COLLECTION_NAMED = { get: htmlCollectionNamedItem, names: htmlCollectionNames, unenumerable: true };

// named: null, or { get(list, name) -> value or null, names(list) -> the
// supported property names in order, unenumerable }. Lists made on a
// prototype with namedItem (HTMLCollection and its subclasses) get
// HTMLCollection's named properties unless they pass their own.
// setIndex(index, value): an indexed property setter, or null.
export function liveList(proto, getItems, named = undefined, setIndex = null) {
  const target = Object.create(proto);
  const s = {
    items: getItems,
    named: named !== undefined ? named : typeof proto.namedItem === 'function' ? HTML_COLLECTION_NAMED : null,
    setIndex,
    proxy: null,
  };
  target[S] = s;
  s.proxy = new Proxy(target, handler);
  return s.proxy;
}

const iterate = {
  [Symbol.iterator]() { return items(this)[Symbol.iterator](); },
};

// item(index) takes a WebIDL unsigned long: ToUint32 (item(-1) is
// item(4294967295)).
const item = {
  item(index) { return items(this)[index >>> 0] ?? null; },
};

export const COLLECTION_INTERFACES = [
  {
    name: 'NodeList',
    members: {
      get length() { return items(this).length; },
      ...item,
      forEach(callback, thisArg) { items(this).forEach((node, i) => callback.call(thisArg, node, i, this)); },
      entries() { return items(this).entries(); },
      keys() { return items(this).keys(); },
      values() { return items(this).values(); },
      ...iterate,
    },
  },
  // File API: an input's selected files.
  {
    name: 'FileList',
    members: {
      get length() { return items(this).length; },
      ...item,
      ...iterate,
    },
  },
  // Touch Events: a TouchEvent's touch lists.
  {
    name: 'TouchList',
    members: {
      get length() { return items(this).length; },
      ...item,
      ...iterate,
    },
  },
  {
    name: 'HTMLCollection',
    members: {
      get length() { return items(this).length; },
      ...item,
      namedItem(name) { return htmlCollectionNamedItem(this, name); },
      ...iterate,
    },
  },
];
