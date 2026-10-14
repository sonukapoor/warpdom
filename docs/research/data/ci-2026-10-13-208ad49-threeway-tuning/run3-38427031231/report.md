| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 5 | 452.6 s | 364.2 s | — | — | 1.25x | 1.25x | 0 (0) / — / — |
| analog | 5 | 20.0 s | 16.8 s | — | — | 1.19x | 1.19x | 0 (0) / — / — |
| ariakit | 5 | 583.0 s | 441.0 s | — | — | 1.32x | 1.32x | 7 (7) / — / — |
| ark-ui | 5 | 211.1 s | 131.5 s | — | — | 1.61x | 1.61x | 3 (2) / — / — |
| emoji-picker-element | 5 | 25.6 s | 21.6 s | — | — | 1.18x | 1.18x | 0 (0) / — / — |
| floating-ui | 5 | 24.9 s | 16.0 s | — | — | 1.55x | 1.55x | 0 (0) / — / — |
| handsontable | 5 | 435.4 s | 54.7 s | — | — | 7.97x | 7.97x | 3 (3) / — / — |
| material-ui | 5 | 272.3 s | 145.3 s | — | — | 1.88x | 1.88x | 0 (0) / — / — |
| radix-primitives | 5 | 46.8 s | 25.2 s | — | — | 1.86x | 1.86x | 0 (0) / — / — |
| react-hook-form | 5 | 10.8 s | 8.8 s | — | — | 1.22x | 1.22x | 0 (0) / — / — |
| react-spectrum | 5 | 457.6 s | 371.0 s | — | — | 1.26x | 1.26x | 0 (0) / — / — |
| solid | 5 | 3.5 s | 3.4 s | — | — | 1.03x | 1.03x | 1 (1) / — / — |
| svelte | 5 | 89.4 s | 82.3 s | — | — | 1.09x | 1.09x | 1 (1) / — / — |
| vuetify | 5 | 47.4 s | 31.1 s | — | — | 1.52x | 1.52x | 0 (0) / — / — |

Differ: the most tests differing from the same round's jsdom-default run in any round; in parentheses without the flaky tests (status changes between the suite's jsdom-default runs): CopilotKit 0, analog 0, ariakit 0, ark-ui 1, emoji-picker-element 0, floating-ui 0, handsontable 0, material-ui 0, radix-primitives 0, react-hook-form 0, react-spectrum 0, solid 0, svelte 0, vuetify 0.

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 452.6 s | 364.2 s | 48.7 s | 1.25x | 9.29x | 0.13x | 0 (0) / 4681 (4681) |
| analog | 20.0 s | 16.8 s | 17.5 s | 1.19x | 1.13x | 1.05x | 0 (0) / 2 (2) |
| ariakit | 583.0 s | 441.0 s | 267.4 s | 1.32x | 2.17x | 0.61x | 7 (7) / 51 (51) |
| ark-ui | 211.1 s | 131.5 s | 140.6 s | 1.61x | 1.46x | 1.08x | 3 (2) / 116 (115) |
| emoji-picker-element | 25.6 s | 21.6 s | 22.7 s | 1.18x | 1.13x | 1.05x | 0 (0) / 1 (1) |
| floating-ui | 24.9 s | 16.0 s | 19.4 s | 1.55x | 1.28x | 1.20x | 0 (0) / 14 (14) |
| handsontable | 435.4 s | 54.7 s | — | 7.97x | — | — | 3 (3) / 7646 (7646) |
| material-ui | 272.3 s | 145.3 s | 194.9 s | 1.88x | 1.40x | 1.34x | 0 (0) / 1042 (1042) |
| radix-primitives | 46.8 s | 25.2 s | 31.0 s | 1.86x | 1.50x | 1.23x | 0 (0) / 18 (18) |
| react-hook-form | 10.8 s | 8.8 s | 12.4 s | 1.22x | 0.88x | 1.40x | 0 (0) / 8 (8) |
| react-spectrum | 457.6 s | 371.0 s | 375.3 s | 1.26x | 1.21x | 1.04x | 0 (0) / 1489 (1489) |
| solid | 3.5 s | 3.4 s | 3.2 s | 1.03x | 1.09x | 0.94x | 1 (1) / 0 (0) |
| svelte | 89.4 s | 82.3 s | 81.0 s | 1.09x | 1.07x | 1.01x | 1 (1) / 288 (288) |
| vuetify | 47.4 s | 31.1 s | 31.3 s | 1.52x | 1.51x | 1.01x | 0 (0) / 4 (4) |

Medians over 14 suites with valid jsdom rounds: warpdom vs jsdom 1.29x, happy-dom vs jsdom 1.28x, warpdom vs happy-dom 1.05x.

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.25x | 1.22-1.25x (95% CI) |
| analog | 5 | 1.19x | 1.17-1.21x (95% CI) |
| ariakit | 5 | 1.32x | 1.32-1.33x (95% CI) |
| ark-ui | 5 | 1.61x | 1.54-1.61x (95% CI) |
| emoji-picker-element | 5 | 1.18x | 1.18-1.21x (95% CI) |
| floating-ui | 5 | 1.55x | 1.54-1.58x (95% CI) |
| handsontable | 5 | 7.97x | 7.80-8.04x (95% CI) |
| material-ui | 5 | 1.88x | 1.87-1.89x (95% CI) |
| radix-primitives | 5 | 1.86x | 1.84-1.88x (95% CI) |
| react-hook-form | 5 | 1.22x | 1.21-1.24x (95% CI) |
| react-spectrum | 5 | 1.26x | 1.16-1.34x (95% CI) |
| solid | 5 | 1.03x | 0.97-1.06x (95% CI) |
| svelte | 5 | 1.09x | 1.05-1.11x (95% CI) |
| vuetify | 5 | 1.52x | 1.51-1.55x (95% CI) |

Median speedup over 14 suites: 1.29x (95% bootstrap interval 1.19-1.59x, suites and rounds resampled, 10000 resamples).

**happy-dom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 9.29x | 9.19-9.43x (95% CI) |
| analog | 5 | 1.13x | 1.11-1.16x (95% CI) |
| ariakit | 5 | 2.17x | 2.17-2.18x (95% CI) |
| ark-ui | 5 | 1.46x | 1.41-1.50x (95% CI) |
| emoji-picker-element | 5 | 1.13x | 1.12-1.14x (95% CI) |
| floating-ui | 5 | 1.28x | 1.27-1.31x (95% CI) |
| material-ui | 5 | 1.40x | 1.39-1.40x (95% CI) |
| radix-primitives | 5 | 1.50x | 1.49-1.52x (95% CI) |
| react-hook-form | 5 | 0.88x | 0.85-0.90x (95% CI) |
| react-spectrum | 5 | 1.21x | 1.20-1.22x (95% CI) |
| solid | 5 | 1.09x | 1.06-1.10x (95% CI) |
| svelte | 5 | 1.07x | 1.04-1.15x (95% CI) |
| vuetify | 5 | 1.51x | 1.50-1.53x (95% CI) |

Median speedup over 13 suites: 1.28x (95% bootstrap interval 1.12-1.50x, suites and rounds resampled, 10000 resamples).

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | packages/react-core | 5 | 213.2 s | 216.2 s | 179.0 s | 178.0 s | 22.4 s | 22.0 s | 1.18x | 1.21x |
| CopilotKit | packages/vue | 5 | 136.7 s | 138.2 s | 113.1 s | 113.7 s | 7.4 s | 7.2 s | 1.21x | 1.22x |
| CopilotKit | packages/angular | 5 | 26.3 s | 27.6 s | 24.5 s | 24.3 s | 8.7 s | 8.5 s | 1.08x | 1.14x |
| CopilotKit | packages/web-inspector | 5 | 61.5 s | 62.2 s | 33.7 s | 33.5 s | 6.9 s | 7.0 s | 1.85x | 1.86x |
| CopilotKit | packages/web-components | 5 | 2.9 s | 2.9 s | 1.9 s | 1.9 s | 0.9 s | 1.0 s | 1.53x | 1.53x |
| CopilotKit | packages/a2ui-renderer | 5 | 5.0 s | 4.9 s | 4.2 s | 4.2 s | 1.0 s | 1.0 s | 1.17x | 1.17x |
| CopilotKit | packages/mcp-apps-renderer | 5 | 7.4 s | 7.5 s | 6.7 s | 6.6 s | 1.3 s | 1.2 s | 1.10x | 1.14x |
| analog | packages/router | 5 | 3.1 s | 3.8 s | 2.7 s | 2.7 s | 2.9 s | 2.9 s | 1.11x | 1.41x |
| analog | packages/content | 5 | 2.7 s | 2.7 s | 1.8 s | 1.7 s | 2.1 s | 2.2 s | 1.50x | 1.59x |
| analog | packages/vitest-angular | 5 | 1.6 s | 1.6 s | 1.1 s | 1.1 s | 1.2 s | 1.2 s | 1.45x | 1.45x |
| analog | packages/create-analog | 5 | 1.0 s | 1.0 s | 0.8 s | 0.8 s | 0.8 s | 0.8 s | 1.25x | 1.25x |
| analog | apps/analog-app | 5 | 2.2 s | 2.3 s | 2.0 s | 1.9 s | 2.0 s | 2.1 s | 1.11x | 1.21x |
| analog | apps/trpc-app | 5 | 3.2 s | 3.1 s | 2.9 s | 2.9 s | 2.9 s | 3.1 s | 1.10x | 1.07x |
| analog | libs/card | 5 | 3.5 s | 3.4 s | 3.0 s | 3.0 s | 3.1 s | 3.3 s | 1.17x | 1.13x |
| analog | libs/top-bar | 5 | 2.8 s | 2.7 s | 2.5 s | 2.5 s | 2.6 s | 2.7 s | 1.08x | 1.08x |
| analog | libs/my-package | 5 | — | — | — | — | — | — | — | — |
| ariakit | . | 5 | 583.0 s | 582.2 s | 441.0 s | 439.4 s | 267.4 s | 267.5 s | 1.32x | 1.32x |
| ark-ui | packages/react | 5 | 61.4 s | 62.1 s | 35.8 s | 37.1 s | 38.0 s | 40.3 s | 1.69x | 1.67x |
| ark-ui | packages/vue | 5 | 70.8 s | 72.2 s | 47.1 s | 48.0 s | 52.8 s | 56.3 s | 1.49x | 1.50x |
| ark-ui | packages/solid | 5 | 60.5 s | 62.5 s | 36.8 s | 38.2 s | 42.1 s | 44.7 s | 1.61x | 1.64x |
| ark-ui | packages/svelte | 5 | 18.2 s | 19.1 s | 10.9 s | 10.9 s | 7.9 s | 8.0 s | 1.66x | 1.75x |
| emoji-picker-element | . | 5 | 25.6 s | 25.9 s | 21.6 s | 22.4 s | 22.7 s | 22.9 s | 1.18x | 1.16x |
| floating-ui | packages/react | 5 | 19.6 s | 20.0 s | 11.9 s | 12.1 s | 14.8 s | 14.5 s | 1.63x | 1.65x |
| floating-ui | packages/react-dom | 5 | 1.9 s | 1.8 s | 1.4 s | 1.4 s | 1.6 s | 1.5 s | 1.36x | 1.29x |
| floating-ui | packages/dom | 5 | 1.4 s | 1.4 s | 1.1 s | 1.1 s | 1.2 s | 1.2 s | 1.27x | 1.27x |
| floating-ui | packages/vue | 5 | 2.0 s | 2.0 s | 1.6 s | 1.6 s | 1.8 s | 1.8 s | 1.25x | 1.25x |
| handsontable | handsontable | 5 | 395.2 s | 467.1 s | 35.5 s | 55.4 s | — | 80.4 s | 11.16x | 8.43x |
| handsontable | wrappers/react-wrapper | 5 | 20.9 s | 30.5 s | 8.8 s | 17.0 s | 9.5 s | 15.8 s | 2.35x | 1.79x |
| handsontable | wrappers/vue3 | 5 | 6.5 s | 13.1 s | 4.0 s | 10.1 s | 4.1 s | 9.1 s | 1.63x | 1.30x |
| handsontable | wrappers/angular-wrapper | 5 | 12.7 s | 223.9 s | 6.6 s | 208.3 s | 7.1 s | 201.5 s | 1.92x | 1.07x |
| material-ui | packages/mui-material | 5 | 210.2 s | 211.1 s | 112.4 s | 112.6 s | 152.3 s | 152.3 s | 1.87x | 1.87x |
| material-ui | packages/mui-system | 5 | 25.6 s | 26.0 s | 13.2 s | 13.3 s | 17.5 s | 17.2 s | 1.94x | 1.95x |
| material-ui | packages/mui-utils | 5 | 23.2 s | 23.5 s | 11.4 s | 11.3 s | 15.5 s | 15.6 s | 2.04x | 2.08x |
| material-ui | packages/mui-lab | 5 | 13.1 s | 12.7 s | 8.1 s | 8.0 s | 9.8 s | 9.9 s | 1.60x | 1.59x |
| radix-primitives | . | 5 | 46.8 s | 47.3 s | 25.2 s | 25.1 s | 31.0 s | 31.3 s | 1.86x | 1.88x |
| react-hook-form | . | 5 | 10.8 s | 11.5 s | 8.8 s | 8.9 s | 12.4 s | 12.4 s | 1.22x | 1.29x |
| react-spectrum | . | 5 | 457.6 s | 525.5 s | 371.0 s | 353.5 s | 375.3 s | 380.3 s | 1.26x | 1.49x |
| solid | packages/solid | 5 | 3.5 s | 3.5 s | 3.4 s | 3.5 s | 3.2 s | 3.2 s | 1.03x | 1.00x |
| svelte | . | 5 | 89.4 s | 102.9 s | 82.3 s | 80.5 s | 81.0 s | 84.2 s | 1.09x | 1.28x |
| vuetify | packages/vuetify | 5 | 47.4 s | 47.6 s | 31.1 s | 31.8 s | 31.3 s | 31.7 s | 1.52x | 1.50x |
