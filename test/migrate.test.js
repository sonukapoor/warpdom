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
import { analyze, tokenize, leadingComments, moduleSpecifiers } from '../src/migrate/js.js';
import { editDependencies, editCatalog, catalogEntries, applyEdits } from '../src/migrate/edits.js';
import { yamlTopLevel, releaseAgeSettings, excludedBy, packageManager, workspaces } from '../src/migrate/project.js';
import { parseLockfile, resolvedVersion, dependencyVersion, dependents } from '../src/migrate/lockfile.js';
import { migrate, renderConsole, renderMarkdown, ENVIRONMENT_PACKAGE_VERSION } from '../src/migrate/index.js';
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
const run = (dir, options = {}) => migrate({ cwd: dir, offline: true, now: NOW, ...options });
const withProject = async (name, fn) => {
  const dir = project(name);
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
  assert.equal(jsdom[0].type, 'other', 'const x = \'jsdom\' is no property value');
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
  const text = "#!/usr/bin/env node\n'use strict';\n/** @jest-environment jsdom */\nimport x from 'jsdom';\n// later comment\nconst y = require('global-jsdom/register');\nvi.mock('happy-dom');\n";
  assert.deepEqual(leadingComments(text).map((c) => c.text), ['/** @jest-environment jsdom */']);
  assert.deepEqual(moduleSpecifiers(tokenize(text).tokens).map((s) => s.value), ['jsdom', 'global-jsdom/register', 'happy-dom']);
});

// --- edits -------------------------------------------------------------------

test('migrate edits: package.json dependencies keep their formatting and order', () => {
  const pkg = '{\n  "name": "x",\n  "devDependencies": {\n    "jsdom": "^26.0.0",\n    "react": "^19.0.0",\n    "vitest": "^3.0.0"\n  },\n  "engines": {}\n}\n';
  const out = editDependencies(pkg, 'devDependencies', { remove: ['jsdom'], add: [{ name: 'warpdom', spec: '^0.1.3' }, { name: 'vitest-environment-warpdom', spec: '^0.1.0' }] });
  assert.equal(out, '{\n  "name": "x",\n  "devDependencies": {\n    "react": "^19.0.0",\n    "vitest": "^3.0.0",\n    "vitest-environment-warpdom": "^0.1.0",\n    "warpdom": "^0.1.3"\n  },\n  "engines": {}\n}\n');
  assert.equal(editDependencies(out, 'devDependencies', { add: [{ name: 'warpdom', spec: '^0.1.3' }] }), out, 'present: unchanged');
  const unsorted = '{\n\t"devDependencies": {\n\t\t"z": "1.0.0",\n\t\t"jsdom": "1.0.0"\n\t}\n}';
  assert.equal(editDependencies(unsorted, 'devDependencies', { remove: ['jsdom'], add: [{ name: 'warpdom', spec: '0.1.3' }] }),
    '{\n\t"devDependencies": {\n\t\t"z": "1.0.0",\n\t\t"warpdom": "0.1.3"\n\t}\n}', 'unsorted: appended, tabs kept, last comma handled');
  assert.equal(editDependencies('{\n  "name": "x"\n}\n', 'devDependencies', { add: [{ name: 'warpdom', spec: '^0.1.3' }] }),
    '{\n  "name": "x",\n  "devDependencies": {\n    "warpdom": "^0.1.3"\n  }\n}\n', 'missing section added');
  assert.equal(editDependencies('{"devDependencies": {"jsdom": "1"}}', 'devDependencies', { remove: ['jsdom'] }), null, 'one-line sections are left to the user');
  assert.equal(editDependencies('{\n  "devDependencies": {\n    "jsdom": "1"\n  }\n}', 'devDependencies', { remove: ['jsdom'] }), '{\n  "devDependencies": {}\n}');
});

test('migrate edits: pnpm catalogs', () => {
  const yaml = "packages:\n  - 'packages/*'\ncatalog:\n  # Testing\n  jsdom: '^27.2.0'\n  '@testing-library/vue': '^8.1.0'\ncatalogs:\n  react18:\n    react: ^18.0.0\n";
  assert.deepEqual(catalogEntries(yaml).entries.map((e) => e.name), ['jsdom', '@testing-library/vue']);
  assert.deepEqual(catalogEntries(yaml, 'react18').entries.map((e) => e.name), ['react']);
  assert.equal(catalogEntries(yaml, 'nope'), null);
  assert.equal(editCatalog(yaml, 'default', { remove: ['jsdom'], add: [{ name: 'warpdom', spec: '^0.1.3' }, { name: 'vitest-environment-warpdom', spec: '^0.1.0' }] }),
    "packages:\n  - 'packages/*'\ncatalog:\n  # Testing\n  '@testing-library/vue': '^8.1.0'\n  warpdom: '^0.1.3'\n  vitest-environment-warpdom: '^0.1.0'\ncatalogs:\n  react18:\n    react: ^18.0.0\n", 'next to the testing group');
  const plain = "catalog:\n  react: ^19.0.0\n  jsdom: ^27.0.0\n  vite: ^7.0.0\n";
  assert.equal(editCatalog(plain, 'default', { remove: ['jsdom'], add: [{ name: 'warpdom', spec: '^0.1.3' }] }),
    "catalog:\n  react: ^19.0.0\n  warpdom: ^0.1.3\n  vite: ^7.0.0\n", 'no group: where jsdom was, with its (lack of) quotes');
  assert.throws(() => applyEdits('abc', [{ start: 0, end: 2, text: 'x' }, { start: 1, end: 3, text: 'y' }]), /overlapping/);
});

// --- project, lockfiles ----------------------------------------------------------

test('migrate project: YAML keys, release-age settings, exclusions, package manager', () => {
  assert.deepEqual(yamlTopLevel("packages:\n  - 'a/*'\n  - b # c\nminimumReleaseAge: 4320\nx: [a, 'b']\n"), { packages: ['a/*', 'b'], minimumReleaseAge: '4320', x: ['a', 'b'] });
  assert.ok(excludedBy(['@mui/*'], '@mui/material'));
  assert.ok(excludedBy(['warpdom@0.1.3'], 'warpdom'));
  assert.ok(!excludedBy(['warp'], 'warpdom'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-age-'));
  try {
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 4320\nminimumReleaseAgeExclude:\n  - warpdom\n');
    fs.writeFileSync(path.join(dir, '.npmrc'), 'min-release-age=2\n');
    fs.writeFileSync(path.join(dir, '.yarnrc.yml'), 'npmMinimalAgeGate: 3d\n');
    fs.writeFileSync(path.join(dir, 'bunfig.toml'), '[install]\nminimumReleaseAge = 86400\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"packageManager": "pnpm@10.1.0+sha512.abc"}');
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    const settings = releaseAgeSettings(dir);
    assert.deepEqual(settings.map((s) => [s.manager, s.minutes]), [['pnpm', 4320], ['npm', 2880], ['yarn', 4320], ['bun', 1440]]);
    assert.deepEqual(settings[0].exclude, ['warpdom']);
    assert.deepEqual(packageManager(dir), { name: 'pnpm', version: '10.1.0', source: 'packageManager field', lockfile: null, lockfiles: ['yarn.lock'] });
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

test('migrate: the companion packages\' version matches packages/*/package.json', () => {
  for (const name of ['vitest-environment-warpdom', 'jest-environment-warpdom']) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8')).version, ENVIRONMENT_PACKAGE_VERSION);
  }
});

// --- fixture projects ------------------------------------------------------------

test('migrate: Vitest with one config (npm)', () => withProject('vitest-single', async (dir) => {
  const r = await run(dir, { apply: true });
  assert.equal(r.error, null);
  assert.equal(r.packageManager.name, 'npm');
  assert.deepEqual(r.runners.map((x) => [x.name, x.version]), [['vitest', '3.2.4']]);
  assert.deepEqual(r.edits.map((e) => [e.file, e.line, e.from, e.to]), [['vitest.config.ts', 7, 'jsdom', 'warpdom'], ['vitest.config.ts', 8, null, '26.1.0']]);
  assert.match(read(dir, 'vitest.config.ts'), /\/\/ jsdom for the component tests\n {4}environment: "warpdom",\n {4}environmentOptions: \{ warpdom: \{ jsdom: "26\.1\.0" \} \},\n {4}setupFiles/, 'quotes and comments kept; jsdom 26.1.0 pinned by default');
  assert.deepEqual(readJson(dir, 'package.json').devDependencies, { '@testing-library/react': '^16.0.0', vitest: '^3.2.4', 'vitest-environment-warpdom': `^${ENVIRONMENT_PACKAGE_VERSION}`, warpdom: `^${r.versions.warpdom}` });
  assert.equal(r.install, 'npm install');
  assert.ok(r.mentions.some((m) => m.file === 'test/setup.ts' && m.category === 'setup'), 'setup file reported');
  assert.match(r.profile.join('\n'), /vitest.config.ts:8: pinned jsdom 26\.1\.0 \(environmentOptions\.warpdom\.jsdom\), because warpdom follows the installed jsdom/);
  assert.ok(fs.existsSync(path.join(dir, '.warpdom-migrate', 'plan.md')));
}));

test('migrate: dry run changes nothing and writes the plan', () => withProject('monorepo', async (dir) => {
  const before = snapshot(dir);
  const r = await run(dir);
  assert.equal(r.mode, 'dry-run');
  assert.ok(r.edits.length > 0 && r.changedFiles.length > 0, 'there is something to change');
  const after = snapshot(dir);
  const plan = after['.warpdom-migrate/plan.md'];
  delete after['.warpdom-migrate/plan.md'];
  assert.deepEqual(after, before);
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
      delete once['.warpdom-migrate/plan.md'];
      delete twice['.warpdom-migrate/plan.md'];
      assert.deepEqual(twice, once, name);
    });
  }
});

test('migrate: Vitest projects array, environmentMatchGlobs, pnpm catalog and minimumReleaseAge', () => withProject('vitest-projects', async (dir) => {
  const registry = {
    warpdom: { version: VERSION, time: '2026-10-16T11:39:26.020Z' },
    'vitest-environment-warpdom': { version: '0.1.0', time: '2026-10-14T21:54:07.630Z' },
  };
  const r = await run(dir, { apply: true, registry, offline: false, now: Date.parse('2026-10-17T10:00:00Z') });
  assert.deepEqual(r.edits.map((e) => [e.line, e.kind, e.from]), [[6, 'environmentMatchGlobs', 'happy-dom'], [12, 'environment', 'jsdom'], [13, 'environmentOptions', null]]);
  const config = read(dir, 'vitest.config.mts');
  assert.match(config, /\['\*\*\/\*\.dom\.test\.ts', 'warpdom'\]/);
  assert.match(config, /name: 'node', environment: 'node'/, 'node project unchanged');
  assert.deepEqual(readJson(dir, 'package.json').devDependencies, { vitest: 'catalog:', 'vitest-environment-warpdom': 'catalog:', warpdom: 'catalog:' });
  assert.equal(read(dir, 'pnpm-workspace.yaml'), `packages:\n  - '.'\nminimumReleaseAge: 1440\ncatalog:\n  warpdom: '^${VERSION}'\n  vitest-environment-warpdom: '^0.1.0'\n  vitest: '^4.0.0'\n`);
  const ages = Object.fromEntries(r.releaseAge.map((a) => [a.name, a]));
  assert.equal(ages.warpdom.status, 'too-new');
  assert.equal(ages.warpdom.okAt, '2026-10-17T11:39:26.020Z');
  assert.equal(ages['vitest-environment-warpdom'].status, 'ok');
  assert.match(r.warnings.join('\n'), new RegExp(`warpdom ${VERSION.replaceAll('.', '\\.')} is younger than minimumReleaseAge`));
  assert.match(r.profile.join('\n'), /ran on happy-dom/);
}));

test('migrate: vitest.workspace file and a project config (yarn, npmMinimalAgeGate)', () => withProject('vitest-workspace', async (dir) => {
  const r = await run(dir, { apply: true });
  assert.equal(r.packageManager.name, 'yarn');
  assert.deepEqual(r.edits.map((e) => [e.file, e.from]), [['packages/ui/vitest.config.ts', 'jsdom'], ['packages/ui/vitest.config.ts', null], ['vitest.workspace.ts', 'happy-dom'], ['vitest.workspace.ts', null]]);
  assert.match(read(dir, 'vitest.workspace.ts'), /name: 'inline',\n {6}environment: 'warpdom',/);
  assert.equal(r.install, 'yarn install');
  assert.deepEqual(r.releaseAge.map((a) => [a.manager, a.setting, a.status]), [['yarn', 'npmMinimalAgeGate', 'unknown'], ['yarn', 'npmMinimalAgeGate', 'unknown']]);
  assert.match(r.profile.join('\n'), /pinned jsdom 25\.0\.1/);
}));

test('migrate: Jest config file', () => withProject('jest-config', async (dir) => {
  const r = await run(dir, { apply: true });
  assert.equal(read(dir, 'jest.config.js'), "/** @type {import('jest').Config} */\nmodule.exports = {\n  testEnvironment: 'warpdom',\n  testEnvironmentOptions: { jsdom: '20.0.3' },\n  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],\n};\n");
  assert.deepEqual(readJson(dir, 'package.json').devDependencies, { jest: '^29.7.0', 'jest-environment-warpdom': `^${ENVIRONMENT_PACKAGE_VERSION}`, warpdom: `^${r.versions.warpdom}` });
  const filter = r.mentions.find((m) => m.file === 'jest.setup.cjs');
  assert.equal(filter.category, 'console');
  assert.match(r.profile.join('\n'), /jest.config.js:4: pinned jsdom 20\.0\.3 \(testEnvironmentOptions\.jsdom\)/);
}));

test('migrate: package.json "jest" field, --env script flag, Jest 27', () => withProject('jest-package-json', async (dir) => {
  const before = read(dir, 'package.json');
  const r = await run(dir, { apply: true });
  const text = read(dir, 'package.json');
  assert.equal(text, before
    .replace('"jest --env=jsdom"', '"jest --env=warpdom"')
    .replace('"testEnvironment": "jsdom"', '"testEnvironment": "warpdom"')
    .replace('"testEnvironmentOptions": {\n', '"testEnvironmentOptions": {\n      "jsdom": "16",\n')
    .replace('    "jest-environment-jsdom": "^27.5.1"\n', `    "jest-environment-warpdom": "^${ENVIRONMENT_PACKAGE_VERSION}",\n    "warpdom": "^${r.versions.warpdom}"\n`));
  assert.match(r.transitive.join('\n'), /Jest 27's jest-config and jest-runner depend on jest-environment-jsdom/);
  assert.ok(r.mentions.some((m) => /pretendToBeVisual: a jsdom option warpdom does not read/.test(m.hint)));
}));

test('migrate: @vitest-environment and @jest-environment comments', async () => {
  await withProject('docblocks-vitest', async (dir) => {
    const r = await run(dir, { apply: true });
    assert.deepEqual(r.edits.map((e) => [e.file, e.kind, e.from]), [['src/a.test.ts', '@vitest-environment comment', 'happy-dom'], ['src/b.test.tsx', '@jest-environment comment', 'jsdom']]);
    assert.ok(read(dir, 'src/a.test.ts').startsWith('// @vitest-environment warpdom\n'));
    assert.ok(read(dir, 'src/b.test.tsx').startsWith('/**\n * @jest-environment warpdom\n */\n'));
    assert.match(read(dir, 'src/c.test.ts'), /@vitest-environment jsdom \(inside the code/, 'a comment after code is no docblock');
    assert.ok(readJson(dir, 'package.json').devDependencies['vitest-environment-warpdom']);
  });
  await withProject('docblocks-jest', async (dir) => {
    await run(dir, { apply: true });
    assert.match(read(dir, 'src/widget.test.ts'), /@jest-environment warpdom\n \* @jest-environment-options \{"url"/);
    assert.ok(readJson(dir, 'package.json').devDependencies['jest-environment-warpdom']);
  });
});

test('migrate: --environment flags in package.json scripts', () => withProject('scripts', async (dir) => {
  await run(dir, { apply: true });
  assert.deepEqual(readJson(dir, 'package.json').scripts, {
    test: 'vitest --environment warpdom',
    'test:happy': 'vitest run --environment=warpdom && echo done',
    'test:node': 'vitest --environment node',
  });
}));

test('migrate: monorepo with packages, a root script that imports jsdom, and another project', () => withProject('monorepo', async (dir) => {
  const r = await run(dir, { apply: true });
  assert.deepEqual(r.monorepo, { tool: 'pnpm workspaces', packages: ['packages/legacy', 'packages/server', 'packages/web'] });
  assert.deepEqual(r.dependencies.map((d) => [d.package, d.remove.map((x) => x.name), d.add.map((x) => x.name)]), [
    ['packages/legacy/package.json', ['jest-environment-jsdom'], ['warpdom', 'jest-environment-warpdom']],
    ['packages/web/package.json', ['jsdom'], ['warpdom', 'vitest-environment-warpdom']],
  ]);
  assert.deepEqual(r.kept.map((k) => [k.package, k.name]), [['package.json', 'jsdom']]);
  assert.match(r.kept[0].reason, /scripts\/render\.mjs:1/);
  assert.equal(readJson(dir, 'package.json').devDependencies.jsdom, '^26.1.0', 'root jsdom kept');
  assert.deepEqual(r.otherProjects.map((o) => o.dir), ['examples/app']);
  assert.match(read(dir, 'examples/app/vite.config.ts'), /environment: 'jsdom'/, 'other projects are not changed');
  assert.match(read(dir, 'packages/server/vitest.config.ts'), /environment: 'node'/);
  assert.equal(r.install, 'pnpm install');
}));

test('migrate: a computed or inherited environment lands in manual and keeps the packages', () => withProject('dynamic', async (dir) => {
  const before = snapshot(dir);
  const r = await run(dir, { apply: true });
  assert.deepEqual(r.edits, []);
  assert.deepEqual(r.manual.map((m) => [m.file, m.line]), [['jest.config.js', 4], ['vitest.config.ts', 10], ['vitest.config.ts', 11]]);
  assert.match(r.manual[0].reason, /@acme\/jest-config/);
  assert.match(r.manual[1].reason, /pickEnvironment\(process\.env\)/);
  assert.match(r.manual[2].reason, /`env` = 'jsdom' \(line 4\), which is also used for other things/);
  assert.deepEqual(r.kept.map((k) => k.name).sort(), ['jest-environment-jsdom', 'jsdom']);
  const after = snapshot(dir);
  delete after['.warpdom-migrate/plan.md'];
  assert.deepEqual(after, before, 'nothing changed');
  assert.match(renderConsole(r), /Manual \(3\)/);
}));

test('migrate: presets, setup files and custom environments', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-presets-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  try {
    write('package.json', '{\n  "name": "p",\n  "devDependencies": {\n    "jest": "^29.7.0",\n    "jest-environment-jsdom": "^29.7.0"\n  }\n}\n');
    write('jest.config.js', "module.exports = {\n  projects: [\n    { displayName: 'ng', preset: 'jest-preset-angular' },\n    { displayName: 'ts', preset: 'ts-jest' },\n    { displayName: 'dom', testEnvironment: './tools/dom-env.js' },\n  ],\n};\n");
    write('jest.setup.js', "Object.assign(global, require('whatwg-fetch'));\n");
    write('tools/dom-env.js', "const JSDOMEnvironment = require('jest-environment-jsdom').default;\nmodule.exports = class extends JSDOMEnvironment {};\n");
    const r = await run(dir, { apply: true });
    assert.deepEqual(r.edits, []);
    assert.deepEqual(r.manual.map((m) => [m.file, m.line]), [['jest.config.js', 3]], 'jest-preset-angular only: ts-jest chooses no DOM, a setup file inherits nothing');
    assert.match(r.manual[0].reason, /preset 'jest-preset-angular'/);
    assert.deepEqual(r.kept.map((k) => k.name), ['jest-environment-jsdom']);
    assert.match(r.kept[0].reason, /tools\/dom-env\.js:1|manual/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate: the removed jsdom version is pinned by default, inside existing options too; --no-keep-jsdom-version opts out', async () => {
  await withProject('jest-package-json', async (dir) => {
    const before = read(dir, 'package.json');
    const r = await run(dir, { apply: true });
    assert.ok(read(dir, 'package.json').includes('"testEnvironmentOptions": {\n      "jsdom": "16.7.0",\n      "url": "http://localhost/",') || /"jsdom": "16"/.test(read(dir, 'package.json')), 'first property of the existing options');
    assert.equal(readJson(dir, 'package.json').jest.testEnvironmentOptions.pretendToBeVisual, true);
    assert.match(r.profile.join('\n'), /pinned jsdom 16 \(testEnvironmentOptions\.jsdom\)/);
    assert.notEqual(read(dir, 'package.json'), before);
  });
  await withProject('vitest-single', async (dir) => {
    const r = await run(dir, { apply: true, keepJsdomVersion: false });
    assert.doesNotMatch(read(dir, 'vitest.config.ts'), /environmentOptions/);
    assert.match(r.profile.join('\n'), /add environmentOptions: \{ warpdom: \{ jsdom: '26\.1\.0' \} \} to the config \(--no-keep-jsdom-version left it out\)/);
  });
  // The default version: nothing written.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-latest-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{\n  "devDependencies": {\n    "jsdom": "30.1.2",\n    "vitest": "^4.0.0"\n  }\n}\n');
    fs.writeFileSync(path.join(dir, 'vitest.config.ts'), "export default { test: { environment: 'jsdom', environmentOptions: { warpdom: {} } } };\n");
    const r = await run(dir, { apply: true });
    assert.equal(read(dir, 'vitest.config.ts'), "export default { test: { environment: 'warpdom', environmentOptions: { warpdom: {} } } };\n");
    assert.deepEqual(r.profile, []);
    fs.writeFileSync(path.join(dir, 'package.json'), '{\n  "devDependencies": {\n    "jsdom": "27.0.1",\n    "vitest": "^4.0.0"\n  }\n}\n');
    fs.writeFileSync(path.join(dir, 'vitest.config.ts'), "export default { test: { environment: 'jsdom', environmentOptions: { warpdom: {} } } };\n");
    await run(dir, { apply: true });
    assert.equal(read(dir, 'vitest.config.ts'), "export default { test: { environment: 'warpdom', environmentOptions: { warpdom: { jsdom: '27.0.1' } } } };\n", 'into an existing warpdom options object');
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
    assert.deepEqual((await run(dir)).warnings.filter((w) => /uncommitted/.test(w)), []);
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
  assert.deepEqual(parseArgs(['--dry-run', '--force', '--json', '--offline', '--keep-jsdom-version']), { dryRun: true, force: true, json: true, offline: true, keepJsdomVersion: true });
  assert.throws(() => parseArgs(['--apply']), /unknown option --apply/, 'applying is the default; there is no --apply');
  assert.deepEqual(parseArgs(['--no-keep-jsdom-version']), { keepJsdomVersion: false });
  assert.throws(() => parseArgs(['--nope']), /unknown option --nope/);
  const sink = () => { let s = ''; return { write: (x) => { s += x; }, get text() { return s; } }; };
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
    assert.match(out.text, /Would change the test environment \(2\):\n {2}jest\.config\.js:3 {2}testEnvironment: jsdom -> warpdom\n {2}jest\.config\.js:4 {2}added testEnvironmentOptions: \{ jsdom: '20\.0\.3' \},\n/);
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
    git('init', '-q'); git('add', '-A'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture');
    fs.appendFileSync(path.join(dir, 'package.json'), '\n');
    out = sink();
    assert.equal(await main(['--offline'], { stdout: out, cwd: dir }), 2);
    assert.match(out.text, /uncommitted change/);
    assert.match(read(dir, 'jest.config.js'), /testEnvironment: 'jsdom'/, 'nothing changed');
    out = sink();
    assert.equal(await main(['--dry-run', '--offline'], { stdout: out, cwd: dir }), 0, '--dry-run works on a dirty tree');
    out = sink();
    assert.equal(await main(['--force', '--offline'], { stdout: out, cwd: dir }), 0);
    assert.match(read(dir, 'jest.config.js'), /testEnvironment: 'warpdom'/);
  });
  const res = spawnSync(process.execPath, [path.join(root, 'bin', 'warpdom.js'), 'migrate', '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^warpdom migrate:/);
});

test('migrate: the plan lists everything in Markdown', () => withProject('monorepo', async (dir) => {
  const r = await run(dir);
  const md = read(dir, '.warpdom-migrate/plan.md');
  assert.equal(md, renderMarkdown(r));
  assert.match(md, /\| packages\/web\/vite\.config\.ts:6 \| environment \| `environment: 'jsdom',` \| `environment: 'warpdom',` \|/);
  assert.match(md, /## Other projects/);
  assert.match(md, /Install with `pnpm install`/);
}));

test('migrate: workspaces are read from package.json too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-migrate-ws-'));
  try {
    fs.mkdirSync(path.join(dir, 'packages', 'a'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"workspaces": {"packages": ["packages/*"]}}');
    fs.writeFileSync(path.join(dir, 'packages', 'a', 'package.json'), '{}');
    assert.deepEqual(workspaces(dir), { tool: 'workspaces (package.json)', patterns: ['packages/*'], dirs: [dir, path.join(dir, 'packages', 'a')] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
