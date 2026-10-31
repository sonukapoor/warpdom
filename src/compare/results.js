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

// Tests whose name changes from run to run (a timestamp or random value in
// the title, like it.each over new Date()) have a new key in every run.
// They are matched by position: the keys that are not in every run are
// paired in report order, per file and describe path, then per file for
// those whose describe path is not in every run (it varies too). Tests in
// every run are boundaries: only the keys between the same two of them are
// paired, and only where every run has the same number there, so a test
// missing on one side is not paired with another. A key found in several
// runs must be at the same place in each, or its segment is not paired. A
// key in all the runs of one side and none of the other (with two runs or
// more there) is that side's own test, not a varying name. Returns the
// runs (baseline's, then warpdom's) with each pair under one key, and that
// key's name in each run (Map(key -> names)).
export function matchVaryingNames(baselineRuns, warpdomRuns) {
  const runs = [...baselineRuns, ...warpdomRuns];
  const inAll = (list, key) => list.every((run) => run.has(key));
  const inNone = (list, key) => !list.some((run) => run.has(key));
  const sideOnly = (key) =>
    (baselineRuns.length > 1 && inAll(baselineRuns, key) && inNone(warpdomRuns, key)) ||
    (warpdomRuns.length > 1 && inAll(warpdomRuns, key) && inNone(baselineRuns, key));
  const renamed = runs.map(() => new Map());
  const names = new Map();
  const suiteOf = (t) => JSON.stringify([t.project ?? '', t.file, t.suite ?? '']);
  // Describe paths in every run: their tests are matched per describe path
  // only (a file-wide pairing could pair tests across describe blocks).
  const suites = runs.map((run) => new Set([...run.values()].map(suiteOf)));
  const stableSuite = (t) => suites.every((set) => set.has(suiteOf(t)));
  const pair = (groupOf, filter = () => true) => {
    // segment (group and the boundaries before and after) -> keys per run
    const segments = new Map();
    // key -> where it is: [segment, column] for each run it is in
    const places = new Map();
    runs.forEach((run, i) => {
      const open = new Map(); // group -> { before, keys } since the last boundary
      const close = (group, after) => {
        const o = open.get(group);
        if (!o?.keys.length) return;
        const segment = JSON.stringify([group, o.before, after]);
        const perRun = segments.get(segment) ?? runs.map(() => []);
        segments.set(segment, perRun);
        for (const key of o.keys) {
          if (!places.has(key)) places.set(key, []);
          places.get(key).push(JSON.stringify([segment, perRun[i].length]));
          perRun[i].push(key);
        }
      };
      for (const [key, t] of run) {
        if (t.name === '(file)') continue;
        const group = groupOf(t);
        // In every run, or already matched in every run: a boundary.
        const boundary = renamed[i].get(key) ?? (inAll(runs, key) ? key : null);
        if (boundary) {
          close(group, boundary);
          open.set(group, { before: boundary, keys: [] });
          continue;
        }
        if (sideOnly(key) || !filter(t)) continue;
        if (!open.has(group)) open.set(group, { before: null, keys: [] });
        open.get(group).keys.push(key);
      }
      for (const group of open.keys()) close(group, null);
    });
    for (const perRun of segments.values()) {
      const n = perRun[0].length;
      if (!perRun.every((keys) => keys.length === n)) continue;
      if (!perRun.every((keys) => keys.every((key) => new Set(places.get(key)).size === 1))) continue;
      for (let p = 0; p < n; p++) {
        const key = `${perRun[0][p]} (name varies)`;
        if (runs.some((run) => run.has(key))) continue;
        perRun.forEach((keys, i) => renamed[i].set(keys[p], key));
        names.set(
          key,
          perRun.map((keys, i) => runs[i].get(keys[p]).name),
        );
      }
    }
  };
  pair(suiteOf);
  pair(
    (t) => JSON.stringify([t.project ?? '', t.file]),
    (t) => !stableSuite(t),
  );
  if (!names.size) return { runs, names };
  const remapped = runs.map((run, i) => new Map([...run].map(([key, t]) => [renamed[i].get(key) ?? key, t])));
  return { runs: remapped, names };
}

// baselineRuns, warpdomRuns: the tests of every run per side (warm-up
// included). A test whose status varies between the baseline's runs is
// flaky on the baseline itself: listed, not counted. One that varies only
// between warpdom's runs is listed separately (it may be warpdom's).
// Tests in skipFiles (files that pin their environment with a comment and
// were not switched) and in skipProjects (projects on node or in browser
// mode, except files in keepFiles, whose comment was switched, and
// 'project::file' entries of keepTests, files environmentMatchGlobs put on a
// DOM and the wrappers switched) ran the same
// way in both runs and are not compared; those whose status changed anyway
// are listed in notComparedChanged. Tests whose name varies between runs
// are matched by position (matchVaryingNames), compared like the others
// and also listed in nameVaries with their names. byProject: the counts
// per project name ('' for a single unnamed project).
export function compareRuns(
  baselineRuns,
  warpdomRuns,
  { skipFiles = new Set(), skipProjects = new Set(), keepFiles = new Set(), keepTests = new Set() } = {},
) {
  const matched = matchVaryingNames(baselineRuns, warpdomRuns);
  const names = matched.names;
  baselineRuns = matched.runs.slice(0, baselineRuns.length);
  warpdomRuns = matched.runs.slice(baselineRuns.length);
  const keys = new Set();
  for (const run of matched.runs) for (const key of run.keys()) keys.add(key);
  const out = {
    compared: 0,
    same: 0,
    notCompared: 0,
    notComparedFiles: 0,
    notComparedChanged: [],
    flakyBaseline: [],
    flakyWarpdom: [],
    nameVaries: [],
    differences: [],
    byProject: {},
  };
  const counts = (project) =>
    (out.byProject[project] ??= { compared: 0, same: 0, regressions: 0, fixed: 0, other: 0, flaky: 0, notCompared: 0 });
  for (const key of keys) {
    const info = [...baselineRuns, ...warpdomRuns].map((r) => r.get(key)).find(Boolean);
    const isFile = info.name === '(file)';
    const project = info.project ?? '';
    const entry = { key, project, file: info.file, name: info.name };
    const bs = baselineRuns.map((r) => r.get(key)?.status ?? MISSING);
    const ws = warpdomRuns.map((r) => r.get(key)?.status ?? MISSING);
    const pc = counts(project);
    const pinnedFile = skipFiles.has(info.file);
    const kept = keepFiles.has(info.file) || keepTests.has(`${project}::${info.file}`);
    if (pinnedFile || (skipProjects.has(project) && !kept)) {
      if (!isFile) {
        out.notCompared++;
        pc.notCompared++;
        if (pinnedFile) out.notComparedFiles++;
      }
      // Both runs used the same environment here; a change is the test's own
      // (or leaked state from other files), worth listing but not counting.
      if (distinct([...bs, ...ws]).length > 1) out.notComparedChanged.push({ ...entry, baseline: bs, warpdom: ws });
      continue;
    }
    if (!isFile) {
      out.compared++;
      pc.compared++;
    }
    if (names.has(key)) out.nameVaries.push({ ...entry, names: names.get(key), baseline: bs, warpdom: ws });
    if (distinct(bs).length > 1) {
      out.flakyBaseline.push({ ...entry, baseline: bs, warpdom: ws });
      pc.flaky++;
      continue;
    }
    if (distinct(ws).length > 1) {
      out.flakyWarpdom.push({ ...entry, baseline: bs, warpdom: ws });
      pc.flaky++;
      continue;
    }
    const [b] = bs,
      [w] = ws;
    if (b === w) {
      if (!isFile) {
        out.same++;
        pc.same++;
      }
      continue;
    }
    const side = w === 'failed' ? warpdomRuns : baselineRuns;
    const message = side.map((r) => r.get(key)?.message).find(Boolean) ?? '';
    const cls = classify(b, w, isFile);
    pc[cls === 'regression' ? 'regressions' : cls]++;
    out.differences.push({ ...entry, baseline: b, warpdom: w, class: cls, message });
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
    if (!groups.has(id))
      groups.set(id, { class: d.class, change: `${d.baseline} -> ${d.warpdom}`, message, tests: [] });
    groups.get(id).tests.push({ project: d.project ?? '', file: d.file, name: d.name });
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
    rounds: rounds.length,
    baselineMs,
    warpdomMs,
    speedup,
    ratios,
    spread,
    indicative: rounds.length < 2,
    noisy: Boolean(spread && speedup && rounds.length > 1 && (spread.max - spread.min) / speedup > 0.1),
  };
}

// The order of the runs in each pair (or group, with more environments):
// baseline first, then rotating, so drift (thermal throttling, background
// load) hits every side. Two sides alternate (B W, W B, ...); three rotate
// (B W H, W H B, H B W, ...). The warm-up group (index 0 when there is one)
// runs baseline first.
const TWO_SIDES = ['baseline', 'warpdom'];
export function pairOrder(index, sides = TWO_SIDES) {
  const list = Array.isArray(sides) ? sides : TWO_SIDES; // also as a map callback
  const k = index % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

// 0: no test changes from pass to fail; 1: some do; 2: the comparison could
// not run.
export function exitCode({ error = null, regressions = 0 } = {}) {
  if (error) return 2;
  return regressions > 0 ? 1 : 0;
}
