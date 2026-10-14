| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| radix-primitives | 1 | 41.5 s | 22.4 s | — | — | 1.85x | 1.85x | 0 / — / — |

**warpdom vs jsdom: speedup and its uncertainty** (median of per-round ratios; range for fewer than 5 rounds, else 95% bootstrap interval)

| Suite | rounds | speedup | interval |
| --- | --- | --- | --- |
| radix-primitives | 1 | 1.85x | 1.85-1.85x (range) |

Median speedup over 1 suites: 1.85x (95% bootstrap interval 1.85-1.85x, suites and rounds resampled, 10000 resamples).

**All configurations against jsdom-default** (speedup: median of per-round ratios; range below 5 rounds, else 95% bootstrap interval)

| Suite | configuration | rounds | median time | speedup | interval | differ |
| --- | --- | --- | --- | --- | --- | --- |
| radix-primitives | warpdom-default | 1 | 22.4 s | 1.85x | 1.85-1.85x (range) | 0 |
| radix-primitives | jsdom-shared | 1 | 12.7 s | 3.27x | 3.27-3.27x (range) | 0 |
| radix-primitives | warpdom-sharedfresh | 1 | 48.0 s | 0.86x | 0.86-0.86x (range) | 611 |
| radix-primitives | warpdom-sharedreset | 1 | 10.8 s | 3.84x | 3.84-3.84x (range) | 0 |
| radix-primitives | warpdom-learned | 1 | 8.5 s | 4.88x | 4.88-4.88x (range) | 0 |
