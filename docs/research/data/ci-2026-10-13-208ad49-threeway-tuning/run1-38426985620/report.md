| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 456.5 s | 366.3 s | — | — | 1.24x | 1.24x | 0 (0) / — / — |
| analog | 5 | 19.3 s | 16.0 s | — | — | 1.20x | 1.20x | 0 (0) / — / — |
| ariakit | 5 | 537.3 s | 407.2 s | — | — | 1.32x | 1.32x | 7 (7) / — / — |
| ark-ui | 5 | 205.7 s | 130.8 s | — | — | 1.59x | 1.59x | 3 (2) / — / — |
| emoji-picker-element | 5 | 37.2 s | 29.1 s | — | — | 1.28x | 1.28x | 0 (0) / — / — |
| floating-ui | 5 | 23.7 s | 15.5 s | — | — | 1.53x | 1.53x | 0 (0) / — / — |
| handsontable | 5 | 593.2 s | 69.2 s | — | — | 8.62x | 8.62x | 3 (3) / — / — |
| material-ui | 5 | 264.0 s | 141.2 s | — | — | 1.89x | 1.89x | 0 (0) / — / — |
| radix-primitives | 5 | 29.6 s | 16.4 s | — | — | 1.79x | 1.79x | 0 (0) / — / — |
| react-hook-form | 5 | 12.8 s | 10.3 s | — | — | 1.24x | 1.24x | 0 (0) / — / — |
| react-spectrum | 5 | 419.9 s | 338.4 s | — | — | 1.24x | 1.24x | 0 (0) / — / — |
| solid | 5 | 3.4 s | 3.3 s | — | — | 1.03x | 1.03x | 1 (1) / — / — |
| svelte | 5 | 91.4 s | 84.6 s | — | — | 1.08x | 1.08x | 1 (1) / — / — |
| vuetify | 5 | 39.6 s | 26.8 s | — | — | 1.49x | 1.49x | 0 (0) / — / — |

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): CopilotKit 0, analog 0, ariakit 0, ark-ui 1, emoji-picker-element 0, floating-ui 0, handsontable 0, material-ui 0, radix-primitives 0, react-hook-form 0, react-spectrum 0, solid 0, svelte 0, vuetify 0.

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 456.5 s | 366.3 s | 48.6 s | 1.24x | 9.40x | 0.13x | 0 (0) / 4681 (4681) |
| analog | 19.3 s | 16.0 s | 17.3 s | 1.20x | 1.12x | 1.07x | 0 (0) / 2 (2) |
| ariakit | 537.3 s | 407.2 s | 232.1 s | 1.32x | 2.32x | 0.57x | 7 (7) / 51 (51) |
| ark-ui | 205.7 s | 130.8 s | 141.5 s | 1.59x | 1.45x | 1.08x | 3 (2) / 116 (115) |
| emoji-picker-element | 37.2 s | 29.1 s | 32.3 s | 1.28x | 1.15x | 1.11x | 0 (0) / 1 (1) |
| floating-ui | 23.7 s | 15.5 s | 18.8 s | 1.53x | 1.25x | 1.22x | 0 (0) / 14 (14) |
| handsontable | 593.2 s | 69.2 s | — | 8.62x | — | — | 3 (3) / — |
| material-ui | 264.0 s | 141.2 s | 185.1 s | 1.89x | 1.42x | 1.32x | 0 (0) / 1042 (1042) |
| radix-primitives | 29.6 s | 16.4 s | 19.7 s | 1.79x | 1.50x | 1.19x | 0 (0) / 18 (18) |
| react-hook-form | 12.8 s | 10.3 s | 14.2 s | 1.24x | 0.90x | 1.38x | 0 (0) / 8 (8) |
| react-spectrum | 419.9 s | 338.4 s | 363.1 s | 1.24x | 1.18x | 1.07x | 0 (0) / 1441 (1441) |
| solid | 3.4 s | 3.3 s | 3.1 s | 1.03x | 1.06x | 0.97x | 1 (1) / 0 (0) |
| svelte | 91.4 s | 84.6 s | 85.5 s | 1.08x | 1.07x | 1.01x | 1 (1) / 288 (288) |
| vuetify | 39.6 s | 26.8 s | 26.7 s | 1.49x | 1.48x | 1.00x | 0 (0) / 4 (4) |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.30x, happy-dom vs jsdom 1.25x, warpdom vs happy-dom 1.07x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.24x | 1.24-1.25x (95% CI) |
| analog | 5 | 1.20x | 1.18-1.23x (95% CI) |
| ariakit | 5 | 1.32x | 1.30-1.33x (95% CI) |
| ark-ui | 5 | 1.59x | 1.55-1.60x (95% CI) |
| emoji-picker-element | 5 | 1.28x | 1.26-1.30x (95% CI) |
| floating-ui | 5 | 1.53x | 1.49-1.54x (95% CI) |
| handsontable | 5 | 8.62x | 8.51-8.67x (95% CI) |
| material-ui | 5 | 1.89x | 1.86-1.91x (95% CI) |
| radix-primitives | 5 | 1.79x | 1.78-1.80x (95% CI) |
| react-hook-form | 5 | 1.24x | 1.21-1.26x (95% CI) |
| react-spectrum | 5 | 1.24x | 1.21-1.32x (95% CI) |
| solid | 5 | 1.03x | 1.00-1.06x (95% CI) |
| svelte | 5 | 1.08x | 1.07-1.09x (95% CI) |
| vuetify | 5 | 1.49x | 1.46-1.50x (95% CI) |

Median speedup over 14 suites: 1.30x (95% bootstrap interval 1.23-1.56x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 9.40x | 9.30-9.50x (95% CI) |
| analog | 5 | 1.12x | 1.11-1.13x (95% CI) |
| ariakit | 5 | 2.32x | 2.21-2.36x (95% CI) |
| ark-ui | 5 | 1.45x | 1.44-1.47x (95% CI) |
| emoji-picker-element | 5 | 1.15x | 1.14-1.16x (95% CI) |
| floating-ui | 5 | 1.25x | 1.21-1.28x (95% CI) |
| material-ui | 5 | 1.42x | 1.41-1.45x (95% CI) |
| radix-primitives | 5 | 1.50x | 1.48-1.53x (95% CI) |
| react-hook-form | 5 | 0.90x | 0.88-0.94x (95% CI) |
| react-spectrum | 5 | 1.18x | 1.14-1.23x (95% CI) |
| solid | 5 | 1.06x | 1.06-1.10x (95% CI) |
| svelte | 5 | 1.07x | 1.06-1.08x (95% CI) |
| vuetify | 5 | 1.48x | 1.46-1.51x (95% CI) |

Median speedup over 13 suites: 1.25x (95% bootstrap interval 1.12-1.48x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | packages/react-core | 5 | 214.4 s | 213.8 s | 181.0 s | 181.2 s | 22.3 s | 22.4 s | 1.19x | 1.18x |
| CopilotKit | packages/vue | 5 | 137.8 s | 137.4 s | 114.6 s | 115.4 s | 7.3 s | 7.4 s | 1.20x | 1.19x |
| CopilotKit | packages/angular | 5 | 26.3 s | 27.1 s | 24.8 s | 24.3 s | 8.7 s | 9.0 s | 1.06x | 1.12x |
| CopilotKit | packages/web-inspector | 5 | 61.8 s | 62.1 s | 33.8 s | 34.1 s | 6.9 s | 7.0 s | 1.83x | 1.82x |
| CopilotKit | packages/web-components | 5 | 2.9 s | 3.0 s | 2.0 s | 2.0 s | 1.0 s | 1.0 s | 1.45x | 1.50x |
| CopilotKit | packages/a2ui-renderer | 5 | 5.0 s | 5.1 s | 4.2 s | 4.3 s | 1.0 s | 1.0 s | 1.17x | 1.19x |
| CopilotKit | packages/mcp-apps-renderer | 5 | 7.4 s | 7.7 s | 6.7 s | 6.7 s | 1.3 s | 1.3 s | 1.12x | 1.15x |
| analog | packages/router | 5 | 3.0 s | 3.8 s | 2.7 s | 2.7 s | 2.8 s | 2.8 s | 1.11x | 1.41x |
| analog | packages/content | 5 | 2.6 s | 2.6 s | 1.7 s | 1.7 s | 2.0 s | 2.1 s | 1.53x | 1.53x |
| analog | packages/vitest-angular | 5 | 1.6 s | 1.5 s | 1.0 s | 1.0 s | 1.2 s | 1.2 s | 1.50x | 1.50x |
| analog | packages/create-analog | 5 | 1.0 s | 1.0 s | 0.7 s | 0.7 s | 0.8 s | 0.9 s | 1.43x | 1.43x |
| analog | apps/analog-app | 5 | 2.1 s | 2.2 s | 1.8 s | 1.9 s | 2.0 s | 1.9 s | 1.17x | 1.16x |
| analog | apps/trpc-app | 5 | 3.0 s | 3.1 s | 2.8 s | 2.8 s | 2.9 s | 2.9 s | 1.07x | 1.11x |
| analog | libs/card | 5 | 3.3 s | 3.3 s | 2.9 s | 2.9 s | 3.0 s | 3.0 s | 1.14x | 1.14x |
| analog | libs/top-bar | 5 | 2.7 s | 2.7 s | 2.5 s | 2.5 s | 2.6 s | 2.5 s | 1.12x | 1.08x |
| analog | libs/my-package | 5 | — | — | — | — | — | — | — | — |
| ariakit | . | 5 | 537.3 s | 532.3 s | 407.2 s | 411.5 s | 232.1 s | 240.8 s | 1.32x | 1.29x |
| ark-ui | packages/react | 5 | 59.2 s | 59.2 s | 36.0 s | 35.7 s | 38.1 s | 38.4 s | 1.65x | 1.66x |
| ark-ui | packages/vue | 5 | 69.1 s | 70.1 s | 46.9 s | 47.1 s | 52.9 s | 53.0 s | 1.48x | 1.49x |
| ark-ui | packages/solid | 5 | 59.6 s | 59.0 s | 36.9 s | 37.1 s | 42.5 s | 41.8 s | 1.61x | 1.59x |
| ark-ui | packages/svelte | 5 | 17.8 s | 17.9 s | 10.7 s | 10.8 s | 7.9 s | 7.8 s | 1.67x | 1.66x |
| emoji-picker-element | . | 5 | 37.2 s | 37.4 s | 29.1 s | 29.6 s | 32.3 s | 32.9 s | 1.28x | 1.26x |
| floating-ui | packages/react | 5 | 18.3 s | 19.2 s | 11.4 s | 11.7 s | 14.4 s | 14.4 s | 1.61x | 1.64x |
| floating-ui | packages/react-dom | 5 | 1.8 s | 1.9 s | 1.4 s | 1.4 s | 1.6 s | 1.6 s | 1.29x | 1.36x |
| floating-ui | packages/dom | 5 | 1.4 s | 1.4 s | 1.1 s | 1.1 s | 1.2 s | 1.3 s | 1.27x | 1.27x |
| floating-ui | packages/vue | 5 | 2.0 s | 2.0 s | 1.6 s | 1.6 s | 1.8 s | 1.8 s | 1.25x | 1.25x |
| handsontable | handsontable | 5 | 540.3 s | 589.4 s | 44.7 s | 61.6 s | — | — | 12.08x | 9.57x |
| handsontable | wrappers/react-wrapper | 5 | 27.2 s | 35.0 s | 10.5 s | 18.1 s | — | 18.8 s | 2.59x | 1.93x |
| handsontable | wrappers/vue3 | 5 | 8.8 s | 14.9 s | 5.2 s | 11.2 s | — | 11.4 s | 1.69x | 1.33x |
| handsontable | wrappers/angular-wrapper | 5 | 17.2 s | 279.2 s | 8.8 s | 271.2 s | — | 267.7 s | 1.98x | 1.03x |
| material-ui | packages/mui-material | 5 | 203.3 s | 212.3 s | 109.1 s | 110.2 s | 144.6 s | 144.4 s | 1.88x | 1.93x |
| material-ui | packages/mui-system | 5 | 25.2 s | 26.0 s | 13.0 s | 12.7 s | 16.5 s | 16.1 s | 1.95x | 2.05x |
| material-ui | packages/mui-utils | 5 | 22.7 s | 23.3 s | 11.0 s | 10.7 s | 14.6 s | 14.7 s | 2.06x | 2.18x |
| material-ui | packages/mui-lab | 5 | 12.7 s | 12.8 s | 7.9 s | 7.7 s | 9.3 s | 9.3 s | 1.63x | 1.66x |
| radix-primitives | . | 5 | 29.6 s | 29.1 s | 16.4 s | 16.7 s | 19.7 s | 19.6 s | 1.79x | 1.74x |
| react-hook-form | . | 5 | 12.8 s | 13.9 s | 10.3 s | 10.6 s | 14.2 s | 13.8 s | 1.24x | 1.31x |
| react-spectrum | . | 5 | 419.9 s | 468.9 s | 338.4 s | 324.5 s | 363.1 s | 339.1 s | 1.24x | 1.44x |
| solid | packages/solid | 5 | 3.4 s | 3.4 s | 3.3 s | 3.3 s | 3.1 s | 3.1 s | 1.03x | 1.03x |
| svelte | . | 5 | 91.4 s | 108.2 s | 84.6 s | 83.7 s | 85.5 s | 85.9 s | 1.08x | 1.29x |
| vuetify | packages/vuetify | 5 | 39.6 s | 39.9 s | 26.8 s | 27.3 s | 26.7 s | 26.6 s | 1.49x | 1.46x |
