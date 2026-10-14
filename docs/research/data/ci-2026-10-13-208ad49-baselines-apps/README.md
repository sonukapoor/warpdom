# Strong baselines and measured isolation, Excalidraw (warpdom 208ad49)

- **Run:** GitHub Actions 38426961764 (sonukapoor/dom-api-tracer, workflow timing,
  mode `ablation-isolation`, corpus `apps.json`): Excalidraw only (the Wire web app
  runs Jest, which always isolates).
- **Commits:** warpdom 208ad49 (frozen), harness dom-api-tracer 843087f; clean.
- **Runner:** 4 cores, 15.6 GiB, Node 22.23.3, AMD EPYC 7763.
- **What it measures, protocol, files, derived reports:** as in
  `../ci-2026-10-13-208ad49-baselines-tuning/README.md`. warpdom-learned is the
  harness emulation (Vitest 3.0.6 < 3.2). `report.md` is identical to the run's
  own report job.

## Caveats

- **Budget stop: 2 timed rounds** (stopped before round 3: 248 min used, rounds
  take up to 85 min). Intervals are ranges of 2 ratios.
- **warpdom-vm produced no results** in the warm-up and both rounds ("run produced
  no results", see the notes file): NA, and its "2556 differing tests" in
  report.md are all tests missing.
- Excalidraw was pinned before measuring, but warpdom was fixed against it before
  this run (paper, Section 6.3): a migration case study, not a held-out result.
