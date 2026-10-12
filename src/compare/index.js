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
import { detectRunner, findVitestWorkspace, packageDir, packageVersion, installedWarpdom, domVersion, environmentComments, takeConfigArg } from './detect.js';
import { vitestWrapper, vitestWorkspaceWrapper, vitestReporter, jestWrapper, jestReporter, wrapperName, workspaceWrapperName, MARK, PROBE_MARKER, PINNED_TARGET } from './wrappers.js';
import { resolveVitestProjects, resolveJestProjects } from './projects.js';
import { TempFiles, copyWarpdom, pinnedEnvironmentPackage, acquireLock, gitStatus, statusChanges } from './files.js';
import { runnerArgs, hasMinWorkers, runProcess, currentChild, killTree, testsOf, countsOf, runnerDuration, readReport } from './run.js';
import { compareRuns, groupDifferences, timingSummary, pairOrder, exitCode } from './results.js';
import { environmentRecord } from './env.js';
import { renderConsole, renderMarkdown, environmentLabel } from './report.js';

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
  // warpdom options for the warpdom runs (fastFrames: the opt-in that runs
  // animation frames without the real-time wait), to see what they change.
  const warpdomOptions = options.fastFrames ? { fastFrames: true } : null;
  const rounds = correctness ? 1 : Math.max(1, Number(options.rounds ?? 1));
  const timeoutMs = (options.timeout ?? 30) * 60_000;
  const log = options.log ?? (() => {});
  const result = {
    version: 1, cwd, out, mode: correctness ? 'correctness' : 'timing', exitCode: 2, error: null, warnings: [],
    runner: null, runnerVersion: null, baseline: null, warpdom: null, projects: [], external: 0,
    pinned: null, warmup: false, runs: [], correctness: null, timing: null, environment: null, gitChanges: [],
    warpdomOptions,
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
    const { runner, bin, config } = detected;
    result.runner = runner;
    result.runnerVersion = packageVersion(path.dirname(path.dirname(bin)), runner) ?? packageVersion(cwd, runner);
    const major = Number.parseInt(result.runnerVersion ?? '', 10) || null;
    const configDir = config ? path.dirname(config) : cwd;
    // Vitest 2 and 3 read a workspace file next to the config; 4 removed them.
    let workspace = runner === 'vitest' && !(major >= 4) ? findVitestWorkspace(configDir) : null;
    if (runner === 'vitest' && !config && !workspace) {
      const file = findVitestWorkspace(cwd);
      throw new CompareError(file ? `Vitest ${result.runnerVersion} does not read ${path.basename(file)} (workspace files were removed in Vitest 4); run compare where your vitest.config is`
        : 'no Vitest config found here (vitest.config.* or vite.config.*); run compare where you run vitest');
    }
    if (options.baseline && !['jsdom', 'happy-dom'].includes(options.baseline)) throw new CompareError('--baseline must be jsdom or happy-dom');

    // Wrappers sit next to the config they wrap; without a config, in cwd.
    const wrapperPath = (file, role) => path.join(file ? path.dirname(file) : cwd, wrapperName(runner, file, role));
    const writeTemp = (file, text) => {
      temp.add(file);
      fs.writeFileSync(file, text);
      return file;
    };
    const minWorkers = runner === 'vitest' && options.workers ? hasMinWorkers(bin) : false;
    const execute = (wrapper, resultsFile, logFile, env = {}, reporter = null) => runProcess(bin, runnerArgs(runner, {
      config: wrapper, resultsFile, workers: options.workers, minWorkers, reporter: runner === 'vitest' ? reporter : null, args,
    }), { cwd, env, timeoutMs, logFile });

    // --- probe: which projects run on a DOM -------------------------------
    const metaFile = path.join(out, 'meta.json');
    const probe = async (probeWorkspace) => {
      fs.rmSync(metaFile, { force: true });
      const file = wrapperPath(config, 'probe');
      writeTemp(file, runner === 'vitest' ? vitestWrapper(config, { major, probeWorkspace }) : jestWrapper(config, { self: file }));
      const res = await execute(file, path.join(out, 'runs', 'probe.json'), path.join(out, 'logs', 'probe.log'),
        { WARPDOM_COMPARE_META: metaFile, WARPDOM_COMPARE_PROBE: '1' });
      temp.remove([file]);
      try {
        return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch {
        const why = firstErrorLine(res.output);
        throw new CompareError(`the ${runner} config could not be loaded${why ? `: ${why}` : ''} (see ${path.relative(cwd, path.join(out, 'logs', 'probe.log'))})`);
      } finally {
        fs.rmSync(metaFile, { force: true });
      }
    };
    let meta = await probe(workspace);
    // A workspace file named by the config (test.workspace, Vitest 2 and 3).
    if (meta.workspace && meta.workspace !== workspace && fs.existsSync(meta.workspace)) {
      workspace = meta.workspace;
      meta = await probe(workspace);
    }
    if (meta.source === 'projects' || meta.source === 'workspace') workspace = null;

    // --- projects in other files -------------------------------------------
    // Strings in test.projects / a workspace / Jest's projects name config
    // files, directories or globs: resolved here as the runner would, each
    // config found gets its own wrappers, and the root wrapper lists them.
    const resolved = runner === 'vitest'
      ? resolveVitestProjects(meta.patterns ?? [], meta.root ?? cwd)
      : resolveJestProjects(meta.patterns ?? [], { rootDir: meta.root ?? configDir, configDir, cwd });
    const isRoot = (file) => Boolean(config) && path.resolve(file) === path.resolve(config);
    const wrappable = (file) => (runner === 'vitest' ? /\.[mc]?[jt]s$/ : /\.([mc]?[jt]s|json)$/).test(file);
    const externalConfigs = new Set();
    let externalDirs = 0;
    for (const entries of resolved.values()) {
      for (const e of entries) {
        if (e.dir) externalDirs++;
        else if (!isRoot(e.config) && wrappable(e.config)) externalConfigs.add(e.config);
      }
    }
    // Inline Vitest projects may extend a config file by path.
    const extendsTargets = new Map();
    for (const value of meta.extends ?? []) {
      const file = [workspace ? path.dirname(workspace) : null, meta.root, configDir].filter(Boolean)
        .map((dir) => path.resolve(dir, value)).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (!file || !wrappable(file)) continue;
      extendsTargets.set(value, file);
      if (!isRoot(file)) externalConfigs.add(file);
    }
    result.external = externalConfigs.size + externalDirs;

    result.projects = meta.projects.map((p) => ({ ...p, dom: !p.browser && isDomEnvironment(runner, p.environment) }));
    const domProjects = result.projects.filter((p) => p.dom);
    // Projects in other files (and inline ones extending them) are only known
    // once they run: compare goes ahead and checks after the first run.
    const unknown = (meta.unknown ?? 0) + result.external;
    if (!domProjects.length && !unknown) {
      const seen = [...new Set(result.projects.map((p) => (p.browser ? 'browser mode' : p.environment)))].join(', ') || 'none';
      throw new CompareError(`nothing to compare: no project runs on jsdom or happy-dom (found: ${seen})`);
    }
    const counts = new Map();
    for (const p of domProjects) {
      const name = /happy-dom/.test(p.environment) ? 'happy-dom' : 'jsdom';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    // Without a DOM project in the root config, the installed DOM decides.
    const guessed = packageDir(cwd, 'jsdom') || !packageDir(cwd, 'happy-dom') ? 'jsdom' : 'happy-dom';
    const baselineName = options.baseline ?? ([...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? guessed);
    const domEnvironment = options.baseline || !domProjects.length ? baselineEnvironment(runner, baselineName) : domProjects[0].environment;
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
    // A reporter that records which project ran each file.
    const reporter = writeTemp(path.join(configDir, `${runner}.config${MARK}reporter.${runner === 'vitest' ? 'mjs' : 'cjs'}`),
      runner === 'vitest' ? vitestReporter() : jestReporter());
    const roles = {
      baseline: { environment: options.baseline ? baselineEnvironment(runner, options.baseline) : null, pinned: baselineName },
      warpdom: { environment: warpdomEnvironment, pinned: PINNED_TARGET, warpdomOptions },
    };
    const wrappers = {};
    for (const [role, { environment, pinned, warpdomOptions: wo = null }] of Object.entries(roles)) {
      const root = wrapperPath(config, role);
      const target = (file) => (isRoot(file) ? root : wrapperPath(file, role));
      const patterns = {};
      for (const [value, entries] of resolved) {
        patterns[value] = entries.map((e) => (e.dir ?? (wrappable(e.config) ? target(e.config) : e.config)));
      }
      const links = { patterns, extends: Object.fromEntries([...extendsTargets].map(([value, file]) => [value, target(file)])), workspace: null };
      if (workspace) {
        links.workspace = writeTemp(path.join(path.dirname(workspace), workspaceWrapperName(workspace, role)),
          vitestWorkspaceWrapper(workspace, { environment, links, warpdomOptions: wo }));
      }
      for (const file of externalConfigs) {
        const own = wrapperPath(file, role);
        writeTemp(own, runner === 'vitest' ? vitestWrapper(file, { environment, pinned, major, warpdomOptions: wo }) : jestWrapper(file, { environment, self: own, warpdomOptions: wo }));
      }
      wrappers[role] = writeTemp(root, runner === 'vitest'
        ? vitestWrapper(config, { environment, pinned, major, links, warpdomOptions: wo })
        : jestWrapper(config, { environment, links, self: root, reporter, warpdomOptions: wo }));
    }
    const pinnedLogs = { baseline: [], warpdom: [] };

    // --- runs ----------------------------------------------------------------
    result.warmup = !correctness && rounds >= 2;
    const pairs = [];
    if (result.warmup) pairs.push({ warmup: true, round: null });
    for (let r = 1; r <= rounds; r++) pairs.push({ warmup: false, round: r });
    const total = pairs.length * 2;
    const tests = { baseline: [], warpdom: [] };
    let pinned = null;
    let projectsRan = false;
    let projectsFromRun = false;
    let checkedSwitch = false;
    for (const [i, pair] of pairs.entries()) {
      for (const side of pairOrder(i)) {
        const index = result.runs.length + 1;
        const name = `${index}-${side}`;
        const resultsFile = path.join(out, 'runs', `${name}.json`);
        const logFile = path.join(out, 'logs', `${name}.log`);
        const label = side === 'baseline' ? baselineName : 'warpdom';
        const pinnedLog = path.join(out, 'logs', `${name}.pinned.tsv`);
        pinnedLogs[side].push(pinnedLog);
        const projectsFile = path.join(out, 'runs', `${name}.projects.json`);
        const res = await execute(wrappers[side], resultsFile, logFile, { WARPDOM_COMPARE_PINNED_LOG: pinnedLog, WARPDOM_COMPARE_PROJECTS: projectsFile }, reporter);
        const report = readReport(resultsFile);
        const ran = readReport(projectsFile);
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
        const runTests = testsOf(report, cwd, ran);
        if (ran?.projects) run.projects = ran.projects.map((p) => ({ name: p.name, environment: p.browser ? 'browser mode' : environmentLabel(p.environment) }));
        run.counts = countsOf(runTests);
        run.runnerMs = runnerDuration(runner, report, res.output);
        tests[side].push(runTests);
        if (!pinned) {
          const files = (report.testResults ?? []).map((t) => t.name);
          const comments = environmentComments(files, runner);
          pinned = [...comments].map(([file, environment]) => ({ file: path.relative(cwd, file).split(path.sep).join('/'), environment }));
        }
        // The projects that ran, from the first (baseline) run: all of them,
        // including those in other files, with their environments.
        if (!projectsRan) {
          projectsRan = true;
          if (ran?.projects?.length) {
            projectsFromRun = true;
            // Jest gives resolved paths: judged by the package name, so a
            // checkout in a directory named after jsdom is not mistaken.
            result.projects = ran.projects.map((p) => ({ ...p, dom: !p.browser && isDomEnvironment(runner, environmentLabel(p.environment)) }));
            const switchable = runner === 'vitest' && pinned.length > 0;
            if (!result.projects.some((p) => p.dom) && !switchable) {
              const seen = [...new Set(result.projects.map((p) => (p.browser ? 'browser mode' : environmentLabel(p.environment))))].join(', ');
              throw new CompareError(`nothing to compare: no project runs on jsdom or happy-dom (found: ${seen})`);
            }
          } else {
            result.warnings.push('could not tell which project ran each test file (the reporter recorded nothing); tests of all projects are compared');
          }
        }
        // A DOM project still on jsdom or happy-dom in the warpdom run (one
        // compare could not reach, e.g. listed by a nested project config)
        // ran the same way twice: not compared, and said so.
        if (side === 'warpdom' && projectsFromRun && !checkedSwitch && ran?.projects) {
          checkedSwitch = true;
          for (const p of ran.projects) {
            const project = result.projects.find((x) => x.name === p.name);
            if (project?.dom && !p.browser && isDomEnvironment(runner, environmentLabel(p.environment))) {
              project.dom = false;
              project.unswitched = true;
            }
          }
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
    // Projects on node or in browser mode ran the same way in both runs:
    // not compared, except files whose comment switched them to a DOM.
    const skipProjects = new Set(projectsFromRun ? result.projects.filter((p) => !p.dom).map((p) => p.name) : []);
    const keepFiles = new Set(pinned.filter((p) => p.switched).map((p) => p.file));
    const c = compareRuns(tests.baseline, tests.warpdom, { skipFiles, skipProjects, keepFiles });
    c.groups = groupDifferences(c.differences);
    result.correctness = c;
    result.pinned = {
      files: pinned.length, tests: c.notComparedFiles, list: pinned,
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
