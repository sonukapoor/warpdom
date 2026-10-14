# Ablation A4: the latest profile for every project (GitHub Actions)

- `tuning-38318430577`, `held-out-38318441787`: runs 38318430577 and
  38318441787, warpdom 77bec904, dom-api-tracer 33d8853, warm-up + 2
  rounds, jsdom-default, warpdom-default (own profile, the same-job
  control) and warpdomlatest-default (WARPDOM_ABLATE=latest-profile: jsdom
  30.1.2 behavior for every project). `a4-differences.tsv`
  (tools/a4-differences.cjs): per round, tests whose status differs
  between latest and own profile and from jsdom.
- `one-round-*`: the earlier one-round runs 38287839805 and 38287846777
  (dom-api-tracer 0bdfa08; warpdom f07277d/3b62996/77bec904, the same DOM
  code), kept for completeness.
Keys of naive-ui and solid-primitives have the CI root bug (harness before
3277761).
