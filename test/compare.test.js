import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { vitestWrapper, jestWrapper, wrapperName, PROBE_MARKER, PINNED_TARGET, PINNED_PACKAGE } from '../src/compare/wrappers.js';
import { findConfig, findBin, detectRunner, environmentComments, takeConfigArg, packageDir } from '../src/compare/detect.js';
import { TempFiles, removeEntry, copyWarpdom, pinnedEnvironmentPackage, isOwnName, acquireLock, gitStatus, statusChanges } from '../src/compare/files.js';
import { runnerArgs, testsOf, countsOf, runnerDuration, normalizeStatus } from '../src/compare/run.js';
import { classify, compareRuns, groupDifferences, timingSummary, median, pairOrder, exitCode } from '../src/compare/results.js';
import { renderConsole, renderMarkdown, speedPhrase } from '../src/compare/report.js';
import { parseArgs } from '../src/compare/cli.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `warpdom-compare-${name}-`));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

// --- wrappers --------------------------------------------------------------

test('compare wrappers: file names carry the mark, TS originals get TS-capable wrappers', () => {
  assert.equal(wrapperName('vitest', '/p/vite.config.ts', 'warpdom'), 'vitest.config.warpdom-compare.warpdom.mts');
  assert.equal(wrapperName('vitest', '/p/vitest.config.js', 'baseline'), 'vitest.config.warpdom-compare.baseline.mjs');
  assert.equal(wrapperName('jest', '/p/jest.config.ts', 'warpdom'), 'jest.config.warpdom-compare.warpdom.ts');
  assert.equal(wrapperName('jest', '/p/package.json', 'probe'), 'jest.config.warpdom-compare.probe.cjs');
  assert.equal(wrapperName('jest', null, 'baseline'), 'jest.config.warpdom-compare.baseline.cjs');
});

test('compare wrappers: Vitest switches DOM projects only and describes the projects', async () => {
  const dir = tmp('vitest-wrapper');
  try {
    const load = async (name, config, env = {}) => {
      write(path.join(dir, `${name}.config.mjs`), `export default ${JSON.stringify(config)};`);
      const wrapper = write(path.join(dir, `${name}.warpdom-compare.mjs`), vitestWrapper(path.join(dir, `${name}.config.mjs`), { environment: '/w/vitest.js' }));
      const saved = { ...process.env };
      Object.assign(process.env, env);
      try {
        return await (await import(pathToFileURL(wrapper).href)).default({ mode: 'test' });
      } finally {
        for (const k of Object.keys(env)) delete process.env[k];
        Object.assign(process.env, saved);
      }
    };
    const single = await load('single', { plugins: [], test: { environment: 'jsdom', globals: true } });
    assert.equal(single.test.environment, '/w/vitest.js');
    assert.equal(single.test.globals, true, 'other options kept');
    assert.equal((await load('node', { test: {} })).test.environment, undefined, 'node projects keep theirs');

    const meta = path.join(dir, 'meta.json');
    const mixed = await load('mixed', {
      test: {
        environment: 'happy-dom',
        projects: [
          { extends: true, test: { name: 'inherits' } },
          { test: { name: 'dom', environment: 'jsdom' } },
          { test: { name: 'browser', environment: 'jsdom', browser: { enabled: true } } },
          { test: { name: 'server', environment: 'node' } },
          'packages/*',
        ],
      },
    }, { WARPDOM_COMPARE_META: meta });
    assert.equal(mixed.test.environment, '/w/vitest.js', 'the root, inherited by extends: true');
    assert.deepEqual(mixed.test.projects.slice(0, 4).map((p) => p.test.environment), [undefined, '/w/vitest.js', 'jsdom', 'node']);
    assert.equal(mixed.test.projects[4], 'packages/*');
    assert.deepEqual(JSON.parse(fs.readFileSync(meta, 'utf8')), {
      runner: 'vitest', external: 1,
      projects: [
        { name: 'inherits', environment: 'happy-dom', browser: false },
        { name: 'dom', environment: 'jsdom', browser: false },
        { name: 'browser', environment: 'jsdom', browser: true },
        { name: 'server', environment: 'node', browser: false },
      ],
    });
    await assert.rejects(load('probe', { test: { environment: 'jsdom' } }, { WARPDOM_COMPARE_PROBE: '1' }), (err) => err.message === PROBE_MARKER);
    // The baseline wrapper changes nothing.
    write(path.join(dir, 'keep.config.mjs'), 'export default () => ({ test: { environment: "jsdom" } });');
    const keep = write(path.join(dir, 'keep.warpdom-compare.mjs'), vitestWrapper(path.join(dir, 'keep.config.mjs')));
    assert.equal((await (await import(pathToFileURL(keep).href)).default({})).test.environment, 'jsdom', 'config functions are called');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The patch changes fs.promises.readFile for the whole process, so each case
// runs in its own process, as each runner process loads its wrapper.
function readPinned(pinned, files) {
  const dir = tmp('pinned');
  try {
    write(path.join(dir, 'vitest.config.mjs'), 'export default { test: { environment: "jsdom" } };');
    const wrapper = write(path.join(dir, 'vitest.config.warpdom-compare.warpdom.mjs'), vitestWrapper(path.join(dir, 'vitest.config.mjs'), { pinned }));
    for (const [name, text] of Object.entries(files)) write(path.join(dir, name), text);
    const log = path.join(dir, 'pinned.tsv');
    const script = `
      import fs from 'node:fs';
      await import(${JSON.stringify(pathToFileURL(wrapper).href)});
      const first = fs.promises.readFile;
      await import(${JSON.stringify(pathToFileURL(wrapper).href)} + '?again');
      const out = { patchedOnce: first === fs.promises.readFile, files: {} };
      for (const name of ${JSON.stringify(Object.keys(files))}) {
        out.files[name] = await fs.promises.readFile(${JSON.stringify(dir)} + '/' + name, 'utf-8');
        await fs.promises.readFile(${JSON.stringify(dir)} + '/' + name, 'utf-8');
      }
      out.buffer = Buffer.isBuffer(await fs.promises.readFile(${JSON.stringify(dir)} + '/' + ${JSON.stringify(Object.keys(files)[0])}));
      process.stdout.write(JSON.stringify(out));`;
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { ...process.env, WARPDOM_COMPARE_PINNED_LOG: log } });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    const logged = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => l.replace(dir + '/', '').split('\t')) : [];
    return { ...out, logged };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('compare wrappers: Vitest files pinned to jsdom or happy-dom with a comment are switched in what Vitest reads', () => {
  const files = {
    'a.spec.js': '// @vitest-environment jsdom\ntest()',
    'b.spec.ts': '/**\n * @jest-environment happy-dom\n * @vitest-environment-options {"url": "http://x/"}\n */',
    'c.spec.js': '// @vitest-environment node\n',
    'd.spec.js': '// @vitest-environment warpdom-compare\n',
    'e.spec.js': 'test()',
  };
  const warpdom = readPinned(PINNED_TARGET, files);
  assert.equal(warpdom.patchedOnce, true, 'patched once per process');
  assert.equal(warpdom.buffer, true, 'reads without an encoding are untouched');
  assert.equal(warpdom.files['a.spec.js'], '// @vitest-environment warpdom-compare\ntest()');
  assert.match(warpdom.files['b.spec.ts'], /@jest-environment warpdom-compare\n \* @vitest-environment-options \{"url"/);
  assert.equal(warpdom.files['c.spec.js'], files['c.spec.js'], 'other environments stay');
  assert.equal(warpdom.files['d.spec.js'], files['d.spec.js']);
  assert.equal(warpdom.files['e.spec.js'], files['e.spec.js']);
  assert.deepEqual(warpdom.logged, [['a.spec.js', 'jsdom'], ['b.spec.ts', 'happy-dom', 'options']], 'each switched file logged once');

  const baseline = readPinned('jsdom', files);
  assert.equal(baseline.files['a.spec.js'], files['a.spec.js'], 'jsdom pins stay on a jsdom baseline');
  assert.match(baseline.files['b.spec.ts'], /@jest-environment jsdom\n/, 'happy-dom pins become jsdom');
  assert.deepEqual(baseline.logged, [['b.spec.ts', 'happy-dom', 'options']]);
  assert.deepEqual(readPinned('happy-dom', files).logged, [['a.spec.js', 'jsdom']], 'and the other way round');

  const none = readPinned(null, files);
  assert.equal(none.patchedOnce, true);
  assert.equal(none.files['a.spec.js'], files['a.spec.js'], 'no patch without a target');
  assert.deepEqual(none.logged, []);
});

test('compare wrappers: Jest switches jsdom-like environments, drops self-referencing projects', async () => {
  const dir = tmp('jest-wrapper');
  try {
    const require = createRequire(path.join(dir, 'x.js'));
    const load = async (name, source, base = name) => {
      const file = base ? write(path.join(dir, base), source) : null;
      const wrapper = write(path.join(dir, `${path.basename(name, path.extname(name))}.warpdom-compare.cjs`), jestWrapper(file, { environment: '/w/jest.js' }));
      return require(wrapper)();
    };
    const single = await load('a.config.js', 'module.exports = { testEnvironment: "jest-fixed-jsdom", clearMocks: true };');
    assert.equal(single.testEnvironment, '/w/jest.js');
    assert.equal(single.clearMocks, true);
    const projects = await load('b.config.js', `module.exports = async () => ({ projects: ['<rootDir>', { displayName: { name: 'Web' }, testEnvironment: 'jsdom' }, { testEnvironment: 'node' }] });`);
    assert.deepEqual(projects.projects.map((p) => p.testEnvironment), ['/w/jest.js', 'node']);
    const meta = path.join(dir, 'meta.json');
    process.env.WARPDOM_COMPARE_META = meta;
    try {
      await load('c.config.js', `module.exports = { projects: ['./other', { displayName: 'Web', testEnvironment: 'jsdom' }] };`);
    } finally {
      delete process.env.WARPDOM_COMPARE_META;
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(meta, 'utf8')), { runner: 'jest', external: 1, projects: [{ name: 'Web', environment: 'jsdom', browser: false }] });
    const pkg = await load('package.json', JSON.stringify({ name: 'x', jest: { testEnvironment: 'jsdom' } }));
    assert.equal(pkg.testEnvironment, '/w/jest.js', 'package.json "jest"');
    assert.deepEqual(await load('none.cjs', '', null), {}, 'no config: Jest defaults');
    assert.match(jestWrapper(path.join(dir, 'jest.config.ts')), /export default async/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- detection ---------------------------------------------------------------

test('compare detection: config lookup order, binaries, the runner', () => {
  const dir = tmp('detect');
  try {
    const pkg = path.join(dir, 'packages', 'a');
    write(path.join(pkg, 'vite.config.ts'), '');
    assert.equal(findConfig(pkg, 'vitest'), path.join(pkg, 'vite.config.ts'));
    write(path.join(pkg, 'vitest.config.mjs'), '');
    assert.equal(findConfig(pkg, 'vitest'), path.join(pkg, 'vitest.config.mjs'), 'vitest.config before vite.config');
    assert.equal(findConfig(pkg, 'jest'), null);
    write(path.join(pkg, 'package.json'), JSON.stringify({ jest: { testEnvironment: 'jsdom' } }));
    assert.equal(findConfig(pkg, 'jest'), path.join(pkg, 'package.json'));
    write(path.join(pkg, 'jest.config.json'), '{}');
    assert.equal(findConfig(pkg, 'jest'), path.join(pkg, 'jest.config.json'));

    assert.equal(findBin(pkg, 'vitest'), null);
    assert.match(detectRunner(pkg).error, /neither Vitest nor Jest/);
    write(path.join(dir, 'node_modules', '.bin', 'vitest'), '');
    assert.equal(findBin(pkg, 'vitest'), path.join(dir, 'node_modules', '.bin', 'vitest'), 'found walking up');
    assert.equal(detectRunner(pkg).runner, 'vitest');
    write(path.join(dir, 'node_modules', '.bin', 'jest'), '');
    assert.match(detectRunner(pkg).error, /both Vitest and Jest/);
    assert.equal(detectRunner(pkg, { runner: 'jest' }).config, path.join(pkg, 'jest.config.json'));
    assert.equal(detectRunner(pkg, { config: 'vite.config.ts' }).runner, 'vitest', 'an explicit config names the runner');
    assert.match(detectRunner(pkg, { config: 'missing.js' }).error, /not found/);
    assert.match(detectRunner(pkg, { runner: 'mocha' }).error, /unknown runner/);

    write(path.join(dir, 'node_modules', 'jsdom', 'package.json'), JSON.stringify({ version: '26.1.0' }));
    assert.equal(packageDir(pkg, 'jsdom'), fs.realpathSync(path.join(dir, 'node_modules', 'jsdom')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare detection: environment comments, --config among runner arguments', () => {
  const dir = tmp('docblocks');
  try {
    const a = write(path.join(dir, 'a.test.js'), '/** @vitest-environment jsdom */\ntest()');
    const b = write(path.join(dir, 'b.test.js'), '/**\n * @jest-environment happy-dom\n */');
    const c = write(path.join(dir, 'c.test.js'), '// @vitest-environment node\n');
    const d = write(path.join(dir, 'd.test.js'), 'test()');
    assert.deepEqual([...environmentComments([a, b, c, d, path.join(dir, 'gone.js')], 'vitest')], [[a, 'jsdom'], [b, 'happy-dom']]);
    assert.deepEqual([...environmentComments([a, b], 'jest')], [[b, 'happy-dom']], 'Jest reads only @jest-environment');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(takeConfigArg(['--config', 'x.js', 'src']), { config: 'x.js', args: ['src'] });
  assert.deepEqual(takeConfigArg(['--config=y.ts', '-t', 'name']), { config: 'y.ts', args: ['-t', 'name'] });
  assert.deepEqual(takeConfigArg(['--project', 'a']), { config: null, args: ['--project', 'a'] });
});

// --- runs and results --------------------------------------------------------

test('compare runs: runner arguments', () => {
  assert.deepEqual(runnerArgs('vitest', { config: 'w.mjs', resultsFile: 'r.json', workers: 2, minWorkers: true, args: ['src'] }),
    ['run', '--config', 'w.mjs', '--reporter=default', '--reporter=json', '--outputFile.json=r.json', '--coverage.enabled=false', '--minWorkers=1', '--maxWorkers=2', 'src']);
  assert.deepEqual(runnerArgs('jest', { config: 'w.cjs', resultsFile: 'r.json' }),
    ['--config', 'w.cjs', '--ci', '--json', '--outputFile=r.json', '--coverage=false']);
});

const report = (files) => ({
  startTime: 1000,
  testResults: files.map(([name, tests, extra = {}]) => ({
    name, status: tests.some((t) => t[1] === 'failed') || extra.status === 'failed' ? 'failed' : 'passed', endTime: 3500, ...extra,
    assertionResults: tests.map(([title, status, message, ancestors = []]) => ({ title, ancestorTitles: ancestors, fullName: [...ancestors, title].join(' '), status, failureMessages: message ? [message] : [] })),
  })),
});

test('compare runs: tests of a JSON report, counts, duration', () => {
  const tests = testsOf(report([
    ['/p/src/a.test.js', [['works', 'passed', null, ['suite']], ['works', 'passed', null, ['suite']], ['later', 'pending'], ['fails', 'failed', '\x1b[31mError: boom\x1b[0m\n  at x']]],
    ['/p/src/b.test.js', [], { status: 'failed', message: 'SyntaxError: bad\nmore' }],
  ]), '/p');
  assert.deepEqual([...tests.keys()], ['src/a.test.js::suite > works', 'src/a.test.js::suite > works #2', 'src/a.test.js::later', 'src/a.test.js::fails', 'src/b.test.js::(file)']);
  assert.equal(tests.get('src/a.test.js::fails').message, 'Error: boom');
  assert.equal(tests.get('src/a.test.js::later').status, 'skipped');
  assert.equal(tests.get('src/b.test.js::(file)').message, 'SyntaxError: bad');
  assert.deepEqual(countsOf(tests), { tests: 4, passed: 2, failed: 2, skipped: 1, todo: 0 });
  assert.equal(normalizeStatus('disabled'), 'skipped');
  assert.equal(runnerDuration('vitest', null, ' Test Files  1 passed\n   Duration  1.25s (transform 20ms)'), 1250);
  assert.equal(runnerDuration('vitest', null, '   Duration  830ms'), 830);
  assert.equal(runnerDuration('jest', report([['/p/a', []]]), ''), 2500, 'start to the last end');
  assert.equal(runnerDuration('jest', {}, ''), null);
});

const run = (entries) => new Map(entries.map(([key, status, message = '']) => [key, { file: key.split('::')[0], name: key.split('::')[1], status, message }]));

test('compare results: classes, flaky tests, files not compared', () => {
  assert.equal(classify('passed', 'failed'), 'regression');
  assert.equal(classify('failed', 'passed'), 'fixed');
  assert.equal(classify('passed', 'missing'), 'other');
  assert.equal(classify('skipped', 'failed'), 'other');
  assert.equal(classify('missing', 'failed', true), 'regression', 'a file that fails to load only on warpdom');
  assert.equal(classify('failed', 'missing', true), 'fixed');

  const b1 = run([['a::same', 'passed'], ['a::regress', 'passed'], ['a::fixed', 'failed', 'Error: jsdom 1'], ['a::flaky', 'passed'], ['a::wflaky', 'passed'], ['a::gone', 'passed'], ['p::pinned', 'passed']]);
  const b2 = run([['a::same', 'passed'], ['a::regress', 'passed'], ['a::fixed', 'failed', 'Error: jsdom 2'], ['a::flaky', 'failed'], ['a::wflaky', 'passed'], ['a::gone', 'passed'], ['p::pinned', 'passed']]);
  const w1 = run([['a::same', 'passed'], ['a::regress', 'failed', 'TypeError: x 12'], ['a::fixed', 'passed'], ['a::flaky', 'passed'], ['a::wflaky', 'failed'], ['b::(file)', 'failed', 'SyntaxError'], ['p::pinned', 'failed']]);
  const w2 = run([['a::same', 'passed'], ['a::regress', 'failed', 'TypeError: x 13'], ['a::fixed', 'passed'], ['a::flaky', 'passed'], ['a::wflaky', 'passed'], ['b::(file)', 'failed', 'SyntaxError'], ['p::pinned', 'failed']]);
  const c = compareRuns([b1, b2], [w1, w2], { skipFiles: new Set(['p']) });
  assert.equal(c.compared, 6);
  assert.equal(c.same, 1);
  assert.equal(c.notCompared, 1);
  assert.deepEqual(c.notComparedChanged.map((t) => t.name), ['pinned'], 'listed, not counted');
  assert.deepEqual(c.flakyBaseline.map((t) => t.name), ['flaky']);
  assert.deepEqual(c.flakyWarpdom.map((t) => t.name), ['wflaky']);
  assert.deepEqual(c.differences.map((d) => [d.name, d.class]), [['regress', 'regression'], ['fixed', 'fixed'], ['gone', 'other'], ['(file)', 'regression']]);
  assert.equal(c.regressions, 2);
  assert.equal(c.fixed, 1);
  assert.equal(c.other, 1);
  assert.equal(c.differences[0].message, 'TypeError: x 12', "warpdom's error for a failure on warpdom");
  assert.equal(c.differences[1].message, 'Error: jsdom 1', "the baseline's error for a failure there");

  const groups = groupDifferences([
    { file: 'a', name: '1', baseline: 'passed', warpdom: 'failed', class: 'regression', message: 'expected 1 got 2' },
    { file: 'b', name: '2', baseline: 'passed', warpdom: 'skipped', class: 'other', message: '' },
    { file: 'c', name: '3', baseline: 'passed', warpdom: 'failed', class: 'regression', message: 'expected 5 got 7' },
    { file: 'd', name: '4', baseline: 'passed', warpdom: 'failed', class: 'regression', message: 'other error' },
  ]);
  assert.deepEqual(groups.map((g) => [g.change, g.tests.length]), [['passed -> failed', 2], ['passed -> failed', 1], ['passed -> skipped', 1]], 'numbers folded; regressions first, largest first');
});

test('compare results: timing, run order, exit codes', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  const one = timingSummary([{ baselineMs: 1200, warpdomMs: 1000 }]);
  assert.equal(one.indicative, true);
  assert.equal(one.noisy, false);
  assert.ok(Math.abs(one.speedup - 1.2) < 1e-9);
  const steady = timingSummary([{ baselineMs: 1200, warpdomMs: 1000 }, { baselineMs: 1210, warpdomMs: 1000 }, { baselineMs: 1190, warpdomMs: 1000 }]);
  assert.equal(steady.indicative, false);
  assert.equal(steady.noisy, false);
  assert.ok(Math.abs(steady.spread.min - 1.19) < 1e-9 && Math.abs(steady.spread.max - 1.21) < 1e-9);
  assert.equal(timingSummary([{ baselineMs: 1200, warpdomMs: 1000 }, { baselineMs: 1600, warpdomMs: 1000 }]).noisy, true);
  assert.deepEqual([0, 1, 2, 3].map(pairOrder), [['baseline', 'warpdom'], ['warpdom', 'baseline'], ['baseline', 'warpdom'], ['warpdom', 'baseline']]);
  assert.equal(exitCode({ regressions: 0 }), 0);
  assert.equal(exitCode({ regressions: 3 }), 1);
  assert.equal(exitCode({ error: 'no results', regressions: 3 }), 2);
  assert.equal(speedPhrase(1.5), '1.50x faster');
  assert.equal(speedPhrase(0.8), '1.25x slower');
});

// --- report --------------------------------------------------------------------

function sampleResult(overrides = {}) {
  const differences = [
    { key: 'src/secret-file.test.js::private test name', file: 'src/secret-file.test.js', name: 'private test name', baseline: 'passed', warpdom: 'failed', class: 'regression', message: 'TypeError: nope' },
  ];
  return {
    runner: 'vitest', runnerVersion: '2.1.9', baseline: { name: 'jsdom', version: '25.0.1' }, warpdom: { version: '0.0.0', source: 'copied' },
    mode: 'timing', warmup: true, error: null, warnings: [], gitChanges: [], external: 0,
    projects: [{ name: null, environment: 'jsdom', browser: false, dom: true }, { name: 'server', environment: 'node', browser: false, dom: false }],
    pinned: { files: 2, tests: 14, environments: ['jsdom'], list: [{ file: 'src/pinned.test.js', environment: 'jsdom' }] },
    correctness: { compared: 120, same: 119, notCompared: 14, notComparedChanged: [{ file: 'src/pinned.test.js', name: 'p', baseline: ['passed'], warpdom: ['failed'] }], flakyBaseline: [], flakyWarpdom: [], differences, regressions: 1, fixed: 0, other: 0, groups: groupDifferences(differences) },
    timing: { ...timingSummary([{ baselineMs: 12000, warpdomMs: 10000 }, { baselineMs: 12400, warpdomMs: 10000 }]), perRound: [{ round: 1, baselineMs: 12000, warpdomMs: 10000 }, { round: 2, baselineMs: 12400, warpdomMs: 10000 }], source: 'runner' },
    environment: { node: 'v22.12.0', os: { platform: 'linux', release: '6', arch: 'x64' }, cpu: { model: 'CPU', cores: 4 }, memory: { totalGiB: 16 } },
    runs: [{ index: 1, side: 'baseline', warmup: true, round: null, code: 1, ms: 13000, counts: { passed: 119, failed: 1 }, log: 'logs/1-baseline.log' }],
    ...overrides,
  };
}

test('compare report: terminal summary and report.md', () => {
  const result = sampleResult();
  const text = renderConsole(result, { reportPath: '.warpdom-compare/report.md' });
  assert.match(text, /^warpdom compare: vitest 2\.1\.9, baseline jsdom 25\.0\.1 \(warpdom's jsdom-25 profile\)/);
  assert.match(text, /Results {3}120 tests, 119 tests with the same status; 1 pass on jsdom and fail on warpdom/);
  assert.match(text, /1 {2}passed -> failed {2}TypeError: nope/);
  assert.match(text, /Not compared: 2 files \(14 tests\) choose jsdom with a comment/);
  const switched = renderConsole(sampleResult({ pinned: { files: 3, tests: 0, switched: 3, switchedEnvironments: ['jsdom'], withOptions: 1, notSwitched: 0, notSwitchedEnvironments: [], environments: ['jsdom'], list: [] } }));
  assert.match(switched, /3 files pin jsdom with a comment; switched/);
  assert.match(switched, /\(1 switched file also sets @vitest-environment-options, which stay keyed by the original name and do not reach warpdom\)/);
  assert.doesNotMatch(switched, /Not compared: \d+ files? \(/);
  assert.match(text, /\(1 test in those files changed status between runs on jsdom anyway: listed in the report\)/);
  assert.match(text, /Not compared: 1 project on node/);
  assert.match(text, /median {2}12\.2 s +10\.0 s +1\.22x faster \(spread 1\.20x-1\.24x\)/);
  assert.match(text, /Report {4}\.warpdom-compare\/report\.md/);

  const md = renderMarkdown(result);
  const [summary, details] = md.split('## Details');
  assert.doesNotMatch(summary, /secret-file|private test name|pinned\.test/, 'the summary names no files or tests');
  assert.match(summary, /\| Pass on jsdom, fail on warpdom \| 1 \|/);
  assert.match(summary, /\| \*\*median\*\* \| 12\.2 s \| 10\.0 s \| \*\*1\.22x faster\*\* \|/);
  assert.match(details, /`src\/secret-file\.test\.js` › private test name/);

  const same = sampleResult({ correctness: { ...result.correctness, same: 120, differences: [], regressions: 0, groups: [], flakyBaseline: [{ file: 'f', name: 'n', baseline: ['passed', 'failed'], warpdom: ['passed', 'passed'] }] }, timing: null, mode: 'correctness' });
  const sameText = renderConsole(same);
  assert.match(sameText, /119 tests, all with the same status on jsdom and warpdom/);
  assert.match(sameText, /\(1 flaky on jsdom itself: listed in the report, not counted\)/);
  assert.match(sameText, /Speed {5}not measured \(--correctness\)/);

  const failed = renderConsole({ runner: null, error: 'neither Vitest nor Jest is installed here', warnings: [], gitChanges: [] });
  assert.match(failed, /^warpdom compare\n\nError {5}neither Vitest/);
  assert.match(renderMarkdown({ runner: null, error: 'x', warnings: [], gitChanges: [] }), /- Error: x/);
});

// --- files in the project ---------------------------------------------------------

test('compare files: only compare\'s own files are removed, also after a killed run', () => {
  const dir = tmp('files');
  try {
    const pending = path.join(dir, 'out', 'pending.json');
    const temp = new TempFiles(pending);
    const wrapper = temp.add(path.join(dir, 'vitest.config.warpdom-compare.warpdom.mjs'));
    write(wrapper, '');
    const created = temp.add(path.join(dir, 'node_modules'), 'empty-dir');
    const copy = temp.add(path.join(created, '.warpdom-compare'));
    write(path.join(copy, 'src', 'vitest.js'), '');
    const foreign = path.join(dir, 'vitest.config.ts');
    write(foreign, 'theirs');
    // A tampered or mistaken list never deletes the project's own files.
    fs.writeFileSync(pending, JSON.stringify([...temp.list(), { path: foreign, kind: 'own' }]));
    // A dangling link with compare's name is removed (not followed).
    const link = path.join(dir, 'jest.config.warpdom-compare.baseline.cjs');
    fs.symlinkSync(path.join(dir, 'nowhere'), link);
    temp.add(link);
    assert.equal(temp.list().length, 5);

    // The next run (a fresh tracker) cleans up what a killed one left.
    const removed = new TempFiles(pending).remove();
    assert.deepEqual(removed.sort(), [wrapper, created, copy, link].sort());
    assert.ok(!fs.existsSync(wrapper) && !fs.existsSync(created) && !fs.existsSync(copy));
    assert.throws(() => fs.lstatSync(link), /ENOENT/);
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'theirs');
    assert.ok(!fs.existsSync(pending), 'the list is gone once everything is handled');

    // A directory compare created is kept when something else is in it.
    const nm = path.join(dir, 'nm');
    write(path.join(nm, 'other', 'package.json'), '{}');
    assert.equal(removeEntry({ path: nm, kind: 'empty-dir' }), false);
    assert.ok(fs.existsSync(path.join(nm, 'other')));
    // Removing some entries keeps the rest recorded.
    const t2 = new TempFiles(pending);
    const a = t2.add(write(path.join(dir, 'a.warpdom-compare.x'), ''));
    const b = t2.add(write(path.join(dir, 'b.warpdom-compare.x'), ''));
    t2.remove([a]);
    assert.deepEqual(t2.list().map((e) => e.path), [b]);
    t2.remove();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare files: warpdom copied into node_modules with its dependencies', () => {
  const dir = tmp('copy');
  try {
    const temp = new TempFiles(path.join(dir, 'pending.json'));
    const copy = copyWarpdom(root, path.join(dir, 'node_modules'), temp);
    assert.equal(copy, path.join(dir, 'node_modules', '.warpdom-compare'));
    for (const f of ['package.json', 'src/vitest.js', 'src/jest.js', 'node_modules/parse5/package.json', 'node_modules/entities/package.json', 'node_modules/@rgrove/parse-xml/package.json']) {
      assert.ok(fs.existsSync(path.join(copy, f)), f);
    }
    temp.remove();
    assert.ok(!fs.existsSync(path.join(dir, 'node_modules')), 'node_modules was created for the copy and is removed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare files: the environment package for switched comments', async () => {
  const dir = tmp('pinned-package');
  try {
    const environment = write(path.join(dir, 'warpdom', 'src', 'vitest.js'), "export default { name: 'warpdom' };");
    const temp = new TempFiles(path.join(dir, 'out', 'pending.json'));
    const pkg = pinnedEnvironmentPackage(path.join(dir, 'node_modules'), environment, temp);
    assert.equal(path.basename(pkg), PINNED_PACKAGE);
    assert.equal(PINNED_PACKAGE, `vitest-environment-${PINNED_TARGET}`, 'the name Vitest resolves for the switched comment');
    assert.ok(isOwnName(pkg));
    const json = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
    assert.equal(json.type, 'module');
    // Resolved the way Vitest resolves it, from the project.
    const resolved = createRequire(path.join(dir, 'package.json')).resolve(PINNED_PACKAGE);
    assert.equal((await import(pathToFileURL(resolved).href)).default.name, 'warpdom');
    assert.deepEqual(temp.list().map((e) => e.path), [pkg]);
    // Removed by the next run when this one was killed.
    assert.deepEqual(new TempFiles(path.join(dir, 'out', 'pending.json')).remove(), [pkg]);
    assert.ok(!fs.existsSync(pkg));
    assert.ok(fs.existsSync(path.join(dir, 'node_modules')), 'node_modules existed before and stays');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare files: lock, git status before and after', () => {
  const dir = tmp('git');
  try {
    const out = path.join(dir, '.warpdom-compare');
    const release = acquireLock(out);
    assert.throws(() => {
      fs.writeFileSync(path.join(out, 'run.lock'), JSON.stringify({ pid: process.ppid }));
      acquireLock(out);
    }, /already running/);
    fs.writeFileSync(path.join(out, 'run.lock'), JSON.stringify({ pid: 2 ** 22 + 12345 }));
    const again = acquireLock(out);
    assert.ok(fs.existsSync(path.join(out, 'run.lock')), 'a stale lock (dead process) is taken over');
    again();
    release();
    assert.ok(!fs.existsSync(path.join(out, 'run.lock')));

    assert.equal(gitStatus(dir, out), null, 'not a repository');
    spawnSync('git', ['init', '-q'], { cwd: dir });
    write(path.join(dir, 'tracked.js'), 'a');
    spawnSync('git', ['add', 'tracked.js'], { cwd: dir });
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: dir });
    write(path.join(out, 'report.md'), '');
    const before = gitStatus(dir, out);
    assert.deepEqual(before, [], 'the output directory is not a change');
    write(path.join(dir, 'tracked.js'), 'b');
    write(path.join(dir, 'new.js'), '');
    assert.deepEqual(statusChanges(before, gitStatus(dir, out)), [' M tracked.js', '?? new.js']);
    assert.deepEqual(statusChanges(null, []), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare CLI: options', () => {
  assert.deepEqual(parseArgs(['--rounds', '3', '--workers', '2', '--', 'src', '--project', 'x']), { args: ['src', '--project', 'x'], rounds: 3, workers: 2 });
  assert.deepEqual(parseArgs(['--correctness', '--baseline', 'happy-dom', '--out', 'o']), { args: [], correctness: true, baseline: 'happy-dom', out: 'o' });
  assert.throws(() => parseArgs(['--rounds', '0']), /positive/);
  assert.throws(() => parseArgs(['--rounds']), /needs a value/);
  assert.throws(() => parseArgs(['--baseline', 'linkedom']), /jsdom or happy-dom/);
  assert.throws(() => parseArgs(['src']), /unknown option/);
  assert.throws(() => parseArgs(['--correctness', '--rounds', '2']), /runs once/);
});

// --- end to end ------------------------------------------------------------------

// The fixture project in a temporary directory, with the runner and jsdom
// linked from this repository (as a project's own node_modules would hold them).
function fixtureProject(fixture, links) {
  const dir = tmp('e2e');
  fs.cpSync(path.join(root, 'fixtures', fixture), dir, { recursive: true });
  for (const [name, target] of Object.entries(links)) {
    fs.mkdirSync(path.dirname(path.join(dir, 'node_modules', name)), { recursive: true });
    fs.symlinkSync(target, path.join(dir, 'node_modules', name));
  }
  return dir;
}

const cli = path.join(root, 'bin', 'warpdom.js');
const compareCli = (cwd, args) => spawnSync(process.execPath, [cli, 'compare', ...args], { cwd, encoding: 'utf8' });
const vitestLinks = () => ({
  vitest: path.join(root, 'node_modules', 'vitest'),
  jsdom: path.join(root, 'node_modules', 'jsdom'),
  '.bin/vitest': '../vitest/vitest.mjs',
});
const leftovers = (dir) => [
  ...fs.readdirSync(dir).filter((f) => f.includes('warpdom-compare.')),
  ...fs.readdirSync(path.join(dir, 'node_modules')).filter((f) => f.includes('warpdom-compare')),
];

test('compare end to end (Vitest): differences, exit code 1, nothing left behind', () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    const res = compareCli(dir, ['--correctness']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /7 tests, 4 tests with the same status; 2 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/);
    assert.match(res.stdout, /2 files pin happy-dom\/jsdom with a comment; switched/);
    assert.doesNotMatch(res.stdout, /Not compared/);
    assert.match(res.stdout, /Speed {5}not measured/);
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.equal(result.exitCode, 1);
    assert.equal(result.warpdom.source, 'copied');
    assert.deepEqual(result.runs.map((r) => r.side), ['baseline', 'warpdom']);
    assert.deepEqual(result.correctness.differences.map((d) => [d.name, d.class]).sort(), [['passes on jsdom only', 'regression'], ['passes on warpdom only', 'fixed'], ['pinned to jsdom: passes on jsdom only', 'regression']]);
    assert.deepEqual(result.pinned.list.map((p) => [p.file, p.environment, p.switched, p.baseline ?? null]).sort(), [['pinned-happy.spec.js', 'happy-dom', true, 'jsdom'], ['pinned.spec.js', 'jsdom', true, null]]);
    assert.ok(fs.existsSync(path.join(dir, '.warpdom-compare', 'report.md')));
    assert.ok(fs.existsSync(path.join(dir, '.warpdom-compare', 'logs', '2-warpdom.log')));
    assert.deepEqual(leftovers(dir), []);
    assert.ok(!fs.existsSync(path.join(dir, '.warpdom-compare', 'pending.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end (Vitest): rounds with a warm-up pair, a runner filter, leftovers of a killed run', () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    // Left by a run that was killed: recorded, so this run removes it.
    const stale = write(path.join(dir, 'vitest.config.warpdom-compare.warpdom.mjs'), '// stale');
    write(path.join(dir, 'out', 'pending.json'), JSON.stringify([{ path: stale, kind: 'own' }]));
    const res = compareCli(dir, ['--rounds', '2', '--out', 'out', '--', 'same']);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stderr, /Removed 1 temporary file\(s\) left by an interrupted run/);
    assert.match(res.stdout, /2 tests, all with the same status on jsdom and warpdom/);
    assert.match(res.stdout, /median .*x (faster|slower) \(spread/);
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'results.json'), 'utf8'));
    assert.deepEqual(result.runs.map((r) => `${r.warmup ? 'w' : r.round}:${r.side[0]}`), ['w:b', 'w:w', '1:w', '1:b', '2:b', '2:w']);
    assert.equal(result.timing.rounds, 2);
    assert.equal(result.timing.source, 'runner');
    assert.equal(result.environment.runner.name, 'vitest');
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end: a node-only project cannot be compared (exit code 2)', () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    fs.writeFileSync(path.join(dir, 'vitest.config.js'), "export default { test: { include: ['same.spec.js'] } };");
    const res = compareCli(dir, ['--correctness']);
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.match(res.stdout, /nothing to compare: no project runs on jsdom or happy-dom \(found: node\)/);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end: SIGTERM during a run stops the runner and removes the temporary files', async () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    // A test that waits, so the run is still going when the signal arrives.
    write(path.join(dir, 'slow.spec.js'), "import { test } from 'vitest';\ntest('waits', () => new Promise((r) => setTimeout(r, 20000)), 30000);\n");
    const child = spawn(process.execPath, [cli, 'compare', '--correctness'], { cwd: dir, stdio: 'ignore' });
    const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
    const pending = path.join(dir, '.warpdom-compare', 'pending.json');
    const deadline = Date.now() + 20000;
    // Wait until the baseline run is going: both wrappers and the copy exist.
    while (Date.now() < deadline && !(fs.existsSync(path.join(dir, '.warpdom-compare', 'logs', 'probe.log')) && fs.existsSync(pending) && JSON.parse(fs.readFileSync(pending, 'utf8')).length >= 3)) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 300));
    child.kill('SIGTERM');
    assert.equal(await exited, 143);
    assert.deepEqual(leftovers(dir), []);
    assert.ok(!fs.existsSync(pending));
    assert.ok(!fs.existsSync(path.join(dir, '.warpdom-compare', 'run.lock')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Jest is not a dependency of warpdom: this runs when WARPDOM_COMPARE_JEST
// names a node_modules directory that has jest and jest-environment-jsdom.
const jestModules = process.env.WARPDOM_COMPARE_JEST;
test('compare end to end (Jest)', { skip: !jestModules && 'set WARPDOM_COMPARE_JEST to a node_modules with jest' }, () => {
  const dir = fixtureProject('compare-jest', {
    jest: path.join(jestModules, 'jest'),
    'jest-environment-jsdom': path.join(jestModules, 'jest-environment-jsdom'),
    '.bin/jest': fs.realpathSync(path.join(jestModules, '.bin', 'jest')),
  });
  try {
    const res = compareCli(dir, ['--correctness']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /warpdom compare: jest \d/);
    assert.match(res.stdout, /1 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/);
    assert.match(res.stdout, /Not compared: 1 file \(1 test\) chooses jsdom with a comment and were not switched \(Jest reads the comment in its workers\)/);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
