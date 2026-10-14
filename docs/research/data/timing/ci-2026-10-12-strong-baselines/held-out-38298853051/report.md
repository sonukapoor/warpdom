## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-default | 5/5 | 49.2 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| melt-ui | jsdom-shared | 5/5 | 15.1 s | 3.26x | 3.21-3.27x (95% CI) | 526 (526) | 36 (36) | 0 | 2630 |
| melt-ui | jsdom-vm | 5/5 | 29.7 s | 1.66x | 1.65-1.68x (95% CI) | 1 (1) | 1 (1) | 0 | 3 |
| melt-ui | warpdom-default | 5/5 | 35.2 s | 1.39x | 1.38-1.42x (95% CI) | 0 (1) | 0 (1) | — | — |
| melt-ui | warpdom-vm | 5/5 | 77.4 s | 0.63x | 0.63-2.03x (95% CI) | 0 (0) | 0 (0) | 2 | 0 |
| melt-ui | warpdom-sharedfresh | 5/5 | 11.4 s | 4.32x | 4.28-4.42x (95% CI) | 526 (526) | 36 (36) | 0 | 2628 |
| melt-ui | warpdom-sharedreset | 5/5 | 11.3 s | 4.35x | 4.24-4.40x (95% CI) | 526 (526) | 36 (36) | 0 | 2628 |
| melt-ui | warpdom-learned (harness) | 5/5 | 35.2 s | 1.40x | 1.38-1.42x (95% CI) | 0 (1) | 0 (1) | 1 | 1 |
| melt-ui | happydom-shared | 5/5 | 12.4 s | 3.96x | 3.84-4.02x (95% CI) | 529 (530) | 37 (37) | 0 | 2644 |
| naive-ui | jsdom-default | 5/5 | 304.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| naive-ui | jsdom-shared | 5/5 | 61.6 s | 4.93x | 4.81-5.04x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | jsdom-vm | 5/5 | 90.8 s | 3.34x | 3.29-3.39x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | warpdom-default | 5/5 | 270.1 s | 1.12x | 1.11-1.13x (95% CI) | 0 (0) | 0 (0) | — | — |
| naive-ui | warpdom-vm | 5/5 | 83.4 s | 3.65x | 3.59-3.68x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | warpdom-sharedfresh | 5/5 | 60.3 s | 5.03x | 4.58-5.90x (95% CI) | 930 (939) | 84 (87) | 0 | 4656 |
| naive-ui | warpdom-sharedreset | 5/5 | 47.5 s | 6.33x | 5.98-6.87x (95% CI) | 525 (780) | 60 (79) | 0 | 2839 |
| naive-ui | warpdom-learned (cli) | 5/5 | 126.3 s | 2.42x | 2.21-2.48x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | happydom-shared | 5/5 | 60.8 s | 4.94x | 4.19-5.90x (95% CI) | 25 (96) | 7 (12) | 0 | 194 |
| solid-primitives | jsdom-default | 5/5 | 4.9 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid-primitives | jsdom-shared | 5/5 | 4.9 s | 1.00x | 0.98-1.02x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid-primitives | jsdom-vm | 5/5 | 7.2 s | 0.68x | 0.66-0.69x (95% CI) | 4 (4) | 1 (1) | 0 | 20 |
| solid-primitives | warpdom-default | 5/5 | 22.5 s | 0.22x | 0.22-1.17x (95% CI) | 4 (4) | 0 (0) | — | — |
| solid-primitives | warpdom-vm | 5/5 | 6.8 s | 0.72x | 0.71-0.73x (95% CI) | 0 (0) | 0 (0) | 12 | 0 |
| solid-primitives | warpdom-sharedfresh | 5/5 | 4.4 s | 1.11x | 1.11-1.11x (95% CI) | 0 (0) | 0 (0) | 12 | 0 |
| solid-primitives | warpdom-sharedreset | 5/5 | 4.3 s | 1.16x | 1.14-1.17x (95% CI) | 0 (0) | 0 (0) | 12 | 0 |
| solid-primitives | warpdom-learned (harness) | 5/5 | 4.2 s | 1.17x | 0.22-1.17x (95% CI) | 0 (4) | 0 (0) | 8 | 0 |
| solid-primitives | happydom-shared | 5/5 | 4.4 s | 1.11x | 1.11-1.14x (95% CI) | 13 (13) | 3 (3) | 0 | 65 |
| tanstack-query | jsdom-default | 5/5 | 75.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| tanstack-query | jsdom-shared | 5/5 | 37.1 s | 2.03x | 1.87-2.04x (95% CI) | 92 (100) | 10 (12) | 0 | 471 |
| tanstack-query | jsdom-vm | 5/5 | 42.7 s | 1.79x | 1.73-1.80x (95% CI) | 3 (3) | 2 (2) | 0 | 15 |
| tanstack-query | warpdom-default | 5/5 | 51.2 s | 1.47x | 1.43-1.50x (95% CI) | 1 (1) | 1 (1) | — | — |
| tanstack-query | warpdom-vm | 5/5 | 35.2 s | 2.17x | 2.08-2.32x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| tanstack-query | warpdom-sharedfresh | 5/5 | 29.7 s | 2.62x | 2.48-2.75x (95% CI) | 106 (118) | 14 (14) | 0 | 536 |
| tanstack-query | warpdom-sharedreset | 5/5 | 29.4 s | 2.51x | 2.27-2.85x (95% CI) | 118 (161) | 12 (14) | 0 | 641 |
| tanstack-query | warpdom-learned (cli) | 5/5 | 52.4 s | 1.46x | 1.41-1.56x (95% CI) | 494 (494) | 43 (43) | 2465 | 0 |
| tanstack-query | happydom-shared | 5/5 | 30.6 s | 2.46x | 2.44-2.52x (95% CI) | 101 (106) | 13 (15) | 0 | 503 |
| vueuse | jsdom-default | 5/5 | 65.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| vueuse | jsdom-shared | 5/5 | 7.3 s | 8.77x | 8.60-8.90x (95% CI) | 6 (6) | 1 (1) | 0 | 30 |
| vueuse | jsdom-vm | 5/5 | 7.2 s | 8.72x | 8.63-9.15x (95% CI) | 940 (940) | 132 (132) | 0 | 4690 |
| vueuse | warpdom-default | 5/5 | 34.1 s | 1.88x | 1.84-1.91x (95% CI) | 0 (0) | 0 (0) | — | — |
| vueuse | warpdom-vm | 5/5 | 16.2 s | 4.04x | 3.93-4.08x (95% CI) | 6 (6) | 2 (2) | 0 | 30 |
| vueuse | warpdom-sharedfresh | 5/5 | 25.2 s | 2.56x | 2.51-2.61x (95% CI) | 77 (78) | 10 (11) | 0 | 386 |
| vueuse | warpdom-sharedreset | 5/5 | 7.0 s | 9.37x | 9.14-9.42x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | warpdom-learned (cli) | 5/5 | 7.2 s | 8.89x | 8.85-9.15x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | happydom-shared | 5/5 | 29.3 s | 2.20x | 2.17-2.25x (95% CI) | 64 (64) | 11 (11) | 0 | 320 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared and jsdom-vm whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-default | jsdom-default | 49.2 s | 35.2 s | 1.40x | 1.38-1.42x (95% CI) | 1 | 1 |
| naive-ui | jsdom-shared, jsdom-default | jsdom-shared | 61.6 s | 126.3 s | 0.48x | 0.46-0.52x (95% CI) | 0 | 0 |
| solid-primitives | jsdom-default, jsdom-shared | jsdom-default | 4.9 s | 4.2 s | 1.17x | 0.22-1.17x (95% CI) | 4 | 8 |
| tanstack-query | jsdom-default | jsdom-default | 75.4 s | 52.4 s | 1.46x | 1.41-1.56x (95% CI) | 494 | 2465 |
| vueuse | jsdom-default | jsdom-default | 65.0 s | 7.2 s | 8.89x | 8.85-9.15x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 5 suites: 1.40x (95% bootstrap interval 0.49-8.86x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** melt-ui (jsdom-shared, jsdom-vm); tanstack-query (jsdom-shared, jsdom-vm); vueuse (jsdom-shared, jsdom-vm).

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median warpdom-default - median warpdom-learned).

| Suite | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | harness | 6 | 35-36 | 0.98 | isolated 6 | 1.00 | 35.7 / 11.3 / 38.8 s | 50.0 s | never (learned not faster) | 0 | 0 |
| naive-ui | cli | 6 | 0-48 | 0.27 | split 6 | 1.00 | 270.8 / 61.7 / 93.0 s | 157.7 s | 1.1 | 62 | 67 |
| solid-primitives | harness | 6 | 0-0 | 1.00 | isolated 5, split 1 | 0.83 | 4.3 / 4.3 / 4.3 s | 8.5 s | 0.5 | 0 | 0 |
| tanstack-query | cli | 6 | 9-11 | 0.49 | packages_angular-query-experimental=isolated;packages_angular-query-persist-client=isolated;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=isolated;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=split;packages_react-query=split;packages_solid-query-devtools=split;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=isolated 1, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=split;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=split;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=split;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=split;packages_svelte-query-persist-client=split;packages_svelte-query=split;packages_vue-query=isolated 1, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=split;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=split;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=split;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=isolated 1, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=split;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=split;packages_preact-query=split;packages_query-broadcast-client-experimental=split;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=split;packages_svelte-query-persist-client=split;packages_svelte-query=split;packages_vue-query=isolated 1, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=split;packages_lit-query=isolated;packages_preact-query-devtools=split;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=split;packages_svelte-query-persist-client=split;packages_svelte-query=split;packages_vue-query=isolated 1, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=split;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=split;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=split;packages_svelte-query=split;packages_vue-query=isolated 1 | 0.17 | 51.0 / 61.8 / 43.3 s | 105.1 s | never (learned not faster) | 0 | 5 |
| vueuse | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 34.6 / 7.2 / 7.0 s | 14.2 s | 0.5 | 0 | 0 |
