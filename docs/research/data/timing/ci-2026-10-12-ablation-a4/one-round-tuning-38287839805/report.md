| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 1 | 346.5 s | 284.9 s | — | — | 1.22x | 1.22x | 0 / — / — |
| analog | 1 | 26.4 s | 20.6 s | — | — | 1.28x | 1.28x | 0 / — / — |
| ariakit | 1 | 620.3 s | 453.7 s | — | — | 1.37x | 1.37x | 7 / — / — |
| ark-ui | 1 | 189.0 s | 119.6 s | — | — | 1.58x | 1.58x | 1 / — / — |
| emoji-picker-element | 1 | 37.3 s | 29.0 s | — | — | 1.29x | 1.29x | 0 / — / — |
| floating-ui | 1 | 14.4 s | 9.6 s | — | — | 1.50x | 1.50x | 0 / — / — |
| handsontable | 1 | 1217.4 s | 485.1 s | — | — | 2.51x | 2.51x | 3 / — / — |
| material-ui | 1 | 184.2 s | 92.7 s | — | — | 1.99x | 1.99x | 0 / — / — |
| radix-primitives | 1 | 44.4 s | 23.5 s | — | — | 1.89x | 1.89x | 0 / — / — |
| react-hook-form | 1 | 9.1 s | 7.2 s | — | — | 1.26x | 1.26x | 0 / — / — |
| react-spectrum | 1 | 358.4 s | 254.2 s | — | — | 1.41x | 1.41x | 4 / — / — |
| solid | 1 | 3.4 s | 3.4 s | — | — | 1.00x | 1.00x | 1 / — / — |
| svelte | 1 | 87.1 s | 73.8 s | — | — | 1.18x | 1.18x | 1 / — / — |
| vuetify | 1 | 36.0 s | 23.3 s | — | — | 1.55x | 1.55x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 1 | 1.22x | 1.22-1.22x (range) |
| analog | 1 | 1.28x | 1.28-1.28x (range) |
| ariakit | 1 | 1.37x | 1.37-1.37x (range) |
| ark-ui | 1 | 1.58x | 1.58-1.58x (range) |
| emoji-picker-element | 1 | 1.29x | 1.29-1.29x (range) |
| floating-ui | 1 | 1.50x | 1.50-1.50x (range) |
| handsontable | 1 | 2.51x | 2.51-2.51x (range) |
| material-ui | 1 | 1.99x | 1.99-1.99x (range) |
| radix-primitives | 1 | 1.89x | 1.89-1.89x (range) |
| react-hook-form | 1 | 1.26x | 1.26-1.26x (range) |
| react-spectrum | 1 | 1.41x | 1.41-1.41x (range) |
| solid | 1 | 1.00x | 1.00-1.00x (range) |
| svelte | 1 | 1.18x | 1.18-1.18x (range) |
| vuetify | 1 | 1.55x | 1.55-1.55x (range) |

Median speedup over 14 suites: 1.39x (95% bootstrap interval 1.26-1.58x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | warpdom-default | 1 | 284.9 s | 1.22x | 1.22-1.22x (range) | 0 |
| CopilotKit | warpdomlatest-default | 1 | 285.3 s | 1.21x | 1.21-1.21x (range) | 1 |
| analog | warpdom-default | 1 | 20.6 s | 1.28x | 1.28-1.28x (range) | 0 |
| analog | warpdomlatest-default | 1 | 21.2 s | 1.25x | 1.25-1.25x (range) | 0 |
| ariakit | warpdom-default | 1 | 453.7 s | 1.37x | 1.37-1.37x (range) | 7 |
| ariakit | warpdomlatest-default | 1 | 453.9 s | 1.37x | 1.37-1.37x (range) | 7 |
| ark-ui | warpdom-default | 1 | 119.6 s | 1.58x | 1.58-1.58x (range) | 1 |
| ark-ui | warpdomlatest-default | 1 | 119.4 s | 1.58x | 1.58-1.58x (range) | 4 |
| emoji-picker-element | warpdom-default | 1 | 29.0 s | 1.29x | 1.29-1.29x (range) | 0 |
| emoji-picker-element | warpdomlatest-default | 1 | 28.9 s | 1.29x | 1.29-1.29x (range) | 0 |
| floating-ui | warpdom-default | 1 | 9.6 s | 1.50x | 1.50-1.50x (range) | 0 |
| floating-ui | warpdomlatest-default | 1 | 9.9 s | 1.45x | 1.45-1.45x (range) | 0 |
| handsontable | warpdom-default | 1 | 485.1 s | 2.51x | 2.51-2.51x (range) | 3 |
| handsontable | warpdomlatest-default | 1 | 88.9 s | 13.69x | 13.69-13.69x (range) | 23 |
| material-ui | warpdom-default | 1 | 92.7 s | 1.99x | 1.99-1.99x (range) | 0 |
| material-ui | warpdomlatest-default | 1 | 91.0 s | 2.02x | 2.02-2.02x (range) | 0 |
| radix-primitives | warpdom-default | 1 | 23.5 s | 1.89x | 1.89-1.89x (range) | 0 |
| radix-primitives | warpdomlatest-default | 1 | 23.6 s | 1.88x | 1.88-1.88x (range) | 0 |
| react-hook-form | warpdom-default | 1 | 7.2 s | 1.26x | 1.26-1.26x (range) | 0 |
| react-hook-form | warpdomlatest-default | 1 | 7.4 s | 1.23x | 1.23-1.23x (range) | 0 |
| react-spectrum | warpdom-default | 1 | 254.2 s | 1.41x | 1.41-1.41x (range) | 4 |
| react-spectrum | warpdomlatest-default | 1 | 246.2 s | 1.46x | 1.46-1.46x (range) | 143 |
| solid | warpdom-default | 1 | 3.4 s | 1.00x | 1.00-1.00x (range) | 1 |
| solid | warpdomlatest-default | 1 | 3.4 s | 1.00x | 1.00-1.00x (range) | 1 |
| svelte | warpdom-default | 1 | 73.8 s | 1.18x | 1.18-1.18x (range) | 1 |
| svelte | warpdomlatest-default | 1 | 73.7 s | 1.18x | 1.18-1.18x (range) | 25 |
| vuetify | warpdom-default | 1 | 23.3 s | 1.55x | 1.55-1.55x (range) | 0 |
| vuetify | warpdomlatest-default | 1 | 22.7 s | 1.59x | 1.59-1.59x (range) | 0 |
