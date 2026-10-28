import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  vitestWrapper,
  vitestWorkspaceWrapper,
  jestWrapper,
  wrapperName,
  workspaceWrapperName,
  PROBE_MARKER,
  PINNED_TARGET,
  PINNED_PACKAGE,
  warpdomVitestEnvironment,
  fsId,
  isWarpdomEnvironment,
} from '../src/compare/wrappers.js';
import {
  isDynamicPattern,
  expandBraces,
  globRegExp,
  glob,
  resolveVitestProjects,
  resolveJestProjects,
} from '../src/compare/projects.js';
import {
  findConfig,
  findBin,
  detectRunner,
  environmentComments,
  takeConfigArg,
  packageDir,
  scriptNodeFlags,
  scriptRunnerArgs,
} from '../src/compare/detect.js';
import { displayPath, compare } from '../src/compare/index.js';
import {
  TempFiles,
  removeEntry,
  copyWarpdom,
  pinnedEnvironmentPackage,
  linkPackage,
  isOwnName,
  acquireLock,
  gitStatus,
  statusChanges,
} from '../src/compare/files.js';
import { runnerArgs, testsOf, countsOf, runnerDuration, normalizeStatus } from '../src/compare/run.js';
import {
  classify,
  compareRuns,
  groupDifferences,
  timingSummary,
  median,
  pairOrder,
  exitCode,
} from '../src/compare/results.js';
import { renderConsole, renderMarkdown, speedPhrase, environmentLabel } from '../src/compare/report.js';
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
  assert.equal(wrapperName('vitest', '/p/vite.config.ts', 'warpdom'), 'vite.config.warpdom-compare.warpdom.mts');
  assert.equal(
    wrapperName('vitest', '/p/vitest.config.unit.ts', 'warpdom'),
    'vitest.config.unit.warpdom-compare.warpdom.mts',
    'two configs in one directory do not collide',
  );
  assert.equal(
    wrapperName('vitest', null, 'warpdom'),
    'vitest.config.warpdom-compare.warpdom.mjs',
    'a workspace file without a config',
  );
  assert.equal(
    workspaceWrapperName('/p/vitest.workspace.ts', 'baseline'),
    'vitest.workspace.warpdom-compare.baseline.mts',
  );
  assert.equal(wrapperName('jest', '/p/jest.web.config.js', 'warpdom'), 'jest.web.config.warpdom-compare.warpdom.cjs');
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
      const wrapper = write(
        path.join(dir, `${name}.warpdom-compare.mjs`),
        vitestWrapper(path.join(dir, `${name}.config.mjs`), { environment: '/w/vitest.js' }),
      );
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
    const mixed = await load(
      'mixed',
      {
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
      },
      { WARPDOM_COMPARE_META: meta },
    );
    assert.equal(mixed.test.environment, '/w/vitest.js', 'the root, inherited by extends: true');
    // The browser-mode project is left out of the run.
    assert.deepEqual(
      mixed.test.projects.slice(0, 3).map((p) => p.test.environment),
      [undefined, '/w/vitest.js', 'node'],
    );
    assert.equal(mixed.test.projects[3], 'packages/*');
    assert.deepEqual(JSON.parse(fs.readFileSync(meta, 'utf8')), {
      runner: 'vitest',
      root: process.cwd(),
      source: 'projects',
      workspace: null,
      unknown: 0,
      patterns: ['packages/*'],
      extends: [],
      projects: [
        { name: 'inherits', environment: 'happy-dom', browser: false },
        { name: 'dom', environment: 'jsdom', browser: false },
        { name: 'browser', environment: 'jsdom', browser: true },
        { name: 'server', environment: 'node', browser: false },
      ],
    });
    await assert.rejects(
      load('probe', { test: { environment: 'jsdom' } }, { WARPDOM_COMPARE_PROBE: '1' }),
      (err) => err.message === PROBE_MARKER,
    );
    // The baseline wrapper changes nothing.
    write(path.join(dir, 'keep.config.mjs'), 'export default () => ({ test: { environment: "jsdom" } });');
    const keep = write(path.join(dir, 'keep.warpdom-compare.mjs'), vitestWrapper(path.join(dir, 'keep.config.mjs')));
    assert.equal(
      (await (await import(pathToFileURL(keep).href)).default({})).test.environment,
      'jsdom',
      'config functions are called',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare wrappers: Vitest project strings, functions, extends, workspaces', async () => {
  const dir = tmp('vitest-projects');
  try {
    let n = 0;
    const load = async (config, options, env = {}) => {
      const name = `c${n++}`;
      write(path.join(dir, `${name}.config.mjs`), `export default ${config};`);
      const wrapper = write(
        path.join(dir, `${name}.warpdom-compare.mjs`),
        vitestWrapper(path.join(dir, `${name}.config.mjs`), { environment: '/w/vitest.js', ...options }),
      );
      const saved = { ...process.env };
      Object.assign(process.env, env);
      try {
        return await (await import(pathToFileURL(wrapper).href)).default({ mode: 'test' });
      } finally {
        for (const k of Object.keys(env)) delete process.env[k];
        Object.assign(process.env, saved);
      }
    };
    const links = {
      patterns: {
        'packages/*': ['/r/packages/a/vitest.config.warpdom-compare.warpdom.mjs', '/r/packages/b/'],
        '!packages/c': [],
      },
      extends: { './base.config.ts': '/r/base.config.warpdom-compare.warpdom.mts' },
    };
    const out = await load(
      `{ test: { projects: [
      'packages/*', '!packages/c', 'other/*',
      () => ({ test: { name: 'fn', environment: 'jsdom' } }),
      Promise.resolve({ test: { name: 'promise', environment: 'happy-dom' } }),
      { extends: './base.config.ts', test: { name: 'extends' } },
    ] } }`,
      { links },
    );
    const [a, b, other, fn, promise, ext] = out.test.projects;
    assert.deepEqual(
      [a, b, other],
      ['/r/packages/a/vitest.config.warpdom-compare.warpdom.mjs', '/r/packages/b/', 'other/*'],
      'resolved strings replaced, negations dropped, others kept',
    );
    assert.equal(out.test.projects.length, 6);
    assert.equal((await fn({})).test.environment, '/w/vitest.js', 'function projects switched when called');
    assert.equal((await promise).test.environment, '/w/vitest.js');
    assert.equal(ext.extends, '/r/base.config.warpdom-compare.warpdom.mts', 'extends points at the wrapper');

    // Inheritance: Vitest 5 inherits the root config unless `extends: false`.
    const meta = path.join(dir, 'meta.json');
    const inherit = `{ test: { environment: 'jsdom', projects: [{ test: { name: 'plain' } }, { extends: false, test: { name: 'off' } }, { extends: './x.config.ts', test: { name: 'x' } }] } }`;
    const describe = async (major) => {
      await assert.rejects(
        load(inherit, { major }, { WARPDOM_COMPARE_META: meta, WARPDOM_COMPARE_PROBE: '1' }),
        (err) => err.message === PROBE_MARKER,
      );
      return JSON.parse(fs.readFileSync(meta, 'utf8'));
    };
    const v5 = await describe(5);
    assert.deepEqual(
      v5.projects.map((p) => [p.name, p.environment]),
      [
        ['plain', 'jsdom'],
        ['off', 'node'],
        ['x', null],
      ],
    );
    assert.deepEqual(
      [v5.unknown, v5.extends],
      [1, ['./x.config.ts']],
      'a project extending another file is only known when it runs',
    );
    assert.deepEqual(
      (await describe(4)).projects.map((p) => p.environment),
      ['node', 'node', null],
    );

    // Vitest 2 and 3: the workspace file goes through its wrapper.
    assert.equal(
      (await load(`{ test: { environment: 'jsdom' } }`, { links: { workspace: '/r/ws.mjs' } })).test.workspace,
      '/r/ws.mjs',
    );
    const inline = await load(`{ test: { workspace: [{ test: { environment: 'jsdom' } }, 'pkg'] } }`, {
      links: { workspace: '/r/ws.mjs', patterns: { pkg: ['/r/pkg/'] } },
    });
    assert.deepEqual(
      [inline.test.workspace[0].test.environment, inline.test.workspace[1]],
      ['/w/vitest.js', '/r/pkg/'],
      'an inline workspace is switched in place',
    );
    const ws = write(
      path.join(dir, 'vitest.workspace.mjs'),
      `export default ['packages/*', { test: { name: 'w', environment: 'jsdom' } }];`,
    );
    const wsWrapper = write(
      path.join(dir, workspaceWrapperName(ws, 'warpdom')),
      vitestWorkspaceWrapper(ws, { environment: '/w/vitest.js', links }),
    );
    const mapped = (await import(pathToFileURL(wsWrapper).href)).default;
    assert.ok(Array.isArray(mapped), 'Vitest wants an array');
    assert.deepEqual(
      [mapped[0], mapped[1], mapped[2].test.environment],
      [...links.patterns['packages/*'], '/w/vitest.js'],
    );
    // The probe reads the workspace file to describe it.
    write(path.join(dir, 'probe.config.mjs'), 'export default { test: {} };');
    const probe = write(
      path.join(dir, 'probe.warpdom-compare.mjs'),
      vitestWrapper(path.join(dir, 'probe.config.mjs'), { probeWorkspace: ws }),
    );
    process.env.WARPDOM_COMPARE_META = meta;
    try {
      await (await import(pathToFileURL(probe).href)).default({});
    } finally {
      delete process.env.WARPDOM_COMPARE_META;
    }
    const wsMeta = JSON.parse(fs.readFileSync(meta, 'utf8'));
    assert.deepEqual(
      [wsMeta.source, wsMeta.patterns, wsMeta.projects.map((p) => p.environment)],
      ['workspace-file', ['packages/*'], ['jsdom']],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare wrappers: Jest project paths become wrappers, self references become this wrapper', async () => {
  const dir = tmp('jest-projects');
  try {
    const require = createRequire(path.join(dir, 'x.js'));
    const self = path.join(dir, 'jest.config.warpdom-compare.warpdom.cjs');
    write(
      path.join(dir, 'jest.config.js'),
      `module.exports = { projects: ['<rootDir>', '<rootDir>/packages/*', { displayName: 'inline', testEnvironment: 'jsdom' }], reporters: ['default', 'jest-junit'] };`,
    );
    write(
      self,
      jestWrapper(path.join(dir, 'jest.config.js'), {
        environment: '/w/jest.js',
        self,
        reporter: '/r/reporter.cjs',
        links: {
          patterns: {
            '<rootDir>/packages/*': ['/r/packages/a/jest.config.warpdom-compare.warpdom.cjs', '/r/packages/b'],
          },
        },
      }),
    );
    const out = await require(self)();
    assert.deepEqual(
      out.projects.slice(0, 3),
      [self, '/r/packages/a/jest.config.warpdom-compare.warpdom.cjs', '/r/packages/b'],
      'the root runs as a project through this wrapper',
    );
    assert.equal(out.projects[3].testEnvironment, '/w/jest.js');
    assert.deepEqual(out.reporters, ['default', 'jest-junit', '/r/reporter.cjs'], "the project's reporters are kept");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare projects: globs as Vitest and Jest expand them', () => {
  assert.equal(isDynamicPattern('packages/*'), true);
  assert.equal(isDynamicPattern('!packages/a'), true);
  assert.equal(isDynamicPattern('packages/a/vitest.config.ts'), false);
  assert.deepEqual(expandBraces('a/{b,c{d,e}}/f'), ['a/b/f', 'a/cd/f', 'a/ce/f']);
  assert.deepEqual(expandBraces('a/{b}'), ['a/{b}']);
  const re = globRegExp('packages/**/vite*.config.[jt]s');
  assert.ok(re.test('packages/a/b/vitest.config.ts') && re.test('packages/vitest.config.js'));
  assert.ok(!re.test('packages/a/vitest.config.mts'));

  const dir = tmp('globs');
  try {
    write(path.join(dir, 'packages', 'a', 'vitest.config.ts'), '');
    write(path.join(dir, 'packages', 'b', 'vite.config.mjs'), '');
    write(path.join(dir, 'packages', 'c', 'index.js'), '');
    write(path.join(dir, 'packages', 'README.md'), '');
    write(path.join(dir, 'packages', 'a', 'node_modules', 'x', 'vitest.config.ts'), '');
    write(path.join(dir, 'packages', 'd', 'package.json'), JSON.stringify({ jest: { testEnvironment: 'jsdom' } }));
    assert.deepEqual(
      glob('packages/*', dir).map((f) => path.relative(dir, f) + (f.endsWith('/') ? '/' : '')),
      ['packages/README.md', 'packages/a/', 'packages/b/', 'packages/c/', 'packages/d/'],
    );
    assert.deepEqual(
      glob('**/vitest.config.ts', dir),
      [path.join(dir, 'packages', 'a', 'vitest.config.ts')],
      'node_modules skipped',
    );
    assert.deepEqual(
      glob(`${dir}/packages/{a,b}/*.config.*`, '/'),
      [path.join(dir, 'packages', 'a', 'vitest.config.ts'), path.join(dir, 'packages', 'b', 'vite.config.mjs')],
      'absolute patterns',
    );

    const vitest = resolveVitestProjects(
      ['packages/*', '!packages/README.md', 'packages/a/vitest.config.ts', './packages/c', 'missing/'],
      dir,
    );
    assert.deepEqual(
      vitest.get('packages/*'),
      [
        { config: path.join(dir, 'packages', 'a', 'vitest.config.ts') },
        { config: path.join(dir, 'packages', 'b', 'vite.config.mjs') },
        { dir: `${path.join(dir, 'packages', 'c')}/` },
        { dir: `${path.join(dir, 'packages', 'd')}/` },
      ],
      'directories through their config, or as projects without one',
    );
    assert.deepEqual(vitest.get('!packages/README.md'), []);
    assert.deepEqual(vitest.get('packages/a/vitest.config.ts'), [
      { config: path.join(dir, 'packages', 'a', 'vitest.config.ts') },
    ]);
    assert.deepEqual(vitest.get('./packages/c'), [{ dir: `${path.join(dir, 'packages', 'c')}/` }]);
    assert.equal(vitest.has('missing/'), false, 'left for the runner to report');

    write(path.join(dir, 'packages', 'a', 'jest.config.js'), '');
    const jest = resolveJestProjects(['<rootDir>/packages/*', 'packages/a/jest.config.js', 'nothing/*'], {
      rootDir: dir,
      configDir: dir,
      cwd: dir,
    });
    assert.deepEqual(jest.get('<rootDir>/packages/*'), [
      { config: path.join(dir, 'packages', 'a', 'jest.config.js') },
      { dir: path.join(dir, 'packages', 'b') },
      { dir: path.join(dir, 'packages', 'c') },
      { config: path.join(dir, 'packages', 'd', 'package.json') },
    ]);
    assert.deepEqual(jest.get('packages/a/jest.config.js'), [
      { config: path.join(dir, 'packages', 'a', 'jest.config.js') },
    ]);
    assert.deepEqual(jest.get('nothing/*'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The patch changes fs.promises.readFile for the whole process, so each case
// runs in its own process, as each runner process loads its wrapper.
function readPinned(pinned, files, options = {}) {
  const dir = tmp('pinned');
  try {
    write(path.join(dir, 'vitest.config.mjs'), 'export default { test: { environment: "jsdom" } };');
    const wrapper = write(
      path.join(dir, 'vitest.config.warpdom-compare.warpdom.mjs'),
      vitestWrapper(path.join(dir, 'vitest.config.mjs'), { pinned, ...options }),
    );
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
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, WARPDOM_COMPARE_PINNED_LOG: log },
    });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    const logged = fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((l) => l.replace(dir + '/', '').split('\t'))
      : [];
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
  assert.match(
    warpdom.files['b.spec.ts'],
    /@jest-environment warpdom-compare\n \* @vitest-environment-options \{"url"/,
  );
  assert.equal(warpdom.files['c.spec.js'], files['c.spec.js'], 'other environments stay');
  assert.equal(warpdom.files['d.spec.js'], files['d.spec.js']);
  assert.equal(warpdom.files['e.spec.js'], files['e.spec.js']);
  assert.deepEqual(
    warpdom.logged,
    [
      ['a.spec.js', 'jsdom'],
      ['b.spec.ts', 'happy-dom', 'options'],
    ],
    'each switched file logged once',
  );

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

test('compare wrappers: Vitest warpdom runs give projects and pinned files one environment name', async () => {
  // Vitest groups test files that share workers by environment name: the
  // config and the files pinned to jsdom must say the same, as on jsdom.
  const wd = warpdomVitestEnvironment('/w/src/vitest.js');
  assert.deepEqual(wd, { environment: PINNED_TARGET, environmentId: '/@fs/w/src/vitest.js' });
  assert.equal(fsId('/@fs/w/x.js'), '/@fs/w/x.js');
  assert.equal(fsId('rel/x.js'), 'rel/x.js', 'only absolute paths change');
  assert.equal(
    readPinned(PINNED_TARGET, { 'a.spec.js': '// @vitest-environment jsdom\n' }).files['a.spec.js'],
    `// @vitest-environment ${wd.environment}\n`,
    'a pinned file gets the name the config gets',
  );
  const dir = tmp('vitest-name');
  try {
    const config = {
      plugins: [{ name: 'own' }],
      test: {
        environment: 'jsdom',
        projects: [{ test: { name: 'u', environment: 'jsdom' } }, { test: { name: 'n', environment: 'node' } }],
      },
    };
    write(path.join(dir, 'vitest.config.mjs'), `export default ${JSON.stringify(config)};`);
    const wrapper = write(
      path.join(dir, 'vitest.config.warpdom-compare.warpdom.mjs'),
      vitestWrapper(path.join(dir, 'vitest.config.mjs'), { ...wd, major: 3 }),
    );
    const cfg = await (await import(pathToFileURL(wrapper).href)).default({ mode: 'test' });
    const resolves = (c) =>
      (c.plugins ?? []).filter((p) => p.name === 'warpdom-compare:environment').map((p) => p.resolveId(PINNED_PACKAGE));
    assert.equal(cfg.test.environment, PINNED_TARGET);
    assert.equal(cfg.test.projects[0].test.environment, PINNED_TARGET, 'inline projects too');
    assert.equal(cfg.test.projects[1].test.environment, 'node');
    assert.deepEqual(
      cfg.plugins.map((p) => p.name),
      ['own', 'warpdom-compare:environment'],
      "the project's plugins kept",
    );
    // In the workers the name resolves to warpdom's path as a /@fs/ id (the
    // Vitest 2/3 loader hang); also in inline projects, which may hold pinned files.
    assert.deepEqual(resolves(cfg), [wd.environmentId]);
    assert.deepEqual(resolves(cfg.test.projects[0]), [wd.environmentId]);
    assert.deepEqual(resolves(cfg.test.projects[1]), [wd.environmentId]);
    assert.equal(cfg.plugins[1].resolveId('vitest-environment-jsdom'), null, 'other ids left alone');
    const ws = write(
      path.join(dir, 'vitest.workspace.mjs'),
      `export default ${JSON.stringify([{ test: { environment: 'jsdom' } }])};`,
    );
    const wsWrapper = write(path.join(dir, workspaceWrapperName(ws, 'warpdom')), vitestWorkspaceWrapper(ws, wd));
    const [project] = (await import(pathToFileURL(wsWrapper).href)).default;
    assert.equal(project.test.environment, PINNED_TARGET, 'workspace projects too');
    assert.deepEqual(resolves(project), [wd.environmentId]);
    // Without environmentId (baseline, other DOMs) nothing is added.
    const plain = write(
      path.join(dir, 'vitest.config.warpdom-compare.baseline.mjs'),
      vitestWrapper(path.join(dir, 'vitest.config.mjs'), { environment: 'happy-dom' }),
    );
    assert.deepEqual(
      (await (await import(pathToFileURL(plain).href)).default({ mode: 'test' })).plugins.map((p) => p.name),
      ['own'],
    );
    assert.equal(environmentLabel(PINNED_TARGET), 'warpdom', 'reported as warpdom');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare wrappers: Jest switches jsdom-like environments, drops self-referencing projects', async () => {
  const dir = tmp('jest-wrapper');
  try {
    const require = createRequire(path.join(dir, 'x.js'));
    const load = async (name, source, base = name) => {
      const file = base ? write(path.join(dir, base), source) : null;
      const wrapper = write(
        path.join(dir, `${path.basename(name, path.extname(name))}.warpdom-compare.cjs`),
        jestWrapper(file, { environment: '/w/jest.js' }),
      );
      return require(wrapper)();
    };
    const single = await load(
      'a.config.js',
      'module.exports = { testEnvironment: "jest-fixed-jsdom", clearMocks: true };',
    );
    assert.equal(single.testEnvironment, '/w/jest.js');
    assert.equal(single.clearMocks, true);
    const projects = await load(
      'b.config.js',
      `module.exports = async () => ({ projects: ['<rootDir>', { displayName: { name: 'Web' }, testEnvironment: 'jsdom' }, { testEnvironment: 'node' }] });`,
    );
    assert.deepEqual(
      projects.projects.map((p) => p.testEnvironment),
      ['/w/jest.js', 'node'],
    );
    const meta = path.join(dir, 'meta.json');
    process.env.WARPDOM_COMPARE_META = meta;
    try {
      await load(
        'c.config.js',
        `module.exports = { projects: ['./other', { displayName: 'Web', testEnvironment: 'jsdom' }] };`,
      );
    } finally {
      delete process.env.WARPDOM_COMPARE_META;
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(meta, 'utf8')), {
      runner: 'jest',
      external: 1,
      patterns: ['./other'],
      root: dir,
      projects: [{ name: 'Web', environment: 'jsdom', browser: false }],
    });
    const pkg = await load('package.json', JSON.stringify({ name: 'x', jest: { testEnvironment: 'jsdom' } }));
    assert.equal(pkg.testEnvironment, '/w/jest.js', 'package.json "jest"');
    assert.deepEqual(await load('none.cjs', '', null), {}, 'no config: Jest defaults');
    assert.match(jestWrapper(path.join(dir, 'jest.config.ts')), /export default async/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare wrappers (#172): with fromWarpdom, projects and files on warpdom are switched too', async () => {
  const dir = tmp('from-warpdom');
  try {
    const require = createRequire(path.join(dir, 'x.js'));
    const vitest = async (name, config, options) => {
      write(path.join(dir, `${name}.config.mjs`), `export default ${JSON.stringify(config)};`);
      const wrapper = write(
        path.join(dir, `${name}.warpdom-compare.mjs`),
        vitestWrapper(path.join(dir, `${name}.config.mjs`), options),
      );
      return (await import(pathToFileURL(wrapper).href)).default({ mode: 'test' });
    };
    const config = {
      test: {
        environment: 'warpdom',
        projects: [
          { test: { name: 'a', environment: 'warpdom/vitest/environment' } },
          { test: { name: 'b', environment: '/p/node_modules/warpdom/src/vitest.js' } },
          { test: { name: 'c', environment: 'vitest-environment-warpdom' } },
          { test: { name: 'd', environment: 'node' } },
          { test: { name: 'e', environment: 'jsdom' } },
        ],
      },
    };
    const on = await vitest('on', config, { environment: 'jsdom', fromWarpdom: true });
    assert.equal(on.test.environment, 'jsdom');
    assert.deepEqual(
      on.test.projects.map((p) => p.test.environment),
      ['jsdom', 'jsdom', 'jsdom', 'node', 'jsdom'],
    );
    const off = await vitest('off', config, { environment: 'jsdom' });
    assert.equal(off.test.environment, 'warpdom', 'warpdom stays without fromWarpdom');
    assert.deepEqual(
      off.test.projects.map((p) => p.test.environment),
      [
        'warpdom/vitest/environment',
        '/p/node_modules/warpdom/src/vitest.js',
        'vitest-environment-warpdom',
        'node',
        'jsdom',
      ],
    );

    const jest = async (name, source, options) => {
      const file = write(path.join(dir, name), source);
      const wrapper = write(
        path.join(dir, `${path.basename(name, '.js')}.warpdom-compare.cjs`),
        jestWrapper(file, options),
      );
      return require(wrapper)();
    };
    const jestConfig = `module.exports = { projects: [${[
      'warpdom',
      'warpdom/jest',
      'jest-environment-warpdom',
      '/p/node_modules/warpdom/src/jest.js',
      'node',
    ]
      .map((e) => `{ testEnvironment: '${e}' }`)
      .join(', ')}] };`;
    const jestOn = await jest('j1.config.js', jestConfig, { environment: 'jsdom', fromWarpdom: true });
    assert.deepEqual(
      jestOn.projects.map((p) => p.testEnvironment),
      ['jsdom', 'jsdom', 'jsdom', 'jsdom', 'node'],
    );
    const jestOff = await jest('j2.config.js', jestConfig, { environment: 'jsdom' });
    assert.deepEqual(
      jestOff.projects.map((p) => p.testEnvironment),
      ['warpdom', 'warpdom/jest', 'jest-environment-warpdom', '/p/node_modules/warpdom/src/jest.js', 'node'],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Files whose comment pins warpdom (migrate changed jsdom to warpdom there).
  const files = {
    'a.spec.js': '// @vitest-environment warpdom\n',
    'b.spec.js': '// @vitest-environment warpdom-compare\n',
  };
  const baseline = readPinned('jsdom', files, { fromWarpdom: true });
  assert.equal(baseline.files['a.spec.js'], '// @vitest-environment jsdom\n');
  assert.equal(baseline.files['b.spec.js'], files['b.spec.js']);
  assert.deepEqual(baseline.logged, [['a.spec.js', 'warpdom']]);
  const warpdom = readPinned(PINNED_TARGET, files, { fromWarpdom: true });
  assert.equal(warpdom.files['a.spec.js'], `// @vitest-environment ${PINNED_TARGET}\n`);
  assert.equal(readPinned('jsdom', files).files['a.spec.js'], files['a.spec.js'], 'not without fromWarpdom');
});

test('compare wrappers (#172): warpdom by package, environmentMatchGlobs, and the warpdom environments switched are logged', async () => {
  // A path counts by the package after its last node_modules; a directory
  // named warpdom above it does not make it warpdom.
  for (const e of [
    'warpdom',
    'warpdom/jest',
    'warpdom/vitest/environment',
    'jest-environment-warpdom',
    'vitest-environment-warpdom',
    '/p/node_modules/warpdom/src/jest.js',
    '/work/warpdom/node_modules/warpdom/src/jest.js',
    'C:\\work\\node_modules\\jest-environment-warpdom\\index.js',
    '/home/me/warpdom/src/jest.js',
  ])
    assert.equal(isWarpdomEnvironment(e), true, e);
  for (const e of [
    'node',
    'jsdom',
    'warpdom-compare',
    '/work/warpdom/node_modules/jest-environment-node/build/index.js',
    'C:\\work\\warpdom\\node_modules\\jest-environment-jsdom\\build\\index.js',
    '/work/warpdom/node_modules/.pnpm/node_modules/jest-environment-node/build/index.js',
  ])
    assert.equal(isWarpdomEnvironment(e), false, e);

  const dir = tmp('from-warpdom-2');
  const log = path.join(dir, 'from-warpdom.log');
  const saved = process.env.WARPDOM_COMPARE_FROM_WARPDOM_LOG;
  process.env.WARPDOM_COMPARE_FROM_WARPDOM_LOG = log;
  try {
    const require = createRequire(path.join(dir, 'x.js'));
    const vitest = async (name, config, options) => {
      write(path.join(dir, `${name}.config.mjs`), `export default ${JSON.stringify(config)};`);
      const wrapper = write(
        path.join(dir, `${name}.warpdom-compare.mjs`),
        vitestWrapper(path.join(dir, `${name}.config.mjs`), options),
      );
      return (await import(pathToFileURL(wrapper).href)).default({ mode: 'test' });
    };
    // Vitest 2 and 3: environmentMatchGlobs choose a file's environment
    // over test.environment, so their DOM targets are switched too.
    const globs = [
      ['**/*.dom.spec.js', 'warpdom'],
      ['**/*.jsdom.spec.js', 'jsdom'],
      ['**/*.node.spec.js', 'node'],
    ];
    const config = {
      test: {
        environment: 'node',
        environmentMatchGlobs: globs,
        projects: [{ test: { name: 'a', environmentMatchGlobs: globs } }],
      },
    };
    const baseline = await vitest('g1', config, { environment: 'jsdom', fromWarpdom: true });
    assert.equal(baseline.test.environment, 'node');
    const switched = [
      ['**/*.dom.spec.js', 'jsdom'],
      ['**/*.jsdom.spec.js', 'jsdom'],
      ['**/*.node.spec.js', 'node'],
    ];
    assert.deepEqual(baseline.test.environmentMatchGlobs, switched);
    assert.deepEqual(baseline.test.projects[0].test.environmentMatchGlobs, switched);
    const warpdom = await vitest('g2', config, { environment: PINNED_TARGET });
    assert.deepEqual(warpdom.test.environmentMatchGlobs, [
      ['**/*.dom.spec.js', 'warpdom'],
      ['**/*.jsdom.spec.js', PINNED_TARGET],
      ['**/*.node.spec.js', 'node'],
    ]);
    const kept = await vitest('g3', config, {});
    assert.deepEqual(kept.test.environmentMatchGlobs, globs, 'the baseline run without --baseline keeps them');

    // Jest: a resolved Node environment in a checkout named warpdom stays.
    const nodeEnv = '/work/warpdom/node_modules/jest-environment-node/build/index.js';
    const file = write(
      path.join(dir, 'j.config.js'),
      `module.exports = { projects: [{ testEnvironment: ${JSON.stringify(nodeEnv)} }, { testEnvironment: 'warpdom' }] };`,
    );
    const jestCfg = await require(
      write(path.join(dir, 'j.warpdom-compare.cjs'), jestWrapper(file, { environment: 'jsdom', fromWarpdom: true })),
    )();
    assert.deepEqual(
      jestCfg.projects.map((p) => p.testEnvironment),
      [nodeEnv, 'jsdom'],
    );
    // The warpdom environments the wrappers switched, for the report
    // (projects in other config files are only seen there).
    assert.deepEqual(fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).sort(), [
      'warpdom',
      'warpdom',
      'warpdom',
    ]);
  } finally {
    if (saved === undefined) delete process.env.WARPDOM_COMPARE_FROM_WARPDOM_LOG;
    else process.env.WARPDOM_COMPARE_FROM_WARPDOM_LOG = saved;
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
    assert.equal(
      detectRunner(pkg, { config: 'vite.config.ts' }).runner,
      'vitest',
      'an explicit config names the runner',
    );
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
    assert.deepEqual(
      [...environmentComments([a, b, c, d, path.join(dir, 'gone.js')], 'vitest')],
      [
        [a, 'jsdom'],
        [b, 'happy-dom'],
      ],
    );
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
  assert.deepEqual(
    runnerArgs('vitest', { config: 'w.mjs', resultsFile: 'r.json', workers: 2, minWorkers: true, args: ['src'] }),
    [
      'run',
      '--config',
      'w.mjs',
      '--reporter=default',
      '--reporter=json',
      '--outputFile.json=r.json',
      '--coverage.enabled=false',
      '--minWorkers=1',
      '--maxWorkers=2',
      'src',
    ],
  );
  assert.deepEqual(runnerArgs('jest', { config: 'w.cjs', resultsFile: 'r.json' }), [
    '--config',
    'w.cjs',
    '--ci',
    '--json',
    '--outputFile=r.json',
    '--coverage=false',
  ]);
});

const report = (files) => ({
  startTime: 1000,
  testResults: files.map(([name, tests, extra = {}]) => ({
    name,
    status: tests.some((t) => t[1] === 'failed') || extra.status === 'failed' ? 'failed' : 'passed',
    endTime: 3500,
    ...extra,
    assertionResults: tests.map(([title, status, message, ancestors = []]) => ({
      title,
      ancestorTitles: ancestors,
      fullName: [...ancestors, title].join(' '),
      status,
      failureMessages: message ? [message] : [],
    })),
  })),
});

test('compare runs: tests of a JSON report, counts, duration', () => {
  const tests = testsOf(
    report([
      [
        '/p/src/a.test.js',
        [
          ['works', 'passed', null, ['suite']],
          ['works', 'passed', null, ['suite']],
          ['later', 'pending'],
          ['fails', 'failed', '\x1b[31mError: boom\x1b[0m\n  at x'],
        ],
      ],
      ['/p/src/b.test.js', [], { status: 'failed', message: 'SyntaxError: bad\nmore' }],
    ]),
    '/p',
  );
  assert.deepEqual(
    [...tests.keys()],
    [
      'src/a.test.js::suite > works',
      'src/a.test.js::suite > works #2',
      'src/a.test.js::later',
      'src/a.test.js::fails',
      'src/b.test.js::(file)',
    ],
  );
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

test('compare runs: tests told apart by project, from what the reporter recorded', () => {
  const sidecar = {
    files: [
      ['/p/shared.test.js', 'dom'],
      ['/p/a.test.js', 'dom'],
      ['/p/shared.test.js', 'server'],
    ],
  };
  const tests = testsOf(
    report([
      ['/p/shared.test.js', [['works', 'passed']]],
      ['/p/a.test.js', [['fails', 'failed', 'Error: x']]],
      ['/p/shared.test.js', [['works', 'failed', 'Error: no document']]],
    ]),
    '/p',
    sidecar,
  );
  assert.deepEqual(
    [...tests.keys()],
    ['dom::shared.test.js::works', 'dom::a.test.js::fails', 'server::shared.test.js::works'],
    'a file in two projects matched by occurrence',
  );
  assert.equal(tests.get('server::shared.test.js::works').project, 'server');
  assert.deepEqual(
    [...testsOf(report([['/p/a.test.js', [['t', 'passed']]]]), '/p', { files: [['/p/a.test.js', '']] }).keys()],
    ['a.test.js::t'],
    'an unnamed project keeps plain keys',
  );
  assert.equal(environmentLabel('/r/node_modules/.pnpm/x/node_modules/jest-environment-jsdom/build/index.js'), 'jsdom');
  assert.equal(environmentLabel('/r/node_modules/@happy-dom/jest-environment/lib/index.js'), 'happy-dom');
  assert.equal(environmentLabel('/r/node_modules/jest-fixed-jsdom/index.js'), 'jest-fixed-jsdom');
  assert.equal(environmentLabel('/r/node_modules/.warpdom-compare/src/vitest.js'), 'warpdom');
  assert.equal(environmentLabel('happy-dom'), 'happy-dom');
});

test('compare results: projects not on a DOM are not compared, counts per project', () => {
  const entry = (project, file, name, status) => [
    `${project}::${file}::${name}`,
    { project, file, name, status, message: '' },
  ];
  const base = new Map([
    entry('web', 'a', 't', 'passed'),
    entry('node', 'b', 't', 'passed'),
    entry('node', 'pinned', 't', 'passed'),
    entry('web', 'c', 't', 'passed'),
  ]);
  const warp = new Map([
    entry('web', 'a', 't', 'failed'),
    entry('node', 'b', 't', 'failed'),
    entry('node', 'pinned', 't', 'failed'),
    entry('web', 'c', 't', 'passed'),
  ]);
  const c = compareRuns([base], [warp], { skipProjects: new Set(['node']), keepFiles: new Set(['pinned']) });
  assert.equal(c.compared, 3);
  assert.equal(c.notCompared, 1);
  assert.equal(c.notComparedFiles, 0, 'not a pinned file');
  assert.deepEqual(
    c.notComparedChanged.map((t) => t.key),
    ['node::b::t'],
  );
  assert.deepEqual(
    c.differences.map((d) => d.key),
    ['web::a::t', 'node::pinned::t'],
    'a file switched by its comment is compared in a node project',
  );
  assert.deepEqual(c.byProject.web, {
    compared: 2,
    same: 1,
    regressions: 1,
    fixed: 0,
    other: 0,
    flaky: 0,
    notCompared: 0,
  });
  assert.deepEqual(c.byProject.node, {
    compared: 1,
    same: 0,
    regressions: 1,
    fixed: 0,
    other: 0,
    flaky: 0,
    notCompared: 1,
  });
  assert.deepEqual(
    groupDifferences(c.differences)[0].tests.map((t) => t.project),
    ['web', 'node'],
  );
});

const run = (entries) =>
  new Map(
    entries.map(([key, status, message = '']) => [
      key,
      { file: key.split('::')[0], name: key.split('::')[1], status, message },
    ]),
  );

test('compare results: classes, flaky tests, files not compared', () => {
  assert.equal(classify('passed', 'failed'), 'regression');
  assert.equal(classify('failed', 'passed'), 'fixed');
  assert.equal(classify('passed', 'missing'), 'other');
  assert.equal(classify('skipped', 'failed'), 'other');
  assert.equal(classify('missing', 'failed', true), 'regression', 'a file that fails to load only on warpdom');
  assert.equal(classify('failed', 'missing', true), 'fixed');

  const b1 = run([
    ['a::same', 'passed'],
    ['a::regress', 'passed'],
    ['a::fixed', 'failed', 'Error: jsdom 1'],
    ['a::flaky', 'passed'],
    ['a::wflaky', 'passed'],
    ['a::gone', 'passed'],
    ['p::pinned', 'passed'],
  ]);
  const b2 = run([
    ['a::same', 'passed'],
    ['a::regress', 'passed'],
    ['a::fixed', 'failed', 'Error: jsdom 2'],
    ['a::flaky', 'failed'],
    ['a::wflaky', 'passed'],
    ['a::gone', 'passed'],
    ['p::pinned', 'passed'],
  ]);
  const w1 = run([
    ['a::same', 'passed'],
    ['a::regress', 'failed', 'TypeError: x 12'],
    ['a::fixed', 'passed'],
    ['a::flaky', 'passed'],
    ['a::wflaky', 'failed'],
    ['b::(file)', 'failed', 'SyntaxError'],
    ['p::pinned', 'failed'],
  ]);
  const w2 = run([
    ['a::same', 'passed'],
    ['a::regress', 'failed', 'TypeError: x 13'],
    ['a::fixed', 'passed'],
    ['a::flaky', 'passed'],
    ['a::wflaky', 'passed'],
    ['b::(file)', 'failed', 'SyntaxError'],
    ['p::pinned', 'failed'],
  ]);
  const c = compareRuns([b1, b2], [w1, w2], { skipFiles: new Set(['p']) });
  assert.equal(c.compared, 6);
  assert.equal(c.same, 1);
  assert.equal(c.notCompared, 1);
  assert.deepEqual(
    c.notComparedChanged.map((t) => t.name),
    ['pinned'],
    'listed, not counted',
  );
  assert.deepEqual(
    c.flakyBaseline.map((t) => t.name),
    ['flaky'],
  );
  assert.deepEqual(
    c.flakyWarpdom.map((t) => t.name),
    ['wflaky'],
  );
  assert.deepEqual(
    c.differences.map((d) => [d.name, d.class]),
    [
      ['regress', 'regression'],
      ['fixed', 'fixed'],
      ['gone', 'other'],
      ['(file)', 'regression'],
    ],
  );
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
  assert.deepEqual(
    groups.map((g) => [g.change, g.tests.length]),
    [
      ['passed -> failed', 2],
      ['passed -> failed', 1],
      ['passed -> skipped', 1],
    ],
    'numbers folded; regressions first, largest first',
  );
});

// n8n's quickjsExpressionShadow/compare.test.ts: it.each over new Date()
// and DateTime.now() puts a timestamp in the name, a new key in every run.
test('compare results: tests whose name varies between runs are matched by position, not flaky', () => {
  const stamped = (t, { warpdom = false, flaky = false, gone = false } = {}) =>
    testsOf(
      report([
        [
          '/p/a.test.js',
          [
            [`valueType(${t}) is number`, 'passed', null, ['valueType']],
            ['valueType(text) is string', 'passed', null, ['valueType']],
            [`at ${t}: jsdom only`, warpdom ? 'failed' : 'passed', warpdom ? 'Error: on warpdom' : null, ['valueType']],
            [`at ${t}: flaky`, flaky ? 'failed' : 'passed', null, ['valueType']],
            ...(warpdom ? [] : [['only on jsdom', 'passed', null, ['valueType']]]),
            ['inner', 'passed', null, [`run of ${t}`]],
          ],
        ],
        ['/p/b.test.js', [['kept', 'passed'], ...(gone ? [] : [[`stamp ${t}`, 'passed']])]],
      ]),
      '/p',
    );
  const c = compareRuns(
    [stamped(1001), stamped(1002, { flaky: true })],
    [stamped(1003, { warpdom: true }), stamped(1004, { warpdom: true, gone: true })],
  );
  assert.deepEqual(
    c.nameVaries.map((t) => [t.file, t.name, t.names]),
    [
      [
        'a.test.js',
        'valueType > valueType(1001) is number',
        [1001, 1002, 1003, 1004].map((t) => `valueType > valueType(${t}) is number`),
      ],
      [
        'a.test.js',
        'valueType > at 1001: jsdom only',
        [1001, 1002, 1003, 1004].map((t) => `valueType > at ${t}: jsdom only`),
      ],
      ['a.test.js', 'valueType > at 1001: flaky', [1001, 1002, 1003, 1004].map((t) => `valueType > at ${t}: flaky`)],
      ['a.test.js', 'run of 1001 > inner', [1001, 1002, 1003, 1004].map((t) => `run of ${t} > inner`)],
    ],
    'per describe path first, then per file (the describe path varies too)',
  );
  assert.deepEqual(
    c.differences.map((d) => [d.name, d.baseline, d.warpdom, d.class]),
    [
      ['valueType > at 1001: jsdom only', 'passed', 'failed', 'regression'],
      ['valueType > only on jsdom', 'passed', 'missing', 'other'],
    ],
    'compared like the others; a test of one side only is not paired with a varying name',
  );
  assert.equal(c.differences[0].message, 'Error: on warpdom');
  assert.deepEqual(
    c.flakyBaseline.map((t) => t.name),
    ['valueType > at 1001: flaky', 'stamp 1001', 'stamp 1002'],
    'status changes between rounds are still flaky; where a run has fewer such tests, none are paired',
  );
  assert.deepEqual(
    c.flakyWarpdom.map((t) => t.name),
    ['stamp 1003'],
  );
  assert.equal(c.compared, 10);
  assert.equal(c.same, 4);
  assert.equal(c.byProject[''].flaky, 4);

  // One run each (--correctness): without matching, each would be a
  // passed -> missing and a missing -> passed difference.
  const once = compareRuns([stamped(1)], [stamped(2)]);
  assert.equal(once.nameVaries.length, 5);
  assert.deepEqual(once.differences, []);
  assert.equal(once.same, once.compared);
  // Uneven describe blocks are not paired file-wide: C regresses in
  // "second", and pairing A/A, B/C, C/D would hide it.
  const blocks = (t, tests) =>
    testsOf(
      report([
        ['/p/c.test.js', tests.map(([title, status, suite]) => [`${title} ${t}`.trim(), status, null, [suite]])],
      ]),
      '/p',
    );
  const uneven = compareRuns(
    [
      blocks(1, [
        ['A', 'passed', 'first'],
        ['B', 'failed', 'first'],
        ['C', 'passed', 'second'],
      ]),
    ],
    [
      blocks(2, [
        ['A', 'passed', 'first'],
        ['C', 'failed', 'second'],
        ['D', 'passed', 'second'],
      ]),
    ],
  );
  assert.deepEqual(uneven.nameVaries, []);
  assert.equal(uneven.same, 0);
  assert.equal(uneven.differences.length, 6, 'each a test missing on one side, as without matching');
  // Tests in every run are boundaries: A/B and B/C would cross "anchor"
  // and hide B's regression.
  const anchored = (t, tests) => {
    const run = blocks(t, tests);
    const entries = [...run];
    entries.splice(tests.anchorAt, 0, [
      'c.test.js::s > anchor',
      { file: 'c.test.js', name: 's > anchor', suite: 's', status: 'passed', message: '' },
    ]);
    return new Map(entries);
  };
  const crossing = compareRuns(
    [
      anchored(
        1,
        Object.assign(
          [
            ['A', 'failed', 's'],
            ['B', 'passed', 's'],
          ],
          { anchorAt: 1 },
        ),
      ),
    ],
    [
      anchored(
        2,
        Object.assign(
          [
            ['B', 'failed', 's'],
            ['C', 'passed', 's'],
          ],
          { anchorAt: 0 },
        ),
      ),
    ],
  );
  assert.deepEqual(crossing.nameVaries, []);
  assert.equal(crossing.same, 1, 'only the anchor');
  assert.equal(crossing.differences.length, 4, 'each a test missing on one side, as without matching');
  // A key in several runs keeps one identity: C would be A's on the
  // baseline and B's on warpdom, hiding tests that come and go.
  const plain = (tests) => blocks('', tests);
  const contradictory = compareRuns(
    [
      plain([
        ['A', 'passed', 's'],
        ['B', 'failed', 's'],
      ]),
      plain([
        ['C', 'passed', 's'],
        ['B', 'failed', 's'],
      ]),
    ],
    [
      plain([
        ['A', 'passed', 's'],
        ['B', 'failed', 's'],
      ]),
      plain([
        ['A', 'passed', 's'],
        ['C', 'failed', 's'],
      ]),
    ],
  );
  assert.deepEqual(contradictory.nameVaries, []);
  assert.deepEqual(
    [...contradictory.flakyBaseline, ...contradictory.flakyWarpdom].map((t) => t.name),
    ['s > A', 's > C', 's > B'],
    'tests that come and go stay flaky',
  );
  // Segments are bounded on both sides: with "left" and "right" in another
  // order, A/C and B/B would hide B's regression.
  const seq = (...tests) => plain(tests.map((t) => [t.replace(/!$/, ''), t.endsWith('!') ? 'failed' : 'passed', 's']));
  const reordered = compareRuns([seq('left', 'A1!', 'right', 'B1')], [seq('right', 'C2', 'left', 'B2!')]);
  assert.deepEqual(reordered.nameVaries, []);
  assert.equal(reordered.differences.length, 4);
  // Every place of a key must be its column in one segment: A is before
  // "anchor" in one run and after it in two.
  const split = compareRuns(
    [seq('A', 'anchor'), seq('C', 'anchor', 'A')],
    [seq('B', 'anchor'), seq('D', 'anchor', 'A!')],
  );
  assert.deepEqual(split.nameVaries, []);
  assert.deepEqual(
    split.flakyWarpdom.map((t) => t.name),
    ['s > A', 's > B', 's > D'],
    'A passes on every baseline run: flaky on warpdom only',
  );
  assert.deepEqual(
    split.flakyBaseline.map((t) => t.name),
    ['s > C'],
  );
  const moved = compareRuns([seq('K', 'anchor', 'M')], [seq('L', 'anchor', 'K')]);
  assert.deepEqual(moved.nameVaries, []);
  assert.deepEqual(
    moved.differences.map((d) => [d.name, d.baseline, d.warpdom]),
    [
      ['s > M', 'passed', 'missing'],
      ['s > L', 'missing', 'passed'],
    ],
    'K is the same test in both runs, not a missing one',
  );
  // Not compared (a pinned file): not listed as matched and compared.
  const pinned = compareRuns([stamped(1)], [stamped(2)], { skipFiles: new Set(['a.test.js', 'b.test.js']) });
  assert.deepEqual(pinned.nameVaries, []);
  assert.equal(pinned.compared, 0);
  assert.deepEqual(pinned.notComparedChanged, [], 'matched, so no status change');
  // Names the same in every run: nothing to match.
  const stable = compareRuns([stamped(1)], [stamped(1)]);
  assert.deepEqual(stable.nameVaries, []);
  assert.equal(stable.same, stable.compared);
});

test('compare results: timing, run order, exit codes', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  const one = timingSummary([{ baselineMs: 1200, warpdomMs: 1000 }]);
  assert.equal(one.indicative, true);
  assert.equal(one.noisy, false);
  assert.ok(Math.abs(one.speedup - 1.2) < 1e-9);
  const steady = timingSummary([
    { baselineMs: 1200, warpdomMs: 1000 },
    { baselineMs: 1210, warpdomMs: 1000 },
    { baselineMs: 1190, warpdomMs: 1000 },
  ]);
  assert.equal(steady.indicative, false);
  assert.equal(steady.noisy, false);
  assert.ok(Math.abs(steady.spread.min - 1.19) < 1e-9 && Math.abs(steady.spread.max - 1.21) < 1e-9);
  assert.equal(
    timingSummary([
      { baselineMs: 1200, warpdomMs: 1000 },
      { baselineMs: 1600, warpdomMs: 1000 },
    ]).noisy,
    true,
  );
  assert.deepEqual([0, 1, 2, 3].map(pairOrder), [
    ['baseline', 'warpdom'],
    ['warpdom', 'baseline'],
    ['baseline', 'warpdom'],
    ['warpdom', 'baseline'],
  ]);
  // Three sides rotate, so each runs first, second and third in turn.
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => pairOrder(i, ['baseline', 'warpdom', 'happy-dom'])),
    [
      ['baseline', 'warpdom', 'happy-dom'],
      ['warpdom', 'happy-dom', 'baseline'],
      ['happy-dom', 'baseline', 'warpdom'],
      ['baseline', 'warpdom', 'happy-dom'],
    ],
  );
  assert.equal(exitCode({ regressions: 0 }), 0);
  assert.equal(exitCode({ regressions: 3 }), 1);
  assert.equal(exitCode({ error: 'no results', regressions: 3 }), 2);
  assert.equal(speedPhrase(1.5), '1.50x faster');
  assert.equal(speedPhrase(0.8), '1.25x slower');
});

// --- report --------------------------------------------------------------------

function sampleResult(overrides = {}) {
  const differences = [
    {
      key: 'src/secret-file.test.js::private test name',
      file: 'src/secret-file.test.js',
      name: 'private test name',
      baseline: 'passed',
      warpdom: 'failed',
      class: 'regression',
      message: 'TypeError: nope',
    },
  ];
  return {
    runner: 'vitest',
    runnerVersion: '2.1.9',
    baseline: { name: 'jsdom', version: '25.0.1' },
    warpdom: { version: '0.0.0', source: 'copied' },
    mode: 'timing',
    warmup: true,
    error: null,
    warnings: [],
    gitChanges: [],
    external: 0,
    projects: [
      { name: null, environment: 'jsdom', browser: false, dom: true },
      { name: 'server', environment: 'node', browser: false, dom: false },
    ],
    pinned: {
      files: 2,
      tests: 14,
      environments: ['jsdom'],
      list: [{ file: 'src/pinned.test.js', environment: 'jsdom' }],
    },
    correctness: {
      compared: 120,
      same: 119,
      notCompared: 14,
      notComparedChanged: [{ file: 'src/pinned.test.js', name: 'p', baseline: ['passed'], warpdom: ['failed'] }],
      flakyBaseline: [],
      flakyWarpdom: [],
      differences,
      regressions: 1,
      fixed: 0,
      other: 0,
      groups: groupDifferences(differences),
    },
    timing: {
      ...timingSummary([
        { baselineMs: 12000, warpdomMs: 10000 },
        { baselineMs: 12400, warpdomMs: 10000 },
      ]),
      perRound: [
        { round: 1, baselineMs: 12000, warpdomMs: 10000 },
        { round: 2, baselineMs: 12400, warpdomMs: 10000 },
      ],
      source: 'runner',
    },
    environment: {
      node: 'v22.12.0',
      os: { platform: 'linux', release: '6', arch: 'x64' },
      cpu: { model: 'CPU', cores: 4 },
      memory: { totalGiB: 16 },
    },
    runs: [
      {
        index: 1,
        side: 'baseline',
        warmup: true,
        round: null,
        code: 1,
        ms: 13000,
        counts: { passed: 119, failed: 1 },
        log: 'logs/1-baseline.log',
      },
    ],
    ...overrides,
  };
}

test('compare report: terminal summary and report.md', () => {
  const result = sampleResult();
  const text = renderConsole(result, { reportPath: '.warpdom-compare/report.md' });
  assert.match(
    text,
    /^warpdom compare: vitest 2\.1\.9, 2 projects, baseline jsdom 25\.0\.1 \(warpdom's jsdom-25 profile\)/,
  );
  assert.match(text, /Results {3}120 tests, 119 tests with the same status; 1 pass on jsdom and fail on warpdom/);
  assert.match(text, /1 {2}passed -> failed {2}TypeError: nope/);
  assert.match(text, /Not compared: 2 files \(14 tests\) choose jsdom with a comment/);
  const switched = renderConsole(
    sampleResult({
      pinned: {
        files: 3,
        tests: 0,
        switched: 3,
        switchedEnvironments: ['jsdom'],
        withOptions: 1,
        notSwitched: 0,
        notSwitchedEnvironments: [],
        environments: ['jsdom'],
        list: [],
      },
    }),
  );
  assert.match(switched, /3 files pin jsdom with a comment; switched/);
  assert.match(
    switched,
    /\(1 switched file also sets @vitest-environment-options, which stay keyed by the original name and do not reach warpdom\)/,
  );
  assert.doesNotMatch(switched, /Not compared: \d+ files? \(/);
  assert.match(text, /\(1 test not compared changed status between runs anyway: listed in the report\)/);
  assert.match(text, /Not compared: 1 project on node, ran unchanged in both runs/);
  const mixed = renderConsole(
    sampleResult({
      projects: [...result.projects, { name: 'b (chromium)', environment: 'node', browser: true, dom: false }],
    }),
  );
  assert.match(mixed, /Not compared: 2 projects on node and in browser mode, ran unchanged in both runs/);
  const stuck = renderConsole(
    sampleResult({
      projects: [
        ...result.projects,
        { name: 'nested', environment: 'jsdom', browser: false, dom: false, unswitched: true },
      ],
    }),
  );
  assert.match(stuck, /Not compared: 1 project on jsdom that compare could not switch/);
  assert.match(stuck, /Not compared: 1 project on node, ran unchanged/);
  assert.match(text, /median {2}12\.2 s +10\.0 s +1\.22x faster \(spread 1\.20x-1\.24x\)/);
  assert.match(text, /Report {4}\.warpdom-compare\/report\.md/);

  const md = renderMarkdown(result);
  const [summary, details] = md.split('## Details');
  assert.doesNotMatch(summary, /secret-file|private test name|pinned\.test/, 'the summary names no files or tests');
  assert.match(summary, /\| Pass on jsdom, fail on warpdom \| 1 \|/);
  assert.match(summary, /\| \*\*median\*\* \| 12\.2 s \| 10\.0 s \| \*\*1\.22x faster\*\* \|/);
  assert.match(details, /`src\/secret-file\.test\.js` › private test name/);

  const same = sampleResult({
    correctness: {
      ...result.correctness,
      same: 120,
      differences: [],
      regressions: 0,
      groups: [],
      flakyBaseline: [{ file: 'f', name: 'n', baseline: ['passed', 'failed'], warpdom: ['passed', 'passed'] }],
    },
    timing: null,
    mode: 'correctness',
  });
  const sameText = renderConsole(same);
  assert.match(sameText, /119 tests, all with the same status on jsdom and warpdom/);
  assert.match(sameText, /\(1 flaky on jsdom itself: listed in the report, not counted\)/);
  assert.match(sameText, /Speed {5}not measured \(--correctness\)/);

  const names = ['at 2026-10-24T10:00:00.001Z: `x`', 'at 2026-10-24T10:00:03.502Z: `x`'];
  const varies = sampleResult({
    correctness: {
      ...result.correctness,
      nameVaries: [
        { project: '', file: 'src/stamp.test.js', name: names[0], names, baseline: ['passed'], warpdom: ['passed'] },
      ],
    },
  });
  assert.match(
    renderConsole(varies),
    /\(1 test with a name that varies between runs, matched by position and compared: listed in the report\)/,
  );
  const [variesSummary, variesDetails] = renderMarkdown(varies).split('## Details');
  assert.match(variesSummary, /\| Name varies between runs \(matched by position, compared\) \| 1 \|/);
  assert.doesNotMatch(variesSummary, /stamp\.test/, 'names in the details only');
  assert.match(
    variesDetails,
    /### Name varies between runs \(matched by position\)\n\n.*\n\n- `src\/stamp\.test\.js`: `at 2026-10-24T10:00:00\.001Z: 'x'`, `at 2026-10-24T10:00:03\.502Z: 'x'`\n/,
  );
  assert.doesNotMatch(renderMarkdown(result), /Name varies/, 'not shown when there are none');
  assert.doesNotMatch(renderConsole(result), /name that varies/);

  const failed = renderConsole({
    runner: null,
    error: 'neither Vitest nor Jest is installed here',
    warnings: [],
    gitChanges: [],
  });
  assert.match(failed, /^warpdom compare\n\nError {5}neither Vitest/);
  assert.match(renderMarkdown({ runner: null, error: 'x', warnings: [], gitChanges: [] }), /- Error: x/);
});

// --- files in the project ---------------------------------------------------------

test("compare files: only compare's own files are removed, also after a killed run", () => {
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
    assert.deepEqual(
      t2.list().map((e) => e.path),
      [b],
    );
    t2.remove();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare files: a package linked for the run is removed only while it is still that link', () => {
  const dir = tmp('link');
  try {
    const temp = new TempFiles(path.join(dir, 'out', 'pending.json'));
    const source = write(path.join(dir, 'other', 'happy-dom', 'package.json'), '{}');
    const nm = path.join(dir, 'node_modules');
    fs.mkdirSync(nm);
    const link = linkPackage(nm, 'happy-dom', path.dirname(source), temp);
    assert.equal(fs.realpathSync(link), fs.realpathSync(path.dirname(source)));
    // A scoped name gets its scope directory, removed again when empty.
    const scoped = linkPackage(nm, '@happy-dom/jest-environment', path.dirname(source), temp);
    assert.ok(fs.lstatSync(scoped).isSymbolicLink());
    // Already there: nothing linked, nothing recorded.
    assert.equal(linkPackage(nm, 'happy-dom', path.dirname(source), temp), null);
    temp.remove();
    assert.deepEqual(fs.readdirSync(nm), []);
    assert.ok(fs.existsSync(source), 'the target is untouched');
    // Replaced by a real package in the meantime: kept.
    const again = linkPackage(nm, 'happy-dom', path.dirname(source), temp);
    fs.unlinkSync(again);
    write(path.join(again, 'package.json'), '{"name":"happy-dom"}');
    temp.remove();
    assert.ok(fs.existsSync(path.join(again, 'package.json')));
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
    for (const f of [
      'package.json',
      'src/vitest.js',
      'src/jest.js',
      'node_modules/parse5/package.json',
      'node_modules/entities/package.json',
      'node_modules/@rgrove/parse-xml/package.json',
    ]) {
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
    assert.equal(
      PINNED_PACKAGE,
      `vitest-environment-${PINNED_TARGET}`,
      'the name Vitest resolves for the switched comment',
    );
    assert.ok(isOwnName(pkg));
    const json = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
    assert.equal(json.type, 'module');
    // Resolved the way Vitest resolves it, from the project.
    const resolved = createRequire(path.join(dir, 'package.json')).resolve(PINNED_PACKAGE);
    assert.equal((await import(pathToFileURL(resolved).href)).default.name, 'warpdom');
    assert.deepEqual(
      temp.list().map((e) => e.path),
      [pkg],
    );
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
  assert.deepEqual(parseArgs(['--rounds', '3', '--workers', '2', '--', 'src', '--project', 'x']), {
    args: ['src', '--project', 'x'],
    rounds: 3,
    workers: 2,
  });
  assert.deepEqual(parseArgs(['--correctness', '--baseline', 'happy-dom', '--out', 'o']), {
    args: [],
    correctness: true,
    baseline: 'happy-dom',
    out: 'o',
  });
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
  ...fs
    .readdirSync(dir, { recursive: true })
    .filter(
      (f) =>
        !f.split(path.sep).some((s) => s === 'node_modules' || s === '.warpdom-compare') &&
        f.includes('warpdom-compare.'),
    ),
  ...fs.readdirSync(path.join(dir, 'node_modules')).filter((f) => f.includes('warpdom-compare')),
];

test('compare end to end (Vitest): differences, exit code 1, nothing left behind', () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    const res = compareCli(dir, ['--correctness']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(
      res.stdout,
      /7 tests, 4 tests with the same status; 2 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/,
    );
    assert.match(res.stdout, /2 files pin happy-dom\/jsdom with a comment; switched/);
    assert.doesNotMatch(res.stdout, /Not compared/);
    assert.match(res.stdout, /Speed {5}not measured/);
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.equal(result.exitCode, 1);
    assert.equal(result.warpdom.source, 'copied');
    assert.deepEqual(
      result.runs.map((r) => r.side),
      ['baseline', 'warpdom'],
    );
    assert.deepEqual(result.correctness.differences.map((d) => [d.name, d.class]).sort(), [
      ['passes on jsdom only', 'regression'],
      ['passes on warpdom only', 'fixed'],
      ['pinned to jsdom: passes on jsdom only', 'regression'],
    ]);
    assert.deepEqual(result.pinned.list.map((p) => [p.file, p.environment, p.switched, p.baseline ?? null]).sort(), [
      ['pinned-happy.spec.js', 'happy-dom', true, 'jsdom'],
      ['pinned.spec.js', 'jsdom', true, null],
    ]);
    assert.ok(fs.existsSync(path.join(dir, '.warpdom-compare', 'report.md')));
    assert.ok(fs.existsSync(path.join(dir, '.warpdom-compare', 'logs', '2-warpdom.log')));
    assert.deepEqual(leftovers(dir), []);
    assert.ok(!fs.existsSync(path.join(dir, '.warpdom-compare', 'pending.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Names with timestamps (n8n's quickjsExpressionShadow/compare.test.ts): a
// new name in every run, matched by position, not flaky.
const STAMP = /\d{4}-\d\d-\d\dT[\d:.]+Z|\d{10,}/g;
test('compare end to end (Vitest): tests whose name varies between runs', () => {
  const dir = fixtureProject('compare-vitest-names', vitestLinks());
  try {
    const res = compareCli(dir, ['--rounds', '2']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /4 tests, 3 tests with the same status; 1 pass on jsdom and fail on warpdom/);
    assert.match(
      res.stdout,
      /\(3 tests with a name that varies between runs, matched by position and compared: listed in the report\)/,
    );
    assert.doesNotMatch(res.stdout, /flaky/);
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.equal(result.runs.length, 6);
    assert.deepEqual(result.correctness.flakyBaseline, []);
    assert.deepEqual(result.correctness.flakyWarpdom, []);
    assert.deepEqual(
      result.correctness.nameVaries.map((t) => [t.name.replace(STAMP, 'N'), new Set(t.names).size]),
      [
        ['valueType > valueType(N) is number', 6],
        ['valueType > at N: passes on jsdom only', 6],
        ['run of N > in a describe whose name varies', 6],
      ],
    );
    assert.deepEqual(
      result.correctness.differences.map((d) => [d.name.replace(STAMP, 'N'), d.class]),
      [['valueType > at N: passes on jsdom only', 'regression']],
    );
    assert.match(
      fs.readFileSync(path.join(dir, '.warpdom-compare', 'report.md'), 'utf8'),
      /### Name varies between runs/,
    );
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// handsontable's angular wrapper: "test": "jest --config
// projects/hot-table/jest.config.js"; compare reads the config from there.
test('compare end to end (Vitest): the config the test script passes', () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    fs.renameSync(path.join(dir, 'vitest.config.js'), path.join(dir, 'vitest.unit.config.js'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ type: 'module', scripts: { test: 'vitest run --config vitest.unit.config.js' } }),
    );
    const res = compareCli(dir, ['--correctness']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /Config from the test script: vitest\.unit\.config\.js/);
    assert.match(res.stdout, /2 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/);
    assert.deepEqual(leftovers(dir), []);
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
    assert.deepEqual(
      result.runs.map((r) => `${r.warmup ? 'w' : r.round}:${r.side[0]}`),
      ['w:b', 'w:w', '1:w', '1:b', '2:b', '2:w'],
    );
    assert.equal(result.timing.rounds, 2);
    assert.equal(result.timing.source, 'runner');
    assert.equal(result.environment.runner.name, 'vitest');
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare API (Vitest): without isolation, projects and pinned files share workers on warpdom as on jsdom', async () => {
  // Vitest gives each environment name its own workers when files share
  // them. One worker: all four files (two pinned to jsdom) run in one
  // process on each side; with a path for the config and a name for the
  // pinned files, warpdom's run had two.
  const dir = fixtureProject('compare-vitest-group', vitestLinks());
  const log = path.join(dir, 'group.log');
  try {
    const result = await compare({ cwd: dir, correctness: true, workers: 1, env: { WARPDOM_COMPARE_GROUP_LOG: log } });
    assert.equal(result.error, null, JSON.stringify(result.warnings));
    assert.equal(result.exitCode, 0);
    const lines = fs
      .readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((l) => l.split(' '));
    for (const side of ['jsdom', 'warpdom']) {
      const own = lines.filter(([s]) => s === side);
      assert.deepEqual(own.map(([, f]) => f).sort(), ['a', 'b', 'c', 'd'], `every file ran on ${side}`);
      assert.equal(
        new Set(own.map(([, , pid]) => pid)).size,
        1,
        `${side}: one environment group, one worker (${own.map((l) => l.join(' ')).join(', ')})`,
      );
    }
    assert.equal(result.pinned.switched, 2);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare API: alsoEnvironments, env, domPackages, no warm-up', async () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    // A file that needs the run's environment variables (API option env).
    write(
      path.join(dir, 'env.spec.js'),
      "import { test, expect } from 'vitest';\ntest('sees env', () => { expect(process.env.WARPDOM_COMPARE_TEST_ENV).toBe('yes'); });\n",
    );
    assert.ok(!fs.existsSync(path.join(dir, 'node_modules', 'happy-dom')));
    const result = await compare({
      cwd: dir,
      rounds: 2,
      warmup: false,
      workers: 2,
      alsoEnvironments: ['happy-dom', 'jsdom'],
      env: { WARPDOM_COMPARE_TEST_ENV: 'yes' },
      domPackages: path.join(root, 'node_modules'),
    });
    assert.equal(result.error, null, JSON.stringify(result.warnings));
    assert.equal(result.warmup, false);
    // jsdom is the baseline, so only happy-dom is added; three sides rotate.
    assert.deepEqual(
      result.runs.map((r) => `${r.round}:${r.side}`),
      ['1:baseline', '1:warpdom', '1:happy-dom', '2:warpdom', '2:happy-dom', '2:baseline'],
    );
    assert.deepEqual(Object.keys(result.also), ['happy-dom']);
    const happy = result.also['happy-dom'];
    assert.equal(happy.provided, true);
    assert.equal(happy.environment.name, 'happy-dom');
    assert.match(happy.environment.version, /^\d+\./);
    // On happy-dom: the jsdom-only test still passes, warpdom's own fails,
    // and the file pinned to happy-dom (jsdom on the baseline) fails its
    // jsdom user-agent check; the file pinned to jsdom ran on happy-dom.
    // On happy-dom only the file pinned to happy-dom (jsdom on the
    // baseline) changes: it checks for jsdom's user agent. The env file
    // passes everywhere (env reaches every run).
    assert.deepEqual(
      happy.correctness.differences.map((d) => [d.name, d.class]),
      [['pinned to happy-dom: runs on jsdom or warpdom', 'regression']],
    );
    for (const run of result.runs) {
      const report = JSON.parse(fs.readFileSync(path.join(result.out, run.results), 'utf8'));
      const envTest = report.testResults.flatMap((t) => t.assertionResults).find((a) => a.title === 'sees env');
      assert.equal(envTest.status, 'passed', `${run.side} run sees the env option`);
    }
    assert.equal(happy.timing.perRound.length, 2);
    assert.ok(happy.timing.ms > 0 && happy.timing.speedup > 0);
    // warpdom's comparison and exit code are unchanged by the extra DOM.
    assert.deepEqual(result.correctness.differences.map((d) => [d.name, d.class]).sort(), [
      ['passes on jsdom only', 'regression'],
      ['passes on warpdom only', 'fixed'],
      ['pinned to jsdom: passes on jsdom only', 'regression'],
    ]);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.env, ['WARPDOM_COMPARE_TEST_ENV']);
    // The linked happy-dom is gone, like the other temporary files.
    assert.ok(!fs.existsSync(path.join(dir, 'node_modules', 'happy-dom')));
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

// A project already migrated to warpdom (#172): its config and a comment
// say warpdom, the name served by vitest-environment-warpdom.
function migratedProject(links = vitestLinks()) {
  const dir = fixtureProject('compare-vitest', links);
  fs.writeFileSync(
    path.join(dir, 'vitest.config.js'),
    "export default { test: { include: ['*.spec.js'], environment: 'warpdom' } };",
  );
  const pinned = path.join(dir, 'pinned.spec.js');
  fs.writeFileSync(
    pinned,
    fs.readFileSync(pinned, 'utf8').replace('@vitest-environment jsdom', '@vitest-environment warpdom'),
  );
  write(
    path.join(dir, 'node_modules', 'vitest-environment-warpdom', 'package.json'),
    JSON.stringify({ name: 'vitest-environment-warpdom', type: 'module', exports: './index.js' }),
  );
  write(
    path.join(dir, 'node_modules', 'vitest-environment-warpdom', 'index.js'),
    `export { default } from ${JSON.stringify(pathToFileURL(path.join(root, 'src', 'vitest.js')).href)};\n`,
  );
  return dir;
}

test('compare end to end (#172): a project on warpdom needs --baseline, and gets its baseline on that DOM', () => {
  const dir = migratedProject();
  try {
    const plain = compareCli(dir, ['--correctness']);
    assert.equal(plain.status, 2, plain.stdout + plain.stderr);
    const text = (plain.stdout + plain.stderr).replace(/\x1b\[[0-9;]*m/g, '');
    assert.match(text, /nothing to compare: no project runs on jsdom or happy-dom \(found: warpdom\)/);
    assert.match(text, /already runs on warpdom: add --baseline jsdom \(or happy-dom\)/);
    assert.deepEqual(leftovers(dir), []);

    const res = compareCli(dir, ['--correctness', '--baseline', 'jsdom']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    const out = res.stdout.replace(/\x1b\[[0-9;]*m/g, '');
    assert.match(out, /baseline jsdom \d/);
    assert.match(out, /^warpdom compare: vitest [^\n]*, baseline jsdom [^\n]*, for a project on warpdom$/m);
    assert.match(
      fs.readFileSync(path.join(dir, '.warpdom-compare', 'report.md'), 'utf8'),
      /^- The project runs on warpdom: its projects and files on warpdom ran on jsdom in the baseline runs \(--baseline\)$/m,
    );
    assert.match(
      out,
      /7 tests, 4 tests with the same status; 2 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/,
    );
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.equal(result.fromWarpdom, true);
    assert.deepEqual(result.correctness.differences.map((d) => [d.name, d.class]).sort(), [
      ['passes on jsdom only', 'regression'],
      ['passes on warpdom only', 'fixed'],
      ['pinned to jsdom: passes on jsdom only', 'regression'],
    ]);
    assert.deepEqual(result.pinned.list.map((p) => [p.file, p.environment, p.switched, p.baseline ?? null]).sort(), [
      ['pinned-happy.spec.js', 'happy-dom', true, 'jsdom'],
      ['pinned.spec.js', 'warpdom', true, 'jsdom'],
    ]);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end (#172): --baseline on a project on node whose files choose warpdom with a comment', () => {
  const dir = migratedProject();
  try {
    fs.writeFileSync(path.join(dir, 'vitest.config.js'), "export default { test: { include: ['*.spec.js'] } };");
    const res = compareCli(dir, ['--correctness', '--baseline', 'jsdom']);
    const out = res.stdout.replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(res.status, 1, out + res.stderr);
    assert.match(out, /, for a project on warpdom$/m);
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.equal(result.fromWarpdom, true);
    assert.deepEqual(
      result.correctness.differences.map((d) => [d.name, d.class]),
      [['pinned to jsdom: passes on jsdom only', 'regression']],
    );
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The root config lists a project file whose environment is warpdom: only
// the run shows it.
function migratedChildProject() {
  const dir = migratedProject();
  fs.mkdirSync(path.join(dir, 'a'));
  for (const f of ['differ.spec.js', 'same.spec.js']) fs.renameSync(path.join(dir, f), path.join(dir, 'a', f));
  for (const f of ['pinned.spec.js', 'pinned-happy.spec.js']) fs.rmSync(path.join(dir, f));
  fs.writeFileSync(
    path.join(dir, 'a', 'vitest.config.js'),
    "export default { test: { include: ['*.spec.js'], environment: 'warpdom' } };",
  );
  fs.writeFileSync(
    path.join(dir, 'vitest.config.js'),
    "export default { test: { projects: ['./a/vitest.config.js'] } };",
  );
  return dir;
}

test('compare end to end (#172): --baseline on a project on warpdom in another config file', () => {
  const dir = migratedChildProject();
  try {
    const res = compareCli(dir, ['--correctness', '--baseline', 'jsdom']);
    const out = res.stdout.replace(/\x1b\[[0-9;]*m/g, '');
    assert.equal(res.status, 1, out + res.stderr);
    assert.match(out, /, for a project on warpdom$/m);
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.equal(result.fromWarpdom, true);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end (#172): --baseline on a project on warpdom without that DOM installed', () => {
  const { jsdom, ...links } = vitestLinks();
  assert.ok(jsdom);
  const dir = migratedProject(links);
  try {
    const res = compareCli(dir, ['--correctness', '--baseline', 'jsdom']);
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.match(res.stdout.replace(/\x1b\[[0-9;]*m/g, ''), /--baseline jsdom: jsdom is not installed here/);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare API: requireDom false runs a node-only package anyway, nothing compared', async () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  try {
    fs.writeFileSync(path.join(dir, 'vitest.config.js'), "export default { test: { include: ['same.spec.js'] } };");
    const result = await compare({
      cwd: dir,
      correctness: true,
      requireDom: false,
      alsoEnvironments: ['happy-dom'],
      domPackages: path.join(root, 'node_modules'),
    });
    assert.equal(result.error, null);
    assert.deepEqual(
      result.runs.map((r) => r.side),
      ['baseline', 'warpdom', 'happy-dom'],
    );
    assert.equal(result.correctness.compared, 0);
    assert.equal(result.correctness.notCompared, 2);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end: SIGTERM during a run stops the runner and removes the temporary files', async () => {
  const dir = fixtureProject('compare-vitest', vitestLinks());
  let child = null;
  try {
    // A test that waits, so the run is still going when the signal arrives.
    write(
      path.join(dir, 'slow.spec.js'),
      "import { test } from 'vitest';\ntest('waits', () => new Promise((r) => setTimeout(r, 20000)), 30000);\n",
    );
    child = spawn(process.execPath, [cli, 'compare', '--correctness'], { cwd: dir, stdio: 'ignore' });
    const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
    const pending = path.join(dir, '.warpdom-compare', 'pending.json');
    // compare removes pending.json while its list is empty; a half-written
    // list would be a bug (it is replaced by a rename), so only ENOENT is ok.
    const recorded = () => {
      try {
        return JSON.parse(fs.readFileSync(pending, 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
      }
    };
    const deadline = Date.now() + 20000;
    // Wait until the baseline run is going: both wrappers and the copy exist.
    while (
      Date.now() < deadline &&
      !(fs.existsSync(path.join(dir, '.warpdom-compare', 'logs', 'probe.log')) && recorded().length >= 3)
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 300));
    child.kill('SIGTERM');
    assert.equal(await exited, 143);
    assert.deepEqual(leftovers(dir), []);
    // The runner's workers are gone too: nothing appears afterwards.
    await new Promise((r) => setTimeout(r, 500));
    assert.deepEqual(leftovers(dir), []);
    assert.ok(!fs.existsSync(pending));
    assert.ok(!fs.existsSync(path.join(dir, '.warpdom-compare', 'run.lock')));
  } finally {
    // After a failed assertion the run may still be going.
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('compare end to end (Vitest projects): inline and file projects, node projects not compared', () => {
  const dir = fixtureProject('compare-vitest-projects', {
    ...vitestLinks(),
    'happy-dom': path.join(root, 'node_modules', 'happy-dom'),
  });
  try {
    const res = compareCli(dir, ['--correctness']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /warpdom compare: vitest \S+, 4 projects, baseline jsdom/);
    assert.match(
      res.stdout,
      /5 tests, 3 tests with the same status; 1 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/,
    );
    assert.match(res.stdout, /Not compared: 2 projects on node \(3 tests\), ran unchanged in both runs/);
    assert.doesNotMatch(res.stdout, /\b(dom|server|happy|plain)\b.*spec/, 'the summary names no files');
    const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.deepEqual(result.projects.map((p) => [p.name, p.environment, p.dom]).sort(), [
      ['dom', 'jsdom', true],
      ['happy', 'happy-dom', true],
      ['plain', 'node', false],
      ['server', 'node', false],
    ]);
    const envs = (run) => Object.fromEntries(run.projects.map((p) => [p.name, p.environment]));
    assert.deepEqual(envs(result.runs[0]), { dom: 'jsdom', server: 'node', happy: 'happy-dom', plain: 'node' });
    assert.deepEqual(
      envs(result.runs[1]),
      { dom: 'warpdom', server: 'node', happy: 'warpdom', plain: 'node' },
      'the project in its own config file is switched too',
    );
    const byProject = result.correctness.byProject;
    assert.deepEqual(
      [
        byProject.dom.compared,
        byProject.dom.regressions,
        byProject.dom.fixed,
        byProject.happy.same,
        byProject.server.notCompared,
        byProject.plain.notCompared,
      ],
      [4, 1, 1, 1, 2, 1],
    );
    assert.deepEqual(
      result.correctness.differences.map((d) => d.key).sort(),
      ['dom::dom/differ.spec.js::passes on jsdom only', 'dom::dom/differ.spec.js::passes on warpdom only'],
      'test keys carry the project',
    );
    const md = fs.readFileSync(path.join(dir, '.warpdom-compare', 'report.md'), 'utf8');
    const [summary, details] = md.split('## Details');
    assert.doesNotMatch(summary, /\| (dom|server|happy|plain) \|/, 'project names only in the details');
    assert.match(details, /\| server \| node \(not compared\) \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 2 \|/);
    assert.match(details, /- \[dom\] `dom\/differ\.spec\.js` › passes on jsdom only/);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare end to end (Vitest): from a package directory of a monorepo, the runner hoisted to the root', () => {
  const dir = fixtureProject('compare-vitest-projects', {
    ...vitestLinks(),
    'happy-dom': path.join(root, 'node_modules', 'happy-dom'),
  });
  try {
    const pkg = path.join(dir, 'packages', 'happy');
    const res = compareCli(pkg, ['--correctness']);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /baseline happy-dom/);
    assert.match(res.stdout, /1 test, all with the same status on happy-dom and warpdom/);
    const result = JSON.parse(fs.readFileSync(path.join(pkg, '.warpdom-compare', 'results.json'), 'utf8'));
    assert.deepEqual(
      result.runs.map((r) => r.projects[0].environment),
      ['happy-dom', 'warpdom'],
    );
    assert.deepEqual(leftovers(dir), [], 'the copy went into the root node_modules and is gone');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Vitest 2 and 3 read workspace files (removed in 4): this runs when
// WARPDOM_COMPARE_VITEST_LEGACY names a node_modules with vitest 2 or 3.
const legacyModules = process.env.WARPDOM_COMPARE_VITEST_LEGACY;
test(
  'compare end to end (Vitest workspace file, no root config)',
  { skip: !legacyModules && 'set WARPDOM_COMPARE_VITEST_LEGACY to a node_modules with vitest 2 or 3' },
  () => {
    const dir = fixtureProject('compare-vitest-workspace', {
      vitest: fs.realpathSync(path.join(legacyModules, 'vitest')),
      jsdom: fs.existsSync(path.join(legacyModules, 'jsdom'))
        ? fs.realpathSync(path.join(legacyModules, 'jsdom'))
        : path.join(root, 'node_modules', 'jsdom'),
      '.bin/vitest': '../vitest/vitest.mjs',
    });
    try {
      const res = compareCli(dir, ['--correctness']);
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /warpdom compare: vitest [23]\.\S+, 3 projects/);
      assert.match(
        res.stdout,
        /5 tests, 3 tests with the same status; 1 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/,
      );
      assert.match(res.stdout, /Not compared: 1 project on node \(1 test\)/);
      const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
      const envs = (run) => Object.fromEntries(run.projects.map((p) => [p.name, p.environment]));
      assert.deepEqual(envs(result.runs[1]), { inline: 'warpdom', server: 'node', web: 'warpdom' });
      assert.deepEqual(leftovers(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

// Jest is not a dependency of warpdom: this runs when WARPDOM_COMPARE_JEST
// names a node_modules directory that has jest and jest-environment-jsdom.
const jestModules = process.env.WARPDOM_COMPARE_JEST;
test(
  'compare end to end (Jest)',
  { skip: !jestModules && 'set WARPDOM_COMPARE_JEST to a node_modules with jest' },
  () => {
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
      // The file pinned to jsdom with a comment is switched (a temporary
      // jest-environment-jest-environment-jsdom package during the warpdom run)
      // and compared: it passes on both.
      assert.match(res.stdout, /1 file pins jsdom with a comment; switched/);
      assert.doesNotMatch(res.stdout, /Not compared: 1 file/);
      const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
      assert.deepEqual(
        result.pinned.list.map((f) => [f.file, f.environment, f.switched]),
        [['pinned.spec.js', 'jsdom', true]],
      );
      assert.ok(
        !fs.existsSync(path.join(dir, 'node_modules', 'jest-environment-jest-environment-jsdom')),
        'temporary package removed',
      );
      assert.deepEqual(leftovers(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'compare end to end (Jest): tests whose name varies between runs',
  { skip: !jestModules && 'set WARPDOM_COMPARE_JEST to a node_modules with jest' },
  () => {
    const dir = fixtureProject('compare-jest-names', {
      jest: path.join(jestModules, 'jest'),
      'jest-environment-jsdom': path.join(jestModules, 'jest-environment-jsdom'),
      '.bin/jest': fs.realpathSync(path.join(jestModules, '.bin', 'jest')),
    });
    try {
      const res = compareCli(dir, ['--rounds', '2']);
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /4 tests, 3 tests with the same status; 1 pass on jsdom and fail on warpdom/);
      assert.match(res.stdout, /\(3 tests with a name that varies between runs, matched by position and compared/);
      assert.doesNotMatch(res.stdout, /flaky/);
      const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
      assert.equal(result.correctness.nameVaries.length, 3);
      assert.deepEqual(
        result.correctness.differences.map((d) => d.class),
        ['regression'],
      );
      assert.deepEqual(leftovers(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'compare end to end (Jest): the config the test script passes',
  { skip: !jestModules && 'set WARPDOM_COMPARE_JEST to a node_modules with jest' },
  () => {
    const dir = fixtureProject('compare-jest', {
      jest: path.join(jestModules, 'jest'),
      'jest-environment-jsdom': path.join(jestModules, 'jest-environment-jsdom'),
      '.bin/jest': fs.realpathSync(path.join(jestModules, '.bin', 'jest')),
    });
    try {
      // A name Jest would not find, and compare cannot tell the runner from.
      fs.renameSync(path.join(dir, 'jest.config.js'), path.join(dir, 'dom-tests.cjs'));
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ scripts: { test: 'cross-env NODE_OPTIONS=--no-warnings jest -c dom-tests.cjs' } }),
      );
      const res = compareCli(dir, ['--correctness']);
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stderr, /Config from the test script: dom-tests\.cjs/);
      assert.match(res.stdout, /1 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/);
      assert.deepEqual(leftovers(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'compare end to end (Jest projects): project directories by glob, inline projects',
  { skip: !jestModules && 'set WARPDOM_COMPARE_JEST to a node_modules with jest' },
  () => {
    const dir = fixtureProject('compare-jest-projects', {
      jest: path.join(jestModules, 'jest'),
      'jest-environment-jsdom': path.join(jestModules, 'jest-environment-jsdom'),
      '.bin/jest': fs.realpathSync(path.join(jestModules, '.bin', 'jest')),
    });
    try {
      const res = compareCli(dir, ['--correctness']);
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, /warpdom compare: jest \S+, 3 projects/);
      assert.match(
        res.stdout,
        /3 tests, 1 test with the same status; 1 pass on jsdom and fail on warpdom, 1 fail on jsdom and pass on warpdom/,
      );
      assert.match(res.stdout, /Not compared: 1 project on node \(1 test\), ran unchanged in both runs/);
      const result = JSON.parse(fs.readFileSync(path.join(dir, '.warpdom-compare', 'results.json'), 'utf8'));
      const envs = (run) => Object.fromEntries(run.projects.map((p) => [p.name, p.environment]));
      assert.deepEqual(envs(result.runs[0]), { web: 'jsdom', inline: 'jsdom', server: 'node' });
      assert.deepEqual(envs(result.runs[1]), { web: 'warpdom', inline: 'warpdom', server: 'node' });
      assert.ok(result.correctness.differences.every((d) => d.key.startsWith('web::')));
      assert.deepEqual(leftovers(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('compare --fast-frames: warpdom runs get the fastFrames option, baselines do not', async () => {
  assert.equal(parseArgs(['--fast-frames']).fastFrames, true);
  assert.equal(parseArgs([]).fastFrames, undefined);
  const dir = tmp('fast-frames');
  try {
    write(
      path.join(dir, 'vitest.config.mjs'),
      `export default ${JSON.stringify({ test: { environment: 'jsdom', environmentOptions: { jsdom: { url: 'http://x/' }, warpdom: { jsdom: 26 } }, projects: [{ test: { name: 'p', environment: 'jsdom' } }, { test: { name: 'n', environment: 'node' } }] } })};`,
    );
    const load = async (name, opts) => {
      const wrapper = write(
        path.join(dir, `${name}.warpdom-compare.mjs`),
        vitestWrapper(path.join(dir, 'vitest.config.mjs'), opts),
      );
      return (await import(pathToFileURL(wrapper).href)).default({ mode: 'test' });
    };
    const fast = await load('fast', { environment: '/w/vitest.js', warpdomOptions: { fastFrames: true } });
    assert.deepEqual(
      fast.test.environmentOptions,
      { jsdom: { url: 'http://x/' }, warpdom: { jsdom: 26, fastFrames: true } },
      'merged, project options kept',
    );
    assert.deepEqual(
      fast.test.projects[0].test.environmentOptions,
      { warpdom: { fastFrames: true } },
      'switched inline project',
    );
    assert.equal(fast.test.projects[1].test.environmentOptions, undefined, 'node project untouched');
    const plain = await load('plain', { environment: '/w/vitest.js' });
    assert.deepEqual(plain.test.environmentOptions, { jsdom: { url: 'http://x/' }, warpdom: { jsdom: 26 } });

    write(
      path.join(dir, 'jest.config.cjs'),
      `module.exports = ${JSON.stringify({ testEnvironment: 'jsdom', testEnvironmentOptions: { url: 'http://y/' } })};`,
    );
    const jw = write(
      path.join(dir, 'jest.warpdom-compare.cjs'),
      jestWrapper(path.join(dir, 'jest.config.cjs'), {
        environment: '/w/jest.js',
        warpdomOptions: { fastFrames: true },
      }),
    );
    const jcfg = await (await import(pathToFileURL(jw).href)).default();
    assert.equal(jcfg.testEnvironment, '/w/jest.js');
    assert.deepEqual(jcfg.testEnvironmentOptions, { url: 'http://y/', fastFrames: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compare: browser-mode projects are not run (function projects and project files get no files)', async () => {
  const dir = tmp('vitest-browser');
  try {
    write(
      path.join(dir, 'b.config.mjs'),
      `export default { test: { environment: 'jsdom', projects: [
      () => ({ test: { name: 'fn-browser', browser: { enabled: true, instances: [] } } }),
      { test: { name: 'inline-browser', browser: { enabled: true } } },
      { test: { name: 'dom', environment: 'jsdom' } },
    ] } };`,
    );
    const wrapper = write(
      path.join(dir, 'b.warpdom-compare.mjs'),
      vitestWrapper(path.join(dir, 'b.config.mjs'), { environment: '/w/vitest.js' }),
    );
    const cfg = await (await import(pathToFileURL(wrapper).href)).default({});
    assert.equal(cfg.test.projects.length, 2);
    const fnProject = await cfg.test.projects[0]({});
    assert.equal(fnProject.test.browser.enabled, false);
    assert.deepEqual(fnProject.test.include, ['**/__warpdom_compare_browser_mode_not_run__']);
    assert.equal(cfg.test.projects[1].test.environment, '/w/vitest.js');
    write(
      path.join(dir, 'file.config.mjs'),
      'export default { test: { name: "file-browser", browser: { enabled: true } } };',
    );
    const fileWrapper = write(
      path.join(dir, 'file.warpdom-compare.mjs'),
      vitestWrapper(path.join(dir, 'file.config.mjs'), { environment: '/w/vitest.js' }),
    );
    const fileCfg = await (await import(pathToFileURL(fileWrapper).href)).default({});
    assert.equal(fileCfg.test.browser.enabled, false);
    assert.deepEqual(fileCfg.test.include, ['**/__warpdom_compare_browser_mode_not_run__']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const report = renderConsole(
    sampleResult({
      projects: [
        ...sampleResult().projects,
        { name: 'browser (chromium)', environment: 'jsdom', browser: true, dom: false, notRun: true },
      ],
    }),
  );
  assert.match(report, /Not run: 1 project in browser mode \(left out of both runs\)/);
});

test('compare: node flags from the test script, paths in messages', () => {
  const dir = tmp('node-flags');
  try {
    const flags = (script, runner = 'jest') => {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: script } }));
      return scriptNodeFlags(dir, runner);
    };
    assert.deepEqual(
      flags('node --experimental-vm-modules --no-warnings=ExperimentalWarning ./node_modules/jest/bin/jest.js'),
      ['--experimental-vm-modules', '--no-warnings=ExperimentalWarning'],
    );
    assert.deepEqual(flags('NODE_OPTIONS=--experimental-vm-modules jest'), ['--experimental-vm-modules']);
    assert.deepEqual(flags('cross-env NODE_OPTIONS="--max-old-space-size=4096 --inspect" jest --ci'), [
      '--max-old-space-size=4096',
    ]);
    assert.deepEqual(flags('pnpm build && node --expose-gc node_modules/.bin/jest'), ['--expose-gc']);
    assert.deepEqual(flags('jest'), []);
    assert.deepEqual(flags('vitest run', 'vitest'), []);
    // The runner arguments that choose what runs: config and Vitest projects.
    const runnerArgs = (script, runner) => {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: script } }));
      return scriptRunnerArgs(dir, runner);
    };
    assert.deepEqual(
      runnerArgs('cross-env NODE_OPTIONS=--openssl-legacy-provider jest --config projects/hot-table/jest.config.js'),
      { runner: 'jest', config: 'projects/hot-table/jest.config.js', projects: [] },
    );
    assert.deepEqual(runnerArgs('jest -c "config/jest unit.js" --ci', 'jest'), {
      runner: 'jest',
      config: 'config/jest unit.js',
      projects: [],
    });
    assert.deepEqual(runnerArgs('node --expose-gc node_modules/jest/bin/jest.js --config=jest.dom.js'), {
      runner: 'jest',
      config: 'jest.dom.js',
      projects: [],
    });
    assert.deepEqual(runnerArgs('jest --selectProjects a'), { runner: 'jest', config: null, projects: [] });
    assert.deepEqual(runnerArgs('pnpm build && vitest run -c vitest.unit.ts --project dom --project=components'), {
      runner: 'vitest',
      config: 'vitest.unit.ts',
      projects: ['dom', 'components'],
    });
    assert.deepEqual(runnerArgs('vitest --config ./vite.test.mts && jest -c j.js'), {
      runner: 'vitest',
      config: './vite.test.mts',
      projects: [],
    });
    assert.deepEqual(runnerArgs('vitest --config ./vite.test.mts && jest -c j.js', 'jest'), {
      runner: 'jest',
      config: 'j.js',
      projects: [],
    });
    assert.equal(runnerArgs('tsc -p .', null), null);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    assert.equal(scriptRunnerArgs(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(
    displayPath('/p/proj/.warpdom-compare/logs/1.log', '/p/proj'),
    path.join('.warpdom-compare', 'logs', '1.log'),
  );
  assert.equal(displayPath('/tmp/out/logs/1.log', '/p/proj'), '/tmp/out/logs/1.log');
});
