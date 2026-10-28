# Road to 1.0

warpdom is at 0.1.x. This page says what 1.0 will mean, what has to be
true before it is released, how each point is checked, and where each
point stands today. How versions, jsdom, Node and the test runners are
supported is in [stability.md](stability.md).

## What 1.0 promises

1.0 is a promise, not a feature list:

- **Your tests get jsdom's results.** For a project on a jsdom version
  warpdom models (20.0.3 to 30.1.3 today; newer and older versions are in
  [stability.md](stability.md#jsdom-versions)),
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

Status as of 2026-10-28 (warpdom 0.1.11 and main).

| # | Criterion | How it is checked | Status |
|---|---|---|---|
| 1 | warpdom has every interface and member jsdom has, for every modeled jsdom version | `test/jsdom-api-superset.test.js` in CI (#18); its allowlist (KNOWN) holds only differences listed in "Differences from jsdom" | Met. The test passes with an empty KNOWN list (#70 and #71 fixed) |
| 2 | No open parity issue that is not either fixed or listed in "Differences from jsdom" | Issues labeled `parity` | Not met. Open: [#51](https://github.com/sonukapoor/warpdom/issues/51), [#97](https://github.com/sonukapoor/warpdom/issues/97), [#104](https://github.com/sonukapoor/warpdom/issues/104), [#105](https://github.com/sonukapoor/warpdom/issues/105), [#106](https://github.com/sonukapoor/warpdom/issues/106), [#111](https://github.com/sonukapoor/warpdom/issues/111), [#112](https://github.com/sonukapoor/warpdom/issues/112), [#113](https://github.com/sonukapoor/warpdom/issues/113), [#136](https://github.com/sonukapoor/warpdom/issues/136), [#137](https://github.com/sonukapoor/warpdom/issues/137), [#144](https://github.com/sonukapoor/warpdom/issues/144), [#145](https://github.com/sonukapoor/warpdom/issues/145), [#146](https://github.com/sonukapoor/warpdom/issues/146), [#147](https://github.com/sonukapoor/warpdom/issues/147), [#148](https://github.com/sonukapoor/warpdom/issues/148), [#187](https://github.com/sonukapoor/warpdom/issues/187); the WebIDL audit [#17](https://github.com/sonukapoor/warpdom/issues/17). Fixed since 0.1.7: #70, #71, #76, #84, #90, #98. Pull requests open for [#51](https://github.com/sonukapoor/warpdom/issues/51) (#188) and [#136](https://github.com/sonukapoor/warpdom/issues/136) (#180). Most open issues are narrow version-specific CSS differences found while fixing others |
| 3 | On 25 or more open-source suites, no test differs from jsdom without an explanation in the README, on the release candidate <!-- proposal: 25 suites; Sonu to confirm --> | The corpus check (`corpus-timing` workflow, jsdom vs warpdom on each suite's own runner and jsdom), run for each release | Met for 0.1.7 to 0.1.11 (19 suites in the corpus plus Ant Design, Mantine, Excalidraw and wire-webapp, on every behavior change; release notes). To be repeated on the 1.0 candidate |
| 4 | Web Platform Tests numbers published for the release, and every area where warpdom passes fewer subtests than jsdom has an issue | `wpt` workflow (17 test-DOM areas, monthly); README "Web Platform Tests" | Not met. Last run 2026-10-19: 75.4% vs jsdom's 72.2%, with two areas behind: `html/semantics` (3,498 vs 3,822 subtests) and `domparsing` (341 vs 342, both 30.3%; no issue yet). Since then #75 fixed ten of #51's eleven subtests and #188 fixes the last one; a new run is needed to publish current numbers |
| 5 | Public API (above) frozen and typed | `npm run test:types` in CI; this page's list | Nearly met: typed except the Vitest `url` option (read in `src/vitest.js`, missing from `WarpdomVitestOptions` in `types/vitest-options.d.ts`); frozen from the release that meets criterion 6 |
| 6 | No breaking change in 3 consecutive minor releases spanning at least 6 weeks <!-- proposal: 3 releases, 6 weeks; Sonu to confirm --> | Release notes: a breaking change is a change to the public API above, as defined in [stability.md](stability.md) | Not met. 0.1.8 to 0.1.11 (2026-10-24 to 2026-10-28) changed no public API, but the window is 4 days, not 6 weeks. 0.1.7 changed a default (`XMLHttpRequest` on, `xhr: false` to keep the old behavior) |
| 7 | Documentation complete: setup, migration, options, differences from jsdom, stability policy, security policy | README, [api.md](api.md), [migrate.md](migrate.md), [compare.md](compare.md), [fast-mode.md](fast-mode.md), [stability.md](stability.md), [SECURITY.md](../SECURITY.md) | Nearly met with this page, stability.md and SECURITY.md: `setXPathLoader` is described only in its type |

Goals after 1.0, not criteria for it: projects outside the measured corpus
running their tests on warpdom (M4, adoption). Maintainers have said they
would wait for 1.0 before switching, so 1.0 depends only on the criteria
above, which warpdom controls.

Not required for 1.0: the opt-in web APIs jsdom lacks (#5 to #12, #35;
milestone M2), and turning them on by default (M3). After 1.0, turning
them on by default for existing projects is a breaking change and waits
for 2.0, unless it stays opt-in or limited to new jsdom profiles.

## How this maps to the plan

[PLAN.md](../PLAN.md) has the milestones. 1.0 needs M1 (parity with jsdom:
criteria 1 to 4) and the release and security parts of M6 (criteria 5 to
7). Adoption (M4, whose exit is ten well-known projects) follows 1.0.
M2, M3 and M5 do not block 1.0.
