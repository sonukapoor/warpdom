# Drop-in, three DOMs, tuning suites, three independent runs (warpdom 208ad49)

| Directory | Run |
| --- | --- |
| run1-38426985620 | 38426985620 |
| run2-38427009322 | 38427009322 |
| run3-38427031231 | 38427031231 |

- **Workflow:** sonukapoor/dom-api-tracer timing, mode `timing` (`timing-rounds.sh`),
  the 14 tuning suites (11 Vitest, react-hook-form, react-spectrum and handsontable
  on Jest), one job per suite and run. The three runs were dispatched within 18 s
  of each other (16:00:58-16:01:16 UTC, together with the other experiments of
  this re-run) and ran concurrently, each job on its own runner; jobs started as
  runners became free (environment records stamped 16:01-18:31).
- **Commits:** warpdom 208ad49 (frozen), harness dom-api-tracer 843087f; clean in
  every environment record.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3 everywhere; CPU model per job in the
  env records (AMD EPYC 7763, 9V74, 9V45, Intel Xeon Platinum 8370C and 8573C).
- **What it measures:** jsdom-default, warpdom-default and happy-dom-default, each
  in the runner's default isolation (drop-in), per-package runner times, per-test
  statuses.
- **Protocol:** an untimed warm-up of each configuration (round 0; for Jest suites
  the first run after install, so it includes a cold transform cache), then 5
  rounds with the configuration order rotated by one position per round; 2 workers;
  45 min per package run.
- **Files per run:** `timing-ci.csv` (all suites), `warmup.csv`, `packages.csv`
  (per-package runner seconds, warm-up included), per-suite CSVs,
  `timing-ci-<suite>.flaky.json` (the job's flaky set: tests whose status changes
  between its jsdom-default runs), notes, environment records, `pertest.tar.xz`.
- **Derived:** `report.md` per run = `timing-report.cjs timing-ci.csv --pertest
  <extracted> --packages packages.csv` at 843087f, byte-identical to each run's
  report job. Between-run numbers: `../ci-2026-10-13-208ad49-computed.md`.

## Caveats

- handsontable's core, react-wrapper and vue3 packages resolve jsdom 16.7.0: under
  the version rule it is outside the cross-suite medians and reported per package.
- handsontable on happy-dom: no time in any timed round of any run. Runs 1 and 2:
  the warm-up had no time, so happy-dom was not run in the timed rounds (notes);
  run 3: the warm-up finished (306.8 s, 186 tests differing) but the core package
  hit the runner timeout (`spawnSync ... jest ETIMEDOUT`) in every timed round.
- No broken jsdom round in any suite of the three runs.
