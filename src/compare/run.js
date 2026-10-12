// Running the project's test runner and reading its results, for
// `warpdom compare` (Node only).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// Vitest before 4 rejects a maxWorkers below its default minWorkers, and
// later versions removed --minWorkers: ask the binary whether it has it.
const minWorkersFlag = new Map();
export function hasMinWorkers(bin) {
  if (!minWorkersFlag.has(bin)) {
    const help = spawnSync(bin, ['--help'], { encoding: 'utf8' });
    minWorkersFlag.set(bin, /--minWorkers/.test(`${help.stdout}${help.stderr}`));
  }
  return minWorkersFlag.get(bin);
}

// Arguments for one run: the wrapper config, the JSON reporter next to the
// default one (Vitest) or Jest's own JSON output, no coverage (it would
// dominate the time and write files), the worker limit, then the user's
// runner arguments.
// reporter (Vitest): a reporter file recording each test file's project.
export function runnerArgs(runner, { config, resultsFile, workers = null, minWorkers = false, reporter = null, args = [] }) {
  const limit = !workers ? []
    : runner === 'vitest' && minWorkers ? ['--minWorkers=1', `--maxWorkers=${workers}`]
      : [`--maxWorkers=${workers}`];
  return runner === 'vitest'
    ? ['run', '--config', config, '--reporter=default', '--reporter=json', ...(reporter ? [`--reporter=${reporter}`] : []), `--outputFile.json=${resultsFile}`, '--coverage.enabled=false', ...limit, ...args]
    : ['--config', config, '--ci', '--json', `--outputFile=${resultsFile}`, '--coverage=false', ...limit, ...args];
}

// The running child, so a signal handler can stop it.
let current = null;
export const currentChild = () => current;

// Runs a command in its own process group (so its workers can be stopped
// with it), collecting the output into logFile.
export function runProcess(cmd, args, { cwd, env = {}, timeoutMs = null, logFile = null }) {
  return new Promise((resolve) => {
    const started = performance.now();
    const chunks = [];
    let timedOut = false;
    const child = spawn(cmd, args, {
      cwd, detached: process.platform !== 'win32',
      env: { ...process.env, CI: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    current = child;
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs) : null;
    const finish = (code, signal, error) => {
      clearTimeout(timer);
      if (current === child) current = null;
      const output = `$ ${[cmd, ...args].join(' ')}\n${Buffer.concat(chunks).toString('utf8')}${error ? `\n${error.message}` : ''}`;
      if (logFile) {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.writeFileSync(logFile, output);
      }
      resolve({ code, signal, output, ms: performance.now() - started, timedOut });
    };
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal, null));
  });
}

export function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { /* already gone */ }
}

// --- results ----------------------------------------------------------------

const ANSI = /\x1b\[[0-9;]*m/g;

export function normalizeStatus(status) {
  if (status === 'passed' || status === 'failed' || status === 'todo') return status;
  return 'skipped'; // pending, skipped, disabled
}

const firstLine = (message) => (message ?? '').replace(ANSI, '').split('\n').map((s) => s.trim()).find(Boolean) ?? '';

// Tests of a runner JSON report (Vitest's json reporter or Jest's --json;
// the same shape): Map(key -> { project, file, name, status, message }). The
// key is the project (when it has a name), the file (relative to root), the
// full name (describe path and title) and an index for duplicate names. A
// file that failed without running tests (a load error) is one entry named
// "(file)". projects: what compare's reporter recorded ({ files: [[path,
// project]] } in the report's order; a file in several projects appears
// once per project, matched by occurrence).
export function testsOf(report, root, projects = null) {
  const byPath = new Map();
  for (const [file, project] of projects?.files ?? []) {
    if (!byPath.has(file)) byPath.set(file, []);
    byPath.get(file).push(project ?? '');
  }
  const seen = new Map();
  const tests = new Map();
  for (const t of report?.testResults ?? []) {
    const n = seen.get(t.name) ?? 0;
    seen.set(t.name, n + 1);
    const project = byPath.get(t.name)?.[n] ?? '';
    const file = path.relative(root, t.name).split(path.sep).join('/');
    const prefix = project ? `${project}::${file}` : file;
    const results = t.assertionResults ?? [];
    if (!results.length && t.status === 'failed') {
      tests.set(`${prefix}::(file)`, { project, file, name: '(file)', status: 'failed', message: firstLine(t.message) });
    }
    for (const a of results) {
      const name = a.ancestorTitles ? [...a.ancestorTitles, a.title].join(' > ') : a.fullName;
      let key = `${prefix}::${name}`;
      for (let i = 2; tests.has(key); i++) key = `${prefix}::${name} #${i}`;
      tests.set(key, { project, file, name, status: normalizeStatus(a.status), message: firstLine(a.failureMessages?.[0]) });
    }
  }
  return tests;
}

export function countsOf(tests) {
  const counts = { tests: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };
  for (const t of tests.values()) {
    if (t.name === '(file)') { counts.failed++; continue; }
    counts.tests++;
    counts[t.status]++;
  }
  return counts;
}

// The runner's own duration in ms: Vitest's "Duration" line, else the span
// of the JSON report (start to the last file's end), else null.
export function runnerDuration(runner, report, output) {
  if (runner === 'vitest') {
    const m = output.replace(ANSI, '').match(/Duration\s+([\d.]+)\s*(ms|s|m)\b/);
    if (m) return Number(m[1]) * (m[2] === 'ms' ? 1 : m[2] === 's' ? 1000 : 60_000);
  }
  const ends = (report?.testResults ?? []).map((t) => t.endTime ?? t.perfStats?.end).filter(Number.isFinite);
  if (report?.startTime && ends.length) return Math.max(...ends) - report.startTime;
  return null;
}

export function readReport(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
