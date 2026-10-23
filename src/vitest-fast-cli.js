// `warpdom vitest run`: Vitest in fast mode (./vitest-fast.js) with a
// safety net and learning. Design and measurements: docs/fast-mode.md.
//
// - Learning (the first run, or --learn): a plain isolated run (its result
//   is the run's result), a run without isolation, then the split. Files
//   whose results without isolation differ from the isolated run's in any
//   test (a test missing counts), that fail without isolation, or that
//   have an unhandled error there (the files its stack names, else the
//   file running when it was thrown) run isolated in the split. Split is kept
//   only if it beats the isolated run by more than the noise margin
//   (chooseMode), and only if its results equal the isolated run's. A run
//   without isolation that takes much longer than the isolated one is
//   stopped (deadline): it counts as a failure, and the mode is isolated.
// - Isolated mode is a plain `vitest run` in this process: nothing added.
// - Split mode: one Vitest run of the split. Files that fail in the fast
//   part (or have an unhandled error there) run again isolated and their
//   isolated results count; they run isolated from then on (a file failing
//   isolated too is a real failure, and isolating it avoids its rerun next
//   time). A split run that is stopped at its deadline, has no report, or
//   has an unhandled error without a test file falls back to an isolated
//   run, and the mode becomes isolated. A split run slower than the
//   learned isolated time plus the margin is slow; SLOW_RUNS slow split
//   runs in a row (not one: times vary between runs and machines) switch
//   the mode to isolated, which learns again after RELEARN_AFTER plain
//   runs. A suite whose number of test files changed by more than
//   SUITE_CHANGE learns again on the next run. The state records each
//   mode decision with its reason and times (decisions).
//
// Node only.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { CACHE_FILE, CACHE_VERSION, readCache, isolatedName } from './vitest-fast-state.js';

const REPORTER = fileURLToPath(new URL('./vitest-fast-reporter.js', import.meta.url));

// --- decisions ----------------------------------------------------------------------

// Split must beat isolated by 5% and by at least half a second. Run to run
// noise of a whole suite on CI: median 0.8%, 95th percentile 3.1% (paired
// A/A runs, 16 suites); the learning measures each mode once, and its
// isolated run comes first (the coldest), so a smaller gain is not
// evidence that split is faster.
export const MARGIN = 0.05;
export const MARGIN_SECONDS = 0.5;
export function chooseMode(isolatedSeconds, splitSeconds) {
  if (!(isolatedSeconds > 0) || !(splitSeconds > 0)) return 'isolated';
  return splitSeconds < isolatedSeconds - Math.max(isolatedSeconds * MARGIN, MARGIN_SECONDS) ? 'split' : 'isolated';
}
// After a split run (its time without the reruns, which a file needs
// once). One run is not evidence: absolute times vary between runs and
// between CI runners of the same type (up to 1.6x in the study), and the
// learned isolated time may come from another machine. A split run is
// slow when it takes longer than the learned isolated time plus the
// margin; the mode becomes isolated only after SLOW_RUNS slow split runs
// in a row. A faster run resets the count.
export const SLOW_RUNS = 3;
export const slowSplit = (isolatedSeconds, splitSeconds) =>
  !(isolatedSeconds > 0) ||
  !(splitSeconds > 0) ||
  splitSeconds > isolatedSeconds + Math.max(isolatedSeconds * MARGIN, MARGIN_SECONDS);
// Isolated mode reached that way (not by a learning, which compares both
// modes on one machine minutes apart) learns again after RELEARN_AFTER
// plain runs: the slowness may have been the machine's, not the split's.
// A split run whose suite has more or fewer test files than the learned
// one by more than SUITE_CHANGE learns again on the next run: the learned
// isolated time no longer stands for the suite.
export const RELEARN_AFTER = 10;
export const SUITE_CHANGE = 0.1;
// Mode decisions kept in the state (newest last).
export const DECISIONS = 10;

// The state after a split run: { state, switched } (switched: the mode
// became isolated). files: the number of test files the run had.
export function afterSplitRun(
  state,
  { seconds, files },
  { slowRuns = SLOW_RUNS, relearnAfter = RELEARN_AFTER, now = new Date() } = {},
) {
  const isolatedSeconds = state.learned?.isolated;
  const slow = slowSplit(isolatedSeconds, seconds);
  const slowStreak = slow ? (state.slowStreak ?? 0) + 1 : 0;
  const runs = [...(state.runs ?? []), round1(seconds)].slice(-5);
  const next = { ...state, runs, slowStreak };
  const learnedFiles = state.learned?.files;
  if (learnedFiles > 0 && files >= 0 && Math.abs(files - learnedFiles) > learnedFiles * SUITE_CHANGE) {
    next.relearn = `the suite has ${files} test files, learned with ${learnedFiles}`;
  }
  if (slowStreak < slowRuns) return { state: next, switched: false, slow };
  const reason = `${slowStreak} split runs in a row took longer than the learned isolated ${isolatedSeconds} s plus the margin (last ${runs.slice(-slowStreak).join(', ')} s)`;
  const decided = decision(now, 'isolated', reason, { isolated: isolatedSeconds, splitRuns: runs.slice(-slowStreak) });
  return {
    state: {
      ...next,
      mode: 'isolated',
      reason,
      relearnIn: relearnAfter > 0 ? relearnAfter : undefined,
      decisions: [...(state.decisions ?? []), decided].slice(-DECISIONS),
    },
    switched: true,
    slow,
  };
}
const decision = (now, mode, reason, timings) => ({ at: now.toISOString(), mode, reason, ...timings });
const round1 = (s) => +s.toFixed(1);
// A run without isolation is stopped when it takes this much longer than
// the isolated run (learning: same machine, minutes apart; later runs:
// the state may come from another machine, so more room).
export const LEARN_DEADLINE = { factor: 1.25, seconds: 10 };
export const RUN_DEADLINE = { factor: 1.5, seconds: 30 };
// Split runs a learning makes at most. An error that a file leaves behind
// (a timer or promise throwing after its test ended) shows in a run
// without isolation only when a later file is still running then, so one
// run may reveal some of the files that leave them and the next another.
export const SPLIT_RUNS = 4;
export const deadline = (isolatedSeconds, { factor, seconds }) =>
  isolatedSeconds > 0 ? isolatedSeconds * factor + seconds : null;

// --- results ------------------------------------------------------------------------

// A run's report (./vitest-fast-reporter.js): file -> { project, state,
// tests: Map(name -> state) }, plus unhandled errors. Tests with the same
// full name get #2, #3, ... Type test files (typecheck) are left out:
// they cannot leak (typesFailed counts their failed files).
export function filesOf(report) {
  const files = new Map();
  for (const f of report?.files ?? []) {
    if (f.typecheck) continue;
    const tests = new Map();
    for (const [name, state] of f.tests) {
      let key = name;
      for (let i = 2; tests.has(key); i++) key = `${name}#${i}`;
      tests.set(key, state);
    }
    files.set(f.file, { project: f.project, state: f.state, tests });
  }
  return files;
}
export function readReport(file) {
  try {
    const report = JSON.parse(readFileSync(file, 'utf8'));
    const typesFailed = (report.files ?? []).filter(
      (f) => f.typecheck && (f.state === 'failed' || f.tests.some(([, st]) => st === 'failed')),
    ).length;
    return { reason: report.reason, files: filesOf(report), errors: report.errors ?? [], typesFailed };
  } catch {
    return null;
  }
}

const failedFile = (f) => f.state === 'failed' || [...f.tests.values()].includes('failed');

// The files an unhandled error comes from: the run's test files its stack
// names (sources), else the file that was running when it was thrown.
// Without isolation these differ when a file leaves a timer or promise
// behind (an un-awaited vi.waitFor) that throws while a later file runs:
// the file to isolate is the one that left it, not the one running (the
// error would move on to another file each time).
export const errorFiles = (e) => (e.sources?.length ? e.sources : e.file ? [e.file] : []);

// Files a run cannot vouch for: failed, or with an unhandled error.
export function untrusted(run) {
  const out = new Set();
  for (const [name, f] of run.files) if (failedFile(f)) out.add(name);
  for (const e of run.errors) for (const f of errorFiles(e)) out.add(f);
  return out;
}
export const unattributedErrors = (run) => run.errors.filter((e) => !errorFiles(e).length).length;

// Files whose results in run differ from reference: missing, another file
// state, or any test with another state or missing (or extra).
export function differingFiles(reference, run) {
  const out = new Set();
  for (const [name, ref] of reference.files) {
    const f = run.files.get(name);
    if (!f || f.state !== ref.state || f.tests.size !== ref.tests.size) {
      out.add(name);
      continue;
    }
    for (const [test, state] of ref.tests)
      if (f.tests.get(test) !== state) {
        out.add(name);
        break;
      }
  }
  for (const name of run.files.keys()) if (!reference.files.has(name)) out.add(name);
  return out;
}

// The run's result: each rerun file's isolated result replaces its first.
export function merge(first, rerun) {
  const merged = new Map(first);
  for (const [name, f] of rerun) merged.set(name, f);
  return merged;
}

export function summary(files) {
  let passed = 0,
    failed = 0,
    skipped = 0,
    failedFiles = 0;
  for (const f of files.values()) {
    if (failedFile(f)) failedFiles++;
    for (const s of f.tests.values()) {
      if (s === 'passed') passed++;
      else if (s === 'failed') failed++;
      else skipped++;
    }
  }
  return { passed, failed, skipped, failedFiles };
}

// Vitest arguments for a split run: each --project X also selects
// "X (isolated)"; for the safety-net rerun, --project arguments are dropped
// (the config then holds only the isolated project).
export function splitArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project' && i + 1 < args.length) {
      out.push(a, args[i + 1], a, isolatedName(args[i + 1]));
      i++;
    } else if (a.startsWith('--project=')) {
      const name = a.slice(10);
      out.push(a, `--project=${isolatedName(name)}`);
    } else out.push(a);
  }
  return out;
}

export function withoutProjects(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') {
      i++;
      continue;
    }
    if (args[i].startsWith('--project=')) continue;
    out.push(args[i]);
  }
  return out;
}

// Arguments naming reporters replace the config's, so the CLI's reporter
// then goes in as an argument too; otherwise withFastMode adds it to the
// config's reporters.
export const namesReporters = (args) => args.some((a) => a === '--reporter' || a.startsWith('--reporter='));

// --- running Vitest -----------------------------------------------------------------

function vitestBin(cwd) {
  const require = createRequire(join(cwd, 'package.json'));
  const pkgPath = require.resolve('vitest/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest;
  return { bin: join(dirname(pkgPath), bin), version: pkg.version };
}

export const supportsProjects = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major > 3 || (major === 3 && minor >= 2);
};

// Vitest in this process, exactly as `vitest run <args>`: it owns the
// process from here (output, exit code).
async function runInProcess({ bin, args, env }) {
  Object.assign(process.env, env);
  process.argv = [process.execPath, bin, 'run', ...args];
  await import(pathToFileURL(bin).href);
}

// Vitest in a child process with the CLI's reporter. quiet: no output (not
// buffered either: a run's output can be large). limit (seconds): the run
// is stopped (its process group killed) when it takes longer.
function runVitest({ cwd, bin, args, env, quiet = false, limit = null }) {
  const dir = mkdtempSync(join(tmpdir(), 'warpdom-vitest-'));
  const report = join(dir, 'report.json');
  const cli = namesReporters(args);
  const argv = [bin, 'run', ...args, ...(cli ? [`--reporter=${REPORTER}`] : [])];
  const group = process.platform !== 'win32';
  const started = performance.now();
  const child = spawn(process.execPath, argv, {
    cwd,
    detached: group,
    stdio: quiet ? 'ignore' : 'inherit',
    env: { ...process.env, ...env, WARPDOM_FAST_REPORT: report, WARPDOM_FAST_REPORTER: cli ? 'cli' : 'config' },
  });
  const kill = (signal) => {
    try {
      if (group) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      /* gone */
    }
  };
  // Ctrl-C reaches this process only (the run has a process group of its
  // own): pass it on, and stop the CLI once the run has ended.
  let interrupted = false;
  const forward = () => {
    interrupted = true;
    kill('SIGINT');
  };
  process.on('SIGINT', forward);
  let stopped = false;
  const timer = limit
    ? setTimeout(() => {
        stopped = true;
        kill('SIGKILL');
      }, limit * 1000)
    : null;
  return new Promise((done) => {
    child.on('exit', (code, signal) => {
      const seconds = (performance.now() - started) / 1000;
      if (timer) clearTimeout(timer);
      process.off('SIGINT', forward);
      // Workers the run left behind (forks pool) go with it.
      if (group) kill('SIGKILL');
      const result = stopped ? null : readReport(report);
      rmSync(dir, { recursive: true, force: true });
      if (interrupted) process.exit(130);
      done({ status: code ?? 1, signal, seconds, stopped, run: result });
    });
  });
}

const say = (message) => process.stderr.write(`warpdom: ${message}\n`);
const rel = (cwd, files) => [...files].map((f) => relative(cwd, f)).sort();
function writeCache(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ version: CACHE_VERSION, ...data }, null, 2)}\n`);
}

// Why a run's results cannot be used, or null.
function unusable(r, label) {
  if (r.stopped)
    return `the ${label} run took longer than ${label === 'split' || label === 'fast' ? 'its deadline' : 'allowed'} (${round1(r.seconds)} s; stopped)`;
  if (!r.run) return `the ${label} run wrote no report (exit ${r.signal ?? r.status})`;
  if (unattributedErrors(r.run)) return `the ${label} run had unhandled errors outside any test file`;
  return null;
}

// The test files of a run (type tests left out, as in filesOf).
const fileCount = (run) => run?.files?.size ?? 0;

// why: what made this learning happen (null: no state, or --learn).
// history: the earlier state's mode decisions, kept.
async function learn({ cwd, bin, args, cacheFile, limits, why = null, history = [], now = new Date() }) {
  say(`learning${why ? ` (${why})` : ''}: an isolated run (its results count), a run without isolation, and the split`);
  const iso = await runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } });
  const files = fileCount(iso.run);
  const store = (mode, reason, data) => {
    const decisions = [...history, decision(now, mode, reason, { learning: why ?? 'first', ...data.learned })].slice(
      -DECISIONS,
    );
    writeCache(cacheFile, { mode, reason, isolate: [], leaky: [], runs: [], slowStreak: 0, ...data, decisions });
  };
  const save = (mode, reason, extra = {}) => {
    store(mode, reason, { learned: { isolated: round1(iso.seconds), files }, ...extra });
    say(`learned: ${mode} (${reason}) (${relative(cwd, cacheFile)})`);
    return iso.status;
  };
  if (!iso.run) return save('isolated', `the isolated run wrote no report (exit ${iso.signal ?? iso.status})`);
  const limit = deadline(iso.seconds, limits.learn);
  const fast = await runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'fast' }, quiet: true, limit });
  const fastProblem = unusable(fast, 'fast');
  if (fastProblem)
    return save('isolated', fastProblem, {
      learned: { isolated: round1(iso.seconds), fast: round1(fast.seconds), files },
    });
  // Files to isolate: their results without isolation differ, or cannot
  // be trusted. leaky: those that pass isolated.
  const isolate = new Set([...differingFiles(iso.run, fast.run), ...untrusted(fast.run)]);
  let split = null;
  const splits = [];
  // The split must reproduce the isolated run's results; files that still
  // differ (order changed with the split, or an error a file left behind
  // showed this time) join the isolated ones, for up to SPLIT_RUNS runs.
  for (let attempt = 0; attempt < SPLIT_RUNS; attempt++) {
    split = await runVitest({
      cwd,
      bin,
      args: splitArgs(args),
      quiet: true,
      limit,
      env: { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: JSON.stringify(rel(cwd, isolate)) },
    });
    splits.push(round1(split.seconds));
    const timings = {
      isolated: round1(iso.seconds),
      fast: round1(fast.seconds),
      split: round1(split.seconds),
      splits,
      files,
    };
    const problem = unusable(split, 'split');
    if (problem) return save('isolated', problem, { learned: timings });
    const differs = new Set([
      ...differingFiles(iso.run, split.run),
      ...[...untrusted(split.run)].filter((f) => !isolate.has(f)),
    ]);
    if (differs.size === 0) break;
    if (attempt === SPLIT_RUNS - 1) {
      return save('isolated', `the split's results differ from the isolated run's in ${differs.size} more file(s)`, {
        learned: timings,
        differing: rel(cwd, differs),
      });
    }
    for (const f of differs) isolate.add(f);
  }
  const leaky = [...isolate].filter((f) => iso.run.files.has(f) && !failedFile(iso.run.files.get(f)));
  // splits: every split run of the learning (the last decides); the
  // learning cost beyond the isolated run is fast + the sum of splits.
  const learned = {
    isolated: round1(iso.seconds),
    fast: round1(fast.seconds),
    split: round1(split.seconds),
    splits,
    files,
  };
  // Both times come from this learning, on this machine, minutes apart.
  const mode = chooseMode(iso.seconds, split.seconds);
  const reason =
    mode === 'split'
      ? `split ${learned.split} s beats isolated ${learned.isolated} s by more than the margin`
      : `split ${learned.split} s does not beat isolated ${learned.isolated} s by more than the margin`;
  store(mode, reason, { isolate: rel(cwd, isolate), leaky: rel(cwd, leaky), learned });
  say(
    `learned: ${isolate.size} file(s) to isolate (${leaky.length} leak); isolated ${learned.isolated} s, split ${learned.split} s: using ${mode} (${relative(cwd, cacheFile)})`,
  );
  return iso.status;
}

// Why the state asks to learn before this run, or null.
function relearnReason(cache) {
  if (cache.relearn) return cache.relearn;
  if (cache.mode !== 'split' && typeof cache.relearnIn === 'number' && cache.relearnIn <= 0) {
    return `isolated since ${cache.slowStreak ?? SLOW_RUNS} slow split runs; measuring again`;
  }
  return null;
}

async function run({ cwd, bin, args, cacheFile, cache, limits, options }) {
  const now = options.now ?? new Date();
  if (cache.mode !== 'split') {
    // Isolated by slowness of split runs: count the plain runs until the
    // next learning (one small write; the run itself is unchanged).
    if (typeof cache.relearnIn === 'number') writeCache(cacheFile, { ...cache, relearnIn: cache.relearnIn - 1 });
    await runInProcess({ bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } });
    return null;
  }
  const isolatedSeconds = cache.learned?.isolated;
  // A run that could not be used (stopped at its deadline, no report,
  // errors outside test files) ends split mode at once, until --learn.
  const toIsolated = (reason, extra = {}) => {
    const decisions = [
      ...(cache.decisions ?? []),
      decision(now, 'isolated', reason, { isolated: isolatedSeconds, split: extra.runs?.at(-1) }),
    ].slice(-DECISIONS);
    writeCache(cacheFile, { ...cache, ...extra, mode: 'isolated', reason, relearnIn: undefined, decisions });
    say(`${reason}: isolated runs from now on (warpdom vitest run --learn learns again)`);
  };
  const first = await runVitest({
    cwd,
    bin,
    args: splitArgs(args),
    env: { WARPDOM_FAST_MODE: 'split' },
    limit: deadline(isolatedSeconds, limits.run),
  });
  const problem = unusable(first, 'split');
  if (problem) {
    say(`${problem}; running isolated`);
    const iso = await runVitest({ cwd, bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } });
    toIsolated(problem, { runs: [...(cache.runs ?? []), round1(first.seconds)].slice(-5) });
    return iso.status;
  }
  const isolatedSet = new Set(cache.isolate.map((f) => resolve(cwd, f)));
  const rerunFiles = [...untrusted(first.run)].filter((f) => !isolatedSet.has(f));
  let status = first.status;
  let state = cache;
  if (rerunFiles.length) {
    say(`${rerunFiles.length} file(s) failed without isolation; running them again isolated`);
    const extra = rel(cwd, rerunFiles);
    const rerun = await runVitest({
      cwd,
      bin,
      args: [...withoutProjects(args), ...extra],
      env: { WARPDOM_FAST_MODE: 'split', WARPDOM_FAST_ISOLATE: JSON.stringify(extra), WARPDOM_FAST_RERUN: '1' },
    });
    if (!rerun.run) {
      say(`the rerun wrote no report (exit ${rerun.signal ?? rerun.status})`);
      return 1;
    }
    const leaky = rerunFiles.filter((f) => rerun.run.files.has(f) && !failedFile(rerun.run.files.get(f)));
    state = {
      ...cache,
      isolate: [...new Set([...cache.isolate, ...extra])].sort(),
      leaky: [...new Set([...(cache.leaky ?? []), ...rel(cwd, leaky)])].sort(),
    };
    if (leaky.length) say(`${leaky.length} file(s) leak state between test files: ${rel(cwd, leaky).join(', ')}`);
    say(`they run isolated from now on (${extra.length} file(s))`);
    const merged = summary(merge(first.run.files, rerun.run.files));
    say(
      `result: ${merged.passed} passed, ${merged.failed} failed, ${merged.skipped} skipped (failing files rerun isolated)`,
    );
    status = merged.failedFiles > 0 || first.run.typesFailed > 0 || unattributedErrors(rerun.run) ? 1 : rerun.status;
  }
  const after = afterSplitRun(state, { seconds: first.seconds, files: fileCount(first.run) }, { ...options, now });
  writeCache(cacheFile, after.state);
  if (after.switched)
    say(
      `${after.state.reason}: isolated runs from now on; learning again after ${after.state.relearnIn ?? 'no'} isolated run(s) (warpdom vitest run --learn learns now)`,
    );
  else if (after.slow)
    say(
      `the split run took ${round1(first.seconds)} s, longer than the learned isolated ${isolatedSeconds} s plus the margin (${after.state.slowStreak} of ${options.slowRuns ?? SLOW_RUNS} in a row before isolated mode)`,
    );
  if (after.state.relearn && !cache.relearn) say(`${after.state.relearn}: learning again on the next run`);
  return status;
}

// The CLI's own options (the rest go to Vitest): --learn,
// --slow-runs=<n> (slow split runs in a row before isolated mode) and
// --relearn-after=<n> (plain runs in that isolated mode before learning
// again; 0: never, until --learn).
export function cliOptions(argv) {
  const options = {};
  const args = [];
  let relearn = false;
  for (const a of argv) {
    const m = /^--(slow-runs|relearn-after)=(\d+)$/.exec(a);
    if (m)
      options[m[1] === 'slow-runs' ? 'slowRuns' : 'relearnAfter'] = Math.max(
        Number(m[2]),
        m[1] === 'slow-runs' ? 1 : 0,
      );
    else if (a === '--learn') relearn = true;
    else if (a !== 'run') args.push(a);
  }
  return { args, relearn, options };
}

// warpdom vitest [run] [--learn] [--slow-runs=<n>] [--relearn-after=<n>]
// [vitest arguments]. Resolves to the exit code, or null when Vitest runs
// in this process and sets it itself. limits: the deadlines (tests
// shorten them).
export async function main(argv, cwd = process.cwd(), limits = { learn: LEARN_DEADLINE, run: RUN_DEADLINE }) {
  const { args, relearn, options } = cliOptions(argv);
  const { bin, version } = vitestBin(cwd);
  if (!supportsProjects(version)) {
    say(`fast mode needs Vitest 3.2 or later (found ${version}); running Vitest as configured`);
    await runInProcess({ bin, args, env: { WARPDOM_FAST_MODE: 'isolated' } });
    return null;
  }
  const cacheFile = join(cwd, CACHE_FILE);
  const cache = relearn ? null : readCache(cacheFile);
  const history = (relearn ? readCache(cacheFile) : cache)?.decisions ?? [];
  if (!cache) return learn({ cwd, bin, args, cacheFile, limits, why: relearn ? '--learn' : null, history });
  const why = relearnReason(cache);
  if (why) return learn({ cwd, bin, args, cacheFile, limits, why, history });
  return run({ cwd, bin, args, cacheFile, cache, limits, options });
}
