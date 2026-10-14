# Web application suites (GitHub Actions)

dom-api-tracer corpus/apps.json, pinned in corpus/apps-pins.json
(2026-10-12T20:29:54Z, before any measurement): Excalidraw (Vitest 3.0.6,
jsdom 22.1) and wire-webapp (Jest 30, jsdom 26.1.0 with cssstyle 4.6.0).
Three-way timing (jsdom, warpdom, happy-dom), warm-up + 5 rounds.

| Directory | Run | warpdom | dom-api-tracer |
| --- | --- | --- | --- |
| ci-2026-10-12-apps-before | 38304848528 | 77bec904 (the paper's commit, before any fix for these apps) | 33d8853 |
| ci-2026-10-13-apps-after | 38321384572 | 627b7ee (after 5c70d4e and 627b7ee, fixes driven by these apps) | 33d8853 |
| ci-2026-10-12-apps-learned | 38304856904 | 77bec904 | 33d8853 (mode ablation-isolation, Excalidraw only) |

`report.md` in each recomputed with the current timing-report.cjs.
Because the fixes were made against these suites, the "after" run is not a
held-out measurement.

`ci-2026-10-12-apps-learned` (run 38304856904): learned isolation and the
strong baselines on Excalidraw, the mode of
`../timing/ci-2026-10-12-strong-baselines` (same configurations, learning
repeated from scratch every round). Warm-up + 4 rounds: the job's time
budget stopped it before round 5 (`timing-ci-excalidraw.notes.txt`).
Excalidraw has Vitest 3.0.6, so warpdom-learned is the harness's emulation
of `warpdom vitest run` (method harness), not the shipped command.
`report.md` (ablation-report.cjs at dom-api-tracer ce2fbc6 with
`--learning` and `--pertest`; identical to the run's own report),
`differences-by-kind.txt` and `g2-candidates.tsv` (tools/, empty: no
candidate), `ablation.log` (the job's log of runs), `pertest.tar.xz`.
Summary: every learning (5) chose the isolated mode with the same 139
leaky files; with files shared, 141 of 143 test files fail on jsdom and
warpdom alike (2,341 of 2,556 tests have no result); warpdom-learned
213.6 s against jsdom default 263.4 s (1.23x, range 1.23-1.24x), the same
as warpdom default (213.6 s, 1.23x), with the drop-in's 2 differing tests;
jsdom-vm 0.91x with 21-35 differing tests; warpdom-vm produced no results
in 2 of 4 rounds and took 795-868 s in the others. These numbers are at
warpdom 77bec904; the paper leaves the applications' learned-isolation
numbers to the re-run with the fixed fast mode.
