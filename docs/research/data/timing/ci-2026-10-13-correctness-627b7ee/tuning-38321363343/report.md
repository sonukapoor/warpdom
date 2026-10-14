| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 1 | 454.3 s | 373.0 s | — | — | 1.22x | 1.22x | 0 / — / — |
| analog | 1 | 32.0 s | 25.9 s | — | — | 1.24x | 1.24x | 0 / — / — |
| ariakit | 1 | 619.6 s | 454.7 s | — | — | 1.36x | 1.36x | 7 / — / — |
| ark-ui | 1 | 138.4 s | 88.7 s | — | — | 1.56x | 1.56x | 1 / — / — |
| emoji-picker-element | 1 | 37.1 s | 29.1 s | — | — | 1.27x | 1.27x | 0 / — / — |
| floating-ui | 1 | 24.4 s | 16.0 s | — | — | 1.52x | 1.52x | 0 / — / — |
| handsontable | 1 | 824.9 s | 89.4 s | — | — | 9.23x | 9.23x | 3 / — / — |
| material-ui | 1 | 271.9 s | 144.3 s | — | — | 1.88x | 1.88x | 0 / — / — |
| radix-primitives | 1 | 28.7 s | 15.9 s | — | — | 1.81x | 1.81x | 0 / — / — |
| react-hook-form | 1 | 13.6 s | 11.0 s | — | — | 1.24x | 1.24x | 0 / — / — |
| react-spectrum | 1 | 399.5 s | 318.6 s | — | — | 1.25x | 1.25x | 0 / — / — |
| solid | 1 | 2.1 s | 2.1 s | — | — | 1.00x | 1.00x | 1 / — / — |
| svelte | 1 | 70.7 s | 66.8 s | — | — | 1.06x | 1.06x | 1 / — / — |
| vuetify | 1 | 40.2 s | 26.6 s | — | — | 1.51x | 1.51x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 1 | 1.22x | 1.22-1.22x (range) |
| analog | 1 | 1.24x | 1.24-1.24x (range) |
| ariakit | 1 | 1.36x | 1.36-1.36x (range) |
| ark-ui | 1 | 1.56x | 1.56-1.56x (range) |
| emoji-picker-element | 1 | 1.27x | 1.27-1.27x (range) |
| floating-ui | 1 | 1.52x | 1.52-1.52x (range) |
| handsontable | 1 | 9.23x | 9.23-9.23x (range) |
| material-ui | 1 | 1.88x | 1.88-1.88x (range) |
| radix-primitives | 1 | 1.81x | 1.81-1.81x (range) |
| react-hook-form | 1 | 1.24x | 1.24-1.24x (range) |
| react-spectrum | 1 | 1.25x | 1.25-1.25x (range) |
| solid | 1 | 1.00x | 1.00-1.00x (range) |
| svelte | 1 | 1.06x | 1.06-1.06x (range) |
| vuetify | 1 | 1.51x | 1.51-1.51x (range) |

Median speedup over 14 suites: 1.32x (95% bootstrap interval 1.24-1.56x, suites and rounds resampled, 10000 resamples).
