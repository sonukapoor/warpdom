// createWindow(): a fresh window with its own prototypes and constructors for
// every interface (so patches made in one window cannot leak into another),
// built from property descriptors that are prepared once per module load.
import {
  S, initNode, insert, ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE,
} from './internal.js';
import { INTERFACES, SVG_ELEMENTS, HTML_NS, SVG_NS } from './interfaces.js';
import { HTML_ELEMENTS, PLAIN_TAGS } from './html-elements.js';
import { setupWindow } from './window-features.js';

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
      : function () { throw new TypeError('Illegal constructor'); };
    Object.defineProperty(ctor, 'name', { value: iface.name });
    Object.defineProperty(ctor, 'prototype', { value: proto, writable: false });
    Object.defineProperty(proto, 'constructor', { value: ctor, writable: true, configurable: true });
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
    createElementNS(ns, qualifiedName, doc = document) {
      const tag = qualifiedName.includes(':') ? qualifiedName.slice(qualifiedName.indexOf(':') + 1) : qualifiedName;
      return create(protos[interfaceFor(ns, tag)], ELEMENT_NODE, { tag, ns, attrs: new Map() }, doc);
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
  };
  Object.setPrototypeOf(window, protos.Window);
  Object.defineProperty(window, S, { value: internals });
  setupWindow(window, options);

  document = internals.initDocument(Object.create(protos.Document));
  insert(document, internals.createDoctype('html', '', ''), null);
  const html = insert(document, internals.createElementNS(HTML_NS, 'html'), null);
  insert(html, internals.createElementNS(HTML_NS, 'head'), null);
  insert(html, internals.createElementNS(HTML_NS, 'body'), null);

  window.document = document;
  window.window = window;
  window.self = window;
  return window;
}
