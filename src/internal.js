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

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_TYPE_NODE = 10;
export const DOCUMENT_FRAGMENT_NODE = 11;

export const HTML_NS = 'http://www.w3.org/1999/xhtml';
export const SVG_NS = 'http://www.w3.org/2000/svg';

// Change notifications for MutationObserver (set by mutation.js). Called only
// when the document has observers: see observed().
export const hooks = {
  childList: null, attribute: null, characterData: null, activation: null, frames: null, slots: null,
  // Live range updates (ranges.js); called only when a document has live ranges.
  rangeInsert: null, rangeRemove: null, rangeReplaceData: null,
  // Custom element reactions (custom-elements.js); set once something is defined.
  ce: null,
};

// Runs fn as one custom element reactions scope (a [CEReactions] operation
// made of several tree changes), or directly when nothing is defined.
export const reactionScope = (fn, a, b, c, d) => (hooks.ce === null ? fn(a, b, c, d) : hooks.ce.scope(fn, a, b, c, d));

// The live ranges of a document, if any (a Set of WeakRefs, see ranges.js).
const hasRanges = (doc) => { const r = doc[S].ranges; return r !== undefined && r.size !== 0; };

const ownerDocument = (node) => (node[S].type === DOCUMENT_NODE ? node : node[S].doc);
export const observed = (node) => ownerDocument(node)[S].observerCount > 0;

export function state(node) {
  const s = node != null ? node[S] : undefined;
  if (!s) throw new TypeError('Illegal invocation');
  return s;
}

export function initNode(node, type, doc, extra) {
  node[S] = {
    type, doc, parent: null, first: null, last: null, prev: null, next: null, count: 0, rev: 0, ...extra,
  };
  return node;
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
  doc[S].treeRev = (doc[S].treeRev ?? 0) + 1;
}

export function insert(parent, node, ref) {
  return hooks.ce === null ? insertNode(parent, node, ref) : hooks.ce.scope(insertNode, parent, node, ref);
}

function insertNode(parent, node, ref) {
  const ps = state(parent);
  const ns = state(node);
  if (ref != null && state(ref).parent !== parent) {
    throw domError('The node before which the new node is to be inserted is not a child of this node.', 'NotFoundError');
  }
  if (contains(node, parent)) {
    throw domError('The new child element contains the parent.', 'HierarchyRequestError');
  }
  if (ns.type === DOCUMENT_FRAGMENT_NODE) {
    while (ns.first) insert(parent, ns.first, ref);
    return node;
  }
  if (ns.type === DOCUMENT_NODE) throw domError('Nodes of type #document may not be inserted.', 'HierarchyRequestError');
  if (ref === node) ref = ns.next;
  if (ns.parent) remove(ns.parent, node);
  const doc = ps.type === DOCUMENT_NODE ? parent : ps.doc;
  if (ns.doc !== doc) adopt(node, doc);
  if (ref && hasRanges(doc)) hooks.rangeInsert(doc, parent, ref);
  const prev = ref ? ref[S].prev : ps.last;
  ns.prev = prev;
  ns.next = ref ?? null;
  if (prev) prev[S].next = node; else ps.first = node;
  if (ref) ref[S].prev = node; else ps.last = node;
  ns.parent = parent;
  ps.count++;
  changed(parent);
  if (isConnected(parent)) indexIds(node, true);
  if (observed(parent)) hooks.childList(parent, [node], [], ns.prev, ns.next);
  if (hooks.ce !== null) hooks.ce.inserted(node);
  // Iframes get nested windows (frames.js), only in documents that have any.
  if (doc[S].frameCount && hooks.frames !== null && isConnected(parent)) hooks.frames.inserted(node);
  // Slot assignment changes (slots.js), only in documents with slots.
  if (doc[S].slotCount && hooks.slots !== null) hooks.slots.inserted(parent, node);
  return node;
}

// Moves node and its subtree to another document (DOM "adopt").
export function adopt(node, doc) {
  const oldDoc = node[S].doc;
  for (let n = node; n; n = nextInTree(n, node)) {
    const s = n[S];
    s.doc = doc;
    if (s.tag === 'iframe' && s.ns === HTML_NS) doc[S].frameCount = (doc[S].frameCount ?? 0) + 1;
    if (s.tag === 'slot' && s.ns === HTML_NS) doc[S].slotCount = (doc[S].slotCount ?? 0) + 1;
    if (s.attrNodes) for (const attr of s.attrNodes.values()) attr[S].doc = doc;
    if (s.content) adopt(s.content, doc);
  }
  if (hooks.ce !== null && oldDoc !== doc) hooks.ce.adopted(node, oldDoc, doc);
}

export function remove(parent, node) {
  return hooks.ce === null ? removeNode(parent, node) : hooks.ce.scope(removeNode, parent, node);
}

function removeNode(parent, node) {
  const ps = state(parent);
  const ns = state(node);
  if (ns.parent !== parent) throw domError('The node to be removed is not a child of this node.', 'NotFoundError');
  const ownerDoc = ps.type === DOCUMENT_NODE ? parent : ps.doc;
  if (hasRanges(ownerDoc)) hooks.rangeRemove(ownerDoc, parent, node);
  const connected = isConnected(parent);
  const wasConnected = hooks.ce !== null && shadowIncludingRoot(parent)[S].type === DOCUMENT_NODE;
  const prev = ns.prev;
  const next = ns.next;
  if (ns.prev) ns.prev[S].next = ns.next; else ps.first = ns.next;
  if (ns.next) ns.next[S].prev = ns.prev; else ps.last = ns.prev;
  ns.prev = ns.next = ns.parent = null;
  ps.count--;
  changed(parent);
  if (connected) indexIds(node, false);
  // Focus fixup: removing the focused element (also from inside a shadow
  // tree of the removed subtree) focuses the document, without events.
  const focused = ownerDoc[S].focused;
  if (focused && focused !== ownerDoc && shadowIncludingContains(node, focused)) ownerDoc[S].focused = ownerDoc;
  if (observed(parent)) hooks.childList(parent, [], [node], prev, next);
  if (hooks.ce !== null) hooks.ce.removed(node, wasConnected);
  if (ownerDoc[S].frameCount && hooks.frames !== null && connected) hooks.frames.removed(node);
  if (ownerDoc[S].slotCount && hooks.slots !== null) hooks.slots.removed(parent, node);
  return node;
}

// --- id index -----------------------------------------------------------------

// Add or remove the ids of node and its element descendants.
function indexIds(node, add) {
  for (let n = node; n; n = nextInTree(n, node)) {
    const s = n[S];
    if (s.type === ELEMENT_NODE) {
      const id = s.attrs.get('id');
      if (id !== undefined && id !== '') updateId(s.doc, id, n, add);
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
  const doc = element[S].doc;
  doc[S].treeRev = (doc[S].treeRev ?? 0) + 1;
}

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
  if (offset > length) throw domError(`The offset ${offset} is greater than the node's length (${length}).`, 'IndexSizeError');
  if (offset + count > length) count = length - offset;
  if (observed(node)) hooks.characterData(node, old);
  s.data = old.slice(0, offset) + data + old.slice(offset + count);
  // A style element's text: its style sheet changes.
  if (s.parent && s.parent[S].tag === 'style') s.doc[S].styleRev = (s.doc[S].styleRev ?? 0) + 1;
  if (hasRanges(s.doc)) hooks.rangeReplaceData(s.doc, node, offset, count, data.length);
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

export function textOf(node) {
  const s = state(node);
  if (s.type === TEXT_NODE || s.type === COMMENT_NODE) return s.data;
  let out = '';
  for (let n = s.first; n; n = nextInTree(n, node)) if (n[S].type === TEXT_NODE) out += n[S].data;
  return out;
}
