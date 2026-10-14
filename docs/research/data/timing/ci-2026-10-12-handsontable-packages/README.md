# handsontable per package (GitHub Actions)

Run 38303838255, warpdom 77bec904, dom-api-tracer 2b78c2e, jsdom vs warpdom,
warm-up + 5 rounds, per-package runner times (`packages.csv`).
`report.md` recomputed with the current timing-report.cjs `--packages`.
The warm-up includes a cold Angular compilation in the Angular wrapper
(about 378 s on both DOMs).
