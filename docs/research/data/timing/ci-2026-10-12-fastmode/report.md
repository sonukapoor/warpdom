| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 3 | 550.3 s | — | — | — | NaNx | NaNx | — / — / — |
| analog | 3 | 31.5 s | — | — | — | NaNx | NaNx | — / — / — |
| ariakit | 3 | 673.8 s | — | — | — | NaNx | NaNx | — / — / — |
| ark-ui | 3 | 351.6 s | — | — | — | NaNx | NaNx | — / — / — |
| emoji-picker-element | 3 | 52.3 s | — | — | — | NaNx | NaNx | — / — / — |
| floating-ui | 3 | 36.9 s | — | — | — | NaNx | NaNx | — / — / — |
| material-ui | 3 | 361.9 s | — | — | — | NaNx | NaNx | — / — / — |
| radix-primitives | 3 | 51.9 s | — | — | — | NaNx | NaNx | — / — / — |
| solid | 3 | 4.6 s | — | — | — | NaNx | NaNx | — / — / — |
| svelte | 3 | 99.4 s | — | — | — | NaNx | NaNx | — / — / — |
| vuetify | 3 | 47.2 s | — | — | — | NaNx | NaNx | — / — / — |

| Suite | jsdom default | warpdom fast mode | mode | speedup | tests differing from jsdom |
| --- | --- | --- | --- | --- | --- |
| CopilotKit | 550.3 s | 314.0 s | split | 1.72x | 0 |
| analog | 31.5 s | 25.7 s | isolated | 1.22x | 0 |
| ariakit | 673.8 s | 468.5 s | isolated | 1.43x | 14 |
| ark-ui | 351.6 s | 214.4 s | isolated | 1.64x | 2 |
| emoji-picker-element | 52.3 s | 31.6 s | split | 1.67x | 0 |
| floating-ui | 36.9 s | 23.1 s | isolated | 1.60x | 0 |
| material-ui | 361.9 s | 44.9 s | split | 8.14x | 2 |
| radix-primitives | 51.9 s | 8.6 s | split | 6.03x | 0 |
| solid | 4.6 s | 4.3 s | isolated | 1.05x | 2 |
| svelte | 99.4 s | 90.7 s | isolated | 1.08x | 2 |
| vuetify | 47.2 s | 7.2 s | split | 6.56x | 0 |

Fast mode median over 11 suites: 1.64x.
