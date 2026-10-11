// resetWindow(): return a window to the state of a fresh one, keeping its
// objects. The document, window, interface objects and custom element
// definitions stay the same objects (modules hold on to them), while their
// state is reset: a new document tree, no listeners, handlers, focus,
// selection or observers on the document and window, no pending animation
// frames and storage, and the initial URL, history, viewport and scroll
// position.
//
// Made for running test files without isolation (Vitest --no-isolate):
// files share modules but each starts with a fresh-looking DOM, which takes
// a millisecond instead of a new window.
import { S, insert } from './internal.js';
import { clearStorage } from './storage.js';
import { clearCookies } from './cookies.js';
import { clearWindowTimers } from './window-features.js';
import { clearDeclarations } from './css.js';

// Own properties (string and symbol keys) of an object, as descriptors.
const ownProperties = (object) => new Map(Reflect.ownKeys(object).map((key) => [key, Object.getOwnPropertyDescriptor(object, key)]));

// Puts back an object's own properties as snapshotted: properties added
// since (a library's "already set up" marker, a test's global) are deleted.
function restoreOwnProperties(object, snapshot) {
  for (const key of Reflect.ownKeys(object)) {
    if (!snapshot.has(key)) delete object[key];
  }
  for (const [key, descriptor] of snapshot) {
    const current = Object.getOwnPropertyDescriptor(object, key);
    if (!current || current.value !== descriptor.value || current.get !== descriptor.get) Object.defineProperty(object, key, descriptor);
  }
}

// Call once the window is set up (after a test environment installs it).
export function snapshotWindow(window) {
  const ws = window[S];
  ws.snapshot = ownProperties(window);
  ws.documentSnapshot = ownProperties(window.document);
  ws.initialURL = ws.url.href;
  // The initial tree's nodes, kept by reset (libraries hold document.body).
  const doc = window.document;
  ws.initialNodes = [doc.doctype, doc.documentElement, doc.head, doc.body].map((node) => ({ node, props: ownProperties(node) }));
}

export function resetWindow(window) {
  const ws = window[S];
  const doc = window.document;
  const ds = doc[S];

  // Own properties of the window and document as they were at the
  // snapshot: libraries mark a document they have set up (React, user-event)
  // and set up again only if the mark is gone.
  restoreOwnProperties(window, ws.snapshot);
  restoreOwnProperties(doc, ws.documentSnapshot);

  // Window state.
  ws.listeners = undefined;
  ws.handlers = undefined;
  ws.viewport = undefined;
  if (ws.frames) ws.frames.queue.clear();
  clearWindowTimers(window);
  clearStorage(window);
  clearCookies(window);
  ws.url = new URL(ws.initialURL);
  ws.history[S].entries = [{ state: null, url: ws.url }];
  ws.history[S].index = 0;

  // Observers of the document go first, with their pending records, so the
  // reset itself is not observed.
  if (ds.observers) {
    for (const { observer } of ds.observers) {
      observer[S].targets.delete(doc);
      observer[S].records = [];
    }
    ds.observerCount = Math.max(0, (ds.observerCount ?? 0) - ds.observers.length);
    ds.observers = undefined;
  }

  // The document's tree: the initial doctype, html, head and body stay
  // (libraries hold on to document.body), emptied and without attributes,
  // listeners or added properties; everything else is detached, without
  // running callbacks or observers.
  const detachChildren = (node) => {
    const s = node[S];
    for (let c = s.first; c;) {
      const cs = c[S];
      const next = cs.next;
      cs.parent = cs.prev = cs.next = null;
      c = next;
    }
    s.first = s.last = null;
    s.count = 0;
    s.rev++;
  };
  detachChildren(doc);
  for (const { node, props } of ws.initialNodes) {
    const ns = node[S];
    if (ns.parent) {
      // Detach a node a test moved elsewhere.
      const ps = ns.parent[S];
      if (ns.prev) ns.prev[S].next = ns.next; else ps.first = ns.next;
      if (ns.next) ns.next[S].prev = ns.prev; else ps.last = ns.prev;
      ps.count--;
      ps.rev++;
      ns.parent = ns.prev = ns.next = null;
    }
    detachChildren(node);
    if (ns.attrs) ns.attrs.clear();
    if (ns.style) clearDeclarations(ns.style);
    ns.listeners = undefined;
    ns.handlers = undefined;
    ns.observers = undefined;
    restoreOwnProperties(node, props);
  }
  ds.treeRev = (ds.treeRev ?? 0) + 1;
  ds.ids = undefined;
  const [doctype, html, head, body] = ws.initialNodes.map(({ node }) => node);
  insert(doc, doctype, null);
  insert(doc, html, null);
  insert(html, head, null);
  insert(html, body, null);

  // Document state.
  ds.listeners = undefined;
  ds.handlers = undefined;
  ds.focused = null;
  ds.focusChainOf = null;
  if (ds.selection) {
    ds.selection[S].range = null;
    ds.selection[S].direction = 'none';
  }
  ds.ranges = undefined;
  return window;
}
