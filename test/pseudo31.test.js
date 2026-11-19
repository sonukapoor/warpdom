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

parity(
  "jsdom 31: a pseudo-element's name with escapes, in a rule and in getComputedStyle()",
  (w) => {
    const d = w.document;
    d.head.innerHTML =
      '<style>p::b\\65 fore { color: red } p::AFT\\45 R { color: blue } p:\\62 efore { margin-top: 3px }</style>';
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    const g = (pseudo) => w.getComputedStyle(p, pseudo);
    return [g('::before').color, g('::after').color, g('::before').marginTop, g('::b\\65 fore').color, g().color];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: attr()'s text escapes control characters as a CSS string",
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    p.setAttribute('data-l', 'a\nb\tc\u0001d\u007fe');
    p.style.content = 'attr(data-l)';
    const out = [w.getComputedStyle(p).content];
    p.style.content = 'attr(x, "q\\a r")';
    out.push(w.getComputedStyle(p).content);
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: @scope limits a pseudo-element's rules by its originating element",
  (w) => {
    const d = w.document;
    d.head.innerHTML =
      '<style>@scope (.a) to (:not(.a)) { :scope::before { color: red } } @scope (.b) { :scope::after { color: blue } .c::before { color: green } }' +
      ' @scope (.d) to (.e) { span::before { color: lime } }</style>';
    d.body.innerHTML =
      '<p class="a" id="p"></p><div class="b" id="b"><span class="c" id="c"></span></div>' +
      '<div class="d"><span id="s1"></span><div class="e"><span id="s2"></span></div></div>';
    const g = (id, pseudo) => w.getComputedStyle(d.getElementById(id), pseudo).color;
    return [g('p', '::before'), g('b', '::after'), g('c', '::before'), g('s1', '::before'), g('s2', '::before')];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: the whitespace ending a hex escape is part of the name before a pseudo-element; one more is a descendant',
  (w) => {
    const d = w.document;
    d.head.innerHTML =
      '<style>#\\78 ::before { color: red } #\\78  ::after { color: blue } .a, #\\78 ::first-line { color: green }</style>';
    d.body.innerHTML = '<div id="x"><span id="s"></span></div>';
    const g = (id, pseudo) => w.getComputedStyle(d.getElementById(id), pseudo).color;
    return [g('x', '::before'), g('x', '::after'), g('s', '::after'), g('x', '::first-line')];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: legacy pseudo-elements with arguments give an empty style',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id="x"></div>';
    const x = d.getElementById('x');
    return [':before(x)', ':after()', '::before(x)', ':first-line(a)', ':before'].map((pseudo) => {
      const cs = w.getComputedStyle(x, pseudo);
      return [pseudo, cs.length, cs.display];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: attr() on both sides of a slash without spaces',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id="p" title="alt"></p>';
    const p = d.getElementById('p');
    return ['attr(id)/attr(title)', 'attr(id) /attr(title)', '"a"/"b"', 'attr(id)/"x"', '"a"/attr(title)'].map(
      (content) => {
        p.style.content = content;
        return [content, w.getComputedStyle(p).content];
      },
    );
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: a pseudo-element's style calls no method a test replaced",
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id="x"></div>';
    const x = d.getElementById('x');
    let calls = 0;
    const patched = function () {
      calls++;
      throw new Error('patched');
    };
    w.Document.prototype.createElementNS = patched;
    w.Document.prototype.createElement = patched;
    return [w.getComputedStyle(x, '::before').display, calls, x.childNodes.length];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: a backslash before a newline continues a string in content with attr()',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    return ['"a\\\nb" attr(id)', 'attr(x, "q\\\nr")', '"a\\\r\nb" attr(id)'].map((content) => {
      p.style.content = content;
      return [content, w.getComputedStyle(p).content];
    });
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: attr()'s name is any CSS identifier, ASCII lowercased, a namespace prefix reading as missing",
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    p.setAttribute('data-ü', 'U');
    p.setAttribute('1x', 'N');
    p.setAttribute('-a', 'D');
    p.setAttribute('_b', 'B');
    p.setAttribute('a\\b', 'E');
    return [
      'attr(data-ü)',
      'attr(\\31 x)',
      'attr(-a)',
      'attr(_b)',
      'attr(--c)',
      'attr(a\\\\b)',
      'attr(DATA-Ü)',
      'attr(a|b)',
      'attr(*|id)',
    ].map((content) => {
      p.style.content = content;
      return [content, w.getComputedStyle(p).content];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: pseudo-elements of SVG, MathML and other namespaces',
  (w) => {
    const d = w.document;
    d.head.innerHTML =
      '<style>svg::before { content: "s"; color: red } circle::after { content: attr(r) } y::before { color: blue } svg { --k: 1 }' +
      ' circle::before { content: attr(viewBox) } svg::after { content: attr(viewbox) } math::marker { color: green }</style>';
    d.body.innerHTML =
      '<svg id="sv" viewBox="0 0 1 1"><circle id="c" r="4" viewBox="q"></circle></svg><math id="m"></math>';
    const other = d.body.appendChild(d.createElementNS('urn:x', 'y'));
    const g = (el, pseudo, name) => w.getComputedStyle(el, pseudo).getPropertyValue(name);
    const sv = d.getElementById('sv');
    const c = d.getElementById('c');
    const m = d.getElementById('m');
    return [
      g(sv, '::before', 'color'),
      g(sv, '::before', 'content'),
      g(sv, '::before', 'display'),
      g(c, '::after', 'content'),
      g(c, '::before', 'content'),
      g(sv, '::after', 'content'),
      g(sv, '::before', '--k'),
      g(other, '::before', 'display'),
      g(other, '::before', 'color'),
      g(m, '::marker', 'color'),
      g(m, '::before', 'display'),
      w.getComputedStyle(other, '::before').length,
    ];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: attr()'s name with many hex escapes",
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    return [`attr(\\31 ${'\\aaaaaa'.repeat(3)})`, `attr(\\31 ${'\\aaaaaa'.repeat(2)}\\aaaaaaa)`].map((content) => {
      p.style.content = content;
      return [p.style.content, w.getComputedStyle(p).content];
    });
  },
  { jsdom: 31 },
);

test("jsdom 31: an attr() name of many hex escapes is read in linear time (each escape's digits read one way)", () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const p = w.document.body.appendChild(w.document.createElement('p'));
  p.style.content = `attr(\\31 ${'\\aaaaaa'.repeat(40)}!)`;
  const start = performance.now();
  assert.equal(w.getComputedStyle(p).content, 'normal');
  assert.ok(performance.now() - start < 1000);
});

parity(
  'jsdom 31: escapes of zero, a surrogate or past U+10FFFF are U+FFFD in attr() names and strings',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id="p"></p>';
    const p = d.getElementById('p');
    p.setAttribute('�', 'R');
    p.setAttribute('\u{10ffff}', 'M');
    return [
      'attr(\\110000)',
      'attr(\\d800)',
      'attr(\\10ffff)',
      'attr(\\0)',
      'attr(x, "\\110000")',
      'attr(x, "\\d800")',
      'attr(x, "\\0")',
      '"\\d800" attr(x)',
    ].map((content) => {
      p.style.content = content;
      return [content, w.getComputedStyle(p).content];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: user agent rules for pseudo-elements hold for HTML elements only',
  (w) => {
    const d = w.document;
    const make = (ns, tag) => {
      const e = d.body.appendChild(d.createElementNS(ns, tag));
      e.setAttribute('type', 'file');
      return e;
    };
    const g = (el, pseudo, name) => w.getComputedStyle(el, pseudo).getPropertyValue(name);
    return [
      g(make('urn:x', 'input'), '::file-selector-button', 'align-content'),
      g(make('http://www.w3.org/2000/svg', 'input'), '::file-selector-button', 'align-content'),
      g(make('http://www.w3.org/1999/xhtml', 'input'), '::file-selector-button', 'align-content'),
      g(make('urn:x', 'dialog'), '::backdrop', 'background-color'),
      g(make('urn:x', 'li'), '::marker', 'content'),
    ];
  },
  { jsdom: 31 },
);

test('jsdom 31: a long attr() fallback is read in linear time', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const p = w.document.body.appendChild(w.document.createElement('p'));
  p.style.content = `attr(x, "${' '.repeat(100000)}" )`;
  const start = performance.now();
  assert.equal(w.getComputedStyle(p).content.length, 100002);
  assert.ok(performance.now() - start < 1000);
});

parity(
  'jsdom 31: a CR LF ending a hex escape before a pseudo-element is one newline',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent =
      '#\\78\r\n::before { color: red } #\\78\r\n\r\n::after { color: blue } #\\78\r::marker { color: green }';
    d.head.appendChild(style);
    d.body.innerHTML = '<div id="x"><span id="s"></span></div>';
    const sheet = d.styleSheets[0];
    sheet.insertRule('#\\78\r\n::first-line { color: lime }', sheet.cssRules.length);
    const g = (id, pseudo) => w.getComputedStyle(d.getElementById(id), pseudo).color;
    return [
      g('x', '::before'),
      g('s', '::before'),
      g('x', '::after'),
      g('s', '::after'),
      g('x', '::marker'),
      g('x', '::first-line'),
      g('s', '::first-line'),
    ];
  },
  { jsdom: 31 },
);
