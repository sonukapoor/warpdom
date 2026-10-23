// `warpdom migrate` (src/migrate/): the scanner, the text edits, the
// lockfile reader and the whole command on the fixture projects in
// test/fixtures/migrate/, each copied to a temporary directory first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';
import { analyze, tokenize, leadingComments, moduleSpecifiers, typeOnlyReference } from '../src/migrate/js.js';
import { editDependencies, editCatalog, catalogEntries, applyEdits } from '../src/migrate/edits.js';
import {
  yamlTopLevel,
  releaseAgeSettings,
  excludedBy,
  packageManager,
  workspaces,
  walk,
  parseGitignore,
  gitignoreMatcher,
} from '../src/migrate/project.js';
import { chains, nodeModulesTree } from '../src/migrate/transitive.js';
import { parseLockfile, resolvedVersion, dependencyVersion, dependents } from '../src/migrate/lockfile.js';
import {
  migrate,
  renderConsole,
  renderMarkdown,
  ENVIRONMENT_PACKAGE_VERSION,
  cssstyleChangesProfile,
} from '../src/migrate/index.js';
import { parseArgs, main, HELP } from '../src/migrate/cli.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtures = path.join(root, 'test', 'fixtures', 'migrate');
const NOW = Date.parse('2026-10-17T12:00:00Z');

// A fixture project in a temporary directory.
function project(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `warpdom-migrate-${name}-`));
  fs.cpSync(path.join(fixtures, name), dir, { recursive: true });
  return dir;
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const readJson = (dir, file) => JSON.parse(read(dir, file));
// Every file of a directory and its contents (to prove nothing changed).
function snapshot(dir) {
  const out = {};
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) visit(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs, 'utf8');
    }
  };
  visit(dir);
  return out;
}
// The output folder of migrate (.warpdom-migrate/) left out.
const withoutOutput = (snap) =>
  Object.fromEntries(Object.entries(snap).filter(([k]) => !k.startsWith('.warpdom-migrate/')));
const run = (dir, options = {}) => migrate({ cwd: dir, offline: true, now: NOW, ...options });
const withProject = async (name, fn) => {
  const dir = project(name);
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// --- scanner -----------------------------------------------------------------

test('migrate scanner: properties carry their key path; strings know where they sit', () => {
  const a = analyze(`import { defineConfig } from 'vitest/config';
const re = /a\\/b'/g; // 'jsdom' in a comment
export default defineConfig((env) => {
  const x = 'jsdom';
  return {
    test: {
      environment: jsdom ? 'jsdom' : 'node',
      environmentMatchGlobs: [['**/*.dom.ts', 'happy-dom']],
      projects: [{ test: { name: \`unit\`, environment: 'jsdom' } }],
      ...base,
      env,
    },
  };
});`);
  const paths = a.properties.map((p) => p.path.join('.'));
  assert.ok(paths.includes('test.environment'));
  assert.ok(paths.includes('test.projects.[].test.environment'));
  assert.ok(paths.includes('test.env'), 'shorthand property');
  const siteOf = (value) => [...a.sites].filter(([k]) => a.tokens[k].value === value).map(([, s]) => s);
  const jsdom = siteOf('jsdom');
  assert.equal(jsdom[0].type, 'other', "const x = 'jsdom' is no property value");
  assert.equal(jsdom[1].prop.path.join('.'), 'test.environment');
  assert.equal(jsdom[2].prop.path.join('.'), 'test.projects.[].test.environment');
  const happy = siteOf('happy-dom')[0];
  assert.deepEqual([happy.type, happy.path.join('.'), happy.index], ['element', 'test.environmentMatchGlobs.[]', 1]);
  assert.equal(a.tokens[a.spreads[0].token].value, 'base');
  const ws = analyze("export default ['packages/*', { test: { environment: 'jsdom' } }];");
  const wsSite = [...ws.sites].find(([k]) => ws.tokens[k].value === 'packages/*')[1];
  assert.deepEqual([wsSite.type, wsSite.index], ['element', 0], 'export default [ is an array, not an index');
  const ts = analyze("const config: Config = { testEnvironment: 'jsdom' as const };\nexport default config;");
  assert.equal([...ts.sites].find(([k]) => ts.tokens[k].value === 'jsdom')[1].prop.key, 'testEnvironment');
  assert.equal(tokenize("a = 'x' // 'jsdom'").tokens.length, 3, 'comments are not tokens');
  assert.equal(tokenize('x = `a${"}"}b` + 1').tokens.length, 5, 'template with an expression is one token');
});

test('migrate scanner: leading comments, module specifiers', () => {
  const text =
    "#!/usr/bin/env node\n'use strict';\n/** @jest-environment jsdom */\nimport x from 'jsdom';\n// later comment\nconst y = require('global-jsdom/register');\nvi.mock('happy-dom');\n";
  assert.deepEqual(
    leadingComments(text).map((c) => c.text),
    ['/** @jest-environment jsdom */'],
  );
  assert.deepEqual(
    moduleSpecifiers(tokenize(text).tokens).map((s) => s.value),
    ['jsdom', 'global-jsdom/register', 'happy-dom'],
  );
});

// --- edits -------------------------------------------------------------------

test('migrate edits: package.json dependencies keep their formatting and order', () => {
  const pkg =
    '{\n  "name": "x",\n  "devDependencies": {\n    "jsdom": "^26.0.0",\n    "react": "^19.0.0",\n    "vitest": "^3.0.0"\n  },\n  "engines": {}\n}\n';
  const out = editDependencies(pkg, 'devDependencies', {
    remove: ['jsdom'],
    add: [
      { name: 'warpdom', spec: '^0.1.3' },
      { name: 'vitest-environment-warpdom', spec: '^0.1.0' },
    ],
  });
  assert.equal(
    out,
    '{\n  "name": "x",\n  "devDependencies": {\n    "react": "^19.0.0",\n    "vitest": "^3.0.0",\n    "vitest-environment-warpdom": "^0.1.0",\n    "warpdom": "^0.1.3"\n  },\n  "engines": {}\n}\n',
  );
  assert.equal(
    editDependencies(out, 'devDependencies', { add: [{ name: 'warpdom', spec: '^0.1.3' }] }),
    out,
    'present: unchanged',
  );
  const unsorted = '{\n\t"devDependencies": {\n\t\t"z": "1.0.0",\n\t\t"jsdom": "1.0.0"\n\t}\n}';
  assert.equal(
    editDependencies(unsorted, 'devDependencies', { remove: ['jsdom'], add: [{ name: 'warpdom', spec: '0.1.3' }] }),
    '{\n\t"devDependencies": {\n\t\t"z": "1.0.0",\n\t\t"warpdom": "0.1.3"\n\t}\n}',
    'unsorted: appended, tabs kept, last comma handled',
  );
  assert.equal(
    editDependencies('{\n  "name": "x"\n}\n', 'devDependencies', { add: [{ name: 'warpdom', spec: '^0.1.3' }] }),
    '{\n  "name": "x",\n  "devDependencies": {\n    "warpdom": "^0.1.3"\n  }\n}\n',
    'missing section added',
  );
  assert.equal(
    editDependencies('{"devDependencies": {"jsdom": "1"}}', 'devDependencies', { remove: ['jsdom'] }),
    null,
    'one-line sections are left to the user',
  );
  assert.equal(
    editDependencies('{\n  "devDependencies": {\n    "jsdom": "1"\n  }\n}', 'devDependencies', { remove: ['jsdom'] }),
    '{\n  "devDependencies": {}\n}',
  );
});

test('migrate edits: pnpm catalogs', () => {
  const yaml =
    "packages:\n  - 'packages/*'\ncatalog:\n  # Testing\n  jsdom: '^27.2.0'\n  '@testing-library/vue': '^8.1.0'\ncatalogs:\n  react18:\n    react: ^18.0.0\n";
  assert.deepEqual(
    catalogEntries(yaml).entries.map((e) => e.name),
    ['jsdom', '@testing-library/vue'],
  );
  assert.deepEqual(
    catalogEntries(yaml, 'react18').entries.map((e) => e.name),
    ['react'],
  );
  assert.equal(catalogEntries(yaml, 'nope'), null);
  assert.equal(
    editCatalog(yaml, 'default', {
      remove: ['jsdom'],
      add: [
        { name: 'warpdom', spec: '^0.1.3' },
        { name: 'vitest-environment-warpdom', spec: '^0.1.0' },
      ],
    }),
    "packages:\n  - 'packages/*'\ncatalog:\n  # Testing\n  '@testing-library/vue': '^8.1.0'\n  warpdom: '^0.1.3'\n  vitest-environment-warpdom: '^0.1.0'\ncatalogs:\n  react18:\n    react: ^18.0.0\n",
    'next to the testing group',
  );
  const plain = 'catalog:\n  react: ^19.0.0\n  jsdom: ^27.0.0\n  vite: ^7.0.0\n';
  assert.equal(
    editCatalog(plain, 'default', { remove: ['jsdom'], add: [{ name: 'warpdom', spec: '^0.1.3' }] }),
    'catalog:\n  react: ^19.0.0\n  warpdom: ^0.1.3\n  vite: ^7.0.0\n',
    'no group: where jsdom was, with its (lack of) quotes',
  );
  assert.throws(
    () =>
      applyEdits('abc', [
        { start: 0, end: 2, text: 'x' },
        { start: 1, end: 3, text: 'y' },
      ]),
    /overlapping/,
  );
});

// --- project, lockfiles ----------------------------------------------------------

test('migrate project: YAML keys, release-age settings, exclusions, package manager', () => {
  assert.deepEqual(yamlTopLevel("packages:\n  - 'a/*'\n  - b # c\nminimumReleaseAge: 4320\nx: [a, 'b']\n"), {
    packages: ['a/*', 'b'],
    minimumReleaseAge: '4320',
    x: ['a', 'b'],
  });
  assert.ok(excludedBy(['@mui/*'], '@mui/material'));
  assert.ok(excludedBy(['warpdom@0.1.3'], 'warpdom'));
  assert.ok(!excludedBy(['warp'], 'warpdom'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-age-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      'minimumReleaseAge: 4320\nminimumReleaseAgeExclude:\n  - warpdom\n',
    );
    fs.writeFileSync(path.join(dir, '.npmrc'), 'min-release-age=2\n');
    fs.writeFileSync(path.join(dir, '.yarnrc.yml'), 'npmMinimalAgeGate: 3d\n');
    fs.writeFileSync(path.join(dir, 'bunfig.toml'), '[install]\nminimumReleaseAge = 86400\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"packageManager": "pnpm@10.1.0+sha512.abc"}');
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    const settings = releaseAgeSettings(dir);
    assert.deepEqual(
      settings.map((s) => [s.manager, s.minutes]),
      [
        ['pnpm', 4320],
        ['npm', 2880],
        ['yarn', 4320],
        ['bun', 1440],
      ],
    );
    assert.deepEqual(settings[0].exclude, ['warpdom']);
    assert.deepEqual(packageManager(dir), {
      name: 'pnpm',
      version: '10.1.0',
      source: 'packageManager field',
      lockfile: null,
      lockfiles: ['yarn.lock'],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate lockfiles: pnpm, npm and yarn versions and dependents', () => {
  const pnpm = parseLockfile(path.join(fixtures, 'monorepo'), 'pnpm-lock.yaml');
  assert.equal(resolvedVersion(pnpm, '', 'jsdom'), '26.1.0');
  assert.equal(resolvedVersion(pnpm, 'packages/legacy', 'jest-environment-jsdom'), '29.7.0');
  assert.equal(dependencyVersion(pnpm, 'jest-environment-jsdom', '29.7.0', 'jsdom'), '20.0.3');
  assert.deepEqual([...dependents(pnpm, ['jsdom']).get('jsdom')], ['jest-environment-jsdom@29.7.0']);
  const pnpmCatalog = parseLockfile(path.join(fixtures, 'vitest-projects'), 'pnpm-lock.yaml');
  assert.equal(resolvedVersion(pnpmCatalog, '', 'vitest'), '4.0.3', 'peer suffix dropped');
  const npm = parseLockfile(path.join(fixtures, 'jest-config'), 'package-lock.json');
  assert.equal(resolvedVersion(npm, '', 'jest-environment-jsdom'), '29.7.0');
  assert.deepEqual([...dependents(npm, ['jsdom']).get('jsdom')], ['jest-environment-jsdom@29.7.0']);
  const yarn = parseLockfile(path.join(fixtures, 'vitest-workspace'), 'yarn.lock');
  assert.equal(resolvedVersion(yarn, '', 'jsdom', '^25.0.0'), '25.0.1');
  assert.deepEqual(parseLockfile(fixtures, null).entries, []);
});

test("migrate: the companion packages' version matches packages/*/package.json", () => {
  for (const name of ['vitest-environment-warpdom', 'jest-environment-warpdom']) {
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8')).version,
      ENVIRONMENT_PACKAGE_VERSION,
    );
  }
});

// --- fixture projects ------------------------------------------------------------

test('migrate: Vitest with one config (npm)', () =>
  withProject('vitest-single', async (dir) => {
    const r = await run(dir, { apply: true });
    assert.equal(r.error, null);
    assert.equal(r.packageManager.name, 'npm');
    assert.deepEqual(
      r.runners.map((x) => [x.name, x.version]),
      [['vitest', '3.2.4']],
    );
    assert.deepEqual(
      r.edits.map((e) => [e.file, e.line, e.from, e.to]),
      [
        ['vitest.config.ts', 7, 'jsdom', 'warpdom'],
        ['vitest.config.ts', 8, null, '26.1.0'],
      ],
    );
    assert.match(
      read(dir, 'vitest.config.ts'),
      /\/\/ jsdom for the component tests\n {4}environment: "warpdom",\n {4}environmentOptions: \{ warpdom: \{ jsdom: "26\.1\.0" \} \},\n {4}setupFiles/,
      'quotes and comments kept; jsdom 26.1.0 pinned by default',
    );
    assert.deepEqual(readJson(dir, 'package.json').devDependencies, {
      '@testing-library/react': '^16.0.0',
      vitest: '^3.2.4',
      'vitest-environment-warpdom': `^${ENVIRONMENT_PACKAGE_VERSION}`,
      warpdom: `^${r.versions.warpdom}`,
    });
    assert.equal(r.install, 'npm install');
    assert.ok(
      r.mentions.some((m) => m.file === 'test/setup.ts' && m.category === 'setup'),
      'setup file reported',
    );
    assert.match(
      r.profile.join('\n'),
      /vitest.config.ts:8: pinned jsdom 26\.1\.0 \(environmentOptions\.warpdom\.jsdom\), because warpdom follows the installed jsdom/,
    );
    assert.ok(fs.existsSync(path.join(dir, '.warpdom-migrate', 'plan.md')));
  }));

test('migrate: dry run changes nothing and writes the plan', () =>
  withProject('monorepo', async (dir) => {
    const before = snapshot(dir);
    const r = await run(dir);
    assert.equal(r.mode, 'dry-run');
    assert.ok(r.edits.length > 0 && r.changedFiles.length > 0, 'there is something to change');
    const after = snapshot(dir);
    const plan = after['.warpdom-migrate/plan.md'];
    assert.deepEqual(withoutOutput(after), before);
    assert.match(after['.warpdom-migrate/.gitignore'], /^\*$/m, 'the output folder ignores itself');
    assert.match(plan, /Dry run: nothing was changed/);
    assert.match(plan, /npx warpdom compare/);
  }));

test('migrate: idempotent, a second --apply changes nothing', async () => {
  for (const name of fs.readdirSync(fixtures)) {
    await withProject(name, async (dir) => {
      await run(dir, { apply: true });
      const once = snapshot(dir);
      const r = await run(dir, { apply: true });
      assert.deepEqual(r.changedFiles, [], `${name}: nothing left to change`);
      assert.deepEqual(r.edits, [], name);
      const twice = snapshot(dir);
      assert.deepEqual(withoutOutput(twice), withoutOutput(once), name);
    });
  }
});

test('migrate: Vitest projects array, environmentMatchGlobs, pnpm catalog and minimumReleaseAge', () =>
  withProject('vitest-projects', async (dir) => {
    const registry = {
      warpdom: { version: VERSION, time: '2026-10-16T11:39:26.020Z' },
      'vitest-environment-warpdom': { version: '0.1.0', time: '2026-10-14T21:54:07.630Z' },
    };
    const r = await run(dir, { apply: true, registry, offline: false, now: Date.parse('2026-10-17T10:00:00Z') });
    assert.deepEqual(
      r.edits.map((e) => [e.line, e.kind, e.from]),
      [
        [6, 'environmentMatchGlobs', 'happy-dom'],
        [12, 'environment', 'jsdom'],
        [13, 'environmentOptions', null],
      ],
    );
    const config = read(dir, 'vitest.config.mts');
    assert.match(config, /\['\*\*\/\*\.dom\.test\.ts', 'warpdom'\]/);
    assert.match(config, /name: 'node', environment: 'node'/, 'node project unchanged');
    assert.deepEqual(readJson(dir, 'package.json').devDependencies, {
      vitest: 'catalog:',
      'vitest-environment-warpdom': 'catalog:',
      warpdom: 'catalog:',
    });
    assert.equal(
      read(dir, 'pnpm-workspace.yaml'),
      `packages:\n  - '.'\nminimumReleaseAge: 1440\ncatalog:\n  warpdom: '^${VERSION}'\n  vitest-environment-warpdom: '^0.1.0'\n  vitest: '^4.0.0'\n`,
    );
    const ages = Object.fromEntries(r.releaseAge.map((a) => [a.name, a]));
    assert.equal(ages.warpdom.status, 'too-new');
    assert.equal(ages.warpdom.okAt, '2026-10-17T11:39:26.020Z');
    assert.equal(ages['vitest-environment-warpdom'].status, 'ok');
    assert.match(
      r.warnings.join('\n'),
      new RegExp(`warpdom ${VERSION.replaceAll('.', '\\.')} is younger than minimumReleaseAge`),
    );
    assert.match(r.profile.join('\n'), /ran on happy-dom/);
  }));

test('migrate: vitest.workspace file and a project config (yarn, npmMinimalAgeGate)', () =>
  withProject('vitest-workspace', async (dir) => {
    const r = await run(dir, { apply: true });
    assert.equal(r.packageManager.name, 'yarn');
    assert.deepEqual(
      r.edits.map((e) => [e.file, e.from]),
      [
        ['packages/ui/vitest.config.ts', 'jsdom'],
        ['packages/ui/vitest.config.ts', null],
        ['vitest.workspace.ts', 'happy-dom'],
        ['vitest.workspace.ts', null],
      ],
    );
    assert.match(read(dir, 'vitest.workspace.ts'), /name: 'inline',\n {6}environment: 'warpdom',/);
    assert.equal(r.install, 'yarn install');
    assert.deepEqual(
      r.releaseAge.map((a) => [a.manager, a.setting, a.status]),
      [
        ['yarn', 'npmMinimalAgeGate', 'unknown'],
        ['yarn', 'npmMinimalAgeGate', 'unknown'],
      ],
    );
    assert.match(r.profile.join('\n'), /pinned jsdom 25\.0\.1/);
  }));

test('migrate: Jest config file', () =>
  withProject('jest-config', async (dir) => {
    const r = await run(dir, { apply: true });
    assert.equal(
      read(dir, 'jest.config.js'),
      "/** @type {import('jest').Config} */\nmodule.exports = {\n  testEnvironment: 'warpdom',\n  testEnvironmentOptions: { jsdom: '20.0.3' },\n  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],\n};\n",
    );
    assert.deepEqual(readJson(dir, 'package.json').devDependencies, {
      jest: '^29.7.0',
      'jest-environment-warpdom': `^${ENVIRONMENT_PACKAGE_VERSION}`,
      warpdom: `^${r.versions.warpdom}`,
    });
    const filter = r.mentions.find((m) => m.file === 'jest.setup.cjs');
    assert.equal(filter.category, 'console');
    assert.match(r.profile.join('\n'), /jest.config.js:4: pinned jsdom 20\.0\.3 \(testEnvironmentOptions\.jsdom\)/);
  }));

test('migrate: package.json "jest" field, --env script flag, Jest 27', () =>
  withProject('jest-package-json', async (dir) => {
    const before = read(dir, 'package.json');
    const r = await run(dir, { apply: true });
    const text = read(dir, 'package.json');
    assert.equal(
      text,
      before
        .replace('"jest --env=jsdom"', '"jest --env=warpdom"')
        .replace('"testEnvironment": "jsdom"', '"testEnvironment": "warpdom"')
        .replace('"testEnvironmentOptions": {\n', '"testEnvironmentOptions": {\n      "jsdom": "16",\n')
        .replace(
          '    "jest-environment-jsdom": "^27.5.1"\n',
          `    "jest-environment-warpdom": "^${ENVIRONMENT_PACKAGE_VERSION}",\n    "warpdom": "^${r.versions.warpdom}"\n`,
        ),
    );
    assert.match(r.transitive.join('\n'), /Jest 27's jest-config and jest-runner depend on jest-environment-jsdom/);
    assert.ok(r.mentions.some((m) => /pretendToBeVisual: a jsdom option warpdom does not read/.test(m.hint)));
  }));

test('migrate: @vitest-environment and @jest-environment comments', async () => {
  await withProject('docblocks-vitest', async (dir) => {
    const r = await run(dir, { apply: true });
    assert.deepEqual(
      r.edits.map((e) => [e.file, e.kind, e.from]),
      [
        ['src/a.test.ts', '@vitest-environment comment', 'happy-dom'],
        ['src/b.test.tsx', '@jest-environment comment', 'jsdom'],
      ],
    );
    assert.ok(read(dir, 'src/a.test.ts').startsWith('// @vitest-environment warpdom\n'));
    assert.ok(read(dir, 'src/b.test.tsx').startsWith('/**\n * @jest-environment warpdom\n */\n'));
    assert.match(
      read(dir, 'src/c.test.ts'),
      /@vitest-environment jsdom \(inside the code/,
      'a comment after code is no docblock',
    );
    assert.ok(readJson(dir, 'package.json').devDependencies['vitest-environment-warpdom']);
  });
  await withProject('docblocks-jest', async (dir) => {
    await run(dir, { apply: true });
    assert.match(read(dir, 'src/widget.test.ts'), /@jest-environment warpdom\n \* @jest-environment-options \{"url"/);
    assert.ok(readJson(dir, 'package.json').devDependencies['jest-environment-warpdom']);
  });
});

test('migrate: --environment flags in package.json scripts', () =>
  withProject('scripts', async (dir) => {
    await run(dir, { apply: true });
    assert.deepEqual(readJson(dir, 'package.json').scripts, {
      test: 'vitest --environment warpdom',
      'test:happy': 'vitest run --environment=warpdom && echo done',
      'test:node': 'vitest --environment node',
    });
  }));

test('migrate: monorepo with packages, a root script that imports jsdom, and another project', () =>
  withProject('monorepo', async (dir) => {
    const r = await run(dir, { apply: true });
    assert.deepEqual(r.monorepo, {
      tool: 'pnpm workspaces',
      packages: ['packages/legacy', 'packages/server', 'packages/web'],
    });
    assert.deepEqual(
      r.dependencies.map((d) => [d.package, d.remove.map((x) => x.name), d.add.map((x) => x.name)]),
      [
        ['packages/legacy/package.json', ['jest-environment-jsdom'], ['warpdom', 'jest-environment-warpdom']],
        ['packages/web/package.json', ['jsdom'], ['warpdom', 'vitest-environment-warpdom']],
      ],
    );
    assert.deepEqual(
      r.kept.map((k) => [k.package, k.name]),
      [['package.json', 'jsdom']],
    );
    assert.match(r.kept[0].reason, /scripts\/render\.mjs:1/);
    assert.equal(readJson(dir, 'package.json').devDependencies.jsdom, '^26.1.0', 'root jsdom kept');
    assert.deepEqual(
      r.otherProjects.map((o) => o.dir),
      ['examples/app'],
    );
    assert.match(read(dir, 'examples/app/vite.config.ts'), /environment: 'jsdom'/, 'other projects are not changed');
    assert.match(read(dir, 'packages/server/vitest.config.ts'), /environment: 'node'/);
    assert.equal(r.install, 'pnpm install');
  }));

test('migrate: a computed or inherited environment lands in manual and keeps the packages', () =>
  withProject('dynamic', async (dir) => {
    const before = snapshot(dir);
    const r = await run(dir, { apply: true });
    assert.deepEqual(r.edits, []);
    assert.deepEqual(
      r.manual.map((m) => [m.file, m.line]),
      [
        ['jest.config.js', 4],
        ['vitest.config.ts', 10],
        ['vitest.config.ts', 11],
      ],
    );
    assert.match(r.manual[0].reason, /@acme\/jest-config/);
    assert.match(r.manual[1].reason, /pickEnvironment\(process\.env\)/);
    assert.match(r.manual[2].reason, /`env` = 'jsdom' \(line 4\), which is also used for other things/);
    assert.deepEqual(r.kept.map((k) => k.name).sort(), ['jest-environment-jsdom', 'jsdom']);
    assert.deepEqual(withoutOutput(snapshot(dir)), before, 'nothing changed');
    assert.match(renderConsole(r), /Manual \(3\)/);
  }));

test('migrate: presets, setup files and custom environments', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-presets-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  try {
    write(
      'package.json',
      '{\n  "name": "p",\n  "devDependencies": {\n    "jest": "^29.7.0",\n    "jest-environment-jsdom": "^29.7.0"\n  }\n}\n',
    );
    write(
      'jest.config.js',
      "module.exports = {\n  projects: [\n    { displayName: 'ng', preset: 'jest-preset-angular' },\n    { displayName: 'ts', preset: 'ts-jest' },\n    { displayName: 'dom', testEnvironment: './tools/dom-env.js' },\n  ],\n};\n",
    );
    write('jest.setup.js', "Object.assign(global, require('whatwg-fetch'));\n");
    write(
      'tools/dom-env.js',
      "const JSDOMEnvironment = require('jest-environment-jsdom').default;\nmodule.exports = class extends JSDOMEnvironment {};\n",
    );
    const r = await run(dir, { apply: true });
    assert.deepEqual(r.edits, []);
    assert.deepEqual(
      r.manual.map((m) => [m.file, m.line]),
      [['jest.config.js', 3]],
      'jest-preset-angular only: ts-jest chooses no DOM, a setup file inherits nothing',
    );
    assert.match(r.manual[0].reason, /preset 'jest-preset-angular'/);
    assert.deepEqual(
      r.kept.map((k) => k.name),
      ['jest-environment-jsdom'],
    );
    assert.match(r.kept[0].reason, /tools\/dom-env\.js:1|manual/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: the removed jsdom version is pinned by default, inside existing options too; --no-keep-jsdom-version opts out', async () => {
  await withProject('jest-package-json', async (dir) => {
    const before = read(dir, 'package.json');
    const r = await run(dir, { apply: true });
    assert.ok(
      read(dir, 'package.json').includes(
        '"testEnvironmentOptions": {\n      "jsdom": "16.7.0",\n      "url": "http://localhost/",',
      ) || /"jsdom": "16"/.test(read(dir, 'package.json')),
      'first property of the existing options',
    );
    assert.equal(readJson(dir, 'package.json').jest.testEnvironmentOptions.pretendToBeVisual, true);
    assert.match(r.profile.join('\n'), /pinned jsdom 16 \(testEnvironmentOptions\.jsdom\)/);
    assert.notEqual(read(dir, 'package.json'), before);
  });
  await withProject('vitest-single', async (dir) => {
    const r = await run(dir, { apply: true, keepJsdomVersion: false });
    assert.doesNotMatch(read(dir, 'vitest.config.ts'), /environmentOptions/);
    assert.match(
      r.profile.join('\n'),
      /add environmentOptions: \{ warpdom: \{ jsdom: '26\.1\.0' \} \} to the config \(--no-keep-jsdom-version left it out\)/,
    );
  });
  // The default version: nothing written.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-latest-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      '{\n  "devDependencies": {\n    "jsdom": "30.1.2",\n    "vitest": "^4.0.0"\n  }\n}\n',
    );
    fs.writeFileSync(
      path.join(dir, 'vitest.config.ts'),
      "export default { test: { environment: 'jsdom', environmentOptions: { warpdom: {} } } };\n",
    );
    const r = await run(dir, { apply: true });
    assert.equal(
      read(dir, 'vitest.config.ts'),
      "export default { test: { environment: 'warpdom', environmentOptions: { warpdom: {} } } };\n",
    );
    assert.deepEqual(r.profile, []);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      '{\n  "devDependencies": {\n    "jsdom": "27.0.1",\n    "vitest": "^4.0.0"\n  }\n}\n',
    );
    fs.writeFileSync(
      path.join(dir, 'vitest.config.ts'),
      "export default { test: { environment: 'jsdom', environmentOptions: { warpdom: {} } } };\n",
    );
    await run(dir, { apply: true });
    assert.equal(
      read(dir, 'vitest.config.ts'),
      "export default { test: { environment: 'warpdom', environmentOptions: { warpdom: { jsdom: '27.0.1' } } } };\n",
      'into an existing warpdom options object',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: warns on a dirty git tree, errors without package.json', async () => {
  await withProject('vitest-single', async (dir) => {
    const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (git('init', '-q').status !== 0) return;
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
    assert.deepEqual(
      (await run(dir)).warnings.filter((w) => /uncommitted/.test(w)),
      [],
    );
    fs.appendFileSync(path.join(dir, 'src', 'button.test.tsx'), '\n');
    assert.match((await run(dir)).warnings.join('\n'), /1 uncommitted change/);
  });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-empty-'));
  try {
    const r = await run(empty);
    assert.match(r.error, /no package\.json/);
    assert.match(renderMarkdown(r), /Error: no package\.json/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

// --- CLI ---------------------------------------------------------------------------

test('migrate CLI: options, --json, help, exit codes', async () => {
  assert.deepEqual(parseArgs(['--dry-run', '--force', '--json', '--offline', '--keep-jsdom-version']), {
    dryRun: true,
    force: true,
    json: true,
    offline: true,
    keepJsdomVersion: true,
  });
  assert.throws(() => parseArgs(['--apply']), /unknown option --apply/, 'applying is the default; there is no --apply');
  assert.deepEqual(parseArgs(['--no-keep-jsdom-version']), { keepJsdomVersion: false });
  assert.throws(() => parseArgs(['--nope']), /unknown option --nope/);
  const sink = () => {
    let s = '';
    return {
      write: (x) => {
        s += x;
      },
      get text() {
        return s;
      },
    };
  };
  let out = sink();
  assert.equal(await main(['--help'], { stdout: out }), 0);
  assert.equal(out.text, HELP);
  const err = sink();
  assert.equal(await main(['--bogus'], { stderr: err }), 2);
  await withProject('jest-config', async (dir) => {
    out = sink();
    assert.equal(await main(['--dry-run', '--json', '--offline'], { stdout: out, cwd: dir }), 0);
    const plan = JSON.parse(out.text);
    assert.equal(plan.mode, 'dry-run');
    assert.equal(plan.edits[0].file, 'jest.config.js');
    assert.match(read(dir, 'jest.config.js'), /testEnvironment: 'jsdom'/, 'dry run');
    out = sink();
    assert.equal(await main(['--dry-run', '--offline'], { stdout: out, cwd: dir }), 0);
    assert.match(
      out.text,
      /Would change the test environment \(2\):\n {2}jest\.config\.js:3 {2}testEnvironment: jsdom -> warpdom\n {2}jest\.config\.js:4 {2}added testEnvironmentOptions: \{ jsdom: '20\.0\.3' \},\n/,
    );
    assert.match(out.text, /npx warpdom compare/);
  });
  // Without --dry-run the changes are made.
  await withProject('jest-config', async (dir) => {
    out = sink();
    assert.equal(await main(['--offline'], { stdout: out, cwd: dir }), 0);
    assert.match(read(dir, 'jest.config.js'), /testEnvironment: 'warpdom'/);
  });
  // A git working tree with uncommitted changes stops it, unless --force.
  await withProject('jest-config', async (dir) => {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('add', '-A');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture');
    fs.appendFileSync(path.join(dir, 'package.json'), '\n');
    out = sink();
    assert.equal(await main(['--offline'], { stdout: out, cwd: dir }), 2);
    assert.match(out.text, /uncommitted change/);
    assert.match(read(dir, 'jest.config.js'), /testEnvironment: 'jsdom'/, 'nothing changed');
    out = sink();
    assert.equal(
      await main(['--dry-run', '--offline'], { stdout: out, cwd: dir }),
      0,
      '--dry-run works on a dirty tree',
    );
    out = sink();
    assert.equal(await main(['--force', '--offline'], { stdout: out, cwd: dir }), 0);
    assert.match(read(dir, 'jest.config.js'), /testEnvironment: 'warpdom'/);
  });
  const res = spawnSync(process.execPath, [path.join(root, 'bin', 'warpdom.js'), 'migrate', '--help'], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^warpdom migrate:/);
});

test('migrate: the plan lists everything in Markdown', () =>
  withProject('monorepo', async (dir) => {
    const r = await run(dir);
    const md = read(dir, '.warpdom-migrate/plan.md');
    assert.equal(md, renderMarkdown(r));
    assert.match(
      md,
      /\| packages\/web\/vite\.config\.ts:6 \| environment \| `environment: 'jsdom',` \| `environment: 'warpdom',` \|/,
    );
    assert.match(md, /## Other projects/);
    assert.match(md, /Install with `pnpm install`/);
  }));

test('migrate: workspaces are read from package.json too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-ws-'));
  try {
    fs.mkdirSync(path.join(dir, 'packages', 'a'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"workspaces": {"packages": ["packages/*"]}}');
    fs.writeFileSync(path.join(dir, 'packages', 'a', 'package.json'), '{}');
    assert.deepEqual(workspaces(dir), {
      tool: 'workspaces (package.json)',
      patterns: ['packages/*'],
      dirs: [dir, path.join(dir, 'packages', 'a')],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- the first real-world run (Ant Design, warpdom issue #39) ---------------------

// A file in a project directory (parents created).
const put = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const tempProject = async (files, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-tmp-'));
  try {
    for (const [rel, text] of Object.entries(files)) put(dir, rel, text);
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
// node_modules/<name>/package.json with the given fields.
const installed = (dir, rel, meta, extra = {}) => {
  put(dir, `node_modules/${rel}/package.json`, JSON.stringify({ name: rel.replace(/^.*node_modules\//, ''), ...meta }));
  for (const [file, text] of Object.entries(extra)) put(dir, `node_modules/${rel}/${file}`, text);
};
// The packages of the antd-like fixture's install that matter here.
function antdInstall(dir) {
  installed(dir, 'jsonml.js', { version: '0.1.0', dependencies: { jsdom: '^8.5.0' } });
  installed(dir, 'jsonml.js/node_modules/jsdom', { version: '8.5.0' });
  installed(dir, 'mark-twain', { version: '2.0.3', dependencies: { 'jsonml.js': '^0.1.0' } });
  installed(dir, 'jest-environment-jsdom', { version: '30.5.2', dependencies: { jsdom: '^26.1.0' } });
  installed(dir, 'jest-environment-jsdom/node_modules/jsdom', {
    version: '26.1.0',
    dependencies: { cssstyle: '^4.2.1' },
  });
  installed(dir, 'cssstyle', { version: '4.6.0' });
  installed(dir, 'jsdom', { version: '30.1.3', dependencies: { cssstyle: '^5.3.0', parse5: '^8.0.0' } });
  installed(dir, 'jsdom/node_modules/cssstyle', { version: '5.3.7' });
  installed(dir, 'parse5', { version: '8.0.0', dependencies: { entities: '^6.0.0' } });
  installed(dir, 'entities', { version: '6.0.0' });
  installed(dir, 'cheerio', { version: '1.0.0', dependencies: { parse5: '^8.0.0' } });
  installed(
    dir,
    'jest-puppeteer',
    { version: '11.0.0' },
    { 'jest-preset.json': '{"testEnvironment": "jest-environment-puppeteer"}' },
  );
  // A generated, git-ignored copy of package.json (.dumi/tmp in .gitignore).
  put(dir, '.dumi/tmp/appData.json', read(dir, 'package.json'));
}

test('migrate (#39): the Ant Design shapes, installed', () =>
  withProject('antd-like', async (dir) => {
    antdInstall(dir);
    const r = await run(dir);
    // 1. jest-puppeteer's preset sets a Node environment: no manual item, and
    // jest-environment-jsdom goes.
    assert.deepEqual(r.manual, []);
    assert.match(
      r.notes.join('\n'),
      /\.jest\.image\.js:7: preset 'jest-puppeteer' sets testEnvironment 'jest-environment-puppeteer' \(jest-puppeteer\/jest-preset\.json\), not a DOM environment/,
    );
    assert.deepEqual(
      r.dependencies.map((d) => d.remove.map((x) => x.name)),
      [['jest-environment-jsdom']],
    );
    // 2. Type-only references do not keep jsdom; @types/jsdom stays with jsdom.
    const kept = Object.fromEntries(r.kept.map((k) => [k.name, k.reason]));
    assert.equal(kept.jsdom, 'still used by scripts/print-changelog.ts:1, tests/shared/imageTest.tsx:1');
    assert.equal(kept['@types/jsdom'], 'the type definitions of jsdom, which stays');
    const types = r.mentions.filter((m) => m.category === 'types').map((m) => `${m.file}:${m.line}`);
    assert.deepEqual(types, ['tests/setup.ts:1', 'typings/custom.d.ts:1', 'vitest.setup.ts:1']);
    assert.match(
      r.mentions.find((m) => m.category === 'types').hint,
      /replace it with DOM lib types \(e\.g\. DOMWindow -> Window/,
    );
    // 3. jsdom's own dependencies in the transform allowlist, each listed;
    // the others ('@babel', '.pnpm', '@rc-component') not.
    const allow = r.mentions.filter((m) => m.file === '.jest.js' && /transform allowlist/.test(m.hint));
    assert.deepEqual(
      allow.map((m) => m.line),
      [5, 8, 9, 10, 11, 12],
    );
    assert.match(
      allow[0].hint,
      /'@asamuzakjp', 'parse5', 'entities', '@exodus', 'jsdom', '@csstools'.*these entries can go \(tests\/shared\/imageTest\.tsx still imports jsdom inside Jest\).*Not removed by migrate/,
    );
    assert.match(
      allow[1].hint,
      /parse5 is also a dependency of cheerio@1\.0\.0 in node_modules: keep it if your tests load that/,
    );
    assert.match(allow[2].hint, /in node_modules nothing but jsdom's own packages depends on it/);
    assert.match(read(dir, '.jest.js'), /'parse5',\n {2}'entities',/, 'never edited');
    // 4. The git-ignored generated file is not read.
    assert.ok(!r.mentions.some((m) => m.file.startsWith('.dumi/')));
    // 5. Direct uses: the warpdom equivalent, and the Jest note.
    assert.match(
      r.directUses[0],
      /2 file\(s\) use jsdom itself: scripts\/print-changelog\.ts, tests\/shared\/imageTest\.tsx.*createWindow\(\{ url \}\).*documentElement\.innerHTML/,
    );
    assert.match(r.directUses[1], /^tests\/shared\/imageTest\.tsx runs inside Jest .*requires warpdom >= 0\.1\.5\.$/);
    assert.match(
      r.mentions.find((m) => m.file === 'tests/shared/imageTest.tsx' && m.line === 4).hint,
      /^new JSDOM\(html, \{ url \}\) -> const window = createWindow\(\{ url \}\)/,
    );
    // 6. TypeScript: the types note.
    assert.match(r.directUses[2], /^TypeScript: warpdom >= 0\.1\.5 ships its type declarations/);
    assert.match(r.directUses[3], /^3 type reference\(s\) to jsdom/);
    // 7. jsdom left in node_modules, with its chain.
    assert.ok(
      r.transitive.includes(
        'jsdom 8.5.0 stays installed (node_modules): jsonml.js@0.1.0 -> jsdom@8.5.0 (also through mark-twain); no test, setup file or test config names a package that brings it, and no test environment loads it once migrated.',
      ),
      r.transitive.join('\n'),
    );
    // 8. Per runner: the jsdom before, the profile after.
    assert.deepEqual(r.profiles, [
      {
        package: 'package.json',
        runner: 'jest',
        before: 'jsdom 26.1.0 + cssstyle 4.6.0 (through jest-environment-jsdom 30.5.2)',
        after: 'jsdom 26 with the newest cssstyle 4.x it models, its default once jest-environment-jsdom is removed',
        same: true,
      },
      {
        package: 'package.json',
        runner: 'vitest',
        before: 'jsdom 30.1.3 + cssstyle 5.3.7 (installed)',
        after:
          'the installed jsdom (30.1.3): it stays a dependency (see Kept), and warpdom follows it while it is installed',
        same: true,
      },
    ]);
    // 9. environmentOptions.jsdom.url moves to environmentOptions.warpdom.url;
    // Jest's testEnvironmentOptions.url is read by warpdom as it is.
    assert.deepEqual(
      r.edits.map((e) => [e.file, e.line, e.kind]),
      [
        ['.jest.js', 20, 'testEnvironment'],
        ['vitest.config.ts', 5, 'environment'],
        ['vitest.config.ts', 8, 'environmentOptions (url)'],
      ],
    );
    assert.equal(r.edits[2].after, "warpdom: { url: 'http://localhost' },");
    assert.ok(!r.mentions.some((m) => m.file === '.jest.js' && m.line === 23));
    // 10. The output folder ignores itself.
    assert.equal(
      read(dir, '.warpdom-migrate/.gitignore')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .join(),
      '*',
    );
    const console = renderConsole({ ...r, planFileShown: '.warpdom-migrate/plan.md' });
    assert.match(console, /Direct uses of jsdom:\n {2}2 file\(s\)/);
    assert.match(
      console,
      /jsdom version:\n {2}Jest \(package\.json\): the tests ran on jsdom 26\.1\.0 \+ cssstyle 4\.6\.0 .*\(the same profile\)/,
    );
    assert.match(console, /Plan: \.warpdom-migrate\/plan\.md \(its folder ignores itself in git/);
    assert.match(read(dir, '.warpdom-migrate/plan.md'), /## Direct uses of jsdom/);
    // Applied: the url is where warpdom reads it.
    await run(dir, { apply: true });
    assert.match(
      read(dir, 'vitest.config.ts'),
      /environment: 'warpdom',\n.*\n {4}environmentOptions: \{\n {6}warpdom: \{ url: 'http:\/\/localhost' \},/,
    );
  }));

test('migrate (#39): the Ant Design shapes, a fresh clone (nothing installed)', () =>
  withProject('antd-like', async (dir) => {
    const r = await run(dir);
    assert.deepEqual(r.manual, [], 'jest-puppeteer is a known Node preset when it is not installed');
    assert.match(
      r.notes.join('\n'),
      /preset 'jest-puppeteer' sets testEnvironment 'jest-environment-puppeteer' \(jest-puppeteer's preset\)/,
    );
    assert.match(r.transitive.join('\n'), /No lockfile and no node_modules: .*`npm ls jsdom` lists them/);
    assert.equal(r.profiles[0].before, 'jsdom 26 (through jest-environment-jsdom 30.5.2, which depends on jsdom 26)');
    assert.equal(r.profiles[1].before, 'jsdom 30 (declared ^30.1.1)');
    assert.match(
      r.mentions.find((m) => m.line === 5 && m.file === '.jest.js').hint,
      /unless code your tests import needs them transformed too/,
    );
  }));

test('migrate (#39): type-only references to jsdom, and @types/jsdom', async () => {
  const pkg = (extra = '') =>
    `{\n  "private": true,\n  "devDependencies": {\n    "@types/jsdom": "^21.1.7",\n    "jsdom": "30.1.2",${extra}\n    "vitest": "^4.0.0"\n  }\n}\n`;
  const config = "export default { test: { environment: 'jsdom' } };\n";
  // Only type references: jsdom goes; @types/jsdom stays, with the reason.
  await tempProject(
    {
      'package.json': pkg(),
      'vitest.config.ts': config,
      'src/env.ts': "import { type DOMWindow, type JSDOM } from 'jsdom';\nexport type W = DOMWindow;\n",
      'types/global.d.ts': '/// <reference types="jsdom" />\n',
    },
    async (dir) => {
      const r = await run(dir, { apply: true });
      assert.deepEqual(
        r.dependencies[0].remove.map((x) => x.name),
        ['jsdom'],
      );
      assert.deepEqual(
        r.kept.map((k) => [k.name, k.reason]),
        [
          [
            '@types/jsdom',
            'type references to jsdom remain at src/env.ts:1, types/global.d.ts:1: replace them with DOM lib types (e.g. DOMWindow -> Window), then remove @types/jsdom',
          ],
        ],
      );
      assert.ok(readJson(dir, 'package.json').devDependencies['@types/jsdom']);
    },
  );
  // No reference left: both go.
  await tempProject({ 'package.json': pkg(), 'vitest.config.ts': config }, async (dir) => {
    const r = await run(dir, { apply: true });
    assert.deepEqual(
      r.dependencies[0].remove.map((x) => x.name),
      ['jsdom', '@types/jsdom'],
    );
    assert.deepEqual(r.kept, []);
    assert.equal(readJson(dir, 'package.json').devDependencies['@types/jsdom'], undefined);
  });
  // tsconfig "types" naming jsdom is a reference too; a value import keeps jsdom.
  await tempProject(
    {
      'package.json': pkg(),
      'vitest.config.ts': config,
      'tsconfig.json': '{\n  "compilerOptions": {\n    "types": ["vitest/globals", "jsdom"]\n  }\n}\n',
      'src/a.ts': "import { JSDOM, type DOMWindow } from 'jsdom';\n",
    },
    async (dir) => {
      const r = await run(dir);
      assert.deepEqual(
        r.kept.map((k) => k.name),
        ['jsdom', '@types/jsdom'],
      );
      assert.match(r.kept[0].reason, /src\/a\.ts:1/);
      assert.ok(r.mentions.some((m) => m.file === 'tsconfig.json' && m.category === 'types'));
    },
  );
  // happy-dom ships its own types: a type import keeps it.
  await tempProject(
    {
      'package.json':
        '{\n  "private": true,\n  "devDependencies": {\n    "happy-dom": "^20.0.0",\n    "vitest": "^4.0.0"\n  }\n}\n',
      'vitest.config.ts': "export default { test: { environment: 'happy-dom' } };\n",
      'src/a.ts': "import type { Window } from 'happy-dom';\n",
    },
    async (dir) => {
      const r = await run(dir);
      assert.deepEqual(
        r.kept.map((k) => k.name),
        ['happy-dom'],
      );
    },
  );
});

test('migrate scanner (#39): type-only module references', () => {
  const check = (src) => {
    const { tokens } = tokenize(src);
    return typeOnlyReference(tokens, moduleSpecifiers(tokens)[0].token);
  };
  for (const src of [
    "import type { DOMWindow } from 'jsdom';",
    "import type JSDOM from 'jsdom';",
    "import { type DOMWindow, type JSDOM as J } from 'jsdom';",
    "export type { DOMWindow } from 'jsdom';",
    "type M = typeof import('jsdom');",
    "type W = import('jsdom').DOMWindow;",
  ])
    assert.equal(check(src), true, src);
  for (const src of [
    "import { type DOMWindow, JSDOM } from 'jsdom';",
    "import jsdom from 'jsdom';",
    "import type from 'jsdom';",
    "import * as J from 'jsdom';",
    "import 'jsdom';",
    "const { JSDOM } = require('jsdom');",
    "const m = await import('jsdom');",
    "import('jsdom').then((m) => m);",
    "import { type } from 'jsdom';",
  ])
    assert.equal(check(src), false, src);
});

test('migrate (#39): Jest presets are read when installed', async () => {
  const files = (preset) => ({
    'package.json':
      '{\n  "private": true,\n  "devDependencies": {\n    "jest": "^30.0.0",\n    "jest-environment-jsdom": "^30.0.0"\n  }\n}\n',
    'jest.config.js': `module.exports = { preset: '${preset}' };\n`,
  });
  await tempProject(files('my-dom-preset'), async (dir) => {
    installed(
      dir,
      'my-dom-preset',
      { version: '1.0.0' },
      { 'jest-preset.js': "module.exports = { testEnvironment: 'jsdom' };\n" },
    );
    const r = await run(dir);
    assert.deepEqual(
      r.manual.map((m) => m.reason),
      [
        "takes testEnvironment 'jsdom' from preset 'my-dom-preset' (my-dom-preset/jest-preset.js): add testEnvironment: 'warpdom' here",
      ],
    );
    assert.deepEqual(
      r.kept.map((k) => k.name),
      ['jest-environment-jsdom'],
    );
  });
  await tempProject(files('my-node-preset'), async (dir) => {
    installed(dir, 'my-node-preset', { version: '1.0.0' }, { 'jest-preset.json': '{"testEnvironment": "node"}' });
    const r = await run(dir);
    assert.deepEqual(r.manual, []);
    assert.deepEqual(r.edits, []);
    assert.deepEqual(
      r.dependencies[0].remove.map((x) => x.name),
      ['jest-environment-jsdom'],
      'nothing chooses it any more',
    );
  });
  await tempProject(files('my-env-preset'), async (dir) => {
    installed(
      dir,
      'my-env-preset',
      { version: '1.0.0' },
      {
        'jest-preset.json': '{"testEnvironment": "./env.js"}',
        'env.js': "module.exports = require('jest-environment-jsdom');\n",
      },
    );
    assert.match((await run(dir)).manual[0].reason, /takes testEnvironment '\.\/env\.js' from preset 'my-env-preset'/);
  });
  // Not installed and not known: listed, as before.
  await tempProject(files('@acme/jest-preset'), async (dir) => {
    assert.match(
      (await run(dir)).manual[0].reason,
      /takes its config from @acme\/jest-preset \(preset '@acme\/jest-preset'\); if that chooses jsdom/,
    );
  });
});

test('migrate (#39): environmentOptions.jsdom.url moves to environmentOptions.warpdom.url, with a pinned version inside', async () => {
  const pkg = '{\n  "private": true,\n  "devDependencies": {\n    "jsdom": "26.1.0",\n    "vitest": "^4.0.0"\n  }\n}\n';
  await tempProject(
    {
      'package.json': pkg,
      'vitest.config.ts':
        "export default {\n  test: {\n    environment: 'jsdom',\n    environmentOptions: { jsdom: { url: 'http://localhost/app' } },\n  },\n};\n",
    },
    async (dir) => {
      await run(dir, { apply: true });
      assert.equal(
        read(dir, 'vitest.config.ts'),
        "export default {\n  test: {\n    environment: 'warpdom',\n    environmentOptions: { warpdom: { jsdom: '26.1.0', url: 'http://localhost/app' } },\n  },\n};\n",
      );
    },
  );
  // Other jsdom options: listed, not moved.
  await tempProject(
    {
      'package.json': pkg,
      'vitest.config.ts':
        "export default {\n  test: {\n    environment: 'jsdom',\n    environmentOptions: { jsdom: { url: 'http://x/', pretendToBeVisual: true } },\n  },\n};\n",
    },
    async (dir) => {
      const r = await run(dir);
      assert.match(
        r.mentions.find((m) => m.line === 4).hint,
        /options for jsdom \(environmentOptions\.jsdom\) that warpdom does not read: .*move url to environmentOptions\.warpdom\.url/,
      );
      assert.ok(!r.edits.some((e) => e.kind === 'environmentOptions (url)'));
    },
  );
  // A computed environment stays on jsdom for now: the url stays too.
  await tempProject(
    {
      'package.json': pkg,
      'vitest.config.ts':
        "export default {\n  test: {\n    environment: process.env.DOM ?? 'node',\n    environmentOptions: { jsdom: { url: 'http://x/' } },\n  },\n};\n",
    },
    async (dir) => {
      const r = await run(dir);
      assert.deepEqual(r.edits, []);
      assert.match(
        r.mentions.find((m) => m.line === 4).hint,
        /once this environment is warpdom, move it to environmentOptions\.warpdom\.url/,
      );
    },
  );
});

test('migrate (#39): ignored files are not read (git, else .gitignore)', async () => {
  const files = {
    'package.json':
      '{\n  "private": true,\n  "devDependencies": {\n    "jsdom": "30.1.2",\n    "vitest": "^4.0.0"\n  }\n}\n',
    'vitest.config.ts': "export default { test: { environment: 'jsdom' } };\n",
    '.gitignore': '/generated/\n*.tmp.ts\n!keep.tmp.ts\n',
    'generated/data.json': '{ "jsdom": "^30.1.1" }\n',
    'src/a.tmp.ts': "import { JSDOM } from 'jsdom';\n",
    'src/keep.tmp.ts': '// jsdom\n',
    'src/x.ts': '// jsdom\n',
  };
  await tempProject(files, async (dir) => {
    assert.equal(gitignoreMatcher(dir).source, '.gitignore');
    assert.deepEqual(
      walk(dir).map((f) => f.rel),
      ['package.json', 'src/keep.tmp.ts', 'src/x.ts', 'vitest.config.ts'],
    );
    const r = await run(dir);
    assert.deepEqual(r.kept, [], 'an ignored file that imports jsdom does not keep it');
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    if (git('init', '-q').status !== 0) return;
    put(dir, '.git/info/exclude', 'src/x.ts\n');
    assert.deepEqual(
      walk(dir).map((f) => f.rel),
      ['package.json', 'src/keep.tmp.ts', 'vitest.config.ts'],
      "git's answer, .git/info/exclude included",
    );
    // Tracked files are read even when a pattern matches them.
    git('add', '-f', 'src/a.tmp.ts');
    assert.ok(walk(dir).some((f) => f.rel === 'src/a.tmp.ts'));
    // The output folder ignores itself.
    git('add', '-A');
    assert.doesNotMatch(git('status', '--porcelain').stdout, /warpdom-migrate/);
  });
  const rules = parseGitignore('.dumi/tmp\nnode_modules/\n# comment\n**/cache\n');
  assert.deepEqual(
    rules.map((x) => [x.re.test('.dumi/tmp'), x.re.test('a/.dumi/tmp'), x.dirOnly]),
    [
      [true, false, false],
      [false, false, true],
      [false, false, false],
    ],
  );
  assert.ok(rules[2].re.test('a/b/cache'));
});

test('migrate (#39): transitive jsdom with its chain, from an npm lockfile and from node_modules', () => {
  const lock = parseLockfile(fixtures, null);
  assert.deepEqual(chains(lock, [], ['jsdom']), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-chain-'));
  try {
    put(
      dir,
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { devDependencies: { tools: '^1.0.0', 'jsonml.js': '^0.1.0' } },
          'node_modules/tools': { version: '1.2.0', dependencies: { 'mark-twain': '^2.0.0' } },
          'node_modules/mark-twain': { version: '2.0.3', dependencies: { 'jsonml.js': '^0.1.0' } },
          'node_modules/jsonml.js': { version: '0.1.0', dependencies: { jsdom: '^8.5.0' } },
          'node_modules/jsonml.js/node_modules/jsdom': { version: '8.5.0' },
          'node_modules/jsdom': { version: '30.1.3' },
        },
      }),
    );
    const npm = parseLockfile(dir, 'package-lock.json');
    const roots = [
      { dir: '', name: 'tools' },
      { dir: '', name: 'jsonml.js' },
    ];
    assert.deepEqual(chains(npm, roots, ['jsdom']), [
      { name: 'jsdom', version: '8.5.0', chain: ['jsonml.js@0.1.0', 'jsdom@8.5.0'], roots: ['jsonml.js', 'tools'] },
    ]);
    installed(dir, 'a', { version: '1.0.0', dependencies: { b: '1' } });
    installed(dir, '@s/b', { version: '1.0.0' });
    installed(dir, 'b', { version: '2.0.0', dependencies: { 'happy-dom': '^20.0.0' } });
    installed(dir, 'b/node_modules/happy-dom', { version: '20.0.1' });
    assert.deepEqual(
      chains(nodeModulesTree(dir), [{ dir: '', name: 'a' }], ['happy-dom']).map((c) => c.chain),
      [['a@1.0.0', 'b@2.0.0', 'happy-dom@20.0.1']],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate (#39): the cssstyle a removed jsdom loaded is pinned when it changes the profile', async () => {
  assert.equal(cssstyleChangesProfile('26.1.0', '4.6.0'), false);
  assert.equal(cssstyleChangesProfile('26.1.0', '4.2.0'), true);
  assert.equal(cssstyleChangesProfile('20.0.3', '2.3.0'), false);
  assert.equal(cssstyleChangesProfile('27.2.0', '5.3.1'), true);
  assert.equal(cssstyleChangesProfile('28.1.0', '6.1.0'), false);
  assert.equal(cssstyleChangesProfile('30.1.2', '5.0.0'), false);
  await tempProject(
    {
      'package.json':
        '{\n  "private": true,\n  "devDependencies": {\n    "jest": "^30.0.0",\n    "jest-environment-jsdom": "^30.0.0"\n  }\n}\n',
      'jest.config.js': "module.exports = {\n  testEnvironment: 'jsdom',\n};\n",
    },
    async (dir) => {
      installed(dir, 'jest-environment-jsdom', { version: '30.0.0' });
      installed(dir, 'jest-environment-jsdom/node_modules/jsdom', { version: '26.1.0' });
      installed(dir, 'cssstyle', { version: '4.2.1' });
      const r = await run(dir, { apply: true });
      assert.equal(
        read(dir, 'jest.config.js'),
        "module.exports = {\n  testEnvironment: 'warpdom',\n  testEnvironmentOptions: { jsdom: '26.1.0', cssstyle: '4.2.1' },\n};\n",
      );
      assert.match(
        r.profile.join('\n'),
        /jest\.config\.js:3: pinned jsdom 26\.1\.0 and cssstyle 4\.2\.1 \(testEnvironmentOptions\.jsdom\)/,
      );
      assert.deepEqual(
        r.profiles.map((p) => [p.before, p.after, p.same]),
        [
          [
            'jsdom 26.1.0 + cssstyle 4.2.1 (through jest-environment-jsdom 30.0.0)',
            'jsdom 26.1.0 + cssstyle 4.2.1, pinned at jest.config.js:3',
            true,
          ],
        ],
      );
    },
  );
});
