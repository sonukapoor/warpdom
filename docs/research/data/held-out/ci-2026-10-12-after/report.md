| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 1 | 6.0 s | 4.9 s | — | — | 1.22x | 1.22x | 0 / — / — |
| downshift | 1 | 14.4 s | 9.5 s | — | — | 1.52x | 1.52x | 0 / — / — |
| melt-ui | 1 | 79.0 s | 26.0 s | — | — | 3.04x | 3.04x | 0 / — / — |
| naive-ui | 1 | 245.1 s | 224.3 s | — | — | 1.09x | 1.09x | 0 / — / — |
| react-router | 1 | 43.2 s | 40.8 s | — | — | 1.06x | 1.06x | 0 / — / — |
| solid-primitives | 1 | 5.2 s | 4.5 s | — | — | 1.16x | 1.16x | 0 / — / — |
| taiga-ui | 1 | 638.1 s | 614.7 s | — | — | 1.04x | 1.04x | 0 / — / — |
| tanstack-query | 1 | 128.7 s | 82.5 s | — | — | 1.56x | 1.56x | 1 / — / — |
| vueuse | 1 | 91.5 s | 46.9 s | — | — | 1.95x | 1.95x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 1 | 1.22x | 1.22-1.22x (range) |
| downshift | 1 | 1.52x | 1.52-1.52x (range) |
| melt-ui | 1 | 3.04x | 3.04-3.04x (range) |
| naive-ui | 1 | 1.09x | 1.09-1.09x (range) |
| react-router | 1 | 1.06x | 1.06-1.06x (range) |
| solid-primitives | 1 | 1.16x | 1.16-1.16x (range) |
| taiga-ui | 1 | 1.04x | 1.04-1.04x (range) |
| tanstack-query | 1 | 1.56x | 1.56-1.56x (range) |
| vueuse | 1 | 1.95x | 1.95-1.95x (range) |

Median speedup over 9 suites: 1.22x (95% bootstrap interval 1.06-1.95x, suites and rounds resampled, 10000 resamples).
