// Interface implementations, declared once per module load. Each entry gives
// the interface's parent and its members; window.js turns them into property
// descriptors once, and into per-window prototypes and constructors on every
// createWindow(). Members sit on the same interface as in jsdom, because
// tests spy on them there.
import {
  S, state, initNode, insert, remove, textOf, contains, domError, rootOf, nextInTree,
  childArray, elementChildArray, collectElements, elementById, setData,
  ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, HTML_NS, SVG_NS,
} from './internal.js';
import { CSS_INTERFACES, styleOf } from './css.js';
import { querySelectorAll as selectAll, matches as matchSelector, closest as closestMatch } from './selectors.js';
import { COLLECTION_INTERFACES, liveList } from './collections.js';
import { HTML_ELEMENTS } from './html-elements.js';
import { EVENT_INTERFACES, createEvent } from './events.js';
import { MUTATION_INTERFACES } from './mutation.js';
import { FEATURE_INTERFACES, WINDOW_MEMBERS } from './window-features.js';
import { TRAVERSAL_INTERFACES, createTreeWalker, createNodeIterator } from './traversal.js';
import { serializeChildren, serializeOuter, setInnerHTML, setOuterHTML, insertAdjacentHTML, templateContent } from './html.js';
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

function clone(node, deep, doc) {
  const s = state(node);
  const w = doc[S].window[S];
  let copy;
  if (s.type === ELEMENT_NODE) {
    copy = w.createElementNS(s.ns, s.tag);
    copy[S].attrs = new Map(s.attrs);
  } else if (s.type === TEXT_NODE) copy = w.createText(s.data);
  else if (s.type === COMMENT_NODE) copy = w.createComment(s.data);
  else if (s.type === DOCUMENT_FRAGMENT_NODE) copy = w.createFragment();
  else throw domError('Cloning this node is not supported yet.', 'NotSupportedError');
  if (deep) for (let c = s.first; c; c = c[S].next) insert(copy, clone(c, true, doc), null);
  return copy;
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
  ...EVENT_INTERFACES,
  ...MUTATION_INTERFACES,
  ...FEATURE_INTERFACES,
  ...TRAVERSAL_INTERFACES,
  ...ATTRIBUTE_INTERFACES,
  { name: 'Window', parent: 'EventTarget', members: WINDOW_MEMBERS },
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
          case ELEMENT_NODE: return s.ns === HTML_NS ? s.tag.toUpperCase() : s.tag;
          case TEXT_NODE: return '#text';
          case COMMENT_NODE: return '#comment';
          case DOCUMENT_NODE: return '#document';
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
      get isConnected() { return rootOf(this)[S].type === DOCUMENT_NODE; },
      getRootNode() { return rootOf(this); },
      get textContent() { return state(this).type === DOCUMENT_NODE ? null : textOf(this); },
      set textContent(value) {
        const s = state(this);
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
    },
  },
  {
    name: 'Document',
    parent: 'Node',
    construct: (w, self) => w[S].initDocument(self),
    members: mix(parentNode, {
      get defaultView() { return state(this).window; },
      get URL() { return state(this).window[S].url.href; },
      get documentURI() { return state(this).window[S].url.href; },
      get location() { return state(this).window[S].location; },
      get documentElement() { return firstElement(state(this)); },
      get head() { return state(this).head; },
      get body() { return state(this).body; },
      get compatMode() { state(this); return 'CSS1Compat'; },
      get contentType() { state(this); return 'text/html'; },
      get readyState() { state(this); return 'complete'; },
      createElement(tagName) { return internals(this).createElementNS(HTML_NS, String(tagName).toLowerCase()); },
      createElementNS(ns, qualifiedName) { return internals(this).createElementNS(ns == null ? null : String(ns), String(qualifiedName)); },
      createTextNode(data) { return internals(this).createText(String(data)); },
      createComment(data) { return internals(this).createComment(String(data)); },
      createDocumentFragment() { return internals(this).createFragment(); },
      createEvent(name) { return createEvent(state(this).window, name); },
      createAttribute(name) { state(this); return createAttribute(this, name); },
      createTreeWalker(root, whatToShow, filter) { return createTreeWalker(state(this).window, root, whatToShow, filter); },
      createNodeIterator(root, whatToShow, filter) { return createNodeIterator(state(this).window, root, whatToShow, filter); },
      getElementById(id) { state(this); return elementById(this, String(id)); },
      getElementsByTagName(tag) { return byTagName(this, tag); },
      getElementsByClassName(names) { return byClassName(this, names); },
    }),
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
  {
    name: 'CharacterData',
    parent: 'Node',
    members: mix(childNode, elementSiblings, {
      get data() { return state(this).data; },
      set data(value) { state(this); setData(this, String(value)); },
      get length() { return state(this).data.length; },
    }),
  },
  { name: 'Text', parent: 'CharacterData', members: {}, construct: (w, self, [data = '']) => initNode(self, TEXT_NODE, w.document, { data: String(data) }) },
  { name: 'Comment', parent: 'CharacterData', members: {}, construct: (w, self, [data = '']) => initNode(self, COMMENT_NODE, w.document, { data: String(data) }) },
  {
    name: 'Element',
    parent: 'Node',
    members: mix(parentNode, childNode, elementSiblings, {
      get namespaceURI() { return state(this).ns; },
      get prefix() { state(this); return null; },
      get tagName() { const s = state(this); return s.ns === HTML_NS ? s.tag.toUpperCase() : s.tag; },
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
    members: mix(inlineStyle, htmlOrSvgElement, {
      get hidden() { return state(this).attrs.has('hidden'); },
      set hidden(v) { state(this); writeAttribute(this, 'hidden', v ? '' : undefined); },
      // No layout engine: sizes and offsets are 0, as in jsdom.
      get offsetWidth() { state(this); return 0; },
      get offsetHeight() { state(this); return 0; },
      get offsetTop() { state(this); return 0; },
      get offsetLeft() { state(this); return 0; },
    }),
  },
  { name: 'SVGElement', parent: 'Element', members: mix(inlineStyle, htmlOrSvgElement) },
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
INTERFACES.push({ name: 'HTMLTemplateElement', parent: 'HTMLElement', members: { get content() { return templateContent(this); } } });
for (const [name, parent] of HTML_ELEMENTS) {
  if (!INTERFACES.some((i) => i.name === name)) INTERFACES.push({ name, parent, members: {} });
}

// SVG elements with an interface of their own; others are SVGElement.
export const SVG_ELEMENTS = new Map([['svg', 'SVGSVGElement'], ['title', 'SVGTitleElement']]);
export { HTML_NS, SVG_NS };
