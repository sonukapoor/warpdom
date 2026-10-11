// Jest environment: `testEnvironment: 'warpdom/jest'` (or a path to this
// file). Each test file runs in a VM context whose global object is a fresh
// warpdom window, as jest-environment-jsdom runs it in jsdom's window.
//
// The global has what jest-environment-jsdom's has: the window's members,
// and of Node's globals only those it also exposes (timers returning
// numeric ids, Buffer, URL, AbortController, Blob, File, Headers, crypto,
// performance, WebSocket, ...); not setImmediate, structuredClone,
// TextEncoder, fetch or streams, which test setups commonly polyfill.
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
import { installWindow } from './vitest.js';

// Node globals jest-environment-jsdom exposes too (beyond the DOM's own).
// AbortController and AbortSignal are the window's, as jsdom's are there.
const HOST_GLOBALS = ['Buffer', 'URL', 'URLSearchParams', 'queueMicrotask', 'atob', 'btoa',
  'Blob', 'File', 'Performance', 'performance', 'Headers', 'WebSocket', 'crypto', 'Crypto'];

// Jest's packages, through the project's jest (they are not hoisted with
// pnpm): jest -> @jest/core -> jest-config -> jest-environment-node.
function jestRequire(rootDir) {
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

// Timers with numeric ids, as a browser's (and jsdom's) give them.
function numericTimers(target) {
  const handles = new Map();
  let next = 1;
  const wrap = (set, clear) => {
    const start = (callback, delay, ...args) => {
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
  return () => { for (const h of handles.values()) { clearTimeout(h); clearInterval(h); } handles.clear(); };
}

// The jsdom generation to behave like: testEnvironmentOptions.jsdom, else
// the jsdom jest-environment-jsdom brings (26 with Jest 30), else 26.
function jsdomVersion(rootDir, options) {
  if (options.jsdom != null) return options.jsdom;
  try {
    const envRequire = createRequire(createRequire(join(rootDir, 'package.json')).resolve('jest-environment-jsdom/package.json'));
    return envRequire('jsdom/package.json').version;
  } catch {
    return 26;
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
    const window = createWindow({ url: options.url ?? 'http://localhost/', jsdom: jsdomVersion(projectConfig.rootDir ?? process.cwd(), options) });
    // An error thrown in an event listener fails the test, unless the test
    // listens for 'error' on the window (as with jest-environment-jsdom).
    window[S].onUnhandledError = (error) => {
      if (!userErrorListeners(window)) process.emit('uncaughtException', error);
    };
    const sandbox = {};
    this.restoreWindow = installWindow(sandbox, window);
    for (const name of HOST_GLOBALS) {
      // Values, not descriptors: some are lazy getters bound to Node's global (crypto).
      if (!(name in sandbox) && name in globalThis) Object.defineProperty(sandbox, name, { value: globalThis[name], writable: true, configurable: true });
    }
    this.clearTimers = numericTimers(sandbox);
    vm.createContext(sandbox);
    const global = vm.runInContext('this', sandbox);
    for (const key of ['window', 'self', 'top', 'parent', 'global']) {
      Object.defineProperty(sandbox, key, { value: global, writable: true, configurable: true });
    }
    Object.defineProperty(window.document, 'defaultView', { get: () => global, configurable: true });
    // Events at the window show the global as their target, as with jsdom.
    window[S].globalProxy = global;
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

  async teardown() {
    this.fakeTimers?.dispose();
    this.fakeTimersModern?.dispose();
    this.clearTimers?.();
    this.restoreWindow?.();
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
