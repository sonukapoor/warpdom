import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsdomVersion } from '../src/vitest.js';

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
