// Window-level features: requestAnimationFrame, viewport and scrolling,
// navigator, location and history, the Image/Audio/Option constructors.
// Values follow jsdom's defaults so tests see the same environment.
import { S, state, domError } from './internal.js';
import { computedStyle, cssNamespace } from './css.js';
import './cascade.js';
import { compile } from './selectors.js';
import { QuotaExceededError } from './storage.js';
import { navigate } from './navigation.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Viewport values tests commonly override (window.innerWidth = 500).
const VIEWPORT = { innerWidth: 1024, innerHeight: 768, outerWidth: 1024, outerHeight: 768, devicePixelRatio: 1,
  scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0 };

const viewport = Object.fromEntries(Object.entries(VIEWPORT).map(([key, value]) => [key, {
  get() { const v = state(this).viewport; return v && key in v ? v[key] : value; },
  set(v) { const s = state(this); (s.viewport ?? (s.viewport = {}))[key] = v; },
}]));

// One frame about every 16 ms; callbacks queued before a frame run in it
// with the same timestamp, as in jsdom with pretendToBeVisual.
const animationFrames = {
  requestAnimationFrame(callback) {
    const s = state(this);
    const frames = s.frames ?? (s.frames = { next: 1, queue: new Map(), scheduled: false });
    const id = frames.next++;
    frames.queue.set(id, callback);
    if (!frames.scheduled) {
      frames.scheduled = true;
      s.setTimeout(() => {
        frames.scheduled = false;
        // This frame's callbacks; one canceled by an earlier callback in the
        // same frame does not run.
        const current = frames.current = frames.queue;
        frames.queue = new Map();
        const t = now();
        for (const [id, cb] of current) {
          if (!current.has(id)) continue;
          current.delete(id);
          try { cb(t); } catch (error) { s.onUnhandledError(error); }
        }
        frames.current = null;
      }, 1000 / 60);
    }
    return id;
  },
  cancelAnimationFrame(id) {
    const frames = state(this).frames;
    frames?.queue.delete(id);
    frames?.current?.delete(id);
  },
};

// Window methods jsdom does not implement either: they report "Not
// implemented" on the console, as jsdom's default virtual console does.
const notImplementedMethods = Object.fromEntries(['alert', 'blur', 'confirm', 'focus', 'moveBy', 'moveTo', 'open', 'print',
  'prompt', 'resizeBy', 'resizeTo', 'scroll', 'scrollBy', 'scrollTo'].map((name) => [name, {
  [name]() { state(this).notImplemented(`Window's ${name}() method`); },
}[name]]));

export const WINDOW_MEMBERS = {
  ...animationFrames,
  // The current event (DOM 2.10), set while listeners run (events.js);
  // [Replaceable]: assigning it replaces it with an own property.
  get event() { return state(this).currentEvent; },
  set event(value) { Object.defineProperty(this, 'event', { value, writable: true, enumerable: true, configurable: true }); },
  ...notImplementedMethods,
  getComputedStyle(element) {
    const ws = state(this);
    if (!element?.[S]?.attrs) throw new TypeError("Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.");
    return computedStyle(element, ws.protos.CSSStyleProperties);
  },
  // postMessage to this window, as jsdom does it: the message (not cloned)
  // arrives in a task as a MessageEvent with origin '' and source null;
  // a targetOrigin other than '*', '/' or this window's origin drops it.
  postMessage(...args) {
    const ws = state(this);
    if (args.length < 2) throw new TypeError("'postMessage' requires 2 arguments: 'message' and 'targetOrigin'");
    const [message, targetOrigin] = args;
    const target = String(targetOrigin);
    if (target !== '*' && target !== '/') {
      let origin;
      try { origin = new URL(target).origin; } catch { throw domError(`Failed to execute 'postMessage' on 'Window': Invalid target origin '${target}' in a call to 'postMessage'.`, 'SyntaxError'); }
      if (origin !== ws.url.origin) return;
    }
    ws.setTimeout(() => this.dispatchEvent(new this.MessageEvent('message', { data: message })), 0);
  },
  get customElements() { return state(this).customElements; },
  getSelection() { return state(this) && this.document.getSelection(); },
  get screen() { const s = state(this); return s.screen ?? (s.screen = make(this, 'Screen', {})); },
  get navigator() { const s = state(this); return s.navigator ?? (s.navigator = make(this, 'Navigator', {})); },
  get location() { return state(this).location; },
  get history() { return state(this).history; },
};
Object.defineProperties(WINDOW_MEMBERS, Object.getOwnPropertyDescriptors(viewport));

function make(window, iface, data) {
  const object = Object.create(window[S].protos[iface]);
  object[S] = { window, ...data };
  return object;
}

// "jsdom/30.0.0" is a compatibility token, as "like Gecko" is for
// browsers, in the form jsdom's own user agent has: libraries test the
// user agent for "jsdom" (MUI's layout warnings) or "jsdom/" (floating-ui's
// isJSDOM) to skip layout-dependent behavior in a DOM without layout.
const userAgent = () => {
  const platform = globalThis.process?.platform ?? 'unknown OS';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/30.0.0 warpdom/0.0.0`;
};

const url = (self) => state(self).window[S].url;
const setURL = (self, next) => { state(self).window[S].url = next; };
// Location's setters navigate (navigation.js).
const go = (self, next, replace) => navigate(state(self).window, next, replace);
const urlPart = (part) => ({
  get() { return url(this)[part]; },
  set(v) {
    const next = new URL(url(this).href);
    next[part] = v;
    go(this, next);
  },
});

export const FEATURE_INTERFACES = [
  // Values as in jsdom (no screen; no orientation).
  {
    name: 'Screen',
    members: Object.fromEntries(Object.entries({ availWidth: 0, availHeight: 0, width: 0, height: 0, colorDepth: 24, pixelDepth: 24 })
      .map(([key, value]) => [key, { get() { state(this); return value; } }])),
  },
  {
    name: 'Navigator',
    members: {
      get userAgent() { state(this); return userAgent(); },
      get appVersion() { state(this); return userAgent().slice('Mozilla/'.length); },
      get appName() { state(this); return 'Netscape'; },
      get appCodeName() { state(this); return 'Mozilla'; },
      get product() { state(this); return 'Gecko'; },
      get platform() { state(this); return ''; },
      get vendor() { state(this); return 'Apple Computer, Inc.'; },
      get language() { state(this); return 'en-US'; },
      get languages() { state(this); return Object.freeze(['en-US', 'en']); },
      get onLine() { state(this); return true; },
      get cookieEnabled() { state(this); return true; },
      get hardwareConcurrency() { state(this); return 4; },
      get maxTouchPoints() { state(this); return 0; },
      get webdriver() { state(this); return false; },
      javaEnabled() { return false; },
    },
  },
  {
    name: 'Location',
    members: {
      href: {
        get() { return url(this).href; },
        set(v) { go(this, new URL(String(v), url(this).href)); },
      },
      get origin() { return url(this).origin; },
      protocol: urlPart('protocol'),
      host: urlPart('host'),
      hostname: urlPart('hostname'),
      port: urlPart('port'),
      pathname: urlPart('pathname'),
      search: urlPart('search'),
      hash: urlPart('hash'),
      assign(v) { go(this, new URL(String(v), url(this).href)); },
      replace(v) { go(this, new URL(String(v), url(this).href), true); },
      reload() { state(this); },
      toString() { return url(this).href; },
    },
  },
  {
    name: 'History',
    members: {
      get length() { return state(this).entries.length; },
      get state() { const s = state(this); return s.entries[s.index].state; },
      get scrollRestoration() { return state(this).scrollRestoration ?? 'auto'; },
      set scrollRestoration(v) { state(this).scrollRestoration = v === 'manual' ? 'manual' : 'auto'; },
      pushState(data, title, target) {
        const s = state(this);
        const next = target == null ? url(this) : new URL(String(target), url(this).href);
        s.entries.splice(s.index + 1, Infinity, { state: structuredClone(data), url: next });
        s.index++;
        setURL(this, next);
      },
      replaceState(data, title, target) {
        const s = state(this);
        const next = target == null ? url(this) : new URL(String(target), url(this).href);
        s.entries[s.index] = { state: structuredClone(data), url: next };
        setURL(this, next);
      },
      back() { state(this); },
      forward() { state(this); },
      go() { state(this); },
    },
  },
];

// Per-window setup: URL, location, history, and the legacy factory
// constructors Image, Audio and Option (their prototype is the element's).
export function setupWindow(window, { url: initial = 'about:blank' } = {}) {
  const ws = window[S];
  ws.url = new URL(initial);
  // DOMException is the platform's (shared by all windows); its subclass too.
  window.DOMException = DOMException;
  window.QuotaExceededError = QuotaExceededError;
  ws.setTimeout = globalThis.setTimeout.bind(globalThis);
  ws.location = make(window, 'Location', {});
  ws.history = make(window, 'History', { entries: [{ state: null, url: ws.url }], index: 0 });

  const factory = (name, proto, init) => {
    const ctor = function (...args) {
      if (!new.target) throw new TypeError(`Failed to construct '${name}': Please use the 'new' operator.`);
      return init(window.document, args);
    };
    Object.defineProperty(ctor, 'name', { value: name });
    Object.defineProperty(ctor, 'prototype', { value: proto, writable: false });
    Object.defineProperty(window, name, { value: ctor, writable: true, configurable: true });
  };
  factory('Image', ws.protos.HTMLImageElement, (doc, [width, height]) => {
    const img = doc.createElement('img');
    if (width !== undefined) img.setAttribute('width', String(width));
    if (height !== undefined) img.setAttribute('height', String(height));
    return img;
  });
  factory('Audio', ws.protos.HTMLAudioElement, (doc, [src]) => {
    const audio = doc.createElement('audio');
    audio.setAttribute('preload', 'auto');
    if (src !== undefined) audio.setAttribute('src', String(src));
    return audio;
  });
  // The CSS namespace object (CSS.escape, CSS.supports).
  Object.defineProperty(window, 'CSS', {
    value: cssNamespace((selector) => { try { compile(selector); return true; } catch { return false; } }),
    writable: true, configurable: true,
  });
  factory('Option', ws.protos.HTMLOptionElement, (doc, [text = '', value, defaultSelected = false, selected = false]) => {
    const option = doc.createElement('option');
    if (text !== '') option.textContent = String(text);
    if (value !== undefined) option.setAttribute('value', String(value));
    if (defaultSelected) option.setAttribute('selected', '');
    option[S].selectedness = !!selected; // not dirty, per the Option constructor
    return option;
  });
}
