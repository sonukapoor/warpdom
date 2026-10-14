| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 2 | 4.7 s | 3.8 s | — | — | 1.25x | 1.25x | 0 / — / — |
| downshift | 2 | 14.3 s | 8.4 s | — | — | 1.72x | 1.72x | 0 / — / — |
| melt-ui | 2 | 47.6 s | 33.3 s | — | — | 1.43x | 1.43x | 0 / — / — |
| naive-ui | 2 | 330.0 s | 295.0 s | — | — | 1.12x | 1.12x | 0 / — / — |
| react-router | 2 | 50.8 s | 49.0 s | — | — | 1.04x | 1.04x | 0 / — / — |
| solid-primitives | 2 | 4.0 s | 12.8 s | — | — | 0.65x | 0.65x | 4 / — / — |
| taiga-ui | 2 | 365.1 s | 358.6 s | — | — | 1.02x | 1.02x | 0 / — / — |
| tanstack-query | 2 | 71.1 s | 47.5 s | — | — | 1.50x | 1.50x | 1 / — / — |
| vueuse | 2 | 92.3 s | 46.5 s | — | — | 1.98x | 1.98x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 2 | 1.25x | 1.24-1.27x (range) |
| downshift | 2 | 1.72x | 1.71-1.73x (range) |
| melt-ui | 2 | 1.43x | 1.42-1.44x (range) |
| naive-ui | 2 | 1.12x | 1.12-1.12x (range) |
| react-router | 2 | 1.04x | 1.03-1.04x (range) |
| solid-primitives | 2 | 0.65x | 0.18-1.11x (range) |
| taiga-ui | 2 | 1.02x | 0.98-1.05x (range) |
| tanstack-query | 2 | 1.50x | 1.49-1.50x (range) |
| vueuse | 2 | 1.98x | 1.98-1.98x (range) |

Median speedup over 9 suites: 1.25x (95% bootstrap interval 1.04-1.71x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | warpdom-default | 2 | 3.8 s | 1.25x | 1.24-1.27x (range) | 0 |
| dom-testing-library | warpdomlatest-default | 2 | 3.8 s | 1.22x | 1.21-1.24x (range) | 1 |
| downshift | warpdom-default | 2 | 8.4 s | 1.72x | 1.71-1.73x (range) | 0 |
| downshift | warpdomlatest-default | 2 | 8.4 s | 1.72x | 1.69-1.75x (range) | 7 |
| melt-ui | warpdom-default | 2 | 33.3 s | 1.43x | 1.42-1.44x (range) | 0 |
| melt-ui | warpdomlatest-default | 2 | 33.8 s | 1.41x | 1.38-1.44x (range) | 1 |
| naive-ui | warpdom-default | 2 | 295.0 s | 1.12x | 1.12-1.12x (range) | 0 |
| naive-ui | warpdomlatest-default | 2 | 295.7 s | 1.12x | 1.11-1.12x (range) | 0 |
| react-router | warpdom-default | 2 | 49.0 s | 1.04x | 1.03-1.04x (range) | 0 |
| react-router | warpdomlatest-default | 2 | 48.7 s | 1.04x | 1.04-1.05x (range) | 0 |
| solid-primitives | warpdom-default | 2 | 12.8 s | 0.65x | 0.18-1.11x (range) | 4 |
| solid-primitives | warpdomlatest-default | 2 | 3.5 s | 1.16x | 1.14-1.18x (range) | 0 |
| taiga-ui | warpdom-default | 2 | 358.6 s | 1.02x | 0.98-1.05x (range) | 0 |
| taiga-ui | warpdomlatest-default | 2 | 350.9 s | 1.04x | 1.03-1.05x (range) | 0 |
| tanstack-query | warpdom-default | 2 | 47.5 s | 1.50x | 1.49-1.50x (range) | 1 |
| tanstack-query | warpdomlatest-default | 2 | 47.5 s | 1.50x | 1.49-1.50x (range) | 1 |
| vueuse | warpdom-default | 2 | 46.5 s | 1.98x | 1.98-1.98x (range) | 0 |
| vueuse | warpdomlatest-default | 2 | 46.8 s | 1.97x | 1.97-1.97x (range) | 0 |
