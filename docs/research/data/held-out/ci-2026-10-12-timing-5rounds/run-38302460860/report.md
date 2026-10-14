| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 5 | 7.0 s | 5.3 s | — | — | 1.32x | 1.32x | 0 / — / — |
| downshift | 5 | 14.3 s | 8.4 s | — | — | 1.70x | 1.70x | 0 / — / — |
| melt-ui | 5 | 47.3 s | 33.4 s | — | — | 1.42x | 1.42x | 2 / — / — |
| naive-ui | 5 | 301.6 s | 268.5 s | — | — | 1.12x | 1.12x | 0 / — / — |
| react-router | 5 | 51.6 s | 48.9 s | — | — | 1.06x | 1.06x | 0 / — / — |
| solid-primitives | 5 | 3.8 s | 21.9 s | — | — | 0.17x | 0.17x | 4 / — / — |
| taiga-ui | 5 | 375.1 s | 362.3 s | — | — | 1.04x | 1.04x | 0 / — / — |
| tanstack-query | 5 | 125.1 s | 82.0 s | — | — | 1.53x | 1.53x | 1 / — / — |
| vueuse | 5 | 70.2 s | 35.4 s | — | — | 1.98x | 1.98x | 0 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 7.0 s | 5.3 s | 6.0 s | 1.32x | 1.17x | 1.13x | 0 / 23 |
| downshift | 14.3 s | 8.4 s | 9.8 s | 1.70x | 1.46x | 1.18x | 0 / 19 |
| melt-ui | 47.3 s | 33.4 s | 40.5 s | 1.42x | 1.17x | 1.21x | 2 / 13 |
| naive-ui | 301.6 s | 268.5 s | 283.2 s | 1.12x | 1.07x | 1.06x | 0 / 23 |
| react-router | 51.6 s | 48.9 s | 50.3 s | 1.06x | 1.02x | 1.03x | 0 / 84 |
| solid-primitives | 3.8 s | 21.9 s | 3.4 s | 0.17x | 1.12x | 0.16x | 4 / 13 |
| taiga-ui | 375.1 s | 362.3 s | 57.9 s | 1.04x | 6.37x | 0.16x | 0 / 2604 |
| tanstack-query | 125.1 s | 82.0 s | 98.1 s | 1.53x | 1.28x | 1.20x | 1 / 1 |
| vueuse | 70.2 s | 35.4 s | 56.2 s | 1.98x | 1.25x | 1.57x | 0 / 58 |

Medians over 9 suites with valid jsdom rounds: warpdom vs jsdom 1.32x, happy-dom vs jsdom 1.17x, warpdom vs happy-dom 1.13x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.32x | 1.30-1.35x (95% CI) |
| downshift | 5 | 1.70x | 1.70-1.72x (95% CI) |
| melt-ui | 5 | 1.42x | 1.39-1.43x (95% CI) |
| naive-ui | 5 | 1.12x | 1.12-1.13x (95% CI) |
| react-router | 5 | 1.06x | 1.03-1.07x (95% CI) |
| solid-primitives | 5 | 0.17x | 0.17-1.15x (95% CI) |
| taiga-ui | 5 | 1.04x | 1.01-1.05x (95% CI) |
| tanstack-query | 5 | 1.53x | 1.52-1.53x (95% CI) |
| vueuse | 5 | 1.98x | 1.93-1.99x (95% CI) |

Median speedup over 9 suites: 1.32x (95% bootstrap interval 1.05-1.70x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.17x | 1.15-1.17x (95% CI) |
| downshift | 5 | 1.46x | 1.43-1.47x (95% CI) |
| melt-ui | 5 | 1.17x | 1.16-1.18x (95% CI) |
| naive-ui | 5 | 1.07x | 1.06-1.07x (95% CI) |
| react-router | 5 | 1.02x | 1.01-1.04x (95% CI) |
| solid-primitives | 5 | 1.12x | 1.09-1.12x (95% CI) |
| taiga-ui | 5 | 6.37x | 6.09-6.65x (95% CI) |
| tanstack-query | 5 | 1.28x | 1.27-1.28x (95% CI) |
| vueuse | 5 | 1.25x | 1.24-1.26x (95% CI) |

Median speedup over 9 suites: 1.17x (95% bootstrap interval 1.07-1.43x, suites and rounds resampled, 10000 resamples).
