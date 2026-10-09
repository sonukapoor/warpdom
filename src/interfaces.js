// Interface implementations, declared once per module load. Each entry gives
// the interface's parent and its members; window.js turns them into property
// descriptors once, and into per-window prototypes and constructors on every
// createWindow(). Members sit on the same interface as in jsdom, because
// tests spy on them there.
import {
  S, state, initNode, insert, remove, textOf, contains, domError, rootOf, nextInTree,
  childArray, elementChildArray, collectElements, elementById, setData, replaceData, adopt, shadowIncludingRoot, reactionScope,
  ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE, HTML_NS, SVG_NS, connected
} from './internal.js';
import { CSS_INTERFACES, styleOf } from './css.js';
import { REFLECTED } from './reflect.js';
import { GLOBAL_HANDLER_MEMBERS, WINDOW_HANDLER_MEMBERS, eventHandlerAttributesAdded } from './event-handlers.js';
import { CUSTOM_ELEMENT_INTERFACES } from './custom-elements.js';
import { RANGE_INTERFACES, newRange, getSelection, splitText, normalize } from './ranges.js';
import { CSSOM_INTERFACES, styleElementSheet, documentStyleSheets } from './cssom.js';
import { FOCUS_MEMBERS, DOCUMENT_FOCUS_MEMBERS } from './focus.js';
import { FORM_INTERFACES, FORM_MEMBERS, clickMember } from './forms.js';
import { GEOMETRY_INTERFACES, ELEMENT_LAYOUT, HTML_ELEMENT_LAYOUT } from './layout.js';
import { querySelectorAll as selectAll, matches as matchSelector, closest as closestMatch } from './selectors.js';
import { COLLECTION_INTERFACES, liveList } from './collections.js';
import { HTML_ELEMENTS } from './html-elements.js';
import { EVENT_INTERFACES, createEvent, retarget } from './events.js';
import { MUTATION_INTERFACES } from './mutation.js';
import { FEATURE_INTERFACES, WINDOW_MEMBERS } from './window-features.js';
import { TRAVERSAL_INTERFACES, createTreeWalker, createNodeIterator } from './traversal.js';
import { parseFragment, serializeChildren, serializeOuter, setInnerHTML, setOuterHTML, insertAdjacentHTML, templateContent } from './html.js';
import {
  ATTRIBUTE_INTERFACES, writeAttribute, attrName, attrNode, namedNodeMap, tokenList, domStringMap,
  setAttributeNode, removeAttributeNode, createAttribute,
} from './attributes.js';

// Merge member objects by descriptor: object spread would call getters.
const mix = (...objects) => {
  const out = {};
  for (const o of objects) Object.defineProperties(out, Object.getOwnPropertyDescriptors(o));
  return out;
};

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
    const s = state(this);
    while (s.first) remove(this, s.first);
    if (node) insert(this, node, null);
  },
});

// ChildNode mixin (Element, CharacterData).
const childNode = {
  before(...items) { const p = state(this).parent; if (p && items.length) insert(p, toNode(this, items), this); },
  after(...items) { const s = state(this); if (s.parent && items.length) insert(s.parent, toNode(this, items), s.next); },
  replaceWith(...items) {
    const p = state(this).parent;
    if (!p) return;
    const next = state(this).next;
    remove(p, this);
    if (items.length) insert(p, toNode(this, items), next);
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

const hasOnAttribute = (attrs) => { for (const name of attrs.keys()) if (name.startsWith('on')) return true; return false; };

export const clone = (node, deep, doc) => reactionScope(cloneNode, node, deep, doc);

function cloneNode(node, deep, doc) {
  const s = state(node);
  const w = doc[S].window[S];
  let copy;
  if (s.type === ELEMENT_NODE) {
    copy = w.createElementNS(s.ns, s.tag, doc, false, null, false, s.ceIs ?? null);
    copy[S].attrs = new Map(s.attrs);
    if (s.handlers || hasOnAttribute(s.attrs)) eventHandlerAttributesAdded(copy);
  } else if (s.type === TEXT_NODE) copy = w.createText(s.data, doc);
  else if (s.type === COMMENT_NODE) copy = w.createComment(s.data, doc);
  else if (s.type === DOCUMENT_FRAGMENT_NODE) copy = w.createFragment(doc);
  else if (s.type === DOCUMENT_TYPE_NODE) copy = w.createDoctype(s.name, s.publicId, s.systemId, doc);
  else throw domError('Cloning this node is not supported yet.', 'NotSupportedError');
  if (deep) {
    for (let c = s.first; c; c = c[S].next) insert(copy, cloneNode(c, true, doc), null);
    // Template cloning steps (HTML): a deep clone copies the template contents.
    if (s.type === ELEMENT_NODE && isTemplateEl(node) && s.content) {
      const content = templateContent(copy);
      for (let c = s.content[S].first; c; c = c[S].next) insert(content, cloneNode(c, true, content[S].doc), null);
    }
  }
  return copy;
}

// Uppercased for HTML elements in HTML documents only (cached per element).
const qualifiedTagName = (s) => (s.ns === HTML_NS && !s.doc[S].xml ? (s.upper ?? (s.upper = s.tag.toUpperCase())) : s.tag);
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

const isHTMLTag = (node, tag) => { const s = node[S]; return s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === tag; };
const htmlElement = (doc) => { const el = firstElement(doc[S]); return el && isHTMLTag(el, 'html') ? el : null; };
function* descendantElements(root) {
  for (let n = root[S].first; n; n = nextInTree(n, root)) if (n[S].type === ELEMENT_NODE) yield n;
}

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
  ...MUTATION_INTERFACES,
  ...FEATURE_INTERFACES,
  ...TRAVERSAL_INTERFACES,
  ...ATTRIBUTE_INTERFACES,
  ...GEOMETRY_INTERFACES,
  ...CSSOM_INTERFACES,
  ...RANGE_INTERFACES,
  ...CUSTOM_ELEMENT_INTERFACES,
  { name: 'Window', parent: 'EventTarget', members: mix(GLOBAL_HANDLER_MEMBERS, WINDOW_HANDLER_MEMBERS, WINDOW_MEMBERS) },
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
          case DOCUMENT_NODE: return '#document';
          case DOCUMENT_TYPE_NODE: return s.name;
          default: return '#document-fragment';
        }
      },
      get nodeValue() { const s = state(this); return s.type === TEXT_NODE || s.type === COMMENT_NODE ? s.data : null; },
      set nodeValue(v) { const s = state(this); if (s.type === TEXT_NODE || s.type === COMMENT_NODE) setData(this, String(v ?? '')); },
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
      getRootNode(options) { state(this); return options?.composed ? shadowIncludingRoot(this) : rootOf(this); },
      get textContent() { const t = state(this).type; return t === DOCUMENT_NODE || t === DOCUMENT_TYPE_NODE ? null : textOf(this); },
      set textContent(value) {
        const s = state(this);
        if (s.type === DOCUMENT_NODE || s.type === DOCUMENT_TYPE_NODE) return;
        if (s.type === TEXT_NODE || s.type === COMMENT_NODE) { setData(this, String(value ?? '')); return; }
        while (s.first) remove(this, s.first);
        const text = value == null ? '' : String(value);
        if (text) insert(this, s.doc.createTextNode(text), null);
      },
      appendChild(node) { return insert(this, node, null); },
      insertBefore(node, ref) { return insert(this, node, ref ?? null); },
      removeChild(node) { return remove(this, node); },
      replaceChild(node, old) {
        if (state(old).parent !== this) throw domError('The node to be replaced is not a child of this node.', 'NotFoundError');
        const next = old[S].next;
        remove(this, old);
        insert(this, node, next === node ? node[S].next : next);
        return old;
      },
      cloneNode(deep = false) { const s = state(this); return clone(this, deep, s.type === DOCUMENT_NODE ? this : s.doc); },
      contains(node) { return node != null && contains(this, node); },
      compareDocumentPosition(other) { return compareDocumentPosition(this, other); },
      isSameNode(other) { return this === other; },
      hasChildNodes() { return state(this).count > 0; },
      normalize() { state(this); normalize(this); },
    },
  },
  {
    name: 'Document',
    parent: 'Node',
    // new Document(): an XML document without a browsing context, as in jsdom.
    construct: (w, self) => w[S].initDocument(self, { noView: true, url: 'about:blank', contentType: 'application/xml', xml: true }),
    members: mix(parentNode, DOCUMENT_FOCUS_MEMBERS, GLOBAL_HANDLER_MEMBERS, {
      get defaultView() { const s = state(this); return s.noView ? null : s.window; },
      get URL() { const s = state(this); return s.url ?? s.window[S].url.href; },
      get documentURI() { return this.URL; },
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
      get compatMode() { state(this); return 'CSS1Compat'; },
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
        return s.xml ? internals(this).createElementNS(s.contentType === 'application/xhtml+xml' ? HTML_NS : null, name, this, false, null, true, is)
          : internals(this).createElementNS(HTML_NS, name.toLowerCase(), this, false, null, true, is);
      },
      createElementNS(ns, qualifiedName, options) {
        state(this);
        const is = typeof options === 'object' && options !== null && options.is !== undefined ? String(options.is) : null;
        return internals(this).createElementNS(ns == null || ns === '' ? null : String(ns), String(qualifiedName), this, false, null, true, is);
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
        if (s.parent) remove(s.parent, node);
        adopt(node, this);
        return node;
      },
      createEvent(name) { return createEvent(state(this).window, name); },
      createAttribute(name) { state(this); return createAttribute(this, name); },
      createTreeWalker(root, whatToShow, filter) { return createTreeWalker(state(this).window, root, whatToShow, filter); },
      createNodeIterator(root, whatToShow, filter) { return createNodeIterator(state(this).window, root, whatToShow, filter); },
      getElementById(id) { state(this); return elementById(this, String(id)); },
      getElementsByTagName(tag) { return byTagName(this, tag); },
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
        const ns = namespace == null || namespace === '' ? null : String(namespace);
        const contentType = ns === HTML_NS ? 'application/xhtml+xml' : ns === SVG_NS ? 'image/svg+xml' : 'application/xml';
        const doc = w.createDocument({ contentType, xml: true });
        if (doctype !== null) insert(doc, doctype, null);
        const name = qualifiedName == null ? '' : String(qualifiedName);
        if (name !== '') insert(doc, w.createElementNS(ns, name, doc), null);
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
        const data = state(this).data;
        const o = Number(offset) >>> 0;
        if (o > data.length) throw domError(`The offset ${o} is greater than the node's length (${data.length}).`, 'IndexSizeError');
        return data.substr(o, Number(count) >>> 0);
      },
      appendData(data) { const s = state(this); replaceData(this, s.data.length, 0, String(data)); },
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
      // The data of the contiguous Text nodes, in tree order.
      get wholeText() {
        let first = state(this) && this;
        while (first[S].prev && first[S].prev[S].type === TEXT_NODE) first = first[S].prev;
        let text = '';
        for (let n = first; n && n[S].type === TEXT_NODE; n = n[S].next) text += n[S].data;
        return text;
      },
    },
    construct: (w, self, [data = '']) => initNode(self, TEXT_NODE, w.document, { data: String(data) }) },
  { name: 'Comment', parent: 'CharacterData', members: {}, construct: (w, self, [data = '']) => initNode(self, COMMENT_NODE, w.document, { data: String(data) }) },
  {
    name: 'Element',
    parent: 'Node',
    members: mix(parentNode, childNode, elementSiblings, ELEMENT_LAYOUT, {
      get namespaceURI() { return state(this).ns; },
      get prefix() { state(this); return null; },
      get tagName() { return qualifiedTagName(state(this)); },
      attachShadow(init) { state(this); return attachShadow(this, init); },
      get shadowRoot() { const shadow = state(this).shadowRoot; return shadow && shadow[S].mode === 'open' ? shadow : null; },
      get localName() { return state(this).tag; },
      get id() { return state(this).attrs.get('id') ?? ''; },
      set id(v) { this.setAttribute('id', v); },
      className: reflect('class'),
      getAttribute(name) { return state(this).attrs.get(attrName(this, name)) ?? null; },
      getAttributeNames() { return [...state(this).attrs.keys()]; },
      get attributes() { return namedNodeMap(this); },
      getAttributeNode(name) { const key = attrName(this, name); return state(this).attrs.has(key) ? attrNode(this, key) : null; },
      getAttributeNodeNS(ns, name) { return this.getAttributeNode(name); },
      setAttributeNode(attr) { state(this); return setAttributeNode(this, attr); },
      setAttributeNodeNS(attr) { state(this); return setAttributeNode(this, attr); },
      removeAttributeNode(attr) { state(this); return removeAttributeNode(this, attr); },
      get classList() { state(this); return tokenList(this, 'class', writeAttribute); },
      set classList(v) { this.classList.value = v; },
      setAttribute(name, value) { state(this); writeAttribute(this, attrName(this, name), String(value)); },
      hasAttribute(name) { return state(this).attrs.has(attrName(this, name)); },
      hasAttributes() { return state(this).attrs.size > 0; },
      removeAttribute(name) { state(this); writeAttribute(this, attrName(this, name), undefined); },
      get innerHTML() { return serializeChildren(isTemplateEl(this) ? templateContent(this) : this); },
      set innerHTML(html) { setInnerHTML(this, html == null ? '' : html); },
      get outerHTML() { return serializeOuter(this); },
      set outerHTML(html) { setOuterHTML(this, html == null ? '' : html); },
      insertAdjacentHTML(position, html) { insertAdjacentHTML(this, position, html); },
      toggleAttribute(name, force) {
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
      getElementsByClassName(names) { return byClassName(this, names); },
      insertAdjacentElement(position, element) { return insertAdjacent(this, position, element); },
      insertAdjacentText(position, data) { insertAdjacent(this, position, state(this).doc.createTextNode(String(data))); },
    }),
  },
  {
    name: 'HTMLElement',
    parent: 'Element',
    members: mix(inlineStyle, htmlOrSvgElement, HTML_ELEMENT_LAYOUT, clickMember, FOCUS_MEMBERS, GLOBAL_HANDLER_MEMBERS, {
      get dir() {
        const dir = (state(this).attrs.get('dir') ?? '').toLowerCase();
        return dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : '';
      },
      set dir(v) { writeAttribute(this, 'dir', String(v)); },
      get hidden() { return state(this).attrs.has('hidden'); },
      set hidden(v) { state(this); writeAttribute(this, 'hidden', v ? '' : undefined); },
    }),
  },
  { name: 'SVGElement', parent: 'Element', members: mix(inlineStyle, htmlOrSvgElement, FOCUS_MEMBERS, GLOBAL_HANDLER_MEMBERS) },
  { name: 'SVGGraphicsElement', parent: 'SVGElement', members: {} },
  { name: 'SVGSVGElement', parent: 'SVGGraphicsElement', members: {} },
  { name: 'SVGTitleElement', parent: 'SVGElement', members: {} },
];

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

function byTagName(root, tag) {
  const name = String(tag).toLowerCase();
  return liveElements(root, (el) => name === '*' || el[S].tag.toLowerCase() === name);
}

function byClassName(root, names) {
  const wanted = String(names).split(/\s+/).filter(Boolean);
  return liveElements(root, (el) => {
    const classes = ` ${el[S].attrs.get('class') ?? ''} `.replace(/\s+/g, ' ');
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
INTERFACES.push({ name: 'HTMLStyleElement', parent: 'HTMLElement', members: { get sheet() { state(this); return styleElementSheet(this); } } });
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
INTERFACES.push({ name: 'HTMLTemplateElement', parent: 'HTMLElement', members: { get content() { return templateContent(this); } } });
for (const [name, parent] of HTML_ELEMENTS) {
  if (!INTERFACES.some((i) => i.name === name)) INTERFACES.push({ name, parent, members: {} });
}
// Reflected attributes, then form control behavior, under the members above.
for (const iface of INTERFACES) {
  const reflected = REFLECTED.get(iface.name);
  const form = FORM_MEMBERS.get(iface.name);
  if (reflected || form) iface.members = mix(reflected ?? {}, form ?? {}, iface.members);
}

// SVG elements with an interface of their own; others are SVGElement.
export const SVG_ELEMENTS = new Map([['svg', 'SVGSVGElement'], ['title', 'SVGTitleElement']]);
export { HTML_NS, SVG_NS };
