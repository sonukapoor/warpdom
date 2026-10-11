// Engine adapters: a window for one test page, a way to run classic
// scripts in it, and error reporting (an uncaught exception fires an
// ErrorEvent at the window, which testharness.js listens for).
//
// warpdom runs the way its Vitest environment installs it by default: the
// window's members are installed on the global object of the realm (the
// child process's own), so scripts, warpdom and the built-in objects share
// one realm (assert_throws_js compares constructors, which needs that).
// jsdom is used as a black box through its public API: a JSDOM whose
// scripts are run from outside, in its own VM context.
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function createEngine(name, { url, warpdomDir, log }) {
  if (name === 'warpdom') return createWarpdom(url, warpdomDir, log);
  if (name === 'jsdom') return createJsdom(url, warpdomDir, log);
  throw new Error(`unknown engine ${name}`);
}

async function createWarpdom(url, warpdomDir, log) {
  const src = (file) => import(pathToFileURL(join(warpdomDir, 'src', file)).href);
  const [{ createWindow }, { installWindow, VITEST_HOST_KEYS }, { S }, events] = await Promise.all([
    src('node.js'), src('vitest.js'), src('internal.js'), src('events.js'),
  ]);
  const window = createWindow({ url });
  // As the Vitest environment: the host's timers stay (warpdom's window
  // timers are built on them).
  installWindow(globalThis, window, { hostKeys: VITEST_HOST_KEYS });
  // installWindow makes every window member an accessor on the global (so
  // mocks assigned to the global reach the window). WebIDL makes interface
  // objects data properties of the global, and idlharness.js checks that,
  // so interface objects are installed as the window has them (reading
  // each creates the interface).
  for (const key of Object.getOwnPropertyNames(window)) {
    if (!/^[A-Z]/.test(key)) continue;
    const value = window[key];
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    if (typeof value !== 'function' && typeof value !== 'object') continue;
    Object.defineProperty(globalThis, key, 'value' in descriptor ? descriptor : { value, writable: true, enumerable: false, configurable: true });
  }
  // Named access (window[id], and ids as global variables): the global is
  // the window here, as in a browser. Checkouts before named access lack it.
  const namedAccess = await src('named-access.js').catch(() => null);
  namedAccess?.installNamedAccess(globalThis, window);
  // Events at the window report the global as their target and current target.
  window[S].globalProxy = globalThis;
  window[S].onUnhandledError = (error) => log(`unhandled error: ${error?.stack ?? error}`);
  window[S].notImplemented = (message) => log(`not implemented: ${message}`);
  return {
    global: globalThis,
    window: globalThis,
    evaluate: (code, filename) => vm.runInThisContext(code, { filename }),
    evaluateModule: (code, url, load) => evaluateModule(code, url, undefined, load),
    reportError: (error) => events.reportError(window, error),
    // Events the page load fires (DOMContentLoaded, load, a script's load
    // and error) are trusted in a browser; warpdom can fire them so.
    fire: (target, event) => events.dispatch(target === globalThis ? window : target, event),
    dispatchRejection: (reason, promise) => dispatchRejection(globalThis, reason, promise),
  };
}

async function createJsdom(url, warpdomDir, log) {
  const require = createRequire(join(warpdomDir, 'package.json'));
  const { JSDOM, VirtualConsole } = require('jsdom');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => log(`jsdom: ${error?.message ?? error}`));
  // 'outside-only': the harness runs the scripts. With 'dangerously' jsdom
  // also executes script elements moved from the DOMParser document, so
  // every script would run twice. Cost: jsdom compiles event handler
  // content attributes (onload="...") only with 'dangerously'.
  const dom = new JSDOM('', { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const window = dom.window;
  const context = dom.getInternalVMContext();
  // jsdom loads its initial (empty) document asynchronously and fires load
  // at the window when done; wait for it so that load does not reach the
  // test page's listeners.
  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  return {
    global: window,
    window,
    evaluate: (code, filename) => vm.runInContext(code, context, { filename }),
    evaluateModule: (code, url, load) => evaluateModule(code, url, context, load),
    reportError: (error) => {
      if (typeof window.reportError === 'function') window.reportError(error);
      else window.dispatchEvent(new window.ErrorEvent('error', { error, message: String(error?.message ?? error), cancelable: true }));
    },
    dispatchRejection: (reason, promise) => dispatchRejection(window, reason, promise),
    // No public API fires trusted events in jsdom; these are untrusted.
    fire: (target, event) => target.dispatchEvent(event),
  };
}

// A module script and its imports (static and dynamic), through
// vm.SourceTextModule (the child runs with --experimental-vm-modules).
// load(url) returns the source of a module, or null when it cannot be
// loaded. Module specifiers resolve as URLs against the importing module.
async function evaluateModule(code, url, context, load) {
  const cache = new Map();
  const make = (source, id) => {
    let module = cache.get(id);
    if (!module) {
      module = new vm.SourceTextModule(source, {
        identifier: id,
        context,
        initializeImportMeta(meta) { meta.url = id; },
        importModuleDynamically: async (specifier, referrer) => {
          const imported = await resolve(specifier, referrer);
          await imported.link(resolve);
          await imported.evaluate();
          return imported;
        },
      });
      cache.set(id, module);
    }
    return module;
  };
  const resolve = async (specifier, referrer) => {
    const id = new URL(specifier, referrer.identifier).href;
    const source = load(id);
    if (source == null) throw new TypeError(`Failed to load module script ${id}`);
    return make(source, id);
  };
  const root = make(code, url);
  await root.link(resolve);
  await root.evaluate();
}

function dispatchRejection(window, reason, promise) {
  let event;
  if (typeof window.PromiseRejectionEvent === 'function') {
    event = new window.PromiseRejectionEvent('unhandledrejection', { reason, promise, cancelable: true });
  } else {
    event = new window.Event('unhandledrejection', { cancelable: true });
    Object.defineProperties(event, { reason: { value: reason }, promise: { value: promise } });
  }
  window.dispatchEvent(event);
}
