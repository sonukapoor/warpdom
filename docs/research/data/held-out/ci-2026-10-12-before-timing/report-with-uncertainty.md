| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 3 | 6.5 s | 5.0 s | — | — | 1.30x | 1.30x | 1 / — / — |
| downshift | 3 | 14.4 s | 8.4 s | — | — | 1.71x | 1.71x | 24 / — / — |
| melt-ui | 3 | 46.8 s | 33.1 s | — | — | 1.41x | 1.41x | 0 / — / — |
| naive-ui | 3 | 334.1 s | 298.7 s | — | — | 1.12x | 1.12x | 0 / — / — |
| react-router | 3 | 48.7 s | 48.9 s | — | — | 1.00x | 1.00x | 17 / — / — |
| solid-primitives | 3 | 3.8 s | 21.9 s | — | — | 0.18x | 0.18x | 8 / — / — |
| taiga-ui | 3 | 595.1 s | 589.5 s | — | — | 1.01x | 1.01x | 0 / — / — |
| tanstack-query | 3 | 83.8 s | 55.8 s | — | — | 1.50x | 1.50x | 2 / — / — |
| vueuse | 3 | 60.0 s | 32.7 s | — | — | 1.84x | 1.84x | 10 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 6.5 s | 5.0 s | 5.7 s | 1.30x | 1.14x | 1.14x | 1 / 23 |
| downshift | 14.4 s | 8.4 s | 9.8 s | 1.71x | 1.47x | 1.15x | 24 / 19 |
| melt-ui | 46.8 s | 33.1 s | 40.4 s | 1.41x | 1.16x | 1.22x | 0 / 10 |
| naive-ui | 334.1 s | 298.7 s | 316.3 s | 1.12x | 1.06x | 1.06x | 0 / 23 |
| react-router | 48.7 s | 48.9 s | 50.8 s | 1.00x | 0.98x | 1.02x | 17 / 83 |
| solid-primitives | 3.8 s | 21.9 s | 3.4 s | 0.18x | 1.12x | 0.16x | 8 / 13 |
| taiga-ui | 595.1 s | 589.5 s | 87.9 s | 1.01x | 6.79x | 0.15x | 0 / 2604 |
| tanstack-query | 83.8 s | 55.8 s | 65.4 s | 1.50x | 1.28x | 1.17x | 2 / 1 |
| vueuse | 60.0 s | 32.7 s | 49.5 s | 1.84x | 1.21x | 1.51x | 10 / 58 |

Medians over 9 suites with valid jsdom rounds: warpdom vs jsdom 1.30x, happy-dom vs jsdom 1.16x, warpdom vs happy-dom 1.14x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 3 | 1.30x | 1.22-1.30x (range) |
| downshift | 3 | 1.71x | 1.50-1.73x (range) |
| melt-ui | 3 | 1.41x | 1.41-3.01x (range) |
| naive-ui | 3 | 1.12x | 1.11-1.12x (range) |
| react-router | 3 | 1.00x | 1.00-1.01x (range) |
| solid-primitives | 3 | 0.18x | 0.17-1.15x (range) |
| taiga-ui | 3 | 1.01x | 1.01-1.02x (range) |
| tanstack-query | 3 | 1.50x | 1.49-1.50x (range) |
| vueuse | 3 | 1.84x | 1.80-1.85x (range) |

Median speedup over 9 suites: 1.30x (95% bootstrap interval 1.01-1.71x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 3 | 1.14x | 1.08-1.14x (range) |
| downshift | 3 | 1.47x | 1.43-1.48x (range) |
| melt-ui | 3 | 1.16x | 1.16-2.45x (range) |
| naive-ui | 3 | 1.06x | 1.06-1.06x (range) |
| react-router | 3 | 0.98x | 0.96-1.03x (range) |
| solid-primitives | 3 | 1.12x | 1.09-1.15x (range) |
| taiga-ui | 3 | 6.79x | 6.72-7.04x (range) |
| tanstack-query | 3 | 1.28x | 1.28-1.29x (range) |
| vueuse | 3 | 1.21x | 1.19-1.24x (range) |

Median speedup over 9 suites: 1.16x (95% bootstrap interval 1.06-1.47x, suites and rounds resampled, 10000 resamples).
