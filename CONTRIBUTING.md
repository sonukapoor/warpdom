# Contributing to warpdom

Thanks for helping. warpdom's promise is that your tests get jsdom's
results, faster. Most work is about one question: what does jsdom do here,
and does warpdom do the same?

## Getting started

```sh
git clone https://github.com/sonukapoor/warpdom.git
cd warpdom
npm ci            # Node 22.12 or later
npm test
```

Issues labeled
[good first issue](https://github.com/sonukapoor/warpdom/labels/good%20first%20issue)
are narrow and well described. Issues labeled
[help wanted](https://github.com/sonukapoor/warpdom/labels/help%20wanted)
are larger but self-contained. Comment on an issue before you start, so
two people don't work on the same thing.

## The rules that matter

### 1. Measure jsdom as a black box

warpdom is an independent implementation. **Don't read jsdom's,
happy-dom's or cssstyle's source code.** Find out what jsdom does by
running it:

```js
import { JSDOM } from 'jsdom28'; // installed aliases: jsdom20 to jsdom30
const { window } = new JSDOM('<!doctype html><p>hi</p>');
console.log(window.getComputedStyle(window.document.querySelector('p')).display);
```

The repo installs every jsdom version warpdom models as an alias, from
`jsdom20` (20.0.3) to `jsdom30` (30.1.3); see `package.json`. Behavior often
differs between versions, so measure each one. Use a fresh process for each
case where state could carry over (style caches, for example).

### 2. Every behavior change gets a parity test

`test/parity.js` runs the same scenario on real jsdom and on warpdom, and
fails if the results differ:

```js
import { parity } from './parity.js';

for (const jsdom of [20, 26, 30])
  parity(`getComputedStyle: display of a p (jsdom ${jsdom})`, (window) => {
    const p = window.document.createElement('p');
    window.document.body.append(p);
    return window.getComputedStyle(p).display;
  }, { jsdom });
```

Write the test first and check that it fails without your change.

### 3. Model versions, don't pick one

When jsdom versions disagree, warpdom follows the version the project
installed. Version-dependent behavior goes behind a compatibility flag in
`src/window-features.js` (for example `xhrUndici`, true from jsdom 28). A
fix that matches jsdom 30 but breaks jsdom 26 users is a regression.

### 4. Keep hot paths fast

DOM mutations, attribute reads and `getComputedStyle()` run millions of
times in a test suite. If your change touches them, compare before and after:

```sh
npm run bench:hot
```

## Before you open a pull request

```sh
npm test
npm run lint
npm run test:types
npm run format:check
```

In the description, say what jsdom does (a small table of measured results
by version helps), what you changed, and how you tested it. A maintainer
also runs warpdom against about 25 open-source test suites
([dom-api-tracer](https://github.com/sonukapoor/dom-api-tracer)) before
merging a behavior change, so expect that step to take a few hours.

## Where things are

- `src/`: the DOM implementation. `src/window-features.js` holds the
  per-version compatibility flags.
- `test/`: `node:test` suites, with `test/parity.js` for jsdom parity.
- `docs/`: user docs. [docs/differences.md](docs/differences.md) lists
  deliberate differences from jsdom, and
  [docs/jsdom-versions.md](docs/jsdom-versions.md) the per-version
  behavior.
- `PLAN.md`: design decisions and status.

## Reporting a difference from jsdom

Open an issue with a minimal script, the output on jsdom (with its version)
and the output on warpdom. That alone is very useful, even without a fix.
