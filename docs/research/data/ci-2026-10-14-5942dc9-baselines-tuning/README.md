# Strong baselines and measured isolation, tuning suites (warpdom 2606b3d)

- **Run:** GitHub Actions 38567560217 (sonukapoor/dom-api-tracer, workflow timing,
  mode `ablation-isolation`), 11 Vitest tuning suites, one job per suite; environment
  records written 2026-10-14 12:55-12:56 UTC.
- **Commits:** warpdom 2606b3d8697338ff0f2c8bc104ebc448d8d46da7, harness dom-api-tracer
  af51077936c37714b039af5e003ff1cd64690572; both clean in every environment record
  (`timing-ci-*.env-*.json`). 2606b3d differs from the frozen commit 8630317 only in
  `src/vitest-fast-{cli,reporter,state}.js` (the error-attribution fix 0596184 (pre-consolidation hash; see [COMMIT-MAP.md](../COMMIT-MAP.md)); `git -C
  ~/Projects/warpdom diff --stat 8630317 2606b3d -- src`): the DOM is the one of every
  8630317 run. af51077 differs from the 8630317 runs' harness 843087f only in one
  `.gitignore` line (`git diff --stat 843087f af51077`): same scripts, same emulation; it
  does not contain a4eafea (one environment name for the configuration and the pinned
  files), so solid's file order is the one of the 8630317 runs.
- **Runners:** GitHub-hosted Linux, 4 cores, 15.6 GiB, Node 22.23.3 in every record.
  CPU per job: AMD EPYC 7763 (ariakit, ark-ui, CopilotKit, emoji-picker-element,
  svelte), AMD EPYC 9V45 (analog, solid), AMD EPYC 9V74 (floating-ui), Intel Xeon
  Platinum 8573C (material-ui, radix-primitives), Intel Xeon 6973P-C (vuetify).
- **What it measures:** the 11 configurations of the 8630317 baselines
  (`../ci-2026-10-13-208ad49-baselines-tuning/README.md`): jsdom-default, jsdom-shared,
  jsdom-sharedclean, jsdom-vm, jsdom-learned (harness emulation on jsdom, no reset),
  warpdom-default (drop-in), warpdom-vm, warpdom-sharedfresh, warpdom-sharedreset,
  warpdom-learned (the shipped `warpdom vitest run`, method `cli`, where Vitest >= 3.2
  and one `--project` set; otherwise the harness emulation, method `harness`: ariakit
  (3 `--project` arguments), floating-ui (Vitest 3.0.9), solid (2.1.9)) and
  happydom-shared. "Learned" isolation is the paper's *measured isolation*.
- **Protocol:** an untimed warm-up of every configuration (round 0; for warpdom-learned
  and jsdom-learned the warm-up is a learning, and the timed learned runs use its state,
  which the command updates itself), then up to 5 rounds with the configuration order
  rotated by one position per round (`position` column); in every timed round a further
  learning from an empty state (stability and cost; its state is not used by the timed
  run); 2 workers; a 320-minute job budget (no round started that could not finish).
- **Files:** `timing-ci.csv` (all jobs; per-suite `timing-ci-<suite>.csv` identical
  rows), `warmup.csv`, `learning.jsonl` (learning and learned-run records), notes
  (`timing-ci-*.notes.txt`: NA reasons, method, budget stops), environment records,
  `pertest.tar.xz` (every run's per-test statuses, `pertest/<round>/<suite>/<config>.json`,
  round 0 = warm-up), `harness-logs.tar.xz` (each job's `research-tmp/ablation.log`; the
  per-package runner logs are not archived).
- **Derived:** `report.md` = `ablation-report.cjs timing-ci.csv --learning learning.jsonl
  --pertest <extracted pertest>` with dom-api-tracer 4fe9e95 (its report scripts equal
  843087f's; `npm test` passed first); byte-identical to the run's own report job.
  `g2-candidates.tsv`, `differences-by-kind.txt`: `../tools/g2-candidates.cjs`,
  `../tools/classify-differences.cjs` on the extracted archive. Everything else:
  `../ci-2026-10-14-5942dc9-computed.md` (`../tools/results-5942dc9.cjs`) and
  `../ci-2026-10-14-5942dc9-RESULTS.md`.

## Caveats

- **Budget stops:** ariakit has **1 timed round** (stopped before round 2: 268 min used,
  rounds take up to 142 min); CopilotKit has **2** (stopped before round 3: 255 min,
  rounds up to 88 min; at 8630317: 4). Their intervals are ranges of 1 and 2 per-round
  ratios. All other suites: 5 rounds.
- CopilotKit's happydom-shared has no time in round 1 (packages/vue produced no
  results); 1 of 2 rounds.
- The harness's emulation (ariakit, floating-ui, solid; jsdom-learned everywhere) does
  not attribute unhandled errors to files; the CLI does since 0596184.
- ark-ui: jsdom-vm differs from jsdom-default only in NumberInput smallStep/largeStep
  and Toast tests, which fail in every jsdom-default run of this job but are flaky on
  jsdom in the 8630317 jobs; report.md therefore does not count jsdom-vm as correct
  here (it did at 8630317). See RESULTS, "Anomalies".
