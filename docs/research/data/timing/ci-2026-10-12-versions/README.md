# Version dependence without warpdom (GitHub Actions)

Mode `versions` (dom-api-tracer scripts/research/versions.sh): jsdom only;
each project's own jsdom twice (own-a, own-b: flaky tests), then jsdom
20.0.3, 26.1.0 and 30.1.2 forced through package-manager overrides; svelte
also cssstyle 4.1.0 and 4.6.0 under its own jsdom 25.0.1.

| Directory | Run | dom-api-tracer |
| --- | --- | --- |
| tuning-38303821666 | 38303821666 | 2b78c2e |
| held-out-38303830165 | 38303830165 | 2b78c2e (naive-ui and solid-primitives keys have the CI root bug; use the rerun for them) |
| rerun-38336519771 | 38336519771 (naive-ui and solid-primitives, fixed keys) | ce2fbc6 |

warpdom is not involved (environment records name 1ccb7048 only because
the workflow checks it out). `versions-out.tar.xz`: per project and
variant, the status map with failure messages and the resolved versions
(`meta.json`). `report.md`, `versions.csv`, `versions-groups.json`:
recomputed with the current versions-report.cjs. A forced version under
which files fail to load shows as tests "passed -> missing" (handsontable
26.1.0 and 30.1.2; react-router, downshift and dom-testing-library 30.1.2);
taiga-ui 30.1.2 did not install (the registry date pin predates it).
