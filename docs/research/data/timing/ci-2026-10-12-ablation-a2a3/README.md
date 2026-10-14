# Ablations A2 (eager interfaces) and A3 (no query cache) (GitHub Actions)

Runs 38287824993 (14 tuning suites) and 38287832655 (9 held-out), dom-api-tracer
0bdfa08, warm-up + 5 rounds, configurations jsdom-default, warpdom-default,
warpdomeager-default (WARPDOM_ABLATE=eager-interfaces),
warpdomnocache-default (WARPDOM_ABLATE=no-query-cache). The jobs checked out
warpdom main as it moved (47eedc7, b570dfa, decc765, d098a58, 5383785); none
differs from 1ccb7048 in src/ outside src/compare. No per-test archive in
this harness version. `report.md` per run (current timing-report.cjs);
`paired.md`: time(ablated)/time(warpdom-default), tools/paired-ratio.sh.
