| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 1 | 7.3 s | 6.0 s | — | — | 1.22x | 1.22x | 0 / — / — |
| downshift | 1 | 17.7 s | 11.6 s | — | — | 1.53x | 1.53x | 0 / — / — |
| melt-ui | 1 | 80.6 s | 26.1 s | — | — | 3.09x | 3.09x | 1 / — / — |
| naive-ui | 1 | 274.8 s | 246.5 s | — | — | 1.11x | 1.11x | 0 / — / — |
| react-router | 1 | 60.9 s | 55.1 s | — | — | 1.11x | 1.11x | 0 / — / — |
| solid-primitives | 1 | 5.0 s | 4.2 s | — | — | 1.19x | 1.19x | 0 / — / — |
| taiga-ui | 1 | 627.4 s | 613.4 s | — | — | 1.02x | 1.02x | 0 / — / — |
| tanstack-query | 1 | 78.5 s | 50.7 s | — | — | 1.55x | 1.55x | 1 / — / — |
| vueuse | 1 | 92.1 s | 46.4 s | — | — | 1.98x | 1.98x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 1 | 1.22x | 1.22-1.22x (range) |
| downshift | 1 | 1.53x | 1.53-1.53x (range) |
| melt-ui | 1 | 3.09x | 3.09-3.09x (range) |
| naive-ui | 1 | 1.11x | 1.11-1.11x (range) |
| react-router | 1 | 1.11x | 1.11-1.11x (range) |
| solid-primitives | 1 | 1.19x | 1.19-1.19x (range) |
| taiga-ui | 1 | 1.02x | 1.02-1.02x (range) |
| tanstack-query | 1 | 1.55x | 1.55-1.55x (range) |
| vueuse | 1 | 1.98x | 1.98-1.98x (range) |

Median speedup over 9 suites: 1.22x (95% bootstrap interval 1.11-1.98x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | warpdom-default | 1 | 6.0 s | 1.22x | 1.22-1.22x (range) | 0 |
| dom-testing-library | warpdomlatest-default | 1 | 4.7 s | 1.55x | 1.55-1.55x (range) | 1 |
| downshift | warpdom-default | 1 | 11.6 s | 1.53x | 1.53-1.53x (range) | 0 |
| downshift | warpdomlatest-default | 1 | 8.3 s | 2.13x | 2.13-2.13x (range) | 7 |
| melt-ui | warpdom-default | 1 | 26.1 s | 3.09x | 3.09-3.09x (range) | 1 |
| melt-ui | warpdomlatest-default | 1 | 25.7 s | 3.14x | 3.14-3.14x (range) | 1 |
| naive-ui | warpdom-default | 1 | 246.5 s | 1.11x | 1.11-1.11x (range) | 0 |
| naive-ui | warpdomlatest-default | 1 | 245.4 s | 1.12x | 1.12-1.12x (range) | 0 |
| react-router | warpdom-default | 1 | 55.1 s | 1.11x | 1.11-1.11x (range) | 0 |
| react-router | warpdomlatest-default | 1 | 50.1 s | 1.22x | 1.22-1.22x (range) | 0 |
| solid-primitives | warpdom-default | 1 | 4.2 s | 1.19x | 1.19-1.19x (range) | 0 |
| solid-primitives | warpdomlatest-default | 1 | 4.2 s | 1.19x | 1.19-1.19x (range) | 0 |
| taiga-ui | warpdom-default | 1 | 613.4 s | 1.02x | 1.02-1.02x (range) | 0 |
| taiga-ui | warpdomlatest-default | 1 | 586.8 s | 1.07x | 1.07-1.07x (range) | 0 |
| tanstack-query | warpdom-default | 1 | 50.7 s | 1.55x | 1.55-1.55x (range) | 1 |
| tanstack-query | warpdomlatest-default | 1 | 51.1 s | 1.54x | 1.54-1.54x (range) | 1 |
| vueuse | warpdom-default | 1 | 46.4 s | 1.98x | 1.98-1.98x (range) | 0 |
| vueuse | warpdomlatest-default | 1 | 46.4 s | 1.98x | 1.98-1.98x (range) | 0 |
