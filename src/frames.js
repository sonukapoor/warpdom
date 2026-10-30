// Iframes (HTML standard, 4.8.5): an iframe that becomes connected gets a
// nested window with its own document (about:blank, or its src URL with an
// empty document: nothing is fetched, as in jsdom), interface objects and
// globals; removing it discards that window. Only same-origin frames.
//
// Insertion and removal cost nothing for documents that never had an
// iframe: the tree calls these hooks only when the document's frameCount
// is non-zero (counted at creation and adoption, in window.js and
// internal.js).
import { S, HTML_NS, ELEMENT_NODE, hooks, nextInTree, connected, PlatformURL as URL } from './internal.js';
import { dispatch, exposed } from './events.js';
import { clearWindowTimers } from './window-features.js';
import { abortWindowRequests } from './xhr.js';
import { forgetLastList } from './collections.js';
import { windowOrigin } from './window-features.js';

// iframe and frame elements.
const isIframe = (n) => {
  const s = n[S];
  return s.type === ELEMENT_NODE && s.ns === HTML_NS && (s.tag === 'iframe' || s.tag === 'frame');
};

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
// pools), which frames returns there. As in jsdom (20 to 30, black box),
// every insertion and removal of a frame puts back each index a test
// deleted or redefined since. Each index has one getter, which reads
// frames[i]: one already in place is kept, so an insertion defines only the
// new index (#184). An index a test made non-configurable stays (Reflect:
// no TypeError, which would stop a removal or resetWindow halfway); its
// getter reads the frames, so it never keeps a discarded frame window
// reachable. While resetWindow runs, ws.resetIndexes is the number of
// indexes it may have touched so far (the frames' before it, and those of
// iframes a connectedCallback inserted, also when removed again).
function syncIndexes(window, previousLength, restoring = false) {
  const ws = window[S];
  const frames = ws.childFrames;
  if (ws.resetIndexes !== undefined) {
    ws.resetIndexes = Math.max(ws.resetIndexes, previousLength, frames.length);
  }
  const getters = ws.indexGetters ?? (ws.indexGetters = []);
  for (let i = getters.length; i < frames.length; i++) getters.push(() => frames[i]);
  for (const target of ws.globalProxy ? [window, ws.globalProxy] : [window]) {
    for (let i = frames.length; i < previousLength; i++) {
      // After resetWindow's restore, the window's own index properties past
      // the frames are the snapshot's (a value a setup file assigned), also
      // those an iframe inserted during the reset took or, removed again,
      // deleted (a connectedCallback run by the reinsertion of the kept
      // body, #184), and one that callback assigned after (CodeRabbit
      // review on #206); one made non-configurable stays. The snapshot is
      // the window's own properties: the VM context's global gets none of
      // them (it had none, and resetWindow only runs without one).
      const saved = restoring && target === window ? ws.snapshot.get(String(i)) : undefined;
      if (saved === undefined) {
        Reflect.deleteProperty(target, i);
      } else if (Object.getOwnPropertyDescriptor(target, i)?.configurable !== false) {
        Reflect.defineProperty(target, i, saved);
      }
    }
    for (let i = 0; i < frames.length; i++) {
      const current = Object.getOwnPropertyDescriptor(target, i);
      if (current?.get !== getters[i] || !current.enumerable) {
        Reflect.defineProperty(target, i, { get: getters[i], configurable: true, enumerable: true });
      }
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
    try {
      url = new URL(src, doc[S].url ?? parent[S].url).href;
    } catch {
      /* about:blank */
    }
  }
  const child = parent[S].createNestedWindow({ url, parent, frameElement: iframe });
  if (url === 'about:blank') {
    // An about:blank document has its creator's origin, and its creator's
    // base URL as fallback base URL (HTML 7.1.1, 2.4.1). jsdom 26 and
    // later keep the base URL from its first use, earlier ones follow the
    // parent's (black box).
    child[S].aboutOrigin = windowOrigin(parent);
    const cs = child.document[S];
    cs.aboutBase = doc;
    cs.aboutBaseKept = parent[S].compat.jsdom >= 26;
  }
  es.frameWindow = child;
  const frames = parent[S].childFrames ?? (parent[S].childFrames = []);
  frames.push(child);
  syncIndexes(parent, frames.length - 1);
  // The iframe load event steps run once the (empty) document is ready.
  parent[S].setTimeout(() => {
    if (es.frameWindow === child) dispatch(iframe, new parent.Event('load'));
  }, 0);
}

// The discarded window's tasks never run: its timers (and so
// AbortSignal.timeout of its realm) stop, as in jsdom, and so do those of
// the frames nested in it (jsdom 20 to 30, black box: an interval in an
// iframe's iframe stops when the outer iframe is removed). The nested
// frames stay its frames (jsdom 30 keeps its length, earlier ones do not).
function discardWindow(window) {
  window[S].discarded = true;
  hooks.discardedWindows++;
  clearWindowTimers(window);
  const frames = window[S].childFrames;
  if (frames) for (const child of frames) discardWindow(child);
}

// sync false: the caller synchronizes the indexes once, after the last
// frame it discards (resetWindow).
function destroyFrame(iframe, sync = true) {
  const es = iframe[S];
  const child = es.frameWindow;
  if (!child) return;
  es.frameWindow = null;
  discardWindow(child);
  abortWindowRequests(child);
  forgetLastList();
  const parent = child[S].parentWindow;
  const frames = parent[S].childFrames;
  frames.splice(frames.indexOf(child), 1);
  if (sync) syncIndexes(parent, frames.length + 1);
}

hooks.frames = {
  inserted(node) {
    forEachIframe(node, createFrame);
  },
  removed(node) {
    forEachIframe(node, destroyFrame);
  },
  // resetWindow (reset.js) detaches the document's tree without the
  // removal hooks: the frames of the iframes it took out of the document
  // are discarded, as a fresh window has none (#173). Its restore of the
  // window's own properties deleted the index properties; those of the
  // frames left (an iframe in the kept body's shadow root) come back, and
  // every other index touched during the reset is the snapshot's again.
  // resetStart runs before the kept tree is inserted again.
  resetStart(window) {
    const ws = window[S];
    ws.resetIndexes = ws.childFrames?.length ?? 0;
  },
  reset(window) {
    const ws = window[S];
    const touched = ws.resetIndexes ?? 0;
    ws.resetIndexes = undefined;
    const frames = ws.childFrames;
    if (!frames?.length && touched === 0) return;
    if (frames) {
      for (const child of [...frames]) {
        const iframe = child[S].frameElement;
        if (!connected(iframe)) destroyFrame(iframe, false);
      }
    }
    syncIndexes(window, touched, true);
  },
};

export const IFRAME_MEMBERS = {
  get contentWindow() {
    const s = this[S];
    return s?.frameWindow ?? null;
  },
  get contentDocument() {
    const s = this[S];
    return s?.frameWindow?.document ?? null;
  },
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
  get parent() {
    return exposed(this[S].parentWindow ?? this);
  },
  get top() {
    let w = this;
    while (w[S].parentWindow) w = w[S].parentWindow;
    return exposed(w);
  },
  get frameElement() {
    return this[S].frameElement ?? null;
  },
  get frames() {
    return exposed(this);
  },
  get length() {
    return this[S].childFrames?.length ?? 0;
  },
};
