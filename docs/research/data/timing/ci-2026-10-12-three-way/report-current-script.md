| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 3 | 468.5 s | 373.9 s | — | — | 1.25x | 1.25x | 0 / — / — |
| analog | 3 | 41.2 s | 33.5 s | — | — | 1.25x | 1.25x | 0 / — / — |
| ariakit | 3 | 829.6 s | 539.6 s | — | — | 1.54x | 1.54x | 11 / — / — |
| ark-ui | 3 | 235.2 s | 143.0 s | — | — | 1.60x | 1.60x | 2 / — / — |
| emoji-picker-element | 3 | 53.1 s | 40.2 s | — | — | 1.32x | 1.32x | 0 / — / — |
| floating-ui | 3 | 29.4 s | 18.8 s | — | — | 1.57x | 1.57x | 0 / — / — |
| handsontable | 3 | 121.4 s | 146.6 s | — | — | 0.85x | 0.85x | 7595 / — / — |
| material-ui | 3 | 472.4 s | 247.2 s | — | — | 1.90x | 1.90x | 1 / — / — |
| radix-primitives | 3 | 44.4 s | 23.6 s | — | — | 1.88x | 1.88x | 0 / — / — |
| react-hook-form | 3 | 23.8 s | 17.5 s | — | — | 1.32x | 1.32x | 0 / — / — |
| react-spectrum | 3 | 709.9 s | 550.7 s | — | — | 1.26x | 1.26x | 0 / — / — |
| solid | 3 | 5.2 s | 4.8 s | — | — | 1.08x | 1.08x | 1 / — / — |
| svelte | 3 | 137.9 s | 125.2 s | — | — | 1.10x | 1.10x | 1 / — / — |
| vuetify | 3 | 80.5 s | 52.0 s | — | — | 1.54x | 1.54x | 0 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 468.5 s | 373.9 s | 50.9 s | 1.25x | 9.01x | 0.13x | 0 / 4676 |
| analog | 41.2 s | 33.5 s | 35.9 s | 1.25x | 1.15x | 1.07x | 0 / 2 |
| ariakit | 829.6 s | 539.6 s | 462.6 s | 1.54x | 1.79x | 0.86x | 11 / 51 |
| ark-ui | 235.2 s | 143.0 s | 163.8 s | 1.60x | 1.45x | 1.15x | 2 / 115 |
| emoji-picker-element | 53.1 s | 40.2 s | 46.0 s | 1.32x | 1.16x | 1.14x | 0 / 1 |
| floating-ui | 29.4 s | 18.8 s | 22.6 s | 1.57x | 1.30x | 1.20x | 0 / 14 |
| handsontable | 121.4 s | 146.6 s | 54.5 s | 0.85x | 2.20x | 0.39x | 7595 / 31 |
| material-ui | 472.4 s | 247.2 s | 333.8 s | 1.90x | 1.41x | 1.36x | 1 / 1039 |
| radix-primitives | 44.4 s | 23.6 s | 29.6 s | 1.88x | 1.51x | 1.25x | 0 / 18 |
| react-hook-form | 23.8 s | 17.5 s | 22.3 s | 1.32x | 1.04x | 1.28x | 0 / 8 |
| react-spectrum | 709.9 s | 550.7 s | 628.4 s | 1.26x | 1.20x | 1.17x | 0 / 1496 |
| solid | 5.2 s | 4.8 s | 4.7 s | 1.08x | 1.11x | 0.94x | 1 / 0 |
| svelte | 137.9 s | 125.2 s | 126.4 s | 1.10x | 1.09x | 1.01x | 1 / 288 |
| vuetify | 80.5 s | 52.0 s | 53.1 s | 1.54x | 1.53x | 1.01x | 0 / 4 |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.32x, happy-dom vs jsdom 1.35x, warpdom vs happy-dom 1.11x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 3 | 1.25x | 1.21-1.33x (range) |
| analog | 3 | 1.25x | 1.22-1.30x (range) |
| ariakit | 3 | 1.54x | 1.53-1.54x (range) |
| ark-ui | 3 | 1.60x | 1.52-1.67x (range) |
| emoji-picker-element | 3 | 1.32x | 1.31-1.34x (range) |
| floating-ui | 3 | 1.57x | 1.56-1.58x (range) |
| handsontable | 3 | 0.85x | 0.83-0.92x (range) |
| material-ui | 3 | 1.90x | 1.89-1.92x (range) |
| radix-primitives | 3 | 1.88x | 1.85-1.92x (range) |
| react-hook-form | 3 | 1.32x | 1.30-1.36x (range) |
| react-spectrum | 3 | 1.26x | 1.23-1.59x (range) |
| solid | 3 | 1.08x | 1.04-1.10x (range) |
| svelte | 3 | 1.10x | 1.10-1.13x (range) |
| vuetify | 3 | 1.54x | 1.53-1.55x (range) |

Median speedup over 14 suites: 1.32x (95% bootstrap interval 1.23-1.56x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 3 | 9.01x | 8.68-10.69x (range) |
| analog | 3 | 1.15x | 1.15-1.22x (range) |
| ariakit | 3 | 1.79x | 1.79-1.81x (range) |
| ark-ui | 3 | 1.45x | 1.33-1.46x (range) |
| emoji-picker-element | 3 | 1.16x | 1.15-1.17x (range) |
| floating-ui | 3 | 1.30x | 1.30-1.32x (range) |
| handsontable | 3 | 2.20x | 1.08-2.25x (range) |
| material-ui | 3 | 1.41x | 1.39-1.42x (range) |
| radix-primitives | 3 | 1.51x | 1.49-1.54x (range) |
| react-hook-form | 3 | 1.04x | 1.02-1.08x (range) |
| react-spectrum | 3 | 1.20x | 1.07-1.36x (range) |
| solid | 3 | 1.11x | 1.08-1.18x (range) |
| svelte | 3 | 1.09x | 1.09-1.10x (range) |
| vuetify | 3 | 1.53x | 1.45-1.56x (range) |

Median speedup over 14 suites: 1.35x (95% bootstrap interval 1.15-1.52x, suites and rounds resampled, 10000 resamples).
