# Drop-in, three DOMs, held-out suites (warpdom 8630317)

- **Run:** GitHub Actions 38427053627 (sonukapoor/dom-api-tracer, workflow timing,
  mode `timing`, corpus `held-out.json`): the 9 held-out suites.
- **Commits:** warpdom 8630317 (frozen), harness dom-api-tracer 843087f; clean.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; CPU per job in the env records
  (AMD EPYC 7763, 9V74, 9V45).
- **What it measures, protocol, files, derived report:** as in
  `../ci-2026-10-13-208ad49-threeway-tuning/README.md` (warm-up + 5 rotated rounds,
  jsdom/warpdom/happy-dom in the default isolation). `report.md` is identical to
  the run's report job.

## Caveats

- **solid-primitives is left out of report.md** ("jsdom rounds 1-5 of 5 broken"):
  its own jsdom-default runs report either 901 or 922 tests (21 tests of
  `packages/pagination/test/index.test.ts` missing in half of them), so every
  round differs from the others' median by 21 > 5 tests. This is the reporter
  misattribution known from earlier runs, not a broken run; RESULTS.md reports
  its raw times (warpdom 1.14x, range 1.11-1.19x; no slow round in this job).
- The held-out projects drove warpdom fixes after their first measurement (paper,
  Threats): this run measures the fixed DOM on them.
