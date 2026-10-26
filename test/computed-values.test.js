// Computed values per jsdom version (#84, #76): system and named colors,
// zero lengths, box shorthands, font sizes and weights, font-family,
// vertical-align, :link on SVG links and the dialog's user agent styles.
// Parity with jsdom 20, 22, 25, 26, 27, 28, 29 and 30; the boundaries
// between them (black box, measured on every release from 20.0.0 to 30.1.3
// and on cssstyle 2.3.0 to 6.2.0) as plain tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

const JSDOMS = [20, 22, 25, 26, 27, 28, 29, 30];
const read = (w, el, props) => {
  const cs = w.getComputedStyle(el);
  return props.map((p) => cs.getPropertyValue(p));
};
const COLORS = ['color', 'background-color', 'border-top-color', 'border-left-color', 'outline-color'];

// --- colors ------------------------------------------------------------------------

function colors(w) {
  const d = w.document;
  d.head.innerHTML = `<style>
    .s { color: Red; background-color: Transparent; border: 1px solid ButtonFace }
    .t { color: GrayText; background: ThreeDFace; outline-color: Highlight }
    .u { color: Canvas; outline-color: currentColor; border-top: 1px solid InfoBackground }
    .v { border-left: 2px solid #F00; color: rgba(0,0,0,.1234); background-color: #ff000080 }
    .w { border-color: Red #F00 ButtonFace; color: hsl(120, 50%, 50%) }
  </style>`;
  const out = {};
  for (const cls of ['s', 't', 'u', 'v', 'w']) {
    const el = d.body.appendChild(d.createElement('div'));
    el.className = cls;
    out[cls] = read(w, el, COLORS);
  }
  const el = d.body.appendChild(d.createElement('div'));
  for (const value of [
    'Red',
    'ButtonFace',
    'Canvas',
    'threedface',
    'Mark',
    '#ff000080',
    '#F00F',
    'rgba(0,0,0,.1234)',
    'rgba(0,0,0,50%)',
    'RGB(1, 2, 3)',
    'rgb(1.5, 2, 3)',
    'currentColor',
    'Transparent',
    'hsl(0.5turn, 100%, 50%)',
    'hsl(1rad 100% 50%)',
    'hsla(-100grad, 100%, 50%, 0.5)',
  ]) {
    el.style.color = '';
    el.style.color = value;
    el.style.background = '';
    el.style.background = value;
    out[value] = [el.style.color, el.style.backgroundColor, ...read(w, el, ['color', 'background-color'])];
  }
  for (const tag of ['button', 'fieldset', 'dialog', 'mark', 'select', 'input', 'textarea', 'hr']) {
    out[tag] = read(w, d.body.appendChild(d.createElement(tag)), COLORS);
  }
  return out;
}
for (const jsdom of JSDOMS) parity(`computed values: colors (jsdom ${jsdom})`, colors, { jsdom });

// A hue across lines (calc() in a color is kept as written: #112) does
// not stop the style sheet or the inline style.
test('computed values: a hue with a line break', () => {
  const w = createWindow({});
  const d = w.document;
  d.head.innerHTML = '<style>.h { color: hsl(calc(120\n + 0), 100%, 50%); background-color: red }</style>';
  const el = d.body.appendChild(d.createElement('div'));
  el.className = 'h';
  assert.deepEqual(read(w, el, ['color', 'background-color']), ['hsl(calc(120\n + 0), 100%, 50%)', 'rgb(255, 0, 0)']);
  const inline = d.body.appendChild(d.createElement('div'));
  inline.style.color = 'hsl(calc(120\n + 0) 100% 50%)';
  assert.equal(inline.style.color, 'hsl(calc(120\n + 0) 100% 50%)');
  inline.style.color = 'hsl(120\n, 100%, 50%)';
  assert.equal(read(w, inline, ['color'])[0], 'rgb(0, 255, 0)');
});

const profileColor = (profile, css, prop = 'color') => {
  const w = createWindow(profile);
  const el = w.document.body.appendChild(w.document.createElement('div'));
  el.setAttribute('style', css);
  return [el.style.getPropertyValue(prop), w.getComputedStyle(el).getPropertyValue(prop)];
};

test('computed values: colors are computed from jsdom 22.1.0, system colors from 27', () => {
  for (const jsdom of ['20.0.3', '21.1.2', '22.0.0']) {
    assert.deepEqual(profileColor({ jsdom }, 'color: Red'), ['Red', 'Red'], jsdom);
    assert.deepEqual(
      profileColor({ jsdom }, 'background-color: transparent', 'background-color'),
      ['transparent', 'transparent'],
      jsdom,
    );
    assert.deepEqual(profileColor({ jsdom }, 'color: GrayText'), ['GrayText', 'GrayText'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: Canvas'), ['', ''], jsdom);
  }
  // Not declared: '' before 22.1.0.
  assert.deepEqual(profileColor({ jsdom: '22.0.0' }, 'color: red', 'background-color'), ['', '']);
  assert.deepEqual(profileColor({ jsdom: '22.0.0' }, 'color: red', 'border-top-color'), ['', '']);
  for (const jsdom of ['22.1.0', '23.0.0']) {
    assert.deepEqual(profileColor({ jsdom }, 'color: Red'), ['Red', 'rgb(255, 0, 0)'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: GrayText'), ['GrayText', 'GrayText'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: currentColor'), ['currentColor', 'currentColor'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: red', 'background-color'), ['', 'rgba(0, 0, 0, 0)'], jsdom);
  }
  for (const jsdom of ['27.0.0', '28.1.0', '29.1.1', '30.1.3']) {
    assert.deepEqual(profileColor({ jsdom }, 'color: ButtonFace'), ['buttonface', 'rgb(204, 204, 204)'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: GrayText'), ['graytext', 'rgb(102, 102, 102)'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: LinkText'), ['linktext', 'rgb(0, 0, 255)'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: Mark'), ['mark', 'rgb(255, 255, 0)'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'color: ThreeDShadow'), ['threedshadow', 'rgb(51, 51, 51)'], jsdom);
  }
});

test('computed values: color keywords per cssstyle version', () => {
  const jsdom = '26.1.0';
  for (const cssstyle of ['4.1.0', '4.3.1']) {
    assert.deepEqual(profileColor({ jsdom, cssstyle }, 'color: ButtonFace'), ['ButtonFace', 'ButtonFace'], cssstyle);
    assert.deepEqual(profileColor({ jsdom, cssstyle }, 'color: Red'), ['Red', 'rgb(255, 0, 0)'], cssstyle);
    assert.deepEqual(profileColor({ jsdom, cssstyle }, 'color: Canvas'), ['', ''], cssstyle);
  }
  for (const cssstyle of ['4.4.0', '4.5.0']) {
    assert.deepEqual(profileColor({ jsdom, cssstyle }, 'color: Canvas'), ['Canvas', 'Canvas'], cssstyle);
    assert.deepEqual(profileColor({ jsdom, cssstyle }, 'color: Red'), ['red', 'rgb(255, 0, 0)'], cssstyle);
    assert.deepEqual(profileColor({ jsdom, cssstyle }, 'color: SelectedItem'), ['', 'CanvasText'], cssstyle);
  }
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.6.0' }, 'color: Canvas'), ['canvas', 'canvas']);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.6.0' }, 'color: SelectedItem'), ['selecteditem', 'selecteditem']);
  // The older color parser before 4.2: a hex alpha to 3 decimals, an
  // alpha as written, uppercase function names unknown.
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.1.0' }, 'color: #ff000080'), [
    'rgba(255, 0, 0, 0.502)',
    'rgba(255, 0, 0, 0.502)',
  ]);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.1.0' }, 'color: rgba(0,0,0,.123456)'), [
    'rgba(0, 0, 0, 0.123456)',
    'rgba(0, 0, 0, 0.123456)',
  ]);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.1.0' }, 'color: RGB(1, 2, 3)'), ['', '']);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.2.0' }, 'color: RGB(1, 2, 3)'), ['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
  // An alpha given as a number to 3 decimals (cssstyle 4.2 and later, jsdom 27 and later).
  assert.deepEqual(profileColor({ jsdom: '30.1.3' }, 'color: rgba(0,0,0,.1234)'), [
    'rgba(0, 0, 0, 0.123)',
    'rgba(0, 0, 0, 0.123)',
  ]);
  assert.deepEqual(profileColor({ jsdom: '30.1.3' }, 'color: rgba(0,0,0,0.9999)'), ['rgb(0, 0, 0)', 'rgb(0, 0, 0)']);
});

test('computed values: cssstyle 5 drops system colors in the border sides, a lone one in background (jsdom 27.0 to 28.0)', () => {
  for (const [jsdom, dropped] of [
    ['27.0.0', true],
    ['28.0.0', true],
    ['28.1.0', false],
  ]) {
    const w = createWindow({ jsdom });
    const el = w.document.createElement('div');
    el.style.background = 'ButtonFace';
    el.style.borderLeft = '1px solid Canvas';
    el.style.color = 'Canvas';
    assert.deepEqual(
      [el.style.backgroundColor, el.style.borderLeftColor, el.style.color],
      dropped ? ['', '', 'canvas'] : ['buttonface', 'canvas', 'canvas'],
      jsdom,
    );
    el.style.border = '1px solid Canvas';
    el.style.background = 'Canvas url(a.png)';
    assert.deepEqual([el.style.borderTopColor, el.style.backgroundColor], ['canvas', 'canvas'], jsdom);
  }
});

// The dialog's user agent styles (#76): named colors as written before
// jsdom 22.1.0, an open dialog's display '' before 27.
function dialogs(w) {
  const d = w.document;
  const closed = d.body.appendChild(d.createElement('dialog'));
  const open = d.body.appendChild(d.createElement('dialog'));
  open.setAttribute('open', '');
  const props = [
    'display',
    'position',
    'color',
    'background-color',
    'padding-top',
    'margin-top',
    'border-top-style',
    'border-top-width',
    'border-top-color',
    'left',
    'right',
    'width',
    'height',
    'inset-inline-start',
  ];
  return [read(w, closed, props), read(w, open, props)];
}
for (const jsdom of JSDOMS) parity(`computed values: dialog (jsdom ${jsdom}, #76)`, dialogs, { jsdom });

// --- zero lengths ------------------------------------------------------------------

// A 0 length stays 0 before jsdom 28.1.0 where cssstyle does not parse the
// property (text-indent, min-width); cssstyle before 4.4 keeps border
// widths and border-spacing so too.
const ZEROS = [
  'text-indent',
  'letter-spacing',
  'min-width',
  'outline-offset',
  'border-top-width',
  'border-spacing',
  'width',
  'margin-top',
  'vertical-align',
  'column-gap',
];
function zeros(w) {
  const d = w.document;
  d.head.innerHTML = `<style>.z { ${ZEROS.map((p) => `${p}: 0`).join('; ')} } .m { margin: 0; padding: 0 }</style>`;
  const sheet = d.body.appendChild(d.createElement('div'));
  sheet.className = 'z';
  const inline = d.body.appendChild(d.createElement('div'));
  for (const p of ZEROS) inline.style.setProperty(p, '0');
  const box = d.body.appendChild(d.createElement('div'));
  box.className = 'm';
  const ua = ['ruby', 'rt', 'input', 'button', 'textarea'].map(
    (tag) => read(w, d.body.appendChild(d.createElement(tag)), ['text-indent'])[0],
  );
  return {
    sheet: read(w, sheet, ZEROS),
    declared: ZEROS.map((p) => inline.style.getPropertyValue(p)),
    inline: read(w, inline, ZEROS),
    box: read(w, box, ['margin-top', 'padding-left']),
    ua,
  };
}
for (const jsdom of JSDOMS) parity(`computed values: zero lengths (jsdom ${jsdom})`, zeros, { jsdom });

test('computed values: a 0 length is 0px from jsdom 28.1.0', () => {
  const zero = (profile, prop) => profileColor(profile, `${prop}: 0`, prop);
  for (const jsdom of ['20.0.3', '26.1.0', '27.0.0', '27.4.0', '28.0.0']) {
    assert.deepEqual(zero({ jsdom }, 'text-indent'), ['0', '0'], jsdom);
    assert.deepEqual(zero({ jsdom }, 'min-width'), ['0', '0'], jsdom);
    assert.deepEqual(zero({ jsdom }, 'width'), ['0px', '0px'], jsdom);
  }
  for (const jsdom of ['28.1.0', '29.0.1', '30.1.3']) {
    assert.deepEqual(zero({ jsdom }, 'text-indent'), ['0px', '0px'], jsdom);
    assert.deepEqual(zero({ jsdom }, 'vertical-align'), ['0px', '0px'], jsdom);
  }
  // cssstyle 4.4 parses border widths and border-spacing.
  assert.deepEqual(zero({ jsdom: '26.1.0', cssstyle: '4.3.1' }, 'border-top-width'), ['0', '0']);
  assert.deepEqual(zero({ jsdom: '26.1.0', cssstyle: '4.4.0' }, 'border-top-width'), ['0px', '0px']);
});

// --- box shorthands ----------------------------------------------------------------

// jsdom 20 to 26 keep margin, padding and border-width as written (the
// user agent sheet's button padding 2px 6px 3px 6px); cssstyle 4.4 and
// later read margin and padding in their shortest form (cssText keeps
// them as written); a side that is '' leaves the shorthand ''.
function boxes(w) {
  const d = w.document;
  d.head.innerHTML =
    '<style>.a { padding: 2px 6px 3px 6px; margin: 0 auto 0 auto; border-width: 1px 1px; border-style: solid } .b { padding: 1px 1px 1px }' +
    ' .c { padding: 1px 2px; padding-left: 5px } .d { padding-left: 2px }</style>';
  const out = {};
  for (const cls of ['a', 'b', 'c', 'd']) {
    const el = d.body.appendChild(d.createElement('div'));
    el.className = cls;
    out[cls] = read(w, el, ['padding', 'margin', 'border-width']);
  }
  for (const tag of ['button', 'option']) out[tag] = read(w, d.body.appendChild(d.createElement(tag)), ['padding']);
  const el = d.createElement('div');
  el.style.padding = '2px 6px 3px 6px';
  el.style.margin = '0 auto 0 auto';
  el.style.borderWidth = '1px 1px';
  out.style = [el.style.padding, el.style.margin, el.style.borderWidth, el.style.cssText];
  const sides = d.createElement('div');
  for (const side of ['top', 'right', 'bottom', 'left']) sides.style.setProperty(`margin-${side}`, '1px');
  out.sides = [sides.style.margin, sides.style.cssText];
  return out;
}
for (const jsdom of JSDOMS) parity(`computed values: box shorthands (jsdom ${jsdom})`, boxes, { jsdom });

// The computed style's padding and margin accessors (cssstyle 4.4 and
// later read them through the longhands before jsdom 27): '' when a side
// is (padding-left: 2px alone, an inline element's padding-top), a var()
// or CSS-wide keyword as declared. In a window of their own: in jsdom
// 29.1.1 reading border-width: 1px 1px first turns these 0 into 0px.
function boxAccessors(w) {
  const d = w.document;
  d.head.innerHTML =
    '<style>.d { padding-left: 2px } .e { padding: var(--p); margin: inherit } .f { padding: initial }</style>';
  const out = {};
  const box = (el) => {
    const cs = w.getComputedStyle(el);
    return [cs.padding, cs.margin, cs.getPropertyValue('padding'), cs.getPropertyValue('margin')];
  };
  for (const cls of ['d', 'e', 'f']) {
    const el = d.body.appendChild(d.createElement('div'));
    el.className = cls;
    out[cls] = box(el);
  }
  for (const tag of ['p', 'button']) out[tag] = box(d.body.appendChild(d.createElement(tag)));
  const inline = d.body.appendChild(d.createElement('span'));
  inline.style.paddingTop = '4px';
  out.inline = box(inline);
  return out;
}
for (const jsdom of JSDOMS)
  parity(`computed values: padding and margin accessors (jsdom ${jsdom})`, boxAccessors, { jsdom });

// cssstyle 4.4 and later (jsdom 26): a function is one side of the
// shortest form (calc(100% - 2px) calc(100% - 2px) is calc(100% - 2px)),
// a value with var() stays as written. jsdom 27 and later: #112.
parity(
  'computed values: margin and padding with functions (jsdom 26)',
  (w) => {
    const out = {};
    for (const [prop, value] of [
      ['padding', 'calc(100% - 2px) calc(100% - 2px)'],
      ['margin', 'calc(100% - 2px) 1px calc(100% - 2px) 1px'],
      ['margin', 'calc(100% - 2px) 1px calc(100% - 2px)'],
      ['padding', 'calc(10%) 1px 2px 3px'],
      ['margin', 'var(--a) var(--a)'],
    ]) {
      const el = w.document.body.appendChild(w.document.createElement('div'));
      el.style.setProperty(prop, value);
      const cs = w.getComputedStyle(el);
      out[`${prop} ${value}`] = [el.style[prop], el.style.cssText, cs[prop], cs.getPropertyValue(prop)];
    }
    return out;
  },
  { jsdom: 26 },
);

test('computed values: margin and padding as written before cssstyle 4.4', () => {
  const box = (cssstyle) => {
    const w = createWindow({ jsdom: '26.1.0', cssstyle });
    const el = w.document.body.appendChild(w.document.createElement('div'));
    el.style.padding = '1px 2px 1px 2px';
    return [el.style.padding, el.style.cssText, w.getComputedStyle(el).padding];
  };
  assert.deepEqual(box('4.3.1'), ['1px 2px 1px 2px', 'padding: 1px 2px 1px 2px;', '1px 2px 1px 2px']);
  assert.deepEqual(box('4.4.0'), ['1px 2px', 'padding: 1px 2px 1px 2px;', '1px 2px']);
});

// --- :link -------------------------------------------------------------------------

// An SVG a with an href matches :link and :any-link, as in jsdom (from 27
// the user agent sheet's link color and cursor apply); xlink:href does not.
function svgLinks(w) {
  const d = w.document;
  d.body.innerHTML =
    '<svg><a href="#x" id="sa"><text>t</text></a><a id="sb"><text>u</text></a></svg><a href="#y" id="ha">h</a>';
  const xlink = d.createElementNS('http://www.w3.org/2000/svg', 'a');
  xlink.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#z');
  d.querySelector('svg').append(xlink);
  const out = [...d.querySelectorAll('a')].map((a) => [
    a.matches(':link'),
    a.matches(':any-link'),
    ...read(w, a, ['color', 'cursor', 'text-decoration']),
  ]);
  return { out, count: d.querySelectorAll(':link').length, closest: d.querySelector('text').closest(':any-link')?.id };
}
for (const jsdom of JSDOMS) parity(`computed values: :link on SVG links (jsdom ${jsdom})`, svgLinks, { jsdom });

// --- font-family and vertical-align ------------------------------------------------

// From jsdom 29.0.2 font-family's initial value is 'depends on user
// agent', and vertical-align: inherit inherits (the user agent sheet's td
// and tr: middle from tbody), baseline from a parent without one.
function inherited(w) {
  const d = w.document;
  d.head.innerHTML =
    '<style>.p { vertical-align: middle; font-family: Georgia } .i { vertical-align: inherit; font-family: inherit } .n { font-family: initial } .u { font-family: unset }</style>';
  d.body.innerHTML =
    '<div class="p"><span class="i" id="a"></span><span class="n" id="b"></span></div><div><span class="i" id="c"></span><span class="u" id="d"></span></div>' +
    '<table><tbody><tr id="tr"><td id="td">x</td></tr></tbody></table><pre id="pre"></pre>';
  const out = {};
  for (const el of [...d.querySelectorAll('[id]'), d.documentElement, d.body])
    out[el.id || el.localName] = read(w, el, ['font-family', 'vertical-align']);
  out.detached = read(w, d.createElement('div'), ['font-family']);
  return out;
}
for (const jsdom of JSDOMS)
  parity(`computed values: font-family and vertical-align (jsdom ${jsdom})`, inherited, { jsdom });

test('computed values: font-family depends on user agent from jsdom 29.0.2', () => {
  for (const [jsdom, family] of [
    ['29.0.1', ''],
    ['29.0.2', 'depends on user agent'],
    ['30.1.3', 'depends on user agent'],
  ]) {
    const w = createWindow({ jsdom });
    assert.equal(w.getComputedStyle(w.document.body).fontFamily, family, jsdom);
  }
});

// --- lengths, font sizes and weights (jsdom 30) -------------------------------------

// jsdom 30 computes lengths to px: em from the element's font size (font
// size from its parent's), rem from the root's, viewport units from 1024 x
// 768, physical units at 96px to the inch, calc(), min(), max() and
// clamp(); font size keywords, larger and smaller; from 30.1.0 bolder and
// lighter. Percentages (but a font size's), lists and the dynamic
// viewport units stay as declared.
const UNITS = [
  '2em',
  '-1em',
  '.5em',
  '1rem',
  '1ex',
  '1ch',
  '1lh',
  '1rlh',
  '10vw',
  '10vh',
  '10vmin',
  '10vmax',
  '10svw',
  '1cm',
  '1mm',
  '1in',
  '1pt',
  '1pc',
  '4q',
  '10%',
  'calc(2em)',
  'calc(1em + 2px)',
  'calc(1000px / 3)',
  'min(2em, 10px)',
  'max(1em, 30px)',
  '13.33333333px',
  'var(--x, 2em)',
  'calc(1em * min(2, 3))',
  'calc(1em * max(2, 3))',
  'calc(1em * clamp(1, 2, 3))',
  'calc(min(2, 4) * 10px)',
];
function lengths(w, units = UNITS) {
  const d = w.document;
  d.documentElement.style.fontSize = '10px';
  const parent = d.body.appendChild(d.createElement('div'));
  parent.style.fontSize = '20px';
  const out = {};
  for (const value of units) {
    const el = parent.appendChild(d.createElement('div'));
    for (const p of ['width', 'margin-left', 'font-size', 'line-height', 'text-indent', 'border-top-left-radius'])
      el.style.setProperty(p, value);
    out[value] = read(w, el, [
      'width',
      'margin-left',
      'font-size',
      'line-height',
      'text-indent',
      'border-top-left-radius',
    ]);
  }
  d.head.innerHTML = '<style>.k { padding: 1em 2em } .g { gap: 2em; vertical-align: 2em }</style>';
  for (const cls of ['k', 'g']) {
    const el = parent.appendChild(d.createElement('div'));
    el.className = cls;
    out[cls] = read(w, el, ['padding', 'padding-left', 'gap', 'vertical-align']);
  }
  for (const size of [
    'xx-small',
    'x-small',
    'small',
    'medium',
    'large',
    'x-large',
    'xx-large',
    'xxx-large',
    'larger',
    'smaller',
    '150%',
  ]) {
    const el = parent.appendChild(d.createElement('div'));
    el.style.fontSize = size;
    out[size] = read(w, el, ['font-size']);
  }
  for (const weight of ['100', '400', '600', '700', '900', '920', '1000']) {
    const el = parent.appendChild(d.createElement('div'));
    el.style.fontWeight = weight;
    out[weight] = ['bolder', 'lighter'].map((keyword) => {
      const child = el.appendChild(d.createElement('span'));
      child.style.fontWeight = keyword;
      return read(w, child, ['font-weight'])[0];
    });
  }
  for (const tag of ['h1', 'h2', 'h5', 'b', 'small', 'big', 'sub', 'dialog'])
    out[tag] = read(w, d.body.appendChild(d.createElement(tag)), ['font-size', 'font-weight', 'padding-top']);
  const h1 = d.body.appendChild(d.createElement('h1'));
  out.h1b = read(w, h1.appendChild(d.createElement('b')), ['font-size', 'font-weight']);
  const detached = d.createElement('div');
  detached.style.width = '2em';
  out.detached = read(w, detached, ['width', 'font-size']);
  return out;
}
parity('computed values: lengths, font sizes and weights (jsdom 30)', lengths);
// jsdom 29 for the values before (without the math functions its parser
// simplifies or drops; older ones differ in which units cssstyle takes).
parity(
  'computed values: lengths, font sizes and weights (jsdom 29)',
  (w) =>
    lengths(
      w,
      UNITS.filter((u) => !/(min|max|clamp)\(|\//.test(u)),
    ),
  { jsdom: 29 },
);

test('computed values: em, keywords and bolder per jsdom 30 release', () => {
  for (const [jsdom, h1, b] of [
    ['29.1.1', '2em', 'bolder'],
    ['30.0.0', '32px', 'bolder'],
    ['30.1.0', '32px', '700'],
    ['30.1.3', '32px', '700'],
  ]) {
    const w = createWindow({ jsdom });
    const d = w.document;
    assert.equal(w.getComputedStyle(d.body.appendChild(d.createElement('h1'))).fontSize, h1, jsdom);
    assert.equal(w.getComputedStyle(d.body.appendChild(d.createElement('b'))).fontWeight, b, jsdom);
  }
});

test('computed values: the cssstyle each jsdom release installs is the default', () => {
  // cssstyle 3 keeps Red as written; 4.6 (jsdom 23.1.0 and later) lowercases it and knows Canvas.
  for (const [jsdom, red, canvas] of [
    ['21.0.0', 'Red', ''],
    ['21.1.2', 'Red', ''],
    ['23.0.0', 'Red', ''],
    ['23.1.0', 'red', 'canvas'],
    ['24.1.3', 'red', 'canvas'],
  ]) {
    assert.equal(profileColor({ jsdom }, 'color: Red')[0], red, jsdom);
    assert.equal(profileColor({ jsdom }, 'color: Canvas')[0], canvas, jsdom);
  }
});

// --- shorthands with var() ---------------------------------------------------------

// A box shorthand declared with var() hides the user agent sheet's and
// earlier longhands (padding-top '', from 29.0.2 0): Ant Design's autosize
// TextArea reads a textarea's padding and border widths
// (computedStyle['padding-bottom']) with padding: var(--p) var(--q) and
// border-width: var(--w) declared, and writes heights from them.
const VAR_PROPS = [
  'padding',
  'padding-top',
  'padding-left',
  'padding-bottom',
  'border-width',
  'border-top-width',
  'border-bottom-width',
  'border-top-style',
  'border-style',
  'margin',
  'margin-top',
];
function varShorthands(w) {
  const d = w.document;
  d.head.innerHTML = `<style>
    .v { --p: 4px; --q: 11px; --lw: 1px }
    .a { box-sizing: border-box; padding: var(--p) var(--q) }
    .b { border-width: var(--lw); border-style: var(--lt) }
    .c { padding-top: 3px; margin-top: 3px }
    .d { padding: var(--p); margin: var(--p) 1px }
    .e { padding-top: 5px }
    .f { border: var(--lw) solid red }
    .g { border-top: var(--lw) solid }
  </style>`;
  const out = {};
  for (const tag of ['textarea', 'input', 'div', 'button']) {
    for (const cls of ['v a b', 'v a', 'v b', 'c d', 'd e', 'v f', 'v g', 'c', '']) {
      const el = d.body.appendChild(d.createElement(tag));
      el.className = cls;
      const cs = w.getComputedStyle(el);
      out[`${tag}.${cls}`] = VAR_PROPS.map((p) => [cs.getPropertyValue(p), cs[p]]);
    }
  }
  return out;
}
for (const jsdom of JSDOMS) parity(`computed values: shorthands with var() (jsdom ${jsdom})`, varShorthands, { jsdom });

// Their per-version details from jsdom 26 (cssstyle 4.6): before 27 the
// border shorthands hide only the user agent sheet's widths and styles
// (and a side its own longhands), in jsdom 28.1 and 29 an !important one does not
// override another !important declaration, and in the style attribute a
// longhand after one is dropped from 27 (before, the shorthand is).
const VAR_DETAIL_PROPS = [
  'padding',
  'padding-top',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'border-left-width',
  'border-width',
  'border-style',
  'border-top',
  'border',
  'margin-top',
  'font-size',
  'font-weight',
  'line-height',
  'flex-grow',
  'flex-basis',
  'background-color',
  'background-image',
];
function varShorthandDetails(w) {
  const d = w.document;
  d.head.innerHTML = `<style>
    .p { font-size: 20px; font-weight: 700; line-height: 3; font-family: serif }
    .c { padding-top: 3px; margin-top: 3px; flex-grow: 2; background-color: red; border-top: 2px dotted blue }
    .q { border-bottom: 3px dashed green; border-left-width: 4px }
    .f { font: var(--f) } .x { flex: var(--x) } .b { background: var(--b) } .bp { background-position: var(--bp) }
    .bt { border-top: var(--bt) } .bc { border-color: var(--bc) } .bs { border-style: var(--bs) }
    .bw { border-width: var(--bw) } .bb { border: var(--b) } .bwt { border-width: 1px var(--bw) }
    .i { padding: 1px !important } .j { padding: var(--p) !important }
  </style>`;
  const out = {};
  const parent = d.body.appendChild(d.createElement('div'));
  parent.className = 'p';
  const read = (el, key) => {
    const cs = w.getComputedStyle(el);
    out[key] = VAR_DETAIL_PROPS.map((p) => [cs.getPropertyValue(p), cs[p]]);
  };
  for (const tag of ['div', 'textarea', 'button']) {
    for (const cls of [
      'f',
      'c f',
      'x',
      'c x',
      'b',
      'c b',
      'bp',
      'bt',
      'c bt',
      'bc',
      'c bc',
      'bs',
      'c bs',
      'i j',
      'j',
      'c j',
      'q bt',
      'bw',
      'q bw',
      'bb',
      'q bb',
      'bwt',
      'q bwt',
    ]) {
      const el = parent.appendChild(d.createElement(tag));
      el.className = cls;
      read(el, `${tag}.${cls}`);
    }
    for (const style of [
      'padding: var(--p)',
      'padding-top: 4px; padding: var(--p)',
      'padding: var(--p); padding-top: 4px',
      'border: var(--b)',
      'font: var(--f)',
    ]) {
      const el = parent.appendChild(d.createElement(tag));
      el.className = 'c';
      el.setAttribute('style', style);
      read(el, `${tag}[${style}]`);
    }
  }
  return out;
}
for (const jsdom of [26, 27, 28, 29, 30])
  parity(`computed values: shorthands with var(), per version (jsdom ${jsdom})`, varShorthandDetails, { jsdom });

test('computed values: shorthands with var() before cssstyle 4.4 keep the user agent sheet', () => {
  for (const [cssstyle, top] of [
    ['4.1.0', '2px'],
    ['4.6.0', ''],
  ]) {
    const w = createWindow({ jsdom: '26.1.0', cssstyle });
    const d = w.document;
    d.head.innerHTML = '<style>.a { padding: var(--p) }</style>';
    const el = d.body.appendChild(d.createElement('textarea'));
    el.className = 'a';
    assert.equal(w.getComputedStyle(el).paddingTop, top, cssstyle);
  }
});

// A pending longhand and a longhand declared as itself meet by order, not
// by importance or specificity, before jsdom 30.1.3 (from it only two
// !important ones do). Ant Design's bordered Descriptions declares
// padding: var(--p) var(--q) on its cells and padding-bottom: var(--b) in
// a later, less specific rule (and padding-bottom: 0 for the last row);
// its tests read the cell's padding-bottom.
const BY_ORDER_PROPS = [
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-bottom',
  'border-bottom-width',
  'border-bottom',
];
const BY_ORDER = {
  antd: `.d.d > .v > table > tbody > .r > td { padding: var(--p) var(--q) }
    .d > .v > table > tbody > .r > td { padding-bottom: var(--b) }
    .d > .v > table > tbody > .r:last-child > td { padding-bottom: 0 }`,
  shorthandFirst: '.d.d td { padding: var(--p) var(--q) } td { padding-bottom: 7px }',
  shorthandLast: '.d.d td { padding-bottom: 7px } td { padding: var(--p) }',
  importantShorthand: '.d.d td { padding: var(--p) !important } td { padding-bottom: 7px }',
  importantLonghand: 'td { padding-bottom: 7px !important } .d.d td { padding: var(--p) }',
  bothImportantShorthandFirst: '.d.d td { padding: var(--p) !important } td { padding-bottom: 7px !important }',
  bothImportantShorthandLast: '.d.d td { padding-bottom: 7px !important } td { padding: var(--p) !important }',
  margin: '.d.d td { margin: var(--m) } td { margin-bottom: 7px }',
  borderSide: '.d.d td { border-bottom: var(--b) } td { border-bottom-width: 7px }',
  laterSheet: ['.d.d td { padding: var(--p) }', 'td { padding-bottom: 7px }'],
  // Three rules: before jsdom 28.1 the latest one (pending here: all rules
  // apply in document order), from 28.1 each declared property's winner by
  // specificity (7px).
  pendingAfter: '.d.d td { padding: var(--a) } td { padding-bottom: 7px } td { padding: var(--a) }',
  pendingAfterMoreSpecific: 'td { padding: var(--a) } td { padding-bottom: 7px } .d.d td { padding: var(--a) }',
  declaredAfter: '.d.d td { padding-bottom: 3px } td { padding: var(--a) } td { padding-bottom: 7px }',
  declaredAfterMoreSpecific: 'td { padding-bottom: 3px } td { padding: var(--a) } .d.d td { padding-bottom: 7px }',
  importantBetween: '.d.d td { padding: var(--a) } td { padding-bottom: 7px !important } td { padding: var(--a) }',
  styleAttribute: '.d.d td { padding: var(--p) } td { padding-bottom: 7px }',
  // The style attribute's padding-bottom over pending and declared ones.
  styleAttributeLonghand: '.d.d td { padding: var(--p) } td { padding-bottom: 7px } td { padding: var(--q) }',
  styleAttributeImportant: '.d.d td { padding: var(--p) !important } td { padding-bottom: 7px }',
  // A shorthand without var() that wins, with pending rules elsewhere.
  settledWinner: '.d.d td { padding: 8px } .none td { padding: var(--p) } .none td { padding-bottom: 7px }',
};
function pendingByOrder(w) {
  const d = w.document;
  const out = {};
  for (const [key, css] of Object.entries(BY_ORDER)) {
    d.head.textContent = '';
    // One style element per sheet, in order.
    for (const text of [css].flat()) d.head.appendChild(d.createElement('style')).textContent = text;
    d.body.innerHTML =
      '<div class="d"><div class="v"><table><tbody><tr class="r"><td>a</td></tr><tr class="r"><td>b</td></tr></tbody></table></div></div>';
    for (const td of d.querySelectorAll('td')) {
      if (key === 'styleAttribute') td.setAttribute('style', 'padding-top: 2px');
      if (key.startsWith('styleAttribute') && key !== 'styleAttribute') td.setAttribute('style', 'padding-bottom: 3px');
      const cs = w.getComputedStyle(td);
      out[`${key} ${td.textContent}`] = BY_ORDER_PROPS.map((p) => [cs.getPropertyValue(p), cs[p]]);
    }
  }
  return out;
}
for (const jsdom of [26, 27, 28, 29, 30])
  parity(`computed values: a pending longhand and a declared one meet by order (jsdom ${jsdom})`, pendingByOrder, {
    jsdom,
  });

test('computed values: a pending longhand and a declared one meet by order before jsdom 30.1.3', () => {
  const read = (jsdom, css) => {
    const w = createWindow({ jsdom });
    const d = w.document;
    d.head.innerHTML = `<style>${css}</style>`;
    d.body.innerHTML = '<div class="d"><table><tbody><tr><td></td></tr></tbody></table></div>';
    return w.getComputedStyle(d.querySelector('td')).paddingBottom;
  };
  // jsdom 30.1.0 to 30.1.2: the later one; 30.1.3: the more specific one,
  // the later one of two !important ones.
  for (const [jsdom, first, last, important] of [
    ['30.1.2', '7px', '0', '7px'],
    ['30.1.3', '0', '7px', '7px'],
  ]) {
    assert.equal(read(jsdom, '.d.d td { padding: var(--p) } td { padding-bottom: 7px }'), first, jsdom);
    assert.equal(read(jsdom, '.d.d td { padding-bottom: 7px } td { padding: var(--p) }'), last, jsdom);
    assert.equal(
      read(jsdom, '.d.d td { padding: var(--p) !important } td { padding-bottom: 7px !important }'),
      important,
      jsdom,
    );
  }
  // Before cssstyle 4.4 a shorthand with var() declares no longhands.
  const w = createWindow({ jsdom: '26.1.0', cssstyle: '4.1.0' });
  w.document.head.innerHTML = '<style>.d.d td { padding: var(--p) } td { padding-bottom: 7px }</style>';
  w.document.body.innerHTML = '<div class="d"><table><tbody><tr><td></td></tr></tbody></table></div>';
  assert.equal(w.getComputedStyle(w.document.querySelector('td')).paddingBottom, '7px');
});

// --- document order (#121) ---------------------------------------------------------

// Before jsdom 28.1.0 (black box, 20.0.0 to 28.0.0, on clean installs of
// each release) the page's style rules apply in document order: selector
// specificity and !important count for nothing, the style attribute wins
// over all rules, and any rule over the user agent sheet. The sheets are
// in document.styleSheets order, which before 30.1.2 is the order they
// were created in (a <style> inserted before another, or one whose text
// changes, comes last). Rules in @media screen apply at their place, in
// @media all (or an empty list) only from 29.
const ORDER_PROPS = ['color', 'padding-top', 'padding-bottom', 'padding', 'border-top-color', 'display', '--x'];
const ORDER = {
  specificity: '.a.b > td { color: red } td { color: blue }',
  specificityLast: 'td { color: blue } .a.b > td { color: red }',
  id: '#c { color: red } td { color: blue }',
  selectorList: '.b, .a.b > td { color: red } td { color: blue }',
  important: 'td { color: blue !important } .a.b > td { color: red }',
  importantBoth: '#c { color: red !important } td { color: blue !important }',
  importantSameSpecificity: '.a > td { color: red !important } .b > td { color: blue }',
  sheets: ['.a.b > td { color: red }', 'td { color: blue }'],
  sheetsLast: ['td { color: blue }', '.a.b > td { color: red }'],
  mediaScreen: '@media screen { .a.b > td { color: red } } td { color: blue }',
  mediaScreenLast: '.a.b > td { color: red } @media screen { td { color: blue } }',
  mediaAll: '.a > td { color: red } @media all { .b > td { color: blue } }',
  mediaEmpty: '.a > td { color: red } @media { .b > td { color: blue } }',
  supports: '.a > td { color: red } @supports (color: red) { .b > td { color: blue } }',
  custom: '.a.b > td { --x: 1 } td { --x: 2 }',
  longhandFirst: '.a.b > td { padding-top: 2px } td { padding: 1px }',
  shorthandFirst: '.a.b > td { padding: 1px } td { padding-top: 2px }',
  border: '.a.b > td { border: 1px solid red } td { border-top-color: blue }',
  display: '.a.b > td { display: none } td { display: block }',
  pendingFirst: '.a.b > td { padding: var(--p) } td { padding-bottom: 7px }',
  pendingLast: '.a.b > td { padding-bottom: 7px } td { padding: var(--p) }',
  pendingThree: '.a.b > td { padding: var(--a) } td { padding-bottom: 7px } td { padding: var(--b) }',
  varThenPlain: '.a.b > td { padding: var(--p) } td { padding: 3px }',
  plainThenVar: '.a.b > td { padding: 3px } td { padding: var(--p) }',
  styleAttribute: 'td { color: blue !important }',
  styleAttributeImportant: 'td { color: blue !important }',
};
// Sheets changed after they were made: [initial sheets, change].
const SHEET_CHANGES = {
  insertedBefore: [
    ['.b > td { color: red }'],
    (d) => d.head.prepend(Object.assign(d.createElement('style'), { textContent: '.a > td { color: blue }' })),
  ],
  textChanged: [
    ['.a > td { color: blue }', '.b > td { color: red }'],
    (d) => (d.head.firstChild.textContent = '.a > td { color: green }'),
  ],
  sameText: [
    ['.a > td { color: blue }', '.b > td { color: red }'],
    (d) => (d.head.firstChild.textContent = d.head.firstChild.textContent),
  ],
  textAppended: [
    ['.a > td { color: blue }', '.b > td { color: red }'],
    (d) => d.head.firstChild.appendChild(d.createTextNode(' ')),
  ],
  moved: [['.a > td { color: blue }', '.b > td { color: red }'], (d) => d.head.prepend(d.head.lastChild)],
  // A comment or an element in a style element does not make a new sheet.
  comment: [
    ['.a > td { color: blue }', '.b > td { color: red }'],
    (d) => d.head.firstChild.appendChild(d.createComment('c')),
  ],
  element: [
    ['.a > td { color: blue }', '.b > td { color: red }'],
    (d) => d.head.firstChild.appendChild(d.createElement('b')),
  ],
  // A moved style element's sheet is made again from its text, and so is
  // one whose text is set to the same data.
  movedAfterEdit: [
    ['.a > td { color: red }', '.b > td { color: red }'],
    (d) => {
      d.styleSheets[1].cssRules[0].style.color = 'blue';
      d.head.prepend(d.head.lastChild);
    },
  ],
  sameDataAfterEdit: [
    ['.a > td { color: red }', '.b > td { color: red }'],
    (d) => {
      d.styleSheets[0].cssRules[0].style.color = 'blue';
      const text = d.head.firstChild.firstChild;
      text.data = text.data;
    },
  ],
  insertRule: [['.a > td { color: blue }', '.b > td { color: red }'], (d) => d.styleSheets[0].insertRule('td { }', 1)],
  ruleStyle: [
    ['.a.b > td { color: red } td { color: blue }'],
    (d) => (d.styleSheets[0].cssRules[0].style.color = 'green'),
  ],
  insertRuleFirst: [['.a.b > td { color: red }'], (d) => d.styleSheets[0].insertRule('td { color: blue }', 0)],
};
const ORDER_TABLE = '<table><tbody><tr class="a b"><td id="c">a</td></tr></tbody></table>';
function documentOrder(w, skip = new Set()) {
  const d = w.document;
  const out = {};
  const sheets = (texts) => {
    d.head.textContent = '';
    for (const text of texts) d.head.appendChild(d.createElement('style')).textContent = text;
  };
  const record = (key) => {
    const td = d.querySelector('td');
    const cs = w.getComputedStyle(td);
    out[key] = ORDER_PROPS.map((p) => cs.getPropertyValue(p));
  };
  for (const [key, css] of Object.entries(ORDER)) {
    if (skip.has(key)) continue;
    sheets([css].flat());
    d.body.innerHTML = ORDER_TABLE;
    if (key === 'styleAttribute') d.querySelector('td').setAttribute('style', 'color: green');
    if (key === 'styleAttributeImportant') d.querySelector('td').setAttribute('style', 'color: green !important');
    record(key);
  }
  d.body.innerHTML = ORDER_TABLE;
  for (const [key, [texts, change]] of Object.entries(SHEET_CHANGES)) {
    if (skip.has(key)) continue;
    sheets(texts);
    w.getComputedStyle(d.querySelector('td')).color;
    change(d);
    record(key);
    out[`${key} sheets`] = [...d.styleSheets].map((sheet) => [...sheet.cssRules].map((r) => r.selectorText).join());
  }
  return out;
}
// From jsdom 28.1 these differ otherwise, not modeled: two !important
// rules meet by order, a shorthand after a more specific longhand wins
// (to 30.1.2) (#136), and a rule's style edited after a read does not
// change the computed style (to 30.0.1, #137).
const NEWER_GAPS = new Set(['importantBoth', 'longhandFirst', 'shorthandFirst', 'border', 'varThenPlain', 'ruleStyle']);
for (const jsdom of JSDOMS)
  parity(
    `computed values: style rules in document order before jsdom 28.1 (jsdom ${jsdom})`,
    (w) => documentOrder(w, jsdom >= 28 ? NEWER_GAPS : undefined),
    { jsdom },
  );

// Before jsdom 28.1.0 the user agent sheet is under all of the page's
// rules, its [hidden] { display: none } too: a display rule shows an element
// with the hidden attribute. (From 28.1.0 jsdom cascades the user agent
// sheet's rules with the page's by specificity, not modeled: #136.)
function underRules(w) {
  const d = w.document;
  d.head.innerHTML =
    '<style>* { font-weight: normal } :where(div) { display: inline } .x { display: block } span { display: flex } #t { display: block } .a.b { display: none } div.a { display: block }</style>';
  d.body.innerHTML =
    '<b>b</b><div>div</div><p class="x" hidden>p</p><span hidden>span</span><section id="t" hidden>s</section><div class="a b" hidden>d</div><i hidden>i</i><div hidden style="display: inline">inline</div><embed hidden>';
  return [...d.body.children].map((el) => {
    const cs = w.getComputedStyle(el);
    return [el.localName, cs.display, cs.fontWeight];
  });
}
for (const jsdom of [20, 22, 25, 26, 27])
  parity(`computed values: the user agent sheet under all rules before jsdom 28.1 (jsdom ${jsdom})`, underRules, {
    jsdom,
  });

test('computed values: document order to jsdom 28.0.0, specificity from 28.1.0', () => {
  const read = (jsdom, css, markup = ORDER_TABLE, prop = 'color') => {
    const w = createWindow({ jsdom });
    w.document.head.innerHTML = `<style>${css}</style>`;
    w.document.body.innerHTML = markup;
    return w
      .getComputedStyle(
        w.document.body.firstElementChild.matches('table')
          ? w.document.querySelector('td')
          : w.document.body.firstElementChild,
      )
      .getPropertyValue(prop);
  };
  for (const [jsdom, specificity, important, hidden] of [
    ['20.0.0', 'blue', 'red', 'block'],
    ['27.4.0', 'rgb(0, 0, 255)', 'rgb(255, 0, 0)', 'block'],
    ['28.0.0', 'rgb(0, 0, 255)', 'rgb(255, 0, 0)', 'block'],
    ['28.1.0', 'rgb(255, 0, 0)', 'rgb(0, 0, 255)', 'none'],
  ]) {
    assert.equal(read(jsdom, ORDER.specificity), specificity, jsdom);
    assert.equal(read(jsdom, ORDER.important), important, jsdom);
    assert.equal(read(jsdom, 'div { display: block }', '<div hidden></div>', 'display'), hidden, jsdom);
  }
});

test('computed values: @media all applies from jsdom 29.0.0', () => {
  for (const [jsdom, color] of [
    ['28.1.0', 'rgb(0, 0, 0)'],
    ['29.0.0', 'rgb(0, 0, 255)'],
  ]) {
    const w = createWindow({ jsdom });
    w.document.head.innerHTML = '<style>@media all { div { color: blue } }</style>';
    w.document.body.innerHTML = '<div></div>';
    assert.equal(w.getComputedStyle(w.document.querySelector('div')).color, color, jsdom);
  }
});

test('computed values: style sheets in creation order before jsdom 30.1.2', () => {
  for (const [jsdom, order, color] of [
    ['30.0.1', '.b .a', 'rgb(0, 0, 255)'],
    ['30.1.2', '.a .b', 'rgb(255, 0, 0)'],
  ]) {
    const w = createWindow({ jsdom });
    const d = w.document;
    d.head.innerHTML = '<style>.b { color: red }</style>';
    d.body.innerHTML = '<div class="a b"></div>';
    const style = d.createElement('style');
    style.textContent = '.a { color: blue }';
    d.head.prepend(style);
    assert.equal([...d.styleSheets].map((s) => s.cssRules[0].selectorText).join(' '), order, jsdom);
    assert.equal(w.getComputedStyle(d.querySelector('div')).color, color, jsdom);
  }
});

// jsdom 28.0.0 (black box, a single-jsdom install of each release) is
// 27.4.0 here and 28.1.0 is 29: writes to computed styles (from 28.1.0 the
// methods throw), and a declaration with var() in a style rule is not
// !important from 28.1.0 to 29.1.1 (an !important padding: 1px wins over
// padding: var(--p) !important, a more specific color: red over color:
// var(--c, blue) !important; before 28.1.0 rules apply in document order).
test('computed values: computed style writes and var() with !important in rules from jsdom 28.1.0', () => {
  const read = (jsdom) => {
    const w = createWindow({ jsdom });
    const d = w.document;
    d.head.innerHTML =
      '<style>.i { padding: 1px !important } .j { padding: var(--p) !important } .k.k { color: red } .k { color: var(--c, blue) !important }</style>';
    d.body.innerHTML = '<p class="i j k"></p>';
    const cs = w.getComputedStyle(d.querySelector('p'));
    let write = 'ok';
    try {
      cs.setProperty('width', '10px');
    } catch (e) {
      write = e.name;
    }
    return [cs.paddingTop, cs.color, write];
  };
  assert.deepEqual(['27.4.0', '28.0.0', '28.1.0', '29.1.1', '30.1.3'].map(read), [
    ['', 'var(--c, blue)', 'ok'],
    ['', 'var(--c, blue)', 'ok'],
    ['1px', 'rgb(255, 0, 0)', 'NoModificationAllowedError'],
    ['1px', 'rgb(255, 0, 0)', 'NoModificationAllowedError'],
    ['0', 'var(--c, blue)', 'NoModificationAllowedError'],
  ]);
});

// A longhand, a shorthand without var() and a shorthand with var(), all
// matching (padding-bottom, black box): jsdom 26.1.0 gives '' and 30.1.3
// gives '0' for the first order, 7px when the longhand comes last. jsdom 27
// to 29 give 8px for the first order, which isn't modeled yet.
test('computed values: a longhand, a shorthand and a var() shorthand', () => {
  const td = '<div class="d"><table><tbody><tr><td></td></tr></tbody></table></div>';
  const CASES = [
    [
      '.d.d td { padding-bottom: 7px !important } .d td { padding: 8px !important } td { padding: var(--p) !important }',
      { '26.1.0': '', '30.1.3': '0' },
    ],
    [
      'td { padding: var(--p) !important } .d td { padding: 8px !important } .d.d td { padding-bottom: 7px !important }',
      { '26.1.0': '7px', '30.1.3': '7px' },
    ],
    [
      '.d td { padding: 8px !important } td { padding: var(--p) !important } .d.d td { padding-bottom: 7px !important }',
      { '26.1.0': '7px', '30.1.3': '7px' },
    ],
    [
      '.d.d td { padding-bottom: 7px } .d td { padding: 8px } td { padding: var(--p) }',
      { '26.1.0': '', '30.1.3': '7px' },
    ],
  ];
  for (const [css, expected] of CASES) {
    for (const [jsdom, value] of Object.entries(expected)) {
      const w = createWindow({ jsdom });
      w.document.head.innerHTML = `<style>${css}</style>`;
      w.document.body.innerHTML = td;
      assert.equal(w.getComputedStyle(w.document.querySelector('td')).paddingBottom, value, `${jsdom} ${css}`);
    }
  }
});

// A style attribute's declarations with var() and !important (#141, black
// box): from jsdom 28.1.0 to 29.1.1 they are not !important to the
// cascade (an !important rule's color: red wins over color: var(--c, blue)
// !important), but a pending longhand of one meets the rules' winner by
// order unless that comes from the same shorthand; in the attribute they
// stay !important to the other declarations. In jsdom 27 and 28 border and
// its sides with var() are dropped from the attribute, border-width and
// the others declare their longhands pending.
const INLINE_VAR_IMPORTANT = [
  'color: var(--c, blue) !important',
  'padding: var(--p, 5px) !important',
  'padding-top: var(--p, 5px) !important',
  'margin: 1px var(--m, 2px) !important',
  'border: var(--b, 1px solid) !important',
  'border-top: var(--b, 1px solid) !important',
  'border-width: var(--b, 1px) !important',
  'border-style: var(--b) !important',
  'background: var(--g) !important',
  'padding-top: 5px !important; padding: var(--p) !important',
  'color: var(--c, blue) !important; color: green',
  'color: red; border-top: var(--b); margin-top: 1px',
];
const RULES_IMPORTANT = [
  'color: red !important; padding-top: 3px !important; margin-top: 4px !important; border-top-width: 3px !important; border-top-style: solid !important; background-color: red !important',
  'color: red !important; padding: 3px !important; margin: 4px !important; border: 3px solid !important; background: red !important',
  'border-top: 3px solid !important',
  'border-width: 3px !important; border-style: solid !important',
  'color: red; padding-top: 3px; margin-top: 4px; border-top-width: 3px; border-top-style: solid',
];
const VAR_IMPORTANT_PROPS = [
  'color',
  'padding-top',
  'margin-top',
  'border-top-width',
  'border-top-style',
  'background-color',
];
for (const jsdom of [30, 29, 28, 27])
  parity(
    `computed values: the style attribute's var() with !important against rules (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      for (const rules of RULES_IMPORTANT) {
        d.head.innerHTML = `<style>.r.r { ${rules} }</style>`;
        // From jsdom 29 a normal pending one against !important rules is not
        // modeled.
        for (const inline of INLINE_VAR_IMPORTANT.filter((text) => jsdom < 29 || text.includes('!important'))) {
          d.body.innerHTML = '<p class="r"></p>';
          const p = d.body.firstChild;
          p.setAttribute('style', inline);
          const cs = w.getComputedStyle(p);
          out.push(`${inline} | ${VAR_IMPORTANT_PROPS.map((name) => cs.getPropertyValue(name)).join(' ')}`);
        }
      }
      return out;
    },
    { jsdom },
  );

// A declaration with a priority token left over is dropped from the style
// attribute (#154 review, black box, jsdom 27.4.0 to 30.1.3): border-width:
// var(--w) !important !important leaves the rules' border widths alone.
for (const jsdom of [30, 29, 28, 27])
  parity(
    `computed values: the style attribute's var() with a priority token left over (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      for (const rules of [
        '',
        'border-top-width: 3px; border-top-style: solid',
        'border-width: 3px !important; border-style: solid',
      ]) {
        d.head.innerHTML = `<style>.r.r { ${rules} }</style>`;
        for (const inline of [
          'border-width: var(--w) !important !important',
          'border-style: var(--s) !important !important',
          'padding: var(--p) !important !important',
          'color: var(--c) !important !important',
          'border-width: var(--w) !',
        ]) {
          d.body.innerHTML = '<textarea class="r"></textarea>';
          const t = d.body.firstChild;
          t.setAttribute('style', inline);
          const cs = w.getComputedStyle(t);
          out.push(
            `${rules} | ${inline} | ${['border-top-width', 'border-top-style', 'padding-top', 'color'].map((name) => cs.getPropertyValue(name)).join(' ')}`,
          );
        }
      }
      return out;
    },
    { jsdom },
  );

// After a style write the cascade parses the text the style wrote, but
// keeps what that text does not show (#154 review, black box, jsdom 27.4.0
// to 30.1.3): style.setProperty('border', 'var(--b)') after style.color
// keeps the color (the attribute, parsed as such, declares nothing in
// jsdom 27 and 28), and padding: var(--p) !important from the attribute
// keeps its place against .r { padding-top: 3px !important } after an
// opacity write that serializes it without !important.
for (const jsdom of [30, 29, 28, 27])
  parity(
    `computed values: the style's declarations after style writes (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      const read = (el, names) => {
        const cs = w.getComputedStyle(el);
        return names.map((name) => cs.getPropertyValue(name)).join(' ');
      };
      for (const name of ['border', 'border-top', 'border-width']) {
        d.head.innerHTML = '';
        d.body.innerHTML = '<p></p>';
        const p = d.body.firstChild;
        p.style.color = 'red';
        p.style.setProperty(name, 'var(--b)');
        out.push(
          `${name} | ${p.getAttribute('style')} | ${read(p, ['color', 'border-top-width', 'border-top-style'])}`,
        );
        p.style.opacity = '0.5';
        out.push(`${name} | ${read(p, ['color', 'opacity'])}`);
      }
      for (const rule of ['padding-top: 3px !important', 'padding: 3px !important', 'padding-top: 3px']) {
        d.head.innerHTML = `<style>.r.r { ${rule} }</style>`;
        d.body.innerHTML = '<p class="r"></p>';
        const p = d.body.firstChild;
        p.setAttribute('style', 'padding: var(--p, 5px) !important');
        const before = read(p, ['padding-top']);
        p.style.opacity = '0.5';
        out.push(`${rule} | ${before} | ${p.getAttribute('style')} | ${read(p, ['padding-top', 'opacity'])}`);
        p.style.color = 'green';
        out.push(`${rule} | ${read(p, ['padding-top', 'color'])}`);
        p.setAttribute('style', 'padding: 7px !important; color: blue');
        out.push(`${rule} | ${p.style.cssText} | ${read(p, ['padding-top', 'color'])}`);
      }
      d.head.innerHTML = '';
      d.body.innerHTML = '<p></p>';
      const p = d.body.firstChild;
      p.setAttribute('style', 'color: var(--c, blue) !important');
      p.style.opacity = '0.5';
      p.style.color = 'green';
      out.push(`${p.getAttribute('style')} | ${read(p, ['color'])}`);
      p.removeAttribute('style');
      out.push(`${p.style.cssText} | ${read(p, ['color', 'opacity'])}`);
      return out;
    },
    { jsdom },
  );
