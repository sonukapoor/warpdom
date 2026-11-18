// jsdom 31's cascade (cascade.js cascade31, logical.js, ua-sheet.js
// HTML31), checked against jsdom 31.0.1: the user agent sheet as a lower
// origin, !important by specificity, logical property groups, its user
// agent sheet and display blockified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';
import { flowOf, partnerOf } from '../src/logical.js';

// [css, markup, properties]: each element's computed values.
const cases = (list) => (w) => {
  const d = w.document;
  return list.map(([css, markup, props]) => {
    d.head.innerHTML = `<style>${css}</style>`;
    d.body.innerHTML = markup;
    return [
      css,
      markup,
      ...[...d.body.querySelectorAll('*')].map((e) => props.map((p) => w.getComputedStyle(e).getPropertyValue(p))),
    ];
  });
};

parity(
  'jsdom 31: the user agent sheet is a lower origin, its !important declarations the highest',
  cases([
    ['* { display: inline }', '<div></div><p></p><li></li><span hidden></span><table></table>', ['display']],
    ['.x { display: block }', '<p class="x" hidden></p><div class="x" hidden="until-found"></div>', ['display']],
    [
      '* { font-weight: normal } * { font-style: normal }',
      '<b></b><h1></h1><th></th><em></em>',
      ['font-weight', 'font-style'],
    ],
    [
      '* { margin: 0 } * { padding: 0 }',
      '<h1></h1><ul></ul><td></td><fieldset></fieldset>',
      ['margin-top', 'padding-left'],
    ],
    [
      '.i { display: block !important } .o { overflow: visible !important }',
      '<input type="hidden" class="i"><input class="o"><input type="hidden" style="display: block !important">',
      ['display', 'overflow-x'],
    ],
    [
      '',
      '<div hidden="until-found"></div><embed hidden><div hidden></div>',
      ['display', 'content-visibility', 'width'],
    ],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: !important declarations by specificity, then order',
  cases([
    [
      '.a.b span { color: red !important } span { color: blue !important }',
      '<div class="a b"><span></span></div>',
      ['color'],
    ],
    ['span { color: blue !important } span { color: red !important }', '<span></span>', ['color']],
    ['#s { color: red !important }', '<span id="s" style="color: blue !important"></span>', ['color']],
  ]),
  { jsdom: 31 },
);

// Each logical property with its physical one: specificity, order,
// importance and origin decide between them, in every writing mode.
parity(
  'jsdom 31: logical properties cascade with their physical ones',
  cases([
    [
      '#a { margin-block-start: 3px } .a { margin-top: 7px } .b { margin-top: 7px; margin-block-start: 3px } .c { margin-block-start: 3px; margin-top: 7px }',
      '<div id="a" class="a"></div><div class="b"></div><div class="c"></div>',
      ['margin-top', 'margin-block-start', 'margin-bottom'],
    ],
    [
      '.c { margin-block-start: 3px } .i { margin-top: 7px !important }',
      '<div class="c" style="margin-top: 9px"></div><div class="i" style="margin-block-start: 9px"></div><div style="margin-block-start: 3px; margin-top: 4px; margin-block-start: 5px"></div>',
      ['margin-top', 'margin-block-start'],
    ],
    [
      'h1.d { margin-top: 1px }',
      '<h1 class="d"></h1><h1 style="margin-block-start: 2px"></h1><hr style="margin-left: 3px"><dd style="margin-left: 1px"></dd>',
      ['margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'margin-inline-start'],
    ],
    [
      '',
      '<div dir="rtl"><span style="margin-inline-start: 5px; padding-inline-end: 2px"></span></div><div style="writing-mode: vertical-rl; margin-block-start: 5px; inline-size: 9px; overflow-inline: hidden"></div>' +
        '<div style="writing-mode: vertical-lr; direction: rtl; margin-inline-start: 5px; border-start-end-radius: 4px"></div><div style="writing-mode: sideways-lr; margin-inline-start: 5px; inset-block-start: 1px"></div>',
      [
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'padding-left',
        'width',
        'height',
        'overflow-x',
        'overflow-y',
        'border-top-left-radius',
        'border-bottom-left-radius',
        'border-top-right-radius',
        'left',
        'right',
      ],
    ],
    [
      ':root { --m: 9px } .a { margin-top: 1px } #b { margin-block: var(--m) 4px } #c { margin: var(--m) } .c { margin-block-start: 5px }',
      '<div id="b" class="a"></div><div id="c" class="c"></div><div style="--n: 3px 6px; padding-inline: var(--n); direction: rtl"></div><div style="inset-inline: var(--q, 2px 3px)"></div>',
      ['margin-top', 'margin-bottom', 'margin-block-start', 'padding-right', 'padding-left', 'left', 'right'],
    ],
    [
      '',
      '<div style="border-top-style: solid; border-block-start-width: 3px"></div><div style="border-block-start-width: 3px"></div><div style="border-left: 2px dotted red"></div>',
      [
        'border-top-width',
        'border-block-start-width',
        'border-inline-start-width',
        'border-inline-start-style',
        'border-inline-start-color',
      ],
    ],
  ]),
  { jsdom: 31 },
);

const UA_PROPS = [
  'display',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding-top',
  'padding-left',
  'border-top-style',
  'border-top-width',
  'border-top-color',
  'color',
  'background-color',
  'align-content',
  'font-weight',
  'font-style',
  'overflow-x',
  'position',
  'left',
  'width',
  'list-style-type',
  'unicode-bidi',
];
parity(
  "jsdom 31: the user agent sheet's rules",
  (w) => {
    const d = w.document;
    d.body.innerHTML =
      '<h1></h1><h2></h2><h3></h3><h4></h4><h5></h5><h6></h6><section><h1></h1></section><p></p><blockquote></blockquote><figure></figure><pre></pre>' +
      '<ul><li><ul><li><ol></ol></li></ul></li></ul><ol></ol><menu></menu><dl><dt></dt><dd></dd></dl><hr><fieldset><legend></legend></fieldset>' +
      '<dialog></dialog><dialog open></dialog><div popover></div><a href="x"></a><a></a><b></b><strong></strong><optgroup></optgroup><option></option>' +
      '<table><tr><th></th><td></td></tr></table><select></select><select multiple></select><textarea></textarea><button></button><button disabled></button>' +
      '<input><input type="hidden"><input type="checkbox"><input type="radio"><input type="submit"><input type="button"><input type="reset">' +
      '<input type="file"><input type="image"><input type="range"><input type="color"><input type="search"><input type="date"><input type="number">' +
      // (no summary: warpdom expands list-style to its initial values, #269 D4/D5)
      '<iframe></iframe><bdi></bdi><div dir="rtl"></div><bdo></bdo><marquee></marquee><ruby><rt></rt></ruby>';
    return [...d.querySelectorAll('*')].map((e) => [
      e.localName,
      ...UA_PROPS.map((p) => w.getComputedStyle(e).getPropertyValue(p)),
    ]);
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: form controls take their colors from the user agent sheet',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div style="color: red"></div>';
    const parent = d.body.firstChild;
    const types = [
      'text',
      'hidden',
      'checkbox',
      'radio',
      'submit',
      'button',
      'reset',
      'file',
      'image',
      'range',
      'color',
      'search',
      'password',
    ];
    const out = types.map((type) => {
      const e = d.createElement('input');
      e.type = type;
      parent.append(e);
      return [type, w.getComputedStyle(e).color, w.getComputedStyle(e).backgroundColor];
    });
    for (const tag of ['button', 'select', 'textarea', 'option']) {
      const e = parent.appendChild(d.createElement(tag));
      out.push([tag, w.getComputedStyle(e).color, w.getComputedStyle(e).backgroundColor]);
    }
    return out;
  },
  { jsdom: 31 },
);

// CSS Display 3, 2.7.
parity(
  'jsdom 31: display blockified',
  cases([
    [
      '',
      '<div style="position: absolute; display: inline"></div><div style="float: left; display: inline-flex"></div><div style="position: fixed; display: inline-grid"></div>' +
        '<div style="position: absolute; display: inline-table"></div><div style="position: absolute; display: none"></div><div style="position: absolute; display: contents"></div>' +
        '<div style="position: relative; display: inline"></div><div style="position: absolute; display: inline-block"></div><div style="position: absolute; display: ruby"></div>' +
        '<div style="float: right; display: table-cell"></div><div style="position: absolute; display: inline list-item"></div><div style="position: absolute; display: -webkit-inline-box"></div>',
      ['display'],
    ],
    [
      '',
      '<div style="display: flex"><span></span><span style="display: inline-block"></span><div style="display: contents"><i></i></div></div>' +
        '<div style="display: inline-grid"><b></b></div><div style="display: -webkit-box"><u></u></div><svg style="display: flex"><g></g></svg>',
      ['display'],
    ],
    ['* { display: inline }', '<dialog></dialog><div popover></div><span></span>', ['display']],
  ]),
  { jsdom: 31 },
);

test('jsdom 31: the root element is blockified', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const root = w.document.documentElement;
  root.style.display = 'inline-flex';
  assert.equal(w.getComputedStyle(root).display, 'flex');
  root.style.display = 'table-cell';
  assert.equal(w.getComputedStyle(root).display, 'block');
});

test('jsdom 30 keeps the user agent sheet by specificity and the later !important', () => {
  const w = createWindow({ jsdom: '30.1.3' });
  const d = w.document;
  d.head.innerHTML =
    '<style>* { display: inline } .a.b span { color: red !important } span { color: blue !important }</style>';
  d.body.innerHTML = '<div class="a b"><span></span></div><h1 style="margin-block-start: 2px"></h1>';
  assert.equal(w.getComputedStyle(d.querySelector('div')).display, 'block');
  assert.equal(w.getComputedStyle(d.querySelector('span')).color, 'rgb(0, 0, 255)');
  assert.equal(w.getComputedStyle(d.querySelector('h1')).marginTop, '0');
});

test('logical properties: the partner in each flow, both ways', () => {
  const ltr = flowOf('horizontal-tb', 'ltr');
  assert.equal(partnerOf('margin-inline-start', ltr), 'margin-left');
  assert.equal(partnerOf('margin-left', ltr), 'margin-inline-start');
  assert.equal(partnerOf('margin-inline-start', flowOf('horizontal-tb', 'rtl')), 'margin-right');
  assert.equal(partnerOf('top', flowOf('vertical-rl', 'ltr')), 'inset-inline-start');
  assert.equal(partnerOf('inline-size', flowOf('vertical-lr', 'ltr')), 'height');
  assert.equal(partnerOf('border-top-left-radius', flowOf('sideways-lr', 'ltr')), 'border-start-end-radius');
  assert.equal(partnerOf('border-start-start-radius', flowOf('vertical-rl', 'rtl')), 'border-bottom-right-radius');
  assert.equal(partnerOf('color', ltr), null);
  // An unknown writing mode is horizontal-tb.
  assert.equal(flowOf('tb-rl', 'ltr'), ltr);
});

// Review round (#328).
parity(
  'jsdom 31: revert and revert-layer in the page roll back to the user agent sheet, of the pair too',
  cases([
    [
      'p { margin-top: 3px } .r { margin-top: revert }',
      '<p class="r"></p><div class="r"></div><p style="margin-block-start: revert"></p><p style="margin-top: 2px; margin-block-start: revert"></p>' +
        '<div style="color: red"><b style="color: revert"></b><div style="display: revert"></div><span style="display: revert-layer"></span></div>',
      ['margin-top', 'margin-block-start', 'color', 'display'],
    ],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: the flow of logical properties: inherit, all, text-orientation, dir=auto text',
  (w) => {
    const d = w.document;
    d.body.innerHTML =
      '<div style="writing-mode: vertical-rl; margin-top: 2px; margin-right: 7px"><div id="c" style="writing-mode: horizontal-tb; margin-block-start: inherit"></div></div>' +
      '<div style="writing-mode: vertical-rl"><span id="b" style="all: initial; margin-block-start: 5px"></span></div>' +
      '<div style="text-orientation: upright; writing-mode: vertical-rl"><span id="k" style="direction: rtl; margin-inline-start: 4px"></span></div>' +
      '<div id="a" dir="auto" style="margin-inline-start: 5px">a<span id="s" style="padding-inline-start: 3px"></span></div>';
    const read = (id) => {
      const cs = w.getComputedStyle(d.getElementById(id));
      return [
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'margin-block-start',
        'padding-left',
        'padding-right',
      ].map((p) => cs.getPropertyValue(p));
    };
    const out = ['c', 'b', 'k', 'a', 's'].map(read);
    for (const mode of ['vertical-rl', 'vertical-lr', 'sideways-rl', 'sideways-lr', 'horizontal-tb']) {
      d.getElementById('k').parentNode.style.writingMode = mode;
      out.push(read('k'));
    }
    d.getElementById('a').firstChild.data = 'א';
    out.push(read('a'), read('s'));
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: the user agent sheet applies to HTML elements, SVG ones have their own rules',
  (w) => {
    const d = w.document;
    d.body.innerHTML =
      '<svg><title>t</title><style></style><g hidden dir="rtl"></g><a href="#x"></a><a xlink:href="#x"><text>t</text></a><a></a><svg></svg></svg>' +
      '<div style="color: red"><svg><a href="#x"></a></svg></div><pre dir="auto"></pre><pre></pre><textarea dir="auto"></textarea><input dir="auto" type="search">';
    const foreign = d.body.appendChild(d.createElementNS('urn:x', 'div'));
    foreign.setAttribute('dir', 'rtl');
    return [...d.body.querySelectorAll('*')].map((e) => {
      const cs = w.getComputedStyle(e);
      return [e.localName, cs.display, cs.color, cs.cursor, cs.overflowX, cs.unicodeBidi];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: display blockified: the root, slots and shadow roots',
  (w) => {
    const d = w.document;
    d.body.innerHTML =
      '<div id="h" style="display: flex"><span id="s">x</span></div><div id="g" style="display: grid"></div>';
    d.getElementById('h').attachShadow({ mode: 'open' }).innerHTML = '<slot style="display: block"></slot><b>q</b>';
    d.getElementById('g').attachShadow({ mode: 'open' }).innerHTML = '<i>q</i>';
    const out = [
      w.getComputedStyle(d.getElementById('s')).display,
      w.getComputedStyle(d.getElementById('h').shadowRoot.querySelector('b')).display,
      w.getComputedStyle(d.getElementById('g').shadowRoot.querySelector('i')).display,
    ];
    d.documentElement.style.display = 'contents';
    out.push(w.getComputedStyle(d.documentElement).display);
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: overscroll-behavior is a logical property group',
  cases([
    [
      '',
      '<div style="overscroll-behavior-inline: contain"></div><div style="writing-mode: vertical-lr; overscroll-behavior-block: none"></div><div style="overscroll-behavior-y: contain"></div>',
      ['overscroll-behavior-x', 'overscroll-behavior-y', 'overscroll-behavior-inline', 'overscroll-behavior-block'],
    ],
  ]),
  { jsdom: 31 },
);

test('jsdom 31: a deep tree finds its flow without a call per ancestor', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  let e = w.document.body;
  for (let i = 0; i < 20000; i++) e = e.appendChild(w.document.createElement('div'));
  e.style.marginBlockStart = '1px';
  assert.equal(w.getComputedStyle(e).marginTop, '1px');
});
