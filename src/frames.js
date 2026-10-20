// Iframes (HTML standard, 4.8.5): an iframe that becomes connected gets a
// nested window with its own document (about:blank, or its src URL with an
// empty document: nothing is fetched, as in jsdom), interface objects and
// globals; removing it discards that window. Only same-origin frames.
//
// Insertion and removal cost nothing for documents that never had an
// iframe: the tree calls these hooks only when the document's frameCount
// is non-zero (counted at creation and adoption, in window.js and
// internal.js).
import { S, HTML_NS, ELEMENT_NODE, hooks, nextInTree, PlatformURL as URL } from './internal.js';
import { dispatch } from './events.js';
import { clearWindowTimers } from './window-features.js';

// iframe and frame elements.
const isIframe = (n) => { const s = n[S]; return s.type === ELEMENT_NODE && s.ns === HTML_NS && (s.tag === 'iframe' || s.tag === 'frame'); };

// Iframes in node's subtree, shadow trees included.
function forEachIframe(node, fn) {
  for (let n = node; n; n = nextInTree(n, node)) {
    if (n[S].type !== ELEMENT_NODE) continue;
    if (isIframe(n)) fn(n);
    if (n[S].shadowRoot) forEachIframe(n[S].shadowRoot, fn);
  }
}

// The parent window's index properties (window[0], ...) follow its frames.
function syncIndexes(window, previousLength) {
  const frames = window[S].childFrames;
  for (let i = frames.length; i < previousLength; i++) delete window[i];
  for (let i = 0; i < frames.length; i++) {
    const child = frames[i];
    Object.defineProperty(window, i, { get: () => child, configurable: true, enumerable: true });
  }
}

function createFrame(iframe) {
  const es = iframe[S];
  if (es.frameWindow) return;
  const doc = es.doc;
  if (doc[S].noView) return;
  const parent = doc[S].window;
  const src = es.attrs.get('src');
  let url = 'about:blank';
  if (src !== undefined && src.trim() !== '') {
    try { url = new URL(src, doc[S].url ?? parent[S].url).href; } catch { /* about:blank */ }
  }
  const child = parent[S].createNestedWindow({ url, parent, frameElement: iframe });
  es.frameWindow = child;
  const frames = parent[S].childFrames ?? (parent[S].childFrames = []);
  frames.push(child);
  syncIndexes(parent, frames.length - 1);
  // The iframe load event steps run once the (empty) document is ready.
  parent[S].setTimeout(() => {
    if (es.frameWindow === child) dispatch(iframe, new parent.Event('load'));
  }, 0);
}

function destroyFrame(iframe) {
  const es = iframe[S];
  const child = es.frameWindow;
  if (!child) return;
  es.frameWindow = null;
  // The discarded window's tasks never run: its timers (and so
  // AbortSignal.timeout of its realm) stop, as in jsdom.
  child[S].discarded = true;
  hooks.discardedWindows++;
  clearWindowTimers(child);
  const parent = child[S].parentWindow;
  const frames = parent[S].childFrames;
  frames.splice(frames.indexOf(child), 1);
  syncIndexes(parent, frames.length + 1);
}

hooks.frames = {
  inserted(node) { forEachIframe(node, createFrame); },
  removed(node) { forEachIframe(node, destroyFrame); },
};

export const IFRAME_MEMBERS = {
  get contentWindow() { const s = this[S]; return s?.frameWindow ?? null; },
  get contentDocument() { const s = this[S]; return s?.frameWindow?.document ?? null; },
};

// getSVGDocument() (HTML 4.8.5, iframe only here, as in jsdom): the content
// document when it is an SVG document, else null. A frame's document is
// never one in warpdom (frames load about:blank and srcdoc), so it gives
// null. jsdom (20 to 30, black box) has the method but every call throws a
// TypeError from inside jsdom ("... .getSVGDocument is not a function").
export const IFRAME_ONLY_MEMBERS = {
  getSVGDocument() {
    const s = this?.[S];
    if (s?.tag !== 'iframe' || s.ns !== HTML_NS) throw new TypeError('Illegal invocation');
    const doc = s.frameWindow?.document;
    return doc && doc[S].contentType === 'image/svg+xml' ? doc : null;
  },
};

// Window members for the window tree.
export const WINDOW_FRAME_MEMBERS = {
  get parent() { return this[S].parentWindow ?? this; },
  get top() {
    let w = this;
    while (w[S].parentWindow) w = w[S].parentWindow;
    return w;
  },
  get frameElement() { return this[S].frameElement ?? null; },
  get frames() { return this; },
  get length() { return this[S].childFrames?.length ?? 0; },
};
