# Ablation plan

Status: plan, 2026-10-12. Purpose: measure what each of warpdom's
mechanisms contributes to speed and to equal results, by switching it off
one at a time on real suites. Input for the paper (the central mechanism is
learned isolation) and the research record.

## Questions

- **A1 Learned isolation.** How much of fast mode's gain comes from each
  part: sharing modules across files, the in-place window reset, and the
  learned split (leaky files isolated)? What does each variant do to the
  results?
- **A2 Startup.** How much does creating interfaces on first use save per
  test file and per suite, compared with creating all of them with the
  window?
- **A3 Query cache.** How much do cached query results save on real suites
  (Testing Library queries the same tree repeatedly)?
- **A4 Version profiles.** How many tests change result when every project
  gets the latest jsdom profile instead of its own version's? (Correctness
  ablation, no timing.)

## Configurations

Each configuration runs on GitHub Actions in dom-api-tracer's timing
workflow (public repository, free minutes), one job per project, the
configurations of a question alternating within the job, 5 rounds.

| Id | Question | Configuration | How |
| --- | --- | --- | --- |
| iso | A1 | warpdom, Vitest's default isolation | existing (`warpdom-default`) |
| shared-reset | A1 | all files shared (`isolate: false`), warpdom's in-place reset between files, no learning | existing (learned.sh "fast" mode, `WARPDOM_FAST_MODE=fast`) |
| shared-fresh | A1 | all files shared, a fresh window per file instead of the reset | new: `WARPDOM_ABLATE=fresh-window` in the reset setup file |
| learned | A1 | learned isolation (split: leaky files isolated, rest shared with reset, re-run safety net) | existing (`learned.sh`, the product's `warpdom vitest run`) |
| jsdom-shared | A1 | jsdom with `isolate: false`, no reset (what users can do today) | existing harness option (`--extra-args --no-isolate`) |
| eager | A2 | warpdom default, every interface created when the window is created | new: `WARPDOM_ABLATE=eager-interfaces` |
| no-query-cache | A3 | warpdom default, query result cache off | new: `WARPDOM_ABLATE=no-query-cache` |
| latest-profile | A4 | warpdom default, `jsdom: '30.1.2'` forced for every project | existing option (`environmentOptions.warpdom.jsdom` / `testEnvironmentOptions.jsdom`), set by the harness |

`WARPDOM_ABLATE` is an internal, undocumented switch read only by the
adapters (src/vitest.js, src/jest.js, src/vitest-reset.js), never by the DOM
core; a comma-separated list. It must cost nothing when unset (one read at
environment setup, none per operation).

## Suites

- **A1:** the 11 Vitest suites of the tuning corpus (fast mode is
  Vitest-only) and the Vitest suites of the held-out set (naive-ui,
  tanstack-query, melt-ui, solid-primitives, vueuse).
- **A2, A3:** all 14 tuning suites and the 9 held-out suites.
- **A4:** all 23 suites, correctness only (one round per configuration).

## Metrics

- Suite time: runner-reported, median of 5 rounds, speedup as the median of
  per-round ratios against jsdom default in the same job, with per-suite
  bootstrap intervals (5 rounds) and the two-level bootstrap of the median
  across suites (timing-report.cjs).
- Per-file phases (A2): environment setup, collect, tests
  (perfile-reporter.mjs).
- Tests that differ from the jsdom baseline, per configuration.
- For A1 also: files learned as leaky, files re-run by the safety net, the
  learning run's cost and after how many runs it is amortized.

## Expected outputs

- A table per question: configuration, median speedup with interval,
  tests that differ.
- A1 decomposition: iso -> shared-fresh (sharing modules) -> shared-reset
  (in-place reset) -> learned (split and safety net), each step's gain and
  its effect on results. Expected from earlier experiments
  (docs/head-to-head.md, docs/no-isolate-experiment.md): shared-fresh breaks
  suites (Radix: 605 differences with fresh jsdom windows), shared-reset
  fixes most, learned removes the rest.
- A2: per-file environment setup with and without lazy interfaces (laptop
  micro-benchmark: 3.0 -> 0.63 ms per file; suite effect unknown).
- A4: the count of tests that need the right jsdom version, per suite (the
  quantitative version of finding F1).

## Work needed before the runs

1. warpdom: the `WARPDOM_ABLATE` switch with `fresh-window`,
   `eager-interfaces` and `no-query-cache`; tests that each switch changes
   only what it says; benchmarks showing no cost when unset.
2. dom-api-tracer: configurations for the table above in
   timing-rounds.sh/learned.sh (environment variables per configuration),
   and a way to pass `jsdom: '30.1.2'` for latest-profile.
3. Workflow inputs for 5 rounds and the configuration sets; one GitHub run
   per question.

## Cost

dom-api-tracer is public, so the runs cost no Actions minutes. Wall
clock: A1 about 2-3 hours (the longest suites, 5 rounds, 5 configurations),
A2/A3 about 2 hours each, A4 about 1 hour.
