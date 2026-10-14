| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| material-ui | 5 | 272.1 s | 144.4 s | — | — | 1.88x | 1.88x | 0 / — / — |
| radix-primitives | 5 | 46.3 s | 24.9 s | — | — | 1.86x | 1.86x | 0 / — / — |
| svelte | 5 | 92.3 s | 83.9 s | — | — | 1.09x | 1.09x | 1 / — / — |
| vuetify | 5 | 28.4 s | 19.3 s | — | — | 1.47x | 1.47x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| material-ui | 5 | 1.88x | 1.88-1.89x (95% CI) |
| radix-primitives | 5 | 1.86x | 1.83-1.87x (95% CI) |
| svelte | 5 | 1.09x | 1.08-1.11x (95% CI) |
| vuetify | 5 | 1.47x | 1.44-1.48x (95% CI) |

Median speedup over 4 suites: 1.67x (95% bootstrap interval 1.10-1.88x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| material-ui | warpdom-default | 5 | 144.4 s | 1.88x | 1.88-1.89x (95% CI) | 0 |
| material-ui | warpdom-default-aa | 5 | 144.9 s | 1.88x | 1.87-1.89x (95% CI) | 0 |
| material-ui | warpdom-ablate-unset | 5 | 144.4 s | 1.88x | 1.88-1.89x (95% CI) | 0 |
| radix-primitives | warpdom-default | 5 | 24.9 s | 1.86x | 1.83-1.87x (95% CI) | 0 |
| radix-primitives | warpdom-default-aa | 5 | 25.0 s | 1.85x | 1.84-1.87x (95% CI) | 0 |
| radix-primitives | warpdom-ablate-unset | 5 | 25.1 s | 1.85x | 1.84-1.86x (95% CI) | 0 |
| svelte | warpdom-default | 5 | 83.9 s | 1.09x | 1.08-1.11x (95% CI) | 1 |
| svelte | warpdom-default-aa | 5 | 84.8 s | 1.07x | 1.07-1.09x (95% CI) | 1 |
| svelte | warpdom-ablate-unset | 5 | 84.6 s | 1.08x | 1.08-1.11x (95% CI) | 1 |
| vuetify | warpdom-default | 5 | 19.3 s | 1.47x | 1.44-1.48x (95% CI) | 0 |
| vuetify | warpdom-default-aa | 5 | 19.2 s | 1.49x | 1.46-1.53x (95% CI) | 0 |
| vuetify | warpdom-ablate-unset | 5 | 19.1 s | 1.49x | 1.47-1.53x (95% CI) | 0 |

**A/A controls** (paired ratio warpdom-default / control per round: median, range below 5 rounds, else 95% bootstrap interval; max deviation = largest |ratio - 1| over rounds)

| Suite | control | rounds | ratio | interval | max deviation | differ (control) |
| --- | --- | --- | --- | --- | --- | --- |
| material-ui | warpdom-default-aa | 5 | 0.996 | 0.996-1.001 (95% CI) | 0.4% | 0 |
| material-ui | warpdom-ablate-unset | 5 | 1.001 | 0.997-1.002 (95% CI) | 0.3% | 0 |
| radix-primitives | warpdom-default-aa | 5 | 0.996 | 0.984-1.020 (95% CI) | 2.0% | 0 |
| radix-primitives | warpdom-ablate-unset | 5 | 0.992 | 0.984-1.008 (95% CI) | 1.6% | 0 |
| svelte | warpdom-default-aa | 5 | 0.986 | 0.979-0.993 (95% CI) | 2.1% | 1 |
| svelte | warpdom-ablate-unset | 5 | 0.992 | 0.973-1.004 (95% CI) | 2.7% | 1 |
| vuetify | warpdom-default-aa | 5 | 1.031 | 0.995-1.032 (95% CI) | 3.2% | 0 |
| vuetify | warpdom-ablate-unset | 5 | 1.005 | 1.000-1.037 (95% CI) | 3.7% | 0 |

warpdom-default-aa: 20 paired rounds over all suites, median ratio 0.996, median |log ratio| 0.008 (0.8%), 95th percentile 3.1%.

warpdom-ablate-unset: 20 paired rounds over all suites, median ratio 1.000, median |log ratio| 0.004 (0.4%), 95th percentile 3.7%.

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | warpdom-default-aa | warpdom-default-aa warm-up | warpdom-ablate-unset | warpdom-ablate-unset warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| material-ui | packages/mui-material | 5 | 210.0 s | 209.8 s | 112.0 s | 112.1 s | 112.4 s | 112.5 s | 111.8 s | 112.2 s | 1.88x | 1.87x |
| material-ui | packages/mui-system | 5 | 25.6 s | 26.2 s | 13.2 s | 13.2 s | 13.2 s | 13.4 s | 13.2 s | 13.4 s | 1.95x | 1.98x |
| material-ui | packages/mui-utils | 5 | 23.4 s | 23.4 s | 11.2 s | 11.3 s | 11.3 s | 11.2 s | 11.3 s | 11.4 s | 2.09x | 2.07x |
| material-ui | packages/mui-lab | 5 | 13.1 s | 12.8 s | 8.0 s | 8.0 s | 7.9 s | 8.0 s | 8.0 s | 7.8 s | 1.63x | 1.60x |
| radix-primitives | . | 5 | 46.3 s | 46.6 s | 24.9 s | 24.7 s | 25.0 s | 25.1 s | 25.1 s | 25.3 s | 1.86x | 1.89x |
| svelte | . | 5 | 92.3 s | 107.0 s | 83.9 s | 82.9 s | 84.8 s | 83.8 s | 84.6 s | 84.4 s | 1.09x | 1.29x |
| vuetify | packages/vuetify | 5 | 28.4 s | 28.9 s | 19.3 s | 19.7 s | 19.2 s | 19.1 s | 19.1 s | 19.1 s | 1.47x | 1.47x |
