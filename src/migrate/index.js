// `warpdom migrate`: moves a project's tests from jsdom or happy-dom to
// warpdom (docs/migrate.md). Node only.
//
//   import { migrate } from 'warpdom/migrate';
//   const plan = await migrate({ cwd, apply: false });
//
// It finds every place that picks a DOM environment (Vitest and Jest
// configs, projects and workspaces, per-file comments, CLI flags in
// package.json scripts), changes each with an exact text edit, adds warpdom
// and its environment package where the old DOM package was declared and
// removes the old packages that nothing imports any more. Whatever it
// cannot change safely (a computed environment, one inherited from another
// package) is listed as manual, and lines that mention jsdom (workarounds,
// polyfills, console filters) are listed for review, never edited. The dry
// run (the default) changes nothing; both modes write the plan to
// .warpdom-migrate/plan.md.
import fs from 'node:fs';
import path from 'node:path';
import { packageDir, packageVersion, findConfig, findVitestWorkspace } from '../compare/detect.js';
import { analyze, tokenize, lineIndex, leadingComments, moduleSpecifiers } from './js.js';
import { applyEdits, replaceLiteral, editDependencies, editCatalog, catalogEntries } from './edits.js';
import { walk, workspaces, workspaceRootAbove, packageManager, installCommand, releaseAgeSettings, excludedBy, registryInfo, gitDirty, readText, posix, SCRIPT_EXTS } from './project.js';
import { renderConsole, renderMarkdown } from './report.js';
import { parseLockfile, resolvedVersion, dependencyVersion, dependents } from './lockfile.js';
import { VERSION } from '../version.js';

export { renderConsole, renderMarkdown } from './report.js';

// The packages migrate replaces when nothing else needs them.
export const REMOVABLE = ['jsdom', 'happy-dom', 'jest-environment-jsdom', '@happy-dom/jest-environment', 'global-jsdom', 'jsdom-global'];
// Environment names each runner resolves to jsdom or happy-dom.
const DOM_ENVIRONMENTS = {
  vitest: new Set(['jsdom', 'happy-dom']),
  jest: new Set(['jsdom', 'jest-environment-jsdom', 'happy-dom', '@happy-dom/jest-environment']),
};
const ALL_DOM = new Set([...DOM_ENVIRONMENTS.vitest, ...DOM_ENVIRONMENTS.jest]);
export const ENVIRONMENT_PACKAGE = { vitest: 'vitest-environment-warpdom', jest: 'jest-environment-warpdom' };
// The companion packages' version (packages/*/package.json; kept equal by
// test/migrate.test.js). The registry's latest is used when it is newer.
export const ENVIRONMENT_PACKAGE_VERSION = '0.1.0';
const OWN = ['warpdom', ...Object.values(ENVIRONMENT_PACKAGE)];
// Peer dependencies of removable packages on each other.
const PEERS = { 'global-jsdom': ['jsdom'], 'jsdom-global': ['jsdom'] };
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// Jest presets known not to choose a DOM environment.
const NODE_PRESETS = /^(ts-jest|react-native|@shelf\/jest-mongodb|jest-dynalite)(\/|$)/;
// The jsdom each jest-environment-jsdom major brings.
const JEST_ENV_JSDOM = { 25: '15', 26: '16', 27: '16', 28: '19', 29: '20', 30: '26' };
// What warpdom follows when no jsdom is installed (src/vitest.js, src/jest.js).
const DEFAULT_PROFILE = { vitest: '30.1.2 (the newest it models)', jest: '26' };

const CONFIG_NAME = /^(vite|vitest|jest)([.-][\w.-]*)?\.(c|m)?[jt]s$/;
const TEST_FILE = /(\.|-|_)(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//;
const FIXTURE_DIR = /(^|\/)(__fixtures__|fixtures|__snapshots__)\//;
const MENTION = /jsdom|happy-?dom/i;

class MigrateError extends Error {}

const unique = (xs) => [...new Set(xs)];
const majorOf = (v) => {
  const m = /(\d+)(?:\.\d+)?/.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
};

export async function migrate(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const apply = Boolean(options.apply);
  const outDir = path.resolve(cwd, options.out ?? '.warpdom-migrate');
  const now = options.now ?? Date.now();
  const result = {
    version: 1, cwd, mode: apply ? 'apply' : 'dry-run', error: null, warnings: [], notes: [],
    packageManager: null, runners: [], monorepo: null, otherProjects: [], skippedFixtures: [],
    edits: [], dependencies: [], catalog: [], kept: [], manual: [], mentions: [], transitive: [], profile: [],
    releaseAge: [], install: null, changedFiles: [], planFile: path.join(outDir, 'plan.md'), versions: {},
  };
  try {
    // The registry's latest versions and their publication dates (for
    // release-age settings); offline, warpdom's own versions are used.
    const registry = options.registry ?? (options.offline ? {} : await registryInfo(OWN, { fetchImpl: options.fetch }));
    const { finalTexts } = run(result, { cwd, registry, keepJsdomVersion: options.keepJsdomVersion !== false });
    await releaseAges(result, { now, registry, offline: Boolean(options.offline) });
    if (apply) {
      for (const file of result.changedFiles) fs.writeFileSync(path.resolve(cwd, file), finalTexts.get(file));
    }
  } catch (err) {
    if (!(err instanceof MigrateError)) throw err;
    result.error = err.message;
  }
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(result.planFile, renderMarkdown(result));
  } catch (err) {
    result.warnings.push(`could not write ${posix(path.relative(cwd, result.planFile))}: ${err.message}`);
  }
  return result;
}

function run(result, { cwd, registry, keepJsdomVersion }) {
  const rootPkgFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(rootPkgFile)) throw new MigrateError('no package.json here; run migrate at the root of your project');
  const pmRoot = workspaceRootOf(cwd);
  if (pmRoot !== cwd) result.warnings.push(`this is a package of the workspace at ${pmRoot}; run migrate there to migrate every package at once`);
  const rel = (abs) => posix(path.relative(cwd, abs)) || '.';
  const dirty = gitDirty(cwd);
  if (dirty === null) result.notes.push('not a git repository: review the changes by other means');
  else if (dirty.length) result.warnings.push(`the git working tree has ${dirty.length} uncommitted change(s); commit or stash them first so that migrate's changes can be reviewed on their own`);

  // --- packages ----------------------------------------------------------
  const ws = workspaces(cwd);
  const files = walk(cwd);
  const texts = new Map();
  const textOf = (r) => {
    if (!texts.has(r)) texts.set(r, readText(path.join(cwd, r)));
    return texts.get(r);
  };
  const pkgs = new Map();
  for (const f of files) {
    if (f.name !== 'package.json') continue;
    const dirRel = posix(path.dirname(f.rel)) === '.' ? '' : posix(path.dirname(f.rel));
    let json;
    try { json = JSON.parse(textOf(f.rel)); } catch { continue; }
    const abs = path.join(cwd, dirRel);
    pkgs.set(dirRel, { dir: abs, rel: dirRel, file: f.rel, json, inScope: ws.dirs.includes(abs) || dirRel === '' });
  }
  const root = pkgs.get('');
  if (!root) throw new MigrateError('package.json could not be read');
  const wsPackages = [...pkgs.values()].filter((p) => p.inScope && p.rel).map((p) => p.rel);
  result.monorepo = ws.tool && wsPackages.length ? { tool: ws.tool, packages: wsPackages } : null;
  // The package a file belongs to (nearest package.json).
  const ownerOf = (fileRel) => {
    for (let d = posix(path.dirname(fileRel)); ; d = posix(path.dirname(d))) {
      const key = d === '.' ? '' : d;
      if (pkgs.has(key)) return pkgs.get(key);
      if (key === '') return root;
    }
  };
  const declared = (pkg, name, sections = DEP_SECTIONS) => sections.find((s) => pkg.json[s] && Object.hasOwn(pkg.json[s], name)) ?? null;
  // The package and its in-scope ancestors, nearest first.
  const chainOf = (pkg) => {
    const chain = [pkg];
    for (let d = pkg.rel; d; ) {
      d = posix(path.dirname(d)) === '.' ? '' : posix(path.dirname(d));
      const p = pkgs.get(d);
      if (p?.inScope) chain.push(p);
    }
    if (!chain.includes(root)) chain.push(root);
    return chain;
  };
  const inScopeFile = (fileRel) => ownerOf(fileRel).inScope;

  // --- package manager, runners -----------------------------------------
  const pm = packageManager(pmRoot);
  result.packageManager = pm;
  const runnerOf = (pkg, prefer = null) => {
    const found = [];
    for (const p of chainOf(pkg)) {
      for (const name of ['vitest', 'jest', 'react-scripts']) if (declared(p, name) && !found.includes(name)) found.push(name);
      if (found.length) break;
    }
    const runners = found.map((n) => (n === 'react-scripts' ? 'jest' : n));
    if (prefer && runners.includes(prefer)) return prefer;
    return runners[0] ?? prefer;
  };
  const lock = parseLockfile(pmRoot, pm.lockfile);
  const lockRel = (pkg) => posix(path.relative(pmRoot, pkg.dir));
  const workspaceYaml = readText(path.join(pmRoot, 'pnpm-workspace.yaml'));
  // A declared spec as a version: "catalog:" looked up in the catalog.
  const specOf = (spec, name) => {
    const cat = typeof spec === 'string' && spec.startsWith('catalog:') ? spec.slice('catalog:'.length) || 'default' : null;
    if (!cat || workspaceYaml === null) return spec;
    return catalogEntries(workspaceYaml, cat)?.entries.find((e) => e.name === name)?.value.replace(/^['"]|['"]$/g, '') ?? spec;
  };
  // The version of name the package uses: installed, else the lockfile's,
  // else what package.json declares. { version, how }
  const usedVersion = (pkg, name, spec) => {
    const installed = packageVersion(pkg.dir, name);
    if (installed) return { version: installed, how: 'installed' };
    const locked = resolvedVersion(lock, lockRel(pkg), name, spec);
    if (locked) return { version: locked, how: pm.lockfile };
    return { version: specOf(spec, name), how: 'declared' };
  };
  const runnerVersions = new Map();
  for (const pkg of pkgs.values()) {
    if (!pkg.inScope) continue;
    for (const name of ['vitest', 'jest']) {
      const section = declared(pkg, name);
      if (!section) continue;
      const { version, how } = usedVersion(pkg, name, pkg.json[section][name]);
      const key = `${name} ${version}`;
      if (!runnerVersions.has(key)) runnerVersions.set(key, { name, version, how, packages: [] });
      runnerVersions.get(key).packages.push(pkg.rel || '.');
    }
  }
  result.runners = [...runnerVersions.values()];
  for (const r of result.runners) {
    const major = majorOf(r.version);
    if (r.name === 'vitest' && major !== null && major < 2) result.warnings.push(`Vitest ${r.version}: warpdom needs Vitest 2 or later`);
    if (r.name === 'jest' && major !== null && major < 27) result.warnings.push(`Jest ${r.version}: warpdom needs Jest 27 or later (Jest 26 and earlier also default to jsdom when no testEnvironment is set)`);
  }
  for (const f of ['.nvmrc', '.node-version']) {
    const v = readText(path.join(cwd, f))?.trim();
    const major = v && /^v?\d/.test(v) ? majorOf(v) : null;
    if (major !== null && major < 22) result.warnings.push(`${f} pins Node ${v}; warpdom needs Node 22.12 or later`);
  }

  // --- the files to read ------------------------------------------------
  const scope = files.filter((f) => inScopeFile(f.rel));
  for (const pkg of pkgs.values()) {
    if (!pkg.inScope) result.otherProjects.push({ dir: pkg.rel, uses: [] });
  }
  const otherOf = (fileRel) => {
    const owner = ownerOf(fileRel);
    return owner.inScope ? null : result.otherProjects.find((o) => o.dir === owner.rel);
  };
  // Configs: by name, by --config in scripts, workspace entries, and the
  // files they import with relative paths.
  const configs = new Set(files.filter((f) => CONFIG_NAME.test(f.name)).map((f) => f.rel));
  // The runners' own config files (not setup files or shared modules): only
  // these can inherit an environment from a preset or package.
  const primary = new Set(files.filter((f) => /^(jest|vite|vitest)\.config\./.test(f.name)).map((f) => f.rel));
  for (const pkg of pkgs.values()) {
    for (const runner of ['vitest', 'jest']) {
      const c = findConfig(pkg.dir, runner);
      if (c && !c.endsWith('package.json')) { configs.add(rel(c)); primary.add(rel(c)); }
    }
    const wsFile = findVitestWorkspace(pkg.dir);
    if (wsFile) configs.add(rel(wsFile));
    for (const script of Object.values(pkg.json.scripts ?? {})) {
      if (typeof script !== 'string') continue;
      for (const m of script.matchAll(/(?:^|\s)(?:--config|-c)(?:=|\s+)(['"]?)([^\s'"]+)\1/g)) {
        if (!/\b(vitest|jest)\b/.test(script)) continue;
        const file = path.resolve(pkg.dir, m[2]);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) { configs.add(rel(file)); primary.add(rel(file)); }
      }
    }
  }
  const resolveRelative = (fromRel, spec) => {
    const base = path.resolve(cwd, path.dirname(fromRel), spec);
    for (const candidate of [base, ...['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'].map((e) => base + e), ...['index.ts', 'index.js', 'index.mjs'].map((e) => path.join(base, e))]) {
      try {
        if (fs.statSync(candidate).isFile()) return rel(candidate);
      } catch { /* next */ }
    }
    return null;
  };
  const analyses = new Map();
  const analysisOf = (r) => {
    if (!analyses.has(r)) {
      const text = textOf(r);
      analyses.set(r, text === null ? null : analyze(text, { json: r.endsWith('.json') }));
    }
    return analyses.get(r);
  };
  // Followed up to three links deep: what configs import with a relative
  // path (shared config modules), and files named in projects / workspace
  // lists, extends and preset.
  const queue = [...configs].map((r) => ({ r, depth: 0 }));
  while (queue.length) {
    const { r, depth } = queue.shift();
    if (depth >= 3 || (!SCRIPT_EXTS.has(path.extname(r)) && !r.endsWith('.json'))) continue;
    const a = analysisOf(r);
    if (!a) continue;
    const linked = moduleSpecifiers(a.tokens).map((s) => s.value);
    for (const [k, site] of a.sites) {
      const v = a.tokens[k].value;
      if (typeof v !== 'string' || !/^\.{0,2}\/?[\w@./-]+\.[cm]?[jt]s$/.test(v)) continue;
      const pth = site.type === 'value' ? site.prop.path : site.path ?? [];
      const listed = site.type === 'element' && (pth.length === 0 || pth.some((x) => x === 'projects' || x === 'workspace'));
      const named = site.type === 'value' && ['extends', 'preset', 'configFile', 'config'].includes(pth[pth.length - 1]);
      if (listed || named) linked.push(v.startsWith('.') ? v : `./${v}`);
    }
    for (const spec of linked) {
      if (!spec.startsWith('.')) continue;
      const target = resolveRelative(r, spec);
      if (target && !configs.has(target) && !TEST_FILE.test(target) && SCRIPT_EXTS.has(path.extname(target)) && !target.includes('node_modules/')) {
        configs.add(target);
        queue.push({ r: target, depth: depth + 1 });
      }
    }
  }
  // A runner nobody declares (it comes through kcd-scripts, react-scripts
  // and the like): known from its config files.
  if (!result.runners.length) {
    for (const [name, re] of [['vitest', /(^|\/)(vite|vitest)\.config\./], ['jest', /(^|\/)jest\.config\./]]) {
      const c = [...configs].find((f) => re.test(f));
      if (c) result.runners.push({ name, version: null, how: 'inferred', note: `not declared; ${c}`, packages: [] });
    }
  }

  // --- environments in configs ---------------------------------------------
  const edits = [];      // { file, start, end, text, kind, runner, from, to, line }
  const manual = [];     // { file, line, reason, runner }
  const uses = [];       // { file, runner, pathOnly }
  const setupFiles = new Set();
  const optionNotes = [];
  // meta: the property and analysis of a config's environment literal
  // (where --keep-jsdom-version adds its option).
  const addEdit = (file, token, value, kind, runner, meta = null) => {
    const other = otherOf(file);
    if (other) { other.uses.push(`${file}:${lineIndex(textOf(file)).lineOf(token.start)}`); return; }
    if (FIXTURE_DIR.test(file)) { result.skippedFixtures.push(`${file}:${lineIndex(textOf(file)).lineOf(token.start)}`); return; }
    edits.push({ file, ...replaceLiteral(token, value), kind, runner, from: token.value, to: value, line: lineIndex(textOf(file)).lineOf(token.start), meta });
  };
  const addManual = (file, offset, reason, runner) => {
    const other = otherOf(file);
    if (other) { other.uses.push(`${file}:${lineIndex(textOf(file)).lineOf(offset)}`); return; }
    if (FIXTURE_DIR.test(file)) return;
    manual.push({ file, line: lineIndex(textOf(file)).lineOf(offset), reason, runner });
  };
  const ENV_KEYS = { environment: 'vitest', testEnvironment: 'jest' };
  const isP = (t, ...v) => t?.type === 'punct' && v.includes(t.value);
  const exprText = (text, a, from, to) => text.slice(a.tokens[from].start, a.tokens[to - 1].end).replace(/\s+/g, ' ');

  for (const file of [...configs].sort()) {
    if (file.endsWith('package.json')) continue;
    const a = analysisOf(file);
    if (!a) continue;
    const text = textOf(file);
    scanConfig(file, text, a, []);
  }
  // package.json: the "jest" field and scripts.
  for (const pkg of pkgs.values()) {
    const text = textOf(pkg.file);
    const a = analysisOf(pkg.file);
    if (!a) continue;
    if (pkg.json.jest && typeof pkg.json.jest === 'object') scanConfig(pkg.file, text, a, ['jest']);
    scanScripts(pkg, text, a);
  }

  function scanConfig(file, text, a, prefix) {
    const { tokens, properties, sites } = a;
    const within = (p) => prefix.every((k, i) => p.path[i] === k);
    let envProps = 0;
    const base = path.basename(file);
    const isPrimary = prefix.length > 0 || primary.has(file);
    const isJest = prefix.length > 0 || (/jest/.test(base) && !/^(vite|vitest)\./.test(base));
    for (const p of properties) {
      if (!within(p)) continue;
      const runner = ENV_KEYS[p.key];
      if (runner) {
        envProps++;
        environmentValue(file, text, a, p, runner);
        continue;
      }
      if (['setupFiles', 'setupFilesAfterEnv', 'globalSetup', 'setupFilesAfterEach'].includes(p.key)) {
        for (let k = p.valueStart; k < p.valueEnd; k++) {
          const t = tokens[k];
          if (t.type !== 'string' || !/\.[cm]?[jt]sx?$|^\.\.?\//.test(t.value)) continue;
          const spec = t.value.replace(/^<rootDir>\/?/, './');
          const relSpec = spec.startsWith('.') ? spec : `./${spec}`;
          // Relative to the config, else to a root option of the same file.
          const roots = properties.filter((q) => (q.key === 'root' || q.key === 'rootDir') && tokens[q.valueStart]?.type === 'string').map((q) => tokens[q.valueStart].value);
          const target = resolveRelative(file, relSpec) ?? roots.map((r) => resolveRelative(file, `./${posix(path.join(r, relSpec))}`)).find(Boolean);
          if (target) setupFiles.add(target);
        }
      }
      if (p.key === 'jsdom' || p.key === 'happyDOM' || p.key === 'happy-dom') {
        if (p.path.includes('environmentOptions')) optionNotes.push({ file, line: lineIndex(text).lineOf(tokens[p.keyToken].start), hint: 'options for jsdom/happy-dom (environmentOptions): warpdom reads environmentOptions.warpdom ({ jsdom, cssstyle, fastFrames }) and uses http://localhost:3000 as its URL; move what still matters' });
      }
      if (p.path.length >= 2 && p.path[p.path.length - 2] === 'testEnvironmentOptions' && !['url', 'jsdom', 'cssstyle', 'fastFrames', 'customExportConditions'].includes(p.key)) {
        optionNotes.push({ file, line: lineIndex(text).lineOf(tokens[p.keyToken].start), hint: `testEnvironmentOptions.${p.key}: a jsdom option warpdom does not read (it reads url, jsdom, cssstyle, fastFrames, customExportConditions)` });
      }
    }
    // environmentMatchGlobs: [[glob, 'jsdom'], ...]
    for (const [k, site] of sites) {
      if (site.type !== 'element' || site.index !== 1) continue;
      const pth = site.path;
      if (pth[pth.length - 1] !== '[]' || pth[pth.length - 2] !== 'environmentMatchGlobs') continue;
      const t = tokens[k];
      if (DOM_ENVIRONMENTS.vitest.has(t.value)) addEdit(file, t, 'warpdom', 'environmentMatchGlobs', 'vitest');
      else if (t.value === 'warpdom') uses.push({ file, runner: 'vitest' });
    }
    // A runner's config that sets no environment but takes its options from
    // somewhere else: each config object with a preset and no environment
    // of its own, and a config without any environment that is built from
    // another module (spread, Object.assign, mergeConfig).
    if (!isPrimary || !(isJest || runnerOf(ownerOf(file), 'vitest') === 'vitest')) return;
    const sources = [];
    for (const p of properties) {
      if (p.key !== 'preset' || !within(p) || tokens[p.valueStart]?.type !== 'string') continue;
      if (properties.some((q) => q.frame === p.frame && ENV_KEYS[q.key])) continue;
      const t = tokens[p.valueStart];
      sources.push({ spec: t.value, how: `preset '${t.value}'`, offset: t.start });
    }
    if (!envProps && !prefix.length) sources.push(...inheritedFrom(a));
    const what = isJest ? 'testEnvironment' : 'test.environment';
    for (const source of sources) {
      if (source.spec.startsWith('.') || source.spec.startsWith('/')) continue;
      if (isJest && NODE_PRESETS.test(source.spec)) continue;
      if (!isJest && /^(vite|vitest)(\/|$)|^@vitejs\/|^@vitest\//.test(source.spec)) continue;
      addManual(file, source.offset, `sets no ${what} itself but takes its config from ${source.spec} (${source.how}); if that chooses jsdom or happy-dom, set ${what}: 'warpdom' here`, isJest ? 'jest' : 'vitest');
    }
  }

  // Where a config's options come from besides its own text: spreads,
  // Object.assign / mergeConfig of an imported value.
  function inheritedFrom(a) {
    const { tokens, spreads } = a;
    const out = [];
    const specOf = (name) => {
      for (let k = 0; k < tokens.length - 3; k++) {
        const t = tokens[k];
        // const X = require('spec') / require('spec').x
        if (t.type === 'ident' && t.value === name && isP(tokens[k + 1], '=') && tokens[k + 2]?.value === 'require' && isP(tokens[k + 3], '(') && tokens[k + 4]?.type === 'string') return tokens[k + 4].value;
        // import X from 'spec' / import { X } from 'spec'
        if (t.type === 'ident' && t.value === 'import') {
          let j = k + 1;
          let found = false;
          while (j < tokens.length && !(tokens[j].type === 'ident' && tokens[j].value === 'from') && j < k + 40) {
            if (tokens[j].type === 'ident' && tokens[j].value === name) found = true;
            j++;
          }
          if (found && tokens[j + 1]?.type === 'string') return tokens[j + 1].value;
        }
      }
      return null;
    };
    for (const s of spreads) {
      const t = tokens[s.token];
      if (t?.type === 'ident') {
        const spec = specOf(t.value);
        if (spec) out.push({ spec, how: `...${t.value}`, offset: t.start });
      } else if (t?.value === 'require' && tokens[s.token + 2]?.type === 'string') out.push({ spec: tokens[s.token + 2].value, how: '...require()', offset: t.start });
    }
    for (let k = 0; k < tokens.length - 2; k++) {
      const t = tokens[k];
      if (t.type !== 'ident' || !isP(tokens[k + 1], '(')) continue;
      const callee = t.value === 'assign' && tokens[k - 2]?.value === 'Object' ? 'Object.assign' : t.value;
      if (!['Object.assign', 'mergeConfig', 'merge', 'deepmerge', 'defu'].includes(callee)) continue;
      const arg = tokens[k + 2];
      if (arg?.type !== 'ident') continue;
      const spec = specOf(arg.value);
      if (spec) out.push({ spec, how: `${callee}(${arg.value}, ...)`, offset: arg.start });
    }
    return out;
  }

  // The value of an environment / testEnvironment property.
  function environmentValue(file, text, a, p, runner) {
    const { tokens, sites } = a;
    const dom = DOM_ENVIRONMENTS[runner];
    const at = tokens[p.keyToken].start;
    if (p.shorthand) { identifierValue(file, text, a, p, p.key, runner); return; }
    const from = p.valueStart;
    const to = p.valueEnd;
    if (from >= to) return;
    const literals = [];
    for (let k = from; k < to; k++) {
      const t = tokens[k];
      if ((t.type === 'string' || t.type === 'template') && sites.get(k)?.type === 'value' && sites.get(k).prop === p) literals.push(k);
    }
    const domLiterals = literals.filter((k) => dom.has(tokens[k].value));
    const resultPosition = (k) => {
      const prev = tokens[k - 1];
      const next = tokens[k + 1];
      const before = k === from || isP(prev, ':', '?', '||', '??', '&&', '(');
      const after = k + 1 >= to || isP(next, ',', '}', ':', ')', '||', '??') || (next?.type === 'ident' && (next.value === 'as' || next.value === 'satisfies'));
      return before && after;
    };
    if (domLiterals.length) {
      for (const k of domLiterals) {
        if (resultPosition(k)) addEdit(file, tokens[k], 'warpdom', runner === 'vitest' ? 'environment' : 'testEnvironment', runner, { prop: p, a, text });
        else addManual(file, tokens[k].start, `${p.key} compares or computes with '${tokens[k].value}' (\`${exprText(text, a, from, to)}\`): change it by hand`, runner);
      }
      return;
    }
    if (to - from === 1 && literals.length === 1) {
      const v = tokens[from].value;
      if (v === 'warpdom' || /warpdom\//.test(v ?? '')) uses.push({ file, runner, pathOnly: v !== 'warpdom' });
      else if (v === null) addManual(file, at, `${p.key} is built from a template string (\`${exprText(text, a, from, to)}\`)`, runner);
      else if (runner === 'jest' && /jsdom|happy-dom/.test(v)) addManual(file, at, `testEnvironment '${v}' is a jsdom-based environment; switch to 'warpdom' if it adds nothing warpdom lacks`, runner);
      return;
    }
    if (to - from === 1 && tokens[from].type === 'ident') { identifierValue(file, text, a, p, tokens[from].value, runner); return; }
    if (literals.length && literals.every((k) => !ALL_DOM.has(tokens[k].value)) && !tokens.slice(from, to).some((t) => t.type === 'ident' && /require|resolve/.test(t.value))) {
      // node / edge-runtime and the like chosen by a condition: nothing to do,
      // unless the condition reads something outside the file.
      if (!tokens.slice(from, to).some((t) => t.type === 'ident' && /env|process/.test(t.value))) return;
    }
    addManual(file, at, `${p.key} is computed (\`${exprText(text, a, from, to)}\`): if it can be jsdom or happy-dom, change it by hand`, runner);
  }

  // environment: X, or { environment }: a constant of the same file is
  // edited where it is declared, when it is used for nothing else.
  function identifierValue(file, text, a, p, name, runner) {
    const { tokens, properties } = a;
    const at = tokens[p.keyToken].start;
    const keyTokens = new Set(properties.filter((q) => !q.shorthand).map((q) => q.keyToken));
    let decl = -1;
    for (let k = 0; k < tokens.length - 3; k++) {
      if (tokens[k].type === 'ident' && ['const', 'let', 'var'].includes(tokens[k].value) && tokens[k + 1].value === name && isP(tokens[k + 2], '=')) { decl = k; break; }
    }
    const imported = (() => {
      for (let k = 0; k < tokens.length; k++) {
        if (tokens[k].type !== 'ident' || tokens[k].value !== 'import') continue;
        let j = k + 1;
        let found = false;
        while (j < tokens.length && j < k + 40 && !(tokens[j].type === 'ident' && tokens[j].value === 'from')) {
          if (tokens[j].type === 'ident' && tokens[j].value === name) found = true;
          j++;
        }
        if (found && tokens[j + 1]?.type === 'string') return tokens[j + 1].value;
      }
      return null;
    })();
    if (imported && imported.startsWith('warpdom')) { uses.push({ file, runner, pathOnly: true }); return; }
    if (decl < 0) {
      if (imported) addManual(file, at, `${p.key} comes from \`${name}\`, imported from ${imported}: if that is jsdom or happy-dom, change it there or here`, runner);
      else addManual(file, at, `${p.key} comes from \`${name}\` (a parameter or a value set elsewhere): if it can be jsdom or happy-dom, change it by hand`, runner);
      return;
    }
    const value = tokens[decl + 3];
    const after = tokens[decl + 4];
    const simple = (value?.type === 'string' || (value?.type === 'template' && value.value !== null)) && (!after || isP(after, ';', ',') || after.type === 'ident' || isP(after, '}'));
    if (!simple) {
      addManual(file, at, `${p.key} comes from \`${name}\` (line ${lineIndex(text).lineOf(tokens[decl].start)}), which is computed: if it can be jsdom or happy-dom, change it by hand`, runner);
      return;
    }
    if (!DOM_ENVIRONMENTS[runner].has(value.value)) {
      if (value.value === 'warpdom') uses.push({ file, runner });
      return;
    }
    // Every other use of the name must be an environment value.
    const envValue = (k) => properties.some((q) => ENV_KEYS[q.key] && ((q.shorthand && q.keyToken === k) || (!q.shorthand && q.valueStart === k && q.valueEnd === k + 1)));
    const others = tokens.map((t, k) => k).filter((k) => tokens[k].type === 'ident' && tokens[k].value === name && k !== decl + 1 && !keyTokens.has(k) && !isP(tokens[k - 1], '.', '?.'));
    if (others.every(envValue)) {
      // Each constant is edited once, however many properties use it.
      if (!edits.some((e) => e.file === file && e.start === value.start)) addEdit(file, value, 'warpdom', `${runner === 'vitest' ? 'environment' : 'testEnvironment'} (const ${name})`, runner);
    } else addManual(file, at, `${p.key} comes from \`${name}\` = '${value.value}' (line ${lineIndex(text).lineOf(value.start)}), which is also used for other things: change it by hand`, runner);
  }

  // package.json scripts: --environment jsdom, --env=jsdom, ...
  function scanScripts(pkg, text, a) {
    const { tokens } = a;
    for (const p of a.properties) {
      if (p.path.length !== 2 || p.path[0] !== 'scripts') continue;
      const t = tokens[p.valueStart];
      if (t?.type !== 'string') continue;
      const raw = text.slice(t.start + 1, t.end - 1);
      const re = /(--environment|--env|--testEnvironment|--test-environment)(=|\s+)(\\?["']?)(jsdom|happy-dom|jest-environment-jsdom|@happy-dom\/jest-environment|warpdom)\3(?=$|[\s"'\\;&|)])/g;
      for (const m of raw.matchAll(re)) {
        const segStart = Math.max(raw.lastIndexOf('&&', m.index), raw.lastIndexOf('||', m.index), raw.lastIndexOf(';', m.index), raw.lastIndexOf('|', m.index));
        const segEndCandidates = ['&&', '||', ';', '|'].map((s) => raw.indexOf(s, m.index)).filter((i) => i >= 0);
        const segment = raw.slice(segStart + 1, segEndCandidates.length ? Math.min(...segEndCandidates) : raw.length);
        const runner = /\bvitest\b/.test(segment) ? 'vitest' : /\b(jest|react-scripts|craco|react-app-rewired)\b/.test(segment) ? 'jest' : null;
        const offset = t.start + 1 + m.index + m[1].length + m[2].length + m[3].length;
        if (m[4] === 'warpdom') { if (runner) uses.push({ file: pkg.file, runner }); continue; }
        if (!runner) {
          addManual(pkg.file, offset, `script "${p.key}" passes ${m[1]} ${m[4]} to a command migrate does not know`, null);
          continue;
        }
        const token = { start: offset, end: offset + m[4].length, value: m[4], quote: '' };
        addEdit(pkg.file, token, 'warpdom', `script "${p.key}" (${m[1]})`, runner);
      }
    }
  }

  // --- per-file comments ---------------------------------------------------
  for (const f of scope) {
    if (!SCRIPT_EXTS.has(f.ext)) continue;
    const text = textOf(f.rel);
    if (text === null || !/@(vitest|jest)-environment\s/.test(text.slice(0, 8192))) continue;
    const comments = leadingComments(text);
    for (const c of comments) {
      for (const m of c.text.matchAll(/@(vitest|jest)-environment\s+([^\s*]+)/g)) {
        const value = m[2];
        const owner = ownerOf(f.rel);
        const runner = m[1] === 'vitest' ? 'vitest' : runnerOf(owner, 'jest') ?? 'jest';
        const start = c.start + m.index + m[0].length - value.length;
        if (value === 'warpdom') { uses.push({ file: f.rel, runner }); continue; }
        if (!ALL_DOM.has(value)) continue;
        addEdit(f.rel, { start, end: start + value.length, value, quote: '' }, 'warpdom', `@${m[1]}-environment comment`, runner);
      }
    }
  }

  // --- the texts after the edits -------------------------------------------
  const after = new Map();
  const applyAll = () => {
    const byFile = new Map();
    for (const e of edits) {
      if (!byFile.has(e.file)) byFile.set(e.file, []);
      byFile.get(e.file).push(e);
    }
    after.clear();
    for (const [file, list] of byFile) after.set(file, applyEdits(textOf(file), list));
  };
  applyAll();
  const finalText = (r) => (after.has(r) ? after.get(r) : textOf(r));

  // --- which package each change needs, and where it goes ---------------
  const domDeclared = (pkg) => [...REMOVABLE, ...OWN].some((n) => declared(pkg, n, ['dependencies', 'devDependencies']));
  const targetOf = (fileRel, runner) => {
    const chain = chainOf(ownerOf(fileRel));
    return chain.find(domDeclared) ?? chain.find((p) => declared(p, runner === 'jest' ? 'jest' : 'vitest') || (runner === 'jest' && declared(p, 'react-scripts'))) ?? chain[0];
  };
  const needs = new Map(); // pkg.rel -> { pkg, runners: Set, pathOnly }
  const need = (fileRel, runner, pathOnly = false) => {
    if (!runner) return;
    const pkg = targetOf(fileRel, runner);
    if (!needs.has(pkg.rel)) needs.set(pkg.rel, { pkg, runners: new Set(), warpdom: true });
    if (!pathOnly) needs.get(pkg.rel).runners.add(runner);
  };
  for (const e of edits) need(e.file, e.runner);
  for (const u of uses) if (!otherOf(u.file)) need(u.file, u.runner, u.pathOnly);
  const manualTargets = new Map();
  for (const m of manual) {
    const pkg = targetOf(m.file, m.runner ?? 'vitest');
    if (!manualTargets.has(pkg.rel)) manualTargets.set(pkg.rel, []);
    manualTargets.get(pkg.rel).push(`${m.file}:${m.line}`);
  }

  // --- who still imports the old packages ----------------------------------
  const importers = new Map(REMOVABLE.map((n) => [n, []]));
  const matchesName = (value, name) => value === name || value.startsWith(`${name}/`);
  for (const f of scope) {
    const text = finalText(f.rel);
    if (text === null || !/jsdom|happy-dom/.test(text)) continue;
    if (f.name === 'package.json') {
      let json;
      try { json = JSON.parse(text); } catch { continue; }
      const strings = [];
      const visit = (v, key) => {
        if (DEP_SECTIONS.includes(key)) return;
        if (typeof v === 'string') strings.push(v);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
      };
      visit(json, null);
      for (const name of REMOVABLE) {
        const re = DOM_ENVIRONMENTS.vitest.has(name)
          ? new RegExp(`(?:^|\\s)(?:-r|--require|--import|--loader)[\\s=]+['"]?${name}(?:/[\\w./-]*)?(?=$|[\\s'"])`)
          : new RegExp(`(?:^|[\\s'"=])${name.replace('/', '\\/')}(?:/[\\w./-]*)?(?=$|[\\s'"])`);
        if (strings.some((s) => re.test(s))) importers.get(name).push({ file: f.rel, line: null, how: 'package.json' });
      }
      continue;
    }
    if (!SCRIPT_EXTS.has(f.ext) && !['.vue', '.svelte', '.astro'].includes(f.ext) && !f.name.startsWith('.mocharc')) continue;
    if (!SCRIPT_EXTS.has(f.ext)) {
      for (const name of REMOVABLE) {
        const re = new RegExp(`['"\\s]${name.replace('/', '\\/')}(?:/[\\w./-]*)?['"\\s]`);
        if (re.test(text)) importers.get(name).push({ file: f.rel, line: null, how: 'mention' });
      }
      continue;
    }
    const { tokens } = tokenize(text);
    const { lineOf } = lineIndex(text);
    const specs = moduleSpecifiers(tokens);
    for (const name of REMOVABLE) {
      const hit = specs.find((s) => matchesName(s.value, name));
      if (hit) { importers.get(name).push({ file: f.rel, line: lineOf(tokens[hit.token].start), how: 'import' }); continue; }
      if (DOM_ENVIRONMENTS.vitest.has(name)) continue;
      const str = tokens.find((t) => (t.type === 'string' || t.type === 'template') && typeof t.value === 'string' && matchesName(t.value, name));
      if (str) importers.get(name).push({ file: f.rel, line: lineOf(str.start), how: 'string' });
    }
  }
  // The package whose declaration an import uses: the nearest declaring
  // one up the chain (else the root).
  const declaringFor = (fileRel, name) => chainOf(ownerOf(fileRel)).find((p) => declared(p, name)) ?? root;

  // --- dependency changes ----------------------------------------------------
  const info = registry ?? {};
  const latest = (name) => info[name]?.version ?? null;
  const localVersion = (name) => (name === 'warpdom' ? VERSION : ENVIRONMENT_PACKAGE_VERSION);
  const newer = (a, b) => {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };
  const versionOf = (name) => {
    const l = latest(name);
    return l && newer(l, localVersion(name)) ? l : localVersion(name);
  };
  result.versions = Object.fromEntries(OWN.map((n) => [n, versionOf(n)]));

  const pkgChanges = new Map(); // rel -> { pkg, sections: Map(section -> {remove, add}) }
  const change = (pkg, section) => {
    if (!pkgChanges.has(pkg.rel)) pkgChanges.set(pkg.rel, { pkg, sections: new Map() });
    const c = pkgChanges.get(pkg.rel);
    if (!c.sections.has(section)) c.sections.set(section, { remove: [], add: [] });
    return c.sections.get(section);
  };
  const catalogChanges = new Map(); // catalog name -> { remove: [], add: [] }
  const catalogNameOf = (spec) => (typeof spec === 'string' && spec.startsWith('catalog:') ? (spec.slice('catalog:'.length) || 'default') : null);

  // Removals first: what stays decides nothing else, but the catalog needs
  // to know which references remain.
  const removals = new Map(); // rel -> [{ name, section, spec }]
  for (const pkg of pkgs.values()) {
    if (!pkg.inScope) continue;
    for (const name of REMOVABLE) {
      for (const section of DEP_SECTIONS) {
        const spec = pkg.json[section]?.[name];
        if (spec === undefined) continue;
        const keep = (why) => result.kept.push({ package: pkg.file, name, section, reason: why });
        if (section === 'peerDependencies' || section === 'optionalDependencies') { keep(`listed in ${section}`); continue; }
        if (section === 'dependencies' && pkg.json.private !== true) { keep('a runtime dependency (dependencies) of a published package'); continue; }
        const users = importers.get(name).filter((u) => declaringFor(u.file, name) === pkg);
        if (users.length) {
          const where = users.slice(0, 3).map((u) => (u.line ? `${u.file}:${u.line}` : u.file)).join(', ');
          keep(`still used by ${where}${users.length > 3 ? ` and ${users.length - 3} more` : ''}`);
          continue;
        }
        if ((name !== 'global-jsdom' && name !== 'jsdom-global') && manualTargets.has(pkg.rel)) {
          keep(`kept until the manual item(s) at ${manualTargets.get(pkg.rel).slice(0, 3).join(', ')} are done`);
          continue;
        }
        if (!removals.has(pkg.rel)) removals.set(pkg.rel, []);
        removals.get(pkg.rel).push({ name, section, spec });
      }
    }
  }
  // Peers of kept packages stay too (global-jsdom needs jsdom), and so do
  // packages that installed dependencies of the package list as peers.
  for (const [relDir, list] of removals) {
    const pkg = pkgs.get(relDir);
    const keptHere = new Set(result.kept.filter((k) => k.package === pkg.file).map((k) => k.name));
    const stays = [];
    for (const r of list) {
      const by = [...keptHere].find((k) => PEERS[k]?.includes(r.name));
      if (by) { stays.push(r); result.kept.push({ package: pkg.file, name: r.name, section: r.section, reason: `peer dependency of ${by}, which stays` }); continue; }
      const deps = Object.keys({ ...pkg.json.dependencies, ...pkg.json.devDependencies }).filter((d) => !REMOVABLE.includes(d));
      for (const d of deps) {
        const dir = packageDir(pkg.dir, d);
        if (!dir) continue;
        let meta;
        try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
        if (meta.peerDependencies?.[r.name] && !meta.peerDependenciesMeta?.[r.name]?.optional) {
          stays.push(r);
          result.kept.push({ package: pkg.file, name: r.name, section: r.section, reason: `peer dependency of ${d}` });
          break;
        }
      }
    }
    removals.set(relDir, list.filter((r) => !stays.includes(r)));
  }
  for (const [relDir, list] of removals) {
    const pkg = pkgs.get(relDir);
    for (const r of list) {
      change(pkg, r.section).remove.push(r.name);
      const cat = catalogNameOf(r.spec);
      if (cat) {
        if (!catalogChanges.has(cat)) catalogChanges.set(cat, { remove: [], add: [] });
        catalogChanges.get(cat).remove.push(r.name);
      }
    }
  }
  // Additions, in the section (and with the version style) of the DOM
  // package they replace.
  for (const { pkg, runners, warpdom } of needs.values()) {
    const names = [...(warpdom ? ['warpdom'] : []), ...[...runners].sort().map((r) => ENVIRONMENT_PACKAGE[r])];
    const missing = names.filter((n) => !declared(pkg, n));
    if (!missing.length) continue;
    const model = [...REMOVABLE].map((n) => ({ n, s: declared(pkg, n, ['devDependencies', 'dependencies']) })).find((x) => x.s);
    const section = model?.s === 'dependencies' && pkg.json.private === true ? 'dependencies' : 'devDependencies';
    const modelSpec = model ? pkg.json[model.s][model.n] : null;
    const cat = catalogNameOf(modelSpec);
    const specs = Object.values(pkg.json[section] ?? {}).filter((s) => typeof s === 'string');
    const exact = modelSpec ? /^\d+\.\d+\.\d+/.test(modelSpec) : specs.length > 0 && specs.filter((s) => /^\d+\.\d+\.\d+/.test(s)).length > specs.length / 2;
    for (const name of missing) {
      const version = versionOf(name);
      const spec = cat ? modelSpec : exact ? version : `^${version}`;
      change(pkg, section).add.push({ name, spec });
      if (cat) {
        if (!catalogChanges.has(cat)) catalogChanges.set(cat, { remove: [], add: [] });
        catalogChanges.get(cat).add.push({ name, spec: exact ? version : `^${version}` });
      }
    }
  }
  // A catalog entry is removed only when no package refers to it any more.
  for (const [cat, c] of catalogChanges) {
    c.remove = c.remove.filter((name) => ![...pkgs.values()].some((p) => DEP_SECTIONS.some((s) => {
      const spec = p.json[s]?.[name];
      if (catalogNameOf(spec) !== cat) return false;
      const removedHere = pkgChanges.get(p.rel)?.sections.get(s)?.remove.includes(name);
      return !removedHere;
    })));
  }

  // --- the jsdom version warpdom follows ----------------------------------
  // warpdom behaves like the jsdom it finds installed (through
  // jest-environment-jsdom for Jest); removing it changes that to warpdom's
  // default. Reported, and with --keep-jsdom-version written into the
  // config next to the environment.
  const sameAsDefault = (runner, version) => {
    const [major, minor = Infinity, patch = Infinity] = String(version).split('.').map(Number);
    if (runner === 'jest') return major === 26;
    return major > 30 || (major === 30 && (minor > 1 || (minor === 1 && patch >= 2)));
  };
  // ^26.0.0 -> 26 (the newest 26.x a fresh install gets), ~26.1.0 -> 26.1.
  const fromSpec = (spec) => {
    const m = /^([~^]?)(\d+)\.(\d+)\.(\d+)/.exec(String(spec));
    if (!m) return null;
    return m[1] === '^' ? m[2] : m[1] === '~' ? `${m[2]}.${m[3]}` : `${m[2]}.${m[3]}.${m[4]}`;
  };
  const pins = new Map(); // pkg.rel -> { runner, version }
  for (const [relDir, list] of removals) {
    const pkg = pkgs.get(relDir);
    const runners = needs.get(relDir)?.runners ?? new Set();
    for (const r of list) {
      let version = null;
      let runner = null;
      let source = null;
      if (r.name === 'jsdom' && (runners.has('vitest') || !runners.has('jest'))) {
        runner = 'vitest';
        const used = usedVersion(pkg, 'jsdom', r.spec);
        version = used.how === 'declared' ? fromSpec(used.version) : used.version;
        source = used.how === 'declared' ? `declared ${r.spec}` : used.how;
      } else if (r.name === 'jest-environment-jsdom') {
        runner = 'jest';
        const used = usedVersion(pkg, 'jest-environment-jsdom', r.spec);
        const envDir = packageDir(pkg.dir, 'jest-environment-jsdom');
        version = (envDir ? packageVersion(envDir, 'jsdom') : null)
          ?? (used.how !== 'declared' ? dependencyVersion(lock, 'jest-environment-jsdom', used.version, 'jsdom') : null)
          ?? JEST_ENV_JSDOM[majorOf(used.version)] ?? null;
        source = `through jest-environment-jsdom ${used.version}`;
      } else if (r.name === 'happy-dom' || r.name === '@happy-dom/jest-environment') {
        result.profile.push(`${pkg.file}: these tests ran on happy-dom; warpdom behaves like jsdom, so run \`npx warpdom compare --baseline happy-dom\` before applying to see what changes.`);
        continue;
      } else continue;
      if (!version || sameAsDefault(runner, version)) continue;
      const option = runner === 'vitest' ? `environmentOptions: { warpdom: { jsdom: '${version}' } }` : `testEnvironmentOptions: { jsdom: '${version}' }`;
      const base = `${pkg.file}: warpdom follows the jsdom it finds installed, here jsdom ${version} (${source}); without it, it follows jsdom ${DEFAULT_PROFILE[runner]}`;
      if (keepJsdomVersion) {
        pins.set(relDir, { runner, version, base, option });
      } else {
        result.profile.push(`${base}. To keep jsdom ${version}'s behavior, add ${option} to the config (--no-keep-jsdom-version left it out).`);
      }
    }
  }
  if (pins.size) {
    const pinned = new Set();
    const why = (pin, where) => `${where}: pinned jsdom ${pin.version} (${pin.runner === 'vitest' ? 'environmentOptions.warpdom.jsdom' : 'testEnvironmentOptions.jsdom'}), because warpdom follows the installed jsdom and, once it is removed, would follow jsdom ${DEFAULT_PROFILE[pin.runner]}; this keeps the tests' current behavior (${pin.base.split(': ')[0]})`;
    for (const e of [...edits]) {
      if (!e.meta || (e.kind !== 'environment' && e.kind !== 'testEnvironment')) continue;
      const pkg = targetOf(e.file, e.runner);
      const pin = pins.get(pkg.rel);
      if (!pin || pin.runner !== e.runner) continue;
      const { prop, a, text } = e.meta;
      const json = e.file.endsWith('.json');
      const q = json ? '"' : a.tokens.find((t) => t.start === e.start)?.quote ?? "'";
      const k = (name) => (json ? `"${name}"` : name);
      const jsdomProp = `${k('jsdom')}: ${q}${pin.version}${q}`;
      const optionKey = e.runner === 'vitest' ? 'environmentOptions' : 'testEnvironmentOptions';
      const where = `${e.file}:${e.line}`;
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      const lineOf = (offset) => lineIndex(text).lineOf(offset);
      // An options object already there: the version goes inside it.
      const existing = a.properties.find((x) => x.frame === prop.frame && x.key === optionKey);
      if (existing) {
        let obj = a.objects.find((o) => o.open === existing.valueStart);
        let insertText = e.runner === 'vitest' ? `${k('warpdom')}: { ${jsdomProp} }` : jsdomProp;
        if (obj && e.runner === 'vitest') {
          const w = a.properties.find((x) => x.frame === obj && x.key === 'warpdom');
          if (w) { obj = a.objects.find((o) => o.open === w.valueStart); insertText = jsdomProp; }
        }
        if (!obj || a.properties.some((x) => x.frame === obj && x.key === 'jsdom')) {
          result.profile.push(`${pin.base}. ${where}: ${optionKey} is not an object literal or already names a jsdom version; check that it says ${pin.version}.`);
          pinned.add(pkg.rel);
          continue;
        }
        const first = a.properties.find((x) => x.frame === obj);
        const open = a.tokens[obj.open];
        let insert;
        let line;
        if (first && lineOf(a.tokens[first.keyToken].start) > lineOf(open.start)) {
          const keyTok = a.tokens[first.keyToken];
          const begin = text.lastIndexOf('\n', keyTok.start - 1) + 1;
          insert = { start: begin, end: begin, text: `${text.slice(begin, keyTok.start)}${insertText},${eol}` };
          line = lineOf(keyTok.start);
        } else {
          insert = { start: open.end, end: open.end, text: first ? ` ${insertText},` : ` ${insertText} ` };
          line = lineOf(open.start);
        }
        edits.push({ file: e.file, ...insert, kind: optionKey, runner: e.runner, from: null, to: pin.version, line, pin: true, inline: !insert.text.endsWith(eol) });
        result.profile.push(why(pin, `${e.file}:${line}`));
        pinned.add(pkg.rel);
        continue;
      }
      const keyTok = a.tokens[prop.keyToken];
      const lineBegin = text.lastIndexOf('\n', keyTok.start - 1) + 1;
      const indent = text.slice(lineBegin, keyTok.start);
      const value = e.runner === 'vitest' ? `{ ${k('warpdom')}: { ${jsdomProp} } }` : `{ ${jsdomProp} }`;
      const next = a.tokens[prop.valueEnd];
      const lastValue = a.tokens[prop.valueEnd - 1];
      if (!/^[ \t]*$/.test(indent)) {
        // The environment shares its line: the option goes right after it.
        edits.push({ file: e.file, start: lastValue.end, end: lastValue.end, text: `, ${k(optionKey)}: ${value}`, kind: optionKey, runner: e.runner, from: null, to: pin.version, line: e.line, pin: true, inline: true });
        result.profile.push(why(pin, where));
        pinned.add(pkg.rel);
        continue;
      }
      const insert = next?.value === ','
        ? { start: next.end, end: next.end, text: `${eol}${indent}${k(optionKey)}: ${value},` }
        : { start: lastValue.end, end: lastValue.end, text: `,${eol}${indent}${k(optionKey)}: ${value}` };
      edits.push({ file: e.file, ...insert, kind: optionKey, runner: e.runner, from: null, to: pin.version, line: e.line + 1, pin: true });
      result.profile.push(why(pin, `${e.file}:${e.line + 1}`));
      pinned.add(pkg.rel);
    }
    for (const [relDir, pin] of pins) {
      if (!pinned.has(relDir)) result.profile.push(`${pin.base}. No environment literal in a config to put it next to: add ${pin.option} by hand to keep jsdom ${pin.version}'s behavior.`);
    }
    applyAll();
  }
  // @types/jsdom outlives jsdom only as type definitions.
  for (const [relDir, list] of removals) {
    const pkg = pkgs.get(relDir);
    if (list.some((r) => r.name === 'jsdom') && declared(pkg, '@types/jsdom')) {
      result.kept.push({ package: pkg.file, name: '@types/jsdom', section: declared(pkg, '@types/jsdom'), reason: 'type definitions of jsdom: it can go once no code imports jsdom types and no tsconfig "types" list names jsdom' });
    }
  }
  result.profile = unique(result.profile);

  // --- package.json and catalog texts ---------------------------------------
  const finalTexts = new Map(after);
  for (const { pkg, sections } of pkgChanges.values()) {
    let text = finalTexts.get(pkg.file) ?? textOf(pkg.file);
    for (const [section, c] of sections) {
      const next = editDependencies(text, section, c);
      if (next === null) {
        manual.push({ file: pkg.file, line: null, reason: `${section} is not one entry per line; ${c.remove.length ? `remove ${c.remove.join(', ')} and ` : ''}add ${c.add.map((d) => `"${d.name}": "${d.spec}"`).join(', ')} by hand` });
        continue;
      }
      text = next;
      result.dependencies.push({ package: pkg.file, section, remove: c.remove.map((name) => ({ name, spec: pkg.json[section][name] })), add: c.add });
    }
    finalTexts.set(pkg.file, text);
  }
  if (catalogChanges.size) {
    const file = path.join(pmRoot, 'pnpm-workspace.yaml');
    const fileRel = rel(file);
    let text = readText(file);
    for (const [cat, c] of catalogChanges) {
      if (text === null) { manual.push({ file: fileRel, line: null, reason: `the "${cat}" catalog was not found: add ${c.add.map((d) => d.name).join(', ')} to it` }); continue; }
      const present = catalogEntries(text, cat);
      const next = editCatalog(text, cat, c);
      if (next === null || !present) { manual.push({ file: fileRel, line: null, reason: `the "${cat}" catalog was not found: add ${c.add.map((d) => `${d.name}: ${d.spec}`).join(', ')}` }); continue; }
      if (next !== text) result.catalog.push({ file: fileRel, catalog: cat, remove: c.remove, add: c.add.filter((d) => !present.entries.some((e) => e.name === d.name)) });
      text = next;
    }
    if (text !== null && text !== readText(file)) {
      finalTexts.set(fileRel, text);
      texts.set(fileRel, readText(file));
    }
  }

  // --- the report ------------------------------------------------------------
  // Lines a pinned jsdom version inserted before an edit move it down.
  const shift = (e) => edits.filter((x) => x.file === e.file && x.pin && !x.inline && x !== e && x.start < e.start).length;
  result.edits = edits.map((e) => ({
    file: e.file, line: e.line, kind: e.kind, runner: e.runner, from: e.from, to: e.to,
    before: e.pin && !e.inline ? '' : lineIndex(textOf(e.file)).lineText(e.line).trim(),
    // The text after the environment edits only (dependency edits move lines).
    after: lineIndex(after.get(e.file)).lineText(e.pin ? e.line : e.line + shift(e)).trim(),
  })).sort((x, y) => (x.file === y.file ? x.line - y.line : x.file < y.file ? -1 : 1));
  result.manual = manual.sort((x, y) => (x.file === y.file ? (x.line ?? 0) - (y.line ?? 0) : x.file < y.file ? -1 : 1));
  result.otherProjects = result.otherProjects.filter((o) => o.uses.length);
  result.install = result.dependencies.length || result.catalog.length ? installCommand(pm.name) : null;

  // Mentions of jsdom / happy-dom that migrate leaves alone.
  const editedLines = new Set(edits.filter((e) => !e.pin).map((e) => `${e.file}:${e.line}`));
  const optionHints = new Map(optionNotes.map((o) => [`${o.file}:${o.line}`, o.hint]));
  for (const f of scope) {
    if (f.size > 512 * 1024 || /^(CHANGELOG|HISTORY|CHANGES)/i.test(f.name) || ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock'].includes(f.name)) continue;
    const text = textOf(f.rel);
    if (text === null || !MENTION.test(text)) continue;
    const lines = text.split(/\r?\n/);
    const isPkg = f.name === 'package.json';
    const isCatalog = f.name === 'pnpm-workspace.yaml';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!MENTION.test(line) || editedLines.has(`${f.rel}:${i + 1}`)) continue;
      if ((isPkg || isCatalog) && /^\s*['"]?(@happy-dom\/jest-environment|@types\/jsdom|jest-environment-jsdom|jsdom|happy-dom|global-jsdom|jsdom-global)['"]?\s*:/.test(line)) continue;
      const option = optionHints.get(`${f.rel}:${i + 1}`);
      const { category, hint } = option ? { category: 'config', hint: option } : classifyMention(f, line, setupFiles.has(f.rel), configs.has(f.rel));
      result.mentions.push({ file: f.rel, line: i + 1, text: line.trim().slice(0, 160), category, hint });
    }
  }
  for (const o of optionNotes) {
    if (!result.mentions.some((m) => m.file === o.file && m.line === o.line)) result.mentions.push({ file: o.file, line: o.line, text: lineIndex(textOf(o.file)).lineText(o.line).trim(), category: 'config', hint: o.hint });
  }
  result.mentions.sort((x, y) => (MENTION_ORDER.indexOf(x.category) - MENTION_ORDER.indexOf(y.category))
    || (x.file === y.file ? x.line - y.line : x.file < y.file ? -1 : 1));

  // Where jsdom stays in the install without being a direct dependency.
  const removedNames = unique(result.dependencies.flatMap((d) => d.remove.map((r) => r.name)));
  if (removedNames.length || edits.length) {
    for (const r of result.runners) {
      if (r.name === 'vitest') result.transitive.push('Vitest lists jsdom and happy-dom as optional peer dependencies: nothing installs them once the project does not list them.');
      if (r.name === 'jest' && majorOf(r.version) === 27) result.transitive.push("Jest 27's jest-config and jest-runner depend on jest-environment-jsdom (and so on jsdom): they stay installed, but nothing loads them once no config or comment names jsdom.");
    }
  }
  if (removedNames.length && lock.kind) {
    // Parts of the removed packages themselves, and Jest 27 (said above).
    const own = /^(vitest|jest-config|jest-runner|@jest\/environment-jsdom-abstract|@types\/jsdom)@/;
    for (const [name, set] of dependents(lock, removedNames)) {
      const by = [...set].filter((d) => !REMOVABLE.some((n) => d.startsWith(`${n}@`)) && !own.test(d));
      if (by.length) result.transitive.push(`${name} stays in ${pm.lockfile} as a dependency of ${by.slice(0, 4).join(', ')}${by.length > 4 ? ` and ${by.length - 4} more` : ''}; that is fine as long as no test environment loads it.`);
    }
  }
  result.transitive = unique(result.transitive);

  result.changedFiles = [...finalTexts.keys()].filter((f) => finalTexts.get(f) !== readText(path.resolve(cwd, f))).sort();
  return { finalTexts };
}

// The workspace root dir belongs to (dir itself when it is not a package
// of a workspace above it).
function workspaceRootOf(dir) {
  const above = workspaceRootAbove(dir);
  return above && workspaces(above).dirs.includes(dir) ? above : dir;
}


// What a line that mentions jsdom probably is, most actionable first.
export const MENTION_ORDER = ['setup', 'config', 'console', 'import', 'code', 'test', 'ci', 'docs'];
function classifyMention(f, line, isSetup, isConfig) {
  const docs = f.ext === '.md' || f.ext === '.mdx';
  const ci = f.rel.startsWith('.github/') || f.ext === '.yml' || f.ext === '.yaml';
  const test = TEST_FILE.test(f.rel);
  const category = isSetup ? 'setup' : isConfig ? 'config' : docs ? 'docs' : ci ? 'ci' : test ? 'test' : 'code';
  if (docs || ci) return { category, hint: docs ? 'docs mention jsdom' : 'CI or tool config mentions jsdom' };
  if (/["']types["']\s*:/.test(line) && /["']jsdom["']/.test(line)) return { category: 'config', hint: 'tsconfig loads @types/jsdom: drop "jsdom" here if you remove @types/jsdom' };
  if (/\b(jsdom|happyDom)\s*:\s*(true|false)\b/i.test(line)) return { category: isConfig ? 'config' : category, hint: 'a jsdom flag of a shared config or helper: the environment it chooses is set where that is defined (migrate changes it there when it is a literal)' };
  if (/\b(require|import)\b.*['"](jsdom|happy-dom|global-jsdom|jsdom-global)['"/]/.test(line)) return { category: 'import', hint: 'uses jsdom or happy-dom directly (so it stays a dependency)' };
  if (/console\.(error|warn)|Not implemented|Could not parse CSS|virtualConsole/i.test(line)) return { category: 'console', hint: 'console filter for jsdom messages: warpdom prints "Not implemented: ..." as jsdom does; check whether the filter is still needed' };
  if (/\bis_?jsdom\b|\bisJSDOM\b|\bisJsDom\b/i.test(line)) return { category, hint: "jsdom check (an isJsdom-style helper): see how it detects jsdom; warpdom's navigator.userAgent contains 'jsdom/' like jsdom's, so a user-agent check still answers yes" };
  if (/userAgent/i.test(line)) return { category, hint: "user agent check: warpdom's navigator.userAgent contains 'jsdom/' like jsdom's, so this keeps matching" };
  if (isSetup) return { category, hint: 'setup file: a jsdom-only workaround or polyfill? check whether warpdom still needs it' };
  if (test) return { category, hint: 'test mentions jsdom: a jsdom-only skip, workaround or expectation? check it on warpdom' };
  if (isConfig) return { category, hint: 'config mentions jsdom: check whether it still applies' };
  if (/polyfill|mock|shim|setup/i.test(f.rel)) return { category: 'setup', hint: 'jsdom-only workaround? check with warpdom' };
  return { category, hint: 'mentions jsdom: check whether it still applies on warpdom' };
}

// Publication dates against release-age settings.
async function releaseAges(result, { now, registry, offline }) {
  if (result.error) return;
  const pmRoot = workspaceRootOf(result.cwd);
  const settings = releaseAgeSettings(pmRoot);
  const added = unique([...result.dependencies.flatMap((d) => d.add.map((a) => a.name)), ...result.catalog.flatMap((c) => c.add.map((a) => a.name))]);
  if (!settings.length || !added.length) return;
  const info = registry;
  for (const s of settings) {
    for (const name of added) {
      const version = result.versions[name];
      if (excludedBy(s.exclude, name)) {
        result.releaseAge.push({ ...s, name, version, status: 'excluded', message: `${name} is excluded from ${s.setting} (${s.file})` });
        continue;
      }
      const published = info?.[name]?.version === version ? info[name].time : null;
      if (s.before) {
        const cutoff = Date.parse(s.before);
        const ok = published && Date.parse(published) <= cutoff;
        result.releaseAge.push({ ...s, name, version, status: ok ? 'ok' : 'blocked', message: ok ? `${name} ${version} is older than before=${s.before}` : `${s.file} sets before=${s.before}: npm installs nothing published after it${published ? `; ${name} ${version} was published ${published.slice(0, 10)}` : ''}` });
        continue;
      }
      const label = `${s.setting} ${Math.round(s.minutes)} min${s.minutes >= 1440 ? ` (${+(s.minutes / 1440).toFixed(1)} day${s.minutes === 1440 ? '' : 's'})` : ''} in ${s.file}`;
      if (!published) {
        result.releaseAge.push({ ...s, name, version, status: 'unknown', message: `${s.manager} ${label}: could not read when ${name} ${version} was published${offline ? ' (offline)' : ''}; if it is younger, ${s.manager} will not install it` + (s.excludeSetting ? ` (or add ${name} to ${s.excludeSetting})` : '') });
        continue;
      }
      const okAt = Date.parse(published) + s.minutes * 60_000;
      const when = new Date(okAt).toISOString().replace(/:\d\d\.\d+Z$/, 'Z').replace('T', ' ');
      if (okAt > now) {
        result.releaseAge.push({ ...s, name, version, published, okAt: new Date(okAt).toISOString(), status: 'too-new', message: `${s.manager} ${label}: ${name} ${version} was published ${published.slice(0, 16).replace('T', ' ')}Z and can be installed from ${when}; install after that${s.excludeSetting ? `, or add ${name} to ${s.excludeSetting}` : ''}` });
        result.warnings.push(`${name} ${version} is younger than ${s.setting} (${s.file}): ${s.manager} installs it from ${when}`);
      } else {
        result.releaseAge.push({ ...s, name, version, published, okAt: new Date(okAt).toISOString(), status: 'ok', message: `${name} ${version} is older than ${s.setting} (published ${published.slice(0, 10)})` });
      }
    }
  }
}
