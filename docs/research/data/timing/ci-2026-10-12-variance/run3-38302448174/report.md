| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| analog | 5 | 32.5 s | 26.4 s | — | — | 1.23x | 1.23x | 0 / — / — |
| ariakit | 5 | 614.3 s | 450.0 s | — | — | 1.37x | 1.37x | 7 / — / — |
| ark-ui | 5 | 210.3 s | 134.2 s | — | — | 1.56x | 1.56x | 3 / — / — |
| CopilotKit | 5 | 464.8 s | 369.3 s | — | — | 1.26x | 1.26x | 0 / — / — |
| emoji-picker-element | 5 | 27.3 s | 22.9 s | — | — | 1.20x | 1.20x | 0 / — / — |
| floating-ui | 5 | 16.9 s | 11.3 s | — | — | 1.49x | 1.49x | 0 / — / — |
| material-ui | 5 | 273.0 s | 145.1 s | — | — | 1.88x | 1.88x | 0 / — / — |
| radix-primitives | 5 | 46.9 s | 25.3 s | — | — | 1.87x | 1.87x | 0 / — / — |
| react-hook-form | 5 | 12.8 s | 10.6 s | — | — | 1.21x | 1.21x | 0 / — / — |
| react-spectrum | 5 | 416.2 s | 337.7 s | — | — | 1.23x | 1.23x | 4 / — / — |
| solid | 5 | 3.0 s | 2.9 s | — | — | 1.03x | 1.03x | 1 / — / — |
| svelte | 5 | 64.0 s | 58.9 s | — | — | 1.07x | 1.07x | 1 / — / — |
| vuetify | 5 | 36.6 s | 24.0 s | — | — | 1.53x | 1.53x | 0 / — / — |
| handsontable | 5 | 808.3 s | 89.6 s | — | — | 9.00x | 9.00x | 3 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| analog | 32.5 s | 26.4 s | 28.5 s | 1.23x | 1.14x | 1.08x | 0 / 2 |
| ariakit | 614.3 s | 450.0 s | 284.4 s | 1.37x | 2.16x | 0.63x | 7 / 51 |
| ark-ui | 210.3 s | 134.2 s | 146.3 s | 1.56x | 1.42x | 1.09x | 3 / 115 |
| CopilotKit | 464.8 s | 369.3 s | 49.4 s | 1.26x | 9.46x | 0.13x | 0 / 4681 |
| emoji-picker-element | 27.3 s | 22.9 s | 24.4 s | 1.20x | 1.12x | 1.07x | 0 / 1 |
| floating-ui | 16.9 s | 11.3 s | 13.7 s | 1.49x | 1.23x | 1.21x | 0 / 14 |
| material-ui | 273.0 s | 145.1 s | 194.4 s | 1.88x | 1.41x | 1.34x | 0 / 1042 |
| radix-primitives | 46.9 s | 25.3 s | 31.1 s | 1.87x | 1.49x | 1.23x | 0 / 18 |
| react-hook-form | 12.8 s | 10.6 s | 14.2 s | 1.21x | 0.90x | 1.34x | 0 / 8 |
| react-spectrum | 416.2 s | 337.7 s | 339.9 s | 1.23x | 1.23x | 1.00x | 4 / 1454 |
| solid | 3.0 s | 2.9 s | 2.7 s | 1.03x | 1.11x | 0.93x | 1 / 0 |
| svelte | 64.0 s | 58.9 s | 61.2 s | 1.07x | 1.03x | 1.03x | 1 / 288 |
| vuetify | 36.6 s | 24.0 s | 24.1 s | 1.53x | 1.52x | 1.01x | 0 / 4 |
| handsontable | 808.3 s | 89.6 s | — | 9.00x | — | — | 3 / 7646 |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.31x, happy-dom vs jsdom 1.23x, warpdom vs happy-dom 1.07x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| analog | 5 | 1.23x | 1.22-1.23x (95% CI) |
| ariakit | 5 | 1.37x | 1.36-1.38x (95% CI) |
| ark-ui | 5 | 1.56x | 1.53-1.60x (95% CI) |
| CopilotKit | 5 | 1.26x | 1.22-1.27x (95% CI) |
| emoji-picker-element | 5 | 1.20x | 1.18-1.24x (95% CI) |
| floating-ui | 5 | 1.49x | 1.47-1.56x (95% CI) |
| material-ui | 5 | 1.88x | 1.86-1.90x (95% CI) |
| radix-primitives | 5 | 1.87x | 1.82-1.88x (95% CI) |
| react-hook-form | 5 | 1.21x | 1.19-1.23x (95% CI) |
| react-spectrum | 5 | 1.23x | 1.20-1.25x (95% CI) |
| solid | 5 | 1.03x | 1.00-1.03x (95% CI) |
| svelte | 5 | 1.07x | 1.06-1.09x (95% CI) |
| vuetify | 5 | 1.53x | 1.49-1.55x (95% CI) |
| handsontable | 4 | 9.00x | 8.80-9.25x (range) |

Median speedup over 14 suites: 1.31x (95% bootstrap interval 1.21-1.56x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| analog | 5 | 1.14x | 1.13-1.15x (95% CI) |
| ariakit | 5 | 2.16x | 2.15-2.19x (95% CI) |
| ark-ui | 5 | 1.42x | 1.41-1.45x (95% CI) |
| CopilotKit | 5 | 9.46x | 8.53-9.67x (95% CI) |
| emoji-picker-element | 5 | 1.12x | 1.10-1.16x (95% CI) |
| floating-ui | 5 | 1.23x | 1.22-1.28x (95% CI) |
| material-ui | 5 | 1.41x | 1.39-1.41x (95% CI) |
| radix-primitives | 5 | 1.49x | 1.48-1.52x (95% CI) |
| react-hook-form | 5 | 0.90x | 0.90-0.93x (95% CI) |
| react-spectrum | 5 | 1.23x | 1.21-1.23x (95% CI) |
| solid | 5 | 1.11x | 1.07-1.11x (95% CI) |
| svelte | 5 | 1.03x | 1.03-1.05x (95% CI) |
| vuetify | 5 | 1.52x | 1.51-1.54x (95% CI) |

Median speedup over 13 suites: 1.23x (95% bootstrap interval 1.12-1.52x, suites and rounds resampled, 10000 resamples).
