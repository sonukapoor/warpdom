// resetWindow(): return a window to the state of a fresh one, keeping its
// objects. The document, window, interface objects and custom element
// definitions stay the same objects (modules hold on to them), while their
// state is reset: a new document tree, no listeners, handlers, focus,
// selection or observers on the document and window, no pending animation
// frames and storage, and the initial URL, history, viewport and scroll
// position. The window's own objects that stay (navigator, location,
// history, screen, ...) get back the own properties they had, and so do
// their prototypes (Navigator.prototype, ...): user-event's setup() puts a
// clipboard stub on navigator, which a fresh window does not have.
//
// Not restored: other interface prototypes (Element.prototype.scrollTo =
// ..., often set by a setup file, which runs again before each file),
// interface objects' own properties, a kept object whose prototype was
// replaced (Object.setPrototypeOf), properties a test made non-configurable,
// and Node's own globals (performance, crypto, console), which are the
// worker's, not the window's (the Vitest environment clears the marks and
// measures on Node's performance itself).
//
// Made for running test files without isolation (Vitest --no-isolate):
// files share modules but each starts with a fresh-looking DOM, which takes
// a millisecond instead of a new window.
import { S, insert, hooks, PlatformURL as URL } from './internal.js';
import { clearStorage } from './storage.js';
import { clearCookies } from './cookies.js';
import { clearWindowTimers } from './window-features.js';
import { abortWindowRequests } from './xhr.js';
import { clearDeclarations } from './css.js';
import { forgetLastList } from './collections.js';

// Own properties (string and symbol keys) of an object, as descriptors.
const ownProperties = (object) =>
  new Map(Reflect.ownKeys(object).map((key) => [key, Object.getOwnPropertyDescriptor(object, key)]));

// Whether two property descriptors differ in value, accessors or flags
// (Object.defineProperty(window, 'innerWidth', { writable: false }) keeps
// the value). Values compare with Object.is: scrollY = -0 is a change (and
// NaN is not).
const changed = (current, descriptor) =>
  !Object.is(current.value, descriptor.value) ||
  current.get !== descriptor.get ||
  current.set !== descriptor.set ||
  current.writable !== descriptor.writable ||
  current.enumerable !== descriptor.enumerable ||
  current.configurable !== descriptor.configurable;

// Puts back an object's own properties as snapshotted: properties added
// since (a library's "already set up" marker, a test's global) are deleted.
// A property made non-configurable cannot be deleted or redefined; it stays
// (Reflect: no TypeError, which would fail every later file).
function restoreOwnProperties(object, snapshot) {
  for (const key of Reflect.ownKeys(object)) {
    if (!snapshot.has(key)) Reflect.deleteProperty(object, key);
  }
  for (const [key, descriptor] of snapshot) {
    const current = Object.getOwnPropertyDescriptor(object, key);
    if (!current || changed(current, descriptor)) Reflect.defineProperty(object, key, descriptor);
  }
}

// The window's objects that stay across resets (by their internal state
// entry, window-features.js; created on first use, except location and
// history), and their interfaces. They start without own properties.
const KEPT_OBJECTS = [
  'navigator',
  'screen',
  'external',
  'location',
  'history',
  'customElements',
  'crypto',
  'performance',
  'console',
];
const KEPT_INTERFACES = new Set([
  'Navigator',
  'Screen',
  'External',
  'BarProp',
  'Location',
  'History',
  'CustomElementRegistry',
  'Crypto',
  'Performance',
]);
const NO_PROPERTIES = new Map();

function keptObjects(ws) {
  const objects = [];
  for (const key of KEPT_OBJECTS) if (ws[key]) objects.push(ws[key]);
  if (ws.bars) objects.push(...Object.values(ws.bars));
  return objects;
}

// A kept node's mutation observer registrations go, and their observers
// forget the node and their pending records (so the reset is not
// observed), keeping the document's observer count right. An observer
// still holding the node in its targets would find no registration there
// at disconnect() (naive-ui: @juggle/resize-observer observes the body,
// and its disconnect in the next file threw).
function dropObservers(node, ds) {
  const ns = node[S];
  if (!ns.observers) return;
  for (const registration of ns.observers) {
    const os = registration.observer[S];
    os.records = [];
    // Transient registrations are neither targets nor counted.
    if (registration.source) continue;
    os.targets.delete(node);
    ds.observerCount = Math.max(0, (ds.observerCount ?? 0) - 1);
  }
  ns.observers = undefined;
}

// Call once the window is set up (after a test environment installs it).
export function snapshotWindow(window) {
  const ws = window[S];
  ws.snapshot = ownProperties(window);
  ws.documentSnapshot = ownProperties(window.document);
  ws.initialURL = ws.url.href;
  // The initial tree's nodes, kept by reset (libraries hold document.body).
  const doc = window.document;
  ws.initialNodes = [doc.doctype, doc.documentElement, doc.head, doc.body].map((node) => ({
    node,
    props: ownProperties(node),
  }));
  // The kept objects made so far; one made later starts without own
  // properties (NO_PROPERTIES).
  ws.keptSnapshots = new Map(keptObjects(ws).map((object) => [object, ownProperties(object)]));
  // Their prototypes: those created so far now, the others when created.
  const protos = new Map();
  for (const name of KEPT_INTERFACES) {
    const proto = Object.getOwnPropertyDescriptor(ws.protos, name)?.value;
    if (proto) protos.set(proto, ownProperties(proto));
  }
  ws.keptProtoSnapshots = protos;
  ws.onMaterialize = (name, proto) => {
    if (KEPT_INTERFACES.has(name)) protos.set(proto, ownProperties(proto));
  };
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
  // The kept objects' and their prototypes' own properties (user-event's
  // navigator.clipboard stub, a test's navigator.userAgent).
  for (const object of keptObjects(ws)) restoreOwnProperties(object, ws.keptSnapshots.get(object) ?? NO_PROPERTIES);
  for (const [proto, snapshot] of ws.keptProtoSnapshots) restoreOwnProperties(proto, snapshot);

  // Window state.
  ws.listeners = undefined;
  ws.handlers = undefined;
  ws.status = undefined;
  // A frame scheduled on timers the test has since cleared or replaced
  // would never run: the next file starts without frames.
  if (ws.frames) {
    ws.frames.queue.clear();
    ws.frames = undefined;
  }
  clearWindowTimers(window);
  abortWindowRequests(window);
  forgetLastList();
  clearStorage(window);
  clearCookies(window);
  ws.url = new URL(ws.initialURL);
  ws.history[S].entries = [{ state: null, url: ws.url }];
  ws.history[S].index = 0;
  ws.history[S].navigations++; // drops a pending traversal (navigation.js)

  // Observers of the document go first, with their pending records, so the
  // reset itself is not observed.
  dropObservers(doc, ds);

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
      if (ns.prev) ns.prev[S].next = ns.next;
      else ps.first = ns.next;
      if (ns.next) ns.next[S].prev = ns.prev;
      else ps.last = ns.prev;
      ps.count--;
      ps.rev++;
      ns.parent = ns.prev = ns.next = null;
    }
    detachChildren(node);
    if (ns.attrs) {
      ns.attrs.clear();
      if (ns.attrNS) ns.attrNS = null;
    }
    if (ns.style) clearDeclarations(ns.style);
    if (ns.styleWritten !== undefined) ns.styleWritten = undefined;
    ns.listeners = undefined;
    ns.handlers = undefined;
    ns.inertHandlers = undefined;
    dropObservers(node, ds);
    restoreOwnProperties(node, props);
  }
  ds.treeRev = (ds.treeRev ?? 0) + 1;
  ds.ids = undefined;
  hooks.named.reset(ds);
  const [doctype, html, head, body] = ws.initialNodes.map(({ node }) => node);
  insert(doc, doctype, null);
  insert(doc, html, null);
  insert(html, head, null);
  insert(html, body, null);

  // Document state.
  ds.listeners = undefined;
  ds.handlers = undefined;
  // Inert event handlers before jsdom 22.1.0 (event-handlers.js).
  ds.inertHandlers = undefined;
  ds.focused = null;
  ds.focusChainOf = null;
  if (ds.selection) {
    ds.selection[S].range = null;
    ds.selection[S].direction = 'none';
  }
  ds.ranges = undefined;
  return window;
}
