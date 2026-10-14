## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| solid-primitives | jsdom-default | 5/5 | 3.7 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid-primitives | jsdom-shared | 5/5 | 3.7 s | 1.00x | 1.00-1.00x (95% CI) | 21 (21) | 0 (0) | 63 | 42 |
| solid-primitives | jsdom-vm | 5/5 | 5.5 s | 0.67x | 0.67-0.69x (95% CI) | 25 (25) | 1 (1) | 63 | 20 |
| solid-primitives | warpdom-default | 5/5 | 3.3 s | 1.12x | 0.17-1.15x (95% CI) | 0 (25) | 0 (1) | — | — |
| solid-primitives | warpdom-vm | 5/5 | 5.2 s | 0.73x | 0.71-0.73x (95% CI) | 21 (21) | 0 (0) | 46 | 0 |
| solid-primitives | warpdom-sharedfresh | 5/5 | 3.4 s | 1.09x | 1.09-1.12x (95% CI) | 0 (21) | 0 (0) | 25 | 21 |
| solid-primitives | warpdom-sharedreset | 5/5 | 3.3 s | 1.12x | 1.12-1.15x (95% CI) | 21 (21) | 0 (0) | 46 | 0 |
| solid-primitives | warpdom-learned (harness) | 5/5 | 3.3 s | 1.12x | 1.12-1.15x (95% CI) | 21 (21) | 0 (0) | 46 | 21 |
| solid-primitives | happydom-shared | 5/5 | 3.4 s | 1.09x | 1.09-1.12x (95% CI) | 13 (34) | 6 (6) | 0 | 86 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared and jsdom-vm whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| solid-primitives | jsdom-default, jsdom-shared | jsdom-default | 3.7 s | 3.3 s | 1.12x | 1.12-1.15x (95% CI) | 21 | 46 |

warpdom-learned over the best correct jsdom configuration, median over 1 suites: 1.12x (95% bootstrap interval 1.12-1.15x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** none.

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median warpdom-default - median warpdom-learned).

| Suite | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| solid-primitives | harness | 6 | 0-0 | 1.00 | split 3, isolated 3 | 0.50 | 12.6 / 3.3 / 3.3 s | 6.6 s | never (learned not faster) | 0 | 0 |
