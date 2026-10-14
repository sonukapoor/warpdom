| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 364.4 s | 289.6 s | — | — | 1.25x | 1.25x | 0 (0) / — / — |
| analog | 5 | 32.7 s | 26.4 s | — | — | 1.24x | 1.24x | 0 (0) / — / — |
| ariakit | 5 | 529.2 s | 404.4 s | — | — | 1.31x | 1.31x | 7 (7) / — / — |
| ark-ui | 5 | 216.9 s | 136.1 s | — | — | 1.59x | 1.59x | 3 (2) / — / — |
| emoji-picker-element | 5 | 33.1 s | 26.9 s | — | — | 1.23x | 1.23x | 0 (0) / — / — |
| floating-ui | 5 | 24.2 s | 16.0 s | — | — | 1.51x | 1.51x | 0 (0) / — / — |
| handsontable | 5 | 804.6 s | 88.9 s | — | — | 9.07x | 9.07x | 3 (3) / — / — |
| material-ui | 5 | 258.9 s | 135.3 s | — | — | 1.91x | 1.91x | 0 (0) / — / — |
| radix-primitives | 5 | 41.4 s | 22.6 s | — | — | 1.83x | 1.83x | 0 (0) / — / — |
| react-hook-form | 5 | 14.0 s | 11.3 s | — | — | 1.24x | 1.24x | 0 (0) / — / — |
| react-spectrum | 5 | 406.9 s | 320.2 s | — | — | 1.28x | 1.28x | 0 (0) / — / — |
| solid | 5 | 2.3 s | 2.2 s | — | — | 1.05x | 1.05x | 1 (1) / — / — |
| svelte | 5 | 85.3 s | 78.1 s | — | — | 1.09x | 1.09x | 1 (1) / — / — |
| vuetify | 5 | 46.4 s | 30.4 s | — | — | 1.52x | 1.52x | 0 (0) / — / — |

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): CopilotKit 0, analog 0, ariakit 0, ark-ui 1, emoji-picker-element 0, floating-ui 0, handsontable 0, material-ui 0, radix-primitives 0, react-hook-form 0, react-spectrum 0, solid 0, svelte 0, vuetify 0.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.25x | 1.24-1.26x (95% CI) |
| analog | 5 | 1.24x | 1.23-1.24x (95% CI) |
| ariakit | 5 | 1.31x | 1.30-1.31x (95% CI) |
| ark-ui | 5 | 1.59x | 1.52-1.60x (95% CI) |
| emoji-picker-element | 5 | 1.23x | 1.23-1.24x (95% CI) |
| floating-ui | 5 | 1.51x | 1.48-1.55x (95% CI) |
| handsontable | 5 | 9.07x | 8.86-9.24x (95% CI) |
| material-ui | 5 | 1.91x | 1.89-1.92x (95% CI) |
| radix-primitives | 5 | 1.83x | 1.81-1.85x (95% CI) |
| react-hook-form | 5 | 1.24x | 1.24-1.25x (95% CI) |
| react-spectrum | 5 | 1.28x | 1.19-1.34x (95% CI) |
| solid | 5 | 1.05x | 0.95-1.10x (95% CI) |
| svelte | 5 | 1.09x | 1.05-1.10x (95% CI) |
| vuetify | 5 | 1.52x | 1.51-1.54x (95% CI) |

Median speedup over 14 suites: 1.29x (95% bootstrap interval 1.24-1.57x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | warpdom-default | 5 | 289.6 s | 1.25x | 1.24-1.26x (95% CI) | 0 (0) |
| CopilotKit | warpdom-default-aa | 5 | 295.3 s | 1.23x | 1.22-1.28x (95% CI) | 0 (0) |
| CopilotKit | warpdomeager-default | 5 | 291.5 s | 1.26x | 1.20-1.26x (95% CI) | 0 (0) |
| CopilotKit | warpdomnocache-default | 5 | 291.4 s | 1.24x | 1.22-1.28x (95% CI) | 0 (0) |
| analog | warpdom-default | 5 | 26.4 s | 1.24x | 1.23-1.24x (95% CI) | 0 (0) |
| analog | warpdom-default-aa | 5 | 26.9 s | 1.23x | 1.22-1.24x (95% CI) | 0 (0) |
| analog | warpdomeager-default | 5 | 26.8 s | 1.22x | 1.22-1.23x (95% CI) | 0 (0) |
| analog | warpdomnocache-default | 5 | 26.8 s | 1.22x | 1.21-1.24x (95% CI) | 0 (0) |
| ariakit | warpdom-default | 5 | 404.4 s | 1.31x | 1.30-1.31x (95% CI) | 7 (7) |
| ariakit | warpdom-default-aa | 5 | 407.0 s | 1.30x | 1.29-1.31x (95% CI) | 7 (7) |
| ariakit | warpdomeager-default | 5 | 407.4 s | 1.30x | 1.28-1.31x (95% CI) | 7 (7) |
| ariakit | warpdomnocache-default | 5 | 409.1 s | 1.30x | 1.28-1.31x (95% CI) | 7 (7) |
| ark-ui | warpdom-default | 5 | 136.1 s | 1.59x | 1.52-1.60x (95% CI) | 3 (2) |
| ark-ui | warpdom-default-aa | 5 | 141.7 s | 1.55x | 1.51-1.61x (95% CI) | 3 (2) |
| ark-ui | warpdomeager-default | 5 | 139.2 s | 1.57x | 1.55-1.57x (95% CI) | 3 (2) |
| ark-ui | warpdomnocache-default | 5 | 138.1 s | 1.56x | 1.54-1.60x (95% CI) | 3 (2) |
| emoji-picker-element | warpdom-default | 5 | 26.9 s | 1.23x | 1.23-1.24x (95% CI) | 0 (0) |
| emoji-picker-element | warpdom-default-aa | 5 | 26.9 s | 1.23x | 1.21-1.24x (95% CI) | 0 (0) |
| emoji-picker-element | warpdomeager-default | 5 | 27.1 s | 1.23x | 1.21-1.23x (95% CI) | 0 (0) |
| emoji-picker-element | warpdomnocache-default | 5 | 27.1 s | 1.22x | 1.20-1.24x (95% CI) | 0 (0) |
| floating-ui | warpdom-default | 5 | 16.0 s | 1.51x | 1.48-1.55x (95% CI) | 0 (0) |
| floating-ui | warpdom-default-aa | 5 | 15.6 s | 1.53x | 1.48-1.56x (95% CI) | 0 (0) |
| floating-ui | warpdomeager-default | 5 | 15.7 s | 1.53x | 1.47-1.54x (95% CI) | 0 (0) |
| floating-ui | warpdomnocache-default | 5 | 16.0 s | 1.51x | 1.49-1.53x (95% CI) | 0 (0) |
| handsontable | warpdom-default | 5 | 88.9 s | 9.07x | 8.86-9.24x (95% CI) | 3 (3) |
| handsontable | warpdom-default-aa | 5 | 88.8 s | 9.02x | 8.91-9.26x (95% CI) | 3 (3) |
| handsontable | warpdomeager-default | 5 | 89.2 s | 9.01x | 8.97-9.18x (95% CI) | 3 (3) |
| handsontable | warpdomnocache-default | 5 | 89.4 s | 9.00x | 8.78-9.22x (95% CI) | 3 (3) |
| material-ui | warpdom-default | 5 | 135.3 s | 1.91x | 1.89-1.92x (95% CI) | 0 (0) |
| material-ui | warpdom-default-aa | 5 | 135.3 s | 1.92x | 1.90-1.92x (95% CI) | 0 (0) |
| material-ui | warpdomeager-default | 5 | 136.8 s | 1.88x | 1.85-1.90x (95% CI) | 0 (0) |
| material-ui | warpdomnocache-default | 5 | 135.1 s | 1.91x | 1.89-1.92x (95% CI) | 0 (0) |
| radix-primitives | warpdom-default | 5 | 22.6 s | 1.83x | 1.81-1.85x (95% CI) | 0 (0) |
| radix-primitives | warpdom-default-aa | 5 | 22.8 s | 1.82x | 1.81-1.83x (95% CI) | 0 (0) |
| radix-primitives | warpdomeager-default | 5 | 22.9 s | 1.81x | 1.80-1.83x (95% CI) | 0 (0) |
| radix-primitives | warpdomnocache-default | 5 | 22.7 s | 1.82x | 1.82-1.83x (95% CI) | 0 (0) |
| react-hook-form | warpdom-default | 5 | 11.3 s | 1.24x | 1.24-1.25x (95% CI) | 0 (0) |
| react-hook-form | warpdom-default-aa | 5 | 11.4 s | 1.25x | 1.21-1.25x (95% CI) | 0 (0) |
| react-hook-form | warpdomeager-default | 5 | 11.4 s | 1.23x | 1.21-1.25x (95% CI) | 0 (0) |
| react-hook-form | warpdomnocache-default | 5 | 11.3 s | 1.23x | 1.21-1.27x (95% CI) | 0 (0) |
| react-spectrum | warpdom-default | 5 | 320.2 s | 1.28x | 1.19-1.34x (95% CI) | 0 (0) |
| react-spectrum | warpdom-default-aa | 5 | 325.7 s | 1.28x | 1.20-1.29x (95% CI) | 0 (0) |
| react-spectrum | warpdomeager-default | 5 | 336.2 s | 1.24x | 1.18-1.28x (95% CI) | 0 (0) |
| react-spectrum | warpdomnocache-default | 5 | 334.7 s | 1.25x | 1.17-1.29x (95% CI) | 0 (0) |
| solid | warpdom-default | 5 | 2.2 s | 1.05x | 0.95-1.10x (95% CI) | 1 (1) |
| solid | warpdom-default-aa | 5 | 2.1 s | 1.05x | 1.00-1.10x (95% CI) | 1 (1) |
| solid | warpdomeager-default | 5 | 2.2 s | 1.05x | 1.00-1.10x (95% CI) | 1 (1) |
| solid | warpdomnocache-default | 5 | 2.2 s | 1.05x | 0.95-1.10x (95% CI) | 1 (1) |
| svelte | warpdom-default | 5 | 78.1 s | 1.09x | 1.05-1.10x (95% CI) | 1 (1) |
| svelte | warpdom-default-aa | 5 | 79.1 s | 1.07x | 1.04-1.11x (95% CI) | 1 (1) |
| svelte | warpdomeager-default | 5 | 79.8 s | 1.07x | 1.04-1.10x (95% CI) | 1 (1) |
| svelte | warpdomnocache-default | 5 | 78.8 s | 1.08x | 1.05-1.10x (95% CI) | 1 (1) |
| vuetify | warpdom-default | 5 | 30.4 s | 1.52x | 1.51-1.54x (95% CI) | 0 (0) |
| vuetify | warpdom-default-aa | 5 | 30.5 s | 1.52x | 1.51-1.54x (95% CI) | 0 (0) |
| vuetify | warpdomeager-default | 5 | 31.1 s | 1.51x | 1.47-1.54x (95% CI) | 0 (0) |
| vuetify | warpdomnocache-default | 5 | 30.3 s | 1.53x | 1.48-1.54x (95% CI) | 0 (0) |

**A/A controls** (paired ratio warpdom-default / control per round: median, range below 5 rounds, else 95% bootstrap interval; max deviation = largest |ratio - 1| over rounds)

| Suite | control | rounds | ratio | interval | max deviation | differ (control) |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | warpdom-default-aa | 5 | 0.998 | 0.974-1.013 (95% CI) | 2.6% | 0 |
| analog | warpdom-default-aa | 5 | 0.996 | 0.981-1.008 (95% CI) | 1.9% | 0 |
| ariakit | warpdom-default-aa | 5 | 0.992 | 0.990-1.008 (95% CI) | 1.0% | 7 |
| ark-ui | warpdom-default-aa | 5 | 0.996 | 0.940-1.022 (95% CI) | 6.0% | 3 |
| emoji-picker-element | warpdom-default-aa | 5 | 0.996 | 0.982-1.000 (95% CI) | 1.8% | 0 |
| floating-ui | warpdom-default-aa | 5 | 1.006 | 1.000-1.026 (95% CI) | 2.6% | 0 |
| handsontable | warpdom-default-aa | 5 | 1.001 | 0.992-1.006 (95% CI) | 0.8% | 3 |
| material-ui | warpdom-default-aa | 5 | 1.004 | 0.994-1.007 (95% CI) | 0.7% | 0 |
| radix-primitives | warpdom-default-aa | 5 | 0.996 | 0.987-1.004 (95% CI) | 1.3% | 0 |
| react-hook-form | warpdom-default-aa | 5 | 1.000 | 0.974-1.009 (95% CI) | 2.6% | 0 |
| react-spectrum | warpdom-default-aa | 5 | 0.979 | 0.960-1.008 (95% CI) | 4.0% | 0 |
| solid | warpdom-default-aa | 5 | 1.000 | 1.000-1.048 (95% CI) | 4.8% | 1 |
| svelte | warpdom-default-aa | 5 | 0.987 | 0.986-1.010 (95% CI) | 1.4% | 1 |
| vuetify | warpdom-default-aa | 5 | 0.993 | 0.990-1.020 (95% CI) | 2.0% | 0 |

warpdom-default-aa: 70 paired rounds over all suites, median ratio 1.000, median |log ratio| 0.007 (0.7%), 95th percentile 4.1%.

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | warpdom-default-aa | warpdom-default-aa warm-up | warpdomeager-default | warpdomeager-default warm-up | warpdomnocache-default | warpdomnocache-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | packages/react-core | 5 | 170.5 s | 168.5 s | 142.1 s | 141.7 s | 142.6 s | 146.1 s | 143.6 s | 140.2 s | 144.0 s | 142.7 s | 1.19x | 1.19x |
| CopilotKit | packages/vue | 5 | 108.6 s | 109.1 s | 89.6 s | 89.2 s | 90.5 s | 92.1 s | 90.1 s | 87.5 s | 90.1 s | 90.1 s | 1.22x | 1.22x |
| CopilotKit | packages/angular | 5 | 21.4 s | 22.1 s | 20.2 s | 20.4 s | 20.4 s | 20.6 s | 19.8 s | 19.2 s | 20.1 s | 20.5 s | 1.06x | 1.08x |
| CopilotKit | packages/web-inspector | 5 | 49.7 s | 50.1 s | 27.6 s | 28.8 s | 28.3 s | 28.0 s | 28.0 s | 27.8 s | 28.2 s | 28.6 s | 1.80x | 1.74x |
| CopilotKit | packages/web-components | 5 | 2.3 s | 2.4 s | 1.6 s | 1.6 s | 1.6 s | 1.5 s | 1.6 s | 1.5 s | 1.6 s | 1.6 s | 1.47x | 1.50x |
| CopilotKit | packages/a2ui-renderer | 5 | 3.9 s | 4.0 s | 3.3 s | 3.5 s | 3.3 s | 3.3 s | 3.3 s | 3.3 s | 3.4 s | 3.4 s | 1.18x | 1.14x |
| CopilotKit | packages/mcp-apps-renderer | 5 | 6.6 s | 6.8 s | 6.1 s | 6.2 s | 6.1 s | 6.0 s | 6.1 s | 6.0 s | 6.1 s | 6.1 s | 1.10x | 1.10x |
| analog | packages/router | 5 | 3.9 s | 5.0 s | 3.2 s | 3.3 s | 3.2 s | 3.3 s | 3.3 s | 3.3 s | 3.3 s | 3.3 s | 1.22x | 1.52x |
| analog | packages/content | 5 | 4.6 s | 4.7 s | 2.9 s | 2.9 s | 3.0 s | 3.0 s | 3.0 s | 3.0 s | 2.9 s | 3.0 s | 1.59x | 1.62x |
| analog | packages/vitest-angular | 5 | 2.8 s | 2.9 s | 1.8 s | 1.9 s | 1.8 s | 1.8 s | 1.8 s | 1.9 s | 1.8 s | 1.8 s | 1.56x | 1.53x |
| analog | packages/create-analog | 5 | 1.7 s | 1.8 s | 1.2 s | 1.3 s | 1.2 s | 1.2 s | 1.2 s | 1.2 s | 1.2 s | 1.2 s | 1.42x | 1.38x |
| analog | apps/analog-app | 5 | 3.8 s | 4.1 s | 3.3 s | 3.5 s | 3.3 s | 3.4 s | 3.3 s | 3.3 s | 3.4 s | 3.4 s | 1.15x | 1.17x |
| analog | apps/trpc-app | 5 | 5.4 s | 5.7 s | 4.8 s | 5.1 s | 4.9 s | 5.0 s | 4.9 s | 5.0 s | 4.9 s | 5.0 s | 1.10x | 1.12x |
| analog | libs/card | 5 | 5.8 s | 6.1 s | 5.0 s | 5.2 s | 5.1 s | 5.0 s | 5.0 s | 5.1 s | 5.1 s | 5.1 s | 1.16x | 1.17x |
| analog | libs/top-bar | 5 | 4.7 s | 4.8 s | 4.2 s | 4.3 s | 4.3 s | 4.3 s | 4.2 s | 4.4 s | 4.2 s | 4.3 s | 1.12x | 1.12x |
| analog | libs/my-package | 5 | — | — | — | — | — | — | — | — | — | — | — | — |
| ariakit | . | 5 | 529.2 s | 527.3 s | 404.4 s | 404.9 s | 407.0 s | 410.0 s | 407.4 s | 411.1 s | 409.1 s | 411.5 s | 1.31x | 1.30x |
| ark-ui | packages/react | 5 | 61.7 s | 62.3 s | 36.9 s | 37.5 s | 37.9 s | 36.6 s | 37.7 s | 37.2 s | 37.8 s | 37.1 s | 1.67x | 1.66x |
| ark-ui | packages/vue | 5 | 72.7 s | 72.9 s | 48.5 s | 49.3 s | 50.4 s | 47.9 s | 49.6 s | 49.0 s | 49.2 s | 48.7 s | 1.49x | 1.48x |
| ark-ui | packages/solid | 5 | 63.4 s | 61.9 s | 39.0 s | 38.5 s | 41.1 s | 39.8 s | 40.6 s | 40.2 s | 40.4 s | 40.9 s | 1.59x | 1.61x |
| ark-ui | packages/svelte | 5 | 18.5 s | 18.8 s | 11.1 s | 11.0 s | 11.4 s | 11.5 s | 11.5 s | 11.2 s | 11.3 s | 11.0 s | 1.67x | 1.71x |
| emoji-picker-element | . | 5 | 33.1 s | 32.9 s | 26.9 s | 26.9 s | 26.9 s | 27.3 s | 27.1 s | 27.4 s | 27.1 s | 27.0 s | 1.23x | 1.22x |
| floating-ui | packages/react | 5 | 18.6 s | 18.5 s | 11.7 s | 11.4 s | 11.5 s | 11.4 s | 11.6 s | 11.8 s | 11.8 s | 11.5 s | 1.59x | 1.62x |
| floating-ui | packages/react-dom | 5 | 1.9 s | 1.9 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.36x | 1.36x |
| floating-ui | packages/dom | 5 | 1.4 s | 1.4 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.27x | 1.27x |
| floating-ui | packages/vue | 5 | 2.0 s | 2.0 s | 1.6 s | 1.6 s | 1.6 s | 1.6 s | 1.6 s | 1.6 s | 1.7 s | 1.6 s | 1.25x | 1.25x |
| handsontable | handsontable | 5 | 738.7 s | 780.7 s | 58.0 s | 79.8 s | 57.6 s | 57.5 s | 58.0 s | 57.9 s | 58.2 s | 57.7 s | 12.83x | 9.78x |
| handsontable | wrappers/react-wrapper | 5 | 32.5 s | 43.1 s | 13.0 s | 22.5 s | 13.1 s | 13.0 s | 13.1 s | 13.0 s | 13.1 s | 13.0 s | 2.51x | 1.92x |
| handsontable | wrappers/vue3 | 5 | 11.0 s | 18.9 s | 6.6 s | 14.5 s | 6.7 s | 6.5 s | 6.6 s | 6.6 s | 6.6 s | 6.6 s | 1.67x | 1.30x |
| handsontable | wrappers/angular-wrapper | 5 | 21.5 s | 380.3 s | 11.4 s | 371.5 s | 11.5 s | 11.2 s | 11.4 s | 11.4 s | 11.5 s | 11.4 s | 1.87x | 1.02x |
| material-ui | packages/mui-material | 5 | 199.2 s | 197.4 s | 104.7 s | 104.1 s | 104.7 s | 104.4 s | 105.9 s | 106.3 s | 104.4 s | 105.5 s | 1.90x | 1.90x |
| material-ui | packages/mui-system | 5 | 24.5 s | 24.6 s | 12.4 s | 12.6 s | 12.4 s | 12.5 s | 12.6 s | 12.8 s | 12.5 s | 12.6 s | 1.98x | 1.95x |
| material-ui | packages/mui-utils | 5 | 22.6 s | 22.6 s | 10.7 s | 10.6 s | 10.6 s | 10.8 s | 10.7 s | 10.7 s | 10.7 s | 11.0 s | 2.10x | 2.13x |
| material-ui | packages/mui-lab | 5 | 12.5 s | 12.0 s | 7.5 s | 7.4 s | 7.6 s | 7.7 s | 7.6 s | 7.5 s | 7.5 s | 7.8 s | 1.65x | 1.62x |
| radix-primitives | . | 5 | 41.4 s | 41.5 s | 22.6 s | 22.6 s | 22.8 s | 22.8 s | 22.9 s | 22.8 s | 22.7 s | 22.8 s | 1.83x | 1.84x |
| react-hook-form | . | 5 | 14.0 s | 14.5 s | 11.3 s | 11.5 s | 11.4 s | 11.3 s | 11.4 s | 11.4 s | 11.3 s | 11.3 s | 1.24x | 1.26x |
| react-spectrum | . | 5 | 406.9 s | 471.9 s | 320.2 s | 330.6 s | 325.7 s | 333.3 s | 336.2 s | 335.9 s | 334.7 s | 359.8 s | 1.28x | 1.43x |
| solid | packages/solid | 5 | 2.3 s | 2.5 s | 2.2 s | 2.2 s | 2.1 s | 2.2 s | 2.2 s | 2.2 s | 2.2 s | 2.2 s | 1.05x | 1.14x |
| svelte | . | 5 | 85.3 s | 100.7 s | 78.1 s | 79.2 s | 79.1 s | 82.0 s | 79.8 s | 81.2 s | 78.8 s | 79.5 s | 1.09x | 1.27x |
| vuetify | packages/vuetify | 5 | 46.4 s | 47.2 s | 30.4 s | 30.4 s | 30.5 s | 30.5 s | 31.1 s | 31.6 s | 30.3 s | 30.8 s | 1.52x | 1.55x |
