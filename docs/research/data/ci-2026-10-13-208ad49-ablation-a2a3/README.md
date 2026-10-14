# Ablations A2 (eager interfaces), A3 (no query cache) and the A/A control (warpdom 208ad49)

| Directory | Run | Suites |
| --- | --- | --- |
| tuning-38427093681 | 38427093681 | 14 tuning |
| heldout-38427115775 | 38427115775 | 9 held-out |

- **Workflow:** sonukapoor/dom-api-tracer timing, mode `timing`, configurations
  jsdom-default, warpdom-default, warpdom-default-aa (warpdom-default under a
  second name: the A/A noise floor), warpdomeager-default
  (`WARPDOM_ABLATE=eager-interfaces`), warpdomnocache-default
  (`WARPDOM_ABLATE=no-query-cache`). Every other configuration runs with
  `WARPDOM_ABLATE` unset. **No `warpdom-ablate-unset` configuration (the switch set
  to the empty string) ran in these jobs**; the only measurement of it is the
  earlier run 38303845272 at 77bec904 (`../timing/ci-2026-10-12-aa-control/`).
- **Commits:** warpdom 208ad49 (frozen; `src/ablate.js` reads the switch, the
  Vitest and Jest adapters apply it), harness dom-api-tracer 843087f; clean.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; CPU per job in the env records.
- **Protocol:** warm-up + 5 rounds, order rotated; 2 workers.
- **Files:** as in the three-way directories (CSV, warm-up, packages, flaky sets,
  env records, `pertest.tar.xz`). `report.md` per run: `timing-report.cjs
  --pertest --packages` at 843087f, identical to the run's report job (its A/A
  table is the paired ratio warpdom-default / warpdom-default-aa). Paired
  ablation ratios: `../ci-2026-10-13-208ad49-computed.md`.

## Caveats

- That the switch reaches the test workers is shown by A4 at the same commit
  (`../ci-2026-10-13-208ad49-ablation-a4/`: latest-profile changes test results).
- solid-primitives (held-out) is left out of report.md (every jsdom round flagged
  broken, as in the three-way held-out run); its warpdom configurations have
  slow rounds of about 22.5 s (the project's own fake-timer order dependence) in
  default 1, default-aa 2, nocache 1 of 5 rounds, which makes its paired ratios
  bimodal; the computed summary gives pooled numbers with and without it.
