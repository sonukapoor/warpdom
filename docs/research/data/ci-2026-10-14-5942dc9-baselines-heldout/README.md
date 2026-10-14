# Strong baselines and measured isolation, held-out suites (warpdom 2606b3d)

- **Run:** GitHub Actions 38567579662 (sonukapoor/dom-api-tracer, workflow timing,
  mode `ablation-isolation`, corpus `held-out.json`): the 5 held-out Vitest suites
  (melt-ui, naive-ui, solid-primitives, tanstack-query, vueuse); environment records
  written 2026-10-14 12:55-12:56 UTC.
- **Commits:** warpdom 2606b3d, harness dom-api-tracer af51077; clean in every
  environment record (see `../ci-2026-10-14-5942dc9-baselines-tuning/README.md` for
  what differs from 8630317 and 843087f).
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; CPU: AMD EPYC 7763 (melt-ui,
  tanstack-query), Intel Xeon Platinum 8573C (naive-ui, vueuse), AMD EPYC 9V74
  (solid-primitives).
- **What it measures, protocol, files, derived reports:** as in
  `../ci-2026-10-14-5942dc9-baselines-tuning/README.md` (11 configurations, warm-up
  plus 5 rounds). warpdom-learned is the shipped CLI on naive-ui, tanstack-query and
  vueuse and the harness emulation on melt-ui (Vitest 1.2.2) and solid-primitives
  (2.1.9). `report.md` is byte-identical to the run's own report job.

## Caveats

- No budget stop: **5 timed rounds** for every suite.
- solid-primitives: 25 tests in the job's flaky set (the 21 pagination tests that its
  runner reports only in some runs, and 4 filesystem tests); an occasional slow run of
  about 22 s in several configurations (jsdom-default round 1, warpdom-default rounds 1
  and 2, warpdom-learned round 4) gives per-round ratios of 0.17-6.14x.
- naive-ui and vueuse: the CLI now splits (6 of 6 learnings each); at 8630317 it kept
  both isolated because of the error misattribution fixed in 0596184 (pre-consolidation hash; see [COMMIT-MAP.md](../COMMIT-MAP.md)).
