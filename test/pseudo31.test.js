// jsdom 31's pseudo-element styles (cascade.js pseudoNode31, pseudoTail31,
// attrContent31), checked against jsdom 31.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

const HTML =
  '<style>.a::before { content: "x"; position: absolute } .b::after { display: inline-flex; float: left } li.c::marker { content: "*" }' +
  ' .d::first-letter { color: green } .e > span::before { color: blue } .f::before { color: inherit; margin: inherit } :is(.g)::before { color: purple }' +
  ' .h::before, .h::after { color: teal } .i:hover::before { color: red } #x::before { color: lime } #x::BEFORE { color: olive } p:before { color: navy }' +
  ' p::after { content: attr(id) }</style>' +
  '<div id="x" class="a b d f g h i" style="color: red; margin: 3px; display: flex"><span id="s"></span></div><ul><li id="li" class="c">x</li><li id="li2">y</li></ul>' +
  '<input id="in" placeholder="x"><input id="fi" type="file"><dialog id="dl" open></dialog><div class="e"><span id="es"></span></div><p id="p"></p>' +
  '<details><summary id="su">s</summary></details>';
const PROPS = [
  'display',
  'color',
  'content',
  'position',
  'float',
  'margin-top',
  'font-size',
  'unicode-bidi',
  'font-variant-numeric',
  'white-space-collapse',
  'text-wrap-mode',
  'background-color',
  'align-content',
];
const CASES = [
  ['x', '::before'],
  ['x', '::after'],
  ['x', ':before'],
  ['x', '::marker'],
  ['x', '::first-letter'],
  ['x', '::first-line'],
  ['li', '::marker'],
  ['li2', '::marker'],
  ['su', '::marker'],
  ['in', '::placeholder'],
  ['fi', '::file-selector-button'],
  ['dl', '::backdrop'],
  ['x', '::backdrop'],
  ['es', '::before'],
  ['s', '::before'],
  ['x', '::selection'],
  ['x', '::foo'],
  ['x', 'before'],
  ['x', '::BEFORE'],
  ['x', '::-webkit-scrollbar'],
  ['x', '::part(x)'],
  ['x', '::highlight(x)'],
  ['x', ':marker'],
  ['x', '::before '],
  ['p', '::before'],
  ['p', '::after'],
  ['x', ''],
  ['x', null],
];

parity(
  'jsdom 31: pseudo-element styles: their rules, inheritance, blockification, content and user agent rules',
  (w) => {
    const d = w.document;
    d.documentElement.innerHTML = HTML;
    return CASES.map(([id, pseudo]) => {
      const cs = w.getComputedStyle(d.getElementById(id), pseudo);
      return [id, pseudo, cs.length, ...PROPS.map((p) => cs.getPropertyValue(p))];
    });
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: content's attr()",
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>p::before { content: attr(data-l) } p::after { content: attr(missing, "fb") }</style>';
    d.body.innerHTML = '<p id="p" title=\'a"b\' data-l="L"></p>';
    const p = d.getElementById('p');
    const out = [w.getComputedStyle(p, '::before').content, w.getComputedStyle(p, '::after').content];
    for (const content of [
      'attr(id)',
      'attr(missing)',
      'attr(title)',
      '"a" attr(id) "b"',
      'attr(ID)',
      'counter(x)',
      'attr(id) / "alt"',
      'attr(id string)',
      'attr(id, "fb")',
      'attr(missing, "fb")',
      'attr(missing, 3px)',
      'attr(id,)',
      'attr(id) attr(id)',
    ]) {
      p.style.content = content;
      out.push([content, w.getComputedStyle(p).content]);
    }
    return out;
  },
  { jsdom: 31 },
);

test("jsdom 30 gives a pseudo-element the element's own style", () => {
  const w = createWindow({ jsdom: '30.1.3' });
  const e = w.document.body.appendChild(w.document.createElement('div'));
  assert.equal(w.getComputedStyle(e, '::before').display, 'block');
});

parity(
  "jsdom 31: a selector's pseudo-element is found by tokens: an escaped colon is a class, any whitespace a descendant",
  (w) => {
    const d = w.document;
    d.head.innerHTML =
      '<style>.x\\:before { color: red } p\n::before { color: lime } p >\t::before { color: blue }</style>';
    d.body.innerHTML = '<div class="x:before" id="t"></div><p id="p"><span id="s"></span></p>';
    const g = (id, pseudo) => w.getComputedStyle(d.getElementById(id), pseudo).color;
    return [g('t'), g('p', '::before'), g('s', '::before'), g('s')];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: a pseudo-element's style follows its element into another document and back",
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>p::before { color: red }</style>';
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    const cs = w.getComputedStyle(p, '::before');
    const out = [cs.color];
    const other = d.implementation.createHTMLDocument('');
    other.head.innerHTML = '<style>p::before { color: blue }</style>';
    other.body.appendChild(p);
    out.push(cs.color);
    d.body.appendChild(p);
    out.push(cs.color, w.getComputedStyle(p, '::before').color);
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: a pseudo-element's own rules decide its flow and custom properties",
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>p::before { direction: rtl; margin-inline-start: 5px; --k: 1 }</style>';
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    w.getComputedStyle(p).color;
    const cs = w.getComputedStyle(p, '::before');
    const names = [];
    for (let i = 0; i < cs.length; i++) if (cs.item(i).startsWith('--')) names.push(cs.item(i));
    return [cs.marginLeft, cs.marginRight, cs.length, names, cs.getPropertyValue('--k')];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: content with attr() is written again by tokens; attr( in a string is text',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id="p" d=\'q"\\r\'></p>';
    const p = d.getElementById('p');
    return [
      '"attr(id)"',
      'attr(missing, ")")',
      '"(" attr(id)',
      "'a)' attr(id)",
      "'a' attr(id)",
      '"x\\"attr(id)" attr(id)',
      "attr(missing, 'f')",
      'attr(missing,"a)b") \'c\'',
      'ATTR(id)',
      'attr( id )',
      'attr(id)attr(id)',
      '"a\\\\" attr(id)',
      'attr(d)',
      'attr(missing, "x\\"y")',
      "attr(id) counter(x) 'z'",
    ].map((content) => {
      p.style.content = content;
      return [content, w.getComputedStyle(p).content, w.getComputedStyle(p, '::before').content];
    });
  },
  { jsdom: 31 },
);
