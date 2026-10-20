import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsdomVersion, jsdomProfile, installWindow, VITEST_ALWAYS_KEYS } from '../src/vitest.js';
import { createWindow } from '../src/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) => {
  try {
    return { code: 0, out: String(execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest', '--maxWorkers=1', ...args], { cwd: root, stdio: 'pipe' })) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout) + String(err.stderr) };
  }
};
const outcome = (out) => (out.match(/Tests\s+([^\n]*)/) ?? [])[1]?.trim();

test('the Vitest environment runs test files on warpdom, isolated per file', () => {
  // The fixture config runs patch-a.spec.js before patch-b.spec.js, so a leak would show.
  const { code, out } = run();
  assert.equal(code, 0, out);
  assert.match(out, /3 passed/);
});

test('without isolation, warpdom behaves like jsdom', () => {
  // Vitest reuses one environment per worker when isolation is off, so state
  // leaks between files on every DOM; warpdom must give the same results.
  const warpdom = run('--no-isolate');
  const jsdom = run('--no-isolate', '--environment', 'jsdom');
  assert.equal(outcome(warpdom.out), outcome(jsdom.out), `warpdom: ${warpdom.out}\njsdom: ${jsdom.out}`);
});

test('an error thrown in an event listener fails the run, as with jsdom', () => {
  for (const environment of [[], ['--environment', 'jsdom']]) {
    let out = '';
    let code = 0;
    try {
      execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest-errors', ...environment], { cwd: root, stdio: 'pipe' });
    } catch (err) {
      code = err.status;
      out = String(err.stdout) + String(err.stderr);
    }
    assert.equal(code, 1, `exit code with ${environment.join(' ') || 'warpdom'}`);
    assert.match(out, /thrown in a listener/);
  }
});

test('setupVM: Node globals that are lazy getters work in the context (crypto)', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const result = await environment.setupVM();
  try {
    const types = vmModule.runInContext('[typeof crypto, typeof crypto.randomUUID, typeof performance.now, typeof setTimeout]', result.getVmContext());
    assert.deepEqual([...types], ['object', 'function', 'function', 'function']);
  } finally {
    result.teardown();
  }
});

// Black box (Vitest 5, jsdom 20 to 30): in the VM pools the global is the
// window, with jsdom's crypto and performance; TextEncoder exists before
// jsdom 27.4 too (Node's here). Elsewhere crypto, performance, TextEncoder
// and TextDecoder are Node's, and Crypto, Performance, Blob and File the
// window's.
test('setupVM: crypto, performance, Blob, File and TextEncoder are the window\'s', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  for (const [jsdom, encoder] of [['30.1.3', 'window'], ['26.1.0', 'node']]) {
    const result = await environment.setupVM({ warpdom: { jsdom } });
    try {
      const run = (code) => vmModule.runInContext(code, result.getVmContext());
      assert.equal(run('[Object.prototype.toString.call(crypto), typeof crypto.subtle, crypto instanceof Crypto, performance instanceof Performance, typeof performance.mark, new Blob(["a"]) instanceof window.Blob, new File([], "x") instanceof Blob].join()'),
        '[object Crypto],undefined,true,true,undefined,true,true');
      assert.equal(run('typeof TextEncoder === "function" && TextEncoder === window.TextEncoder'), true);
      assert.equal(run('new TextEncoder().encode("a") instanceof Uint8Array'), encoder === 'window');
      assert.equal(run('Object.prototype.toString.call(new TextDecoder())'), '[object TextDecoder]');
      // Fake timers replace performance on the global.
      assert.equal(run('"use strict"; globalThis.performance = { now: () => 5 }; performance.now()'), 5);
    } finally {
      result.teardown();
    }
  }
});

test('setup: crypto, performance, TextEncoder and TextDecoder stay Node\'s; the reset clears Node\'s marks', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const cleared = [];
  const host = { crypto: 'node crypto', TextEncoder: 'node encoder', performance: { clearMarks: () => cleared.push('marks'), clearMeasures: () => cleared.push('measures') } };
  const global = { ...host };
  const env = environment.setup(global, { warpdom: { jsdom: '30.1.3' } });
  try {
    assert.equal(global.crypto, host.crypto);
    assert.equal(global.performance, host.performance);
    assert.equal(global.TextEncoder, host.TextEncoder);
    assert.equal('TextDecoder' in global, false);
    assert.equal(Object.prototype.toString.call(new global.Blob(['a'])), '[object Blob]');
    assert.ok(new global.File([], 'x') instanceof global.Blob);
    assert.equal(global.Crypto.name, 'Crypto');
    assert.equal(global.Performance.name, 'Performance');
    global[Symbol.for('warpdom.vitest.reset')]();
    assert.deepEqual(cleared, ['marks', 'measures']);
  } finally {
    env.teardown();
  }
});

test('the jsdom profile follows the jsdom Vitest would load', () => {
  const root = mkdtempSync(join(tmpdir(), 'warpdom-jsdom-'));
  const pkg = (dir, json) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'package.json'), JSON.stringify(json)); };
  try {
    pkg(root, { name: 'project' });
    assert.equal(jsdomVersion({}, root), undefined);
    // Only Vitest depends on jsdom (pnpm-style, beside Vitest).
    pkg(join(root, 'node_modules/vitest'), { name: 'vitest', version: '3.2.4' });
    pkg(join(root, 'node_modules/vitest/node_modules/jsdom'), { name: 'jsdom', version: '30.1.1' });
    assert.equal(jsdomVersion({}, root), '30.1.1');
    // The project's own jsdom comes first; the option overrides both.
    pkg(join(root, 'node_modules/jsdom'), { name: 'jsdom', version: '26.1.0' });
    assert.equal(jsdomVersion({}, root), '26.1.0');
    assert.equal(jsdomVersion({ warpdom: { jsdom: 27 } }, root), 27);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the jsdom profile includes the cssstyle that jsdom loads', () => {
  const pkg = (dir, json) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'package.json'), JSON.stringify(json)); };
  // A fresh project per case (Node caches module resolution).
  const project = (cssstyleDirs, options = {}) => {
    const root = mkdtempSync(join(tmpdir(), 'warpdom-cssstyle-'));
    try {
      pkg(root, { name: 'project' });
      pkg(join(root, 'node_modules/jsdom'), { name: 'jsdom', version: '25.0.1' });
      for (const [dir, version] of cssstyleDirs) pkg(join(root, dir), { name: 'cssstyle', version });
      return jsdomProfile(options, root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  assert.deepEqual(project([]), { jsdom: '25.0.1', cssstyle: undefined });
  // Hoisted beside jsdom, or nested in it (nested wins, as for Node).
  assert.deepEqual(project([['node_modules/cssstyle', '4.6.0']]), { jsdom: '25.0.1', cssstyle: '4.6.0' });
  assert.deepEqual(project([['node_modules/cssstyle', '4.6.0'], ['node_modules/jsdom/node_modules/cssstyle', '4.1.0']]), { jsdom: '25.0.1', cssstyle: '4.1.0' });
  // Options override; a jsdom version given alone does not use the installed cssstyle.
  assert.deepEqual(project([['node_modules/cssstyle', '4.6.0']], { warpdom: { cssstyle: '4.4.0' } }), { jsdom: '25.0.1', cssstyle: '4.4.0' });
  assert.deepEqual(project([['node_modules/cssstyle', '4.6.0']], { warpdom: { jsdom: 26 } }), { jsdom: 26, cssstyle: undefined });
});

test('the global EventTarget methods act on the window, or on another this', () => {
  const window = createWindow();
  const global = {};
  const restore = installWindow(global, window);
  try {
    const { body } = window.document;
    const seen = [];
    // A custom this (as a browser's inherited window.addEventListener).
    global.addEventListener.call(body, 'a', function () { seen.push(this === body ? 'body' : 'other'); });
    body.dispatchEvent(new window.Event('a'));
    // Unbound and through the global: the window.
    const { addEventListener } = global;
    addEventListener('b', () => seen.push('window b'));
    global.addEventListener('c', () => seen.push('window c'));
    window.dispatchEvent(new window.Event('b'));
    global.dispatchEvent(new window.Event('c'));
    assert.deepEqual(seen, ['body', 'window b', 'window c']);
    assert.equal(global.addEventListener.length, 2);
    assert.equal(global.addEventListener.name, 'addEventListener');
  } finally {
    restore();
  }
});

test('globals Vitest defines for members jsdom lacks read the window (matchMedia)', () => {
  // svelte's test helpers assign Window.prototype.matchMedia; code under
  // test calls window.matchMedia, the global.
  const window = createWindow({ jsdom: 25 });
  const global = {};
  const restore = installWindow(global, window, { alwaysKeys: VITEST_ALWAYS_KEYS });
  try {
    assert.equal('matchMedia' in global, true);
    assert.equal(global.matchMedia, undefined);
    const matchMedia = (media) => ({ matches: false, media });
    window.Window.prototype.matchMedia = matchMedia;
    assert.equal(global.matchMedia, matchMedia);
    assert.deepEqual(global.matchMedia('(min-width: 1px)'), { matches: false, media: '(min-width: 1px)' });
  } finally {
    restore();
  }
  assert.equal('matchMedia' in global, false);
});

test('Vitest keeps Node\'s AbortController and AbortSignal, as its jsdom environment does', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const vmResult = await environment.setupVM();
  try {
    assert.equal(vmModule.runInContext('AbortController === this.__nodeAbort', Object.assign(vmResult.getVmContext(), { __nodeAbort: AbortController })), true);
  } finally {
    vmResult.teardown();
  }
  const global = {};
  const result = environment.setup(global);
  try {
    assert.equal('AbortController' in global, false);
    assert.equal(typeof global.document.defaultView.AbortSignal, 'undefined');
  } finally {
    result.teardown();
  }
});

test('Vitest: the global CSS exists (undefined) when the jsdom profile has no CSS namespace', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const global = {};
  const result = environment.setup(global, { warpdom: { jsdom: '27.2.0' } });
  try {
    assert.equal('CSS' in global, true);
    assert.equal(global.CSS, undefined);
  } finally {
    result.teardown();
  }
  const latest = {};
  const r2 = environment.setup(latest, { warpdom: { jsdom: 30 } });
  try {
    assert.equal(typeof latest.CSS.supports, 'function');
  } finally {
    r2.teardown();
  }
});

// Vitest's VM pools run test files in a context whose global is the window,
// as jsdom's (assignments to document, window and top ignored); its other
// pools copy the window's members onto Node's global with setters, so an
// assignment replaces the global's value, as Vitest's jsdom environment does.
test('Vitest: assigning the global document is ignored in VM pools and replaces it otherwise, as with jsdom', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmResult = await environment.setupVM();
  try {
    const context = vmResult.getVmContext();
    const vm = await import('node:vm');
    assert.equal(vm.runInContext(`(() => { 'use strict';
      const real = document;
      globalThis.document = {};
      window.top = 1;
      return [document === real, top === globalThis].join();
    })()`, context), 'true,true');
  } finally {
    vmResult.teardown();
  }
  const window = createWindow();
  const global = {};
  const restore = installWindow(global, window, { hostKeys: [], alwaysKeys: VITEST_ALWAYS_KEYS });
  try {
    const fake = { fake: true };
    global.document = fake;
    assert.equal(global.document, fake);
  } finally {
    restore();
  }
});

// environmentOptions.warpdom.url sets the page URL, as
// environmentOptions.jsdom.url does for Vitest's jsdom environment (whose
// default, http://localhost:3000, is warpdom's too).
test('Vitest: environmentOptions.warpdom.url sets the URL', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const global = {};
  const result = environment.setup(global, { warpdom: { url: 'http://localhost/app/?q=1' } });
  try {
    assert.equal(global.location.href, 'http://localhost/app/?q=1');
    assert.equal(global.document.URL, 'http://localhost/app/?q=1');
  } finally {
    result.teardown();
  }
  const vmResult = await environment.setupVM({ warpdom: { url: 'http://example.test/' } });
  try {
    assert.equal(vmResult.getVmContext().location.origin, 'http://example.test');
  } finally {
    vmResult.teardown();
  }
  const plain = {};
  const r2 = environment.setup(plain);
  try {
    assert.equal(plain.location.href, 'http://localhost:3000/');
  } finally {
    r2.teardown();
  }
});

// Black box (Vitest 5, jsdom 20 to 30, forks and vmThreads): URL is
// Vitest's own subclass of Node's URL, whose createObjectURL() also takes
// the window's Blobs and Files; URLSearchParams and Headers are Node's;
// webkitURL is the window's URL (no createObjectURL); console is Vitest's
// and WebAssembly the test file's realm's.
test('setupVM: URL, URLSearchParams, Headers, console and WebAssembly as with jsdom', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const { URL: NodeURL } = await import('node:url');
  const { resolveObjectURL } = await import('node:buffer');
  const result = await environment.setupVM({ warpdom: { jsdom: '30.1.3' } });
  try {
    const run = (code) => vmModule.runInContext(code, result.getVmContext());
    const U = run('URL');
    assert.equal(Object.getPrototypeOf(U), NodeURL);
    assert.deepEqual(Object.getOwnPropertyNames(U).sort(), ['createObjectURL', 'length', 'name', 'prototype']);
    assert.equal(run('URL === window.URL && webkitURL !== URL && typeof webkitURL.createObjectURL'), 'undefined');
    const url = run('URL.createObjectURL(new File(["xyz"], "f.txt", { type: "text/plain" }))');
    assert.match(url, /^blob:nodedata:/);
    assert.deepEqual([resolveObjectURL(url).type, resolveObjectURL(url).size], ['text/plain', 3]);
    run(`URL.revokeObjectURL(${JSON.stringify(url)})`);
    assert.equal(resolveObjectURL(url), undefined);
    assert.equal(run('URLSearchParams'), URLSearchParams);
    assert.equal(run('Headers'), Headers);
    assert.equal(run('Object.getPrototypeOf(Object.getPrototypeOf(new WebAssembly.Memory({ initial: 1 }))) === Object.prototype'), true);
    // Until Vitest puts its console there: the window's, writing to the setup's console.
    assert.equal(run('Object.getOwnPropertyDescriptor(globalThis, "console").enumerable'), false);
    const original = console.info;
    let got;
    console.info = (x) => { got = x; };
    try { run('console.info("to setup")'); } finally { console.info = original; }
    assert.equal(got, 'to setup');
  } finally {
    result.teardown();
  }
});

test('setup: URL is Vitest\'s, kept per file by the reset; URLSearchParams, Headers, console and WebAssembly stay the global\'s', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const { URL: NodeURL } = await import('node:url');
  const host = { URL: 'node URL', URLSearchParams: 'node params', Headers: 'node headers', console: 'node console', WebAssembly: 'node wasm' };
  const global = { ...host };
  const env = environment.setup(global, { warpdom: { jsdom: '30.1.3' } });
  try {
    const U = global.URL;
    assert.equal(Object.getPrototypeOf(U), NodeURL);
    assert.deepEqual([global.URLSearchParams, global.Headers, global.console, global.WebAssembly], ['node params', 'node headers', 'node console', 'node wasm']);
    assert.equal(typeof global.webkitURL.createObjectURL, 'undefined');
    assert.equal(new global.webkitURL('http://a/').href, 'http://a/');
    assert.match(U.createObjectURL(new global.Blob(['a'])), /^blob:nodedata:/);
    // A test's stubs, and a replaced global URL, are gone in the next file.
    U.createObjectURL = () => 'stub';
    U.prototype.extra = 1;
    global.URL = 'replaced';
    global[Symbol.for('warpdom.vitest.reset')]();
    assert.equal(global.URL, U);
    assert.match(U.createObjectURL(new global.Blob(['a'])), /^blob:nodedata:/);
    assert.equal('extra' in U.prototype, false);
  } finally {
    env.teardown();
  }
  assert.equal(global.URL, 'node URL');
});

// Black box (Vitest 5, jsdom 30, every pool): the global's WebSocket and
// the window's are one, and vi.stubGlobal or an assignment to
// window.WebSocket replaces both. warpdom's is Node's: in the forks and
// threads pools the global keeps Node's own; in the VM pools the global
// reads the window's.
test('Vitest: WebSocket is one object on the global and the window, and tests can stub it, as with jsdom', () => {
  for (const pool of ['forks', 'vmThreads']) {
    for (const environment of [[], ['--environment', 'jsdom']]) {
      let out = '';
      let code = 0;
      try {
        out = String(execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest-websocket', '--pool', pool, ...environment], { cwd: root, stdio: 'pipe' }));
      } catch (err) {
        code = err.status;
        out = String(err.stdout) + String(err.stderr);
      }
      assert.equal(code, 0, `${pool} ${environment.join(' ') || 'warpdom'}: ${out}`);
      assert.match(out, /3 passed/);
    }
  }
});

test('setupVM and setup: the window\'s WebSocket is Node\'s; setup leaves the global\'s', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const result = await environment.setupVM();
  try {
    const context = result.getVmContext();
    assert.equal(vmModule.runInContext('WebSocket', context), WebSocket);
    assert.equal(vmModule.runInContext('WebSocket === window.WebSocket && WebSocket === document.defaultView.WebSocket', context), true);
    vmModule.runInContext('window.WebSocket = class Mock {}', context);
    assert.equal(vmModule.runInContext('WebSocket.name === "Mock" && globalThis.WebSocket === window.WebSocket', context), true);
  } finally {
    result.teardown();
  }
  // The global keeps its own (in Vitest's other pools, Node's, the object
  // the window reads): reading it does not go through the window.
  const global = { WebSocket: 'node ws' };
  const env = environment.setup(global);
  try {
    assert.deepEqual(Object.getOwnPropertyDescriptor(global, 'WebSocket'), { value: 'node ws', writable: true, enumerable: true, configurable: true });
    global[Symbol.for('warpdom.vitest.reset')]();
    assert.equal(global.WebSocket, 'node ws');
  } finally {
    env.teardown();
  }
  assert.equal(global.WebSocket, 'node ws');
});

// Window members tests override (#68): vi.spyOn(window, 'innerWidth',
// 'get'), assignments and Object.defineProperty give jsdom's results in
// every pool, for the installed jsdom and for a jsdom 26 profile (measured
// black box with Vitest 5's jsdom environment on jsdom 20.0.3, 26.1.0 and
// 30.1.3; the fixture lists the results).
test('Vitest: viewport members, name, status and self as with jsdom, per pool and profile', () => {
  const cases = [
    ['forks', [], 'forks'], ['vmThreads', [], 'vm'],
    ['forks', ['--environment', 'jsdom'], 'forks'], ['vmThreads', ['--environment', 'jsdom'], 'vm'],
    ['forks', [], 'forks', '26.1.0'], ['vmThreads', [], 'vm-legacy', '26.1.0'], ['vmThreads', [], 'vm-legacy', '20.0.3'],
  ];
  for (const [pool, environment, expect, jsdom] of cases) {
    let out = '';
    let code = 0;
    try {
      out = String(execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest-viewport', '--pool', pool, ...environment], {
        cwd: root, stdio: 'pipe', env: { ...process.env, VIEWPORT_EXPECT: expect, ...(jsdom ? { VIEWPORT_JSDOM: jsdom } : {}) },
      }));
    } catch (err) {
      code = err.status;
      out = String(err.stdout) + String(err.stderr);
    }
    assert.equal(code, 0, `${pool} ${environment.join(' ') || 'warpdom'} ${jsdom ?? ''}: ${out}`);
    assert.match(out, pool === 'forks' ? /3 passed \| 2 skipped/ : /5 passed/);
  }
});
