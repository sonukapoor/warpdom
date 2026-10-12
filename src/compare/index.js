// `warpdom compare`: runs a project's own tests on its DOM (jsdom or
// happy-dom) and on warpdom, and reports every test whose status differs
// and the speed (docs/compare.md). Node only.
//
//   import { compare } from 'warpdom/compare';
//   const result = await compare({ cwd, rounds: 3, workers: 2 });
//   result.exitCode // 0 same results, 1 some test passes on the baseline and fails on warpdom, 2 could not compare
//
// Nothing in the project is edited: the environment is switched through
// temporary wrapper configs next to the project's own, and warpdom, when the
// project lacks it, is copied into node_modules for the run. Both are
// recorded before they are written and removed afterwards (also on
// SIGINT/SIGTERM, or by the next run after a crash).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRunner, findVitestWorkspace, packageVersion, installedWarpdom, domVersion, environmentComments, takeConfigArg } from './detect.js';
import { vitestWrapper, jestWrapper, wrapperName, PROBE_MARKER, PINNED_TARGET } from './wrappers.js';
import { TempFiles, copyWarpdom, pinnedEnvironmentPackage, acquireLock, gitStatus, statusChanges } from './files.js';
import { runnerArgs, hasMinWorkers, runProcess, currentChild, killTree, testsOf, countsOf, runnerDuration, readReport } from './run.js';
import { compareRuns, groupDifferences, timingSummary, pairOrder, exitCode } from './results.js';
import { environmentRecord } from './env.js';
import { renderConsole, renderMarkdown } from './report.js';

export { renderConsole, renderMarkdown } from './report.js';
export { compareRuns, groupDifferences, timingSummary, exitCode } from './results.js';

const SELF = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const isDomEnvironment = (runner, environment) => (runner === 'vitest'
  ? environment === 'jsdom' || environment === 'happy-dom'
  : /jsdom|happy-dom/.test(String(environment ?? '')));

// The environment a baseline other than the project's own is given as.
const baselineEnvironment = (runner, name) => (runner === 'jest' && name === 'happy-dom' ? '@happy-dom/jest-environment' : name);

const firstErrorLine = (output) => output.split('\n').slice(1).map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
  .find((l) => /error/i.test(l) && !l.includes(PROBE_MARKER)) ?? '';

export async function compare(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const out = path.resolve(cwd, options.out ?? '.warpdom-compare');
  const correctness = Boolean(options.correctness);
  const rounds = correctness ? 1 : Math.max(1, Number(options.rounds ?? 1));
  const timeoutMs = (options.timeout ?? 30) * 60_000;
  const log = options.log ?? (() => {});
  const result = {
    version: 1, cwd, out, mode: correctness ? 'correctness' : 'timing', exitCode: 2, error: null, warnings: [],
    runner: null, runnerVersion: null, baseline: null, warpdom: null, projects: [], external: 0,
    pinned: null, warmup: false, runs: [], correctness: null, timing: null, environment: null, gitChanges: [],
  };

  let release = null;
  let temp = null;
  const cleanup = () => {
    if (temp) {
      try { temp.remove(); } catch (err) { result.warnings.push(`cleanup failed: ${err.message}`); }
    }
    release?.();
    release = null;
  };
  const onSignal = (signal) => {
    killTree(currentChild());
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

  let gitBefore = null;
  try {
    release = acquireLock(out);
    temp = new TempFiles(path.join(out, 'pending.json'));
    for (const s of signals) process.on(s, onSignal);
    const leftovers = temp.remove();
    if (leftovers.length) log(`Removed ${leftovers.length} temporary file(s) left by an interrupted run`);
    for (const dir of ['logs', 'runs']) fs.rmSync(path.join(out, dir), { recursive: true, force: true });
    fs.mkdirSync(path.join(out, 'runs'), { recursive: true });
    gitBefore = gitStatus(cwd, out);

    // --- detection ---------------------------------------------------------
    const { config: configArg, args } = takeConfigArg(options.args ?? []);
    const detected = detectRunner(cwd, { runner: options.runner ?? null, config: configArg });
    if (detected.error) throw new CompareError(detected.error);
    const { runner, bin } = detected;
    result.runner = runner;
    result.runnerVersion = packageVersion(path.dirname(path.dirname(bin)), runner) ?? packageVersion(cwd, runner);
    let config = detected.config;
    if (runner === 'vitest' && !config) throw new CompareError(`Vitest workspaces (${path.basename(findVitestWorkspace(cwd))}) are not supported yet`);
    if (options.baseline && !['jsdom', 'happy-dom'].includes(options.baseline)) throw new CompareError('--baseline must be jsdom or happy-dom');

    const write = (role, environment, pinned = null) => {
      const file = path.join(config ? path.dirname(config) : cwd, wrapperName(runner, config, role));
      temp.add(file);
      fs.writeFileSync(file, runner === 'vitest' ? vitestWrapper(config, { environment, pinned }) : jestWrapper(config, { environment }));
      return file;
    };
    const minWorkers = runner === 'vitest' && options.workers ? hasMinWorkers(bin) : false;
    const execute = (wrapper, resultsFile, logFile, env = {}) => runProcess(bin, runnerArgs(runner, {
      config: wrapper, resultsFile, workers: options.workers, minWorkers, args,
    }), { cwd, env, timeoutMs, logFile });

    // --- probe: which projects run on a DOM -------------------------------
    const metaFile = path.join(out, 'meta.json');
    fs.rmSync(metaFile, { force: true });
    const probeWrapper = write('probe', null);
    const probe = await execute(probeWrapper, path.join(out, 'runs', 'probe.json'), path.join(out, 'logs', 'probe.log'),
      { WARPDOM_COMPARE_META: metaFile, WARPDOM_COMPARE_PROBE: '1' });
    temp.remove([probeWrapper]);
    let meta;
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {
      const why = firstErrorLine(probe.output);
      throw new CompareError(`the ${runner} config could not be loaded${why ? `: ${why}` : ''} (see ${path.relative(cwd, path.join(out, 'logs', 'probe.log'))})`);
    }
    fs.rmSync(metaFile, { force: true });
    result.projects = meta.projects.map((p) => ({ ...p, dom: !p.browser && isDomEnvironment(runner, p.environment) }));
    result.external = meta.external;
    const domProjects = result.projects.filter((p) => p.dom);
    if (!domProjects.length) {
      const seen = [...new Set(result.projects.map((p) => (p.browser ? 'browser mode' : p.environment)))].join(', ') || 'none';
      throw new CompareError(`nothing to compare: no project runs on jsdom or happy-dom (found: ${seen}${meta.external ? `, and ${meta.external} project(s) in separate files, not supported yet` : ''})`);
    }
    const counts = new Map();
    for (const p of domProjects) {
      const name = /happy-dom/.test(p.environment) ? 'happy-dom' : 'jsdom';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const baselineName = options.baseline ?? [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const domEnvironment = options.baseline ? baselineEnvironment(runner, options.baseline) : domProjects[0].environment;
    result.baseline = domVersion(cwd, runner, domEnvironment);
    result.baseline.name = baselineName;

    // --- warpdom inside the project ---------------------------------------
    let warpdomDir = installedWarpdom(cwd);
    result.warpdom = { source: warpdomDir ? 'installed' : 'copied' };
    const nodeModules = fs.existsSync(path.join(cwd, 'node_modules')) ? path.join(cwd, 'node_modules') : path.dirname(path.dirname(bin));
    if (!warpdomDir) warpdomDir = copyWarpdom(SELF, nodeModules, temp);
    try { result.warpdom.version = JSON.parse(fs.readFileSync(path.join(warpdomDir, 'package.json'), 'utf8')).version; } catch { /* unknown */ }
    const warpdomEnvironment = path.join(warpdomDir, 'src', runner === 'vitest' ? 'vitest.js' : 'jest.js');
    result.environment = environmentRecord({ cwd, runner, runnerVersion: result.runnerVersion, dom: result.baseline, warpdomDir: result.warpdom.source === 'installed' ? warpdomDir : SELF });

    // Vitest: test files that pin jsdom or happy-dom with a comment are
    // switched too, to the baseline (a happy-dom pin becomes jsdom on a
    // jsdom baseline, and the other way round) and to warpdom, through a
    // package Vitest resolves for the name warpdom-compare.
    if (runner === 'vitest') pinnedEnvironmentPackage(nodeModules, warpdomEnvironment, temp);
    const wrappers = {
      baseline: write('baseline', options.baseline ? baselineEnvironment(runner, options.baseline) : null, baselineName),
      warpdom: write('warpdom', warpdomEnvironment, PINNED_TARGET),
    };
    const pinnedLogs = { baseline: [], warpdom: [] };

    // --- runs ----------------------------------------------------------------
    result.warmup = !correctness && rounds >= 2;
    const pairs = [];
    if (result.warmup) pairs.push({ warmup: true, round: null });
    for (let r = 1; r <= rounds; r++) pairs.push({ warmup: false, round: r });
    const total = pairs.length * 2;
    const tests = { baseline: [], warpdom: [] };
    let pinned = null;
    for (const [i, pair] of pairs.entries()) {
      for (const side of pairOrder(i)) {
        const index = result.runs.length + 1;
        const name = `${index}-${side}`;
        const resultsFile = path.join(out, 'runs', `${name}.json`);
        const logFile = path.join(out, 'logs', `${name}.log`);
        const label = side === 'baseline' ? baselineName : 'warpdom';
        const pinnedLog = path.join(out, 'logs', `${name}.pinned.tsv`);
        pinnedLogs[side].push(pinnedLog);
        const res = await execute(wrappers[side], resultsFile, logFile, { WARPDOM_COMPARE_PINNED_LOG: pinnedLog });
        const report = readReport(resultsFile);
        const run = {
          index, side, warmup: pair.warmup, round: pair.round, code: res.code, signal: res.signal,
          wallMs: Math.round(res.ms), log: path.relative(out, logFile), results: path.relative(out, resultsFile),
        };
        result.runs.push(run);
        if (res.timedOut) throw new CompareError(`the ${label} run timed out after ${options.timeout ?? 30} min (see ${path.relative(cwd, logFile)})`);
        if (!report) {
          const why = firstErrorLine(res.output);
          throw new CompareError(`the ${label} run produced no results${why ? `: ${why}` : ''} (see ${path.relative(cwd, logFile)})`);
        }
        const runTests = testsOf(report, cwd);
        run.counts = countsOf(runTests);
        run.runnerMs = runnerDuration(runner, report, res.output);
        tests[side].push(runTests);
        if (!pinned) {
          const files = (report.testResults ?? []).map((t) => t.name);
          const comments = environmentComments(files, runner);
          pinned = [...comments].map(([file, environment]) => ({ file: path.relative(cwd, file).split(path.sep).join('/'), environment }));
        }
        log(`  [${index}/${total}] ${label.padEnd(9)} ${(pair.warmup ? 'warm-up' : correctness ? '' : `round ${pair.round}`).padEnd(8)} ${((run.runnerMs ?? run.wallMs) / 1000).toFixed(1).padStart(6)} s  ${run.counts.passed} passed, ${run.counts.failed} failed${run.counts.skipped ? `, ${run.counts.skipped} skipped` : ''}`);
        if (side === 'baseline' && index <= 2 && run.counts.tests === 0) throw new CompareError(`no tests ran on ${label} (see ${path.relative(cwd, logFile)})`);
      }
    }

    // --- results -------------------------------------------------------------
    // Files whose comment the wrapper switched: file -> { environment, options }.
    const switchedIn = (logs) => {
      const files = new Map();
      for (const logFile of logs) {
        let text = '';
        try { text = fs.readFileSync(logFile, 'utf8'); } catch { continue; }
        for (const line of text.split('\n').filter(Boolean)) {
          const [file, environment, options] = line.split('\t');
          files.set(path.relative(cwd, file).split(path.sep).join('/'), { environment, options: options === 'options' });
        }
      }
      return files;
    };
    const switched = switchedIn(pinnedLogs.warpdom);
    const switchedOnBaseline = switchedIn(pinnedLogs.baseline);
    for (const p of pinned) {
      p.switched = switched.has(p.file);
      p.options = Boolean(switched.get(p.file)?.options);
      if (switchedOnBaseline.has(p.file)) p.baseline = baselineName;
    }
    const skipFiles = new Set(pinned.filter((p) => !p.switched).map((p) => p.file));
    const c = compareRuns(tests.baseline, tests.warpdom, { skipFiles });
    c.groups = groupDifferences(c.differences);
    result.correctness = c;
    result.pinned = {
      files: pinned.length, tests: c.notCompared, list: pinned,
      environments: [...new Set(pinned.map((p) => p.environment))],
      switched: pinned.filter((p) => p.switched).length,
      switchedEnvironments: [...new Set(pinned.filter((p) => p.switched).map((p) => p.environment))],
      withOptions: pinned.filter((p) => p.options).length,
      notSwitched: pinned.length - pinned.filter((p) => p.switched).length,
      notSwitchedEnvironments: [...new Set(pinned.filter((p) => !p.switched).map((p) => p.environment))],
    };
    if (!correctness) {
      const timed = result.runs.filter((r) => !r.warmup);
      const source = timed.every((r) => r.runnerMs != null) ? 'runner' : 'wall';
      for (const r of result.runs) r.ms = source === 'runner' ? r.runnerMs : r.wallMs;
      const perRound = [];
      for (let r = 1; r <= rounds; r++) {
        const of = (side) => timed.find((x) => x.round === r && x.side === side).ms;
        perRound.push({ round: r, baselineMs: of('baseline'), warpdomMs: of('warpdom') });
      }
      result.timing = { ...timingSummary(perRound), perRound, source };
    } else {
      for (const r of result.runs) r.ms = r.runnerMs ?? r.wallMs;
    }
    result.exitCode = exitCode({ regressions: c.regressions });
  } catch (err) {
    if (!(err instanceof CompareError)) result.warnings.push(err.stack);
    result.error = err.message;
    result.exitCode = 2;
  } finally {
    cleanup();
    for (const s of signals) process.removeListener(s, onSignal);
  }

  result.gitChanges = statusChanges(gitBefore, gitStatus(cwd, out));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'report.md'), renderMarkdown(result));
  return result;
}

class CompareError extends Error {}

// The terminal summary for a result, with the report's path relative to dir.
export function summary(result, dir = process.cwd()) {
  const report = path.join(result.out, 'report.md');
  const rel = path.relative(dir, report);
  return renderConsole(result, { reportPath: rel.startsWith('..') ? report : rel });
}
