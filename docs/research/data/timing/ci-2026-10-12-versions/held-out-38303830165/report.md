**jsdom version dependence** (jsdom only; tests and files whose status differs from the project's own jsdom (own-a), flaky ones left out: those that differ between own-a and own-b; own-b's row shows the flaky counts)

| Suite | variant | jsdom resolved | forced | tests | tests differing | files differing | flaky tests / files | seconds | NA reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dom-testing-library | own-a | 20.0.0 (cssstyle 2.3.0) | — | 657 | 0 | 0 | 0 / 0 | 8.2 |  |
| dom-testing-library | own-b | 20.0.0 (cssstyle 2.3.0) | — | 657 | 0 | 0 | 0 / 0 | 6.8 |  |
| dom-testing-library | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 657 | 1 | 1 | 0 / 0 | 6.8 |  |
| dom-testing-library | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 657 | 1 | 1 | 0 / 0 | 6.2 |  |
| dom-testing-library | jsdom-30.1.2 | 30.1.2 | yes | 0 | 657 | 26 | 0 / 0 | 1.3 |  |
| downshift | own-a | 20.0.3 (cssstyle 2.3.0) | — | 1110 | 0 | 0 | 0 / 0 | 17.6 |  |
| downshift | own-b | 20.0.3 (cssstyle 2.3.0) | — | 1110 | 0 | 0 | 0 / 0 | 14.3 |  |
| downshift | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 1110 | 0 | 0 | 0 / 0 | 14 |  |
| downshift | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 1110 | 0 | 0 | 0 / 0 | 10.7 |  |
| downshift | jsdom-30.1.2 | 30.1.2 | yes | 0 | 1110 | 92 | 0 / 0 | 1.2 |  |
| melt-ui | own-a | 24.0.0 (cssstyle 4.0.1) | — | 770 | 0 | 0 | 0 / 0 | 99.8 |  |
| melt-ui | own-b | 24.0.0 (cssstyle 4.0.1) | — | 770 | 0 | 0 | 0 / 0 | 47 |  |
| melt-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 770 | 1 | 1 | 0 / 0 | 52.5 |  |
| melt-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 770 | 0 | 0 | 0 / 0 | 50.5 |  |
| melt-ui | jsdom-30.1.2 | 30.1.2 (cssstyle 4.6.0) | yes | 770 | 0 | 0 | 0 / 0 | 62.9 |  |
| naive-ui | own-a | 27.4.0 (cssstyle 5.2.1) | — | 1246 | 0 | 0 | 0 / 0 | 247 |  |
| naive-ui | own-b | 27.4.0 (cssstyle 5.2.1) | — | 1246 | 0 | 0 | 0 / 0 | 248.4 |  |
| naive-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 5.2.1) | yes | 1246 | 1 | 1 | 0 / 0 | 244 |  |
| naive-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 5.2.1) | yes | 1246 | 0 | 0 | 0 / 0 | 244.3 |  |
| naive-ui | jsdom-30.1.2 | 30.1.2 | yes | 1246 | 0 | 0 | 0 / 0 | 255 |  |
| react-router | own-a | 26.1.0 (cssstyle 4.6.0) | — | 2446 | 0 | 0 | 0 / 0 | 60.9 |  |
| react-router | own-b | 26.1.0 (cssstyle 4.6.0) | — | 2446 | 0 | 0 | 0 / 0 | 54.7 |  |
| react-router | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 2446 | 16 | 2 | 0 / 0 | 55.8 |  |
| react-router | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 2446 | 0 | 0 | 0 / 0 | 53.5 |  |
| react-router | jsdom-30.1.2 | 30.1.2 | yes | 1042 | 1404 | 38 | 0 / 0 | 33.2 |  |
| solid-primitives | own-a | 25.0.1 (cssstyle 4.4.0) | — | 901 | 0 | 0 | 0 / 0 | 4 |  |
| solid-primitives | own-b | 25.0.1 (cssstyle 4.4.0) | — | 901 | 0 | 0 | 0 / 0 | 4.1 |  |
| solid-primitives | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 901 | 0 | 0 | 0 / 0 | 3.7 |  |
| solid-primitives | jsdom-26.1.0 | 26.1.0 (cssstyle 4.4.0) | yes | 901 | 0 | 0 | 0 / 0 | 3.9 |  |
| solid-primitives | jsdom-30.1.2 | 30.1.2 (cssstyle 4.4.0) | yes | 901 | 0 | 0 | 0 / 0 | 4.3 |  |
| taiga-ui | own-a | 20.0.3 (cssstyle 2.3.0) | — | 2604 | 0 | 0 | 0 / 0 | 612.7 |  |
| taiga-ui | own-b | 20.0.3 (cssstyle 2.3.0) | — | 2604 | 0 | 0 | 0 / 0 | 588.7 |  |
| taiga-ui | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 2604 | 0 | 0 | 0 / 0 | 588 |  |
| taiga-ui | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 2604 | 0 | 0 | 0 / 0 | 587.7 |  |
| taiga-ui | jsdom-30.1.2 | — | yes | — | NA | NA | 0 / 0 | — | install failed: npm error code ETARGET npm error notarget No matching version found for jsdom@30.1.2 with a date before 9/28/2026, 11:45:50 PM. |
| tanstack-query | own-a | 27.4.0 (cssstyle 5.3.7) | — | 2831 | 0 | 0 | 0 / 0 | 102.2 |  |
| tanstack-query | own-b | 27.4.0 (cssstyle 5.3.7) | — | 2831 | 0 | 0 | 0 / 0 | 101.5 |  |
| tanstack-query | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 2831 | 1 | 1 | 0 / 0 | 87.2 |  |
| tanstack-query | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 2831 | 0 | 0 | 0 / 0 | 89.9 |  |
| tanstack-query | jsdom-30.1.2 | 30.1.2 | yes | 2831 | 1 | 1 | 0 / 0 | 109.4 |  |
| vueuse | own-a | 30.0.1 | — | 940 | 0 | 0 | 0 / 0 | 80.3 |  |
| vueuse | own-b | 30.0.1 | — | 940 | 0 | 0 | 0 / 0 | 80.2 |  |
| vueuse | jsdom-20.0.3 | 20.0.3 (cssstyle 2.3.0) | yes | 940 | 5 | 2 | 0 / 0 | 59.4 |  |
| vueuse | jsdom-26.1.0 | 26.1.0 (cssstyle 4.6.0) | yes | 940 | 0 | 0 | 0 / 0 | 60 |  |
| vueuse | jsdom-30.1.2 | 30.1.2 | yes | 940 | 0 | 0 | 0 / 0 | 77.5 |  |

| Suite | own-b | jsdom-20.0.3 | jsdom-26.1.0 | jsdom-30.1.2 |
| --- | --- | --- | --- | --- |
| dom-testing-library | 0 (0 files) | 1 (1 files) | 1 (1 files) | 657 (26 files) |
| downshift | 0 (0 files) | 0 (0 files) | 0 (0 files) | 1110 (92 files) |
| melt-ui | 0 (0 files) | 1 (1 files) | 0 (0 files) | 0 (0 files) |
| naive-ui | 0 (0 files) | 1 (1 files) | 0 (0 files) | 0 (0 files) |
| react-router | 0 (0 files) | 16 (2 files) | 0 (0 files) | 1404 (38 files) |
| solid-primitives | 0 (0 files) | 0 (0 files) | 0 (0 files) | 0 (0 files) |
| taiga-ui | 0 (0 files) | 0 (0 files) | 0 (0 files) | NA |
| tanstack-query | 0 (0 files) | 1 (1 files) | 0 (0 files) | 1 (1 files) |
| vueuse | 0 (0 files) | 5 (2 files) | 0 (0 files) | 0 (0 files) |

**Differing tests by first error line** (largest groups first, at most 8 per suite and variant)

- dom-testing-library jsdom-20.0.3
  - 1 × `passed -> failed | Error: expect(received).toEqual(expected) // deep equality` (e.g. root::src/__tests__/ariaAttributes.js::`selected: true` matches `aria-selected="true"` on supported roles)
- dom-testing-library jsdom-26.1.0
  - 1 × `passed -> failed | Error: expect(received).toMatch(expected)` (e.g. root::src/__tests__/role.js::configuration can be configured to consider ::before and ::after for accessible names which logs errors in jsdom)
- dom-testing-library jsdom-30.1.2
  - 657 × `passed -> missing | ` (e.g. root::src/__tests__/element-queries.js::query can return null)
- downshift jsdom-30.1.2
  - 1110 × `passed -> missing | ` (e.g. root::src/hooks/useSelect/__tests__/getToggleButtonProps.test.js::getToggleButtonProps hook props returns an object with some default props)
- melt-ui jsdom-20.0.3
  - 1 × `passed -> failed | expect(element).not.toBeVisible()` (e.g. root::src/tests/popover/Popover.spec.ts:: Popover (Default) Closes when click outside content)
- naive-ui jsdom-20.0.3
  - 1 × `passed -> failed | AssertionError: expected "vi.fn()" to not be called at all, but actually been called N times` (e.g. root::src/input/tests/Input.spec.tsx::n-input should work with `blur` `focus` `select` methods)
- react-router jsdom-20.0.3
  - 10 × `passed -> failed | Error: expect(received).toEqual(expected) // deep equality` (e.g. packages_react-router::packages/react-router/__tests__/dom/data-browser-router-test.tsx::Router: <DataBrowserRouter> basename supports a basename on <Form method="get">)
  - 2 × `passed -> failed | Error: Unable to find an element with the text: loading. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your m` (e.g. packages_react-router::packages/react-router/__tests__/dom/data-browser-router-test.tsx::Router: <DataBrowserRouter> submissions allows a button to override the <form method>)
  - 2 × `passed -> failed | Error: Unable to find an element with the text: Yes. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your match` (e.g. packages_react-router::packages/react-router/__tests__/dom/data-browser-router-test.tsx::Router: <DataBrowserRouter> submissions allows a button to override the <form action>)
  - 2 × `passed -> failed | Error: expect(received).toBe(expected) // Object.is equality` (e.g. packages_react-router::packages/react-router/__tests__/dom/data-browser-router-test.tsx::Router: <DataBrowserRouter> useSubmit/Form FormData includes submit button name/value on form submission)
- react-router jsdom-30.1.2
  - 1404 × `passed -> missing | ` (e.g. packages_react-router::packages/react-router/__tests__/router/fetchers-test.ts::fetchers fetcher states unabstracted loader fetch)
- tanstack-query jsdom-20.0.3
  - 1 × `passed -> failed | TypeError: DOMRectReadOnly is not a constructor` (e.g. packages_query-devtools::packages/query-devtools/src/__tests__/Devtools.test.tsx::Devtools should keep measured panel widths independent)
- tanstack-query jsdom-30.1.2
  - 1 × `passed -> failed | AssertionError: expected '' to be '.next { color: blue; }' // Object.is equality` (e.g. packages_query-devtools::packages/query-devtools/src/__tests__/contexts/PiPContext.test.tsx::PiPContext "#_goober" MutationObserver should copy parent "#_goober" "textContent" into the PiP mirror when the observer fires)
- vueuse jsdom-20.0.3
  - 2 × `passed -> failed | AssertionError: expected "vi.fn()" to be called +N times, but got N times` (e.g. root::packages/core/onLongPress/index.test.ts::onLongPress given argument is ref given options should trigger longpress if pointer is moved)
  - 2 × `passed -> failed | AssertionError: expected "vi.fn()" to be called with arguments: [ Any<Number>, +N, false, …(N) ]` (e.g. root::packages/core/onLongPress/index.test.ts::onLongPress given argument is ref given options should trigger onMouseUp when pointer is released)
  - 1 × `passed -> failed | AssertionError: expected 'blue' to be 'red' // Object.is equality` (e.g. root::packages/core/useCssVar/index.test.ts::useCssVar should work when changing CSS variable name)
