// Internal node state, kept off the public surface: one record per node under
// a module-private symbol, so it is invisible to Object.keys, for...in and
// serializers, and cannot collide with test code.
export const S = Symbol('warpdom');

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_FRAGMENT_NODE = 11;

export const HTML_NS = 'http://www.w3.org/1999/xhtml';
export const SVG_NS = 'http://www.w3.org/2000/svg';

export function state(node) {
  const s = node != null ? node[S] : undefined;
  if (!s) throw new TypeError('Illegal invocation');
  return s;
}

export function initNode(node, type, doc, extra) {
  node[S] = { type, doc, parent: null, children: [], ...extra };
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

export function insert(parent, node, ref) {
  const ps = state(parent);
  const ns = state(node);
  if (ref != null && state(ref).parent !== parent) {
    throw domError('The node before which the new node is to be inserted is not a child of this node.', 'NotFoundError');
  }
  if (contains(node, parent)) {
    throw domError('The new child element contains the parent.', 'HierarchyRequestError');
  }
  if (ns.type === DOCUMENT_FRAGMENT_NODE) {
    for (const child of ns.children.slice()) insert(parent, child, ref);
    return node;
  }
  if (ref === node) ref = nextSibling(node);
  if (ns.parent) remove(ns.parent, node);
  const kids = ps.children;
  const i = ref == null ? -1 : kids.indexOf(ref);
  if (i < 0) kids.push(node); else kids.splice(i, 0, node);
  ns.parent = parent;
  return node;
}

export function remove(parent, node) {
  const kids = state(parent).children;
  const i = kids.indexOf(node);
  if (i < 0) throw domError('The node to be removed is not a child of this node.', 'NotFoundError');
  kids.splice(i, 1);
  state(node).parent = null;
  return node;
}

export function nextSibling(node) {
  const p = state(node).parent;
  if (!p) return null;
  const kids = p[S].children;
  return kids[kids.indexOf(node) + 1] ?? null;
}

export function previousSibling(node) {
  const p = state(node).parent;
  if (!p) return null;
  const kids = p[S].children;
  return kids[kids.indexOf(node) - 1] ?? null;
}

export function textOf(node) {
  const s = state(node);
  if (s.type === TEXT_NODE || s.type === COMMENT_NODE) return s.data;
  let out = '';
  for (const c of s.children) {
    const cs = c[S];
    if (cs.type === TEXT_NODE) out += cs.data;
    else if (cs.type === ELEMENT_NODE || cs.type === DOCUMENT_FRAGMENT_NODE) out += textOf(c);
  }
  return out;
}

// Elements in tree order below root.
export function descendants(root, out = []) {
  for (const child of root[S].children) {
    if (child[S].type === ELEMENT_NODE) {
      out.push(child);
      descendants(child, out);
    }
  }
  return out;
}
