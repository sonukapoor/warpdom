// Detection for `warpdom compare` (Node only): the runner, its config and
// binary, the installed warpdom, versions, per-file environment comments.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isWarpdomEnvironment } from './wrappers.js';

const CONFIG_EXTS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];
const VITEST_CONFIGS = ['vitest.config', 'vite.config'];
const VITEST_WORKSPACES = ['vitest.workspace', 'vitest.projects'];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// The runner's own config lookup order in a directory. Vitest: vitest.config.*,
// then vite.config.* (a vitest.workspace.* is found by findVitestWorkspace).
// Jest: jest.config.*, then package.json "jest". Returns null when none.
export function findConfig(dir, runner) {
  const names = runner === 'vitest' ? VITEST_CONFIGS : ['jest.config'];
  const exts = runner === 'vitest' ? CONFIG_EXTS : [...CONFIG_EXTS, 'json'];
  for (const name of names) {
    for (const ext of exts) {
      const file = path.join(dir, `${name}.${ext}`);
      if (fs.existsSync(file)) return file;
    }
  }
  if (runner === 'jest') {
    const pkg = path.join(dir, 'package.json');
    try {
      if (readJson(pkg).jest) return pkg;
    } catch {
      /* no or unreadable package.json */
    }
  }
  return null;
}

export function findVitestWorkspace(dir) {
  for (const name of VITEST_WORKSPACES) {
    for (const ext of [...CONFIG_EXTS, 'json']) {
      const file = path.join(dir, `${name}.${ext}`);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

// The project's own runner binary (npx may pick up an unrelated version):
// the nearest node_modules/.bin/<name> from dir upwards.
export function findBin(fromDir, name) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const bin = path.join(dir, 'node_modules', '.bin', name);
    if (fs.existsSync(bin)) return bin;
    if (dir === path.dirname(dir)) return null;
  }
}

const runnerOfConfig = (file) => {
  const name = path.basename(file);
  if (/^(vitest|vite)\./.test(name)) return 'vitest';
  if (/^jest\./.test(name) || name === 'package.json') return 'jest';
  return null;
};

// { runner, config, bin } or { error }. options.runner and options.config
// (from --runner and a --config runner argument) take precedence.
export function detectRunner(dir, { runner = null, config = null } = {}) {
  if (runner && !['vitest', 'jest'].includes(runner)) return { error: `unknown runner "${runner}" (vitest or jest)` };
  if (config) {
    const file = path.resolve(dir, config);
    if (!fs.existsSync(file)) return { error: `config ${config} not found` };
    runner ??= runnerOfConfig(file);
    if (!runner) return { error: `cannot tell the runner from ${config}; pass --runner vitest or --runner jest` };
    const bin = findBin(dir, runner);
    return bin
      ? { runner, config: file, bin }
      : { error: `${runner} is not installed here (no node_modules/.bin/${runner})` };
  }
  const found = {};
  for (const r of runner ? [runner] : ['vitest', 'jest']) {
    const bin = findBin(dir, r);
    if (bin) found[r] = { runner: r, config: findConfig(dir, r), bin };
  }
  // A Vitest workspace file without a config counts as Vitest's config.
  const withConfig = Object.values(found).filter(
    (f) => f.config || (f.runner === 'vitest' && findVitestWorkspace(dir)),
  );
  if (withConfig.length === 1) return withConfig[0];
  if (withConfig.length > 1)
    return { error: 'both Vitest and Jest are configured here; pass --runner vitest or --runner jest' };
  if (runner && found[runner]) return found[runner];
  if (found.jest && !found.vitest) return found.jest;
  if (found.vitest && found.jest)
    return {
      error: 'both Vitest and Jest are installed and neither has a config here; pass --runner vitest or --runner jest',
    };
  if (found.vitest)
    return {
      error: 'no Vitest config found here (vitest.config.* or vite.config.*); run compare where you run vitest',
    };
  return { error: 'neither Vitest nor Jest is installed here; run compare where you run your tests' };
}

// A package's directory as seen from dir (null when not installed): walks
// up node_modules directories, so packages whose "exports" hide
// package.json are found too.
export function packageDir(fromDir, name) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    if (dir === path.dirname(dir)) return null;
  }
}

export function packageVersion(fromDir, name) {
  const dir = packageDir(fromDir, name);
  if (!dir) return null;
  try {
    return readJson(path.join(dir, 'package.json')).version ?? null;
  } catch {
    return null;
  }
}

// warpdom as the project would load it: an installed copy inside the
// project's node_modules, or null (compare then copies itself in).
export function installedWarpdom(dir) {
  try {
    const file = createRequire(path.join(dir, 'package.json')).resolve('warpdom/package.json');
    return file.split(path.sep).includes('node_modules') ? path.dirname(file) : null;
  } catch {
    return null;
  }
}

// The version of the DOM library a baseline environment loads: jsdom
// (through jest-environment-jsdom, or a wrapper of it such as
// jest-fixed-jsdom) or happy-dom.
export function domVersion(dir, runner, environment) {
  const lib = /happy-dom/.test(environment ?? '') ? 'happy-dom' : 'jsdom';
  // Jest loads the DOM through its environment package; Vitest from the
  // project, else through itself.
  const via =
    runner === 'jest'
      ? [environment, lib === 'jsdom' ? 'jest-environment-jsdom' : '@happy-dom/jest-environment']
      : ['vitest'];
  const from = runner === 'jest' ? [] : [dir];
  for (const name of via) {
    if (!name || name === 'jsdom' || name === 'happy-dom' || path.isAbsolute(name)) continue;
    const d = packageDir(dir, name);
    if (!d) continue;
    from.push(d);
    const inner = packageDir(d, 'jest-environment-jsdom');
    if (inner) from.push(inner);
  }
  if (runner === 'jest') from.push(dir);
  for (const d of from) {
    const version = packageVersion(d, lib);
    if (version) return { name: lib, version };
  }
  return { name: lib, version: null };
}

const DOCBLOCK = {
  vitest: /@(?:vitest|jest)-environment\s+([^\s*]+)/,
  jest: /@jest-environment\s+([^\s*]+)/,
};

// Test files that choose a DOM environment with a comment
// (`// @vitest-environment jsdom`, `@jest-environment jsdom`): such a
// comment overrides the config, so these files are not switched.
// warpdom: files choosing warpdom count too (--baseline on a migrated project).
// Returns Map(file -> environment).
export function environmentComments(files, runner, { warpdom = false } = {}) {
  const pinned = new Map();
  for (const file of files) {
    let head;
    try {
      const fd = fs.openSync(file, 'r');
      try {
        const buffer = Buffer.alloc(8192);
        head = buffer.toString('utf8', 0, fs.readSync(fd, buffer, 0, buffer.length, 0));
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      continue;
    }
    const match = head.match(DOCBLOCK[runner] ?? DOCBLOCK.vitest);
    if (match && (/jsdom|happy-dom/.test(match[1]) || (warpdom && isWarpdomEnvironment(match[1]))))
      pinned.set(file, match[1]);
  }
  return pinned;
}

// Splits a --config/-c runner argument from the other runner arguments.
export function takeConfigArg(args) {
  const rest = [];
  let config = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--config' || a === '-c') && i + 1 < args.length) config = args[++i];
    else if (a.startsWith('--config=')) config = a.slice('--config='.length);
    else rest.push(a);
  }
  return { config, args: rest };
}

// The command in the project's package.json test script that runs the
// runner (the first one, in `a && b`): { runner, before, after } with the
// words before and after the runner's, or null. runner: the one to look
// for, else Vitest or Jest, whichever the script runs.
function scriptCommand(dir, runner = null) {
  let script;
  try {
    script = readJson(path.join(dir, 'package.json')).scripts?.test;
  } catch {
    return null;
  }
  if (typeof script !== 'string') return null;
  const isRunner = (w, r) => w === r || w.endsWith(`/${r}`) || new RegExp(`(^|/)${r}(/bin/${r})?\\.[mc]?js$`).test(w);
  for (const command of script.split(/&&|\|\||;/)) {
    const words = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    for (const r of runner ? [runner] : ['vitest', 'jest']) {
      const at = words.findIndex((w) => isRunner(w, r));
      if (at >= 0)
        return { runner: r, before: words.slice(0, at), after: words.slice(at + 1).map((w) => w.replace(/["']/g, '')) };
    }
  }
  return null;
}

// Node flags the project's package.json test script gives its runner:
// `node <flags> path/to/jest.js`, `NODE_OPTIONS=<flags> jest` (also after
// cross-env). Debugger flags are left out. [] when there are none.
export function scriptNodeFlags(dir, runner) {
  const command = scriptCommand(dir, runner);
  if (!command) return [];
  const words = command.before;
  const flags = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const env = /^NODE_OPTIONS=(.*)$/.exec(w);
    if (env) flags.push(...env[1].replace(/["']/g, '').split(/\s+/).filter(Boolean));
    else if (w.startsWith('-') && i > 0 && words.slice(0, i).includes('node')) flags.push(w);
  }
  return flags.filter((f) => !/^--inspect/.test(f));
}

// The runner arguments of the project's package.json test script that
// choose what runs: its config (--config/-c, Jest and Vitest) and Vitest's
// --project filters. { runner, config, projects } or null when the script
// runs neither runner (or runner, when given).
export function scriptRunnerArgs(dir, runner = null) {
  const command = scriptCommand(dir, runner);
  if (!command) return null;
  let config = null;
  const projects = [];
  const words = command.after;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const [flag, inline] =
      w.startsWith('--') && w.includes('=') ? [w.slice(0, w.indexOf('=')), w.slice(w.indexOf('=') + 1)] : [w, null];
    const take = () => inline ?? (i + 1 < words.length ? words[++i] : null);
    if (flag === '--config' || flag === '-c') config = take() ?? config;
    else if (flag === '--project' && command.runner === 'vitest') {
      const name = take();
      if (name) projects.push(name);
    }
  }
  return { runner: command.runner, config, projects };
}
