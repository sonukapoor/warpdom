# Commit map

Before publication, the history of this repository was consolidated into
milestone commits. Each milestone commit keeps the original author and
committer dates of the last commit it contains. The draft paper files
(docs/research/paper.md, paper-outline.md, revision-plan.md and paper-kit/)
were removed from every commit, and three lines that named local tooling were
reworded (.gitignore, docs/brand/source/build.py, a release step in PLAN.md).

Measurements, archived run data (JSON, CSV, TSV, archives), file and
directory names, and some scripts name warpdom commits by their
pre-consolidation hashes. This table maps them to the commits in this
history. The prose in README.md, PLAN.md and the Markdown files under docs/
uses the new hashes where the relation is "same tree".

- **same tree**: the new commit has exactly the code that was measured, apart
  from the removed draft paper files and the three reworded lines.
- **included in**: the old commit was on a merged branch; its changes are
  part of the named new commit, which is the merge that brought them in.
  The old commit's own tree has no exact counterpart in this history.

Dates are the old commit's author dates.

| Old | New | Relation | Date | Subject (old) |
| --- | --- | --- | --- | --- |
| `8b19aef7ec` | `b5c9ba6d18` | same tree | 2026-10-09 10:12 -0400 | PLAN: milestone 1 progress and remaining batches |
| `2f48f973b6` | `8dacaaf835` | same tree | 2026-10-09 11:02 -0400 | PLAN: milestone 1 progress after the selector engine |
| `9cce4e85fe` | `04ca0dd647` | same tree | 2026-10-09 12:50 -0400 | PLAN: milestone 1 done: Radix matches jsdom; timings |
| `f36124fa50` | `6b2d810efc` | same tree | 2026-10-09 15:16 -0400 | PLAN: Vuetify and emoji-picker match jsdom |
| `43b97a4303` | `f210f2a409` | same tree | 2026-10-09 17:01 -0400 | PLAN: prove the switch is worth it; plan and kill criterion |
| `eafface975` | `75bc8641f6` | same tree | 2026-10-09 17:55 -0400 | PLAN: load cost of the MUI work, and a reverted lazy-data experiment |
| `ebcbb44936` | `ec454ae15d` | same tree | 2026-10-09 18:50 -0400 | PLAN: survey of the remaining Vitest suites, load and hot-path cost |
| `f1493b16c4` | `44e8f00fb7` | same tree | 2026-10-10 08:18 -0400 | PLAN: fast mode built |
| `15ca302077` | `b895910720` | same tree | 2026-10-10 11:49 -0400 | Jest timings: handsontable 2.54x (core 13x), react-spectrum 1.48x, react-hook-form 1.20x |
| `4c28ba702e` | `e63ff4d847` | same tree | 2026-10-11 13:30 -0400 | PLAN: survey results after today's compatibility work |
| `fcd0b51c52` | `9fee122b65` | same tree | 2026-10-11 15:32 -0400 | queueMicrotask reports exceptions as error events, as jsdom |
| `3dc99c7818` | `b7d83e7e09` | same tree | 2026-10-11 16:48 -0400 | PLAN: suite timings before and after CSS validation and lazy interfaces |
| `2e60a7867e` | `41257b3147` | same tree | 2026-10-11 17:29 -0400 | bench: micro-benchmarks for node creation, style writes, cascade, dispatch, URLs, windo... |
| `1100dfc214` | `7334c45721` | same tree | 2026-10-11 17:33 -0400 | docs/research: research record (questions, method, results, findings, threats, reproduc... |
| `6c3e472a4c` | `4d964eb5f2` | same tree | 2026-10-11 18:01 -0400 | Merge branch 'wpt-harness' |
| `37970f9f93` | `640ea1c6fb` | same tree | 2026-10-11 18:35 -0400 | PLAN: XML documents (decision, numbers, deviations from jsdom) |
| `fc9d262e58` | `cd971f21c8` | same tree | 2026-10-11 19:12 -0400 | Merge branch 'wpt-dom-methods' |
| `75ee71a98b` | `c0f33a2e95` | same tree | 2026-10-11 20:58 -0400 | PLAN: global attributes and directionality, deviations |
| `6fe475f86b` | `8a78ca5d8c` | same tree | 2026-10-11 21:09 -0400 | Merge branch 'wpt-misc' |
| `fb844291cc` | `4f478e0eaa` | same tree | 2026-10-11 21:17 -0400 | Articles: index of drafts and their status |
| `e0ca06549c` | `6950f6fcc4` | same tree | 2026-10-11 21:31 -0400 | PLAN: latest corpus survey (react-spectrum 0, handsontable 3) |
| `bf540b12fa` | `a5244f53fd` | same tree | 2026-10-11 21:34 -0400 | PLAN, research data: html/dom WPT after the html/dom work (72.1% vs jsdom 69.4%) |
| `837f75acc5` | `bcf1a8e962` | same tree | 2026-10-11 22:30 -0400 | Design for warpdom compare: one command to check results and speed on a user's own suite |
| `8b965d61d5` | `a5309cfe68` | same tree | 2026-10-11 23:33 -0400 | Merge jsdom 25 profile: follow the cssstyle jsdom loads; Vitest globals for matchMedia... |
| `42e87b29ae` | `110c9d35bc` | same tree | 2026-10-11 23:47 -0400 | Merge svelte fixes: select selectedness, observers across adoption, inline scripts, vol... |
| `d1358bfffa` | `d7546a7cf7` | same tree | 2026-10-11 23:49 -0400 | Tests: yield repeatedly for jsdom's multi-step navigation; volumechange test waits for... |
| `09ef8b7d45` | `5bde765c11` | same tree | 2026-10-11 23:51 -0400 | PLAN: DOMException is an Error in the test realm (deliberate deviation, svelte's one re... |
| `5b665a65d2` | `9f775c5b43` | same tree | 2026-10-11 23:54 -0400 | Merge compare monorepo support (Vitest projects and workspaces, Jest projects) |
| `0bdec62e36` | `c9a06c46f9` | same tree | 2026-10-12 02:54 -0400 | Merge EventModifierInit modifier keys |
| `f7f45715a5` | `1258109bdf` | same tree | 2026-10-12 09:40 -0400 | Research record: fast frames is now the fastFrames opt-in |
| `2db65834e6` | `3ee73fc122` | same tree | 2026-10-12 10:21 -0400 | Merge Vitest environment path export |
| `752c0903f0` | `04722d285c` | same tree | 2026-10-12 10:23 -0400 | README for users: setup for Vitest and Jest, compare, fast mode, fast frames, measured... |
| `428744b586` | `0181b5fb78` | included in | 2026-10-12 10:43 -0400 | Events: isTrusted is an own accessor of every event |
| `cad3ce8b43` | `0181b5fb78` | same tree | 2026-10-12 11:40 -0400 | Merge WPT gaps: dom/, events, ranges, nodes (isTrusted kept on the prototype) |
| `26bebff7bd` | `f6f9b892ac` | same tree | 2026-10-12 11:54 -0400 | Release prep: CI on push and pull requests, package metadata, vitest-environment-warpdo... |
| `2e0293cf5d` | `c3e08a1b51` | same tree | 2026-10-12 12:04 -0400 | Research: paper outline (questions, contributions, method, results, threats, what a sub... |
| `af612a2bb4` | `f7b56ebf99` | included in | 2026-10-12 12:07 -0400 | jsdom 20 to 23 profiles; border, clip and outline as jsdom serializes them |
| `fba7a98c11` | `cdad506136` | same tree | 2026-10-12 12:45 -0400 | design.md: the fast-start spike is in dom-api-tracer's history |
| `3275164fa7` | `441fda1116` | same tree | 2026-10-12 12:50 -0400 | Merge cheaper query cache hits and NodeList member access |
| `3802da3676` | `028315a74b` | same tree | 2026-10-12 12:57 -0400 | Article: speed table shows the time per suite on each DOM, with the speedup last |
| `c4c95715b2` | `f7b56ebf99` | same tree | 2026-10-12 13:25 -0400 | Merge held-out fixes: 58 -> 1 differing tests on the held-out set |
| `4515de450a` | `7710103307` | same tree | 2026-10-12 13:50 -0400 | Merge ablation switches |
| `bd6497c67c` | `7710103307` | included in | 2026-10-12 13:50 -0400 | Ablation switches for research (WARPDOM_ABLATE: eager-interfaces, no-query-cache, fresh... |
| `899e635ed4` | `4e56742852` | included in | 2026-10-12 13:51 -0400 | Ablation switch latest-profile: the latest jsdom profile for every project |
| `dfbf1b8795` | `4e56742852` | same tree | 2026-10-12 13:51 -0400 | Merge ablation switch latest-profile |
| `1bcffe25f5` | `b570dfa807` | same tree | 2026-10-12 13:54 -0400 | Merge corpus timing in warpdom (bench/corpus on compare()) |
| `78556035dd` | `decc76581a` | same tree | 2026-10-12 14:00 -0400 | Merge the paper draft (learned isolation, version-faithful emulation) |
| `1adf3f887d` | `47eedc7a1e` | same tree | 2026-10-12 14:04 -0400 | Merge compare signal handling fix |
| `2525d78d84` | `d098a586f6` | same tree | 2026-10-12 14:16 -0400 | Research record: held-out timing before the fixes (three DOMs), including solid-primiti... |
| `2c08317ba4` | `1681af0f1e` | same tree | 2026-10-12 14:26 -0400 | Research record: consistency fixes (run commits, ariakit DOM CPU, fast-frames median, W... |
| `f07277d7bf` | `5383785e15` | same tree | 2026-10-12 14:26 -0400 | Paper: held-out timing before the fixes (Table 9a) with the solid-primitives slow path,... |
| `3b62996107` | `dd7fc218ff` | same tree | 2026-10-12 14:50 -0400 | Data: learning-run timings of the fast-mode run (from the job logs) |
| `77bec904b7` | `1ccb7048fb` | same tree | 2026-10-12 14:56 -0400 | Research: revision plan from two internal reviews (both major revision) |
| `6062a8b6cb` | `06a86b1702` | same tree | 2026-10-12 16:12 -0400 | Style surface per jsdom profile, measured black box (fixes react-spectrum user-select t... |
| `5c70d4e436` | `a8f193d3eb` | same tree | 2026-10-12 19:13 -0400 | Jest teardown closes the window as jest-environment-jsdom does (fixes wire-webapp's cra... |
| `627b7eef39` | `db4895c388` | same tree | 2026-10-12 19:13 -0400 | Computed styles keep var() as jsdom does; cssstyle's font shorthand before 4.4 |
| `a4649d778c` | `8630317366` | included in | 2026-10-13 08:29 -0400 | Reset: mutation observers of the kept html, head and body forget them (naive-ui: an obs... |
| `61d1c60ca2` | `6d83510f23` | same tree | 2026-10-13 09:14 -0400 | Brand: logo, icon, favicons and social preview (vector, name set in Saira, OFL) |
| `1ee70acc99` | `8630317366` | included in | 2026-10-13 09:26 -0400 | Fast mode: learning that sees every result, a noise margin, isolated mode as a plain ru... |
| `208ad49e83` | `8630317366` | same tree | 2026-10-13 11:56 -0400 | Merge fix/learned-isolation: learned isolation that sees every result, a noise margin,... |
| `e5ba020514` | `1f6d6cfa87` | same tree | 2026-10-13 13:15 -0400 | Local-only notes ignored outside the repository; brand script comment |
| `059618406c` | `2606b3d869` | included in | 2026-10-14 00:43 -0400 | Fast mode: an unhandled error counts against the file whose code threw it |
| `5942dc91de` | `2606b3d869` | same tree | 2026-10-14 08:54 -0400 | Merge branch 'fix/isolation-ci' |
| `17dcfdf18e` | `3c2b0e41c2` | same tree | 2026-10-14 12:00 -0400 | Merge branch 'fix/env-grouping' |
| `c97b086b02` | `fad0cd2ad2` | same tree | 2026-10-14 14:34 -0400 | Merge branch 'release/prep' into release/v0.1.0 |
| `db8d68a481` | `cd3d90d400` | same tree | 2026-10-14 14:43 -0400 | Release metadata: software citation until the article is out, release steps for release... |
