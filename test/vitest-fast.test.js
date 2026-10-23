import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFastMode, fsId, projectCliOptions, REPORTER } from '../src/vitest-fast.js';
import { environment as ENVIRONMENT_PATH } from '../src/vitest-environment.js';
import {
  filesOf,
  untrusted,
  unattributedErrors,
  errorFiles,
  differingFiles,
  merge,
  summary,
  chooseMode,
  slowSplit,
  afterSplitRun,
  cliOptions,
  deadline,
  SLOW_RUNS,
  RELEARN_AFTER,
  SUITE_CHANGE,
  MARGIN,
  LEARN_DEADLINE,
  RUN_DEADLINE,
  SPLIT_RUNS,
  splitArgs,
  withoutProjects,
  namesReporters,
  main,
} from '../src/vitest-fast-cli.js';
import { runReport, stackFiles } from '../src/vitest-fast-reporter.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const withEnv = (env, fn) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
};
const NO_CACHE = { cache: '/nonexistent/fast-mode.json' };
async function quietly(fn) {
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try {
    return await fn();
  } finally {
    process.stderr.write = write;
  }
}

// --- the config transform ---------------------------------------------------------

test('withFastMode: unchanged until something is learned, or when isolated is faster', () => {
  const config = { test: { environment: '/path/to/env.js' } };
  assert.equal(withFastMode(config, NO_CACHE), config);
  assert.equal(
    withEnv({ WARPDOM_FAST_MODE: 'isolated' }, () => withFastMode(config)),
    config,
  );
  // Except that the name 'warpdom' becomes the environment's path.
  assert.equal(withFastMode({ test: { environment: 'warpdom' } }, NO_CACHE).test.environment, ENVIRONMENT_PATH);
});

test('withFastMode: a fast project, and an isolated one for the files to isolate', () => {
  const config = {
    plugins: ['p'],
    test: { environment: 'warpdom', setupFiles: './setup.ts', include: ['src/**/*.test.ts'], exclude: ['e2e/**'] },
  };
  const out = withEnv({ WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: JSON.stringify(['src/leaky.test.ts']) }, () =>
    withFastMode(config, NO_CACHE),
  );
  assert.deepEqual(out.plugins, ['p']);
  assert.deepEqual(out.test.setupFiles, [], 'the projects take over the setup files');
  assert.equal(
    out.test.include,
    undefined,
    'and the include: merged into a project that extends the file, it made the isolated project run every file',
  );
  const [fast, isolated] = out.test.projects;
  assert.equal(fast.test.name, 'warpdom');
  assert.equal(fast.test.isolate, false);
  assert.equal(
    fast.test.environment,
    fsId(ENVIRONMENT_PATH),
    "the environment as a /@fs/ id (Vitest 3's shared workers)",
  );
  assert.match(fast.test.setupFiles[0], /vitest-reset\.js$/, 'the reset runs first');
  assert.equal(fast.test.setupFiles[1], './setup.ts');
  assert.deepEqual(fast.test.include, ['src/**/*.test.ts']);
  assert.deepEqual(fast.test.exclude, ['e2e/**', resolve('src/leaky.test.ts')]);
  assert.equal(isolated.test.name, 'warpdom (isolated)');
  assert.equal(isolated.test.isolate, true);
  assert.deepEqual(isolated.test.include, [resolve('src/leaky.test.ts')]);
  assert.deepEqual(isolated.test.setupFiles, ['./setup.ts']);
  assert.equal(isolated.test.typecheck.enabled, false, 'type tests run once, in the fast project');
  // Without test.projects both stand for the root project: they get its command-line options.
  assert.deepEqual(
    fast.plugins.map((p) => p.name),
    ['warpdom:fast-mode-cli-options'],
  );
  assert.deepEqual(
    isolated.plugins.map((p) => p.name),
    ['warpdom:fast-mode-cli-options'],
  );
});

test('withFastMode: learning runs everything fast; a rerun only the files it names', () => {
  const out = withEnv({ WARPDOM_FAST_MODE: 'fast', WARPDOM_FAST_ISOLATE: '["x.test.ts"]' }, () =>
    withFastMode({ test: {} }, NO_CACHE),
  );
  assert.equal(out.test.projects.length, 1);
  assert.ok(out.test.projects[0].test.exclude.includes('**/node_modules/**'), "Vitest's default exclusions are kept");
  const dir = mkdtempSync(join(tmpdir(), 'warpdom-fast-'));
  const cache = join(dir, 'fast-mode.json');
  writeFileSync(cache, JSON.stringify({ version: 2, mode: 'split', isolate: ['old.test.ts'], leaky: [] }));
  const rerun = withEnv({ WARPDOM_FAST_ISOLATE: '["new.test.ts"]', WARPDOM_FAST_RERUN: '1' }, () =>
    withFastMode({ test: {} }, { cache }),
  );
  assert.deepEqual(
    rerun.test.projects.map((p) => [p.test.name, p.test.include]),
    [['warpdom (isolated)', [resolve('new.test.ts')]]],
  );
  const split = withFastMode({ test: {} }, { cache });
  assert.deepEqual(split.test.projects[1].test.include, [resolve('old.test.ts')], 'the cache says split');
  writeFileSync(cache, JSON.stringify({ version: 1, mode: 'split', leaky: ['old.test.ts'] }));
  const config = { test: {} };
  assert.equal(withFastMode(config, { cache }), config, 'a version 1 state counts as nothing learned');
  rmSync(dir, { recursive: true, force: true });
});

test("withFastMode: the CLI's reporter after the configured reporters, unless the arguments carry it", () => {
  const report = { WARPDOM_FAST_REPORT: '/tmp/r.json', GITHUB_ACTIONS: '' };
  const plain = withEnv({ ...report, WARPDOM_FAST_MODE: 'isolated' }, () => withFastMode({ test: {} }, NO_CACHE));
  assert.deepEqual(plain.test.reporters, ['default', REPORTER]);
  const own = withEnv({ ...report, WARPDOM_FAST_MODE: 'split' }, () =>
    withFastMode({ test: { reporters: [['junit', {}]] } }, NO_CACHE),
  );
  assert.deepEqual(own.test.reporters, [['junit', {}], REPORTER]);
  const cli = { test: {} };
  assert.equal(
    withEnv({ ...report, WARPDOM_FAST_REPORTER: 'cli', WARPDOM_FAST_MODE: 'isolated' }, () =>
      withFastMode(cli, NO_CACHE),
    ),
    cli,
  );
  assert.ok(namesReporters(['--reporter=dot']) && namesReporters(['--reporter', 'dot']) && !namesReporters(['--run']));
});

test('withFastMode: a named project of several is split; others keep the root setup files', () => {
  const config = {
    test: {
      setupFiles: ['root.ts'],
      include: ['**/*.spec.ts'],
      projects: [
        { extends: true, test: { name: 'unit', setupFiles: ['unit.ts'], environment: 'warpdom' } },
        { extends: true, test: { name: 'browser', setupFiles: ['browser.ts'] } },
      ],
    },
  };
  const env = { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: '["a.spec.ts"]' };
  const out = withEnv(env, () => withFastMode(config, { project: 'unit', ...NO_CACHE }));
  assert.deepEqual(
    out.test.projects.map((p) => p.test.name),
    ['browser', 'unit', 'unit (isolated)'],
  );
  assert.deepEqual(out.test.projects[0].test.setupFiles, ['root.ts', 'browser.ts']);
  assert.deepEqual(
    out.test.projects[0].test.include,
    ['**/*.spec.ts'],
    'projects that extend the root keep its include',
  );
  assert.deepEqual(out.test.projects[1].test.setupFiles.slice(1), ['root.ts', 'unit.ts']);
  assert.equal(out.test.projects[1].test.environment, fsId(ENVIRONMENT_PATH));
  assert.deepEqual(
    out.test.projects[1].plugins,
    [],
    'test.projects: Vitest passes the command line to projects itself',
  );
  const rerun = withEnv({ ...env, WARPDOM_FAST_RERUN: '1' }, () =>
    withFastMode(config, { project: 'unit', ...NO_CACHE }),
  );
  assert.deepEqual(
    rerun.test.projects.map((p) => p.test.name),
    ['unit (isolated)'],
  );
  assert.throws(() => withEnv(env, () => withFastMode(config, NO_CACHE)), /name the project/);
  const fn = withFastMode(() => config, { project: 'unit', ...NO_CACHE });
  assert.equal(typeof fn, 'function');
  assert.equal(withEnv(env, () => fn({})).test.projects.length, 3, 'config functions are wrapped');
  const promised = withFastMode(Promise.resolve(config), { project: 'unit', ...NO_CACHE });
  assert.equal(typeof promised.then, 'function', 'config promises too');
  assert.deepEqual(splitArgs(['--project', 'unit', '--project=x', 'a']), [
    '--project',
    'unit',
    '--project',
    'unit (isolated)',
    '--project=x',
    '--project=x (isolated)',
    'a',
  ]);
  assert.deepEqual(withoutProjects(['--project', 'unit', '--project=x', 'a']), ['a']);
});

test('fsId: absolute paths in /@fs/ form, the rest unchanged', () => {
  assert.equal(fsId('/a/b/vitest.js'), '/@fs/a/b/vitest.js');
  assert.equal(fsId('/@fs/a/b.js'), '/@fs/a/b.js');
  assert.equal(fsId('jsdom'), 'jsdom');
  assert.equal(fsId('./env.js'), './env.js');
  assert.equal(fsId(undefined), undefined);
});

test("projectCliOptions: the root's command-line options a project needs (typecheck, ...), not the runner's", () => {
  const options = {
    typecheck: { enabled: false },
    coverage: { enabled: false },
    retry: 0,
    reporter: ['json'],
    isolate: true,
    hookTimeout: 5,
    environment: 'warpdom',
  };
  assert.deepEqual(projectCliOptions(options), {
    typecheck: { enabled: false },
    hookTimeout: 5,
    environment: ENVIRONMENT_PATH,
  });
  assert.equal(projectCliOptions(options, { fast: true }).environment, fsId(ENVIRONMENT_PATH));
  assert.deepEqual(projectCliOptions({}), {});
});

// --- the decision rule ------------------------------------------------------------

test('chooseMode: split only when it beats isolated by more than the noise margin', () => {
  assert.equal(MARGIN, 0.05);
  assert.equal(chooseMode(100, 50), 'split');
  assert.equal(chooseMode(100, 94.9), 'split');
  assert.equal(chooseMode(100, 95), 'isolated', 'a 5% gain is within the margin');
  assert.equal(chooseMode(100, 97), 'isolated', 'CI noise is up to 3% (95th percentile)');
  assert.equal(chooseMode(100, 100), 'isolated');
  assert.equal(chooseMode(100, 120), 'isolated');
  assert.equal(chooseMode(4, 3.6), 'isolated', 'and by at least half a second (small suites: startup jitter)');
  assert.equal(chooseMode(4, 3.4), 'split');
  assert.equal(chooseMode(100, null), 'isolated', 'a missing time is not faster');
  assert.equal(chooseMode(undefined, 5), 'isolated');
  assert.equal(slowSplit(100, 99), false);
  assert.equal(slowSplit(100, 105), false, 'within the margin of the learned isolated time: not slow');
  assert.equal(slowSplit(100, 105.1), true);
  assert.equal(slowSplit(4, 4.5), false, 'and at least half a second');
  assert.equal(slowSplit(4, 4.6), true);
  assert.equal(slowSplit(undefined, 10), true, 'no learned time: no evidence that split pays');
  assert.equal(deadline(100, LEARN_DEADLINE), 135);
  assert.equal(deadline(100, RUN_DEADLINE), 180);
  assert.equal(deadline(undefined, RUN_DEADLINE), null);
});

test('after a split run: one slow run does not switch the mode', () => {
  assert.deepEqual([SLOW_RUNS, RELEARN_AFTER, SUITE_CHANGE], [3, 10, 0.1]);
  const learned = {
    mode: 'split',
    isolate: [],
    leaky: [],
    learned: { isolated: 100, split: 60, files: 50 },
    runs: [],
    slowStreak: 0,
  };
  // A slow runner (1.6x): 96 s against 60 s learned, then normal again.
  let { state, switched } = afterSplitRun(learned, { seconds: 160, files: 50 });
  assert.equal(switched, false);
  assert.deepEqual([state.mode, state.slowStreak, state.runs], ['split', 1, [160]]);
  ({ state, switched } = afterSplitRun(state, { seconds: 61, files: 50 }));
  assert.deepEqual([switched, state.mode, state.slowStreak], [false, 'split', 0], 'a faster run resets the count');
  ({ state } = afterSplitRun(state, { seconds: 150, files: 50 }));
  ({ state, switched } = afterSplitRun(state, { seconds: 150, files: 50 }));
  assert.deepEqual([switched, state.mode, state.slowStreak], [false, 'split', 2], 'two in a row are not enough either');
});

test('after a split run: persistent slowness switches to isolated, with the reason, the times and a re-learning due', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  let state = {
    mode: 'split',
    isolate: [],
    leaky: [],
    learned: { isolated: 100, split: 60, files: 50 },
    runs: [],
    decisions: [{ at: 'x', mode: 'split', reason: 'learned' }],
  };
  for (const seconds of [110, 120]) ({ state } = afterSplitRun(state, { seconds, files: 50 }, { now }));
  const out = afterSplitRun(state, { seconds: 130, files: 50 }, { now });
  assert.equal(out.switched, true);
  assert.equal(out.state.mode, 'isolated');
  assert.equal(out.state.relearnIn, RELEARN_AFTER);
  assert.match(
    out.state.reason,
    /^3 split runs in a row took longer than the learned isolated 100 s plus the margin \(last 110, 120, 130 s\)$/,
  );
  assert.deepEqual(
    out.state.decisions.map((d) => d.mode),
    ['split', 'isolated'],
    'every decision is kept, newest last',
  );
  assert.deepEqual(out.state.decisions[1], {
    at: now.toISOString(),
    mode: 'isolated',
    reason: out.state.reason,
    isolated: 100,
    splitRuns: [110, 120, 130],
  });
  // Configurable: --slow-runs and --relearn-after (0: never).
  const quick = afterSplitRun(
    { ...state, slowStreak: 0 },
    { seconds: 130, files: 50 },
    { slowRuns: 1, relearnAfter: 0 },
  );
  assert.deepEqual([quick.switched, quick.state.relearnIn], [true, undefined]);
  // Slow by less than the margin is not slow.
  let near = { ...state, slowStreak: 0 };
  for (let i = 0; i < 5; i++) ({ state: near } = afterSplitRun(near, { seconds: 104, files: 50 }));
  assert.deepEqual([near.mode, near.slowStreak], ['split', 0]);
});

test('after a split run: a suite whose test files changed by more than 10% learns again', () => {
  const state = { mode: 'split', isolate: [], leaky: [], learned: { isolated: 100, files: 50 }, runs: [] };
  assert.equal(afterSplitRun(state, { seconds: 50, files: 55 }).state.relearn, undefined, '10% is not a change');
  assert.match(afterSplitRun(state, { seconds: 50, files: 56 }).state.relearn, /56 test files, learned with 50/);
  assert.match(afterSplitRun(state, { seconds: 50, files: 44 }).state.relearn, /44 test files/);
  assert.equal(
    afterSplitRun({ ...state, learned: { isolated: 100 } }, { seconds: 50, files: 5 }).state.relearn,
    undefined,
    'older states have no file count',
  );
});

test('the CLI options: --learn, --slow-runs, --relearn-after; the rest goes to Vitest', () => {
  assert.deepEqual(cliOptions(['run', '--learn', '--slow-runs=2', '--relearn-after=0', '--project', 'unit']), {
    args: ['--project', 'unit'],
    relearn: true,
    options: { slowRuns: 2, relearnAfter: 0 },
  });
  assert.deepEqual(cliOptions(['--slow-runs=0']).options, { slowRuns: 1 }, 'at least one');
});

// --- results ----------------------------------------------------------------------

const report = (files, errors = []) => ({
  files: files.map(([file, state, tests, typecheck]) => ({
    file,
    project: 'warpdom',
    state,
    tests,
    ...(typecheck ? { typecheck } : {}),
  })),
  errors,
});
const runOf = (r) => ({ files: filesOf(r), errors: r.errors ?? [] });

test('results: differing files, missing tests and files, unhandled errors', () => {
  const iso = runOf(
    report([
      ['/a', 'passed', [['t', 'passed']]],
      [
        '/b',
        'passed',
        [
          ['t', 'passed'],
          ['u', 'skipped'],
        ],
      ],
      ['/c', 'passed', [['t', 'passed']]],
      ['/d', 'failed', [['t', 'failed']]],
      [
        '/e',
        'passed',
        [
          ['t', 'passed'],
          ['t', 'passed'],
        ],
      ],
      ['/f', 'passed', [['t', 'passed']]],
    ]),
  );
  const shared = runOf(
    report(
      [
        ['/a', 'passed', [['t', 'passed']]],
        [
          '/b',
          'passed',
          [
            ['t', 'passed'],
            ['u', 'pending'],
          ],
        ], // a test that did not run (a hang, a timeout)
        ['/d', 'failed', [['t', 'failed']]],
        ['/e', 'passed', [['t', 'passed']]], // one of two same-named tests missing
        ['/f', 'passed', [['t', 'passed']]],
        ['/types.spec-d.ts', 'failed', [['x', 'failed']], true],
      ],
      [
        { file: '/f', message: 'boom' },
        { file: null, message: 'where?' },
      ],
    ),
  );
  assert.deepEqual([...differingFiles(iso, shared)].sort(), ['/b', '/c', '/e'], 'c has no result at all');
  assert.deepEqual(
    [...untrusted(shared)].sort(),
    ['/d', '/f'],
    'failed, or an unhandled error from the file; type tests never',
  );
  assert.equal(unattributedErrors(shared), 1);
  assert.deepEqual(differingFiles(iso, iso), new Set());
});

test('results: rerun results replace the first, summary counts', () => {
  const first = filesOf(
    report([
      ['/a', 'passed', [['a1', 'passed']]],
      [
        '/b',
        'failed',
        [
          ['b1', 'failed'],
          ['b2', 'passed'],
        ],
      ],
      ['/c', 'failed', []],
    ]),
  );
  const rerun = filesOf(
    report([
      [
        '/b',
        'passed',
        [
          ['b1', 'passed'],
          ['b2', 'passed'],
        ],
      ],
      ['/c', 'failed', [['c1', 'failed']]],
    ]),
  );
  assert.deepEqual(summary(merge(first, rerun)), { passed: 3, failed: 1, skipped: 0, failedFiles: 1 });
});

test('the reporter: per file its project, state and tests; errors with their file', () => {
  const tests = [
    { fullName: 'x > t', result: () => ({ state: 'passed' }) },
    { fullName: 'u', result: () => undefined },
  ];
  const module = {
    moduleId: '/a.test.ts',
    project: { name: 'warpdom' },
    state: () => 'passed',
    children: { allTests: () => tests },
    task: { meta: {} },
  };
  const typeModule = { ...module, moduleId: '/t.test-d.ts', task: { meta: { typecheck: true } } };
  const out = runReport(
    [module, typeModule],
    [{ message: 'm', VITEST_TEST_PATH: '/a.test.ts' }, new Error('n')],
    'passed',
  );
  assert.deepEqual(out.files[0], {
    file: '/a.test.ts',
    project: 'warpdom',
    state: 'passed',
    tests: [
      ['x > t', 'passed'],
      ['u', 'pending'],
    ],
  });
  assert.equal(out.files[1].typecheck, true);
  assert.deepEqual(out.errors, [
    { file: '/a.test.ts', sources: [], message: 'm' },
    { file: null, sources: [], message: 'n' },
  ]);
});

test("the reporter: an error's sources are the run's test files its stack names", () => {
  const module = (moduleId) => ({
    moduleId,
    project: { name: 'warpdom' },
    state: () => 'passed',
    children: { allTests: () => [] },
    task: { meta: {} },
  });
  const modules = [module('/p/a.test.ts'), module('/p/b.test.ts')];
  // Vitest's parsed frames: an un-awaited vi.waitFor of a, timing out while b runs.
  const parsed = {
    message: 'Timed out in waitFor!',
    VITEST_TEST_PATH: '/p/b.test.ts',
    stacks: [{ file: '/p/node_modules/vitest/dist/chunk.js' }, { file: '/p/a.test.ts' }, { file: '/p/a.test.ts' }],
  };
  // Only the stack text: absolute paths and file URLs.
  const text = {
    message: 'x',
    VITEST_TEST_PATH: '/p/b.test.ts',
    stack:
      'Error: x\n    at f (file:///p/node_modules/x.js:1:2)\n    at /p/a.test.ts:70:8\n    at g (file:///p/b.test.ts:3:4)\n    at new Promise (<anonymous>)',
  };
  const none = { message: 'y', VITEST_TEST_PATH: '/p/b.test.ts', stack: 'Error: y\n    at h (/p/src/lib.js:1:1)' };
  const out = runReport(modules, [parsed, text, none]);
  assert.deepEqual(
    out.errors.map((e) => [e.file, e.sources]),
    [
      ['/p/b.test.ts', ['/p/a.test.ts']],
      ['/p/b.test.ts', ['/p/a.test.ts', '/p/b.test.ts']],
      ['/p/b.test.ts', []],
    ],
  );
  assert.deepEqual(stackFiles(text), ['/p/node_modules/x.js', '/p/a.test.ts', '/p/b.test.ts']);
  assert.deepEqual(stackFiles({}), []);
});

test('results: an unhandled error counts against the files it comes from, else the file running', () => {
  assert.deepEqual(errorFiles({ file: '/b', sources: ['/a'] }), ['/a']);
  assert.deepEqual(errorFiles({ file: '/b', sources: [] }), ['/b']);
  assert.deepEqual(errorFiles({ file: '/b' }), ['/b'], 'reports without sources');
  assert.deepEqual(errorFiles({ file: null, sources: ['/a'] }), ['/a']);
  const run = runOf(
    report(
      [
        ['/a', 'passed', [['t', 'passed']]],
        ['/b', 'passed', [['t', 'passed']]],
      ],
      [
        { file: '/b', sources: ['/a'], message: 'thrown by a while b ran' },
        { file: null, sources: ['/a'], message: 'thrown by a after the run' },
      ],
    ),
  );
  assert.deepEqual([...untrusted(run)], ['/a']);
  assert.equal(unattributedErrors(run), 0);
});

// --- with real Vitest (fixtures/vitest-fast) ---------------------------------------

const fixture = join(root, 'fixtures/vitest-fast');
const vitest = join(root, 'node_modules/vitest/vitest.mjs');
const listFiles = (env, args = []) =>
  String(
    execFileSync(process.execPath, [vitest, 'list', '--filesOnly', ...args], {
      cwd: fixture,
      stdio: 'pipe',
      env: { ...process.env, ...env, FAST_FIXTURE_CACHE: '/nonexistent/fast-mode.json' },
    }),
  )
    .split('\n')
    .filter((l) => /\.spec(-d)?\.[jt]s$/.test(l))
    .map((l) => l.replace(/^\[[^\]]+\] /, ''))
    .sort();

test("split runs exactly the project's own files: --typecheck.enabled=false keeps type tests out", () => {
  const off = ['--typecheck.enabled=false'];
  const plain = listFiles({ WARPDOM_FAST_MODE: 'isolated' }, off);
  assert.deepEqual(plain, ['a-sets.spec.js', 'b-reads.spec.js', 'c-clean.spec.js']);
  assert.deepEqual(
    listFiles({ WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: '["b-reads.spec.js"]' }, off),
    plain,
    'split: each file once, no type tests',
  );
  assert.deepEqual(listFiles({ WARPDOM_FAST_MODE: 'fast' }, off), plain);
  assert.deepEqual(
    listFiles(
      { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: '["b-reads.spec.js"]', WARPDOM_FAST_RERUN: '1' },
      off,
    ),
    ['b-reads.spec.js'],
  );
  const typed = listFiles({ WARPDOM_FAST_MODE: 'isolated' });
  assert.ok(typed.includes('types.spec-d.ts'), 'typecheck on in the config: type tests listed');
  assert.deepEqual(
    listFiles({ WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: '["b-reads.spec.js"]' }),
    typed,
    'and once in the split too',
  );
});

test('warpdom vitest run: learning finds the leaking file; a newly leaking file is rerun, not a false failure', async () => {
  const cacheFile = join(fixture, '.warpdom/fast-mode.json');
  rmSync(join(fixture, '.warpdom'), { recursive: true, force: true });
  try {
    const code = await quietly(() => main(['run', '--learn', '--typecheck.enabled=false'], fixture));
    assert.equal(code, 0);
    const state = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.deepEqual(state.isolate, ['b-reads.spec.js']);
    assert.deepEqual(state.leaky, ['b-reads.spec.js']);
    assert.ok(['split', 'isolated'].includes(state.mode));
    assert.ok(state.learned.isolated > 0 && state.learned.split > 0);
    // Split mode with nothing isolated: b fails without isolation, passes on
    // its rerun, and runs isolated from then on.
    writeFileSync(
      cacheFile,
      JSON.stringify({ version: 2, mode: 'split', isolate: [], leaky: [], learned: { isolated: 600 } }),
    );
    assert.equal(
      await quietly(() => main(['run', '--typecheck.enabled=false'], fixture)),
      0,
      'the rerun result counts',
    );
    const after = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.deepEqual(
      [after.mode, after.isolate, after.leaky, after.runs.length],
      ['split', ['b-reads.spec.js'], ['b-reads.spec.js'], 1],
    );
  } finally {
    rmSync(join(fixture, '.warpdom'), { recursive: true, force: true });
  }
});

test('warpdom vitest run: an error a file leaves behind isolates that file, not the one running when it is thrown', async () => {
  // a-leaves.spec.js leaves an un-awaited vi.waitFor that times out while
  // b-waits.spec.js (and, with b isolated, c-waits.spec.js) runs. Isolating
  // the running file moved the error to the next one, and the learning
  // ended in isolated mode with b and c isolated.
  const stray = join(root, 'fixtures/vitest-fast-stray');
  const cacheFile = join(stray, '.warpdom/fast-mode.json');
  rmSync(join(stray, '.warpdom'), { recursive: true, force: true });
  try {
    assert.equal(await quietly(() => main(['run', '--learn'], stray)), 0);
    const state = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.deepEqual([state.isolate, state.leaky], [['a-leaves.spec.js'], ['a-leaves.spec.js']]);
    assert.match(state.reason, /^split /, 'the split reproduced the isolated run');
    // Split mode with nothing isolated: the error is a's, so a is rerun and isolated.
    writeFileSync(
      cacheFile,
      JSON.stringify({ version: 2, mode: 'split', isolate: [], leaky: [], learned: { isolated: 600 } }),
    );
    assert.equal(await quietly(() => main(['run'], stray)), 0);
    const after = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.deepEqual([after.mode, after.isolate], ['split', ['a-leaves.spec.js']]);
  } finally {
    rmSync(join(stray, '.warpdom'), { recursive: true, force: true });
  }
});

// --- hangs, timeouts and missing results (a stand-in for Vitest) --------------------

// A project whose "Vitest" sleeps, then writes the report the scenario
// gives for the run's mode (WARPDOM_FAST_MODE; 'rerun' for reruns).
// scenario(dir) -> { [mode]: { sleep, files, errors } }.
function fakeVitest(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'warpdom-fake-vitest-'));
  const pkg = join(dir, 'node_modules/vitest');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}');
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'vitest', version: '3.2.4', type: 'module', bin: { vitest: 'vitest.mjs' } }),
  );
  writeFileSync(
    join(pkg, 'vitest.mjs'),
    `
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
const scenario = ${JSON.stringify(scenario(dir))};
const mode = process.env.WARPDOM_FAST_RERUN === '1' ? 'rerun' : process.env.WARPDOM_FAST_MODE;
const reportFile = process.env.WARPDOM_FAST_REPORT;
appendFileSync(${JSON.stringify(join(dir, 'runs.log'))}, mode + (reportFile ? '' : ' (in process)') + '\\n');
// A list: one entry per run of the mode, in order (the last repeats).
const n = readFileSync(${JSON.stringify(join(dir, 'runs.log'))}, 'utf8').trim().split('\\n').filter((m) => m.split(' ')[0] === mode).length - 1;
const entry = scenario[mode] ?? scenario.isolated;
const s = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
if (reportFile) setTimeout(() => {
  writeFileSync(reportFile, JSON.stringify({ reason: 'passed', files: s.files, errors: s.errors ?? [] }));
  process.exit(s.files.some((f) => f.state === 'failed') ? 1 : 0);
}, (s.sleep ?? 0) * 1000);
`,
  );
  return {
    dir,
    runs: () =>
      existsSync(join(dir, 'runs.log')) ? readFileSync(join(dir, 'runs.log'), 'utf8').trim().split('\n') : [],
    state: () => JSON.parse(readFileSync(join(dir, '.warpdom/fast-mode.json'), 'utf8')),
    setState: (s) => {
      mkdirSync(join(dir, '.warpdom'), { recursive: true });
      writeFileSync(join(dir, '.warpdom/fast-mode.json'), JSON.stringify({ version: 2, ...s }));
    },
  };
}
const passing = (dir, ...names) =>
  names.map((n) => ({ file: join(dir, n), project: 'warpdom', state: 'passed', tests: [['t', 'passed']] }));
const short = { learn: { factor: 1, seconds: 1.5 }, run: { factor: 1, seconds: 1.5 } };

test('learning: a run without isolation that hangs is stopped at its deadline, and the mode is isolated', async () => {
  const fake = fakeVitest((d) => ({ isolated: { files: passing(d, 'a') }, fast: { sleep: 60, files: [] } }));
  const started = Date.now();
  assert.equal(await quietly(() => main(['run'], fake.dir, short)), 0, 'the result is the isolated run');
  assert.ok(Date.now() - started < 20000, 'stopped, not waited for');
  assert.equal(fake.state().mode, 'isolated');
  assert.match(fake.state().reason, /fast run took longer than its deadline/);
  assert.deepEqual(fake.runs(), ['isolated', 'fast']);
});

test('learning: missing results without isolation isolate the file; split if equal and faster', async () => {
  const fake = fakeVitest((d) => {
    const iso = passing(d, 'a', 'b', 'c');
    return {
      isolated: { sleep: 3, files: iso },
      fast: { files: [iso[0], { ...iso[1], tests: [['t', 'pending']] }] }, // b's test never ran, c is missing
      split: { files: iso },
    };
  });
  await quietly(() => main(['run'], fake.dir, short));
  assert.deepEqual(fake.state().isolate, ['b', 'c']);
  assert.equal(fake.state().mode, 'split');
  assert.deepEqual(fake.runs(), ['isolated', 'fast', 'split']);
});

test('learning: unhandled errors without a file, or a split whose results differ twice, keep isolated mode', async () => {
  const err = fakeVitest((d) => ({
    isolated: { files: passing(d, 'a', 'b') },
    fast: { files: passing(d, 'a', 'b'), errors: [{ file: null, message: 'x' }] },
  }));
  await quietly(() => main(['run'], err.dir, short));
  assert.equal(err.state().mode, 'isolated');
  assert.match(err.state().reason, /unhandled errors outside any test file/);
  const differ = fakeVitest((d) => {
    const iso = passing(d, 'a', 'b');
    return {
      isolated: { sleep: 3, files: iso },
      fast: { files: iso },
      split: { files: [iso[0], { ...iso[1], state: 'failed', tests: [['t', 'failed']] }] },
    };
  });
  await quietly(() => main(['run'], differ.dir, short));
  assert.equal(differ.state().mode, 'isolated');
  assert.deepEqual(differ.state().differing, ['b']);
  assert.equal(SPLIT_RUNS, 4);
  assert.deepEqual(differ.runs(), ['isolated', 'fast', 'split', 'split', 'split', 'split']);
});

test('learning: errors left behind by files, one shown per split run, isolate those files over further split runs', async () => {
  // As naive-ui on CI: two files leave assertions behind that fail while
  // another file runs; each split run shows one of them (timing).
  const fake = fakeVitest((d) => {
    const iso = passing(d, 'a', 'b', 'c', 'd');
    const stray = (from) => ({ file: join(d, 'd'), sources: [join(d, from)], message: 'expected undefined to be top' });
    return {
      isolated: { sleep: 3, files: iso },
      fast: { files: iso },
      split: [{ files: iso, errors: [stray('a')] }, { files: iso, errors: [stray('b')] }, { files: iso }],
    };
  });
  await quietly(() => main(['run'], fake.dir, short));
  assert.deepEqual(
    [fake.state().mode, fake.state().isolate],
    ['split', ['a', 'b']],
    'the files the errors came from, not d',
  );
  assert.deepEqual(fake.runs(), ['isolated', 'fast', 'split', 'split', 'split']);
});

test('a split run that hangs is stopped, the run falls back to an isolated one, and the mode becomes isolated', async () => {
  const fake = fakeVitest((d) => ({ isolated: { files: passing(d, 'a') }, split: { sleep: 60, files: [] } }));
  fake.setState({ mode: 'split', isolate: [], leaky: [], learned: { isolated: 0.5 } });
  const started = Date.now();
  assert.equal(await quietly(() => main(['run'], fake.dir, short)), 0);
  assert.ok(Date.now() - started < 20000);
  assert.deepEqual(fake.runs(), ['split', 'isolated']);
  assert.equal(fake.state().mode, 'isolated');
  assert.match(fake.state().reason, /split run took longer than its deadline/);
});

test('split runs: failing files rerun once and isolated from then on, real failures too; a slow split ends split mode', async () => {
  const fake = fakeVitest((d) => {
    const files = passing(d, 'a', 'b', 'c');
    const failed = (f) => ({ ...f, state: 'failed', tests: [['t', 'failed']] });
    // 0.8 s: slow against a learned isolated time of 0.01 s (plus the 0.5 s margin).
    return {
      split: { sleep: 0.8, files: [files[0], failed(files[1]), failed(files[2])] },
      rerun: { files: [files[1], failed(files[2])] },
    };
  });
  fake.setState({ mode: 'split', isolate: [], leaky: [], learned: { isolated: 100 } });
  assert.equal(await quietly(() => main(['run'], fake.dir, short)), 1, 'c fails isolated too: a real failure');
  assert.deepEqual([fake.state().mode, fake.state().isolate, fake.state().leaky], ['split', ['b', 'c'], ['b']]);
  fake.setState({ ...fake.state(), learned: { isolated: 0.01 } });
  await quietly(() => main(['run'], fake.dir, short));
  assert.deepEqual([fake.state().mode, fake.state().slowStreak], ['split', 1], 'one slow split run is not evidence');
  await quietly(() => main(['run'], fake.dir, short));
  await quietly(() => main(['run'], fake.dir, short));
  assert.equal(fake.state().mode, 'isolated');
  assert.match(fake.state().reason, /^3 split runs in a row took longer than the learned isolated 0.01 s/);
});

test('split runs: a slow run between fast ones keeps split mode', async () => {
  // Learned isolated 3 s (slow beyond 3.5 s); the second split run takes 5 s.
  const fake = fakeVitest((d) => ({
    split: [{ files: passing(d, 'a') }, { sleep: 5, files: passing(d, 'a') }, { files: passing(d, 'a') }],
  }));
  fake.setState({ mode: 'split', isolate: [], leaky: [], learned: { isolated: 3, files: 1 } });
  const long = { learn: { factor: 1, seconds: 30 }, run: { factor: 1, seconds: 30 } };
  for (let i = 0; i < 3; i++) await quietly(() => main(['run'], fake.dir, long));
  assert.deepEqual(fake.runs(), ['split', 'split', 'split']);
  assert.deepEqual([fake.state().mode, fake.state().slowStreak, fake.state().runs.length], ['split', 0, 3]);
  assert.ok(fake.state().runs[1] >= 5);
});

test('isolated by slow split runs: plain runs, then learning again (recovery); isolated by a learning stays plain', async () => {
  const fake = fakeVitest((d) => ({
    isolated: { sleep: 3, files: passing(d, 'a', 'b') },
    fast: { files: passing(d, 'a', 'b') },
    split: { files: passing(d, 'a', 'b') },
  }));
  fake.setState({
    mode: 'isolated',
    reason: '3 split runs in a row ...',
    isolate: [],
    leaky: [],
    learned: { isolated: 1, files: 2 },
    relearnIn: 2,
    decisions: [{ at: 'x', mode: 'isolated', reason: 'slow' }],
  });
  const argv = process.argv;
  try {
    for (let i = 0; i < 2; i++) assert.equal(await quietly(() => main(['run'], fake.dir, short)), null);
  } finally {
    process.argv = argv;
    delete process.env.WARPDOM_FAST_MODE;
  }
  assert.equal(fake.state().relearnIn, 0);
  assert.equal(await quietly(() => main(['run'], fake.dir, short)), 0, "the learning's isolated run is the result");
  // (Node runs the stand-in's module once per process: one in-process entry.)
  assert.deepEqual(fake.runs(), ['isolated (in process)', 'isolated', 'fast', 'split']);
  const state = fake.state();
  assert.deepEqual(
    [state.mode, state.relearnIn, state.learned.files, state.learned.splits.length],
    ['split', undefined, 2, 1],
  );
  assert.deepEqual(
    state.decisions.map((d) => [d.mode, d.learning]),
    [
      ['isolated', undefined],
      ['split', 'isolated since 3 slow split runs; measuring again'],
    ],
  );
  // Isolated by a learning: no counting, no re-learning.
  const plain = fakeVitest((d) => ({ isolated: { files: passing(d, 'a') } }));
  plain.setState({
    mode: 'isolated',
    reason: 'split does not beat isolated',
    isolate: [],
    leaky: [],
    learned: { isolated: 1 },
  });
  const before = readFileSync(join(plain.dir, '.warpdom/fast-mode.json'), 'utf8');
  try {
    for (let i = 0; i < 3; i++) await main(['run'], plain.dir);
  } finally {
    process.argv = argv;
    delete process.env.WARPDOM_FAST_MODE;
  }
  assert.equal(
    readFileSync(join(plain.dir, '.warpdom/fast-mode.json'), 'utf8'),
    before,
    'the state file is not even written',
  );
  assert.deepEqual(plain.runs(), ['isolated (in process)']);
});

test('split runs: a changed suite learns again on the next run', async () => {
  const fake = fakeVitest((d) => ({
    isolated: { sleep: 3, files: passing(d, 'a', 'b', 'c') },
    fast: { files: passing(d, 'a', 'b', 'c') },
    split: { files: passing(d, 'a', 'b', 'c') },
  }));
  fake.setState({ mode: 'split', isolate: [], leaky: [], learned: { isolated: 600, files: 2 } });
  await quietly(() => main(['run'], fake.dir, short));
  assert.match(fake.state().relearn, /3 test files, learned with 2/);
  await quietly(() => main(['run'], fake.dir, short));
  assert.deepEqual(fake.runs(), ['split', 'isolated', 'fast', 'split']);
  assert.deepEqual([fake.state().mode, fake.state().learned.files, fake.state().relearn], ['split', 3, undefined]);
});

test('isolated mode: Vitest runs in this process with the arguments as given, nothing added', async () => {
  const fake = fakeVitest((d) => ({ isolated: { files: passing(d, 'a') } }));
  fake.setState({ mode: 'isolated', isolate: [], leaky: [], learned: { isolated: 1 } });
  const argv = process.argv;
  try {
    assert.equal(await main(['run', '--reporter=dot', 'src/x'], fake.dir), null, 'Vitest owns the exit code');
    assert.deepEqual(process.argv.slice(2), ['run', '--reporter=dot', 'src/x']);
  } finally {
    process.argv = argv;
    delete process.env.WARPDOM_FAST_MODE;
  }
  assert.deepEqual(fake.runs(), ['isolated (in process)']);
});
