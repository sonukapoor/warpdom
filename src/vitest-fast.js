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
// (`warpdom vitest run`), which also runs files that fail without
// isolation again, isolated, so a newly leaking file never shows a false
// failure. Without the CLI the helper uses what the file says.
//
// Node only (Vitest integration), like ./vitest.js.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults } from 'vitest/config';

export const CACHE_FILE = '.warpdom/fast-mode.json';
export const isolatedName = (name) => `${name} (isolated)`;
const RESET = fileURLToPath(new URL('./vitest-reset.js', import.meta.url));
// Vitest resolves an environment name as the package vitest-environment-<name>
// or a path, so 'warpdom' becomes the path of warpdom's environment.
const ENVIRONMENT = fileURLToPath(new URL('./vitest.js', import.meta.url));
const named = (test) => (test?.environment === 'warpdom' ? { ...test, environment: ENVIRONMENT } : test);
function withEnvironmentPath(config) {
  const uses = (t) => t?.environment === 'warpdom';
  const projects = config?.test?.projects;
  if (!uses(config?.test) && !(Array.isArray(projects) && projects.some((p) => uses(p?.test)))) return config;
  const test = { ...named(config.test) };
  if (Array.isArray(projects)) test.projects = projects.map((p) => (p && typeof p === 'object' && uses(p.test) ? { ...p, test: named(p.test) } : p));
  return { ...config, test };
}

export function readCache(file = CACHE_FILE) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// This run's mode and leaky files (absolute): set by the CLI through the
// environment, else from the cache file. Modes: 'split' (leaky files
// isolated, the rest fast), 'fast' (nothing isolated: for learning) and
// 'isolated' (Vitest as configured). WARPDOM_FAST_RERUN: only the isolated
// project (the CLI's safety net).
function runSettings(cacheFile) {
  const cache = readCache(cacheFile);
  const mode = process.env.WARPDOM_FAST_MODE ?? cache?.mode ?? 'isolated';
  let extra = [];
  try { extra = JSON.parse(process.env.WARPDOM_FAST_ISOLATE ?? '[]'); } catch { extra = []; }
  const leaky = mode === 'fast' ? [] : [...new Set([...(cache?.leaky ?? []), ...extra])].map((f) => resolve(f));
  return { mode, leaky, rerun: process.env.WARPDOM_FAST_RERUN === '1' };
}

function transform(original, { cache, project }) {
  const config = withEnvironmentPath(original);
  const { mode, leaky, rerun } = runSettings(cache);
  if (mode === 'isolated') return config;
  const test = config.test ?? {};
  const rootSetup = list(test.setupFiles);
  const projects = test.projects ?? null;
  let index = -1;
  if (projects) {
    index = project === undefined && projects.length === 1 ? 0 : projects.findIndex((p) => typeof p === 'object' && p.test?.name === project);
    if (index < 0) throw new Error(`warpdom fast mode: name the project to run fast: withFastMode(config, { project: '<name>' })${project ? ` (no project named '${project}')` : ''}.`);
    if (rootSetup.length && projects.some((p) => typeof p !== 'object')) {
      throw new Error('warpdom fast mode: with root setupFiles, projects must be inline objects (the setup files move into each project).');
    }
  }
  const target = projects ? projects[index] : { extends: true, test: {} };
  const name = target.test?.name ?? 'warpdom';
  // Root setup files move into each project, so warpdom's reset runs before
  // all of a fast file's setup (it removes window properties added since
  // the window was created).
  const withRootSetup = (p) => (typeof p === 'object' && p.extends !== false ? [...rootSetup, ...list(p.test?.setupFiles)] : list(p.test?.setupFiles));
  const setup = withRootSetup(target);
  const fast = {
    ...target,
    test: {
      ...target.test,
      name,
      isolate: false,
      setupFiles: [RESET, ...setup],
      exclude: [...(target.test?.exclude ?? test.exclude ?? configDefaults.exclude), ...leaky],
    },
  };
  const isolated = { ...target, test: { ...target.test, name: isolatedName(name), isolate: true, setupFiles: setup, include: leaky } };
  const others = (projects ?? []).filter((_, i) => i !== index)
    .map((p) => (typeof p === 'object' ? { ...p, test: { ...p.test, setupFiles: withRootSetup(p) } } : p));
  const result = rerun ? [isolated] : [...others, fast, ...(leaky.length ? [isolated] : [])];
  return { ...config, test: { ...test, setupFiles: [], projects: result } };
}

// Returns the Vitest config with the fast and isolated projects, or the
// config unchanged when isolated runs were measured to be faster (or
// nothing has been learned yet).
export function withFastMode(config = {}, { cache = CACHE_FILE, project } = {}) {
  if (typeof config?.then === 'function') return config.then((c) => withFastMode(c, { cache, project }));
  if (typeof config === 'function') {
    return (env) => {
      const c = config(env);
      return typeof c?.then === 'function' ? c.then((v) => transform(v, { cache, project })) : transform(c, { cache, project });
    };
  }
  return transform(config, { cache, project });
}
