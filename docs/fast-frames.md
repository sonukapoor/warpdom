# Fast frames (opt-in)

`requestAnimationFrame` callbacks normally run on a 60 Hz clock: jsdom
(with `pretendToBeVisual`, as Vitest's and Jest's jsdom environments create
it) and warpdom start a frame every 16.7 ms of real time. A test that awaits
a frame therefore waits 16.7 ms, however fast the DOM is. Test helpers that
let the DOM settle after each simulated interaction often await one or two
frames (ariakit's `@ariakit/test` awaits two frames and a 4 ms timer after
every click, key press and hover), so suites like that spend most of their
time waiting.

With `fastFrames`, a frame starts as soon as the event loop gets to it (a
zero-delay timer task) instead of after 16.7 ms.

## Turning it on

Vitest:

```js
// vitest.config.js
import { environment } from 'warpdom/vitest/environment';

export default {
  test: {
    environment, // import { environment } from 'warpdom/vitest/environment'
    environmentOptions: { warpdom: { fastFrames: true } },
  },
};
```

Jest:

```js
// jest.config.js
module.exports = {
  testEnvironment: 'warpdom/jest',
  testEnvironmentOptions: { fastFrames: true },
};
```

Directly: `createWindow({ fastFrames: true })`. Windows in iframes inherit it.

## What stays the same

- Callbacks requested before a frame run together in it, in request order;
  those requested during a frame run in the next one; a callback canceled
  by an earlier one in the same frame does not run.
- Every callback of a frame gets the same timestamp, the real
  `performance.now()` when the frame starts. Timestamps are not faked, so
  an animation that runs for a duration (300 ms of fade) still takes that
  long; what gets faster is code that waits for a number of frames.
- A zero-delay timer set before a frame is requested still runs before it.

## What can change, and why it is off by default

A frame now runs before a timer with a short delay that would have fired
first at 60 Hz (for example `setTimeout(fn, 5)` set before awaiting a frame).
Tests that depend on that order can change result. On the corpus
(2026-10-12, GitHub Actions, 3 rounds, measured on the experiment branch
before it was merged): ariakit got 1.61x faster than warpdom's default
(2.31x faster than jsdom) with 3 more tests differing from jsdom; ark-ui
gained nothing and had 2 to 3 more differences; floating-ui, Radix and
Vuetify were unchanged in speed and results.
<!-- source: docs/research/README.md 3.6 "Fast frames" (run 38197900923, branch exp/fast-frames: ariakit 467.9 -> 291.5 s, 1.61x over warpdom default, 2.31x over jsdom; ariakit 12 differences instead of 9, ark-ui 6 instead of 3-4; no gain on ark-ui, floating-ui, Radix, Vuetify); data/timing/ci-2026-10-12-fastframes/ -->

Check your own suite before turning it on:

```sh
npx warpdom compare --fast-frames --rounds 3
```

It runs your tests on jsdom and on warpdom with `fastFrames`, and lists
every test whose result differs, with the speedup.
