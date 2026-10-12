| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ariakit | 3 | 666.6 s | 467.9 s | — | — | 1.43x | 1.43x | 9 / — / — |
| ark-ui | 3 | 335.9 s | 208.2 s | — | — | 1.63x | 1.63x | 3 / — / — |
| floating-ui | 3 | 39.1 s | 25.0 s | — | — | 1.59x | 1.59x | 0 / — / — |
| radix-primitives | 3 | 65.0 s | 33.1 s | — | — | 1.95x | 1.95x | 0 / — / — |
| vuetify | 3 | 50.1 s | 32.5 s | — | — | 1.53x | 1.53x | 0 / — / — |

| Suite | configuration | median | vs jsdom default | vs warpdom default | differ |
| --- | --- | --- | --- | --- | --- |
| ariakit | warpdomframes-default | 291.5 s | 2.31x | 1.61x | 12 |
| ark-ui | warpdomframes-default | 204.8 s | 1.64x | 1.01x | 6 |
| floating-ui | warpdomframes-default | 24.6 s | 1.59x | 1.02x | 0 |
| radix-primitives | warpdomframes-default | 34.6 s | 1.87x | 0.96x | 0 |
| vuetify | warpdomframes-default | 32.4 s | 1.55x | 1.01x | 0 |
