| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 453.5 s | 365.7 s | — | — | 1.24x | 1.24x | 0 / — / — |
| analog | 5 | 25.9 s | 21.3 s | — | — | 1.21x | 1.21x | 0 / — / — |
| ariakit | 5 | 610.4 s | 448.4 s | — | — | 1.36x | 1.36x | 7 / — / — |
| ark-ui | 5 | 209.3 s | 134.2 s | — | — | 1.56x | 1.56x | 2 / — / — |
| emoji-picker-element | 5 | 30.7 s | 25.0 s | — | — | 1.23x | 1.23x | 0 / — / — |
| floating-ui | 5 | 25.1 s | 16.2 s | — | — | 1.55x | 1.55x | 0 / — / — |
| handsontable | 5 | 807.3 s | 89.3 s | — | — | 9.01x | 9.01x | 3 / — / — |
| material-ui | 5 | 266.3 s | 141.4 s | — | — | 1.88x | 1.88x | 0 / — / — |
| radix-primitives | 5 | 46.7 s | 25.0 s | — | — | 1.86x | 1.86x | 0 / — / — |
| react-hook-form | 5 | 10.9 s | 9.1 s | — | — | 1.23x | 1.23x | 0 / — / — |
| react-spectrum | 5 | 242.7 s | 210.1 s | — | — | 1.25x | 1.25x | 4 / — / — |
| solid | 5 | 2.6 s | 2.5 s | — | — | 1.00x | 1.00x | 1 / — / — |
| svelte | 5 | 54.8 s | 50.5 s | — | — | 1.08x | 1.08x | 1 / — / — |
| vuetify | 5 | 36.4 s | 23.4 s | — | — | 1.55x | 1.55x | 0 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 453.5 s | 365.7 s | 48.8 s | 1.24x | 9.34x | 0.13x | 0 / 4681 |
| analog | 25.9 s | 21.3 s | 22.8 s | 1.21x | 1.14x | 1.07x | 0 / 2 |
| ariakit | 610.4 s | 448.4 s | 282.6 s | 1.36x | 2.16x | 0.63x | 7 / 51 |
| ark-ui | 209.3 s | 134.2 s | 143.5 s | 1.56x | 1.46x | 1.09x | 2 / 116 |
| emoji-picker-element | 30.7 s | 25.0 s | 26.9 s | 1.23x | 1.14x | 1.08x | 0 / 1 |
| floating-ui | 25.1 s | 16.2 s | 19.8 s | 1.55x | 1.27x | 1.23x | 0 / 14 |
| handsontable | 807.3 s | 89.3 s | — | 9.01x | — | — | 3 / 7646 |
| material-ui | 266.3 s | 141.4 s | 190.7 s | 1.88x | 1.40x | 1.35x | 0 / 1042 |
| radix-primitives | 46.7 s | 25.0 s | 30.9 s | 1.86x | 1.51x | 1.22x | 0 / 18 |
| react-hook-form | 10.9 s | 9.1 s | 12.7 s | 1.23x | 0.89x | 1.39x | 0 / 8 |
| react-spectrum | 242.7 s | 210.1 s | 213.4 s | 1.25x | 1.16x | 1.04x | 4 / 1474 |
| solid | 2.6 s | 2.5 s | 2.4 s | 1.00x | 1.08x | 0.96x | 1 / 0 |
| svelte | 54.8 s | 50.5 s | 50.6 s | 1.08x | 1.08x | 1.00x | 1 / 288 |
| vuetify | 36.4 s | 23.4 s | 23.8 s | 1.55x | 1.54x | 1.01x | 0 / 4 |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.31x, happy-dom vs jsdom 1.27x, warpdom vs happy-dom 1.07x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.24x | 1.24-1.25x (95% CI) |
| analog | 5 | 1.21x | 1.20-1.25x (95% CI) |
| ariakit | 5 | 1.36x | 1.36-1.36x (95% CI) |
| ark-ui | 5 | 1.56x | 1.52-1.64x (95% CI) |
| emoji-picker-element | 5 | 1.23x | 1.20-1.27x (95% CI) |
| floating-ui | 5 | 1.55x | 1.53-1.60x (95% CI) |
| handsontable | 4 | 9.01x | 8.80-9.24x (range) |
| material-ui | 5 | 1.88x | 1.87-1.90x (95% CI) |
| radix-primitives | 5 | 1.86x | 1.84-1.88x (95% CI) |
| react-hook-form | 5 | 1.23x | 1.16-1.24x (95% CI) |
| react-spectrum | 5 | 1.25x | 1.15-1.32x (95% CI) |
| solid | 5 | 1.00x | 1.00-1.04x (95% CI) |
| svelte | 5 | 1.08x | 1.05-1.11x (95% CI) |
| vuetify | 5 | 1.55x | 1.52-1.58x (95% CI) |

Median speedup over 14 suites: 1.31x (95% bootstrap interval 1.22-1.57x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 9.34x | 9.25-9.35x (95% CI) |
| analog | 5 | 1.14x | 1.10-1.18x (95% CI) |
| ariakit | 5 | 2.16x | 2.16-2.17x (95% CI) |
| ark-ui | 5 | 1.46x | 1.42-1.51x (95% CI) |
| emoji-picker-element | 5 | 1.14x | 1.12-1.16x (95% CI) |
| floating-ui | 5 | 1.27x | 1.25-1.28x (95% CI) |
| material-ui | 5 | 1.40x | 1.39-1.41x (95% CI) |
| radix-primitives | 5 | 1.51x | 1.49-1.54x (95% CI) |
| react-hook-form | 5 | 0.89x | 0.83-0.89x (95% CI) |
| react-spectrum | 5 | 1.16x | 1.11-1.25x (95% CI) |
| solid | 5 | 1.08x | 1.04-1.13x (95% CI) |
| svelte | 5 | 1.08x | 1.05-1.09x (95% CI) |
| vuetify | 5 | 1.54x | 1.50-1.55x (95% CI) |

Median speedup over 13 suites: 1.27x (95% bootstrap interval 1.12-1.51x, suites and rounds resampled, 10000 resamples).
