# Version dependence without warpdom: jsdom only (harness 843087f)

| Directory | Run | Suites |
| --- | --- | --- |
| tuning-38427202342 | 38427202342 | 14 tuning |
| heldout-38427223850 | 38427223850 | 9 held-out |

- **Workflow:** sonukapoor/dom-api-tracer timing, mode `versions`
  (`versions.sh`): jsdom only. Per project: its own jsdom twice (own-a, own-b;
  tests differing between them are flaky and left out), then jsdom 20.0.3, 26.1.0
  and 30.1.2 forced through the package manager's overrides (installed without a
  frozen lockfile; package.json, workspace file and lockfile restored afterwards);
  svelte also cssstyle 4.1.0 and 4.6.0 under its own jsdom 25.0.1. A forced jsdom's
  own dependencies (cssstyle, nwsapi, parse5, whatwg-url) are kept inside its
  declared ranges (forced to the range when the tree resolves one outside).
- **warpdom is not involved.** The environment records name warpdom 208ad49 only
  because the workflow checks it out; harness 843087f, clean.
- **Runners:** 4 cores, 15.6 GiB, Node 22.23.3; CPU per job in the env records
  (`<suite>.env-*.json`; analog's and others' records are named after the suite).
- **Files:** `versions-out.tar.xz` (`out/<suite>/<variant>/`: `map.json` per-test
  statuses with failure messages, `meta.json` with the jsdom each package's runner
  resolved and the versions of jsdom's dependencies, `harness.log`,
  `install.log`, per-package runner logs; `restored.json`, `restore-install.log`),
  `versions.csv`, `versions-groups.json` (differing tests grouped by first error
  line), environment records.
- **Derived:** `report.md` = `versions-report.cjs <extracted out>` at 843087f;
  `versions.csv` and `versions-groups.json` regenerated from the archive are
  byte-identical to the run's; `report.md` identical to the report job's.

## Caveats

- The own-a meta.json files are the source of the per-package jsdom versions used
  for the version rule (handsontable: 16.7.0 in handsontable, react-wrapper and
  vue3; 20.0.3 in angular-wrapper).
- taiga-ui jsdom 30.1.2: NA (install failed: the registry date pin predates
  30.1.2).
- Load failures: forcing a newer jsdom on an old Jest can stop files from loading
  (handsontable 26.1.0 and 30.1.2, dom-testing-library, downshift and
  react-router 30.1.2, React Spectrum 30.1.2 partly): tests "passed -> missing";
  the computed summary separates them from status changes of tests that ran.
- naive-ui's own tree resolves cssstyle 5.2.1, outside jsdom 27.4.0's declared
  ^5.3.4 (own-a, own-b); for jsdom 20.0.3 and 26.1.0 cssstyle was forced to
  ^2.3.0 and ^4.2.1.
- A forced jsdom brings its own dependency versions: a change under "jsdom X" is
  a change of jsdom and its dependency tree, not of jsdom's code alone; only
  svelte's cssstyle variants isolate a dependency.
