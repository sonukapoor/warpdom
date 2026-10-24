// Internal node state, kept off the public surface: one record per node under
// a module-private symbol, so it is invisible to Object.keys, for...in and
// serializers, and cannot collide with test code.
//
// The tree is linked nodes: every node knows its parent, first and last
// child, previous and next sibling, and its child count, so navigation,
// insertion and removal are O(1). `rev` counts changes to a node's child
// list (for cached child arrays); the owner document's `treeRev` counts
// every change in its trees (for live collections). Connected elements with
// an id are indexed per document, so getElementById is O(1).
export const S = Symbol('warpdom');

// The internal state of objects other than nodes (events, FormData,
// AbortSignal, style declarations, ...) is invisible even to reflection:
// Jest's and Vitest's deep equality and pretty-format walk own enumerable
// symbol keys, so an own [S] property made toEqual compare (and snapshots
// print) the state, where jsdom's objects show none. The state is a private
// field stamped onto the object (Object.defineProperty with enumerable:
// false cost 65 ns per object, more than a whole new Event). A slot gives:
//   descriptor  an accessor for S on the interface's prototype, so
//               `obj[S] = record` and `obj[S]` work unchanged (createWindow
//               installs it on most interfaces, see hidesState);
//   get, init   direct access for hot code (events, style declarations):
//               through the accessor each read costs 2-4 ns more. get throws
//               a TypeError for other objects, as state() does; init is for
//               new objects only (it throws if the field exists: checking
//               first made new Event 35% slower).
// Nodes keep the plain property, the fastest for the hottest objects: test
// frameworks compare and print nodes as DOM nodes (isEqualNode, the
// DOMElement plugin), and clones, which Jest's messages walk, hide it
// (cloneNode).
export function hiddenSlot() {
  class Through {
    constructor(object) {
      return object;
    }
  }
  class Slot extends Through {
    #state;
    constructor(object, value) {
      super(object);
      this.#state = value;
    }
    static get = (object) => object.#state;
    static init = (object, value) => {
      new Slot(object, value);
    };
    static descriptor = {
      get() {
        return #state in this ? this.#state : undefined;
      },
      set(value) {
        if (#state in this) this.#state = value;
        else new Slot(this, value);
      },
      enumerable: false,
      configurable: true,
    };
  }
  return Slot;
}
export const HIDDEN_STATE = hiddenSlot().descriptor;

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const CDATA_SECTION_NODE = 4;
export const PROCESSING_INSTRUCTION_NODE = 7;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_TYPE_NODE = 10;
export const DOCUMENT_FRAGMENT_NODE = 11;

export const HTML_NS = 'http://www.w3.org/1999/xhtml';
export const SVG_NS = 'http://www.w3.org/2000/svg';

// Change notifications for MutationObserver (set by mutation.js). Called only
// when the document has observers: see observed().
export const hooks = {
  childList: null,
  attribute: null,
  characterData: null,
  removed: null,
  activation: null,
  frames: null,
  slots: null,
  // Script elements becoming connected (scripts.js); called only in
  // documents that have had a script element made by script.
  scripts: null,
  // Live range updates (ranges.js); called only when a document has live ranges.
  rangeInsert: null,
  rangeRemove: null,
  rangeReplaceData: null,
  rangeAdopt: null,
  // NodeIterator pre-removing steps (traversal.js); called only when a
  // document has node iterators.
  nodeIteratorRemove: null,
  // Document named properties (document-named.js); insertions are
  // reported only in documents that have owned an element that can be one
  // (namedCandidates), removals only while the document has named elements.
  named: null,
  // Custom element reactions (custom-elements.js); set once something is defined.
  ce: null,
  // Windows of removed iframes so far (frames.js): while there are none,
  // dispatch does not look for targets whose document is not fully active.
  discardedWindows: 0,
  // Blob data and File creation (file-reader.js), for FormData (forms.js).
  blobs: null,
  // Radio button groups on insertion (forms.js); called only in documents
  // that have had a checked radio button (checkedRadios).
  radios: null,
  // HTMLFormElement and HTMLSelectElement objects with indexed properties
  // (forms.js).
  indexedElement: null,
};

// Runs fn as one custom element reactions scope (a [CEReactions] operation
// made of several tree changes), or directly when nothing is defined.
export const reactionScope = (fn, a, b, c, d) => (hooks.ce === null ? fn(a, b, c, d) : hooks.ce.scope(fn, a, b, c, d));

// The live ranges of a document, if any (a Set of WeakRefs, see ranges.js).
const hasRanges = (doc) => {
  const r = doc[S].ranges;
  return r !== undefined && r.size !== 0;
};

const ownerDocument = (node) => (node[S].type === DOCUMENT_NODE ? node : node[S].doc);
export const observed = (node) => ownerDocument(node)[S].observerCount > 0;

// The setter of a window's own data property that is made on first read
// (interface objects, Image, console, webkitURL, ...: an accessor until
// then). It does what assigning the data property does: on the window,
// define(value) replaces the accessor; through an object that inherits from
// the window (Object.create(window).Image = x, super.Image = x) the
// receiver gets or updates its own property as with jsdom's data
// properties (black box, 20.0.3 to 30.1.3), see assignedThrough.
export function lazyDataSetter(window, name, define) {
  return function (value) {
    if (!assignedThrough(window, this, name, value)) define(value);
  };
}

// The part of that for an object that inherits from the window: true when
// receiver is one (the window is on its prototype chain), false for the
// window itself and anything else. The window's member stands for a
// writable data property, so this is OrdinarySet's receiver step: an own
// writable data property of the receiver gets the value and keeps its
// flags; a read-only or accessor own property, or a new property on a
// non-extensible receiver, is a failed assignment. A setter cannot return
// that failure, so it throws a TypeError, as a strict-mode assignment to
// the data property does (sloppy code and Reflect.set get false there
// instead; see PLAN.md, #96).
export function assignedThrough(window, receiver, name, value) {
  if (receiver === window || !isPrototypeOf.call(window, receiver)) return false;
  const own = Reflect.getOwnPropertyDescriptor(receiver, name);
  if (own === undefined) {
    if (!Reflect.defineProperty(receiver, name, { value, writable: true, enumerable: true, configurable: true })) {
      throw new TypeError(`Cannot add property ${String(name)}, object is not extensible`);
    }
  } else if (!('value' in own)) {
    throw new TypeError(`Cannot redefine property: ${String(name)}`);
  } else if (!own.writable || !Reflect.defineProperty(receiver, name, { value })) {
    throw new TypeError(`Cannot assign to read only property '${String(name)}' of object`);
  }
  return true;
}
const { isPrototypeOf } = Object.prototype;

export function state(node) {
  const s = node != null ? node[S] : undefined;
  if (!s) throw new TypeError('Illegal invocation');
  return s;
}

// WebIDL: an operation called with fewer arguments than it requires throws
// a TypeError. Callers test the last required argument for undefined first,
// so the common path never reads arguments.length.
export function tooFewArguments(iface, method, required, present) {
  throw new TypeError(
    `Failed to execute '${method}' on '${iface}': ${required} argument${required > 1 ? 's' : ''} required, but only ${present} present.`,
  );
}

export function initNode(node, type, doc, extra) {
  node[S] = {
    type,
    doc,
    parent: null,
    first: null,
    last: null,
    prev: null,
    next: null,
    count: 0,
    rev: 0,
    ...extra,
  };
  return node;
}

// ASCII lowercase (DOM names): other characters keep their case. Names that
// are already lowercase (the usual case) cost one toLowerCase, which returns
// the same string.
export function asciiLowercase(name) {
  const lower = name.toLowerCase();
  if (lower === name) return name;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 127) return name.replace(/[A-Z]+/g, (m) => m.toLowerCase());
  }
  return lower;
}

// Name validation (DOM, "valid element local name", "valid attribute local
// name", "valid namespace prefix"): a loop over the characters for the usual
// names, a regular expression for names that do not start with a letter.
const SPECIAL_ELEMENT_NAME = /^[:_\u0080-\u{10FFFF}][A-Za-z0-9\-.:_\u0080-\u{10FFFF}]*$/u;
export function validElementLocalName(name) {
  const n = name.length;
  if (n === 0) return false;
  const c = name.charCodeAt(0) | 32;
  if (c < 97 || c > 122) return SPECIAL_ELEMENT_NAME.test(name);
  for (let i = 1; i < n; i++) {
    const d = name.charCodeAt(i);
    if (d <= 32 ? d === 0 || d === 9 || d === 10 || d === 12 || d === 13 || d === 32 : d === 47 || d === 62)
      return false;
  }
  return true;
}
// createElement in an HTML document: the name validated and ASCII
// lowercased in one pass, or null when it is not a valid element local name.
export function htmlElementName(name) {
  const n = name.length;
  if (n === 0) return null;
  const c = name.charCodeAt(0);
  if ((c | 32) < 97 || (c | 32) > 122) return SPECIAL_ELEMENT_NAME.test(name) ? asciiLowercase(name) : null;
  let upper = c < 97;
  for (let i = 1; i < n; i++) {
    const d = name.charCodeAt(i);
    if (d <= 32) {
      if (d === 0 || d === 9 || d === 10 || d === 12 || d === 13 || d === 32) return null;
    } else if (d === 47 || d === 62) return null;
    else if (d >= 65 && d <= 90) upper = true;
  }
  return upper ? asciiLowercase(name) : name;
}

// Attribute local names: no ASCII whitespace, NULL, "/", "=" or ">".
export function validAttributeLocalName(name) {
  const n = name.length;
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    const d = name.charCodeAt(i);
    if (d <= 32 ? d === 0 || d === 9 || d === 10 || d === 12 || d === 13 || d === 32 : d === 47 || d === 61 || d === 62)
      return false;
  }
  return true;
}
// Namespace prefixes allow "=".
export const validNamespacePrefix = (name) => name !== '' && validAttributeLocalName(name.replace(/=/g, 'a'));

// The global object platform globals (performance, crypto, TextEncoder) come
// from: this realm's. The CommonJS build (scripts/build-cjs.mjs) declares
// __warpdomPlatformGlobal as Node's own global object: Jest evaluates it in
// a test file's VM context, whose global object is the test environment's
// window (jsdom's, or warpdom's), which may lack TextEncoder and has the
// window's crypto and performance.
/* global __warpdomPlatformGlobal */
export const PLATFORM_GLOBAL = typeof __warpdomPlatformGlobal === 'object' ? __warpdomPlatformGlobal : globalThis;

// The platform's URL parser (a web standard global): warpdom's own uses
// (location, base URLs, links) parse with it, not with whatever URL the
// global object has later (a runner may put the window's URL there).
export const PlatformURL = PLATFORM_GLOBAL.URL;

// A platform global (performance, crypto, TextDecoder), read on first use
// from the property the global object had when warpdom loaded: a test setup
// or runner may later put a window's on the global object, and Node defines
// some as getters that load a module when first read (performance: ~0.5 ms).
export function platformGlobal(name) {
  const descriptor = Object.getOwnPropertyDescriptor(PLATFORM_GLOBAL, name);
  let read = false;
  let value;
  return () => {
    if (!read) {
      read = true;
      value =
        descriptor === undefined
          ? PLATFORM_GLOBAL[name]
          : descriptor.get
            ? descriptor.get.call(PLATFORM_GLOBAL)
            : descriptor.value;
    }
    return value;
  };
}

// DOMException is a web standard global (browsers, Node, Deno, edge runtimes).
export function domError(message, name) {
  return new DOMException(message, name);
}

export function contains(ancestor, node) {
  for (let n = node; n; n = n[S].parent) if (n === ancestor) return true;
  return false;
}

export function rootOf(node) {
  let n = node;
  while (n[S].parent) n = n[S].parent;
  return n;
}

// Elements that can be document named properties (document-named.js).
export const isNamedTag = (tag) =>
  tag === 'img' || tag === 'form' || tag === 'iframe' || tag === 'embed' || tag === 'object';

// After an element (state s) got attributes other than through
// writeAttribute (parsing, cloning) or moved to doc: counts it in doc's
// namedCandidates when it has a name (an object also an id), which turns
// on the insertion walk for named properties. The count is never lowered
// (like frameCount): a high count only costs that walk. jsdom gained
// document named properties in version 30 (29.1.1 has none), so the jsdom
// profile before 30 counts nothing and its documents get none.
export function namedAttributesSet(s, doc) {
  if (s.ns !== HTML_NS || !isNamedTag(s.tag)) return;
  const name = s.attrs.get('name');
  if ((name !== undefined && name !== '') || (s.tag === 'object' && s.attrs.has('id'))) {
    const ds = doc[S];
    if (ds.window[S].compat.jsdom < 30) return;
    ds.namedCandidates = (ds.namedCandidates ?? 0) + 1;
  }
}

// In the document tree (not in a shadow tree): what the id index covers.
const isConnected = (node) => rootOf(node)[S].type === DOCUMENT_NODE;

// The shadow-including root: through shadow roots to their hosts.
export function shadowIncludingRoot(node) {
  let root = rootOf(node);
  while (root[S].shadow) root = rootOf(root[S].host);
  return root;
}

// Connected (DOM): the shadow-including root is a document.
export const connected = (node) => shadowIncludingRoot(node)[S].type === DOCUMENT_NODE;

// a is a shadow-including inclusive ancestor of b.
export function shadowIncludingContains(a, b) {
  for (let n = b; n;) {
    if (n === a) return true;
    const s = n[S];
    n = s.parent ?? (s.shadow ? s.host : null);
  }
  return false;
}

function changed(parent) {
  const ps = parent[S];
  ps.rev++;
  const doc = ps.type === DOCUMENT_NODE ? parent : ps.doc;
  const ds = doc[S];
  ds.treeRev = (ds.treeRev ?? 0) + 1;
  if (tracking.detached && ds.detachedRev !== undefined && connected(parent)) ds.detachedRev++;
}

export function insert(parent, node, ref) {
  return hooks.ce === null ? insertNode(parent, node, ref) : hooks.ce.scope(insertNode, parent, node, ref);
}

const hierarchyError = (message) => domError(message, 'HierarchyRequestError');

// The messages of the pre-insertion validity errors are jsdom's (tests
// compare caught DOMExceptions, svelte's hydration tests among them).
const INCORRECT_TREE = 'The operation would yield an incorrect node tree.';
const CHILD_NOT_FOUND = 'The child can not be found in the parent.';
const invalidInDocument = (node) => hierarchyError(`Invalid insertion of ${node.nodeName} node in #document node.`);
// A node can be a host-including ancestor of parent without children of its
// own only as a host: of a shadow root or of a template's contents.
const mayHost = (ns) => ns.first !== null || ns.shadowRoot != null || ns.content != null;

// The host of a shadow root or of a template's contents, or null.
const hostOf = (s) => (s.shadow === true ? s.host : (s.templateHost ?? null));

// node is a host-including inclusive ancestor of other.
function hostIncludingContains(node, other) {
  for (let n = other; n !== null;) {
    if (n === node) return true;
    const s = n[S];
    n = s.parent ?? hostOf(s);
  }
  return false;
}

// Steps shared by "ensure pre-insertion validity" and "replace" (DOM 4.2.3),
// in the standard's order: parent's type, node not a host-including inclusive
// ancestor of parent, child a child of parent, node's type. Returns parent's
// root: the walk to it is the ancestor check, and the caller needs the root.
// Inserting an element or text into an element (the common case) costs that
// walk and a few type tests; the document rules only run for a document.
function checkInsert(parent, ps, node, ns, child, replacing) {
  const pt = ps.type;
  if (pt !== ELEMENT_NODE && pt !== DOCUMENT_NODE && pt !== DOCUMENT_FRAGMENT_NODE) {
    throw hierarchyError(`Node can't be inserted in a ${parent.nodeName} parent.`);
  }
  let root = parent;
  for (let n = parent; n !== null; n = n[S].parent) {
    if (n === node) throw hierarchyError(INCORRECT_TREE);
    root = n;
  }
  // Through shadow hosts and template hosts (roots that are fragments), only
  // for a node that can be a host or an ancestor of one.
  if (root[S].type === DOCUMENT_FRAGMENT_NODE && mayHost(ns)) {
    const host = hostOf(root[S]);
    if (host !== null && hostIncludingContains(node, host)) throw hierarchyError(INCORRECT_TREE);
  }
  if (child !== null && state(child).parent !== parent) throw domError(CHILD_NOT_FOUND, 'NotFoundError');
  const nt = ns.type;
  if (nt === ELEMENT_NODE || nt === TEXT_NODE) {
    if (pt !== DOCUMENT_NODE) return root;
    if (nt === TEXT_NODE) throw hierarchyError(`#text node can't be inserted in #document parent.`);
  } else if (nt === DOCUMENT_TYPE_NODE) {
    if (pt !== DOCUMENT_NODE)
      throw hierarchyError(`${node.nodeName} node can't be inserted in ${parent.nodeName} parent.`);
  } else if (nt !== DOCUMENT_FRAGMENT_NODE && ns.data === undefined) {
    throw hierarchyError(`${node.nodeName} node can't be inserted in parent node.`);
  }
  if (pt === DOCUMENT_NODE) {
    // replaceChildren: the document's current children are going away.
    if (replacing === 'all') checkDocumentChild(NO_CHILDREN, node, null, null, null);
    else if (replacing) checkDocumentChild(ps, node, child, child[S].next, child[S].prev);
    else checkDocumentChild(ps, node, null, child, child !== null ? child[S].prev : ps.last);
  }
  return root;
}

// The document rules: no text, one element child, at most one doctype, the
// doctype before the element. replaced: the child being replaced (it does not
// count); after: the first node that must not be a doctype or have one after
// it; before: the last node that must not be an element or have one before it.
function checkDocumentChild(ds, node, replaced, after, before) {
  const ns = node[S];
  const nt = ns.type;
  let element = nt === ELEMENT_NODE;
  if (nt === DOCUMENT_FRAGMENT_NODE) {
    let elements = 0;
    for (let c = ns.first; c !== null; c = c[S].next) {
      const t = c[S].type;
      if (t === ELEMENT_NODE) elements++;
      else if (t === TEXT_NODE) throw invalidInDocument(node);
    }
    if (elements > 1) throw invalidInDocument(node);
    element = elements === 1;
  }
  if (element) {
    for (let c = ds.first; c !== null; c = c[S].next) {
      if (c[S].type === ELEMENT_NODE && c !== replaced) throw invalidInDocument(node);
    }
    for (let c = after; c !== null; c = c[S].next) {
      if (c[S].type === DOCUMENT_TYPE_NODE) throw invalidInDocument(node);
    }
  } else if (nt === DOCUMENT_TYPE_NODE) {
    for (let c = ds.first; c !== null; c = c[S].next) {
      if (c[S].type === DOCUMENT_TYPE_NODE && c !== replaced) throw invalidInDocument(node);
    }
    for (let c = before; c !== null; c = c[S].prev) {
      if (c[S].type === ELEMENT_NODE) throw invalidInDocument(node);
    }
  }
}

const NO_CHILDREN = { first: null, last: null };

// The validity checks of replaceChildren, before it removes the children:
// pre-insertion validity, with the document rules applied to the document
// as it will be.
export function checkReplaceAll(parent, node) {
  checkInsert(parent, state(parent), node, state(node), null, 'all');
}

// Replace (DOM): replaceChild.
export function replace(parent, node, child) {
  return hooks.ce === null ? replaceNode(parent, node, child) : hooks.ce.scope(replaceNode, parent, node, child);
}

function replaceNode(parent, node, child) {
  state(child);
  const root = checkInsert(parent, state(parent), node, state(node), child, true);
  let ref = child[S].next;
  if (ref === node) ref = node[S].next;
  let prev = child[S].prev;
  if (prev === node) prev = node[S].prev;
  // One mutation record for the removal and the insertion.
  const record = observed(parent);
  const nodes = record ? (node[S].type === DOCUMENT_FRAGMENT_NODE ? childArray(node).slice() : [node]) : null;
  // Adopting node removes it from its parent first, with a record of its own.
  if (node[S].parent !== null) remove(node[S].parent, node);
  const removed = child[S].parent === parent;
  if (removed) removeNode(parent, child, true);
  if (node[S].type === DOCUMENT_FRAGMENT_NODE) insertFragment(parent, node, ref, root, true);
  else insertChecked(parent, node, ref, root, true);
  if (record) hooks.childList(parent, nodes, removed ? [child] : [], prev, ref);
  return child;
}

// Replace all (DOM): parent's children replaced by node (or none), with one
// mutation record. Callers have checked node (replaceChildren) or made it.
export function replaceAll(parent, node) {
  return hooks.ce === null ? replaceAllNode(parent, node) : hooks.ce.scope(replaceAllNode, parent, node);
}

function replaceAllNode(parent, node) {
  const ps = state(parent);
  if (node === null && ps.first === null) return;
  const record = observed(parent);
  const removed = record ? childArray(parent).slice() : null;
  let added = null;
  if (record) added = node === null ? [] : node[S].type === DOCUMENT_FRAGMENT_NODE ? childArray(node).slice() : [node];
  while (ps.first !== null) removeNode(parent, ps.first, true);
  if (node !== null) {
    if (node[S].type === DOCUMENT_FRAGMENT_NODE) insertFragment(parent, node, null, rootOf(parent), true);
    else insertChecked(parent, node, null, rootOf(parent), true);
  }
  if (record && (added.length || removed.length)) hooks.childList(parent, added, removed, null, null);
}

function insertNode(parent, node, ref) {
  const child = ref ?? null;
  const ps = state(parent);
  const ns = state(node);
  // The common case, an element or text into an element, checked inline:
  // the ancestor walk (which also finds the root) and the reference child.
  const nt = ns.type;
  if (ps.type === ELEMENT_NODE && (nt === ELEMENT_NODE || nt === TEXT_NODE)) {
    let root = parent;
    for (let n = parent; n !== null; n = n[S].parent) {
      if (n === node) throw hierarchyError(INCORRECT_TREE);
      root = n;
    }
    if (root[S].type === DOCUMENT_FRAGMENT_NODE && mayHost(ns)) {
      const host = hostOf(root[S]);
      if (host !== null && hostIncludingContains(node, host)) throw hierarchyError(INCORRECT_TREE);
    }
    if (child !== null && state(child).parent !== parent) throw domError(CHILD_NOT_FOUND, 'NotFoundError');
    return insertChecked(parent, node, child, root, false);
  }
  const root = checkInsert(parent, ps, node, ns, child, false);
  return ns.type === DOCUMENT_FRAGMENT_NODE
    ? insertFragment(parent, node, child, root, false)
    : insertChecked(parent, node, child, root, false);
}

// Insert a fragment's children (DOM "insert" for a DocumentFragment).
// Scripts among them may run after all are in (scripts.js).
function insertFragment(parent, node, ref, root, quiet) {
  const ps = parent[S];
  const doc = ps.type === DOCUMENT_NODE ? parent : ps.doc;
  if (doc[S].scriptCount && hooks.scripts !== null)
    return hooks.scripts.fragment(doc, insertFragmentChildren, parent, node, ref, root, quiet);
  return insertFragmentChildren(parent, node, ref, root, quiet);
}

function insertFragmentChildren(parent, node, ref, root, quiet) {
  const ns = node[S];
  if (ns.first === null) return node;
  const recordParent = !quiet && observed(parent);
  if (!recordParent && !observed(node)) {
    while (ns.first) insertChecked(parent, ns.first, ref, root, true);
    return node;
  }
  // One record for the fragment's children leaving it, one for their
  // insertion (DOM "insert" steps 4 and 9).
  const nodes = childArray(node).slice();
  const prev = ref !== null ? ref[S].prev : parent[S].last;
  for (let i = 0; i < nodes.length; i++) removeNode(node, nodes[i], true);
  if (observed(node)) hooks.childList(node, [], nodes, null, null);
  for (let i = 0; i < nodes.length; i++) insertChecked(parent, nodes[i], ref, root, true);
  if (recordParent) hooks.childList(parent, nodes, [], prev, ref);
  return node;
}

// Insert a node that is not a fragment, after the validity checks; root is
// parent's root. quiet: the "suppress observers" flag (the caller queues the
// mutation record).
function insertChecked(parent, node, ref, root, quiet) {
  const ps = parent[S];
  const ns = node[S];
  if (ref === node) ref = ns.next;
  const moved = ns.parent !== null;
  if (moved) remove(ns.parent, node);
  // Removing node from elsewhere cannot change parent's ancestors (node is not
  // one of them); recheck anyway after a move, which can run more code.
  const connected = moved ? isConnected(parent) : root[S].type === DOCUMENT_NODE;
  const doc = ps.type === DOCUMENT_NODE ? parent : ps.doc;
  if (ns.doc !== doc) adopt(node, doc);
  if (ref && hasRanges(doc)) hooks.rangeInsert(doc, parent, ref);
  const prev = ref ? ref[S].prev : ps.last;
  ns.prev = prev;
  ns.next = ref ?? null;
  if (prev) prev[S].next = node;
  else ps.first = node;
  if (ref) ref[S].prev = node;
  else ps.last = node;
  ns.parent = parent;
  ps.count++;
  changed(parent);
  if (ps.tag === 'style' && isText(ns)) sheetCreated(ps);
  if (connected) indexIds(node, true, doc[S].namedCandidates !== undefined);
  if (doc[S].checkedRadios === true && hooks.radios !== null) hooks.radios(node, connected);
  if (!quiet && observed(parent)) hooks.childList(parent, [node], [], ns.prev, ns.next);
  if (hooks.ce !== null) hooks.ce.inserted(node);
  // Iframes get nested windows (frames.js), only in documents that have any.
  if (doc[S].frameCount && hooks.frames !== null && connected) hooks.frames.inserted(node);
  // Slot assignment changes (slots.js), only in documents with slots.
  if (doc[S].slotCount && hooks.slots !== null) hooks.slots.inserted(parent, node);
  // Scripts run (scripts.js), only in documents that have runnable ones.
  if (doc[S].scriptCount && hooks.scripts !== null) hooks.scripts.inserted(parent, node, root, connected);
  return node;
}

// The appropriate template contents owner document (HTML): an inert
// document without a browsing context, one per document, made on first use.
export function templateContentsOwner(doc) {
  const ds = doc[S];
  if (ds.inertTemplate === true) return doc;
  if (ds.templateDoc === undefined) {
    const inert = ds.window[S].createDocument({ contentType: ds.xml ? ds.contentType : 'text/html', xml: !!ds.xml });
    inert[S].inertTemplate = true;
    ds.templateDoc = inert;
  }
  return ds.templateDoc;
}

// Moves node and its subtree to another document (DOM "adopt").
export function adopt(node, doc) {
  const oldDoc = node[S].doc;
  for (let n = node; n; n = nextInTree(n, node)) {
    const s = n[S];
    s.doc = doc;
    if ((s.tag === 'iframe' || s.tag === 'frame') && s.ns === HTML_NS) doc[S].frameCount = (doc[S].frameCount ?? 0) + 1;
    if (s.tag === 'slot' && s.ns === HTML_NS) doc[S].slotCount = (doc[S].slotCount ?? 0) + 1;
    if (s.tag === 'base' && s.ns === HTML_NS) doc[S].baseCount = (doc[S].baseCount ?? 0) + 1;
    if (s.script === 'ready') doc[S].scriptCount = (doc[S].scriptCount ?? 0) + 1;
    if (s.tag === 'input' && (s.checked === true || s.attrs.has('checked'))) doc[S].checkedRadios = true;
    if (s.type === ELEMENT_NODE) namedAttributesSet(s, doc);
    if (s.attrNodes) for (const attr of s.attrNodes.values()) attr[S].doc = doc;
    // Mutation observer registrations move with their node: observed()
    // counts them per document.
    if (s.observers !== undefined && s.observers.length !== 0 && oldDoc !== doc)
      moveObserverCount(s.observers, oldDoc, doc);
    if (s.content) adopt(s.content, templateContentsOwner(doc));
  }
  if (hooks.ce !== null && oldDoc !== doc) hooks.ce.adopted(node, oldDoc, doc);
  // Live ranges inside the adopted subtree now follow the new document's
  // mutations.
  if (oldDoc !== doc && hasRanges(oldDoc)) hooks.rangeAdopt(node, oldDoc, doc);
}

// Registrations made by observe() (not transient ones) are counted in
// their node's document.
function moveObserverCount(regs, from, to) {
  let n = 0;
  for (let i = 0; i < regs.length; i++) if (regs[i].source === undefined) n++;
  if (n === 0) return;
  from[S].observerCount -= n;
  to[S].observerCount = (to[S].observerCount ?? 0) + n;
}

export function remove(parent, node) {
  return hooks.ce === null ? removeNode(parent, node) : hooks.ce.scope(removeNode, parent, node);
}

function removeNode(parent, node, quiet) {
  const ps = state(parent);
  const ns = state(node);
  if (ns.parent !== parent) throw domError('The node to be removed is not a child of this node.', 'NotFoundError');
  const ownerDoc = ps.type === DOCUMENT_NODE ? parent : ps.doc;
  if (hasRanges(ownerDoc)) hooks.rangeRemove(ownerDoc, parent, node);
  if (hooks.nodeIteratorRemove !== null) {
    const its = ownerDoc[S].iterators;
    if (its !== undefined && its.size !== 0) hooks.nodeIteratorRemove(ownerDoc, node);
  }
  // Connected matters only for the id index and frames: skip the walk to the
  // root when the document has neither.
  const ods = ownerDoc[S];
  const connected = (ods.ids !== undefined && ods.ids.size !== 0) || ods.frameCount ? isConnected(parent) : false;
  const wasConnected = hooks.ce !== null && shadowIncludingRoot(parent)[S].type === DOCUMENT_NODE;
  const prev = ns.prev;
  const next = ns.next;
  if (ns.prev) ns.prev[S].next = ns.next;
  else ps.first = ns.next;
  if (ns.next) ns.next[S].prev = ns.prev;
  else ps.last = ns.prev;
  ns.prev = ns.next = ns.parent = null;
  ps.count--;
  changed(parent);
  if (ps.tag === 'style' && isText(ns)) sheetCreated(ps);
  const named = ods.namedBy !== undefined && ods.namedBy.size !== 0;
  if (connected || named) indexIds(node, false, named, connected);
  // Focus fixup: removing the focused element (also from inside a shadow
  // tree of the removed subtree) focuses the document, without events.
  const focused = ods.focused;
  if (focused && focused !== ownerDoc) {
    if (focusAncestors(ods, focused).has(node)) ods.focused = ownerDoc;
  } else ods.focusChainOf = null;
  if (observed(parent)) {
    if (!quiet) hooks.childList(parent, [], [node], prev, next);
    hooks.removed(parent, node);
  }
  if (hooks.ce !== null) hooks.ce.removed(node, wasConnected);
  if (ods.frameCount && hooks.frames !== null && connected) hooks.frames.removed(node);
  if (ods.slotCount && hooks.slots !== null) hooks.slots.removed(parent, node);
  return node;
}

// The focused element's shadow-including inclusive ancestors, cached per
// document. They cannot change while it stays focused: any change removes one
// of them from its parent, which runs the focus fixup above and unfocuses it.
// A removal without a focused element drops the cache, so changes made while
// the element was not focused are never missed (reset.js drops it too).
function focusAncestors(ds, focused) {
  if (ds.focusChainOf === focused) return ds.focusChain;
  const chain = new Set();
  let light = true;
  for (let n = focused; n;) {
    chain.add(n);
    const s = n[S];
    if (s.parent === null && s.shadow) light = false;
    n = s.parent ?? (s.shadow ? s.host : null);
  }
  ds.focusChain = chain;
  ds.focusChainOf = focused;
  ds.focusChainLight = light;
  return chain;
}

// contains(ancestor, node) for removal hooks, in O(1) when node is the
// focused element with its ancestors cached and outside shadow trees (the
// usual place of the selection after focus).
export function containsFromDoc(ds, ancestor, node) {
  if (node === ds.focused && ds.focusChainOf === node && ds.focusChainLight) return ds.focusChain.has(ancestor);
  return contains(ancestor, node);
}

// --- id index -----------------------------------------------------------------

// Add or remove the ids of node and its element descendants.
// named: also update document named properties (document-named.js) for
// embed, form, iframe, img and object elements; ids: update the id index.
function indexIds(node, add, named, ids = true) {
  for (let n = node; n; n = nextInTree(n, node)) {
    const s = n[S];
    if (s.type === ELEMENT_NODE) {
      if (add && s.tag === 'style') sheetCreated(s, true);
      if (ids) {
        const id = s.attrs.get('id');
        if (id !== undefined && id !== '') updateId(s.doc, id, n, add);
      }
      if (named && s.ns === HTML_NS && isNamedTag(s.tag)) hooks.named.update(s.doc, n, add);
    }
  }
}

function updateId(doc, id, element, add) {
  const ds = doc[S];
  const ids = ds.ids ?? (ds.ids = new Map());
  const list = ids.get(id);
  if (add) {
    if (!list) ids.set(id, [element]);
    else if (!list.includes(element)) list.push(element);
  } else if (list) {
    const i = list.indexOf(element);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) ids.delete(id);
  }
}

// Attribute changes can change live collections (getElementsByClassName).
export function attributesChanged(element) {
  const ds = element[S].doc[S];
  ds.treeRev = (ds.treeRev ?? 0) + 1;
  if (tracking.detached && ds.detachedRev !== undefined && connected(element)) ds.detachedRev++;
}

// Changes in the document's connected tree, counted once a disconnected
// element's computed style was read (cascade.js, cascaded): jsdom 21 and
// later keep such an element's computed values until the connected tree
// or the style sheets change; changes in its own detached tree, its style
// attribute included, do not refresh them.
// tracking.detached: whether any document counts them (a module flag,
// cheaper on the insertion path than a missing field of every document).
const tracking = { detached: false };
export const trackDetachedStyles = (ds) => {
  if (ds.detachedRev === undefined) {
    ds.detachedRev = 0;
    tracking.detached = true;
  }
};

// Called when an element's id attribute changes.
export function idChanged(element, oldId, newId) {
  if (oldId === newId || !isConnected(element)) return;
  const doc = element[S].doc;
  if (oldId) updateId(doc, oldId, element, false);
  if (newId) updateId(doc, newId, element, true);
}

// The first connected element in tree order with this id: O(1) unless the
// id is (invalidly) shared.
export function elementById(doc, id) {
  const list = doc[S].ids?.get(id);
  if (!list) return null;
  if (list.length === 1) return list[0];
  let first = list[0];
  for (const el of list) if (precedes(el, first)) first = el;
  return first;
}

function precedes(a, b) {
  for (let n = a; n; n = nextInTree(n, null)) if (n === b) return true;
  return false;
}

// --- traversal ------------------------------------------------------------------

// Next node in tree order within root (pre-order), without allocation.
export function nextInTree(node, root) {
  const s = node[S];
  if (s.first) return s.first;
  for (let n = node; n && n !== root; n = n[S].parent) {
    if (n[S].next) return n[S].next;
  }
  return null;
}

// Child nodes as an array, cached until the child list changes.
export function childArray(node) {
  const s = node[S];
  if (s.childCache && s.childCacheRev === s.rev) return s.childCache;
  const arr = new Array(s.count);
  let i = 0;
  for (let c = s.first; c; c = c[S].next) arr[i++] = c;
  s.childCache = arr;
  s.childCacheRev = s.rev;
  return arr;
}

// Element children as an array, cached until the child list changes.
export function elementChildArray(node) {
  const s = node[S];
  if (s.elementCache && s.elementCacheRev === s.rev) return s.elementCache;
  const arr = [];
  for (let c = s.first; c; c = c[S].next) if (c[S].type === ELEMENT_NODE) arr.push(c);
  s.elementCache = arr;
  s.elementCacheRev = s.rev;
  return arr;
}

// Elements below root in tree order that satisfy test; one pass.
export function collectElements(root, test, first = false) {
  const out = [];
  for (let n = root[S].first; n; n = nextInTree(n, root)) {
    if (n[S].type === ELEMENT_NODE && test(n)) {
      out.push(n);
      if (first) break;
    }
  }
  return out;
}

// The one path for changing text or comment data.
// Replace data (DOM): the one path for changing text, comment and other
// character data. Offsets are UTF-16 code units, as in the standard.
export function replaceData(node, offset, count, data) {
  const s = node[S];
  const old = s.data;
  const length = old.length;
  if (offset > length)
    throw domError(`The offset ${offset} is greater than the node's length (${length}).`, 'IndexSizeError');
  if (offset + count > length) count = length - offset;
  if (observed(node)) hooks.characterData(node, old);
  s.data = old.slice(0, offset) + data + old.slice(offset + count);
  // A style element's text: its style sheet changes.
  if (s.parent && s.parent[S].tag === 'style') {
    s.doc[S].styleRev = (s.doc[S].styleRev ?? 0) + 1;
    if (isText(s)) sheetCreated(s.parent[S]);
  }
  if (hasRanges(s.doc)) hooks.rangeReplaceData(s.doc, node, offset, count, data.length);
}

// When a <style> element's style sheet was (re)created, as jsdom creates it
// (black box, 20.0.3 to 30.1.3): on the element's insertion into a document
// (indexIds walks the inserted subtree then), which makes a new sheet from
// its text (CSSOM edits of the old one are gone), and when a text child is
// inserted, removed or changed (not a comment or an element). Before jsdom
// 30.1.2 document.styleSheets is in that order (cssom.js).
let sheetStamps = 0;
const isText = (s) => s.type === TEXT_NODE || s.type === CDATA_SECTION_NODE;
function sheetCreated(s, inserted = false) {
  if (s.ns !== HTML_NS) return;
  s.sheetStamp = ++sheetStamps;
  if (inserted) s.sheetRev = -1;
}

// Changes to style rules (insertRule, deleteRule, a rule's declarations,
// a sheet's disabled flag), for computed style caches.
export const cssomChanges = { rev: 0 };

export const setData = (node, value) => replaceData(node, 0, node[S].data.length, value);

// The index of node among its parent's children (O(siblings)).
export function indexOf(node) {
  let i = 0;
  for (let n = node[S].prev; n; n = n[S].prev) i++;
  return i;
}

// The DOM "length" of a node: data length, child count, or 0 for doctypes.
export function nodeLength(node) {
  const s = node[S];
  if (s.data !== undefined) return s.data.length;
  return s.type === 10 ? 0 : s.count;
}

// Character data: Text, CDATASection, ProcessingInstruction, Comment.
export const isCharacterData = (type) =>
  type === TEXT_NODE || type === COMMENT_NODE || type === CDATA_SECTION_NODE || type === PROCESSING_INSTRUCTION_NODE;

// Text nodes include CDATA sections (CDATASection inherits from Text).
export function textOf(node) {
  const s = state(node);
  if (isCharacterData(s.type)) return s.data;
  let out = '';
  for (let n = s.first; n; n = nextInTree(n, node)) {
    const t = n[S].type;
    if (t === TEXT_NODE || t === CDATA_SECTION_NODE) out += n[S].data;
  }
  return out;
}
