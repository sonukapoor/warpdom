// The API surface of a window, walked black box (no knowledge of how the
// DOM is built): every name a test can reach from the window, as a map from
// a path to what is there.
//   window.x               a member of the window (own or inherited)
//   window.o.x             a member of an object the window exposes (own or
//                          inherited: Location's members are the instance's
//                          own in one DOM and the prototype's in another)
//   I                      an interface object on the window
//   I extends              the interface I.prototype inherits from
//   I.x, I.prototype.x     static and prototype members of interface I
//   <label> is             the interface of an object: window.o, objects
//                          reached through them (MORE), and the element
//                          document.createElement(NS) makes for a tag
// Interfaces reached only through objects (not on the window) are walked
// like the window's, under their constructor's name.
// Values: 'method', 'accessor' (a getter and/or a setter), 'data' and
// 'interface'; for 'is' and 'extends' paths, the interface's name.
// Not walked: ECMAScript's globals (Array, Promise, WebAssembly: the
// engine's), names starting with _ (jsdom's internals: window._document,
// cssstyle's _setProperty) and symbols other than the well-known ones
// (jsdom's implementation symbol).
import vm from 'node:vm';

const INTRINSICS = new Set(vm.runInNewContext('Object.getOwnPropertyNames(globalThis)'));
const WELL_KNOWN = new Set(Object.getOwnPropertyNames(Symbol).map((name) => Symbol[name]).filter((s) => typeof s === 'symbol'));

// Objects the window exposes; their members are walked whatever their
// interface.
const OBJECTS = ['document', 'navigator', 'location', 'history', 'screen', 'localStorage', 'sessionStorage', 'performance',
  'crypto', 'customElements', 'console', 'CSS', 'visualViewport'];
// Objects reached through those, for their interface (it may not be on the
// window).
const MORE = {
  'document.implementation': (w) => w.document.implementation,
  'getSelection()': (w) => w.getSelection(),
  'document.body.style': (w) => w.document.body.style,
  'getComputedStyle(body)': (w) => w.getComputedStyle(w.document.body),
  'document.body.classList': (w) => w.document.body.classList,
  'document.body.dataset': (w) => w.document.body.dataset,
  'document.body.attributes': (w) => w.document.body.attributes,
  'document.body.childNodes': (w) => w.document.body.childNodes,
  'document.body.children': (w) => w.document.body.children,
  'document.createRange()': (w) => w.document.createRange(),
  'document.createTreeWalker(body)': (w) => w.document.createTreeWalker(w.document.body),
  'document.createNodeIterator(body)': (w) => w.document.createNodeIterator(w.document.body),
  'document.createDocumentFragment()': (w) => w.document.createDocumentFragment(),
  'document.createTextNode()': (w) => w.document.createTextNode(''),
  'document.createComment()': (w) => w.document.createComment(''),
  'document.styleSheets': (w) => w.document.styleSheets,
  'document.forms': (w) => w.document.forms,
  'document.all': (w) => w.document.all,
  'attachShadow()': (w) => w.document.createElement('div').attachShadow({ mode: 'open' }),
  'form.elements': (w) => w.document.createElement('form').elements,
  'select.options': (w) => w.document.createElement('select').options,
  'input.validity': (w) => w.document.createElement('input').validity,
  'input.labels': (w) => w.document.createElement('input').labels,
  'table.rows': (w) => w.document.createElement('table').rows,
};

// SVG elements tests create (charts, icons), and the ones with an
// interface of their own in jsdom (the walk records which interface each
// gets).
export const SVG_TAGS = ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'textPath', 'defs', 'use', 'symbol', 'image', 'foreignObject', 'linearGradient', 'radialGradient', 'stop', 'pattern',
  'clipPath', 'mask', 'marker', 'filter', 'feGaussianBlur', 'feColorMatrix', 'feOffset', 'title', 'desc', 'metadata',
  'switch', 'a', 'style', 'script', 'view', 'animate', 'set', 'animateTransform'];

const kindOf = (d) => (d.get || d.set ? 'accessor' : typeof d.value === 'function' ? 'method' : 'data');
const read = (object, key) => { try { return object[key]; } catch { return undefined; } };
const isObject = (value) => value !== null && (typeof value === 'object' || typeof value === 'function');
// A key's name in a path, or null for one that is not walked.
const keyName = (key) => {
  if (typeof key === 'symbol') return WELL_KNOWN.has(key) ? `[${key.description}]` : null;
  return key[0] === '_' ? null : key;
};

export function apiSurface(window, htmlTags) {
  const out = new Map();
  const walked = new Set(); // prototypes already walked
  const isBase = (o) => o === Object.prototype || o === window.Object?.prototype || o === Function.prototype || o === window.Function?.prototype;
  // A function's length, name and prototype; arguments and caller are a
  // sloppy-mode function's (jsdom's XPath interfaces), not API.
  const STATIC_SKIP = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);
  const members = (object, label, skip) => {
    for (const key of Reflect.ownKeys(object)) {
      const name = keyName(key);
      if (name === null || skip?.has(key)) continue;
      out.set(`${label}.${name}`, kindOf(Object.getOwnPropertyDescriptor(object, key)));
    }
  };
  const allMembers = (object, label) => {
    for (let o = object; o && !isBase(o); o = Object.getPrototypeOf(o)) {
      for (const key of Reflect.ownKeys(o)) {
        const name = keyName(key);
        const path = `${label}.${name}`;
        if (name !== null && name !== 'constructor' && !out.has(path)) out.set(path, kindOf(Object.getOwnPropertyDescriptor(o, key)));
      }
    }
  };
  const ctorName = (proto) => {
    const d = Object.getOwnPropertyDescriptor(proto, 'constructor');
    return typeof d?.value === 'function' && d.value.name ? d.value.name : '(anonymous)';
  };
  // An interface: its statics, prototype members and parent, then the parent.
  const iface = (name, ctor, proto) => {
    if (walked.has(proto)) return;
    walked.add(proto);
    if (typeof ctor === 'function') members(ctor, name, STATIC_SKIP);
    members(proto, `${name}.prototype`);
    const parent = Object.getPrototypeOf(proto);
    // A function as the parent (jsdom's XPathResult) is no interface.
    if (parent && !isBase(parent) && typeof parent !== 'function') {
      const parentName = ctorName(parent);
      out.set(`${name} extends`, parentName);
      // An ECMAScript parent (DOMException's Error) is the engine's.
      if (!INTRINSICS.has(parentName)) iface(parentName, read(parent, 'constructor'), parent);
    }
  };
  // The interface of an object (its prototype's constructor).
  const instance = (object, label) => {
    const proto = Object.getPrototypeOf(object);
    if (!proto || isBase(proto)) return;
    const name = ctorName(proto);
    out.set(`${label} is`, name);
    iface(name, read(proto, 'constructor'), proto);
  };

  // The window, with what it inherits (Window, EventTarget).
  const windowNames = new Set();
  for (let o = window; o && !isBase(o); o = Object.getPrototypeOf(o)) {
    for (const key of Reflect.ownKeys(o)) if (typeof key === 'string' && !INTRINSICS.has(key) && keyName(key) !== null) windowNames.add(key);
  }
  // Reading every member first turns lazily created members (warpdom's
  // interfaces) into what they become.
  for (const name of windowNames) read(window, name);
  for (const name of windowNames) {
    let d;
    for (let o = window; o && !d; o = Object.getPrototypeOf(o)) d = Object.getOwnPropertyDescriptor(o, name);
    out.set(`window.${name}`, kindOf(d));
  }
  for (const name of windowNames) {
    const value = read(window, name);
    if (typeof value !== 'function' || !/^[A-Z]/.test(name)) continue;
    out.set(name, 'interface');
    if (isObject(value.prototype)) iface(name, value, value.prototype);
    else members(value, name, STATIC_SKIP); // a callback interface with constants (NodeFilter)
  }
  for (const name of OBJECTS) {
    const value = read(window, name);
    if (!isObject(value)) continue;
    allMembers(value, `window.${name}`);
    instance(value, `window.${name}`);
  }
  for (const [label, get] of Object.entries(MORE)) {
    let value;
    try { value = get(window); } catch { continue; }
    if (isObject(value)) instance(value, label);
  }
  const doc = window.document;
  for (const tag of htmlTags) instance(doc.createElement(tag), `<${tag}>`);
  for (const tag of SVG_TAGS) instance(doc.createElementNS('http://www.w3.org/2000/svg', tag), `<svg:${tag}>`);
  return out;
}

// Where a member path not in a surface is found instead, through the
// interface's parents there (I.prototype.x as P.prototype.x: 'on P') or
// its subclasses ('on subclass S'), else null.
function foundOn(surface, path) {
  const match = /^([^.\s]+)\.(prototype\.)?(.+)$/.exec(path);
  if (!match || match[1] === 'window') return null;
  const [, name, proto = '', member] = match;
  for (let parent = surface.get(`${name} extends`); parent; parent = surface.get(`${parent} extends`)) {
    if (surface.has(`${parent}.${proto}${member}`)) return `on ${parent}`;
  }
  for (const [key, value] of surface) {
    if (value !== name || !key.endsWith(' extends')) continue;
    const child = key.slice(0, -' extends'.length);
    if (surface.has(`${child}.${proto}${member}`)) return `on subclass ${child}`;
  }
  return null;
}

// What differs where jsdom has a path: [path, difference] pairs, the
// difference 'missing', 'on P' or 'on subclass S' (not the interface's
// own member: see foundOn) or 'jsdom x, warpdom y'.
export function differences(jsdom, warpdom) {
  const out = [];
  for (const [path, value] of jsdom) {
    const ours = warpdom.get(path);
    if (ours === value) continue;
    out.push([path, ours !== undefined ? `jsdom ${value}, warpdom ${ours}` : foundOn(warpdom, path) ?? 'missing']);
  }
  return out;
}
