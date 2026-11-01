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
import { abortWindowRequests } from './xhr.js';
import { forgetLastList } from './collections.js';

const SELF_KEYS = ['window', 'self', 'top', 'parent'];

// The global's EventTarget methods act on the window, as bound functions
// would, but respect another this (window.addEventListener.call(element,
// ...)), as the inherited EventTarget methods of a browser's window do.
const EVENT_TARGET_METHODS = ['addEventListener', 'removeEventListener', 'dispatchEvent'];
function eventTargetMethod(fn, window) {
  const method = {
    [fn.name](...args) {
      return fn.apply(this != null && this[S] !== undefined ? this : window, args);
    },
  }[fn.name];
  Object.defineProperty(method, 'length', { value: fn.length });
  return method;
}
const isClassLike = (key) => /^[A-Z]/.test(key);

// The descriptor of a property found on the object or its prototypes.
function findDescriptor(object, key) {
  for (let o = object; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, key);
    if (descriptor) return descriptor;
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
  const define = () =>
    Object.defineProperty(global, 'URL', { value: URL, writable: true, enumerable: false, configurable: true });
  define();
  const statics = new Map(Reflect.ownKeys(URL).map((key) => [key, Object.getOwnPropertyDescriptor(URL, key)]));
  const members = new Map(
    Reflect.ownKeys(URL.prototype).map((key) => [key, Object.getOwnPropertyDescriptor(URL.prototype, key)]),
  );
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
  const keys = [...names].filter(
    (k) => !SELF_KEYS.includes(k) && !hostKeys.includes(k) && !GLOBAL_OWN_KEYS.includes(k),
  );
  const overrides = new Map(); // key -> value assigned through the global
  for (const key of keys) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    // Methods (data properties) are bound once; accessors are read live and
    // not called here (localStorage throws for opaque origins). Constructors
    // (webkitURL once read) are not bound.
    const descriptor = findDescriptor(window, key);
    const value = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    const bound =
      typeof value === 'function' && !isClassLike(key) && !Object.hasOwn(value, 'prototype')
        ? EVENT_TARGET_METHODS.includes(key)
          ? eventTargetMethod(value, window)
          : value.bind(window)
        : null;
    if (unforgeable && UNFORGEABLE_KEYS.includes(key)) {
      Object.defineProperty(global, key, {
        get() {
          return window[key];
        },
        set:
          key === 'location'
            ? (v) => {
                window.location.href = v;
              }
            : undefined,
        enumerable: true,
        configurable: true,
      });
      continue;
    }
    // Where the global is the window, the window's data properties that
    // are not functions (name; status and the viewport members before jsdom
    // 27) are the global's own, as on jsdom's window: writable, enumerable
    // and configurable, so Object.defineProperty(window, 'innerWidth',
    // { value: 500 }) leaves them writable. Assignments stay on the global.
    if (unforgeable && descriptor && 'value' in descriptor && typeof value !== 'function' && !isClassLike(key)) {
      Object.defineProperty(global, key, { ...descriptor });
      continue;
    }
    // Event handler attributes (onclick, ...) are read from the window: body
    // and frameset elements set the window's handlers too.
    if (value === undefined && key.startsWith('on') && !alwaysKeys.includes(key)) {
      Object.defineProperty(global, key, {
        get() {
          return window[key];
        },
        set(v) {
          window[key] = v;
        },
        configurable: true,
      });
      continue;
    }
    // Assigning a member the window has only a getter for (performance,
    // which fake timers replace) changes the global's value and leaves the
    // window's alone, without the TypeError strict code would get
    // assigning it on the window. Where the global is the window, its
    // accessors are enumerable as the window's members are, and an
    // assignment the window takes is the window's: a member it replaces
    // with a data property (innerWidth from jsdom 27, external, a method,
    // an interface object) becomes the same data property of the global,
    // and one it keeps an accessor (status) is read from the window.
    const accepts =
      unforgeable &&
      descriptor !== undefined &&
      ('value' in descriptor ? descriptor.writable : descriptor.set !== undefined);
    Object.defineProperty(global, key, {
      get() {
        return overrides.has(key) ? overrides.get(key) : (bound ?? window[key]);
      },
      set: accepts
        ? (v) => {
            Reflect.set(window, key, v);
            const own = Object.getOwnPropertyDescriptor(window, key);
            if (own && 'value' in own) Object.defineProperty(global, key, { ...own });
          }
        : (v) => {
            overrides.set(key, v);
            Reflect.set(window, key, v);
          },
      // Elsewhere (Vitest's forks and threads pools) a global the window's
      // member replaces keeps its enumerability (Node's navigator stays in
      // Object.keys(globalThis)) and a new one is not enumerable, as with
      // Vitest's jsdom environment (black box: jsdom 20.0.3, 26.1.0, 30.1.3).
      enumerable: unforgeable ? descriptor !== undefined && descriptor.enumerable : (original?.enumerable ?? false),
      configurable: true,
    });
  }
  for (const key of SELF_KEYS) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    defineSelfKey(global, key, global, window, unforgeable);
  }
  Object.defineProperty(window.document, 'defaultView', { get: () => global, configurable: true });
  // The global's window members, for restore and the per-file reset.
  keys.push(...SELF_KEYS);
  const restore = () => {
    for (const key of keys) delete global[key];
    for (const [key, descriptor] of originals) Object.defineProperty(global, key, descriptor);
  };
  // Forget values assigned to window members through the global (mocks of
  // matchMedia, scrollTo, ...), as a fresh window would.
  restore.resetOverrides = () => overrides.clear();
  restore.keys = keys;
  return restore;
}

// window and top of a global that is the window: assignments are ignored.
export function defineUnforgeableSelf(target, key, value) {
  Object.defineProperty(target, key, { get: () => value, enumerable: true, configurable: true });
}

// window, self, top and parent of the global (black box, Vitest 5 with jsdom
// 20.0.3, 26.1.0 and 30.1.3). Where the global is the window (unforgeable:
// Jest, Vitest's VM pools): window and top have only a getter; self and
// parent are accessors whose setter replaces them with a data property
// ([Replaceable]) from jsdom 21, getters only in jsdom 20; enumerable,
// configurable. Their setters, as the global's other setters, replace the
// global's member whatever this is, as jsdom's do (called on another
// object); an assignment through an object that inherits from the global
// does not reach them: the VM context's global gives that object its own
// property, as jsdom's up to 26 (from 27 jsdom's replaces the global's
// member, #90). Elsewhere (Vitest's other pools): writable, enumerable,
// configurable data properties.
export function defineSelfKey(target, key, value, window, unforgeable) {
  const data = (v) =>
    Object.defineProperty(target, key, { value: v, writable: true, enumerable: true, configurable: true });
  if (!unforgeable) data(value);
  else if (UNFORGEABLE_SELF_KEYS.includes(key)) defineUnforgeableSelf(target, key, value);
  else
    Object.defineProperty(target, key, {
      get: () => value,
      set: window[S].compat.jsdom >= 21 ? data : undefined,
      enumerable: true,
      configurable: true,
    });
}

// Set by the environment for warpdom/vitest/reset (a setup file that runs
// before each test file): resets the window in place.
const RESET = Symbol.for('warpdom.vitest.reset');
// Called by that setup file when the file's tests start (a beforeAll hook):
// the global's own properties then are the file's setup (setup files and
// the modules loaded so far, which load once per worker without isolation:
// deleting what they set would leave later files without it). Those added
// after it (window.x = 1 in a test or hook; outside the VM pools the
// window is the worker's global) are removed by the next file's reset.
const MARK = Symbol.for('warpdom.vitest.mark');
// Called by that setup file's wrappers of vi.stubGlobal and vi.spyOn
// (on the global) with the key about to be mocked, and whether Vitest
// takes the key's descriptor then as the mock's original (the first stub
// since vi.unstubAllGlobals, a spy of a member no spy replaces): before
// the mark, that descriptor is what Vitest's cleanup puts back (#201).
const MOCKING = Symbol.for('warpdom.vitest.mocking');

// The descriptors of the global's window members.
const memberDescriptors = (global, members) =>
  new Map(members.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));

// The global's own properties when a file's tests start (MARK), and the
// descriptors of its window members then.
function markGlobal(global, members) {
  return { keys: new Set(Reflect.ownKeys(global)), members: memberDescriptors(global, members) };
}

const sameDescriptor = (a, b) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.get === b.get &&
    a.set === b.set &&
    Object.is(a.value, b.value) &&
    a.writable === b.writable &&
    a.enumerable === b.enumerable &&
    a.configurable === b.configurable);

// Istanbul's coverage objects (Vitest's coverage-istanbul, and the default
// name): created by the first instrumented module loaded, possibly in a
// test (a dynamic import), and collected when the worker ends.
const KEPT_GLOBAL_KEYS = new Set(['__VITEST_COVERAGE__', '__coverage__']);

// Puts the global back as marked: properties added since are deleted, and
// window members a test redefined or deleted (Object.defineProperty(window,
// 'innerWidth', { value: 500 })) get their descriptor back. Other
// properties the global had are Node's and Vitest's (fetch, the worker's
// state), left alone. A property made non-configurable stays (as in
// resetWindow). A member that is again as it was before the file's setup
// files ran (start), or before its setup mocked it (mocked), stays:
// Vitest's cleanup (vitest-reset.js, before this) or the file's tests
// undid a stub or spy its setup made (vi.stubGlobal, vi.spyOn(window,
// 'innerWidth', 'get')), and putting that back would make the next setup's
// stub take it as the original value. The two differ when a module loaded
// once changed the member before the stub (#201). Setup files run again
// before the next file, and make their changes again.
function restoreGlobal(global, mark, start, mocked) {
  if (!mark) return;
  const undone = (key, current) =>
    (start?.has(key) && sameDescriptor(current, start.get(key))) ||
    (mocked.has(key) && sameDescriptor(current, mocked.get(key)));
  for (const key of Reflect.ownKeys(global))
    if (!mark.keys.has(key) && !KEPT_GLOBAL_KEYS.has(key)) Reflect.deleteProperty(global, key);
  for (const [key, descriptor] of mark.members) {
    const current = Object.getOwnPropertyDescriptor(global, key);
    if (sameDescriptor(current, descriptor) || undone(key, current)) continue;
    if (!descriptor) Reflect.deleteProperty(global, key);
    else Reflect.defineProperty(global, key, descriptor);
  }
}

// The per-file reset's state for each global: the mark (taken when a
// file's tests start, used once by the next file's reset), the window
// members' descriptors when the file's setup files start, the
// descriptors of the global's keys the setup mocked, before the first
// mock of each (cleared by each reset), and those the last setup()
// installed (used once, by the reset after it). Kept per
// global, not per setup(): Vitest 3 (measured: 3.2.4) tears the
// environment down and calls setup() again for every file of a shared
// worker, and the next file's reset then belongs to a new setup (#196).
// Vitest 4 and 5 call it once per worker.
const fileStates = new WeakMap();
function fileState(global) {
  let state = fileStates.get(global);
  if (!state) fileStates.set(global, (state = { mark: null, start: null, mocked: new Map(), installed: null }));
  return state;
}

// A setup() after another's teardown (Vitest 3) installs a new window: its
// members are new, so the next reset only removes the properties added
// since the mark; putting back the marked members would put back the
// previous window's.
function startSetup(global, members) {
  const state = fileState(global);
  if (state.mark) state.mark = { keys: state.mark.keys, members: new Map() };
  state.start = null;
  state.installed = memberDescriptors(global, members);
  return state;
}

// The members setup() installed, put back where something changed them
// before the reset: Vitest's cleanup (vitest-reset.js) restores what the
// previous file stubbed (vi.stubGlobal('document', ...)) as it was then,
// the previous window's on Vitest 3; the mark's deletions remove a member
// the previous file's imports deleted before its mark (modules stay
// loaded), which the new window has again. Vitest 4 and 5 change none
// before the first reset (measured: 4.1.12, 5.0.3).
function restoreInstalled(global, installed) {
  for (const [key, descriptor] of installed)
    if (descriptor && !sameDescriptor(Object.getOwnPropertyDescriptor(global, key), descriptor))
      Reflect.defineProperty(global, key, descriptor);
}

const userErrorListeners = (window) => window[S].listeners?.get('error')?.length ?? 0;

// Node's host globals (timers, console, fetch, TextEncoder, ...): the
// global names of this realm that a fresh VM context lacks.
let hostGlobals = null;
function nodeHostGlobals() {
  if (!hostGlobals) {
    const intrinsics = new Set(vm.runInNewContext('Object.getOwnPropertyNames(globalThis)'));
    hostGlobals = Object.getOwnPropertyNames(globalThis).filter(
      (name) => !intrinsics.has(name) && name !== 'globalThis',
    );
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
    } catch {
      /* no jsdom installed */
    }
  }
  const read = (from, name) => {
    try {
      return createRequire(from)(`${name}/package.json`).version;
    } catch {
      return undefined;
    }
  };
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
  const window = createWindow({
    url: options?.warpdom?.url ?? 'http://localhost:3000',
    ...(ablated('latest-profile') ? {} : jsdomProfile(options)),
    fastFrames: options?.warpdom?.fastFrames === true,
    xhr: options?.warpdom?.xhr !== false,
  });
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
  // jsdom's virtual console errors (a frame's uncaught listener
  // exceptions) are logged there too, and do not fail the test.
  window[S].reportError = (error) => setupConsole.error(error);
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
    const restore = installWindow(sandbox, window, {
      hostKeys: VITEST_VM_HOST_KEYS,
      alwaysKeys: VITEST_ALWAYS_KEYS,
      unforgeable: true,
    });
    installURL(sandbox);
    // The global's console starts as the window's, as jsdom's does there;
    // Vitest then assigns its own (black box: a non-enumerable property
    // with every jsdom).
    Object.defineProperty(sandbox, 'console', {
      value: window.console,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    for (const name of nodeHostGlobals()) {
      // Values, not descriptors: some are lazy getters bound to Node's global (crypto).
      if (!(name in sandbox))
        Object.defineProperty(sandbox, name, { value: globalThis[name], writable: true, configurable: true });
    }
    vm.createContext(sandbox);
    const globalProxy = vm.runInContext('this', sandbox);
    for (const key of SELF_KEYS) defineSelfKey(sandbox, key, globalProxy, window, true);
    Object.defineProperty(window.document, 'defaultView', { get: () => globalProxy, configurable: true });
    window[S].globalProxy = globalProxy;
    // Classic scripts run in the context, as jsdom's do (scripts.js).
    window[S].runScript = (source) => vm.runInContext(source, sandbox);
    return {
      getVmContext() {
        return sandbox;
      },
      teardown() {
        abortWindowRequests(window);
        forgetLastList();
        restore();
      },
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
    const state = startSetup(global, restore.keys);
    global[MARK] = () => {
      state.mark = markGlobal(global, restore.keys);
    };
    // Between a reset and the mark (the setup files and imports): mocks
    // made later are a test's, undone to what the mark keeps. A mock the
    // setup undid and made again takes the member as it is then (a module
    // loaded in between may have changed it), as Vitest does.
    global[MOCKING] = (key, original) => {
      if (!state.mark && (original || !state.mocked.has(key)))
        state.mocked.set(key, Object.getOwnPropertyDescriptor(global, key));
    };
    global[RESET] = ablated('fresh-window')
      ? // Ablation: a new window per file instead of the in-place reset.
        () => {
          restoreGlobal(global, state.mark, state.start, state.mocked);
          state.mark = null;
          state.mocked.clear();
          restore();
          window = createTestWindow(options);
          restore = installWindow(global, window, {
            hostKeys: VITEST_GLOBAL_HOST_KEYS,
            alwaysKeys: VITEST_ALWAYS_KEYS,
          });
          url.reset();
          clearHostTimeline(global);
          window[S].runScript = (source) => (0, eval)(source);
          state.start = memberDescriptors(global, restore.keys);
        }
      : () => {
          restoreGlobal(global, state.mark, state.start, state.mocked);
          state.mocked.clear();
          if (state.installed) restoreInstalled(global, state.installed);
          state.installed = null;
          // Used once: a file whose tests all skip takes no mark, and an
          // older one would delete what its imports set (modules stay loaded).
          state.mark = null;
          restore.resetOverrides();
          resetWindow(window);
          url.reset();
          clearHostTimeline(global);
          state.start = memberDescriptors(global, restore.keys);
        };
    return {
      teardown() {
        delete global[RESET];
        delete global[MARK];
        delete global[MOCKING];
        // Requests still running stop without events, as closing jsdom's window stops them.
        abortWindowRequests(window);
        forgetLastList();
        restore();
        url.restore();
      },
    };
  },
};
