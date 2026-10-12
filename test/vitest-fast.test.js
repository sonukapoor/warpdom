import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFastMode } from '../src/vitest-fast.js';
import { environment as ENVIRONMENT_PATH } from '../src/vitest-environment.js';
import { filesOf, failedFiles, merge, summary, newlyLeaky, chooseMode, splitArgs, withoutProjects } from '../src/vitest-fast-cli.js';
import { resolve } from 'node:path';

const withEnv = (env, fn) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try { return fn(); } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
};

test('withFastMode: unchanged until something is learned, or when isolated is faster', () => {
  const config = { test: { environment: '/path/to/env.js' } };
  assert.equal(withFastMode(config, { cache: '/nonexistent/fast-mode.json' }), config);
  assert.equal(withEnv({ WARPDOM_FAST_MODE: 'isolated' }, () => withFastMode(config)), config);
  // Except that the name 'warpdom' becomes the environment's path.
  assert.equal(withFastMode({ test: { environment: 'warpdom' } }, { cache: '/nonexistent' }).test.environment, ENVIRONMENT_PATH);
});

test('withFastMode: a fast project, and an isolated one for leaky files', () => {
  const config = { plugins: ['p'], test: { environment: 'warpdom', setupFiles: './setup.ts', exclude: ['e2e/**'] } };
  const out = withEnv({ WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: JSON.stringify(['src/leaky.test.ts']) }, () => withFastMode(config, { cache: '/nonexistent' }));
  assert.deepEqual(out.plugins, ['p']);
  assert.deepEqual(out.test.setupFiles, [], 'the projects take over the setup files');
  const [fast, isolated] = out.test.projects;
  assert.equal(fast.test.name, 'warpdom');
  assert.equal(fast.test.isolate, false);
  assert.match(fast.test.setupFiles[0], /vitest-reset\.js$/, 'the reset runs first');
  assert.equal(fast.test.setupFiles[1], './setup.ts');
  assert.deepEqual(fast.test.exclude, ['e2e/**', resolve('src/leaky.test.ts')]);
  assert.equal(isolated.test.name, 'warpdom (isolated)');
  assert.equal(isolated.test.isolate, true);
  assert.deepEqual(isolated.test.include, [resolve('src/leaky.test.ts')]);
  assert.deepEqual(isolated.test.setupFiles, ['./setup.ts']);
});

test('withFastMode: learning runs everything fast; existing projects are refused', () => {
  const out = withEnv({ WARPDOM_FAST_MODE: 'fast', WARPDOM_FAST_ISOLATE: '["x.test.ts"]' }, () => withFastMode({ test: {} }, { cache: '/nonexistent' }));
  assert.equal(out.test.projects.length, 1);
  assert.ok(out.test.projects[0].test.exclude.includes('**/node_modules/**'), "Vitest's default exclusions are kept");
});

test('withFastMode: a named project of several is split; others keep the root setup files', () => {
  const config = {
    test: {
      setupFiles: ['root.ts'],
      projects: [
        { extends: true, test: { name: 'unit', setupFiles: ['unit.ts'], environment: 'warpdom' } },
        { extends: true, test: { name: 'browser', setupFiles: ['browser.ts'] } },
      ],
    },
  };
  const env = { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: '["a.spec.ts"]' };
  const out = withEnv(env, () => withFastMode(config, { project: 'unit', cache: '/nonexistent' }));
  assert.deepEqual(out.test.projects.map((p) => p.test.name), ['browser', 'unit', 'unit (isolated)']);
  assert.deepEqual(out.test.projects[0].test.setupFiles, ['root.ts', 'browser.ts']);
  assert.deepEqual(out.test.projects[1].test.setupFiles.slice(1), ['root.ts', 'unit.ts']);
  assert.equal(out.test.projects[1].test.environment, ENVIRONMENT_PATH);
  const rerun = withEnv({ ...env, WARPDOM_FAST_RERUN: '1' }, () => withFastMode(config, { project: 'unit', cache: '/nonexistent' }));
  assert.deepEqual(rerun.test.projects.map((p) => p.test.name), ['unit (isolated)']);
  assert.throws(() => withEnv(env, () => withFastMode(config, { cache: '/nonexistent' })), /name the project/);
  const fn = withFastMode(() => config, { project: 'unit', cache: '/nonexistent' });
  assert.equal(typeof fn, 'function');
  assert.equal(withEnv(env, () => fn({})).test.projects.length, 3, 'config functions are wrapped');
  const promised = withFastMode(Promise.resolve(config), { project: 'unit', cache: '/nonexistent' });
  assert.equal(typeof promised.then, 'function', 'config promises too');
  assert.deepEqual(splitArgs(['--project', 'unit', '--project=x', 'a']), ['--project', 'unit', '--project', 'unit (isolated)', '--project=x', '--project=x (isolated)', 'a']);
  assert.deepEqual(withoutProjects(['--project', 'unit', '--project=x', 'a']), ['a']);
});

test('fast mode CLI: rerun, merge, learn', () => {
  const report = (files) => ({ testResults: files.map(([name, status, tests]) => ({ name, status, assertionResults: tests.map(([fullName, s]) => ({ fullName, status: s })) })) });
  const first = filesOf(report([
    ['/a.test.ts', 'passed', [['a1', 'passed']]],
    ['/b.test.ts', 'failed', [['b1', 'failed'], ['b2', 'passed']]],
    ['/c.test.ts', 'failed', []],
    ['/d.test.ts', 'failed', [['d1', 'failed']]],
  ]));
  const rerunList = failedFiles(first, new Set(['/d.test.ts']));
  assert.deepEqual(rerunList, ['/b.test.ts', '/c.test.ts'], 'failed files, file-level failures too, not those already isolated');
  const rerun = filesOf(report([['/b.test.ts', 'passed', [['b1', 'passed'], ['b2', 'passed']]], ['/c.test.ts', 'failed', [['c1', 'failed']]]]));
  assert.deepEqual(newlyLeaky(rerunList, rerun), ['/b.test.ts'], 'b passes isolated: it leaks; c fails isolated too: a real failure');
  assert.deepEqual(summary(merge(first, rerun)), { passed: 3, failed: 2, skipped: 0, failedFiles: 2 });
  assert.equal(chooseMode(10, 5), 'split');
  assert.equal(chooseMode(10, 10), 'isolated');
  assert.equal(chooseMode(10, 12), 'isolated');
});
