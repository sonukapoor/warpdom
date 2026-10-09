// Vitest environment: `environment: 'warpdom'` (via vitest-environment-warpdom)
// or a path to this file. Installs a fresh warpdom window on the test file's
// global the way Vitest's jsdom environment installs jsdom's: window members
// become globals (functions bound to the window), window/self/top/parent and
// document.defaultView point at the global, and teardown restores the
// global. No dependency on Vitest itself, so any Vitest version works.
import { createWindow } from './node.js';
import { S } from './internal.js';

const SELF_KEYS = ['window', 'self', 'top', 'parent'];
const isClassLike = (key) => /^[A-Z]/.test(key);

export function installWindow(global, window) {
  const originals = new Map();
  // The window's own members and those it inherits (Window.prototype,
  // EventTarget.prototype: addEventListener, dispatchEvent, ...).
  const names = new Set(Object.getOwnPropertyNames(window));
  for (let p = Object.getPrototypeOf(window); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) if (name !== 'constructor') names.add(name);
  }
  const keys = [...names].filter((k) => !SELF_KEYS.includes(k));
  for (const key of keys) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    const value = window[key];
    const bound = typeof value === 'function' && !isClassLike(key) ? value.bind(window) : null;
    let override;
    let overridden = false;
    Object.defineProperty(global, key, {
      get() { return overridden ? override : bound ?? window[key]; },
      set(v) { overridden = true; override = v; window[key] = v; },
      configurable: true,
    });
  }
  for (const key of SELF_KEYS) {
    const original = Object.getOwnPropertyDescriptor(global, key);
    if (original) originals.set(key, original);
    Object.defineProperty(global, key, { value: global, writable: true, configurable: true });
  }
  Object.defineProperty(window.document, 'defaultView', { get: () => global, configurable: true });
  return () => {
    for (const key of [...keys, ...SELF_KEYS]) delete global[key];
    for (const [key, descriptor] of originals) Object.defineProperty(global, key, descriptor);
  };
}

const userErrorListeners = (window) => window[S].listeners?.get('error')?.length ?? 0;

export default {
  name: 'warpdom',
  viteEnvironment: 'client',
  // Vitest 3 and earlier name the transform mode instead.
  transformMode: 'web',
  setup(global) {
    // Vitest's jsdom environment defaults to this URL as well.
    const window = createWindow({ url: 'http://localhost:3000' });
    // Like Vitest's jsdom environment: an error thrown in an event listener
    // fails the test, unless the test listens for 'error' on the window.
    window[S].onUnhandledError = (error) => {
      if (!userErrorListeners(window)) process.emit('uncaughtException', error);
    };
    const restore = installWindow(global, window);
    return { teardown() { restore(); } };
  },
};
