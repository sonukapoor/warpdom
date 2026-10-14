| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 2 | 6.8 s | 5.3 s | — | — | 1.30x | 1.30x | 0 (0) / — / — |
| downshift | 2 | 14.3 s | 8.3 s | — | — | 1.71x | 1.71x | 0 (0) / — / — |
| melt-ui | 2 | 32.0 s | 23.9 s | — | — | 1.34x | 1.34x | 1 (1) / — / — |
| naive-ui | 2 | 207.2 s | 185.7 s | — | — | 1.12x | 1.12x | 0 (0) / — / — |
| react-router | 2 | 52.5 s | 50.3 s | — | — | 1.04x | 1.04x | 0 (0) / — / — |
| solid-primitives (check) | 0 | — | — | — | — | NaNx | NaNx | — / — / — |
| taiga-ui | 2 | 627.5 s | 612.9 s | — | — | 1.02x | 1.02x | 0 (0) / — / — |
| tanstack-query | 2 | 124.5 s | 81.4 s | — | — | 1.53x | 1.53x | 1 (1) / — / — |
| vueuse | 2 | 90.8 s | 46.2 s | — | — | 1.97x | 1.97x | 0 (0) / — / — |

**Check:** solid-primitives: jsdom rounds 1, 2 of 2 broken (no time, or differing from the other jsdom runs in more than 5 tests): left out.

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): dom-testing-library 0, downshift 0, melt-ui 0, naive-ui 0, react-router 0, solid-primitives 0, taiga-ui 0, tanstack-query 0, vueuse 0.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 2 | 1.30x | 1.30-1.31x (range) |
| downshift | 2 | 1.71x | 1.68-1.74x (range) |
| melt-ui | 2 | 1.34x | 1.31-1.37x (range) |
| naive-ui | 2 | 1.12x | 1.09-1.14x (range) |
| react-router | 2 | 1.04x | 1.04-1.05x (range) |
| taiga-ui | 2 | 1.02x | 1.01-1.03x (range) |
| tanstack-query | 2 | 1.53x | 1.53-1.53x (range) |
| vueuse | 2 | 1.97x | 1.96-1.97x (range) |

Median speedup over 8 suites: 1.32x (95% bootstrap interval 1.05-1.68x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | warpdomlatest-default | 2 | 5.2 s | 1.33x | 1.31-1.35x (range) | 1 (1) |
| dom-testing-library | warpdom-default | 2 | 5.3 s | 1.30x | 1.30-1.31x (range) | 0 (0) |
| downshift | warpdomlatest-default | 2 | 8.4 s | 1.70x | 1.70-1.70x (range) | 7 (7) |
| downshift | warpdom-default | 2 | 8.3 s | 1.71x | 1.68-1.74x (range) | 0 (0) |
| melt-ui | warpdomlatest-default | 2 | 23.3 s | 1.38x | 1.37-1.38x (range) | 1 (1) |
| melt-ui | warpdom-default | 2 | 23.9 s | 1.34x | 1.31-1.37x (range) | 1 (1) |
| naive-ui | warpdomlatest-default | 2 | 185.4 s | 1.12x | 1.12-1.12x (range) | 0 (0) |
| naive-ui | warpdom-default | 2 | 185.7 s | 1.12x | 1.09-1.14x (range) | 0 (0) |
| react-router | warpdomlatest-default | 2 | 49.9 s | 1.05x | 1.05-1.06x (range) | 0 (0) |
| react-router | warpdom-default | 2 | 50.3 s | 1.04x | 1.04-1.05x (range) | 0 (0) |
| taiga-ui | warpdomlatest-default | 2 | 607.3 s | 1.03x | 1.03-1.04x (range) | 0 (0) |
| taiga-ui | warpdom-default | 2 | 612.9 s | 1.02x | 1.01-1.03x (range) | 0 (0) |
| tanstack-query | warpdomlatest-default | 2 | 81.8 s | 1.52x | 1.52-1.52x (range) | 1 (1) |
| tanstack-query | warpdom-default | 2 | 81.4 s | 1.53x | 1.53-1.53x (range) | 1 (1) |
| vueuse | warpdomlatest-default | 2 | 46.2 s | 1.97x | 1.96-1.97x (range) | 0 (0) |
| vueuse | warpdom-default | 2 | 46.2 s | 1.97x | 1.96-1.97x (range) | 0 (0) |

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdomlatest-default | warpdomlatest-default warm-up | warpdom-default | warpdom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | . | 2 | 6.8 s | 7.9 s | 5.2 s | 6.4 s | 5.3 s | 5.2 s | 1.30x | 1.52x |
| downshift | . | 2 | 14.3 s | 18.1 s | 8.4 s | 11.8 s | 8.3 s | 8.3 s | 1.71x | 2.18x |
| melt-ui | . | 2 | 32.0 s | 70.0 s | 23.3 s | 23.7 s | 23.9 s | 23.0 s | 1.34x | 3.04x |
| naive-ui | . | 2 | 207.2 s | 198.4 s | 185.4 s | 182.1 s | 185.7 s | 179.5 s | 1.12x | 1.11x |
| react-router | packages/react-router | 2 | 52.5 s | 59.1 s | 49.9 s | 57.2 s | 50.3 s | 50.2 s | 1.04x | 1.18x |
| solid-primitives | . | 2 | 5.2 s | 5.3 s | 13.5 s | 4.7 s | 22.6 s | 4.5 s | 0.23x | 1.18x |
| taiga-ui | . | 2 | 627.5 s | 657.6 s | 607.3 s | 632.5 s | 612.9 s | 608.7 s | 1.02x | 1.08x |
| tanstack-query | packages/query-core | 2 | 9.6 s | 9.6 s | 4.5 s | 4.5 s | 4.5 s | 4.5 s | 2.12x | 2.13x |
| tanstack-query | packages/react-query | 2 | 20.0 s | 20.1 s | 14.3 s | 14.3 s | 14.2 s | 14.2 s | 1.41x | 1.42x |
| tanstack-query | packages/react-query-devtools | 2 | 1.9 s | 1.9 s | 1.4 s | 1.3 s | 1.3 s | 1.3 s | 1.46x | 1.46x |
| tanstack-query | packages/react-query-persist-client | 2 | 1.9 s | 1.9 s | 1.4 s | 1.3 s | 1.4 s | 1.4 s | 1.41x | 1.36x |
| tanstack-query | packages/preact-query | 2 | 14.9 s | 14.9 s | 8.5 s | 8.5 s | 8.5 s | 8.6 s | 1.75x | 1.73x |
| tanstack-query | packages/preact-query-devtools | 2 | 2.1 s | 2.1 s | 1.5 s | 1.5 s | 1.5 s | 1.5 s | 1.40x | 1.40x |
| tanstack-query | packages/preact-query-persist-client | 2 | 1.9 s | 1.9 s | 1.5 s | 1.5 s | 1.5 s | 1.5 s | 1.30x | 1.27x |
| tanstack-query | packages/vue-query | 2 | 10.0 s | 9.9 s | 5.3 s | 5.4 s | 5.4 s | 5.3 s | 1.85x | 1.87x |
| tanstack-query | packages/solid-query | 2 | 10.5 s | 10.4 s | 6.4 s | 6.5 s | 6.4 s | 6.4 s | 1.64x | 1.63x |
| tanstack-query | packages/solid-query-devtools | 2 | 2.3 s | 2.3 s | 1.8 s | 1.8 s | 1.8 s | 1.8 s | 1.31x | 1.28x |
| tanstack-query | packages/solid-query-persist-client | 2 | 2.0 s | 2.0 s | 1.6 s | 1.6 s | 1.6 s | 1.6 s | 1.25x | 1.25x |
| tanstack-query | packages/svelte-query | 2 | 11.9 s | 12.1 s | 7.5 s | 7.6 s | 7.6 s | 7.6 s | 1.56x | 1.59x |
| tanstack-query | packages/svelte-query-devtools | 2 | 2.5 s | 2.7 s | 2.1 s | 2.1 s | 2.1 s | 2.1 s | 1.19x | 1.29x |
| tanstack-query | packages/svelte-query-persist-client | 2 | 2.6 s | 2.8 s | 2.2 s | 2.2 s | 2.2 s | 2.2 s | 1.18x | 1.27x |
| tanstack-query | packages/angular-query-experimental | 2 | 6.5 s | 7.1 s | 6.3 s | 6.3 s | 6.2 s | 6.1 s | 1.06x | 1.16x |
| tanstack-query | packages/angular-query-persist-client | 2 | 3.1 s | 3.6 s | 2.7 s | 2.7 s | 2.7 s | 2.7 s | 1.15x | 1.33x |
| tanstack-query | packages/lit-query | 2 | 6.8 s | 6.9 s | 4.2 s | 4.1 s | 4.1 s | 4.1 s | 1.65x | 1.68x |
| tanstack-query | packages/query-devtools | 2 | 12.6 s | 12.9 s | 7.5 s | 7.6 s | 7.4 s | 7.4 s | 1.70x | 1.74x |
| tanstack-query | packages/query-broadcast-client-experimental | 2 | 1.5 s | 1.5 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.36x | 1.36x |
| vueuse | . | 2 | 90.8 s | 91.1 s | 46.2 s | 46.2 s | 46.2 s | 46.3 s | 1.97x | 1.97x |
