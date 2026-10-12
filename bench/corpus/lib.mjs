// Shared pieces of the corpus timing tools (bench/corpus/): reading a
// corpus file and its pins, where a project is checked out, the CSV rows
// and the environment record. Node only; not part of the published package.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WARPDOM_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const CORPUS_DIR = path.join(WARPDOM_ROOT, 'bench', 'corpus');
export const DEFAULT_CORPUS = path.join(CORPUS_DIR, 'corpus.json');
export const CSV_HEADER = 'round,project,config,seconds,differs';

export const expandHome = (p) => p.replace(/^~(?=$|\/)/, os.homedir());

// The default checkout directory: CORPUS_REPOS_DIR, else ~/corpus-repos.
export const defaultReposDir = () => path.resolve(expandHome(process.env.CORPUS_REPOS_DIR || '~/corpus-repos'));

// A corpus file (the format of dom-api-tracer's corpus/corpus.json):
// { projects: [{ name, repo, ref?, path?, install?, build?, notes?,
//   packages: [{ dir, runner, config?, args?, env? }] }] }.
// Returns the projects, checked, with the file's path.
export function readCorpus(file) {
  const corpusFile = path.resolve(file);
  const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  if (!Array.isArray(corpus.projects)) throw new Error(`${corpusFile}: no "projects" list`);
  const names = new Set();
  for (const p of corpus.projects) {
    if (typeof p.name !== 'string' || !p.name) throw new Error(`${corpusFile}: a project without a name`);
    if (names.has(p.name)) throw new Error(`${corpusFile}: project ${p.name} is listed twice`);
    names.add(p.name);
    if (!Array.isArray(p.packages) || !p.packages.length) throw new Error(`${corpusFile}: ${p.name} has no packages`);
    for (const pkg of p.packages) {
      if (typeof pkg.dir !== 'string') throw new Error(`${corpusFile}: ${p.name}: a package without "dir"`);
      if (!['vitest', 'jest'].includes(pkg.runner)) throw new Error(`${corpusFile}: ${p.name} ${pkg.dir}: runner must be vitest or jest`);
      if (pkg.args != null && !Array.isArray(pkg.args)) throw new Error(`${corpusFile}: ${p.name} ${pkg.dir}: "args" must be a list`);
    }
  }
  return { file: corpusFile, projects: corpus.projects };
}

// corpus.json is pinned in pins.json, any other <name>.json in <name>-pins.json.
export function pinsFileFor(corpusFile) {
  const file = path.resolve(corpusFile);
  return path.basename(file) === 'corpus.json' ? path.join(path.dirname(file), 'pins.json') : file.replace(/\.json$/, '-pins.json');
}

export function readPins(corpusFile) {
  return JSON.parse(fs.readFileSync(pinsFileFor(corpusFile), 'utf8'));
}

// Where a project is checked out: its own "path" (relative to the corpus
// file, ~ allowed) when that exists, else <reposDir>/<name>.
export function projectDir(project, corpusFile, reposDir) {
  if (project.path) {
    const own = path.resolve(path.dirname(path.resolve(corpusFile)), expandHome(project.path));
    if (fs.existsSync(own)) return own;
  }
  return path.join(path.resolve(reposDir), project.name);
}

// File-name stem for a package directory ('.' would make hidden files).
export function slugFor(dir) {
  const slug = dir.replace(/^\.\/?/, '').replace(/[^\w.-]+/g, '_').replace(/^[._]+|[._]+$/g, '');
  return slug || 'root';
}

// Runner arguments compare adds itself; repeating them makes Vitest see an
// option twice (an array), so a corpus package's copy is dropped.
const COMPARE_ARGS = new Set(['--coverage.enabled=false', '--coverage=false']);

// compare() options for one corpus package.
export function packageOptions(pkg) {
  return {
    runner: pkg.runner,
    args: [...(pkg.config ? ['--config', pkg.config] : []), ...(pkg.args ?? []).filter((a) => !COMPARE_ARGS.has(a))],
    env: pkg.env ?? {},
  };
}

// The configurations of a timing run, from "jsdom-default warpdom-default
// happy-dom-default" or "jsdom,warpdom,happy-dom": DOM names, warpdom
// always included. Only the default pool is supported.
export function parseConfigs(text) {
  const names = [];
  for (const word of String(text).split(/[\s,]+/).filter(Boolean)) {
    const m = /^(jsdom|warpdom|happy-dom)(?:-default)?$/.exec(word);
    if (!m) throw new Error(`configuration ${word} is not supported (jsdom, warpdom or happy-dom, optionally with -default)`);
    if (!names.includes(m[1])) names.push(m[1]);
  }
  if (!names.includes('warpdom')) names.push('warpdom');
  return names;
}

// --- rows ---------------------------------------------------------------------

// Number of tests whose status differs between two runs' tests (Maps from
// compare's testsOf; '(file)' entries, files that failed to load, are left
// out, as the jsdom baseline comparison of dom-api-tracer did). A test
// missing on one side counts.
export function countDiffering(reference, tests) {
  let n = 0;
  for (const key of new Set([...reference.keys(), ...tests.keys()])) {
    if (key.endsWith('::(file)')) continue;
    if (reference.get(key)?.status !== tests.get(key)?.status) n++;
  }
  return n;
}

// The CSV rows of one project: per round and configuration, the seconds
// summed over its packages (NA when a package has no valid run for it) and
// the tests that differ from the project's jsdom reference run.
// packages: [{ skipped, reference, runs: [{ config, round, warmup, ms,
// tests }] }]; a run without tests (null) failed; reference: the tests of
// the package's first jsdom run (referenceTests()).
export function projectRows(project, packages, { rounds, configs }) {
  const rows = [];
  const active = packages.filter((p) => !p.skipped);
  for (let round = 1; round <= rounds; round++) {
    for (const config of configs) {
      let seconds = 0;
      let differs = 0;
      let complete = active.length > 0;
      let anyTests = false;
      for (const pkg of active) {
        const run = pkg.runs.find((r) => !r.warmup && r.round === round && r.config === config);
        if (!run || !run.tests || run.ms == null) { complete = false; continue; }
        seconds += run.ms / 1000;
        if (pkg.reference) { differs += countDiffering(pkg.reference, run.tests); anyTests = true; }
      }
      rows.push({ round, project, config: `${config}-default`, seconds: complete ? seconds : null, differs: anyTests ? differs : null });
    }
  }
  return rows;
}

// The reference run of a package: its first jsdom run (the warm-up one when
// there is one), else its first run with results.
export function referenceTests(runs) {
  const valid = runs.filter((r) => r.tests);
  return (valid.find((r) => r.config === 'jsdom') ?? valid[0])?.tests ?? null;
}

export const csvLine = (r) => `${r.round},${r.project},${r.config},${r.seconds == null ? 'NA' : r.seconds.toFixed(1)},${r.differs == null ? 'NA' : r.differs}`;

export function appendRows(csvFile, rows) {
  fs.mkdirSync(path.dirname(path.resolve(csvFile)), { recursive: true });
  if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, `${CSV_HEADER}\n`);
  if (rows.length) fs.appendFileSync(csvFile, rows.map(csvLine).join('\n') + '\n');
}

// --- environment record ---------------------------------------------------------

function git(dir) {
  if (!fs.existsSync(dir)) return null;
  const run = (...args) => {
    const res = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    return res.status === 0 ? res.stdout.trim() : null;
  };
  const commit = run('rev-parse', 'HEAD');
  if (!commit) return null;
  return { commit, branch: run('rev-parse', '--abbrev-ref', 'HEAD'), dirty: run('status', '--porcelain', '--untracked-files=no') !== '' };
}

// The environment of a corpus run (as dom-api-tracer's record-env.mjs):
// commits of the corpus checkouts (and whether they match their pins),
// warpdom's commit, Node, OS, CPU, memory, load.
export function environmentRecord({ corpus, reposDir, projects = null }) {
  let pins = {};
  try { pins = readPins(corpus.file); } catch { /* no pins file */ }
  const checkouts = {};
  for (const p of corpus.projects) {
    if (projects && !projects.includes(p.name)) continue;
    const dir = projectDir(p, corpus.file, reposDir);
    const g = git(dir);
    checkouts[p.name] = fs.existsSync(dir)
      ? { dir, ...g, pinned: pins[p.name]?.commit ?? null, matchesPin: Boolean(g?.commit && pins[p.name]?.commit === g.commit) }
      : { dir, missing: true };
  }
  const cpus = os.cpus();
  return {
    recordedAt: new Date().toISOString(),
    node: process.version,
    os: { platform: os.platform(), release: os.release(), version: os.version?.() ?? null, arch: os.arch() },
    cpu: { model: cpus[0]?.model ?? null, cores: cpus.length, availableParallelism: os.availableParallelism?.() ?? null },
    memory: { totalBytes: os.totalmem(), totalGiB: +(os.totalmem() / 2 ** 30).toFixed(1) },
    loadAverage: os.loadavg(),
    corpus: path.relative(WARPDOM_ROOT, corpus.file),
    warpdom: { dir: WARPDOM_ROOT, ...git(WARPDOM_ROOT) },
    projects: checkouts,
  };
}

export function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
