# Strong baselines and the ablation of learned isolation (GitHub Actions)

| Directory | Run | Suites | warpdom | dom-api-tracer | Rounds |
| --- | --- | --- | --- | --- | --- |
| tuning-38298849766 | 38298849766 ("Run A") | 11 Vitest tuning suites | 77bec904 | aea4a5c | warm-up + 5 (ariakit 3: the job's time budget stopped it before round 4) |
| held-out-38298853051 | 38298853051 ("Run B") | 5 held-out Vitest suites | 77bec904 | aea4a5c | warm-up + 5 |
| rerun-solid-primitives-38336504666 | 38336504666 | solid-primitives | 77bec904 | ce2fbc6 (fixed keys) | warm-up + 5 |
| rerun-naive-ui-38336504666 | 38336504666 | naive-ui | 77bec904 | ce2fbc6 (fixed keys) | warm-up + 5 |

Mode `ablation-isolation` (dom-api-tracer scripts/research/ablation-isolation.sh):
per round, jsdom default / `isolate: false` / `vmThreads`, warpdom default /
`vmThreads` / shared with a fresh window / shared with the reset / learned,
and happy-dom without isolation, order rotated per round; learning repeated
from scratch every round (`learning.jsonl`); false passes and fails against
the same DOM's isolated run. warpdom-learned is the shipped `warpdom vitest
run` (method cli) where it runs, else the harness's emulation (method
harness: ariakit, three `--project` arguments; floating-ui, solid, melt-ui,
solid-primitives, Vitest < 3.2).

Files: `timing-ci.csv` (all jobs), per-project CSVs, warm-ups, learning
records, notes, environment records; `pertest.tar.xz` (every run's per-test
statuses, `pertest/<round>/<project>/<config>.json`, round 0 = warm-up).

Recomputed 2026-10-12 with the current scripts (dom-api-tracer ce2fbc6):
`report.md` (ablation-report.cjs with `--learning` and `--pertest`),
`differences-by-kind.txt` (tools/classify-differences.cjs: per round,
tests differing from jsdom-default split into status changes of tests
present in both runs, tests present only in the configuration's run, and
tests present only in jsdom's; false passes against warpdom-default split
the same way), `g2-candidates.tsv` (tools/g2-candidates.cjs).

Caveats:
- Harness aea4a5c built per-test keys with the CI root bug (fixed in
  3277761): naive-ui's and solid-primitives' counts in Run B are
  undercounts. Both were re-run with the fix in run 38336504666 (the
  rerun-* directories, archived 2026-10-13; their report.md,
  differences-by-kind.txt and g2-candidates.tsv computed as above, and
  naive-ui's report.md is identical to the run's own report job). With
  fixed keys naive-ui's jsdom-shared keeps every result (0 differing
  tests in every round, 62.5 s against 333.5 s for jsdom default), so
  its best correct jsdom configuration is jsdom-shared and warpdom-learned
  (139.5 s) is 0.44x as fast as it (95% interval 0.43-0.93x);
  warpdom-learned differs from jsdom in 0 tests in every round; no G2
  candidate; leaky sets 0-43 files, Jaccard 0.15, split in all 6
  learnings, 78 files re-run and 73 newly leaky over the timed rounds.
  Use the rerun directories, not Run B, for these two projects.
- tanstack-query: the shipped command also ran 493 type tests
  (`*.test-d.ts[x]`) that the project's default run does not run; they are
  the 493 "differing" tests and 2,465 "false passes" of warpdom-learned in
  report.md (present only in the learned run, all passed). Among tests
  both runs ran, learned differs from jsdom in 1 (the ownerNode deviation),
  as warpdom-default does.
- floating-ui: under warpdom with `isolate: false` (fresh or reset) and with
  `vmThreads`, packages/react stops reporting after 127 of 292 tests and
  ends after about 604 s (research-tmp/ablation.log in the run's artifact):
  165 tests have no result.
