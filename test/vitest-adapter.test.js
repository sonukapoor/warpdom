import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsdomVersion, jsdomProfile, installWindow, VITEST_ALWAYS_KEYS } from '../src/vitest.js';
import { createWindow } from '../src/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) => {
  try {
    return {
      code: 0,
      out: String(
        execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest', '--maxWorkers=1', ...args], {
          cwd: root,
          stdio: 'pipe',
        }),
      ),
    };
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
      execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest-errors', ...environment], {
        cwd: root,
        stdio: 'pipe',
      });
    } catch (err) {
      code = err.status;
      out = String(err.stdout) + String(err.stderr);
    }
    assert.equal(code, 1, `exit code with ${environment.join(' ') || 'warpdom'}`);
    assert.match(out, /thrown in a listener/);
  }
});

// Black box (Vitest 5, jsdom 30): a frame's uncaught listener exception
// (an XMLHttpRequest onload too) goes to jsdom's virtual console, which
// Vitest prints; the test passes (Copilot review on #89).
test("an error thrown in a frame's listener is logged and does not fail the test, as with jsdom", () => {
  for (const environment of [[], ['--environment', 'jsdom']]) {
    const result = spawnSync(
      'node_modules/.bin/vitest',
      ['run', '--root', 'fixtures/vitest-frame-errors', ...environment],
      { cwd: root, encoding: 'utf8' },
    );
    const out = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(result.status, 0, environment.join(' ') || 'warpdom');
    assert.match(out, /Tests {2}2 passed \(2\)/);
    assert.match(out, /Error: thrown in a frame listener/);
    assert.match(out, /Error: thrown in a frame xhr onload/);
  }
});

test('setupVM: Node globals that are lazy getters work in the context (crypto)', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const result = await environment.setupVM();
  try {
    const types = vmModule.runInContext(
      '[typeof crypto, typeof crypto.randomUUID, typeof performance.now, typeof setTimeout]',
      result.getVmContext(),
    );
    assert.deepEqual([...types], ['object', 'function', 'function', 'function']);
  } finally {
    result.teardown();
  }
});

// In the VM pools the global is the window, as jsdom's internal context is
// there: a bare getComputedStyle() or .call(null, ...) has no this value,
// and jsdom 20 to 23 report a pseudo-element only on one
// (window.getComputedStyle(...), globalThis.getComputedStyle(...)).
// Elsewhere Vitest binds the window's functions, so all report.
test('setupVM: a bare getComputedStyle with a pseudo-element reports as jsdom does', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  for (const [jsdom, reports] of [
    ['20.0.3', 2],
    ['30.1.3', 4],
  ]) {
    const result = await environment.setupVM({ warpdom: { jsdom } });
    const seen = [];
    const original = console.error;
    console.error = (e) => seen.push(String(e));
    try {
      vmModule.runInContext(
        'getComputedStyle(document.body, "::before"); getComputedStyle.call(null, document.body, "::before");' +
          'window.getComputedStyle(document.body, "::before"); globalThis.getComputedStyle(document.body, "::before")',
        result.getVmContext(),
      );
    } finally {
      console.error = original;
      result.teardown();
    }
    assert.equal(seen.length, reports, `jsdom ${jsdom}: ${seen.join(', ')}`);
  }
  const global = {};
  const env = environment.setup(global, { warpdom: { jsdom: '20.0.3' } });
  const seen = [];
  const original = console.error;
  console.error = (e) => seen.push(String(e));
  try {
    global.getComputedStyle(global.document.body, '::before');
  } finally {
    console.error = original;
    env.teardown();
  }
  assert.equal(seen.length, 1);
});

// Black box (Vitest 5, jsdom 20 to 30): in the VM pools the global is the
// window, with jsdom's crypto and performance; TextEncoder exists before
// jsdom 27.4 too (Node's here). Elsewhere crypto, performance, TextEncoder
// and TextDecoder are Node's, and Crypto, Performance, Blob and File the
// window's.
test("setupVM: crypto, performance, Blob, File and TextEncoder are the window's", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  for (const [jsdom, encoder] of [
    ['30.1.3', 'window'],
    ['26.1.0', 'node'],
  ]) {
    const result = await environment.setupVM({ warpdom: { jsdom } });
    try {
      const run = (code) => vmModule.runInContext(code, result.getVmContext());
      assert.equal(
        run(
          '[Object.prototype.toString.call(crypto), typeof crypto.subtle, crypto instanceof Crypto, performance instanceof Performance, typeof performance.mark, new Blob(["a"]) instanceof window.Blob, new File([], "x") instanceof Blob].join()',
        ),
        '[object Crypto],undefined,true,true,undefined,true,true',
      );
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

test("setup: crypto, performance, TextEncoder and TextDecoder stay Node's; the reset clears Node's marks", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const cleared = [];
  const host = {
    crypto: 'node crypto',
    TextEncoder: 'node encoder',
    performance: { clearMarks: () => cleared.push('marks'), clearMeasures: () => cleared.push('measures') },
  };
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
  const pkg = (dir, json) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
  };
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
  const pkg = (dir, json) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
  };
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
  assert.deepEqual(
    project([
      ['node_modules/cssstyle', '4.6.0'],
      ['node_modules/jsdom/node_modules/cssstyle', '4.1.0'],
    ]),
    { jsdom: '25.0.1', cssstyle: '4.1.0' },
  );
  // Options override; a jsdom version given alone does not use the installed cssstyle.
  assert.deepEqual(project([['node_modules/cssstyle', '4.6.0']], { warpdom: { cssstyle: '4.4.0' } }), {
    jsdom: '25.0.1',
    cssstyle: '4.4.0',
  });
  assert.deepEqual(project([['node_modules/cssstyle', '4.6.0']], { warpdom: { jsdom: 26 } }), {
    jsdom: 26,
    cssstyle: undefined,
  });
});

test('the global EventTarget methods act on the window, or on another this', () => {
  const window = createWindow();
  const global = {};
  const restore = installWindow(global, window);
  try {
    const { body } = window.document;
    const seen = [];
    // A custom this (as a browser's inherited window.addEventListener).
    global.addEventListener.call(body, 'a', function () {
      seen.push(this === body ? 'body' : 'other');
    });
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

test("Vitest keeps Node's AbortController and AbortSignal, as its jsdom environment does", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const vmResult = await environment.setupVM();
  try {
    assert.equal(
      vmModule.runInContext(
        'AbortController === this.__nodeAbort',
        Object.assign(vmResult.getVmContext(), { __nodeAbort: AbortController }),
      ),
      true,
    );
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

// Vitest's jsdom environment's Request (#350; black box, Vitest 5, jsdom
// 26 and 30, every pool): a subclass of Node's whose constructor takes
// the window's Blob, File and FormData bodies (as Node's, of their bytes
// and type; a FormData's Blob and File entries are sent as "blob", their
// names left out). Its length is 0, Node's Requests are its instances;
// the other bodies are Node's to read.
async function requestBodies(Request, w) {
  const form = new w.FormData();
  form.append('a', '1');
  form.append('b', new w.Blob(['x'], { type: 'text/x-b' }), 'b.bin');
  form.append('c', new w.File(['y'], 'c.txt', { type: 'text/x-c' }));
  const post = (body, init = {}) => new Request('http://x/', { method: 'POST', body, ...init });
  const blob = post(new w.Blob(['d'], { type: 'application/octet-stream' }));
  const file = post(new w.File(['f'], 'n.txt', { type: 'text/x-f' }));
  const multipart = post(form);
  // (boundaries as --B; Node 22.22 and 24 end the body with a CR LF, 22.17
  // does not)
  const text = (await multipart.text()).replace(/-{2,}[\w-]+/g, '--B').replace(/\r\n$/, '');
  // (the init's members read through its prototype too, as Node reads them)
  const proto = new Request('http://x/', Object.create({ method: 'PUT', body: new w.Blob(['p']) }));
  // (#356 review: a function as the init, and getters that read this, as
  // with jsdom's environment)
  const fn = Object.assign(function init() {}, { method: 'POST', body: new w.Blob(['fn'], { type: 'a/fn' }) });
  const fnRequest = new Request('http://x/', fn);
  const methods = new WeakMap();
  const bound = {
    body: new w.Blob(['m']),
    get method() {
      return methods.get(this);
    },
  };
  methods.set(bound, 'PATCH');
  const boundRequest = new Request('http://x/', bound);
  const frozen = new Request('http://x/', Object.freeze({ method: 'POST', body: new w.Blob(['z'], { type: 'a/z' }) }));
  return [
    Request.name,
    Request.length,
    blob.headers.get('content-type'),
    await blob.text(),
    file.headers.get('content-type'),
    await file.text(),
    multipart.headers.get('content-type').split(';')[0],
    text,
    proto.method,
    await proto.text(),
    await post('s').text(),
    fnRequest.headers.get('content-type'),
    await fnRequest.text(),
    boundRequest.method,
    await boundRequest.text(),
    frozen.headers.get('content-type'),
    await frozen.text(),
  ];
}
const REQUEST_BODIES = [
  'Request',
  0,
  'application/octet-stream',
  'd',
  'text/x-f',
  'f',
  'multipart/form-data',
  '--B\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n' +
    '--B\r\nContent-Disposition: form-data; name="b"; filename="blob"\r\nContent-Type: text/x-b\r\n\r\nx\r\n' +
    '--B\r\nContent-Disposition: form-data; name="c"; filename="blob"\r\nContent-Type: text/x-c\r\n\r\ny\r\n--B',
  'PUT',
  'p',
  's',
  'a/fn',
  'fn',
  'PATCH',
  'm',
  'a/z',
  'z',
];
test("Vitest: Request takes the window's Blob, File and FormData bodies (#350)", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const global = {};
  const result = environment.setup(global);
  try {
    assert.deepEqual(await requestBodies(global.Request, global), REQUEST_BODIES);
    assert.equal(new global.Request('http://x/') instanceof Request, true);
    // (Node's Requests are its instances too, a clone's: its own @@hasInstance)
    assert.equal(new Request('http://x/') instanceof global.Request, true);
    assert.equal(new global.Request('http://x/').clone() instanceof global.Request, true);
    assert.equal({} instanceof global.Request, false);
  } finally {
    result.teardown();
  }
  assert.equal('Request' in global, false);
  const vmModule = await import('node:vm');
  const vmResult = await environment.setupVM();
  try {
    const context = vmResult.getVmContext();
    const [Vm, w] = vmModule.runInContext('[Request, window]', context);
    assert.deepEqual(await requestBodies(Vm, w), REQUEST_BODIES);
  } finally {
    vmResult.teardown();
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
    assert.equal(
      vm.runInContext(
        `(() => { 'use strict';
      const real = document;
      globalThis.document = {};
      window.top = 1;
      return [document === real, top === globalThis].join();
    })()`,
        context,
      ),
      'true,true',
    );
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
    assert.equal(
      run('Object.getPrototypeOf(Object.getPrototypeOf(new WebAssembly.Memory({ initial: 1 }))) === Object.prototype'),
      true,
    );
    // Until Vitest puts its console there: the window's, writing to the setup's console.
    assert.equal(run('Object.getOwnPropertyDescriptor(globalThis, "console").enumerable'), false);
    const original = console.info;
    let got;
    console.info = (x) => {
      got = x;
    };
    try {
      run('console.info("to setup")');
    } finally {
      console.info = original;
    }
    assert.equal(got, 'to setup');
  } finally {
    result.teardown();
  }
});

test("setup: URL is Vitest's, kept per file by the reset; URLSearchParams, Headers, console and WebAssembly stay the global's", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const { URL: NodeURL } = await import('node:url');
  const host = {
    URL: 'node URL',
    URLSearchParams: 'node params',
    Headers: 'node headers',
    console: 'node console',
    WebAssembly: 'node wasm',
  };
  const global = { ...host };
  const env = environment.setup(global, { warpdom: { jsdom: '30.1.3' } });
  try {
    const U = global.URL;
    assert.equal(Object.getPrototypeOf(U), NodeURL);
    assert.deepEqual(
      [global.URLSearchParams, global.Headers, global.console, global.WebAssembly],
      ['node params', 'node headers', 'node console', 'node wasm'],
    );
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

// #196: without isolation Vitest 3 (measured: 3.2.4, forks and threads)
// tears the environment down and calls setup() on the same global for
// every file; Vitest 4 and 5 call it once per worker. The mark the
// previous file took must reach the next file's reset, and the marked
// window members (the previous window's) must not come back. Modules and
// vi's stubs stay as in Vitest 4: Vitest's cleanup before the reset puts
// back a member the previous file stubbed as it was then (the previous
// window's), and a member its imports deleted before its mark is not in
// the mark; the reset keeps the new window's.
test("setup again on the same global (Vitest 3): the reset removes the previous file's globals", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const RESET = Symbol.for('warpdom.vitest.reset');
  const MARK = Symbol.for('warpdom.vitest.mark');
  const global = {};
  const afterReset = [];
  // vi.stubGlobal and vi.unstubAllGlobals (Vitest 3.2.4's), one vi per
  // worker; warpdom/vitest/reset wraps them to report each stub with its
  // original (#201) and the stubs' end (#230).
  const MOCKING = Symbol.for('warpdom.vitest.mocking');
  const stubs = new Map();
  const stubGlobal = (key, value) => {
    if (!stubs.has(key)) stubs.set(key, Object.getOwnPropertyDescriptor(global, key));
    Object.defineProperty(global, key, { value, writable: true, enumerable: true, configurable: true });
    global[MOCKING](key, { original: stubs.get(key) });
  };
  const unstubAllGlobals = () => {
    const keys = [...stubs.keys()];
    for (const [key, original] of stubs)
      if (original) Object.defineProperty(global, key, original);
      else Reflect.deleteProperty(global, key);
    stubs.clear();
    for (const key of keys) global[MOCKING]?.(key, null);
  };
  // One test file: setup(), the setup files (warpdom's reset after
  // Vitest's cleanup, then the project's), the mark when its tests start
  // (unless all skip), its tests, teardown().
  const file = ({ setupDep = () => {}, imports = () => {}, tests = () => {}, skipped = false }) => {
    const env = environment.setup(global, { warpdom: { jsdom: '30.1.3' } });
    try {
      unstubAllGlobals();
      global[RESET]();
      afterReset.push([
        global.innerWidth,
        global.innerHeight,
        typeof global.scrollTo,
        global.document instanceof global.Document,
        global.outerWidth,
      ]);
      // The project's setup file's import (loaded once), then its stubs of window members.
      setupDep();
      stubGlobal('innerHeight', 500);
      stubGlobal('outerWidth', 500);
      if (skipped) stubGlobal('document', null);
      imports();
      if (!skipped) global[MARK]();
      tests();
    } finally {
      env.teardown();
    }
  };
  file({
    setupDep: () => Object.defineProperty(global, 'outerWidth', { value: 900, writable: true, configurable: true }),
    imports: () => delete global.scrollTo,
    tests() {
      unstubAllGlobals();
      assert.equal(global.outerWidth, 900);
      global.__added = 1;
      Object.defineProperty(global, 'innerWidth', { value: 500, writable: true, configurable: true });
      stubGlobal('document', null);
    },
  });
  // All skipped: no mark; what its imports set stays for the next files.
  file({ imports: () => (global.__skippedDep = 1), skipped: true });
  file({
    tests() {
      assert.equal('__added' in global, false);
      assert.equal(global.__skippedDep, 1);
    },
  });
  file({ tests: () => assert.equal(global.__skippedDep, 1) });
  // A member a module loaded once changed is the new window's again, as
  // Vitest 3.2.4 measured: setup() installs it for every file.
  assert.deepEqual(afterReset, Array(4).fill([1024, 768, 'function', true, 1024]));
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
        out = String(
          execFileSync(
            'node_modules/.bin/vitest',
            ['run', '--root', 'fixtures/vitest-websocket', '--pool', pool, ...environment],
            { cwd: root, stdio: 'pipe' },
          ),
        );
      } catch (err) {
        code = err.status;
        out = String(err.stdout) + String(err.stderr);
      }
      assert.equal(code, 0, `${pool} ${environment.join(' ') || 'warpdom'}: ${out}`);
      assert.match(out, /3 passed/);
    }
  }
});

test("setupVM and setup: the window's WebSocket is Node's; setup leaves the global's", async () => {
  const { default: environment } = await import('../src/vitest.js');
  const vmModule = await import('node:vm');
  const result = await environment.setupVM();
  try {
    const context = result.getVmContext();
    assert.equal(vmModule.runInContext('WebSocket', context), WebSocket);
    assert.equal(
      vmModule.runInContext('WebSocket === window.WebSocket && WebSocket === document.defaultView.WebSocket', context),
      true,
    );
    vmModule.runInContext('window.WebSocket = class Mock {}', context);
    assert.equal(
      vmModule.runInContext('WebSocket.name === "Mock" && globalThis.WebSocket === window.WebSocket', context),
      true,
    );
  } finally {
    result.teardown();
  }
  // The global keeps its own (in Vitest's other pools, Node's, the object
  // the window reads): reading it does not go through the window.
  const global = { WebSocket: 'node ws' };
  const env = environment.setup(global);
  try {
    assert.deepEqual(Object.getOwnPropertyDescriptor(global, 'WebSocket'), {
      value: 'node ws',
      writable: true,
      enumerable: true,
      configurable: true,
    });
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
    ['forks', [], 'forks'],
    ['vmThreads', [], 'vm'],
    ['forks', ['--environment', 'jsdom'], 'forks'],
    ['vmThreads', ['--environment', 'jsdom'], 'vm'],
    ['forks', [], 'forks', '26.1.0'],
    ['vmThreads', [], 'vm-legacy', '26.1.0'],
    ['vmThreads', [], 'vm-legacy', '20.0.3'],
  ];
  for (const [pool, environment, expect, jsdom] of cases) {
    let out = '';
    let code = 0;
    try {
      out = String(
        execFileSync(
          'node_modules/.bin/vitest',
          ['run', '--root', 'fixtures/vitest-viewport', '--pool', pool, ...environment],
          {
            cwd: root,
            stdio: 'pipe',
            env: { ...process.env, VIEWPORT_EXPECT: expect, ...(jsdom ? { VIEWPORT_JSDOM: jsdom } : {}) },
          },
        ),
      );
    } catch (err) {
      code = err.status;
      out = String(err.stdout) + String(err.stderr);
    }
    assert.equal(code, 0, `${pool} ${environment.join(' ') || 'warpdom'} ${jsdom ?? ''}: ${out}`);
    // Vitest colors its summary on CI (GitHub Actions); match the plain text.
    assert.match(out.replace(/\x1b\[[0-9;]*m/g, ''), pool === 'forks' ? /7 passed \| 3 skipped/ : /10 passed/);
  }
});

// Animation frames under vi.useFakeTimers() (#249), black box with Vitest
// 5's jsdom environment (jsdom 30): frames run on the realm's setInterval,
// faked in the forks and threads pools when requestAnimationFrame itself is
// left alone, real in the VM pools; the beat restarts after a cancel of the
// last pending callback. The installed jsdom checks the expectations.
test('Vitest: animation frames under fake timers as with jsdom, per pool', () => {
  const cases = [
    ['forks', [], 'faked'],
    ['threads', [], 'faked'],
    ['vmThreads', [], 'real'],
    ['vmThreads', [], 'real', '20.0.3'],
    ['forks', ['--environment', 'jsdom'], 'faked'],
    ['vmThreads', ['--environment', 'jsdom'], 'real'],
  ];
  for (const [pool, environment, expect, jsdom] of cases) {
    const result = spawnSync(
      'node_modules/.bin/vitest',
      ['run', '--root', 'fixtures/vitest-frames', '--pool', pool, ...environment],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, FRAMES_EXPECT: expect, ...(jsdom ? { FRAMES_JSDOM: jsdom } : {}) },
      },
    );
    const out = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(result.status, 0, `${pool} ${environment.join(' ') || 'warpdom'} ${jsdom ?? ''}: ${out}`);
    assert.match(out, /2 passed/);
  }
});

// vi.spyOn on the style accessors (#72): CSSStyleDeclaration's before
// jsdom 29, CSSStyleProperties' later (black box, jsdom 20.0.3 to 30.1.3;
// the installed jsdom checks the fixture's expectations).
test('Vitest: vi.spyOn on the style accessors as with jsdom, per profile', () => {
  const cases = [
    [[], 'declaration', '20.0.3'],
    [[], 'declaration', '26.1.0'],
    [[], 'declaration', '28.1.0'],
    [[], 'properties', '30.1.3'],
    [['--environment', 'jsdom'], 'properties'],
  ];
  for (const [environment, expect, jsdom] of cases) {
    const result = spawnSync(
      'node_modules/.bin/vitest',
      ['run', '--root', 'fixtures/vitest-style-spy', ...environment],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, STYLE_SPY_EXPECT: expect, ...(jsdom ? { STYLE_SPY_JSDOM: jsdom } : {}) },
      },
    );
    // Vitest colors its output on CI (GitHub Actions); match the plain text.
    const out = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(result.status, 0, `${environment.join(' ') || 'warpdom'} ${jsdom ?? ''}: ${out}`);
    assert.match(out, /Tests {2}3 passed \(3\)/);
  }
});

// Vitest's forks and threads pools (black box with its jsdom environment,
// jsdom 20.0.3, 26.1.0, 30.1.3): a global the window's member replaces
// keeps its enumerability (Node's navigator stays in
// Object.keys(globalThis)), the window's other members are not enumerable,
// window, self, top and parent are; teardown restores the originals.
test('Vitest: replaced globals keep their enumerability in forks and threads', async () => {
  const { default: environment } = await import('../src/vitest.js');
  const navigator = { userAgent: 'node' };
  const global = {};
  Object.defineProperty(global, 'navigator', { get: () => navigator, enumerable: true, configurable: true });
  Object.defineProperty(global, 'location', { value: 'hidden', writable: true, enumerable: false, configurable: true });
  const env = environment.setup(global);
  try {
    const keys = Object.keys(global);
    assert.deepEqual(
      ['navigator', 'window', 'self', 'top', 'parent'].filter((k) => !keys.includes(k)),
      [],
    );
    assert.deepEqual(
      ['document', 'location', 'innerWidth', 'addEventListener', 'HTMLElement'].filter((k) => keys.includes(k)),
      [],
    );
    assert.notEqual(global.navigator, navigator);
  } finally {
    env.teardown();
  }
  assert.equal(global.navigator, navigator);
  assert.deepEqual(Object.getOwnPropertyDescriptor(global, 'location'), {
    value: 'hidden',
    writable: true,
    enumerable: false,
    configurable: true,
  });
});
