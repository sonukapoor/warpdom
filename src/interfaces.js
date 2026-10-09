// Interface implementations, declared once per module load. Each entry gives
// the interface's parent and its members; window.js turns them into property
// descriptors once, and into per-window prototypes and constructors on every
// createWindow(). Members sit on the same interface as in jsdom, because
// tests spy on them there.
import {
  S, state, initNode, insert, remove, textOf, contains, descendants, domError,
  nextSibling, previousSibling,
  ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, HTML_NS, SVG_NS,
} from './internal.js';
import { CSS_INTERFACES, styleOf, styleAttributeChanged } from './css.js';
import { COLLECTION_INTERFACES, liveList } from './collections.js';
import { HTML_ELEMENTS } from './html-elements.js';
import { EVENT_INTERFACES, createEvent } from './events.js';

// Merge member objects by descriptor: object spread would call getters.
const mix = (...objects) => {
  const out = {};
  for (const o of objects) Object.defineProperties(out, Object.getOwnPropertyDescriptors(o));
  return out;
};

const win = (node) => state(node).doc[S].window;
const internals = (node) => win(node)[S];

function matchesSimple(el, selector) {
  const s = el[S];
  if (selector[0] === '#') return s.attrs.get('id') === selector.slice(1);
  if (selector[0] === '.') return ` ${s.attrs.get('class') ?? ''} `.includes(` ${selector.slice(1)} `);
  return s.tag === selector.toLowerCase();
}

const queries = {
  querySelector(selector) { return descendants(this).find((el) => matchesSimple(el, String(selector))) ?? null; },
  querySelectorAll(selector) {
    const found = descendants(this).filter((el) => matchesSimple(el, String(selector)));
    return liveList(internals(this).protos.NodeList, () => found);
  },
};

const elementChildren = (node) => state(node).children.filter((c) => c[S].type === ELEMENT_NODE);

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
    return s.childElements ?? (s.childElements = liveList(internals(this).protos.HTMLCollection, () => elementChildren(this)));
  },
  get firstElementChild() { return elementChildren(this)[0] ?? null; },
  get lastElementChild() { const k = elementChildren(this); return k[k.length - 1] ?? null; },
  get childElementCount() { return elementChildren(this).length; },
  append(...items) { if (items.length) insert(this, toNode(this, items), null); },
  prepend(...items) { if (items.length) insert(this, toNode(this, items), state(this).children[0] ?? null); },
  replaceChildren(...items) {
    const node = items.length ? toNode(this, items) : null;
    for (const child of state(this).children.slice()) remove(this, child);
    if (node) insert(this, node, null);
  },
});

// ChildNode mixin (Element, CharacterData).
const childNode = {
  before(...items) { const p = state(this).parent; if (p && items.length) insert(p, toNode(this, items), this); },
  after(...items) { const p = state(this).parent; if (p && items.length) insert(p, toNode(this, items), nextSibling(this)); },
  replaceWith(...items) {
    const p = state(this).parent;
    if (!p) return;
    const next = nextSibling(this);
    remove(p, this);
    if (items.length) insert(p, toNode(this, items), next);
  },
  remove() { const p = state(this).parent; if (p) remove(p, this); },
};

// NonDocumentTypeChildNode mixin (Element, CharacterData).
const elementSiblings = {
  get previousElementSibling() {
    for (let n = previousSibling(this); n; n = previousSibling(n)) if (n[S].type === ELEMENT_NODE) return n;
    return null;
  },
  get nextElementSibling() {
    for (let n = nextSibling(this); n; n = nextSibling(n)) if (n[S].type === ELEMENT_NODE) return n;
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

const rootOf = (node) => { let n = node; while (n[S].parent) n = n[S].parent; return n; };
const ancestry = (node) => { const chain = []; for (let n = node; n; n = n[S].parent) chain.unshift(n); return chain; };

function compareDocumentPosition(a, b) {
  if (a === b) return 0;
  if (rootOf(a) !== rootOf(b)) return 1 | 32 | 4;
  if (contains(a, b)) return 16 | 4;
  if (contains(b, a)) return 8 | 2;
  const ca = ancestry(a), cb = ancestry(b);
  let i = 0;
  while (ca[i] === cb[i]) i++;
  const siblings = ca[i - 1][S].children;
  return siblings.indexOf(cb[i]) < siblings.indexOf(ca[i]) ? 2 : 4;
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
  if (deep) for (const child of s.children) insert(copy, clone(child, true, doc), null);
  return copy;
}

const reflect = (attr) => ({
  get() { return state(this).attrs.get(attr) ?? ''; },
  set(v) { state(this).attrs.set(attr, String(v)); },
});

const inlineStyle = {
  get style() { return styleOf(this, internals(this).protos.CSSStyleProperties); },
  set style(text) { styleOf(this, internals(this).protos.CSSStyleProperties).cssText = text; },
};

export const INTERFACES = [
  ...CSS_INTERFACES,
  ...COLLECTION_INTERFACES,
  ...EVENT_INTERFACES,
  { name: 'Window', parent: 'EventTarget', members: {} },
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
      set nodeValue(v) { const s = state(this); if (s.type === TEXT_NODE || s.type === COMMENT_NODE) s.data = String(v ?? ''); },
      get ownerDocument() { const s = state(this); return s.type === DOCUMENT_NODE ? null : s.doc; },
      get parentNode() { return state(this).parent; },
      get parentElement() { const p = state(this).parent; return p && p[S].type === ELEMENT_NODE ? p : null; },
      get childNodes() {
        const s = state(this);
        return s.childList ?? (s.childList = liveList(internals(this).protos.NodeList, () => s.children));
      },
      get firstChild() { return state(this).children[0] ?? null; },
      get lastChild() { const k = state(this).children; return k[k.length - 1] ?? null; },
      get nextSibling() { return nextSibling(this); },
      get previousSibling() { return previousSibling(this); },
      get isConnected() { return rootOf(this)[S].type === DOCUMENT_NODE; },
      getRootNode() { return rootOf(this); },
      get textContent() { return state(this).type === DOCUMENT_NODE ? null : textOf(this); },
      set textContent(value) {
        const s = state(this);
        if (s.type === TEXT_NODE || s.type === COMMENT_NODE) { s.data = String(value ?? ''); return; }
        for (const child of s.children.slice()) remove(this, child);
        const text = value == null ? '' : String(value);
        if (text) insert(this, s.doc.createTextNode(text), null);
      },
      appendChild(node) { return insert(this, node, null); },
      insertBefore(node, ref) { return insert(this, node, ref ?? null); },
      removeChild(node) { return remove(this, node); },
      replaceChild(node, old) {
        if (state(old).parent !== this) throw domError('The node to be replaced is not a child of this node.', 'NotFoundError');
        const next = nextSibling(old);
        remove(this, old);
        insert(this, node, next === node ? nextSibling(node) : next);
        return old;
      },
      cloneNode(deep = false) { const s = state(this); return clone(this, deep, s.type === DOCUMENT_NODE ? this : s.doc); },
      contains(node) { return node != null && contains(this, node); },
      compareDocumentPosition(other) { return compareDocumentPosition(this, other); },
      isSameNode(other) { return this === other; },
      hasChildNodes() { return state(this).children.length > 0; },
    },
  },
  {
    name: 'Document',
    parent: 'Node',
    construct: (w, self) => w[S].initDocument(self),
    members: mix(parentNode, {
      get defaultView() { return state(this).window; },
      get documentElement() { return elementChildren(this)[0] ?? null; },
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
      getElementById(id) { return descendants(this).find((el) => el[S].attrs.get('id') === String(id)) ?? null; },
      getElementsByTagName(tag) { return byTagName(this, tag); },
      getElementsByClassName(names) { return byClassName(this, names); },
    }),
  },
  {
    name: 'DocumentFragment',
    parent: 'Node',
    construct: (w, self) => initNode(self, DOCUMENT_FRAGMENT_NODE, w.document),
    members: mix(parentNode, {
      getElementById(id) { return descendants(this).find((el) => el[S].attrs.get('id') === String(id)) ?? null; },
    }),
  },
  {
    name: 'CharacterData',
    parent: 'Node',
    members: mix(childNode, elementSiblings, {
      get data() { return state(this).data; },
      set data(value) { state(this).data = String(value); },
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
      set id(v) { state(this).attrs.set('id', String(v)); },
      className: reflect('class'),
      getAttribute(name) { return state(this).attrs.get(String(name).toLowerCase()) ?? null; },
      getAttributeNames() { return [...state(this).attrs.keys()]; },
      setAttribute(name, value) {
        const key = String(name).toLowerCase();
        state(this).attrs.set(key, String(value));
        if (key === 'style') styleAttributeChanged(this);
      },
      hasAttribute(name) { return state(this).attrs.has(String(name).toLowerCase()); },
      hasAttributes() { return state(this).attrs.size > 0; },
      removeAttribute(name) {
        const key = String(name).toLowerCase();
        state(this).attrs.delete(key);
        if (key === 'style') styleAttributeChanged(this);
      },
      toggleAttribute(name, force) {
        const has = this.hasAttribute(name);
        const want = force === undefined ? !has : !!force;
        if (want && !has) this.setAttribute(name, '');
        if (!want && has) this.removeAttribute(name);
        return want;
      },
      matches(selector) { return matchesSimple(this, String(selector)); },
      closest(selector) {
        for (let n = this; n && n[S].type === ELEMENT_NODE; n = n[S].parent) if (matchesSimple(n, String(selector))) return n;
        return null;
      },
      getElementsByTagName(tag) { return byTagName(this, tag); },
      getElementsByClassName(names) { return byClassName(this, names); },
    }),
  },
  {
    name: 'HTMLElement',
    parent: 'Element',
    members: mix(inlineStyle, {
      get hidden() { return state(this).attrs.has('hidden'); },
      set hidden(v) { if (v) state(this).attrs.set('hidden', ''); else state(this).attrs.delete('hidden'); },
      // No layout engine: sizes and offsets are 0, as in jsdom.
      get offsetWidth() { state(this); return 0; },
      get offsetHeight() { state(this); return 0; },
      get offsetTop() { state(this); return 0; },
      get offsetLeft() { state(this); return 0; },
    }),
  },
  { name: 'SVGElement', parent: 'Element', members: mix(inlineStyle) },
  { name: 'SVGGraphicsElement', parent: 'SVGElement', members: {} },
  { name: 'SVGSVGElement', parent: 'SVGGraphicsElement', members: {} },
  { name: 'SVGTitleElement', parent: 'SVGElement', members: {} },
];

function byTagName(root, tag) {
  const name = String(tag).toLowerCase();
  return liveList(internals(root).protos.HTMLCollection,
    () => descendants(root).filter((el) => name === '*' || el[S].tag.toLowerCase() === name));
}

function byClassName(root, names) {
  const wanted = String(names).split(/\s+/).filter(Boolean);
  return liveList(internals(root).protos.HTMLCollection, () => descendants(root).filter((el) => {
    const classes = ` ${el[S].attrs.get('class') ?? ''} `.replace(/\s+/g, ' ');
    return wanted.length > 0 && wanted.every((c) => classes.includes(` ${c} `));
  }));
}

// HTML element interfaces from the HTML standard; members are added per
// interface as they are implemented.
for (const [name, parent] of HTML_ELEMENTS) {
  if (!INTERFACES.some((i) => i.name === name)) INTERFACES.push({ name, parent, members: {} });
}

// SVG elements with an interface of their own; others are SVGElement.
export const SVG_ELEMENTS = new Map([['svg', 'SVGSVGElement'], ['title', 'SVGTitleElement']]);
export { HTML_NS, SVG_NS };
