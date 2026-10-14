| Suite | rounds | jsdom | warpdom | jsdom vm | warpdom vm | warpdom vs jsdom (default) | best correct warpdom vs jsdom default | differ (wd default / jsdom vm / wd vm) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| solid-primitives | 5 | 2.9 s | 2.6 s | — | — | 1.16x | 1.16x | 21 / — / — |

**Check:** solid-primitives: 5 of 5 jsdom rounds differ from the jsdom baseline in more than 5 tests or have no time; those rounds are not comparable.

| Suite | jsdom | warpdom | happy-dom | warpdom vs jsdom | happy-dom vs jsdom | warpdom vs happy-dom | tests differing from jsdom: warpdom / happy-dom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| solid-primitives (check) | 2.9 s | 2.6 s | 2.6 s | 1.16x | 1.12x | 1.00x | 21 / 13 |

Medians over 0 suites with valid jsdom rounds: warpdom vs jsdom NaNx, happy-dom vs jsdom NaNx, warpdom vs happy-dom NaNx.

**Per package** (median runner seconds over the timed rounds; warm-up = round 0)

| Suite | package | timed rounds | jsdom-default | jsdom-default warm-up | warpdom-default | warpdom-default warm-up | happy-dom-default | happy-dom-default warm-up | jsdom / warpdom (timed) | jsdom / warpdom (warm-up) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| solid-primitives | . | 5 | 2.9 s | 2.9 s | 2.6 s | 2.5 s | 2.6 s | 2.7 s | 1.16x | 1.16x |
