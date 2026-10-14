| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 5 | 5.8 s | 4.4 s | — | — | 1.30x | 1.30x | 0 / — / — |
| downshift | 5 | 14.5 s | 8.5 s | — | — | 1.70x | 1.70x | 0 / — / — |
| melt-ui | 5 | 37.4 s | 27.2 s | — | — | 1.38x | 1.38x | 1 / — / — |
| naive-ui | 5 | 259.6 s | 230.8 s | — | — | 1.13x | 1.13x | 0 / — / — |
| react-router | 5 | 53.3 s | 50.3 s | — | — | 1.06x | 1.06x | 0 / — / — |
| solid-primitives | 5 | 5.2 s | 4.5 s | — | — | 1.13x | 1.13x | 4 / — / — |
| taiga-ui | 5 | 463.8 s | 452.0 s | — | — | 1.03x | 1.03x | 0 / — / — |
| tanstack-query | 5 | 128.9 s | 84.7 s | — | — | 1.52x | 1.52x | 1 / — / — |
| vueuse | 5 | 81.1 s | 42.3 s | — | — | 1.91x | 1.91x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.30x | 1.23-1.32x (95% CI) |
| downshift | 5 | 1.70x | 1.60-1.72x (95% CI) |
| melt-ui | 5 | 1.38x | 1.35-3.17x (95% CI) |
| naive-ui | 5 | 1.13x | 1.10-1.13x (95% CI) |
| react-router | 5 | 1.06x | 1.04-1.07x (95% CI) |
| solid-primitives | 5 | 1.13x | 0.23-1.22x (95% CI) |
| taiga-ui | 5 | 1.03x | 1.02-1.03x (95% CI) |
| tanstack-query | 5 | 1.52x | 1.52-1.55x (95% CI) |
| vueuse | 5 | 1.91x | 1.91-1.93x (95% CI) |

Median speedup over 9 suites: 1.30x (95% bootstrap interval 1.06-1.67x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | warpdom-default | 5 | 4.4 s | 1.30x | 1.23-1.32x (95% CI) | 0 |
| dom-testing-library | warpdomeager-default | 5 | 4.5 s | 1.29x | 1.26-1.53x (95% CI) | 0 |
| dom-testing-library | warpdomnocache-default | 5 | 4.5 s | 1.29x | 1.27-1.53x (95% CI) | 0 |
| downshift | warpdom-default | 5 | 8.5 s | 1.70x | 1.60-1.72x (95% CI) | 0 |
| downshift | warpdomeager-default | 5 | 8.5 s | 1.72x | 1.65-2.16x (95% CI) | 0 |
| downshift | warpdomnocache-default | 5 | 8.3 s | 1.76x | 1.70-2.19x (95% CI) | 0 |
| melt-ui | warpdom-default | 5 | 27.2 s | 1.38x | 1.35-3.17x (95% CI) | 1 |
| melt-ui | warpdomeager-default | 5 | 27.1 s | 1.38x | 1.35-3.18x (95% CI) | 1 |
| melt-ui | warpdomnocache-default | 5 | 27.3 s | 1.37x | 1.34-3.18x (95% CI) | 1 |
| naive-ui | warpdom-default | 5 | 230.8 s | 1.13x | 1.10-1.13x (95% CI) | 0 |
| naive-ui | warpdomeager-default | 5 | 231.3 s | 1.12x | 1.11-1.13x (95% CI) | 0 |
| naive-ui | warpdomnocache-default | 5 | 230.3 s | 1.12x | 1.11-1.14x (95% CI) | 0 |
| react-router | warpdom-default | 5 | 50.3 s | 1.06x | 1.04-1.07x (95% CI) | 0 |
| react-router | warpdomeager-default | 5 | 50.1 s | 1.06x | 1.05-1.16x (95% CI) | 0 |
| react-router | warpdomnocache-default | 5 | 50.8 s | 1.04x | 1.03-1.17x (95% CI) | 0 |
| solid-primitives | warpdom-default | 5 | 4.5 s | 1.13x | 0.23-1.22x (95% CI) | 4 |
| solid-primitives | warpdomeager-default | 5 | 4.7 s | 1.13x | 1.09-1.15x (95% CI) | 0 |
| solid-primitives | warpdomnocache-default | 5 | 4.6 s | 1.13x | 0.23-1.20x (95% CI) | 4 |
| taiga-ui | warpdom-default | 5 | 452.0 s | 1.03x | 1.02-1.03x (95% CI) | 0 |
| taiga-ui | warpdomeager-default | 5 | 452.0 s | 1.02x | 1.02-1.08x (95% CI) | 0 |
| taiga-ui | warpdomnocache-default | 5 | 449.9 s | 1.03x | 1.01-1.07x (95% CI) | 0 |
| tanstack-query | warpdom-default | 5 | 84.7 s | 1.52x | 1.52-1.55x (95% CI) | 1 |
| tanstack-query | warpdomeager-default | 5 | 84.7 s | 1.52x | 1.51-1.53x (95% CI) | 1 |
| tanstack-query | warpdomnocache-default | 5 | 84.1 s | 1.53x | 1.52-1.56x (95% CI) | 1 |
| vueuse | warpdom-default | 5 | 42.3 s | 1.91x | 1.91-1.93x (95% CI) | 0 |
| vueuse | warpdomeager-default | 5 | 42.7 s | 1.90x | 1.88-1.91x (95% CI) | 0 |
| vueuse | warpdomnocache-default | 5 | 42.1 s | 1.93x | 1.89-1.93x (95% CI) | 0 |
