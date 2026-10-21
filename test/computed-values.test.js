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
const read = (w, el, props) => { const cs = w.getComputedStyle(el); return props.map((p) => cs.getPropertyValue(p)); };
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
  for (const value of ['Red', 'ButtonFace', 'Canvas', 'threedface', 'Mark', '#ff000080', '#F00F', 'rgba(0,0,0,.1234)', 'rgba(0,0,0,50%)',
    'RGB(1, 2, 3)', 'rgb(1.5, 2, 3)', 'currentColor', 'Transparent']) {
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

const profileColor = (profile, css, prop = 'color') => {
  const w = createWindow(profile);
  const el = w.document.body.appendChild(w.document.createElement('div'));
  el.setAttribute('style', css);
  return [el.style.getPropertyValue(prop), w.getComputedStyle(el).getPropertyValue(prop)];
};

test('computed values: colors are computed from jsdom 22.1.0, system colors from 27', () => {
  for (const jsdom of ['20.0.3', '21.1.2', '22.0.0']) {
    assert.deepEqual(profileColor({ jsdom }, 'color: Red'), ['Red', 'Red'], jsdom);
    assert.deepEqual(profileColor({ jsdom }, 'background-color: transparent', 'background-color'), ['transparent', 'transparent'], jsdom);
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
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.1.0' }, 'color: #ff000080'), ['rgba(255, 0, 0, 0.502)', 'rgba(255, 0, 0, 0.502)']);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.1.0' }, 'color: rgba(0,0,0,.123456)'), ['rgba(0, 0, 0, 0.123456)', 'rgba(0, 0, 0, 0.123456)']);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.1.0' }, 'color: RGB(1, 2, 3)'), ['', '']);
  assert.deepEqual(profileColor({ jsdom, cssstyle: '4.2.0' }, 'color: RGB(1, 2, 3)'), ['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
  // An alpha given as a number to 3 decimals (cssstyle 4.2 and later, jsdom 27 and later).
  assert.deepEqual(profileColor({ jsdom: '30.1.3' }, 'color: rgba(0,0,0,.1234)'), ['rgba(0, 0, 0, 0.123)', 'rgba(0, 0, 0, 0.123)']);
  assert.deepEqual(profileColor({ jsdom: '30.1.3' }, 'color: rgba(0,0,0,0.9999)'), ['rgb(0, 0, 0)', 'rgb(0, 0, 0)']);
});

test('computed values: cssstyle 5 drops system colors in the border sides, a lone one in background (jsdom 27.0 to 28.0)', () => {
  for (const [jsdom, dropped] of [['27.0.0', true], ['28.0.0', true], ['28.1.0', false]]) {
    const w = createWindow({ jsdom });
    const el = w.document.createElement('div');
    el.style.background = 'ButtonFace';
    el.style.borderLeft = '1px solid Canvas';
    el.style.color = 'Canvas';
    assert.deepEqual([el.style.backgroundColor, el.style.borderLeftColor, el.style.color], dropped ? ['', '', 'canvas'] : ['buttonface', 'canvas', 'canvas'], jsdom);
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
  const props = ['display', 'position', 'color', 'background-color', 'padding-top', 'margin-top', 'border-top-style', 'border-top-width',
    'border-top-color', 'left', 'right', 'width', 'height', 'inset-inline-start'];
  return [read(w, closed, props), read(w, open, props)];
}
for (const jsdom of [20, 22, 25, 26, 27, 28, 29]) parity(`computed values: dialog (jsdom ${jsdom}, #76)`, dialogs, { jsdom });

// --- zero lengths ------------------------------------------------------------------

// A 0 length stays 0 before jsdom 28.1.0 where cssstyle does not parse the
// property (text-indent, min-width); cssstyle before 4.4 keeps border
// widths and border-spacing so too.
const ZEROS = ['text-indent', 'letter-spacing', 'min-width', 'outline-offset', 'border-top-width', 'border-spacing', 'width', 'margin-top', 'vertical-align', 'column-gap'];
function zeros(w) {
  const d = w.document;
  d.head.innerHTML = `<style>.z { ${ZEROS.map((p) => `${p}: 0`).join('; ')} } .m { margin: 0; padding: 0 }</style>`;
  const sheet = d.body.appendChild(d.createElement('div'));
  sheet.className = 'z';
  const inline = d.body.appendChild(d.createElement('div'));
  for (const p of ZEROS) inline.style.setProperty(p, '0');
  const box = d.body.appendChild(d.createElement('div'));
  box.className = 'm';
  const ua = ['ruby', 'rt', 'input', 'button', 'textarea'].map((tag) => read(w, d.body.appendChild(d.createElement(tag)), ['text-indent'])[0]);
  return { sheet: read(w, sheet, ZEROS), declared: ZEROS.map((p) => inline.style.getPropertyValue(p)), inline: read(w, inline, ZEROS), box: read(w, box, ['margin-top', 'padding-left']), ua };
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
  d.head.innerHTML = '<style>.a { padding: 2px 6px 3px 6px; margin: 0 auto 0 auto; border-width: 1px 1px; border-style: solid } .b { padding: 1px 1px 1px }'
    + ' .c { padding: 1px 2px; padding-left: 5px } .d { padding-left: 2px }</style>';
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
  d.body.innerHTML = '<svg><a href="#x" id="sa"><text>t</text></a><a id="sb"><text>u</text></a></svg><a href="#y" id="ha">h</a>';
  const xlink = d.createElementNS('http://www.w3.org/2000/svg', 'a');
  xlink.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#z');
  d.querySelector('svg').append(xlink);
  const out = [...d.querySelectorAll('a')].map((a) => [a.matches(':link'), a.matches(':any-link'), ...read(w, a, ['color', 'cursor', 'text-decoration'])]);
  return { out, count: d.querySelectorAll(':link').length, closest: d.querySelector('text').closest(':any-link')?.id };
}
for (const jsdom of JSDOMS) parity(`computed values: :link on SVG links (jsdom ${jsdom})`, svgLinks, { jsdom });

// --- font-family and vertical-align ------------------------------------------------

// From jsdom 29.0.2 font-family's initial value is 'depends on user
// agent', and vertical-align: inherit inherits (the user agent sheet's td
// and tr: middle from tbody), baseline from a parent without one.
function inherited(w) {
  const d = w.document;
  d.head.innerHTML = '<style>.p { vertical-align: middle; font-family: Georgia } .i { vertical-align: inherit; font-family: inherit } .n { font-family: initial } .u { font-family: unset }</style>';
  d.body.innerHTML = '<div class="p"><span class="i" id="a"></span><span class="n" id="b"></span></div><div><span class="i" id="c"></span><span class="u" id="d"></span></div>'
    + '<table><tbody><tr id="tr"><td id="td">x</td></tr></tbody></table><pre id="pre"></pre>';
  const out = {};
  for (const el of [...d.querySelectorAll('[id]'), d.documentElement, d.body]) out[el.id || el.localName] = read(w, el, ['font-family', 'vertical-align']);
  out.detached = read(w, d.createElement('div'), ['font-family']);
  return out;
}
for (const jsdom of JSDOMS) parity(`computed values: font-family and vertical-align (jsdom ${jsdom})`, inherited, { jsdom });

test('computed values: font-family depends on user agent from jsdom 29.0.2', () => {
  for (const [jsdom, family] of [['29.0.1', ''], ['29.0.2', 'depends on user agent'], ['30.1.3', 'depends on user agent']]) {
    const w = createWindow({ jsdom });
    assert.equal(w.getComputedStyle(w.document.body).fontFamily, family, jsdom);
  }
});
