# Paired ratios: time(ablated) / time(warpdom-default) per round, medians and timing-report.cjs's two-level bootstrap (tools/paired-ratio.sh); > 1 = the ablation is slower

## warpdomeager-default, tuning-38287824993
**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.00x | 0.99-1.01x (95% CI) |
| analog | 5 | 1.01x | 1.00-1.02x (95% CI) |
| ariakit | 5 | 1.01x | 1.00-1.01x (95% CI) |
| ark-ui | 5 | 0.98x | 0.96-1.02x (95% CI) |
| emoji-picker-element | 5 | 1.00x | 0.99-1.01x (95% CI) |
| floating-ui | 5 | 0.98x | 0.97-1.02x (95% CI) |
| handsontable | 5 | 0.99x | 0.18-1.01x (95% CI) |
| material-ui | 5 | 1.01x | 1.00-1.02x (95% CI) |
| radix-primitives | 5 | 1.02x | 1.00-1.02x (95% CI) |
| react-hook-form | 5 | 1.01x | 0.98-1.03x (95% CI) |
| react-spectrum | 5 | 1.00x | 0.95-1.03x (95% CI) |
| solid | 5 | 1.00x | 1.00-1.06x (95% CI) |
| svelte | 5 | 0.98x | 0.98-1.02x (95% CI) |
| vuetify | 5 | 1.01x | 1.00-1.02x (95% CI) |

Median speedup over 14 suites: 1.00x (95% bootstrap interval 1.00-1.01x, suites and rounds resampled, 10000 resamples).

## warpdomeager-default, held-out-38287832655
**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.02x | 0.80-1.05x (95% CI) |
| downshift | 5 | 0.99x | 0.74-1.01x (95% CI) |
| melt-ui | 5 | 1.00x | 0.98-1.01x (95% CI) |
| naive-ui | 5 | 1.00x | 0.99-1.01x (95% CI) |
| react-router | 5 | 1.00x | 0.90-1.02x (95% CI) |
| solid-primitives | 5 | 1.04x | 0.21-1.07x (95% CI) |
| taiga-ui | 5 | 1.01x | 0.95-1.02x (95% CI) |
| tanstack-query | 5 | 1.00x | 0.99-1.01x (95% CI) |
| vueuse | 5 | 1.01x | 1.00-1.02x (95% CI) |

Median speedup over 9 suites: 1.00x (95% bootstrap interval 1.00-1.01x, suites and rounds resampled, 10000 resamples).

## warpdomnocache-default, tuning-38287824993
**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| CopilotKit | 5 | 1.01x | 1.00-1.01x (95% CI) |
| analog | 5 | 1.00x | 0.99-1.01x (95% CI) |
| ariakit | 5 | 1.01x | 1.00-1.02x (95% CI) |
| ark-ui | 5 | 1.00x | 0.95-1.03x (95% CI) |
| emoji-picker-element | 5 | 1.00x | 0.98-1.01x (95% CI) |
| floating-ui | 5 | 0.98x | 0.96-1.01x (95% CI) |
| handsontable | 5 | 0.98x | 0.18-1.02x (95% CI) |
| material-ui | 5 | 1.00x | 0.99-1.00x (95% CI) |
| radix-primitives | 5 | 1.01x | 1.01-1.03x (95% CI) |
| react-hook-form | 5 | 1.00x | 0.98-1.02x (95% CI) |
| react-spectrum | 5 | 1.03x | 0.92-1.05x (95% CI) |
| solid | 5 | 0.97x | 0.97-1.00x (95% CI) |
| svelte | 5 | 1.00x | 0.97-1.04x (95% CI) |
| vuetify | 5 | 1.00x | 0.99-1.02x (95% CI) |

Median speedup over 14 suites: 1.00x (95% bootstrap interval 0.99-1.01x, suites and rounds resampled, 10000 resamples).

## warpdomnocache-default, held-out-38287832655
**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| dom-testing-library | 5 | 1.00x | 0.80-1.02x (95% CI) |
| downshift | 5 | 0.97x | 0.73-1.01x (95% CI) |
| melt-ui | 5 | 1.01x | 1.00-1.01x (95% CI) |
| naive-ui | 5 | 1.00x | 0.99-1.00x (95% CI) |
| react-router | 5 | 1.02x | 0.89-1.03x (95% CI) |
| solid-primitives | 5 | 1.00x | 1.00-5.02x (95% CI) |
| taiga-ui | 5 | 0.99x | 0.95-1.03x (95% CI) |
| tanstack-query | 5 | 0.99x | 0.98-1.00x (95% CI) |
| vueuse | 5 | 1.00x | 0.99-1.01x (95% CI) |

Median speedup over 9 suites: 1.00x (95% bootstrap interval 0.99-1.01x, suites and rounds resampled, 10000 resamples).

## all 23 suites
warpdomeager-default: Median speedup over 23 suites: 1.00x (95% bootstrap interval 1.00-1.01x, suites and rounds resampled, 10000 resamples).
warpdomnocache-default: Median speedup over 23 suites: 1.00x (95% bootstrap interval 0.99-1.00x, suites and rounds resampled, 10000 resamples).
