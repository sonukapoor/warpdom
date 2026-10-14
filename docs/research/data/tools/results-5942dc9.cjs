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
// Since the third internal review (2026-10-14): the best correct jsdom configuration is chosen here,
// not taken from report.md, by a symmetric rule (the job's flaky set and the tests nondeterministic in
// isolated runs, pooled over every per-test archive at the same DOM code, are excluded for jsdom
// alternatives as they are for warpdom; the best is the one with the highest median per-round ratio
// over jsdom-default); plus false passes in shared files of any class, the drop-in's cross-suite
// medians in both jobs and the estimated split runs per calibration. Run with DOM_API_TRACER pinned
// at harness 843087f (tools/README.md).
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

// ---------- the symmetric rule: tests nondeterministic in isolated runs, pooled ----------
// Every archived job at the same DOM code (208ad49 and 5942dc9 differ only in the fast-mode command):
// a test is nondeterministic in a suite if its status (missing counted as a status) is not the same
// in every run, warm-ups included, of one isolated configuration: jsdom's default, jsdom's VM pool or
// warpdom's drop-in (the A/A copy of the drop-in included). The same set is excluded on both sides:
// for a jsdom alternative (is it correct?) and for warpdom (Table 4 classes such tests as
// nondeterministic). Shared configurations are not pooled, because leaks make their outcomes vary.
const POOL_DIRS = [
  `${OLD}threeway-tuning/run1-38426985620`, `${OLD}threeway-tuning/run2-38427009322`, `${OLD}threeway-tuning/run3-38427031231`,
  `${OLD}threeway-heldout`, `${OLD}threeway-apps`, `${OLD}ablation-a2a3/tuning-38427093681`, `${OLD}ablation-a2a3/heldout-38427115775`,
  `${OLD}ablation-a4/tuning-38427136397`, `${OLD}ablation-a4/heldout-38427158136`,
  `${OLD}baselines-tuning`, `${OLD}baselines-heldout`, `${OLD}baselines-apps`,
  `${P}baselines-tuning`, `${P}baselines-heldout`, `${P}baselines-apps`,
];
const ISO_CONFIGS = { 'jsdom-default': 'jsdom-default', 'jsdom-vm': 'jsdom-vm', 'warpdom-default': 'warpdom-default', 'warpdom-default-aa': 'warpdom-default' };
const POOL = {}; // suite -> config -> [test maps]
for (const dir of POOL_DIRS) {
  const pt = extract(dir, 'pertest.tar.xz', 'pertest');
  for (const r of fs.readdirSync(pt)) for (const s of fs.readdirSync(path.join(pt, r))) for (const [file, c] of Object.entries(ISO_CONFIGS)) {
    const m = readMap(path.join(pt, r, s, `${file}.json`));
    if (m) ((POOL[s] ??= {})[c] ??= []).push(m.tests);
  }
}
const NONDET = {}; // suite -> Map test -> configurations in which it is nondeterministic
for (const [s, byC] of Object.entries(POOL)) {
  const n = new Map();
  for (const [c, maps] of Object.entries(byC)) for (const k of new Set(maps.flatMap((m) => Object.keys(m)))) if (new Set(maps.map((m) => m[k]?.s ?? 'missing')).size > 1) n.set(k, [...(n.get(k) ?? []), c]);
  NONDET[s] = n;
}
// As ablation-report.cjs's correct(), with the job's flaky set and the pooled set excluded: a time in
// every timed round, a per-test map in every timed round, no other test differing in any round.
function correctSym(J, s, c) {
  if (c === 'jsdom-default') return true;
  const p = J.data.get(s);
  const timedRounds = [...p.values()].filter((r) => r[c]);
  if (!timedRounds.length || timedRounds.some((r) => Number.isNaN(r[c].secs))) return false;
  const rounds = fs.readdirSync(J.pt).filter((r) => r !== '0' && fs.existsSync(path.join(J.pt, r, s)));
  for (const r of rounds) {
    const base = readMap(path.join(J.pt, r, s, 'jsdom-default.json')), run = readMap(path.join(J.pt, r, s, `${c}.json`));
    if (!base || !run) return false;
    for (const k of new Set([...Object.keys(base.tests), ...Object.keys(run.tests)])) if (base.tests[k]?.s !== run.tests[k]?.s && !J.flaky[s].tests.has(k) && !NONDET[s]?.has(k)) return false;
  }
  return true;
}
const JSDOM_ALTS = ['jsdom-shared', 'jsdom-sharedclean', 'jsdom-vm'];
// The best correct jsdom configuration: of jsdom-default and the correct alternatives, the one with
// the highest speedup over jsdom-default by the statistic the paper reports (median of per-round
// ratios; jsdom-default itself 1).
function bestSym(J, s) {
  const p = J.data.get(s);
  const correct = ['jsdom-default', ...JSDOM_ALTS.filter((c) => [...p.values()].some((r) => r[c]) && correctSym(J, s, c))];
  const sp = (c) => (c === 'jsdom-default' ? 1 : mid(ratios(p, 'jsdom-default', c)));
  const best = correct.reduce((a, c) => (sp(c) > sp(a) ? c : a));
  return { correct, best, sp: sp(best) };
}

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
log('Best correct jsdom configuration, symmetric rule (this script, not report.md): a jsdom alternative (jsdom-shared, jsdom-sharedclean, jsdom-vm) is correct if it has a time and a per-test map in every timed round and no test differs from the same round\'s jsdom-default except tests in the job\'s flaky set or nondeterministic in isolated runs (pooled over every archived job at the same DOM code; section "Nondeterministic tests" below). The same exclusion applies to warpdom\'s configurations. Of jsdom-default and the correct alternatives, the best is the one with the highest median of per-round ratios over jsdom-default, the statistic the speedups use. jsdom-learned is not a candidate: it is the policy under evaluation, applied to jsdom, and is reported in its own column. Cells as above.\n');
log('### Nondeterministic tests (pooled over every archived job at the same DOM code)\n');
log(`Archives: ${POOL_DIRS.join(', ')} (pertest.tar.xz of each). Per suite: tests whose status is not the same in every run of one isolated configuration (in brackets).\n`);
for (const s of Object.keys(NONDET).sort()) if (NONDET[s].size) {
  const byC = new Map(); for (const cs of NONDET[s].values()) { const key = cs.join('+'); byC.set(key, (byC.get(key) ?? 0) + 1); }
  log(`- ${s}: ${NONDET[s].size} (${[...byC].map(([c, n]) => `${n} [${c}]`).join(', ')})${NONDET[s].size <= 6 ? `: ${[...NONDET[s].keys()].map((t) => t.split('::').pop().slice(0, 90)).join('; ')}` : ''}`);
}
log('');
const cmp = { ld: {}, lb: {}, jl: {}, wj: {}, sc: {}, sr: {}, sf: {}, lj: {}, dj: {} };
const bestBy = {}; const everyBy = {}; const correctBy = {};
for (const { k, J } of BL) {
  const { best: perJob } = bestOf(J.dir);
  log(`### ${k}\n`);
  log('| Suite | rounds | jsdom default | correct jsdom configurations | best correct jsdom | jsdom-learned | warpdom drop-in | warpdom shared+reset | warpdom-learned (method) |');
  log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const every = [];
  for (const s of [...J.data.keys()].sort()) {
    const p = J.data.get(s);
    const sym = bestSym(J, s);
    const b = sym.best; bestBy[`${k}/${s}`] = b; correctBy[`${k}/${s}`] = sym.correct;
    const ran = JSDOM_ALTS.filter((c) => [...p.values()].some((r) => r[c]));
    if (ran.length && ran.every((c) => !sym.correct.includes(c))) every.push(`${s} (${ran.join(', ')})`);
    const diffRule = JSON.stringify([...perJob[s].correct].sort()) !== JSON.stringify([...sym.correct].sort());
    const cell = (c) => `${s1(medT(p, c))}; ${xr(ratios(p, 'jsdom-default', c))}; ${differAll(J, s, c).str}`;
    const method = [...p.values()].map((r) => r['warpdom-learned']?.method).find(Boolean) ?? '';
    log(`| ${s} | ${p.size} | ${s1(medT(p, 'jsdom-default'))} | ${sym.correct.join(', ')}${diffRule ? ` (per-job flaky set only: ${perJob[s].correct.join(', ')})` : ''} | ${b}: ${s1(medT(p, b))}, ${b === 'jsdom-default' ? '1.00x' : xr(ratios(p, 'jsdom-default', b))} | ${cell('jsdom-learned')} | ${cell('warpdom-default')} | ${cell('warpdom-sharedreset')} | ${cell('warpdom-learned')} (${method}) |`);
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
  everyBy[k] = every.join(', ');
  log(`\nEvery non-default jsdom configuration changes results (symmetric rule): ${every.join(', ') || 'none'}.\n`);
}
// Which jsdom alternatives keep results, counted over the 16 Vitest suites.
{
  const counts = {};
  const any = new Set();
  for (const { k, J } of BL) for (const s of J.data.keys()) for (const c of correctBy[`${k}/${s}`]) if (c !== 'jsdom-default') { (counts[c] ??= []).push(k === 'apps' ? `${s} (app)` : s); any.add(`${k}/${s}`); }
  log('Correct jsdom alternatives (symmetric rule), by configuration:\n');
  for (const [c, l] of Object.entries(counts).sort()) log(`- ${c}: ${l.length} (${l.sort().join(', ')})`);
  log(`- Suites with at least one correct alternative: ${any.size} (${[...any].sort().join(', ')}).`);
  log(`- Best correct configuration not jsdom-default: ${Object.entries(bestBy).filter(([, b]) => b !== 'jsdom-default').map(([k, b]) => `${k} ${b}`).join(', ')}.`);
}

log('\n### Pairwise comparisons per suite\n');
log('Median of per-round ratios (range). learned vs drop-in = warpdom-default / warpdom-learned (> 1: learned faster); learned vs best = best correct jsdom / warpdom-learned; learned vs jsdom default = jsdom-default / warpdom-learned; jsdom-learned vs jsdom-default = jsdom-default / jsdom-learned; warpdom-learned vs jsdom-learned = jsdom-learned / warpdom-learned.\n');
log('| Suite | best correct jsdom (its speedup) | learned vs jsdom default | drop-in vs jsdom default (same job) | learned vs best correct jsdom | learned vs drop-in | jsdom-learned vs jsdom-default | warpdom-learned vs jsdom-learned |');
log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const { k, J } of BL) for (const s of [...J.data.keys()].sort()) { const key = `${k}/${s}`; const b = bestBy[key]; log(`| ${key} | ${b}${b === 'jsdom-default' ? '' : ` (${x2(mid(ratios(J.data.get(s), 'jsdom-default', b)))})`} | ${xr(cmp.lj[key])} | ${xr(cmp.dj[key])} | ${xr(cmp.lb[key])} | ${xr(cmp.ld[key])} | ${xr(cmp.jl[key])} | ${xr(cmp.wj[key])} |`); }
{
  const slower = Object.keys(cmp.lb).filter((k) => !k.startsWith('apps/') && mid(cmp.lb[k]) < 1).map((k) => `${k} ${x2(mid(cmp.lb[k]))}`);
  log(`\nlearned slower than the best correct jsdom configuration (median below 1), 16 Vitest suites: ${slower.join(', ') || 'none'}.`);
}
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
{
  const gm = (a) => Math.exp(valid(a).reduce((x, y) => x + Math.log(y), 0) / valid(a).length);
  const ks = Object.keys(cmp.lj).filter(sets['tuning + held-out (16)']);
  log(`\nOther summaries over the 16 Vitest suites: geometric mean of the per-suite medians, learned vs jsdom default ${x2(gm(ks.map((k) => mid(cmp.lj[k]))))}, learned vs best correct jsdom ${x2(gm(ks.map((k) => mid(cmp.lb[k]))))}, learned vs drop-in ${x2(gm(ks.map((k) => mid(cmp.ld[k]))))}, drop-in vs jsdom default ${x2(gm(ks.map((k) => mid(cmp.dj[k]))))}, jsdom-learned vs jsdom default ${x2(gm(ks.map((k) => mid(cmp.jl[k]))))}.`);
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
const placementOf = new Map();
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
      placementOf.set(`${k}/${s}/${c}/${r}/${t}`, where);
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

// False passes in files that ran shared, whatever their class: the G2 criterion above (failed in every
// isolated run) cannot see a leak that only raises a pass rate. Per test: the rounds with a false pass
// in a shared file, and pass rates in the job: the learned configuration's timed runs in which the
// file ran shared, and the same DOM's isolated runs (warm-up included).
log('\n### False passes in files that ran shared (any class)\n');
log('A false pass as above whose file ran shared in that timed run. Pass rates over this job: "shared" = timed learned runs in which the test\'s file ran shared; "isolated" = the same DOM\'s isolated runs, warm-up included. One-sided Fisher exact p (shared pass rate higher), as a descriptive check only.\n');
log('| Suite | configuration | test | rounds with a false pass in a shared file | passed when shared | passed when isolated | Fisher p |');
log('| --- | --- | --- | --- | --- | --- | --- |');
const lf = (n) => { let x = 0; for (let i = 2; i <= n; i++) x += Math.log(i); return x; };
const hyper = (a, b, c, d) => Math.exp(lf(a + b) + lf(c + d) + lf(a + c) + lf(b + d) - lf(a) - lf(b) - lf(c) - lf(d) - lf(a + b + c + d));
const fisherGreater = (a, b, c, d) => { let p = 0; const r1 = a + b, c1 = a + c, n = a + b + c + d; for (let x = a; x <= Math.min(r1, c1); x++) p += hyper(x, r1 - x, c1 - x, n - r1 - c1 + x); return p; };
const sharedFP = new Map();
for (const x of g2) if (placementOf.get(`${x.k}/${x.s}/${x.c}/${x.r}/${x.t}`) === 'shared') { const key = `${x.k}\t${x.s}\t${x.c}\t${x.t}`; sharedFP.set(key, [...(sharedFP.get(key) ?? []), x.r]); }
const SHAREDFP = [];
for (const [key, rounds] of sharedFP) {
  const [k, s, c, t] = key.split('\t');
  const J = BL.find((b) => b.k === k).J;
  const iso = c === 'warpdom-learned' ? 'warpdom-default' : 'jsdom-default';
  let sp = 0, sn = 0;
  for (const r of J.data.get(s).keys()) { if (placement(k, J, s, c, r, t) !== 'shared') continue; const L = readMap(path.join(J.pt, r, s, `${c}.json`)); if (!L) continue; sn++; if (L.tests[t]?.s === 'passed') sp++; }
  const isoMaps = fs.readdirSync(J.pt).map((r) => readMap(path.join(J.pt, r, s, `${iso}.json`))).filter(Boolean);
  const ip = isoMaps.filter((m) => m.tests[t]?.s === 'passed').length, inn = isoMaps.length;
  const fp = fisherGreater(sp, sn - sp, ip, inn - ip);
  SHAREDFP.push({ s, c, t, rounds });
  log(`| ${s} | ${c} | ${t.split('::').slice(1).join('::').slice(0, 120)} | ${rounds.join(', ')} | ${sp} of ${sn} | ${ip} of ${inn} | ${fp.toFixed(2)} |`);
}
log(`\n- False passes in shared files: ${SHAREDFP.reduce((a, x) => a + x.rounds.length, 0)} in ${SHAREDFP.length} tests (${[...new Set(SHAREDFP.map((x) => `${x.s} ${x.c}`))].join(', ') || 'none'}).`);

// ---------- learning ----------
log('\n## Learning: modes, stability, re-runs, cost and break-even\n');
log('Source: learning.jsonl of each directory. Learnings: the warm-up\'s (round 0) and one from scratch in each timed round. The timed learned runs use the state of the warm-up learning (as ablation-report.cjs states; the run records confirm it: e.g. ark-ui ran react split in all 5 timed runs while learnings 2-4 chose all isolated); the per-round learnings measure stability and cost. Modes: per learning, in round order (CLI: the projects split, or "all isolated"). Mode agreement: share of learnings choosing the most common mode. Jaccard: mean pairwise similarity of the leaky (isolated) file sets. Timed runs: the mode each timed run used (the mode field of the run record), files re-run by the safety net and new leaky files, summed. Cost: median over learnings of the whole learning time minus its isolated run (seconds - t_iso; = t_sh + t_split where both are recorded), "k of n" learnings with both seconds and t_iso. Break-even: cost / (median isolated run - median learned run) from timing-ci.csv, the isolated run being the same DOM\'s default; the cost includes every split run of the learning (up to 4). Split runs per learning: (seconds - t_iso - t_sh) / t_split, rounded, where t_split is the last split run\'s time (an estimate: earlier split runs may take longer or shorter).\n');
log('| Suite | configuration | method | learnings | modes per learning (round 0-5) | mode agreement | leaky files min-max | Jaccard | timed runs: modes | re-runs, new leaky | cost | gain per run | break-even runs | split runs per learning (estimated) |');
log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
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
    // Split runs per learning, estimated as (seconds - t_iso - t_sh) / t_split (t_split: the last split run).
    const est = L.filter((r) => r.seconds != null && r.t_iso != null && r.t_sh != null && r.t_split > 0).map((r) => Math.max(0, Math.round((r.seconds - r.t_iso - r.t_sh) / r.t_split)));
    LEARN[`${k}/${s}/${c}`] = { modes: L.map((r) => modeName(r.mode)), agree, be, cost, gain, reruns, jac: pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : NaN, sizes };
    log(`| ${k}/${s} | ${c} | ${[...new Set(L.map((r) => r.method))].join(', ')} | ${L.length} | ${L.map((r) => modeName(r.mode)).join('; ')} | ${agree.toFixed(2)} | ${Math.min(...sizes)}-${Math.max(...sizes)} | ${pairs.length ? (pairs.reduce((a, b) => a + b, 0) / pairs.length).toFixed(2) : '—'} | ${[...runModes].map(([m, n]) => `${m} ${n}`).join(', ')} | ${reruns}, ${newl} | ${s1(cost)} (${exact.length} of ${L.length}) | ${s1(gain)} | ${be} | ${est.length ? est.join(', ') : '—'} |`);
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
// The drop-in measured twice with identical DOM code: how much a single job's cross-suite median moves
// compared with the per-suite ratios.
{
  const ch = [], o16 = [], n16 = [];
  for (let i = 0; i < BL.length; i++) {
    const { k, J } = BL[i]; if (k === 'apps') continue; const O = OLDBL[i];
    for (const s of J.data.keys()) { const a = mid(ratios(O.data.get(s), 'jsdom-default', 'warpdom-default')), b = mid(cmp.dj[`${k}/${s}`]); o16.push(a); n16.push(b); ch.push({ s, d: b / a - 1 }); }
  }
  const abs = ch.map((x) => Math.abs(x.d));
  const mn = ch.reduce((a, c) => (c.d < a.d ? c : a)), mx = ch.reduce((a, c) => (c.d > a.d ? c : a));
  log(`\nDrop-in vs jsdom default, the same DOM code in two jobs (16 Vitest suites): cross-suite median ${x2(mid(o16))} at 208ad49, ${x2(mid(n16))} at 5942dc9 (${((mid(n16) / mid(o16) - 1) * 100).toFixed(1)}%); per-suite change of the median ratio: median of absolute changes ${(mid(abs) * 100).toFixed(1)}%, from ${(mn.d * 100).toFixed(1)}% (${mn.s}) to +${(mx.d * 100).toFixed(1)}% (${mx.s}).`);
}
fs.rmSync(tmp, { recursive: true, force: true });
