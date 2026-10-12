// Interface implementations, declared once per module load. Each entry gives
// the interface's parent and its members; window.js turns them into property
// descriptors once, and into per-window prototypes and constructors on every
// createWindow(). Members sit on the same interface as in jsdom, because
// tests spy on them there.
import {
  S, state, initNode, insert, remove, asciiLowercase, validElementLocalName, htmlElementName, replace, replaceAll, checkReplaceAll, textOf, contains, domError, rootOf, nextInTree,
  childArray, elementChildArray, collectElements, elementById, setData, replaceData, adopt, shadowIncludingRoot, reactionScope,
  ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE, HTML_NS, SVG_NS, connected,
  CDATA_SECTION_NODE, PROCESSING_INSTRUCTION_NODE, isCharacterData,
} from './internal.js';
import { XML_INTERFACES, XML_DOCUMENT_MEMBERS } from './xml.js';
import { CSS_INTERFACES, styleOf } from './css.js';
import { hasReflections, reflectedMembers } from './reflect.js';
import { GLOBAL_HANDLER_MEMBERS, WINDOW_HANDLER_MEMBERS, eventHandlerAttributesAdded, handlerMembers } from './event-handlers.js';
import { CUSTOM_ELEMENT_INTERFACES } from './custom-elements.js';
import { RANGE_INTERFACES, newRange, getSelection, splitText, normalize } from './ranges.js';
import { CSSOM_INTERFACES, STYLE_ELEMENT_MEMBERS, documentStyleSheets } from './cssom.js';
import { FOCUS_MEMBERS, DOCUMENT_FOCUS_MEMBERS } from './focus.js';
import { FORM_INTERFACES, FORM_MEMBERS, clickMember } from './forms.js';
import { GEOMETRY_INTERFACES, ELEMENT_LAYOUT, HTML_ELEMENT_LAYOUT } from './layout.js';
import { querySelectorAll as selectAll, matches as matchSelector, closest as closestMatch } from './selectors.js';
import { DOM_PARSING_INTERFACES, innerMarkup, outerMarkup } from './dom-parsing.js';
import { FILE_READER_INTERFACES } from './file-reader.js';
import { ABORT_INTERFACES } from './abort.js';
import { IFRAME_MEMBERS, WINDOW_FRAME_MEMBERS } from './frames.js';
import { STORAGE_INTERFACE, STORAGE_WINDOW_MEMBERS } from './storage.js';
import { PROGRESS_MEMBERS, METER_MEMBERS } from './progress-meter.js';
import { SLOT_MEMBERS, SLOTTABLE_MEMBERS } from './slots.js';
import { MEDIA_MEMBERS, MEDIA_STATICS, VIDEO_MEMBERS, TIME_RANGES_INTERFACE, IMAGE_MEMBERS } from './media.js';
import { TABLE_MEMBERS, SECTION_MEMBERS, ROW_MEMBERS, CELL_MEMBERS } from './tables.js';
import { HYPERLINK_MEMBERS } from './hyperlinks.js';
import { BASE_MEMBERS, nodeBaseURI } from './base-url.js';
import { documentCookie, setDocumentCookie } from './cookies.js';
import { COLLECTION_INTERFACES, liveList } from './collections.js';
import { HTML_ELEMENTS } from './html-elements.js';
import { EVENT_INTERFACES, createEvent, retarget } from './events.js';
import { MUTATION_INTERFACES } from './mutation.js';
import { FEATURE_INTERFACES, WINDOW_MEMBERS } from './window-features.js';
import { TRAVERSAL_INTERFACES, createTreeWalker, createNodeIterator } from './traversal.js';
import { parseFragment, parseDocument, serializeChildren, setInnerHTML, setOuterHTML, insertAdjacentHTML, templateContent } from './html.js';
import {
  ATTRIBUTE_INTERFACES, writeAttribute, attrName, attrNode, namedNodeMap, tokenList, domStringMap,
  setAttributeNode, removeAttributeNode, createAttribute, findAttributeNS, setAttributeNS, checkAttributeName, validateAndExtract, createAttributeNS, attrInfo,
} from './attributes.js';

// Member objects merged in order, as a list window.js reads when it first
// creates the interface (a later object's member replaces an earlier one's
// in its place). Nothing is copied at load.
const mix = (...objects) => objects.flat();

const win = (node) => state(node).doc[S].window;
const internals = (node) => win(node)[S];

const queries = {
  querySelector(selector) {
    state(this);
    return selectAll(this, selector, true)[0] ?? null;
  },
  querySelectorAll(selector) {
    state(this);
    const found = selectAll(this, selector);
    return liveList(internals(this).protos.NodeList, () => found);
  },
};

const firstElement = (s) => { for (let c = s.first; c; c = c[S].next) if (c[S].type === ELEMENT_NODE) return c; return null; };
const lastElement = (s) => { for (let c = s.last; c; c = c[S].prev) if (c[S].type === ELEMENT_NODE) return c; return null; };

// Nodes and strings (as text) for append/prepend/before/after/replaceWith.
function toNode(node, items) {
  const doc = state(node).type === DOCUMENT_NODE ? node : state(node).doc;
  const nodes = items.map((x) => (x != null && x[S] ? x : doc.createTextNode(String(x))));
  if (nodes.length === 1) return nodes[0];
  const frag = doc.createDocumentFragment();
  for (const n of nodes) insert(frag, n, null);
  return frag;
}

// ParentNode mixin (Document, DocumentFragment, Element).
const parentNode = mix(queries, {
  [Symbol.unscopables]: { unscopables: ['prepend', 'append', 'replaceChildren'] },
  get children() {
    const s = state(this);
    return s.childElements ?? (s.childElements = liveList(internals(this).protos.HTMLCollection, () => elementChildArray(this)));
  },
  get firstElementChild() { return firstElement(state(this)); },
  get lastElementChild() { return lastElement(state(this)); },
  get childElementCount() { return elementChildArray(this).length; },
  append(...items) { if (items.length) insert(this, toNode(this, items), null); },
  prepend(...items) { if (items.length) insert(this, toNode(this, items), state(this).first); },
  replaceChildren(...items) {
    const node = items.length ? toNode(this, items) : null;
    state(this);
    if (node) checkReplaceAll(this, node);
    replaceAll(this, node);
  },
});

// The first sibling of node in direction dir ('prev' or 'next') that is not
// one of items (ChildNode's viable previous and next siblings).
function viableSibling(node, dir, items) {
  let n = node[S][dir];
  while (n !== null && items.includes(n)) n = n[S][dir];
  return n;
}

// ChildNode mixin (Element, CharacterData, DocumentType).
const childNode = {
  [Symbol.unscopables]: { unscopables: ['before', 'after', 'replaceWith', 'remove'] },
  before(...items) {
    const p = state(this).parent;
    if (!p || !items.length) return;
    const prev = viableSibling(this, 'prev', items);
    const node = toNode(this, items);
    insert(p, node, prev === null ? p[S].first : prev[S].next);
  },
  after(...items) {
    const p = state(this).parent;
    if (!p || !items.length) return;
    const next = viableSibling(this, 'next', items);
    insert(p, toNode(this, items), next);
  },
  replaceWith(...items) {
    const p = state(this).parent;
    if (!p) return;
    const next = viableSibling(this, 'next', items);
    const node = items.length ? toNode(this, items) : null;
    // this may have moved into the new nodes' fragment.
    if (this[S].parent === p) {
      if (node) replace(p, node, this);
      else remove(p, this);
    } else if (node) insert(p, node, next);
  },
  remove() { const p = state(this).parent; if (p) remove(p, this); },
};

// NonDocumentTypeChildNode mixin (Element, CharacterData).
const elementSiblings = {
  get previousElementSibling() {
    for (let n = state(this).prev; n; n = n[S].prev) if (n[S].type === ELEMENT_NODE) return n;
    return null;
  },
  get nextElementSibling() {
    for (let n = state(this).next; n; n = n[S].next) if (n[S].type === ELEMENT_NODE) return n;
    return null;
  },
};

const NODE_TYPES = {
  ELEMENT_NODE: 1, ATTRIBUTE_NODE: 2, TEXT_NODE: 3, CDATA_SECTION_NODE: 4, ENTITY_REFERENCE_NODE: 5,
  ENTITY_NODE: 6, PROCESSING_INSTRUCTION_NODE: 7, COMMENT_NODE: 8, DOCUMENT_NODE: 9, DOCUMENT_TYPE_NODE: 10,
  DOCUMENT_FRAGMENT_NODE: 11, NOTATION_NODE: 12, DOCUMENT_POSITION_DISCONNECTED: 1, DOCUMENT_POSITION_PRECEDING: 2,
  DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_CONTAINS: 8, DOCUMENT_POSITION_CONTAINED_BY: 16,
  DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32,
};

const ancestry = (node) => { const chain = []; for (let n = node; n; n = n[S].parent) chain.push(n); return chain.reverse(); };

function compareDocumentPosition(a, b) {
  if (a === b) return 0;
  if (rootOf(a) !== rootOf(b)) return 1 | 32 | 4;
  if (contains(a, b)) return 16 | 4;
  if (contains(b, a)) return 8 | 2;
  const ca = ancestry(a), cb = ancestry(b);
  let i = 0;
  while (ca[i] === cb[i]) i++;
  // ca[i] and cb[i] are siblings: b precedes a if it comes first.
  for (let n = ca[i][S].next; n; n = n[S].next) if (n === cb[i]) return 4;
  return 2;
}

const ATTRIBUTE_NODE = 2;
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

// The element namespace lookups start from (DOM "locate a namespace" and
// "locate a namespace prefix"): the node itself, a document's element, an
// attribute's element, or a character data node's parent element.
function namespaceElement(node) {
  const s = node[S];
  switch (s.type) {
    case ELEMENT_NODE: return node;
    case DOCUMENT_NODE: return firstElement(s);
    case DOCUMENT_TYPE_NODE: case DOCUMENT_FRAGMENT_NODE: return null;
    case ATTRIBUTE_NODE: return s.element ?? null;
    default: { const p = s.parent; return p !== null && p[S].type === ELEMENT_NODE ? p : null; }
  }
}

// Locate a namespace (DOM) for prefix (null: the default namespace).
function locateNamespace(node, prefix) {
  for (let el = namespaceElement(node); el !== null;) {
    const s = el[S];
    if (prefix === 'xml') return XML_NAMESPACE;
    if (prefix === 'xmlns') return XMLNS_NAMESPACE;
    if (s.ns !== null && (s.prefix ?? null) === prefix) return s.ns;
    if (s.attrNS) {
      for (const [name, info] of s.attrNS) {
        if (info.ns !== XMLNS_NAMESPACE) continue;
        if ((info.prefix === 'xmlns' && info.local === prefix) || (prefix === null && info.prefix === null && info.local === 'xmlns')) {
          const value = s.attrs.get(name);
          return value === '' ? null : value;
        }
      }
    }
    const p = s.parent;
    el = p !== null && p[S].type === ELEMENT_NODE ? p : null;
  }
  return null;
}

// Locate a namespace prefix (DOM) for namespace, from element up.
function locatePrefix(element, namespace) {
  for (let el = element; el !== null;) {
    const s = el[S];
    if (s.ns === namespace && s.prefix !== undefined) return s.prefix;
    if (s.attrNS) {
      for (const [name, info] of s.attrNS) {
        if (info.ns === XMLNS_NAMESPACE && info.prefix === 'xmlns' && s.attrs.get(name) === namespace) return info.local;
      }
    }
    const p = s.parent;
    el = p !== null && p[S].type === ELEMENT_NODE ? p : null;
  }
  return null;
}

// An attribute's namespace and local name (Attr views: attributes.js).
const elementAttrInfo = (s, name) => s.attrNS?.get(name) ?? null;

// Node equality (DOM "equals").
function isEqualNode(a, b) {
  const as = a[S];
  const bs = b[S];
  if (as.type !== bs.type) return false;
  switch (as.type) {
    case DOCUMENT_TYPE_NODE:
      if (as.name !== bs.name || as.publicId !== bs.publicId || as.systemId !== bs.systemId) return false;
      break;
    case ELEMENT_NODE: {
      if (as.ns !== bs.ns || as.tag !== bs.tag || (as.prefix ?? null) !== (bs.prefix ?? null) || as.attrs.size !== bs.attrs.size) return false;
      for (const [name, value] of as.attrs) {
        const info = elementAttrInfo(as, name);
        const ns = info?.ns ?? null;
        const local = info?.local ?? name;
        let found = false;
        for (const [otherName, otherValue] of bs.attrs) {
          const other = elementAttrInfo(bs, otherName);
          if (otherValue === value && (other?.ns ?? null) === ns && (other?.local ?? otherName) === local) { found = true; break; }
        }
        if (!found) return false;
      }
      break;
    }
    case ATTRIBUTE_NODE:
      return a.namespaceURI === b.namespaceURI && a.localName === b.localName && a.value === b.value;
    default:
      // Character data (and processing instructions: target too).
      if (as.data !== bs.data || as.target !== bs.target) return false;
  }
  if (as.count !== bs.count) return false;
  for (let x = as.first, y = bs.first; x !== null; x = x[S].next, y = y[S].next) if (!isEqualNode(x, y)) return false;
  return true;
}

// ASCII lowercase (DOM names): other characters keep their case.
const asciiLower = asciiLowercase;
const invalidName = (name) => domError(`'${name}' is not a valid name.`, 'InvalidCharacterError');
const throwInvalidName = (name) => { throw invalidName(name); };
// createElement names seen before (validated and lowercased), so the usual
// call costs one map lookup.
const HTML_NAMES = new Map();
function htmlName(name) {
  const lower = htmlElementName(name);
  if (lower === null) throwInvalidName(name);
  if (HTML_NAMES.size < 10000) HTML_NAMES.set(name, lower);
  return lower;
}

const hasOnAttribute = (attrs) => { for (const name of attrs.keys()) if (name.startsWith('on')) return true; return false; };

export const clone = (node, deep, doc) => reactionScope(cloneNode, node, deep, doc);

function cloneNode(node, deep, doc) {
  const s = state(node);
  const w = doc[S].window[S];
  let copy;
  if (s.type === ELEMENT_NODE) {
    copy = w.createElementNS(s.ns, s.prefix ? `${s.prefix}:${s.tag}` : s.tag, doc, false, null, false, s.ceIs ?? null);
    copy[S].attrs = new Map(s.attrs);
    if (s.attrNS) copy[S].attrNS = new Map(s.attrNS);
    if (s.handlers || hasOnAttribute(s.attrs)) eventHandlerAttributesAdded(copy);
  } else if (s.type === TEXT_NODE) copy = w.createText(s.data, doc);
  else if (s.type === COMMENT_NODE) copy = w.createComment(s.data, doc);
  else if (s.type === CDATA_SECTION_NODE) copy = w.createCDATA(s.data, doc);
  else if (s.type === PROCESSING_INSTRUCTION_NODE) copy = w.createPI(s.target, s.data, doc);
  else if (s.type === DOCUMENT_FRAGMENT_NODE) copy = w.createFragment(doc);
  else if (s.type === DOCUMENT_TYPE_NODE) copy = w.createDoctype(s.name, s.publicId, s.systemId, doc);
  else if (s.type === DOCUMENT_NODE) {
    // A document of the same interface, type, URL and mode, without a
    // browsing context; its children belong to it.
    copy = w.initDocument(Object.create(Object.getPrototypeOf(node)), {
      noView: true, url: node.URL, contentType: s.contentType, xml: !!s.xml, mode: s.mode ?? 'no-quirks',
    });
    doc = copy;
  } else if (s.type === ATTRIBUTE_NODE) {
    copy = initNode(Object.create(w.protos.Attr), ATTRIBUTE_NODE, doc, { name: s.name, element: null, detachedValue: node.value, info: attrInfo(s) });
  } else throw domError('Cloning this node is not supported yet.', 'NotSupportedError');
  if (deep) {
    for (let c = s.first; c; c = c[S].next) insert(copy, cloneNode(c, true, doc), null);
    // Template cloning steps (HTML): a deep clone copies the template contents.
    if (s.type === ELEMENT_NODE && isTemplateEl(node) && s.content) {
      const content = templateContent(copy);
      for (let c = s.content[S].first; c; c = c[S].next) insert(content, cloneNode(c, true, content[S].doc), null);
    }
  }
  // A clone's internal state is not enumerable. Jest's assertion messages
  // copy a DOM node with cloneNode(true), then walk the copy's enumerable
  // properties, symbols included; through an enumerable state they reached
  // the whole document and React's frozen props, and threw. Only clones:
  // defining the property is several times slower than assigning it, so
  // nodes created otherwise keep the fast assignment.
  Object.defineProperty(copy, S, { value: copy[S], writable: true, configurable: true, enumerable: false });
  return copy;
}

// An element's qualified name: prefix (set only when there is one) and local name.
const qualifiedName = (s) => (s.prefix === undefined ? s.tag : `${s.prefix}:${s.tag}`);
// Uppercased for HTML elements in HTML documents only (cached per element).
const qualifiedTagName = (s) => (s.ns === HTML_NS && !s.doc[S].xml ? (s.upper ?? (s.upper = qualifiedName(s).toUpperCase())) : qualifiedName(s));
const shadowState = (self) => {
  const s = state(self);
  if (!s.shadow) throw new TypeError('Illegal invocation');
  return s;
};

// Valid shadow host names (DOM): autonomous custom elements and these.
const SHADOW_HOSTS = new Set(['article', 'aside', 'blockquote', 'body', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'main', 'nav', 'p', 'section', 'span']);

// Attach a shadow root (DOM), without declarative shadow roots or custom
// element definitions yet.
function attachShadow(element, init) {
  const es = element[S];
  const mode = init?.mode;
  if (mode !== 'open' && mode !== 'closed') throw new TypeError("Failed to execute 'attachShadow' on 'Element': The provided value is not a valid enum value of type ShadowRootMode.");
  if (es.ns !== HTML_NS) throw domError("Failed to execute 'attachShadow' on 'Element': This element does not support attachShadow", 'NotSupportedError');
  const customName = es.tag.includes('-');
  if (!customName && !SHADOW_HOSTS.has(es.tag)) throw domError("Failed to execute 'attachShadow' on 'Element': This element does not support attachShadow", 'NotSupportedError');
  if (es.shadowRoot) throw domError("Failed to execute 'attachShadow' on 'Element': Shadow root cannot be created on a host which already hosts a shadow tree.", 'NotSupportedError');
  const shadow = initNode(Object.create(internals(element).protos.ShadowRoot), DOCUMENT_FRAGMENT_NODE, es.doc, {
    shadow: true, host: element, mode, delegatesFocus: !!init.delegatesFocus, serializable: !!init.serializable,
    slotAssignment: init.slotAssignment === 'manual' ? 'manual' : 'named', clonable: !!init.clonable,
  });
  es.shadowRoot = shadow;
  return shadow;
}

function documentWrite(doc, text) {
  const s = state(doc);
  if (s.xml) throw domError("Failed to execute 'write' on 'Document': Only HTML documents support write().", 'InvalidStateError');
  if (s.writeBuffer === undefined) doc.open();
  s.writeBuffer += text;
  while (s.first) remove(doc, s.first);
  parseDocument(doc, s.writeBuffer);
}

const isHTMLTag = (node, tag) => { const s = node[S]; return s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === tag; };
const htmlElement = (doc) => { const el = firstElement(doc[S]); return el && isHTMLTag(el, 'html') ? el : null; };
function* descendantElements(root) {
  for (let n = root[S].first; n; n = nextInTree(n, root)) if (n[S].type === ELEMENT_NODE) yield n;
}

// Text nodes, CDATA sections included.
const isText = (node) => { const t = node[S].type; return t === TEXT_NODE || t === CDATA_SECTION_NODE; };

const isTemplateEl = (el) => el[S].ns === HTML_NS && el[S].tag === 'template';

const reflect = (attr) => ({
  get() { return state(this).attrs.get(attr) ?? ''; },
  set(v) { writeAttribute(this, attr, String(v)); },
});

const htmlOrSvgElement = {
  get dataset() { state(this); return domStringMap(this, writeAttribute); },
};

const inlineStyle = {
  get style() { return styleOf(this, internals(this).protos.CSSStyleProperties); },
  set style(text) { styleOf(this, internals(this).protos.CSSStyleProperties).cssText = text; },
};

export const INTERFACES = [
  ...CSS_INTERFACES,
  ...COLLECTION_INTERFACES,
  ...FORM_INTERFACES,
  ...EVENT_INTERFACES,
  ...DOM_PARSING_INTERFACES,
  ...XML_INTERFACES,
  ...FILE_READER_INTERFACES,
  ...ABORT_INTERFACES,
  STORAGE_INTERFACE,
  TIME_RANGES_INTERFACE,
  ...MUTATION_INTERFACES,
  ...FEATURE_INTERFACES,
  ...TRAVERSAL_INTERFACES,
  ...ATTRIBUTE_INTERFACES,
  ...GEOMETRY_INTERFACES,
  ...CSSOM_INTERFACES,
  ...RANGE_INTERFACES,
  ...CUSTOM_ELEMENT_INTERFACES,
  { name: 'Window', parent: 'EventTarget', members: mix(GLOBAL_HANDLER_MEMBERS, WINDOW_HANDLER_MEMBERS, WINDOW_MEMBERS, WINDOW_FRAME_MEMBERS, STORAGE_WINDOW_MEMBERS) },
  {
    name: 'Node',
    parent: 'EventTarget',
    statics: NODE_TYPES,
    members: {
      ...Object.fromEntries(Object.entries(NODE_TYPES).map(([k, v]) => [k, { constant: v }])),
      get nodeType() { return state(this).type; },
      get nodeName() {
        const s = state(this);
        switch (s.type) {
          case ELEMENT_NODE: return qualifiedTagName(s);
          case TEXT_NODE: return '#text';
          case COMMENT_NODE: return '#comment';
          case CDATA_SECTION_NODE: return '#cdata-section';
          case PROCESSING_INSTRUCTION_NODE: return s.target;
          case DOCUMENT_NODE: return '#document';
          case DOCUMENT_TYPE_NODE: return s.name;
          default: return '#document-fragment';
        }
      },
      get nodeValue() { const s = state(this); return isCharacterData(s.type) ? s.data : null; },
      set nodeValue(v) { const s = state(this); if (isCharacterData(s.type)) setData(this, String(v ?? '')); },
      get ownerDocument() { const s = state(this); return s.type === DOCUMENT_NODE ? null : s.doc; },
      get parentNode() { return state(this).parent; },
      get parentElement() { const p = state(this).parent; return p && p[S].type === ELEMENT_NODE ? p : null; },
      get childNodes() {
        const s = state(this);
        return s.childList ?? (s.childList = liveList(internals(this).protos.NodeList, () => childArray(this)));
      },
      get firstChild() { return state(this).first; },
      get lastChild() { return state(this).last; },
      get nextSibling() { return state(this).next; },
      get previousSibling() { return state(this).prev; },
      get isConnected() { state(this); return connected(this); },
      get baseURI() { return nodeBaseURI(this); },
      getRootNode(options) { state(this); return options?.composed ? shadowIncludingRoot(this) : rootOf(this); },
      get textContent() { const t = state(this).type; return t === DOCUMENT_NODE || t === DOCUMENT_TYPE_NODE ? null : textOf(this); },
      set textContent(value) {
        const s = state(this);
        if (s.type === DOCUMENT_NODE || s.type === DOCUMENT_TYPE_NODE) return;
        if (isCharacterData(s.type)) { setData(this, String(value ?? '')); return; }
        const text = value == null ? '' : String(value);
        replaceAll(this, text ? internals(this).createText(text, s.doc) : null);
      },
      appendChild(node) { return insert(this, node, null); },
      insertBefore(node, ref) {
        // The child argument is required (it may be null or undefined).
        if (ref === undefined && arguments.length < 2) throw new TypeError("Failed to execute 'insertBefore' on 'Node': 2 arguments required, but only 1 present.");
        return insert(this, node, ref ?? null);
      },
      removeChild(node) { return remove(this, node); },
      replaceChild(node, child) { return replace(this, node, child); },
      cloneNode(deep = false) { const s = state(this); return clone(this, deep, s.type === DOCUMENT_NODE ? this : s.doc); },
      contains(node) { return node != null && contains(this, node); },
      compareDocumentPosition(other) { return compareDocumentPosition(this, other); },
      isSameNode(other) { return this === other; },
      lookupNamespaceURI(prefix) {
        state(this);
        const p = prefix == null || prefix === '' ? null : String(prefix);
        return locateNamespace(this, p);
      },
      lookupPrefix(namespace) {
        state(this);
        if (namespace == null || namespace === '') return null;
        const start = namespaceElement(this);
        return start === null ? null : locatePrefix(start, String(namespace));
      },
      isDefaultNamespace(namespace) {
        state(this);
        const ns = namespace == null || namespace === '' ? null : String(namespace);
        return locateNamespace(this, null) === ns;
      },
      isEqualNode(other) { state(this); return other != null && isEqualNode(this, state(other) && other); },
      hasChildNodes() { return state(this).count > 0; },
      normalize() { state(this); normalize(this); },
    },
  },
  {
    name: 'Document',
    parent: 'Node',
    // new Document(): an XML document without a browsing context, as in jsdom.
    construct: (w, self) => w[S].initDocument(self, { noView: true, url: 'about:blank', contentType: 'application/xml', xml: true }),
    members: mix(parentNode, DOCUMENT_FOCUS_MEMBERS, GLOBAL_HANDLER_MEMBERS, XML_DOCUMENT_MEMBERS, {
      get defaultView() { const s = state(this); return s.noView ? null : s.window; },
      get URL() { const s = state(this); return s.url ?? s.window[S].url.href; },
      get documentURI() { return this.URL; },
      // Page visibility: a document in a window is always visible (as in jsdom
      // with pretendToBeVisual, which test environments use); one without a
      // browsing context is hidden.
      get visibilityState() { return state(this).noView ? 'hidden' : 'visible'; },
      get hidden() { return !!state(this).noView; },
      ...handlerMembers(['onreadystatechange', 'onvisibilitychange']),
      get cookie() { state(this); return documentCookie(this); },
      set cookie(v) { state(this); setDocumentCookie(this, v); },
      get location() { const s = state(this); return s.noView ? null : s.window[S].location; },
      get documentElement() { return firstElement(state(this)); },
      get doctype() {
        for (let c = state(this).first; c; c = c[S].next) if (c[S].type === DOCUMENT_TYPE_NODE) return c;
        return null;
      },
      get head() {
        const html = htmlElement(this);
        if (html) for (let c = html[S].first; c; c = c[S].next) if (isHTMLTag(c, 'head')) return c;
        return null;
      },
      get body() {
        const html = htmlElement(this);
        if (html) for (let c = html[S].first; c; c = c[S].next) if (isHTMLTag(c, 'body') || isHTMLTag(c, 'frameset')) return c;
        return null;
      },
      // The html element's dir attribute, limited to only known values.
      get dir() { const html = htmlElement(this); return html ? knownDir(html[S].attrs.get('dir')) : ''; },
      set dir(v) { const html = htmlElement(this); if (html) writeAttribute(html, 'dir', String(v)); },
      get title() {
        state(this);
        for (const el of descendantElements(this)) {
          if (isHTMLTag(el, 'title')) {
            let text = '';
            for (let c = el[S].first; c; c = c[S].next) if (c[S].type === TEXT_NODE) text += c[S].data;
            return text.replace(/[\t\n\f\r ]+/g, ' ').trim();
          }
        }
        return '';
      },
      set title(value) {
        state(this);
        if (!this.documentElement) return;
        let title = null;
        for (const el of descendantElements(this)) if (isHTMLTag(el, 'title')) { title = el; break; }
        if (!title) {
          const head = this.head;
          if (!head) return;
          title = insert(head, internals(this).createElementNS(HTML_NS, 'title', this), null);
        }
        title.textContent = String(value);
      },
      get styleSheets() { state(this); return documentStyleSheets(this); },
      createRange() { const s = state(this); return newRange(s.window, this, 0); },
      // Scripts never run, so there is no currently executing script.
      get currentScript() { state(this); return null; },
      // document.open/write/close (HTML 8.4): open() empties the document
      // and starts an input stream; each write appends to it and the
      // document is reparsed from the stream, so content is there at once.
      open() {
        const s = state(this);
        if (s.xml) throw domError("Failed to execute 'open' on 'Document': Only HTML documents support open().", 'InvalidStateError');
        while (s.first) remove(this, s.first);
        s.writeBuffer = '';
        return this;
      },
      write(...text) { documentWrite(this, text.join('')); },
      writeln(...text) { documentWrite(this, `${text.join('')}\n`); },
      close() {
        const s = state(this);
        if (s.xml) throw domError("Failed to execute 'close' on 'Document': Only HTML documents support close().", 'InvalidStateError');
        s.writeBuffer = undefined;
      },
      get scripts() { return documentCollection(this, 'scripts', (el) => isHTMLTag(el, 'script')); },
      get forms() { return documentCollection(this, 'forms', (el) => isHTMLTag(el, 'form')); },
      get images() { return documentCollection(this, 'images', (el) => isHTMLTag(el, 'img')); },
      get embeds() { return documentCollection(this, 'embeds', (el) => isHTMLTag(el, 'embed')); },
      get plugins() { return this.embeds; },
      get links() { return documentCollection(this, 'links', (el) => (isHTMLTag(el, 'a') || isHTMLTag(el, 'area')) && el[S].attrs.has('href')); },
      get anchors() { return documentCollection(this, 'anchors', (el) => isHTMLTag(el, 'a') && el[S].attrs.has('name')); },
      getSelection() { state(this); return getSelection(this); },
      get implementation() {
        const s = state(this);
        if (!s.implementation) {
          s.implementation = Object.create(internals(this).protos.DOMImplementation);
          s.implementation[S] = { doc: this };
        }
        return s.implementation;
      },
      get compatMode() { return state(this).mode === 'quirks' ? 'BackCompat' : 'CSS1Compat'; },
      get contentType() { return state(this).contentType; },
      get characterSet() { state(this); return 'UTF-8'; },
      get charset() { state(this); return 'UTF-8'; },
      get inputEncoding() { state(this); return 'UTF-8'; },
      get readyState() { state(this); return 'complete'; },
      createElement(tagName, options) {
        const s = state(this);
        const name = String(tagName);
        const is = typeof options === 'object' && options !== null && options.is !== undefined ? String(options.is) : null;
        // HTML documents lowercase and use the HTML namespace; XML documents do neither.
        if (s.xml && !validElementLocalName(name)) throwInvalidName(name);
        return s.xml ? internals(this).createElementNS(s.contentType === 'application/xhtml+xml' ? HTML_NS : null, name, this, false, null, true, is)
          : internals(this).createElementNS(HTML_NS, HTML_NAMES.get(name) ?? htmlName(name), this, false, null, true, is);
      },
      createElementNS(ns, qualifiedName, options) {
        state(this);
        const { ns: namespace, prefix, qn } = validateAndExtract(ns, qualifiedName, true);
        const is = typeof options === 'object' && options !== null && options.is !== undefined ? String(options.is) : null;
        const element = internals(this).createElementNS(namespace, qn, this, false, null, true, is);
        // The prefix is kept only when there is one (most elements have none).
        if (prefix !== null) element[S].prefix = prefix;
        return element;
      },
      createTextNode(data) { state(this); return internals(this).createText(String(data), this); },
      createComment(data) { state(this); return internals(this).createComment(String(data), this); },
      createDocumentFragment() { state(this); return internals(this).createFragment(this); },
      importNode(node, deep = false) {
        state(this);
        if (state(node).type === DOCUMENT_NODE) throw domError('The node provided is a document, which may not be imported.', 'NotSupportedError');
        return clone(node, deep, this);
      },
      adoptNode(node) {
        state(this);
        const s = state(node);
        if (s.type === DOCUMENT_NODE) throw domError('The node provided is a document, which may not be adopted.', 'NotSupportedError');
        if (s.shadow === true) throw domError('The node provided is a shadow root, which may not be adopted.', 'HierarchyRequestError');
        if (s.parent) remove(s.parent, node);
        adopt(node, this);
        return node;
      },
      createEvent(name) { return createEvent(state(this).window, name); },
      createAttribute(name) { state(this); return createAttribute(this, name); },
      createAttributeNS(ns, qualifiedName) { state(this); return createAttributeNS(this, ns, qualifiedName); },
      createTreeWalker(root, whatToShow, filter) { return createTreeWalker(state(this).window, root, whatToShow, filter); },
      createNodeIterator(root, whatToShow, filter) { return createNodeIterator(state(this).window, root, whatToShow, filter); },
      getElementById(id) { state(this); return elementById(this, String(id)); },
      getElementsByTagName(tag) { return byTagName(this, tag); },
      getElementsByTagNameNS(ns, localName) { return byTagNameNS(this, ns, localName); },
      getElementsByClassName(names) { return byClassName(this, names); },
    }),
  },
  { name: 'XMLDocument', parent: 'Document', members: {} },
  {
    name: 'DocumentType',
    parent: 'Node',
    members: mix(childNode, {
      get name() { return state(this).name; },
      get publicId() { return state(this).publicId; },
      get systemId() { return state(this).systemId; },
    }),
  },
  {
    name: 'DOMImplementation',
    members: {
      hasFeature() { return true; },
      createDocumentType(name, publicId, systemId) {
        const doc = state(this).doc;
        // A valid doctype name: no ASCII whitespace, NULL or ">".
        if (/[\t\n\f\r \0>]/.test(String(name))) throw invalidName(name);
        return internals(doc).createDoctype(String(name), String(publicId), String(systemId), doc);
      },
      createHTMLDocument(title) {
        const w = internals(state(this).doc);
        const doc = w.createDocument({ contentType: 'text/html' });
        insert(doc, w.createDoctype('html', '', '', doc), null);
        const html = insert(doc, w.createElementNS(HTML_NS, 'html', doc), null);
        const head = insert(html, w.createElementNS(HTML_NS, 'head', doc), null);
        if (title !== undefined) {
          const t = insert(head, w.createElementNS(HTML_NS, 'title', doc), null);
          insert(t, w.createText(String(title), doc), null);
        }
        insert(html, w.createElementNS(HTML_NS, 'body', doc), null);
        return doc;
      },
      createDocument(namespace, qualifiedName, doctype = null) {
        const w = internals(state(this).doc);
        if (arguments.length < 2) throw new TypeError("Failed to execute 'createDocument' on 'DOMImplementation': 2 arguments required.");
        const name = qualifiedName === null ? '' : String(qualifiedName);
        const { ns, prefix } = name === '' ? { ns: namespace == null || namespace === '' ? null : String(namespace), prefix: null } : validateAndExtract(namespace, name, true);
        const contentType = ns === HTML_NS ? 'application/xhtml+xml' : ns === SVG_NS ? 'image/svg+xml' : 'application/xml';
        const doc = w.createDocument({ contentType, xml: true });
        if (doctype !== null) insert(doc, doctype, null);
        if (name !== '') {
          const element = insert(doc, w.createElementNS(ns, name, doc), null);
          if (prefix !== null) element[S].prefix = prefix;
        }
        return doc;
      },
    },
  },
  {
    name: 'DocumentFragment',
    parent: 'Node',
    construct: (w, self) => initNode(self, DOCUMENT_FRAGMENT_NODE, w.document),
    members: mix(parentNode, {
      getElementById(id) {
        const wanted = String(id);
        return collectElements(this, (el) => el[S].attrs.get('id') === wanted, true)[0] ?? null;
      },
    }),
  },
  // Shadow roots (DOM 4.8): a document fragment with a host. Its children
  // are the shadow tree; events cross to the host (events.js).
  {
    name: 'ShadowRoot',
    parent: 'DocumentFragment',
    members: mix({
      get mode() { return shadowState(this).mode; },
      get delegatesFocus() { return shadowState(this).delegatesFocus; },
      get serializable() { return shadowState(this).serializable; },
      get slotAssignment() { return shadowState(this).slotAssignment; },
      get clonable() { return shadowState(this).clonable; },
      get host() { return shadowState(this).host; },
      get innerHTML() { shadowState(this); return serializeChildren(this); },
      set innerHTML(html) {
        const s = shadowState(this);
        const fragment = parseFragment(s.doc, s.host, String(html));
        while (s.first) remove(this, s.first);
        insert(this, fragment, null);
      },
      getHTML() { shadowState(this); return serializeChildren(this); },
      setHTMLUnsafe(html) { this.innerHTML = html; },
      // The focused element, retargeted against this shadow root.
      get activeElement() {
        const s = shadowState(this);
        const focused = s.doc[S].focused;
        if (!focused || focused === s.doc) return null;
        const candidate = retarget(focused, this);
        return rootOf(candidate) === this ? candidate : null;
      },
    }, { onslotchange: GLOBAL_HANDLER_MEMBERS.onslotchange }),
  },
  {
    name: 'CharacterData',
    parent: 'Node',
    members: mix(childNode, elementSiblings, {
      get data() { return state(this).data; },
      set data(value) { state(this); setData(this, value === null ? '' : String(value)); },
      get length() { return state(this).data.length; },
      substringData(offset, count) {
        if (arguments.length < 2) throw new TypeError("Failed to execute 'substringData' on 'CharacterData': 2 arguments required.");
        const data = state(this).data;
        const o = Number(offset) >>> 0;
        if (o > data.length) throw domError(`The offset ${o} is greater than the node's length (${data.length}).`, 'IndexSizeError');
        return data.substr(o, Number(count) >>> 0);
      },
      appendData(data) {
        const s = state(this);
        if (arguments.length < 1) throw new TypeError("Failed to execute 'appendData' on 'CharacterData': 1 argument required, but only 0 present.");
        replaceData(this, s.data.length, 0, String(data));
      },
      insertData(offset, data) { state(this); replaceData(this, Number(offset) >>> 0, 0, String(data)); },
      deleteData(offset, count) { state(this); replaceData(this, Number(offset) >>> 0, Number(count) >>> 0, ''); },
      replaceData(offset, count, data) { state(this); replaceData(this, Number(offset) >>> 0, Number(count) >>> 0, String(data)); },
    }),
  },
  {
    name: 'Text',
    parent: 'CharacterData',
    members: {
      splitText(offset) { state(this); return splitText(this, Number(offset) >>> 0); },
      ...SLOTTABLE_MEMBERS,
      // The data of the contiguous Text nodes, in tree order.
      get wholeText() {
        let first = state(this) && this;
        while (first[S].prev && isText(first[S].prev)) first = first[S].prev;
        let text = '';
        for (let n = first; n && isText(n); n = n[S].next) text += n[S].data;
        return text;
      },
    },
    construct: (w, self, [data = '']) => initNode(self, TEXT_NODE, w.document, { data: String(data) }) },
  { name: 'Comment', parent: 'CharacterData', members: {}, construct: (w, self, [data = '']) => initNode(self, COMMENT_NODE, w.document, { data: String(data) }) },
  {
    name: 'Element',
    parent: 'Node',
    members: mix(parentNode, childNode, elementSiblings, ELEMENT_LAYOUT, {
      [Symbol.unscopables]: { unscopables: ['slot', 'before', 'after', 'replaceWith', 'remove', 'prepend', 'append', 'replaceChildren'] },
      get namespaceURI() { return state(this).ns; },
      get prefix() { return state(this).prefix ?? null; },
      get tagName() { return qualifiedTagName(state(this)); },
      attachShadow(init) { state(this); return attachShadow(this, init); },
      get shadowRoot() { const shadow = state(this).shadowRoot; return shadow && shadow[S].mode === 'open' ? shadow : null; },
      get localName() { return state(this).tag; },
      ...SLOTTABLE_MEMBERS,
      get slot() { return state(this).attrs.get('slot') ?? ''; },
      set slot(v) { state(this); writeAttribute(this, 'slot', String(v)); },
      get id() { return state(this).attrs.get('id') ?? ''; },
      set id(v) { this.setAttribute('id', v); },
      className: reflect('class'),
      getAttribute(name) { return state(this).attrs.get(attrName(this, name)) ?? null; },
      getAttributeNames() { return [...state(this).attrs.keys()]; },
      get attributes() { return namedNodeMap(this); },
      getAttributeNode(name) { const key = attrName(this, name); return state(this).attrs.has(key) ? attrNode(this, key) : null; },
      getAttributeNodeNS(ns, localName) { state(this); const name = findAttributeNS(this, ns, localName); return name === null ? null : attrNode(this, name); },
      getAttributeNS(ns, localName) { state(this); const name = findAttributeNS(this, ns, localName); return name === null ? null : this[S].attrs.get(name); },
      hasAttributeNS(ns, localName) { state(this); return findAttributeNS(this, ns, localName) !== null; },
      setAttributeNS(ns, qualifiedName, value) { state(this); setAttributeNS(this, ns, qualifiedName, value); },
      removeAttributeNS(ns, localName) { state(this); const name = findAttributeNS(this, ns, localName); if (name !== null) writeAttribute(this, name, undefined); },
      setAttributeNode(attr) { state(this); return setAttributeNode(this, attr); },
      setAttributeNodeNS(attr) { state(this); return setAttributeNode(this, attr); },
      removeAttributeNode(attr) { state(this); return removeAttributeNode(this, attr); },
      get classList() { state(this); return tokenList(this, 'class', writeAttribute); },
      set classList(v) { this.classList.value = v; },
      setAttribute(name, value) { state(this); writeAttribute(this, attrName(this, name), String(value), true); },
      hasAttribute(name) { return state(this).attrs.has(attrName(this, name)); },
      hasAttributes() { return state(this).attrs.size > 0; },
      removeAttribute(name) { state(this); writeAttribute(this, attrName(this, name), undefined); },
      get innerHTML() { state(this); return innerMarkup(this); },
      set innerHTML(html) { setInnerHTML(this, html == null ? '' : html); },
      get outerHTML() { state(this); return outerMarkup(this); },
      set outerHTML(html) { setOuterHTML(this, html == null ? '' : html); },
      insertAdjacentHTML(position, html) { insertAdjacentHTML(this, position, html); },
      toggleAttribute(name, force) {
        checkAttributeName(String(name));
        const has = this.hasAttribute(name);
        const want = force === undefined ? !has : !!force;
        if (want && !has) this.setAttribute(name, '');
        if (!want && has) this.removeAttribute(name);
        return want;
      },
      matches(selector) { state(this); return matchSelector(this, selector); },
      webkitMatchesSelector(selector) { state(this); return matchSelector(this, selector); },
      closest(selector) { state(this); return closestMatch(this, selector); },
      getElementsByTagName(tag) { return byTagName(this, tag); },
      getElementsByTagNameNS(ns, localName) { return byTagNameNS(this, ns, localName); },
      getElementsByClassName(names) { return byClassName(this, names); },
      insertAdjacentElement(position, element) { return insertAdjacent(this, position, element); },
      insertAdjacentText(position, data) { insertAdjacent(this, position, state(this).doc.createTextNode(String(data))); },
    }),
  },
  {
    name: 'HTMLElement',
    parent: 'Element',
    members: mix(inlineStyle, htmlOrSvgElement, HTML_ELEMENT_LAYOUT, clickMember, FOCUS_MEMBERS, GLOBAL_HANDLER_MEMBERS, {
      get dir() { return knownDir(state(this).attrs.get('dir')); },
      set dir(v) { writeAttribute(this, 'dir', String(v)); },
      // Translation mode (HTML 3.2.6.3).
      get translate() { state(this); return translationEnabled(this); },
      set translate(v) { state(this); writeAttribute(this, 'translate', v ? 'yes' : 'no'); },
      get hidden() { return state(this).attrs.has('hidden'); },
      set hidden(v) { state(this); writeAttribute(this, 'hidden', v ? '' : undefined); },
    }),
  },
  { name: 'SVGElement', parent: 'Element', members: mix(inlineStyle, htmlOrSvgElement, FOCUS_MEMBERS, GLOBAL_HANDLER_MEMBERS) },
  { name: 'SVGGraphicsElement', parent: 'SVGElement', members: {} },
  { name: 'SVGSVGElement', parent: 'SVGGraphicsElement', members: {} },
  { name: 'SVGTitleElement', parent: 'SVGElement', members: {} },
];

function knownDir(value) {
  const dir = (value ?? '').toLowerCase();
  return dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : '';
}

// An element's translation mode: its own translate attribute (HTML
// elements; yes or empty: enabled, no: disabled), else its parent
// element's, else enabled.
function translationEnabled(element) {
  for (let el = element; el; el = el[S].parent) {
    const s = el[S];
    if (s.type !== ELEMENT_NODE) return true;
    if (s.ns !== HTML_NS) continue;
    const v = s.attrs.get('translate');
    if (v === undefined) continue;
    const lower = v.toLowerCase();
    if (lower === 'yes' || lower === '') return true;
    if (lower === 'no') return false;
  }
  return true;
}

function insertAdjacent(element, position, node) {
  const s = state(element);
  switch (String(position).toLowerCase()) {
    case 'beforebegin': if (!s.parent) return null; insert(s.parent, node, element); return node;
    case 'afterbegin': insert(element, node, s.first); return node;
    case 'beforeend': insert(element, node, null); return node;
    case 'afterend': if (!s.parent) return null; insert(s.parent, node, s.next); return node;
    default: throw domError(`The value provided ('${position}') is not one of 'beforeBegin', 'afterBegin', 'beforeEnd', or 'afterEnd'.`, 'SyntaxError');
  }
}

// A live HTMLCollection of elements below root matching test, recomputed
// only after a change in the document's trees.
function liveElements(root, test) {
  const doc = state(root).type === DOCUMENT_NODE ? root : state(root).doc;
  let cache = null;
  let rev = -1;
  return liveList(internals(root).protos.HTMLCollection, () => {
    const current = doc[S].treeRev ?? 0;
    if (rev !== current) { cache = collectElements(root, test); rev = current; }
    return cache;
  });
}

// The document's named collections (scripts, forms, ...): one live
// HTMLCollection each, created on first use.
function documentCollection(doc, key, test) {
  const s = state(doc);
  const collections = s.collections ?? (s.collections = {});
  return collections[key] ?? (collections[key] = liveElements(doc, test));
}

// Elements with this qualified name (DOM "list of elements with qualified
// name"): in an HTML document, HTML elements match it lowercased.
function byTagName(root, tag) {
  const name = String(tag);
  if (name === '*') return liveElements(root, () => true);
  const s = state(root);
  // Whether root's document is an HTML document is decided when the list is
  // made; it keeps matching that way if root moves to another document.
  if ((s.type === DOCUMENT_NODE ? s : s.doc[S]).xml) return liveElements(root, (el) => qualifiedName(el[S]) === name);
  const lower = asciiLower(name);
  return liveElements(root, (el) => { const es = el[S]; return qualifiedName(es) === (es.ns === HTML_NS ? lower : name); });
}

// Elements with this namespace and local name ("*" matches any).
function byTagNameNS(root, namespace, localName) {
  state(root);
  const ns = namespace == null || namespace === '' ? null : String(namespace);
  const local = String(localName);
  return liveElements(root, (el) => {
    const es = el[S];
    return (ns === '*' || es.ns === ns) && (local === '*' || es.tag === local);
  });
}

// Class names are split on ASCII whitespace only (DOM ordered sets).
function byClassName(root, names) {
  const wanted = String(names).split(/[\t\n\f\r ]+/).filter(Boolean);
  return liveElements(root, (el) => {
    const classes = ` ${el[S].attrs.get('class') ?? ''} `.replace(/[\t\n\f\r ]+/g, ' ');
    return wanted.length > 0 && wanted.every((c) => classes.includes(` ${c} `));
  });
}

// HTML element interfaces from the HTML standard; members are added per
// interface as they are implemented.
// No canvas: as jsdom without the canvas package, these report "Not
// implemented" and return null.
const canvasNotImplemented = (el, method) => win(el)[S].notImplemented(`HTMLCanvasElement's ${method}() method: without installing the canvas npm package`);
// Window event handlers, forwarded to the window (event-handlers.js).
INTERFACES.push({ name: 'HTMLBodyElement', parent: 'HTMLElement', members: WINDOW_HANDLER_MEMBERS });
INTERFACES.push({ name: 'HTMLFrameSetElement', parent: 'HTMLElement', members: WINDOW_HANDLER_MEMBERS });
INTERFACES.push({ name: 'HTMLStyleElement', parent: 'HTMLElement', members: STYLE_ELEMENT_MEMBERS });
// Linked style sheets are not fetched (jsdom's default), so they have no sheet.
INTERFACES.push({ name: 'HTMLLinkElement', parent: 'HTMLElement', members: { get sheet() { state(this); return null; } } });
INTERFACES.push({
  name: 'HTMLCanvasElement',
  parent: 'HTMLElement',
  members: {
    getContext() { state(this); canvasNotImplemented(this, 'getContext'); return null; },
    toDataURL() { state(this); canvasNotImplemented(this, 'toDataURL'); return null; },
    toBlob() { state(this); canvasNotImplemented(this, 'toBlob'); },
  },
});
// The HTMLHyperlinkElementUtils mixin (hyperlinks.js).
INTERFACES.push({ name: 'HTMLAnchorElement', parent: 'HTMLElement', members: HYPERLINK_MEMBERS });
INTERFACES.push({ name: 'HTMLAreaElement', parent: 'HTMLElement', members: HYPERLINK_MEMBERS });
INTERFACES.push({ name: 'HTMLImageElement', parent: 'HTMLElement', members: IMAGE_MEMBERS });
INTERFACES.push({ name: 'HTMLBaseElement', parent: 'HTMLElement', members: BASE_MEMBERS });
INTERFACES.push({ name: 'HTMLIFrameElement', parent: 'HTMLElement', members: IFRAME_MEMBERS });
INTERFACES.push({ name: 'HTMLSlotElement', parent: 'HTMLElement', members: SLOT_MEMBERS });
INTERFACES.push({ name: 'HTMLMediaElement', parent: 'HTMLElement', members: MEDIA_MEMBERS, statics: MEDIA_STATICS });
INTERFACES.push({ name: 'HTMLVideoElement', parent: 'HTMLMediaElement', members: VIDEO_MEMBERS });
INTERFACES.push({ name: 'HTMLTableElement', parent: 'HTMLElement', members: TABLE_MEMBERS });
INTERFACES.push({ name: 'HTMLTableSectionElement', parent: 'HTMLElement', members: SECTION_MEMBERS });
INTERFACES.push({ name: 'HTMLTableRowElement', parent: 'HTMLElement', members: ROW_MEMBERS });
INTERFACES.push({ name: 'HTMLTableCellElement', parent: 'HTMLElement', members: CELL_MEMBERS });
INTERFACES.push({ name: 'HTMLProgressElement', parent: 'HTMLElement', members: PROGRESS_MEMBERS });
INTERFACES.push({ name: 'HTMLMeterElement', parent: 'HTMLElement', members: METER_MEMBERS });
INTERFACES.push({ name: 'HTMLTemplateElement', parent: 'HTMLElement', members: { get content() { return templateContent(this); } } });
{
  const defined = new Set(INTERFACES.map((i) => i.name));
  for (const [name, parent] of HTML_ELEMENTS) if (!defined.has(name)) INTERFACES.push({ name, parent, members: {} });
}
// Reflected attributes, then form control behavior, under the members above.
// The reflected accessors are made when the interface is first created.
for (const iface of INTERFACES) {
  const { name } = iface;
  const reflected = hasReflections(name) ? () => reflectedMembers(name) : {};
  const form = FORM_MEMBERS.get(name);
  if (hasReflections(name) || form) iface.members = mix(reflected, form ?? {}, iface.members);
}

// SVG elements with an interface of their own; others are SVGElement.
export const SVG_ELEMENTS = new Map([['svg', 'SVGSVGElement'], ['title', 'SVGTitleElement']]);
export { HTML_NS, SVG_NS };
