| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 5 | 216.2 s | 177.5 s | — | — | 1.21x | 1.21x | 0 (0) / — / — |
| wire-webapp | 5 | 177.8 s | 173.3 s | — | — | 1.03x | 1.03x | 0 (0) / — / — |

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): excalidraw 0, wire-webapp 0.

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 216.2 s | 177.5 s | 197.1 s | 1.21x | 1.08x | 1.13x | 0 (0) / 44 (44) |
| wire-webapp | 177.8 s | 173.3 s | 329.1 s | 1.03x | 0.54x | 1.89x | 0 (0) / 63 (63) |

Medians over 2 suites with valid jsdom rounds: warpdom vs jsdom 1.12x, happy-dom vs jsdom 0.81x, warpdom vs happy-dom 1.51x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| excalidraw | 5 | 1.21x | 1.20-1.23x (95% CI) |
| wire-webapp | 5 | 1.03x | 1.00-1.03x (95% CI) |

Median speedup over 2 suites: 1.12x (95% bootstrap interval 1.01-1.22x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| excalidraw | 5 | 1.08x | 1.05-1.10x (95% CI) |
| wire-webapp | 5 | 0.54x | 0.53-0.57x (95% CI) |

Median speedup over 2 suites: 0.81x (95% bootstrap interval 0.53-1.10x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | . | 5 | 216.2 s | 209.6 s | 177.5 s | 169.1 s | 197.1 s | 189.6 s | 1.21x | 1.24x |
| wire-webapp | apps/webapp | 5 | 177.8 s | 211.7 s | 173.3 s | 200.6 s | 329.1 s | 373.3 s | 1.03x | 1.06x |
