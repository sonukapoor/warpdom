## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-default | 4/4 | 263.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| excalidraw | jsdom-shared | 4/4 | 30.1 s | 8.74x | 8.68-8.90x (range) | 2341 (2341) | 141 (141) | 0 | 9180 |
| excalidraw | jsdom-vm | 4/4 | 288.4 s | 0.91x | 0.90-0.92x (range) | 30.5 (35) | 3.5 (4) | 0 | 117 |
| excalidraw | warpdom-default | 4/4 | 213.6 s | 1.23x | 1.22-1.24x (range) | 2 (2) | 2 (2) | — | — |
| excalidraw | warpdom-vm | 2/4 | 831.6 s | 0.32x | 0.30-0.33x (range) | 1283.5 (2556) | 73 (143) | 0 | 5024 |
| excalidraw | warpdom-sharedfresh | 4/4 | 23.8 s | 11.04x | 10.93-11.14x (range) | 2341 (2341) | 141 (141) | 0 | 9172 |
| excalidraw | warpdom-sharedreset | 4/4 | 23.9 s | 11.03x | 10.98-11.11x (range) | 2341 (2341) | 141 (141) | 0 | 9172 |
| excalidraw | warpdom-learned (harness) | 4/4 | 213.6 s | 1.23x | 1.23-1.24x (range) | 2 (2) | 2 (2) | 0 | 0 |
| excalidraw | happydom-shared | 4/4 | 27.1 s | 9.69x | 9.55-9.76x (range) | 2342 (2342) | 142 (142) | 0 | 9184 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared and jsdom-vm whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-default | jsdom-default | 263.4 s | 213.6 s | 1.23x | 1.23-1.24x (range) | 2 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 1 suites: 1.23x (95% bootstrap interval 1.23-1.24x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** excalidraw (jsdom-shared, jsdom-vm).

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median warpdom-default - median warpdom-learned).

| Suite | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | harness | 5 | 139-139 | 1.00 | isolated 5 | 1.00 | 213.7 / 23.9 / 216.3 s | 240.3 s | never (learned not faster) | 0 | 0 |
