## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-default | 4/4 | 292.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| CopilotKit | jsdom-shared | 4/4 | 201.3 s | 1.48x | 1.40-1.56x (range) | 1627 (1652) | 184 (188) | 0 | 6482 |
| CopilotKit | jsdom-vm | 4/4 | 117.8 s | 2.51x | 2.37-2.67x (range) | 2240 (2240) | 212 (212) | 0 | 8960 |
| CopilotKit | jsdom-sharedclean | 4/4 | 192.4 s | 1.52x | 1.46-1.66x (range) | 1644.5 (1664) | 160.5 (162) | 0 | 6419 |
| CopilotKit | jsdom-learned (harness) | 4/4 | 286.8 s | 1.02x | 0.97-1.10x (range) | 0 (0) | 0 (0) | 0 | 0 |
| CopilotKit | warpdom-default | 4/4 | 232.1 s | 1.23x | 1.20-1.39x (range) | 0 (0) | 0 (0) | — | — |
| CopilotKit | warpdom-vm | 4/4 | 170.3 s | 1.68x | 1.66-1.90x (range) | 2234 (2234) | 207 (207) | 0 | 8936 |
| CopilotKit | warpdom-sharedfresh | 4/4 | 259.2 s | 1.13x | 1.12-1.20x (range) | 2157.5 (2175) | 241 (243) | 0 | 8640 |
| CopilotKit | warpdom-sharedreset | 4/4 | 229.1 s | 1.29x | 1.24-1.31x (range) | 1278 (1418) | 173 (194) | 0 | 5213 |
| CopilotKit | warpdom-learned (cli) | 4/4 | 241.8 s | 1.25x | 1.17-1.26x (range) | 0 (0) | 0 (0) | 0 | 0 |
| CopilotKit | happydom-shared | 4/4 | 9.4 s | 31.56x | 30.26-34.23x (range) | 4681 (4681) | 114 (114) | 0 | 18720 |
| analog | jsdom-default | 5/5 | 25.1 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| analog | jsdom-shared | 5/5 | 22.2 s | 1.11x | 1.07-1.17x (95% CI) | 74 (74) | 7 (7) | 0 | 370 |
| analog | jsdom-vm | 5/5 | 22.9 s | 1.12x | 1.01-1.16x (95% CI) | 5 (5) | 1 (1) | 0 | 25 |
| analog | jsdom-sharedclean | 5/5 | 22.0 s | 1.14x | 1.06-1.18x (95% CI) | 98 (98) | 7 (7) | 0 | 466 |
| analog | jsdom-learned (harness) | 5/5 | 25.3 s | 1.01x | 0.97-1.04x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | warpdom-default | 5/5 | 20.2 s | 1.24x | 1.22-1.27x (95% CI) | 0 (0) | 0 (0) | — | — |
| analog | warpdom-vm | 5/5 | 19.4 s | 1.31x | 1.27-1.35x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | warpdom-sharedfresh | 5/5 | 18.7 s | 1.34x | 1.32-1.38x (95% CI) | 98 (98) | 7 (7) | 0 | 466 |
| analog | warpdom-sharedreset | 5/5 | 16.8 s | 1.50x | 1.47-1.53x (95% CI) | 80 (104) | 7 (7) | 0 | 424 |
| analog | warpdom-learned (cli) | 5/5 | 20.4 s | 1.23x | 1.21-1.26x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | happydom-shared | 5/5 | 19.6 s | 1.28x | 1.26-1.29x (95% CI) | 100 (100) | 7 (7) | 0 | 500 |
| ariakit | jsdom-default | 1/1 | 446.9 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| ariakit | jsdom-shared | 1/1 | 340.9 s | 1.31x | 1.31-1.31x (range) | 14 (14) | 4 (4) | 0 | 14 |
| ariakit | jsdom-vm | 1/1 | 357.3 s | 1.25x | 1.25-1.25x (range) | 6 (6) | 1 (1) | 4 | 2 |
| ariakit | jsdom-sharedclean | 1/1 | 335.5 s | 1.33x | 1.33-1.33x (range) | 7 (7) | 2 (2) | 0 | 7 |
| ariakit | jsdom-learned (harness) | 1/1 | 449.3 s | 0.99x | 0.99-0.99x (range) | 0 (0) | 0 (0) | 0 | 0 |
| ariakit | warpdom-default | 1/1 | 364.5 s | 1.23x | 1.23-1.23x (range) | 7 (7) | 2 (2) | — | — |
| ariakit | warpdom-vm | 1/1 | 338.8 s | 1.32x | 1.32-1.32x (range) | 7 (7) | 2 (2) | 0 | 0 |
| ariakit | warpdom-sharedfresh | 1/1 | 139.6 s | 3.20x | 3.20-3.20x (range) | 1105 (1105) | 192 (192) | 0 | 1098 |
| ariakit | warpdom-sharedreset | 1/1 | 316.7 s | 1.41x | 1.41-1.41x (range) | 122 (122) | 33 (33) | 0 | 115 |
| ariakit | warpdom-learned (harness) | 1/1 | 365.0 s | 1.22x | 1.22-1.22x (range) | 7 (7) | 2 (2) | 0 | 0 |
| ariakit | happydom-shared | 1/1 | 99.6 s | 4.49x | 4.49-4.49x (range) | 61 (61) | 22 (22) | 41 | 20 |
| ark-ui | jsdom-default | 5/5 | 212.6 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| ark-ui | jsdom-shared | 5/5 | 202.5 s | 1.06x | 0.98-1.12x (95% CI) | 842 (847) | 131 (133) | 0 | 4213 |
| ark-ui | jsdom-vm | 5/5 | 74.1 s | 2.89x | 2.84-2.91x (95% CI) | 2 (2) | 1 (1) | 6 | 2 |
| ark-ui | jsdom-sharedclean | 5/5 | 67.6 s | 3.15x | 3.13-3.24x (95% CI) | 11 (12) | 3 (4) | 4 | 50 |
| ark-ui | jsdom-learned (harness) | 5/5 | 213.0 s | 1.00x | 0.99-1.02x (95% CI) | 1 (2) | 0 (1) | 4 | 2 |
| ark-ui | warpdom-default | 5/5 | 135.4 s | 1.58x | 1.56-1.60x (95% CI) | 2 (4) | 1 (1) | — | — |
| ark-ui | warpdom-vm | 5/5 | 65.2 s | 3.29x | 3.24-3.32x (95% CI) | 2 (4) | 1 (1) | 3 | 2 |
| ark-ui | warpdom-sharedfresh | 5/5 | 101.5 s | 2.11x | 2.09-2.15x (95% CI) | 930 (932) | 139 (140) | 0 | 4658 |
| ark-ui | warpdom-sharedreset | 5/5 | 65.0 s | 3.29x | 3.20-3.34x (95% CI) | 757 (758) | 120 (121) | 3 | 3788 |
| ark-ui | warpdom-learned (cli) | 5/5 | 135.2 s | 1.58x | 1.55-1.60x (95% CI) | 2 (3) | 1 (1) | 1 | 2 |
| ark-ui | happydom-shared | 5/5 | 124.3 s | 1.74x | 1.57-1.93x (95% CI) | 918 (920) | 142 (144) | 138 | 4443 |
| emoji-picker-element | jsdom-default | 5/5 | 30.3 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| emoji-picker-element | jsdom-shared | 5/5 | 11.9 s | 2.57x | 2.54-2.57x (95% CI) | 60 (60) | 15 (15) | 0 | 300 |
| emoji-picker-element | jsdom-vm | 5/5 | 10.8 s | 2.83x | 2.79-2.86x (95% CI) | 140 (140) | 27 (27) | 0 | 700 |
| emoji-picker-element | jsdom-sharedclean | 5/5 | 8.8 s | 3.44x | 2.58-3.50x (95% CI) | 59 (60) | 15 (15) | 0 | 296 |
| emoji-picker-element | jsdom-learned (harness) | 5/5 | 28.6 s | 1.06x | 1.03-1.12x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| emoji-picker-element | warpdom-default | 5/5 | 24.9 s | 1.22x | 1.20-1.24x (95% CI) | 0 (0) | 0 (0) | — | — |
| emoji-picker-element | warpdom-vm | 5/5 | 21.7 s | 1.40x | 1.39-1.42x (95% CI) | 3 (3) | 2 (2) | 0 | 15 |
| emoji-picker-element | warpdom-sharedfresh | 5/5 | 29.2 s | 1.03x | 1.01-1.06x (95% CI) | 34 (34) | 12 (12) | 0 | 170 |
| emoji-picker-element | warpdom-sharedreset | 5/5 | 28.2 s | 1.07x | 1.07-1.08x (95% CI) | 34 (34) | 12 (12) | 0 | 170 |
| emoji-picker-element | warpdom-learned (cli) | 5/5 | 24.7 s | 1.22x | 1.21-1.25x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| emoji-picker-element | happydom-shared | 5/5 | 38.1 s | 0.80x | 0.79-0.81x (95% CI) | 52 (52) | 14 (14) | 0 | 260 |
| floating-ui | jsdom-default | 5/5 | 24.6 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| floating-ui | jsdom-shared | 5/5 | 13.6 s | 1.80x | 1.72-1.84x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | jsdom-vm | 5/5 | 15.6 s | 1.56x | 1.53-1.58x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | jsdom-sharedclean | 5/5 | 13.4 s | 1.83x | 1.77-1.84x (95% CI) | 120 (120) | 15 (15) | 0 | 600 |
| floating-ui | jsdom-learned (harness) | 5/5 | 24.3 s | 1.00x | 0.98-1.02x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | warpdom-default | 5/5 | 15.9 s | 1.53x | 1.45-1.57x (95% CI) | 0 (0) | 0 (0) | — | — |
| floating-ui | warpdom-vm | 5/5 | 11.4 s | 2.15x | 2.06-2.19x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | warpdom-sharedfresh | 5/5 | 8.3 s | 2.96x | 2.81-3.00x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | warpdom-sharedreset | 5/5 | 8.4 s | 2.91x | 2.80-2.96x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | warpdom-learned (harness) | 5/5 | 15.8 s | 1.52x | 1.49-1.56x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | happydom-shared | 5/5 | 9.7 s | 2.54x | 2.49-2.61x (95% CI) | 137 (137) | 17 (17) | 5 | 655 |
| material-ui | jsdom-default | 5/5 | 269.9 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| material-ui | jsdom-shared | 5/5 | 60.7 s | 4.45x | 4.42-4.49x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-vm | 5/5 | 81.3 s | 3.33x | 3.30-3.33x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-sharedclean | 5/5 | 60.9 s | 4.43x | 4.40-4.46x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-learned (harness) | 5/5 | 60.6 s | 4.43x | 4.41-4.49x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-default | 5/5 | 143.2 s | 1.88x | 1.88-1.89x (95% CI) | 0 (0) | 0 (0) | — | — |
| material-ui | warpdom-vm | 5/5 | 62.4 s | 4.34x | 4.31-4.35x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-sharedfresh | 5/5 | 37.6 s | 7.16x | 7.11-7.27x (95% CI) | 1443 (1448) | 125 (126) | 0 | 7220 |
| material-ui | warpdom-sharedreset | 5/5 | 37.9 s | 7.09x | 7.05-7.20x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-learned (cli) | 5/5 | 37.4 s | 7.22x | 7.13-7.25x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | happydom-shared | 5/5 | 57.6 s | 4.68x | 4.66-4.71x (95% CI) | 1042 (1042) | 55 (55) | 3690 | 990 |
| radix-primitives | jsdom-default | 5/5 | 36.1 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| radix-primitives | jsdom-shared | 5/5 | 11.3 s | 3.24x | 3.18-3.28x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | jsdom-vm | 5/5 | 15.1 s | 2.38x | 2.35-2.42x (95% CI) | 1 (1) | 1 (1) | 0 | 5 |
| radix-primitives | jsdom-sharedclean | 5/5 | 11.0 s | 3.30x | 3.20-3.40x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | jsdom-learned (harness) | 5/5 | 11.1 s | 3.24x | 3.20-3.28x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-default | 5/5 | 19.6 s | 1.85x | 1.82-1.86x (95% CI) | 0 (0) | 0 (0) | — | — |
| radix-primitives | warpdom-vm | 5/5 | 12.7 s | 2.86x | 2.81-2.87x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-sharedfresh | 5/5 | 46.6 s | 0.77x | 0.77-0.80x (95% CI) | 605 (605) | 40 (40) | 0 | 3025 |
| radix-primitives | warpdom-sharedreset | 5/5 | 9.5 s | 3.82x | 3.75-3.86x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-learned (cli) | 5/5 | 7.4 s | 4.86x | 4.81-4.91x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | happydom-shared | 5/5 | 8.0 s | 4.50x | 4.47-4.51x (95% CI) | 18 (18) | 5 (5) | 0 | 90 |
| solid | jsdom-default | 5/5 | 2.6 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid | jsdom-shared | 5/5 | 2.6 s | 1.00x | 1.00-1.00x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-vm | 5/5 | 3.0 s | 0.87x | 0.87-0.90x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-sharedclean | 5/5 | 2.6 s | 1.00x | 1.00-1.04x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-learned (harness) | 5/5 | 2.6 s | 1.00x | 1.00-1.00x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | warpdom-default | 5/5 | 2.5 s | 1.04x | 1.00-1.04x (95% CI) | 1 (1) | 1 (1) | — | — |
| solid | warpdom-vm | 5/5 | 61.6 s | 0.04x | 0.04-0.04x (95% CI) | 268 (268) | 14 (14) | 0 | 1335 |
| solid | warpdom-sharedfresh | 5/5 | 2.6 s | 1.00x | 1.00-1.04x (95% CI) | 1 (1) | 1 (1) | 1 | 0 |
| solid | warpdom-sharedreset | 5/5 | 2.5 s | 1.04x | 1.00-1.08x (95% CI) | 1 (1) | 1 (1) | 1 | 0 |
| solid | warpdom-learned (harness) | 5/5 | 2.5 s | 1.04x | 1.04-1.04x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| solid | happydom-shared | 5/5 | 2.4 s | 1.08x | 1.08-1.13x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-default | 5/5 | 91.1 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| svelte | jsdom-shared | 5/5 | 90.1 s | 1.01x | 1.01-1.03x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-vm | 5/5 | 85.8 s | 1.06x | 1.05-1.09x (95% CI) | 30 (30) | 3 (3) | 0 | 150 |
| svelte | jsdom-sharedclean | 5/5 | 89.7 s | 1.02x | 1.00-1.04x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-learned (harness) | 5/5 | 91.0 s | 1.00x | 0.99-1.01x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | warpdom-default | 5/5 | 84.7 s | 1.07x | 1.07-1.09x (95% CI) | 1 (1) | 1 (1) | — | — |
| svelte | warpdom-vm | 5/5 | 81.4 s | 1.12x | 1.10-1.14x (95% CI) | 29 (29) | 2 (2) | 5 | 145 |
| svelte | warpdom-sharedfresh | 5/5 | 83.0 s | 1.10x | 1.07-1.11x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| svelte | warpdom-sharedreset | 5/5 | 84.1 s | 1.08x | 1.07-1.10x (95% CI) | 5 (5) | 2 (2) | 0 | 20 |
| svelte | warpdom-learned (cli) | 5/5 | 86.6 s | 1.05x | 1.03-1.07x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| svelte | happydom-shared | 5/5 | 84.2 s | 1.08x | 1.07-1.11x (95% CI) | 290 (290) | 5 (5) | 0 | 1450 |
| vuetify | jsdom-default | 5/5 | 30.7 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| vuetify | jsdom-shared | 5/5 | 30.1 s | 1.02x | 0.85-4.95x (95% CI) | 23 (29) | 1 (2) | 0 | 85 |
| vuetify | jsdom-vm | 5/5 | 8.3 s | 3.72x | 3.53-3.77x (95% CI) | 879 (879) | 65 (65) | 0 | 4395 |
| vuetify | jsdom-sharedclean | 5/5 | 6.3 s | 4.87x | 4.75-4.92x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | jsdom-learned (harness) | 5/5 | 8.1 s | 3.80x | 3.70-4.01x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | warpdom-default | 5/5 | 20.9 s | 1.46x | 1.44-1.51x (95% CI) | 0 (0) | 0 (0) | — | — |
| vuetify | warpdom-vm | 5/5 | 10.4 s | 2.92x | 2.82-3.03x (95% CI) | 2 (2) | 1 (1) | 0 | 10 |
| vuetify | warpdom-sharedfresh | 5/5 | 5.6 s | 5.52x | 5.24-5.78x (95% CI) | 63 (63) | 15 (15) | 0 | 315 |
| vuetify | warpdom-sharedreset | 5/5 | 5.2 s | 5.87x | 5.38-5.94x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | warpdom-learned (cli) | 5/5 | 5.5 s | 5.63x | 5.52-5.69x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | happydom-shared | 5/5 | 29.0 s | 1.06x | 0.91-6.64x (95% CI) | 9 (10) | 4 (4) | 0 | 41 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared, jsdom-vm, jsdom-sharedclean (those that ran) whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-default | jsdom-default | 292.0 s | 241.8 s | 1.25x | 1.17-1.26x (range) | 0 | 0 |
| analog | jsdom-default | jsdom-default | 25.1 s | 20.4 s | 1.23x | 1.21-1.26x (95% CI) | 0 | 0 |
| ariakit | jsdom-default | jsdom-default | 446.9 s | 365.0 s | 1.22x | 1.22-1.22x (range) | 7 | 0 |
| ark-ui | jsdom-vm, jsdom-default | jsdom-vm | 74.1 s | 135.2 s | 0.55x | 0.54-0.55x (95% CI) | 3 | 1 |
| emoji-picker-element | jsdom-default | jsdom-default | 30.3 s | 24.7 s | 1.22x | 1.21-1.25x (95% CI) | 0 | 0 |
| floating-ui | jsdom-vm, jsdom-default | jsdom-vm | 15.6 s | 15.8 s | 0.98x | 0.96-1.02x (95% CI) | 0 | 0 |
| material-ui | jsdom-shared, jsdom-sharedclean, jsdom-vm, jsdom-default | jsdom-shared | 60.7 s | 37.4 s | 1.62x | 1.61-1.64x (95% CI) | 0 | 0 |
| radix-primitives | jsdom-sharedclean, jsdom-shared, jsdom-default | jsdom-sharedclean | 11.0 s | 7.4 s | 1.49x | 1.43-1.51x (95% CI) | 0 | 0 |
| solid | jsdom-default, jsdom-shared, jsdom-sharedclean, jsdom-vm | jsdom-default | 2.6 s | 2.5 s | 1.04x | 1.04-1.04x (95% CI) | 1 | 0 |
| svelte | jsdom-sharedclean, jsdom-shared, jsdom-default | jsdom-sharedclean | 89.7 s | 86.6 s | 1.02x | 1.02-1.05x (95% CI) | 1 | 0 |
| vuetify | jsdom-sharedclean, jsdom-default | jsdom-sharedclean | 6.3 s | 5.5 s | 1.17x | 1.13-1.19x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 11 suites: 1.22x (95% bootstrap interval 1.02-1.25x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** CopilotKit (jsdom-shared, jsdom-vm, jsdom-sharedclean); analog (jsdom-shared, jsdom-vm, jsdom-sharedclean); ariakit (jsdom-shared, jsdom-vm, jsdom-sharedclean); emoji-picker-element (jsdom-shared, jsdom-vm, jsdom-sharedclean).

## Policy and DOM

jsdom-learned: learned isolation's policy (the harness emulation) on jsdom, without any reset between files. Speedups: median of per-round ratios. Differing tests: max over rounds against jsdom-default; false passes: sum over rounds (G2 violations).

| Suite | jsdom-learned | over jsdom-default | interval | tests differ (max) | false passes | warpdom-learned over jsdom-learned | interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 286.8 s | 1.02x | 0.97-1.10x (range) | 0 | 0 | 1.20x | 1.13-1.28x (range) |
| analog | 25.3 s | 1.01x | 0.97-1.04x (95% CI) | 0 | 0 | 1.22x | 1.20-1.25x (95% CI) |
| ariakit | 449.3 s | 0.99x | 0.99-0.99x (range) | 0 | 0 | 1.23x | 1.23-1.23x (range) |
| ark-ui | 213.0 s | 1.00x | 0.99-1.02x (95% CI) | 2 | 4 | 1.58x | 1.55-1.60x (95% CI) |
| emoji-picker-element | 28.6 s | 1.06x | 1.03-1.12x (95% CI) | 0 | 0 | 1.16x | 1.10-1.19x (95% CI) |
| floating-ui | 24.3 s | 1.00x | 0.98-1.02x (95% CI) | 0 | 0 | 1.51x | 1.49-1.58x (95% CI) |
| material-ui | 60.6 s | 4.43x | 4.41-4.49x (95% CI) | 0 | 0 | 1.62x | 1.60-1.64x (95% CI) |
| radix-primitives | 11.1 s | 3.24x | 3.20-3.28x (95% CI) | 0 | 0 | 1.50x | 1.47-1.51x (95% CI) |
| solid | 2.6 s | 1.00x | 1.00-1.00x (95% CI) | 0 | 0 | 1.04x | 1.04-1.04x (95% CI) |
| svelte | 91.0 s | 1.00x | 0.99-1.01x (95% CI) | 0 | 0 | 1.05x | 1.03-1.06x (95% CI) |
| vuetify | 8.1 s | 3.80x | 3.70-4.01x (95% CI) | 0 | 0 | 1.48x | 1.38-1.54x (95% CI) |

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median isolated run - median learned run), the isolated run being the same DOM's default (warpdom-default, or jsdom-default for jsdom-learned).

| Suite | configuration | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-learned | harness | 5 | 183-187 | 0.93 | isolated 4, split 1 | 0.80 | 288.0 / 200.4 / 212.7 s | 411.5 s | 79.1 | 0 | 0 |
| CopilotKit | warpdom-learned | cli | 5 | 21-67 | 0.58 | packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=isolated;packages_vue=isolated;packages_web-components=isolated;packages_web-inspector=isolated 1, packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=isolated;packages_vue=split;packages_web-components=isolated;packages_web-inspector=isolated 2, packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=split;packages_vue=isolated;packages_web-components=isolated;packages_web-inspector=isolated 1, packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=isolated;packages_vue=isolated;packages_web-components=isolated;packages_web-inspector=split 1 | 0.40 | 239.3 / 246.2 / 212.3 s | 458.5 s | never (learned not faster) | 0 | 0 |
| analog | jsdom-learned | harness | 6 | 7-7 | 0.85 | isolated 6 | 1.00 | 24.4 / 21.6 / 34.9 s | 56.5 s | never (learned not faster) | 0 | 0 |
| analog | warpdom-learned | cli | 6 | 7-7 | 0.50 | apps_analog-app=isolated;apps_trpc-app=isolated;libs_card=isolated;libs_top-bar=isolated;packages_content=isolated;packages_create-analog=isolated;packages_router=isolated;packages_vitest-angular=isolated 5, apps_analog-app=isolated;apps_trpc-app=isolated;libs_card=isolated;libs_top-bar=isolated;packages_content=isolated;packages_create-analog=isolated;packages_router=split;packages_vitest-angular=isolated 1 | 0.83 | 20.9 / 20.9 / 24.4 s | 45.1 s | never (learned not faster) | 0 | 0 |
| ariakit | jsdom-learned | harness | 2 | 2-3 | 0.67 | isolated 2 | 1.00 | 456.4 / 346.4 / — s | — | — | 0 | 0 |
| ariakit | warpdom-learned | harness | 2 | 30-31 | 0.91 | isolated 2 | 1.00 | 368.9 / 329.0 / 469.7 s | 798.6 s | never (learned not faster) | 0 | 0 |
| ark-ui | jsdom-learned | harness | 6 | 128-133 | 0.95 | isolated 6 | 1.00 | 212.3 / 196.5 / 215.7 s | 412.4 s | never (learned not faster) | 0 | 0 |
| ark-ui | warpdom-learned | cli | 6 | 84-126 | 0.83 | packages_react=isolated;packages_solid=isolated;packages_svelte=isolated;packages_vue=isolated 2, packages_react=split;packages_solid=isolated;packages_svelte=isolated;packages_vue=isolated 4 | 0.67 | 136.6 / 123.7 / 139.1 s | 262.8 s | 1314.2 | 0 | 0 |
| emoji-picker-element | jsdom-learned | harness | 6 | 15-15 | 1.00 | split 6 | 1.00 | 30.6 / 11.8 / 27.3 s | 39.1 s | 23.0 | 0 | 0 |
| emoji-picker-element | warpdom-learned | cli | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 24.6 / 24.9 / 25.0 s | 49.7 s | 248.7 | 0 | 0 |
| floating-ui | jsdom-learned | harness | 6 | 15-15 | 1.00 | isolated 6 | 1.00 | 24.4 / 13.5 / 26.9 s | 40.5 s | 134.8 | 0 | 0 |
| floating-ui | warpdom-learned | harness | 6 | 15-15 | 1.00 | isolated 6 | 1.00 | 16.1 / 8.2 / 17.5 s | 25.7 s | 257.0 | 0 | 0 |
| material-ui | jsdom-learned | harness | 6 | 0-0 | 1.00 | split 6 | 1.00 | 270.0 / 60.8 / 60.8 s | 121.5 s | 0.6 | 0 | 0 |
| material-ui | warpdom-learned | cli | 6 | 0-0 | 1.00 | packages_mui-lab=split;packages_mui-material=split;packages_mui-system=split;packages_mui-utils=split 6 | 1.00 | 143.6 / 37.7 / 37.3 s | 75.0 s | 0.7 | 0 | 0 |
| radix-primitives | jsdom-learned | harness | 6 | 0-0 | 1.00 | split 6 | 1.00 | 36.5 / 11.3 / 11.4 s | 22.6 s | 0.9 | 0 | 0 |
| radix-primitives | warpdom-learned | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 20.0 / 7.6 / 7.6 s | 15.2 s | 1.2 | 0 | 0 |
| solid | jsdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 2.6 / 2.6 / 2.6 s | 5.2 s | never (learned not faster) | 0 | 0 |
| solid | warpdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 2.5 / 2.5 / 3.4 s | 6.0 s | never (learned not faster) | 0 | 0 |
| svelte | jsdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 91.8 / 89.9 / 93.1 s | 182.6 s | 1826.0 | 0 | 0 |
| svelte | warpdom-learned | cli | 6 | 0-1 | 0.40 | isolated 6 | 1.00 | 84.5 / 85.8 / 84.8 s | 169.9 s | never (learned not faster) | 0 | 0 |
| vuetify | jsdom-learned | harness | 6 | 1-2 | 0.33 | split 5, isolated 1 | 0.83 | 30.5 / 18.4 / 8.0 s | 38.4 s | 1.7 | 0 | 0 |
| vuetify | warpdom-learned | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 21.1 / 5.5 / 5.5 s | 11.0 s | 0.7 | 0 | 0 |
