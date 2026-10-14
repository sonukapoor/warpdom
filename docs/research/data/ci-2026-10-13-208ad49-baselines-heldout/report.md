## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-default | 5/5 | 32.1 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| melt-ui | jsdom-shared | 5/5 | 9.6 s | 3.24x | 3.15-3.49x (95% CI) | 526 (526) | 36 (36) | 0 | 2630 |
| melt-ui | jsdom-vm | 5/5 | 18.6 s | 1.69x | 1.66-1.78x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| melt-ui | jsdom-sharedclean | 5/5 | 10.3 s | 3.11x | 3.09-3.38x (95% CI) | 418 (418) | 30 (30) | 0 | 2090 |
| melt-ui | jsdom-learned (harness) | 5/5 | 30.8 s | 0.99x | 0.97-1.06x (95% CI) | 1 (1) | 1 (1) | 0 | 3 |
| melt-ui | warpdom-default | 5/5 | 22.5 s | 1.38x | 1.30-1.51x (95% CI) | 1 (1) | 1 (1) | — | — |
| melt-ui | warpdom-vm | 5/5 | 368.5 s | 0.09x | 0.07-0.09x (95% CI) | 13 (18) | 2 (3) | 4 | 73 |
| melt-ui | warpdom-sharedfresh | 5/5 | 7.5 s | 4.25x | 4.00-4.59x (95% CI) | 526 (526) | 36 (36) | 0 | 2626 |
| melt-ui | warpdom-sharedreset | 5/5 | 7.5 s | 4.26x | 4.20-4.34x (95% CI) | 526 (526) | 36 (36) | 0 | 2626 |
| melt-ui | warpdom-learned (harness) | 5/5 | 22.9 s | 1.38x | 1.33-1.41x (95% CI) | 0 (1) | 0 (1) | 2 | 0 |
| melt-ui | happydom-shared | 5/5 | 8.0 s | 3.89x | 3.73-4.01x (95% CI) | 528 (528) | 37 (37) | 0 | 2640 |
| naive-ui | jsdom-default | 5/5 | 304.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| naive-ui | jsdom-shared | 5/5 | 60.8 s | 5.00x | 4.36-5.12x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | jsdom-vm | 5/5 | 90.9 s | 3.32x | 3.29-3.36x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | jsdom-sharedclean | 5/5 | 69.9 s | 4.35x | 3.70-4.47x (95% CI) | 0 (1) | 0 (1) | 0 | 1 |
| naive-ui | jsdom-learned (harness) | 5/5 | 89.3 s | 3.38x | 3.31-4.03x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | warpdom-default | 5/5 | 271.6 s | 1.12x | 1.12-1.13x (95% CI) | 0 (0) | 0 (0) | — | — |
| naive-ui | warpdom-vm | 5/5 | 82.6 s | 3.70x | 3.55-3.72x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | warpdom-sharedfresh | 5/5 | 53.7 s | 5.70x | 4.99-6.15x (95% CI) | 932 (940) | 89 (92) | 0 | 4637 |
| naive-ui | warpdom-sharedreset | 5/5 | 47.0 s | 6.41x | 5.77-6.88x (95% CI) | 5 (9) | 2 (3) | 0 | 26 |
| naive-ui | warpdom-learned (cli) | 5/5 | 272.1 s | 1.12x | 1.11-1.13x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | happydom-shared | 5/5 | 57.5 s | 5.25x | 4.60-5.74x (95% CI) | 199 (274) | 27 (34) | 0 | 896 |
| solid-primitives | jsdom-default | 5/5 | 5.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid-primitives | jsdom-shared | 5/5 | 4.9 s | 1.00x | 0.98-1.02x (95% CI) | 21 (21) | 0 (0) | 63 | 0 |
| solid-primitives | jsdom-vm | 5/5 | 7.1 s | 0.69x | 0.68-0.70x (95% CI) | 24 (25) | 1 (1) | 63 | 19 |
| solid-primitives | jsdom-sharedclean | 5/5 | 4.9 s | 1.00x | 0.98-1.02x (95% CI) | 21 (21) | 0 (0) | 42 | 21 |
| solid-primitives | jsdom-learned (harness) | 5/5 | 4.9 s | 1.02x | 1.00-1.02x (95% CI) | 0 (21) | 0 (0) | 21 | 21 |
| solid-primitives | warpdom-default | 5/5 | 4.3 s | 1.16x | 0.22-1.17x (95% CI) | 21 (25) | 0 (1) | — | — |
| solid-primitives | warpdom-vm | 5/5 | 6.6 s | 0.75x | 0.72-0.76x (95% CI) | 21 (21) | 0 (0) | 25 | 0 |
| solid-primitives | warpdom-sharedfresh | 5/5 | 4.4 s | 1.14x | 1.11-1.14x (95% CI) | 0 (21) | 0 (0) | 25 | 21 |
| solid-primitives | warpdom-sharedreset | 5/5 | 4.3 s | 1.16x | 1.14-1.16x (95% CI) | 21 (21) | 0 (0) | 25 | 42 |
| solid-primitives | warpdom-learned (harness) | 5/5 | 4.3 s | 1.16x | 0.22-1.17x (95% CI) | 0 (25) | 0 (1) | 21 | 63 |
| solid-primitives | happydom-shared | 5/5 | 4.4 s | 1.14x | 1.09-1.14x (95% CI) | 34 (34) | 6 (6) | 42 | 86 |
| tanstack-query | jsdom-default | 5/5 | 130.8 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| tanstack-query | jsdom-shared | 5/5 | 63.7 s | 2.05x | 2.02-2.09x (95% CI) | 101 (103) | 13 (14) | 0 | 507 |
| tanstack-query | jsdom-vm | 5/5 | 74.4 s | 1.76x | 1.75-1.77x (95% CI) | 3 (3) | 2 (2) | 0 | 15 |
| tanstack-query | jsdom-sharedclean | 5/5 | 64.3 s | 2.03x | 1.99-2.06x (95% CI) | 95 (106) | 11 (13) | 0 | 491 |
| tanstack-query | jsdom-learned (harness) | 5/5 | 84.7 s | 1.54x | 1.35-1.58x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| tanstack-query | warpdom-default | 5/5 | 85.5 s | 1.53x | 1.52-1.56x (95% CI) | 1 (1) | 1 (1) | — | — |
| tanstack-query | warpdom-vm | 5/5 | 59.4 s | 2.20x | 2.15-2.22x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| tanstack-query | warpdom-sharedfresh | 5/5 | 48.7 s | 2.70x | 2.66-2.74x (95% CI) | 107 (109) | 14 (15) | 0 | 528 |
| tanstack-query | warpdom-sharedreset | 5/5 | 48.2 s | 2.71x | 2.70-2.76x (95% CI) | 113 (140) | 10 (11) | 0 | 604 |
| tanstack-query | warpdom-learned (cli) | 5/5 | 53.0 s | 2.46x | 2.46-2.49x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| tanstack-query | happydom-shared | 5/5 | 52.7 s | 2.48x | 2.43-2.50x (95% CI) | 95 (103) | 11 (14) | 0 | 483 |
| vueuse | jsdom-default | 5/5 | 91.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| vueuse | jsdom-shared | 5/5 | 9.7 s | 9.41x | 9.19-9.49x (95% CI) | 6 (6) | 1 (1) | 0 | 30 |
| vueuse | jsdom-vm | 5/5 | 9.7 s | 9.41x | 9.10-9.48x (95% CI) | 940 (940) | 132 (132) | 0 | 4690 |
| vueuse | jsdom-sharedclean | 5/5 | 28.6 s | 3.18x | 2.98-3.38x (95% CI) | 26 (26) | 2 (2) | 0 | 128 |
| vueuse | jsdom-learned (harness) | 5/5 | 17.7 s | 5.10x | 2.36-5.35x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | warpdom-default | 5/5 | 46.4 s | 1.95x | 1.94-1.98x (95% CI) | 0 (0) | 0 (0) | — | — |
| vueuse | warpdom-vm | 5/5 | 20.4 s | 4.46x | 4.37-4.50x (95% CI) | 6 (6) | 2 (2) | 0 | 30 |
| vueuse | warpdom-sharedfresh | 5/5 | 25.2 s | 3.61x | 3.58-3.63x (95% CI) | 77 (78) | 10 (11) | 0 | 386 |
| vueuse | warpdom-sharedreset | 5/5 | 8.9 s | 10.26x | 9.05-10.49x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | warpdom-learned (cli) | 5/5 | 46.6 s | 1.95x | 1.90-1.96x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | happydom-shared | 5/5 | 28.8 s | 3.16x | 3.01-3.18x (95% CI) | 64 (64) | 11 (11) | 0 | 320 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared, jsdom-vm, jsdom-sharedclean (those that ran) whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-vm, jsdom-default | jsdom-vm | 18.6 s | 22.9 s | 0.80x | 0.79-0.84x (95% CI) | 1 | 2 |
| naive-ui | jsdom-shared, jsdom-default | jsdom-shared | 60.8 s | 272.1 s | 0.23x | 0.22-0.26x (95% CI) | 0 | 0 |
| solid-primitives | jsdom-shared, jsdom-sharedclean, jsdom-default | jsdom-shared | 4.9 s | 4.3 s | 1.16x | 0.22-1.19x (95% CI) | 25 | 21 |
| tanstack-query | jsdom-default | jsdom-default | 130.8 s | 53.0 s | 2.46x | 2.46-2.49x (95% CI) | 1 | 0 |
| vueuse | jsdom-default | jsdom-default | 91.0 s | 46.6 s | 1.95x | 1.90-1.96x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 5 suites: 1.16x (95% bootstrap interval 0.23-2.46x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** tanstack-query (jsdom-shared, jsdom-vm, jsdom-sharedclean); vueuse (jsdom-shared, jsdom-vm, jsdom-sharedclean).

## Policy and DOM

jsdom-learned: learned isolation's policy (the harness emulation) on jsdom, without any reset between files. Speedups: median of per-round ratios. Differing tests: max over rounds against jsdom-default; false passes: sum over rounds (G2 violations).

| Suite | jsdom-learned | over jsdom-default | interval | tests differ (max) | false passes | warpdom-learned over jsdom-learned | interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | 30.8 s | 0.99x | 0.97-1.06x (95% CI) | 1 | 0 | 1.37x | 1.25-1.44x (95% CI) |
| naive-ui | 89.3 s | 3.38x | 3.31-4.03x (95% CI) | 0 | 0 | 0.33x | 0.28-0.34x (95% CI) |
| solid-primitives | 4.9 s | 1.02x | 1.00-1.02x (95% CI) | 21 | 21 | 1.14x | 0.22-1.17x (95% CI) |
| tanstack-query | 84.7 s | 1.54x | 1.35-1.58x (95% CI) | 0 | 0 | 1.61x | 1.57-1.83x (95% CI) |
| vueuse | 17.7 s | 5.10x | 2.36-5.35x (95% CI) | 0 | 0 | 0.38x | 0.37-0.83x (95% CI) |

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median isolated run - median learned run), the isolated run being the same DOM's default (warpdom-default, or jsdom-default for jsdom-learned).

| Suite | configuration | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-learned | harness | 6 | 35-36 | 0.99 | isolated 6 | 1.00 | 30.9 / 9.5 / 35.2 s | 44.9 s | 34.5 | 0 | 0 |
| melt-ui | warpdom-learned | harness | 6 | 35-36 | 0.98 | isolated 6 | 1.00 | 21.8 / 6.8 / 25.2 s | 31.9 s | never (learned not faster) | 0 | 0 |
| naive-ui | jsdom-learned | harness | 6 | 0-0 | 1.00 | split 6 | 1.00 | 303.9 / 59.1 / 87.8 s | 145.6 s | 0.7 | 0 | 0 |
| naive-ui | warpdom-learned | cli | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 272.5 / — / — s | — | — | 0 | 0 |
| solid-primitives | jsdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 5.0 / 4.9 / 6.3 s | 11.2 s | 112.0 | 0 | 0 |
| solid-primitives | warpdom-learned | harness | 6 | 0-0 | 1.00 | isolated 5, split 1 | 0.83 | 4.3 / 4.3 / 5.4 s | 9.7 s | never (learned not faster) | 0 | 0 |
| tanstack-query | jsdom-learned | harness | 6 | 11-13 | 0.73 | split 5, isolated 1 | 0.83 | 131.3 / 64.2 / 83.6 s | 147.9 s | 3.2 | 2 | 2 |
| tanstack-query | warpdom-learned | cli | 6 | 7-13 | 0.49 | packages_angular-query-experimental=isolated;packages_angular-query-persist-client=isolated;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=split 2, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=isolated;packages_lit-query=split;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=split 2, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=isolated;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=isolated 2 | 0.33 | 86.7 / 51.7 / 53.2 s | 104.8 s | 3.2 | 1 | 1 |
| vueuse | jsdom-learned | harness | 6 | 1-3 | 0.67 | split 5, isolated 1 | 0.83 | 90.4 / 9.9 / 14.4 s | 24.0 s | 0.3 | 8 | 8 |
| vueuse | warpdom-learned | cli | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 46.3 / — / — s | — | — | 0 | 0 |
