# Held-out drop-in timing, 5 rounds with warm-up (GitHub Actions)

- `run-38302460860`: run 38302460860, warpdom 1ccb7048, dom-api-tracer
  aea4a5c, the nine held-out projects, three-way (jsdom, warpdom,
  happy-dom), warm-up + 5 rounds. `report.md` recomputed with the current
  timing-report.cjs. Per-test keys of naive-ui and solid-primitives in the
  CSV and `pertest.tar.xz` have the CI root bug; `round5-raw-keys/` holds
  their round-5 status maps rebuilt from the raw runner JSON in the
  artifact with the current statuses.cjs (`map --root
  /home/runner/work/dom-api-tracer/repos/<project>`): naive-ui 0 tests
  differ on warpdom, 23 on happy-dom; solid-primitives 4 tests change
  status on warpdom (the filesystem package's timer tests, see the paper's
  Section 6.3) plus 21 tests that the runner's JSON lists a second time
  under packages/pagination in the warpdom and happy-dom runs.
- `rerun-solid-primitives-38336512442`: run 38336512442, the same at
  dom-api-tracer ce2fbc6 (fixed keys) for solid-primitives. In this run the
  runner listed the 21 resource tests under pagination in some runs of
  every DOM (jsdom included), so jsdom's own rounds differ from its
  warm-up by 21 entries; no test changed status.
- `rerun-naive-ui-38336512442`: run 38336512442, the same at
  dom-api-tracer ce2fbc6 (fixed keys) for naive-ui, archived 2026-10-13.
  All five rounds and the warm-up: warpdom 0 differing tests, happy-dom 23
  (6 files); warpdom 1.12x (95% interval 1.10-1.13x), happy-dom 1.06x.
  This confirms, over every round, the counts rebuilt from round 5 of run
  38302460860 in `round5-raw-keys/`.
