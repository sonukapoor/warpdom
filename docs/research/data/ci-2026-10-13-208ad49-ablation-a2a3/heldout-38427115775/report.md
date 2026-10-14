| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 5 | 5.0 s | 3.9 s | — | — | 1.28x | 1.28x | 0 (0) / — / — |
| downshift | 5 | 14.4 s | 8.5 s | — | — | 1.71x | 1.71x | 0 (0) / — / — |
| melt-ui | 5 | 31.9 s | 22.7 s | — | — | 1.39x | 1.39x | 1 (1) / — / — |
| naive-ui | 5 | 334.9 s | 298.5 s | — | — | 1.13x | 1.13x | 0 (0) / — / — |
| react-router | 5 | 51.4 s | 49.3 s | — | — | 1.05x | 1.05x | 0 (0) / — / — |
| solid-primitives (check) | 0 | — | — | — | — | NaNx | NaNx | — / — / — |
| taiga-ui | 5 | 557.0 s | 543.6 s | — | — | 1.02x | 1.02x | 0 (0) / — / — |
| tanstack-query | 5 | 80.3 s | 54.3 s | — | — | 1.49x | 1.49x | 1 (1) / — / — |
| vueuse | 5 | 70.9 s | 35.6 s | — | — | 1.99x | 1.99x | 0 (0) / — / — |

**Check:** solid-primitives: jsdom rounds 1, 2, 3, 4, 5 of 5 broken (no time, or differing from the other jsdom runs in more than 5 tests): left out.

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): dom-testing-library 0, downshift 0, melt-ui 0, naive-ui 0, react-router 0, solid-primitives 0, taiga-ui 0, tanstack-query 0, vueuse 0.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.28x | 1.23-1.31x (95% CI) |
| downshift | 5 | 1.71x | 1.69-1.73x (95% CI) |
| melt-ui | 5 | 1.39x | 1.36-1.41x (95% CI) |
| naive-ui | 5 | 1.13x | 1.11-1.13x (95% CI) |
| react-router | 5 | 1.05x | 1.03-1.06x (95% CI) |
| taiga-ui | 5 | 1.02x | 1.01-1.03x (95% CI) |
| tanstack-query | 5 | 1.49x | 1.47-1.53x (95% CI) |
| vueuse | 5 | 1.99x | 1.94-2.02x (95% CI) |

Median speedup over 8 suites: 1.34x (95% bootstrap interval 1.05-1.70x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | warpdom-default | 5 | 3.9 s | 1.28x | 1.23-1.31x (95% CI) | 0 (0) |
| dom-testing-library | warpdom-default-aa | 5 | 4.0 s | 1.23x | 1.22-1.31x (95% CI) | 0 (0) |
| dom-testing-library | warpdomeager-default | 5 | 3.9 s | 1.26x | 1.23-1.31x (95% CI) | 0 (0) |
| dom-testing-library | warpdomnocache-default | 5 | 3.9 s | 1.27x | 1.23-1.28x (95% CI) | 0 (0) |
| downshift | warpdom-default | 5 | 8.5 s | 1.71x | 1.69-1.73x (95% CI) | 0 (0) |
| downshift | warpdom-default-aa | 5 | 8.4 s | 1.71x | 1.67-1.73x (95% CI) | 0 (0) |
| downshift | warpdomeager-default | 5 | 8.5 s | 1.69x | 1.67-1.71x (95% CI) | 0 (0) |
| downshift | warpdomnocache-default | 5 | 8.5 s | 1.71x | 1.67-1.73x (95% CI) | 0 (0) |
| melt-ui | warpdom-default | 5 | 22.7 s | 1.39x | 1.36-1.41x (95% CI) | 1 (1) |
| melt-ui | warpdom-default-aa | 5 | 23.1 s | 1.36x | 1.30-1.40x (95% CI) | 2 (2) |
| melt-ui | warpdomeager-default | 5 | 22.9 s | 1.38x | 1.35-1.41x (95% CI) | 1 (1) |
| melt-ui | warpdomnocache-default | 5 | 23.2 s | 1.38x | 1.35-1.39x (95% CI) | 1 (1) |
| naive-ui | warpdom-default | 5 | 298.5 s | 1.13x | 1.11-1.13x (95% CI) | 0 (0) |
| naive-ui | warpdom-default-aa | 5 | 297.3 s | 1.13x | 1.11-1.13x (95% CI) | 0 (0) |
| naive-ui | warpdomeager-default | 5 | 301.5 s | 1.12x | 1.10-1.12x (95% CI) | 0 (0) |
| naive-ui | warpdomnocache-default | 5 | 300.2 s | 1.12x | 1.11-1.12x (95% CI) | 0 (0) |
| react-router | warpdom-default | 5 | 49.3 s | 1.05x | 1.03-1.06x (95% CI) | 0 (0) |
| react-router | warpdom-default-aa | 5 | 49.2 s | 1.04x | 1.03-1.06x (95% CI) | 0 (0) |
| react-router | warpdomeager-default | 5 | 49.3 s | 1.04x | 1.03-1.07x (95% CI) | 0 (0) |
| react-router | warpdomnocache-default | 5 | 49.4 s | 1.04x | 1.03-1.05x (95% CI) | 0 (0) |
| taiga-ui | warpdom-default | 5 | 543.6 s | 1.02x | 1.01-1.03x (95% CI) | 0 (0) |
| taiga-ui | warpdom-default-aa | 5 | 546.4 s | 1.02x | 1.00-1.02x (95% CI) | 0 (0) |
| taiga-ui | warpdomeager-default | 5 | 543.4 s | 1.03x | 1.01-1.03x (95% CI) | 0 (0) |
| taiga-ui | warpdomnocache-default | 5 | 544.7 s | 1.02x | 1.02-1.02x (95% CI) | 0 (0) |
| tanstack-query | warpdom-default | 5 | 54.3 s | 1.49x | 1.47-1.53x (95% CI) | 1 (1) |
| tanstack-query | warpdom-default-aa | 5 | 53.7 s | 1.49x | 1.46-1.60x (95% CI) | 1 (1) |
| tanstack-query | warpdomeager-default | 5 | 53.2 s | 1.51x | 1.47-1.55x (95% CI) | 1 (1) |
| tanstack-query | warpdomnocache-default | 5 | 53.2 s | 1.52x | 1.50-1.53x (95% CI) | 1 (1) |
| vueuse | warpdom-default | 5 | 35.6 s | 1.99x | 1.94-2.02x (95% CI) | 0 (0) |
| vueuse | warpdom-default-aa | 5 | 35.9 s | 1.97x | 1.97-1.99x (95% CI) | 0 (0) |
| vueuse | warpdomeager-default | 5 | 36.0 s | 1.97x | 1.95-1.99x (95% CI) | 0 (0) |
| vueuse | warpdomnocache-default | 5 | 35.7 s | 1.98x | 1.97-2.02x (95% CI) | 0 (0) |

**A/A controls** (paired ratio warpdom-default / control per round: median, range below 5 rounds, else 95% bootstrap interval; max deviation = largest |ratio - 1| over rounds)

| Suite | control | rounds | ratio | interval | max deviation | differ (control) |
| --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | warpdom-default-aa | 5 | 1.000 | 0.951-1.000 (95% CI) | 4.9% | 0 |
| downshift | warpdom-default-aa | 5 | 1.000 | 0.988-1.024 (95% CI) | 2.4% | 0 |
| melt-ui | warpdom-default-aa | 5 | 0.983 | 0.954-1.000 (95% CI) | 4.6% | 2 |
| naive-ui | warpdom-default-aa | 5 | 1.001 | 0.992-1.014 (95% CI) | 1.4% | 0 |
| react-router | warpdom-default-aa | 5 | 1.002 | 0.988-1.012 (95% CI) | 1.2% | 0 |
| taiga-ui | warpdom-default-aa | 5 | 0.995 | 0.987-0.997 (95% CI) | 1.3% | 0 |
| tanstack-query | warpdom-default-aa | 5 | 1.002 | 0.995-1.046 (95% CI) | 4.6% | 1 |
| vueuse | warpdom-default-aa | 5 | 0.992 | 0.983-1.014 (95% CI) | 1.7% | 0 |

warpdom-default-aa: 40 paired rounds over all suites, median ratio 0.997, median |log ratio| 0.007 (0.7%), 95th percentile 4.8%.

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | warpdom-default-aa | warpdom-default-aa warm-up | warpdomeager-default | warpdomeager-default warm-up | warpdomnocache-default | warpdomnocache-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | . | 5 | 5.0 s | 5.9 s | 3.9 s | 4.8 s | 4.0 s | 4.1 s | 3.9 s | 4.0 s | 3.9 s | 4.0 s | 1.28x | 1.23x |
| downshift | . | 5 | 14.4 s | 18.1 s | 8.5 s | 12.0 s | 8.4 s | 8.7 s | 8.5 s | 8.7 s | 8.5 s | 8.5 s | 1.71x | 1.51x |
| melt-ui | . | 5 | 31.9 s | 70.9 s | 22.7 s | 24.0 s | 23.1 s | 24.0 s | 22.9 s | 24.3 s | 23.2 s | 23.1 s | 1.39x | 2.95x |
| naive-ui | . | 5 | 334.9 s | 332.0 s | 298.5 s | 297.8 s | 297.3 s | 297.7 s | 301.5 s | 297.0 s | 300.2 s | 294.9 s | 1.13x | 1.11x |
| react-router | packages/react-router | 5 | 51.4 s | 56.8 s | 49.3 s | 54.2 s | 49.2 s | 49.1 s | 49.3 s | 49.2 s | 49.4 s | 48.6 s | 1.05x | 1.05x |
| solid-primitives | . | 5 | 4.9 s | 5.3 s | 4.3 s | 4.3 s | 4.3 s | 4.3 s | 4.4 s | 4.4 s | 4.3 s | 22.5 s | 1.14x | 1.23x |
| taiga-ui | . | 5 | 557.0 s | 593.5 s | 543.6 s | 575.6 s | 546.4 s | 548.5 s | 543.4 s | 537.6 s | 544.7 s | 537.3 s | 1.02x | 1.03x |
| tanstack-query | packages/query-core | 5 | 5.9 s | 6.0 s | 3.0 s | 2.8 s | 3.0 s | 2.9 s | 3.0 s | 3.0 s | 3.0 s | 2.9 s | 1.97x | 2.14x |
| tanstack-query | packages/react-query | 5 | 12.5 s | 13.0 s | 9.3 s | 8.7 s | 9.3 s | 9.2 s | 9.2 s | 9.0 s | 9.1 s | 9.2 s | 1.34x | 1.49x |
| tanstack-query | packages/react-query-devtools | 5 | 1.2 s | 1.3 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 1.0 s | 1.33x | 1.44x |
| tanstack-query | packages/react-query-persist-client | 5 | 1.2 s | 1.3 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 0.9 s | 1.33x | 1.44x |
| tanstack-query | packages/preact-query | 5 | 9.4 s | 9.8 s | 5.6 s | 5.3 s | 5.6 s | 5.6 s | 5.4 s | 5.5 s | 5.5 s | 5.5 s | 1.68x | 1.85x |
| tanstack-query | packages/preact-query-devtools | 5 | 1.3 s | 1.4 s | 1.0 s | 1.1 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.30x | 1.27x |
| tanstack-query | packages/preact-query-persist-client | 5 | 1.3 s | 1.3 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.30x | 1.30x |
| tanstack-query | packages/vue-query | 5 | 6.3 s | 6.5 s | 3.6 s | 3.4 s | 3.5 s | 3.4 s | 3.5 s | 3.5 s | 3.5 s | 3.6 s | 1.85x | 1.91x |
| tanstack-query | packages/solid-query | 5 | 6.7 s | 6.7 s | 4.3 s | 4.1 s | 4.2 s | 4.1 s | 4.2 s | 4.2 s | 4.2 s | 4.2 s | 1.59x | 1.63x |
| tanstack-query | packages/solid-query-devtools | 5 | 1.5 s | 1.5 s | 1.2 s | 1.2 s | 1.2 s | 1.2 s | 1.2 s | 1.3 s | 1.2 s | 1.2 s | 1.25x | 1.25x |
| tanstack-query | packages/solid-query-persist-client | 5 | 1.3 s | 1.3 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.0 s | 1.30x | 1.30x |
| tanstack-query | packages/svelte-query | 5 | 7.8 s | 7.7 s | 5.0 s | 4.7 s | 4.9 s | 4.9 s | 4.9 s | 4.9 s | 4.9 s | 4.8 s | 1.56x | 1.64x |
| tanstack-query | packages/svelte-query-devtools | 5 | 1.7 s | 1.8 s | 1.4 s | 1.3 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.3 s | 1.14x | 1.38x |
| tanstack-query | packages/svelte-query-persist-client | 5 | 1.7 s | 1.9 s | 1.5 s | 1.4 s | 1.5 s | 1.5 s | 1.5 s | 1.5 s | 1.5 s | 1.4 s | 1.14x | 1.36x |
| tanstack-query | packages/angular-query-experimental | 5 | 4.4 s | 4.6 s | 4.0 s | 3.9 s | 4.0 s | 4.0 s | 3.9 s | 3.9 s | 4.0 s | 3.9 s | 1.08x | 1.18x |
| tanstack-query | packages/angular-query-persist-client | 5 | 2.0 s | 2.2 s | 1.7 s | 1.7 s | 1.7 s | 1.7 s | 1.7 s | 1.7 s | 1.7 s | 1.7 s | 1.12x | 1.29x |
| tanstack-query | packages/lit-query | 5 | 4.5 s | 4.3 s | 2.7 s | 2.6 s | 2.7 s | 2.7 s | 2.7 s | 2.7 s | 2.6 s | 2.6 s | 1.61x | 1.65x |
| tanstack-query | packages/query-devtools | 5 | 8.4 s | 8.1 s | 5.2 s | 4.9 s | 5.1 s | 5.3 s | 5.0 s | 5.2 s | 5.1 s | 4.9 s | 1.62x | 1.65x |
| tanstack-query | packages/query-broadcast-client-experimental | 5 | 1.0 s | 0.9 s | 0.7 s | 0.7 s | 0.7 s | 0.7 s | 0.7 s | 0.7 s | 0.7 s | 0.7 s | 1.43x | 1.29x |
| vueuse | . | 5 | 70.9 s | 71.5 s | 35.6 s | 36.1 s | 35.9 s | 36.0 s | 36.0 s | 36.3 s | 35.7 s | 35.7 s | 1.99x | 1.98x |
