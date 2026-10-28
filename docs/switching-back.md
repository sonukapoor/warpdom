# Switching back to jsdom

warpdom is chosen by one setting: the test environment. Changing that
setting back to `jsdom` (or `happy-dom`) is all it takes to run your tests
on jsdom again, for the whole project, for one test file or for one run.
Only fast mode needs more (see [Fast mode](#the-whole-project) below).

The one requirement: the DOM you go back to must be installed, at the
version your tests used before. `warpdom migrate` removes jsdom, happy-dom
and their environment packages when nothing else uses them, and lists
each with its version under "Changed dependencies" in
`.warpdom-migrate/plan.md` (for example "remove `jsdom` ^26.1.0"); the
package.json in git from before the migration has them too. Reinstall
that version. Without one, npm installs the newest, which can change
results (measured: a Vitest project on jsdom 26.1.0 got 30.1.3; a Jest 29
project on jest-environment-jsdom 29.7.0 got 30.5.2, which runs jsdom
26.1.0 instead of 20.0.3).

```sh
npm install --save-dev jsdom@<version>                  # Vitest
npm install --save-dev jest-environment-jsdom@<version> # Jest 28 and later
```

(`happy-dom` for Vitest, `@happy-dom/jest-environment` for Jest.) Without
it, Jest stops with "Test environment jest-environment-jsdom cannot be
found", and Vitest cannot load the environment.

Each command and config below was run on a small Vitest 5.0 project and a
small Jest 30.5 and 29.7 project with warpdom 0.1.10, switching to warpdom and back.

## The whole project

Change the one config line back.

**Vitest.**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom' }, // was: 'warpdom', or the path from 'warpdom/vitest/environment'
});
```

**Jest.**

```js
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom', // was: 'warpdom' or 'warpdom/jest'
};
```

**Scripts.** `warpdom migrate` also changed `--environment jsdom` and
`--env=jsdom` in package.json scripts to `warpdom`; change them back. The
flag wins over the config, and adding a second one
(`npm test -- --environment jsdom`) makes Vitest and Jest fail.

Options for warpdom that stay in the config (`environmentOptions.warpdom`
with Vitest; `jsdom` or `fastFrames` in `testEnvironmentOptions` with
Jest) are ignored by jsdom; you can remove them.

**A page URL (Vitest).** `warpdom migrate` moves `environmentOptions.jsdom`
when it holds only `url` to `environmentOptions.warpdom`. jsdom does not
read that, so its tests then run at `http://localhost:3000/`. Move `url`
back to `environmentOptions.jsdom`, or keep both to switch back and forth:

```js
environmentOptions: {
  warpdom: { url: 'http://example.test/app/' },
  jsdom: { url: 'http://example.test/app/' },
},
```

With Jest, `testEnvironmentOptions.url` is read by both and stays.

**Fast mode.** Replace `withFastMode(...)` with `defineConfig(...)` (or
remove the wrapper), run `vitest run` instead of `warpdom vitest run`, and
delete `.warpdom/fast-mode.json`. Changing only the environment is not
enough: once fast mode has learned to split the suite, `withFastMode`
still runs most files without isolation, so jsdom files share one window
(warpdom's reset between files resets only warpdom's window).

## One test file

A comment at the top of the file chooses its environment. It wins over the
config and over the command-line flags below.

**Vitest.**

```js
// @vitest-environment jsdom
```

**Jest.** It must be the first comment in the file, a `/** */` docblock:

```js
/**
 * @jest-environment jsdom
 */
```

Vitest groups test files by environment name and runs each group on its
own workers. In a suite with `isolate: false` and tests that depend on the
order of files, a file with a different environment can change the results
of other files (see [Setup](../README.md#setup)).

## One run, without editing files

Pass the environment on the command line.

```sh
npx vitest run --environment jsdom
npx jest --env=jsdom
```

With an npm script, put the flag after `--`:

```sh
npm test -- --environment jsdom   # Vitest
npm test -- --env=jsdom           # Jest
```

With Vitest `test.projects`, the flag does not reach the projects; change
their `environment`, or run a jsdom project
([Both side by side](#both-side-by-side)).

For happy-dom: `--environment happy-dom` (Vitest), and
`--env=@happy-dom/jest-environment` (Jest). Files with an environment
comment keep that environment; `warpdom migrate` changed `jsdom` in those
comments to `warpdom`.

With fast mode, add `--isolate` and run Vitest itself, not
`warpdom vitest run`: otherwise most files run without isolation and share
one jsdom window, and the warpdom CLI records the jsdom run's results in
`.warpdom/fast-mode.json`.

```sh
npx vitest run --environment jsdom --isolate
```

For a CI run on a project whose package.json no longer lists jsdom,
install it for that run only (`<version>`: the one from before the
migration, see above):

```sh
npm install --no-save jsdom@<version>                  # Vitest
npx vitest run --environment jsdom

npm install --no-save jest-environment-jsdom@<version> # Jest
npx jest --env=jsdom
```

To choose the DOM with an environment variable instead (for example a CI
matrix), read one in the config. warpdom has no variable of its own for
this. The name `'warpdom'` here and below needs `vitest-environment-warpdom`
or `jest-environment-warpdom` (`warpdom migrate` adds it); without it, use
the path from [Setup](../README.md#setup).

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: process.env.TEST_DOM ?? 'warpdom' },
});
```

```js
// jest.config.js
module.exports = {
  testEnvironment: process.env.TEST_DOM ?? 'warpdom',
};
```

```sh
TEST_DOM=jsdom npm test
```

## Both side by side

**Before migrating**, `npx warpdom compare` runs your suite on its configured
DOM (jsdom or happy-dom) and on warpdom and lists every test whose result changes. It does not edit your
source or config; it writes its report to `.warpdom-compare/`
([compare.md](compare.md)). It needs a config that still picks
jsdom or happy-dom; on a project already switched to warpdom it stops with
"nothing to compare".

**After migrating**, run the same tests on both with two projects:

```js
// vitest.config.js (Vitest 3.2 and later; before, a vitest.workspace file)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'warpdom', environment: 'warpdom' } },
      { extends: true, test: { name: 'jsdom', environment: 'jsdom' } },
    ],
  },
});
```

```js
// jest.config.js
module.exports = {
  projects: [
    { displayName: 'warpdom', testEnvironment: 'warpdom' },
    { displayName: 'jsdom', testEnvironment: 'jsdom' },
  ],
};
```

`npx vitest run` and `npx jest` then run every test twice, once per DOM,
except files with an environment comment: they run on that environment in
both projects, and `warpdom migrate` set those comments to `warpdom`.
Remove the comment from the files you want on both DOMs.
One of them: `npx vitest run --project jsdom`, `npx jest --selectProjects
jsdom`.

## Undoing `warpdom migrate`

migrate only edits files; it installs nothing. By default it refuses to
run on a git working tree with uncommitted changes, so its edits can be
undone on their own.

Not committed yet:

```sh
git restore .
rm -rf .warpdom-migrate
npm install
```

Committed:

```sh
git revert <commit>
npm install
```

`.warpdom-migrate/` holds only the plan and is ignored by git; delete it.
Use your package manager's install command (`pnpm install`, `yarn`,
`bun install`) instead of `npm install`.

## Uninstalling

First set the environment back to jsdom or happy-dom everywhere (config, file
comments, scripts) and remove what still uses warpdom: imports such as
`warpdom/vitest/environment`, `warpdom/vitest/fast`, `warpdom/vitest/reset`
in configs and setup files, and `warpdom` in CI workflows. A config that
still imports warpdom fails to load once it is uninstalled. To find them:

```sh
grep -rn warpdom --exclude-dir=node_modules --exclude-dir=.git .
```

Then:

```sh
npm uninstall warpdom vitest-environment-warpdom   # Vitest
npm uninstall warpdom jest-environment-warpdom     # Jest
rm -rf .warpdom .warpdom-migrate .warpdom-compare
```

With pnpm, yarn or bun, use `pnpm remove`, `yarn remove` or `bun remove` with
the same package names, so their lockfile is updated too.

## A test that needs jsdom's behavior

If a test passes on jsdom and fails on warpdom, keep that file on jsdom
with the comment above, and please open an issue with the test (or a
small reproduction), the jsdom version and the error:
https://github.com/sonukapoor/warpdom/issues/new. warpdom aims for jsdom's
results, so such a difference is a bug unless it is one of the deliberate
differences listed in the README
([Differences from jsdom](../README.md#differences-from-jsdom)).
