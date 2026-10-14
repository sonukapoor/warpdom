# melt-ui "Toggles checked to true": why it fails intermittently on warpdom and not on jsdom

Investigation of 2026-10-14 (laptop: Apple M4 Pro, 14 cores, macOS 26.6.2, Node 22.23.3),
black box only: no jsdom or happy-dom source was read. Svelte's own runtime
(`node_modules/svelte/src/runtime/internal/{loop,transitions,environment,style_manager}.js`
in the melt-ui checkout) was read to name the mechanism.

**Conclusion: the failure is speed-sensitive, demonstrated** (controlled manipulation with
a dose-response, and the race observed directly in timestamped logs). It is a race in the
test, not a DOM difference: the outcome depends only on when Svelte's first
requestAnimationFrame tick lands relative to two key presses, and warpdom reaches the
toggling key press sooner than jsdom. jsdom fails the same tests when the timing is
shifted (here and on CI).

## The tests

- melt-ui (held-out pin 84b582f), Vitest 1.2.2, jsdom 24.0.0, Svelte 4.2.9,
  @testing-library/user-event 14.5.2, one root package, run with `--retry=0`.
- `src/tests/context-menu/ContextMenu.spec.ts` > "Context Menu > Toggles checked to true for
  default unchecked checkbox items" (the test that differs on CI), and
  `src/tests/dropdown-menu/DropdownMenu.spec.ts` > "Dropdown Menu (forceVisible) > Toggles
  checked to true..." (the same steps; it failed in 2 of 5 jsdom-learned rounds on CI).
  The "Dropdown Menu (Default)" variant has no stub and no transition race; it is recorded
  as a control and never failed.
- Error: `expected null not to be null` (check2 is gone because the whole menu was removed).

## CI at warpdom 208ad49 (`ci-208ad49.tsv`)

Statuses of the three tests in every configuration and round of the four held-out jobs
(three-way, baselines, A2/A3, A4), from their `pertest.tar.xz` archives
(`scripts/ci-extract.cjs`; round 0 is the warm-up). Context Menu test:

| Configuration | failed / runs |
| --- | --- |
| jsdom-default | **0 / 21** |
| warpdom-default | **8 / 21** (7 / 17 timed rounds; three-way 0/6, baselines 5/6, A2/A3 2/6, A4 1/3) |
| warpdom-default-aa, eager, nocache, latest (A2/A3, A4) | 4/6, 4/6, 3/6, 1/3 |
| warpdom-learned | 2 / 5 |
| jsdom-learned, jsdom-vm | 0 / 5, 0 / 6 |
| happy-dom-default | 1 / 6 |

Dropdown Menu (forceVisible): jsdom-default 0/21, warpdom-default 0/21, **jsdom-learned 2/5**,
warpdom-default-aa 1/6, warpdom-vm 1/6. (Every shared-environment configuration fails all
three tests in every round; that is a different cause, not part of this investigation.)

## Mechanism

1. Both describe blocks stub `requestAnimationFrame` as
   `window.setTimeout(() => fn(Date.now()), 16)`. Svelte's transition loop compares the
   frame time with `performance.now()`-based start and end times, so with `Date.now()`
   (about 1.7e12) every transition ends on its **first tick**.
2. The menu has `transition:fade`. Opening it starts the intro; Svelte's loop requests a
   tick (a 16 ms timer) unless a loop tick is already pending, in which case the intro
   joins it.
3. The toggling Enter checks the item and closes the menu, starting the outro. If the
   loop still has a tick pending (the intro's), the outro is queued on that tick; if not,
   it requests its own tick 16 ms later.
4. The test checks check2 about 5 ms after the toggling Enter (Context Menu: right after a
   second Enter; Dropdown: a second Enter, then `waitFor`). If the intro's tick fires in
   that window, it ends the outro at once, the menu (and check2) is removed, and the test
   fails. If the tick fired before the toggling Enter, the outro gets its own tick 16 ms
   later and the check passes. If it fires after the check, the test also passes.

So the test fails only when **open → toggling Enter** takes a little under 16 ms (plus the
timer's lateness), and only when the intro has its own tick. Whether it has one depends on
the previous test: "Toggles checked to false" runs the same steps; when its own race
removes its menu early, no loop tick is left pending, the next test's intro sets a fresh
tick, and the race is on (`chain.tsv`, below).

## Experiments

All runs use dom-api-tracer's harness unchanged (`scripts/trace-corpus.mjs
corpus/held-out.json --repos-dir ~/Projects --only melt-ui --environment <dom> --warpdom
<worktree> --no-baseline --no-build --max-workers 2`, dom-api-tracer 4fe9e95), warpdom
208ad49 from a temporary worktree (`npm ci`), Node 22.23.3. "file" = the two spec files
(`--extra-args`), "full" = the whole suite (770 tests). Conditions are interleaved round by
round (`scripts/experiments.sh`), so load changes fall on all conditions alike. The machine
was shared with other work; `runs.tsv` records the 1-minute load average after each run.

The manipulations are a Vitest setup file passed with the harness's `--first-setup`
(`scripts/timing-setup.mjs`; version 1, `timing-setup.v1.mjs`, for the delay, delay-fine and
raf experiments). It wraps only public globals (`setTimeout`, `EventTarget.prototype.dispatchEvent`)
during the target tests. Neither warpdom nor melt-ui was modified; no patch files exist.

- `MELT_DELAY_MS=d`: busy-wait d ms before each ArrowDown keydown and keyup dispatch in the
  target tests: a slower DOM in exactly the steps between opening and the toggling Enter
  (Context Menu 3 ArrowDowns = 6 dispatches, +6d ms; Dropdown 2 = 4 dispatches, +4d ms).
- `MELT_RAF_MS=r`: the stub's 16 ms timers get r ms instead (moves the window relative to
  the steps, equivalent to making the steps faster or slower on both DOMs).
- `MELT_LOG`: timestamps of the pointer/key dispatches, every 16 ms timer (set, fire, origin
  from the stack: Svelte's `loop`/`run_tasks` or `clear_rules`), the user-event
  `setTimeout(0)` continuations and the menu/check2 presence (`timing.jsonl` per run).

### 1. Reproduction (unchanged harness, no setup file; `counts.tsv`, experiment `repro`)

| Scope | Test | jsdom | warpdom |
| --- | --- | --- | --- |
| file | Context Menu | 0 / 20 | **6 / 20** |
| file | Dropdown (forceVisible) | 0 / 20 | 0 / 20 |
| full suite | Context Menu | 0 / 20 | **9 / 20** |
| full suite | Dropdown (forceVisible) | 0 / 20 | 0 / 20 |

`repro-underload` (12 file runs each, before the reproduction, while another job held the
machine at a 1-minute load of 9-166 after the runs and above 300 at times): jsdom Context Menu 1/12 and Dropdown (forceVisible) 1/12, warpdom
0/12 and 2/12. Under heavy load jsdom fails too.

### 2. Slowing warpdom down: dose-response (`delay`, `delay-fine`; instrumented, file scope, 20 runs each)

| ArrowDown delay d (ms per dispatch) | 0 | 0.25 | 0.5 | 0.75 | 1 | 2 | 4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| added before the toggling Enter, Context Menu | 0 | 1.5 ms | 3 ms | 4.5 ms | 6 ms | 12 ms | 24 ms |
| warpdom Context Menu failed | **9/20, 11/20** | 13/20 | 8/20 | 4/20 | **0/20** | 0/20 | 0/20 |
| warpdom Dropdown (forceVisible) failed | 0/20, 0/20 | 0/20 | **10/20** | **14/20** | **13/20** | 0/20 | 0/20 |

(d = 0 was run in both phases; jsdom without delay, interleaved: 0/20 and 0/20.)
Slowing only warpdom's ArrowDown dispatches takes the Context Menu failure rate from about
half to jsdom's 0 at +6 ms. The Dropdown test, whose steps on warpdom are too fast to fail
(the tick lands after the check), is pushed **into** the window by +2-4 ms and out again
by +8 ms: the non-monotone response the mechanism predicts and a plain "warpdom bug" would
not.

### 3. Moving the window: the stub's timer delay (`raf`; instrumented, file scope, 20 runs each)

| Stub delay r (ms) | 8 | 16 (from `delay` d0) | 24 | 32 | 48 |
| --- | --- | --- | --- | --- | --- |
| jsdom Context Menu | 0/20 | 0/20 | **1/20** | 0/20 | 0/20 |
| jsdom Dropdown (forceVisible) | 0/20 | 0/20 | 0/20 | **2/20** | 0/20 |
| warpdom Context Menu | 0/20 | 9/20 | 0/20 | 2/20 | 0/20 |
| warpdom Dropdown (forceVisible) | 0/20 | 0/20 | **5/20** | 0/20 | 0/20 |

jsdom starts failing when the window moves onto its (longer) step times; warpdom's failures
move with the window and vanish at 8 and 48 ms. This is the weaker of the two manipulations
(jsdom 3 failures in 160 runs): a longer stub delay also changes which tick the intro joins
(step 2 of the mechanism), so the window is not simply shifted.

### 4. The race observed directly (`timing.tsv`, `chain.tsv`, `step-times.tsv`)

- **Every failure is the race.** Over all 760 instrumented target-test executions
  (delay, delay-fine, raf, chain), the 95 failures are exactly the executions in which the
  loop had a tick pending at the toggling Enter (the outro set no tick of its own) and a
  16 ms timer removed the menu before the check; no other execution failed. (223 had a
  pending tick that fired after the check and passed; 12 Dropdown executions had the menu
  removed before the second Enter, which reopens the menu, and passed.)
- **warpdom reaches the toggling Enter sooner.** Unmanipulated instrumented runs, from the
  end of the opening dispatch to the toggling Enter: Context Menu jsdom median 19.3 ms
  (IQR 17.0-20.0, 13% under 16 ms), warpdom 16.4 ms (13.1-16.9, 45% under 16 ms); Dropdown
  (forceVisible) jsdom 12.6 ms, warpdom 8.9 ms.
- **The previous test decides whether the race is on** (`chain`: every test of both
  blocks logged, 20 runs per DOM). Context Menu, warpdom: in 4 of 20 runs no loop tick was
  pending when the test started (the previous test's own race had removed its menu early),
  the intro set a fresh tick about 4.7 ms into the test, the toggling Enter came 11.7-12.1 ms
  later, and 3 of the 4 failed; in the 16 runs where the intro joined the inherited tick,
  all passed (3/20 failed). jsdom: the intro joined the inherited tick in 20 of 20 runs
  (0/20 failed). The previous test's outro set its own tick (left pending for the target
  test) in 20 of 20 jsdom runs and 16 of 20 warpdom runs: exactly the 16 joined runs. Dropdown (forceVisible): fresh intro ticks in
  13/20 warpdom and 3/20 jsdom runs, none failed (tick to Enter 7.6-10.6 ms: the tick
  fires after the check).

Example (`runs/chain/none/warpdom-file-14`, ms from the test start): previous test,
intro tick fires at 13.4, 0.7 ms after its toggling Enter, so its menu is removed early and
no tick is left. Target test: menu opens, intro tick set at 5.2; ArrowDowns at 8.7, 11.7,
14.5; toggling Enter 17.1; second Enter 20.3; the intro tick fires at 21.7 and removes the
menu (22.1) before the check: failed. In `warpdom-file-13` the previous test's tick fires
0.23 ms *before* its Enter, its outro leaves a tick pending, the target's intro joins it
(fires at 11.3), the outro gets its own tick, and the test passes.

## Strength of the evidence

- **Demonstrated:** the failure is a timing race inside the test (fake requestAnimationFrame
  plus Svelte's single shared loop), shown in timestamped logs for every failing execution;
  a controlled slowdown of warpdom's DOM dispatches alone removes the Context Menu failures
  with a dose-response (11/20 → 13 → 8 → 4 → 0/20) and moves the Dropdown variant in and out
  of the window; jsdom fails the same tests when the window is moved (and on CI under
  jsdom-learned, and locally under heavy load).
- **Measured, not manipulated:** that warpdom's step times (median 16.4 vs 19.3 ms) are the
  reason the unmanipulated suites differ. jsdom was not sped up; the stub-delay experiment
  shifts the window for both DOMs and gives only a weak jsdom response (3/160).
- **Not shown:** why the warpdom runs in the three-way CI job never failed (0/6) while the
  other jobs did; machine speed changes all step times and the previous test's race.
- Local, one machine shared with other work; CI runners were not used.

## For the paper

melt-ui's Context Menu checkbox test is speed-sensitive, not a DOM difference: its
requestAnimationFrame stub (a 16 ms timer passing `Date.now()`) ends Svelte's transitions on
their first tick, and the test fails when that tick falls between the key press that closes
the menu and the assertion; warpdom reaches that key press sooner (median 16.4 vs 19.3 ms
after opening), and slowing only warpdom's key dispatches by 1 ms each removed the failures
(11/20 to 0/20) while jsdom fails the same tests when the timer window is moved.

## Files

- `runs.tsv`: one row per test per run (experiment, condition, DOM, scope, run, load, test,
  status, duration, first failure line), 485 runs.
- `counts.tsv`: failures per experiment, condition, DOM, scope and test (`scripts/counts.sh`).
- `timing.tsv`: per instrumented target-test execution, the times of the menu opening, the
  intro tick, the toggling Enter and the check, and the race criteria
  (`scripts/analyze-timing.cjs`; definitions in its header).
- `chain.tsv`: the chain experiment, inherited vs fresh intro tick (`scripts/analyze-chain.cjs`).
- `step-times.tsv`: open → toggling Enter per DOM (`scripts/step-times.cjs`).
- `ci-208ad49.tsv`: CI statuses (`scripts/ci-extract.cjs`).
- `runs.tar.xz`: every run's harness output (status.json, logs, Vitest JSON report) and
  `timing.jsonl` The scratch directory the runs were made in is written as
  `/tmp/melt-timing` in these files.
- `scripts/run.sh` (one harness run; expects `warpdom/` and `scripts/` side by side, the
  worktree at 208ad49 with `npm ci`), `scripts/experiments.sh` (phases `repro-file`,
  `repro-full`, `delay`, `delay-fine`, `raf`, `chain`), `scripts/extract.cjs`,
  `scripts/timing-setup.mjs` (version 2; `timing-setup.v1.mjs` is version 1, whose header
  says "16 ms timers created during the test": in fact it changes every 16 ms timer, as
  version 2 documents).

The temporary warpdom worktree was removed afterwards, and the melt-ui checkout is clean
(`run.sh` restores `src/json/contributors.json`, which a test run rewrites, after each run).
