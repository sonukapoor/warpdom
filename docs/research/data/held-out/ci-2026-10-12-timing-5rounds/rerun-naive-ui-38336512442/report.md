| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| naive-ui | 5 | 333.5 s | 298.1 s | — | — | 1.12x | 1.12x | 0 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| naive-ui | 333.5 s | 298.1 s | 314.9 s | 1.12x | 1.06x | 1.06x | 0 / 23 |

Medians over 1 suites with valid jsdom rounds: warpdom vs jsdom 1.12x, happy-dom vs jsdom 1.06x, warpdom vs happy-dom 1.06x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| naive-ui | 5 | 1.12x | 1.10-1.13x (95% CI) |

Median speedup over 1 suites: 1.12x (95% bootstrap interval 1.10-1.13x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| naive-ui | 5 | 1.06x | 1.05-1.07x (95% CI) |

Median speedup over 1 suites: 1.06x (95% bootstrap interval 1.05-1.07x, suites and rounds resampled, 10000 resamples).
