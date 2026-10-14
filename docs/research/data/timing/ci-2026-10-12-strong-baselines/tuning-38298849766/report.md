## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-default | 5/5 | 350.2 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| CopilotKit | jsdom-shared | 5/5 | 206.8 s | 1.68x | 1.64-1.77x (95% CI) | 1624 (1639) | 184 (188) | 0 | 8136 |
| CopilotKit | jsdom-vm | 5/5 | 134.7 s | 2.62x | 2.57-2.63x (95% CI) | 2240 (2240) | 212 (212) | 0 | 11200 |
| CopilotKit | warpdom-default | 5/5 | 282.8 s | 1.24x | 1.23-1.25x (95% CI) | 0 (0) | 0 (0) | — | — |
| CopilotKit | warpdom-vm | 5/5 | 185.9 s | 1.88x | 1.87-1.91x (95% CI) | 2234 (2234) | 207 (207) | 0 | 11170 |
| CopilotKit | warpdom-sharedfresh | 5/5 | 260.9 s | 1.33x | 1.33-1.36x (95% CI) | 2147 (2162) | 240 (241) | 0 | 10723 |
| CopilotKit | warpdom-sharedreset | 5/5 | 231.8 s | 1.50x | 1.47-1.53x (95% CI) | 1431 (1462) | 196 (196) | 0 | 7068 |
| CopilotKit | warpdom-learned (cli) | 5/5 | 297.2 s | 1.18x | 1.18-1.43x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| CopilotKit | happydom-shared | 3/5 | 10.6 s | 33.04x | 32.85-33.24x (range) | 4681 (4681) | 114 (114) | 0 | 23400 |
| analog | jsdom-default | 5/5 | 33.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| analog | jsdom-shared | 5/5 | 29.2 s | 1.16x | 1.12-1.18x (95% CI) | 98 (98) | 7 (7) | 0 | 466 |
| analog | jsdom-vm | 5/5 | 30.1 s | 1.12x | 1.09-1.15x (95% CI) | 5 (5) | 1 (1) | 0 | 25 |
| analog | warpdom-default | 5/5 | 26.4 s | 1.26x | 1.24-1.29x (95% CI) | 0 (0) | 0 (0) | — | — |
| analog | warpdom-vm | 5/5 | 25.2 s | 1.33x | 1.29-1.36x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | warpdom-sharedfresh | 5/5 | 24.7 s | 1.38x | 1.31-1.38x (95% CI) | 74 (98) | 7 (7) | 0 | 394 |
| analog | warpdom-sharedreset | 5/5 | 22.5 s | 1.51x | 1.44-1.52x (95% CI) | 104 (104) | 7 (7) | 0 | 496 |
| analog | warpdom-learned (cli) | 5/5 | 28.5 s | 1.20x | 1.13-1.22x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | happydom-shared | 5/5 | 26.4 s | 1.30x | 1.20-1.31x (95% CI) | 76 (100) | 7 (7) | 0 | 404 |
| ariakit | jsdom-default | 3/3 | 528.7 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| ariakit | jsdom-shared | 3/3 | 385.5 s | 1.36x | 1.36-1.38x (range) | 8 (11) | 3 (3) | 0 | 26 |
| ariakit | jsdom-vm | 3/3 | 401.5 s | 1.32x | 1.29-1.33x (range) | 6 (6) | 1 (1) | 12 | 6 |
| ariakit | warpdom-default | 3/3 | 404.7 s | 1.31x | 1.29-1.31x (range) | 7 (7) | 2 (2) | — | — |
| ariakit | warpdom-vm | 3/3 | 378.0 s | 1.39x | 1.39-1.41x (range) | 7 (7) | 2 (2) | 0 | 0 |
| ariakit | warpdom-sharedfresh | 3/3 | 154.0 s | 3.44x | 3.37-3.44x (range) | 1100 (1101) | 191 (192) | 0 | 3278 |
| ariakit | warpdom-sharedreset | 3/3 | 340.8 s | 1.55x | 1.54-1.56x (range) | 125 (129) | 33 (34) | 0 | 349 |
| ariakit | warpdom-learned (harness) | 3/3 | 406.6 s | 1.30x | 1.29-1.31x (range) | 7 (7) | 2 (2) | 0 | 0 |
| ariakit | happydom-shared | 3/3 | 125.0 s | 4.23x | 4.22-4.24x (range) | 59 (70) | 22 (24) | 123 | 61 |
| ark-ui | jsdom-default | 5/5 | 204.9 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| ark-ui | jsdom-shared | 5/5 | 199.9 s | 1.03x | 0.89-1.48x (95% CI) | 840 (852) | 132 (133) | 0 | 4208 |
| ark-ui | jsdom-vm | 5/5 | 70.6 s | 2.90x | 2.89-2.95x (95% CI) | 1 (4) | 1 (1) | 7 | 2 |
| ark-ui | warpdom-default | 5/5 | 129.2 s | 1.57x | 1.57-1.62x (95% CI) | 2 (4) | 1 (1) | — | — |
| ark-ui | warpdom-vm | 5/5 | 61.9 s | 3.30x | 3.27-3.39x (95% CI) | 3 (3) | 1 (1) | 1 | 2 |
| ark-ui | warpdom-sharedfresh | 5/5 | 97.1 s | 2.11x | 2.06-2.13x (95% CI) | 930 (931) | 139 (139) | 0 | 4659 |
| ark-ui | warpdom-sharedreset | 5/5 | 64.0 s | 3.21x | 3.15-3.30x (95% CI) | 757 (758) | 120 (120) | 5 | 3789 |
| ark-ui | warpdom-learned (cli) | 5/5 | 140.0 s | 1.47x | 1.10-1.50x (95% CI) | 2 (3) | 1 (1) | 1 | 3 |
| ark-ui | happydom-shared | 5/5 | 196.6 s | 1.02x | 1.01-1.05x (95% CI) | 882 (885) | 135 (138) | 32 | 4378 |
| emoji-picker-element | jsdom-default | 5/5 | 30.6 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| emoji-picker-element | jsdom-shared | 5/5 | 11.8 s | 2.58x | 2.54-2.62x (95% CI) | 60 (60) | 15 (15) | 0 | 300 |
| emoji-picker-element | jsdom-vm | 5/5 | 10.7 s | 2.85x | 2.78-2.90x (95% CI) | 140 (140) | 27 (27) | 0 | 700 |
| emoji-picker-element | warpdom-default | 5/5 | 24.6 s | 1.23x | 1.20-1.26x (95% CI) | 0 (0) | 0 (0) | — | — |
| emoji-picker-element | warpdom-vm | 5/5 | 21.9 s | 1.38x | 1.38-1.42x (95% CI) | 3 (3) | 2 (2) | 0 | 15 |
| emoji-picker-element | warpdom-sharedfresh | 5/5 | 29.1 s | 1.04x | 1.03-1.06x (95% CI) | 34 (34) | 12 (12) | 0 | 170 |
| emoji-picker-element | warpdom-sharedreset | 5/5 | 28.3 s | 1.08x | 1.06-1.08x (95% CI) | 34 (34) | 12 (12) | 0 | 170 |
| emoji-picker-element | warpdom-learned (cli) | 5/5 | 24.7 s | 1.22x | 1.21-1.25x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| emoji-picker-element | happydom-shared | 5/5 | 38.2 s | 0.80x | 0.79-0.80x (95% CI) | 52 (52) | 14 (14) | 0 | 260 |
| floating-ui | jsdom-default | 5/5 | 24.6 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| floating-ui | jsdom-shared | 5/5 | 13.6 s | 1.81x | 1.80-1.82x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | jsdom-vm | 5/5 | 15.8 s | 1.56x | 1.55-1.57x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | warpdom-default | 5/5 | 16.0 s | 1.54x | 1.54-1.58x (95% CI) | 0 (0) | 0 (0) | — | — |
| floating-ui | warpdom-vm | 5/5 | 607.6 s | 0.04x | 0.04-0.04x (95% CI) | 165 (165) | 0 (0) | 0 | 810 |
| floating-ui | warpdom-sharedfresh | 5/5 | 607.8 s | 0.04x | 0.04-0.04x (95% CI) | 165 (165) | 0 (0) | 0 | 810 |
| floating-ui | warpdom-sharedreset | 5/5 | 607.9 s | 0.04x | 0.04-0.04x (95% CI) | 165 (165) | 0 (0) | 0 | 810 |
| floating-ui | warpdom-learned (harness) | 5/5 | 15.7 s | 1.56x | 1.54-1.58x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | happydom-shared | 5/5 | 9.4 s | 2.62x | 2.60-2.67x (95% CI) | 137 (137) | 17 (17) | 5 | 655 |
| material-ui | jsdom-default | 5/5 | 273.8 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| material-ui | jsdom-shared | 5/5 | 63.1 s | 4.34x | 4.24-4.42x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-vm | 5/5 | 84.7 s | 3.24x | 3.19-3.30x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-default | 5/5 | 146.5 s | 1.87x | 1.85-1.88x (95% CI) | 0 (0) | 0 (0) | — | — |
| material-ui | warpdom-vm | 5/5 | 64.0 s | 4.31x | 4.15-4.40x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-sharedfresh | 5/5 | 39.4 s | 7.00x | 6.82-7.24x (95% CI) | 1443 (1447) | 125 (125) | 0 | 7219 |
| material-ui | warpdom-sharedreset | 5/5 | 40.2 s | 6.86x | 6.43-7.09x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-learned (cli) | 5/5 | 39.8 s | 6.90x | 6.64-7.04x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | happydom-shared | 5/5 | 60.3 s | 4.57x | 4.42-4.59x (95% CI) | 1042 (1042) | 55 (55) | 3690 | 990 |
| radix-primitives | jsdom-default | 5/5 | 45.8 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| radix-primitives | jsdom-shared | 5/5 | 13.4 s | 3.42x | 3.34-3.81x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | jsdom-vm | 5/5 | 18.6 s | 2.46x | 2.42-2.64x (95% CI) | 1 (1) | 1 (1) | 0 | 5 |
| radix-primitives | warpdom-default | 5/5 | 24.3 s | 1.89x | 1.88-2.00x (95% CI) | 0 (0) | 0 (0) | — | — |
| radix-primitives | warpdom-vm | 5/5 | 15.5 s | 2.94x | 2.74-3.16x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-sharedfresh | 5/5 | 48.0 s | 0.98x | 0.95-1.01x (95% CI) | 605 (605) | 40 (40) | 0 | 2991 |
| radix-primitives | warpdom-sharedreset | 5/5 | 11.3 s | 4.25x | 3.91-4.27x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-learned (cli) | 5/5 | 9.6 s | 5.04x | 4.71-5.15x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | happydom-shared | 5/5 | 9.9 s | 4.65x | 4.62-4.82x (95% CI) | 18 (18) | 5 (5) | 0 | 90 |
| solid | jsdom-default | 5/5 | 2.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid | jsdom-shared | 5/5 | 2.0 s | 1.00x | 0.95-1.05x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-vm | 5/5 | 2.2 s | 0.91x | 0.83-0.91x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | warpdom-default | 5/5 | 1.9 s | 1.05x | 1.00-1.05x (95% CI) | 1 (1) | 1 (1) | — | — |
| solid | warpdom-vm | 5/5 | 61.2 s | 0.03x | 0.03-0.03x (95% CI) | 268 (268) | 14 (14) | 0 | 1336 |
| solid | warpdom-sharedfresh | 5/5 | 1.9 s | 1.05x | 1.00-1.05x (95% CI) | 1 (1) | 1 (1) | 2 | 1 |
| solid | warpdom-sharedreset | 5/5 | 1.9 s | 1.00x | 1.00-1.05x (95% CI) | 0 (1) | 0 (1) | 2 | 0 |
| solid | warpdom-learned (harness) | 5/5 | 2.0 s | 1.00x | 0.73-1.05x (95% CI) | 0 (0) | 0 (0) | 4 | 0 |
| solid | happydom-shared | 5/5 | 1.8 s | 1.11x | 1.06-1.12x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-default | 5/5 | 89.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| svelte | jsdom-shared | 5/5 | 88.9 s | 1.01x | 1.00-1.03x (95% CI) | 0 (4) | 0 (1) | 0 | 4 |
| svelte | jsdom-vm | 5/5 | 85.3 s | 1.05x | 1.03-1.08x (95% CI) | 30 (30) | 3 (3) | 0 | 150 |
| svelte | warpdom-default | 5/5 | 85.9 s | 1.07x | 1.00-1.08x (95% CI) | 1 (1) | 1 (1) | — | — |
| svelte | warpdom-vm | 5/5 | 83.2 s | 1.11x | 1.04-1.13x (95% CI) | 29 (29) | 2 (2) | 5 | 145 |
| svelte | warpdom-sharedfresh | 5/5 | 82.6 s | 1.09x | 1.02-1.10x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| svelte | warpdom-sharedreset | 5/5 | 85.0 s | 1.06x | 1.04-1.08x (95% CI) | 5 (5) | 2 (2) | 0 | 20 |
| svelte | warpdom-learned (cli) | 5/5 | 88.0 s | 1.03x | 1.00-1.04x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| svelte | happydom-shared | 5/5 | 86.7 s | 1.06x | 1.01-1.08x (95% CI) | 290 (290) | 5 (5) | 0 | 1450 |
| vuetify | jsdom-default | 5/5 | 41.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| vuetify | jsdom-shared | 5/5 | 37.3 s | 1.10x | 1.09-5.19x (95% CI) | 23 (29) | 2 (2) | 0 | 98 |
| vuetify | jsdom-vm | 5/5 | 10.7 s | 3.85x | 3.79-3.98x (95% CI) | 879 (879) | 65 (65) | 0 | 4395 |
| vuetify | warpdom-default | 5/5 | 28.2 s | 1.47x | 1.45-1.51x (95% CI) | 0 (0) | 0 (0) | — | — |
| vuetify | warpdom-vm | 5/5 | 13.3 s | 3.07x | 2.97-3.11x (95% CI) | 2 (2) | 1 (1) | 0 | 10 |
| vuetify | warpdom-sharedfresh | 5/5 | 7.1 s | 5.86x | 5.54-5.92x (95% CI) | 63 (63) | 15 (15) | 0 | 315 |
| vuetify | warpdom-sharedreset | 5/5 | 7.0 s | 5.90x | 5.83-6.00x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | warpdom-learned (cli) | 5/5 | 7.1 s | 5.77x | 5.74-5.92x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | happydom-shared | 5/5 | 30.4 s | 1.36x | 1.17-6.95x (95% CI) | 9 (10) | 4 (4) | 0 | 41 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared and jsdom-vm whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-default | jsdom-default | 350.2 s | 297.2 s | 1.18x | 1.18-1.43x (95% CI) | 0 | 0 |
| analog | jsdom-default | jsdom-default | 33.4 s | 28.5 s | 1.20x | 1.13-1.22x (95% CI) | 0 | 0 |
| ariakit | jsdom-default | jsdom-default | 528.7 s | 406.6 s | 1.30x | 1.29-1.31x (range) | 7 | 0 |
| ark-ui | jsdom-default | jsdom-default | 204.9 s | 140.0 s | 1.47x | 1.10-1.50x (95% CI) | 3 | 1 |
| emoji-picker-element | jsdom-default | jsdom-default | 30.6 s | 24.7 s | 1.22x | 1.21-1.25x (95% CI) | 0 | 0 |
| floating-ui | jsdom-vm, jsdom-default | jsdom-vm | 15.8 s | 15.7 s | 1.01x | 0.99-1.02x (95% CI) | 0 | 0 |
| material-ui | jsdom-shared, jsdom-vm, jsdom-default | jsdom-shared | 63.1 s | 39.8 s | 1.58x | 1.52-1.65x (95% CI) | 0 | 0 |
| radix-primitives | jsdom-shared, jsdom-default | jsdom-shared | 13.4 s | 9.6 s | 1.48x | 1.32-1.51x (95% CI) | 0 | 0 |
| solid | jsdom-default, jsdom-shared, jsdom-vm | jsdom-default | 2.0 s | 2.0 s | 1.00x | 0.73-1.05x (95% CI) | 0 | 4 |
| svelte | jsdom-default | jsdom-default | 89.0 s | 88.0 s | 1.03x | 1.00-1.04x (95% CI) | 1 | 0 |
| vuetify | jsdom-default | jsdom-default | 41.0 s | 7.1 s | 5.77x | 5.74-5.92x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 11 suites: 1.22x (95% bootstrap interval 1.03-1.48x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** CopilotKit (jsdom-shared, jsdom-vm); analog (jsdom-shared, jsdom-vm); ariakit (jsdom-shared, jsdom-vm); ark-ui (jsdom-shared, jsdom-vm); emoji-picker-element (jsdom-shared, jsdom-vm); svelte (jsdom-shared, jsdom-vm); vuetify (jsdom-shared, jsdom-vm).

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median warpdom-default - median warpdom-learned).

| Suite | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | cli | 6 | 14-19 | 0.85 | packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=isolated;packages_vue=split;packages_web-components=isolated;packages_web-inspector=split 2, packages_a2ui-renderer=split;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=isolated;packages_vue=split;packages_web-components=isolated;packages_web-inspector=isolated 1, packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=split;packages_vue=split;packages_web-components=isolated;packages_web-inspector=isolated 2, packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=split;packages_vue=split;packages_web-components=isolated;packages_web-inspector=split 1 | 0.33 | 283.6 / 219.1 / 234.5 s | 452.1 s | never (learned not faster) | 30 | 30 |
| analog | cli | 6 | 7-7 | 0.50 | apps_analog-app=isolated;apps_trpc-app=isolated;libs_card=isolated;libs_top-bar=isolated;packages_content=isolated;packages_create-analog=isolated;packages_router=isolated;packages_vitest-angular=isolated 6 | 1.00 | 26.8 / 28.7 / 33.2 s | 61.7 s | never (learned not faster) | 0 | 0 |
| ariakit | harness | 4 | 30-31 | 0.89 | isolated 4 | 1.00 | 405.2 / 344.0 / 442.4 s | 785.9 s | never (learned not faster) | 0 | 0 |
| ark-ui | cli | 6 | 12-15 | 0.75 | packages_react=split;packages_solid=split;packages_svelte=isolated;packages_vue=split 6 | 1.00 | 129.6 / 73.8 / 83.9 s | 153.2 s | never (learned not faster) | 113 | 173 |
| emoji-picker-element | cli | 6 | 0-0 | 1.00 | isolated 4, split 2 | 0.67 | 24.8 / 25.1 / 24.9 s | 50.0 s | never (learned not faster) | 0 | 0 |
| floating-ui | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 15.9 / 608.0 / 607.9 s | 1215.8 s | 4052.8 | 0 | 0 |
| material-ui | cli | 6 | 0-0 | 1.00 | packages_mui-lab=split;packages_mui-material=split;packages_mui-system=split;packages_mui-utils=split 6 | 1.00 | 146.4 / 39.5 / 38.6 s | 78.1 s | 0.7 | 0 | 0 |
| radix-primitives | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 24.6 / 9.1 / 8.9 s | 18.0 s | 1.2 | 0 | 0 |
| solid | harness | 6 | 0-0 | 1.00 | split 3, isolated 3 | 0.50 | 1.9 / 1.9 / 1.9 s | 3.8 s | never (learned not faster) | 1 | 1 |
| svelte | cli | 6 | 0-1 | 0.67 | isolated 3, split 3 | 0.50 | 84.3 / 87.1 / 84.7 s | 171.8 s | never (learned not faster) | 0 | 0 |
| vuetify | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 28.1 / 7.1 / 7.0 s | 14.2 s | 0.7 | 0 | 0 |
