# Ablation A4: jsdom 30.1.2's profile for every project (warpdom 8630317)

| Directory | Run | Suites |
| --- | --- | --- |
| tuning-38427136397 | 38427136397 | 14 tuning |
| heldout-38427158136 | 38427158136 | 9 held-out |

- **Workflow:** sonukapoor/dom-api-tracer timing, mode `timing`, configurations
  jsdom-default, warpdom-default (own profile; the same-job control) and
  warpdomlatest-default (`WARPDOM_ABLATE=latest-profile`: jsdom 30.1.2 behavior
  whatever jsdom the project installs).
- **Commits:** warpdom 8630317 (frozen), harness dom-api-tracer 843087f; clean.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; CPU per job in the env records
  (react-spectrum: Intel Xeon Platinum 8370C).
- **Protocol:** warm-up + **2 rounds** by design (a correctness question), order
  rotated.
- **Files:** CSV, warm-up, packages, flaky sets, env records, `pertest.tar.xz`;
  `report.md` (timing-report.cjs, identical to the report job);
  `a4-differences.tsv` (`../tools/a4-differences.cjs`: per round, tests whose
  status differs between latest and own profile, latest vs jsdom, own vs jsdom).

## Caveats

- Partly circular: the profiles were built from differences in these projects.
- solid-primitives' jsdom rounds are flagged broken in report.md (see the
  three-way held-out README); a4-differences.tsv lists it anyway.
- latest-vs-own counts include warpdom-side flaky or timing tests (melt-ui's
  speed-sensitive test, solid's transition test, ark-ui's NumberInput tests).
