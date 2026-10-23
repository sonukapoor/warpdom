#!/usr/bin/env node
// Corpus timing: each package of each corpus project timed with compare()
// (src/compare/, the code behind `warpdom compare`), jsdom, warpdom and
// happy-dom in every round, rotating, 2 workers. Writes
//
//   <csv>                              round,project,config,seconds,differs
//   <csv without .csv>.env-<time>.json the environment record
//   <csv without .csv>.compare-<project>.json  compare()'s full results per package
//   <out>/<project>/<package>/         compare's own output per package:
//                                      results.json, report.md, logs/,
//                                      runs/ (the runner's per-test results)
//
// seconds: summed over the project's packages, wall clock of the runner
// process by default (as dom-api-tracer's harness measured; --time runner
// for the runner's own duration); NA when a package has no valid run for
// that round. differs: tests whose status differs from the project's first
// jsdom run (a jsdom round that differs from it signals a broken run).
//
//   node bench/corpus/time.mjs [options] <project...>
//
// Options:
//   --corpus <file>     corpus file (default bench/corpus/corpus.json)
//   --repos-dir <dir>   checkouts (default $CORPUS_REPOS_DIR or ~/corpus-repos);
//                       prepare them with checkout.mjs
//   --rounds <n>        timed rounds (default 3)
//   --configs <list>    default "jsdom-default warpdom-default happy-dom-default"
//   --workers <n>       runner workers (default 2)
//   --timeout <min>     per run (default 45)
//   --no-warmup         no untimed warm-up group before the rounds (compare
//                       runs one with 2 or more rounds; the old harness did not)
//   --time wall|runner  what seconds measures (default wall)
//   --out <dir>         compare output (default .corpus-timing)
//   --csv <file>        default <out>/timing.csv (appended to)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compare } from '../../src/compare/index.js';
import { readReport, testsOf } from '../../src/compare/run.js';
import {
  WARPDOM_ROOT,
  DEFAULT_CORPUS,
  defaultReposDir,
  expandHome,
  readCorpus,
  projectDir,
  slugFor,
  packageOptions,
  parseConfigs,
  projectRows,
  referenceTests,
  appendRows,
  csvLine,
  environmentRecord,
  timestamp,
} from './lib.mjs';

export function parseArgs(argv) {
  const opts = {
    corpus: DEFAULT_CORPUS,
    reposDir: null,
    rounds: 3,
    configs: parseConfigs('jsdom warpdom happy-dom'),
    workers: 2,
    timeout: 45,
    warmup: null,
    time: 'wall',
    out: '.corpus-timing',
    csv: null,
    projects: [],
  };
  const number = (v, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive whole number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--corpus') opts.corpus = value();
    else if (a === '--repos-dir') opts.reposDir = value();
    else if (a === '--rounds') opts.rounds = number(value(), a);
    else if (a === '--configs') opts.configs = parseConfigs(value());
    else if (a === '--workers') opts.workers = number(value(), a);
    else if (a === '--timeout') opts.timeout = number(value(), a);
    else if (a === '--no-warmup') opts.warmup = false;
    else if (a === '--time') {
      opts.time = value();
      if (!['wall', 'runner'].includes(opts.time)) throw new Error('--time must be wall or runner');
    } else if (a === '--out') opts.out = value();
    else if (a === '--csv') opts.csv = value();
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else
      opts.projects.push(
        ...a
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
  }
  opts.reposDir = opts.reposDir ? path.resolve(expandHome(opts.reposDir)) : defaultReposDir();
  opts.out = path.resolve(opts.out);
  opts.csv = path.resolve(opts.csv ?? path.join(opts.out, 'timing.csv'));
  return opts;
}

// The CSV configuration name of each side of a compare result.
export function configOf(result, side) {
  if (side === 'baseline') return result.baseline?.name ?? 'baseline';
  return side; // warpdom, or an alsoEnvironments name
}

// The runs of one compare result, with their tests (null when the run
// produced no usable results), named by configuration.
export function runsOf(result, { time = 'wall' } = {}) {
  return result.runs.map((run) => {
    let tests = null;
    if (run.counts) {
      const report = readReport(path.join(result.out, run.results));
      const projects = readReport(path.join(result.out, run.results.replace(/\.json$/, '.projects.json')));
      if (report) tests = testsOf(report, result.cwd, projects);
    }
    const ms = time === 'runner' ? (run.runnerMs ?? null) : (run.wallMs ?? null);
    return { config: configOf(result, run.side), side: run.side, round: run.round, warmup: run.warmup, ms, tests };
  });
}

// A package whose projects all run in browser mode is skipped (compare does
// not run them; dom-api-tracer's harness skipped them too).
const browserOnly = (result) => result.projects?.length > 0 && result.projects.every((p) => p.browser);

async function timeProject(project, corpus, opts) {
  const dir = projectDir(project, corpus.file, opts.reposDir);
  const packages = [];
  if (!fs.existsSync(dir)) {
    console.log(`  ${project.name}: no checkout at ${dir} (run bench/corpus/checkout.mjs first)`);
  }
  for (const pkg of fs.existsSync(dir) ? project.packages : []) {
    const cwd = path.resolve(dir, pkg.dir);
    const out = path.join(opts.out, project.name, slugFor(pkg.dir));
    const started = Date.now();
    const result = await compare({
      cwd,
      out,
      rounds: opts.rounds,
      workers: opts.workers,
      timeout: opts.timeout,
      ...(opts.warmup === false ? { warmup: false } : {}),
      ...packageOptions(pkg),
      alsoEnvironments: opts.configs.filter((c) => c !== 'warpdom'),
      domPackages: path.join(WARPDOM_ROOT, 'node_modules'),
      requireDom: false,
      log: (line) => console.log(`    ${line.trim()}`),
    });
    const skipped = Boolean(result.error) && browserOnly(result);
    const runs = runsOf(result, opts);
    const entry = {
      dir: pkg.dir,
      runner: pkg.runner,
      skipped,
      error: skipped ? null : result.error,
      reference: referenceTests(runs),
      runs,
      result,
    };
    packages.push(entry);
    const c = result.correctness;
    const status = skipped
      ? 'skipped (browser mode)'
      : result.error
        ? `failed: ${result.error}`
        : `${c.compared} tests compared, ${c.differences.length} differ on warpdom${Object.entries(result.also ?? {})
            .map(([name, a]) => `, ${a.correctness.differences.length} on ${name}`)
            .join('')}`;
    console.log(`  ${project.name} ${pkg.dir}: ${status} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  return packages;
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`time.mjs: ${err.message}`);
    return 2;
  }
  const corpus = readCorpus(opts.corpus);
  const unknown = opts.projects.filter((name) => !corpus.projects.some((p) => p.name === name));
  if (!opts.projects.length || unknown.length) {
    console.error(
      unknown.length
        ? `not in ${corpus.file}: ${unknown.join(', ')}`
        : 'usage: node bench/corpus/time.mjs [options] <project...>',
    );
    return 2;
  }
  const base = opts.csv.replace(/\.csv$/, '');
  const envFile = `${base}.env-${timestamp()}.json`;
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(
    envFile,
    JSON.stringify(
      {
        ...environmentRecord({ corpus, reposDir: opts.reposDir, projects: opts.projects }),
        options: { ...opts, projects: opts.projects },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`environment recorded in ${path.relative(process.cwd(), envFile)}`);
  appendRows(opts.csv, []);
  let failed = 0;
  for (const name of opts.projects) {
    const project = corpus.projects.find((p) => p.name === name);
    console.log(`\n${name}`);
    const packages = await timeProject(project, corpus, opts);
    const rows = projectRows(name, packages, { rounds: opts.rounds, configs: opts.configs });
    appendRows(opts.csv, rows);
    for (const row of rows) console.log(`TIMING ${csvLine(row)}`);
    if (!packages.length || packages.some((p) => p.error)) failed++;
    const json = {
      project: name,
      corpus: path.relative(WARPDOM_ROOT, corpus.file),
      dir: projectDir(project, corpus.file, opts.reposDir),
      rows,
      packages: packages.map(({ dir, runner, skipped, error, result }) => ({ dir, runner, skipped, error, result })),
    };
    fs.writeFileSync(`${base}.compare-${name}.json`, JSON.stringify(json, null, 2) + '\n');
  }
  console.log(`\nTIMING done: ${path.relative(process.cwd(), opts.csv)}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
