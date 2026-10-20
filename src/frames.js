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
import { dispatch, exposed } from './events.js';
import { clearWindowTimers } from './window-features.js';
import { abortWindowRequests } from './xhr.js';

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

// The parent window's index properties (window[0], ...) follow its frames,
// also on the VM context's global it is installed as (Jest, Vitest's VM
// pools), which frames returns there.
function syncIndexes(window, previousLength) {
  const frames = window[S].childFrames;
  const { globalProxy } = window[S];
  for (const target of globalProxy ? [window, globalProxy] : [window]) {
    for (let i = frames.length; i < previousLength; i++) delete target[i];
    for (let i = 0; i < frames.length; i++) {
      const child = frames[i];
      Object.defineProperty(target, i, { get: () => child, configurable: true, enumerable: true });
    }
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
  abortWindowRequests(child);
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

// Window members for the window tree. A window installed as a VM
// context's global (Jest, Vitest's VM pools) is that global for frames and
// for its frames' parent and top, as jsdom's window is its context's global
// (black box: Vitest vmThreads on jsdom 20.0.3, 26.1.0 and 30.1.3): what
// the test assigns to window (name, innerWidth) is read through them too.
export const WINDOW_FRAME_MEMBERS = {
  get parent() { return exposed(this[S].parentWindow ?? this); },
  get top() {
    let w = this;
    while (w[S].parentWindow) w = w[S].parentWindow;
    return exposed(w);
  },
  get frameElement() { return this[S].frameElement ?? null; },
  get frames() { return exposed(this); },
  get length() { return this[S].childFrames?.length ?? 0; },
};
