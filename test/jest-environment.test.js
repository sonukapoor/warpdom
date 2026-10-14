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
  pkg('@jest/fake-timers', 'class T { constructor(o) { this.options = o; } dispose() { this.disposed = true; } }\nexports.LegacyFakeTimers = T; exports.ModernFakeTimers = T;');
  return dir;
}

test('Jest environment: a warpdom window as the global, with what jest-environment-jsdom exposes', async () => {
  const rootDir = fakeJestProject();
  let env;
  try {
    env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
    await env.setup();
    // Values from the test's realm, copied out (its arrays have another Array.prototype).
    const run = (code) => { const v = vm.runInContext(code, env.getVmContext()); return typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v; };
    assert.equal(run('document.body.appendChild(document.createElement("div")).tagName'), 'DIV');
    assert.equal(run('window === globalThis && self === window && global === window && document.defaultView === window'), true);
    assert.equal(run('location.href'), 'http://localhost/');
    assert.deepEqual(run('[typeof setTimeout(() => {}, 0), typeof setInterval(() => {}, 1000)]'), ['number', 'number']);
    assert.deepEqual(run('["Buffer", "URL", "AbortController", "Blob", "crypto", "process"].map((n) => typeof globalThis[n] !== "undefined")'), [true, true, true, true, true, true]);
    assert.deepEqual(run('["setImmediate", "TextEncoder", "structuredClone", "fetch", "require"].map((n) => typeof globalThis[n])'), ['undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
    // The window's AbortSignal, whose timeout() runs on the global's
    // setTimeout (so Jest's fake timers control it), as jsdom's.
    assert.equal(run('Object.prototype.toString.call(new AbortController().signal) + (AbortSignal === window.AbortSignal)'), '[object AbortSignal]true');
    assert.equal(run('(() => { const calls = []; const real = setTimeout; globalThis.setTimeout = (fn, ms) => { calls.push(ms); fn(); }; const s = AbortSignal.timeout(600); globalThis.setTimeout = real; return calls[0] + ":" + s.aborted + ":" + s.reason.name; })()'), '600:true:TimeoutError');
    // Events at the window have the global as target and this, as jsdom's.
    assert.equal(run('(() => { let seen; window.addEventListener("focus", function (e) { seen = [e.target === window, e.currentTarget === globalThis, this === window, e.composedPath()[0] === window]; }); window.dispatchEvent(new Event("focus")); return seen.join(); })()'), 'true,true,true,true');
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
  const pkg = (dir, json) => { mkdirSync(join(rootDir, dir), { recursive: true }); writeFileSync(join(rootDir, dir, 'package.json'), JSON.stringify(json)); };
  pkg('node_modules/jest-environment-jsdom', { name: 'jest-environment-jsdom', version: '29.7.0' });
  pkg('node_modules/jsdom', { name: 'jsdom', version: '25.0.1' });
  pkg('node_modules/jsdom/node_modules/cssstyle', { name: 'cssstyle', version: '4.1.0' });
  let env;
  try {
    env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
    await env.setup();
    const run = (code) => vm.runInContext(code, env.getVmContext());
    // cssstyle 4.1: url() without quotes, no root color.
    assert.equal(run('const d = document.createElement("div"); d.style.backgroundImage = "url(\'a.png\')"; d.style.backgroundImage'), 'url(a.png)');
    assert.equal(run('getComputedStyle(document.body.appendChild(document.createElement("p"))).color'), '');
  } finally {
    await env?.teardown();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Jest environment: testEnvironmentOptions.fastFrames', async () => {
  const rootDir = fakeJestProject();
  for (const [options, fast] of [[{ fastFrames: true }, true], [{}, false]]) {
    const env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: options } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
    await env.setup();
    try {
      const ms = await vm.runInContext('(async () => { const t = Date.now(); for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); return Date.now() - t; })()', env.getVmContext());
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
    env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
    await env.setup();
    const run = (code) => vm.runInContext(code, env.getVmContext());
    assert.equal(run(`(() => { 'use strict';
      const real = document;
      global.document = { ...document, body: null };
      window.document = {};
      window.top = 1;
      global.window = 2;
      return [document === real, window.document === real, document.createElement('p').tagName, window.top === globalThis, window === globalThis].join();
    })()`), 'true,true,P,true,true');
    assert.equal(run(`(() => { 'use strict'; window.location = '#h'; return location.href; })()`), 'http://localhost/#h');
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
    env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: { jsdom: '20.0.3' } } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
    await env.setup();
    const seen = [];
    env.global.console = { error: (e) => seen.push([e instanceof Error, e.message, e.type]) };
    vm.runInContext('alert("x"); getComputedStyle(document.body, "::before"); document.createElement("form").submit()', env.getVmContext());
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
    env = new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
    await env.setup();
    const context = env.getVmContext();
    // Values from the test's realm, copied out.
    const run = (code) => { const v = vm.runInContext(code, context); return typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v; };
    run('globalThis.seen = []; window.addEventListener("x", () => seen.push("window")); globalThis.el = document.body.appendChild(document.createElement("p")); el.addEventListener("click", () => seen.push("click"));');
    await env.teardown();
    assert.deepEqual(run('["document", "location", "history", "localStorage", "sessionStorage"].map((n) => typeof globalThis[n])'), Array(5).fill('undefined'));
    assert.deepEqual(run('[typeof queueMicrotask, typeof Node, typeof Event, typeof getComputedStyle, window === globalThis, typeof navigator]'),
      ['function', 'function', 'function', 'function', true, 'object']);
    assert.deepEqual(run('[setTimeout(() => seen.push("timeout"), 0), setInterval(() => seen.push("interval"), 0)]'), [0, 0]);
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
test('Jest environment: Jest\'s helpers come from the running jest-runtime, in a layout with several Jest versions', async () => {
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
  pkg(nested, 'jest-util', 'exports.installCommonGlobals = (g) => { g.process = { env: {} }; g.jestUtil = 30; return g; };');
  pkg(nested, 'jest-mock', 'exports.ModuleMocker = class { constructor() { this.version = 30; } replaceProperty() {} };');
  pkg(nested, '@jest/fake-timers', 'class T { constructor() { this.version = 30; } dispose() {} }\nexports.LegacyFakeTimers = T; exports.ModernFakeTimers = T;');
  const cache = createRequire(import.meta.url).cache;
  const make = () => new WarpdomEnvironment({ globalConfig: {}, projectConfig: { rootDir, testEnvironmentOptions: {} } }, { console, docblockPragmas: {}, testPath: join(rootDir, 'a.test.js') });
  try {
    // No Jest running: the project's copies.
    let env = make();
    assert.equal(env.moduleMocker.version, 27);
    await env.teardown();
    // jest-runner has loaded jest-runtime: its copies.
    createRequire(import.meta.url)(runtime);
    env = make();
    assert.deepEqual([env.moduleMocker.version, typeof env.moduleMocker.replaceProperty, env.fakeTimers.version, env.fakeTimersModern.version, env.global.jestUtil], [30, 'function', 30, 30, 30]);
    await env.teardown();
  } finally {
    delete cache[runtime];
    rmSync(rootDir, { recursive: true, force: true });
  }
});
