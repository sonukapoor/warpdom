// Named access on the Window object (HTML 7.2.2.3): window[name] finds
// child navigables by name, embed/form/img/object elements by name and HTML
// elements by id, through the Window's named properties object
// (WindowProperties, WebIDL 3.7.4), which sits between Window.prototype and
// EventTarget.prototype.
//
// Only lookups that miss the window's own properties and Window.prototype
// reach it, so reads of window members cost nothing more. Its answers come
// from a map of the document's named objects, rebuilt on the first lookup
// after a change in the document's trees (treeRev).
import { S, HTML_NS, ELEMENT_NODE, nextInTree } from './internal.js';
import { liveList } from './collections.js';

const NAMED_TAGS = new Set(['embed', 'form', 'img', 'object']);

// name -> [{ element, navigable }] in tree order, and the supported property
// names in order.
function namedObjects(doc) {
  const ds = doc[S];
  const rev = ds.treeRev ?? 0;
  if (ds.namedObjects && ds.namedObjectsRev === rev) return ds.namedObjects;
  const map = new Map();
  const add = (name, element, navigable) => {
    if (name === undefined || name === '') return;
    const list = map.get(name);
    if (list) list.push({ element, navigable });
    else map.set(name, [{ element, navigable }]);
  };
  for (let n = ds.first; n; n = nextInTree(n, doc)) {
    const s = n[S];
    if (s.type !== ELEMENT_NODE || s.ns !== HTML_NS) continue;
    if (s.tag === 'iframe' && s.frameWindow) add(s.attrs.get('name'), n, true);
    else if (NAMED_TAGS.has(s.tag)) add(s.attrs.get('name'), n, false);
    add(s.attrs.get('id'), n, false);
  }
  ds.namedObjects = map;
  ds.namedObjectsRev = rev;
  return map;
}

// The named getter: the first child navigable's window, else the only
// element, else a live HTMLCollection of the named elements. undefined when
// name is not a supported property name.
function namedValue(window, name) {
  const doc = window.document;
  if (!doc?.[S]) return undefined;
  const list = namedObjects(doc).get(name);
  if (!list) return undefined;
  for (const o of list) if (o.navigable) return o.element[S].frameWindow;
  if (list.length === 1) return list[0].element;
  return liveList(window[S].protos.HTMLCollection, () => {
    const current = namedObjects(doc).get(name);
    if (!current) return [];
    const out = [];
    for (const o of current) if (!out.includes(o.element)) out.push(o.element);
    return out;
  });
}

// An own or inherited property of holder, before the named properties
// object, hides a named property.
function hidden(holder, proxy, key) {
  for (let o = holder; o !== null && o !== proxy; o = Object.getPrototypeOf(o)) if (Object.hasOwn(o, key)) return true;
  return false;
}

// A named properties object for window's named objects, inserted in
// holder's prototype chain above next (the window itself: between
// Window.prototype and EventTarget.prototype). The holder is the object
// whose own and inherited properties take precedence.
export function namedPropertiesObject(window, holder, next) {
  const target = Object.create(next);
  Object.defineProperty(target, Symbol.toStringTag, { value: 'WindowProperties', configurable: true });
  let proxy = null;
  const lookup = (t, key) => {
    if (typeof key !== 'string' || key in t) return undefined;
    const value = namedValue(window, key);
    return value === undefined || hidden(holder, proxy, key) ? undefined : value;
  };
  proxy = new Proxy(target, {
    get(t, key, receiver) {
      // Inherited members (EventTarget.prototype, Object.prototype) first:
      // they hide named properties anyway.
      const value = Reflect.get(t, key, receiver);
      return value !== undefined ? value : lookup(t, key);
    },
    has(t, key) {
      return lookup(t, key) !== undefined || Reflect.has(t, key);
    },
    getOwnPropertyDescriptor(t, key) {
      const value = lookup(t, key);
      if (value !== undefined) return { value, writable: true, enumerable: false, configurable: true };
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    defineProperty() {
      return false;
    },
    deleteProperty(t, key) {
      return lookup(t, key) === undefined && Reflect.deleteProperty(t, key);
    },
    setPrototypeOf() {
      return false;
    },
    preventExtensions() {
      return false;
    },
  });
  return proxy;
}

// jsdom before 24.1.2 has no named properties object (black box): its
// Window.prototype inherits from EventTarget.prototype directly, and named
// access is through the window's own properties, so a named object hides
// EventTarget's members (<div id="addEventListener">), though not the
// window's or Object.prototype's. For those profiles Window.prototype
// itself (target, already filled) looks up the named objects, as a proxy
// that otherwise leaves everything to the target. Only these profiles pay
// for reading Window.prototype's members through a proxy.
export function namedAccessPrototype(window, target) {
  let proxy = null;
  const lookup = (t, key) => {
    if (typeof key !== 'string' || key === 'document' || Object.hasOwn(t, key) || key in Object.prototype)
      return undefined;
    const value = namedValue(window, key);
    return value === undefined || hidden(window, proxy, key) ? undefined : value;
  };
  proxy = new Proxy(target, {
    get(t, key, receiver) {
      const value = lookup(t, key);
      return value !== undefined ? value : Reflect.get(t, key, receiver);
    },
    has(t, key) {
      return Reflect.has(t, key) || lookup(t, key) !== undefined;
    },
  });
  return proxy;
}

// Named access on another global object that stands for window (the WPT
// runner's, where the global is the window as in a browser): window's named
// objects behind the global's own and inherited properties. The Vitest and
// Jest environments do not install it (see PLAN.md, 2026-10-11).
export function installNamedAccess(global, window) {
  Object.setPrototypeOf(global, namedPropertiesObject(window, global, Object.getPrototypeOf(global)));
}

// The window's named objects as a scope (a with statement's object) for
// code whose global is another object that does no named access: inline
// event handlers compiled in Jest's or Vitest's VM context, where it comes
// just behind the global as a with scope, which answers the names the
// global has, own or inherited. Any other name of a named object resolves
// to it, live, before the global lexical bindings, as jsdom does there
// (black box: Vitest vmThreads and jest-environment-jsdom on jsdom 20.0.3,
// 26.1.0 and 30.1.3). An assignment to such a name goes to the global,
// which then hides it.
export function namedScope(window, global) {
  return new Proxy(Object.create(null), {
    has(t, key) {
      return typeof key === 'string' && namedValue(window, key) !== undefined;
    },
    get(t, key) {
      return typeof key === 'string' ? namedValue(window, key) : undefined;
    },
    set(t, key, value) {
      return Reflect.set(global, key, value);
    },
  });
}
