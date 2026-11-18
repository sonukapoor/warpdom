// jsdom 31's @layer and @scope in the cascade (cascade.js layerKeys,
// scopedMatch, ruleWinner31), checked against jsdom 31.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

const HTML =
  '<div class="a" id="a"><div class="b" id="b"><p id="p1">x</p><div class="a" id="a2"><p id="p2">y</p></div></div><p id="p3">z</p></div>' +
  '<p id="p4">w</p><div id="t" class="c"><p>x</p></div>';
const IDS = ['a', 'b', 'p1', 'a2', 'p2', 'p3', 'p4', 't'];
// Each [css, style attribute of #t]: the color and margin-top of each element.
const cases = (list) => (w) => {
  const d = w.document;
  return list.map(([css, attr]) => {
    d.head.innerHTML = `<style>${css}</style>`;
    d.body.innerHTML = HTML;
    if (attr) d.getElementById('t').setAttribute('style', attr);
    return [
      css,
      attr ?? '',
      ...IDS.map((id) => {
        const cs = w.getComputedStyle(d.getElementById(id));
        return `${cs.color} ${cs.marginTop}`;
      }),
    ];
  });
};

parity(
  'jsdom 31: @layer: unlayered over layered, later layers over earlier, !important the other way round',
  cases([
    ['@layer a { #t { color: red } } div { color: blue }'],
    ['@layer a { .c.c.c { color: red } } div { color: blue }'],
    ['@layer a { #t { color: red !important } } div { color: blue !important }'],
    ['@layer a, b; @layer b { div { color: red } } @layer a { #t { color: blue } }'],
    ['@layer a, b; @layer b { div { color: red !important } } @layer a { div { color: blue !important } }'],
    [
      '@layer a { div { color: red !important } } @layer b { div { color: blue !important } } div { color: green !important }',
    ],
    ['@layer { div { color: red } } @layer { div { color: blue } }'],
    ['@layer a { @layer x { div { color: red } } div { color: blue } }'],
    ['@layer a.x { div { color: red } } @layer a { div { color: blue } }'],
    ['@layer b { div { color: red } } @layer a { div { color: blue } } @layer b { #t { color: green } }'],
    ['@layer a { div { color: red } } @layer b { div { color: blue } } @layer a { div { color: green } }'],
    ['@layer b { div { color: red } } @layer a.x { div { color: blue } } @layer a { div { color: green } }'],
    ['@layer a { @layer x { div { color: red } } } @layer b { @layer x { div { color: blue } } }'],
    ['@layer a.x { div { color: red } } @layer a.y { div { color: blue } } @layer a.x { #t { color: green } }'],
    ['@media print { @layer b {} } @layer a { div { color: red } } @layer b { div { color: blue } }'],
    ['@layer a { #t { color: red !important } }', 'color: blue !important'],
    ['@layer a { #t { color: red !important } }', 'color: blue'],
    ['@layer { div { margin-top: 3px } } @layer { div { margin-block-start: 5px } }'],
    ['@layer a { div { margin-block-start: 5px } } div { margin-top: 3px }'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: revert-layer rolls back to the layers below, then to the user agent sheet',
  cases([
    ['@layer a { div { color: red } } @layer b { div { color: revert-layer } }'],
    ['@layer a { div { color: red } } div { color: revert-layer }'],
    ['@layer a { div { color: red } } @layer b { div { color: revert-layer } } div { color: revert-layer }'],
    ['@layer a { div { color: red } }', 'color: revert-layer'],
    ['@layer a { p { margin-top: 5px } } p { margin-top: revert-layer }'],
    ['@layer a { p { margin-top: 5px } } @layer b { p { margin-top: revert-layer } }'],
    ['@layer a { p { margin-top: revert-layer } }'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: @scope: roots, limits, :scope and &, proximity after specificity',
  cases([
    ['@scope (.a) { p { color: red } }'],
    ['@scope (.a) to (.b) { p { color: red } }'],
    ['@scope (.a) to (.b) { :scope { color: red } .b { color: blue } }'],
    ['@scope (.a) { :scope p { color: red } }'],
    ['@scope (.a) { & p { color: red } }'],
    ['@scope (.a) { .a p { color: red } }'],
    ['@scope (.a) { p { color: red } } @scope (.b) { p { color: blue } }'],
    ['@scope (.b) { p { color: blue } } @scope (.a) { p { color: red } }'],
    ['@scope (.a) { p { color: red } } p { color: blue }'],
    ['p { color: blue } @scope (.a) { p { color: red } }'],
    ['#p1 { color: blue } @scope (.a) { p { color: red } }'],
    ['@scope (.a) { p { color: red !important } } p { color: blue !important }'],
    ['@scope (.a) { :scope > p { color: red } }'],
    ['@scope (#a) to (:scope > .b) { p { color: red } }'],
    ['@scope (.a, .b) { p { color: red } }'],
    ['@media screen { @scope (.a) { p { color: red } } }'],
    ['@scope (.a) { @media screen { p { color: red } } }'],
    ['@scope (.a) { :scope { color: red } }'],
    ['@scope { p { color: red } }'],
    ['@layer x { @scope (.a) { p { color: red } } } p { color: blue }'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: a layer added through the CSSOM',
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>div { color: blue }</style>';
    d.body.innerHTML = '<div id="t"></div>';
    const out = [w.getComputedStyle(d.getElementById('t')).color];
    d.styleSheets[0].insertRule('@layer a { #t { color: red } }', 0);
    out.push(w.getComputedStyle(d.getElementById('t')).color);
    d.styleSheets[0].deleteRule(1);
    out.push(w.getComputedStyle(d.getElementById('t')).color);
    return out;
  },
  { jsdom: 31 },
);

test('jsdom 30 does not apply @layer and @scope rules', () => {
  const w = createWindow({ jsdom: '30.1.3' });
  const d = w.document;
  d.head.innerHTML = '<style>@layer a { #t { color: red } } @scope (div) { p { color: red } }</style>';
  d.body.innerHTML = '<div id="t"><p></p></div>';
  assert.equal(w.getComputedStyle(d.getElementById('t')).color, 'rgb(0, 0, 0)');
  assert.equal(w.getComputedStyle(d.querySelector('p')).color, 'rgb(0, 0, 0)');
});

// Review round (#330).
parity(
  'jsdom 31: @scope: & and :scope as tokens, nested scopes, text-dependent roots; revert-layer across a logical pair',
  (w) => {
    const d = w.document;
    const color = (id) => w.getComputedStyle(d.getElementById(id)).color;
    const out = [];
    d.head.innerHTML = '<style>@scope (.a) { [data-v="&"] { color: red } }</style>';
    d.body.innerHTML = '<div class="a"><p data-v="&" id="p"></p></div>';
    out.push(color('p'));
    d.head.innerHTML = '<style>@scope (.a) { [data-v=":scope"] { color: red } }</style>';
    d.body.innerHTML = '<div class="a" data-v=":scope" id="r"><p data-v=":scope" id="p"></p></div>';
    out.push(color('r'), color('p'));
    d.head.innerHTML = '<style>@scope (.a) { :scope > & p, & > p { color: red } }</style>';
    d.body.innerHTML = '<div class="a"><div><p id="p"></p></div><p id="q"></p></div>';
    out.push(color('p'), color('q'));
    d.head.innerHTML = '<style>@scope (.outer) to (.stop) { @scope (.inner) { p { color: red } } }</style>';
    d.body.innerHTML =
      '<div class="inner"><p id="a"></p></div><div class="outer"><div class="stop"><div class="inner"><p id="b"></p></div></div><div class="inner"><p id="c"></p></div></div>';
    out.push(color('a'), color('b'), color('c'));
    d.head.innerHTML = '<style>@scope (:empty) { :scope { color: red } }</style>';
    d.body.innerHTML = '<div id="x"></div>';
    const text = d.createTextNode('');
    d.getElementById('x').append(text);
    out.push(color('x'));
    text.data = 'hi';
    out.push(color('x'));
    for (const css of [
      '@layer a { div { margin-top: 3px } } @layer b { div { margin-block-start: 5px; margin-top: revert-layer } }',
      '@layer a { div { margin-block-start: 3px } } @layer b { div { margin-top: 5px; margin-block-start: revert-layer } }',
      '@layer a { div { margin-top: 1px } } @layer b { div { margin-top: revert-layer } } @layer c { div { margin-block-start: revert-layer } }',
    ]) {
      d.head.innerHTML = `<style>${css}</style>`;
      d.body.innerHTML = '<div id="t"></div>';
      out.push([css, w.getComputedStyle(d.getElementById('t')).marginTop]);
    }
    return out;
  },
  { jsdom: 31 },
);

// Second review round (#330).
parity(
  "jsdom 31: the style attribute's revert-layer across a logical pair; escaped layer names and :scope",
  (w) => {
    const d = w.document;
    const out = [];
    for (const [css, attr] of [
      ['div { margin-top: 3px }', 'margin-block-start: 5px; margin-top: revert-layer'],
      ['div { margin-top: 3px }', 'margin-top: revert-layer; margin-block-start: 5px'],
      ['div { margin-top: 3px !important }', 'margin-block-start: 5px !important; margin-top: revert-layer !important'],
    ]) {
      d.head.innerHTML = `<style>${css}</style>`;
      d.body.innerHTML = `<div id="t" style="${attr}"></div>`;
      out.push([attr, w.getComputedStyle(d.getElementById('t')).marginTop]);
    }
    for (const css of [
      '@layer a { #t { color: red } } @layer \\61 { div { color: blue } }',
      '@layer a\\.b { #t { color: red } } @layer a { @layer b { div { color: blue } } } @layer a.b { div { color: green } }',
      '@scope (div) { :sc\\6f pe { color: red } }',
    ]) {
      d.head.innerHTML = `<style>${css}</style>`;
      d.body.innerHTML = '<div id="t"></div>';
      out.push([css, w.getComputedStyle(d.getElementById('t')).color]);
    }
    return out;
  },
  { jsdom: 31 },
);

// Third review round (#330): rolled back from the attribute to a rule's
// revert-layer (this read hung).
parity(
  'jsdom 31: revert-layer in the style attribute and in the rule it rolls back to',
  (w) =>
    [
      ['div { color: revert-layer }', 'color: revert-layer'],
      ['div { color: revert-layer !important }', 'color: revert-layer !important'],
      ['@layer a { div { color: red } } div { color: revert-layer }', 'color: revert-layer'],
      [
        '@layer a { div { color: red !important } } @layer b { div { color: revert-layer !important } }',
        'color: revert-layer !important',
      ],
    ].map(([css, attr]) => {
      w.document.head.innerHTML = `<style>${css}</style>`;
      w.document.body.innerHTML = `<div id="t" style="${attr}"></div>`;
      return [css, attr, w.getComputedStyle(w.document.getElementById('t')).color];
    }),
  { jsdom: 31 },
);

// Fourth review round (#330).
parity(
  'jsdom 31: an !important revert-layer rolls back to the normal declarations below; an escaped backslash in a layer name',
  (w) =>
    [
      '@layer a { div { color: red } } @layer b { div { color: revert-layer !important } }',
      '@layer a { div { color: red } } div { color: revert-layer !important }',
      '@layer b { div { color: blue } } @layer b { div { color: revert-layer !important } } @layer a { div { color: red } }',
      '@layer a\\\\.b { #t { color: red } } @layer z { div { color: blue } } @layer a\\\\ { @layer b { div { color: green } } }',
    ].map((css) => {
      w.document.head.innerHTML = `<style>${css}</style>`;
      w.document.body.innerHTML = '<div id="t"></div>';
      return [css, w.getComputedStyle(w.document.getElementById('t')).color];
    }),
  { jsdom: 31 },
);

test('jsdom 31: deeply nested @scope rules are matched without exponential work', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const d = w.document;
  // (roots alternate between .a and .b, with limits that never apply)
  const open = Array.from({ length: 30 }, (_, i) => `@scope (.${i % 2 ? 'b' : 'a'}) to (.stop) { `).join('');
  d.head.innerHTML = `<style>${open}p { color: red }${' }'.repeat(30)}</style>`;
  d.body.innerHTML = '<div class="a b"><div class="a"><div class="b"><p id="p"></p></div></div></div>';
  const start = performance.now();
  assert.equal(w.getComputedStyle(d.getElementById('p')).color, 'rgb(255, 0, 0)');
  assert.ok(performance.now() - start < 500);
});
