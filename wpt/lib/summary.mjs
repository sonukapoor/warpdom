// Scoring and summary tables for results files.
//
// Scoring: every reported subtest counts once (PASS passes; FAIL, TIMEOUT,
// NOTRUN and PRECONDITION_FAILED do not). A file that reports no subtests
// (it errored before defining any, or is a single-test file) counts as one
// subtest that passes only if the harness status is OK. Files are counted
// as "OK" when the harness status is OK, and "all pass" when OK with every
// subtest passing. "Score" normalizes per file, as wpt.fyi does: each file
// contributes passed/subtests (0..1), so a file with 1,500 generated
// subtests weighs as much as a file with 3; score = sum / files.
//
// Engines can report different subtests for one file (a harness error stops
// a file early, so later subtests are never defined). Side-by-side tables
// therefore score every engine against the union of the subtest names any
// engine reported for that file; a subtest an engine did not report counts
// as not passed.

export function scoreFile(r) {
  const subtests = r.subtests ?? [];
  if (!subtests.length) return { subtests: 1, passed: r.harness === 'OK' ? 1 : 0 };
  return { subtests: subtests.length, passed: subtests.filter((s) => s.status === 'PASS').length };
}

const dirOf = (file, depth) => {
  const parts = file.split('/').slice(0, -1);
  return (depth ? parts.slice(0, depth) : parts).join('/') + '/';
};

export function summarize(run, { depth } = {}) {
  const groups = new Map();
  const empty = () => ({ files: 0, ok: 0, allPass: 0, subtests: 0, passed: 0, skipped: 0, score: 0 });
  const total = empty();
  const group = (dir) => groups.get(dir) ?? groups.set(dir, empty()).get(dir);
  for (const r of Object.values(run.results)) {
    const g = group(dirOf(r.file, depth));
    const s = scoreFile(r);
    for (const t of [g, total]) {
      t.files++;
      t.score += s.passed / s.subtests;
      if (r.harness === 'OK') t.ok++;
      if (r.harness === 'OK' && s.passed === s.subtests) t.allPass++;
      t.subtests += s.subtests;
      t.passed += s.passed;
    }
  }
  for (const id of Object.keys(run.skipped ?? {})) {
    const file = id.replace(/\?.*$/, '');
    group(dirOf(file, depth)).skipped++;
    total.skipped++;
  }
  return { groups: new Map([...groups].sort(([a], [b]) => (a < b ? -1 : 1))), total };
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');

export function markdownTable(run, options) {
  const { groups, total } = summarize(run, options);
  const lines = [
    `| Directory | Files | Harness OK | All pass | Subtests | Passed | Pass rate | Score | Skipped |`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|`,
  ];
  const row = (name, g) =>
    `| ${name} | ${g.files} | ${g.ok} | ${g.allPass} | ${g.subtests} | ${g.passed} | ${pct(g.passed, g.subtests)} | ${pct(g.score, g.files)} | ${g.skipped} |`;
  for (const [dir, g] of groups) lines.push(row(dir, g));
  lines.push(row('**Total**', total));
  return lines.join('\n');
}

// Side by side: the same directories for several runs (engines), each
// scored against the union of subtests reported for a file by any run,
// over the files every run ran (skipped in one run means left out).
export function compareTable(runs, { depth } = {}) {
  const ids = Object.keys(runs[0].results).filter((id) => runs.every((r) => r.results[id]));
  const empty = () => runs.map(() => ({ files: 0, subtests: 0, passed: 0, score: 0 }));
  const groups = new Map();
  const total = empty();
  for (const id of ids) {
    const records = runs.map((r) => r.results[id]);
    const names = new Set(records.flatMap((r) => (r.subtests ?? []).map((s) => s.name)));
    const dir = dirOf(records[0].file, depth);
    const g = groups.get(dir) ?? groups.set(dir, empty()).get(dir);
    records.forEach((r, i) => {
      let n, passed;
      if (!names.size) {
        n = 1;
        passed = r.harness === 'OK' ? 1 : 0;
      } else {
        const status = new Map((r.subtests ?? []).map((s) => [s.name, s.status]));
        n = names.size;
        passed = [...names].filter((name) => status.get(name) === 'PASS').length;
      }
      for (const t of [g[i], total[i]]) {
        t.files++;
        t.subtests += n;
        t.passed += passed;
        t.score += passed / n;
      }
    });
  }
  const names = runs.map((r) => `${r.meta.engine}`);
  const head = `| Directory | Files | Subtests | ${names.map((n) => `${n} passed | ${n} rate | ${n} score`).join(' | ')} |`;
  const sep = `|---|---:|---:|${names.map(() => '---:|---:|---:').join('|')}|`;
  const cells = (gs) =>
    gs.map((g) => `${g.passed} | ${pct(g.passed, g.subtests)} | ${pct(g.score, g.files)}`).join(' | ');
  const lines = [head, sep];
  for (const [dir, gs] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1)))
    lines.push(`| ${dir} | ${gs[0].files} | ${gs[0].subtests} | ${cells(gs)} |`);
  lines.push(`| **Total** | ${total[0].files} | ${total[0].subtests} | ${cells(total)} |`);
  return lines.join('\n');
}

// Subtests that pass in run a and not in run b (by test id and name).
export function regressions(a, b) {
  const out = [];
  for (const [id, ra] of Object.entries(a.results)) {
    const rb = b.results[id];
    if (!rb) continue;
    const statusB = new Map((rb.subtests ?? []).map((s) => [s.name, s.status]));
    for (const s of ra.subtests ?? []) {
      if (s.status === 'PASS' && statusB.get(s.name) !== 'PASS')
        out.push({ id, name: s.name, other: statusB.get(s.name) ?? 'MISSING' });
    }
  }
  return out;
}
