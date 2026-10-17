// Window-level features: requestAnimationFrame, viewport and scrolling,
// navigator, location and history, the Image/Audio/Option constructors.
// Values follow jsdom's defaults so tests see the same environment.
import { S, state, domError } from './internal.js';
import { dispatch, reportError } from './events.js';
import { computedStyle, cssNamespace } from './css.js';
import './cascade.js';
import { compile } from './selectors.js';
import { QuotaExceededError } from './storage.js';
import { navigate, traverse, hostTimeout } from './navigation.js';
import { VERSION } from './version.js';

// The jsdom version warpdom behaves like by default.
export const LATEST_JSDOM = 30;

// A jsdom version as [major, minor, patch]: from a version string, or a
// major version alone, which stands for that major's latest release.
function parseJsdomVersion(version) {
  const [major, minor = Infinity, patch = Infinity] = String(version).split('.').map((part) => Number.parseInt(part, 10));
  return [major, minor, patch];
}

// The newest jsdom release the profiles were measured against. A later
// minor or major release may change behavior warpdom does not reproduce;
// patch releases are taken to keep it.
export const NEWEST_MODELED_JSDOM = '30.1.2';

// The warning for an installed jsdom newer than NEWEST_MODELED_JSDOM, else null.
export function newerJsdomWarning(version) {
  if (version == null) return null;
  const [major, minor] = parseJsdomVersion(version);
  const [newestMajor, newestMinor] = parseJsdomVersion(NEWEST_MODELED_JSDOM);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  if (major < newestMajor || (major === newestMajor && minor <= newestMinor)) return null;
  return `warpdom: the installed jsdom ${version} is newer than ${NEWEST_MODELED_JSDOM}, the newest version warpdom models, `
    + `so tests get jsdom ${NEWEST_MODELED_JSDOM}'s behavior. If a test's result differs from jsdom, please report it at `
    + 'https://github.com/sonukapoor/warpdom/issues';
}

// Prints newerJsdomWarning once per process (the adapters call it with the
// jsdom version they found installed).
let warnedNewerJsdom = false;
export function warnNewerJsdom(version) {
  const warning = newerJsdomWarning(version);
  if (warning === null || warnedNewerJsdom) return;
  warnedNewerJsdom = true;
  globalThis.console?.warn(warning);
}

const before = (version, target) => {
  for (let i = 0; i < 3; i++) if (version[i] !== target[i]) return version[i] < target[i];
  return false;
};

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
// Timers (HTML standard, 8.6) with numeric ids, run by the platform's
// timers; the environments install the host's on their global instead (a
// frame's window, or a window outside a test environment, uses these).
// Also atob, btoa and queueMicrotask, the platform's.
function startTimer(window, repeat, handler, timeout, args) {
  const ws = state(window);
  const timers = ws.timers ?? (ws.timers = { next: 1, handles: new Map() });
  const id = timers.next++;
  if (ws.discarded) return id;
  const callback = typeof handler === 'function' ? handler : () => {};
  const run = () => {
    if (!repeat) timers.handles.delete(id);
    callback.apply(window, args);
  };
  const ms = Number(timeout) || 0;
  timers.handles.set(id, { repeat, handle: repeat ? globalThis.setInterval(run, ms) : globalThis.setTimeout(run, ms) });
  return id;
}

function stopTimer(window, id) {
  const timers = state(window).timers;
  const timer = timers?.handles.get(Number(id));
  if (!timer) return;
  (timer.repeat ? globalThis.clearInterval : globalThis.clearTimeout)(timer.handle);
  timers.handles.delete(Number(id));
}

export function clearWindowTimers(window) {
  const timers = window[S].timers;
  if (!timers) return;
  for (const id of [...timers.handles.keys()]) stopTimer(window, id);
}

const timerMembers = {
  setTimeout(handler, timeout = 0, ...args) { return startTimer(this, false, handler, timeout, args); },
  setInterval(handler, timeout = 0, ...args) { return startTimer(this, true, handler, timeout, args); },
  clearTimeout(id) { stopTimer(this, id); },
  clearInterval(id) { stopTimer(this, id); },
  // An exception in the callback is reported (an error event at the
  // window), as for event listeners.
  queueMicrotask(callback) {
    state(this);
    if (typeof callback !== 'function') throw new TypeError("Failed to execute 'queueMicrotask' on 'Window': The callback provided as parameter 1 is not a function.");
    const window = this;
    globalThis.queueMicrotask(() => {
      try { callback(); } catch (error) { reportError(window, error); }
    });
  },
  atob(data) { state(this); return globalThis.atob(data); },
  btoa(data) { state(this); return globalThis.btoa(data); },
};

// The window members test environments leave to the host (Node's timers).
export const HOST_TIMER_KEYS = Object.keys(timerMembers);

// Animation frames: callbacks requested before a frame run together in it,
// with the frame's time (performance.now() when it starts); those requested
// during a frame run in the next one. jsdom (with pretendToBeVisual) and
// warpdom start a frame every 16.7 ms of real time, so a test that awaits a
// frame waits that long. With the fastFrames option a frame starts as soon
// as the event loop gets to it (a zero-delay timer task): tests that await
// frames run much faster (ariakit 1.61x), but a frame can now run before a
// short timer that would have fired first, which changes the result of a
// few tests (docs/fast-frames.md). Timestamps stay real times.
// The frame's timer is the global's setTimeout, looked up when the frame
// is scheduled, as jsdom's is: fake timers that leave requestAnimationFrame
// alone (Vitest 2's default) still run frames when the test advances them.
const animationFrames = {
  requestAnimationFrame(callback) {
    const s = state(this);
    const frames = s.frames ?? (s.frames = { next: 1, queue: new Map(), scheduled: false });
    const id = frames.next++;
    frames.queue.set(id, callback);
    if (!frames.scheduled) {
      frames.scheduled = true;
      hostTimeout(this, () => {
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
      }, s.fastFrames ? 0 : 1000 / 60);
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

// Window members that do nothing here (HTML standard, 7.2.2): close() and
// stop() for a window scripts did not open, and the legacy captureEvents()
// and releaseEvents().
const noOps = { close() { state(this); }, stop() { state(this); }, captureEvents() { state(this); }, releaseEvents() { state(this); } };

// The BarProp objects (locationbar, menubar, ...): one per window and bar,
// all visible.
const BARS = ['locationbar', 'menubar', 'personalbar', 'scrollbars', 'statusbar', 'toolbar'];
const barMembers = Object.fromEntries(BARS.map((bar) => [bar, {
  get() {
    const ws = state(this);
    const bars = ws.bars ?? (ws.bars = {});
    return bars[bar] ?? (bars[bar] = make(this, 'BarProp', {}));
  },
}]));

// [Replaceable] attributes: assigning one replaces it with an own property.
const replace = (target, name, value) => Object.defineProperty(target, name, { value, writable: true, enumerable: true, configurable: true });

export const WINDOW_MEMBERS = {
  ...animationFrames,
  ...timerMembers,
  ...noOps,
  ...barMembers,
  get name() { return state(this).name ?? ''; },
  set name(v) { state(this).name = String(v); },
  get status() { return state(this).status ?? ''; },
  set status(v) { state(this).status = String(v); },
  get origin() { const url = state(this).url; return url.origin; },
  set origin(value) { replace(this, 'origin', value); },
  get external() { const ws = state(this); return ws.external ?? (ws.external = make(this, 'External', {})); },
  set external(value) { replace(this, 'external', value); },
  // An alias of URL; a getter, so environments do not bind it.
  get webkitURL() { state(this); return URL; },
  // The current event (DOM 2.10), set while listeners run (events.js);
  // [Replaceable]: assigning it replaces it with an own property.
  get event() { return state(this).currentEvent; },
  set event(value) { Object.defineProperty(this, 'event', { value, writable: true, enumerable: true, configurable: true }); },
  ...notImplementedMethods,
  // Pseudo-elements are not implemented: as in jsdom, the element's own
  // style, reported as not implemented in the profile's words.
  getComputedStyle(element, pseudoElt = undefined) {
    const ws = state(this);
    if (!element?.[S]?.attrs) throw new TypeError("Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.");
    if (pseudoElt != null && pseudoElt !== '') ws.notImplemented(pseudoElementMessage(ws.compat.jsdom));
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
    ws.setTimeout(() => dispatch(this, new this.MessageEvent('message', { data: message })), 0);
  },
  get customElements() { return state(this).customElements; },
  getSelection() { return state(this) && this.document.getSelection(); },
  get screen() { const s = state(this); return s.screen ?? (s.screen = make(this, 'Screen', {})); },
  get navigator() { const s = state(this); return s.navigator ?? (s.navigator = make(this, 'Navigator', {})); },
  get location() { return state(this).location; },
  // [PutForwards=href]: window.location = url navigates, as in jsdom.
  set location(v) { state(this).location.href = v; },
  get history() { return state(this).history; },
};
Object.defineProperties(WINDOW_MEMBERS, Object.getOwnPropertyDescriptors(viewport));

// jsdom's words for getComputedStyle with a pseudo-element (black box: 20
// to 23, 24 to 26, 27 and later).
const pseudoElementMessage = (jsdom) => (jsdom >= 27 ? "Window's getComputedStyle() method: with pseudo-elements"
  : jsdom >= 24 ? 'window.getComputedStyle(elt, pseudoElt)' : 'window.computedStyle(elt, pseudoElt)');

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
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/30.0.0 warpdom/${VERSION}`;
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
  { name: 'BarProp', members: { get visible() { state(this); return true; } } },
  // Obsolete search provider methods; they do nothing.
  { name: 'External', members: { AddSearchProvider() { state(this); }, IsSearchProviderInstalled() { state(this); } } },
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
      get productSub() { state(this); return '20030107'; },
      get vendorSub() { state(this); return ''; },
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
      // The state is kept as given, as jsdom (20 to 30) does: the standard
      // stores a structured clone, which throws for functions and nodes
      // and gives a copy (history.state !== the object pushed).
      pushState(data, title, target = undefined) {
        const s = state(this);
        const next = target == null ? url(this) : new URL(String(target), url(this).href);
        s.entries.splice(s.index + 1, Infinity, { state: data, url: next });
        s.index++;
        s.navigations++; // cancels a pending traversal (navigation.js)
        setURL(this, next);
      },
      replaceState(data, title, target = undefined) {
        const s = state(this);
        const next = target == null ? url(this) : new URL(String(target), url(this).href);
        s.entries[s.index] = { state: data, url: next };
        setURL(this, next);
      },
      back() { traverse(state(this).window, -1); },
      forward() { traverse(state(this).window, 1); },
      go(delta = 0) { traverse(state(this).window, Number(delta) | 0); },
    },
  },
];

// The style surface of a jsdom profile (src/style-surface.js: which
// properties it knows and has accessors for), measured per jsdom and
// cssstyle version: before jsdom 29 by the cssstyle jsdom loads (given, or
// the one jsdom's version installs: 2 for jsdom 20, 3 for 21 to 23, the
// latest 4.x for 24 to 26, 5.3 for 27 to 28.0, the latest 6.x for 28.1),
// later by jsdom's version. null: jsdom 30.1 and later (STYLE_ACCESSORS).
function styleSurfaceKey(version, css) {
  if (version[0] >= 30) return before(version, [30, 0, 1]) ? 'jsdom30.0.0' : before(version, [30, 1, 0]) ? 'jsdom30.0.1' : null;
  if (version[0] === 29) return before(version, [29, 1, 0]) ? 'jsdom29.0' : 'jsdom29.1';
  css ??= version[0] <= 20 ? [2] : version[0] <= 23 ? [3] : version[0] <= 26 ? [4, Infinity] : before(version, [28, 1, 0]) ? [5] : [6, Infinity];
  if (css[0] <= 2) return 'cssstyle2';
  if (css[0] === 3 || (css[0] === 4 && before(css, [4, 1, 0]))) return 'cssstyle3';
  if (css[0] === 4) return before(css, [4, 4, 0]) ? 'cssstyle4.1' : 'cssstyle4.4';
  if (css[0] === 5) return before(css, [5, 3, 0]) ? 'cssstyle5.0' : 'cssstyle5';
  return before(css, [6, 1, 0]) ? 'cssstyle6.0' : 'cssstyle6.1';
}

// Per-window setup: URL, location, history, and the legacy factory
// constructors Image, Audio and Option (their prototype is the element's).
export function setupWindow(window, { url: initial = 'about:blank', jsdom = LATEST_JSDOM, cssstyle, fastFrames = false } = {}) {
  const ws = window[S];
  // Opt-in (option fastFrames): animation frames run as soon as the event
  // loop gets to them instead of every 16.7 ms of real time (see below).
  ws.fastFrames = fastFrames === true;
  ws.url = new URL(initial);
  // Compatibility with the jsdom generation the tests were written for
  // (option jsdom: its version, or its major version): behaviors that
  // changed between versions in ways tests observe. jsdom before 29 left
  // most computed style values empty, and before 28 let tests write to
  // computed styles; before 30.1.2 focus() ignored display: none and the
  // hidden attribute.
  const version = parseJsdomVersion(jsdom);
  // jsdom 26 and earlier parse CSS with cssstyle 4, whose behavior changed
  // between its minor releases; the installed one (option cssstyle, found
  // by the adapters next to jsdom) decides, else the latest 4.x. Before
  // 4.3.1, url() in background and background-image serialized without
  // quotes; before 4.4 the root element's computed color was '', and in
  // 4.4 and 4.5 'CanvasText'.
  // jsdom 20 loads cssstyle 2, jsdom 21 to 23 cssstyle 3 (assumed for 21;
  // 22 and 23 measured): the default when no cssstyle is given.
  const cssDefault = version[0] <= 20 ? '2.3.0' : version[0] <= 23 ? '3.0.0' : null;
  const cssText = version[0] < 27 ? cssstyle ?? cssDefault : null;
  const css = cssText != null ? parseJsdomVersion(cssText) : null;
  ws.compat = {
    version: jsdom, jsdom: version[0], legacyComputedStyle: version[0] < 29, mutableComputedStyle: version[0] < 28,
    focusIgnoresRendering: before(version, [30, 1, 2]), detachedCheckableEvents: before(version, [16, 5, 2]), cssstyle: version[0] < 27 ? (css ? cssText : undefined) : cssstyle ?? undefined, cssstyleMajor: css ? css[0] : 0,
    styleSurface: styleSurfaceKey(version, version[0] < 27 ? css : cssstyle != null ? parseJsdomVersion(cssstyle) : null),
    unquotedUrls: css !== null && before(css, [4, 3, 1]),
    // cssstyle's font shorthand before 4.4 (shorthands.js legacyFont).
    legacyFont: css === null || !before(css, [4, 4, 0]) ? null : before(css, [4, 2, 0]) ? 'cssstyle4.1' : 'cssstyle4.2',
    // cssstyle 4.4 and later: the computed style's background and border
    // side accessors compose their longhands (cascade.js legacyAccessorValue).
    // cssstyle before 4.2: color channels rounded once, no hwb() (colors.js).
    legacyColors: version[0] < 27 && css !== null && before(css, [4, 2, 0]),
    composedAccessors: version[0] < 27 && (css === null || (css[0] === 4 && !before(css, [4, 4, 0]))),
    rootColor: version[0] >= 27 ? 'rgb(0, 0, 0)' : css !== null && before(css, [4, 4, 0]) ? '' : css !== null && before(css, [4, 6, 0]) ? 'CanvasText' : 'canvastext',
  };
  // DOMException is the platform's (shared by all windows); its subclass too.
  window.DOMException = DOMException;
  window.QuotaExceededError = QuotaExceededError;
  ws.setTimeout = globalThis.setTimeout.bind(globalThis);
  ws.location = make(window, 'Location', {});
  ws.history = make(window, 'History', { entries: [{ state: null, url: ws.url }], index: 0, navigations: 0 });

  // Created on first use, like the interfaces (window.js), so a window
  // that never uses them does not create their element interfaces.
  const factory = (name, protoName, init) => {
    const create = () => {
      const ctor = function (...args) {
        if (!new.target) throw new TypeError(`Failed to construct '${name}': Please use the 'new' operator.`);
        return init(window.document, args);
      };
      Object.defineProperty(ctor, 'name', { value: name });
      Object.defineProperty(ctor, 'prototype', { value: ws.protos[protoName], writable: false });
      Object.defineProperty(window, name, { value: ctor, writable: true, configurable: true });
      return ctor;
    };
    Object.defineProperty(window, name, {
      get: create,
      set(value) { Object.defineProperty(window, name, { value, writable: true, configurable: true }); },
      configurable: true,
    });
  };
  factory('Image', 'HTMLImageElement', (doc, [width, height]) => {
    const img = doc.createElement('img');
    if (width !== undefined) img.setAttribute('width', String(width));
    if (height !== undefined) img.setAttribute('height', String(height));
    return img;
  });
  factory('Audio', 'HTMLAudioElement', (doc, [src]) => {
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
  factory('Option', 'HTMLOptionElement', (doc, [text = '', value, defaultSelected = false, selected = false]) => {
    const option = doc.createElement('option');
    if (text !== '') option.textContent = String(text);
    if (value !== undefined) option.setAttribute('value', String(value));
    if (defaultSelected) option.setAttribute('selected', '');
    option[S].selectedness = !!selected; // not dirty, per the Option constructor
    return option;
  });
}
