#!/usr/bin/env node
// Summarizes a timing CSV (bench/corpus/time.mjs; also dom-api-tracer's
// timing-rounds.sh) as Markdown: per suite, the median time of each
// configuration over the rounds, the median of the per-round jsdom/warpdom
// ratios and the median number of tests whose status differs from jsdom;
// the three-way table when happy-dom ran; fast-mode and experiment tables
// when such rows are present; then the uncertainty of the speedups (ranges
// or bootstrap intervals, see the end). A port of dom-api-tracer's
// scripts/research/timing-report.cjs (b7f3188): the same CSV gives the same
// tables.
//
//   node bench/corpus/report.mjs <timing.csv>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A jsdom round whose tests differ from the jsdom reference in more than
// this many tests is broken (a package that did not run); a few are flaky
// tests that change on jsdom itself.
export const FLAKY = 5;
export const RESAMPLES = 10000;
export const SEED = 0x5eed;

// CSV text -> Map(project -> Map(round -> { config: { secs, differs } })), and the rows.
export function parseCsv(text) {
  const rows = text.trim().split('\n').slice(1).filter(Boolean).map((l) => l.split(','));
  const data = new Map();
  for (const [round, project, config, secs, differs] of rows) {
    if (!data.has(project)) data.set(project, new Map());
    const p = data.get(project);
    if (!p.has(round)) p.set(round, {});
    p.get(round)[config] = { secs: secs === 'NA' ? NaN : +secs, differs: +differs };
  }
  return { rows, data };
}

// The lower middle value (as timing-report.cjs: per-suite medians over rounds).
export const median = (a) => { const s = a.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : NaN; };
// The usual median (mean of the two middle values), for medians across suites.
export const med = (a) => { const v = a.filter((n) => !Number.isNaN(n)).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : NaN; };
const fmt = (n, unit = '') => (Number.isNaN(n) ? '—' : n.toFixed(1) + unit);
const num = (n) => (Number.isNaN(n) ? '—' : n);
export const ratio = (p, a, b) => median([...p.values()].map((r) => (r[a] && r[b] ? r[a].secs / r[b].secs : NaN)));
// A suite's jsdom rounds are valid when none differs from the reference in
// more than FLAKY tests or lacks a time.
export const brokenRounds = (p) => [...p.values()].filter((r) => r['jsdom-default'] && (r['jsdom-default'].differs > FLAKY || Number.isNaN(r['jsdom-default'].secs))).length;

// Mulberry32: a small seeded generator, so the same CSV gives the same intervals.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const midMedian = (a) => { const v = [...a].sort((x, y) => x - y); const n = v.length; return n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2; };
const pick = (a, r) => a[Math.floor(r() * a.length)];
export const percentile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

// Per suite: the range of the per-round ratios with fewer than 5 rounds,
// else a 95% bootstrap interval of their median. Across suites: a 95%
// bootstrap interval of the median speedup, resampling suites and, within
// each, its rounds (two levels). Suites with broken jsdom rounds are left out.
export function uncertainty(data, target, { resamples = RESAMPLES, seed = SEED } = {}) {
  const suites = [];
  for (const [project, p] of data) {
    const rounds = [...p.values()];
    if (brokenRounds(p)) continue;
    const ratios = rounds.map((r) => (r['jsdom-default'] && r[target] ? r['jsdom-default'].secs / r[target].secs : NaN)).filter((x) => !Number.isNaN(x));
    if (ratios.length) suites.push({ project, ratios });
  }
  if (suites.length === 0) return null;
  const r = rng(seed);
  const perSuite = suites.map(({ project, ratios }) => {
    const m = midMedian(ratios);
    let lo, hi, kind;
    if (ratios.length < 5) { lo = Math.min(...ratios); hi = Math.max(...ratios); kind = 'range'; } else {
      const meds = Array.from({ length: resamples }, () => midMedian(ratios.map(() => pick(ratios, r)))).sort((x, y) => x - y);
      lo = percentile(meds, 0.025); hi = percentile(meds, 0.975); kind = '95% CI';
    }
    return { project, rounds: ratios.length, speedup: m, lo, hi, kind };
  });
  const point = midMedian(suites.map((s) => midMedian(s.ratios)));
  const boot = Array.from({ length: resamples }, () => {
    const sample = suites.map(() => pick(suites, r));
    return midMedian(sample.map((s) => midMedian(s.ratios.map(() => pick(s.ratios, r)))));
  }).sort((x, y) => x - y);
  return { perSuite, median: point, lo: percentile(boot, 0.025), hi: percentile(boot, 0.975), suites: suites.length, resamples };
}

export function renderReport(text, options = {}) {
  const { rows, data } = parseCsv(text);
  const out = [];
  const print = (line = '') => out.push(line);
  print('| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |');
  print('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const warnings = [];
  for (const [project, p] of data) {
    const m = (c) => median([...p.values()].map((r) => r[c]?.secs ?? NaN));
    const d = (c) => median([...p.values()].map((r) => r[c]?.differs ?? NaN));
    const wdDefault = ratio(p, 'jsdom-default', 'warpdom-default');
    // Best warpdom configuration whose results match jsdom (<= 5 differences).
    const wdVmOk = d('warpdom-vm') <= 5;
    const best = wdVmOk ? Math.max(wdDefault, ratio(p, 'jsdom-default', 'warpdom-vm')) : wdDefault;
    const broken = brokenRounds(p);
    if (broken) warnings.push(`${project}: ${broken} of ${p.size} jsdom rounds differ from the jsdom baseline in more than ${FLAKY} tests or have no time; those rounds are not comparable`);
    print(`| ${project} | ${p.size} | ${fmt(m('jsdom-default'), ' s')} | ${fmt(m('warpdom-default'), ' s')} | ${fmt(m('jsdom-vm'), ' s')} | ${fmt(m('warpdom-vm'), ' s')} | ${wdDefault.toFixed(2)}x | ${best.toFixed(2)}x${wdVmOk && best !== wdDefault ? ' (vm)' : ''} | ${num(d('warpdom-default'))} / ${num(d('jsdom-vm'))} / ${num(d('warpdom-vm'))} |`);
  }
  if (warnings.length) { print(); print('**Check:** ' + warnings.join('; ') + '.'); }

  // Three-way (happy-dom-* present): speed of all three DOMs and how many
  // tests differ from jsdom on each, plus medians over the suites whose
  // jsdom rounds are all valid.
  if (rows.some((r) => r[2] === 'happy-dom-default')) {
    print();
    print('| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |');
    print('| --- | --- | --- | --- | --- | --- | --- | --- |');
    const valid = { wd: [], hd: [], wh: [] };
    for (const [project, p] of data) {
      const m = (c) => median([...p.values()].map((r) => r[c]?.secs ?? NaN));
      const d = (c) => median([...p.values()].map((r) => r[c]?.differs ?? NaN));
      const wd = ratio(p, 'jsdom-default', 'warpdom-default');
      const hd = ratio(p, 'jsdom-default', 'happy-dom-default');
      const wh = ratio(p, 'happy-dom-default', 'warpdom-default');
      const ok = !brokenRounds(p);
      if (ok) { valid.wd.push(wd); valid.hd.push(hd); valid.wh.push(wh); }
      const x = (v) => (Number.isNaN(v) ? '—' : `${v.toFixed(2)}x`);
      print(`| ${project}${ok ? '' : ' (check)'} | ${fmt(m('jsdom-default'), ' s')} | ${fmt(m('warpdom-default'), ' s')} | ${fmt(m('happy-dom-default'), ' s')} | ${x(wd)} | ${x(hd)} | ${x(wh)} | ${num(d('warpdom-default'))} / ${num(d('happy-dom-default'))} |`);
    }
    print();
    print(`Medians over ${valid.wd.length} suites with valid jsdom rounds: warpdom vs jsdom ${med(valid.wd).toFixed(2)}x, happy-dom vs jsdom ${med(valid.hd).toFixed(2)}x, warpdom vs happy-dom ${med(valid.wh).toFixed(2)}x.`);
  }

  // Fast mode (warpdom-learned-split or -isolated per round, against that
  // round's jsdom default run; dom-api-tracer's learned.sh).
  if (rows.some((r) => r[2].startsWith('warpdom-learned-'))) {
    print();
    print('| Suite | jsdom default | warpdom fast mode | mode | speedup | tests differing from jsdom |');
    print('| --- | --- | --- | --- | --- | --- |');
    const speedups = [];
    for (const [project, p] of data) {
      const cfg = [...p.values()].flatMap((r) => Object.keys(r)).find((c) => c.startsWith('warpdom-learned-'));
      if (!cfg) continue;
      const m = (c) => median([...p.values()].map((r) => r[c]?.secs ?? NaN));
      const d = median([...p.values()].map((r) => r[cfg]?.differs ?? NaN));
      const x = ratio(p, 'jsdom-default', cfg);
      speedups.push(x);
      print(`| ${project} | ${fmt(m('jsdom-default'), ' s')} | ${fmt(m(cfg), ' s')} | ${cfg.replace('warpdom-learned-', '')} | ${x.toFixed(2)}x | ${num(d)} |`);
    }
    const v = speedups.filter((n) => !Number.isNaN(n));
    if (v.length) { print(); print(`Fast mode median over ${v.length} suites: ${med(v).toFixed(2)}x.`); }
  }

  // Experiments (warpdomframes-*): median time, speedup over jsdom and
  // over warpdom default, differences.
  const experiments = [...new Set(rows.map((r) => r[2]))].filter((c) => c.startsWith('warpdomframes-'));
  if (experiments.length) {
    print();
    print('| Suite | configuration | median | vs jsdom default | vs warpdom default | differ |');
    print('| --- | --- | --- | --- | --- | --- |');
    for (const [project, p] of data) {
      for (const c of experiments) {
        const m = median([...p.values()].map((r) => r[c]?.secs ?? NaN));
        if (Number.isNaN(m)) continue;
        const d = median([...p.values()].map((r) => r[c]?.differs ?? NaN));
        print(`| ${project} | ${c} | ${fmt(m, ' s')} | ${ratio(p, 'jsdom-default', c).toFixed(2)}x | ${ratio(p, 'warpdom-default', c).toFixed(2)}x | ${num(d)} |`);
      }
    }
  }

  // Uncertainty of the speedups over jsdom's default pool; each target's
  // bootstrap starts from the same seed, as in timing-report.cjs.
  for (const target of ['warpdom-default', 'happy-dom-default']) {
    const u = uncertainty(data, target, { resamples: options.resamples ?? RESAMPLES, seed: options.seed ?? SEED });
    if (!u) continue;
    print();
    print(`**${target.replace('-default', '')} vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)`);
    print();
    print('| Suite | rounds | speedup | interval |');
    print('| --- | --- | --- | --- |');
    for (const s of u.perSuite) print(`| ${s.project} | ${s.rounds} | ${s.speedup.toFixed(2)}x | ${s.lo.toFixed(2)}-${s.hi.toFixed(2)}x (${s.kind}) |`);
    print();
    print(`Median speedup over ${u.suites} suites: ${u.median.toFixed(2)}x (95% bootstrap interval ${u.lo.toFixed(2)}-${u.hi.toFixed(2)}x, suites and rounds resampled, ${u.resamples} resamples).`);
  }
  return out.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) {
    process.stderr.write('usage: node bench/corpus/report.mjs <timing.csv>\n');
    process.exit(2);
  }
  process.stdout.write(renderReport(fs.readFileSync(process.argv[2], 'utf8')));
}
