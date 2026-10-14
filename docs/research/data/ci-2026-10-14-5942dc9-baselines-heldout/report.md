## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-default | 5/5 | 49.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| melt-ui | jsdom-shared | 5/5 | 15.3 s | 3.26x | 3.23-3.31x (95% CI) | 525 (526) | 35 (36) | 0 | 2626 |
| melt-ui | jsdom-vm | 5/5 | 28.8 s | 1.71x | 1.70-1.72x (95% CI) | 1 (1) | 1 (1) | 3 | 0 |
| melt-ui | jsdom-sharedclean | 5/5 | 14.5 s | 3.41x | 3.34-3.41x (95% CI) | 417 (418) | 29 (30) | 0 | 2086 |
| melt-ui | jsdom-learned (harness) | 5/5 | 48.3 s | 1.01x | 1.00-1.03x (95% CI) | 0 (1) | 0 (1) | 1 | 0 |
| melt-ui | warpdom-default | 5/5 | 34.1 s | 1.44x | 1.41-1.48x (95% CI) | 1 (1) | 1 (1) | — | — |
| melt-ui | warpdom-vm | 5/5 | 385.0 s | 0.13x | 0.13-0.64x (95% CI) | 19 (20) | 3 (4) | 0 | 56 |
| melt-ui | warpdom-sharedfresh | 5/5 | 10.9 s | 4.44x | 4.31-4.62x (95% CI) | 525 (526) | 35 (36) | 0 | 2630 |
| melt-ui | warpdom-sharedreset | 5/5 | 11.0 s | 4.46x | 4.40-4.62x (95% CI) | 525 (526) | 35 (36) | 0 | 2630 |
| melt-ui | warpdom-learned (harness) | 5/5 | 34.1 s | 1.44x | 1.41-1.46x (95% CI) | 1 (1) | 1 (1) | 0 | 1 |
| melt-ui | happydom-shared | 5/5 | 12.1 s | 4.09x | 4.00-4.22x (95% CI) | 528 (528) | 36 (37) | 0 | 2638 |
| naive-ui | jsdom-default | 5/5 | 280.3 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| naive-ui | jsdom-shared | 5/5 | 55.8 s | 5.01x | 3.68-5.28x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | jsdom-vm | 5/5 | 84.0 s | 3.34x | 3.31-3.39x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | jsdom-sharedclean | 5/5 | 67.5 s | 4.14x | 3.76-4.38x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | jsdom-learned (harness) | 5/5 | 81.8 s | 3.43x | 3.07-3.80x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | warpdom-default | 5/5 | 250.5 s | 1.12x | 1.10-1.12x (95% CI) | 0 (0) | 0 (0) | — | — |
| naive-ui | warpdom-vm | 5/5 | 77.6 s | 3.60x | 3.57-3.71x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | warpdom-sharedfresh | 5/5 | 52.2 s | 5.38x | 4.84-5.87x (95% CI) | 929 (938) | 89 (90) | 0 | 4623 |
| naive-ui | warpdom-sharedreset | 5/5 | 46.5 s | 5.97x | 5.88-6.48x (95% CI) | 1 (4) | 1 (1) | 0 | 7 |
| naive-ui | warpdom-learned (cli) | 5/5 | 83.5 s | 3.36x | 3.22-3.59x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | happydom-shared | 5/5 | 88.4 s | 3.16x | 2.96-3.38x (95% CI) | 24 (207) | 7 (21) | 0 | 387 |
| solid-primitives | jsdom-default | 5/5 | 4.3 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid-primitives | jsdom-shared | 5/5 | 4.2 s | 1.02x | 1.00-5.21x (95% CI) | 0 (25) | 0 (1) | 25 | 21 |
| solid-primitives | jsdom-vm | 5/5 | 6.2 s | 0.70x | 0.68-3.56x (95% CI) | 25 (25) | 1 (2) | 67 | 20 |
| solid-primitives | jsdom-sharedclean | 5/5 | 4.2 s | 1.02x | 0.95-5.09x (95% CI) | 4 (21) | 0 (1) | 25 | 21 |
| solid-primitives | jsdom-learned (harness) | 5/5 | 4.3 s | 1.02x | 0.98-5.21x (95% CI) | 21 (25) | 0 (1) | 46 | 21 |
| solid-primitives | warpdom-default | 5/5 | 3.7 s | 1.19x | 0.19-1.19x (95% CI) | 0 (25) | 0 (1) | — | — |
| solid-primitives | warpdom-vm | 5/5 | 5.7 s | 0.75x | 0.74-3.80x (95% CI) | 21 (21) | 0 (1) | 29 | 0 |
| solid-primitives | warpdom-sharedfresh | 5/5 | 3.8 s | 1.16x | 1.10-5.74x (95% CI) | 21 (21) | 0 (1) | 29 | 0 |
| solid-primitives | warpdom-sharedreset | 5/5 | 3.7 s | 1.16x | 1.14-6.05x (95% CI) | 0 (25) | 0 (1) | 8 | 42 |
| solid-primitives | warpdom-learned (harness) | 5/5 | 3.7 s | 1.17x | 0.20-6.05x (95% CI) | 21 (25) | 0 (1) | 29 | 46 |
| solid-primitives | happydom-shared | 5/5 | 3.9 s | 1.13x | 1.10-5.74x (95% CI) | 13 (38) | 6 (7) | 25 | 86 |
| tanstack-query | jsdom-default | 5/5 | 128.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| tanstack-query | jsdom-shared | 5/5 | 63.2 s | 2.03x | 2.01-2.11x (95% CI) | 99 (102) | 12 (13) | 0 | 494 |
| tanstack-query | jsdom-vm | 5/5 | 72.2 s | 1.78x | 1.74-1.80x (95% CI) | 3 (3) | 2 (2) | 0 | 15 |
| tanstack-query | jsdom-sharedclean | 5/5 | 61.9 s | 2.04x | 2.04-2.07x (95% CI) | 100 (107) | 11 (13) | 0 | 500 |
| tanstack-query | jsdom-learned (harness) | 5/5 | 81.6 s | 1.56x | 1.55-1.59x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| tanstack-query | warpdom-default | 5/5 | 83.7 s | 1.53x | 1.51-1.54x (95% CI) | 1 (1) | 1 (1) | — | — |
| tanstack-query | warpdom-vm | 5/5 | 58.2 s | 2.20x | 2.15-2.22x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| tanstack-query | warpdom-sharedfresh | 5/5 | 47.4 s | 2.70x | 2.62-2.72x (95% CI) | 105 (117) | 13 (14) | 0 | 533 |
| tanstack-query | warpdom-sharedreset | 5/5 | 47.1 s | 2.70x | 2.66-2.75x (95% CI) | 112 (115) | 10 (10) | 0 | 548 |
| tanstack-query | warpdom-learned (cli) | 5/5 | 52.4 s | 2.41x | 2.39-2.51x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| tanstack-query | happydom-shared | 5/5 | 51.0 s | 2.48x | 2.24-2.54x (95% CI) | 103 (105) | 12 (13) | 0 | 506 |
| vueuse | jsdom-default | 5/5 | 68.3 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| vueuse | jsdom-shared | 5/5 | 7.4 s | 9.28x | 9.20-9.47x (95% CI) | 6 (6) | 1 (1) | 0 | 19 |
| vueuse | jsdom-vm | 5/5 | 7.6 s | 9.04x | 8.96-9.16x (95% CI) | 940 (940) | 132 (132) | 0 | 4690 |
| vueuse | jsdom-sharedclean | 5/5 | 27.5 s | 2.48x | 2.47-9.16x (95% CI) | 25 (26) | 1 (2) | 0 | 102 |
| vueuse | jsdom-learned (harness) | 5/5 | 12.9 s | 5.28x | 5.20-5.37x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | warpdom-default | 5/5 | 36.7 s | 1.86x | 1.85-1.89x (95% CI) | 0 (0) | 0 (0) | — | — |
| vueuse | warpdom-vm | 5/5 | 16.5 s | 4.14x | 4.11-4.24x (95% CI) | 6 (6) | 2 (2) | 0 | 30 |
| vueuse | warpdom-sharedfresh | 5/5 | 24.9 s | 2.74x | 2.73-2.76x (95% CI) | 77 (78) | 10 (11) | 0 | 386 |
| vueuse | warpdom-sharedreset | 5/5 | 7.0 s | 9.81x | 9.74-9.96x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | warpdom-learned (cli) | 5/5 | 7.1 s | 9.62x | 9.59-9.68x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vueuse | happydom-shared | 5/5 | 28.1 s | 2.43x | 2.36-2.44x (95% CI) | 58 (65) | 10 (12) | 0 | 298 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared, jsdom-vm, jsdom-sharedclean (those that ran) whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-vm, jsdom-default | jsdom-vm | 28.8 s | 34.1 s | 0.84x | 0.82-0.85x (95% CI) | 1 | 0 |
| naive-ui | jsdom-shared, jsdom-sharedclean, jsdom-default | jsdom-shared | 55.8 s | 83.5 s | 0.67x | 0.62-0.91x (95% CI) | 0 | 0 |
| solid-primitives | jsdom-shared, jsdom-sharedclean, jsdom-default | jsdom-shared | 4.2 s | 3.7 s | 1.16x | 0.19-1.17x (95% CI) | 25 | 29 |
| tanstack-query | jsdom-default | jsdom-default | 128.0 s | 52.4 s | 2.41x | 2.39-2.51x (95% CI) | 1 | 0 |
| vueuse | jsdom-default | jsdom-default | 68.3 s | 7.1 s | 9.62x | 9.59-9.68x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 5 suites: 1.16x (95% bootstrap interval 0.67-9.61x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** tanstack-query (jsdom-shared, jsdom-vm, jsdom-sharedclean); vueuse (jsdom-shared, jsdom-vm, jsdom-sharedclean).

## Policy and DOM

jsdom-learned: learned isolation's policy (the harness emulation) on jsdom, without any reset between files. Speedups: median of per-round ratios. Differing tests: max over rounds against jsdom-default; false passes: sum over rounds (G2 violations).

| Suite | jsdom-learned | over jsdom-default | interval | tests differ (max) | false passes | warpdom-learned over jsdom-learned | interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | 48.3 s | 1.01x | 1.00-1.03x (95% CI) | 1 | 1 | 1.42x | 1.39-1.44x (95% CI) |
| naive-ui | 81.8 s | 3.43x | 3.07-3.80x (95% CI) | 0 | 0 | 0.95x | 0.89-1.09x (95% CI) |
| solid-primitives | 4.3 s | 1.02x | 0.98-5.21x (95% CI) | 25 | 46 | 1.16x | 0.19-1.19x (95% CI) |
| tanstack-query | 81.6 s | 1.56x | 1.55-1.59x (95% CI) | 0 | 0 | 1.56x | 1.51-1.60x (95% CI) |
| vueuse | 12.9 s | 5.28x | 5.20-5.37x (95% CI) | 0 | 0 | 1.82x | 1.80-1.86x (95% CI) |

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median isolated run - median learned run), the isolated run being the same DOM's default (warpdom-default, or jsdom-default for jsdom-learned).

| Suite | configuration | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| melt-ui | jsdom-learned | harness | 6 | 35-36 | 0.98 | isolated 6 | 1.00 | 48.4 / 15.1 / 55.5 s | 70.6 s | 64.2 | 0 | 0 |
| melt-ui | warpdom-learned | harness | 6 | 35-36 | 0.99 | isolated 6 | 1.00 | 34.8 / 11.1 / 39.1 s | 50.3 s | never (learned not faster) | 0 | 0 |
| naive-ui | jsdom-learned | harness | 6 | 0-0 | 1.00 | split 6 | 1.00 | 280.1 / 54.3 / 80.2 s | 134.4 s | 0.7 | 1 | 1 |
| naive-ui | warpdom-learned | cli | 6 | 3-7 | 0.59 | split 6 | 1.00 | 249.5 / 105.4 / 78.5 s | 183.4 s | 1.1 | 2 | 2 |
| solid-primitives | jsdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 4.3 / 4.3 / 5.5 s | 9.7 s | never (learned not faster) | 0 | 0 |
| solid-primitives | warpdom-learned | harness | 6 | 0-0 | 1.00 | isolated 4, split 2 | 0.67 | 3.8 / 3.7 / 4.7 s | 8.3 s | never (learned not faster) | 0 | 0 |
| tanstack-query | jsdom-learned | harness | 6 | 11-14 | 0.73 | split 5, isolated 1 | 0.83 | 127.0 / 61.7 / 80.9 s | 142.8 s | 3.1 | 0 | 0 |
| tanstack-query | warpdom-learned | cli | 6 | 11-14 | 0.62 | packages_angular-query-experimental=isolated;packages_angular-query-persist-client=isolated;packages_lit-query=isolated;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=split 5, packages_angular-query-experimental=isolated;packages_angular-query-persist-client=isolated;packages_lit-query=split;packages_preact-query-devtools=isolated;packages_preact-query-persist-client=isolated;packages_preact-query=split;packages_query-broadcast-client-experimental=isolated;packages_query-core=split;packages_query-devtools=split;packages_react-query-devtools=isolated;packages_react-query-persist-client=isolated;packages_react-query=split;packages_solid-query-devtools=isolated;packages_solid-query-persist-client=isolated;packages_solid-query=split;packages_svelte-query-devtools=isolated;packages_svelte-query-persist-client=isolated;packages_svelte-query=split;packages_vue-query=split 1 | 0.83 | 83.2 / 53.1 / 50.8 s | 104.0 s | 3.3 | 3 | 3 |
| vueuse | jsdom-learned | harness | 6 | 1-1 | 1.00 | split 6 | 1.00 | 68.2 / 7.5 / 11.4 s | 18.9 s | 0.3 | 5 | 5 |
| vueuse | warpdom-learned | cli | 6 | 1-2 | 0.83 | split 6 | 1.00 | 36.5 / 6.9 / 7.1 s | 14.0 s | 0.5 | 0 | 0 |
