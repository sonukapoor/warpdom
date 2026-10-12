// Comparing test results and timings, for `warpdom compare`. Pure functions
// over the tests of each run (Map(key -> { file, name, status, message })).

const MISSING = 'missing';

// regression: passes on the baseline, fails on warpdom (sets exit code 1).
// fixed: fails on the baseline, passes on warpdom (often a test written
// against a jsdom bug). other: skipped, todo or missing on one side. A file
// that fails to load on one side only is a regression or a fix too.
export function classify(baseline, warpdom, isFile = false) {
  if (warpdom === 'failed' && (baseline === 'passed' || (isFile && baseline === MISSING))) return 'regression';
  if (baseline === 'failed' && (warpdom === 'passed' || (isFile && warpdom === MISSING))) return 'fixed';
  return 'other';
}

const distinct = (values) => [...new Set(values)];

// baselineRuns, warpdomRuns: the tests of every run per side (warm-up
// included). A test whose status varies between the baseline's runs is
// flaky on the baseline itself: listed, not counted. One that varies only
// between warpdom's runs is listed separately (it may be warpdom's).
// Tests in skipFiles (files that pin their environment with a comment)
// ran on the baseline both times and are not compared; those whose status
// changed anyway are listed in notComparedChanged.
export function compareRuns(baselineRuns, warpdomRuns, { skipFiles = new Set() } = {}) {
  const keys = new Set();
  for (const run of [...baselineRuns, ...warpdomRuns]) for (const key of run.keys()) keys.add(key);
  const out = { compared: 0, same: 0, notCompared: 0, notComparedChanged: [], flakyBaseline: [], flakyWarpdom: [], differences: [] };
  for (const key of keys) {
    const info = [...baselineRuns, ...warpdomRuns].map((r) => r.get(key)).find(Boolean);
    const isFile = info.name === '(file)';
    const bs = baselineRuns.map((r) => r.get(key)?.status ?? MISSING);
    const ws = warpdomRuns.map((r) => r.get(key)?.status ?? MISSING);
    if (skipFiles.has(info.file)) {
      if (!isFile) out.notCompared++;
      // Both runs used the baseline here; a change is the test's own (or
      // leaked state from other files), worth listing but not counting.
      if (distinct([...bs, ...ws]).length > 1) out.notComparedChanged.push({ key, file: info.file, name: info.name, baseline: bs, warpdom: ws });
      continue;
    }
    if (!isFile) out.compared++;
    if (distinct(bs).length > 1) { out.flakyBaseline.push({ key, file: info.file, name: info.name, baseline: bs, warpdom: ws }); continue; }
    if (distinct(ws).length > 1) { out.flakyWarpdom.push({ key, file: info.file, name: info.name, baseline: bs, warpdom: ws }); continue; }
    const [b] = bs, [w] = ws;
    if (b === w) { if (!isFile) out.same++; continue; }
    const side = w === 'failed' ? warpdomRuns : baselineRuns;
    const message = side.map((r) => r.get(key)?.message).find(Boolean) ?? '';
    out.differences.push({ key, file: info.file, name: info.name, baseline: b, warpdom: w, class: classify(b, w, isFile), message });
  }
  out.regressions = out.differences.filter((d) => d.class === 'regression').length;
  out.fixed = out.differences.filter((d) => d.class === 'fixed').length;
  out.other = out.differences.filter((d) => d.class === 'other').length;
  return out;
}

// Differences grouped by status change and first error line (numbers
// folded to N), largest group first.
export function groupDifferences(differences) {
  const groups = new Map();
  for (const d of differences) {
    const message = d.message.slice(0, 150);
    const id = `${d.baseline} -> ${d.warpdom} | ${message.replace(/\d+/g, 'N')}`;
    if (!groups.has(id)) groups.set(id, { class: d.class, change: `${d.baseline} -> ${d.warpdom}`, message, tests: [] });
    groups.get(id).tests.push({ file: d.file, name: d.name });
  }
  const order = { regression: 0, fixed: 1, other: 2 };
  return [...groups.values()].sort((a, b) => order[a.class] - order[b.class] || b.tests.length - a.tests.length);
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// rounds: [{ baselineMs, warpdomMs }] (timed rounds only). The speedup is
// the ratio of the medians; the spread is the range of per-round ratios,
// noisy when wider than 10% of the speedup.
export function timingSummary(rounds) {
  const ratios = rounds.map((r) => r.baselineMs / r.warpdomMs).filter(Number.isFinite);
  const baselineMs = median(rounds.map((r) => r.baselineMs));
  const warpdomMs = median(rounds.map((r) => r.warpdomMs));
  const speedup = baselineMs && warpdomMs ? baselineMs / warpdomMs : null;
  const spread = ratios.length ? { min: Math.min(...ratios), max: Math.max(...ratios) } : null;
  return {
    rounds: rounds.length, baselineMs, warpdomMs, speedup, ratios, spread,
    indicative: rounds.length < 2,
    noisy: Boolean(spread && speedup && rounds.length > 1 && (spread.max - spread.min) / speedup > 0.10),
  };
}

// The order of the two runs in each pair: baseline first, then alternating,
// so drift (thermal throttling, background load) hits both sides. The
// warm-up pair (index 0 when there is one) runs baseline first.
export function pairOrder(index) {
  return index % 2 === 0 ? ['baseline', 'warpdom'] : ['warpdom', 'baseline'];
}

// 0: no test changes from pass to fail; 1: some do; 2: the comparison could
// not run.
export function exitCode({ error = null, regressions = 0 } = {}) {
  if (error) return 2;
  return regressions > 0 ? 1 : 0;
}
