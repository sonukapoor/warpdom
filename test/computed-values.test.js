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
// (and a side its own longhands), in jsdom 29 an !important one does not
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
