| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 3 | 6.5 s | 5.0 s | — | — | 1.30x | 1.30x | 1 / — / — |
| downshift | 3 | 14.4 s | 8.4 s | — | — | 1.71x | 1.71x | 24 / — / — |
| melt-ui | 3 | 46.8 s | 33.1 s | — | — | 1.41x | 1.41x | 0 / — / — |
| naive-ui | 3 | 334.1 s | 298.7 s | — | — | 1.12x | 1.12x | 0 / — / — |
| react-router | 3 | 48.7 s | 48.9 s | — | — | 1.00x | 1.00x | 17 / — / — |
| solid-primitives | 3 | 3.8 s | 21.9 s | — | — | 0.18x | 0.18x | 8 / — / — |
| taiga-ui | 3 | 595.1 s | 589.5 s | — | — | 1.01x | 1.01x | 0 / — / — |
| tanstack-query | 3 | 83.8 s | 55.8 s | — | — | 1.50x | 1.50x | 2 / — / — |
| vueuse | 3 | 60.0 s | 32.7 s | — | — | 1.84x | 1.84x | 10 / — / — |

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | 6.5 s | 5.0 s | 5.7 s | 1.30x | 1.14x | 1.14x | 1 / 23 |
| downshift | 14.4 s | 8.4 s | 9.8 s | 1.71x | 1.47x | 1.15x | 24 / 19 |
| melt-ui | 46.8 s | 33.1 s | 40.4 s | 1.41x | 1.16x | 1.22x | 0 / 10 |
| naive-ui | 334.1 s | 298.7 s | 316.3 s | 1.12x | 1.06x | 1.06x | 0 / 23 |
| react-router | 48.7 s | 48.9 s | 50.8 s | 1.00x | 0.98x | 1.02x | 17 / 83 |
| solid-primitives | 3.8 s | 21.9 s | 3.4 s | 0.18x | 1.12x | 0.16x | 8 / 13 |
| taiga-ui | 595.1 s | 589.5 s | 87.9 s | 1.01x | 6.79x | 0.15x | 0 / 2604 |
| tanstack-query | 83.8 s | 55.8 s | 65.4 s | 1.50x | 1.28x | 1.17x | 2 / 1 |
| vueuse | 60.0 s | 32.7 s | 49.5 s | 1.84x | 1.21x | 1.51x | 10 / 58 |

Medians over 9 suites with valid jsdom rounds: warpdom vs jsdom 1.30x, happy-dom vs jsdom 1.16x, warpdom vs happy-dom 1.14x.
