// Window-level features: requestAnimationFrame, viewport and scrolling,
// navigator, location and history, crypto and performance, URL,
// URLSearchParams and Headers, console, WebAssembly and WebSocket, the
// Image/Audio/Option constructors.
// Values follow jsdom's defaults so tests see the same environment.
import {
  S,
  state,
  lazyDataSetter,
  domError,
  tooFewArguments,
  checkForEachCallback,
  platformGlobal,
  PLATFORM_GLOBAL,
  PlatformURL,
  PlatformURL as URL,
} from './internal.js';
import { dispatch, reportError } from './events.js';
import { computedStyle, cssNamespace } from './css.js';
import './cascade.js';
import { compile } from './selectors.js';
import { QuotaExceededError } from './storage.js';
import { navigate, traverse, hostTimeout } from './navigation.js';
import { VERSION } from './version.js';
import { typedArrayName, realmOf, webidlString } from './encoding.js';
import { staticList, forgetLastList } from './collections.js';

// forEach callbacks are called with Reflect.apply, captured at load: not
// through their own call property, as jsdom calls them.
const { apply } = Reflect;

// The jsdom version warpdom behaves like by default.
export const LATEST_JSDOM = 30;

// A jsdom version as [major, minor, patch]: from a version string, or a
// major version alone, which stands for that major's latest release.
function parseJsdomVersion(version) {
  const [major, minor = Infinity, patch = Infinity] = String(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  return [major, minor, patch];
}

// The newest jsdom release the profiles were measured against. A later
// minor or major release may change behavior warpdom does not reproduce;
// patch releases are taken to keep it.
export const NEWEST_MODELED_JSDOM = '30.1.3';

// The warning for an installed jsdom newer than NEWEST_MODELED_JSDOM, else null.
export function newerJsdomWarning(version) {
  if (version == null) return null;
  const [major, minor] = parseJsdomVersion(version);
  const [newestMajor, newestMinor] = parseJsdomVersion(NEWEST_MODELED_JSDOM);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  if (major < newestMajor || (major === newestMajor && minor <= newestMinor)) return null;
  return (
    `warpdom: the installed jsdom ${version} is newer than ${NEWEST_MODELED_JSDOM}, the newest version warpdom models, ` +
    `so tests get jsdom ${NEWEST_MODELED_JSDOM}'s behavior. If a test's result differs from jsdom, please report it at ` +
    'https://github.com/sonukapoor/warpdom/issues'
  );
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

// Viewport values tests commonly override (window.innerWidth = 500), and
// status, as jsdom has them (black box, every release 20.0.0 to 30.1.3):
// own properties of the window, as name (setupWindowData). Before 27.0.0
// writable, enumerable, configurable data properties
// (Object.defineProperty(window, 'innerWidth', { value: 500 }) keeps them
// writable). From 27.0.0 accessors (enumerable, configurable): the
// viewport getters give the value whatever this is and their setters
// replace the accessor with a data property ([Replaceable]); status keeps
// a string. Like the window's other own accessors, they act on their own
// window whatever this is: an assignment through an object that inherits
// from the window (Object.create(window).innerWidth = 500), or the setter
// called on another object, replaces the window's member and gives that
// object no property of its own (black box, jsdom 27.4.0 to 30.1.3); so
// the setters and status's getter are made per window. name is a data
// property in every version and keeps any value as given.
const VIEWPORT = {
  innerWidth: 1024,
  innerHeight: 768,
  outerWidth: 1024,
  outerHeight: 768,
  devicePixelRatio: 1,
  scrollX: 0,
  scrollY: 0,
  pageXOffset: 0,
  pageYOffset: 0,
  screenX: 0,
  screenY: 0,
  screenLeft: 0,
  screenTop: 0,
};
const VIEWPORT_GETTERS = Object.fromEntries(
  Object.entries(VIEWPORT).map(([key, value]) => [
    key,
    Object.getOwnPropertyDescriptor(
      {
        get [key]() {
          return value;
        },
      },
      key,
    ).get,
  ]),
);

function defineWindowAccessors(window) {
  for (const key of Object.keys(VIEWPORT)) {
    const { set } = Object.getOwnPropertyDescriptor(
      {
        set [key](v) {
          replace(window, key, v);
        },
      },
      key,
    );
    Object.defineProperty(window, key, { get: VIEWPORT_GETTERS[key], set, enumerable: true, configurable: true });
  }
  const ws = window[S];
  const status = {
    get status() {
      return ws.status ?? '';
    },
    set status(v) {
      ws.status = String(v);
    },
  };
  Object.defineProperty(window, 'status', {
    ...Object.getOwnPropertyDescriptor(status, 'status'),
    enumerable: true,
    configurable: true,
  });
}

export function setupWindowData(window) {
  const define = (key, value) =>
    Object.defineProperty(window, key, { value, writable: true, enumerable: true, configurable: true });
  define('name', '');
  if (window[S].compat.jsdom >= 27) {
    defineWindowAccessors(window);
    return;
  }
  for (const key of Object.keys(VIEWPORT)) define(key, VIEWPORT[key]);
  define('status', '');
}

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
  setTimeout(handler, timeout = 0, ...args) {
    return startTimer(this, false, handler, timeout, args);
  },
  setInterval(handler, timeout = 0, ...args) {
    return startTimer(this, true, handler, timeout, args);
  },
  clearTimeout(id) {
    stopTimer(this, id);
  },
  clearInterval(id) {
    stopTimer(this, id);
  },
  // An exception in the callback is reported (an error event at the
  // window), as for event listeners.
  queueMicrotask(callback) {
    state(this);
    if (typeof callback !== 'function')
      throw new TypeError(
        "Failed to execute 'queueMicrotask' on 'Window': The callback provided as parameter 1 is not a function.",
      );
    const window = this;
    globalThis.queueMicrotask(() => {
      try {
        callback();
      } catch (error) {
        reportError(window, error);
      }
    });
  },
  // The platform's (the CommonJS bundle may be evaluated in a context
  // without them, a Jest test file's VM context).
  atob(data) {
    state(this);
    return PLATFORM_GLOBAL.atob(data);
  },
  btoa(data) {
    state(this);
    return PLATFORM_GLOBAL.btoa(data);
  },
};

// The window members test environments leave to the host (Node's timers).
export const HOST_TIMER_KEYS = Object.keys(timerMembers);

// Animation frames: callbacks requested before a frame run together in it,
// with the frame's time (the window's performance.now() when it starts, as
// in jsdom); those requested
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
      hostTimeout(
        this,
        () => {
          frames.scheduled = false;
          // This frame's callbacks; one canceled by an earlier callback in the
          // same frame does not run.
          const current = (frames.current = frames.queue);
          frames.queue = new Map();
          const t = windowNow(this);
          for (const [id, cb] of current) {
            if (!current.has(id)) continue;
            current.delete(id);
            try {
              cb(t);
            } catch (error) {
              s.onUnhandledError(error);
            }
          }
          frames.current = null;
        },
        s.fastFrames ? 0 : 1000 / 60,
      );
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
const notImplementedMethods = Object.fromEntries(
  [
    'alert',
    'blur',
    'confirm',
    'focus',
    'moveBy',
    'moveTo',
    'open',
    'print',
    'prompt',
    'resizeBy',
    'resizeTo',
    'scroll',
    'scrollBy',
    'scrollTo',
  ].map((name) => [
    name,
    {
      [name]() {
        state(this).notImplemented(`Window's ${name}() method`);
      },
    }[name],
  ]),
);

// Window members that do nothing here (HTML standard, 7.2.2): close() and
// stop() for a window scripts did not open, and the legacy captureEvents()
// and releaseEvents(). close() only lets the window go: the list cache
// (collections.js) no longer keeps it alive.
const noOps = {
  close() {
    state(this);
    forgetLastList();
  },
  stop() {
    state(this);
  },
  captureEvents() {
    state(this);
  },
  releaseEvents() {
    state(this);
  },
};

// The BarProp objects (locationbar, menubar, ...): one per window and bar,
// all visible.
const BARS = ['locationbar', 'menubar', 'personalbar', 'scrollbars', 'statusbar', 'toolbar'];
const barMembers = Object.fromEntries(
  BARS.map((bar) => [
    bar,
    {
      get() {
        const ws = state(this);
        const bars = ws.bars ?? (ws.bars = {});
        return bars[bar] ?? (bars[bar] = make(this, 'BarProp', {}));
      },
    },
  ]),
);

// [Replaceable] attributes: assigning one replaces it with an own property.
const replace = (target, name, value) =>
  Object.defineProperty(target, name, { value, writable: true, enumerable: true, configurable: true });

// A window's origin: an iframe's about:blank document has its creator's
// (frames.js), as in jsdom (its location.origin stays "null").
export const windowOrigin = (window) => {
  const ws = state(window);
  return ws.aboutOrigin ?? ws.url.origin;
};

export const WINDOW_MEMBERS = {
  ...animationFrames,
  ...timerMembers,
  ...noOps,
  ...barMembers,
  get origin() {
    return windowOrigin(this);
  },
  set origin(value) {
    replace(this, 'origin', value);
  },
  get external() {
    const ws = state(this);
    return ws.external ?? (ws.external = make(this, 'External', {}));
  },
  set external(value) {
    replace(this, 'external', value);
  },
  // The current event (DOM 2.10), set while listeners run (events.js);
  // [Replaceable]: assigning it replaces it with an own property.
  get event() {
    return state(this).currentEvent;
  },
  set event(value) {
    Object.defineProperty(this, 'event', { value, writable: true, enumerable: true, configurable: true });
  },
  ...notImplementedMethods,
  // Pseudo-elements are not implemented: as in jsdom, the element's own
  // style, reported as not implemented in the profile's words.
  getComputedStyle(element, pseudoElt = undefined) {
    const ws = state(this);
    if (!element?.[S]?.attrs)
      throw new TypeError("Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.");
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
      try {
        origin = new URL(target).origin;
      } catch {
        throw domError(
          `Failed to execute 'postMessage' on 'Window': Invalid target origin '${target}' in a call to 'postMessage'.`,
          'SyntaxError',
        );
      }
      if (origin !== ws.url.origin) return;
    }
    ws.setTimeout(() => dispatch(this, new this.MessageEvent('message', { data: message })), 0);
  },
  get customElements() {
    return state(this).customElements;
  },
  getSelection() {
    return state(this) && this.document.getSelection();
  },
  get screen() {
    const s = state(this);
    return s.screen ?? (s.screen = make(this, 'Screen', {}));
  },
  get navigator() {
    const s = state(this);
    return s.navigator ?? (s.navigator = make(this, 'Navigator', {}));
  },
  get location() {
    return state(this).location;
  },
  // [PutForwards=href]: window.location = url navigates, as in jsdom.
  set location(v) {
    state(this).location.href = v;
  },
  get history() {
    return state(this).history;
  },
  // The window's Crypto and Performance objects (crypto.js, performance.js).
  get crypto() {
    const s = state(this);
    return s.crypto ?? (s.crypto = make(this, 'Crypto', {}));
  },
  get performance() {
    const s = state(this);
    return s.performance ?? (s.performance = make(this, 'Performance', {}));
  },
};

// jsdom's words for getComputedStyle with a pseudo-element (black box: 20
// to 23, 24 to 26, 27 and later).
const pseudoElementMessage = (jsdom) =>
  jsdom >= 27
    ? "Window's getComputedStyle() method: with pseudo-elements"
    : jsdom >= 24
      ? 'window.getComputedStyle(elt, pseudoElt)'
      : 'window.computedStyle(elt, pseudoElt)';

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

// The user agent a window's requests send (XMLHttpRequest).
export const userAgentOf = () => userAgent();

const url = (self) => state(self).window[S].url;
const setURL = (self, next) => {
  state(self).window[S].url = next;
};
// Location's setters navigate (navigation.js).
const go = (self, next, replace) => navigate(state(self).window, next, replace);
const urlPart = (part) => ({
  get() {
    return url(this)[part];
  },
  set(v) {
    const next = new URL(url(this).href);
    next[part] = v;
    go(this, next);
  },
});

// --- Performance ---------------------------------------------------------------------------------
// Performance (High Resolution Time, 5): the window's clock. Its time
// origin is the window's creation; now() counts from there, as do the
// animation frame timestamps. As in jsdom (20 to 30, black box): now(),
// timeOrigin and toJSON() only, no Performance Timeline or User Timing
// (mark, measure, getEntries). The clock is the platform's
// performance.now() (a web standard global), else Date.now().

// The platform's clock, taken on first use: fake timers that replace the
// global performance.now later do not move windows' clocks (nor animation
// frame times), as with jsdom.
const platformPerformance = platformGlobal('performance');
let platformNow = null;
let platformOrigin = 0;
function initClock() {
  const clock = platformPerformance();
  const now = clock?.now;
  if (typeof now === 'function') {
    platformNow = () => now.call(clock);
    platformOrigin = clock.timeOrigin;
  } else {
    platformNow = Date.now;
  }
}

// Called when a window is created: the wall clock time, cheap to read.
// The time origin on the platform's clock is fixed on first use (within a
// millisecond of the creation), so a window never used as a clock does not
// load Node's performance.
export function startClock(ws) {
  ws.created = Date.now();
  ws.clockStart = undefined;
}

function clockStart(ws) {
  if (ws.clockStart === undefined) {
    if (platformNow === null) initClock();
    ws.clockStart = platformNow() - Math.max(0, Date.now() - ws.created);
    ws.timeOrigin = platformOrigin + ws.clockStart;
  }
  return ws.clockStart;
}

// The window's current high resolution time (ms since its time origin).
export const windowNow = (window) => {
  const start = clockStart(window[S]);
  return platformNow() - start;
};
const timeOrigin = (window) => {
  clockStart(window[S]);
  return window[S].timeOrigin;
};

export const PERFORMANCE_INTERFACE = {
  name: 'Performance',
  parent: 'EventTarget',
  members: {
    now() {
      return windowNow(state(this).window);
    },
    get timeOrigin() {
      return timeOrigin(state(this).window);
    },
    toJSON() {
      return { timeOrigin: timeOrigin(state(this).window) };
    },
  },
};

// --- Crypto --------------------------------------------------------------------------------------
// Crypto (Web Cryptography API, 10): getRandomValues() and randomUUID(),
// as jsdom has them (no subtle in any jsdom version, black box 20 to 30).
// The random bytes are the platform's (crypto.getRandomValues, a web
// standard global in browsers, Node, Deno and edge runtimes).

const INTEGER_ARRAYS = new Set([
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'BigInt64Array',
  'BigUint64Array',
]);
const MAX_BYTES = 65536;

const platformCrypto = platformGlobal('crypto');

function fillRandom(bytes) {
  const crypto = platformCrypto();
  if (typeof crypto?.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
}

const hex = (bytes, from, to) => {
  let s = '';
  for (let i = from; i < to; i++) s += (bytes[i] + 0x100).toString(16).slice(1);
  return s;
};

export const CRYPTO_INTERFACE = {
  name: 'Crypto',
  members: {
    getRandomValues(array) {
      const s = state(this);
      if (array === undefined && arguments.length < 1)
        tooFewArguments('Crypto', 'getRandomValues', 1, arguments.length);
      if (!ArrayBuffer.isView(array))
        throw new TypeError(
          "Failed to execute 'getRandomValues' on 'Crypto': parameter 1 is not of any supported type.",
        );
      if (!INTEGER_ARRAYS.has(typedArrayName(array)))
        throw domError('getRandomValues() only accepts integer typed arrays', 'TypeMismatchError');
      if (array.byteLength > MAX_BYTES) {
        const message = `getRandomValues() cannot generate more than ${MAX_BYTES} bytes of random values; ${array.byteLength} bytes were requested`;
        // jsdom 30 throws the QuotaExceededError interface, before a DOMException.
        throw s.window[S].compat.jsdom >= 30
          ? new QuotaExceededError(message)
          : domError(message, 'QuotaExceededError');
      }
      fillRandom(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      return array;
    },
    // From jsdom 22.1 (compat below). Version 4 (RFC 9562).
    randomUUID() {
      state(this);
      const crypto = platformCrypto();
      if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
      const b = new Uint8Array(16);
      fillRandom(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      return `${hex(b, 0, 4)}-${hex(b, 4, 6)}-${hex(b, 6, 8)}-${hex(b, 8, 10)}-${hex(b, 10, 16)}`;
    },
  },
  compat(proto, compat) {
    if (!compat.randomUUID) delete proto.randomUUID;
  },
};

// --- URL, URLSearchParams and Headers ---------------------------------------------------------------
// URL and URLSearchParams (URL Standard, 6) and Headers (Fetch, 5.2): the
// window's own interfaces, as jsdom's window has them (black box, jsdom
// 20.0.0 to 30.1.3). Each window has its own constructors, so a test that
// replaces URL.prototype.toString or assigns URL.createObjectURL changes
// that window only (with the platform's URL, every window of the worker).
//
// URL parsing and serialization are the platform's (URL and
// URLSearchParams are web standard globals in browsers, Node, Deno and edge
// runtimes): each URL holds a platform URL, and its searchParams wrap the
// platform URL's, which the platform keeps in sync with the URL. What jsdom
// adds or lacks per version is warpdom's: URL.parse() and canParse(), the
// size attribute and the value argument of has() and delete() from jsdom
// 23.0.0; no URL.createObjectURL() in any version; jsdom's errors
// ("Invalid URL: x", WebIDL argument conversion). Headers is warpdom's own
// (jsdom's has its own errors, and Set-Cookie headers stay separate only
// from jsdom 24.1.0; the platform's Headers also loads Node's fetch on
// first use, ~8 ms).
// (In this module for load time, as Crypto and Performance.)

// The platform's, taken when warpdom loads: a runner may later put a
// window's URL on the global object.
const PlatformURLSearchParams = PLATFORM_GLOBAL.URLSearchParams;

const parseURL = (url, base) => {
  if (typeof PlatformURL.parse === 'function')
    return base === undefined ? PlatformURL.parse(url) : PlatformURL.parse(url, base);
  try {
    return base === undefined ? new PlatformURL(url) : new PlatformURL(url, base);
  } catch {
    return null;
  }
};

const constructing = (name) => `Failed to construct '${name}'`;

// A URL of the window holding a platform URL.
function makeURL(window, url) {
  const object = Object.create(window[S].protos.URL);
  object[S] = { window, url, params: null };
  return object;
}

// The URL and base strings, parsed: the platform URL, or jsdom's TypeError.
function parseOrThrow(url, base, context) {
  const href = webidlString(url, 'parameter 1', context);
  let baseHref;
  if (base !== undefined) {
    baseHref = webidlString(base, 'parameter 2', context);
    if (parseURL(baseHref) === null) throw new TypeError(`Invalid base URL: ${baseHref}`);
  }
  const parsed = parseURL(href, baseHref);
  if (parsed === null) throw new TypeError(`Invalid URL: ${href}`);
  return parsed;
}

const setterContext = (name) => `Failed to set the '${name}' property on 'URL'`;
const setterString = (value, name) => {
  if (typeof value === 'symbol')
    throw new TypeError(
      `${setterContext(name)}: The provided value is a symbol, which cannot be converted to a string.`,
    );
  return String(value);
};

// The URL's components: getters and setters of the platform URL's (named
// "get protocol" and "set protocol", as WebIDL's).
const urlComponent = (name) =>
  Object.getOwnPropertyDescriptor(
    {
      get [name]() {
        return state(this).url[name];
      },
      set [name](value) {
        state(this).url[name] = setterString(value, name);
      },
    },
    name,
  );

const URL_INTERFACE = {
  name: 'URL',
  length: 1,
  construct(window, self, args) {
    if (args.length < 1) throw new TypeError(`${constructing('URL')}: 1 argument required, but only 0 present.`);
    self[S] = { window, url: parseOrThrow(args[0], args[1], constructing('URL')), params: null };
    return self;
  },
  members: {
    get href() {
      return state(this).url.href;
    },
    set href(value) {
      const s = state(this);
      const href = setterString(value, 'href');
      if (parseURL(href) === null) throw new TypeError(`Invalid URL: ${href}`);
      s.url.href = href;
    },
    toString() {
      return state(this).url.href;
    },
    get origin() {
      return state(this).url.origin;
    },
    protocol: urlComponent('protocol'),
    username: urlComponent('username'),
    password: urlComponent('password'),
    host: urlComponent('host'),
    hostname: urlComponent('hostname'),
    port: urlComponent('port'),
    pathname: urlComponent('pathname'),
    search: urlComponent('search'),
    get searchParams() {
      const s = state(this);
      return s.params ?? (s.params = makeParams(s.window, s.url.searchParams));
    },
    hash: urlComponent('hash'),
    toJSON() {
      return state(this).url.href;
    },
  },
  // URL.parse() and URL.canParse(), from jsdom 23.0.0 (compat.urlParse).
  staticMethods(window) {
    if (!window[S].compat.urlParse) return {};
    return {
      parse(url, base = undefined) {
        if (arguments.length < 1) tooFewArguments('URL', 'parse', 1, 0);
        const context = "Failed to execute 'parse' on 'URL'";
        const href = webidlString(url, 'parameter 1', context);
        const baseHref = base === undefined ? undefined : webidlString(base, 'parameter 2', context);
        const parsed = baseHref !== undefined && parseURL(baseHref) === null ? null : parseURL(href, baseHref);
        return parsed === null ? null : makeURL(window, parsed);
      },
      canParse(url, base = undefined) {
        if (arguments.length < 1) tooFewArguments('URL', 'canParse', 1, 0);
        const context = "Failed to execute 'canParse' on 'URL'";
        const href = webidlString(url, 'parameter 1', context);
        const baseHref = base === undefined ? undefined : webidlString(base, 'parameter 2', context);
        return !(baseHref !== undefined && parseURL(baseHref) === null) && parseURL(href, baseHref) !== null;
      },
    };
  },
};

// --- URLSearchParams ------------------------------------------------------------------------------

function makeParams(window, params) {
  const object = Object.create(window[S].protos.URLSearchParams);
  object[S] = { window, params };
  return object;
}

// The iterator method of an init that is an object (WebIDL union
// conversion): undefined for a record. jsdom before 30 takes any
// @@iterator property for a sequence (null too) and fails with V8's
// spread error; jsdom 30 as WebIDL (null: a record; not callable: an error).
function iteratorMethod(init, window) {
  const method = init[Symbol.iterator];
  const legacy = window[S].compat.jsdom < 30;
  if (legacy ? method === undefined : method == null) return undefined;
  if (typeof method !== 'function')
    throw new TypeError(legacy ? 'tmp is not iterable' : 'Cannot convert a Symbol value to a string');
  return method;
}

// A record<K, V> (WebIDL 3.2.24): the own enumerable properties; a key
// that converts to one seen before replaces its value.
function recordPairs(init, context, convert) {
  const pairs = new Map();
  for (const key of Reflect.ownKeys(init)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(init, key);
    if (descriptor === undefined || !descriptor.enumerable) continue;
    if (typeof key === 'symbol')
      throw new TypeError(`${context}: parameter 1 record's key is a symbol, which cannot be converted to a string.`);
    pairs.set(convert(key, "record's key"), convert(init[key], "record's value"));
  }
  return [...pairs];
}

// A sequence<sequence<T>>: each element an iterable of exactly two (the
// count is checked by the caller: jsdom's messages differ).
function sequencePairs(init, method, context, convert) {
  const pairs = [];
  for (const element of { [Symbol.iterator]: () => method.call(init) }) {
    if (element === null || (typeof element !== 'object' && typeof element !== 'function')) {
      throw new TypeError(`${context}: parameter 1 sequence's element is not an iterable object.`);
    }
    const pair = [];
    for (const item of element) pair.push(convert(item, "sequence's element's element"));
    pairs.push(pair);
  }
  return pairs;
}

const uspContext = constructing('URLSearchParams');
// USVString: lone surrogates become U+FFFD.
const usvString = (string) =>
  typeof string.toWellFormed === 'function'
    ? string.toWellFormed()
    : string.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');
const uspString = (value, what) => usvString(webidlString(value, `parameter 1 ${what}`, uspContext));

// The (name, value) pairs of a URLSearchParams init, or its string.
function paramsInit(window, init) {
  if (init === undefined) return '';
  if (init === null || (typeof init !== 'object' && typeof init !== 'function'))
    return webidlString(init, 'parameter 1', uspContext);
  const method = iteratorMethod(init, window);
  if (method === undefined) return recordPairs(init, uspContext, uspString);
  const pairs = sequencePairs(init, method, uspContext, uspString);
  for (const pair of pairs) {
    if (pair.length !== 2)
      throw new TypeError(`${uspContext}: parameter 1 sequence's element does not contain exactly two elements.`);
  }
  return pairs;
}

const argument = (value, index, method, iface = 'URLSearchParams') =>
  webidlString(value, `parameter ${index}`, `Failed to execute '${method}' on '${iface}'`);

// forEach (WebIDL pair iterators): its errors name the 'iterable'.
const URL_SEARCH_PARAMS_INTERFACE = {
  name: 'URLSearchParams',
  construct(window, self, [init]) {
    const pairs = paramsInit(window, init);
    let params;
    if (typeof pairs === 'string') {
      params = new PlatformURLSearchParams(pairs);
    } else {
      params = new PlatformURLSearchParams();
      for (const [name, value] of pairs) params.append(name, value);
    }
    self[S] = { window, params };
    return self;
  },
  members: {
    // From jsdom 23.0.0 (compat below).
    get size() {
      return state(this).params.size;
    },
    append(name, value) {
      const { params } = state(this);
      if (value === undefined && arguments.length < 2)
        tooFewArguments('URLSearchParams', 'append', 2, arguments.length);
      params.append(argument(name, 1, 'append'), argument(value, 2, 'append'));
    },
    // The value argument from jsdom 23.0.0 (compat.paramValues).
    delete(name, value = undefined) {
      const s = state(this);
      if (arguments.length < 1) tooFewArguments('URLSearchParams', 'delete', 1, 0);
      const key = argument(name, 1, 'delete');
      if (value === undefined || !s.window[S].compat.paramValues) s.params.delete(key);
      else s.params.delete(key, argument(value, 2, 'delete'));
    },
    get(name) {
      const { params } = state(this);
      if (arguments.length < 1) tooFewArguments('URLSearchParams', 'get', 1, 0);
      return params.get(argument(name, 1, 'get'));
    },
    getAll(name) {
      const { params } = state(this);
      if (arguments.length < 1) tooFewArguments('URLSearchParams', 'getAll', 1, 0);
      return params.getAll(argument(name, 1, 'getAll'));
    },
    has(name, value = undefined) {
      const s = state(this);
      if (arguments.length < 1) tooFewArguments('URLSearchParams', 'has', 1, 0);
      const key = argument(name, 1, 'has');
      return value === undefined || !s.window[S].compat.paramValues
        ? s.params.has(key)
        : s.params.has(key, argument(value, 2, 'has'));
    },
    set(name, value) {
      const { params } = state(this);
      if (value === undefined && arguments.length < 2) tooFewArguments('URLSearchParams', 'set', 2, arguments.length);
      params.set(argument(name, 1, 'set'), argument(value, 2, 'set'));
    },
    sort() {
      state(this).params.sort();
    },
    // The platform's iterators (live, as WebIDL's pair iterators).
    entries() {
      return state(this).params.entries();
    },
    keys() {
      return state(this).params.keys();
    },
    values() {
      return state(this).params.values();
    },
    forEach(callback, thisArg = undefined) {
      const { params } = state(this);
      checkForEachCallback(callback, arguments.length);
      params.forEach((value, name) => {
        apply(callback, thisArg, [value, name, this]);
      });
    },
    toString() {
      return state(this).params.toString();
    },
  },
  compat(proto, compat) {
    if (!compat.paramValues) delete proto.size;
  },
};

// --- Headers -------------------------------------------------------------------------------------
// A header list of [name, value] pairs, names as given. As jsdom's: no
// guard (forbidden request headers are kept), its errors ("name is
// invalid"), and before jsdom 24.1.0 no getSetCookie() and Set-Cookie
// values combined like any other header's.

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HTTP_WHITESPACE = /^[\t\n\r ]+|[\t\n\r ]+$/g;
const INVALID_VALUE = /[\0\n\r]/;
const NOT_BYTES = /[^\x00-\xFF]/;
const lowercase = (name) => name.toLowerCase();

function byteString(value, what, context) {
  const string = webidlString(value, what, context);
  if (NOT_BYTES.test(string)) throw new TypeError(`${context}: ${what} is not a valid ByteString.`);
  return string;
}

const headerName = (value, method) => {
  const name = byteString(value, 'parameter 1', `Failed to execute '${method}' on 'Headers'`);
  if (!TOKEN.test(name)) throw new TypeError('name is invalid');
  return name;
};

const headerValue = (value, method) => {
  const normalized = byteString(value, 'parameter 2', `Failed to execute '${method}' on 'Headers'`).replace(
    HTTP_WHITESPACE,
    '',
  );
  if (INVALID_VALUE.test(normalized)) throw new TypeError('value is invalid');
  return normalized;
};

function appendHeader(s, name, value) {
  if (!TOKEN.test(name)) throw new TypeError('name is invalid');
  const normalized = value.replace(HTTP_WHITESPACE, '');
  if (INVALID_VALUE.test(normalized)) throw new TypeError('value is invalid');
  s.list.push([name, normalized]);
  s.sorted = null;
}

const combined = (list, key) => {
  let value = null;
  for (const [name, v] of list) if (lowercase(name) === key) value = value === null ? v : `${value}, ${v}`;
  return value;
};

// Sort and combine (Fetch 2.2.2): lowercase names in byte order, values of
// a name combined, Set-Cookie values separate from jsdom 24.1.0. Cached
// until the list changes.
function sortedHeaders(s) {
  if (s.sorted !== null) return s.sorted;
  const names = [...new Set(s.list.map(([name]) => lowercase(name)))].sort();
  const separate = s.window[S].compat.setCookieList;
  const sorted = [];
  for (const name of names) {
    if (name === 'set-cookie' && separate) {
      for (const [n, v] of s.list) if (lowercase(n) === name) sorted.push([name, v]);
    } else {
      sorted.push([name, combined(s.list, name)]);
    }
  }
  return (s.sorted = sorted);
}

const hContext = constructing('Headers');
const hInitString = (value, what) => byteString(value, `parameter 1 ${what}`, hContext);

function fillHeaders(window, s, init) {
  if (init === undefined) return;
  if (init === null || (typeof init !== 'object' && typeof init !== 'function'))
    throw new TypeError(`${hContext}: parameter 1 is not of any supported type.`);
  const method = iteratorMethod(init, window);
  if (method === undefined) {
    for (const [name, value] of recordPairs(init, hContext, hInitString)) appendHeader(s, name, value);
    return;
  }
  for (const pair of sequencePairs(init, method, hContext, hInitString)) {
    if (pair.length !== 2) throw new TypeError('init is invalid');
    appendHeader(s, pair[0], pair[1]);
  }
}

// The Headers iterator (WebIDL default iterator objects): the sorted list
// as it is at each step.
const HEADERS_ITERATOR = Object.create(Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())), {
  next: {
    value: function next() {
      const it = this?.[ITERATION];
      if (it === undefined) throw new TypeError('next() called on an object that is not a Headers iterator.');
      const list = sortedHeaders(it.target);
      if (it.index >= list.length) return { value: undefined, done: true };
      const [name, value] = list[it.index++];
      return { value: it.kind === 'keys' ? name : it.kind === 'values' ? value : [name, value], done: false };
    },
    writable: true,
    enumerable: true,
    configurable: true,
  },
  [Symbol.toStringTag]: { value: 'Headers Iterator', configurable: true },
});
const ITERATION = Symbol('Headers iteration');

function headersIterator(self, kind) {
  const iterator = Object.create(HEADERS_ITERATOR);
  Object.defineProperty(iterator, ITERATION, { value: { target: state(self), kind, index: 0 } });
  return iterator;
}

const HEADERS_INTERFACE = {
  name: 'Headers',
  construct(window, self, [init]) {
    const s = { window, list: [], sorted: null };
    fillHeaders(window, s, init);
    self[S] = s;
    return self;
  },
  members: {
    append(name, value) {
      const s = state(this);
      if (value === undefined && arguments.length < 2) tooFewArguments('Headers', 'append', 2, arguments.length);
      s.list.push([headerName(name, 'append'), headerValue(value, 'append')]);
      s.sorted = null;
    },
    delete(name) {
      const s = state(this);
      if (arguments.length < 1) tooFewArguments('Headers', 'delete', 1, 0);
      const key = lowercase(headerName(name, 'delete'));
      s.list = s.list.filter(([n]) => lowercase(n) !== key);
      s.sorted = null;
    },
    get(name) {
      const s = state(this);
      if (arguments.length < 1) tooFewArguments('Headers', 'get', 1, 0);
      return combined(s.list, lowercase(headerName(name, 'get')));
    },
    // From jsdom 24.1.0 (compat below).
    getSetCookie() {
      const values = [];
      for (const [name, value] of state(this).list) if (lowercase(name) === 'set-cookie') values.push(value);
      return values;
    },
    has(name) {
      const s = state(this);
      if (arguments.length < 1) tooFewArguments('Headers', 'has', 1, 0);
      const key = lowercase(headerName(name, 'has'));
      return s.list.some(([n]) => lowercase(n) === key);
    },
    // Replaces the first header of the name and removes the others, or appends.
    set(name, value) {
      const s = state(this);
      if (value === undefined && arguments.length < 2) tooFewArguments('Headers', 'set', 2, arguments.length);
      const header = headerName(name, 'set');
      const normalized = headerValue(value, 'set');
      const key = lowercase(header);
      let found = false;
      s.list = s.list.filter((entry) => {
        if (lowercase(entry[0]) !== key) return true;
        if (found) return false;
        found = true;
        entry[1] = normalized;
        return true;
      });
      if (!found) s.list.push([header, normalized]);
      s.sorted = null;
    },
    keys() {
      return headersIterator(this, 'keys');
    },
    values() {
      return headersIterator(this, 'values');
    },
    entries() {
      return headersIterator(this, 'entries');
    },
    forEach(callback, thisArg = undefined) {
      const s = state(this);
      checkForEachCallback(callback, arguments.length);
      for (let i = 0; i < sortedHeaders(s).length; i++) {
        const [name, value] = sortedHeaders(s)[i];
        apply(callback, thisArg, [value, name, this]);
      }
    },
  },
  compat(proto, compat) {
    if (!compat.setCookieList) delete proto.getSetCookie;
  },
};

// @@iterator is the entries() function (WebIDL pair iterators).
for (const { members } of [URL_SEARCH_PARAMS_INTERFACE, HEADERS_INTERFACE]) members[Symbol.iterator] = members.entries;

export const URL_INTERFACES = [URL_INTERFACE, URL_SEARCH_PARAMS_INTERFACE, HEADERS_INTERFACE];

// --- console and WebAssembly ---------------------------------------------------------------------
// Own properties of the window, as jsdom's (black box, 20 to 30).
// Test environments leave both to the global object they install the
// window on (installWindow in vitest.js): there console is the
// environment's (Jest's, Vitest's) and WebAssembly the realm's.

// jsdom's console: a plain object whose methods (no names, no length)
// send their arguments to its virtual console, which by default sends
// them to the console of the platform; an iframe's to the same. warpdom's
// send them to the console the test environment gives
// (window[S].consoleTarget: the one jsdom's virtual console sends to
// there), else to the platform's.
const CONSOLE_METHODS = [
  'assert',
  'clear',
  'count',
  'countReset',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'groupEnd',
  'info',
  'log',
  'table',
  'time',
  'timeLog',
  'timeEnd',
  'trace',
  'warn',
];
const platformConsole = platformGlobal('console');

const topWindow = (window) => {
  let top = window;
  while (top[S].parentWindow) top = top[S].parentWindow;
  return top;
};

function createConsole(window) {
  const console = {};
  const forward =
    (method) =>
    (...args) => {
      let target = topWindow(window)[S].consoleTarget ?? platformConsole();
      if (target === console) target = platformConsole();
      target?.[method]?.(...args);
    };
  for (const method of CONSOLE_METHODS) console[method] = forward(method);
  return console;
}

function setupConsole(window) {
  const ws = window[S];
  // Made on first read, as the interface objects are (window.js): until
  // then an accessor. Enumerable before jsdom 27. The per-file reset
  // (reset.js) keeps the object and puts back its methods.
  const enumerable = ws.compat.jsdom < 27;
  const define = (value) =>
    Object.defineProperty(window, 'console', { value, writable: true, enumerable, configurable: true });
  Object.defineProperty(window, 'console', {
    get() {
      const console = ws.console ?? (ws.console = createConsole(window));
      define(console);
      return console;
    },
    set: lazyDataSetter(window, 'console', define),
    enumerable,
    configurable: true,
  });
  // The WebAssembly namespace of the window's realm (the test file's under
  // Jest and Vitest's VM pools, where the global's own is that); a frame's
  // is its top-level window's, as frames share warpdom's realm.
  const { WebAssembly } = realmOf(topWindow(window));
  if (WebAssembly !== undefined)
    Object.defineProperty(window, 'WebAssembly', {
      value: WebAssembly,
      writable: true,
      enumerable: false,
      configurable: true,
    });
}

// Plugin, MimeType, PluginArray and MimeTypeArray (HTML 8.9.1.6, the
// obsolete plugin API), as in jsdom 20 to 30: navigator.plugins and
// navigator.mimeTypes are empty legacy platform objects (staticList), so no
// Plugin or MimeType object is ever made. Their iterator is
// Array.prototype.values (WebIDL), as jsdom's is.
const listOf = (self) => {
  const s = self != null ? self[S] : undefined;
  if (!s || !s.items) throw new TypeError('Illegal invocation');
  return s.items();
};
const collectionLookups = (name) => ({
  item(index) {
    if (index === undefined && arguments.length < 1) tooFewArguments(name, 'item', 1, 0);
    return listOf(this)[index >>> 0] ?? null;
  },
  namedItem(key) {
    if (key === undefined && arguments.length < 1) tooFewArguments(name, 'namedItem', 1, 0);
    listOf(this);
    return null;
  },
});
const PLUGIN_INTERFACES = [
  {
    name: 'Plugin',
    members: {
      ...collectionLookups('Plugin'),
      get name() {
        return state(this).name;
      },
      get description() {
        return state(this).description;
      },
      get filename() {
        return state(this).filename;
      },
      get length() {
        return listOf(this).length;
      },
      [Symbol.iterator]: Array.prototype.values,
    },
  },
  {
    name: 'MimeType',
    members: {
      get type() {
        return state(this).type;
      },
      get description() {
        return state(this).description;
      },
      get suffixes() {
        return state(this).suffixes;
      },
      get enabledPlugin() {
        return state(this).enabledPlugin;
      },
    },
  },
  {
    name: 'PluginArray',
    members: {
      refresh() {
        listOf(this);
      },
      ...collectionLookups('PluginArray'),
      get length() {
        return listOf(this).length;
      },
      [Symbol.iterator]: Array.prototype.values,
    },
  },
  {
    name: 'MimeTypeArray',
    members: {
      ...collectionLookups('MimeTypeArray'),
      get length() {
        return listOf(this).length;
      },
      [Symbol.iterator]: Array.prototype.values,
    },
  },
];

// --- WebSocket -----------------------------------------------------------------------------------
// jsdom's window has WebSocket in every version (black box, 20.0.0 to
// 30.1.3): an own data property, writable, not enumerable, configurable.
// warpdom's is the platform's WebSocket (Node's from 22), not an own
// interface: its events and errors are the platform's, not the window's
// (docs/differences.md). Without one on the platform the
// window has none. Node defines it as a lazy property that loads its
// WebSocket client on first access, also through
// Object.getOwnPropertyDescriptor (~10 ms), so it is read on the window's
// first read of WebSocket, as the interface objects are made (window.js);
// the `in` check does not load it.
const PLATFORM_HAS_WEBSOCKET = 'WebSocket' in PLATFORM_GLOBAL;

function setupWebSocket(window) {
  if (!PLATFORM_HAS_WEBSOCKET) return;
  const define = (value) =>
    Object.defineProperty(window, 'WebSocket', { value, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(window, 'WebSocket', {
    get() {
      const WebSocket = PLATFORM_GLOBAL.WebSocket;
      define(WebSocket);
      return WebSocket;
    },
    set: lazyDataSetter(window, 'WebSocket', define),
    enumerable: false,
    configurable: true,
  });
}

export const FEATURE_INTERFACES = [
  ...PLUGIN_INTERFACES,
  CRYPTO_INTERFACE,
  PERFORMANCE_INTERFACE,
  {
    name: 'BarProp',
    members: {
      get visible() {
        state(this);
        return true;
      },
    },
  },
  // Obsolete search provider methods; they do nothing.
  {
    name: 'External',
    members: {
      AddSearchProvider() {
        state(this);
      },
      IsSearchProviderInstalled() {
        state(this);
      },
    },
  },
  // Values as in jsdom (no screen; no orientation).
  {
    name: 'Screen',
    members: Object.fromEntries(
      Object.entries({ availWidth: 0, availHeight: 0, width: 0, height: 0, colorDepth: 24, pixelDepth: 24 }).map(
        ([key, value]) => [
          key,
          {
            get() {
              state(this);
              return value;
            },
          },
        ],
      ),
    ),
  },
  {
    name: 'Navigator',
    members: {
      get userAgent() {
        state(this);
        return userAgent();
      },
      get appVersion() {
        state(this);
        return userAgent().slice('Mozilla/'.length);
      },
      get appName() {
        state(this);
        return 'Netscape';
      },
      get appCodeName() {
        state(this);
        return 'Mozilla';
      },
      get product() {
        state(this);
        return 'Gecko';
      },
      get productSub() {
        state(this);
        return '20030107';
      },
      get vendorSub() {
        state(this);
        return '';
      },
      get platform() {
        state(this);
        return '';
      },
      get vendor() {
        state(this);
        return 'Apple Computer, Inc.';
      },
      get language() {
        state(this);
        return 'en-US';
      },
      get languages() {
        state(this);
        return Object.freeze(['en-US', 'en']);
      },
      get onLine() {
        state(this);
        return true;
      },
      get cookieEnabled() {
        state(this);
        return true;
      },
      // Legacy plugin collections, empty as in jsdom (and browsers today);
      // the same object on every read. No pdfViewerEnabled (jsdom neither).
      get plugins() {
        const s = state(this);
        return s.plugins ?? (s.plugins = staticList(s.window[S].protos.PluginArray, []));
      },
      get mimeTypes() {
        const s = state(this);
        return s.mimeTypes ?? (s.mimeTypes = staticList(s.window[S].protos.MimeTypeArray, []));
      },
      get hardwareConcurrency() {
        state(this);
        return 4;
      },
      get maxTouchPoints() {
        state(this);
        return 0;
      },
      get webdriver() {
        state(this);
        return false;
      },
      javaEnabled() {
        return false;
      },
    },
  },
  {
    name: 'Location',
    members: {
      href: {
        get() {
          return url(this).href;
        },
        set(v) {
          go(this, new URL(String(v), url(this).href));
        },
      },
      get origin() {
        return url(this).origin;
      },
      protocol: urlPart('protocol'),
      host: urlPart('host'),
      hostname: urlPart('hostname'),
      port: urlPart('port'),
      pathname: urlPart('pathname'),
      search: urlPart('search'),
      hash: urlPart('hash'),
      assign(v) {
        go(this, new URL(String(v), url(this).href));
      },
      replace(v) {
        go(this, new URL(String(v), url(this).href), true);
      },
      reload() {
        state(this);
      },
      toString() {
        return url(this).href;
      },
    },
  },
  {
    name: 'History',
    members: {
      get length() {
        return state(this).entries.length;
      },
      get state() {
        const s = state(this);
        return s.entries[s.index].state;
      },
      get scrollRestoration() {
        return state(this).scrollRestoration ?? 'auto';
      },
      set scrollRestoration(v) {
        state(this).scrollRestoration = v === 'manual' ? 'manual' : 'auto';
      },
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
      back() {
        traverse(state(this).window, -1);
      },
      forward() {
        traverse(state(this).window, 1);
      },
      go(delta = 0) {
        traverse(state(this).window, Number(delta) | 0);
      },
    },
  },
];

// The style surface of a jsdom profile (src/style-surface.js: which
// properties it knows and has accessors for), measured per jsdom and
// cssstyle version: before jsdom 29 by the cssstyle jsdom loads (given, or
// the one jsdom's version installs: 2 to 21.0, 3 from 21.1 to 23.0, the
// latest 4.x from 23.1 to 26, 5.3 for 27 to 28.0, the latest 6.x for 28.1),
// later by jsdom's version. null: jsdom 30.1 and later (STYLE_ACCESSORS).
function styleSurfaceKey(version, css) {
  if (version[0] >= 30)
    return before(version, [30, 0, 1]) ? 'jsdom30.0.0' : before(version, [30, 1, 0]) ? 'jsdom30.0.1' : null;
  if (version[0] === 29) return before(version, [29, 1, 0]) ? 'jsdom29.0' : 'jsdom29.1';
  css ??= before(version, [21, 1, 0])
    ? [2]
    : before(version, [23, 1, 0])
      ? [3]
      : version[0] <= 26
        ? [4, Infinity]
        : before(version, [28, 1, 0])
          ? [5]
          : [6, Infinity];
  if (css[0] <= 2) return 'cssstyle2';
  if (css[0] === 3 || (css[0] === 4 && before(css, [4, 1, 0]))) return 'cssstyle3';
  if (css[0] === 4) return before(css, [4, 4, 0]) ? 'cssstyle4.1' : 'cssstyle4.4';
  if (css[0] === 5) return before(css, [5, 3, 0]) ? 'cssstyle5.0' : 'cssstyle5';
  return before(css, [6, 1, 0]) ? 'cssstyle6.0' : 'cssstyle6.1';
}

// The shape of the CSS rule interfaces for a jsdom version (profileCompat).
function cssomShape(version) {
  if (version[0] >= 29) return null;
  if (!before(version, [27, 1, 0])) return 'acemir';
  if (!before(version, [26, 0, 0])) return 'cssom26';
  return before(version, [24, 1, 0]) ? 'cssom20' : 'cssom24';
}

// Compatibility with the jsdom generation the tests were written for
// (option jsdom: its version, or its major version; option cssstyle: the
// cssstyle it loads): the window's compat object (window[S].compat), made
// before its interfaces, whose members can depend on it.
function pendingByOrderMode(version) {
  if (before(version, [28, 1, 0])) return null;
  return before(version, [30, 1, 3]) ? 'all' : 'important';
}

function varDropsImportantMode(version) {
  if (version[0] < 27 || version[0] > 29) return null;
  return before(version, [27, 1, 0]) ? 'declarations' : 'all';
}

export function profileCompat({ jsdom = LATEST_JSDOM, cssstyle } = {}) {
  // Behaviors that changed between versions in ways tests observe. jsdom
  // before 29 left most computed style values empty, and before 28 let
  // tests write to computed styles; before 30.1.2 focus() ignored
  // display: none and the hidden attribute.
  const version = parseJsdomVersion(jsdom);
  // jsdom 26 and earlier parse CSS with cssstyle 4, whose behavior changed
  // between its minor releases; the installed one (option cssstyle, found
  // by the adapters next to jsdom) decides, else the latest 4.x. Before
  // 4.3.1, url() in background and background-image serialized without
  // quotes; before 4.4 the root element's computed color was '', and in
  // 4.4 and 4.5 'CanvasText'.
  // The cssstyle a jsdom release installs (its dependency range): 2.3 to
  // 21.0.x, 3.0 from 21.1.0 to 23.0.x, the latest 4.x from 23.1.0: the
  // default when no cssstyle is given.
  const cssDefault = before(version, [21, 1, 0]) ? '2.3.0' : before(version, [23, 1, 0]) ? '3.0.0' : null;
  const cssText = version[0] < 27 ? (cssstyle ?? cssDefault) : null;
  const css = cssText != null ? parseJsdomVersion(cssText) : null;
  const pendingLonghands =
    version[0] >= 27 ||
    (css === null ? !before(version, [23, 1, 0]) : css[0] > 4 || (css[0] === 4 && !before(css, [4, 4, 0])));
  return {
    version: jsdom,
    jsdom: version[0],
    mutableComputedStyle: before(version, [28, 1, 0]),
    // Computed style (cascade.js), black box per release: before 29.0.2
    // undeclared properties compute to '' and CSS-wide keywords to
    // themselves (jsdom 29.0.0 and 29.0.1 too); unset to '' before 28.1
    // (from jsdom 21). From 29.0.2 a shorthand jsdom does not expand
    // computes a CSS-wide keyword to 'see individual properties' or its own
    // initial value, and its border shorthands (border-radius,
    // border-block, ...) to '' until 29.1.1; from 30.1.3 to '' or that
    // initial value, undeclared too, and flex and background compose their
    // longhands (cascade.js observedShorthand).
    legacyComputedStyle: before(version, [29, 0, 2]),
    unsetUndeclared: version[0] >= 21 && before(version, [28, 1, 0]),
    blankBorderShorthands: !before(version, [29, 0, 2]) && before(version, [29, 1, 1]),
    shorthandInitials: !before(version, [30, 1, 3]),
    initialAnimationDelay: before(version, [30, 0, 1]),
    rawComputedValues:
      before(version, [29, 0, 2]) || !before(version, [30, 1, 0]) ? null : version[0] === 29 ? '29' : '30.0',
    // The user agent sheet's !important declarations win over the page's
    // normal ones from 28.1.0 (ua-sheet.js); the page's !important ones,
    // later, over them.
    uaImportant: !before(version, [28, 1, 0]),
    // From 28.1.0 (black box, 28.1.0 to 30.1.3) its other declarations meet
    // the page's by specificity, the page's winning ties (* { display:
    // inline } leaves a div block); the hidden attribute's display: none
    // is one of them (cascade.js pageOrUserAgent).
    uaBySpecificity: !before(version, [28, 1, 0]),
    // Before 28.1.0 (black box, 20.0.0 to 28.0.0) the page's style rules
    // apply in document order, without specificity or !important: the
    // latest matching declaration wins, the style attribute over all of
    // them, and any of them over the user agent sheet (the hidden
    // attribute's display: none too) (cascade.js).
    documentOrder: before(version, [28, 1, 0]),
    // document.styleSheets in the order the sheets were created, before
    // 30.1.2 (cssom.js documentStyleSheets).
    sheetsByCreation: before(version, [30, 1, 2]),
    // A <style> in a shadow tree has a style sheet from 30.1.2 (black box,
    // 20.0.3 to 30.1.3): before, its sheet is null and it applies to
    // nothing; from 30.1.2 its sheet is in document.styleSheets and
    // applies to every element, the document's and other shadow trees'
    // too (cssom.js documentStyleSheets). In every version the document's
    // sheets apply in shadow trees (cascade.js ruleIndex).
    shadowSheets: !before(version, [30, 1, 2]),
    // From 21 to 30.1.1 (black box: 21.1.2 to 29.1.1 measured; 20.0.3 and
    // 30.1.2 do not) an element's computed style, once read, is kept until
    // the document's own tree changes (a node inserted or removed, an
    // attribute or text set; not in a shadow tree or a disconnected one):
    // editing a rule's declarations or selector does not change it, and
    // neither do insertRule() and deleteRule() before 29 (cascade.js
    // cascaded).
    keptComputedStyle: version[0] >= 21 && before(version, [30, 1, 2]),
    ruleListRefreshes: version[0] >= 29,
    // Text selection (forms.js), black box per release: before 21.1.2 the
    // select event is dispatched synchronously and is cancelable (from
    // 21.1.2 in a task, not cancelable), and setRangeText() takes the new
    // value's length as the end of the replaced text.
    syncSelectEvent: before(version, [21, 1, 2]),
    legacyRangeTextEnd: before(version, [21, 1, 2]),
    // Form controls (forms.js), black box per release: from 30.1.0 cloning
    // an input copies its indeterminate state; the pattern attribute
    // compiles with the v flag from 27.0.0, with u before.
    // valueAsNumber = NaN throws a TypeError before 23.1.0; before 30.1.0
    // a time's fraction is whole milliseconds and times with seconds have
    // three fraction digits.
    cloneIndeterminate: !before(version, [30, 1, 0]),
    patternFlag: before(version, [27, 0, 0]) ? 'u' : 'v',
    nanValueAsNumberThrows: before(version, [23, 1, 0]),
    legacyTimeStrings: before(version, [30, 1, 0]),
    // From 30.1.0 a checked radio button unchecks its group when it becomes
    // connected or its form attribute changes.
    radioConnected: !before(version, [30, 1, 0]),
    // form[i] (form.elements[i]) from 26.1.0.
    formIndexed: !before(version, [26, 1, 0]),
    // textarea wrap="hard" with a cols attribute breaks lines every cols
    // characters before 24.0.0 and from 30.1.0 (between: elsewhere).
    hardWrap: before(version, [24, 0, 0]) || !before(version, [30, 1, 0]),
    focusIgnoresRendering: before(version, [30, 1, 2]),
    // A disabled button, input, select or textarea with a tabindex is
    // focusable before 30.1.1 (black box: 16.4.0 to 30.1.0 focus it).
    disabledTabindexFocus: before(version, [30, 1, 1]),
    detachedCheckableEvents: before(version, [16, 5, 2]),
    cssstyle: version[0] < 27 ? (css ? cssText : undefined) : (cssstyle ?? undefined),
    cssstyleMajor: css ? css[0] : 0,
    styleSurface: styleSurfaceKey(
      version,
      version[0] < 27 ? css : cssstyle != null ? parseJsdomVersion(cssstyle) : null,
    ),
    unquotedUrls: css !== null && before(css, [4, 3, 1]),
    // A shorthand declared with var() (padding: var(--p)) declares its
    // longhands pending substitution, so they hide the user agent sheet's
    // and earlier ones (padding-top '', from 29.0.2 its initial 0): with
    // cssstyle 4.4 and later (jsdom 23.1 to 26 with it; 4.4, 4.5 and 4.6
    // measured), and in jsdom 27 and later (cascade.js cascadeExpand).
    pendingLonghands,
    // A pending longhand and one declared as itself meet by order: each
    // one's cascade winner from 28.1.0 to 30.1.2, from 30.1.3 only
    // !important ones (cascade.js cascadeByOrder); before 28.1.0 all
    // declarations meet by order (documentOrder).
    pendingByOrder: pendingLonghands ? pendingByOrderMode(version) : null,
    // Before jsdom 30 (black box: 28.1.0 and 29.1.1 lose it, 30.1.2 keeps
    // it) an !important longhand set over an !important shorthand loses its
    // !important (setProperty('padding', '8px', 'important') then
    // setProperty('padding-bottom', '7px', 'important') reads
    // padding-bottom: 7px), in the computed style's cascade too (cascade.js
    // cascadeInOrder).
    longhandLosesImportant: version[0] < 30,
    // A declaration with var() is not !important (black box, read through
    // cssText and getPropertyPriority: 27.4.0, 28.1.0 and 29.1.1 drop it,
    // 26.1.0 and 30.1.3 keep it; 27.0.1 and 27.1.0 measured with a
    // single-jsdom install, #141), custom properties aside: from jsdom
    // 27.0.0 to 29.1.1 in a style attribute, cssText and setProperty
    // ('declarations'), from 27.1.0 in style sheets too ('all'). In the cascade, where !important counts from 28.1.0,
    // padding: var(--p) !important does not override padding: 1px
    // !important, in a rule or the attribute. In the attribute it still
    // keeps later normal declarations of its property out (color: var(--c)
    // !important; color: red is color: var(--c)); in a style sheet it does
    // not (css.js parseInto).
    varDropsImportant: varDropsImportantMode(version),
    // jsdom 27 also finds the var() in a string (content: "var(--x)"
    // !important is content: "var(--x)"); 28 and 29 do not (black box,
    // 27.4.0 to 29.1.1; css.js dropsImportant).
    varInStrings: version[0] === 27,
    // cssstyle 4.6 (jsdom 23.1 to 26 with it, the default there): a custom
    // property is not !important in a style attribute, cssText and
    // setProperty (--x: 1px !important is --x: 1px); 4.1 keeps it, 4.2 to
    // 4.5 are not measured.
    customDropsImportant: version[0] < 27 && (css === null || (css[0] === 4 && !before(css, [4, 6, 0]))),
    // jsdom 27.0.0 to 28.1.0 (cssstyle 5 and 6): in a style attribute or
    // cssText (an element's or a rule's), border declared with var()
    // (border: var(--b)) or border or a side with a CSS-wide keyword
    // (border-top: inherit, #179) leaves the block empty, and a side with
    // var() (border-top: 1px solid var(--c)) is dropped; setProperty keeps
    // them, and so do style sheets (css.js parseInto; black box, 27.4.0 and
    // 28.1.0).
    borderVarDrops: version[0] === 27 || version[0] === 28,
    // cssstyle's font shorthand before 4.4 (shorthands.js legacyFont).
    legacyFont: css === null || !before(css, [4, 4, 0]) ? null : before(css, [4, 2, 0]) ? 'cssstyle4.1' : 'cssstyle4.2',
    // cssstyle 4.4 and later: the computed style's background and border
    // side accessors compose their longhands (cascade.js legacyAccessorValue).
    // cssstyle before 4.2: color channels rounded once, no hwb() (colors.js).
    legacyColors: version[0] < 27 && css !== null && before(css, [4, 2, 0]),
    // Color keywords as cssstyle writes them (css.js colorKeywords): before
    // 4.4 'css2', in 4.4 and 4.5 'written', later lowercased (null).
    colorKeywords:
      version[0] >= 27 || css === null || !before(css, [4, 6, 0]) ? null : before(css, [4, 4, 0]) ? 'css2' : 'written',
    // Computed colors (cascade.js computeValue), black box: before 22.1.0
    // as declared ('declared': red stays red; background-color and the
    // border colors '' when not declared); to 26 named, hex and functional
    // colors resolved, system colors as declared ('keywords'; currentcolor
    // too with cssstyle before 4.4); from 27 all resolved, system colors to
    // jsdom's values ('resolved').
    computedColors: before(version, [22, 1, 0]) ? 'declared' : version[0] < 27 ? 'keywords' : 'resolved',
    // A declared 0 length computes to 0px from 28.1.0; before as declared
    // (text-indent: 0, min-width: 0), black box 20.0.0 to 28.0.0.
    zeroLengths: !before(version, [28, 1, 0]),
    // From jsdom 30.0.0 computed lengths are px (em, rem, vw, calc(); font
    // size keywords, larger and smaller), from 30.1.0 bolder and lighter
    // weights (cascade.js, lengths.js).
    absoluteLengths: version[0] >= 30,
    relativeWeights: !before(version, [30, 1, 0]),
    composedAccessors: version[0] < 27 && (css === null || (css[0] === 4 && !before(css, [4, 4, 0]))),
    // Members jsdom added (black box): crypto.randomUUID() in 22.1.0,
    // TextEncoder and TextDecoder in 27.4.0, Blob's text(), arrayBuffer()
    // and bytes() in 28.1.0.
    randomUUID: !before(version, [22, 1, 0]),
    textCodec: !before(version, [27, 4, 0]),
    blobReads: !before(version, [28, 1, 0]),
    // URL.parse() and canParse(), URLSearchParams size and the value
    // argument of has() and delete() from 23.0.0; Headers keeps Set-Cookie
    // values apart (getSetCookie()) from 24.1.0 (url.js).
    // SVG (svg.js, event-handlers.js): the element interfaces, SVGRect,
    // viewBox and preserveAspectRatio from 26.1.0; a symbol is a viewport
    // element from 26.1.0 to 30.0.x; svg forwards window event handlers
    // to the window before 28.1.0.
    svgTypes: !before(version, [26, 1, 0]),
    svgSymbolViewport: !before(version, [26, 1, 0]) && before(version, [30, 1, 0]),
    svgWindowHandlers: before(version, [28, 1, 0]),
    // The window's named properties object (WindowProperties) from 24.1.2;
    // before, Window.prototype inherits from EventTarget.prototype.
    windowProperties: !before(version, [24, 1, 2]),
    // Event handlers (event-handlers.js): before 22.1.0 jsdom lacks 19 of
    // GlobalEventHandlers' (oncopy, ontouchstart, ...; black box).
    legacyHandlers: before(version, [22, 1, 0]),
    // XMLHttpRequest (xhr.js): jsdom 28.0.0 moved it from Node's http
    // module to undici (event order, headers, bodies; black box 27.4.0 and
    // 28.0.0), and from 27.0.0 network errors are no longer reported on the
    // virtual console.
    // send() rejects views on a SharedArrayBuffer from 27.0.1; a response
    // charset naming the replacement encoding (iso-2022-kr) decodes to
    // U+FFFD from 27.4.0 (before: as UTF-8).
    xhrUndici: !before(version, [28, 0, 0]),
    xhrRejectsShared: !before(version, [27, 0, 1]),
    xhrReplacement: !before(version, [27, 4, 0]),
    urlParse: !before(version, [23, 0, 0]),
    paramValues: !before(version, [23, 0, 0]),
    setCookieList: !before(version, [24, 1, 0]),
    // BlobEvent's timecode without one in the init: 0 before 30.1.0, NaN from it.
    blobEventNaNTimecode: !before(version, [30, 1, 0]),
    // CSSMediaRule's and CSSSupportsRule's matches from 29.0.0,
    // CSSNestedDeclarations from 27.2.0.
    mediaRuleMatches: version[0] >= 29,
    nestedDeclarations: !before(version, [27, 2, 0]),
    // The shape of the CSS rule interfaces (cssom.js CSSOM_SHAPE and ACEMIR_SHAPE), black box
    // per release, by the CSSOM library jsdom loads: before 27.1.0 cssom and
    // rrweb-cssom ('cssom': CSSStyleRule extends CSSRule, data members on
    // the prototypes, CSSStyleRule.parse(); the CSSRule constants of rrweb-
    // cssom 0.6 before 24.1.0, 0.7 to 25.x, 0.8 from 26.0.0), from 27.1.0
    // to 28 @acemir/cssom ('acemir': type data and cssText on each rule
    // interface, constants on CSSRule.prototype); from 29 jsdom's own (null).
    cssomShape: cssomShape(version),
    // ElementInternals and attachInternals() from 23.1.0, its labels and
    // form-associated custom elements from 26.0.0; its role and ARIA
    // accessors throw before 27.0.0.
    elementInternals: !before(version, [23, 1, 0]),
    // Element's role and ARIA attribute accessors, also from 23.1.0
    // (black box: none in 16.4.0 to 23.0.1).
    ariaMixin: !before(version, [23, 1, 0]),
    internalsLabels: !before(version, [26, 0, 0]),
    internalsAria: !before(version, [27, 0, 0]),
    rootColor:
      version[0] >= 27
        ? 'rgb(0, 0, 0)'
        : css !== null && before(css, [4, 4, 0])
          ? ''
          : css !== null && before(css, [4, 6, 0])
            ? 'CanvasText'
            : 'canvastext',
  };
}

// Per-window setup: URL, location, history, and the legacy factory
// constructors Image, Audio and Option (their prototype is the element's).
export function setupWindow(window, { url: initial = 'about:blank', fastFrames = false, xhr = true } = {}) {
  const ws = window[S];
  // Option xhr: false leaves XMLHttpRequest out (window.js applyCompat).
  ws.xhr = xhr !== false;
  // Opt-in (option fastFrames): animation frames run as soon as the event
  // loop gets to them instead of every 16.7 ms of real time (see below).
  ws.fastFrames = fastFrames === true;
  ws.url = new URL(initial);
  ws.uaIndex = undefined; // the user agent sheet's index (ua-sheet.js)
  // DOMException is the platform's (shared by all windows); its subclass too.
  window.DOMException = DOMException;
  window.QuotaExceededError = QuotaExceededError;
  startClock(ws);
  setupConsole(window);
  setupWebSocket(window);
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
      set: lazyDataSetter(window, name, (value) =>
        Object.defineProperty(window, name, { value, writable: true, configurable: true }),
      ),
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
    value: cssNamespace((selector) => {
      try {
        compile(selector);
        return true;
      } catch {
        return false;
      }
    }),
    writable: true,
    configurable: true,
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
