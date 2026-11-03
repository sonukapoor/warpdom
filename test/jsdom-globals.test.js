// The globals of a jsdom profile (#208): warpdom has some interfaces before
// the jsdom it follows exposes them; the window leaves those globals out,
// unless option beyondJsdom keeps them. The interfaces stay: objects of
// them work as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

// Every global warpdom has that some modeled jsdom lacks.
const LATER = [
  'BeforeUnloadEvent',
  'CSSConditionRule',
  'CSSContainerRule',
  'CSSCounterStyleRule',
  'CSSFontFaceRule',
  'CSSGroupingRule',
  'CSSKeyframeRule',
  'CSSKeyframesRule',
  'CSSLayerBlockRule',
  'CSSLayerStatementRule',
  'CSSMarginRule',
  'CSSNamespaceRule',
  'CSSPageDescriptors',
  'CSSPageRule',
  'CSSScopeRule',
  'CSSSupportsRule',
  'DOMRect',
  'DOMRectReadOnly',
  'FormDataEvent',
  'QuotaExceededError',
  'TimeRanges',
  'ToggleEvent',
];
const present = (w) => LATER.filter((name) => Object.hasOwn(w, name) && typeof w[name] === 'function');

for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30])
  parity(`globals: the interfaces jsdom ${jsdom} exposes`, (w) => present(w), { jsdom });

// The releases where the set changes (black box, jsdom 20.0.0 to 30.1.3;
// those parity does not load measured once, with the same probe).
const CSS_27_2 = [
  'CSSConditionRule',
  'CSSContainerRule',
  'CSSGroupingRule',
  'CSSLayerBlockRule',
  'CSSLayerStatementRule',
  'CSSScopeRule',
  'CSSSupportsRule',
];
const CSS_29 = [
  'CSSCounterStyleRule',
  'CSSFontFaceRule',
  'CSSKeyframeRule',
  'CSSKeyframesRule',
  'CSSNamespaceRule',
  'CSSPageRule',
];
const RECTS = ['DOMRect', 'DOMRectReadOnly'];
const MEASURED = {
  '21.1.2': [],
  '22.0.0': RECTS,
  '26.1.0': RECTS,
  '27.0.0': [...RECTS, 'BeforeUnloadEvent'],
  '27.1.0': [...RECTS, 'BeforeUnloadEvent'],
  '27.2.0': [...RECTS, 'BeforeUnloadEvent', ...CSS_27_2],
  '28.1.0': [...RECTS, 'BeforeUnloadEvent', ...CSS_27_2],
  '29.0.0': [...RECTS, 'BeforeUnloadEvent', ...CSS_27_2, ...CSS_29],
  '30.0.1': [...RECTS, 'BeforeUnloadEvent', ...CSS_27_2, ...CSS_29],
  '30.1.0': [...RECTS, 'BeforeUnloadEvent', ...CSS_27_2, ...CSS_29, 'QuotaExceededError'],
};
test('globals: the interfaces each jsdom release exposes', () => {
  for (const [jsdom, names] of Object.entries(MEASURED))
    assert.deepEqual(present(createWindow({ jsdom })), [...names].sort(), `jsdom ${jsdom}`);
});

test('globals: beyondJsdom keeps every interface warpdom has, in frames too', () => {
  for (const jsdom of [20, 26, 28, 30, '30.0.1']) {
    const w = createWindow({ jsdom, beyondJsdom: true });
    assert.deepEqual(present(w), LATER, `jsdom ${jsdom}`);
    const frame = w.document.body.appendChild(w.document.createElement('iframe'));
    assert.deepEqual(present(frame.contentWindow), LATER, `a frame, jsdom ${jsdom}`);
  }
  const frame = createWindow({ jsdom: 26 }).document.createElement('iframe');
  frame.ownerDocument.body.append(frame);
  assert.deepEqual(present(frame.contentWindow), RECTS, 'a frame, jsdom 26');
});

// Objects of an interface whose global is left out keep it.
for (const jsdom of [20, 26, 28])
  parity(
    `globals: a sheet's rules keep their interfaces (jsdom ${jsdom})`,
    (w) => {
      const style = w.document.createElement('style');
      style.textContent =
        '@keyframes a { from { color: red } } @font-face { font-family: x } @supports (display: grid) { p { color: red } }';
      w.document.head.append(style);
      return [...style.sheet.cssRules].map((rule) => [
        rule.constructor.name,
        rule.type,
        rule instanceof rule.constructor,
        rule instanceof w.CSSRule,
      ]);
    },
    { jsdom },
  );

test('globals: objects of interfaces left out (jsdom 20)', async () => {
  const w = createWindow({ jsdom: 20, url: 'http://localhost/' });
  const { document } = w;
  const rect = document.createRange().getBoundingClientRect();
  assert.equal(Object.prototype.toString.call(rect), '[object DOMRect]');
  assert.equal(rect.constructor.name, 'DOMRect');
  assert.equal(rect.width, 0);
  assert.equal(document.createEvent('beforeunloadevent').constructor.name, 'BeforeUnloadEvent');
  assert.equal(Object.getPrototypeOf(document.createElement('video').buffered).constructor.name, 'TimeRanges');

  const form = document.body.appendChild(document.createElement('form'));
  const events = [];
  form.addEventListener('formdata', (e) => events.push([e.constructor.name, e.formData instanceof w.FormData]));
  new w.FormData(form);
  assert.deepEqual(events, [['FormDataEvent', true]]);

  const details = document.body.appendChild(document.createElement('details'));
  const toggled = new Promise((resolve) => details.addEventListener('toggle', resolve));
  details.open = true;
  assert.equal((await toggled).constructor.name, 'ToggleEvent');

  assert.throws(
    () => w.localStorage.setItem('x', 'y'.repeat(5_000_001)),
    (e) => e instanceof w.DOMException && e.name === 'QuotaExceededError',
  );
});

test('globals: Vitest environmentOptions.warpdom.beyondJsdom', async () => {
  const { default: environment } = await import('../src/vitest.js');
  for (const [options, names] of [
    [{ warpdom: { jsdom: 26 } }, RECTS],
    [{ warpdom: { jsdom: 26, beyondJsdom: true } }, LATER],
    [{ warpdom: { jsdom: 26, beyondJsdom: 'yes' } }, RECTS],
  ]) {
    const global = {};
    const result = environment.setup(global, options);
    try {
      assert.deepEqual(
        LATER.filter((name) => typeof global[name] === 'function'),
        names,
        JSON.stringify(options),
      );
    } finally {
      result.teardown();
    }
  }
});
