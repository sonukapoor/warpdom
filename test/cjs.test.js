// The CommonJS build (dist/warpdom.cjs, built by npm test's pretest from
// scripts/build-cjs.mjs) and the package's export conditions: Node loads
// the ES modules for import and require(); Jest's module system, which
// cannot run ES modules synchronously before Node 24.9, gets the bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as core from '../src/node.js';
import WarpdomEnvironment from '../src/jest.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundleFile = join(root, 'dist/warpdom.cjs');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Runs the bundle as Jest's module system would in a test file: in a VM
// context (by default one whose global object has no TextEncoder, as with
// jest-environment-jsdom), with a require() that loads Node's built-in
// modules and nothing else (Jest's cannot load ES modules such as parse5).
function loadInContext(context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, DOMException })) {
  const require = (name) => {
    if (!isBuiltin(name)) throw new Error(`require('${name}') in the sandbox`);
    return createRequire(bundleFile)(name);
  };
  const module = { exports: {} };
  const wrapper = vm.runInContext(`(function (exports, require, module, __filename, __dirname) {${readFileSync(bundleFile, 'utf8')}\n})`, context, { filename: bundleFile });
  wrapper(module.exports, require, module, bundleFile, dirname(bundleFile));
  return { exports: module.exports, context };
}

test('CommonJS build: the same exports as src/node.js', () => {
  const bundle = createRequire(import.meta.url)(bundleFile);
  assert.deepEqual(Object.keys(bundle).sort(), Object.keys(core).sort());
  for (const name of Object.keys(core)) assert.equal(typeof bundle[name], typeof core[name], name);
});

test('CommonJS build: works in a Jest-like VM context, without loading packages through its require()', () => {
  const { exports: warpdom, context } = loadInContext();
  const window = warpdom.createWindow({ url: 'https://example.com/a', jsdom: '30.1.2' });
  const { document } = window;
  assert.equal(window.location.href, 'https://example.com/a');
  // HTML (parse5), XML (@rgrove/parse-xml) and XPath (src/xpath.cjs) are bundled.
  document.body.innerHTML = '<p id="x">hi <b>there</b></p>';
  assert.equal(document.getElementById('x').textContent, 'hi there');
  assert.equal(new window.DOMParser().parseFromString('<a><b/></a>', 'application/xml').documentElement.firstChild.tagName, 'b');
  assert.equal(document.evaluate('//b', document, null, 9, null).singleNodeValue.tagName, 'B');
  // Platform globals come from Node, not the context's global object:
  // TextEncoder (missing there), crypto and performance.
  const bytes = new window.TextEncoder().encode('hé');
  assert.deepEqual([...bytes], [104, 195, 169]);
  assert.ok(bytes instanceof vm.runInContext('Uint8Array', context), 'the bytes are of the context, as the window\'s are');
  assert.match(window.crypto.randomUUID(), /^[0-9a-f-]{36}$/);
  assert.equal(typeof window.performance.now(), 'number');
  // Names kept, errors as from the ES modules.
  assert.equal(window.HTMLElement.name, 'HTMLElement');
  assert.throws(() => document.createElement('1'), (e) => e.name === 'InvalidCharacterError');
  // Strict code, as the ES modules are.
  assert.match(readFileSync(bundleFile, 'utf8'), /^(\/\/.*\n)*'use strict';\n/);
});

test('CommonJS build: loaded in a VM context with fake timers and a frozen Date already installed, XHR timeouts still fire (Copilot review on #89)', async () => {
  const { startServer } = await import('./xhr-server.js');
  const server = await startServer();
  try {
    // Jest's fake timers in the test file's context: timers that never fire,
    // a Date that stands still.
    const frozen = Date.now();
    class FrozenDate extends Date { static now() { return frozen; } }
    const never = () => ({ ref() { return this; }, unref() { return this; }, hasRef: () => false, refresh() { return this; } });
    const context = vm.createContext({ console, setTimeout: never, clearTimeout: () => {}, setInterval: never, clearInterval: () => {}, Date: FrozenDate, queueMicrotask, URL, DOMException });
    const { exports: warpdom } = loadInContext(context);
    const window = warpdom.createWindow({ url: `http://localhost:${server.port}/page/index.html` });
    const x = new window.XMLHttpRequest();
    const fired = new Promise((resolve) => { x.ontimeout = () => resolve('timeout'); setTimeout(() => resolve('no timeout'), 2000); });
    x.open('GET', `http://localhost:${server.port}/hang`);
    x.timeout = 50;
    x.send();
    assert.equal(await fired, 'timeout');
  } finally {
    await server.close();
  }
});

test('CommonJS build: in a VM context without AbortController, preflighted requests work and stop (Copilot review on #89)', async () => {
  const { startServer } = await import('./xhr-server.js');
  const server = await startServer();
  try {
    const { exports: warpdom } = loadInContext();
    const window = warpdom.createWindow({ url: `http://localhost:${server.port}/page/index.html` });
    const send = (method, url, stop) => new Promise((resolve) => {
      const x = new window.XMLHttpRequest();
      x.onloadend = () => resolve([x.status, x.responseText === '' ? '' : JSON.parse(x.responseText).method]);
      x.open(method, url);
      x.send('x');
      if (stop) x.abort();
    });
    // Cross-origin PUT: a preflight first (it used req.controller.signal).
    assert.deepEqual(await send('PUT', `http://127.0.0.1:${server.port}/echo?acao=*&preflight=ok`), [200, 'PUT']);
    assert.deepEqual(await send('POST', `http://localhost:${server.port}/hang`, true), [0, '']);
  } finally {
    await server.close();
  }
});

test('CommonJS build: in a VM context without btoa, the jsdom 20 profile sends URL credentials as Basic authorization (Copilot review on #89)', async () => {
  const { startServer } = await import('./xhr-server.js');
  const server = await startServer();
  try {
    const { exports: warpdom, context } = loadInContext();
    assert.equal(vm.runInContext('typeof btoa', context), 'undefined');
    const window = warpdom.createWindow({ url: `http://localhost:${server.port}/page/index.html`, jsdom: '20.0.3' });
    const authorization = await new Promise((resolve) => {
      const x = new window.XMLHttpRequest();
      x.onloadend = () => resolve(x.status === 200 ? JSON.parse(x.responseText).headers.authorization : `status ${x.status}`);
      x.open('GET', `http://%C3%A9:p@localhost:${server.port}/echo`);
      x.send();
    });
    assert.equal(authorization, 'Basic w6k6cA==');
  } finally {
    await server.close();
  }
});

test('CommonJS build: in a VM context without atob and btoa, window.atob, window.btoa and readAsDataURL work (#92)', async () => {
  const { exports: warpdom, context } = loadInContext();
  assert.equal(vm.runInContext('typeof atob + typeof btoa', context), 'undefinedundefined');
  const window = warpdom.createWindow({ url: 'https://example.com/' });
  assert.deepEqual([window.btoa('hi\u00e9'), window.atob('aGk=')], ['aGnp', 'hi']);
  assert.throws(() => window.btoa('\u20ac'), (e) => e.name === 'InvalidCharacterError');
  const reader = new window.FileReader();
  const url = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new window.Blob(['hi'], { type: 'text/plain' }));
  });
  assert.equal(url, 'data:text/plain;base64,aGk=');
});

test('CommonJS build: in the VM context of warpdom/jest, whose global object is a warpdom window', async () => {
  // Stand-ins for the Jest packages the environment loads from the project.
  const dir = mkdtempSync(join(tmpdir(), 'warpdom-cjs-'));
  const fake = (name, source) => {
    mkdirSync(join(dir, 'node_modules', name), { recursive: true });
    writeFileSync(join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, main: 'index.js' }));
    writeFileSync(join(dir, 'node_modules', name, 'index.js'), source);
  };
  writeFileSync(join(dir, 'package.json'), '{}');
  fake('jest-util', 'exports.installCommonGlobals = (g) => g;');
  fake('jest-mock', 'exports.ModuleMocker = class {};');
  fake('@jest/fake-timers', 'class T { dispose() {} }\nexports.LegacyFakeTimers = T; exports.ModernFakeTimers = T;');
  const env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir: dir, testEnvironmentOptions: {} } }, {});
  try {
    await env.setup();
    const { exports: warpdom } = loadInContext(env.getVmContext());
    const window = warpdom.createWindow({ url: 'http://localhost/inner' });
    window.document.body.innerHTML = '<span>inner</span>';
    assert.equal(window.document.body.textContent, 'inner');
    assert.equal(env.global.document.body.textContent, '');
    assert.deepEqual([...new window.TextEncoder().encode('a')], [97]);
    assert.match(window.crypto.randomUUID(), /^[0-9a-f-]{36}$/);
  } finally {
    await env.teardown();
    rmSync(dir, { recursive: true, force: true });
  }
});

// The package.json "exports" target for a set of conditions (Node's
// algorithm: the first key in object order that is a condition given, or
// "default").
function target(exportsValue, conditions) {
  if (typeof exportsValue === 'string') return exportsValue;
  for (const [key, value] of Object.entries(exportsValue)) {
    if (key === 'default' || conditions.includes(key)) {
      const found = target(value, conditions);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

test('export conditions: Node gets the ES modules, Jest the CommonJS build, TypeScript the matching types', () => {
  const main = pkg.exports['.'];
  // Node 22.12 and later, import and require(): module-sync.
  assert.equal(target(main, ['node', 'import', 'module-sync']), './src/node.js');
  assert.equal(target(main, ['node', 'require', 'module-sync']), './src/node.js');
  // Jest 30 before Node 24.9, with jest-environment-node, -jsdom and warpdom/jest.
  for (const env of [['node', 'node-addons'], ['browser']]) {
    assert.equal(target(main, ['require', 'node', 'default', ...env]), './dist/warpdom.cjs');
    // Jest 28 and 29 (no node condition unless the environment gives it).
    assert.equal(target(main, ['require', 'default', ...env]), './dist/warpdom.cjs');
  }
  // Jest 27 reads main.
  assert.equal(pkg.main, './dist/warpdom.cjs');
  // Other runtimes and browser bundlers.
  assert.equal(target(main, ['import', 'browser']), './src/index.js');
  // TypeScript (it knows no module-sync).
  assert.equal(target(main, ['types', 'node', 'import']), './types/index.d.ts');
  assert.equal(target(main, ['types', 'node', 'require']), './dist/warpdom.d.cts');
  assert.equal(target(main, ['types', 'import']), './types/index.d.ts');
  assert.equal(target(main, ['types', 'require']), './dist/warpdom.d.cts');
  // Every entry point has types, listed first.
  for (const [path, value] of Object.entries(pkg.exports)) {
    if (path === './package.json') continue;
    const leaves = [];
    const walk = (v) => { if (v.default && typeof v.default === 'string') leaves.push(v); else for (const x of Object.values(v)) walk(x); };
    walk(value);
    for (const leaf of leaves) assert.equal(Object.keys(leaf)[0], 'types', path);
  }
});

test('require("warpdom") in Node is the ES module (one copy for import and require)', async () => {
  const required = createRequire(import.meta.url)('warpdom');
  const imported = await import('warpdom');
  assert.equal(required.createWindow, imported.createWindow);
  assert.equal(imported.createWindow, core.createWindow);
});

test('the CommonJS types are a copy of the ES module types', () => {
  assert.equal(readFileSync(join(root, 'dist/warpdom.d.cts'), 'utf8'), readFileSync(join(root, 'types/index.d.ts'), 'utf8'));
});
