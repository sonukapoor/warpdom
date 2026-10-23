// Before/after benchmark comparison of two warpdom checkouts, as the bench
// workflow (.github/workflows/bench.yml) runs it on pull requests.
//
//   node bench/ci-compare.mjs --base <dir> --head <dir> [--rounds 5]
//     [--markdown out.md] [--json out.json] [--base-label x] [--head-label y]
//
// Runs bench/load.js and bench/hot.js (--only warpdom) from this checkout
// (the harness) against both directories, which can be any warpdom
// checkouts or exports (src/ plus installed dependencies). Base and head
// alternate in every round (the side that goes first alternates too), so
// drift hits both sides. Reports the median of the rounds per measure and
// the head/base change. Lower is better for every measure. Prints the Markdown table to stdout.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const sides = { base: opt('base'), head: opt('head') };
if (!sides.base || !sides.head) {
  console.error(
    'usage: node bench/ci-compare.mjs --base <dir> --head <dir> [--rounds 5] [--markdown out.md] [--json out.json]',
  );
  process.exit(2);
}
const rounds = Number(opt('rounds', '5'));
const labels = { base: opt('base-label', 'base'), head: opt('head-label', 'head') };
const THRESHOLD = 0.05; // flag changes beyond +-5%

const here = path.dirname(fileURLToPath(import.meta.url));
const benches = [
  { title: 'Load and window creation', unit: 'ms', script: 'load.js', extra: [] },
  { title: 'Hot members', unit: 'ns per op', script: 'hot.js', extra: ['--only', 'warpdom'] },
];

const run = (bench, dir) => {
  const target = path.resolve(dir);
  const out = execFileSync(process.execPath, [path.join(here, bench.script), '--json', ...bench.extra, target], {
    encoding: 'utf8',
  });
  const { dir: measured, results } = JSON.parse(out.trim().split('\n').pop());
  // Self-check: the script measured the requested checkout, not its own.
  if (measured !== target) throw new Error(`${bench.script} measured ${measured}, expected ${target}`);
  // hot.js nests per environment; load.js is flat.
  const flat = {};
  for (const [k, v] of Object.entries(results)) flat[k] = v !== null && typeof v === 'object' ? v.warpdom : v;
  return flat;
};

// samples[bench.script][measure][side] = [values per round]
const samples = {};
for (const b of benches) samples[b.script] = {};
for (let r = 0; r < rounds; r++) {
  const order = r % 2 === 0 ? ['base', 'head'] : ['head', 'base'];
  for (const b of benches) {
    for (const side of order) {
      const t = performance.now();
      const res = run(b, sides[side]);
      console.error(`round ${r + 1}/${rounds} ${b.script} ${side} ${((performance.now() - t) / 1000).toFixed(1)} s`);
      for (const [measure, value] of Object.entries(res)) {
        const m = (samples[b.script][measure] ??= { base: [], head: [] });
        if (typeof value === 'number' && Number.isFinite(value)) m[side].push(value);
      }
    }
  }
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const fmt = (x) =>
  x === null ? 'n/a' : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3);

const report = { rounds, node: process.version, labels, benches: [] };
let slower = 0;
let faster = 0;
let total = 0;
const lines = [];
for (const b of benches) {
  const rows = [];
  for (const [measure, s] of Object.entries(samples[b.script])) {
    const base = median(s.base);
    const head = median(s.head);
    const change = base !== null && head !== null ? head / base - 1 : null;
    let flag = '';
    if (change !== null && change > THRESHOLD) {
      flag = '**slower**';
      slower++;
    } else if (change !== null && change < -THRESHOLD) {
      flag = 'faster';
      faster++;
    }
    if (change !== null) total++;
    rows.push({ measure, base, head, change, flag, samples: s });
  }
  report.benches.push({ title: b.title, unit: b.unit, rows });
  lines.push(`### ${b.title} (${b.unit}, lower is better)`, '');
  lines.push('| Measure | Base median | Head median | Change | |', '| --- | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    const pct = r.change === null ? 'n/a' : `${r.change >= 0 ? '+' : ''}${(r.change * 100).toFixed(1)}%`;
    lines.push(`| ${r.measure.replace(/\|/g, '\\|')} | ${fmt(r.base)} | ${fmt(r.head)} | ${pct} | ${r.flag} |`);
  }
  lines.push('');
}

const summary =
  slower === 0
    ? `No measure more than ${THRESHOLD * 100}% slower (${faster} more than ${THRESHOLD * 100}% faster, ${total} compared).`
    : `**${slower} of ${total} measures more than ${THRESHOLD * 100}% slower**, ${faster} more than ${THRESHOLD * 100}% faster.`;

const raw = ['<details><summary>All rounds</summary>', ''];
for (const b of report.benches) {
  raw.push(`**${b.title}** (${b.unit})`, '', '| Measure | Base | Head |', '| --- | --- | --- |');
  for (const r of b.rows)
    raw.push(
      `| ${r.measure.replace(/\|/g, '\\|')} | ${r.samples.base.map(fmt).join(', ')} | ${r.samples.head.map(fmt).join(', ')} |`,
    );
  raw.push('');
}
raw.push('</details>');

const markdown = [
  `Base ${labels.base}, head ${labels.head}. Node ${process.version}, ${rounds} alternating rounds per side, medians.`,
  '',
  summary,
  '',
  ...lines,
  raw.join('\n'),
  '',
].join('\n');

report.summary = summary;
const mdOut = opt('markdown');
if (mdOut) writeFileSync(mdOut, markdown);
const jsonOut = opt('json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(markdown);
