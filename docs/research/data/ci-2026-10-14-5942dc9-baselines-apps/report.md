## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-default | 3/3 | 262.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| excalidraw | jsdom-shared | 3/3 | 30.7 s | 8.67x | 8.52-8.93x (range) | 2341 (2341) | 141 (141) | 0 | 6885 |
| excalidraw | jsdom-vm | 3/3 | 286.6 s | 0.92x | 0.91-0.95x (range) | 32 (38) | 5 (5) | 0 | 100 |
| excalidraw | jsdom-sharedclean | 3/3 | 30.9 s | 8.58x | 8.46-8.78x (range) | 2341 (2341) | 141 (141) | 0 | 6885 |
| excalidraw | jsdom-learned (harness) | 3/3 | 267.5 s | 0.98x | 0.98-0.99x (range) | 0 (0) | 0 (0) | 0 | 0 |
| excalidraw | warpdom-default | 3/3 | 219.7 s | 1.21x | 1.19-1.23x (range) | 0 (0) | 0 (0) | — | — |
| excalidraw | warpdom-vm | 1/3 | 286.2 s | 0.91x | 0.91-0.91x (range) | 2556 (2556) | 143 (143) | 0 | 5026 |
| excalidraw | warpdom-sharedfresh | 3/3 | 23.9 s | 10.98x | 10.81-11.23x (range) | 2341 (2341) | 141 (141) | 0 | 6885 |
| excalidraw | warpdom-sharedreset | 3/3 | 23.8 s | 11.03x | 10.76-11.23x (range) | 2341 (2341) | 141 (141) | 0 | 6885 |
| excalidraw | warpdom-learned (harness) | 3/3 | 212.3 s | 1.24x | 1.22-1.25x (range) | 0 (0) | 0 (0) | 0 | 0 |
| excalidraw | happydom-shared | 3/3 | 27.4 s | 9.65x | 9.37-9.71x (range) | 2342 (2342) | 142 (142) | 0 | 6888 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared, jsdom-vm, jsdom-sharedclean (those that ran) whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-default | jsdom-default | 262.4 s | 212.3 s | 1.24x | 1.22-1.25x (range) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 1 suites: 1.24x (95% bootstrap interval 1.22-1.25x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** excalidraw (jsdom-shared, jsdom-vm, jsdom-sharedclean).

## Policy and DOM

jsdom-learned: learned isolation's policy (the harness emulation) on jsdom, without any reset between files. Speedups: median of per-round ratios. Differing tests: max over rounds against jsdom-default; false passes: sum over rounds (G2 violations).

| Suite | jsdom-learned | over jsdom-default | interval | tests differ (max) | false passes | warpdom-learned over jsdom-learned | interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 267.5 s | 0.98x | 0.98-0.99x (range) | 0 | 0 | 1.25x | 1.24-1.28x (range) |

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median isolated run - median learned run), the isolated run being the same DOM's default (warpdom-default, or jsdom-default for jsdom-learned).

| Suite | configuration | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-learned | harness | 4 | 141-141 | 1.00 | isolated 4 | 1.00 | 263.2 / 29.9 / 274.4 s | 304.3 s | never (learned not faster) | 0 | 0 |
| excalidraw | warpdom-learned | harness | 4 | 141-141 | 1.00 | isolated 4 | 1.00 | 213.7 / 23.8 / 221.5 s | 245.3 s | 33.1 | 0 | 0 |
