// `warpdom vitest run`: Vitest in fast mode (./vitest-fast.js) with a
// safety net and learning.
//
// - A normal run uses the learned mode. In split mode, files that fail
//   without isolation are run again isolated, and their isolated results
//   count; a file that passes isolated is leaky and is isolated from then
//   on, so a file that starts leaking never shows a false failure.
// - Learning (the first run, or --learn) times plain isolated runs, finds
//   the leaky files with a run without isolation, times the split, and
//   keeps the faster mode in .warpdom/fast-mode.json. Its result is the
//   isolated run's.
//
// Node only.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { CACHE_FILE, readCache, isolatedName } from './vitest-fast.js';

// --- results ---------------------------------------------------------------------

// Test files of a Vitest JSON report: file -> { failed, tests: Map(name -> status) }.
export function filesOf(report) {
  const files = new Map();
  for (const t of report?.testResults ?? []) {
    const tests = new Map(t.assertionResults.map((a) => [a.fullName, a.status]));
    const failed = t.status === 'failed' || t.assertionResults.some((a) => a.status === 'failed');
    files.set(t.name, { failed, tests });
  }
  return files;
}

// Files that failed in the run, except those that already ran isolated.
export function failedFiles(files, isolated) {
  return [...files].filter(([name, f]) => f.failed && !isolated.has(name)).map(([name]) => name);
}

// The run's result: each rerun file's isolated result replaces its first.
export function merge(first, rerun) {
  const merged = new Map(first);
  for (const [name, f] of rerun) merged.set(name, f);
  return merged;
}

export function summary(files) {
  let passed = 0, failed = 0, skipped = 0, failedFiles = 0;
  for (const f of files.values()) {
    if (f.failed) failedFiles++;
    for (const s of f.tests.values()) {
      if (s === 'passed') passed++;
      else if (s === 'failed') failed++;
      else skipped++;
    }
  }
  return { passed, failed, skipped, failedFiles };
}

// Files that failed without isolation and passed isolated: they leak.
export function newlyLeaky(rerunFiles, rerun) {
  return rerunFiles.filter((name) => rerun.has(name) && !rerun.get(name).failed);
}

// Vitest arguments for a split run: each --project X also selects
// "X (isolated)"; for the safety-net rerun, --project arguments are dropped
// (the config then holds only the isolated project).
export function splitArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project' && i + 1 < args.length) { out.push(a, args[i + 1], a, isolatedName(args[i + 1])); i++; }
    else if (a.startsWith('--project=')) { const name = a.slice(10); out.push(a, `--project=${isolatedName(name)}`); }
    else out.push(a);
  }
  return out;
}

export function withoutProjects(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') { i++; continue; }
    if (args[i].startsWith('--project=')) continue;
    out.push(args[i]);
  }
  return out;
}

// The faster mode, from the learning run's timings (ties go to isolated).
export const chooseMode = (isolatedSeconds, splitSeconds) => (splitSeconds < isolatedSeconds ? 'split' : 'isolated');

// --- running Vitest -----------------------------------------------------------------

function vitestBin(cwd) {
  const require = createRequire(join(cwd, 'package.json'));
  const pkgPath = require.resolve('vitest/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest;
  return { bin: join(dirname(pkgPath), bin), version: pkg.version };
}

const supportsProjects = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major > 3 || (major === 3 && minor >= 2);
};

function runVitest({ cwd, bin, args, env, quiet }) {
  const dir = mkdtempSync(join(tmpdir(), 'warpdom-vitest-'));
  const out = join(dir, 'report.json');
  const started = performance.now();
  const res = spawnSync(process.execPath, [bin, 'run', ...args, '--reporter=default', '--reporter=json', `--outputFile.json=${out}`], {
    cwd, env: { ...process.env, ...env }, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8',
  });
  const seconds = (performance.now() - started) / 1000;
  let report = null;
  try { report = JSON.parse(readFileSync(out, 'utf8')); } catch { report = null; }
  rmSync(dir, { recursive: true, force: true });
  return { status: res.status ?? 1, files: filesOf(report), seconds };
}

const say = (message) => process.stderr.write(`warpdom: ${message}\n`);
const rel = (cwd, files) => files.map((f) => relative(cwd, f));

function writeCache(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ version: 1, ...data }, null, 2)}\n`);
}

function learn({ cwd, bin, args, cacheFile }) {
  say('learning: timing isolated runs, finding leaky files, timing the split (three runs, once)');
  const isolated = runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } });
  const fast = runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'fast' }, quiet: true });
  // Leaky: failed without isolation, passed isolated (a file failing both
  // ways is a real failure).
  const leaky = rel(cwd, newlyLeaky(failedFiles(fast.files, new Set()), isolated.files));
  const split = runVitest({ cwd, bin, args: splitArgs(args), env: { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: JSON.stringify(leaky) }, quiet: true });
  const mode = chooseMode(isolated.seconds, split.seconds);
  writeCache(cacheFile, { mode, leaky, learned: { isolated: +isolated.seconds.toFixed(1), split: +split.seconds.toFixed(1) } });
  say(`learned: ${leaky.length} leaky files; isolated ${isolated.seconds.toFixed(1)} s, split ${split.seconds.toFixed(1)} s: using ${mode} (${cacheFile})`);
  return isolated.status;
}

function run({ cwd, bin, args, cacheFile, cache }) {
  if (cache.mode !== 'split') return runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } }).status;
  const isolatedSet = new Set(cache.leaky.map((f) => join(cwd, f)));
  const first = runVitest({ cwd, bin, args: splitArgs(args), env: { WARPDOM_FAST_MODE: 'split' } });
  const rerunFiles = failedFiles(first.files, isolatedSet);
  if (rerunFiles.length === 0) return first.status;
  say(`${rerunFiles.length} file(s) failed without isolation; running them again isolated`);
  const extra = rel(cwd, rerunFiles);
  const rerun = runVitest({
    cwd, bin, args: [...withoutProjects(args), ...extra],
    env: { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: JSON.stringify(extra), WARPDOM_FAST_RERUN: '1' },
  });
  const leaky = newlyLeaky(rerunFiles, rerun.files);
  if (leaky.length) {
    writeCache(cacheFile, { ...cache, leaky: [...cache.leaky, ...rel(cwd, leaky)] });
    say(`${leaky.length} file(s) leak state between test files; they run isolated from now on: ${rel(cwd, leaky).join(', ')}`);
  }
  const merged = summary(merge(first.files, rerun.files));
  say(`result: ${merged.passed} passed, ${merged.failed} failed, ${merged.skipped} skipped (failing files rerun isolated)`);
  return merged.failedFiles > 0 ? 1 : 0;
}

// warpdom vitest [run] [--learn] [vitest arguments]
export function main(argv, cwd = process.cwd()) {
  const args = argv.filter((a) => a !== 'run' && a !== '--learn');
  const relearn = argv.includes('--learn');
  const { bin, version } = vitestBin(cwd);
  if (!supportsProjects(version)) {
    say(`fast mode needs Vitest 3.2 or later (found ${version}); running Vitest as configured`);
    return runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } }).status;
  }
  const cacheFile = join(cwd, CACHE_FILE);
  const cache = relearn ? null : readCache(cacheFile);
  return cache ? run({ cwd, bin, args, cacheFile, cache }) : learn({ cwd, bin, args, cacheFile });
}
