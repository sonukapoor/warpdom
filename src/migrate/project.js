// The project around `warpdom migrate` (Node only): its files, packages
// and workspaces, package manager, release-age settings and lockfile.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { glob } from '../compare/projects.js';

// Directories never searched: dependencies, build output, caches, VCS.
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.output',
  '.vercel',
  '.yarn',
  '.pnpm-store',
  'bower_components',
  'jspm_packages',
  '.warpdom-migrate',
  '.warpdom-compare',
  '.angular',
  '.parcel-cache',
  '.docusaurus',
  'storybook-static',
]);
export const SCRIPT_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
// Files read for mentions of jsdom (besides scripts).
const TEXT_EXTS = new Set([
  ...SCRIPT_EXTS,
  '.vue',
  '.svelte',
  '.astro',
  '.json',
  '.jsonc',
  '.json5',
  '.md',
  '.mdx',
  '.yml',
  '.yaml',
  '.toml',
  '.sh',
  '.html',
]);
const TEXT_NAMES = new Set(['.npmrc', '.yarnrc', '.mocharc', 'Makefile', 'Dockerfile']);
export const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]);
const MAX_SIZE = 1024 * 1024;

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};
export const posix = (p) => p.split(path.sep).join('/');

// Every file of the project worth reading, relative POSIX paths, sorted:
// { rel, abs, ext, size }. Skips dependencies, build output, symlinks,
// large or binary files, and what git ignores (generated files such as
// .dumi/tmp/appData.json repeat the package.json and are not the
// project's code). Declaration files (.d.ts) are read: they can refer to
// jsdom's types.
export function walk(root, { ignored = ignoredPaths(root) } = {}) {
  const files = [];
  const visit = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !ignored.has(r, true)) visit(abs, r);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (
        !TEXT_EXTS.has(ext) &&
        !TEXT_NAMES.has(e.name) &&
        !e.name.startsWith('.mocharc') &&
        e.name !== 'bunfig.toml' &&
        e.name !== '.yarnrc.yml'
      )
        continue;
      if (/\.min\.[cm]?js$/.test(e.name) || ignored.has(r, false)) continue;
      let size;
      try {
        size = fs.statSync(abs).size;
      } catch {
        continue;
      }
      if (size > MAX_SIZE && !LOCKFILES.has(e.name)) continue;
      files.push({ rel: r, abs, ext, name: e.name, size });
    }
  };
  visit(root, '');
  return files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

// What git ignores under root: { has(rel, isDir), source }. In a git
// repository, git's own answer (`git ls-files --others --ignored
// --exclude-standard --directory`: every .gitignore, .git/info/exclude
// and the global excludes file; tracked files are never ignored).
// Outside one, the .gitignore files of root and its directories, read
// with the common pattern rules (*, **, ?, a leading or trailing /, !).
export function ignoredPaths(root) {
  const res = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status === 0 && !res.error) {
    const files = new Set();
    const dirs = new Set();
    for (const entry of res.stdout.split('\0')) {
      if (!entry) continue;
      if (entry.endsWith('/')) dirs.add(entry.slice(0, -1));
      else files.add(entry);
    }
    return { source: 'git', has: (rel, isDir) => (isDir ? dirs.has(rel) : files.has(rel)) };
  }
  return gitignoreMatcher(root);
}

// .gitignore files without git: each file's patterns apply below its
// directory; later patterns win, ! re-includes.
export function gitignoreMatcher(root) {
  const rulesByDir = new Map(); // dir rel ('' root) -> [{ re, negate, dirOnly }]
  const rulesOf = (dirRel) => {
    if (!rulesByDir.has(dirRel)) {
      const text = readText(path.join(root, dirRel, '.gitignore'));
      rulesByDir.set(dirRel, text === null ? [] : parseGitignore(text));
    }
    return rulesByDir.get(dirRel);
  };
  const matchIn = (dirRel, rel, isDir) => {
    const sub = dirRel ? rel.slice(dirRel.length + 1) : rel;
    let state = null;
    for (const rule of rulesOf(dirRel)) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.re.test(sub)) state = !rule.negate;
    }
    return state;
  };
  const has = (rel, isDir) => {
    // A path is ignored when it or one of its parent directories is (git
    // does not look inside an ignored directory).
    const parts = rel.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      const prefixIsDir = i < parts.length || isDir;
      let state = null;
      for (let j = 0; j < i; j++) {
        const dirRel = parts.slice(0, j).join('/');
        const m = matchIn(dirRel, prefix, prefixIsDir);
        if (m !== null) state = m;
      }
      if (state) return true;
    }
    return false;
  };
  return { source: '.gitignore', has };
}

export function parseGitignore(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/(?<!\\)\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    let negate = false;
    if (line.startsWith('!')) {
      negate = true;
      line = line.slice(1);
    }
    line = line.replace(/^\\([#!])/, '$1');
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    // A slash at the start or in the middle anchors the pattern to the
    // .gitignore's directory; otherwise it matches a name at any depth.
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    let re = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '*' && line[i + 1] === '*') {
        if (line[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i++;
        }
      } else if (c === '*') re += '[^/]*';
      else if (c === '?') re += '[^/]';
      else if (c === '\\' && i + 1 < line.length) re += line[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      else if (c === '[') {
        const close = line.indexOf(']', i + 1);
        if (close < 0) re += '\\[';
        else {
          re += `[${line.slice(i + 1, close).replace(/^!/, '^')}]`;
          i = close;
        }
      } else re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }
    rules.push({ re: new RegExp(anchored ? `^${re}$` : `(?:^|/)${re}$`), negate, dirOnly });
  }
  return rules;
}

// pnpm-workspace.yaml: the strings of a top-level list (packages:,
// minimumReleaseAgeExclude:) and scalars (minimumReleaseAge: 4320).
// Enough YAML for these keys; anything else is not read.
export function yamlTopLevel(text) {
  const out = {};
  let list = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([A-Za-z_'"][^:]*):\s*(.*)$/.exec(line);
    if (top && !/^\s/.test(line)) {
      const key = top[1].replace(/^['"]|['"]$/g, '');
      const value = top[2].trim();
      if (value === '' || value === '|' || value === '>') {
        list = key;
        out[key] = [];
      } else {
        list = null;
        out[key] = value.startsWith('[')
          ? value
              .slice(1, -1)
              .split(',')
              .map((s) => unquote(s.trim()))
              .filter(Boolean)
          : unquote(value);
      }
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list && Array.isArray(out[list])) out[list].push(unquote(item[1].trim()));
    else if (list && Array.isArray(out[list]) && out[list].length === 0 && /^\s+\S/.test(line)) out[list] = {};
  }
  return out;
}
const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');

// The workspace packages: { tool, patterns, dirs (absolute, root first) }.
export function workspaces(root) {
  let pkg = {};
  try {
    pkg = readJson(path.join(root, 'package.json'));
  } catch {
    /* none */
  }
  let tool = null;
  let patterns = [];
  const pnpm = readText(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpm !== null) {
    const packages = yamlTopLevel(pnpm).packages;
    if (Array.isArray(packages)) {
      tool = 'pnpm workspaces';
      patterns = packages;
    }
  }
  if (!tool && pkg.workspaces) {
    const list = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
    if (Array.isArray(list)) {
      tool = 'workspaces (package.json)';
      patterns = list;
    }
  }
  if (!tool) {
    try {
      const lerna = readJson(path.join(root, 'lerna.json'));
      if (Array.isArray(lerna.packages)) {
        tool = 'lerna';
        patterns = lerna.packages;
      }
    } catch {
      /* none */
    }
  }
  const excluded = new Set(
    patterns
      .filter((p) => p.startsWith('!'))
      .flatMap((p) => glob(p.slice(1).replace(/\/$/, ''), root))
      .map((d) => d.replace(/\/$/, '')),
  );
  const dirs = new Set([root]);
  for (const p of patterns.filter((x) => !x.startsWith('!'))) {
    for (const match of glob(p.replace(/\/$/, ''), root)) {
      const dir = match.replace(/\/$/, '');
      if (!excluded.has(dir) && fs.existsSync(path.join(dir, 'package.json'))) dirs.add(dir);
    }
  }
  return { tool, patterns, dirs: [...dirs] };
}

// The workspace root above dir, when dir is a package inside one.
export function workspaceRootAbove(dir) {
  for (let d = path.dirname(dir); d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'pnpm-workspace.yaml'))) return d;
    try {
      const pkg = readJson(path.join(d, 'package.json'));
      if (pkg.workspaces) return d;
    } catch {
      /* none */
    }
  }
  return null;
}

// The package manager: { name, version, source, lockfile }.
export function packageManager(root) {
  let field = null;
  try {
    field = readJson(path.join(root, 'package.json')).packageManager ?? null;
  } catch {
    /* none */
  }
  const locks = [...LOCKFILES].filter((f) => fs.existsSync(path.join(root, f)));
  const byLock = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm',
    'npm-shrinkwrap.json': 'npm',
    'bun.lock': 'bun',
    'bun.lockb': 'bun',
  };
  if (typeof field === 'string') {
    const m = /^(npm|pnpm|yarn|bun)@([^+\s]+)/.exec(field);
    if (m)
      return {
        name: m[1],
        version: m[2],
        source: 'packageManager field',
        lockfile: locks.find((l) => byLock[l] === m[1]) ?? null,
        lockfiles: locks,
      };
  }
  if (locks.length)
    return { name: byLock[locks[0]], version: null, source: locks[0], lockfile: locks[0], lockfiles: locks };
  return { name: 'npm', version: null, source: 'default (no lockfile)', lockfile: null, lockfiles: [] };
}

export const installCommand = (pm) =>
  ({ pnpm: 'pnpm install', yarn: 'yarn install', bun: 'bun install' })[pm] ?? 'npm install';

const parseIni = (text) => {
  const out = {};
  for (const line of (text ?? '').split(/\r?\n/)) {
    const m = /^\s*([^#;=\s][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].replace(/\[\]$/, '');
    if (m[1].endsWith('[]')) (out[key] ??= []).push(unquote(m[2]));
    else out[key] = unquote(m[2]);
  }
  return out;
};

// Duration settings as minutes: numbers (in the unit given), or strings
// with a unit (3d, 12h, 30m, 1w).
function durationMinutes(value, unitMinutes) {
  if (typeof value === 'number') return value * unitMinutes;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|min|h|d|w)?\s*$/i.exec(String(value));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  return n * ({ m: 1, min: 1, h: 60, d: 1440, w: 10080 }[unit] ?? unitMinutes);
}

// Release-age gates that would keep a just-published package from being
// installed: [{ manager, setting, file, minutes, exclude: [patterns] }],
// or a cutoff date (npm's `before`).
export function releaseAgeSettings(root) {
  const out = [];
  const npmrc = parseIni(readText(path.join(root, '.npmrc')));
  const pnpmYaml = readText(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpmYaml !== null) {
    const y = yamlTopLevel(pnpmYaml);
    if (y.minimumReleaseAge != null && y.minimumReleaseAge !== '') {
      const minutes = durationMinutes(y.minimumReleaseAge, 1);
      if (minutes)
        out.push({
          manager: 'pnpm',
          setting: 'minimumReleaseAge',
          file: 'pnpm-workspace.yaml',
          minutes,
          exclude: Array.isArray(y.minimumReleaseAgeExclude) ? y.minimumReleaseAgeExclude : [],
          excludeSetting: 'minimumReleaseAgeExclude',
        });
    }
  }
  if (npmrc['minimum-release-age']) {
    const minutes = durationMinutes(npmrc['minimum-release-age'], 1);
    if (minutes)
      out.push({
        manager: 'pnpm',
        setting: 'minimum-release-age',
        file: '.npmrc',
        minutes,
        exclude: [].concat(npmrc['minimum-release-age-exclude'] ?? []),
        excludeSetting: 'minimum-release-age-exclude',
      });
  }
  if (npmrc['min-release-age']) {
    const minutes = durationMinutes(npmrc['min-release-age'], 1440);
    if (minutes) out.push({ manager: 'npm', setting: 'min-release-age', file: '.npmrc', minutes, exclude: [] });
  }
  if (npmrc.before) out.push({ manager: 'npm', setting: 'before', file: '.npmrc', before: npmrc.before, exclude: [] });
  const yarnrc = readText(path.join(root, '.yarnrc.yml'));
  if (yarnrc !== null) {
    const y = yamlTopLevel(yarnrc);
    if (y.npmMinimalAgeGate != null && y.npmMinimalAgeGate !== '') {
      const minutes = durationMinutes(y.npmMinimalAgeGate, 1);
      if (minutes)
        out.push({
          manager: 'yarn',
          setting: 'npmMinimalAgeGate',
          file: '.yarnrc.yml',
          minutes,
          exclude: Array.isArray(y.npmPreapprovedPackages) ? y.npmPreapprovedPackages : [],
          excludeSetting: 'npmPreapprovedPackages',
        });
    }
  }
  const bunfig = readText(path.join(root, 'bunfig.toml'));
  if (bunfig !== null) {
    const m = /^\s*minimumReleaseAge\s*=\s*(\d+)/m.exec(bunfig);
    if (m) {
      const ex = /^\s*minimumReleaseAgeExcludes\s*=\s*\[([^\]]*)\]/m.exec(bunfig);
      out.push({
        manager: 'bun',
        setting: 'install.minimumReleaseAge',
        file: 'bunfig.toml',
        minutes: Number(m[1]) / 60,
        exclude: ex
          ? ex[1]
              .split(',')
              .map((s) => unquote(s.trim()))
              .filter(Boolean)
          : [],
        excludeSetting: 'install.minimumReleaseAgeExcludes',
      });
    }
  }
  return out;
}

// Whether a release-age exclusion pattern ('@mui/*', 'warpdom') covers a
// package name.
export const excludedBy = (patterns, name) =>
  patterns.some((p) => {
    // A version suffix (warpdom@0.1.3) is ignored: any version counts.
    const pattern = String(p).startsWith('@')
      ? String(p).replace(/^(@[^@]+)@.*$/, '$1')
      : String(p).replace(/@.*$/, '');
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return re.test(name);
  });

// Publication data from the npm registry: { version, time } for each
// package (null when the registry cannot be reached).
export async function registryInfo(names, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const out = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetchImpl(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          out[name] = null;
          return;
        }
        const doc = await res.json();
        const version = doc['dist-tags']?.latest ?? null;
        out[name] = { version, time: version ? (doc.time?.[version] ?? null) : null };
      } catch {
        out[name] = null;
      }
    }),
  );
  return out;
}

// { dirty: [porcelain lines] } or null outside a git repository.
export function gitDirty(dir) {
  const res = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
  if (res.status !== 0) return null;
  return res.stdout.split('\n').filter((l) => l.trim() && !/\.warpdom-(migrate|compare)\//.test(l));
}

// The output folder (.warpdom-migrate/) ignores itself: a .gitignore
// inside it that names everything, so `git add -A` never commits the plan
// and the project's own .gitignore is left alone.
export function writeOutputDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '.gitignore');
  if (!fs.existsSync(file))
    fs.writeFileSync(file, '# Written by warpdom migrate: this folder holds its plan and is not committed.\n*\n');
}
