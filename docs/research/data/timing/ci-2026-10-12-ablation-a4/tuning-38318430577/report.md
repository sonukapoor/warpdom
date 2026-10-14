| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 2 | 450.2 s | 363.2 s | — | — | 1.24x | 1.24x | 0 / — / — |
| analog | 2 | 32.3 s | 26.3 s | — | — | 1.23x | 1.23x | 0 / — / — |
| ariakit | 2 | 474.6 s | 374.0 s | — | — | 1.27x | 1.27x | 7 / — / — |
| ark-ui | 2 | 123.6 s | 81.3 s | — | — | 1.52x | 1.52x | 0 / — / — |
| emoji-picker-element | 2 | 36.0 s | 28.6 s | — | — | 1.26x | 1.26x | 0 / — / — |
| floating-ui | 2 | 25.3 s | 16.2 s | — | — | 1.56x | 1.56x | 0 / — / — |
| handsontable | 2 | 714.9 s | 80.3 s | — | — | 8.90x | 8.90x | 3 / — / — |
| material-ui | 2 | 204.4 s | 109.5 s | — | — | 1.87x | 1.87x | 0 / — / — |
| radix-primitives | 2 | 46.3 s | 25.0 s | — | — | 1.85x | 1.85x | 0 / — / — |
| react-hook-form | 2 | 9.6 s | 7.6 s | — | — | 1.26x | 1.26x | 0 / — / — |
| react-spectrum | 2 | 358.9 s | 285.8 s | — | — | 1.26x | 1.26x | 4 / — / — |
| solid | 2 | 2.5 s | 2.5 s | — | — | 0.98x | 0.98x | 1 / — / — |
| svelte | 2 | 77.0 s | 73.6 s | — | — | 1.05x | 1.05x | 1 / — / — |
| vuetify | 2 | 42.0 s | 27.9 s | — | — | 1.50x | 1.50x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 2 | 1.24x | 1.23-1.25x (range) |
| analog | 2 | 1.23x | 1.22-1.23x (range) |
| ariakit | 2 | 1.27x | 1.27-1.27x (range) |
| ark-ui | 2 | 1.52x | 1.49-1.55x (range) |
| emoji-picker-element | 2 | 1.26x | 1.26-1.26x (range) |
| floating-ui | 2 | 1.56x | 1.52-1.60x (range) |
| handsontable | 2 | 8.90x | 8.87-8.92x (range) |
| material-ui | 2 | 1.87x | 1.86-1.88x (range) |
| radix-primitives | 2 | 1.85x | 1.85-1.85x (range) |
| react-hook-form | 2 | 1.26x | 1.26-1.27x (range) |
| react-spectrum | 2 | 1.26x | 1.21-1.30x (range) |
| solid | 2 | 0.98x | 0.96-1.00x (range) |
| svelte | 2 | 1.05x | 1.03-1.06x (range) |
| vuetify | 2 | 1.50x | 1.50-1.51x (range) |

Median speedup over 14 suites: 1.27x (95% bootstrap interval 1.24-1.56x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | warpdom-default | 2 | 363.2 s | 1.24x | 1.23-1.25x (range) | 0 |
| CopilotKit | warpdomlatest-default | 2 | 363.0 s | 1.24x | 1.24-1.25x (range) | 1 |
| analog | warpdom-default | 2 | 26.3 s | 1.23x | 1.22-1.23x (range) | 0 |
| analog | warpdomlatest-default | 2 | 26.4 s | 1.22x | 1.22-1.23x (range) | 0 |
| ariakit | warpdom-default | 2 | 374.0 s | 1.27x | 1.27-1.27x (range) | 7 |
| ariakit | warpdomlatest-default | 2 | 374.8 s | 1.27x | 1.26-1.27x (range) | 7 |
| ark-ui | warpdom-default | 2 | 81.3 s | 1.52x | 1.49-1.55x (range) | 0 |
| ark-ui | warpdomlatest-default | 2 | 81.8 s | 1.51x | 1.50-1.52x (range) | 3 |
| emoji-picker-element | warpdom-default | 2 | 28.6 s | 1.26x | 1.26-1.26x (range) | 0 |
| emoji-picker-element | warpdomlatest-default | 2 | 28.6 s | 1.26x | 1.25-1.26x (range) | 0 |
| floating-ui | warpdom-default | 2 | 16.2 s | 1.56x | 1.52-1.60x (range) | 0 |
| floating-ui | warpdomlatest-default | 2 | 16.3 s | 1.55x | 1.54-1.57x (range) | 0 |
| handsontable | warpdom-default | 2 | 80.3 s | 8.90x | 8.87-8.92x (range) | 3 |
| handsontable | warpdomlatest-default | 2 | 81.3 s | 8.79x | 8.78-8.80x (range) | 23 |
| material-ui | warpdom-default | 2 | 109.5 s | 1.87x | 1.86-1.88x (range) | 0 |
| material-ui | warpdomlatest-default | 2 | 109.8 s | 1.86x | 1.82-1.91x (range) | 0 |
| radix-primitives | warpdom-default | 2 | 25.0 s | 1.85x | 1.85-1.85x (range) | 0 |
| radix-primitives | warpdomlatest-default | 2 | 25.3 s | 1.83x | 1.81-1.85x (range) | 0 |
| react-hook-form | warpdom-default | 2 | 7.6 s | 1.26x | 1.26-1.27x (range) | 0 |
| react-hook-form | warpdomlatest-default | 2 | 7.7 s | 1.26x | 1.24-1.27x (range) | 0 |
| react-spectrum | warpdom-default | 2 | 285.8 s | 1.26x | 1.21-1.30x (range) | 4 |
| react-spectrum | warpdomlatest-default | 2 | 290.6 s | 1.23x | 1.23-1.24x (range) | 143 |
| solid | warpdom-default | 2 | 2.5 s | 0.98x | 0.96-1.00x (range) | 1 |
| solid | warpdomlatest-default | 2 | 2.5 s | 1.02x | 1.00-1.04x (range) | 1 |
| svelte | warpdom-default | 2 | 73.6 s | 1.05x | 1.03-1.06x (range) | 1 |
| svelte | warpdomlatest-default | 2 | 74.5 s | 1.03x | 1.03-1.04x (range) | 25 |
| vuetify | warpdom-default | 2 | 27.9 s | 1.50x | 1.50-1.51x (range) | 0 |
| vuetify | warpdomlatest-default | 2 | 27.9 s | 1.50x | 1.49-1.51x (range) | 0 |
