**jsdom version dependence** (jsdom only; tests and files whose status differs from the project's own jsdom (own-a), flaky ones left out: those that differ between own-a and own-b; own-b's row shows the flaky counts)

| Suite | variant | jsdom resolved | forced | tests | tests differing | files differing | flaky tests / files | seconds | NA reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| naive-ui | own-a | 27.4.0 (cssstyle 5.2.1) | — | 1246 | 0 | 0 | 0 / 0 | 185.9 |  |
| naive-ui | own-b | 27.4.0 (cssstyle 5.2.1) | — | 1246 | 0 | 0 | 0 / 0 | 186.1 |  |
| naive-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 5.2.1) | yes | 1246 | 1 | 1 | 0 / 0 | 186.8 |  |
| naive-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 5.2.1) | yes | 1246 | 0 | 0 | 0 / 0 | 186.7 |  |
| naive-ui | jsdom-30.1.2 | 30.1.2 | yes | 1246 | 0 | 0 | 0 / 0 | 200.8 |  |
| solid-primitives | own-a | 25.0.1 (cssstyle 4.4.0) | — | 922 | 0 | 0 | 0 / 0 | 4.1 |  |
| solid-primitives | own-b | 25.0.1 (cssstyle 4.4.0) | — | 922 | 0 | 0 | 0 / 0 | 3.9 |  |
| solid-primitives | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 922 | 0 | 0 | 0 / 0 | 3.8 |  |
| solid-primitives | jsdom-26.1.0 | 26.1.0 (cssstyle 4.4.0) | yes | 922 | 0 | 0 | 0 / 0 | 3.9 |  |
| solid-primitives | jsdom-30.1.2 | 30.1.2 (cssstyle 4.4.0) | yes | 901 | 21 | 0 | 0 / 0 | 4.4 |  |

| Suite | own-b | jsdom-20.0.3 | jsdom-26.1.0 | jsdom-30.1.2 |
| --- | --- | --- | --- | --- |
| naive-ui | 0 (0 files) | 1 (1 files) | 0 (0 files) | 0 (0 files) |
| solid-primitives | 0 (0 files) | 0 (0 files) | 0 (0 files) | 21 (0 files) |

**Differing tests by first error line** (largest groups first, at most 8 per suite and variant)

- naive-ui jsdom-20.0.3
  - 1 × `passed -> failed | AssertionError: expected "vi.fn()" to not be called at all, but actually been called N times` (e.g. root::src/input/tests/Input.spec.tsx::n-input should work with `blur` `focus` `select` methods)
- solid-primitives jsdom-30.1.2
  - 21 × `passed -> missing | ` (e.g. root::packages/pagination/test/index.test.ts::makeAbortable makes a fetcher abortable)
