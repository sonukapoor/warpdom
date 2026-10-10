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
