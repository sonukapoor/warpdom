# Road to 1.0

warpdom is at 0.1.x. This page says what 1.0 will mean, what has to be
true before it is released, how each point is checked, and where each
point stands today. How versions, jsdom, Node and the test runners are
supported is in [stability.md](stability.md).

## What 1.0 promises

1.0 is a promise, not a feature list:

- **Your tests get jsdom's results.** For a project on jsdom 20.0.3 or later,
  switching to warpdom changes no test's result, apart from the
  differences listed in the README ("Differences from jsdom"). A test that
  differs for another reason is a bug, fixed in a patch release.
- **Upgrades within 1.x do not break your setup.** The configuration,
  options, exports and types listed below keep working until 2.0. Changes
  that bring a result closer to jsdom's are bug fixes; each is listed in
  the release notes.
- **You can check before you switch, and switch back.** `warpdom compare`
  shows every test whose result differs; `warpdom migrate` makes the
  switch and can be reverted.

## The public API

What the promise covers from 1.0 (each typed in [types/](../types/), checked
by `npm run test:types`):

- The test environments: `warpdom/vitest/environment` (and
  `warpdom/vitest`), `warpdom/jest`, the companion packages
  `vitest-environment-warpdom` and `jest-environment-warpdom`, and their
  options: `url`, `jsdom`, `cssstyle`, `fastFrames`, `xhr`
  (`environmentOptions.warpdom` with Vitest, `testEnvironmentOptions` with
  Jest).
- `createWindow(options)` from `warpdom` with the same options, and
  `setParserLoader`, `setXmlParserLoader` and `setXPathLoader` for
  hosts other than Node ([api.md](api.md)).
- `warpdom compare` and `warpdom/compare`'s `compare(options)` and its
  result ([compare.md](compare.md)); `warpdom migrate` and
  `warpdom/migrate`'s `migrate(options)` and its result
  ([migrate.md](migrate.md)).
- Fast mode: `warpdom vitest`, `warpdom/vitest/fast` (`withFastMode`) and
  `warpdom/vitest/reset` ([fast-mode.md](fast-mode.md)).
- The jsdom versions warpdom models (20.0.3 to 30.1.3 today) and Node
  22.12 or later.

DOM behavior itself is jsdom's (per version), not a separate API: it
changes only toward jsdom's results or as listed in "Differences from
jsdom".

## Criteria

Status as of 2026-10-21 (warpdom 0.1.7 and main).

| # | Criterion | How it is checked | Status |
|---|---|---|---|
| 1 | warpdom has every interface and member jsdom has, for every modeled jsdom version | `test/jsdom-api-superset.test.js` in CI (#18); its allowlist (KNOWN) holds only differences listed in "Differences from jsdom" | Not met. The test passes; KNOWN has 5 entries, all tracked by open issues (#70, #71), none of them listed as a deliberate difference yet |
| 2 | No open parity issue that is not either fixed or listed in "Differences from jsdom" | Issues labeled `parity` | Not met. Open: [#51](https://github.com/sonukapoor/warpdom/issues/51), [#70](https://github.com/sonukapoor/warpdom/issues/70), [#71](https://github.com/sonukapoor/warpdom/issues/71), [#76](https://github.com/sonukapoor/warpdom/issues/76), [#84](https://github.com/sonukapoor/warpdom/issues/84), [#90](https://github.com/sonukapoor/warpdom/issues/90), [#97](https://github.com/sonukapoor/warpdom/issues/97), [#98](https://github.com/sonukapoor/warpdom/issues/98); the WebIDL audit [#17](https://github.com/sonukapoor/warpdom/issues/17) |
| 3 | On 25 or more open-source suites, no test differs from jsdom without an explanation in the README, on the release candidate <!-- proposal: 25 suites; Sonu to confirm --> | The corpus check (`corpus-timing` workflow, jsdom vs warpdom on each suite's own runner and jsdom), run for each release | Met for 0.1.7 (22 suites plus Ant Design, Mantine, Excalidraw and wire-webapp; release notes). To be repeated on the 1.0 candidate |
| 4 | Web Platform Tests numbers published for the release, and every area where warpdom passes fewer subtests than jsdom has an issue | `wpt` workflow (17 test-DOM areas, monthly); README "Web Platform Tests" | Met: 75.4% vs jsdom's 72.2% (run of 2026-10-19); the one area behind, `html/semantics`, has #51 |
| 5 | Public API (above) frozen and typed | `npm run test:types` in CI; this page's list | Typed today; frozen from the release that meets criterion 6 |
| 6 | No breaking change in 3 consecutive minor releases spanning at least 6 weeks <!-- proposal: 3 releases, 6 weeks; Sonu to confirm --> | Release notes: a breaking change is a change to the public API above, as defined in [stability.md](stability.md) | Not met. 0.1.7 changed a default (`XMLHttpRequest` on, `xhr: false` to keep the old behavior) |
| 7 | Documentation complete: setup, migration, options, differences from jsdom, stability policy, security policy | README, [api.md](api.md), [migrate.md](migrate.md), [compare.md](compare.md), [fast-mode.md](fast-mode.md), [stability.md](stability.md), [SECURITY.md](../SECURITY.md) | Nearly met with this page, stability.md and SECURITY.md: `setXPathLoader` is described only in its type |
| 8 | At least 1 project outside the measured corpus runs its tests on warpdom on its main branch <!-- proposal: 1 project; Sonu to confirm --> | A merged change in that project's repository, linked here | Not met |

Not required for 1.0: the opt-in web APIs jsdom lacks (#5 to #12, #35;
milestone M2), and turning them on by default (M3). After 1.0, turning
them on by default for existing projects is a breaking change and waits
for 2.0, unless it stays opt-in or limited to new jsdom profiles.

## How this maps to the plan

[PLAN.md](../PLAN.md) has the milestones. 1.0 needs M1 (parity with jsdom:
criteria 1 to 4) and the release and security parts of M6 (criteria 5 to
7). Criterion 8 is the first step of M4 (adoption), whose own exit is ten
well-known projects. M2, M3 and M5 do not block 1.0.
