import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
