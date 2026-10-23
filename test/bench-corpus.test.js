// The corpus timing tools (bench/corpus/): reading corpus files and pins,
// compare() options per package, the CSV rows and the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readCorpus,
  pinsFileFor,
  readPins,
  projectDir,
  slugFor,
  packageOptions,
  parseConfigs,
  countDiffering,
  projectRows,
  referenceTests,
  csvLine,
  appendRows,
  CSV_HEADER,
} from '../bench/corpus/lib.mjs';
import { parseCsv, renderReport, uncertainty, median, med, rng } from '../bench/corpus/report.mjs';
import { parseArgs, configOf, runsOf } from '../bench/corpus/time.mjs';
import { installCommand } from '../bench/corpus/checkout.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const corpusDir = path.join(root, 'bench', 'corpus');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-corpus-'));

test('corpus files: both corpora parse, every timed project is pinned', () => {
  // Not timed so far (no checkout when the pins were written).
  const unpinned = { 'corpus.json': ['ngx-formly', 'mantine'], 'held-out.json': [] };
  for (const name of ['corpus.json', 'held-out.json']) {
    const corpus = readCorpus(path.join(corpusDir, name));
    assert.ok(corpus.projects.length >= 9, name);
    const pins = readPins(corpus.file);
    assert.deepEqual(
      corpus.projects.map((p) => p.name).filter((n) => !pins[n]),
      unpinned[name],
    );
    for (const p of corpus.projects.filter((x) => pins[x.name])) {
      assert.match(pins[p.name]?.commit ?? '', /^[0-9a-f]{40}$/, `${name}: ${p.name} has a pinned commit`);
      assert.equal(pins[p.name].repo, p.repo, `${name}: ${p.name} pin and corpus agree on the repository`);
    }
  }
  assert.equal(pinsFileFor('/x/corpus.json'), '/x/pins.json');
  assert.equal(pinsFileFor('/x/held-out.json'), '/x/held-out-pins.json');
});

test('corpus files: invalid entries are rejected', () => {
  const dir = tmp();
  try {
    const write = (projects) => {
      const file = path.join(dir, 'c.json');
      fs.writeFileSync(file, JSON.stringify({ projects }));
      return file;
    };
    assert.throws(() => readCorpus(write([{ name: 'a', packages: [] }])), /a has no packages/);
    assert.throws(
      () => readCorpus(write([{ name: 'a', packages: [{ dir: '.', runner: 'mocha' }] }])),
      /runner must be vitest or jest/,
    );
    assert.throws(
      () =>
        readCorpus(
          write([
            { name: 'a', packages: [{ dir: '.', runner: 'jest' }] },
            { name: 'a', packages: [{ dir: '.', runner: 'jest' }] },
          ]),
        ),
      /listed twice/,
    );
    assert.throws(
      () => readCorpus(write([{ name: 'a', packages: [{ dir: '.', runner: 'jest', args: '--x' }] }])),
      /must be a list/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corpus checkouts: own path when it exists, else repos-dir/name', () => {
  const dir = tmp();
  try {
    const corpusFile = path.join(dir, 'corpus.json');
    const own = path.join(dir, 'elsewhere', 'analog');
    assert.equal(projectDir({ name: 'analog', path: 'elsewhere/analog' }, corpusFile, '/repos'), '/repos/analog');
    fs.mkdirSync(own, { recursive: true });
    assert.equal(projectDir({ name: 'analog', path: 'elsewhere/analog' }, corpusFile, '/repos'), own);
    assert.equal(projectDir({ name: 'solid' }, corpusFile, '/repos'), '/repos/solid');
    assert.equal(slugFor('.'), 'root');
    assert.equal(slugFor('packages/react-dom'), 'packages_react-dom');
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    assert.equal(installCommand(dir), 'pnpm install --frozen-lockfile');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corpus packages: config, args and env become compare() options', () => {
  const corpus = readCorpus(path.join(corpusDir, 'corpus.json'));
  const rhf = corpus.projects.find((p) => p.name === 'react-hook-form').packages[0];
  assert.deepEqual(packageOptions(rhf), {
    runner: 'jest',
    args: ['--config', 'scripts/jest/jest.config.js'],
    env: { TEST_ENV: 'web' },
  });
  const radix = corpus.projects.find((p) => p.name === 'radix-primitives').packages[0];
  assert.deepEqual(packageOptions(radix).args, ['--project', 'unit']);
  // compare adds --coverage.enabled=false itself; a second copy is dropped.
  assert.deepEqual(
    packageOptions({ dir: '.', runner: 'vitest', args: ['--coverage.enabled=false', '--retry=0'] }).args,
    ['--retry=0'],
  );
  assert.deepEqual(parseConfigs('jsdom-default warpdom-default happy-dom-default'), ['jsdom', 'warpdom', 'happy-dom']);
  assert.deepEqual(parseConfigs('jsdom,happy-dom'), ['jsdom', 'happy-dom', 'warpdom']);
  assert.throws(() => parseConfigs('jsdom-vm'), /not supported/);
});

test('corpus timing: options', () => {
  const o = parseArgs([
    '--rounds',
    '2',
    '--configs',
    'jsdom-default warpdom-default',
    '--no-warmup',
    '--repos-dir',
    '/r',
    '--csv',
    '/o/t.csv',
    'solid,floating-ui',
    'svelte',
  ]);
  assert.equal(o.rounds, 2);
  assert.deepEqual(o.configs, ['jsdom', 'warpdom']);
  assert.equal(o.warmup, false);
  assert.equal(o.reposDir, '/r');
  assert.equal(o.csv, '/o/t.csv');
  assert.deepEqual(o.projects, ['solid', 'floating-ui', 'svelte']);
  const d = parseArgs(['solid']);
  assert.equal(d.rounds, 3);
  assert.equal(d.workers, 2);
  assert.equal(d.warmup, null, 'compare decides (a warm-up group with 2 or more rounds)');
  assert.deepEqual(d.configs, ['jsdom', 'warpdom', 'happy-dom']);
  assert.throws(() => parseArgs(['--time', 'cpu']), /wall or runner/);
  assert.throws(() => parseArgs(['--rounds', '0']), /positive/);
});

const tests = (entries) => new Map(entries.map(([key, status]) => [key, { status }]));

test('corpus rows: seconds summed over packages, differences from the jsdom reference', () => {
  assert.equal(
    countDiffering(
      tests([
        ['a', 'passed'],
        ['b', 'passed'],
        ['f::(file)', 'failed'],
      ]),
      tests([
        ['a', 'passed'],
        ['b', 'failed'],
        ['c', 'passed'],
      ]),
    ),
    2,
  );
  const jsdomRef = tests([
    ['t1', 'passed'],
    ['t2', 'passed'],
  ]);
  const pkgA = {
    skipped: false,
    runs: [
      { config: 'jsdom', round: 1, warmup: false, ms: 10_000, tests: jsdomRef },
      { config: 'warpdom', round: 1, warmup: false, ms: 6_000, tests: jsdomRef },
      {
        config: 'happy-dom',
        round: 1,
        warmup: false,
        ms: 8_000,
        tests: tests([
          ['t1', 'passed'],
          ['t2', 'failed'],
        ]),
      },
      { config: 'jsdom', round: 2, warmup: false, ms: 11_000, tests: jsdomRef },
      // A warpdom run that produced no results (timeout): the round is NA.
      { config: 'warpdom', round: 2, warmup: false, ms: 6_500, tests: null },
      { config: 'happy-dom', round: 2, warmup: false, ms: 8_000, tests: jsdomRef },
    ],
  };
  pkgA.reference = referenceTests(pkgA.runs);
  const pkgB = {
    skipped: false,
    runs: [
      { config: 'jsdom', round: 1, warmup: false, ms: 1_000, tests: tests([['x', 'passed']]) },
      { config: 'warpdom', round: 1, warmup: false, ms: 500, tests: tests([['x', 'passed']]) },
      { config: 'happy-dom', round: 1, warmup: false, ms: 900, tests: tests([['x', 'passed']]) },
    ],
  };
  pkgB.reference = referenceTests(pkgB.runs);
  const browser = { skipped: true, runs: [] };
  const rows = projectRows('p', [pkgA, pkgB, browser], { rounds: 2, configs: ['jsdom', 'warpdom', 'happy-dom'] });
  assert.deepEqual(rows.map(csvLine), [
    '1,p,jsdom-default,11.0,0',
    '1,p,warpdom-default,6.5,0',
    '1,p,happy-dom-default,8.9,1',
    // Round 2: package B has no runs, so every configuration is NA.
    // (differs: NA where no package has results to compare).
    '2,p,jsdom-default,NA,0',
    '2,p,warpdom-default,NA,NA',
    '2,p,happy-dom-default,NA,0',
  ]);
  // The reference is the first jsdom run, the warm-up one when there is one.
  const warm = tests([['t', 'failed']]);
  assert.equal(
    referenceTests([
      { config: 'warpdom', tests: jsdomRef },
      { config: 'jsdom', warmup: true, tests: warm },
      { config: 'jsdom', tests: jsdomRef },
    ]),
    warm,
  );
  const dir = tmp();
  try {
    const csv = path.join(dir, 'out', 't.csv');
    appendRows(csv, rows.slice(0, 1));
    appendRows(csv, rows.slice(1, 2));
    assert.equal(fs.readFileSync(csv, 'utf8'), `${CSV_HEADER}\n1,p,jsdom-default,11.0,0\n1,p,warpdom-default,6.5,0\n`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corpus rows: runs of a compare result, named by configuration', () => {
  const dir = tmp();
  try {
    const report = (status) => ({
      testResults: [
        {
          name: path.join(dir, 'a.test.js'),
          status: 'passed',
          assertionResults: [{ ancestorTitles: [], title: 't', status }],
        },
      ],
    });
    fs.mkdirSync(path.join(dir, 'runs'));
    fs.writeFileSync(path.join(dir, 'runs', '1-baseline.json'), JSON.stringify(report('passed')));
    fs.writeFileSync(path.join(dir, 'runs', '2-warpdom.json'), JSON.stringify(report('failed')));
    const result = {
      cwd: dir,
      out: dir,
      baseline: { name: 'happy-dom' },
      runs: [
        {
          side: 'baseline',
          round: 1,
          warmup: false,
          wallMs: 1200,
          runnerMs: 1000,
          counts: { tests: 1 },
          results: 'runs/1-baseline.json',
        },
        {
          side: 'warpdom',
          round: 1,
          warmup: false,
          wallMs: 900,
          runnerMs: 700,
          counts: { tests: 1 },
          results: 'runs/2-warpdom.json',
        },
        { side: 'jsdom', round: 1, warmup: false, wallMs: 1500, runnerMs: null, results: 'runs/3-jsdom.json' },
      ],
    };
    assert.equal(configOf(result, 'baseline'), 'happy-dom');
    const runs = runsOf(result);
    assert.deepEqual(
      runs.map((r) => [r.config, r.ms, r.tests ? [...r.tests.values()].map((t) => t.status) : null]),
      [
        ['happy-dom', 1200, ['passed']],
        ['warpdom', 900, ['failed']],
        ['jsdom', 1500, null],
      ],
    );
    assert.deepEqual(
      runsOf(result, { time: 'runner' }).map((r) => r.ms),
      [1000, 700, null],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SAMPLE = `round,project,config,seconds,differs
1,a,jsdom-default,10.0,0
1,a,warpdom-default,5.0,0
1,a,happy-dom-default,8.0,3
2,a,jsdom-default,11.0,0
2,a,warpdom-default,5.0,0
2,a,happy-dom-default,9.0,3
1,b,jsdom-default,4.0,0
1,b,warpdom-default,3.0,1
1,b,happy-dom-default,NA,2
2,b,jsdom-default,4.0,9
2,b,warpdom-default,3.0,1
2,b,happy-dom-default,4.0,2
`;

test('corpus report: tables, broken jsdom rounds, seeded uncertainty', () => {
  const { data } = parseCsv(SAMPLE);
  assert.equal(data.get('a').get('1')['warpdom-default'].secs, 5);
  assert.ok(Number.isNaN(data.get('b').get('1')['happy-dom-default'].secs));
  // Per-suite medians over rounds take the lower middle value; medians
  // across suites the usual one (as timing-report.cjs).
  assert.equal(median([1, 2, 3, 4]), 2);
  assert.equal(med([1, 2, 3, 4]), 2.5);
  const text = renderReport(SAMPLE);
  assert.match(text, /\| a \| 2 \| 10\.0 s \| 5\.0 s \| — \| — \| 2\.00x \| 2\.00x \| 0 \/ — \/ — \|/);
  // b's second jsdom round differs from the reference in 9 > 5 tests.
  assert.match(text, /\*\*Check:\*\* b: 1 of 2 jsdom rounds differ from the jsdom baseline in more than 5 tests/);
  // Per-suite ratios: the lower middle of 2.0 and 2.2; the uncertainty
  // table's median is the usual one, 2.10.
  assert.match(text, /\| a \| 10\.0 s \| 5\.0 s \| 8\.0 s \| 2\.00x \| 1\.22x \| 1\.60x \| 0 \/ 3 \|/);
  assert.match(text, /\| b \(check\) \|/);
  assert.match(text, /Medians over 1 suites with valid jsdom rounds: warpdom vs jsdom 2\.00x/);
  assert.match(text, /\| a \| 2 \| 2\.10x \| 2\.00-2\.20x \(range\) \|/);
  assert.match(text, /Median speedup over 1 suites: 2\.10x/);
  assert.equal(renderReport(SAMPLE), text, 'the same CSV gives the same report');
  // Five or more rounds: a bootstrap interval of the suite's median.
  let many = 'round,project,config,seconds,differs\n';
  [2.0, 2.1, 1.9, 2.2, 2.05, 1.95].forEach((x, i) => {
    many += `${i + 1},s,jsdom-default,${(10 * x).toFixed(1)},0\n${i + 1},s,warpdom-default,10.0,0\n`;
  });
  const u = uncertainty(parseCsv(many).data, 'warpdom-default', { resamples: 2000 });
  assert.equal(u.perSuite[0].kind, '95% CI');
  assert.ok(u.perSuite[0].lo <= u.median && u.median <= u.perSuite[0].hi);
  assert.deepEqual(uncertainty(parseCsv(many).data, 'warpdom-default', { resamples: 2000 }), u);
  const r1 = rng(1),
    r2 = rng(1);
  assert.equal(r1(), r2());
});

test('corpus report: the same output as timing-report.cjs on the published three-way CSV', () => {
  const csv = fs.readFileSync(
    path.join(root, 'docs', 'research', 'data', 'timing', 'ci-2026-10-12-three-way', 'timing-ci.csv'),
    'utf8',
  );
  const text = renderReport(csv);
  // Published in docs/research/README.md section 3.6 (all 14 suites, before
  // handsontable was left out).
  assert.match(
    text,
    /\| material-ui \| 472\.4 s \| 247\.2 s \| 333\.8 s \| 1\.90x \| 1\.41x \| 1\.36x \| 1 \/ 1039 \|/,
  );
  assert.match(text, /\| floating-ui \| 29\.4 s \| 18\.8 s \| 22\.6 s \| 1\.57x \| 1\.30x \| 1\.20x \| 0 \/ 14 \|/);
});
