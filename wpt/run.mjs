#!/usr/bin/env node
// WPT conformance runner for warpdom (and jsdom as a reference).
//
//   node wpt/run.mjs dom/nodes dom/events [--engine warpdom,jsdom]
//     [--wpt ~/Projects/wpt] [--warpdom <checkout>] [--sample 30 --seed 1]
//     [--jobs 1] [--max-memory 1536] [--timeout-multiplier 1] [--filter text] [--no-skip]
//     [--include-testdriver] [--include-tentative]
//     [--out wpt/results/<name>] [--depth N]
//
// Writes <out>/<engine>.json (every file and subtest) and <out>/summary.md
// (per-directory table per engine, and a side-by-side table when several
// engines ran). See wpt/README.md.
import { fork, execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, cpus, totalmem, freemem, platform, release } from 'node:os';
import { createRequire } from 'node:module';
import { discover, sample } from './lib/discover.mjs';
import { markdownTable, compareTable } from './lib/summary.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    paths: [], engines: ['warpdom'], wpt: process.env.WPT_DIR ?? join(homedir(), 'Projects/wpt'),
    warpdom: resolve(here, '..'), sample: 0, seed: 1, jobs: 1, maxMemory: 1536, timeoutMultiplier: 1, filter: null,
    skip: true, testdriver: false, tentative: false, out: null, depth: 0, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--engine') opts.engines = next().split(',');
    else if (a === '--wpt') opts.wpt = resolve(next());
    else if (a === '--warpdom') opts.warpdom = resolve(next());
    else if (a === '--sample') opts.sample = Number(next());
    else if (a === '--seed') opts.seed = Number(next());
    else if (a === '--jobs') opts.jobs = Math.max(1, Number(next()));
    else if (a === '--max-memory') opts.maxMemory = Math.max(256, Number(next()));
    else if (a === '--timeout-multiplier') opts.timeoutMultiplier = Number(next());
    else if (a === '--filter') opts.filter = next();
    else if (a === '--no-skip') opts.skip = false;
    else if (a === '--include-testdriver') opts.testdriver = true;
    else if (a === '--include-tentative') opts.tentative = true;
    else if (a === '--out') opts.out = resolve(next());
    else if (a === '--depth') opts.depth = Number(next());
    else if (a === '--quiet') opts.quiet = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.paths.push(a.replace(/^\/+/, ''));
  }
  if (!opts.paths.length) throw new Error('give one or more WPT paths, e.g. dom/nodes');
  return opts;
}

const git = (dir, ...args) => {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim(); } catch { return null; }
};

function environment(opts, engine) {
  const require = createRequire(join(opts.warpdom, 'package.json'));
  let engineVersion = null;
  if (engine === 'jsdom') engineVersion = require('jsdom/package.json').version;
  const dirty = git(opts.warpdom, 'status', '--porcelain', '--', 'src');
  return {
    engine,
    engineVersion,
    warpdomCommit: git(opts.warpdom, 'rev-parse', 'HEAD'),
    warpdomSrcDirty: dirty ? true : false,
    wptCommit: git(opts.wpt, 'rev-parse', 'HEAD'),
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? null,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    date: new Date().toISOString(),
    paths: opts.paths,
    sample: opts.sample ? { n: opts.sample, seed: opts.seed } : null,
    filter: opts.filter,
    timeoutMultiplier: opts.timeoutMultiplier,
    expectationsApplied: opts.skip,
    testdriverIncluded: opts.testdriver,
    tentativeIncluded: opts.tentative,
  };
}

// Skip entries: { path, reason, engines? }. A path ending in "/" matches a
// directory prefix; otherwise it matches a file or a test id exactly.
function loadExpectations() {
  const file = join(here, 'expectations.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')).skip ?? [];
}

function skipReason(test, engine, entries) {
  for (const e of entries) {
    if (e.engines && !e.engines.includes(engine)) continue;
    const match = e.path.endsWith('/') ? test.id.startsWith(e.path) : (test.id === e.path || test.file === e.path);
    if (match) return e.reason;
  }
  return null;
}

function skipFor(test, engine, opts, expectations) {
  if (!opts.testdriver && test.testdriver) return 'needs testdriver.js (user input automation through WebDriver)';
  if (!opts.tentative && test.tentative) return 'tentative (proposal, not yet in a standard)';
  return opts.skip ? skipReason(test, engine, expectations) : null;
}

function runOne(test, engine, opts) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const streamed = [];
    let log = '';
    let done = false;
    const child = fork(join(here, 'lib/child.mjs'), [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      // The JS heap limit leaves room under the memory limit for native
      // memory (buffers, code), which the watchdog below counts too.
      execArgv: [`--max-old-space-size=${Math.floor(opts.maxMemory * 0.75)}`, '--experimental-vm-modules', '--no-warnings'],
    });
    // Memory watchdog: the process's resident memory, polled from here (a
    // check inside the test process would not run during a long synchronous
    // test). Over the limit, the file ends as a CRASH with what it reported.
    const watchdog = setInterval(() => {
      execFile('ps', ['-o', 'rss=', '-p', String(child.pid)], (error, out) => {
        const kb = Number.parseInt(out, 10);
        if (!error && kb > opts.maxMemory * 1024) {
          end({ harness: 'CRASH', message: `runner: memory limit exceeded (${Math.round(kb / 1024)} MB resident, limit ${opts.maxMemory} MB), process killed` });
        }
      });
    }, 250);
    const keep = (chunk) => { log = (log + chunk).slice(-4000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const hardTimeout = (test.long ? 60000 : 10000) * opts.timeoutMultiplier + 15000;
    const end = (record) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(watchdog);
      child.kill('SIGKILL');
      const durationMs = Date.now() - started;
      const result = { file: test.file, harness: record.harness, message: record.message ?? null, durationMs, subtests: record.subtests ?? streamed };
      if (record.stack) result.stack = record.stack;
      if (record.notes?.length) result.notes = record.notes;
      if (result.harness !== 'OK' && log.trim()) result.log = log.trim();
      resolveRun(result);
    };
    const timer = setTimeout(() => end({ harness: 'TIMEOUT', message: 'runner: hard timeout, process killed' }), hardTimeout);
    child.on('message', (m) => {
      if (m.type === 'result') streamed.push(m.subtest);
      else if (m.type === 'complete') end(m);
    });
    child.on('exit', (code, signal) => end({ harness: 'CRASH', message: `runner: process exited (${signal ?? code}) without completion` }));
    child.send({ test, engine, wptRoot: opts.wpt, warpdomDir: opts.warpdom, timeoutMultiplier: opts.timeoutMultiplier });
  });
}

async function runEngine(engine, tests, opts, expectations, notRunnable) {
  const run = { meta: environment(opts, engine), results: {}, skipped: {}, notRunnable: {} };
  for (const n of notRunnable) run.notRunnable[n.id] = n.reason;
  const queue = [];
  for (const t of tests) {
    const reason = skipFor(t, engine, opts, expectations);
    if (reason) run.skipped[t.id] = reason;
    else queue.push(t);
  }
  const started = Date.now();
  let index = 0;
  let finished = 0;
  const worker = async () => {
    while (index < queue.length) {
      const test = queue[index++];
      const r = await runOne(test, engine, opts);
      run.results[test.id] = r;
      finished++;
      if (!opts.quiet) {
        const passed = r.subtests.filter((s) => s.status === 'PASS').length;
        process.stderr.write(`[${engine} ${finished}/${queue.length}] ${r.harness.padEnd(7)} ${String(passed).padStart(4)}/${String(r.subtests.length).padEnd(4)} ${(r.durationMs / 1000).toFixed(1).padStart(5)}s ${test.id}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.jobs, queue.length) }, worker));
  run.meta.wallClockMs = Date.now() - started;
  // Stable key order.
  run.results = Object.fromEntries(Object.entries(run.results).sort(([a], [b]) => (a < b ? -1 : 1)));
  return run;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Each test process may use up to --max-memory; warn when the parallel
  // processes could take more than half of the memory free now.
  const plannedMb = opts.jobs * opts.maxMemory;
  const freeMb = Math.round(freemem() / 1048576);
  if (plannedMb > freeMb / 2) {
    process.stderr.write(`warning: --jobs ${opts.jobs} x --max-memory ${opts.maxMemory} MB = ${plannedMb} MB, more than half of the ${freeMb} MB free; consider --jobs 1 or running large directories (html/dom) separately\n`);
  }
  let { tests, notRunnable } = discover(opts.wpt, opts.paths);
  if (opts.filter) tests = tests.filter((t) => t.id.includes(opts.filter));
  const expectations = loadExpectations();
  if (opts.sample) {
    // Sample among the tests that run, so a sample of n runs n files; the
    // skipped tests of the paths are still listed as skipped.
    const skippedForAll = (t) => opts.engines.every((e) => skipFor(t, e, opts, expectations));
    tests = [...sample(tests.filter((t) => !skippedForAll(t)), opts.sample, opts.seed), ...tests.filter(skippedForAll)];
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const out = opts.out ?? join(here, 'results', stamp);
  mkdirSync(out, { recursive: true });
  const runs = [];
  for (const engine of opts.engines) {
    const run = await runEngine(engine, tests, opts, expectations, notRunnable);
    writeFileSync(join(out, `${engine}.json`), JSON.stringify(run, null, 1) + '\n');
    runs.push(run);
  }
  const md = [];
  for (const run of runs) {
    const m = run.meta;
    md.push(`## ${m.engine}${m.engineVersion ? ' ' + m.engineVersion : ''}`, '',
      `warpdom ${m.warpdomCommit?.slice(0, 10)}${m.warpdomSrcDirty ? ' (src modified)' : ''}, WPT ${m.wptCommit?.slice(0, 10)}, Node ${m.node}, ${m.date}, wall clock ${(m.wallClockMs / 1000).toFixed(1)} s` +
      `${m.sample ? `, sample ${m.sample.n} files (seed ${m.sample.seed})` : ''}, timeout multiplier ${m.timeoutMultiplier}`, '',
      markdownTable(run, { depth: opts.depth }), '');
  }
  if (runs.length > 1) md.push('## Side by side', '', compareTable(runs, { depth: opts.depth }), '');
  writeFileSync(join(out, 'summary.md'), md.join('\n'));
  process.stdout.write(md.join('\n') + `\nResults in ${out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
