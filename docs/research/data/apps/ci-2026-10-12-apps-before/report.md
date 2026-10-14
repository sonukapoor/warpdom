| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 5 | 196.3 s | 163.6 s | — | — | 1.20x | 1.20x | 2 / — / — |
| wire-webapp | 5 | 173.3 s | 196.3 s | — | — | 0.88x | 0.88x | 141 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 196.3 s | 163.6 s | 179.9 s | 1.20x | 1.09x | 1.10x | 2 / 44 |
| wire-webapp | 173.3 s | 196.3 s | 316.3 s | 0.88x | 0.55x | 1.62x | 141 / 75 |

Medians over 2 suites with valid jsdom rounds: warpdom vs jsdom 1.04x, happy-dom vs jsdom 0.82x, warpdom vs happy-dom 1.36x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| excalidraw | 5 | 1.20x | 1.20-1.20x (95% CI) |
| wire-webapp | 5 | 0.88x | 0.85-0.91x (95% CI) |

Median speedup over 2 suites: 1.04x (95% bootstrap interval 0.88-1.20x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| excalidraw | 5 | 1.09x | 1.08-1.09x (95% CI) |
| wire-webapp | 5 | 0.55x | 0.54-0.56x (95% CI) |

Median speedup over 2 suites: 0.82x (95% bootstrap interval 0.54-1.09x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | . | 5 | 196.3 s | 197.0 s | 163.6 s | 163.3 s | 179.9 s | 179.8 s | 1.20x | 1.21x |
| wire-webapp | apps/webapp | 5 | 173.3 s | 201.5 s | 196.3 s | 222.9 s | 316.3 s | 354.3 s | 0.88x | 0.90x |
