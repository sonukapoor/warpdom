// TreeWalker, NodeIterator and NodeFilter, following the DOM standard's
// traversal algorithms on the linked tree (no arrays, no allocation per step).
import { S, state, domError, hooks, DOCUMENT_NODE } from './internal.js';

const ACCEPT = 1, REJECT = 2, SKIP = 3;

export const NODE_FILTER = {
  FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3,
  SHOW_ALL: 0xFFFFFFFF, SHOW_ELEMENT: 0x1, SHOW_ATTRIBUTE: 0x2, SHOW_TEXT: 0x4, SHOW_CDATA_SECTION: 0x8,
  SHOW_ENTITY_REFERENCE: 0x10, SHOW_ENTITY: 0x20, SHOW_PROCESSING_INSTRUCTION: 0x40, SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100, SHOW_DOCUMENT_TYPE: 0x200, SHOW_DOCUMENT_FRAGMENT: 0x400, SHOW_NOTATION: 0x800,
};

function filter(traverser, node) {
  const s = traverser[S];
  if (s.active) throw domError('Recursive filter invocation.', 'InvalidStateError');
  const mask = 1 << (node[S].type - 1);
  if (!(s.whatToShow & mask)) return SKIP;
  if (s.filter == null) return ACCEPT;
  s.active = true;
  try {
    const result = typeof s.filter === 'function' ? s.filter(node) : s.filter.acceptNode(node);
    return Number(result);
  } finally {
    s.active = false;
  }
}

const first = (n) => n[S].first;
const last = (n) => n[S].last;
const next = (n) => n[S].next;
const prev = (n) => n[S].prev;
const parent = (n) => n[S].parent;

function traverseChildren(walker, type) {
  const s = walker[S];
  let node = type === 'first' ? first(s.current) : last(s.current);
  while (node) {
    const result = filter(walker, node);
    if (result === ACCEPT) { s.current = node; return node; }
    if (result === SKIP) {
      const child = type === 'first' ? first(node) : last(node);
      if (child) { node = child; continue; }
    }
    while (node) {
      const sibling = type === 'first' ? next(node) : prev(node);
      if (sibling) { node = sibling; break; }
      const p = parent(node);
      if (!p || p === s.root || p === s.current) return null;
      node = p;
    }
  }
  return null;
}

function traverseSiblings(walker, type) {
  const s = walker[S];
  let node = s.current;
  if (node === s.root) return null;
  for (;;) {
    let sibling = type === 'next' ? next(node) : prev(node);
    while (sibling) {
      node = sibling;
      const result = filter(walker, node);
      if (result === ACCEPT) { s.current = node; return node; }
      sibling = type === 'next' ? first(node) : last(node);
      if (result === REJECT || !sibling) sibling = type === 'next' ? next(node) : prev(node);
    }
    node = parent(node);
    if (!node || node === s.root) return null;
    if (filter(walker, node) === ACCEPT) return null;
  }
}

const createState = (root, whatToShow, filterArg) => ({
  root, whatToShow: whatToShow === undefined ? NODE_FILTER.SHOW_ALL : whatToShow >>> 0, filter: filterArg ?? null, active: false,
});

export function createTreeWalker(window, root, whatToShow, filterArg) {
  if (!root?.[S]) throw new TypeError("Failed to execute 'createTreeWalker' on 'Document': parameter 1 is not of type 'Node'.");
  const walker = Object.create(window[S].protos.TreeWalker);
  walker[S] = { ...createState(root, whatToShow, filterArg), current: root };
  return walker;
}

export function createNodeIterator(window, root, whatToShow, filterArg) {
  if (!root?.[S]) throw new TypeError("Failed to execute 'createNodeIterator' on 'Document': parameter 1 is not of type 'Node'.");
  const it = Object.create(window[S].protos.NodeIterator);
  it[S] = {
    ...createState(root, whatToShow, filterArg), reference: root, beforeReference: true,
    // The position of a traversal in progress (while its filter runs).
    candidate: null, candidateBefore: false,
  };
  // Registered with the root's document for the pre-removing steps.
  const doc = root[S].type === DOCUMENT_NODE ? root : root[S].doc;
  const ds = doc[S];
  (ds.iterators ?? (ds.iterators = new Set())).add(new WeakRef(it));
  hooks.nodeIteratorRemove = preRemoveAll;
  return it;
}

// NodeIterator pre-removing steps (DOM), for every live iterator of the
// document, on its reference and on the position of a traversal in progress.
function preRemoveAll(doc, toBeRemoved) {
  const set = doc[S].iterators;
  for (const ref of set) {
    const it = ref.deref();
    if (it === undefined) { set.delete(ref); continue; }
    const s = it[S];
    if (toBeRemoved === s.root) continue;
    const r = adjust(s.root, toBeRemoved, s.reference, s.beforeReference);
    if (r !== null) { s.reference = r.node; s.beforeReference = r.before; }
    if (s.candidate !== null) {
      const c = adjust(s.root, toBeRemoved, s.candidate, s.candidateBefore);
      if (c !== null) { s.candidate = c.node; s.candidateBefore = c.before; }
    }
  }
}

// The new position for (node, before) when toBeRemoved goes, or null.
function adjust(root, toBeRemoved, node, before) {
  let inside = false;
  for (let n = node; n; n = parent(n)) if (n === toBeRemoved) { inside = true; break; }
  if (!inside) return null;
  if (before) {
    for (let n = toBeRemoved; n && n !== root; n = parent(n)) if (next(n)) return { node: next(n), before: true };
  }
  let p = prev(toBeRemoved);
  if (p === null) return { node: parent(toBeRemoved), before: false };
  while (last(p)) p = last(p);
  return { node: p, before: false };
}

// Following/preceding node in tree order, bounded by root.
function following(node, root) {
  if (first(node)) return first(node);
  for (let n = node; n && n !== root; n = parent(n)) if (next(n)) return next(n);
  return null;
}
function preceding(node, root) {
  if (node === root) return null;
  let p = prev(node);
  if (!p) return parent(node);
  while (last(p)) p = last(p);
  return p;
}

// Traverse (DOM). The position moves on from the reference; while the filter
// runs it is the candidate, which removals retarget like the reference. The
// reference changes only when a node is accepted: to the candidate as
// retargeted, while the accepted node itself is returned.
function iterate(it, forward) {
  const s = it[S];
  let node = s.reference;
  let before = s.beforeReference;
  try {
    for (;;) {
      if (forward) {
        if (!before) { node = following(node, s.root); if (!node) return null; } else before = false;
      } else if (before) { node = preceding(node, s.root); if (!node) return null; } else before = true;
      s.candidate = node;
      s.candidateBefore = before;
      const result = filter(it, node);
      const accepted = result === ACCEPT;
      const filtered = node;
      node = s.candidate;
      before = s.candidateBefore;
      if (accepted) {
        s.reference = node;
        s.beforeReference = before;
        return filtered;
      }
    }
  } finally {
    s.candidate = null;
  }
}

// Merge member objects by descriptor: object spread would call getters.
const mix = (...objects) => {
  const out = {};
  for (const o of objects) Object.defineProperties(out, Object.getOwnPropertyDescriptors(o));
  return out;
};

const common = {
  get root() { return state(this).root; },
  get whatToShow() { return state(this).whatToShow; },
  get filter() { return state(this).filter; },
};

export const TRAVERSAL_INTERFACES = [
  {
    name: 'TreeWalker',
    members: mix(common, {
      get currentNode() { return state(this).current; },
      set currentNode(node) {
        if (!node?.[S]) throw new TypeError("Failed to set the 'currentNode' property on 'TreeWalker': The provided value is not of type 'Node'.");
        state(this).current = node;
      },
      parentNode() {
        const s = state(this);
        let node = s.current;
        while (node && node !== s.root) {
          node = parent(node);
          if (node && filter(this, node) === ACCEPT) { s.current = node; return node; }
        }
        return null;
      },
      firstChild() { return traverseChildren(this, 'first'); },
      lastChild() { return traverseChildren(this, 'last'); },
      nextSibling() { return traverseSiblings(this, 'next'); },
      previousSibling() { return traverseSiblings(this, 'previous'); },
      previousNode() {
        const s = state(this);
        let node = s.current;
        while (node !== s.root) {
          let sibling = prev(node);
          while (sibling) {
            node = sibling;
            let result = filter(this, node);
            while (result !== REJECT && last(node)) {
              node = last(node);
              result = filter(this, node);
            }
            if (result === ACCEPT) { s.current = node; return node; }
            sibling = prev(node);
          }
          if (node === s.root || !parent(node)) return null;
          node = parent(node);
          if (filter(this, node) === ACCEPT) { s.current = node; return node; }
        }
        return null;
      },
      nextNode() {
        const s = state(this);
        let node = s.current;
        let result = ACCEPT;
        for (;;) {
          while (result !== REJECT && first(node)) {
            node = first(node);
            result = filter(this, node);
            if (result === ACCEPT) { s.current = node; return node; }
          }
          let sibling = null;
          for (let t = node; t; t = parent(t)) {
            if (t === s.root) return null;
            sibling = next(t);
            if (sibling) break;
          }
          if (!sibling) return null;
          node = sibling;
          result = filter(this, node);
          if (result === ACCEPT) { s.current = node; return node; }
        }
      },
    }),
  },
  {
    name: 'NodeIterator',
    members: mix(common, {
      get referenceNode() { return state(this).reference; },
      get pointerBeforeReferenceNode() { return state(this).beforeReference; },
      nextNode() { return iterate(this, true); },
      previousNode() { return iterate(this, false); },
      detach() { state(this); },
    }),
  },
  { name: 'NodeFilter', statics: NODE_FILTER, members: {} },
];
