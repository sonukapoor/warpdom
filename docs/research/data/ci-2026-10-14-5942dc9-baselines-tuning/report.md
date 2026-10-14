## Configurations against jsdom-default

Speedup: median of per-round ratios to the same round's jsdom-default run. Differing tests and files: median (max) over rounds, against that round's jsdom-default. False passes / fails: sums over rounds, against the same DOM's isolated run (warpdom-default, or jsdom-default for jsdom and happy-dom).

| Suite | configuration | rounds | median time | speedup | interval | tests differ | files differ | false passes | false fails |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-default | 2/2 | 454.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| CopilotKit | jsdom-shared | 2/2 | 222.2 s | 2.04x | 2.04-2.05x (range) | 1630 (1711) | 185 (185) | 0 | 3260 |
| CopilotKit | jsdom-vm | 2/2 | 167.3 s | 2.71x | 2.69-2.73x (range) | 2240 (2240) | 212 (212) | 0 | 4480 |
| CopilotKit | jsdom-sharedclean | 2/2 | 211.6 s | 2.15x | 2.12-2.18x (range) | 1665.5 (1678) | 164 (165) | 0 | 3331 |
| CopilotKit | jsdom-learned (harness) | 2/2 | 334.8 s | 1.36x | 1.33-1.39x (range) | 0 (0) | 0 (0) | 0 | 0 |
| CopilotKit | warpdom-default | 2/2 | 364.1 s | 1.25x | 1.24-1.25x (range) | 0 (0) | 0 (0) | — | — |
| CopilotKit | warpdom-vm | 2/2 | 215.8 s | 2.10x | 2.10-2.11x (range) | 2234 (2234) | 207 (207) | 0 | 4468 |
| CopilotKit | warpdom-sharedfresh | 2/2 | 274.2 s | 1.66x | 1.64-1.67x (range) | 2140.5 (2149) | 240 (242) | 0 | 4281 |
| CopilotKit | warpdom-sharedreset | 2/2 | 242.4 s | 1.87x | 1.87-1.88x (range) | 1308 (1315) | 174 (175) | 0 | 2616 |
| CopilotKit | warpdom-learned (cli) | 2/2 | 298.1 s | 1.52x | 1.52-1.53x (range) | 0 (0) | 0 (0) | 0 | 0 |
| CopilotKit | happydom-shared | 1/2 | 14.1 s | 32.30x | 32.30-32.30x (range) | 4681 (4681) | 114 (114) | 0 | 9360 |
| analog | jsdom-default | 5/5 | 20.8 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| analog | jsdom-shared | 5/5 | 18.0 s | 1.16x | 1.12-1.17x (95% CI) | 74 (98) | 7 (7) | 0 | 418 |
| analog | jsdom-vm | 5/5 | 18.1 s | 1.12x | 1.12-1.17x (95% CI) | 5 (5) | 1 (1) | 0 | 25 |
| analog | jsdom-sharedclean | 5/5 | 18.0 s | 1.15x | 1.13-1.18x (95% CI) | 98 (98) | 7 (7) | 0 | 490 |
| analog | jsdom-learned (harness) | 5/5 | 20.5 s | 1.00x | 0.99-1.05x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | warpdom-default | 5/5 | 16.5 s | 1.25x | 1.24-1.27x (95% CI) | 0 (0) | 0 (0) | — | — |
| analog | warpdom-vm | 5/5 | 15.8 s | 1.32x | 1.32-1.32x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | warpdom-sharedfresh | 5/5 | 15.4 s | 1.34x | 1.34-1.38x (95% CI) | 98 (98) | 7 (7) | 0 | 466 |
| analog | warpdom-sharedreset | 5/5 | 13.3 s | 1.56x | 1.54-1.57x (95% CI) | 80 (104) | 7 (7) | 0 | 424 |
| analog | warpdom-learned (cli) | 5/5 | 16.4 s | 1.26x | 1.24-1.28x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| analog | happydom-shared | 5/5 | 15.8 s | 1.29x | 1.28-1.32x (95% CI) | 100 (100) | 7 (7) | 0 | 500 |
| ariakit | jsdom-default | 1/1 | 626.1 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| ariakit | jsdom-shared | 1/1 | 433.9 s | 1.44x | 1.44-1.44x (range) | 5 (5) | 2 (2) | 0 | 5 |
| ariakit | jsdom-vm | 1/1 | 457.9 s | 1.37x | 1.37-1.37x (range) | 6 (6) | 1 (1) | 4 | 2 |
| ariakit | jsdom-sharedclean | 1/1 | 415.0 s | 1.51x | 1.51-1.51x (range) | 17 (17) | 4 (4) | 0 | 17 |
| ariakit | jsdom-learned (harness) | 1/1 | 602.6 s | 1.04x | 1.04-1.04x (range) | 6 (6) | 0 (0) | 0 | 6 |
| ariakit | warpdom-default | 1/1 | 454.3 s | 1.38x | 1.38-1.38x (range) | 7 (7) | 2 (2) | — | — |
| ariakit | warpdom-vm | 1/1 | 418.6 s | 1.50x | 1.50-1.50x (range) | 7 (7) | 2 (2) | 0 | 0 |
| ariakit | warpdom-sharedfresh | 1/1 | 173.2 s | 3.61x | 3.61-3.61x (range) | 1098 (1098) | 191 (191) | 0 | 1091 |
| ariakit | warpdom-sharedreset | 1/1 | 367.4 s | 1.70x | 1.70-1.70x (range) | 127 (127) | 34 (34) | 0 | 120 |
| ariakit | warpdom-learned (harness) | 1/1 | 462.8 s | 1.35x | 1.35-1.35x (range) | 7 (7) | 2 (2) | 0 | 0 |
| ariakit | happydom-shared | 1/1 | 155.6 s | 4.02x | 4.02-4.02x (range) | 59 (59) | 22 (22) | 41 | 18 |
| ark-ui | jsdom-default | 5/5 | 208.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| ark-ui | jsdom-shared | 5/5 | 205.1 s | 1.02x | 0.74-1.09x (95% CI) | 843 (849) | 131 (134) | 0 | 4216 |
| ark-ui | jsdom-vm | 5/5 | 73.0 s | 2.86x | 2.79-2.93x (95% CI) | 2 (3) | 1 (1) | 9 | 0 |
| ark-ui | jsdom-sharedclean | 5/5 | 65.8 s | 3.22x | 3.14-3.25x (95% CI) | 10 (12) | 3 (4) | 7 | 46 |
| ark-ui | jsdom-learned (harness) | 5/5 | 208.5 s | 1.00x | 0.97-1.03x (95% CI) | 2 (3) | 1 (1) | 8 | 1 |
| ark-ui | warpdom-default | 5/5 | 134.4 s | 1.55x | 1.53-1.59x (95% CI) | 1 (2) | 1 (1) | — | — |
| ark-ui | warpdom-vm | 5/5 | 65.3 s | 3.22x | 3.15-3.28x (95% CI) | 1 (2) | 1 (1) | 2 | 2 |
| ark-ui | warpdom-sharedfresh | 5/5 | 99.4 s | 2.09x | 2.09-2.15x (95% CI) | 930 (931) | 139 (140) | 0 | 4657 |
| ark-ui | warpdom-sharedreset | 5/5 | 63.8 s | 3.25x | 3.20-3.36x (95% CI) | 757 (758) | 120 (121) | 4 | 3787 |
| ark-ui | warpdom-learned (cli) | 5/5 | 131.2 s | 1.59x | 1.56-1.61x (95% CI) | 2 (2) | 1 (1) | 4 | 1 |
| ark-ui | happydom-shared | 5/5 | 193.4 s | 1.08x | 1.07-1.09x (95% CI) | 913 (923) | 139 (141) | 93 | 4481 |
| emoji-picker-element | jsdom-default | 5/5 | 37.3 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| emoji-picker-element | jsdom-shared | 5/5 | 13.5 s | 2.77x | 2.73-2.79x (95% CI) | 53 (60) | 15 (15) | 0 | 279 |
| emoji-picker-element | jsdom-vm | 5/5 | 13.0 s | 2.88x | 2.81-2.89x (95% CI) | 140 (140) | 27 (27) | 0 | 700 |
| emoji-picker-element | jsdom-sharedclean | 5/5 | 10.3 s | 3.61x | 2.76-3.70x (95% CI) | 59 (60) | 15 (15) | 0 | 296 |
| emoji-picker-element | jsdom-learned (harness) | 5/5 | 34.7 s | 1.08x | 1.06-1.14x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| emoji-picker-element | warpdom-default | 5/5 | 29.4 s | 1.26x | 1.25-1.28x (95% CI) | 0 (0) | 0 (0) | — | — |
| emoji-picker-element | warpdom-vm | 5/5 | 25.0 s | 1.49x | 1.48-1.53x (95% CI) | 3 (3) | 2 (2) | 0 | 15 |
| emoji-picker-element | warpdom-sharedfresh | 5/5 | 30.6 s | 1.22x | 1.20-1.23x (95% CI) | 34 (34) | 12 (12) | 0 | 170 |
| emoji-picker-element | warpdom-sharedreset | 5/5 | 29.3 s | 1.27x | 1.26-1.29x (95% CI) | 34 (34) | 12 (12) | 0 | 170 |
| emoji-picker-element | warpdom-learned (cli) | 5/5 | 29.3 s | 1.27x | 1.26-1.29x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| emoji-picker-element | happydom-shared | 5/5 | 39.1 s | 0.95x | 0.94-0.96x (95% CI) | 52 (52) | 14 (14) | 0 | 260 |
| floating-ui | jsdom-default | 5/5 | 19.7 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| floating-ui | jsdom-shared | 5/5 | 10.7 s | 1.80x | 1.77-1.86x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | jsdom-vm | 5/5 | 13.0 s | 1.54x | 1.46-1.56x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | jsdom-sharedclean | 5/5 | 10.7 s | 1.86x | 1.71-1.91x (95% CI) | 120 (120) | 15 (15) | 0 | 600 |
| floating-ui | jsdom-learned (harness) | 5/5 | 19.0 s | 1.01x | 0.97-1.05x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | warpdom-default | 5/5 | 12.8 s | 1.55x | 1.45-1.56x (95% CI) | 0 (0) | 0 (0) | — | — |
| floating-ui | warpdom-vm | 5/5 | 9.2 s | 2.22x | 2.03-2.26x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | warpdom-sharedfresh | 5/5 | 6.6 s | 2.98x | 2.80-3.12x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | warpdom-sharedreset | 5/5 | 6.6 s | 2.98x | 2.80-3.07x (95% CI) | 122 (122) | 15 (15) | 0 | 610 |
| floating-ui | warpdom-learned (harness) | 5/5 | 13.2 s | 1.56x | 1.42-1.58x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| floating-ui | happydom-shared | 5/5 | 8.0 s | 2.41x | 0.30-2.59x (95% CI) | 137 (137) | 17 (17) | 5 | 655 |
| material-ui | jsdom-default | 5/5 | 235.0 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| material-ui | jsdom-shared | 5/5 | 54.4 s | 4.34x | 4.15-4.42x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-vm | 5/5 | 71.5 s | 3.31x | 3.22-3.37x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-sharedclean | 5/5 | 54.9 s | 4.33x | 4.18-4.35x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | jsdom-learned (harness) | 5/5 | 54.9 s | 4.27x | 4.21-4.40x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-default | 5/5 | 130.3 s | 1.80x | 1.76-1.84x (95% CI) | 0 (0) | 0 (0) | — | — |
| material-ui | warpdom-vm | 5/5 | 55.6 s | 4.23x | 4.16-4.36x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-sharedfresh | 5/5 | 35.7 s | 6.56x | 6.48-6.77x (95% CI) | 1443 (1443) | 125 (125) | 0 | 7215 |
| material-ui | warpdom-sharedreset | 5/5 | 35.7 s | 6.59x | 6.46-6.70x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | warpdom-learned (cli) | 5/5 | 35.0 s | 6.67x | 6.58-6.92x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| material-ui | happydom-shared | 5/5 | 53.6 s | 4.38x | 4.18-4.43x (95% CI) | 1042 (1042) | 55 (55) | 3690 | 990 |
| radix-primitives | jsdom-default | 5/5 | 40.4 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| radix-primitives | jsdom-shared | 5/5 | 12.5 s | 3.23x | 3.20-3.27x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | jsdom-vm | 5/5 | 17.0 s | 2.38x | 2.34-2.41x (95% CI) | 1 (1) | 1 (1) | 0 | 5 |
| radix-primitives | jsdom-sharedclean | 5/5 | 12.5 s | 3.22x | 3.20-3.23x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | jsdom-learned (harness) | 5/5 | 12.5 s | 3.23x | 3.20-3.26x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-default | 5/5 | 22.2 s | 1.81x | 1.80-1.84x (95% CI) | 0 (0) | 0 (0) | — | — |
| radix-primitives | warpdom-vm | 5/5 | 14.3 s | 2.83x | 2.82-2.85x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-sharedfresh | 5/5 | 46.0 s | 0.88x | 0.87-0.90x (95% CI) | 584 (584) | 40 (40) | 0 | 2920 |
| radix-primitives | warpdom-sharedreset | 5/5 | 10.4 s | 3.88x | 3.85-3.95x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | warpdom-learned (cli) | 5/5 | 8.6 s | 4.73x | 4.70-4.76x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| radix-primitives | happydom-shared | 5/5 | 9.2 s | 4.35x | 4.33-4.45x (95% CI) | 18 (18) | 5 (5) | 0 | 90 |
| solid | jsdom-default | 5/5 | 2.1 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| solid | jsdom-shared | 5/5 | 2.2 s | 1.00x | 0.95-1.00x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-vm | 5/5 | 2.5 s | 0.88x | 0.84-0.88x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-sharedclean | 5/5 | 2.1 s | 1.00x | 1.00-1.05x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | jsdom-learned (harness) | 5/5 | 2.1 s | 1.00x | 0.95-1.05x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| solid | warpdom-default | 5/5 | 2.1 s | 1.05x | 1.00-1.10x (95% CI) | 1 (1) | 1 (1) | — | — |
| solid | warpdom-vm | 5/5 | 61.3 s | 0.03x | 0.03-0.04x (95% CI) | 268 (268) | 14 (14) | 0 | 1337 |
| solid | warpdom-sharedfresh | 5/5 | 2.1 s | 1.00x | 1.00-1.05x (95% CI) | 0 (1) | 0 (1) | 2 | 1 |
| solid | warpdom-sharedreset | 5/5 | 2.1 s | 1.00x | 1.00-1.05x (95% CI) | 1 (1) | 1 (1) | 1 | 1 |
| solid | warpdom-learned (harness) | 5/5 | 2.0 s | 1.05x | 1.00-1.05x (95% CI) | 1 (1) | 1 (1) | 1 | 1 |
| solid | happydom-shared | 5/5 | 2.0 s | 1.10x | 1.05-1.11x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-default | 5/5 | 95.6 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| svelte | jsdom-shared | 5/5 | 92.6 s | 1.00x | 0.98-1.08x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-vm | 5/5 | 86.9 s | 1.05x | 1.01-1.14x (95% CI) | 30 (30) | 3 (3) | 0 | 150 |
| svelte | jsdom-sharedclean | 5/5 | 91.8 s | 0.99x | 0.96-1.08x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | jsdom-learned (harness) | 5/5 | 95.1 s | 1.00x | 0.95-1.05x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| svelte | warpdom-default | 5/5 | 90.4 s | 1.06x | 0.99-1.12x (95% CI) | 1 (1) | 1 (1) | — | — |
| svelte | warpdom-vm | 5/5 | 83.2 s | 1.13x | 1.05-1.19x (95% CI) | 29 (29) | 2 (2) | 5 | 145 |
| svelte | warpdom-sharedfresh | 5/5 | 85.6 s | 1.10x | 1.03-1.19x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| svelte | warpdom-sharedreset | 5/5 | 87.6 s | 1.07x | 1.04-1.13x (95% CI) | 5 (5) | 2 (2) | 0 | 20 |
| svelte | warpdom-learned (cli) | 5/5 | 88.2 s | 1.05x | 1.04-1.15x (95% CI) | 1 (1) | 1 (1) | 0 | 0 |
| svelte | happydom-shared | 5/5 | 90.7 s | 1.05x | 0.97-1.10x (95% CI) | 288 (288) | 5 (5) | 0 | 1440 |
| vuetify | jsdom-default | 5/5 | 30.3 s | 1.00x |  | 0 (0) | 0 (0) | — | — |
| vuetify | jsdom-shared | 5/5 | 5.8 s | 5.22x | 0.99-5.22x (95% CI) | 23 (23) | 1 (1) | 0 | 74 |
| vuetify | jsdom-vm | 5/5 | 8.2 s | 3.65x | 3.48-3.80x (95% CI) | 879 (879) | 65 (65) | 0 | 4395 |
| vuetify | jsdom-sharedclean | 5/5 | 6.0 s | 4.97x | 4.97-5.22x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | jsdom-learned (harness) | 5/5 | 8.6 s | 3.48x | 3.35-3.71x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | warpdom-default | 5/5 | 20.5 s | 1.47x | 1.41-1.49x (95% CI) | 0 (0) | 0 (0) | — | — |
| vuetify | warpdom-vm | 5/5 | 10.2 s | 2.94x | 2.89-3.02x (95% CI) | 2 (2) | 1 (1) | 0 | 10 |
| vuetify | warpdom-sharedfresh | 5/5 | 5.3 s | 5.70x | 5.62-5.72x (95% CI) | 63 (63) | 15 (15) | 0 | 315 |
| vuetify | warpdom-sharedreset | 5/5 | 5.2 s | 5.75x | 5.72-5.92x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | warpdom-learned (cli) | 5/5 | 5.4 s | 5.61x | 5.51-5.81x (95% CI) | 0 (0) | 0 (0) | 0 | 0 |
| vuetify | happydom-shared | 5/5 | 28.6 s | 1.04x | 0.91-6.42x (95% CI) | 9 (10) | 4 (4) | 0 | 36 |

## Best correct jsdom configuration

The fastest of jsdom-default, jsdom-shared, jsdom-vm, jsdom-sharedclean (those that ran) whose results match jsdom-default in every round (allowing only tests that also change between jsdom-default runs), and warpdom-learned's speedup over it (per-round ratios).

| Suite | correct jsdom configurations | best | its median time | warpdom-learned | speedup over best | interval | learned tests differ (max) | learned false passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-default | jsdom-default | 454.0 s | 298.1 s | 1.52x | 1.52-1.53x (range) | 0 | 0 |
| analog | jsdom-default | jsdom-default | 20.8 s | 16.4 s | 1.26x | 1.24-1.28x (95% CI) | 0 | 0 |
| ariakit | jsdom-default | jsdom-default | 626.1 s | 462.8 s | 1.35x | 1.35-1.35x (range) | 7 | 0 |
| ark-ui | jsdom-default | jsdom-default | 208.4 s | 131.2 s | 1.59x | 1.56-1.61x (95% CI) | 2 | 4 |
| emoji-picker-element | jsdom-default | jsdom-default | 37.3 s | 29.3 s | 1.27x | 1.26-1.29x (95% CI) | 0 | 0 |
| floating-ui | jsdom-vm, jsdom-default | jsdom-vm | 13.0 s | 13.2 s | 1.01x | 0.94-1.02x (95% CI) | 0 | 0 |
| material-ui | jsdom-shared, jsdom-sharedclean, jsdom-vm, jsdom-default | jsdom-shared | 54.4 s | 35.0 s | 1.54x | 1.49-1.61x (95% CI) | 0 | 0 |
| radix-primitives | jsdom-shared, jsdom-sharedclean, jsdom-default | jsdom-shared | 12.5 s | 8.6 s | 1.47x | 1.45-1.47x (95% CI) | 0 | 0 |
| solid | jsdom-default, jsdom-sharedclean, jsdom-shared, jsdom-vm | jsdom-default | 2.1 s | 2.0 s | 1.05x | 1.00-1.05x (95% CI) | 1 | 1 |
| svelte | jsdom-sharedclean, jsdom-shared, jsdom-default | jsdom-sharedclean | 91.8 s | 88.2 s | 1.06x | 1.03-1.08x (95% CI) | 1 | 0 |
| vuetify | jsdom-sharedclean, jsdom-default | jsdom-sharedclean | 6.0 s | 5.4 s | 1.11x | 1.11-1.13x (95% CI) | 0 | 0 |

warpdom-learned over the best correct jsdom configuration, median over 11 suites: 1.27x (95% bootstrap interval 1.06-1.52x, suites and rounds resampled).

**Suites where every non-default jsdom configuration changes results:** CopilotKit (jsdom-shared, jsdom-vm, jsdom-sharedclean); analog (jsdom-shared, jsdom-vm, jsdom-sharedclean); ariakit (jsdom-shared, jsdom-vm, jsdom-sharedclean); ark-ui (jsdom-shared, jsdom-vm, jsdom-sharedclean); emoji-picker-element (jsdom-shared, jsdom-vm, jsdom-sharedclean).

## Policy and DOM

jsdom-learned: learned isolation's policy (the harness emulation) on jsdom, without any reset between files. Speedups: median of per-round ratios. Differing tests: max over rounds against jsdom-default; false passes: sum over rounds (G2 violations).

| Suite | jsdom-learned | over jsdom-default | interval | tests differ (max) | false passes | warpdom-learned over jsdom-learned | interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 334.8 s | 1.36x | 1.33-1.39x (range) | 0 | 0 | 1.12x | 1.10-1.15x (range) |
| analog | 20.5 s | 1.00x | 0.99-1.05x (95% CI) | 0 | 0 | 1.24x | 1.20-1.29x (95% CI) |
| ariakit | 602.6 s | 1.04x | 1.04-1.04x (range) | 6 | 0 | 1.30x | 1.30-1.30x (range) |
| ark-ui | 208.5 s | 1.00x | 0.97-1.03x (95% CI) | 3 | 8 | 1.57x | 1.56-1.62x (95% CI) |
| emoji-picker-element | 34.7 s | 1.08x | 1.06-1.14x (95% CI) | 0 | 0 | 1.19x | 1.12-1.20x (95% CI) |
| floating-ui | 19.0 s | 1.01x | 0.97-1.05x (95% CI) | 0 | 0 | 1.49x | 1.42-1.57x (95% CI) |
| material-ui | 54.9 s | 4.27x | 4.21-4.40x (95% CI) | 0 | 0 | 1.56x | 1.54-1.61x (95% CI) |
| radix-primitives | 12.5 s | 3.23x | 3.20-3.26x (95% CI) | 0 | 0 | 1.45x | 1.45-1.49x (95% CI) |
| solid | 2.1 s | 1.00x | 0.95-1.05x (95% CI) | 0 | 0 | 1.05x | 1.00-1.05x (95% CI) |
| svelte | 95.1 s | 1.00x | 0.95-1.05x (95% CI) | 0 | 0 | 1.08x | 1.02-1.15x (95% CI) |
| vuetify | 8.6 s | 3.48x | 3.35-3.71x (95% CI) | 0 | 0 | 1.59x | 1.51-1.68x (95% CI) |

## Learning stability and cost

Learnings: round 0 (the warm-up; the timed learned runs use its state) and one from scratch per round. Jaccard: mean over pairs of learnings of the leaky sets' similarity (1 = identical). Learning cost: median t_sh + t_split. Break-even: cost / (median isolated run - median learned run), the isolated run being the same DOM's default (warpdom-default, or jsdom-default for jsdom-learned).

| Suite | configuration | method | learnings | leaky files (min-max) | Jaccard | modes | mode agreement | median t_iso / t_sh / t_split | learning cost | break-even runs | new leaky in timed runs | files re-run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | jsdom-learned | harness | 3 | 184-188 | 0.94 | split 1, isolated 2 | 0.67 | 453.5 / 231.0 / 329.2 s | 557.8 s | 4.7 | 1 | 1 |
| CopilotKit | warpdom-learned | cli | 3 | 54-71 | 0.79 | packages_a2ui-renderer=isolated;packages_angular=isolated;packages_mcp-apps-renderer=isolated;packages_react-core=isolated;packages_vue=split;packages_web-components=isolated;packages_web-inspector=isolated 3 | 1.00 | 365.3 / 444.0 / 309.7 s | 761.3 s | 11.5 | 0 | 0 |
| analog | jsdom-learned | harness | 6 | 7-7 | 0.85 | isolated 6 | 1.00 | 20.1 / 17.9 / 28.7 s | 46.4 s | 154.7 | 0 | 0 |
| analog | warpdom-learned | cli | 6 | 7-7 | 0.50 | apps_analog-app=isolated;apps_trpc-app=isolated;libs_card=isolated;libs_top-bar=isolated;packages_content=isolated;packages_create-analog=isolated;packages_router=isolated;packages_vitest-angular=isolated 6 | 1.00 | 16.7 / 16.8 / 19.8 s | 36.3 s | 362.8 | 0 | 0 |
| ariakit | jsdom-learned | harness | 2 | 3-3 | 0.20 | split 2 | 1.00 | 622.0 / 437.8 / 526.8 s | 964.5 s | 41.0 | 2 | 19 |
| ariakit | warpdom-learned | harness | 2 | 30-31 | 0.85 | isolated 2 | 1.00 | 457.1 / 373.1 / — s | — | — | 0 | 0 |
| ark-ui | jsdom-learned | harness | 6 | 131-133 | 0.96 | isolated 6 | 1.00 | 209.3 / 190.2 / 210.7 s | 400.9 s | never (learned not faster) | 0 | 0 |
| ark-ui | warpdom-learned | cli | 6 | 122-126 | 0.92 | packages_react=split;packages_solid=isolated;packages_svelte=isolated;packages_vue=isolated 3, packages_react=isolated;packages_solid=isolated;packages_svelte=isolated;packages_vue=isolated 3 | 0.50 | 133.8 / 130.1 / 135.2 s | 265.1 s | 82.8 | 0 | 0 |
| emoji-picker-element | jsdom-learned | harness | 6 | 15-15 | 1.00 | split 6 | 1.00 | 37.7 / 13.6 / 32.8 s | 46.4 s | 17.8 | 0 | 0 |
| emoji-picker-element | warpdom-learned | cli | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 29.1 / 29.5 / 29.6 s | 59.2 s | 591.6 | 0 | 0 |
| floating-ui | jsdom-learned | harness | 6 | 15-15 | 1.00 | isolated 6 | 1.00 | 19.5 / 10.7 / 21.3 s | 32.0 s | 45.7 | 0 | 0 |
| floating-ui | warpdom-learned | harness | 6 | 15-15 | 1.00 | isolated 6 | 1.00 | 12.8 / 6.7 / 14.2 s | 20.9 s | never (learned not faster) | 0 | 0 |
| material-ui | jsdom-learned | harness | 6 | 0-0 | 1.00 | split 6 | 1.00 | 234.5 / 54.6 / 54.5 s | 109.3 s | 0.6 | 0 | 0 |
| material-ui | warpdom-learned | cli | 6 | 0-0 | 1.00 | packages_mui-lab=split;packages_mui-material=split;packages_mui-system=split;packages_mui-utils=split 6 | 1.00 | 129.8 / 34.7 / 34.6 s | 69.3 s | 0.7 | 0 | 0 |
| radix-primitives | jsdom-learned | harness | 6 | 0-0 | 1.00 | split 6 | 1.00 | 40.3 / 12.6 / 12.6 s | 25.2 s | 0.9 | 0 | 0 |
| radix-primitives | warpdom-learned | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 22.3 / 8.5 / 8.5 s | 17.1 s | 1.3 | 0 | 0 |
| solid | jsdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 2.2 / 2.2 / 2.2 s | 4.3 s | never (learned not faster) | 0 | 0 |
| solid | warpdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 2.1 / 2.1 / 2.9 s | 5.0 s | 50.0 | 0 | 0 |
| svelte | jsdom-learned | harness | 6 | 0-0 | 1.00 | isolated 6 | 1.00 | 97.7 / 94.8 / 98.7 s | 193.4 s | 386.9 | 0 | 0 |
| svelte | warpdom-learned | cli | 6 | 0-1 | 0.40 | split 2, isolated 4 | 0.67 | 91.0 / 91.5 / 89.8 s | 180.7 s | 82.1 | 0 | 0 |
| vuetify | jsdom-learned | harness | 6 | 0-2 | 0.23 | split 6 | 1.00 | 30.3 / 6.0 / 7.7 s | 13.8 s | 0.6 | 0 | 0 |
| vuetify | warpdom-learned | cli | 6 | 0-0 | 1.00 | split 6 | 1.00 | 20.6 / 5.4 / 5.3 s | 10.7 s | 0.7 | 0 | 0 |
