// Fast mode for Vitest with warpdom: test files run without isolation,
// with warpdom's per-file reset (warpdom/vitest/reset), except the files
// known to leak state between files, which run isolated. One Vitest
// project becomes two in the same run: `<name>` (fast) and
// `<name> (isolated)`.
//
//   // vitest.config.ts
//   import { defineConfig } from 'vitest/config'
//   import { withFastMode } from 'warpdom/vitest/fast'
//   export default defineConfig(withFastMode({ test: { environment: 'warpdom' } }))
//
// With test.projects, name the one to split: withFastMode(config,
// { project: 'unit' }). Config functions and promises are wrapped too.
//
// Which files leak, and whether the split is faster than isolated runs at
// all, is learned and kept in .warpdom/fast-mode.json by the warpdom CLI
// (`warpdom vitest run`, ./vitest-fast-cli.js), which also runs files that
// fail without isolation again, isolated, so a newly leaking file never
// shows a false failure. Without the CLI the helper uses what the file says.
//
// Node only (Vitest integration), like ./vitest.js.
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults } from 'vitest/config';
import { CACHE_FILE, isolatedName, readCache } from './vitest-fast-state.js';

export { CACHE_FILE, isolatedName, readCache };
const RESET = fileURLToPath(new URL('./vitest-reset.js', import.meta.url));
// The CLI's reporter (./vitest-fast-reporter.js): added when the CLI asks
// for a report (WARPDOM_FAST_REPORT, the file it writes).
export const REPORTER = fileURLToPath(new URL('./vitest-fast-reporter.js', import.meta.url));
// Vitest resolves an environment name as the package vitest-environment-<name>
// or a path, so 'warpdom' becomes the path of warpdom's environment.
const ENVIRONMENT = fileURLToPath(new URL('./vitest.js', import.meta.url));
const named = (test) => (test?.environment === 'warpdom' ? { ...test, environment: ENVIRONMENT } : test);
// An environment path in Vite's /@fs/ form, for test files that share a
// worker (isolate: false, and vmThreads). Vitest 3 (measured: 3.0.9,
// 3.2.4) caches the environment's module loader per root together with
// the first file's RPC channel; for a path outside the Vite root the next
// file's load asks that stale channel to resolve the path, and the worker
// waits for an answer that never comes (60 s per call, then the run
// hangs). A /@fs/ id needs no resolving, so the cached module is reused.
// Vitest 1.2 to 5.0 accept it, isolated or not.
export const fsId = (path) => {
  if (typeof path !== 'string' || path.startsWith('/@fs/') || !isAbsolute(path)) return path;
  const p = path.replace(/\\/g, '/');
  return `/@fs${p.startsWith('/') ? '' : '/'}${p}`;
};
function withEnvironmentPath(config) {
  const uses = (t) => t?.environment === 'warpdom';
  const projects = config?.test?.projects;
  if (!uses(config?.test) && !(Array.isArray(projects) && projects.some((p) => uses(p?.test)))) return config;
  const test = { ...named(config.test) };
  if (Array.isArray(projects))
    test.projects = projects.map((p) =>
      p && typeof p === 'object' && uses(p.test) ? { ...p, test: named(p.test) } : p,
    );
  return { ...config, test };
}

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// This run's mode and isolated files (absolute): set by the CLI through the
// environment, else from the cache file. Modes: 'split' (the files to
// isolate isolated, the rest fast), 'fast' (nothing isolated: for
// learning) and 'isolated' (Vitest as configured). WARPDOM_FAST_RERUN:
// only the isolated project, with only WARPDOM_FAST_ISOLATE's files (the
// CLI's safety net).
function runSettings(cacheFile) {
  const cache = readCache(cacheFile);
  const mode = process.env.WARPDOM_FAST_MODE ?? cache?.mode ?? 'isolated';
  let extra = [];
  try {
    extra = JSON.parse(process.env.WARPDOM_FAST_ISOLATE ?? '[]');
  } catch {
    extra = [];
  }
  const rerun = process.env.WARPDOM_FAST_RERUN === '1';
  // A rerun runs exactly the files it names.
  const files = mode === 'fast' ? [] : rerun ? extra : [...(cache?.isolate ?? []), ...extra];
  return { mode, isolate: [...new Set(files.map((f) => resolve(f)))], rerun };
}

// The CLI's reporter, after the configured ones (or Vitest's defaults),
// when the CLI asks for a report and does not pass it as an argument
// (it does when the arguments name reporters, which replace the config's).
function withReporter(test) {
  if (!process.env.WARPDOM_FAST_REPORT || process.env.WARPDOM_FAST_REPORTER === 'cli') return test;
  const own =
    test.reporters == null
      ? ['default', ...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions'] : [])]
      : list(test.reporters);
  return { ...test, reporters: [...own, REPORTER] };
}

// Root-level command-line options a project does not get from Vitest. It
// passes only a few (isolate, pool, retry, testTimeout, ...) to the
// projects in test.projects; the rest apply to the root project, which
// the split replaces. Without this, `--typecheck.enabled=false` left
// typecheck on in the split's projects, and their run had type tests the
// project's own run does not have. Read from the Vitest process's
// arguments (Vitest's own parser) in a config hook of the generated
// projects, so they run exactly the root project's files and tests.
export const PROJECT_CLI_OPTIONS = [
  'typecheck',
  'environment',
  'dir',
  'hookTimeout',
  'teardownTimeout',
  'maxConcurrency',
  'silent',
  'clearMocks',
  'mockReset',
  'restoreMocks',
  'unstubEnvs',
  'unstubGlobals',
  'css',
  'deps',
  'server',
  'slowTestThreshold',
  'includeTaskLocation',
  'chaiConfig',
  'diff',
  'expect',
];
export function projectCliOptions(options, { fast = false } = {}) {
  const out = {};
  for (const key of PROJECT_CLI_OPTIONS) if (options?.[key] !== undefined) out[key] = options[key];
  if (out.environment === 'warpdom') out.environment = ENVIRONMENT;
  if (fast && out.environment) out.environment = fsId(out.environment);
  return out;
}
const cliOptionsPlugin = (fast) => ({
  name: 'warpdom:fast-mode-cli-options',
  async config() {
    try {
      const { parseCLI } = await import('vitest/node');
      const { options } = parseCLI(['vitest', ...process.argv.slice(2)]);
      const test = projectCliOptions(options, { fast });
      // Type tests run once, in the fast project.
      if (!fast) delete test.typecheck;
      return Object.keys(test).length ? { test } : {};
    } catch {
      return {};
    }
  },
});

function transform(original, { cache, project }) {
  const config = withEnvironmentPath(original);
  const { mode, isolate, rerun } = runSettings(cache);
  if (mode === 'isolated') {
    if (!process.env.WARPDOM_FAST_REPORT || process.env.WARPDOM_FAST_REPORTER === 'cli') return config;
    return { ...config, test: withReporter(config.test ?? {}) };
  }
  const test = config.test ?? {};
  const rootSetup = list(test.setupFiles);
  const projects = test.projects ?? null;
  let index = -1;
  if (projects) {
    index =
      project === undefined && projects.length === 1
        ? 0
        : projects.findIndex((p) => typeof p === 'object' && p.test?.name === project);
    if (index < 0)
      throw new Error(
        `warpdom fast mode: name the project to run fast: withFastMode(config, { project: '<name>' })${project ? ` (no project named '${project}')` : ''}.`,
      );
    if (rootSetup.length && projects.some((p) => typeof p !== 'object')) {
      throw new Error(
        'warpdom fast mode: with root setupFiles, projects must be inline objects (the setup files move into each project).',
      );
    }
  }
  // Without test.projects the split stands for the root project, so it gets
  // the root's command-line options (cliOptionsPlugin).
  const target = projects ? projects[index] : { extends: true, test: {} };
  const plugins = (fast) => (projects ? list(target.plugins) : [...list(target.plugins), cliOptionsPlugin(fast)]);
  const name = target.test?.name ?? 'warpdom';
  // Root setup files move into each project, so warpdom's reset runs before
  // all of a fast file's setup (it removes the global's properties a
  // previous file's tests added, keeping those of its setup and modules).
  const withRootSetup = (p) =>
    typeof p === 'object' && p.extends !== false
      ? [...rootSetup, ...list(p.test?.setupFiles)]
      : list(p.test?.setupFiles);
  const setup = withRootSetup(target);
  const environment = target.test?.environment ?? (target.extends ? test.environment : undefined);
  // A project that extends the config file gets the root's include merged
  // with its own (arrays concatenate), so the isolated project would run
  // every file: the root include moves into the projects instead.
  const includeOf = (p) => p.test?.include ?? (p.extends ? test.include : undefined);
  const withInclude = (p) => (includeOf(p) ? { include: includeOf(p) } : {});
  const fast = {
    ...target,
    plugins: plugins(true),
    test: {
      ...target.test,
      name,
      isolate: false,
      ...(environment ? { environment: fsId(environment) } : {}),
      ...withInclude(target),
      setupFiles: [RESET, ...setup],
      exclude: [...(target.test?.exclude ?? test.exclude ?? configDefaults.exclude), ...isolate],
    },
  };
  // Type tests (typecheck) run once, in the fast project.
  const isolated = {
    ...target,
    plugins: plugins(false),
    test: {
      ...target.test,
      name: isolatedName(name),
      isolate: true,
      setupFiles: setup,
      include: isolate,
      typecheck: { ...target.test?.typecheck, enabled: false },
    },
  };
  const others = (projects ?? [])
    .filter((_, i) => i !== index)
    .map((p) =>
      typeof p === 'object' ? { ...p, test: { ...p.test, ...withInclude(p), setupFiles: withRootSetup(p) } } : p,
    );
  const result = rerun ? [isolated] : [...others, fast, ...(isolate.length ? [isolated] : [])];
  const { include: _rootInclude, ...rootTest } = withReporter(test);
  return { ...config, test: { ...rootTest, setupFiles: [], projects: result } };
}

// Returns the Vitest config with the fast and isolated projects, or the
// config unchanged when isolated runs were measured to be faster (or
// nothing has been learned yet).
export function withFastMode(config = {}, { cache = CACHE_FILE, project } = {}) {
  if (typeof config?.then === 'function') return config.then((c) => withFastMode(c, { cache, project }));
  if (typeof config === 'function') {
    return (env) => {
      const c = config(env);
      return typeof c?.then === 'function'
        ? c.then((v) => transform(v, { cache, project }))
        : transform(c, { cache, project });
    };
  }
  return transform(config, { cache, project });
}
