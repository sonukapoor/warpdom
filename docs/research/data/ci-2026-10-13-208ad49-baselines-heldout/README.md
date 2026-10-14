# Strong baselines and measured isolation, held-out suites (warpdom 208ad49)

- **Run:** GitHub Actions 38426939259 (sonukapoor/dom-api-tracer, workflow timing,
  mode `ablation-isolation`, corpus `held-out.json`): the 5 held-out Vitest suites
  (melt-ui, naive-ui, solid-primitives, tanstack-query, vueuse).
- **Commits:** warpdom 208ad49 (frozen), harness dom-api-tracer 843087f; clean in
  every environment record.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; CPU: AMD EPYC 9V45 (melt-ui), Intel
  Xeon Platinum 8370C (naive-ui), AMD EPYC 9V74 (solid-primitives), AMD EPYC 7763
  (tanstack-query, vueuse).
- **What it measures, protocol, files, derived reports:** as in
  `../ci-2026-10-13-208ad49-baselines-tuning/README.md` (11 configurations,
  warm-up + 5 rotated rounds, learning every round). `report.md` is identical to
  the run's own report job.
- **Method of warpdom-learned:** `cli` (the shipped `warpdom vitest run`) for
  naive-ui, tanstack-query, vueuse; harness emulation for melt-ui (Vitest 1.2.2)
  and solid-primitives (Vitest 2.1.9).

## Caveats

- naive-ui and vueuse: the shipped CLI kept full isolation in all 6 learnings
  ("the split's results differ from the isolated run's in 1-3 more file(s)"), so
  warpdom-learned equals the drop-in there, although warpdom-sharedreset kept
  every result on vueuse and differed in 5-9 tests on naive-ui. The archived state
  does not name the file; the cause is not diagnosed.
- solid-primitives: 21 tests of `packages/pagination/test/index.test.ts` are
  reported in some runs and missing in others on every DOM (also between
  jsdom-default runs), so they are in the flaky set; its 4 filesystem timer tests
  fail when the project's own fake-timer leak reaches them (see RESULTS.md).
- tanstack-query: the 493 type tests that the shipped command ran in the earlier
  run (77bec904) do not appear here (warpdom-learned differs from jsdom in 1 test,
  the ownerNode deviation).
