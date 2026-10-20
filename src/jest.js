// Jest environment: `testEnvironment: 'warpdom/jest'` (or a path to this
// file). Each test file runs in a VM context whose global object is a fresh
// warpdom window, as jest-environment-jsdom runs it in jsdom's window.
//
// The global has what jest-environment-jsdom's has: the window's members,
// and of Node's globals only those it also exposes (timers returning
// numeric ids, Buffer, ...); not setImmediate, structuredClone, fetch or
// streams, which test setups commonly polyfill. crypto, performance, Blob,
// File, URL, URLSearchParams, Headers, AbortController, and TextEncoder
// and TextDecoder from jsdom 27.4, are the window's, as jsdom's are there
// (no URL.createObjectURL); so is WebSocket, which is Node's. console is
// Jest's, and WebAssembly the test file's realm's.
// Jest's own parts (fake timers, module mocker, common globals) come from
// the project's Jest install, so warpdom keeps no runtime dependency on
// Jest.
//
// Node only (Jest integration).
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createWindow } from './node.js';
import { S } from './internal.js';
import { installWindow, defineUnforgeableSelf } from './vitest.js';
import { ablated, materializeAll } from './ablate.js';
import { setQueryCache } from './selectors.js';
import { warnNewerJsdom } from './window-features.js';

if (ablated('no-query-cache')) setQueryCache(false);

// Node globals jest-environment-jsdom exposes too (beyond the DOM's own).
// WebSocket is the window's, which is Node's (window-features.js); copied
// from Node only if the window has none.
const HOST_GLOBALS = ['Buffer', 'queueMicrotask', 'atob', 'btoa', 'WebSocket'];

// Jest's packages (jest-util, jest-mock, @jest/fake-timers), from the Jest
// that is running: jest-runner loads jest-runtime before it builds the
// environment, and jest-runtime depends on all three (Jest 27 to 30). From
// the project instead, a monorepo with several Jest versions can hand this
// Jest another's (pnpm's .bin shims put node_modules/.pnpm/node_modules,
// where any version may be hoisted, on NODE_PATH).
const moduleCache = createRequire(import.meta.url).cache;
const JEST_RUNTIME = /[\\/]jest-runtime[\\/]build[\\/]index\.js$/;

function runningJestRequire() {
  let runtime;
  for (const key in moduleCache) if (JEST_RUNTIME.test(key)) runtime = key;
  if (!runtime) return null;
  const require = createRequire(runtime);
  try {
    for (const name of ['jest-util', 'jest-mock', '@jest/fake-timers']) require.resolve(name);
  } catch {
    return null;
  }
  return require;
}

// Otherwise (no Jest running, as in warpdom's own tests) through the
// project's jest (they are not hoisted with pnpm): jest -> @jest/core ->
// jest-config -> jest-environment-node.
function jestRequire(rootDir) {
  const running = runningJestRequire();
  if (running) return running;
  let require = createRequire(join(rootDir, 'package.json'));
  try {
    require.resolve('@jest/fake-timers');
    return require;
  } catch { /* through jest's dependencies */ }
  try {
    require.resolve('jest/package.json');
  } catch {
    return require;
  }
  for (const name of ['jest', '@jest/core', 'jest-config', 'jest-environment-node']) {
    require = createRequire(require.resolve(`${name}/package.json`));
  }
  return require;
}

// Timers with numeric ids, as a browser's (and jsdom's) give them. The
// returned close() cancels the pending ones; after it, new timers do
// nothing and get id 0, as on a closed jsdom window.
function numericTimers(target) {
  const handles = new Map();
  let next = 1;
  let closed = false;
  const wrap = (set, clear) => {
    const start = (callback, delay, ...args) => {
      if (closed) return 0;
      const id = next++;
      const handle = set((...a) => {
        if (set === setTimeout) handles.delete(id);
        if (typeof callback === 'function') callback(...a);
      }, delay, ...args);
      handles.set(id, handle);
      return id;
    };
    const stop = (id) => {
      const handle = handles.get(id);
      if (handle !== undefined) { clear(handle); handles.delete(id); }
    };
    return [start, stop];
  };
  const [setT, clearT] = wrap(setTimeout, clearTimeout);
  const [setI, clearI] = wrap(setInterval, clearInterval);
  Object.assign(target, { setTimeout: setT, clearTimeout: clearT, setInterval: setI, clearInterval: clearI });
  // A shared clear works for either kind, as in browsers.
  target.clearTimeout = target.clearInterval = (id) => { clearT(id); clearI(id); };
  return () => { closed = true; for (const h of handles.values()) { clearTimeout(h); clearInterval(h); } handles.clear(); };
}

// The members a closed jsdom window reads as undefined (black box, jsdom
// 20 to 29 through jest-environment-jsdom, whose teardown closes the
// window): its document and what hangs off it.
const CLOSED_WINDOW_UNDEFINED = ['document', 'location', 'history', 'localStorage', 'sessionStorage'];

// The jsdom generation to behave like: testEnvironmentOptions.jsdom, else
// the jsdom jest-environment-jsdom brings (26 with Jest 30), else 26; and
// the cssstyle that jsdom loads (testEnvironmentOptions.cssstyle overrides).
function jsdomProfile(rootDir, options) {
  if (options.jsdom != null) return { jsdom: options.jsdom, cssstyle: options.cssstyle };
  try {
    const envRequire = createRequire(createRequire(join(rootDir, 'package.json')).resolve('jest-environment-jsdom/package.json'));
    const jsdomRequire = createRequire(envRequire.resolve('jsdom/package.json'));
    let cssstyle = options.cssstyle;
    try { cssstyle ??= jsdomRequire('cssstyle/package.json').version; } catch { /* not found */ }
    const jsdom = jsdomRequire('./package.json').version;
    warnNewerJsdom(jsdom);
    return { jsdom, cssstyle };
  } catch {
    return { jsdom: 26, cssstyle: options.cssstyle };
  }
}

const userErrorListeners = (window) => window[S].listeners?.get('error')?.length ?? 0;

export default class WarpdomEnvironment {
  constructor(config, context) {
    // Jest 28+ passes { globalConfig, projectConfig }; older versions the project config.
    const projectConfig = config.projectConfig ?? config;
    const require = jestRequire(projectConfig.rootDir ?? process.cwd());
    const { installCommonGlobals } = require('jest-util');
    const { ModuleMocker } = require('jest-mock');
    const { LegacyFakeTimers, ModernFakeTimers } = require('@jest/fake-timers');
    const options = projectConfig.testEnvironmentOptions ?? {};

    // jest-environment-jsdom's default URL.
    const window = createWindow({ url: options.url ?? 'http://localhost/', ...(ablated('latest-profile') ? {} : jsdomProfile(projectConfig.rootDir ?? process.cwd(), options)), fastFrames: options.fastFrames === true });
    if (ablated('eager-interfaces')) materializeAll(window);
    // An error thrown in an event listener fails the test, unless the test
    // listens for 'error' on the window (as with jest-environment-jsdom).
    window[S].onUnhandledError = (error) => {
      if (!userErrorListeners(window)) process.emit('uncaughtException', error);
    };
    const sandbox = {};
    installWindow(sandbox, window, { unforgeable: true });
    for (const name of HOST_GLOBALS) {
      // Values, not descriptors: some are lazy getters bound to Node's global (crypto).
      if (!(name in sandbox) && name in globalThis) Object.defineProperty(sandbox, name, { value: globalThis[name], writable: true, configurable: true });
    }
    this.clearTimers = numericTimers(sandbox);
    vm.createContext(sandbox);
    const global = vm.runInContext('this', sandbox);
    for (const key of ['window', 'self', 'top', 'parent', 'global']) {
      if (key === 'window' || key === 'top') defineUnforgeableSelf(sandbox, key, global);
      else Object.defineProperty(sandbox, key, { value: global, writable: true, configurable: true });
    }
    Object.defineProperty(window.document, 'defaultView', { get: () => global, configurable: true });
    // As jest-environment-jsdom: "Not implemented" reports go to the test's
    // console as Error objects (tests spy on console.error and read the
    // message).
    window[S].reportNotImplemented = (text) => {
      const error = new Error(text);
      error.type = 'not implemented';
      global.console?.error(error);
    };
    // The window's console (frames') writes to the test's console, where
    // jest-environment-jsdom sends jsdom's virtual console.
    window[S].consoleTarget = context?.console ?? globalThis.console;
    // Events at the window show the global as their target, as with jsdom.
    window[S].globalProxy = global;
    // Classic scripts run in the context, as jsdom's do (scripts.js).
    window[S].runScript = (source) => vm.runInContext(source, sandbox);
    this.context = sandbox;
    this.global = global;
    this.window = window;
    installCommonGlobals(global, projectConfig.globals ?? {});

    this.moduleMocker = new ModuleMocker(global);
    this.fakeTimers = new LegacyFakeTimers({
      config: projectConfig, global, moduleMocker: this.moduleMocker,
      timerConfig: { idToRef: (id) => id, refToId: (ref) => ref },
    });
    this.fakeTimersModern = new ModernFakeTimers({ config: projectConfig, global });
    this.customExportConditions = options.customExportConditions ?? ['browser'];
  }

  async setup() {}

  // As jest-environment-jsdom's, which closes the window: the global keeps
  // its members (interfaces, queueMicrotask, timers that now do nothing),
  // so code still running after the test file (a library's promise chain
  // calling queueMicrotask, Dexie's) does not fail with a ReferenceError
  // that crashes the worker. The document and its parts read undefined,
  // and the window's event listeners are gone.
  async teardown() {
    this.fakeTimers?.dispose();
    this.fakeTimersModern?.dispose();
    this.clearTimers?.();
    if (this.context) {
      for (const key of CLOSED_WINDOW_UNDEFINED) {
        Object.defineProperty(this.context, key, { get: () => undefined, enumerable: true, configurable: true });
      }
    }
    this.window?.[S].listeners?.clear();
    this.global = null;
    this.context = null;
    this.window = null;
  }

  exportConditions() {
    return this.customExportConditions;
  }

  getVmContext() {
    return this.context;
  }
}
