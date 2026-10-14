#!/usr/bin/env node
// results-5942dc9.cjs [data dir] > ci-2026-10-14-5942dc9-computed.md
//
// The derived numbers of ci-2026-10-14-5942dc9-RESULTS.md (measured isolation and the strong
// baselines re-run at warpdom 5942dc9) that ablation-report.cjs (each directory's report.md) does not
// print, computed from the archived files only (CSVs, learning records, per-test archives extracted
// to a temporary directory). Sibling of results-208ad49.cjs: the measured-isolation part of that
// script with the same helpers, conventions and bootstrap (dom-api-tracer's statuses.cjs for keys and
// comparisons; flaky set = tests whose status changes between the job's jsdom-default runs, warm-up
// included, as ablation-report.cjs; two-level bootstrap with seed 0x5eed and 10,000 resamples),
// extended by: every configuration per suite, the A1 rows, per-learning modes, timed-run modes and
// re-runs, false passes per test with a class, P3 against two A/A thresholds, and a comparison with
// the 208ad49 baselines (ci-2026-10-13-208ad49-baselines-*).
//
// Conventions as results-208ad49.cjs:
// - speedup of B over A: median over rounds of time(A)/time(B) in the same round; "range" is the
//   minimum and maximum of the per-round ratios.
// - differing tests: most in any round against that round's jsdom-default, "raw (without flaky)".
// - version rule: all 17 suites here resolve jsdom >= 20 (COMPUTED of 208ad49, "Version rule").
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const TR = process.env.DOM_API_TRACER ?? path.join(os.homedir(), 'Projects/dom-api-tracer');
const S = require(path.join(TR, 'scripts/research/statuses.cjs'));
const D = path.resolve(process.argv[2] ?? path.join(__dirname, '..'));
const P = 'ci-2026-10-14-5942dc9-';
const OLD = 'ci-2026-10-13-208ad49-';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5942-'));
const log = (...a) => console.log(...a);

// ---------- helpers (as results-208ad49.cjs) ----------
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
    R[r.config] = { secs: r.seconds === 'NA' ? NaN : +r.seconds, fp: r.false_pass === undefined || r.false_pass === 'NA' ? NaN : +r.false_pass, method: r.method };
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
const jac = (a, b) => { const A = new Set(a), B = new Set(b); const u = new Set([...A, ...B]); if (!u.size) return 1; let i = 0; for (const x of A) if (B.has(x)) i++; return i / u.size; };
const CONFIGS = ['jsdom-default', 'jsdom-shared', 'jsdom-sharedclean', 'jsdom-vm', 'jsdom-learned', 'warpdom-default', 'warpdom-vm', 'warpdom-sharedfresh', 'warpdom-sharedreset', 'warpdom-learned', 'happydom-shared'];

// A baselines job (ablation mode): flaky = status changes between the job's jsdom-default runs.
function job(dir) {
  const data = readCsv(path.join(D, dir, 'timing-ci.csv'));
  const pt = extract(dir, 'pertest.tar.xz', 'pertest');
  const J = { dir, data, flaky: {}, pt };
  for (const [project] of data) {
    const rounds = fs.readdirSync(pt).filter((r) => fs.existsSync(path.join(pt, r, project, 'jsdom-default.json')));
    const entries = rounds.map((r) => readMap(path.join(pt, r, project, 'jsdom-default.json'))).filter(Boolean);
    const flaky = new Set();
    for (const k of new Set(entries.flatMap((e) => Object.keys(e.tests)))) if (new Set(entries.map((e) => e.tests[k]?.s)).size > 1) flaky.add(k);
    J.flaky[project] = { tests: flaky, files: new Set() };
  }
  return J;
}
function differAll(J, project, c, base = 'jsdom-default') {
  let raw = NaN, stable = NaN;
  for (const r of J.data.get(project).keys()) {
    const b = readMap(path.join(J.pt, r, project, `${base}.json`)), run = readMap(path.join(J.pt, r, project, `${c}.json`));
    if (!b || !run) continue;
    raw = Math.max(Number.isNaN(raw) ? 0 : raw, S.compare(b, run).differs);
    stable = Math.max(Number.isNaN(stable) ? 0 : stable, S.compare(b, run, null, J.flaky[project]).differs);
  }
  return { raw, stable, str: Number.isNaN(raw) ? '—' : `${raw} (${stable})` };
}
function bestOf(dir) { // the best correct jsdom configuration and the correct ones, as ablation-report.cjs printed them
  const md = fs.readFileSync(path.join(D, dir, 'report.md'), 'utf8');
  const sec = md.split('## Best correct jsdom configuration')[1].split('\n## ')[0];
  const out = {};
  for (const l of sec.split('\n').filter((l) => /^\| [a-zA-Z]/.test(l) && !l.startsWith('| Suite'))) { const c = l.split('|').map((x) => x.trim()); out[c[1]] = { best: c[3], correct: c[2].split(', ') }; }
  const every = (md.match(/\*\*Suites where every non-default jsdom configuration changes results:\*\* (.*)/) ?? [, ''])[1];
  return { best: out, every };
}
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const modeName = (m) => (m.includes(';') ? (m.split(';').filter((x) => x.endsWith('=split')).map((x) => x.split('=')[0].replace(/^packages_/, '')).join('+') || 'all isolated') + (m.split(';').some((x) => x.endsWith('=split')) ? ' split' : '') : m);

const KINDS = [['tuning', 'baselines-tuning'], ['held-out', 'baselines-heldout'], ['apps', 'baselines-apps']];
const BL = KINDS.map(([k, d]) => ({ k, J: job(P + d) }));
const OLDBL = KINDS.map(([k, d]) => ({ k, data: readCsv(path.join(D, OLD + d, 'timing-ci.csv')), learn: readJsonl(path.join(D, OLD + d, 'learning.jsonl')) }));

log('# Computed numbers for the strong baselines and measured isolation at warpdom 5942dc9\n');
log('Generated by `tools/results-5942dc9.cjs` from the archived files in ci-2026-10-14-5942dc9-baselines-{tuning,heldout,apps} (see its header for the conventions). Every table names its source. "learned" in the data = the paper\'s measured isolation.\n');

// ---------- runs, runners, rounds ----------
log('## Runs, runners and rounds\n');
log('Source: each directory\'s environment records (`timing-ci-<suite>.env-*.json`), timing-ci.csv (rounds with a time) and notes (`timing-ci-<suite>.notes.txt`).\n');
log('| Directory | Suite | warpdom | harness (dom-api-tracer) | Node | cores, memory | CPU | timed rounds | NA and budget notes |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const cpus = new Map(); const commits = new Map();
for (const { J } of BL) {
  const files = fs.readdirSync(path.join(D, J.dir));
  for (const s of [...J.data.keys()].sort()) {
    const ef = files.find((f) => f.startsWith(`timing-ci-${s}.env-`));
    const e = JSON.parse(fs.readFileSync(path.join(D, J.dir, ef), 'utf8'));
    const nf = path.join(D, J.dir, `timing-ci-${s}.notes.txt`);
    const notes = fs.existsSync(nf) ? fs.readFileSync(nf, 'utf8').split('\n').filter((l) => /^(NA|BUDGET)/.test(l)).map((l) => l.replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 160)) : [];
    cpus.set(e.cpu.model, (cpus.get(e.cpu.model) ?? 0) + 1);
    const ck = `warpdom ${e.warpdom.commit}${e.warpdom.dirty ? ' (dirty)' : ' (clean)'}, harness ${e.domApiTracer.commit}${e.domApiTracer.dirty ? ' (dirty)' : ' (clean)'}`;
    commits.set(ck, (commits.get(ck) ?? 0) + 1);
    log(`| ${J.dir.replace(P, '')} | ${s} | ${e.warpdom.commit.slice(0, 7)}${e.warpdom.dirty ? ' dirty' : ''} | ${e.domApiTracer.commit.slice(0, 7)}${e.domApiTracer.dirty ? ' dirty' : ''} | ${e.node} | ${e.cpu.cores}, ${e.memory.totalGiB} GiB | ${e.cpu.model} | ${J.data.get(s).size} | ${notes.join('; ') || '—'} |`);
  }
}
log('');
for (const [k, n] of commits) log(`- ${n} records: ${k}`);
log(`- CPU models: ${[...cpus].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} (${n})`).join('; ')}`);

// ---------- every configuration per suite ----------
log('\n## Every configuration per suite\n');
log('Source: timing-ci.csv and pertest.tar.xz of each directory. Cell: median time; speedup over jsdom-default (median of per-round ratios, range); tests differing from the same round\'s jsdom-default, most in any round, raw (without the job\'s flaky tests). Rounds: timed rounds with a time for that configuration.\n');
for (const { k, J } of BL) {
  log(`### ${k}\n`);
  log(`| Suite | flaky tests in job | ${CONFIGS.join(' | ')} |`);
  log(`| --- | --- | ${CONFIGS.map(() => '---').join(' | ')} |`);
  for (const s of [...J.data.keys()].sort()) {
    const p = J.data.get(s);
    const cell = (c) => { const n = valid([...p.values()].map((r) => r[c]?.secs ?? NaN)).length; if (!n) return 'NA'; return `${s1(medT(p, c))}; ${c === 'jsdom-default' ? '1.00x' : xr(ratios(p, 'jsdom-default', c))}; ${differAll(J, s, c).str}${n < p.size ? `; ${n} of ${p.size} rounds` : ''}`; };
    log(`| ${s} | ${J.flaky[s].tests.size} | ${CONFIGS.map(cell).join(' | ')} |`);
  }
  log('');
}

// ---------- measured isolation table and comparisons ----------
log('## Measured isolation ("learned" in the data) and the strong baselines\n');
log('Best correct jsdom configuration from each report.md (ablation-report.cjs: the fastest of jsdom-default/-shared/-vm/-sharedclean by median time whose tests match jsdom-default in every round, the job\'s flaky set excluded; jsdom-learned is not a candidate). Cells as above.\n');
const cmp = { ld: {}, lb: {}, jl: {}, wj: {}, sc: {}, sr: {}, sf: {}, lj: {}, dj: {} };
const bestBy = {}; const everyBy = {};
for (const { k, J } of BL) {
  const { best, every } = bestOf(J.dir);
  everyBy[k] = every;
  log(`### ${k}\n`);
  log('| Suite | rounds | jsdom default | correct jsdom configurations | best correct jsdom | jsdom-learned | warpdom drop-in | warpdom shared+reset | warpdom-learned (method) |');
  log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of [...J.data.keys()].sort()) {
    const p = J.data.get(s);
    const b = best[s].best; bestBy[`${k}/${s}`] = b;
    const cell = (c) => `${s1(medT(p, c))}; ${xr(ratios(p, 'jsdom-default', c))}; ${differAll(J, s, c).str}`;
    const method = [...p.values()].map((r) => r['warpdom-learned']?.method).find(Boolean) ?? '';
    log(`| ${s} | ${p.size} | ${s1(medT(p, 'jsdom-default'))} | ${best[s].correct.join(', ')} | ${b}: ${s1(medT(p, b))}, ${b === 'jsdom-default' ? '1.00x' : xr(ratios(p, 'jsdom-default', b))} | ${cell('jsdom-learned')} | ${cell('warpdom-default')} | ${cell('warpdom-sharedreset')} | ${cell('warpdom-learned')} (${method}) |`);
    const key = `${k}/${s}`;
    cmp.ld[key] = ratios(p, 'warpdom-default', 'warpdom-learned');
    cmp.lb[key] = ratios(p, b, 'warpdom-learned');
    cmp.jl[key] = ratios(p, 'jsdom-default', 'jsdom-learned');
    cmp.wj[key] = ratios(p, 'jsdom-learned', 'warpdom-learned');
    cmp.sc[key] = ratios(p, 'jsdom-default', 'jsdom-sharedclean');
    cmp.sr[key] = ratios(p, 'jsdom-default', 'warpdom-sharedreset');
    cmp.sf[key] = ratios(p, 'jsdom-default', 'warpdom-sharedfresh');
    cmp.lj[key] = ratios(p, 'jsdom-default', 'warpdom-learned');
    cmp.dj[key] = ratios(p, 'jsdom-default', 'warpdom-default');
  }
  log(`\nEvery non-default jsdom configuration changes results (report.md): ${every || 'none'}\n`);
}
// Which jsdom alternatives keep results, counted over the 16 Vitest suites.
{
  const counts = {};
  for (const { k, J } of BL) { const { best } = bestOf(J.dir); for (const s of J.data.keys()) for (const c of best[s].correct) if (c !== 'jsdom-default') (counts[c] ??= []).push(k === 'apps' ? `${s} (app)` : s); }
  log('Correct jsdom alternatives (report.md "correct jsdom configurations"), by configuration:\n');
  for (const [c, l] of Object.entries(counts).sort()) log(`- ${c}: ${l.length} (${l.sort().join(', ')})`);
}

log('\n### Pairwise comparisons per suite\n');
log('Median of per-round ratios (range). learned vs drop-in = warpdom-default / warpdom-learned (> 1: learned faster); learned vs best = best correct jsdom / warpdom-learned; learned vs jsdom default = jsdom-default / warpdom-learned; jsdom-learned vs jsdom-default = jsdom-default / jsdom-learned; warpdom-learned vs jsdom-learned = jsdom-learned / warpdom-learned.\n');
log('| Suite | best correct jsdom | learned vs jsdom default | learned vs best correct jsdom | learned vs drop-in | jsdom-learned vs jsdom-default | warpdom-learned vs jsdom-learned |');
log('| --- | --- | --- | --- | --- | --- | --- |');
for (const key of Object.keys(cmp.ld)) log(`| ${key} | ${bestBy[key]} | ${xr(cmp.lj[key])} | ${xr(cmp.lb[key])} | ${xr(cmp.ld[key])} | ${xr(cmp.jl[key])} | ${xr(cmp.wj[key])} |`);
log('\n### Cross-suite medians\n');
log('Two-level bootstrap as timing-report.cjs (resample suites, then rounds within each chosen suite; seed 0x5eed, 10,000 resamples). Sets: the 16 Vitest suites (11 tuning, 5 held-out); ariakit has 1 timed round and CopilotKit 2 (budget), so two sets leave them out. Excalidraw (application, 3 rounds) is not in any median.\n');
log('| Comparison | set | median | leave-one-out medians: lowest - highest |');
log('| --- | --- | --- | --- |');
const sets = {
  'tuning (11)': (k) => k.startsWith('tuning/'),
  'held-out (5)': (k) => k.startsWith('held-out/'),
  'tuning + held-out (16)': (k) => !k.startsWith('apps/'),
  'without ariakit (1 round) (15)': (k) => !k.startsWith('apps/') && k !== 'tuning/ariakit',
  'without ariakit and CopilotKit (1-2 rounds) (14)': (k) => !k.startsWith('apps/') && k !== 'tuning/ariakit' && k !== 'tuning/CopilotKit',
};
const MED = {};
for (const [name, m] of [['warpdom-learned vs jsdom-default', cmp.lj], ['warpdom drop-in vs jsdom-default (same job)', cmp.dj], ['learned vs best correct jsdom', cmp.lb], ['learned vs drop-in', cmp.ld], ['jsdom-learned vs jsdom-default', cmp.jl], ['warpdom-learned vs jsdom-learned', cmp.wj], ['jsdom-sharedclean vs jsdom-default', cmp.sc], ['warpdom shared+reset vs jsdom-default (A1 policy)', cmp.sr], ['warpdom shared-fresh vs jsdom-default (A1 identity)', cmp.sf]]) {
  for (const [sn, f] of Object.entries(sets)) {
    const ks = Object.keys(m).filter(f);
    const b = boot2(ks.map((k) => m[k]));
    MED[`${name}|${sn}`] = b;
    const loo = ks.map((s) => ({ s, v: mid(ks.filter((t) => t !== s).map((t) => mid(m[t]))) }));
    const mn = loo.reduce((a, c) => (c.v < a.v ? c : a)), mx = loo.reduce((a, c) => (c.v > a.v ? c : a));
    log(`| ${name} | ${sn} | ${bootStr(b)} | ${x2(mn.v)} (without ${mn.s}) - ${x2(mx.v)} (without ${mx.s}) |`);
  }
}
// Sensitivity: ark-ui's jsdom-vm differs from jsdom-default only in tests that fail in this job's
// jsdom-default runs and are flaky on jsdom in other jobs (NumberInput smallStep/largeStep, Toast);
// at 208ad49 jsdom-vm was ark-ui's best correct configuration. Medians with jsdom-vm as ark-ui's best.
{
  const alt = { ...cmp.lb, 'tuning/ark-ui': ratios(BL[0].J.data.get('ark-ui'), 'jsdom-vm', 'warpdom-learned') };
  log(`\nSensitivity (ark-ui's best correct jsdom taken as jsdom-vm, whose only differences are NumberInput smallStep/largeStep and Toast tests): ark-ui learned vs jsdom-vm ${xr(alt['tuning/ark-ui'])}; learned vs best correct jsdom, tuning (11) ${bootStr(boot2(Object.keys(alt).filter(sets['tuning (11)']).map((k) => alt[k])))}; 16 Vitest ${bootStr(boot2(Object.keys(alt).filter(sets['tuning + held-out (16)']).map((k) => alt[k])))}.`);
}
{
  const gm = (a) => Math.exp(valid(a).reduce((x, y) => x + Math.log(y), 0) / valid(a).length);
  const ks = Object.keys(cmp.lj).filter(sets['tuning + held-out (16)']);
  log(`\nOther summaries over the 16 Vitest suites: geometric mean of the per-suite medians, learned vs jsdom default ${x2(gm(ks.map((k) => mid(cmp.lj[k]))))}, learned vs best correct jsdom ${x2(gm(ks.map((k) => mid(cmp.lb[k]))))}, learned vs drop-in ${x2(gm(ks.map((k) => mid(cmp.ld[k]))))}.`);
}

// ---------- A1 ----------
log('\n## A1: shared-fresh and shared+reset\n');
log('Per suite: speedup over jsdom-default (median, range); tests differing from the same round\'s jsdom-default, most in any round, raw (without flaky); and from the same round\'s warpdom-default (the drop-in), raw (without the job\'s jsdom flaky set). "Keeps the drop-in\'s results" = 0 tests differing from the drop-in without flaky tests in every round.\n');
log('| Suite | shared-fresh vs jsdom default | differing from jsdom | differing from drop-in | shared+reset vs jsdom default | differing from jsdom | differing from drop-in | drop-in differing from jsdom |');
log('| --- | --- | --- | --- | --- | --- | --- | --- |');
const a1 = { fresh: { keep: [], change: [] }, reset: { keep: [], change: [] } };
for (const { k, J } of BL) for (const s of [...J.data.keys()].sort()) {
  const key = `${k}/${s}`;
  const f = differAll(J, s, 'warpdom-sharedfresh'), fd = differAll(J, s, 'warpdom-sharedfresh', 'warpdom-default');
  const r = differAll(J, s, 'warpdom-sharedreset'), rd = differAll(J, s, 'warpdom-sharedreset', 'warpdom-default');
  (fd.stable === 0 ? a1.fresh.keep : a1.fresh.change).push(`${s} ${fd.stable}`);
  (rd.stable === 0 ? a1.reset.keep : a1.reset.change).push(`${s} ${rd.stable}`);
  log(`| ${key} | ${xr(cmp.sf[key])} | ${f.str} | ${fd.str} | ${xr(cmp.sr[key])} | ${r.str} | ${rd.str} | ${differAll(J, s, 'warpdom-default').str} |`);
}
log(`\n- shared-fresh keeps the drop-in's results on ${a1.fresh.keep.length} of 17: ${a1.fresh.keep.map((x) => x.split(' ')[0]).join(', ')}; changes them on ${a1.fresh.change.length}: ${a1.fresh.change.join(', ')}.`);
log(`- shared+reset keeps the drop-in's results on ${a1.reset.keep.length} of 17: ${a1.reset.keep.map((x) => x.split(' ')[0]).join(', ')}; changes them on ${a1.reset.change.length}: ${a1.reset.change.join(', ')}.`);

// ---------- P3 ----------
log('\n## P3: is measured isolation slower (or faster) than the drop-in?\n');
log('Per-round ratio warpdom-default / warpdom-learned (< 1: learned slower). Thresholds: the A/A 95th percentile of the 208ad49 A/A runs (4.1% tuning, 4.8% held-out: ci-2026-10-13-208ad49-ablation-a2a3/*/report.md) and the 3.1% of the CLI\'s margin documentation (docs/fast-mode.md, run 38303845272 at 77bec904). "beyond" = the median ratio is below 1/(1+t) (slower) or above 1+t (faster); "every round" = all per-round ratios below 1.\n');
log('| Suite | rounds | learned vs drop-in | slower beyond 3.1% | slower beyond 4.1% | slower in every round | faster beyond 4.8% |');
log('| --- | --- | --- | --- | --- | --- | --- |');
const P3 = { slow31: [], slow41: [], every: [], fast: [] };
for (const key of Object.keys(cmp.ld)) {
  const r = valid(cmp.ld[key]); const m = mid(r);
  const s31 = m < 1 / 1.031, s41 = m < 1 / 1.041, ev = hi(r) < 1, f = m > 1.048;
  if (s31) P3.slow31.push(key); if (s41) P3.slow41.push(key); if (ev) P3.every.push(`${key} ${xr(r)}`); if (f) P3.fast.push(`${key} ${x2(m)}`);
  log(`| ${key} | ${r.length} | ${xr(r)} | ${s31 ? 'yes' : ''} | ${s41 ? 'yes' : ''} | ${ev ? 'yes' : ''} | ${f ? 'yes' : ''} |`);
}
log(`\n- Slower beyond 3.1%: ${P3.slow31.join(', ') || 'none'}. Beyond 4.1%: ${P3.slow41.join(', ') || 'none'}. Slower in every round: ${P3.every.join('; ') || 'none'}.`);
log(`- Faster than the drop-in beyond 4.8%: ${P3.fast.join(', ')}.`);
{
  let lowest = { k: '', v: Infinity };
  for (const key of Object.keys(cmp.ld)) for (const v of valid(cmp.ld[key])) if (v < lowest.v) lowest = { k: key, v };
  log(`- Lowest single round: ${lowest.k} ${x2(lowest.v)}.`);
}

// ---------- false passes ----------
log('\n## False passes (G2 candidates), per test\n');
log('A false pass: a test the learned configuration reported passed while the same DOM\'s isolated run of the same round (warpdom-default, or jsdom-default for jsdom-learned) did not pass. Class: "fails on jsdom" (jsdom-default did not pass it in that round either), "flaky" (in the job\'s jsdom flaky set), "missing in isolated run" (no result there); a **G2 candidate** is a test that passed under the learned configuration while failing (or having no result) in every isolated run of that DOM in the job, warm-up included, and whose file ran shared in that timed run (run record of learning.jsonl: the mode used and the files isolated). A file that ran isolated (isolated mode, or in the isolated set) cannot have been changed by a leak. CSV false_pass sums for comparison.\n');
log('| Suite | configuration | round | test | isolated | jsdom | flaky in job | isolated runs of the job not passed | file in that timed run | class |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const g2 = [];
const RECS = {};
function placement(k, J, s, c, r, t) { // where the test's file ran in the timed learned run of round r
  const recs = RECS[J.dir] ??= readJsonl(path.join(D, J.dir, 'learning.jsonl'));
  const run = recs.find((x) => x.kind === 'run' && x.project === s && (x.config ?? 'warpdom-learned') === c && String(x.round) === String(r));
  if (!run) return 'no run record';
  const [pkg, rel] = t.split('::');
  let m = run.mode;
  if (m.includes(';')) m = (m.split(';').find((x) => x.startsWith(pkg + '=')) ?? '=isolated').split('=')[1];
  if (m !== 'split') return `isolated mode (${pkg})`;
  const inL = (run.leaky ?? []).some((f) => { const [fp, fr] = f.includes('::') ? f.split('::') : [null, f]; return (fp === null || fp === pkg) && (rel.endsWith(fr) || fr.endsWith(rel)); });
  return inL ? 'isolated (in the isolated set)' : 'shared';
}
const fpSum = {};
for (const { k, J } of BL) for (const s of [...J.data.keys()].sort()) for (const c of ['warpdom-learned', 'jsdom-learned']) {
  const iso = c === 'warpdom-learned' ? 'warpdom-default' : 'jsdom-default';
  const allRounds = fs.readdirSync(J.pt).filter((r) => fs.existsSync(path.join(J.pt, r, s, `${iso}.json`)));
  const isoMaps = allRounds.map((r) => readMap(path.join(J.pt, r, s, `${iso}.json`))).filter(Boolean);
  fpSum[`${k}/${s}/${c}`] = valid([...J.data.get(s).values()].map((r) => r[c]?.fp ?? NaN)).reduce((a, b) => a + b, 0);
  for (const r of [...J.data.get(s).keys()]) {
    const L = readMap(path.join(J.pt, r, s, `${c}.json`)), I = readMap(path.join(J.pt, r, s, `${iso}.json`)), B = readMap(path.join(J.pt, r, s, 'jsdom-default.json'));
    if (!L || !I) continue;
    for (const [t, v] of Object.entries(L.tests)) {
      if (v.s !== 'passed' || I.tests[t]?.s === 'passed') continue;
      const notPassed = isoMaps.filter((m) => m.tests[t]?.s !== 'passed').length;
      const fl = J.flaky[s].tests.has(t);
      const js = B?.tests[t]?.s ?? 'missing';
      const where = placement(k, J, s, c, r, t);
      const cls = notPassed === isoMaps.length ? (where === 'shared' ? '**G2 candidate** (failed in every isolated run of the job; ran shared)' : 'failed in every isolated run of the job, but ran isolated (not a leak)') : fl ? 'flaky on jsdom' : js !== 'passed' ? 'fails on jsdom' : !I.tests[t] ? 'missing in isolated run' : 'passes on jsdom; fails in some isolated runs';
      g2.push({ k, s, c, r, t, cls });
      log(`| ${s} | ${c} | ${r} | ${t.split('::').slice(1).join('::').slice(0, 140)} | ${I.tests[t]?.s ?? 'missing'} | ${js} | ${fl ? 'yes' : 'no'} | ${notPassed} of ${isoMaps.length} | ${where} | ${cls} |`);
    }
  }
}
log('\nSummary by suite and configuration (count from the per-test maps; CSV false_pass sum):\n');
const byS = new Map();
for (const x of g2) { const key = `${x.k}/${x.s}/${x.c}`; const m = byS.get(key) ?? byS.set(key, new Map()).get(key); m.set(x.cls, (m.get(x.cls) ?? 0) + 1); }
for (const [key, m] of byS) log(`- ${key}: ${[...m].map(([c, n]) => `${n} ${c}`).join(', ')} (CSV ${fpSum[key]})`);
const nonzero = Object.entries(fpSum).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
log(`- CSV false_pass sums > 0: ${nonzero.join(', ') || 'none'}.`);
log(`- G2 candidates (passed shared, failed in every isolated run of the job): ${g2.filter((x) => x.cls.includes('G2')).map((x) => `${x.s} ${x.c} round ${x.r}: ${x.t.split('::').pop()}`).join('; ') || 'none'}.`);

// ---------- learning ----------
log('\n## Learning: modes, stability, re-runs, cost and break-even\n');
log('Source: learning.jsonl of each directory. Learnings: the warm-up\'s (round 0) and one from scratch in each timed round. The timed learned runs use the state of the warm-up learning (as ablation-report.cjs states; the run records confirm it: e.g. ark-ui ran react split in all 5 timed runs while learnings 2-4 chose all isolated); the per-round learnings measure stability and cost. Modes: per learning, in round order (CLI: the projects split, or "all isolated"). Mode agreement: share of learnings choosing the most common mode. Jaccard: mean pairwise similarity of the leaky (isolated) file sets. Timed runs: the mode each timed run used (the mode field of the run record), files re-run by the safety net and new leaky files, summed. Cost: median over learnings of the whole learning time minus its isolated run (seconds - t_iso; = t_sh + t_split where both are recorded), "k of n" learnings with both seconds and t_iso. Break-even: cost / (median isolated run - median learned run) from timing-ci.csv, the isolated run being the same DOM\'s default.\n');
log('| Suite | configuration | method | learnings | modes per learning (round 0-5) | mode agreement | leaky files min-max | Jaccard | timed runs: modes | re-runs, new leaky | cost | gain per run | break-even runs |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const LEARN = {};
for (const { k, J } of BL) {
  const recs = readJsonl(path.join(D, J.dir, 'learning.jsonl'));
  for (const g of [...new Set(recs.map((r) => `${r.project}\t${r.config ?? 'warpdom-learned'}`))].sort()) {
    const [s, c] = g.split('\t');
    const all = recs.filter((r) => r.project === s && (r.config ?? 'warpdom-learned') === c);
    const L = all.filter((r) => r.kind === 'learn').sort((a, b) => a.round - b.round);
    const R = all.filter((r) => r.kind === 'run').sort((a, b) => a.round - b.round);
    const modes = new Map(); for (const r of L) modes.set(modeName(r.mode), (modes.get(modeName(r.mode)) ?? 0) + 1);
    const pairs = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pairs.push(jac(L[i].leaky, L[j].leaky));
    const exact = L.filter((r) => r.seconds != null && r.t_iso != null).map((r) => r.seconds - r.t_iso);
    const cost = mid(exact);
    const p = J.data.get(s);
    const gain = medT(p, c === 'jsdom-learned' ? 'jsdom-default' : 'warpdom-default') - medT(p, c);
    const sizes = L.map((r) => r.leaky.length);
    const agree = Math.max(...modes.values()) / L.length;
    const runModes = new Map(); for (const r of R) runModes.set(modeName(r.mode), (runModes.get(modeName(r.mode)) ?? 0) + 1);
    const reruns = R.reduce((a, r) => a + (r.rerun ?? 0), 0), newl = R.reduce((a, r) => a + (r.new_leaky?.length ?? 0), 0);
    const be = Number.isNaN(cost) || Number.isNaN(gain) ? '—' : gain <= 0 ? 'never' : (cost / gain).toFixed(1);
    LEARN[`${k}/${s}/${c}`] = { modes: L.map((r) => modeName(r.mode)), agree, be, cost, gain, reruns, jac: pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : NaN, sizes };
    log(`| ${k}/${s} | ${c} | ${[...new Set(L.map((r) => r.method))].join(', ')} | ${L.length} | ${L.map((r) => modeName(r.mode)).join('; ')} | ${agree.toFixed(2)} | ${Math.min(...sizes)}-${Math.max(...sizes)} | ${pairs.length ? (pairs.reduce((a, b) => a + b, 0) / pairs.length).toFixed(2) : '—'} | ${[...runModes].map(([m, n]) => `${m} ${n}`).join(', ')} | ${reruns}, ${newl} | ${s1(cost)} (${exact.length} of ${L.length}) | ${s1(gain)} | ${be} |`);
  }
}
{
  const w = Object.entries(LEARN).filter(([k]) => k.endsWith('/warpdom-learned')), j = Object.entries(LEARN).filter(([k]) => k.endsWith('/jsdom-learned'));
  log(`\n- Mode agreement 1.00: warpdom-learned on ${w.filter(([, v]) => v.agree === 1).length} of ${w.length} (not: ${w.filter(([, v]) => v.agree < 1).map(([k, v]) => `${k.split('/')[1]} ${v.agree.toFixed(2)}`).join(', ')}); jsdom-learned on ${j.filter(([, v]) => v.agree === 1).length} of ${j.length} (not: ${j.filter(([, v]) => v.agree < 1).map(([k, v]) => `${k.split('/')[1]} ${v.agree.toFixed(2)}`).join(', ')}).`);
  log(`- Safety-net re-runs in timed runs: warpdom-learned ${w.filter(([, v]) => v.reruns).map(([k, v]) => `${k.split('/')[1]} ${v.reruns}`).join(', ') || 'none'}; jsdom-learned ${j.filter(([, v]) => v.reruns).map(([k, v]) => `${k.split('/')[1]} ${v.reruns}`).join(', ') || 'none'}.`);
}

// ---------- CLI learnings: reasons ----------
log('\n## CLI learnings: the recorded reasons (selected suites)\n');
log('Source: learning.jsonl, records with method cli (the shipped `warpdom vitest run`), field `reasons`, at 5942dc9 and, for comparison, at 208ad49 (ci-2026-10-13-208ad49-baselines-*/learning.jsonl). Only the projects whose decision is not "does not beat isolated by more than the margin" in every learning are shown for multi-project suites.\n');
for (const s of ['vueuse', 'naive-ui', 'CopilotKit', 'ark-ui']) {
  for (const [label, dirs] of [['208ad49', OLDBL.map((o) => o.learn)], ['5942dc9', BL.map(({ J }) => readJsonl(path.join(D, J.dir, 'learning.jsonl')))]]) {
    const L = dirs.flat().filter((r) => r.project === s && r.kind === 'learn' && r.method === 'cli').sort((a, b) => a.round - b.round);
    log(`- **${s} at ${label}:** ${L.map((r) => `round ${r.round}: ${modeName(r.mode)} [${(r.reasons ?? []).filter((x) => !/does not beat isolated/.test(x) || /vue|react:|root/.test(x)).map((x) => x.replace(/^packages_/, '')).join('; ')}]`).join(' / ')}`);
  }
}

// ---------- comparison with 208ad49 ----------
log('\n## Comparison with the 208ad49 baselines\n');
log('Same procedure on ci-2026-10-13-208ad49-baselines-*/timing-ci.csv and learning.jsonl. Modes: warpdom-learned learnings (round 0-5); ratios as above.\n');
log('| Suite | rounds 208ad49 / 5942dc9 | modes 208ad49 | modes 5942dc9 | learned vs drop-in 208ad49 | 5942dc9 | learned vs jsdom default 208ad49 | 5942dc9 | drop-in vs jsdom default 208ad49 | 5942dc9 |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const summarize = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([a, n]) => `${a} ${n}`).join(', '); };
for (let i = 0; i < BL.length; i++) {
  const { k, J } = BL[i]; const O = OLDBL[i];
  for (const s of [...J.data.keys()].sort()) {
    const po = O.data.get(s), pn = J.data.get(s);
    const om = O.learn.filter((r) => r.project === s && r.kind === 'learn' && (r.config ?? 'warpdom-learned') === 'warpdom-learned').sort((a, b) => a.round - b.round).map((r) => modeName(r.mode));
    log(`| ${k}/${s} | ${po.size} / ${pn.size} | ${summarize(om)} | ${summarize(LEARN[`${k}/${s}/warpdom-learned`].modes)} | ${xr(ratios(po, 'warpdom-default', 'warpdom-learned'))} | ${xr(cmp.ld[`${k}/${s}`])} | ${xr(ratios(po, 'jsdom-default', 'warpdom-learned'))} | ${xr(cmp.lj[`${k}/${s}`])} | ${xr(ratios(po, 'jsdom-default', 'warpdom-default'))} | ${xr(cmp.dj[`${k}/${s}`])} |`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
