# Between-run variance of drop-in timing (GitHub Actions)

Three independent runs of the same workflow (mode timing, three-way: jsdom,
warpdom, happy-dom in the runners' default isolation), warpdom 1ccb7048,
dom-api-tracer aea4a5c, 14 tuning suites, warm-up + 5 rounds.

| Directory | Run | Notes |
| --- | --- | --- |
| run1-38302422612 | 38302422612 | handsontable: 4 complete rounds; happy-dom NA every round (its runs time out); the job hit the 6 h limit, the CSV was uploaded |
| run2-38302435751 | 38302435751 | handsontable as in run 1 (checked 2026-10-13: the archived CSV equals the run's artifact; 4 complete rounds, round 5 has only warpdom) |
| run3-38302448174 | 38302448174 | handsontable as in run 1 (4 complete rounds; the job was cancelled at the 6 h limit and its CSV and per-test files were uploaded; added 2026-10-13 from the run's `timing-handsontable` artifact). timing-ci.csv and warmup.csv here are the 14 projects' CSVs concatenated |

Recomputed with the current timing-report.cjs (true median, most
differing tests in any round): `report.md` per run; `variance-summary.md`
(tools/variance-across-runs.cjs): per-suite speedup and jsdom time in each
run and their spread. `pertest.tar.xz`: per-test statuses of every run.
