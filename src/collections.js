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
import { S, HTML_NS, tooFewArguments } from './internal.js';

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

// The state of the list whose get trap ran last. Members called on a list
// (the length getter, item(), forEach) are almost always reached through
// that trap a moment before, so they find their state here instead of
// reading list[S] through the Proxy a second time. A state belongs to one
// list, so the identity check makes any stale value harmless; it keeps at
// most one list reachable.
let lastState = null;

const items = (list) => {
  const last = lastState;
  if (last !== null && last.proxy === list) return last.items();
  const s = list != null ? list[S] : undefined;
  if (!s || !s.items) throw new TypeError('Illegal invocation');
  return s.items();
};

// The named property visibility algorithm (WebIDL): a supported name is
// hidden by an own property of that name and by one on the prototype chain.
// Returns the named property's value, or null when there is none to show.
const namedValue = (t, s, key) => (key === '' || key in t ? null : s.named.get(s.proxy, key));

// A list's internal state is also its Proxy handler: the traps live on the
// class prototype and read the state through `this`, so a list costs one
// state object, its target and the Proxy, and no trap loads the state from
// the target. A static list (querySelectorAll) keeps its array; a live list
// keeps the function that returns its current items.
class ListState {
  constructor(array, getItems, named, setIndex) {
    this.array = array;
    this.getItems = getItems;
    this.named = named;
    this.setIndex = setIndex;
    this.proxy = null;
  }

  items() {
    const array = this.array;
    return array !== null ? array : this.getItems();
  }

  get(t, key, receiver) {
    if (typeof key === 'string') {
      const i = arrayIndex(key);
      if (i >= 0) {
        const list = this.items();
        if (i < list.length) return list[i];
        return Reflect.get(t, key, receiver);
      }
      // Members and expandos first: they hide named properties anyway.
      lastState = this;
      const v = Reflect.get(t, key, receiver);
      if (v !== undefined || this.named === null) return v;
      const named = namedValue(t, this, key);
      return named !== null ? named : undefined;
    }
    // Internal state belongs to the collection itself, not to objects that
    // inherit from it (an HTMLCollection used as a prototype).
    if (key === S) return receiver === this.proxy ? this : undefined;
    return Reflect.get(t, key, receiver);
  }

  has(t, key) {
    const i = arrayIndex(key);
    if (i >= 0) {
      if (i < this.items().length) return true;
    } else if (typeof key === 'string' && this.named !== null && namedValue(t, this, key) !== null) return true;
    else if (key === S) return true;
    return Reflect.has(t, key);
  }

  getOwnPropertyDescriptor(t, key) {
    const i = arrayIndex(key);
    if (i >= 0) {
      const list = this.items();
      if (i < list.length) return { value: list[i], writable: this.setIndex !== null, enumerable: true, configurable: true };
      return undefined;
    }
    if (typeof key === 'string') {
      if (this.named !== null) {
        const v = namedValue(t, this, key);
        if (v !== null) return { value: v, writable: false, enumerable: !this.named.unenumerable, configurable: true };
      }
    } else if (key === S) return undefined;
    return Reflect.getOwnPropertyDescriptor(t, key);
  }

  defineProperty(t, key, desc) {
    const i = arrayIndex(key);
    if (i >= 0) {
      // Only an indexed setter (HTMLOptionsCollection) accepts index writes.
      if (this.setIndex === null || !('value' in desc) || 'get' in desc || 'set' in desc) return false;
      this.setIndex(i, desc.value);
      return true;
    }
    // A supported name cannot get an own property in its place.
    if (typeof key === 'string' && this.named !== null && key !== '' && !Object.hasOwn(t, key) && this.named.get(this.proxy, key) !== null) return false;
    return Reflect.defineProperty(t, key, desc);
  }

  set(t, key, value, receiver) {
    const i = arrayIndex(key);
    if (i >= 0) {
      if (this.setIndex !== null) {
        if (receiver === this.proxy) { this.setIndex(i, value); return true; }
      } else if (i < this.items().length) return false; // read-only indexed property
    }
    return Reflect.set(t, key, value, receiver);
  }

  deleteProperty(t, key) {
    const i = arrayIndex(key);
    if (i >= 0) return i >= this.items().length;
    if (typeof key === 'string') {
      if (this.named !== null && namedValue(t, this, key) !== null) return false;
    } else if (key === S) return true;
    return Reflect.deleteProperty(t, key);
  }

  ownKeys(t) {
    const list = this.items();
    const keys = [];
    for (let i = 0; i < list.length; i++) keys.push(String(i));
    if (this.named !== null) {
      for (const name of this.named.names(this.proxy)) if (!(name in t)) keys.push(name);
    }
    for (const key of Reflect.ownKeys(t)) keys.push(key);
    return keys;
  }

  preventExtensions() { return false; }
}

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
  const s = new ListState(null, getItems, named !== undefined ? named : typeof proto.namedItem === 'function' ? HTML_COLLECTION_NAMED : null, setIndex);
  return (s.proxy = new Proxy(Object.create(proto), s));
}

// A static NodeList (querySelectorAll) over an array that never changes.
// The caller must not mutate the array afterwards.
export function staticList(proto, array) {
  const s = new ListState(array, null, null, null);
  return (s.proxy = new Proxy(Object.create(proto), s));
}

// Iterators over a list's current items (WebIDL value and pair iterators
// read the length and the item at each step, as Array.prototype.values
// does), so iterating a live list sees changes made since it started.
// The list's items are its cached array, rebuilt only after a change.
const VALUES = 0, KEYS = 1, ENTRIES = 2;
class ListIterator {
  constructor(list, kind) { this.list = list; this.kind = kind; this.index = 0; }
  next() {
    const list = this.list;
    if (list === null) return { value: undefined, done: true };
    const array = items(list);
    const i = this.index;
    if (i >= array.length) { this.list = null; return { value: undefined, done: true }; }
    this.index = i + 1;
    const kind = this.kind;
    return { value: kind === VALUES ? array[i] : kind === KEYS ? i : [i, array[i]], done: false };
  }
  [Symbol.iterator]() { return this; }
}
Object.defineProperty(ListIterator.prototype, Symbol.toStringTag, { value: 'Array Iterator', configurable: true });
for (const key of ['constructor', 'next', Symbol.iterator]) {
  Object.defineProperty(ListIterator.prototype, key, { enumerable: false });
}

const iterate = {
  [Symbol.iterator]() { items(this); return new ListIterator(this, VALUES); },
};

// item(index) takes a WebIDL unsigned long: ToUint32 (item(-1) is
// item(4294967295)).
const item = {
  item(index) {
    if (index === undefined && arguments.length < 1) tooFewArguments(this[Symbol.toStringTag], 'item', 1, 0);
    return items(this)[index >>> 0] ?? null;
  },
};

export const COLLECTION_INTERFACES = [
  {
    name: 'NodeList',
    members: {
      get length() { return items(this).length; },
      ...item,
      forEach(callback, thisArg) { items(this).forEach((node, i) => callback.call(thisArg, node, i, this)); },
      entries() { items(this); return new ListIterator(this, ENTRIES); },
      keys() { items(this); return new ListIterator(this, KEYS); },
      values() { items(this); return new ListIterator(this, VALUES); },
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
      namedItem(name) {
        if (name === undefined && arguments.length < 1) tooFewArguments('HTMLCollection', 'namedItem', 1, arguments.length);
        return htmlCollectionNamedItem(this, name);
      },
      ...iterate,
    },
  },
];

// Elements with indexed properties (HTMLFormElement: its elements;
// HTMLSelectElement: its options, with an indexed setter): legacy platform
// objects as above, with no named properties. items(element) returns the
// current items, setIndex(element, index, value) is the setter or null.
// Other keys (the element's state among them) go to the element itself.
class IndexedElement {
  constructor(items, setIndex) {
    this.items = items;
    this.setIndex = setIndex;
    this.proxy = null;
  }

  get(t, key, receiver) {
    if (typeof key === 'string') {
      const i = arrayIndex(key);
      if (i >= 0) {
        const list = this.items(this.proxy);
        if (i < list.length) return list[i];
      }
    }
    return Reflect.get(t, key, receiver);
  }

  has(t, key) {
    const i = arrayIndex(key);
    if (i >= 0 && i < this.items(this.proxy).length) return true;
    return Reflect.has(t, key);
  }

  getOwnPropertyDescriptor(t, key) {
    const i = arrayIndex(key);
    if (i >= 0) {
      const list = this.items(this.proxy);
      return i < list.length ? { value: list[i], writable: this.setIndex !== null, enumerable: true, configurable: true } : undefined;
    }
    return Reflect.getOwnPropertyDescriptor(t, key);
  }

  defineProperty(t, key, desc) {
    const i = arrayIndex(key);
    if (i >= 0) {
      if (this.setIndex === null || !('value' in desc) || 'get' in desc || 'set' in desc) return false;
      this.setIndex(this.proxy, i, desc.value);
      return true;
    }
    return Reflect.defineProperty(t, key, desc);
  }

  set(t, key, value, receiver) {
    const i = arrayIndex(key);
    if (i >= 0) {
      if (this.setIndex === null) return false;
      if (receiver === this.proxy) { this.setIndex(this.proxy, i, value); return true; }
    }
    return Reflect.set(t, key, value, receiver);
  }

  deleteProperty(t, key) {
    const i = arrayIndex(key);
    if (i >= 0) return i >= this.items(this.proxy).length;
    return Reflect.deleteProperty(t, key);
  }

  ownKeys(t) {
    const n = this.items(this.proxy).length;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(String(i));
    for (const key of Reflect.ownKeys(t)) keys.push(key);
    return keys;
  }

  preventExtensions() { return false; }
}

export function indexedElement(element, items, setIndex = null) {
  const handler = new IndexedElement(items, setIndex);
  return (handler.proxy = new Proxy(element, handler));
}
