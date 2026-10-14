| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 5 | 6.7 s | 5.1 s | — | — | 1.31x | 1.31x | 0 (0) / — / — |
| downshift | 5 | 13.3 s | 7.9 s | — | — | 1.70x | 1.70x | 0 (0) / — / — |
| melt-ui | 5 | 47.8 s | 33.8 s | — | — | 1.41x | 1.41x | 1 (0) / — / — |
| naive-ui | 5 | 198.1 s | 178.5 s | — | — | 1.10x | 1.10x | 0 (0) / — / — |
| react-router | 5 | 50.5 s | 48.7 s | — | — | 1.04x | 1.04x | 0 (0) / — / — |
| solid-primitives (check) | 0 | — | — | — | — | NaNx | NaNx | — / — / — |
| taiga-ui | 5 | 584.3 s | 579.0 s | — | — | 1.01x | 1.01x | 0 (0) / — / — |
| tanstack-query | 5 | 81.7 s | 53.3 s | — | — | 1.49x | 1.49x | 1 (1) / — / — |
| vueuse | 5 | 90.8 s | 46.4 s | — | — | 1.96x | 1.96x | 0 (0) / — / — |

**Check:** solid-primitives: jsdom rounds 1, 2, 3, 4, 5 of 5 broken (no time, or differing from the other jsdom runs in more than 5 tests): left out.

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): dom-testing-library 0, downshift 0, melt-ui 1, naive-ui 0, react-router 0, solid-primitives 0, taiga-ui 0, tanstack-query 0, vueuse 0.

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 6.7 s | 5.1 s | 5.8 s | 1.31x | 1.16x | 1.12x | 0 (0) / 23 (23) |
| downshift | 13.3 s | 7.9 s | 9.3 s | 1.70x | 1.43x | 1.18x | 0 (0) / 19 (19) |
| melt-ui | 47.8 s | 33.8 s | 41.0 s | 1.41x | 1.17x | 1.21x | 1 (0) / 14 (13) |
| naive-ui | 198.1 s | 178.5 s | 187.5 s | 1.10x | 1.06x | 1.04x | 0 (0) / 23 (23) |
| react-router | 50.5 s | 48.7 s | 49.6 s | 1.04x | 1.02x | 1.02x | 0 (0) / 83 (83) |
| solid-primitives (check) | — | — | — | — | — | — | — / — |
| taiga-ui | 584.3 s | 579.0 s | 87.2 s | 1.01x | 6.73x | 0.15x | 0 (0) / 2604 (2604) |
| tanstack-query | 81.7 s | 53.3 s | 64.2 s | 1.49x | 1.26x | 1.19x | 1 (1) / 1 (1) |
| vueuse | 90.8 s | 46.4 s | 70.9 s | 1.96x | 1.28x | 1.53x | 0 (0) / 58 (58) |

Medians over 8 suites with valid jsdom rounds: warpdom vs jsdom 1.36x, happy-dom vs jsdom 1.21x, warpdom vs happy-dom 1.15x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.31x | 1.29-1.33x (95% CI) |
| downshift | 5 | 1.70x | 1.66-1.73x (95% CI) |
| melt-ui | 5 | 1.41x | 1.40-1.43x (95% CI) |
| naive-ui | 5 | 1.10x | 1.09-1.15x (95% CI) |
| react-router | 5 | 1.04x | 1.03-1.06x (95% CI) |
| taiga-ui | 5 | 1.01x | 0.99-1.03x (95% CI) |
| tanstack-query | 5 | 1.49x | 1.41-1.56x (95% CI) |
| vueuse | 5 | 1.96x | 1.95-1.98x (95% CI) |

Median speedup over 8 suites: 1.36x (95% bootstrap interval 1.04-1.68x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.16x | 1.16-1.19x (95% CI) |
| downshift | 5 | 1.43x | 1.43-1.46x (95% CI) |
| melt-ui | 5 | 1.17x | 1.15-1.18x (95% CI) |
| naive-ui | 5 | 1.06x | 1.05-1.11x (95% CI) |
| react-router | 5 | 1.02x | 1.01-1.03x (95% CI) |
| taiga-ui | 5 | 6.73x | 6.65-6.89x (95% CI) |
| tanstack-query | 5 | 1.26x | 1.21-1.30x (95% CI) |
| vueuse | 5 | 1.28x | 1.28-1.29x (95% CI) |

Median speedup over 8 suites: 1.21x (95% bootstrap interval 1.08-1.43x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | . | 5 | 6.7 s | 8.0 s | 5.1 s | 6.4 s | 5.8 s | 7.1 s | 1.31x | 1.25x |
| downshift | . | 5 | 13.3 s | 17.0 s | 7.9 s | 11.0 s | 9.3 s | 12.5 s | 1.70x | 1.55x |
| melt-ui | . | 5 | 47.8 s | 100.7 s | 33.8 s | 33.9 s | 41.0 s | 41.2 s | 1.41x | 2.97x |
| naive-ui | . | 5 | 198.1 s | 200.2 s | 178.5 s | 182.4 s | 187.5 s | 186.1 s | 1.10x | 1.10x |
| react-router | packages/react-router | 5 | 50.5 s | 57.3 s | 48.7 s | 54.5 s | 49.6 s | 55.0 s | 1.04x | 1.05x |
| solid-primitives | . | 5 | 4.9 s | 5.2 s | 4.3 s | 22.5 s | 4.5 s | 4.5 s | 1.14x | 0.23x |
| taiga-ui | . | 5 | 584.3 s | 625.1 s | 579.0 s | 599.5 s | 87.2 s | 86.5 s | 1.01x | 1.04x |
| tanstack-query | packages/query-core | 5 | 6.0 s | 6.3 s | 3.0 s | 2.9 s | 4.5 s | 4.4 s | 2.03x | 2.17x |
| tanstack-query | packages/react-query | 5 | 12.7 s | 12.8 s | 9.2 s | 9.1 s | 10.2 s | 10.0 s | 1.39x | 1.41x |
| tanstack-query | packages/react-query-devtools | 5 | 1.3 s | 1.2 s | 0.9 s | 0.9 s | 1.0 s | 1.0 s | 1.33x | 1.33x |
| tanstack-query | packages/react-query-persist-client | 5 | 1.3 s | 1.2 s | 0.9 s | 0.9 s | 1.0 s | 0.9 s | 1.33x | 1.33x |
| tanstack-query | packages/preact-query | 5 | 9.8 s | 9.4 s | 5.6 s | 5.6 s | 7.1 s | 6.5 s | 1.77x | 1.68x |
| tanstack-query | packages/preact-query-devtools | 5 | 1.4 s | 1.3 s | 1.1 s | 1.1 s | 1.2 s | 1.1 s | 1.27x | 1.18x |
| tanstack-query | packages/preact-query-persist-client | 5 | 1.3 s | 1.2 s | 1.0 s | 1.0 s | 1.2 s | 1.1 s | 1.40x | 1.20x |
| tanstack-query | packages/vue-query | 5 | 6.4 s | 6.4 s | 3.6 s | 3.6 s | 5.1 s | 4.5 s | 1.81x | 1.78x |
| tanstack-query | packages/solid-query | 5 | 6.9 s | 6.7 s | 4.2 s | 4.2 s | 4.9 s | 4.6 s | 1.67x | 1.60x |
| tanstack-query | packages/solid-query-devtools | 5 | 1.6 s | 1.5 s | 1.2 s | 1.2 s | 1.3 s | 1.3 s | 1.33x | 1.25x |
| tanstack-query | packages/solid-query-persist-client | 5 | 1.3 s | 1.2 s | 1.0 s | 1.1 s | 1.1 s | 1.0 s | 1.30x | 1.09x |
| tanstack-query | packages/svelte-query | 5 | 7.8 s | 7.4 s | 5.0 s | 5.0 s | 6.1 s | 5.6 s | 1.53x | 1.48x |
| tanstack-query | packages/svelte-query-devtools | 5 | 1.6 s | 1.7 s | 1.4 s | 1.4 s | 1.5 s | 1.4 s | 1.14x | 1.21x |
| tanstack-query | packages/svelte-query-persist-client | 5 | 1.8 s | 1.9 s | 1.5 s | 1.5 s | 1.7 s | 1.4 s | 1.14x | 1.27x |
| tanstack-query | packages/angular-query-experimental | 5 | 4.4 s | 4.5 s | 4.1 s | 4.1 s | 4.2 s | 3.8 s | 1.02x | 1.10x |
| tanstack-query | packages/angular-query-persist-client | 5 | 2.0 s | 2.3 s | 1.8 s | 1.8 s | 1.9 s | 1.7 s | 1.11x | 1.28x |
| tanstack-query | packages/lit-query | 5 | 4.5 s | 4.4 s | 2.8 s | 2.7 s | 3.4 s | 3.1 s | 1.61x | 1.63x |
| tanstack-query | packages/query-devtools | 5 | 8.7 s | 8.4 s | 5.2 s | 5.2 s | 6.2 s | 5.6 s | 1.62x | 1.62x |
| tanstack-query | packages/query-broadcast-client-experimental | 5 | 1.0 s | 1.1 s | 0.8 s | 0.7 s | 0.8 s | 0.8 s | 1.25x | 1.57x |
| vueuse | . | 5 | 90.8 s | 92.2 s | 46.4 s | 46.9 s | 70.9 s | 73.4 s | 1.96x | 1.97x |
