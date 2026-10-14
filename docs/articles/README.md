# Articles (drafts)

Drafts by Sonu Kapoor about warpdom. Nothing here is published; warpdom is
private and unreleased. Every number carries an HTML comment naming its
source file; `[TODO: re-measure]` and `[TODO]` mark what must be measured
or checked before publishing.

| # | File | Working title | Status |
| --- | --- | --- | --- |
| 1 | [01-same-results-faster.md](01-same-results-faster.md) | jsdom's test results, faster on every suite we tuned on: what we measured on 23 real suites | Full draft; measured numbers from the frozen re-run at warpdom 8630317 (2026-10-13: three-way runs, held-out set, web apps, versions, WPT). Fast mode numbers from the strong-baseline re-run at warpdom 2606b3d (2026-10-14). Needs: title choice. |
| 2 | [02-tests-encode-jsdom-versions.md](02-tests-encode-jsdom-versions.md) | "jsdom-compatible" is not one target: your tests encode a jsdom version | Outline with the key table (2026-10-11); version measurements from the 8630317 re-run. Needs: project names for several rows, two version boundaries confirmed, then writing out. |

Source of the numbers: [../research/README.md](../research/README.md) and
[../research/data/](../research/data/) (the final runs: `ci-2026-10-13-208ad49-*` and
`ci-2026-10-14-5942dc9-*`), [../../PLAN.md](../../PLAN.md),
[../head-to-head.md](../head-to-head.md), [../fast-mode.md](../fast-mode.md),
[../no-isolate-experiment.md](../no-isolate-experiment.md),
[../../wpt/README.md](../../wpt/README.md), and the scripts in
`dom-api-tracer/scripts/research/`.
