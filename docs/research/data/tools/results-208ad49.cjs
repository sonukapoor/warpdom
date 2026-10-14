#!/usr/bin/env node
// results-208ad49.cjs [data dir] > ci-2026-10-13-208ad49-computed.md
//
// The derived numbers of ci-2026-10-13-208ad49-RESULTS.md that the dom-api-tracer report scripts
// (timing-report.cjs, ablation-report.cjs, versions-report.cjs; their output is each directory's
// report.md) do not print, computed from the archived files only (CSVs, learning records and the
// per-test archives, extracted to a temporary directory). Uses dom-api-tracer's statuses.cjs
// ($DOM_API_TRACER, default ~/Projects/dom-api-tracer) for the key definition, the broken-round
// rule and the flaky sets, and the report scripts' two-level bootstrap (same procedure, seed
// 0x5eed, 10,000 resamples; timing-report.cjs draws its per-suite intervals from the same random
// stream first, so for the same suites its interval bounds can differ in the second decimal, e.g.
// tuning run 1, 14 suites: 1.23-1.56x there, 1.23-1.57x here).
//
// Conventions:
// - speedup of B over A: median over rounds of time(A)/time(B) in the same round; "range" is the
//   minimum and maximum of the per-round ratios (with 5 rounds the percentile bootstrap of the
//   median gives the same interval).
// - three-way jobs: broken jsdom rounds left out and flaky tests as timing-report.cjs (jsdom-default
//   runs of the job, warm-up included, broken rounds excluded); baselines: flaky as
//   ablation-report.cjs (every jsdom-default run of the job, warm-up included).
// - differing tests: most in any round, "raw (without flaky)".
// - version rule: a suite enters cross-suite medians only if every package's runner resolves
//   jsdom >= 20 (resolved versions: the versions experiment's own-a meta.json); handsontable
//   (core, react-wrapper, vue3 on 16.7.0) is reported separately.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const TR = process.env.DOM_API_TRACER ?? path.join(os.homedir(), 'Projects/dom-api-tracer');
const S = require(path.join(TR, 'scripts/research/statuses.cjs'));
const D = path.resolve(process.argv[2] ?? path.join(__dirname, '..'));
const P = 'ci-2026-10-13-208ad49-';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r208-'));
const log = (...a) => console.log(...a);

// ---------- helpers ----------
function extract(dir, archive, inner) {
  const out = path.join(tmp, dir.replace(/\//g, '_'));
  if (!fs.existsSync(out)) { fs.mkdirSync(out, { recursive: true }); execFileSync('tar', ['xJf', path.join(D, dir, archive), '-C', out]); }
  return path.join(out, inner);
}
function readCsv(file) {
  const L = fs.readFileSync(file, 'utf8').trim().split('\n');
  const h = L[0].split(',');
  const d = new Map();
  for (const l of L.slice(1)) {
    if (!l || l.startsWith('round,')) continue;
    const v = l.split(',');
    const r = Object.fromEntries(h.map((k, i) => [k, v[i]]));
    const p = d.get(r.project) ?? d.set(r.project, new Map()).get(r.project);
    const R = p.get(r.round) ?? p.set(r.round, {}).get(r.round);
    R[r.config] = { secs: r.seconds === 'NA' ? NaN : +r.seconds, fp: r.false_pass === undefined || r.false_pass === 'NA' ? NaN : +r.false_pass };
  }
  return d;
}
const readMap = (f) => { try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); return { tests: m.tests ?? {}, files: m.files ?? {} }; } catch { return null; } };
const valid = (a) => a.filter((x) => typeof x === 'number' && !Number.isNaN(x));
const mid = (a) => { const v = valid(a).sort((x, y) => x - y); const n = v.length; return n ? (n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2) : NaN; };
const lo = (a) => (valid(a).length ? Math.min(...valid(a)) : NaN);
const hi = (a) => (valid(a).length ? Math.max(...valid(a)) : NaN);
const x2 = (v) => (Number.isNaN(v) ? '—' : `${v.toFixed(2)}x`);
const s1 = (v) => (Number.isNaN(v) ? '—' : `${v.toFixed(1)} s`);
const rngx = (a) => (valid(a).length ? `${lo(a).toFixed(2)}-${hi(a).toFixed(2)}` : '—');
const xr = (a) => (valid(a).length ? `${x2(mid(a))} (${rngx(a)})` : '—');
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (a, r) => a[Math.floor(r() * a.length)];
const pct = (s, q) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
// timing-report.cjs's across-suite bootstrap: resample suites, then each chosen suite's rounds.
function boot2(suites) {
  const sx = suites.filter((s) => valid(s).length).map((s) => valid(s));
  const r = rng(0x5eed);
  const point = mid(sx.map(mid));
  const b = Array.from({ length: 10000 }, () => { const sample = sx.map(() => pick(sx, r)); return mid(sample.map((s) => mid(s.map(() => pick(s, r))))); }).sort((x, y) => x - y);
  return { n: sx.length, point, lo: pct(b, 0.025), hi: pct(b, 0.975) };
}
const bootStr = (b) => `${x2(b.point)} (95% two-level bootstrap ${b.lo.toFixed(2)}-${b.hi.toFixed(2)}x, ${b.n} suites)`;
const ratios = (p, a, b) => [...p.values()].map((r) => (r[a] && r[b] ? r[a].secs / r[b].secs : NaN));
const medT = (p, c) => mid([...p.values()].map((r) => r[c]?.secs ?? NaN));

// ---------- the version rule ----------
const jsdomOf = {};
for (const v of ['versions/tuning-38427202342', 'versions/heldout-38427223850']) {
  const out = extract(P + v, 'versions-out.tar.xz', 'out');
  for (const p of fs.readdirSync(out)) {
    const m = path.join(out, p, 'own-a', 'meta.json');
    if (fs.existsSync(m)) jsdomOf[p] = Object.entries(JSON.parse(fs.readFileSync(m, 'utf8')).resolved).map(([pkg, r]) => [pkg, r.jsdom]);
  }
}
// Applications are not in the versions experiment: corpus/apps.json (dom-api-tracer) notes.
jsdomOf.excalidraw = [['.', '22.1.0 (corpus/apps.json)']];
jsdomOf['wire-webapp'] = [['apps/webapp', '29.1.1 at the root, jest-environment-jsdom 30.5.2 (corpus/apps.json)']];
const major = (v) => parseInt(v, 10);
const below20 = (p) => (jsdomOf[p] ?? []).some(([, v]) => major(v) < 20);
log('# Computed numbers for the 208ad49 re-run\n');
log('Generated by `tools/results-208ad49.cjs` from the archived files in this directory (see its header for the conventions). Every table names its source directory.\n');
log('## Version rule: jsdom resolved per package\n');
log('Source: ci-2026-10-13-208ad49-versions/*/versions-out.tar.xz, out/<suite>/own-a/meta.json (the jsdom each package\'s runner resolves); applications from dom-api-tracer corpus/apps.json.\n');
log('| Suite | jsdom per package | in cross-suite medians |');
log('| --- | --- | --- |');
for (const [p, v] of Object.entries(jsdomOf).sort()) log(`| ${p} | ${v.map(([k, x]) => `${k}: ${x}`).join('; ')} | ${below20(p) ? '**no** (a package below jsdom 20)' : 'yes'} |`);

// ---------- three-way jobs ----------
function job(dir, { ablation = false } = {}) {
  const data = readCsv(path.join(D, dir, 'timing-ci.csv'));
  const pt = extract(dir, 'pertest.tar.xz', 'pertest');
  const J = { dir, data, broken: {}, flaky: {}, pt };
  for (const [project, p] of data) {
    const rounds = fs.readdirSync(pt).filter((r) => fs.existsSync(path.join(pt, r, project, 'jsdom-default.json')));
    const entries = rounds.map((r) => ({ round: r, secs: p.get(r)?.['jsdom-default']?.secs ?? null, map: readMap(path.join(pt, r, project, 'jsdom-default.json')) })).filter((e) => e.map);
    if (ablation) {
      const flaky = new Set();
      for (const k of new Set(entries.flatMap((e) => Object.keys(e.map.tests)))) if (new Set(entries.map((e) => e.map.tests[k]?.s)).size > 1) flaky.add(k);
      J.broken[project] = []; J.flaky[project] = { tests: flaky, files: new Set() };
    } else {
      const jr = S.jsdomRounds(entries, 5);
      J.broken[project] = jr.broken.filter((r) => p.has(r)); J.flaky[project] = jr.flaky;
    }
  }
  return J;
}
const keep = (J, project) => new Map([...J.data.get(project)].filter(([r]) => !J.broken[project].includes(r)));
function differ(J, project, c) {
  let raw = NaN, stable = NaN;
  for (const r of keep(J, project).keys()) {
    const base = readMap(path.join(J.pt, r, project, 'jsdom-default.json')), run = readMap(path.join(J.pt, r, project, `${c}.json`));
    if (!base || !run) continue;
    raw = Math.max(Number.isNaN(raw) ? 0 : raw, S.compare(base, run).differs);
    stable = Math.max(Number.isNaN(stable) ? 0 : stable, S.compare(base, run, null, J.flaky[project]).differs);
  }
  return Number.isNaN(raw) ? '—' : `${raw} (${stable})`;
}
const TUNING = ['threeway-tuning/run1-38426985620', 'threeway-tuning/run2-38427009322', 'threeway-tuning/run3-38427031231'].map((d) => job(P + d));
const HELDOUT = job(P + 'threeway-heldout');
const APPS = job(P + 'threeway-apps');

function threeWayTable(J, title) {
  log(`\n### ${title}\n`);
  log(`Source: ${J.dir}/timing-ci.csv and pertest.tar.xz. Times: median over valid rounds. Speedup: median of per-round jsdom/DOM ratios (range). Differing tests: most in any round, raw (without the job's flaky tests).\n`);
  log('| Suite | valid rounds | jsdom | warpdom | happy-dom | warpdom speedup (range) | happy-dom speedup (range) | warpdom tests differing | happy-dom tests differing | flaky tests in job |');
  log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const project of [...J.data.keys()].sort()) {
    const p = keep(J, project);
    log(`| ${project} | ${p.size}${J.broken[project].length ? ` (broken jsdom rounds left out: ${J.broken[project].join(', ')})` : ''} | ${s1(medT(p, 'jsdom-default'))} | ${s1(medT(p, 'warpdom-default'))} | ${s1(medT(p, 'happy-dom-default'))} | ${xr(ratios(p, 'jsdom-default', 'warpdom-default'))} | ${xr(ratios(p, 'jsdom-default', 'happy-dom-default'))} | ${differ(J, project, 'warpdom-default')} | ${differ(J, project, 'happy-dom-default')} | ${J.flaky[project]?.tests.size ?? '—'} |`);
  }
}
log('\n## Drop-in (three-way: jsdom, warpdom, happy-dom in each runner\'s default isolation)');
TUNING.forEach((J, i) => threeWayTable(J, `Tuning, run ${i + 1} (${J.dir.split('/').pop()})`));
threeWayTable(HELDOUT, 'Held-out (run 38427053627)');
threeWayTable(APPS, 'Applications (run 38427075297)');

// Between the three tuning runs.
log('\n### Tuning: warpdom speedup per run and between runs\n');
log('Per run: median of per-round ratios (range of the per-round ratios). Between runs: range of the three per-run medians and its spread (max/min - 1). Pooled: median and range of all valid rounds of the three runs.\n');
log('| Suite | run 1 | run 2 | run 3 | per-run medians: min-max | spread | pooled rounds | median jsdom time per run |');
log('| --- | --- | --- | --- | --- | --- | --- | --- |');
const tuningSuites = [...TUNING[0].data.keys()].sort();
const perRun = {}; const pooled = {};
for (const s of tuningSuites) {
  const rs = TUNING.map((J) => ratios(keep(J, s), 'jsdom-default', 'warpdom-default'));
  perRun[s] = rs.map(mid); pooled[s] = rs.flat();
  log(`| ${s} | ${rs.map(xr).join(' | ')} | ${rngx(perRun[s])}x | ${((hi(perRun[s]) / lo(perRun[s]) - 1) * 100).toFixed(1)}% | ${xr(pooled[s])} | ${TUNING.map((J) => s1(medT(keep(J, s), 'jsdom-default'))).join(' / ')} |`);
}
const spreads = tuningSuites.filter((s) => !below20(s)).map((s) => (hi(perRun[s]) / lo(perRun[s]) - 1) * 100);
log(`\nSpread of the per-suite speedup between runs (suites under the version rule, ${spreads.length}): median ${mid(spreads).toFixed(1)}%, max ${hi(spreads).toFixed(1)}%.`);

// Cross-suite medians.
log('\n### Cross-suite medians of the drop-in speedup\n');
log('Two-level bootstrap as timing-report.cjs (resample suites, then rounds within each chosen suite): it captures the choice of suites and the between-round noise within one job; it does not capture between-run (runner) variation, which the three tuning runs show directly.\n');
const inRule = (s) => !below20(s);
const medLine = (label, suites, get) => {
  const b = boot2(suites.map(get));
  const loo = suites.map((s) => ({ s, m: mid(suites.filter((t) => t !== s).map((t) => mid(get(t)))) }));
  const mn = loo.reduce((a, b) => (b.m < a.m ? b : a)), mx = loo.reduce((a, b) => (b.m > a.m ? b : a));
  log(`| ${label} | ${bootStr(b)} | ${x2(mn.m)} (without ${mn.s}) - ${x2(mx.m)} (without ${mx.s}) |`);
  return b;
};
log('| Set | median speedup | leave-one-out medians: lowest - highest |');
log('| --- | --- | --- |');
const ruleTuning = tuningSuites.filter(inRule);
TUNING.forEach((J, i) => {
  medLine(`tuning run ${i + 1}, version rule (${ruleTuning.length} suites, without handsontable)`, ruleTuning, (s) => ratios(keep(J, s), 'jsdom-default', 'warpdom-default'));
  medLine(`tuning run ${i + 1}, all 14 (with handsontable)`, tuningSuites, (s) => ratios(keep(J, s), 'jsdom-default', 'warpdom-default'));
});
medLine(`tuning, 3 runs pooled (15 rounds per suite), version rule`, ruleTuning, (s) => pooled[s]);
const gm = (a) => Math.exp(valid(a).reduce((x, y) => x + Math.log(y), 0) / valid(a).length);
const other = TUNING.map((J, i) => `run ${i + 1}: geometric mean ${x2(gm(ruleTuning.map((s) => mid(ratios(keep(J, s), 'jsdom-default', 'warpdom-default')))))}, ratio of summed median times ${x2(ruleTuning.reduce((a, s) => a + medT(keep(J, s), 'jsdom-default'), 0) / ruleTuning.reduce((a, s) => a + medT(keep(J, s), 'warpdom-default'), 0))}`);
const hoValid = [...HELDOUT.data.keys()].filter((s) => keep(HELDOUT, s).size > 0).sort();
medLine(`held-out, ${hoValid.length} suites with valid jsdom rounds (solid-primitives left out by the broken-round rule)`, hoValid, (s) => ratios(keep(HELDOUT, s), 'jsdom-default', 'warpdom-default'));
const hoAll = [...HELDOUT.data.keys()].sort();
const rawHO = (s) => ratios(HELDOUT.data.get(s), 'jsdom-default', 'warpdom-default');
medLine(`held-out, all 9 (solid-primitives with its raw rounds)`, hoAll, rawHO);
medLine('applications (excalidraw, wire-webapp)', [...APPS.data.keys()].sort(), (s) => ratios(keep(APPS, s), 'jsdom-default', 'warpdom-default'));
medLine(`tuning (3 runs pooled) + held-out (${hoValid.length}), version rule`, [...ruleTuning, ...hoValid], (s) => pooled[s] ?? ratios(keep(HELDOUT, s), 'jsdom-default', 'warpdom-default'));
log(`\nOther summaries over the ${ruleTuning.length} tuning suites under the version rule: ${other.join('; ')}.`);
// happy-dom medians, same sets.
log('\nhappy-dom vs jsdom, same procedure (suites where happy-dom has a time):\n');
log('| Set | median speedup | leave-one-out medians: lowest - highest |');
log('| --- | --- | --- |');
TUNING.forEach((J, i) => {
  const set = ruleTuning.filter((s) => valid(ratios(keep(J, s), 'jsdom-default', 'happy-dom-default')).length);
  medLine(`tuning run ${i + 1}, version rule (${set.length})`, set, (s) => ratios(keep(J, s), 'jsdom-default', 'happy-dom-default'));
});
medLine(`held-out (${hoValid.length})`, hoValid, (s) => ratios(keep(HELDOUT, s), 'jsdom-default', 'happy-dom-default'));
log(`\nsolid-primitives (held-out), raw rounds from the CSV (every jsdom round flagged broken, see RESULTS.md): warpdom ${xr(rawHO('solid-primitives'))}, happy-dom ${xr(ratios(HELDOUT.data.get('solid-primitives'), 'jsdom-default', 'happy-dom-default'))}; times jsdom ${s1(medT(HELDOUT.data.get('solid-primitives'), 'jsdom-default'))}, warpdom ${s1(medT(HELDOUT.data.get('solid-primitives'), 'warpdom-default'))}, per round warpdom ${[...HELDOUT.data.get('solid-primitives').values()].map((r) => r['warpdom-default']?.secs).join(', ')} s, jsdom ${[...HELDOUT.data.get('solid-primitives').values()].map((r) => r['jsdom-default']?.secs).join(', ')} s.`);

// handsontable per package.
log('\n### handsontable per package (outside the cross-suite medians: core, react-wrapper and vue3 on jsdom 16.7.0)\n');
log('Source: packages.csv of each job (median runner seconds over the timed rounds; warm-up = round 0, the first run after install, which includes the Angular wrapper\'s cold compilation). Ratio: median of per-round jsdom/warpdom ratios.\n');
log('| Job | package | jsdom | warpdom | jsdom / warpdom (range) | warm-up jsdom / warpdom |');
log('| --- | --- | --- | --- | --- | --- |');
for (const dir of [...TUNING.map((J) => J.dir), P + 'ablation-a2a3/tuning-38427093681', P + 'ablation-a4/tuning-38427136397']) {
  const rows = fs.readFileSync(path.join(D, dir, 'packages.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')).filter((r) => r[1] === 'handsontable');
  const pk = new Map();
  for (const [round, , config, pkg, , secs] of rows) { const m = pk.get(pkg) ?? pk.set(pkg, new Map()).get(pkg); (m.get(round) ?? m.set(round, {}).get(round))[config] = secs === 'NA' ? NaN : +secs; }
  for (const [pkg, m] of pk) {
    const timed = [...m].filter(([r]) => r !== '0').map(([, v]) => v);
    const w = m.get('0') ?? {};
    log(`| ${dir.replace(P, '')} | ${pkg} | ${s1(mid(timed.map((v) => v['jsdom-default'])))} | ${s1(mid(timed.map((v) => v['warpdom-default'])))} | ${xr(timed.map((v) => v['jsdom-default'] / v['warpdom-default']))} | ${x2(w['jsdom-default'] / w['warpdom-default'])} |`);
  }
}
log('\nhandsontable whole suite (timing-ci.csv):\n');
for (const dir of [...TUNING.map((J) => J.dir), P + 'ablation-a2a3/tuning-38427093681', P + 'ablation-a4/tuning-38427136397']) {
  const p = readCsv(path.join(D, dir, 'timing-ci.csv')).get('handsontable');
  log(`- ${dir.replace(P, '')}: jsdom ${s1(medT(p, 'jsdom-default'))}, warpdom ${s1(medT(p, 'warpdom-default'))}, speedup ${xr(ratios(p, 'jsdom-default', 'warpdom-default'))}, ${p.size} rounds; happy-dom times ${[...p.values()].map((r) => (Number.isNaN(r['happy-dom-default']?.secs ?? NaN) ? 'NA' : r['happy-dom-default'].secs)).join(', ')}`);
}

// ---------- measured isolation (baselines) ----------
const BL = [['tuning', P + 'baselines-tuning'], ['held-out', P + 'baselines-heldout'], ['apps', P + 'baselines-apps']].map(([k, d]) => ({ k, J: job(d, { ablation: true }) }));
function bestOf(dir) { // the best correct jsdom configuration, as ablation-report.cjs printed it (report.md)
  const md = fs.readFileSync(path.join(D, dir, 'report.md'), 'utf8');
  const sec = md.split('## Best correct jsdom configuration')[1].split('\n## ')[0];
  const out = {};
  for (const l of sec.split('\n').filter((l) => /^\| [a-zA-Z]/.test(l) && !l.startsWith('| Suite'))) { const c = l.split('|').map((x) => x.trim()); out[c[1]] = c[3]; }
  return out;
}
function differAll(J, project, c) {
  let raw = NaN, stable = NaN;
  for (const r of J.data.get(project).keys()) {
    const base = readMap(path.join(J.pt, r, project, 'jsdom-default.json')), run = readMap(path.join(J.pt, r, project, `${c}.json`));
    if (!base || !run) continue;
    raw = Math.max(Number.isNaN(raw) ? 0 : raw, S.compare(base, run).differs);
    stable = Math.max(Number.isNaN(stable) ? 0 : stable, S.compare(base, run, null, J.flaky[project]).differs);
  }
  return Number.isNaN(raw) ? '—' : `${raw} (${stable})`;
}
log('\n## Measured isolation ("learned" in the data) and the strong baselines\n');
log('Sources: ci-2026-10-13-208ad49-baselines-{tuning,heldout,apps}/timing-ci.csv and pertest.tar.xz; best correct jsdom configuration from each report.md (ablation-report.cjs: the fastest of jsdom-default/-shared/-vm/-sharedclean whose tests match jsdom-default in every round, the job\'s flaky set excluded; jsdom-learned is not a candidate). Cells: median time; speedup over jsdom-default (median of per-round ratios, range); tests differing from the same round\'s jsdom-default, most in any round, raw (without flaky).\n');
const cmp = { ld: {}, lb: {}, jl: {}, wj: {}, sc: {}, sr: {}, lj: {}, dj: {} };
for (const { k, J } of BL) {
  const best = bestOf(J.dir);
  log(`### ${k}\n`);
  log('| Suite | rounds | jsdom default | best correct jsdom | jsdom-sharedclean | jsdom-learned | warpdom drop-in | warpdom shared+reset | warpdom-learned (method) |');
  log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of [...J.data.keys()].sort()) {
    const p = J.data.get(s);
    const cell = (c) => `${s1(medT(p, c))}; ${c === 'jsdom-default' ? '1.00x' : xr(ratios(p, 'jsdom-default', c))}; ${differAll(J, s, c)}`;
    const method = fs.readFileSync(path.join(D, J.dir, 'timing-ci.csv'), 'utf8').split('\n').find((l) => l.split(',')[1] === s && l.split(',')[2] === 'warpdom-learned')?.split(',')[10] ?? '';
    log(`| ${s} | ${p.size} | ${s1(medT(p, 'jsdom-default'))} | ${best[s]}: ${s1(medT(p, best[s]))}, ${best[s] === 'jsdom-default' ? '1.00x' : xr(ratios(p, 'jsdom-default', best[s]))} | ${cell('jsdom-sharedclean')} | ${cell('jsdom-learned')} | ${cell('warpdom-default')} | ${cell('warpdom-sharedreset')} | ${cell('warpdom-learned')} (${method}) |`);
    const key = `${k}/${s}`;
    cmp.ld[key] = ratios(p, 'warpdom-default', 'warpdom-learned');
    cmp.lb[key] = ratios(p, best[s], 'warpdom-learned');
    cmp.jl[key] = ratios(p, 'jsdom-default', 'jsdom-learned');
    cmp.wj[key] = ratios(p, 'jsdom-learned', 'warpdom-learned');
    cmp.sc[key] = ratios(p, 'jsdom-default', 'jsdom-sharedclean');
    cmp.sr[key] = ratios(p, 'jsdom-default', 'warpdom-sharedreset');
    cmp.lj[key] = ratios(p, 'jsdom-default', 'warpdom-learned');
    cmp.dj[key] = ratios(p, 'jsdom-default', 'warpdom-default');
  }
  log('');
}
log('### Pairwise comparisons per suite\n');
log('Median of per-round ratios (range). learned vs drop-in = warpdom-default / warpdom-learned (> 1: learned faster); learned vs best = best correct jsdom / warpdom-learned; jsdom-learned vs jsdom-default = jsdom-default / jsdom-learned; warpdom-learned vs jsdom-learned = jsdom-learned / warpdom-learned.\n');
log('| Suite | learned vs drop-in | learned vs best correct jsdom | jsdom-learned vs jsdom-default | warpdom-learned vs jsdom-learned |');
log('| --- | --- | --- | --- | --- |');
for (const key of Object.keys(cmp.ld)) log(`| ${key} | ${xr(cmp.ld[key])} | ${xr(cmp.lb[key])} | ${xr(cmp.jl[key])} | ${xr(cmp.wj[key])} |`);
log('\nCross-suite medians (two-level bootstrap as above):\n');
log('| Comparison | set | median | leave-one-out medians: lowest - highest |');
log('| --- | --- | --- | --- |');
const sets = { 'tuning (11)': (k) => k.startsWith('tuning/'), 'held-out (5)': (k) => k.startsWith('held-out/'), 'tuning + held-out (16)': (k) => !k.startsWith('apps/'), 'tuning + held-out without ariakit (1 round) (15)': (k) => !k.startsWith('apps/') && k !== 'tuning/ariakit' };
for (const [name, m] of [['warpdom-learned vs jsdom-default', cmp.lj], ['warpdom drop-in vs jsdom-default (same job)', cmp.dj], ['warpdom shared+reset vs jsdom-default', cmp.sr], ['jsdom-sharedclean vs jsdom-default', cmp.sc], ['learned vs drop-in', cmp.ld], ['learned vs best correct jsdom', cmp.lb], ['jsdom-learned vs jsdom-default', cmp.jl], ['warpdom-learned vs jsdom-learned', cmp.wj]]) {
  for (const [sn, f] of Object.entries(sets)) {
    const ks = Object.keys(m).filter(f);
    const b = boot2(ks.map((k) => m[k]));
    const loo = ks.map((s) => ({ s, v: mid(ks.filter((t) => t !== s).map((t) => mid(m[t]))) }));
    const mn = loo.reduce((a, c) => (c.v < a.v ? c : a)), mx = loo.reduce((a, c) => (c.v > a.v ? c : a));
    log(`| ${name} | ${sn} | ${bootStr(b)} | ${x2(mn.v)} (without ${mn.s}) - ${x2(mx.v)} (without ${mx.s}) |`);
  }
}
// P3: is learned ever slower than the drop-in?
log('\n### P3: warpdom-learned slower than warpdom-default (drop-in)?\n');
log('Per-round ratio warpdom-default / warpdom-learned; listed when the median is below 1. "every round" when the maximum is below 1 too. A/A noise floor of a paired warpdom ratio at this commit: see the A2/A3 section (median |log ratio| 0.7%, 95th percentile 4.1% on the tuning job).\n');
for (const key of Object.keys(cmp.ld)) { const r = valid(cmp.ld[key]); if (mid(r) < 1) log(`- ${key}: ${xr(r)}, ${r.length} rounds${hi(r) < 1 ? ', slower in every round' : ''}`); }

// G2 and learned false passes.
log('\n### False passes of the learned configurations (G2 candidates)\n');
log('From timing-ci.csv\'s false_pass column (tests passed in the learned run and not passed in the same DOM\'s isolated run of the same round, summed over rounds); per test in g2-candidates.tsv.\n');
log('| Suite | warpdom-learned false passes | jsdom-learned false passes |');
log('| --- | --- | --- |');
for (const { k, J } of BL) for (const s of [...J.data.keys()].sort()) {
  const p = J.data.get(s);
  const sum = (c) => valid([...p.values()].map((r) => r[c]?.fp ?? NaN)).reduce((a, b) => a + b, 0);
  log(`| ${k}/${s} | ${sum('warpdom-learned')} | ${sum('jsdom-learned')} |`);
}

// Learning stability and cost, with the CLI's shared-run time (t_sh_runs) where t_sh is null.
log('\n### Learning: stability, cost and break-even\n');
log('Source: learning.jsonl of each baselines directory. Learnings: the warm-up\'s and one per timed round. Mode agreement: share of learnings choosing the most common mode (for the CLI, the mode string of all packages). Jaccard: mean pairwise similarity of leaky sets. Cost: median over learnings of the whole learning time minus its isolated run (seconds - t_iso; equal to t_sh + t_split where both are recorded), over the learnings where both are recorded ("k of n"); for the others (harness: a split whose results still differed after two attempts has no recorded time) t_sh is a lower bound. ablation-report.cjs uses only learnings with both t_sh and t_split, so its cost and break-even differ where the CLI recorded no t_sh. Break-even: cost / (median isolated run - median learned run) from timing-ci.csv, the isolated run being the same DOM\'s default.\n');
log('| Suite | configuration | method | learnings | modes | mode agreement | leaky files min-max | Jaccard | cost | gain per run | break-even runs |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const jac = (a, b) => { const A = new Set(a), B = new Set(b); const u = new Set([...A, ...B]); if (!u.size) return 1; let i = 0; for (const x of A) if (B.has(x)) i++; return i / u.size; };
for (const { k, J } of BL) {
  const recs = fs.readFileSync(path.join(D, J.dir, 'learning.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const g of [...new Set(recs.map((r) => `${r.project}\t${r.config ?? 'warpdom-learned'}`))].sort()) {
    const [s, c] = g.split('\t');
    const L = recs.filter((r) => r.project === s && (r.config ?? 'warpdom-learned') === c && r.kind === 'learn');
    const modes = new Map(); for (const r of L) modes.set(r.mode, (modes.get(r.mode) ?? 0) + 1);
    const pairs = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pairs.push(jac(L[i].leaky, L[j].leaky));
    // Exact cost: whole learning time minus the isolated run (= t_sh + t_split where both exist).
    const exact = L.filter((r) => r.seconds != null && r.t_iso != null).map((r) => r.seconds - r.t_iso);
    const bounds = L.filter((r) => !(r.seconds != null && r.t_iso != null) && r.t_sh != null).map((r) => r.t_sh);
    const cost = mid(exact);
    const p = J.data.get(s);
    const gain = medT(p, c === 'jsdom-learned' ? 'jsdom-default' : 'warpdom-default') - medT(p, c);
    const sizes = L.map((r) => r.leaky.length);
    const modeStr = [...modes].map(([m, n]) => `${m.includes(';') ? (m.split(';').filter((x) => x.endsWith('=split')).map((x) => x.split('=')[0]).join('+') || 'all isolated') + ' split' : m} ${n}`).join(', ');
    log(`| ${k}/${s} | ${c} | ${[...new Set(L.map((r) => r.method))].join(', ')} | ${L.length} | ${modeStr} | ${(Math.max(...modes.values()) / L.length).toFixed(2)} | ${Math.min(...sizes)}-${Math.max(...sizes)} | ${pairs.length ? (pairs.reduce((a, b) => a + b, 0) / pairs.length).toFixed(2) : '—'} | ${s1(cost)} (${exact.length} of ${L.length}${bounds.length ? `; others >= ${bounds.map((b) => b.toFixed(1)).join(', ')} s` : ''}) | ${s1(gain)} | ${Number.isNaN(cost) || Number.isNaN(gain) ? '—' : gain <= 0 ? 'never' : (cost / gain).toFixed(1)} |`);
  }
}

// ---------- A2 / A3 ----------
log('\n## Ablations A2 (eager interfaces) and A3 (no query cache), A/A\n');
log('Source: ci-2026-10-13-208ad49-ablation-a2a3/{tuning-38427093681,heldout-38427115775}/timing-ci.csv. Paired ratio time(configuration)/time(warpdom-default) per round (> 1: the configuration is slower); median (range). No warpdom-ablate-unset configuration ran in these jobs.\n');
log('| Suite | rounds | eager / default | no-cache / default | A/A: default-aa / default |');
log('| --- | --- | --- | --- | --- |');
const ab = { e: {}, n: {}, a: {} };
for (const dir of ['ablation-a2a3/tuning-38427093681', 'ablation-a2a3/heldout-38427115775']) {
  const d = readCsv(path.join(D, P + dir, 'timing-ci.csv'));
  for (const s of [...d.keys()].sort()) {
    const p = d.get(s);
    ab.e[s] = ratios(p, 'warpdomeager-default', 'warpdom-default'); ab.n[s] = ratios(p, 'warpdomnocache-default', 'warpdom-default'); ab.a[s] = ratios(p, 'warpdom-default-aa', 'warpdom-default');
    log(`| ${s} | ${p.size} | ${xr(ab.e[s])} | ${xr(ab.n[s])} | ${xr(ab.a[s])} |`);
  }
}
log('\n| Ratio | suites (version rule: without handsontable) | median | leave-one-out | pooled rounds: median, median abs deviation from 1, max abs deviation |');
log('| --- | --- | --- | --- | --- |');
for (const [name, m, ex] of [['eager / default (A2)', ab.e], ['no-cache / default (A3)', ab.n], ['default-aa / default (A/A)', ab.a], ['eager / default (A2), without solid-primitives', ab.e, 'solid-primitives'], ['no-cache / default (A3), without solid-primitives', ab.n, 'solid-primitives'], ['default-aa / default (A/A), without solid-primitives', ab.a, 'solid-primitives']]) {
  const ks = Object.keys(m).filter(inRule).filter((k) => k !== ex).sort();
  const b = boot2(ks.map((k) => m[k]));
  const loo = ks.map((s) => mid(ks.filter((t) => t !== s).map((t) => mid(m[t]))));
  const all = ks.flatMap((k) => valid(m[k]));
  const dev = all.map((x) => Math.abs(x - 1));
  log(`| ${name} | ${ks.length} | ${b.point.toFixed(3)}x (${b.lo.toFixed(3)}-${b.hi.toFixed(3)}x) | ${lo(loo).toFixed(3)}-${hi(loo).toFixed(3)}x | ${mid(all).toFixed(3)}, ${(mid(dev) * 100).toFixed(1)}%, ${(hi(dev) * 100).toFixed(1)}% (${all.length} rounds) |`);
}

// ---------- versions ----------
log('\n## Versions (jsdom only): status changes split into load failures and behavior\n');
log('Source: ci-2026-10-13-208ad49-versions/*/versions-out.tar.xz (out/<suite>/<variant>/map.json, meta.json). Against own-a, tests that differ between own-a and own-b (flaky) left out. "missing": tests own-a ran that have no result in the variant (their file failed to load or run); "changed": tests present in both whose status changed. % of own-a\'s tests. Same version: the forced version equals the version every package resolves on its own.\n');
log('| Suite | own jsdom | variant | forced | tests differing | of which missing | of which changed | % of own-a tests | same version as own |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const v of ['versions/tuning-38427202342', 'versions/heldout-38427223850']) {
  const out = extract(P + v, 'versions-out.tar.xz', 'out');
  for (const s of fs.readdirSync(out).filter((x) => fs.statSync(path.join(out, x)).isDirectory()).sort()) {
    const a = readMap(path.join(out, s, 'own-a', 'map.json')), b = readMap(path.join(out, s, 'own-b', 'map.json'));
    if (!a) continue;
    const fl = b ? S.flaky(a, b) : { tests: new Set(), files: new Set() };
    const own = [...new Set((jsdomOf[s] ?? []).map(([, x]) => x))];
    for (const variant of fs.readdirSync(path.join(out, s)).filter((x) => x !== 'own-a' && fs.statSync(path.join(out, s, x)).isDirectory()).sort()) {
      const meta = JSON.parse(fs.readFileSync(path.join(out, s, variant, 'meta.json'), 'utf8'));
      const m = readMap(path.join(out, s, variant, 'map.json'));
      if (meta.status !== 'ok' || !m) { log(`| ${s} | ${own.join(' / ')} | ${variant} | — | NA | | | | ${meta.reason ?? ''} |`); continue; }
      const keys = S.differingKeys(a.tests, m.tests).filter((k) => !fl.tests.has(k));
      const missing = keys.filter((k) => a.tests[k] && !m.tests[k]).length;
      const forced = variant.startsWith('jsdom-') ? (Object.values(meta.resolved).every((r) => r.jsdom === variant.slice(6)) ? 'yes' : 'no') : variant === 'own-b' ? '—' : 'cssstyle';
      const same = variant.startsWith('jsdom-') && own.length === 1 && own[0] === variant.slice(6) ? 'yes' : '';
      log(`| ${s} | ${own.join(' / ')} | ${variant} | ${forced} | ${keys.length} | ${missing} | ${keys.length - missing} | ${(keys.length / Object.keys(a.tests).length * 100).toFixed(2)}% of ${Object.keys(a.tests).length} | ${same} |`);
    }
  }
}
// svelte: is jsdom 26.1.0's change the cssstyle 4.6.0 change?
{
  const out = extract(P + 'versions/tuning-38427202342', 'versions-out.tar.xz', 'out');
  const a = readMap(path.join(out, 'svelte', 'own-a', 'map.json'));
  const k = (v) => new Set(S.differingKeys(a.tests, readMap(path.join(out, 'svelte', v, 'map.json')).tests));
  const c46 = k('cssstyle-4.6.0'), j26 = k('jsdom-26.1.0'), j30 = k('jsdom-30.1.2'), j20 = k('jsdom-20.0.3');
  const inter = (x, y) => [...x].filter((t) => y.has(t)).length;
  log(`\nsvelte: cssstyle-4.6.0 changes ${c46.size} tests under its own jsdom 25.0.1; jsdom-26.1.0 (which loads cssstyle 4.6.0) changes ${j26.size}, ${inter(j26, c46)} of them the same tests; jsdom-30.1.2 changes ${j30.size} (${inter(j30, c46)} shared with cssstyle-4.6.0); jsdom-20.0.3 changes ${j20.size}.`);
}

// ---------- runners ----------
log('\n## Runners (environment records)\n');
log('Every environment record of the archived jobs: warpdom commit, harness commit, Node, cores, memory, CPU model.\n');
const envs = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) walk(q); else if (/\.env-.*\.json$/.test(f)) envs.push(q); } })(D);
const byKey = new Map();
for (const f of envs.filter((f) => path.relative(D, f).startsWith(P))) {
  const e = JSON.parse(fs.readFileSync(f, 'utf8'));
  const k = [e.warpdom?.commit?.slice(0, 7) + (e.warpdom?.dirty ? ' dirty' : ''), e.domApiTracer?.commit?.slice(0, 7) + (e.domApiTracer?.dirty ? ' dirty' : ''), e.node, `${e.cpu.cores} cores`, `${e.memory.totalGiB} GiB`].join(', ');
  byKey.set(k, (byKey.get(k) ?? 0) + 1);
}
for (const [k, n] of byKey) log(`- ${n} records: warpdom ${k}`);
const cpus = new Map();
for (const f of envs.filter((f) => path.relative(D, f).startsWith(P))) { const e = JSON.parse(fs.readFileSync(f, 'utf8')); cpus.set(e.cpu.model, (cpus.get(e.cpu.model) ?? 0) + 1); }
log(`- CPU models: ${[...cpus].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} (${n})`).join('; ')}`);
fs.rmSync(tmp, { recursive: true, force: true });
