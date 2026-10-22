# Stability and support

How warpdom versions its releases, what it supports, and how changes are
announced. What has to be true before 1.0: [road-to-1.0.md](road-to-1.0.md).

## Versions

**Before 1.0 (now, 0.x).** A minor or patch release may change behavior
when the change brings warpdom's results closer to jsdom's, and may
change a default (0.1.7 put `XMLHttpRequest` on the window, with
`xhr: false` to keep the earlier behavior). Every such change is in the
release notes: changes to options, defaults or exports under
"Behavior change", changes toward jsdom's results under "Other behavior
changes".

**From 1.0.** Semantic versioning. A breaking change only in a major
release; new options, exports and modeled jsdom versions in minor
releases; fixes in patch releases.

## What counts as a breaking change

From 1.0, a breaking change is one that can make a working setup fail or
change results for reasons other than jsdom's:

- Removing or renaming an export, entry point, CLI command or flag, or an
  option of the environments or of `createWindow`, `compare` or `migrate`
  (the list is in [road-to-1.0.md](road-to-1.0.md), "The public API").
- Changing an option's default, or the meaning of a value.
- Changing a published type in a way that rejects code that compiled
  before.
- Dropping a jsdom version from the modeled range (20.0.3 to the newest
  modeled), or a Node, Vitest or Jest version from the supported ones
  below.
- A new deliberate difference from jsdom that changes test results.

Not breaking:

- **A fix that brings a result closer to jsdom's** for the jsdom version
  a project uses. Matching jsdom is the product; a test that relied on the
  old result relied on a bug. Such fixes ship in minor or patch releases,
  each listed in the release notes with the jsdom versions it applies to,
  and checked on the corpus before the release (each release's notes say
  which suites were run and what changed).
- A newly modeled jsdom version, new web APIs behind an opt-in, faster
  code, new exports or options.

## jsdom versions

warpdom models jsdom 20.0.3 to 30.1.3 (`NEWEST_MODELED_JSDOM` in
[src/window-features.js](../src/window-features.js)) and follows the jsdom
(and, for jsdom 26 and earlier, the cssstyle) each project installs, or the
version set with the `jsdom` option.

- **A newer jsdom installed** (a later minor or major release): tests get
  the newest modeled version's behavior, and warpdom prints a warning once.
- **Upstream watch**: a weekly workflow
  ([upstream-watch.yml](../.github/workflows/upstream-watch.yml)) opens an
  issue when jsdom releases a version newer than the newest modeled one.
  Modeling it (its observable changes measured black box, the corpus run
  on it) ships in a minor release; the aim is within 4 weeks of the
  jsdom release. <!-- proposal: 4 weeks; Sonu to confirm -->
- **Older than 20**: not modeled, best effort. Projects on jsdom 16 to 19
  (handsontable, Element Plus) get the behavior of the version checks
  warpdom has: mostly jsdom 20's, plus the few older differences measured
  so far (before 16.5.2, a click on a detached checkbox or radio also fires
  input and change). Differences there are tracked (for example #14) but
  are not covered by the promise.

## Node versions

Node 22.12 or later (`engines` in package.json). CI runs every pull request
and push to main on Node 22.22 and 24 (the oldest Node 22 that jsdom 30
and its undici declare support for, and the current LTS). Node 22.12 to
22.21 is the stated minimum but not run in CI; reports for it are
accepted. From 1.0, raising the minimum Node version is a breaking change.

## Test runners

Vitest 2 or later (tested with 2, 3, 4 and 5); fast mode needs Vitest 3.2
or later. Jest 27 or later (tested with 27 and 30). A new major release of
either is added in a minor release of warpdom; dropping one is a breaking
change from 1.0.

## Deprecation

From 1.0, a part of the public API is removed only in a major release,
after it has been deprecated:

1. The release notes and the docs mark it deprecated and name the
   replacement.
2. Using it prints a warning once per process (where it is used at run
   time), naming the replacement.
3. It keeps working for at least 2 minor releases and 3 months after the
   release that deprecated it, and is removed in the next major release
   after that. <!-- proposal: 2 minor releases, 3 months; Sonu to confirm -->

## Security fixes

Only the latest minor release gets security fixes; see
[SECURITY.md](../SECURITY.md).
