## solid
27 test files in both (27 jsdom, 27 warpdom)

phase totals, seconds (summed over files; workers run files in parallel)
phase           jsdom  warpdom  ratio
environment     1.96     1.87  1.05x
prepare         0.28     1.10  0.25x
collect         2.61     2.67  0.98x
setup           0.00     0.00  NaNx
tests           3.15     1.99  1.58x
total           7.99     7.62  1.05x

14 of 27 files slower on warpdom; the 14 that lose the most (ms, jsdom -> warpdom):
  +992 ms  web/test/suspense.spec.tsx  (environment 9->817, prepare 0->224, collect 413->375, setup 0->0, tests 50->48)
  +756 ms  store/test/modifiers.spec.ts  (environment 7->25, prepare 0->451, collect 15->280, setup 0->0, tests 10->32)
  +96 ms  store/test/mutableWithClass.spec.tsx  (environment 8->6, prepare 0->1, collect 25->122, setup 0->0, tests 2->2)
  +83 ms  web/test/index.spec.tsx  (environment 10->12, prepare 0->0, collect 130->223, setup 0->0, tests 126->113)
  +42 ms  web/test/portal.spec.tsx  (environment 8->18, prepare 0->0, collect 43->70, setup 0->0, tests 12->17)
  +32 ms  web/test/server-mock.spec.tsx  (environment 10->3, prepare 0->0, collect 12->51, setup 0->0, tests 1->1)
  +29 ms  web/test/dynamic.spec.tsx  (environment 8->13, prepare 0->0, collect 46->65, setup 0->0, tests 17->22)
  +20 ms  web/test/context.spec.tsx  (environment 8->10, prepare 0->0, collect 45->61, setup 0->0, tests 5->5)
  +17 ms  solid/test/rendering.spec.ts  (environment 11->3, prepare 0->0, collect 79->104, setup 0->0, tests 26->26)
  +12 ms  store/test/mutable.spec.ts  (environment 12->9, prepare 1->0, collect 28->40, setup 0->0, tests 29->32)
  +11 ms  web/test/errorboundary.spec.tsx  (environment 8->10, prepare 0->0, collect 42->41, setup 0->0, tests 18->28)
  +10 ms  web/test/element.spec.tsx  (environment 9->10, prepare 0->0, collect 60->65, setup 0->0, tests 15->19)
  +9 ms  solid/test/observable.spec.ts  (environment 9->7, prepare 0->0, collect 9->18, setup 0->0, tests 3->3)
  +5 ms  solid/test/scheduler.spec.ts  (environment 9->14, prepare 0->0, collect 8->9, setup 0->0, tests 4->4)

