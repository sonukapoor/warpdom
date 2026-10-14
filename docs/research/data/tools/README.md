# Helper scripts for the 2026-10-12 recomputation

**Pinned harness.** The `.cjs` tools load `scripts/research/statuses.cjs` (keys and comparisons)
from the dom-api-tracer checkout named by `DOM_API_TRACER` (default `~/Projects/dom-api-tracer`).
Run them against a checkout pinned at harness commit **843087f**, the harness of every 208ad49 run
(af51077, the harness of the 5942dc9 runs, differs from it by one `.gitignore` line), so that a later
change to `statuses.cjs` cannot change the derived tables:

```
git -C ~/Projects/dom-api-tracer worktree add --detach /tmp/dom-api-tracer-843087f 843087f
DOM_API_TRACER=/tmp/dom-api-tracer-843087f node results-208ad49.cjs .. > ../ci-2026-10-13-208ad49-computed.md
DOM_API_TRACER=/tmp/dom-api-tracer-843087f node results-5942dc9.cjs .. > ../ci-2026-10-14-5942dc9-computed.md
```

Checked 2026-10-14: both outputs are byte-identical to the archived computed files with the pinned
checkout (`statuses.cjs` last changed in 11e24a5, before 843087f, and is unchanged up to 4fe9e95).

Small scripts used with the archived data, next to the dom-api-tracer
scripts (ablation-report.cjs, timing-report.cjs, versions-report.cjs,
statuses.cjs at ce2fbc6) they complement:

- `classify-differences.cjs <pertest dir>`: tests differing from
  jsdom-default, by kind (status change / only in the run / only in jsdom).
- `g2-candidates.cjs <pertest dir>`: tests learned isolation reported
  passed that warpdom's isolated run of the same round did not pass.
- `a4-differences.cjs <pertest dir>`: latest profile vs own profile vs jsdom.
- `paired-ratio.sh <csv> <A> <B> [exclude-regex]`: time(A)/time(B) per
  suite and across suites with timing-report.cjs's own bootstrap (A is
  relabelled jsdom-default, B warpdom-default).
- `variance-across-runs.cjs <csv>...`: per-suite speedup and jsdom time in
  each run and their spread.

Added for the re-run at warpdom 208ad49 (2026-10-13; dom-api-tracer scripts at
843087f):

- `correctness-inventory.cjs <label>=<pertest dir>... [--config <c>]`: every
  test whose status differs between `<c>` (default warpdom-default) and the
  same round's jsdom-default, per job: rounds differing, status pairs, and
  whether it is in the job's flaky set. Output:
  `../ci-2026-10-13-208ad49-correctness-*.tsv`.
- `results-208ad49.cjs [data dir]`: every derived number of
  `../ci-2026-10-13-208ad49-RESULTS.md` that the report scripts do not print,
  from the archived files only (extracts the .tar.xz archives itself); output
  `../ci-2026-10-13-208ad49-computed.md`. Deterministic (fixed bootstrap seed).

Added for the strong baselines re-run at warpdom 5942dc9 (2026-10-14; dom-api-tracer report
scripts as at 843087f, run from 4fe9e95):

- `results-5942dc9.cjs [data dir]`: the measured-isolation part of `results-208ad49.cjs` (same
  helpers, conventions and bootstrap) for `../ci-2026-10-14-5942dc9-baselines-*`. Since the third
  internal review (2026-10-14) it chooses the best correct jsdom configuration itself, by a symmetric
  rule: tests in the job's flaky set or nondeterministic in isolated runs (jsdom-default, jsdom-vm,
  warpdom-default, pooled over all 15 per-test archives at the same DOM code) are excluded for jsdom
  alternatives as they are for warpdom, and the best is chosen by the median of per-round ratios, the
  statistic the speedups use (report.md's own section uses the job's flaky set and median time). It
  also prints false passes in shared files of any class with pass rates, the drop-in's cross-suite
  medians in the 208ad49 and 5942dc9 jobs, and the estimated split runs per calibration. Extended by every
  configuration per suite, the A1 rows (shared-fresh, shared+reset against jsdom and against the
  drop-in), per-learning modes, timed-run modes and safety-net re-runs, false passes per test with
  a class and the file's placement in that run, P3 against two A/A thresholds, the CLI's recorded
  reasons, and a comparison with the 208ad49 baselines. Output
  `../ci-2026-10-14-5942dc9-computed.md`. Deterministic (fixed bootstrap seed).
- `correctness-inventory.cjs` run on the three 5942dc9 archives for warpdom-learned, jsdom-learned
  and warpdom-default: `../ci-2026-10-14-5942dc9-correctness-*.tsv`.
