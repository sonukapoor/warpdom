// Vitest environment: test.environment set to this file's path (exported as
// `environment` by 'warpdom/vitest/environment'; Vitest takes a path or a
// vitest-environment-<name> package). Installs a fresh warpdom window on the test file's
// global the way Vitest's jsdom environment installs jsdom's: window members
// become globals (functions bound to the window), window/self/top/parent and
// document.defaultView point at the global, and teardown restores the
// global. No dependency on Vitest itself, so any Vitest version works.
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { URL as NodeURL } from 'node:url';
import { Blob as NodeBlob } from 'node:buffer';
import { createWindow } from './node.js';
import { S } from './internal.js';
import { ablated, materializeAll } from './ablate.js';
import { setQueryCache } from './selectors.js';
import { resetWindow, snapshotWindow } from './reset.js';
import { HOST_TIMER_KEYS, warnNewerJsdom } from './window-features.js';
import { blobData } from './file-reader.js';

const SELF_KEYS = ['window', 'self', 'top', 'parent'];

// The global's EventTarget methods act on the window, as bound functions
// would, but respect another this (window.addEventListener.call(element,
// ...)), as the inherited EventTarget methods of a browser's window do.
const EVENT_TARGET_METHODS = ['addEventListener', 'removeEventListener', 'dispatchEvent'];
function eventTargetMethod(fn, window) {
  const method = { [fn.name](...args) {
    return fn.apply(this != null && this[S] !== undefined ? this : window, args);
  } }[fn.name];
  Object.defineProperty(method, 'length', { value: fn.length });
  return method;
}
const isClassLike = (key) => /^[A-Z]/.test(key);

// The value of a data property found on the object or its prototypes;
// undefined for accessors.
function dataValue(object, key) {
  for (let o = object; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, key);
    if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
  }
  return undefined;
}

// Window members a Vitest environment leaves to Node, as Vitest's jsdom
// environment does (so fetch accepts the signals tests create, and fake
// timers replace Node's timers).
export const VITEST_HOST_KEYS = ['AbortController', 'AbortSignal', ...HOST_TIMER_KEYS];

// Window members Vitest's jsdom environment leaves to Node in its other
// pools (forks, threads), not in the VM pools (black box, jsdom 20 to 30
// with Vitest 5): there crypto (with subtle), performance (with mark and
// measure), TextEncoder and TextDecoder are Node's, while Crypto,
// Performance, Blob and File are the window's.
export const VITEST_NODE_KEYS = ['crypto', 'performance', 'TextEncoder', 'TextDecoder'];
// In all its pools URLSearchParams and Headers are Node's, and URL is
// Vitest's own (vitestURL below); webkitURL stays the window's.
const VITEST_URL_KEYS = ['URL', 'URLSearchParams', 'Headers'];
// The window's WebSocket is the platform's (window-features.js): in the
// pools where the global is Node's own, the global keeps its WebSocket
// (the same object), which the window reads on first use. Replacing the
// global's would load Node's WebSocket client for every test file (its
// descriptor is lazy, ~10 ms) and make the window's read itself.
const VITEST_PLATFORM_KEYS = ['WebSocket'];
const VITEST_GLOBAL_HOST_KEYS = [...VITEST_HOST_KEYS, ...VITEST_NODE_KEYS, ...VITEST_URL_KEYS, ...VITEST_PLATFORM_KEYS];
const VITEST_VM_HOST_KEYS = [...VITEST_HOST_KEYS, ...VITEST_URL_KEYS];

// Vitest's jsdom environment's URL (black box, Vitest 5, jsdom 20 to 30,
// every pool): a subclass of Node's URL whose createObjectURL() takes the
// window's Blobs and Files too (as a Node Blob of their bytes and type);
// revokeObjectURL(), parse() and canParse() are Node's. One per window, so
// a test's URL.createObjectURL = vi.fn() stays in its file (the per-file
// reset puts the subclass's own properties back).
function vitestURL() {
  return class URL extends NodeURL {
    static createObjectURL(object) {
      const blob = blobData(object);
      return super.createObjectURL(blob ? new NodeBlob([blob.bytes], { type: blob.type }) : object);
    }
  };
}

// Defines URL on the global; returns restore() and reset().
function installURL(global) {
  const original = Object.getOwnPropertyDescriptor(global, 'URL');
  const URL = vitestURL();
  const define = () => Object.defineProperty(global, 'URL', { value: URL, writable: true, enumerable: false, configurable: true });
  define();
  const statics = new Map(Reflect.ownKeys(URL).map((key) => [key, Object.getOwnPropertyDescriptor(URL, key)]));
  const members = new Map(Reflect.ownKeys(URL.prototype).map((key) => [key, Object.getOwnPropertyDescriptor(URL.prototype, key)]));
  const put = (object, snapshot) => {
    for (const key of Reflect.ownKeys(object)) if (!snapshot.has(key)) Reflect.deleteProperty(object, key);
    for (const [key, descriptor] of snapshot) Reflect.defineProperty(object, key, descriptor);
  };
  return {
    restore() {
      delete global.URL;
      if (original) Object.defineProperty(global, 'URL', original);
    },
    reset() {
      put(URL, statics);
      put(URL.prototype, members);
      define();
    },
  };
}

// The per-file reset also forgets the marks and measures made on Node's
// performance (shared by the files of a worker), as a new worker would.
function clearHostTimeline(global) {
  const { performance } = global;
  if (typeof performance?.clearMarks === 'function') performance.clearMarks();
  if (typeof performance?.clearMeasures === 'function') performance.clearMeasures();
}

// Names Vitest's jsdom environment defines on the global from its key list
// even when the window lacks them, as getters that read the window: before
// jsdom 30 there is no CSS, and the global CSS reads undefined (Vuetify
// reads CSS?.supports at load); jsdom has no matchMedia, and a test that
// assigns Window.prototype.matchMedia makes the global one work (svelte's
// test helpers do).
export const VITEST_ALWAYS_KEYS = ['CSS', 'matchMedia', 'createPopup', 'scrollLeft', 'scrollTop'];

// Members of the window that are [LegacyUnforgeable] (WebIDL): own
// accessors of jsdom's window. Where the global is the window itself
// (Jest's environment, Vitest's VM pools), assigning document or window
// is ignored, also in strict code (a VM context's global does not throw),
// and assigning location navigates ([PutForwards=href]); downshift's tests
// replace global.document with a copy and rely on that. Vitest's other
// pools copy the window's members onto Node's global with setters, so
// there an assignment replaces the global's value, for jsdom too.
const UNFORGEABLE_KEYS = ['document', 'location'];

// Window members every environment leaves to the global object it
// installs the window on, as jsdom's environments do (black box): the
// console is the environment's (Jest's, Vitest's), and WebAssembly that of
// the global's realm.
const GLOBAL_OWN_KEYS = ['console', 'WebAssembly'];
const UNFORGEABLE_SELF_KEYS = ['window', 'top'];

export function installWindow(global, window, { hostKeys = [], alwaysKeys = [], unforgeable = false } = {}) {
  const originals = new Map();
  // The window's own members and those it inherits (Window.prototype,
  // EventTarget.prototype: addEventListener, dispatchEvent, ...).
  const names = new Set(Object.getOwnPropertyNames(window));
  for (let p = Object.getPrototypeOf(window); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) if (name !== 'constructor') names.add(name);
  }
  for (const key of alwaysKeys) names.add(key);
  const keys = [...names].filter((k) => !SELF_KEYS.includes(k) && !hostKeys.includes(k) && !GLOBAL_OWN_KEYS.includes(k));
  const overrides = new Map(); // key -> value assigned through the global
  for (const key of keys) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    // Methods (data properties) are bound once; accessors are read live and
    // not called here (localStorage throws for opaque origins).
    const value = dataValue(window, key);
    const bound = typeof value === 'function' && !isClassLike(key)
      ? (EVENT_TARGET_METHODS.includes(key) ? eventTargetMethod(value, window) : value.bind(window)) : null;
    if (unforgeable && UNFORGEABLE_KEYS.includes(key)) {
      Object.defineProperty(global, key, {
        get() { return window[key]; },
        set: key === 'location' ? (v) => { window.location.href = v; } : undefined,
        enumerable: true,
        configurable: true,
      });
      continue;
    }
    // Event handler attributes (onclick, ...) are read from the window: body
    // and frameset elements set the window's handlers too.
    if (value === undefined && key.startsWith('on') && !alwaysKeys.includes(key)) {
      Object.defineProperty(global, key, {
        get() { return window[key]; },
        set(v) { window[key] = v; },
        configurable: true,
      });
      continue;
    }
    // Assigning a member the window has only a getter for (performance,
    // which fake timers replace) changes the global's value and leaves the
    // window's alone, without the TypeError strict code would get
    // assigning it on the window.
    Object.defineProperty(global, key, {
      get() { return overrides.has(key) ? overrides.get(key) : bound ?? window[key]; },
      set(v) { overrides.set(key, v); Reflect.set(window, key, v); },
      configurable: true,
    });
  }
  for (const key of SELF_KEYS) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    if (unforgeable && UNFORGEABLE_SELF_KEYS.includes(key)) defineUnforgeableSelf(global, key, global);
    else Object.defineProperty(global, key, { value: global, writable: true, configurable: true });
  }
  Object.defineProperty(window.document, 'defaultView', { get: () => global, configurable: true });
  const restore = () => {
    for (const key of [...keys, ...SELF_KEYS]) delete global[key];
    for (const [key, descriptor] of originals) Object.defineProperty(global, key, descriptor);
  };
  // Forget values assigned to window members through the global (mocks of
  // matchMedia, scrollTo, ...), as a fresh window would.
  restore.resetOverrides = () => overrides.clear();
  return restore;
}

// window and top of a global that is the window: assignments are ignored.
export function defineUnforgeableSelf(target, key, value) {
  Object.defineProperty(target, key, { get: () => value, enumerable: true, configurable: true });
}

// Set by the environment for warpdom/vitest/reset (a setup file that runs
// before each test file): resets the window in place.
const RESET = Symbol.for('warpdom.vitest.reset');

const userErrorListeners = (window) => window[S].listeners?.get('error')?.length ?? 0;

// Node's host globals (timers, console, fetch, TextEncoder, ...): the
// global names of this realm that a fresh VM context lacks.
let hostGlobals = null;
function nodeHostGlobals() {
  if (!hostGlobals) {
    const intrinsics = new Set(vm.runInNewContext('Object.getOwnPropertyNames(globalThis)'));
    hostGlobals = Object.getOwnPropertyNames(globalThis).filter((name) => !intrinsics.has(name) && name !== 'globalThis');
  }
  return hostGlobals;
}

// The jsdom generation to behave like: environmentOptions.warpdom.jsdom,
// else the jsdom Vitest's jsdom environment would load (the project's,
// else one Vitest itself resolves), else warpdom's default. Also the
// cssstyle that jsdom loads (environmentOptions.warpdom.cssstyle
// overrides it): jsdom 26 and earlier behave like their cssstyle 4.x.
export function jsdomProfile(options, root = process.cwd()) {
  const set = options?.warpdom ?? {};
  const project = createRequire(join(root, 'package.json'));
  let path;
  try {
    path = project.resolve('jsdom/package.json');
  } catch {
    try {
      path = createRequire(project.resolve('vitest/package.json')).resolve('jsdom/package.json');
    } catch { /* no jsdom installed */ }
  }
  const read = (from, name) => { try { return createRequire(from)(`${name}/package.json`).version; } catch { return undefined; } };
  const installed = path ? read(path, 'jsdom') : undefined;
  if (set.jsdom == null) warnNewerJsdom(installed);
  return {
    jsdom: set.jsdom ?? installed,
    cssstyle: set.cssstyle ?? (path && set.jsdom == null ? read(path, 'cssstyle') : undefined),
  };
}

export const jsdomVersion = (options, root) => jsdomProfile(options, root).jsdom;

if (ablated('no-query-cache')) setQueryCache(false);

function createTestWindow(options) {
  // environmentOptions.warpdom.url, as environmentOptions.jsdom.url for
  // Vitest's jsdom environment, whose default is this URL as well.
  const window = createWindow({ url: options?.warpdom?.url ?? 'http://localhost:3000', ...(ablated('latest-profile') ? {} : jsdomProfile(options)), fastFrames: options?.warpdom?.fastFrames === true });
  if (ablated('eager-interfaces')) materializeAll(window);
  // Like Vitest's jsdom environment: an error thrown in an event listener
  // fails the test, unless the test listens for 'error' on the window.
  window[S].onUnhandledError = (error) => {
    if (!userErrorListeners(window)) process.emit('uncaughtException', error);
  };
  // Vitest's jsdom environment sends jsdom's virtual console to the console
  // of the environment's setup; the tests get another (a spy on their
  // console.error does not see "Not implemented" reports).
  const setupConsole = globalThis.console;
  window[S].reportNotImplemented = (text) => setupConsole.error(text);
  // Frames' consoles (the global's console is the test's) write there too.
  window[S].consoleTarget = setupConsole;
  return window;
}

// The project's Vitest major version, or 0 when it cannot be found.
function vitestMajor() {
  try {
    const require = createRequire(join(process.cwd(), 'package.json'));
    return Number(require('vitest/package.json').version.split('.')[0]) || 0;
  } catch {
    return 0;
  }
}

export default {
  name: 'warpdom',
  viteEnvironment: 'client',
  // Vitest 3 and earlier name the transform mode instead; Vitest 4 warns
  // about it for every test file, so it is given only to older versions.
  ...(vitestMajor() >= 4 ? {} : { transformMode: 'web' }),
  // Vitest's VM pools (vmThreads, vmForks): each test file runs in a VM
  // context whose global object is the window, as with jsdom's internal
  // context. Node's host globals are copied in, under warpdom's own members.
  async setupVM(options) {
    const window = createTestWindow(options);
    const sandbox = {};
    const restore = installWindow(sandbox, window, { hostKeys: VITEST_VM_HOST_KEYS, alwaysKeys: VITEST_ALWAYS_KEYS, unforgeable: true });
    installURL(sandbox);
    // The global's console starts as the window's, as jsdom's does there;
    // Vitest then assigns its own (black box: a non-enumerable property
    // with every jsdom).
    Object.defineProperty(sandbox, 'console', { value: window.console, writable: true, enumerable: false, configurable: true });
    for (const name of nodeHostGlobals()) {
      // Values, not descriptors: some are lazy getters bound to Node's global (crypto).
      if (!(name in sandbox)) Object.defineProperty(sandbox, name, { value: globalThis[name], writable: true, configurable: true });
    }
    vm.createContext(sandbox);
    const globalProxy = vm.runInContext('this', sandbox);
    for (const key of ['window', 'self', 'top', 'parent']) {
      if (UNFORGEABLE_SELF_KEYS.includes(key)) defineUnforgeableSelf(sandbox, key, globalProxy);
      else Object.defineProperty(sandbox, key, { value: globalProxy, writable: true, configurable: true });
    }
    Object.defineProperty(window.document, 'defaultView', { get: () => globalProxy, configurable: true });
    window[S].globalProxy = globalProxy;
    // Classic scripts run in the context, as jsdom's do (scripts.js).
    window[S].runScript = (source) => vm.runInContext(source, sandbox);
    return {
      getVmContext() { return sandbox; },
      teardown() { restore(); },
    };
  },
  setup(global, options) {
    let window = createTestWindow(options);
    let restore = installWindow(global, window, { hostKeys: VITEST_GLOBAL_HOST_KEYS, alwaysKeys: VITEST_ALWAYS_KEYS });
    const url = installURL(global);
    // Classic scripts run as global code of the realm the window is
    // installed in (scripts.js): an indirect eval.
    window[S].runScript = (source) => (0, eval)(source);
    snapshotWindow(window);
    global[RESET] = ablated('fresh-window')
      // Ablation: a new window per file instead of the in-place reset.
      ? () => {
        restore();
        window = createTestWindow(options);
        restore = installWindow(global, window, { hostKeys: VITEST_GLOBAL_HOST_KEYS, alwaysKeys: VITEST_ALWAYS_KEYS });
        url.reset();
        clearHostTimeline(global);
        window[S].runScript = (source) => (0, eval)(source);
      }
      : () => {
        restore.resetOverrides();
        resetWindow(window);
        url.reset();
        clearHostTimeline(global);
      };
    return {
      teardown() {
        delete global[RESET];
        restore();
        url.restore();
      },
    };
  },
};
