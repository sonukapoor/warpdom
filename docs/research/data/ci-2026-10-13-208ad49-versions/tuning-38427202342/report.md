**jsdom version dependence** (jsdom only; tests and files whose status differs from the project's own jsdom (own-a), flaky ones left out: those that differ between own-a and own-b; own-b's row shows the flaky counts)

| Suite | variant | jsdom resolved | forced | tests | tests differing | files differing | flaky tests / files | seconds | NA reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | own-a | 26.1.0 / 24.1.3 / 29.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0 / 8.0.1, whatwg-url 14.2.0 / 16.0.1) | — | 4683 | 0 | 0 | 0 / 0 | 302.1 |  |
| CopilotKit | own-b | 26.1.0 / 24.1.3 / 29.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0 / 8.0.1, whatwg-url 14.2.0 / 16.0.1) | — | 4683 | 0 | 0 | 0 / 0 | 301.6 |  |
| CopilotKit | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 11.0.0) | yes | 4683 | 8 | 5 | 0 / 0 | 291.2 |  |
| CopilotKit | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | yes | 4683 | 4 | 3 | 0 / 0 | 293.7 |  |
| CopilotKit | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 4683 | 2 | 2 | 0 / 0 | 350 |  |
| analog | own-a | 28.1.0 (cssstyle 6.2.0, parse5 8.0.0, whatwg-url 16.0.1) | — | 194 | 0 | 0 | 0 / 0 | 28.7 |  |
| analog | own-b | 28.1.0 (cssstyle 6.2.0, parse5 8.0.0, whatwg-url 16.0.1) | — | 194 | 0 | 0 | 0 / 0 | 27.5 |  |
| analog | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 194 | 0 | 0 | 0 / 0 | 25.6 |  |
| analog | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 194 | 0 | 0 | 0 / 0 | 25.7 |  |
| analog | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 194 | 0 | 0 | 0 / 0 | 28.4 |  |
| ariakit | own-a | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | — | 1852 | 0 | 0 | 0 / 0 | 610.4 |  |
| ariakit | own-b | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | — | 1852 | 0 | 0 | 0 / 0 | 610.8 |  |
| ariakit | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 1852 | 258 | 47 | 0 / 0 | 580 |  |
| ariakit | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 1852 | 246 | 44 | 0 / 0 | 503.5 |  |
| ariakit | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 1852 | 0 | 0 | 0 / 0 | 610.4 |  |
| ark-ui | own-a | 30.1.1 (parse5 8.0.1, whatwg-url 17.2.0) | — | 1245 | 0 | 0 | 1 / 1 | 208 |  |
| ark-ui | own-b | 30.1.1 (parse5 8.0.1, whatwg-url 17.2.0) | — | 1245 | 1 | 1 | 1 / 1 | 210.1 |  |
| ark-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 1245 | 4 | 3 | 1 / 1 | 174.5 |  |
| ark-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 1245 | 1 | 0 | 1 / 1 | 168.9 |  |
| ark-ui | jsdom-30.1.2 | 30.1.2 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 8.0.1, whatwg-url 17.2.0) | yes | 1245 | 4 | 3 | 1 / 1 | 206.4 |  |
| emoji-picker-element | own-a | 26.1.0 (cssstyle 4.3.0, nwsapi 2.2.20, parse5 7.2.1, whatwg-url 14.2.0) | — | 160 | 0 | 0 | 0 / 0 | 36.1 |  |
| emoji-picker-element | own-b | 26.1.0 (cssstyle 4.3.0, nwsapi 2.2.20, parse5 7.2.1, whatwg-url 14.2.0) | — | 160 | 0 | 0 | 0 / 0 | 36.4 |  |
| emoji-picker-element | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.20, parse5 7.2.1, whatwg-url 11.0.0) | yes | 160 | 0 | 0 | 0 / 0 | 37.4 |  |
| emoji-picker-element | jsdom-26.1.0 | 26.1.0 (cssstyle 4.3.0, nwsapi 2.2.20, parse5 7.2.1, whatwg-url 14.2.0) | yes | 160 | 0 | 0 | 0 / 0 | 36.7 |  |
| emoji-picker-element | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 160 | 0 | 0 | 0 / 0 | 41.6 |  |
| floating-ui | own-a | 26.0.0 (cssstyle 4.3.0, nwsapi 2.2.19, parse5 7.2.1, whatwg-url 14.2.0) | — | 340 | 0 | 0 | 0 / 0 | 24.9 |  |
| floating-ui | own-b | 26.0.0 (cssstyle 4.3.0, nwsapi 2.2.19, parse5 7.2.1, whatwg-url 14.2.0) | — | 340 | 0 | 0 | 0 / 0 | 25.1 |  |
| floating-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.19, parse5 7.2.1, whatwg-url 11.0.0) | yes | 340 | 0 | 0 | 0 / 0 | 27.1 |  |
| floating-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 4.3.0, nwsapi 2.2.19, parse5 7.2.1, whatwg-url 14.2.0) | yes | 340 | 0 | 0 | 0 / 0 | 25 |  |
| floating-ui | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 340 | 0 | 0 | 0 / 0 | 31.4 |  |
| handsontable | own-a | 16.7.0 / 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.24, parse5 6.0.1 / 7.3.0, whatwg-url 8.7.0 / 11.0.0) | — | 8082 | 0 | 0 | 0 / 0 | 1244.2 |  |
| handsontable | own-b | 16.7.0 / 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.24, parse5 6.0.1 / 7.3.0, whatwg-url 8.7.0 / 11.0.0) | — | 8082 | 0 | 0 | 0 / 0 | 816.3 |  |
| handsontable | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.24, parse5 7.3.0, whatwg-url 11.0.0) | yes | 8082 | 0 | 0 | 0 / 0 | 1223.3 |  |
| handsontable | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.24, parse5 7.3.0, whatwg-url 14.2.0) | yes | 365 | 7717 | 540 | 0 / 0 | 604.3 |  |
| handsontable | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 51 | 8031 | 554 | 0 / 0 | 8.4 |  |
| material-ui | own-a | 30.1.1 (parse5 8.0.1, whatwg-url 17.1.2) | — | 6770 | 0 | 0 | 0 / 0 | 175.4 |  |
| material-ui | own-b | 30.1.1 (parse5 8.0.1, whatwg-url 17.1.2) | — | 6770 | 0 | 0 | 0 / 0 | 173.1 |  |
| material-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 6770 | 4 | 3 | 0 / 0 | 155.7 |  |
| material-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 6770 | 3 | 2 | 0 / 0 | 139.2 |  |
| material-ui | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 6770 | 0 | 0 | 0 / 0 | 173.8 |  |
| radix-primitives | own-a | 29.1.1 (parse5 8.0.1, whatwg-url 16.0.1) | — | 982 | 0 | 0 | 0 / 0 | 46.7 |  |
| radix-primitives | own-b | 29.1.1 (parse5 8.0.1, whatwg-url 16.0.1) | — | 982 | 0 | 0 | 0 / 0 | 46 |  |
| radix-primitives | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 982 | 12 | 4 | 0 / 0 | 41.2 |  |
| radix-primitives | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 982 | 11 | 3 | 0 / 0 | 39.7 |  |
| radix-primitives | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 982 | 0 | 0 | 0 / 0 | 45.4 |  |
| react-hook-form | own-a | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.24, parse5 7.3.0, whatwg-url 14.2.0) | — | 1515 | 0 | 0 | 0 / 0 | 13.9 |  |
| react-hook-form | own-b | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.24, parse5 7.3.0, whatwg-url 14.2.0) | — | 1515 | 0 | 0 | 0 / 0 | 13.2 |  |
| react-hook-form | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.24, parse5 7.3.0, whatwg-url 11.0.0) | yes | 1515 | 0 | 0 | 0 / 0 | 14.8 |  |
| react-hook-form | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.24, parse5 7.3.0, whatwg-url 14.2.0) | yes | 1515 | 0 | 0 | 0 / 0 | 13.3 |  |
| react-hook-form | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 1515 | 0 | 0 | 0 / 0 | 14 |  |
| react-spectrum | own-a | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | — | 8456 | 0 | 0 | 0 / 0 | 481.1 |  |
| react-spectrum | own-b | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | — | 8456 | 0 | 0 | 0 / 0 | 399.2 |  |
| react-spectrum | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 8456 | 12 | 6 | 0 / 0 | 521.5 |  |
| react-spectrum | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | yes | 8456 | 0 | 0 | 0 / 0 | 428.1 |  |
| react-spectrum | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 8334 | 260 | 37 | 0 / 0 | 477.8 |  |
| solid | own-a | 25.0.1 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | — | 482 | 0 | 0 | 0 / 0 | 3.8 |  |
| solid | own-b | 25.0.1 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | — | 482 | 0 | 0 | 0 / 0 | 3.5 |  |
| solid | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 11.0.0) | yes | 482 | 0 | 0 | 0 / 0 | 3.4 |  |
| solid | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 7.3.0, whatwg-url 14.2.0) | yes | 482 | 0 | 0 | 0 / 0 | 3.3 |  |
| solid | jsdom-30.1.2 | 30.1.2 (cssstyle 4.6.0, nwsapi 2.2.23, parse5 8.0.1, whatwg-url 17.2.0) | yes | 482 | 0 | 0 | 0 / 0 | 3.7 |  |
| svelte | own-a | 25.0.1 (cssstyle 4.1.0, nwsapi 2.2.12, parse5 7.1.2, whatwg-url 14.0.0) | — | 7879 | 0 | 0 | 0 / 0 | 100 |  |
| svelte | own-b | 25.0.1 (cssstyle 4.1.0, nwsapi 2.2.12, parse5 7.1.2, whatwg-url 14.0.0) | — | 7879 | 0 | 0 | 0 / 0 | 85.1 |  |
| svelte | cssstyle-4.1.0 | 25.0.1 (cssstyle 4.1.0, nwsapi 2.2.12, parse5 7.1.2, whatwg-url 14.0.0) | yes | 7879 | 0 | 0 | 0 / 0 | 84.1 |  |
| svelte | cssstyle-4.6.0 | 25.0.1 (cssstyle 4.6.0, nwsapi 2.2.12, parse5 7.1.2, whatwg-url 14.0.0) | yes | 7879 | 12 | 1 | 0 / 0 | 86.1 |  |
| svelte | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.12, parse5 7.1.2, whatwg-url 11.0.0) | yes | 7879 | 38 | 2 | 0 / 0 | 85 |  |
| svelte | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 7879 | 12 | 1 | 0 / 0 | 85.1 |  |
| svelte | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 7879 | 29 | 2 | 0 / 0 | 86 |  |
| vuetify | own-a | 27.2.0 (cssstyle 5.3.3, parse5 8.0.0, whatwg-url 15.1.0) | — | 947 | 0 | 0 | 0 / 0 | 38.8 |  |
| vuetify | own-b | 27.2.0 (cssstyle 5.3.3, parse5 8.0.0, whatwg-url 15.1.0) | — | 947 | 0 | 0 | 0 / 0 | 38.7 |  |
| vuetify | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 11.0.0) | yes | 947 | 16 | 6 | 0 / 0 | 37.7 |  |
| vuetify | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0, nwsapi 2.2.28, parse5 7.3.0, whatwg-url 14.2.0) | yes | 947 | 15 | 6 | 0 / 0 | 37 |  |
| vuetify | jsdom-30.1.2 | 30.1.2 (parse5 8.0.1, whatwg-url 17.2.0) | yes | 947 | 15 | 6 | 0 / 0 | 45.8 |  |

| Suite | own-b | cssstyle-4.1.0 | cssstyle-4.6.0 | jsdom-20.0.3 | jsdom-26.1.0 | jsdom-30.1.2 |
| --- | --- | --- | --- | --- | --- | --- |
| CopilotKit | 0 (0 files) |  |  | 8 (5 files) | 4 (3 files) | 2 (2 files) |
| analog | 0 (0 files) |  |  | 0 (0 files) | 0 (0 files) | 0 (0 files) |
| ariakit | 0 (0 files) |  |  | 258 (47 files) | 246 (44 files) | 0 (0 files) |
| ark-ui | 1 (1 files) |  |  | 4 (3 files) | 1 (0 files) | 4 (3 files) |
| emoji-picker-element | 0 (0 files) |  |  | 0 (0 files) | 0 (0 files) | 0 (0 files) |
| floating-ui | 0 (0 files) |  |  | 0 (0 files) | 0 (0 files) | 0 (0 files) |
| handsontable | 0 (0 files) |  |  | 0 (0 files) | 7717 (540 files) | 8031 (554 files) |
| material-ui | 0 (0 files) |  |  | 4 (3 files) | 3 (2 files) | 0 (0 files) |
| radix-primitives | 0 (0 files) |  |  | 12 (4 files) | 11 (3 files) | 0 (0 files) |
| react-hook-form | 0 (0 files) |  |  | 0 (0 files) | 0 (0 files) | 0 (0 files) |
| react-spectrum | 0 (0 files) |  |  | 12 (6 files) | 0 (0 files) | 260 (37 files) |
| solid | 0 (0 files) |  |  | 0 (0 files) | 0 (0 files) | 0 (0 files) |
| svelte | 0 (0 files) | 0 (0 files) | 12 (1 files) | 38 (2 files) | 12 (1 files) | 29 (2 files) |
| vuetify | 0 (0 files) |  |  | 16 (6 files) | 15 (6 files) | 15 (6 files) |

**Differing tests by first error line** (largest groups first, at most 8 per suite and variant)

- CopilotKit jsdom-20.0.3
  - 3 × `passed -> failed | AssertionError: expected '' to be 'var(--copilotkit-license-banner-offse…' // Object.is equality` (e.g. packages_vue::packages/vue/src/v2/components/chat/__tests__/CopilotChatInput.bottomAnchored.test.ts::CopilotChatInput bottom-anchored offset reserves padding-bottom for the license banner when positioning="absolute")
  - 1 × `passed -> failed | AssertionError: expected [] to include 'saved-thread'` (e.g. packages_vue::packages/vue/src/v2/providers/__tests__/inspector-thread-override.test.ts::inspector thread override switches a pinned threadId when view-thread matches the agent)
  - 1 × `passed -> failed | AssertionError: expected '' to be 'none' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/inspector-navigation.spec.ts::trusted identity stays on Home while connection state moves into branded chrome)
  - 1 × `passed -> failed | AssertionError: expected undefined to be 'left' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/threads-states.spec.ts::real and example rows expose native focus and current-selection semantics)
  - 1 × `passed -> failed | AssertionError: expected undefined to be 'N.N' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/web-inspector.spec.ts::WebInspectorElement small viewports zooms the window down so the desktop layout fits the screen)
  - 1 × `passed -> failed | AssertionError: expected undefined to be '' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/web-inspector.spec.ts::WebInspectorElement small viewports keeps the full-size window when the screen can hold it)
- CopilotKit jsdom-26.1.0
  - 1 × `passed -> failed | AssertionError: expected '' to be 'none' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/inspector-navigation.spec.ts::trusted identity stays on Home while connection state moves into branded chrome)
  - 1 × `passed -> failed | AssertionError: expected undefined to be 'left' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/threads-states.spec.ts::real and example rows expose native focus and current-selection semantics)
  - 1 × `passed -> failed | AssertionError: expected undefined to be 'N.N' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/web-inspector.spec.ts::WebInspectorElement small viewports zooms the window down so the desktop layout fits the screen)
  - 1 × `passed -> failed | AssertionError: expected undefined to be '' // Object.is equality` (e.g. packages_web-inspector::packages/web-inspector/src/__tests__/web-inspector.spec.ts::WebInspectorElement small viewports keeps the full-size window when the screen can hold it)
- CopilotKit jsdom-30.1.2
  - 1 × `passed -> failed | AssertionError: expected "connectAgent" to not be called at all, but actually been called N times` (e.g. packages_angular::packages/angular/src/lib/components/chat/__tests__/copilot-chat.spec.ts::CopilotChat connection lifecycle agent connections destroy before connect delegation does not call Core)
  - 1 × `passed -> failed | Error: Unable to find role="menuitem" and name "View in Inspector Open this message in the Inspector"` (e.g. packages_react-core::packages/react-core/src/v2/components/chat/__tests__/CopilotChatAssistantMessage.test.tsx::CopilotChatAssistantMessage Callback functionality renders the local Inspector button and opens it from the toolbar)
- ariakit jsdom-20.0.3
  - 167 × `passed -> failed | TypeError: CSS?.supports is not a function` (e.g. root::app/src/sandbox/combobox-popover-modal-input/test.ts::closes the modal popover with Escape from the input inside it)
  - 11 × `passed -> failed | TestingLibraryElementError: Unable to find an accessible element with the role "dialog" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/dialog-combobox-command-menu/test.ts::open dialog with enter and hide by pressing enter on esc button)
  - 10 × `passed -> failed | ReferenceError: PointerEvent is not defined` (e.g. root::packages/ariakit-test/src/dispatch.jsdom.test.ts::dispatch.pointerDown initializes an event dispatched inside an iframe)
  - 8 × `passed -> failed | Error: Unable to find an accessible element with the role "menuitem" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/menu-initial-focus-changes/test.ts::gives the initial focus to the first item when a modal menu opens again after its first item was removed)
  - 5 × `failed -> passed | (own) TestingLibraryElementError: Unable to find an accessible element with the role "button" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/ariakit-ui-disclosure/test.ts::keeps a trailing badge beside the label)
  - 5 × `passed -> failed | AssertionError: expected [ 'pointerdown - - N', …(N) ] to deeply equal [ 'pointerdown N N N', …(N) ]` (e.g. root::packages/ariakit-test/src/click.test.ts::click with the auxiliary button dispatches auxclick instead of click)
  - 5 × `failed -> passed | (own) AssertionError: expected '' to be 'sample paragraph text' // Object.is equality` (e.g. root::packages/ariakit-test/src/mouse-down.test.ts::mouseDown on a button preserves the document selection)
  - 4 × `passed -> failed | Error: Unable to find role="dialog" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/combobox-tabs/test.ts::open popover with components tab initially selected, but not active)
- ariakit jsdom-26.1.0
  - 167 × `passed -> failed | TypeError: CSS?.supports is not a function` (e.g. root::app/src/sandbox/combobox-popover-modal-input/test.ts::closes the modal popover with Escape from the input inside it)
  - 11 × `passed -> failed | TestingLibraryElementError: Unable to find an accessible element with the role "dialog" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/dialog-combobox-command-menu/test.ts::open dialog with enter and hide by pressing enter on esc button)
  - 10 × `passed -> failed | ReferenceError: PointerEvent is not defined` (e.g. root::packages/ariakit-test/src/dispatch.jsdom.test.ts::dispatch.pointerDown initializes an event dispatched inside an iframe)
  - 8 × `passed -> failed | Error: Unable to find an accessible element with the role "menuitem" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/menu-initial-focus-changes/test.ts::gives the initial focus to the first item when a modal menu opens again after its first item was removed)
  - 5 × `failed -> passed | (own) TestingLibraryElementError: Unable to find an accessible element with the role "button" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/ariakit-ui-disclosure/test.ts::keeps a trailing badge beside the label)
  - 5 × `passed -> failed | AssertionError: expected [ 'pointerdown - - N', …(N) ] to deeply equal [ 'pointerdown N N N', …(N) ]` (e.g. root::packages/ariakit-test/src/click.test.ts::click with the auxiliary button dispatches auxclick instead of click)
  - 4 × `passed -> failed | Error: Unable to find role="dialog" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/combobox-tabs/test.ts::open popover with components tab initially selected, but not active)
  - 4 × `passed -> failed | TestingLibraryElementError: Unable to find an accessible element with the role "option" and name '(accessibleName, element) => {` (e.g. root::app/src/sandbox/combobox-tabs/test.ts::filter items and change tabs)
- ark-ui jsdom-20.0.3
  - 2 × `failed -> passed | (own) Error: expect(element).toHaveStyle()` (e.g. packages_react::packages/react/src/components/factory.test.tsx::Ark Factory should merge styles and classes)
  - 2 × `passed -> failed | Error: expect(element).toHaveStyle()` (e.g. packages_solid::packages/solid/src/components/factory.test.tsx::Ark Factory should merge styles)
- ark-ui jsdom-26.1.0
  - 1 × `failed -> passed | (own) Error: expect(element).toHaveValue(N.N)` (e.g. packages_react::packages/react/src/components/number-input/tests/number-input.test.tsx::NumberInput / Field prop: smallStep should use an explicit smallStep when Alt is held)
- ark-ui jsdom-30.1.2
  - 3 × `passed -> failed | Error: expect(element).toHaveFocus()` (e.g. packages_react::packages/react/src/components/signature-pad/tests/signature-pad.test.tsx::Signature Pad / Field should focus on signature pad when label is clicked)
  - 1 × `failed -> passed | (own) Error: expect(element).toHaveValue(N.N)` (e.g. packages_react::packages/react/src/components/number-input/tests/number-input.test.tsx::NumberInput / Field prop: smallStep should use an explicit smallStep when Alt is held)
- handsontable jsdom-26.1.0
  - 7717 × `passed -> missing | ` (e.g. handsontable::handsontable/src/translations/__tests__/indexMapper.unit.ts::IndexMapper should fill mappers with initial values at start)
- handsontable jsdom-30.1.2
  - 8031 × `passed -> missing | ` (e.g. handsontable::handsontable/src/translations/__tests__/indexMapper.unit.ts::IndexMapper should fill mappers with initial values at start)
- material-ui jsdom-20.0.3
  - 2 × `passed -> failed | AssertionError: expected SVGSVGElement{ …(N), [Symbol(impl)]: SVGSVGElementImpl{ …(N), …(N) } } to have computed style { fill: 'rgb(N, N, N)' }` (e.g. packages_mui-material::packages/mui-material/src/SvgIcon/SvgIcon.test.js::<SvgIcon /> should have `fill="currentColor"`)
  - 1 × `passed -> failed | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Clear"` (e.g. packages_mui-material::packages/mui-material/src/Autocomplete/Autocomplete.test.js::<Autocomplete /> prop: getOptionValue async options in freeSolo mode keeps the input empty after clicking Clear before options arrive)
  - 1 × `passed -> failed | AssertionError: expected div.MuiSelect-select.MuiSelect-outlined.MuiInputBase-input.MuiOutlinedInput-input.emotion-client-render-jbzNk-MuiNativeSelect-root-MuiSelect-select-MuiInputBase-input-MuiOutli` (e.g. packages_mui-material::packages/mui-material/src/Select/Select.test.js::<Select /> pointer interactions does not select an option when the opening mouseup lands on it before the drag delay)
- material-ui jsdom-26.1.0
  - 2 × `passed -> failed | AssertionError: expected SVGSVGElement{ …(N), [Symbol(impl)]: SVGSVGElementImpl{ …(N), …(N) } } to have computed style { fill: 'rgb(N, N, N)' }` (e.g. packages_mui-material::packages/mui-material/src/SvgIcon/SvgIcon.test.js::<SvgIcon /> should have `fill="currentColor"`)
  - 1 × `passed -> failed | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Clear"` (e.g. packages_mui-material::packages/mui-material/src/Autocomplete/Autocomplete.test.js::<Autocomplete /> prop: getOptionValue async options in freeSolo mode keeps the input empty after clicking Clear before options arrive)
- radix-primitives jsdom-20.0.3
  - 5 × `passed -> failed | AssertionError: expected "vi.fn()" to not be called at all, but actually been called N times` (e.g. root::packages/react/dismissable-layer/src/dismissable-layer.test.tsx::DismissableLayer defers touch pointer down outside dismissal until click)
  - 4 × `passed -> failed | Error: Unable to find an element with the text: Content One. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make yo` (e.g. root::packages/react/navigation-menu/src/navigation-menu.test.tsx::NavigationMenu activationMode "automatic" activationMode opens the item on pointer enter)
  - 1 × `passed -> failed | ReferenceError: PointerEvent is not defined` (e.g. root::packages/react/dismissable-layer/src/dismissable-layer.test.tsx::DismissableLayer treats a shadow tree inside the layer as inside)
  - 1 × `passed -> failed | AssertionError: expected 'translate(N, -N%)' to not deeply equal 'translate(N, -N%)'` (e.g. root::packages/react/context-menu/src/context-menu.test.tsx::rendering and opening re-anchors the content when re-triggered in a new location while open)
  - 1 × `passed -> failed | AssertionError: expected "vi.fn()" to be called N times, but got N times` (e.g. root::packages/react/slider/src/slider.test.tsx::Slider when dragging a range thumb to overlap another calls `onValueCommit` with the narrowed value)
- radix-primitives jsdom-26.1.0
  - 5 × `passed -> failed | AssertionError: expected "vi.fn()" to not be called at all, but actually been called N times` (e.g. root::packages/react/dismissable-layer/src/dismissable-layer.test.tsx::DismissableLayer defers touch pointer down outside dismissal until click)
  - 4 × `passed -> failed | Error: Unable to find an element with the text: Content One. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make yo` (e.g. root::packages/react/navigation-menu/src/navigation-menu.test.tsx::NavigationMenu activationMode "automatic" activationMode opens the item on pointer enter)
  - 1 × `passed -> failed | ReferenceError: PointerEvent is not defined` (e.g. root::packages/react/dismissable-layer/src/dismissable-layer.test.tsx::DismissableLayer treats a shadow tree inside the layer as inside)
  - 1 × `passed -> failed | AssertionError: expected "vi.fn()" to be called N times, but got N times` (e.g. root::packages/react/slider/src/slider.test.tsx::Slider when dragging a range thumb to overlap another calls `onValueCommit` with the narrowed value)
- react-spectrum jsdom-20.0.3
  - 6 × `passed -> failed | TypeError: AbortSignal.timeout is not a function` (e.g. root::packages/react-aria/test/utils/runAfterKeyboard.test.ts::runAfterKeyboard runAfterKeyboard flushes on resize end when the keyboard is opening)
  - 2 × `passed -> failed | AggregateError:` (e.g. root::packages/react-aria-components/test/Menu.test.tsx::Menu should support a context menu trigger)
  - 2 × `passed -> failed | Error: expect(jest.fn()).not.toHaveBeenCalled()` (e.g. root::packages/@adobe/react-spectrum/test/overlays/Popover.test.js::Popover v3 does not close when focus is lost with no replacement, such as switching tabs)
  - 1 × `passed -> failed | Error: expect(received).not.toBeNull()` (e.g. root::packages/@adobe/react-spectrum/test/picker/Picker.test.js::Picker closing does not close when focus is lost with no replacement, such as switching tabs)
  - 1 × `passed -> failed | Error: expect(received).toBe(expected) // Object.is equality` (e.g. root::packages/react-aria-components/test/Sheet.test.js::Sheet stacking tracks the stack index and descendants of nested sheets)
- react-spectrum jsdom-30.1.2
  - 122 × `passed -> missing | ` (e.g. root::packages/@adobe/react-spectrum/test/color/ColorArea.test.tsx::ColorArea Controlled attributes sets input props)
  - 55 × `passed -> failed | Error: expect(received).toEqual(expected) // deep equality` (e.g. root::packages/react-aria/test/overlays/calculatePosition.test.ts::calculatePosition placement = left no viewport offset Should calculate the correct position)
  - 25 × `passed -> failed | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)` (e.g. root::packages/@adobe/react-spectrum/test/numberfield/NumberField.test.js::NumberField advances automatically to the limit and not beyond)
  - 11 × `passed -> failed | TestingLibraryElementError: Unable to find an accessible element with the role "tooltip"` (e.g. root::packages/@adobe/react-spectrum/test/actiongroup/ActionGroup.test.js::ActionGroup buttonLabelBehavior should show the text in a tooltip with buttonLabelBehavior="hide")
  - 10 × `passed -> failed | Error: expect(received).toBe(expected) // Object.is equality` (e.g. root::packages/react-aria/test/interactions/usePress.test.js::usePress disable text-selection when pressed should not add user-select: none to the page when press start (non-iOS))
  - 9 × `passed -> failed | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)` (e.g. root::packages/@adobe/react-spectrum/test/numberfield/NumberField.test.js::NumberField advances automatically if the arrows are held down)
  - 5 × `passed -> failed | Error: expect(received).toStrictEqual(expected) // deep equality` (e.g. root::packages/react-aria/test/interactions/useMove.test.js::useMove mouse events responds to mouse events)
  - 3 × `passed -> failed | Error: expect(received).not.toBeNull()` (e.g. root::packages/react-aria/test/tooltip/useTooltip.test.js::useTooltip opens tooltip on hover after delay)
- svelte cssstyle-4.6.0
  - 8 × `passed -> failed | AssertionError: expected 'canvastext' to equal ''` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::css (dom))
  - 2 × `passed -> failed | AssertionError: expected 'url("https://example.com/foo.jpg")' to equal 'url(https://example.com/foo.jpg)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::attribute-url (dom))
  - 1 × `passed -> failed | AssertionError: expected '<div style="background-image: url(&qu…' to deeply equal '<div style="background-image: url(htt…'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-string-variable-kebab-case (dom))
  - 1 × `passed -> failed | AssertionError: expected 'url("https://raw.githubusercontent.co…' to equal 'url(https://raw.githubusercontent.com…'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-string-variable-kebab-case (hydrate))
- svelte jsdom-20.0.3
  - 22 × `passed -> failed | AssertionError: expected 'red' to equal 'rgb(N, N, N)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::css-comments (dom))
  - 6 × `passed -> failed | AssertionError: expected 'green' to equal 'rgb(N, N, N)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-spread-and-attr (dom))
  - 4 × `passed -> failed | AssertionError: expected 'blue' to equal 'rgb(N, N, N)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-spread (dom))
  - 2 × `passed -> failed | AssertionError: expected '' to equal 'rgba(N, N, N, N)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::css-space-in-attribute (dom))
  - 2 × `passed -> failed | AssertionError: expected null to equal ''` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::transition-css-and-js (dom))
  - 1 × `passed -> failed | AssertionError: expected [ true, true ] to deeply equal [ true, false ]` (e.g. root::packages/svelte/tests/runtime-runes/test.ts::form-default-value-select (hydrate))
  - 1 × `passed -> failed | AssertionError: expected [ 'MAIN', 'MAIN' ] to deeply equal [ 'MAIN' ]` (e.g. root::packages/svelte/tests/runtime-runes/test.ts::style-directive-mutations (hydrate))
- svelte jsdom-26.1.0
  - 8 × `passed -> failed | AssertionError: expected 'canvastext' to equal ''` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::css (dom))
  - 2 × `passed -> failed | AssertionError: expected 'url("https://example.com/foo.jpg")' to equal 'url(https://example.com/foo.jpg)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::attribute-url (dom))
  - 1 × `passed -> failed | AssertionError: expected '<div style="background-image: url(&qu…' to deeply equal '<div style="background-image: url(htt…'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-string-variable-kebab-case (dom))
  - 1 × `passed -> failed | AssertionError: expected 'url("https://raw.githubusercontent.co…' to equal 'url(https://raw.githubusercontent.com…'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-string-variable-kebab-case (hydrate))
- svelte jsdom-30.1.2
  - 8 × `passed -> failed | AssertionError: expected 'rgb(N, N, N)' to equal ''` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::css (dom))
  - 4 × `passed -> failed | AssertionError: expected '<hN>Outside</hN>\n<button style="opac…' to deeply equal '<hN>Outside</hN>\n<button style="opac…'` (e.g. root::packages/svelte/tests/runtime-runes/test.ts::dynamic-component-transition (dom))
  - 2 × `passed -> failed | AssertionError: expected 'url("https://example.com/foo.jpg")' to equal 'url(https://example.com/foo.jpg)'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::attribute-url (dom))
  - 2 × `passed -> failed | AssertionError: expected '<p>foo</p>\n<p class="red svelte-xyzN…' to deeply equal '<p>foo</p>\n<p class="red svelte-xyzN…'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::class-shortcut-with-transition (dom))
  - 2 × `passed -> failed | AssertionError: expected '<div style="background-image: none; b…' to deeply equal '<div style=""></div>'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-become-undefined (dom))
  - 2 × `passed -> failed | AssertionError: expected 'Npx' to equal 'Nvh'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-multiple (dom))
  - 2 × `passed -> failed | AssertionError: expected 'Npx solid rgb(N, N, N)' to equal 'Npx solid pink'` (e.g. root::packages/svelte/tests/runtime-legacy/test.ts::inline-style-directive-string-variable (dom))
  - 2 × `passed -> failed | AssertionError: expected '<button>hide</button>\n<div style="op…' to deeply equal '<button>hide</button>\n<div style="op…'` (e.g. root::packages/svelte/tests/runtime-runes/test.ts::if-transition-inert (dom))
- vuetify jsdom-20.0.3
  - 8 × `passed -> failed | Error: Unexpected console.warn message: [Vue warn]: Failed to resolve directive: ripple` (e.g. packages_vuetify::packages/vuetify/src/components/VCheckbox/__tests__/VCheckbox.spec.tsx::VCheckbox hide-details behavior should not have aria-describedby when hide-details is true)
  - 2 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.findAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.date.spec.ts::week numbers with time zone should calculate weeks correctly near ST/DST transition)
  - 2 × `passed -> failed | Error: Unexpected console.warn message: [Vue warn]: Failed to resolve directive: intersect` (e.g. packages_vuetify::packages/vuetify/src/components/VTextarea/__tests__/VTextarea.spec.tsx::VTextarea has affixed icons)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.queryAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should have aria-current="date" on today's date)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.getAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should have aria-labels on date buttons)
  - 1 × `passed -> failed | AssertionError: expected undefined to be truthy` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should use full month name for aria-labels in month selection)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.getByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDefaultsProvider/__tests__/VDefaultsProvider.spec.tsx::VDefaultsProvider should apply new defaults)
- vuetify jsdom-26.1.0
  - 8 × `passed -> failed | Error: Unexpected console.warn message: [Vue warn]: Failed to resolve directive: ripple` (e.g. packages_vuetify::packages/vuetify/src/components/VCheckbox/__tests__/VCheckbox.spec.tsx::VCheckbox hide-details behavior should not have aria-describedby when hide-details is true)
  - 2 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.findAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.date.spec.ts::week numbers with time zone should calculate weeks correctly near ST/DST transition)
  - 2 × `passed -> failed | Error: Unexpected console.warn message: [Vue warn]: Failed to resolve directive: intersect` (e.g. packages_vuetify::packages/vuetify/src/components/VTextarea/__tests__/VTextarea.spec.tsx::VTextarea has affixed icons)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.queryAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should have aria-current="date" on today's date)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.getAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should have aria-labels on date buttons)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.getByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDefaultsProvider/__tests__/VDefaultsProvider.spec.tsx::VDefaultsProvider should apply new defaults)
- vuetify jsdom-30.1.2
  - 8 × `passed -> failed | Error: Unexpected console.warn message: [Vue warn]: Failed to resolve directive: ripple` (e.g. packages_vuetify::packages/vuetify/src/components/VCheckbox/__tests__/VCheckbox.spec.tsx::VCheckbox hide-details behavior should not have aria-describedby when hide-details is true)
  - 2 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.findAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.date.spec.ts::week numbers with time zone should calculate weeks correctly near ST/DST transition)
  - 2 × `passed -> failed | Error: Unexpected console.warn message: [Vue warn]: Failed to resolve directive: intersect` (e.g. packages_vuetify::packages/vuetify/src/components/VTextarea/__tests__/VTextarea.spec.tsx::VTextarea has affixed icons)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.queryAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should have aria-current="date" on today's date)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.getAllByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDatePicker/__tests__/VDatePicker.a11y.spec.tsx::VDatePicker accessibility should have aria-labels on date buttons)
  - 1 × `passed -> failed | TypeError: __vite_ssr_import_N__.screen.getByCSS is not a function` (e.g. packages_vuetify::packages/vuetify/src/components/VDefaultsProvider/__tests__/VDefaultsProvider.spec.tsx::VDefaultsProvider should apply new defaults)
