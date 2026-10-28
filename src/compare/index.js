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
import {
  detectRunner,
  findVitestWorkspace,
  packageDir,
  packageVersion,
  installedWarpdom,
  domVersion,
  environmentComments,
  takeConfigArg,
  scriptNodeFlags,
  scriptRunnerArgs,
} from './detect.js';
import {
  vitestWrapper,
  vitestWorkspaceWrapper,
  vitestReporter,
  jestWrapper,
  jestReporter,
  wrapperName,
  workspaceWrapperName,
  MARK,
  PROBE_MARKER,
  PINNED_TARGET,
  warpdomVitestEnvironment,
  isWarpdomEnvironment,
} from './wrappers.js';
import { resolveVitestProjects, resolveJestProjects } from './projects.js';
import { createRequire } from 'node:module';
import {
  TempFiles,
  copyWarpdom,
  pinnedEnvironmentPackage,
  jestPinnedPackage,
  linkPackage,
  acquireLock,
  gitStatus,
  statusChanges,
} from './files.js';
import {
  runnerArgs,
  hasMinWorkers,
  runProcess,
  currentChild,
  killTree,
  testsOf,
  countsOf,
  runnerDuration,
  readReport,
  stopTree,
} from './run.js';
import { compareRuns, groupDifferences, timingSummary, pairOrder, exitCode } from './results.js';
import { environmentRecord } from './env.js';
import { renderConsole, renderMarkdown, environmentLabel } from './report.js';

export { renderConsole, renderMarkdown } from './report.js';
export { compareRuns, groupDifferences, timingSummary, exitCode } from './results.js';

const SELF = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const isDomEnvironment = (runner, environment) =>
  runner === 'vitest'
    ? environment === 'jsdom' || environment === 'happy-dom'
    : /jsdom|happy-dom/.test(String(environment ?? ''));

// The environment a baseline other than the project's own is given as.
const baselineEnvironment = (runner, name) =>
  runner === 'jest' && name === 'happy-dom' ? '@happy-dom/jest-environment' : name;

// The package that provides a DOM environment to a runner.
const environmentPackage = (runner, name) =>
  runner === 'vitest' ? name : name === 'happy-dom' ? '@happy-dom/jest-environment' : 'jest-environment-jsdom';

const DOM_NAMES = ['jsdom', 'happy-dom'];

// No project on jsdom or happy-dom. A project already on warpdom (migrated)
// is compared only with --baseline, which names the DOM to run it on.
// unswitched: projects on warpdom that still ran on warpdom in the baseline
// run (--baseline), which compare could not reach.
const nothingToCompare = (environments, baseline, unswitched = 0) => {
  const seen = [...new Set(environments)];
  let hint = '';
  if (!baseline && seen.some(isWarpdomEnvironment))
    hint =
      '; the project already runs on warpdom: add --baseline jsdom (or happy-dom) to run its baseline on that DOM, which must be installed';
  else if (unswitched)
    hint = `; ${unswitched === 1 ? '1 project' : `${unswitched} projects`} on warpdom still ran on warpdom in the ${baseline} run: compare could not switch ${unswitched === 1 ? 'it' : 'them'} (projects listed inside a project config file are not reached)`;
  return new CompareError(
    `nothing to compare: no project runs on jsdom or happy-dom (found: ${seen.join(', ') || 'none'})${hint}`,
  );
};

// Whether a run switched an environment already on warpdom: a project
// (the wrappers' log) or a file's comment (the pinned log: path, original
// name, options).
const switchedFromWarpdom = (fromWarpdomLog, pinnedLog) => {
  const read = (file) => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  };
  return (
    read(fromWarpdomLog).trim() !== '' ||
    read(pinnedLog)
      .split('\n')
      .some((line) => isWarpdomEnvironment(line.split('\t')[1]))
  );
};

const firstErrorLine = (output) =>
  output
    .split('\n')
    .slice(1)
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
    .find((l) => /error/i.test(l) && !l.includes(PROBE_MARKER)) ?? '';

// Jest comment values the pinned package switches.
const JEST_JSDOM = new Set(['jsdom', 'jest-environment-jsdom']);

// Options (docs/compare.md): cwd, out, rounds, correctness, workers,
// baseline, runner, timeout (minutes), args (runner arguments), log,
// fastFrames. API only (not in the CLI), for the corpus timing in
// bench/corpus/:
// - env: environment variables for every run (e.g. TZ: 'UTC');
// - alsoEnvironments: other DOMs to run in every round as well, e.g.
//   ['happy-dom'] (jsdom or happy-dom; the baseline's own name is ignored).
//   Each gets its runs, its comparison with the baseline and its times in
//   result.also[name]; the exit code still depends on warpdom alone;
// - domPackages: a node_modules directory to take DOM packages from that
//   the project lacks (jsdom, happy-dom, jest-environment-jsdom,
//   @happy-dom/jest-environment): Vitest gets a link next to its own
//   node_modules for the run, Jest the package's path;
// - warmup: whether an untimed warm-up group runs first (default: with 2
//   or more rounds);
// - requireDom: false runs a package whose projects are all on node anyway
//   (nothing switches; its tests are not compared), so a corpus project's
//   time covers all its packages. Browser-mode-only packages still stop.
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
  const extraEnv = options.env ?? {};
  const domPackages = options.domPackages ? path.resolve(options.domPackages) : null;
  // Paths in messages: relative when inside cwd, else absolute.
  const shown = (file) => displayPath(file, cwd);
  const result = {
    version: 1,
    cwd,
    out,
    mode: correctness ? 'correctness' : 'timing',
    exitCode: 2,
    error: null,
    fromWarpdom: false,
    warnings: [],
    runner: null,
    runnerVersion: null,
    baseline: null,
    warpdom: null,
    projects: [],
    external: 0,
    pinned: null,
    warmup: false,
    runs: [],
    correctness: null,
    timing: null,
    environment: null,
    gitChanges: [],
    warpdomOptions,
    also: null,
    env: Object.keys(extraEnv),
  };

  let release = null;
  let temp = null;
  const cleanup = () => {
    if (temp) {
      try {
        temp.remove();
      } catch (err) {
        result.warnings.push(`cleanup failed: ${err.message}`);
      }
    }
    release?.();
    release = null;
  };
  let stopping = false;
  const onSignal = async (signal) => {
    if (stopping) return;
    stopping = true;
    // The runner's workers can still write while they shut down: wait until
    // they are gone before removing the temporary files.
    await stopTree(currentChild());
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
    // What the test script passes its runner (handsontable's angular
    // wrapper: jest --config projects/hot-table/jest.config.js), unless the
    // runner arguments say otherwise.
    const script = scriptRunnerArgs(cwd, options.runner ?? null);
    const scriptConfig = !configArg && script?.config ? script.config : null;
    const detected = detectRunner(
      cwd,
      scriptConfig
        ? { runner: script.runner, config: scriptConfig }
        : { runner: options.runner ?? null, config: configArg },
    );
    if (detected.error)
      throw new CompareError(scriptConfig ? `${detected.error} (from the test script)` : detected.error);
    const { runner, bin, config } = detected;
    if (scriptConfig) log(`Config from the test script: ${scriptConfig}`);
    if (
      runner === 'vitest' &&
      script?.runner === 'vitest' &&
      script.projects.length &&
      !args.some((a) => a === '--project' || a.startsWith('--project='))
    ) {
      args.push(...script.projects.flatMap((name) => ['--project', name]));
      log(`Projects from the test script: ${script.projects.join(', ')}`);
    }
    result.runner = runner;
    result.runnerVersion = packageVersion(path.dirname(path.dirname(bin)), runner) ?? packageVersion(cwd, runner);
    const major = Number.parseInt(result.runnerVersion ?? '', 10) || null;
    const configDir = config ? path.dirname(config) : cwd;
    // Vitest 2 and 3 read a workspace file next to the config; 4 removed them.
    let workspace = runner === 'vitest' && !(major >= 4) ? findVitestWorkspace(configDir) : null;
    if (runner === 'vitest' && !config && !workspace) {
      const file = findVitestWorkspace(cwd);
      throw new CompareError(
        file
          ? `Vitest ${result.runnerVersion} does not read ${path.basename(file)} (workspace files were removed in Vitest 4); run compare where your vitest.config is`
          : 'no Vitest config found here (vitest.config.* or vite.config.*); run compare where you run vitest',
      );
    }
    if (options.baseline && !DOM_NAMES.includes(options.baseline))
      throw new CompareError('--baseline must be jsdom or happy-dom');
    // With --baseline, projects and files already on warpdom (a migrated
    // project) run on that DOM in the baseline runs and on warpdom in the
    // warpdom runs, like those on jsdom or happy-dom.
    const fromWarpdom = Boolean(options.baseline);
    const isCompared = (environment) =>
      isDomEnvironment(runner, environment) || (fromWarpdom && isWarpdomEnvironment(environment));
    for (const name of options.alsoEnvironments ?? []) {
      if (!DOM_NAMES.includes(name)) throw new CompareError(`alsoEnvironments: ${name} is not jsdom or happy-dom`);
    }

    // Wrappers sit next to the config they wrap; without a config, in cwd.
    const wrapperPath = (file, role) => path.join(file ? path.dirname(file) : cwd, wrapperName(runner, file, role));
    const writeTemp = (file, text) => {
      temp.add(file);
      fs.writeFileSync(file, text);
      return file;
    };
    const minWorkers = runner === 'vitest' && options.workers ? hasMinWorkers(bin) : false;
    // Node flags the project's test script gives the runner (react-router:
    // node --experimental-vm-modules .../jest.js), passed on in NODE_OPTIONS.
    const nodeFlags = scriptNodeFlags(cwd, runner);
    result.nodeOptions = nodeFlags.length ? nodeFlags.join(' ') : null;
    if (result.nodeOptions) log(`Node flags from the test script: ${result.nodeOptions}`);
    const nodeEnv = result.nodeOptions
      ? { NODE_OPTIONS: [process.env.NODE_OPTIONS, result.nodeOptions].filter(Boolean).join(' ') }
      : {};
    const execute = (wrapper, resultsFile, logFile, env = {}, reporter = null) =>
      runProcess(
        bin,
        runnerArgs(runner, {
          config: wrapper,
          resultsFile,
          workers: options.workers,
          minWorkers,
          reporter: runner === 'vitest' ? reporter : null,
          args,
        }),
        { cwd, env: { ...nodeEnv, ...extraEnv, ...env }, timeoutMs, logFile },
      );
    // When a run fails to start, a hint for runners that need node flags.
    const flagsHint = () =>
      result.nodeOptions
        ? ''
        : '; if the project runs its test runner with node flags (node --experimental-vm-modules ...), set them in NODE_OPTIONS';

    // --- probe: which projects run on a DOM -------------------------------
    const metaFile = path.join(out, 'meta.json');
    const probe = async (probeWorkspace) => {
      fs.rmSync(metaFile, { force: true });
      const file = wrapperPath(config, 'probe');
      writeTemp(
        file,
        runner === 'vitest' ? vitestWrapper(config, { major, probeWorkspace }) : jestWrapper(config, { self: file }),
      );
      const res = await execute(file, path.join(out, 'runs', 'probe.json'), path.join(out, 'logs', 'probe.log'), {
        WARPDOM_COMPARE_META: metaFile,
        WARPDOM_COMPARE_PROBE: '1',
      });
      temp.remove([file]);
      try {
        return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch {
        const why = firstErrorLine(res.output);
        throw new CompareError(
          `the ${runner} config could not be loaded${why ? `: ${why}` : ''} (see ${shown(path.join(out, 'logs', 'probe.log'))})${flagsHint()}`,
        );
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
    const resolved =
      runner === 'vitest'
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
      const file = [workspace ? path.dirname(workspace) : null, meta.root, configDir]
        .filter(Boolean)
        .map((dir) => path.resolve(dir, value))
        .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (!file || !wrappable(file)) continue;
      extendsTargets.set(value, file);
      if (!isRoot(file)) externalConfigs.add(file);
    }
    result.external = externalConfigs.size + externalDirs;

    result.projects = meta.projects.map(({ root: _root, ...p }) => ({
      ...p,
      dom: !p.browser && isCompared(p.environment),
    }));
    const domProjects = result.projects.filter((p) => p.dom);
    // Projects in other files (and inline ones extending them) are only known
    // once they run: compare goes ahead and checks after the first run.
    const unknown = (meta.unknown ?? 0) + result.external;
    const nodeOnly = options.requireDom === false && result.projects.some((p) => !p.browser);
    // With --baseline, test files may choose a DOM (or warpdom, after
    // migrate) with a comment in projects on node: those are read from the
    // first run, which decides (projects, pinned files) after it.
    const commentsDecide = Boolean(options.baseline) && result.projects.some((p) => !p.browser);
    if (!domProjects.length && !unknown && !nodeOnly && !commentsDecide)
      throw nothingToCompare(
        result.projects.map((p) => (p.browser ? 'browser mode' : p.environment)),
        options.baseline,
      );
    result.fromWarpdom = domProjects.some((p) => isWarpdomEnvironment(p.environment));
    const counts = new Map();
    for (const p of domProjects) {
      const name = /happy-dom/.test(p.environment) ? 'happy-dom' : 'jsdom';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    // Without a DOM project in the root config, the installed DOM decides.
    const guessed = packageDir(cwd, 'jsdom') || !packageDir(cwd, 'happy-dom') ? 'jsdom' : 'happy-dom';
    const baselineName = options.baseline ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? guessed;
    // A DOM the project does not have comes from domPackages (API option):
    // Vitest loads it by name, so it is linked next to Vitest's own
    // node_modules; Jest takes the environment package's path.
    const binModules = path.dirname(path.dirname(bin));
    const provided = [];
    const environmentFor = (name) => {
      const pkg = environmentPackage(runner, name);
      const fallback = baselineEnvironment(runner, name);
      if (packageDir(cwd, pkg) || !domPackages || !fs.existsSync(path.join(domPackages, pkg, 'package.json')))
        return fallback;
      provided.push(name);
      if (runner === 'jest') return path.join(domPackages, pkg);
      linkPackage(binModules, pkg, path.join(domPackages, pkg), temp);
      return fallback;
    };
    const domEnvironment =
      options.baseline || !domProjects.length ? environmentFor(baselineName) : domProjects[0].environment;
    result.baseline = domVersion(cwd, runner, domEnvironment);
    result.baseline.name = baselineName;
    // Other DOMs run in every round too (alsoEnvironments).
    const extras = [...new Set(options.alsoEnvironments ?? [])].filter((name) => name !== baselineName);
    const extraEnvironments = Object.fromEntries(extras.map((name) => [name, environmentFor(name)]));
    // The version of a provided DOM, which domVersion cannot see from cwd.
    const versionOf = (info, name) =>
      info.version || !provided.includes(name)
        ? info
        : { ...info, version: packageVersion(path.dirname(domPackages), name) };
    if (extras.length) {
      result.also = Object.fromEntries(
        extras.map((name) => [
          name,
          {
            environment: { ...versionOf(domVersion(cwd, runner, extraEnvironments[name]), name), name },
            provided: provided.includes(name),
            correctness: null,
            timing: null,
          },
        ]),
      );
    }
    if (provided.includes(baselineName))
      result.baseline = { ...versionOf(result.baseline, baselineName), provided: true };
    // A migrated project may no longer have the DOM it is compared with:
    // checked here for the projects in the root config, and after the first
    // baseline run for those in other files and the files choosing warpdom
    // with a comment (only known from the run). Looked up where the runner
    // looks: Vitest loads jsdom and happy-dom from its own location, Jest an
    // environment from each project's rootDir (those of the root config's
    // projects on warpdom; the directory compare runs in for the others).
    const baselinePackage = environmentPackage(runner, baselineName);
    let baselineDirs = meta.projects.filter((p) => isWarpdomEnvironment(p.environment) && p.root).map((p) => p.root);
    if (runner === 'vitest')
      baselineDirs = [packageDir(path.dirname(path.dirname(path.dirname(bin))), 'vitest') ?? cwd];
    if (!baselineDirs.length) baselineDirs = [cwd];
    const baselineMissing = () =>
      result.fromWarpdom &&
      !provided.includes(baselineName) &&
      baselineDirs.some((dir) => !packageDir(dir, baselinePackage));
    const baselineMissingError = () =>
      new CompareError(
        `--baseline ${baselineName}: ${baselinePackage} is not installed here; install the version the tests used before (npm install --no-save ${baselinePackage}@<version>) and run compare again`,
      );
    if (!domProjects.some((p) => isDomEnvironment(runner, p.environment)) && baselineMissing())
      throw baselineMissingError();

    // --- warpdom inside the project ---------------------------------------
    let warpdomDir = installedWarpdom(cwd);
    result.warpdom = { source: warpdomDir ? 'installed' : 'copied' };
    const nodeModules = fs.existsSync(path.join(cwd, 'node_modules'))
      ? path.join(cwd, 'node_modules')
      : path.dirname(path.dirname(bin));
    if (!warpdomDir) warpdomDir = copyWarpdom(SELF, nodeModules, temp);
    try {
      result.warpdom.version = JSON.parse(fs.readFileSync(path.join(warpdomDir, 'package.json'), 'utf8')).version;
    } catch {
      /* unknown */
    }
    const warpdomEnvironment = path.join(warpdomDir, 'src', runner === 'vitest' ? 'vitest.js' : 'jest.js');
    result.environment = environmentRecord({
      cwd,
      runner,
      runnerVersion: result.runnerVersion,
      dom: result.baseline,
      warpdomDir: result.warpdom.source === 'installed' ? warpdomDir : SELF,
    });

    // Vitest: test files that pin jsdom or happy-dom with a comment are
    // switched too, to the baseline (a happy-dom pin becomes jsdom on a
    // jsdom baseline, and the other way round) and to warpdom, through a
    // package Vitest resolves for the name warpdom-compare, which the
    // switched projects use too.
    if (runner === 'vitest') pinnedEnvironmentPackage(nodeModules, warpdomEnvironment, temp);
    // A reporter that records which project ran each file.
    const reporter = writeTemp(
      path.join(configDir, `${runner}.config${MARK}reporter.${runner === 'vitest' ? 'mjs' : 'cjs'}`),
      runner === 'vitest' ? vitestReporter() : jestReporter(),
    );
    const roles = {
      baseline: { environment: options.baseline ? domEnvironment : null, pinned: baselineName },
      // Vitest: the pinned files' name, so the grouping matches jsdom's
      // (warpdomVitestEnvironment).
      warpdom: {
        ...(runner === 'vitest' ? warpdomVitestEnvironment(warpdomEnvironment) : { environment: warpdomEnvironment }),
        pinned: PINNED_TARGET,
        warpdomOptions,
      },
    };
    for (const name of extras) roles[name] = { environment: extraEnvironments[name], pinned: name };
    const sides = ['baseline', 'warpdom', ...extras];
    const wrappers = {};
    for (const [role, { environment, environmentId = null, pinned, warpdomOptions: wo = null }] of Object.entries(
      roles,
    )) {
      const root = wrapperPath(config, role);
      const target = (file) => (isRoot(file) ? root : wrapperPath(file, role));
      const patterns = {};
      for (const [value, entries] of resolved) {
        patterns[value] = entries.map((e) => e.dir ?? (wrappable(e.config) ? target(e.config) : e.config));
      }
      const links = {
        patterns,
        extends: Object.fromEntries([...extendsTargets].map(([value, file]) => [value, target(file)])),
        workspace: null,
      };
      if (workspace) {
        links.workspace = writeTemp(
          path.join(path.dirname(workspace), workspaceWrapperName(workspace, role)),
          vitestWorkspaceWrapper(workspace, { environment, environmentId, links, warpdomOptions: wo, fromWarpdom }),
        );
      }
      for (const file of externalConfigs) {
        const own = wrapperPath(file, role);
        writeTemp(
          own,
          runner === 'vitest'
            ? vitestWrapper(file, { environment, environmentId, pinned, major, warpdomOptions: wo, fromWarpdom })
            : jestWrapper(file, { environment, self: own, warpdomOptions: wo, fromWarpdom }),
        );
      }
      wrappers[role] = writeTemp(
        root,
        runner === 'vitest'
          ? vitestWrapper(config, { environment, environmentId, pinned, major, links, warpdomOptions: wo, fromWarpdom })
          : jestWrapper(config, { environment, links, self: root, reporter, warpdomOptions: wo, fromWarpdom }),
      );
    }
    const pinnedLogs = Object.fromEntries(sides.map((side) => [side, []]));

    // --- runs ----------------------------------------------------------------
    result.warmup = !correctness && (options.warmup ?? rounds >= 2);
    const pairs = [];
    if (result.warmup) pairs.push({ warmup: true, round: null });
    for (let r = 1; r <= rounds; r++) pairs.push({ warmup: false, round: r });
    const total = pairs.length * sides.length;
    const tests = Object.fromEntries(sides.map((side) => [side, []]));
    // Jest: the environment file a pinned-jsdom package re-exports, per side.
    const jestPinnedTarget = (side) => {
      if (runner !== 'jest' || baselineName !== 'jsdom') return null;
      if (side === 'warpdom') return warpdomEnvironment;
      if (side !== 'happy-dom') return null;
      try {
        return createRequire(path.join(cwd, 'package.json')).resolve(extraEnvironments[side]);
      } catch {
        return null;
      }
    };
    let pinned = null;
    let projectsRan = false;
    let projectsFromRun = false;
    let checkedSwitch = false;
    let jestSwitched = false;
    for (const [i, pair] of pairs.entries()) {
      for (const side of pairOrder(i, sides)) {
        const index = result.runs.length + 1;
        const name = `${index}-${side}`;
        const resultsFile = path.join(out, 'runs', `${name}.json`);
        const logFile = path.join(out, 'logs', `${name}.log`);
        const label = side === 'baseline' ? baselineName : side;
        const pinnedLog = path.join(out, 'logs', `${name}.pinned.tsv`);
        pinnedLogs[side].push(pinnedLog);
        const projectsFile = path.join(out, 'runs', `${name}.projects.json`);
        // The warpdom environments the wrappers switched (fromWarpdom).
        const fromWarpdomLog = path.join(out, 'logs', `${name}.from-warpdom.log`);
        // Jest: files pinned to jsdom switch to warpdom in warpdom runs only
        // (on a jsdom baseline; the package exists just for the run), and to
        // happy-dom in happy-dom runs (alsoEnvironments).
        const shimTarget = jestPinnedTarget(side);
        const jestShim = shimTarget ? jestPinnedPackage(nodeModules, shimTarget, temp) : null;
        if (jestShim && side === 'warpdom') jestSwitched = true;
        let res;
        try {
          res = await execute(
            wrappers[side],
            resultsFile,
            logFile,
            {
              WARPDOM_COMPARE_PINNED_LOG: pinnedLog,
              WARPDOM_COMPARE_PROJECTS: projectsFile,
              WARPDOM_COMPARE_FROM_WARPDOM_LOG: fromWarpdomLog,
            },
            reporter,
          );
        } finally {
          if (jestShim) temp.remove([jestShim]);
        }
        const report = readReport(resultsFile);
        const ran = readReport(projectsFile);
        const run = {
          index,
          side,
          warmup: pair.warmup,
          round: pair.round,
          code: res.code,
          signal: res.signal,
          wallMs: Math.round(res.ms),
          log: path.relative(out, logFile),
          results: path.relative(out, resultsFile),
        };
        result.runs.push(run);
        // Projects in other config files and files choosing warpdom with a
        // comment: only the run shows that the project is on warpdom.
        if (fromWarpdom && !result.fromWarpdom && switchedFromWarpdom(fromWarpdomLog, pinnedLog))
          result.fromWarpdom = true;
        const noBaseline = side === 'baseline' && baselineMissing();
        if (res.timedOut)
          throw new CompareError(
            `the ${label} run timed out after ${options.timeout ?? 30} min (see ${shown(logFile)})`,
          );
        if (!report) {
          if (noBaseline) throw baselineMissingError();
          const why = firstErrorLine(res.output);
          throw new CompareError(
            `the ${label} run produced no results${why ? `: ${why}` : ''} (see ${shown(logFile)})${flagsHint()}`,
          );
        }
        // Vitest runs the other projects when one cannot load its
        // environment (Jest stops at the config): their tests do not make
        // the comparison valid.
        if (noBaseline && runner === 'vitest') throw baselineMissingError();
        const runTests = testsOf(report, cwd, ran);
        if (ran?.projects)
          run.projects = ran.projects.map((p) => ({
            name: p.name,
            environment: p.browser ? 'browser mode' : environmentLabel(p.environment),
          }));
        run.counts = countsOf(runTests);
        run.runnerMs = runnerDuration(runner, report, res.output);
        tests[side].push(runTests);
        if (!pinned) {
          const files = (report.testResults ?? []).map((t) => t.name);
          const comments = environmentComments(files, runner, { warpdom: fromWarpdom });
          pinned = [...comments].map(([file, environment]) => ({
            file: path.relative(cwd, file).split(path.sep).join('/'),
            environment,
          }));
          if (pinned.some((p) => isWarpdomEnvironment(p.environment))) result.fromWarpdom = true;
        }
        // The projects that ran, from the first (baseline) run: all of them,
        // including those in other files, with their environments.
        if (!projectsRan) {
          projectsRan = true;
          if (ran?.projects?.length) {
            projectsFromRun = true;
            // Jest gives resolved paths: judged by the package name, so a
            // checkout in a directory named after jsdom is not mistaken.
            // With --baseline, a project still on warpdom in the baseline run
            // (one compare could not reach, e.g. listed by a nested project
            // config) ran on warpdom twice: not compared, and said so.
            result.projects = ran.projects.map((p) => {
              const environment = environmentLabel(p.environment);
              const stayed = fromWarpdom && side === 'baseline' && !p.browser && isWarpdomEnvironment(environment);
              return stayed
                ? { ...p, dom: false, unswitched: true }
                : { ...p, dom: !p.browser && isCompared(environment) };
            });
            // Browser-mode projects are left out of both runs: listed as not run.
            for (const p of meta.projects.filter((x) => x.browser)) {
              if (!result.projects.some((x) => x.name === p.name))
                result.projects.push({ ...p, dom: false, notRun: true });
            }
            const switchable =
              pinned.length > 0 &&
              (runner === 'vitest' || (baselineName === 'jsdom' && pinned.some((p) => JEST_JSDOM.has(p.environment))));
            if (
              !result.projects.some((p) => p.dom) &&
              !switchable &&
              !(options.requireDom === false && result.projects.some((p) => !p.browser))
            ) {
              if (noBaseline) throw baselineMissingError();
              throw nothingToCompare(
                result.projects.map((p) => (p.browser ? 'browser mode' : environmentLabel(p.environment))),
                options.baseline,
                result.projects.filter((p) => p.unswitched).length,
              );
            }
          } else {
            result.warnings.push(
              'could not tell which project ran each test file (the reporter recorded nothing); tests of all projects are compared',
            );
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
        log(
          `  [${index}/${total}] ${label.padEnd(9)} ${(pair.warmup ? 'warm-up' : correctness ? '' : `round ${pair.round}`).padEnd(8)} ${((run.runnerMs ?? run.wallMs) / 1000).toFixed(1).padStart(6)} s  ${run.counts.passed} passed, ${run.counts.failed} failed${run.counts.skipped ? `, ${run.counts.skipped} skipped` : ''}`,
        );
        if (side === 'baseline' && i === 0 && run.counts.tests === 0) {
          if (noBaseline) throw baselineMissingError();
          throw new CompareError(`no tests ran on ${label} (see ${shown(logFile)})${flagsHint()}`);
        }
      }
    }

    // --- results -------------------------------------------------------------
    // Files whose comment the wrapper switched: file -> { environment, options }.
    const switchedIn = (logs) => {
      const files = new Map();
      for (const logFile of logs) {
        let text = '';
        try {
          text = fs.readFileSync(logFile, 'utf8');
        } catch {
          continue;
        }
        for (const line of text.split('\n').filter(Boolean)) {
          const [file, environment, options] = line.split('\t');
          files.set(path.relative(cwd, file).split(path.sep).join('/'), {
            environment,
            options: options === 'options',
          });
        }
      }
      return files;
    };
    const switched = switchedIn(pinnedLogs.warpdom);
    const switchedOnBaseline = switchedIn(pinnedLogs.baseline);
    for (const p of pinned) {
      p.switched = switched.has(p.file) || (jestSwitched && JEST_JSDOM.has(p.environment));
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
      files: pinned.length,
      tests: c.notComparedFiles,
      list: pinned,
      environments: [...new Set(pinned.map((p) => p.environment))],
      switched: pinned.filter((p) => p.switched).length,
      switchedEnvironments: [...new Set(pinned.filter((p) => p.switched).map((p) => p.environment))],
      withOptions: pinned.filter((p) => p.options).length,
      notSwitched: pinned.length - pinned.filter((p) => p.switched).length,
      notSwitchedEnvironments: [...new Set(pinned.filter((p) => !p.switched).map((p) => p.environment))],
    };
    for (const name of extras) {
      const e = compareRuns(tests.baseline, tests[name], { skipFiles, skipProjects, keepFiles });
      e.groups = groupDifferences(e.differences);
      result.also[name].correctness = e;
    }
    if (!correctness) {
      const timed = result.runs.filter((r) => !r.warmup);
      const source = timed.every((r) => r.runnerMs != null) ? 'runner' : 'wall';
      for (const r of result.runs) r.ms = source === 'runner' ? r.runnerMs : r.wallMs;
      const perRound = [];
      const of = (r, side) => timed.find((x) => x.round === r && x.side === side).ms;
      for (let r = 1; r <= rounds; r++) {
        perRound.push({ round: r, baselineMs: of(r, 'baseline'), warpdomMs: of(r, 'warpdom') });
      }
      result.timing = { ...timingSummary(perRound), perRound, source };
      // The other DOMs: their times, and their speed against the baseline
      // (speedup > 1: faster than the baseline).
      for (const name of extras) {
        const rows = perRound.map((p) => ({ round: p.round, baselineMs: p.baselineMs, warpdomMs: of(p.round, name) }));
        const t = timingSummary(rows);
        result.also[name].timing = {
          ms: t.warpdomMs,
          baselineMs: t.baselineMs,
          speedup: t.speedup,
          ratios: t.ratios,
          spread: t.spread,
          perRound: rows.map((x) => ({ round: x.round, ms: x.warpdomMs })),
          source,
        };
      }
    } else {
      for (const r of result.runs) r.ms = r.runnerMs ?? r.wallMs;
    }
    result.exitCode = exitCode({ regressions: c.regressions });
  } catch (err) {
    // Stopped by a signal: the runner died because of it, not an error.
    // The signal handler waits for the runner's processes, cleans up and
    // exits; nothing more happens here.
    if (stopping) await new Promise(() => {});
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

// A path for messages: relative to dir when it is inside dir, else absolute
// (a relative path out of dir, ../../.., is longer and harder to follow).
export function displayPath(file, dir) {
  const rel = path.relative(dir, file);
  return rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? file : rel;
}

// The terminal summary for a result, with the report's path relative to dir.
export function summary(result, dir = process.cwd()) {
  return renderConsole(result, { reportPath: displayPath(path.join(result.out, 'report.md'), dir) });
}
