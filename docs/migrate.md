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
afterwards). The folder ignores itself: migrate writes a `.gitignore`
containing `*` into it, so `git add -A` never commits the plan, and the
project's own `.gitignore` is not touched (editing it would be a change of
its own to review and commit, also after a dry run, which changes
nothing else). The plan stays where the console output points, next to
the project, rather than in a temporary directory where it is easily
lost. Exit code 0 when the plan was made or applied, 2 when it could not
be (no package.json).

To undo a migration, or to run single files or single runs on jsdom
again: [switching-back.md](switching-back.md).

**Run `warpdom compare` before migrating.** It runs the suite on jsdom (or
happy-dom) and on warpdom and lists every test whose result changes; it
needs jsdom still installed, which stops being true after the migration and
`pnpm install`. After the migration, `warpdom compare --baseline jsdom`
compares again once jsdom is installed
([switching-back.md](switching-back.md#both-side-by-side)).

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
- Vitest's `environmentOptions.jsdom` when it holds only a `url` (`{ jsdom:
  { url: 'http://localhost' } }`) and the environment beside it is changed:
  the key becomes `warpdom`, which warpdom's Vitest environment reads
  (`environmentOptions.warpdom.url`, default `http://localhost:3000` as with
  Vitest's jsdom environment). Other jsdom options, or an environment that
  stays as it is, are listed instead. Jest's `testEnvironmentOptions.url`
  needs nothing: warpdom's Jest environment reads it (default
  `http://localhost/`, as jest-environment-jsdom).

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
- `@types/jsdom` goes with jsdom when no type reference to jsdom is left;
  else it stays, listed as kept with the references. Type references are
  `import type ... from 'jsdom'`, `import { type A, type B } from 'jsdom'`
  (every name a type), `export type ... from 'jsdom'`, `typeof
  import('jsdom')` and `import('jsdom').Name`, any reference in a `.d.ts`
  file, `/// <reference types="jsdom" />` and a tsconfig `"types"` list
  naming jsdom. They never load jsdom, so they do not keep it (they keep
  compiling against @types/jsdom); each is listed under "type references"
  with the DOM lib type to use instead (`DOMWindow` -> `Window`). When jsdom
  stays for other reasons, @types/jsdom stays with it. happy-dom ships its
  own types, so any reference to happy-dom keeps it.
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
  guess. The packages such a config needs stay until it is done. A Jest
  `preset` is looked up first: an installed preset's `jest-preset.json` /
  `.js` / `.cjs` is read as text (not run) for its `testEnvironment`, and a
  few presets are known when not installed (`jest-puppeteer`,
  `jest-playwright-preset`: Node-based). A Node environment
  (`jest-environment-puppeteer`, or none, Jest's default `node`) gives a
  note and no manual item, so it keeps nothing; a jsdom one gives a manual
  item that says so.
- **To review**: every line that mentions jsdom or happy-dom and was not
  changed, grouped (setup files and polyfills first, then configs, console
  filters, direct uses, type references, source, tests, CI, docs), each
  with a short hint:
  a jsdom-only workaround that warpdom may not need; a console filter for
  jsdom's "Not implemented" messages (warpdom prints the same); a
  user-agent check (warpdom's user agent contains `jsdom/` like jsdom's,
  so it keeps matching); options for jsdom that warpdom does not read
  (`environmentOptions.jsdom`, `testEnvironmentOptions.pretendToBeVisual`);
  `new JSDOM(...)` lines with their warpdom equivalent.
- **Jest transform allowlists**: entries of a Jest config's
  `transformIgnorePatterns` allowlist (array strings such as `'parse5'`, or
  names inside a `node_modules/(?!...)` pattern) that name jsdom or a
  package jsdom (or its cssstyle) loads, from an explicit list: `jsdom`,
  `cssstyle`, `parse5`, `entities`, `nwsapi`, `tough-cookie`, `data-urls`,
  `whatwg-url`, `whatwg-encoding`, `whatwg-mimetype`, `webidl-conversions`,
  `w3c-xmlserializer`, `xml-name-validator`, `saxes`, `symbol-tree`,
  `html-encoding-sniffer`, `rrweb-cssom`, `is-potential-custom-element-name`
  and the scopes `@asamuzakjp`, `@exodus`, `@csstools` (not `whatwg-fetch`
  or `ws`, which other packages need too). Projects added them for the ESM
  jsdom 27 and later bring; warpdom's Jest environment is loaded by Jest
  outside the transformed test code, so they can go once nothing Jest runs
  imports jsdom. Each is listed with what the lockfile (or node_modules)
  says: whether another package depends on it (parse5 through
  hast-util-raw, say), and which file still imports jsdom inside Jest.
  They are never edited: the list is often built in code (a const array
  joined into a pattern), and removing an entry that another ESM
  dependency still needs makes every test file that loads it fail, while
  leaving one costs only transform time.
- **Direct uses of jsdom**: code that imports jsdom itself (a script, a
  site plugin, a test helper) keeps jsdom, with the warpdom equivalent:
  `import { createWindow } from 'warpdom'`; `new JSDOM(html, { url })` ->
  `const window = createWindow({ url })`, then
  `window.document.documentElement.innerHTML = html` or
  `window.document.write(html)`; `dom.window` -> that window; parsing only
  -> `new window.DOMParser().parseFromString(html, 'text/html')`. When such
  a file runs inside Jest (a test, a Jest setup file, a helper under a test
  directory), the plan says that Jest's module sandbox loads warpdom
  through its CommonJS entry, which requires warpdom >= 0.1.5; in a
  TypeScript project, that warpdom >= 0.1.5 ships type declarations.
- **Installed through other packages**: where jsdom stays in the install
  without being a direct dependency, in one line each: Vitest lists jsdom
  and happy-dom as optional peers; Jest 27's jest-config and jest-runner
  depend on jest-environment-jsdom; and every copy of jsdom or happy-dom
  the lockfile (else node_modules) still installs, with the shortest chain
  from one of the project's dependencies (`jsonml.js@0.1.0 ->
  jsdom@8.5.0`, also through the other dependencies that bring it) and
  whether a test, setup file or test config names a package of it (a
  transform such as `./node_modules/@ant-design/tools/...` may load it;
  no test environment does once migrated). Without a lockfile and
  node_modules the plan says so and gives the command that lists them
  (`npm ls jsdom`).
- **Other projects**: directories with their own package.json that are not
  workspace packages (examples, templates) are not changed; their uses are
  listed, to run migrate there. Uses under `fixtures/` directories are
  skipped.
- **Ignored files** are not read at all: in a git repository what `git
  ls-files --others --ignored --exclude-standard --directory` lists (every
  .gitignore, .git/info/exclude, the global excludes; tracked files are
  always read), else the .gitignore files themselves. Generated files such
  as `.dumi/tmp/appData.json` repeat the package.json and are not the
  project's code.
- **Warnings**: a dirty git tree (so the diff can be reviewed on its own),
  a Node version below 22.12 pinned in `.nvmrc` / `.node-version`, Vitest
  before 2 or Jest before 27.

## jsdom version

warpdom behaves like the jsdom version it finds installed (through
jest-environment-jsdom for Jest), because suites encode the behavior of
their jsdom. Once migrate removes jsdom, warpdom follows its default: the
newest jsdom it models (30.1.2) for Vitest, jsdom 26 for Jest.

The plan says, per runner and package, which jsdom (and cssstyle) the
tests ran on before and what warpdom will follow after, with the pin when
there is one:

```
Jest (package.json): the tests ran on jsdom 26.1.0 + cssstyle 4.6.0 (through jest-environment-jsdom 30.5.2); warpdom will follow jsdom 26 with the newest cssstyle 4.x it models, its default once jest-environment-jsdom is removed (the same profile)
Vitest (package.json): the tests ran on jsdom 30.1.3 (package-lock.json); warpdom will follow the installed jsdom (30.1.3): it stays a dependency (see Kept), and warpdom follows it while it is installed (the same profile)
```

So that every migrated project keeps exactly its current jsdom behavior,
migrate pins the version it removes whenever that version would give a
different profile than the default (installed version, else the
lockfile's, else the declared range: `^26.1.0` pins `26`). For jsdom 28
and earlier, whose behavior also depends on the cssstyle they load, the
installed (or locked) cssstyle is pinned with it when it gives another
profile than the one warpdom assumes for that jsdom (jsdom 26 with
cssstyle 4.2.1: `{ jsdom: '26.1.0', cssstyle: '4.2.1' }`). It writes it in
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

Both come from the environments migrate changed, not from what is
installed: a happy-dom (or `@happy-dom/jest-environment`) that no test
used gets no note, and a jsdom that no test used (every test on
happy-dom) is not pinned. This is per package and runner: a jsdom that
only Jest's tests ran on (through `jest-environment-jsdom`) or only the
tests of another package ran on is not pinned in a Vitest config whose
tests ran on happy-dom. When migrate changed no environment of a runner in
a package (for example Vitest already on warpdom), a removed jsdom is
pinned or noted as above, and Vitest and Jest in one package each keep
their own version. Tests already on warpdom (`'warpdom'`, the
`vitest-environment-warpdom` or `jest-environment-warpdom` name, a path
into warpdom, an `environment` imported from `warpdom/vitest/environment`)
count as tests on jsdom, since warpdom follows the jsdom it finds
installed: with Vitest
already on warpdom and one file still choosing happy-dom, removing jsdom
still gets its note (the happy-dom note as well); with no environment
literal changed in a config, the note says to add the version by hand.
An environment already on warpdom that the pin does not reach (another
inline Vitest or Jest project in the same config) gets its own note to add
the version next to it, and the profile is not reported as kept. Not
counted: a warpdom environment whose options name a jsdom version
(`environmentOptions.warpdom.jsdom`, `testEnvironmentOptions.jsdom`), which
warpdom follows instead of the installed jsdom, and warpdom environments in
fixture directories, which migrate does not change.

A test file that picks warpdom (or jsdom, which migrate changes to
warpdom) with a `@vitest-environment` comment takes the options of the
Vitest project that runs it. migrate finds that project the way Vitest
does: the nearest Vitest config from the file's directory up, then, when
it has inline `test.projects` (or `test.workspace`), every project whose
`root`, `test.dir`, `test.include` and `test.exclude` select the file
(Vitest's defaults when they are not set; `...configDefaults.include` /
`exclude` are read as those defaults), else the config itself. A file whose
projects all name a jsdom version does not count; a project that runs a
commented file and that the pin does not reach gets a note listing the
files, to add the version to that project's test options by hand, and
the profile is not reported as kept. When migrate cannot tell the project
(a workspace file or projects named by path or glob, `--config` in a
script, a merged or spread config, `extends`, include or exclude globs
that are not string literals or use negations, no project selecting the
file), the profile is reported as uncertain (`same: null`) and one note
lists the files, rather than assuming the pin reaches them.
`@jest-environment` comments still count for their package and runner.

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
- Environments inherited from a package (kcd-scripts, a company preset)
  are reported, not set. The one exception is a Jest `preset`, whose
  installed `jest-preset` file is read as text (see Manual); other
  packages' code is not read or run.
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
| ant-design (dry run, 2026-10-18, master @ 3fb9b07514; [#39](https://github.com/sonukapoor/warpdom/issues/39)) | .jest.js and vitest.config.ts environments; `environmentOptions.jsdom.url` moved to `environmentOptions.warpdom.url`; jest-environment-jsdom removed (the jest-puppeteer preset is Node-based); jsdom and @types/jsdom kept for three runtime uses, each listed with its createWindow equivalent and the CommonJS-entry note for the Jest helper; the two `import type { DOMWindow }` lines listed as type references; six jsdom-only transformIgnorePatterns entries listed; the git-ignored .dumi/tmp/appData.json not read; with a lockfile, jsonml.js@0.1.0 -> jsdom@8.5.0 reported | the hand migration also rewrote the three runtime uses and the type references |
| element-plus (dry run, jsdom 16) | vitest.config.mts, two `@vitest-environment happy-dom` comments; jsdom and happy-dom removed; `environmentOptions: { warpdom: { jsdom: '16.4.0' } }` added after the environment | no hand-made branch |
