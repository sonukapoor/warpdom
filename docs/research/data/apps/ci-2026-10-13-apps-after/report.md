| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 5 | 266.8 s | 215.4 s | — | — | 1.24x | 1.24x | 0 / — / — |
| wire-webapp | 5 | 179.6 s | 172.9 s | — | — | 1.04x | 1.04x | 0 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 266.8 s | 215.4 s | 253.5 s | 1.24x | 1.05x | 1.17x | 0 / 44 |
| wire-webapp | 179.6 s | 172.9 s | 327.3 s | 1.04x | 0.54x | 1.88x | 0 / 93 |

Medians over 2 suites with valid jsdom rounds: warpdom vs jsdom 1.14x, happy-dom vs jsdom 0.80x, warpdom vs happy-dom 1.53x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| excalidraw | 5 | 1.24x | 1.21-1.24x (95% CI) |
| wire-webapp | 5 | 1.04x | 1.00-1.06x (95% CI) |

Median speedup over 2 suites: 1.14x (95% bootstrap interval 1.02-1.24x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| excalidraw | 5 | 1.05x | 1.04-1.05x (95% CI) |
| wire-webapp | 5 | 0.54x | 0.54-0.56x (95% CI) |

Median speedup over 2 suites: 0.80x (95% bootstrap interval 0.54-1.05x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | . | 5 | 266.8 s | 266.4 s | 215.4 s | 216.3 s | 253.5 s | 252.0 s | 1.24x | 1.23x |
| wire-webapp | apps/webapp | 5 | 179.6 s | 209.9 s | 172.9 s | 213.3 s | 327.3 s | 365.5 s | 1.04x | 0.98x |
