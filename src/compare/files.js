// Temporary files in the user's project, for `warpdom compare` (Node only).
//
// Every file or directory compare creates in the project is recorded in
// <out>/pending.json before it is written, and removed in `finally`, on
// SIGINT/SIGTERM, or by the next run when a run was killed. Removal only
// ever deletes compare's own files: names containing `.warpdom-compare.`
// (wrapper configs), the `.warpdom-compare` copy of warpdom, the
// vitest-environment-warpdom-compare package, and
// directories compare created, only while they are empty.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { MARK, PINNED_PACKAGE } from './wrappers.js';
import { packageDir } from './detect.js';

export const COPY_DIR = '.warpdom-compare';

export const isOwnName = (file) => {
  const name = path.basename(file);
  return name.includes(MARK) || name === COPY_DIR || name === PINNED_PACKAGE;
};

function lstat(file) {
  try { return fs.lstatSync(file); } catch { return null; }
}

// Removes one recorded entry, only if it is compare's own.
// Returns true when something was removed.
export function removeEntry(entry) {
  const { path: file, kind } = typeof entry === 'string' ? { path: entry, kind: 'own' } : entry;
  const stat = lstat(file);
  if (!stat) return false;
  if (kind === 'empty-dir') {
    if (!stat.isDirectory()) return false;
    try { fs.rmdirSync(file); return true; } catch { return false; }
  }
  if (!isOwnName(file)) return false;
  // A link (dangling or not) is removed itself, never what it points to.
  if (stat.isSymbolicLink()) fs.unlinkSync(file);
  else fs.rmSync(file, { recursive: true, force: true });
  return true;
}

export class TempFiles {
  constructor(pendingFile) {
    this.pendingFile = pendingFile;
  }

  list() {
    try { return JSON.parse(fs.readFileSync(this.pendingFile, 'utf8')); } catch { return []; }
  }

  #write(list) {
    if (list.length) {
      fs.mkdirSync(path.dirname(this.pendingFile), { recursive: true });
      fs.writeFileSync(this.pendingFile, JSON.stringify(list, null, 2));
    } else {
      fs.rmSync(this.pendingFile, { force: true });
    }
  }

  // Record before writing. kind: 'own' (a file or directory compare makes)
  // or 'empty-dir' (a directory compare had to create; removed if empty).
  add(file, kind = 'own') {
    this.#write([...this.list().filter((e) => e.path !== file), { path: file, kind }]);
    return file;
  }

  // Removes the given paths (default: all recorded), newest first, so a
  // directory compare created goes after its contents.
  remove(files = null) {
    const list = this.list();
    const chosen = files ? list.filter((e) => files.includes(e.path)) : list;
    const removed = [];
    for (const entry of [...chosen].reverse()) if (removeEntry(entry)) removed.push(entry.path);
    this.#write(list.filter((e) => !chosen.includes(e)));
    return removed;
  }
}

// The runtime dependencies of the package in dir, found the way Node would
// (nearest node_modules upwards), with their own dependencies.
function dependencyDirs(dir, found = new Map()) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return found; }
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (found.has(name)) continue;
    const depDir = packageDir(dir, name);
    if (!depDir) throw new Error(`warpdom's dependency ${name} is not installed`);
    found.set(name, depDir);
    dependencyDirs(depDir, found);
  }
  return found;
}

// Copies warpdom (source, package.json and runtime dependencies) into
// <nodeModules>/.warpdom-compare for one run, as an installed warpdom would
// be: Vitest hangs loading an environment from outside the project root
// when files share workers, and Jest runs files outside node_modules
// through the project's transformer. Returns the copy's directory.
export function copyWarpdom(sourceRoot, nodeModules, temp) {
  if (!fs.existsSync(nodeModules)) {
    temp.add(nodeModules, 'empty-dir');
    fs.mkdirSync(nodeModules, { recursive: true });
  }
  const target = temp.add(path.join(nodeModules, COPY_DIR));
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(sourceRoot, 'src'), path.join(target, 'src'), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, 'package.json'), path.join(target, 'package.json'));
  for (const [name, dir] of dependencyDirs(sourceRoot)) {
    fs.cpSync(dir, path.join(target, 'node_modules', name), { recursive: true, dereference: true });
  }
  return target;
}

// The package Vitest loads for test files whose jsdom/happy-dom comment the
// wrapper switched to the name warpdom-compare: it re-exports the warpdom
// environment. Returns its directory.
export function pinnedEnvironmentPackage(nodeModules, environmentFile, temp) {
  const target = temp.add(path.join(nodeModules, PINNED_PACKAGE));
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: PINNED_PACKAGE, private: true, type: 'module', exports: './index.js', main: './index.js' }, null, 2));
  fs.writeFileSync(path.join(target, 'index.js'), `// Generated by warpdom compare. Safe to delete.\nexport { default } from ${JSON.stringify(pathToFileURL(environmentFile).href)};\n`);
  return target;
}

// One compare at a time per output directory: two would write the same
// wrapper files. Returns a release function.
export function acquireLock(out) {
  const lockFile = path.join(out, 'run.lock');
  fs.mkdirSync(out, { recursive: true });
  let pid = null;
  try { pid = JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid; } catch { /* no lock */ }
  if (pid && pid !== process.pid) {
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (err) { alive = err.code === 'EPERM'; }
    if (alive) throw new Error(`warpdom compare is already running here (pid ${pid})`);
  }
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid) fs.rmSync(lockFile);
    } catch { /* already gone */ }
  };
}

// `git status --porcelain` of the repository containing dir, without
// entries inside `ignore` (the output directory); null outside a git
// repository.
export function gitStatus(dir, ignore = null) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  if (top.status !== 0) return null;
  const root = top.stdout.trim();
  const res = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) return null;
  const skip = ignore ? path.relative(fs.realpathSync(root), fs.realpathSync(ignore)).split(path.sep).join('/') : null;
  return res.stdout.split('\n').filter((line) => {
    if (!line) return false;
    if (!skip || skip.startsWith('..')) return true;
    const file = line.slice(3).replace(/^"|"$/g, '');
    return file !== skip && file !== `${skip}/` && !file.startsWith(`${skip}/`);
  });
}

// Lines in one status and not the other.
export function statusChanges(before, after) {
  if (!before || !after) return [];
  const a = new Set(before), b = new Set(after);
  return [...[...b].filter((l) => !a.has(l)), ...[...a].filter((l) => !b.has(l))];
}
