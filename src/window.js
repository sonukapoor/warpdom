// createWindow(): a fresh window with its own prototypes and constructors for
// every interface (so patches made in one window cannot leak into another),
// built from property descriptors that are prepared once per module load,
// each interface's the first time any window creates it.
import {
  S, hooks, initNode, insert, ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE,
  CDATA_SECTION_NODE, PROCESSING_INSTRUCTION_NODE,
} from './internal.js';
import { INTERFACES, SVG_ELEMENTS, HTML_NS, SVG_NS } from './interfaces.js';
import { HTML_ELEMENTS, PLAIN_TAGS } from './html-elements.js';
import { setupWindow } from './window-features.js';
import { setValidationMode } from './css.js';
import { namedPropertiesObject } from './named-access.js';
import './document-named.js';
import { createCustomElement, createRegistry, htmlConstruct, isValidCustomElementName } from './custom-elements.js';

// Once per module load: the interfaces in order, parents before children.
const ORDER = [];
const BY_NAME = new Map(); // interface name -> definition
{
  const byName = new Map(INTERFACES.map((i) => [i.name, i]));
  const visit = (iface) => {
    if (BY_NAME.has(iface.name)) return;
    if (iface.parent) visit(byName.get(iface.parent));
    ORDER.push(iface);
    BY_NAME.set(iface.name, iface);
  };
  for (const iface of INTERFACES) visit(iface);
}

// An interface's property descriptors, built the first time a window
// creates it (a test touches a few dozen of about 300 interfaces) and then
// shared by every window. Members are an object, or a list of objects
// merged in order (mixins; a later member replaces an earlier one in its
// place), where a function stands for the object it builds (reflected
// attributes). An interface may also build its descriptors itself
// (CSSStyleProperties' accessors). Kept as parallel lists of keys and
// descriptors: defining them one by one is faster than
// Object.defineProperties (about 30% for CSSStyleProperties).
const DESCRIPTORS = new Map(); // interface name -> { keys, descriptors }
function descriptorsOf(iface) {
  let table = DESCRIPTORS.get(iface.name);
  if (table) return table;
  let descriptors;
  if (iface.descriptors) {
    descriptors = iface.descriptors();
  } else {
    // Without a prototype: V8 keeps it as a dictionary rather than building
    // a hidden class per key.
    descriptors = Object.create(null);
    const { members } = iface;
    if (Array.isArray(members)) for (const m of members) addDescriptors(descriptors, typeof m === 'function' ? m() : m);
    else addDescriptors(descriptors, members);
  }
  const keys = Reflect.ownKeys(descriptors);
  table = { keys, descriptors: keys.map((key) => descriptors[key]), unscopables: null };
  // The @@unscopables descriptor is left out of the shared list: each
  // window gets its own object.
  const i = keys.indexOf(Symbol.unscopables);
  if (i !== -1 && descriptors[Symbol.unscopables].unscopables) {
    table.unscopables = descriptors[Symbol.unscopables].value;
    keys.splice(i, 1);
    table.descriptors.splice(i, 1);
  }
  DESCRIPTORS.set(iface.name, table);
  return table;
}

function addDescriptors(descriptors, members) {
  for (const key of Reflect.ownKeys(members)) {
    const d = Object.getOwnPropertyDescriptor(members, key);
    const v = d.value;
    if (v && typeof v === 'object' && 'unscopables' in v) {
      // @@unscopables (WebIDL): a null-prototype object whose properties are
      // writable; made per window (see unscopablesOf).
      descriptors[key] = { value: v.unscopables, enumerable: false, writable: false, configurable: true, unscopables: true };
    } else if (v && typeof v === 'object' && 'constant' in v) {
      // Constants such as Node.ELEMENT_NODE: read-only, as in WebIDL.
      descriptors[key] = { value: v.constant, enumerable: true, writable: false, configurable: false };
    } else if (v && typeof v === 'object' && (v.get || v.set)) {
      // Accessors given as { get, set } objects (from helpers).
      descriptors[key] = { get: v.get, set: v.set, enumerable: true, configurable: true };
    } else if (d.get || d.set) {
      descriptors[key] = { get: d.get, set: d.set, enumerable: true, configurable: true };
    } else {
      descriptors[key] = { value: v, writable: true, enumerable: true, configurable: true };
    }
  }
}
// Interfaces with the HTML element constructor: HTMLElement and its element interfaces.
const HTML_CONSTRUCTOR = new Set(['HTMLElement', ...HTML_ELEMENTS.map(([name]) => name)]);

const TAG_INTERFACE = new Map();
for (const [name, , tags] of HTML_ELEMENTS) for (const tag of tags) TAG_INTERFACE.set(tag, name);
for (const tag of PLAIN_TAGS) TAG_INTERFACE.set(tag, 'HTMLElement');

function interfaceFor(ns, tag) {
  if (ns === HTML_NS) {
    const lower = tag.toLowerCase();
    // Valid custom element names (contain a hyphen) create HTMLElement.
    return TAG_INTERFACE.get(lower) ?? (lower.includes('-') ? 'HTMLElement' : 'HTMLUnknownElement');
  }
  if (ns === SVG_NS) return SVG_ELEMENTS.get(tag) ?? 'SVGElement';
  return 'Element';
}

// Interfaces and members a jsdom generation did not have yet, removed from
// this window (its prototypes are its own). Libraries feature-detect them:
// react-aria listens for pointer events only when PointerEvent exists, so
// tests written for jsdom before 27 fire mouse events only.
const POINTER_HANDLERS = ['ongotpointercapture', 'onlostpointercapture', 'onpointercancel', 'onpointerdown', 'onpointerenter',
  'onpointerleave', 'onpointermove', 'onpointerout', 'onpointerover', 'onpointerrawupdate', 'onpointerup'];

// Window is a [Global] interface (WebIDL 3.7.6): its operations are own
// properties of the window, and called without a this value (const
// { getComputedStyle } = iframe.contentWindow) they act on that window.
function installGlobalOperations(window, proto) {
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const { value } = Object.getOwnPropertyDescriptor(proto, name);
    if (typeof value !== 'function') continue;
    const operation = { [name](...args) { return value.apply(this ?? window, args); } }[name];
    Object.defineProperty(operation, 'length', { value: value.length });
    Object.defineProperty(window, name, { value: operation, writable: true, enumerable: true, configurable: true });
  }
}

function applyCompat(window, protos) {
  const { jsdom } = window[S].compat;
  // The CSS namespace (CSS.supports, CSS.escape) arrived in jsdom 30;
  // libraries feature-detect it (handsontable validates sizes with it).
  if (jsdom < 30) delete window.CSS;
  if (jsdom < 27) {
    delete window.PointerEvent;
    for (const proto of [protos.HTMLElement, protos.SVGElement, protos.Document, protos.Window, protos.ShadowRoot]) {
      if (!proto) continue;
      for (const name of POINTER_HANDLERS) delete proto[name];
    }
  }
}

export function createWindow(options = {}) {
  // Starts as a plain object; becomes a Window once the interfaces exist.
  const window = {};
  const protos = Object.create(null);

  // Interfaces are created on first use (a test touches a few dozen of
  // about 300): the window's constructor property and the internal protos
  // entry start as accessors that create the interface (its parent first)
  // and then become plain data properties. Each interface is created once
  // per window. A constructor property the page deleted or replaced stays
  // so (window.PointerEvent removed by the jsdom profile, mocks).
  const ctors = Object.create(null);
  const lazyGetters = Object.create(null);
  function materialize(name) {
    const existing = ctors[name];
    if (existing) return existing;
    const iface = BY_NAME.get(name);
    const parent = iface.parent ? materialize(iface.parent) : null;
    // Members are defined on an object without a prototype, which V8 keeps
    // as a dictionary: defining them on an object with a prototype walks
    // through a new hidden class per member, rebuilt for every window
    // (CSSStyleProperties' 1,600 accessors took ~1.5 ms). The prototype is
    // set afterwards; own keys, their order and descriptors are the same.
    const proto = Object.create(null);
    const { keys, descriptors, unscopables } = descriptorsOf(iface);
    for (let i = 0; i < keys.length; i++) Object.defineProperty(proto, keys[i], descriptors[i]);
    if (unscopables) {
      const value = Object.create(null);
      for (const member of unscopables) value[member] = true;
      Object.defineProperty(proto, Symbol.unscopables, { value, enumerable: false, writable: false, configurable: true });
    }
    Object.setPrototypeOf(proto, parent ? parent.prototype : Object.prototype);
    // A callback interface with constants (NodeFilter) has a legacy callback
    // interface object: a function that is not a constructor and has no
    // prototype property (a method has neither).
    const ctor = iface.callback
      ? { [name]() { throw new TypeError(`${name} is not a constructor`); } }[name]
      : iface.construct
      ? function (...args) {
        if (!new.target) throw new TypeError(`Failed to construct '${name}': Please use the 'new' operator.`);
        return iface.construct(window, this, args);
      }
      : HTML_CONSTRUCTOR.has(name)
        // [HTMLConstructor]: custom element classes construct through super().
        ? function () { return htmlConstruct(window, ctor, new.target); }
        : function () { throw new TypeError('Illegal constructor'); };
    Object.defineProperty(ctor, 'name', { value: name });
    if (!iface.callback) {
      Object.defineProperty(ctor, 'prototype', { value: proto, writable: false });
      Object.defineProperty(proto, 'constructor', { value: ctor, writable: true, configurable: true });
    }
    // The class string (WebIDL): Object.prototype.toString gives [object Name].
    if (!Object.hasOwn(proto, Symbol.toStringTag)) Object.defineProperty(proto, Symbol.toStringTag, { value: name, configurable: true });
    if (parent) Object.setPrototypeOf(ctor, parent);
    for (const [key, value] of Object.entries(iface.statics ?? {})) {
      Object.defineProperty(ctor, key, { value, enumerable: true, writable: false, configurable: false });
    }
    // Static operations that need the window (AbortSignal.timeout).
    for (const [key, value] of Object.entries(iface.staticMethods?.(window) ?? {})) {
      Object.defineProperty(ctor, key, { value, enumerable: true, writable: true, configurable: true });
    }
    ctors[name] = ctor;
    // CSS value validation: every property's grammar from jsdom 27; before,
    // jsdom checked a few dozen properties ('jsdom25': the same, with
    // url() serialized without quotes, as cssstyle before 4.3.1 did).
    if (name === 'CSSStyleProperties') setValidationMode(proto, window[S].compat.jsdom >= 27 ? 'spec' : window[S].compat.unquotedUrls ? 'jsdom25' : 'jsdom26');
    Object.defineProperty(protos, name, { value: proto, writable: true, enumerable: true, configurable: true });
    if (Object.getOwnPropertyDescriptor(window, name)?.get === lazyGetters[name]) {
      Object.defineProperty(window, name, { value: ctor, writable: true, configurable: true });
    }
    return ctor;
  }
  for (const iface of ORDER) {
    const { name } = iface;
    const get = lazyGetters[name] = () => materialize(name);
    Object.defineProperty(window, name, {
      get,
      // Assigning replaces the constructor property (a mock), as for a
      // writable data property.
      set(value) { Object.defineProperty(window, name, { value, writable: true, configurable: true }); },
      configurable: true,
    });
    Object.defineProperty(protos, name, { get() { return materialize(name).prototype; }, enumerable: true, configurable: true });
  }

  let document;
  const create = (proto, type, extra, doc) => initNode(Object.create(proto), type, doc, extra);
  const internals = {
    protos,
    isWindow: true,
    // Node factories; doc is the owner document (the window's by default).
    // raw: skip custom element handling; proto: the interface to use;
    // sync: run a custom element's constructor now (createElement).
    createElementNS(ns, qualifiedName, doc = document, raw = false, proto = null, sync = false, is = null) {
      const colon = qualifiedName.indexOf(':');
      const tag = colon >= 0 ? qualifiedName.slice(colon + 1) : qualifiedName;
      if (!raw && ns === HTML_NS && hooks.ce !== null) {
        const custom = createCustomElement(doc, tag, is, sync);
        if (custom) return custom;
      }
      const element = create(proto ?? protos[interfaceFor(ns, tag)], ELEMENT_NODE, { tag, ns, attrs: new Map() }, doc);
      // The namespace prefix (createElementNS('...', 'svg:rect'), XML parsing).
      if (colon >= 0) element[S].prefix = qualifiedName.slice(0, colon);
      if (tag === 'iframe' && ns === HTML_NS) doc[S].frameCount = (doc[S].frameCount ?? 0) + 1;
      if (tag === 'slot' && ns === HTML_NS) doc[S].slotCount = (doc[S].slotCount ?? 0) + 1;
      if (tag === 'base' && ns === HTML_NS) doc[S].baseCount = (doc[S].baseCount ?? 0) + 1;
      // A script made by script may run when connected (scripts.js).
      if (tag === 'script' && ns === HTML_NS && !raw) {
        element[S].script = 'ready';
        doc[S].scriptCount = (doc[S].scriptCount ?? 0) + 1;
      }
      if (ns === HTML_NS && ((tag.includes('-') && isValidCustomElementName(tag)) || is !== null)) {
        element[S].ceState = 'undefined';
        element[S].ceIs = is;
      }
      return element;
    },
    createText: (data, doc = document) => create(protos.Text, TEXT_NODE, { data }, doc),
    createComment: (data, doc = document) => create(protos.Comment, COMMENT_NODE, { data }, doc),
    createFragment: (doc = document) => create(protos.DocumentFragment, DOCUMENT_FRAGMENT_NODE, undefined, doc),
    createDoctype: (name, publicId, systemId, doc = document) => create(protos.DocumentType, DOCUMENT_TYPE_NODE, { name, publicId, systemId }, doc),
    createCDATA: (data, doc = document) => create(protos.CDATASection, CDATA_SECTION_NODE, { data }, doc),
    createPI: (target, data, doc = document) => create(protos.ProcessingInstruction, PROCESSING_INSTRUCTION_NODE, { data, target }, doc),
    initDocument: (doc, extra) => initNode(doc, DOCUMENT_NODE, doc, { window, contentType: 'text/html', ...extra }),
    // A document without a browsing context (defaultView null), as made by
    // DOMImplementation and new Document(); XML documents keep names as given.
    // DOMParser's XML documents are XML documents but not XMLDocument
    // objects (plain: true).
    createDocument: ({ contentType = 'text/html', xml = false, plain = false } = {}) => internals.initDocument(
      Object.create(xml && !plain ? protos.XMLDocument : protos.Document), { noView: true, url: 'about:blank', contentType, xml }),
    // Errors from event listeners that no 'error' listener handled. Logged
    // like jsdom does; test environments replace this to fail the test.
    onUnhandledError: (error) => console.error(error),
    // As jsdom reports unimplemented features (form submission, navigation)
    // through its virtual console.
    notImplemented: (message) => console.error(`Not implemented: ${message}`),
    // An iframe's nested window (frames.js).
    // A frame's window behaves like the same jsdom generation as its parent.
    createNestedWindow: ({ url, parent, frameElement }) => createWindow({ url, jsdom: parent[S].compat.version, cssstyle: parent[S].compat.cssstyle, fastFrames: parent[S].fastFrames, nested: { parent, frameElement } }),
    parentWindow: options.nested?.parent ?? null,
    frameElement: options.nested?.frameElement ?? null,
  };
  Object.setPrototypeOf(window, protos.Window);
  // Named access (window[id]): the named properties object between
  // Window.prototype and EventTarget.prototype.
  Object.setPrototypeOf(protos.Window, namedPropertiesObject(window, window, Object.getPrototypeOf(protos.Window)));
  Object.defineProperty(window, S, { value: internals });
  setupWindow(window, options);
  applyCompat(window, protos);
  installGlobalOperations(window, protos.Window);
  internals.customElements = createRegistry(window);

  document = internals.initDocument(Object.create(protos.Document));
  // A nested window's about:blank document has no doctype.
  if (!options.nested) insert(document, internals.createDoctype('html', '', ''), null);
  const html = insert(document, internals.createElementNS(HTML_NS, 'html'), null);
  insert(html, internals.createElementNS(HTML_NS, 'head'), null);
  insert(html, internals.createElementNS(HTML_NS, 'body'), null);

  window.document = document;
  window.window = window;
  window.self = window;
  return window;
}
