// createWindow(): a fresh window with its own prototypes and constructors for
// every interface (so patches made in one window cannot leak into another),
// built from property descriptors that are prepared once per module load.
import {
  S, hooks, initNode, insert, ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE,
} from './internal.js';
import { INTERFACES, SVG_ELEMENTS, HTML_NS, SVG_NS } from './interfaces.js';
import { HTML_ELEMENTS, PLAIN_TAGS } from './html-elements.js';
import { setupWindow } from './window-features.js';
import { createCustomElement, createRegistry, htmlConstruct, isValidCustomElementName } from './custom-elements.js';

// Once per module load: descriptors per interface, parents before children.
const DESCRIPTORS = new Map();
const ORDER = [];
{
  const byName = new Map(INTERFACES.map((i) => [i.name, i]));
  const seen = new Set();
  const visit = (iface) => {
    if (seen.has(iface.name)) return;
    seen.add(iface.name);
    if (iface.parent) visit(byName.get(iface.parent));
    ORDER.push(iface);
  };
  for (const iface of INTERFACES) visit(iface);
  for (const iface of INTERFACES) {
    const descriptors = {};
    for (const key of Reflect.ownKeys(iface.members)) {
      const d = Object.getOwnPropertyDescriptor(iface.members, key);
      const v = d.value;
      if (v && typeof v === 'object' && 'constant' in v) {
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
    DESCRIPTORS.set(iface.name, descriptors);
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

export function createWindow(options = {}) {
  // Starts as a plain object; becomes a Window once the interfaces exist.
  const window = {};
  const protos = Object.create(null);

  for (const iface of ORDER) {
    const parent = iface.parent ? window[iface.parent] : null;
    const proto = Object.create(parent ? parent.prototype : Object.prototype);
    Object.defineProperties(proto, DESCRIPTORS.get(iface.name));
    const ctor = iface.construct
      ? function (...args) {
        if (!new.target) throw new TypeError(`Failed to construct '${iface.name}': Please use the 'new' operator.`);
        return iface.construct(window, this, args);
      }
      : HTML_CONSTRUCTOR.has(iface.name)
        // [HTMLConstructor]: custom element classes construct through super().
        ? function () { return htmlConstruct(window, ctor, new.target); }
        : function () { throw new TypeError('Illegal constructor'); };
    Object.defineProperty(ctor, 'name', { value: iface.name });
    Object.defineProperty(ctor, 'prototype', { value: proto, writable: false });
    Object.defineProperty(proto, 'constructor', { value: ctor, writable: true, configurable: true });
    // The class string (WebIDL): Object.prototype.toString gives [object Name].
    if (!Object.hasOwn(proto, Symbol.toStringTag)) Object.defineProperty(proto, Symbol.toStringTag, { value: iface.name, configurable: true });
    if (parent) Object.setPrototypeOf(ctor, parent);
    for (const [key, value] of Object.entries(iface.statics ?? {})) {
      Object.defineProperty(ctor, key, { value, enumerable: true, writable: false, configurable: false });
    }
    Object.defineProperty(window, iface.name, { value: ctor, writable: true, configurable: true });
    protos[iface.name] = proto;
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
      const tag = qualifiedName.includes(':') ? qualifiedName.slice(qualifiedName.indexOf(':') + 1) : qualifiedName;
      if (!raw && ns === HTML_NS && hooks.ce !== null) {
        const custom = createCustomElement(doc, tag, is, sync);
        if (custom) return custom;
      }
      const element = create(proto ?? protos[interfaceFor(ns, tag)], ELEMENT_NODE, { tag, ns, attrs: new Map() }, doc);
      if (tag === 'iframe' && ns === HTML_NS) doc[S].frameCount = (doc[S].frameCount ?? 0) + 1;
      if (tag === 'slot' && ns === HTML_NS) doc[S].slotCount = (doc[S].slotCount ?? 0) + 1;
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
    initDocument: (doc, extra) => initNode(doc, DOCUMENT_NODE, doc, { window, contentType: 'text/html', ...extra }),
    // A document without a browsing context (defaultView null), as made by
    // DOMImplementation and new Document(); XML documents keep names as given.
    createDocument: ({ contentType = 'text/html', xml = false } = {}) => internals.initDocument(
      Object.create(xml ? protos.XMLDocument : protos.Document), { noView: true, url: 'about:blank', contentType, xml }),
    // Errors from event listeners that no 'error' listener handled. Logged
    // like jsdom does; test environments replace this to fail the test.
    onUnhandledError: (error) => console.error(error),
    // As jsdom reports unimplemented features (form submission, navigation)
    // through its virtual console.
    notImplemented: (message) => console.error(`Not implemented: ${message}`),
    // An iframe's nested window (frames.js).
    createNestedWindow: ({ url, parent, frameElement }) => createWindow({ url, nested: { parent, frameElement } }),
    parentWindow: options.nested?.parent ?? null,
    frameElement: options.nested?.frameElement ?? null,
  };
  Object.setPrototypeOf(window, protos.Window);
  Object.defineProperty(window, S, { value: internals });
  setupWindow(window, options);
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
