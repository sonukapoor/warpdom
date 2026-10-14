| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 420.0 s | 342.4 s | — | — | 1.23x | 1.23x | 0 (0) / — / — |
| analog | 5 | 31.8 s | 26.2 s | — | — | 1.21x | 1.21x | 0 (0) / — / — |
| ariakit | 5 | 630.4 s | 454.3 s | — | — | 1.39x | 1.39x | 7 (7) / — / — |
| ark-ui | 5 | 206.1 s | 132.9 s | — | — | 1.56x | 1.56x | 3 (1) / — / — |
| emoji-picker-element | 5 | 37.2 s | 29.1 s | — | — | 1.27x | 1.27x | 0 (0) / — / — |
| floating-ui | 5 | 24.5 s | 16.1 s | — | — | 1.52x | 1.52x | 0 (0) / — / — |
| handsontable | 5 | 776.7 s | 88.1 s | — | — | 8.87x | 8.87x | 3 (3) / — / — |
| material-ui | 5 | 271.7 s | 144.1 s | — | — | 1.88x | 1.88x | 0 (0) / — / — |
| radix-primitives | 5 | 28.9 s | 16.2 s | — | — | 1.75x | 1.75x | 0 (0) / — / — |
| react-hook-form | 5 | 13.6 s | 11.2 s | — | — | 1.21x | 1.21x | 0 (0) / — / — |
| react-spectrum | 5 | 379.4 s | 318.4 s | — | — | 1.19x | 1.19x | 0 (0) / — / — |
| solid | 5 | 3.3 s | 3.3 s | — | — | 1.03x | 1.03x | 1 (1) / — / — |
| svelte | 5 | 86.6 s | 79.9 s | — | — | 1.08x | 1.08x | 1 (1) / — / — |
| vuetify | 5 | 46.6 s | 30.7 s | — | — | 1.51x | 1.51x | 0 (0) / — / — |

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): CopilotKit 0, analog 0, ariakit 0, ark-ui 2, emoji-picker-element 0, floating-ui 0, handsontable 0, material-ui 0, radix-primitives 0, react-hook-form 0, react-spectrum 0, solid 0, svelte 0, vuetify 0.

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 420.0 s | 342.4 s | 45.4 s | 1.23x | 9.25x | 0.13x | 0 (0) / 4681 (4681) |
| analog | 31.8 s | 26.2 s | 28.2 s | 1.21x | 1.13x | 1.08x | 0 (0) / 2 (2) |
| ariakit | 630.4 s | 454.3 s | 296.1 s | 1.39x | 2.12x | 0.65x | 7 (7) / 51 (51) |
| ark-ui | 206.1 s | 132.9 s | 144.2 s | 1.56x | 1.43x | 1.09x | 3 (1) / 116 (114) |
| emoji-picker-element | 37.2 s | 29.1 s | 32.4 s | 1.27x | 1.15x | 1.11x | 0 (0) / 1 (1) |
| floating-ui | 24.5 s | 16.1 s | 19.5 s | 1.52x | 1.27x | 1.20x | 0 (0) / 14 (14) |
| handsontable | 776.7 s | 88.1 s | — | 8.87x | — | — | 3 (3) / — |
| material-ui | 271.7 s | 144.1 s | 194.3 s | 1.88x | 1.40x | 1.34x | 0 (0) / 1042 (1042) |
| radix-primitives | 28.9 s | 16.2 s | 19.2 s | 1.75x | 1.51x | 1.18x | 0 (0) / 18 (18) |
| react-hook-form | 13.6 s | 11.2 s | 14.5 s | 1.21x | 0.94x | 1.31x | 0 (0) / 8 (8) |
| react-spectrum | 379.4 s | 318.4 s | 316.1 s | 1.19x | 1.20x | 1.00x | 0 (0) / 1485 (1485) |
| solid | 3.3 s | 3.3 s | 3.1 s | 1.03x | 1.10x | 0.94x | 1 (1) / 0 (0) |
| svelte | 86.6 s | 79.9 s | 82.4 s | 1.08x | 1.05x | 1.02x | 1 (1) / 288 (288) |
| vuetify | 46.6 s | 30.7 s | 30.7 s | 1.51x | 1.51x | 1.00x | 0 (0) / 4 (4) |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.33x, happy-dom vs jsdom 1.27x, warpdom vs happy-dom 1.08x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.23x | 1.22-1.23x (95% CI) |
| analog | 5 | 1.21x | 1.21-1.23x (95% CI) |
| ariakit | 5 | 1.39x | 1.36-1.40x (95% CI) |
| ark-ui | 5 | 1.56x | 1.54-1.58x (95% CI) |
| emoji-picker-element | 5 | 1.27x | 1.26-1.30x (95% CI) |
| floating-ui | 5 | 1.52x | 1.48-1.57x (95% CI) |
| handsontable | 5 | 8.87x | 8.59-9.04x (95% CI) |
| material-ui | 5 | 1.88x | 1.87-1.89x (95% CI) |
| radix-primitives | 5 | 1.75x | 1.72-1.86x (95% CI) |
| react-hook-form | 5 | 1.21x | 1.21-1.23x (95% CI) |
| react-spectrum | 5 | 1.19x | 1.14-1.23x (95% CI) |
| solid | 5 | 1.03x | 0.97-1.06x (95% CI) |
| svelte | 5 | 1.08x | 1.03-1.10x (95% CI) |
| vuetify | 5 | 1.51x | 1.50-1.53x (95% CI) |

Median speedup over 14 suites: 1.33x (95% bootstrap interval 1.21-1.56x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 9.25x | 9.22-9.36x (95% CI) |
| analog | 5 | 1.13x | 1.12-1.14x (95% CI) |
| ariakit | 5 | 2.12x | 2.08-2.19x (95% CI) |
| ark-ui | 5 | 1.43x | 1.40-1.46x (95% CI) |
| emoji-picker-element | 5 | 1.15x | 1.14-1.16x (95% CI) |
| floating-ui | 5 | 1.27x | 1.25-1.28x (95% CI) |
| material-ui | 5 | 1.40x | 1.39-1.42x (95% CI) |
| radix-primitives | 5 | 1.51x | 1.46-1.54x (95% CI) |
| react-hook-form | 5 | 0.94x | 0.89-0.95x (95% CI) |
| react-spectrum | 5 | 1.20x | 1.17-1.21x (95% CI) |
| solid | 5 | 1.10x | 1.06-1.10x (95% CI) |
| svelte | 5 | 1.05x | 1.03-1.09x (95% CI) |
| vuetify | 5 | 1.51x | 1.49-1.53x (95% CI) |

Median speedup over 13 suites: 1.27x (95% bootstrap interval 1.13-1.51x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | packages/react-core | 5 | 196.1 s | 195.1 s | 167.8 s | 166.9 s | 20.8 s | 20.8 s | 1.17x | 1.17x |
| CopilotKit | packages/vue | 5 | 125.6 s | 125.0 s | 105.7 s | 104.8 s | 6.7 s | 6.7 s | 1.19x | 1.19x |
| CopilotKit | packages/angular | 5 | 25.4 s | 26.3 s | 24.3 s | 23.8 s | 8.2 s | 8.2 s | 1.05x | 1.11x |
| CopilotKit | packages/web-inspector | 5 | 58.2 s | 58.1 s | 32.3 s | 31.9 s | 6.5 s | 6.5 s | 1.80x | 1.82x |
| CopilotKit | packages/web-components | 5 | 2.7 s | 2.7 s | 1.8 s | 1.8 s | 0.9 s | 0.9 s | 1.50x | 1.50x |
| CopilotKit | packages/a2ui-renderer | 5 | 4.6 s | 4.6 s | 4.0 s | 3.9 s | 0.9 s | 1.0 s | 1.15x | 1.18x |
| CopilotKit | packages/mcp-apps-renderer | 5 | 7.2 s | 7.3 s | 6.5 s | 6.4 s | 1.2 s | 1.2 s | 1.11x | 1.14x |
| analog | packages/router | 5 | 3.8 s | 5.0 s | 3.2 s | 3.2 s | 3.5 s | 3.4 s | 1.19x | 1.56x |
| analog | packages/content | 5 | 4.4 s | 4.5 s | 2.8 s | 2.8 s | 3.5 s | 3.6 s | 1.57x | 1.61x |
| analog | packages/vitest-angular | 5 | 2.7 s | 2.7 s | 1.7 s | 1.7 s | 2.1 s | 2.1 s | 1.59x | 1.59x |
| analog | packages/create-analog | 5 | 1.7 s | 1.6 s | 1.2 s | 1.2 s | 1.3 s | 1.4 s | 1.42x | 1.33x |
| analog | apps/analog-app | 5 | 3.7 s | 3.8 s | 3.2 s | 3.2 s | 3.4 s | 3.4 s | 1.16x | 1.19x |
| analog | apps/trpc-app | 5 | 5.2 s | 5.2 s | 4.8 s | 4.8 s | 5.0 s | 4.9 s | 1.08x | 1.08x |
| analog | libs/card | 5 | 5.7 s | 5.7 s | 4.9 s | 4.9 s | 5.1 s | 5.1 s | 1.16x | 1.16x |
| analog | libs/top-bar | 5 | 4.6 s | 4.6 s | 4.1 s | 4.1 s | 4.3 s | 4.3 s | 1.12x | 1.12x |
| analog | libs/my-package | 5 | — | — | — | — | — | — | — | — |
| ariakit | . | 5 | 630.4 s | 620.7 s | 454.3 s | 457.2 s | 296.1 s | 295.7 s | 1.39x | 1.36x |
| ark-ui | packages/react | 5 | 59.8 s | 60.2 s | 36.4 s | 36.3 s | 38.9 s | 38.3 s | 1.64x | 1.66x |
| ark-ui | packages/vue | 5 | 69.2 s | 69.9 s | 47.3 s | 47.7 s | 54.0 s | 53.0 s | 1.46x | 1.47x |
| ark-ui | packages/solid | 5 | 59.4 s | 59.5 s | 37.5 s | 37.5 s | 43.4 s | 42.8 s | 1.59x | 1.59x |
| ark-ui | packages/svelte | 5 | 17.9 s | 18.1 s | 11.0 s | 10.9 s | 7.9 s | 8.1 s | 1.65x | 1.66x |
| emoji-picker-element | . | 5 | 37.2 s | 36.8 s | 29.1 s | 29.1 s | 32.4 s | 32.1 s | 1.27x | 1.26x |
| floating-ui | packages/react | 5 | 19.1 s | 18.5 s | 11.8 s | 12.0 s | 14.8 s | 14.0 s | 1.62x | 1.54x |
| floating-ui | packages/react-dom | 5 | 1.9 s | 1.9 s | 1.4 s | 1.4 s | 1.6 s | 1.6 s | 1.36x | 1.36x |
| floating-ui | packages/dom | 5 | 1.4 s | 1.4 s | 1.1 s | 1.1 s | 1.3 s | 1.3 s | 1.27x | 1.27x |
| floating-ui | packages/vue | 5 | 2.0 s | 2.1 s | 1.7 s | 1.6 s | 1.8 s | 1.8 s | 1.18x | 1.31x |
| handsontable | handsontable | 5 | 714.3 s | 781.3 s | 57.4 s | 79.1 s | — | — | 12.52x | 9.88x |
| handsontable | wrappers/react-wrapper | 5 | 32.5 s | 43.5 s | 12.9 s | 22.5 s | — | 23.9 s | 2.53x | 1.93x |
| handsontable | wrappers/vue3 | 5 | 10.6 s | 18.4 s | 6.6 s | 14.4 s | — | 14.9 s | 1.63x | 1.28x |
| handsontable | wrappers/angular-wrapper | 5 | 20.9 s | 365.7 s | 11.3 s | 357.2 s | — | 364.4 s | 1.86x | 1.02x |
| material-ui | packages/mui-material | 5 | 209.8 s | 208.3 s | 111.8 s | 112.2 s | 151.7 s | 149.5 s | 1.87x | 1.86x |
| material-ui | packages/mui-system | 5 | 25.8 s | 25.5 s | 13.1 s | 12.9 s | 17.2 s | 16.9 s | 1.96x | 1.98x |
| material-ui | packages/mui-utils | 5 | 23.3 s | 23.5 s | 11.1 s | 11.2 s | 15.4 s | 15.5 s | 2.09x | 2.10x |
| material-ui | packages/mui-lab | 5 | 13.0 s | 12.6 s | 8.0 s | 7.9 s | 9.6 s | 9.7 s | 1.63x | 1.59x |
| radix-primitives | . | 5 | 28.9 s | 28.6 s | 16.2 s | 15.9 s | 19.2 s | 18.9 s | 1.75x | 1.80x |
| react-hook-form | . | 5 | 13.6 s | 14.5 s | 11.2 s | 11.5 s | 14.5 s | 14.6 s | 1.21x | 1.26x |
| react-spectrum | . | 5 | 379.4 s | 439.6 s | 318.4 s | 306.4 s | 316.1 s | 320.3 s | 1.19x | 1.43x |
| solid | packages/solid | 5 | 3.3 s | 3.9 s | 3.3 s | 3.4 s | 3.1 s | 3.1 s | 1.03x | 1.15x |
| svelte | . | 5 | 86.6 s | 106.6 s | 79.9 s | 83.6 s | 82.4 s | 90.3 s | 1.08x | 1.28x |
| vuetify | packages/vuetify | 5 | 46.6 s | 47.2 s | 30.7 s | 31.0 s | 30.7 s | 30.9 s | 1.51x | 1.52x |
