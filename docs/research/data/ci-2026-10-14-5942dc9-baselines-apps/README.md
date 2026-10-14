# Strong baselines and measured isolation, Excalidraw (warpdom 2606b3d)

- **Run:** GitHub Actions 38567598200 (sonukapoor/dom-api-tracer, workflow timing,
  mode `ablation-isolation`, corpus `apps.json`): Excalidraw only (the Wire web app
  runs Jest, which always isolates); environment record written 2026-10-14 12:56 UTC.
- **Commits:** warpdom 2606b3d, harness dom-api-tracer af51077; clean.
- **Runner:** 4 cores, 15.6 GiB, Node 22.23.3, AMD EPYC 7763.
- **What it measures, protocol, files, derived reports:** as in
  `../ci-2026-10-14-5942dc9-baselines-tuning/README.md`. warpdom-learned is the
  harness emulation (Vitest 3.0.6 < 3.2). `report.md` is byte-identical to the run's
  own report job.

## Caveats

- **Budget stop: 3 timed rounds** (stopped before round 4: 293 min used, rounds take
  up to 85 min; at 8630317: 2). Intervals are ranges of 3 ratios.
- **warpdom-vm produced no results** in the warm-up and in rounds 1 and 3 ("run
  produced no results", notes file); it has a time only in round 2, where all 2,556
  tests differ (none reported).
- Excalidraw was pinned before measuring, but warpdom was fixed against it before
  the 8630317 runs: a migration case study, not a held-out result.
