// CSS value validation, checked against jsdom: invalid values and unknown
// properties are ignored by style writes, cssText and style attributes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasVarFunction, isValidValue } from '../src/css-values.js';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const writes = (w) => {
  const style = () => w.document.createElement('div').style;
  const cases = [
    ['width', '10px'],
    ['width', 'undefined%'],
    ['width', '-10px'],
    ['width', 'calc(100% - 10px)'],
    ['width', 'var(--a)'],
    ['width', 'inherit'],
    ['height', 'fit-content'],
    ['color', 'red'],
    ['color', 'notacolor'],
    ['color', '#ggg'],
    ['background-color', 'rgb(1 2 3 / 50%)'],
    ['display', 'grid'],
    ['display', 'flexx'],
    ['display', 'inline flex'],
    ['z-index', '2'],
    ['z-index', '2.5'],
    ['opacity', '0.5'],
    ['opacity', 'abc'],
    ['transform', 'translateX(10px)'],
    ['transform', 'translateX(red)'],
    ['margin', '0 auto'],
    ['margin', '1px 2px 3px 4px 5px'],
    ['padding', '-1px'],
    ['font-size', '12px'],
    ['font-size', 'big'],
    ['font-weight', 'bold'],
    ['font-weight', '0'],
    ['position', 'sticky'],
    ['position', 'stickyy'],
    ['border', '1px solid red'],
    ['border', 'bogus'],
    ['flex', 'auto'],
    ['top', 'auto'],
    ['top', 'auto auto'],
    ['view-timeline-inset', '0 100dvh'],
    ['view-timeline-inset', 'bogus thing'],
    ['grid-template-columns', 'repeat(3, 1fr)'],
    ['box-shadow', '0 0 2px rgba(0,0,0,.5)'],
    ['transition', 'opacity 200ms ease-in-out'],
    ['fill', 'red'],
    ['stroke', 'url(#a) none'],
    ['foo', 'bar'],
    ['--custom', ' anything { } '],
  ];
  const out = cases.map(([name, value]) => {
    const s = style();
    s.setProperty(name, value);
    return `${name}: ${s.getPropertyValue(name)}`;
  });
  // An invalid value keeps the previous one.
  const s = style();
  s.width = '10px';
  s.width = 'undefined%';
  out.push(s.width, s.length);
  s.cssText = 'width: nope; height: 5px; color: red; foo: bar';
  out.push(s.cssText);
  const el = w.document.createElement('div');
  el.setAttribute('style', 'width: bogus; height: 3px');
  out.push(el.style.cssText, el.style.width);
  return out;
};
parity('style writes ignore invalid values', writes);
parity('style writes ignore invalid values (jsdom 26)', writes, { jsdom: 26 });

// display's short forms (jsdom 26 kept multi-keyword values as written).
const displays = (w) =>
  [
    'inline flex',
    'inline grid',
    'block flow',
    'inline flow-root',
    'block flex',
    'block list-item',
    'inline list-item',
    'flex inline',
    'run-in flow',
    'flex',
    'block',
  ].map((v) => {
    const s = w.document.createElement('div').style;
    s.display = v;
    return s.display;
  });
parity('display: short forms', displays);
parity('display: as written (jsdom 26)', displays, { jsdom: 26 });

// The cascade drops invalid declarations too.
parity('getComputedStyle ignores invalid declarations', (w) => {
  const d = w.document;
  d.head.insertAdjacentHTML('beforeend', '<style>.a { width: 10px; } .a { width: bogus; color: nope; }</style>');
  d.body.innerHTML = '<div class="a" style="height: nope; opacity: 0.5"></div>';
  const cs = w.getComputedStyle(d.querySelector('.a'));
  return [cs.width, cs.opacity, d.styleSheets[0].cssRules[1].cssText];
});

test('isValidValue: grammars, var(), math functions and CSS-wide keywords', () => {
  const ok = [
    ['width', '10px'],
    ['width', 'calc(1px + )'],
    ['width', 'var(--x)'],
    ['width', 'INHERIT'],
    ['font-family', '"A B", serif'],
    ['background', 'url(a.png), url(b.png) red'],
    ['grid-template-areas', '"a b" "c d"'],
    ['animation', 'spin 1s linear infinite'],
    ['-webkit-transform', 'rotate(1deg)'],
    ['grid-gap', '1px 2px'],
    ['cursor', 'url(x.cur), auto'],
  ];
  const bad = [
    ['width', '10'],
    ['width', 'auto auto'],
    ['display', 'blockk'],
    ['color', 'linear-gradient(red, blue)'],
    ['-webkit-transform', 'nope'],
  ];
  for (const [name, value] of ok) assert.equal(isValidValue(name, value), true, `${name}: ${value}`);
  for (const [name, value] of bad) assert.equal(isValidValue(name, value), false, `${name}: ${value}`);
});

// flex serializes as its longhands.
const flexes = (w) =>
  [
    'auto',
    'none',
    '1',
    '0',
    '2 3',
    '1 1 0%',
    '10px',
    '1 10px',
    '1 2 10px',
    '0 0 0',
    'content',
    'var(--a)',
    '50%',
    '-1',
    '1 -2',
  ].map((v) => {
    const s = w.document.createElement('div').style;
    s.flex = v;
    return s.flex;
  });
parity('flex: longhand serialization', flexes);
parity('flex: longhand serialization (jsdom 26)', flexes, { jsdom: 26 });

// Minified style sheets pack calc() and var() together; these crashed the
// tokenizer once (handsontable's theme CSS). Validation never throws.
test('isValidValue: minified calc() and var(), and broken input', () => {
  for (const [name, value] of [
    ['margin-inline-start', 'calc(-1*var(--ht-checkbox-size))'],
    ['padding', 'var(--ht-gap-size)calc(2*var(--ht-gap-size))'],
    ['border-radius', 'calc(.5*var(--ht-radio-size))'],
    ['margin-inline-end', 'calc(2*var(--ht-gap-size,4px) + var(--ht-icon-size))'],
    ['width', 'calc(100%/3)'],
  ]) {
    assert.equal(isValidValue(name, value), true, `${name}: ${value}`);
  }
  for (const value of ['a\\', '\\', '-\\', 'url(', 'calc(', '"unterminated'])
    assert.equal(typeof isValidValue('width', value), 'boolean');
});

// var( as jsdom 23 to 30 read it (#222, #234): in lowercase, at the start or
// after whitespace (JavaScript's \s), "(", "/" or "*", in a string or a
// comment too (jsdom 30.1.2 keeps url(a b.png) /* var( and width: "a
// var(--a)"). Values with comments are not modeled yet (#162), so this is
// checked directly.
test('hasVarFunction: what comes before var(', () => {
  for (const value of [
    'var(--a)',
    '/* " */ var(--a) url(a b.png)',
    "/* ' */ var(--a)",
    'url(a b.png) /* var( */',
    'url(a b.png) /* var(',
    'url(a b.png) /* " */ var(--a)',
    'url(a"b c.png) var(--a)',
    "url(a'b c.png) var(--a)",
    'url( a"b.png) var(--a)',
    'url(a"b.png) url(c d.png) var(--a)',
    '"/*" var(--a)',
    '"/* var(x)"',
    'url(var(--a).png)',
    'url(a\\ var(--a).png)',
    'url(a/var(--a).png)',
    'calc(1px*var(--a))',
    '1px\tvar(--a)',
    '1px\u00a0var(--a)',
    '1px\u3000var(--a)',
    '1px\ufeffvar(--a)',
    'var(--a,var(--b))',
    'red,var(--a) var(--b)',
  ])
    assert.equal(hasVarFunction(value), true, value);
  for (const value of [
    'VAR(--a)',
    'Var(--a) red',
    'url("var(x).png")',
    "url('var(x).png')",
    'url( "var(x).png" )',
    '/* x */ notvar(x)',
    'url(a/*b.png) xvar(x)',
    'url(x-var(--a).png)',
    '/* \\*/ url("var(x).png")',
    'url(a.png)var(--a)',
    'url(a.png),var(--a)',
    'url(a.png) ,var(--a)',
    'red,var(--a)',
    'rgb(1,var(--a),3)',
    '1px+var(--a)',
    '[var(--a)]',
    "'x'var(--a)",
    'x\\+var(--a)',
    'url(x\\!var(--a).png)',
  ])
    assert.equal(hasVarFunction(value), false, value);
  // Linear: many var( openings, none after a character that opens var().
  const n = 200000;
  for (const value of ['xvar('.repeat(n), ',var('.repeat(n), 'url('.repeat(n), '/* "'.repeat(n)])
    assert.equal(hasVarFunction(value + ' var('), true);
});

// CSS.supports validates values (jsdom 30); before jsdom 30 there is no CSS
// namespace, and libraries fall back when they detect that.
parity('CSS.supports validates values', (w) => {
  const cases = [
    ['height', 'abc'],
    ['height', '-100'],
    ['height', '100px'],
    ['height', 'min-content'],
    ['height', 'true'],
    ['display', 'flexx'],
    ['display', 'grid'],
    ['foo', 'bar'],
    ['--x', '1'],
    ['width', 'calc(100% - 1px)'],
    ['color', 'nope'],
    ['height', 'var(--a)'],
  ];
  return [
    cases.map(([p, v]) => w.CSS.supports(p, v)),
    w.CSS.supports('(height: abc)'),
    w.CSS.supports('(height: 10px)'),
    w.CSS.supports('(display: flexx) or (display: grid)'),
  ];
});
parity('no CSS namespace before jsdom 30', (w) => [typeof w.CSS, 'CSS' in w], { jsdom: 26 });

// #239: in jsdom 20 to 26 a declaration whose value cssstyle rejects, or
// that has none, removes the one before it for the same name in a style
// attribute and an element's cssText (not setProperty or a style sheet's
// rule). Fallbacks too: cssstyle before 4.2 rejects 100dvh and before 4.4
// fit-content, so jsdom 20 to 25 drop both declarations, and a style sheet
// computes them to nothing.
const FALLBACKS = [
  'height: 100vh; height: 100dvh',
  'width: 100px; width: fit-content',
  'background: red; background: linear-gradient(red, blue)',
  'color: blue; color: foo',
  'color: blue; color: 1px',
  'width: 100px; width: bogus',
  'margin: 1px; margin: foo',
  'margin-top: 1px; margin-top: foo',
  'margin-top: 1px; margin: foo',
  'margin: 1px; margin-top: foo',
  'color: blue !important; color: foo',
  'color: blue; color: foo !important',
  'color: blue; color: inherit',
  'color: blue; color: var(--x)',
  'color: blue; color: foo; color: red',
  'color:blue;color:foo;width:1px',
  'color: blue; Color: foo',
  'color: blue; color: ;width: 1px',
  'font: 12px Arial; font: foo',
  'flex: 1; flex: foo',
  'display: block; display: foo',
  'color: blue; foo: bar',
];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `jsdom ${jsdom}: an invalid later declaration and the earlier one (#239)`,
    (w) => {
      const out = [];
      for (const text of FALLBACKS) {
        const a = w.document.createElement('div');
        a.setAttribute('style', text);
        const b = w.document.createElement('div');
        b.style.cssText = text;
        // (A style sheet with an empty declaration is read otherwise: not here.)
        w.document.head.innerHTML = text.includes(': ;') ? '' : `<style>.a{${text}}</style>`;
        w.document.body.innerHTML = '<div class="a"></div>';
        const name = text.slice(0, text.indexOf(':'));
        const computed = w.getComputedStyle(w.document.body.firstChild).getPropertyValue(name);
        out.push(`${text} -> ${a.style.cssText} | ${b.style.cssText} | ${b.getAttribute('style')} | ${computed}`);
      }
      // A name without a value at the end, in a style attribute (cssText
      // and a style sheet read it otherwise, not modeled).
      for (const text of ['color: blue; color:', 'color: blue; Color:']) {
        const a = w.document.createElement('div');
        a.setAttribute('style', text);
        out.push(`${text} -> ${a.style.cssText}`);
      }
      const s = w.document.createElement('div').style;
      s.setProperty('height', '10px');
      s.setProperty('height', '100dvh');
      out.push(`setProperty: ${s.cssText}`);
      return out;
    },
    { jsdom },
  );
}

// jsdom 20 to 26 read a style attribute or an element's cssText as cssom
// reads the block first, a name given again as written taking the earlier
// one's place, and then set it declaration by declaration (#261 review):
// an invalid later value under another case keeps the one before it, and
// a property keeps the place of its first declaration. A name left without
// a value at the end leaves the block empty.
const REPEATED = [
  'color: blue; Color: red; color: foo',
  'color: blue; COLOR: red; width: 1px; color: foo',
  'Color: blue; color: foo',
  'Color: blue; color: inherit',
  'color: blue; Color: red; color: green',
  'color: foo; width: 1px; color: blue',
  'color: foo; width: 1px; color: blue !important',
  'width: 1px; color: blue; height: 2px; Color: red; top: 1px; color: foo',
  'color: red !important; Color: blue; color: foo',
  'color : blue; color: foo',
  'color: blue; Color:; width: 1px',
  'width: 1px; color:',
  'color: blue; width: 1px; Color:',
  // Names compared without their whitespace and comments, case kept (#262
  // review).
  'col or: red; color: foo',
  'color: red; col or: foo',
  'col or: red; color: blue',
  'COL OR: red; color: foo',
  'c/**/olor: red; color: foo',
  '--f o o: red; --foo: blue; --f o o: green',
  '--f o o: red; --foo: blue',
];
for (const jsdom of [20, 22, 25, 26]) {
  parity(
    `jsdom ${jsdom}: a name declared again in a style attribute and cssText (#261 review)`,
    (w) =>
      REPEATED.map((text) => {
        const a = w.document.createElement('div');
        a.setAttribute('style', text);
        const b = w.document.createElement('div');
        b.style.cssText = text;
        const names = Array.from({ length: b.style.length }, (_, i) => b.style.item(i));
        return `${text} -> ${a.style.cssText} | ${b.style.cssText} | ${names.join(',')} | ${b.style.color}`;
      }),
    { jsdom },
  );
}

// A repeated name read before anything is set (#261 review): a url()
// cssstyle meets the first time (an escaped space in background-image,
// an escaped quote in background, jsdom 26) is met once, and a declaration
// replaced by a later one of its name is never met.
for (const jsdom of [20, 22, 25, 26]) {
  parity(
    `jsdom ${jsdom}: an escaped url() with a name declared again (#261 review)`,
    (w) => {
      const p = `r${jsdom}-`;
      const many = Array.from({ length: 17 }, (_, i) => `--v${i}: ${i}`).join('; ');
      const attribute = (text) => {
        const e = w.document.createElement('div');
        e.setAttribute('style', text);
        return e.style.cssText;
      };
      const cssText = (text) => {
        const e = w.document.createElement('div');
        e.style.cssText = text;
        return e.style.cssText;
      };
      return [
        attribute(`background-image: url("${p}a\\ b.png"); color: red; color: blue`),
        attribute(`background-image: url("${p}a\\ b.png"); color: red`),
        cssText(`background-image: url("${p}b\\ b.png"); color: red; color: blue`),
        attribute(`background: red url("${p}c\\'b.png"); color: red; color: blue`),
        cssText(`width: 1px; background: red url("${p}d\\(b.png"); width: 2px`),
        attribute(`background-image: url("${p}e\\ b.png"); ${many}`),
        cssText(`background-image: url("${p}f\\ b.png"); color: red; background-image: url("${p}g\\ b.png")`),
        cssText(`background-image: url("${p}f\\ b.png")`),
        cssText(`background-image: url("${p}g\\ b.png")`),
      ];
    },
    { jsdom },
  );
}

// The lengths and sizing keywords cssstyle reads before 4.4 (#239):
// before 4.2 px, cm, mm, in, pt, pc, em, ex, ch, rem, vh and vw only.
const LENGTH_NAMES = ['width', 'height', 'flex-basis', 'top', 'font-size', 'margin', 'margin-top', 'padding'];
const LENGTH_VALUES = ['10px', '10vh', '10dvh', '10vmin', '10svw', '1lh', '1rlh', '10vmax', '.5vh', '1e1px'];
const LENGTH_VALUES_ALL = [...LENGTH_VALUES, 'fit-content', 'max-content', 'min-content', 'auto', 'calc(10dvh)'];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `jsdom ${jsdom}: lengths and sizing keywords by cssstyle version (#239)`,
    (w) => {
      const out = [];
      for (const name of LENGTH_NAMES)
        for (const value of LENGTH_VALUES_ALL) {
          const a = w.document.createElement('div').style;
          a.setProperty(name, value);
          const b = w.document.createElement('div').style;
          b.cssText = `${name}: 1px ${name === 'margin' || name === 'padding' ? '2px' : ''}; ${name}: ${value}`;
          out.push(`${name}: ${value} -> ${a.cssText} | ${b.cssText}`);
        }
      for (const value of ['10dvh', '1px 10dvh', 'center 10vmin'])
        out.push(`background-position ${value}: ${attempt(w, 'background-position', value)}`);
      for (const value of ['linear-gradient(red, blue)', 'red radial-gradient(red, blue)'])
        out.push(`background ${value}: ${attempt(w, 'background', value)}`);
      out.push(`background-image: ${attempt(w, 'background-image', 'linear-gradient(red, blue)')}`);
      out.push(`flex: ${attempt(w, 'flex', '1 1 10dvh')} ${attempt(w, 'flex', 'max-content')}`);
      out.push(`border: ${attempt(w, 'border', '10dvh solid red')}`);
      // Not read with cssstyle's length parser: kept as written.
      out.push(`min-width: ${attempt(w, 'min-width', '10dvh')} ${attempt(w, 'max-height', 'fit-content')}`);
      return out;
    },
    { jsdom },
  );
}
// jsdom 25 (cssstyle 4.1) rejects a gradient in any case (#261 review).
parity(
  'jsdom 25: gradients in mixed case',
  (w) =>
    ['background', 'background-image'].flatMap((name) =>
      [
        'LINEAR-GRADIENT(red, blue)',
        'Linear-Gradient(red, blue)',
        'RADIAL-GRADIENT(red, blue)',
        'Repeating-Linear-Gradient(red, blue)',
        'CONIC-GRADIENT(red, blue)',
        '-WEBKIT-LINEAR-GRADIENT(red, blue)',
        'url(a.png), LINEAR-GRADIENT(red, blue)',
        'red LINEAR-GRADIENT(red, blue)',
        'url(a.png)',
      ].map((value) => {
        const b = w.document.createElement('div');
        b.style.cssText = `${name}: red; ${name}: ${value}`;
        return `${name}: ${value} -> ${attempt(w, name, value)} | ${b.style.cssText}`;
      }),
    ),
  { jsdom: 25 },
);
function attempt(w, name, value) {
  const s = w.document.createElement('div').style;
  s.setProperty(name, value);
  return s.cssText;
}

// cssstyle 4.2 and 4.3, not installed with a jsdom alias here: measured on
// their own (black box, #239). 4.2 reads the newer units in lowercase
// only; fit-content waits for 4.4, gradients for 4.3.
test('lengths and sizing keywords with cssstyle 4.2 and 4.3 (#239)', () => {
  const css = (cssstyle, name, value) => {
    const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.createElement('div').style;
    s.cssText = `${name}: 1px; ${name}: ${value}`;
    return s.cssText;
  };
  for (const cssstyle of ['4.2.0', '4.3.0']) {
    assert.equal(css(cssstyle, 'height', '100dvh'), 'height: 100dvh;');
    assert.equal(css(cssstyle, 'width', '1cap'), 'width: 1cap;');
    assert.equal(css(cssstyle, 'width', '10DVH'), '');
    assert.equal(css(cssstyle, 'width', '10cqw'), '');
    assert.equal(css(cssstyle, 'width', 'fit-content'), '');
    assert.equal(css(cssstyle, 'margin', '1px 10dvh'), 'margin: 1px 10dvh;');
    // An exponent with a leading zero is not a number there (#261 review).
    assert.equal(css(cssstyle, 'width', '1e01px'), '');
    assert.equal(css(cssstyle, 'width', '1e-01px'), '');
    assert.equal(css(cssstyle, 'margin', '1px 1e01px'), '');
    assert.equal(css(cssstyle, 'width', '1e1px'), 'width: 1e1px;');
    assert.equal(css(cssstyle, 'font', '1e01px serif'), 'font: serif;');
    assert.equal(css(cssstyle, 'font', 'bold 1e-01px serif'), 'font: serif bold;');
    assert.equal(css(cssstyle, 'font', '1e1px serif'), 'font: serif 1e1px 1e1px;');
    // A number without a unit: an exponent in flex only, and no leading
    // zero (#261 review).
    assert.equal(css(cssstyle, 'flex', '1 1e-1 10px'), 'flex: 1 0.1 10px;');
    const flex = (value) => {
      const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.createElement('div').style;
      s.cssText = `flex: 1; flex: ${value}`;
      return s.flexGrow;
    };
    assert.equal(flex('1e1'), '10');
    assert.equal(flex('1.5e1 2'), '15');
    assert.equal(flex('0e1 1 0'), '0');
    assert.equal(flex('1e01'), '');
    assert.equal(flex('01'), '');
    assert.equal(flex('1 01'), '');
    assert.equal(css(cssstyle, 'width', '00'), '');
    assert.equal(css(cssstyle, 'width', '0e1'), '');
    assert.equal(css(cssstyle, 'margin', '0 00'), '');
  }
  assert.equal(css('4.3.0', 'background', 'linear-gradient(red, blue)'), 'background: linear-gradient(red, blue);');
  assert.equal(css('4.4.0', 'width', 'fit-content'), 'width: fit-content;');
  assert.equal(css('4.4.0', 'flex-basis', 'fit-content'), '');
});

// Gradient names not in lowercase (#264 item 4, black box: jsdom 20.0.3 to
// 30.1.3, cssstyle 2.3.0 to 4.6.0 on their own). cssstyle drops
// LINEAR-GRADIENT() and Linear-Gradient() in background and
// background-image, and from 4.2 a -webkit- gradient in background; jsdom
// 27 and later drop them in background-image, and read them in background
// as none, as they do NONE and -webkit-, -moz- and -o- gradients: a layer
// with nothing else left is empty (url(a.png), LINEAR-GRADIENT(red, blue)
// is url("a.png"), ), and a value with nothing else left sets each
// longhand to its initial value.
const GRADIENTS = [
  'linear-gradient(red, blue)',
  'LINEAR-GRADIENT(red, blue)',
  'Linear-Gradient(to right, red 10%, blue)',
  'linear-Gradient(red, blue)',
  'RADIAL-GRADIENT(red, blue)',
  'Conic-Gradient(red, blue)',
  'Repeating-Linear-Gradient(red, blue)',
  '-webkit-linear-gradient(red, blue)',
  '-WEBKIT-LINEAR-GRADIENT(top, red, blue)',
  'url(a.png), LINEAR-GRADIENT(red, blue)',
  'LINEAR-GRADIENT(red, blue), url(a.png)',
  'linear-gradient(red, blue), Linear-Gradient(red, blue)',
  'none, LINEAR-GRADIENT(red, blue)',
  'red LINEAR-GRADIENT(red, blue)',
  'LINEAR-GRADIENT(red, blue) no-repeat',
  'LINEAR-GRADIENT(red, blue) red fixed',
  'linear-gradient(red, blue) no-repeat',
];
function gradientReads(w) {
  const d = w.document;
  const out = [];
  for (const name of ['background', 'background-image'])
    for (const value of GRADIENTS) {
      const a = d.createElement('div');
      a.style.setProperty(name, value);
      const b = d.createElement('div');
      b.style.cssText = `${name}: ${value}`;
      d.head.innerHTML = `<style>#x { ${name}: ${value} }</style>`;
      const e = d.createElement('div');
      e.id = 'x';
      d.body.replaceChildren(e);
      const rule = d.styleSheets[0].cssRules[0];
      const computed = w.getComputedStyle(e);
      out.push(
        [
          `${name}: ${value}`,
          a.style.cssText,
          a.style.getPropertyValue(name),
          b.style.cssText,
          rule.cssText,
          rule.style.getPropertyValue(name),
          computed.backgroundImage,
          computed.getPropertyValue('background'),
        ].join(' | '),
      );
    }
  return out;
}
for (const jsdom of [20, 22, 23, 24, 25, 26, 27, 28, 29, 30, '30.1.3'])
  parity(`jsdom ${jsdom}: gradient names not in lowercase in background and background-image (#264)`, gradientReads, {
    jsdom,
  });

// A gradient's default direction, shape, size and position (black box,
// #264 item 32): jsdom 27 and later leave them out and write the rest of
// the gradient in lowercase with ", " between its arguments, in
// background and background-image, and from 28.1 in a value of another
// property that is one gradient; jsdom 27 keeps other properties'
// gradients as written, and every jsdom a value with var().
const GRADIENT_DEFAULTS = [
  'linear-gradient(to bottom, red, blue)',
  'linear-gradient(to right bottom, red, blue)',
  'linear-gradient(to  bottom ,red,blue)',
  'linear-gradient(in oklab to bottom, red, blue)',
  'linear-gradient(180deg, red, blue)',
  'repeating-linear-gradient(to bottom, red, blue 10px)',
  'radial-gradient(circle at center, red, blue)',
  'radial-gradient(ellipse farthest-corner at center, red, blue)',
  'radial-gradient(closest-side circle at center, red, blue)',
  'radial-gradient(ellipse at top, red, blue)',
  'radial-gradient(at top center, red, blue)',
  'radial-gradient(10px 20px at center, red, blue)',
  'radial-gradient(at 50% 50%, red, blue)',
  'repeating-radial-gradient(circle at center, red, blue 10px)',
  'conic-gradient(from 0deg at center, red, blue)',
  'conic-gradient(at center, red 10%, blue)',
  'url(a.png), linear-gradient(to bottom, red, blue)',
  'none, linear-gradient(to bottom,red,blue)',
  'linear-gradient(to bottom, red, blue), radial-gradient(circle at center, red, blue)',
  'linear-gradient(to bottom, red, var(--a))',
  'linear-gradient(to bottom,red,blue), var(--a)',
];
// Defaults go as whole tokens, wherever they are: to bottom right is
// right, at center top is top. What is left is no gradient: jsdom 27 to
// 30.1.2 compute none from it, a separate difference (declared values
// only here).
const GRADIENT_PARTS = [
  'linear-gradient(to bottom right, red, blue)',
  'radial-gradient(farthest-corner ellipse at center center, red, blue)',
  'radial-gradient(at center top, red, blue)',
  'conic-gradient(from 0deg at center center, red, blue)',
];
// Keywords and units not in lowercase (jsdom 26 and earlier drop some of
// these gradients: a separate difference).
const GRADIENT_CASES = [
  'linear-gradient(TO BOTTOM, RED, Blue)',
  'linear-gradient(TO RIGHT,RED,blue)',
  'linear-gradient(90DEG, red, blue)',
  'radial-gradient(10PX at LEFT, red, blue)',
  'radial-gradient(CIRCLE AT LEFT TOP, red, blue)',
  'conic-gradient(FROM 0DEG AT CENTER, red, blue)',
  'linear-gradient(red 0PX, blue 1E1%)',
];
const GRADIENT_PROPERTIES = ['background', 'background-image', 'list-style-image', 'border-image-source', 'mask-image'];
const gradientDefaults =
  (values, computed = true) =>
  (w) => {
    const d = w.document;
    const out = [];
    for (const name of GRADIENT_PROPERTIES)
      for (const value of values) {
        const a = d.createElement('div');
        a.style.setProperty(name, value);
        const b = d.createElement('div');
        b.setAttribute('style', `${name}: ${value}`);
        d.head.innerHTML = `<style>#x { ${name}: ${value} }</style>`;
        const e = d.createElement('div');
        e.id = 'x';
        d.body.replaceChildren(e);
        out.push(
          [
            `${name}: ${value}`,
            a.style.getPropertyValue(name),
            b.style.cssText,
            d.styleSheets[0].cssRules[0].cssText,
            computed ? w.getComputedStyle(e).getPropertyValue(name) : '',
          ].join(' | '),
        );
      }
    return out;
  };
for (const jsdom of [20, 22, 23, 25, 26, 27, 28, 29, 30, '30.1.3']) {
  parity(
    `jsdom ${jsdom}: a gradient's default direction, shape and position (#264)`,
    gradientDefaults(GRADIENT_DEFAULTS),
    {
      jsdom,
    },
  );
  parity(`jsdom ${jsdom}: defaults among other tokens of a gradient (#264)`, gradientDefaults(GRADIENT_PARTS, false), {
    jsdom,
  });
}
// After a style write, jsdom 27 to 30.1.2 compute such a gradient from
// what is left, which is no gradient (30.1.3 computes it as written, and
// all of them do for a style attribute or a rule: docs/differences.md).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: the computed value of a gradient written without its defaults (#264)`,
    (w) => {
      const d = w.document;
      const out = [];
      for (const name of ['background', 'background-image'])
        for (const value of GRADIENT_PARTS) {
          const e = d.createElement('div');
          d.body.replaceChildren(e);
          e.style.setProperty(name, value);
          out.push(`${name}: ${value} | ${w.getComputedStyle(e).getPropertyValue(name)}`);
        }
      return out;
    },
    { jsdom },
  );
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(`jsdom ${jsdom}: a gradient's keywords and units not in lowercase (#264)`, gradientDefaults(GRADIENT_CASES), {
    jsdom,
  });

// jsdom 27 and later: a background of initial values once the image is
// left out, in each place it is declared (black box, 27.4.0 to 30.1.3):
// the longhands, in place (jsdom 30 also lists background-position-x and
// -y from setProperty and in style sheets); in a style attribute or
// cssText followed by another declaration, nothing (27 and 28) or
// nothing of it (29 and later).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: a background whose image is left out sets the initial values (#264)`,
    (w) => {
      const d = w.document;
      const X = 'LINEAR-GRADIENT(red, blue)';
      const style = () => d.createElement('div').style;
      const out = [];
      for (const value of [X, 'NONE', '-webkit-linear-gradient(top, red, blue)', `${X} transparent`]) {
        const s = style();
        s.setProperty('background', value);
        out.push(s.cssText);
      }
      let s = style();
      s.setProperty('background', X, 'important');
      out.push(s.cssText, s.getPropertyPriority('background-image'));
      s = style();
      s.cssText = 'background-color: red; color: blue; background-repeat: no-repeat';
      s.background = X;
      out.push(s.cssText, s.background, s.backgroundImage, s.backgroundColor);
      for (const text of [
        `background: ${X}`,
        `background: ${X} !important`,
        `color: red; background: ${X}`,
        `background: ${X}; color: red`,
        `background: ${X}; width: 1px; color: red !important`,
        `background: ${X}; --a: 1`,
        `background: ${X}; foo: bar`,
        `background: ${X}; color: bogus`,
        `background: ${X}; background: ${X}`,
        `background: ${X}; background: red`,
        `background-image: url(a.png); background: ${X}`,
      ]) {
        const c = style();
        c.cssText = text;
        const e = d.createElement('div');
        e.setAttribute('style', text);
        d.body.replaceChildren(e);
        const computed = w.getComputedStyle(e);
        out.push(
          `${text} -> ${c.cssText} | ${e.style.cssText} | ${computed.backgroundImage} ${computed.backgroundColor}`,
        );
      }
      d.head.innerHTML = `<style>.a { color: red; background: ${X}; width: 1px } .b { background: ${X} !important }</style>`;
      const [a, b] = d.styleSheets[0].cssRules;
      out.push(a.cssText, b.cssText, a.style.getPropertyValue('background-image'));
      a.style.cssText = `background: ${X}`;
      out.push(a.cssText);
      b.style.setProperty('background', X);
      out.push(b.cssText);
      d.styleSheets[0].insertRule(`.c { background: ${X} }`, 0);
      out.push(d.styleSheets[0].cssRules[0].cssText);
      const e = d.createElement('div');
      e.style.cssText = `background: url(b.png) no-repeat red; background: ${X}`;
      d.body.replaceChildren(e);
      const computed = w.getComputedStyle(e);
      out.push(`${computed.backgroundImage} ${computed.backgroundRepeat} ${computed.backgroundColor}`);
      return out;
    },
    { jsdom },
  );

// jsdom 27 and later: an !important background of initial values keeps a
// later normal background or background longhand out of a style
// attribute, cssText or a rule's cssText, as any other !important
// background does (black box, 27.4.0 to 30.1.3; the #267 review). A style
// sheet takes the later one (background: red), as it does after any
// !important declaration; warpdom does not yet (the sheet rows here are
// those that agree).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: an important background of initial values and a later normal one (#264)`,
    (w) => {
      const d = w.document;
      const X = 'LINEAR-GRADIENT(red, blue)';
      const out = [];
      const read = (label, s, e) => {
        const parts = [label, s.cssText];
        for (const n of ['background-color', 'background-image', 'background-repeat', 'background-position'])
          parts.push(`${n}=${s.getPropertyValue(n)}`);
        if (e) {
          const computed = w.getComputedStyle(e);
          parts.push(computed.backgroundColor, computed.backgroundImage);
        }
        out.push(parts.join(' | '));
      };
      for (const [text, inSheet] of [
        [`background: ${X} !important; background: red`, true],
        [`background: red; background: ${X} !important`, true],
        [`background: ${X} !important; background-color: red`, false],
        [`background-color: red; background: ${X} !important`, true],
        [`background: ${X} !important; background-image: url(a.png)`, false],
        [`background: red !important; background: ${X}`, false],
        [`background: url(a.png) !important; background: red`, false],
      ]) {
        const e = d.createElement('div');
        e.setAttribute('style', text);
        d.body.replaceChildren(e);
        read(`attribute ${text}`, e.style, e);
        const c = d.createElement('div');
        c.style.cssText = text;
        d.body.replaceChildren(c);
        read(`cssText ${text}`, c.style, c);
        d.head.innerHTML = '<style>div { color: blue }</style>';
        const rule = d.styleSheets[0].cssRules[0];
        rule.style.cssText = text;
        read(`rule cssText ${text}`, rule.style);
        d.head.innerHTML = '';
        if (!inSheet) continue;
        d.head.innerHTML = `<style>div { ${text} }</style>`;
        const p = d.createElement('div');
        d.body.replaceChildren(p);
        read(`sheet ${text}`, d.styleSheets[0].cssRules[0].style, p);
        d.head.innerHTML = '';
      }
      return out;
    },
    { jsdom },
  );

// The prefixed-gradient fallback (background: -webkit-linear-gradient(...);
// background: linear-gradient(...)), then another declaration: jsdom 27 and
// 28 declare nothing, a later background of other values too; 29 and later
// keep the later background (black box, 27.4.0 to 30.1.3; the #267 review).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: a prefixed gradient fallback and a later declaration (#264)`,
    (w) => {
      const d = w.document;
      const W = '-webkit-linear-gradient(top, red, blue)';
      const out = [];
      for (const text of [
        `background: ${W}; background: linear-gradient(red, blue); color: blue`,
        `background-color: red; background: ${W}; background: linear-gradient(red, blue); color: blue`,
        `background: -moz-linear-gradient(top, red, blue); background: linear-gradient(red, blue); width: 1px`,
        `background: ${W}; background: linear-gradient(red, blue)`,
        `background: LINEAR-GRADIENT(red, blue); background: red; color: blue`,
        `background: ${W}; background: url(a.png) no-repeat; color: blue`,
      ]) {
        const e = d.createElement('div');
        e.setAttribute('style', text);
        d.body.replaceChildren(e);
        const c = d.createElement('div');
        c.style.cssText = text;
        const computed = w.getComputedStyle(e);
        out.push(
          `${text} -> ${e.style.cssText} | ${c.style.cssText} | ${e.style.backgroundImage} | ${computed.backgroundImage} ${computed.color}`,
        );
      }
      const s = d.createElement('div').style;
      s.backgroundColor = 'red';
      s.background = W;
      s.setProperty('background', 'linear-gradient(red, blue)');
      s.color = 'blue';
      out.push(s.cssText);
      return out;
    },
    { jsdom },
  );

// jsdom 27 and later: an !important background of initial values stays
// when another declaration follows it in a style attribute or cssText,
// that one too (black box, 27.4.0 to 30.1.3; the #267 review).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: an important background of initial values and a later declaration (#264)`,
    (w) => {
      const d = w.document;
      const X = 'LINEAR-GRADIENT(red, blue)';
      const W = '-webkit-linear-gradient(top, red, blue)';
      const out = [];
      for (const text of [
        `background: ${X} !important; color: blue`,
        `background: ${W} !important; color: blue`,
        `background: ${X} !important; background: red; color: blue`,
        `background: ${X} !important; background-color: red; color: blue`,
        `background: ${X} !important; width: 1px; background: ${X}; color: blue`,
      ]) {
        const e = d.createElement('div');
        e.setAttribute('style', text);
        d.body.replaceChildren(e);
        const c = d.createElement('div');
        c.style.cssText = text;
        const computed = w.getComputedStyle(e);
        out.push(
          `${text} -> ${e.style.cssText} | ${c.style.cssText} | ${e.style.color} ${computed.color} ${computed.backgroundImage}`,
        );
      }
      return out;
    },
    { jsdom },
  );

// jsdom 30: a background of initial values in a style attribute or cssText
// removes the background-position-x and -y declared before it (the two
// together give background-position the later one's place); jsdom 27 to 29
// keep them (black box, 27.4.0 to 30.1.3; the #267 review).
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `jsdom ${jsdom}: background-position-x and -y before a background of initial values (#264)`,
    (w) => {
      const d = w.document;
      const X = 'LINEAR-GRADIENT(red, blue)';
      const spec = String(jsdom).startsWith('30');
      const out = [];
      const texts = [
        `background-position-x: 25%; background-position-y: 75%; background: ${X}`,
        `background-position-x: 25%; color: red; background: ${X}`,
        `background-position-x: 25%; background-position-y: 75%; background: ${X} !important`,
      ];
      // (jsdom 27 to 29 differ here in other ways: an !important axis and
      // the axes written as background-position)
      if (spec)
        texts.push(
          `background-position-y: 75% !important; background: ${X}`,
          `background-position-x: 25%; background-position-y: 75%; background: ${X}; color: red`,
          `background-position-y: 75%; color: red; background-position-x: 25%; width: 1px; background: ${X}`,
          `background-position: 1px 2px; background-position-x: 3px; background: ${X}`,
        );
      for (const text of texts) {
        const e = d.createElement('div');
        e.setAttribute('style', text);
        d.body.replaceChildren(e);
        const c = d.createElement('div');
        c.style.cssText = text;
        const parts = [text, e.style.cssText, c.style.cssText];
        // (jsdom 27 to 29 compute the axes from what is declared; warpdom
        // does not yet)
        if (spec) {
          const computed = w.getComputedStyle(e);
          parts.push(
            e.style.backgroundPositionX,
            e.style.getPropertyValue('background-position-y'),
            c.style.backgroundPosition,
            computed.backgroundPositionX,
            computed.backgroundPositionY,
          );
        }
        out.push(parts.join(' | '));
      }
      return out;
    },
    { jsdom },
  );

// jsdom 27 and later: background layers, each as it would be alone, a
// layer of initial values empty (url(a.png), none is url("a.png"), ).
for (const jsdom of [27, 29, 30])
  parity(
    `jsdom ${jsdom}: background layers (#264)`,
    (w) => {
      const layers = [
        'url(a.png)',
        'url(a.png) repeat scroll',
        'none',
        'LINEAR-GRADIENT(red, blue)',
        'linear-gradient(red, blue)',
        'url(b.png) no-repeat',
        'url(b.png) 0 0',
        'url(b.png) center',
        'linear-gradient(red, blue) padding-box',
        'repeat',
        '-webkit-linear-gradient(top, red, blue)',
      ];
      const out = [];
      for (const first of layers)
        for (const last of [...layers, 'url(c.png) red']) {
          const value = `${first}, ${last}`;
          const s = w.document.createElement('div').style;
          s.setProperty('background', value);
          const e = w.document.createElement('div');
          e.style.cssText = `background: ${value}`;
          w.document.body.replaceChildren(e);
          const computed = w.getComputedStyle(e);
          out.push(`${value} -> ${s.cssText} | ${computed.backgroundImage} | ${computed.backgroundRepeat}`);
        }
      return out;
    },
    { jsdom },
  );

// Gradient names in strings and url()s are not gradients, and url("var(
// is no var() (black box, jsdom 20.0.3 to 30.1.3; Copilot review on
// #267): jsdom 27 and later keep url("LINEAR-GRADIENT(red, blue).png") in
// background-image and drop LINEAR-GRADIENT(red, blue), url("var(--a).png").
for (const jsdom of [20, 22, 23, 24, 25, 26, 27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: gradient names in url()s and strings (#264)`,
    (w) => {
      const out = [];
      for (const name of ['background-image', 'background'])
        for (const value of [
          'url("LINEAR-GRADIENT(red, blue).png")',
          "url('Linear-Gradient(x).png'), linear-gradient(red, blue)",
          'url("a.png"), url("-WEBKIT-LINEAR-GRADIENT(red).png")',
          'LINEAR-GRADIENT(red, blue), url("var(--a).png")',
          'url("var(--a).png"), Linear-Gradient(red, blue)',
          'LINEAR-GRADIENT(red, blue), url(var(--a))',
        ]) {
          const a = w.document.createElement('div');
          a.style.setProperty(name, value);
          const b = w.document.createElement('div');
          b.style.cssText = `${name}: ${value}`;
          const c = w.document.createElement('div');
          c.setAttribute('style', `${name}: ${value}`);
          const d = w.document.createElement('div');
          d.style[name === 'background' ? 'background' : 'backgroundImage'] = value;
          out.push(
            `${name}: ${value} -> ${[a, b, c, d].map((e) => `${e.style.cssText} ${e.style.getPropertyValue(name)}`).join(' | ')}`,
          );
        }
      return out;
    },
    { jsdom },
  );

// Math functions in the arguments of a gradient jsdom 27 and later drop
// leave it dropped, its arguments checked (black box, jsdom 20.0.3 to
// 30.1.3; Copilot review on #267); jsdom 27 to 29 reject such a value
// with a url().
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: math functions in a gradient name not in lowercase (#264)`,
    (w) => {
      const out = [];
      for (const value of [
        'LINEAR-GRADIENT(red 0%, blue calc(100% - 1px))',
        'LINEAR-GRADIENT(red calc(10% + 5%), blue) red',
        'LINEAR-GRADIENT(red, blue calc(1px + 1%)) no-repeat',
        'LINEAR-GRADIENT(calc(10deg + 5deg), red, blue)',
        'Linear-Gradient(red, blue min(1%, 2%))',
        '-webkit-linear-gradient(top, red, blue calc(100% - 1px))',
        'LINEAR-GRADIENT(foo bar, calc(1px))',
        'url(a.png), LINEAR-GRADIENT(red, blue calc(100% - 1px))',
        'LINEAR-GRADIENT(red, blue calc(1px + 1%)), red',
      ]) {
        const a = w.document.createElement('div');
        a.style.setProperty('background', value);
        const b = w.document.createElement('div');
        b.style.cssText = `background: ${value}`;
        const c = w.document.createElement('div');
        c.setAttribute('style', `background: ${value}`);
        const d = w.document.createElement('div');
        d.style.background = value;
        w.document.body.replaceChildren(a, b, c, d);
        out.push(
          `${value} -> ${[a, b, c, d].map((e) => `${e.style.cssText} ${w.getComputedStyle(e).backgroundImage}`).join(' | ')}`,
        );
      }
      return out;
    },
    { jsdom },
  );

// A custom property's value is kept as written, whatever its text (a
// background of initial values is marked internally; Copilot review on
// #267). jsdom 27 and 28 drop a style attribute with U+0000 in it, and
// 30 writes it as U+FFFD, so those read it from setProperty only.
const NUL_TEXT = '\u0000initials';
for (const jsdom of [20, 26, 27, 28, 29])
  parity(
    `jsdom ${jsdom}: a custom property with U+0000 in it beside background (#264)`,
    (w) => {
      const out = [];
      // A computed style's, first (writable before jsdom 28.1; 28.1 takes
      // it once a computed custom property has been read).
      const e = w.document.createElement('div');
      w.document.body.replaceChildren(e);
      const computed = w.getComputedStyle(e);
      try {
        computed.setProperty('--y', NUL_TEXT);
      } catch (error) {
        out.push(error.name);
      }
      out.push(computed.getPropertyValue('--y'));
      e.style.background = 'red';
      e.style.setProperty('--x', NUL_TEXT);
      out.push(e.style.cssText, e.style.getPropertyValue('--x'), e.style.backgroundColor);
      if (jsdom !== 27 && jsdom !== 28) {
        const f = w.document.createElement('div');
        f.setAttribute('style', `background: red; --x: ${NUL_TEXT}`);
        const g = w.document.createElement('div');
        g.style.cssText = `background: red !important; --x: ${NUL_TEXT}`;
        out.push(f.style.cssText, g.style.cssText, g.style.getPropertyPriority('background'));
      }
      // (jsdom 28 reads a computed color as written after a computed custom
      // property is read, whatever its value.)
      out.push(w.getComputedStyle(e).backgroundColor, w.getComputedStyle(e).getPropertyValue('--x'));
      return out;
    },
    { jsdom },
  );

// jsdom 27 and later: a background write replaces the background
// longhands, those a background of initial values set among them (black
// box, 27.4.0 to 30.1.3; Copilot review on #267).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: a background write after one of initial values (#264)`,
    (w) => {
      const X = 'LINEAR-GRADIENT(red, blue)';
      const out = [];
      for (const steps of [
        [
          ['background', X],
          ['background', 'url(a.png) no-repeat red'],
        ],
        [
          ['background', X],
          ['background', 'blue'],
        ],
        [
          ['background', 'NONE'],
          ['background', 'url(a.png)'],
        ],
        [
          ['background', X, 'important'],
          ['background', 'url(a.png)'],
        ],
        [
          ['background', X],
          ['background', 'url(a.png)', 'important'],
        ],
        [
          ['background', X],
          ['background', 'url(a.png), linear-gradient(red, blue) green'],
        ],
        [
          ['background', X],
          ['background', 'var(--a)'],
        ],
        [
          ['background', X],
          ['background', 'none'],
        ],
        [
          ['background', X],
          ['background', ''],
        ],
        [
          ['background', X],
          ['background', 'bogus'],
        ],
        [
          ['background', X],
          ['color', 'red'],
          ['background', 'url(a.png)'],
        ],
        [
          ['background', X],
          ['background-image', 'url(c.png)'],
          ['background', 'red'],
        ],
        [
          ['background-image', 'url(c.png)'],
          ['background', 'red'],
        ],
        [
          ['background-color', 'red', 'important'],
          ['background', 'url(a.png)'],
        ],
        [
          ['background-image', 'url(c.png)'],
          ['background', ''],
        ],
      ]) {
        const e = w.document.createElement('div');
        w.document.body.replaceChildren(e);
        const f = w.document.createElement('div');
        for (const [name, value, priority] of steps) {
          e.style.setProperty(name, value, priority);
          f.style[name === 'background' ? 'background' : name.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
        }
        const s = e.style;
        const computed = w.getComputedStyle(e);
        out.push(
          [
            steps.map((step) => step.join(' ')).join(' / '),
            s.cssText,
            f.style.cssText,
            s.backgroundImage,
            s.backgroundColor,
            s.backgroundRepeat,
            computed.backgroundImage,
            computed.backgroundColor,
            computed.backgroundRepeat,
          ].join(' | '),
        );
      }
      return out;
    },
    { jsdom },
  );

// cssstyle 4.2 to 4.5, measured on their own (black box, #264): a gradient
// name not in lowercase is invalid in background and background-image, a
// -webkit- gradient in background. (4.2 rejects every gradient, read as
// 4.3 here: docs/differences.md.)
test('gradient names not in lowercase with cssstyle 4.2 to 4.5 (#264)', () => {
  for (const cssstyle of ['4.2.0', '4.3.0', '4.3.1', '4.4.0', '4.5.0']) {
    const css = (name, value) => {
      const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.createElement('div').style;
      s.setProperty(name, value);
      return s.cssText;
    };
    for (const name of ['background', 'background-image']) {
      assert.equal(css(name, 'LINEAR-GRADIENT(red, blue)'), '', `${cssstyle} ${name}`);
      assert.equal(css(name, 'Radial-Gradient(red, blue)'), '');
      assert.equal(css(name, 'url(a.png), Linear-Gradient(red, blue)'), '');
    }
    assert.equal(css('background', '-webkit-linear-gradient(red, blue)'), '');
    assert.equal(css('background', 'red -webkit-linear-gradient(red, blue)'), '');
    if (cssstyle !== '4.2.0')
      assert.equal(
        css('background', 'linear-gradient(red, blue) no-repeat'),
        'background: linear-gradient(red, blue) no-repeat;',
      );
  }
});

// A long comma list is matched against its grammar without re-sorting the
// ends found so far at each repetition (a font with 1,000 families after a
// font-family write took 3.6 s, 2,000 took 27 s; #289 review).
test('declarations: a long family list is matched quickly', () => {
  // (two letters: jsdom 26 takes no one-letter family, #264 item 74)
  const families = `${'Ab,'.repeat(2000)}SERIF`;
  for (const jsdom of ['26.1.0', '30.1.3', undefined]) {
    const d = createWindow(jsdom ? { jsdom } : {}).document;
    const e = d.createElement('div');
    e.style.setProperty('font-family', families);
    const start = performance.now();
    e.setAttribute('style', `font: 12px ${families}`);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 500, `${jsdom ?? 'latest'}: ${elapsed} ms`);
    // (and the list was matched, not given up on: both declarations kept)
    assert.match(e.style.getPropertyValue('font-family'), /^Ab, ?Ab,.*, ?serif$/i, `${jsdom ?? 'latest'}: font-family`);
    assert.match(e.style.getPropertyValue('font'), /^12px Ab, ?Ab,.*, ?serif$/i, `${jsdom ?? 'latest'}: font`);
  }
});

// A long whitespace run in a declaration's value is read in linear time
// (#224: the !important check took 191 ms on 20,000 spaces, about 1.2 s
// on 50,000).
test('declarations: a long whitespace run before the end is read quickly', () => {
  const spaces = ' \t'.repeat(25000);
  for (const jsdom of ['20.0.3', '26.1.0', undefined]) {
    const w = createWindow(jsdom ? { jsdom } : {});
    const cases = [
      [`color: red${spaces}x`, ''],
      [`color: red${spaces}!${spaces}important`, 'color: red !important;'],
      [`color: red${spaces}!${spaces}importantx`, ''],
    ];
    for (const [text, expected] of cases) {
      const e = w.document.createElement('div');
      const start = performance.now();
      e.style.cssText = text;
      e.setAttribute('style', text);
      w.document.head.innerHTML = `<style>.a{${text}}</style>`;
      w.getComputedStyle(w.document.body).color;
      const elapsed = performance.now() - start;
      assert.equal(e.style.cssText, expected);
      assert.ok(elapsed < 200, `${jsdom ?? 'latest'} ${JSON.stringify(text.slice(-12))}: ${elapsed} ms`);
    }
  }
});

// Legacy display keywords (#257, found in the 1.0 triage): jsdom 27 and
// later keep css-tree's non-standard ones (-webkit-box, the line-clamp
// idiom), lowercased, and drop others (-ms-flexbox, -webkit-grid); jsdom
// 20 to 26 keep any display value as written. Inline, in a style sheet
// and computed.
const LEGACY_DISPLAYS = [
  '-webkit-box',
  '-webkit-inline-box',
  '-webkit-flex',
  '-webkit-inline-flex',
  '-moz-box',
  '-moz-inline-box',
  '-moz-inline-stack',
  '-ms-flexbox',
  '-ms-inline-flexbox',
  '-ms-grid',
  '-ms-inline-grid',
  '-webkit-grid',
  '-webkit-inline-grid',
  '-moz-flex',
  '-webkit-flexbox',
  '-WEBKIT-BOX',
  '-Webkit-Flex',
];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `jsdom ${jsdom}: legacy display keywords (#257)`,
    (w) => {
      const d = w.document;
      return LEGACY_DISPLAYS.map((value) => {
        const a = d.createElement('div');
        a.style.display = value;
        const b = d.createElement('div');
        b.style.cssText = `display: flex; display: ${value}`;
        const c = d.createElement('div');
        c.setAttribute('style', `display: ${value} !important`);
        d.head.innerHTML = `<style>.a{display: ${value}; -webkit-line-clamp: 2}</style>`;
        d.body.innerHTML = '<div class="a"></div>';
        const rule = d.styleSheets[0].cssRules[0].style.display;
        return `${value} -> ${a.style.display} | ${b.style.display} | ${c.style.cssText} | ${rule} | ${w.getComputedStyle(d.body.firstChild).display}`;
      });
    },
    { jsdom },
  );
}

// A hex escape takes one whitespace character after it (CSS Syntax 3,
// 4.3.7): -\31 FOO and \66 oo are one identifier each. jsdom 27 to 30.1.3
// accept them where a single name is valid (#264 item 48); 27.0.1 to 28.0.0
// write them in lowercase like any identifier. jsdom 26 rejects any escape
// in font-family (not tested here).
const ESCAPES = [
  String.raw`-\31 FOO`,
  String.raw`\31 FOO`,
  String.raw`a\31 b`,
  String.raw`a\31	b`,
  String.raw`\66 oo`,
  String.raw`a\000031 b`,
  String.raw`a\0000311b`,
  String.raw`\41 \42 `,
  String.raw`a\31\9b`,
  String.raw`foo\ bar`,
  String.raw`\31 FOO bar`,
  // Digits after the escape's whitespace are part of the name, not a
  // number to write canonically (#278 review).
  String.raw`b\31 2e1`,
  String.raw`b\31 001`,
  String.raw`a\31 05 3`,
  String.raw`x\66 010`,
  String.raw`\31 0.50`,
];
// CR LF after an escape is one whitespace (#278 review). jsdom 30 turns
// CR LF into LF in any value (not modelled), so these run up to 29.
const CRLF_ESCAPES = ['b\\31\r\n001', 'a\\31\r\n05 3'];
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3']) {
  parity(
    `jsdom ${jsdom}: a hex escape and the whitespace after it in an identifier (#264)`,
    (w) => {
      const d = w.document;
      const out = [];
      const props = [
        'animation-name',
        'list-style-type',
        'grid-area',
        'counter-reset',
        'view-transition-name',
        'container-name',
      ];
      if (jsdom !== 26) props.push('font-family');
      for (const name of props)
        for (const value of typeof jsdom === 'number' && jsdom < 30 ? [...ESCAPES, ...CRLF_ESCAPES] : ESCAPES) {
          // A family name of several words is quoted by jsdom 27 and later
          // (#264 item 53), escapes or not.
          if (name === 'font-family' && value.endsWith(' bar')) continue;
          const el = d.createElement('div');
          el.style.setProperty(name, value);
          out.push(`${name}: ${value} -> ${el.style.getPropertyValue(name)}`);
        }
      d.head.innerHTML = String.raw`<style>.a { animation-name: -\31 FOO; list-style-type: \66 oo }</style>`;
      out.push(d.styleSheets[0].cssRules[0].style.cssText);
      // A separate number after an escape: jsdom keeps these as written too
      // (#278 review).
      for (const [name, value] of [
        ['animation', String.raw`a\31,01s`],
        ['counter-reset', String.raw`a\31 +001`],
      ]) {
        const el = d.createElement('div');
        el.style.setProperty(name, value);
        out.push(`${name}: ${value} -> ${el.style.getPropertyValue(name)}`);
      }
      return out;
    },
    { jsdom },
  );
}
// 27.0.1 and 28.0.0 (single-jsdom installs): accepted, in lowercase.
test('a hex escape and the whitespace after it, jsdom 27.0.1 and 28.0.0 (#264)', () => {
  for (const jsdom of ['27.0.1', '28.0.0']) {
    const d = createWindow({ jsdom }).document;
    const el = d.createElement('div');
    el.style.setProperty('animation-name', String.raw`-\31 FOO`);
    el.style.setProperty('grid-area', String.raw`\41 \42 `);
    assert.equal(el.style.cssText, String.raw`animation-name: -\31 foo; grid-area: \41 \42;`, jsdom);
    // A CR LF after the escape is one whitespace (#278 review).
    el.style.setProperty('animation-name', '-\\31\r\nFOO');
    assert.equal(el.style.animationName, '-\\31\r\nfoo', jsdom);
  }
});
// An escape and the number after its space: a\31 2e1 is one identifier,
// a\31 2.1 an identifier and a number. The result doesn't depend on which
// is checked first (values with a number share a cache entry by shape;
// #278 review). Black box: jsdom 29 keeps the first, drops the second.
test('a hex escape before a number: validity in either order (#264)', () => {
  assert.equal(isValidValue('container-name', String.raw`b\31 2e1`), true);
  assert.equal(isValidValue('container-name', String.raw`b\31 2.1`), false);
  assert.equal(isValidValue('container-name', String.raw`c\31 2.1`), false);
  assert.equal(isValidValue('container-name', String.raw`c\31 2e1`), true);
});
// Hex digits after a backslash are read one way only: a value of many
// escapes and then a character no identifier has is rejected in linear
// time (#278 review: 8 escapes took 52 ms, each one more ~6x).
test('many hex escapes and an invalid character: rejected without backtracking (#264)', () => {
  const d = createWindow({ jsdom: '27.4.0' }).document;
  const el = d.createElement('div');
  const start = performance.now();
  el.style.setProperty('animation-name', `a${'\\AAAAAA'.repeat(12)}!`);
  el.style.setProperty('font-family', `a${'\\AAAAAA'.repeat(12)}!`);
  // A few ms now; with backtracking, minutes. The bound leaves room for slow CI.
  assert.ok(performance.now() - start < 2000);
  assert.equal(el.style.cssText, '');
});

// jsdom 27 and later store border, its sides, border-color, -style and
// -width, flex, font and (30) background-position as their longhands: one
// written after a longhand replaces it, in an inline style and a style
// sheet (black box, 27.4.0 to 30.1.3, #264 items 78 and 94). An
// !important longhand survives a style attribute (jsdom then lists the
// rest as longhands: style.length and that listing are left for later).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: a shorthand written after its longhand replaces it (#264)`,
    (w) => {
      const out = [];
      for (const [longhand, before, shorthand, after, important] of [
        ['border-top-color', 'red', 'border', '1px solid blue'],
        ['border-top', '3px dotted green', 'border', '1px solid blue'],
        ['border-color', 'green', 'border', '1px solid blue'],
        ['border-top-width', '5px', 'border-top', '1px solid blue'],
        ['border-top-color', 'green', 'border-color', 'blue'],
        ['border-left-style', 'dotted', 'border-left', '1px solid red'],
        ['border-top-width', '3px', 'border-width', '1px'],
        ['border-bottom-style', 'dashed', 'border-style', 'solid'],
        ['flex-basis', '10px', 'flex', '1'],
        ['flex-grow', '2', 'flex', '1'],
        ['font-family', 'Arial', 'font', '12px Times'],
        ['line-height', '3', 'font', '12px/2 Times'],
        ['font-weight', '300', 'font', 'bold 12px Times'],
        ['background-position-x', 'left', 'background-position', '10px 20px'],
        ['flex-basis', '10px', 'flex', '1', 'important'],
        ['border-top-color', 'red', 'border', '1px solid blue', 'important'],
      ]) {
        const read = (s) =>
          [
            s.cssText,
            s.getPropertyValue(longhand),
            s.getPropertyPriority(longhand),
            s.getPropertyValue(shorthand),
          ].join(' | ');
        const e = w.document.createElement('div');
        e.style.setProperty(longhand, before, important);
        e.style.setProperty(shorthand, after);
        const text = `${longhand}: ${before}${important ? ' !important' : ''}; ${shorthand}: ${after}`;
        const sheet = w.document.createElement('style');
        sheet.textContent = `a { ${text} }`;
        w.document.head.replaceChildren(sheet);
        const lines = [`${longhand} ${before} ${important ?? ''}/ ${shorthand} ${after}`, read(e.style)];
        lines.push(read(sheet.sheet.cssRules[0].style));
        if (!important) {
          const f = w.document.createElement('div');
          f.setAttribute('style', text);
          lines.push(read(f.style));
        }
        out.push(lines.join(' || '));
      }
      return out;
    },
    { jsdom },
  );

// The same, in a style attribute and cssText, with what they keep (black
// box, 27.4.0 to 30.1.3, #305 review): an !important longhand without
// var() against a border shorthand (in 27 and 28 one whose !important was
// dropped too), not against flex, font or background-position; from 29 a
// border or a side with var() declares nothing after its longhand. A
// shorthand given again after another one sharing longhands wins, and
// border replaces border-image.
for (const jsdom of [27, 28, 29, 30])
  parity(
    `jsdom ${jsdom}: what a shorthand after its longhand keeps (#264)`,
    (w) => {
      const out = [];
      for (const [text, read] of [
        ['border-top-color: red !important; border: 1px solid blue', 'border-top-color'],
        ['border-top-width: 3px !important; border-width: 1px', 'border-top-width'],
        ['border-top-color: red !important; border-top: 1px solid blue', 'border-top-color'],
        ['border-top-color: var(--c) !important; border: 1px solid blue', 'border-top-color'],
        ['flex-basis: 10px !important; flex: 1', 'flex-basis'],
        ['flex-basis: var(--b) !important; flex: 1', 'flex-basis'],
        ['font-family: Arial !important; font: 12px Times', 'font-family'],
        ['background-position-x: left !important; background-position: 1px 2px', 'background-position-x'],
        ['border-top-width: 4px; border: var(--b)', 'border-top-width'],
        ['border-top-width: 4px; border-top: var(--b)', 'border-top-width'],
        ['border-top-width: 4px; border-width: var(--b)', 'border-top-width'],
        [
          'border-color: red; border-top: 1px solid green; border-top-color: blue; border-color: blue',
          'border-top-color',
        ],
        ['border-image: url(a.png) 10; border: 1px solid blue', 'border-image'],
      ]) {
        const e = w.document.createElement('div');
        w.document.body.replaceChildren(e);
        e.setAttribute('style', text);
        const f = w.document.createElement('div');
        f.style.cssText = text;
        const g = w.document.createElement('div');
        for (const part of text.split('; ')) {
          const [name, value] = part.split(': ');
          const important = value.endsWith(' !important');
          g.style.setProperty(
            name,
            important ? value.slice(0, -' !important'.length) : value,
            important ? 'important' : '',
          );
        }
        // (border-image reads none in jsdom, which declares it as border's
        // longhand: left for later; its earlier value is gone from cssText.)
        const reads = (s) =>
          read === 'border-image' ? s.cssText : `${s.getPropertyValue(read)} ${s.getPropertyPriority(read)}`;
        out.push(
          [
            text,
            reads(e.style),
            reads(f.style),
            reads(g.style),
            read === 'border-image' ? '' : w.getComputedStyle(e).getPropertyValue(read),
          ].join(' | '),
        );
      }
      return out;
    },
    { jsdom },
  );
