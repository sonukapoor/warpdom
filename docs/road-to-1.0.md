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
  differences listed in [differences.md](differences.md). A test that
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
  options: `url`, `jsdom`, `cssstyle`, `fastFrames`, `xhr`, `beyondJsdom`
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

Status as of 2026-11-04 (warpdom 0.1.14 and main).

| # | Criterion | How it is checked | Status |
|---|---|---|---|
| 1 | warpdom has every interface and member jsdom has, for every modeled jsdom version | `test/jsdom-api-superset.test.js` in CI (#18); its allowlist (KNOWN) holds only differences listed in [differences.md](differences.md) | Met. The test passes with an empty KNOWN list (#70 and #71 fixed) |
| 2 | No open parity issue that is not either fixed or listed in [differences.md](differences.md) | Issues labeled `parity` | Not met. 21 open: [#97](https://github.com/sonukapoor/warpdom/issues/97), [#104](https://github.com/sonukapoor/warpdom/issues/104), [#105](https://github.com/sonukapoor/warpdom/issues/105), [#106](https://github.com/sonukapoor/warpdom/issues/106), [#111](https://github.com/sonukapoor/warpdom/issues/111), [#112](https://github.com/sonukapoor/warpdom/issues/112), [#113](https://github.com/sonukapoor/warpdom/issues/113), [#146](https://github.com/sonukapoor/warpdom/issues/146), [#147](https://github.com/sonukapoor/warpdom/issues/147), [#148](https://github.com/sonukapoor/warpdom/issues/148), [#187](https://github.com/sonukapoor/warpdom/issues/187), [#199](https://github.com/sonukapoor/warpdom/issues/199), [#203](https://github.com/sonukapoor/warpdom/issues/203), [#208](https://github.com/sonukapoor/warpdom/issues/208), [#224](https://github.com/sonukapoor/warpdom/issues/224), [#229](https://github.com/sonukapoor/warpdom/issues/229), [#234](https://github.com/sonukapoor/warpdom/issues/234), [#239](https://github.com/sonukapoor/warpdom/issues/239), [#249](https://github.com/sonukapoor/warpdom/issues/249), [#252](https://github.com/sonukapoor/warpdom/issues/252), [#253](https://github.com/sonukapoor/warpdom/issues/253). Most (all but [#146](https://github.com/sonukapoor/warpdom/issues/146), [#229](https://github.com/sonukapoor/warpdom/issues/229) and [#249](https://github.com/sonukapoor/warpdom/issues/249)) are narrow CSS or CSSOM differences in particular jsdom versions, found while fixing others. Also open: the WebIDL audit [#17](https://github.com/sonukapoor/warpdom/issues/17). Closed since 2026-10-28: #51 (#188), #136 (#180), #137, #144, #145 |
| 3 | On 25 or more open-source suites, no test differs from jsdom without an explanation in the README, on the release candidate <!-- proposal: 25 suites; Sonu to confirm --> | The corpus check (`corpus-timing` workflow, jsdom vs warpdom on each suite's own runner and jsdom), run for each release | Nearly met: 27 suites, against the threshold of 25. Every behavior change from 0.1.7 to 0.1.14 was checked on the 14 suites of the tuning corpus, the 9 held-out suites, Ant Design and Mantine (candidates), and Excalidraw and wire-webapp (applications), with no unexplained difference (release notes). The applications n8n, Grafana and Mattermost were also screened as candidates in dom-api-tracer's corpus: n8n 1.13x faster with 0 differences, Mattermost 1.09x with 0 differences, Grafana 1.79x with 2 speed-sensitive floating-ui focus races (in [differences.md](differences.md#results-that-change-for-other-reasons)) and one single-round SharedPreferences flake still under observation. Whether it is met depends on counting the 1.0 candidate run: left is to repeat the check on the 1.0 candidate |
| 4 | Web Platform Tests numbers published for the release, and every area where warpdom passes fewer subtests than jsdom has an issue | `wpt` workflow (18 test-DOM areas, monthly); README "Web Platform Tests" | Met. The run of 2026-11-02 (GitHub Actions run 41482079705): warpdom 75.7% against jsdom's 67.7% of 188,497 subtests, ahead or level in every area, behind in none. The two areas behind on 2026-10-19 are now ahead: `domparsing` 449 against 342 subtests, `html/semantics` 3,972 against 3,838 |
| 5 | Public API (above) frozen and typed | `npm run test:types` in CI; this page's list | Typed: met, with the Vitest `url` option in `WarpdomVitestOptions` (`types/vitest-options.d.ts`), checked in `test/types/vitest.ts`. Frozen from the release that meets criterion 6 |
| 6 | No breaking change in 3 consecutive minor releases spanning at least 6 weeks <!-- proposal: 3 releases, 6 weeks; Sonu to confirm --> | Release notes: a breaking change is a change to the public API above, as defined in [stability.md](stability.md) | Not met: the window is too short. Releases since 0.1.7 (2026-10-20): 0.1.8 on 2026-10-24, 0.1.9 on 10-25, 0.1.10 on 10-26, 0.1.11 on 10-28, 0.1.12 on 10-31, 0.1.13 on 11-03 and 0.1.14 on 11-04. None changed the public API in a breaking way. 0.1.14 removes the globals of interfaces a jsdom version does not have yet (#243), which brings results closer to jsdom's: "A fix that brings a result closer to jsdom's" is not breaking ([stability.md](stability.md#what-counts-as-a-breaking-change)); `beyondJsdom: true` keeps them. The six weeks from 0.1.8 end on 2026-12-05 |
| 7 | Documentation complete: setup, migration, options, differences from jsdom, stability policy, security policy | README, [api.md](api.md), [migrate.md](migrate.md), [compare.md](compare.md), [fast-mode.md](fast-mode.md), [stability.md](stability.md), [SECURITY.md](../SECURITY.md) | Met: [api.md](api.md#loaders-for-other-runtimes) describes `setXPathLoader` with `setParserLoader` and `setXmlParserLoader`, and the environments' `url` option |

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
