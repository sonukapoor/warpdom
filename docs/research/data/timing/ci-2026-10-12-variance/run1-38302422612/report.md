| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 449.9 s | 362.4 s | — | — | 1.24x | 1.24x | 0 / — / — |
| analog | 5 | 32.6 s | 26.3 s | — | — | 1.24x | 1.24x | 0 / — / — |
| ariakit | 5 | 530.1 s | 406.8 s | — | — | 1.31x | 1.31x | 7 / — / — |
| ark-ui | 5 | 211.9 s | 133.2 s | — | — | 1.59x | 1.59x | 2 / — / — |
| emoji-picker-element | 5 | 36.6 s | 28.7 s | — | — | 1.28x | 1.28x | 0 / — / — |
| floating-ui | 5 | 22.2 s | 15.0 s | — | — | 1.48x | 1.48x | 0 / — / — |
| handsontable | 5 | 813.5 s | 89.2 s | — | — | 9.02x | 9.02x | 3 / — / — |
| material-ui | 5 | 272.3 s | 144.1 s | — | — | 1.89x | 1.89x | 0 / — / — |
| radix-primitives | 5 | 46.5 s | 25.0 s | — | — | 1.87x | 1.87x | 0 / — / — |
| react-hook-form | 5 | 15.1 s | 11.7 s | — | — | 1.26x | 1.26x | 0 / — / — |
| react-spectrum | 5 | 407.1 s | 322.2 s | — | — | 1.26x | 1.26x | 4 / — / — |
| solid | 5 | 3.4 s | 3.3 s | — | — | 1.03x | 1.03x | 1 / — / — |
| svelte | 5 | 95.3 s | 87.0 s | — | — | 1.09x | 1.09x | 1 / — / — |
| vuetify | 5 | 47.2 s | 31.4 s | — | — | 1.51x | 1.51x | 0 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 449.9 s | 362.4 s | 48.0 s | 1.24x | 9.40x | 0.13x | 0 / 4681 |
| analog | 32.6 s | 26.3 s | 28.7 s | 1.24x | 1.13x | 1.08x | 0 / 2 |
| ariakit | 530.1 s | 406.8 s | 233.7 s | 1.31x | 2.28x | 0.57x | 7 / 51 |
| ark-ui | 211.9 s | 133.2 s | 145.0 s | 1.59x | 1.45x | 1.09x | 2 / 116 |
| emoji-picker-element | 36.6 s | 28.7 s | 31.7 s | 1.28x | 1.15x | 1.10x | 0 / 1 |
| floating-ui | 22.2 s | 15.0 s | 17.5 s | 1.48x | 1.27x | 1.16x | 0 / 14 |
| handsontable | 813.5 s | 89.2 s | — | 9.02x | — | — | 3 / 7646 |
| material-ui | 272.3 s | 144.1 s | 194.4 s | 1.89x | 1.40x | 1.35x | 0 / 1042 |
| radix-primitives | 46.5 s | 25.0 s | 31.0 s | 1.87x | 1.50x | 1.23x | 0 / 18 |
| react-hook-form | 15.1 s | 11.7 s | 15.1 s | 1.26x | 0.96x | 1.30x | 0 / 8 |
| react-spectrum | 407.1 s | 322.2 s | 332.6 s | 1.26x | 1.22x | 1.03x | 4 / 1520 |
| solid | 3.4 s | 3.3 s | 3.1 s | 1.03x | 1.10x | 0.94x | 1 / 0 |
| svelte | 95.3 s | 87.0 s | 88.3 s | 1.09x | 1.05x | 1.04x | 1 / 288 |
| vuetify | 47.2 s | 31.4 s | 31.0 s | 1.51x | 1.53x | 0.99x | 0 / 4 |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.29x, happy-dom vs jsdom 1.27x, warpdom vs happy-dom 1.08x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.24x | 1.24-1.24x (95% CI) |
| analog | 5 | 1.24x | 1.21-1.26x (95% CI) |
| ariakit | 5 | 1.31x | 1.28-1.31x (95% CI) |
| ark-ui | 5 | 1.59x | 1.57-1.62x (95% CI) |
| emoji-picker-element | 5 | 1.28x | 1.27-1.30x (95% CI) |
| floating-ui | 5 | 1.48x | 1.41-1.53x (95% CI) |
| handsontable | 4 | 9.02x | 8.37-9.16x (range) |
| material-ui | 5 | 1.89x | 1.87-1.90x (95% CI) |
| radix-primitives | 5 | 1.87x | 1.82-1.89x (95% CI) |
| react-hook-form | 5 | 1.26x | 1.24-1.30x (95% CI) |
| react-spectrum | 5 | 1.26x | 1.19-1.32x (95% CI) |
| solid | 5 | 1.03x | 1.00-1.09x (95% CI) |
| svelte | 5 | 1.09x | 1.07-1.11x (95% CI) |
| vuetify | 5 | 1.51x | 1.50-1.52x (95% CI) |

Median speedup over 14 suites: 1.29x (95% bootstrap interval 1.24-1.58x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 9.40x | 9.32-9.51x (95% CI) |
| analog | 5 | 1.13x | 1.13-1.15x (95% CI) |
| ariakit | 5 | 2.28x | 2.26-2.30x (95% CI) |
| ark-ui | 5 | 1.45x | 1.41-1.49x (95% CI) |
| emoji-picker-element | 5 | 1.15x | 1.14-1.16x (95% CI) |
| floating-ui | 5 | 1.27x | 1.24-1.28x (95% CI) |
| material-ui | 5 | 1.40x | 1.39-1.42x (95% CI) |
| radix-primitives | 5 | 1.50x | 1.48-1.52x (95% CI) |
| react-hook-form | 5 | 0.96x | 0.96-1.00x (95% CI) |
| react-spectrum | 5 | 1.22x | 1.19-1.27x (95% CI) |
| solid | 5 | 1.10x | 1.06-1.13x (95% CI) |
| svelte | 5 | 1.05x | 1.03-1.12x (95% CI) |
| vuetify | 5 | 1.53x | 1.51-1.53x (95% CI) |

Median speedup over 13 suites: 1.27x (95% bootstrap interval 1.13-1.51x, suites and rounds resampled, 10000 resamples).
