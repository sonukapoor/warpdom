// Ranges and selection, from the DOM standard (5. Ranges) and the Selection
// API: Range (live ranges), StaticRange, AbstractRange, Selection,
// document.createRange() and getSelection().
//
// Live ranges are kept per document in a Set of WeakRefs, so ranges a test
// drops can be collected. Tree mutations update them through hooks that the
// core calls only when the document has live ranges, so documents without
// ranges pay nothing.
import {
  S, state, domError, hooks, ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_TYPE_NODE, HTML_NS, rootOf, insert, remove, replaceData, indexOf, nodeLength, contains, nextInTree,
  containsFromDoc,
} from './internal.js';
import { parseFragment } from './html.js';
import { dispatch } from './events.js';

const isCharacterData = (node) => node[S].data !== undefined && node[S].type !== 2;
const isText = (node) => node[S].type === TEXT_NODE;
const docOf = (node) => (node[S].type === DOCUMENT_NODE ? node : node[S].doc);
const internals = (node) => docOf(node)[S].window[S];

// --- boundary points ------------------------------------------------------------

// True if a comes before b in tree order (same root, a !== b).
function precedes(a, b) {
  if (contains(a, b)) return true;
  if (contains(b, a)) return false;
  const ancestorsOfA = new Set();
  for (let n = a; n; n = n[S].parent) ancestorsOfA.add(n);
  let childB = b;
  while (!ancestorsOfA.has(childB[S].parent)) childB = childB[S].parent;
  const common = childB[S].parent;
  let childA = a;
  while (childA[S].parent !== common) childA = childA[S].parent;
  for (let n = childA[S].next; n; n = n[S].next) if (n === childB) return true;
  return false;
}

// The position of boundary point (nodeA, offsetA) relative to (nodeB,
// offsetB): -1 before, 0 equal, 1 after. Both are in the same tree.
function position(nodeA, offsetA, nodeB, offsetB) {
  if (nodeA === nodeB) return Math.sign(offsetA - offsetB);
  if (precedes(nodeB, nodeA)) return -position(nodeB, offsetB, nodeA, offsetA);
  if (contains(nodeA, nodeB)) {
    let child = nodeB;
    while (child[S].parent !== nodeA) child = child[S].parent;
    return indexOf(child) < offsetA ? 1 : -1;
  }
  return -1;
}

function checkBoundary(node, offset) {
  if (node[S].type === DOCUMENT_TYPE_NODE) throw domError('DocumentType nodes cannot be range boundaries.', 'InvalidNodeTypeError');
  if (offset > nodeLength(node)) throw domError(`The offset ${offset} is larger than the node's length (${nodeLength(node)}).`, 'IndexSizeError');
}

// --- live range registry -----------------------------------------------------------

function register(range, doc) {
  const rs = range[S];
  if (rs.doc === doc) return;
  if (rs.doc) rs.doc[S].ranges?.delete(rs.ref);
  rs.doc = doc;
  (doc[S].ranges ?? (doc[S].ranges = new Set())).add(rs.ref);
}

// Stops updating a range nothing can observe any more (a selection range
// script never saw, after the selection moved on; a temporary range). Until
// garbage collection clears its WeakRef, a dropped range would otherwise cost
// every tree change in its document.
function release(range) {
  const rs = range[S];
  if (rs.doc) rs.doc[S].ranges?.delete(rs.ref);
  rs.doc = null;
}

// Calls fn with the state of each live range of doc.
function forEachRange(doc, fn) {
  const set = doc[S].ranges;
  if (!set) return;
  for (const ref of set) {
    const range = ref.deref();
    if (range) fn(range[S]); else set.delete(ref);
  }
}

function setStartPoint(range, node, offset) {
  const rs = range[S];
  rs.startNode = node;
  rs.startOffset = offset;
  register(range, docOf(node));
}

function setEndPoint(range, node, offset) {
  const rs = range[S];
  rs.endNode = node;
  rs.endOffset = offset;
}

// A range the selection creates for itself: script sees it only through
// getRangeAt, so until then it can be released when the selection drops it.
function selectionRange(window, startNode, startOffset, endNode = startNode, endOffset = startOffset) {
  const range = newRange(window, startNode, startOffset, endNode, endOffset);
  range[S].exposed = false;
  return range;
}

export function newRange(window, startNode, startOffset, endNode = startNode, endOffset = startOffset) {
  const range = Object.create(window[S].protos.Range);
  range[S] = {
    startNode, startOffset, endNode, endOffset, doc: null, ref: null, selection: null, exposed: true,
  };
  range[S].ref = new WeakRef(range);
  register(range, docOf(startNode));
  return range;
}

// Tree mutations (called from internal.js). These loop over the ranges
// directly (no callback) and find the child's index only when a range has a
// boundary in parent, since indexOf walks the siblings.
hooks.rangeInsert = (doc, parent, child) => {
  const set = doc[S].ranges;
  let index = -1;
  for (const ref of set) {
    const range = ref.deref();
    if (range === undefined) { set.delete(ref); continue; }
    const r = range[S];
    if (r.startNode !== parent && r.endNode !== parent) continue;
    if (index < 0) index = indexOf(child);
    if (r.startNode === parent && r.startOffset > index) r.startOffset++;
    if (r.endNode === parent && r.endOffset > index) r.endOffset++;
  }
};

// The live range pre-remove steps.
hooks.rangeRemove = (doc, parent, node) => {
  const ds = doc[S];
  const set = ds.ranges;
  const leaf = node[S].first === null;
  let index = -1;
  for (const ref of set) {
    const range = ref.deref();
    if (range === undefined) { set.delete(ref); continue; }
    const r = range[S];
    const inStart = leaf ? r.startNode === node : containsFromDoc(ds, node, r.startNode);
    const inEnd = r.endNode === r.startNode ? inStart : leaf ? r.endNode === node : containsFromDoc(ds, node, r.endNode);
    if (!inStart && !inEnd && r.startNode !== parent && r.endNode !== parent) continue;
    if (index < 0) index = indexOf(node);
    if (inStart) { r.startNode = parent; r.startOffset = index; }
    if (inEnd) { r.endNode = parent; r.endOffset = index; }
    if (r.startNode === parent && r.startOffset > index) r.startOffset--;
    if (r.endNode === parent && r.endOffset > index) r.endOffset--;
  }
};

hooks.rangeReplaceData = (doc, node, offset, count, dataLength) => {
  forEachRange(doc, (r) => {
    if (r.startNode === node) {
      if (r.startOffset > offset && r.startOffset <= offset + count) r.startOffset = offset;
      else if (r.startOffset > offset + count) r.startOffset += dataLength - count;
    }
    if (r.endNode === node) {
      if (r.endOffset > offset && r.endOffset <= offset + count) r.endOffset = offset;
      else if (r.endOffset > offset + count) r.endOffset += dataLength - count;
    }
  });
};

// --- Text and Node operations with range steps ---------------------------------------

// Split a Text node (DOM): the part after offset becomes a new next sibling.
export function splitText(node, offset) {
  const s = node[S];
  const length = s.data.length;
  if (offset > length) throw domError(`The offset ${offset} is larger than the Text node's length.`, 'IndexSizeError');
  const newData = s.data.slice(offset);
  const newNode = internals(node).createText(newData, s.doc);
  const parent = s.parent;
  if (parent) {
    insert(parent, newNode, s.next);
    const index = indexOf(node);
    forEachRange(s.doc, (r) => {
      if (r.startNode === node && r.startOffset > offset) { r.startNode = newNode; r.startOffset -= offset; }
      if (r.endNode === node && r.endOffset > offset) { r.endNode = newNode; r.endOffset -= offset; }
      if (r.startNode === parent && r.startOffset === index + 1) r.startOffset++;
      if (r.endNode === parent && r.endOffset === index + 1) r.endOffset++;
    });
  }
  replaceData(node, offset, length - offset, '');
  return newNode;
}

// Node.normalize(): no empty Text nodes, no adjacent Text nodes.
export function normalize(root) {
  const texts = [];
  for (let n = root[S].first; n; n = nextInTree(n, root)) if (isText(n)) texts.push(n);
  for (const node of texts) {
    const s = node[S];
    if (!s.parent || !contains(root, node)) continue; // merged into an earlier node
    let length = s.data.length;
    if (length === 0) { remove(s.parent, node); continue; }
    let data = '';
    for (let n = s.next; n && isText(n); n = n[S].next) data += n[S].data;
    replaceData(node, length, 0, data);
    let current = s.next;
    while (current && isText(current)) {
      const parent = current[S].parent;
      const index = indexOf(current);
      forEachRange(s.doc, (r) => {
        if (r.startNode === current) { r.startNode = node; r.startOffset += length; }
        if (r.endNode === current) { r.endNode = node; r.endOffset += length; }
        if (r.startNode === parent && r.startOffset === index) { r.startNode = node; r.startOffset = length; }
        if (r.endNode === parent && r.endOffset === index) { r.endNode = node; r.endOffset = length; }
      });
      length += current[S].data.length;
      current = current[S].next;
    }
    while (s.next && isText(s.next)) remove(s.parent, s.next);
  }
}

// --- range algorithms -------------------------------------------------------------------

const collapsed = (r) => r.startNode === r.endNode && r.startOffset === r.endOffset;

function setStart(range, node, offset) {
  checkBoundary(node, offset);
  const r = range[S];
  if (rootOf(node) !== rootOf(r.startNode) || position(node, offset, r.endNode, r.endOffset) > 0) setEndPoint(range, node, offset);
  setStartPoint(range, node, offset);
  boundaryChanged(range);
}

function setEnd(range, node, offset) {
  checkBoundary(node, offset);
  const r = range[S];
  if (rootOf(node) !== rootOf(r.startNode) || position(node, offset, r.startNode, r.startOffset) < 0) setStartPoint(range, node, offset);
  setEndPoint(range, node, offset);
  boundaryChanged(range);
}

function parentOrThrow(node) {
  const parent = node[S].parent;
  if (!parent) throw domError('The given node has no parent.', 'InvalidNodeTypeError');
  return parent;
}

function selectNode(range, node) {
  const parent = parentOrThrow(node);
  const index = indexOf(node);
  setStartPoint(range, parent, index);
  setEndPoint(range, parent, index + 1);
  boundaryChanged(range);
}

function commonAncestor(r) {
  let container = r.startNode;
  while (!contains(container, r.endNode)) container = container[S].parent;
  return container;
}

// Contained: (node, 0) after start and (node, length) before end.
const isContained = (node, r) => rootOf(node) === rootOf(r.startNode)
  && position(node, 0, r.startNode, r.startOffset) > 0
  && position(node, nodeLength(node), r.endNode, r.endOffset) < 0;

const isPartiallyContained = (node, r) => contains(node, r.startNode) !== contains(node, r.endNode);

const cloneNode = (node, deep) => node.cloneNode(deep);

// The pieces of a range under its common ancestor (shared by extract and clone).
function rangeParts(r) {
  const common = commonAncestor(r);
  let firstPartial = null;
  let lastPartial = null;
  const contained = [];
  for (let c = common[S].first; c; c = c[S].next) {
    if (!contains(r.startNode, r.endNode) && !firstPartial && isPartiallyContained(c, r)) firstPartial = c;
    if (!contains(r.endNode, r.startNode) && isPartiallyContained(c, r)) lastPartial = c;
    if (isContained(c, r)) contained.push(c);
  }
  if (contained.some((c) => c[S].type === DOCUMENT_TYPE_NODE)) throw domError('The range contains a doctype.', 'HierarchyRequestError');
  return { common, firstPartial, lastPartial, contained };
}

function withData(clone, data) {
  clone[S].data = data;
  return clone;
}

function extract(range) {
  const r = range[S];
  const fragment = internals(r.startNode).createFragment(docOf(r.startNode));
  if (collapsed(r)) return fragment;
  const { startNode, startOffset, endNode, endOffset } = r;
  if (startNode === endNode && isCharacterData(startNode)) {
    insert(fragment, withData(cloneNode(startNode), startNode[S].data.slice(startOffset, endOffset)), null);
    replaceData(startNode, startOffset, endOffset - startOffset, '');
    return fragment;
  }
  const { firstPartial, lastPartial, contained } = rangeParts(r);
  let newNode;
  let newOffset;
  if (contains(startNode, endNode)) {
    newNode = startNode;
    newOffset = startOffset;
  } else {
    let reference = startNode;
    while (reference[S].parent && !contains(reference[S].parent, endNode)) reference = reference[S].parent;
    newNode = reference[S].parent;
    newOffset = indexOf(reference) + 1;
  }
  if (firstPartial && isCharacterData(firstPartial)) {
    insert(fragment, withData(cloneNode(startNode), startNode[S].data.slice(startOffset)), null);
    replaceData(startNode, startOffset, nodeLength(startNode) - startOffset, '');
  } else if (firstPartial) {
    const clone = insert(fragment, cloneNode(firstPartial), null);
    const sub = newRange(docOf(startNode)[S].window, startNode, startOffset, firstPartial, nodeLength(firstPartial));
    insert(clone, extract(sub), null);
    release(sub);
  }
  for (const child of contained) insert(fragment, child, null);
  if (lastPartial && isCharacterData(lastPartial)) {
    insert(fragment, withData(cloneNode(endNode), endNode[S].data.slice(0, endOffset)), null);
    replaceData(endNode, 0, endOffset, '');
  } else if (lastPartial) {
    const clone = insert(fragment, cloneNode(lastPartial), null);
    const sub = newRange(docOf(endNode)[S].window, lastPartial, 0, endNode, endOffset);
    insert(clone, extract(sub), null);
    release(sub);
  }
  setStartPoint(range, newNode, newOffset);
  setEndPoint(range, newNode, newOffset);
  return fragment;
}

function cloneContents(range) {
  const r = range[S];
  const fragment = internals(r.startNode).createFragment(docOf(r.startNode));
  if (collapsed(r)) return fragment;
  const { startNode, startOffset, endNode, endOffset } = r;
  if (startNode === endNode && isCharacterData(startNode)) {
    insert(fragment, withData(cloneNode(startNode), startNode[S].data.slice(startOffset, endOffset)), null);
    return fragment;
  }
  const { firstPartial, lastPartial, contained } = rangeParts(r);
  if (firstPartial && isCharacterData(firstPartial)) {
    insert(fragment, withData(cloneNode(startNode), startNode[S].data.slice(startOffset)), null);
  } else if (firstPartial) {
    const clone = insert(fragment, cloneNode(firstPartial), null);
    const sub = newRange(docOf(startNode)[S].window, startNode, startOffset, firstPartial, nodeLength(firstPartial));
    insert(clone, cloneContents(sub), null);
    release(sub);
  }
  for (const child of contained) insert(fragment, cloneNode(child, true), null);
  if (lastPartial && isCharacterData(lastPartial)) {
    insert(fragment, withData(cloneNode(endNode), endNode[S].data.slice(0, endOffset)), null);
  } else if (lastPartial) {
    const clone = insert(fragment, cloneNode(lastPartial), null);
    const sub = newRange(docOf(endNode)[S].window, lastPartial, 0, endNode, endOffset);
    insert(clone, cloneContents(sub), null);
    release(sub);
  }
  return fragment;
}

function deleteContents(range) {
  const r = range[S];
  if (collapsed(r)) return;
  const { startNode, startOffset, endNode, endOffset } = r;
  if (startNode === endNode && isCharacterData(startNode)) {
    replaceData(startNode, startOffset, endOffset - startOffset, '');
    return;
  }
  // Contained nodes, in tree order, without those whose parent is contained.
  const toRemove = [];
  const root = rootOf(startNode);
  for (let n = root; n; n = nextInTree(n, root)) {
    if (isContained(n, r) && !(n[S].parent && isContained(n[S].parent, r))) toRemove.push(n);
  }
  let newNode;
  let newOffset;
  if (contains(startNode, endNode)) {
    newNode = startNode;
    newOffset = startOffset;
  } else {
    let reference = startNode;
    while (reference[S].parent && !contains(reference[S].parent, endNode)) reference = reference[S].parent;
    newNode = reference[S].parent;
    newOffset = indexOf(reference) + 1;
  }
  setStartPoint(range, newNode, newOffset);
  setEndPoint(range, newNode, newOffset);
  if (isCharacterData(startNode)) replaceData(startNode, startOffset, nodeLength(startNode) - startOffset, '');
  for (const node of toRemove) if (node[S].parent) remove(node[S].parent, node);
  if (isCharacterData(endNode)) replaceData(endNode, 0, endOffset, '');
}

function insertNode(range, node) {
  const r = range[S];
  const start = r.startNode;
  const st = start[S].type;
  if (st === 7 || st === COMMENT_NODE || (st === TEXT_NODE && !start[S].parent) || node === start) {
    throw domError('The range start is not a valid place to insert a node.', 'HierarchyRequestError');
  }
  let reference = null;
  if (st === TEXT_NODE) reference = start;
  else {
    reference = start[S].first;
    for (let i = 0; reference && i < r.startOffset; i++) reference = reference[S].next;
  }
  const parent = reference ? reference[S].parent : start;
  if (contains(node, parent)) throw domError('The node contains the insertion point.', 'HierarchyRequestError');
  if (st === TEXT_NODE) reference = splitText(start, r.startOffset);
  if (node === reference) reference = reference[S].next;
  if (node[S].parent) remove(node[S].parent, node);
  let newOffset = reference ? indexOf(reference) : nodeLength(parent);
  newOffset += node[S].type === DOCUMENT_FRAGMENT_NODE ? nodeLength(node) : 1;
  insert(parent, node, reference);
  if (collapsed(r)) setEndPoint(range, parent, newOffset);
}

function surroundContents(range, newParent) {
  const r = range[S];
  for (let n = r.startNode; n; n = n[S].parent) if (n[S].type !== TEXT_NODE && isPartiallyContained(n, r)) throw domError('The range partially contains a non-Text node.', 'InvalidStateError');
  for (let n = r.endNode; n; n = n[S].parent) if (n[S].type !== TEXT_NODE && isPartiallyContained(n, r)) throw domError('The range partially contains a non-Text node.', 'InvalidStateError');
  const t = newParent[S].type;
  if (t === DOCUMENT_NODE || t === DOCUMENT_TYPE_NODE || t === DOCUMENT_FRAGMENT_NODE) throw domError('The node cannot surround the range.', 'InvalidNodeTypeError');
  const fragment = extract(range);
  while (newParent[S].first) remove(newParent, newParent[S].first);
  insertNode(range, newParent);
  insert(newParent, fragment, null);
  selectNode(range, newParent);
}

function rangeText(r) {
  const { startNode, startOffset, endNode, endOffset } = r;
  if (startNode === endNode && isText(startNode)) return startNode[S].data.slice(startOffset, endOffset);
  let text = isText(startNode) ? startNode[S].data.slice(startOffset) : '';
  const root = rootOf(startNode);
  for (let n = root; n; n = nextInTree(n, root)) if (isText(n) && isContained(n, r)) text += n[S].data;
  if (isText(endNode)) text += endNode[S].data.slice(0, endOffset);
  return text;
}

// --- selection --------------------------------------------------------------------------

// A change of the selection's range schedules one selectionchange event.
function scheduleSelectionChange(doc) {
  const ds = doc[S];
  if (ds.selectionChangeScheduled) return;
  ds.selectionChangeScheduled = true;
  ds.window[S].setTimeout(() => {
    ds.selectionChangeScheduled = false;
    dispatch(doc, new ds.window.Event('selectionchange'));
  }, 0);
}

function boundaryChanged(range) {
  const selection = range[S].selection;
  if (selection) scheduleSelectionChange(selection[S].doc);
}

function setSelectionRange(selection, range, direction = 'forward') {
  const ss = selection[S];
  const old = ss.range;
  if (old) {
    old[S].selection = null;
    if (old !== range && !old[S].exposed) release(old);
  }
  ss.range = range;
  ss.direction = range ? direction : 'none';
  if (range) range[S].selection = selection;
  const same = old && range && old[S].startNode === range[S].startNode && old[S].startOffset === range[S].startOffset
    && old[S].endNode === range[S].endNode && old[S].endOffset === range[S].endOffset;
  if (old !== range && !same) scheduleSelectionChange(ss.doc);
}

export function getSelection(doc) {
  const ds = doc[S];
  if (ds.noView) return null;
  if (!ds.selection) {
    ds.selection = Object.create(ds.window[S].protos.Selection);
    ds.selection[S] = { doc, range: null, direction: 'none' };
  }
  return ds.selection;
}

// The selection's anchor and focus, if in the document tree.
function anchorFocus(selection) {
  const { range, direction, doc } = selection[S];
  if (!range) return null;
  const r = range[S];
  if (rootOf(r.startNode) !== doc || rootOf(r.endNode) !== doc) return null;
  return direction === 'backward'
    ? { anchorNode: r.endNode, anchorOffset: r.endOffset, focusNode: r.startNode, focusOffset: r.startOffset }
    : { anchorNode: r.startNode, anchorOffset: r.startOffset, focusNode: r.endNode, focusOffset: r.endOffset };
}

const inDocument = (node, doc) => rootOf(node) === doc;

function collapseSelection(selection, node, offset = 0) {
  if (node === null) { setSelectionRange(selection, null); return; }
  checkBoundary(node, offset);
  const doc = selection[S].doc;
  if (!inDocument(node, doc)) return;
  setSelectionRange(selection, selectionRange(doc[S].window, node, offset));
}

// Focusing an element collapses the selection to its start (the platform
// convention jsdom follows; tests read the selection after focus).
export function selectionFocused(doc, element) {
  collapseSelection(getSelection(doc), element, 0);
}

// --- interfaces --------------------------------------------------------------------------

const rangeState = (self) => {
  const s = state(self);
  if (s.startNode === undefined) throw new TypeError('Illegal invocation');
  return s;
};

const toOffset = (v) => Number(v) >>> 0;

const RANGE_CONSTANTS = { START_TO_START: 0, START_TO_END: 1, END_TO_END: 2, END_TO_START: 3 };

export const RANGE_INTERFACES = [
  {
    name: 'AbstractRange',
    members: {
      get startContainer() { return rangeState(this).startNode; },
      get startOffset() { return rangeState(this).startOffset; },
      get endContainer() { return rangeState(this).endNode; },
      get endOffset() { return rangeState(this).endOffset; },
      get collapsed() { return collapsed(rangeState(this)); },
    },
  },
  {
    name: 'StaticRange',
    parent: 'AbstractRange',
    construct: (w, self, [init]) => {
      if (!init?.startContainer?.[S] || !init?.endContainer?.[S]) throw new TypeError("Failed to construct 'StaticRange': required member is undefined.");
      for (const node of [init.startContainer, init.endContainer]) {
        const t = node[S].type;
        if (t === DOCUMENT_TYPE_NODE || t === 2) throw domError('DocumentType and Attr nodes cannot be range boundaries.', 'InvalidNodeTypeError');
      }
      self[S] = { startNode: init.startContainer, startOffset: toOffset(init.startOffset), endNode: init.endContainer, endOffset: toOffset(init.endOffset) };
      return self;
    },
    members: {},
  },
  {
    name: 'Range',
    parent: 'AbstractRange',
    statics: RANGE_CONSTANTS,
    construct: (w) => newRange(w, w.document, 0),
    members: {
      ...Object.fromEntries(Object.entries(RANGE_CONSTANTS).map(([k, v]) => [k, { constant: v }])),
      get commonAncestorContainer() { return commonAncestor(rangeState(this)); },
      setStart(node, offset) { rangeState(this); setStart(this, state(node) && node, toOffset(offset)); },
      setEnd(node, offset) { rangeState(this); setEnd(this, state(node) && node, toOffset(offset)); },
      setStartBefore(node) { rangeState(this); setStart(this, parentOrThrow(node), indexOf(node)); },
      setStartAfter(node) { rangeState(this); setStart(this, parentOrThrow(node), indexOf(node) + 1); },
      setEndBefore(node) { rangeState(this); setEnd(this, parentOrThrow(node), indexOf(node)); },
      setEndAfter(node) { rangeState(this); setEnd(this, parentOrThrow(node), indexOf(node) + 1); },
      collapse(toStart = false) {
        const r = rangeState(this);
        if (toStart) setEndPoint(this, r.startNode, r.startOffset);
        else setStartPoint(this, r.endNode, r.endOffset);
        boundaryChanged(this);
      },
      selectNode(node) { rangeState(this); selectNode(this, node); },
      selectNodeContents(node) {
        rangeState(this);
        if (state(node).type === DOCUMENT_TYPE_NODE) throw domError('DocumentType nodes cannot be range boundaries.', 'InvalidNodeTypeError');
        setStartPoint(this, node, 0);
        setEndPoint(this, node, nodeLength(node));
        boundaryChanged(this);
      },
      compareBoundaryPoints(how, sourceRange) {
        const r = rangeState(this);
        const o = rangeState(sourceRange);
        const h = Number(how);
        if (![0, 1, 2, 3].includes(h)) throw domError('The comparison method provided must be one of START_TO_START, START_TO_END, END_TO_END, or END_TO_START.', 'NotSupportedError');
        if (rootOf(r.startNode) !== rootOf(o.startNode)) throw domError('The two Ranges are not in the same tree.', 'WrongDocumentError');
        const [thisNode, thisOffset] = h === 0 || h === 3 ? [r.startNode, r.startOffset] : [r.endNode, r.endOffset];
        const [srcNode, srcOffset] = h === 0 || h === 1 ? [o.startNode, o.startOffset] : [o.endNode, o.endOffset];
        return position(thisNode, thisOffset, srcNode, srcOffset);
      },
      deleteContents() { rangeState(this); deleteContents(this); },
      extractContents() { rangeState(this); return extract(this); },
      cloneContents() { rangeState(this); return cloneContents(this); },
      insertNode(node) { rangeState(this); insertNode(this, state(node) && node); },
      surroundContents(newParent) { rangeState(this); surroundContents(this, state(newParent) && newParent); },
      cloneRange() { const r = rangeState(this); return newRange(docOf(r.startNode)[S].window, r.startNode, r.startOffset, r.endNode, r.endOffset); },
      detach() { rangeState(this); },
      isPointInRange(node, offset) {
        const r = rangeState(this);
        if (rootOf(node) !== rootOf(r.startNode)) return false;
        const o = toOffset(offset);
        checkBoundary(node, o);
        return position(node, o, r.startNode, r.startOffset) >= 0 && position(node, o, r.endNode, r.endOffset) <= 0;
      },
      comparePoint(node, offset) {
        const r = rangeState(this);
        if (rootOf(node) !== rootOf(r.startNode)) throw domError('The node and the range are not in the same tree.', 'WrongDocumentError');
        const o = toOffset(offset);
        checkBoundary(node, o);
        if (position(node, o, r.startNode, r.startOffset) < 0) return -1;
        if (position(node, o, r.endNode, r.endOffset) > 0) return 1;
        return 0;
      },
      intersectsNode(node) {
        const r = rangeState(this);
        if (rootOf(node) !== rootOf(r.startNode)) return false;
        const parent = node[S].parent;
        if (!parent) return true;
        const offset = indexOf(node);
        return position(parent, offset, r.endNode, r.endOffset) < 0 && position(parent, offset + 1, r.startNode, r.startOffset) > 0;
      },
      toString() { return rangeText(rangeState(this)); },
      // DOM Parsing: parse in the context of the start node's element.
      createContextualFragment(markup) {
        const r = rangeState(this);
        const node = r.startNode;
        const t = node[S].type;
        let element = t === ELEMENT_NODE ? node
          : t === TEXT_NODE || t === COMMENT_NODE ? (node[S].parent?.[S].type === ELEMENT_NODE ? node[S].parent : null) : null;
        const doc = docOf(node);
        if (!element || (element[S].ns === HTML_NS && element[S].tag === 'html' && !doc[S].xml)) element = doc.createElement('body');
        return parseFragment(doc, element, String(markup));
      },
      // No layout: as for elements, empty.
      getBoundingClientRect() { rangeState(this); return new (docOf(this[S].startNode)[S].window.DOMRect)(); },
      getClientRects() { rangeState(this); return []; },
    },
  },
  {
    name: 'Selection',
    members: {
      get anchorNode() { state(this); return anchorFocus(this)?.anchorNode ?? null; },
      get anchorOffset() { state(this); return anchorFocus(this)?.anchorOffset ?? 0; },
      get focusNode() { state(this); return anchorFocus(this)?.focusNode ?? null; },
      get focusOffset() { state(this); return anchorFocus(this)?.focusOffset ?? 0; },
      get isCollapsed() {
        state(this);
        const af = anchorFocus(this);
        return !af || (af.anchorNode === af.focusNode && af.anchorOffset === af.focusOffset);
      },
      get rangeCount() { state(this); return anchorFocus(this) ? 1 : 0; },
      get type() {
        state(this);
        if (!anchorFocus(this)) return 'None';
        return collapsed(this[S].range[S]) ? 'Caret' : 'Range';
      },
      get direction() { const ss = state(this); return ss.range ? ss.direction : 'none'; },
      getRangeAt(index) {
        state(this);
        if (Number(index) !== 0 || !anchorFocus(this)) throw domError('The index is not in the allowed range.', 'IndexSizeError');
        const range = this[S].range;
        range[S].exposed = true;
        return range;
      },
      addRange(range) {
        const ss = state(this);
        const r = rangeState(range);
        if (rootOf(r.startNode) !== ss.doc || this.rangeCount !== 0) return;
        setSelectionRange(this, range);
      },
      removeRange(range) {
        if (state(this).range !== range) throw domError('The given range is not in the selection.', 'NotFoundError');
        setSelectionRange(this, null);
      },
      removeAllRanges() { if (state(this).range) setSelectionRange(this, null); },
      empty() { this.removeAllRanges(); },
      getComposedRanges() {
        const ss = state(this);
        if (!ss.range) return [];
        const r = ss.range[S];
        return [new (ss.doc[S].window.StaticRange)({ startContainer: r.startNode, startOffset: r.startOffset, endContainer: r.endNode, endOffset: r.endOffset })];
      },
      collapse(node, offset = 0) { state(this); collapseSelection(this, node, toOffset(offset)); },
      setPosition(node, offset = 0) { state(this); collapseSelection(this, node, toOffset(offset)); },
      collapseToStart() {
        const ss = state(this);
        if (!ss.range) throw domError('There is no selection to collapse.', 'InvalidStateError');
        const r = ss.range[S];
        setSelectionRange(this, selectionRange(ss.doc[S].window, r.startNode, r.startOffset));
      },
      collapseToEnd() {
        const ss = state(this);
        if (!ss.range) throw domError('There is no selection to collapse.', 'InvalidStateError');
        const r = ss.range[S];
        setSelectionRange(this, selectionRange(ss.doc[S].window, r.endNode, r.endOffset));
      },
      extend(node, offset = 0) {
        const ss = state(this);
        if (!inDocument(node, ss.doc)) return;
        if (!ss.range) throw domError('There is no selection to extend.', 'InvalidStateError');
        const o = toOffset(offset);
        checkBoundary(node, o);
        const af = anchorFocus(this);
        const anchorNode = af ? af.anchorNode : ss.range[S].startNode;
        const anchorOffset = af ? af.anchorOffset : ss.range[S].startOffset;
        const window = ss.doc[S].window;
        let range;
        if (rootOf(node) !== rootOf(ss.range[S].startNode)) range = selectionRange(window, node, o);
        else if (position(anchorNode, anchorOffset, node, o) <= 0) range = selectionRange(window, anchorNode, anchorOffset, node, o);
        else range = selectionRange(window, node, o, anchorNode, anchorOffset);
        setSelectionRange(this, range, position(node, o, anchorNode, anchorOffset) < 0 ? 'backward' : 'forward');
      },
      setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset) {
        const ss = state(this);
        const ao = toOffset(anchorOffset);
        const fo = toOffset(focusOffset);
        if (ao > nodeLength(anchorNode) || fo > nodeLength(focusNode)) throw domError('The offset is larger than the node\'s length.', 'IndexSizeError');
        if (!inDocument(anchorNode, ss.doc) || !inDocument(focusNode, ss.doc)) return;
        checkBoundary(anchorNode, ao);
        checkBoundary(focusNode, fo);
        const window = ss.doc[S].window;
        const backward = position(focusNode, fo, anchorNode, ao) < 0;
        const range = backward ? selectionRange(window, focusNode, fo, anchorNode, ao) : selectionRange(window, anchorNode, ao, focusNode, fo);
        setSelectionRange(this, range, backward ? 'backward' : 'forward');
      },
      selectAllChildren(node) {
        const ss = state(this);
        if (state(node).type === DOCUMENT_TYPE_NODE) throw domError('DocumentType nodes cannot be selected.', 'InvalidNodeTypeError');
        if (rootOf(node) !== ss.doc) return;
        setSelectionRange(this, selectionRange(ss.doc[S].window, node, 0, node, node[S].count));
      },
      modify() { state(this); }, // needs layout
      deleteFromDocument() {
        state(this);
        if (anchorFocus(this)) deleteContents(this[S].range);
      },
      containsNode(node, allowPartialContainment = false) {
        const ss = state(this);
        if (!ss.range || rootOf(node) !== ss.doc) return false;
        const r = ss.range[S];
        const length = nodeLength(node);
        return allowPartialContainment
          ? position(r.startNode, r.startOffset, node, length) <= 0 && position(r.endNode, r.endOffset, node, 0) >= 0
          : position(r.startNode, r.startOffset, node, 0) <= 0 && position(r.endNode, r.endOffset, node, length) >= 0;
      },
      toString() { const ss = state(this); return ss.range ? rangeText(ss.range[S]) : ''; },
    },
  },
];
