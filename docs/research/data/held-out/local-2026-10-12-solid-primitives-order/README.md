# solid-primitives: the order-dependent timer failure (laptop, 2026-10-12)

Local runs of solid-primitives (held-out pin) with the file order forced so
that packages/filesystem/test/index.test.ts runs in the same worker right
after packages/fetch/test/index.test.ts ("re-fetches after expiry" calls
`vitest.useFakeTimers()` and does not restore real timers; the project runs
with `isolate: false`).

- `order-jsdom/summary.txt`: jsdom 25, 20.9 s, the four filesystem timer
  tests fail with "Test timed out in 5000ms".
- `order-warpdom/summary.txt`: warpdom, 20.8 s, the same four tests fail
  the same way.

Only these two summaries are archived. The repeated idle/loaded runs that
compared how often each DOM meets this order (77bec90 under load 1 slow
run in 30, warpdom main 0 in 30, jsdom 0 in 30 with a margin of about
20 ms) are recorded in README 3.7 as the author's measurement; their raw
output was not archived.
