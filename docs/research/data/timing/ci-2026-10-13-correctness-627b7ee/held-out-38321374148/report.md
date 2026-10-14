| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 1 | 6.2 s | 4.9 s | — | — | 1.27x | 1.27x | 0 / — / — |
| downshift | 1 | 8.7 s | 5.3 s | — | — | 1.64x | 1.64x | 0 / — / — |
| melt-ui | 1 | 45.7 s | 32.3 s | — | — | 1.41x | 1.41x | 1 / — / — |
| naive-ui | 1 | 331.3 s | 295.9 s | — | — | 1.12x | 1.12x | 0 / — / — |
| react-router | 1 | 38.1 s | 36.2 s | — | — | 1.05x | 1.05x | 0 / — / — |
| solid-primitives | 1 | 4.1 s | 22.0 s | — | — | 0.19x | 0.19x | 4 / — / — |
| taiga-ui | 1 | 345.2 s | 337.7 s | — | — | 1.02x | 1.02x | 0 / — / — |
| tanstack-query | 1 | 117.4 s | 79.2 s | — | — | 1.48x | 1.48x | 1 / — / — |
| vueuse | 1 | 71.6 s | 36.7 s | — | — | 1.95x | 1.95x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 1 | 1.27x | 1.27-1.27x (range) |
| downshift | 1 | 1.64x | 1.64-1.64x (range) |
| melt-ui | 1 | 1.41x | 1.41-1.41x (range) |
| naive-ui | 1 | 1.12x | 1.12-1.12x (range) |
| react-router | 1 | 1.05x | 1.05-1.05x (range) |
| solid-primitives | 1 | 0.19x | 0.19-0.19x (range) |
| taiga-ui | 1 | 1.02x | 1.02-1.02x (range) |
| tanstack-query | 1 | 1.48x | 1.48-1.48x (range) |
| vueuse | 1 | 1.95x | 1.95-1.95x (range) |

Median speedup over 9 suites: 1.27x (95% bootstrap interval 1.02-1.64x, suites and rounds resampled, 10000 resamples).
