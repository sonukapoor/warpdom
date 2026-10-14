| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| handsontable | 5 | 806.1 s | 87.6 s | — | — | 9.22x | 9.22x | 3 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| handsontable | 5 | 9.22x | 9.09-9.50x (95% CI) |

Median speedup over 1 suites: 9.22x (95% bootstrap interval 9.09-9.50x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| handsontable | handsontable | 5 | 741.3 s | 817.0 s | 56.9 s | 78.5 s | 13.05x | 10.41x |
| handsontable | wrappers/react-wrapper | 5 | 32.9 s | 43.3 s | 12.9 s | 22.1 s | 2.53x | 1.96x |
| handsontable | wrappers/vue3 | 5 | 11.0 s | 18.9 s | 6.6 s | 14.7 s | 1.65x | 1.29x |
| handsontable | wrappers/angular-wrapper | 5 | 21.6 s | 377.7 s | 11.3 s | 379.7 s | 1.90x | 0.99x |
