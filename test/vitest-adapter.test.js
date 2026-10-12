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
