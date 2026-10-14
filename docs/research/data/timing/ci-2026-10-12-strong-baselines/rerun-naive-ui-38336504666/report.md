## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| naive-ui | jsdom-default | 5/5 | 333.5 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| naive-ui | jsdom-shared | 5/5 | 62.5 s | 5.33x | 4.03-5.58x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | jsdom-vm | 5/5 | 98.6 s | 3.38x | 3.30-3.45x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | warpdom-default | 5/5 | 296.1 s | 1.13x | 1.11-1.13x (95% CI) | 0 (0) | 0 (0) | — | — |
| naive-ui | warpdom-vm | 5/5 | 90.7 s | 3.68x | 3.65-3.74x (95% CI) | 9 (9) | 6 (6) | 0 | 45 |
| naive-ui | warpdom-sharedfresh | 5/5 | 59.8 s | 5.57x | 5.27-5.88x (95% CI) | 941 (945) | 89 (91) | 0 | 4698 |
| naive-ui | warpdom-sharedreset | 5/5 | 48.9 s | 6.82x | 6.56-7.15x (95% CI) | 451 (775) | 53 (83) | 0 | 2498 |
| naive-ui | warpdom-learned (cli) | 5/5 | 139.5 s | 2.39x | 2.33-4.61x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| naive-ui | happydom-shared | 5/5 | 75.3 s | 4.43x | 3.52-5.60x (95% CI) | 23 (26) | 6 (8) | 0 | 121 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared and jsdom-vm whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| naive-ui | jsdom-shared, jsdom-default | jsdom-shared | 62.5 s | 139.5 s | 0.44x | 0.43-0.93x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 1 suites: 0.44x (95% bootstrap interval 0.43-0.93x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** none.

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median warpdom-default - median warpdom-learned).

| Suite | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| naive-ui | cli | 6 | 0-43 | 0.15 | split 6 | 1.00 | 296.9 / 78.2 / 107.8 s | 193.3 s | 1.2 | 73 | 78 |
