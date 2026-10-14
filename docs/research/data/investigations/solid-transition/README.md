# solid "transition" test: why it fails on warpdom and not on jsdom

Investigation of 2026-10-13 (laptop, macOS, 14 cores, Node 22.23.3), black box
only: no jsdom or happy-dom source was read.

## The test and the error

- solid (corpus pin aa123525), package `packages/solid`, Vitest 2.1.9, jsdom 25.0.1.
- `packages/solid/web/test/transition.spec.tsx` >
  "Transition memo stale read (#2046) memo created during transition should not
  return undefined in committed state".
- Error, on warpdom and (in the same file orders) on jsdom:
  `AssertionError: expected null not to be null` (`expect(dataRef).not.toBeNull()`,
  line 70): after 100 rounds of `await Promise.resolve(); await setTimeout(0)`
  the component started in the transition has not mounted.
- CI at warpdom 208ad49 (`ci-2026-10-13-208ad49-correctness-warpdom-*.tsv`):
  failed in 24 of 27 warpdom-default rounds, passed in every jsdom-default round.
  CI archives statuses only, not messages or file orders; the message above is
  from the local runs.

## Root cause: a test-order dependence of solid's suite, exposed by the harness's environment switch

1. **solid's suite leaks state between files.** Its Vitest config sets
   `isolate: false`, so the files a worker runs share one Solid module instance.
   `web/test/suspense.spec.tsx` calls `enableScheduling()` at module level, which
   sets Solid's global `Scheduler`; from then on transitions in that worker are
   run through Solid's MessageChannel scheduler (the suite's
   `test/MessageChannel.ts` mock). When `transition.spec.tsx` runs later in the
   same worker, its transition never renders within the loop and the test fails.
   `test/external-source.spec.ts`, if it runs between the two, restores a state
   in which the test passes. Alone, the test always passes.
2. **This is independent of the DOM.** With a fixed file order in one worker
   (custom Vitest sequencer, `scripts/make.sh` + `seq.sh`):

   | Order in one worker | jsdom 25.0.1 | warpdom |
   | --- | --- | --- |
   | transition | 3/3 pass | 3/3 pass |
   | suspense, transition | 0/3 pass | 0/3 pass |
   | suspense, external-source, transition | 3/3 pass | 3/3 pass |

   Also (`sequenced-extra` rows): suspense, X, transition fails on jsdom for
   X = mutable, dev, rendering, portal, dynamic and resource (and on warpdom for
   resource); only external-source in between makes it pass.
3. **Why the order differs between the jsdom and warpdom runs.** Vitest 2's
   non-isolated forks pool groups files by environment name and runs each group
   on fresh workers (`recycleWorkers` between groups). In the jsdom run the config
   environment and the 14 files with `@vitest-environment jsdom` all say `jsdom`:
   one group of 30 files on 2 workers, in which external-source.spec nearly always
   lands between suspense.spec and transition.spec. The drop-in harness
   (`trace-corpus.mjs --environment warpdom`) sets the config environment to
   warpdom's path but switches the pinned comments to the name
   `dom-trace-warpdom`: two groups. The 14 web files then run on their own 2
   workers without external-source.spec, and whenever transition.spec lands in
   the worker that ran suspense.spec, it fails.
4. **Swapping the grouping swaps the outcome** (full suite, 2 workers,
   `scripts/run.sh`, 10 runs each):

   | Grouping | jsdom 25.0.1 | warpdom 208ad49 code |
   | --- | --- | --- |
   | one environment name for all files (as the jsdom run) | 10/10 pass | 10/10 pass |
   | two names, config vs pinned files (as the warpdom run) | 7/10 pass | 6/10 pass |

5. **Every full-suite run, all experiments (130 runs):** the test failed in all
   32 runs where suspense.spec ran before it in the same worker without
   external-source.spec in between, and passed in all 98 others, whatever the DOM.

There is no timing margin involved: the outcome is decided by which files share
the worker, which Vitest decides by file order and worker availability.
Machine load matters only through that.

## Reproduction with the harness (unchanged, as in CI)

`node scripts/trace-corpus.mjs --repos-dir ~/Projects --only solid --environment
<dom> --no-baseline --no-build` (dom-api-tracer 843087f, 2 workers), with a
setup file that logs the file order per worker (`--first-setup
scripts/order-setup.mjs`) for full-suite runs. warpdom 208ad49 and main e5ba020
(same `src/`; main only changes `.gitignore` and a docs script). "Load": 14 `yes`
processes on 14 cores; "idle": no added load (the machine was shared with other
work, load average about 68 when the load phase started).

| | jsdom 25.0.1 | warpdom 208ad49 | warpdom main |
| --- | --- | --- | --- |
| file alone, idle | 10/10 pass | 10/10 pass | 10/10 pass |
| file alone, load | 10/10 pass | 10/10 pass | 10/10 pass |
| full suite, idle | 19/20 pass | 10/20 pass | 15/20 pass |
| full suite, load | 10/10 pass | 5/10 pass | 6/10 pass |

The one jsdom failure (`harness idle full jsdom 3`) is the same failure, in a
run whose order put suspense.spec before transition.spec in one worker without
external-source.spec: jsdom also fails the test when the order allows it.

## Is it a warpdom bug?

No. No DOM behavior is involved; warpdom and jsdom give the same result for
every file order. The difference in the CI numbers comes from the measurement
harness splitting solid's files into two Vitest environment groups on warpdom
and not on jsdom. A user who switches the config to warpdom but leaves the
`@vitest-environment jsdom` comments (or names them differently from the
config) gets the same split. Giving the config and the pinned files the same
environment name in the harness would remove the difference; that is a change
to dom-api-tracer, not made here (the paper's numbers are frozen at 208ad49).

## Files

- `runs.tsv`: one row per run: experiment (harness, grouping, sequenced,
  sequenced-extra),
  condition, scope (file alone / full suite / subset), DOM, run, result, whether
  suspense.spec ran before the test in its worker, whether external-source.spec
  ran in between, and the files its worker ran up to it.
- `runs.tar.xz`: per run the harness output, the runner log, Vitest's JSON
  results (with failure messages) and the per-worker order log. The
  temporary working directory of the runs is written as
  `/tmp/solid-transition` in these files.
- `scripts/`: the scripts used (their working directory is `$S`, default
  `/tmp/solid-transition`): `rep.sh`, `counts.sh` (harness runs), `order-setup.mjs`,
  `st.cjs`, `pre.sh` (status, order), `make.sh`, `run.sh`, `seq.sh`,
  `clean.sh` (grouping and fixed-order experiments: temporary config and
  environment packages in the solid checkout, removed afterwards).
