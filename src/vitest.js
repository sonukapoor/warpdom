// Vitest environment: `environment: 'warpdom'` (via vitest-environment-warpdom)
// or a path to this file. Installs a fresh warpdom window on the test file's
// global the way Vitest's jsdom environment installs jsdom's: window members
// become globals (functions bound to the window), window/self/top/parent and
// document.defaultView point at the global, and teardown restores the
// global. No dependency on Vitest itself, so any Vitest version works.
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createWindow } from './node.js';
import { S } from './internal.js';
import { resetWindow, snapshotWindow } from './reset.js';

const SELF_KEYS = ['window', 'self', 'top', 'parent'];
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

export function installWindow(global, window) {
  const originals = new Map();
  // The window's own members and those it inherits (Window.prototype,
  // EventTarget.prototype: addEventListener, dispatchEvent, ...).
  const names = new Set(Object.getOwnPropertyNames(window));
  for (let p = Object.getPrototypeOf(window); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) if (name !== 'constructor') names.add(name);
  }
  const keys = [...names].filter((k) => !SELF_KEYS.includes(k));
  const overrides = new Map(); // key -> value assigned through the global
  for (const key of keys) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    // Methods (data properties) are bound once; accessors are read live and
    // not called here (localStorage throws for opaque origins).
    const value = dataValue(window, key);
    const bound = typeof value === 'function' && !isClassLike(key) ? value.bind(window) : null;
    Object.defineProperty(global, key, {
      get() { return overrides.has(key) ? overrides.get(key) : bound ?? window[key]; },
      set(v) { overrides.set(key, v); window[key] = v; },
      configurable: true,
    });
  }
  for (const key of SELF_KEYS) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    Object.defineProperty(global, key, { value: global, writable: true, configurable: true });
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

function createTestWindow() {
  // Vitest's jsdom environment defaults to this URL as well.
  const window = createWindow({ url: 'http://localhost:3000' });
  // Like Vitest's jsdom environment: an error thrown in an event listener
  // fails the test, unless the test listens for 'error' on the window.
  window[S].onUnhandledError = (error) => {
    if (!userErrorListeners(window)) process.emit('uncaughtException', error);
  };
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
  async setupVM() {
    const window = createTestWindow();
    const sandbox = {};
    const restore = installWindow(sandbox, window);
    for (const name of nodeHostGlobals()) {
      if (!(name in sandbox)) Object.defineProperty(sandbox, name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    vm.createContext(sandbox);
    const globalProxy = vm.runInContext('this', sandbox);
    for (const key of ['window', 'self', 'top', 'parent']) {
      Object.defineProperty(sandbox, key, { value: globalProxy, writable: true, configurable: true });
    }
    Object.defineProperty(window.document, 'defaultView', { get: () => globalProxy, configurable: true });
    return {
      getVmContext() { return sandbox; },
      teardown() { restore(); },
    };
  },
  setup(global) {
    const window = createTestWindow();
    const restore = installWindow(global, window);
    snapshotWindow(window);
    global[RESET] = () => {
      restore.resetOverrides();
      resetWindow(window);
    };
    return {
      teardown() {
        delete global[RESET];
        restore();
      },
    };
  },
};
