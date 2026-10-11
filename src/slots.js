// Slots (DOM standard, 4.2.2): named slot assignment, computed when asked
// (find a slot, find slottables, find flattened slottables), and the
// slotchange event. Changes that can affect a shadow tree's slots schedule
// one check per shadow root in a microtask: it compares each slot's
// assigned nodes with what they were at the last check and fires
// slotchange at the slots that changed, in tree order.
//
// Documents without slot elements pay nothing: the tree calls these hooks
// only when the document's slotCount is non-zero (counted at creation and
// adoption, in window.js and internal.js).
import { S, ELEMENT_NODE, TEXT_NODE, HTML_NS, hooks, rootOf, nextInTree } from './internal.js';
import { dispatch } from './events.js';

const isSlot = (n) => { const s = n[S]; return s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === 'slot'; };
const isShadowRoot = (n) => n[S].shadow === true;
const slotName = (slot) => slot[S].attrs.get('name') ?? '';
const slottableName = (node) => (node[S].type === ELEMENT_NODE ? node[S].attrs.get('slot') ?? '' : '');
const isSlottable = (n) => n[S].type === ELEMENT_NODE || n[S].type === TEXT_NODE;

// The shadow root's slots by name (the first in tree order wins), cached
// until its document changes.
function slotIndex(root) {
  const rs = root[S];
  const rev = rs.doc[S].treeRev ?? 0;
  if (rs.slotIndex && rs.slotIndex.rev === rev) return rs.slotIndex;
  const byName = new Map();
  const all = [];
  for (let n = rs.first; n; n = nextInTree(n, root)) {
    if (!isSlot(n)) continue;
    all.push(n);
    const name = slotName(n);
    if (!byName.has(name)) byName.set(name, n);
  }
  return (rs.slotIndex = { rev, byName, all });
}

// Find a slot for a slottable (open: only in open shadow roots).
export function findSlot(slottable, open = false) {
  const parent = slottable[S].parent;
  if (!parent || parent[S].type !== ELEMENT_NODE) return null;
  const shadow = parent[S].shadowRoot;
  if (!shadow || (open && shadow[S].mode !== 'open')) return null;
  return slotIndex(shadow).byName.get(slottableName(slottable)) ?? null;
}

// Find slottables: the host's children assigned to this slot.
export function assignedNodes(slot) {
  const root = rootOf(slot);
  if (!isShadowRoot(root)) return [];
  const result = [];
  for (let c = root[S].host[S].first; c; c = c[S].next) {
    if (isSlottable(c) && findSlot(c) === slot) result.push(c);
  }
  return result;
}

// Find flattened slottables: slots among them replaced by theirs, and a
// slot without assigned nodes by its fallback content.
function flattened(slot, out) {
  let nodes = assignedNodes(slot);
  if (nodes.length === 0) {
    nodes = [];
    for (let c = slot[S].first; c; c = c[S].next) if (isSlottable(c)) nodes.push(c);
  }
  for (const node of nodes) {
    if (isSlot(node) && isShadowRoot(rootOf(node))) flattened(node, out);
    else out.push(node);
  }
  return out;
}

// --- slotchange ----------------------------------------------------------------------

const sameNodes = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);

function check(root) {
  const rs = root[S];
  rs.slotCheckPending = false;
  const current = isShadowRoot(root) ? slotIndex(root).all : [];
  const currentSet = new Set(current);
  const changed = [];
  const consider = (slot, inTree) => {
    const ss = slot[S];
    const now = inTree ? assignedNodes(slot) : [];
    const before = ss.slotSnapshot ?? [];
    if (!sameNodes(now, before) || ss.slotForce) changed.push(slot);
    ss.slotSnapshot = now;
    ss.slotForce = false;
  };
  for (const slot of current) consider(slot, true);
  for (const slot of rs.trackedSlots ?? []) if (!currentSet.has(slot)) consider(slot, false);
  rs.trackedSlots = currentSet;
  for (const slot of changed) {
    const window = slot[S].doc[S].window;
    dispatch(slot, new window.Event('slotchange', { bubbles: true }));
  }
}

function schedule(root) {
  const rs = root[S];
  if (rs.slotCheckPending) return;
  rs.slotCheckPending = true;
  queueMicrotask(() => check(root));
}

// A slot's fallback content changed while it has no assigned nodes.
function fallbackChanged(slot) {
  const root = rootOf(slot);
  if (!isShadowRoot(root) || assignedNodes(slot).length) return;
  slot[S].slotForce = true;
  schedule(root);
}

function hasSlot(node) {
  for (let n = node; n; n = nextInTree(n, node)) if (isSlot(n)) return true;
  return false;
}

// Tree changes: a host's children, slots entering or leaving a shadow tree,
// a slot's fallback content.
function childrenChanged(parent, node) {
  const ps = parent[S];
  if (ps.type === ELEMENT_NODE && ps.shadowRoot) schedule(ps.shadowRoot);
  if (isSlot(parent)) fallbackChanged(parent);
  if (node[S].type === ELEMENT_NODE && hasSlot(node)) {
    const root = rootOf(parent);
    if (isShadowRoot(root)) schedule(root);
  }
}

hooks.slots = {
  inserted: childrenChanged,
  removed: childrenChanged,
  attributeChanged(element, name) {
    if (name === 'slot') {
      const parent = element[S].parent;
      if (parent && parent[S].type === ELEMENT_NODE && parent[S].shadowRoot) schedule(parent[S].shadowRoot);
    } else if (name === 'name' && isSlot(element)) {
      const root = rootOf(element);
      if (isShadowRoot(root)) schedule(root);
    }
  },
};

export const SLOT_MEMBERS = {
  assignedNodes(options) { return options?.flatten ? flattened(this, []) : assignedNodes(this); },
  assignedElements(options) {
    const nodes = options?.flatten ? flattened(this, []) : assignedNodes(this);
    return nodes.filter((n) => n[S].type === ELEMENT_NODE);
  },
};

// Element and Text (the Slottable mixin), as an accessor description to
// spread into their members.
export const SLOTTABLE_MEMBERS = {
  assignedSlot: { get() { return findSlot(this, true); } },
};
