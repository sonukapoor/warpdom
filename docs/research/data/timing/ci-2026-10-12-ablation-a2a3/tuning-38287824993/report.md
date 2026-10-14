| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 462.1 s | 372.8 s | — | — | 1.24x | 1.24x | 0 / — / — |
| analog | 5 | 32.2 s | 26.2 s | — | — | 1.23x | 1.23x | 0 / — / — |
| ariakit | 5 | 489.1 s | 385.1 s | — | — | 1.26x | 1.26x | 7 / — / — |
| ark-ui | 5 | 196.4 s | 126.6 s | — | — | 1.52x | 1.52x | 2 / — / — |
| emoji-picker-element | 5 | 30.3 s | 24.7 s | — | — | 1.23x | 1.23x | 0 / — / — |
| floating-ui | 5 | 25.7 s | 16.8 s | — | — | 1.53x | 1.53x | 0 / — / — |
| handsontable | 5 | 859.2 s | 92.6 s | — | — | 9.21x | 9.21x | 3 / — / — |
| material-ui | 5 | 259.7 s | 137.1 s | — | — | 1.90x | 1.90x | 0 / — / — |
| radix-primitives | 5 | 47.0 s | 25.0 s | — | — | 1.87x | 1.87x | 0 / — / — |
| react-hook-form | 5 | 13.7 s | 11.1 s | — | — | 1.23x | 1.23x | 0 / — / — |
| react-spectrum | 5 | 293.6 s | 238.0 s | — | — | 1.22x | 1.22x | 4 / — / — |
| solid | 5 | 3.2 s | 3.2 s | — | — | 1.00x | 1.00x | 1 / — / — |
| svelte | 5 | 80.9 s | 73.5 s | — | — | 1.09x | 1.09x | 1 / — / — |
| vuetify | 5 | 41.6 s | 28.2 s | — | — | 1.48x | 1.48x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.24x | 1.23-1.25x (95% CI) |
| analog | 5 | 1.23x | 1.22-1.29x (95% CI) |
| ariakit | 5 | 1.26x | 1.25-1.28x (95% CI) |
| ark-ui | 5 | 1.52x | 1.46-1.57x (95% CI) |
| emoji-picker-element | 5 | 1.23x | 1.21-1.24x (95% CI) |
| floating-ui | 5 | 1.53x | 1.50-1.58x (95% CI) |
| handsontable | 5 | 9.21x | 2.55-9.42x (95% CI) |
| material-ui | 5 | 1.90x | 1.89-1.90x (95% CI) |
| radix-primitives | 5 | 1.87x | 1.86-1.89x (95% CI) |
| react-hook-form | 5 | 1.23x | 1.19-1.29x (95% CI) |
| react-spectrum | 5 | 1.22x | 1.17-1.52x (95% CI) |
| solid | 5 | 1.00x | 1.00-1.03x (95% CI) |
| svelte | 5 | 1.09x | 1.07-1.29x (95% CI) |
| vuetify | 5 | 1.48x | 1.46-1.50x (95% CI) |

Median speedup over 14 suites: 1.25x (95% bootstrap interval 1.23-1.53x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | warpdom-default | 5 | 372.8 s | 1.24x | 1.23-1.25x (95% CI) | 0 |
| CopilotKit | warpdomeager-default | 5 | 374.0 s | 1.23x | 1.23-1.26x (95% CI) | 0 |
| CopilotKit | warpdomnocache-default | 5 | 374.3 s | 1.23x | 1.23-1.24x (95% CI) | 0 |
| analog | warpdom-default | 5 | 26.2 s | 1.23x | 1.22-1.29x (95% CI) | 0 |
| analog | warpdomeager-default | 5 | 26.3 s | 1.22x | 1.21-1.27x (95% CI) | 0 |
| analog | warpdomnocache-default | 5 | 26.1 s | 1.24x | 1.22-1.28x (95% CI) | 0 |
| ariakit | warpdom-default | 5 | 385.1 s | 1.26x | 1.25-1.28x (95% CI) | 7 |
| ariakit | warpdomeager-default | 5 | 387.0 s | 1.26x | 1.25-1.27x (95% CI) | 7 |
| ariakit | warpdomnocache-default | 5 | 388.2 s | 1.26x | 1.24-1.27x (95% CI) | 7 |
| ark-ui | warpdom-default | 5 | 126.6 s | 1.52x | 1.46-1.57x (95% CI) | 2 |
| ark-ui | warpdomeager-default | 5 | 127.3 s | 1.53x | 1.50-1.55x (95% CI) | 2 |
| ark-ui | warpdomnocache-default | 5 | 128.5 s | 1.53x | 1.51-1.55x (95% CI) | 2 |
| emoji-picker-element | warpdom-default | 5 | 24.7 s | 1.23x | 1.21-1.24x (95% CI) | 0 |
| emoji-picker-element | warpdomeager-default | 5 | 24.7 s | 1.23x | 1.22-1.23x (95% CI) | 0 |
| emoji-picker-element | warpdomnocache-default | 5 | 24.6 s | 1.23x | 1.23-1.24x (95% CI) | 0 |
| floating-ui | warpdom-default | 5 | 16.8 s | 1.53x | 1.50-1.58x (95% CI) | 0 |
| floating-ui | warpdomeager-default | 5 | 16.6 s | 1.55x | 1.51-1.57x (95% CI) | 0 |
| floating-ui | warpdomnocache-default | 5 | 16.5 s | 1.56x | 1.54-1.60x (95% CI) | 0 |
| handsontable | warpdom-default | 5 | 92.6 s | 9.21x | 2.55-9.42x (95% CI) | 3 |
| handsontable | warpdomeager-default | 5 | 92.6 s | 9.28x | 9.17-14.29x (95% CI) | 3 |
| handsontable | warpdomnocache-default | 5 | 91.2 s | 9.42x | 9.25-14.29x (95% CI) | 3 |
| material-ui | warpdom-default | 5 | 137.1 s | 1.90x | 1.89-1.90x (95% CI) | 0 |
| material-ui | warpdomeager-default | 5 | 138.2 s | 1.88x | 1.87-1.88x (95% CI) | 0 |
| material-ui | warpdomnocache-default | 5 | 136.9 s | 1.90x | 1.89-1.91x (95% CI) | 0 |
| radix-primitives | warpdom-default | 5 | 25.0 s | 1.87x | 1.86-1.89x (95% CI) | 0 |
| radix-primitives | warpdomeager-default | 5 | 25.4 s | 1.85x | 1.83-1.86x (95% CI) | 0 |
| radix-primitives | warpdomnocache-default | 5 | 25.4 s | 1.84x | 1.84-1.86x (95% CI) | 0 |
| react-hook-form | warpdom-default | 5 | 11.1 s | 1.23x | 1.19-1.29x (95% CI) | 0 |
| react-hook-form | warpdomeager-default | 5 | 11.2 s | 1.22x | 1.21-1.30x (95% CI) | 0 |
| react-hook-form | warpdomnocache-default | 5 | 11.1 s | 1.23x | 1.21-1.31x (95% CI) | 0 |
| react-spectrum | warpdom-default | 5 | 238.0 s | 1.22x | 1.17-1.52x (95% CI) | 4 |
| react-spectrum | warpdomeager-default | 5 | 237.9 s | 1.23x | 1.21-1.48x (95% CI) | 4 |
| react-spectrum | warpdomnocache-default | 5 | 238.7 s | 1.23x | 1.16-1.48x (95% CI) | 4 |
| solid | warpdom-default | 5 | 3.2 s | 1.00x | 1.00-1.03x (95% CI) | 1 |
| solid | warpdomeager-default | 5 | 3.2 s | 1.00x | 0.97-1.00x (95% CI) | 1 |
| solid | warpdomnocache-default | 5 | 3.1 s | 1.03x | 1.03-1.03x (95% CI) | 1 |
| svelte | warpdom-default | 5 | 73.5 s | 1.09x | 1.07-1.29x (95% CI) | 1 |
| svelte | warpdomeager-default | 5 | 72.8 s | 1.10x | 1.06-1.31x (95% CI) | 1 |
| svelte | warpdomnocache-default | 5 | 72.8 s | 1.09x | 1.05-1.29x (95% CI) | 1 |
| vuetify | warpdom-default | 5 | 28.2 s | 1.48x | 1.46-1.50x (95% CI) | 0 |
| vuetify | warpdomeager-default | 5 | 28.4 s | 1.46x | 1.44-1.49x (95% CI) | 0 |
| vuetify | warpdomnocache-default | 5 | 28.4 s | 1.47x | 1.46-1.50x (95% CI) | 0 |
