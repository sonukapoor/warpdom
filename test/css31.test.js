// jsdom 31's declaration blocks (css31.js), checked against jsdom 31.0.1:
// longhands only, a shorthand written when all its longhands are there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

// Each case: a style attribute's text, or a script run on an element's
// style (s). The result: cssText, the items, and reads of names.
const block = (cases, names) => (w) =>
  cases.map((text) => {
    const el = w.document.createElement('div');
    if (typeof text === 'function') text(el.style);
    else el.setAttribute('style', text);
    const items = [];
    for (let i = 0; i < el.style.length; i++) items.push(el.style.item(i));
    return [
      el.style.cssText,
      items.join(' '),
      ...names.map((n) => `${n}=${el.style.getPropertyValue(n)}${el.style.getPropertyPriority(n) ? '!' : ''}`),
    ];
  });

parity(
  'jsdom 31: a block holds longhands; parsed, a declaration given again moves to the end',
  block(
    [
      'margin:1px',
      'margin-top:1px;margin-right:2px;margin-bottom:3px',
      'margin-left:4px;color:red;margin-top:1px;margin-right:2px;margin-bottom:3px',
      'margin:1px;margin-top:2px !important',
      'margin:1px !important;margin-top:2px',
      'color:red !important;color:blue',
      'color:red;color:blue !important;color:green',
      'color:red !important;width:1px;color:blue !important',
      'color:red;width:1px;color:blue',
      'margin:1px;width:1px;margin-top:2px',
      'width:1px;margin:1px;width:2px;margin:2px',
      'margin: 1px 2px; padding: 0',
      'COLOR: blue',
    ],
    ['margin', 'margin-top', 'color'],
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: writes change a declaration in place',
  block(
    [
      (s) => {
        s.margin = '1px';
        s.marginTop = '4px';
      },
      (s) => {
        s.margin = '1px';
        s.removeProperty('margin-right');
      },
      (s) => {
        s.color = 'red';
        s.margin = '1px';
        s.color = 'blue';
      },
      (s) => {
        s.cssText = 'color:red;width:1px';
        s.setProperty('color', 'blue');
      },
      (s) => {
        s.setProperty('color', 'red', 'important');
        s.width = '1px';
        s.color = 'blue';
      },
      (s) => {
        s.setProperty('margin', '1px', 'important');
        s.marginTop = '2px';
      },
      (s) => {
        s.margin = '1px';
        s.marginTop = '';
      },
      (s) => {
        s.margin = '1px';
        s.removeProperty('margin');
      },
    ],
    ['margin', 'margin-top', 'color'],
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: var() in a shorthand leaves its longhands pending',
  block(
    ['margin:var(--x)', 'margin:var(--x);margin-top:1px', 'font:caption'],
    ['margin', 'margin-top', 'font', 'font-variant'],
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: border, outline and radius shorthands',
  block(
    [
      'border:1px solid red',
      'border:1px solid',
      'border:none',
      'border-top:1px solid red',
      'border-width:1px;border-style:solid;border-color:red',
      'border-width:1px;border-style:solid;border-color:red;border-image:none',
      'border:1px solid red;border-left-color:blue',
      'border-top:1px solid red;border-right:1px solid red;border-bottom:1px solid red;border-left:1px solid red',
      'border-radius:4px',
      'border-radius:4px 2px/3px',
      'outline:none',
      'outline:1px solid red',
    ],
    ['border', 'border-top', 'border-width', 'border-color', 'outline'],
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: flex, font and background shorthands',
  block(
    [
      'flex:1',
      'flex:auto',
      'font:12px Arial',
      'font:bold 12px/1.5 Arial, sans-serif',
      'font:oblique condensed 10px serif',
      'font:small-caps 700 10px/2 serif',
      'font:10px serif;font-variant-caps:all-small-caps',
      'font:10px serif;font-kerning:none',
      'background:none',
      'background:transparent',
      'background:red',
      'background: red url(a.png)',
      'background:url(a.png) center / cover no-repeat fixed content-box padding-box blue',
      'background:url(a.png) 10px 20px repeat-x',
      'background:url(a.png), url(b.png) red',
      'background:border-box',
      'background:content-box',
      'background:padding-box content-box',
      'background:red;background-blend-mode:multiply',
      'background:url(a.png);background-image:url(b.png),url(c.png)',
      'background-position: left, center 10px',
      (s) => {
        s.backgroundRepeat = 'repeat-x';
      },
      (s) => {
        s.backgroundRepeat = 'space round';
      },
    ],
    ['flex', 'font', 'font-variant', 'background', 'background-position', 'background-repeat'],
  ),
  { jsdom: 31 },
);

// A write that changes nothing changes the style attribute neither (CSSOM).
parity(
  'jsdom 31: a write that changes nothing queues no attribute record',
  async (w) => {
    const el = w.document.createElement('div');
    const records = [];
    new w.MutationObserver((list) => records.push(...list.map((r) => r.oldValue))).observe(el, {
      attributes: true,
      attributeOldValue: true,
    });
    el.style.height = '100px';
    await Promise.resolve();
    el.style.height = '100px';
    el.style.setProperty('margin', '1px');
    await Promise.resolve();
    el.style.margin = '1px';
    await Promise.resolve();
    return records;
  },
  { jsdom: 31 },
);

// #322 review: font keywords only before the size, font-variant and
// border-image expanded, calc() corners whole, logical declarations
// between longhands, names jsdom 31 drops, pending values changed.
parity(
  'jsdom 31: font-variant, border-image, radii and logical properties',
  block(
    [
      'font: 700 small-caps 12px serif',
      'font: 700 condensed 12px serif',
      'font: medium condensed',
      'font: 12px small-caps',
      'font-variant: small-caps',
      'font-variant: small-caps oldstyle-nums',
      'font-variant: none',
      'border-image: url(a.png) 30 / 10px',
      'border-image: url(a.png) 30 / 10px / 2px round',
      'border-image: url(a.png)',
      (s) => {
        s.borderImage = 'none';
        s.borderImageWidth = '2';
      },
      (s) => {
        s.borderImage = 'none';
        s.borderImageOutset = '1px';
      },
      (s) => {
        s.borderImage = 'none';
        s.borderImageSlice = '30 fill';
      },
      'border-top-left-radius: calc(2% + 10px); border-top-right-radius: 1px; border-bottom-right-radius: 1px; border-bottom-left-radius: 1px',
      'margin-top: 1px; margin-block-end: 2px; margin-right: 1px; margin-bottom: 1px; margin-left: 1px',
      'margin-block-end: 2px; margin-top: 1px; margin-right: 1px; margin-bottom: 1px; margin-left: 1px',
      (s) => {
        s.cueBefore = 'initial';
      },
      'vertical-align: 10px',
      'vertical-align: middle',
      'vertical-align: 0',
      (s) => {
        s.verticalAlign = 'top';
        s.baselineShift = '2px';
      },
      'margin-inline: 1px 2px',
      'padding-block: 0 4px',
    ],
    [
      'font',
      'font-variant',
      'border-image',
      'border-radius',
      'margin',
      'vertical-align',
      'baseline-shift',
      'margin-inline-end',
    ],
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: a shorthand with var() written again with another value',
  (w) => {
    const el = w.document.createElement('div');
    const out = [];
    for (const value of ['var(--a)', 'var(--b)', 'var(--b)']) {
      el.style.margin = value;
      out.push(el.getAttribute('style'), el.style.margin);
    }
    return out;
  },
  { jsdom: 31 },
);

// #322 review, second round: font-variant's none alone, corners of both
// mappings, two-corner shorthands, independent border sides, a shorthand
// written with a comment between its tokens.
parity(
  'jsdom 31: corners, font-variant none and commented shorthand writes',
  block(
    [
      (s) => {
        s.fontVariant = 'none';
        s.fontVariantCaps = 'small-caps';
      },
      'border-top-left-radius:1px;border-top-right-radius:1px;border-end-end-radius:2px;border-bottom-right-radius:1px;border-bottom-left-radius:1px',
      'border-top-left-radius:1px;border-top-right-radius:2px',
      'border-top-left-radius:1px 3px;border-top-right-radius:2px',
      'border-start-start-radius:1px;border-start-end-radius:2px',
      'corner-top-left-shape:round;corner-top-right-shape:round;corner-end-end-shape:bevel;corner-bottom-right-shape:round;corner-bottom-left-shape:round',
      'border-top-width: 1px; border-right-width: 2px; border-top-style: solid; border-top-color: red',
      'border-top-radius: 1px 2px / 3px',
      'border-left-radius: 1px / 2px 3px',
      'border-inline-end-radius: 0 4px',
      'corner-top-shape: round bevel',
      'border-radius: 0 4px',
      'border-top-left-radius:1px 3px;border-top-right-radius:2px 4px;corner-top-left-shape:round;corner-top-right-shape:bevel',
      'border-top-left-radius:1px;corner-top-left-shape:bevel',
      'border-radius:1px;corner-shape:bevel',
      'corner: 1px 2px / 3px bevel scoop',
      'corner-top: bevel 1px 2px',
      'corner-top-left: 1px / 2px notch',
      'border-top-left-radius: calc(2% + 10px) 3px; corner-top-left-shape: bevel',
      'corner-block-start: 1px 2px squircle',
      'margin-top:1px;--a:1;margin-right:1px;margin-bottom:1px;margin-left:1px',
      (s) => {
        s.setProperty('margin', '1px/**/2px');
      },
      (s) => {
        s.margin = 'var(--m)';
        s.marginLeft = '1px';
      },
    ],
    [
      'font-variant',
      'border-radius',
      'border-top-radius',
      'border-top',
      'margin',
      'corner',
      'corner-top',
      'corner-top-left',
    ],
  ),
  { jsdom: 31 },
);

// A slash inside calc() is no radius separator (#322 review). jsdom 31
// simplifies calc(1em / 2) to calc(0.5em), not modeled yet, so this one is
// checked on warpdom alone: the vertical radius stays.
test('jsdom 31: a corner radius with a division in calc() keeps its vertical radius', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const el = w.document.createElement('div');
  el.setAttribute('style', 'border-top-left-radius: calc(1em / 2) 3px; corner-top-left-shape: bevel');
  assert.equal(el.style.cssText, 'corner-top-left: calc(1em / 2) 3px bevel;');
  el.setAttribute('style', 'corner-top-left: calc(1em / 2) 3px');
  assert.equal(el.style.borderTopLeftRadius, 'calc(1em / 2) 3px');
});
