# `warpdom migrate`

Moves a project's tests from jsdom or happy-dom to warpdom: the same edits
a maintainer would make by hand, made exactly and reviewably, so that
trying warpdom takes minutes. Code in `src/migrate/` (Node only; also
exported as `warpdom/migrate`).

## Usage

```sh
npx warpdom compare            # first: your tests on jsdom and on warpdom
npx warpdom migrate --dry-run  # prints the plan, changes nothing
npx warpdom migrate            # makes the changes
pnpm install                   # or npm / yarn / bun: migrate does not install
```

Run it at the root of the project (in a monorepo, at the repository root:
every workspace package is migrated in one go).

| Option | Meaning |
|---|---|
| `--dry-run` | Print the plan and write `.warpdom-migrate/plan.md`; change nothing |
| `--force` | Make the changes even when the git working tree has uncommitted changes (by default migrate stops, so its changes can be reviewed and undone on their own) |
| `--json` | Print the plan as JSON instead of text |
| `--no-keep-jsdom-version` | Do not pin the removed jsdom version in the config (pinned by default when it differs from warpdom's default; see "jsdom version" below) |
| `--offline` | Do not ask the npm registry for the latest versions and their publication dates |
| `-h`, `--help` | Help |

Both modes write the plan to `.warpdom-migrate/plan.md` (it can be deleted
afterwards). Exit code 0 when the plan was made or applied, 2 when it could
not be (no package.json).

**Run `warpdom compare` before migrating.** It runs the suite on jsdom (or
happy-dom) and on warpdom and lists every test whose result changes; it
needs jsdom still installed, which stops being true after the migration and
`pnpm install`.

## What it changes

Every place that picks jsdom or happy-dom, each with a text edit of exactly
the literal involved (quotes, comments and formatting stay as they were):

- Vitest: `test.environment` in `vitest.config.*` / `vite.config.*` and in
  the files they import with a relative path (shared configs), in inline
  `projects` arrays, in `vitest.workspace.*` / `vitest.projects.*` files and
  the project configs they name, and in `environmentMatchGlobs`.
  `'jsdom'` and `'happy-dom'` become `'warpdom'`; in a condition such as
  `jsdom ? 'jsdom' : 'node'` only the result literal changes.
- Jest: `testEnvironment` in `jest.config.*`, in configs named by
  `--config` in package.json scripts, and in package.json `"jest"`
  (`jsdom`, `jest-environment-jsdom`, `happy-dom`,
  `@happy-dom/jest-environment` become `warpdom`).
- Per-file comments: `@vitest-environment` and `@jest-environment` in the
  leading comments of test files (a comment after code is not a docblock
  and is left alone). `@jest-environment-options` lines are kept.
- Scripts: `--environment jsdom`, `--environment=happy-dom`, `--env=jsdom`,
  `--testEnvironment jsdom` in package.json scripts that run Vitest, Jest,
  react-scripts or craco.
- A constant of the same file used only as an environment
  (`const env = 'jsdom'; ... environment: env`) is changed where it is
  declared.

Dependencies:

- `warpdom` and `vitest-environment-warpdom` (Vitest) or
  `jest-environment-warpdom` (Jest) are added to the package.json where the
  old DOM package was declared (the nearest one up from the config; in a
  monorepo whose jsdom is a root dev dependency, the root), in the same
  section, with the same version style (`^0.1.3`, an exact `0.1.3`, or
  `catalog:` with the entries added to the pnpm catalog: at the end of its
  testing group when a comment such as `# Testing` marks one, else where
  the old entry was, with its quoting). Entries go in sorted position when
  the list is sorted, else at its end. Versions: the registry's latest,
  else the ones this warpdom ships with.
- `@types/jsdom` stays and is listed as kept: it can go once no code
  imports jsdom's types and no tsconfig `"types"` list names jsdom.
- `jsdom`, `happy-dom`, `jest-environment-jsdom`,
  `@happy-dom/jest-environment`, `global-jsdom` and `jsdom-global` are
  removed when nothing still needs them. A package keeps them, with the
  reason in the plan, when: code of the package imports or requires them
  (or names them as a module in a mock, a config string or a script flag
  such as `-r jsdom-global/register`), checked after migrate's own edits; a
  manual item (below) of the package still uses a DOM environment; another
  kept package needs them as a peer (`global-jsdom` needs `jsdom`); they
  are runtime `dependencies` of a published package, or `peerDependencies`
  / `optionalDependencies`. A pnpm catalog entry is removed only when no
  package refers to it any more.
- Nothing is installed: the plan ends with the install command for the
  detected package manager.

Running migrate again changes nothing: there is no DOM environment left,
and the packages are already in place.

## What it reports (and does not change)

- **Manual**: environments it cannot edit exactly. A computed value
  (`environment: pickEnvironment(process.env)`), a value from a parameter
  or another module, a constant also used for other things, a comparison
  (`env === 'jsdom' ? ...`), or a Jest config that sets no
  `testEnvironment` but takes its options from a package (`...base`,
  `Object.assign(require('kcd-scripts/jest'), ...)`, a `preset`) whose
  environment may be jsdom. Each with its file and line; migrate does not
  guess. The packages such a config needs stay until it is done.
- **To review**: every line that mentions jsdom or happy-dom and was not
  changed, grouped (setup files and polyfills first, then configs, console
  filters, direct uses, source, tests, CI, docs), each with a short hint:
  a jsdom-only workaround that warpdom may not need; a console filter for
  jsdom's "Not implemented" messages (warpdom prints the same); a
  user-agent check (warpdom's user agent contains `jsdom/` like jsdom's,
  so it keeps matching); options for jsdom that warpdom does not read
  (`environmentOptions.jsdom`, `testEnvironmentOptions.pretendToBeVisual`).
- **Installed through other packages**: where jsdom stays in the install
  without being a direct dependency, in one line each: Vitest lists jsdom
  and happy-dom as optional peers; Jest 27's jest-config and jest-runner
  depend on jest-environment-jsdom; other packages from the lockfile
  (for example jest-preset-angular). They are not loaded by tests once no
  config or comment names jsdom.
- **Other projects**: directories with their own package.json that are not
  workspace packages (examples, templates) are not changed; their uses are
  listed, to run migrate there. Uses under `fixtures/` directories are
  skipped.
- **Warnings**: a dirty git tree (so the diff can be reviewed on its own),
  a Node version below 22.12 pinned in `.nvmrc` / `.node-version`, Vitest
  before 2 or Jest before 27.

## jsdom version

warpdom behaves like the jsdom version it finds installed (through
jest-environment-jsdom for Jest), because suites encode the behavior of
their jsdom. Once migrate removes jsdom, warpdom follows its default: the
newest jsdom it models (30.1.2) for Vitest, jsdom 26 for Jest.

So that every migrated project keeps exactly its current jsdom behavior,
migrate pins the version it removes whenever that version would give a
different profile than the default (installed version, else the
lockfile's, else the declared range: `^26.1.0` pins `26`). It writes it in
the most local place, next to the environment it changed, and says why in
the plan:

```js
// Vitest
test: { environment: 'warpdom', environmentOptions: { warpdom: { jsdom: '26.1.0' } } }
// Jest
testEnvironment: 'warpdom', testEnvironmentOptions: { jsdom: '20.0.3' },
```

An options object that is already there gets the version as its first
property (`environmentOptions.warpdom` is created inside an existing
`environmentOptions`); one that already names a jsdom version is left as
it is and reported. When the removed version is the one warpdom assumes
anyway (jsdom 30.1.2 or later with Vitest, 26 with Jest), nothing is
written. `--no-keep-jsdom-version` leaves the version out and only reports
it. happy-dom suites get a note instead: warpdom behaves like jsdom, so
`warpdom compare --baseline happy-dom` shows what changes.

## Release-age settings

Package managers can refuse versions younger than a minimum age. migrate
reads pnpm's `minimumReleaseAge` (pnpm-workspace.yaml or .npmrc) and its
exclusions, yarn's `npmMinimalAgeGate`, bun's `install.minimumReleaseAge`
and npm's `min-release-age` / `before`, asks the registry when each new
package was published, and prints the date from which the install works
(or that the package is excluded). Offline it warns without a date.

## Package managers and workspaces

The package manager comes from package.json `packageManager`, else the
lockfile (pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lock).
Workspaces from pnpm-workspace.yaml, package.json `workspaces` or
lerna.json. Versions shown for the runners and jsdom come from
node_modules when installed, else from the lockfile (pnpm, npm, yarn
classic and berry), else from package.json (catalog references resolved).

## Limits

- Text-based: migrate reads configs as text with a small scanner (no
  evaluation, no new dependency). Anything that is not a literal at the
  place it is used goes to "manual"; it does not follow values across
  modules other than relative imports of config files.
- Environments inherited from a package (kcd-scripts, jest-preset-angular,
  a company preset) are reported, not set: migrate does not read other
  packages' code to find out what they choose.
- Custom environments (`testEnvironment: './my-env.js'` extending
  jest-environment-jsdom) stay; their import keeps jest-environment-jsdom
  and is listed.
- Comments and docs that mention jsdom are listed, never rewritten.
- package.json dependency lists written on one line are not edited (listed
  as manual).
- A config inside a directory that is neither the root nor a workspace
  package (an example app) is left to a separate run there.

## Measured against hand-made migrations (2026-10-17)

The same projects were migrated by hand first (branch
`test/warpdom-environment` of each, all tests keeping their results), then
with `migrate` from the parent commit; lockfiles ignored. The hand
changes did not pin the jsdom version; migrate does by default, so every
project below except material-ui (jsdom 30.1.2) and handsontable's Angular
wrapper (jsdom 26) also gets one `environmentOptions` /
`testEnvironmentOptions` line next to its environment.

| Project | Matched | Missed or different |
|---|---|---|
| radix-ui/primitives | vitest.config.mts environment; package.json (- jsdom, + warpdom, + vitest-environment-warpdom) | a comment in scripts/setup-tests.ts reworded by hand (listed under setup files) |
| floating-ui | 5 vite.config.mts environments; root package.json | two test comments reworded by hand (listed) |
| downshift | other/misc-tests/jest.config.js; package.json additions | root jest.config.js inherits jsdom from kcd-scripts/jest: listed as manual (the hand change added `testEnvironment: 'warpdom'`); a comment in other/ssr/jest.config.js (listed) |
| vuetify | packages/vuetify/vitest.config.ts; package.json catalog entries; pnpm catalog (in the `# Testing` group) | catalog entries at the end of the testing group (after the browser-testing entries) rather than after timezone-mock; jsdom 27.2.0 pinned next to the environment (not in the hand change); SKILL.md and a setup comment reworded by hand (listed) |
| material-ui | vitest.shared.mts (`jsdom ? 'warpdom' : 'node'`); root package.json with exact versions | nothing |
| handsontable (dry run) | 4 Jest configs (one in package.json); 4 package.json files | root jsdom and global-jsdom kept because scripts/verify-bundles.mjs imports them (the hand change rewrote that script); jsdom 16.7.0 pinned in the three Jest 27 configs; the removed jsdom workarounds and polyfills are listed for review, not removed |
| element-plus (dry run, jsdom 16) | vitest.config.mts, two `@vitest-environment happy-dom` comments; jsdom and happy-dom removed; `environmentOptions: { warpdom: { jsdom: '16.4.0' } }` added after the environment | no hand-made branch |
