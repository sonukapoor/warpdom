// Request mocking with XMLHttpRequest (#22): msw, nock and axios in a Vitest
// project (fixtures/vitest-xhr-mocks), on warpdom in the forks and
// vmThreads pools and on jsdom (forks; jsdom's VM context lacks the web
// streams msw and nock need) with the same specs. axios takes its
// XMLHttpRequest adapter, as with jsdom; msw answers the requests the
// XMLHttpRequest makes (so a cross-origin response needs
// Access-Control-Allow-Origin, on both), nock answers XMLHttpRequest itself.
// With environmentOptions.warpdom.xhr false there is no XMLHttpRequest and
// axios takes Node's http client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function vitest(args) {
  try {
    return { code: 0, out: String(execFileSync('node_modules/.bin/vitest', ['run', '--root', 'fixtures/vitest-xhr-mocks', ...args], { cwd: root, stdio: 'pipe' })) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout) + String(err.stderr) };
  }
}

for (const [pool, environment] of [['forks', []], ['vmThreads', []], ['forks', ['--environment', 'jsdom']]]) {
  test(`msw, nock and axios with XMLHttpRequest: ${environment.length ? 'jsdom' : 'warpdom'}, ${pool}`, () => {
    const { code, out } = vitest(['--pool', pool, ...environment]);
    assert.equal(code, 0, out);
    assert.match(out, /Tests\s+6 passed \(6\)/);
  });
}

test('xhr: false in Vitest: no XMLHttpRequest, axios through Node\'s http client (nock)', () => {
  const { code, out } = vitest(['--config', 'vitest.no-xhr.config.js']);
  assert.equal(code, 0, out);
  assert.match(out, /Tests\s+1 passed \(1\)/);
});
