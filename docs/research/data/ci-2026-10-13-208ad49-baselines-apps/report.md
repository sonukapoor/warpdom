## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-default | 2/2 | 264.9 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| excalidraw | jsdom-shared | 2/2 | 30.1 s | 8.78x | 8.74-8.83x (range) | 2341 (2341) | 141 (141) | 0 | 4590 |
| excalidraw | jsdom-vm | 2/2 | 289.9 s | 0.91x | 0.91-0.92x (range) | 28 (28) | 1 (1) | 0 | 56 |
| excalidraw | jsdom-sharedclean | 2/2 | 30.6 s | 8.66x | 8.60-8.71x (range) | 2341 (2341) | 141 (141) | 0 | 4590 |
| excalidraw | jsdom-learned (harness) | 2/2 | 264.9 s | 1.00x | 1.00-1.00x (range) | 0 (0) | 0 (0) | 0 | 0 |
| excalidraw | warpdom-default | 2/2 | 214.8 s | 1.23x | 1.23-1.23x (range) | 0 (0) | 0 (0) | — | — |
| excalidraw | warpdom-vm | 0/2 | — | — | — | 2556 (2556) | 143 (143) | 0 | 5016 |
| excalidraw | warpdom-sharedfresh | 2/2 | 24.3 s | 10.92x | 10.85-10.99x (range) | 2341 (2341) | 141 (141) | 0 | 4590 |
| excalidraw | warpdom-sharedreset | 2/2 | 24.1 s | 10.97x | 10.94-10.99x (range) | 2341 (2341) | 141 (141) | 0 | 4590 |
| excalidraw | warpdom-learned (harness) | 2/2 | 215.3 s | 1.23x | 1.23-1.23x (range) | 0 (0) | 0 (0) | 0 | 0 |
| excalidraw | happydom-shared | 2/2 | 27.9 s | 9.51x | 9.46-9.56x (range) | 2342 (2342) | 142 (142) | 0 | 4592 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared, jsdom-vm, jsdom-sharedclean (those that ran) whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-default | jsdom-default | 264.9 s | 215.3 s | 1.23x | 1.23-1.23x (range) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 1 suites: 1.23x (95% bootstrap interval 1.23-1.23x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** excalidraw (jsdom-shared, jsdom-vm, jsdom-sharedclean).

## Policy and DOM

jsdom-learned: learned isolation's policy (the harness emulation) on jsdom, without any reset between files. Speedups: median of per-round ratios. Differing tests: max over rounds against jsdom-default; false passes: sum over rounds (G2 violations).

| Suite | jsdom-learned | over jsdom-default | interval | tests differ (max) | false passes | warpdom-learned over jsdom-learned | interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | 264.9 s | 1.00x | 1.00-1.00x (range) | 0 | 0 | 1.23x | 1.23-1.23x (range) |

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median isolated run - median learned run), the isolated run being the same DOM's default (warpdom-default, or jsdom-default for jsdom-learned).

| Suite | configuration | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| excalidraw | jsdom-learned | harness | 3 | 141-141 | 1.00 | isolated 3 | 1.00 | 265.0 / 30.5 / 274.2 s | 304.9 s | never (learned not faster) | 0 | 0 |
| excalidraw | warpdom-learned | harness | 3 | 141-141 | 1.00 | isolated 3 | 1.00 | 215.3 / 24.3 / 222.9 s | 247.1 s | never (learned not faster) | 0 | 0 |
