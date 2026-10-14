# Drop-in, three DOMs, web applications (warpdom 208ad49)

- **Run:** GitHub Actions 38427075297 (sonukapoor/dom-api-tracer, workflow timing,
  mode `timing`, corpus `apps.json`, pins `apps-pins.json`): Excalidraw (Vitest
  3.0.6, jsdom 22.1.0) and the Wire web app (`apps/webapp`, Jest 30.5.2 with
  jest-environment-jsdom 30.5.2; jsdom 29.1.1 at the root). The jsdom versions
  are from corpus/apps.json; these two suites are not in the versions experiment.
- **Commits:** warpdom 208ad49 (frozen), harness dom-api-tracer 843087f; clean.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; Intel Xeon Platinum 8573C
  (excalidraw), AMD EPYC 7763 (wire-webapp).
- **Protocol, files, derived report:** as in
  `../ci-2026-10-13-208ad49-threeway-tuning/README.md`. `report.md` is identical to
  the run's report job.

## Caveats

- warpdom was fixed black box against both applications after their first
  measurement (paper, Section 6.3): a migration case study, not held out.
