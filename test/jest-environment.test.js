import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
