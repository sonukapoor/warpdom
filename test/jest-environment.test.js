import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import WarpdomEnvironment from '../src/jest.js';

// Stand-ins for the Jest packages the environment loads from the project.
function fakeJestProject() {
  const dir = mkdtempSync(join(tmpdir(), 'warpdom-jest-'));
  const pkg = (name, source) => {
    const d = join(dir, 'node_modules', name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name, main: 'index.js' }));
    writeFileSync(join(d, 'index.js'), source);
  };
  writeFileSync(join(dir, 'package.json'), '{}');
  pkg('jest-util', 'exports.installCommonGlobals = (g) => { g.process = { env: {} }; return g; };');
  pkg('jest-mock', 'exports.ModuleMocker = class { constructor(g) { this.global = g; } };');
  pkg(
    '@jest/fake-timers',
    'class T { constructor(o) { this.options = o; } dispose() { this.disposed = true; } }\nexports.LegacyFakeTimers = T; exports.ModernFakeTimers = T;',
  );
  return dir;
}

test('Jest environment: a warpdom window as the global, with what jest-environment-jsdom exposes', async () => {
  const rootDir = fakeJestProject();
  let env;
  try {
    env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    // Values from the test's realm, copied out (its arrays have another Array.prototype).
    const run = (code) => {
      const v = vm.runInContext(code, env.getVmContext());
      return typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v;
    };
    assert.equal(run('document.body.appendChild(document.createElement("div")).tagName'), 'DIV');
    assert.equal(
      run('window === globalThis && self === window && global === window && document.defaultView === window'),
      true,
    );
    assert.equal(run('location.href'), 'http://localhost/');
    assert.deepEqual(run('[typeof setTimeout(() => {}, 0), typeof setInterval(() => {}, 1000)]'), ['number', 'number']);
    assert.deepEqual(
      run(
        '["Buffer", "URL", "AbortController", "Blob", "crypto", "process"].map((n) => typeof globalThis[n] !== "undefined")',
      ),
      [true, true, true, true, true, true],
    );
    assert.deepEqual(
      run('["setImmediate", "TextEncoder", "structuredClone", "fetch", "require"].map((n) => typeof globalThis[n])'),
      ['undefined', 'undefined', 'undefined', 'undefined', 'undefined'],
    );
    // The window's AbortSignal, whose timeout() runs on the global's
    // setTimeout (so Jest's fake timers control it), as jsdom's.
    assert.equal(
      run('Object.prototype.toString.call(new AbortController().signal) + (AbortSignal === window.AbortSignal)'),
      '[object AbortSignal]true',
    );
    assert.equal(
      run(
        '(() => { const calls = []; const real = setTimeout; globalThis.setTimeout = (fn, ms) => { calls.push(ms); fn(); }; const s = AbortSignal.timeout(600); globalThis.setTimeout = real; return calls[0] + ":" + s.aborted + ":" + s.reason.name; })()',
      ),
      '600:true:TimeoutError',
    );
    // Events at the window have the global as target and this, as jsdom's.
    assert.equal(
      run(
        '(() => { let seen; window.addEventListener("focus", function (e) { seen = [e.target === window, e.currentTarget === globalThis, this === window, e.composedPath()[0] === window]; }); window.dispatchEvent(new Event("focus")); return seen.join(); })()',
      ),
      'true,true,true,true',
    );
    assert.deepEqual(env.exportConditions(), ['browser']);
    assert.ok(env.moduleMocker && env.fakeTimers && env.fakeTimersModern);
    const timers = env.fakeTimers;
    await env.teardown();
    assert.equal(timers.disposed, true);
    assert.equal(env.global, null);
  } finally {
    if (env?.global) await env.teardown();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Jest environment: follows the jsdom and cssstyle jest-environment-jsdom loads', async () => {
  const rootDir = fakeJestProject();
  const pkg = (dir, json) => {
    mkdirSync(join(rootDir, dir), { recursive: true });
    writeFileSync(join(rootDir, dir, 'package.json'), JSON.stringify(json));
  };
  pkg('node_modules/jest-environment-jsdom', { name: 'jest-environment-jsdom', version: '29.7.0' });
  pkg('node_modules/jsdom', { name: 'jsdom', version: '25.0.1' });
  pkg('node_modules/jsdom/node_modules/cssstyle', { name: 'cssstyle', version: '4.1.0' });
  let env;
  try {
    env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    const run = (code) => vm.runInContext(code, env.getVmContext());
    // cssstyle 4.1: url() without quotes, no root color.
    assert.equal(
      run(
        'const d = document.createElement("div"); d.style.backgroundImage = "url(\'a.png\')"; d.style.backgroundImage',
      ),
      'url(a.png)',
    );
    assert.equal(run('getComputedStyle(document.body.appendChild(document.createElement("p"))).color'), '');
  } finally {
    await env?.teardown();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Jest environment: testEnvironmentOptions.fastFrames', async () => {
  const rootDir = fakeJestProject();
  for (const [options, fast] of [
    [{ fastFrames: true }, true],
    [{}, false],
  ]) {
    const env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: options } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    try {
      const ms = await vm.runInContext(
        '(async () => { const t = Date.now(); for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); return Date.now() - t; })()',
        env.getVmContext(),
      );
      assert.equal(ms < 40, fast, `${JSON.stringify(options)}: 3 frames in ${ms} ms`);
    } finally {
      await env.teardown();
    }
  }
  rmSync(rootDir, { recursive: true, force: true });
});

// As in jest-environment-jsdom (jsdom 20 and 26, black box): the global is
// the window, whose document, window and top are [LegacyUnforgeable]
// getters, so assigning them is ignored, also in strict code; location
// navigates (downshift's tests assign a copy to global.document).
test('Jest environment: assigning document, window or top is ignored, location navigates', async () => {
  const rootDir = fakeJestProject();
  let env;
  try {
    env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    const run = (code) => vm.runInContext(code, env.getVmContext());
    assert.equal(
      run(`(() => { 'use strict';
      const real = document;
      global.document = { ...document, body: null };
      window.document = {};
      window.top = 1;
      global.window = 2;
      return [document === real, window.document === real, document.createElement('p').tagName, window.top === globalThis, window === globalThis].join();
    })()`),
      'true,true,P,true,true',
    );
    assert.equal(
      run(`(() => { 'use strict'; window.location = '#h'; return location.href; })()`),
      'http://localhost/#h',
    );
    assert.equal(run('Object.getOwnPropertyDescriptor(globalThis, "document").set'), undefined);
  } finally {
    if (env?.global) await env.teardown();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// jest-environment-jsdom sends jsdom's "Not implemented" errors to the
// test's console as Error objects; jsdom 20 to 26 word them window.alert.
test('Jest environment: "Not implemented" reports reach the test\'s console as errors, in the profile\'s words', async () => {
  const rootDir = fakeJestProject();
  let env;
  try {
    env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom: '20.0.3' } } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    const seen = [];
    env.global.console = { error: (e) => seen.push([e instanceof Error, e.message, e.type]) };
    vm.runInContext(
      'alert("x"); getComputedStyle(document.body, "::before"); document.createElement("form").submit()',
      env.getVmContext(),
    );
    assert.deepEqual(seen, [
      [true, 'Not implemented: window.alert', 'not implemented'],
      [true, 'Not implemented: window.computedStyle(elt, pseudoElt)', 'not implemented'],
      [true, 'Not implemented: HTMLFormElement.prototype.submit', 'not implemented'],
    ]);
  } finally {
    if (env?.global) await env.teardown();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// Black box (jest-environment-jsdom 30, jsdom 20 to 30): a frame's uncaught
// listener exception does not fail the test (only the top window's 'error'
// event is watched); jsdom's virtual console sends it to the test's console
// as "Uncaught [...]" (Copilot review on #89).
test("Jest environment: a frame's listener errors reach the test's console and do not fail the test, as with jsdom", async () => {
  for (const [jsdom, type, link] of [
    ['20.0.3', 'unhandled exception', 'detail'],
    ['30.1.3', 'unhandled-exception', 'cause'],
  ]) {
    const rootDir = fakeJestProject();
    let env;
    const emit = process.emit;
    const uncaught = [];
    process.emit = function (name, ...args) {
      if (name === 'uncaughtException') {
        uncaught.push(args[0]);
        return true;
      }
      return emit.call(this, name, ...args);
    };
    try {
      env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      const seen = [];
      env.global.console = { error: (e) => seen.push([e instanceof Error, e.message, e.type, String(e[link])]) };
      await vm.runInContext(
        `(async () => {
        const frame = document.body.appendChild(document.createElement('iframe'));
        const inner = frame.contentDocument.body.appendChild(frame.contentDocument.createElement('iframe'));
        for (const [doc, text] of [[frame.contentDocument, 'frame'], [inner.contentDocument, 'nested frame']]) {
          const b = doc.body.appendChild(doc.createElement('button'));
          b.addEventListener('click', () => { throw new Error(text); });
          b.click();
        }
        const x = new frame.contentWindow.XMLHttpRequest();
        await new Promise((resolve) => {
          x.onloadend = resolve;
          x.onload = () => { throw new Error('xhr onload'); };
          x.open('GET', 'data:text/plain,ok');
          x.send();
        });
      })()`,
        env.getVmContext(),
      );
      assert.deepEqual(
        seen,
        ['frame', 'nested frame', 'xhr onload'].map((m) => [true, `Uncaught [Error: ${m}]`, type, `Error: ${m}`]),
      );
      // The top window's still fail the test.
      vm.runInContext(
        'const b = document.body.appendChild(document.createElement("button")); b.addEventListener("click", () => { throw new Error("top"); }); b.click();',
        env.getVmContext(),
      );
      assert.deepEqual(
        uncaught.map((e) => e.message),
        ['top'],
      );
    } finally {
      process.emit = emit;
      if (env?.global) await env.teardown();
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

// As jest-environment-jsdom's teardown, which closes the window (black
// box, jsdom 26 through Jest 30): code still running after the test file
// (a library's promise chain, Dexie's) finds the window's members, and
// queueMicrotask still runs; timers do nothing and return 0; the document,
// location, history and storage read undefined; the window's listeners
// are removed. wire-webapp's workers crashed on a ReferenceError there.
test('Jest environment: after teardown the global keeps its members, as a closed jsdom window', async () => {
  const rootDir = fakeJestProject();
  let env;
  try {
    env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    const context = env.getVmContext();
    // Values from the test's realm, copied out.
    const run = (code) => {
      const v = vm.runInContext(code, context);
      return typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v;
    };
    run(
      'globalThis.seen = []; window.addEventListener("x", () => seen.push("window")); globalThis.el = document.body.appendChild(document.createElement("p")); el.addEventListener("click", () => seen.push("click"));',
    );
    await env.teardown();
    assert.deepEqual(
      run('["document", "location", "history", "localStorage", "sessionStorage"].map((n) => typeof globalThis[n])'),
      Array(5).fill('undefined'),
    );
    assert.deepEqual(
      run(
        '[typeof queueMicrotask, typeof Node, typeof Event, typeof getComputedStyle, window === globalThis, typeof navigator]',
      ),
      ['function', 'function', 'function', 'function', true, 'object'],
    );
    assert.deepEqual(
      run('[setTimeout(() => seen.push("timeout"), 0), setInterval(() => seen.push("interval"), 0)]'),
      [0, 0],
    );
    run('queueMicrotask(() => seen.push("microtask")); dispatchEvent(new Event("x")); el.click();');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(run('seen.join()'), 'click,microtask');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// Jest's helpers come from the Jest that is running, not the project's
// resolution: in handsontable (pnpm), Jest 30's .bin shim put
// node_modules/.pnpm/node_modules on NODE_PATH, where another workspace
// package's Jest 27 copies were hoisted, and Jest 30's runtime got Jest
// 27's ModuleMocker (no replaceProperty). Here the project resolves the
// Jest 27 copies and the running jest-runtime has its own Jest 30 ones.
test("Jest environment: Jest's helpers come from the running jest-runtime, in a layout with several Jest versions", async () => {
  const rootDir = fakeJestProject();
  const pkg = (dir, name, source) => {
    const d = join(rootDir, dir, 'node_modules', name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name, main: 'index.js' }));
    writeFileSync(join(d, 'index.js'), source);
  };
  pkg('', 'jest-mock', 'exports.ModuleMocker = class { constructor() { this.version = 27; } };');
  pkg('', 'jest-runtime', '');
  mkdirSync(join(rootDir, 'node_modules/jest-runtime/build'));
  const runtime = join(rootDir, 'node_modules/jest-runtime/build/index.js');
  writeFileSync(runtime, '');
  const nested = 'node_modules/jest-runtime';
  pkg(
    nested,
    'jest-util',
    'exports.installCommonGlobals = (g) => { g.process = { env: {} }; g.jestUtil = 30; return g; };',
  );
  pkg(
    nested,
    'jest-mock',
    'exports.ModuleMocker = class { constructor() { this.version = 30; } replaceProperty() {} };',
  );
  pkg(
    nested,
    '@jest/fake-timers',
    'class T { constructor() { this.version = 30; } dispose() {} }\nexports.LegacyFakeTimers = T; exports.ModernFakeTimers = T;',
  );
  const cache = createRequire(import.meta.url).cache;
  const make = () =>
    new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
  try {
    // No Jest running: the project's copies.
    let env = make();
    assert.equal(env.moduleMocker.version, 27);
    await env.teardown();
    // jest-runner has loaded jest-runtime: its copies.
    createRequire(import.meta.url)(runtime);
    env = make();
    assert.deepEqual(
      [
        env.moduleMocker.version,
        typeof env.moduleMocker.replaceProperty,
        env.fakeTimers.version,
        env.fakeTimersModern.version,
        env.global.jestUtil,
      ],
      [30, 'function', 30, 30, 30],
    );
    await env.teardown();
  } finally {
    delete cache[runtime];
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// As jest-environment-jsdom (black box, jsdom 20 and 26 through Jest 29 and
// 30): crypto, performance, Blob and File are the window's; TextEncoder
// from jsdom 27.4, its arrays of the test's realm.
test("Jest environment: crypto, performance, Blob, File and TextEncoder are the window's", async () => {
  const rootDir = fakeJestProject();
  try {
    for (const [jsdom, expected] of [
      ['20.0.3', '[object Crypto],undefined,undefined,undefined,undefined,true,undefined'],
      ['26.1.0', '[object Crypto],undefined,function,undefined,undefined,true,undefined'],
      ['30.1.3', '[object Crypto],undefined,function,undefined,function,true,function'],
    ]) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      try {
        const run = (code) => vm.runInContext(code, env.getVmContext());
        assert.equal(
          run(
            '[Object.prototype.toString.call(crypto), typeof crypto.subtle, typeof crypto.randomUUID, typeof performance.mark, typeof TextEncoder, new Blob(["a"]) instanceof Blob, typeof Blob.prototype.text].join()',
          ),
          expected,
          jsdom,
        );
        assert.equal(
          run(
            'crypto === window.crypto && performance === window.performance && crypto.getRandomValues(new Uint8Array(2)) instanceof Uint8Array',
          ),
          true,
        );
        if (jsdom === '30.1.3') {
          assert.equal(
            run(
              'new TextEncoder().encode("a") instanceof Uint8Array && new Blob(["a"]).arrayBuffer() instanceof Promise',
            ),
            true,
          );
          assert.equal(
            await run('new Blob(["ab"]).arrayBuffer().then((b) => b instanceof ArrayBuffer && b.byteLength)'),
            2,
          );
        }
        // Jest's modern fake timers assign the global's performance (strict code).
        assert.equal(
          run(
            '"use strict"; const real = performance; globalThis.performance = { now: () => 5 }; const t = performance.now(); globalThis.performance = real; t',
          ),
          5,
        );
      } finally {
        await env.teardown();
      }
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// As jest-environment-jsdom (black box, jsdom 20.0.3 and 26.1.0 through
// Jest 29 and 30): URL, URLSearchParams and Headers are the window's (no
// URL.createObjectURL), console is Jest's (frames' consoles write to it),
// and WebAssembly is the test file's realm's.
test('Jest environment: URL, URLSearchParams, Headers, console and WebAssembly as with jsdom', async () => {
  const rootDir = fakeJestProject();
  try {
    for (const [jsdom, expected] of [
      ['20.0.3', 'undefined,undefined,undefined,false,undefined,Invalid URL: nope,true,true'],
      ['26.1.0', 'undefined,undefined,function,true,function,Invalid URL: nope,true,true'],
      ['30.1.3', 'undefined,undefined,function,true,function,Invalid URL: nope,true,true'],
    ]) {
      const logged = [];
      const testConsole = { log: (...args) => logged.push(args.join(' ')) };
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console: testConsole, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      try {
        const run = (code) => vm.runInContext(code, env.getVmContext());
        assert.equal(
          run(`[typeof URL.createObjectURL, typeof URL.revokeObjectURL, typeof URL.parse, "size" in URLSearchParams.prototype,
          typeof Headers.prototype.getSetCookie, (() => { try { new URL("nope"); } catch (e) { return e.message; } })(),
          URL === window.URL && URLSearchParams === window.URLSearchParams && Headers === window.Headers && webkitURL === URL,
          new URL("http://a/?b=1").searchParams instanceof URLSearchParams].join()`),
          expected,
          jsdom,
        );
        assert.equal(
          run(
            'WebAssembly === window.WebAssembly && Object.getPrototypeOf(Object.getPrototypeOf(new WebAssembly.Memory({ initial: 1 }))) === Object.prototype',
          ),
          true,
        );
        run(
          'document.body.innerHTML = "<iframe></iframe>"; document.querySelector("iframe").contentWindow.console.log("from", "frame")',
        );
        assert.deepEqual(logged, ['from frame']);
      } finally {
        await env.teardown();
      }
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// As jest-environment-jsdom (black box, Jest 29 and 30): the global is the
// window, so WebSocket and window.WebSocket are one property, which a test
// can replace for its file. jsdom's is its own interface; warpdom's is
// Node's (a fresh file gets it back).
test("Jest environment: WebSocket is the window's, which is Node's; a test can replace it", async () => {
  const rootDir = fakeJestProject();
  const make = async () => {
    const env = new WarpdomEnvironment(
      { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } },
      { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
    );
    await env.setup();
    return env;
  };
  try {
    const env = await make();
    try {
      const run = (code) => vm.runInContext(code, env.getVmContext());
      assert.equal(run('WebSocket'), globalThis.WebSocket);
      assert.equal(
        run('WebSocket === window.WebSocket && WebSocket === document.defaultView.WebSocket && "WebSocket" in window'),
        true,
      );
      assert.equal(
        run(
          'Object.getOwnPropertyDescriptor(globalThis, "WebSocket").enumerable || Object.keys(window).includes("WebSocket")',
        ),
        false,
      );
      assert.equal(
        run(
          '(() => { const Mock = function Mock() {}; window.WebSocket = Mock; return globalThis.WebSocket === Mock && WebSocket === Mock; })()',
        ),
        true,
      );
      assert.equal(
        run('(() => { const Mock = class {}; globalThis.WebSocket = Mock; return window.WebSocket === Mock; })()'),
        true,
      );
    } finally {
      await env.teardown();
    }
    const next = await make();
    try {
      assert.equal(vm.runInContext('WebSocket', next.getVmContext()), globalThis.WebSocket);
    } finally {
      await next.teardown();
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// Window members tests override (#68): the global is the window, so its
// members have the window's kinds (black box with jsdom 20.0.3, 26.1.0 and
// 30.1.3 as the global of a VM context, as jest-environment-jsdom makes it;
// there assigning a member with only a getter is ignored, also in strict
// code).
test('Jest environment: viewport members, name, status and self as on jsdom per version', async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        'use strict';
        const kind = (key) => { const d = Object.getOwnPropertyDescriptor(window, key); return ('value' in d ? 'data ' : 'accessor ') + (d.set ? 's' : '') + (d.writable ? 'w' : '') + (d.enumerable ? 'e' : '') + (d.configurable ? 'c' : ''); };
        const out = [kind('innerWidth'), kind('name'), kind('status'), kind('self')];
        window.innerWidth = 640;
        Object.defineProperty(window, 'innerHeight', { value: 300 });
        let assigned;
        try { window.innerHeight = 400; assigned = window.innerHeight; } catch (e) { assigned = e.constructor.name; }
        window.status = 5;
        let self;
        try { window.self = 7; self = window.self === 7; } catch (e) { self = e.constructor.name; }
        out.push(window.innerWidth + ' ' + kind('innerWidth'), assigned, typeof window.status, self);
        return out.join(' | ');
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    assert.deepEqual(results, {
      '20.0.3': 'data wec | data wec | data wec | accessor ec | 640 data wec | 400 | number | false',
      '26.1.0': 'data wec | data wec | data wec | accessor sec | 640 data wec | 400 | number | true',
      '30.1.3': 'accessor sec | data wec | accessor sec | accessor sec | 640 data wec | TypeError | string | true',
    });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// An inline event handler's global scope is the global (the window), as in
// jest-environment-jsdom (black box, jsdom 20.0.3, 26.1.0 and 30.1.3): it
// reads the initial data properties (name, the viewport members before 27)
// and the test's assignments, also a second assignment to a [Replaceable]
// accessor (jsdom 27 and later) and Object.defineProperty, and what it
// assigns to window is the test's.
test("Jest environment: inline event handlers read the global's members", async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        const div = document.createElement('div');
        div.setAttribute('onclick', 'document.body.dataset.r = [innerWidth, window.innerWidth, name, outerWidth, scrollY, innerHeight, status].join(); window.fromHandler = 1');
        document.body.append(div);
        const out = [];
        const click = () => { div.click(); out.push(document.body.dataset.r); };
        click();
        window.innerWidth = 640; window.name = 'n1'; window.outerWidth = 700;
        click();
        window.innerWidth = 800; window.name = 'n2'; window.outerWidth = 900; window.scrollY = 5; window.status = 'st';
        Object.defineProperty(window, 'innerHeight', { value: 333, writable: true, enumerable: true, configurable: true });
        click();
        out.push(window.fromHandler);
        return out.join(' | ');
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    const expected = '1024,1024,,1024,0,768, | 640,640,n1,700,0,768, | 800,800,n2,900,5,333,st | 1';
    assert.deepEqual(results, { '20.0.3': expected, '26.1.0': expected, '30.1.3': expected });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// Assignments through an object that inherits from the global (#90; black
// box with jsdom 20.0.3, 26.1.0 and 30.1.3 as the global of a VM context,
// as jest-environment-jsdom makes it). The global's own setters (self and
// parent from 21, innerWidth and status from 27) called on another object
// replace the global's member and give that object nothing. Up to jsdom 26
// the VM context's global lets an object derived from it have its own
// property for every member and keeps its own, as warpdom's global does;
// data properties (name, interface objects) do so in every version. (From
// jsdom 27 the context is the window itself, and an assignment to self,
// parent, innerWidth or status through a derived object replaces the
// global's: warpdom's global is a VM context's, which gives the derived
// object its own property there too. Not asserted.)
test('Jest environment: assignments through an object inheriting from the global', async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        'use strict';
        const out = [];
        const keys = ${JSON.stringify(jsdom === '30.1.3' ? ['name', 'Image', 'MutationObserver'] : ['self', 'parent', 'innerWidth', 'status', 'name', 'Image', 'MutationObserver'])};
        for (const key of keys) {
          const derived = Object.create(window);
          derived[key] = 7;
          out.push(key + ' ' + Object.hasOwn(derived, key) + ' ' + (window[key] === 7));
        }
        for (const key of ['self', 'parent', 'innerWidth', 'status']) {
          const d = Object.getOwnPropertyDescriptor(window, key);
          if (!d.set) { out.push(key + ' no setter'); continue; }
          const other = {};
          d.set.call(other, 8);
          out.push(key + ' setter ' + Object.hasOwn(other, key) + ' ' + String(window[key]));
        }
        return out.join(', ');
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    const derived = 'self true false, parent true false, innerWidth true false, status true false, ';
    const data = 'name true false, Image true false, MutationObserver true false';
    assert.deepEqual(results, {
      '20.0.3': `${derived}${data}, self no setter, parent no setter, innerWidth no setter, status no setter`,
      '26.1.0': `${derived}${data}, self setter false 8, parent setter false 8, innerWidth no setter, status no setter`,
      '30.1.3': `${data}, self setter false 8, parent setter false 8, innerWidth setter false 8, status setter false 8`,
    });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// The global does no named access, but an inline event handler finds the
// window's named objects (a sibling's id, live; a form's name) after the
// global's own and inherited members, and its assignment to such a name
// goes to the global, as in jest-environment-jsdom (black box, jsdom
// 20.0.3, 26.1.0 and 30.1.3).
test('Jest environment: inline event handlers find named elements', async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        window.shadowed = 'g';
        document.body.innerHTML = '<div id="result"></div><form name="fname"></form><div id="dup"></div><span id="dup"></span><div id="gone"></div>'
          + '<div id="shadowed"></div><div id="setTimeout"></div><div id="an"></div>'
          + '<button id="t" onclick="result.textContent = \\'ok\\'; document.body.dataset.r = [fname.tagName, dup.length, typeof late, typeof gone, typeof nosuch, shadowed, typeof setTimeout, typeof an].join(); an = 5; fresh = 6"></button>';
        const button = document.getElementById('t');
        button.click();
        const out = [document.getElementById('result').textContent, document.body.dataset.r];
        document.body.insertAdjacentHTML('beforeend', '<span id="late"></span>');
        document.getElementById('gone').remove();
        button.click();
        out.push(document.body.dataset.r, window.an, globalThis.fresh);
        return out.join(' | ');
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    const expected =
      'ok | FORM,2,undefined,object,undefined,g,function,object | FORM,2,object,undefined,undefined,g,function,number | 5 | 6';
    assert.deepEqual(results, { '20.0.3': expected, '26.1.0': expected, '30.1.3': expected });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// In jest-environment-jsdom (black box, jsdom 20.0.3 through Jest 29 and
// 26.1.0 through Jest 30): an inline handler's window scope is the global as
// an object, so the global's properties and then named objects come before
// the global let/const of classic scripts (<div id="counter"> wins over a
// script's `let counter = 42`; the handler's `counter = ...` and `kc = 8`
// assign the global's properties, the bindings stay), and the global's
// functions get the global as this. frames, a frame's parent and top are
// the global, so they read what the test assigns; window[0] is the frame.
test('Jest environment: handler scope before script bindings; frame aliases are the global', async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        const out = [];
        const iframe = document.createElement('iframe');
        document.body.append(iframe);
        const cw = iframe.contentWindow;
        out.push([window.frames === window, cw.parent === window, cw.top === window, window[0] === cw, window.frames[0] === cw].join());
        window.name = 'updated'; window.innerWidth = 640;
        out.push([window.frames.name, cw.parent.name, cw.parent.innerWidth].join());
        window.innerWidth = 800;
        out.push([window.frames.innerWidth, cw.top.innerWidth].join());
        iframe.remove();
        out.push(String(window[0]));
        const s = document.createElement('script');
        s.textContent = 'let counter = 42; const kc = 7;';
        document.head.append(s);
        window.whoami = function () { 'use strict'; return this === window; };
        document.body.innerHTML = '<div id="counter"></div><div id="kc"></div><button id="b" onclick="document.body.dataset.r = [typeof counter, String(counter), String(kc), whoami()].join(); counter = counter + 1; kc = 8"></button>';
        const b = document.getElementById('b');
        b.click(); out.push(document.body.dataset.r);
        b.click(); out.push(document.body.dataset.r);
        const s2 = document.createElement('script');
        s2.textContent = 'document.body.dataset.c = [counter, kc, window.counter, window.kc].join()';
        document.head.append(s2);
        out.push(document.body.dataset.c);
        return out.join(' | ');
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    const expected =
      'true,true,true,true,true | updated,updated,640 | 800,800 | undefined' +
      ' | object,[object HTMLDivElement],[object HTMLDivElement],true | string,[object HTMLDivElement]1,8,true | 42,7,[object HTMLDivElement]11,8';
    assert.deepEqual(results, { '20.0.3': expected, '26.1.0': expected, '30.1.3': expected });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// Named objects whose names a compiler might use for its scope objects are
// just named objects in an inline handler: the global, document, form and
// element scopes stay (jest-environment-jsdom and Vitest's VM pools, black
// box on jsdom 20.0.3, 26.1.0 and 30.1.3).
test("Jest environment: named objects do not replace an inline handler's scopes", async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        window.shadowed = 'g';
        document.body.innerHTML = '<div id="__window"></div><div id="__named"></div><div id="__document"></div><div id="__element"></div><div id="shadowed"></div><form name="__form"></form>'
          + '<form id="f"><input><button id="b" type="button" onclick="document.body.dataset.r = [String(shadowed), id, typeof getElementById, elements.length, typeof setTimeout, __window.id].join()"></button></form>'
          + '<button id="c" onclick="document.body.dataset.s = [String(shadowed), id, typeof getElementById, typeof setTimeout].join()"></button>';
        document.getElementById('b').click();
        document.getElementById('c').click();
        return document.body.dataset.r + ' | ' + document.body.dataset.s;
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    const expected = 'g,b,function,2,function,__window | g,c,function,function';
    assert.deepEqual(results, { '20.0.3': expected, '26.1.0': expected, '30.1.3': expected });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// The view of the events warpdom fires (focus, blur, focusin, click() and
// a label's click) is the global, as in jest-environment-jsdom (black box,
// jsdom 20.0.3 and 26.1.0; Vitest vmThreads on 20.0.3, 26.1.0, 30.1.3), so
// it reads what the test assigned to window.
test('Jest environment: event.view is the global', async () => {
  const rootDir = fakeJestProject();
  try {
    const results = {};
    for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
      const env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      results[jsdom] = vm.runInContext(
        `(() => {
        window.name = 'updated';
        window.innerWidth = 800;
        document.body.innerHTML = '<input id="i"><label id="l">x<input id="li" type="checkbox"></label><button id="b"></button>';
        const views = [];
        const rec = (k) => (e) => { views.push(k + ':' + [e.view === window, e.view.name, e.view.innerWidth].join()); };
        const i = document.getElementById('i');
        for (const type of ['focus', 'focusin', 'blur']) i.addEventListener(type, rec(type));
        i.focus(); i.blur();
        document.getElementById('b').addEventListener('click', rec('click'));
        document.getElementById('b').click();
        document.getElementById('li').addEventListener('click', rec('label'));
        document.getElementById('l').click();
        views.push(new MouseEvent('x', { view: window }).view === window);
        return views.join(' ');
      })()`,
        env.getVmContext(),
      );
      await env.teardown();
    }
    const expected =
      'focus:true,updated,800 focusin:true,updated,800 blur:true,updated,800 click:true,updated,800 label:true,updated,800 true';
    assert.deepEqual(results, { '20.0.3': expected, '26.1.0': expected, '30.1.3': expected });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// jest.spyOn on the style accessors (#72), with Jest's own spyOn (the
// project's jest-mock): CSSStyleDeclaration's before jsdom 29, so
// jest.spyOn(CSSStyleDeclaration.prototype, 'width', 'get') sees el.style
// and getComputedStyle reads; from 29 they are CSSStyleProperties' and that
// spy throws (black box, jsdom 20.0.3 to 30.1.3).
test('Jest environment: jest.spyOn on the style accessors as with jsdom, per profile', async () => {
  const { ModuleMocker } = createRequire(import.meta.url)('jest-mock');
  for (const jsdom of ['20.0.3', '26.1.0', '28.1.0', '30.1.3']) {
    const legacy = Number.parseInt(jsdom, 10) < 29;
    const rootDir = fakeJestProject();
    let env;
    try {
      env = new WarpdomEnvironment(
        { globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom } } },
        { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') },
      );
      await env.setup();
      const g = env.global;
      const jest = new ModuleMocker(g);
      const el = g.document.body.appendChild(g.document.createElement('div'));
      el.style.width = '10px';
      assert.equal(typeof g.CSSStyleProperties, legacy ? 'undefined' : 'function', jsdom);
      if (!legacy) assert.throws(() => jest.spyOn(g.CSSStyleDeclaration.prototype, 'width', 'get'), jsdom);
      const width = jest
        .spyOn(legacy ? g.CSSStyleDeclaration.prototype : g.CSSStyleProperties.prototype, 'width', 'get')
        .mockReturnValue('42px');
      const set = jest.spyOn(legacy ? g.CSSStyleDeclaration.prototype : g.CSSStyleProperties.prototype, 'width', 'set');
      assert.equal(
        vm.runInContext(
          'el => [el.style.width, getComputedStyle(el).width, (el.style.width = "5px", "")].join()',
          env.getVmContext(),
        )(el),
        '42px,42px,',
        jsdom,
      );
      assert.equal(width.mock.calls.length, 2, jsdom);
      assert.deepEqual(set.mock.calls, [['5px']], jsdom);
      // In reverse order: each restores the descriptor it replaced.
      set.mockRestore();
      width.mockRestore();
      assert.equal(el.style.width, '5px', jsdom);
    } finally {
      if (env?.global) await env.teardown();
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});
