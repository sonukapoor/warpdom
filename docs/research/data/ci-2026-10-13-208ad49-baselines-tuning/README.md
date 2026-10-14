# Strong baselines and measured isolation, tuning suites (warpdom 208ad49)

- **Run:** GitHub Actions 38426915125 (sonukapoor/dom-api-tracer, workflow timing,
  mode `ablation-isolation`), 11 Vitest tuning suites, one job per suite.
- **Commits:** warpdom 208ad49e83f09da7f4ba8ffb01cbb14958e7a60a (frozen), harness
  dom-api-tracer 843087f5ae8537ee36a00a30f0df763e7d6a7f62; both clean in every
  environment record (`timing-ci-*.env-*.json`).
- **Runners:** GitHub-hosted Linux, 4 cores, 15.6 GiB, Node 22.23.3 in every
  record; CPU model varies by job (AMD EPYC 7763, 9V74, 9V45; Intel Xeon 6973P-C
  (vuetify), Intel Xeon Platinum 8573C (analog): see each env record).
- **What it measures:** per suite, 11 configurations in each round: jsdom-default,
  jsdom-shared (`isolate: false`), jsdom-vm (`vmThreads`), jsdom-sharedclean (no
  isolation plus dom-api-tracer `shared-cleanup.mjs`, which mirrors warpdom's reset
  calls), jsdom-learned (the learned-isolation policy, harness emulation, on jsdom
  without any reset), warpdom-default (drop-in), warpdom-vm, warpdom-sharedfresh
  (all files shared, fresh window per file), warpdom-sharedreset (all files shared,
  reset in place), warpdom-learned (the shipped `warpdom vitest run` where Vitest
  >= 3.2 and one project, method `cli`; otherwise the harness emulation, method
  `harness`: ariakit (3 `--project` arguments), floating-ui (Vitest 3.0.9), solid
  (2.1.9)) and happydom-shared. "Learned" isolation is called *measured isolation*
  in the paper; the data keep "learned".
- **Protocol:** an untimed warm-up of every configuration (round 0; its learning is
  the state the timed learned runs start from), then 5 rounds with the
  configuration order rotated by one position per round (`position` column),
  learning repeated from scratch in every round; 2 workers; 45 min per harness
  run; a 320-minute job budget (no round started that could not finish).
- **Files:** `timing-ci.csv` (all jobs; per-project `timing-ci-<suite>.csv`
  identical rows), `warmup.csv`, `learning.jsonl` (learning and learned-run records,
  `learning.cjs`), `timing-ci-*.notes.txt` (NA reasons, method, budget stops),
  environment records, `pertest.tar.xz` (every run's per-test statuses,
  `pertest/<round>/<suite>/<config>.json`, round 0 = warm-up),
  `harness-logs.tar.xz` (each job's `research-tmp/ablation.log`, the harness's
  summary log; the per-package runner logs are not archived).
- **Derived:** `report.md` = `ablation-report.cjs timing-ci.csv --learning
  learning.jsonl --pertest <extracted pertest>` at 843087f; byte-identical to the
  run's own report job. `g2-candidates.tsv` and `differences-by-kind.txt`:
  `../tools/g2-candidates.cjs`, `../tools/classify-differences.cjs` on the
  extracted per-test archive.

## Caveats

- **Budget stops:** ariakit has **1 timed round** (stopped before round 2: 213 min
  used, rounds take up to 112 min); CopilotKit has **4** (stopped before round 5).
  Their intervals are ranges of 1 and 4 per-round ratios.
- The shipped CLI records `t_sh` as null when a package's split was rejected; the
  report then shows no learning cost for CopilotKit's records without it.
  `../ci-2026-10-13-208ad49-computed.md` gives the cost as the whole learning time
  minus the isolated run for every CLI record.
- floating-ui and solid used the harness emulation (Vitest < 3.2); ariakit too
  (three `--project` arguments).
