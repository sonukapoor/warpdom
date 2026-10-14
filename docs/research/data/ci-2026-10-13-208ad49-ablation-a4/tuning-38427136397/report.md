| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 2 | 352.7 s | 285.8 s | — | — | 1.23x | 1.23x | 0 (0) / — / — |
| analog | 2 | 19.9 s | 16.4 s | — | — | 1.21x | 1.21x | 0 (0) / — / — |
| ariakit | 2 | 481.6 s | 381.8 s | — | — | 1.26x | 1.26x | 7 (7) / — / — |
| ark-ui | 2 | 212.6 s | 134.1 s | — | — | 1.59x | 1.59x | 3 (2) / — / — |
| emoji-picker-element | 2 | 37.3 s | 29.9 s | — | — | 1.25x | 1.25x | 0 (0) / — / — |
| floating-ui | 2 | 25.3 s | 16.5 s | — | — | 1.53x | 1.53x | 0 (0) / — / — |
| handsontable | 2 | 832.3 s | 89.8 s | — | — | 9.27x | 9.27x | 3 (3) / — / — |
| material-ui | 2 | 273.7 s | 146.5 s | — | — | 1.87x | 1.87x | 0 (0) / — / — |
| radix-primitives | 2 | 27.8 s | 15.6 s | — | — | 1.79x | 1.79x | 0 (0) / — / — |
| react-hook-form | 2 | 10.7 s | 8.8 s | — | — | 1.22x | 1.22x | 0 (0) / — / — |
| react-spectrum | 2 | 376.3 s | 309.0 s | — | — | 1.22x | 1.22x | 0 (0) / — / — |
| solid | 2 | 3.5 s | 3.5 s | — | — | 1.00x | 1.00x | 1 (1) / — / — |
| svelte | 2 | 86.7 s | 81.4 s | — | — | 1.06x | 1.06x | 1 (1) / — / — |
| vuetify | 2 | 35.5 s | 23.1 s | — | — | 1.53x | 1.53x | 0 (0) / — / — |

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): CopilotKit 0, analog 0, ariakit 0, ark-ui 1, emoji-picker-element 0, floating-ui 0, handsontable 0, material-ui 0, radix-primitives 0, react-hook-form 0, react-spectrum 0, solid 0, svelte 0, vuetify 0.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 2 | 1.23x | 1.23-1.24x (range) |
| analog | 2 | 1.21x | 1.21-1.21x (range) |
| ariakit | 2 | 1.26x | 1.24-1.28x (range) |
| ark-ui | 2 | 1.59x | 1.58-1.59x (range) |
| emoji-picker-element | 2 | 1.25x | 1.24-1.26x (range) |
| floating-ui | 2 | 1.53x | 1.53-1.53x (range) |
| handsontable | 2 | 9.27x | 9.25-9.29x (range) |
| material-ui | 2 | 1.87x | 1.86-1.87x (range) |
| radix-primitives | 2 | 1.79x | 1.79-1.79x (range) |
| react-hook-form | 2 | 1.22x | 1.22-1.23x (range) |
| react-spectrum | 2 | 1.22x | 1.22-1.22x (range) |
| solid | 2 | 1.00x | 1.00-1.00x (range) |
| svelte | 2 | 1.06x | 1.06-1.07x (range) |
| vuetify | 2 | 1.53x | 1.51-1.56x (range) |

Median speedup over 14 suites: 1.26x (95% bootstrap interval 1.22-1.58x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | warpdom-default | 2 | 285.8 s | 1.23x | 1.23-1.24x (range) | 0 (0) |
| CopilotKit | warpdomlatest-default | 2 | 285.9 s | 1.23x | 1.23-1.24x (range) | 1 (1) |
| analog | warpdom-default | 2 | 16.4 s | 1.21x | 1.21-1.21x (range) | 0 (0) |
| analog | warpdomlatest-default | 2 | 16.4 s | 1.21x | 1.20-1.22x (range) | 0 (0) |
| ariakit | warpdom-default | 2 | 381.8 s | 1.26x | 1.24-1.28x (range) | 7 (7) |
| ariakit | warpdomlatest-default | 2 | 382.9 s | 1.26x | 1.23-1.28x (range) | 7 (7) |
| ark-ui | warpdom-default | 2 | 134.1 s | 1.59x | 1.58-1.59x (range) | 3 (2) |
| ark-ui | warpdomlatest-default | 2 | 134.6 s | 1.58x | 1.57-1.58x (range) | 6 (5) |
| emoji-picker-element | warpdom-default | 2 | 29.9 s | 1.25x | 1.24-1.26x (range) | 0 (0) |
| emoji-picker-element | warpdomlatest-default | 2 | 29.5 s | 1.26x | 1.26-1.27x (range) | 0 (0) |
| floating-ui | warpdom-default | 2 | 16.5 s | 1.53x | 1.53-1.53x (range) | 0 (0) |
| floating-ui | warpdomlatest-default | 2 | 16.3 s | 1.55x | 1.54-1.56x (range) | 0 (0) |
| handsontable | warpdom-default | 2 | 89.8 s | 9.27x | 9.25-9.29x (range) | 3 (3) |
| handsontable | warpdomlatest-default | 2 | 91.4 s | 9.10x | 9.09-9.11x (range) | 23 (23) |
| material-ui | warpdom-default | 2 | 146.5 s | 1.87x | 1.86-1.87x (range) | 0 (0) |
| material-ui | warpdomlatest-default | 2 | 146.3 s | 1.87x | 1.85-1.89x (range) | 0 (0) |
| radix-primitives | warpdom-default | 2 | 15.6 s | 1.79x | 1.79-1.79x (range) | 0 (0) |
| radix-primitives | warpdomlatest-default | 2 | 15.7 s | 1.78x | 1.77-1.78x (range) | 0 (0) |
| react-hook-form | warpdom-default | 2 | 8.8 s | 1.22x | 1.22-1.23x (range) | 0 (0) |
| react-hook-form | warpdomlatest-default | 2 | 8.8 s | 1.22x | 1.20-1.24x (range) | 0 (0) |
| react-spectrum | warpdom-default | 2 | 309.0 s | 1.22x | 1.22-1.22x (range) | 0 (0) |
| react-spectrum | warpdomlatest-default | 2 | 308.4 s | 1.22x | 1.21-1.23x (range) | 146 (146) |
| solid | warpdom-default | 2 | 3.5 s | 1.00x | 1.00-1.00x (range) | 1 (1) |
| solid | warpdomlatest-default | 2 | 3.3 s | 1.04x | 1.03-1.06x (range) | 1 (1) |
| svelte | warpdom-default | 2 | 81.4 s | 1.06x | 1.06-1.07x (range) | 1 (1) |
| svelte | warpdomlatest-default | 2 | 81.7 s | 1.06x | 1.06-1.07x (range) | 25 (25) |
| vuetify | warpdom-default | 2 | 23.1 s | 1.53x | 1.51-1.56x (range) | 0 (0) |
| vuetify | warpdomlatest-default | 2 | 23.1 s | 1.53x | 1.52-1.55x (range) | 0 (0) |

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | warpdomlatest-default | warpdomlatest-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | packages/react-core | 2 | 165.2 s | 164.7 s | 140.0 s | 139.6 s | 140.1 s | 140.0 s | 1.18x | 1.18x |
| CopilotKit | packages/vue | 2 | 105.6 s | 104.9 s | 87.9 s | 87.8 s | 87.9 s | 88.0 s | 1.20x | 1.19x |
| CopilotKit | packages/angular | 2 | 20.6 s | 21.4 s | 19.6 s | 19.4 s | 19.4 s | 19.4 s | 1.05x | 1.10x |
| CopilotKit | packages/web-inspector | 2 | 48.7 s | 48.4 s | 27.4 s | 27.3 s | 27.6 s | 27.7 s | 1.78x | 1.77x |
| CopilotKit | packages/web-components | 2 | 2.2 s | 2.3 s | 1.6 s | 1.5 s | 1.5 s | 1.5 s | 1.42x | 1.53x |
| CopilotKit | packages/a2ui-renderer | 2 | 3.8 s | 3.9 s | 3.3 s | 3.3 s | 3.4 s | 3.3 s | 1.15x | 1.18x |
| CopilotKit | packages/mcp-apps-renderer | 2 | 6.6 s | 6.7 s | 6.0 s | 6.0 s | 6.0 s | 6.0 s | 1.11x | 1.12x |
| analog | packages/router | 2 | 3.0 s | 3.8 s | 2.7 s | 2.7 s | 2.7 s | 2.7 s | 1.13x | 1.41x |
| analog | packages/content | 2 | 2.7 s | 2.7 s | 1.7 s | 1.7 s | 1.8 s | 1.7 s | 1.59x | 1.59x |
| analog | packages/vitest-angular | 2 | 1.6 s | 1.6 s | 1.1 s | 1.0 s | 1.0 s | 1.1 s | 1.45x | 1.60x |
| analog | packages/create-analog | 2 | 1.0 s | 1.0 s | 0.7 s | 0.7 s | 0.8 s | 0.7 s | 1.43x | 1.43x |
| analog | apps/analog-app | 2 | 2.2 s | 2.2 s | 1.9 s | 1.9 s | 1.9 s | 1.9 s | 1.16x | 1.16x |
| analog | apps/trpc-app | 2 | 3.1 s | 3.2 s | 2.8 s | 2.9 s | 2.8 s | 2.9 s | 1.09x | 1.10x |
| analog | libs/card | 2 | 3.5 s | 3.4 s | 3.0 s | 2.9 s | 3.0 s | 3.0 s | 1.17x | 1.17x |
| analog | libs/top-bar | 2 | 2.8 s | 2.7 s | 2.5 s | 2.5 s | 2.5 s | 2.5 s | 1.10x | 1.08x |
| analog | libs/my-package | 2 | — | — | — | — | — | — | — | — |
| ariakit | . | 2 | 481.6 s | 488.1 s | 381.8 s | 386.4 s | 382.9 s | 388.5 s | 1.26x | 1.26x |
| ark-ui | packages/react | 2 | 61.5 s | 61.9 s | 36.7 s | 37.3 s | 36.8 s | 37.1 s | 1.68x | 1.66x |
| ark-ui | packages/vue | 2 | 71.3 s | 72.0 s | 48.2 s | 48.7 s | 48.3 s | 48.7 s | 1.48x | 1.48x |
| ark-ui | packages/solid | 2 | 61.3 s | 62.0 s | 38.1 s | 38.6 s | 38.5 s | 39.0 s | 1.61x | 1.61x |
| ark-ui | packages/svelte | 2 | 18.4 s | 18.7 s | 11.1 s | 11.1 s | 11.1 s | 11.2 s | 1.67x | 1.68x |
| emoji-picker-element | . | 2 | 37.3 s | 37.8 s | 29.9 s | 29.5 s | 29.5 s | 29.4 s | 1.25x | 1.28x |
| floating-ui | packages/react | 2 | 19.9 s | 19.9 s | 12.3 s | 11.9 s | 12.1 s | 11.9 s | 1.62x | 1.67x |
| floating-ui | packages/react-dom | 2 | 1.9 s | 1.9 s | 1.4 s | 1.4 s | 1.4 s | 1.4 s | 1.31x | 1.36x |
| floating-ui | packages/dom | 2 | 1.4 s | 1.4 s | 1.1 s | 1.1 s | 1.1 s | 1.1 s | 1.27x | 1.27x |
| floating-ui | packages/vue | 2 | 2.1 s | 2.0 s | 1.7 s | 1.6 s | 1.7 s | 1.6 s | 1.24x | 1.25x |
| handsontable | handsontable | 2 | 766.0 s | 812.5 s | 58.5 s | 80.3 s | 59.7 s | 59.4 s | 13.09x | 10.12x |
| handsontable | wrappers/react-wrapper | 2 | 33.4 s | 43.7 s | 13.2 s | 22.7 s | 13.4 s | 13.4 s | 2.53x | 1.93x |
| handsontable | wrappers/vue3 | 2 | 11.2 s | 19.0 s | 6.6 s | 14.7 s | 6.8 s | 6.7 s | 1.70x | 1.29x |
| handsontable | wrappers/angular-wrapper | 2 | 21.6 s | 384.2 s | 11.5 s | 381.5 s | 11.6 s | 11.6 s | 1.88x | 1.01x |
| material-ui | packages/mui-material | 2 | 210.4 s | 217.8 s | 113.5 s | 113.2 s | 113.7 s | 111.2 s | 1.85x | 1.92x |
| material-ui | packages/mui-system | 2 | 26.0 s | 26.7 s | 13.4 s | 13.1 s | 13.2 s | 13.0 s | 1.95x | 2.04x |
| material-ui | packages/mui-utils | 2 | 24.0 s | 24.1 s | 11.5 s | 11.0 s | 11.3 s | 11.2 s | 2.09x | 2.19x |
| material-ui | packages/mui-lab | 2 | 13.3 s | 13.0 s | 8.1 s | 7.9 s | 8.1 s | 7.9 s | 1.64x | 1.65x |
| radix-primitives | . | 2 | 27.8 s | 29.2 s | 15.6 s | 16.1 s | 15.7 s | 15.9 s | 1.79x | 1.81x |
| react-hook-form | . | 2 | 10.7 s | 11.5 s | 8.8 s | 8.8 s | 8.8 s | 8.7 s | 1.22x | 1.31x |
| react-spectrum | . | 2 | 376.3 s | 446.6 s | 309.0 s | 322.6 s | 308.4 s | 320.8 s | 1.22x | 1.38x |
| solid | packages/solid | 2 | 3.5 s | 3.6 s | 3.5 s | 3.5 s | 3.3 s | 3.5 s | 1.00x | 1.03x |
| svelte | . | 2 | 86.7 s | 103.1 s | 81.4 s | 81.5 s | 81.7 s | 81.1 s | 1.06x | 1.27x |
| vuetify | packages/vuetify | 2 | 35.5 s | 35.6 s | 23.1 s | 23.2 s | 23.1 s | 23.4 s | 1.53x | 1.53x |
